# Agent Note: Web Session Deletion

Status: implemented

[English](2026-08-15-web-session-deletion.md) | 中文

## Problem

Web Workspace 浏览器可以归档 Session 或删除 Workspace 注册记录，但两种操作都不会移除持久 Session 记录。用户需要一个明确的永久删除操作，同时不能让 Workspace 注册表获得项目目录、agent 创建的文件或无关持久产物的所有权。

Session persistence 与 Workspace 记账使用彼此独立的持久存储。只删除日志会留下陈旧的 Workspace 与归档引用，先移除注册表引用则可能隐藏仍保留日志的 Session。实时 Session 仍可能写入，因此删除不能同时充当 Agent 取消操作。

## Decision

`SessionPersistence.delete(id)` 是 provider 必须实现的操作。`PersistenceCoordinator` 将它与同 id 的先前工作串行化，等待 retirement 完成，并对仍存在于 `ctx.sessions` 中的 id 抛出 `SessionPersistenceActiveError`。provider 以 `SessionPersistenceNotFoundError` 报告不存在的持久数据。

JSONL provider 解析编码后的 id、验证已存 header 身份，并且只移除其配置根下的会话自有目录。`cwd` 记录的项目目录、同级会话目录、agent 创建的文件以及 provider 自有目录之外的附件保持不变。SQLite provider 在一个事务中删除 `sessions` 行，并依靠外键级联删除该 Session 的事件行。

`WorkspaceRegistry.deleteSession(id)` 持有产品操作。它拒绝实时或不存在的 Session，先删除 persistence，再从每个 Workspace 的 `sessionIds` 记账和 `archivedSessionIds` 中移除 id，清除 header 索引，并且只在全部写入提交后发布 `workspace/session-deleted`。API 将实时与不存在错误映射为 `session-active` 和 `session-not-found`。

## Durable recovery

注册表在调用 persistence 前写入 `pendingMutation: { operation: 'delete-session', sessionId }`。如果 persistence 在删除前拒绝，注册表恢复此前状态。如果 persistence 已提交而后续 Workspace 或全局状态写入失败，标记会保留。启动时再次调用 persistence，将 `SessionPersistenceNotFoundError` 视为第一阶段已经提交的证据，移除所有剩余注册表引用，然后清除标记。

该恢复遵循 pending marker 记录的方向，不会根据来源不明的缺失日志推断删除。附件清理继续暂缓，直到某个 provider 能证明其排他所有权。

## Client convergence and confirmation

`workspace.deleteSession` 只在 Host 注册表提交后返回。`WorkspaceRuntime` 在一元响应成功时移除行，并清空指向它的 selection；`host/session-deleted` 提供幂等的跨标签页回声。永久删除使用独立 Host 帧，因为 `host/session-removed` 表示实时 Activation 已卸载，并且会刻意保留持久 subagent 行。

行菜单只为非当前、非运行中且非空白的 Session 提供「删除会话」。独立确认框点名 Session，并说明项目文件和 agent 创建的文件会保留。删除进行时禁用确认和关闭，重复提交会被忽略，Host 错误会让对话框保持打开，以供重试或取消。归档仍是非破坏性操作。

## Alternatives considered

**从浏览器删除 JSONL 文件。**拒绝，因为浏览器不拥有 Host 存储、无法支持 SQLite，也无法执行实时会话串行化。

**删除前停止实时 Agent。**拒绝，因为破坏性的记录操作不得把中断工作作为隐式副作用。用户需单独停止 Agent，并在其 Session retirement 后重试。

**先移除 Workspace 引用。**拒绝，因为 persistence 失败会隐藏仍可恢复的日志。pending marker 让 persistence-first 删除在部分失败后收敛。

**随 Session 删除项目文件或附件。**拒绝，因为 Session 记录不能证明排他所有权。项目文件明确保留；附件保留策略需要单独的所有权决策。

## Verification

Persistence 测试固定实时与不存在错误、编码 id 的路径安全、项目与同级 Session 保留，以及 SQLite 事件级联。Workspace 测试固定成员／归档清理和 persistence 先提交后的启动恢复。API 与 runtime 测试固定结构化失败、永久删除 Host 帧、一元响应移除、selection 清理，以及它与 Activation 移除的区别。组件测试固定确认、取消、重复提交阻止、失败重试，以及当前或运行中行隐藏操作。无 key Chromium 场景通过真实菜单删除一条冷 JSONL Session，检查物理日志缺失且项目文件保留，再刷新确认该行不再出现。

## Consequences

永久删除刻意窄于删除项目：它移除对话 persistence 与注册表引用，而不移除源文件。存储失败后，跨存储完成可能需要启动恢复，但持久方向标记避免注册表猜测。当前 UI 没有归档浏览器或取消归档控件，因此无法从界面删除已归档 Session；domain 与 RPC 操作仍会在获授权 consumer 调用时清理归档 id。
