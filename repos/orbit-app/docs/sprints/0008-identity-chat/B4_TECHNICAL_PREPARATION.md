# B4：邀请、绑定与投递边界

2026-09-14，源码基线 `fab788d62`；只读准备，不启动 [0008 Planner](PLANNER.md) 的 Generator。

## 不能复用为投递的现有接口

- Web `features/followups/contact-invitation-contract.ts` 只有 draft／ready_for_delivery，prepare 接收 contactId、recipientEmail、recipientName；响应始终声明 externalSendRequested／emailProviderRequested／messageSent 为 false，没有可接受邀请的 token/link 契约。
- `staged-contact-invitation-service.ts` 的 confirmInvitation 只更新文案和状态，再 upsert 暂存记录；不是验证接收方、绑定账号或发信。联系人邮箱只是用户录入值，不能充当账户所有权凭证。
- `app/api/chat/conversations/[id]/messages/route.ts` 的 POST 转给 actor-scoped chat service；live-service.ts 明确把出站消息标为 mock_recorded_locally。名称 live 指持久存储，不能据此把已有 requestId／201 回执当双用户送达。
- `live-async-service.ts` 的异步会话也有 local_draft_snapshot；不能仅凭 asynchronous 命名另走这条路径当真正消息传输。

上述 Web 路径均相对 `repos/orbits`。本轮只读源代码，未调用邀请、绑定、发信或模型接口；未尝试真实双用户验证。

## 待审的最小责任划分

1. 服务端解析当前 actor 对联系人拥有的访问权和经过验证的另一账号绑定，返回状态、允许动作、资格版本／有效期；App 不根据姓名、照片、手填 platformUserId 或 contactId 自行推定可聊天。
2. 用户明确创建可分享邀请后，服务端保存有范围、有效期和撤销状态的邀请；接受方必须登录并确认。接受邀请只改变被批准的绑定，不把邮箱相同自动解释为接受，也不自动发第一条消息。
3. 站内消息采用双方会员记录和服务端权限检查；持久化消息、幂等意图及可回读回执有原子边界。发送时重新验证资格，撤销后拒绝旧版本。saved／delivered／read 分清，已读和推送仍由 0012 承接。
4. 保留现有草稿接口语义，真实发送使用已审阅的独立动作／版本；不把旧 messageSent:false 兼容响应改名成投递成功。

这需要新增身份／邀请接受／站内会话契约及存储设计，不是仅修改 App 接口地址。数据模型、邀请有效期／撤销行为、精确 Web/App 文件、存储与迁移边界尚须随正式 Planner 审阅；没有批准默认期限、自动合并联系人或开放陌生人发信。

## 可单独实施但仍保留审阅的已确认要求

取消聊天详情“生成摘要”已经是用户决定，不再询问去留。未来只移除 `src/screens/chat/RelationshipChatDetailScreen.tsx` 的生成入口和该入口的调用／状态，调整直接相关交互测试；保留历史摘要读取、其他端仍使用的 API 与提取功能。它不依赖 B4 真实投递，但原 Planner 明确要求先补入实现范围与行为验证并审阅；不可借独立性跳过此门槛。

必测：该页不再显示生成摘要控件，打开／刷新不触发摘要生成，已有摘要不被删除，回复草稿和提取仍可使用。正式范围需先读具体组件调用再收敛；本轮未修改产品。

当前可查明的误用风险已记录。后续绑定／邀请／真实投递代码受 B4 设计审阅约束；双用户账号与具体动作授权只阻塞真实联验，不替代设计。若仅先批准摘要移除的精确范围，可独立交付，不应让它等待未完成的消息传输。
