# Sprint 0038 — 三类通知与统一记录设计

本页落实[已确认产品规格](../../../../../docs/superpowers/specs/2026-09-16-notification-system-design.md)与[跨Sprint接口/策略](../NOTIFICATION_PROGRAM.md)。不另设运行状态或替代 Planner 验收。

列表首行：类别图标、具体标题、出现时间；次行：最多两行原因或变化；底部：来源标签和一个主操作。提醒的截止/提醒时间与动态的发生时间使用不同标签，不能把 createdAt 当到期。详情显示事实、来源和动作，原文保持原语言。失效/历史处理状态可查，默认未读不计过期建议；30天以上仍有效未处理提醒保留。

采用项目计划中的新接口和记录模型，来源授权先于响应序列化；禁止将 actorId 当客户端可信参数。通知读面持久化，旧消费者兼容窗口保留。先为 QA actor 启用新读面；迁移前旧真实提醒通过稳定 legacy→notification 映射保留原已读和用户计划，不全量导入噪声。新用户提醒仍由唯一旧执行链投递，0038 不另起发送器。

生产者映射：用户待办/日程明确提醒→提醒；约谈提议/反提议/确认/改期/取消→动态；名片完成/需复核按批次合一条动态；需要用户处理的连接失效→动态。自己的保存/完成、每张名片中间进度不入箱。旧关系信号只有后续0039资格判断后才能入建议，不直接搬运空话。

动作具有 expectedRevision 与幂等回执；重复接受同一建议只产生一个真实任务，授权和源版本变更导致409或不可用。批量已读快照分页提交明确 IDs，不能误标新到记录。snooze 存显式时间并更新计划版本；接受/业务完成只调用原业务服务。词汇表的系统通知改为投递渠道，区分通信内容、通知记录和业务对象。

## 依赖和边界

0037 固定 SHA 已合并且相关验证通过；复用原提醒、约谈投影、批次处理与0019采纳任务链。

不实现模型发现、不重放全部历史、不新增Push执行者、不重写任务/通信服务，不将旧followup空话翻译后当新通知。

## 验证原则

每项以 [PLANNER](PLANNER.md) 的5项SC为准，先行为反例再最小实现。新功能的真实业务证据必须来自当次构建的Web/API与原生App，权限/身份/状态不能用截图或mock证明。

## run-01 实施接线（2026-09-16）

新增 inbox-record-service-factory、inbox-business-projections、inbox-business-refresh、API handler 与 Web typed-notifications-tab / notification-inbox-view-model；App新增 useNotificationInbox、typed DTO解码器、详情私有路由，复用既有前台请求生命周期。首页/AI共用未读hook接新计数，直接消费者测试随账号级开关增加明确 disabled 响应。各路径对应SC-01～05，不改0033同步模块。

持久化复用orbit_records的独立inboxNotifications集合，事务和账号锁覆盖通知、动作回执与既有任务采纳/提醒计划；未建进程内生产仓库或另一发送器。业务投影在新API读取时从持久业务事实补齐，显式提醒保留稳定legacyId；约谈历史按对方实际动作生成、名片按批次聚合、未连接外部服务不伪造连接事件。先由ORBIT_TYPED_INBOX_ACTORS精确启用QA账号，ORBIT_TYPED_INBOX_SINCE限制业务变化回放。0039再负责发现队列，0040负责投递和迁移。

收口补充：App的route inventory/private gate、首页和AI入口、badge lifecycle及workspace直接消费者测试同步新路由和账号开关；对应SC-04/05。CONTEXT增加联系人消息/通知记录定义并澄清系统通知是投递渠道。自动会前提醒依据personal_schedule_items.meetingId关联显式计划，避免猜测schedule ID。分类/历史筛选只影响条目，不改变全局未读计数。

运行验收修正：用户提醒只标scheduledFor，不把fireAt当业务截止时间；约谈确认按该提议时区展示，不把提议第一个候选当已确认时间，也不把新版确认时间写进旧历史。投影文案纠正保持同ID/read/disposition。新增inbox-reminder-policy.ts和inbox-meeting-precedence-postgres.test.ts，共用显式计划优先规则；用户在自动提醒已生成后另设计划也抑制自动条目，真实PG反例已复现并修复。
