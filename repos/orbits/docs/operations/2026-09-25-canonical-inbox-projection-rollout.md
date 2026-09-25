# Canonical 提醒通知投影：本地实现与发布门

状态：默认关闭的第一来源基础实现，已补纯站内计划命令的变化/到期登记，**不是已经完成的 P3 切换**。未部署、未安装生产表、未回填、未发送真实 Push。现有 GET / 后台 business refresh 保留。

## 本批实际覆盖

canonical wake 成功投递站内提醒，以及旧 canonical maintenance dispatcher 成功保存 delivered plan 时，在原业务事务中登记 `orbit_inbox_projection_work`。主事实回滚，工作项也回滚；工作项写失败则整笔投递事务失败重试。通知文案校验在独立消费者中进行，不让 typed inbox 的较严格长度限制阻塞原本合法的提醒投递。

后续增量：同一开关也控制 configured reminder 命令的 create / reschedule / cancel / cancelFutureForTarget 的纯站内计划登记。创建及改期将 available_at 设为 fireAt，未到期不领取；取消立即登记新 revision、使旧 lease 失效。正常幂等重放不重置已完成/失败工作。wake 和旧 dispatcher 的 failed 状态同样登记，否则原 scheduled 工作会因 revision 变化被跳过而漏掉通知。消费者允许 scheduled / failed；delivered 仍额外核对 delivery fence。登记与主事实共用事务，工作表故障会使启用此开关的业务命令回滚，因此表和迁移门必须先就绪。默认关闭时不产生这项依赖。

工作键为 workspace / actor / canonical_reminder / plan ID，只合并最终状态，不用于消息、约谈事件历史。revision 为明确字段的 SHA-256 等价指纹，不是时间排序水位；同毫秒改期也能产生新 generation。来源记录的行 owner、entity account/owner、ID、来源/目标元数据，以及对应 delivery fence 均重验。展示及动作仍走已有权威来源权限，不缓存 available=true。

每次默认领取 25 项，硬上限 50，`SKIP LOCKED`；lease token / generation / revision / scope 共同 fencing。投影和完成在同一事务；lease 到期或写失败不能留下完成标记。失败退避重试，8 次后进入 failed；非法来源可直接 failed。同 revision 不复活死信。completed 历史不参与 idle 领取，没有 `MAX(serial)` 或裸时间戳消费水位。

锁顺序：普通生产者在既有业务锁内 enqueue；typed snooze 为 inbox actor → canonical reminder actor / plan / wake → work；消费者必须先锁 inbox actor，再锁 work，随后仅普通 SELECT 读取来源，不反向获取业务行锁。claim 事务不获取 inbox 锁且在消费前提交。complete 在获取锁之前设置5s语句/1s锁超时，并在40001/40P01时最多重试两次完整事务；外部发送不得放入回调，不能忽略冲突并提交旧结果。

typed inbox 的纯站内 snooze 已接入同一变化/到期登记。它用精确 getPlan 获取时区，不枚举全部提醒；复用 canonical reminder 的改期命令，在通知已有事务内同时保存 plan、wake intent、projection work 和通知动作回执。该模式不自行开启/重试嵌套事务、不在提交前发队列消息，由外层事务重试以及持久wake调度器负责恢复。即使投影开关关闭，snooze也会正确更新canonical wake，不再保留旧fireAt；只有projection work的写入仍受开关控制。

周期日程reconcile现已在日程原事务登记新建/取消plan的到期工作，configured日程工厂及旧business refresh受相同flag控制。周期计划本来包含in_app+ios_push，因此投影专用读取允许合法混合渠道，并在scheduled周期计划物化前重新校验当前series/occurrence。混合delivered可能只表示Push成功，投影不要求也不伪造in_app fence；pure-in-app delivered仍要求fence，canonical wake本身不接受混合计划。这是通知读模型登记，不是Push投递迁移。

普通mixed/push configured命令及typed snooze现也登记变化/到期工作，纯站内wake创建条件不变。configured legacy dispatcher保存最终plan时，和projection revision在同一局部数据库事务提交，避免先投递后消费时work仍指向旧scheduled版本。原外部发送/设备状态/切流策略未重写，不能将局部数据库原子性宣传为Push exactly-once；无可用渠道的failed仍能按旧收件箱语义生成提醒。

周期日程新增独立持久窗口：每个series一条`orbit_schedule_reminder_windows`进度，和日程计划及projection work在同一事务保存。生成未来90天、提前30天再次到期；不依赖用户GET维持窗口。原canonical maintenance在同一flag开启时读取到期进度，每轮默认10个series、硬上限25，按actor锁后重读当前series，使用原事务生成计划/工作并推进进度；不枚举全actor日程。取消/关闭提醒/移除重复规则停用进度，来源不存在或异主时也停用，不接触异主日程。发现候选、单项处理和失败标记均使用限时数据库事务；连接等待仍受运行时连接池超时约束，不宣称绝对墙钟截止。失败退避60秒到1小时，8次failed，同revision的旧GET不重启死信；新业务revision可重新登记。单项/发现/失败标记故障可见，不拖停其他可执行提醒。没有新增自我续排队列链。

## 仍然阻止切换的具体缺项

1. **语义尚不等价**：configured命令（含mixed/push及typed snooze）、wake / canonical dispatcher、configured legacy dispatcher和周期日程reconcile已接当前变化/到期登记。历史计划未回填，旧部署/未更新脚本仍可能漏登记，取消仍由读取权威权限隐藏，不能直接删GET reminder分支。
2. **周期日程**：独立持久窗口已接维护入口且本地验证，不再需要GET才能扩展新series；历史series还没有窗口进度，必须回填并逐项对账。单series异常实例读取仍需审计其历史规模；不能把新series到期测试当作全部历史迁移完成。reconcile使用单series旧计划50条keyset取消＋50个ID批量存在检查，相应partial索引尚未安装线上。
3. **其他 writer 与目标撤销**：configured命令、typed inbox snooze、周期日程reconcile和configured legacy dispatcher已登记；旧部署、诊断/种子脚本的直接repository写入，以及目标删除/撤权仍需逐项审计。旧读时授权继续遮挡失效来源，不能迁移成缓存授权或直接物化计数。新的共同锁序已由两个真实数据库事务并发验证，其他writer接线仍须遵守它。
4. **历史回填与 Push**：尚未提供完整可运行回填。先接齐 writer，再按 ID 分页、事务内锁定并重读来源、持久 checkpoint、小批推进；扫描结果不能直接覆盖并发新 revision。既有 notificationCutover.since 只排除切换前历史。现已提供独立`notificationHistoricalSuppressions`事实和登记函数：精确绑定workspace/actor/notification ID+scheduledFor，不改read/disposition；登记必须与历史投影/工作/进度同事务，锁序policy在inbox/source/work之前。已有非rejected外部发送预约时拒绝登记并要求对账，不能声称撤回了正在发送的Push。typed候选生成按每页批量检查（最多50个键），来源读取和最终reserve再次检查；事实不一致/数据库失败不会当作允许发送。同通知改期成新eventKey仍可发送。持久回填调用、旧部署/外部发送在途清点仍未完成，不能单凭该防护开启迁移。
5. **调度与运维**：独立 queue wake 仅登记工作；本批消费者在 canonical maintenance pass 的尾部。heartbeat 关闭或 pass 时间用完会延后消费；尚需负载下公平性、最大通知延迟、failed/积压告警验收。不能声称已经实现准时通知 SLA。

## 后续有授权时的迁移检查顺序

以下是发布门，不是本轮已执行动作：

1. 确认精确部署基线、Neon workspace / branch、所有旧部署与本地 worker；保持 `ORBIT_CANONICAL_INBOX_PROJECTION` 未设置或 `0`，typed 白名单不扩张。
2. 单独审查并安装 `features/notifications/storage/inbox-projection-work.ts` 导出的 additive schema：现在包含工作表和周期窗口进度表，共两个主键及三个partial indexes，检查状态/lease/进度约束。之前已装工作表的环境仍需安装新增窗口表；`CREATE IF NOT EXISTS` **不是**现有同名表结构一致的证明，发现同名异构表须停止，不能直接开开关。应用请求和 worker 不自动执行 DDL。
3. 先完成上述语义、writer、历史投递抑制和持久回填实现及本地对账，再决定灰度。开启 flag 会让 canonical 投递依赖工作表存在；开关前需验证建表成功及消费者持续运行。
4. 灰度只对明确环境启用 `ORBIT_CANONICAL_INBOX_PROJECTION=1` 并部署；混合旧/新部署仍可能遗漏工作项，不能在此期间停止旧读路径。校验 projectionClaimed / Completed / Skipped / Failed / Deferred 和 windowExamined / Extended / Skipped / Failed / Deferred 计数、最老pending/到期窗口、过期lease、failed安全错误码及Neon实际增量；汇总failed包含窗口和投影失败，不要记录通知正文。
5. 小批回填不发送历史 Push；逐 actor 对照通知集合、未读、read/dismiss/snooze 和撤权。已知 scheduled/failed/周期日程差异必须归零或由单独明确产品决定处理，不能拿总条数相同代替逐项对账。
6. 只有对应来源前后台生产者均等价时才删除它的 GET/后台全量枚举；其他来源保持显式未迁移状态。

## 显式 canonical plan 回填入口（本地已验证，未执行生产）

`features/notifications/canonical-inbox-backfill.ts`提供`runCanonicalInboxBackfillPass`。它不由GET或scheduler自动调用；必须给出精确workspace/actor/batchId/cutoff，确认新旧writer已接齐后显式`writersReady:true`。该值是操作方前置确认，不会自动证明旧部署已停止。每次默认10条、最大25条，默认5秒数据库操作预算、最大10秒；连接取得仍受连接池超时。只扫描cutoff之前创建的本人plan，按ID而不是MAX(serial)/updatedAt推进，同batch不同cutoff拒绝恢复。

进度保存在既有orbit_records的`notificationProjectionBackfill`集合，绑定actor/batch；每项事务采用policy→inbox→canonical actor→source row→work顺序，锁定并重读权威plan，再登记当前fingerprint及availableAt，最后推进checkpoint。取消/消失来源跳过；归属矛盾或损坏plan/进度报错不推进。可序列化冲突从新事务重试最多2次；已提交前项不丢，失败项重跑。未来plan只排未来工作，不抑制Push；未展示的cutoff前事件在同事务先登记历史抑制。已经展示的同event不改原投递状态。`done`只代表plan工作登记完成，**不是所有通知物化/权限/Push对账已完成**。

先安装独立additive索引`orbit_records_reminder_actor_id_idx`（workspace、user、record_id COLLATE C，仅reminderPlans）；已在本地真实EXPLAIN验证。不要为此盲跑全部旧迁移。完成checkpoint再次调用不再扫描plan。调用方须按批准的云操作/字节预算决定是否继续下一批，不能为了追求done而无预算循环。本轮没有生产CLI调用、回填、开flag或真实Push。

仍需：历史series窗口进度的回填、所有旧writer/旧部署清点、逐项集合与动作对账、计划登记后的实际消费/积压验收、其他通知来源；上述缺项仍阻止删除GET/后台refresh。新入口不能代替这些发布门。

## 暂停与恢复

flag 关闭并重新部署相关消费者/生产者后不再领取或登记本批工作，工作数据保留，恢复后可重领过期 lease；不会删除已有 typed 通知，也不会停止 canonical reminder 本身或旧 refresh。已开始的 pass 可以完成手里的数据库事务，这不是强制中断。必须清点旧部署/独立 scheduler 并实际确认不再 claim，不能仅凭环境变量页面判定已停。没有新增自我续排的队列链。

failed 是可调查记录，不是成功。修复来源并产生不同指纹可重新登记；同 revision 的人工 retry 尚未提供操作入口，禁止无核对批量重置 attempts。

## 本地复现

只接受 localhost / 127.0.0.1、无 URL 参数的测试库；测试自行创建随机 schema 并仅清理自己的 schema。不得把下面的变量替换成云端地址。

```sh
env -i PATH="$PATH" ORBIT_LIFECYCLE_TEST_DATABASE_URL=postgresql://li@localhost/orbit_cutover_test_20260917 node --import tsx --test tests/services/inbox-projection-work-postgres.test.ts tests/services/canonical-inbox-projection-postgres.test.ts tests/services/canonical-inbox-projection-cost-postgres.test.ts tests/services/typed-message-materialize-cost-postgres.test.ts tests/services/canonical-reminder-wake-postgres.test.ts
env -i PATH="$PATH" ORBIT_LIFECYCLE_TEST_DATABASE_URL=postgresql://li@localhost/orbit_cutover_test_20260917 node --import tsx --test --test-concurrency=1 tests/services/canonical-inbox-plan-changes-postgres.test.ts tests/services/inbox-projection-work-postgres.test.ts
env -i PATH="$PATH" ORBIT_LIFECYCLE_TEST_DATABASE_URL=postgresql://li@localhost/orbit_cutover_test_20260917 node --import tsx --test --test-concurrency=1 tests/services/inbox-snooze-projection-postgres.test.ts tests/services/inbox-record-postgres.test.ts
env -i PATH="$PATH" ORBIT_LIFECYCLE_TEST_DATABASE_URL=postgresql://li@localhost/orbit_neon_audit_20260925 node --import tsx scripts/diagnostics/check-inbox-source-batches.ts
```

数据库返回 JSON 字节只用于本地相对基准，不包括 PostgreSQL 协议、连接和其他查询，不是 Neon 账单计量。
