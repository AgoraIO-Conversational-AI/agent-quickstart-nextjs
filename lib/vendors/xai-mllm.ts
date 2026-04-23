/**
 * Custom XAI (x.ai Realtime) MLLM vendor class.
 *
 * The Agora Agent Server SDK ships built-in MLLM vendors for OpenAI Realtime,
 * Google Gemini Live, and Vertex AI, but it does not yet ship one for xAI's
 * Realtime API. The Agora backend DOES accept `vendor: "xai"` in the `mllm`
 * block of a start-agent request, so we subclass the public `BaseMLLM` and
 * produce a matching config shape ourselves.
 *
 * Wire it up the same way as the built-in vendors:
 *
 * ```ts
 * import { XAI } from '@/lib/vendors/xai-mllm';
 *
 * const agent = new Agent({ name: 'xai-assistant' }).withMllm(
 *   new XAI({
 *     apiKey: process.env.NEXT_XAI_API_KEY!,
 *     voice: 'eve',
 *     language: 'en',
 *     sampleRate: 24000,
 *     greetingMessage: 'Hello, how can I help?',
 *     turnDetection: {
 *       mode: 'server_vad',
 *       serverVadConfig: {
 *         threshold: 0.5,
 *         prefixPaddingMs: 300,
 *         silenceDurationMs: 200,
 *       },
 *     },
 *   }),
 * );
 * ```
 *
 * Calling `.withMllm(new XAI(...))` automatically enables MLLM mode on the
 * agent, which disables the standard ASR → LLM → TTS pipeline.
 */
import { BaseMLLM, type MllmConfig } from 'agora-agent-server-sdk';

/** Default backend model for xAI Voice / Realtime when `model` is omitted in options. */
export const DEFAULT_XAI_MODEL = 'grok-4-1-non-reasoning';

/**
 * Default server-side VAD, aligned with xAI Python:
 * `ServerVad(type="server_vad", threshold=0.5, prefix_padding_ms=300, silence_duration_ms=200)`.
 * Serialized under Agora `mllm.turn_detection` as `server_vad_config` snake_case keys.
 */
export const XAI_SERVER_VAD_DEFAULTS = {
  threshold: 0.5,
  prefixPaddingMs: 300,
  silenceDurationMs: 200,
} as const;

// ---- Turn detection (nested inside the mllm block for xAI) ----
//
// Unlike the built-in OpenAI / Gemini vendors (which rely on the agent's
// top-level `turnDetection` config), xAI expects the VAD settings to live
// INSIDE the `mllm` object, using a different mode/config shape. We model
// both supported modes below.

export interface XAIServerVadConfig {
  /** Energy threshold for detecting speech. */
  threshold?: number;
  /** Audio retained before speech is detected. */
  prefixPaddingMs?: number;
  /** Silence required to close a turn. */
  silenceDurationMs?: number;
}

export interface XAIAgoraVadConfig {
  /** Energy threshold for detecting speech. */
  threshold?: number;
  /** Speech required to trigger an interruption. */
  interruptDurationMs?: number;
  /** Audio retained before speech is detected. */
  prefixPaddingMs?: number;
  /** Silence required to close a turn. */
  silenceDurationMs?: number;
}

export type XAITurnDetection =
  | {
      mode: 'server_vad';
      serverVadConfig?: XAIServerVadConfig;
    }
  | {
      mode: 'agora_vad';
      agoraVadConfig?: XAIAgoraVadConfig;
    };

// ---- Constructor options ----

export interface XAIOptions {
  /** xAI Realtime API key. */
  apiKey: string;
  /**
   * Realtime WebSocket endpoint. Defaults to `wss://api.x.ai/v1/realtime`.
   * Override to point at a self-hosted or staging endpoint.
   */
  url?: string;
  /**
   * Voice id used by the model (e.g. `"eve"`).
   * Forwarded into `params.voice`.
   */
  voice?: string;
  /**
   * xAI model id for the realtime / voice session (e.g. `"grok-4-1-non-reasoning"`).
   * Forwarded into `params.model`. Defaults to {@link DEFAULT_XAI_MODEL}.
   */
  model?: string;
  /**
   * Language hint (e.g. `"en"`).
   * Forwarded into `params.language` when provided.
   */
  language?: string;
  /**
   * Audio sample rate for the model output. Defaults to 24000.
   * Forwarded into `params.sample_rate`.
   */
  sampleRate?: number;
  /**
   * Extra vendor params merged into the `params` object last, so they can
   * override the structured fields above if you need to tweak anything.
   */
  params?: Record<string, unknown>;
  /**
   * Short-term conversation memory — same shape as `item.content` from the
   * OpenAI Realtime API. Useful for `agora_vad` mode where a system prompt
   * is usually seeded up front.
   */
  messages?: Record<string, unknown>[];
  /** Audio always flows in; pass `['audio', 'text']` to also accept text. */
  inputModalities?: string[];
  /** Defaults are vendor-decided; pass `['text', 'audio']` to get both back. */
  outputModalities?: string[];
  /** Greeting broadcast to the first user on join. */
  greetingMessage?: string;
  /** Message played when the vendor fails to respond. */
  failureMessage?: string;
  /** Maximum conversation history length retained by the agent. */
  maxHistory?: number;
  /** Predefined tool ids the model may invoke (e.g. `['_publish_message']`). */
  predefinedTools?: string[];
  /**
   * VAD / turn-detection config nested inside the mllm block.
   * xAI treats this separately from the agent-level `turn_detection`.
   */
  turnDetection?: XAITurnDetection;
}

/**
 * XAI Realtime MLLM vendor.
 *
 * Emits a config compatible with `mllm.vendor: "xai"` on Agora's
 * start-agent endpoint.
 */
export class XAI extends BaseMLLM {
  private readonly options: XAIOptions;

  constructor(options: XAIOptions) {
    super();
    this.options = options;
  }

  toConfig(): MllmConfig {
    const {
      apiKey,
      url = 'wss://api.x.ai/v1/realtime',
      voice,
      model,
      language,
      sampleRate = 24000,
      params,
      messages,
      inputModalities,
      outputModalities,
      greetingMessage,
      failureMessage,
      maxHistory,
      predefinedTools,
      turnDetection,
    } = this.options;

    // Build the `params` object only from defined values so we don't leak
    // `undefined` into the JSON payload. Note: the system prompt is NOT
    // carried here — per Agora's xAI sample payloads it goes in the
    // top-level `messages` array (OpenAI chat format).
    const mergedParams: Record<string, unknown> = {
      ...(voice !== undefined && { voice }),
      ...(language !== undefined && { language }),
      ...(sampleRate !== undefined && { sample_rate: sampleRate }),
      model: model ?? DEFAULT_XAI_MODEL,
      ...params,
    };

    // `MllmConfig.vendor` is typed as the union of the built-in vendors, but
    // the Agora backend accepts `"xai"` at runtime. The SDK itself already
    // casts to `Record<string, unknown>` when writing fields the generated
    // type doesn't know about (see Agent.js), so we do the same here.
    const config: Record<string, unknown> = {
      enable: true,
      vendor: 'xai',
      url,
      api_key: apiKey,
      ...(Object.keys(mergedParams).length > 0 && { params: mergedParams }),
      ...(messages && { messages }),
      ...(inputModalities && { input_modalities: inputModalities }),
      ...(outputModalities && { output_modalities: outputModalities }),
      ...(greetingMessage && { greeting_message: greetingMessage }),
      ...(failureMessage && { failure_message: failureMessage }),
      ...(maxHistory !== undefined && { max_history: maxHistory }),
      ...(predefinedTools && { predefined_tools: predefinedTools }),
      ...(turnDetection && { turn_detection: buildTurnDetection(turnDetection) }),
    };

    return config as MllmConfig;
  }
}

function buildTurnDetection(td: XAITurnDetection): Record<string, unknown> {
  if (td.mode === 'server_vad') {
    const c = td.serverVadConfig;
    return {
      mode: 'server_vad',
      ...(c && {
        server_vad_config: {
          ...(c.threshold !== undefined && { threshold: c.threshold }),
          ...(c.prefixPaddingMs !== undefined && {
            prefix_padding_ms: c.prefixPaddingMs,
          }),
          ...(c.silenceDurationMs !== undefined && {
            silence_duration_ms: c.silenceDurationMs,
          }),
        },
      }),
    };
  }

  // agora_vad
  const c = td.agoraVadConfig;
  return {
    mode: 'agora_vad',
    ...(c && {
      agora_vad_config: {
        ...(c.threshold !== undefined && { threshold: c.threshold }),
        ...(c.interruptDurationMs !== undefined && {
          interrupt_duration_ms: c.interruptDurationMs,
        }),
        ...(c.prefixPaddingMs !== undefined && {
          prefix_padding_ms: c.prefixPaddingMs,
        }),
        ...(c.silenceDurationMs !== undefined && {
          silence_duration_ms: c.silenceDurationMs,
        }),
      },
    }),
  };
}
