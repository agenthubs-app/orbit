# Sprint 0029 — 数据权威源与 AI 只读面收口

## Goal

让同一账户下的日程、推送设备与 AI 数据读取都遵循单一、可审计的权威源，消除已确认的双记录链，并让用户能够明确知道 Orbit AI 能看什么、不能看什么。

## Scope

1. 建立 machine-readable data authority registry：领域、canonical store、projection、owner key、API contract、AI policy、迁移状态。
2. 统一日程：以 `personal_schedule_items` 为 canonical，迁移/兼容 `orbitScheduleItems`，让 Today、个人日程、事件 action 与 Agent executor 读取同一事实。
3. 统一推送设备：以 SecureStore device ID 与 `/api/devices/push-tokens/:id` 为 canonical，迁移旧 AsyncStorage ID，旧单数端点只保留有截止时间的兼容层。
4. 建立 AI visibility manifest，并增加四个 actor-scoped 只读能力：`notes.query`、`tasks.query`、`followups.query`、`schedule.query`。
5. 为四个工具提供 `list/search` 与 `get` 操作，使 AI 能按用户指令先选择数据域，再查询列表或读取明确选中的详情。
6. 保留 `followups.reviewQueue` 作为“现在建议复核什么”的派生推荐工具；`followups.query` 专门读取已确认、持久化的关系跟进，不把推荐队列冒充完整跟进数据。
7. 在 AI 回复/审查 artifact 中展示本轮使用的数据域与 evidence，明确未读取的数据域。

## Non-goals

- 不允许 AI 读取认证 token、provider token、push token、原始名片图片、附件字节或运维审计原文。
- 不允许读取其他 actor 的资料或 workspace-wide 私人记录。
- 不把读取工具升级为自动写入；写操作仍走 Action Proposal 与确认。
- 不在同一迁移中重构 event operations 专用表。
- 不增加新的第三方 provider。

## Acceptance criteria

- 对日程和 push device，各只有一个 canonical identity/record/API path；旧路径有明确迁移、遥测与删除条件。
- Today、Schedule、Event action、Agent action 在同一 fixture/真实账号下返回相同日程事实。
- 登出、关闭推送和重新登录不会留下另一 device ID 对应的活跃注册。
- `notes.query` 仅返回 actor 自己的笔记：`list/search` 返回标题、有限摘要、关联对象和时间；`get` 只在 noteId 已由本轮用户指令或 actor-scoped 搜索结果解析时返回正文，并携带截断标记。
- `tasks.query` 读取完整的待办权威源，支持 `list/search/get`、ID、状态、类别、截止时间和关联对象；不把待办建议当作已确认待办。
- `followups.query` 读取已确认、持久化且与 Relationship Connection 关联的跟进，支持 `list/search/get`、联系人、关系、状态和截止时间；与 `followups.reviewQueue` 的推荐结果分别标识。
- `schedule.query` 读取 canonical 日程权威源，支持 `list/search/get`、ID、时间范围和关联对象；不把日程复制成可完成待办。
- 四个 query 工具均拒绝模型提供 actorId/userId/accountId；身份只由服务器注入。
- planner routing tests 证明“我的笔记/任务/跟进/日程”分别选择正确工具；含混请求最多澄清一次，不得同时大范围调用全部个人数据工具。
- AI visibility manifest 覆盖每个数据域：allowed fields、purpose、max items、redaction、retention、audit、confirmation policy。
- 加入 negative tests：跨账号、任意 userId 注入、秘密字段、超大输出、旧 device ID 残留、双 schedule source 分叉。
- Web 与 App contract/schema/route parity、全量单元测试、App typecheck、真实登录账号、iOS Simulator 和 Web 重编译重启均通过。

## Delivery order

1. Registry 与 characterization tests。
2. Push identity 收口（最小业务耦合）。
3. Schedule canonical migration 与 cross-surface parity。
4. AI visibility manifest。
5. 四个只读工具按 `notes.query` → `tasks.query` → `followups.query` → `schedule.query` 逐个 RED → GREEN；每个工具单独安全审查。
6. 真实账号、provider、Simulator、Web 全链验证。

## Approval gates

- 数据迁移 dry-run 与受影响行数需审阅后才可 apply。
- 每个新增 AI 工具的字段 allowlist 需审阅后才可接入 provider。
- 旧 endpoint/collection 删除需要兼容窗口证据，不在首次交付直接删除。
