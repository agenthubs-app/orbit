# 开发动态子界面清单

来源：[动态路由源码](</Users/li/work/orbit/repos/orbits/app/dev/capabilities/[slug]/page.tsx>)。共有 48 个显式 `slug === ...` 映射，另有通用 `app-scaffold` 演示；未知 slug 返回 Missing capability demo，不尝试调用未知 provider。

以下地址均以 `/dev/capabilities/` 为前缀。它们是开发/模拟能力画面，不代表正式 Web 已提供相同业务功能。每个 debug-view 的原始分区、控件与文案已经随静态可达源码列入各业务域分卷（入口标为 `/dev/capabilities/[slug]`）。

| slug | 用途/功能 | 明细域 |
| --- | --- | --- |
| capability-debug-dashboard | 能力、scenario、API probes、reset 与来源边界总面板 | [09-dev](09-dev.md) |
| mock-account-session | 模拟账户/会话状态 | [01-entry-shell](01-entry-shell.md) |
| profile-onboarding-and-manual-profile-editor | 画像引导与手动编辑模拟 | [08-profile-settings-admin](08-profile-settings-admin.md) |
| profile-document-extraction-mock | 文档提取草稿模拟 | [08-profile-settings-admin](08-profile-settings-admin.md) |
| profile-signal-review-queue | 画像信号待审队列 | [08-profile-settings-admin](08-profile-settings-admin.md) |
| permission-state-and-staged-authorization-mock | 分阶段授权/权限状态 | [01-entry-shell](01-entry-shell.md) |
| sensitive-action-confirmation-guard | 敏感操作确认门禁 | [01-entry-shell](01-entry-shell.md) |
| contact-acquisition-draft-pipeline | 联系人获取草稿管线 | [01-entry-shell](01-entry-shell.md) |
| manual-contact-creation-mock | 手动创建联系人模拟 | [01-entry-shell](01-entry-shell.md) |
| business-card-scan-ocr-mock | OCR 识别模拟 | [01-entry-shell](01-entry-shell.md) |
| business-card-review-and-confirm-flow | 名片审核确认模拟 | [01-entry-shell](01-entry-shell.md) |
| qr-scan-connect-mock | QR 连接模拟 | [01-entry-shell](01-entry-shell.md) |
| event-attendee-import-mock | 活动名单导入模拟 | [01-entry-shell](01-entry-shell.md) |
| event-crud-and-import-mock | 活动 CRUD/导入模拟 | [05-events](05-events.md) |
| attendee-roster | 参会名单模拟 | [05-events](05-events.md) |
| want-connect | 现场想认识/联系意图 | [05-events](05-events.md) |
| encounter-note | 活动交流笔记模拟 | [05-events](05-events.md) |
| goal-readiness | 活动目标/准备程度 | [05-events](05-events.md) |
| external-contacts-import-mock | 外部联系人导入模拟 | [01-entry-shell](01-entry-shell.md) |
| email-and-calendar-relationship-signal-mock | 邮件/日历关系信号模拟 | [01-entry-shell](01-entry-shell.md) |
| referral-and-recommended-contact-confirm-mock | 引荐/推荐联系人确认模拟 | [01-entry-shell](01-entry-shell.md) |
| duplicate-detection-and-merge-mock | 重复检测/合并模拟 | [01-entry-shell](01-entry-shell.md) |
| contacts-list-search-and-filter-mock | 人脉列表/搜索/过滤模拟 | [03-contacts](03-contacts.md) |
| contact-detail-tag-and-status-mock | 人脉详情/标签/状态模拟 | [03-contacts](03-contacts.md) |
| connection-and-evidence-service-mock | 连接与证据服务模拟 | [01-entry-shell](01-entry-shell.md) |
| relationship-stage-and-profile-mock | 关系阶段/画像模拟 | [01-entry-shell](01-entry-shell.md) |
| relationship-value-scoring-mock | 关系价值评分模拟 | [01-entry-shell](01-entry-shell.md) |
| relationship-natural-search-mock | 自然语言关系检索模拟 | [01-entry-shell](01-entry-shell.md) |
| event-recommendation-and-opening-line-mock | 活动推荐/开场白模拟 | [01-entry-shell](01-entry-shell.md) |
| event-value-recommendation-mock | 活动价值推荐模拟 | [01-entry-shell](01-entry-shell.md) |
| post-event-review | 会后联系人复盘模拟 | [05-events](05-events.md) |
| followup-task-generation-mock | 跟进任务生成模拟 | [01-entry-shell](01-entry-shell.md) |
| message-draft-generator-mock | 消息草稿模拟 | [01-entry-shell](01-entry-shell.md) |
| reminder-schedule-and-notification-mock | 提醒/日程通知模拟 | [01-entry-shell](01-entry-shell.md) |
| chat-conversation-and-message-mock | 会话/消息模拟 | [07-schedule-tasks-chat](07-schedule-tasks-chat.md) |
| chat-writing-assist-mock | 写作辅助模拟 | [07-schedule-tasks-chat](07-schedule-tasks-chat.md) |
| chat-summary-and-extraction-mock | 会话总结/提取模拟 | [07-schedule-tasks-chat](07-schedule-tasks-chat.md) |
| chat-privacy-controls-mock | 会话隐私控制模拟 | [07-schedule-tasks-chat](07-schedule-tasks-chat.md) |
| dashboard-aggregate-mock | 综合 dashboard 模拟 | [05-events](05-events.md) |
| network-distribution-analytics-mock | 网络分布分析模拟 | [05-events](05-events.md) |
| opportunity-reminder-analytics-mock | 机会/提醒分析模拟 | [05-events](05-events.md) |
| agent-action-queue-mock | agent 操作队列模拟 | [02-ai](02-ai.md) |
| agent-autonomy-settings-mock | agent 自主权限模拟 | [02-ai](02-ai.md) |
| external-action-sandbox-mock | 外部动作沙盒 | [02-ai](02-ai.md) |
| source-consistency-and-provenance-audit | 来源一致性/可追溯审计 | [01-entry-shell](01-entry-shell.md) |
| app-bootstrap-mock-aggregator | app bootstrap 聚合模拟 | [01-entry-shell](01-entry-shell.md) |
| ai-provider-mock-and-provenance-boundary | AI provider 模拟与来源边界 | [01-entry-shell](01-entry-shell.md) |
| mock-data-mutation-reset-and-scenario-switcher | mock 变更/重置/场景选择 | [01-entry-shell](01-entry-shell.md) |
| app-scaffold | 注册表、mock probe、live guard 基础演示 | [09-dev](09-dev.md) |

注意：slug 必须以源码常量为准，本表的「明细域」仅是阅读定位。动态路由不应按一条 URL 模板算成只有一个内容画面。
