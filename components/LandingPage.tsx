'use client';

import { useState, useRef, Suspense, useEffect, useCallback } from 'react';
import dynamic from 'next/dynamic';
import { Check, ChevronDown, Loader2 } from 'lucide-react';
import type { RTMClient } from 'agora-rtm';
import type {
  AgoraTokenData,
  ClientStartRequest,
  AgentResponse,
  AgoraRenewalTokens,
} from '../types/conversation';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { XAI_VOICES, DEFAULT_XAI_VOICE_ID } from '@/lib/vendors/xai-voices';
import { ErrorBoundary } from './ErrorBoundary';
import { LoadingSkeleton } from './LoadingSkeleton';

// Dynamically import the ConversationComponent with ssr disabled
const ConversationComponent = dynamic(() => import('./ConversationComponent'), {
  ssr: false,
});

// Dynamically import AgoraRTCProvider (browser-only).
// The AgoraVoiceAI toolkit is initialized inside ConversationComponent after
// the RTC join succeeds, so this wrapper only needs to provide the RTC client.
const AgoraProvider = dynamic(
  async () => {
    const { AgoraRTCProvider, default: AgoraRTC } =
      await import('agora-rtc-react');
    return {
      default: function AgoraProviders({
        children,
      }: {
        children: React.ReactNode;
      }) {
        // useRef persists across StrictMode's simulated unmount/remount, so only
        // one RTC client is ever created per session (useMemo creates two in StrictMode).
        const clientRef = useRef<ReturnType<
          typeof AgoraRTC.createClient
        > | null>(null);
        if (!clientRef.current) {
          clientRef.current = AgoraRTC.createClient({
            mode: 'rtc',
            codec: 'vp8',
          });
        }
        return (
          <AgoraRTCProvider client={clientRef.current}>
            {children}
          </AgoraRTCProvider>
        );
      },
    };
  },
  { ssr: false },
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
  // Selected xAI voice for the pre-call screen. Persists across remounts via
  // local component state only — defaults to the documented xAI default.
  const [selectedVoiceId, setSelectedVoiceId] = useState<string>(
    DEFAULT_XAI_VOICE_ID,
  );
  const selectedVoice =
    XAI_VOICES.find((v) => v.id === selectedVoiceId) ?? XAI_VOICES[0];

  const handleStartConversation = async () => {
    setIsLoading(true);
    setError(null);
    setAgentJoinError(false);

    try {
      // 1. Fetch RTC token + channel
      // console.log('Fetching Agora token...');
      const agoraResponse = await fetch('/api/generate-agora-token');
      const responseData = await agoraResponse.json();
      // console.log('Agora token response: uid =', responseData.uid, 'channel =', responseData.channel);

      if (!agoraResponse.ok) {
        throw new Error(
          `Failed to generate Agora token: ${JSON.stringify(responseData)}`,
        );
      }

      // 2. Run agent invite and RTM setup in parallel — both only need the token response.
      //    RTM must be ready before ConversationComponent mounts so AgoraVoiceAI
      //    can subscribe immediately. Agent invite is non-fatal.
      const [agentData, rtm] = await Promise.all([
        // 2a. Start the AI agent
        fetch('/api/invite-agent', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            requester_id: responseData.uid,
            channel_name: responseData.channel,
            voice: selectedVoiceId,
          } as ClientStartRequest),
        })
          .then(async (res) => {
            if (!res.ok) {
              setAgentJoinError(true);
              return null;
            }
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
          const rtm: RTMClient = new AgoraRTM.RTM(
            responseData.appId,
            String(Date.now()),
          );
          await rtm.login({ token: responseData.token });
          await rtm.subscribe(responseData.channel);
          // console.log('RTM ready, channel:', responseData.channel);
          return rtm;
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

  const handleTokenWillExpire = useCallback(
    async (uid: string): Promise<AgoraRenewalTokens> => {
      try {
        const channel = agoraData?.channel;
        if (!channel) {
          throw new Error('Missing channel for token renewal');
        }

        // RTC and RTM tokens are renewed independently:
        //   - RTC uses the browser client's assigned UID (passed in from ConversationComponent).
        //   - RTM uses uid=0 because buildTokenWithRtm embeds RTM capability by AppID+channel,
        //     not by a specific RTM userId — so uid=0 is valid for any RTM client instance.
        // Both are fetched in parallel to stay within the token-expiry grace-period window.
        const [rtcResponse, rtmResponse] = await Promise.all([
          fetch(`/api/generate-agora-token?channel=${channel}&uid=${uid}`),
          fetch(`/api/generate-agora-token?channel=${channel}&uid=0`),
        ]);
        const [rtcData, rtmData] = await Promise.all([
          rtcResponse.json(),
          rtmResponse.json(),
        ]);

        if (!rtcResponse.ok || !rtmResponse.ok) {
          throw new Error('Failed to generate renewal tokens');
        }

        return {
          rtcToken: rtcData.token,
          rtmToken: rtmData.token,
        };
      } catch (error) {
        console.error('Error renewing token:', error);
        throw error;
      }
    },
    [agoraData],
  );

  const handleEndConversation = async () => {
    // Stop the AI agent
    if (agoraData?.agentId) {
      try {
        // console.log('Stopping agent:', agoraData.agentId);
        const response = await fetch('/api/stop-conversation', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ agent_id: agoraData.agentId }),
        });
        if (!response.ok) {
          console.error('Failed to stop agent:', await response.text());
        }
        // else console.log('Agent stopped successfully');
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
    <div className="min-h-screen flex flex-col bg-background text-foreground relative overflow-hidden">
      {/* Faint ambient gradient — provides depth signal on the pre-call screen */}
      <div
        className="absolute inset-0 pointer-events-none"
        aria-hidden="true"
        style={{
          background:
            'radial-gradient(ellipse 60% 40% at 50% 60%, hsl(194 100% 50% / 0.04) 0%, transparent 70%)',
        }}
      />

      {/* Hero shell: either shows the pre-call CTA or swaps in the live conversation experience. */}
      <div className="flex-1 flex flex-col items-center justify-center">
        <div className="z-10 text-center flex flex-col items-center gap-4">
          <h1 className="text-xl font-semibold animate-fade-up">
            Voice AI Quickstart
          </h1>

          {!showConversation && (
            <p className="text-sm text-muted-foreground animate-fade-up animate-fade-up-d1">
              Experience the power of <br className="sm:hidden" />
              Agora&apos;s Conversational AI Engine.
            </p>
          )}

          {!showConversation ? (
            <>
              {/* Voice picker: lets the user pick which xAI voice the agent
                  speaks with before the session starts. Disabled during
                  loading so the selection can't change mid-invite. */}
              <div className="flex flex-col items-center gap-1.5 animate-fade-up animate-fade-up-d2">
                <span className="text-xs font-medium tracking-wide uppercase text-muted-foreground">
                  Agent Voice
                </span>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      variant="ghost"
                      size="sm"
                      disabled={isLoading}
                      className="w-56 justify-between bg-secondary hover:bg-accent/10 border border-border text-foreground"
                      aria-label={`Agent voice: ${selectedVoice.label}`}
                    >
                      <span className="flex flex-col items-start leading-tight">
                        <span className="text-sm font-medium">
                          {selectedVoice.label}
                        </span>
                        <span className="text-xs text-muted-foreground">
                          {selectedVoice.description}
                        </span>
                      </span>
                      <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent
                    align="center"
                    className="w-56 bg-popover border-border"
                  >
                    <div className="px-2 py-1.5 text-xs font-medium text-muted-foreground">
                      xAI Voices
                    </div>
                    {XAI_VOICES.map((voice) => (
                      <DropdownMenuItem
                        key={voice.id}
                        onClick={() => setSelectedVoiceId(voice.id)}
                        className={`cursor-pointer ${
                          voice.id === selectedVoiceId
                            ? 'bg-accent/15 text-primary'
                            : 'text-foreground hover:bg-accent/10'
                        }`}
                      >
                        <span className="flex flex-col leading-tight">
                          <span className="text-sm font-medium">
                            {voice.label}
                          </span>
                          <span className="text-xs text-muted-foreground">
                            {voice.description}
                          </span>
                        </span>
                        {voice.id === selectedVoiceId && (
                          <Check className="ml-auto h-3.5 w-3.5 text-primary" />
                        )}
                      </DropdownMenuItem>
                    ))}
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>

              {/* Entry CTA: starts token fetch, agent invite, and RTM setup for a new session. */}
              <Button
                onClick={handleStartConversation}
                disabled={isLoading}
                className="w-56 animate-fade-up animate-fade-up-d3 border-2 border-primary bg-primary text-primary-foreground hover:bg-transparent hover:text-primary disabled:hover:bg-primary disabled:hover:text-primary-foreground"
                aria-label={
                  isLoading
                    ? 'Starting conversation with AI agent'
                    : 'Start conversation with AI agent'
                }
              >
                {isLoading ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Starting...
                  </>
                ) : (
                  'Try it now!'
                )}
              </Button>
              {error && <p className="text-xs text-destructive">{error}</p>}
            </>
          ) : agoraData && rtmClient ? (
            <>
              {/* Non-fatal invite warning: the browser session can still render even if agent start failed. */}
              {agentJoinError && (
                <div className="p-3 bg-destructive/10 rounded-md text-destructive text-sm max-w-sm">
                  Failed to connect with AI agent. The conversation may not work
                  as expected.
                </div>
              )}
              {/* Browser-only conversation mount: RTC provider, error boundary, and lazy-loaded call UI. */}
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
            /* Fallback if session bootstrap partially succeeded but required state is missing. */
            <p className="text-sm text-muted-foreground">
              Failed to load conversation data.
            </p>
          )}
        </div>
      </div>

      {/* Persistent attribution footer for the pre-call and in-call views. */}
      <footer className="fixed bottom-0 left-0 py-4 pl-4 md:py-6 md:pl-6 z-40">
        <div className="flex items-center justify-start gap-2 text-muted-foreground">
          <span className="text-xs font-medium tracking-wide uppercase">
            Powered by
          </span>
          <a
            href="https://agora.io/en/"
            target="_blank"
            rel="noopener noreferrer"
            className="hover:text-primary transition-colors"
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
