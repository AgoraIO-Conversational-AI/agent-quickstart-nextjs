import { inflateSync } from 'node:zlib';
import { AgoraClient, Agent, Area, V3Error } from 'agora-agents';
import { NextRequest } from 'next/server';

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

// Read the service list from an AccessToken2 ("007") token: service type → account.
// RTC = 1, RTM = 2, ConvoAI = 9. Client tokens must carry RTC and RTM only.
function decodeTokenServices(token: string): Map<number, string> {
  assert(token.startsWith('007'), 'token should be an AccessToken2 token');
  const bytes = inflateSync(Buffer.from(token.slice(3), 'base64'));
  let offset = 0;
  const u16 = () => {
    const n = bytes.readUInt16LE(offset);
    offset += 2;
    return n;
  };
  const str = () => {
    const n = u16();
    offset += n;
    return bytes.subarray(offset - n, offset).toString();
  };
  str(); // signature
  str(); // app ID
  offset += 12; // issued, expiry, salt
  const services = new Map<number, string>();
  for (let count = u16(); count > 0; count--) {
    const type = u16();
    for (let privileges = u16(); privileges > 0; privileges--) offset += 6;
    if (type === 1) str(); // channel
    services.set(type, type === 1 || type === 2 ? str() : '');
  }
  return services;
}

function getJson(response: Response) {
  return response.json() as Promise<Record<string, unknown>>;
}

process.env.NEXT_PUBLIC_AGORA_APP_ID = '0123456789abcdef0123456789abcdef';
process.env.NEXT_AGORA_APP_CERTIFICATE = 'fedcba9876543210fedcba9876543210';

async function verifyGenerateAgoraTokenRoute() {
  const { GET: generateAgoraToken } =
    await import('../app/api/generate-agora-token/route');
  const request = new NextRequest(
    'http://localhost:3000/api/generate-agora-token?uid=4321&channel=test-channel',
  );
  const response = await generateAgoraToken(request);
  const body = await getJson(response);

  assert(
    response.status === 200,
    'GET /api/generate-agora-token should return 200',
  );
  assert(
    body.uid === '4321',
    'GET /api/generate-agora-token should preserve the requested uid',
  );
  assert(
    body.channel === 'test-channel',
    'GET /api/generate-agora-token should preserve the requested channel',
  );
  const services = decodeTokenServices(body.token as string);
  assert(
    JSON.stringify([...services.keys()].sort()) === JSON.stringify([1, 2]),
    'GET /api/generate-agora-token should return an RTC + RTM token with no ConvoAI service',
  );
  assert(
    services.get(1) === '4321' && services.get(2) === '4321',
    'GET /api/generate-agora-token should sign RTC and RTM for the requested uid',
  );
}

async function verifyGenerateAgoraTokenReplacesZeroUid() {
  const { GET: generateAgoraToken } =
    await import('../app/api/generate-agora-token/route');
  const request = new NextRequest(
    'http://localhost:3000/api/generate-agora-token?uid=0&channel=test-channel',
  );
  const response = await generateAgoraToken(request);
  const body = await getJson(response);

  assert(
    response.status === 200,
    'GET /api/generate-agora-token?uid=0 should return 200',
  );
  assert(
    typeof body.uid === 'string' && body.uid !== '0',
    'GET /api/generate-agora-token?uid=0 should generate an RTM-safe uid',
  );
  assert(
    decodeTokenServices(body.token as string).get(2) === body.uid,
    'GET /api/generate-agora-token should mint the token for the generated uid',
  );
}

async function verifyChatCompletionsMissingEnv() {
  const { createChatCompletionsHandler } =
    await import('../lib/chat-completions');
  const originalApiKey = process.env.NEXT_LLM_API_KEY;
  const originalUrl = process.env.NEXT_LLM_URL;

  delete process.env.NEXT_LLM_API_KEY;
  delete process.env.NEXT_LLM_URL;

  const handler = createChatCompletionsHandler({
    createOpenAIClient: (() => {
      throw new Error('createOpenAI should not be called when env is missing');
    }) as never,
    streamTextImpl: (() => {
      throw new Error('streamText should not be called when env is missing');
    }) as never,
  });

  try {
    const request = new NextRequest(
      'http://localhost:3000/api/chat/completions',
      {
        body: JSON.stringify({ messages: [] }),
        method: 'POST',
      },
    );
    const response = await handler(request);
    const body = await getJson(response);

    assert(
      response.status === 500,
      'POST /api/chat/completions should reject missing LLM env',
    );
    assert(
      body.error === 'NEXT_LLM_API_KEY and NEXT_LLM_URL must be set',
      'POST /api/chat/completions should explain missing LLM env',
    );
  } finally {
    if (originalApiKey === undefined) {
      delete process.env.NEXT_LLM_API_KEY;
    } else {
      process.env.NEXT_LLM_API_KEY = originalApiKey;
    }
    if (originalUrl === undefined) {
      delete process.env.NEXT_LLM_URL;
    } else {
      process.env.NEXT_LLM_URL = originalUrl;
    }
  }
}

async function verifyChatCompletionsInvalidJson() {
  const { createChatCompletionsHandler } =
    await import('../lib/chat-completions');
  const originalApiKey = process.env.NEXT_LLM_API_KEY;
  const originalUrl = process.env.NEXT_LLM_URL;
  process.env.NEXT_LLM_API_KEY = 'test-key';
  process.env.NEXT_LLM_URL = 'https://example.test/v1/chat/completions';

  const handler = createChatCompletionsHandler({
    createOpenAIClient: (() => {
      throw new Error('createOpenAI should not be called for invalid JSON');
    }) as never,
    streamTextImpl: (() => {
      throw new Error('streamText should not be called for invalid JSON');
    }) as never,
  });

  try {
    const request = new NextRequest(
      'http://localhost:3000/api/chat/completions',
      {
        body: '{not json',
        method: 'POST',
      },
    );
    const response = await handler(request);
    const body = await getJson(response);

    assert(
      response.status === 400,
      'POST /api/chat/completions should reject invalid JSON',
    );
    assert(
      body.error === 'Invalid JSON body',
      'POST /api/chat/completions should explain invalid JSON',
    );
  } finally {
    if (originalApiKey === undefined) {
      delete process.env.NEXT_LLM_API_KEY;
    } else {
      process.env.NEXT_LLM_API_KEY = originalApiKey;
    }
    if (originalUrl === undefined) {
      delete process.env.NEXT_LLM_URL;
    } else {
      process.env.NEXT_LLM_URL = originalUrl;
    }
  }
}

async function verifyChatCompletionsSseDone() {
  const { createChatCompletionsHandler } =
    await import('../lib/chat-completions');
  const originalApiKey = process.env.NEXT_LLM_API_KEY;
  const originalUrl = process.env.NEXT_LLM_URL;
  process.env.NEXT_LLM_API_KEY = 'test-key';
  process.env.NEXT_LLM_URL = 'https://example.test/v1/chat/completions';

  let capturedBaseUrl: string | undefined;
  let capturedModelId: string | undefined;
  let capturedMessages: unknown;

  const handler = createChatCompletionsHandler({
    createOpenAIClient: ((options: { baseURL?: string }) => {
      capturedBaseUrl = options.baseURL;
      return (modelId: string) => {
        capturedModelId = modelId;
        return { modelId };
      };
    }) as never,
    streamTextImpl: ((options: { messages?: unknown }) => {
      capturedMessages = options.messages;
      return {
        textStream: (async function* () {
          yield 'hello';
          yield ' world';
        })(),
      };
    }) as never,
  });

  try {
    const request = new NextRequest(
      'http://localhost:3000/api/chat/completions',
      {
        body: JSON.stringify({
          model: 'caller-model-ignored-for-routing',
          messages: [{ role: 'user', content: 'Hi' }],
        }),
        method: 'POST',
      },
    );
    const response = await handler(request);
    const text = await response.text();

    assert(
      response.status === 200,
      'POST /api/chat/completions should return 200 for a valid request',
    );
    assert(
      response.headers.get('content-type') === 'text/event-stream',
      'POST /api/chat/completions should return SSE content type',
    );
    assert(
      capturedBaseUrl === 'https://example.test/v1',
      'POST /api/chat/completions should pass base URL without /chat/completions',
    );
    assert(
      capturedModelId === 'gpt-4o',
      'POST /api/chat/completions should route to the pinned server model',
    );
    assert(
      JSON.stringify(capturedMessages) ===
        JSON.stringify([{ role: 'user', content: 'Hi' }]),
      'POST /api/chat/completions should pass request messages to streamText',
    );
    assert(
      text.includes('data: [DONE]'),
      'POST /api/chat/completions should terminate with [DONE]',
    );
    assert(
      text.includes('"content":"hello"') && text.includes('"content":" world"'),
      'POST /api/chat/completions should stream text chunks as OpenAI-compatible deltas',
    );
  } finally {
    if (originalApiKey === undefined) {
      delete process.env.NEXT_LLM_API_KEY;
    } else {
      process.env.NEXT_LLM_API_KEY = originalApiKey;
    }
    if (originalUrl === undefined) {
      delete process.env.NEXT_LLM_URL;
    } else {
      process.env.NEXT_LLM_URL = originalUrl;
    }
  }
}

async function verifyInviteAgentValidation() {
  const { POST: inviteAgent } = await import('../app/api/invite-agent/route');
  const request = new NextRequest('http://localhost:3000/api/invite-agent', {
    body: JSON.stringify({ channel_name: 'missing-requester' }),
    method: 'POST',
  });
  const response = await inviteAgent(request);
  const body = await getJson(response);

  assert(
    response.status === 400,
    'POST /api/invite-agent should reject missing fields',
  );
  assert(
    body.error === 'channel_name and requester_id are required',
    'POST /api/invite-agent should explain validation failure',
  );
}

async function verifyInviteAgentSuccess() {
  const { POST: inviteAgent } = await import('../app/api/invite-agent/route');
  const originalCreateEphemeralSession = Agent.prototype.createEphemeralSession;
  type CapturedSessionConfig = {
    channel?: string;
    agentUid?: string;
    remoteUids?: string[];
    audioScenario?: string;
  };
  let capturedSessionConfig: CapturedSessionConfig | null = null;
  let capturedAgent: Agent | null = null;

  Agent.prototype.createEphemeralSession = function (
    this: Agent,
    sessionConfig: unknown,
  ) {
    capturedAgent = this;
    capturedSessionConfig = sessionConfig as CapturedSessionConfig;
    return {
      start: async () => 'mock-session-id',
    };
  } as unknown as typeof Agent.prototype.createEphemeralSession;

  try {
    const request = new NextRequest('http://localhost:3000/api/invite-agent', {
      body: JSON.stringify({
        requester_id: 'user-4321',
        channel_name: 'test-channel',
      }),
      method: 'POST',
    });
    const response = await inviteAgent(request);
    const body = await getJson(response);

    assert(
      response.status === 200,
      'POST /api/invite-agent should return 200 on success',
    );
    assert(
      body.agent_id === 'mock-session-id',
      'POST /api/invite-agent should return the started session id',
    );
    assert(
      body.state === 'RUNNING',
      'POST /api/invite-agent should return RUNNING state',
    );
    assert(
      capturedSessionConfig !== null,
      'POST /api/invite-agent should call createEphemeralSession',
    );
    const sessionConfig = capturedSessionConfig as CapturedSessionConfig;

    assert(
      sessionConfig.channel === 'test-channel',
      'POST /api/invite-agent should pass the requested channel to createEphemeralSession',
    );
    assert(
      sessionConfig.agentUid === '123456',
      'POST /api/invite-agent should use the shared default agent UID',
    );
    assert(
      JSON.stringify(sessionConfig.remoteUids) ===
        JSON.stringify(['user-4321']),
      'POST /api/invite-agent should scope the session to the requesting user',
    );
    assert(
      sessionConfig.audioScenario === 'chorus',
      'POST /api/invite-agent should request the chorus audio scenario',
    );
    // v3 rejects legacy RTM/data-channel switches; the agent config must not carry them.
    const agentConfig = (capturedAgent as Agent | null)?.config;
    assert(
      agentConfig?.advancedFeatures === undefined &&
        agentConfig?.parameters === undefined,
      'POST /api/invite-agent should not set advancedFeatures or parameters',
    );
  } finally {
    Agent.prototype.createEphemeralSession = originalCreateEphemeralSession;
  }
}

async function verifyStopConversationValidation() {
  const { POST: stopConversation } =
    await import('../app/api/stop-conversation/route');
  const request = new NextRequest(
    'http://localhost:3000/api/stop-conversation',
    {
      body: JSON.stringify({}),
      method: 'POST',
    },
  );
  const response = await stopConversation(request);
  const body = await getJson(response);

  assert(
    response.status === 400,
    'POST /api/stop-conversation should reject missing agent_id',
  );
  assert(
    body.error === 'agent_id is required',
    'POST /api/stop-conversation should explain validation failure',
  );
}

type SessionsApi = AgoraClient['v3']['sessions'];

async function withMockedSessionStop(
  stop: (request: { agentSessionId: string }) => Promise<unknown>,
  run: () => Promise<void>,
) {
  const sessionsPrototype = Object.getPrototypeOf(
    new AgoraClient({ area: Area.US, appId: 'x', appCertificate: 'y' }).v3.sessions,
  ) as SessionsApi;
  const originalStop = sessionsPrototype.stop;
  sessionsPrototype.stop = stop as SessionsApi['stop'];
  try {
    await run();
  } finally {
    sessionsPrototype.stop = originalStop;
  }
}

function stopRequest(agentId: string) {
  return new NextRequest('http://localhost:3000/api/stop-conversation', {
    body: JSON.stringify({ agent_id: agentId }),
    method: 'POST',
  });
}

async function verifyStopConversationSuccess() {
  const { POST: stopConversation } =
    await import('../app/api/stop-conversation/route');
  let stoppedSessionId: string | null = null;

  await withMockedSessionStop(
    async ({ agentSessionId }) => {
      stoppedSessionId = agentSessionId;
      return {};
    },
    async () => {
      const response = await stopConversation(stopRequest('mock-session-id'));
      const body = await getJson(response);

      assert(
        response.status === 200,
        'POST /api/stop-conversation should return 200 on success',
      );
      assert(
        body.success === true,
        'POST /api/stop-conversation should return success',
      );
      assert(
        stoppedSessionId === 'mock-session-id',
        'POST /api/stop-conversation should stop the requested session id',
      );
    },
  );
}

async function verifyStopConversationAlreadyStopped() {
  const { POST: stopConversation } =
    await import('../app/api/stop-conversation/route');
  const notRunning = new V3Error(
    409,
    { reason: 'TaskNotRunning' },
    { headers: new Headers() } as unknown as ConstructorParameters<
      typeof V3Error
    >[2],
  );

  await withMockedSessionStop(
    async () => {
      throw notRunning;
    },
    async () => {
      const response = await stopConversation(stopRequest('mock-session-id'));
      const body = await getJson(response);

      assert(
        response.status === 200 && body.state === 'already-stopping',
        'POST /api/stop-conversation should treat a stopped session as success',
      );
    },
  );
}

async function main() {
  await verifyGenerateAgoraTokenRoute();
  await verifyGenerateAgoraTokenReplacesZeroUid();
  await verifyChatCompletionsMissingEnv();
  await verifyChatCompletionsInvalidJson();
  await verifyChatCompletionsSseDone();
  await verifyInviteAgentValidation();
  await verifyInviteAgentSuccess();
  await verifyStopConversationValidation();
  await verifyStopConversationSuccess();
  await verifyStopConversationAlreadyStopped();

  console.log('API contract checks passed');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
