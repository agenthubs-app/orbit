# W5 Home Facts

## 状态与边界

W5 新增了 Agent home facts 的服务端 route service、纯 route-to-view model 和 memory-fixture 测试。它们目前是未接线的 local foundation：没有修改既有 UI、page、realagent、shared contract、API 或 App，也没有跨端行为变化。本文和本次代码不宣称 UI 已修复。

W0 接受的是 local foundation；UI 接入仍是独立的成本门。W4 的 page、realagent 等工作尚未释放，后续主批准接线方可修改。W4 仍 A2 编码，锁保留。W3 推荐不在本次并写。后续接线必须由独立工作核对既有页面入口、文案和端到端行为。

## 读取与输出事实

四个来源在同一个服务端 round 内并行读取，但这不是跨来源的数据库事务快照。每轮只取一次 `snapshotAt`；所有分组、七日边界和约见进行中/已结束状态都由这个 snapshot 派生。server refresh 会重新读取；没有轮询，也没有 client 跨午夜自动刷新。

每个来源独立捕获 factory 同步异常、读取 reject 和字段校验失败。`ready` 的真实条数可以是大于零，`empty` 是真实零，`unavailable` 的 `count` 是 `null`，不能把异常、未配置或校验失败压成 0。没有 actor 时不会构造或调用任何 reader。输出只保留展示所需字段，不下传 notes、owner map、私有关联、约见 join URL/location/phone hint 或原始 feature DTO。

| 来源 | W5 读取边界 | 展示事实 |
| --- | --- | --- |
| tasks | `createConfiguredTaskService().list({ actorId, status: "open" })` | 双日期按 overdue、plan-past、recent、undated 分组；纯日期不会被制造成午夜截止时间。真实入口是任务页和每条任务的 `/app/tasks/:id`。 |
| followups | `loadRelationshipLifecycleTasks({ actorId })` | 只有 `currentTasks` 是行动候选并参与分组、count 和最多 3 条展示；保留 history/orphan 的真实 count metadata，但不输出整份 items。orphan 只给固定失联警告和既有 `/app/tasks` 入口；当前项的真实 `operationHref` 继续使用联系人链接，参数是 `contact.id`（不是 `connectionId` 或 task id）。 |
| personal | `createConfiguredPersonalScheduleService().list({ actorId, from, to })` 一次 | `coverage=starts-in-window`，只纳入 `startsAt` 在 `[from,to)` 的事实；reader 自己处理 recurrence、exceptions、cancelled 和 occurrence id。W5 不 windowless、不补回看、不逐个 `get`、不复制 recurrence expander。 |
| appointments | `createConfiguredAppointmentService()`；返回 `null` 表示 unavailable；然后 `list({ actorId })` | 只计 confirmed/reschedule_pending 且已保存 `confirmed.startsAtUtc` 落在窗口内的约见；reschedule_pending 保留旧确认时间并标记待重新确认。仅输出当前 actor 的 `contactIdsByActor[actorId]`、`durationMinutes` 和 `medium`（in_person/video/phone）。Today 入口核对为 `/app/today#arrangements`，没有虚构 appointment detail 页。 |

每个来源展示最多 3 条，但 count 和分组 count 都在截断前计算。tasks/followups 的四分组顺序为 overdue、plan-past、recent、undated；未来窗口外不展示。follow-up 无 `dueAt` 进入 undated。窗口是产品时区 `Asia/Tokyo` 下从产品日 D 的当地 00:00 到 D+7 当地 00:00 的半开区间，不是滚动 168 小时，也不受进程时区影响。

## 已知事实与未完成的 UI 接线

七日窗口按“开始时间在窗口内”定义，因此不会覆盖在窗口开始前已经开始、但窗口内仍在进行的日程。这是明确 coverage 语义，不是遗漏修复。

这四个来源也不是完整活动日历：它们是待办、关系跟进、个人日程和约见的 home facts 摘要，不包含所有可能的事件、会议或活动，也不代表完整的活动时间线。

既有 UI 仍有三个需要独立接线和验证的事实问题：

1. appointment 来源异常目前可能显示成 0，而不是 unavailable。
2. 既有约见消费路径使用了错误的时间字段假设；真实约见 contract 是 `confirmed.startsAtUtc`。
3. 已结束活动缺少有证据支撑的报告文案；不能用“已结束”状态替代报告或证据。

此外，进行中的活动若开始时间在窗口外，按上述 starts-in-window 规则不会出现在本摘要中；接线时必须向产品明确这是 coverage，而不是把它偷偷改成滚动窗口。

W5 不修改这些既有 UI/page/realagent 路径，不声称它们已修复。

## 个人日程真实读取成本

个人日程现有成功路径的成本是 `1 + R` 次 `listRecords`/SELECT：1 次读取 actor authority collection 的全部 N 条记录，加上 R 个未取消个人重复系列分别读取全部例外。没有日期 SQL 下推，也没有 `LIMIT`；重复系列的例外读取用 `Promise.all` 并发。

七日窗口只收窄主 recurrence 展开；所有例外仍可能把窗口外的 anchor 补锚到窗口内。展示最多 3 条只是 route model 的显示截断，不是数据库读取上限。因此不能宣称 SQL 有界、成本已经受控或性能已上线就绪。真实成本和性能门应由后续独立接线/性能工作评估。

## 主协调后续风险（非 W5 调查或修复）

旧 `canonical-participant-event-journeys` 刻意使用 `rawSubject`，且 runtime 缺失时返回 `[]`。后续接线时需核查 raw/account 分离及 failure → `[]` 的 fail-open 风险。W3 profile 已确认 `accountId`；推荐的 explicit-live public catalogue 完整快照与 canonical 批量 membership 由 W3 另批，不复用这个 fail-open 旅程排除。此段是主报告风险记录，不是 W5 新调查或修复。
