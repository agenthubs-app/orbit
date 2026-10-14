# 活动（R26、R27）文档 — REVIEW（独立复核）

**复核人：** 独立 AI 复核会话（没有参与写作），2026-10-14。
**对象：** `events/DESIGN.md`（版本 1）、`R26-events-assessment-and-plan/{GOAL,PLANNER}.md`、`R27-events-journey/{GOAL,PLANNER}.md`。
**依据：** README（通用规则 11 / 12、功能登记表）、HOW-TO §0 / §8 / §9 / §10、HANDOFF「通用口径」G01–G26、「R26 / R27 活动」、R24-06 / 06b / 06c / 08 / 09、「R30」；决定表 `maintenance/2026-10-12-decisions.md`（D33、D45 / D46、D53、§20）；`plan-v2.2/DESIGN.md` §4 / §5.3；代码 `repos/orbits` @ `f850ad659`；`compare-redesign.mjs --list`（b2、web、app、b8、b3、b4、b6、b10、b11、b12）与 `--extract-board` 抽查。
**说明：** 只读复核，只写本文件；没有连库、没有调用付费 AI。

## 结论：有条件通过

做得好的地方（已独立核实）：
- **代码事实大多属实**。抽查 16 处 file:line，下面这些都对：契约 8 各类型行号（:2 / :12 / :21 / :34 / :50 / :60）；`event-score.ts` :10–13 / :15 / :32 / :95；`plans/v2/service.ts` :194 / :196 / :197 / :931 / :951 / :983；`event-facts.ts:31`；`overview.ts:150` / :247；`v2/service-factory.ts:82` / :92；`event-operations/service.ts:479` / :515（`kind: "staff"`）；`runtime.ts:68-71`；`event-attribution-runtime.ts:74` / :106；`network-analysis/migrations.ts` v3 CHECK 含 `event_assessment`；`ai-quota/constants.ts` `event_assessment: 2`、池 `user`；`events/page.tsx:27` `Date.now()`；`live-event-value-service.ts:244` / :343；`live-service.ts:435`；`PlanOverview.tsx:652` D53 占位。不准的几处见 m1。
- **画板序号全部正确**：b2 #0–#48（深色 #43–#48）、`web.html` #10–12 / #23、`app.html` #13–15 / #30 / #31 / #37、`b8` #0–5 / #17 / #19、`b3` #42 与 `--list` 一致。B1（`app.html` #13、`b8` #3、`b2` #6 仍写「招待コード」）、B3（`b2` #34「双方のカレンダーに入ります」）都抽板确认属实。
- **HANDOFF 映射基本齐全**：R26-01 → SC-R26-01；R26-02 → SC-R26-11 / SC-R27-06；R26-03 / 05 → SC-R26-07；R26-04 → SC-R26-09；R26-06 / 07 → SC-R26-10；R26-09 → SC-R26-12 / SC-R27-08；R24-06 → SC-R26-08；R24-06b / 06c（连同 R24-09 清缓存）→ SC-R26-13；R24-08 口径单独标注。R26-08 只认领了一半，见 M10。
- **用户决定没有被违反**：D33、D46（含 B3 重画）、D53 都写对了；邮件止于草稿、不录全场也都写到了。

但有 **2 条严重、11 条中等**问题：
- **S1**：外部活动「建私有活动」所依赖的列在代码里不存在。按现有表去落，要么泄露给全工作区，要么计划页读不到。
- **S2**：「R27 不新增 AI 调用」不成立。会後的逐人提案、お礼下書き、自己紹介下書き，现有 AI 都不产出。

**条件：** S1、S2、M1–M6 在 R26 开工前改 DESIGN 和 R26 PLANNER（契约第一天就要提交，会受影响）。M7–M11 在各自 Sprint 开工前补齐。m 级执行时顺手处理。

## 问题清单

### 严重

**S1 外部活动「私有活动」的存储方案不成立，隐私和计划接线两头都会出问题**
- **位置**：DESIGN §2.1「参加予定に追加」、§9 #7、§6.2-1；R26 PLANNER「接口」add-to-plan 行、测试「外部私有、不出现在他人列表」。
- **问题**：
  - DESIGN 写「`events` 现有 `capture_method = 'manual_form'`，`origin = 'assessment'`，不公开」。这几样代码里都没有：
    - `captureMethod` 只是契约字段，由 `eventCaptureMethodForSourceType(record.source.type)` 推出来（`event-crud-and-import/live-service.ts:138`）；
    - `origin` 是对象 `EventOriginContract`，不是一个可以写 `'assessment'` 的列；
    - 库内活动的正式表是 `event_ops_events`（`event-operations/storage/migrations.ts:20`），它没有可见性列。
  - `event_ops_events` 要求 `organizer_actor_id not null`，状态只有 `lifecycle_state_v2 in ('draft','published','cancelled','archived')`（:940–943）。所以只剩两条路，都不行：
    - 写成 `published`：这场活动会进公开目录。名片活动归属窗口（`start-window.ts:33-36`）会读到它，别人的名片可能被归到我的私有活动上；它还会进其他人计划的 live 事实，也会进探す。
    - 写成 `draft`：`livePlanEventFacts` 与归属窗口只读 `published`，计划页就看不到这场活动，SC-R26-07 的「外部活动用评估记录的事实」没法实现。
    - 两种写法都会让用户成为这场活动的「主办方」，在 R17 主催中心里出现，并拿到主办权限。
- **依据**：上面引用的代码；DESIGN §9 #9 / #14 的隐私承诺；PLANNER 易错边界「外部活动……在别人的探す里出现」。
- **建议**：
  - 在 DESIGN §3.1 写明真实存储，二选一：
    - (a) 外部活动不进 `event_ops_events`，计划用 `plan_items` 引用 `assessment:<id>`，live 事实另开一路「我的外部评估」读取（推荐；对标 TripIt / Google Calendar 的私有条目不进公共目录）；
    - (b) 新增可见性列（`visibility = 'private_owner'`，迁移进 `event-assessments-core` 或单独一版），并逐个列出所有 `lifecycle_state_v2 = 'published'` 的读取方要怎样排除它：`start-window.ts`、`event-analytics/snapshot.ts`、`canonical-registration-repository.ts`、`postgres-repository.ts`、`canonical-post-event-reminder-source.ts`，以及公开目录。
  - 测试补一条：名片归属与他人计划事实读不到私有外部活动。

**S2 「R27 没有新增 AI 调用」与现有能力不符，付费 AI 清单漏项**
- **位置**：DESIGN §2.4「自己紹介」、§2.5「30秒の自己紹介『AI 下書きを確認済み』：取参加登録时现有 AI 生成的……不新增调用」、§2.7、§5 表 R27 两行；R27 PLANNER SC-R27-10「不新增调用」。
- **问题**：
  - 现有会后 AI 产物 `AttendeePostEventAiArtifact`（`post-event-artifact/contract.ts:8-18`）只有一段 `summary` 和一封 `messageDraft`。设计稿要的是：
    - 「今日のまとめ」3 条，每条带依据；
    - 「次の一手 · N名分」，每人一份お礼下書き + フォロー日 + 🎯 计划人物类型。
    这些都不是现有输出。
  - 「自己紹介」在 `features/events` 和契约里搜不到，现有报名 AI 不生成它（只有 `question-generator.ts` 里的问题选项）。
  - 要做出画板上的这些画面，只有两条路：改现有提示词和输出（这算变更付费调用，DESIGN 自己写了「不改提示词」），或者新增调用。两条都要列进 §5 和 §11，并请用户授权。
- **依据**：用户决定「只上报付费 AI / 生产 / 部署 / 真产品取舍」，付费 AI 必须逐项授权（plan-v2.2 §5.4 口径）。
- **建议**：
  - §5 把 R27 改成「有变更 / 新增」：E3 会後逐人提案（含お礼下書き、🎯 类型建议）、E4 参加用自己紹介下書き。每项写清模型、输入输出、每次几次调用、月上限、账本用途。
  - 把这两项并进 §10 A5，或单列 A6 请用户拍板。
  - 用户不同意时：「次の一手」改成规则（跟进日 = +2 天，类型 = 联系人已有类型），お礼只留现有一封 `messageDraft`，并相应改画板。

### 中等

**M1 契约 8 的事实怎样变成 `scoreEvent` 的输入，没有定义**
- **位置**：DESIGN §3.1 `facts`、§4.1 `Facts` 只加、§3.5 `event-facts-derive.ts`；R26 PLANNER SC-R26-02。
- **问题**：
  - `EventScoreFacts`（`event-score.ts:43-59`）要的输入是：每类人的 `expected`、`attendeeSource`、数字 `fee`、`travelMinutes`、`timeslot`、`firstDegree` / `secondDegree`、`networkingMinutes`、`nameTags`、`matching`、`exchangeCorner`。
  - 契约 8 只加了 `speakers`、`exhibitorCount`、`format { networking, tableTalk, matching }`、字符串 `price`。中间缺几样：
    - `networkingMinutes`、`nameTags`、`exchangeCorner` 没有对应字段；
    - `price` 字符串怎样解析成日元，没有写；
    - 外部活动的登壇者 / 展示社按什么规则分到计划人物类型、得出 `expected`，没有写——这一步若交给 AI，就等于 AI 参与打分，违反「AI 只填事实」；
    - 用户同时有 2 个目标时用哪份计划的类型，`addEventToPlan` 的 `planId` 又怎么选，也没有写。
- **建议**：DESIGN §3.5 加一张「契约事实 → `EventScoreFacts`」映射表，写明每项是规则推导还是 AI 读取，以及对应的纯函数（例如 `event-attendee-typing.ts`，复用计划的人物类型匹配规则）。多目标时，推荐按「最近打开的目标」，结果页写明是对哪个目标判定的。

**M2 区间判定与计划页判定会不一致；`score_breakdown` 的来源写错**
- **问题**：
  - §9 #4 规定「判定按区间下限是否 ≥ 阈值」，而计划页 `eventsFor` 用的是 `eventVerdict(total)`（`event-score.ts:135`），`total` 在费用缺失时取的是中值（fee 记 4 / 8）。同一活动可能在评估页显示「条件付き」、在计划页显示「おすすめ」，和 SC-R26-07「三处一致」冲突。
  - §3.1 写 `score_breakdown` =「`scoreEvent` 的 5 项结果（含 estimated、facts[]）」，但 `scoreEvent` 只返回 `{criterion, score, max, estimated}`。依据文字由 `overview.ts:140-143` 的 `eventScoreView` 生成。
- **建议**：判定口径统一。要么全部用 `total`，要么把「按下限判定」放进 `scoreEvent` 的区间输出，计划页也照用。评估结果的 `reason` / `facts[]` 复用 `eventScoreView`。

**M3 月上限的形状和计数口径与现有配额代码不合**
- **问题**：
  - `AI_QUOTA_MONTHLY_LIMITS` 的类型是 `Partial<Record<AiQuotaPurpose, number>>`（`ai-quota/constants.ts:82`），DESIGN 写的 `{ free: 10, paid: null }` 放不进去。产品里也还没有付费档的判定（plan-v2.2 Q6「所有人按 Free」）。
  - `event_assessment` 走 `user` 池，会占 `USER_POOL_DAILY_LIMIT = 10` 的总熔断。一天评估 5 场就会挡住其他 AI 功能。DESIGN 没说是否像 `PLAN_FLOW_DAILY_LIMIT` 那样单独计数。
  - 超限复用 `ai_unavailable`，§9 #22 的超限文案就没法区分。
- **建议**：写成 `event_assessment: 10`，去掉「付费不限」或列进 A1；写明是否占 10 次总熔断（推荐不占，并补一个日上限）；`failure_reason` 加 `quota_exceeded`。

**M4 E2 的调用次数和耗时超过现有预算**
- **问题**：
  - 名片 vision 管线本身就是两段：先用 vision 转录，再用文本模型结构化（`deepseek-business-card-ocr-provider.ts:15-22`），单张约 25 秒。
  - 「一次评估合计 ≤2 次（含修复）」装不下「两段 + 修复」，`max_calls: 2` 会把修复挡掉。Web 多张截图更会成倍增加。
- **建议**：写明 E2 的调用结构（例如一次 vision 直接输出字段，或 `max_calls` 调到 3，或多张图合并成一次请求），以及张数上限（推荐 ≤3）和总超时。

**M5 异步评估由谁跑完，没有定义**
- **位置**：R26 PLANNER「先返回 `reading`，完成后 `ready / needs_input / failed`」。
- **问题**：抓取 5 秒 + E1 / E2（单张 25 秒以上）+ 修复，靠什么跑完没有写：请求内 `after()`、任务表加 worker（类似 `post-event-artifact/task-repository.ts`），还是 event-ops 的 wake。另外也没写：
  - 卡在 `reading` 的记录怎样回收；
  - 客户端怎样轮询；
  - 同一幂等键在 `reading` 中途重试时怎么处理。
- **建议**：DESIGN §5 加「执行方式」一节，推荐复用 post-event artifact 的任务表 + 处理器模式。补卡死超时（例如 2 分钟转 `failed / fetch_failed`）和轮询间隔，并补对应测试。

**M6 `livePlanEventFacts` 现在没有 actor，按 DESIGN 的范围实现不了**
- **问题**：
  - 现有函数不收 actor（`v2/service-factory.ts:92` `livePlanEventFacts()`），读取方只取 `published` 三列。DESIGN 要的范围是「库内公开 + 我报名的 + 我的外部活动」，`firstDegree`（报名者 ∩ 我的联系人）也和 actor 有关。
  - 「按活动短缓存」写的是 `facts_refreshed_at`，可这一列在 `event_assessments` 上，是按 actor 存的。缓存的键和作废条件互相矛盾。
  - 「≤20 场」先取公开活动再截断，可能把我报名的活动截掉。
- **建议**：写明新签名（`livePlanEventFacts({ actorId, workspaceId })`）和合并顺序（我的活动优先，再补公开活动到 20 场）。把缓存拆成两层：活动级的事实（报名者构成、费用、形式）按活动缓存；人级的事实（一度、类型匹配）每次现算。

**M7 代签计分没有兜底：「对账任务覆盖代签」这条事实写错了**
- **位置**：DESIGN §6.3 第 3 点；R26 PLANNER 事实 4。
- **问题**：`event-attendance-reconcile.ts:88-96` 的 v2 待补列表来自 `listUnscoredAttributedEventsV2`（`matching-repository.ts:792`），数据源是联系人的 `metEventId`，不读签到记录。所以代签调用失败后，没有任何东西会补记。
- **建议**：二选一并补测试：
  - 对账任务加一路「已签到（含 `kind = staff`）但没有 `score_awarded`」；
  - 或在代签同一事务里写待办表。
- 同时改正 DESIGN 里这句事实。

**M8 「重算 + 通知」承诺了，却没有 Sprint 认领**
- **问题**：
  - `b8` #4 画着「参加者リストが公開されたら再計算し、お知らせします」；§9 #6 写「名单变化后重算」；§6.4 写 `event_pick` 由「R26 的重算任务」触发。可 R26 PLANNER 的范围、文件、测试里都没有重算任务。
  - R27 要产生的 `event_deadline` / `event_prep` 通知也只出现在「交接」里，没有 SC。
- **建议**：R26 加 SC，写明重算任务的位置、频率、有界读取，以及分数变化 ≥10 时写入通知来源；R27 加 SC 写两种通知怎样产生。如果决定不做，就请设计稿会话改 `b8` #4 的文案。

**M9 像素 SC 漏了 App 计划页上的活动画面，另缺一个预检**
- **问题**：
  - R26-03 要求「概要、类型详情、内訳都显示」活动，但下面这些 App 画板不在任何 `app-plan-*.json` 里，R26 PLANNER 也只重比 A-R24-01 / 04：
    - `app.html` #22、#25（概要 · イベント 段）；
    - `app.html` #27 / #28（人物タイプ詳細 · 会える活動）；
    - `b10` #33（App 会える活動 · 内訳）。
  - R27 预检表缺 `b3` #42（参加の取り消し）。HOW-TO §8 要求每个画面都有预检。
- **建议**：SC-R26-13 / P12 补这几块画板（或写明它们已归某个 A-R24 画面，并给出 view id）。R27 预检表补 `b3` #42。

**M10 交接表 R26-08 只认领了一半，R30 的依赖写法不一致**
- **问题**：
  - R26-08 原文是「未登录活动**列表** / 详情公开顶栏」，DESIGN / R27 只做了详情和报名入口，未登录的列表（`/app/events` 或公开目录）没有归属。
  - 交接表 R30-01 和 README R30 行写「依赖活动的搜索接口（R26）」，DESIGN 把 `event-search` 放在 R27。
- **建议**：R27 补未登录列表的 SC，或写明「列表不对未登录开放、跳登录」并对标；同步改交接表 R30-01 和 README R30 行的依赖为 R27。

**M11 A1 不同意时的退路，DESIGN 和 PLANNER 写法不同，PLANNER 的写法偏离画板**
- **问题**：
  - DESIGN §10 A1 写的是隐藏 URL / 海报入口，并请用户同意改画板。
  - R26 PLANNER「失败与交接」写的是 live 下返回 `ai_unavailable`，界面出「3項目で簡易判定」。这个文案和状态任何画板上都没有，违反通用规则 11「偏离先请用户拍板」。
- **建议**：统一成一种写法。推荐授权前 live 按 G18 隐藏评估卡里的 URL / 海报两项（属于「没有能力就隐藏」），不新造文案。

### 轻微

- **m1 行号与措辞**：
  - `redesign-contracts/service-factory.ts:28` 应为 :29；
  - `livePlanEventFacts` 在 :44（:42 是注释）；
  - `registered-event-access.ts:139-150` 返回的是 `FORBIDDEN`（`active-event-registration-required`），`EVENT_OPERATIONS_FORBIDDEN` 来自 `event-operations/service.ts:284-308`，DESIGN §1.1 第 6 条把两者混成了一处。
- **m2 `eventPreferences` 字段名与代码不同**：代码是 `maxFee` / `weekdayEvening`（`event-score.ts:22-32`），DESIGN 写 `maxFeeYen` / `weekdayEveningOk`。建议沿用代码名。既然不做设置界面，也说明为什么还要建这个集合。
- **m3 SSRF 细节**：
  - 拒绝的地址段建议逐条列出：0.0.0.0/8、100.64/10、198.18/15、组播、`fc00::/7`、`fe80::/10`、`64:ff9b::/96`、`2002::/16`；
  - 2 MB 上限按解压后的字节算；
  - §9 #23「全局按主机每分钟 ≤30」在 serverless 下需要共享存储，测试也没覆盖；
  - 限速应该返回 429，不该写成 `failure_reason`；`content-type` 不符时用哪个原因码也要写明。
- **m4 「見送る」前后矛盾**：§2.1 同一段先说「以后探す不再推荐同一活动」，又说「只针对这次判定」。需要定下其中一种。
- **m5 状态枚举对不上**：
  - `events-mine` 的 `status` 没覆盖 membership 的 `waitlisted` / `rejected` / `withdrawn`（`migrations.ts:1056`）；
  - 公開範囲「主催者のみ」对应现有 `visibility in ('event_attendees','matching_only')`（:917）中的哪一个，要写明。
- **m6 README 功能登记表还没有 R26 / R27 行**，两个 GOAL 的「状态见登记表」链接现在落空。
- **m7 B5 的「会場モードは App で」是产品取舍**，不只是补画。按 HOW-TO §8「设计稿无先请用户拍板」，建议移到 A 组。§10 B6 缺对标。
- **m8 R27 GOAL 写了「工作人员代签一次」**，但代签界面归 R17。应写明验收时用现有运营接口或 fixture 触发。
- **m9 `/live` 页把 `new Date()` 当 `now` 传入**（R27 事实 4），水合风险只列在易错边界里，没有 SC。建议并进 SC-R27-08。
- **m10 设计稿示例 fixture 放在哪里没写**：建议照计划页的 `design-fixtures` + `route.dev.ts` 写法，并要求生产构建不收录。P01「新账号」的到达方式要写成可复现的步骤。

## 处理记录（2026-10-14，写作会话）

全部采纳，DESIGN 升版本 2，R26 / R27 PLANNER 升 rev 2。

| # | 处理 |
| --- | --- |
| S1 | 采用建议 (a)：外部活动不进 `event_ops_events`，评估记录即外部活动，计划引用 `assessment:<id>`（开工核实 `plan_items.linked_event_id` 无外键，有则加 `linked_assessment_id`）。live 事实另开「我的外部评估」一路，只对本人；R26 新增 SC-R26-17 与 `external-assessment-privacy` 测试（覆盖五个读取方）。DESIGN §2.1、§3.1、§6.1、§9 #7 已改 |
| S2 | §5 改为「R27 变更两个现有付费调用」：E3 会後逐人提案（新输出 schema，`messageDraft` 保留兼容）、E4 自己紹介下書き；新增 §10 A6 请用户授权，并写明不授权时的规则退路（界面不出现「AI 下書き」）。§2.5 / §2.7、§11、R27 SC-R27-10、R27 GOAL 同步 |
| M1 | §3.5 加「契约事实 → `EventScoreFacts`」映射表、`event-score-input.ts`（含 `parsePriceYen`）、`event-attendee-typing.ts`（规则，复用候补规则层）；多目标对当前目标判定并在结果页写明 |
| M2 | 判定统一用 `eventVerdict(total)`，区间只显示；`score_breakdown` 依据复用 `eventScoreView` |
| M3 | 月上限写成 `event_assessment: 10`（付费档上线再加）；单独日上限 5、不占 user 池总熔断；新增 `quota_exceeded` |
| M4 | E2 按两段结构写明；≤3 张合并成一次请求；`max_calls` 调到 3；总超时 90 秒 |
| M5 | DESIGN §5 加「执行方式」：记录兼任务行（`lease_until` / `attempts`）、`after()` + cron 兜底、2 分钟回收为 `timeout` 并退额度、2 秒轮询 90 秒、同键重试不重复入队；PLANNER 加 `assessment-job` 测试 |
| M6 | `livePlanEventFacts({ workspaceId, actorId })` 新签名、合并顺序（我的优先）、两层缓存（活动级进程 LRU / 人级现算） |
| M7 | 改正对账任务事实；对账加「已签到（含代签）未记分」一路，并补测试 |
| M8 | 新增 DESIGN §6.5 重算任务（R26，SC-R26-16，写 `event_pick`）；R27 加 SC-R27-13（`event_deadline` / `event_prep`） |
| M9 | SC-R26-13 / P12 补 `app.html` #22 / #25 / #27 / #28、`b10` #33（先查是否已归某个 A-R24 画面）；R27 预检表补 `b3` #42（实跑：自洽 ✓、无疑似无功能、缺字距 0.01 / 阴影） |
| M10 | 未登录列表归 R27（SC-R27-05，公开目录、无个性化块，B4 补画含列表）；交接表 R30-01、README R30 行依赖改为 R27 |
| M11 | 统一为 G18 隐藏 URL / 海报入口、不新造文案（DESIGN §10 A1 与 R26 PLANNER 一致） |
| m1 | 行号 :29 / :44 改正；`FORBIDDEN` 与 `EVENT_OPERATIONS_FORBIDDEN` 分开写 |
| m2 | 偏好字段名沿用代码；写明保留集合的理由（`homeArea`，R18 复用） |
| m3 | 地址段逐条列出；2 MB 按解压后算；限速回 429；各原因码对应写明；主机级限速用 Postgres 限流表（同 R15） |
| m4 | 見送る只作用于评估记录、不影响探す |
| m5 | `events-mine` 状态加 `waitlisted` / `rejected`，`withdrawn` 归 `cancelled`；公開範囲对应 `event_attendees` / `matching_only` |
| m6 | README 功能登记表加 R26 / R27 行（「文档完成、已复核，待实施」）与 DESIGN / REVIEW 链接 |
| m7 | Web 会場 390 移到 §10 A7（产品取舍）；B6 补对标 |
| m8 | R27 GOAL 改为「代签界面属 R17，用现有运营接口触发」；SC-R26-09 同步 |
| m9 | `/live` 水合并进 SC-R27-08 |
| m10 | DESIGN §8 写明 `features/events/design-fixtures/` + `route.dev.ts`、生产不收录；P01 改为种子空账号 `qa-empty@orbit.test` |
