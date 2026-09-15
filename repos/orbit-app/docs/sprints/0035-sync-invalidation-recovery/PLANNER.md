# Sprint 0035 Provider-Neutral Invalidation and Recovery Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Detect server changes through a provider-neutral PostgreSQL status boundary and reliable cursor recovery, while leaving realtime/push delivery as replaceable latency adapters.

**Architecture:** Query the Sprint 0033 monotonic `sync_revision` through one content-free actor-scoped status endpoint, poll it at a bounded foreground interval, accept optional hints through an injected transport interface, and always repair through outbox-then-delta on launch, foreground, reconnect and manual refresh.

**Tech Stack:** Portable PostgreSQL SQL, Next.js route handlers, Expo React Native AppState/Notifications, TypeScript, Node tests, production Web/API, iOS Simulator; optional provider adapter selected after deployment choice.

**Spec:** `repos/orbit-app/docs/sprints/0035-sync-invalidation-recovery/DESIGN.md`

## Global Constraints

- **原需求：** 减少每次上传下载并保持 Web/App 一致；半本地方案不能因 iOS 后台限制丢数据，且不能预设一定使用 Supabase，部署也可能采用 Neon 或其他 PostgreSQL provider。
- **依赖：** 0034 completed/merged；sync cursor、outbox、conflict 与 scope lifecycle 均有通过证据。
- 必需 status endpoint 与 polling adapter 只返回 content-free watermark/kinds；不能下发业务 payload、作为完成 receipt 或代替 cursor。
- status 沿用共享 envelope（304 是唯一无 body 例外），返回认证 `workspaceId` 和三种 wire kind；relationship followup 由 task category 派生。
- `afterRevision` 只来自已提交 highWatermark；非法／未来／过期值复用 0033 的 reset-required 409 与保留 pending/outbox/drafts 的事务。
- Supabase、Neon、独立 relay 和 push 均属于可选适配器。没有可选 realtime 时，15 秒前台 status check、启动、foreground 和手动刷新仍须满足全部正确性 SC。
- iOS 后台执行是 best-effort；完成声明必须依赖启动/foreground/manual 的确定性恢复。
- Web/API/shared 改动后 production build/restart；同一数据库/账号进行 Web→App runtime 验收。
- 单 Generator、impact、TDD、detect_changes、commit、merge `chat-agent`、合并树验证、push 并记录 remote SHA。

---

### Task 1: Implement the provider-neutral invalidation status boundary

**Files:**
- Modify: `repos/orbits/shared/contract/sync.ts`
- Generated: `repos/orbit-app/src/api/contract/sync.ts`
- Create: `repos/orbits/features/sync/invalidation-status-service.ts`
- Create: `repos/orbits/app/api/sync/status/handler.ts`
- Create: `repos/orbits/app/api/sync/status/route.ts`
- Create: `repos/orbits/tests/services/sync-invalidation-status.test.ts`
- Create: `repos/orbits/tests/api/sync-status-route.test.ts`

- [ ] Write RED tests for committed `afterRevision`, latest watermark, deduplicated three-kind projection, relationship-task invalidation, no-change response, 100-change collapse, actor/workspace isolation, invalid/negative/future/expired revision, reset envelope and absence of IDs/payload/secrets.
- [ ] Implement one portable query over `orbit_records.sync_revision`, restricted to the three collections/four logical domains and server-injected actor/workspace. Return only trusted `workspaceId`, `latestRevision`, `changedKinds`, `emittedAt` and contract metadata.
- [ ] Expose the authenticated route with conditional response/ETag support; client-provided actor/workspace fields are rejected and status reads never mutate business data.
- [ ] Run both new server tests, 0033 incremental-sync tests and Web typecheck against local PostgreSQL; keep the SQL free of provider-specific extensions.

### Task 2: Implement the App subscription and coalescer

**Files:**
- Create: `repos/orbit-app/src/data/sync/invalidation-transport.ts`
- Create: `repos/orbit-app/src/data/sync/polling-invalidation-transport.ts`
- Create: `repos/orbit-app/src/data/sync/sync-trigger-coordinator.ts`
- Create: `repos/orbit-app/tests/sync-trigger-coordinator.test.ts`
- Create: `repos/orbit-app/tests/polling-invalidation-transport.test.ts`

- [ ] Write RED tests for immediate foreground check, 15-second upper-bound interval, background stop, 250ms optional-hint coalescing, single-flight/rerun-once, duplicate/older watermark, malformed kind, disconnect/reconnect, unsubscribe-before-account-switch and manual refresh bypass.
- [ ] Implement the transport interface, authenticated polling adapter and coordinator using the existing Orbit client. The interface must allow a later Supabase, Neon-compatible relay or push adapter without changing coordinator/outbox/cursor code.
- [ ] Do not write hint payloads into entity tables. Mark only the scope dirty and invoke 0034 uploader followed by 0033 delta.
- [ ] Run polling/coordinator tests, auth lifecycle tests and App typecheck.

### Task 3: Connect launch, foreground, network and notification recovery

**Files:**
- Create: `repos/orbit-app/src/components/OrbitSyncCoordinator.tsx`
- Modify: `repos/orbit-app/app/_layout.tsx`
- Modify: `repos/orbit-app/src/components/OrbitNotificationsCoordinator.tsx`
- Modify: `repos/orbit-app/src/api/AuthSessionProvider.tsx`
- Create: `repos/orbit-app/tests/orbit-sync-lifecycle.test.tsx`

- [ ] Write RED lifecycle tests for authenticated launch, 15-second foreground ticks, <60s and >60s background, killed/relaunched App, network recovery ordering, optional notification response, logout race and stale callback suppression.
- [ ] Mount one coordinator at the authenticated root. Run outbox before delta; surface conflicts/failures but keep independent entities progressing.
- [ ] Use existing notification response only as a hint plus allowlisted navigation; never trust notification data as a record or receipt.
- [ ] Run lifecycle/auth/notification tests and App typecheck.

### Task 4: Add redacted observability and storm budgets

**Files:**
- Create: `repos/orbit-app/src/data/sync/sync-observability.ts`
- Create: `repos/orbit-app/tests/sync-observability.test.ts`
- Modify: `repos/orbits/features/sync/read-service.ts`
- Modify: `repos/orbits/tests/services/incremental-sync.test.ts`

- [ ] Write RED tests that reject secret/content-shaped fields and assert one delta for 100 server changes collapsed into one status response, one sync for 100 optional hints in 250ms, bounded retry sequence, one rerun during in-flight work and cursor-lag reporting.
- [ ] Implement numeric/status-only observations. Preserve failed attempts and never normalize away delay/error rows.
- [ ] Run observability/coordinator/server sync tests; compare request count and p95 against Sprint 0031 baseline, requiring no >10% regression on unchanged scenarios.

### Task 5: Runtime acceptance and delivery

**Files:**
- Create after execution: `repos/orbit-app/docs/sprints/0035-sync-invalidation-recovery/REPORT.md`
- Modify: `repos/orbit-app/docs/sprints/README.md`
- Modify: `bridge/status.md`, `bridge/handoffs.md`
- Create: `bridge/requests/BR-0035-sync-invalidation-recovery.md`

- [ ] Build/restart production Web/API and current App against local PostgreSQL or the configured PostgreSQL provider; record only a redacted provider/environment identifier.
- [ ] Web-update each of four domains and prove foreground App detects the new watermark within 15 seconds and performs one delta; create 100 changes and prove the status endpoint collapses them without full payload transfer.
- [ ] Background/kill App, change and delete records while no transport runs, relaunch/foreground and prove cursor repair. Repeat with network loss and account switch.
- [ ] Run the same status/service conformance test against the selected remote provider if one is configured. Absence of a provider decision does not block the portable core; any optional adapter is a separately recorded addendum.
- [ ] Run affected suites/typechecks/builds, `gitnexus_detect_changes(scope="staged")`, path-limited commits, REPORT, merge-tree verification, push and remote-SHA verification.

## 验收契约（最多五项）

| SC | 可观察行为 | 必需证据 |
| --- | --- | --- |
| SC-0035-01 | 认证 status 只返回 watermark/kinds，跨账号或 payload/ID 请求被拒绝 | service/route negative tests |
| SC-0035-02 | 前台 Web 写入在 15 秒内触发一次 delta，100 次变化不造成 payload 下载或请求风暴 | production Web/App + coordinator budget |
| SC-0035-03 | 丢提示、杀进程、后台和断网后由 cursor 补齐增删改 | lifecycle tests + Simulator recovery |
| SC-0035-04 | logout/account switch 取消旧 transport/timer，旧 callback 不污染新 scope | auth/lifecycle race tests |
| SC-0035-05 | 核心在普通 PostgreSQL 上通过，同一接口可在已选远端 provider 复用且不依赖供应商 SDK | provider-conformance suite + dependency audit |

## 最小测试与检查

- 档位 H/I：认证同步状态、共享 revision 查询、App 根生命周期。
- 定向集为 status service/route、polling/coordinator/lifecycle/observability；收口加四域 mutation/sync 回归、两端 typecheck、Web production build 与 iOS build。
- 不安装或配置 Supabase/Neon SDK，不创建供应商 migration。未来选定 provider 时只在 transport interface 后增加适配器并复用本 Sprint conformance tests。

## 失败与交接

跨账号状态读取、status/hint 含正文、请求风暴、供应商特有 SQL 渗入核心或恢复漏数据均为硬失败。交接明确实际 PostgreSQL provider、可选 transport 是否配置、无 transport 路径、丢提示恢复、请求预算、本线最终 SHA、`chat-agent` merge SHA、push 与 remote SHA。
