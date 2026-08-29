# Orbit

Orbit is a relationship-management product centered on an agent that helps users prepare for, act during, and follow up after relationship moments.

## Language

### User-facing relationship language

**人脉**:
用户已建立、正在建立或希望建立的职业关系，以及围绕这些关系保存的背景和行动。
_Avoid_: 关系工作台、人脉工作台

**关系进展**:
一段人脉关系当前所处的阶段，例如推进中、长期维护、暂不推进或已合作。关系进展不表示用户此刻是否需要采取行动。
_Avoid_: 跟进管线、关系管线、在推进

**行动状态**:
用户当前是否需要对某位联系人采取行动，例如需要联系。行动状态与关系进展是两个独立维度；一位处于推进中或长期维护的联系人都可能同时需要联系。
_Avoid_: 把待联系、推进中、培养中放在同一个状态序列中

**需要联系**:
行动状态之一，表示用户当前需要联系这位联系人；不表示关系处于哪个阶段。
_Avoid_: 将待联系作为关系进展阶段

**待办**:
用户接下来需要完成的具体事项。待办可以独立存在，也可以关联联系人、会面、活动、工作或个人生活。
_Avoid_: 跟进队列、只把关系行动称为待办

**待办事项**:
一项等待用户处理、可以被完成或取消的明确行动。
_Avoid_: 跟进任务、跟进事项

**待办建议**:
Orbit 根据人脉、会面、活动、消息或日程背景提出、尚未被用户确认为待办事项的行动建议。
_Avoid_: 候选跟进、新生成的跟进

**事项形态**:
一个事项是待办还是日程。待办表示需要完成的行动；日程表示在具体时间发生的安排。事项形态决定交互和状态模型。
_Avoid_: 用事项类别决定是否可以勾选完成

**事项类别**:
帮助用户和 Orbit AI 理解事项所处场景的单选分类，包括人脉、会面、活动、工作、个人和其他。类别不改变事项是待办还是日程。
_Avoid_: 来源、关联对象、事项形态

**人脉待办**:
与联系人或人脉关系关联的待办筛选结果，不是独立的数据实体。
_Avoid_: 关系待办、把所有待办都称为人脉待办

**日程**:
在明确时间段发生的安排，例如会面、活动参加或个人预约。日程没有完成状态。
_Avoid_: 把日程复制成可勾选的待办

**已完成**:
待办状态之一，表示用户确认这项行动已经完成。完成后仍保留在历史记录中，也可以恢复为待处理。
_Avoid_: 已结束、自动根据时间推断完成

**已结束**:
日程的派生时间状态，表示结束时间已经过去。已结束不表示相关准备或后续待办已经完成。
_Avoid_: 已完成

**完成记录**:
待办从待处理变为已完成时保存的活动记录，包括完成时间、操作者和当时的事项摘要。恢复待办不会删除原完成记录。
_Avoid_: Agent 操作账本、只保存当前状态

**系统通知**:
iOS 在后台或锁屏状态展示的系统横幅、通知中心记录或锁屏提示。系统通知由已确认的提醒计划触发，不是待办或日程本身。
_Avoid_: 应用内收件箱、待办建议

**联系提醒**:
用于提醒用户在约定时间联系某人的通知建议或已确认提醒。
_Avoid_: 跟进提醒

**联系某人**:
面向用户描述具体人脉行动时使用的动词表达。
_Avoid_: 跟进某人、复核跟进

**主要行业**:
联系人所属的一个固定行业分类，用于人脉结构统计、行业筛选和行业分析。每位联系人最多选择一个主要行业；没有可靠分类时保持未分类。
_Avoid_: 用公司名称猜测行业、把多个标签同时计入行业分布

**自定义标签**:
用户为联系人添加的零个或多个自由标签，用于搜索、筛选和补充上下文。自定义标签可以重叠，但不参与主要行业的饼图统计。
_Avoid_: 行业分类、来源、关系进展

### Product and data language

**Orbit AI**:
The user-facing relationship manager that can answer questions and proactively surface relationship work through the Orbit AI conversation.
_Avoid_: generic chatbot, notification center

**Events**:
Relationship moments with a time, place, context, and possible people to meet or follow up with.
_Avoid_: calendar system, meeting storage

**Events Live Store**:
The source of real Orbit event records owned by the product, independent of external calendar or event-platform synchronization.
_Avoid_: live calendar import, provider sync

**Calendar Provider Import**:
The flow that brings events from an external calendar or event platform into Orbit.
_Avoid_: events live store

**Local Live Database**:
A developer-machine database that uses the same live provider boundary as production data storage, while staying local to the developer environment.
_Avoid_: hybrid store, browser localStorage, mock fixtures

**Remote Live Database**:
A network-hosted database service that uses the same live provider boundary as Orbit production data storage.
_Avoid_: local live database, hybrid store, provider sync

**Live Record**:
A persistent Orbit data item stored through the live provider boundary, with shared metadata for ownership, provenance, and cross-feature lookup.
_Avoid_: fixture row, localStorage item, provider-specific document

**Event Capability**:
A business capability within Events, such as attendee roster, readiness, encounter notes, want-to-connect, or post-event review. A capability may have mock, hybrid, or live implementations, but the capability itself is not a mock.
_Avoid_: mock feature, mock folder

**Event Work Record**:
A persistent fact created or accepted during an event relationship workflow, such as an attendee import, goal, encounter note, want-connect intent, or post-event contact draft.
_Avoid_: computed recommendation, transient view

**Event Computed View**:
A derived event relationship output that can be recalculated from event work records and other source data, such as readiness scores, recommendation eligibility, match results, summaries, and suggested follow-ups.
_Avoid_: persisted fact, user-confirmed record

**Post-Event Contact Draft**:
A candidate contact created from post-event review that still requires user confirmation before becoming a formal contact.
_Avoid_: contact, imported contact
