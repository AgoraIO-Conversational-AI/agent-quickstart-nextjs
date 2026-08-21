> **When to Read This:** Load this when an agent needs to implement a baseline Agora Conversational AI Next.js quickstart in a new repo from this official recipe.

# From-Scratch Bootstrap

## Baseline Rule

This repo is the official Agora Next.js quickstart baseline for the recipe. Do not implement an Agora ConvoAI quickstart from memory. Start from this repo's source and docs, then adapt only after the baseline token, invite, RTC, RTM, and transcript flow is understood.

Why: provider schemas, SDK builder fields, token behavior, and RTM event details can drift. The source files in this repo are the implementation reference for this recipe version.

## Implementation Map

| Need | Read First | Deep Detail | Source Reference |
| --- | --- | --- | --- |
| Project setup, commands, env vars | [../01_setup.md](../01_setup.md) | [../05_workflows.md](../05_workflows.md) | `package.json`, `env.local.example` |
| End-to-end architecture and data flow | [../02_architecture.md](../02_architecture.md) | [conversation_lifecycle.md](conversation_lifecycle.md) | `components/LandingPage.tsx`, `components/ConversationComponent.tsx` |
| File/module responsibilities | [../03_code_map.md](../03_code_map.md) | none | `app/api`, `components`, `lib`, `types` |
| API payloads and response shapes | [../06_interfaces.md](../06_interfaces.md) | [token_model.md](token_model.md), [invite_agent_config.md](invite_agent_config.md) | `app/api/*/route.ts`, `types/conversation.ts` |
| Agora SDK lifecycle rules | [../04_conventions.md](../04_conventions.md) | [strict_mode_lifecycle.md](strict_mode_lifecycle.md) | `components/ConversationComponent.tsx` |
| Transcript, metrics, and RTM behavior | [../07_gotchas.md](../07_gotchas.md) | [transcript_pipeline.md](transcript_pipeline.md) | `lib/conversation.ts`, transcript/metrics components |
| Security and secret boundaries | [../08_security.md](../08_security.md) | [token_model.md](token_model.md) | token, invite, and stop API routes |
| Validation expectations | [../05_workflows.md](../05_workflows.md) | none | `scripts/verify-api-contracts.ts` |

## Minimum Implementation Checklist

Implement these pieces in order:

1. Create a Next.js App Router project with React, TypeScript, Tailwind, and the Agora dependencies from `package.json`.
2. Add `env.local.example` with only `NEXT_PUBLIC_AGORA_APP_ID` and `NEXT_AGORA_APP_CERTIFICATE`; keep optional BYOK examples in the README and source comments.
3. Implement `GET /api/generate-agora-token` with `RtcTokenBuilder.buildTokenWithRtm`; return `{ token, uid, channel }` and replace invalid or zero UIDs.
4. Implement `POST /api/invite-agent` with `AgoraClient`, `Agent`, managed `DeepgramSTT`, `OpenAI`, `MiniMaxTTS`, RTM enabled, metrics enabled, and `{ requester_id, channel_name }` input.
5. Implement `POST /api/stop-conversation` with idempotent already-stopping/not-found handling.
6. Implement optional `POST /api/chat/completions` only when exposing a custom LLM SSE proxy.
7. Implement `LandingPage` to fetch token, start the agent, log into RTM, subscribe to the channel, mount the conversation, renew tokens, and log out RTM on end.
8. Implement `ConversationComponent` with StrictMode-safe `isReady`, `useJoin`, `useLocalMicrophoneTrack`, `usePublish`, `AgoraVoiceAI.init`, event subscriptions, token renewal, and hook-owned teardown.
9. Implement transcript helpers that remap `uid="0"` to the local RTC UID, normalize spacing/timestamps, keep `INTERRUPTED`, and render `IN_PROGRESS` separately.
10. Add API contract verification for token, invite, stop, and optional custom LLM behavior.

## Required Copy-Forward Invariants

- Token generation uses `RtcTokenBuilder.buildTokenWithRtm`, not an RTC-only builder.
- The browser never receives `NEXT_AGORA_APP_CERTIFICATE`.
- `LandingPage` creates/logs in/subscribes/logs out the RTM client.
- `ConversationComponent` waits for `isReady && joinSuccess` before `AgoraVoiceAI.init`.
- `useJoin`, `useLocalMicrophoneTrack`, and `usePublish` own leave, track close, and publish cleanup.
- Transcript normalization remaps toolkit `uid="0"` before rendering.
- `INTERRUPTED` turns stay in message history; only `IN_PROGRESS` renders separately.
- Both the client and invite route derive the agent UID from `DEFAULT_AGENT_UID` in `lib/agora.ts`.

## Verification

Run narrow checks while building:

```bash
pnpm run lint
pnpm run typecheck
pnpm run verify:api
pnpm run build
```

Before publishing a derivative baseline, run `pnpm run verify` with local Agora env binding.

## See Also

- [Back to Workflows](../05_workflows.md)
- [Back to Code Map](../03_code_map.md)
- [Token Model](token_model.md)
- [Invite Agent Config](invite_agent_config.md)
