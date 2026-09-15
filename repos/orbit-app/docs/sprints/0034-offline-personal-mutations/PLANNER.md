# Sprint 0034 Offline Personal Mutations Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Support durable, truthful offline mutations for four actor-private domains with transactionally exact replay, ordered local acknowledgment and explicit conflict resolution.

**Architecture:** Store canonical, pending, conflict, alias, eligibility and outbox layers separately in the encrypted App database. Upload strict shared commands to a PostgreSQL mutation endpoint whose base-revision check, existing domain mutation, database revision and persistent global receipt share one domain-locked transaction; project the local overlay without claiming that pending data is visible to Web or AI.

**Tech Stack:** TypeScript, strict Zod shared API schema, Next.js route handlers, provider-neutral PostgreSQL transactions/advisory locks, Expo SQLite/SQLCipher, SecureStore, React Native hooks, Node tests, production Web/API and iOS Simulator.

**Spec:** `repos/orbit-app/docs/sprints/0034-offline-personal-mutations/DESIGN.md`

## Global Constraints

- **原需求：** 半本地化存储且不每次上传下载；AI 必须能看笔记、待办、跟进、日程，但只能看到服务器已确认内容。
- **依赖一：** 0033 incremental read 已 completed/merged，四域 mirror、cursor reset、canonical `sync_revision` 和 Note tombstone 已在主线复验。
- **依赖二：** 0033 Note DELETE 的数据库级 CAS 修复已合并；真实 PostgreSQL 双进程 stale PATCH vs DELETE 证明删除不能被复活。未满足时禁止开放 Note 离线写入口。
- 只允许 note、canonical task、relationship-category task 和 personal schedule。suggestion accept、meeting/event/invitation/registration/chat/permission/account/provider/AI side effect 都是 online-only。
- actor/workspace 只来自服务器认证；wire command 禁止携带 actor/workspace。App 本地数据库以 base URL + actor 隔离并在 workspace 内再分区。
- `baseRevision` 只使用 `orbit_records.sync_revision`。local create 的 `canonicalRevision`/`baseRevision` 为 `null`，不得伪造 revision。
- base check、领域写、revision 读取和全局 receipt 必须共用一个 PostgreSQL transaction 与已有领域 advisory lock；batch 不能直接写业务 JSON。
- batch item conflict 使用 HTTP 200 discriminated result；HTTP 409 只用于 0033 cursor reset。
- Web/API/shared contract 变更后必须 production build 并重启实际服务，再由同一环境的 App 验收。
- 数据库实现只依赖 PostgreSQL 和项目 storage abstraction，不能导入 Supabase/Neon SDK 或按厂商分支。
- 单 Generator；编辑既有符号前运行 upstream impact 并在 HIGH/CRITICAL 时告警；严格 TDD；每个任务完成后 review；提交前运行 `gitnexus_detect_changes()`。
- 每个 Sprint 实现完成必须 commit，合并 `chat-agent`，验证精确合并树，完整复验后 push，并在 REPORT 记录 feature、merge、remote SHA。

---

### Task 0: Freeze the dependency gate and transaction boundaries

**Files:**
- Required before execution (created by 0033 closeout): `repos/orbit-app/docs/sprints/0033-incremental-read-sync/REPORT.md`
- Read/verify: `repos/orbits/features/notes/service.ts`
- Read/verify: `repos/orbits/features/notes/repository.ts`
- Read/verify: `repos/orbits/features/tasks/mutations.ts`
- Read/verify: `repos/orbits/features/personal-schedule/service.ts`
- Test/verify: `repos/orbits/tests/services/notes-service.test.ts`
- Test/verify: `repos/orbits/tests/services/incremental-sync.test.ts`

**Interfaces:**
- Consumes: 0033 canonical revision, tombstone and Note CAS guarantees.
- Produces: a recorded implementation baseline SHA and the exact existing domain lock keys/transaction entry points used by Task 1.

- [ ] **Step 1: prove prerequisites before product edits.** Run the 0033 sync and Note tests, including a real PostgreSQL two-client barrier where DELETE and stale PATCH overlap. Expected: one committed delete/tombstone, stale PATCH conflicts, and no active resurrected row.
- [ ] **Step 2: map transaction ownership.** Record the note/task/personal-schedule advisory-lock keys, service factories and transaction-bound repositories in the working ledger. Expected: no Task 1 adapter needs a nested transaction or a second lock order.
- [ ] **Step 3: gate only the affected scope.** If Note CAS fails, mark Note offline UI blocked and continue Tasks 1–3 for task/schedule/shared infrastructure; do not claim Sprint completion or enable Note mutation until the gate passes.

### Task 1: Define the strict wire schema and atomic PostgreSQL mutation service

**Files:**
- Modify: `repos/orbits/shared/contract/sync.ts`
- Create: `repos/orbits/shared/api-schema/sync-mutations.ts`
- Generated: `repos/orbit-app/src/api/contract/sync.ts`
- Generated: `repos/orbit-app/src/api/schema/sync-mutations.ts`
- Create: `repos/orbits/features/sync/mutation-migrations.ts`
- Create: `repos/orbits/features/sync/mutation-repository.ts`
- Create: `repos/orbits/features/sync/mutation-service.ts`
- Create: `repos/orbits/features/sync/relationship-eligibility.ts`
- Create: `repos/orbits/app/api/sync/mutations/handler.ts`
- Create: `repos/orbits/app/api/sync/mutations/route.ts`
- Create: `repos/orbits/app/api/sync/relationship-eligibility/handler.ts`
- Create: `repos/orbits/app/api/sync/relationship-eligibility/route.ts`
- Modify: `repos/orbits/shared/storage/migrations.ts`
- Modify narrowly after impact: `repos/orbits/features/notes/service.ts`, `repository.ts`, `service-factory.ts`
- Modify narrowly after impact: `repos/orbits/features/tasks/mutations.ts`, `repository.ts`, `service.ts`, `service-factory.ts`
- Modify narrowly after impact: `repos/orbits/features/personal-schedule/service.ts`, `service-factory.ts`
- Reuse without weakening: `repos/orbits/features/connections/lifecycle/read-projection.ts`
- Create: `repos/orbits/tests/services/sync-mutation-migrations.test.ts`
- Create: `repos/orbits/tests/services/sync-mutation-service.test.ts`
- Create: `repos/orbits/tests/api/sync-mutations-route.test.ts`
- Create: `repos/orbits/tests/api/sync-relationship-eligibility-route.test.ts`
- Modify: `repos/orbits/tests/architecture/sync-contract.test.ts`
- Modify: `repos/orbit-app/tests/contract-sync.test.ts`, `api-schema-sync.test.ts`

**Interfaces:**
- Consumes: existing transaction-bound domain validators and lock keys from Task 0.
- Produces: `SyncMutationBatch`, strict Zod schemas, `SyncMutationItemResult`, `executeSyncMutationItem(...)`, and a minimal authenticated relationship eligibility projection.

- [ ] **Step 1: write contract/schema RED tests.** Cover a max-50 batch, exact discriminants, string/body/depth limits, `local:<uuid>` create rule, required non-null base for uploaded update/delete, per-domain patch allowlists, and rejection of actorId/workspaceId, unknown fields, prototype keys, task activities/reminders, provider data and relationship fields on a non-relationship task. Expected: new tests fail because the schema does not exist.
- [ ] **Step 2: implement and sync the contract.** Add the exact interfaces from DESIGN plus strict domain patch unions. Run `npm run sync:contract`; contract and schema copies must be byte-identical and self-contained.
- [ ] **Step 3: write migration RED tests.** Require an idempotent `orbit_sync_mutation_receipts` PostgreSQL table with unique `(workspace_id, actor_id, mutation_id)`, fingerprint, terminal result JSON, created/updated timestamps and bounded result validation. Run migration twice and assert no provider-specific extension or SDK.
- [ ] **Step 4: write atomicity RED tests with real PostgreSQL.** For each domain, pause two clients after receipt lookup, replay the same mutation concurrently, inject failure after domain write/before receipt, and race same ID/different fingerprint. Expected: before implementation, duplicate effects or split commit is observable.
- [ ] **Step 5: factor the minimum transaction-bound domain adapters.** Reuse each existing domain advisory lock and call the existing validator/mutation core with a transaction-bound store. Do not call a factory that opens another transaction; do not move validation into the sync service. Preserve Note expectedVersion/tombstone CAS, Task transition/activity rules and PersonalSchedule expectedUpdatedAt rules.
- [ ] **Step 6: implement the per-item transaction in the fixed order.** Authenticate → acquire domain lock → read global receipt → read/compare actor-scoped canonical `sync_revision` → revalidate relationship lifecycle when applicable → execute domain mutation → read new revision and allowlisted record → insert terminal receipt → commit. Failure before commit yields no acknowledgment.
- [ ] **Step 7: freeze replay behavior.** Same ID/fingerprint returns the stored result after process restart and on another service instance; same ID/different fingerprint returns item-level permanent `IDEMPOTENCY_MISMATCH`; retryable results are absent from the receipt table.
- [ ] **Step 8: implement route semantics.** Schema-valid authenticated batches return HTTP 200 with one ordered result per command. Domain revision/remote-delete/eligibility conflicts are item results. Only batch auth/schema/rate/runtime failures use route-level failure envelopes; mutation routes never emit cursor-reset 409.
- [ ] **Step 9: implement the eligibility read projection.** Return only contactId, connectionId, connectionVersion, stage (`needs_follow_up | active | nurture`), display label and syncedAt for the authenticated actor/workspace; exclude `archived`. The mutation service must re-read canonical lifecycle within replay transaction and never trust this snapshot as authorization.
- [ ] **Step 10: verify Task 1.** Run all new tests, existing note/task/personal-schedule mutation suites, incremental-sync tests, contract/schema sync, Web typecheck and production build. Commit only Task 1 files after `gitnexus_detect_changes(scope="staged")`.

### Task 2: Migrate the encrypted local store to separated v2 layers

**Files:**
- Modify: `repos/orbit-app/src/data/sync/local-sync-schema.ts`
- Create: `repos/orbit-app/src/data/sync/local-sync-migrations.ts`
- Modify: `repos/orbit-app/src/data/sync/local-sync-database.ts`
- Modify compatibility boundary: `repos/orbit-app/src/data/sync/local-sync-database.web.ts`
- Modify: `repos/orbit-app/src/data/sync/local-sync-repository.ts`
- Create: `repos/orbit-app/src/data/sync/outbox-repository.ts`
- Create: `repos/orbit-app/src/data/sync/pending-overlay.ts`
- Create: `repos/orbit-app/src/data/sync/relationship-eligibility-repository.ts`
- Modify: `repos/orbit-app/src/data/sync/sync-lifecycle.ts`
- Modify parity boundary: `repos/orbit-app/src/data/sync/sync-lifecycle.web.ts`
- Modify: `repos/orbit-app/tests/local-sync-repository.test.ts`
- Create: `repos/orbit-app/tests/local-sync-migrations.test.ts`
- Create: `repos/orbit-app/tests/outbox-repository.test.ts`
- Create: `repos/orbit-app/tests/pending-overlay.test.ts`
- Create: `repos/orbit-app/tests/relationship-eligibility-repository.test.ts`
- Modify: `repos/orbit-app/tests/sync-lifecycle.test.ts`

**Interfaces:**
- Consumes: Task 1 strict command/fingerprint types.
- Produces: schema v2 repositories for canonical/pending/outbox/conflict/alias/eligibility/scope-state layers and `LocalProjectedRecord.canonicalRevision: string | null`.

- [ ] **Step 1: write schema-v2 RED tests.** Assert distinct tables/columns, actor/workspace keys, nullable canonical revision for pure local create projection, unique mutation ID, unique monotonic `enqueue_order`, alias uniqueness, strict JSON decoding and no conflict/pending data in `sync_meta`.
- [ ] **Step 2: write a real v1→v2 migration fixture.** Seed synced, pending, failed, conflicted, tombstone and outbox v1 rows. Assert synced rows become canonical; local payloads remain byte-equivalent in pending; ambiguous revisions remain legacy evidence and set `reconciliation_required`; outbox receives deterministic enqueue order/fingerprint; aliases/eligibility start empty.
- [ ] **Step 3: add crash/rerun RED cases.** Interrupt after each DDL/copy/count checkpoint, reopen, run migration again, then run initialization a second time. Expected final rows, hashes and schema version are identical with no duplicate queue entries.
- [ ] **Step 4: implement `migrateLocalSyncV1ToV2`.** Build temporary v2 tables, copy and validate in one SQLite transaction, update schema version only after counts/unique keys/JSON checks, then retire v1 tables. Never infer a server base from an ambiguous v1 revision.
- [ ] **Step 5: implement atomic enqueue.** In one transaction generate/persist stable mutation ID, canonical fingerprint, next `enqueue_order`, pending overlay and optional local entity ID. Repeating the same user confirmation must return the existing mutation; fingerprint mismatch must fail visibly.
- [ ] **Step 6: implement selectors and alias resolution.** Read canonical and overlay separately; a local create exposes `canonicalRevision=null`; tombstone overlay hides only the projected record. Resolve local IDs through the alias table, never by replacing strings inside JSON.
- [ ] **Step 7: preserve 0033 reset boundaries.** Delta applies only canonical rows. Workspace reset removes canonical/cursor only and proves pending/outbox/conflict/alias/eligibility/device draft survival.
- [ ] **Step 8: persist relationship eligibility.** Store only the minimal authenticated projection in the encrypted actor/workspace DB, reject foreign scope/stale response and expose snapshot time to UI.
- [ ] **Step 9: verify Task 2.** Run the five focused suites, 0032/0033 repository/lifecycle/coordinator regressions, App typecheck and SQLCipher native initialization test. Commit only Task 2 files after staged change detection.

### Task 3: Implement FIFO upload, ack transaction, conflicts and auth locking

**Files:**
- Create: `repos/orbit-app/src/data/sync/outbox-uploader.ts`
- Create: `repos/orbit-app/src/data/sync/conflict-resolution.ts`
- Modify: `repos/orbit-app/src/data/sync/sync-coordinator.ts`
- Modify: `repos/orbit-app/src/hooks/useSyncedCollection.ts`
- Create: `repos/orbit-app/src/hooks/useOfflineMutation.ts`
- Modify: `repos/orbit-app/src/api/AuthSessionProvider.tsx`
- Modify: `repos/orbit-app/src/api/session-expiry.ts`
- Modify if required by strict client decoding: `repos/orbit-app/src/api/client.ts`
- Create: `repos/orbit-app/tests/outbox-uploader.test.ts`
- Create: `repos/orbit-app/tests/conflict-resolution.test.ts`
- Create: `repos/orbit-app/tests/offline-mutation-hook.test.tsx`
- Modify: `repos/orbit-app/tests/incremental-sync-coordinator.test.ts`
- Modify: `repos/orbit-app/tests/auth-session-provider-races.test.ts`
- Modify: `repos/orbit-app/tests/session-expiry.test.ts`

**Interfaces:**
- Consumes: Task 1 batch client/result and Task 2 repositories.
- Produces: `enqueueMutation`, entity-head FIFO uploader, transactional `applyAcknowledgement`, explicit conflict commands and `active | auth_locked | reconciliation_required` scope behavior.

- [ ] **Step 1: write uploader scheduler RED tests.** Queue interleaved mutations for five entities with skewed timestamps. Assert selection is by `enqueue_order`, only each entity head uploads, max four entities run, a blocked/conflicted entity does not block others, and local-ID update waits for create ack.
- [ ] **Step 2: write retry/cancellation RED tests.** Cover network loss, 5xx, 429 retry-after, bounded jitter, commit-unknown response loss, App restart, foreground/explicit retry, cancellation and stable mutation ID/fingerprint. A 400/422 item must remain editable permanent data, not retry forever.
- [ ] **Step 3: write ack-transaction RED tests.** Inject failure after canonical upsert, alias insert, queued-command rebase and head deletion. Assert every failure rolls back all local effects and receipt replay completes once. Reject non-head ID, foreign scope, malformed record, revision regression and alias collision.
- [ ] **Step 4: implement the ack transaction.** Verify entity head; upsert canonical; create alias; rewrite only typed target/base fields of later same-entity commands; delete acknowledged head; recompute pending; publish state after commit. Do not use fire-and-forget refresh as proof of acknowledgment.
- [ ] **Step 5: implement the three conflict models and resolution commands.** Freeze only the entity queue. Revision mismatch supports cloud/local-with-new-ID/copy; remote deleted never resurrects the canonical ID; relationship ineligible only supports dropping, converting to ordinary task or choosing a currently valid relationship. Every resolution is one local transaction and any new upload gets a new mutation ID.
- [ ] **Step 6: write 401/session-expiry RED tests.** A 401 locks the scope, stops upload, clears invalid auth tokens and closes handles while encrypted DB/key/outbox remain. A different actor cannot read or redirect that queue; same actor reauth unlocks and resumes from the original head.
- [ ] **Step 7: write active-sign-out confirmation RED tests.** With unsynced data, sign-out must expose count and wait for Cancel / Keep encrypted / Delete permanently. Only explicit permanent deletion invokes crypto erasure; erase failure returns failure and retains a recoverable marker. With no unsynced data existing cleanup remains valid.
- [ ] **Step 8: integrate coordinator lifecycle.** Network recovery and explicit retry can start uploader; foreground orchestration stays bounded and shares Task 2/0033 single-flight rules. Read delta and write upload must not overwrite each other's local transaction state.
- [ ] **Step 9: verify Task 3.** Run all focused tests plus 0033 coordinator, lifecycle, auth race/session expiry suites and App typecheck. Commit only Task 3 files after staged change detection.

### Task 4: Wire four domains, relationship eligibility and truthful consumers

**Files:**
- Modify: `repos/orbit-app/src/screens/notes/NewNoteScreen.tsx`
- Modify: `repos/orbit-app/src/screens/notes/EditNoteScreen.tsx`
- Modify: `repos/orbit-app/src/screens/notes/NoteDetailScreen.tsx`
- Modify: `repos/orbit-app/src/screens/notes/NotesScreen.tsx`
- Modify: `repos/orbit-app/src/screens/tasks/TasksScreen.tsx`
- Modify: `repos/orbit-app/src/screens/tasks/TaskDetailScreen.tsx`
- Modify: `repos/orbit-app/src/screens/today/TodayScreen.tsx`
- Modify: `repos/orbit-app/src/screens/schedule/PersonalScheduleList.tsx`
- Modify: `repos/orbit-app/src/screens/schedule/PersonalScheduleScreen.tsx`
- Create: `repos/orbit-app/src/components/SyncStateNotice.tsx`
- Modify: `repos/orbit-app/src/i18n/messages.ts`, `zh.ts`, `ja.ts`, `en.ts`
- Modify direct tests: `repos/orbit-app/tests/notes-list-interactions.test.tsx`, `notes-interactions.test.tsx`, `task-list-scope.test.ts`, `task-detail-interactions.test.ts`, `today-tasks-screen-source.test.ts`, `personal-schedule-interactions.test.tsx`, `schedule-screen-source.test.ts`
- Create: `repos/orbit-app/tests/offline-mutation-eligibility.test.ts`
- Create: `repos/orbit-app/tests/offline-mutation-consumers.test.tsx`
- Modify existing locale workflow tests for new copy.

**Interfaces:**
- Consumes: `useOfflineMutation`, projected records, persisted sync state and encrypted eligibility snapshots.
- Produces: user-confirmed offline actions and consistent pending/failure/conflict/auth-locked UI in every listed consumer.

- [ ] **Step 1: write real screen RED tests before changing screens.** For each domain, submit while network is unavailable, unmount/remount, and assert projected content plus “仅本机，等待同步”. No screen may show cloud success or navigate to an unresolved canonical ID.
- [ ] **Step 2: preserve wire safety at the adapters.** Each screen constructs only the strict domain patch. Existing drafts, delete confirmations, task status transitions, Note associations and PersonalSchedule time validation remain. meeting/event/shared/suggestion actions must fail online-only before enqueue.
- [ ] **Step 3: connect Notes list/detail/create/edit.** Use alias-aware local IDs, nullable canonical revision and persisted status. Note enablement remains behind Task 0 CAS gate. Contact-embedded note editor remains online unless explicitly listed and tested.
- [ ] **Step 4: connect Tasks and Today.** Tasks list/detail and Today must project the same canonical task plus pending layer, including create/update/status/delete. Activity/reminder resources remain online and are never synthesized from pending state.
- [ ] **Step 5: connect Personal Schedule list/detail.** `PersonalScheduleList` and editor share one overlay/alias source; pending delete, permanent validation failure and conflict survive navigation and restart.
- [ ] **Step 6: connect relationship eligibility.** Refresh the minimal authenticated snapshot only after a valid online response. Offline relationship create requires an allowlisted snapshot and includes only its IDs/version; display snapshot freshness. suggestion accept stays online-only.
- [ ] **Step 7: render persisted state.** `SyncStateNotice` distinguishes pending, retrying, permanent failure, revision conflict, remote deletion, relationship ineligible and auth-locked. Retry and resolution buttons invoke stored commands; no global success is shown while selected work remains unresolved.
- [ ] **Step 8: verify Task 4.** Run all direct screen/hook tests, relationship/category regressions, locale completeness, App typecheck and an iOS build. Commit only Task 4 files after staged change detection.

### Task 5: Complete runtime acceptance, reporting and integration

**Files:**
- Create after execution: `repos/orbit-app/docs/sprints/0034-offline-personal-mutations/REPORT.md`
- Modify: `repos/orbit-app/docs/sprints/README.md`
- Modify: `bridge/status.md`, `bridge/handoffs.md`, `bridge/history.md`
- Create: `bridge/requests/BR-0034-offline-personal-mutations.md`
- Modify if capability state changes: `bridge/capabilities.md`

**Interfaces:**
- Consumes: reviewed commits from Tasks 0–4.
- Produces: reproducible PostgreSQL/Web/App/AI evidence, merge-tree proof and remote SHA.

- [ ] **Step 1: verify a safe runtime target.** Use a disposable/local PostgreSQL database and a synthetic or authorized test account; record only host class and hashes, never credentials/URLs. Apply server migrations twice and prove receipt/schema objects are unchanged. Do not run destructive scenarios against production data.
- [ ] **Step 2: build and restart the actual Web/API.** Run typecheck and production build from the feature SHA, stop the old isolated service, start the new artifact, and verify health plus unauthenticated/authenticated mutation envelopes. App and Web must point to this exact service/database.
- [ ] **Step 3: build/install an iOS Simulator release.** Use the feature source and exact API base URL. Record app build SHA, server SHA, database migration hash, simulator ID hash and test-account hash.
- [ ] **Step 4: exercise all four domains.** Offline create, update and delete disposable note/task/relationship-task/personal-schedule records; queue at least three operations on one entity; force-quit/relaunch; reconnect with network interruption during response; confirm FIFO, one server effect, alias replacement and identical Web canonical ID/revision.
- [ ] **Step 5: prove persistent idempotency.** Replay same command after Web restart and from a second process; confirm exact stored result and no duplicate domain activity. Replay same mutation ID with changed patch and confirm item-level permanent mismatch with zero write.
- [ ] **Step 6: prove every conflict.** Create revision mismatch from Web while App is offline, remote-delete a second record, and revoke a relationship connection/version for a third. Verify their distinct UI, allowed resolution actions, no silent overwrite/resurrection and continued syncing of unrelated entities.
- [ ] **Step 7: prove account lifecycle.** Expire the session with queued data, confirm encrypted queue remains locked and invisible to another account, reauthenticate the same actor and resume. Test all active-sign-out choices, including injected key/file deletion failure.
- [ ] **Step 8: prove negative boundaries.** Attempt meeting, invitation, registration, suggestion accept, permission/account and AI side-effect actions offline; every action must state online-only and produce no outbox row.
- [ ] **Step 9: prove AI truthfulness.** Before sync, query existing actor-scoped Note/Task/Followup/Schedule tools and observe only the old cloud value while App shows local-only. After `acknowledged`, query again and observe the new cloud canonical value. Exact per-record freshness remains 0036.
- [ ] **Step 10: run closing regressions.** Run all new suites, existing four-domain mutation/read tests, contract/schema sync, lifecycle/auth tests, both typechecks, production Web build and iOS build. Record exact pass/fail/skip counts; any required skipped acceptance remains incomplete.
- [ ] **Step 11: review and document.** Request spec and code-quality reviews. Write REPORT and Bridge handoff with RED→GREEN evidence, migration rerun, runtime IDs/hashes, conflict/account results, known limitations and exact SHAs.
- [ ] **Step 12: integrate and publish.** Run staged `gitnexus_detect_changes`, make path-limited commits, merge reviewed feature commits into `chat-agent`, compare the expected merge tree exactly, rerun mainline verification, restart mainline Web/App services, push, and verify `origin/chat-agent` equals the recorded local merge SHA.

## 验收契约（最多五项）

| SC | 可观察行为 | 必需证据 |
| --- | --- | --- |
| SC-0034-01 | 四域确认操作断网后加密持久排队、跨 App 重启可见，并按同实体 FIFO 上传 | v1→v2/outbox/overlay tests + Simulator offline/relaunch evidence |
| SC-0034-02 | base check、领域写、revision 和全局 receipt 同事务；重放只产生一次 server effect，ack 原子落地 | real PostgreSQL concurrency/fault tests + second-process replay + Web readback |
| SC-0034-03 | revision mismatch、remote delete、relationship ineligible 分开保存并只提供安全解决动作 | conflict tests + three live Web/App scenarios |
| SC-0034-04 | 401 保留并锁定原账号 outbox，主动登出需确认；另一账号不可见 | auth/lifecycle tests + Simulator expiry/account-switch/sign-out evidence |
| SC-0034-05 | pending 明示 AI 不可见，ack 后 Web/AI 才读到新 canonical 值；不支持动作永不入队 | UI/eligibility negatives + same-account Web/AI before/after evidence |

## 最小测试与检查

- 档位 H/I：认证写入、PostgreSQL 原子性、幂等、账号隔离、迁移、冲突、跨端与 AI 真实性。
- 开发按 Task 定向；收口包括四域既有 mutation/read suites、App 直接 screen tests、contract/schema parity、两端 typecheck、Web production build、iOS build 和真实 runtime acceptance。
- PostgreSQL 兼容性至少在项目标准 `pg` runtime 与一套无厂商扩展的干净 PostgreSQL 上验证。Neon/Supabase 是可选部署目标，不是代码依赖或完成证据。
- 不调用 Calendar/Gmail。真实 AI provider 验收统一在 0036；0034 使用现有 actor-scoped data-query tools 证明 cloud visibility 边界，不因 provider 缺失阻塞 outbox 正确性。

## 失败与交接

数据丢失、重复领域 effect、跨账号读取、receipt 与领域写 split commit、FIFO 破坏、无确认覆盖、删除复活、资格绕过、401 删除队列或 pending 被 AI 当作已同步均为硬失败。失败时保留加密 outbox 和用户输入，不以清库或换 mutation ID 掩盖。交接必须记录每域 RED→GREEN、Note CAS gate、v1→v2 migration hash、全局 receipt 重放、三类 conflict、账号生命周期、AI cloud visibility、feature SHA、`chat-agent` merge SHA、push 和 remote SHA。
