> **When to Read This:** Load this when changing how a conversation session starts, renews, or stops, especially across `LandingPage`, `ConversationComponent`, and `app/api/*` routes.

# Conversation Lifecycle

## Overview

This quickstart orchestrates one user session across four coupled systems:

- Next.js browser UI state.
- Agora RTC media transport.
- Agora RTM data transport.
- Agora managed agent backend lifecycle.

The correctness target is single-init, predictable teardown, and no leaked RTM/RTC resources.

## Detailed Start Sequence

1. User clicks start in `QuickstartPreCallCard`.
2. `LandingPage.handleStartConversation` calls `GET /api/generate-agora-token`.
3. In parallel:
- `POST /api/invite-agent` starts an ephemeral v3 agent session and returns its session ID as `agent_id`.
- RTM client is created, logs in with token, subscribes to channel.
4. On success, `agoraData` + `rtmClient` are stored and `ConversationComponent` mounts.
5. `useJoin` and `useLocalMicrophoneTrack` remain gated by `isReady` StrictMode guard.
6. After join success, `AgoraVoiceAI.init()` binds RTC+RTM engines and subscribes messages.
7. UI renders visualizer, transcript, and metrics panels (the metrics panel stays empty on v3 preview sessions, which do not deliver agent metrics).

## StrictMode Safety Contract

- `isReady` flips `true` only after the fake-unmount cycle finishes.
- First fake mount timer is synchronously cancelled; second real mount timer survives.
- This keeps join and track init single-run in development.

Breaking this guard causes duplicate client/track/toolkit initialization patterns that are hard to recover from.

## Token Renewal Flow

- Renewal callback receives actual joined RTC UID.
- Two renewal calls are made in parallel:
- RTC renewal for current joined UID.
- RTM renewal for original login UID.
- Both target same channel.
- Result returns `rtcToken` + `rtmToken` to caller.

## Teardown Sequence

1. If `agentId` exists, call `POST /api/stop-conversation`.
2. Stop route calls `client.v3.sessions.stop({ agentSessionId: agent_id })` and treats 404 and 409 `TaskNotRunning`/`TaskConflict` as already stopped (`{ success: true, state: 'already-stopping' }`).
3. Frontend logs out RTM client and clears RTM state.
4. `showConversation` reset unmounts conversation view.
5. `agora-rtc-react` hook ownership handles leave/unpublish/track cleanup after unmount.
6. Toolkit cleanup path unsubscribes and destroys `AgoraVoiceAI` singleton.

## Failure Modes and Recovery

- Invite failure is non-fatal to render path: UI still mounts and shows warning.
- RTM bootstrap failure is fatal to start path because transcript pipeline depends on it.
- Stop failures are logged, but UI teardown still continues.

## Cross-File Dependencies

- `components/LandingPage.tsx`: bootstrap orchestration and renewal callback.
- `components/ConversationComponent.tsx`: join/toolkit/mic runtime behavior.
- `app/api/generate-agora-token/route.ts`: RTM-capable token minting via `generateClientToken` (RTC + RTM, no ConvoAI service).
- `app/api/invite-agent/route.ts`: agent pipeline config.
- `app/api/stop-conversation/route.ts`: idempotent stop semantics.
