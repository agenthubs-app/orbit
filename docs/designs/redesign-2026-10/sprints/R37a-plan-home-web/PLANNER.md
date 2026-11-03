# Sprint R37a — 计划 v3：准备卡服务与 Web 计划主页

**Plan revision:** 1。**模式:** existing-codebase / single-generator。**档位:** H（准备卡 AI 链 + 契约）+ L（主页界面）。
**单一目标:** v3 计划确定后由服务端生成「先做的事」（系统候选 + AI 编号）与准备卡（≤4 张，逐句对账、通用模板退回、`gaps`、`staleSince`、重新生成计入日限）；Web 计划主页按设计稿 v16「计划主页 · 执行」页重做；三种目标 × 1440 / 390 浅色过像素门禁。
**易读目标:** [GOAL.md](GOAL.md)。**整体设计:** [plan-v3/DESIGN.md](../plan-v3/DESIGN.md)（§1.2 第 4 / 6 条、§2.5、§2.6、§3.3、§3.4、§5 R37 要点、§6 D-1～D-9、§7）；设计稿 `docs/designs/redesign-2026-10/plan-draft-v5-proposal.html`（`?goal=fund|sales|hire&page=home&device=web|m&bar=0`；页内「字段表 · 计划主页」= 每个字段谁填、上限、缺失怎么显示，**以它为准**，本文下方抄录）。
**基线:** 开工时 `chat-agent` HEAD `2095d6dd7`（含 R33–R36b 与 iOS 27 修复）。工作区里 `repos/orbit-app/**` 可能有别的会话在改，不得带进本 Sprint 提交；`repos/orbits/.next-plan-mock/` 是 mock 服务器产物，不提交。
**进入条件:** R33（事实层、`plan_prep` 账本用途）、R35（v3 草稿）、R36a（`DraftV3` 组件、`--design-page`、v16 fixture）已完成；D-7～D-9 已定。
**分支:** 直接在 `chat-agent` 提交，一律 `git commit -- <路径>`；提交前 `git diff --cached` 只含本 Sprint 文件。契约改动**第一条提交**，以 `contract:` 开头并注明「App 需要同步」（App 主页归 R37b，本 Sprint 不改 App 仓库）。

## 已查清的事实（按 `2095d6dd7`；代码路径相对 `repos/orbits`）

1. **主页入口**：`app/(app)/app/plans/[planId]` 与 Task › プラン（`app/(app)/app/tasks/plan-slot.tsx:64`）都渲染 `app/(app)/app/orbit-2026/plan/PlanOverview.tsx`（860 行；`OverviewBody` 读 `GET /api/agent/plans/v2/[planId]` → `PlanV2Detail`；`ScoreCard / StepList / TypesCard / EventCard / PendingCard / RecentAwards / OverviewRail / PremiseModal`）；读模型纯函数 `features/plans/v2/overview.ts`（`candidatesFor` / `todayChance` / `pendingItems` / 活动 `scoreEvent`）；服务 `features/plans/v2/service.ts:716 detail()`；前端模型 `overview-model.ts`；样式 `overview.module.css`；文案 `copy/plan.ts` 的 `planOverviewCopy`（三语）。
2. **确定**：`flow-service.ts:784 confirmDraft` → `planService.createPlanFromDraft`（v3 字段经 `pickPlanV3Fields` 进 `plans.analysis`）→ `options.afterConfirmed`（live = `enqueuePlanSourceMatchAfterSave`，排队候补匹配）。也就是**确定那一刻候补匹配还没跑**，候选在之后才有。
3. **候选来源**：人 = `PlanV2MatchCandidate`（`overview.ts:108 candidatesFor`，去掉已驳回 / 已聊过，按推荐度）；活动 = `PlanEventFact` + `scoreEvent`（`recommendedEvents` 同一套）。
4. **事实层（R33）**：`features/contacts/facts/{store,accumulate}.ts`：`createLiveRecordContactFactStore({ store, workspaceId }).list({ actorId, contactId })` / `createConfiguredContactFactStore()`（≤500 条、`firstSeenAt` 正序）；`addManualContactFact(store, { actorId, contactId, text ≤80, at })`（同文本合并，`ContactFactError("EMPTY_TEXT" | "TEXT_TOO_LONG")`）；`accumulateContactFacts` 由 `runConfiguredMemoExtraction`（`features/contacts/memo-extraction/store.ts:77`）调用。调用处：`app/api/notes/route-support.ts:43`（`noteOnPersisted`，没传 `memoDate`）与 `features/operations/maintenance/configured-tasks.ts:248`（rescan）。
5. **账本**：`features/ai-quota/constants.ts`：`plan_prep`（user 池、`AI_QUOTA_MAX_CALLS 3`）；`isRecordOnlyUserOperation`：`trigger !== "manual"` 的 `plan_prep` 只记账不占日限；`isPlanFlowOperation`：`trigger: "manual"`（`PLAN_PREP_REGENERATE_TRIGGER`）计入 `PLAN_FLOW_DAILY_LIMIT 15`；`PLAN_PREP_INITIAL_CARDS_LIMIT 4`。AI 调用骨架 `features/plans/v2/ai/deepseek.ts run()`（reserve → ≤2 次 chat，第二次带 issues → finish），但 `trigger` 写死 `"plan"`。
6. **R36a 可复用**：`DraftV3.tsx` 的路线（`.route / .st / .node`）、来源清单、风险行、对比条、`MarkedText`；锚点 `[data-plan-draft-v3]` 等。R36a REPORT 建议抽 `DraftV3Parts.tsx`、类名不变。
7. **R36b 交接**：`manualEdit`（`flow-service.ts:1812`）写入前没按 `steps[].personTypeKeys` 重算 `personTypes[].stepKey`。
8. **像素门禁**：`scripts/visual/compare-redesign.mjs --design-page`（R36a 加），清单范例 `scripts/visual/views/web-R36a.json`；设计稿服务 `:3320`（根 `.claude/launch.json` 的 `designs`）；计划 mock 服务器 `orbits-plan-mock`（`:3201`，`ORBIT_REDESIGN_MOCK=plan-v2-summary`）；fixture 机制 `features/plans/v2/design-fixtures/{index,base,d}.ts` + `switch.mjs`。原型主页默认态：准备卡全收起、空位行全收起、「为什么这么排」收起、dock 关闭。
9. **原型主页结构**（`renderHome(g)`）：`.top`（面包屑「iOrbit · 我的计划」+「✦ 让 AI 调整」）→ `.hh`（目标结果 + 结论大标题 | 阶段 N / 总数 + 阶段名 + 进度条 + 「已认识 x / y 人 · s / t 分」）→ `route(g, true)`（带「完成标志：…」）→ 「建议先从这 N 件开始」+ 阶段名 + `.guide` 一句 + `.todo` 清单（勾选框、标题、可提前标记、理由、「准备联系 ▾ / 准备这场活动 ▾」、「切入点 **…**」、右侧头像 + 一行说明；展开 `.prep`：行表、为什么这样开口、开场白草稿 + 复制、可以补充）→ 「要认识的人」`.seats`（图例、进度、类型行：emoji / 名 + 阶段 / 空位 / 分量；展开：是什么样的人、已在人脉里 或 去哪里认识、见面聊什么 3 问；活动行）→ 「为什么这么排 · N 个来源」折叠。

## 字段表（抄自设计稿「字段表 · 计划主页」，本 Sprint 的权威）

| 区块 | 字段 | 谁来填 | 上限 / 规则 | 缺了怎么显示 |
| --- | --- | --- | --- | --- |
| 头部 | 目标结果、结论 | AI（初稿时已定） | `outcome` ≤20 字、`conclusion` ≤26 字 | 必有（v3 计划才有本画面） |
| 头部 | 当前阶段、已认识 / 需要、分数 | 系统算 | 当前阶段 = 第一个未完成的阶段；已认识 = Σ min(已认识, 人数)；分数 = 服务端 `score`（Σ 分量 × min(已认识, 需要) / 需要） | — |
| 路线 | 阶段 + 完成标志 | AI（初稿时已定） | 2–4 个；完成标志 ≤30 字 | 副标题（`why`）为空不画 |
| 先做的事 | 阶段目标一句（`lead`） | AI | ≤40 字 | 不显示 |
| 先做的事 | 每件事 | AI 从候选里选 | 1–3 件；候选 = 人脉匹配到的人 + 活动库匹配到的活动；AI 只给编号，不写名字 | 编号对不上的那件不显示；全部对不上 / 没有候选 → 只显示「去认识」提示 |
| 先做的事 | 标题（建议口吻）、理由 | AI | 标题 ≤18 字；理由 ≤50 字，可引用回答和事实，≤1 处加粗且是原文子串 | 必填（不合格 → 该件不显示） |
| 先做的事 | 所属阶段 | 系统，取自人物类型 | 非阶段 1 的显示「阶段 N · 可以提前」 | — |
| 先做的事 | 头像 / 日期 / 地点 | 系统 | 人脉库、活动库 | — |
| 先做的事 | 勾选 | 用户 | 持久化 | — |
| 准备联系 | 他是谁 / 怎么认识 | 系统 | 名片字段；添加日期 + 关联活动 | 常显 |
| 准备联系 | 上次联系 | 系统 `lastInteraction` | — | 空 → 整行不显示，`gaps` 加 `interaction`（「记一次联系」） |
| 准备联系 | 你的备注 → 用到的事实 | 系统取事实，AI 挑 | 2–4 条（`usedFacts`），带日期；点日期回到原备注 | 无事实 → 不显示，`gaps` 加 `memo`（「写一句当时聊了什么」） |
| 准备联系 | 共同点 | 系统规则 | 你的资料（来自、语言、行业）对比名片与事实；不让 AI 猜 | 算不出就不显示，不提示 |
| 准备联系 | 切入点 + 为什么这样开口 | AI | 名 ≤12 字；理由 ≤60 字 | 校验不过 → 通用模板 |
| 准备联系 | 开场白草稿 | AI | ≤160 字；画线片段每个对应一个 factId / 回答 / 名片字段，且是该原文的子串 | 对不上的句子删；整段删空 → 通用模板「说清你是谁 + 很小的请求」（`fallback: true`） |
| 准备联系 | 资料有更新 | 系统 | 卡片生成后该联系人新增 / 更新事实 → `staleSince` | `null` 不显示 |
| 准备这场活动 | 时间地点 / 活动介绍 | 系统（活动库） | — | 空则不显示该行 |
| 准备这场活动 | 和你的计划 | AI | ≤40 字 | 不显示 |
| 要认识的人 | 空位、已认识头像、分量 | 系统 | — | — |
| 要认识的人 | 去哪里认识 | 系统匹配活动 | 只在活动写明有该类参加者时给 | 「近期活动里没有写明有这类参加者，有了会提醒你」 |
| 要认识的人 | 已在人脉里的人 / 见面聊什么 | 系统 / AI（初稿时已定的 3 问） | — | 没有人时显示「去哪里认识」 |
| 依据 | 为什么这么排 | 初稿依据区 | 来源数 | 无来源不显示链接 |

## 上下文包

### 必读
- DESIGN §2.5、§2.6、§3.3、§3.4、§5 R37、§6；设计稿主页与字段表（源码 `renderHome(g)`、`G[goal].now / types / lead`、`.hh / .todo / .prep / .seats` 的 CSS）；R33 / R36a / R36b REPORT 的「给 R37a」。
- 上文 1–9 列的全部文件；`scripts/visual/README-redesign.md`；HOW-TO 第 8 节；README 规则 11 / 13；RD-16 / 28 / 29。

### 本 Sprint 自定的工程决定（REPORT「自定决定」登记，对标做法写明）
- **存放位置**：「先做的事」与准备卡存 `plans.analysis.home`（一份 JSON，和 `goalBackground` 同处），不放 `plan_items.meta.prep`。理由：一件事对应的是联系人或活动，不是人物类型条目；一处读写不用联表，mock fixture 能直接种。对标 Linear / Notion 把 AI 摘要挂在父实体上。DESIGN §2.5 的形状不变，只是位置不同。
- **生成时机**：确定时用 `after()` 生成（对标 Notion AI / GitHub Copilot 摘要的后台生成 + 占位）。读概要时若 v3 计划还没有 `home` 或上次没候选而现在有了，也用 `after()` 补生成（幂等键同一个，不会重复扣）。没生成完显示「准备中」骨架，前端轮询（3 s × 10）。
- **候选**：规则列出 ≤8 个编号（各人物类型按阶段顺序取推荐度最高的未聊过候补，再加推荐活动 ≤2），AI 只回编号 + 标题 + 理由 + `lead`。没有候选 → 不调 AI，直接给「去认识」提示。
- **调用次数**：一次「挑选」调用 + 每件事一次准备卡调用，合计 ≤4（`PLAN_PREP_INITIAL_CARDS_LIMIT`），全部 `trigger: "plan"`、只记账。重新生成一张卡 = 一次 `trigger: "manual"`，计入 15 次。
- **快照**：准备卡里用到的事实存文本 + 日期 + `memoId` 的快照，读主页不再查事实库；事实变了靠 `staleSince` 提示。
- **画线引用**：开场白的画线片段可以引用事实、回答、名片 / 资料字段（原型的画线就含「JETRO 创业交流会」「星桥科技」这类名片和资料内容）。契约用新类型 `PlanPrepRef`，不改 `PlanRef`。
- **「人脉里已有 N 位」（初稿页）**：不做。原因：草稿阶段还没跑候补匹配，现场算出来的数字和确定后主页的数字会不一致。对标 LinkedIn「你人脉里有 N 位」只在确认过的关系上显示。主页的「已在你的人脉里」用确定后的已认识人数，等同此信息。登记 DEFERRED，交 R38 / 用户过目。
- **1024 与深色**：同 D-8，只截图留档。

### 关键符号与 impact（开工时跑 `node .gitnexus/run.cjs impact "<symbol>" --direction upstream --repo .`；索引落后时按 UNKNOWN 处理并文本确认，结果写进 REPORT）
- `confirmDraft` / `confirm`（flow-service）：只在确定成功后加一次 prep 调度；不带时行为不变。
- `manualEdit`（flow-service）：写入前重算 `stepKey`（R36b 交接）。
- `detail`（`features/plans/v2/service.ts`）、`PlanV2Detail`：只加可选 `home` 字段。
- `runConfiguredMemoExtraction` / `noteOnPersisted`：补传 `memoDate`；事实变化后通知 prep 置 `staleSince`。
- `PlanOverview` / `OverviewBody`：v3 计划 → 新组件，否则旧画面（同 R36a 的分流）。
- `DraftV3`：抽出共用部件（类名不变），初稿页门禁复跑确认无变化。
- UNKNOWN 必须文本确认：`[data-plan-overview]` 等锚点的使用处；`planOverviewCopy` 新 key 三语齐全。

### 易错边界（全部对应 SC）
v2 计划被新画面读成空字段崩溃；准备卡生成阻塞确定请求；同一计划并发读概要导致重复生成（必须靠账本幂等键 + `home.state`）；初次生成超过 4 次调用；重新生成没计入日限、或初次生成计入了日限；`draft.refs` 引用不存在的 factId 却保留；画线片段不是被引原文的子串却保留；整段删空没退回模板；没记录的行渲染空壳；`gaps` 漏「记一次联系」；`staleSince` 在无关联系人加事实时也置位；重新生成后 `staleSince` 没清；勾选只在客户端；AI 回的编号越界导致崩溃；AI 输出里出现候选以外的人名；门禁用 `--design-remove` 拿正式数字（禁止）；fixture 改了画面结构；R36a 门禁因抽部件回退。

## 范围与文件

- 读取：上文必读；禁止全库再盘点。
- 修改：
  - 契约：`shared/contract/plan-v2.ts`、`shared/api-schema/plan-v2.ts`、`shared/contract/.snapshot.json`（脚本生成）。
  - 服务：`features/plans/v2/{flow-service,service,types,handlers,flow-factory,service-factory}.ts`（按需）、`features/contacts/memo-extraction/store.ts`、`app/api/notes/route-support.ts`。
  - 路由：`app/api/agent/plans/v2/[planId]/route.ts`、确定路由；新增 `app/api/agent/plans/v2/[planId]/home/**`、`app/api/contacts/[id]/facts/route.ts`。
  - 界面：`app/(app)/app/orbit-2026/plan/{PlanOverview,DraftV3}.tsx`、`copy/plan.ts`、`features/plans/v2/design-fixtures/{index,e}.ts`。
- 新建：
  - `features/plans/prep/{types,candidates,reconcile,common-ground,service,ai-mock,ai-deepseek,prompts}.ts`。
  - `app/(app)/app/orbit-2026/plan/{PlanHomeV3.tsx, PlanHomeV3.module.css, home-v3-model.ts, DraftV3Parts.tsx}`。
  - `scripts/visual/views/web-R37a.json`、`scripts/visual/attribution-redesign-R37a.json`、测试文件。
- 排除：`repos/orbit-app/**`（R37b）、`compare-redesign-app.mjs`、真实 AI、生产迁移、部署、push、引荐。

## 验收契约（最多五项）

| SC | 可观察行为 | 必需证据 |
| --- | --- | --- |
| SC-R37a-01 | **契约（第一条提交）**：`PlanV2Detail.home?: PlanHomeView \| null`（`state: pending \| ready \| failed`、`lead`、`actions[]`：`actionKey / kind / contactId \| eventId / title / reason (PlanMarkedText) / stepNumber / done / avatar / meta / prep`）；`PlanPrepCardView`（`rows` 系统行、`usedFacts[{ id, text, date, memoId }]`、`common`、`hook`、`draft`（`PlanPrepDraft`，refs 为 `PlanPrepRef`）、`gaps`、`generatedAt`、`staleSince`、`fallback`）；新接口：勾选 `POST …/v2/[planId]/home/actions/[actionKey]/done`、重新生成 `POST …/home/actions/[actionKey]/regenerate`、手动加事实 `POST /api/contacts/[id]/facts`；zod 严格；契约快照只有新增；`contract:` 开头注明「App 需要同步」 | `tests/contracts/*`、路由测试、`node scripts/contract-snapshot.mjs` 输出 |
| SC-R37a-02 | **生成与对账**：确定 v3 计划后经 `after()` 生成；初次调用 ≤4 次且 `trigger: "plan"`、不占日限；AI 编号越界的那件丢掉，全丢 → 「去认识」；注入「引用不存在 factId」「画线片段不是原文子串」→ 该句删；整段删空 → 通用模板 + `fallback: true`；切入点不合格 → 通用模板；没有上次联系 / 没有事实 → 行不出、`gaps` 正确；共同点按规则算，算不出为 null；并发读概要不重复生成；v2 计划不生成 | `tests/plans/prep-*.test.ts`（纯函数 + 服务，mock AI 与假账本） |
| SC-R37a-03 | **置旧、重新生成、勾选、手动事实、交接项**：新增备注抽出事实 / 手动加事实 → 该联系人的卡 `staleSince` 置位，其他卡不动；重新生成 = `trigger: "manual"` 计入 15 次，成功后 `staleSince` 清空，额度用完 → 409 `LIMIT`、卡不变；勾选持久化且幂等；`noteOnPersisted` 传 `memoDate`；`manualEdit` 写入前按 `steps[].personTypeKeys` 重算 `stepKey` | 同上 + `tests/plans/draft-flow.test.ts`、notes 路由测试 |
| SC-R37a-04 | **画面**：v3 计划渲染 `PlanHomeV3`（头部阶段在前、路线带完成标志、勾选清单 + 准备卡展开（行表 / 为什么这样开口 / 开场白画线 + 复制 / 资料有更新 · 重新生成 / 可以补充）、空位表展开、依据折叠）；字段表「缺了不显示」的一律不渲染；「+ 写一句当时聊了什么」打开补事实弹窗、「+ 记一次联系」去联系人页；`pending` 显示骨架；v2 计划仍渲染旧概要；R36a 门禁复跑不回退 | `tests/ui/plan-home-v3.test.tsx`（三份 fixture 渲染、缺字段隐藏、展开、勾选请求、补事实请求、v2 退回） |
| SC-R37a-05 | **像素门禁**：`views/web-R37a.json` 六张 `W-R37a-{fund,sales,hire}` × 1440（`device=web`）/ 390（`device=m`，`--design-as-mweb`）浅色；设计侧 `…/plan-draft-v5-proposal.html?goal=…&page=home&device=…&bar=0`（`--design-page`）；实现侧 `:3201` fixture `v16-home-all` 的 `/app/plans/<planId>`；超阈值带全部归因（`attribution-redesign-R37a.json`）；1024 与深色各三张只截图留档；守门：fixture 生产不收录、`tsc` / `lint` / css-tokens / scope / 三语文案测试通过 | 门禁总表、证据目录 `~/orbit-sprint-evidence/web/sprint-R37a/` |

## 一次 Generator 的执行顺序

1. 复核进入条件，保存基线 SHA 与本文件 SHA256；起 `designs`（:3320）与 `orbits-plan-mock`（:3201）。
2. impact / 文本确认登记。
3. **SC-01 契约先做先提交**（契约 + api-schema + 快照 + 契约测试）。
4. SC-02 / 03 服务端：`features/plans/prep/*`（候选、对账、共同点纯函数先写测试）→ 服务与 AI（mock / deepseek / disabled）→ 接进确定与概要读取 → 置旧、重新生成、勾选、手动事实路由 → `memoDate` 与 `stepKey` 交接项。
5. SC-04 / 05 画面：抽 `DraftV3Parts.tsx`（R36a 门禁复跑）→ fixture `e.ts` → `PlanHomeV3`（先 `--style-diff` 把 1440 fund 改到无差，再铺三目标与 390）→ 门禁 → 留档。
6. 收口：定向集 + 带 `ORBIT_EVENT_DATABASE_URL` 的全量 `npm test` 对照基线（新增失败 0）；`npx tsc --noEmit -p .`；`detect-changes --scope all`（`partial / truncated` 重跑）；写 REPORT。

## 最小测试与检查

- 档位 H：全量 `npm test` 对照基线（`export ORBIT_EVENT_DATABASE_URL`，取 `.env.local` 里的本地回环库）。
- 定向集：`tests/plans/prep-*.test.ts`、`tests/ui/plan-home-v3.test.tsx`、`tests/ui/plan-flow-screens.test.tsx`、`tests/plans/draft-flow.test.ts`、`tests/plans/plan-design-fixtures.test.ts`、`tests/api/plan-v2-routes*`、`tests/contracts/*`、`tests/capabilities/contact-facts.test.ts`。
- 门禁：`compare-redesign.mjs --suite scripts/visual/views/web-R37a.json`（迭代 `--only`，收口全量）；`web-R36a.json` 复跑一次。
- 不运行：模拟器（R37b）、真实 AI、生产。

## 失败与交接

进入条件缺项不启动。REPORT 含 SC 映射、各提交 SHA、impact、命令与退出码、门禁总表、自定决定、未完成项；交接给：
- R37b：契约 SHA、可复用模型（`home-v3-model.ts` 的纯函数）、fixture 名、门禁口径。
- R38：真调用要验的两个操作（挑选、准备卡）与提示词版本、DEFERRED 项。
