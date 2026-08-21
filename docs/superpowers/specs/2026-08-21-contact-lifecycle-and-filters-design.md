# Orbit 联系人关系阶段与筛选统一设计

## 状态

已由用户于 2026-08-21 确认产品方向。本规格覆盖 Web、iOS、共享契约、持久化和既有数据迁移，不改变 Orbit 现有视觉语言。

## 目标

统一联系人列表、详情、关系管线和 Today 中的关系阶段与跟进任务，使同一账号在 Web 和 iOS 看到一致、可持久化、可解释的数据；同时压缩联系人列表筛选区域，删除无效筛选项，并把“来源”改成用户能直接理解的“认识方式”。

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

`ConnectionDTO.stage` 是登录账号与联系人之间关系阶段的唯一事实来源。`ContactDTO` 表示人物资料；在多账号环境中，同一个联系人对不同账号可以处于不同阶段，因此联系人全局记录不能拥有最终关系阶段。

现有 `ContactDTO.stage` 暂时保留为兼容字段，但所有面向客户端的 Contacts 读模型必须从当前 actor 的 connection 投影该字段。完成迁移后，业务代码不得直接依据联系人记录中的旧 stage 做关系判断。

### 四个用户可见关系阶段

| 代码 | 中文名称 | 进入条件 | 持续条件 |
| --- | --- | --- | --- |
| `needs_follow_up` | 待跟进 | 已明确下一步，并设置执行日期 | 存在一条关联 connection 的未完成、有 `dueAt` 的任务 |
| `active` | 推进中 | 存在明确的合作、引荐、邀约或关系目标 | 目标仍在推进；任务可有可无 |
| `nurture` | 长期维护 | 当前没有推进目标，但已安排下一次联系 | 存在一条关联 connection 的未完成、有 `dueAt` 的维护任务 |
| `archived` | 已归档 | 当前不再主动维护 | 不要求任务或日期 |

`captured` 和 `reviewing` 是资料进入系统后的整理流程状态，不是用户关系阶段。它们进入“待整理”队列，在确认联系人时必须选择四个关系阶段之一。“待整理”是工作队列，不是第五个关系阶段，也不进入四阶段统计。

### 任务状态与关系阶段分离

任务日期只决定任务的时间状态：未来、今天、逾期、已完成或已取消。日期到期或逾期不得自动修改关系阶段。

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

`ContactDTO.nextAction` 不再是独立事实。Contacts 读模型从当前 connection 最早到期的未完成任务投影下一步；没有真实任务时不得用建议文案伪装为已安排事项。

## 命令与读取边界

### 阶段变更命令

保留 `PATCH /api/connections/[id]/stage` 路由，扩展为真正的 actor-scoped 持久化命令。请求只接受：

- `relationshipStage`；
- `expectedUpdatedAt`，值必须等于服务端当前 connection 的 `updatedAt`；
- 进入 `needs_follow_up`/`nurture` 时必填的 `nextTask`，包含 `title`、`dueAt`；
- 进入 `active` 时可选的关系目标说明；
- 进入 `archived` 时可选的归档原因；
- HTTP `Idempotency-Key` 请求头。

服务端从认证会话获取 actor，不接受客户端传入 account id。服务端确认 connection 属于 actor 后，在一个事务中更新 connection、创建或调整任务，并写入审计记录。成功响应必须报告真实数据库写入，禁止继续返回 preview 成功。

### 任务完成命令

新增 `POST /api/tasks/[id]/complete`。请求使用 HTTP `Idempotency-Key` 请求头，body 包含任务的 `expectedUpdatedAt` 和收尾结果。对于 `needs_follow_up`/`nurture`，不允许只把最后一条任务改成 completed 而留下没有日期的关系阶段。

### 联系人读取模型

Contacts 列表和详情在一次 focused read 中批量读取：

- 当前 actor 的 contacts；
- 对应 connections；
- 对应未完成 tasks；
- 当前需要的 evidence。

不得为每张联系人卡片单独查询任务。列表响应在兼容期保留 `status`，但它是 `connection.stage` 的投影；新增可选 `nextFollowup`，包含任务 id、标题、`dueAt` 和计算后的时间状态。

### 兼容策略

- `status` 字段保留至少一个客户端迁移周期，值改为 connection stage 投影。
- 新客户端优先读取明确命名的 `relationshipStage` 和 `nextFollowup`。
- `contact_detail_states.status` 停止写入；读取仅用于迁移期修复旧数据。
- `ContactDTO.stage` 保留存储兼容，但不再是关系阶段权威来源。
- iOS 继续通过 `shared/contract` 同步脚本消费契约，不直接 import Web 仓库源码。

## 筛选设计

### 统一术语

- 删除“要找什么”。文本搜索继续由搜索框承担。
- “来源”统一改为“认识方式”。
- 保留“行业”“认识方式”“价值”三个高级筛选。
- 阶段名称统一为“待跟进”“推进中”“长期维护”“已归档”。
- 不使用“待联系”“在推进”“培养中”“已合作”等并行名称。

“认识方式”的值仍复用当前 source code，界面映射为“活动认识”“朋友介绍”“名片录入”“通讯录导入”“邮件往来”“日程往来”“手动添加”等自然语言。代码和数据库字段继续使用 `source`，只改变用户可见文案。

### iOS

- 首屏只显示紧凑的阶段选择和三个高级筛选按钮。
- 点击“行业”“认识方式”“价值”打开底部选择面板。
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
- 选择“推进中”时允许填写简短关系目标；
- 选择“长期维护”时打开下一次联系标题和日期编辑面板；
- 选择“已归档”时允许填写原因。

“下一步”卡片只展示真实任务，并提供完成、改期和编辑。AI 建议必须以“建议”状态呈现，用户确认后才能成为真实任务。

### 关系管线

Web 和 iOS 都使用四个阶段，不再把 `archived` 表示为“已合作”。首期不增加拖拽；卡片通过明确菜单切换阶段，以便移动端、键盘操作和错误恢复共用同一命令。

Web 桌面使用四列或容器不足时水平滚动；iOS 延续当前分组/卡片结构。卡片显示最近任务日期和逾期状态。

### Today 与 Orbit AI

Today 只显示真实任务和日程，不因联系人属于某阶段就自动生成待办。阶段命令创建的 `TaskDTO` 必须按 `dueAt` 出现在 Today。

Orbit AI 可以提出阶段调整和任务建议，但必须生成可确认操作；未经确认不得更新 connection 或创建任务。AI 读取相同的 connection stage 和真实 task 投影，不能使用独立推断覆盖用户状态。

## 数据迁移

迁移按 actor 和 workspace 执行，并提供 dry-run、正式执行、结果 manifest 和人工复核报告。迁移必须幂等，不生成推测日期。

### 权威值优先级

1. actor 对应 connection 上合法的四阶段值；
2. 旧 `contact_detail_states.status` 中合法且时间较新的显式用户修改；
3. 旧 `ContactDTO.stage`；
4. 无法确定时进入待整理，不猜测“推进中”。

### 日期处理

- `needs_follow_up`/`nurture` 且已有对应未完成、带日期任务：保留。
- 有明确下一步文字但没有日期：保留文字作为修复提示，标记“待补日期”，不创建任务。
- 没有下一步或日期：进入待整理或迁移复核，不编造任务。
- `captured`/`reviewing` 不再自动映射为 `active`。

正式执行前必须输出每类迁移数量、冲突列表和无法迁移记录。迁移失败不得静默跳过。

## 并发、错误与审计

- 所有 mutation 需要幂等键和乐观并发版本；版本冲突返回 409，并要求客户端刷新。
- stage 与 task 的组合写入使用同一事务或同一仓储原子操作。
- 客户端写入失败时保留原显示状态，并显示可重试错误，不能先本地永久改色再静默失败。
- 审计记录 actor、connection、旧阶段、新阶段、任务 id、来源和时间，不记录不必要的私人正文。
- 数据库未配置时 fail closed，不回退 fixture 或 preview 成功。

## 性能

- Contacts 列表按当前 actor 的 connection ids 批量读取未完成任务，禁止 N+1。
- 为任务查询保证 `workspace/user + connectionId + status + dueAt` 的可用索引路径。
- stage/task mutation 成功后只失效 Contacts、Today、Dashboard 和相关 Orbit AI 读模型。
- 不引入长期响应缓存；跨页面一致性优先于陈旧缓存命中。

## 受影响范围

### 共享领域与契约

- `repos/orbits/shared/domain/contracts.ts`
- `repos/orbits/shared/domain/source-types.ts`
- `repos/orbits/shared/contract/contacts.ts`
- iOS 同步后的 contract 副本

不改变 `FollowupTaskContract` 的建议语义。

### 服务端

- Contacts focused graph/read model 与详情状态服务
- Connections stage/profile service、provider 和 API route
- Tasks 持久化 writer/provider 与任务完成命令
- Acquisition/名片确认后的“待整理”分流
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
- stage/task 原子写入、幂等和并发冲突集成测试。
- actor 隔离测试：同一 contact 在两个账号下可有不同阶段和任务。
- preview 服务不再报告成功写入的回归测试。
- 迁移 dry-run、幂等、冲突和不伪造日期测试。

### 契约与客户端

- shared contract 编译断言和 iOS contract sync 测试。
- Web/iOS 对四阶段和“认识方式”的相同映射测试。
- Contacts 列表不会按卡片发起 N+1 查询的服务测试。
- Today 只显示真实任务、逾期不自动改阶段、完成任务要求收尾结果的测试。

### 可视化验收

- Web 桌面和移动宽度检查筛选弹层、四阶段、长文本和空态。
- iPhone 模拟器检查底部筛选面板、联系人卡片、阶段编辑和 Today 同步。
- 使用现有 QA 截图忽略目录，不把验证截图提交到仓库。
- 视觉验收只比较本次组件变化，现有全局颜色、图标、模糊、圆角和排版必须保持。

## 交付顺序

1. 共享语义和失败测试：四阶段标签、真实任务投影、兼容字段。
2. 持久化命令：connection stage 与 TaskDTO 原子写入、完成任务收尾。
3. 数据迁移：dry-run、复核、正式执行和一致性检查。
4. Web：列表筛选、详情、四阶段管线和 Today。
5. iOS：契约同步、筛选、详情、管线和 Today。
6. Dashboard、Search、Orbit AI 的统一读取。
7. 跨端回归、性能检查和视觉验收。

每一阶段都先写失败测试，提交前运行 GitNexus change detection，只暂存本阶段文件，不包含当前工作区其他未提交改动。

## 非目标

- 不重做 Contacts 的整体视觉语言或导航结构。
- 不增加拖拽看板、第三方 UI 套件或新动画系统。
- 不接入新的日历、邮件、系统通知或 CRM provider。
- 不允许 AI 自动改变关系阶段或自动发送消息。
- 不修改 Events、Inbox 或 Orbit AI 首页结构。
- 不把“合作伙伴”作为关系生命周期阶段；合作关系应由关系类型或标签表达。

## 验收标准

1. 同一账号在 Web 与 iOS 看到相同的阶段、任务和日期，刷新与重新登录后不回退。
2. 不同账号对同一联系人可以拥有独立阶段和任务。
3. 新建的“待跟进”和“长期维护”在稳定状态下必有一条未完成且带日期的真实任务。
4. 逾期只改变任务时间状态，不自动改变关系阶段。
5. 完成最后一条约束任务时必须同时提交阶段收尾或下一任务。
6. `captured`/`reviewing` 不再被默认为“推进中”或“待跟进”。
7. Web 不再把 archived 显示成“已合作”，两端只使用四套统一中文名称。
8. 联系人筛选默认收起，删除“要找什么”，“来源”显示为“认识方式”。
9. Contacts 列表任务读取没有 N+1，数据库未配置或写入失败时明确失败。
10. 现有 Contacts 的全局颜色、图标、模糊、卡片和导航视觉保持不变。
