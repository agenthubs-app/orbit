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

按 `notes.search` → `tasks.query` → `schedule.query` 顺序逐个交付，禁止并行共享 registry 文件。

每个工具都要满足：

- server-injected actor identity；无 mock fallback 到其他用户。
- bounded query、bounded output、field-level mapper。
- provider 仅获得 synthesis 所需摘要；完整 artifact 仍按 UI contract 渲染。
- audit observation 不记录正文或秘密字段。
- prompt-injection fixtures 把笔记/任务/日程文本视为不可信数据。
- 跨账号与越权测试先 RED，再实现 GREEN。

## Track F — Cross-client verification

- Web：重编译并重启本地服务；真实账号执行 notes/tasks/schedule/AI 查询。
- App：重编译/刷新 Simulator；验证账号切换、本地快照 key、push 生命周期。
- Provider：至少一个已授权 calendar 账号做 read-only 对齐；没有授权时明确记录为未完成证据，不以 mock 代替。
- 全量：Web tests/typecheck/build、App tests/typecheck、contract/schema sync、route parity、GitNexus detect changes。

## Rollback

- migration 首次只 dry-run；apply 使用 receipt/idempotency key。
- 保留 legacy schedule reader 与旧 push endpoint 的只读/撤销兼容窗口。
- 新 AI tools 可由 capability registry 独立关闭；关闭不影响已有 5 个工具。
- 任一 parity/owner-scope 失败时停止对应 track，不阻塞独立的 registry 文档工作。
