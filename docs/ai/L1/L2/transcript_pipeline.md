> **When to Read This:** Load this when modifying transcript rendering, event handling, UID mapping, metrics/error panels, or RTM fallback parsing.

# Transcript Pipeline

## Overview

Transcript and call diagnostics are delivered through AgoraVoiceAI events over RTM, then normalized for UI kit components. On v3 sessions RTM is the only data channel (always on; there are no RTC data streams).

Primary pipeline:

1. RTM data arrives.
2. `AgoraVoiceAI` emits transcript/state/metrics/error events.
3. `ConversationComponent` stores raw transcript and issue streams.
4. `lib/conversation.ts` normalizes UID/text/timestamps.
5. UI panels render message history + in-progress turn separately.

## Transcript Normalization Stages

- UID remap: toolkit `uid="0"` -> actual local RTC UID string.
- Text cleanup: punctuation spacing normalization.
- Timestamp normalization: seconds vs milliseconds unified.
- Status segmentation:
- `IN_PROGRESS` displayed as live bubble.
- `END` + `INTERRUPTED` included in scrollable history.

## Why `INTERRUPTED` Must Stay in History

If the first agent turn is interrupted and omitted, `messageList` can remain empty and transcript auto-open logic may never engage. Keeping interrupted turns preserves user-visible causality.

## Agent Visualizer Mapping

`mapAgentVisualizerState` prioritizes RTC transport state before agent semantic state:

- `DISCONNECTED`/`DISCONNECTING` -> `disconnected`
- `CONNECTING`/`RECONNECTING` -> `joining`
- no agent presence -> `not-joined`
- otherwise map agent states (`listening`, `thinking`, `speaking`, idle-like)

This avoids showing optimistic speech/listen states while transport is degraded.

## Metrics and Error Streams

Handled signals (agent metrics and agent error events are not delivered on v3 preview sessions; the handlers remain wired):

- `AGENT_METRICS` for per-stage latency chips.
- `MESSAGE_ERROR` and `AGENT_ERROR` for surfaced issues.
- `MESSAGE_SAL_STATUS` for registration failures (`VP_REGISTER_FAIL`, `VP_REGISTER_DUPLICATE`).

Fallback parser:

- Raw RTM `message` listener parses JSON payloads for `message.error` and `message.sal_status` to catch issues not raised via higher-level events.

## Coupled Files

- `components/ConversationComponent.tsx`: event subscriptions and issue collection.
- `lib/conversation.ts`: transcript + visualizer mapping transforms.
- `components/QuickstartTranscriptPanel.tsx`: transcript render sink.
- `components/QuickstartPipelineMetrics.tsx`: metrics render sink.
- `components/ConnectionStatusPanel.tsx`: surfaced connection diagnostics.
