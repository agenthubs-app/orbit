# Sprint R36a — 执行总结

## 结果

对应 [GOAL.md](GOAL.md)。Web 的初版画面按设计稿 v16「初稿 · 确认」页重做；确定时带调整的契约（第一条提交）已落地并交给 R36b；三种目标 × 1440 / 390 浅色过像素门禁（超阈值带全部 `[data]`）。

- 已验证能做到：
  - **契约（SC-01，`7b4693937`）**：`POST …/drafts/[draftId]/confirm` 接受可选 `adjustments: { expectedRevision, personTypes[{ key, targetCount, allocation }], event: { targetCount, allocation } }`（`PlanDraftConfirmAdjustments` / `PlanDraftConfirmRequest`，`shared/contract/plan-v2.ts`；zod `planDraftConfirmRequestSchema` 严格）。服务端 `confirm(draftId, idempotencyKey, context, adjustments?)`：只认草稿里已有的类型（不在列表里 = 删掉，阶段的 `personTypeKeys` 跟着去掉），不改阶段；用手动编辑同一套 `validateAllocations(allocationSlotsOf(...))`（合计 100、5 分一档、人数 1–5、至少留 1 类、每类 ≥5 分），拒绝 → `INVALID_INPUT`（HTTP 400）且 `context.allocationError` = `PlanAllocationError` 码；`expectedRevision` ≠ 草稿 `updatedAt` → `STALE`（409）；通过 → 按调整后的内容建计划、草稿行写回调整后的内容、`manualEditUsed` 不变（`detail.quota.manualEditAvailable === true`）；已确定的草稿再带 adjustments = 回放同一份计划。不带时请求、响应与存储的草稿内容与改前相同（回归用例）。契约快照 diff 只有新增（66 行 +，0 −）。
  - **画面（SC-02，`f1e74e707`）**：`PlanFlowScreen` 的草稿分支按 `isPlanV3(draft.content)` 分流——v3 → 新组件 `DraftV3`（结论区：`outcome`「目標 · …」、`conclusion` 大标题、`summary` 按 `marks` 下标切片加粗、每个 `ref` 范围末尾放来源号 / 「あなたの回答」标记（点开在下方显示来源标题 / 回答内容；指向不存在的来源或回答的标记跳过）、判定 pill（可行 = ok、有条件 = `--verdict-conditional`、不建议 = coral）、「確信度 中 ⓘ」点开理由、「あなたの資料と N 個の回答、M 個の情報源から ▾」点开「用到的你的信息」（资料四行展开时才读 `/api/profile`，没填显示「未記入」+「+ 補足する」；回答行 = 前提表的回答行）；路线：`steps` 节点 + 标题 + 副标题（`steps[].why`，缺省不画）、当前 = 第 1 阶段高亮；按 `stepKey` 分组的类型表：阶段头「ステージ N · 标题」+「これができたら完了：doneCriteria」、每行 emoji 底色（系统轮流 5 色，从蓝开始）/ 名 / 说明 / 人数步进 / 分量步进 / 删；イベント行；合计行；依据区：顺序理由（带来源号）、对比条（分数条按判定三色、判定文案）、折叠的关键数字 / 风险（`unverified` 单独标「未確認」杏色，`risk` 珊瑚色）/ 来源清单（编号、标题、网页来源带取得日，取得超过 180 天标「更新されている可能性あり」、「原文を見る ↗」）；底部 dock）；字段表「缺失时不显示」的块一律不画（没有 comparison / keyNumbers / risks / sources / confidence / verdict / outcome 时对应块不渲染）；v2 草稿（`schemaVersion` 缺省）仍渲染 R23 的 `DraftCard`。v3 的开放态整屏按原型（主会话 2026-11-01 决定）：不画五段进度 / 目标气泡 / 前提卡，前提折进结论区；右栏 AI 修正 rail 与「前提を直す」照旧，AI 修正后的 `DraftTurns` 接在页身下方。
  - **调整与确定（SC-03）**：调整态在客户端（`draft-v3-model.ts`，按草稿 `revision` 重置），合计 / 合法性走 `shared/compute/plan-allocation` 的 `validateAllocations`（和服务端同一函数，不自己算）；删一类 / 人数 ± / 分量 ±5 后合计实时更新，=100 时 dock 与右栏的「この内容で確定」可点，≠100 两处都禁用、dock 与合计行显示差值；删到只剩 1 类时删按钮禁用，已删的行步进禁用、可恢复；确定发 `confirm` 带 `adjustments`（人数 / 分量 = 调整后，删掉的类型不在列表，`expectedRevision` = 草稿 revision），没动过（含调回原值）时请求体只有 `idempotencyKey`；成功后跳转与现有 confirm 相同；AI 修正 / 手動で編集入口与次数显示不变（「✦ AI に直してもらう · あと N 回」把焦点交给右栏输入框）。
  - **像素门禁（SC-04）**：`views/web-R36a.json` 六张（见下表）；设计侧 = `plan-draft-v5-proposal.html?goal=…&page=draft&device=…&bar=0` 整页模式（`--design-page`，`device=m` 加 `--design-as-mweb`），只截 `.page`（下边延到 `.app` 底，把 dock 一起截进来）；实现侧 = `:3201` fixture `v16-all` 的 `/app/plans/flow/intake_v16_*`，只截 `[data-plan-draft-v3]`；超阈值带全部 `[data]`（`attribution-redesign-R36a.json`，每带写明设计 / 实现各是哪些文字元素与同键锚点的累计偏移）。
  - **守门（SC-05）**：fixture 生产不收录（既有 `plan-design-fixtures` 测试覆盖 `d.ts`，另加「v16 三份经生成流程服务读出过草稿 schema、v3 字段 / stepKey / 来源条数 / 合计 100」用例）；原型 URL 参数不改视觉（改前文件另存后用 `--design-page` 对改前后各截一张：Web 默认态 raw = 0、手机态 raw = 0）；`npx tsc --noEmit -p .`、`npm run lint`（exit 0）、`orbit-2026-css-tokens` / `orbit-2026-scope` / `no-hardcoded-copy` / `t-requires-ja` 类型守三语、`copy-qa-check` 通过。
- 仍未实现或未验证：
  - ~~「重新起草」（dock 左键）没有对应接口：按原型位置画、置灰~~ → 用户 2026-11-02 拍板接接口，已实现（`8d6745849` 契约 + `c84846177` 实现），见文末「重新起草」一节。
  - 「人脉里已有 N 位」（类型行说明末尾的绿字）：草稿视图没有匹配数（R24 的候补匹配只对计划条目），不画；要显示需要 `PlanDraftView` 加字段，交 R37a / 主会话定。
  - 阶段副标题（路线节点下的小字）：契约 `PlanV2Step` 没有副标题字段，用 `why` 承载；R35 的提示词 v9 不产出 `why`（mock 与真实都是 null），真实数据的路线只有标题——要副标题需改提示词与校验（交 R38 / 主会话）。
  - 1024 与深色设计稿没有：各三张只截图留档（见「自定决定」），不进门禁——用户 2026-11-02 接受。
  - 真实 AI、生产、部署：未动（PLANNER 排除项）。

## 运行记录

- 结果：completed（本地代码收口；无部署 / 生产迁移 / push）
- Generator：Claude Fable 5.1（side session r36a）／2026-11-01；Planner revision 1，PLANNER.md SHA256 前 16 位 `79c9c235afbbc992`
- 提交（按顺序）：`7b4693937` 契约 · `1f6b351f5` 原型 URL 参数 · `ac2a683df` 工具整页模式 · `ae3f546ae` fixture · `f1e74e707` 画面 + token + 清单 · `8af79e4f4` 段落外边距修复 + 归因 + styles.json · `b6410a666` 「作り直す」登记审计已知清单 · `1a485a1c2` 置灰按钮光标 · REPORT 提交见 git log
- 分支：直接在 `chat-agent` 按路径提交（基线 `2a5d36f61`）；与 R36b 并行，R36b 的提交（`60671d8c6`…`dc59cf615`）夹在本 Sprint 提交之间，文件无重叠（`compare-redesign-app.mjs`、`repos/orbit-app/**`、`sprints/R36b-*` 未动）；未 push
- 档位 L + H（契约链）；全量对照见下
- 付费 AI 调用：0 次
- 服务：设计稿 `designs`（:3320）；计划 mock 服务器新增 launch 配置 `orbits-plan-mock`（:3201，`ORBIT_NEXT_DIST_DIR=.next-plan-mock ORBIT_REDESIGN_MOCK=plan-v2-summary`）；fixture 切换 `node features/plans/v2/design-fixtures/switch.mjs --origin http://localhost:3201 --storage <qa-storage> --name v16-all`
- impact（开工时索引落后：`DraftCard` / `PlanFlowScreen` / `PlanManualEditScreen` / `validateAllocations` / `confirmDraft` 都 not found、`confirm` ambiguous（15 个同名）→ 重建索引到工作树（191,782 节点）后以 detect-changes 代替，并做文本确认）：
  - `confirm`（flow-service）文本确认：调用方只有 `flow-handlers.ts:155`（路由）与测试；`confirmDraft` 调用方 = `manualEdit`（:1780）与 `confirm`（:2115），只加可选参数，不带时路径不变。
  - `DraftCard` 文本确认：引用 = `PlanFlowScreen.tsx`（替换分支）、`FlowRail.tsx`（`StepsMini` / `draftName`）、`PlanManualEditScreen.tsx`（`typeTileClass`）——后两者未改；`[data-plan-flow]` 锚点使用处 = `PlanFlowScreen.tsx:427` 与 `views/web-plan-B.json`（未改）；`[data-plan-draft]` 锚点用于 `tests/ui/plan-flow-screens.test.tsx` 的端到端用例，v3 根元素也带 `data-plan-draft="v3"` 保持可用。
  - `PlanDraftManualEditRequest` / `validateAllocations` / `allocationSlotsOf`：只复用，未改。
- `detect-changes`：
  - `--scope staged`（SC-01 提交前）：7 文件 46 符号、risk medium、5 processes（`PlanFlowError` 的 details 类型加字段波及 MakeDraft / AddMembers / ChooseQuestions / RecomputeLadder / StartReview → PlanFlowError 流），非 partial / truncated（`detect-changes-staged-sc01.txt`）。
  - `--scope staged`（fixture 提交前）：3 文件 2 符号、risk low、0 processes（`detect-changes-staged-fixture.txt`）。
  - `--scope staged`（画面提交前）：18 文件 21 符号、**risk high、8 processes**（都是 `PlanFlowScreen → …` 的既有流：Resolve / Replace / Json / AppError / IsFeatureMode / CreateBatch 等——`PlanFlowScreen` 是枢纽，改的是草稿分支与 confirm 请求体），非 partial（`detect-changes-staged-ui.txt`）；由 `plan-flow-screens` 整文件（26 用例，含端到端 mock 流程）守住。
  - `--scope all`（工作树干净后）：No changes；`--scope compare --base-ref 2a5d36f61`：47 文件 131 符号（含 R36b 的 App 提交）、risk critical、26 processes；输出都没有 partial / truncated。证据：`~/orbit-sprint-evidence/web/sprint-R36a/run-01/detect-changes-*.txt`。
- `--scope staged`（归因 / 审计登记提交前）：前者无符号重叠（CSS / JSON），后者 3 文件 1 符号、risk low。
- `npx tsc --noEmit -p .`：每个提交前各跑一次，0 错。
- 全量首轮（HEAD `8af79e4f4`）新增 1 个失败：`full-product-functional-audit` 的「visible controls do not rely on missing static behavior evidence」——dock 的置灰「作り直す」是没有行为的可见控件；照 HostSetup 预览按钮的先例登记进 `KNOWN_MISSING_STATIC_BEHAVIOR`（`b6410a666`），终轮见下。`node scripts/contract-snapshot.mjs --write`：只有新增。

### 全量测试对照（RULES 5.2）

基线 = `2a5d36f61` 的 `repos/orbits` 导出到 scratchpad 跑；HEAD = `1a485a1c2`（工作树与 `b6410a666` 之后只差 CSS 一行；跑测试时树已含该行）。两边同样带 `ORBIT_EVENT_DATABASE_URL`（本机回环测试库），不 source `.env`；后台顺序跑。

| | 总数 | 通过 | 失败 | 跳过 |
| --- | --- | --- | --- | --- |
| 基线 | 8107 | 7469 | 67 | 571 |
| HEAD | 8122 | 7525 | 26 | 571 |

失败清单去掉用时后 `comm -13` 对比：**新增 0 条**。HEAD 的 26 个失败都在基线清单里（`plan-review-screens` 的 30 s 超时用例、`/app/agent` 页面、`[postgres]` 问答等既有项）；基线多出的 41 个是基线副本不在 `repos/orbits` 原路径下跑出的路径依赖用例（与 R33 / R35 REPORT 同一现象）。日志：`~/orbit-sprint-evidence/web/sprint-R36a/run-01/npm-test-{baseline,head}.txt`、`{baseline,head,new}-failures.txt`（首轮 `8af79e4f4` 的日志另存 `npm-test-head-8af79e4f4.txt`：27 失败、新增 1 = 审计用例，已修）。

### 门禁总表（SC-04）

命令：`node scripts/visual/compare-redesign.mjs --suite scripts/visual/views/web-R36a.json --crop --out ~/orbit-sprint-evidence/web/sprint-R36a/run-01/gate-06`（设计侧整页模式 + clip；归因 `scripts/visual/attribution-redesign-R36a.json`）。

| 画面 | 宽 | 主题 | raw | 带数 | 超阈值带 | 未归因 | 结果 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| W-R36a-fund | 1440 | 浅 | 0.2109 | 20 | 20 | 0 | PASS（设计 1942 / 实现 2147 px 高） |
| W-R36a-fund | 390 | 浅 | 0.2898 | 24 | 24 | 0 | PASS（设计 2400 / 实现 2742 px 高） |
| W-R36a-sales | 1440 | 浅 | 0.1605 | 19 | 19 | 0 | PASS（设计 1842 / 实现 1931 px 高） |
| W-R36a-sales | 390 | 浅 | 0.2717 | 22 | 22 | 0 | PASS（设计 2170 / 实现 2431 px 高） |
| W-R36a-hire | 1440 | 浅 | 0.22 | 18 | 18 | 0 | PASS（设计 1743 / 实现 1951 px 高） |
| W-R36a-hire | 390 | 浅 | 0.3208 | 21 | 21 | 0 | PASS（设计 2066 / 实现 2447 px 高） |

- raw 高是因为实现（日文 fixture）比设计（中文示例）长 90–380 px：日文折行多，下方内容累计下移；`--style-diff` 的控件盒对照（`gate-05/*/styles.json`）显示 h1 / 步进 / 类型行 / 合计行 / 对比条的盒子尺寸与两侧同键锚点（emoji、数字、± 按钮、×）的 y 偏移在每段内恒定、只在文字段落处递增（例 fund 1440：理由段 +26 = 1 行，路线 → 类型表 +23 = guide 1 行，六个类型行与イベント行全部 +49，依据区 +91 / +43 / +22 = 顺序理由与对比条标签折行）。
- 首轮（gate-01～04）发现并修掉一个真实差：`.page p / ol { margin: 0 }` 的重置盖掉了原型的段落 / 列表外边距（理由段 `margin-top: 14px` 等）→ 理由段比设计高 14 px；修后锚点偏移归零（`8af79e4f4`）。其余非位置的 style-diff 项只剩字体 glyph 盒高（原型 PingFang SC vs 产品 token 字体，见自定决定）、`border-radius: 50%` vs `999px`（等价）、配对键碰撞（步进数字与来源号同为「3」）。
- 证据目录：`~/orbit-sprint-evidence/web/sprint-R36a/run-01/gate-06/<画面键>/`（`design.png` / `app.png` / `diff.png` / `triptych.png` / `cells.json` / `bands/`）；对照页：各画面 `triptych.png`（工具无单独 compare.html，三联图即对照）。
- 留档（不进门禁）：深色 1440 × 3 `archive-dark/`，1024 浅色 × 3 `archive-1024/`（同一清单、`--theme dark` / `--width 1024` 覆盖；设计侧仍是浅色 / 1440 原型，只看 `app.png`）。

## 验收结果

| SC | pass / fail / blocked | 证据（测试文件或场景） | commit |
| --- | --- | --- | --- |
| SC-R36a-01 | pass | `tests/plans/draft-flow.test.ts` 新增 2 用例（合计 ≠100 / 非 5 倍数 / 人数超限 → 对应 `allocationError`；删到 0 类、未知类型 → INVALID_INPUT；过期 → STALE；拒绝不建计划；通过 → 调整后的人数 / 分量、删掉的类型离开阶段、`manualEditAvailable === true`、草稿行 `manualEditUsed === false`；已确定后再带 = 回放；不带时存储内容逐字节相同、响应恰好四个字段）；`tests/api/plan-flow-routes.test.ts` 新增（未知字段 400、合计 400 + `allocationError: total_not_100`、过期 409 STALE、通过 201）；`tests/contracts/*`、`plan-v2-routes` 通过；`contract-snapshot --write` 只增 | `7b4693937` |
| SC-R36a-02 | pass | `tests/ui/plan-flow-screens.test.tsx` 新增「R36a v3 draft」：结论区 / 加粗切片 / 引用标记（缺来源的跳过）/ 判定 / 信心 / 路线 3 节点当前 = 1 / 3 个阶段头 + 4 类 + イベント / 对比条三档 / 折叠态不画数字风险来源、展开后 risk + unverified、180 天标记、来源链接 / 「用到的你的信息」/ 缺字段全部不画 / v2 退回 DraftCard / v3 无五段进度与前提卡 | `f1e74e707` |
| SC-R36a-03 | pass | 同文件「R36a v3 adjust」：+5 → 105 两处确定禁用 + 差值文案 + 「変更あり」；边界禁用（人数 1 / 分量 50）；删一类 → 90、步进禁用、补分 → 100；只剩 1 类删按钮禁用；确定请求体 `adjustments` 逐字段断言；没动过 / 调回原值 → 请求体只有 `idempotencyKey` | `f1e74e707` |
| SC-R36a-04 | pass | 门禁总表；`attribution-redesign-R36a.json` 126 条带理由全部 `[data]`；修掉的实现差（段落外边距）见总表下 | `8af79e4f4` |
| SC-R36a-05 | pass | `tests/plans/plan-design-fixtures.test.ts`（生产不收录 + v16 三份过 schema）；原型改前后 `--design-page` diff：`proto-regression/web-default` raw 0、`proto-regression/m-default` raw 0；tsc / lint / css-tokens / scope / no-hardcoded-copy / copy-qa 通过（`targeted-tests.log` exit 0、`lint.log` exit 0） | `1f6b351f5`、`ae3f546ae` |

定向集（`plan-flow-screens`、`draft-flow`、`plan-design-fixtures`、`plan-flow-routes`、`plan-v2-routes`、`contract-append-only`、`redesign-schema-parity`、`orbit-2026-css-tokens`、`no-hardcoded-copy`、`orbit-2026-scope`、`design-tokens-generated`、`orbit-contrast-tokens`、`copy-qa-check`）：全部通过（`~/orbit-sprint-evidence/web/sprint-R36a/run-01/targeted-tests.log`）。

## 自定决定（和设计稿无关的工程决定 / 设计稿没有的部分）

- **壳与比对范围**：原型的 76px 示意轨与 1180 宽卡片是原型舞台不是设计；实现 = 真实壳（左栏 + 页头 + 右栏 AI 修正 rail）+ 主列 `DraftV3`（原型 `.page`：760 宽、22/28 内边距，居中；手机 390 宽、18 内边距，用负外边距抵掉壳的 18 内边距）。门禁比的是原型 `.page`（+ dock）↔ `[data-plan-draft-v3]` 整个页身，壳另有 R07 / R23 的门禁。原型顶部的面包屑行「iOrbit · 制定计划 · 初稿」+「✦ 让 AI 改」在页身里照画（主会话：此行 = 壳；页头副标题也写着「プランを作る · 初版」，两处重复，待主会话决定是否去掉页身这一行——去掉会让门禁首带变 [data] 以外的差）。**用户 2026-11-02 拍板：面包屑行照原型保留。**
- **dock**：原型 `.dock` 是 `.app` 底部的绝对定位（不是贴视口），`.main` 留 110px 底边距；实现用 `.dockWrap`（min-height 110、底对齐）复刻在页身末尾。
- **1024**：按 1440 布局流式（主列 ≥ 760 时页身居中，不足时随壳收窄）；**深色**：全部用既有 token（`--bg / --surface / --ink-* / --mac-*` + 本 Sprint 新 token 的 dark 值），半透明白底用 `color-mix(in srgb, var(--surface) 80% | 85%, transparent)`。两者各三张留档（见门禁总表）——用户 2026-11-02 接受只截图留档。
- **字体**：原型 `--font` 是 `"PingFang SC","Hiragino Sans",…`（中文示例），实现用产品 token `--font`（日文优先栈）与 `--font-num`；门禁文字本就不同（[data]），style-diff 的 glyph 盒高差来自这里，不作为偏离。
- **token 新增**（R01 流程，`shared/design/tokens.json` → `npm run design:tokens`）：color `chart-preferred #7FB8A2` / `chart-possible #D9B07A` / `chart-not #E7A493` / `verdict-conditional #C08A45`（dark 值自定：#8FC6B0 / #E0BB86 / #EDAA98 / #D09A56）；shadow `card-soft`（0 1px 2px rgba(30,20,40,.04)）/ `btn-soft`（.06）/ `ring-node`（0 0 0 6px rgba(110,98,138,.14)）；font.weight `semibold 600` / `demi 650`；line-height `compact 1.3` / `figure 1.15`。`tests/ui/design-tokens-generated.test.ts` 的清单钉值相应更新。
- **底色轮转**：字段表「底色：系统轮流 5 色」；v16 原型 fund 从蓝开始（蓝 → 青 → 杏 → 粉 → 薰衣草 = R23 轮转表往前一格），实现按此（`flowTypeTone(index - 1)`）；sales / hire 原型给的底色与这条规则不一致（原型数据手写），按规则不按手写。
- **「重新起草」**：用户 2026-11-02 拍板接接口，见文末「重新起草」一节（口径主会话定，对标 ChatGPT「重新生成」计入用量）。
- **来源取得日与「更新の可能性」**：原型来源清单只有标题 + 链接；PLANNER SC-02 要求显示抓取日与 180 天标记，放在标题后的括号里（同一行文字，属数据文字）。
- **阶段副标题 = `steps[].why`**：见「仍未实现」。
- **`compare-redesign.mjs` 整页模式**（`ac2a683df` + `8af79e4f4`）：`--design-page`（body 当画框、视口 = --width；`--design-as-mweb` 去原型手机外框）、`--design-clip` / `--design-clip-bottom` / `--app-clip`（元素裁剪）、`--style-diff` 以 clip 元素为根取样并另存 `styles.json`（两侧原始取样，逐带归因用）；缓存键 `v: 2 + page / clip`；设计文件带 `?query` 时按文件名算哈希。`compare-redesign-app.mjs` 未碰（R36b 自己加了同类模式）。
- 新建文件（RULES 0 登记）：`app/(app)/app/orbit-2026/plan/{DraftV3.tsx, DraftV3.module.css, draft-v3-model.ts}`、`features/plans/v2/design-fixtures/d.ts`、`scripts/visual/views/web-R36a.json`、`scripts/visual/attribution-redesign-R36a.json`；`.claude/launch.json` 加 `orbits-plan-mock`。
- 额外改动的消费者：`tests/ui/plan-flow-screens.test.tsx` 端到端用例改为点右栏（`.first()`）的「この内容で確定」（v3 页身也有一个同名按钮）；`FlowRail.DraftRail` 加可选 `confirmOff`（RD-28 只加参数）。

## 假设与额外阅读

- **「用到的你的信息」的资料行**：`PlanDraftView` / `PlanIntakeView` 没有公司 / 来自 / 语言；展开时读 `/api/profile`（`organization` / `homeMarket` / `spokenLanguages` 或 `preferredLanguage`），读不到全部「未記入」；门禁截的是折叠态，不发这次请求。
- **引用标记位置**：`summary.refs[].end` 处放标记（真实 AI 的 ref 范围 = 整句 → 标记在句末；fixture 把范围截到被引用的短语后面，和原型一样在句中）。
- **mock 流程现在产出 v3**：端到端 mock 用例走的就是新画面（右栏确定）。
- 额外阅读：`features/plans/v2/ai/schemas-v3.ts`（`summaryToMarkedText` 的下标规则）、`features/plans/v2/validate-content.ts`（`allocationSlotsOf`）、`shared/design/tokens.json` 与 `scripts/design-tokens/generate.mjs`、`app/(app)/app/orbit-2026/shell/shell.module.css`（84 / 360 栅格、767 断点）、`tests/ui/support/orbit-2026-harness.ts`。

## review 处理（仅 H 档）

代码 review 由主会话安排（RULES 1.1）；本 REPORT 写于 review 之前。

## 交接

- 给 R36b（App 初稿页）：
  - 契约 `7b4693937`（`adjustments` 形状见「结果」；App 已 `sync:contract`，见 R36b 的 `df2065d9b`）。服务端行为：拒绝 → 400 `INVALID_INPUT` + `context.allocationError`；过期 → 409 `STALE`；已确定草稿带 adjustments = 回放；每类 <5 分也拒绝（`allocationError: not_multiple_of_step`）。
  - `--design-page` 口径（Web 工具 `ac2a683df`、`8af79e4f4`）：`device=m` 时去掉 `.stage` 内边距与 `.app` 的边框 / 圆角 / 阴影、`.app` = `--width`（390）宽，画框 = body，`--design-clip ".page" --design-clip-bottom ".app"`；不缩放。
  - fixture：`v16-fund / v16-sales / v16-hire`（单份）与 `v16-all`（三份一起），`intake_v16_* / draft_v16_*`（`features/plans/v2/design-fixtures/d.ts`）。
  - token 名：见「自定决定」；两端对齐。
  - 两端一致项：底色轮转从蓝开始；「人脉里已有 N 位」不画；阶段副标题 = `why`；「重新起草」接 `POST …/redraft`（契约 `8d6745849`，App 需 `sync:contract`；行为见文末「重新起草」）。
- 给 R37a（准备卡与 Web 主页）：
  - 可复用：`DraftV3.tsx` 里的路线（`.route / .st / .node`，`--route-edge` 按阶段数算）、来源清单（`.srcl`，含取得日 / 180 天标记）、风险行（`.risk / .tRisk / .tUnv`）、对比条（`.lr / .bar / .barOk|Mid|No`）、`MarkedText`（按下标切片的加粗 + 引用标记）；主页「为什么这么排」折叠块可直接搬 `evidence` 一段。建议抽成 `DraftV3Parts.tsx` 时保持类名（门禁 style-diff 配对靠文字键，不靠类名）。
  - 锚点：`[data-plan-draft-v3]`（页身根，门禁 app-clip）、`[data-plan-v3-route]`、`[data-plan-v3-types]`、`[data-plan-v3-evidence]`、`[data-plan-v3-dock]`。
  - 「人脉里已有 N 位」若主页 / 初稿页都要显示，需要服务端给草稿视图加匹配数。
- 给 R38（收口）：
  - 门禁清单 `scripts/visual/views/web-R36a.json`（整页模式参数都在 defaults 里），归因 `scripts/visual/attribution-redesign-R36a.json`，fixture 先切 `v16-all`；真实 DeepSeek 起草后请用真实草稿再截一轮（`steps[].why` 为空时路线无副标题、`risks` 可能带「今回はインターネットで確認できませんでした」）。
  - 提示词 v9 不产出阶段副标题；要补的话改 `prompts.ts` + `schemas-v3.ts`。
- 用户 2026-11-02 已拍板：① 「重新起草」接接口（已做，见下）；② 1024 与深色只截图留档，接受；③ 页身面包屑行照原型保留。

## 重新起草（2026-11-02 追加，用户拍板）

口径（主会话定，对标 ChatGPT「重新生成」计入用量）：整篇再起草一遍，占一次 AI 修正，不重新联网搜索。

- **契约（`8d6745849`，App 需 `sync:contract`）**：`POST /api/agent/plans/drafts/[draftId]/redraft`，请求 `PlanDraftRedraftRequest { idempotencyKey }`（zod 严格，多余字段 400），响应 `PlanDraftRedraftResponse` = `PlanDraftView`；回执 kind `draft_redraft`；快照只有新增（115 行 +）。
- **服务（`c84846177`，`flow-service.redraft` / `flow-handlers.redraft` / 新路由文件）**：
  - 只对 intake 来的 open 初稿开放：`kind: "initial"`、`content.schemaVersion === 3`、未 `manualEditUsed`，否则 `DRAFT_CLOSED`（409）；次数与「✦ AI に直してもらう」共用 `PLAN_AI_FIX_LIMIT`（`aiFixUsed + 1`），用完 `FIX_LIMIT`（409，AI 不被调用）。
  - 不重新联网搜索：复用草稿已有的 `content.sources`（S1… 编号不变）、同一 `premise` / `answerKeys` 再调 `firstDraftV3`；`landscape` 输入 = 当前已发布的业界现状库条目（来源 id / 版本以草稿存的为准）；原稿没有网页来源 = 当时未能联网核实 → 这次照旧追加那条「未能联网核实」风险（恰好一条，不重复）。ledgerKey `redraft:<draftId>#<n>`（失败后重试 `#<n>.<attempt>`）。
  - 成功：`content` 与 `originContent` 都换成新稿（「AI 初稿に戻す」回到这一版），`aiFixUsed = n`，`turns`（修正履历）保留；失败 / busy 不扣次数、不换稿（失败写 `fix` 步骤记录，busy 不写回执，同 key 再来一次能成功）；并发用 `STALE`（`aiFixUsed` / `status` / `manualEditUsed` / `updatedAt` 任一变了）；同 key 回放不调 AI。
- **Web（`c84846177`）**：dock「作り直す」解除置灰；次数用完或 `manualEditAvailable === false` 时禁用、进行中 `aria-busy`；页上有未保存调整（`adjustmentsOf` 非空）→ 先弹确认框（样式同「破棄して直す」：「いまの調整を捨てて、作り直しますか？」+ 用掉 1 次 / 不重新搜索两行，取消不发请求、调整保留），没动过直接发；进行中整段换成既有「生成中」骨架（`data-plan-drafting`，与初版起草共用同一块 JSX）；回来换成新稿，调整按新 `revision` 作废；失败 / 上限 / busy 沿用 fix 的失败卡、上限卡、「処理中」行。静态行为审计 `KNOWN_MISSING_STATIC_BEHAVIOR` 里的占位项已撤。
- **测试**：`draft-flow` +3（换稿 / 来源与 answerKeys 原样 / 不再搜索 / originContent 换新 / 次数共用 / 失败与 busy 不扣 / 回放 / v2・手动编辑・已确定 拒绝）、`plan-flow-routes` +1（严格 body、200、回放、FIX_LIMIT 409、DRAFT_CLOSED 409）、`plan-flow-screens` +1（可用、直接 POST、骨架、换稿、确认框取消 / 确认、两种禁用态）；tsc、`npm run lint`、`copy-qa`（新增中文条目按「中文与数字不加空格」改过）、`css-tokens` / `no-hardcoded-copy` / 语言 / token / 契约 append-only / schema parity / 静态行为审计 通过（审计里 `product-surface-manifest` 的 1 个失败是基线既有）。
- **影响面**：`impact createPlanFlowService` LOW、`PlanFlowScreen`(Web) LOW、`DraftV3` 组件仅 `PlanFlowScreen` 引用（文本确认）；`detect-changes --scope all`（提交前）：12 文件 56 符号、11 processes、risk high（`flow-service` / `PlanFlowScreen` 行号整体下移带出的既有符号），非 partial。
- **门禁 web-R36a 重跑**（`~/orbit-sprint-evidence/web/sprint-R36a/run-02/gate-07`，六张 PASS、unattributed 0，raw 与 gate-06 逐带相同）：按钮从 `disabled`（opacity .5）变可用后，实现侧 dock 像素确实变了（fund 1440 改动落在第 2078–2127 行），但 dock 整段位于设计稿页尾之下（日文折行累计下移，归因「设计这一段已到页尾留白」），带内比对值不变；人工对照 dock 行取样：实现按钮底 `#ffffff`、主按钮 `#1e1a24`，与原型相同——按钮颜色无需归因、无需修。
- **全量对照**：HEAD `c84846177` `npm test`（`~/orbit-sprint-evidence/web/sprint-R36a/run-02/npm-test-head-db.txt`）：8127 / 7530 / 26 / 跳过 571；对 run-01 的 HEAD（8122 / 7525 / 26）与基线 `2a5d36f61`（8107 / 7469 / 67）新增失败 0（`new-failures-db.txt`、`new-vs-baseline-db.txt` 都是空）。注：第一遍（`npm-test-head.txt`）shell 没有 `ORBIT_EVENT_DATABASE_URL`，462 项连库测试被跳过（跳过 1051），不算数；带上 `.env.local` 里的本地回环库 URL 重跑才与上轮同口径。
