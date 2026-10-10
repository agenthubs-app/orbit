# Sprint R24 — 计划 v2.2：概要、人物类型与记录加分

**Plan revision:** 1。**模式:** existing-codebase / single-generator（执行人：小雨（甲））。**档位:** H。
**单一目标:** プラン概要与人物タイプ詳細（两端，含 Web 1024 / 390 版式）、计分界面（记录 / 自报 / 超额 / 撤销 / 跳过 / 撤回）、Step 完成确认（规则）、候补确认、面談提案与依頼文草稿、イベント枠与 `shared/compute/event-score.ts`（同时把契约 8 的 5 项改成设计稿口径）、C11 面谈メモ判定与 C12 候补推荐提示词变更、给 R11 / R20 的接口；App `contacts/matches` 改为跳转。
**易读目标:** [GOAL.md](GOAL.md)。**整体设计:** [plan-v2.2/DESIGN.md](../plan-v2.2/DESIGN.md)（§2.5–2.7、§4、§5 C11 C12、§7、§8）。
**基线:** R22 收口后的 `redesign` HEAD（R23 是否收口不影响本 Sprint：验收用 R22 的种子计划）。
**进入条件:** R22 done。C11 / C12 的真实调用需要用户授权（DESIGN §10 第 1 项），没有授权就用 mock 收口。
**分支:** 同 R22。默认 R23 → R24 先后做；要并行时先约定共用文件的分段（Web `plan-slot.tsx` 与 App `PlanSlot`：R23 只写「没有计划」分支和「已确定」最小卡，本 Sprint 只替换「有 v2 计划」分支；`orbit-2026/plan/`、`src/screens/plan/`、`orbit-2026/copy/plan.ts`、`src/i18n/*/plan.ts` 按子目录 / 键前缀分开），合回时 rebase 解决冲突。

## 已查清的事实（按 `fe896414`）

1. **候补管线**：`plan_match_jobs` / `plan_match_candidates`（rule / ai、strong / candidate、pending / accepted / dismissed，`(actor, need_item, contact)` 唯一）；`GET /api/agent/plans/candidates`、`POST …/candidates/run`；`decideMatchCandidate`、`linkNeedContact`、`recordInteraction`（`contact_links` linked → established）在 `PlanService` 上。v2 人物类型就是 `network_need`，管线原样可用。
2. **活动**：`markEventAttended` / `markEventRegistration`（`PlanService`）；库内活动推荐 `createEventValueRecommendationService`（LOW 3），现有评分 `live-event-value-service.ts` 只针对库内活动且权重不同；**没有** `shared/compute/event-score.ts`。
3. **memo 提取**：`features/contacts/memo-extraction/provider.ts`（`createDeepseekMemoExtractionProvider` **CRITICAL** 63，用途 `memo_extraction`、后台池；输出 offering / seeking / topics / eventTypes）。
4. **草稿与提案**：现有 email-draft（依頼文、非 Orbit 用户的面谈邀请草稿）；面谈提议沿用现有 appointments 接口（「需 3–5 个候选时段」，附录 D-e）。
5. **App 旧屏**：`app/contacts/matches.tsx` → `ContactNeedsMatchesScreen`（读 `/api/contacts/needs-matches`，仅 App 使用）；入口 `ContactNeedsHomeEntry` 在人脈页 `src/screens/contacts/ContactsScreen.tsx`（R11 的文件，R11 重写时消失）。
6. **契约 8**（`shared/contract/event-assessment.ts`，R08，负责人甲）：`EventAssessmentCriterion = 'goalFit' | 'people' | 'timing' | 'cost' | 'followUp'`，每项 0–20；和设计稿规范板（45/15/20/10/10）不一致。
7. **v2 计分**：只走 R22 的计分命令；v1 的 `recordInteraction` / `PATCH items` 对 v2 计划是 409（DESIGN §2.7、§3.6）；活动参加走 R22 的 `recordEventAttendanceForPlans`。

## 上下文包

### 必读
- DESIGN §2.5–2.7、§4（全部）、§5.1、§5.2 C11 C12、§7、§8（R10、R11、R20、R26 行）、§9 #2 #5 #13 #15。
- 设计稿：`b4-plan-iorbit.html` A1（記録と加点 ①–④）、A2（三种去向、面談提案、Web 版）；`b10-plan-example.html` ⑦ プラン概要（少量 / 大量、App / Web）、⑧ 人物タイプ詳細（A / D / B、内訳展开、依頼文草稿）、规范板「イベントスコアの基準」；`app.html` / `web.html` 的 Task › プラン 概要与人物タイプ詳細。
- 代码：R22 的 `features/plans/v2/**`、`shared/compute/plan-score.ts`；`features/plans/{matching-service,matching-repository,ai-matcher}.ts`；`features/contacts/memo-extraction/provider.ts`；`features/recommendations/**`；email-draft 与 appointments 的服务入口。

### 关键符号与 impact（开工时重跑）
- `createDeepseekMemoExtractionProvider` **CRITICAL** 63：只在「`usedForPlan` 且 @ 的人是某类型的候补或已关联」时给输入加 3 问、输出加可选 `questionCoverage`；提示词版本 +1；现有输出形状、其他调用路径不变（回归测试）。
- `PlanService.recordInteraction` / `markEventAttended`（在 **CRITICAL** 的 `PlanService` 上）：**不改**。v2 的面谈计分由本 Sprint 的界面直接调 R22 计分命令；活动参加由签到 / 「参加した」的现有流程额外调用 R22 的 `recordEventAttendanceForPlans`（调用点改前跑 impact，REPORT 写明）。
- `EventAssessmentCriterion`（契约 8）：破坏性改动，`BREAKING.md` 登记；改前文本确认使用方（R08 的 mock、fixture、schema 与测试）。
- `createEventValueRecommendationService` LOW：只读调用，不改权重。
- `ai-matcher.ts` 的提示词：版本 +1（C12），输出只加可选 `opener`。
- App `ContactNeedsMatchesScreen` UNKNOWN（文本确认：只由 `app/contacts/matches.tsx` 挂载）。

### 易错边界（全部写进 SC）
概要的分数和首页契约不一致；两端各自算分（必须都用 `summarizePlanScore`）；动效在「减少动效」下仍播放；撤销 Toast 删了面谈记录；同一人在候补里点两次「すでに話した」加两次分；匿名自报超过目标人数还加分；跳过后候补名单被删；Step 达到目安就自动变完成（必须用户确认）；memo 判定 ≥2 问就直接加分（必须确认卡）；AI 不可用时没有手动勾选的退路；面谈提案对非 Orbit 用户出现「送信」；依頼文有发送按钮；活动分数用 AI 打分（只能 AI 填事实、规则算分）；会える活動在没有事实时显示虚高的分；人脉里没有这类人时页面空白；他人的计划 / 条目能被读到；`contacts/matches` 跳转后丢失返回位置；示例模式下写操作没被拦截；接受 v2 候补时生成了 v1 式「约 TA」行动；同一场活动给同一目标记两次、或两个目标只记了一个；线下聊过填了名字却建出重复联系人；「前提を見る」能直接改前提（应只读，改要走見直し）；1024 / 390 的版式没按 b8。

## 契约（本 Sprint 定稿，REPORT 交接）

`shared/contract/plan-v2.ts` 只加：
- `PlanV2Detail` 加可选 `todayChance`、`typeStats[{ itemId, candidates, events, introRoutes }]`、`pending[]`、`stepProgress[{ stepKey, label, done, total }]`、`stepSuggestions[{ stepKey, question, evidenceIds[] }]`。
- `PlanPersonTypeDetail { itemId, header（一句话、短名、配点、人数、单价、earned、skipped）, why, questions[3], countRule, recognizeHints[], persona?, opener?, candidates[{ contactId, name, company, recommendScore, reason, opener, isOrbitUser, lastContactAt?, basis[] }], talked[{ contactId?, anonymous, at, points, awardLogId }], introRoutes[{ viaContactId, viaName, why }]（来自方案内容，C6 / C9 产出）, events[{ eventId, title, startsAt, score, expectedCount, breakdown? }], tasks[{ taskId, title, dueDate? }]（带 `planLink` 的 To-do，R20 落库前为空）, sample? }`。
- `stepSuggestions` 由规则产生：Step 关联的人物类型都已达到目标人数（或已跳过）时出一条，文案用模板，`evidenceIds` = 计入的记录（DESIGN §2.5）。
- `PlanV2Detail` 再加可选 `recentAwards[]`（最近 5 条计分，给 Web 1024「最近の加点」）。
- **契约 8 改成设计稿口径**：`EventAssessmentCriterion = 'fit' | 'confidence' | 'timeCost' | 'connections' | 'format'`，`EventAssessmentScoreItem` 加 `max`（45 / 15 / 20 / 10 / 10）、`facts[]`、`estimated`；`BREAKING.md` 登记（原因：一个分数一种口径，附录 D-c；负责人甲；App 跟进 = 同步副本），R08 的 mock / fixture / schema 同步改。计划这边的会える活動直接复用这个类型（`EventScoreBreakdown = Pick<EventAssessmentContract, 'total' | 'verdict' | 'scoreBreakdown' | 'rubricVersion'>`），R26 不再改形状。
- `PlanContactFit`（给 R11）、`PlanPendingItem`（给 R20），形状见 DESIGN §8。

| 接口 | 说明 |
| --- | --- |
| `GET /api/agent/plans/v2/[planId]`（扩展） | 概要所需的全部字段 |
| `GET /api/agent/plans/v2/[planId]/types/[itemId]` | 人物类型详情 |
| `POST …/types/[itemId]/candidates/[contactId]/decision` | ✓/✕（v2 路径：更新候补状态并关联，**不生成**「约 TA」行动；不调 v1 的 `decideMatchCandidate` 写行动的分支） |
| `POST …/types/[itemId]/talked-offline` | 线下聊过：名字可空；有名字先按姓名在人脉里找，返回「この人ですか？」候选让用户选，确认后计分；都不是才经 `/api/contact-drafts/manual`（来源「プラン」）新建再计分 |
| `POST …/types/[itemId]/proposals` | 面谈提案：Orbit 用户 → 站内结构化请求（3 个时段）；其他人 → 草稿（不发送） |
| `POST …/types/[itemId]/intro-drafts` | 紹介ルートの依頼文草稿（现有 email-draft，只出草稿） |
| `GET /api/agent/plans/v2/pending` | 待确认项（memo 计分提议、Step 完成建议、候补）（给 R20，可选） |
| `POST /api/agent/plans/v2/pending/[id]/accept` / `dismiss` | 确认 / 不采用（memo 提议确认即计分；手动勾选版带 `answered[]`） |
| `GET /api/agent/plans/v2/contacts/[contactId]/fit` | 某人在哪个类型下被推荐（给 R11） |

计分、撤销、跳过、Step 完成用 R22 的命令接口。

## `shared/compute/event-score.ts`（规则，两端共用；R26 复用并补 AI 事实）

- 5 项固定标准：会える人の適合 45 / 推定の確度 15 / 時間とコスト 20 / 既存のつながり 10 / 交流の形式 10；阈值 70 推荐、50–69 条件付き、<50 見送り。
- ① 只用「剩余目标人数 × 配点」加权（同一个会，见到的这类人越多分越低）；② 按事实来源（申込者タグ公开 > 过去回 > 只有主办说明）；③ 对照用户偏好（默认：平日夜可、移动 60 分钟、¥5,000 以内；偏好存储由 R26 定，本 Sprint 用默认值并在 REPORT 交接）；④ 人脉中参加的人数；⑤ 交流时间 / 名札 / 匹配的有无。
- 事实取不到的项：降 ②，并在该项标「推定」；**AI 不打分**。本 Sprint 的事实只来自库内活动已有数据（参加者行业 / 职位、费用、时间、地点、形式字段），R26 再加 URL / 海报的 AI 事实。
- 测试：设计稿两个例子（勉強会 #14 = 82、D2C Summit = 61）作为固定用例；「见到 1 人后同一个会 82 → 76」的递减用例。

## 范围与文件

- **新建（服务端）**：`features/plans/v2/{detail-reader,type-detail-reader,today-chance,pending-service,contact-fit}.ts`；`features/plans/v2/event-facts.ts`（库内活动 → 事实）；`shared/compute/event-score.ts`；memo 判定的提议生成（`features/plans/v2/memo-coverage.ts`，消费 memo 提取结果）；上表路由 + handlers。
- **新建（Web）**：`app/(app)/app/plans/[planId]/types/[itemId]/page.tsx`（与 App 同路径）；概要按 b8 的 1024（分数横跨 12 列、左 7 列类型行、右 5 列今日のチャンス + 最近の加点 + イベント）与 390（Step 横滑卡片、↻ 見直し）版式；`orbit-2026/plan/` 下概要（分数头、构成条、方案卡、按钮组、Step 列、人物类型网格、イベント块、右栏）、人物类型详情（头卡、左 5 列、候补表、紹介ルート、活动表与内訳展开）、记录 / 自报 / 跳过 Modal、面談提案 520 抽屉、依頼文草稿抽屉。
- **新建（App）**：`app/plans/[planId]/types/[itemId].tsx`；`src/screens/plan/` 下对应组件（BottomSheet 版弹层、底部固定栏）。
- **修改**：Web `plan-slot.tsx` 的「有 v2 计划」分支 → 概要（替换 R23 的「已确定」卡）；App `PlanSlot` 同；`features/contacts/memo-extraction/provider.ts`（C11）、`features/plans/ai-matcher.ts`（C12）；活动签到 / 「参加した」的现有流程加调 `recordEventAttendanceForPlans`；契约 8（`shared/contract/event-assessment.ts`、`shared/api-schema/event-assessment.ts`、R08 的 mock 与 fixture、`BREAKING.md`、快照，App 同步）；App `app/contacts/matches.tsx` 改为跳转 `task?seg=plan`（屏幕文件 R25 删）；路由登记（两端）；文案（Web `orbit-2026/copy/plan.ts`、App `src/i18n/*/plan.ts`）。
- **测试**：
  - `plan-detail.test.ts`：概要字段与 `summarizePlanScore` 一致；今日のチャンス挑选规则（候补里推薦度最高且未聊 / 剩余目标最多的活动）；Step 进度；他人 404；
  - `type-detail.test.ts`：三种去向的字段；候补按推薦度降序；已聊的折叠；人脉里没有时人物像与活动齐全；
  - `event-score.test.ts`：设计稿两例 + 递减 + 事实缺失降确度 + 阈值；契约 8 新形状的 schema 与 fixture 测试（R08 的路由测试同步改）；
  - `event-attendance.test.ts`：两个生效 v2 目标都有イベント枠 → 各记一次；重复签到不重复；已达成的目标不记；
  - `candidate-decision.test.ts`：v2 接受候补只关联、不生成行动；线下聊过的姓名查找与新建（不建重复联系人）；
  - `memo-coverage.test.ts`：开关关时不加输入；≥2 问生成提议、<2 不生成；确认才计分；AI 失败 → 手动勾选提议；memo 提取现有输出回归；
  - `proposal.test.ts`：Orbit 用户 → 结构化请求（无自由文本、3 个时段）；非 Orbit 用户 → 只有草稿，响应里没有任何「已发送」状态；
  - 两端渲染测试：分数 count-up 与「减少动效」、构成条四种段、加分动效与撤销 Toast、匿名自报弹层规则说明、超额半分提示、跳过确认（默认焦点在主按钮）与撤回、Step 确认卡、候补多选与底部栏、依頼文只有コピー / メールアプリで開く；
  - 端到端：Web Playwright 与 App 渲染测试各一条「种子计划 → 进类型 → 记录 → 撤销 → 跳过 → 撤回 → 概要分数正确」。
- **不做**：見直し、手动编辑入口的实际功能（按钮可见，R25 接；R23 已有的手动编辑页只服务生成流程）、達成、目标下拉（R25）；活动 URL / 海报评估（R26）；删除旧屏（R25）。

## 验收契约

| SC | 操作链 | 主证据 |
| --- | --- | --- |
| SC-R24-01 概要 | 种子计划在两端打开 Task › プラン：分数、构成条四种段、方案卡与依据、4 个按钮（「前提を見る」只读 + 「見直しで変える」；見直し / 手動編集 / 達成 在 R25 前显示但点了提示「まもなく使えます」）、今日のチャンス、Step 进度与规则确认卡、人物类型卡三格、イベント块、「達成を保証しません」；Web 1024 / 390 按 b8 版式（含「最近の加点」、Step 横滑） | 渲染测试 + 截图（少量 / 大量数据，浅色 / 深色） |
| SC-R24-02 人物类型三种去向 | 有候补 / 没有 / 已跳过三种详情内容齐全（含紹介ルート、有 `planLink` 任务时的「やること」）；候补 ✓/✕ 生效且不生成行动；面談提案按对方是否 Orbit 用户分两种；依頼文只出草稿 | 测试 + 截图（b4 A2、b10 ⑧ 对照） |
| SC-R24-03 记录与加分 | 有名字记录 +单价（预告与实得一致）；同人同类型再记无分；匿名到目标后无分且说明；超额半分；撤销 5 秒内可用、面谈记录保留；跳过满额斜纹、撤回复原 | 服务 + 渲染 + 端到端 |
| SC-R24-04 分数一致 | 同一份计划：概要、`GET /v2/summary`（首页）、App、Web 显示的 total / todayDelta / segments 完全相同 | 对照测试（同一 fixture 两端渲染） |
| SC-R24-05 memo 判定 | 开关开 + @候补 → 判定 → ≥2 问出确认卡 → 确认后计分；AI 不可用 → 手动勾选卡；开关关 → 不发 3 问给 AI | `memo-coverage` 测试 |
| SC-R24-06 活动分 | 会える活動按 5 项规则打分、内訳可展开、事实缺失标「推定」；契约 8 与之同一形状；参加 → 每个有イベント枠的生效目标各加一次分、满额后半分 | `event-score`、`event-attendance` + 截图 |
| SC-R24-07 接口给别人 | `contacts/[id]/fit`（R11）、`pending`（R20）有 mock 与 live 路由测试；App `contacts/matches` 跳到 Task › プラン 且返回回到原处 | 路由测试 + App 测试 |
| SC-R24-08 AI 规矩 | C11、C12 提示词版本 +1，mock 先行；授权后各 ≤5 次真实调用，REPORT 附记录 | 测试 + REPORT |

### 必需证据子表

| SC | 子断言 | 证据 |
| --- | --- | --- |
| 01–06 | 截图对照页：b4 A1–A2、b10 ⑦⑧、app.html / web.html プラン部分、b8「Task › プラン」1024 / 390 ↔ 实现，浅色 / 深色；App 模拟器 | `~/orbit-sprint-evidence/redesign/R24/run-01/compare.html` |
| 03 | 「减少动效」开启时只保留淡入（RD-16） | 渲染测试 |
| 全部 | 三语、`copy:qa` 0、门禁零新增；两端全量零新增失败；`tsc`、`typecheck:app`、`lint`；`detect-changes` 写进 REPORT | 全量清单 |

## 执行顺序

1. 基线、impact；用 R22 的种子脚本在本机造计划。
2. 服务端读模型（概要扩展、类型详情、今日のチャンス、待确认）→ `event-score.ts`（表驱动 RED）→ 计分接线。
3. memo 判定与候补提示词（mock）。
4. Web 概要 → 类型详情 → 弹层；App 同。
5. App `contacts/matches` 跳转。
6. 端到端、截图对照页；若已授权，C11 / C12 本机真实调用。
7. 全量、REPORT。

## 失败与交接

- 库内活动缺少形式、费用等字段，导致 ③ ⑤ 大量「推定」：照实显示，REPORT 列出缺的字段，交给 R26 补事实。
- 面谈提案的站内结构化请求如果现有 appointments 接口不支持「无自由文本」：本 Sprint 只发不带文本的请求（界面不给输入框），不改接口；REPORT 写明。
- REPORT 交接：给 R10 的分数一致性证据；给 R11 / R20 的接口与 mock（含 `planLink` 显示位置）；给 R25 的按钮占位位置；给 R26 的 `event-score.ts`、`event-facts.ts`、改好的契约 8 与偏好默认值。
