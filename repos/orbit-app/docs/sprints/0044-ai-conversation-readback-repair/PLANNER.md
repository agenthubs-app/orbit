# Sprint 0044 — AI 会话创建、持久化与回读闭环

Plan revision：1；existing-codebase / single-generator。原需求：R-00/R-02/R-14、0005/0021后续；D新查询POST200约11.6秒后GET404。单一目标：[成功会话可持续回读](GOAL.md)。

证据与规划基线见 [汇总§1](../SIMULATOR_REMEDIATION_PROGRAM.md#1-报告到底证明了什么)。进入条件：实施指令、同actor live会话store/认证契约、独立测试记录；0036 runtime/artifact/service-factory与App AI screen文件锁逐路径移交。可独立修会话生命周期，不等待所有工具；真实工具SC部分须0036相应adapter固定版本、provider授权和累计费用可用。

## 范围与文件

- Web `repos/orbits/app/api/ai/conversations/route.ts`、`[id]/route.ts`、`sessions/{handler,route}.ts`与`sessions/[id]/{handler,route}.ts`；先核对创建receipt、conversation/session ID与读取路径。
- `features/orbit-ai/{reliable-send-service,service-factory,live-conversation-service,conversation-runtime-links}.ts`、`features/orbit-ai/storage/orbit-agent-chat-session-{live-record-provider,provider-factory,transactions}.ts`及chat request store；只修改追踪证明需要的文件。
- App `repos/orbit-app/src/screens/ai/{AiScreen,AiConversationScreen,AiSessionOrganization}.tsx`、`src/api/ai-history-contract.ts`、`src/api/ai-session-management.ts`与实际发送接线，补充路径先登记。契约起点Web `shared/contract/ai-sessions.ts`、`shared/api-schema/ai-sessions.ts`，副本只生成。

排除：重做0036工具注册、把客户端本地数据偷偷上传、复制另一套会话存储、改变账号权限、新AI写工具、provider批量切换、OAuth、未授权migration。不可仅靠本地假会话掩盖服务器404。

## 验收契约（五项）

| SC | 可观察行为 | 主验证 |
| --- | --- | --- |
| SC-0044-01 | 创建成功receipt指向同actor可读会话；首条用户消息与回答状态持久化，立即GET及历史列表一致 | route→真实store→GET闭环；主包创建→打开→返回→重开 |
| SC-0044-02 | 重复发送/网络中断重试/并发请求不重复会话或消息，续聊读到前序历史 | idempotency、事务并发、provider调用计数与故障注入；真实同账号Web↔App续读 |
| SC-0044-03 | store/provider失败不返回不可恢复的成功指针；输入保留，失败/处理中可解释且重试不重复付费 | 存储失败、超时、回执丢失定向RED/GREEN及App失败交互 |
| SC-0044-04 | 跨actor读取拒绝；实际任务/跟进/笔记查询回答有工具调用与源revision证据，部分数据不称全部 | ACL测试与出站spy；相应adapter就绪后真实安全查询trace/回读，缺provider如实blocked |
| SC-0044-05 | 同版本production Web/API、主包8082及Web完成闭环；测试会话按UI清理、费用可核对、固定SHA可复验 | runtime身份、原生/UI与HTTP、账本、清理与merge-tree结果 |

## 执行与最小检查

先关联POST回执/requestId、actor、存储目标、读取service、ID与runtime link，查明是未落盘、路径不一致、scope差异还是处理状态问题；不能从404猜定。impact后补闭环失败测试，确定性provider先验证存储链，真实provider仅做SC必需少量安全调用。

Web定向起点 `tests/capabilities/orbit-agent-reliable-send.test.ts`、`orbit-agent-chat-session-api.test.ts`、`orbit-agent-chat-session-live-store.test.ts`、`ai-session-organization-postgres.test.ts`；App `tests/ink-signal-ai-conversation.test.ts`与必要新增会话发送/回读行为测试。以实际POST→GET结果断言，不只匹配源码。H档覆盖事务、重试、隔离、首条保存及直接消费者，收口受影响端集成/typecheck一次。

共享累计AI/OCR$5调用前读最新账本；provider字符串或POST200不是出站证据。SC-04外部行缺项不抹掉，可以提交安全确定性部分但不能completed。不得重开已结束0005 run。

失败、唯一run、Web重建重启、归档、commit→固定SHA→chat-agent合并树→适用push适用 [共同契约§4](../SIMULATOR_REMEDIATION_PROGRAM.md#4-共同执行验收和交付约束)，并交接0036实际工具结果而不篡改其验收。
