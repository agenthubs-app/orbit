# Event Operations 云端 worker

Event Operations 的业务行仍保存在 Neon 的 `event_ops_*` 表中；Vercel Queue 只负责唤醒，不承载生成状态。`app/api/queues/event-operations/route.ts` 每次只执行一个有限的 `drainOnce()`，不会在 Function 内启动常驻循环。

## 触发和恢复

1. `startGeneration` 或 `retryGeneration` 在事务成功后发布一个 `event-operations` wake。发送失败不会回滚业务写入。
   Event Operations repository 中会产生 outbox 的 canonical registration、check-in、contact-request
   create/respond/withdraw 方法也在各自事务提交后发布 `outbox` wake；`publishGeneration` 当前只写
   publication/head，不写 `event_ops_outbox`，因此不额外发送无意义的 wake。
2. queue consumer 校验 `version/kind/workspaceId/wakeId`，忽略错误形状和其他 workspace 的消息。
3. worker 继续复用现有 generation task/outbox 的数据库 lease、heartbeat、lease epoch fencing、幂等写入和 retry。一次 tick 领取到工作后，再发布一条 1 秒后的 continuation。
4. maintenance heartbeat 周期性只读扫描 `event_ops_generations` 和 `event_ops_outbox`。发现丢失唤醒时重新发布 maintenance wake；没有工作时不发送消息。event-operations queue consumer 成功结束后还会 best-effort bootstrap/repair heartbeat chain，避免新部署必须等 cron 才建立心跳。
5. queue handler 抛错时由 Vercel Queue redeliver；任务级错误仍由原有数据库 attempt limit 决定，避免把一次 at-least-once 投递误当成 exactly-once。

Queue 的 retention 为 7 天，发送使用唯一 idempotency key；数据库 lease/fence 才是并发和重复投递的最终边界。生产环境需要配置已有的 `ORBIT_EVENT_DATABASE_URL`、`ORBIT_WORKSPACE_ID` 和对应的 Event Operations AI provider，不能把本地 `scripts/run-event-operations-worker.ts` 当成生产依赖。

本实现依据 Vercel Queues 的 push consumer、visibility timeout、retry 和 idempotency key 能力：

- <https://vercel.com/docs/queues>
- <https://vercel.com/docs/queues/sdk>

正式验收仍需在部署后由主办方执行“生成→等待进度→原子发布”，再由参与者刷新读取；本文件和单元测试不替代线上执行证据。
# 交换接受后的采集投影边界

- 交换仅确认双方认识。Postgres 与 memory/mock 接受路径共用 `relationship-acquisition.ts`，生成双方独立的 `captured` Contact/Connection，`version: 1`、`lifecycleInitialization: 'pending'`，不生成目标、下一步、截止日期、任务或关系强度；`valueTypes` 仅保留来源事实 `community_context`，不推断知识交换价值。`captured` 是既有采集态，不是第五个 canonical 关系阶段。
- `event_ops_relationship_sides` 和 outbox 保留不可变接受快照。用户后续按 contactId 各自显式初始化，只修改自己的 `orbit_records`，不反写接受快照。
- `event.relationship_side.project` 将旧排队的 `active` payload 也归一化为 pending，并移除 lifecycle 目标/下一步字段。共享 provider 的可选 `initializeAcquiredRelationship` 通过 `insertRecordIfAbsent` 原子插入（Postgres `ON CONFLICT DO NOTHING`），没有普通 upsert 回退。
- 同 owner 已有记录（包括 ready、用户编辑、归档、软删除）全部保留；冲突后核验存储 `userId`，异 owner 或不匹配 connection 必须失败，不能将投影标成成功。部分失败允许重放补齐缺失一侧记录，但不会覆盖已存在的记录。两种 store 的普通 upsert 行为不变。
- 已经落库的旧 active/无版本数据不会由重放偷偷修复，需独立、精确的初始化/数据修复流程；pending 不因此绕过严格 preflight。旧 matchmaking 写路由继续 410，不恢复旧的默认进入 active 行为。
