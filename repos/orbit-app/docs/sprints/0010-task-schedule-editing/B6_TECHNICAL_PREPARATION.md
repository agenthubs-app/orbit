# B6：事项协议核查与待审边界

2026-09-14，源码基线 `8d95575c2`。技术准备，不启动 Generator，不修改 [Planner](PLANNER.md) 的验收或白名单，不表示真实数据验收通过。

## 已有能力与实际缺口

| 项目 | 当前证据 | 实施含义 |
| --- | --- | --- |
| 无联系人个人待办 | Web `app/api/tasks/route.ts` 实际导出 collection-handler 的 POST；允许 `category: personal`，`relatedContactId` 可省略。App Today 已有创建入口。 | 不新增第二套个人待办 API；验收现有创建与重试，不能把旧 `app/api/tasks/handler.ts` 的 GET 当当前路由全部能力。 |
| 清空日期 | detail handler 的 parsePatch 对每项执行非空字符串校验；`plannedDate: null`、`dueAt: null`、空字符串均拒绝。 | 缺明确删除语义，不能客户端只清空显示。 |
| 地点 | TaskItemContract／TaskUpdatePatch 和 PATCH 白名单均无 location。 | 必须覆盖契约、解析、持久化、回读、两端显示，不能只加输入框。 |
| 个人日程 | `/api/schedule-items` 仅导出 GET；provider 聚合活动和已确认 appointment。类型含 personal 不证明有创建能力。 | 不把个人待办日期冒充日程 startsAt，不把个人日程伪装为已确认人脉会面。 |
| 提醒 | TaskService 只有 onTaskTerminated 回调；update 无改日期回调。ReminderPlanContract 记录绝对 fireAt/timeZone，无相对截止时间偏移。 | 不能从改日期推断提醒跟随。现有绝对提醒保持或改为联动必须在审阅时明确。 |
| 版本／幂等 | service 先 get、比较 updatedAt、再 save；repository.save 无条件 upsert。replay 以动作 key 找 activity，不比较请求内容。 | 顺序旧版本测试通过不证明并发安全；同 key 异 payload 的处理也须明确。 |

上表 Web 路径均相对 `repos/orbits`。对应 App 入口为 `src/screens/today/TodayScreen.tsx`、`src/view-models/today-tasks.ts`；共享副本仍只走 sync:contract。

## 本轮隔离证据

全部使用新建内存 store、合成 actor、现有函数注入；未启动 HTTP 服务、未连接业务库、未触发通知。

1. 调用实际 collection POST handler：个人类别、不传联系人，返回 201；同 key 再提交得到同 ID，最终列表只有一条。
2. 调用实际 detail PATCH handler：上述三种日期清空和 `location: Tokyo` 分别返回 400，记录仍存在且未被这些失败修改。
3. 同一个 TaskService／repository 上，对同一 updatedAt 用不同 key `Promise.allSettled` 并发改 title 和 notes：两次均 fulfilled；最终 title 为原值、notes 为第二次值，updated activity 只剩一条。这证明当前内存存储路径可丢一次已返回成功的修改；不声称已发生真实账号数据损失，也不是 PostgreSQL 并发测试。
4. Web cwd 执行 `node --test --import tsx tests/api/tasks-routes.test.ts tests/api/schedule-items-route.test.ts tests/services/tasks-service.test.ts`：15 通过、0 失败、0 跳过，exit 0。这些是既有基线，不是新功能 RED→GREEN 或 SC 完成证据。

复现核心：`createMemoryLiveRecordStore → createTaskRepository → createTaskService`；先 create，再以同一个 `expectedUpdatedAt`、两个不同 `idempotencyKey` 并发 update；同时检查两次返回和 repository 中的 task／activities，不能只断言 Promise 成功。

## 建议审阅的最小技术方案

这是提案，不是已批准的接口。

- 复用现有 `/api/tasks` 和 detail action；更新字段省略表示不变，`plannedDate`／`dueAt`／`location` 的 null 表示删除。拒绝空字符串，不用空值兼容去绕过所有字段验证。日期沿用 0009 的纯日期／带偏移时刻区分；仅设置日期不生成午夜 dueAt。
- 增加 task location 时覆盖 feature contract、shared contract、task record 解码、API 解析及两端 view-model。需同时确认旧客户端提交省略字段不会擦除地点。
- 把版本检查、同 key 请求指纹校验、task 与 activity 写入放在一个 feature-owned 原子存储操作中；冲突明确返回 409。不要在 UI 上加锁后宣称解决跨设备并发，也不要泛化改写所有 LiveRecordStore 用户。
- 个人日程使用独立 actor-owned 记录和 create/update/delete 契约，复用现有 GET 聚合；不写外部日历、不借 appointment 确认流程。具体时间字段应等 0009 的全天／时区契约批准后冻结。
- 最小提醒方案是编辑日期后保持既有绝对 fireAt，保存界面明确说明，并展示服务端回读的提醒。若要求相对截止时间自动联动，需增加明确的关联／偏移规则与原子更新策略，不能默认推导；原 Planner 排除了提醒引擎／迁移，此变化须单独审阅。

## 修改边界与必须补的反例

Web 候选：`shared/contract/tasks.ts`、`features/tasks/contract.ts`、`service.ts`、`repository.ts`、`task-record.ts`、`app/api/tasks/collection-handler.ts`、`app/api/tasks/[id]/handler.ts`，以及 schedule-items handler/provider。个人日程的 storage／写路由需在正式 Planner 中列出精确新文件；本提案不预批新表或迁移。Web tasks 页面也必须消费新增字段，不能只有 App 可编辑而声称双端对齐。

App 保留原 Planner 页面边界，并按正式契约增加同步副本与本地校验的精确文件；不手改副本。新增实现前逐符号 impact；createTaskService 的现有消费者包括任务路由、Today、建议服务及 AI task interaction，不能只跑日期 UI 测试。

必补行为：并发同版本只接受一次；同 key 同内容重放／异内容冲突；字段删除后 GET 不复活；未知字段／跨 actor 拒绝；已结束或删除对象按状态规则处理；日期保存不夹带标题草稿；提醒保持／联动的回执真实；个人日程在首页、待办、日历同 ID 回读。

当前缺项分别绑定动作：0009 尚未交付阻塞时间消费者；跨端方案与提醒语义审阅阻塞对应代码；隔离数据库／真实对象授权阻塞持久化与设备 SC。上述缺项不阻止现有只读核查，但不能将本记录当作已启动 run。
