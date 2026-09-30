# Sprint 0099 — 请求读取小票（监控 O1）

**Plan revision:** 1。**模式:** existing-codebase / single-generator。运行状态只在登记表。
**原需求:** 「读取量监控」设计案（`docs/designs/2026-09-27-data-architecture/monitoring-design.html`，2026-09-27 定稿）O1。
**单一目标:** 每个服务端请求结束后产生一张读取小票，存数据库 14 天、打一行日志、可选发 Axiom；全部连接池接入计量。
**基线:** 0098 合并后的 `chat-agent` @ `3c18fb4de`；已知失败：App 1（route-parity）、orbits 35（`0098-main-health/orbits-known-failures.txt`，不稳定用例可浮动至约 42）。
**依赖:** 0098（两端全量可验收）。

## 已查明的事实

- 计量器已存在：`repos/orbits/shared/storage/postgres-read-metrics.ts`（每条读查询：行数、约字节、耗时、失败、SQL 指纹；不含 SQL 原文/参数/数据）。环境开关 `ORBIT_PG_READ_METRICS=1` 时每条查询一行日志。
- 只有 2 个连接池接入：`shared/storage/postgres-live-record-store.ts`、`shared/storage/transactional-postgres.ts`。未接入的 6 处：`features/acquisition/business-card-ingest-v2/configured.ts`、`features/acquisition/storage/business-card-batch-transactions.ts`、`features/acquisition/storage/business-card-v1-image-journal.ts`、`features/operations/maintenance/configured.ts`、`features/events/registration/profile-contract-repair/operator-runner.ts`、`features/events/event-operations/storage/postgres-client.ts`（以实施时 `grep "new Pool"` 为准）。
- 298 个 `app/api/**/route.ts`，没有统一包装器；存在 `proxy.ts`（Next 16）。测试侧读取成本账本：`tests/performance/read-cost-ledger.ts`、`read-cost-baseline.json`。

## 设计要点（实现细节由 Generator 决定并在报告说明）

1. **请求记账本**：请求开始时建立上下文（AsyncLocalStorage 或等价机制），计量器每条查询累加；请求结束后（`after()`，不阻塞响应）写一张小票。**优先不逐个改 298 个路由**：例如由 `proxy.ts` 注入请求编号头、计量回调在请求作用域内首次命中时登记 `after()` 收尾；在统一的身份解析处登记当前账号。若经验证不可行，改用包装器 + 审计测试，并在报告说明。
2. **归属不到请求的读取**（后台任务、脚本）记为来源=任务名或 `unattributed`，不丢弃——覆盖率要能看见。
3. **小票字段**：时间、接口（路由模板，不含具体编号）、来源（app/web/任务名，可按 UA 或请求头区分）、账号编号、查询数、行数、字节数、数据库耗时、响应字节数、状态码。
4. **存储**：新表（迁移随现有迁移机制），保留 14 天由后续清理任务负责（0100）；本 Sprint 只写入。写入失败只记警告。
5. **日志**：每张小票一行 JSON，账号编号只放指纹（不可逆短码）。
6. **Axiom**：环境变量 `AXIOM_TOKEN`、`AXIOM_DATASET` 都存在时批量发送（代码直接调用 ingest API，不走 Vercel Log Drains）；缺任一则跳过；发送失败不影响请求；只含账号指纹。密钥不写入代码、测试快照或文档。
7. **抽样开关**：环境变量控制比例，默认 100%。
8. **连接池覆盖检查**：审计测试——任何 `new Pool(` 必须经过计量接入点，否则失败。

## 验收契约

| SC | 可观察行为 | 必需证据 |
| --- | --- | --- |
| SC-0099-01 | 本机对账本中的 5 个操作各发一次真实 HTTP 请求，小票的查询数/行数/字节数与账本测量一致 | 对照表 |
| SC-0099-02 | 小票写入失败或数据库不可用时，请求状态码与响应体不变 | 失败注入测试 |
| SC-0099-03 | 8 处连接池全部接入；新增未接入的 `new Pool(` 使审计测试失败 | 审计测试 RED/GREEN |
| SC-0099-04 | 日志与 Axiom 载荷不含原始账号编号、SQL、参数；未配置 Axiom 时不发任何外部请求 | 单测 + 抓包/桩 |
| SC-0099-05 | 后台任务的读取以任务名或 unattributed 记录；两端全量与 typecheck 通过，棘轮不增加 | 摘要 |

## 排除

汇总、清理、对账、管理页、报警（0100）。生产部署与生产库迁移由用户确认后执行。
