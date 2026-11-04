# 06 Interfaces

> Contracts at repo boundaries: API routes, env vars, runtime events, and shared TypeScript payloads.

## HTTP Route Contracts

### `GET /api/generate-agora-token`

Query params:

- `uid` optional; invalid/zero resolves to random RTM-safe UID.
- `channel` optional; defaults to generated `ai-conversation-<ts>-<rand>`.

Success response:

```json
{ "token": "...", "uid": "1234", "channel": "ai-conversation-..." }
```

Failure response: `{ "error": string, "details"?: string }` with `500`.

The token is minted by `generateClientToken` and carries RTC + RTM only (no ConvoAI service), valid for 3600 seconds. It cannot call the ConvoAI REST API; ConvoAI-service tokens stay server-side.

### `POST /api/invite-agent`

Body (`ClientStartRequest`):

```json
{ "requester_id": "1234", "channel_name": "ai-conversation-..." }
```

Success (`AgentResponse`):

```json
{ "agent_id": "...", "create_ts": 1710000000, "state": "RUNNING" }
```

Validation failures return `400`; server failures return `500`.

`agent_id` carries the v3 session ID returned by `session.start()` on an ephemeral session (`agent.createEphemeralSession`). The field name is unchanged for wire compatibility.

### `POST /api/stop-conversation`

Body (`StopConversationRequest`): `{ "agent_id": "..." }` (the session ID). The route calls `client.v3.sessions.stop({ agentSessionId: agent_id })`.

Responses:

- `{ "success": true }`
- `{ "success": true, "state": "already-stopping" }` when the stop call returns 404 or 409 `TaskNotRunning`/`TaskConflict`
- `{ "error": string }` on failure

### `POST /api/chat/completions`

Optional SSE proxy path (not default runtime path). Requires `NEXT_LLM_API_KEY` and `NEXT_LLM_URL` when used.

## Event/Data Interfaces

- RTM transcript/state consumed through `AgoraVoiceAI` event emitter. RTM is the only data channel on v3 sessions and is always on.
- v3 preview sessions do not deliver the RTM `message.metrics` and `message.error` payloads, so the `AGENT_METRICS` and `MESSAGE_ERROR` handlers stay wired but receive nothing.
- Raw RTM `message` event parsed as fallback for `message.error` and `message.sal_status` payloads.
- `AGENT_METRICS` payloads displayed by `QuickstartPipelineMetrics` (empty on v3 preview sessions).

## Environment Contract

Required:

- `NEXT_PUBLIC_AGORA_APP_ID`
- `NEXT_AGORA_APP_CERTIFICATE`

This is the complete base `.env.local` contract. The optional BYOK route and provider snippets use additional variables only when a developer explicitly enables them.

## Test Coverage for Interfaces

- `scripts/verify-api-contracts.ts` asserts token generation (decodes the real token and checks its services are exactly RTC + RTM), input validation, env failures, SSE framing, the invite route's `createEphemeralSession` options (mocked on `Agent.prototype`) with no `advancedFeatures`/`parameters`, and stop via mocked `client.v3.sessions.stop` including the already-stopped case.

## Shared Client-Side Interfaces

From `types/conversation.ts` (high-use):

- `AgoraTokenData`: token bootstrap payload consumed by `LandingPage`.
- `AgoraRenewalTokens`: renewal callback result (`rtcToken`, `rtmToken`).
- `ConversationComponentProps`: runtime dependencies for in-call component.

## Interface Invariants

- Token payload must always include `token`, `uid`, `channel`.
- Invite route requires both `requester_id` and `channel_name`.
- Stop route requires `agent_id`; missing should never be tolerated silently.
- Token route should always return UID as string for downstream compatibility.

## Event Interface Notes

- Metrics stream entries are append-only in component state, capped to recent window.
- Connection issue records carry `source`, `agentUserId`, code/message, timestamp.
- SAL and signaling fallback payloads are parsed defensively because message schema can vary.

## Backward Compatibility Guidance

- If route response shape changes, update both client consumers and contract tests in same change.
- If adding fields, keep existing fields stable to avoid quickstart consumer breakage.
- Reflect interface changes in README and L1 docs to keep sample copyable.

## Related Deep Dives

- [conversation_lifecycle.md](L2/conversation_lifecycle.md) — How route contracts are used in sequence.
- [transcript_pipeline.md](L2/transcript_pipeline.md) — Event-level contract mapping.
