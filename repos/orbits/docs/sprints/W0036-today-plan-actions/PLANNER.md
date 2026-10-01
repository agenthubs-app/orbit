# Sprint W0036 — 今日要事吸收计划行动与补人脉，抽出共享推荐活动池

**Plan revision:** 3（2026-10-01 按 [REVIEW-2026-10-01](../REVIEW-2026-10-01.md) 修订，见文末修订记录；revision 2 写入 D38 决定）。**模式:** existing-codebase / single-generator。运行状态只在登记表。
**原需求:** RH-02 全部；RH-03 的「推荐活动池」部分（只建池并在首页算出来，不渲染活动小模组——那是 W0037；月历圆点是 W0038）。
**单一目标:** 首页「今日要事」在原有来源之后补入本周计划行动（≤2）与补人脉提示，总共只补到前 3 条；可勾掉、今天先不做、点标题跳转；导语按第一条拼接；首页内算出共享的 `eventPool`。
**易读目标:** [GOAL.md](GOAL.md)。
**基线:** 开工时的 `chat-agent` HEAD（编制时 `08fe51db`，GitNexus 索引同为 `08fe51d`）。W0035 会先改 `iorbit-home.tsx`（删第 4 步提醒、`guideStep4Pending`）和 `page.tsx`，下文行号以 `08fe51db` 为准，开工时按符号重新定位。
**进入条件:**
- W0035 已合并回 `chat-agent`（登记表依赖）。
- W36-1～W36-5 用户已于 2026-10-01 决定（D38），见下表「已定决定」；W0035 移交的 W35-3（`active-registration.ts` 删否）也在表中定下。
- 不需要云端授权、不调用付费 AI、不做迁移。
- **D39 已定（用户 2026-10-01，README 已登记）：**D20 用户路径数据库总账上限由 1.2 GB 放宽到 **1.6 GB**，无目标兜底照做，上线后由 D32 周检盯；SC-06 以 1.6 GB 为判定线，超过仍须在 REPORT 登记。

## 已查清的事实（按 `08fe51db` 源码）

1. **首页的计划数据已经在客户端。** `iorbit-home.tsx:378–388` 用 `fetchCurrentPlan(signal, { view: "home" })` 读一次（`iorbit-plan-client.ts` 的 `sharedRead`，W0021 冷启动最多 1 次），存进 `planState`；第 333 行示例期 `plan = null`（示例首页不读也不显示计划，本周推进走示例账本）。今日要事 `items`（`useMemo`，第 622–769 行）现在的来源顺序：2 小时内日程 → critical/high 信号 → 名片待确认（`usePendingCards`）→ 人脉匹配（`fetchPlanMatches`）→ 其余信号 → 跟进队列；**没有总数上限**，前 3 条显示（`VISIBLE_ITEMS = 3`，第 89 行），其余「还有 N 件」原地展开（第 1117–1128 行）。
2. **本周行动与拖期。** `features/plans/week.ts:130 planWeekActions(items, currentWeek)` = `kind === "action"`、`suggestedWeek ≤ currentWeek`、未完成；`planWeeksOverdue(item, currentWeek)`（第 122 行）= `currentWeek − suggestedWeek`，本周推进显示的「已延后 N 周」就是它（`iorbit-home.tsx` 本周推进列表、`iorbit-plan.tsx:632`）。`deferral_count` 是手动「推迟到下周」的计次，推迟时 `suggestedWeek` 同时后移（`features/plans/service.ts:277`），所以被手动推迟的行动不算拖期。**口径：「已顺延 N 周」取 `planWeeksOverdue`**，与本周推进、计划页同一来源；不用 `deferralCount`。当前周 `planWeekState(snapshot.plan, now).currentWeek`（`week.ts:88`，东京日、以 `starts_on` 为第 1 周）。
   - 本周推进的排序 `comparePlanWeekActions`（`week.ts:113`）是「本周的在前、拖期的在后」，与 RH-02「拖期优先」相反，所以今日要事需要一个**新的纯函数**排序，不能直接复用 `buildPlanWeekSummary` 的前 3 条（`plan-route-view-model.ts:587–608`，`PLAN_HOME_ACTION_LIMIT = 3` 在第 582 行）。两处显示同一批条目、同一份 `planState`，顺序可以不同。
   - 阶段名：`item.phaseKey` → `snapshot.plan.phases` 中同 key 的下标 + 1 与 `title`（与 `planEventReasons` 同法，`plan-route-view-model.ts:628–655`）；`phaseKey` 为 null 时退回当前阶段 `planWeekState(...).phaseIndex`；计划没有阶段时只写「本周计划」。
3. **勾掉复用现有写接口。** `patchPlanActionDone(itemId, done)`（`iorbit-plan-client.ts`）→ `PATCH /api/agent/plans/items/:itemId`（`app/api/agent/plans/items/[itemId]/route.ts`，`set_status`，带幂等键，写后 `invalidatePlanReads()`）。首页已有的 `togglePlanAction`（`iorbit-home.tsx:790–814`）做乐观更新：先 `withActionDone` 改 `planState`，成功换成服务端条目，失败只把这一条回滚并设 `planError`；同时把 id 放进 `planSticky`（本周推进里暂留已勾行）；`planBusyId` 非空时拒绝第二次点击。今日要事的勾掉**直接调用 `togglePlanAction(id, true)`**，同一状态源，本周推进自动同步；勾掉成功后该行因 `planWeekActions` 排除已完成而从今日要事消失。`planError` 目前只在本周推进列显示（第 1304 行），今日要事需要同时显示。
4. **点标题跳转。** 联系人：`/app/contacts/{id}`（计划页同用，`iorbit-plan.tsx:713`），取 `item.linkedContactIds[0]`，没有时取匹配行动的 `meta.contactId`（`PLAN_MATCH_ACTION_SOURCE`，`plan-route-view-model.ts` `toAction`）。活动：`/app/events/{linkedEventId}`（计划页同用 canonical id，`iorbit-plan.tsx:751`）。都没有时去计划页并定位：**计划页目前没有条目锚点**，只有 `data-orbit-plan-action={id}`（`iorbit-plan.tsx:617`，本周列表）；本周列表正是 `planWeekActions` 的全部结果（`plan-route-view-model.ts:434`，无截断），计划页服务端首帧就渲染计划（`agent/plan/page.tsx`），所以给这一行加 `id="plan-action-<id>"` 后 `/app/agent/plan#plan-action-<id>` 由浏览器原生定位；顶栏遮挡用样式文件里的 `scroll-margin-top`，不写内联。
5. **「今天先不做」。** 客户端账号来自 `useSharedReadAccount()`（`orbit-shared-read-account.ts`，即 next-auth `session.user.id`；名片登记表按它分 key，`card-batch-store.ts:100–113` 是先例）。东京日期用首页已有的 `todayKey`（`iorbitDayKey(now)`，每分钟随时钟刷新，跨午夜自动换 key）。设计：key `orbit.today.skip.v1:<account>:<YYYY-MM-DD>`，值是计划条目 id 的 JSON 数组；写入时顺手删同账号其他日期的 key；所有读写包 try/catch；只在 effect 里读（`IOrbitHome` 会被 SSR，渲染期不碰 `localStorage`；计划行动本来就要等客户端读到计划才出现，没有首帧闪烁）。**账号未知只以 `account === null` 判定**（会话 loading、未登录时 hook 都返回 `null`），这时只在本页内存里隐藏，不读不写存储。**不承诺「无 SessionProvider 即未知」：**`useSharedReadAccount()`（`orbit-shared-read-account.ts:26`）在没有 context 时返回 `{ account: getSharedReadAccount(), ready: true }`，即模块单例里的账号，可能是前一账号的残留；生产 `app/(app)/app/layout.tsx` 有 `SessionProvider`，所以这只影响测试与边界。key 一律取 hook 本次返回的 `account`，账号变化时（A → B）重新读取 B 的 key、丢弃内存中 A 的隐藏集合，不得沿用。
6. **补人脉的人数不需要新读取。** `page.tsx:190` 已读 `loadAppHomeRouteViewModel`，其中 `home.stats.people = contacts.payload.ledger.knownPeople`（`home-route-view-model.tsx:160`），即本人联系人列表这一页的条数；列表默认每页 30（`contact-list-postgres-reader.ts:1176`），所以「<10」判断准确（总数 ≥10 时这一页必然 ≥10）。名片待确认的卡还不是联系人，不计入，符合「已确认」。`home` 为 null（首页数据读不到）时人数未知。示例数据 `people: 30`（`demo-persona.ts:345`）。**无新增读取，不需要流量估算。**
7. **名片上传区。** `card-batch-0918` 的状态机在 `/app/agent` 上由全站 `CardBatchHost` 运行一份（`card-batch-host.tsx:1–30`，首页不在让位列表里）；首页再挂 `CardBatchImport`/`useCardBatch` 会出现两份状态机重复上传（`use-pending-cards.ts` 头注释明确禁止）。上传区的正式入口是 `/app/contacts/new?method=scan`（`contacts/new/page.tsx`，`scan` 是默认方式，页面直接显示上传区）。**按钮导航到这个地址**，不在首页嵌上传组件。
8. **头条导语。** `iorbit-home.tsx:896–925`：周一小结优先；未就绪「正在整理…」；有要事「今天有 N 件事，最紧的是：<lead.title>。」；部分来源失败、只有日程、什么都没有各一句。新增两句（RH-02）：第一条是计划行动或补人脉时「今天可以推进一步：<title>」；没有要事、不在 partial、今天没有日程、活动池非空时「今天没有安排，<M/D> 有一场适合你的活动：<活动池第一场标题>」（RH 例句里的「沙龙」是活动类型，池里没有类型字段，不编造）。`itemsSettled`（第 879 行）目前不含计划：计划行动是要事来源，所以要加上 `plan !== "pending"`，否则导语会在计划读到后从「没有要紧的事」跳成计划行动。
9. **活动池的数据来源（不新增客户端请求，真实期不新增数据库语句）。**
   - 目标匹配：首页已有的 `refreshHomeDashboardAction()` → `loadHomeDashboardSnapshot`（`home-dashboard-route-service.ts:341–379`）每次打开首页都算了 `snapshot.recommendations`（`state` + 最多 3 条 `{eventId, publicCode, title, startsAt, venue, matchedTokens…}`），首页至今没渲染。
   - 近期可报名：`recommendWithDependencies`（`features/events/public-goal-recommendations.ts:318–398`）已经读了整份公开目录（`readRecords`：records 含 `id/title/venue/startsAt/endsAt/status`，另有 `publicCodes`、`organizerIds`）并对全部候选读了本人报名（`listMemberships`），`candidatesFromCatalogue` 已排除已开始、已取消、本人主办，`registeredEventIds` 给出已报名集合。**在同一次调用里多返回一个 `upcoming`（全部可报名候选的索引：未报名、按开始时间升序、服务端不截断）不增加任何语句。**`no_match` 有两处：候选为空时（第 347 行一带，`upcoming` 本来就是空）与打分后无命中时（第 384 行，在读完报名之后），后者直接带上 `upcoming`。
   - **服务端不截断的原因（review P1-01）：**计划点名的活动 id 只在客户端（`planState`），服务端不读计划；若服务端先截成最早 12 场，排在第 13 场以后、又不在前 3 条目标匹配里的计划活动就拿不到标题／时间／可报名资格，被静默丢掉，违背 RH-03「计划点名优先」。所以把「解析计划 id」放在截断之前：服务端给全部候选，`buildHomeEventPool` 先按「计划 → 目标 → 近期」组池，**最后**才截到 8 条。代价是 snapshot 应答体（Server Action HTTP 响应）随可报名场数线性增长；数据库语句与读出字节不变（目录本来就整份读出）。**HTTP 字节不进数据库预算**，按 W0021 SC-04 口径与数据库字节、请求次数分列（SC-W0036-07）。`refreshHomeDashboardAction()` 有两个调用方：首页（`iorbit-home.tsx:341`）和策略页（`iorbit-strategy.tsx:61–73`），两处的响应都会变大。
   - **返回体过大时的约束（备选，不改变产品结果）：**若 SC-07 测算触发阈值，改为服务端只返回前 12 场 `upcoming` 加 `upcomingTruncated: boolean`；首页在计划读到后，若有计划关联 id 既不在 `upcoming` 也不在目标匹配里且 `upcomingTruncated` 为 true，**只此一次**调用一个窄 Server Action（如 `resolveHomePlanEventsAction(eventIds: readonly string[])`，服务端按同一 `candidatesFromCatalogue` + 本人报名规则校验后返回命中项），结果并入池首。取舍：常态响应恒定、策略页不受目录增长影响；代价是罕见情况下多一次目录 + 报名读取（约 3.7 KB 数据库字节，计入数据库表）和一个新接口。没有选「计划 id 随 snapshot 请求传入」：首页的 snapshot 与计划在挂载时并行读取，等计划再发 snapshot 会推迟日程等 facts 首帧。
   - **兜底（协调者 2026-10-01 裁决：只要目录里有可报名活动，真实用户的池就不能为空）。** 现有代码有三处拿不到 `upcoming`，都要改：① `needs_goal`（第 335–345 行）在读目录**之前**返回；② 读目标抛错、目标类型不对时整体 `unavailable`（`createPublicGoalRecommendationsService` 第 402–413 行 catch 一切）；③ `copyRecommendations`（`home-dashboard-route-service.ts:303–325`）对非 `success` 一律清空。改法：服务内部分两段——**目录 + 报名**这一段独立求值得到 `upcoming`；**目标**这一段只决定 `state` 与 `items`。目标为空 → `{ state: "needs_goal", items: [], upcoming }`；读目标失败 → `{ state: "unavailable", items: [], upcoming }`；目录或报名读失败 → `upcoming: []`（这时池为空是如实的）。`copyRecommendations` 对四种状态都复制并校验 `upcoming`。
   - **新增读取（无法做到零语句）：** `success`／`no_match` 路径语句数不变；`needs_goal` 与「读目标失败」路径原来在目录前返回，现在多读一次目录（`readRecords`：`listPublishedEvents` + 参会人数汇总）和一次本人报名（`listCanonicalRegistrationsForUser`）。按 W0017 实测（目录 5 场 3,188 B，报名估约 0.5 KB），每次约 3.7 KB。只有「真实期、没设目标」的人会多读：开关打开时第 2 步（目标）未完成的人处在示例期，不走这条路径，所以主要是开关关闭时的老用户与 D2 老用户。单看这一项：无目标占 10%／20%／100% 时约 44／89／444 MB／月（每天开首页 4 次）。
   - **统一数据库预算（review P1-02、短复核）：**这一项不能单独与余量比较，必须和示例期读取（下条）、W0037 示例期社群读取合进**同一张数据库月预算表**（SC-W0036-06）。基线用最新总账 **1,106.83 MB**（W0029 REPORT 第 67 行；D27 按 D20 放宽到 1.2 GB；D39 再放宽到 1.6 GB）。按本方案估值粗算：1,106.83 + 示例期目录与报名约 37 + 示例期社群约 3（估 0.3 KB × 10 次 × 1000 人，W0037 实测）+ 无目标兜底 44／89／444 = **1,190.83／1,235.83／1,590.83 MB**（10%／20%／100%）。20% 档超过原 1.2 GB，D39 已放宽到 1.6 GB；100% 档离 1.6 GB 只剩约 9 MB。REPORT 用实测值重算；任一档超过 1.6 GB 都登记为 D32 风险，**不得为了省流量取消兜底（D38、D39）**。
   - 计划点名：`planState.items` 里 `kind === "event"` 且 `status === "recommended"`、或 `kind === "action"` 未完成且有 `linkedEventId` 的条目（与 `planEventReasons` 同一取法）；id 空间与目录一致（mock 生成器 `linkedEventId: entry.event.id`，`mock-generator.ts:567`；目录 `id: event.eventId`，`public-catalogue.ts`）。只有出现在 `upcoming`（全部可报名候选）或目标匹配里的才进池（这样才能确认仍可报名并拿到展示字段）；因为 `upcoming` 在服务端不截断，**仍可报名的计划活动不论排第几场都能进池并排在池首**（不再有「第 12 场之后不进池」的限制）。
   - 费用：目录里没有费用字段，落地页模型的 `feeLabel` 是写死的「费用以主办方说明为准」（`orbit-landing-route-view-model.ts:184`）。池里 `feeLabel` 留空，W0037 活动卡不显示费用行（W36-5）。
   - 示例期：示例首页不读 snapshot、不读计划（W0004）。RH-03 要示例首页的活动是真实的，所以示例分支在服务端（`page.tsx:173–189` 提前返回之前）读一次「近期可报名」（同一个纯函数 + 目录 `readRecords` + 本人报名），作为 prop 交给示例壳；示例期没有计划与目标，候选在服务端截到 `HOME_EVENT_POOL_LIMIT` 即可。参照 `start/page.tsx:53–83 readStartEvents` 的取法，但**不能 import 它**：W0035 删除引导第 4 步后它可能被移除。
   - **示例期的真实读取不是「只有活动」（review P2-01）。**`AppAgentPage` 判定示例模式时已经调用一次记忆化的 `loadHomeModel()`（`page.tsx:151–160` 定义，第 167 行在 `readRelationshipGoal` 里调用），即 `loadAppHomeRouteViewModel` 的复合读取：并行读 events、contacts、profile、participant events（`home-route-view-model.tsx:244–262`）；现有测试断言示例路径 `home` 恰好 1 次（`tests/pages/app-agent-guide-demo-page.test.tsx:515`）。它只用于判定，结果**不注入示例壳**（`home={null}`）。引导状态读取（测试里的 `GUIDE_OPERATIONS`）同样是既有的。示例期调用矩阵（操作级调用数／底层语句数分别记）：

     | 读取 | 来源 | 操作级调用 | 底层语句 |
     | --- | --- | --- | --- |
     | 引导状态（`readGuideStatusForActor`） | 既有 | 不变 | 不变（实测记入 REPORT） |
     | 复合 home（`loadHomeModel`，示例判定用） | 既有 | 1 | events + contacts + profile + participant events，计量桩实测 |
     | 公开目录（`readRecords`） | W0036 新增 | 1 | `listPublishedEvents` + 参会人数汇总，计量桩实测 |
     | 本人报名（`listCanonicalRegistrationsForUser`） | W0036 新增 | 1 | 计量桩实测 |
     | 社群加入状态 | W0037 新增 | 1 | W0037 实测 |

     其余（目标推荐、计划、信号、会话、snapshot、canonical id 解析 `events`、`registered-any`）仍为 0。
10. **活动池的展示语言（review P1-03）。**推荐服务返回的是原始 `candidate.record.title`（`public-goal-recommendations.ts:395`），目录 DTO 只保留中文展示字段；仓库已有按稳定 id 审阅过的三语标题 `eventTitleForId(idOrCode, language): string | null`（`app/(app)/app/orbit-event-presentation.ts:33`，未知 id 返回 `null`；先例 `orbit-event-presentation.ts:118` 先按 `event.id` 再按 `event.code` 查，`events/[id]/register/page.tsx:146` 也是先它再回退）。地点没有现成的多语言转换（`orbit-event-presentation.ts:98` 一带只把 `event.venue` 原样透传）。**展示边界：**`buildHomeEventPool` 保持纯数据、不带语言；`IOrbitHome` 在 `eventPool` 的 `useMemo` 里按当前首页语言 `lang`（`iorbit-home.tsx:259`，`language === "zh" ? "zh" : "en"`，所以 ja → en）把标题换成 `eventTitleForId(eventId, lang) ?? eventTitleForId(publicCode, lang) ?? 原标题`；**`place` 是来源原文，不声称已本地化**。导语、W0037 小模组、W0038 月历都消费这份已换好标题的 `eventPool`。
11. **示例期今日要事。** 示例首页 `plan = null`，且示例数据已有 4 条信号（critical/high/medium/low，`demo-persona.ts:245–293`），按名额规则计划行动也挤不进前 3；`people: 30` 不出补人脉。所以示例首页的今日要事保持不变（W36-2）。

## 已定决定（用户 2026-10-01：D38，全按推荐）

| 编号 | 决定 |
| --- | --- |
| W36-1 | 「最多 3 条」**只约束新加的计划行动与补人脉**：计划行动最多 `min(2, 3 − 原有条数)` 条，补人脉只在还有空位时出现；原有来源（2 小时内日程、紧急信号、名片待确认、人脉匹配、其余信号、跟进）的顺序与「还有 N 件」不变 |
| W36-2 | 示例期**不加**计划行动（示例首页 `plan = null`），示例今日要事与导语不变 |
| W36-3 | 「今天先不做」**不补位**：先选定 2 条再去掉隐藏的，不由下一条计划行动补上（固定不轮换）；空位可由补人脉占 |
| W36-4 | 没有生效计划时，人数 <10 **仍出**补人脉，文案不提阶段；有计划时引用当前阶段名 |
| W36-5 | 没有真实费用数据：池里不放 `feeLabel`，W0037 活动卡**不显示费用行**（不写「费用见详情」，不展示写死文案） |
| W35-3（W0035 移交） | `active-registration.ts` 本 Sprint **不复用、不删除**：活动池的「排除已报名」用 `recommendWithDependencies` 已读的 `registeredEventIds`。模块保留，REPORT 登记为「暂无生产调用方」观察项 |
| 无目标兜底流量 | 没设目标或读目标失败时活动池兜底「近期活动」（不得为省流量取消）；新增读取在 REPORT 实测单次字节并按无目标用户占比 10%／20%／100% 三档估算月流量，**由 D32 周检盯**；D39：总账上限 1.6 GB，超过如实登记 |

## 上下文包（Generator 从这里起步，不通读其他 REPORT）

### 必读文件
- `app/(app)/app/agent/iorbit-0918/iorbit-home.tsx`（1544 行）
  - 第 99–123 行 `IOrbitHomeProps`；第 146–160 行 `interface TodayItem`；第 235 行 `IOrbitHome`。
  - 第 287–289 行 `usePendingCards`、`useSharedReadAccount()`（改为取返回值）；第 313–333 行示例数据覆盖，`plan = demoData ? null : planState`。
  - 第 378–388 行计划读取；第 622–769 行 `items`；第 786 行 `planSummary`；第 790–814 行 `togglePlanAction`；第 851 行 `openItem`；第 873–925 行 `ready`／`itemsSettled`／`partial`／`lede`；第 1031–1128 行主稿、短讯、「还有 N 件」；第 1289–1340 行本周推进。
- `features/plans/week.ts`：`planWeekState`、`planWeeksOverdue`、`planWeekActions`、`planPhaseIndexForWeek`。
- `app/(app)/app/agent/plan/plan-route-view-model.ts`：第 569–608 行 `PlanWeekSummary`／`buildPlanWeekSummary`（不改），第 628 行 `planEventReasons`（取法参照）。
- `app/(app)/app/agent/iorbit-0918/iorbit-plan-client.ts`：`fetchCurrentPlan`、`patchPlanActionDone`、`withActionDone`、`withServerItem`。
- `app/(app)/app/agent/iorbit-0918/iorbit-plan.tsx:612–650`：本周列表行（加锚点 id）；样式在 `iorbit-my-plan-styles.ts:68`。
- `features/events/public-goal-recommendations.ts`：`candidatesFromCatalogue`（第 227 行）、`registeredEventIds`（第 284 行）、`recommendWithDependencies`（第 318 行）。
- `app/(app)/app/agent/home-dashboard-route-service.ts`：第 33–55 行类型，第 282–325 行 `recommendationItem`／`copyRecommendations`，第 341 行 `loadHomeDashboardSnapshot`。
- `app/(app)/app/agent/page.tsx`（285 行）：第 162–189 行示例判定与示例分支提前返回；第 190 行 `loadHomeModel()`；第 235–281 行真实壳 props。
- `app/(app)/app/agent/iorbit-0918/iorbit-shell.tsx`：第 82 行 `IOrbitShellProps`，第 111 行 `IOrbitShell`，第 123 行 `IOrbitDemoShell({ guide })`（要加 prop），第 199 行与第 508 行两处 `<IOrbitHome>`。
- `app/(app)/app/start/page.tsx:53–83`：`readStartEvents`（只作取法参考，不 import）。
- `app/(app)/app/orbit-event-presentation.ts:33`：`eventTitleForId`（标题本地化。已核对：依赖 `orbit-event-content`／`orbit-event-temporal` 只有类型与纯数据，没有服务端专用 import，可在客户端组件里用；会把 13 场活动的三语内容带进首页客户端包，REPORT 记一下包体变化）。
- `app/(app)/app/orbit-shared-read-account.ts:26`：`useSharedReadAccount` 无 Provider 时返回单例（事实 5）。
- `features/events/public-goal-recommendations-runtime.ts`：目录与报名读取的配置方式（示例分支复用 `createConfiguredCanonicalPublicEventCatalogue().readRecords()` 与 `createConfiguredEventOperationsRepository().listCanonicalRegistrationsForUser`）。

### 关键符号签名（原样）
- `export function planWeekActions<TItem extends PlanViewItem>(items: readonly TItem[], currentWeek: number): PlanWeekAction<TItem>[]`
- `export function planWeeksOverdue(item: Pick<PlanItem, "suggestedWeek">, currentWeek: number): number`
- `export function planWeekState(plan: { startsOn: string; phases: readonly Pick<PlanPhase, "startWeek" | "endWeek">[] }, at: Date): PlanWeekState`
- `export async function patchPlanActionDone(itemId: string, done: boolean): Promise<{ item: PlanItem; log: PlanLogEntry | null }>`
- `export async function loadHomeDashboardSnapshot(input: LoadHomeDashboardSnapshotInput): Promise<HomeDashboardSnapshot>`
- `export function createPublicGoalRecommendationsService(dependencies: PublicGoalRecommendationsDependencies): PublicGoalRecommendationsService`
- `export function useSharedReadAccount(): SharedReadAccountState`（`{ account: string | null; ready: boolean }`）
- `export function eventTitleForId(idOrCode: string | null | undefined, language: OrbitLanguage): string | null`

### 新建：共享活动池契约（W0037／W0038 只消费）
`features/agent/home-event-pool.ts`（纯函数，不 import React、不读时钟和存储）：

```ts
export type HomeEventPoolReason = { kind: "plan" } | { kind: "goal"; tokens: string[] } | { kind: "recent" };
export interface HomeEventPoolItem { eventId: string; publicCode: string; title: string; startsAt: string; endsAt?: string; place?: string; feeLabel?: string; reason: HomeEventPoolReason }
/** 服务端给的「近期可报名」候选（已排除已开始、已取消、本人主办、已报名；按开始时间升序）。 */
export interface HomeEventPoolCandidate { eventId: string; publicCode: string; title: string; startsAt: string; endsAt?: string; venue?: string }
export const HOME_EVENT_POOL_LIMIT = 8;          // ≥ 小模组 3 场 + 当月 5 场的需求（W0038 从池里取当月最多 5 场）
// revision 3 删除 HOME_EVENT_UPCOMING_LIMIT：服务端 upcoming 不截断，截断只在组池之后发生（P1-01）
export function buildHomeEventPool(input: {
  planEventIds: readonly string[];               // 计划点名，按计划原顺序
  goalMatches: readonly { eventId: string; matchedTokens: readonly string[] }[];
  upcoming: readonly HomeEventPoolCandidate[];   // 全部可报名候选（服务端不截断）
  registeredEventIds: ReadonlySet<string>;       // 服务端已排除之外，再并上首页 home.events 里已报名的
  now: Date;
  limit?: number;
}): HomeEventPoolItem[];
```
- 顺序：计划点名（在**全部** `upcoming` 与目标匹配里解析，不受场次位置限制）→ 目标匹配（保持服务端顺序）→ 近期（`upcoming` 升序）；按 `eventId` 去重，先到的理由为准；`startsAt ≤ now` 或在已报名集合里的剔除；**组完池之后才截到 `limit`（默认 8）**；展示字段一律取自 `upcoming`（目标匹配项若不在 `upcoming` 里，用推荐项自带的 `title/startsAt/venue/publicCode`）；`place = venue`（来源原文）；`feeLabel` 不填（W36-5）。
- 展示语言不在纯函数里处理：`IOrbitHome` 的 `eventPool` 按事实 10 用 `eventTitleForId` 换标题（ja → en，未知 id 回退原标题），地点保持原文。W0037／W0038 不再自行本地化，也不得声称地点已本地化。
- 理由只来自真实来源：`goal.tokens` 原样取 `matchedTokens`，空数组时不能标 goal；计划项标 plan；其余标 recent。
- 首页内：`IOrbitHome` 新增 `useMemo` 常量 **`eventPool: readonly HomeEventPoolItem[]`**（标题已按当前语言换好）和 **`eventPoolReady: boolean`**（真实期 snapshot 与计划都不是 pending 时为 true；示例期恒为 true）。W0037／W0038 在 `IOrbitHome` 内消费这两个值。本 Sprint 只在导语里用 `eventPool[0]`。
- **与简报建议的差异：** 简报建议的 `eventPool?` prop 改为首页内计算——计划点名活动来自客户端已有的计划读取，服务端不读计划（避免新增一次计划读取）。新增 prop 只有示例期用的 **`demoEventCandidates?: readonly HomeEventPoolCandidate[]`**（可选，缺省等于空池）。

### 关键符号影响等级（GitNexus，索引 `08fe51d`）
- `IOrbitHome`：**CRITICAL**（直接调用方 2：`IOrbitLiveShell`、`IOrbitDemoBody`；经 `IOrbitShell` → `AppAgentPage`，10 条流程）。新增 props 必须可选，缺省保持现状。
- `planWeekActions`：**CRITICAL**（直接调用方 2：`buildMyPlanViewModel`、`buildPlanWeekSummary`；传递到 `IOrbitHome`、`IOrbitPlanScreen`）。**只调用，不改。**
- `buildPlanWeekSummary`：HIGH；`togglePlanAction`（首页内）：HIGH。都不改签名；`togglePlanAction` 只被今日要事多调用一处。
- `createPublicGoalRecommendationsService`：LOW（直接调用方 1：runtime）。返回值只做加法（新增 `upcoming`）。
- `loadHomeDashboardSnapshot`、`IOrbitShell`、`IOrbitPlan`：UNKNOWN（同名多匹配，消歧后各 1 个直接调用方）；`AppAgentPage`：UNKNOWN（路由入口，无代码调用方）。文本搜索确认：snapshot 的消费者是 `home-dashboard-actions.ts`、`strategy/strategy-route-view-model.ts`、`home/orbit-real-home.tsx` 与测试 `tests/pages/app-agent-home-dashboard-entry.test.ts`——新增字段不能让它们的校验失败。

### 前序交接要点
- W0004／W0014：示例期对真实接口 0 调用、示例壳不接收真实数据；本 Sprint 的例外只有服务端读「近期可报名活动」（RH-03「活动始终真实」），并写成 SC。
- W0009：首页打勾 = `PATCH /api/agent/plans/items/:id`，乐观更新、失败回滚并提示；刚勾的行在本周推进暂留。
- W0010／W0011：匹配与名片待确认已是今日要事来源；名片状态机在 `/app/agent` 只能有一份。
- W0021：首页 `plans/current?view=home` 冷启动最多 1 次；写后 `invalidatePlanReads()`。当时余量约 116 MB（884／1000 MB）；之后 W0029 总账为 1,106.83 MB（D27），D39 上限 1.6 GB。
- 跟进队列的到期时钟有 bug（以最新记录 `updatedAt` 为参照），本 Sprint 不复用它的到期字段。
- 3001 验收：`preview_start {name:"orbits-verify"}`，`scripts/seed-verify-accounts.ts --reset <账号>`、`scripts/verify-session-cookie.ts`；`next-env.d.ts` 启动后被改，不提交；证据放 `~/orbit-sprint-evidence/web/`。
- 按钮挂 `.btn` 并在作用域内中和；静态样式进 `iorbit-home-styles.ts`，不写内联（scale／button ratchet）。暖色 `#C4461B` 一屏不超过 3 处、只标时效：「已顺延 N 周」用普通药丸。

### 易错边界（都对应到 SC）
- 不新增 `plans/current`（及任何）客户端请求；计划行动、勾掉、导语都用已有 `planState`。（SC-01、SC-02）
- 原有来源占满前 3 条时不出计划行动和补人脉；计划行动 ≤2；原有来源顺序与「还有 N 件」不变。（SC-01、SC-03）
- 勾掉失败：今日要事与本周推进都回到未勾状态，今日要事处也有提示；`planBusyId` 期间第二次点击无效。（SC-02）
- 「今天先不做」不发任何写请求、不改计划、不算顺延；存储读写抛错时页面照常；不同账号、不同东京日期互不影响；渲染期不碰 `localStorage`。（SC-02）
- 补人脉：`home` 为 null 时不出；7 天免打扰只存本地；按钮只导航，不在首页挂名片状态机。（SC-03）
- 计划点名的活动不因场次靠后被丢：目录 ≥13 场、计划活动排第 13 场时仍在池首。（SC-04）
- 展示语言：已知活动标题按 zh／en（ja → en）显示，未知 id 回退原标题；地点原文。（SC-04）
- 「今天先不做」的账号只取 hook 的 `account`，`null` 才算未知；账号 A → B 后不沿用 A 的隐藏项，单例残留不串号。（SC-02）
- 新增数据库流量合进一张预算表，超 1.6 GB 登记 D32 风险，不取消兜底；HTTP 响应体单独一张表，不混入数据库预算。（SC-06、SC-07）
- 活动池理由不编造：没有命中词就不是 goal；匹配不上（`no_match`）、没设目标（`needs_goal`）、读目标失败（`unavailable`）时都退回「近期活动」，只要目录里有可报名活动池就不能为空；只有目录或报名读失败时池才为空。导语不写活动类型。（SC-04）
- 示例期调用矩阵按事实 9 的表：既有的示例判定复合 home 读取 1 次（不注入示例壳）不变，本 Sprint 只新增目录 1 次、报名 1 次；其余为 0，客户端仍 0 请求；真实期 snapshot 路径数据库语句数不变。（SC-04）

## 范围与文件

- **修改：**
  - `iorbit-home.tsx`（计划行动与补人脉进 `items`、勾掉／今天先不做／补人脉操作、导语、`itemsSettled`、`eventPool`、`demoEventCandidates` prop）；`iorbit-home-styles.ts`
  - 新纯函数可放 `iorbit-model.ts` 或新文件 `iorbit-0918/today-plan-items.ts`（计划行动挑选、来源文案、跳转地址、存储 key）
  - `iorbit-shell.tsx`（示例壳透传 `demoEventCandidates`）；`app/(app)/app/agent/page.tsx`（示例分支读近期可报名）
  - `features/events/public-goal-recommendations.ts`（结果加 `upcoming`，抽出可复用的「近期可报名」选择）；`home-dashboard-route-service.ts`（复制并校验 `upcoming`）
  - `iorbit-plan.tsx` 本周行加 `id="plan-action-<id>"`；`iorbit-my-plan-styles.ts` 加 `scroll-margin-top`
  - 对应测试
- **新建：** `features/agent/home-event-pool.ts`；示例分支的读取函数（如 `features/agent/home-event-pool-runtime.ts`，服务端）；`tests/services/home-event-pool.test.ts`；计划行动挑选的纯函数测试（可并入 `tests/services/plan-week.test.ts` 或新文件）。
- **排除：** 活动小模组、社群卡移动、已报名栏改动（W0037）；月历圆点与空日程行（W0038）；「推迟到下周」；修改 `planWeekActions`／`buildPlanWeekSummary`；跟进队列时钟；付费 AI、迁移、部署。

## 验收契约

| SC | 可观察行为 | 必需证据 |
| --- | --- | --- |
| SC-W0036-01 | **计划行动进今日要事。** 有生效计划时，本周行动（`planWeekActions`）按「拖期在前（`planWeeksOverdue > 0`），各组内按 `suggestedWeek`、`sortKey`」取前 2 条，只补到前 3 个位置（原有 0／1／2／≥3 条时分别补 2／2／1／0 条）；药丸「本周计划 · 第 N 阶段 <阶段名>」（`phaseKey` 为空退回当前阶段，无阶段只写「本周计划」），拖期另标「已顺延 N 周」；点标题依次去 `/app/contacts/<id>`、`/app/events/<linkedEventId>`、`/app/agent/plan#plan-action-<id>`，计划页对应行有该 id；第一条是计划行动时导语「今天可以推进一步：<title>」；`itemsSettled` 含计划；计划读不到时不出计划行动、原有文案不变；示例首页今日要事与导语不变；挂载到勾掉全过程 `plans/current?view=home` 请求 1 次 | 纯函数测试（挑选、名额四档、拖期、阶段名退回、地址）+ `tests/pages/app-agent-iorbit-home.test.tsx`（`mountHome`，计 fetch 次数）+ 计划页锚点断言，先 RED 后 GREEN |
| SC-W0036-02 | **勾掉与今天先不做。** 勾掉调用 `PATCH /api/agent/plans/items/<id>`（`set_status: done`），今日要事该行消失、本周推进同一行打勾；接口失败时两处都恢复、今日要事处出现提示；请求进行中再点无效。「今天先不做」后该行隐藏、不补下一条计划行动（W36-3）、0 个写请求；`localStorage` key 为 `orbit.today.skip.v1:<account>:<东京日期>`；东京次日、换账号后重新出现；`getItem`／`setItem` 抛错或 `account === null` 时仍能在本页隐藏且无报错、不读写存储；**账号 A 隐藏一条后切到账号 B：B 的该条照常显示，只读写 B 的 key；再切回 A 仍隐藏**；**单例残留：无 SessionProvider 的测试环境里先 `setSharedReadAccount("A")` 再挂载，组件按 hook 返回的账号读写，不写入 `anonymous` 或其他账号的 key**；服务端渲染不访问 `localStorage` | 首页组件测试（fetch 桩记录方法与地址、可抛错的 storage 桩、时钟跨东京午夜、可切换的 SessionContext 桩） |
| SC-W0036-03 | **补人脉。** `home.stats.people < 10` 且有空位时出现一条（有计划时文案含当前阶段名，无计划时不含，W36-4），按钮导航到 `/app/contacts/new?method=scan`；「7 天内不再提示」写 `orbit.today.networkNudge.v1:<account>` 后 7 天内不出现、第 8 天出现；`people ≥ 10`、`home` 为 null、原有加计划行动已占满 3 条时不出；首页不挂 `useCardBatch`／`CardBatchImport`；第一条是补人脉时导语用「今天可以推进一步」句式 | 首页组件测试（人数 9／10、null、占满、免打扰边界） |
| SC-W0036-04 | **推荐活动池。** `buildHomeEventPool`：计划 → 目标 → 近期，去重，剔除已开始／已报名，组池后才截到 ≤8；理由 plan／goal（tokens 原样来自 `matchedTokens`）／recent，空命中不标 goal；**用例：目录 ≥13 场可报名活动、计划关联项按时间排第 13 场且不在目标匹配里 → 它在池首、标 plan**。推荐服务在 `success`／`no_match`／`needs_goal`／读目标失败的 `unavailable` 四种情况都返回 `upcoming`（全部可报名候选、不截断，升序，已排除已开始／已取消／本人主办／已报名；用 ≥13 场样本断言不截断）；`success`／`no_match` 与改前语句数不变，`needs_goal`／读目标失败各多出目录与报名读取（计量桩证明具体语句数）；目录或报名读失败时 `upcoming` 为空、页面不报错。没设目标、目录有可报名活动的真实用户，首页 `eventPool` 非空且全部标 recent；snapshot 对四种状态都复制并校验 `upcoming`，坏数据时整体按 `unavailable` 处理，现有消费者测试通过。首页 `eventPool` 在真实期由 snapshot + `planState` 算出，不新增客户端请求；无要事、无日程、非 partial 且池非空时导语「今天没有安排，<M/D> 有一场适合你的活动：<标题>」。**展示语言：**已知 id 的活动（如 `event_01`）在 zh 显示中文标题、en 显示英文标题、ja 界面显示英文标题；未知 id 显示原标题；地点在三种语言下都是来源原文。**示例调用矩阵（事实 9）：**既有复合 home 读取 1 次（操作级）且示例壳 `home` 仍为 null，新增目录 1 次、报名 1 次，目标推荐／计划／信号／会话／`events`／`registered-any` 0 次，客户端请求仍为 0；操作级调用数与底层语句数分别断言或实测；真实分支不做这次读取 | `tests/services/home-event-pool.test.ts`、`tests/services/public-goal-recommendations.test.ts`（四种状态的 `upcoming` 与语句计数）、`tests/pages/app-agent-home-dashboard-entry.test.ts`（`needs_goal`／`unavailable` 时 `upcoming` 不被清空）、`tests/pages/app-agent-guide-demo-page.test.tsx`（require.cache 计调用）、首页组件测试（zh／en／ja 三种语言的标题与地点）；字节实测与月估算并入 SC-W0036-06 |
| SC-W0036-05 | **回归与真实页面。** 3001 上 ① 新用户走三步引导到首页：今日要事出现计划行动、导语为新句式；② 老用户有计划、联系人 <10：计划行动 + 补人脉，勾掉一条后本周推进同步、刷新仍为已完成，「今天先不做」后刷新仍隐藏，点补人脉到上传区，点计划行动标题到计划页并定位到该行。桌面 1440、手机 375 各一次，控制台 0 错误，之后 `--reset` 恢复账号。受影响测试文件全部通过；`npx tsc --noEmit -p .` 通过；一次全量对照基线无新增失败；一次 Codex 代码 review，意见由同一 Generator 处理 | 截图（仓库外）、定向集、tsc、RULES §5.2 全量对照、review 记录 |

| SC-W0036-06 | **统一数据库月预算表（review P1-02、短复核）。** 只计数据库出站字节与语句数。行：① 基线 1,106.83 MB（W0029 REPORT:67）；② 示例期新增读取（目录 + 报名单次实测字节 × 1000 位新用户 × 每人示例期 10 次）；③ 无目标兜底（单次实测字节 × 每天 4 次 × 30 天 × 1000 × 占比）；④ W0037 示例期社群读取（W0037 实测后追加，本 Sprint 先按约 3 MB 占位并注明）；⑤ 若采用 SC-07 的备选约束，补查接口的数据库字节。写明人群关系：②④（开关打开、引导未完成，示例期）与 ③（真实期、无目标，主要是开关关闭与 D2 老用户）按单次请求互斥，按保守口径**直接相加**。给出 10%／20%／100% 三档合计（方案估值 1,190.83／1,235.83／1,590.83 MB）。判定线 **1.6 GB（D39）**：任一档超过即在 REPORT 登记为 D32 风险并提示协调者写入 D32 周检；**不得以取消兜底规避（D38、D39）** | REPORT 数据库预算表、本机按 W0017 口径的实测字节输出（证据目录） |
| SC-W0036-07 | **HTTP 响应体与请求次数（短复核新 P2，W0021 SC-04 口径分列）。** 三列分开：数据库返回字节／语句数（与 SC-06 一致）、HTTP 响应体字节、每次页面动作请求次数。实测 `refreshHomeDashboardAction()` 改前／改后的**实际序列化响应**字节（浏览器网络面板或测量脚本读取 Server Action 响应），按目录可报名 当前场数／20／50／100 场四个样本给出单次响应；频次：首页每人每天 4 次（W0017 口径），策略页 `iorbit-strategy.tsx` 每人每天 1 次（W0017／W0021 表里没有策略页频次，此为假设，REPORT 注明）；算 1000 人月度 HTTP 增量总量。**HTTP 字节不进数据库预算。**判定：若 100 场样本时单次响应增量 > 20 KB 或月度 HTTP 增量 > 5 GB（建议阈值，协调者可调），改用事实 9 的备选约束（前 12 场 + 计划补查），产品结果不变，并补测其补查频次与数据库字节计入 SC-06 | REPORT 三列表 + 测量脚本输出（证据目录） |

## 一次 Generator 的执行顺序

1. 复核进入条件（W0035 已合并；W36-1～5 已由 D38 决定），保存基线和 Planner 哈希，保留用户未提交文件。对 `IOrbitHome`、`planWeekActions`、`buildPlanWeekSummary`、`createPublicGoalRecommendationsService`、`loadHomeDashboardSnapshot`、`IOrbitShell`、`AppAgentPage` 做 upstream impact，CRITICAL／HIGH 在 REPORT 登记。
2. 先写 RED：计划行动挑选与名额、活动池纯函数、推荐服务 `upcoming` 与语句计数、首页组件（勾掉、今天先不做、补人脉、导语、请求计数）、示例页读取计数。
3. 实现：纯函数 → 推荐服务与 snapshot → 首页 `items`／操作／导语／`eventPool` → 计划页锚点 → 示例分支读取与壳透传。
4. 按操作链提交（今日要事一条、活动池一条即可）；每次提交前跑暂存区 `detect-changes`。
5. 3001 浏览器验证；全量对照基线；一次 Codex 代码 review，同一 Generator 修复；写 REPORT，交接分支与固定 SHA。

## 最小测试与检查

- **档位：H。** 理由：`IOrbitHome`、`planWeekActions` 为 CRITICAL；今日要事接入计划写入（勾掉）；推荐服务与 snapshot 是 W0037／W0038 的共享契约；示例期读取边界改变。收口一次 Codex 代码 review + 一次全量对照。
- **开发定向集（cwd `/Users/li/work/orbit/repos/orbits`，不 source `.env`）：**
  - `tests/services/home-event-pool.test.ts`（新）、`tests/services/plan-week.test.ts`（挑选纯函数）
  - `tests/services/public-goal-recommendations.test.ts`、`tests/services/public-goal-recommendations-runtime.test.ts`
  - `tests/pages/app-agent-home-dashboard-entry.test.ts`（snapshot 形状）
  - `tests/pages/app-agent-iorbit-home.test.tsx`（`mountHome`）
  - `tests/pages/app-agent-guide-demo-page.test.tsx`（示例读取计数）
  - `tests/pages/app-agent-iorbit-screens.test.tsx`（计划页锚点）
- **收口：** 上述完整文件 + `tests/pages/app-agent-plan-route-view-model.test.ts`、`tests/pages/app-agent-iorbit-plan-card.test.tsx`；typecheck；一次全量基线对照（RULES §5.2）。
- **浏览器：** 3001 两条路径，1440 与 375。
- **不运行：** 付费 AI、Preview、PG 差分测试（真实期数据库语句不变，用计量桩证明即可）。

## 失败与交接

REPORT 必须写：W36-1～5 与 W35-3 的执行结果（按 D38）；活动池契约的最终签名（若与上文不同，以 REPORT 为准，W0037／W0038 据此开工）；`eventPool`／`eventPoolReady` 在 `IOrbitHome` 中的位置与标题本地化写法；示例期调用矩阵（操作级与语句数）；SC-06 数据库月预算表（含是否超 1.6 GB、是否登记 D32 风险；W0037 在此表上追加社群行）；SC-07 HTTP 响应体三列表与是否启用备选约束；已知限制（费用无真实数据；地点为来源原文）；3001 截图路径。

## 修订记录

| review 意见（[REVIEW-2026-10-01](../REVIEW-2026-10-01.md)） | 处理 |
| --- | --- |
| P1-01（计划点名活动排在第 12 场后被丢） | 接受。服务端 `upcoming` 改为全部可报名候选、不截断（删 `HOME_EVENT_UPCOMING_LIMIT`）；`buildHomeEventPool` 先按计划 → 目标 → 近期组池再截到 8；SC-04 加「目录 ≥13 场、计划项排第 13 场仍在池首」用例；删去已知限制；应答体增量并入 SC-06 预算表。选「全量候选索引」而不是单独 `planCandidates`：计划只在客户端，服务端不读计划（事实 9） |
| P1-02（新增流量分开算、可能超余量不登记） | 接受。新增 SC-W0036-06 统一预算表：基线 + 示例期 + 无目标兜底 + 其他新增返回体，写明人群互斥／重叠，给 10%／20%／100% 合计；按本方案估值 20% 档已约 1,010 MB，超余量登记 D32 风险，不取消兜底（D38）。W0037 社群读取追加到同一表 |
| P1-03（活动池本地化契约不一致） | 接受。新增事实 10：`IOrbitHome` 用 `eventTitleForId(eventId ?? publicCode, lang)` 换标题（ja → en），未知回退原标题；地点为来源原文；SC-04 覆盖 zh／en／ja→en |
| P2-01（示例期读取计数与源码不符） | 接受。事实 9 写成调用矩阵：既有示例判定复合 home 1 次（`page.tsx:151–167`，不注入示例壳）、本 Sprint 新增目录 1 次与报名 1 次、W0037 再加社群 1 次；操作级调用数与底层语句数分别记；易错边界与 SC-04 同步 |
| P2-02（无 SessionProvider 时账号不必然未知） | 接受（选「删承诺」）。事实 5 只以 `account === null` 为未知，写明无 Provider 时 hook 返回单例；SC-02 加账号 A → B 切换与单例残留测试 |
| P1-04、P2-03～P2-05、P3-01 | 不涉及本 Sprint |
| 短复核（Codex，2026-10-01）：P1-02 基线错；新 P2 全量 `upcoming` 的 HTTP 返回体测算不完整 | 接受，仍为 revision 3 补丁。数据库基线改为 W0029 总账 1,106.83 MB，加入 W0037 社群读取，三档重算为 1,190.83／1,235.83／1,590.83 MB；用户已定 D39（D20 上限放宽到 1.6 GB，照做兜底，D32 周检），写入进入条件，SC-06 判定线改 1.6 GB、超过仍登记。新增 SC-07：数据库字节、HTTP 响应体、请求次数分列，实测序列化响应、首页与策略页（`iorbit-strategy.tsx:61`）频次、20／50／100 场样本和 1000 人月度 HTTP 总量，HTTP 不混入数据库预算；超阈值时改用「前 12 场 + `upcomingTruncated` + 计划 id 窄补查」，产品结果不变。没有选「计划 id 随 snapshot 请求传入」，因为会推迟首页 facts 首帧 |
