# 页面目录

每个页面／关键状态对应一张独立 PNG 和一份单页说明，不是多页拼图，也不是已实现的 App 截图。首页为已批准原图，其余为 02/03 融合设计参考。先读 [Claude Design 任务说明](CLAUDE_DESIGN_BRIEF.md)，再逐页查看。功能和权限以文字规格为准。

## 首页

| ID | 页面 | 图片 | 路由／状态 | 实现标记 |
| --- | --- | --- | --- | --- |
| P01 | [首页](pages/01-home-approved.md) | [独立 PNG](screens/01-home-approved.png) | `/home` | 已确认首页 |

## 认证与资料补全

| ID | 页面 | 图片 | 路由／状态 | 实现标记 |
| --- | --- | --- | --- | --- |
| P02 | [登录](pages/02-login.md) | [独立 PNG](screens/02-login.png) | `/account/login` | 现有 |
| P03 | [创建账号](pages/03-signup.md) | [独立 PNG](screens/03-signup.png) | `/account/signup` | 现有 |
| P04 | [找回密码](pages/04-forgot-password.md) | [独立 PNG](screens/04-forgot-password.png) | `/account/forgot-password` | 现有 |
| P05 | [重置密码](pages/05-reset-password.md) | [独立 PNG](screens/05-reset-password.png) | `/account/reset-password` | 现有 |
| P06 | [补全基本资料](pages/06-profile-completion.md) | [独立 PNG](screens/06-profile-completion.png) | `/profile（补全状态，非新增已存在路由）` | 设计建议 · B1/D2 |

## 人脉与名片

| ID | 页面 | 图片 | 路由／状态 | 实现标记 |
| --- | --- | --- | --- | --- |
| P07 | [人脉列表](pages/07-contacts.md) | [独立 PNG](screens/07-contacts.png) | `/contacts` | 现有 · 根页新布局 |
| P08 | [人脉详情](pages/08-contact-detail.md) | [独立 PNG](screens/08-contact-detail.png) | `/contacts/[id]` | 现有＋D7后期目标 |
| P09 | [编辑人脉资料](pages/09-contact-edit.md) | [独立 PNG](screens/09-contact-edit.png) | `/contacts/[id]（编辑状态，路由形态待确认）` | 设计建议 · B4/B8 |
| P10 | [添加人脉](pages/10-add-contact.md) | [独立 PNG](screens/10-add-contact.png) | `/contacts/new` | 现有＋资料备注分工目标 |
| P11 | [批量导入名片](pages/11-card-import-start.md) | [独立 PNG](screens/11-card-import-start.png) | `/contacts/new/batch2` | 现有 |
| P12 | [名片复核](pages/12-card-review.md) | [独立 PNG](screens/12-card-review.png) | `/contacts/new/batch2/[id]` | 现有＋B5双面目标 |
| P13 | [批量名片复核](pages/13-card-batch-legacy.md) | [独立 PNG](screens/13-card-batch-legacy.png) | `/contacts/new/batch/[id]` | 现有 · 兼容链路 |
| P14 | [导入进度](pages/14-contact-import-progress.md) | [独立 PNG](screens/14-contact-import-progress.png) | `/contacts/new/import/[id]（当前缺失）` | 待实现 · B5 |
| P15 | [人脉分析](pages/15-contact-analysis.md) | [独立 PNG](screens/15-contact-analysis.png) | `/contacts/dashboard` | 现有＋D3设计建议 |
| P16 | [人脉结构明细](pages/16-contact-structure-detail.md) | [独立 PNG](screens/16-contact-structure-detail.png) | `/contacts/analysis/[dimension]/[bucketId]` | 现有 |
| P17 | [引荐准备](pages/17-introduction-preparation.md) | [独立 PNG](screens/17-introduction-preparation.png) | `/contacts/intros` | 现有 · 受外发边界约束 |
| P18 | [关系进展](pages/18-relationship-progress.md) | [独立 PNG](screens/18-relationship-progress.png) | `/contacts/pipeline` | 现有 · D4入口处理待确认 |

## 活动参与

| ID | 页面 | 图片 | 路由／状态 | 实现标记 |
| --- | --- | --- | --- | --- |
| P19 | [活动发现](pages/19-events.md) | [独立 PNG](screens/19-events.png) | `/events` | 现有＋发现入口设计建议 |
| P20 | [活动详情](pages/20-event-detail.md) | [独立 PNG](screens/20-event-detail.png) | `/events/[id]` | 现有 |
| P21 | [活动报名](pages/21-event-registration.md) | [独立 PNG](screens/21-event-registration.png) | `/events/[id]/register` | 现有 · B2完善 |
| P22 | [报名结果](pages/22-registration-result.md) | [独立 PNG](screens/22-registration-result.png) | `/events/[id]/register（结果状态）` | 现有结果语义＋设计状态 |
| P23 | [参会者](pages/23-event-attendees.md) | [独立 PNG](screens/23-event-attendees.png) | `/events/[id]/attendees` | 现有 · 权限敏感 |
| P24 | [活动中心](pages/24-event-center.md) | [独立 PNG](screens/24-event-center.png) | `/events/center` | 现有 |
| P25 | [主办方主页](pages/25-organizer-public.md) | [独立 PNG](screens/25-organizer-public.png) | `/o/[slug]` | 现有 · 兼容解析需保留 |

## 待办与日程

| ID | 页面 | 图片 | 路由／状态 | 实现标记 |
| --- | --- | --- | --- | --- |
| P26 | [待办列表](pages/26-tasks.md) | [独立 PNG](screens/26-tasks.png) | `/tasks` | 现有 |
| P27 | [待办详情](pages/27-task-detail.md) | [独立 PNG](screens/27-task-detail.png) | `/tasks/[id]` | 现有＋APP-11编辑目标 |
| P28 | [日历（日）](pages/28-calendar-day.md) | [独立 PNG](screens/28-calendar-day.png) | `/schedule（日视图）` | 现有 |
| P29 | [日历（周）](pages/29-calendar-week.md) | [独立 PNG](screens/29-calendar-week.png) | `/schedule（周视图）` | 现有 |
| P30 | [日历（月）](pages/30-calendar-month.md) | [独立 PNG](screens/30-calendar-month.png) | `/schedule（月视图）` | 现有 |
| P31 | [编辑日程](pages/31-schedule-edit.md) | [独立 PNG](screens/31-schedule-edit.png) | `/schedule（编辑状态，路由形态待确认）` | 设计建议 · APP-11/B6 |
| P32 | [日程中的活动预览](pages/32-schedule-event-preview.md) | [独立 PNG](screens/32-schedule-event-preview.png) | `/schedule/events/[id]` | 现有 |
| P33 | [今日事项](pages/33-today.md) | [独立 PNG](screens/33-today.png) | `/today` | 现有 |
| P34 | [联系跟进](pages/34-followups.md) | [独立 PNG](screens/34-followups.png) | `/followups` | 现有 |

## 收件箱与消息

| ID | 页面 | 图片 | 路由／状态 | 实现标记 |
| --- | --- | --- | --- | --- |
| P35 | [收件箱](pages/35-inbox.md) | [独立 PNG](screens/35-inbox.png) | `/inbox` | 现有＋APP-13统一入口目标 |
| P36 | [收件箱详情／邮件草稿](pages/36-inbox-thread.md) | [独立 PNG](screens/36-inbox-thread.png) | `/inbox/[id]` | 现有 · 区分草稿与消息 |
| P37 | [站内聊天列表](pages/37-chat-list.md) | [独立 PNG](screens/37-chat-list.png) | `/chat` | 现有 · B4资格 |
| P38 | [站内聊天](pages/38-chat-detail.md) | [独立 PNG](screens/38-chat-detail.png) | `/chat/[id]` | 现有 · B4资格 |

## IORBIT

| ID | 页面 | 图片 | 路由／状态 | 实现标记 |
| --- | --- | --- | --- | --- |
| P39 | [IORBIT 新会话与历史](pages/39-iorbit-home.md) | [独立 PNG](screens/39-iorbit-home.png) | `/ai` | 现有＋APP-01全屏入口目标 |
| P40 | [IORBIT 会话](pages/40-iorbit-conversation.md) | [独立 PNG](screens/40-iorbit-conversation.png) | `/ai/[id]` | 现有＋B3稳定性目标 |
| P41 | [IORBIT 选择人脉](pages/41-iorbit-mention-picker.md) | [独立 PNG](screens/41-iorbit-mention-picker.png) | `/ai/[id]（引用选择状态）` | 设计建议 · APP-05/B3 |

## 我的与设置

| ID | 页面 | 图片 | 路由／状态 | 实现标记 |
| --- | --- | --- | --- | --- |
| P42 | [我的资料](pages/42-profile.md) | [独立 PNG](screens/42-profile.png) | `/profile` | 现有 · 根页新布局 |
| P43 | [编辑我的资料](pages/43-profile-edit.md) | [独立 PNG](screens/43-profile-edit.png) | `/profile（编辑状态）` | 现有＋D2设计建议 |
| P44 | [账号与工作区](pages/44-account.md) | [独立 PNG](screens/44-account.png) | `/account` | 现有 |
| P45 | [权限中心](pages/45-permissions.md) | [独立 PNG](screens/45-permissions.png) | `/account/permissions` | 现有 |
| P46 | [设置](pages/46-settings.md) | [独立 PNG](screens/46-settings.png) | `/settings` | 现有＋D6偏好设计建议 |
| P47 | [服务器设置](pages/47-server-settings.md) | [独立 PNG](screens/47-server-settings.png) | `/settings/api` | 现有 · 低频配置 |

## 未来笔记

| ID | 页面 | 图片 | 路由／状态 | 实现标记 |
| --- | --- | --- | --- | --- |
| P48 | [笔记列表](pages/48-notes-list.md) | [独立 PNG](screens/48-notes-list.png) | `建议 /notes（当前不存在）` | 后期 · D7/APP-16/B8 |
| P49 | [笔记原文](pages/49-note-detail.md) | [独立 PNG](screens/49-note-detail.png) | `建议 /notes/[id]（当前不存在）` | 后期 · D7/APP-16/B8 |
| P50 | [编辑笔记](pages/50-note-edit.md) | [独立 PNG](screens/50-note-edit.png) | `建议 /notes/[id]/edit（当前不存在）` | 后期 · D7/APP-16/B8 |
| P51 | [笔记选择相关人脉](pages/51-note-contact-picker.md) | [独立 PNG](screens/51-note-contact-picker.png) | `笔记编辑中的选择状态（当前不存在）` | 后期 · D7/APP-16/B8 |

## 活动运营与现场

| ID | 页面 | 图片 | 路由／状态 | 实现标记 |
| --- | --- | --- | --- | --- |
| P52 | [活动运营台](pages/52-event-operations.md) | [独立 PNG](screens/52-event-operations.png) | `/events/[id]/operations` | 现有 · 角色敏感 |
| P53 | [报名审核](pages/53-admission-review.md) | [独立 PNG](screens/53-admission-review.png) | `/events/[id]/operations/admission` | 现有 · 角色敏感 |
| P54 | [签到台](pages/54-event-checkin.md) | [独立 PNG](screens/54-event-checkin.png) | `/events/[id]/operations/check-in` | 现有 · 角色敏感 |
| P55 | [活动角色](pages/55-event-roles.md) | [独立 PNG](screens/55-event-roles.png) | `/events/[id]/operations/roles` | 现有 · 角色敏感 |
| P56 | [报名体验](pages/56-registration-experience.md) | [独立 PNG](screens/56-registration-experience.png) | `/events/[id]/operations/experience` | 现有 · 角色敏感 |
| P57 | [活动分析](pages/57-event-analytics.md) | [独立 PNG](screens/57-event-analytics.png) | `/events/[id]/analytics` | 现有 · 角色敏感 |
| P58 | [现场模式](pages/58-party.md) | [独立 PNG](screens/58-party.png) | `/party` | 现有 · 需eventId或code |
| P59 | [我的签到状态](pages/59-party-checkin.md) | [独立 PNG](screens/59-party-checkin.png) | `/party/checkin` | 现有 · 需eventId或code |
| P60 | [现场关系图](pages/60-party-graph.md) | [独立 PNG](screens/60-party-graph.png) | `/party/graph` | 现有 · 需eventId或code |

## 管理与兼容

| ID | 页面 | 图片 | 路由／状态 | 实现标记 |
| --- | --- | --- | --- | --- |
| P61 | [主办方后台概览](pages/61-admin-dashboard.md) | [独立 PNG](screens/61-admin-dashboard.png) | `/admin` | 现有 · 核对与跳转 |
| P62 | [访问管理](pages/62-admin-access.md) | [独立 PNG](screens/62-admin-access.png) | `/admin/access` | 现有 · 核对与跳转 |
| P63 | [后台活动管理](pages/63-admin-events.md) | [独立 PNG](screens/63-admin-events.png) | `/admin/events` | 现有 · 核对与跳转 |
| P64 | [管理入口登录](pages/64-admin-login.md) | [独立 PNG](screens/64-admin-login.png) | `/login-admin` | 现有 · 不等于授权 |
| P65 | [平台总览](pages/65-platform.md) | [独立 PNG](screens/65-platform.png) | `/platform` | 现有 · 只读边界 |
| P66 | [活动邀请入口](pages/66-event-invitation.md) | [独立 PNG](screens/66-event-invitation.png) | `/register/[code]` | 现有 · public |
| P67 | [建议动作](pages/67-agent-actions.md) | [独立 PNG](screens/67-agent-actions.png) | `/agent` | 现有 · 非AI主会话页 |
| P68 | [全部行动](pages/68-all-actions.md) | [独立 PNG](screens/68-all-actions.png) | `/contacts/all-actions` | 现有 |
| P69 | [工作区总览](pages/69-dashboard.md) | [独立 PNG](screens/69-dashboard.png) | `/dashboard` | 现有 · 兼容工作台 |
| P70 | [推荐活动](pages/70-recommended-events.md) | [独立 PNG](screens/70-recommended-events.png) | `/home/events` | 现有 · 兼容入口 |
| P71 | [人脉搜索结果](pages/71-contacts-search-list.md) | [独立 PNG](screens/71-contacts-search-list.png) | `/contacts/list` | 现有 · 二级列表 |
| P72 | [未指定活动的邀请入口](pages/72-invitation-empty.md) | [独立 PNG](screens/72-invitation-empty.png) | `/register` | 现有 · 空态 |

## 路由覆盖说明

当前基线有 63 个非布局路由文件；图片数与路由数不同，同一路由的编辑、结果、选择及日／周／月状态分别出图。P14 导入进度和 P48–P51 笔记尚待实现。

| 别名／跳转文件 | 现状与映射 |
| --- | --- |
| `app/index.tsx` | 当前入口按认证等逻辑选择目标；新首页 P01，未登录 P02 |
| `app/home.tsx` | 当前重定向 /ai；目标设计 P01，改路由属于后续实施 |
| `app/account/mobile-google.tsx` | 认证回调／回登录，共用 P02 认证状态 |
| `app/contacts/graph.tsx` | 当前绑定 ContactsDashboardScreen，共用 P15；未绑定的图组件不当成现有页 |
| `app/[...legacy].tsx` | 按旧路径解析到目标，不新增空壳业务页 |

完整覆盖映射见 [路由核对记录](ROUTE_COVERAGE.json)。

