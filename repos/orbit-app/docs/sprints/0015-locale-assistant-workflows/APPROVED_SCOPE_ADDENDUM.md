# Sprint 0015 — run-01 精确文件边界补充

2026-09-15。依 `docs/sprints/RULES.md` 第 0、4、6 节复用用户已记录的“全部获准”，在启动前将 Planner 的目录边界收窄到本 Sprint 的真实消费者。此补充不改变 SC-0015-01～04，不修改模型、工具权限、会话／事项／消息协议或 Provider 职责。

## 实际页面锁

- IORBIT：`src/screens/ai/AgentActionsScreen.tsx`、`AiConversationScreen.tsx`、`AiScreen.tsx`、`AiSessionOrganization.tsx`、`ContactMentionPicker.tsx`、`OrbitNextActions.tsx`。
- 事项／Today：`src/screens/tasks/RelationshipTaskTools.tsx`、`TaskDetailScreen.tsx`、`TasksScreen.tsx`、`src/screens/today/TodayScreen.tsx`。
- 日程／日历：`src/screens/schedule/PersonalScheduleList.tsx`、`PersonalScheduleScreen.tsx`、`ScheduleEventPreviewScreen.tsx`、`ScheduleScreen.tsx`。
- 收件箱／提醒：`src/screens/inbox/RelationshipInboxScreen.tsx`。
- 明确排除其他屏幕目录、Web/API、Provider、HTTP/shared contract、数据库、模型与通知注册实现；0016 承接完整原生设备矩阵。

## 必要直接消费者

- `src/i18n/messages.ts` 与 `src/i18n/{zh,ja,en}.ts` 共同构成严格同键字典，本 Sprint 串行独占这些文件。
- 只有真实页面的产品状态来自直接 view-model／共享组件时，才可追加对应 `src/view-models/**`、`src/components/**` 或本地 screen helper；仅增加可选 language／translator 和已知产品枚举标签，默认中文兼容现有消费者。用户文本、聊天正文、联系人引用、事项标题、日期／时区、邮件正文与服务端原文必须保持 literal。
- 新建 `tests/app-locale-assistant-workflows.test.tsx`，并可修改上述屏幕的现有直接源码／交互测试，以验证 locale 接线而非保留硬编码中文。若触及共享状态、生成或写入逻辑，验证档从 L 升 H；否则按三个 L 集成门槛执行一次 App 全量。
