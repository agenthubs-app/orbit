# Sprint 0019 跨端实施补充

用户于 2026-09-15 明确要求连续实现 0018 与 0019，并授予完成所需的本地权限。0018 的本地 note ID／version／contactIds 契约已由 `8e81e588e` 交付；真实共同环境验收仍作为 SC-0018-05 与 SC-0019-04 的独立外部缺项保留，不阻塞本地协议和消费实现。

## 已批准协议

- 笔记详情仅携带 `{ id, version }` 和可编辑模板进入 `/ai/new`；导航、预填、刷新及读取笔记都不发送模型请求，也不创建建议或事项。
- 只有用户显式发送后，服务端才按 actor 读取来源笔记，并把 `sourceNoteId`、`sourceNoteVersion` 和完整 `relatedContactIds` 固化到建议。客户端不上传笔记正文。
- 含糊的相对日期进入 `needs_date_confirmation`，保留可编辑输入，不创建建议或事项；用户补充明确日期后重新发送。
- 笔记来源请求始终先生成建议，即使文本包含“创建待办”；只有显式接受才写入事项。接受以 suggestion ID 幂等，多人关联只创建一个事项。
- 接受前重新核对 actor 可见的笔记版本；版本变化使未接受建议失效。已接受建议的重复确认返回同一事项，不因随后版本变化制造第二条。
- 已接受事项保留来源笔记 ID／版本；笔记详情可回看来源事项，事项详情可返回来源笔记。相关联系人沿用一条事项的既有主联系人投影，完整联系人集合仍保留在建议中。

## 追加文件边界

为完成 Planner 已确认的跨端流程，允许修改／新建以下直接文件及其必要测试、共享契约同步副本与 Bridge／验证记录：

- Web/API：`repos/orbits/features/orbit-ai/{conversation-contract,task-interaction-service,task-interaction-service-factory}.ts`、`repos/orbits/app/api/ai/conversations/route.ts`、`repos/orbits/features/tasks/{contract,service,task-record,suggestion-service,suggestion-repository,suggestion-service-factory}.ts`、`repos/orbits/shared/contract/{orbit-ai,tasks}.ts`。
- App：`repos/orbit-app/app/ai/[id].tsx`、`src/screens/ai/AiConversationScreen.tsx`、`src/screens/ai/TaskInteractionCard.tsx`、`src/screens/notes/NoteDetailScreen.tsx`、`src/screens/tasks/TaskDetailScreen.tsx`、`src/view-models/{conversations,note-suggestions,today-tasks}.ts`、同步生成的 `src/api/contract/**`。
- 测试：两端与上述服务、API、契约、笔记入口、会话、事项详情及 Today 投影直接相关的测试；新增 `tests/note-suggestions-interactions.test.tsx`。

不创建数据库迁移，不访问真实数据库或真实账号，不调用付费模型做测试，不部署，不写外部日历／通知。真实 Web↔App 与原生设备证据不可用时，SC-0019-04／05 必须报告 blocked，不能用本地测试代替。
