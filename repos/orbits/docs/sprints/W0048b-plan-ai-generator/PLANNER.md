# Sprint W0048b — 计划生成接 DeepSeek 两阶段，基于快照排行动

> revision 3：按 REVIEW-2026-10-02-network 裁决修订（R-3、R-4、R-6、R-11、R-14、R-16，配额口径统一）：一次计划生成 = 用户主动池 1 次操作，流水线唯一结算、`generateSnapshotNow` 不结算；取消「≤5 次」，改为每次 HTTP 前增量登记子账、硬上限 14（骨架 1 + 阶段 ≤12 + 快照 1），补 4／12／13 阶段对抗用例与部分失败／重放／无响应结算用例；计划生成受用户池总熔断约束（数值已定（D45，2026-10-02））；SC-05 加 bootstrap／reanalysis、计划 GET、季度维护三类读流量实测；验收契约改为「操作链 + 主证据」+ 必需证据子表。
>
> revision 2：按 D44 定稿待定项、W0048 拆分、配额两池（2026-10-02）。本 Sprint 由原 W0048 rev 1 的 SC-05 扩展而来（C-2／W48-1），配额按 C-5 两池口径。

**Plan revision:** 3。**模式:** existing-codebase / single-generator。运行状态只在登记表。
**原需求:** RN-06 中「计划接 AI」部分（两阶段生成、校验器、老模板计划重新生成）；RW-08 两阶段与校验器（Q17A）沿用；D42 推翻 D3；D44（C-2、C-5）。快照、三层更新与账本在 [W0048a](../W0048a-network-snapshot-quota/PLANNER.md)。
**单一目标:** 计划生成与重新分析改由 DeepSeek 两阶段完成，先经 W0048a 产出或复用快照再排行动；计划生成计入用户主动池（一次生成 = 1 次操作，本流水线是该操作的唯一结算者）；读取路径 0 次模型调用，季度补细只在维护任务里做并计入后台池；老模板计划可点「AI 重新生成」且不占月额度；生产开关定义好但不切。
**易读目标:** [GOAL.md](GOAL.md)。
**基线:** 开工时 `chat-agent` HEAD（编制时 `a48e1749`）。W0048a 合并后才开工，下文行号按 `a48e1749`，开工时按符号重新定位。
**进入条件:**
- **W0048a completed**（登记表依赖；传递要求 W0045、W0046、W0047 completed）。从 W0048a REPORT 交接节**只取**：`generateSnapshotNow`（持有者结算）、`decideSnapshotRefresh`、账本 `reserve／beginCall／endCall／finish` 签名、`max_calls` 表、用户池常量与错误码 `USER_DAILY_LIMIT`、`purpose` 枚举（含 `plan`、`plan_refine`）、`features/ai/deepseek-json-chat.ts` 的导出、`NetworkSnapshotView` 字段。缺任一项则 blocked。
- W48-1、W48-2、W48-6～W48-10 已定（D44，见文末）。
- 付费调用：D42 已批准计划接 DeepSeek；开发与测试默认 mock，真实调用上限见 SC-W0048b-05。生产环境变量切换另行授权（W48-9，放 W0055）。

## 已查清的事实（按 `a48e1749`）

1. 替换点已留好：`generator-service-factory.ts` 只注册 `mock`，其他取值 fail closed；`generatePlanDraft` 已是两阶段（阶段并行 2 路，任一失败整份失败）。老模板计划的 `plans.analysis.generator = "mock-template-v1"`。
1a. **阶段数上限是 12，生成器对每个阶段都调用一次**（R-4，编制时按 `4f0aa533` 核实）：`features/plans/contract.ts` 的 `PLAN_LIMITS.phasesPerPlan: 12`；`generator.ts` 的 `generatePlanDraft` 先 `generator.skeleton(input)`，再对 `skeleton.phases` **全部**（不区分 `detailed`）经 `mapBounded` 调 `generator.phaseDetail`。所以一份计划的 HTTP 次数 = 骨架 1 + 阶段数（≤12）+ 快照需刷新时 1，最多 14；并发 2 只限制并行度，不限制总数。
2. `validate.ts` 已拒绝不在输入里的联系人／活动 id 并经 `PlanReferenceValidator` 核本人；`analysis.figures` 现由生成器给——模型给就是编的数字。输入裁剪单一来源 `PLAN_INPUT_CONTACTS_SQL` + `selectPlanContacts`（≤200）。
3. 月额度记在 `plan_log` 键 `reanalysis:<YYYY-MM>`（`service.ts:711` 事务内先查）；`next_plan` 不占额度但须已到期。
4. **读取路径会调生成器**：`phase-refinement.ts:120 defaultPhaseRefiner()` 在 `getCurrentView()`（`service.ts:1290`；GET 当前计划、计划页 SSR，阶段边界时经 `enterPhaseTransaction()` 写「进入新阶段」）与 `plan-phase` 维护任务的写事务里补一年期后续季度——切 AI 不处理，打开页面就付费调用。人脉页（W0049～W0054）的计划读取一律改用只读的 `getCurrent()`（`service.ts:688`，R-6），本 Sprint 只处理计划页自身的 `getCurrentView` 路径。
5. bootstrap／reanalyze 路由无 `maxDuration`（先例 300）。

## 设计定稿（本 Sprint 落地，REPORT 交接最终名）

### A. 计划接 DeepSeek（`features/plans/ai-generator.ts`，provider 名 `ai`）

- 流水线（bootstrap／reanalysis／next_plan／ai_regenerate 共用）：向账本预留**一次操作**（`pool: "user"`、`purpose: "plan"`、`trigger: "plan"`、幂等键 = 计划的 `creationKey`、`max_calls = 14`）→ 用 W0048a `decideSnapshotRefresh` 判定，非 `fresh` 则 `generateSnapshotNow({ origin: "plan", trigger: "plan", planId, operationId })` 先生成并保存（该入口只登记子账、**不结算**，R-3）→ 生成器输入带上快照块（当前语言 + 依据）→ 骨架一次调用 → **骨架解析后、任何阶段 HTTP 之前**校验阶段数 ≤ `PLAN_LIMITS.phasesPerPlan`（12），超出整份失败（R-4）→ 各阶段并行 2 路 → **解析层丢弃不在输入里的 id**（`ally` 整条去掉，`thisWeek` 只去 id，丢弃数写日志）→ `validateGeneratedPlan` 原样兜底 → 保存 → 流水线 `finish` 一次。
- **每次 HTTP 增量登记子账（R-4）**：骨架、每个阶段、快照的每次供应商请求发出前都 `beginCall` 一条子账（超过 `max_calls` 即被账本拒绝、不发请求），响应后 `endCall` 写 token；不再「按阶段数预先估 units」。**结算唯一所有者 = 本流水线**：全部成功 → `succeeded`；快照成功后骨架失败、阶段部分成功、校验失败等任一失败且已有响应 → `failed`（已发生的每次 HTTP 都在子账里）；全程无响应 → `released`；同幂等键重放返回原操作与原结果，不再发请求。`PlanAnalysisV1` 只加可选 `snapshotId`。
- 配额：一次计划生成（含同请求快照与全部阶段）= 用户主动池 **1 次操作**；频次另由既有规则约束（bootstrap 幂等、每月一次重新分析、next_plan 到期、ai_regenerate 每份老计划一次），并受用户主动池总熔断（每人每东京日 10 次操作，含手动重新分析 3 次；**数值已定（D45，2026-10-02）（R-11）**）约束：用满时 bootstrap／reanalyze 返回 429 `USER_DAILY_LIMIT`、0 次调用，计划页按钮置灰并提示「今天次数已用完，明天可用」。
- 计划生成在**请求内同步**（W48-8）：两个路由加 `maxDuration` 300；幂等键重放；断线后服务端仍保存，客户端重进页面读到结果。
- `analysis.figures` 三个数字**服务端规则算**（已确认联系人数、与目标相关人数、本计划人脉需求数），忽略模型给的数字；`allies[].name/subtitle` 由服务端按输入填，模型只给 `contactId` 与 `help`。
- 人脉需求 `criteria` 只加可选 `targetCount`（1–5，缺省按 1；`validators.ts` 校验），W0050 覆盖度用它（W0050 先于本 Sprint 合并时按缺省 1 计）。
- 请求写法用 W0048a 的 `features/ai/deepseek-json-chat.ts`（`json_object`、`thinking` 禁用、超时 + signal、usage 回传、失败也带 usage）；不改 `ai-matcher.ts`。

### B. 读取路径 0 次模型调用与季度补细（W48-10）

- `defaultPhaseRefiner` 对 `generator !== MOCK_PLAN_GENERATOR_ID` 的计划在 GET 路径（`getCurrentView`、计划页 SSR）只记「进入新阶段」不补细；mock 计划行为不变。
- 补细只在 `plan-phase` 维护任务里做：事务外调用、幂等写入（幂等键 `plan-refine:<planId>:<phaseIndex>`）、每个阶段的补细向后台池预留 **1 次操作**（`pool: "background"`、`purpose: "plan_refine"`、`trigger: "auto"`、`max_calls = 1`），维护任务是该操作的唯一结算者；后台池不够 → 0 次调用、顺延到次日 00:00 东京，页面先显示季度级条目。

### C. 老模板计划 AI 重新生成

- `PlanVersionOrigin` 加 `"ai_regenerate"`；条件 = 生效计划 `analysis.generator === "mock-template-v1"` 且当前 provider 是 `ai`；`creationKey = ai-regenerate:<旧计划 id>`（每份老计划只一次，重复点击 replay）；**不写** `reanalysis:<月>` 键；带入已完成内容与 W0023「约 TA」规则同 `reanalysis`；计入用户主动池（`purpose: "plan"`）。
- 走 `POST /api/agent/plans/reanalyze` 的 `origin: "ai_regenerate"`（服务端核条件）；计划页显示提示行「这份计划由模板生成，可用 AI 重新生成（不占本月重新分析次数）」，生成中、完成后新版本各有状态。

### D. 生产开关（W48-9）

- 生产仍为 mock：`ORBIT_PLAN_GENERATOR` 生产不设或为 `mock`；本 Sprint 只在本机与测试中设 `ai`。切换（`ORBIT_PLAN_GENERATOR=ai`、`ORBIT_NETWORK_ANALYSIS_GENERATOR=deepseek`）与 W0048a／W0051／W0053 的生产迁移放 W0055 收口时一起请求授权。
- `ai` provider 缺 `DEEPSEEK_API_KEY` 时 fail closed（与 `generator-service-factory` 现有未知 provider 一致），不静默回退 mock。

## 上下文包（Generator 从这里起步，不通读其他 REPORT）

### 必读文件
- `features/plans/`：`generator.ts`、`generator-service-factory.ts`、`mock-generator.ts`（输出形状对照）、`bootstrap.ts`、`reanalysis.ts:166`、`validate.ts`、`input-source.ts`、`input-selector.ts`、`service.ts:711–760`、`contract.ts:132／418`、`validators.ts`、`phase-refinement.ts:80–140`、`ai-matcher.ts`（请求写法参照）。
- `features/operations/maintenance/configured-tasks.ts`（`plan-phase` 任务位置）。
- `app/api/agent/plans/{bootstrap,reanalyze}/`；`app/(app)/app/agent/iorbit-0918/iorbit-plan.tsx:400–600`、`iorbit-plan-client.ts`、`app/(app)/app/agent/plan/{plan-route-view-model.ts,page.tsx}`。
- W0048a REPORT 的「交接」节（只读交接节）。

### 关键符号（原样）与 impact
- `resolvePlanGenerator(input: { provider?: string | null } = {}): ServiceResolution<PlanGenerator>` — **HIGH**（6；直接：bootstrap／reanalyze 路由解析器、`defaultPhaseRefiner`），即事实 4 的风险点，开工先报告。
- `generatePlanDraft(generator: PlanGenerator, input: PlanGeneratorInput, options: { concurrency?: number; idempotencyKey?: string | null } = {}): Promise<PlanDraft>` — LOW（2）。
- `validateGeneratedPlan(input: { draft: PlanDraft; generatorInput: Pick<PlanGeneratorInput, "contacts" | "events">; references: PlanReferenceValidator }): Promise<void>` — LOW（2）。
- `createPlanBootstrapService(input: { actorId; plans; references; source; generator; now? }): PlanBootstrapService`、`createPlanFollowUpService(...)` — LOW（各 1）。
- `createVersionWithOutcome(input: CreatePlanVersionInput, options?: { origin?: PlanVersionOrigin; contactNames?: Readonly<Record<string, string>> }): Promise<{ snapshot: PlanSnapshot; created: boolean }>` — UNKNOWN（接口方法），文本搜索：`bootstrap.ts`、`reanalysis.ts`、`service.ts` + 3 个测试文件。
- `export type PlanVersionOrigin = "reanalysis" | "next_plan";` — 文本搜索：`iorbit-plan-client.ts`、`reanalyze/route-handlers.ts`、`reanalysis.ts`、`contract.ts`。
- 只调用不改：W0048a 的 `decideSnapshotRefresh`、`generateSnapshotNow`、`reserve／beginCall／endCall／finish`、`deepseek-json-chat`。

### 前序交接要点
- W0048a：快照契约与同步生成入口（调用方预留、入口不重复预留）；账本两池（用户主动池给计划，后台池给 `plan_refine`）；`NetworkSnapshotView`。
- W0045／W0046／W0047（经 W0048a 传递）：生成器输入里的联系人按 `seniorityGroup()` 派生 4 档、地区 `region`、强度 `tier`／`dormant`；依据 id 用时间线 `RelationshipTimelineItem.id`。
- W0023／W0036：`createVersionWithOutcome` 的「约 TA」带入规则、`#plan-action-<id>` 锚点不变。

### 易错边界（全部写进 SC 并要求测试）
编造 id 丢弃 + 校验器兜底、模型 figures 不进库；阶段数 >12 在任何阶段 HTTP 前失败、每次 HTTP 都有子账且不超 `max_calls`（R-4）；流水线唯一结算、快照入口不结算、部分失败／重放／无响应各有确定结果（R-3）；GET 计划与计划页 0 次调用；补细只在维护任务、后台池满 0 次调用且顺延；老模板重新生成不动月额度键、第二次 replay；计划生成计入用户主动池 1 次操作、不受后台池用满影响、受总熔断约束（R-11）；示例模式不预留配额、不调生成器；生产开关不切；三类读流量有实测（R-14）。

## 范围与文件

- 新建：`features/plans/ai-generator.ts`；`tests/services/plan-ai-generator.test.ts`；`scripts/measure-plan-ai-read-traffic.ts`（R-14 三类读流量实测）。
- 修改：`features/plans/` 的 generator-service-factory、generator、bootstrap、reanalysis、validate、contract、validators、service、phase-refinement；两个计划路由（加 `maxDuration` 与 `ai_regenerate`）；计划页四个文件；`configured-tasks.ts`（`plan-phase` 补细接后台池）；受影响的既有测试。
- 排除：快照存储、判定、账本（W0048a，只调用）；分析页三标签（W0049～W0052）；不足 3 人卡与示例快照（W0054）；导入（W0053）；`ai-matcher.ts` 重构；`shared/compute/*` 与 `/api/mobile/contacts-dashboard`；App 端；生产环境变量与迁移。

## 验收契约（五项；revision 3 起每项 = 一条操作链 + 一个主证据，其余断言见「必需证据子表」，R-16）

| SC | 操作链（可观察行为） | 主证据 |
| --- | --- | --- |
| SC-W0048b-01 AI 生成器基于快照、按操作计次 | `ORBIT_PLAN_GENERATOR=ai` 时走一次 bootstrap：先经 `decideSnapshotRefresh` 产出或复用快照，再两阶段生成，计划 `analysis.snapshotId` 指向它；账本恰好 1 条 `pool='user'、purpose='plan'` 操作行，子账条数 = 实际 HTTP 次数 | `tests/services/plan-ai-generator.test.ts`（假 fetch、计数快照桩、账本桩） |
| SC-W0048b-02 编造 id、失败与结算 | 模型输出含编造联系人／活动 id 时解析层去掉后保存；骨架或任一阶段失败时整份失败、不写计划，流水线把操作结算为 `failed` | `plan-ai-generator.test.ts`（结算场景用例组） |
| SC-W0048b-03 读取路径 0 调用与季度补细 | 对 AI 计划打开计划页 SSR 与 GET 当前计划：0 次模型调用，只记「进入新阶段」；季度补细只在 `plan-phase` 维护任务里发生 | `tests/capabilities/plan-current-view-postgres.test.ts`（生成器调用计数 spy） |
| SC-W0048b-04 老模板计划 AI 重新生成 | 生效计划为 `mock-template-v1` 且 provider 为 `ai` 时，计划页提示行点击「AI 重新生成」→ 生成新版本，`reanalysisQuota().used` 前后相同 | `tests/services/plan-reanalysis.test.ts` |
| SC-W0048b-05 真实调用、读流量与收口 | 本机测试账号跑 bootstrap、ai_regenerate 各 1 次（余量 1 次）真实 DeepSeek，同时实测 bootstrap／reanalysis、计划 GET、季度维护三类数据库读流量（R-14） | REPORT 调用次数与 token 表（子账聚合）+ 读流量预算表（`~/orbit-sprint-evidence/web/sprint-W0048b/run-01/`） |

### 必需证据子表（每条子断言独立留证，缺一即该 SC 不通过）

| SC | 子断言 | 证据 |
| --- | --- | --- |
| 01 | 快照 `fresh` 时 0 次快照 HTTP；非 `fresh` 时快照 HTTP 记在同一操作的子账下 | `plan-ai-generator.test.ts` |
| 01 | **R-4 对抗用例**：模型骨架返回 4 个阶段 → HTTP = 1 + 4（+ 快照 1）且每次都先有子账；返回 12 个阶段 → 1 + 12（+1）≤ 14，全部有子账；返回 13 个阶段 → 骨架解析后即失败，阶段 HTTP 0 次；断言不存在「无子账的供应商请求」（fetch 次数 = 子账条数） | `plan-ai-generator.test.ts` |
| 01 | 后台池已满时计划生成照常；用户池总熔断用满（10 次操作，常量，数值已定（D45，2026-10-02））时 bootstrap 429 `USER_DAILY_LIMIT`、0 次调用 | 生成器 + 路由测试 |
| 01 | `figures` 等于规则值，`allies` 姓名由服务端填；`targetCount` 越界（0、6、非整数）被拒、缺省按 1 | `plan-ai-generator.test.ts`、validators 测试 |
| 01 | 请求体 `thinking` 禁用、`json_object`、超时；缺密钥 fail closed | 假 fetch 测试 |
| 02 | `ally` 整条去掉、`thisWeek` 只去 id，丢弃数进日志；他人联系人 id 视同编造；校验器单测仍对编造 id 抛 `REFERENCE_NOT_FOUND` | `plan-ai-generator.test.ts`、`tests/services/plan-generator.test.ts`（校验器用例不改） |
| 02 | **R-3 结算场景**：①快照成功后骨架失败 → 操作 `failed`、子账 2 条（快照 responded、骨架 responded／no_response）、计 1 次；②阶段部分成功 → `failed`、每次 HTTP 各一条子账；③同幂等键重放 → 返回原操作与原结果、0 次新 HTTP、不再计次；④全程无响应 → `released`、不计次；四种场景下 `generateSnapshotNow` 都未调用 `finish`，流水线恰好 `finish` 一次 | `plan-ai-generator.test.ts`（账本 spy） |
| 03 | `plan-phase` 维护任务对进入后续季度的 AI 计划补细：事务外调用、每阶段 1 次后台池操作、同一幂等键重跑 0 次调用 | 改后的 `tests/services/plan-phase-refinement.test.ts`、维护任务测试 |
| 03 | 后台池满 → 0 次调用、次日重试、页面显示季度级条目；mock 计划行为与改前相同 | 同上 |
| 04 | `plan_log` 无 `reanalysis:<月>` 新键；第二次点击 replay 不再生成；条件不满足时服务端 400；「约 TA」带入规则与 `reanalysis` 一致 | `plan-reanalysis.test.ts`、`tests/api/agent-plans-reanalyze-route.test.ts` |
| 04 | 1440／375 浏览器看到入口、生成中、完成后新版本；用户池用满时按钮置灰与「今天次数已用完，明天可用」 | `tests/pages/app-agent-iorbit-screens.test.tsx`；证据目录截图与控制台 |
| 05 | 真实调用：≤3 次计划操作，HTTP 合计按子账记录、硬上限 42（= 3 × 14）；测试目标选短期目标以压低阶段数；每次记录 token | REPORT（子账聚合输出） |
| 05 | **R-14 读流量**：拦截 `pg.Client.prototype.query`（W0017 口径）实测 ①bootstrap 与 reanalysis 各一次（快照判定、计划输入、快照读写）②计划 GET 与计划页 SSR 各一次 ③`plan-phase` 季度补细维护任务一轮；①②按「1000 活跃用户 × 计划页每人每天 2 次 + 每月 1 次 reanalysis + 新用户 1 次 bootstrap」并入 D39 用户路径总账（开工时 README 最新三档），③单列后台预算行、不与用户打开频次混算；超 1.6 GB 登记 D32 | `scripts/measure-plan-ai-read-traffic.ts` 输出 + REPORT 预算表 |
| 05 | 生产 `ORBIT_PLAN_GENERATOR` 不动（W48-9），REPORT 写明 W0055 需授权的开关与迁移清单 | REPORT |
| 05 | H 档：全量 `npm test` 对照基线新增失败 0、`npx tsc --noEmit -p .`、一次 Codex 代码 review | 全量清单、review 处理 |

## 一次 Generator 的执行顺序

1. 核对进入条件，读 W0048a 交接节，记哈希与基线，报告 `resolvePlanGenerator` HIGH。
2. RED → 实现：AI 生成器与快照衔接（SC-01、02）→ `defaultPhaseRefiner` 与维护任务补细（SC-03）→ `ai_regenerate` 与计划页入口（SC-04）。
3. 本机测试账号真实调用（≤3 次计划操作，HTTP 合计硬上限 42，按子账记录）、R-14 三类读流量实测、浏览器验证；按操作链提交（生成器／读取路径与补细／老计划重新生成），`detect-changes --scope staged`，REPORT，交接。

## 最小测试与检查

- **档位 H**（付费 AI、计划写路径、HIGH 符号 `resolvePlanGenerator`）。数据库测试先跑 `node scripts/assert-local-test-databases.mjs`，REPORT 证明未 skip。
- 开发定向集：SC 表所列测试；`tests/services/plan-{generator,bootstrap,reanalysis,phase-refinement}.test.ts`。
- 收口集：`tests/services/plans-service.test.ts`、`tests/capabilities/{plans-repository,plan-current-view-postgres}.test.ts`、`tests/api/agent-plans-*.test.ts`、`tests/pages/{app-agent-plan-route-view-model.test.ts,app-agent-iorbit-screens.test.tsx}`、W0048a 的快照服务与账本测试（证明调用方接线不破坏）、维护任务注册相关测试；`npx tsc --noEmit -p .`。
- 全量：本地代码收口一次 `npm test`，按 RULES 5.2 对照基线；不 source `.env`。
- 浏览器：`orbits` 端口 3000（占用即复用），计划页 1440／375，cookie 注入登录；证据 `~/orbit-sprint-evidence/web/sprint-W0048b/run-01/`。
- 不运行：App 端、`shared/compute` 消费者、生产迁移与部署。

## 失败与交接

W0048a 未合并或交接缺项：不启动。DeepSeek 不可用：SC-05 的真实调用部分记 blocked，mock 部分照常验收，不降低 SC。
REPORT 交接（给 W0054、W0055）：`ai` provider 名与环境变量、`PlanAnalysisV1.snapshotId`、`targetCount` 校验、`ai_regenerate` 的入口与条件、季度补细的幂等键与后台池用法、R-14 三类读流量实测与预算表行（用户路径并入 D39；季度维护单列后台预算）、生产切换清单（`ORBIT_PLAN_GENERATOR=ai`、`ORBIT_NETWORK_ANALYSIS_GENERATOR=deepseek`、W0048a 三表迁移）、真实调用次数与 token。列本线分支 `sprint/W0048b-plan-ai-generator`、固定最终 SHA，交协调者合并 `chat-agent`。

## 已定（D44，2026-10-02）

| 编号 | 定稿结论 | 对标做法 |
| --- | --- | --- |
| W48-1 | 原 W0048 拆分；本 Sprint 为 W0048b（计划接 DeepSeek 与老计划重新生成），依赖 W0048a | Linear／Notion 先上数据层与计量，再逐个入口接入，每次可单独回滚 |
| W48-2（= C-5；rev 3 按操作计次） | 计划生成与重生成（含 ai_regenerate 与同请求快照）计入用户主动池，一次生成 = 1 次操作，频次由计划侧既有规则约束并受用户池总熔断（每人每东京日 10 次操作，数值已定（D45，2026-10-02））约束；季度补细计入后台池（每阶段 1 次操作，每人每东京日 60 次操作，超限顺延次日）；成本按每次 HTTP 一条子账；两池共用 W0048a 的 `ai_usage_ledger` | Notion AI／HubSpot Breeze：用户动作与后台富化分开计量 |
| W48-6 | 操作内任一 HTTP 拿到供应商响应（含输出无效）才计次；全程未发出或无响应释放；每次 HTTP 都记子账 | Stripe metered billing 只记真实发生的用量 |
| W48-7 | 编造 id 解析层丢弃 + 校验器兜底；只有骨架或阶段整体失败才整份失败 | Perplexity、Notion AI Q&A 丢掉无出处的引用而不是让整次回答失败 |
| W48-8 | 计划生成请求内同步（`maxDuration` 300、幂等键重放、断线服务端仍保存）；快照自动重算的后台方式在 W0048a | Notion AI、Linear AI 原地显示生成进度并在完成后落库，长任务靠幂等重试 |
| W48-9 | 生产仍为 mock；`ORBIT_PLAN_GENERATOR=ai`、`ORBIT_NETWORK_ANALYSIS_GENERATOR=deepseek` 与生产迁移放 W0055 收口时一起授权 | 新 AI 功能用开关灰度（LaunchDarkly 式 feature flag），先迁移再开开关 |
| W48-10 | 一年期计划后续季度补细只在 `plan-phase` 维护任务里做，计入后台池，超额顺延次日，页面先显示季度级条目 | Linear Cycles 自动排期在后台任务里做，打开页面不触发重计算 |
