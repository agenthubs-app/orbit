# Orbit P0-2 Neon 迁移演练记录

> 2026-09-16 修订：schema 演练结果继续有效。用户确认没有真实历史数据，下文关于取得源库和恢复旧备份的后续条件已撤销；当前按 [Demo 初始化与验收计划](2026-09-15-data-and-launch-readiness.md) 执行。

## 结论

P0-2 的“隔离环境 + schema/migration 演练”已完成。演练只创建结构，没有导入业务数据、演示数据或生产数据；production 分支未作为试迁移目标。

这证明了当前仓库已有的 Web runtime migration 可以在 Neon 隔离分支上完成初始化并幂等重跑，但不等于已经完成业务数据迁移、Web/API 切换或 App/Web 跨端验收。

## 演练环境

| 项目 | 结果 |
| --- | --- |
| Neon 项目 | `orbit` |
| 目标数据库 / schema | `neondb.public` |
| 隔离分支 | `p0-2-migration-rehearsal-2026-09-15` |
| 分支 ID | `br-curly-shadow-b31lyn7s` |
| 父分支 | `production` |
| 分支类型 | `Branch schema only Beta`；不继承父分支数据 |
| 自动清理 | 1 天；预计 2026-09-16 23:25:46（GMT+8）到期 |
| 演练 workspace | `workspace:p0-2-rehearsal` |

分支连接凭据只通过临时环境文件传递给迁移命令，没有写入仓库或本记录；演练结束后应清理临时凭据文件。

## 执行内容

执行了仓库现有的官方 migration 入口：

- `scripts/migrate-live-records.ts`：`orbit_records`、关系生命周期和事件操作核心结构；
- `scripts/migrate-event-experience.ts`：活动体验结构；
- `scripts/migrate-event-analytics.ts`：活动分析结构；
- `scripts/migrate-appointments.ts`：预约结构；
- `runBusinessCardIngestV2Migrations(...)`：名片摄入 v2 结构；
- `scripts/migrate-web-runtime.ts`：完整 Web runtime 入口端到端重跑。

第一次完整入口执行在核心阶段后出现长时间无新增输出，已在隔离分支中中止；随后分阶段官方入口均成功完成，最后再次执行完整入口并得到：`Web runtime schemas migrated; no demo data seeded.` 这次中止只影响该次命令，不影响 production，也没有产生业务数据。

## 验收结果

### 表和迁移账本

- `public` 非系统基础表共 61 张；
- `event_ops_schema_migrations`：15 个版本；
- `event_ops_experience_schema_migrations`：1 个版本；
- `event_analytics_schema_migrations`：1 个版本；
- `appointment_schema_migrations`：4 个版本；
- `bc_ingest_schema_migrations`：5 个版本；
- 关键结构已存在：`orbit_records`、`event_ops_events`、`event_ops_membership_heads`、`event_ops_experience_versions`、`event_analytics_roi_snapshots`、`appointment_outbox`、`bc_ingest_batches`。

### 空数据和不导入原则

所有非迁移账本表的行数均为 0，包括：

- `orbit_records`；
- 活动、报名、成员、资料、任务、关系和 outbox 表；
- 活动体验和分析表；
- 预约表；
- 名片上传、图片写入和摄入批次表。

因此本次只验证 schema，不把 P0-1 源库快照中的业务记录带入 Neon。

### 幂等性

以下官方入口均完成了至少一次重跑并成功返回：

- `migrate-live-records.ts`；
- 活动体验、活动分析、预约 migration；
- 名片摄入 v2 migration；
- 完整 `migrate-web-runtime.ts`。

重跑后迁移账本版本和业务表空数据状态保持不变，说明当前 migration 可用于后续隔离环境初始化和发布前演练。

## 回滚边界

本次回滚点是 Neon 隔离分支本身：保留 `production` 不变，直接删除演练分支或等待其自动到期即可；由于没有导入业务数据，不存在业务数据回滚负担。

进入 P0-3 前仍不能把“删除演练分支”当作生产回滚方案。正式迁移还必须补齐：源库可访问的只读基线、逐域 ID/owner/权限校验、正式备份与恢复演练，以及 Web/API 切换前后的回读验证。

## 当前未完成项

- 未执行任何业务数据迁移；
- 旧源库当前仍不可访问，P0-1 的历史快照不能直接视为当前源库；
- 未切换 Web/API 到正式 Neon 运行环境；
- 未完成 Web → Neon → App 和 App → Neon → Web 的跨端回读；
- 未执行 production 分支 schema apply。
