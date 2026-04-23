# Agora Conversational AI — xAI MLLM Request Reference

This document explains how the app builds a request to Agora's Conversational
AI service when starting a session backed by xAI's Realtime MLLM, and what
the final REST call on the wire looks like.

---

## The core problem: xAI isn't a built-in SDK vendor

The `agora-agent-server-sdk` package ships built-in MLLM vendors for OpenAI
Realtime, Gemini Live, and Vertex AI. It does **not** ship one for xAI. But
Agora's backend already accepts `vendor: "xai"` in the `mllm` block of a
start-agent request — so we add it ourselves by subclassing the SDK's public
`BaseMLLM` class.

That subclass is `lib/vendors/xai-mllm.ts`. Its single job is to turn a
typed TypeScript options object into the JSON shape Agora expects for
`mllm.vendor = "xai"`.

---

## How we compile the request

The request is assembled in three layers, each of which produces a fragment
of the final JSON body.

### 1. `lib/vendors/xai-mllm.ts` — produces the `mllm` block

We instantiate `XAI` with ergonomic TypeScript options. Its `toConfig()`
method (called by the SDK) returns a plain object shaped like Agora's
`mllm` schema:

```ts
new XAI({
  apiKey: xaiApiKey,
  messages: [{ role: 'system', content: instructions }],
  voice,                                // "eve" | "ara" | "rex" | "sal" | "leo"
  language: 'en',
  sampleRate: 24000,
  outputModalities: ['text', 'audio'],
  greetingMessage: greeting,
  turnDetection: {
    mode: 'server_vad',
    serverVadConfig: {
      threshold: 0.5,
      prefixPaddingMs: 300,
      silenceDurationMs: 200,
    },
  },
});
```

`toConfig()` performs three transformations:

- Renames camelCase options to the snake_case fields Agora's API uses
  (`sampleRate` → `sample_rate`, `outputModalities` → `output_modalities`,
  `prefixPaddingMs` → `prefix_padding_ms`, …).
- Hoists `voice`, `language`, and `sample_rate` into a nested `params` object
  (the shape xAI's realtime endpoint expects).
- Wraps `turnDetection` into the nested `turn_detection` block that lives
  **inside** the `mllm` object. (OpenAI/Gemini vendors put it at the
  top level of `properties` — xAI does not.)

### 2. `app/api/invite-agent/route.ts` — wires the `Agent` + vendor together

```ts
const agent = new Agent({
  name: `conversation-${Date.now()}-${random}`,
  greeting,
  failureMessage: 'Please wait a moment.',
  maxHistory: 50,
  advancedFeatures: { enable_rtm: true, enable_tools: true },
  parameters: { data_channel: 'rtm', enable_error_message: true },
}).withMllm(new XAI({ ... }));

const session = agent.createSession(client, {
  channel: channel_name,
  agentUid,
  remoteUids: [requester_id],
  idleTimeout: 30,
  expiresIn: ExpiresIn.hours(1),
});

await session.start();
```

Two things worth calling out:

- `.withMllm(...)` both stores the vendor config and sets
  `advanced_features.enable_mllm = true` automatically. In MLLM mode the
  backend handles ASR/LLM/TTS end-to-end, so there is no `.withLlm()` /
  `.withTts()` / `.withStt()` chain.
- `Agent({ instructions })` is intentionally **not** set. In MLLM mode the
  SDK only forwards `instructions` into the (unused) LLM-pipeline config —
  the real system prompt reaches xAI via `mllm.messages` inside the vendor.

### 3. `agora-agent-server-sdk` — assembles and posts the HTTP request

Inside `session.start()` the SDK calls `agent.toProperties()` which returns
the `properties` object. In MLLM mode the SDK also merges three Agent-level
fields into the vendor config **if the vendor didn't already set them**:

- `_greeting` → `mllm.greeting_message`
- `_failureMessage` → `mllm.failure_message`
- `_maxHistory` → `mllm.max_history`

Our vendor only sets `greeting_message` (via `greetingMessage: greeting`),
so `failure_message` and `max_history` are sourced from the `Agent(...)`
options.

The Fern-generated client then separates `appid` from the rest of the object
(`Client.js` line 117), makes `appid` a URL path parameter, and posts
everything else as the JSON body.

---

## The REST request on the wire

### Endpoint

```
POST https://api-us-west-1.agora.io/api/conversational-ai-agent/v2/projects/{APP_ID}/join
```

`{APP_ID}` is `NEXT_PUBLIC_AGORA_APP_ID`. The region prefix comes from
`Area.US` on `AgoraClient` — change to `Area.EU` / `Area.AP` for those
regions.

### Headers

```
Authorization: Basic base64(NEXT_AGORA_CUSTOMER_ID:NEXT_AGORA_CUSTOMER_SECRET)
Content-Type: application/json
Accept: application/json
```

Basic auth uses the RESTful API credentials from the Agora console — these
are distinct from the App Certificate (which signs RTC tokens).

### Body

Shown with the default Ada persona, voice `eve`, and server VAD. Generated
values are marked `<placeholder>`.

```json
{
  "name": "conversation-<timestamp>-<random6>",
  "properties": {
    "channel": "<channel_name>",
    "token": "<RTC+RTM token from generateConvoAIToken>",
    "agent_rtc_uid": "<NEXT_PUBLIC_AGENT_UID, default 333>",
    "remote_rtc_uids": ["<requester_id>"],
    "idle_timeout": 30,
    "advanced_features": {
      "enable_rtm": true,
      "enable_tools": true,
      "enable_mllm": true
    },
    "parameters": {
      "data_channel": "rtm",
      "enable_error_message": true
    },
    "mllm": {
      "enable": true,
      "vendor": "xai",
      "url": "wss://api.x.ai/v1/realtime",
      "api_key": "<NEXT_XAI_API_KEY>",
      "params": {
        "voice": "eve",
        "language": "en",
        "sample_rate": 24000
      },
      "messages": [
        { "role": "system", "content": "<system prompt — Ada or user-supplied>" }
      ],
      "output_modalities": ["text", "audio"],
      "greeting_message": "Hi there! I'm Ada, your virtual assistant from Agora. How can I help?",
      "failure_message": "Please wait a moment.",
      "max_history": 50,
      "turn_detection": {
        "mode": "server_vad",
        "server_vad_config": {
          "threshold": 0.5,
          "prefix_padding_ms": 300,
          "silence_duration_ms": 200
        }
      }
    }
  }
}
```

When the user submits a custom prompt on the pre-call screen, only two
fields change: `mllm.messages[0].content` becomes the user's text, and
`mllm.greeting_message` becomes `"Hi, how can I help?"` (so the agent
doesn't open the session by announcing itself as Ada).

---

## Non-obvious wiring details

- **System prompt lives in `mllm.messages`**, not in `params.instructions`.
  Agora's xAI bridge consumes the prompt via an OpenAI-style `messages`
  array; other placements are silently ignored.
- **`turn_detection` is nested inside the `mllm` block** for xAI. OpenAI and
  Gemini MLLM vendors use the top-level `turn_detection` under `properties`.
- **`appid` is a URL path param, not a body field.** The SDK's generated
  client strips it out before serializing the body.

---

## Inspecting the real request at runtime

Flip the `debug` flag when creating the session:

```ts
// app/api/invite-agent/route.ts
agent.createSession(client, { ..., debug: true });
```

The SDK will log the endpoint and the exact serialized JSON body before
posting.
