# 2026-09-10 测试数据库只读核查

## 结论与范围

本次核查未发现可归因于 2026-09-09 Web 全量测试的持久业务数据变更或新增测试残留。这不是“测试期间没有任何写入”的证明：此前的 PostgreSQL 测试确实在现有数据库中创建、使用并清理了临时 schema。

用户于 2026-09-10 明确批准只读核查；不包含清理、修复、迁移、恢复数据库或切换客户端。本次实际查询约在 13:59–14:08 JST 完成，所有数据库连接均已关闭，没有执行业务写入或 DDL。

核查针对 `.env.local` / `.env` 中配置的 `ORBIT_EVENT_DATABASE_URL`，目标是本地 PostgreSQL。配置文件修改时间均早于测试事件。未输出连接凭据、个人身份、业务正文或完整 payload。

## 方法

- 只加载目标连接配置，不导入应用 runtime、服务工厂或数据库迁移器。
- 连接启动参数强制 `default_transaction_read_only=on`，随后开启 `REPEATABLE READ READ ONLY` 事务；每轮查询前检查两项只读设置均为 `on`。
- 每条语句超时 5 秒、锁等待超时 1 秒；查询完成后 `ROLLBACK` 并关闭连接。末轮检查其他同名核查连接为 0。
- 原测试日志文件时间为 2026-09-09 13:02:43.371–13:04:47.481 UTC，即 22:02:43–22:04:47 JST；时间戳筛查扩大至 13:00–13:10 UTC。
- 核对 `public` 的 48 张表、现存非系统 schema、应用审计/修复/命令回执和已知测试 actor 标识。
- 校验 9 月 6 日已有备份的 SHA-256，与已记录的 `c7cacf9892c59526d5aae914714f8470a1371ed216445c0a4bdf6057423492aa` 一致。使用 `pg_restore --data-only --schema=public --file=-` 离线读取归档文本，**没有提供数据库连接、没有执行恢复 SQL**。
- 比较归档 COPY 列值与当前同列值，统一时间格式和布尔值表示，并比较逐行摘要及重复行数量；`orbit_records` 另按 workspace / collection / record 主键逐列比较。旧 `verification.json` 的摘要算法未得到确认，因此没有把直接混用算法产生的不匹配当成数据变更证据。

## 发现

| 检查 | 结果 |
| --- | --- |
| 非系统 schema | `public` 加 6 个 `profile_repair_operator_cli_*`；没有其他测试 schema |
| 旧测试 schema | 每个有 43 张表；迁移记录日期为 8 月 19 日、8 月 28 日或 9 月 6 日，均早于本次测试；9 月 6 日的发布记录已明确保留 6 个此类 schema |
| `public` 行内容 | 47 张表与 9 月 6 日备份逐行一致 |
| `orbit_records` | 8,855 → 8,868 行；8,806 行不变、49 行修改、13 行新增、0 行删除 |
| 差异记录时间 | 49 行修改和 13 行新增记录的当前 `updated_at` 均早于本次测试；最晚为 9 月 7 日 12:55:35.012 UTC |
| 测试时间窗口 | 所检查的业务变更时间列，没有落在扩大后的测试窗口中的记录；没有时间列的 3 张表均为空 |
| 已知报名测试标识 | `actor:catalogue-roster-lifecycle:*` 在 legacy records、membership heads/versions、profile versions 和 audit log 中均为 0 |
| 测试 scope 标识 | `public.orbit_records` / `event_ops_events` 未匹配本轮核对的测试 workspace 前缀或 `repair-event-a/b` 标识 |
| 审计与回执 | 19 条活动审计、1 条 canonical membership 迁移 run、2 条生命周期命令回执，均早于本次测试；profile repair run 为 0 |

`orbit_records` 相对备份的差异分布：

- 修改：43 条 `agentSignals`、5 条 `orbit_agent_chat_messages`、1 条 `orbit_agent_chat_sessions`。
- 新增：2 条 `agentAnalyticsEvents`、8 条 `agentRunSteps`、1 条 `agentRuns`、2 条 `orbit_agent_chat_messages`。
- 没有删除。联系人、关系和任务所在的其他 collection 没有行内容差异。

这些记录时间支持差异早于本次测试的判断，但时间戳本身不是不可伪造的事务审计，不能据此绝对断言实际写入时间或操作者。

## 证据限制与后续

数据库配置为 `log_statement=none`、`log_min_error_statement=error`、`track_commit_timestamp=off`，没有 pgAudit 扩展。测试窗口的 PostgreSQL 日志有 56 条 ERROR 和 1 条 WARNING，包括约束、并发冲突及故障注入；这些错误日志不能完整列出成功执行的 SQL。

没有紧贴测试开始前的完整快照，因此不能排除随后被恢复的短暂变更，或使用回填时间戳的写入。本结论限定为当前残留、备份逐行差异和可用审计证据，不能扩大为“数据库零影响”或整个 Web/App 已通过验收。

只读核查这项授权门槛已处理；全量测试的环境隔离仍未修复，原失败/跳过项仍需收口。不得原样重跑会加载现有数据库配置的测试。6 个旧 schema 保留不动；实际迁移、清理、客户端切换仍需各自授权。

核查期间，外部进程将原工作树保存为 `cb806901e`。本次没有创建、撤回或修改该提交；保存工作树不等于全量验收通过。

相关记录：[生命周期迁移工具计划](../superpowers/plans/2026-09-09-relationship-lifecycle-migration-tools.md)、[9 月 6 日备份与恢复演练](free-beta-launch.md)。
