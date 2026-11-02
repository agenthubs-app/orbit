# Sprint R35 — 执行总结

## 结果

对应 [GOAL.md](GOAL.md)。界面没有改动；全部是起草 AI（提示词 v9 / 校验 / 修复重试）、初版步骤的 v3 写入与详情透传。

- 已验证能做到：
  - `PlanFlowAi.firstDraftV3` 成为必选方法；deepseek 实现用新任务提示词（`TASKS.firstDraftV3` + `firstDraftV3Task({ aliases, sourceIds, answerKeys })`，`PLAN_V2_PROMPT_VERSION` = `plan-v2-flow-2026-10-v9`，含 DESIGN §3.1 五条要点），走既有 `run()` 骨架（`plan_draft` 用途、reserve → 最多 2 次 chat → finish）+ `checkDraftV3`；好回包一次通过、账本 `finish succeeded`；system 提示词只列别名与来源 / 回答 id 清单，不含联系人真名；disabled 实现返回 `disabled`（SC-01）。
  - 四种可修理的坏回包（无来源句 / 加粗非子串 / 分量与判定相反 / 引用不存在的来源号）各自一次通过并把 `repairs` 写进 `plan_v2_ai_output_repaired` 日志；不可修理的（steps 少于 2、全句无来源）第二次 chat 的 user 消息 = 原输入 + `repairMessage` 的 issues，仍坏 → `{ ok: false, reason: "failed" }`、账本 `finish failed`、chat 恰好 2 次；第二次修好则 succeeded（SC-02）。
  - `flow-service` 初版步骤组装 `FirstDraftInputV3`：业界现状库来源 `S1…` 在前、搜索来源接着编、`answerKeys` = 前提表每行 `key`；调 `firstDraftV3`；写入草稿 `content.schemaVersion === 3` 且 outcome / summary / verdict / confidence / orderReasons / comparison / keyNumbers / risks / sources 齐全，`citations` = 用到的 landscape 来源，每个人物类型 `stepKey` 与所属 Step 一致；`search` 缺省 / `unavailable` / 抛错 → `risks` 恰好多一条 `unverified`「本次未能联网核实」，`ok` / `partial` 不加；幂等回放（同键或再次 makeDraft）不重复加、不再调搜索与 AI（SC-03）。
  - AI 修正、重新生成（reset 回原版）、手动编辑 + 确定、見直し修正 + 确定之后，草稿 / 计划的 v3 字段与每类 `stepKey` 原样保留；真实（deepseek 适配器 + 假 chat）修正校验器对 v3 草稿也通过（给 AI 的 `current.citations` 为空，修正后由服务层还原 citations / basis）；v2 旧计划经見直し / 修正 / 详情全程没有任何 v3 键（SC-04）。
  - `PlanV2Service.detail()`：v3 计划返回 v3 字段（与 `plans.analysis` 存的逐字段一致）与 `personTypes[].stepKey`；v2 计划 content 的键集合与改前完全相同（逐字节对照用例），`node scripts/contract-snapshot.mjs` 输出「契约快照一致」，契约与 App 副本未动（SC-05）。
- 仍未实现或未验证：
  - 本 Sprint 自己没有注入搜索依赖（PLANNER 排除项）；主会话随后在 `e918792b4` 注入了（见「交接」），本 Sprint 的两个提交单独看时任何环境的初版 `risks` 都带「本次未能联网核实」。
  - 真实 DeepSeek 调用 0 次：提示词 v9 只用假 chat 验证，真实验证留 R38。
  - AI 修正 / 見直し修正路径仍是 v2 调用：它们产出的 v3 字段是「原样带过去」，不会按修正后的内容重写 outcome / summary 等；手动编辑把类型挪到别的 Step 时 `stepKey` 不会跟着变（交 R36b，见「交接」）。
  - `plans-v2-flow-postgres` 等 PostgreSQL 用例已跑（本机回环测试库），但没有新增「v3 草稿经 PostgreSQL 往返」的专门用例；`plan_drafts.content` / `plan_items.meta` 都是整段 JSON，R33 的 analysis 往返用例已证明列能装下。

## 运行记录

- 结果：completed（本地代码收口；无部署 / 生产迁移 / push）
- Generator：Claude Fable 5.1（side session r35）／2026-11-01；Planner revision 1，PLANNER.md SHA256 前 16 位 `fd648743c048268e`
- 分支：直接在 `chat-agent` 按路径提交（基线 `9eb2d23ef`）；与 R34 并行，R34 的提交（`a23442428`…`387fbe915`）夹在本 Sprint 两个提交之间，文件无重叠；未 push
- 档位 H；全量对照见下
- 付费 AI 调用：0 次（DeepSeek / Tavily 都没有真实调用；测试全部 mock / 假 chat / 假 search）
- impact（开工时索引 `d6c9fef`，随后重建到工作树）：
  - `PlanFlowAi` MEDIUM（9 直接上游）：接口加必选方法，三个实现 + 测试夹具 `countingAi` 同一提交补齐；`tsc` 通过。
  - `createDeepseekPlanFlowAi` HIGH、`createDisabledPlanFlowAi` HIGH（各 1 直接上游 = `flow-factory.ts`）：只加方法、签名不变，`flow-factory.ts` 未动。
  - `toDraftContent` LOW（3）、`createPlanFlowService` LOW（1，加可选依赖）、`buildDetail` LOW（3）、`createMockPlanFlowAi` LOW（1）。
  - `PLAN_V2_PROMPT_VERSION` UNKNOWN → 文本确认：读取方只有 `deepseek.ts` 日志与 `tests/plans/plan-pixel-fields.test.ts:107`（钉旧值，已改成 v9）。
  - UNKNOWN 文本确认（PLANNER 要求）：`ai.firstDraft` 的其他调用方只剩 mock / 测试（`:1562` 修正、`:1801` 見直し用的是 `ai.fix` / `ai.reviewFix`，不是 `firstDraft`）；`PlanDraftContent` 的其他写入方 = `fix`（`toDraftContent` 重建 → 加 `carryV3`）、`reviewFix`（同）、`manualEdit`（`{ ...current.content }` 展开，自然保留）、`reset`（`originContent`）、`planContentOf`（計画 → 見直し草稿，加 v3 字段与 stepKey）、`confirmReviewIn`（`...plan.analysis` 展开保留，meta 加 stepKey）。
- `detect-changes`：
  - `--scope staged`（SC-01 提交前）：9 文件 29 符号、risk low、0 processes，非 partial / truncated。
  - `--scope staged`（SC-03～05 提交前）：10 文件 36 符号、**risk critical、37 processes**（`buildDetail` / `createPlanFromDraft` / `fix` 是枢纽）——都是「只加字段、不改既有字段语义」的改动，由 v2 逐字节对照用例（`v2-service` 新增）与 `plans-v2-*-postgres`、`plan-v2-routes`、`tests/contracts/*` 整文件通过守住。
  - `--scope all`（工作树干净后）：No changes；`--scope compare --base-ref 9eb2d23ef`：31 文件 94 符号（含 R34 的提交）、risk critical、37 processes；四份输出都没有 partial / truncated。证据：`~/orbit-sprint-evidence/web/sprint-R35/run-01/detect-changes-*.txt`。
- `npx tsc --noEmit -p .`：每个提交前各跑一次，本 Sprint 文件 0 错；工作区里 R34 的 `tests/plans/plan-search-tavily.test.ts` / `plan-search-service.test.ts` 在其提交前有几处类型错（R34 自己的文件，与本 Sprint 无关）。
- `node scripts/contract-snapshot.mjs`：「契约快照一致」（契约未改）。

### 全量测试对照（RULES 5.2）

基线 = `9eb2d23ef` 的 `repos/orbits` 导出到 scratchpad 跑；HEAD = `e918792b4`（含本 Sprint 两个提交、R34 全部提交与主会话的注入提交）。两边同样带 `ORBIT_EVENT_DATABASE_URL`（本机回环测试库），不 source `.env`；后台顺序跑，不并行。

| | 总数 | 通过 | 失败 | 跳过 |
| --- | --- | --- | --- | --- |
| 基线 | 8072 | 7434 | 67 | 571 |
| HEAD | 8116 | 7519 | 26 | 571 |

失败清单去掉用时后 `comm -13` 对比：**新增 0 条**。HEAD 的 26 个失败都在基线清单里（`plan-review-screens` 等 30 s 超时用例、`/app/agent` 页面、`[postgres]` 问答等既有项）；基线比 HEAD 多出的 41 个是基线副本不在 `repos/orbits` 原路径下跑出的路径依赖用例（与 R33 REPORT 同一现象）。日志：`~/orbit-sprint-evidence/web/sprint-R35/run-01/npm-test-{baseline,head}.txt`、`{baseline,head,new}-failures.txt`。

## 验收结果

| SC | pass / fail / blocked | 证据（测试文件或场景） | commit |
| --- | --- | --- | --- |
| SC-R35-01 | pass | `tests/plans/plan-draft-v3-ai.test.ts`（必选方法 × 3 实现、prompt v9 五要点 + 清单、好回包一次通过 + 账本事件 + system 不含真名、disabled）；`plan-pixel-fields` 版本钉到 v9；`plan-flow-ai` 整文件通过 | `b790007dd` |
| SC-R35-02 | pass | 同文件：四种可修理回包各 1 次 chat + `repairs` 日志；两种不可修理回包 2 次 chat、第二次带 issues、failed + `finish failed`；第二次修好 → succeeded | `b790007dd` |
| SC-R35-03 | pass | `tests/plans/draft-flow.test.ts` 新增：v3 写入 / 来源编号 / answerKeys / citations / stepKey；假 search 五态（ok / partial / unavailable / 抛错 / 缺省）；回放不重复；`plans-v2-flow-postgres` 整文件通过 | `783daeaa0` |
| SC-R35-04 | pass | `draft-flow` 新增：AI 修正 → reset → 手动编辑确定保留 v3；見直し修正保留 v3；v2 计划全程无 v3 键；deepseek 适配器假 chat 的修正校验对 v3 草稿通过并还原 citations / basis；`plan-mock-design-c`（設計稿 C 样例）、`review*`、`flow-review-fixes` 整文件通过 | `783daeaa0` |
| SC-R35-05 | pass | `tests/plans/v2-service.test.ts` 新增：v3 计划 detail 逐字段一致 + stepKey；v2 计划 content / personType 键集合与改前相同、JSON 不含任何 v3 键；`tests/contracts/*` + `plan-v2-routes` + `redesign-contract-routes` 通过；`contract-snapshot` 一致 | `783daeaa0` |

闭合集（`tests/plans/*`、`tests/contracts/*`、`plan-v2 / plan-flow / plan-review / redesign-contract / agent-plans` 路由、四个 `plans-v2-*-postgres`、`plan-review-screens`）：373 用例 371 通过；2 个失败是 `tests/ui/plan-review-screens.test.tsx` 既有的两个 30 s 超时用例（R33 REPORT 基线里就有）。日志：`~/orbit-sprint-evidence/web/sprint-R35/run-01/closing-set.txt`。

## 假设与额外阅读

- **草稿内容的形状**：PLANNER 事实 4 写的 `PlanDraftRow.content.analysis`，实际 `PlanDraftContent` 是扁平的 `PlanV2Content`（没有 `analysis` 字段）。v3 字段因此扁平放在草稿 `content` 上（`content.schemaVersion === 3`），确定时由 `createPlanFromDraft` 落到 `plans.analysis`；详情 `content` 同形。
- **`answerKeys`**：`PlanPremiseRow` 没有 `questionId` 字段；用前提表每行 `key`（回答行的 key 就是 `questionId`，背景行是 `purpose` 等）。模型看到的前提表就是这些 key，R36 用 `premise[].key` 解析 `questionKey`。
- **接口返回类型**：`firstDraftV3` 返回 `PlanAiOutcome<DraftV3>`（校验后：理由段已算下标、类型带 stepKey、sources / citations 已定），不是 R33 写的 `DraftOutputV3`；mock 也过 `checkDraftV3`（R33 固定输出 0 修理通过）。R33 的 `plan-v3-draft-check` 第一个用例相应改为「mock 返回的就是校验后的值」。
- **联系人真名**：user JSON 里的联系人卡片字段（含 `name`）与 v2 一致地交给模型（紹介ルート判断需要）；「不含真名」断言落在 system 任务文本（只列别名）。
- **v3 草稿的 v2 修正**：v3 的 `citations` 从来源清单导出、見立て没有 ①② 标记，v2 修正校验器会因「引用没标记」拒绝（PostgreSQL M1 用例暴露）。处理：`toDraftOutput` 对 v3 内容给 AI `citations: []`，修正后 `carryV3` 还原 citations 与依据区的 landscape 行。
- **`risks` 上限**：追加「本次未能联网核实」时若已满 3 条，丢最后一条保留这条提示（契约 0–3）；同文案不重复。
- **mock v3 的 Step 数**：改成 4 步（人物类型两类一组 + イベント单独一步），与 v2 mock 同形，设计稿 C「Step 3 / Step 4」样例测试照旧；组数到 3 时イベント并进最后一组（不超过 4 步）。
- 新建文件（RULES 0 登记）：`features/plans/v2/search-port.ts`（PLANNER 允许的可选文件）、`features/plans/v2/v3-fields.ts`（v3 字段搬运 / 风险文案 / 上限的小工具，三处共用）、`tests/plans/plan-draft-v3-ai.test.ts`。
- 额外改动的消费者测试：`tests/plans/flow-fixture.ts`（`countingAi` 补 `firstDraftV3`、`flowWorld` 可注入 `search`）、`flow-review-fixes.test.ts` / `draft-flow.test.ts` / `plans-v2-flow-postgres.test.ts` 里的计数从 `firstDraft` 改为 `firstDraftV3`、`plan-pixel-fields.test.ts` 版本钉值、`plan-v3-draft-check.test.ts` 一处。
- 额外阅读：`features/plans/v2/validate-content.ts`（`checkDraftStructure` / `checkDraftContent` 的标记规则）、`features/plans/v2/repository.ts`（`plan_items.meta` 整段 JSON、`dump()`）、`shared/api-schema/plan-v2.ts`（v3 字段与 `stepKey` 已可选）、R34 的 `features/plans/search/types.ts`（只为核对字段，未 import）。

## review 处理（仅 H 档）

代码 review 由主会话安排（RULES 1.1：H 档一次、交回同一 Generator 修）；本 REPORT 写于 review 之前。

## 交接

- 给主会话（注入搜索）：
  - 位置：`repos/orbits/features/plans/v2/flow-factory.ts:45` 的 `createPlanFlowService({ ... })` 加 `search: …`（R34 的 `configuredPlanSearch()` 返回 `PlanSearch`，结构上就是 `features/plans/v2/search-port.ts` 的 `PlanSearchLike`，不需要改类型）。**写 REPORT 时主会话已在 `e918792b4` 注入**（live → `configuredPlanSearch()`，mock → `createMockPlanSearch()`）；全量对照的 HEAD 就是这个提交，0 新增失败。
  - 服务层行为（`flow-service.ts:1533` 起）：只在初版（`makeDraft`）调一次，`ledgerKeyPrefix` = 初版账本键 `draft:<intakeId>:<premiseVersion>[#attempt]`；`unavailable` / 抛错 / 缺省都只在 `risks` 多一条，不抛错、不计次。
  - R34 提交与本 Sprint 文件无重叠；合流后建议整文件跑 `tests/plans/draft-flow.test.ts`、`tests/plans/plan-search-*.test.ts`。
- 给 R36a / R36b（初稿页）：
  - 草稿：`PlanDraftView.content`（= `PlanV2Content`）上 `schemaVersion === 3` 时读 `outcome / summary / verdict / confidence / orderReasons / comparison / keyNumbers / risks / sources`；`personTypes[].stepKey` 是所属 `steps[].key`（分组用）；`summary.refs[].ref` 是 `{ kind: "source", sourceId }`（查 `sources[].id`）或 `{ kind: "answer", questionKey }`（查 `premise[].key`，回答行 key = questionId，背景行 key = `purpose` 等）。`schemaVersion` 不是 3（或缺省）→ 退回 v2.2 画面。
  - 计划：`PlanV2Detail.content` 同形（`detail()` 透传；`service.ts:471` / `:495`）。
  - 「本次未能联网核实」的文案常量：`features/plans/v2/v3-fields.ts` 的 `PLAN_V3_UNVERIFIED_NETWORK_RISK[language]`（ja「今回はインターネットで確認できませんでした」/ zh「本次未能联网核实」/ en "Could not check this online this time."），在 `risks` 里 `kind: "unverified"`；界面要单独标识时按文案或 `kind` 判断。
  - 手动编辑（R36b）：把类型挪到别的 Step 时请同步改 `personTypes[].stepKey`（服务端 `manualEdit` 目前原样保留旧值；写入前可按 `steps[].personTypeKeys` 重算）。
- 给 R38（真实 DeepSeek 验证）：
  - 用 `createDeepseekPlanFlowAi({ chat: bindDeepseekPlanChat(...), ledger, onRejected })` 直接调 `firstDraftV3(input, context)`（输入照 `tests/plans/plan-draft-v3-ai.test.ts` 的 `inputFor` 组，来源用真实 `publishedEntriesFor` 编号）；一份计划、登记 token（`endCall` 的 usage）与 `plan_v2_ai_output_repaired` 日志里的修理码；`onRejected` 把被拒原文留成 fixture。
  - 提示词 v9 的已知风险：`summary` 每句 ≤1 处加粗且必须是原句子串、`comparison.rows[].typeKey` 必须是 slot id；被拒最可能出在这两处和「每类恰好 3 问」。
- 需要用户授权：无新项（R33 的生产迁移 v8 / 部署 / push 仍待授权）。
