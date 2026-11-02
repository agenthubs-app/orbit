# Sprint R36a — 计划 v3：初稿页 Web

**Plan revision:** 1。**模式:** existing-codebase / single-generator。**档位:** L（界面）+ 一条 H 操作链（契约：确定带调整）。
**单一目标:** Web 初版画面按设计稿 v16「初稿 · 确认」页重做（结论区 / 路线 / 分组可调类型表 / 依据区），初稿页调整不占手动编辑、确定时带调整；v2 旧草稿退回旧画面；三种目标 × 1440 / 390 浅色过像素门禁。
**易读目标:** [GOAL.md](GOAL.md)。**整体设计:** [plan-v3/DESIGN.md](../plan-v3/DESIGN.md)（§1.2 第 3 条、§5 R36 要点、§6 D-1 / D-4 / D-6、§7 旧计划）；设计稿 `docs/designs/redesign-2026-10/plan-draft-v5-proposal.html`（页内「字段表」= 每个字段谁填、上限、缺失怎么显示，**以它为准**）。
**基线:** 开工时 `chat-agent` HEAD（当前 `0ee58ac49`，含 R33–R35 与合流 `e918792b4`）；工作区里 `docs/designs/redesign-2026-10/sprints/R36b-*` 与 `repos/orbit-app/**` 的改动属于并行的 R36b，不得带进本 Sprint 提交。
**进入条件:** R35 已完成（`PlanDraftView.content.schemaVersion === 3` 时有 v3 字段与 `personTypes[].stepKey`，见 R35 REPORT「交接 → 给 R36a / R36b」）；D-1 / D-4 / D-6 已定。
**分支:** 直接在 `chat-agent` 提交，按路径提交；提交前 `git diff --cached` 只含本 Sprint 文件。**并行提醒:** R36b 同时在 `repos/orbit-app/**` 改代码；本 Sprint 的契约改动（SC-01）必须**第一条提交**落地并以 `contract:` 开头注明「App 需要同步」，R36b 在等它。`repos/orbits/scripts/visual/compare-redesign-app.mjs` 归 R36b，本 Sprint 不碰；共用的 lib 改动（若需要）由本 Sprint 做并在 REPORT 交接里写一句。

## 已查清的事实（按 `0ee58ac49`；代码路径相对 `repos/orbits`）

1. **画面入口**：`app/(app)/app/plans/flow/[intakeId]/page.tsx` → `app/(app)/app/orbit-2026/plan/PlanFlowScreen.tsx`（`:397` 渲染 `<DraftCard draft … />`，`:124` `hasDraft`，`:249` `makeDraft`）；`DraftCard.tsx`（213 行，R23 b10 ④ 的卡片：見立て / 結論 / flow / StepsMini / 引用）；样式 `FlowKit.module.css`；文案 `app/(app)/app/orbit-2026/copy/plan.ts`（`planFlowCopy`，三语）。手动编辑独立页 `app/(app)/app/plans/drafts/[draftId]/edit/page.tsx` → `PlanManualEditScreen.tsx`（用 `shared/compute/plan-allocation` 的 `changeAllocation / changeTargetCount / removeSlot / validateAllocations`，`PLAN_ALLOCATION_STEP 5`、`PLAN_ALLOCATION_TOTAL 100`、`PLAN_TYPE_TARGET_MAX 5`、`PLAN_EVENT_TARGET_MAX 10`）。
2. **数据**：`PlanDraftView.content: PlanV2Content`，v3 时含 `outcome / summary (PlanMarkedText: text + marks + refs) / verdict / confidence / orderReasons / comparison / keyNumbers / risks / sources`，`personTypes[].stepKey` = 所属 `steps[].key`；`summary.refs[].ref` 是 `{ kind: "source", sourceId }`（查 `sources[].id`）或 `{ kind: "answer", questionKey }`（查 `premise[].key`）；`risks[]` 里 `kind: "unverified"` 的「本次未能联网核实」文案在 `features/plans/v2/v3-fields.ts` `PLAN_V3_UNVERIFIED_NETWORK_RISK`。`schemaVersion` 缺省或 2 → 旧画面。
3. **确定接口**：`POST /api/agent/plans/drafts/[draftId]/confirm`（`flow-service.ts:2105` `confirm(draftId, idempotencyKey, context)`，不带内容）；`manual-edit`（`PlanDraftManualEditRequest { expectedRevision, steps[], personTypes[{ key, slot?, targetCount, allocation }], event, idempotencyKey }`，`shared/contract/plan-v2.ts:616`）保存即确定且把 `manualEditUsed` 置 true。**D-1 要求初稿页调整不占手动编辑** → 本 Sprint 给 `confirm` 加可选 `adjustments`（形状 = `PlanDraftManualEditRequest` 去掉 `idempotencyKey` 的 `personTypes / event / expectedRevision`，不含 `steps`——初稿页不改阶段），服务端用 `plan-allocation` 的同一套校验（合计 100、5 的倍数、人数上限、不能删到 0 类），通过后以调整后的内容建计划、`manualEditUsed` 不变；失败返回既有 `PlanAllocationError` 码。契约与 `shared/api-schema/plan-v2.ts` 只加可选字段；App 副本经 `repos/orbit-app` `npm run sync:contract`（本 Sprint 只提交契约与快照，**不提交 App 仓库文件**，由 R36b 同步）。
4. **像素门禁**：工具 `scripts/visual/compare-redesign.mjs`（`--suite / --only / --style-diff / --crop / --steps / --design-click / --design-region`），设计稿服务 `python3 -m http.server 3320 -d docs/designs`（仓库根 `.claude/launch.json` 的 `designs`），计划页 mock 服务器 `:3201`（`ORBIT_REDESIGN_MOCK=…plan-v2-summary…`，见 `repos/orbits/.claude/launch.json`），设计稿示例 fixture 机制 `features/plans/v2/design-fixtures/{index,base,a,b,c}.ts` + `switch.mjs` + `app/api/dev/plan-design-fixture/route.dev.ts`（`tests/plans/plan-design-fixtures.test.ts` 守生产不收录）；既有清单范例 `scripts/visual/views/web-plan-B.json`（`W-R23-12` 初版画面：`/app/plans/flow/intake_b10_draft`、`waitFor [data-plan-flow]`）；归因文件格式 `attribution-redesign-R23-25.json`。**设计稿 v16 不是 kit 画板**：没有 `.phone` / 画板容器，状态靠顶部 `.proto` 条的按钮切换（`data-goal` fund / sales / hire、`data-page` draft / home、`data-spec`、端 Web / 手机 = `body.m`），没有 URL 参数、没有深色、没有 1024 宽。工具目前只认画板（`--board*`），没有「整页即画板」模式。
5. **目标映射**：原型 fund / sales / hire ↔ `PlanGoalKind` fundraising / sales / hiring；mock AI 的 `mockDraftV3` 现有 fundraising / launch / sales 三份（`features/plans/v2/ai/mock.ts`），hiring 走 `genericV3Copy`。
6. **语言**：原型示例文字是中文；QA 账号与门禁截图是日文（既有计划页门禁同样如此，文字差按 `[data]` 归因）。
7. **测试范例**：`tests/ui/plan-flow-screens.test.tsx`（流程画面）、`tests/plans/draft-flow.test.ts`（服务）、`tests/api/plan-v2-routes*`（路由）、`tests/contracts/*`（快照）。

## 上下文包

### 必读
- DESIGN §1.2、§5 R36、§6；设计稿 v16 的「初稿 · 确认」页（Web + 手机）与「字段表」页（在浏览器里点 `.proto` 条切换；源码里 `renderDraft(g)`、`evidence()`、`route(g, done)`、`G[goal]`、`draft` 调整态、`.spec` 表）；R35 REPORT「交接 → 给 R36a / R36b」。
- 上文 1–4 列的全部文件；`scripts/visual/README-redesign.md`；HOW-TO 第 8 节（像素门禁、fixture 规则、`--style-diff` 先行）；README 规则 11 / 13；决定表 §20；RD-16 / 26 / 28 / 29。
- 组件库 `app/(app)/app/orbit-2026/ui/**`（优先用现成组件；需要新组件参数按 RD-28 只加参数）。

### 设计稿接入（本 Sprint 定，REPORT 交接给 R36b）
- **原型加 URL 参数**（只加读取、不改任何样式与内容）：`?goal=fund|sales|hire&page=draft|home&device=web|m&spec=0|1&bar=0`，`bar=0` 时不渲染 `.proto` 条（它是原型操作条，不是设计，同规则 13）。这是本 Sprint 对 `docs/designs/redesign-2026-10/plan-draft-v5-proposal.html` 唯一允许的改动，单独一条提交。
- **工具加「整页」模式**：`compare-redesign.mjs` 与共用 lib 支持 `--design-page`（无画板：设计侧把整个 `body` / `.stage` 当画框，宽度按 `--width`，`device=m` 时 390），缓存键升版；`compare-redesign-app.mjs` 的同类改动归 R36b。
- **1024 与深色（设计稿无）**：1024 按 1440 布局流式收窄（和既有计划页一致），深色用既有 token（`--bg / --ink / --card…`）实现；两者**各截一张留档**（`~/orbit-sprint-evidence/web/sprint-R36a/run-01/`），不进门禁、不算「偏离设计」。REPORT「自定决定」登记，等用户过目。
- **fixture**：新建 `features/plans/v2/design-fixtures/d.ts`：三份 v3 草稿（fund / sales / hire），数据**照原型 `G[goal]` 的数值与条数**（来源数、阶段数、类型数、分量、人数、关键数字、风险条数）翻译成日文，`sources` 含 landscape 与 web 两种；intake id `intake_v16_fund / _sales / _hire`、draft id `draft_v16_*`。只补数据，不改画面结构。

### 关键符号与 impact（开工时跑 `node .gitnexus/run.cjs impact "<symbol>" --direction upstream --repo .`；索引落后于 chat-agent 时按 UNKNOWN 文本确认，结果写进 REPORT）
- `confirm`（flow-service）、`confirmDraft`、`planConfirm` 路由 schema（`shared/api-schema/plan-v2.ts`）：只加可选 `adjustments`；不带时行为逐字节不变（回归测试）。
- `DraftCard`、`PlanFlowScreen`（`:397` 分支：v3 → 新组件，否则旧 `DraftCard`）、`PlanManualEditScreen`（不改画面；只在 v3 草稿进入时沿用）。
- `PlanDraftManualEditRequest`、`PlanAllocationSlot` / `validateAllocations`（复用，不改）。
- UNKNOWN 必须文本确认：`[data-plan-flow]` 等门禁锚点的使用处；`planFlowCopy` 新增 key 的三语齐全（有测试守三语）。

### 易错边界（全部对应 SC）
v2 草稿被新画面读成空字段崩溃；调整态存在客户端但刷新丢失（接受，设计如此，但确定前再读一次 `expectedRevision`）；合计算法与 `plan-allocation` 不一致（必须复用同一函数，不自己算）；删到 0 类 / 人数超上限 / 分量非 5 倍数被前端放过；确定带调整却走了 `manual-edit` 把 `manualEditUsed` 置 true；`summary.marks` 加粗渲染越界（按下标切片，不按文字搜索）；`refs` 指向不存在的来源时崩（跳过该引用标记）；没有记录的行仍渲染空壳（字段表「缺失时」列）；来源 `fetchedAt` 超 180 天没标「可能已更新」；`unverified` 风险没有单独标识；门禁用 `--design-remove` 拿正式数字（禁止）；原型改动超出 URL 参数读取；fixture 改了画面结构。

## 范围与文件

- 读取：上文必读；禁止全库再盘点。
- 修改：`shared/contract/plan-v2.ts`、`shared/api-schema/plan-v2.ts`、`shared/contract/.snapshot.json`（脚本生成）、`features/plans/v2/flow-service.ts`（`confirm` 分支）、`app/api/agent/plans/drafts/[draftId]/confirm/route.ts`、`app/(app)/app/orbit-2026/plan/{PlanFlowScreen,DraftCard}.tsx`、`FlowKit.module.css`（或新 `DraftV3.module.css`）、`app/(app)/app/orbit-2026/copy/plan.ts`、`features/plans/v2/design-fixtures/{index,d}.ts`、`scripts/visual/compare-redesign.mjs` + 共用 lib、`docs/designs/redesign-2026-10/plan-draft-v5-proposal.html`（只加 URL 参数）。
- 新建：`app/(app)/app/orbit-2026/plan/DraftV3.tsx`（结论区 / 路线 / 分组类型表 / 依据区）、`draft-v3-model.ts`（调整态与合计，复用 `plan-allocation`）、`scripts/visual/views/web-R36a.json`、`scripts/visual/attribution-redesign-R36a.json`、测试文件。
- 排除：`repos/orbit-app/**`（R36b，含契约副本同步）、`compare-redesign-app.mjs`、计划主页 / 准备卡（R37a）、AI 修正与手动编辑画面改版（不在设计稿范围）、真实 AI、部署。

## 验收契约（最多五项）

| SC | 可观察行为 | 必需证据 |
| --- | --- | --- |
| SC-R36a-01 | **契约（第一条提交）**：`POST …/confirm` 接受可选 `adjustments: { expectedRevision, personTypes[{ key, targetCount, allocation }], event: { targetCount, allocation } }`；不带时响应与改前逐字节相同；带时服务端用 `validateAllocations` 校验（合计 ≠100 / 非 5 倍数 / 人数超限 / 删到 0 类 → 既有 `PlanAllocationError` 码，HTTP 400），通过则计划按调整内容建立、`manualEditUsed === false`、`expectedRevision` 过期 → `STALE`；契约快照 diff 只有新增；提交信息 `contract:` 开头注明「App 需要同步」 | `tests/plans/draft-flow.test.ts` 新增（四种拒绝 + 一种通过 + 逐字节回归）；`tests/api/plan-v2-routes*`；`node scripts/contract-snapshot.mjs` 输出 |
| SC-R36a-02 | **画面**：v3 草稿渲染 `DraftV3`：结论区（outcome、summary 按 `marks` 加粗且每句引用可点开看来源 / 回答、verdict + confidence、「用到的你的信息」= 本次回答）、路线（`steps` + `doneCriteria`，当前阶段高亮）、按 `stepKey` 分组的类型表（每行 emoji / 名 / 阶段 / 人数 stepper / 分量 stepper / 删）、依据区（orderReasons、comparison 行按 verdict 样式、keyNumbers、risks 含 `unverified` 单独标识、sources 列表带抓取日期、`fetchedAt` >180 天标「可能已更新」）；字段表里「缺失时不显示」的行一律不渲染；v2 草稿仍渲染旧 `DraftCard` | `tests/ui/plan-flow-screens.test.tsx` 新增（三种 fixture 渲染断言 + 缺字段隐藏 + v2 退回） |
| SC-R36a-03 | **调整与确定**：删一类 / 人数 ± / 分量 ±5 后合计实时更新（和 `plan-allocation` 同函数）；=100 时「确定」可点，≠100 禁用并显示差值；删到只剩 1 类时删按钮禁用；确定发 `confirm` 带 `adjustments`（无调整时不带）；成功后跳转与现有 confirm 相同；AI 修正 / 手动编辑入口与次数显示不变 | 同上测试文件（请求体断言、禁用态、无调整不带字段） |
| SC-R36a-04 | **像素门禁**：`views/web-R36a.json` 六张：`W-R36a-{fund,sales,hire}` × 1440（`device=web`）/ 390（`device=m`，`--design-as-mweb` 口径）浅色，设计侧 = `http://localhost:3320/redesign-2026-10/plan-draft-v5-proposal.html?goal=…&page=draft&device=…&bar=0`（`--design-page`），实现侧 = `:3201` fixture `v16-*` 的 `/app/plans/flow/intake_v16_*`；超阈值带全部 `[data]` / `[raster]` / `[contrast]`（`attribution-redesign-R36a.json`）；1024 与深色各三张只截图留档 | 门禁总表（每张 raw、超阈值带数、归因路径）、证据目录、`compare.html` |
| SC-R36a-05 | **守门**：fixture 生产不收录（既有 `plan-design-fixtures` 测试扩到 `d.ts`）；原型 URL 参数不改视觉（原型 `bar` 以外参数缺省时渲染与改前相同——用 `--design-page` 对改前后各截一张 diff = 0）；`npx tsc --noEmit -p .`、`npm run lint`、`orbit-2026-css-tokens` / `scope` 门禁、三语文案测试通过 | 测试输出、diff 数字 |

## 一次 Generator 的执行顺序

1. 复核进入条件，保存基线 SHA 与本文件 SHA256；`git status --short` 确认 R36b 的文件不在白名单；起 `designs`（:3320）与计划 mock 服务器（:3201）。
2. impact / 文本确认登记。
3. **SC-01 契约先做先提交**（契约 + 快照 + 服务 + 路由 + 测试同一提交，`contract:` 开头）。
4. 原型 URL 参数（单独提交）→ 工具 `--design-page`（单独提交，REPORT 交接给 R36b）→ fixture `d.ts` → SC-02 / 03 画面与调整（先 `--style-diff` 对 1440 fund 改到无差，再铺三目标与 390）→ SC-04 门禁 → SC-05。
5. 收口：改动测试所在完整文件 + `tests/ui/plan-*`、`tests/plans/*`、`tests/contracts/*`；`npx tsc --noEmit -p .`；L 档不要求全量，但契约操作链按 H：本地收口跑一次 `npm test` 对照基线。
6. `detect-changes --scope all`（`partial / truncated` 重跑）；写 REPORT（含门禁总表、自定决定：1024 / 深色留档）；交接 R36b（`adjustments` 形状、`--design-page` 用法、fixture 名）、R37a（`DraftV3` 组件可复用的部分：路线、来源列表、风险）。

## 最小测试与检查

- 档位 L + H（契约链）。
- 开发定向集：`tests/ui/plan-flow-screens.test.tsx`、`tests/plans/draft-flow.test.ts`、`tests/plans/plan-design-fixtures.test.ts`、`tests/api/plan-v2-routes*`、`tests/contracts/*`。
- 门禁：`compare-redesign.mjs --suite scripts/visual/views/web-R36a.json`（迭代 `--only`，收口全量）。
- 不运行：模拟器（R36b）；真实 AI；生产。

## 失败与交接

进入条件缺项不启动。REPORT 含 SC 映射、各操作链 SHA、impact、命令与退出码、门禁总表、自定决定、未完成项；交接给 R36b（契约提交 SHA、`--design-page`、fixture）、R37a（可复用组件、`[data-plan-draft-v3]` 锚点）、R38（门禁清单路径）。
