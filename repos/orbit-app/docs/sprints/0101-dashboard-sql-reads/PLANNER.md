# Sprint 0101 — 看板：数据库算（看板 D1）

**Plan revision:** 1。**模式:** existing-codebase / single-generator。
**原需求:** 「看板读取方案」D1（`docs/designs/2026-09-27-data-architecture/dashboard-design.html`，2026-09-27 定稿，决定：短列表 5 条；登录默认页改回首页）。
**单一目标:** 看板总数、短列表、分布改由 SQL 计算并只返回结果；联系人分析按编号读联系人；App 登录默认页 `/home`。
**基线:** 0100 合并后的 `chat-agent` @ `6491665de`；已知失败：App 1（route-parity，缺口含 `/admin/read-cost`）、orbits 33（见 0100 REPORT）。**依赖:** 0099（小票用于记录改前改后）。
**设计:** `docs/designs/2026-09-27-data-architecture/dashboard-design.html`。

## 已查明的事实

- 整图读取：`repos/orbits/features/dashboard/storage/dashboard-live-record-provider.ts` `readProjectedDashboardCollections`（6 类：contacts、connections、contact_detail_states、events、evidence、tasks，按 user_id，不设上限）；另有无 sqlClient 时的 6 处 `limit: "unbounded"`（棘轮记 6）。
- 已有 SQL 汇总：`features/dashboard/storage/dashboard-summary-postgres-reader.ts`（总数、最近动态 limit 3；高价值门槛写作 `priority_raw >= 69.5`，而 `live-service.ts` 用 `priorityScore(connection) >= 70`——对照测试必须覆盖边界）。
- 看板响应：`live-service.ts` `aggregatePayload` 中 newContacts / highValueRelationships / pendingFollowups / dormantContacts 全量返回，仅 recentActivity 按 `activityLimit` 截断。
- 调用方：`/api/dashboard`（App `/dashboard`、`/admin`）、`/api/mobile/contacts-dashboard`（App/网页联系人分析，`features/mobile/contacts-dashboard-service.ts`，同一请求内 `withDashboardLiveReadScope` 去重整图，但另读完整联系人列表 `listContacts`）、`app/api/ai/conversations/route.ts:814`（联系人分析入口的 AI 提问，本 Sprint 不改，0102 处理）。分布：`live-distribution-service.ts`。
- App 登录默认页：`repos/orbit-app/src/view-models/account-auth.ts:45` `defaultNext = "/dashboard"`。

## 范围

总数、短列表（前 5 条 + 显示字段）、分布改 SQL；缺口与机会（`live-distribution-service` 的 gaps、`live-opportunity-service`）本 Sprint 保持现状，仍读整图（0102 快照）。联系人分析按页面实际引用的联系人编号读取。App 默认页。契约形状如有变化须同步两端 schema（`npm run sync:contract`）并更新 App 消费者；App 页面显示的条数与字段逐页核对。

## 验收契约

| SC | 可观察行为 | 必需证据 |
| --- | --- | --- |
| SC-0101-01 | 对照测试：SQL 版与现有代码版在同一份数据（含空数据、分数恰在门槛、已删除行）上每个数字、每个列表逐项一致 | 测试 |
| SC-0101-02 | 看板与联系人分析响应中每个短列表 ≤ 5 条，只含显示字段 | 契约测试 |
| SC-0101-03 | 联系人分析不再调用完整联系人列表读取；按编号读取 | 读取账本 / 小票对照 |
| SC-0101-04 | App 未指定跳转目标时登录后进入 `/home`；显式 next 仍生效 | App 测试 |
| SC-0101-05 | phoneweb 与 Simulator 打开看板和联系人分析显示正常；两端全量、typecheck 通过，棘轮不增加 | 截图 + 摘要 |
