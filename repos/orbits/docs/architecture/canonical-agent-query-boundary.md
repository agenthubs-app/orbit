# Agent 与个人日程的 canonical 账号边界

2026-09-16 修复 Production 合成账号暴露的身份混用问题。

- Auth.js `session.user.id` 是登录主体，不保证等于业务账号。Agent 请求上下文、服务端 ledger、iOrbit 首屏、个人活动页和个人日程页均先使用现有 `resolveAuthenticatedApiActorFromSession` 解析持久 membership，再将 `actor.id` 交给业务读取器或客户端。
- 无登录重定向/拒绝；已登录但无 membership 也拒绝，不回退 raw subject，不选取 workspace 默认账号。Mock/hybrid 的既有确定性运行路径不变。
- 个人日程客户端继续校验 `accountId/ownerUserId/sourceId` 和保存回执；不能通过删除归属检查消除报错。此前 Production 已成功写入的日程应直接回读，不重新创建。
- Agent 的 `query` 保留当前原始用户指令，以校验 get 的实体 ID 确实由用户提供。四类只读 `.query` 工具的 search 使用独立、有界的 `searchTerms`；planner 必须传实际标题/内容片段，而非整句指令。list/get 不接受该字段，身份字段始终禁止。
- HTTP 响应和 App 共享契约未改变；App 已使用 canonical actor，不需要新增本地数据源。旧 raw-subject 下的 Agent 历史记录不会自动迁移或扩大读取权限；若需要迁移，必须先核验对应 membership 和记录归属。

验证覆盖：登录主体与业务账号不同、无登录、无 membership、两账号 ledger/runtime 隔离、个人日程回读、原始指令与搜索片段分离、get ID 伪造拒绝。测试先复现失败，再验证修复；真实 Production 和原生 App 的完成状态由主计划单独记录，源码回归不替代部署验收。

GitNexus 绑定根仓库 `orbit`（`/Users/li/work/orbit`），索引 `5dbc83d` 不完整且落后。最初各入口 impact 进程 SIGSEGV；提交前 detect-changes 恢复输出，报告 78 条受影响执行流、CRITICAL 风险（all 范围还包含未提交的根规则文档）。源码调用复核显示 Agent context 被会话、动作、ledger、Today、活动 encounter 使用，按高风险身份边界验证，而非把空图结果当成安全。图输出不替代当前源码与业务回归。

提高 limit 重查后仍为 CRITICAL，但仅返回 16 条流程，指定身份函数的 impact 又返回 target not found / UNKNOWN。图结果不稳定，不能把较少的流程数当成风险下降或完整覆盖证明；保留未解决的图分析限制，以已核查的源码调用点与回归作当前证据。

修复后两组定向回归分别 92/92、75/75，通过 Web typecheck。第二组包含 Agent action/ledger、活动 encounter、会话可靠发送、模型 planner 输入与只读工具、self profile 和 live 边界；所有真实 provider 凭据和数据库环境在测试子进程中移除。

## Production 回显链路补充

发布 `6f844ea47` 后，正式 iOrbit 已显示 66 联系人/66 跟进；个人日程既有记录可以保存并收到成功回执。AI 查询的持久对话证据包含 `tasks query` / `itemCount: 1`，但用户只看到 planner 的“我来查询”：默认 loop=2 不调用 synthesis，而旧页面只渲染推荐卡，没有渲染 data_query 卡。这不是查询失败，也不能单凭工具命中就通过验收。

因此，当 synthesis 未执行或失败时，服务端直接把已通过 actor 校验的 data_query 结果格式化为有界回复，保留标题、原始状态/日期、空结果、分页和已读/未读领域；不增加模型调用或写入。这样 Web 与 App 的普通消息文本都能看到结果，历史保存也保留事实。三步 synthesis 的输入同时保留状态字段并标记为不可信源数据，查询文本不能成为指令。没有改变对外 DTO 或放宽权限。

新增回归先复现 3 项失败，修复后扩展组合 108/108、Web typecheck 通过，涵盖两步回显、三步失败回退、一步零读取、空结果/分页、异账号隔离和原有 Agent 分支。GitNexus runtime impact HIGH，摘要/回复/提示词 CRITICAL 且 partial；detect-changes 输出 low/0 flows 与 impact 矛盾，不能据此声称图分析完整或风险降低。源码复核限定为 live conversation 与 dev trace 共用的 data_query 分支。
