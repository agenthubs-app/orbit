# Sprint 0033 Incremental Read Sync Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace repeated full GETs for four personal domains with stable cursor-based server deltas and a local-mirror-first App read path.

**Architecture:** Assign every canonical record change a database-monotonic `sync_revision`, project actor-owned records through one HMAC-cursor `/api/sync` endpoint, apply pages transactionally to the Sprint 0032 mirror, and expose domain selectors/hooks with explicit freshness. Existing mutation endpoints stay online-only.

**Tech Stack:** Next.js route handlers, PostgreSQL `orbit_records`, TypeScript/Zod shared contract, Expo SQLite, React hooks, Node test runner, production Web runtime, iOS Simulator.

**Spec:** `repos/orbit-app/docs/sprints/0033-incremental-read-sync/DESIGN.md`

## Global Constraints

- **原需求：** 不对每一次数据都上传和下载；App 可本地读取但云端保持权威。
- **基线与依赖：** 0032 completed 且已合并 `chat-agent`；run-01 记录实际 merge SHA。0031 性能结果作为请求次数/首屏延迟回归基线，不修改其原始证据。
- 只迁移 notes、tasks、confirmed relationship followups、personal schedule 的读取；contacts/inbox/events/meetings/chat 与所有写入不在本 Sprint 行为切换范围。
- actor/workspace 只来自服务器认证；cursor 绑定 scope、有硬上限、不可被客户端用来扩大集合。
- `/api/sync` 沿用共享 `{success,data}`／`{success:false,error}` envelope；reset 为 HTTP 409、`CONFLICT` 和 `context.syncErrorCode=SYNC_RESET_REQUIRED`，不新增裸错误协议。
- 服务端响应提供认证上下文确定的 `workspaceId`；App 将最后成功 workspace 写入加密 `sync_meta`，供离线重启时镜像优先读取。
- `orbit_records/tasks` 在 wire 和镜像中一律为 `kind=task`；人脉跟进由 `task.category=relationship` 本地派生，不进行双投影。
- 增量响应必须经领域 allowlist mapper，不能直接下发任意 JSONB payload。
- Web/API 或共享 contract 修改后必须 production build、停止旧进程、启动新产物，再让 Simulator 验收。
- 单 Generator、TDD、编辑既有符号前 impact、提交前 detect_changes；最终 commit→merge `chat-agent`→合并树验证。

---

### Task 1: Implement the stable server cursor and route

**Files:**
- Create: `repos/orbits/features/sync/cursor.ts`
- Create: `repos/orbits/features/sync/migrations.ts`
- Create: `repos/orbits/features/sync/read-service.ts`
- Create: `repos/orbits/app/api/sync/handler.ts`
- Create: `repos/orbits/app/api/sync/route.ts`
- Modify: `repos/orbits/shared/contract/sync.ts`
- Modify: `repos/orbits/shared/storage/migrations.ts`
- Create: `repos/orbits/tests/services/incremental-sync.test.ts`
- Create: `repos/orbits/tests/services/sync-migrations.test.ts`
- Create: `repos/orbits/tests/api/sync-route.test.ts`

- [ ] Write RED tests for monotonic migration/backfill, bootstrap, multi-page high-watermark stability, concurrent insert, update after page one, deletion tombstone, limit 1/200 bounds, malformed/foreign actor cursor, missing secret, shared envelope, authenticated `workspaceId` and secret-field exclusion.
- [ ] Add database-generated `sync_revision` for every `orbit_records` insert/update/delete; wire the idempotent migration through `runOrbitRecordsMigration`. Backfill before NOT NULL, never move the sequence below its current value, verify zero NULL/duplicates, install the trigger and a filtered `(workspace_id,user_id,sync_revision)` read index.
- [ ] For notes/tasks/personal_schedule writes, acquire one transaction-scoped advisory lock before allocating revision so commit visibility follows revision order; prove with two overlapping real PostgreSQL transactions plus rollback-gap recovery. Do not serialize unrelated collections.
- [ ] Implement a versioned HMAC-SHA256 cursor requiring at least 32 UTF-8 secret bytes, canonical base64url and constant-time signature verification, with a frozen 24-hour TTL, default limit 100, hard limit 200 and maximum encoded token length 2048. The actor-scoped query orders only by the unique revision. A row moved above the current high-watermark must arrive in the immediately following delta.
- [ ] Return reset-required through the shared HTTP 409 failure envelope without leaking scope internals; secret rotation intentionally resets old cursors. No cursor or query may accept actorId/workspaceId as authority.
- [ ] Use only `kind=task` for every tasks row; relationship selection remains an App-side category filter. Keep task activities/reminders out of the sync payload; enforce 256 KiB per mapped payload and 1 MiB per success envelope without silent truncation.
- [ ] Run service/route/migration tests, a real PostgreSQL migration rerun/concurrent-write check, Web typecheck and production build.

### Task 2: Build the App sync coordinator and freshness policy

**Files:**
- Create: `repos/orbit-app/src/data/sync/sync-client.ts`
- Create: `repos/orbit-app/src/data/sync/sync-coordinator.ts`
- Create: `repos/orbit-app/src/data/sync/sync-freshness.ts`
- Create: `repos/orbit-app/src/hooks/useSyncedCollection.ts`
- Modify: `repos/orbit-app/src/data/sync/local-sync-repository.ts`
- Create: `repos/orbit-app/tests/incremental-sync-coordinator.test.ts`
- Create: `repos/orbit-app/tests/sync-freshness.test.ts`
- Modify: `repos/orbit-app/tests/local-sync-repository.test.ts`

- [ ] Write RED tests for cold bootstrap, encrypted last-workspace recovery, resume from cursor, single-flight, explicit refresh, 5-minute TTL, foreground after 60 seconds, partial-page failure, reset-required, cancellation, account/workspace switch and stale-response suppression.
- [ ] Implement sequential bounded page pulls and atomic page/cursor commits; never mark bootstrap complete until final page.
- [ ] Persist the authenticated response `workspaceId` in `sync_meta`. Add one local transaction that clears only that workspace's `synced` canonical rows and cursor for reset; preserve pending/conflicted/failed rows, outbox and device-only drafts.
- [ ] Expose mirror state immediately and sync state separately; network failure with mirror returns stale data, while empty mirror returns failure.
- [ ] Run the two new App test files plus `contract-sync.test.ts`.

### Task 1b: Add the missing actor-scoped Note tombstone mutation

**Files:**
- Modify: `repos/orbits/app/api/notes/[id]/route.ts`
- Modify: `repos/orbits/app/api/notes/[id]/handler.ts`
- Modify: `repos/orbits/features/notes/contract.ts`
- Modify: `repos/orbits/features/notes/note-record.ts`
- Modify: `repos/orbits/features/notes/service.ts`
- Modify: `repos/orbits/features/notes/repository.ts`
- Modify direct tests: `repos/orbits/tests/api/notes-routes.test.ts`, `repos/orbits/tests/services/notes-service.test.ts`, plus the incremental-sync tombstone integration test

- [ ] Write RED tests for actor isolation, required `expectedVersion` and `idempotencyKey`, same-key replay, same-key/different-command rejection, version conflict, soft-delete visibility and one sync tombstone revision.
- [ ] Add only the missing online Note DELETE path. It must authenticate actor/workspace on the server, use the existing shared envelope, persist a canonical soft-delete rather than physical SQL deletion, and preserve the commit-ordered sync revision contract. Do not add offline mutation behavior or broaden another domain.
- [ ] Prove GET/list hide the deleted Note while `/api/sync` returns its delete change; production-build and restart the isolated Web verification service after the change.

### Task 3: Switch four read consumers without changing writes

**Files:**
- Modify: `repos/orbit-app/src/screens/notes/NotesScreen.tsx`
- Modify: `repos/orbit-app/src/screens/notes/NoteDetailScreen.tsx`
- Modify: `repos/orbit-app/src/screens/notes/NewNoteScreen.tsx`
- Modify: `repos/orbit-app/src/screens/notes/EditNoteScreen.tsx`
- Modify: `repos/orbit-app/src/screens/tasks/TasksScreen.tsx`
- Modify: `repos/orbit-app/src/screens/tasks/TaskDetailScreen.tsx`
- Modify: `repos/orbit-app/src/screens/schedule/PersonalScheduleList.tsx`
- Modify: `repos/orbit-app/src/screens/schedule/PersonalScheduleScreen.tsx`
- Modify only for domain snapshot retirement: `repos/orbit-app/src/data/snapshot-store.ts`
- Modify for the same narrow API export: `repos/orbit-app/src/data/snapshot-store.web.ts`
- Modify locale copy: `repos/orbit-app/src/i18n/messages.ts`, `repos/orbit-app/src/i18n/zh.ts`, `repos/orbit-app/src/i18n/ja.ts`, `repos/orbit-app/src/i18n/en.ts`
- Modify direct tests: `repos/orbit-app/tests/notes-list-interactions.test.tsx`, `repos/orbit-app/tests/notes-interactions.test.ts`, `repos/orbit-app/tests/task-list-scope.test.ts`, `repos/orbit-app/tests/task-detail-interactions.test.ts`, `repos/orbit-app/tests/followups-screen-source.test.ts`, `repos/orbit-app/tests/personal-schedule-interactions.test.ts`, `repos/orbit-app/tests/schedule-screen-source.test.ts`, `repos/orbit-app/tests/snapshot-store.test.ts`, plus new/expanded `TasksScreen` and `PersonalScheduleList` behavior harnesses and the existing locale workflow tests for freshness copy

- [ ] For each domain, first change its interaction/source test to require mirror-first state, visible last-sync/failure semantics and no duplicate GET inside TTL; preserve a focused RED before editing the screen.
- [ ] Replace only read resource wiring. `/followups` already redirects to `TasksScreen`, so its relationship view derives from mirrored tasks instead of reviving dead `SavedFollowupsList`. Keep existing POST/PATCH/DELETE handlers online and require their current receipts; after successful writes, trigger an immediate delta refresh.
- [ ] Include note create/edit success paths in that refresh rule: a successful POST/PATCH must publish an immediate delta refresh before the mirror-backed detail is treated as current. Do not add a second fetch or optimistic cloud-canonical record.
- [ ] In `TaskDetailScreen`, only the primary task record comes from the mirror; `/activities` and reminders stay online and retain their existing error semantics. Contact-embedded note editors remain online in this Sprint; only the listed Notes collection/detail screens switch.
- [ ] Add a narrow, identically exported native/Web snapshot-retirement API. After a completed bootstrap, clear only exact snapshot keys proven to have no remaining legacy reader. Shared root keys such as `/api/tasks` and `/api/schedule-items` remain until Schedule/Home/Profile/AI/ContactPipeline consumers migrate; task activities/reminders and every unrelated snapshot are explicitly excluded. Do not change `readSnapshot`, `writeSnapshot`, `clearSnapshots` or `useApiResource` semantics.
- [ ] Run every listed direct test and App typecheck.

### Task 4: Cross-client runtime acceptance and delivery

2026-09-16 管理线批准的必要文件补充（保留原 SC）：补充前 Planner SHA256
`f28384ff4c6ec8e597cc7ef5a49f7bddfb4be1c4b427fcf485bb4a5aabab6540`。
先单独提交本范围修订，再 TDD 实现以下验收工具；不修改业务符号，不合并或推送。

**Files:**
- Create: `repos/orbits/scripts/verify-incremental-sync-runtime.mjs` — 固定测试清单、loopback 专用数据库只读预检、最小子进程环境、脱敏计数；App 测试仅从显式指定且版本一致的 App checkout 执行。
- Create: `repos/orbits/tests/services/incremental-sync-runtime-harness.test.mjs` — TDD 覆盖拒绝未知数据库/URL 绕过/环境污染、固定测试选择、失败/跳过/超时 fail-closed、无敏感输出。
- Create after execution: `repos/orbit-app/docs/sprints/0033-incremental-read-sync/REPORT.md`
- Modify: `repos/orbit-app/docs/sprints/README.md`
- Modify: `bridge/status.md`, `bridge/handoffs.md`
- Create: `bridge/requests/BR-0033-incremental-read-sync.md`
- Modify: `bridge/history.md`
- Modify if capability state changes: `bridge/capabilities.md`

- [ ] Apply the real sync migration, production-build/restart Web/API, record commit/address/health/database/account hash, then install the current App build connected to that exact base URL.
- [ ] Harness preparation: reuse existing migration/actor-scoped CRUD/cursor rotation/reset and App offline stale/recovery tests. Require explicit dedicated local test database identity plus a read-only test marker before any write test; reject unknown targets. Do not inherit business/provider credentials or load env files. Emit only fixed-key hashes/booleans/counts, never raw subprocess output, URLs, cookies, cursors or records. Temporary credentials/cookies, if needed, use mode 0600 and finally cleanup. Failed, missing, skipped, timed-out or cleanup-failed checks remain incomplete. Automated harness success is not Simulator or production-service acceptance.
- [ ] Second-review hardening: run only from an owned mode-0700 snapshot made by `git archive` of the verified clean common HEAD, validate paths and blob content before dependency symlinks, and remove the snapshot in finally. Compare official schema-only pg_dump output against an owned unique template0 control database in the same cluster; include ACL/settings checks outside that dump. Never drop/recreate the supplied target; verify control identity/owner before its cleanup. Cover original-tree dirty→restore, archive/extract/link/cleanup failures, custom access method, enum/domain, non-owner, DB settings/ACL and final residue with real fixtures.
- [ ] For each of four domains create/update/delete one authorized disposable record in Web, foreground/refresh App, and prove the exact revision/tombstone arrives without full collection refetch.
- [ ] Disable network and prove cached content remains with stale status; restore network and prove cursor recovery. Test invalid cursor recovery without losing device-only drafts.
- [ ] Run affected Web/App tests and typechecks once, `git diff --check`, `gitnexus_detect_changes(scope="staged")` and path-limited commits; report fixed SHA and merge-tree verification.

## 验收契约（最多五项）

| SC | 可观察行为 | 必需证据 |
| --- | --- | --- |
| SC-0033-01 | migration 可幂等重跑；bootstrap/delta 在并发分页、同时间戳和删除下不漏不重 | real PostgreSQL migration + server service/route RED→GREEN |
| SC-0033-02 | actor/cursor/字段严格隔离，越权或秘密字段不能出现在响应 | negative route tests |
| SC-0033-03 | 四域页面镜像优先，TTL 内无旧集合 GET，刷新/恢复会增量同步；关系跟进不产生第二份 task | coordinator/freshness/screen tests |
| SC-0033-04 | 网络失败保留本地内容并显示同步状态；空镜像与无效 cursor 有真实恢复 | failure injection + Simulator |
| SC-0033-05 | 同账号 Web 的四域增删改以相同 revision/tombstone到达 App | production Web/API + Simulator 双端证据 |

## 最小测试与检查

- 档位 H/I：共享 API、认证读取、缓存替换及跨端状态发生变化。
- 开发定向集按 Task；收口运行列明的 server route/service、App coordinator/screen/snapshot 直接消费者与两端 typecheck。
- Web production build/restart 与同账号运行证据为必需；不调用外部 Calendar/Gmail/provider，不跑无关视觉矩阵。

## 失败与交接

任一分页漏数、actor 越界、删除复活或空镜像伪装成功均为硬失败。失败时保留现有在线写入和可回退的旧读取路径，不继续 0034。交接列 RED→GREEN、请求计数、revision/tombstone、服务版本、最终 SHA 与 `chat-agent` merge SHA。
