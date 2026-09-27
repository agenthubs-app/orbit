# Sprint 0110 — 普通问答不写运行记录（AI A2）

**Plan revision:** 1。**模式:** existing-codebase / single-generator。运行状态只在登记表。
**原需求:** 「AI 对话数据方案」A2（`docs/designs/2026-09-27-data-architecture/ai-data-design.html` 第三节、第七节验收 1、3、4，第八节决定 5「Agent 结果反馈功能先不动：代码和设置页入口保留，不新增入口；反馈接口对普通问答返回找不到」）。
**单一目标:** 普通问答只写请求记录；带动作的运行不受影响；去掉每轮整类计数读取。
**易读目标:** [GOAL.md](GOAL.md)。
**基线:** 0109 合并后的 `chat-agent`（开工时追加提交号）。
**进入条件:** 下方「开工前需用户决定」已有答复；付费调用计入 $5 账本，本 Sprint 最多 4 次。

## 开工前需用户决定

`agentAnalyticsEvents` 目前**没有任何读取方**（界面、接口、脚本都没有；开发库 148 行），仍在 14 处写入（运行完成/失败、动作提议/批准/推迟/拒绝/撤销等）及 4 处 `recordAnalytics` 调用（事后跟进工作流 2 处、「查看」动作 2 处）。0103 已停写普通问答的统计。**问题：是否停写全部统计记录？** 建议：停写（没有读取方；A5 也会删存量）。若用户选择保留，本 Sprint 只做 A2 与计数读取两项。

## 已查明的事实（2026-09-27）

- `repos/orbits/app/api/ai/conversations/route.ts:614-639` `persistConversationRunTrace`：结果已带 `runId`（动作/工作流运行）时原样返回；否则（普通问答）经 `runtime.recordCompletedRun`（`features/agent/runtime/service.ts:454-470`，单次写入，无预读、无统计）写 `run:conversation:<uuid>`；可靠发送调用于 :815、旧发送 :872。
- 请求记录 `orbit_agent_chat_requests`（base workspace，`user_id` = 本人）；0103 起，带运行时其 `target_type=agent_run`。运行详情接口 `/api/ai/runs/[id]` 从请求记录计时拼步骤（0103）。
- 反馈 `app/api/agent/feedback/handler.ts:14` 依赖 `getRun`，找不到返回 404；组件 `AgentOutcomeFeedback` 无任何页面使用；App 不调用反馈接口。
- 统计写入点：`service.ts` :364、:369、:405、:410、:419、:448、:559、:592、:597、:680、:771、:788、:804、:1028；`recordAnalytics` 调用 `features/orbit-ai/workflows/post-event-followup-v1.ts:221,298`、`app/api/agent/actions/[id]/view/route.ts:30,42`。
- 每轮计数读取：`features/orbit-ai/live-conversation-trace.ts:272-276` `remoteDatabaseInteractionForTools` 对工具涉及的每个集合在 base workspace 全量读取只为计数，每轮在 :1044 调用（`profile.getSelf` 除外）。
- 前端只在「有动作」时使用运行编号（设计案已核实）。

## 范围与文件

1. 普通问答不再调用 `recordCompletedRun`；请求记录不再带普通问答的运行编号；运行详情接口对普通问答的行为（404 或按请求记录返回）在报告中说明并有测试。
2. `remoteDatabaseInteractionForTools`：改为不读数据（计数改用工具实际返回的条数，或去掉该统计字段）；保持对外响应字段形状不变或在契约测试中说明变化。
3. 若用户同意：停写全部 `agentAnalyticsEvents`（删除写入调用与仓库方法；保留集合供 0111 删存量）。
- 排除：删除存量（0111）；反馈功能改动（决定 5）；会话读写（0112）。

## 验收契约

| SC | 可观察行为 | 必需证据 |
| --- | --- | --- |
| SC-0110-01 | 一次普通问答后，`agentRuns`、`agentRunSteps`、`agentAnalyticsEvents` 行数都不变，只多一条请求记录 | 真库测试（先 RED）+ 运行时 SQL |
| SC-0110-02 | 普通问答的服务端耗时中不再有写运行记录的往返（计时 span 对照） | 请求计时前后对照 |
| SC-0110-03 | 带动作的问答：运行记录、动作、状态卡、Agent 账本、撤销行为与改前一致 | 真库测试 + 运行时一次 |
| SC-0110-04 | 每轮问答不再有整类计数读取（读取计量中该查询消失，小票字节下降） | 读取计量 + 小票对照 |
| SC-0110-05 | （若决定停写）统计写入全部移除且无读取方受影响；两端全量、typecheck 通过；棘轮不增加 | 摘要 |

## 测试

- 档位 H（AI 发送主路径）。开发集：agent-run-trace Postgres 测试、可靠发送测试、动作运行测试、对话路由测试；收口：两端全量。
- 运行时：本地生产构建，演示账号普通问答 2 次、带动作问答 1 次，付费调用计数写入报告。

## 失败与交接

交接给 0111：存量删除范围（步骤、统计、普通问答运行记录）不变；若统计停写，0111 的保留期任务不必考虑统计集合的新增。
