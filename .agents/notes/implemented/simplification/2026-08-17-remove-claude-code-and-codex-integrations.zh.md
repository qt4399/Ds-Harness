# Agent Note: 移除 Claude Code 与 Codex 产品集成

Status: implemented

[English](2026-08-17-remove-claude-code-and-codex-integrations.md) | 中文

## 问题

Claude Code 和 Codex subagent 提供方与钩子桥接会将产品 SDK、原生平台载荷、协议代码、配置行、示例和测试 fixture 纳入每次 workspace 安装。它们是可选兼容集成，并非通用 subagent runtime 或模型适配层的必要部分。

## 决策

harness 不再包含 `dsh-subagent-claude-code`、`dsh-subagent-codex`、`dsh-hooks-claude-code`、`dsh-hooks-codex` 和 `dsh-hook-protocol` 包。发布 profile、ACP 示例、Python SDK runtime 依赖、测试场景、文档图、包引用和第三方 notices 均不再包含产品提供方或钩子桥接集成。

`ctx.subagents` 保留进程内、ACP 和 DSH SDK 提供方及其委派 Consumer。原生 Cordis 拦截插件仍可通过已文档化的扩展点使用。`dsh-llm-pi-ai` 保留独立的 `openai-codex` 模型路由；它是模型适配器标识，不是 Codex 产品进程或 subagent 提供方。

## 已考虑的替代方案

**将产品保留为禁用的 profile 行。** 禁用组合仍会保留包解析以及已安装的 SDK/平台载荷闭包，无法实现安装体积与依赖缩减。

**在没有产品 subagent 时保留钩子桥接。** 桥接只用于转换 Claude Code 和 Codex 钩子格式。原生拦截插件在没有外部协议库的情况下提供当前扩展机制。

**移除每个包含 Codex 的模型路由。** `dsh-llm-pi-ai` 中的 `openai-codex` 路由是独立的 OpenAI 兼容模型适配器关注点，继续受支持。

## 影响

用户不能再委派给 Claude Code 或 Codex 产品可执行文件，也不能加载它们的钩子配置格式。重新引入任一集成需要新的 Agent Note，并恢复其包清单、组合、可运行示例、无密钥产品证据、已配置 Loader 覆盖、依赖锁文件和第三方 notices。它不能让产品选择或凭据成为通用 subagent 服务的必要条件。

该移除由 workspace 清单、TypeScript 项目引用、生成文档、第三方 notices，以及针对已移除包标识和产品依赖的全仓引用扫描共同固定。
