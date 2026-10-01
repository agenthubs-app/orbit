# Sprint W0037 — 今日要事的活动小模组与已报名栏

**Plan revision:** 3（2026-10-01 按 [REVIEW-2026-10-01](../REVIEW-2026-10-01.md) 修订并对齐 W0036 revision 3，见文末修订记录；revision 2 写入 D38 决定）。**模式:** existing-codebase / single-generator。运行状态只在登记表。
**原需求:** RH-03 的小模组渲染部分（「活动小模组」「示例模式」两条），以及 RH-04 的「已报名活动栏」部分。推荐活动池本身由 W0036 建立，本 Sprint 只读取。月历和右栏归 W0038。
**单一目标:** 首页「今日要事」下方渲染活动小模组：要事为空时展开社群卡和两场活动，有要事时缩成一行；已报名栏只放报名；示例首页的小模组用真实活动和社群。
**易读目标:** [GOAL.md](GOAL.md)。
**基线:** 开工时的 `chat-agent` HEAD（编制时是 `08fe51db`）加上 W0035、W0036 的合并 SHA（以两者 REPORT 为准）。
**进入条件:**
- W0035 已合并：引导第 4 步、`guideStep4Pending` 与首页第 4 步提醒已经删除。如果没删干净，本 Sprint 只确认不再渲染，不承接 W0035 的范围。
- W0036 已合并，REPORT 写明：`HomeEventPoolItem` 的最终签名；`IOrbitHome` 内部 `eventPool`／`eventPoolReady` 两个常量的位置；示例期 `demoEventCandidates` prop 的接线与读取计数口径；活动池的条数上限（`HOME_EVENT_POOL_LIMIT = 8`，满足「当月 5 场」与「小模组 3 场」）。如果 W0036 改了下文「共享契约」的签名，以 W0036 REPORT 为准。
- W37-1～W37-3 用户已于 2026-10-01 决定（D38）；W37-4 档位 H 由协调者裁决，登记表已改。见下表「已定决定」。
- 不需要云端授权，不调用付费 AI，没有迁移。

## 共享契约（W0036 建立，本 Sprint 只消费）

- `features/agent/home-event-pool.ts`：`buildHomeEventPool(input): HomeEventPoolItem[]`。排序依次是计划点名、目标匹配、近期补齐，已去重；已报名、已开始、已取消和本人主办的活动都已排除；计划点名在全部可报名候选里解析，组池后才截断（W0036 revision 3）。
- **展示语言（W0036 revision 3 的展示边界）：**`IOrbitHome` 内的 `eventPool` 标题已按首页语言 `lang` 用 `eventTitleForId` 换好（ja → en；未知 id 回退原标题）；**`place` 是来源原文，没有本地化**。本 Sprint 直接用池里的 `title`／`place`，不再本地化，也不在文案或注释里声称地点已本地化。
- `HomeEventPoolItem = { eventId; publicCode; title; startsAt; endsAt?; place?; feeLabel?; reason: { kind: 'plan' } | { kind: 'goal'; tokens: string[] } | { kind: 'recent' } }`。上限 `HOME_EVENT_POOL_LIMIT = 8`；`feeLabel` 恒不填（W36-5）。
- **接线方式（W0036 revision 2）：** 活动池**不是** `IOrbitHome` 的 prop，而是 `IOrbitHome` 内部的 `useMemo` 常量 `eventPool: readonly HomeEventPoolItem[]` 与 `eventPoolReady: boolean`（真实期由 snapshot 的 `upcoming`／`recommendations` 加客户端已有的 `planState` 算出；示例期由 W0036 新增的可选 prop `demoEventCandidates?: readonly HomeEventPoolCandidate[]` 算出，`eventPoolReady` 恒为 true）。示例分支在服务端读「目录 + 本人报名」并经 `IOrbitDemoShell` → `IOrbitDemoBody` → `IOrbitHome` 透传，这条接线 W0036 已完成。本 Sprint 在 `IOrbitHome` 内把这两个常量交给小模组组件，**不新增活动池 prop、不在 `page.tsx` 再读一次活动**。
- 本 Sprint **不重新排序、不重新过滤**活动池，直接按池的顺序取前几场。小模组和 W0038 的空心圈用的是同一批活动。

## 已查清的事实（2026-10-01 按 `08fe51db` 源码复核）

1. **今日要事区。** `app/(app)/app/agent/iorbit-0918/iorbit-home.tsx` 共 1544 行。
   - 第 995 行 `<section aria-label="今日要事" className="ir-m-main">` 开始这一区。
   - 主稿在第 1036 行（`lead ?`）。空态 `ir-m-quiet` 在第 1071 行：「正在核对…」「部分数据来源暂时不可用…」「今天没有必须处理的事。」三种。
   - 短讯 `ir-m-briefs` 在第 1087 行，「还有 N 件」在第 1120 行，追问条 `ir-m-ask` 从第 1130 行开始，这一区到第 1173 行结束。
   - 小模组放在「还有 N 件」之后、追问条之前。
2. **「为空」判定的现有依据。**
   - `items`（第 622 行）由五个来源拼成：2 小时内的日程、critical/high 信号、待确认名片、人脉匹配、其余信号和跟进。W0036 会再加入计划行动和补人脉。
   - `itemsSettled`（第 879 行）的含义是 snapshot、signals、本机名片三样都不是 pending。`partial`（第 884 行）表示任一核心来源读不到。
   - W0036 把计划行动并进 `items` 以后，「要事就绪」应当以 W0036 落地后的判定为准（计划读取也算进去）。本 Sprint 沿用 W0036 的这个判定，不另写一套。
3. **社群卡不能直接搬过来用。** `app/(app)/app/events/events-0918/community-card.tsx:62` 的 `CommunityCard`（impact HIGH，直接调用方有 `EventsList` 和 `StepEvents`）有以下限制：
   - 样式全部限定在 `[data-orbit-real-page="events-0918"]` 下。
   - 112px 的二维码一直显示，没有「看二维码」展开。
   - 写成功之后才改状态，不是乐观更新。
   - 带固定 `id="iorbit-community"` 和 `id="ev-community-title"`。
   - 引导第 4 步（`start-step-events.tsx:56`）是套一层同名作用域复用它的；W0035 删掉第 4 步后，它只剩活动页一个用处。
   - 结论：首页新做一张紧凑社群卡，复用 `COMMUNITY_CONFIG`（`features/community/config.ts:35`）和 `COMMUNITY_MEMBERSHIP_ENDPOINT`（`community-card.tsx:20`，值为 `/api/community/membership`），**不修改 `CommunityCard`**。
4. **加入接口。** `PUT /api/community/membership` 是幂等的，只写本人的记录（`features/community/membership.ts`，用 `insertRecordIfAbsent`）。
   - 成功的应答是 `{ success: true, data: { joined: true } }`。未登录返回 401。`CommunityCard.markJoined` 对这三种情况（成功、401、其他失败）的判定和文案可以照抄。
   - 服务端读取用 `readCommunityJoinedForActor({ actorId })`（`features/community/service-factory.ts:95`），读取失败时返回 false，不会抛错。
5. **素材仍是占位。** `COMMUNITY_CONFIG` 里 `qrImageSrc: null`，`placeholder.qr`、`placeholder.wechatId`、`placeholder.intro` 都是 true（D4）。所以「看二维码」展开后看到的是虚线占位框，必须标「占位」。微信号旁边同样标「占位」。
6. **活动卡的日期格式。** 首页「已报名活动」栏（第 1442–1471 行）已经有一套写法：
   - 日期用 `fmtDay(iso)`（第 523 行，`month: numeric, day: numeric`，东京时区），显示为 `10/3`。
   - 下面一行是 `Intl.DateTimeFormat(locale, { weekday: "short", timeZone: TZ })` 加上 `fmtTime`，显示为 `周五 19:00` 或 `Fri 07:00 PM`。
   - 小模组照用这一套，同一屏不出现两种日期格式。活动页的 `formatEventDateRange`（`events-model.ts:202`）格式是「10月3日（周五） 19:00 - 21:00」，比较长，首页不用它。
7. **语言。** 首页只有中英两种：`lang = language === "zh" ? "zh" : "en"`（第 259 行），日文界面落到英文。
   - 这是语言上下文的既定口径：`orbit-language-context.tsx:58–61` 写明「ja 缺省时回退英文（产品 chrome 尚未全量日文；活动数据是完整三语）」。活动页 `events-list.tsx:79` 也是 `ja → en`。
   - 所以新文案按首页惯例给 `{ en, zh }`。活动标题用 `eventPool` 里 W0036 已按语言换好的值（已知 id 三语、未知 id 原标题）；地点按来源原文显示（目前没有多语言地点数据，`orbit-event-presentation.ts:98` 一带也只是原值透传）。
8. **活动详情链接。** 统一用 `eventDetailHref(code)`（`events-model.ts:55`，结果是 `/app/events/<publicCode>`）。`/app/events/[id]` 会先按路由码解析，再退回 canonical id（`canonical-event-detail-view.ts:98`）。
9. **「本周」口径已有的做法。**
   - 周一小结用东京周一（`isTokyoMonday`）。
   - 策略页「4 周推进节奏」从本周一算起（`iorbit-model.ts:1405` 的注释）。
   - 首页月历是周日在前（`iorbitCalendarCells`，`iorbit-model.ts:1271`）。
   - 计划的「本周」按 `starts_on` 算相对周（`features/plans/week.ts:45`），和自然周不是一回事。
   - 结论见已定决定 W37-2。
10. **已报名栏（第 1405–1479 行）的现状。**
    - 依次是：第 4 步提醒（第 1410 行，W0035 会删）、社群行 `data-orbit-iorbit-community`（第 1418–1440 行）、两场报名活动、空态「还没有报名活动。看看推荐 →」（第 1474–1477 行）。
    - `registeredEvents` 由 `iorbitRegisteredEvents` 算出（第 534 行，`iorbit-model.ts:1388`）：未开始的按时间正序排在前，已结束的排在后。这部分不改。
11. **示例期的读取现状。**
    - 示例判定：`app/(app)/app/agent/page.tsx:162` 的 `readDemoModeViewForActor`。判定为示例时，第 173–189 行提前返回 `<IOrbitShell guide home={null} …>`。示例判定本身已经调用一次记忆化的 `loadHomeModel()`（第 151–160 行定义、第 167 行调用），即复合读取 events、contacts、profile、participant events（`home-route-view-model.tsx:244–262`），只用于判定、不注入示例壳；测试断言 `home` 恰好 1 次（`app-agent-guide-demo-page.test.tsx:515`）。`08fe51db` 时除此之外**不读社群、报名、活动**（W0014）；W0036 合并后示例分支已多出「目录 + 本人报名」各 1 次（`demoEventCandidates`），**仍不读社群**。
    - 示例期调用矩阵（与 W0036 事实 9 同一张，分别记操作级调用数和底层语句数）：既有引导状态读取不变；既有示例判定复合 home 1 次（不注入示例壳）；W0036 新增目录 1 次、报名 1 次；**本 Sprint 再新增社群 1 次**；其余 0 次。
    - 测试 `tests/pages/app-agent-guide-demo-page.test.tsx:497` 的 `REAL_BUSINESS_READS = ["events","registrations","community","plan-read","registered-any"]` 断言示例期这些读取都是 0 次（第 505 行）；W0036 已按「目录与本人报名各 1 次」改写这组断言（以 W0036 REPORT 为准），本 Sprint 在其基础上只放开 `community`。
    - 示例壳的分支在 `iorbit-shell.tsx:114`：`if (props.guide) return <IOrbitDemoShell guide={props.guide} />`。只传了 guide，示例概览在第 199 行 `<IOrbitHome home={null} …>`。
    - 首页示例数据的社群状态是写死的 `demoData.communityJoined`（`iorbit-home.tsx:329`，`_demo/demo-persona.ts:330` 恒为 true）。
    - 示例数据本来就有多条信号，所以示例首页的今日要事**不为空**。照通用规则，示例里只会出现一行，社群卡不会出现；因此按 W37-1 示例期固定展开。
12. **样式的约束。**
    - 新按钮要加进 `iorbit-home-styles.ts:12` 的 `NEW_BUTTONS` 中和清单（`.btn` 基类中和）。
    - 规则一律以 `[data-orbit-real-page="iorbit-0918"]` 开头。
    - 颜色沿用墨黑和靛蓝：`#4B4FC7`、`#2E3270`、`#3B3F7A`、`#6B6F99`、`#DDDEFA`、`#ECEEFB`、`#F4F5FC`。`#C4461B` 只用来标时效，小模组里只有错误提示可以用它。
    - 闸门是 `tests/ui/orbit-button-ratchet.test.ts` 和 `tests/ui/orbit-scale-ratchet.test.ts`。

## 已定决定（用户 2026-10-01：D38，全按推荐；W37-4 为协调者裁决）

| 编号 | 决定 |
| --- | --- |
| W37-1 | **示例期小模组固定展开**（不看要事是否为空）：未加入时社群卡加两场真实活动，已加入时三场。示例期可以**真实点「我已加入」**（对本人记录的幂等写入；引导改 3 步后社群与引导进度、示例判定无关）。示例期点真实活动卡直接进真实详情，不走「这是示例」拦截。示例期社群状态改读真实值（服务端 `readCommunityJoinedForActor` 1 次） |
| W37-2 | 「本周还有 N 场」按**东京时间周一至周日**：只数活动池里从现在到本周日 24:00（东京）之间开始的活动；**N=0 时整行不显示**（已报名栏的「全部活动 →」仍可用）。N 只从池里数（池有上限），所以写「本周还有」，不承诺是活动页全部数量 |
| W37-3 | 日文沿用现状**回退英文**：新文案只给 `{ en, zh }`，不单独加 `ja` |
| W37-4 | 档位 **H**（协调者裁决，登记表已改）：`IOrbitHome` CRITICAL、放宽 W0014 示例期零读取不变式、示例期新增真实写入。收口做一次 Codex 代码 review 和一次全量基线对照 |
| W36-5（同步） | 活动卡**不显示费用行**：池里没有真实费用数据，`feeLabel` 恒不填 |
| W35-2（承接） | 已报名栏里的社群行与「看看推荐 →」由**本 Sprint 删除**（W0035 只删了第 4 步提醒行） |

## 上下文包（Generator 从这里起步，不通读其他 REPORT）

### 必读文件
- `app/(app)/app/agent/iorbit-0918/iorbit-home.tsx`
  - 第 99 行 `IOrbitHomeProps`，第 235 行 `IOrbitHome`，第 329 行 `communityJoined` 的示例覆盖。
  - 第 510、523 行 `fmtTime`、`fmtDay`。第 622 行 `items`，第 872–888 行 `ready`、`itemsSettled`、`partial`。
  - 第 995–1173 行今日要事区，第 1405–1479 行已报名栏。
  - 以上行号是 `08fe51db` 的，W0035、W0036 合并以后要重新定位。
- `app/(app)/app/agent/iorbit-0918/iorbit-shell.tsx`：第 82 行 `IOrbitShellProps`，第 111 行 `IOrbitShell`（示例分支在第 114 行），第 137 行 `IOrbitDemoBody`（概览在第 199 行），第 239 行 `IOrbitLiveShell`（概览在第 508 行）。
- `app/(app)/app/agent/page.tsx`（285 行）：第 162 行示例判定，第 173–189 行示例提前返回（W0036 已在此读 `demoEventCandidates`），第 219 行真实期的 `readCommunityJoinedForActor({ actorId })`。
- `app/(app)/app/agent/iorbit-0918/iorbit-home-styles.ts`：第 12 行 `NEW_BUTTONS`，第 152–162 行 `.ir-m-event*` 和 `.ir-m-community`。
- `app/(app)/app/events/events-0918/community-card.tsx`：只抄加入判定、文案和剪贴板降级的写法，不 import 它的样式。
- `features/community/config.ts`：`COMMUNITY_CONFIG`。
- `features/agent/home-event-pool.ts`（W0036 新建）：`HomeEventPoolItem`。`iorbit-home.tsx` 里 W0036 新增的 `eventPool`／`eventPoolReady` 常量与 `demoEventCandidates` prop（按 W0036 REPORT 定位）。

### 关键符号与影响等级（GitNexus，2026-10-01，索引对应 `08fe51db`）
- `IOrbitHome`：**CRITICAL**（直接调用方 2 个，`IOrbitDemoBody` 和 `IOrbitLiveShell`，经 `IOrbitShell` 到 `AppAgentPage`，影响 10 个流程）。新增的 props 必须是可选的，默认值保持现状。
- `IOrbitDemoBody`：**HIGH**（直接调用方 `IOrbitDemoShell`）。W0036 已给它加了 `demoEventCandidates`；本 Sprint 只再加一个只读输入 `communityJoined`。
- `IOrbitShell`：图谱里有 4 个同名候选（ambiguous）。文本确认它唯一的调用方是 `app/(app)/app/agent/page.tsx`。
- `AppAgentPage`：UNKNOWN（路由入口，没有代码调用方）。
- `CommunityCard`：HIGH。**不改。**
- `buildDemoHomeData`：LOW（调用方是 `demoData@iorbit-home.tsx` 和 `demoChat@iorbit-shell.tsx`）。如果删掉 `communityJoined` 字段，要同步它的测试。
- `COMMUNITY_CONFIG`：UNKNOWN。文本确认只有 `iorbit-home.tsx:43` 和 `community-card.tsx:14` 两处 import。只读，不改。

### 前序交接要点
- W0003：社群不是活动（D6）。社群状态由服务端读，首帧就是对的。加入接口幂等。
- W0004、W0014：示例期对真实接口 0 调用，示例壳拿不到真实的 `home` 和 `viewModel`。RH-03 是**有意的例外**，只放开活动（W0036 已放开：目录 + 本人报名）和社群状态（本 Sprint 放开）两样（SC-04）。
- W0021：首页 `plans/current` 每次冷启动最多读 1 次。本 Sprint **不新增任何客户端读取**：活动池在 `IOrbitHome` 内由已有数据算出（W0036），社群状态由服务端注入。
- W0022、W0035：第 4 步提醒和 `guideStep4Pending` 已经删除，本 Sprint 只确认。
- W0036：活动池契约与接线见上（`eventPool`／`eventPoolReady` 是 `IOrbitHome` 内部常量，不是 prop）；W36-2 示例期不加计划行动。头条导语「只剩活动时……」由 W0036 负责，本 Sprint 不改导语。
- 验收环境：3001 用 `preview_start {name:"orbits-verify"}`，账号用 `scripts/seed-verify-accounts.ts --reset <账号>`，会话 cookie 用 `scripts/verify-session-cookie.ts`。启动后 `next-env.d.ts` 会被改动，不要提交。证据放 `~/orbit-sprint-evidence/web/sprint-W0037/run-01/`。

### 易错边界（都对应到 SC）
- 要事就绪（W0036 的 `itemsSettled`，含计划）且 `eventPoolReady` 之前不渲染小模组，避免先闪出三张卡再缩成一行。部分来源读不到但没有要事时，按「为空」展开，因为小模组并不断言「今天没事」。示例期固定展开（W37-1）。（SC-01）
- 不编造：活动不足两场就只显示实际有的场数，不补占位卡。推荐理由只有三种真实来源。活动池为空时不显示活动卡。不显示费用行（W36-5）。（SC-01、SC-02）
- 卡片上没有报名按钮，点卡只进详情。（SC-02）
- 「我已加入」：乐观收起社群卡并补上第三场。失败（非 2xx、`joined` 不为 true、网络错误）时回滚并在 `role="status"` 里提示，401 用单独的文案。连点只发一次 PUT。占位素材必须标「占位」。（SC-03）
- 示例期按调用矩阵：既有复合 home 1 次（不注入示例壳）不变，W0036 的目录与报名各 1 次不变，本 Sprint 只新增社群 1 次；ledger、signals、sessions、snapshot、plans、`events`（canonical id 解析）和 `hasAnyActiveRegistration` 的读取仍是 0 次。社群读取失败时示例照常渲染，按未加入处理。（SC-04）
- 示例期社群读取的数据库字节追加进 W0036 SC-06 的数据库月预算表（基线 1,106.83 MB），重算三档合计；判定线 1.6 GB（D39），超过登记 D32 风险。（SC-04）
- 不声称地点已本地化；标题语言跟随 `eventPool`。（SC-02）
- 已报名栏里不再出现社群行、第 4 步行和「看看推荐」。（SC-05）
- 按钮挂 `.btn` 并加进 `NEW_BUTTONS` 中和；静态样式不写内联。（SC-05）

## 范围与文件

- **修改：**
  - `iorbit-home.tsx`：用内部 `eventPool`／`eventPoolReady` 渲染小模组。小模组的紧凑社群状态改用真实 `communityJoined` prop，示例期也一样（去掉 `demoData.communityJoined` 覆盖）。已报名栏删除社群行和「看看推荐」。
  - `iorbit-shell.tsx`：示例分支在 W0036 已透传的 `demoEventCandidates` 之外，再把 `communityJoined` 交给 `IOrbitDemoShell`、`IOrbitDemoBody`，传给 `IOrbitHome`。这两个是示例壳唯一放行的真实字段。
  - `app/(app)/app/agent/page.tsx`：示例分支只新增 `readCommunityJoinedForActor` 1 次（活动由 W0036 的 `demoEventCandidates` 读取提供，不再读一次）。
  - `iorbit-home-styles.ts`。
  - `_demo/demo-persona.ts`：只在删 `communityJoined` 字段时才改。
  - 对应的测试。
- **新建（强制交付契约，W0038 依赖）：** `app/(app)/app/agent/iorbit-0918/iorbit-today-events.tsx`，内容是小模组组件、紧凑社群卡，并**必须导出**以下稳定符号（名称与签名不得改；确需改动时在 REPORT 写明新签名，W0038 以 REPORT 为准）：
  - `export function formatHomeEventReason(reason: HomeEventPoolReason, lang: "en" | "zh"): string`——推荐理由文案（SC-02 的三种中英文写法），W0038 时间线的推荐行复用它。
  - `export function countHomeEventsThisTokyoWeek(pool: readonly HomeEventPoolItem[], now: Date): number`——W37-2 的「本周还有 N 场」计数。
  - `export function IOrbitTodayEvents(props: IOrbitTodayEventsProps): JSX.Element | null`——小模组组件（props 自定，至少含 `pool`、`expanded`、`communityJoined`、`lang`）。
  不得改为在 `iorbit-home.tsx` 内实现；REPORT 写明文件路径、三个导出的最终签名和固定 SHA。
- **排除：**
  - 活动池的生成、排序、读取方式与 `demoEventCandidates` 接线（W0036）。
  - 头条导语（W0036）。
  - 月历圆点、右栏「下一场活动」（W0038）。
  - `CommunityCard` 和活动页。
  - 引导页（W0035）。
  - 一键报名、付费 AI、迁移、部署。

## 验收契约

| SC | 可观察行为 | 必需证据 |
| --- | --- | --- |
| SC-W0037-01 | **判定与位置。** 小模组在「还有 N 件」之后、追问条之前。要事就绪（W0036 落地后的判定）、`eventPoolReady` 且 `items` 为空时展开（示例期固定展开，W37-1）：未加入社群时是社群卡加活动池前 2 场，已加入时是前 3 场。`items` 不为空时只有一行「本周还有 N 场适合你的活动 →」（`/app/events`），N 按 W37-2 计算（东京周一至周日），N=0 时整行不显示。要事未就绪或 `eventPoolReady` 为 false 时小模组不渲染。没有要事但 `partial` 时照样展开。活动池少于所需场数时只显示实际场数；`eventPool` 为空时没有活动卡（未加入时只剩社群卡，已加入且池空时小模组整块不渲染） | 首页组件测试（复用 `tests/pages/app-agent-iorbit-home.test.tsx` 的 `mountHome`）：空、有事、未就绪、partial、池 0／1／5 场、已加入／未加入。「本周 N」纯函数测试用东京周日 23:30 和下周一 00:10 两个边界 |
| SC-W0037-02 | **活动卡。** 每张卡写：日期 `fmtDay`，加上星期（short）和开始时间（东京时区）、标题、地点（有才显示），以及推荐理由；**不显示费用行**（W36-5：池里没有真实费用）（`plan` 写「计划里提到」，`goal` 写「匹配你目标里的『X』」，X 取 `tokens` 的前 2 个并用「、」连接，`recent` 写「近期活动」，英文对应 `In your plan`、`Matches “X” in your goal`、`Coming up soon`）。整卡是一个链接 `eventDetailHref(publicCode)`，卡里没有报名按钮。中文和英文各断言一次，日文界面落到英文 | 组件测试：三种理由（直接测 `formatHomeEventReason`）、缺地点、不出现费用行；**语言三种：zh（已知 id 显示中文标题）、en（英文标题）、ja 界面落到英文（英文标题与英文理由）；未知 id 显示原标题；地点在三种语言下都是来源原文** |
| SC-W0037-03 | **紧凑社群卡。** 显示群名、微信号、「复制」（剪贴板不可用时选中文本），旁边有「占位」标注。「看二维码」按钮带 `aria-expanded`，展开后是标「占位」的虚线框。点「我已加入」：发出一次 `PUT /api/community/membership`，卡片立即消失，第三场活动出现。连点不会发第二次请求。应答失败、`joined` 不为 true 或抛错时，卡片回来，`role="status"` 显示「没有保存成功，请再试一次。」，401 时显示「请先登录，再标记已加入。」，第三场随之撤回。所有按钮挂 `.btn` 且加进 `NEW_BUTTONS`。`CommunityCard` 和 `tests/pages/app-events-community-card.test.tsx` 保持不变 | 组件测试（mock fetch 计数、成功、失败、401、连点）。`tests/ui/orbit-button-ratchet.test.ts` 通过 |
| SC-W0037-04 | **示例首页（W37-1）。** 示例期 `page.tsx` 相对 W0036 合并后只增加 `readCommunityJoinedForActor` 1 次，参数是 canonical actor；W0036 放开的目录与本人报名仍各 1 次、不增加；`events`（canonical id）、`plan-read`、`registered-any` 仍是 0 次。示例壳相对 W0036 只多收到 `communityJoined`（活动来自 W0036 的 `demoEventCandidates`），`home` 仍是 null，`viewModel` 仍是起步模型。社群读取抛错时示例照常渲染（按未加入处理）；`demoEventCandidates` 为空时没有活动卡。示例概览：小模组用真实数据，示例期固定展开，示例今日要事不加计划行动（W36-2）；点真实活动卡是正常链接，不弹「这是示例」；「我已加入」真实发出 PUT。signals、ledger、sessions、snapshot、plans 的客户端请求仍是 0 次，其余示例内容（要事、已报名栏的示例活动、日程）不变 | 在 W0036 改写后的 `tests/pages/app-agent-guide-demo-page.test.tsx` W0014 用例上，`REAL_BUSINESS_READS` 再去掉 `community`，断言它恰好 1 次、`home` 仍恰好 1 次、目录与报名仍各 1 次；底层语句数用计量桩或本机实测记入 REPORT。首页组件测试沿用示例期「请求 0 次」的用例（第 1338、1347 行），加上小模组的断言。REPORT 在 W0036 SC-06 的数据库月预算表上追加「示例期社群读取」一行（单次实测数据库字节 × 1000 位新用户 × 每人示例期 10 次，替换 W0036 的约 3 MB 占位），重算 10%／20%／100% 合计（W0036 方案估值 1,190.83／1,235.83／1,590.83 MB）；判定线 1.6 GB（D39），超过登记 D32 风险 |
| SC-W0037-05 | **已报名栏与回归。** 已报名栏只列 `registeredEvents` 的前 2 场。没有报名时只显示「还没有报名活动。」，不出现 `data-orbit-iorbit-community`、`data-orbit-iorbit-guide-step4` 和「看看推荐」。已有的 W0003 社群行断言改为断言新设计，不保留两套。受影响的测试文件全部通过，`npx tsc --noEmit -p .` 通过，两个 ratchet 通过。在 3001 上用有活动池样本的账号（以 W0036 REPORT 为准）看空态和有事两种情况，桌面 1440 和手机 375 各一次，示例账号看一次，控制台 0 错误。做过「我已加入」的账号要用 `--reset` 恢复 | 定向集、tsc、截图路径和控制台记录写进 REPORT。没有可用的活动样本时，这一项写「受阻」，不能写成通过 |

## 一次 Generator 的执行顺序

1. 复核进入条件：W0035 和 W0036 已合并（从 W0036 REPORT 摘 `eventPool`／`eventPoolReady`／`demoEventCandidates` 的位置），W37-1～4 已由 D38 与协调者定下。保存基线和 Planner 哈希，保留用户未提交的文件。对 `IOrbitHome`、`IOrbitDemoBody`、`IOrbitShell`（用 file_path 消歧）、`AppAgentPage` 做 upstream impact，CRITICAL 和 HIGH 都在 REPORT 登记。
2. 先写 RED：判定和计数纯函数、卡片字段、社群卡的乐观更新和回滚、已报名栏、示例期读取计数。
3. 按顺序实现：新组件 → 首页接线（传入内部 `eventPool`／`eventPoolReady`）→ 已报名栏 → 示例分支社群状态（page、shell）→ 样式。
4. 整条操作链一次提交，提交前跑暂存区的 `detect-changes`。
5. 3001 浏览器验证；一次全量基线对照；一次 Codex 代码 review，同一 Generator 修复；写 REPORT，交接分支和固定 SHA。

## 最小测试与检查

- **档位：H（W37-4，协调者裁决，登记表已改）。** 理由：`IOrbitHome` 在图谱里是 CRITICAL。本 Sprint 放宽了 W0014 的示例期零读取不变式。示例期还新增了一次真实写入（PUT 社群）。按 RULES §5.1，这几样都属于 H：收口做一次 Codex 代码 review 和一次全量基线对照（RULES §5.2，不 source `.env`）。
- **开发定向集（cwd `/Users/li/work/orbit/repos/orbits`）：**
  - `tests/pages/app-agent-iorbit-home.test.tsx`：判定、卡片、社群卡、已报名栏、示例概览。
  - `tests/pages/app-agent-guide-demo-page.test.tsx`：示例期读取计数。
  - 新组件的纯函数测试，优先加到首页测试文件里。
- **操作链收口：** 以上完整文件，加上 `tests/pages/app-events-community-card.test.tsx`（证明活动页没被波及）、`tests/ui/orbit-button-ratchet.test.ts`、`tests/ui/orbit-scale-ratchet.test.ts`、`tests/pages/app-home-demo-localization.test.ts`（如果改了 demo-persona），再跑一次 typecheck；最后一次全量基线对照。
- **不运行：** 付费 AI、Preview、PG 差分测试。

## 失败与交接

REPORT 必须写清以下几项：W37-1～4 的执行结果（按 D38 与协调者裁决）；全量对照与 Codex review 结论；示例期调用矩阵（操作级与语句数，前后对比）与追加社群行后的统一月预算表；`iorbit-today-events.tsx` 的路径、三个导出的最终签名与固定 SHA（W0038 上下文包以此为准）；`CommunityCard` 没有改动的证明；3001 截图路径。

**与 W0038 的关系：**本 Sprint 合并之后 W0038 才能开工（两者都改 `iorbit-home.tsx` 的渲染区，**不能并行**）。两者都是 H 档，**不适用** RULES §1.1「合并小 Sprint」（该条只允许无依赖冲突的 L 档成组），各自独立按 H 档执行与交接：各自上下文包、Codex 代码 review、提交、全量收口、REPORT、合并登记。协调者即使复用同一个 Generator，也不能省略其中任何一步。

## 修订记录

| review 意见（[REVIEW-2026-10-01](../REVIEW-2026-10-01.md)） | 处理 |
| --- | --- |
| P1-03（活动池本地化契约不一致） | 接受。删去「标题和地点已由 W0036 本地化」的断言：共享契约与事实 7 改为标题由 W0036 在 `IOrbitHome` 用 `eventTitleForId` 按语言换好（ja → en，未知回退原标题），地点为来源原文；SC-02 覆盖 zh／en／ja→en 与未知 id |
| P1-02（统一预算口径） | 接受。示例期社群读取并入 W0036 SC-06 的统一月预算表，SC-04 要求 REPORT 追加该行并重算三档合计，超余量登记 D32 风险 |
| P2-01（示例期读取计数与源码不符） | 接受。事实 11、易错边界、SC-04 改为调用矩阵：既有示例判定复合 home 1 次（不注入示例壳）、W0036 目录 1 次与报名 1 次、本 Sprint 社群 1 次；操作级调用数与底层语句数分别记；GOAL 同步 |
| P2-03（W0038 依赖非必建文件） | 接受。`iorbit-today-events.tsx` 及导出 `formatHomeEventReason`、`countHomeEventsThisTokyoWeek`、`IOrbitTodayEvents` 改为强制交付契约；REPORT 写最终签名与固定 SHA |
| P2-04（错误引用「合并小 Sprint」） | 接受。删去 RULES §1.1 依据；写明 W0037、W0038 各自独立按 H 档执行与交接，W0037 合并后 W0038 才开工 |
| P1-01、P1-04、P2-02、P2-05、P3-01 | 不涉及本 Sprint（P1-01 的契约变化已在共享契约一节同步） |
| 短复核（Codex，2026-10-01）：预算基线 | 接受，仍为 revision 3 补丁。社群读取改为并入 W0036 SC-06 的数据库月预算表（基线 1,106.83 MB），判定线按 D39 改为 1.6 GB |
