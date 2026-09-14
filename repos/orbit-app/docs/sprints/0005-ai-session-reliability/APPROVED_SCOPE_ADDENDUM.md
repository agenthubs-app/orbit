# Sprint 0005 — B3 跨端实施范围补充

2026-09-14，用户明确启动 B 线、要求持续完成 0005→0021→0006，并授予完成既定目标所需权限。本页按 [RULES 第0节](../RULES.md#0-最新授权与批准复用)登记 0005 为实现原 SC 必需的跨端文件；不改变 Planner 的目标、五项 SC、单 Generator 或费用上限。

## 必要文件

Web/API 位于 `repos/orbits`：

- `app/api/ai/conversations/route.ts`
- `app/api/ai/conversations/sessions/handler.ts`
- `app/api/ai/conversations/sessions/[id]/handler.ts`
- `features/orbit-ai/conversation-contract.ts`
- `features/orbit-ai/live-conversation-service.ts`
- `features/orbit-ai/service-factory.ts`
- `features/orbit-ai/storage/orbit-agent-chat-session-live-record-provider.ts`
- `features/orbit-ai/storage/orbit-agent-chat-session-provider-factory.ts`
- 新建 `shared/contract/ai-sessions.ts`、`shared/api-schema/ai-sessions.ts`
- 新建 `features/orbit-ai/reliable-send-service.ts`
- 新建 `features/orbit-ai/storage/orbit-agent-chat-request-store.ts`、`orbit-agent-chat-session-transactions.ts`
- 对应 0005 Web 定向测试；必要的 `features/orbit-ai/DESIGN.md` 会话段落

App 位于 `repos/orbit-app`：

- 原 Planner 白名单
- `src/api/ai-history-contract.ts`
- `src/data/ai-send-intent.ts`
- `app/ai/[id].tsx`
- 仅由 `npm run sync:contract` 生成的 `src/api/contract/ai-sessions.ts` 与 `src/api/schema/ai-sessions.ts`

## 关系与限制

0005 只建立稳定 session/message/request ID、消息 revision、幂等结果恢复、删后拒绝复活和安全的旧客户端兼容。0021 扩展同一契约的 origin 与 organization revision；0006 消费同一引用字段，不另造会话 ID 或发送幂等。涉及 E 线联系人详情、聊天、收件箱页面的模板接线先交接，0021／0006 发布模板与入口契约后再供 C 线 0022 消费。

真实 PostgreSQL、同账号 Web/App、原生设备和模型调用分别保留真实验收记录；缺环境时不能用内存测试冒充通过，也不阻止其他本地实现继续。
