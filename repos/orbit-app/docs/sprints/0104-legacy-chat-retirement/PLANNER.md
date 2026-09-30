# Sprint 0104 — 旧 chat 退役（消息 M1）+ 收件箱容忍未知通知类型

**Plan revision:** 1。**模式:** existing-codebase / single-generator。
**原需求:** 「消息数据方案」M1（`docs/designs/2026-09-27-data-architecture/message-design.html`，2026-09-27 定稿；决定：隐私设置、允许分析、提取要点三处坏调用删掉）；0100 REPORT 登记的「旧版 App 遇未知通知类型整页解析失败」。
**单一目标:** 旧 chat 不再被任何页面使用并删除；草稿接到新系统；App 收件箱跳过未知通知条目。
**基线:** 0103 合并后的 `chat-agent` @ `39c874031`；已知失败：App 1（route-parity）+ 不稳定用例；orbits 33 + 不稳定用例；棘轮基线 164。
**依赖:** 无。

## 已查明的事实（2026-09-27）

- 旧 chat：集合 `messages`（80 行）、`conversations`（6 行），`user_id` 全空，只有演示数据；代码 `repos/orbits/features/chat/`（`storage/chat-conversation-live-record-provider.ts` 每次全读 4 类；`live-service.ts`、`live-summary-service.ts`、`live-assist-service.ts`、`live-privacy-service.ts`）；接口 `/api/chat/conversations{,/[id],/[id]/messages,/[id]/summary,/[id]/extractions}`、`/api/chat/privacy{,/analysis-toggle}`、`/api/chat/assist/{followup-draft,rewrite,email-draft}`、`/api/chat/relationship-inbox`。
- 仍在用的调用方：
  - App 与网页收件箱保存草稿：`/api/chat/relationship-inbox`（App `src/view-models/relationship-inbox.ts` `buildRelationshipThreadDraftRequest`，`RelationshipInboxScreen.tsx:1458`；网页 `app/(app)/app/inbox/relationship-inbox-panel.tsx:106,260`）。它读取时整类读旧 `conversations`/`messages`（`async-relationship-conversation-live-record-provider.ts`），写入 `relationshipConversationDrafts`。
  - App 收件箱 `chatPrivacyControlsPath`（`RelationshipInboxScreen.tsx:1174`）、`buildRelationshipPrivacyToggleRequest`（`:1210`）——传新系统编号，旧系统查不到（坏）。
  - App 聊天详情 `chatConversationExtractionsPath`（`RelationshipChatDetailScreen.tsx:77`）——同上（坏）。
  - 网页 iOrbit 页 `app/(app)/app/agent/page.tsx:132` `loadAppChatRouteViewModel` → `composeOrbitAgentEntryViewModel`，服务端全读旧 chat。**删除前核对 AI 入口组件实际用了其中哪些字段**，用到的改为从别处取或删除显示。
  - 网页收件箱 `/api/chat/assist/rewrite`、`/api/chat/assist/email-draft`：不读旧消息，**保留**（可迁到合适的位置，但行为不变）。
  - 无页面调用：`buildRelationshipChatMessageRequest`（`relationship-chat.ts:493`）、开发调试页 `features/chat/*-mock/debug-view.tsx`、`shared/services/capability-registry.ts:456,461` 的登记。
- 棘轮：`features/chat/storage/async-relationship-conversation-live-record-provider.ts: 1`、`features/chat/storage/chat-conversation-live-record-provider.ts: 1`。
- App 收件箱 schema：`src/api/schema/inbox-notifications.ts`（及契约同步源 `repos/orbits/shared/api-schema/inbox-notifications.ts`）对未知 `sourceType` 解析失败会让整页失败（0100 实测）。

## 范围

1. 草稿：保存/读取改为基于新系统（关系沟通）的对话编号与参与者校验，不再读旧集合；草稿集合 `relationshipConversationDrafts` 可保留。
2. 删除三处坏调用（App 收件箱两处、聊天详情一处）及其界面入口；删除对应接口与服务。
3. 网页 iOrbit 页不再读旧 chat。
4. 删除旧 chat 接口、服务、mock/debug、能力登记、App 无调用的请求函数与端点常量、离线策略与路由清单中的条目；本地开发库的旧演示数据（`messages`/`conversations` 集合）由种子脚本停止生成，已存在的行用可重复执行的清理脚本删除（**只在本地库执行**，生产执行由用户确认）。
5. 保留 `/api/chat/assist/rewrite`、`email-draft` 的行为。
6. App 收件箱：列表解析改为逐条校验，未知来源类型或单条畸形的条目被跳过（并在开发日志中计数），其余照常显示；角标/摘要同理。

## 验收契约

| SC | 可观察行为 | 必需证据 |
| --- | --- | --- |
| SC-0104-01 | 草稿在新系统对话上保存、读回、跨账号不可见；不再读取旧 `messages`/`conversations` 集合 | 真库测试 + 读取计量 |
| SC-0104-02 | App 收件箱与聊天详情不再请求 `/api/chat/privacy*`、`/extractions`；旧 chat 接口返回 404；网页收件箱改写/起草邮件照常 | App/路由测试 + phoneweb |
| SC-0104-03 | 网页 iOrbit 页渲染正常且服务端不读旧 chat 集合 | 读取小票/计量 + 截图 |
| SC-0104-04 | App 收件箱：含一条未知类型的响应，其余通知照常显示、未读数正确 | App 测试（先 RED） |
| SC-0104-05 | 棘轮 −2；两端全量、typecheck 通过；phoneweb（与 Simulator 如可用）走一遍收件箱、聊天、iOrbit | 摘要 + 截图 |

## 排除

新系统存储改造（0106）。删除生产库旧数据（需用户确认）。
