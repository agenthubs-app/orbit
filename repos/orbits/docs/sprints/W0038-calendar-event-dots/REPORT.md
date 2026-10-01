# Sprint W0038 — 执行总结

## 结果

对应 [GOAL.md](GOAL.md)。

- 已验证能做到：
  - 月历两色点：当月有约谈、个人日程或已报名活动的日子画实心靛蓝点；活动池里当月的前 5 场（按池的顺序、按东京日期落位）画空心浅色圈；同一天两种都有时并排居中。选中日上实心点变白、空心圈换浅色描边。月历下方有图例「● 日程与已报名 ○ 推荐活动」，只列当月实际出现的那一类，当月没有标记时整行不显示。（SC-01）
  - 推荐活动不进 `scheduleRows`／`todayRows`：不会触发「2 小时内」要事，导语和右栏「N 个日程」的计数不变。（SC-01）
  - 点日期仍然只是选中这一天。右栏时间线按时间顺序列出这一天的全部条目，每条都是链接：约谈去 `item.href`，个人日程去 `/app/tasks/personal`，已报名活动和推荐活动去活动详情；推荐活动带「推荐」标记、空心记号和推荐理由（复用 W0037 的 `formatHomeEventReason`）。「现在」线照常插入。示例期：示例条目点了弹「这是示例」，真实推荐活动正常跳转。（SC-02）
  - 选中今天、snapshot 已读到、当天时间线为空时，空态行变成整行链接「下一场活动：10/11 周日 <标题>」（英文 `Next event: …`）：先取最早一场未开始的已报名活动，没有就取活动池里 `startsAt` 最早的一场（不是 `eventPool[0]`）；池未就绪时只看已报名；两边都没有时仍是「今天没有已确认的日程。」。读取中、读不到、选中别的日子时文案不变。（SC-03）
  - 日期按钮 `aria-label` 形如「9月29日（周二），1 项日程，1 场推荐活动」（计数为 0 的项省略；英文 `…, 2 scheduled, 1 recommended event`），圆点 `aria-hidden`；新规则不用 `#C4461B`，没有内联样式。（SC-04）
  - 3001 上用 verify-legacy（示例期）和 verify-plan（真实期）走通，桌面 1440、手机 375（收起与展开）都看过。（SC-05）
- 仍未实现或未验证：
  - 手机收起状态下「本周那一行也显示圆点」没能在浏览器里看到：本机验收库这周（9/27–10/3）没有活动池活动，verify-plan 本周也没有日程。这一条靠组件测试证明（本周格子没有 `data-off-week`，圆点就在格子里；样式里没有隐藏圆点的规则）。没有为此改 seed。
  - 「下一场活动」的池分支（没有报名、取池内最早）只在组件测试里验证；浏览器里看到的是已报名分支（verify-plan）。verify-legacy 处在示例期，示例今天不空。

## 运行记录

- 结果：completed（等待协调者合并）
- Generator：Opus 5.5／2026-10-01；Planner revision 3（SHA256 `69380fd46ff2365423e93a35a81adc267e2882ee2d57a1e31d1b463a93fd4e97`）
- 分支 `sprint/W0038-calendar-event-dots`，基线 `chat-agent` `695748c9`（已含 W0035 `3dc60dc4`、W0036 `31267c09`、W0037 `346b3298`）。功能提交 `d3f89672`；`chat-agent` 合并 SHA 等待协调者。
- 档位 H。全量对照按 RULES §5.2，不 source `.env`：功能已提交，所以与 W0037 一样把本 Sprint 的 4 个路径临时换回 `695748c9` 跑基线，跑完换回 HEAD（工作树复核干净）。基线 6154 项、9 项失败；改后 6166 项、9 项失败；失败清单一致，**新增失败 0**（`full-baseline.log`、`full-after.log`、`fail-*.norm.txt`）。
- 收口定向集 8 个文件 234/234 通过、skipped 0（`targeted-1.log`）：`app-agent-iorbit-home`（含 W0038 新增 12 个用例；原「picking a calendar day drives the day panel」「month toggle」照常通过）、`app-agent-iorbit-screens`、`app-agent-guide-demo-page`、`app-agent-iorbit-chat`（`iorbitSelectedDayLabel`／`iorbitRegisteredEvents` 的其他消费者）、`app-home-live-route-services`、`app-home-demo-localization`、两个 ratchet。定向集没有 PG 用例；`assert-local-test-databases` 退出码 0。RED 记录在 `red.log`（新增 12 个用例全部失败）。
- `npx tsc --noEmit -p .`：源码 0 错误，只有 `.next/types/validator.ts` 的 8 条既有错误。
- 付费 AI 调用 0 次。未 push、未部署、无迁移、无数据写入。
- 证据目录 `~/orbit-sprint-evidence/web/sprint-W0038/run-01/`：截图 01–08、`browser-notes.txt`、impact、detect-changes、RED／定向／全量日志、tsc、Codex review 全文。

## 验收结果

| SC | 结果 | 证据 |
| --- | --- | --- |
| SC-W0038-01 两色点 | pass | 纯函数 `iorbitMonthRecommendations`／`iorbitCalendarMarks`：上限 5、池的顺序（第 6 场当月活动日期最早也不画）、同日计数、东京 10/31 23:30 算当月与 11/1 00:30 不算、9/30 15:30Z（东京 10/1 00:30）算 10 月、空池只剩实心。组件：今天 1 小时后开始的池活动只出空心圈，不进今日要事、无「还有 1 小时」、右栏仍「0 个日程」；同日并排两点；无标记不出图例；空池图例无推荐项；东京午夜跨月后选中日、圆点、时间线随 `todayKey` 更新；池未就绪不画圈。截图 01、05、08 |
| SC-W0038-02 点击路由 | pass | 组件：同一天四类条目按时间排序，逐条断言 kind 与 href（`/app/schedule`、`/app/events/REC-1`、`/app/tasks/personal`、`/app/events/ev-reg`），推荐行含「推荐」、理由与地点，「现在」线在第一条未开始条目之前，真实期链接无 onClick；示例壳（`IOrbitDemoBody`）：示例行点击 `preventDefault` 并弹「这是示例」，真实推荐行 onClick 为 undefined、无示例角标，挂载 0 请求。浏览器：示例期点 10/11 的推荐行进入 `/app/events/ORBIT-VERIFY-UPCOMING`（截图 02、03），点示例行弹拦截层（截图 04）；真实期点 10/15 推荐行进入 `/app/events/ORBIT-VERIFY-GOAL-LEGACY`（截图 06） |
| SC-W0038-03 下一场活动 | pass | 纯函数 `iorbitNextEvent`：已报名最早未开始、池内最早（非 pool[0]）、池 null 不看、都没有返回 null。组件：已报名分支、池分支（中英文）、都没有退回原文案；pending／unavailable／其他日子保持原文案；计划未读完（池未就绪）时只看已报名，读完后切到池分支。浏览器：verify-plan 今天无日程，显示「下一场活动：10/11 周日 验收用：企业软件创业者交流会」，手机上点击进入详情（截图 05、07） |
| SC-W0038-04 可访问性与样式 | pass | 纯函数 `iorbitCalendarDayLabel` 中英文与省略 0；组件断言 `aria-label`、圆点容器 `aria-hidden`；W0038 新规则（≥6 条）不含 `C4461B`；选中日 `.ir-day-on .ir-day-dot-r` 规则存在；月历与时间线节点无 `style`；本周格子无 `data-off-week`、圆点在格子里。两个 ratchet 通过 |
| SC-W0038-05 回归与真实页面 | pass | 定向集 234/234、tsc 源码 0 错误、全量新增失败 0、Codex review 1 条已处理（见下）。两条直接消费者路径各有用例：`IOrbitLiveShell`（SSR，home 的报名画实心点并写进 `aria-label`）、`IOrbitDemoBody`（示例拦截）。3001 桌面 1440 与手机 375 收起／展开截图 01–08；控制台只有既有的 `/api/inbox/summary` 503、dev HMR websocket，以及切换账号时手动登出后的一次 `/api/account/me` 401，没有应用错误；首页没有新增客户端请求 |

## 假设与额外阅读

- 额外阅读（先查调用方）：`features/agent/home-event-pool.ts`（池顺序与排除规则，确认 `upcoming` 不排序，测试才能构造「池首不是最早」）；`iorbit-shell.tsx` 中 `IOrbitHome` 的两处渲染；`_demo/demo-clock.ts`；`tests/ui/orbit-button-ratchet.test.ts`、`orbit-scale-ratchet.test.ts` 的规则；`scripts/verify-server.sh`、`seed-verify-accounts.ts`（验收活动日期按 seed 时刻偏移）、`verify-session-cookie.ts`。
- 新增路径：无（只改 PLANNER 白名单内的 3 个源文件与首页测试文件）。
- 选择：
  - 新增纯函数放在 `iorbit-model.ts`：`iorbitMonthRecommendations`、`iorbitCalendarMarks`、`iorbitCalendarDayLabel`、`iorbitNextEvent`（及类型 `IOrbitCalendarMark`、`IOrbitNextEvent`）；已有函数未改。`iorbitCalendarMarks` 签名与 PLANNER 一致；另拆出 `iorbitMonthRecommendations`，让圆圈与时间线推荐行用同一份「当月前 5 场」。
  - 时间线推荐行只列当天落在「当月前 5 场」里的推荐活动，与空心圈一致。
  - 「下一场活动」的条件是「当天时间线（含推荐行）为空」；已报名和池都只取 `startsAt > now` 的。
  - 个人日程去处用首页内常量 `PERSONAL_SCHEDULE_HREF = "/app/tasks/personal"`：`HOME_FACTS_VIEW_HREFS` 不导出，且所在文件是服务端模块，不引入客户端包。
  - 示例期「下一场活动」若取到示例报名，也按示例拦截；取到真实池活动则正常跳转。示例今天不空，实际不会出现。
  - 圆点改为有标记才渲染（原来每格都有一个透明点）；空心圈 5px、1px `#B9BCEB` 描边，选中日换 `#DDDEFA`。
  - 测试夹具 `mountHome` 加了可选 `onInterval`，用来模拟跨东京午夜，不影响其他用例。
- 影响分析：开工时 `analyze --index-only` 后，索引里首页文件的符号 id 错乱（按 uid／文件查不到、detect-changes 报「没有索引符号覆盖改动」），于是 `analyze --index-only --force` 重建后重跑（结果含本 Sprint 新增的调用方）：
  - `IOrbitHome`：**CRITICAL**，直接调用方 `IOrbitDemoBody`、`IOrbitLiveShell`（与 PLANNER 一致）。
  - `iorbitDayKey`：**HIGH**（重建前为 UNKNOWN）；直接调用方 9 个：`buildDemoHomeData`、`buildDemoPlanSnapshot`、`shiftDay`（demo-persona）、`IOrbitHome`、`scheduleRows`、`iorbitEventChipDate`、`iorbitRelativeDayLabel`、`demoChat`（shell），以及新增的 `iorbitMonthRecommendations`。只调用，未改。
  - `iorbitSelectedDayLabel`：**HIGH**；调用方 `IOrbitChat`、`IOrbitHome`、新增的 `iorbitCalendarDayLabel`。未改签名和实现。
  - `iorbitCalendarCells`：LOW；`iorbitRegisteredEvents`：LOW（对话页右栏与首页）。都未改。
  - `formatHomeEventReason`：CRITICAL（经 `IOrbitTodayEvents` 进首页），只调用未改。
  - 重建前的 UNKNOWN 已用文本搜索补查：调用文件为 demo-clock、demo-persona、iorbit-model、iorbit-chat-aside、iorbit-home、iorbit-shell、iorbit-chat，与重建后一致。
  - 提交前 `detect-changes --scope staged`：4 个文件、54 个符号、受影响流程 0、risk low，非 partial、非 truncated（`detect-changes-commit1.txt`）。

## review 处理（仅 H 档）

`codex review -c model="gpt-5.6-sol" --base chat-agent`，全文 `codex-review.txt`。功能改动没有意见，定向测试它自己也跑过（111/111）。

| 意见 | 判断 | 处理 |
| --- | --- | --- |
| P2：`repos/orbits/next-env.d.ts` 的引用被改成 `.next-verify`，提交后会在干净环境里报错，应恢复 | 不适用于本分支 | 这是工作树里的未提交改动（3001 dev server 生成；协调者列为用户未提交文件，不得覆盖），不在 `d3f89672` 里，`git diff chat-agent..HEAD` 不含此文件。没有提交，也没有改它 |

## 交接

- **W38-1～W38-3 按 D38 执行**：W38-1 圆点不可点、点日期选中、时间线条目跳转（四类去处如上）、`aria-label` 带数量；W38-2 示例期画真实推荐空心圈，真实推荐正常跳转，示例条目拦截；W38-3 已报名最早未开始 → 池内 `startsAt` 最早。
- **给 W0039（大目标 3 收口）**：
  - 功能固定在 `d3f89672`。改动只在 `iorbit-home.tsx`、`iorbit-home-styles.ts`、`iorbit-model.ts` 和首页测试文件；没有新增 props、读取、写入或迁移。
  - DOM 标记：`data-orbit-iorbit-tl-item="appointment|personal|registered|recommended"`（时间线链接）、`data-orbit-iorbit-next-event="registered|recommended"`、`data-orbit-iorbit-cal-legend`；圆点 `.ir-day-dots > .ir-day-dot.ir-day-dot-a|.ir-day-dot-r`。
  - 新导出：`iorbit-model.ts` 的 `iorbitMonthRecommendations`、`iorbitCalendarMarks`、`iorbitCalendarDayLabel`、`iorbitNextEvent`。
  - 全量基线：本 Sprint 收口时 6166 项、9 项既有失败（与之前 9 项相同）。跨 Sprint 的全量对照仍在 W0039。
- **观察项（未修，按 PLANNER）**：月历头「日程页 →」和今日要事「查看日程」仍指向 `/app/agent/plan`（现在是计划页），建议之后的 Sprint 改到 `/app/tasks/personal`。
- **观察项**：本机验收库的活动日期按 seed 时刻偏移，这周没有活动池活动；要在浏览器里看手机收起时本周行的空心圈，需要本周有一场池活动（重新 seed 或加一场本周活动）。这次没有改 seed。
- **观察项**：GitNexus 增量索引（`--index-only`）这次给首页文件生成了错乱的符号 id，`--force` 重建后恢复。后续 Sprint 若 detect-changes 报「没有索引符号覆盖改动」，先 `--force` 重建。
- `repos/orbits/next-env.d.ts` 被 3001 dev server 改写，未提交。3001 已停；3000 是其他会话的 server，未动。验收账号没有数据写入，不需要 `--reset`。
- 回退：`git revert d3f89672`（无迁移、无存储 key）。
