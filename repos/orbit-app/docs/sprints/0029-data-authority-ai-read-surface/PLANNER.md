# Sprint 0029 Planner

## Track A — Authority registry

- RED：测试枚举现有主要 collection/table/API，却找不到对应 authority 条目。
- GREEN：新增可机器校验的 registry；CI 验证 canonical source 唯一、owner key 非空、projection 有来源。
- 交付：文档视图由 registry 生成，避免另写一份很快过期的表格。

## Track B — Push device consolidation

- 先做调用图与 API impact；当前有两套 device ID 和两组端点。
- RED：同一安装可产生两个 device ID；旧/新撤销路径不能互相清理。
- GREEN：SecureStore canonical ID；旧 AsyncStorage ID 一次性读取、迁移、撤销；所有生命周期调用同一 client。
- 验证：首次升级、重复升级、登出、拒绝权限、opt-out、token rotation、账号切换、网络失败重试。

## Track C — Schedule consolidation

- 先冻结 `personal_schedule_items` contract，建立 legacy `orbitScheduleItems` 数据分类。
- RED：同一 action 在 Today/个人日程/Event/Agent 查询结果不同。
- migration dry-run：按 actor/workspace 统计可迁移、冲突、孤儿、重复记录；不静默覆盖。
- GREEN：所有写入进入 canonical service；旧 reader 只读兼容投影；parity test 覆盖 meeting/event/personal block。
- 验证：幂等、版本冲突、删除/取消、跨账号隔离、时区与全天事件。

## Track D — AI visibility manifest

- 定义数据域、字段、purpose、actor scope、max items、redaction、retention、audit、confirmation。
- 将现有 5 个 read tool 登记进去，并把 provider 输入自动上下文（message/history/memory/outcomes）也登记为独立 source。
- 对未登记字段默认 deny；工具 schema 禁止 actorId/userId/profileId。

## Track E — New read tools

按 `notes.query` → `tasks.query` → `followups.query` → `schedule.query` 顺序逐个交付，禁止并行共享 registry 文件。

统一 query envelope：

- `operation`: `list | search | get`。`get` 必须提供本轮用户指令中出现或 actor-scoped 前序结果解析出的实体 ID。
- `query`、`status`、`from`、`to`、`contactId`、`eventId` 等只开放给拥有该字段的领域；未知字段直接拒绝。
- `cursor` 与 `limit` 有硬上限；结果明确返回 `truncated`/`nextCursor`，不静默宣称已读取全部数据。
- actorId/userId/accountId 不在模型输入 schema 中，由 route/runtime 注入。

工具职责：

- `notes.query`：`list/search` 返回 title、snippet、contact/event associations、createdAt/updatedAt；`get` 返回选中笔记的正文与截断状态。笔记正文始终视为不可信数据，不能成为系统指令或授权。
- `tasks.query`：读取 canonical `tasks` 中的已确认待办，返回 title、description、status、category、dueAt、contact/event/schedule associations 与 source；`taskSuggestions` 不得混入结果。
- `followups.query`：读取与 Relationship Connection 关联的已确认持久化待办及其可引用 evidence 摘要；不返回完整消息正文。`followups.reviewQueue` 继续生成“现在建议复核什么”，两者必须使用不同 artifact kind/source label。
- `schedule.query`：在日程权威源迁移完成后读取 canonical schedule item，返回时间、地点、会议方式、关联对象和详情；没有 meeting 详情时明确返回缺失字段。

Planner 选择规则：

| 用户意图 | 工具 | 禁止的替代 |
| --- | --- | --- |
| 找、总结、打开我的笔记 | `notes.query` | 从 chat history 猜测笔记内容 |
| 查看/筛选/打开待办 | `tasks.query` | 用 follow-up queue 代替完整任务列表 |
| 查看某人或某段关系的已确认跟进 | `followups.query` | 把推荐队列当作持久化事实 |
| 问现在最值得跟进谁 | `followups.reviewQueue` | 枚举所有跟进历史后自行伪造排序 |
| 查看/打开日程或 meeting | `schedule.query` | 从 Events 推荐或对话历史猜测详情 |

每个工具都要满足：

- server-injected actor identity；无 mock fallback 到其他用户。
- bounded query、bounded output、field-level mapper。
- provider 仅获得 synthesis 所需摘要；完整 artifact 仍按 UI contract 渲染。
- audit observation 不记录正文或秘密字段。
- prompt-injection fixtures 把笔记、任务、跟进证据和日程文本视为不可信数据。
- 跨账号与越权测试先 RED，再实现 GREEN。
- routing tests 覆盖中文、英文、日文意图，同一轮默认只选择满足请求所需的最小数据域。

## Track F — Cross-client verification

- Web：重编译并重启本地服务；真实账号执行 notes/tasks/followups/schedule/AI 查询。
- App：重编译/刷新 Simulator；验证账号切换、本地快照 key、push 生命周期。
- Provider：至少一个已授权 calendar 账号做 read-only 对齐；没有授权时明确记录为未完成证据，不以 mock 代替。
- 全量：Web tests/typecheck/build、App tests/typecheck、contract/schema sync、route parity、GitNexus detect changes。

## Rollback

- migration 首次只 dry-run；apply 使用 receipt/idempotency key。
- 保留 legacy schedule reader 与旧 push endpoint 的只读/撤销兼容窗口。
- 新 AI tools 可由 capability registry 独立关闭；关闭不影响已有 5 个工具。
- 任一 parity/owner-scope 失败时停止对应 track，不阻塞独立的 registry 文档工作。
