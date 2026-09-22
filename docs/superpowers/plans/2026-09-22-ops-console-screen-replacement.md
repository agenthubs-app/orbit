# 运营台（主办方侧）屏级替换 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 按 `Events 运营台.dc.html` 把主办方侧 7 张屏（活动中心 hub / 概览 ops / 匹配与分组 match / 参会者 people / 签到 checkin / 报名设置 form / 数据报告 report）与协作者抽屉做成 1:1，数据与写操作全部沿用现有六个 client 工作区的逻辑（生成/发布生命周期、准入审核、签到、题集草稿/发布、角色授权、分析聚合）零改动；旧工作区文件在切换后删除。

**Architecture:** 与个人中心相同的「先抽 hook、再按设计建屏」策略：每个现有工作区（`event-center-workspace.tsx`、`event-operations-admin-workspace.tsx`、`event-admission-review-workspace.tsx` + `event-admission-policy-panel.tsx`、`limited-check-in-roster.tsx`、`event-experience-editor.tsx`、`event-role-management-workspace.tsx`、`event-analytics-route.tsx`）先把状态 + fetch + 动作原样抽成 `ops-0918/use-*.ts` hook（旧组件改调 hook、JSX 不动，既有测试证明零变化），再建 `ops-0918/*.tsx` 屏消费 hook。像素规则 / `.btn` 中和 / 比对工具 / 门槛口径沿用前三份计划；类前缀 `op-*`，作用域 `[data-orbit-real-page="ops-0918"]`。

## Global Constraints

- 工作树 / 分支 / 绝对路径 / 冻结文件（`orbit-reference-styles.tsx`）/ trailer / 永不 amend·stash / ratchet（现 button 118、scale 36/16/194）/ typecheck 0 / detect-changes / impact / 每任务台账 `- **运营台 任务 N 完成** …` 同前。
- `$DESIGN` = `/Users/li/work/orbit/docs/designs/Orbit_0918/Events 运营台.dc.html`（728 行；核对过的区间：43 `<main>`（`padding:14px 40px 72px; gap:24px`）；46–91 活动中心（hubTabs 全部/即将开始/进行中/已结束 + events 卡：封面/状态 chip/标题/描述/日期·时间·地点/报名·匹配·签到三计数/「进入运营 →」或「查看数据」）；92–113 运营台共用头部（面包屑「活动中心 / {crumb}」、标题/副标、「查看活动页面 →」「更多 ⌄」、六页签 opsTabs）；115–164 概览（三大数 86/64/未发布 → 报名数/匹配数/发布状态；运营进度五阶段 steps；「查看分组结果 →」「重新生成」；当前设置四项 config + 「编辑配置」；「需要处理」incomplete 列表 + 「查看详情 →」；「前往发布 →」）；166–209 匹配与分组（四计数、第 1/2 轮切换、tables 桌卡、「3 位参会者资料不足」提示、「查看参会者 →」「重新生成」「发布结果 →」）；211–251 参会者（peopleFilters、people 表：头像/姓名/公司职位/资料完整度 chip/匹配状态 chip/「查看详情」、右侧统计 86/68/18 + 建议优先补齐）；253–298 签到（说明条、checkFilters 未签到/已签到/全部、搜索、rows 表：头像/姓名/公司职位/票种/分组/状态 chip/「标记到场 / 重试 / 已签到」、右侧「最新签到」流 + 「查看全部 →」）；300–367 报名设置（「保存草稿」「发布报名设置」、报名弹窗说明 textarea、报名问题列表 questions（序号/标题/类型/必填 chip/编辑·删除）+「＋ 添加问题」、右侧报名弹窗预览）；369–445 数据报告（整体视图/我的视图、四大数 86/64/42/18、报名趋势柱图 trend、参会者来源 sources 环/列表、现场转化 74%/49%、会后跟进 18/11、报表说明）；447–481 协作者抽屉（当前协作者列表 角色 chip、添加协作者 输入+按钮）；renderVals 482–728）。
- **像素规则**同前（`op-*`；`.btn.op-*` 整段中和 + `:active{transform:none}`；`:hover` 只写设计声明；动态色内联；选中态修饰类；设计 mock（Tokyo AI Meetup / 86 / 64 / 张明 / 李青 / 校友推荐 37% 等）不得出现；头像首字母）。设计 `<button>` 字号按渲染结果。
- **页面接线**：主办方路由都是登录+角色门禁页（现有 page.tsx 已做 `auth` + `requireEventCapability`/角色解析——**不动**），只换渲染组件：包裹 div `data-orbit-real-page="ops-0918"` + `<AccountTopNav active="events" />` + 屏。
- **比对工具（任务 0）**：`compare-0918.mjs` 加 `ops` 表（设计侧点击序列：hub 无点击；ops = 点第一张卡「进入运营 →」；match/people/checkin/form/report = ops 后点对应页签 `getByRole("button",{name,exact:true})`；drawer = ops 后点「更多 ⌄」→「协作者」——以设计源码为准）。应用侧 URL：`/app/events/center`、`/app/events/<id>/operations`、`…/operations?tab=match`、`…/operations/admission`、`…/operations/check-in`、`…/operations/experience`、`/app/events/<id>/analytics`、`…/operations?drawer=roles`。
- **验证数据**：沿用 Events 计划的本地库 `orbit_newui_events_20260922`（`.env.local` 已指向；不要重启 dev server）；主办方账号 `organizer@orbit.example.test` / `OrbitDemo2026!`；活动 `10000000-0000-4000-8000-000000000001`（a/b 已报名，已交换名片 1 对；生成结果 `not_generated`）。任务 0 由 organizer 在现有运营台「开始生成」并运行一次 `npm run event-operations:worker`（读 `docs/event-operations-e2e.md` 与 `scripts/run-event-operations-worker.ts`），使 `匹配结果`/`两轮分桌` 存在（可不发布，保留「待发布」态给概览/匹配屏）；签到台标记 participant.a 到场一次。
- **真实数据映射（元素级决定；无来源一律省略并记台账）**：
  - hub：卡片 = `EventCenterWorkspace` 的活动列表（状态 chip 按现有 status；描述/日期/时间/地点/封面真实；三计数 = 报名/匹配（已发布分桌人数或 —）/签到 真实；「查看数据」当已结束）；hubTabs 按状态过滤；搜索按标题；「当前身份：活动运营」= 真实角色标签。「＋ 创建活动」保留现有入口。
  - ops 概览：三大数 = 报名数 / 匹配数（最新生成参与人数或 —）/ 发布状态（已发布 vN / 待发布 / 未生成）；五阶段 steps 由生成生命周期真实状态推导（报名中 = 报名窗开着；已生成匹配 = 生成 completed；等待检查分组 = completed 未发布；未发布/已发布；活动现场 = eventPhase active/ended），日期取真实时间戳，无 → 空；「重新生成」= 现有「开始生成」动作（含二次确认与冲突提示原样）；当前设置四项 = 现有配置（每桌人数/轮次/推荐数/已报名），「编辑配置」→ 现有配置表单（保留在本屏折叠区或链到 experience）；「需要处理」= 资料不足参会者（admission 数据；无 → 空态）；「前往发布 →」= 现有原子发布动作（条件与文案原样）；名片交换审计与签到链接卡（现有能力，设计无）→ 保留为附加卡（记偏差）。
  - match：四计数真实（报名/参与匹配/桌数/轮次）；两轮桌卡 = 已完成生成的分桌（未生成 → 空态「尚未生成」+「重新生成」按钮）；「N 位参会者资料不足」= 真实计数；「发布结果 →」= 原子发布。
  - people：= admission 审核工作区数据（申请列表 + 资料完整度 + 匹配参与状态）；filters 真实；「查看详情」→ 现有审核详情（保留在抽屉或行展开）；准入政策面板（现有）→ 折叠区，记偏差。
  - checkin：= `LimitedCheckInRoster`（标记到场/重试/已签到 状态与错误模型原样；票种/分组无来源 → 列省略；「最新签到」= 按 checkedInAt 倒序前 5）。
  - form：= `EventExperienceEditor`（说明 textarea、题集列表（标题/类型/必填）+ 添加/编辑/删除、保存草稿/发布、冲突提示原样；右侧预览用真实草稿）；设计的「4 题固定示例」不写死。
  - report：= `EventAnalyticsRoute`（aggregate/attendee 两接口）：四大数与趋势/来源/转化/跟进按接口真实字段映射（无字段的区块省略；「我的视图」= attendee 接口）；报表说明原样。
  - drawer：= `EventRoleManagementWorkspace`（协作者列表 + 角色 chip + 添加/移除/改角色）作为 ops 页 `?drawer=roles` 的右侧抽屉；`/operations/roles` 路由保留为深链（打开抽屉）。

## 文件结构（`$WEB/app/(app)/app/events/ops-0918/`）
`ops-shell.tsx`（hub 头 / 运营台头 + 六页签 + `OPS_STYLES` + toast + 抽屉挂载）、`ops-model.ts`（状态→chip、阶段推导、计数）、hooks：`use-event-center.ts`、`use-event-operations.ts`（抽自 admin workspace）、`use-admission-review.ts`、`use-check-in-roster.ts`、`use-experience-editor.ts`、`use-role-management.ts`、`use-event-analytics.ts`；屏：`ops-hub.tsx`、`ops-overview.tsx`、`ops-match.tsx`、`ops-people.tsx`、`ops-checkin.tsx`、`ops-form.tsx`、`ops-report.tsx`、`ops-roles-drawer.tsx`。修改：七个 `page.tsx` 只换渲染组件。删除（最后一任务）：七个旧工作区文件。

## Tasks
- **Task 0**：compare 表 + 验证数据（生成一次匹配 + 签到一次）+ 冒烟。提交 `chore(visual): compare-0918 supports 运营台 design views`。
- **Task 1**：抽 7 个 hook（每个：原样搬移状态/fetch/动作 → 旧组件改调 hook、JSX 不动 → 既有测试全绿 → 单独提交 `refactor(ops): extract use-<x> from <workspace>`，一 hook 一提交；这是对「旧文件不改」规则的记录例外）。
- **Task 2**：壳 + `ops-model.ts` + hub 屏（46–113）+ `center/page.tsx` 接线；像素 hub。
- **Task 3**：概览屏（115–164）+ 匹配屏（166–209）+ `operations/page.tsx`（`?tab=match`）；像素 ×2。
- **Task 4**：参会者屏（211–251）+ 签到屏（253–298）+ 两个 page.tsx；像素 ×2。
- **Task 5**：报名设置屏（300–367）+ 数据报告屏（369–445）+ 两个 page.tsx；像素 ×2。
- **Task 6**：协作者抽屉（447–481）+ `roles/page.tsx` 深链 → 抽屉；像素。
- **Task 7**：删除 7 个旧工作区文件、改指测试、ratchet 下调、回归、像素终验、台账「运营台 屏级替换完成」+ ROUTE-CONSOLIDATION 运营台各行「已重建」+ NEW-UI-DECISION ④ 完成。

每任务模板同前：读设计对应行 → TDD（SSR 结构 + fetch mock 的请求体断言）→ 像素 → 提交 → 台账；发现设计/仓库与本计划矛盾 → NEEDS_CONTEXT。

## 后续计划
⑤ 认证四态弹窗（`Orbit 首页.dc.html` login/register/forgot/reset）→ ⑥ iOrbit chat。
