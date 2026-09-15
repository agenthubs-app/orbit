# Sprint 0036 AI Sync Visibility and Acceptance Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make server-side AI freshness truthful for four personal data tools, surface unsynced App blind spots, and close the hybrid-sync rollout with cross-platform evidence and an updated private Data Atlas.

**Architecture:** Extend the existing actor-query result/artifact/visibility contracts with canonical revision metadata, derive a content-free pending-domain notice from the App outbox, and verify one record through cloud, App mirror and AI rather than giving AI direct access to device storage.

**Tech Stack:** Existing Orbit AI tool registry/runtime, TypeScript/Zod, Next.js production API, Expo SQLite/React Native, Gemini-compatible provider boundary, Node tests, iOS Simulator, Sites publishing workflow.

**Spec:** `repos/orbit-app/docs/sprints/0036-ai-sync-visibility-acceptance/DESIGN.md`

## Global Constraints

- **原需求：** AI 必须能按用户指令选择并读取笔记、任务、跟进和日程；同时全面说明数据原型、存储、接口统一性和错误使用。
- **依赖：** 0035 completed/merged；0029 的四个 AI tools 仍通过；0032–0035 的 runtime evidence 可复现。
- AI 只读 cloud canonical。不得上传本地正文、绕过同步、扩大字段 allowlist 或暗示 pending 已可见。
- App 的 pending notice 是客户端真实性状态；provider outcome 的 freshness 必须来自服务器实际读取。
- 数据站点保持私有、脱敏并与提交文档同源；发布内容不得包含真实账号、记录、密钥、数据库 URL 或日志。
- Web/API/shared 改动后 production build/restart；AI runtime 验收使用明确授权的 provider 和同一账号。
- 单 Generator、impact、TDD、detect_changes、commit、merge `chat-agent`；最终全量只在合并树运行一次。

---

### Task 1: Add canonical freshness to all four AI query tools

**Files:**
- Modify: `repos/orbits/features/orbit-ai/data-query/query-service.ts`
- Modify: `repos/orbits/features/orbit-ai/data-query/query-artifact-service.ts`
- Modify: `repos/orbits/features/orbit-ai/data-visibility/manifest.ts`
- Modify: `repos/orbits/features/orbit-ai/gemini-provider.ts`
- Modify: `repos/orbits/features/orbit-ai/live-agent-runtime.ts`
- Modify: `repos/orbits/tests/capabilities/orbit-ai-actor-query-tools.test.ts`
- Modify: `repos/orbits/tests/architecture/ai-visibility-manifest.test.ts`
- Modify: `repos/orbits/tests/capabilities/orbit-ai-query-routing.test.ts`

- [ ] Write RED tests requiring `cloud_canonical`, server read time and item revision/updatedAt for notes/tasks/followups/schedule; cover empty, get/list/search, truncated/nextCursor and deleted records.
- [ ] Add source revision mapping at the repository/service boundary; never synthesize revision from result order or App cursor.
- [ ] Extend artifact and provider guidance so truncated data is described as partial and stale revision is not called current after a known conflict.
- [ ] Run the three focused suites plus prompt-injection/trace tests and Web typecheck.

### Task 2: Surface the App pending AI blind spot

**Files:**
- Create: `repos/orbit-app/src/data/sync/ai-sync-visibility.ts`
- Modify: `repos/orbit-app/src/screens/ai/AiScreen.tsx`
- Modify: `repos/orbit-app/src/screens/ai/AiConversationScreen.tsx`
- Modify: `repos/orbit-app/src/i18n/messages.ts`, `zh.ts`, `ja.ts`, `en.ts`
- Create: `repos/orbit-app/tests/ai-sync-visibility.test.ts`
- Modify: `repos/orbit-app/tests/ink-signal-ai-conversation.test.ts`

- [ ] Write RED tests for pending/conflicted/failed domain counts, no content exposure, notice persistence across AI send/result, exact removal only after canonical acknowledgment+delta, locale parity and account switch.
- [ ] Implement a pure outbox summary and one reusable notice. Do not append local record content or a false tool outcome to the model request.
- [ ] Ensure pending warning coexists with provider/network errors and cannot be dismissed as though synchronization succeeded.
- [ ] Run both App AI tests, sync/outbox direct tests and App typecheck.

### Task 3: Execute the cross-platform data truth matrix

**Files:**
- Create during execution: `build/harness-state/evidence/sprint-0036/run-01/data-truth-matrix.json`
- Create during execution: `build/harness-state/evidence/sprint-0036/run-01/environment.md`

- [ ] Production-build/restart Web/API and rebuild/install the current App against the same redacted database/account; confirm health and exact commits.
- [ ] For each of notes/tasks/followups/personal schedule, prove online Web→App→AI revision equality and offline App pending→old AI revision→ack→new AI revision.
- [ ] Prove conflict, deletion tombstone, missed realtime hint, App reinstall/bootstrap and account A→B→A isolation. Record only IDs hashed with a run-specific salt.
- [ ] Treat unavailable provider, missing authorized account, migration or Simulator as an incomplete SC; mocks may support tests but cannot replace runtime evidence.

### Task 4: Refresh and publish the private Data Atlas

**Files:**
- Modify: `docs/audits/2026-09-15-data-flow/README.md`
- Create: `docs/audits/2026-09-15-data-flow/sync-and-ai-coverage.json`
- Modify the existing private Orbit Data Atlas through the Sites workflow; keep the published URL recorded in the audit README

- [ ] Generate the data/AI matrix from authority registry, AI visibility manifest and sync contract; fail on duplicate authority, undocumented mirrored domain or AI tool without freshness.
- [ ] Update historical findings with `open/resolved/partially_resolved`, implementing Sprint SHA and runtime evidence date; do not erase prior gaps.
- [ ] Update the private site with storage layers, external flow, sync state machine, offline matrix, AI tool/field coverage and remaining risks. Verify all interactive filters and mobile/desktop layout.
- [ ] Compare site values against the committed JSON and README; no hand-maintained count may disagree with the generated source.

### Task 5: Full verification, commit and mainline closeout

**Files:**
- Create after execution: `repos/orbit-app/docs/sprints/0036-ai-sync-visibility-acceptance/REPORT.md`
- Modify: `repos/orbit-app/docs/sprints/README.md`
- Modify: `bridge/status.md`, `bridge/handoffs.md`
- Create: `bridge/requests/BR-0036-ai-sync-visibility-acceptance.md`

- [ ] Run Web AI/query/authority/sync/security tests, Web `npm test`, `npm run typecheck`, and production `npm run build` once on the closed implementation tree.
- [ ] Run App sync/outbox/AI/account tests, App `npm test`, `npm run typecheck`, contract/schema sync, and iOS build once on the same closed tree.
- [ ] Inspect all staged paths, run `git diff --check` and `gitnexus_detect_changes(scope="staged")`, commit product/tests/audit/report in reviewable operation-chain commits, and record every fixed SHA.
- [ ] Coordinator merges each fixed SHA to `chat-agent`, reruns the affected smoke/data truth matrix against the exact merge tree, pushes only after verification, and records remote SHA. No unmerged worktree counts as completion.

## 验收契约（最多五项）

| SC | 可观察行为 | 必需证据 |
| --- | --- | --- |
| SC-0036-01 | 四 AI tools 返回 server canonical freshness/revision，截断不被说成全部 | AI query/manifest/artifact RED→GREEN |
| SC-0036-02 | pending/conflict 在 App 明示 AI 不可见，ack+delta 后才消失 | App AI/sync tests + Simulator before/after |
| SC-0036-03 | 四域在 Web/App/AI 的 online/offline/conflict/delete/reinstall/account matrix 一致 | production runtime data-truth matrix |
| SC-0036-04 | 数据审查和私有 Data Atlas 与 registry/manifest/sync contract 同源且无敏感数据 | generated matrix + site QA |
| SC-0036-05 | 受影响端全量、build、原生安装和主线合并树验证全部通过并已 push | commands/exit codes/final remote SHA |

## 最小测试与检查

- 档位 H/I：AI 私有数据字段、认证、跨端同步、最终主线验收和发布站点。
- Task 1/2 先定向 RED→GREEN；实现树收口后只运行一次两端全量/typecheck/build，避免逐提交重复。
- 必须运行真实 production Web/API、Simulator 和已授权 AI provider；不要求 Calendar/Gmail，因为它们不是本同步闭环的数据源。

## 失败与交接

AI 越权、pending 内容进入 provider、revision 不实、跨账号泄漏、重装丢 canonical、站点暴露敏感信息或未合并/未 push 均为硬失败。报告逐项列 SC、RED→GREEN、runtime matrix、站点 URL、费用、最终 SHA、merge SHA 和 remote SHA；开放问题必须保留在 Data Atlas，不能用文案改成已解决。
