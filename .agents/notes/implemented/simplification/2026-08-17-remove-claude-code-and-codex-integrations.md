# Agent Note: Remove Claude Code and Codex product integrations

Status: implemented

English | [中文](2026-08-17-remove-claude-code-and-codex-integrations.zh.md)

## Problem

The Claude Code and Codex subagent providers and hook bridges pull product SDKs, native platform payloads, protocol code, configuration rows, examples, and test fixtures into every workspace install. They are optional compatibility integrations rather than requirements of the generic subagent runtime or the model adapter layer.

## Decision

The harness excludes the `dsh-subagent-claude-code`, `dsh-subagent-codex`, `dsh-hooks-claude-code`, `dsh-hooks-codex`, and `dsh-hook-protocol` packages. Shipped profiles, ACP examples, Python SDK runtime dependencies, test scenarios, documentation graphs, package references, and third-party notices contain no product-provider or hook-bridge integration.

`ctx.subagents` retains its in-process, ACP, and DSH SDK providers and its delegation consumers. Native Cordis interception plugins remain available through the documented extension points. `dsh-llm-pi-ai` retains its independent `openai-codex` model route; it is a model adapter identifier, not a Codex product process or subagent provider.

## Alternatives considered

**Keep the products as disabled profile rows.** Disabled composition keeps package resolution and the installed SDK/platform payload closure, so it does not achieve the install-size or dependency reduction.

**Keep the hook bridges without product subagents.** The bridges exist only to translate Claude Code and Codex hook formats. Native interception plugins provide the current extension mechanism without the external protocol library.

**Remove every Codex-named model route.** The `openai-codex` route in `dsh-llm-pi-ai` is an independent OpenAI-compatible model adapter concern and remains supported.

## Consequences

Users cannot delegate to the Claude Code or Codex product executables or load their hook configuration formats. Reintroducing either integration requires a new Agent Note and restores its package manifest, composition, runnable example, keyless product evidence, configured loader coverage, dependency lockfile, and third-party notices. It must not make product selection or credentials a requirement of the generic subagent service.

The removal is pinned by the workspace manifests, TypeScript project references, generated documentation, third-party notices, and repository-wide reference scans for the removed package identities and product dependencies.
