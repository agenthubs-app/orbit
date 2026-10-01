# Sprint W0038 — 月历两色圆点与「下一场活动」

**Plan revision:** 3（2026-10-01 按 [REVIEW-2026-10-01](../REVIEW-2026-10-01.md) 修订：改 H 档、上下文包改依赖 W0037 稳定导出，见文末修订记录；revision 2 写入 D38 决定）。**模式:** existing-codebase / single-generator。运行状态只在登记表。
**原需求:** RH-04 的右栏部分：月历两色点、图例、点击路由，以及空日程行改成「下一场活动」。已报名栏归 W0037。
**单一目标:** 首页右栏的月历用实心点标日程和已报名活动，用空心圈标推荐活动；当天日程为空时显示下一场活动。
**易读目标:** [GOAL.md](GOAL.md)。
**基线:** 开工时的 `chat-agent` HEAD（编制时是 `08fe51db`）加上 W0035、W0036、W0037 的合并 SHA。
**进入条件:**
- W0036 已合并。活动池是 `IOrbitHome` 内部的 `useMemo` 常量 `eventPool`／`eventPoolReady`（不是 prop；签名以 W0036 REPORT 为准），上限 `HOME_EVENT_POOL_LIMIT = 8`，够「当月 5 场」。示例期由 W0036 的 `demoEventCandidates` prop 提供真实活动。
- **W0037 已合并**，且其 REPORT 给出 `iorbit-today-events.tsx` 的路径、`formatHomeEventReason` 等导出的最终签名与固定 SHA。两个 Sprint 都改 `iorbit-home.tsx` 的渲染区，不能并行。
- 档位 H（revision 3 由 L 改为 H，README 登记表已同步）。
- W38-1～W38-3 用户已于 2026-10-01 决定（D38），见下表「已定决定」。
- 不需要云端授权，不调用付费 AI，没有迁移。

## 共享契约（W0036 建立，只消费）

`HomeEventPoolItem = { eventId; publicCode; title; startsAt; endsAt?; place?; feeLabel?; reason }`。活动池已经去重，并排除了已报名、已开始、已取消和本人主办的活动，顺序是计划点名、目标匹配、近期。本 Sprint 不重新排序。空心圈和 W0037 小模组用的是同一个数组（`IOrbitHome` 内部 `eventPool`）。本 Sprint 在 `eventPoolReady` 为 false 时不画空心圈、不出「下一场活动」的池分支。池里的 `title` 已由 W0036 按首页语言换好（ja → en，未知 id 原标题），`place` 是来源原文；本 Sprint 不再本地化。

## 已查清的事实（2026-10-01 按 `08fe51db` 源码复核）

1. **月历不是独立组件。** 它就写在 `app/(app)/app/agent/iorbit-0918/iorbit-home.tsx` 里：
   - 第 1176 行起是右窄栏 `<aside id="calendar">`。
   - 第 1177–1231 行是选中日的面板 `data-orbit-iorbit-day-panel`（时间线和空态）。
   - 第 1234–1283 行是月历 `ir-m-cal`。
   - 日期格（第 1263–1279 行）是 `<button class="btn ir-day" data-orbit-iorbit-day aria-label={iorbitSelectedDayLabel(...)} aria-pressed>`，按钮里只有**一个** `<span class="ir-day-dot [ir-day-dot-a]">`。点日期只调用 `setSelectedDay(day)`。
2. **现在怎么按日聚合。**
   - `scheduleRows`（第 539–585 行）把三类条目合在一起：约谈 `appointmentItems`（`startsAtUtc`，有 `item.href`）、个人日程 `personalItems`（全天日程用 `occurrenceDate`）、已报名活动 `registeredEvents`（`iorbitRegisteredEvents(home.events)`）。
   - 每行的 `dayKey` 是 `iorbitDayKey`（`iorbit-model.ts:1257`，`Asia/Tokyo` 的 `YYYY-MM-DD`）。
   - 由这份数据派生出：`todayRows`（第 587 行）、`selectedRows`、`markedDays: Set<number>`（第 592–598 行，只看当月前缀）。
   - **`todayRows` 还会喂给今日要事的「2 小时内开始」（第 624 行）和导语里的「日程上有 N 项」**，所以推荐活动绝不能进 `scheduleRows`。
3. **月历只显示当月。** `iorbitCalendarCells(todayYear, todayMonth)`（`iorbit-model.ts:1271`）按周日在前排列，没有翻月。
   - 窄屏（≤900px）默认只露出本周一行（`iorbit-home-styles.ts:210–214`）。
   - 东京午夜切日的逻辑在第 311–317 行，月份跟着 `todayKey` 走。
4. **样式。**
   - 圆点的基础样式在 `iorbit-styles.ts:116–117`：`.ir-day-dot` 是绝对定位，居中、4px；`.ir-day-dot-a` 的底色是 `#4B4FC7`。
   - 首页覆盖在 `iorbit-home-styles.ts:121–126`，选中日（靛蓝底）上的点改成白色。
   - 没有 CSS 变量，颜色一律用十六进制字面值。已有的浅靛蓝是 `#B9BCEB`（证据行的小圆点、虚线框）和 `#DDDEFA`（分隔线）。
   - 时效色 `#C4461B` 只给有时间压力的东西（文件头注释）。
5. **「日程页」在哪里。**
   - 月历头的「日程页 →」（第 1248 行）和「查看日程」按钮（第 640 行）都指向 `/app/agent/plan`。但那个路由从 W0009 起已经是「我的计划」页（`app/(app)/app/agent/plan/page.tsx` 头注释）。
   - 真正的日程落点在 facts 契约里：个人日程是 `HOME_FACTS_VIEW_HREFS.personal = "/app/tasks/personal"`（`home-facts-route-service.ts:65`，也就是「个人日程」页 `app/(app)/app/tasks/personal/page.tsx`）；约谈每条自带 `item.href`（`HomeFactsAppointmentItem`，第 149 行）。
   - 已报名活动走 `/app/events/<id>`（已报名栏第 1448 行）。推荐活动走 `eventDetailHref(publicCode)`（`events-model.ts:55`）。
6. **空日程行。**
   - 第 1219–1229 行。`snapshot` 为 pending 时显示「正在读取日程…」，unavailable 时显示「日程来源暂时不可用」。选中今天时显示「今天没有已确认的日程。」，选中别的日子时显示「这一天没有日程。」。
   - 选中今天且已读到 snapshot 时，空态前面会插「现在」线（第 1220 行）。
7. **日期格式。** 首页统一用 `fmtDay`（`10/3`）加星期 short 加 `fmtTime`（第 510、523、1459–1463 行）。语言只有中英两种，日文界面落到英文（同 W0037 的事实 7）。
8. **示例期。** 示例的日程和已报名活动都是示例数据（`_demo/demo-persona.ts:312`，今天 18:30 有一场），所以示例的「今天」不会空。活动池在示例期是真实数据（W0036 经 `demoEventCandidates` 放行，`eventPoolReady` 恒为 true）。

## 已定决定（用户 2026-10-01：D38，全按推荐）

| 编号 | 决定 |
| --- | --- |
| W38-1 | 圆点**不单独可点**（嵌套交互元素不合法、4px 太小）：**点日期选中这一天**（保持现状），右栏时间线按时间顺序列出当天全部条目，推荐活动带「推荐」标记和空心记号，**点时间线条目跳转**：推荐活动进详情，个人日程进 `/app/tasks/personal`，约谈进 `item.href`，已报名活动进详情。圆点是装饰（`aria-hidden`），数量写进日期按钮的 `aria-label` |
| W38-2 | 示例期月历**画真实推荐**的空心圈（同一份 `eventPool`，来自 `demoEventCandidates`）。实心点仍是示例日程；点真实推荐活动正常跳转，点示例条目仍弹「这是示例」 |
| W38-3 | 「下一场活动」取**已报名中最早一场未开始的**；没有就取**活动池中 `startsAt` 最早的一场**（不是池的第一场：池按计划、目标、近期排序，第一场不一定最早） |

另有一项观察，不在本 Sprint 修：月历头「日程页 →」和今日要事「查看日程」仍指向 `/app/agent/plan`（现在是计划页）。登记为观察项，建议之后的 Sprint 改到 `/app/tasks/personal`。

## 上下文包（Generator 从这里起步，不通读其他 REPORT）

### 必读文件
- `app/(app)/app/agent/iorbit-0918/iorbit-home.tsx`：第 510–530 行格式化函数，第 534–606 行 `registeredEvents`、`scheduleRows`、`todayRows`、`markedDays`、`cells`，第 1175–1283 行右栏。以上是 `08fe51db` 的行号，W0035～W0037 合并后要重新定位。
- `app/(app)/app/agent/iorbit-0918/iorbit-model.ts`：第 1257 行 `iorbitDayKey`，第 1271 行 `iorbitCalendarCells`，第 1282 行 `iorbitSelectedDayLabel(year, month, day, language: "en" | "zh"): string`，第 1388 行 `iorbitRegisteredEvents`。
- `app/(app)/app/agent/iorbit-0918/iorbit-styles.ts:110–117`，`iorbit-home-styles.ts:111–126` 和第 192–215 行（窄屏）。
- `app/(app)/app/agent/home-facts-route-service.ts`：第 62–67 行 `HOME_FACTS_VIEW_HREFS`，第 133、149 行 `HomeFactsPersonalItem`、`HomeFactsAppointmentItem`。
- `app/(app)/app/events/events-0918/events-model.ts:55` 的 `eventDetailHref`。
- W0037 的强制交付导出（以 W0037 REPORT 记录的固定 SHA 与签名为准，按符号定位文件，不假设行号）：`formatHomeEventReason(reason: HomeEventPoolReason, lang: "en" | "zh"): string`，在时间线的推荐行上复用；文件为 `app/(app)/app/agent/iorbit-0918/iorbit-today-events.tsx`。若 REPORT 记录的签名与此不同，以 REPORT 为准。

### 关键符号与影响等级（GitNexus，2026-10-01）
- `IOrbitHome`：**CRITICAL**（直接调用方 2 个：`IOrbitLiveShell`、`IOrbitDemoBody`，经 `IOrbitShell` 进入 `AppAgentPage` 执行流）。本 Sprint 不新增 props，只改内部渲染；但按 RULES §5.1，**修改 HIGH／CRITICAL 符号即为 H**，不能以「不改接口」「不新增读取」或 `riskSharedAxes` 降档。
- `iorbitDayKey`：**CRITICAL**（直接调用方 8 个，包括 demo-persona 和对话页右栏）。**只调用，不改。**
- `iorbitCalendarCells`：LOW（只有首页一个调用方）。不需要改。
- `iorbitSelectedDayLabel`：用于日期按钮的 `aria-label`。推荐在首页里另外拼「日期 + 计数」，不改它的签名。
- 新增的纯函数（推荐放在 `iorbit-model.ts`，或 W0037 的新文件里）：`iorbitCalendarMarks(scheduleRows, pool, monthPrefix, limit = 5): Map<number, { schedule: number; recommended: number }>`，以及 `iorbitNextEvent(registered, pool, nowMs)`（已报名最早未开始 → 否则池内 `startsAt` 最早）。

### 前序交接要点
- W0036：活动池契约，以及它的条数上限。
- W0036：示例期经 `demoEventCandidates` 把真实活动传到 `IOrbitHome`，`eventPool` 在首页内算出。
- W0037：小模组按活动池顺序取前 2～3 场；已报名栏只放报名。
- W0021：不新增客户端读取。月历直接用 `IOrbitHome` 内部的 `eventPool`，不另外发请求。
- 验收环境同 W0037。证据放 `~/orbit-sprint-evidence/web/sprint-W0038/run-01/`。

### 易错边界（都对应到 SC）
- 推荐活动**不进** `scheduleRows`、`todayRows`、`markedDays` 和今日要事。也就是说，它不会触发「2 小时内开始」的暖色要事，导语和右栏标题里的「N 个日程」计数也不变。（SC-01）
- 东京日切分：东京时间当月最后一天 23:30 开始的活动算当月；次月 1 日 00:30 开始的不画。空心圈最多 5 场，按活动池顺序取当月的前 5 场，不是按日期取最早的 5 场。（SC-01）
- 嵌套交互元素不合法：圆点不做成点击目标，跳转放在时间线条目上。（SC-02）
- 「下一场活动」只在选中今天、snapshot 已读到、今天没有条目时出现。池分支取池内 `startsAt` 最早的一场，**不是 `eventPool[0]`**（W38-3）；`eventPoolReady` 为 false 时只看已报名。读取中或读不到时保持原来的文案。两边都没有活动时退回「今天没有已确认的日程。」（SC-03）
- 圆点和图例不用 `#C4461B`。静态样式不写内联，新按钮或链接按 `.btn` 口径中和。（SC-04）

## 范围与文件

- **修改：**
  - `iorbit-home.tsx`：圆点、图例、时间线的推荐行和条目链接、「下一场活动」行。
  - `iorbit-home-styles.ts`。
  - `iorbit-model.ts`：只新增纯函数，不改已有函数。
  - 对应的测试。
- **排除：**
  - 活动池（W0036）、小模组和已报名栏（W0037）。
  - 月历翻月、周首改为周一。
  - 「日程页 →」的落点（观察项）。
  - 日程数据源和 facts 服务。
  - 付费 AI、迁移、部署。

## 验收契约

| SC | 可观察行为 | 必需证据 |
| --- | --- | --- |
| SC-W0038-01 | **两色点。** 当月某天有约谈、个人日程或已报名活动时，画实心靛蓝点（`#4B4FC7`）。活动池里当月的前 5 场（按池的顺序，按东京日期落位）画空心浅色圈（透明底加 `#B9BCEB` 描边）。同一天两种都有时，两个点并排居中。选中日（靛蓝底）上，实心点变白，空心圈换成浅色描边。月历下方一行图例「● 日程与已报名　○ 推荐活动」，当月没有任何标记时不显示图例。推荐活动不改变 `todayRows`、今日要事、导语和「N 个日程」的计数 | 纯函数测试 `iorbitCalendarMarks`：上限 5、池的顺序、同日、跨月边界（东京时间 31 日 23:30 和 1 日 00:30）、空池。组件测试：池里有一场今天 1 小时后开始的活动时，不生成「2 小时内」要事 |
| SC-W0038-02 | **点击路由（按 W38-1 的决定）。** 点日期仍然只是选中这一天。右栏时间线按时间顺序列出这一天的全部条目，推荐活动带「推荐」标记和推荐理由。每一条都是链接：推荐活动指向 `eventDetailHref(publicCode)`，个人日程指向 `/app/tasks/personal`，约谈指向 `item.href`，已报名活动指向 `/app/events/<id>`。「现在」线照常插入。示例期：示例条目点了弹「这是示例」，真实推荐活动正常跳转（W38-2） | 组件测试：同一天有四类条目时，逐条断言 href 和顺序。示例概览的拦截断言 |
| SC-W0038-03 | **下一场活动。** 选中今天、snapshot 已就绪、今天没有任何条目时，空态行显示「下一场活动：<fmtDay> <星期> <标题>」（英文是 `Next event: …`），整行是链接。取数顺序：最早一场未开始的已报名活动，没有就取活动池中 `startsAt` 最早的一场（W38-3，不是池的第一场），两者都没有就显示「今天没有已确认的日程。」。读取中、读不到和选中别的日子时，文案和现在一样 | 组件测试覆盖四种取数分支（含「池第一场不是最早」的样本，断言取最早）和三种保持原样的分支 |
| SC-W0038-04 | **可访问性与样式。** 每个日期按钮的 `aria-label` 是「10月3日（周五），2 项日程，1 场推荐活动」这种格式（计数为 0 的项省略，英文对应 `2 scheduled, 1 recommended event`）。圆点是 `aria-hidden`。新增规则里不出现 `C4461B`。没有内联静态样式。窄屏收起时，本周那一行也显示圆点 | 组件测试（`aria-label`，以及样式字符串不含 `C4461B`）。`tests/ui/orbit-scale-ratchet.test.ts`、`tests/ui/orbit-button-ratchet.test.ts` 通过 |
| SC-W0038-05 | **回归与真实页面（H 档收口）。** 受影响的测试文件全部通过（含 H 档定向覆盖：失败、空池、跨日／跨月、示例拦截、`IOrbitLiveShell`／`IOrbitDemoBody` 两个直接消费者），`npx tsc --noEmit -p .` 通过；一次全量基线对照无新增失败；一次 Codex 代码 review 的意见已处理。在 3001 上用当月有推荐活动的账号（样本以 W0036 REPORT 为准），桌面 1440 和手机 375（收起和展开）各截一次图，点空心圈所在的日期，再点推荐条目进详情。今天没有日程的账号截一张「下一场活动」。控制台 0 错误 | 定向集、tsc、RULES §5.2 全量对照、Codex review 记录、截图路径写进 REPORT。没有当月样本时写「受阻」 |

## 一次 Generator 的执行顺序

1. 复核进入条件：W0036、W0037 已合并，W38-1～3 已由 D38 决定。保存基线和 Planner 哈希。对 `IOrbitHome`、`iorbitDayKey`、`iorbitCalendarCells` 做 upstream impact 并在 REPORT 登记。
2. 先写 RED：两个纯函数、组件的路由、`aria-label`、「下一场活动」的各个分支、推荐活动不进要事。
3. 实现，加样式。整条操作链一次提交，提交前跑 `detect-changes`。
4. 3001 浏览器验证；一次全量基线对照；一次 Codex 代码 review，同一 Generator 修复；写 REPORT，交接分支和固定 SHA。

## 最小测试与检查

- **档位：H（revision 3 由 L 改为 H，review P1-04）。** 依据 RULES §5.1：直接修改 CRITICAL 的 `IOrbitHome`（2 个直接调用方、进入 `AppAgentPage` 执行流），条件是「修改」而不是「改接口」。本 Sprint 没有新读取、写入和 props，这些只说明风险面窄，不作降档理由。
- **H 档定向覆盖（都写成测试）：**
  - 失败：snapshot pending／unavailable 时空日程行保持原文案；`eventPoolReady` 为 false 时不画空心圈、「下一场活动」只看已报名。
  - 空池：`eventPool` 为空时无空心圈、无图例中的推荐项、「下一场活动」退回已报名或原文案。
  - 跨日／跨月：东京月末 23:30 与次月 1 日 00:30；东京午夜切日后选中日与圆点随 `todayKey` 更新（沿用第 311–317 行逻辑）。
  - 示例拦截：示例条目点了弹「这是示例」，真实推荐活动正常跳转（W38-2）。
  - 所有直接消费者：`IOrbitLiveShell` 与 `IOrbitDemoBody` 两条渲染路径各至少一个用例（`tests/pages/app-agent-iorbit-home.test.tsx` 已用 `<IOrbitShell …>` 挂载真实壳、用 `<IOrbitShell guide={…}>` 挂载示例壳，如第 1229、1340 行一带，在其上加月历断言）；`iorbit-model.ts` 新增纯函数不影响 `iorbitDayKey` 的 8 个调用方（只调用不改）。
- **开发定向集（cwd `/Users/li/work/orbit/repos/orbits`）：** `tests/pages/app-agent-iorbit-home.test.tsx`（复用 `mountHome`；已有的「picking a calendar day drives the day panel」第 834 行和「month toggle」第 816 行要保持通过）。纯函数测试加在同一个文件里。
- **操作链收口：** 以上完整文件、`tests/pages/app-agent-iorbit-screens.test.tsx`（`iorbit-model.ts` 的其他消费者与真实壳）、`tests/pages/app-agent-guide-demo-page.test.tsx`（示例分支 props 不变）、两个 ratchet，再跑一次 typecheck；**一次 Codex 代码 review**（意见交同一 Generator 修，不做复查）；**本 Sprint 本地代码收口时一次全量基线对照**（RULES §5.2，不 source `.env`）。大目标 3 的跨 Sprint 全量仍在 W0039。
- **不运行：** 付费 AI、Preview、PG 测试。

## 失败与交接

REPORT 写清以下几项：W38-1～3 的执行结果（按 D38）；`IOrbitHome` 等符号的 upstream impact 结果；全量对照与 Codex review 结论；观察项「日程页 → 仍指向计划页」；截图路径。本 Sprint 按独立 H 档执行与交接，必须在 W0037 **合并**之后才开工；不适用 RULES §1.1「合并小 Sprint」（该条只允许无依赖冲突的 L 档成组），即使协调者复用同一 Generator，也要各自上下文、review、提交、收口、REPORT、合并登记。

## 修订记录

| review 意见（[REVIEW-2026-10-01](../REVIEW-2026-10-01.md)） | 处理 |
| --- | --- |
| P1-04（错误降为 L 档） | 接受。档位改 H：一次 Codex 代码 review、H 档定向覆盖（失败、空池、跨日／跨月、示例拦截、两个直接消费者）、本 Sprint 本地收口一次全量；执行顺序、SC-05、进入条件同步；README 登记表 W0038 行改为「（H：IOrbitHome CRITICAL）」 |
| P2-03（上下文依赖非必建文件） | 接受。上下文包改为依赖 W0037 强制交付的稳定导出 `formatHomeEventReason`，以 W0037 REPORT 的固定 SHA 与签名为准；进入条件要求 REPORT 写明 |
| P2-04（错误引用「合并小 Sprint」） | 接受。删去 RULES §1.1 依据，写明独立 H 档执行、W0037 合并后才开工 |
| P1-03（展示语言） | 同步。共享契约注明池标题已由 W0036 按语言换好、地点为原文，本 Sprint 不再本地化 |
| P1-01、P1-02、P2-01、P2-02、P2-05、P3-01 | 不涉及本 Sprint（P2-05 的翻月仍在排除项，不新增） |
