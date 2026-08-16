# Agent Note: Preserve tool names across empty continuation deltas

Status: implemented

English | [中文](2026-08-15-preserve-tool-name-across-empty-deltas.zh.md)

## Problem

An OpenAI-compatible stream can include a valid tool name on the first delta and repeat `function.name: ""` on a later argument delta. The DeepSeek translator treated the repeated empty value as authoritative, so the closing tool-call block and the durable assistant message carried an empty name. Tool dispatch then failed as `unknown tool ""` even though the model had named a registered tool earlier in the same call.

## Decision

The DeepSeek translator updates an open tool-call name only when the wire delta contains a non-empty string. A later non-empty name can still fill a name that was absent earlier, while an empty continuation value cannot erase an established name. Missing names retain the existing empty-name fallback for malformed or incomplete provider streams.

## Alternatives considered

- **Repair the name in `BlockAssembler`.** Rejected as the primary owner because the provider adapter owns translation from wire deltas and already emits the authoritative `block-end`; repairing downstream would hide an adapter-level protocol normalization defect.
- **Reject the whole stream when an empty name appears.** Rejected because the same stream contains a valid name and arguments, and preserving the valid call is recoverable without discarding the model response.
- **Change tool registration or execution lookup.** Rejected because the registry is correct; the failure is caused by the malformed name persisted in the assistant message.

## Consequences

Tool calls survive gateways that repeat empty names on argument-only deltas. Truly nameless calls remain represented with the existing empty-name fallback and can still fail at dispatch, preserving the distinction between recoverable repeated metadata and an actually missing tool identity.

## Testing

The DeepSeek translation tests cover a valid first name followed by an empty-name argument delta and assert both emitted deltas and the final `block-end` retain the valid name.
