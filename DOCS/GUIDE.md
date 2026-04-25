# Build a Conversational AI App with Next.js and Agora

Conversational Voice AI is transforming how people interact with AI. It allows you to have a real-time conversation with an AI agent, and actually get something done without wasting time typing out your thoughts and trying to format them into a clever prompt. It's a major shift in the way people interact with AI.

But given the investment that developers and businesses have made in building their own text based agents that run through custom LLM workflows, there's reluctance to adopt this new paradigm. Especially if it means having to give up all that investment or even worse, hobble it by only connecting them as tools/function calls.

This is why we built the Agora Conversational AI Engine. It allows you to connect your existing LLM workflows to an Agora channel, and have a real-time conversation with the AI agent.

In this guide, we'll build a real-time audio conversation application that connects users with an AI agent powered by Agora's Conversational AI Engine. The app will be built with Next.js, React, and TypeScript. We'll take an incremental approach, starting with the core real-time communication components and then adding Agora's Convo AI Engine.

By the end of this guide, you will have a real-time audio conversation application that connects users with an AI agent powered by Agora's Conversational AI Engine.

## Prerequisites

Before starting, for the guide you're going to need to have:

- Node.js (v22 or higher; see `engines` in `package.json`)
- A basic understanding of React with TypeScript and Next.js.
- [An Agora account](https://console.agora.io/signup) - _first 10k minutes each month are free_
- Conversational AI service [activated on your AppID](https://console.agora.io/)

## Project Setup

Let's start by creating a new Next.js project with TypeScript support.

```bash
pnpm create next-app@latest ai-conversation-app
cd ai-conversation-app
```

When prompted, select these options:

- TypeScript: <u>Yes</u>
- ESLint: <u>Yes</u>
- Tailwind CSS: <u>Yes</u>
- Use `src/` directory: <u>No</u>
- App Router: <u>Yes</u>
- Use Turbopack: <u>No</u>
- Customize import alias: <u>Yes</u> (use the default `@/*`)

Next, install the required Agora dependencies:

- [agora-rtc-react](https://www.npmjs.com/package/agora-rtc-react) — Agora's React SDK for real-time audio/video
- [agora-rtm](https://www.npmjs.com/package/agora-rtm) — Agora's Real-Time Messaging SDK (used for transcripts)
- [agora-token](https://www.npmjs.com/package/agora-token) — Agora's Token Builder (server-side)
- [agora-agent-server-sdk](https://www.npmjs.com/package/agora-agent-server-sdk) — invites and manages the AI agent (server-side)
- [agora-agent-client-toolkit](https://www.npmjs.com/package/agora-agent-client-toolkit) — handles transcript events from the AI agent
- [agora-agent-uikit](https://www.npmjs.com/package/agora-agent-uikit) — ready-made UI components for the conversation interface

```bash
pnpm add agora-rtc-react agora-rtm agora-token agora-agent-server-sdk@^1.3.1 agora-agent-client-toolkit agora-agent-uikit
```

For UI components, we'll use shadcn/ui in this guide, but you can use any UI library of your choice or create custom components:

```bash
pnpm dlx shadcn@latest init
```

As we go through this guide, you'll have to create new files in specific directories. So, before we start let's create these new directories.

In your project root directory, create the `app/api/`, `components/`, and `types/` directories, and add the `.env.local` file:

```bash
mkdir app/api components types
touch .env.local
```

Your project directory should now have a structure like this:

```
├── app/
│   ├── api/
│   ├── globals.css
│   ├── layout.tsx
│   └── page.tsx
├── components/
├── types/
├── .env.local
└── (... Existing files and directories)
```

### Tailwind Configuration

The `agora-agent-uikit` package ships pre-built components with Tailwind class names. To ensure those classes are included in your production build, add the uikit's `dist/` folder to Tailwind's `content` array in `tailwind.config.ts`:

```typescript
import type { Config } from 'tailwindcss';

const config: Config = {
  content: [
    './pages/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
    './app/**/*.{js,ts,jsx,tsx,mdx}',
    // Scan the uikit's compiled output so its Tailwind classes are included
    './node_modules/agora-agent-uikit/dist/**/*.{js,mjs}',
  ],
  // ... rest of your config
};

export default config;
```

## Landing Page Component

Let's begin by setting up our landing page that initializes the Agora client and sets up the `AgoraProvider`.

Create the `LandingPage` component file at `components/LandingPage.tsx`:

```bash
touch components/LandingPage.tsx
```

For now we'll keep this component simple, and fill it in with more functionality as we progress through the guide. I've included comments throughout the code to help you understand what's happening. At a high level, we're importing the Agora React SDK and creating the AgoraRTC client, and then passing it to the `AgoraProvider` so all child components use the same `client` instance.

Add the following code to the `LandingPage.tsx` file:

```typescript
'use client';

import { useRef, useState } from 'react';
import dynamic from 'next/dynamic';

// Agora requires access to the browser's WebRTC API,
// - which throws an error if it's loaded via SSR
// Create a component that has SSR disabled,
// - and use it to load the AgoraRTC components on the client side
const AgoraProvider = dynamic(
  async () => {
    // Dynamically import Agora's components
    const { AgoraRTCProvider, default: AgoraRTC } = await import(
      'agora-rtc-react'
    );

    return {
      default: ({ children }: { children: React.ReactNode }) => {
        // Persist the RTC client across StrictMode's simulated remounts.
        const clientRef = useRef<ReturnType<typeof AgoraRTC.createClient> | null>(null);
        if (!clientRef.current) {
          clientRef.current = AgoraRTC.createClient({ mode: 'rtc', codec: 'vp8' });
        }

        // The provider makes the client available to all child components
        return <AgoraRTCProvider client={clientRef.current}>{children}</AgoraRTCProvider>;
      },
    };
  },
  { ssr: false } // Important: disable SSR for this component
);

export default function LandingPage() {
  // Basic setup, we'll add more functionality as we progress through the guide.
  return (
    <div className="min-h-screen bg-gray-900 text-white p-4">
      <h1 className="text-4xl font-bold mb-6 text-center">
        Agora AI Conversation
      </h1>

      <div className="max-w-4xl mx-auto">
        <p className="text-lg mb-6 text-center">
          When was the last time you had an intelligent conversation?
        </p>

        {/* Placeholder for our start conversation button */}
        <div className="flex justify-center mb-8">
          <button className="px-6 py-3 bg-blue-600 text-white rounded-lg">
            Start Conversation
          </button>
        </div>

        <AgoraProvider>
          <div>
            "PLACEHOLDER: We'll add the conversation component here"
          </div>
        </AgoraProvider>
      </div>
    </div>
  );
}
```

Now update your `app/page.tsx` file to use this landing page:

```typescript
import LandingPage from '@/components/LandingPage';

export default function Home() {
  return <LandingPage />;
}
```

## Basic Agora React JS Implementation

With the landing page setup we can focus on implementing Agora's React JS SDK to handle the core RTC functionality, like joining a channel, publishing audio, receiving audio, and handling the Agora SDK events.

Create a file at `components/ConversationComponent.tsx`,

```bash
touch components/ConversationComponent.tsx
```

Add the following code:

```typescript
'use client';

import { useState, useEffect } from 'react';
import {
  useRTCClient,
  useLocalMicrophoneTrack,
  useRemoteUsers,
  useClientEvent,
  useIsConnected,
  useJoin,
  usePublish,
  RemoteUser,
  UID,
} from 'agora-rtc-react';

export default function ConversationComponent() {
  // Access the client from the provider context
  const client = useRTCClient();

  // Track connection status
  const isConnected = useIsConnected();

  // Manage microphone state
  const [isEnabled, setIsEnabled] = useState(true);

  // Track remote users (like our AI agent)
  const remoteUsers = useRemoteUsers();

  // StrictMode guard: delay useJoin's ready flag until after the fake-unmount
  // cycle completes. React StrictMode fires cleanup synchronously before any
  // setTimeout callback, so the first (fake) mount's timeout is always cancelled.
  // Only the real second mount's timeout fires, meaning useJoin joins exactly once.
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

  // Join the channel once isReady (after StrictMode's fake-unmount cycle)
  const { isConnected: joinSuccess } = useJoin(
    {
      appid: process.env.NEXT_PUBLIC_AGORA_APP_ID!, // Load APP_ID from env.local
      channel: 'test-channel',
      token: 'replace-with-token',
      uid: 0, // Join with UID 0 and Agora will assign a unique ID when the user joins
    },
    isReady
  );

  // Create mic track only after the StrictMode cycle completes.
  // Do NOT pass isEnabled here — that ties track lifetime to mute state and
  // breaks the Web Audio graph. Mute uses track.setEnabled() only.
  const { localMicrophoneTrack } = useLocalMicrophoneTrack(isReady);

  // Publish our microphone track to the channel
  usePublish([localMicrophoneTrack]);

  // Set up event handlers for client events
  useClientEvent(client, 'user-joined', (user) => {
    console.log('Remote user joined:', user.uid);
  });

  useClientEvent(client, 'user-left', (user) => {
    console.log('Remote user left:', user.uid);
  });

  // Toggle microphone via setEnabled — usePublish owns publish state
  const toggleMicrophone = async () => {
    if (localMicrophoneTrack) {
      const next = !isEnabled;
      await localMicrophoneTrack.setEnabled(next);
      setIsEnabled(next);
    }
  };

  // useJoin handles client.leave() on unmount — no manual cleanup needed here

  return (
    <div className="p-4 bg-gray-800 rounded-lg">
      <div className="mb-4">
        <p className="text-white">
          {/* Display the connection status */}
          Connection Status: {isConnected ? 'Connected' : 'Disconnected'}
        </p>
      </div>

      {/* Display remote users */}
      <div className="mb-4">
        {remoteUsers.length > 0 ? (
          remoteUsers.map((user) => (
            <div
              key={user.uid}
              className="p-2 bg-gray-700 rounded mb-2 text-white"
            >
              <RemoteUser user={user} />
            </div>
          ))
        ) : (
          <p className="text-gray-400">No remote users connected</p>
        )}
      </div>

      {/* Microphone control */}
      <button
        onClick={toggleMicrophone}
        className={`px-4 py-2 rounded ${
          isEnabled ? 'bg-green-500' : 'bg-red-500'
        } text-white`}
      >
        Microphone: {isEnabled ? 'On' : 'Off'}
      </button>
    </div>
  );
}
```

This component is the foundation for our real-time audio communication, so let's recap the Agora React hooks that we're using:

- `useRTCClient`: Gets access to the Agora RTC client from the provider we set up in the landing page
- `useLocalMicrophoneTrack`: Creates and manages the user's microphone input
- `useRemoteUsers`: Keeps track of other users in the channel (our AI agent will appear here)
- `useJoin`: Handles joining the channel with the specified parameters
- `usePublish`: Publishes our audio track to the channel so others can hear us
- `useClientEvent`: Sets up event handlers for important events like users joining or leaving

> **Note on React StrictMode:** In development, React StrictMode mounts components twice to surface bugs. Keep the RTC client in a `useRef`, not a `useMemo`, so the provider does not create two client instances during that cycle. The `isReady` guard then prevents `useJoin` from calling `client.join()` during the fake first mount.

> **Note:** We are loading the `APP_ID` from the environment variables using the non-null assertion operator, so make sure to set it in `.env.local` file.

We need to add this component to our `LandingPage.tsx` file. Start by importing the component, and then add it to the AgoraProvider component.

```typescript
// Previous imports remain the same as before...
// Dynamically import the ConversationComponent with ssr disabled
const ConversationComponent = dynamic(() => import('./ConversationComponent'), {
  ssr: false,
});
// Previous code remains the same as before...
<AgoraProvider>
  <ConversationComponent />
</AgoraProvider>;
```

Next, we'll implement token authentication, to add a layer of security to our application.

## Token Generation and Management

The Agora team strongly recommends using token-based authentication for all your apps, especially in production environments. In this step, we'll create a route to generate these tokens and update our `LandingPage` and `ConversationComponent` to use them.

### Token Generation Route

Let's break down what the token generation route needs to do:

1. Generate a secure Agora token using our App ID and Certificate
2. Create a unique channel name for each conversation
3. Return token, along with the channel name, and UID we used to generate it, back to the client
4. Support token refresh, using existing channel name and UID

Create a new file at `app/api/generate-agora-token/route.ts`:

```bash
mkdir app/api/generate-agora-token
touch app/api/generate-agora-token/route.ts
```

Add the following code:

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { RtcTokenBuilder, RtcRole } from 'agora-token';

// Access environment variables
const APP_ID = process.env.NEXT_PUBLIC_AGORA_APP_ID;
const APP_CERTIFICATE = process.env.NEXT_AGORA_APP_CERTIFICATE;
const EXPIRATION_TIME_IN_SECONDS = 3600; // Token valid for 1 hour

// Helper function to generate unique channel names
function generateChannelName(): string {
  // Combine timestamp and random string for uniqueness
  const timestamp = Date.now();
  const random = Math.random().toString(36).substring(2, 8);
  return `ai-conversation-${timestamp}-${random}`;
}

export async function GET(request: NextRequest) {
  console.log('Generating Agora token...');

  // Verify required environment variables are set
  if (!APP_ID || !APP_CERTIFICATE) {
    console.error('Agora credentials are not set');
    return NextResponse.json(
      { error: 'Agora credentials are not set' },
      { status: 500 },
    );
  }

  // Get query parameters (if any)
  const { searchParams } = new URL(request.url);
  const uidStr = searchParams.get('uid') || '0';
  const uid = parseInt(uidStr);

  // Use provided channel name or generate new one
  const channelName = searchParams.get('channel') || generateChannelName();

  // Calculate token expiration time
  const expirationTime =
    Math.floor(Date.now() / 1000) + EXPIRATION_TIME_IN_SECONDS;

  try {
    // Generate the token using Agora's Token Builder SDK (RTC + RTM for text streaming)
    console.log(
      'Building RTC+RTM token with UID:',
      uid,
      'Channel:',
      channelName,
    );
    const token = RtcTokenBuilder.buildTokenWithRtm(
      APP_ID,
      APP_CERTIFICATE,
      channelName,
      uid,
      RtcRole.PUBLISHER, // User can publish audio/video
      expirationTime,
      expirationTime,
    );

    console.log('Token generated successfully (RTC + RTM)');
    // Return the token and session information to the client
    return NextResponse.json({
      token,
      uid: uid.toString(),
      channel: channelName,
    });
  } catch (error) {
    console.error('Error generating Agora token:', error);
    return NextResponse.json(
      { error: 'Failed to generate Agora token', details: error },
      { status: 500 },
    );
  }
}
```

This route handles token generation for our application, so let's recap the important features:

- Generates unique channel names using timestamps and random strings to avoid collisions
- Generates a secure token using the App ID and Certificate
- Accepts url parameters for refreshing tokens using an existing channel name and user ID
- Uses `buildTokenWithRtm` to generate a combined RTC + RTM token — RTM is needed for the transcript feature we'll add later

> **Note:** This route is loading the APP_ID and APP_CERTIFICATE from the environment variables, so make sure to set them in your `.env.local` file.

### Updating the Landing Page to Request Tokens

With the token route setup, let's update the landing page to handle all session setup logic. First, we'll need to create some type definitions.

Create a file at `types/conversation.ts`:

```bash
touch types/conversation.ts
```

Add the following code:

```typescript
import type { RTMClient } from 'agora-rtm';

// Types for Agora token data
export interface AgoraTokenData {
  token: string;
  uid: string;
  channel: string;
  agentId?: string;
}

export interface AgoraRenewalTokens {
  rtcToken: string;
  rtmToken: string;
}

// Props for our conversation component
export interface ConversationComponentProps {
  agoraData: AgoraTokenData;
  rtmClient: RTMClient; // RTM client for transcript delivery
  onTokenWillExpire: (uid: string) => Promise<AgoraRenewalTokens>;
  onEndConversation: () => void;
}

// Types for the agent invitation API
export interface ClientStartRequest {
  requester_id: string;
  channel_name: string;
}

export interface AgentResponse {
  agent_id: string;
  create_ts: number;
  state: string;
}

export interface StopConversationRequest {
  agent_id: string;
}
```

Open the `components/LandingPage.tsx` file and update it with the full implementation. The key additions here are:

- **Module preloading**: Kick off dynamic imports on mount so they're cached when the user clicks "Try it now!" — this eliminates the ~1–2 second import delay
- **Parallel setup**: Agent invite and RTM login run in `Promise.all` — both only need the token, so there's no reason to run them sequentially
- **RTM client**: Created here and passed down to `ConversationComponent` so the toolkit can subscribe to transcript messages

```typescript
'use client';

import { useState, useRef, Suspense, useEffect } from 'react';
import dynamic from 'next/dynamic';
import type { RTMClient } from 'agora-rtm';
import type {
  AgoraTokenData,
  ClientStartRequest,
  AgentResponse,
} from '../types/conversation';

// Dynamically import the ConversationComponent with ssr disabled
const ConversationComponent = dynamic(() => import('./ConversationComponent'), {
  ssr: false,
});

// Dynamically import AgoraRTC and AgoraRTCProvider
const AgoraProvider = dynamic(
  async () => {
    const { AgoraRTCProvider, default: AgoraRTC } = await import('agora-rtc-react');
    return {
      default: ({ children }: { children: React.ReactNode }) => {
        const clientRef = useRef<ReturnType<typeof AgoraRTC.createClient> | null>(null);
        if (!clientRef.current) {
          clientRef.current = AgoraRTC.createClient({ mode: 'rtc', codec: 'vp8' });
        }
        return <AgoraRTCProvider client={clientRef.current}>{children}</AgoraRTCProvider>;
      },
    };
  },
  { ssr: false }
);

export default function LandingPage() {
  const [showConversation, setShowConversation] = useState(false);

  // Preload heavy modules on mount so they're already cached when the user
  // clicks "Try it now!" — eliminates the dynamic-import delay on first click.
  useEffect(() => {
    import('agora-rtc-react').catch(() => {});
    import('agora-rtm').catch(() => {});
  }, []);

  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [agoraData, setAgoraData] = useState<AgoraTokenData | null>(null);
  const [rtmClient, setRtmClient] = useState<RTMClient | null>(null);
  const [agentJoinError, setAgentJoinError] = useState(false);

  const handleStartConversation = async () => {
    setIsLoading(true);
    setError(null);
    setAgentJoinError(false);

    try {
      // Step 1: Fetch RTC token + channel
      console.log('Fetching Agora token...');
      const agoraResponse = await fetch('/api/generate-agora-token');
      const responseData = await agoraResponse.json();

      if (!agoraResponse.ok) {
        throw new Error(`Failed to generate Agora token: ${JSON.stringify(responseData)}`);
      }

      // Step 2: Run agent invite and RTM setup in parallel — both only need the token.
      // RTM must be ready before ConversationComponent mounts (the toolkit needs
      // a fully-connected RTM client). Agent invite is non-fatal.
      const [agentData, rtm] = await Promise.all([
        // 2a. Start the AI agent
        fetch('/api/invite-agent', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            requester_id: responseData.uid,
            channel_name: responseData.channel,
          } as ClientStartRequest),
        })
          .then(async (res) => {
            if (!res.ok) { setAgentJoinError(true); return null; }
            return res.json() as Promise<AgentResponse>;
          })
          .catch((err) => {
            console.error('Failed to start conversation with agent:', err);
            setAgentJoinError(true);
            return null;
          }),

        // 2b. Set up RTM for transcript delivery
        (async () => {
          const { default: AgoraRTM } = await import('agora-rtm');
          const rtm = new AgoraRTM.RTM(
            process.env.NEXT_PUBLIC_AGORA_APP_ID!,
            String(Date.now())
          );
          await rtm.login({ token: responseData.token });
          await rtm.subscribe(responseData.channel);
          console.log('RTM ready, channel:', responseData.channel);
          return rtm as RTMClient;
        })(),
      ]);

      // Step 3: All dependencies ready — store state and show conversation
      setRtmClient(rtm);
      setAgoraData({ ...responseData, agentId: agentData?.agent_id });
      setShowConversation(true);
    } catch (err) {
      setError('Failed to start conversation. Please try again.');
      console.error('Error starting conversation:', err);
    } finally {
      setIsLoading(false);
    }
  };

  const handleTokenWillExpire = async (uid: string) => {
    try {
      const response = await fetch(
        `/api/generate-agora-token?channel=${agoraData?.channel}&uid=${uid}`
      );
      const data = await response.json();
      if (!response.ok) throw new Error('Failed to generate new token');
      return data.token;
    } catch (error) {
      console.error('Error renewing token:', error);
      throw error;
    }
  };

  const handleEndConversation = async () => {
    // Stop the AI agent
    if (agoraData?.agentId) {
      try {
        const response = await fetch('/api/stop-conversation', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ agent_id: agoraData.agentId }),
        });
        if (!response.ok) {
          console.error('Failed to stop agent:', await response.text());
        } else {
          console.log('Agent stopped successfully');
        }
      } catch (error) {
        console.error('Error stopping agent:', error);
      }
    }

    // Tear down RTM — owned here since we created it here
    rtmClient?.logout().catch((err) => console.error('RTM logout error:', err));
    setRtmClient(null);
    setShowConversation(false);
  };

  return (
    <div className="min-h-screen flex flex-col bg-black text-white relative overflow-hidden">
      <div className="flex-1 flex flex-col items-center justify-center">
        <div className="z-10 text-center">
          <h1 className="text-4xl font-bold mb-6">Speak with Agent</h1>
          {!showConversation && (
            <p className="text-lg mb-14">
              Experience the power of Agora's Conversational AI Engine.
            </p>
          )}
          {!showConversation ? (
            <>
              <button
                onClick={handleStartConversation}
                disabled={isLoading}
                className="px-8 py-3 bg-black text-white font-bold rounded-full border-2 border-[#00c2ff] backdrop-blur-sm
                hover:bg-[#00c2ff] hover:text-black transition-all duration-300 shadow-lg hover:shadow-[#00c2ff]/20
                disabled:opacity-50 disabled:cursor-not-allowed text-lg"
              >
                {isLoading ? 'Starting...' : 'Try it now!'}
              </button>
              {error && <p className="mt-4 text-red-500">{error}</p>}
            </>
          ) : agoraData && rtmClient ? (
            <>
              {agentJoinError && (
                <div className="mb-4 p-3 bg-red-900/20 rounded-lg text-red-400">
                  Failed to connect with AI agent. The conversation may not work
                  as expected.
                </div>
              )}
              <Suspense fallback={<div>Loading conversation...</div>}>
                <AgoraProvider>
                  <ConversationComponent
                    agoraData={agoraData}
                    rtmClient={rtmClient}
                    onTokenWillExpire={handleTokenWillExpire}
                    onEndConversation={handleEndConversation}
                  />
                </AgoraProvider>
              </Suspense>
            </>
          ) : (
            <p>Failed to load conversation data.</p>
          )}
        </div>
      </div>
    </div>
  );
}
```

### Updating the Conversation Component to Use Tokens

Now update `ConversationComponent` to accept the props from `LandingPage`. The component also gains proper token renewal and an end-conversation button.

```typescript
// Previous imports remain the same as before...
import type { ConversationComponentProps } from '../types/conversation';

export default function ConversationComponent({
  agoraData,
  rtmClient,
  onTokenWillExpire,
  onEndConversation,
}: ConversationComponentProps) {
  // ... existing state declarations ...
  const [joinedUID, setJoinedUID] = useState<UID>(0);

  // isReady guard (same pattern as above)
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

  // Update useJoin to use token and channel from props
  const { isConnected: joinSuccess } = useJoin(
    {
      appid: process.env.NEXT_PUBLIC_AGORA_APP_ID!,
      channel: agoraData.channel,
      token: agoraData.token,
      uid: parseInt(agoraData.uid, 10) || 0,
    },
    isReady,
  );

  const { localMicrophoneTrack } = useLocalMicrophoneTrack(isReady);

  // Capture the RTC-assigned UID for token renewal
  useEffect(() => {
    if (joinSuccess && client) {
      setJoinedUID(client.uid as UID);
      console.log('Join successful, using UID:', client.uid);
    }
  }, [joinSuccess, client]);

  // Token renewal — RTC and RTM now renew with separate tokens
  const handleTokenWillExpire = useCallback(async () => {
    if (!onTokenWillExpire || !joinedUID) return;
    try {
      const { rtcToken, rtmToken } = await onTokenWillExpire(
        joinedUID.toString(),
      );
      await client?.renewToken(rtcToken);
      await rtmClient.renewToken(rtmToken);
      console.log('Successfully renewed Agora RTC and RTM tokens');
    } catch (error) {
      console.error('Failed to renew Agora token:', error);
    }
  }, [client, onTokenWillExpire, joinedUID, rtmClient]);

  useClientEvent(client, 'token-privilege-will-expire', handleTokenWillExpire);
  useClientEvent(client, 'connection-state-change', (curState, prevState) => {
    console.log(`Connection state changed from ${prevState} to ${curState}`);
  });

  // ... rest of component
}
```

### Quick Test

Now that we have our basic RTC functionality and token generation working, let's test the application.

1. Run the application using `pnpm dev`
2. Open the application in your browser, using the url `http://localhost:3000`
3. Click on the "Try it now!" button
4. You should see the connection status change to "Connected"

## Add Agora's Conversational AI Engine

Now that we have the basic RTC functionality working, let's integrate Agora's Conversational AI service. In this next section we'll:

1. Create an API route for inviting the AI agent to our channel
2. Configure Agora Start Request, including our choice of LLM endpoint and TTS provider
3. Create a route for stopping the conversation

### Invite Agent Route

The `agora-agent-server-sdk` simplifies agent creation by handling token generation and the Agora REST API internally. Create the route file at `app/api/invite-agent/route.ts`:

```bash
mkdir app/api/invite-agent
touch app/api/invite-agent/route.ts
```

Add the following code:

```typescript
import { NextRequest, NextResponse } from 'next/server';
import {
  AgoraClient,
  Agent,
  Area,
  DeepgramSTT,
  ExpiresIn,
  MiniMaxTTS,
  OpenAI,
} from 'agora-agent-server-sdk';
import { ClientStartRequest, AgentResponse } from '@/types/conversation';
import { DEFAULT_AGENT_UID } from '@/lib/agora';

// System prompt that defines the agent's personality and behavior.
// Swap this out to change what the agent talks about.
const ADA_PROMPT = `You are **Ada**, a developer advocate AI from **Agora**. You help developers understand and build with Agora's Conversational AI platform.

# What Agora Actually Is
Agora is a real-time communications company. The product you represent is the **Agora Conversational AI Engine** — it lets developers add voice AI agents to any app by connecting ASR, LLM, and TTS into a real-time pipeline over Agora's SD-RTN (Software Defined Real-Time Network). Key facts:
- The product is called the **Conversational AI Engine** (not "Chorus", not "Harmony", or any other name you might invent)
- It runs a full ASR → LLM → TTS pipeline with sub-500ms latency
- It supports Deepgram, Microsoft, and others for ASR; OpenAI, Anthropic, and others for LLM; ElevenLabs, Microsoft, and others for TTS
- Agora's SD-RTN is its global real-time network infrastructure — not "SDRTN"
- MCP in this context means **Model Context Protocol** (Anthropic's open standard for connecting AI models to tools/data), not "multi-channel processing"
- Agora does not have a product called Chorus, Harmony, or any similar name — do not invent product names

# Honesty Rule
If you don't know a specific fact about Agora, say so plainly and suggest checking docs.agora.io. Never invent product names, feature names, or capabilities.

# Persona & Tone
- Friendly, technically credible, concise. You're a peer who builds things, not a support agent.
- Plain English. No marketing fluff.

# Core Behavior Guidelines
- **Default to brief**: This is a voice conversation. Keep most replies to 1–2 sentences. Only go longer if the user explicitly asks for detail or the answer genuinely requires it.
- **Never list or enumerate**: No bullet points, no numbered steps. Say the single most important thing.
- **Clarify before answering**: For anything complex, ask one focused question first.
- **Ask at most one question per turn**: Never stack questions.
- **Guide, don't lecture**: Unlock the next step, not everything at once.`;

// First thing the agent says when a user joins the channel.
// Set NEXT_AGENT_GREETING in .env.local to override.
const GREETING =
  process.env.NEXT_AGENT_GREETING ??
  `Hi there! I'm Ada, your virtual assistant from Agora. How can I help?`;

// agentUid identifies the AI in the RTC channel — must match NEXT_PUBLIC_AGENT_UID on the client
const agentUid = process.env.NEXT_PUBLIC_AGENT_UID ?? String(DEFAULT_AGENT_UID);

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}

export async function POST(request: NextRequest) {
  try {
    const body: ClientStartRequest = await request.json();
    const { requester_id, channel_name } = body;

    const appId =
      process.env.NEXT_PUBLIC_AGORA_APP_ID || requireEnv('NEXT_AGORA_APP_ID');
    const appCertificate = requireEnv('NEXT_AGORA_APP_CERTIFICATE');

    if (!channel_name || !requester_id) {
      return NextResponse.json(
        { error: 'channel_name and requester_id are required' },
        { status: 400 },
      );
    }

    const client = new AgoraClient({
      area: Area.US,
      appId,
      appCertificate,
    });

    // Default agent configuration: Agora-managed STT, LLM, and TTS.
    // Optional BYOK examples can be added if you want to swap providers.
    const agent = new Agent({
      name: `conversation-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`,
      instructions: ADA_PROMPT,
      greeting: GREETING,
      failureMessage: 'Please wait a moment.',
      maxHistory: 50,
      turnDetection: {
        config: {
          speech_threshold: 0.5,
          start_of_speech: {
            mode: 'vad',
            vad_config: {
              interrupt_duration_ms: 160,
              prefix_padding_ms: 300,
            },
          },
          end_of_speech: {
            mode: 'vad',
            vad_config: {
              silence_duration_ms: 480,
            },
          },
        },
      },
      advancedFeatures: { enable_rtm: true, enable_tools: true },
    })
      .withStt(
        new DeepgramSTT({
          model: 'nova-3',
          language: 'en',
        }),
      )
      .withLlm(
        new OpenAI({
          model: 'gpt-4o-mini',
          greetingMessage: GREETING,
          failureMessage: 'Please wait a moment.',
          maxHistory: 15,
          params: {
            max_tokens: 1024,
            temperature: 0.7,
            top_p: 0.95,
          },
        }),
      )
      .withTts(
        new MiniMaxTTS({
          model: 'speech_2_6_turbo',
          voiceId: 'English_captivating_female1',
        }),
      );

    const session = agent.createSession(client, {
      channel: channel_name,
      agentUid,
      remoteUids: [requester_id],
      idleTimeout: 30,
      expiresIn: ExpiresIn.hours(1),
    });

    const agentId = await session.start();

    return NextResponse.json({
      agent_id: agentId,
      create_ts: Math.floor(Date.now() / 1000),
      state: 'RUNNING',
    } as AgentResponse);
  } catch (error) {
    console.error('Error starting conversation:', error);
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : 'Failed to start conversation',
      },
      { status: 500 },
    );
  }
}
```

This quickstart uses **`agora-agent-server-sdk` ^1.3.1** with **DeepgramSTT**, **OpenAI** (`gpt-4o-mini`), and **MiniMaxTTS** through Agora-managed defaults, so the base quickstart only needs Agora credentials. The SDK still supports other STT/LLM/TTS providers if you want to enable the optional BYOK examples.

> **Note:** Only Agora App ID and App Certificate are required for this default agent configuration. `NEXT_PUBLIC_AGENT_UID` is an optional override that defaults to `123456`. See the environment variables reference at the end of this guide. Optional `NEXT_LLM_URL` / `NEXT_LLM_API_KEY` apply only if you enable the optional BYOK block or use the optional `app/api/chat/completions` proxy.

### Stop Conversation Route

After the agent joins the conversation, we need a way to remove them. The `stop-conversation` route uses the `agora-agent-server-sdk` to stop the agent.

Create a file at `app/api/stop-conversation/route.ts`:

```bash
mkdir app/api/stop-conversation
touch app/api/stop-conversation/route.ts
```

Add the following code:

```typescript
import { NextResponse } from 'next/server';
import { AgoraClient, Area } from 'agora-agent-server-sdk';
import { StopConversationRequest } from '@/types/conversation';

export async function POST(request: Request) {
  try {
    const body: StopConversationRequest = await request.json();
    const { agent_id } = body;

    if (!agent_id) {
      return NextResponse.json(
        { error: 'agent_id is required' },
        { status: 400 },
      );
    }

    const appId =
      process.env.NEXT_PUBLIC_AGORA_APP_ID || process.env.NEXT_AGORA_APP_ID;
    const appCertificate = process.env.NEXT_AGORA_APP_CERTIFICATE;
    if (!appId || !appCertificate) {
      throw new Error(
        'Missing Agora configuration. Set NEXT_PUBLIC_AGORA_APP_ID and NEXT_AGORA_APP_CERTIFICATE.',
      );
    }

    const client = new AgoraClient({
      area: Area.US,
      appId,
      appCertificate,
    });
    await client.stopAgent(agent_id);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error stopping conversation:', error);
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : 'Failed to stop conversation',
      },
      { status: 500 },
    );
  }
}
```

## Add the Agora UI Kit and Toolkit

Rather than building custom microphone buttons and audio visualizers from scratch, Agora provides two packages that handle the UI and transcript logic for you:

- **`agora-agent-uikit`** — pre-built components: `AgentVisualizer`, `MicButtonWithVisualizer`, `ConvoTextStream`
- **`agora-agent-client-toolkit`** — `AgoraVoiceAI` class that subscribes to RTM transcript events and emits transcript, state, and error events

Both packages are already installed. Now we'll wire them into the `ConversationComponent`.

### How the Transcript System Works

When the AI agent speaks (or the user speaks), the Agora Conversational AI Engine sends transcript updates over RTM. The flow is:

1. The agent is configured with `enable_rtm: true` (done in the invite-agent route above)
2. On the client, `AgoraVoiceAI.init()` connects to the RTM channel and listens for these events
3. It fires a `TRANSCRIPT_UPDATED` event with a normalized list of transcript items
4. We remap the local user UID, adapt the transcript items into `IMessageListItem`, and pass them to `ConvoTextStream` for display

### Microphone Selector (Optional)

When users have multiple microphones, a device selector improves the experience. Create `components/MicrophoneSelector.tsx`:

```bash
touch components/MicrophoneSelector.tsx
```

This component uses `AgoraRTC.getMicrophones()` to list devices, shows a dropdown when multiple devices exist, and supports hot-swap when devices are plugged/unplugged. It only renders when there is more than one microphone. See the implementation in `components/MicrophoneSelector.tsx` in the companion repository for the full code using shadcn `DropdownMenu`.

### Complete ConversationComponent

Here is the full updated `ConversationComponent` using the toolkit and uikit:

```typescript
'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { X } from 'lucide-react';
import { setParameter } from 'agora-rtc-sdk-ng/esm';
import {
  useRTCClient,
  useLocalMicrophoneTrack,
  useRemoteUsers,
  useClientEvent,
  useJoin,
  usePublish,
  RemoteUser,
  UID,
} from 'agora-rtc-react';
import {
  AgoraVoiceAI,
  AgoraVoiceAIEvents,
  AgentState,
  MessageSalStatus,
  TranscriptHelperMode,
  TurnStatus,
  type TranscriptHelperItem,
  type UserTranscription,
  type AgentTranscription,
} from 'agora-agent-client-toolkit';
import {
  AgentVisualizer,
  ConvoTextStream,
  type AgentVisualizerState,
  type IMessageListItem,
} from 'agora-agent-uikit';
import { MicButtonWithVisualizer } from 'agora-agent-uikit/rtc';
import { Button } from '@/components/ui/button';
import { DEFAULT_AGENT_UID } from '@/lib/agora';
import { MicrophoneSelector } from './MicrophoneSelector';
import { ConnectionStatusPanel } from './ConnectionStatusPanel';
import {
  getConversationIssueSeverity,
  type ConnectionIssue,
} from './ConversationErrorCard';
import type { ConversationComponentProps } from '@/types/conversation';

type ToolkitMessage = TranscriptHelperItem<Partial<UserTranscription | AgentTranscription>>;

function mapAgentVisualizerState(
  agentState: AgentState | null,
  isAgentConnected: boolean,
  connectionState: string,
): AgentVisualizerState {
  if (connectionState === 'DISCONNECTED' || connectionState === 'DISCONNECTING') {
    return 'disconnected';
  }
  if (connectionState === 'CONNECTING' || connectionState === 'RECONNECTING') {
    return 'joining';
  }
  if (!isAgentConnected) {
    return 'not-joined';
  }
  switch (agentState) {
    case 'listening':
      return 'listening';
    case 'thinking':
      return 'analyzing';
    case 'speaking':
      return 'talking';
    default:
      return 'ambient';
  }
}

function toMessageListItem(item: ToolkitMessage): IMessageListItem {
  return {
    turn_id: item.turn_id,
    uid: Number(item.uid) || 0,
    text: typeof item.text === 'string' ? item.text : '',
    status: item.status as unknown as IMessageListItem['status'],
    createdAt: typeof item._time === 'number' ? item._time * 1000 : undefined,
  };
}

export default function ConversationComponent({
  agoraData,
  rtmClient,
  onTokenWillExpire,
  onEndConversation,
}: ConversationComponentProps) {
  const client = useRTCClient();
  const remoteUsers = useRemoteUsers();
  const [isEnabled, setIsEnabled] = useState(true);
  const [isAgentConnected, setIsAgentConnected] = useState(false);
  const [isConnectionDetailsOpen, setIsConnectionDetailsOpen] = useState(false);
  const [connectionState, setConnectionState] = useState<string>('CONNECTING');
  const agentUID = process.env.NEXT_PUBLIC_AGENT_UID ?? String(DEFAULT_AGENT_UID);
  const [joinedUID, setJoinedUID] = useState<UID>(0);
  const [agentState, setAgentState] = useState<AgentState | null>(null);
  const [connectionIssues, setConnectionIssues] = useState<ConnectionIssue[]>([]);

  // StrictMode guard: delay useJoin's ready flag until after the fake-unmount
  // cycle completes. React StrictMode fires cleanup synchronously before any
  // setTimeout callback, so the first (fake) mount's timeout is always cancelled.
  // Only the real second mount's timeout fires, meaning useJoin joins exactly once.
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

  const { isConnected: joinSuccess } = useJoin(
    {
      appid: process.env.NEXT_PUBLIC_AGORA_APP_ID!,
      channel: agoraData.channel,
      token: agoraData.token,
      uid: parseInt(agoraData.uid, 10) || 0,
    },
    isReady
  );

  // Create mic track only after the StrictMode cycle completes (isReady).
  // Passing true here creates two tracks in StrictMode — the first publishes,
  // then StrictMode cleanup closes it and the second takes over, causing an
  // audio gap. Do NOT pass isEnabled — that ties track lifetime to mute state
  // and breaks the Web Audio graph. Mute uses track.setEnabled() only.
  const { localMicrophoneTrack } = useLocalMicrophoneTrack(isReady);

  // ENABLE_AUDIO_PTS is a module-level SDK parameter (not on the client instance).
  // It must be set before publishing audio for transcript timing to be accurate.
  useEffect(() => {
    if (!client) return;
    try {
      setParameter('ENABLE_AUDIO_PTS', true);
    } catch (error) {
      console.warn('Could not set ENABLE_AUDIO_PTS:', error);
    }
  }, [client]);

  // Capture the RTC-assigned UID for token renewal
  useEffect(() => {
    if (joinSuccess && client) {
      setJoinedUID(client.uid as UID);
    }
  }, [joinSuccess, client]);

  // --- Transcript via AgoraVoiceAI ---
  const [rawTranscript, setRawTranscript] = useState<ToolkitMessage[]>([]);

  useEffect(() => {
    if (!isReady || !joinSuccess) return;

    let cancelled = false;

    (async () => {
      try {
        const ai = await AgoraVoiceAI.init({
          rtcEngine: client,
          rtmConfig: { rtmEngine: rtmClient },
          renderMode: TranscriptHelperMode.TEXT,
          enableLog: true,
        });

        if (cancelled) return;

        ai.on(AgoraVoiceAIEvents.TRANSCRIPT_UPDATED, (messages) => {
          setRawTranscript([...messages] as ToolkitMessage[]);
        });
        ai.on(AgoraVoiceAIEvents.AGENT_STATE_CHANGED, (_, event) => {
          setAgentState(event.state);
        });
        ai.on(AgoraVoiceAIEvents.MESSAGE_ERROR, (agentUserId, error) => {
          setConnectionIssues((prev) => [
            {
              id: `${Date.now()}-${agentUserId}-${error.code}`,
              source: 'rtm',
              agentUserId,
              code: error.code,
              message: error.message,
              timestamp: error.timestamp * 1000,
            },
            ...prev,
          ].slice(0, 6));
        });
        ai.on(AgoraVoiceAIEvents.MESSAGE_SAL_STATUS, (agentUserId, salStatus) => {
          if (
            salStatus.status === MessageSalStatus.VP_REGISTER_FAIL ||
            salStatus.status === MessageSalStatus.VP_REGISTER_DUPLICATE
          ) {
            setConnectionIssues((prev) => [
              {
                id: `${Date.now()}-${agentUserId}-${salStatus.status}`,
                source: 'rtm',
                agentUserId,
                code: salStatus.status,
                message: `SAL status: ${salStatus.status}`,
                timestamp: salStatus.timestamp * 1000,
              },
              ...prev,
            ].slice(0, 6));
          }
        });
        ai.subscribeMessage(agoraData.channel);
      } catch (error) {
        if (!cancelled) console.error('[ConversationalAI] init error:', error);
      }
    })();

    return () => {
      cancelled = true;
      try {
        const ai = AgoraVoiceAI.getInstance();
        if (ai) {
          ai.unsubscribe();
          ai.destroy();
        }
      } catch {}
      setRawTranscript([]);
    };
  }, [isReady, joinSuccess]);

  const transcript = useMemo(() => {
    const localUID = String(client.uid);
    return rawTranscript.map((m) =>
      m.uid === '0' ? { ...m, uid: localUID } : m
    );
  }, [rawTranscript, client.uid]);

  // Completed (END + INTERRUPTED) messages shown as history.
  // INTERRUPTED must be included — if the agent's first turn is cut off,
  // messageList stays empty and ConvoTextStream never auto-opens.
  const messageList = useMemo(
    () => transcript.filter((m) => m.status !== TurnStatus.IN_PROGRESS).map(toMessageListItem),
    [transcript]
  );

  const currentInProgressMessage = useMemo(() => {
    const m = transcript.find((x) => x.status === TurnStatus.IN_PROGRESS);
    return m ? toMessageListItem(m) : null;
  }, [transcript]);

  // Publish local mic once the track exists; usePublish waits for RTC connection.
  usePublish([localMicrophoneTrack]);

  useClientEvent(client, 'user-joined', (user) => {
    if (user.uid.toString() === agentUID) setIsAgentConnected(true);
  });

  useClientEvent(client, 'user-left', (user) => {
    if (user.uid.toString() === agentUID) setIsAgentConnected(false);
  });

  // Sync isAgentConnected with remoteUsers (covers cases where user-joined/left are missed)
  useEffect(() => {
    setIsAgentConnected(
      remoteUsers.some((user) => user.uid.toString() === agentUID)
    );
  }, [remoteUsers, agentUID]);

  useClientEvent(client, 'connection-state-change', (curState) => {
    setConnectionState(curState);
  });

  const handleMicToggle = useCallback(async () => {
    const next = !isEnabled;
    const track = localMicrophoneTrack;
    if (!track) {
      setIsEnabled(next);
      return;
    }
    try {
      await track.setEnabled(next);
      setIsEnabled(next);
    } catch (error) {
      console.error('Failed to toggle microphone:', error);
    }
  }, [isEnabled, localMicrophoneTrack]);

  const handleTokenWillExpire = useCallback(async () => {
    if (!onTokenWillExpire || !joinedUID) return;
    try {
      const { rtcToken, rtmToken } = await onTokenWillExpire(joinedUID.toString());
      await client?.renewToken(rtcToken);
      await rtmClient.renewToken(rtmToken);
    } catch (error) {
      console.error('Failed to renew Agora token:', error);
    }
  }, [client, onTokenWillExpire, joinedUID, rtmClient]);

  useClientEvent(client, 'token-privilege-will-expire', handleTokenWillExpire);

  const connectionSeverity = useMemo<'normal' | 'warning' | 'error'>(() => {
    if (connectionState === 'DISCONNECTED' || connectionState === 'DISCONNECTING') {
      return 'error';
    }
    if (connectionState === 'CONNECTING' || connectionState === 'RECONNECTING') {
      return 'warning';
    }
    if (connectionIssues.length === 0) return 'normal';
    return connectionIssues.some((issue) => getConversationIssueSeverity(issue) === 'error')
      ? 'error'
      : 'warning';
  }, [connectionState, connectionIssues]);

  const visualizerState = useMemo(
    () => mapAgentVisualizerState(agentState, isAgentConnected, connectionState),
    [agentState, isAgentConnected, connectionState]
  );

  return (
    <div className="flex flex-col gap-6 p-4 h-full">
      <div className="absolute top-4 left-4">
        <ConnectionStatusPanel
          connectionState={connectionState}
          connectionSeverity={connectionSeverity}
          connectionIssues={connectionIssues}
          isOpen={isConnectionDetailsOpen}
          onToggle={() => setIsConnectionDetailsOpen((open) => !open)}
        />
      </div>

      <div className="absolute top-4 right-4">
        <Button
          variant="destructive"
          size="icon"
          onClick={onEndConversation}
          aria-label="End conversation with AI agent"
          title="End conversation"
        >
          <X />
        </Button>
      </div>

      {/* Remote users keep RTC audio subscribed. The visualizer itself is driven by RTM state. */}
      <div className="relative h-56 w-full flex items-center justify-center">
        <AgentVisualizer state={visualizerState} size="lg" />
        {remoteUsers.map((user) => (
          <div key={user.uid} className="hidden">
            <RemoteUser user={user} />
          </div>
        ))}
      </div>

      <div className="fixed bottom-14 md:bottom-8 left-1/2 -translate-x-1/2 flex items-center gap-3 bg-card/80 backdrop-blur-md border border-border rounded-full px-4 py-2">
        <MicButtonWithVisualizer
          isEnabled={isEnabled}
          setIsEnabled={setIsEnabled}
          track={localMicrophoneTrack}
          onToggle={handleMicToggle}
        />
        <MicrophoneSelector localMicrophoneTrack={localMicrophoneTrack} />
      </div>

      {/* Scrollable transcript panel — auto-opens when the agent's first turn completes */}
      <ConvoTextStream
        messageList={messageList}
        currentInProgressMessage={currentInProgressMessage}
        agentUID={agentUID}
        className="conversation-transcript"
      />
    </div>
  );
}
```

### Key uikit Components

| Component                 | Import                  | Description                                                                                          |
| ------------------------- | ----------------------- | ---------------------------------------------------------------------------------------------------- |
| `AgentVisualizer`         | `agora-agent-uikit`     | Agent-state-driven visualizer for not-joined, listening, analyzing, talking, and disconnected states |
| `ConvoTextStream`         | `agora-agent-uikit`     | Floating chat panel showing live and completed transcript turns                                      |
| `MicButtonWithVisualizer` | `agora-agent-uikit/rtc` | Mic button with built-in Web Audio visualization                                                     |
| `ConnectionStatusPanel`   | local component         | Compact status dot plus expandable RTM/agent issue panel                                             |

### Key toolkit Classes

| Export                                  | Description                                                                           |
| --------------------------------------- | ------------------------------------------------------------------------------------- |
| `AgoraVoiceAI`                          | Subscribes to RTM transcript events from the AI agent                                 |
| `AgoraVoiceAIEvents.TRANSCRIPT_UPDATED` | Fires whenever a transcript turn is created or updated                                |
| `TurnStatus`                            | `IN_PROGRESS`, `END`, `INTERRUPTED` — filters which turns to show as history vs. live |
| `TranscriptHelperMode.TEXT`             | Text-only rendering mode                                                              |

## Testing

Now that we have all the components in place, let's finish by testing the application.

### Starting the Development Server

To start the development server:

```bash
pnpm dev
```

> **Note:** Make sure your `.env.local` file is properly configured with all the necessary credentials. There is a complete list of environment variables at the end of this guide.

Open your browser to `http://localhost:3000` and test.

### Common Issues and Solutions

- **Agent not joining**:
  - Verify your Agora Conversational AI credentials
  - Check console for specific error messages
  - Ensure your TTS configuration is valid

- **Audio not working**:
  - Check browser permissions for microphone access
  - Verify the microphone is enabled in the app
  - Check if audio tracks are properly published

- **Transcripts not appearing**:
  - Confirm `enable_rtm: true` is set in the agent config
  - Check that the RTM client logged in successfully before `ConversationComponent` mounted
  - Verify the RTC + RTM token was generated with `buildTokenWithRtm`

- **Token errors**:
  - Verify App ID and App Certificate are correct
  - Ensure token renewal logic is working
  - Check for proper error handling in token-related functions

- **Channel connection issues**:
  - Check network connectivity
  - Verify Agora service status

## Customizations

Agora Conversational AI Engine supports a number of customizations.

### Customizing the Agent

In the invite-agent route, the `instructions` prop shapes how the AI agent responds. Modify the `ADA_PROMPT` constant to customize the agent's personality:

```typescript
// In app/api/invite-agent/route.ts
const ADA_PROMPT = `You are a friendly and helpful assistant named Alex. Your personality is warm, patient, and slightly humorous...`;
```

Update the `greeting` to control the initial message the agent speaks when joining the channel (or set `NEXT_AGENT_GREETING` in `.env.local`):

```typescript
const GREETING =
  process.env.NEXT_AGENT_GREETING ?? `Hello! How can I assist you today?`;
```

### Customizing the Voice

The default agent configuration uses **MiniMaxTTS** with `model: 'speech_2_6_turbo'` and `voiceId: 'English_captivating_female1'`. To use another vendor, replace `.withTts(...)` with the matching SDK type and, if needed, enable the optional BYOK environment variables for that provider.

### Fine-tuning Voice Activity Detection

Adjust `turnDetection` in the Agent config to optimize conversation flow:

```typescript
// In app/api/invite-agent/route.ts
turnDetection: {
  config: {
    speech_threshold: 0.6,          // Sensitivity to background noise (higher = less sensitive)
    start_of_speech: {
      mode: 'vad',
      vad_config: {
        interrupt_duration_ms: 200, // ms of speech before interruption triggers
        prefix_padding_ms: 400,     // audio captured before speech is detected
      },
    },
    end_of_speech: {
      mode: 'vad',
      vad_config: {
        silence_duration_ms: 600,   // ms of silence before turn ends
      },
    },
  },
},
```

## Complete Environment Variables Reference

Here's a complete list of environment variables for your `.env.local` file:

```
# Agora Configuration
NEXT_PUBLIC_AGORA_APP_ID=
NEXT_AGORA_APP_CERTIFICATE=
NEXT_PUBLIC_AGENT_UID=123456

# Optional BYOK examples
# NEXT_LLM_URL=https://api.openai.com/v1/chat/completions
# NEXT_LLM_API_KEY=
# NEXT_DEEPGRAM_API_KEY=
# NEXT_ELEVENLABS_API_KEY=
# NEXT_ELEVENLABS_VOICE_ID=
```

## Next Steps

Congratulations! You've built a full real-time conversational AI app with Next.js and Agora. The architecture you've built — with the `agora-agent-server-sdk` on the server and the `agora-agent-client-toolkit` + `agora-agent-uikit` on the client — gives you a solid foundation to customize the agent's personality, swap LLM/TTS providers, and scale to production.

For more information about [Agora's Conversational AI Engine](https://www.agora.io/en/products/conversational-ai-engine/) check out the [official documentation](https://docs.agora.io/en/).

Happy building!
