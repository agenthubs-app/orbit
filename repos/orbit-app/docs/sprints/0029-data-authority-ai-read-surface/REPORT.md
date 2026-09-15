# Sprint 0029 Report

状态：Planned — 尚未实施。

来源：2026-09-15 数据流与 AI 可见性审查。

## Confirmed baseline findings

- 日程：`personal_schedule_items` 与 `orbitScheduleItems` 并存。
- 推送：两套本机 device ID 与两组 API path 并存。
- AI：5 个显式 read tool；Notes、通用 Tasks、已确认 Relationship Follow-up 的完整查询、Schedule 等无读取工具。现有 `followups.reviewQueue` 只覆盖派生复核队列。
- 数据持久化：通用 `orbit_records` 与多组专用表并存，缺统一 authority registry。

## Evidence required before completion

- RED → GREEN 测试证据。
- migration dry-run 与 apply receipt。
- 真实账号、iOS Simulator、重编译重启后的 Web 证据。
- provider read-only 验证或明确的外部阻塞证据。
- 所有新增 AI 工具的字段级安全审查。
- `notes.query`、`tasks.query`、`followups.query`、`schedule.query` 的 intent routing、列表/搜索/详情与跨账号 negative tests。
- `followups.query` 与 `followups.reviewQueue` 不混淆持久事实和派生推荐的 contract 证据。
