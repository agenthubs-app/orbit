# 关系收件箱面板（Relationship Inbox Panel）落地设计方案

> 状态：已实现并持续迭代。右上角 shell 级 slide-over 面板统一"对话往来"和
> "提醒信号"，并把"给人脉发信息"闭环接到真实服务。

## 1. 目标与范围

在 `/app/**` 顶栏右上角新增一个入口，点开一个从右侧滑出的面板，包含两个 tab：

- **💬 对话（Threads）**：邮箱式收件箱列表 → 点开一个主题线程（title + 详情 + 消息流）
  → 底部自由回复。发起新对话 = 生成一封首封消息，成为线程第一条。
- **🔔 提醒（Alerts）**：系统提醒 + 主动 agent 提示，可清除、点击跳转到对应联系人/活动。

**不在本方案范围**（保持现有安全边界）：真正的外部发送。发送在 external-send
sandbox + 确认守卫建成前，只能停在 `staged_local_preview` / `ready_for_confirmation`。

## 2. 复用的现有契约 / 服务 / API

这个面板**基本不需要新后端契约**，主要是新增一个前端呈现面。复用清单：

| 用途 | 复用的契约 / 服务 | 现有 API |
|---|---|---|
| 对话收件箱 + 线程 + 回复草稿 | `AsyncRelationshipConversationService`（`features/chat`）；DTO：`AsyncConversationInboxItem` / `AsyncConversationThread` / `AsyncConversationMessage` / `AsyncConversationDraftReply` / `AsyncConversationWorkspacePayload` | `GET /api/chat/conversations`、`GET /api/chat/conversations/[id]`、`POST /api/chat/conversations/[id]/messages` |
| 线程内改写/语气辅助 | `chat-writing-assist`（`features/chat/assist-contract.ts`） | `POST /api/chat/assist/rewrite`、`/api/chat/assist/followup-draft` |
| 发起新对话的首封草稿 | `MessageDraftGeneratorService`（`features/followups/message-draft-contract.ts`）；DTO：`MessageDraft` | `POST /api/message-drafts`、`PATCH /api/message-drafts/[id]` |
| 提醒队列 | `reminder-schedule-and-notification`（`features/notifications/contract.ts`）；DTO：`ScheduledReminder` / `NotificationQueueEntry` | `/api/notifications`（reminder generate/list） |
| 主动提示 | orbit-ai proactive（`features/orbit-ai/proactive-contract.ts`，`deliverySurface: orbit_ai_chat`） | `/api/ai/proactive-turns` |

关键点：`AsyncConversationInboxItem` 的字段（`conversationId / contactId / participantName /
organization / subject / preview / lastCorrespondenceAt / unreadCount / nextActionLabel /
sourceContextLabels`）已经是一行邮件收件箱条目；`AsyncConversationThread` 有
`subject + messages[]`；`AsyncConversationWorkspacePayload` 一次返回 inbox + 选中线程 +
草稿回复 + 上下文。**用户描述的形态与该契约 1:1 吻合。**

## 3. 信息架构：两类数据分区（关键设计决定）

"通知"和"对话"是两类数据，**不混在一个列表**：

- **对话线程**：双向、持久、有历史 → 邮箱式列表，点开成对话。
- **提醒/提示**：单向、瞬时、可清除 → feed + badge，点击跳转，不"打开成对话"。

面板顶部两个 tab 切换。右上角入口的红点 badge = 未读对话数 + 待处理提醒数之和。

## 4. 挂载点与组件结构

**挂载点**：`app/(app)/app/orbit-account-shell.tsx` 的 `AccountTopNav` 已有
`rightExtra?: ReactNode` 插槽。把面板入口按钮注入 `rightExtra`，即可在所有
`/app/**` 页面顶栏出现，无需改各页面。

```
orbit-account-shell.tsx (AccountTopNav rightExtra)
└── <RelationshipInboxTrigger/>            ← 铃铛/信封按钮 + 未读 badge（client）
     └── <RelationshipInboxPanel/>          ← slide-over 容器（client，focus-trap，Esc 关闭）
          ├── <InboxTabs/>                  ← 💬对话 / 🔔提醒
          ├── ThreadsTab
          │    ├── <ThreadList/>            ← AsyncConversationInboxItem[] → 行
          │    ├── <ThreadDetail/>          ← 选中线程：subject + 消息流
          │    ├── <ReplyComposer/>         ← draftReply 编辑 + AI改写 + [发送(需确认)]
          │    └── <NewThreadButton/>       ← 发起新对话 → message-draft-generator
          └── AlertsTab
               ├── <ReminderList/>          ← ScheduledReminder[]
               └── <ProactiveNudgeList/>    ← proactive turns，可清除/跳转
```

组件放在 `app/(app)/app/inbox/`（新目录），slide-over 复用现有
`.orbit-scrim` / slide-over 样式模式（参考联系人页 `orbit-cards-interactions` 的 sheet
或 shell 既有的抽屉样式），主题走 `[data-orbit-real-page]` 令牌。

## 5. 数据入口与 view model

面板是 shell 级、按需打开的，**采用客户端按需拉取**（不阻塞每个页面的 SSR）：

- 打开面板时 client `fetch('/api/chat/conversations')` 拉收件箱；点开某条再拉
  `/api/chat/conversations/[id]`；回复走 `POST …/messages`。
- 提醒 tab 拉 `/api/notifications` + `/api/ai/proactive-turns`。
- **分层规则**：新增 `app/(app)/app/inbox/inbox-panel-view-model.ts` 作为 DTO→UI 的
  唯一映射点；面板组件只消费 view model，**不直接 import** `features/*` 契约（沿用
  现有 presenter 解耦规则）。API route 内部才调 service-factory。
- 未读 badge 的初值可在 shell SSR 时带一个轻量 count（可选优化），或打开时再拉。

## 6. "发起新对话"如何串联两个服务

对应之前确认的分工（draft-generator 起头、chat 接管往来）：

1. 用户在面板点「发起新对话」，选联系人（或从联系人详情页"起草邮件"进入并预填）。
2. `POST /api/message-drafts`（`MessageDraftGeneratorService.createDraft`）用该联系人的
   name/org/relationshipContext 生成**首封草稿**（subject=线程 title，body，发送窗口，
   理由，来源证据）。
3. 用户复核/编辑（`PATCH /api/message-drafts/[id]`，状态 `draft → ready_for_confirmation`）。
4. 确认后，这封成为一个新 conversation 线程的第一条消息（inbox 新条目）。
   - 现有 async 契约是只读预览，**这一步需要新增**"从 draft 创建线程"的写入路径
     （见 §8 步骤 3 的待建项）。
5. 线程内后续往来走 `chat` 的 `draftReply` + `POST …/messages`（本地记录）。

## 7. 发送安全边界（必须保留）

现有所有服务：草稿优先、不真发、需确认、外发 flag 全 `false`。面板 UI 必须：

- 「发送」按钮文案明确 `发送（需确认）`；点击后停在
  `AsyncConversationStage.status = staged_local_preview` 或 draft `ready_for_confirmation`。
- 显示 `noSideEffectStatement` / provenance：无外部消息、通知、日历、保存记录、网络。
- 保留 `sourceContextLabels` / `evidenceIds`；原始 `evidence:*` id 不进主文案（走
  次级 disclosure），沿用产品化规则。
- live 缺配置 → fail closed（`…UNCONFIGURED`），不回退外部 transport。

## 8. 分步实现计划（建议按 sprint 切）

| 步骤 | 内容 | 产出 | 依赖 |
|---|---|---|---|
| **0** | 顶栏入口 + 空 slide-over 面板（focus-trap/Esc/badge 占位） | `inbox-panel.tsx` + `AccountTopNav.rightExtra` 接入 | 无 |
| **1** | 对话 tab 只读：收件箱列表 + 线程详情 | `ThreadList` / `ThreadDetail` + view model + 拉 `/api/chat/conversations[/id]` | 复用 async 契约 |
| **2** | 线程内回复（本地预览）+ AI 改写 | `ReplyComposer` + `POST …/messages` + `/assist/rewrite` | 步骤 1 |
| **3** | 发起新对话：draft-generator 生成首封 → 复核 → 建线程 | 「新建」流程 + **新增 draft→thread 写入路径** | message-draft-generator |
| **4** | 提醒 tab：reminders + proactive nudges（可清除/跳转） | `ReminderList` / `ProactiveNudgeList` | notifications + proactive |
| **5** | 未读 badge 聚合 + 联系人详情页"起草邮件"接入本面板 | badge 计数 + 详情页入口替换现有 toast | 步骤 1–3 |

步骤 0–2 是最小可用闭环（能看往来、能本地回复）。步骤 3 是"发信"核心闭环。

### 实现状态（2026-07-09：步骤 0–5 全部完成）

已落地文件：
- `app/(app)/app/inbox/relationship-inbox-panel.tsx` — 入口 trigger（badge 聚合 + compose 事件监听）、slide-over、两 tab、对话列表/详情、回复编辑器（AI 改写 + 发送需确认）、发起新对话表单、提醒 tab（reminders + proactive，可清除/跳转）。
- `app/(app)/app/inbox/inbox-panel-view-model.ts` — DTO→UI 映射点（对话、创建线程、提醒、proactive、未读聚合）。
- `app/(app)/app/orbit-account-shell.tsx` — `AccountTopNav` 默认注入 trigger（全站顶栏）。
- `app/api/chat/relationship-inbox/route.ts` — GET workspace + POST createConversationFromDraft。
- `features/chat/{contract,service,mock-service}.ts` — 新增 `createConversationFromDraft` 写入路径（本地 staged 线程，零副作用）。
- `app/api/ai/proactive-turns/route.ts` — 新增 GET（演示 proactive nudge）。
- `app/(app)/app/contacts/orbit-real-card-connection.tsx` — "起草邮件"改为进入本面板发起新对话流程。

测试：`tests/pages/app-relationship-inbox-{panel,threads,alerts}.test.ts(x)` 共 16 个，全部通过；全套件零新增失败；`npm run lint` 零新增错误。发送边界：所有外发/投递 flag 全 false，发送停在本地 staged 预览。

## 9. 测试要求

- 面板打开/关闭、focus-trap、Esc、tab 切换可见。
- 对话 tab：收件箱条目、线程消息流、`unreadCount`、来源标签可见。
- 回复：`externalSendRequested/messageSent` 为 false 或 local-only。
- 发起新对话：走 message-draft-generator，`sendActionRequiresConfirmation: true`，
  外发 flag 全 false。
- 提醒 tab：mock 不投递（`notificationDelivered: false`），点击跳转正确。
- 解耦测试：面板 presenter 不直接 import `features/*` 契约/服务。
- live 缺配置 fail-closed 状态可见。

## 10. 已拍板决定（2026-07-09）

1. **入口形态**：✅ 单入口 + 两 tab（🔔+💬合一）。
2. **draft→thread 写入路径**（步骤 3）：✅ 在 `features/chat` 新增后端写入动作
   `createConversationFromDraft`（mock-first，staged 本地线程，无外部发送），而不是纯前端本地态。
3. **提醒来源**：✅ Alerts tab 同时接 notifications reminders 和 orbit-ai proactive turns。
4. **发起新对话入口**：✅ 面板内 + 联系人详情页"起草邮件"都进这个流程，替换详情页现有 toast 占位。

按步骤 0→5 逐个 goal 执行。

## 11. 对话工作台 UI 改版（2026-07-24）

对话 tab 已从单列的“列表 / 详情来回切换”改为桌面端三栏工作台：

- 左栏固定承载可搜索的对话历史、未读状态与新建入口；
- 中栏承载主题、完整消息流和置底的复核式回复编辑器；
- 右栏展示联系人、组织、关系摘要、来源线索和外发安全边界；
- 面板左缘提供可聚焦的拖拽分隔条，支持 pointer 拖动、左右方向键、
  `Shift + 方向键` 加速、双击复位；
- 宽度保存在浏览器本地的 `orbit:relationship-inbox:width`，不进入用户业务数据，
  也不进行云同步；
- 容器宽度低于 880px 时隐藏上下文栏；低于 680px 时切换为列表 / 会话单页导航；
  视口低于 640px 时面板全屏并隐藏拖拽柄。

本次改版不改变 conversation API、view model、顶栏入口或任何发送语义。
所有“发送”动作仍停在本地 staged review，未经确认不会发生外部投递。
