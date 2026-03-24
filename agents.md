# Agent Codex — agora-convoai-quickstart-nextjs

> Machine-readable project map. Read this before touching any file.

---

## 1. What This Project Is

A Next.js 16 (App Router) quickstart that lets a browser user speak with an Agora Conversational AI agent. The browser joins an Agora RTC channel for audio; RTM carries real-time transcripts. A server-side call invites an Agora cloud agent into the same channel. The agent runs a full ASR → LLM → TTS pipeline and publishes audio back.

**Stack:** Next.js 15, React 19, TypeScript, Tailwind, pnpm, `agora-rtc-react`, `agora-rtm`, `agora-token`, `agora-agent-client-toolkit`, `agora-agent-uikit`, `agora-agent-server-sdk`.

---

## 2. Directory Map

```
app/
  page.tsx                           — root page, renders <LandingPage />
  layout.tsx                         — minimal shell
  globals.css                        — global styles
  api/
    generate-agora-token/route.ts    — GET  — issues RTC+RTM token for the browser user
    invite-agent/route.ts            — POST — starts the Agora ConvoAI agent
    stop-conversation/route.ts       — POST — stops the agent
    chat/completions/route.ts        — POST — optional custom LLM proxy (OpenAI SSE format)

components/
  LandingPage.tsx                    — entry UI; owns session setup, RTM client lifecycle
  ConversationComponent.tsx          — live conversation UI; owns all Agora hooks + AgoraVoiceAI
  MicrophoneSelector.tsx             — device picker dropdown

types/
  conversation.ts                    — AgoraTokenData, ClientStartRequest, AgentResponse,
                                       ConversationComponentProps, StopConversationRequest

hooks/
  use-mobile.tsx                     — useIsMobile() — returns true when viewport < 768 px

lib/
  utils.ts                           — cn() (clsx + tailwind-merge)

DOCS/
  GUIDE.md                           — step-by-step build guide
  TEXT_STREAMING_GUIDE.md            — transcription/text-streaming deep-dive
```

---

## 3. External Packages

### Client-side

| Package | Role |
|---|---|
| `agora-rtc-react` | RTC hooks: `useJoin`, `useLocalMicrophoneTrack`, `usePublish`, `useRemoteUsers`, `useClientEvent` |
| `agora-rtm` | RTM transport — carries transcript messages from agent to browser |
| `agora-agent-client-toolkit-react` | `ConversationalAIProvider` + `useTranscript()`, `useAgentState()`, `useAgentError()`, `useAgentMetrics()` |
| `agora-agent-client-toolkit` | Core types: `TurnStatus`, `TranscriptHelperItem`, `TranscriptHelperMode` |
| `agora-agent-uikit` | Pre-built components: `AudioVisualizer`, `ConvoTextStream`, `MicButtonWithVisualizer` (from `/rtc`), `transcriptToMessageList` |

### Server-side

| Package | Role |
|---|---|
| `agora-agent-server-sdk` | `AgoraClient`, `Agent`, `DeepgramSTT`, `OpenAI`, `ElevenLabsTTS` — builder pattern for starting/stopping agents |
| `agora-token` | `RtcTokenBuilder.buildTokenWithRtm` — generates RTC+RTM combined token |

---

## 4. Environment Variables

All vars live in `.env.local` (gitignored). `env.local.example` is the source of truth.

| Variable | Side | Purpose |
|---|---|---|
| `NEXT_PUBLIC_AGORA_APP_ID` | client+server | Agora project App ID |
| `NEXT_AGORA_APP_CERTIFICATE` | server only | Signs tokens — never expose client-side |
| `NEXT_PUBLIC_AGENT_UID` | client+server | UID the AI agent joins with (e.g. `"Agent"`). `NEXT_PUBLIC_` prefix required — read in client component. Must match `agentUid` in `invite-agent/route.ts`. |
| `NEXT_LLM_URL` | server only | Any OpenAI-compatible chat completions endpoint |
| `NEXT_LLM_API_KEY` | server only | LLM API key |
| `NEXT_DEEPGRAM_API_KEY` | server only | Deepgram STT API key |
| `NEXT_ELEVENLABS_API_KEY` | server only | ElevenLabs TTS API key |

---

## 5. API Routes

### `GET /api/generate-agora-token`

Generates an Agora RTC+RTM combined token via `RtcTokenBuilder.buildTokenWithRtm` (the `agora-token` npm package).

- Query params: `?uid=<string>&channel=<string>` (both optional)
- Returns: `{ token, uid: string, channel: string }`
- Called by: `LandingPage` on session start and on token renewal

**Note:** RTM access requires `buildTokenWithRtm` — a plain `buildTokenWithUid` token will not grant RTM privileges.

---

### `POST /api/invite-agent`

Starts an Agora ConvoAI agent using `agora-agent-server-sdk`.

**Input** (`ClientStartRequest`): `{ requester_id, channel_name, input_modalities?, output_modalities? }`

**What it does:**
1. Validates required env vars (throws on startup if missing).
2. Builds the agent: `new AgoraClient(...)` → `new Agent({ instructions, greeting, turnDetection, advancedFeatures })` → `.withStt(DeepgramSTT)` → `.withLlm(OpenAI)` → `.withTts(ElevenLabsTTS)`.
3. `agent.createSession(client, { channel, agentUid, remoteUids, idleTimeout, expiresIn })`.
4. `await session.start()` → returns agent ID.
5. Returns `AgentResponse: { agent_id, create_ts, state }`.

**Key configuration (edit in this file):**
- `ADA_PROMPT` / `GREETING` — agent persona and opening line
- `turnDetection.config` — VAD sensitivity (`speech_threshold`, `silence_duration_ms`, `interrupt_duration_ms`, `prefix_padding_ms`)
- `advancedFeatures: { enable_rtm: true }` — required for RTM transcript delivery
- `model: 'gpt-4o'` in `OpenAI(...)` — LLM model
- `ELEVENLABS_VOICE_ID` constant — TTS voice

**Turn detection** uses the current (non-deprecated) API:
```ts
turnDetection: {
  config: {
    speech_threshold: 0.5,
    start_of_speech: { mode: 'vad', vad_config: { interrupt_duration_ms, prefix_padding_ms } },
    end_of_speech: { mode: 'vad', vad_config: { silence_duration_ms } },
  },
}
```
Do not use the deprecated `type: 'agora_vad'` flat structure.

---

### `POST /api/stop-conversation`

Stops an agent. Input: `{ agent_id: string }`. Uses `agora-agent-server-sdk` internally.

---

### `POST /api/chat/completions` (optional)

Custom LLM proxy. Point the agent at your deployed URL to intercept LLM calls and add RAG, tools, guardrails. Uses Vercel AI SDK `streamText`. Model is hardcoded in the route (ignores `body.model` to prevent injection). Requires a public URL — `localhost` is not reachable by Agora's cloud.

---

## 6. Components

### `LandingPage`

- On "Try it now!": preloads `agora-rtc-react` + `agora-rtm` modules → runs `Promise.all([inviteAgent, rtmLogin])` in parallel → renders `ConversationComponent`.
- Owns the `rtmClient` lifecycle: creates, logs in, subscribes before mounting `ConversationComponent`; calls `rtmClient.logout()` on end.
- Token renewal: `handleTokenWillExpire(uid)` → GET token → calls `client.renewToken` + `rtmClient.renewToken`.

---

### `ConversationComponent`

Core real-time component. Must be inside `AgoraRTCProvider`.

**StrictMode guard:** `isReady` state, set via `setTimeout(..., 0)` in a `useEffect`. Both `useJoin(config, isReady)` and `useLocalMicrophoneTrack(isReady)` are gated on it to prevent double-initialization.

**Hook ownership:**
- `useJoin` owns `client.leave()` — do not call manually
- `useLocalMicrophoneTrack` owns track lifecycle — do not call `.close()` manually
- `usePublish` owns publish state — mute via `track.setEnabled()` only

**Transcript + agent state:** Managed with raw `AgoraVoiceAI` from `agora-agent-client-toolkit`. `AgoraVoiceAI.init()` runs in a `useEffect` gated on `isReady && joinSuccess` — this fires exactly once, past the StrictMode double-mount cycle. Transcript and agent state are tracked via `useState` + `ai.on(TRANSCRIPT_UPDATED, ...)` / `ai.on(AGENT_STATE_CHANGED, ...)`. `uid="0"` remapping (local user sentinel → `client.uid`) happens in a `useMemo` over the raw transcript. The React toolkit (`agora-agent-client-toolkit-react`) is NOT used for lifecycle — it has a StrictMode race condition with the `AgoraVoiceAI` singleton.

**Transcript state:**
- `messageList` — completed + interrupted turns (`status !== IN_PROGRESS`) via `transcriptToMessageList`
- `currentInProgressMessage` — the single in-progress turn, if any

**UI kit components used:**
- `AudioVisualizer` — waveform for agent audio track
- `ConvoTextStream` — floating chat panel with `messageList` + `currentInProgressMessage` + `agentUID`
- `MicButtonWithVisualizer` (from `agora-agent-uikit/rtc`) — mic button with Web Audio visualization

---

### `MicrophoneSelector`

Device picker via `AgoraRTC.getMicrophones()`. Hot-swap detection via `AgoraRTC.onMicrophoneChanged`. Switching calls `localMicrophoneTrack.setDevice(deviceId)`.

---

## 7. Data Flow

```
User clicks "Try it now!"
  │
  ├─ GET /api/generate-agora-token → { token, uid, channel }
  ├─ Promise.all:
  │   ├─ POST /api/invite-agent → { agent_id }   (Agora cloud starts agent)
  │   └─ rtmClient.login(token) + rtmClient.subscribe(channel)
  │
  └─ LandingPage renders <AgoraRTCProvider><ConversationComponent>
        │
        ├─ isReady (setTimeout) → useJoin joins RTC channel
        ├─ useLocalMicrophoneTrack creates mic track
        ├─ usePublish publishes mic
        │
        ├─ joinSuccess=true → AgoraVoiceAI.init() effect fires (gated on isReady && joinSuccess)
        │   └─ ai.subscribeMessage(channel) — binds RTC stream-message + RTM message events
        │
        ├─ Agent joins channel → RemoteUser auto-subscribes → AudioVisualizer draws waveform
        │
        ├─ Agent speaks:
        │   RTM → AgoraVoiceAI → TRANSCRIPT_UPDATED → UID remap → setState
        │   → transcriptToMessageList → ConvoTextStream renders chat bubbles
        │
        └─ User clicks "End Conversation"
            → POST /api/stop-conversation
            → LandingPage: rtmClient.logout()
            → ConversationComponent unmounts
            → useJoin cleanup: client.leave()
            → AgoraVoiceAI effect cleanup: ai.unsubscribe() + ai.destroy()
```

---

## 8. Known Gotchas

1. **`useJoin` owns `client.leave()`** — never call it manually. Causes `AgoraRTCError WS_ABORT: LEAVE`.

2. **StrictMode double-init** — `isReady` + `setTimeout` guard prevents dual mic track creation and double `AgoraVoiceAI` init. Do not remove. The `AgoraVoiceAI.init()` effect is also gated on `isReady && joinSuccess` — by the time `joinSuccess` becomes `true`, the StrictMode cycle is done and the effect runs exactly once. `ConversationalAIProvider` from `agora-agent-client-toolkit-react` is intentionally avoided: it has a singleton race condition in StrictMode where the cancelled first init destroys the singleton after the real second init has reconfigured it.

3. **`NEXT_PUBLIC_AGENT_UID` must match exactly** — the component compares `user.uid.toString() === agentUID`. A mismatch means `isAgentConnected` never fires.

4. **RTM token** — must use `RtcTokenBuilder.buildTokenWithRtm`. A plain RTC token silently fails RTM login.

5. **UID remapping** — `uid="0"` is the toolkit's sentinel for local user speech. The uikit treats `uid===0` as AI. Without remapping, user speech renders on the wrong side.

6. **`enable_rtm: true`** — without this in `advancedFeatures`, the agent joins but never sends RTM messages, so `TRANSCRIPT_UPDATED` never fires.

7. **Tailwind + uikit** — `tailwind.config.ts` must include `./node_modules/agora-agent-uikit/dist/**/*.{js,mjs}` or uikit component styles won't apply.

8. **Custom LLM proxy needs public URL** — `localhost` is not reachable by Agora's cloud. Use `ngrok http 3000` in dev.

9. **Deprecated turn detection API** — use `turnDetection.config.start_of_speech` / `end_of_speech`. The old `type: 'agora_vad'` flat structure is deprecated and will be removed.
