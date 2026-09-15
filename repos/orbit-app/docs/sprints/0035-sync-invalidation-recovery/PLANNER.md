# Sprint 0035 Sync Invalidation and Recovery Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add private realtime invalidation hints and reliable cursor recovery without making realtime transport authoritative.

**Architecture:** Project four-domain writes into a content-free, actor-scoped invalidation table, subscribe through a short-lived authenticated Supabase Realtime token, coalesce hints in the App, and always repair through outbox-then-delta on launch, foreground, reconnect and manual refresh.

**Tech Stack:** Supabase Realtime Broadcast/RLS, Next.js/Vercel-compatible server adapters, PostgreSQL, Expo React Native AppState/Notifications, TypeScript, Node tests, production Web/API, iOS Simulator.

**Spec:** `repos/orbit-app/docs/sprints/0035-sync-invalidation-recovery/DESIGN.md`

## Global Constraints

- **原需求：** 减少每次上传下载并保持 Web/App 一致；半本地方案不能因 iOS 后台限制丢数据。
- **依赖：** 0034 completed/merged；sync cursor、outbox、conflict 与 scope lifecycle 均有通过证据。
- Realtime 只发 content-free hint；不能下发业务 payload、作为完成 receipt 或代替 cursor。
- Supabase 未配置时功能必须降级为 foreground/manual recovery，不能使用公开 channel 或硬编码 key。
- iOS 后台执行是 best-effort；完成声明必须依赖启动/foreground/manual 的确定性恢复。
- Web/API/shared 改动后 production build/restart；同一数据库/账号进行 Web→App runtime 验收。
- 单 Generator、impact、TDD、detect_changes、commit、merge `chat-agent`、合并树验证。

---

### Task 1: Define content-free invalidation storage and private authorization

**Files:**
- Modify: `repos/orbits/shared/contract/sync.ts`
- Generated: `repos/orbit-app/src/api/contract/sync.ts`
- Create: `repos/orbits/features/sync/realtime-migrations.ts`
- Create: `repos/orbits/tests/services/sync-realtime-migrations.test.ts`
- Create: `repos/orbits/features/sync/realtime-token-service.ts`
- Create: `repos/orbits/app/api/sync/realtime-token/handler.ts`
- Create: `repos/orbits/app/api/sync/realtime-token/route.ts`
- Create: `repos/orbits/tests/api/sync-realtime-token-route.test.ts`

- [ ] Write RED tests for a dedicated `sync_invalidation_events` table/trigger covering only the four collections, strict content-free columns, actor/workspace RLS, bounded retention, and no event before a business transaction commits.
- [ ] Implement migration SQL in `realtime-migrations.ts`: trigger inserts one actor-scoped row after an allowed `orbit_records` change; no record ID/payload is copied, and cleanup removes expired hints without touching business records.
- [ ] Implement a server-only token service and authenticated route that issues a five-minute Realtime JWT bound to the session actor/workspace; reject client actor claims and omit all Supabase secrets from responses/logs.
- [ ] Run migration/RLS, token route and four-domain mutation regressions; do not apply a remote migration without the existing migration review gate.

### Task 2: Implement the App subscription and coalescer

**Files:**
- Create: `repos/orbit-app/src/data/sync/invalidation-transport.ts`
- Create: `repos/orbit-app/src/data/sync/supabase-invalidation-transport.ts`
- Create: `repos/orbit-app/src/data/sync/sync-trigger-coordinator.ts`
- Create: `repos/orbit-app/tests/sync-trigger-coordinator.test.ts`
- Modify package/config files only if the selected official Supabase client is not already present: `repos/orbit-app/package.json`, `package-lock.json`, `app.config.ts`

- [ ] Write RED tests for 250ms coalescing, single-flight/rerun-once, duplicate/older watermark, malformed kind, foreign scope, disconnect/reconnect, unsubscribe-before-account-switch and manual refresh bypass.
- [ ] Implement an injected transport and coordinator; fetch the short-lived token through the current Orbit session, never embed service-role/JWT secrets, and make disabled configuration an explicit recovery-only state.
- [ ] Do not write hint payloads into entity tables. Mark only the scope dirty and invoke 0034 uploader followed by 0033 delta.
- [ ] Run coordinator tests, auth lifecycle tests and App typecheck.

### Task 3: Connect launch, foreground, network and notification recovery

**Files:**
- Create: `repos/orbit-app/src/components/OrbitSyncCoordinator.tsx`
- Modify: `repos/orbit-app/app/_layout.tsx`
- Modify: `repos/orbit-app/src/components/OrbitNotificationsCoordinator.tsx`
- Modify: `repos/orbit-app/src/api/AuthSessionProvider.tsx`
- Create: `repos/orbit-app/tests/orbit-sync-lifecycle.test.tsx`

- [ ] Write RED lifecycle tests for authenticated launch, <60s and >60s background, killed/relaunched App, network recovery ordering, notification response, logout race and stale callback suppression.
- [ ] Mount one coordinator at the authenticated root. Run outbox before delta; surface conflicts/failures but keep independent entities progressing.
- [ ] Use existing notification response only as a hint plus allowlisted navigation; never trust notification data as a record or receipt.
- [ ] Run lifecycle/auth/notification tests and App typecheck.

### Task 4: Add redacted observability and storm budgets

**Files:**
- Create: `repos/orbit-app/src/data/sync/sync-observability.ts`
- Create: `repos/orbit-app/tests/sync-observability.test.ts`
- Modify: `repos/orbits/features/sync/read-service.ts`
- Modify: `repos/orbits/tests/services/incremental-sync.test.ts`

- [ ] Write RED tests that reject secret/content-shaped fields and assert one sync for 100 hints in 250ms, bounded retry sequence, one rerun during in-flight work and cursor-lag reporting.
- [ ] Implement numeric/status-only observations. Preserve failed attempts and never normalize away delay/error rows.
- [ ] Run observability/coordinator/server sync tests; compare request count and p95 against Sprint 0031 baseline, requiring no >10% regression on unchanged scenarios.

### Task 5: Runtime acceptance and delivery

**Files:**
- Create after execution: `repos/orbit-app/docs/sprints/0035-sync-invalidation-recovery/REPORT.md`
- Modify: `repos/orbit-app/docs/sprints/README.md`
- Modify: `bridge/status.md`, `bridge/handoffs.md`
- Create: `bridge/requests/BR-0035-sync-invalidation-recovery.md`

- [ ] Build/restart production Web/API and current App; record Supabase project/environment only as a redacted identifier.
- [ ] Web-update each of four domains and prove foreground App receives one hint-driven delta; burst 100 hints and prove bounded requests.
- [ ] Background/kill App, change and delete records while no subscription runs, relaunch/foreground and prove cursor repair. Repeat with network loss and account switch.
- [ ] Run affected suites/typechecks/builds, `gitnexus_detect_changes(scope="staged")`, path-limited commits, REPORT and merge-tree verification.

## 验收契约（最多五项）

| SC | 可观察行为 | 必需证据 |
| --- | --- | --- |
| SC-0035-01 | 私有 hint 不含内容且跨账号无法订阅/触发 | contract/publisher/RLS negative tests |
| SC-0035-02 | 前台 Web 写入经 hint 触发 delta，100 条突发不造成请求风暴 | production Web/App + coordinator budget |
| SC-0035-03 | 丢 hint、杀进程、后台和断网后由 cursor 补齐增删改 | lifecycle tests + Simulator recovery |
| SC-0035-04 | logout/account switch 取消旧 transport，旧 callback 不污染新 scope | auth/lifecycle race tests |
| SC-0035-05 | 未配置 Realtime 时明确降级且 foreground/manual 仍一致 | no-op transport + runtime fallback |

## 最小测试与检查

- 档位 H/I：认证实时通道、共享写后事件、App 根生命周期。
- 定向集为 publisher/RLS/coordinator/lifecycle/observability；收口加四域 mutation/sync 回归、两端 typecheck、Web production build 与 iOS build。
- 仅在有授权测试 Supabase 时应用 migration；缺该环境则产品代码可提交，但 runtime/RLS SC 未完成，Sprint 只能 blocked。

## 失败与交接

跨账号订阅、hint 含正文、请求风暴、业务写因发布失败回滚或恢复漏数据均为硬失败。交接明确 Realtime 是否真实配置、降级路径、丢消息恢复、请求预算、本线最终 SHA 和 `chat-agent` merge SHA。
