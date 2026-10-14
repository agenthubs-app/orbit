# Sprint R26 — 活动：评估、一级页与计划接线

**Plan revision:** 2（rev 2 按 `events/REVIEW.md` S1–S2、M1–M11、m1–m10 修订）。**模式:** existing-codebase / single-generator（执行人：小雨（甲））。**档位:** H。
**单一目标:** 做以下几件事：
- 契约 8 活动评估 live：URL 抓取（带 SSRF 防护）、海报 / 截图、贴正文、3 项手入力、异常态；新迁移 `event_assessments`；
- 新契约 `events-mine`；
- 两端イベント一级页（評価 / 参加予定，探す页签的壳）与評価結果；
- 活动事实 live（`PLAN_LIVE_EVENT_FACTS_READY = true`），概要推荐活动行、今日のチャンス、会える活動与 R24-06 服务端小项；
- 工作人员代签计分；
- 手入力 / 每天一问换取数；
- 重比计划页 12 个暂缓画面；
- 删除两端旧イベント一级页。

**易读目标:** [GOAL.md](GOAL.md)。**整体设计:** [events/DESIGN.md](../events/DESIGN.md)（§2.1、§3.1–3.2、§3.5、§4.1、§5、§6、§7–§8 R26 行、§9、§10、§13）。
**基线:** 开工时的 `redesign` HEAD。
**进入条件:**
- DESIGN 已复核（[REVIEW](../events/REVIEW.md)）；
- §10 A1（付费 AI）有答复前，先做 mock + 规则路径，真实调用等授权；
- §10 C 组 token 第一天补齐。

**分支:** 一人做，可直接在 `redesign` 上提交；与乙并行改到同一批文件时开 `redesign-R26-events-assessment`（README「分支」）。

## 已查清的事实（`redesign` @ `89e16b2b4`，开工时用 GitNexus 复核）

1. **契约 8**：`shared/contract/event-assessment.ts`（`SourceKind` url / poster / orbit_event；`Status` reading / ready / needs_input / failed；`Verdict`；`Criterion` fit / confidence / timeCost / connections / format = 45 / 15 / 20 / 10 / 10，:6-10；`Facts` title / startsAt / venue / organizer / price / url :12；`ScoreItem` :21；`Contract` :34；`CreateInput` 按来源联合并带 `idempotencyKey` :50；`PatchInput { facts }`；`AddToPlanResult` :60）。zod 在 `shared/api-schema/event-assessment.ts`。路由 `GET/POST /api/events/assessments`、`GET/PATCH /[id]`、`POST /[id]/add-to-plan` 转发到 `features/redesign-contracts/handlers.ts:124-140`。live = 503（`service-factory.ts:29` 只登记 `contact-completion`）；mock `demoEventAssessment`（`shared/mock/demo-world/fixtures.ts:292`），mock create 按幂等键重放（`mock-service.ts:335`）。App 已有副本 `orbit-app/src/api/contract/event-assessment.ts`。
2. **计分**：`shared/compute/event-score.ts` `scoreEvent({types, facts, preferences?})`（:95），`EVENT_SCORE_MAX`（:11），阈值 70 / 50（:12-13），`EVENT_MEET_RATE` 0.25，缺省偏好 ¥5000 / 60 分 / 平日夜可（:32），`event-score-v2`。
3. **计划**：`features/plans/v2/service.ts` `addEventToPlan`（:194 / :931，加入后 `recommended`）、`recordEventAttendanceForPlans`（:196 / :951）、`planRemainingTargets`（:197 / :983）；`event-facts.ts:31` `PLAN_LIVE_EVENT_FACTS_READY = false`，`livePlanEventFacts`（:44，**无参**）live 返回 `[]`（注释 :39：未来 60 天 ≤20 场；缺 expected / fee / travel / networking / 一二度人脉，:15）；`overview.ts:150` `eventsFor()` 喂概要、类型详情与 `todayChance`（:247）；`v2/service-factory.ts:82` mock `demoPlanEventFacts`、:92 live。D53 只有占位注释 `app/(app)/app/orbit-2026/plan/PlanOverview.tsx:652`。
4. **签到**：本人 `onSelfCheckedIn`（`features/events/event-operations/service.ts:479`）→ `markPlanEventAttendedForActor`（`runtime.ts:68-71`）→ `recordEventAttendanceForPlans`（`features/plans/event-attribution-runtime.ts:74`）；代签 `checkInParticipant`（`service.ts:515`，`kind: "staff"`）不调；对账任务 `features/plans/event-attendance-reconcile.ts:88-96`——v2 待补来自 `listUnscoredAttributedEventsV2`（`matching-repository.ts:792`，读联系人 `metEventId`，**不读签到记录**，代签失败没有兜底）；报名路由调 `syncPlanEventRegistrationForActor`；`readRuntimeRegistrationsForPlanActor`（`event-attribution-runtime.ts:106`）。
5. **AI / 账本**：`ai_usage_ledger.purpose` 已含 `event_assessment`（`features/network-analysis/migrations.ts:138-153` v3）；`features/ai-quota/constants.ts` 已登记（max_calls 2，池 `user`），`AI_QUOTA_MONTHLY_LIMITS` 只有计划用途。名片 vision：`features/acquisition/deepseek-business-card-ocr-provider.ts`（`deepseek-v4-flash-vision-exp` :15-16），选择器 `business-card-ocr-provider-selection.ts`。**全仓没有外部 URL 抓取、没有 SSRF 防护。** `AI_QUOTA_MONTHLY_LIMITS` 类型是 `Partial<Record<AiQuotaPurpose, number>>`（`constants.ts:82`）；`event_assessment` 走 `user` 池会占 `USER_POOL_DAILY_LIMIT = 10`。名片 vision 是两段调用（转录 → 结构化，`ocr-provider.ts:15-22`）。
9. **活动表**：库内活动正式表 `event_ops_events`（`event-operations/storage/migrations.ts:20`），`organizer_actor_id not null`，`lifecycle_state_v2 in ('draft','published','cancelled','archived')`（:940–943），**没有可见性列**；`captureMethod` 是由 `source.type` 推出的契约字段（`event-crud-and-import/live-service.ts:138`），`origin` 是对象。所以外部活动**不能**写进活动表（复核 S1，DESIGN §2.1 / §9 #7）。
10. **评分依据**：`scoreEvent` 只返回 `{criterion, score, max, estimated}`；依据文字由 `overview.ts:140-143` `eventScoreView` 生成；判定 `eventVerdict(total)`（`event-score.ts:135`）。
6. **活动列表**：`app/api/events/handler.ts:149`（只按 scenario / capture method / status 过滤，:43，没有「我」）；Web `/app/events/page.tsx` → `events-0918/events-list.tsx`，水合警告来自服务端 `Date.now()`（`page.tsx:27`）；App `orbit-app/app/(app)/events.tsx` → `src/screens/events/EventsScreen`。报名状态读 `readRuntimeEventRegistrationStates`（`features/events/registration/runtime`）。
7. **旧推荐分**：`features/recommendations/live-event-value-service.ts` `valueScore`（:343，上限 99 :244），工厂 `createEventValueRecommendationService`（`service-factory.ts:84`）。
8. **既有失败**：连库后活动访问 2 条（`event-access-repository-postgres`、`event-access-migrations-postgres`，交接表 U06），基线同样失败，收口对照。

## 上下文包

### 必读
- DESIGN §2.1、§3、§4.1、§5、§6、§8–§10；交接表「R26 / R27 活动」「R22–R25 计划 v2.2」中的 R24-06 / 06b / 06c / 08、「通用口径」G01–G26。
- 设计稿：`app.html` #13–15、#30、#31、#37；`web.html` #10–12、#23；`b8-responsive.html` #0–5、#17、#19；`b2-events-flow.html` #0–5；`b12-missing-states.html` #226 / #227（W-R24-08）。一律 `--extract-board` 单块抽取。
- 代码：上面「已查清的事实」所列文件；R24 的面談 / 计划概要组件（只读）；R12 / R16 手入力与每天一问的取数函数（只改取数）。

### 关键符号与 impact（开工时重跑，结果写 REPORT）
- `scoreEvent`：**只加**区间输出，不改现有 5 项算法；impact 预计 MEDIUM（计划概要、类型详情）。
- `livePlanEventFacts`、`eventsFor`：打开 live；HIGH 时在 REPORT 写对策「mock / live 两态测试 + 有界读取」。
- `checkInParticipant`：只在成功分支后追加调用，不改返回值。
- `createEventValueRecommendationService`：**不改**（新界面不读）。
- 契约 8 handlers、`service-factory`：加 live。
- R12 `出会った場所` 候选函数、R16 `completion-question` 的活动选项函数：只换数据源。

### 易错边界（全部写进 SC）
- SSRF：私网 / 环回 / 元数据地址、DNS rebinding、重定向跳到内网、超大响应、非 HTML。
- 登录页被当成活动页喂给 AI；页内多个活动只评第一个。
- AI 输出把推测当读取（`basis` 错）；AI 改了分数；JSON-LD 已有事实还交给 AI。
- 同一来源重复评估重复扣额度；月上限按 UTC 而不是东京月切换。
- 费用不明时分数显示单值而不是区间；3 维换算和计划页内訳不一致；同一活动在评估页、概要、类型详情三处分数不同。
- 外部活动「参加予定に追加」后在别人的探す里出现；見送る误写成契约 9 的「興味なし」。
- `PLAN_LIVE_EVENT_FACTS_READY = true` 后全表读（超过 60 天 / 20 场）。
- 代签给无账号参加者报错；代签重复记分。
- `events/mine` 漏掉待审核、把取消的算进参加予定。
- 手入力候选、每天一问选项出现别人的活动。
- 示例模式写库或调 AI。
- 水合警告仍在。
- 界面残留「招待コード」指活动码。

## 契约（第一天提交，`contract:` 开头，「App 需要同步」）

- **契约 8 只加**（DESIGN §4.1）：
  - `SourceKind` + `text` / `manual`；`CreateInput` + `{sourceKind:'text', text}` / `{sourceKind:'manual', facts}`，以及 `posterAssetIds?`；
  - `Facts` 可选字段：speakers / exhibitorCount / expectedAttendees / format / agenda / endsAt / area，每个事实可带 `basis`；
  - `Contract` 可选字段：display / scoreRange / meetCandidates / knownAttendees / cautions / partialAttendanceHint / failureReason / pageCandidates / userFilledFields / userDecision / eventId / assessedAt；
  - 新路由 `POST /api/events/assessments/[id]/dismiss`。
  - `failureReason` 枚举含 `login_required / not_event_page / unreadable / fetch_failed / too_large / blocked_host / ai_unavailable / quota_exceeded / timeout`；`posterAssetIds` ≤3。

  **App 先改宽进**（G19：`src/api/contract/event-assessment.ts` 的枚举兜底）。
- **新契约** `shared/contract/events-mine.ts` + `shared/api-schema/events-mine.ts`：`GET /api/events/mine?range=upcoming|past&limit=`。
- **契约 12（plan-v2）只加**：概要 `events[]` 的 `assessmentHref?` / `fitLabel?` / `display?`；`todayChance` 活动候选的 `basis`。
- **纯函数**（`shared/compute`，两端同步）：`event-score-input.ts`（契约事实 → `EventScoreFacts`，含 `parsePriceYen`，DESIGN §3.5 映射表）、`event-attendee-typing.ts`、`event-assessment-display.ts`、`event-facts-derive.ts`、`event-travel-estimate.ts`、`event-partial-attendance.ts`、`event-emoji.ts`。
- 快照（`contract-snapshot.mjs --write`）、parity、App `sync:contract`。新异常态 fixture 进 `demo-world-consistency`：`demoEventAssessmentLoginRequired`、`…NotEventPage`、`…NeedsInput`、`…Range`。

| 接口 | 说明 |
| --- | --- |
| `POST /api/events/assessments`（live） | 幂等（键 + `actor/digest/rubric`）；URL → 抓取 → 规则判登录页 → JSON-LD / meta → E1；海报 → E2；正文 → E1；manual → 只规则；库内 `eventId` → 只规则。异步：写记录 + 任务后返回 `reading`；`after()` 立即处理、cron 每分钟兜底认领租约过期的记录；>2 分钟回收为 `failed / timeout` 并退额度；同键重试返回同一条（DESIGN §5「执行方式」） |
| `GET /api/events/assessments`、`/[id]`（live） | 只本人；列表按分数降序（評価したイベント · スコア順） |
| `PATCH /api/events/assessments/[id]`（live） | 补 3 项（`basis: 'user'`），只用规则重算，不再调 AI |
| `POST /api/events/assessments/[id]/add-to-plan`（live） | 库内 → `addEventToPlan`；外部 → **不建活动**，计划条目引用 `assessment:<id>`（第一天核实 `plan_items.linked_event_id` 无外键；有外键则按 DESIGN §3.1 加 `linked_assessment_id`）；都加到当前目标；写 `user_decision='added'` |
| `POST /api/events/assessments/[id]/dismiss`（新） | 写 `user_decision='dismissed'` |
| `GET /api/events/mine`（新） | 报名 / 待审核 / 已加入计划 / 已参加 / 已取消；`upcoming` 按开始时间升序，`past` 降序 |

## 迁移

- `event-assessments-core`（DESIGN §3.1）：放在 `features/events/assessment/migrations.ts`，并登记进模块迁移清单。本机库验证正向迁移和重放；**生产不执行**（DESIGN §11，等授权）。
- 迁移同时加 `lease_until`、`attempts`（异步执行）。
- 配额常量（不迁移）：`AI_QUOTA_MAX_CALLS.event_assessment = 3`；`AI_QUOTA_MONTHLY_LIMITS.event_assessment = 10`；评估单独日计数 5 次、不占 `USER_POOL_DAILY_LIMIT`。

## 范围与文件

- **新建（服务端）**：`features/events/assessment/{service,repository,migrations,url-fetch,page-extract,extract-provider,poster-provider,configured}.ts`（提示词 `event-facts-2026-10-v1`、`event-poster-2026-10-v1`）；`features/events/mine/{service,configured}.ts` + `app/api/events/mine/route.ts`；`app/api/events/assessments/[id]/dismiss/route.ts`；`redesign-contracts/service-factory.ts` 加 live。
- **新建（服务端，续）**：`features/events/assessment/{job,recompute-job}.ts`（异步处理器与重算任务，挂现有 cron 入口）。
- **改（服务端）**：
  - `event-facts.ts`：live 实现（新签名 `livePlanEventFacts({ workspaceId, actorId })`、合并顺序我的外部评估 → 我报名 → 公开补足、两层缓存）+ 常量改 true；
  - `event-attendance-reconcile.ts`：加「已签到（含代签）未记分」一路；
  - `overview.ts`：推荐活动行、今日のチャンス依据，以及 R24-06 的六个小项；
  - `event-operations/service.ts`：代签成功后调 `markPlanEventAttendedForActor`；
  - R12 手入力候选与 R16 每天一问活动选项的取数改读 `events/mine`。
- **新建（Web）**：`app/(app)/app/orbit-2026/events/`（`EventsPage`、`AssessCard`、`AssessmentResult`、`AssessmentDrawer`、`AssessFailure`、`PosterFill`、`MyEvents`、`ParticipationCodeModal`、`EventScoreRing`），`/app/events/page.tsx` 换新页；`/app/events/assessments/[id]/page.tsx`。
- **新建（App）**：`src/screens/events/v2/`（`EventsHome`、`AssessInput`、`Assessing`、`AssessmentResult`、`AssessFailure`、`PosterFill`、`MyEvents`、`ParticipationCodeSheet`），`app/(app)/events.tsx` 换新屏；`app/events/assess.tsx`、`app/events/assessments/[id].tsx`。
- **计划页**：只接数据，不改结构：
  - Web `PlanOverview.tsx:652` 占位换推荐活动行，类型详情右栏「このタイプに会えるイベント」；
  - App 概要イベント卡。
- **删除**：
  - Web `events-0918/events-list.tsx`（逐个确认调用方）；
  - App `EventsScreen`（确认 `(app)/events.tsx` 之外无调用）；
  - 允许清单行；
  - `home/events` 两端改为跳 `/app/events?tab=going`。
- **登记**：两端新路由（App `parentForPath` / 旧路由跳转表；Web 审计计数）、`screen-ownership.md` 对应行改「已处理」、`capability-registry` 登记契约 8 live。
- **不做**：探す页签内容、详情、报名、会う準備、会場、会後、契约 9（R27）；活动偏好设置界面（R18）；`valueScore` 下线；主办侧（R17）。

## 测试

- `url-fetch.test.ts`：表驱动——http / https 以外、带凭据、私网 / 环回 / 链路本地 / 169.254.169.254 / IPv6 ULA / IPv4 映射、DNS 返回内网（rebinding 钉 IP）、重定向第 2 跳到内网、超时、>2MB、`content-type` 不对、每人每分钟第 11 次。
- `page-extract.test.ts`：JSON-LD `Event` 优先；登录页三条规则；正文截断 12k；页内多活动 → `pageCandidates`。
- `external-assessment-privacy.test.ts`：外部评估加入计划后，名片归属窗口（`start-window.ts`）、公开目录、他人的 `livePlanEventFacts`、探す、主催中心都读不到；本人计划概要能读到（复核 S1）。
- `assessment-job.test.ts`：after 处理、cron 认领租约、2 分钟回收为 timeout 并退额度、同键重试不重复入队。
- `assessment-recompute.test.ts`：有界（30 天、≤100 条）、只规则、变化 ≥10 / 名单首次公开写 `event_pick`、外部活动不重算。
- `event-score-input.test.ts`：价格解析表驱动（無料 / ¥15,000 / 1.5万円 / 3,000〜5,000円 / 不明）、议程 → `networkingMinutes`、多目标取当前目标。
- `event-assessment-service.test.ts`（内存 + Postgres）：
  - 幂等（同键、同来源）；状态机 reading → ready / needs_input / failed；
  - schema 不过 → 修复 1 次 → 失败；
  - AI 不能改分（分只来自 `scoreEvent`）；basis 透传；
  - PATCH 只规则重算、不调 AI；区间（参加費不明）；
  - add-to-plan 库内 / 外部（私有、不出现在他人列表）；dismiss；
  - 他人隔离；示例模式拦写；
  - 月上限 10（东京月边界：10/31 23:59 JST 与 11/1 00:00 JST）、日上限 5、不占 user 池总熔断、`quota_exceeded`；
  - 判定一律 `eventVerdict(total)`，区间只显示。
- `event-assessment-display.test.ts`：5 → 3 维换算与 W-R24-08 内訳同源；区间换算。
- `event-facts-derive.test.ts`、`event-travel-estimate.test.ts`、`event-partial-attendance.test.ts`、`event-emoji.test.ts`：表驱动。
- `plan-event-facts-live.test.ts`：新签名带 actor；我的活动优先不被截断；有界读取（第 21 场、第 61 天不读）；外部私有活动只对本人；概要 / 类型详情 / 今日のチャンス三处分数一致；常量为 false 时回到空（两态都测）。
- `staff-checkin-plan-score.test.ts`：代签 → 记分一次；重复代签 noop；无账号参加者不报错只记日志；代签记分失败 → 次日对账补记（新一路）。
- `events-mine.test.ts`：五种状态、排序、他人隔离。
- R12 / R16 取数回归：候选只来自我的活动。
- 渲染（两端）：一级页三段、評価空 / 少 / 大、判定中三步、结果、三种异常、补 3 项与区间、参加予定、参加コード弹窗；Web 1024 抽屉 / 单页、390 全屏。
- 端到端：Web Playwright「贴 URL（本机 fixture 服务器）→ 判定中 → 結果 → 参加予定に追加 → 计划概要出现该活动」。
- 门禁：按下方像素 SC。

## 验收契约

| SC | 操作链 | 主证据 |
| --- | --- | --- |
| SC-R26-01 一级页（**R26-01**） | App 顶栏「🔍 · イベント + 10月 · 参加予定 N件 · 📅」+「評価 / 参加予定 N / 探す」三段胶囊（`Segmented tseg`）；🔍 → 探す聚焦搜索、📅 → Task カレンダー；Web ShellPage 标题区 + 页签 + 默认右栏 | 渲染 + 像素 P01–P03 |
| SC-R26-02 评估 live | URL / 海报（≤3 张，一次请求）/ 正文 / 3 项四种输入 → 判定中三步 → 结果（总分、判定、3 维、会えそうな人、気をつける点、部分参加、日历冲突、時点说明、「<目标> で判定」）；事实 → 计分输入按 DESIGN §3.5 映射表全规则；分数只来自 `scoreEvent`，判定只用 `eventVerdict(total)`；异步执行与回收 | 服务 + 渲染 + 端到端 |
| SC-R26-03 异常态 | 要登录（不调 AI、三条退路）、不是活动页（列页内活动可逐个评估）、海报不清（色标 + 补 3 项 + 「不明」+ 区间） | 服务 + 渲染 + 像素 P06–P09 |
| SC-R26-04 安全 | SSRF 表驱动全过；限速；不存页面全文 | `url-fetch` + 代码审阅 |
| SC-R26-05 AI 与账本 | E1 / E2 走账本 `event_assessment`、`promptVersion` 入账；每次评估 ≤2 次调用；月上限 10（东京月）；超限文案；示例模式不调 | 服务测试 + 真实验证记录（授权后） |
| SC-R26-06 参加予定（**R26-06 / 07 前置**） | `events/mine` 五种状态；参加予定页签（设计稿无，按 B2 补画后过门禁）；首页可用 | 服务 + 渲染 |
| SC-R26-07 计划：会える活動（**R26-03 / R26-05 / D53**） | live 事实打开、有界读取；概要推荐活动行（3 个）、类型详情「このタイプに会えるイベント」（2 个）、会える活動表首行 5 项评分条；三处与评估页分数一致；复用 `addEventToPlan` / `planRemainingTargets` / `event_assessment` 契约，不另起形状 | 服务 + 渲染 |
| SC-R26-08 计划：R24-06 小项（**R24-06**） | 推荐活动行；Step ↔ 活动；「最近の加点」含スキップ；今日のチャンス依据与按钮文案；最终接点相对时间；依頼文两种语气由服务端给；记录弹窗「いつ」传 `at`；見分け方分类与人物像键值行 | 服务 + 渲染 |
| SC-R26-09 代签计分（**R26-04**） | 工作人员代签 → `recordEventAttendanceForPlans`（经 `markPlanEventAttendedForActor`）；幂等；无账号不报错；对账任务补「已签到未记分」一路（代签界面归 R17，验收用现有运营接口 / fixture 触发） | `staff-checkin-plan-score` |
| SC-R26-10 换取数（**R26-06 / R26-07**） | 手入力「出会った場所」候选 = 我的活动（过去 30 天 + 未来 7 天）；每天一问活动选项 = 参加记录 + 活动开始时间（±14 天不变）；两端界面不变 | 回归测试 + 截图抽查 |
| SC-R26-11 参加コード（**R26-02**） | 評価空态「参加コードをお持ちですか？」→ 输码 → `/register/<code>`；`grep` 两端界面与字典：活动报名码处无「招待コード」（R15 人脉邀请处保留）；B1 画板改完后门禁通过 | `grep` 记录 + 渲染 |
| SC-R26-12 水合（**R26-09 前半**；后半 `/live` 见 R27 SC-R27-08） | `/app/events` 1440 开发模式无水合警告（「已结束」改服务端算好传入） | 浏览器控制台记录 |
| SC-R26-13 重比计划页（**R24-06b / R24-06c**） | 重跑 `web-plan-A.json` W-R24-01 / 02（1440 / 1024 / 390）、04a、04c、05、06、07、08 与 `web-plan-C.json` W-R25-01 / 02 / 07 / 09 / 10；`app-plan-A.json` A-R24-01 / 04（连同 R24-09 弁護士卡清缓存），另补 `app.html` #22 / #25 / #27 / #28、`b10` #33（先查是否已归某个 A-R24 画面，否则追加进 `app-plan-A.json`）；过了把 R25 REWORK-REPORT 对应行改通过，没过按规则 11 登记暂缓；R24-08 排序口径未定的画面单独标注 | 门禁总表 |
| SC-R26-16 重算与通知（**DESIGN §6.5**） | 重算任务有界、只规则；变化 ≥10 / 名单首次公开写 `event_pick`；`b8` #4 的「再計算し、お知らせします」可兑现 | `assessment-recompute` |
| SC-R26-17 外部活动隐私（**复核 S1**） | 外部评估加入计划只对本人可见；五个读取方读不到 | `external-assessment-privacy` |
| SC-R26-14 旧屏 | Web `events-list` 与 App `EventsScreen` 删除、允许清单只减不增、`home/events` 两端跳新页签、`screen-ownership.md` 已处理 | 测试 + 点击验证 |
| SC-R26-15 交接表通用口径 | G01–G26 适用项逐条落实（G05 / G07 门禁、G10 插槽、G15 / G16 / G17 App 壳、G18 尚未实现、G19 宽进、G21 作用域、G24 `UiText`、G26 token） | REPORT 逐条 |

### 像素 SC（README 通用规则 11）

归因文件 `repos/orbits/scripts/visual/attribution-redesign-R26.json`；画面清单 `scripts/visual/views/web-R26.json`、`app-R26.json`（每条写 `design` + `board-index` + 到达方式）。Web 1440 / 1024 / 390 × 浅 / 深截完整页面（含壳）；App 模拟器真实画面浅 / 深（§20 口径）。演示数据用「设计稿示例 fixture」（CFO Night Tokyo vol.18、Japan SaaS Summit 2026 秋 82 分等，只读 mock，生产不收录）。

| SC | 画面 | 设计稿画板 | 端 / 宽度 | 到达方式 |
| --- | --- | --- | --- | --- |
| SC-R26-P01 | 評価 · 空 | `app.html` #13；`web.html` #10；`b8` #3 | App；Web 1440 / 390（1024 设计稿无，B5） | 种子空账号 `qa-empty@orbit.test` 登录后 `/app/events`（种子步骤写进画面清单） |
| SC-R26-P02 | 評価 · 少量 | `app.html` #14；`web.html` #11 | App；Web 1440（1024 / 390 设计稿无，B5） | fixture「参加予定 1 · 評価 2」 |
| SC-R26-P03 | 評価 · 大量 | `app.html` #15；`web.html` #12（深 #23）；`b8` #0；`b8` #1（深 #17） | App；Web 1440 / 1024 / 390 | fixture 大量 |
| SC-R26-P04 | 評価結果 | `app.html` #31（深 #37）；`web.html` #12 右侧；`b8` #2（1024 抽屉）、#4（1024 单页）、#5（390 全屏，深 #19） | App；Web 三宽度 | 点「Japan SaaS Summit」行 / 1024 抽屉「全画面」/ 深链 `/app/events/assessments/<id>` |
| SC-R26-P05 | 判定中 | `app.html` #30 | App（Web 设计稿无，B6） | mock `status: reading` 深链 |
| SC-R26-P06 | 要登录 | `b2` #0；`b2` #4 | App；Web 1440（1024 / 390 设计稿无） | fixture `login_required` |
| SC-R26-P07 | 不是活动页 | `b2` #1 | App（Web 设计稿无） | fixture `not_event_page` |
| SC-R26-P08 | 海报补 3 项 | `b2` #2；`b2` #5 | App；Web 1440 | fixture `needs_input`（读到 1 / 3） |
| SC-R26-P09 | 补完后判定 | `b2` #3 | App | fixture 区间 55–70 |
| SC-R26-P10 | 参加予定页签 | **设计稿无**（§10 B2，补画认可后补此行） | App；Web 三宽度 | `?tab=going` |
| SC-R26-P11 | 参加コード输入 | **设计稿无**（§10 B6） | App sheet；Web Modal 380 | 空态「入力する」 |
| SC-R26-P12 | 计划页重比 | 见 SC-R26-13（沿用 `web-plan-A/C.json`、`app-plan-A.json` 与归因文件 `attribution-redesign-R24.json` / `R25.json`；App 另补 `app.html` #22 / #25 / #27 / #28、`b10` #33） | 同原清单 | 同原清单 |

### 画板预检（HOW-TO 第 8 节；`board-preflight.mjs` 2026-10-14 实跑，开工时对 `views/*-R26.json` 重跑并更新本表）

**五项总结论**：
- ① 自洽：全部通过（`web.html` #11 / #12 / #23、`b8` #0 / #2 报「会いたい人 6名 vs 14名」，是列表每行各自的数字，误报）。
- ② 数据来源：每个画板的元素都对得上契约 8 / `events-mine` / 计划概要字段，逐块结论见下表。🎤 是活动 emoji，不是语音按钮。
- ③ token：缺口统一按 DESIGN §10 C1–C11，第一天走 R01 流程补齐，实现里不许出现手抄的近似值。
- ④ 组件：三段胶囊用 `Segmented tseg`（App）/ 壳页签（Web）；1024 抽屉用 `Drawer`；参加コード Web 用 Modal 380 档。Modal 380 档与 Drawer 的已知差见交接表 G23 / R24-05，标「待组件库」的部分按规则 11 暂缓。
- ⑤ fixture：设计稿示例 fixture 照画板造（4 个活动、分数 82 / 74 / 68 / 41、会いたい人 14 / 6 / 9 / 2、b8 另加 77 / 58 两场、参加予定 1 / 3 件）。中途状态：判定中用 `status: reading` 深链，1024 抽屉用点击步骤，海报补完用 fixture。

| 画板 | ① 自洽 | ② 疑似无功能元素 → 结论 | ③ token（近似 / 缺，摘要） |
| --- | --- | --- | --- |
| app #13 イベント新用户空状态 | ✓ | 🎤=活动 emoji（`event-emoji.ts`），非语音 | 近似：行高 1.1；缺：字距 0.01, 阴影；间距刻度外 8 项 → C1–C11 |
| app #14 イベント少量数据 | ✓ | 无 | 近似：行高 1.1；缺：字距 0.01, 阴影；间距刻度外 8 项 → C1–C11 |
| app #15 イベント大量数据 | ✓ | 无 | 近似：行高 1.1；缺：字距 0.01, 阴影；间距刻度外 9 项 → C1–C11 |
| app #30 イベント評価 ① | ✓ | URL 输入 → 契约 8 create | 近似：无；缺：字距 0.01；间距刻度外 3 项 → C1–C11 |
| app #31 イベント評価 ② | ✓ | 无 | 近似：行高 1.1；缺：字距 -0.02, 字距 0.01；间距刻度外 8 项 → C1–C11 |
| app #37 イベント評価 | ✓ | 无 | 近似：行高 1.1；缺：字距 -0.02, 字距 0.01；间距刻度外 8 项 → C1–C11 |
| web #10 イベント新用户空状态 | ✓ | URL 输入 → 契约 8 create | 近似：行高 1.1；缺：行高 1.7, 阴影；间距刻度外 10 项 → C1–C11 |
| web #11 イベント少量数据 | 误报（每行各自数字） | URL 输入 → 契约 8 create；🎤=活动 emoji（`event-emoji.ts`），非语音 | 近似：行高 1.1；缺：字距 -0.02, 阴影；间距刻度外 9 项 → C1–C11 |
| web #12 イベント大量数据 | 误报（每行各自数字） | URL 输入 → 契约 8 create；🎤=活动 emoji（`event-emoji.ts`），非语音 | 近似：行高 1.1；缺：字距 -0.02, 阴影；间距刻度外 9 项 → C1–C11 |
| web #23 イベント大量数据 | 误报（每行各自数字） | URL 输入 → 契约 8 create；🎤=活动 emoji（`event-emoji.ts`），非语音 | 近似：行高 1.1；缺：字距 -0.02, 阴影；间距刻度外 9 项 → C1–C11 |
| b8-responsive #0 イベント · 1024大量数据 | 误报（每行各自数字） | URL 输入 → 契约 8 create；🎤=活动 emoji（`event-emoji.ts`），非语音 | 近似：行高 1.1；缺：阴影；间距刻度外 7 项 → C1–C11 |
| b8-responsive #1 イベント · 390大量数据 | ✓ | URL 输入 → 契约 8 create；🎤=活动 emoji（`event-emoji.ts`），非语音 | 近似：行高 1.1；缺：阴影；间距刻度外 6 项 → C1–C11 |
| b8-responsive #2 イベント · 1024 评估详情抽屉弹层 | 误报（每行各自数字） | URL 输入 → 契约 8 create；🎤=活动 emoji（`event-emoji.ts`），非语音 | 近似：行高 1.1；缺：字距 -0.02, 阴影；间距刻度外 8 项 → C1–C11 |
| b8-responsive #3 イベント · 390新用户空状态 | ✓ | URL 输入 → 契约 8 create | 近似：行高 1.1；缺：阴影；间距刻度外 6 项 → C1–C11 |
| b8-responsive #4 イベント評価結果 · 1024 单页大量数据 | ✓ | 无 | 近似：行高 1.1, 行高 1.55；缺：字距 -0.02；间距刻度外 5 项 → C1–C11 |
| b8-responsive #5 イベント評価結果 · 390 全屏大量数据 | ✓ | 无 | 近似：行高 1.1, 行高 1.55；缺：圆角 26, 字距 -0.02, 字距 0.01；间距刻度外 6 项 → C1–C11 |
| b8-responsive #17 イベント · 390大量数据 | ✓ | URL 输入 → 契约 8 create；🎤=活动 emoji（`event-emoji.ts`），非语音 | 近似：行高 1.1；缺：阴影；间距刻度外 6 项 → C1–C11 |
| b8-responsive #19 イベント評価結果 · 390大量数据 | ✓ | 无 | 近似：行高 1.1, 行高 1.55；缺：圆角 26, 字距 -0.02, 字距 0.01；间距刻度外 6 项 → C1–C11 |
| b2-events-flow #0 ① ログインが必要 (URL)错误态 | ✓ | 输入 → 对应契约字段 | 近似：无；缺：字距 0.01, 阴影；间距刻度外 7 项 → C1–C11 |
| b2-events-flow #1 ② イベントページではない错误态 | ✓ | 输入 → 对应契约字段 | 近似：行高 1.1；缺：字距 0.01；间距刻度外 7 项 → C1–C11 |
| b2-events-flow #2 ③ ポスター不鮮明 → 3項目を補う信息不足 | ✓ | 补 3 项 → 契约 8 PATCH facts | 近似：无；缺：字号 8, 字距 0.01, 字距 0.1, 行高 1.2, 阴影；间距刻度外 7 项 → C1–C11 |
| b2-events-flow #3 ④ 補完後の判定 | ✓ | 无 | 近似：行高 1.1；缺：字距 -0.02, 字距 0.01；间距刻度外 8 项 → C1–C11 |
| b2-events-flow #4 Web ① URL 読み取り失敗错误态 | ✓ | URL 输入 → 契约 8 create | 近似：行高 1.1；缺：阴影；间距刻度外 10 项 → C1–C11 |
| b2-events-flow #5 Web ② ポスター補完信息不足 | ✓ | 补 3 项 → 契约 8 PATCH facts | 近似：行高 1.1；缺：字号 8, 字距 -0.01, 字距 0.1, 行高 1.2, 阴影；间距刻度外 9 项 → C1–C11 |

### 必需证据子表

| SC | 子断言 | 证据 |
| --- | --- | --- |
| 02–05 | 真实验证（A1 授权后）：connpass / Peatix / 官网各 1 个 URL、模糊海报 1 张、会员页 1 个；每次的耗时、token、结果、账本行 | REPORT「真实 AI」节 |
| P01–P12 | 门禁总表：画面 × 宽度 × 主题的 raw、超阈值带数、归因、证据目录 `~/orbit-sprint-evidence/redesign/R26/run-01/` | REPORT |
| 全部 | 三语、`copy:qa` 0；两端全量零新增失败；`tsc`、`typecheck:app`、`lint`；`detect-changes` | 全量清单 |

## 执行顺序

1. 索引、impact；token 补齐（C 组）；契约（先写 App 宽进）提交。
2. 迁移 + 纯函数（RED 先行）→ 评估服务（mock / 规则路径）→ URL 抓取与页面抽取 → E1 / E2 provider（等 A1 授权前只跑 fixture）。
3. `events/mine` → 计划接线（live 事实、推荐行、今日のチャンス、R24-06 小项）→ 代签计分 → R12 / R16 换取数。
4. 两端一级页、評価、結果、异常态（边写边比，`--only` + `--style-diff`）→ 参加予定（等 B2）→ 参加コード（等 B6）。
5. 删旧屏、登记路由；计划页重比（SC-R26-13）。
6. 全量、REPORT、`detect-changes`、提交推送；独立复核 → 修复 → 模拟器走查。

## 失败与交接

- A1 未授权：E1 / E2 只走 fixture；live 下按 G18 隐藏评估卡的 URL / 海报两个入口（服务端仍防御性返回 `ai_unavailable`），只留「3 项手入力」与库内活动的规则评分，**不新造文案**（复核 M11，与 DESIGN §10 A1 一致）。REPORT 写明。
- B 组画板未到：对应画面按规则 11 暂缓，登记交接表（R26 节）重比清单，不耗轮次。
- 交接给 R27：`event_assessments` / `scoreEvent` 区间 / `events-mine` / `event-emoji` 的用法；未登录详情、探す内容、旧屏其余路由。
- 交接给 R10：`events/mine?range=upcoming&limit=1` 的形状与 mock。
- 交接给 R18：活动偏好设置界面（`eventPreferences`，现只用缺省值）。
- 交接给 R13：`event_pick` 通知由 R26 重算任务写入（SC-R26-16），形状按契约 6。
- 设计稿示例 fixture：`features/events/design-fixtures/` + 非生产 `route.dev.ts`，经同一 schema 解析，生产构建不收录（测试守住）。
