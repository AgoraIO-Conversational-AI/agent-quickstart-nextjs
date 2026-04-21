import { NextRequest, NextResponse } from 'next/server';
import { RtcTokenBuilder, RtcRole } from 'agora-token';
import { getEnv } from '@/lib/load-env';

const EXPIRATION_TIME_IN_SECONDS = 3600;

function generateChannelName(): string {
  const timestamp = Date.now();
  const random = Math.random().toString(36).substring(2, 8);
  return `ai-conversation-${timestamp}-${random}`;
}

export async function GET(request: NextRequest) {
  // console.log('Generating Agora token...');
  const APP_ID = getEnv('NEXT_PUBLIC_AGORA_APP_ID');
  const APP_CERTIFICATE = getEnv('NEXT_AGORA_APP_CERTIFICATE');

  if (!APP_ID || !APP_CERTIFICATE) {
    return NextResponse.json(
      { error: 'Agora credentials are not set' },
      { status: 500 }
    );
  }

  const { searchParams } = new URL(request.url);
  const uidStr = searchParams.get('uid') || '0';
  const parsedUid = parseInt(uidStr, 10);
  const uid = isNaN(parsedUid) ? 0 : parsedUid;
  const channelName = searchParams.get('channel') || generateChannelName();

  const expirationTime =
    Math.floor(Date.now() / 1000) + EXPIRATION_TIME_IN_SECONDS;

  try {
    // console.log('Building RTC+RTM token: uid =', uid, 'channel =', channelName);
    const token = RtcTokenBuilder.buildTokenWithRtm(
      APP_ID,
      APP_CERTIFICATE,
      channelName,
      uid,
      RtcRole.PUBLISHER,
      expirationTime,
      expirationTime
    );
    // console.log('Token generated successfully (RTC + RTM)');

    return NextResponse.json({
      // Surface the App ID to the client so the browser uses whatever value
      // the server actually resolved (via lib/load-env.ts) — this avoids a
      // stale `NEXT_PUBLIC_AGORA_APP_ID` being inlined into the dev bundle.
      appId: APP_ID,
      token,
      uid: uid.toString(),
      channel: channelName,
    });
  } catch (error) {
    console.error('Error generating Agora token:', error);
    return NextResponse.json(
      {
        error: 'Failed to generate Agora token',
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  }
}
