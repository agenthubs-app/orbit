# 功能对齐表

基线日期：2026-09-07。Web 文件路径从 `repos/orbits` 起，App 文件路径从 `repos/orbit-app` 起。Web 页面路径统一在 `app/(app)/app/` 下。这里按行为比较，允许不同的导航和布局。

状态含义：`已接入·待联验` = 源码存在消费/写入链路，未完成本轮双端业务验收；`存在差异` = 源码确认覆盖或语义不同；`平台特有` = 平台实现不同，不自动列为缺陷。**当前没有任何一行被本轮认定为完整业务 verified。**

| 能力 | Web 现状 | App 现状 | 对齐状态 / 下一步 |
| --- | --- | --- | --- |
| 登录/身份 | Auth.js/NextAuth、canonical actor 解析、移动 credentials/Google bridge | 密码和 Google bridge、SecureStore 会话、401 清理 | 已接入·待联验；同账号 actor/权限、公私入口和切换账号验收 |
| AI 问答 | `agent/orbit-real-agent.tsx` 调用 AI conversations，支持 artifacts/actions | `AiConversationScreen.tsx` 调用相同会话边界，映射联系人/活动/任务信息 | 已接入·待联验；逐类核对响应与可执行动作，不以正文一致替代 |
| AI 历史 | 历史读取、续聊、删除、改名、置顶 | 读取 Web sessions、续聊写回、删除；展示置顶状态，未发现改名/置顶写入口 | 存在差异 BR-003；另验旧会话跨端续聊不丢消息 |
| Today | `today/today-page-content.tsx` 汇总账本、关系安排、跟进日程，分区降级 | `TodayScreen.tsx` 读 `/api/today`，任务创建/完成、建议接受，账本在 all-actions | 存在差异 BR-001；同名页不等于同一业务集合 |
| 行动账本 | all-actions 与 Today 消费 Agent Ledger，确认/推迟等状态转换 | `AgentLedgerScreen.tsx` 消费 `/api/agent/ledger` 与 transition | 已接入·待联验；App wire types 仍单独维护，见 BR-004 |
| 任务/日程/提醒 | tasks、schedule-items、reminders、today 服务/API及 Web 日程组合 | Today/Tasks/TaskDetail/Schedule 和本地通知适配 | 已接入·待联验；同 ID、时区、取消状态与另一端回读 |
| 联系人/资料 | contacts/profile 服务、手动编辑、来源与资料提取 | ContactDetail/Profile 支持行业、资料等受支持字段写入 | 已接入·待联验；核对字段丢失、枚举、账号归属 |
| 人脉分析 | Web route model 组合 contacts/dashboard 服务 | `ContactsDashboardScreen.tsx` 消费 `/api/mobile/contacts-dashboard`，四维圆盘与详情 | 已接入·待联验；共享 Schema 的定向检查通过，需同数据核对口径 |
| 图谱/关系进展/引荐 | connections、evidence、stage 与邀请服务 | ContactsGraph/ContactPipeline/ContactIntros 对接相应接口 | 已接入·待联验；区分保存草稿、更新状态与真实发送 |
| 名片/外部导入 | contact-drafts 与 contacts/business-card/confirm 等服务 | 相机/图片/二维码输入、草稿复核和确认边界 | 已接入·待联验；确认后回读同联系人，不能把草稿当正式联系人 |
| 活动发现/详情/报名 | events/public、活动访问、问答/画像、报名与取消 | Events/EventDetail/EventRegistration；支持报名和取消写入 | 已接入·待联验；截止时间、活动 ID、权限、版本和取消结果 |
| 活动运营 | event-operations API、生成/发布/重试及 worker | EventOperations 页面 POST 生成/重试/发布；活跃任务 3 秒轮询 | 已接入·待联验；不是只读移动页，需 worker 与权限场景 |
| 报名审核 | admission review 列表/详情/decision | EventAdmissionReview 页面，决策携带 expectedApplicationVersion | 已接入·待联验；并发审批与 409 冲突处理 |
| 签到 | operations/check-ins API 与现场运营界面 | EventCheckIn 页面可 POST 标记到场 | 已接入·待联验；与旧 party/checkin 页面区分，验证重复签到 |
| 活动角色/分析 | access roles/assignment 与 analytics | EventRoles 读/授予/修改/撤销角色，携带 expectedRevision；EventAnalytics 读取 | 已接入·待联验；负责人不可降级、撤权后两端访问一致 |
| 收件箱/关系聊天 | chat/inbox/privacy/signals、回复草稿与辅助改写 | RelationshipInbox / RelationshipChatDetail 消费这些边界 | 已接入·待联验；草稿/正式消息、未读及隐私设置分别检查 |
| Agent 高级设置 | Settings 装载 memory、feedback、automations、execution/preferences 管理 | Settings 只有账号/权限/服务器，AgentActions 另有基本 settings | 存在差异 BR-002；不能把基础 Agent 设置当高级管理齐全 |
| 公开组织者/管理入口 | o/[slug]、admin、platform 等路由与服务 | 有相应页面；部分聚合/只读展示 | 已接入·待联验；路由通过不证明管理写操作全面覆盖 |
| 设备能力/主题 | 浏览器交互和 Web 展示 | 相机、SecureStore、SQLite、原生通知、系统深浅色；主题工作未提交 | 平台特有；业务 ID 与动作语义需保持一致，UI 不要求复制 |

## 源码索引

- HTTP 路径：[App endpoints](../repos/orbit-app/src/api/endpoints.ts)；服务端实现按这些路径定位 `repos/orbits/app/api/**/route.ts` 与 `handler.ts`。仅定义 endpoint 常量不证明有页面使用。
- App 页面：[screens](../repos/orbit-app/src/screens)、[view-models](../repos/orbit-app/src/view-models)；活动重点是 `EventRegistrationScreen.tsx`、`EventOperationsScreen.tsx`、`EventAdmissionReviewScreen.tsx`、`EventCheckInScreen.tsx`、`EventRolesScreen.tsx`。
- Web 产品页：[app](../repos/orbits/app/(app)/app)；设置实际装配在 `settings/orbit-settings-content.tsx`，不是只根据文件存在判定已接入。
- Web 服务：[features](../repos/orbits/features)。人脉移动聚合入口：[contacts-dashboard-service.ts](../repos/orbits/features/mobile/contacts-dashboard-service.ts)。
- 43 个 Web 页面和 15 个 App 额外路径的逐项文件清单见 [快照](snapshots/2026-09-07-baseline.json)。额外路径不等于 Web 缺少相应功能。

## 需要纠正的旧认知

1. App 已有活动运营写操作，不能依据 README 的较早段落认定“仅只读”。
2. 共享契约实际有 `tasks.ts`、`reminders.ts`，旧跨端迁移清单没有列全；以目录和同步测试为准。
3. “副本一致”只覆盖已纳入共享目录的文件。Agent Ledger、活动运营等仍有局部 wire shape / unknown 解码，不能宣称所有字段都有跨端编译保护。
4. 本地快照会让页面在断网或刷新失败时继续显示旧数据；这不构成服务端与 App 已实时同步的证据。
