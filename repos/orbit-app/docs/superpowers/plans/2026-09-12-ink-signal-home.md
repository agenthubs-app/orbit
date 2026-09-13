# Ink & Signal 首页 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. 沿用本会话原地逐批执行，不提交、推送或部署。已批准视觉与“我们的功能为主，缺口仿照设计补足”的授权继续有效。

**Goal:** 使 `/home` 成为真实首页：检索人脉、收件箱、周条、日程／待办双栏、联系跟进；大字号切为单列，读取失败可恢复。

**Architecture:** 新增 HomeDashboardScreen，不覆盖旧 HomeScreen 的 `/home/events` 功能。复用 AppScreen 和 HTTP/resource/auth 边界、现有待办/联系人展示 helper；新纯 view-model 只做日期筛选和首页投影。已有创建流程保持原入口，首页只新增现有任务完成动作的消费者。

**Tech Stack:** 现有 Expo Router、React Native、TypeScript、Node + RNW 交互测试，无新依赖。

**Spec:** 原包 `1c-首页`、`3a-加载态-首页`、`3a-大字号-首页` 及对应 HTML 已逐张查看；[来源与功能边界](../../designs/2026-09-12-ink-signal/README.md)。

## Global Constraints

- App 内修改，不动 Web/API、生成契约、真实数据、旧未提交文件。公共层当前 1436/1436、typecheck passed，独立复审须解决重要问题后推进依赖实现。
- `/api/today` 只接受 timeZone，不能伪造 date 参数。使用已有 `/api/tasks?status=open` 和 `/api/schedule-items`，在首页按东京日期筛选；沿用 TodayService 的到期/计划日不晚于当前选择日期的待办规则。
- 周条周一开头，跨月、跨年、东京午夜正确；日期切换不能把今天的数据当作别天。日程保留跨午夜的真实占用，排除 cancelled，结束/进行中状态由真实时间导出，不直接信任 provider 的默认 upcoming。
- 联系跟进从现有联系人 needs_follow_up 状态选取；不生成跟进建议、不发送消息、不创建提醒。真实缺失字段不得变成虚构人物、职位、时间或数量。
- 四个快捷操作：扫名片 → `/contacts/new`；查看日程 → `/schedule`；新建待办 → 现有 `/today` 创建表单；联系跟进 → `/followups`。这两处文案区别于源稿，原因是 App 尚未提供独立新建日程及 D7 笔记中心。
- 任务勾选用现有 PATCH complete 协议，显式点击后才写；同步锁、请求撤销、失败可见、迟到结果隔离、身份/服务器/会话/前台/焦点边界；不显示乐观假完成。
- 搜索提交真实跳转联系人检索，收件箱徽标复用实际计数 hook，不硬编码 3。查询失败不显示为 0/空态；各区独立展示加载、失败和重试。
- 保持原生 safe area、44pt 热区与可读小字；原稿低对比小字采用已记录的 ink-2 调整。不要绘制假的系统状态栏。

### Task 1: 首页数据投影

**Files:** Create `src/view-models/home-dashboard.ts`, `tests/home-dashboard.test.ts`.

**Interfaces:** 日期/周条纯函数及待办、日程、联系人三个独立投影，输入 unknown；格式不符返回明确失败结果而非静默空数组。复用现有 TaskItemContract、ScheduleItemContract、contactsToSummaries、todayToView 等必要消费者 helper，不改变共享定义。

- [x] 写失败测试：东京跨日、周一跨月、选定日期前未完待办、排除已完成/取消、跨午夜日程、实际时间顺序、真实联系人 ID/跟进筛选；坏 ID、日期、计数或形状不冒充空数据。
- [x] 运行测试看到缺失行为，再实现最小投影。

### Task 2: 真实首页及交互

**Files:** Create `src/screens/home/HomeDashboardScreen.tsx`, `tests/home-dashboard-interactions.test.ts`; modify `app/home.tsx`.

**Interfaces:** HomeDashboardScreen 私有路由；通过当前身份/服务器/Cookie 建立独立组件状态；子区域使用已校验的读取结果。大字号布局由真实 fontScale 决定。

- [x] 先渲染测试：实际首页而非 Redirect；搜索、周条、收件箱、快捷入口和真实 ID 跳转；没有操作不写数据。
- [x] 按 1c 实现 19pt Orbit 标记、灰底搜索、34pt 日期、七日下划线选择、四快捷入口、两栏行式日程／待办、两列人脉跟进。
- [x] 写入行为先失败测试，再实现任务勾选：PATCH 路径/完整 body、同帧重复点击、失败保留状态、错误成功响应、切身份/服务器/卸载/失焦/后台的迟到响应和回前台刷新。
- [x] 复用 3a 骨架；局部错误能重试且不清除其他区块。大字号切单栏、长文本完整，底部末项能滚到无遮挡处。

### Task 3: 启动入口、验证与交接

**Files:** Modify `src/view-models/initial-route.ts` and associated route tests; update设计 README、本计划和设计 QA 记录。

- [x] 首页真实内容通过后，修改 home 映射及默认启动目标。先对 resolveInitialRouteHref、HomeRoute 等相关符号做影响分析并报告；原合法深链和安全拒绝规则不放宽。
- [x] 用真实路由渲染行为替代旧“home 重定向 AI”的源码字符串断言；已有其它明确 AI 入口不改变。
- [x] 运行定向测试、typecheck、全量测试和 diff check；按复审技能做独立检查。
- [x] 在同状态/视口比较源图与实现，记录两处功能入口差异、可读性和 native 未验范围。继续人脉、活动、IORBIT 等整包批次，不把首页完成当作全包完成。

当前证据：全量 1486/1486、首页／快照 61/61、typecheck 与 diff check 通过；独立复审通过，另独立定向 73/73 与类型检查通过。[QA 记录](../../designs/2026-09-12-ink-signal/2026-09-12-home-qa.md)明确本地渲染与原生未验范围。

## 自检

没有新增后端能力，日程 provider 的数据范围及 TodayService 的待办规则已核对。数据和身份守卫不能仅靠截图验证，视觉不能仅靠路由和类型测试验收。现有 `/home/events` 与其它入口保持可访问。
