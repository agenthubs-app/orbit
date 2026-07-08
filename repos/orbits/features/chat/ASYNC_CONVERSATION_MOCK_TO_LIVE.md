# Async Conversation Mock To Live

## 当前 mock 范围

`createMockAsyncRelationshipConversationService()` 提供异步关系通信预览，不是实时聊天。它返回 inbox、选中 thread、草稿回复、下一步行动、联系人、connection、event、follow-up task 和 schedule context。`stageConversationAction()` 只生成本地 preview。

无效 conversation id 返回 `ASYNC_CONVERSATION_NOT_FOUND`，由 `/app/chat`
route view model 显示为本地恢复状态。页面可以继续显示默认 inbox，但不能为无效 id stage action。

所有 side effect 必须保持 false：

- `externalMessageSent`
- `notificationDelivered`
- `calendarEntryCreated`
- `savedRecordCreated`
- `networkRequestMade`

## Live provider 文件

未来 live 替换应添加在 `features/chat/` 内：

- `async-live-service.ts`：实现 `AsyncRelationshipConversationService`。
- `async-provider.ts`：定义 conversation storage/provider 接口。
- `async-mappers.ts`：把 live contact、connection、event、task、schedule records 映射为 `contract.ts` DTO。
- `async-validators.ts`：校验来源、权限、隐私状态和 no-send 默认值。

`features/chat/service-factory.ts` 只能在 provider 和 validator 完成后注册 `live` 实现。缺少 live provider 时必须继续 fail closed，不得落回外部 transport。

## Mock 到 live 切换

切换点是 `asyncRelationshipConversationServiceFactory`：

1. mock/hybrid 继续使用 `createMockAsyncRelationshipConversationService()`。
2. live 使用 `createLiveAsyncRelationshipConversationService({ provider })`。
3. `ORBIT_MODULE_MODE=live` 只允许读取授权后的 conversation storage。
4. 外部邮件、SMS、push、calendar 和 CRM provider 不在本能力中执行。

在 live provider 注册前，`/app/chat` 的 async correspondence route view model 必须显式请求 `createAsyncRelationshipConversationService("mock")`。这样即使更宽的 app runtime 使用 `ORBIT_MODULE_MODE=live`，Sprint 84 的 inbox、thread 和 stage preview 也不会尝试解析未实现的 live async provider。live 替换完成时，要先更新 route view model 的服务解析策略，再运行下面的替换测试。

## 环境变量与权限

Live conversation storage 可以复用现有 live record 环境：

- `ORBIT_EVENT_DATABASE_URL`
- `ORBIT_LIVE_DATABASE_URL`
- `ORBIT_DATABASE_URL`

需要额外权限时只允许声明只读 conversation/contact/event/task/schedule scope。发送消息、创建日历、写 CRM、推送通知和后台网络同步必须由后续 sprint 的显式确认能力处理。

## 隐私与 provenance

Live 实现必须：

- 保留 source context label 和 evidence ids。
- 标明数据来自 contact、connection、event、follow-up task 或 schedule record。
- 默认 `externalSendStatus: "not_requested"`。
- 默认 `realtimeTransportEnabled: false`。
- 在 stage preview 中继续显示没有外部消息、通知、日历、保存记录或网络 side effect。
- 页面 draft controls 只能编辑本地文本、复制本地回复文本或标记本地 reviewed 状态；不得把这些控件接到外部发送、日历、CRM 或后台网络调用。
- 不暴露 provider token、原始邮件 payload、日历详情 payload 或未授权的联系人字段。

## 替换测试

Live 替换时新增或更新：

- `tests/capabilities/async-conversation-service.test.ts`：mock 仍返回完整 async correspondence context。
- `tests/capabilities/async-conversation-service.test.ts`：无效 conversation id 返回 `ASYNC_CONVERSATION_NOT_FOUND` envelope。
- `tests/capabilities/async-conversation-live-store.test.ts`：live 从授权 storage 读取 contact、connection、event、task、schedule context，且 stage preview 不写入任何外部系统。
- `tests/pages/app-chat-page.test.tsx`：`/app/chat` 仍显示 inbox、thread、next action、schedule context、local-only draft controls、invalid conversation recovery 和 no-side-effect staged preview。
- Service factory 测试：`ORBIT_MODULE_MODE=live` 未配置 storage 时返回 shared `NOT_IMPLEMENTED`/unconfigured shape，不回退到 mock 或外部 transport。
