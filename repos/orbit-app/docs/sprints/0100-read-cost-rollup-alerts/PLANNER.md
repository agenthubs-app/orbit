# Sprint 0100 — 读取量汇总、对账、管理页与报警（监控 O2 + O3）

**Plan revision:** 1。**模式:** existing-codebase / single-generator。运行状态只在登记表。
**原需求:** 「读取量监控」设计案 O2、O3（2026-09-27 定稿）。
**单一目标:** 小票 → 每日汇总 → 对账 → 管理页 → 报警，全链路可用。
**基线:** 0099 合并后的 `chat-agent` @ `e8bb75767`；已知失败：App 1（route-parity）、orbits 33（`0098-main-health/orbits-known-failures.txt` 中 35 条减去 0099 补 schema 后通过的 2 条；不稳定用例可浮动）。**依赖:** 0099。
**设计:** `docs/designs/2026-09-27-data-architecture/monitoring-design.html`。

## 已查明的事实（0099 之后）

- 小票表 `orbit_read_receipts`（`shared/storage/migrations.ts` 的 `runOrbitRecordsMigration` 最后一步建表；列：id、occurred_at、route、source、account_id、query_count、row_count、byte_count、db_ms、failed_query_count、response_bytes、status_code、sample_rate）。写入在 `shared/observability/read-receipts-*.ts`。
- 定时机制：`vercel.json` 已有每日 cron `0 3 * * *` → `/api/internal/maintenance`，执行 `features/operations/maintenance/`（`pass.ts`、`configured-tasks.ts`，任务来源记为 `task:maintenance:<名字>`）。汇总、清理、报警作为维护任务加入这一次 pass，不新增 cron。
- 汇总时注意 `sample_rate`：按 1/sample_rate 放大。
- 需要真实 Postgres 的测试沿用 `ORBIT_LIFECYCLE_TEST_DATABASE_URL` 约定；报告里必须给出设置该变量后的执行结果（默认全量会跳过它们）。

## 设计要点

1. **每日汇总任务**：按（日期, 接口, 来源）和（日期, 账号）各一份汇总表，幂等（重跑同一天结果不变）。沿用现有定时任务机制（实施时查明 Vercel cron / 现有 worker 的做法并复用）。
2. **清理任务**：小票保留 14 天，汇总保留 1 年。
3. **对账**：每日记录「我们记的总字节数」「Neon 传输量」「覆盖率」。Neon 用量接口需要额外密钥或套餐支持：环境变量未配置时对账行记为「未取得」，页面如实显示，不报错、不伪造。
4. **管理页**：网页管理后台新增「读取量」页，仅对配置的管理员账号可见（环境变量列出账号编号，例如 `ORBIT_READ_COST_ADMIN_ACCOUNT_IDS`；代码中没有现成平台管理员角色，2026-09-27 已查）。
5. **报警**：三条规则（接口平均每次读取量 > 过去 7 天中位数 × 2；单请求 > 5MB；覆盖率 < 70%），阈值为代码常量。触发时写入管理员账号的站内收件箱（复用现有收件箱通知写入路径与类型体系），同一规则同一天同一对象只发一次。

## 验收契约

| SC | 可观察行为 | 必需证据 |
| --- | --- | --- |
| SC-0100-01 | 汇总之和等于小票之和；同一天重跑结果不变 | 真库测试 |
| SC-0100-02 | 超过保留期的小票/汇总被清理，未超过的保留 | 真库测试 |
| SC-0100-03 | 非管理员访问读取量页与其接口被拒；管理员看到四个区块 | 路由测试 + 浏览器截图 |
| SC-0100-04 | 造一个读取量翻倍的接口与一个 6MB 请求，报警各发一次到管理员收件箱，重跑不重复 | 真库测试 + 收件箱回读 |
| SC-0100-05 | Neon 用量未配置时对账显示「未取得」；两端全量与 typecheck 通过，棘轮不增加 | 摘要 |

## 排除

生产 cron 配置变更与部署由用户确认后执行；Axiom 仪表盘配置。
