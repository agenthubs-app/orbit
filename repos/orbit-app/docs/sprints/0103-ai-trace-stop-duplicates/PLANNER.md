# Sprint 0103 — AI 轨迹停写与精确读（AI A1 + A3）

**Plan revision:** 1。**模式:** existing-codebase / single-generator。
**原需求:** 「AI 对话数据方案」A1、A3（`docs/designs/2026-09-27-data-architecture/ai-data-design.html`，2026-09-27 定稿）。
**单一目标:** 不再写 agentRunSteps / agentAnalyticsEvents；运行读取按编号精确读。
**基线:** 0102 合并后的 `chat-agent` @ `84890147d`；已知失败：App 1（route-parity）、orbits 33 + 不稳定用例（见 0101/0102 REPORT）；棘轮基线 165。**依赖:** 无（排序原因：先有小票基线）。
**设计:** `docs/designs/2026-09-27-data-architecture/ai-data-design.html`（A1、A3）。

## 已查明的事实

- 写入：`repos/orbits/app/api/ai/conversations/route.ts` `persistConversationRunTrace`（约 610 行）：建运行、按 `result.data.diagnostics.timings` 每个 span 调 `runtime.addRunStep`（丢弃 durationMs），再 `updateRunStatus`；统计 started/completed 由服务发出。
- 读取：`features/agent/storage/agent-runtime-live-record-provider.ts` `getRun` 通过 `list()` → `store.listRecords({ limit: "unbounded", collectionName, workspaceId })` 读取子空间（`…:agent-actor:<id>`）全部 steps/actions/outbox/receipts 后按 runId 内存过滤；一次问答约调用 10 次。开发库演示账号步骤 524 行约 190KB。
- 运行详情接口 `/api/ai/runs/[id]` 当前返回步骤；App 的 `buildAiRunDetailRequest` 无调用（仍需保持接口形状）。
- 动作状态卡与 Agent 账本只读带动作的运行——本 Sprint 不改变其可见结果。

## 范围

停写步骤与统计；运行详情的步骤改由请求记录计时拼出（形状不变）；getRun 及同类读取按运行编号（信封 target_id 或 record_id 精确条件，走索引）读取。普通问答仍写运行记录（0107 才改）。存量数据不删（0108）。

## 验收契约

| SC | 可观察行为 | 必需证据 |
| --- | --- | --- |
| SC-0103-01 | 一次普通问答后 agentRunSteps、agentAnalyticsEvents 行数不变 | 真库测试 |
| SC-0103-02 | `/api/ai/runs/[id]` 响应形状与改前一致，步骤名与耗时来自请求记录计时 | 契约测试 |
| SC-0103-03 | 读取一次运行的行数与历史条数无关（历史 10 次 vs 200 次，读取行数相同） | 真库测试 + 账本 |
| SC-0103-04 | 带动作的运行：动作状态卡、Agent 账本显示不变 | 路由测试 |
| SC-0103-05 | 棘轮减 1（165→164）；两端全量、typecheck 通过；phoneweb 问答一次正常 | 摘要 |
