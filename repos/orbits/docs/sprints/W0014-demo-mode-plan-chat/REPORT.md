# Sprint W0014 — 执行总结

## 目标实现情况

- 本轮要实现：引导期间打开「我的计划」和示例对话，看到示例人物的计划和一段示例问答，所有真实读写都不发生。
- 已验证能做到：
  - 开关关闭或用户不在引导期时，计划页与对话页和改动前一致：计划页传给组件的 props 不变，`guide={null}` 时 SSR 输出与改动前全等（SC-01）。
  - 示例期间计划页显示示例人物的计划：横条「完成引导后，这里会是你自己的计划。」、目标与人名旁的「示例」角标、第 2 周／共 12 周、本周 5 条（含 1 条延后 1 周）、3 个阶段、5 位示例联系人、进展记录；挂载、打勾、「记下」后 `/api/agent/plans*`、`/api/agent/ledger`、`/api/ai/conversations*` 都是 0 次，写操作弹「这是示例」（SC-02）。
  - 示例期间在概览点「我该如何实现目标？」这条示例问答，打开只读对话：问题气泡 + W0008 同款计划卡片（已完成态，数据与计划页同一份快照）；发送、追问、试试这些问题、历史都被拦截，0 次 `/api/ai/*`，不改地址栏（SC-03）。
  - `/app/agent` 先判定示例状态：示例期间只读一次首页数据（判定需要目标），对话、报名、社群、计划卡片的真实读取全部跳过；示例壳不再接收真实对话视图模型，真实联系人姓名不会出现在示例概览、示例问答与右栏（Codex review 后补）。
- 仍未实现或未验证：
  - 另两条示例会话没有回答数据，照旧被拦截；追问框可以打字但提交被拦截。
  - 示例对话里两个导航追问（`/app/agent/strategy`）会跳到真实策略页（不在本 Sprint 范围）。
  - 示例期间全站顶栏仍调 `/api/account/me`（共用外壳，与 W0004 口径相同）。

## 运行记录

- 原需求：RW-03（我的计划、示例对话部分）
- 结果：completed
- run：run-01；Generator：子代理；协调者：Claude 主会话；2026-09-28
- Planner revision：2
- 分支：`sprint/W0014-demo-mode-plan-chat`；功能 SHA `8e159ed2`
- 档位：PLANNER 定 L；`IOrbitHome` 为 HIGH、review 修复后 detect-changes 为 high，升为 H 并跑全量：5553 条 42 失败，与基线新增 0、修复 0（修复前一次全量出现 1 条 `appointment-details-postgres` 失败，单独连跑 3 次均通过，判为负载下不稳定）
- push：未执行

## 改了什么

| 功能 | 文件 |
| --- | --- |
| 示例计划快照、示例人名、示例对话视图模型 | `app/(app)/app/_demo/demo-persona.ts`（`buildDemoPlanSnapshot`、`buildDemoPlanContactNames`、`buildDemoAgentViewModel`） |
| 计划页服务端判定示例态 | `app/(app)/app/agent/plan/page.tsx`（复用 `readDemoModeViewForActor`） |
| 计划页示例渲染与写拦截 | `iorbit-0918/iorbit-plan.tsx` |
| 示例壳与只读示例问答 | `iorbit-0918/iorbit-shell.tsx` |
| `/app/agent` 先判定示例态 | `app/(app)/app/agent/page.tsx`——**超出 PLANNER 白名单**（review 阻塞项修复必需） |
| 导航栏放示例药丸 | `iorbit-0918/iorbit-screen-frame.tsx`（可选 `navExtra`）——**超出白名单**，不传时渲染不变 |
| 示例期间可打开的会话 | `iorbit-0918/iorbit-home.tsx`（一行）——**超出白名单** |
| 测试 | `app-agent-guide-demo-page`、`app-agent-iorbit-screens`、`app-agent-iorbit-home`、`app-agent-plan-route-view-model` |

## 验收结果

| SC | 结果 | 证据 |
| --- | --- | --- |
| SC-W0014-01 | pass | 计划页页面级测试（开关关、开关开但不在引导期）；`guide={null}` SSR 全等；`/app/agent` 开关关各真实读取 1 次、引导来源 0 次；原有 plan／chat 断言未改 |
| SC-W0014-02 | pass | 页面级：示例期只读 profile、guide；组件：渲染内容与逐接口 0 调用 |
| SC-W0014-03 | pass | 组件测试：示例问答、计划卡片、四个控件拦截、0 次 `/api/ai/*`、pushState／replaceState 0 次；页面级：真实加载器全部抛错时示例照常渲染，带真名的真实视图模型不出现在 DOM |
| SC-W0014-04 | 部分 | 示例计划页：把组件 SSR 结果注入真实页面后在内置浏览器 370 宽截图，横条、目标、阶段、本周行动、阶段详情正常，无横向溢出；开关关闭的真实 `/app/agent/plan` 显示「还没有计划」、console 无错误。**真实页面的示例态无法直接看到**（本机 dev server 开关关闭，且不改用户数据）；review 修复后的 `/app/agent` 浏览器复查因 dev server 带登录态的 live 请求长时间挂起未完成（本地库无阻塞，curl 未登录请求 0.5 s），截图未落盘 |
| SC-W0014-05 | pass | 定向集 232 条 231 过（唯一失败为基线 `?session=`）；直接消费者 93/93；引用 `agent/page` 的测试 90 条 89 过（唯一失败为基线）；`tsc` 0；全量对照新增 0 |

## Codex 代码 review 与处理

| 意见 | 判断 | 处理 |
| --- | --- | --- |
| `/app/agent` 在判定示例态前读取真实会话；真实 `viewModel` 的 suggests（含真实联系人名）进入示例问答与右栏；真实服务失败时示例页打不开 | 采纳（阻塞） | 示例判定前移，示例期只读首页数据；示例壳用 `buildDemoAgentViewModel`；新增真实加载器全抛错与带真名污染的页面级测试 |
| SC-04／05 缺证据与 REPORT | 采纳 | 协调者补全量对照、浏览器检查与本报告（浏览器限制如上） |

## GitNexus

- staged detect-changes：11 文件、44 符号、9 条流程，**risk high**。9 条流程都从 `AppAgentPage` 出发（环境变量、预算门、连接池、账号会话），本次只改了它们在页面里的调用顺序；全量对照新增 0。
- `IOrbitHome` HIGH（W0009 起）只改一行；`IOrbitShell`、`IOrbitDemoShell`、`IOrbitPlan`、`IOrbitScreenFrame` LOW；`AppAgentPage` UNKNOWN（路由入口，grep 确认只有框架与测试引用）。

## 交接

- 示例数据与 W0004／W0005 同一个故事：计划 8 天前在示例问答里生成，今天第 2 周、第 1 阶段「摸清需求」，联系人都是 W0005 的 `demo:*`。
- 费用：0 次付费 AI 调用；未写任何数据库。
