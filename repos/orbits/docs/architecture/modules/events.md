# Events 模块

## 模块定位

Events 负责活动创建、导入、参会者名单、目标准备、现场记录、想连接对象和会后联系人复核。

## 期望行为

模块应支持活动全生命周期：活动详情、参会者、活动目标、准备度、现场 encounter、want-to-connect 和 post-event review。每一步都应保留来源和操作边界。

## Mock 行为

Mock 服务返回固定活动、参会者、准备度、现场记录、连接意向和会后复核数据，不访问真实日历、活动平台、消息系统、数据库或外部网络。

## Live Store

Events live mode 现在分成两类数据路径：

- `event-crud-import` 读取共享 live storage 的 `events` collection，用于活动列表、活动详情和手动活动创建。它代表 Orbit 自有活动存储，不代表 Google/Apple Calendar、活动平台或 organizer feed 直接导入。
- 参会者名单、goal/readiness、encounter note、want-to-connect、post-event review 读取 generated relationship graph，再把需要确认的工作状态写入各自的 event work collection，例如 `event_attendee_rosters`、`event_goal_readiness`、`event_encounter_notes`、`event_want_connect` 和 `post_event_reviews`。

事件详情页本身不是新的数据层。它只组合这些 feature service：在 live mode 下加载活动、参会者、推荐、准备度、现场记录预览、want-connect 匹配和会后复核；在存储未配置时返回受控 route failure。页面加载不应写 encounter note；只有用户提供 typed note 时才写 `event_encounter_notes`。want-to-connect action 可以写 storage-only intent，但不得触发 presence、peer notification、external message、notification provider 或外部网络。

`/app/events/[id]` 现在通过 `loadAppEventDetailRoute` 初始化页面。页面 adapter 只负责把 route success model 映射到既有活动详情 UI 的 `OrbitLandingEventView` 形状；空态、pending 和 failure 通过 shared `StateView` 展示。

## 热拔插边界

调用方必须通过 `features/events/service-factory.ts` 获取事件子服务。真实活动平台、日历或现场记录系统可逐项替换，不影响其他模块。
