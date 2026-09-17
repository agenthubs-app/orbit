# R2 云端提醒链验收器

`verify-cloud-reminder-chain.ts` 是一条有界的 live-store 验收脚本。它默认只读；只有显式传入 `--write` 才会创建一条联系人笔记和一条任务提醒，只有同时传入 `--dispatch` 才会执行提醒，只有同时传入 `--mark-read` 才会写入已读状态。

脚本不 seed、不清理、不批量改写数据，也不发送 email、push 或其他外部消息。写入模式应只由主代理在已授权的 Neon 合成账户上运行。

## 已确认的真实入口

| 环节 | 当前入口 | 实际行为 |
| --- | --- | --- |
| Note | `createNoteService.create` / `features/notes/service-factory.ts` | 经 `NoteAssociationReader` 校验联系人归属，写入 `notes`，脚本随后用 `get` 重读 |
| ReminderPlan | `createReminderPlanService.create` / `/api/reminders` POST | 写入 `reminderPlans`，`targetType` 固定为 `task`，目标归属由任务读取再次确认 |
| 执行 | `ReminderPlanService.dispatchDue` | 仅对本脚本 actor 的到期计划执行；`in_app` 会写入 canonical `notificationDeliveries` 并把计划置为 `delivered` |
| Notification 可见性 | `/api/notifications` 的 canonical reminder 分支 | `delivered`/`failed` 的 ReminderPlan 以 `reminderId = plan.id` 出现在收件箱投影中 |
| 已读 | `NotificationInteractionService.set/list`，对应 `/api/notifications/[id]/state` | 以 ReminderPlan 的 `plan.id` 写入 actor-scoped `notification_interactions`；脚本会重读确认 `read` |
| 目标详情 | `/api/tasks/[id]` GET → `TaskService.list` | actor 过滤后读取目标任务，脚本确认 owner、标题和 `/app/tasks/<encoded-id>` 深链接 |

## 一个容易误判的边界

仓库中有两套投递记录，名字相近但 payload 不同：

1. ReminderPlan 路径写入 `notificationDeliveries`，payload 是 `{ entity: NotificationDeliveryDTO }`。
2. `features/notifications/delivery-service.ts` 的 durable delivery ledger 写入同名 collection，payload 是 `{ kind: "notification_delivery", delivery: NotificationDelivery }`，有 lease、attempt、retry 和 dead-letter。

当前 canonical ReminderPlan 执行不会生成旧的 `notifications` collection 记录。`/api/notifications` 是把已完成的 ReminderPlan 映射成通知投影；已读记录则单独放在 `notification_interactions`。脚本会返回 `legacyRecordMatched`，完整 canonical 验收不要求它为 `true`，但它必须被显式看到，避免把两套记录误认为已经打通。

现有 maintenance 云入口也只覆盖第二套 durable ledger：`runMaintenancePass` 的 `notification_redelivery` 调用 `runNotificationDeliveryPass`，不会调用 `ReminderPlanService.dispatchDue`。`scripts/run-reminder-worker.ts` 能执行 canonical ReminderPlan，但它是本地/外部进程循环，不是 Vercel maintenance 云 worker。因此本脚本能验收 canonical 单 actor 链，但不宣称 maintenance 已覆盖该链。

## 凭据和运行方式

脚本使用仓库已有的 `loadLocalEnv()`，按以下顺序读取数据库连接：

1. `ORBIT_EVENT_DATABASE_URL`
2. `ORBIT_LIVE_DATABASE_URL`
3. `ORBIT_DATABASE_URL`

workspace 使用 `ORBIT_WORKSPACE_ID`，未设置时沿用 live-store 的默认值。连接串和任何 token 都不会打印。脚本主动注入禁用 push gateway，并把计划 channel 固定成 `in_app`。

先做只读预检：

```bash
cd /Users/li/work/orbit/repos/orbits
npm exec tsx scripts/verify-cloud-reminder-chain.ts \
  --actor-id <synthetic-actor-id> \
  --contact-id <actor-owned-contact-id> \
  --task-id <actor-owned-task-id>
```

预检必须确认 `contactFound=true`、`taskOwnerMatches=true`，并且执行模式下 `existingDueReminderCount=0`。如果已有到期提醒，脚本会拒绝执行，避免一次 dispatch 扫到同一 actor 的其他计划。

完整验收由主代理显式执行。`--fire-at` 必须是当前时间或过去时间；`--run-id` 要为这次验收唯一且稳定，用于两个幂等键：

```bash
npm exec tsx scripts/verify-cloud-reminder-chain.ts \
  --actor-id <synthetic-actor-id> \
  --contact-id <actor-owned-contact-id> \
  --task-id <actor-owned-task-id> \
  --run-id r2-20260916-01 \
  --fire-at <past-or-current-iso-time> \
  --write --dispatch --mark-read
```

成功结果应同时满足：

- `chain.note.contactLinked=true` 且 `chain.note.reloaded=true`；
- `chain.reminderPlan.targetMatches=true` 且重读成功；
- `chain.delivery.channel="in_app"`、`status="delivered"`，且 `reminderPlanMatches=true`；
- `chain.notification.visibleFromReminderPlan=true`、`interactionState="read"`；
- `chain.targetDetail.ownerMatches=true`；
- `sideEffects.pushProviderCalls=0`；
- `complete=true`。

`chain.notification.legacyRecordMatched=false` 是当前两条 notification source 尚未建立 canonical bridge 的事实，不是脚本漏验；若产品以后要求旧 `notifications` collection 也必须产生记录，应先单独设计并实现 bridge，再把它加入成功条件。

脚本没有删除操作。若需要重复验收，应使用新的 `--run-id`；真实上线前的 synthetic 数据清理仍按发布计划由主流程处理。

## 去重和重试核查结果

已有测试已覆盖这些能力：

- `tests/services/reminder-plan-service.test.ts`：canonical ReminderPlan dispatch 幂等、quiet hours、in-app fallback，以及 push provider 失败时仍保留 in-app delivery；
- `tests/api/reminder-plan-routes.test.ts`：已投递 ReminderPlan 进入现有 inbox projection，且不依赖 device token；
- `tests/capabilities/notification-delivery-ledger.test.ts`：durable delivery materialization 幂等、lease/receipt、临时 provider 失败后的 retry 和 daily cap；
- `tests/services/maintenance-pass.test.ts`：bounded maintenance pass 的隔离、预算和失败脱敏。

本次新增的独立测试只验证验收器边界，不连接生产库：默认 dry-run 不调用写服务；完整编排最多请求一条 note、一条 in-app ReminderPlan、一条 delivery 和一条 read interaction；已有到期计划时拒绝 dispatch。

运行：

```bash
node --test --import tsx tests/scripts/verify-cloud-reminder-chain.test.ts
npx tsc --noEmit --incremental false --allowJs false --jsx react-jsx \
  --target ES2017 --lib dom,dom.iterable,esnext --module esnext \
  --moduleResolution bundler --esModuleInterop --skipLibCheck \
  scripts/verify-cloud-reminder-chain.ts \
  tests/scripts/verify-cloud-reminder-chain.test.ts
```

## R2 云 worker 状态与最小接线方案

`complete=true` 只表示这次脚本调用完成了单 actor 的 canonical 脚本链，不表示 R2 已经有云端持续执行能力。当前实际根因是 canonical `ReminderPlanService.dispatchDue` 没有接入 maintenance heartbeat；不能用一次 CLI dispatch 代替云闭环。

本轮已新增但暂不接线的 feature-owned task：

- `features/notifications/canonical-reminder-maintenance-task.ts`
- `tests/services/canonical-reminder-maintenance-task.test.ts`

它只暴露一个 bounded maintenance task 和一个 canonical-only 的 Postgres due-actor scanner，未修改 `features/operations/maintenance/configured-tasks.ts`，也未修改 R3 的 worker 文件。

固定边界如下：

| 边界 | 规则 |
| --- | --- |
| actor 扫描 | 只查 `reminderPlans` collection；`lifecycle_state <> deleted`、`payload.entity.status = scheduled`、`fireAt <= now`；按 `user_id` 去重，最早到期优先 |
| actor 上限 | 每次 heartbeat 默认最多 25 个 actor，硬上限 100；重复 actor 不重复 dispatch |
| dispatch 上限 | 每个 actor 默认最多 10 个 due plan，硬上限 50；dispatcher 必须在构造 actor-scoped ReminderPlanService 时真正执行这个 limit |
| deadline | 维护 pass deadline 到达后不再启动新 actor，剩余 actor 计入 `actorsDeferred` |
| legacy | 不读写 legacy `notifications`，canonical inbox projection 仍是唯一通知读取面 |

R3 完成后，主代理按以下顺序串行接线：

1. 在 `configured-tasks.ts` 中创建 Postgres due-actor scanner，使用当前 workspace 和 maintenance worker id；
2. 提供 `dispatchDueForActor` adapter：每个 actor 使用 actor-scoped repository，先按 `ownerUserId` 过滤，再把 due plans 截断到 10 条，最后调用现有 `ReminderPlanService.dispatchDue`；不得直接调用默认 unscoped service，因为它会扫描 workspace 内所有 due plans；
3. 把新 task 加入现有 `createConfiguredMaintenanceTasks()`，沿用现有 maintenance heartbeat 的 bounded pass、日志和 503 失败语义；
4. 补一条真实配置的串行验收：actor 扫描数量、单 actor plan 上限、重复 heartbeat、失败后的 HTTP/heartbeat 状态和 canonical `/api/notifications` 投影。

当前幂等与失败事实必须按真实代码理解：

- ReminderPlan id 由 actor 与 idempotency key 稳定生成；canonical delivery id 也由 actor、plan、channel、device 和 fireAt 稳定生成。已有单进程重复 dispatch 测试确认第二次不会再创建同一 in-app delivery。
- 但 `ReminderPlanService` 的 `activeClaims` 是进程内 Set，不是跨 Vercel invocation 的 lease/fence；默认 `listDuePlans` 也没有批量上限。因此 actor-scoped、bounded adapter 是云接线的必要条件，现阶段不能宣称跨 worker 并发安全已经完成。
- canonical service 没有 `retryAt`、attempt 或 dead-letter 字段。in-app 成功后计划变为 `delivered`；push provider 失败会把计划变为 `failed`，due 扫描不会自动把它重新纳入。maintenance task 会把 dispatcher exception 或 `pushFailed` 暴露为 `failed`，让 heartbeat/pass 返回失败，但 heartbeat 本身不会自动重置一个已变成 `failed` 的 ReminderPlan。
- `features/notifications/delivery-service.ts` 的 `retry_scheduled`、lease 和 dead-letter 只属于另一套 durable delivery ledger，不能借此声称 canonical ReminderPlan 已具备失败重试。

因此最小可上线接线建议是：第一阶段只让 heartbeat 执行 actor-scoped、最多 10 条/actor 的 canonical `in_app` 计划，并验证幂等和失败可见性；在设计 canonical plan 的持久化 claim/retry 前，不把 push 失败重试或跨 worker fencing 标为 R2 已完成。
