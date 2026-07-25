# Today × 日程 合并 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development。任务为"精确规格 + 硬验证门"式；实现前先读现场。

**设计依据（必读）：** `docs/superpowers/specs/2026-07-25-today-schedule-merge-design.md`（含布局图、功能对账表、已拍板决策：入口名「日程」/过滤淡化/保留完整护栏文案）。

## Global Constraints

- 分支 `today-schedule-merge`。工作目录 `/Users/li/work/orbit/repos/orbits`。基线：`npm test` 1017 tests / **63 fail**；不得新增失败。
- **功能零丢失**：设计文档第 4 节对账表是验收清单——三个来源页的每一项功能在合并页必须可用。
- 全程使用现有体系：`.btn` 变体、`FormField`、`ModalShell`（含 bottom-sheet variant）、`ORBIT_Z`、`--r-*`、type/spacing scale（三条棘轮不得升）、`localizeOrbitTree` 中文纯字符串。
- 页面必须在 `data-orbit-real-page` 包裹内；移动端 ≤760 单列（今日两栏页已有 `.orbit-today-columns` 机制，可扩展）。
- dev server 由控制器管理（3000）。每任务提交前跑本任务门测试；commit 尾注 `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`。
- 数据装配全部在 server（page.tsx）：现有 `loadAppTodayRouteViewModel` + `loadAppScheduleRouteViewModel`（schedule/page.tsx:16）+ `loadAppFollowupsRouteViewModel` → `followupsRouteToOrbitScheduleViewModel`（followups/page.tsx:11-15）。合并页并行 `Promise.all` 加载三者；任一失败降级为该区块的错误态（不整页失败）。

---

### T1 骨架合并（设计 P1）

**目标**：`/app/today` 变为 7/5 双栏工作台；旧日历（月历+当日/本月+时间轴+安排约见弹窗）迁入左栏；右栏 = 现 Today 三区块 + 关系安排卡区块。`/app/followups` 与 `/app/schedule` 两页此阶段**保持原样可用**。

1. **组件抽取（纯搬运，不改逻辑）**：
   - 从 `followups/orbit-real-schedule.tsx` 抽出可复用件到 `today/orbit-today-time-spine.tsx`（client）：迷你月历（翻月/今天/选日）、当日|本月 切换、会议卡（展开详情/查看名片/起草邮件）、空态文案、安排约见 ModalShell。原 followups 组件改为消费同一抽出件（保证两处渲染一致、不复制粘贴）。
   - 从 `schedule/orbit-real-schedule-page.tsx` 抽出安排卡渲染到 `today/orbit-today-arrangements.tsx`（含关系原因/跟进时机/来源·证据数/深链/护栏完整文案/区头统计），原 schedule 页改为消费之。
2. **合并页装配**：`today/page.tsx` 并行加载三 VM；页头 = 一行问候+决策计数 + `安排约见`/`添加来源` 两按钮（btn 变体）；左栏 `orbit-today-time-spine`（时间轴合流：约见卡 + 关系安排中的已确认活动映射为时间轴事件）；右栏 = 需要你决定（暂保持现有卡+常驻详情面板布局，T2 再改）→ 可复核安排 → ORBIT 已准备/最近完成折叠区（新增折叠：`<details>` 或受控 state，默认收起，计数徽标）。
3. **URL 状态**：`?date=YYYY-MM-DD`、`?view=day|month` server 解析进 VM；月历选日 = 导航更新 query（沿用 `?entry=` 的 URL-驱动模式）。
4. **过滤淡化**：选中日期时，带日期属性的卡（时间轴事件天然过滤；右栏安排卡不相关者 `opacity:.45` + `aria-disabled` 不置）；决策卡不受影响（代码注释说明拍板规则）。
5. **门测试** `tests/pages/app-today-merged.test.ts`（新）：
   - VM：`?date` 解析、`?view` 两态、三源装配的降级（scenario=failure 单源失败→该区块 errorCopy、其余正常）。
   - 渲染（renderToStaticMarkup）：合并页含 月历标记、当日/本月控件、决策区、安排区、折叠区、页头两按钮、护栏文案关键句（"不会写入日历"与"只保存为草稿"同时存在）。
   - 对账断言：查看名片/起草邮件/展开详情/添加来源/安排约见 字符串齐全。
6. 跑：新门 + `app-today-*` 全部既有 + `app-followups-live-route-services` + schedule 相关 + 三棘轮 + curl today/followups/schedule 200。

Commit: `feat(today): merge the calendar spine and arrangements into the today workspace`

### T2 决策卡原位展开（设计 P2）

1. 右栏决策卡重构为 accordion：收起=现列表卡样式；展开=完整详情（whyNow/证据 chip/确认后将会/草稿内联编辑/子操作勾选/确认执行·稍后处理/护栏文案）——内容与现 `orbit-today-decision-panel.tsx` 零删减，组件改造为展开体内嵌（面板组件保留并复用其内容结构，常驻右列布局移除）。
2. `?entry=` 驱动展开；一次一张；Esc/再点收起；展开动效 200ms ease-out、收起 140ms、`prefers-reduced-motion` 直切。
3. 布局：右栏收回单列流（原 `minmax(0,380px)` 详情列取消），`.orbit-today-columns` 网格调整为 时间脊柱 7fr / 行动流 5fr；≤760 单列顺序=决策→时间轴→安排→折叠区。
4. 门测试更新：`app-today-decision-panel.test.tsx` 断言迁移到展开体（确保三问文案/草稿/护栏仍在）；新增展开态断言（`?entry=` 时对应卡含确认执行按钮，未选中卡不含）。
5. 跑：today 全部测试 + 棘轮 + curl。

Commit: `feat(today): inline-expand decision cards with full detail parity`

### T3 导航与路由收敛 + 移动端（设计 P3）

1. **导航**：`orbit-public-shell.tsx` links 数组 4→3：`[["/today","日程","today"],["/events","活动","events"],["/contacts","人脉","cards"]]`（**入口名改「日程」**，en 用 "Schedule"）；`pageLabels.today` 同步改；汉堡 menuItems 移除旧日程项、Today 项改名日程（icon 用 calendar，原 clock 项删除）；`OrbitNavActive` 的 `"schedule"` 成员保留（其他页仍在用则不动，无用则清）。
2. **路由 301**：`followups/page.tsx` 与 `schedule/page.tsx` 改为 `redirect("/app/today?view=day")` / `redirect("/app/today#arrangements")`（`next/navigation` 的 redirect；保留原组件文件供合并页复用）。schedule/events/[id] 详情页保留不动。
3. **移动端**：`orbit-today-time-spine` ≤760 时月历折叠为周条（7 格 44pt，横向滑动换周，点"全月"以 ModalShell bottom-sheet 打开完整月历）；安排约见按钮在 ≤760 隐藏页头版、显示 FAB（fixed 右下，`ORBIT_Z.sticky`，56pt，aria-label）。
4. **门更新**：`orbit-top-nav-links.test.ts` 期望数组改为三项+断言 label 日程（更新其 deepEqual 与死链检查——redirect 页也算"真实可达"：page.tsx 存在即可）；`orbit-top-nav-structure.test.ts` menuItems 断言更新（含 "today" 键、不含独立 schedule 项）；`orbit-p2-gates.test.ts` 行数门适配 redirect 薄壳。
5. 跑：全部 nav/today/schedule 相关测试 + `npm test` 全套（≤63 失败）+ 控制器双端浏览器验收。

Commit: `feat(nav): fold schedule into the today workspace with redirects and mobile calendar`

### T4 终验

lint → `npm test`（≤63）→ 控制器浏览器全面验收（桌面 1440：双栏/月历/时间轴/展开决策/淡化联动；移动 390：周条/FAB/单列顺序；深浅主题）→ 整分支终审（最强模型，对账表逐项）→ 修 → 合并 chat-agent + push（用户已有推送惯例）。
