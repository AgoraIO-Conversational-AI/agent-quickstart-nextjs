# 04 Conventions

> Implementation conventions that protect lifecycle correctness, transcript accuracy, and docs/code alignment.

## React and RTC Lifecycle

- Keep RTC client creation StrictMode-safe with `useRef`, not `useMemo`.
- Use `isReady` guard (`setTimeout(..., 0)` pattern) before `useJoin` and `useLocalMicrophoneTrack`.
- Do not disable React StrictMode as a workaround.

## Hook Ownership Rules

- `useJoin` owns `client.leave()`; never leave manually.
- `useLocalMicrophoneTrack` owns track lifecycle; never call `.close()` manually.
- `usePublish` owns publish state; mute with `track.setEnabled()`.

## Transcript Conventions

- `uid === "0"` from toolkit is local-user sentinel and must be remapped to real `client.uid`.
- Include `INTERRUPTED` in history list; only filter out `IN_PROGRESS`.
- Normalize punctuation spacing for compacted provider output.
- Normalize timestamps to milliseconds before issue rendering.

## Token and RTM Contract

- Token route must use `generateClientToken` from `agora-agents` (RTC + RTM, no ConvoAI service).
- RTC-only token builders break RTM login/subscription.
- Tokens returned to clients must be RTC + RTM only; ConvoAI-service tokens stay server-side.
- Renewal flow independently mints RTC and RTM tokens while keeping shared channel.

## API and Error Handling Style

- Route handlers validate required body/env early and return clear status codes.
- Stop route is idempotent for already-stopping/not-found sessions (404, 409 `TaskNotRunning`/`TaskConflict`).

## v3 Agent Config

- Do not set `advancedFeatures` (`enable_rtm`, `enable_tools`) or `parameters` (`data_channel`, `enable_metrics`, `enable_error_message`, `audio_scenario`); v3 rejects them. `audioScenario` belongs on the session options.
- Use `Area.US`; the v3 session API preview is US-only.
- Frontend logs detailed technical errors and shows concise user-facing messages.

## Styling and UI Kit Rules

- Tailwind config must scan `./node_modules/agora-agent-uikit/dist/**/*.{js,mjs}`.
- Prefer existing quickstart layout components over introducing parallel shells.

## Documentation Synchronization

When changing workflow/contracts/ownership in `components` or `app/api`, update:

- `README.md`
- `AGENTS.md`
- `docs/ai/RECIPE.md` if extension points, invariants, or stable contracts changed
- relevant `docs/ai/L1/*.md` and `docs/ai/L0_repo_card.md` `Last Reviewed`

## Git Conventions

- Conventional commits: `type: description` or `type(scope): description`.
- Branch names: `type/short-description` lowercase with hyphens.
- No AI tool names in commit/PR text.
- No `--no-verify`, no git identity config edits.

## Route Handler Conventions

- Parse and validate request body at the top of handler.
- Return `400` for client payload problems and `500` for internal failures.
- Keep response payloads explicit and JSON-serializable.
- Prefer helper functions for repeated env checks or error classification.

## Commenting and Readability Style

- Comments should capture lifecycle reasoning or non-obvious constraints.
- Avoid comments that merely restate code.
- Keep runtime-sensitive constraints close to the guarded code path.

## Verification Conventions

- For route or contract changes, run `pnpm run verify:api` first.
- For UI/client runtime changes, run at least lint + typecheck + build.
- Prefer narrow checks during iteration, full `pnpm run verify` before handoff.

## Pull Request Hygiene

- Keep scope small and copyable for quickstart consumers.
- Include doc updates in same change when workflow/contracts are touched.
- Use present-tense lowercase conventional commit descriptions.
- Avoid adding hidden requirements not represented in `env.local.example` and README.

## Related Deep Dives

- [conversation_lifecycle.md](L2/conversation_lifecycle.md) — Why StrictMode guard and hook ownership are required.
- [transcript_pipeline.md](L2/transcript_pipeline.md) — UID remapping and turn-status handling rationale.
