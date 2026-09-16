# 0032 / run-01

主代理单一 Generator，原地 `chat-agent`。开始基线 `f12476d8a`。Planner 初始 SHA256 `5b0f6aa6c3a5793ac7410213e843abbc39a6ee90eb27ab689e872bae1f1b85ab`；实现前核实真实 Expo route 位于 `app/tasks`，只纠正路径不变更验收。

可执行：R1 HTTP / Web / App 消费者与定向、数据库事务测试，后续 Production 验收。
可调查：原生兼容工具链、最短跨端验收。
等待决定：另装兼容 Xcode 或使用 EAS；当前 Xcode 26.1.1 无可运行 Orbit 包，不能用历史构建代替本轮原生验收。

已运行 Web API / PostgreSQL / 现有列表 28/28，无跳过；代码尚未提交。当前只运行局部测试，不将自动化当作线上完成。

必要路径补充：`src/view-models/initial-route.ts` 和 `mobile-route-access.ts` 仅登记新增受保护详情的登录回跳路径，承接 SC-03；具体 helper impact LOW / UNKNOWN（已源码复核），不改登录鉴权。新路由通过既有 `withOrbitPrivateRoute` 包装。
