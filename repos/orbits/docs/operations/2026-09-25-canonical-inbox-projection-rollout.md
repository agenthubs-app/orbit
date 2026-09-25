# Canonical 提醒通知投影：本地实现与发布门

状态：默认关闭的第一来源基础实现，**不是已经完成的 P3 切换**。未部署、未安装生产表、未回填、未发送真实 Push。现有 GET / 后台 business refresh 保留。

## 本批实际覆盖

canonical wake 成功投递站内提醒，以及旧 canonical maintenance dispatcher 成功保存 delivered plan 时，在原业务事务中登记 `orbit_inbox_projection_work`。主事实回滚，工作项也回滚；工作项写失败则整笔投递事务失败重试。通知文案校验在独立消费者中进行，不让 typed inbox 的较严格长度限制阻塞原本合法的提醒投递。

工作键为 workspace / actor / canonical_reminder / plan ID，只合并最终状态，不用于消息、约谈事件历史。revision 为明确字段的 SHA-256 等价指纹，不是时间排序水位；同毫秒改期也能产生新 generation。来源记录的行 owner、entity account/owner、ID、来源/目标元数据，以及对应 delivery fence 均重验。展示及动作仍走已有权威来源权限，不缓存 available=true。

每次默认领取 25 项，硬上限 50，`SKIP LOCKED`；lease token / generation / revision / scope 共同 fencing。投影和完成在同一事务；lease 到期或写失败不能留下完成标记。失败退避重试，8 次后进入 failed；非法来源可直接 failed。同 revision 不复活死信。completed 历史不参与 idle 领取，没有 `MAX(serial)` 或裸时间戳消费水位。

锁顺序：生产者在既有业务锁内 enqueue；消费者锁工作项后仅普通 SELECT 读取来源，不反向获取业务行锁。外部发送不得放入 complete 回调。消费者与生产者并发发生 serializable conflict 时重试/重领，不能忽略冲突并提交旧结果。

## 仍然阻止切换的具体缺项

1. **语义尚不等价**：旧 `reminderPlanNotification` 会物化已到期且未取消的计划，包含 scheduled / failed；本批只接受 delivered + 对应 delivery fence。不能用本批覆盖率代替完整来源覆盖率，更不能直接删 GET reminder 分支。
2. **周期日程**：旧 refresh 同时负责生成周期实例/计划并验证当前实例。本批没有替代 series / exception / 到期窗口补齐。停止旧刷新前必须先接独立有限窗口补齐任务。
3. **改期、取消、删除和其他 writer**：本批成功投递入口有可靠工作项，但不是完整来源变更日志；旧读时授权继续遮挡失效来源。需逐 writer 补同步失效或可靠工作项，并做 writer 覆盖测试后才能迁移精确计数/缓存。
4. **历史回填与 Push**：未提供可运行回填。未来先接齐 writer，再按 ID 分页、事务内锁定并重读来源、持久 checkpoint、小批推进；扫描结果不能直接覆盖并发新 revision。既有 notificationCutover.since 只排除切换前历史，不能保证切换之后的历史回填不再次进入 Push 候选。需要单独的历史投递抑制事实/对账，不能靠把通知全部标已读或改变 cutover 时间来掩盖。
5. **调度与运维**：独立 queue wake 仅登记工作；本批消费者在 canonical maintenance pass 的尾部。heartbeat 关闭或 pass 时间用完会延后消费；尚需负载下公平性、最大通知延迟、failed/积压告警验收。不能声称已经实现准时通知 SLA。

## 后续有授权时的迁移检查顺序

以下是发布门，不是本轮已执行动作：

1. 确认精确部署基线、Neon workspace / branch、所有旧部署与本地 worker；保持 `ORBIT_CANONICAL_INBOX_PROJECTION` 未设置或 `0`，typed 白名单不扩张。
2. 单独审查并安装 `features/notifications/storage/inbox-projection-work.ts` 导出的 additive schema，检查主键、状态/lease 约束及两个 partial indexes。`CREATE IF NOT EXISTS` **不是**现有同名表结构一致的证明；发现同名异构表须停止，不能直接开开关。应用请求和 worker 不自动执行 DDL。
3. 先完成上述语义、writer、历史投递抑制和持久回填实现及本地对账，再决定灰度。开启 flag 会让 canonical 投递依赖工作表存在；开关前需验证建表成功及消费者持续运行。
4. 灰度只对明确环境启用 `ORBIT_CANONICAL_INBOX_PROJECTION=1` 并部署；混合旧/新部署仍可能遗漏工作项，不能在此期间停止旧读路径。校验新的 projectionClaimed / Completed / Skipped / Failed / Deferred 计数、最老 pending、过期 lease、failed 安全错误码及 Neon 实际增量；不要记录通知正文。
5. 小批回填不发送历史 Push；逐 actor 对照通知集合、未读、read/dismiss/snooze 和撤权。已知 scheduled/failed/周期日程差异必须归零或由单独明确产品决定处理，不能拿总条数相同代替逐项对账。
6. 只有对应来源前后台生产者均等价时才删除它的 GET/后台全量枚举；其他来源保持显式未迁移状态。

## 暂停与恢复

flag 关闭并重新部署相关消费者/生产者后不再领取或登记本批工作，工作数据保留，恢复后可重领过期 lease；不会删除已有 typed 通知，也不会停止 canonical reminder 本身或旧 refresh。已开始的 pass 可以完成手里的数据库事务，这不是强制中断。必须清点旧部署/独立 scheduler 并实际确认不再 claim，不能仅凭环境变量页面判定已停。没有新增自我续排的队列链。

failed 是可调查记录，不是成功。修复来源并产生不同指纹可重新登记；同 revision 的人工 retry 尚未提供操作入口，禁止无核对批量重置 attempts。

## 本地复现

只接受 localhost / 127.0.0.1、无 URL 参数的测试库；测试自行创建随机 schema 并仅清理自己的 schema。不得把下面的变量替换成云端地址。

```sh
env -i PATH="$PATH" ORBIT_LIFECYCLE_TEST_DATABASE_URL=postgresql://li@localhost/orbit_cutover_test_20260917 node --import tsx --test tests/services/inbox-projection-work-postgres.test.ts tests/services/canonical-inbox-projection-postgres.test.ts tests/services/canonical-inbox-projection-cost-postgres.test.ts tests/services/typed-message-materialize-cost-postgres.test.ts tests/services/canonical-reminder-wake-postgres.test.ts
env -i PATH="$PATH" ORBIT_LIFECYCLE_TEST_DATABASE_URL=postgresql://li@localhost/orbit_neon_audit_20260925 node --import tsx scripts/diagnostics/check-inbox-source-batches.ts
```

数据库返回 JSON 字节只用于本地相对基准，不包括 PostgreSQL 协议、连接和其他查询，不是 Neon 账单计量。
