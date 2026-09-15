# Sprint 0034 Offline Personal Mutations Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Support durable, truthful offline mutations for four actor-private domains with idempotent replay and explicit user-resolved conflicts.

**Architecture:** Queue strict shared mutation envelopes in the encrypted Sprint 0032 outbox, upload through one authenticated batch route that delegates to existing domain services, and project pending overlays separately from canonical mirror rows.

**Tech Stack:** TypeScript/Zod, PostgreSQL transaction boundaries, existing Note/Task/PersonalSchedule services, Expo SQLite, React Native, SecureStore-authenticated API client, Node tests, production Web/API, iOS Simulator.

**Spec:** `repos/orbit-app/docs/sprints/0034-offline-personal-mutations/DESIGN.md`

## Global Constraints

- **原需求：** 半本地化存储且不每次上传下载；AI 必须能看笔记、待办、跟进、日程，但只能看到已同步内容。
- **依赖：** 0033 completed/merged，四域 read mirror 和 canonical revision 真实可用；run-01 记录实际 `chat-agent` SHA。
- 仅四个 actor-private 域允许离线。meeting/event/invitation/registration/chat/permissions/account deletion/provider/AI side effects 均 online-only。
- 保留现有领域校验、owner、association、expected-version 和 receipt 规则；批量入口不得绕过 domain service 直接写 `orbit_records`。
- 不采用 last-write-wins；冲突不自动覆盖任何一方。pending 不得标为 Web/AI 可见。
- Web/API/shared 变更后 production build/restart，再做同账号 Web/App/AI 验收。
- 单 Generator、逐符号 impact、TDD、提交前 detect_changes；commit 后合并 `chat-agent` 并复验。

---

### Task 1: Define and persist the outbox state machine

**Files:**
- Modify: `repos/orbits/shared/contract/sync.ts`
- Generated: `repos/orbit-app/src/api/contract/sync.ts`
- Create: `repos/orbit-app/src/data/sync/outbox-repository.ts`
- Create: `repos/orbit-app/src/data/sync/pending-overlay.ts`
- Create: `repos/orbit-app/tests/outbox-repository.test.ts`
- Create: `repos/orbit-app/tests/pending-overlay.test.ts`

- [ ] Write RED tests for durable enqueue, stable mutation ID, local ID mapping, per-entity FIFO, four-way state, restart, dedupe, account isolation, canonical/pending separation and tombstone overlay.
- [ ] Implement strict mutation schemas and repository transactions; reject forbidden kinds/operations and any client-supplied actor/workspace override.
- [ ] Implement pure pending overlay selectors that never mutate the canonical base and expose `aiAvailable=false` until acknowledgment.
- [ ] Sync contract copy and run the two tests plus contract-sync.

### Task 2: Add the authenticated server mutation batch

**Files:**
- Create: `repos/orbits/features/sync/mutation-service.ts`
- Create: `repos/orbits/app/api/sync/mutations/handler.ts`
- Create: `repos/orbits/app/api/sync/mutations/route.ts`
- Modify narrowly: `repos/orbits/features/notes/service.ts`
- Modify narrowly: `repos/orbits/features/tasks/service.ts`
- Modify narrowly: `repos/orbits/features/personal-schedule/service.ts`
- Create: `repos/orbits/tests/services/sync-mutation-service.test.ts`
- Create: `repos/orbits/tests/api/sync-mutations-route.test.ts`

- [ ] Write RED tests for one receipt per mutation, same-ID replay, same-ID/different-payload rejection, base-revision CAS, actor isolation, partial batch results, local→canonical ID mapping and forbidden domain rejection.
- [ ] Implement batch limit 50 and dispatch only through existing domain services. Add the smallest adapter needed to expose a common canonical revision; never weaken existing validators.
- [ ] Return per-item `acknowledged/conflict/retryable/permanent` with allowlisted canonical/conflict record; no partial item may be reported acknowledged before its domain transaction commits.
- [ ] Run both new server files plus existing notes/tasks/personal-schedule mutation suites and Web typecheck.

### Task 3: Build the uploader and conflict resolution core

**Files:**
- Create: `repos/orbit-app/src/data/sync/outbox-uploader.ts`
- Create: `repos/orbit-app/src/data/sync/conflict-resolution.ts`
- Create: `repos/orbit-app/src/hooks/useOfflineMutation.ts`
- Create: `repos/orbit-app/tests/outbox-uploader.test.ts`
- Create: `repos/orbit-app/tests/conflict-resolution.test.ts`

- [ ] Write RED tests for max-four cross-entity concurrency, same-entity FIFO, retry/backoff classification, cancellation, 401 scope pause, 409 blocking one entity, permanent validation failure and atomic acknowledgment.
- [ ] Implement uploader triggers for explicit retry and network recovery; background/foreground orchestration remains 0035 except the minimum current-session retry.
- [ ] Implement three explicit conflict commands using the server-returned revision; preserve original pending patch and never auto-select.
- [ ] Run uploader/conflict tests and App typecheck.

### Task 4: Wire the four domains and truthful UI

**Files:**
- Modify: `repos/orbit-app/src/screens/notes/NewNoteScreen.tsx`
- Modify: `repos/orbit-app/src/screens/notes/EditNoteScreen.tsx`
- Modify: `repos/orbit-app/src/screens/notes/NoteDetailScreen.tsx`
- Modify: `repos/orbit-app/src/screens/tasks/TasksScreen.tsx`
- Modify: `repos/orbit-app/src/screens/tasks/TaskDetailScreen.tsx`
- Modify: `repos/orbit-app/src/screens/followups/SavedFollowupsList.tsx`
- Modify: `repos/orbit-app/src/screens/schedule/PersonalScheduleScreen.tsx`
- Create: `repos/orbit-app/src/components/SyncStateNotice.tsx`
- Modify: `repos/orbit-app/src/i18n/messages.ts`, `zh.ts`, `ja.ts`, `en.ts`
- Modify direct interaction tests for those screens; create `repos/orbit-app/tests/offline-mutation-eligibility.test.ts`

- [ ] Add RED interaction tests for offline save, restart-visible pending, retry, conflict choices, local ID navigation, pending AI notice and blocked online-only operations.
- [ ] Route only user-confirmed four-domain actions through `useOfflineMutation`; preserve existing drafts and require current confirmation dialogs.
- [ ] Show localized per-record state and retry/conflict controls. Do not show global success while any selected operation is failed/conflicted.
- [ ] Run direct screen tests, locale contract test and App typecheck.

### Task 5: Runtime acceptance, report and integration

**Files:**
- Create after execution: `repos/orbit-app/docs/sprints/0034-offline-personal-mutations/REPORT.md`
- Modify: `repos/orbit-app/docs/sprints/README.md`
- Modify: `bridge/status.md`, `bridge/handoffs.md`
- Create: `bridge/requests/BR-0034-offline-personal-mutations.md`

- [ ] Rebuild/restart production Web/API; rebuild/install App and connect it to the exact service/database/account.
- [ ] Offline create/update/delete one disposable record in each domain, terminate/relaunch App, then reconnect and verify exactly-once Web readback and canonical ID/revision.
- [ ] Produce a real conflict from Web while App is offline; verify all three user choices and no silent loss. Prove an invitation or meeting action is rejected offline and absent from outbox.
- [ ] Before sync, query Orbit AI and verify freshness excludes pending; after acknowledgment, query again and verify the canonical revision is available.
- [ ] Run affected suites/typechecks, `gitnexus_detect_changes(scope="staged")`, path-limited commits, REPORT and coordinator merge-tree verification.

## 验收契约（最多五项）

| SC | 可观察行为 | 必需证据 |
| --- | --- | --- |
| SC-0034-01 | 四域用户确认操作断网后持久排队并跨 App 重启可见 | outbox/overlay + Simulator offline evidence |
| SC-0034-02 | 重试、崩溃和网络抖动下服务器只执行一次且 canonical ID/revision 原子落地 | server/uploader tests + Web readback |
| SC-0034-03 | 冲突保留本机与云端版本，三种用户选择可验证且无静默覆盖 | conflict tests + Web/App conflict scenario |
| SC-0034-04 | 不支持的多方/敏感操作离线明确失败且永不入队 | eligibility negative tests + Simulator |
| SC-0034-05 | pending 明示 AI 不可见，ack 后 AI 才能读取对应 canonical revision | AI freshness query before/after sync |

## 最小测试与检查

- 档位 H/I：认证写入、幂等、冲突、跨端与 AI 真实性。
- 开发按 Task 定向；收口包括四领域既有 mutation suites、App 直接 screen tests、两端 typecheck、Web production build、iOS build。
- 不调用 Calendar/Gmail 或付费 provider；AI 可用受控/已授权 provider，若真实 provider 不可用则 SC-05 未完成，不能用 mock 宣称完成。

## 失败与交接

数据丢失、重复写、跨账号、无确认覆盖或 pending 被 AI 当作已同步均为硬失败。保留 outbox 供恢复，不清除用户输入。交接记录每个领域的 RED→GREEN、失败分类、真实 conflict、AI freshness、固定 SHA 与 `chat-agent` merge SHA。
