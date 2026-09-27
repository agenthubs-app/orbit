# Sprint 0118 — 通知与 AI 对话放进手机（断网 3a = AI B3）

**Plan revision:** 1。**模式:** existing-codebase / single-generator。运行状态只在登记表。
**原需求:** 「断网也能用」第 6 步第 3 期 3a（收件箱通知、AI 对话记录）；「AI 对话数据方案」B3（会话列表和打开过的会话进入手机本地副本；再次打开先显示本地、再只拿新增消息；AI 会话在个人子空间，归属清楚）；第八节决定 4（等推导可见性设计案批准后再做——已于 2026-09-27 定稿）。
**单一目标:** 收件箱通知与 AI 会话（列表 + 打开过的会话消息）可离线读取，两处页面本地优先。
**易读目标:** [GOAL.md](GOAL.md)。
**基线:** 0117 合并后的 `chat-agent`（开工时追加提交号）。
**进入条件:** 0113（注册表 v2）、0112（会话消息有序有上限读取与顺序号）已完成。

## 已查明的事实（2026-09-27）

- 收件箱：集合 `inboxNotifications`（`features/notifications/storage/inbox-record-repository.ts:6`），`user_id` = 本人，信纸 `{notification, operations}`；服务端 `app/api/inbox/notifications/handler.ts`（列表/批量已读/详情/操作）、`app/api/inbox/summary/handler.ts`；读取窗口与未读数经 `readWindow.invalidIds` 有上限读取（`inbox-record-service.ts:86-114`）；规范投影开关 `ORBIT_CANONICAL_INBOX_PROJECTION`。App `src/screens/inbox/useNotificationInbox.ts`（列表、15 秒轮询、分页、每批 50 条已读）、`src/api/inbox-summary.ts` / `inbox-badge-resource.ts`、`NotificationDetailScreen.tsx`。0104 起 App 逐条解析、跳过未知类型。
- AI 会话：个人子空间 `${workspaceId}:actor:${actorId}`，集合 `orbit_agent_chat_sessions`、`orbit_agent_chat_messages`，无 `user_id`；0112 后消息有顺序号与有上限读取。请求记录（卡片来源）在 base workspace，`user_id` = 本人。App `src/screens/ai/AiScreen.tsx`（列表）、`AiConversationScreen.tsx`（会话）、路由 `app/(app)/ai.tsx`、`app/ai/[id].tsx`。
- 0113 的注册表 v2 已预留「个人子空间」来源种类，本 Sprint 实现它。
- **需先核实**：通知的「失效」（来源已不存在或状态变化时，服务器读取时通过 `readWindow.invalidIds` 过滤掉）是读取时计算还是写回到通知行。若只在读取时计算，手机上的副本不会知道它失效——属于「数据离开」，本 Sprint 必须改为写回（领新流水号）或在同步时下发删除，并有测试。

## 范围与文件

1. **同步类别**：
   - 收件箱通知（万能表，归属 `user_id`），下发字段为列表与详情所需；
   - AI 会话摘要（个人子空间，归属由子空间隐含），用于会话列表；
   - AI 会话消息：只同步「打开过的会话」——手机记录打开过的会话集合，同步请求带上该集合，服务器按会话与顺序号增量返回；卡片按 0112 的方式随页恢复，离线时显示已缓存的卡片。
2. **注册表**：实现个人子空间来源；说明书写明归属规则。
3. **App**：收件箱列表/详情、角标、AI 会话列表与会话页本地优先；显示「截至」；已读、操作、删除会话、发送新问题在断网时提示需要联网。离线策略与路由清单更新。
- 排除：用户之间的消息（0119）；断网写（0120+）；请求记录的全量同步（只随打开过的会话取需要的卡片）。

## 验收契约

| SC | 可观察行为 | 必需证据 |
| --- | --- | --- |
| SC-0118-01 | 隔离：A 的手机没有 B 的通知、会话、消息 | 真库测试 |
| SC-0118-02 | 增量：通知与会话首次全量 → 新增一条只传一条 → 再同步 0 行；已打开会话再次打开只取新增消息；删除的会话、失效的通知从手机消失 | 真库测试 |
| SC-0118-03 | 同步的会话消息只限「打开过的会话」，未打开的会话不下载消息 | 真库测试 + 读取计量 |
| SC-0118-04 | 飞行模式下 phoneweb 与 Simulator 打开收件箱（含详情）与 AI 会话列表、打开过的会话，内容完整并标明「截至」 | 截图 |
| SC-0118-05 | 读取成本不超过基线（轮询不再整页下载）；棘轮不增加；两端全量、typecheck 通过 | 摘要 |

## 测试

- 档位 H。开发集：新类别同步拓扑测试（含个人子空间来源）、收件箱服务测试、会话 provider 测试、App 收件箱与 AI 屏幕测试；收口：两端全量。

## 失败与交接

报告写明「打开过的会话」集合的上限与淘汰策略（例如最近 N 个），以及离线时卡片的显示规则。
