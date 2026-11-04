# 02 Architecture

> Runtime architecture for browser RTC/RTM, Next.js route handlers, and Agora managed agent session.

## High-Level Shape

- Next.js App Router frontend and API routes in one deployable app.
- Browser joins Agora RTC channel and uses RTM for transcript/state. RTM is the only data channel on v3 sessions (always on); agent metrics and error events are not delivered in the v3 preview.
- Server-side routes mint token and call Agora Agent Server SDK (v3 ephemeral sessions, US-only preview).
- Agent executes STT -> LLM -> TTS pipeline in Agora cloud.

## Component Graph

```text
Browser UI (LandingPage + ConversationComponent)
  -> GET /api/generate-agora-token
  -> POST /api/invite-agent
  -> RTC join/publish mic
  -> RTM subscribe + AgoraVoiceAI events
  -> POST /api/stop-conversation

Next.js API routes
  -> agora-agents generateClientToken (RTC + RTM, no ConvoAI service)
  -> agora-agents createEphemeralSession / client.v3.sessions.stop

Agora Cloud
  -> Agent session (Deepgram STT + OpenAI LLM + MiniMax TTS by default)
  -> RTM payloads (transcript, state; metrics/error not delivered in v3 preview)
```

## Start Sequence

1. UI fetches RTC+RTM token and channel.
2. UI invites agent and initializes RTM in parallel.
3. UI mounts conversation view.
4. `useJoin` connects RTC once `isReady` guard passes.
5. `AgoraVoiceAI.init()` subscribes transcript/state/metrics streams (metrics stay empty on v3 sessions).

## End Sequence

1. UI calls `/api/stop-conversation` with `agent_id` (the v3 session ID) if present.
2. UI logs out RTM client.
3. RTC hook ownership handles leave/unpublish cleanup.
4. Component state resets to pre-call shell.

## Core State Domains

- Session bootstrap: `LandingPage` (`agoraData`, `rtmClient`, loading/error flags).
- RTC transport and mic: `ConversationComponent` + `agora-rtc-react` hooks.
- Transcript + agent state: `AgoraVoiceAI` events mapped through `lib/conversation.ts`.
- Metrics and connection issues: `AGENT_METRICS`, `MESSAGE_ERROR`, `SAL_STATUS`, RTM fallback parsing. v3 preview sessions do not deliver the RTM `message.metrics` and `message.error` payloads, so `AGENT_METRICS` and `MESSAGE_ERROR` do not fire; the handlers remain wired.

## External Dependencies

- `agora-rtc-react` / `agora-rtc-sdk-ng` for media transport.
- `agora-rtm` for data channel.
- `agora-agent-client-toolkit` and `agora-agent-uikit` for conversation logic/UI.
- `agora-agents` (vendored pre-release 3.0.0-alpha.3 build) for client tokens and v3 session lifecycle.

## Deployment Modes

- Local development via `pnpm run dev`.
- Vercel deployment as single Next.js app with server env vars.

## Data and Control Boundaries

- Browser never sees the app certificate; only receives signed short-lived RTC + RTM tokens that cannot call the ConvoAI REST API.
- Agent lifecycle control (`start`, `stop`) is server-routed.
- Transcript/state are data-plane RTM events from agent to browser (metrics are not delivered in the v3 preview).
- UI control-plane actions (start/end, renew) originate in `LandingPage`.

## Internal Interfaces Between Components

`LandingPage` -> `ConversationComponent` props:

- `agoraData` (`token`, `uid`, `channel`, optional `agentId`)
- `rtmClient` (already logged-in and subscribed)
- `onTokenWillExpire(uid)` callback for dual-token renewal
- `onEndConversation()` callback for teardown and route stop call

`ConversationComponent` -> child UI components:

- normalized transcript items and current in-progress turn
- agent visualizer state derived from transport + semantic state
- connection issue list and derived severity
- recent metric window for stage latency chips

## Why the App Router Structure Matters

- API handlers under `app/api` co-deploy with UI and share env management.
- Client components isolate browser-only SDK usage via dynamic import and `ssr: false`.
- This avoids SSR-side access to WebRTC-dependent modules.

## Change Impact Hints

- Changes to token or invite routes affect both startup and renewal paths.
- Changes to transcript mapping can break both transcript panel and visualizer semantics.
- Changes to RTM setup in `LandingPage` affect toolkit subscription readiness.

## Related Deep Dives

- [conversation_lifecycle.md](L2/conversation_lifecycle.md) — Detailed bootstrapping and teardown timeline.
- [transcript_pipeline.md](L2/transcript_pipeline.md) — Event mapping, UID remap, in-progress/completed segmentation.
