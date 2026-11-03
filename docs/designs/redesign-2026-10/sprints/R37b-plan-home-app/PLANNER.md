# Sprint R37b — 计划 v3：App 计划主页

**Plan revision:** 1。**模式:** existing-codebase / single-generator。**档位:** L（界面；契约只同步不改；服务端已由 R37a 提供）。
**单一目标:** App 计划主页按设计稿 v16「手机」视图的「计划主页 · 执行」页重做（头部阶段在前 / 路线带完成标志 / 勾选清单 + 准备卡 / 空位表 / 依据折叠），接 R37a 的勾选、重新生成、补事实接口；v2 计划或没有 `home` 时退回 R24 概要；三种目标 × 模拟器浅色过像素门禁。
**易读目标:** [GOAL.md](GOAL.md)。**整体设计:** [plan-v3/DESIGN.md](../plan-v3/DESIGN.md)（§5 R37b 行、§5 R37 验收要点、§6 D-1 / D-4 / D-6 / D-8）；设计稿 `docs/designs/redesign-2026-10/plan-draft-v5-proposal.html?goal=fund|sales|hire&page=home&device=m&bar=0`（源码 `renderHome(g)`，`.m` 规则；页内「字段表 · 计划主页」为准，下方抄录）。
**基线:** 开工时 `chat-agent` HEAD `5b6293e98`（含 R33–R37a，未 push）。工作区里 `repos/orbits/.next-plan-mock/`、mock 服务器改写的 `repos/orbits/{next-env.d.ts,tsconfig.json}` 不提交（`git checkout` 还原）。
**进入条件:** R37a 已完成（契约 `5b79fb7e2` / `4522e1444`、服务端 `6d92e5d2e`、fixture `e.ts` 的 `v16-home-*`、REPORT「交接 → 给 R37b」）；R36b 已完成（`PlanDraftV3`、`plan-draft-v3-model`、`compare-redesign-app.mjs --design-page`）；iOS 27 启动崩溃已由 `2095d6dd7` 修好。
**分支:** 直接在 `chat-agent` 提交，一律 `git commit -- <路径>`；提交前 `git diff --cached` 只含本 Sprint 文件（`repos/orbit-app/**`、`sprints/R37b-*`、`repos/orbits/scripts/visual/{views/app-R37b.json,attribution-redesign-R37b.json}`，以及门禁工具若需要的最小改动 `compare-redesign-app.mjs`）。

## 已查清的事实（按 `5b6293e98`；App 路径相对 `repos/orbit-app`）

1. **画面入口**：Task 页（`src/screens/task/TaskScreen.tsx`）的プラン段 → `src/screens/plan/PlanSegment.tsx:138` 渲染 `PlanOverview`（`plan / reload / goals / onAddGoal / design`），读 `api.overview(planId)`（经页面副本 `plan-overview`，`planV2DetailSchema` 校验）。`PlanOverview` 的调用方只有 `PlanSegment`（grep）。`PlanOverview.tsx`（332 行）= `GoalRow / HeroCard / DiagCard / TodayCard / 待确认 / StepsCard / TypesCard / EventsCard` + 前提 / 达成 / 删除 / 見直し / 目标切换 / 编辑弹层；共用样式 `plan-overview-ui.tsx`、`plan-overview-kit.tsx`。
2. **契约**：`src/api/contract/plan-v2.ts`、`src/api/schema/plan-v2.ts` 是 `repos/orbits/shared/**` 的同步副本（`npm run sync:contract`，`scripts/sync-contract.mjs`）；当前**没有** `PlanHomeView`（R37a 两条契约提交未同步）。同步后有 `PlanV2Detail.home?`、`PlanHomeView { state, lead, actions[], seats? }`、`PlanHomeAction`、`PlanPrepCardView`、`PlanHomeSeat`、`PlanHomeDoneRequest / RegenerateRequest`、`ContactManualFactRequest / Result` 及 zod。token `src/api/design/tokens.ts` 同步后带 `font.size.task-title 15.5`、`line-height.relaxed 1.65`（Web 已用）。
3. **接口**（R37a，回应都是 `PlanHomeView`，`seats` 只在读概要时给）：
   - 勾选 `POST /api/agent/plans/v2/[planId]/home/actions/[actionKey]/done { done, idempotencyKey }`，`actionKey` 形如 `c:<contactId>` / `e:<eventId>`，**路径里要 `encodeURIComponent`**；
   - 重新生成 `POST …/home/actions/[actionKey]/regenerate { idempotencyKey }`，额度用完 409 `context.reason = "LIMIT"`；
   - 补事实 `POST /api/contacts/[id]/facts { text ≤80, idempotencyKey }`，回 `ContactManualFactResult`。
   App 请求层 `src/screens/plan/plan-api.ts`（`usePlanApi`，`call(method, path, schema, body)`，失败经 `plan-failure.ts` 归一）。
4. **Web 模型可照搬**：`repos/orbits/app/(app)/app/orbit-2026/plan/home-v3-model.ts`（`currentStepIndex / homeHeader / seatOf / typeToneOf / prepLines / draftMarked / monthDay / withDone / mergeHome / isEventAction`），界面 `PlanHomeV3.tsx` + `PlanHomeV3.module.css`（手机 = `@media ≤767px`，与原型 `.m` 同值）。`typeToneOf` 用 Web `flowTypeTone(index-1)`；App 的类型底色轮转是 `PlanDraftV3` 的 `TYPE_TONES[index % 5]`（blue, teal, apricot, pink, lav）——两端从蓝开始、同序，App 用自己的数组。
5. **R36b 可复用**：`plan-draft-v3-model.ts`（`summarySegments`、`sourceTitle / sourceUrl / sourceStale`、`isDraftV3` 等）；`PlanDraftV3.tsx` 里 `.route`（节点 + 连线）、`.src` 角标、`.sg` pill、依据区（`.ord` / 对比条 / `.nums` / `.risk` / `.srcl` / `.toggle`）都是函数内局部。R36b REPORT 建议主页要用时抽成 `plan-draft-v3-kit.tsx`（类名 / 数值不变，R36b 门禁复跑确认）。
6. **fixture**：`repos/orbits/features/plans/v2/design-fixtures/e.ts` 的 `v16-home-all / -fund / -sales / -hire`（计划 id `plan_v16_*`）；App プラン段只显示「当前目标」，所以门禁每张用单目标 fixture（`v16-home-fund` 等），`switch.mjs --origin http://localhost:3201 --name <fixture>` 切换。
7. **像素门禁（App）**：`repos/orbits/scripts/visual/compare-redesign-app.mjs`（R36b 已加 `--design-page / --design-query / --page-top / path`）；清单范例 `views/app-R36b.json`、归因 `attribution-redesign-R36b.json`。实现侧 path = `/task?seg=plan`（open-path 开关，Metro 带 `EXPO_PUBLIC_ORBIT_REDESIGN_MOCK=open-path`）；页身起点（`page-top`）按プラン段实际壳高测；设计侧 `?goal=…&page=home&device=m&bar=0`。原型主页默认态：准备卡、空位行、「为什么这么排」全收起，dock 关闭（主页无 dock）。模拟器 iPhone 16e **iOS 26** `926B48E0-D01C-4B90-B99E-CB7338B94CD5`（日文、9:41）；iOS 27 16e `968D36AC-03F3-42F6-A104-F6B3117BDD35` 只补启动截图。构建用 `xcodebuild … -derivedDataPath ~/Library/Developer/Xcode/DerivedData/Orbit-asgbpgdgktsdtnfnhosdtkoasxvj build` + `simctl install / launch`（不用 `expo run:ios`）；Metro 已在 :8081。
8. **测试**：`node --test` + react-native-web 渲染（范例 `tests/plan-draft-v3-screens.test.tsx`）；`npm run typecheck`；`npm test` 全量（基线 = `5b6293e98` 的 `repos/orbit-app` 导出到 scratchpad，软链 node_modules，顺序跑）。

## 字段表（抄自设计稿「字段表 · 计划主页」与 R37a PLANNER，本 Sprint 的权威；App 只渲染，不改谁来填）

| 区块 | 字段 | 谁来填 | 上限 / 规则 | 缺了怎么显示 |
| --- | --- | --- | --- | --- |
| 头部 | 目标结果、结论 | AI（初稿时已定） | `outcome` ≤20 字、`conclusion` ≤26 字 | `outcome` 空则不画「目标 · …」行；结论必有 |
| 头部 | 当前阶段、人脉里 / 需要、分数 | 系统算（`homeHeader`） | 当前阶段 = 第一个未完成的阶段；人脉里 = Σ min(已在人脉里, 人数)（`seats`）；分数 = 服务端 `score.total`；进度条 = 分数 / 满分 | 阶段名空不画 |
| 路线 | 阶段 + 完成标志 | AI（初稿时已定） | 2–4 个；完成标志 ≤30 字 | 完成标志空不画该行 |
| 先做的事 | 阶段目标一句（`lead`） | AI | ≤40 字 | 不显示 |
| 先做的事 | 每件事 | AI 从候选里选（服务端对账） | 1–3 件 | `pending` → 「准备中」；0 件 → 只显示「去认识」提示 |
| 先做的事 | 标题、理由（≤1 处加粗） | AI | 标题 ≤18 字；理由 ≤50 字 | 服务端已丢不合格的件 |
| 先做的事 | 所属阶段 | 系统 | 非阶段 1 显示「阶段 N · 可以提前」 | — |
| 先做的事 | 头像 / 一行说明 | 系统 | 人：类型轮转底色；活动：粉色 | — |
| 先做的事 | 勾选 | 用户 | 乐观更新，失败回滚；持久化在服务端 | — |
| 准备卡 | 行表（他是谁 / 怎么认识 / 上次联系 / 你的备注 / 共同点；活动：时间地点 / 介绍 / 和你的计划） | 系统 / AI | 顺序按 `prepLines`；备注一行一条事实，带「你的备注 月/日」点了去联系人页 | 服务端没给的行不画 |
| 准备卡 | 切入点 + 为什么这样开口 | AI | 名 ≤12 字；理由 ≤60 字 | 服务端退回通用模板（`fallback`），照常显示 |
| 准备卡 | 开场白草稿 | AI | ≤160 字；画线 = `draft.refs` 区间；可复制 | 同上 |
| 准备卡 | 资料有更新 | 系统 `staleSince` | 点「重新生成」计入每日 15 次；409 `LIMIT` → 上限提示、卡不变 | `null` 不显示 |
| 准备卡 | 可以补充（`gaps`） | 系统 | `memo` → 补事实弹窗（≤80 字）；`interaction` → 联系人页 | 空 / 活动件不显示 |
| 要认识的人 | 空位、已在人脉里头像、分量 | 系统（`seats`） | 每类 `targetCount` 个位；活动行方块位 | `seats` 缺 → 全是空位 |
| 要认识的人 | 是什么样的人 / 见面聊什么 3 问 | AI（初稿时已定） | — | — |
| 要认识的人 | 已在人脉里的人 / 去哪里认识 | 系统 | 有人 → 人名 + 说明；没人 → `meetAt` 活动名或「近期活动里没有写明…」 | 见左 |
| 依据 | 为什么这么排 | 初稿依据区 | 「N 个来源」 | 无来源、无顺序理由、无对比 → 整块不画 |

## 上下文包

### 必读
- DESIGN §5 R37b 行与 R37 要点、§6；设计稿主页（`renderHome(g)` 与 `.hh / .todo / .td / .prep / .pr / .hook / .op / .gaps / .seats / .legend / .sr / .slots / .ex / .evlink` 的 CSS 与 `.m` 覆盖）；R37a REPORT（「交接 → 给 R37b」「自定决定」「待用户过目」）；R36b REPORT（「交接 → 给 R37b」、门禁坑）。
- 上文 1–8 的全部文件；`repos/orbit-app/AGENTS.md`；`scripts/visual/README-redesign.md` App 节；RD-16 / 28 / 29。

### 两端要一致的自定决定（照 R37a，不另改）
- 页身之下的入口行（目标切换、見直し、手动编辑、达成、前提、待确认卡）：Web 放在页身之下、样式沿用 R24；App 同样把 R24 的 `GoalRow / DiagCard / 待确认` 放在 v3 页身之下（待用户过目①）。
- 人数与分数两个口径（「人脉里 4 / 13 人 · 26 / 100 点」）：照 Web，不改计分（待用户过目②）。
- 「✦ 让 AI 调整」= 打开見直し入口（`PlanReviewEntrySheet`）。
- 头像底色：人按所属类型轮转色，活动粉色。
- 准备卡同一时间只展开一张；空位行同一时间只展开一行。
- 准备中轮询 3 s × 10；勾选 / 重新生成回应没有 `seats` 时沿用上次（`mergeHome`）。
- 1024 与深色：App 无 1024；深色按 token 实现、只截图留档（D-8）。

### 关键符号与 impact（App 仓库没有 GitNexus 索引：`node .gitnexus/run.cjs impact` 跑一次记 UNKNOWN，再 grep 列调用方写进 REPORT）
- `PlanOverview`（调用方 `PlanSegment`）：v3 且有 `home` → 新组件，否则原样。
- `PlanDraftV3`（调用方 `PlanFlowScreen`）：抽部件到 `plan-draft-v3-kit.tsx`，外观不变（R36b 门禁复跑）。
- `usePlanApi`：只加三个方法，不改已有方法。
- `src/api/contract/**`、`src/api/schema/**`、`src/api/design/**`：只经 `sync:contract` 生成，不手改。

### 易错边界（全部对应 SC）
v2 计划 / `home` 为 null 时进新画面崩溃；`actionKey` 里的 `:` 没编码；勾选失败没回滚；重新生成 409 当成普通失败；`pending` 轮询不停（离开页面后仍在拉）或超过 10 次；回应缺 `seats` 把空位表清空；`prep` 为 null 时画出展开按钮；`gaps` 在活动件上出现；补事实超过 80 字仍可提交；事实日期角标格式不是「月/日」；画线区间越界；ScrollView 里展开卡片后位置跳；日文混排基线（UiText 已修，不手调 lineHeight）；系统状态栏不要自己画；`sync:contract` 带进本 Sprint 之外的快照改动（只提交 `src/api/**`，diff 只含 R37a 两条契约的字段与 token）。

## 范围与文件

- 读取：上文必读；禁止全库再盘点。
- 修改：`src/screens/plan/{PlanOverview,PlanDraftV3,plan-api,plan-overview-ui}.tsx|ts`、`src/i18n/{ja,zh,en}/plan.ts` 与 `src/i18n/copy-kinds.ts`（新 key 三语）、`src/api/**`（仅 `sync:contract` 产物）、`src/design/theme.ts`（只在需要接新 token 时）。
- 新建：`src/screens/plan/{PlanHomeV3.tsx, plan-home-v3-model.ts, plan-draft-v3-kit.tsx}`、`tests/plan-home-v3-model.test.ts`、`tests/plan-home-v3-screens.test.tsx`、`tests/fixtures/plan-home-v3-mock.json`（从 `:3201` 抓三份概要）、`repos/orbits/scripts/visual/views/app-R37b.json`、`repos/orbits/scripts/visual/attribution-redesign-R37b.json`。
- 排除：`repos/orbits` 其余文件（契约、服务、Web 画面——R37a 已完成）；页身之下入口行的重新设计；计分口径；真实 AI；TestFlight；push。

## 验收契约（最多五项）

| SC | 可观察行为 | 必需证据 |
| --- | --- | --- |
| SC-R37b-01 | **契约同步**：`npm run sync:contract` 后 `git status` 只有 `src/api/**`，diff 只含 R37a `5b79fb7e2` / `4522e1444` 的类型与 zod，以及 `task-title` / `relaxed` token；`npm run typecheck` 通过；`usePlanApi` 加 `homeDone / homeRegenerate / addContactFact`，`actionKey` 路径编码 | sync diff 摘要、typecheck 退出码、屏测请求断言 |
| SC-R37b-02 | **画面**：v3 计划且有 `home` → `PlanHomeV3`（头部阶段在前 / 路线 + 完成标志 / 勾选清单 / 空位表 / 依据折叠，结构与数值照原型 `.m`）；字段表「缺了不显示」的一律不画；`pending` 显示「准备中」、0 件显示「去认识」；v2 或无 `home` 仍渲染 R24 概要；页身之下保留 R24 入口行 | `tests/plan-home-v3-screens.test.tsx`（三份 fixture 渲染、缺字段、v2 退回、空 / 准备中） |
| SC-R37b-03 | **交互**：勾选乐观更新、请求路径 `…/home/actions/c%3A…/done`、失败回滚；准备卡展开（同时只一张）显示行表 / 为什么 / 开场白画线 + 复制；`staleSince` 时显示「资料有更新 · 重新生成」，409 `LIMIT` 显示上限提示、卡不变；`gaps` memo → 补事实弹窗（≤80 字，`POST /api/contacts/[id]/facts`）、interaction → 联系人页；空位行展开；`pending` 每 3 s 重读、最多 10 次、离开即停 | 同上测试 + `tests/plan-home-v3-model.test.ts` |
| SC-R37b-04 | **像素门禁**：`views/app-R37b.json` 三张 `A-R37b-{fund,sales,hire}` 浅色，设计侧原型 `?goal=…&page=home&device=m&bar=0`（`--design-page`），实现侧 16e iOS 26 连 `:3201` fixture `v16-home-*` 的 `/task?seg=plan`；超阈值带全部归因（`attribution-redesign-R37b.json`）；R36b 门禁复跑不回退（抽部件）；深色三张留档；iOS 27 16e 启动截图留档 | 门禁总表、证据目录 `~/orbit-sprint-evidence/app/sprint-R37b/run-01/` |
| SC-R37b-05 | **守门**：`npm run typecheck` 0 错；三语文案测试（`no-hardcoded-copy` 等）通过；`npm test` 全量对照基线新增失败 0；`detect-changes --scope all` 不是 partial | 全量对照表、detect-changes 输出 |

## 一次 Generator 的执行顺序

1. 复核进入条件，保存基线 SHA 与本文件 SHA256；起 mock `:3201`（`orbits-plan-mock`）与设计稿 `:3320`；确认 Metro :8081 带 open-path。
2. impact / grep 登记。
3. SC-01：`sync:contract` → 只提交 `src/api/**`（`contract-sync:` 提交）。
4. 抽 `plan-draft-v3-kit.tsx`（`PlanDraftV3` 改用，屏测不变）→ `plan-home-v3-model.ts`（照搬 Web，先写测试）→ `plan-api` 三个方法 → `PlanHomeV3.tsx` → `PlanOverview` 分流 → 文案三语 → 屏测。
5. 模拟器：xcodebuild 构建安装 → 切 fixture → 门禁 `--only` 迭代 → 三张 PASS → R36b 门禁复跑 → 深色留档 → iOS 27 启动截图。
6. 收口：typecheck、定向集、全量对照基线；`detect-changes --scope all`；写 REPORT（门禁总表、自定决定、交接 R38）。

## 最小测试与检查

- 档位 L。
- 开发定向集：`tests/plan-home-v3-model.test.ts`、`tests/plan-home-v3-screens.test.tsx`、`tests/plan-draft-v3-screens.test.tsx`、`tests/plan-draft-v3-model.test.ts`、`tests/plan-screens.test.tsx`、`tests/no-hardcoded-copy*`；`npm run typecheck`。
- 门禁：`node repos/orbits/scripts/visual/compare-redesign-app.mjs --suite repos/orbits/scripts/visual/views/app-R37b.json`（迭代 `--only`，收口全量）；`app-R36b.json` 复跑一次。
- 不运行：Web 门禁（R37a 已收口）；真实 AI；TestFlight。

## 失败与交接

R37a 契约若与 REPORT 描述不一致 → 停下问主会话，不改服务端。门禁出现非数据差且无法在 App 内修到一致 → 先问用户（RD-16），不自行接受偏离。REPORT 含 SC 映射、提交 SHA、调用方清单、命令与退出码、门禁总表、自定决定、未完成项；交接 R38（真调用后 App 显示核对、真账号的候补时差、门禁清单位置）。
