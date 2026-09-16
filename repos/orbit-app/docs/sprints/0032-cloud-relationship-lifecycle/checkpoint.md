# 0032 / run-01

主代理单一 Generator，原地 `chat-agent`。开始基线 `f12476d8a`。Planner 初始 SHA256 `5b0f6aa6c3a5793ac7410213e843abbc39a6ee90eb27ab689e872bae1f1b85ab`；实现前核实真实 Expo route 位于 `app/tasks`，只纠正路径不变更验收。

可执行：R1 HTTP / Web / App 消费者与定向、数据库事务测试，后续 Production 验收。
可调查：原生兼容工具链、最短跨端验收。
等待决定：另装兼容 Xcode 或使用 EAS；当前 Xcode 26.1.1 无可运行 Orbit 包，不能用历史构建代替本轮原生验收。

已运行 Web API / PostgreSQL / 现有列表 28/28，无跳过；代码尚未提交。当前只运行局部测试，不将自动化当作线上完成。

2026-09-16 后续（覆盖上段未提交状态）：`c9a511001` 已提交 Web/App 生命周期消费者，`7beac4304` 更新路由/刷新和确定性时区夹具。App 全量 TZ=Asia/Tokyo 2869/2869 无 skip，typecheck 通过；Web Production 已实际完成 connection_0029/task_015 并新增明确下一步，刷新/异账号拒绝通过。`0ed135761` 补齐新任务 actor/evidence 写入元数据，PG33/33，四域查询服务可读。完整版本和边界见根目录 `bridge/2026-09-16-cloud-five-item-acceptance.md`。原生工具链仍未就绪，Sprint 保持 running，不标记 completed，也不以旧环境 Simulator 报告替代本轮验收。

必要路径补充：`src/view-models/initial-route.ts` 和 `mobile-route-access.ts` 仅登记新增受保护详情的登录回跳路径，承接 SC-03；具体 helper impact LOW / UNKNOWN（已源码复核），不改登录鉴权。新路由通过既有 `withOrbitPrivateRoute` 包装。
