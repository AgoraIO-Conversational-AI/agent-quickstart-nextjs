# CLAUDE.md

> Read `agents.md` for the full project map (directory layout, API routes, data flow, known gotchas) before making changes.

## Project

Next.js 16 (App Router) quickstart demonstrating Agora Conversational AI Engine. Developers copy this code — production quality and idiomatic patterns are required in every change.

## Commands

```bash
pnpm dev      # start dev server (http://localhost:3000)
pnpm build    # production build
pnpm lint     # ESLint
```

## Key Patterns

### StrictMode Guard (`isReady`)

Both `useJoin` and `useLocalMicrophoneTrack` are gated by `isReady` to prevent double-initialization in React StrictMode dev mode. The cleanup fires synchronously before any `setTimeout`, so only the real second mount's timer fires.

```tsx
const [isReady, setIsReady] = useState(false);
useEffect(() => {
  let cancelled = false;
  const id = setTimeout(() => { if (!cancelled) setIsReady(true); }, 0);
  return () => { cancelled = true; clearTimeout(id); setIsReady(false); };
}, []);
const { isConnected: joinSuccess } = useJoin(config, isReady);
const { localMicrophoneTrack } = useLocalMicrophoneTrack(isReady);
```

Do not remove this pattern. Do not set `reactStrictMode: false` as a workaround.

### Hook Ownership

- `useJoin` owns `client.leave()` — **never call it manually**
- `useLocalMicrophoneTrack` owns track lifecycle — **no manual `.close()`**
- `usePublish` owns publish state — mute via `track.setEnabled()` only, never unpublish manually

### AgoraVoiceAI Init — Raw Toolkit with `isReady && joinSuccess` Gate

`AgoraVoiceAI` (from `agora-agent-client-toolkit`) is initialized in a `useEffect` inside `ConversationComponent`, gated on `isReady && joinSuccess`:

```tsx
useEffect(() => {
  if (!isReady || !joinSuccess) return;
  // AgoraVoiceAI.init() called here — exactly once, no StrictMode interference
}, [isReady, joinSuccess]);
```

**Why not `ConversationalAIProvider` from `agora-agent-client-toolkit-react`?**
The React toolkit has a StrictMode race condition: when any component mounting `ConversationalAIProvider` is double-mounted by StrictMode, two concurrent `AgoraVoiceAI.init()` calls share the same singleton object. The first call's cancellation destroys the instance after the second call has reconfigured it (same object reference), so `subscribeMessage` on the second call fails silently.

**Why `isReady && joinSuccess` works:**
- `isReady` is `true` only after the StrictMode fake-unmount cycle completes (via `setTimeout(fn, 0)` pattern).
- Once `isReady` is `true`, React does NOT double-invoke the effect for subsequent dependency changes (`joinSuccess` becoming `true`). This means `AgoraVoiceAI.init()` is called exactly once.

`transcript` and `agentState` are managed via `useState` + `ai.on(TRANSCRIPT_UPDATED, ...)` / `ai.on(AGENT_STATE_CHANGED, ...)` directly.

### UID Remapping

The toolkit uses `uid="0"` as a sentinel for the local user's speech. The uikit treats `uid===0` as an AI message. Remap in the `TRANSCRIPT_UPDATED` callback to `client.uid` or ConvoTextStream will show user speech on the wrong side.

### `messageList` Filter

Include `INTERRUPTED` turns in `messageList` (filter only `IN_PROGRESS`). If the agent's first turn is interrupted, omitting it means `messageList` stays empty and `ConvoTextStream` never auto-opens.

## Architecture

| Layer | Package | Role |
|---|---|---|
| Client UI | `agora-rtc-react` | RTC hooks (`useJoin`, `useLocalMicrophoneTrack`, `usePublish`, etc.) |
| Transcripts | `agora-agent-client-toolkit-react` | `ConversationalAIProvider` + `useTranscript()`, `useAgentState()` |
| Toolkit core | `agora-agent-client-toolkit` | `TurnStatus` enum, `TranscriptHelperItem` types |
| UI components | `agora-agent-uikit` | `AudioVisualizer`, `ConvoTextStream`, `MicButtonWithVisualizer` |
| Server SDK | `agora-agent-server-sdk` | Builder pattern — `AgoraClient` → `Agent` → `session.start()` |
| Messaging | `agora-rtm` | RTM transport for transcripts |

RTM token must be generated with `RtcTokenBuilder.buildTokenWithRtm` — a standard RTC-only token does not grant RTM access.

Tailwind must scan uikit classes: `./node_modules/agora-agent-uikit/dist/**/*.{js,mjs}` in `tailwind.config.ts`.

## Important Files

| File | Purpose |
|---|---|
| `components/ConversationComponent.tsx` | Core real-time UI — all Agora hooks, `AgoraVoiceAI` init, transcript state |
| `components/LandingPage.tsx` | Entry point — session setup, RTM client lifecycle, parallel agent+RTM init |
| `app/api/invite-agent/route.ts` | Starts AI agent — edit for system prompt, VAD, model, voice |
| `app/api/generate-agora-token/route.ts` | Issues RTC+RTM token for the browser user |
| `app/api/stop-conversation/route.ts` | Stops the agent |
| `DOCS/GUIDE.md` | Step-by-step build guide — must stay in sync with implementation |
| `DOCS/TEXT_STREAMING_GUIDE.md` | Text streaming / transcription deep-dive |
| `agents.md` | Machine-readable project map for AI context |

## After Changing Implementation Files

After editing anything in `components/` or `app/api/`, run the `docs-sync` agent to check that GUIDE.md, TEXT_STREAMING_GUIDE.md, and README.md are still accurate.

## What NOT To Do

- Do not call `client.leave()` manually (breaks `useJoin` cleanup)
- Do not call `localMicrophoneTrack.close()` manually (breaks hook ownership)
- Do not use `ConversationalAIProvider` or `useConversationalAI` from `agora-agent-client-toolkit-react` — they have a StrictMode singleton race condition. Use raw `AgoraVoiceAI` gated on `isReady && joinSuccess` instead.
- Do not remove the `isReady` guard
- Do not set `reactStrictMode: false`
- Do not use the deprecated `turnDetection.type: 'agora_vad'` flat API — use `turnDetection.config.start_of_speech` / `end_of_speech`
