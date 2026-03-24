'use client';

import { useState, useMemo, useRef, Suspense, useEffect } from 'react';
import dynamic from 'next/dynamic';
import type { RTMClient } from 'agora-rtm';
import type {
  AgoraTokenData,
  ClientStartRequest,
  AgentResponse,
} from '../types/conversation';
import { ErrorBoundary } from './ErrorBoundary';
import { LoadingSkeleton } from './LoadingSkeleton';

// Dynamically import the ConversationComponent with ssr disabled
const ConversationComponent = dynamic(() => import('./ConversationComponent'), {
  ssr: false,
});

// Dynamically import AgoraRTCProvider (browser-only).
// ConversationalAIProvider is set up inside ConversationComponent, gated on
// joinSuccess, so it inits only after the RTC channel is joined.
const AgoraProvider = dynamic(
  async () => {
    const { AgoraRTCProvider, default: AgoraRTC } = await import('agora-rtc-react');
    return {
      default: function AgoraProviders({ children }: { children: React.ReactNode }) {
        // useRef persists across StrictMode's simulated unmount/remount, so only
        // one RTC client is ever created per session (useMemo creates two in StrictMode).
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
  // clicks "Try it now!" — eliminates the ~1.8s dynamic-import delay.
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
      // 1. Fetch RTC token + channel
      console.log('Fetching Agora token...');
      const agoraResponse = await fetch('/api/generate-agora-token');
      const responseData = await agoraResponse.json();
      console.log('Agora API response:', responseData);

      if (!agoraResponse.ok) {
        throw new Error(`Failed to generate Agora token: ${JSON.stringify(responseData)}`);
      }

      // 2. Run agent invite and RTM setup in parallel — both only need the token response.
      //    RTM must be ready before ConversationComponent mounts (ConversationalAI provider
      //    expects a fully-connected client). Agent invite is non-fatal.
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

        // 2b. Set up RTM (dynamically imported to keep it client-only)
        (async () => {
          const { default: AgoraRTM } = await import('agora-rtm');
          const rtm = new AgoraRTM.RTM(process.env.NEXT_PUBLIC_AGORA_APP_ID!, String(Date.now()));
          await rtm.login({ token: responseData.token });
          await rtm.subscribe(responseData.channel);
          console.log('RTM ready, channel:', responseData.channel);
          return rtm as RTMClient;
        })(),
      ]);

      // 3. All dependencies ready — store state and show conversation
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
        console.log('Stopping agent:', agoraData.agentId);
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
          <h1 className="text-4xl font-bold mb-6">
            Speak with Agent
          </h1>
          {!showConversation && (
            <p className="text-lg mb-14">
              Experience the power of <br className="sm:hidden" />Agora's Conversational AI Engine.
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
                aria-label={isLoading ? 'Starting conversation with AI agent' : 'Start conversation with AI agent'}
              >
                {isLoading ? 'Starting...' : 'Try it now!'}
              </button>
              {error && <p className="mt-4 text-destructive">{error}</p>}
            </>
          ) : agoraData && rtmClient ? (
            <>
              {agentJoinError && (
                <div className="mb-4 p-3 bg-destructive/20 rounded-lg text-destructive">
                  Failed to connect with AI agent. The conversation may not work
                  as expected.
                </div>
              )}
              <Suspense fallback={<LoadingSkeleton />}>
                <ErrorBoundary>
                  <AgoraProvider>
                    <ConversationComponent
                      agoraData={agoraData}
                      rtmClient={rtmClient}
                      onTokenWillExpire={handleTokenWillExpire}
                      onEndConversation={handleEndConversation}
                    />
                  </AgoraProvider>
                </ErrorBoundary>
              </Suspense>
            </>
          ) : (
            <p>Failed to load conversation data.</p>
          )}
        </div>
      </div>
      <footer className="fixed bottom-0 left-0 py-4 pl-4 md:py-6 md:pl-6 z-40">
        <div className="flex items-center justify-start space-x-2 text-gray-400">
          <span className="text-sm font-light uppercase">Powered by</span>
          <a
            href="https://agora.io/en/"
            target="_blank"
            rel="noopener noreferrer"
            className="hover:text-cyan-300 transition-colors"
            aria-label="Visit Agora's website"
          >
            <img
              src="/agora-logo-rgb-blue.svg"
              alt="Agora"
              className="h-6 w-auto hover:opacity-80 transition-opacity translate-y-1"
            />
            <span className="sr-only">Agora</span>
          </a>
        </div>
      </footer>
    </div>
  );
}
