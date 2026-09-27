# Sprint 0111 — AI 轨迹保留期限与存量清理（AI A4 + A5）

**Plan revision:** 1。**模式:** existing-codebase / single-generator。运行状态只在登记表。
**原需求:** 「AI 对话数据方案」A4、A5（`docs/designs/2026-09-27-data-architecture/ai-data-design.html` 第三节、第六节「存量删除不可逆」、第八节决定 1「动作结束 1 年后整套删除」、决定 3「删：步骤、统计、普通问答运行记录；删前备份，先查生产行数」）。
**单一目标:** 带动作运行的 1 年整套保留期由维护任务执行；存量重复轨迹可安全清理。
**易读目标:** [GOAL.md](GOAL.md)。
**基线:** 0110 合并后的 `chat-agent`（开工时追加提交号）。
**进入条件:** 0103 的回填（`db:migrate:agent-run-targets`）在目标库已执行——删除按运行编号关联子记录，未回填的旧子记录会被漏删。**生产上的统计、备份与删除只在用户确认后执行。**

## 已查明的事实（2026-09-27）

- 运行整套集合（`repos/orbits/features/agent/storage/agent-runtime-live-record-provider.ts:56-63`）：`agentRuns`、`agentRunSteps`、`agentActionsV2`、`agentOutbox`、`agentExecutionReceipts`、`agentAnalyticsEvents`。步骤、动作、发件箱、回执以 `target_type='agent_run'`、`target_id=运行编号` 关联（0103；回填 SQL 同文件 :40-54，也覆盖 `orbit_agent_chat_requests`）。带动作的运行在 0103 后仍保留自己的步骤行。
- 另有旧集合 `agentActions`（`agent-action-live-record-provider.ts:31`，bootstrap 使用），不属于运行整套。
- 「动作结束」时间：动作记录有 `completedAt`、`failedAt`、`rejectedAt`、`canceledAt`、`undoneAt`（`features/agent/runtime/contract.ts:178-187`）；终态为 completed、partially_failed、failed、rejected、canceled、undone；`deferred`、`awaiting_confirmation`、`approved`、`executing` 为非终态。运行有 `completedAt`、`failedAt`、`canceledAt`；发件箱有 `processedAt`；撤销窗口没有独立的到期字段。
- 开发库：agentRuns 76、agentRunSteps 589、agentAnalyticsEvents 148、agentActions 60，V2/发件箱/回执 0（设计案时点：步骤 569、统计 140、普通问答运行 70，全部是普通问答）。
- 维护任务机制：`features/operations/maintenance/`（`MaintenanceTask {name, run}`，在 `configured-tasks.ts` 注册，240 秒预算，来源记为 `maintenance:<name>`；每日 cron + 心跳）。已有保留期样例：`features/operations/read-cost/config.ts:9-10`、`rollup.ts:137-150`。

## 范围与文件

1. **保留期任务**（维护任务新增一项）：选出「运行已终态、其全部动作已终态、最晚结束时间早于 1 年前」的运行，在一个事务内删除运行及其步骤、动作、发件箱、回执；清除请求记录上指向该运行的 `target_type/target_id`（请求记录本身保留）。有任何非终态动作的运行不删。每轮批量上限，报告写明。
2. **存量清理命令**（脚本，可重复执行）：`--dry-run` 只统计；正式执行前把待删行导出为本地文件（JSON Lines，路径在外接盘或 `build/`），再删除：全部 `agentRunSteps` 中属于普通问答运行的、全部 `agentAnalyticsEvents`、全部普通问答运行记录（没有任何动作的运行）；同时清除请求记录上指向这些运行的链接。
3. 结束时间的判定写成一个函数并有单测；阈值写成常量。
- 排除：请求记录与会话消息的保留期（设计案明确不设）；旧 `agentActions` 集合；反馈功能。

## 验收契约

| SC | 可观察行为 | 必需证据 |
| --- | --- | --- |
| SC-0111-01 | 保留期边界：动作结束 366 天的整套被删，364 天的保留；含非终态动作的运行不删；删除后不存在孤立的步骤/动作/发件箱/回执 | 真库测试（先 RED） |
| SC-0111-02 | 删除整套时，请求记录保留但不再指向已删运行；运行详情接口对已删运行返回既有的「找不到」 | 真库测试 |
| SC-0111-03 | 存量命令：dry-run 只统计不改库；正式执行先导出再删除；再次执行删除 0 行；带动作的运行与其子记录不受影响 | 本地库执行记录 |
| SC-0111-04 | 维护任务接入每日 pass，受预算约束，失败不影响其他任务；本地调用维护接口一次，汇总字段正确 | 运行时记录 |
| SC-0111-05 | 两端全量、typecheck 通过；棘轮不增加 | 摘要 |

## 测试

- 档位 H（批量删除）。开发集：新增保留期与存量命令的 Postgres 测试、维护接线测试、agent-run-trace 测试；收口：orbits 全量（App 未改则复用）。

## 生产（需用户确认）

① 只读统计生产各集合行数（dry-run）；② 用户确认后导出备份；③ 删除；④ 再 dry-run 确认为 0。先确认 0103 回填已执行。协调者汇总进 `PRODUCTION_ROLLOUT.md`。

## 失败与交接

报告列出本地实际删除行数与备份文件位置（备份文件不入库）。
