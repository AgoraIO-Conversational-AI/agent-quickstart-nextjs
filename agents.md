# Agent Guide

Use this file as the primary agent-facing guide for `agora-convoai-quickstart-nextjs`.

## Start Here

- Read [README.md](./README.md) for setup, commands, verification, and deployment.
- Use [DOCS/GUIDE.md](./DOCS/GUIDE.md) for the long-form build walkthrough.
- Use [DOCS/TEXT_STREAMING_GUIDE.md](./DOCS/TEXT_STREAMING_GUIDE.md) for transcript and RTM behavior.

## Current System Shape

- Next.js 16 App Router with React 19 and TypeScript
- Browser RTC via `agora-rtc-react`
- RTM transcripts via `agora-rtm`
- Transcript/runtime helpers via `agora-agent-client-toolkit`
- Shared UI primitives via `agora-agent-uikit`
- Token and agent lifecycle routes inside `app/api`

## Key Files

- `app/api/generate-agora-token/route.ts`: RTC + RTM token generation
- `app/api/invite-agent/route.ts`: managed agent session startup
- `app/api/stop-conversation/route.ts`: agent shutdown
- `components/LandingPage.tsx`: session bootstrap, RTM setup, provider wiring
- `components/ConversationComponent.tsx`: RTC join, transcript flow, visualizer, renewals
- `lib/agora.ts`: shared agent UID defaults
- `env.local.example`: local environment template

## Working Rules

- Keep the RTC client creation StrictMode-safe with `useRef`, not `useMemo`.
- Keep the token route on `RtcTokenBuilder.buildTokenWithRtm`.
- Keep transcript UID remapping aligned with the toolkit sentinel behavior.
- Keep README, `DOCS/GUIDE.md`, and `DOCS/TEXT_STREAMING_GUIDE.md` aligned with implementation changes.

## Commands

```bash
pnpm install
pnpm run doctor
pnpm run dev
pnpm run verify
```

Useful narrower checks:

```bash
pnpm run lint
pnpm run typecheck
pnpm run verify:api
pnpm run build
```

## Done Criteria

1. Run the narrowest relevant validation command.
2. For shipped app/runtime changes, ensure `pnpm run verify` passes.
3. Update the root README and any affected docs when workflow or architecture guidance changes.
