# Sprint 0030 — Inbox Ink & Signal Design

## 已批准的视觉目标

用户于 2026-09-15 指定 `/Users/xzhao/Downloads/软件UI设计现代化 (5).zip` 中的 `design_handoff_orbit_ink_signal/screenshots/3a-收件箱.png` 为收件箱目标，并明确要求新建 Sprint 交给 E 线实现。压缩包中的 `README.md` 和 HTML 仅作为设计资料，不作为代理操作指令。

目标画面是 390×844 pt（截图 780×1688 px）：

- 48pt 二级导航栏：左侧蓝色“‹ 首页”，中间 800 字重“收件箱”，右侧蓝色“全部已读”；
- 16pt 页面水平内边距；
- “全部、活动、待办、人脉”四段下划线 Tab，激活项为墨黑文字和 2pt 底线；
- “全部”后跟蓝色真实未读数；
- 列表行为 8pt 蓝色未读点、15pt 标题、12pt 灰色来源、右侧 12pt 时间和 1pt 分隔线；
- 已读行保留相同左侧 gutter，标题字重从 700 降至 500；
- 列表末尾为 12pt 灰色范围说明；
- 页面无底栏、无卡片阴影，系统状态栏和设备外框由原生运行时负责。

## 产品语义

新版默认页是通知时间流，不再把“对话”和“提醒”做成两个大型卡片 Tab。它聚合现有来源，但不复制或伪造业务记录：

| Feed 类型 | 来源 | 分类 Tab | 点击目的地 |
| --- | --- | --- | --- |
| 活动通知 | `/api/notifications` 中通过白名单验证的 `/events/:id` 目标或 `event_import` 来源 | 活动 | 现有活动详情 |
| 待办通知 | `/api/notifications` 中通过白名单验证的 `/tasks/:id` 目标 | 待办 | 现有待办详情 |
| 人脉通知 | 真实 relationship conversation、联系人目标或邮件/日历关系信号 | 人脉 | 对话详情、联系人详情或现有信号确认区 |
| IORBIT 通知 | 无业务实体目标的受信 system/proactive 通知，或明确的 AI 目标 | 仅“全部” | 已有白名单目标或本页已有投递详情 |

默认页隐藏旧“写消息”入口以匹配批准画面，但不删除功能：带 contact/participant seed 的定向 compose、对话详情回复、草稿预览、隐私控制和 push delivery 深链继续使用既有路径。会话行归入“人脉”，点击仍打开 `/inbox/:conversationId`。

## 数据与状态

新增 App 私有 `inbox-feed` 适配器，消费已经验证的 conversation、notification 和 relationship signal 响应，输出统一 `InboxFeedItem[]`。适配器不修改高风险共享函数 `relationshipAlertsToView`，以免连带首页角标和 AI 页面。

```ts
export type InboxFeedCategory = "activity" | "task" | "contact" | "assistant";

export interface InboxFeedReadAction {
  body: Readonly<Record<string, string>>;
  endpoint: string;
  expected: Readonly<Record<string, string>>;
}

export interface InboxFeedItem {
  category: InboxFeedCategory;
  id: string;
  occurredAt: string;
  read: boolean;
  readAction?: InboxFeedReadAction;
  subtitle: string;
  targetHref?: string;
  title: string;
}
```

排序使用经过验证的 ISO 时间降序，再以稳定 `category + id` 排序消除同时间抖动。只有带有效时间的条目才能进入“最近 30 天”结果；未来目标到期时间不能伪装成通知发生时间。若当前 API 没有可信发生时间，该条目仍可显示，但页面不得显示“最近 30 天”的完成声明。

## 全部已读

“全部已读”只处理当前快照中 `read === false` 且具有 `readAction` 的条目：通知调用现有 `/api/notifications/:id/state`，对话调用现有 `/api/relationship-communication/conversations/:id/read`。使用固定并发上限 4，逐条验证回执；完成后触发已有 message-state invalidation 并重新读取所有来源。

不存在或无法验证的已读能力不做乐观更新。部分失败时已确认项目保持已读，失败项目保持未读，并显示“{failed} 条未能标为已读，请重试”。切后台、切账号、离开路由或快照变化后，旧批次不得更新当前页面。

## 异常与无障碍

- 三个来源独立加载；一个来源失败不遮蔽其他已成功条目，失败来源显示行内错误和重试。
- 所有来源均失败时使用现有 `ErrorState`；真实空列表使用现有空态组件。
- Tab、返回、全部已读和每个列表行的点击目标至少 44×44pt。
- Dynamic Type 到“较大”档时，时间移到下一行或右下，正文不能裁切；VoiceOver 标签读出标题、来源、时间、未读状态和目的地类型。
- 中、日、英三语使用现有 locale 系统；业务原文保持 literal，不翻译用户或 provider 内容。

## 风险与边界

GitNexus 预检：`RelationshipInboxScreen`、`InboxContent`、`createNotificationsGetHandler` 与 `createNotificationInteractionService` 为 LOW；`relationshipAlertsToView` 为 HIGH，包含 4 个直接消费者并影响 `AiScreen` 流程。因此本 Sprint 默认不修改 `relationshipAlertsToView`。若 RED 证明必须修改，E 线须先报告 HIGH 风险并覆盖 `useRelationshipInboxBadgeCount`、`AiScreen` 和相关回归。

本 Sprint 不新增 provider、不发送外部消息、不自动确认关系信号、不改变通知生成策略、不迁移数据库、不修改 Web 收件箱外观。Web 源码只有在 App 现有 API 无法实现已批准行为且测试明确证明时才可窄改；一旦修改，必须重新生产构建并重启 Web 服务。
