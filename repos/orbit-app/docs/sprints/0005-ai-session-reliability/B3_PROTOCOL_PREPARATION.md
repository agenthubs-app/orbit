# B3 会话可靠性与后续接口边界

2026-09-14，产品基线 `df824de70`。本文完成 0005／0021／0006 的共享链路盘点及协议提案，不是已发布 API，也不扩张 0005 的原 App 白名单。正式实现前须把跨端文件边界和协议合入 Planner 审阅。

## 实际链路与缺口

| 边界 | 源码事实 | 必须避免的误判 |
| --- | --- | --- |
| Web `app/api/ai/conversations/route.ts` 的 readSendInput | 只读取 conversationId、history、locale、message／prompt、scenario | 在 App body 加 requestId 或 contactIds，目前不会自动获得服务端幂等／引用支持。 |
| App `AiConversationScreen.tsx` 的 submitRequest | 先调用模型，成功后用 runId／时间派生 session ID，再提交整份 session | 首轮失败不能保证已有持久 session ID；客户端点击锁不是请求幂等。 |
| App persistAndCanonicalizeDraftConversation | 有独立重试保存、actor／server 归属保护和回执匹配 | 这些有效行为应复用，不能为新协议删掉已有保稿和迟到请求保护。 |
| Web `sessions/handler.ts` | actor 来自认证；规范化 session 后调用 upsertSession，无版本／mutation 参数 | actor 隔离已经存在，但不等于跨设备写入冲突已解决。 |
| storage 的 normalizeOrbitAgentChatSessionSnapshot | 最多最近 100 条、每条 12,000 字；按白名单重建快照 | 新 origin 字段不接入会丢失；消息上下文窗口与持久历史容量不能混为一谈。 |
| storage 的 messageRecordId／upsertSession | 消息记录键使用规范化 session ID 加数组位置；先写 session，再并行写消息、删除不在新快照中的记录 | 同 ID 保存不是原子消息追加；短快照可能删除旧消息位置。当前代码没有跨步骤事务，不能宣称已防丢失。 |
| Web restoreSession → messages／panel effect → persistCurrentSession | 恢复设置页面状态，effect 会走自动保存 | 未对真实历史复现实损，不声称数据已丢；只读验收不能随便打开带此副作用的页面。 |
| App `src/data/ai-send-intent.ts` | 一次性发送意图绑定 actor、baseUrl、message，保存在内存 | 导航参数不是发送授权；模板入口继续只预填，不能用 origin 强行授权模型调用。 |

已有 GET 的 history 截断规则用于模型上下文；B3 必须把存储历史与发给模型的有限上下文区分。保留原 R-00 503 未决事实，不以本次隔离测试替代根因调查或付费成功证据。

## 一次定义、按 Sprint 接入

| 协议部分 | 生产者 | 后续消费者与不重复工作 |
| --- | --- | --- |
| 稳定 session／message ID、消息追加／版本、请求结果恢复 | 0005 的 B3 跨端补充 | 0021 管理同一 session，不生成第二套 canonical ID；0006 不再改发送幂等。 |
| 会话起源／首条实发内容、分组和组织 revision | 0021 | 在 B3 的首次保存点接 origin，消息保存不能回滚组织；0006／0019 登记真实入口。 |
| 联系人引用与模板 ID／版本 | 0006 | 消费 B3 已声明的受控引用接口，由服务端验权；0022 迁移按钮，不复制生成逻辑。 |
| 笔记引用与建议接受 | 0019 | 与 B3／0021 的同一受控引用和起源协议兼容；只有笔记权限及建议接口发布后才开放。 |

## 推荐的 B3 最小协议

在现有 route 下通过显式 protocolVersion 区分新旧请求，不静默改变旧响应。共享声明计划放 `shared/contract/ai-sessions.ts` 与 `shared/api-schema/ai-sessions.ts`，由 0005 先建立消息可靠性部分，0021 在同文件追加 origin／organization；App 只用既有同步通道。0021 原“新建该文件”的步骤在承接时改为扩展实际 B3 版本，不再重建文件。

```ts
type ReliableSendInput = {
  protocolVersion: 2;
  sessionId: string;
  clientMessageId: string;
  requestId: string;
  expectedMessageRevision: number;
  message: string;
  locale: "zh" | "en" | "ja";
  references: readonly { type: "contact" | "event" | "note"; id: string }[];
};
type ReliableSendState =
  | "pending" | "completed" | "failed_before_execution" | "outcome_unknown";
```

- sessionId、clientMessageId、requestId 在首次主动发送前生成并保留，重试不换 ID。服务端绑定 actor／workspace，校验受控引用权限；未发布的引用类型明确拒绝，不忽略、不伪装支持。
- 首次主动发送先持久化用户消息，收到回执后才执行生成。B3 负责这个保存时点，0021 只扩展该点携带的不可变 origin，避免再反转一次保存顺序。打开空白会话不创建记录。
- 存储同一请求的规范化输入摘要。相同 ID／相同内容重放已完成结果；相同 ID／不同内容返回冲突；pending 返回处理中，不启动第二次模型调用。
- 在现有 `GET /api/ai/conversations/sessions/[id]` 的新协议分支按 requestId 读取结果状态，授权和目标绑定与发送一致。客户端断网后先查询结果；不能把 AbortController 取消当服务端已经停止。
- 模型执行结果不确定时返回 outcome_unknown，不自动重新生成。外部 provider 若不支持幂等，不能承诺进程崩溃后的 exactly-once；只能防止盲目重试并明确未知结果。失败可确定发生在执行前时才允许按协议重试。
- 服务端保存 assistant 回复和请求完成回执；保存重试不再次调用模型。App 保留已有独立“重试保存”体验，映射实际故障层，不再让旧整份快照成为唯一结果副本。
- 消息采用不可变 message ID 与顺序号追加，expectedMessageRevision 只保护消息变更；0021 的 organization revision 独立保护分组／置顶／标题，不能并存两个含义相同的全局 revision。
- 旧快照请求不能清空新字段或回滚消息。旧协议写入已升级会话时，无法证明安全合并就明确返回冲突／升级提示，不静默覆盖。旧 ID 继续读取，不按标题合并历史。
- 删除状态先于晚到消息写入检查；0021 定义的 tombstone 必须被 B3 的新保存路径遵守，删除后旧请求不能复活同 ID。

请求去重登记、消息追加、版本比较和删除检查在 feature 存储层消费现有 `shared/storage/transactional-postgres.ts` 的 serializable transaction，不能靠进程内 Map 证明多实例原子性。模型网络调用不放在持锁数据库事务内；先持久化执行状态，完成后另一次事务提交结果，崩溃窗口按 outcome_unknown 处理。

## 待补入 0005 的精确文件

原 App Planner 不允许 Web 修改；下列只是待审补充，不是现在的写权限。

- Web：`app/api/ai/conversations/route.ts`；`app/api/ai/conversations/sessions/handler.ts`、`[id]/handler.ts`；`features/orbit-ai/conversation-contract.ts`、`live-conversation-service.ts`、`service-factory.ts`；`features/orbit-ai/storage/orbit-agent-chat-session-live-record-provider.ts`、`orbit-agent-chat-session-provider-factory.ts`。
- Web 新建：`shared/contract/ai-sessions.ts`、`shared/api-schema/ai-sessions.ts`；`features/orbit-ai/reliable-send-service.ts`；`features/orbit-ai/storage/orbit-agent-chat-session-transactions.ts`、`orbit-agent-chat-request-store.ts`。
- Web 消费者：`app/(app)/app/agent/orbit-real-agent.tsx`、`agent-chat-session-mutations.ts`。恢复与刷新只读；显式消息编辑／发送才保存。该改动先用隔离夹具证明零自动 POST，再做授权真实历史验收。
- App：原 0005 白名单，加 `src/api/ai-history-contract.ts`、`src/data/ai-send-intent.ts`、`app/ai/[id].tsx` 与同步副本；入口来源 UI 仍归 0021。
- 新测试：Web `tests/capabilities/orbit-agent-reliable-send.test.ts`、`orbit-agent-session-concurrency.test.ts`、`orbit-agent-session-postgres.test.ts`；App 原拟新增 `tests/ai-conversation-persistence-interactions.test.tsx`。现有 session、history 和 mutation 测试继续复用。

## 具体失败场景与基线

新测试必须先证明：相同 requestId 的重复／并发发送只执行一次；已完成重试读同结果；pending／outcome_unknown 不再生成；相同 ID 换文本拒绝；存储失败不先付费；actor／服务器切换不串记录；两个设备的旧版本不覆盖；删后晚到保存不复活；首轮失败仍有原用户消息；101 条消息的旧快照不能删持久历史。

2026-09-14 在 Web cwd 运行现有：

```sh
node --test --import tsx tests/capabilities/orbit-agent-chat-session-api.test.ts tests/capabilities/orbit-agent-chat-session-live-store.test.ts
```

结果 7 pass、0 fail／skip。API 测试在进程内设置隔离 mock／无配置环境，provider 测试注入 memory store；没有连接业务数据库或调用模型。名称含 live-store 不代表真实 PostgreSQL 证据。它们只证明现有认证隔离、基础保存／回读和删除幂等，不证明上述新增并发与恢复行为。

### 旧快照覆盖的隔离复现

同版本使用真实 createStorageOrbitAgentChatSessionProvider，并注入全新 createMemoryLiveRecordStore：先写入更新时间 00:02 的四条消息，再对同 ID 写入更新时间 00:01 的两条旧消息，随后 getSession。结果为 `beforeCount: 4`、`afterStaleWriteCount: 2`，updatedAt 从 `2026-09-14T00:02:00.000Z` 倒退为 `2026-09-14T00:01:00.000Z`，旧写入未被拒绝。

这证明当前 provider 在此输入序列下会接受旧短快照并移除较新消息，不是只有静态猜测；不证明真实用户历史已经发生损失，也不是生产数据库并发测试。实施时把该序列固化为预期保留四条消息／拒绝旧版本的 RED，再实现版本检查及原子性。

诊断首次使用 ESM named import 遇到当前 tsx／CommonJS 模块导出不匹配，未执行存储操作；改用 `node --import tsx -e` 中的 require 后复现成功，退出码 0。没有修改产品源码、访问数据库或运行模型。

## 剩余门槛

本跨端协议、旧客户端写入冲突策略及新增文件需要书面审阅后合入 0005 Planner。真实 PostgreSQL 必须使用明确隔离测试环境；真实历史重开、模型调用与必要副作用沿原授权及账本核对。上述限制只隔离对应动作，不阻止 0020 或其他独立已就绪工作。
