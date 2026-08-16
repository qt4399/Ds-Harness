# Agent Note: Web Session Deletion

Status: implemented

English | [中文](2026-08-15-web-session-deletion.zh.md)

## Problem

The Web Workspace browser can archive a Session or delete a Workspace registration, but neither operation removes a persisted Session record. Users need an explicit permanent deletion action without granting the Workspace registry ownership of project directories, files created by an agent, or unrelated persistence artifacts.

Session persistence and Workspace accounting use separate durable stores. Deleting only the log leaves stale Workspace and archive references, while removing registry references first can hide a Session whose log remains. A live Session can still be writing, so deletion cannot double as Agent cancellation.

## Decision

`SessionPersistence.delete(id)` is a required provider operation. `PersistenceCoordinator` serializes it with earlier work for that id, waits for retirement, and rejects an id still present in `ctx.sessions` with `SessionPersistenceActiveError`. Providers report absent durable data with `SessionPersistenceNotFoundError`.

The JSONL provider resolves an encoded id, validates the stored header identity, and removes only the session-owned directory beneath its configured root. The project directory recorded in `cwd`, sibling session directories, agent-created files, and attachments outside that provider-owned directory remain. The SQLite provider deletes the `sessions` row in one transaction and relies on its foreign key to cascade that Session's event rows.

`WorkspaceRegistry.deleteSession(id)` owns the product operation. It rejects live and absent Sessions, deletes persistence first, removes the id from every Workspace `sessionIds` account and `archivedSessionIds`, clears its header indexes, and publishes `workspace/session-deleted` only after all writes commit. The API maps live and absent failures to `session-active` and `session-not-found`.

## Durable recovery

The registry writes `pendingMutation: { operation: 'delete-session', sessionId }` before calling persistence. If persistence rejects before deletion, the registry restores the previous state. If persistence commits and a later Workspace or global-state write fails, the marker remains. Startup retries persistence, accepts `SessionPersistenceNotFoundError` as evidence that the first stage already committed, removes every remaining registry reference, and clears the marker.

This recovery chooses the pending marker's recorded direction; it does not infer deletion from an unexplained missing log. Attachment cleanup remains deferred until one provider can prove exclusive ownership.

## Client convergence and confirmation

`workspace.deleteSession` returns only after the Host registry commits. `WorkspaceRuntime` removes the row and clears a matching selection on the successful unary response, while `host/session-deleted` supplies the idempotent cross-tab echo. Permanent deletion has a distinct Host frame because `host/session-removed` means a live Activation detached and deliberately retains durable subagent rows.

The row menu offers Delete session only for a non-current, non-running, non-blank Session. A separate confirmation names the Session and states that project and agent-created files remain. Pending deletion disables confirmation and dismissal, duplicate submission is ignored, and a Host error keeps the dialog open for retry or cancellation. Archive remains the non-destructive action.

## Alternatives considered

**Delete JSONL files from the browser.** Rejected because the browser does not own Host storage, cannot support SQLite, and cannot enforce live-session serialization.

**Stop a live Agent before deletion.** Rejected because a destructive record operation must not interrupt work as an implicit side effect. Users stop the Agent separately and retry after its Session retires.

**Remove Workspace references before persistence.** Rejected because a persistence failure would hide a recoverable log. The pending marker makes persistence-first deletion converge after a partial failure.

**Delete project files or attachments with the Session.** Rejected because the Session record does not prove exclusive ownership. Project files are explicitly retained; attachment retention needs a separate ownership decision.

## Verification

Persistence tests pin live and absent errors, encoded-id path safety, project and sibling retention, and SQLite event cascade. Workspace tests pin membership/archive cleanup and startup recovery after persistence commits first. API and runtime tests pin structured failures, the permanent Host frame, unary removal, selection clearing, and the distinction from Activation removal. Component tests pin confirmation, cancellation, duplicate blocking, failure retry, and hidden actions for current or running rows. The keyless Chromium scenario deletes a cold JSONL Session through the real menu, checks the physical log is absent and a project file remains, then reloads and confirms the row stays absent.

## Consequences

Permanent deletion is intentionally narrower than deleting a project: it removes conversation persistence and registry references, not source material. Cross-store completion may require startup recovery after a storage failure, but a durable direction marker prevents the registry from guessing. Archived Sessions remain undeletable from the current UI because the product has no archive browser or unarchive control; the domain and RPC operation still clean an archived id when invoked by an authorized consumer.
