> **When to Read This:** Load this document when you are changing the agent's prompt, voice, VAD behavior, model selection, or wiring a bring-your-own-key (BYOK) provider.

# Invite Agent Config

## Where It Lives

All of the managed agent configuration is built in `app/api/invite-agent/route.ts`. The route receives `{ requester_id, channel_name }` from `LandingPage`, constructs an `Agent` from `agora-agents`, and starts an ephemeral v3 session (unsaved config) bound to the requester's RTC channel.

## Top-Level Constants

| Constant            | Default                                              | Purpose                                                   |
| ------------------- | ---------------------------------------------------- | --------------------------------------------------------- |
| `ADA_PROMPT`        | Long-form instructions for "Ada", an Agora assistant | The system prompt for the LLM.                            |
| `GREETING`          | Friendly first line                                   | Spoken on session start.                                 |

Agent behavior is configured in code: edit `GREETING` or `ADA_PROMPT` directly.

## The Agent Builder Chain

`AgoraClient` is constructed first — it carries the region and credentials for all API calls. `area` belongs here, not on the session. The v3 session API is a US-only preview, so it must be `Area.US`.

```ts
const client = new AgoraClient({ area: Area.US, appId, appCertificate });

const agent = new Agent({
  client,
  instructions: ADA_PROMPT,
  greeting: GREETING,
  failureMessage: 'Please wait a moment.',
  maxHistory: 50,
  turnDetection: {
    config: {
      speech_threshold: 0.5,
      start_of_speech: { /* VAD on-start params */ },
      end_of_speech:   { /* VAD on-end params */ },
    },
  },
  // No advancedFeatures or parameters: v3 rejects them. RTM is always on.
})
  .withStt(new DeepgramSTT({ model: 'nova-3', language: 'en' }))
  .withLlm(new OpenAI({
    model: 'gpt-4o-mini',
    greetingMessage: GREETING,
    failureMessage: 'Please wait a moment.',
    maxHistory: 15,
    params: { max_tokens: 1024, temperature: 0.7, top_p: 0.95 },
  }))
  .withTts(new MiniMaxTTS({
    model: 'speech_2_6_turbo',
    voiceId: 'English_captivating_female1',
  }));
```

The agent no longer sets `advancedFeatures` (`enable_rtm`, `enable_tools`) or `parameters` (`audio_scenario`, `data_channel`, `enable_error_message`, `enable_metrics`); v3 rejects them. RTM is the only data channel on v3 and is always on, so transcripts and agent state still reach the browser over RTM. Agent metrics and error events are not delivered in this preview. `audio_scenario` moved to the session as `audioScenario`.

## Session Options

`createEphemeralSession` runs the configuration once on the v3 Platform API without saving it. It takes only the session options object (the client comes from the `Agent`). `session.start()` is called separately and returns the **session ID**.

```ts
const session = agent.createEphemeralSession({
  channel: channel_name,
  agentUid,
  remoteUids: [requester_id],
  idleTimeout: 30,
  maxDuration: 3600,
  audioScenario: 'chorus',
  expiresIn: ExpiresIn.hours(1),
  debug: false,
});
const sessionId = await session.start();
```

| Option        | Effect                                                                               |
| ------------- | ------------------------------------------------------------------------------------ |
| `channel`     | The RTC channel name the agent joins.                                                |
| `agentUid`    | The UID the agent occupies in the channel, shared through `lib/agora.ts`.             |
| `remoteUids`  | Restricts the agent to the requester's UID — protects against cross-channel sniping. |
| `idleTimeout` | Seconds of silence before the session ends.                                          |
| `maxDuration` | Hard stop after 3600 seconds (one hour).                                             |
| `audioScenario` | `'chorus'`: ultra-low-latency profile for the web client.                          |
| `expiresIn`   | Session expiry, mirrors the 1-hour RTC token.                                        |
| `debug`       | Logs Agora REST API calls to the console when `true`.                                |

## Editing Each Surface

### Change the prompt

Edit `ADA_PROMPT`. Keep it under the LLM's context window — `gpt-4o-mini` handles thousands of tokens but very long prompts amplify latency.

### Change the greeting

Edit `GREETING` in `app/api/invite-agent/route.ts`.

### Change VAD behavior

Edit `turnDetection.config.start_of_speech` and `turnDetection.config.end_of_speech`. Both blocks accept the new VAD param shape — do **not** revert to the deprecated `turnDetection.type: 'agora_vad'`.

### Swap the STT model

Replace the `DeepgramSTT` constructor. To use Deepgram with a BYOK key, set `NEXT_DEEPGRAM_API_KEY` and pass `apiKey: process.env.NEXT_DEEPGRAM_API_KEY` to the constructor.

### Swap the LLM

Replace `OpenAI` with another LLM class from `agora-agents`. For a custom URL, point the constructor at `process.env.NEXT_LLM_URL` and pass `apiKey: process.env.NEXT_LLM_API_KEY`. Wiring through `app/api/chat/completions/route.ts` is documented in `docs/ai/L1/05_workflows.md`.

### Swap the TTS

Replace `MiniMaxTTS`. ElevenLabs is the common BYOK choice — use `NEXT_ELEVENLABS_API_KEY` and `NEXT_ELEVENLABS_VOICE_ID`. The commented BYOK example in the route shows the constructor shape.

## Response Contract

On success the route returns `AgentResponse`:

```json
{
  "agent_id": "string",
  "create_ts": 1700000000,
  "state": "RUNNING"
}
```

`agent_id` carries the v3 session ID (the field name is unchanged for wire compatibility). It is what `LandingPage` later passes to `/api/stop-conversation`, which calls `client.v3.sessions.stop({ agentSessionId: agent_id })`. Interrupt, speak, and think are not available on Platform sessions.

## Verification

`scripts/verify-api-contracts.ts` mocks `Agent.prototype.createEphemeralSession` and asserts:

- Missing `channel_name` or `requester_id` → `400`.
- Mocked success → `200` with `agent_id` (the mocked session ID), `create_ts`, `state`.
- Session options carry the requested `channel`, the shared `agentUid`, `remoteUids: [requester_id]`, and `audioScenario: 'chorus'`.
- The agent config has no `advancedFeatures` or `parameters`.

After editing this file, run:

```bash
pnpm run verify:api
pnpm run typecheck
```

## Failure Modes

| Symptom                                                | Cause                                                          |
| ------------------------------------------------------ | -------------------------------------------------------------- |
| `400 channel_name and requester_id are required`       | Browser sent an empty body or wrong field names.               |
| `500 Agora credentials are not set`                    | `NEXT_AGORA_APP_CERTIFICATE` missing in env.                   |
| Agent joins but never speaks                           | TTS misconfigured (wrong `voiceId` or missing BYOK key).       |
| Agent state stuck on `IDLE`                            | RTM client not logged in or not subscribed yet.                |
| Session start rejected                                 | `advancedFeatures`/`parameters` added back, or non-US `Area`.  |
| Latency header empty                                   | Expected: metrics are not delivered on v3 preview sessions.    |
| `verify:api` fails on the route                        | New required field added without updating the harness.         |

## See Also

- [Back to Workflows](../05_workflows.md)
- [Back to Interfaces](../06_interfaces.md)
- [Token Model](token_model.md)
