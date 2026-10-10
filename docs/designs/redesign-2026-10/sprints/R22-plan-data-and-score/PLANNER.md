# Sprint R22 — 计划 v2.2：数据、契约与分数

**Plan revision:** 1。**模式:** existing-codebase / single-generator（执行人：小雨（甲））。**档位:** H。
**单一目标:** `plans` v2 迁移与 AI 账本用途迁移（本机）、`plan-v2.ts` 契约转正、`shared/compute` 的模板（含三语文字）与计分纯函数、`PlanV2Service` 的读接口与计分命令（mock + live）、`readActivePlanNeeds` 并把要认 v2 的服务切过去、旧计划守卫、演示世界改成 v2 形状、本机种子脚本。
**易读目标:** [GOAL.md](GOAL.md)。**整体设计:** [plan-v2.2/DESIGN.md](../plan-v2.2/DESIGN.md)（§3 数据、§4 分数、§5.3 配额、§8 接口）。
**基线:** 开工时 `redesign` HEAD；已知失败以 README「骨架登记表」最后一行为准。
**进入条件:** R09 done；DESIGN 已复核（`plan-v2.2/REVIEW.md` 处理记录完成）。不依赖其他功能 Sprint。
**分支:** 一人做，直接在 `redesign` 上提交（RD-25）；乙同时在做 R10 / R11 时，按 HOW-TO §0 开 `redesign-R22-plan-data`。

## 已查清的事实（按 `fe896414`）

1. **迁移写法**：`features/plans/migrations.ts` 只有 v1「plans-core」（`plans`、`plan_items`、`plan_log`、`plan_commands`），advisory lock + `plans_schema_migrations` + checksum 守卫，只追加；放宽 CHECK 的先例是 `matching-migrations.ts` v4「plan-matching-plan-source」（按定义找约束名再 drop）。生产执行入口 `scripts/migrate-web-runtime.ts`，需单独授权。
2. **现有约束**：`plans.horizon not null check (month/quarter/year)`；唯一索引 `plans_one_active_per_actor (workspace_id, actor_id) where status = 'active'`；`plan_items` 的 `check (kind <> 'event' or linked_event_id is not null)`、`check (kind = 'network_need' or criteria is null)`；`criteria.targetCount` 已存在（1–5，W0048b）；`plan_log (workspace_id, actor_id, idempotency_key)` 唯一，`event` 列不约束取值。
3. **AI 账本**：`features/network-analysis/migrations.ts` v1 建 `ai_usage_ledger`，`purpose check in ('plan','plan_refine','snapshot','memo_extraction','insight','enrichment')`；常量在 `features/ai-quota/constants.ts`（两池：用户 10 / 日、后台 60 / 日，`AI_QUOTA_MAX_CALLS`）。没有月度计数。
4. **契约草案**：`shared/contract/plan-v2.ts`（R08 契约 12，`@draft until R22`，不进快照）、`shared/api-schema/plan-v2.ts`（`score.total` 限 0–100、`byType`）、mock 路由 `GET /api/agent/plans/v2/summary`（`features/redesign-contracts/handlers.ts`），fixture 来自 `shared/mock/demo-world`（`DEMO_PLAN.goalKind = "customers"`，不是 6 类之一）。消费方：只有 handlers 与 `demo-world-consistency` 测试（文本确认）。
5. **服务入口**：`resolvePlanService`（`features/plans/service-factory.ts`）有 14 个非测试调用方（文本确认）：`agent/page.tsx`、`agent/plan/read-current-plan.ts`、`agent/strategy/page.tsx`、`api/agent/plans/{route,candidates,bootstrap,reanalyze}/route-handlers.ts`、`features/guide/progress.ts`、`features/plans/{contact-plan-context,event-attribution-runtime,matching-runtime}.ts`、`features/operations/maintenance/configured-tasks.ts`、`features/network-analysis/runtime.ts`、`scripts/seed-verify-accounts.ts`。
6. **v1 专用后台**：`plan-phase`（阶段进入、补细）、`plan-event-attendance` / `plan-event-registration`、周一小结、到期回顾（`reanalysis.ts`）都按周次和 `horizon` 计算。
7. **`getCurrent()` 的消费方**（文本确认，DESIGN §3.6 有分类）：只认 v1 的旧界面 / 流程 5 处；要认 v2 的服务 `features/plans/{coverage,contact-plan-context,matching-service}.ts`、`features/network-analysis/{runtime,input-source,service}.ts`、`app/(app)/app/contacts/analysis/{overview-cockpit-loader,structure-tab-model,structure-tab-loader,opportunities-route-service}.ts`、`features/guide/progress.ts`。`markEventAttended`（`service.ts`）只取 `tx.activePlan()` 一份计划。
8. **账本**：`ledger.ts` 写库时取 `AI_QUOTA_MAX_CALLS[request.purpose]`（按用途，不能按调用）。
9. **App**：没有任何计划读取（`agent/plans` 在 App 只出现在同步副本里）；`shared/compute` 整目录同步到 `src/api/compute`，`shared/domain` 只放行 `industries.ts`、`language.ts`（`scripts/sync-contract.mjs`）。

## 上下文包

### 必读
- DESIGN §3、§4、§5.3、§8、§9 #1 #2 #5 #6 #7。
- `features/plans/{migrations,contract,repository,service,service-factory,validators}.ts`、`features/plans/matching-migrations.ts`（v4 写法）、`features/network-analysis/migrations.ts`、`features/ai-quota/{constants,ledger,gate}.ts`。
- `shared/contract/plan-v2.ts`、`shared/api-schema/plan-v2.ts`、`shared/api-schema/tolerant.ts`、`features/redesign-contracts/{service-factory,mock-service,handlers}.ts`、`shared/mock/demo-world/*`、`shared/contract/BREAKING.md`、`scripts/contract-snapshot.mjs`。
- 测试：`tests/contracts/*`、`tests/api/redesign-contract-routes.test.ts`、`features/plans` 现有测试里的迁移测试和服务测试各一个；`tests/support/shared-compute-audit.ts`。

### 关键符号与 impact（开工时重跑；索引先全量重建，见 DESIGN §13）
- `PlanService` **CRITICAL** 121、`createPlanService` **CRITICAL** 55、`resolvePlanService` **CRITICAL** 50：不改已有方法；v2 走新的 `PlanV2Service` / `createPlanV2Service` / `resolvePlanV2Service`；`resolvePlanService` 只加 `model_version` 守卫。REPORT 列出 14 个调用方逐个核对的结果。
- 第 7 条「要认 v2 的服务」：逐个改成读 `readActivePlanNeeds`（只读、多目标合并）；每个文件改前跑 impact，结果列在 REPORT。
- `createPostgresAiUsageLedger` **CRITICAL** 80：只新增 `countMonthly`（按用途、东京月）与计划生成流程的日计数，`reserve` 等已有方法签名和行为不变（加回归测试）；`max_calls` 靠拆用途解决（DESIGN §3.3），不加参数。
- `createPostgresPlanRepository` HIGH 37：v1 查询加 `model_version = 1` 过滤的位置逐个列在 REPORT。
- `AiQuotaPurpose` MEDIUM 35：只加值。`runPlanMigrations` LOW 4。
- UNKNOWN 必须文本确认：`planV2SummaryResponseSchema`、`configuredHasActivePlan`、`REANALYSIS_MONTHLY_LIMIT`。

### 易错边界（全部写进 SC）
迁移在已有 v1 数据上失败（旧 active 计划、`horizon` 非空）；放宽 `horizon` 后 v1 计划能写成空；换唯一索引时并发窗口里出现两份 v1 active；旧接口改到 v2 计划；v1 后台任务处理到 v2 计划（按周次算出负数或越界）；同一人同一类型重复计分（并发两次提交）；撤销后再记被唯一键挡住；改配点后过去的分变了；跳过期间新记录加分；v2 用户的人脉覆盖度 / 快照 / 联系人计划说明变空（`getCurrent()` 只认 v1）；达成的计划仍被当作生效；计分请求推进了 `revision` 导致连续记两人 409；Step 撤回后无法再完成；匿名自报超过目标仍加分；「今日 +N」跨东京零点算错；契约 `total` 仍被限到 100；fixture 不过自己的 schema；App 同步副本没跟上；mock 在 live 模式泄露假数据。

## 契约（本 Sprint 定稿，REPORT 交接）

### `shared/contract/plan-v2.ts`（去掉 `@draft`，进入快照）

- 枚举：`PlanGoalKind = 'launch' | 'fundraising' | 'sales' | 'hiring' | 'partnership' | 'career'`（读取时未知值落到 `'unknown'`，界面只显示目标文，DESIGN §9 #34）；`PlanIntakeSource = 'task' | 'onboarding' | 'next_goal' | 'iorbit'`；`PlanPremiseSource = 'background' | 'q1' | 'q2' | 'q3' | 'q4' | 'q5' | 'record'`；`PlanAwardBasis = 'talked' | 'self_report' | 'memo' | 'event' | 'skip'`。
- 方案内容 `PlanV2Content`：`diagnosis`、`conclusion`、`flow?`（三格图）、`steps: PlanV2Step[]`（`key, title, doneCriteria, why, personTypeKeys[]`；读模型另给 `completedAt?`，由 `plan_log` 推出）、`personTypes: PlanV2PersonType[]`（`itemId, key, slot, shortLabelId, shortLabel, emoji, roleSituation, allocation, targetCount, why, questions[3], countRule, recognizeHints[], persona?, opener?, introRoutes[{ viaContactId, why }]`）、`event: { allocation, targetCount }`、`citations: { id, version }[]`、`allocationReasons[]`、`basis[]`、`sample?: true`。
- 分数 `PlanScoreView`：`total`（整数，**不封顶**）、`talked`、`skipped`、`overflow`、`remainingToFull`、`todayDelta`、`segments[{ key, shortLabel, emoji, allocation, earned, overflow, skipped }]`（イベント `key = 'event'`）。
- 首页 `PlanV2SummaryResponse { current: PlanV2HomeSummary | null; goals: PlanGoalListItem[] }`；`PlanV2HomeSummary { planId, goal, goalKind, score: PlanScoreView, todayChance?: { label, points, href } , sample?: true }`；`PlanGoalListItem { planId, goal, goalKind, status: 'active' | 'achieved', total, talkedPeople, lastOpenedAt? }`。
- 概要 `PlanV2Detail { planId, revision, goal, goalKind, purposeText, premise: PlanPremiseRow[], content: PlanV2Content, score, quota: { reviewLeftThisMonth, reviewMonthlyLimit, manualEditAvailable }, achievedAt?, legacy?: false, sample? }`（R24 只加可选字段：今日のチャンス、三格统计、待确认项）。
- 计分命令：`PlanAwardRequest { contactId?: string; anonymous?: true; at?: string; basis: 'talked' | 'self_report'; idempotencyKey }`（strict）→ `PlanAwardResult { awardLogId, points, part: 'base' | 'overflow' | 'none', reason?, score: PlanScoreView, replayed }`；`PlanUndoRequest { idempotencyKey }`；`PlanSkipRequest { idempotencyKey }`；`PlanStepRequest { idempotencyKey }`。这些**不带** `expectedRevision`、不推进 `revision`（DESIGN §3.2 第 9 条）；`expectedRevision` 只出现在改方案内容的请求里（R23 / R25）。
- 契约 10 `TaskItemContract` 加可选 `planLink?: { planId: string; typeItemId: string }`（只加不改；**提交前征得乙同意**，R20 负责落库，DESIGN §8 R20 行）。
- 深链：`shared/compute/plan-href.ts` 导出构造函数（两端同路径：`plans/flow/<intakeId>`、`plans/drafts/<draftId>/edit`、`plans/<planId>/types/<itemId>`、`plans/<planId>/review`、`plans/<planId>/done`、`plans/legacy/<planId>`，以及 Task › プラン 段 `?tab=plan&plan=` / `task?seg=plan&plan=`；DESIGN §7、§8）。
- `shared/contract/BREAKING.md` 登记（日期、原因「R08 草案只定了顶层，R22 按设计定全字段；分数不封顶」、甲乙同意、App 跟进 = 同步副本），逐项列出：`PlanScoreView.total` 去掉 ≤100；`byType` → `segments`；`PlanV2SummaryResponse` 从 `{ summary, score }` 改为 `{ current, goals }`；`PlanV2Summary` → `PlanV2HomeSummary`；`PlanV2Step` 的 `id / personTypeKey` → `key / personTypeKeys[]`；`PlanV2PersonType` 字段整套更换；删除 `PlanIntakeSummary`（改由 R23 的 `PlanIntakeView` 取代）。

### `shared/api-schema/plan-v2.ts`
响应宽进（不 `.strict()`，`goalKind` 用 `tolerantEnum` 兜底 `'unknown'`，`segments` / `goals` 用 `readableItems`），请求体 `.strict()`。

### 接口（mock：演示世界；live：`PlanV2Service`）

| 接口 | 说明 |
| --- | --- |
| `GET /api/agent/plans/v2/summary` | 首页组件：当前目标（最近打开）+ 目标列表；没有 v2 计划 → `current: null`（有 v1 计划也返回 null，首页显示空态） |
| `GET /api/agent/plans/v2` | 目标列表（生效 + 已达成） |
| `GET /api/agent/plans/v2/[planId]` | 概要数据（本人；他人 404） |
| `POST /api/agent/plans/v2/[planId]/open` | 记 `last_opened_at`（切换目标时） |
| `POST /api/agent/plans/v2/[planId]/types/[itemId]/awards` | 记一次「话过了」（有名字 / 无名字）→ 计分 |
| `POST /api/agent/plans/v2/[planId]/awards/[logId]/undo` | 撤销一次计分（写对冲记录；面谈记录不动） |
| `POST` / `DELETE /api/agent/plans/v2/[planId]/types/[itemId]/skip` | 跳过 / 撤回跳过 |
| `POST /api/agent/plans/v2/[planId]/steps/[stepKey]/complete` | Step 完成（用户确认后才调；可撤回：`DELETE`；写 `plan_log`，幂等键带序号） |

全部要登录；写接口带 `idempotencyKey`（不带 `expectedRevision`，见上）；v1 计划 id 调这些接口 → 409 `PLAN_MODEL_MISMATCH`；已达成的计划 → 409 `PLAN_ACHIEVED`。

### 服务端函数（给其他 Sprint）
`createPlanFromDraft(input)`（R23 确定时调用，一个事务：建 v2 计划与人物类型条目、归档 v1、入队 `plan` 来源匹配任务、第 3 个生效目标拒绝；`version` / `goal_snapshot` / `starts_on` 按 DESIGN §3.2 第 7 条取）、`readActivePlanNeeds(actorId)`（DESIGN §3.6）、`addEventToPlan({ planId?, eventId })`（R26）、`recordEventAttendanceForPlans(actorId, eventId)`（每个有イベント枠的生效 v2 目标各记一次；v1 的 `markEventAttended` 不改）、`planRemainingTargets(actorId)`（R26）、`planGoalRelatedContactIds(actorId)`（R11）。

## 范围与文件

- **新建**：
  - 迁移：`features/plans/migrations.ts` 追加 v2「plans-v2-model」；`features/network-analysis/migrations.ts` 追加「ai-usage-plan-v2-purposes」（含 `event_assessment`）。
  - 纯函数与常量：`shared/compute/{plan-templates,plan-template-copy,plan-score,plan-allocation,plan-href}.ts`（数值与 b10 规范板一致；`plan-template-copy.ts` 放题库题干与选项、必要な力、短名字典、枠名的三语文字。设计稿没有的选项和名称由本 Sprint 撰写，走 R03 的翻译流程，REPORT 请产品负责人过目；加进 `copy:qa` 范围）。
  - 服务：`features/plans/v2/{contract,repository,service,service-factory,mock-service,fixtures}.ts`（`fixtures` 从演示世界组装）。
  - 路由：上表各 `app/api/agent/plans/v2/**/route.ts`（只 re-export）+ `handlers.ts`。
  - 脚本：`scripts/seed-plan-v2.ts`（只对本机 `orbit_test` 等测试库；拒绝生产连接串），造一份已确定、带部分得分和一个跳过类型的 v2 计划。
- **修改**：
  - `shared/contract/plan-v2.ts`、`shared/api-schema/plan-v2.ts`、`shared/contract/BREAKING.md`、`.snapshot.json`；`features/redesign-contracts/{handlers,mock-service,service-factory}.ts`（summary 改走 v2 服务）；
  - `features/ai-quota/{constants,ledger}.ts`（新用途 `plan_intake` / `plan_background` / `plan_draft` / `plan_revise` / `plan_review_mark` / `plan_review` / `event_assessment` 与各自 `max_calls`、`AI_QUOTA_MONTHLY_LIMITS`、计划生成流程日上限 15（不占 10 次总熔断）、`countMonthly`）；
  - 第 7 条「要认 v2 的服务」改读 `readActivePlanNeeds`；`matching-service.ts` 接受 v2 需求的候补时不生成「约 TA」；
  - `features/plans/{contract,service-factory,repository}.ts`（v2 守卫、`plan_log` 新事件常量）；v1 后台任务与 v1 写接口加 `model_version` 守卫；`features/guide/progress.ts`（v1 或 v2 生效即完成）；
  - `shared/mock/demo-world/{index,fixtures}.ts`（`DEMO_PLAN` 改 v2 形状，`goalKind: 'sales'`，带配点、人数、一个跳过类型、イベント枠）；
  - App：`npm run sync:contract` 带上副本；`tests/contract-fixtures-parse.test.ts` 加新 fixture。
- **测试**：
  - `tests/plans/v2-migrations.test.ts`（从零、从 v1 数据升级、重跑、checksum、两份 v1 active 不可能、v2 两目标可共存、第 3 个由服务层拒绝）；
  - `tests/compute/plan-score.test.ts`、`plan-allocation.test.ts`（DESIGN §4.4 全部用例，表驱动）；`plan-templates.test.ts`（每类配点合计 100、5 分一档、必要な力 8 项、题库 6–8 问、短名字典无重复）；
  - `tests/plans/v2-service.test.ts`（计分命令幂等、并发同人同类型只一条、撤销后可重记、跳过期间不加分、匿名到上限后 `part: 'none'`、改配点后旧分不变、`expectedRevision` 冲突）；
  - `tests/plans/v1-guards.test.ts`（v1 读写照旧；v1 写接口对 v2 计划 409；`plan-phase` / 周一小结 / 到期回顾 / `plan-event-*` 跳过 v2；引导进度认 v2）；
  - `tests/plans/v2-consumers.test.ts`（v2 种子计划下：覆盖度、快照的计划输入、人脉分析结构 / 机会标签、联系人详情的计划说明都有数据；两个目标的需求合并；已达成的计划不出现）；
  - `tests/plans/v2-service-functions.test.ts`（`createPlanFromDraft` 归档 v1、入队匹配、第 3 个目标拒绝、重复确定只建一份；`addEventToPlan`；`recordEventAttendanceForPlans` 两个目标各记一次、重复不记；`planRemainingTargets`；`planGoalRelatedContactIds`）；
  - `tests/api/plan-v2-routes.test.ts`（mock 成功、live 未登录 401、他人 404、live 正常、NOT_IMPLEMENTED 不再出现）；`redesign-contract-routes` 的 summary 行改为 live 可用；
  - `tests/ai-quota/monthly-count.test.ts`（按用途、东京自然月、released 不计；计划生成流程日上限独立于 10 次总熔断）；账本已有测试全过。
- **不做**：任何界面；生成流程与 AI 调用（R23）；人物类型详情数据、今日のチャンス、event-score（R24）；見直し、達成、多目标界面（R25）；生产迁移。

## 验收契约

| SC | 操作链 | 主证据 |
| --- | --- | --- |
| SC-R22-01 迁移可用 | 本机空库跑全部迁移；在装有 v1 计划（含 active、archived、各 kind 条目）的库上升级；再跑一次；v1 计划读写不变；手工尝试把 v1 `horizon` 写空、同一人两份 v1 active、v2 缺 `goal_kind` 都被约束拒绝 | `v2-migrations` 测试输出 + 本机 `psql` 结构截图（`\d plans`、`\d plan_items`、四张新表） |
| SC-R22-02 契约转正 | `plan-v2.ts` 无 `@draft`，快照包含它；`BREAKING.md` 有登记；App 同步后解析所有 v2 fixture；`contract-append-only` 通过 | 快照 diff、App `contract-fixtures-parse`、`contract-sync` |
| SC-R22-03 分数规则 | DESIGN §4.4 每一条都有表驱动用例，两端跑同一份函数（App 侧 `src/api/compute` 副本的测试也跑） | `plan-score` / `plan-allocation` 测试（两端） |
| SC-R22-04 读接口 | mock 模式返回演示世界 v2 计划；live 模式下种子计划的 summary / 列表 / 概要与 `summarizePlanScore` 结果一致；没有 v2 计划 → `current: null`；他人计划 404 | `plan-v2-routes` 测试 + 本机 curl 记录 |
| SC-R22-05 计分命令 | 有名字记一次 → +单价；同人同类型再记 → noop；并发两次 → 一条；撤销 → 对冲，再记可以；匿名到目标人数后 `part: 'none'`；跳过 → 满额，撤回 → 回到原分；跳过期间记录 → `part: 'none'` 且理由 `skipped`；改配点（服务方法）后旧记录分值不变 | `v2-service` 测试 |
| SC-R22-06 旧计划不受影响、新计划被认得 | v1 的读、`PATCH items`、`interaction`、`reanalyze`、`bootstrap` 行为与基线一致；它们对 v2 计划返回 409；v1 后台任务跳过 v2；引导第 3 步认 v2；v2 种子计划下覆盖度、快照计划输入、人脉分析、联系人计划说明都有数据 | `v1-guards`、`v2-consumers` 测试 + 现有 `features/plans`、`network-analysis` 测试全过 |
| SC-R22-07 配额基础 | 账本接受 7 个新用途且各自 `max_calls` 生效；`countMonthly` 按东京月计数、不计 released；计划生成流程日上限独立计数；已有两池日配额行为不变 | `monthly-count` + 账本现有测试 |
| SC-R22-08 种子与演示世界 | `seed-plan-v2.ts` 在本机测试库造出计划并打印 planId；对生产连接串拒绝执行；演示世界 v2 计划通过一致性和文案检查 | 脚本输出、`demo-world-consistency`、`demo-world-copy`、`copy:qa` |
| SC-R22-09 给别人的服务端函数 | 「服务端函数」一节列出的 7 个函数各有测试，覆盖正常、重复、越权、已达成 | `v2-service-functions` 测试 |

### 必需证据子表

| SC | 子断言 | 证据 |
| --- | --- | --- |
| 01 | 迁移 SQL 在一个事务里；约束名按定义查找，不依赖默认名 | 迁移源码 + 测试 |
| 02 | 响应 schema 不 `.strict()`、请求 schema `.strict()`（通用规则 10） | schema 源码 + `redesign-schema-parity` |
| 05 | 「同人同类型一次」由唯一键兜底，不只靠服务层先查 | 并发测试（两个事务同时提交） |
| 06 | `resolvePlanService` 14 个调用方逐个核对，REPORT 列表 | REPORT |
| 全部 | 两端全量对照基线零新增失败；`tsc`、`typecheck:app`、`lint` 通过；`copy:qa` 0；`detect-changes` 写进 REPORT（先全量重建索引） | 全量清单 |

## 执行顺序

1. 全量重建 GitNexus 索引，记录基线，跑「关键符号」的 impact。
2. **第一天先提交契约**：`plan-v2.ts` 定稿 + schema + mock fixture + `BREAKING.md` + 快照 + App 同步，提交信息 `contract: plan v2 正式版（App 需要同步：本提交已带副本）`，通知乙（R10 从这里开始接）。
3. `shared/compute` 模板与计分函数（先写表驱动测试 RED）。
4. 两个迁移（先写迁移测试 RED）。
5. `PlanV2Service`：repository → 计分命令 → 读接口 → 服务端函数。
6. v1 守卫与引导进度。
7. 演示世界改形、种子脚本。
8. 全量、REPORT（含给 R23 / R24 / R10 / R11 / R26 的交接）。

## 失败与交接

- 迁移在本机旧数据上发现 v1 数据不满足新约束（例如历史上 `horizon` 有脏值）：不改约束放宽 v1，迁移前加一段只读检查并在 REPORT 写明，交给生产授权时的预检。
- DESIGN 的计分口径在实现中发现冲突：以设计稿定稿为准，改 DESIGN 并在 REPORT「自定决定」写明；涉及产品口径的停下来问。
- REPORT 交接：契约清单与 mock 地址、`PlanV2Service` 方法表、种子脚本用法、v1 守卫清单、`resolvePlanService` 调用方核对表、给生产授权用的迁移预检 SQL（只读）。
