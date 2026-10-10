# Sprint R22 — REPORT（计划 v2.2：数据、契约与分数）

**执行人：** 小雨（甲）的执行会话，2026-10-10。**分支：** 直接在 `redesign` 上提交（一人做）。
**依据：** [PLANNER](PLANNER.md)、[plan-v2.2/DESIGN.md](../plan-v2.2/DESIGN.md)（版本 2，用户 2026-10-10 确认四项）。
**证据目录：** `~/orbit-sprint-evidence/redesign/R22/run-01/`（基线与收口日志、impact、detect-changes、种子脚本输出）。
**没有做的事：** 没连 Neon、没部署、没调用任何付费 AI（R22 不含 AI 调用）；迁移只在本机 `orbit_test` 的随机 schema 里跑。

## 做了什么

1. **第一天先提交契约**（`0bc931f4`，`contract:` 提交，App 副本同提交）：`shared/contract/plan-v2.ts` 去掉 `@draft` 进入快照；`PlanV2SummaryResponse { current, goals }`、`PlanScoreView`（不封顶、`segments`）、`PlanV2Detail`、`PlanV2Content`、计分命令的请求 / 结果；`BREAKING.md` 两行；契约 10 加可选 `TaskPlanLink`；`shared/api-schema/plan-v2.ts` 响应宽进（`goalKind` 未知 → `unknown`）、请求 strict；演示世界的计划改成 v2「シリーズA 資金調達」，分数由共享计分函数算出。
2. **共享纯函数**（`shared/compute`，两端同步）：`plan-score.ts`（记账式计分：`nextAward`、`skipAwardPoints`、`summarizePlanScore`）、`plan-allocation.ts`（配点回流、`unitPoints`、校验）、`plan-templates.ts`（6 类模板、题库、配点、短名字典、关键词、空き、±5 校验）、`plan-template-copy.ts`（三语文字，已纳入 `copy:qa`）。
3. **两个迁移（本机）**：`plans` v2「plans-v2-model」（加列、放宽 `horizon`、按目标分桶的唯一索引、达成 = archived + `achieved_at`、4 张新表）；AI 账本「ai-usage-plan-v2-purposes」（7 个新用途，含 R26 的 `event_assessment`）。
4. **AI 配额基础**：新用途与各自 `max_calls`、月上限 `AI_QUOTA_MONTHLY_LIMITS`（`plan_background` 10 = 每月新目标 10 个、`plan_review` 3 …）、计划生成流程日上限 15（不占 10 次总熔断）、`countMonthly`。
5. **`PlanV2Service`**（`features/plans/v2/`）：Postgres + 内存两种仓储（与 v1 同一把按人的锁、同一个连接池）；读（目标列表、首页当前目标、概要）；计分命令（有名字 / 无名字、撤销、跳过 / 撤回、Step 完成 / 撤回，幂等回执 + 唯一键）；给别人的函数（`createPlanFromDraft`、`addEventToPlan`、`recordEventAttendanceForPlans`、`planRemainingTargets`、`activeTypeNeeds`，以及 `active-needs.ts` 的 `planGoalRelatedContactIds`）。mock 模式用演示世界装好的内存仓储。
6. **路由**：`GET /api/agent/plans/v2/summary`（R08 的「尚未实现」换成真实实现）、`GET /api/agent/plans/v2`、`GET …/[planId]`、`POST …/open`、`POST …/types/[itemId]/awards`、`POST|DELETE …/types/[itemId]/skip`、`POST …/awards/[logId]/undo`、`POST|DELETE …/steps/[stepKey]/complete`。
7. **旧计划守卫**：v1 仓储只看 `model_version = 1`（生效计划、按 id 读、版本列表、条目、周一小结的记录）；匹配管线的四个 v1 维护查询加 `model_version = 1`；已有 v2 生效计划时不能再写入 v1 生效计划（`V2_PLAN_ACTIVE` 409）。
8. **复核 S1 的落实**：`readCurrentPlanForSnapshot`（人脉快照 + 三个分析标签）、`readCurrentPlanReadOnly`（联系人计划说明）、引导进度，改经 `mergeActivePlanNeeds`（v1 + v2 各目标合并，只在 live 时读 v2）。
9. **本机种子脚本** `scripts/seed-plan-v2.ts`：只写本机回环库、名字含 prod / neon / staging 的库和生产一律拒绝；重复执行只建一份。

## SC 对照

| SC | 结论 | 证据 |
| --- | --- | --- |
| 01 迁移可用 | ✅ | `tests/capabilities/plans-v2-migrations-postgres.test.ts`：从零、在已有 v1 计划 / 各类条目 / 记录 / 回执的库上升级、重跑不变、v1 `horizon` 不能为空、v2 不能有 `horizon`、v2 缺目标被拒、同一人两份 v1 生效被拒、两个 v2 目标可共存、同一目标两份被拒、生效计划不能带达成时间、配点必须 5 的倍数、跳过只给人物类型、每份计划只一份打开的见直草稿；`plans-repository` 的表清单更新 |
| 02 契约转正 | ✅ | 快照包含 `plan-v2.ts`（376 个类型），`BREAKING.md` 两行；App `contract-fixtures-parse` 解析 summary 与 detail；`redesign-schema-parity` 新增 7 组对照；`contract-append-only` 通过 |
| 03 分数规则 | ✅ | `tests/support/plan-score-cases.ts` 一张表，服务端 `tests/domain/plan-score.test.ts` 与 App `tests/plan-score-compute.test.ts` 各跑同步副本；`plan-allocation.test.ts`（b10 ⑥ 的两个例子：E +5 从 A 扣；移除 C 15 → A、B、D 各 +5）、`plan-templates.test.ts` |
| 04 读接口 | ✅ | `tests/api/plan-v2-routes.test.ts`：mock 下读写演示计划且过 schema；live 未登录 401、他人 404、没有计划 `current: null`、live 响应里不出现演示数据、后端缺失 503 NOT_IMPLEMENTED；种子计划的分数 40 与 `summarizePlanScore` 一致（`seed-plan-v2-run1.log`） |
| 05 计分命令 | ✅ | `tests/plans/v2-service.test.ts`（11 条）+ `tests/capabilities/plans-v2-service-postgres.test.ts`：同人同类型一次、同键重放、同键不同内容 409、余数给最后 1 人、超额半分、匿名到目标后不加、撤销后可重记（唯一键 `:1` → `:2`）、跳过记满额（扣已得）与撤回、跳过期间不加分、**三个并发请求只记一条**、计分不推进 `revision` |
| 06 旧计划不受影响、新计划被认得 | ✅ | Postgres：确定 v2 归档 v1；v1 的 `getCurrent` / `getCurrentView` / `getPlan` / `listVersions` 看不到 v2；v1 `updateItem` 对 v2 条目 404；已有 v2 时 v1 `createVersion` 409 `V2_PLAN_ACTIVE`；v1 维护查询跳过 v2（`plans-v2-service-postgres` 第 5 条）；`plans-v2-consumers-postgres`：只有 v2 的人，快照输入、覆盖度、行业高亮、联系人计划说明都有数据，两个目标合并、跳过和已达成不算；现有计划 / 匹配 / 维护 / 快照 / 洞察 Postgres 测试全过（见收口） |
| 07 配额基础 | ✅ | `plans-v2-migrations-postgres` 第 4 条：新用途写库与 `max_calls`、旧用途外的值被拒、見直し第 4 次 `monthly_limit`（下月 1 日恢复）、released 不计、跨月重新计数、计划生成流程第 16 次 `plan_flow` 被挡而用户池仍可用 10 次；`ai-usage-ledger-postgres` 只多了 `planFlow: 0` 的读数 |
| 08 种子与演示世界 | ✅ | `seed-plan-v2-run1/2/refuse.log`；`tests/scripts/seed-plan-v2.test.ts`；`demo-world-consistency`、`demo-world-copy` 通过；`copy:qa` 501 条 0 问题 |
| 09 给别人的服务端函数 | ✅ | `v2-service.test.ts`：`createPlanFromDraft`（归档 v1、版本号接在 v1 之后、重复确定只建一份、第 3 个目标拒绝、配点 / Step 校验）、`addEventToPlan`、`recordEventAttendanceForPlans`（两个目标各记一次、重复不记）、`planRemainingTargets`、`activeTypeNeeds`；Postgres：v2 计划能入队候补匹配、`planGoalRelatedContactIds` 跨目标去重 |

## 自定决定

| # | 事项 | 决定 | 理由 / 对标 |
| --- | --- | --- | --- |
| 1 | v1 接口碰到 v2 计划 | v1 的读写把 v2 当「不存在」：读返回 null、改条目 404；只有「生成新的 v1 生效计划」返回 409 `V2_PLAN_ACTIVE`（DESIGN 原写全部 409） | 过滤放在 v1 仓储一个点上，不改 CRITICAL 的 `PlanService` 各个方法；与「别人的计划视为不存在」同一口径（GitHub 对无权仓库返回 404） |
| 2 | 账本 `reserve` | 只给 R22 的新用途加了两条分支（计划生成流程日上限、月上限）；旧用途的计数与行为不变（`USAGE_SQL` 的 `user_used` 排除了新用途，旧用途的结果不变） | 月上限要和预留在同一把锁里判断，否则并发会超；旧用途回归测试全过 |
| 3 | v2 的 `plan_log` 事件名 | 常量在 `features/plans/v2/types.ts`（`PLAN_V2_LOG_EVENTS`），不改 v1 的 `PLAN_LOG_EVENTS` | v1 只按自己的事件名处理；数据库不约束取值 |
| 4 | 撤销记录不挂联系人 | `score_reversed` 的 `linked_contact_ids` 为空 | 关系强度与时间线按「挂了联系人的计划记录」计互动，撤销不该再算一次 |
| 5 | mock 模式的 v2 | 每个人第一次访问时装入演示世界的示例计划（`sample: true`，不写库） | 前端在 mock 下能走完整的读写；与 R08「mock 返回演示世界」一致 |
| 6 | 合并读取只在 live | `readActiveV2Needs` 只在 live 读；mock、后端缺失、表未迁移时返回 null | 防止示例计划混进分析和测试 |
| 7 | 人物类型的行业条件 | `plan_items.criteria` 里存 `primaryIndustryId / secondaryIndustryId`（R23 的初版给出） | 规则匹配与分析高亮靠它；契约外的内部字段 |
| 8 | 迁移里的 `horizon` 约束 | 写成 `model_version = 1 and horizon is not null and …` | CHECK 遇到 NULL 会放行，测试发现 v1 可写空期限，补上 |
| 9 | 题库文字 | 设计稿没有的选项、能力名、短名由本 Sprint 撰写（日文为主，三语），过 `copy:qa`；`AI・データ` 按写作规范改成「AI とデータ」，几处选项缩短以符合 chip 长度 | 请产品负责人过目文字（见交接） |
| 10 | 演示计划 | 改为「シリーズA 資金調達（3億円）」（`fundraising`），和 app.html / b4 的示例一致；原「年内に初期顧客を 5 社つくる」的 `customers` 不是 6 类之一 | 示例人物多是 VC，和资金调达更配 |
| 11 | `TaskPlanLink` | 在第一天的契约提交里加（只加不改） | DESIGN §8 约定；用户 2026-10-10「都按推荐」已覆盖，**仍请乙在 R20 时确认** |
| 12 | 种子脚本的连接串 | 只读 `ORBIT_SEED_DATABASE_URL`，不读 `.env` | 避免误连到 `.env.local` 里的开发库或云端 |

## 基线 → 收口

| | 基线（开工） | 收口 |
| --- | --- | --- |
| orbits `npm test` | 6950 条，6076 过，2 失败（`app-contact-value-line` 的 SC-W0061-01/03、`app-plan-match-sheet` 的 slow match；单独重跑两次都过，全量负载下不稳定），872 跳过 | **7011 条，6128 过，0 失败**，883 跳过（新增 61 条） |
| App `npm test` | 4174 条，1 失败（`route-parity` 的 `/start`，已知） | 4187 条，2 失败：`/start`（已知）+ `personal-schedule-interactions` 的 23:45 用例（单独重跑两次都过，全量负载下不稳定）；新增 13 条全过 |
| orbits `typecheck` / `typecheck:app` / `lint` | 0 / 0 / 0 | 0 / 0 / 0 |
| App `tsc` | 0 | 0 |
| `copy:qa` | — | 501 条，0 问题 |

第一次收口全量发现 13 条失败，都已修：
- 11 条 `app-agent-guide-demo-page`：测试把 `features/plans/service-factory.ts` 整个替换成只有 `resolvePlanService` 的替身，引导进度新读 v2 时拿不到 `resolvePlanBackend` 而抛错。修法：`readActiveV2Needs` 解析 v2 服务失败时按「没有 v2 计划」处理。
- 1 条全项目类型检查：种子脚本测试传 `{}` 给 `NodeJS.ProcessEnv`。修法：参数类型放宽为只读的字符串字典。
- 1 条 `app-plan-match-sheet` slow match：基线已有的不稳定用例。

收口全量（修完后第二次）：orbits 7011 / 0 失败（`final2-orbits-test.log`）；计划、匹配、维护、账本、快照、洞察的 Postgres 测试（`ORBIT_EVENT_DATABASE_URL` 指本机 `orbit_test`）118 / 0（`final-postgres-tests.log`）。之后只追加了 `planGoalRelatedContactIds` 与它的 Postgres 测试（3 / 3 通过）。

## GitNexus

- 开工：`analyze --index-only --force` 全量重建（增量会漏 `features/plans`）。impact 结果在 `impact-start.md`：`resolvePlanService` CRITICAL 50、`PlanService` CRITICAL 121、`createPlanService` CRITICAL 55、`createPostgresAiUsageLedger` CRITICAL 80、`createPostgresPlanRepository` HIGH 37、`AiQuotaPurpose` MEDIUM 35、`TaskItemContract` MEDIUM 72、`PlanV2SummaryResponse` LOW 23、`createMemoryPlanRepository` LOW 16、`runPlanMigrations` LOW 4、`runNetworkAnalysisMigrations` LOW 2；UNKNOWN（`AI_QUOTA_MAX_CALLS`、`PLAN_LOG_EVENTS`、`planV2SummaryResponseSchema`、`configuredHasActivePlan`、`DEMO_PLAN`、`demoPlanSummary`、`readCurrentPlanForSnapshot`、`readCurrentPlanReadOnly`）均用文本搜索确认了调用方。
- 对 CRITICAL / HIGH 的对策：
  - `PlanService` / `createPlanService` / `resolvePlanService`：**没有改任何已有方法**；`resolvePlanService` 未动，service-factory 只新增 `resolvePlanBackend` 并让后端带上连接池；`PLAN_ERROR_REASONS` 只追加 `V2_PLAN_ACTIVE`。
  - `createPostgresPlanRepository`（HIGH）：只给 7 条查询加 `model_version = 1`，`insertPlan` 前加 v2 生效检查；新增导出 `planActorLockKey`。
  - `createPostgresAiUsageLedger`（CRITICAL）：新增 `countMonthly`；`reserveWith` 只对新用途加分支；回归测试 `ai-usage-ledger-postgres` 全过。
- `resolvePlanService` 的 14 个非测试调用方核对：`agent/page.tsx`、`agent/plan/read-current-plan.ts`、`agent/strategy/page.tsx`、`api/agent/plans/{route,candidates,bootstrap,reanalyze}/route-handlers.ts`、`features/plans/{matching-runtime,event-attribution-runtime}.ts`、`features/operations/maintenance/configured-tasks.ts`、`scripts/seed-verify-accounts.ts` → 只认 v1，行为不变（v2 对它们不存在）；`features/network-analysis/runtime.ts`、`features/plans/contact-plan-context.ts`、`features/guide/progress.ts` → 改为同时认 v2（S1）。
- 提交前 `detect-changes`（增量刷新后）：25 个文件、132 个符号、0 条受影响流程、风险 low（`detect-changes-final.log`；含用户自己未提交的 `bridge/handoffs.md`，不在本次提交）。

## 交接

- **给 R10（乙）**：`GET /api/agent/plans/v2/summary` 已 live；mock 下返回演示计划。`current` 为 null 时显示「目標を決める」空态。`segments` 里 `key = "event"` 是イベント枠。
- **给 R11（乙）**：人脉分析与联系人计划说明已认 v2（合并读取，live 时）；`planGoalRelatedContactIds(actorId)`（`features/plans/v2/active-needs.ts`）返回 v1 需求 + v2 各目标关联过的联系人（去重），供 `goalRelated` 筛选的 live 实现调用。
- **给 R20（乙）**：契约 10 已有 `TaskPlanLink`，请在 R20 落库并确认。
- **给 R23**：`createPlanFromDraft(input)`（草稿 id 做 `creationKey`、intake id 做 `goalId`；人物类型可带 `primaryIndustryId / secondaryIndustryId`），确定后调 `enqueuePlanSourceMatchAfterSave` 入队候补；AI 用途、`max_calls`、月上限、计划生成流程日上限已就绪。
- **给 R24**：读模型 `detail()`、计分命令全部可用；`recordEventAttendanceForPlans` 待接到活动签到 / 「参加した」；关系时间线对 `score_awarded` 显示通用标题「计划：更新」，R24 可加专用标题。
- **给 R26**：`event_assessment` 用途与 `max_calls: 2` 已在迁移里；`addEventToPlan`、`planRemainingTargets` 可用。
- **请产品负责人过目**：题库选项、能力名、短名字典的三语文字（`shared/compute/plan-template-copy.ts`）。
- **生产授权清单（合回前）**：迁移一 `plans-v2-model`（plans 模块 v2）、迁移二 `ai-usage-plan-v2-purposes`（network-analysis 模块 v3）。执行前在生产只读预检：`plans` 上含 `horizon` 的 CHECK 名、`ai_usage_ledger.purpose` 现有取值、每人 active 计划数（应 ≤1）。

## 已知例外

- v2 人物类型的 `status` 沿用 v1 口径（有一个 established 就是 established），目标人数没到也会显示为已建立；结构标签的行业高亮因此只看 open / linked 的类型。覆盖度按 `targetCount` 计，不受影响。
- `GET /api/agent/plans/v2`（目标列表）没有单独的契约 schema（响应是 `{ goals: PlanGoalListItem[] }`），R25 做目标下拉时补。
