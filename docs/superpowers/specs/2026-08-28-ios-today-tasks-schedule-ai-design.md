# iOS「今天」待办、日程与 AI 协同设计

日期：2026-08-28
状态：待确认
范围：iOS 优先；服务端契约为 iOS 与后续 Web 共用

## 1. 结论

Orbit 需要一个真正的通用待办系统，而不是继续把关系跟进建议包装成“今天”。

本方案将「今天」定义为一个聚合工作台：

1. **待办**：用户需要完成的事，可以手动添加、勾选完成、延期或删除。
2. **日程**：在具体时间发生的事，例如会议、活动和个人安排，只表示时间占用，不使用完成勾选。
3. **Orbit AI**：读取同一套待办和日程数据，回答“今天还有什么没做”“下午有没有空”等问题；涉及新增、改期、完成等写操作时，先向用户确认。
4. **首页**：保留 Orbit AI 作为主要体验，只展示「今天」数据的精简摘要和快速入口，不再依赖关系信号伪装成完整待办。

推荐的界面结构是**同页上下两块**，不是两个 Tab，也不是混合时间线。用户打开「今天」时，应同时看见今天要做什么和今天什么时候有安排。

## 2. 当前实现诊断

此前方案没有完整落地，原因不是视觉细节，而是数据与页面职责没有统一：

| 当前实现 | 实际问题 |
|---|---|
| iOS 首页「下一步」读取 Agent signals | 数据主要来自联系人、关系停滞和活动信号，不是用户的完整待办 |
| 首页抽屉「今天」跳转 `/schedule` | 只进入日程页，不能维护个人待办 |
| `/today` 指向 `TodayAgentLedgerScreen` | 展示 Agent 等待确认的操作账本，不是用户的今日清单 |
| `/followups` 展示关系跟进任务 | 只能覆盖“联系某人”，不能覆盖准备材料、提交文件、购买物品等个人事项 |
| `GET /api/tasks` | 当前只读取关系触发生成的任务，没有通用任务 CRUD |
| Agent 的 `followups.createTask` | 已能写入任务记录，但命名和归属仍绑定 Followups 模块 |
| Task 只保存当前状态 | 没有独立完成历史；恢复或改写后，Agent 无法可靠还原用户做过什么 |
| Notifications 仍是 mock/preview guard | 只有提醒队列和应用内预览，没有 iOS 系统权限、设备 Token、调度器或真实推送 |

因此，不能通过重新排版现有页面解决。需要把 Task 从 Followups 的子能力提升为通用领域能力，再让关系、活动、收件箱和 AI 关联到它。

## 3. 术语与边界

### 3.1 待办

**待办**是用户需要完成的一件具体事情。它可以与联系人、活动、对话或日程关联，也可以完全独立。

示例：

- 联系渡边确认下周见面时间。
- 整理关西活动的参会名单。
- 提交公司资料。
- 买一张新干线车票。

待办有完成状态，但不要求一定有具体时刻。

### 3.2 日程

**日程**是在一个确定时间段发生的安排。它回答“什么时候被占用”，不回答“做完了吗”。

示例：

- 14:00 与佐藤线上会议。
- 18:30 参加关西跨境商务交流会。
- 10:00-11:00 健身。

日程没有完成勾选。活动、Meeting 和用户自己的日历安排都属于日程来源。

### 3.3 待办建议

**待办建议**是 Orbit 根据联系人、活动、消息或日程推导出的建议，尚未成为用户待办。用户确认“加入待办”后，它才成为持久化 Task。

AI 不得把建议静默写入用户清单，否则首页会重新被大量低价值自动任务占满。

### 3.4 提醒

**提醒**是待办或日程触发通知的方式，不是另一种任务。删除通知不会自动删除待办；完成待办后，其未来通知应被取消。

提醒可以投递到两个界面，但只有一份提醒计划：

- **系统通知**：应用在后台或设备锁屏时，由 iOS 显示横幅、通知中心记录或锁屏提示。
- **应用内提醒**：用户正在使用 Orbit 时显示的轻量横幅，并在现有收件箱保留记录。

两者不能各自创建独立提醒，否则用户会收到重复通知。

### 3.5 事项形态与事项类别

每条记录有两个不能混在一起的维度：

- **事项形态**：`待办` 或 `日程`。它决定记录是否可以勾选完成，以及使用日期还是时间段。
- **事项类别**：`人脉`、`会面`、`活动`、`工作`、`个人` 或 `其他`。它帮助用户筛选，也帮助 Orbit AI 按场景管理事项。

具体例子：

| 用户要做的事 | 事项形态 | 事项类别 |
|---|---|---|
| 明天下午三点和渡边见面 | 日程 | 会面 |
| 为渡边会面准备方案 | 待办 | 会面 |
| 周五参加关西交流会 | 日程 | 活动 |
| 整理关西交流会参会名单 | 待办 | 活动 |
| 联系佐藤确认合作范围 | 待办 | 人脉 |
| 完成客户报价单 | 待办 | 工作 |
| 购买新干线车票 | 待办 | 个人 |

类别是稳定的单选系统字段，不能把用户自定义的项目名、行业或主题继续扩充成系统类别。后续若加入自定义标签，应作为独立字段。这样 Agent 可以可靠地理解“列出本周所有活动类待办”，又不会受到自由文本变化的影响。

### 3.6 完成与结束

待办和日程使用不同状态语言：

| 事项形态 | 当前状态 | 含义 |
|---|---|---|
| 待办 | 待处理 | 仍需要用户完成 |
| 待办 | 已完成 | 用户或经确认的 Agent 动作已完成该事项 |
| 待办 | 已取消 | 用户决定不再处理，不算完成 |
| 日程 | 未开始 | 开始时间尚未到达 |
| 日程 | 进行中 | 当前时间位于开始和结束时间之间 |
| 日程 | 已结束 | 结束时间已经过去，不表示相关待办已完成 |
| 日程 | 已取消 | 日程不会再发生 |

“已完成”必须由明确动作产生，不能根据截止时间自动判断。“已结束”由日程时间计算，不需要用户勾选。

## 4. 方案比较

### 方案 A：待办和日程使用两个 Tab

优点是实现简单、每页内容纯粹。缺点是用户无法一眼回答“今天整体是什么状态”，并且会把最常用的信息藏在切换操作后。

### 方案 B：合并成一条时间线

优点是按时间排序直观。缺点是无时间待办没有自然位置，日程和待办的交互也不同：一个需要勾选，一个不能勾选。混合后用户容易误把会议当成可完成任务。

### 方案 C：同页上下两块，推荐

待办在上，日程在下；两块共用日期和数据刷新，但保持独立语义与交互。它最符合用户“今天要做什么”和“今天有什么安排”两种查看方式，也最适合首页做统一摘要。

## 5. iOS 信息架构

### 5.1 路由职责

| 路由 | 新职责 |
|---|---|
| `/ai` | Orbit AI 首页；聊天为主，展示今日摘要 |
| `/today` | 今天工作台；完整管理今天的待办和日程 |
| `/tasks` | 全部待办；查看今天、之后、无日期和已完成 |
| `/schedule` | 完整日历；查看日期、月份和日程详情 |
| `/followups` | 兼容旧深链，转到 `/tasks?relation=linked` |

首页抽屉中的「今天」必须跳转 `/today`，角标必须来自 `TodayReadModel.openTaskCount`，不能继续使用 `nextActions.length`。

### 5.2 Orbit AI 首页

首页仍然是完整的对话窗口。今日模块位于空对话欢迎区与输入框之间；进入聊天后可以折叠为一行摘要，避免挤压消息空间。

```text
┌────────────────────────────────────┐
│ Orbit AI                       历史 │
│                                    │
│          我是您的人脉管家          │
│        有什么需要我做的吗？        │
│                                    │
│ 今天                         查看  │
│ ○ 联系渡边确认见面时间       逾期  │
│ ○ 整理明天活动的参会名单     今天  │
│ 14:00  佐藤线上会议                 │
│ ＋ 添加待办                         │
│                                    │
│ [ 向 Orbit 提问...              ↑ ] │
└────────────────────────────────────┘
```

首页模块规则：

- 最多展示 3 行，优先级为：逾期待办、今日有时间待办、今日普通待办、最近一项日程。
- 待办使用圆形勾选控件；日程使用时间和日历图标，不显示勾选框。
- 点击「添加待办」使用底部快速输入，不离开首页。
- 点击「查看」进入 `/today`。
- 首页不展示长解释、来源证据、匹配分数或两排操作按钮。
- 每一行最多显示一个低对比度类别标识；类别不能占据第二行或降低列表密度。
- 旧的「下一步」关系信号若尚未被确认，只能进入「Orbit 建议」入口，不能混入用户待办计数。

### 5.3 「今天」工作台

```text
┌────────────────────────────────────┐
│ ‹  今天                 8月28日 周五 │
│ 4 项待办 · 2 项日程                 │
│                                    │
│ 待办                          全部 › │
│ ┌────────────────────────────────┐ │
│ │ ＋ 添加待办                    │ │
│ └────────────────────────────────┘ │
│ ○ 联系渡边确认见面时间       已逾期 │
│ ○ 整理活动参会名单           12:00 │
│ ○ 提交公司资料                     │
│ 已完成 3                         › │
│                                    │
│ Orbit 建议                       2 › │
│ ✦ 活动前确认三位重点联系人   [加入] │
│   明晚参会，提前确认更容易见到     │
│ ✦ 给田中发送会后感谢          [加入] │
│   昨天首次见面，尚未记录后续行动   │
│                                    │
│ 日程                          日历 › │
│ 10:00 ┃ 团队周会             60分钟 │
│ 14:00 ┃ 佐藤线上会议          45分钟 │
│ 18:30 ┃ 关西跨境商务交流会     难波  │
└────────────────────────────────────┘
```

交互规则：

- 「待办」始终排在「日程」之前，因为它代表用户需要主动完成的事项。
- 输入标题并回车即可创建待办；日期默认加入今天，详细属性可稍后编辑。
- 点击圆圈立即完成，列表原位轻量过渡，提供短时「撤销」。
- 左滑待办提供「明天」「删除」；点击正文进入待办详情。
- 日程按开始时间排列；点击进入对应会议、活动或个人日程详情。
- 两块分别显示空态。没有日程不能让待办区域也显示“暂无内容”。
- 「已完成」使用明显的计数入口，不在 Today 主列表堆叠历史；点击后进入 `/tasks?view=completed`。
- 「Orbit 建议」位于正式待办之后、日程之前，最多展示 2 条；没有建议时整个区域隐藏。
- 建议没有完成勾选框，也不进入“4 项待办”的数量。点击「加入」后才成为正式待办。
- 点击建议正文进入建议详情；用户可以先修改标题、类别和计划日期，再加入待办。

### 5.4 全部待办

全部待办页面采用 iOS Reminders 式的紧凑列表，不做项目管理看板。

页面顶部使用清晰的分段控件：`待办｜已完成`。它始终可见，不能把已完成入口藏在页面底部或更多菜单里。

固定分组：

- 今天：计划今天处理、今天到期和已逾期但未完成。
- Orbit 建议：Orbit 提出、尚未被用户采纳的行动建议。
- 之后：有未来计划日期或截止时间。
- 无日期：用户尚未安排到具体日期。

第一期支持标题、备注、计划日期、截止时间、优先级、事项类别和关联对象。不加入子任务、多人分派、复杂项目、工时统计或自动循环任务。

列表顶部提供一个紧凑的「类别」筛选菜单，默认显示全部。类别只作为筛选和轻量标识，不把六种类别全部展开成常驻分组。

### 5.5 「Orbit 建议」区域

「Orbit 建议」是待办页面中的次级区域。它帮助用户发现值得做、但尚未进入个人承诺清单的事项。

每条建议使用紧凑的两行结构：

- 第一行：建议标题、类别标识和「加入待办」按钮。
- 第二行：一条具体理由，例如“明晚参会，提前确认更容易见到”。
- 更多菜单：忽略、暂不处理、查看依据。

交互规则：

1. **加入待办**：使用建议中的标题、类别、计划日期和关联对象创建 Task。创建成功后，建议从该区域移除，并出现在正式待办列表。
2. **编辑后加入**：打开底部编辑面板，允许修改标题、类别、计划日期、截止时间和优先级；保存后执行同一个采纳接口。
3. **忽略**：把建议标记为 `dismissed`，不创建 Task。相同来源在冷却期内不能重复生成同一建议。
4. **暂不处理**：建议保留，但移动到区域末尾并设置下次展示时间。它仍然不是正式待办。
5. **查看依据**：展示建议出现的原因、关联联系人或活动，以及简短来源摘要；不在列表页直接堆叠完整证据。

排序优先级为：临近活动或会面、已经承诺但尚未记录的行动、逾期关系时机、一般优化建议。排序由服务端规则和已存分数完成，打开页面时不临时调用大模型。

首页不直接展示建议卡，只在今日摘要底部显示低对比度入口，例如「Orbit 有 2 条待办建议」。这样用户能发现建议，但正式待办和对话空间不会被建议挤占。

### 5.6 「已完成」历史

用户切换到「已完成」后，看到真实完成过的待办历史。默认按完成时间倒序，并分为「今天」「本周」「更早」。

每行保持紧凑，只展示：

- 完成标识和待办标题。
- 完成时间。
- 一个低对比度类别标识。
- 关联联系人或活动的简短名称，仅在存在关联时显示。

顶部沿用单行类别筛选，并增加日期范围筛选。点击一条记录进入待办详情，详情页显示创建、改期、完成、恢复和再次完成的活动时间线。

主要交互：

- 「恢复待办」把当前状态改回 `open`，但不删除此前的完成记录。
- 「删除」采用软删除并从用户和 Agent 的常规查询中移除。
- 已取消事项不混入已完成列表，可通过状态筛选单独查看。
- Today 页只显示「已完成 3 ›」入口和最近完成数量，不在当天主列表长期堆叠已完成项目。

### 5.7 提醒与系统通知设置

待办详情和日程详情都提供「提醒」行。用户可以选择提醒时间、关闭提醒或新增另一条提醒。每条提醒清楚显示是否已获得 iOS 通知权限。

权限流程：

1. 用户第一次主动设置系统提醒时，Orbit 先解释用途，再触发 iOS 系统权限弹窗；登录页和首次启动时不抢先请求。
2. 用户允许后注册当前设备，提醒可以投递为系统横幅。
3. 用户拒绝后仍可在应用内查看提醒；设置行显示「系统通知未开启」，点击后引导前往 iOS 设置。
4. 设备通知权限、Orbit 内部通知偏好和某一条 ReminderPlan 的开关分别保存，不能用一个布尔值代替三层状态。

应用在前台时显示 Orbit 内部横幅，不重复显示第二个系统横幅；应用在后台或锁屏时由 iOS 显示系统通知。点击通知后深链打开对应待办、活动或日程。

## 6. 数据模型

### 6.1 Task

```ts
interface TaskDTO {
  id: OrbitId;
  accountId: OrbitId;
  ownerUserId: OrbitId;
  title: string;
  notes?: string;
  status: "open" | "completed" | "cancelled";
  category: "relationship" | "meeting" | "event" | "work" | "personal" | "other";
  plannedDate?: LocalDateString;
  dueAt?: IsoDateTimeString;
  priority: "normal" | "high";
  source: "manual" | "ai_confirmed" | "contact" | "event" | "inbox";
  relatedContactId?: OrbitId;
  relatedEventId?: OrbitId;
  relatedMeetingId?: OrbitId;
  relatedConversationId?: OrbitId;
  suggestionId?: OrbitId;
  completedAt?: IsoDateTimeString;
  completedBy?: OrbitId;
  completionSource?: "user" | "agent_confirmed" | "notification_action";
  createdAt: IsoDateTimeString;
  updatedAt: IsoDateTimeString;
}
```

关键约束：

- `plannedDate` 表示用户打算在哪一天处理，用用户时区的本地日期保存。
- `dueAt` 表示最后期限，不等于日历占用时间。
- `category` 是用户可编辑的单选场景分类，不表示来源，也不决定记录状态。
- 联系人、活动、会议和对话都是可选关联，不决定 Task 是否成立。
- `scheduled` 不再作为状态；安排到某一天仍然是 `open`。
- 待办恢复为 `open` 时清空当前行的 `completedAt`、`completedBy` 和 `completionSource`，原完成事实继续保存在 TaskActivity。
- 所有查询必须按 `accountId` 和 `ownerUserId` 隔离。

### 6.2 ScheduleItem

Meeting、活动参与记录和个人日历事件继续保留各自事实模型，不复制成 Task。服务端通过只读映射形成统一日程项：

```ts
interface ScheduleItemDTO {
  id: OrbitId;
  kind: "meeting" | "event" | "personal";
  category: "relationship" | "meeting" | "event" | "work" | "personal" | "other";
  state: "upcoming" | "ongoing" | "ended" | "cancelled";
  title: string;
  startsAt: IsoDateTimeString;
  endsAt?: IsoDateTimeString;
  location?: string;
  sourceId: OrbitId;
}
```

如果用户既要“参加活动”，又要“准备活动资料”，前者是 ScheduleItem，后者是关联该活动的 Task。两者不能互相替代。

### 6.3 分类、来源与关联对象

这三个字段解决不同问题：

| 维度 | 回答的问题 | 示例 |
|---|---|---|
| `category` | 这是什么场景的事项？ | 活动 |
| `source` | 这条记录从哪里产生？ | 用户手动添加、AI 确认、收件箱 |
| `relatedEventId` 等关联字段 | 它具体关联哪个业务对象？ | 关西跨境商务交流会 |

分类优先使用确定性信息：关联 Meeting 时为会面，关联 Event 时为活动，主要目的为联系、引荐、感谢或维护联系人的行动归为人脉。仅仅关联了联系人并不自动归为人脉，例如“完成佐藤客户的报价单”仍是工作类。工作、个人和其他由用户选择或由 Agent 在确认卡中建议。AI 推断必须保留置信度；低置信度使用「其他」，不能为了分类阻止用户快速创建。

### 6.4 TaskSuggestion

规则或 AI 生成的行动先保存为 `TaskSuggestion`。只有用户采纳后才创建 Task。

```ts
interface TaskSuggestionDTO {
  id: OrbitId;
  accountId: OrbitId;
  ownerUserId: OrbitId;
  title: string;
  reason: string;
  category: "relationship" | "meeting" | "event" | "work" | "personal" | "other";
  status: "pending" | "accepted" | "dismissed" | "snoozed" | "expired";
  suggestedPlannedDate?: LocalDateString;
  suggestedDueAt?: IsoDateTimeString;
  relatedContactId?: OrbitId;
  relatedEventId?: OrbitId;
  relatedMeetingId?: OrbitId;
  relatedConversationId?: OrbitId;
  evidenceIds: readonly OrbitId[];
  confidence: number;
  deduplicationKey: string;
  nextVisibleAt?: IsoDateTimeString;
  expiresAt?: IsoDateTimeString;
  acceptedTaskId?: OrbitId;
  createdAt: IsoDateTimeString;
  updatedAt: IsoDateTimeString;
}
```

关键约束：

- `pending`、`snoozed` 建议不是 Task，不进入待办计数，也不能被标记完成。
- 采纳接口必须在一个事务中创建 Task 并把建议标记为 `accepted`。
- `deduplicationKey` 防止同一联系人、活动和行动在多个信号来源中重复出现。
- 建议必须有可读的 `reason`；只有置信度而没有具体理由的记录不进入用户界面。
- 过期活动产生的建议自动变为 `expired`，不继续占据列表。
- `acceptedTaskId` 保留建议到正式待办的追踪关系，方便审计和撤销。

### 6.5 TaskActivity

Task 保存当前状态，TaskActivity 追加保存状态变化。Orbit 不采用完整事件溯源，但完成历史不能只依赖 Task 当前行。

```ts
interface TaskActivityDTO {
  id: OrbitId;
  accountId: OrbitId;
  ownerUserId: OrbitId;
  taskId: OrbitId;
  type: "created" | "updated" | "rescheduled" | "completed" | "reopened" | "cancelled" | "deleted";
  actorType: "user" | "agent" | "system" | "notification_action";
  actorId?: OrbitId;
  occurredAt: IsoDateTimeString;
  taskSnapshot: {
    title: string;
    category: TaskDTO["category"];
    relatedContactId?: OrbitId;
    relatedEventId?: OrbitId;
  };
  changes?: Readonly<Record<string, unknown>>;
}
```

每次完成、恢复、改期或取消都在同一数据库事务中更新 Task 并追加 TaskActivity。这样恢复待办不会抹去此前完成过的事实，Agent 也能按时间范围查询实际行动。

### 6.6 ReminderPlan

ReminderPlan 是提醒的唯一事实来源，既可以关联 Task，也可以关联 ScheduleItem。

```ts
interface ReminderPlanDTO {
  id: OrbitId;
  accountId: OrbitId;
  ownerUserId: OrbitId;
  targetType: "task" | "schedule_item";
  targetId: OrbitId;
  fireAt: IsoDateTimeString;
  timeZone: string;
  status: "scheduled" | "delivered" | "cancelled" | "failed";
  channels: readonly ("in_app" | "ios_push")[];
  title: string;
  body: string;
  deepLink: string;
  createdBy: "user" | "agent_confirmed";
  deliveredAt?: IsoDateTimeString;
  cancelledAt?: IsoDateTimeString;
  failureCode?: string;
  createdAt: IsoDateTimeString;
  updatedAt: IsoDateTimeString;
}
```

一个事项可以有多条 ReminderPlan。完成、取消或删除待办时取消所有未来计划；日程取消时同样取消未来计划。改期时只重排使用相对时间规则的提醒，绝对时间提醒必须由用户确认是否一起移动。

### 6.7 DevicePushToken 与 NotificationDelivery

系统通知还需要两类记录：

- `DevicePushToken`：记录用户、设备、平台、推送 Token、权限状态、最后验证时间和失效时间。退出登录或 Token 失效时必须撤销绑定。
- `NotificationDelivery`：记录 ReminderPlan、设备、provider message ID、投递状态、失败原因、送达时间、打开时间和用户动作。

推送 Token 不能写入 Task、ReminderPlan 或 Agent 上下文。Agent 只能看到“系统通知可用/不可用”和提醒状态，不能读取设备 Token。

## 7. Today 聚合读模型

客户端不应分别请求五个接口后自行推断“今天”。服务端提供账户和时区一致的聚合结果：

```ts
interface TodayReadModel {
  localDate: LocalDateString;
  timeZone: string;
  tasks: TaskDTO[];
  taskSuggestions: TaskSuggestionDTO[];
  schedule: ScheduleItemDTO[];
  openTaskCount: number;
  taskSuggestionCount: number;
  completedTaskCount: number;
  overdueTaskCount: number;
  scheduleCount: number;
  generatedAt: IsoDateTimeString;
}
```

今日待办的确定性规则：

1. `status = open` 且 `plannedDate = 今天`。
2. `status = open` 且 `dueAt` 落在今天。
3. 截止时间已过但尚未完成的待办自动带入今天，并标记「已逾期」。
4. 无日期待办不会自动塞进今天，除非用户手动加入。
5. 未确认的 TaskSuggestion 不计入待办数量。

`taskSuggestions` 只返回当前日期值得展示的前 2 条建议；完整建议列表由 `/api/task-suggestions` 分页提供。建议数量单独返回，不能与 `openTaskCount` 相加。

`completedTaskCount` 只用于 Today 页的「已完成」入口。完整历史通过任务历史接口分页读取，不进入首屏载荷。

排序不依赖大模型：已逾期高优先级、今天有截止时间、今天普通待办、用户手动顺序。日程始终按 `startsAt` 排序。

## 8. API 设计

| 方法与路径 | 用途 |
|---|---|
| `GET /api/today?date=&timeZone=` | 获取今天的待办与日程聚合结果 |
| `GET /api/tasks?scope=&status=&category=&relation=` | 按状态、类别和关联查询待办 |
| `POST /api/tasks` | 用户手动创建待办 |
| `PATCH /api/tasks/:id` | 编辑、完成、恢复或延期 |
| `DELETE /api/tasks/:id` | 软删除待办 |
| `GET /api/tasks/history?from=&to=&category=` | 分页查询已完成、恢复和取消记录 |
| `GET /api/tasks/:id/activities` | 查询单个待办的活动时间线 |
| `GET /api/task-suggestions` | 查询 Orbit 的待办建议 |
| `POST /api/task-suggestions/:id/accept` | 采纳建议并幂等创建待办；请求体可覆盖建议字段 |
| `POST /api/task-suggestions/:id/dismiss` | 忽略建议并进入重复生成冷却期 |
| `POST /api/task-suggestions/:id/snooze` | 设置建议下次可见时间 |
| `GET /api/reminders?targetType=&targetId=` | 查询事项的提醒计划 |
| `POST /api/reminders` | 创建一条已确认提醒计划 |
| `PATCH /api/reminders/:id` | 改期或关闭提醒 |
| `POST /api/devices/push-token` | 注册或更新当前 iOS 设备 Token |
| `DELETE /api/devices/push-token/:id` | 退出登录或失效时撤销设备绑定 |
| `GET /api/notification-preferences` | 读取系统通知、安静时段和隐私预览偏好 |
| `PATCH /api/notification-preferences` | 更新通知偏好 |

现有 `/api/tasks/generate` 在迁移期只生成建议，不能再返回看似已经进入清单的任务。

手动界面操作可以直接写入；AI 写操作必须继续遵守 Agent confirmation guard，并保留审计和撤销能力。

## 9. Orbit AI 读取与操作

### 9.1 读取工具

Agent 增加领域中立的只读工具：

- `tasks.list(scope: today | open | completed, category?)`
- `tasks.get(taskId)`
- `tasks.history(from, to, category?)`
- `taskSuggestions.list(category?)`
- `reminders.list(targetType?, targetId?)`
- `today.read(date)`
- `calendar.list(start, end)`

回答“今天还有什么没做”时直接读取 `today.read`，不需要让模型扫描全部联系人、活动和消息。

Agent 必须明确区分“你有 4 项待办”和“Orbit 另有 2 条建议”。用户问“你建议我做什么”时读取 `taskSuggestions.list`；用户问“我还有什么没做”时只统计正式 Task。

用户问“我上周完成了什么”时，Agent 调用 `tasks.history`，按 TaskActivity 中的完成事实回答，不能只检查当前 Task 状态。日程时间已经过去时只能说“日程已结束”，不能说“已经完成”。

### 9.2 写操作

Agent 使用以下可确认动作：

- `tasks.create`
- `tasks.complete`
- `tasks.reschedule`
- `tasks.cancel`
- `tasks.acceptSuggestion`
- `tasks.dismissSuggestion`
- `tasks.reopen`
- `reminders.create`
- `reminders.reschedule`
- `reminders.cancel`
- `calendar.createEvent`

Orbit 必须先区分用户意图：

- “明天记得联系渡边”默认创建待办并设置 `plannedDate`。
- “明天下午三点和渡边见面”创建日程。
- “把本周活动类待办列出来”按 `category = event` 查询，不扫描标题猜测。
- “工作类还有多少没完成”由服务端统计分类结果，模型只负责表达。
- 信息不够时只追问缺失的关键字段，不同时创建待办和日程。

确认卡必须展示将要写入的标题、事项形态、类别、日期、时间和关联对象。用户确认后执行，失败时明确显示未写入，不能只在对话中说“已完成”。

用户在待办页面点击「加入待办」本身就是明确确认，可以直接调用采纳接口。用户在对话中说“把第一条建议加进去”时，Agent 仍需显示确认卡，避免指代错误。

“提醒我明天上午联系渡边”必须生成 ReminderPlan 确认卡。Agent 不直接调用推送 provider；确认后由 Notifications 服务按计划投递。

### 9.3 低 Token 上下文

不把整个待办库塞入每次对话。系统构建确定性的紧凑摘要：

```text
今天：4 项未完成，1 项逾期，2 项日程。
待办：联系渡边（逾期）；整理参会名单（12:00）；提交公司资料。
下一项日程：14:00 佐藤线上会议。
最近完成：今天 2 项；本周共 7 项。
```

默认最多提供 10 项今日待办和 5 项近日程，并附带各类别计数；用户询问历史或全部任务时再调用工具分页读取。这样 AI 能正确理解当前状态，同时避免持续消耗大量 Token。

待办建议的标题、理由和分类在生成时保存。页面展示与常规 Today 上下文不再次调用模型；只有用户主动要求解释或重新规划时才使用 Agent。

## 10. 首页与「今天」的数据一致性

首页摘要、抽屉角标和 `/today` 必须全部来自同一个 `TodayReadModel`：

- 在首页勾选待办，`/today` 立即反映完成状态。
- 在 `/today` 添加待办，返回首页后摘要和角标更新。
- AI 确认创建待办后，两处同时刷新。
- 用户采纳待办建议后，建议数量减一，正式待办数量加一，首页和 `/today` 在同一次刷新中更新。
- 用户完成或恢复待办后，未完成数量、完成入口数量和历史记录在同一次事务结果中更新。
- 日程改变时只更新日程数量，不增加待办数量。
- Agent signal 被忽略或稍后处理，不会改变真实待办数量，除非它已经被接受为 Task。

这是本次修复此前首页方案“外观出现、功能未落地”的核心约束。

## 11. 数据迁移

1. 现有持久化 `TaskDTO` 保留原 ID，补齐 `accountId`、`ownerUserId`、`priority` 和 `source`。
2. 现有 `open` 与 `scheduled` 都迁移为 `open`；`scheduled` 的日期写入 `plannedDate` 或保留原 `dueAt`。
3. 现有 `completed` 保持完成并补 `completedAt`；`dismissed` 迁移为 `cancelled`。
4. 有 `contactId` 或 `connectionId` 的记录成为普通 Task 的联系人关联，不再属于独立任务类型。
5. 规则即时生成、但用户从未确认的关系候选不迁移为 Task，而是迁移为 TaskSuggestion。
6. Meeting、活动和个人日历不复制到 tasks 集合。
7. 现有 `completed` Task 按原 `updatedAt` 生成一条标记为迁移来源的 `completed` TaskActivity；无法确定时间时明确记录迁移时间，不伪造用户完成时间。
8. 现有通知预览记录不直接迁移为可投递 ReminderPlan，只有用户已明确确认过时间和提醒意图的记录才进入新队列。
9. 迁移脚本输出迁移、跳过、冲突和重复数量；发生约束错误时整批回滚，不静默丢记录。

## 12. 状态、离线与系统通知

- 首屏可以显示上次成功同步的 Today 快照，并明确标注同步失败。
- 勾选完成和手动新增采用乐观更新；服务端失败时回滚并显示原因。
- 同一任务的重复提交使用幂等键和 `updatedAt` 解决冲突。
- 提醒是 Task 或 ScheduleItem 的附属计划。完成、取消或改期待办时同步取消或重排未来提醒。
- 第一阶段不要求完整离线编辑队列，但不能在离线时假装写入成功。

### 12.1 投递链路

1. 用户或经确认的 Agent 动作创建 ReminderPlan。
2. 服务端调度器领取到期计划，并使用幂等键创建 NotificationDelivery。
3. Notifications 服务检查账户偏好、iOS 权限状态、安静时段和有效设备 Token。
4. 应用在后台或锁屏时，通过 iOS 推送 provider 投递系统通知；应用在前台时显示应用内横幅。
5. 无论系统推送是否成功，已触发提醒都在现有收件箱生成一条记录，方便追踪。
6. 用户点击通知后根据 `deepLink` 打开对应待办、日程或活动，并记录 `openedAt`。

provider 回执必须映射为 Orbit 的 Delivery 状态。业务服务和 Agent 都不能直接接触 provider payload。

### 12.2 系统通知动作

待办通知支持两个快捷动作：

- 「完成」：使用幂等接口完成 Task，追加 TaskActivity，并取消其他未来提醒。
- 「稍后提醒」：创建新的 ReminderPlan，原计划保持已投递状态。

日程通知只提供「打开」和「稍后提醒」，不提供「完成」。所有通知动作都要验证用户、设备和目标事项的账户归属。

### 12.3 权限与降级

- iOS 权限允许：系统通知和应用内提醒均可用。
- iOS 权限拒绝：保留应用内提醒和收件箱记录，设置页提供前往系统设置入口。
- Token 失效：停止向该设备重试，保留 ReminderPlan 和失败记录，并在用户下次启动时重新注册。
- 服务端暂时失败：按受控退避重试；超过上限后标记失败，不在多个 worker 重复投递。
- 用户退出登录：撤销该设备与账户的 Token 绑定，避免下一个登录用户收到前一个账户的通知。

### 12.4 隐私与语言

- 通知标题和正文使用用户主页语言生成，不混合中文、英文和日文。
- 用户可以选择锁屏显示完整内容或只显示“Orbit 有一条提醒”。
- 推送 payload 只携带通知 ID 和受控深链，不携带完整联系人证据、消息内容或 Agent 上下文。
- 所有日期按 ReminderPlan 的 `timeZone` 计算，跨时区后由服务端和客户端按用户规则重新确认需要移动的提醒。

## 13. 实施分期

### 第一阶段：领域与服务端

- 将通用 Task 契约从 Followups 语义中独立出来。
- 新增 Task CRUD、TaskSuggestion 与 Today 聚合接口。
- 新增 TaskActivity、ReminderPlan、设备 Token 和投递记录。
- 编写数据迁移和账户隔离测试。

### 第二阶段：iOS「今天」与全部待办

- 新建 `/today` 工作台和 `/tasks` 紧凑列表。
- 实现快速新增、完成、撤销、延期和详情编辑。
- 实现「Orbit 建议」区域、建议详情、采纳、忽略和暂不处理。
- 实现顶部 `待办｜已完成`、完成历史和单条待办活动时间线。
- 保留 `/schedule` 完整日历，并修正抽屉路由。

### 第三阶段：首页落地

- 用 TodayReadModel 替换首页纯 Agent signal 列表。
- 首页最多显示三项摘要和最近日程。
- 抽屉角标改为真实未完成待办数。

### 第四阶段：系统通知

- iOS 接入系统通知权限、设备 Token 注册和通知深链。
- 服务端接入调度 worker 与 iOS 推送 provider，完成幂等投递和失败回执。
- 打通前台横幅、后台系统通知、收件箱记录和通知快捷动作。
- 在真机和 Simulator 推送模拟环境验证前台、后台、锁屏、拒绝权限和 Token 失效场景。

### 第五阶段：AI 协同

- 增加领域中立的 tasks/today 工具。
- 完成查询、创建、完成、恢复、改期和提醒管理的确认流程。
- 让 Agent 可以查询完成历史，但不能把已结束日程当成已完成待办。
- 增加低 Token 上下文构建和跨账户安全测试。

### 第六阶段：迁移与 Web 对齐

- 迁移既有关系任务并去重。
- 将 `/followups` 收敛为关系筛选深链。
- Web 后续复用相同 API 和术语，不复制另一套任务逻辑。

## 14. 验收标准

1. 用户可以在首页或 `/today` 输入标题创建一个今天的待办。
2. 勾选待办后，首页、今天页、全部待办和 AI 查询结果一致。
3. `/today` 同时显示独立的待办区和日程区，日程没有完成勾选。
4. 首页摘要同时可能出现联系人待办、活动准备、个人待办和最近日程，但最多三行。
5. 用户问“今天还有什么没做”，AI 返回真实未完成待办，不把会议误报为未完成任务。
6. 用户说“添加待办”或“安排会议”时，AI 生成正确类型的确认卡，确认前不写数据库。
7. 未确认的 Orbit 建议不进入待办数量，也不占用首页主要位置。
8. 小雨只能读取和修改自己的待办；其他账号的数据完全隔离。
9. 既有关系任务迁移后不重复、不丢失，并仍能打开关联联系人。
10. 首页不再使用 `nextActions.length` 作为「今天」角标。
11. 每条待办和日程都有一个系统类别，用户可以修改，AI 可以按类别读取和统计。
12. “参加活动”保持为活动类日程；“准备活动材料”保持为活动类待办，两者不会重复或混淆。
13. 待办页面显示独立的「Orbit 建议」区域，建议没有完成勾选，也不计入正式待办数量。
14. 用户采纳建议后只创建一条正式待办；重复点击或网络重试不会生成重复记录。
15. 用户忽略或暂不处理建议后，界面状态会持久化，同一建议不会在刷新后立即重新出现。
16. AI 回答时能区分正式待办和待办建议，除非用户采纳，否则不会把建议描述成“你还没完成的任务”。
17. 待办页面顶部有明确的 `待办｜已完成` 入口，已完成历史支持日期和类别筛选。
18. 完成、恢复、改期和取消都会追加 TaskActivity；恢复待办不会抹去原完成记录。
19. AI 能依据活动记录回答指定日期范围内完成了什么，不把已结束日程算作完成任务。
20. 用户设置提醒并允许 iOS 权限后，应用在后台或锁屏时能收到系统通知，点击后打开正确事项。
21. 应用在前台时只显示一次 Orbit 内部横幅，不与系统通知重复。
22. 完成待办后，所有未来 ReminderPlan 被取消；删除提醒不会删除待办或日程。
23. 通知权限被拒绝或设备 Token 失效时，应用内提醒和收件箱记录仍可用，并明确显示系统通知不可用。
24. 退出登录后当前设备不再收到原账户通知，其他账户的数据和推送 Token 不会串联。

## 15. 明确不做

第一版不加入多人协作、任务分派、项目看板、工时统计、复杂子任务、邮件或短信提醒、自然语言自动执行和无确认的 AI 批量改写。重复待办可在核心链路稳定后单独设计，不进入本次范围。

## 16. 需要同步更新的术语

方案确认后更新根词汇表：

- **待办**：用户需要完成的通用具体事项，可独立存在或关联联系人、活动、日程、对话。
- **人脉待办**：以联系、引荐、感谢或维护联系人为主要目的的待办筛选结果，不是独立实体。
- **待办建议**：Orbit 提出、用户尚未确认的行动建议。
- **日程**：在明确时间段发生的安排，不具有完成状态。
- **今天**：聚合当日待办和日程的工作台，不是数据实体。
- **事项形态**：待办或日程，决定状态和交互。
- **事项类别**：人脉、会面、活动、工作、个人或其他，用于筛选与 Agent 管理；内部枚举仍使用 `relationship`。
- **已完成**：待办经过明确操作进入的状态，不由时间自动推断。
- **已结束**：日程结束时间已经过去的派生状态，不等于完成。
- **完成记录**：待办完成时追加保存、可供 Agent 查询的活动记录。
- **系统通知**：由 ReminderPlan 触发、在 iOS 后台或锁屏展示的通知，不是待办或日程本身。

现有“待办仅指人脉行动”的定义应废止，否则 iOS 和 Web 会继续产生同名异义。
