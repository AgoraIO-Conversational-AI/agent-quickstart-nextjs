// Canonical list of xAI Voice Agent voices, shared between the API route
// (for allowlist validation) and the landing-page voice picker (for display).
// Source: https://docs.x.ai/developers/model-capabilities/audio/voice-agent
//
// Keep this list in sync with xAI's documented voices. The API route rejects
// any selection that isn't in `XAI_VOICE_IDS` to prevent arbitrary strings
// reaching Agora's MLLM config.

export interface XaiVoiceOption {
  id: string;
  label: string;
  /** Short voice summary surfaced in the picker. */
  description: string;
}

export const XAI_VOICES: readonly XaiVoiceOption[] = [
  { id: 'eve', label: 'Eve', description: 'Female · energetic, upbeat' },
  { id: 'ara', label: 'Ara', description: 'Female · warm, friendly' },
  { id: 'rex', label: 'Rex', description: 'Male · confident, clear' },
  { id: 'sal', label: 'Sal', description: 'Neutral · smooth, balanced' },
  { id: 'leo', label: 'Leo', description: 'Male · authoritative, strong' },
] as const;

export const XAI_VOICE_IDS: readonly string[] = XAI_VOICES.map((v) => v.id);

export const DEFAULT_XAI_VOICE_ID = 'eve';

export function isXaiVoiceId(value: unknown): value is string {
  return typeof value === 'string' && XAI_VOICE_IDS.includes(value);
}
