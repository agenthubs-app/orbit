# Sprint R36b — 计划 v3：初稿页 App

**Plan revision:** 1。**模式:** existing-codebase / single-generator。**档位:** L（界面；契约只同步不改）。
**单一目标:** App 初版画面按设计稿 v16「手机」视图的「初稿 · 确认」页重做（结论区 / 路线 / 分组可调类型表 / 依据区），初稿页调整不占手动编辑、确定时带 `adjustments`（R36a 的契约）；v2 旧草稿退回旧画面；手动编辑挪阶段同步 `stepKey`；三种目标 × 模拟器浅色过像素门禁。
**易读目标:** [GOAL.md](GOAL.md)。**整体设计:** [plan-v3/DESIGN.md](../plan-v3/DESIGN.md)（§1.2 第 3 条、§5 R36 要点、§6 D-1 / D-4 / D-6）；设计稿 `docs/designs/redesign-2026-10/plan-draft-v5-proposal.html`（端切到「手机」= `body.m`；「字段表」页为准）。
**基线:** 开工时 `chat-agent` HEAD（当前 `0ee58ac49`）；工作区里 `docs/designs/redesign-2026-10/sprints/R36a-*`、`repos/orbits/**` 的改动属于并行的 R36a，不得带进本 Sprint 提交（**例外**：`repos/orbits/scripts/visual/compare-redesign-app.mjs` 归本 Sprint）。
**进入条件:** R35 已完成；R36a 的 **SC-01 契约提交**（`contract:` 开头、`confirm` 带 `adjustments`）落地后才能做本 Sprint 的 SC-03 确定接线与 `sync:contract`——开工时用 `git log --oneline chat-agent -- repos/orbits/shared/contract/plan-v2.ts` 查，没到就先做 SC-02 / SC-04 的画面部分，隔 20 分钟再查。R36a 的 `--design-page`（共用 lib）同理：没到就先用 `--design-click` 临时截图定位差异，正式数字等它。
**分支:** 直接在 `chat-agent` 提交，按路径提交；提交前 `git diff --cached` 只含本 Sprint 文件（`repos/orbit-app/**`、`sprints/R36b-*`、`compare-redesign-app.mjs`、`views/app-R36b.json`、`attribution-redesign-R36b.json`）。

## 已查清的事实（按 `0ee58ac49`；App 路径相对 `repos/orbit-app`）

1. **画面入口**：`app/plans/flow/[intakeId].tsx` → `src/screens/plan/PlanFlowScreen.tsx`（`:179` 前提卡 + `makeDraft`，`:197` 起 `draft && intake.status !== "planned"` 分支渲染 `PlanDraftCard`、`DraftActions` / `DraftUsedUp`、`PlanTurn` 修正卡、`PlanFixBar`）；`PlanDraft.tsx`（`PlanDraftCard` 含 見立て 4 行折叠、`?` 引用、`DraftActions` 两个按钮）；kit：`plan-kit.tsx`（`KitCard / KitChip / KitEmo / KitButton / kitText / useKitWhy`）、`plan-flow-kit.tsx`（`Bubble / ChatScrollTarget / FootFade / BlockSection…`）；文案 `src/i18n/*`（`plan.draft.*`、`plan.manual.*` 三语）。手动编辑 `src/screens/plan/PlanManualEditScreen.tsx`（用 `src/api/compute/plan-allocation` 同步副本：`allocationTotal / removeType / canRemoveType`、`PLAN_ALLOCATION_TOTAL` 等；`:281` 删类型、`:146` 人数）。
2. **数据**：`src/api/contract/plan-v2.ts` 是 `shared/contract/plan-v2.ts` 的同步副本（`npm run sync:contract`，AGENTS.md），R33 已含 v3 字段；`PlanDraftView.content.schemaVersion === 3` 时读 outcome / summary / verdict / confidence / orderReasons / comparison / keyNumbers / risks / sources 与 `personTypes[].stepKey`；`summary.refs[].ref` 查 `sources[].id` / `premise[].key`；`unverified` 风险文案见 R35 REPORT。`schemaVersion` 缺省或 2 → 旧画面。
3. **确定**：`src/screens/plan/plan-api.ts:103` `confirm(draftId, idempotencyKey)`、`:104` `manualEdit(draftId, body)`；R36a 给 `confirm` 加可选 `adjustments: { expectedRevision, personTypes[{ key, targetCount, allocation }], event: { targetCount, allocation } }`，App 同步契约后在 `plan-api.ts` 的 `confirm` 加第三个可选参数。
4. **手动编辑的 `stepKey`**（R35 交接）：`manualEdit` 请求的 `steps[].personTypeKeys` 是真相，服务端原样保留旧 `stepKey`；本 Sprint 在 App 发送前不需要算（服务端字段），但 App 的手动编辑画面把类型挪阶段后，草稿回读的 `stepKey` 会错 → 本 Sprint 在 **App 的显示层**按 `steps[].personTypeKeys` 推导分组（不信 `stepKey`，两者不一致时以 steps 为准），并在 REPORT 交接请 R37a 在服务端 `manualEdit` 写入前重算。
5. **像素门禁（App）**：`repos/orbits/scripts/visual/compare-redesign-app.mjs`（`--suite / --only / --shot / --design --board* / --theme / path`（开发开关 open-path：Metro 带 `EXPO_PUBLIC_ORBIT_REDESIGN_MOCK=open-path`，脚本写 AsyncStorage `orbit.dev.openPath`，`src/screens/add/dev-open-path.ts`）/ `url` 深链 `orbit://plans/flow/<intakeId>`）；清单范例 `views/app-plan-B.json`（`A-R23-12`：`url: orbit://plans/flow/intake_b10_draft`、`fixture: b10-flow`）；模拟器 iPhone 16e 390×844 @3x、日文、状态栏 9:41；开发包 `.env.development.local` 指向 mock 服务器（`http://localhost:3201`，**不要改 `.env.local`**）；Metro 不带 `CI=1`；设计侧 3x 渲染再缩（README「App 画框半像素偏移」「3x」两节）。**设计稿 v16 没有画板**：R36a 给原型加 `?goal=&page=&device=m&bar=0` 并给 Web 工具加 `--design-page`（共用 lib）；本 Sprint 把 `compare-redesign-app.mjs` 接上同一模式（设计侧整页 390 宽当画框）。原型无深色。
6. **fixture**：由 R36a 新建 `features/plans/v2/design-fixtures/d.ts`（`v16-fund / v16-sales / v16-hire`，intake `intake_v16_*`），用 `switch.mjs --origin http://localhost:3201 --storage <qa-storage> --name v16-fund` 切换；App 连同一台 mock 服务器即可看到。R36a 没落地前用 mock 模式的 `mockDraftV3` 数据（fundraising / launch / sales）先对画面。
7. **测试**：`tests/plan-screens.test.tsx`（流程画面，`node --test` + render hooks）、`tests/plan-model.test.ts`；`npm run typecheck`；`npm test` 全量（App 基线失败清单见 R12 / R27 REPORT 的做法，开工时跑一次基线）。

## 上下文包

### 必读
- DESIGN §1.2、§5 R36、§6；设计稿 v16 手机视图的「初稿 · 确认」页 + 「字段表」页；R35 REPORT「交接 → 给 R36a / R36b」；R36a PLANNER「设计稿接入」节（契约形状、`--design-page`、fixture 名——两边必须一致）。
- 上文 1–5 的全部文件；`repos/orbit-app/AGENTS.md`；`scripts/visual/README-redesign.md` App 节；HOW-TO 第 8 节；README 规则 11 / 13；决定表 §20；RD-16 / 26 / 28 / 29；R25 REWORK-REPORT-app（App 计划页门禁的坑：行距、假名、状态栏）。
- App 组件库 `src/components/ui/**`、`src/design/theme.ts`（token）。

### 关键符号与 impact（App 仓库没有 GitNexus 索引：用 `grep` 列调用方并写进 REPORT）
- `PlanFlowScreen`（`:197` 分支：v3 → 新 `PlanDraftV3`，否则旧 `PlanDraftCard`）、`PlanDraftCard`（不改）、`DraftActions`（v3 时由新组件自带底部栏）、`plan-api.confirm`（加可选参数，调用方：`PlanFlowScreen`、测试）、`PlanManualEditScreen`（只改分组推导，不改画面）。
- `src/api/contract/**`、`src/api/compute/**`：只经 `sync:contract` 生成，不手改。

### 易错边界（全部对应 SC）
同 R36a 的清单（v2 崩溃 / 合计算法不复用 / 走 manual-edit 置 true / marks 越界 / refs 悬空 / 空壳行 / 180 天标记 / unverified 标识）+ App 特有：ScrollView 里 stepper 连点触发滚动；底部确定栏盖住最后一行（安全区 + FootFade）；日文混排行基线（UiText 已修，不要再手调 lineHeight）；系统状态栏不要自己画（规则 13）；手动编辑挪阶段后分组显示错；`sync:contract` 带进了 R36a 之外的快照改动（只提交 `src/api/**` 且 diff 只含 R36a 契约那次的字段）。

## 范围与文件

- 读取：上文必读；禁止全库再盘点。
- 修改：`src/screens/plan/{PlanFlowScreen,PlanDraft,plan-api,plan-model,PlanManualEditScreen}.tsx|ts`、`src/i18n/*`（新 key 三语）、`src/api/**`（仅 `sync:contract` 产物）、`repos/orbits/scripts/visual/compare-redesign-app.mjs`。
- 新建：`src/screens/plan/PlanDraftV3.tsx`、`plan-draft-v3-model.ts`（调整态与合计，复用 `src/api/compute/plan-allocation`）、`tests/plan-draft-v3-screens.test.tsx`、`repos/orbits/scripts/visual/views/app-R36b.json`、`repos/orbits/scripts/visual/attribution-redesign-R36b.json`。
- 排除：`repos/orbits` 其余文件（含契约、服务、Web 画面、共用 lib——归 R36a）；计划主页（R37b）；AI 修正 / 手动编辑画面改版；真实 AI；TestFlight。

## 验收契约（最多五项）

| SC | 可观察行为 | 必需证据 |
| --- | --- | --- |
| SC-R36b-01 | **契约同步**：R36a 契约提交落地后 `npm run sync:contract`，`git status` 只有 `src/api/**`，`npm run typecheck` 通过；`plan-api.confirm(draftId, key, adjustments?)` 不带时请求体与改前相同 | sync 后 diff 摘要、typecheck 退出码、`tests/plan-draft-v3-screens.test.tsx` 请求体断言 |
| SC-R36b-02 | **画面**：v3 草稿渲染 `PlanDraftV3`（结论区 / 路线 / 按 `steps[].personTypeKeys` 分组的类型表（行内人数、分量 stepper、删）/ 依据区折叠展开，`unverified` 单独标识、`fetchedAt` >180 天「可能已更新」、字段表「缺失时不显示」的行不渲染）；v2 草稿仍渲染旧 `PlanDraftCard` + `DraftActions`；AI 修正卡与 `PlanFixBar` 照旧 | `tests/plan-draft-v3-screens.test.tsx`（三种数据渲染 + 缺字段 + v2 退回） |
| SC-R36b-03 | **调整与确定**：合计与 `plan-allocation` 同函数实时更新；=100 可确定，≠100 禁用并显示差值；只剩 1 类时不可删；确定发 `confirm` 带 `adjustments`（无调整不带）；成功后导航与现有 confirm 相同；`manualEditUsed` 不变（mock 服务器回读断言） | 同上测试（请求体、禁用态） + mock 服务器集成断言 |
| SC-R36b-04 | **像素门禁**：`views/app-R36b.json` 三张 `A-R36b-{fund,sales,hire}` 浅色，设计侧 = 原型 `?goal=…&page=draft&device=m&bar=0`（`--design-page`，390 宽 3x 渲染再缩），实现侧 = 16e 模拟器连 `:3201` fixture `v16-*` 的 `orbit://plans/flow/intake_v16_*`；超阈值带全部 `[data]` / `[raster]` / `[contrast]`（`attribution-redesign-R36b.json`）；深色三张只截图留档 | 门禁总表、证据目录 `~/orbit-sprint-evidence/app/sprint-R36b/run-01/`、`compare.html` |
| SC-R36b-05 | **手动编辑分组**：App 手动编辑把一类从阶段 1 挪到阶段 2 并保存后，回到流程页的 v3 画面按 `steps` 分组显示在阶段 2（不信旧 `stepKey`）；`npm test` 全量对照基线不新增失败 | 测试用例 + 全量对照表 |

## 一次 Generator 的执行顺序

1. 复核进入条件（R36a 契约与 `--design-page` 是否已落地，记进 REPORT）；保存基线 SHA 与本文件 SHA256；起 mock 服务器 `:3201`、Metro（`EXPO_PUBLIC_ORBIT_REDESIGN_MOCK=open-path`，不带 `CI=1`）、16e 模拟器（日文、9:41）。
2. 调用方 grep 登记。
3. SC-02 画面（先用 `mockDraftV3` 数据对手机视图，`--design-click` 临时定位差异）→ SC-03 调整态 → 等 R36a 契约 → SC-01 同步 + 确定接线 → SC-05 → 等 `--design-page` → `compare-redesign-app.mjs` 接上 → SC-04 门禁。
4. 收口：`npm run typecheck`、改动测试整文件、全量 `npm test` 对照基线。
5. 写 REPORT（门禁总表、自定决定：深色留档、分组以 steps 为准）；交接 R37a（服务端 `manualEdit` 重算 `stepKey`）、R37b（`PlanDraftV3` 可复用部分）、R38。

## 最小测试与检查

- 档位 L。
- 开发定向集：`tests/plan-draft-v3-screens.test.tsx`、`tests/plan-screens.test.tsx`、`tests/plan-model.test.ts`；`npm run typecheck`。
- 门禁：`node repos/orbits/scripts/visual/compare-redesign-app.mjs --suite repos/orbits/scripts/visual/views/app-R36b.json`（迭代 `--only`，收口全量）。
- 不运行：Web 门禁（R36a）；真实 AI；TestFlight。

## 失败与交接

R36a 契约 24 小时内没落地 → 画面与门禁照常收口，SC-01 / 03 的确定接线标 blocked 并在 REPORT 写明，不得临时走 `manual-edit`。REPORT 含 SC 映射、各操作链 SHA、调用方清单、命令与退出码、门禁总表、自定决定、未完成项；交接 R37a / R37b / R38。
