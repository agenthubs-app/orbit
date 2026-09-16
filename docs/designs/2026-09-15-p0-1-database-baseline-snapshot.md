# Orbit P0-1 数据库基线快照

> 2026-09-16 修订：本文件仅保留过去检查的证据。用户确认没有真实历史数据，历史源库连接和备份恢复不再是工作依赖；后续按 [Demo 初始化与验收计划](2026-09-15-data-and-launch-readiness.md) 执行。

## 快照用途

这份快照用于 P0-1 数据盘点和 P0-2 迁移演练前的证据索引。它严格区分：

1. **源库最近可用的只读核查**：2026-09-10，对当时工作区配置指向的本地 PostgreSQL 完成；
2. **当前 Neon 目标基线**：2026-09-15，对新建 Neon `orbit` 项目完成；
3. **当前限制**：旧源库连接当前不可用，因此不能把 9 月 10 日数据当成今天仍未变化的源库事实。

本文件不包含业务正文、完整 payload、连接串、密码、token 或个人身份信息。

## A. 最近可用的源库只读核查

| 项目 | 结果 |
| --- | --- |
| 核查时间 | 2026-09-10 13:59–14:08 JST |
| 源库类型 | 当时 `.env.local` 中 `ORBIT_EVENT_DATABASE_URL` 指向的本地 PostgreSQL |
| 访问方式 | `default_transaction_read_only=on` + `REPEATABLE READ READ ONLY`；每条查询超时 5 秒、锁等待 1 秒；结束 `ROLLBACK` 并关闭连接 |
| public schema | 48 张表 |
| 其他非系统 schema | 6 个 `profile_repair_operator_cli_*` schema；每个 43 张表，均早于本次核查 |
| `orbit_records` | 8,868 行；相对 9 月 6 日备份的 8,855 行为 8,806 行不变、49 行修改、13 行新增、0 行删除 |
| 业务差异时间 | 差异记录最晚 `updated_at` 为 2026-09-07 12:55:35.012 UTC，早于本次测试核查窗口 |
| 测试残留检查 | 已知报名测试标识为 0；本轮核对的测试 workspace / repair-event 标识为 0 |
| 审计 / 回执 | 19 条活动审计、1 条 canonical membership 迁移 run、2 条生命周期命令回执均早于核查；profile repair run 为 0 |
| 业务正文 | 未导出；仅核对数量、时间、来源和脱敏标识 |

原始证据：[`repos/orbits/docs/operations/2026-09-10-test-database-readonly-audit.md`](../../repos/orbits/docs/operations/2026-09-10-test-database-readonly-audit.md)。该文件说明了查询边界、备份逐行比较和证据限制。

## B. 当前 Neon 目标基线

| 项目 | 结果 |
| --- | --- |
| 项目 | Neon `orbit` |
| 数据库 / schema | `neondb.public` |
| 连接验证 | 2026-09-15 再次通过本地 `pg` 只读连接成功 |
| 非系统业务表 | 0；按 `pg_class` / `pg_namespace` 查询没有返回业务 schema |
| Orbit migration | 未执行 |
| seed / 业务写入 | 未执行 |
| 当前用途 | 空的目标环境，不可用来证明源库无业务数据 |

## C. 当前可访问性检查

2026-09-15 再次检查：

- `pg_isready` 对本机 PostgreSQL 返回无响应；
- 工作区仅发现 `repos/orbits/.env.local`，其中当前 `ORBIT_EVENT_DATABASE_URL` 已指向 Neon；没有保留旧源库连接变量或第二个 `.env` 文件；
- Docker socket 当前无权限访问，不能从容器恢复旧源库；
- 因此本轮没有对旧源库执行新的查询，也没有把 Neon 空库伪装成源库快照。

## D. 迁移前有效性结论

这份文件已经补齐“最近可用的源库证据 + 当前 Neon 目标证据”，但 **不能直接授权迁移**。P0-2 前仍需要满足以下条件之一：

1. 恢复可访问的旧源库连接，并重新执行同等只读基线查询；或
2. 提供/恢复与 9 月 10 日核查对应的数据库备份，在隔离环境只读恢复并重新生成按数据域的计数、owner 分布和 ID 冲突报告。

在此之前只能执行 Neon schema/migration 演练，不能执行业务数据导入、双写或生产切换。

## E. 与 P0-1 矩阵的关系

- 账号/资料、人脉/关系、任务、日程：使用源库 `orbit_records` 的数量和 collection/owner 统计作为迁移输入；当前快照还缺分域计数，不能跳过补查。
- 活动/报名：必须额外读取 `event_ops_*` canonical event/membership 表；`orbit_records` 总行数不能替代报名快照。
- I ORBIT / AI：不把临时上下文或 provider 输入写入迁移快照；只验证其依赖的 canonical 数据域。

关联矩阵：[`P0-1 数据权威最小矩阵`](2026-09-15-p0-1-data-authority-matrix.md)。
