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

### 2026-09-10 Completion Static Audit Task 2

- 完整功能清单把 Settings 唯一退出登录记录迁到既有的路由、源码、owner、
  回调和名称稳定键，保留 `navigation-nonpass-runtime-replay-2026-07-30`
  及原始结果、幂等性和测试数据。恢复原有 27 次导航回放记录，不给其他
  32 个共享退出入口增加运行时证据。历史证据数组和此前 200 条已记交互未变。
- 原生访问说明按入口 AST 解析真实 `OrbitRouteAccessBoundary` 的导入及
  默认导出调用；别名有效，未使用、伪装、本地同名和 type-only 导入不推断
  受保护状态。识别结果仅为静态鉴权接线，运行时授权验证仍未完成。
- 名称断言现在检查真实 `missing-static` 字段。三个静态隐藏的 Web 文件
  输入保留处理器及来源，外部选择按钮保留名称；原生装饰目标仅在三项跨端
  accessibility 属性均为静态证明时豁免，禁用或动态属性不是隐藏证据。
  App 的生成图标和任务弹窗遮罩两条真实名称问题仍失败，交给 Task 3。
- `/app/home` 的查询参数改为实际空集，移除旧主页的当前路由运行时声明；
  重定向到 `/app/agent` 未执行验证。保留仍可达 Home Events 的精确历史
  交互，不把旧 Home 的其他交互证据分配给未验证的兄弟入口。
- 当前静态清单为 118 个路由、3211 次交互出现、1671 个源码位置及 1322 个
  去重静态实现，独立测试其一致性；历史 3001 次观测、279 个状态不变。
  管线不再要求 DataCard，但仍断言其自有七个 Pressable 及任务、阶段行。
- 本地聚焦验证 37/37；完整审计 92/95，零跳过。三个失败检查分别为上述
  两条 App 名称记录、93/118 路由运行时覆盖，以及移开原覆盖断言后暴露的
  历史 public-event 交互计数 0/20。最后一项未降阈值、未伪造或重绑证据。
  两项 Web typecheck 和 diff 检查通过；未生成受版本控制的聚合报告。
- 未修改 App、API、共享契约或根计划，未调用外部服务、数据库或模拟器。
  GitNexus 对本生成器与测试返回未收录的 UNKNOWN，源码调用检查范围为
  清单生成与审计测试。完整临时清单、RED/GREEN 输出及剩余路由列表见
  协调者的 Task 2 报告；独立复核、变更检测、暂存和提交仍由协调者负责。

- 按协调者追加要求，逐条静态比较历史事件证据，并诊断合并浏览器测试的
  全部断言：100 条符合当前数据，另有 public-event 0/20 与 organizer
  navigation 2/3 两处不符。前者包含已替换的撮合、不可达的旧跟进组件、
  改名或替换的详情入口，以及 Party 的旧行号和禁用状态观测。后者虽有同名
  同 href 的 EventCard 从 50 移到 51，但 route 数据已切换到 canonical
  owner 分组，不能仅凭行号恢复旧目录结果。未重绑这些证据、降低断言或
  增加运行时记录；详细身份比对已补入 Task 2 报告，等待协调者裁定。

### 2026-09-10 Task 2 Review Fix Round 1

- 按协调者裁定，用一张精确路由、案例资格表过滤 events、event detail、
  organizer 和三个 Party 表面的旧案例。表面与每个交互候选键分别过滤，
  不让被退役的首个候选遮住后续有效候选，也不让新表面案例复活旧交互。
  前三个表面同时禁止旧通用烟测回退；六个表面当前均明确等待运行验证。
- 原始 20 个烟测成员、20 条生命周期、3 条 organizer navigation、2 条
  unknown-organizer 原始记录保留。历史检查读取原始映射的只读副本，
  未复制可变聚合报告作为夹具。案例文档和叶控件观测声明逐字不变，仍为
  3001 次观测、279 个状态、273 个唯一状态键、13 个清单。
- 原合并测试拆分为独立的历史、当前资格和业务证据检查。六个路由各自
  保留一条必需的新案例检查，要求有效案例身份及对应文档证据；静态夹具、
  源测试路径和旧烟测不视为新运行证据。没有跳过或降低全路由覆盖要求。
- 本轮 RED 为 1 通过、19 失败；聚焦 GREEN 为 64/64。完整功能检查
  为 106/114，全套审计为 154/162，均零跳过。八项失败是六个新案例门槛、
  原生两条名称问题所在检查，以及全 118 路由运行覆盖门槛。
  完整 typecheck 曾报告五处不完整表面夹具；补齐真实记录字段后，两项
  Web typecheck 均通过。最终回归日志和完整命令见 Task 2 报告。
- 当前部分运行覆盖为 87/118，缺失 31 个路由；交互记分由 201 降至 188，
  撤下的 13 条全部属于裁定范围，其余 188 条逐条不变，27 条导航回放保留。
  静态分母仍为 3211/1671/1322；这些观测值不是新的通过阈值。
- 临时清单在 `/tmp/orbit-task2-round1-inventory.json`，缺失路由逐条见
  Task 2 报告。未执行新的浏览器或原生运行案例，未改 App、API、根计划或
  受控聚合快照，未暂存或提交。本轮独立复核、变更检测和提交由协调者负责。

### 2026-09-10 Final Static-Audit Fix: Reassigned Delegated Listener

- Reject a named delegated callback when the existing lexical write check finds
  reassignment of its resolved binding, before inspecting its original body.
  Direct listener discovery and business behavior are unchanged. The shared
  write-check comment now describes binding use rather than only React invocation.
- Added six RED regressions for direct assignment, array/object destructuring,
  for-of assignment and a nested writer, plus two positive shadowing/property-write
  controls. Existing function-declaration, const, inline and actual prompt checks
  remain intact. RED: 6/12 pass, six expected failures; focused GREEN: 12/12.
- Complete surface suite: 53/53. Complete audit: 163/170, seven required failures,
  zero skips. The failures remain the fresh cases for events, event detail,
  organizer and the three Party routes, plus all-route runtime coverage (87/118;
  31 missing). Both Web typechecks and code diff whitespace checks pass.
- Read-only before/after surface counts are unchanged: 52 routes, 2132 actions,
  2070 present-static, 42 delegated-props, 20 present-imperative-static, zero risks
  and zero P0/P1 candidates. All 20 prompt occurrences retain their static proof;
  no runtime case or generated aggregate was added.
- Qualified upstream impact on orbit-remote-sync is LOW for both touched helpers:
  one direct caller and four upstream symbols each, zero indexed affected
  processes. This is bounded graph evidence, not a complete runtime safety claim.
  Full commands, failure names and logs are in the scoped final-fix-report.md.
  No subagents, staging, commits, reindexing, App/API edits or other-plan edits.
  The retained scoped re-review and independent full Web DB verification remain
  with the controller; this note does not clear those gates or runtime coverage.
