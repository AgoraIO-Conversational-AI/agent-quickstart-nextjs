import type { RTMClient } from 'agora-rtm';

export interface AgoraTokenData {
  appId: string;
  /** RTC UID the cloud agent will join with — must match what the server told Agora. */
  agentUid: string;
  token: string;
  uid: string;
  channel: string;
  agentId?: string;
}

export interface ClientStartRequest {
  requester_id: string;
  channel_name: string;
  /** Optional xAI voice id selected by the user (`eve`, `ara`, `rex`, `sal`, `leo`). */
  voice?: string;
}

export interface StopConversationRequest {
  agent_id: string;
}

export interface AgentResponse {
  agent_id: string;
  create_ts: number;
  state: string;
}

export interface AgoraRenewalTokens {
  rtcToken: string;
  rtmToken: string;
}

export interface ConversationComponentProps {
  agoraData: AgoraTokenData;
  rtmClient: RTMClient;
  onTokenWillExpire: (uid: string) => Promise<AgoraRenewalTokens>;
  onEndConversation: () => void;
}
