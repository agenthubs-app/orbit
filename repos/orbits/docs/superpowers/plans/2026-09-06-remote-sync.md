# Remote Sync Integration Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans for the merge and verification checkpoints. Independent test reconciliation may use scoped agents.

**Goal:** Merge the reviewed remote `chat-agent` state into an isolated local branch without losing either branch's behavior or the user's uncommitted work.

**Architecture:** Merge local `862cb54b4fe466c31119a31054af7e7139ac3c9f` with remote `49fe4909bda2344daf61950b6a6ddea31f85d6d5`. Preserve the local task/reminder and inbox-detail flows while integrating remote durable notification delivery and Agent execution. Keep the original dirty checkout unchanged.

**Tech Stack:** Git worktree, TypeScript, Node test runner, Next.js, Expo.

**Spec:** The user approved the preceding review and isolated integration approach on 2026-09-06. This is an integration task, not a redesign or a deployment request.

## Global Constraints

- No push, deployment, production migration, live email, real push delivery, or model call.
- The main checkout and its uncommitted theme/reading-canvas work remain untouched.
- Preserve both parents' functional changes; do not resolve files wholesale with ours/theirs.
- Do not downgrade the local Expo notification dependency or weaken type checks.
- Only resolve merge conflicts and demonstrated integration regressions. Report unrelated failing checks separately.
- Run GitNexus impact before manually changing functions; run change detection before committing.
- Database tests may use isolated local test data only. Missing prerequisites and skips are not passes.

## Task 1: Protect Work And Establish Baseline

**Files:** Git metadata and temporary backup/test output outside the app.

- [x] Create a backup branch at the local parent, a binary diff, and an archive of modified/untracked non-ignored files.
- [x] Create `integration/remote-sync-20260907` in the existing ignored worktree directory.
- [x] Install each app's exact existing lockfile dependencies without modifying lockfiles.
- [x] Run both type checks, all mobile tests, and targeted Web reminder/notification/contract/conflicting-page tests.
- [x] Diagnose any unexpected baseline failure before moving into the merge; do not silently proceed past an unresolved failure gate.

Baseline: both type checks passed; mobile 732/732 passed. The Web subset initially
had one stale Chinese-label test. Its three expectations were aligned with the
existing localized live-contact behavior, without changing production code.
The rerun passed 35 tests with zero failures; one PostgreSQL race test was explicitly
skipped because this isolated checkout had no database configuration.

## Task 2: Merge Dependencies And Shared Contracts

**Files:** Both apps' `package.json` and `package-lock.json`; Web `shared/contract/index.ts`; mobile generated contract copies.

- [x] Run `git merge --no-commit --no-ff 49fe4909bda2344daf61950b6a6ddea31f85d6d5` in the integration worktree.
- [x] Preserve local scripts and add remote scripts/dependencies; retain `expo-notifications: ~57.0.15`.
- [x] Export both task/reminder and durable-notification types from the Web contract barrel.
- [x] Run the existing mobile `npm run sync:contract`; never hand-edit generated copies.
- [x] Regenerate lockfiles from the resolved package objects, install, and verify contract/domain/schema sync tests.

## Task 3: Preserve Mobile Notification And Inbox Behavior

**Files:** Mobile `app/_layout.tsx`, `src/api/AuthSessionProvider.tsx`, `src/components/OrbitNotificationsCoordinator.tsx`, `src/notifications/*`, `src/screens/inbox/RelationshipInboxScreen.tsx`, and their targeted tests.

- [x] Inspect both notification lifecycles and map local reminder vs durable delivery responsibilities.
- [x] Add failing regressions for the exact integration boundary before changing behavior: one notification handler, both payload forms, device registration respecting explicit opt-in, and logout cleanup covering both existing registrations.
- [x] Preserve local reminder scheduling/cancellation and local inbox detail routes; add remote delivery-card handling without restoring removed inline conversation state.
- [x] Keep actor scoping, failure visibility, cold-start response handling, and account-switch cleanup. Do not make notification views complete tasks.
- [x] Run the notification/auth/inbox tests and full mobile type check; review integration changes independently.

## Task 4: Reconcile Conflicting Tests

**Files:** Web `tests/pages/app-agent-contact-recommendations.test.tsx`; `tests/services/event-canonical-membership-migration-apply-repository.test.ts`, `event-canonical-membership-migration-ledger-postgres.test.ts`, `event-canonical-membership-operator-cli-postgres.test.ts`, `event-profile-contract-repair-operator-cli-postgres.test.ts`, and `postgres-live-record-storage.test.ts`.

- [x] Combine both parents' assertions and fixture isolation; retain typed real-module imports and robust cleanup.
- [x] Keep the new migration wait/failure-stop and SQL-version assertions.
- [x] Verify affected tests with isolated database prerequisites when available; preserve explicit skip reasons otherwise.

Verification: all six reconciled files plus the profile-repair PostgreSQL suite
passed 24/24 tests, with no skips, using a new local scratch database and the
existing synthetic 26-profile fixture. Required-DB CLI tests still fail when their
database prerequisite is absent; no new skip exemption was retained.

## Task 5: Verify And Record The Local Merge

**Files:** Integration documentation and only demonstrated regression fixes within the changed app surfaces.

- [x] Scan for remaining conflict markers and verify neither parent was accidentally dropped.
- [x] Run Web and mobile type checks, full test suites, and the Node 22 Web production build.
- [x] Compare failures to parent evidence; fix integration regressions with failing-test evidence and keep unrelated gaps visible.
- [x] Independently review the resolved merge and verify fixes for reproduced integration regressions.
- [x] Run final GitNexus change detection against the staged integration.
- [x] Record the two-parent local merge after the user instructed continuation in response to the listed-gap acceptance and local-commit question.
- [x] Verify the original branch and application changes remain intact; preserve concurrent root guidance and Bridge updates.
- [x] Deliver the integration branch in the containing local merge commit, retaining the recorded limitations. No remote integration is authorized.

## Verification Checkpoint

- Before the 2026-09-07 local commit, the staged tree matched the previous
  verified tree `883dc65b6658a1c2deb9050bf55179529f1ff949`; only this handoff
  document was subsequently updated. Both type checks and the 26 notification
  regressions passed again. Full-suite reruns reproduced Web 2,392/2,407 passing
  with the same 15 failures, and mobile 760/761 passing with the same route gap;
  neither suite skipped tests. The production build below is the prior run on
  the unchanged application source, not a second build at commit time.
- Both application type checks passed after the initial conflict resolutions.
  The Web type check passed again after the registration fixture repair.
- The production Web build passed using an independent Node 22.22.1 binary.
  The existing Homebrew Node 22 installation could not start because its
  `libsimdjson.30.dylib` dependency was absent; no system installation was changed.
- The final Web suite with isolated PostgreSQL, synthetic repair fixtures, and
  `ORBIT_RUN_POSTGRES_SMOKE=1` ran 2,407 tests: 2,392 passed, 15 failed, zero skipped.
  This is not an all-green result.
- Seven audit tests also fail on the pre-merge local source snapshot. Twenty
  additional static risk candidates come from remote host-delegated starfield
  handlers that the unchanged scanner cannot recognize. A separate read-only
  boundary harness passed 19/19 cases; it does not verify browser layout or
  pointer reachability, and does not waive the audit failures.
- Two contact-detail tests retain pre-existing Chinese-label and source-shape
  expectations that no longer match the local implementation.
- Six failures depend on supplying a global database to mock-oriented unit
  tests: two scheduler dependency fixtures, two mobile-auth revocation fixtures,
  one memory trace fixture, and one Party configuration fixture. Re-running their
  six files without database configuration passed 49/51, with only the two
  pre-existing contact-detail assertions failing. No production revocation or
  actor-isolation check was removed.
- The registration guide had a demonstrated merge regression: two fixture
  lifecycles overwrote each other's database context. One parameterized catalogue
  fixture now supplies both parents' event identities. Its two calling test files
  passed 18/18 with PostgreSQL, no skips; missing PostgreSQL still fails visibly.
- The final mobile suite ran 761 tests: 760 passed, one failed, zero skipped.
  Both notification behavior files passed 26/26, and mobile type checking passed.
  Independent review reproduced and then verified recovery when logout fails:
  the retained account restores both push registries and local reminders without
  retrying the logout API or clearing the retained auth session.
  The remaining route-parity failure names
  five remote Web routes without native counterparts: `/account/reset-password`,
  `/contacts/new/batch/[id]`, `/contacts/new/batch2`, `/contacts/new/batch2/[id]`,
  and `/events/[id]/operations/experience`. No placeholder route or test exemption
  was added. This is not an all-green mobile suite or a business-parity claim.
- On 2026-09-07, the user instructed continuation after being asked whether to
  retain the listed gaps and create the local merge commit. This authorizes the
  local checkpoint only; the failures remain open and are not accepted platform
  differences or evidence of release readiness. No push, deployment, production
  migration, real push delivery, email delivery, or model call was performed.
- The resolved staged merge has no unmerged index entries. Whole-merge change
  detection reports CRITICAL scope: 3,516 indexed symbols, 74 affected flows,
  and 345 indexed files. Every reported path belongs to the expected staged
  merge; this does not imply every changed workflow has runtime coverage.
- The complete staged whitespace check reports two inherited remote warnings:
  a trailing space in the fixed-format PDF cross-reference example in
  `docs/superpowers/plans/2026-08-26-business-card-batch-import.md`, and an extra
  final blank line in `tests/pages/app-registered-event-lifecycle.test.ts`.
  Both files are unchanged from the remote parent. Neither warning was hidden.

## Cross-Client Handoff

- Version: local parent `862cb54b4fe466c31119a31054af7e7139ac3c9f`, remote parent
  `49fe4909bda2344daf61950b6a6ddea31f85d6d5`, integration branch
  `integration/remote-sync-20260907`. The combined source is recorded in the
  containing two-parent local merge commit; its first parent is the baseline
  repair commit `1b34d591b50b073207bf53a01c2484d11c4d1152`.
- Web status: reviewed remote API, contract, worker, and page changes are present;
  the full-suite failures above remain open. This is not a deployment approval.
- App status: the shared notification contract is synchronized; local task
  reminders and dedicated inbox-detail navigation remain present alongside
  remote durable delivery. The five missing native routes remain unresolved.
- Notification boundaries: `/api/devices/push-token` and `/api/devices/push-tokens`
  retain their existing actor-scoped registries. Explicit opt-in gates device
  registration; queued revocation drains in-flight registration writes. Failed
  server unlinking remains visible and does not block best-effort logout.
- Verification status: local tests and Web build only. Same-account Web-write to
  App-read and App-write to Web-read acceptance were not run. No real push,
  browser layout, native device UI, or production worker execution was verified.
- Local integration continuation was authorized on 2026-09-07. The remaining
  test failures and native route gap are still follow-up work, not closed issues.
  Notification follow-up review has passed. Platform differences have not been
  marked accepted merely because a type or route check passed.
- The original checkout's app changes remain outside this worktree. Concurrent
  root guidance and `bridge/` updates were read but not overwritten, copied into
  this merge, or marked complete on behalf of their owners. This section supplies
  handoff evidence; it does not update the Bridge coordinator's ledger.

## 2026-09-10 Continuation: Task Status Without Recommendation Evidence

- A validated `created`, `suggested`, or `failed` task interaction now supplies
  deterministic task-status copy when a reply has no recommendation items or
  evidence. Malformed, unavailable, and absent interactions still use the
  recommendation evidence guard; raw assistant prose is not treated as grounding.
- Verification was local and fixture-backed: the five-case RED run produced
  2 passes and 3 expected failures, then passed 5/5 after the repair. The complete
  task interaction file passed 20/20; the task, general conversation, contact
  recommendation, event recommendation, and core product UX files passed 49/49.
  `npm run typecheck:app` and `npm run typecheck` also passed.
- No external service, credential, database write, browser layout check, native
  client check, deployment, or production migration was performed. The native
  and deployment limitations recorded above remain open.

## 2026-09-10 Continuation: Completion Static Audit Task 1

- 基于 `f0b56aad5`，在既有隔离工作树中修复三个永久禁用的状态按钮：
  等待同意、拒绝交换、活动画像锁定现使用非交互 `span`，保留原文案、
  数据属性、等待状态的 `aria-live` 和画像锁定的描述关联。撤回、重试、
  已接受联系人链接及可编辑画像入口未变；请求处理中仍保留真实按钮。
- 静态扫描器按 TypeScript AST 的词法作用域解析监听器及命名或内联回调，
  仅为注册回调中受同一 host 保护且包含调用的静态 `closest` 分支记录证据。
  `Form` 不再误判为原生 `form`；`entryTitle(...)` 只标为动态名称证据。
  导航证据属于共享 React `OrbitTopNav`/`OrbitLangToggle`，提示提交与建议
  的事件证据仍属于 `orbit-starfield-agent-prompt.ts`，每个文案保留四次出现。
- 本地验证：AST 夹具 8/8、两组 UI 测试 15/15；完整相关测试合跑 32/33。
  剩余失败为 `ProposalForm onSubmit` 的五条 P1 名称未解析记录，位于联系人、
  活动详情和三个 Party 路由。未降低零 P1 阈值、排除记录或宣称运行时已验证。
  两项 Web typecheck 均通过；P0 候选为零。
- 本次未修改 App、API、共享契约、生成审计快照或 Bridge 台账；未访问真实
  数据库、模型、邮件或其他外部业务服务，未提交或部署。完整功能运行时审计
  的已知覆盖缺口保持开放，独立复核和提交仍由协调者负责。

### 2026-09-10 Task 1 Review Fix Round 1

- 修复扫描器的解构绑定身份、类等值空间遮蔽及回调内不可达分支误判。
  对象和数组解构的不同 host 不再共享身份；`return`、`throw`、恒假分支
  和不支持的控制流不能为后续不可达调用提供事件证据。
- 按协调者裁定，只有本地组件可证明把 `onSubmit` 转交给其返回的原生
  `form` 时，才记录为 `component-container` 非叶节点。保留回调表达式、
  组件和表单的源码位置；原生表单和真实提交按钮继续保留。未知回调、
  显式角色、其他真实控件和错误大小写属性仍按保守规则分类。
- 本轮仅编辑扫描器、原有 manifest 测试和本说明，未改 `ProposalForm`
  或任何生产 UI。此前五条 P1 已通过所有权证明解决，未删除阈值或断言。
  完整 manifest 与两组 UI 测试合跑 48/48，通过零 P0/P1 断言；最终代码
  修改后两项 Web typecheck 均通过。完整功能运行时审计仍待后续任务。

### 2026-09-10 Task 1 Review Fix Round 2

- 收紧表单所有权证明：返回的原生 `form` 只要声明了 `role`，包括动态角色，
  就不再获得组件容器豁免；未命名的自定义控件保持名称未解析记录。
- 对组件绑定进行词法身份关联的写入检查。赋值、解构写入、循环目标及更新
  操作会使原函数实现的所有权证明失效；同名局部变量写入和函数属性更新
  不视为组件绑定替换。不猜测 React 的执行时序，存在写入即保守放弃证明。
- 仅修改扫描器、既有 manifest 测试及说明。新增测试 RED 为 11 失败、
  1 通过；最终 manifest 与两组 UI 测试 60/60，零 P0/P1，最终代码修改后
  两项 Web typecheck 均通过。运行时覆盖、独立复核和提交仍由后续流程负责。
