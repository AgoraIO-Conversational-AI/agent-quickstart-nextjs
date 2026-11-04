> **When to Read This:** Load this document when you are changing how tokens are built, renewed, or distributed between RTC and RTM clients.

# Token Model

## The One Token Rule

This quickstart issues **one** token string per request that carries both RTC and RTM privileges. The builder used is `generateClientToken` from `agora-agents`. An RTC-only token does not authorize RTM login — using an RTC-only builder will silently break RTM.

The token carries **RTC + RTM only, no ConvoAI service**, so the browser cannot use it to call the Conversational AI REST API. Policy: tokens returned to clients must be RTC + RTM only; ConvoAI-service tokens stay server-side. `agora-token` is no longer a direct dependency of this app.

## Token Build

`app/api/generate-agora-token/route.ts` (shape):

```ts
const EXPIRATION_TIME_IN_SECONDS = 3600;
const uid = parsedUidFromQuery > 0 ? parsedUidFromQuery : generateUid();
const channel = parsedChannelFromQuery ?? randomChannelName();

const token = generateClientToken({
  appId,
  appCertificate,
  channelName: channel,
  uid,
  tokenExpire: EXPIRATION_TIME_IN_SECONDS,
});

return NextResponse.json({ token, uid: String(uid), channel });
```

Notes:

- `uid` is stringified in the response but the browser parses it numerically before calling `useJoin`.
- `uid=0`, negative UIDs, and missing UIDs all generate a non-zero UID. Agora RTC accepts `0` as auto-assign, but RTM login needs the token subject to match a concrete non-zero user ID.
- `channel` is generated server-side when the caller omits it. The browser uses whatever the route returns.
- `EXPIRATION_TIME_IN_SECONDS` is 1 hour, passed as a relative duration (not an absolute timestamp) — keep it aligned with the `expiresIn: ExpiresIn.hours(1)` value in `invite-agent/route.ts`.

## Initial Distribution

```
Browser (LandingPage)
  └─▶ GET /api/generate-agora-token
        └─▶ { token, uid, channel }
              ├─▶ useJoin(uid, token, channel)   ← RTC
              └─▶ rtmClient.login({ token })      ← RTM (same token string)
```

## Token Renewal Sequence

RTC fires `token-privilege-will-expire` roughly 30s before expiry. The handler does NOT renew with a single token — it fetches two:

```ts
async function handleTokenWillExpire(joinedUid: UID) {
  if (!joinedUid) return; // skip if RTC never reported a uid
  const [rtcRes, rtmRes] = await Promise.all([
    fetch(`/api/generate-agora-token?uid=${joinedUid}&channel=${agoraData.channel}`),
    fetch(`/api/generate-agora-token?uid=${agoraData.uid}&channel=${agoraData.channel}`),
  ]);
  const rtcJson = await rtcRes.json();
  const rtmJson = await rtmRes.json();
  await client.renewToken(rtcJson.token);
  await rtmClient.renewToken(rtmJson.token);
}
```

Why two fetches?

- The browser may have joined RTC with a server-assigned UID different from the one used at RTM login (RTM logs in with the original `agoraData.uid`).
- Renewing RTC and RTM separately keeps each client's identity stable across renewal.

## Verification Coverage

`scripts/verify-api-contracts.ts` calls the real route (no token mock), decodes the returned AccessToken2 (`007`) token, and asserts:

- `200` status.
- Response includes `token`, `uid`, `channel`, and `uid=0` returns a generated non-zero UID.
- The token's services are exactly RTC (1) + RTM (2) — no ConvoAI service — and both are signed for the returned UID.

If you change the builder or the services it grants, update the harness.

## Failure Modes

| Symptom                                                          | Cause                                                                          |
| ---------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| RTM login throws `INVALID_TOKEN`                                 | Token built with RTC-only builder.                                              |
| `verify:api` fails on token services                             | Token route returns a token with services other than RTC + RTM (for example ConvoAI). |
| RTC disconnects ~1 hour into a call with no renewal              | `handleTokenWillExpire` not wired or returned early because `joinedUid` was 0. |
| RTM keeps working but RTC drops                                  | Only RTC `renewToken` failed; check `rtcRes` JSON for `error`.                  |
| `500 Agora credentials are not set`                              | `NEXT_AGORA_APP_CERTIFICATE` missing or empty in server env.                    |

## Security Considerations

- The certificate never leaves the server. The route returns the signed token only.
- The route does not authenticate the caller — see `08_security.md`.
- Token expiry is the only revocation mechanism; if you need session-level revocation, surface a "stop-conversation" call to clients and rely on `/api/stop-conversation` to terminate the agent.

## See Also

- [Back to Setup](../01_setup.md)
- [Back to Interfaces](../06_interfaces.md)
- [Back to Security](../08_security.md)
