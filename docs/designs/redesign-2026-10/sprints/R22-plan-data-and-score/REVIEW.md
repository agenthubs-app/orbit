# Sprint R22 — REVIEW（独立复核）

**复核人：** 独立 AI 复核会话（没有参与写作），2026-10-10。
**对象：** `0bc931f4`（契约 + 计分纯函数 + 演示世界）与 `32015a18`（迁移、`PlanV2Service`、路由、旧计划守卫、合并读取、种子、REPORT），在 `redesign` HEAD `32015a18` 上复核。
**依据：** PLANNER（修订 1，SC-R22-01～09 与必需证据子表）、GOAL、`plan-v2.2/DESIGN.md`（版本 2，§3 / §4 / §5.3 / §8 / §9）、`sprints/README.md` 通用规则 1–10。REPORT 只当线索用：下面每条结论都是复核人重跑测试、重读代码，或在 scratchpad 里写临时探针（连本机 `orbit_test` 的随机 schema，用完即删）验证得出的。
**没有做的事：** 没连 Neon 或任何云端库，没部署，没调用付费 AI，没跑种子脚本（它会在 `orbit_test` 的默认 schema 留下数据），没跑两端全量测试。

## 结论：有条件通过

已经做到、复核人独立核实过的部分：
- **迁移在 v1 数据上能升级，重跑没有副作用。**
  - 两个迁移各自在一个 `do` 块里执行，等于一个事务。按定义查找约束名（`like '%horizon%'` / `'%purpose%'`），没有依赖默认名。
  - 删旧唯一索引、建新唯一索引在同一个事务里，不存在「两份 v1 active」的并发窗口。
  - 「v1 不能把 `horizon` 写空」靠显式的 `is not null` 补上了，这是自定决定 8 的修正，复核人认为正确。
- **计分口径基本与 DESIGN §4 一致。**
  - 余数给最后 1 人；超额半分：`floor(allocation/target/2)` 与「单价 ÷ 2 向下取整」在整数上恒等。
  - 匿名只算到目标人数；跳过记「配点 − 已得 base」；跳过期间不加分；撤销后可以重记。
  - 达成后按 `achievedAt` 冻结；`revision` 不被计分推进。
- **契约。** `plan-v2.ts` 已进快照（`contract-snapshot.mjs` 输出「契约快照一致」）；`BREAKING.md` 有两行登记；响应 schema 不 strict、请求 schema strict。App 侧 `contract/plan-v2.ts`、`schema/plan-v2.ts`、`compute/plan-*.ts` 与 orbits 逐字一致。
- **mock 不会在 live 泄露。** live 走 Postgres 仓储，`sample` 只在 mock 时加；合并读取只在 live 时读 v2；生产里 `ORBIT_REDESIGN_MOCK` 被忽略。
- **账本改动不影响旧用途。** `USAGE_SQL` 只把新用途从 `user_used` 里排除；旧用途的计数和分支都不变，回归测试全过。

但有 **1 条严重、8 条中等**：
- **S1**：v2 人物类型会进入现有的候补管线，用户能看到候补，却**接受不了**（404）。PLANNER 范围里列出的 `matching-service` 改动没有做，REPORT 也没有披露。
- **M1–M8**：
  - `plan-href.ts` 没有交付；
  - 匹配任务入队没放进 `createPlanFromDraft`；
  - 「唯一键兜底」名不副实；
  - 「今日 +N」与 DESIGN 口径不同；
  - 跳过期间撤销会让「满额」破掉；
  - 代码依赖迁移先上，这个部署顺序没有写进交接；
  - 旧 bootstrap 对只有 v2 的用户先花一次 AI 才失败；
  - 多目标时快照的源版本只看任意一份计划。

**通过条件：**
1. 修 S1。
2. M1–M8 逐条修复，或者在 REPORT「自定决定」里写明并说出对标做法。M3、M4、M5 涉及分数口径，DESIGN 与代码要统一，改哪一边都行，但只能留一种口径。
3. M6 写进 REPORT「生产授权清单」：迁移必须先于代码部署。

R10 / R11 / R20 在 mock 上的开发不受这些问题阻塞，可以继续。

## 逐 SC 核实

| SC | 结论 | 复核人做了什么 / 证据 |
| --- | --- | --- |
| 01 迁移可用 | ⚠️ 基本达成 | 重跑 `plans-v2-migrations-postgres`，4/4 通过（从零、在 v1 数据上升级、重跑、约束）。<br>探针发现两个约束漏洞：v1 行带上 `goal_id` 就能绕开「每人一份 v1 active」；v2 人物类型的 `allocation` 可以是 NULL（m1）。<br>PLANNER 要求的 `psql \d` 结构截图不在证据目录里 |
| 02 契约转正 | ✅ | 快照一致；`BREAKING.md` 两行；`redesign-schema-parity`、`contract-append-only`、`tolerant-reading` 通过。<br>App 的 `contract-fixtures-parse`、`contract-sync`、`compute-sync`、`api-schema-sync`、`contract-tolerant-reading` 全过，`tsc` 0。<br>宽进的兜底值有几处是在「猜」（m4） |
| 03 分数规则 | ⚠️ | 两端用同一张表、跑同一份副本（副本逐字一致），这一点成立。<br>但：「今日 +N」与 DESIGN §4.3 不一致（M4）；跳过与撤销的组合有缺口（M5）。<br>DESIGN §4.4 里「イベント满额后半分」「撤销后重记」没有进共享表，只在服务测试里（m7）；App 只跑了 `nextAward` / `unitPoints`，没跑 `summarizePlanScore`（m7） |
| 04 读接口 | ✅（证据有出入） | `plan-v2-routes` 通过；live 401、他人 404、`current: null`、503 都有。<br>REPORT 写「本机 curl 记录」，证据目录里没有 curl，只有种子输出（m10） |
| 05 计分命令 | ⚠️ | `v2-service`（11 条）与 Postgres 并发测试通过。<br>但「由唯一键兜底」不成立：并发测试证明的是按人的锁，唯一键对同一个人永远不会冲突（M3）。<br>跳过期间可以撤销已得分，类型就不再是满额（M5）。<br>活动计分撤销后不能重记（m3） |
| 06 旧计划不受影响、新计划被认得 | ❌ | v1 读写看不到 v2，复核人重读 7 处查询与 4 个维护查询，确认属实。<br>但：<br>• v2 类型进了候补管线，接受时 404（S1）；<br>• 只有 v2 的用户触发旧 bootstrap 时，先生成再失败（M7）；<br>• 周一小结对 v2 记录的过滤没有测试（m10）；<br>• 多目标时快照源版本不完整（M8） |
| 07 配额基础 | ✅ | 新用途、`max_calls`、月上限、计划生成流程日上限 15 都有 Postgres 测试，旧用途回归通过。<br>小问题：月度计数在「按池」的锁下进行（m11） |
| 08 种子与演示世界 | ✅ | `seed-plan-v2` 拒绝非回环地址的测试通过；证据日志 run1/run2 显示 `created: true` → `false`，`score: 40`。<br>`demo-world-consistency` 通过；`copy:qa` 501 条、0 问题（复核人重跑）。<br>种子里的联系人 id 是悬空的（m8） |
| 09 给别人的服务端函数 | ⚠️ | `createPlanFromDraft`、`addEventToPlan`、`recordEventAttendanceForPlans`、`planRemainingTargets`、`activeTypeNeeds`、`planGoalRelatedContactIds` 都有测试。<br>但 `createPlanFromDraft` 没有按 PLANNER 在事务里入队匹配任务（M2）；`readActivePlanNeeds` 实际叫 `mergeActivePlanNeeds` + `activeTypeNeeds`，名字与 PLANNER 不同（只记录，不算问题） |

### 必需证据子表

| SC | 子断言 | 复核结论 |
| --- | --- | --- |
| 01 | 迁移 SQL 在一个事务里；约束名按定义查找 | ✅ 重读迁移和 runner：每个版本是一个 `do` 块；horizon 与 purpose 的 CHECK 都是按 `pg_get_constraintdef` 查找后再 drop |
| 02 | 响应 schema 不 strict，请求 schema strict | ✅ `shared/api-schema/plan-v2.ts`：四个请求体都是 `.strict()`，响应都不是；`redesign-schema-parity` 通过 |
| 05 | 「同人同类型一次」由唯一键兜底，不只靠服务层先查 | ❌ 见 M3。`freeKey` 取第一个空位，同一个人第二次计分会拿到 `:2`，唯一键不会挡。现在不出错，是因为按人的 advisory lock 加上服务层先查 |
| 06 | `resolvePlanService` 的 14 个调用方逐个核对 | ✅ REPORT 列出了；复核人抽查了 `network-analysis/runtime.ts`、`contact-plan-context.ts`、`guide/progress.ts` 三个改动点，以及 `overview-cockpit-loader` / `structure-tab-loader` / `opportunities-route-service` 经 `readCurrentPlanForSnapshot` 的路径，属实 |
| 全部 | 两端全量零新增、`tsc`、`lint`、`copy:qa`、`detect-changes` | ⚠️ 复核人只重跑了相关测试、两端 `tsc`、`copy:qa`、快照，没跑全量。全量结果读的是证据日志：`final2-orbits-test.log` 7011/0 失败；`final-app-test.log` 4187/2 失败（与 REPORT 一致）；`final-postgres-tests.log` 118/0。`detect-changes-final.log` 写着「25 files / 132 symbols / risk low」，复核人没有重跑 |

## 运行时抽查

### 重跑

| 命令 | 结果 |
| --- | --- |
| orbits：`node scripts/run-node-tests.mjs` + 3 个 `tests/domain/plan-*`、`tests/plans/v2-service`、`tests/api/plan-v2-routes`、`tests/scripts/seed-plan-v2`、4 个 `tests/contracts/*`、`tests/api/redesign-contract-routes` | 77 / 77 通过 |
| orbits（`ORBIT_EVENT_DATABASE_URL=postgres://localhost/orbit_test`）：3 个 `plans-v2-*-postgres`、`ai-usage-ledger-postgres`、`plans-repository` | 41 / 41 通过 |
| orbits：`npx tsc --noEmit -p tsconfig.json` | 0 |
| orbits：`npm run copy:qa` | 501 条，0 问题 |
| orbits：`node scripts/contract-snapshot.mjs` | 「契约快照一致」，工作区无改动 |
| App：`plan-score-compute`、`contract-fixtures-parse`、`contract-sync`、`compute-sync`、`api-schema-sync`、`contract-tolerant-reading` | 18 + 10 条全过 |
| App：`npx tsc --noEmit -p tsconfig.json` | 0 |

### 探针（scratchpad 里的临时测试，直接调用仓储和服务；跑在 `orbit_test` 的随机 schema 里，已删除）

| 探针 | 结果 |
| --- | --- |
| A：先插一份 v1 active（`goal_id` 为 NULL），再插一份 v1 active，`goal_id = 'x'` | **插入成功**：同一个人有了两份 v1 active（m1） |
| B：把 v2 人物类型的 `allocation` 改成 NULL | **成功**，读出来按 0 分处理（m1） |
| C1：确定 v2 计划后，查 `readActiveNeedViews` / `readActiveNeeds` | 6 / 6，v2 的人物类型全部进了候补管线 |
| C2：对 v2 人物类型调 v1 的 `linkNeedContact`（接受候补走的是同一条 `linkWithin`） | **`ITEM_NOT_FOUND`**（S1） |
| C3：跳过一个类型后再查 `readActiveNeeds` | 仍然包含这个类型（M2） |
| D：VC 类型（30 分，3 人）已得 10 → 跳过 → 撤销那条 10 | 跳过时 `earned: 30, skipped: true`；撤销后 **`earned: 20, skipped: true`**（M5） |
| E：昨天 +10，今天撤销 | `todayDelta` 撤销前 0，撤销后 **0**。DESIGN §4.3 的口径应为 −10（M4） |
| G：`award` 请求带 `at: 2031-01-01` | 接受；`plan_log.created_at` 记成 2031 年（m2） |
| 种子的调用顺序（建计划、具名、匿名、跳过、活动、概要、summary） | 正常；没有复现种子日志里那条 pg「client already executing a query」弃用警告，警告来自种子脚本本身的初始化路径（m8） |

## 问题清单

### 严重

**S1 v2 人物类型进入了现有候补管线，但候补接受不了；PLANNER 要求的 `matching-service` 改动没做**
- **现象**：
  - `features/plans/matching-repository.ts:508-521`（`readActiveNeeds`）和 `:591-603`（`readActiveNeedViews`）只按 `p.status = 'active'` 取需求，v2 的 `network_need` 都会进来。worker 会对它们跑规则层和 AI 层（C12，后台池付费）匹配。
  - 维护任务的 `ENQUEUE_MISSING_PLAN_JOBS_SQL`（`plan-match-plan-job.ts:54-70`）会自动给 v2 计划补建 `plan` 来源的匹配任务。
  - `matching-service.ts:84-94` 的 `listPending` 会把这些候补展示出来，例如批量名片后的「プラン候補」sheet。
  - 用户点「是」时：`decide` → v1 `decideMatchCandidate` → `linkWithin`（`features/plans/service.ts:564`）→ `tx.item()`。R22 给 `tx.item()` 加了 `model_version = 1` 过滤（`repository.ts:389`），所以返回 **404 `ITEM_NOT_FOUND`**，候补永远停在 pending。`linkManually` 同样失败。探针 C 已复现。
- **为什么是问题**：
  - PLANNER「范围与文件 › 修改」明确写了：`matching-service.ts` 接受 v2 需求的候补时不生成「约 TA」。DESIGN §3.6 和 §9 #26 也这样写。
  - REPORT SC-06 打了 ✅，SC-09 写「v2 计划能入队候补匹配」，都没提到「入队之后接受不了」。
  - 生产里现在还没有 v2 数据，所以这是潜在问题。但 R23 一上线，用户就会看到点不动的候补，同时还在为这些候补付 AI 费用。
- **建议修法**：
  - 在 `matching-service.decide` / `linkManually` 里按需求所属计划的 `model_version` 分流：v2 走 `PlanV2Service` 新增的 `acceptCandidate`。这个方法在同一把按人的锁里做三件事：CAS 候补状态、把联系人写进类型的 `contact_links`（状态 `linked`）、不生成行动；
  - 或者 R22 先让 `readActiveNeeds*` 只取 `model_version = 1`，等 R24 再接入 v2。两种做法任选一种；
  - 无论哪种，都要补测试：v2 候补的列出、接受、驳回各一条。

### 中等

**M1 `shared/compute/plan-href.ts` 没有交付**
- **现象**：PLANNER「契约」一节要求导出深链构造函数，覆盖 `plans/flow/<intakeId>`、`plans/<planId>/types/<itemId>`、`?tab=plan&plan=`、`task?seg=plan&plan=` 等，DESIGN §7 / §8 的 R21 行也写了。`shared/compute` 下没有这个文件，仓库里也搜不到 `plan-href`。
- **为什么是问题**：R21（乙）、R23 / R24 都靠它拼深链，R22 的定位是「第一天定接口」。REPORT 没有提到它，交接里也没写。
- **建议修法**：补上这个文件（零 import 的纯函数，两端同步），并补一条两端各跑一遍的测试；或者在 REPORT 写明顺延到哪个 Sprint。

**M2 匹配任务入队没有放进 `createPlanFromDraft`；跳过的类型仍然参与匹配**
- **现象**：
  - PLANNER「服务端函数」写的是：`createPlanFromDraft` 在**一个事务**里完成建计划、归档 v1、入队 `plan` 来源匹配任务。实现（`v2/service.ts:557-651`）不入队，REPORT 交接改成「R23 确定后调 `enqueuePlanSourceMatchAfterSave`」，但没有列进「自定决定」。现在靠维护任务的补建兜底（见 S1）。
  - `readActiveNeeds*` 不排除 `skipped_at` 非空的类型（探针 C3）。已经「習熟済み」的类型还会继续产生候补和 AI 调用。
- **建议修法**：入队要么放回事务里（与 W0050 相同），要么在「自定决定」里写明「事务外入队 + 维护补建」并给出对标做法；`readActiveNeeds*` 加 `and i.skipped_at is null`。

**M3 「同人同类型一次由唯一键兜底」名不副实**
- **现象**：`v2/service.ts:260-266` 的 `freeKey` 在 `score:<plan>:<type>:<contact>` 后面取第一个没被占用的 `:n`。同一个人第二次计分（非并发）会拿到 `:2`，唯一键永远不会冲突。真正挡住重复的是两样东西：服务层先查（`:405`），以及按人的 advisory lock。Postgres 并发测试（`plans-v2-service-postgres` 第 2 条）证明的是锁，不是唯一键。
- **为什么是问题**：PLANNER 必需证据子表 SC-05 要求「由唯一键兜底，不只靠服务层先查」。以后如果有一条不经过服务层的写入路径，例如 R24 的メモ判定或 R26 的签到，绕开了先查，就会重复计分，数据库不会拦。REPORT SC-05 的说法与事实不符。
- **建议修法**：`n` 不要取「第一个空位」，改为确定性的值：`n = 该人该类型已被对冲的计分条数 + 1`。这样，同一时刻重复写入会撞上唯一键，撤销后重记又能拿到新键。改完后补一条「不加锁、直接插两条」的数据库测试。

**M4 「今日 +N」与 DESIGN §4.3 口径不同**
- **现象**：DESIGN 的定义是「东京自然日内 `score_awarded` 减 `score_reversed` 之和」。`plan-score.ts:107-122` 先用 `activeAwards` 去掉被对冲的记录，再按**原记录的时间**求今天的和。结果：
  - 今天撤销昨天的 +10，今天的 delta 不变（探针 E：0 → 0），昨天的数被回溯改小；
  - 今天撤回昨天的跳过，同样不扣。
- **为什么是问题**：首页「今日 +N」会和用户今天看到的分数变化对不上：总分少了 10，「今日」却还是 +0。两端要显示同一个数，口径必须先定下来。
- **建议修法**：二选一，并统一 DESIGN 和代码，DESIGN §4.3 / §4.4 同步改：
  - 照 DESIGN：`summarizePlanScore` 额外接收「对冲记录及其时间」，今天的对冲按负数计入；契约 `todayDelta` 已允许负数；
  - 或者改 DESIGN 为「今日新增且未被撤销的加分」，对标 Duolingo 的当日 XP 只增不减，并在 REPORT 写明。

**M5 跳过期间可以撤销已得分，导致「跳过 = 满额」不成立**
- **现象**：`undo`（`v2/service.ts:438-475`）不检查类型是不是已经跳过。跳过时记的是「配点 − 已得」（`:484`）。这之后再撤销一条已得分，类型仍标着 `skipped: true`，`earned` 却低于配点（探针 D：30 → 20）。撤回跳过再撤销则没有问题。
- **为什么是问题**：违反 DESIGN §4.1「跳过 = 该类型记满额」。构成条上的斜纹段会画不满，`remainingToFull` 也不再是 0。
- **建议修法**：任选一种：
  - 跳过期间拒绝撤销该类型的计分（409，提示先撤回跳过），对标 YNAB 锁定已对账的分类；
  - 撤销后同步把跳过记录补足：对冲旧的跳过，再按新的已得分写一条新的跳过记录。

  补对应的表驱动用例或服务测试。

**M6 代码依赖迁移先上线，部署顺序没有写进交接**
- **现象**：
  - v1 仓储的 7 条查询、匹配管线的 4 条维护查询、v1 `insertPlan` 的守卫，都引用了 `model_version` 列（`repository.ts:351/358/389/404/420/468/475/616-623`，`matching-repository.ts:683/707/740/770`）。
  - 迁移不会自动执行，只能通过 `scripts/migrate-web-runtime.ts` 手动跑。
  - 如果 `redesign` 合回并部署时生产还没跑 `plans-v2-model`，**所有 v1 计划读写都会抛 42703**。`readActiveV2Needs` 和 `readCurrentPlan*` 只容忍 42P01，42703 不在其中。首页、人脉分析、联系人详情、引导都会受影响。
- **为什么是问题**：REPORT「生产授权清单」只写了「合回前执行两个迁移 + 只读预检」，没有写「迁移必须先于代码部署」。DESIGN §10 的用户决定是「和其他功能的迁移一起出授权清单」。如果迁移排在部署之后，或者执行失败，线上计划会整体不可用。
- **建议修法**：在 REPORT 授权清单里写明三点：部署顺序（先迁移、再部署）、失败时的回滚步骤、部署前用只读 SQL 确认 `plans.model_version` 列已存在。如果还要多一层保护，可以在 v1 仓储遇到 42703 时降级为不带过滤的旧查询，但要加一个计数告警。

**M7 只有 v2 的用户触发旧 bootstrap / v1 生成时，先花一次 AI，再在保存时失败**
- **现象**：`features/plans/bootstrap.ts:98-101` 用 `getCurrent()` 判断有没有计划。R22 起 v2 对它不可见，只有 v2 的用户会一路走到 `runPlanGeneration`，也就是用户池 1 次付费的 AI 生成，直到 `insertPlan` 才抛 `V2_PLAN_ACTIVE`（`repository.ts:616-623`）。`POST /api/agent/plans`（v1 生成）同理。另外，PLANNER 写的是「v2 计划 id 调 v2 接口 → 409 `PLAN_MODEL_MISMATCH`」，实现是 404（`requireActivePlan` → `PLAN_NOT_FOUND`）。
- **为什么是问题**：
  - DESIGN §3.6 写的是「`bootstrap` 改为已有 v2 生效目标时拒绝」，意思是先拒绝；现在是先付费再拒绝，还占用户每天 10 次的熔断。
  - 旧的 `/app/start` 在 R28 之前仍然在线，只有 v2 的用户点「生成计划」就会撞上。
  - `PLAN_MODEL_MISMATCH` 这条偏离没有写进自定决定。
- **建议修法**：
  - bootstrap 和 v1 生成在调生成器**之前**先查「有没有生效中的 v2」（只读一条 `exists`），有就直接返回 409 `V2_PLAN_ACTIVE`，带 v2 入口地址；
  - 把「v2 接口收到 v1 id → 404」补进自定决定 1，同时更新 PLANNER / DESIGN 的说法。

**M8 多目标时，人脉快照的源版本只取任意一份生效计划**
- **现象**：`features/network-analysis/source-version.ts:84-90` 的 `plan_need_version` 子查询对生效计划做 `group by p.id … limit 1`，**没有 `order by`**。R22 以前每人最多一份生效计划；现在同时有两个 v2 目标，只会取到其中任意一份。
- **为什么是问题**：另一个目标的人物类型改了（跳过、关联、计分改了状态），快照不会被判为过期。选中哪份计划还可能随执行计划变化，让快照被反复判为过期并重算（后台 AI）。这正是 PLANNER「易错边界」点名的「两个目标的需求合并」。
- **建议修法**：改成对所有生效计划聚合，例如 `string_agg(p.id || ':' || …, ',' order by p.id)`；补一条「两个目标，只改第二个目标的类型 → 版本变化」的测试。

### 轻微

- **m1 约束漏洞（NULL 放行一类）**：
  - `plans_v2_goal_check`（`migrations.ts:184`）只约束 v2，v1 行可以带 `goal_id`。只要一份 v1 的 `goal_id` 不为空，它就落到另一个分桶，同一个人就能有两份 v1 active（探针 A）。建议加 `check ((model_version = 2) = (goal_id is not null))`，并顺手禁止 `goal_id = 'legacy'`；
  - v2 的 `network_need` 可以没有 `allocation`（探针 B），读出来按 0 分。建议加 `check (allocation is not null or kind <> 'network_need' or <对应 v2 计划>)`。CHECK 跨不了表，可以改为服务层校验，再加一条迁移测试；
  - `plan_revisions.source`（`:279`）没有 DESIGN §3.2 第 10 条列出的 `step_completed`。代码符合 §3.1 / §9 #30（Step 完成不改方案），应当改 DESIGN 这一处，统一说法。
- **m2 计分请求的 `at` 不设范围**：`planAwardRequestObject.at`（`api-schema/plan-v2.ts:144`）只校验格式，服务端直接把它写成 `plan_log.created_at`（`v2/service.ts:404/416`）。未来的时间（探针 G）或早于计划开始的时间会影响「今日 +N」、关系时间线和关系强度。建议把 `at` 限制在 `[starts_on, now + 5 分钟]` 之间，超出范围返回 422。
- **m3 活动计分撤销后不能重记，撤销也不回退条目状态**：`recordEventAttendanceForPlans` 的键固定为 `score:<plan>:event:<eventId>`（`v2/service.ts:679`），没有带 `:n`。`undo` 允许撤销活动计分，但撤销后再签到会被 `hasLogKey` 跳过，违反 DESIGN §4.4「撤销对冲后可重新记」。撤销后活动条目仍是 `attended`。建议与人物类型用同一套计数键，或者明确「活动计分不能撤销」，并在 `undo` 里拒绝。
- **m4 宽进的兜底值有几处在「猜」**：`goalItem.status` 未知值 → `active`（`api-schema/plan-v2.ts:55`），`premise.source` → `background`（`:113`），`basis.kind` → `template`（`:68`），`reason` → `already_counted`（`:154`）。通用规则 10 写的是「决定这条是什么的枚举出现未知值时整条跳过，不猜兜底」。`status` 决定目标出现在「进行中」还是「完了」里，应当整条跳过；其余几个只影响显示，可以改成 `unknown` 并让界面不显示标签。
- **m5 `readActiveV2Needs` 吞掉所有解析异常**：`v2/active-needs.ts:22-27` 为了让一个测试替身通过，把 `resolvePlanV2Service` 抛出的任何异常都当成「没有 v2」。生产里配置错误时，v2 用户的引导、人脉分析会悄悄显示为「没有计划」。建议修测试替身（补 `resolvePlanBackend`），这里只容忍明确的错误类型并记日志。
- **m6 读取成本**：
  - `summary()` 对每个目标读两遍 `log`，再给当前目标读一遍；
  - `detail()` 的 `reviewUsedThisMonth` 每次都读本人所有目标的完整 `plan_log`；
  - 联系人详情、人脉分析三个标签、引导检查，现在每次都会多开一个只读事务查 v2，没有 v2 计划的用户也一样。

  考虑到之前的 Neon 流量审计，建议：summary 用一条聚合 SQL；`review_used` 按月份键查；`readActiveV2Needs` 先查一条便宜的 `exists`，或者与 v1 的 `getCurrent` 合进同一个事务。
- **m7 两端同表的覆盖面**：App 的 `plan-score-compute.test.ts` 只跑 `nextAward` / `unitPoints`，没跑 `summarizePlanScore`（今日 +N、冻结、不封顶）。共享表里没有「イベント满额后半分」「撤销后重记」两条。副本逐字一致，风险低，但 SC-03 写的「两端跑同一份函数」只覆盖了一半。
- **m8 种子数据**：
  - 种子用的联系人 id（`seed-contact-vc-1` 等）在 `orbit_records` 里不存在，R24 拿它验收时，关系时间线和联系人计划说明会出现悬空引用。建议种子同时建 2–3 个本机联系人，或者接受 `--contact` 参数；
  - 种子日志里有 pg「client already executing a query」弃用警告。复核人在服务调用路径上没有复现，警告来自脚本自己的初始化部分，建议定位清掉（pg@9 会把它变成错误）。
- **m9 两条路由的响应没有 schema**：`GET /api/agent/plans/v2`（列表）和 `POST …/open` 不过 schema（`handlers.ts:90/97`）。REPORT「已知例外」只提到了列表。建议 R22 就加上 `{ goals: readableItems(goalItem) }` 和 `{ planId }` 的 schema，成本很低。
- **m10 REPORT 不准确或遗漏的说法**：
  - SC-04 说有「本机 curl 记录」，证据目录里没有；
  - SC-05 说「唯一键兜底」（M3）；
  - SC-06 说「v1 后台任务跳过 v2」，但周一小结（`logBetween` 的过滤）没有用 v2 记录做测试；
  - SC-09 没提到入队不在事务里（M2）；
  - 没有列出 `plan-href.ts`（M1）和 `PLAN_MODEL_MISMATCH` 改成 404（M7）这两处偏离；
  - PLANNER 要求的 `psql \d` 结构截图没有留证据。
- **m11 配额的两处细节**：
  - 月上限是在 `ai-quota:<ws>:<actor>:<pool>` 这把**按池**的锁下数的（`ledger.ts:138/170`）。现在每个新用途只从一个池预留，所以没有问题；可一旦有人从两个池预留同一个用途，月度计数就会有竞态。建议在 `constants.ts` 里固定「用途 → 池」的映射，`reserve` 时校验；
  - `plan_background` 的月上限 10 被说成「每月新建 10 个目标」，但它数的是 C2 操作次数。同一个目标点「もう一度」重新下书，也会占一次。请 R23 决定：要么按 intake 去重，要么把文案改成「背景下書き 10 回」。

## 对 REPORT「自定决定」的评价

| # | 评价 |
| --- | --- |
| 1 v1 把 v2 当作不存在 | 读路径这样做合理，过滤集中在仓储一处。但写路径的「拒绝」来得太晚（M7）；v2 接口收到 v1 id 返回 404 而不是 PLANNER 的 409，这一点要补进本条 |
| 2 账本 `reserve` 只给新用途加分支 | 同意：月上限必须和预留在同一把锁里判断。复核人确认旧用途的计数与分支不变。DESIGN §9 #22 写的是「不改 `reserve`」，应同步修订；锁按池的细节见 m11 |
| 3 v2 事件常量放在 `v2/types.ts` | 同意；DESIGN §4.2 写的是放在 `features/plans/contract.ts`，应同步修订 |
| 4 撤销记录不挂联系人 | 部分同意。对冲记录不挂联系人是对的；但**被撤销的原记录仍然挂着联系人**，关系强度和时间线仍会把它算作一次互动。建议 R24 在强度和时间线里排除已被对冲的 `score_awarded`，或者显示为「取り消し」，并写进交接 |
| 5 mock 首次访问时装入示例计划 | 合理。另需写明：mock 仓储是进程级全局的，同一台开发服务器上的用户共用，重启后复原 |
| 6 合并读取只在 live 时进行 | 同意；但吞异常的范围太宽（m5） |
| 7 行业条件存进 `criteria` | 合理，契约外的内部字段 |
| 8 `horizon` 约束写 `is not null` | 同意，这是一处真实的修正。同类的 NULL 问题还出在 `goal_id` 分桶上（m1） |
| 9 题库文字由本 Sprint 撰写 | 合理；仍需产品负责人过目（交接里已写） |
| 10 演示计划改成「资金调达」 | 可以接受。PLANNER 原写 `goalKind: 'sales'`，这次偏离有理由，而且已写明 |
| 11 `TaskPlanLink` 在第一天加上 | 合理，只加不改。请乙在 R20 确认 |
| 12 种子只读 `ORBIT_SEED_DATABASE_URL` | 同意；回环地址加库名双重检查，测试覆盖了 |

## 附：复核人做了什么

1. 读了 GOAL、PLANNER、REPORT、DESIGN（§3 / §4 / §5.3 / §8 / §9 / §10）、README 通用规则 10，以及 R08 REVIEW 的格式。
2. `git show --stat` 看了两个提交，逐文件读了：
   - 两个迁移和 runner、账本 `reserveWith` 全文、`constants.ts` / `gate.ts`；
   - `features/plans/v2/{types,repository,service,service-factory,handlers,active-needs}.ts`、`shared/compute/plan-score.ts`、`shared/api-schema/plan-v2.ts`、`scripts/seed-plan-v2.ts`；
   - v1 仓储与匹配仓储的改动，以及三个合并读取的接入点。
3. 用文本搜索列出所有直接读 `plans` / `plan_items` / `plan_log` 的 SQL（v1 仓储、匹配仓储、`plan-match-plan-job`、`network-analysis/source-version`、`contacts/insights`、关系强度与时间线），逐个判断 v2 行会不会让它们出错或被误改。S1、M8 就是这样找到的。
4. 顺着 `matching-service.decide` → `decideMatchCandidate` → `linkWithin` → `tx.item` 读到底，又顺着 `bootstrap.ts` 读到生成与保存。
5. 重跑了上表列出的 orbits 与 App 测试，两端 `tsc`、`copy:qa`、契约快照；读了证据目录里的全量日志、种子日志和 `detect-changes` 日志。
6. 在 scratchpad 里写了两个临时探针测试，连本机 `orbit_test` 的随机 schema，用完即删，验证了 A–G 七类行为（见「探针」表）。探针文件已删除，仓库里只新增本文件。

## 处理记录（执行会话，2026-10-10）

| 编号 | 处理 | 位置 |
| --- | --- | --- |
| S1 | 已修（按复核建议的第二种做法）：R22 先把 v2 排除在匹配管线外——`readActiveNeeds*`、入队与补建入队都限 `model_version = 1`；接受候补、确定后入队、排除跳过的类型移到 R24（R24 PLANNER「R22 交接过来的事」）。补测：v2 计划不入队、不读需求 | `matching-repository.ts`、`plan-match-plan-job.ts`、`plans-v2-service-postgres` |
| M1 | 已修：新增 `shared/compute/plan-href.ts`（8 个构造函数，零 import），两端同步；共用用例表 `tests/support/plan-href-cases.ts`，服务端与 App 各跑一遍（10 + 10） | REPORT 自定决定 #19 |
| M2 | 入队：写进自定决定 #20（与 v1 的 W0050 一致：保存后入队 + 维护补建），R24 落地；跳过的类型：R24 接入时 `readActiveNeeds*` 加 `skipped_at is null`（已写进 R24 交接） | REPORT #13 / #20 |
| M3 | 已修：唯一键 = 同一人同一类型已被对冲的条数 + 1，确定性；Postgres 测试证明绕过服务层的重复写入撞唯一键 | `v2/service.ts`、`plans-v2-service-postgres` |
| M4 | 已修：照 DESIGN §4.3，`summarizePlanScore` 加 `reversals`，今日 +N 减去今天写下的对冲；两端用例表 | `plan-score.ts`、`plan-score-cases.ts` |
| M5 | 已修：跳过期间撤销 409 `TYPE_SKIPPED` | REPORT #15 |
| M6 | 已修：交接写明「先迁移、再部署」，附部署前检查 SQL | REPORT 交接 |
| M7 | 已修：旧 bootstrap 调生成器前先查 v2，409 `V2_PLAN_ACTIVE`（带入口地址），不花 AI；补测 | `bootstrap/route-handlers.ts`、REPORT #16 |
| M8 | 已修：源版本对所有生效计划 `string_agg`；补测 | `source-version.ts` |
| m1 | `goal_id` 分桶：已加 `plans_goal_id_by_model_check`；`plan_revisions.source`：改 DESIGN 一处（Step 完成不进方案修订）；v2 `network_need` 必须有 `allocation`：CHECK 跨不了表，由服务层校验（`validateAllocations`），不加库约束 | `migrations.ts`、DESIGN |
| m2 | 已修：计分时间限在开始日到现在 | `v2/service.ts` |
| m3 | 已修：活动计分键也走 `awardKey`（撤销后可重记） | `v2/service.ts` |
| m4 | 已修：整条跳过或当作没有 | REPORT #18 |
| m5 | 已修：不再吞错；测试替身补 `resolvePlanBackend` | `active-needs.ts`、REPORT #6 |
| m6 | 部分：summary 每个目标只读一次条目和记录；`review_used` 按月份键查与 v2 合并读取的 `exists` 预查留给 R25 / R24（REPORT「已知例外」） | REPORT 已知例外 |
| m7 | 已修：两端用例表加入 `summarizePlanScore`（今日对冲、冻结、不封顶）以及「イベント满额后半分」「撤销后重记」 | `plan-score-cases.ts` |
| m8 | 已修：种子建两位本机联系人（在同步提交顺序锁下写，`sync-write-lock-audit` 已登记）；pg 弃用警告来源（同一 client 并发查询）已去掉 | `seed-plan-v2.ts` |
| m9 | 已修：列表与 `open` 有契约和 schema | `plan-v2.ts`、`handlers.ts` |
| m10 | 已修：SC-04 写明没有 curl、以路由测试为证；SC-05 改为确定性唯一键；SC-06 补周一小结测试；M1 / M7 偏离写进自定决定；结构截图在 `psql-plans-structure.txt` | REPORT |
| m11 | 固定池：已加 `AI_QUOTA_PURPOSE_POOLS` 并在 `reserve` 校验；`plan_background` 计数口径：交给 R23 决定（R23 PLANNER 交接，推荐按 intake 去重） | REPORT #17 |
| 评价 #4 | 被撤销的原记录仍挂联系人：关系强度与时间线如何计入由 R24 处理（时间线专用标题时一并排除已对冲的计分），已写进 R24 交接 | R24 PLANNER |
| 评价 #5 | mock 仓储是进程级全局、重启复原：写进 REPORT 自定决定 #5 | REPORT |
