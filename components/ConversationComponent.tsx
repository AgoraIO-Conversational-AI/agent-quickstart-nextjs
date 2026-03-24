'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { setParameter } from 'agora-rtc-sdk-ng/esm';
import type { IAgoraRTCClient } from 'agora-rtc-sdk-ng';
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
import {
  AgoraVoiceAI,
  AgoraVoiceAIEvents,
  AgentState,
  TurnStatus,
  TranscriptHelperMode,
  type TranscriptHelperItem,
  type UserTranscription,
  type AgentTranscription,
} from 'agora-agent-client-toolkit';
import {
  AudioVisualizer,
  ConvoTextStream,
  transcriptToMessageList,
} from 'agora-agent-uikit';
import { MicButtonWithVisualizer } from 'agora-agent-uikit/rtc';
import { MicrophoneSelector } from './MicrophoneSelector';
import type { ConversationComponentProps } from '@/types/conversation';

export default function ConversationComponent({
  agoraData,
  rtmClient,
  onTokenWillExpire,
  onEndConversation,
}: ConversationComponentProps) {
  const client = useRTCClient();
  const isConnected = useIsConnected();
  const remoteUsers = useRemoteUsers();
  const [isEnabled, setIsEnabled] = useState(true);
  const [isAgentConnected, setIsAgentConnected] = useState(false);
  const agentUID = process.env.NEXT_PUBLIC_AGENT_UID;
  const [joinedUID, setJoinedUID] = useState<UID>(0);

  // Transcript + agent state — managed with raw AgoraVoiceAI (see effect below).
  const [rawTranscript, setRawTranscript] = useState<
    TranscriptHelperItem<Partial<UserTranscription | AgentTranscription>>[]
  >([]);
  const [agentState, setAgentState] = useState<AgentState | null>(null);

  // StrictMode guard: delay `useJoin`'s ready flag until after the fake-unmount
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

  // Create mic track only after the StrictMode fake-unmount cycle completes (isReady).
  // Passing `true` here creates two tracks in StrictMode — the first publishes, then
  // StrictMode cleanup closes it and the second takes over, causing a ~3s audio gap.
  // isReady uses the same setTimeout(fn,0) pattern as useJoin: StrictMode cleanup fires
  // synchronously before the timeout, so only the real second mount's timer fires.
  // Do NOT pass `isEnabled` — that ties track lifetime to mute state and breaks the Web Audio
  // graph inside MicButtonWithVisualizer. Mute uses track.setEnabled() only.
  const { localMicrophoneTrack } = useLocalMicrophoneTrack(isReady);

  useEffect(() => {
    if (!agentUID) {
      console.warn('NEXT_AGENT_UID environment variable is not set');
    } else {
      console.log('Agent UID is set to:', agentUID);
    }
  }, [agentUID]);

  // ENABLE_AUDIO_PTS is a module-level SDK parameter (not on the client instance).
  // It must be set before publishing audio for transcript timing to be accurate.
  useEffect(() => {
    if (!client) return;
    try {
      setParameter('ENABLE_AUDIO_PTS', true);
      console.log('Enabled ENABLE_AUDIO_PTS for timing synchronization');
    } catch (error) {
      console.warn('Could not set ENABLE_AUDIO_PTS:', error);
    }
  }, [client]);

  // Track the auto-assigned RTC UID for token renewal and agent invite.
  useEffect(() => {
    if (joinSuccess && client) {
      const uid = client.uid;
      setJoinedUID(uid as UID);
      console.log('Join successful, using UID:', uid);
    }
  }, [joinSuccess, client]);

  // Initialize AgoraVoiceAI once the channel is joined.
  //
  // Gating on `isReady && joinSuccess` is critical for StrictMode safety:
  //   - `isReady` ensures we are past the initial fake-unmount cycle, so this
  //     effect only runs on the real mount (not the discarded fake one).
  //   - Once `isReady` is true, React does NOT double-invoke this effect for
  //     subsequent state changes (`joinSuccess` becoming true). That means
  //     AgoraVoiceAI.init() is called exactly once, avoiding the singleton
  //     race condition that occurs when ConversationalAIProvider (React toolkit)
  //     is double-mounted by StrictMode.
  useEffect(() => {
    if (!isReady || !joinSuccess) return;

    let cancelled = false;

    (async () => {
      try {
        const ai = await AgoraVoiceAI.init({
          rtcEngine: client as unknown as IAgoraRTCClient,
          rtmConfig: { rtmEngine: rtmClient },
          renderMode: TranscriptHelperMode.TEXT,
          enableLog: true,
        });

        if (cancelled) {
          try {
            if (AgoraVoiceAI.getInstance() === ai) {
              ai.unsubscribe();
              ai.destroy();
            }
          } catch {}
          return;
        }

        ai.on(AgoraVoiceAIEvents.TRANSCRIPT_UPDATED, (t) => {
          setRawTranscript([...t]);
        });
        ai.on(AgoraVoiceAIEvents.AGENT_STATE_CHANGED, (_, event) =>
          setAgentState(event.state)
        );
        ai.subscribeMessage(agoraData.channel);
        console.log('AgoraVoiceAI initialized and subscribed to channel');
      } catch (error) {
        if (!cancelled) {
          console.error('[AgoraVoiceAI] init failed:', error);
        }
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
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isReady, joinSuccess]);

  // useTranscript() returns uid="0" for local user speech — remap to actual RTC UID
  // so ConvoTextStream renders user messages on the correct side.
  const transcript = useMemo(() => {
    const localUID = String(client.uid);
    return rawTranscript.map((m) => (m.uid === '0' ? { ...m, uid: localUID } : m));
  }, [rawTranscript, client.uid]);

  // Completed (END + INTERRUPTED) messages shown as history.
  // INTERRUPTED must be included — if the agent's first turn is cut off,
  // messageList stays empty and ConvoTextStream never auto-opens.
  const messageList = useMemo(
    () =>
      transcriptToMessageList(
        transcript.filter((m) => m.status !== TurnStatus.IN_PROGRESS)
      ),
    [transcript]
  );

  const currentInProgressMessage = useMemo(() => {
    const m = transcript.find((x) => x.status === TurnStatus.IN_PROGRESS);
    return m ? transcriptToMessageList([m])[0] ?? null : null;
  }, [transcript]);

  // Publish local mic once the track exists; usePublish waits for RTC connection.
  usePublish([localMicrophoneTrack]);

  useClientEvent(client, 'user-joined', (user) => {
    console.log('Remote user joined:', user.uid);
    if (user.uid.toString() === agentUID) setIsAgentConnected(true);
  });

  useClientEvent(client, 'user-left', (user) => {
    console.log('Remote user left:', user.uid);
    if (user.uid.toString() === agentUID) setIsAgentConnected(false);
  });

  // Sync isAgentConnected with remoteUsers (covers cases where user-joined/left are missed)
  useEffect(() => {
    const isAgentInRemoteUsers = remoteUsers.some(
      (user) => user.uid.toString() === agentUID
    );
    setIsAgentConnected(isAgentInRemoteUsers);
  }, [remoteUsers, agentUID]);

  useClientEvent(client, 'connection-state-change', (curState, prevState) => {
    console.log(`Connection state changed from ${prevState} to ${curState}`);
    if (curState === 'DISCONNECTED') console.log('Attempting to reconnect...');
  });

  /**
   * Mute/unmute via track.setEnabled() only — usePublish owns publish state.
   * If we also unpublish in the toggle, usePublish and the button fight each other
   * and break the MicButtonWithVisualizer Web Audio graph.
   */
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
      const newToken = await onTokenWillExpire(joinedUID.toString());
      await client?.renewToken(newToken);
      await rtmClient.renewToken(newToken);
      console.log('Successfully renewed Agora RTC and RTM tokens');
    } catch (error) {
      console.error('Failed to renew Agora token:', error);
    }
  }, [client, onTokenWillExpire, joinedUID, rtmClient]);

  useClientEvent(client, 'token-privilege-will-expire', handleTokenWillExpire);

  // Debug: log remote UIDs vs NEXT_PUBLIC_AGENT_UID to catch mismatches
  useEffect(() => {
    if (remoteUsers.length > 0) {
      console.log('Remote users detected:', remoteUsers.map((u) => u.uid));
      console.log('Current NEXT_AGENT_UID:', agentUID);

      const potentialAgents = remoteUsers.map((u) => u.uid.toString());
      if (agentUID && !potentialAgents.includes(agentUID)) {
        console.warn('Agent UID mismatch! Expected:', agentUID, 'Available users:', potentialAgents);
        console.info(`Consider updating NEXT_AGENT_UID to one of: ${potentialAgents.join(', ')}`);
      }
    }
  }, [remoteUsers, agentUID]);

  return (
    <div className="flex flex-col gap-6 p-4 h-full">
      {/* Connection status + end call */}
      <div className="absolute top-4 right-4 flex items-center gap-2">
        <button
          onClick={onEndConversation}
          className="px-4 py-2 bg-transparent text-red-500 rounded-full border border-red-500 backdrop-blur-sm
          hover:bg-red-500 hover:text-black transition-all duration-300 shadow-lg hover:shadow-red-500/20 text-sm font-medium"
        >
          End Conversation
        </button>
        <div
          className={`w-3 h-3 rounded-full ${isConnected ? 'bg-green-500' : 'bg-red-500'}`}
        />
      </div>

      {/* Remote users (agent audio + RTC subscription)
          Fixed h-40 matches AudioVisualizer's height so the layout doesn't
          shift when the agent joins or leaves. */}
      <div className="relative h-40 w-full flex items-center justify-center">
        {remoteUsers.map((user) => (
          <div key={user.uid} className="w-full">
            <AudioVisualizer track={user.audioTrack} />
            <RemoteUser user={user} />
          </div>
        ))}
        {remoteUsers.length === 0 && (
          <div className="text-center text-gray-500">
            Waiting for AI agent to join...
          </div>
        )}
      </div>

      {/* Agent state — shown below the visualizer once the agent joins */}
      <div className="text-center text-gray-400 text-sm capitalize h-4">
        {isAgentConnected && agentState ? agentState : null}
      </div>

      {/* Local controls */}
      <div className="fixed bottom-14 md:bottom-8 left-1/2 -translate-x-1/2 flex items-center gap-3">
        <div className="conversation-mic-host flex items-center justify-center">
          <MicButtonWithVisualizer
            isEnabled={isEnabled}
            setIsEnabled={setIsEnabled}
            track={localMicrophoneTrack}
            onToggle={handleMicToggle}
            className="overflow-visible"
          />
        </div>
        <MicrophoneSelector localMicrophoneTrack={localMicrophoneTrack} />
      </div>

      <ConvoTextStream
        messageList={messageList}
        currentInProgressMessage={currentInProgressMessage}
        agentUID={agentUID}
      />
    </div>
  );
}
