# Sprint R35 — 计划 v3：起草 AI

**Plan revision:** 1。**模式:** existing-codebase / single-generator。**档位:** H（付费 AI、写入路径、详情接口）。
**单一目标:** `PlanFlowAi.firstDraftV3` 改为必选并给 deepseek / disabled 实现（新提示词 + `checkDraftV3` + 修复重试一次）；`flow-service` 的初版步骤改为组装 `FirstDraftInputV3`（来源清单编号 `S<n>`、`answerKeys`）、调 `firstDraftV3`、把 `DraftV3` 以 `schemaVersion: 3` 写入草稿（含 `stepKey`、`sources`、未联网时的 `unverified` 风险）；`PlanV2Service.detail()` 透传 v3 字段。搜索通过可选依赖 `search?` 进来，本 Sprint 不实现、不注入。
**易读目标:** [GOAL.md](GOAL.md)。**整体设计:** [plan-v3/DESIGN.md](../plan-v3/DESIGN.md)（§2.1 / §2.2 / §3.1 / §3.4、§5 R35 要点、§7 旧计划）。
**基线:** 开工时 `chat-agent` HEAD（当前 `20d77cf78`，含 R33 全部提交）；工作区里 `docs/designs/redesign-2026-10/sprints/R34-*` 是并行 Sprint 的文件，不得带进本 Sprint 提交。
**进入条件:** R33 已完成（`FirstDraftInputV3` / `DraftOutputV3` / `DraftV3` / `checkDraftV3` / `mockDraftV3` 在代码里，见 R33 REPORT「交接」）；不依赖 R34 落地（用可选依赖 + mock 来源开工）。
**分支:** 直接在 `chat-agent` 提交，按路径提交；提交前 `git diff --cached` 只含本 Sprint 文件。**并行提醒:** R34 同时在新建 `features/plans/search/**`，本 Sprint 不得碰它，也不碰 `flow-factory.ts`（注入由主会话合流后做）。

## 已查清的事实（按 `20d77cf78`）

1. 代码仓库根在 `repos/orbits`（下文路径都相对它）。
2. `PlanFlowAi` 接口（`features/plans/v2/ai/types.ts:232`）`firstDraftV3?` 可选；mock 已实现（`mock.ts:244-262`，`mockDraftV3(input, language)`）；`disabled.ts` 未实现；`deepseek.ts` 未实现。`DeepseekPlanFlowAi.run(step, purpose, context, task, input, check)` 是统一骨架：reserve（`trigger: "plan"`）→ 最多 `min(2, AI_QUOTA_MAX_CALLS[purpose])` 次 chat，第二次带 `repairMessage(user, issues)`；`check` 返回 `Checked<T>`。v3 起草沿用 `firstDraft` 的用途（同一个 purpose 常量，看 `deepseek.ts` 里 `firstDraft` 传的那个）与 `TASKS` 的写法；提示词版本常量 `PLAN_V2_PROMPT_VERSION = "plan-v2-flow-2026-10-v8"`（`prompts.ts:22`），改提示词要升版本。
3. `checkDraftV3(raw, input: ContentCheckInputV3, normalize?) : Checked<DraftV3>`（`schemas-v3.ts:118`）；`ContentCheckInputV3 = ContentCheckInput & { sources; answerKeys: ReadonlySet<string> }`；修理码见 R33 REPORT「交接 → 给 R35」。`DraftV3.personTypes[].stepKey` 由 Step 的 `personTypeKeys` 导出（`step-<n>`）。
4. `flow-service.ts` 初版步骤在 `:1460-1530`：`landscape = publishedEntriesFor(...)` → `ai.firstDraft({...})` → 事务内 `toDraftContent(output, kind, aliases, language, premise, stepKeys?)`（`:586`）→ `PlanDraftRow.content`。`toDraftContent` 已有第 6 个参数 `stepKeys`（R33 预留）。`PlanDraftContent` 的 `analysis` 是 `PlanV2Analysis`（`schemaVersion: 2 | 3`，v3 字段可选，`features/plans/v2/types.ts:59-64`）。同文件 `:1562` 与 `:1801` 还有两处调 `ai.firstDraft`（AI 修正 / 重新生成路径）——本 Sprint **只改 `:1477` 这一处初版**，其余两处保持 v2（修正与重新生成仍基于草稿已有内容；它们产出的 content 要保留 `analysis` 里已有的 v3 字段不丢，加回归测试）。
5. `answerKeys` = `before.premise[].questionId`（`PlanPremiseRow`，`features/plans/v2/types.ts`）。来源清单编号：landscape 条目在前 `S1…`，网页来源接着编；`PlanLandscapeSource = { id, kind: "landscape", landscapeId, version }`。
6. `PlanV2Service.detail()`（`features/plans/v2/service.ts`，content 组装处）目前只透传 v2 字段；契约 `PlanV2Content` 已含 v3 可选字段（R33 `3eb4194dd`），加透传不需要改契约与 App 副本。
7. `createDisabledPlanFlowAi()` 对初版返回 `{ ok: false, reason: "disabled" }`（`disabled.ts`）；live 下无 key 走它（`flow-factory.ts:30-33`）。
8. 测试范例：`tests/plans/plan-flow-ai.test.ts`（假 chat 回包驱动 deepseek 实现）、`tests/plans/draft-flow.test.ts`（flow-service 初版步骤）、`tests/plans/plan-v3-draft-check.test.ts`（四种坏输出夹具，可直接复用其坏回包）。

## 上下文包

### 必读
- DESIGN §2.1、§2.2、§3.1、§3.4、§5 R35 要点；R33 REPORT「交接 → 给 R35」全文。
- `features/plans/v2/ai/{types,schemas-v3,mock,deepseek,disabled,prompts,normalize}.ts`。
- `features/plans/v2/flow-service.ts`（`:270-420` draftView / blankContent、`:576-660` slotInfos / toDraftContent / toDraftOutput、`:1460-1530` 初版步骤、`:1562`、`:1801` 两处 v2 调用）；`features/plans/v2/service.ts` 的 detail content 组装；`features/plans/v2/types.ts`。
- `features/plans/landscape/store.ts`（`publishedEntriesFor`、`resolveCitations`）。
- 测试：上文 8。

### 搜索依赖（和 R34 的约定，两边 PLANNER 一致，不得改名）
`flow-service` 的 `createPlanFlowService` 依赖加可选 `search?: PlanSearchLike`，本 Sprint 在 `features/plans/v2/flow-service.ts`（或 `features/plans/v2/search-port.ts`）本地声明结构类型，与 R34 的 `features/plans/search/types.ts` 逐字段相同：

```ts
interface PlanSearchInput { goalKind; goalText; purpose: string | null; premise: readonly PlanPremiseRow[]; industries: readonly IndustryIdCode[]; language: PlanCopyLanguage }
interface PlanSearchContext { actorId: string; ledgerKeyPrefix: string; now: Date }   // prefix = 初版的 ledgerKey（`draft:<intakeId>:<premiseVersion>[#attempt]`）
interface PlanSearchResult { status: "ok" | "partial" | "unavailable"; sources: Array<Omit<PlanWebSource, "id">>; queries: number; failed: number }
type PlanSearchLike = { search(input: PlanSearchInput, context: PlanSearchContext): Promise<PlanSearchResult> }
```
`search` 缺省或返回 `unavailable` → 来源只有 landscape，并在 `risks` 追加 `{ kind: "unverified", text: 三语「本次未能联网核实」 }`（放在 `checkDraftV3` 之后由服务层追加，不交给模型）。搜索失败 / 抛错绝不阻塞起草（`try/catch` 后按 `unavailable` 处理）。

### 关键符号与 impact（开工时跑 `node .gitnexus/run.cjs impact "<symbol>" --direction upstream --repo .`，结果写进 REPORT）
- `PlanFlowAi`（接口改必选：所有实现 mock / deepseek / disabled 与测试里的假实现都要补 `firstDraftV3`）。
- `createDeepseekPlanFlowAi`、`createDisabledPlanFlowAi`、`toDraftContent`、`createPlanFlowService`（加可选依赖）、`PlanV2Service.detail`（预期 HIGH / CRITICAL：只加字段、不改现有字段语义）。
- `PLAN_V2_PROMPT_VERSION`（升到 v9；查有没有测试钉住旧值）。
- UNKNOWN 必须文本确认：`firstDraft` 的其他调用方（`:1562`、`:1801`）、`PlanDraftContent.analysis` 的其他写入方（`PlanManualEdit`、fix 路径）是否会把 v3 字段丢掉。

### 易错边界（全部对应 SC）
`toDraftContent` 把 `analysis` 整体重建而丢掉 v3 字段（修正 / 手动编辑 / 重新生成路径）；`stepKey` 写错位置（必须进 `plan_items.meta.personType.stepKey`，并与 Step 的 `personTypeKeys` 一致）；来源编号与 `summary.refs` 错位（编号在调模型**之前**定、原样传入 `sources`，模型只能引用这些 `id`）；`answerKeys` 用了题文而不是 `questionId`；模型输出含 `citations` / `sources` 被当真（忽略，由 `checkDraftV3` 导出）；修复提示没把 `issues` 带上；修复后仍坏没有 `finish("failed")`；`unverified` 风险重复追加（重跑 / 幂等回放时）；v2 旧计划 `detail()` 多出 `schemaVersion: 3` 或空数组字段（v2 行新字段必须仍是 `undefined`）；提示词里出现联系人真名（沿用别名机制 `aliasesForDraft`）；提示词版本未升。

## 范围与文件

- 读取：上文必读；禁止全库再盘点。
- 修改：`features/plans/v2/ai/{types,deepseek,disabled,prompts,mock}.ts`（mock 只在接口改必选需要时动）、`features/plans/v2/flow-service.ts`、`features/plans/v2/service.ts`、对应测试文件。
- 新建：`features/plans/v2/search-port.ts`（可选，放 `PlanSearchLike`）、`tests/plans/plan-draft-v3-*.test.ts`。
- 排除：`features/plans/search/**`（R34）、`flow-factory.ts` 注入、契约与 App 副本（不需要）、界面、准备卡、真实 DeepSeek 调用、AI 修正 / 重新生成路径改 v3（留 R36a 之后视需要）。

## 验收契约（最多五项）

| SC | 可观察行为 | 必需证据 |
| --- | --- | --- |
| SC-R35-01 | `firstDraftV3` 为 `PlanFlowAi` 必选；deepseek 实现用新任务提示词（`TASKS.firstDraftV3` / `firstDraftV3Task`，`PLAN_V2_PROMPT_VERSION` 升到 v9，提示词含 §3.1 五条要点：只引用输入来源与回答、先 outcome / conclusion 再 summary、每个外部事实带 sourceId、doneCriteria 可观察、分量按 comparison 排、每类恰好 3 问），好回包一次通过并 `finish("succeeded")`；disabled 实现返回 `disabled` | `plan-flow-ai` 测试新增 v3 用例（假 chat 捕获 system / user 内容，断言含来源 id 清单与 answerKeys、不含真名） |
| SC-R35-02 | 四种坏回包（取 `plan-v3-draft-check` 夹具）各自：可修理的（无来源句 / 坏加粗 / 分量相反 / 坏引用）一次通过并记 `repairs`；不可修理的（如 steps 少于 2、全句无来源）→ 第二次 chat 带 `repairMessage` 与 issues；仍坏 → `{ ok: false, reason: "failed" }`、账本操作 failed、chat 调用恰好 2 次 | 同上测试；账本断言用内存账本 |
| SC-R35-03 | `flow-service` 初版步骤：组装 `FirstDraftInputV3`（landscape 来源 `S1…` 在前、搜索来源接着编、`answerKeys` = premise questionId），调 `firstDraftV3`；写入的 `PlanDraftRow.content.analysis.schemaVersion === 3` 且 outcome / summary / verdict / confidence / orderReasons / comparison / keyNumbers / risks / sources 齐全，`citations` 为用到的 landscape；每个人物类型 `meta.personType.stepKey` 与 Step 对应；`search` 缺省或 `unavailable` → `risks` 恰好多一条 `unverified`，`ok` / `partial` 不加；搜索抛错不影响起草；幂等回放不重复加风险 | `draft-flow` 测试新增（mock AI + 假 search 三态 + 抛错；回放用例） |
| SC-R35-04 | AI 修正、手动编辑、重新生成路径跑过之后，草稿 / 计划 `analysis` 里已有的 v3 字段原样保留（不丢、不改）；v2 旧草稿经这些路径仍是 v2 | 现有 `draft-flow` / 修正相关测试整文件通过 + 新增「v3 字段保留」用例 |
| SC-R35-05 | `PlanV2Service.detail()`：v3 计划返回 v3 字段（与存储一致）；v2 计划返回体与改前逐字节相同；`tests/contracts/*` 与 `plan-v2-routes` 通过，契约快照 diff 为空 | `tests/plans/plan-v2-*` 详情测试新增 v3 用例 + 逐字节对照用例；`node scripts/contract-snapshot.mjs` 输出 |

## 一次 Generator 的执行顺序

1. 复核进入条件，保存基线 SHA 与本文件 SHA256；`git status --short` 确认 R34 的文件不在白名单。
2. 对「关键符号」逐个 impact，HIGH / CRITICAL 写进 REPORT；UNKNOWN 文本确认。
3. 按 SC-01 → 02 → 03 → 04 → 05 RED → 最小实现 → 定向 GREEN；每个 SC 一条操作链提交（接口改必选与三个实现同一提交）。
4. 收口：改动测试所在完整文件 + 直接消费者；`npx tsc --noEmit -p .`；H 档本地代码收口跑一次 `npm test` 对照基线（R33 REPORT 的基线做法：失败清单不新增）。
5. `detect-changes --scope all`（`partial / truncated` 视为未检查，重跑）；写 REPORT；交接给主会话（`search` 注入点与一行写法）、R36a / R36b（content 里 v3 字段与 `stepKey` 的读取路径、`unverified` 风险文案 key）、R38（真实 DeepSeek 验证脚本：一份计划、登记 token 与修理码）。

## 最小测试与检查

- 档位 H：付费 AI、草稿写入、详情接口。
- 开发定向集：`tests/plans/plan-flow-ai.test.ts`、`tests/plans/draft-flow.test.ts`、`tests/plans/plan-v3-draft-check.test.ts`、`tests/plans/plan-v2-*` 详情测试。
- 操作链收口集：上述文件整文件 + `tests/contracts/*` + `tests/api/plan-v2-routes*`；`npx tsc --noEmit -p .`。
- 集成触发：本地代码收口一次 `npm test`，按 RULES 5.2 对照基线。
- 不运行：浏览器与模拟器（无界面改动）；真实 DeepSeek / Tavily 调用（0 次，mock / 假 chat）；生产迁移；App 仓库（契约不变）。

## 失败与交接

进入条件缺项不启动。REPORT 含 SC 映射、各操作链 SHA、impact 结果、命令与退出码、未完成项；交接列出给主会话（注入位置）、R36a / R36b（读取路径、文案 key、v2 降级判断用 `schemaVersion`）、R38（真实调用验证做法）。
