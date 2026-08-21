# Orbit 联系人关系阶段与筛选统一设计

## 状态

已由用户于 2026-08-21 确认产品方向。本规格覆盖 Web、iOS、共享契约、持久化和既有数据迁移，不改变 Orbit 现有视觉语言。

## 目标

统一联系人列表、详情、关系管线和 Today 中的关系阶段与跟进任务，使同一账号在 Web 和 iOS 看到一致、可持久化、可解释的数据；同时压缩联系人列表筛选区域，删除无效筛选项，并把“来源”改成用户能直接理解的“添加方式”。

## 当前问题

### 状态不是同一份事实

- 联系人列表主要读取 `ContactDTO.stage`。
- 关系管线可能优先读取 `ConnectionDTO.stage`。
- 联系人详情状态更新写入独立的 `contact_detail_states`，没有更新 `contacts` 或 `connections`。
- `PATCH /api/connections/[id]/stage` 的 live 实现只生成 `live-store-stage-preview`，没有持久化数据库写入。
- Web 兼容 adapter 把 `archived` 映射为 `partnered`，并把 `nurture` 合并到 `in_progress`。
- `ContactDTO.nextAction`、关系画像的 `nextAction` 和 Followups 建议任务可能描述不同的下一步。

结果是页面之间可能显示不同阶段，修改后刷新会回退，并且“待联系”不保证存在实际日期。

### 筛选区域过长

iOS 联系人列表把“要找什么”“行业”“来源”“价值”等标签直接展开，列表首屏被筛选内容占用。Web 也需要使用相同的信息架构，避免两端形成不同筛选模型。

## 领域决策

### 关系阶段归属于 Connection

`ConnectionDTO.stage` 是登录账号与联系人之间关系阶段的唯一事实来源。`ContactDTO` 是当前 actor 明确确认并拥有的人物记录，不是跨账号共享的全局人物。两个账号认识同一个现实人物时，各自拥有独立 Contact 和 Connection，因此可以有不同阶段、私有备注与任务；注册身份对应关系由可审计的 ContactActorLink 表达，不改变 Contact ownership。

现有 `ContactDTO.stage` 暂时保留为 legacy 存储兼容字段，但所有面向客户端的 Contacts 读模型必须从当前 actor 的 connection 投影状态。客户端迁移完成后从 `ContactDTO` 删除该字段；业务代码不得再依据联系人记录中的旧 stage 做关系判断。

现有六值 `RelationshipStage` 混合了旧采集标记和关系阶段，实施时收敛为：

- 继续复用 Acquisition 已有的 `ContactDraftStatus = "pending_confirmation" | "confirmed"`；
- `ConnectionStage = "needs_follow_up" | "active" | "nurture" | "archived"`，供 Connection、Contacts 响应和跨客户端契约使用。

`captured/reviewing` 不成为新的草稿状态；它们只由 migration parser 作为 legacy Contact stage 接受，并进入复核。六值 `RelationshipStage` 不再作为新业务函数的参数或返回类型。新代码分别使用现有 `ContactDraftStatus` 和 `ConnectionStage`，避免再次把采集过程映射成关系状态。

### 四个用户可见关系阶段

| 代码 | 中文名称 | 进入条件 | 持续条件 |
| --- | --- | --- | --- |
| `needs_follow_up` | 待跟进 | 关系尚未进入持续推进，正在等待一个明确动作，并设置执行日期 | 存在一条关联 connection 的未完成、有 `dueAt` 的 follow-up task |
| `active` | 推进中 | 存在明确的合作、引荐、邀约或关系目标 | connection 保存非空的当前关系目标；任务可有可无 |
| `nurture` | 长期维护 | 当前没有推进目标，但已安排下一次联系 | 存在一条关联 connection 的未完成、有 `dueAt` 的维护任务 |
| `archived` | 已归档 | 当前不再主动维护 | 没有未完成的关系跟进或维护任务 |

`captured` 和 `reviewing` 是旧 Contact 数据中混入的采集标记，不属于新的 `ContactDTO`、`ConnectionDTO` 或 `ContactDraftStatus`。迁移器把它们送入 Acquisition 复核队列。用户确认 `pending_confirmation` 草稿时必须选择四个关系阶段之一；确认命令原子创建 Confirmed Contact、当前 actor 的 Connection，以及该阶段要求的任务。“待整理”不是第五个关系阶段，也不进入 Contacts 的四阶段统计。

### 任务状态与关系阶段分离

任务日期只决定任务的时间状态：未来、今天、逾期、已完成或已取消。日期到期或逾期不得自动修改关系阶段。

关系阶段与任务不是同一个维度。“推进中”的 connection 可以有待办，但仍归为“推进中”；“待跟进”只表示尚未进入持续推进、当前由一个离散动作驱动的关系。用户按阶段筛选关系，按 Today 查看所有阶段的到期任务。

当用户完成“待跟进”或“长期维护”任务时，客户端必须要求选择一个收尾结果：

1. 创建下一条有日期的任务，并保持当前阶段；
2. 转为“推进中”；
3. 转为“长期维护”并创建下一次联系任务；
4. 转为“已归档”。

任务完成和阶段/下一任务变更必须原子提交。任何一个写入失败时，原任务保持未完成，阶段不得部分更新。

### AI 建议与真实任务分离

`FollowupTaskContract` 继续表示 AI 或规则生成的建议任务，不代表已安排事项，也不修改其 `liveTaskPersistenceRequested: false` 语义。

用户确认后的真实跟进事项写入现有 `tasks` collection，并使用 `TaskDTO`：

- `status` 为 `open | scheduled | completed | dismissed`；
- 通过 `connectionId` 归属当前关系；
- 可同时保留 `contactId` 便于查询；
- “待跟进”和“长期维护”的有效任务必须有 `dueAt`；
- `source` 记录手动操作、AI 建议确认或其他真实来源。

`ConnectionDTO` 增加 `activeGoal?: string` 和整数 `version`。`TaskDTO` 增加 `relationshipPurpose?: "follow_up" | "maintenance"` 和整数 `version`。新记录从 version 1 开始，每次成功 mutation 加 1；现有记录迁移为 1。`updatedAt` 只用于显示和排序，不承担并发控制。

- `active` 必须有非空 `activeGoal`；
- `needs_follow_up` 必须有至少一条 `relationshipPurpose: "follow_up"` 的未完成带日期任务；
- `nurture` 必须有至少一条 `relationshipPurpose: "maintenance"` 的未完成带日期任务；
- `archived` 不得保留未完成的 follow-up/maintenance task。

`ContactDTO.nextAction` 不再是独立事实。Contacts 读模型从当前 connection 最早到期的未完成任务投影下一步；没有真实任务时不得用建议文案伪装为已安排事项。

## 命令与读取边界

### 阶段变更命令

保留 `PATCH /api/connections/[id]/stage` 路由，扩展为真正的 actor-scoped 持久化命令。请求只接受：

- `relationshipStage`；
- `expectedVersion`，值必须等于服务端当前 connection 的 `version`；
- 进入 `needs_follow_up`/`nurture` 时必填的 `nextTask`，包含 `title`、`dueAt`；
- 进入 `active` 时必填的 `activeGoal`；
- 进入 `archived` 时可选的归档原因，以及对现有未完成关系任务的显式处理选择；
- HTTP `Idempotency-Key` 请求头。

服务端从认证会话获取 actor，不接受客户端传入 account id。服务端确认 connection 属于 actor 后，在一个事务中更新 connection、创建或调整任务，并写入审计记录。成功响应必须报告真实数据库写入，禁止继续返回 preview 成功。

仓储必须同时验证 connection、它引用的 Contact 和所有被修改 Task 都属于同一 actor。ContactActorLink 的 `linkedActorId` 只表示联系人对应哪位注册用户，不能被当作 owner、授权或跨账号读取依据。

切换阶段时不得静默处理旧任务：

- 转为 `active` 时，已有任务默认保留，除非用户在同一确认面板中明确完成或取消；
- 转为 `nurture` 时，必须创建维护任务，并明确完成、取消或保留其他未完成任务；
- 转为 `archived` 时，确认面板列出未完成关系任务，用户确认后在同一事务中将其标记为 dismissed；
- 从 `archived` 恢复时必须重新选择 `needs_follow_up`、`active` 或 `nurture`，不能恢复到没有业务含义的默认状态。

### 任务完成命令

新增 `POST /api/tasks/[id]/complete`。请求使用 HTTP `Idempotency-Key` 请求头，body 包含 `expectedTaskVersion`、`expectedConnectionVersion` 和收尾结果。对于 `needs_follow_up`/`nurture`，不允许只把最后一条任务改成 completed 而留下没有日期的关系阶段。

### 持久化仓储

当前 `LiveRecordStoreLike` 只有单记录读写，不提供事务、行锁或 compare-and-swap，不能承担关系阶段命令。新增专用 `RelationshipLifecycleRepository`，memory 实现用于领域测试，Postgres 实现使用共享的 transaction-capable SQL runtime。

Postgres mutation 在同一事务中：

1. 按 workspace、actor 和 connection id 读取 connection 并 `FOR UPDATE`；
2. 校验 actor ownership 和 `expectedVersion`；
3. 读取并锁定需要完成、替换或创建的 task；
4. 更新 connection record，写入 task record 和阶段审计 record；
5. 以 `(workspaceId, actorId, idempotencyKey)` 写入命令回执和 request hash；
6. 提交后返回同一事务产生的快照。

同一个幂等键和相同 request hash 返回首次结果；同一个幂等键对应不同请求返回 409。Contacts、Connections 和 Followups 的查询仍可通过现有 live record providers 读取这些 canonical records，但任何组合 mutation 不得由多个普通 `upsertRecord` 调用拼接。

### 联系人读取模型

Contacts 列表和详情在一次 focused read 中批量读取：

- 当前 actor 的 contacts；
- 对应 connections；
- 对应未完成 tasks；
- 当前需要的 evidence。

不得为每张联系人卡片单独查询任务。读取服务先按 actor 获取 connections，再只读取这些 connection 引用且 ownership 相同的 Contacts 和 Tasks；引用到其他 actor 数据时返回受控一致性错误，不得序列化该记录。列表响应在兼容期保留 `status`，但它是 `connection.stage` 的投影；新增可选 `nextFollowup`，包含任务 id、标题、`dueAt` 和计算后的时间状态。

### 兼容策略

- `status` 字段保留至少一个客户端迁移周期，值改为 connection stage 投影。
- 新客户端优先读取明确命名的 `relationshipStage` 和 `nextFollowup`。
- 新客户端使用 `connectionVersion` 和 `taskVersion` 发起 mutation；迁移期缺少 version 的旧记录按 1 读取。
- `contact_detail_states.status` 停止写入；读取仅用于迁移期修复旧数据。
- `ContactDTO.stage` 仅在迁移窗口保留存储兼容；客户端完成迁移后删除。
- iOS 继续通过 `shared/contract` 同步脚本消费契约，不直接 import Web 仓库源码。

## 筛选设计

### 统一术语

- 删除“要找什么”。文本搜索继续由搜索框承担。
- “来源”统一改为“添加方式”。
- 保留“行业”“添加方式”“价值”三个高级筛选。
- 阶段名称统一为“待跟进”“推进中”“长期维护”“已归档”。
- 不使用“待联系”“在推进”“培养中”“已合作”等并行名称。

“添加方式”的值仍复用当前 source code，界面映射为“活动导入”“朋友介绍”“名片录入”“通讯录导入”“邮件发现”“日程发现”“手动添加”等自然语言。代码和数据库字段继续使用 `source`，只改变用户可见文案。它不声称记录双方实际如何认识；未来若需要“相识场景”，应新增独立、可验证的 relationship context 字段，不能从 source 推断。

### iOS

- 首屏只显示紧凑的阶段选择和三个高级筛选按钮。
- 点击“行业”“添加方式”“价值”后，在按钮下方内联展开标签，再次点击收起。
- 支持多选、单项清除、全部重置。
- 有选择时按钮显示数量，例如“行业 · 2”。
- 标签不在列表顶部常驻展开。
- 使用现有图标库、颜色 token、圆角、字体和导航结构。

### Web

- 使用与 iOS 相同的筛选字段、代码和值。
- 高级筛选使用锚定弹层，不新增独立筛选页面。
- 阶段选择适配桌面宽度；移动 Web 可以横向滚动，但不得压缩标签文字。
- 保留现有联系人页面视觉系统，不重做页面壳、颜色、图标、模糊效果或卡片风格。

## 联系人界面

### 列表卡片

卡片显示关系阶段。存在真实未完成任务时，显示任务标题和“今天”“明天”“8月25日”或“逾期 N 天”。`needs_follow_up`/`nurture` 的遗留非法数据显示“待补日期”修复入口，不生成虚假日期。

### 详情页

“关系阶段”变成可操作控件：

- 选择“待跟进”时打开标题和日期编辑面板；
- 选择“推进中”时必须填写简短关系目标；
- 选择“长期维护”时打开下一次联系标题和日期编辑面板；
- 选择“已归档”时允许填写原因。

阶段编辑使用同一个渐进式面板：先选择阶段，只展开该阶段要求的目标、任务和日期字段；默认不展示全部规则。系统可以建议选项，但不会根据日期、消息或 AI 分析自动改变阶段。

“下一步”卡片只展示真实任务，并提供完成、改期和编辑。AI 建议必须以“建议”状态呈现，用户确认后才能成为真实任务。

### 关系管线

Web 和 iOS 都使用四个阶段，不再把 `archived` 表示为“已合作”。首期不增加拖拽；卡片通过明确菜单切换阶段，以便移动端、键盘操作和错误恢复共用同一命令。

Web 桌面使用四列或容器不足时水平滚动；iOS 延续当前分组/卡片结构。卡片显示最近任务日期和逾期状态。

### Today 与 Orbit AI

Today 只显示真实任务和日程，不因联系人属于某阶段就自动生成待办。阶段命令创建的 `TaskDTO` 必须按 `dueAt` 出现在 Today。

Orbit AI 可以提出阶段调整和任务建议，但必须生成可确认操作；未经确认不得更新 connection 或创建任务。AI 读取相同的 connection stage 和真实 task 投影，不能使用独立推断覆盖用户状态。

## 数据迁移

迁移按 actor 和 workspace 执行，并提供 dry-run、正式执行、结果 manifest 和人工复核报告。迁移必须幂等，不生成推测日期。

切换到新读模型前，每个可见 Confirmed Contact 必须满足：

- Contact LiveRecord 的 `userId` 等于当前 actor；
- 恰好存在一条同 actor、引用该 Contact 的 Connection；
- Connection LiveRecord 的 `userId`、payload `accountId` 和当前 actor 一致；
- 关联 Task 的 `userId` 与 connection actor 一致；
- ContactActorLink 不参与上述 ownership 判断。

遗留记录只有在审核 manifest 明确列出时才允许修复空 `userId`。任何非空 owner 冲突、一个 actor/contact 对应多条 connection、跨 actor task 引用或跨 actor contact 引用都必须 fail closed 并进入人工复核。

### 权威值优先级

1. actor 对应 connection 上合法的四阶段值；
2. 旧 `contact_detail_states.status` 中合法且时间较新的显式用户修改；
3. 旧 `ContactDTO.stage` 中的四阶段值；
4. 旧 `ContactDTO.stage` 为 `captured/reviewing` 时转入 Acquisition 迁移复核；
5. 无法确定时进入迁移复核，不猜测“推进中”。

上述优先级只在所有候选记录已经证明属于同一 actor 后使用。无 owner 的 detail state 不因 contact id 相同就自动应用；它必须出现在审核 manifest 中，否则忽略并报告。

### 日期处理

- `needs_follow_up`/`nurture` 且已有对应未完成、带日期任务：保留。
- 有明确下一步文字但没有日期：保留文字作为修复提示，标记“待补日期”，不创建任务。
- 没有下一步或日期：进入迁移复核，不编造任务。
- `captured`/`reviewing` 不再自动映射为 `active`。

### 阶段约束修复

- 旧 `active` 没有关系目标时保留阶段并标记“待补目标”，不生成推测目标。
- 旧 `archived` 仍有关联未完成任务时进入冲突复核，不自动取消任务。
- 旧任务无法判断 follow-up/maintenance purpose 时保留为通用任务，不用它自动满足阶段约束。
- Confirmed Contact 没有 connection 或同 actor 下有多条 connection 时阻止切换新读模型，直到人工解决；迁移不自动选择或合并。

正式执行前必须输出每类迁移数量、冲突列表和无法迁移记录。迁移失败不得静默跳过。

## 并发、错误与审计

- 所有 mutation 需要幂等键和整数乐观并发版本；版本冲突返回 409，并要求客户端刷新。
- stage、task、审计和命令回执使用 `RelationshipLifecycleRepository` 的同一事务写入。
- 禁止通过 `updatedAt` 字符串比较代替版本，也禁止用多个 `LiveRecordStoreLike.upsertRecord` 模拟事务。
- 客户端写入失败时保留原显示状态，并显示可重试错误，不能先本地永久改色再静默失败。
- 审计记录 actor、connection、旧阶段、新阶段、任务 id、来源和时间，不记录不必要的私人正文。
- 数据库未配置时 fail closed，不回退 fixture 或 preview 成功。

## 性能

- migration cutover 后，Contact、Connection 和 Task 的 LiveRecord 都有非空 canonical `userId`；查询必须在 SQL 层使用 `workspaceId + collectionName + userId`，不得读取整个 workspace 后在内存中过滤 actor。
- Contacts 列表按当前 actor 批量读取 connections、被引用的 contacts 和未完成 tasks，禁止 N+1。
- `orbit_records` 增加 `(workspace_id, collection_name, user_id)` 索引；tasks 增加面向 `userId + payload.connectionId + payload.status + payload.dueAt` 的局部表达式索引。所有 `dueAt` 在写入前标准化为 UTC ISO 字符串，保证索引排序一致。
- mutation 成功后 Web 服务端返回新快照；Web 和 iOS 只重新读取 Contacts/Today/Dashboard 中受影响的数据，不引入跨进程缓存失效系统。
- 不引入长期响应缓存；跨页面一致性优先于陈旧缓存命中。

## 受影响范围

### 共享领域与契约

- `repos/orbits/shared/domain/contracts.ts`
- `repos/orbits/shared/domain/source-types.ts`
- `repos/orbits/shared/contract/contacts.ts`
- iOS 同步后的 contract 副本

不改变 `FollowupTaskContract` 的建议语义。

### 服务端

- 共享 transaction-capable SQL runtime 与 RelationshipLifecycleRepository
- Contacts focused graph/read model 与详情状态服务
- Connections stage/profile service、provider 和 API route
- Tasks 持久化 writer/provider 与任务完成命令
- Acquisition 的 Contact Draft“待整理”队列，以及确认时创建 Contact/Connection/Task 的命令
- Today、Dashboard、Search、Orbit AI 的关系阶段/任务投影
- 数据迁移脚本、manifest 和审计文档

### Web

- `/app/contacts`
- `/app/contacts/[id]`
- `/app/contacts/pipeline`
- Contacts dashboard、graph、intros 中使用阶段标签的部分
- `/app/today` 的真实任务刷新路径

### iOS

- 联系人列表筛选、卡片和空态
- 联系人详情关系阶段与任务编辑
- 关系管线分组和阶段操作
- Today 任务显示与完成流程
- API endpoint、契约映射和相关测试

## 测试策略

### 领域与服务

- 阶段转换矩阵和日期约束单元测试。
- stage/task/audit/receipt 原子写入、事务回滚、幂等 request hash 和版本冲突集成测试。
- actor 隔离测试：同一现实人物在两个账号下的独立 Contacts/Connections 可有不同阶段和任务，ContactActorLink 不授予跨账号读取。
- preview 服务不再报告成功写入的回归测试。
- 迁移 dry-run、幂等、冲突和不伪造日期测试。

### 契约与客户端

- shared contract 编译断言和 iOS contract sync 测试。
- Web/iOS 对四阶段和“添加方式”的相同映射测试。
- Contacts 列表不会按卡片发起 N+1 查询的服务测试。
- Today 只显示真实任务、逾期不自动改阶段、完成任务要求收尾结果的测试。

### 可视化验收

- Web 桌面和移动宽度检查筛选弹层、四阶段、长文本和空态。
- iPhone 模拟器检查内联筛选展开、联系人卡片、阶段编辑和 Today 同步。
- 使用现有 QA 截图忽略目录，不把验证截图提交到仓库。
- 视觉验收只比较本次组件变化，现有全局颜色、图标、模糊、圆角和排版必须保持。

## 交付顺序

本规格是一个架构总设计，实施拆成五个独立计划。每个计划都产生可验证结果并设置继续门，不允许把全部范围放进一个提交序列。

1. **领域与仓储基础**：拆分 Contact Draft/Contact/Connection 类型，增加 version、RelationshipLifecycleRepository、事务回执和失败测试；所有页面继续旧读路径。
2. **迁移与读模型切换**：运行 dry-run 和人工复核，修复 ownership/version，增加索引；一致性 gate 全部通过后，Contacts API/Web 服务端切换到 actor-scoped connection/task 投影，旧客户端继续读取兼容字段。
3. **Web 操作闭环**：更新筛选文案与弹层、四阶段列表/管线、详情阶段编辑、任务完成和 Today；不改变页面整体视觉。
4. **iOS 操作闭环**：同步契约，在现有内联筛选实现上修正文案，更新详情、管线和 Today；不重做联系人首屏。
5. **下游与收口**：Dashboard、Search、Orbit AI 改读 canonical projection，完成跨端、性能、actor 隔离和视觉回归。

每个计划结束都必须满足其 gate；后续计划不得通过兼容 fallback 掩盖前一阶段的 ownership、事务或迁移失败。Web/iOS 可分开发布，但 shared response 在旧 iOS 迁移周期内保持兼容。

每一阶段都先写失败测试，提交前运行 GitNexus change detection，只暂存本阶段文件，不包含当前工作区其他未提交改动。

## 非目标

- 不重做 Contacts 的整体视觉语言或导航结构。
- 不增加拖拽看板、第三方 UI 套件或新动画系统。
- 不接入新的日历、邮件、系统通知或 CRM provider。
- 不允许 AI 自动改变关系阶段或自动发送消息。
- 不修改 Events、Inbox 或 Orbit AI 首页结构。
- 不把“合作伙伴”作为关系生命周期阶段；合作关系应由关系类型或标签表达。

## 五轮复审记录

1. **领域边界**：删除 Contact 拥有关系阶段的设计；Contact Draft 留在 Acquisition，Connection 成为四阶段唯一来源，并补充领域词汇。
2. **存储可行性**：确认 `LiveRecordStoreLike` 不支持组合事务；新增专用 RelationshipLifecycleRepository、整数 version、命令回执和 request hash。
3. **用户流程**：明确“待跟进”与“推进中”互斥语义；active 必须有目标，归档必须显式处理未完成关系任务。
4. **多账号迁移**：纠正 Contact 为 actor-owned 记录；Contact/Connection/Task 必须同 owner，ContactActorLink 不授予访问权限。
5. **交付与 UI**：将“认识方式”修正为符合数据事实的“添加方式”，iOS 保留内联展开，并把实施拆成五个带 gate 的计划。

## 验收标准

1. 同一账号在 Web 与 iOS 看到相同的阶段、任务和日期，刷新与重新登录后不回退。
2. 不同账号对同一现实人物拥有各自的 Contact/Connection、阶段和任务；ContactActorLink 不泄露对方私有数据。
3. 新建的“待跟进”和“长期维护”在稳定状态下必有一条未完成且带日期的真实任务。
4. 新建的“推进中”必有非空关系目标；任务有无不改变其阶段。
5. 逾期只改变任务时间状态，不自动改变关系阶段。
6. 完成最后一条约束任务时必须同时提交阶段收尾或下一任务。
7. 归档 connection 时所有未完成关系任务都经过显式确认并在同一事务中 dismissed。
8. `captured`/`reviewing` 不再被默认为“推进中”或“待跟进”。
9. Web 不再把 archived 显示成“已合作”，两端只使用四套统一中文名称。
10. 联系人筛选默认收起，删除“要找什么”，“来源”显示为“添加方式”。
11. Contacts 列表任务读取没有 N+1，数据库未配置或写入失败时明确失败。
12. 现有 Contacts 的全局颜色、图标、模糊、卡片和导航视觉保持不变。
