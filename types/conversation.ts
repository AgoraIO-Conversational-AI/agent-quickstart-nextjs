import type { RTMClient } from 'agora-rtm';

export interface AgoraTokenData {
  appId: string;
  token: string;
  uid: string;
  channel: string;
  agentId?: string;
}

export interface ClientStartRequest {
  requester_id: string;
  channel_name: string;
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
