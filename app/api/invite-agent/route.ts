import { NextRequest, NextResponse } from 'next/server';
import { AgoraClient, Agent, Area, ExpiresIn } from 'agora-agent-server-sdk';
import { ClientStartRequest, AgentResponse } from '@/types/conversation';
import { DEFAULT_AGENT_UID } from '@/lib/agora';
import { XAI } from '@/lib/vendors/xai-mllm';
import {
  DEFAULT_XAI_VOICE_ID,
  isXaiVoiceId,
} from '@/lib/vendors/xai-voices';
import { getEnv, requireEnv } from '@/lib/load-env';

// System prompt that defines the agent's personality and behavior.
// Swap this out to change what the agent talks about.
const ADA_PROMPT = `You are **Ada**, an agentic developer advocate from **Agora**. You help developers understand and build with Agora's Conversational AI platform.

# What Agora Actually Is
Agora is a real-time communications company. The product you represent is the **Agora Conversational AI Engine** — it lets developers add voice AI agents to any app by connecting ASR, LLM, and TTS into a real-time pipeline over Agora's SD-RTN (Software Defined Real-Time Network). Key facts:
- The product is called the **Conversational AI Engine** (not "Chorus", not "Harmony", or any other name you might invent)
- It runs a full ASR → LLM → TTS pipeline with sub-500ms latency
- It supports Deepgram, Microsoft, and others for ASR; OpenAI, Anthropic, and others for LLM; ElevenLabs, Microsoft, and others for TTS
- Agora's SD-RTN is its global real-time network infrastructure — not "SDRTN"
- MCP in this context means **Model Context Protocol** (Anthropic's open standard for connecting AI models to tools/data), not "multi-channel processing"
- Agora does not have a product called Chorus, Harmony, or any similar name — do not invent product names

# Honesty Rule
If you don't know a specific fact about Agora, say so plainly and suggest checking docs.agora.io. Never invent product names, feature names, or capabilities.

# Persona & Tone
- Friendly, technically credible, concise. You're a peer who builds things, not a support agent.
- Plain English. No marketing fluff.

# Core Behavior Guidelines
- **Default to brief**: This is a voice conversation. Keep most replies to 1–2 sentences. Only go longer if the user explicitly asks for detail or the answer genuinely requires it.
- **Never list or enumerate**: No bullet points, no numbered steps. Say the single most important thing.
- **Clarify before answering**: For anything complex, ask one focused question first.
- **Ask at most one question per turn**: Never stack questions.
- **Guide, don't lecture**: Unlock the next step, not everything at once.`;

// First thing the agent says when a user joins the channel.
// Set NEXT_AGENT_GREETING in .env.local to override.
const GREETING =
  getEnv('NEXT_AGENT_GREETING') ??
  `Hi there! I'm Ada, your virtual assistant from Agora. How can I help?`;

// agentUid identifies the AI in the RTC channel — must match NEXT_PUBLIC_AGENT_UID on the client
const agentUid = getEnv('NEXT_PUBLIC_AGENT_UID') ?? String(DEFAULT_AGENT_UID);

export async function POST(request: NextRequest) {
  try {
    // --- 1. Parse request ---

    const body: ClientStartRequest = await request.json();
    const { requester_id, channel_name, voice: requestedVoice } = body;

    // Resolve the voice with a clear precedence:
    //   1. Allowlisted voice from the request body (user pick in the UI).
    //   2. `NEXT_XAI_VOICE` env override (useful for server-side defaults).
    //   3. Documented xAI default (`eve`).
    // Unknown values from the client are silently dropped so a malformed
    // request can never inject arbitrary strings into the MLLM config.
    const envVoice = getEnv('NEXT_XAI_VOICE');
    const voice = isXaiVoiceId(requestedVoice)
      ? requestedVoice
      : isXaiVoiceId(envVoice)
        ? envVoice
        : DEFAULT_XAI_VOICE_ID;

    // Validate required env vars on first request so misconfiguration surfaces
    // with a clear error message rather than a silent failure.
    const appId = requireEnv('NEXT_PUBLIC_AGORA_APP_ID');
    const appCertificate = requireEnv('NEXT_AGORA_APP_CERTIFICATE');
    const xaiApiKey = requireEnv('NEXT_XAI_API_KEY');

    if (!channel_name || !requester_id) {
      return NextResponse.json(
        { error: 'channel_name and requester_id are required' },
        { status: 400 },
      );
    }

    // --- 2. Build and start the agent ---

    // AgoraClient authenticates API calls to the Agora Conversational AI service.
    // area: change to Area.EU or Area.AP for European or Asia-Pacific deployments.
    const client = new AgoraClient({
      area: Area.US,
      appId,
      appCertificate,
    });

    // MLLM-only pipeline: xAI Realtime handles ASR, LLM, and TTS end-to-end,
    // so there's no separate .withStt() / .withLlm() / .withTts() chain.
    // Turn detection is configured INSIDE the XAI vendor (nested in the
    // `mllm` block) rather than via the top-level Agent turnDetection.
    const agent = new Agent({
      name: `conversation-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`,
      instructions: ADA_PROMPT,
      greeting: GREETING,
      failureMessage: 'Please wait a moment.',
      maxHistory: 50,
      // RTM is required for transcript events in the browser client.
      // enable_tools is required for MCP tool invocation.
      advancedFeatures: { enable_rtm: true, enable_tools: true },
      // Required for browser RTM events:
      // - data_channel: 'rtm' enables RTM delivery path for state/metrics/errors
      // - enable_error_message emits AGENT_ERROR payloads
      parameters: { data_channel: 'rtm', enable_error_message: true },
    }).withMllm(
      new XAI({
        apiKey: xaiApiKey,
        // url defaults to wss://api.x.ai/v1/realtime — override via NEXT_XAI_URL if needed.
        ...(getEnv('NEXT_XAI_URL') && { url: getEnv('NEXT_XAI_URL')! }),
        voice,
        language: 'en',
        sampleRate: 24000,
        outputModalities: ['text', 'audio'],
        greetingMessage: GREETING,
        // server_vad turn detection lives INSIDE the mllm block for xAI
        // (unlike the other MLLM vendors which use top-level turn_detection).
        turnDetection: {
          mode: 'server_vad',
          serverVadConfig: {
            threshold: 0.5,
            prefixPaddingMs: 640,
            silenceDurationMs: 900,
          },
        },
      }),
    );

    // remoteUids restricts the agent to only process audio from this user
    const session = agent.createSession(client, {
      channel: channel_name,
      agentUid,
      remoteUids: [requester_id],
      idleTimeout: 30,
      expiresIn: ExpiresIn.hours(1),
      debug: false, // enable debug to show restful API calls in the console
    });

    const agentId = await session.start();

    return NextResponse.json({
      agent_id: agentId,
      create_ts: Math.floor(Date.now() / 1000),
      state: 'RUNNING',
    } as AgentResponse);
  } catch (error) {
    console.error('Error starting conversation:', error);
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : 'Failed to start conversation',
      },
      { status: 500 },
    );
  }
}
