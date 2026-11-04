import { NextResponse } from 'next/server';
import { AgoraClient, Area, V3Error } from 'agora-agents';
import { StopConversationRequest } from '@/types/conversation';

function isSessionAlreadyStoppingOrStopped(error: unknown): boolean {
  if (!(error instanceof V3Error)) return false;
  // 404 TaskNotFound: the session is gone.
  if (error.statusCode === 404) return true;
  // 409 TaskNotRunning / TaskConflict: the session already stopped or is stopping.
  const reason =
    error.body && typeof error.body === 'object' && 'reason' in error.body
      ? (error.body as { reason?: unknown }).reason
      : undefined;
  return error.statusCode === 409 && (reason === 'TaskNotRunning' || reason === 'TaskConflict');
}

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

    const appId = process.env.NEXT_PUBLIC_AGORA_APP_ID;
    const appCertificate = process.env.NEXT_AGORA_APP_CERTIFICATE;
    if (!appId || !appCertificate) {
      throw new Error(
        'Missing Agora configuration. Set NEXT_PUBLIC_AGORA_APP_ID and NEXT_AGORA_APP_CERTIFICATE.',
      );
    }

    // The v3 preview session API is only available in Area.US.
    const client = new AgoraClient({
      area: Area.US,
      appId,
      appCertificate,
    });
    try {
      // agent_id carries the session ID returned by /api/invite-agent.
      await client.v3.sessions.stop({ agentSessionId: agent_id });
    } catch (error) {
      if (isSessionAlreadyStoppingOrStopped(error)) {
        // Treat stop as idempotent: agent is already exiting (or gone).
        return NextResponse.json({ success: true, state: 'already-stopping' });
      }
      throw error;
    }

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
