import { NextRequest, NextResponse } from 'next/server';
import { AgoraClient, Agent, Area, ExpiresIn } from 'agora-agent-server-sdk';
import { ClientStartRequest, AgentResponse } from '@/types/conversation';
import { DEFAULT_AGENT_UID } from '@/lib/agora';
import { XAI, XAI_SERVER_VAD_DEFAULTS } from '@/lib/vendors/xai-mllm';
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

// Greeting for the default Ada persona. Set NEXT_AGENT_GREETING in .env.local
// to override. When the user supplies a custom system prompt we swap to a
// neutral greeting below so the agent doesn't announce itself as "Ada from
// Agora" and pollute the conversation history with a contradictory identity.
const ADA_GREETING =
  getEnv('NEXT_AGENT_GREETING') ??
  `Hi there! I'm Ada, your virtual assistant from Agora. How can I help?`;
const CUSTOM_PROMPT_GREETING = 'Hi, how can I help?';

// agentUid identifies the AI in the RTC channel — must match NEXT_PUBLIC_AGENT_UID on the client
const agentUid = getEnv('NEXT_PUBLIC_AGENT_UID') ?? String(DEFAULT_AGENT_UID);

function parseVadNumber(key: string, fallback: number): number {
  const raw = getEnv(key);
  if (raw === undefined || raw === '') return fallback;
  const n = Number(raw);
  return Number.isFinite(n) ? n : fallback;
}

/** When true, SDK logs the compiled join body (includes secrets such as `mllm.api_key`). */
function logAgoraJoinRequestEnabled(): boolean {
  const v = getEnv('NEXT_AGORA_LOG_JOIN_REQUEST');
  if (!v) return false;
  return v === '1' || /^true$/i.test(v) || /^yes$/i.test(v);
}

export async function POST(request: NextRequest) {
  try {
    // --- 1. Parse request ---

    const body: ClientStartRequest = await request.json();
    const {
      requester_id,
      channel_name,
      voice: requestedVoice,
      instructions: requestedInstructions,
    } = body;

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

    // Resolve the system prompt. User-supplied instructions override Ada when
    // provided, trimmed, and within a sane length cap to prevent runaway
    // payloads from breaking the MLLM request. Anything else falls back to the
    // built-in Ada persona. The greeting swaps alongside the prompt so the
    // agent doesn't open a "custom persona" session by introducing itself as
    // Ada — that crossed-wires greeting was the source of the apparent
    // "Ada + custom prompt" blend.
    const MAX_PROMPT_CHARS = 8000;
    const trimmedInstructions =
      typeof requestedInstructions === 'string'
        ? requestedInstructions.trim()
        : '';
    const usingCustomPrompt = trimmedInstructions.length > 0;
    const instructions = usingCustomPrompt
      ? trimmedInstructions.slice(0, MAX_PROMPT_CHARS)
      : ADA_PROMPT;
    const greeting = usingCustomPrompt ? CUSTOM_PROMPT_GREETING : ADA_GREETING;

    // Validate required env vars on first request so misconfiguration surfaces
    // with a clear error message rather than a silent failure.
    const appId = requireEnv('NEXT_PUBLIC_AGORA_APP_ID');
    const appCertificate = requireEnv('NEXT_AGORA_APP_CERTIFICATE');
    const xaiApiKey = requireEnv('NEXT_XAI_API_KEY');
    const xaiModel = getEnv('NEXT_XAI_MODEL');

    // xAI ServerVad — defaults match Python ServerVad(...); override via NEXT_XAI_VAD_*.
    const xaiTurnDetection = {
      mode: 'server_vad' as const,
      serverVadConfig: {
        threshold: parseVadNumber(
          'NEXT_XAI_VAD_THRESHOLD',
          XAI_SERVER_VAD_DEFAULTS.threshold,
        ),
        prefixPaddingMs: parseVadNumber(
          'NEXT_XAI_VAD_PREFIX_PADDING_MS',
          XAI_SERVER_VAD_DEFAULTS.prefixPaddingMs,
        ),
        silenceDurationMs: parseVadNumber(
          'NEXT_XAI_VAD_SILENCE_DURATION_MS',
          XAI_SERVER_VAD_DEFAULTS.silenceDurationMs,
        ),
      },
    };

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
      // `instructions` intentionally omitted: in MLLM mode the SDK only wires
      // it into the LLM-pipeline config (unused here). The real system prompt
      // is passed to the XAI vendor below via `messages`, which is the
      // actual path the xAI realtime API consumes.
      greeting,
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
        // Model defaults to grok-4-1-non-reasoning (see DEFAULT_XAI_MODEL); override via NEXT_XAI_MODEL.
        ...(xaiModel && { model: xaiModel }),
        // xAI's realtime API (per Agora's sample payloads) takes the system
        // prompt as a top-level `messages` array in OpenAI chat format — NOT
        // via `params.instructions`. MLLM vendors also don't inherit
        // `instructions` from the top-level Agent config, so this is the only
        // place the system prompt actually reaches the model.
        messages: [{ role: 'system', content: instructions }],
        voice,
        language: 'en',
        sampleRate: 24000,
        outputModalities: ['text', 'audio'],
        greetingMessage: greeting,
        // server_vad turn detection lives INSIDE the mllm block for xAI
        // (unlike the other MLLM vendors which use top-level turn_detection).
        turnDetection: xaiTurnDetection,
      }),
    );

    // remoteUids restricts the agent to only process audio from this user
    const session = agent.createSession(client, {
      channel: channel_name,
      agentUid,
      remoteUids: [requester_id],
      idleTimeout: 30,
      expiresIn: ExpiresIn.hours(1),
      // When NEXT_AGORA_LOG_JOIN_REQUEST=1, SDK prints `[Agora Debug] Request:` + full JSON body.
      debug: logAgoraJoinRequestEnabled(),
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
