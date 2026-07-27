# iOrbit 成熟产品对标与功能决策 — 2026-07-27

## 产品定位结论

iOrbit 不是通用聊天机器人，也不是销售 CRM。它是连接个人关系、活动、日程、
沟通与确认执行的智能关系操作系统入口：

- 业务页面负责展示一个实体的当前事实、来源、状态和确定性操作；
- 总 Agent 负责跨联系人、活动、日程和跟进的自然语言编排；
- Agent 可以读取和生成建议/草稿，但真实写入必须经过服务端身份、权限、确认、
  幂等、复读和审计边界；
- 不存在真实 provider 时，产品必须显示诚实空态或不可用态，不能以 Mock、
  本地 state 或成功 toast 冒充执行结果。

这与既有的“对话无边界、行动有核心”设计一致，但本次把判断落实到全部生产
页面、共享 Action Ledger、actor-scoped 数据链和按钮覆盖门。

## 官方产品机制对标

研究日期为 2026-07-27。只使用厂商官方产品页、帮助中心或技术文档；结论提炼
机制，不复制界面。

| 产品机制 | 官方证据 | 对 iOrbit 的启示 | 已采用的边界 |
| --- | --- | --- | --- |
| Agent 过程可见、可中断，高影响动作确认 | OpenAI 的 Agent 资料说明任务过程可见、可接管/停止，并在有现实后果的动作前请求许可。[OpenAI：ChatGPT agent](https://openai.com/index/introducing-chatgpt-agent/) | “正在规划”不能等同“已经执行”；用户应随时看见请求状态和确认点。 | Agent 暴露请求/运行阶段；写入进入 Run + Action Ledger；普通聊天不执行动作。 |
| 连接器权限按动作风险分层 | ChatGPT App 权限可配置为总是询问、任何变更询问、重要动作询问等，且不会扩大第三方服务原有权限。[OpenAI：Apps in ChatGPT](https://help.openai.com/en/articles/11487775-apps-in-chatgpt) | 读取、草稿、写入、外部动作不能共用一个模糊开关。 | 工具风险级、每类执行偏好、外部日历权限检查和逐动作确认分离。 |
| AI 只能继承登录用户已有权限 | Microsoft 365 Copilot 的数据访问始终受登录用户权限约束，不能读取用户无权访问的数据。[Microsoft Learn：Copilot architecture](https://learn.microsoft.com/en-us/microsoft-365/copilot/microsoft-365-copilot-architecture) | actor 必须由服务器会话解析并贯穿所有数据源，不能由请求体提供。 | Profile、Contacts、Events、Party、Chat、Acquisition 和 Agent artifact 均采用服务端 actor 边界。 |
| 跨来源回答展示来源并允许限定来源 | Notion AI 可搜索工作区、连接应用与网页，展示咨询过的来源并允许用户选择来源范围。[Notion：Enterprise Search](https://www.notion.com/help/guides/find-answers-and-generate-reports-with-enterprise-search) | 结构化结果必须保留来源、证据和采集时间；无证据时不应生成“确定事实”。 | 卡片 provenance/evidence、真实记录计数、技术来源折叠展示和 fail-closed 空态。 |
| 审批拥有明确的待定/批准/退回/拒绝状态 | Asana Approval 将审批作为任务类型，区分 pending、approved、changes requested、rejected。[Asana：Approvals](https://help.asana.com/s/article/approvals) | 建议、草稿、待确认、执行中、完成、失败要成为领域状态，而非靠文案猜测。 | Action Ledger 状态机、确认/驳回、草稿编辑、运行步骤和可复核结果。 |
| 联系人事实以活动时间线组织 | HubSpot 联系人时间线集中展示并筛选邮件、会议、任务、备注和沟通活动。[HubSpot：Record timelines](https://knowledge.hubspot.com/records/filter-activities-on-a-record-timeline) | 联系人详情应围绕证据和最近/下一活动，不扩展成交易管道。 | Contact Detail 保留来源、关系上下文和行动入口；移除伪造阶段、时间线和保存成功。 |
| 数据丰富必须标明来源、刷新和成本 | Clay 将 source 视为数据进入表格的基础，并在字段/信号层展示来源、覆盖和运行信息。[Clay：Sources](https://university.clay.com/docs/sources)、[Clay：Audiences](https://university.clay.com/docs/audiences) | 导入和 AI 推断不能覆盖原始事实；每条派生值要可追溯并可复核。 | Acquisition draft、evidence、source label、确认后写入和跨 actor 隔离。 |
| 自动排程先处理优先级、期限、可用时间和冲突 | Motion 根据优先级、截止时间、时长和现有日历动态排程，并在无法安排时明确标记。[Motion：Auto-scheduling](https://www.usemotion.com/help/time-management/auto-scheduling) | 在没有可靠冲突检测与写入 provider 前，只能建议或草拟，不能假装已经排入日历。 | Today/Schedule 展示真实状态；外部日历写入默认关闭并受权限、确认和回读约束。 |
| 收件箱依靠状态、分配和批量动作降低认知负担 | Intercom Inbox 明确区分 open/snoozed/closed，并为批量分配、回复、关闭、稍后处理提供真实动作。[Intercom：Inbox](https://www.intercom.com/help/en/articles/6274899-get-started-with-intercom-inbox) | Inbox 必须有可靠消息源和状态写入；仅有 fixture 时应关闭而非混入未读数。 | Live/Hybrid Relationship Inbox 无 provider 时 503 fail closed；Chat 当前保持来源支持的只读工作区。 |
| 通知只覆盖有明确价值的未读活动 | Slack 默认围绕私信、线程回复、提及和关键词通知，并允许用户调整偏好。[Slack：Notifications](https://slack.com/help/articles/360025446073-Guide-to-Slack-notifications-Guide-to-Slack-notifications) | 主动 Agent 只应在错过会有实际代价时提醒，并允许分类开关与免打扰。 | Today/Agent proactive 边界与设置保留；未接真实投递时不制造 badge 或提醒。 |
| 现场签到是权限化、可校验、实时同步的写操作 | Eventbrite Organizer 要求相应角色，扫码后给出确认，对重复/无效票报错并同步签到状态。[Eventbrite：Check-in](https://www.eventbrite.com/help/en-gb/articles/741083/how-to-check-in-attendees-at-the-event-with-eventbrite-organizer/) | 签到不能用计时器和本地 state 模拟；必须绑定活动、票/参会者、操作者和读回状态。 | 伪签到成功已移除；真实 provider、幂等和工作人员权限具备前保持不可用。 |

## 十个产品问题的决定

1. **AI 正在做什么**：用请求状态、运行步骤、工具类型和结果来源说明，不展示
   无意义的内部思维文本。
2. **状态如何区分**：建议、草稿、待确认、执行中、完成、失败是可机读状态；
   toast 只反馈状态变化，不作为执行凭证。
3. **高风险操作如何保护**：服务器身份 → capability 权限 → 草稿预览 → 用户
   确认 → 幂等写入 → 服务端复读 → 审计；任一步缺失即 fail closed。
4. **来源如何展示**：结果卡优先显示用户价值；来源、证据 ID、采集时间和 provider
   放在可展开证据区，技术信息不抢主叙事。
5. **失败/重试/撤销/补偿**：失败保留原实体和输入；重试使用真实 canonical
   route；写操作需幂等，未来不可逆动作必须有补偿策略，不能用 Mock 恢复。
6. **如何避免重复 Agent 入口**：页面只提供携带结构化实体上下文的“Ask Agent”
   入口；跨域编排集中在 `/app/agent`，不在每页复制聊天产品。
7. **页面与总 Agent 如何分工**：页面拥有事实和单实体动作；Agent 拥有跨实体
   发现、解释、草稿和编排，但不绕过业务服务。
8. **真正提升体验的能力**：证据化找人/找活动、会前准备、会后跟进、统一 Today、
   真实联系人采集、可确认 Action Ledger。
9. **当前应暂缓的能力**：全自动外发、CRM 成交管道、无证据关系评分、全场录音、
   没有冲突模型的自动排程和没有 provider 的批量运营动作。
10. **必须先补的架构**：稳定 actor/实体 ID、权限、来源与证据、外部连接健康检查、
    幂等写入、复读、撤销/补偿和审计。

## 功能决策表

| 分类 | 功能决定 | 用户价值 | 依赖 | 主要风险 | 复杂度 | 优先级 / 当前状态 |
| --- | --- | --- | --- | --- | --- | --- |
| 必须保留 | Agent 跨人脉、活动、日程、跟进的自然语言入口 | 降低跨页面检索与编排成本 | Conversation provider、actor context、artifact services | 无来源时过度承诺 | 高 | P0，已保留并真实验证 |
| 必须保留 | 业务页面 canonical route + 精确实体上下文 | 防止看错人、错活动、错会话 | 统一 ID、route adapters | 身份混用导致跨实体读写 | 中 | P0，已统一 |
| 必须保留 | 来源、证据、更新时间和真实记录计数 | 让推荐可验证 | provenance/evidence contracts | 技术信息喧宾夺主 | 中 | P0，已保留并折叠呈现 |
| 必须保留 | Action Ledger 的草稿、确认、执行和审计状态 | 用户知道动作是否真的发生 | runtime、ledger、writer readback | 重复写入和假成功 | 高 | P0，已建立 |
| 必须补齐 | 所有 Live 数据源的服务端 actor 传递 | 隐私隔离和结果准确 | Auth.js、actor-aware factories | 跨账号泄露或假空态 | 高 | P0/P1，本轮已补齐 |
| 必须补齐 | 关键空态、失败态和恢复链接 | 失败时仍能安全继续 | shared StateView、canonical href | 死按钮、Mock 回退 | 中 | P0，本轮已补齐 |
| 必须补齐 | 真实 Profile 保存与采集草稿确认 | 用户资料和新联系人可持续使用 | live store、readback、duplicate checks | 本地成功冒充持久化 | 高 | P0，本轮已补齐 |
| 应该优化 | Agent 请求状态、可访问名称、触控尺寸和隐私提示 | 提升可理解性与移动可用性 | shared UI contracts | 双响应树漂移 | 低 | P1，本轮已优化 |
| 应该优化 | Today/Chat/Contacts 的信息密度和状态筛选 | 更快完成日常关系工作 | source-backed view models | 重新堆成仪表盘噪音 | 中 | P1，已优化核心路径 |
| 应该优化 | Agent 结果的本地化与技术来源层级 | 中文用户先看到结论和理由 | localization boundary | 翻译重复、技术 ID 被误译 | 低 | P1，本轮已优化 |
| 应该合并 | `/app/register` 合并到 canonical Event registration | 避免两套报名真假不一 | code/slug resolver、redirect | 旧链接丢失上下文 | 中 | P0，已合并为重定向 |
| 应该合并 | Schedule 导航与 Today 时间线 | 一个可信的每日工作入口 | canonical route mapping | 同一任务多状态 | 中 | P1，已统一到 Today 边界 |
| 应该合并 | 页面内零散写操作进入 Action Ledger | 一个确认、权限和审计模型 | capability adapters | 页面绕过 ledger | 高 | P0，已建立共享边界 |
| 应该移除 | 无 handler 的按钮、通用“成功”兜底和假 composer | 消除误导和信任损失 | 静态扫描、交互测试 | 删除真实入口 | 低 | P0，本轮已移除/替换 |
| 应该移除 | 生产路由自动 Mock 回退与 fixture badge | 防止演示数据冒充用户事实 | mode boundary、fail-closed | 空态变多 | 中 | P0，本轮已移除 |
| 应该移除 | 本地计时器签到、前端 moderation 成功、GET 写入 | 避免不可追溯副作用与假成功 | 真实 writer、POST、auth | 关键操作暂不可用 | 中 | P0，本轮已移除 |
| 暂缓实现 | CRM 成交管道、群发营销和自动外发消息 | 保持活动关系闭环聚焦 | 合规、退订、送达、审计 | 伤害真实关系、范围失控 | 高 | P2，明确不做/暂缓 |
| 暂缓实现 | 全自动日程重排与冲突优化 | 避免无完整约束时错误改历 | 双向 calendar、冲突模型、补偿 | 覆盖用户安排 | 高 | P2，先维持建议/确认 |
| 暂缓实现 | 全场录音和无同意的联系人采集 | 保护隐私与活动方利益 | consent、ASR、身份解析 | 法律与身份误判 | 高 | P0 风险，永久不做当前方案 |
| 依赖外部集成后实现 | 密码重置邮件/令牌闭环 | 用户可自助恢复账号 | 邮件 provider、短期 token、限流、审计 | 账号接管 | 高 | 外部依赖；当前诚实不可用 |
| 依赖外部集成后实现 | Google/Microsoft Calendar 真实写入 | 把确认后的关系行动落到日程 | OAuth scopes、健康检查、idempotency、readback | 错写/重复写 | 高 | 外部依赖；默认关闭 |
| 依赖外部集成后实现 | Party 真实签到和场内凭证 | 现场闭环与可靠到场状态 | attendee/ticket provider、staff role、device sync | 冒名/重复签到 | 高 | 外部依赖；当前诚实不可用 |
| 依赖外部集成后实现 | 平台审核、邀请、导出与联系人阶段写入 | 运营和关系维护闭环 | authenticated writers、notification receipt、audit | 越权与假成功 | 高 | 外部/后端依赖；当前只读或移除 |

## 验收映射

- 生产页面与动作总量：`product-surface-manifest.md`、
  `button-action-coverage.md`。
- 真实缺陷、证据、修复状态和后续约束：`confirmed-risk-register.md`。
- 桌面/移动、API、数据库、DeepSeek 和构建证据：
  `runtime-verification-log.md`。
- 当前全量测试基线：`test-baseline-2026-07-27.md`。
- Agent 的长期定位与“不做清单”：
  `../superpowers/specs/2026-07-11-orbit-ai-positioning-boundary-design.md`。
