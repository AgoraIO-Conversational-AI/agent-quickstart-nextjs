> **When to Read This:** Load this document when you are touching `useJoin`, `useLocalMicrophoneTrack`, `usePublish`, the `AgoraRTCProvider` wiring, or `AgoraVoiceAI.init` — anything that could fire twice under React StrictMode.

# StrictMode Lifecycle

## Why It Matters

React 19 StrictMode runs the dev lifecycle as mount → unmount → mount. RTC and `AgoraVoiceAI` hold real network and device resources. A naive integration:

- Joins the RTC channel twice and gets one rejection plus one ghost connection.
- Acquires two microphone tracks and leaves one orphaned.
- Initializes `AgoraVoiceAI` twice, doubling RTM subscribers and transcript handlers.

Setting `reactStrictMode: false` masks the issue and lets it surface later in production HMR-equivalent paths.

## The `isReady` Pattern

`components/ConversationComponent.tsx`:

```tsx
const [isReady, setIsReady] = useState(false);
useEffect(() => {
  let cancelled = false;
  const id = setTimeout(() => {
    if (!cancelled) setIsReady(true);
  }, 0);
  return () => {
    cancelled = true;
    clearTimeout(id);
    setIsReady(false);
  };
}, []);

const { isConnected: joinSuccess } = useJoin(config, isReady);
const { localMicrophoneTrack } = useLocalMicrophoneTrack(isReady);
```

The cleanup fires synchronously before any `setTimeout(..., 0)` task runs. In StrictMode's fake-unmount, that cancels the first scheduled `setIsReady(true)`. Only the real second mount actually flips `isReady` to true, and the join/mic hooks activate exactly once.

## RTC Client in `useRef`

The RTC client lives inside a dynamically imported `AgoraRTCProvider`:

- `useRef` keeps the same instance across StrictMode mounts.
- `useMemo` would recreate the client on the second mount and break `useJoin`'s cleanup of the first one.
- The `AgoraRTCProvider` itself is dynamically imported because `agora-rtc-sdk-ng` touches `window` during initialization.

## AgoraVoiceAI Initialization Order

`AgoraVoiceAI.init` is **async** and must be called with `await`. Because `useEffect` callbacks cannot be async directly, wrap the call in an IIFE. Use a `cancelled` flag to discard the result if the effect was cleaned up before `init` resolved.

```tsx
useEffect(() => {
  if (!isReady || !joinSuccess) return;
  let cancelled = false;
  (async () => {
    const ai = await AgoraVoiceAI.init({
      rtcEngine: client,
      rtmEngine: rtmClient,
      renderMode: TranscriptHelperMode.TEXT,
      enableLog: true,
    });
    if (cancelled) return;
    // attach listeners + ai.subscribeMessage(channel)
  })();
  return () => {
    cancelled = true;
    try {
      const ai = AgoraVoiceAI.getInstance();
      if (ai) { ai.unsubscribe(); ai.destroy(); }
    } catch {}
  };
}, [isReady, joinSuccess]);
```

Critical points:

- The effect depends on `isReady` AND `joinSuccess`. Both must be true.
- Once `isReady` is true, it does not flip back to false during the same real mount. React does not re-run this effect for later changes to `joinSuccess` going `false → true → false`.
- There is no `disconnect()` method — cleanup is `ai.unsubscribe()` followed by `ai.destroy()`.
- The cleanup tears down `AgoraVoiceAI` so the next real mount starts clean.

## Hook Ownership Rules (do not break)

| Hook                       | Owns                          | Anti-pattern                                       |
| -------------------------- | ----------------------------- | -------------------------------------------------- |
| `useJoin`                  | `client.leave()`              | Calling `client.leave()` manually in cleanup        |
| `useLocalMicrophoneTrack`  | Track creation + `.close()`   | Calling `track.close()` after StrictMode unmount    |
| `usePublish`               | publish state                 | Manually `unpublish` to mute (use `setEnabled`)     |

If you need to mute, call `localMicrophoneTrack.setEnabled(false)`. The hooks will publish/unpublish correctly when the track flips state.

## Failure Modes If You Break the Pattern

| Symptom                                                | Likely cause                                       |
| ------------------------------------------------------ | -------------------------------------------------- |
| Two simultaneous RTC sessions, one rejected            | `useJoin` activated before `isReady` settled       |
| Microphone busy / device errors in dev                 | Track created twice; second one orphaned           |
| Transcript events duplicated                           | `AgoraVoiceAI.init` ran twice                      |
| `client.leave is undefined` during cleanup             | Client recreated via `useMemo` mid-flight          |
| Agent state never advances past `IDLE`                 | RTM `subscribeMessage` ran before RTM was logged in |

## See Also

- [Back to Conventions](../04_conventions.md)
- [Back to Gotchas](../07_gotchas.md)
- [Transcript Pipeline](transcript_pipeline.md)
