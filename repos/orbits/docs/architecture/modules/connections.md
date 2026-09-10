# Connections 模块

## 模块定位

Connections 负责人与人、人与事件、人与证据之间的关系记录，并维护关系阶段和画像。

## 期望行为

模块应提供连接列表、连接详情、证据追加、关系阶段更新和关系画像查询。所有输出都应带有可追溯来源。

## Mock 行为

Mock 服务基于 fixture 返回连接、证据、阶段和画像，并模拟添加证据与受控错误，不进行真实图数据库、CRM、消息或外部写入。

## 热拔插边界

调用方必须通过 `features/connections/service-factory.ts` 获取 connection evidence 和 relationship stage/profile 服务。未来图存储或 CRM 适配器只替换 factory 后方实现。

## 四阶段生命周期基础

共享契约新增 `ConnectionStageCode`，domain 提供对应的 `ConnectionStage`、常量和校验函数，只接受 `needs_follow_up | active | nurture | archived`（待联系、推进中、维系中、已归档）。编译期断言检查契约与 domain 枚举一致，App 通过 `sync:contract` 同步类型。

旧 `RelationshipStage` 六值类型及校验器保持不变，供现有读取路径和后续迁移解析使用。本阶段建立新类型、任务约束和原子持久化基础，不切换 Web/App 页面、Contacts 读取或阶段预览接口；这些路径仍须等待迁移与后续接入。

`features/connections/lifecycle/transition.ts` 提供纯转换模型：待联系/维系中创建带日期的对应任务，推进中要求非空目标，归档要求明确取消全部未完成关系任务。除归档外保留现有任务；客户端切换时仍须让用户确认任务处理选择。完成任务必须同时选择下一任务、推进、维系或归档，返回单个变更计划，连接和被修改任务版本各加一次。日期标准化为 UTC，不因逾期自动换阶段。

转换会校验账号与任务所属关系，不修改输入，也不产生数据库或外部副作用。审计包含账号、阶段、任务 ID、来源及时间，不保存目标、任务标题或归档原因正文；审计 ID 使用账号、连接及幂等键的无歧义组合，避免不同账号同键冲突。持久化仓储仍须验证 Contact 所有权，并原子提交整个计划。

内存仓储已提供账号隔离、Contact 所有权检查、克隆读取和原子状态替换。连接、任务、审计及回执一起提交；失败不消费幂等键。同键同哈希重放首次快照，不同哈希冲突。仓储复制请求字段并拒绝回调中的重入写入，避免校验后请求被改动或同一版本提交两次。这一实现用于领域验证，不代表现有阶段接口已支持真实持久化。

共享 `transactional-postgres.ts` 提供单连接 `SERIALIZABLE` 事务，异常时回滚，回滚失败时丢弃连接并保留原始错误。配置按数据库地址、workspace 与连接池上限缓存，默认池大小为 2；缺少配置返回 `null`。生命周期 schema 定义账号隔离的命令回执与关系任务查询索引，注册顺序为基础 records、生命周期、Event Operations。添加迁移代码不等于执行迁移；正式数据库尚未应用这些变更。

PostgreSQL 生命周期仓储在同一事务内读取回执、锁定账号/workspace 下的连接及关联 Contact/任务、检查版本，再写入连接、关系任务、审计及回执。同键重放首次快照；序列化冲突、死锁及回执键竞争最多尝试 3 次完整事务，其他错误直接抛出。任务 ID 冲突不会覆盖其他记录，任何一步失败都会回滚。

仓储在校验前复制回调返回的变更计划，避免 SQL 等待期间被调用方改动。回执重放会校验完整连接与任务快照的归属、类型、版本和日期，不因回执键匹配就信任其 JSON；损坏回执直接报错，不改为返回当前状态。任务数组不承诺业务排序，调用方须按展示需要排序。

旧记录仅在缺少 `version` 时按 1 读取，成功修改后显式写入新版本；异常版本或未迁移阶段会报错。只更新生命周期字段，保留画像、任务来源和证据；没有 `relationshipPurpose` 的普通任务不作为关系义务处理。本地隔离 PostgreSQL 已验证冷读取、幂等重放、并发冲突、账号隔离及注入审计失败后的回滚，未访问正式业务数据库。

`createRelationshipLifecycleService(repository, now)` 提供 `changeStage` 和 `completeTask`。服务先校验账号、连接、幂等键和版本，复制请求，再对排好对象键序的命令 JSON 计算 SHA-256；哈希包含命令种类、不包含幂等键。事务重试使用同一请求与时间。结果返回提交快照和 `replayed`，仓储错误原样抛出；不会发送消息、调用 AI 或写入外部系统，也不把内存验证表述为数据库写入。

正式装配入口为 `createConfiguredRelationshipLifecycleService()`：只创建配置对应的 PostgreSQL 实现，缺少数据库配置时返回 `null`，不会回退到 fixture 或阶段预览。基础阶段已具备契约、转换、事务仓储及命令服务，但现有 Web/iOS 路由与页面仍未切换；后续必须先完成旧数据迁移检查、读取投影和接口兼容，再验证两端实际读写。

`assessRelationshipLifecycleMigration` 是不执行 I/O 的迁移预检器，接收明确提供的账号/workspace 记录快照，检查 ownership、唯一连接、整数版本及阶段任务约束。报告只含范围、计数、记录 ID 和问题代码，不包含私人目标、任务标题或笔记；输入不会被改动，报告不受记录顺序影响。

任何待修复项都会使 `readyForCutover` 为 `false`。缺少 owner/version、缺少目标/日期、采集阶段、重复连接与跨账号引用均须显式处理；预检不会代替人工迁移、用旧 Contact 状态覆盖 Connection，或取消任务。`true` 仅说明这份输入快照通过这些预检，不证明数据完整、仍然新鲜，也不授权迁移或切换现有路由。

离线预检命令只读取操作者提供的 LiveRecord JSON 数组，不加载 `.env` 或连接数据库：

```sh
node --import tsx scripts/check-relationship-lifecycle.ts --input records.json --actor actor:example --workspace workspace:example
```

结果以单个 JSON 报告输出到 stdout：退出码 `0` 为快照预检通过，`2` 为需要复核/修复，`1` 为参数、文件或输入格式错误。参数必须各出现一次，不支持 `--apply`；错误消息不会回显输入正文。此命令不执行修复、不产生审核批准、不启用路由切换，正式迁移仍须审核 manifest、校验快照新鲜度并验证事务回滚。

### 迁移工具：确定性计划（2026-09-09）

`planRelationshipLifecycleMigration` 只对调用方明确提供的 LiveRecord 快照和严格 manifest 计算候选修复，不读取数据库。允许的修复仅为空 owner 的逐条证据确认、缺失版本初始化为 1、按已批准优先级确定 Connection 阶段、以及有效任务日期的 UTC 规范化。非法版本、非空 owner 冲突、重复关系、缺少目标/日期和采集阶段复核仍阻断执行；不会创建业务内容、取消任务或使用 ContactActorLink 授权。

计划用 SHA-256 绑定 workspace 内四类来源记录的完整内容（包括已删除记录）、修复清单和计划结果；记录顺序和 JSON 属性顺序不改变哈希。输出只含修复元数据、记录标识和问题代码，不包含姓名、目标、任务标题或笔记。`applyLifecycleMigrationChanges` 是克隆快照的纯函数，严格验证前后哈希及允许字段，不是数据库执行或审批入口。

计划器已覆盖确定性、阶段权威优先级、所有权、任务数据、输入不变性、非 JSON 对象拒绝和敏感内容不泄漏，并通过独立审查。本版本没有真实数据审核、正式迁移或 Web/App 切换，App 不需要同步契约。

`parseLifecycleMigrationReview` 和 `assertLifecycleMigrationReview` 严格校验外部提供的审核回执：明确的 `approved: true`、actor/workspace、负责审核的 operator 身份，以及来源、manifest、计划三个哈希必须一致。审核时间规范化为 UTC，不能晚于执行时钟；被修改或仍有问题的计划不能执行。不额外猜测有效期，来源新鲜度必须由后续事务内重读和重新计划证明。

回执格式只能绑定审核过的版本，不能证明某个人真的读过它。操作者必须取得真实审核并如实提供 `reviewedBy/reviewedAt`，工具不会生成批准、签名或替代人工确认；`reviewedBy` 必须等于本次明确提供的 operator。解析返回独立副本，错误不回显原始回执或私人内容。已测试缺少批准、未知字段、错身份、错哈希、未来/无效时间、计划篡改和非 JSON 输入。

### 迁移工具：显式 PostgreSQL 执行

`createPostgresLifecycleMigrationRepository({ client, workspaceId })` 只接受明确注入的事务 runtime，提供 `dryRun(manifest)` 与 `apply({ manifest, review, actorId, operatorId, runId, now })`；不会读取环境配置、运行 schema 或注册路由。`runLifecycleMigrationSchema` 必须由维护操作者单独调用，它只建立本迁移的独立回执表，不更改现有业务命令回执。

维护快照在一个事务中读取该 workspace 的四类完整记录，包括已删除和其他 owner 的记录，以查出归属冲突。这个入口不面向用户 API。SQL 将记录时间直接格式化为 UTC 并保留 PostgreSQL 微秒，避免经过 JavaScript Date 后丢失哈希精度。

执行在同一 SERIALIZABLE 事务里读取回执、锁定来源、重新计算计划并校验外部审核，再按 workspace/collection/record/原 owner 精确更新最小 payload 补丁。每个目标必须只更新一行且匹配预期前后哈希；记录原有创建/更新时间、画像和来源不被重写。变更、无私人正文的字段级审计、校验哈希保护的回执一起提交，最后重新读取来源，验证包括 trigger 影响在内的实际结果及阶段约束。任何失败全部回滚。

相同 run ID 必须重放原命令（包括原来的显式 `now`）；不同身份、审核或命令冲突。重放校验存储回执结构和身份，并返回首次结果，不代表当前数据仍可切换。只有序列化冲突、死锁和本回执主键竞争可重试，最多 3 次完整事务。隔离本地 PostgreSQL 测试覆盖实际提交、两类写入失败回滚、并发与重放、微秒来源漂移、SQL 等待期间输入变更、损坏回执和 trigger 篡改。没有访问正式数据库、执行真实迁移或启用 Web/App 新路径。

### 尚未接入路由的 canonical 读取

`projectCanonicalContactLifecycles` 只从当前 actor 的 Connection 投影 `relationshipStage/status` 和版本，从同一关系最早到期的真实未完成 Task 投影 `nextFollowup`。日期相同按任务 ID 稳定排序；普通带日期任务可以显示，但不能代替 follow-up/maintenance 义务。Contact 的 legacy stage、nextAction 和详情状态都不覆盖 Connection，也不会把建议文字变成已安排任务。

调用者必须提供有效 `now` 和时区：早于当前时刻即为 overdue，未到期且处于同一当地日历日为 today，其余为 future。日期到期不改变关系阶段。缺少/非法版本、目标或日期、重复记录、所有权与引用冲突均返回受控一致性错误，不做默认修复或部分展示。

`readCanonicalContactLifecycles` 在同一事务内执行固定 4 次批量查询：先取 actor-owned Connections，再取其引用且同 owner 的 Contacts 和 Tasks，最后仅用布尔元数据检查孤立记录、归属声明冲突和其他 actor 的引用。私人内容查询始终包含 workspace/actor 限定；跨 actor 引用只报告一致性错误，不读取对方 payload。1 个和 50 个联系人使用相同查询次数，没有逐卡片查询。真实隔离 PostgreSQL 测试验证了查询范围、并发期间的一致快照以及读取不受调用方异步更改参数影响。

这些是维护工具和候选读取入口，不是已上线的端到端生命周期。读取器不运行 schema，不把历史迁移回执当作当前数据合格证明，也没有接入现有 factory/API 或同步客户端契约。实际切换仍需新鲜真实数据、逐项冲突处理、明确审核与受控迁移，然后另行完成 Web/App 接入和业务验证。

2026-09-09 验证边界：生命周期专项 168 项通过、无跳过，Web 类型检查和独立工具层审查通过；但扩大的 Web 全量测试为 2524 通过、18 失败、19 跳过，读取器的最后一笔提交暂缓。全量测试中的旧 `loadLocalEnv()` 路径还重新加载了现有数据库配置，因此“仅使用隔离数据库”的结论只适用于本生命周期专项，不能扩大到那轮全量测试。后续数据库只读核查与全量测试隔离问题尚未解决，详情见本模块的 `2026-09-09-relationship-lifecycle-migration-tools` 实施计划。
