# Canonical in-app 提醒 maintenance 接线

入口是 `createConfiguredCanonicalReminderMaintenanceTask({ env, workerId })`，
位于 `configured-canonical-reminder-maintenance.ts`，返回可直接运行的 `MaintenanceTask`。
已加入 `createConfiguredMaintenanceTasks()` 的返回数组，优先执行有界站内提醒：

```ts
import { createConfiguredCanonicalReminderMaintenanceTask } from "../../notifications/configured-canonical-reminder-maintenance";

// 在现有数组内添加：
createConfiguredCanonicalReminderMaintenanceTask({ env, workerId }),
```

主代理已完成 `configured-tasks.ts` 接线，保留 R3 的 event redispatch 和原 notification ledger task。
新增 factory 已在本地 PostgreSQL 执行验证；云端发布与实际 heartbeat 验收另记录，不以本地测试替代。
原验收脚本保持冻结，其 `complete` 只表示脚本链完成。

## 读取和执行边界

- 使用既有 `createConfiguredTransactionalPostgresRuntime`，数据库配置优先级为
  `ORBIT_EVENT_DATABASE_URL`、`ORBIT_LIVE_DATABASE_URL`、`ORBIT_DATABASE_URL`；
  workspace 使用 `ORBIT_WORKSPACE_ID`，默认 `workspace:default`。
- SQL 仅查询当前 workspace、active 且未删除、scheduled 且已到期的 `reminderPlans`。
  行 `user_id`、entity `ownerUserId/accountId` 必须相同，entity ID 必须等于 record ID。
- 仅选择 **channels 恰好为 `["in_app"]`** 的计划。
  mixed 和 push-only 计划保持原样，不能删去 push 渠道后将整个计划假报完成。
- SQL 最多返回 25 个 distinct actor，最早到期优先；每个 actor 再以 SQL 最多读取
  10 个 due plan，并锁定这些行。上限固定，不开放配置提高。
- 每个 plan 重读其精确 canonical task/personal schedule 目标并校验归属；
  已删除、已结束的 task（completed/cancelled）以及 cancelled schedule 不投递。
  不使用通用 JSON containsId 来认定所有权。其他 schedule 投影未纳入此 factory。
- preferences 和稳定 ID 的 delivery 均按单条记录读取，再校验行与 payload 的归属。
  不枚举 actor 的全部历史 delivery；不读取、伪造或补写 legacy `notifications`。
- 复用 `ReminderPlanService.dispatchDue` 执行领域写入，成功结果由现有 canonical
  `/api/notifications` 投影读取。provider 为拒绝发送的实现，不外发 email/push。
- pass deadline 到达后不启动新 actor。每次事务的 SQL statement timeout 为 5 秒、
  lock timeout 为 1 秒、idle transaction timeout 为 5 秒；这是 SQL 级超时，
  不是整个 actor 或连接获取的硬墙钟上限。

## 并发、中断恢复与失败

现有 heartbeat 在调用 runPass 前已提交并释放其 scheduler 行锁，因此不能把它
视为保护 task 执行期间的全局租约。factory 复用既有 serializable transaction，
在事务内对 `["canonical-reminder-in-app", workspaceId, actorId]` 获取
`pg_try_advisory_xact_lock(hashtextextended(..., 0))`。
目标读取、delivery 保存与 plan 保存均使用同一个事务连接。

两个 factory worker 对同一 actor 的同时执行只有持锁者可进入。
未取得锁的 actor 计入 `actorsFailed/failed`，maintenance pass 因此报告失败，
下次 heartbeat 重试。该锁只协调采用本 factory 的 worker；旧 CLI 没有采用该锁。

- 新执行中 delivery 保存后 plan 保存失败：整个 actor 事务回滚，计划仍为 scheduled，
  下个 heartbeat 可重新执行。连接/进程退出时 PostgreSQL 回滚并释放事务锁。
- 旧执行已经提交 delivery、却没有完成 plan 保存：service 对纯 in-app 计划按稳定
  delivery ID 读取成功证据，补存 `delivered` 与原 `deliveredAt`，不重写 delivery。
  此恢复不受后来关闭 in-app 偏好的影响，也不会把其他 fireAt/actor 的记录作为证据。
- mixed/push 的既有 replay 分支仍保持原行为：已有任何 delivery 时跳过整个计划。
  本次没有解决该分支的部分发送恢复或外部发送重试。
- 若全新纯 in-app 计划的用户偏好关闭了 in-app，继续沿用 service 的
  `failed/NO_DELIVERY_CHANNEL_AVAILABLE` 行为，不会绕过用户偏好。
- 数据库/目标校验错误会使该 actor 的本批事务失败，其他 actor 仍可执行。
  未完成计划保留 scheduled 供下一次扫描；持续存在的非法目标仍会持续失败，
  本次不擅自取消或修复其数据。
- 本次没有引入 canonical `retryAt/attempt/dead-letter`，也没有声称 push 已闭环。
  原 service 在 in-app fallback 成功时，即使 push 失败，plan 仍可为 delivered；
  没有任何成功渠道才会为 failed。另一套 durable ledger 的重试能力不属于此链。

## 定向验证

不加载 `.env` 的本地服务回归：

```bash
node --test --import tsx \
  tests/services/reminder-plan-recovery.test.ts \
  tests/services/reminder-plan-service.test.ts \
  tests/services/canonical-reminder-maintenance-task.test.ts \
  tests/services/configured-canonical-reminder-maintenance.test.ts \
  tests/services/maintenance-pass.test.ts \
  tests/api/reminder-plan-routes.test.ts \
  tests/scripts/verify-cloud-reminder-chain.test.ts \
  tests/scripts/run-reminder-worker.test.ts
```

真实事务测试需要显式设置 `R2_CANONICAL_REMINDER_TEST_DATABASE_URL`。
测试拒绝非 localhost/127.0.0.1/::1 地址，数据库名必须为 `orbit_reminder_test`；
每轮创建随机 schema、仅在其中写入合成数据，结束删除该测试 schema。
不设置该变量时数据库测试明确 skip，不会自动读取生产配置。

```bash
R2_CANONICAL_REMINDER_TEST_DATABASE_URL=postgresql://postgres@127.0.0.1:55493/orbit_reminder_test \
  node --test --import tsx tests/services/configured-canonical-reminder-maintenance.test.ts
```

覆盖真实 SQL actor/plan 上限、渠道筛选、归属校验、偏好、目标类型、plan 写入失败回滚、
backend 被终止后的恢复、旧 partial delivery 恢复，以及两个独立 worker 的竞争。
主代理接线后的云验收必须经 heartbeat 自己产生 delivery/plan 完成状态，
再读取 canonical inbox 和目标详情；CLI 手动 dispatch 不能替代该证据。
