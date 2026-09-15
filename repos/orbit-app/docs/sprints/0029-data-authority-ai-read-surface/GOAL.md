# Sprint 0029 — 数据权威源与 AI 只读面收口

## Goal

让同一账户下的日程、推送设备与 AI 数据读取都遵循单一、可审计的权威源，消除已确认的双记录链，并让用户能够明确知道 Orbit AI 能看什么、不能看什么。

## Scope

1. 建立 machine-readable data authority registry：领域、canonical store、projection、owner key、API contract、AI policy、迁移状态。
2. 统一日程：以 `personal_schedule_items` 为 canonical，迁移/兼容 `orbitScheduleItems`，让 Today、个人日程、事件 action 与 Agent executor 读取同一事实。
3. 统一推送设备：以 SecureStore device ID 与 `/api/devices/push-tokens/:id` 为 canonical，迁移旧 AsyncStorage ID，旧单数端点只保留有截止时间的兼容层。
4. 建立 AI visibility manifest，并增加三个 actor-scoped 只读能力：`notes.search`、`tasks.query`、`schedule.query`。
5. 在 AI 回复/审查 artifact 中展示本轮使用的数据域与 evidence，明确未读取的数据域。

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
- `notes.search` 仅返回 actor 自己的笔记，默认不返回完整正文；明确请求时仍受长度、条数、字段 allowlist 与敏感内容规则约束。
- `tasks.query` 与 `schedule.query` 仅返回 actor scope，支持 ID/状态/时间范围，并拒绝模型提供 actorId。
- AI visibility manifest 覆盖每个数据域：allowed fields、purpose、max items、redaction、retention、audit、confirmation policy。
- 加入 negative tests：跨账号、任意 userId 注入、秘密字段、超大输出、旧 device ID 残留、双 schedule source 分叉。
- Web 与 App contract/schema/route parity、全量单元测试、App typecheck、真实登录账号、iOS Simulator 和 Web 重编译重启均通过。

## Delivery order

1. Registry 与 characterization tests。
2. Push identity 收口（最小业务耦合）。
3. Schedule canonical migration 与 cross-surface parity。
4. AI visibility manifest。
5. 三个只读工具逐个 RED → GREEN；每个工具单独安全审查。
6. 真实账号、provider、Simulator、Web 全链验证。

## Approval gates

- 数据迁移 dry-run 与受影响行数需审阅后才可 apply。
- 每个新增 AI 工具的字段 allowlist 需审阅后才可接入 provider。
- 旧 endpoint/collection 删除需要兼容窗口证据，不在首次交付直接删除。
