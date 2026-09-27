# Codex Review — Sprint 0104

审阅日期：2026-09-27。结论：**建议修正草稿保存反馈和未知通知的未读计数。**

## 审阅版本与范围

- 基线：`39c874031`；实现：`c68ca7163`、`24258850e`、`6b7723260`、`ec308129a`；结束报告：`a717e2ffd`。
- 审阅冻结 HEAD：`6d0fffd1e`。阅读 PLANNER、已提交 REPORT、旧入口删除、回复草稿参与者/账号校验、Web 与 App composer、逐条通知解析、清理脚本及 instrumentation 修复。
- 0105～0120 在本轮末已出现规划提交；没有结束报告和已完成实现，因此没有替它们预先写审阅结论。

## 发现

### [P2] 保存旧正文的迟到响应，把继续编辑的新正文标为已保存

位置：[RelationshipInboxScreen.tsx:1201](/Users/xzhao/Projects/orbit/repos/orbit-app/src/screens/inbox/RelationshipInboxScreen.tsx:1201)；Web 同类问题：[bounded-contact-messages-tab.tsx:87](</Users/xzhao/Projects/orbit/repos/orbits/app/(app)/app/inbox/bounded-contact-messages-tab.tsx:87>)。

保存期间 textarea/TextInput 仍允许编辑。用户输入“第一版”并点保存，在请求返回前改成“第二版”；编辑事件把状态设回 idle，但第一版的响应稍后无条件把状态设为 saved。屏幕显示第二版并提示“草稿已保存”，服务端实际上只有第一版。用户依据这个提示离开页面就会丢失第二版。App 只比较响应正文与请求时的 `saving`，没有比较当前正文；Web 同样只验证提交时的值。

**独立复现：** 复用已有 Web 组件测试夹具，在内存中延迟 PUT 回执，不修改测试文件。浏览器实得：输入框“第二版尚未保存”、存储“第一版”、保存成功提示可见。全部网络由测试桩处理，没有真实消息发送或数据库写入。App 的同类分支已由源码确认，未运行原生交互。

**建议：** 使用编辑版本/请求标识，只有响应对应当前正文和当前会话时才显示 saved；输入变化后保持未保存状态。也应防止旧会话的保存回执更新新会话的提示。补“保存中继续编辑”和“保存中切换会话”的交互测试。

### [P2] 未读数减去不在服务器未读统计中的未知历史条目

位置：[inbox-notifications.ts:18](/Users/xzhao/Projects/orbit/repos/orbit-app/src/api/inbox-notifications.ts:18)；服务端统计规则见 `features/notifications/inbox-record-service.ts` 的 `list()`。

解析器将每个被跳过且 `readAt===null` 的条目都算作 skippedUnread，并从服务器 unreadCount 中减掉。服务端未读数仅统计 active、target available 的未读通知，历史里 dismissed、未来 scheduled 或来源不可用的记录并不贡献未读数。它们若是客户端不认识的类型，会被错误扣减，连正常通知的未读数也被减掉。

**独立复现：** 历史响应含 1 条已知 open 未读通知和 1 条未知 dismissed/readAt=null 条目，服务器 unreadCount=1；解析后保留了那条已知未读通知，却返回 unreadCount=0。另一个边界是跨页统计：服务器给的是全局总数，客户端只扣当前页未知条目，翻页会得到不同口径的总数。

**建议：** 不用 readAt 单独推断条目是否贡献全局未读数。定义客户端支持类型对应的计数契约，由服务端按相同筛选条件返回摘要；或保留服务器总数并明确其含未展示类型，避免伪造“可清除的已知条目总数”。补 dismissed、scheduled、unavailable 和多页未知条目的反例。

## 其余意见与验收边界

- 回复草稿读取和保存都核对对话参与者与有效绑定，并按账号/对话精确取草稿；未发现可证实的跨账号草稿泄漏。清理脚本默认预演，远程 apply 要求 workspace 确认；本次没有执行清理。
- 0100 的未知通知整页解析失败在新版解析入口已得到改善，但不能据此认定历史安装的 App 已更新。
- 发送成功后的持久草稿清空是 best-effort 且吞掉失败，存在已发送正文重新作为草稿出现的恢复风险，建议后续提供清空失败反馈或原子条件清理。未对真实网络故障复现，不另列确定缺陷。
- Simulator 未运行是原 REPORT 明确保留的缺项；phoneweb 和页面单元测试不替代原生草稿输入/恢复验收。

## 独立验证与影响

- 按项目渲染测试入口执行 `inbox-notification-tolerance.test.ts`：**3/3 通过，无跳过**。第一次直接使用 tsx、遗漏 render hooks 时在 Expo 图标 JSX 加载阶段失败；加上项目既有 `register-render-hooks.mjs` 后通过，没有更改依赖或代码。
- 完成上述 Web 延迟回执浏览器复现与 App 解析器反例；未跑真库、全量、真实发送、原生或清理操作。
- GitNexus upstream impact 对 `createRelationshipCommunicationService` 返回 LOW、1 个直接调用方；索引比本 Sprint 旧，不能据此认定新增 draft 路由与两端消费者完整覆盖。已核对服务工厂、HTTP handler、App 和 Web 接线；旧 chat 删除涉及的高风险上下文入口仍以 REPORT 的 HIGH 记录为准。
