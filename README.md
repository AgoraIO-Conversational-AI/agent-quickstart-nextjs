# Agora Conversational AI Next.js Quickstart

Official Next.js quickstart for building a browser-based voice AI experience with Agora Conversational AI Engine.

## Run It

1. Create a project in [Agora Console](https://console.agora.io/) and copy your `App ID` and `App Certificate`.
2. Clone the repo and install dependencies.
3. Copy `env.local.example` to `.env.local`.
4. Set `NEXT_PUBLIC_AGORA_APP_ID` and `NEXT_AGORA_APP_CERTIFICATE`.
5. Run `pnpm dev`.
6. Open `http://localhost:3000`.

```bash
git clone https://github.com/AgoraIO-Conversational-AI/agent-quickstart-nextjs.git
cd agent-quickstart-nextjs
pnpm install
cp env.local.example .env.local
pnpm dev
```

Required environment variables:

- `NEXT_PUBLIC_AGORA_APP_ID`
- `NEXT_AGORA_APP_CERTIFICATE`

Optional convenience override:

- `NEXT_PUBLIC_AGENT_UID` defaults to `12345`

The default agent configuration in [`app/api/invite-agent/route.ts`](app/api/invite-agent/route.ts) uses Agora-managed defaults for STT, LLM, and TTS, so no additional vendor API keys are required for the base quickstart.

## Architecture

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="./system-architecture-dark.svg">
  <img src="./system-architecture.svg" alt="System architecture" />
</picture>

The browser uses the Next.js app for token generation and agent lifecycle calls, and connects to Agora Cloud for real-time audio, transcripts, and agent state.

## What You Get

- browser voice client built with Next.js App Router
- RTC audio plus RTM transcript and state events
- server routes for token generation, invite, and stop
- `AgentVisualizer` for agent state and `ConvoTextStream` for live transcript UI
- Agora-managed default STT, LLM, and TTS configuration

## How It Works

1. The browser requests an RTC + RTM token from `/api/generate-agora-token`.
2. The backend invites an Agora cloud agent with `/api/invite-agent`.
3. The browser joins the channel and publishes mic audio.
4. The client receives transcript and agent state updates over RTM.
5. The session is stopped with `/api/stop-conversation`.

## Optional BYOK

Optional BYOK examples remain commented in [`app/api/invite-agent/route.ts`](app/api/invite-agent/route.ts).

Examples:

- `NEXT_LLM_URL` and `NEXT_LLM_API_KEY`
- `NEXT_DEEPGRAM_API_KEY`
- `NEXT_ELEVENLABS_API_KEY` and `NEXT_ELEVENLABS_VOICE_ID`

## Deploy

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2FAgoraIO-Conversational-AI%2Fagent-quickstart-nextjs&project-name=agent-quickstart-nextjs&repository-name=agent-quickstart-nextjs&env=NEXT_PUBLIC_AGORA_APP_ID,NEXT_AGORA_APP_CERTIFICATE&envDescription=Agora%20credentials%20needed%20to%20run%20the%20app&envLink=https%3A%2F%2Fgithub.com%2FAgoraIO-Conversational-AI%2Fagent-quickstart-nextjs%23run-it&demo-title=Agora%20Conversational%20AI%20Next.js%20Quickstart&demo-description=Official%20Next.js%20quickstart%20for%20building%20browser-based%20voice%20AI%20with%20Agora&demo-image=https%3A%2F%2Fraw.githubusercontent.com%2FAgoraIO-Conversational-AI%2Fagent-quickstart-nextjs%2Fmain%2F.github%2Fassets%2FConversation-Ai-Client.gif)

## Repo Map

- `app/api/generate-agora-token/route.ts` issues RTC + RTM tokens
- `app/api/invite-agent/route.ts` starts the agent session
- `app/api/stop-conversation/route.ts` stops the agent session
- `components/LandingPage.tsx` starts the session and manages RTM login
- `components/ConversationComponent.tsx` manages RTC, transcript state, `AgentVisualizer`, and `ConvoTextStream`

## More Docs

- [DOCS/GUIDE.md](./DOCS/GUIDE.md)
- [DOCS/TEXT_STREAMING_GUIDE.md](./DOCS/TEXT_STREAMING_GUIDE.md)
- [Agent UIKit Preview](https://agoraio-conversational-ai.github.io/agent-uikit/)
