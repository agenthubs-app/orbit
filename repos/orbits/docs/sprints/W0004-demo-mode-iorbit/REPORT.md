# Sprint W0004 — 执行总结

## 目标实现情况

- 本轮要实现：开关打开且用户处于引导期时，iOrbit 首页用前端示例数据渲染，带「示例预览」横条、示例角标和写操作拦截；同时建立开关、进度判定和引导记录的骨架。
- 已验证能做到：
  - 服务端开关 `ORBIT_GUIDE_DEMO`（只有 on/true/1 打开，默认关，D1）与 `ORBIT_GUIDE_DEMO_SINCE`（只写日期时按东京当天 00:00；完整时间必须带时区）（SC-01）。
  - 进度判定：已确认联系人 ≥3 → 第 1 步；有目标 → 第 2 步；有生效计划 → 第 3 步。老用户（早于 SINCE 注册且首次判定时 ≥3 位已确认联系人；读不到注册时间时退回「≥3 位即老用户」）首次判定后写入引导记录，之后不再变化；任何读取失败都回退到真实首页，不锁定判定（SC-01、SC-02）。
  - 引导记录 `orbit_records` collection `guideState`：按 actor 隔离；`GET/PATCH /api/guide/state` 只接受 `bannerCollapsed`（SC-02）。
  - 示例首页：示例人物（东京 AI 会议纪要出海创始人）的今日要事、时间线、本周推进、已报名活动、最近对话都走首页原有渲染路径；示例名字带「示例」角标；横条显示进度、下一步、「开始／继续引导 →」，可收起成导航药丸，收起状态经接口保存、跨浏览器一致、连点时以最后一次为准（SC-03）。
  - 示例模式不请求信号、账本、会话、对话接口，所有写操作弹「这是示例」拦截层；进入示例前排队的提问与 `?q=` 被消费并拦截，不会在之后的真实壳里自动发送（SC-04）。
- 仍未实现或未验证：
  - **浏览器截图没做**：要看到示例模式需要带 `ORBIT_GUIDE_DEMO=on` 重启 dev server，而 3000 端口的 dev server 属于另一个会话，不能重启；以组件级 SSR 测试覆盖横条、要事、时间线、角标与拦截。
  - 「开始引导」链接的 `/app/start` 要到 W0006 才有（当前 404）。
  - 顶栏的收件箱未读数在示例模式下仍读取真实数据（全站共用外壳，显示真实账号状态，非示例内容；review 意见未采纳）。
  - 示例时钟固定在东京 11:40，「现在」线在示例中恒为 11:40。

## 运行记录

- 原需求：RW-03（首页部分）；决定 D1、D2
- 结果：completed（浏览器截图缺失，原因见上）
- run：run-01；Generator：子代理；协调者：Claude 主会话；2026-09-28
- Planner revision：2
- 功能 SHA：`2220b061`；分支 `sprint/W0004-demo-mode-iorbit`
- push：未执行

## 验收结果

| SC | 结果 | 证据 |
| --- | --- | --- |
| SC-W0004-01 | pass | `tests/services/guide-progress.test.ts`（SINCE 前后、注册时间缺失、首次 1 人后扫满 3 人仍非老用户、完成后退出、开关关零读取、SINCE 时区边界）；`app-agent-guide-demo-page.test.tsx`（开关两态、老用户、SINCE 后的新用户） |
| SC-W0004-02 | pass | 内存与真实 PG 两用户隔离、引导记录并发；`guide-state-routes.test.ts`（401、只改本人、只收 `bannerCollapsed`、503、抛错仍 envelope） |
| SC-W0004-03 | pass（组件级） | `app-agent-iorbit-home.test.tsx` 新增：横条文案两种进度、进度点、CTA、收起／展开 PATCH、服务端收起首帧即药丸、乱序响应以最后一次为准、失败不写 localStorage、换账号不重放 |
| SC-W0004-04 | pass | fetch 逐接口断言（signals／ledger／conversations 挂载与每个写控件后均未调用）；拦截层文案与跳转；排队提问与 `?q=` 被消费且切到真实壳后不发送 |
| SC-W0004-05 | pass | 定向集 89 条全过、0 skip（真实 PG 已跑）；W0001 收口集 97 条中 96 过（唯一失败为基线 `?session=`）；全量 5287 条 42 失败，与上一基线新增 0；`tsc` 0 |

## GitNexus

- `IOrbitHome` LOW；`IOrbitShell` LOW（另一同名候选为测试桩）；`AppAgentPage` UNKNOWN（路由入口，grep 确认仅框架与源码类测试引用）。
- staged detect-changes：19 文件、28 符号、9 流程，**risk high**——来自 `/app/agent` 页面入口的执行流；没有 HIGH／CRITICAL 的单个被调函数；全量新增失败 0。

## Codex 代码 review 与处理

| 意见 | 判断 | 处理 |
| --- | --- | --- |
| 示例模式下顶栏收件箱仍读取真实未读数 | 不采纳 | 共用外壳显示真实账号状态，不属于示例内容 |
| 收起失败重试存在全局 localStorage，换账号会写错人 | 采纳 | 去掉客户端持久重试 |
| 快速收起／展开乱序覆盖 | 采纳 | 串行化，以最后一次为准 |
| 进入示例前的排队提问与 `?q=` 之后会被自动发送 | 采纳 | 示例壳消费并拦截 |
| 证据不全 | 部分 | PG 0 skip、全量对照已做；浏览器截图无法做（见上） |
| SINCE 日期按 UTC 解析 | 采纳 | 日期按东京 00:00，完整时间须带时区 |

## 交接

- 环境变量：`ORBIT_GUIDE_DEMO`、`ORBIT_GUIDE_DEMO_SINCE`（发布动作需用户授权，见登记表）。
- 给 W0005／W0014：示例数据 `app/(app)/app/_demo/demo-persona.ts`（`buildDemoHomeData`、`DEMO_PEOPLE`、`DEMO_GOAL`），骨架 `demo-mode-context.tsx`（`useDemoMode`、`guardWrite`、`DemoBanner`、`DemoTag`、`DemoInterceptLayer`）。
- 给 W0006：`features/guide/progress.ts`（`readGuideStatusForActor`），引导记录服务 `features/guide/service-factory.ts`。
- 费用：0 次付费 AI 调用。
