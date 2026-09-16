# Sprint 0039 — 有依据的 AI 自主发现设计

本页落实[已确认产品规格](../../../../../docs/superpowers/specs/2026-09-16-notification-system-design.md)与[跨Sprint接口/策略](../NOTIFICATION_PROGRAM.md)。不另设运行状态或替代 Planner 验收。

已有信息→按actor与授权采集云端事实→有界提取→确定性资格/时间/去重→统一通知记录。变更触发与时间触发分开：源版本变化才做模型提取，已确认时间用确定性调度，不能用每分钟全库LLM循环。启动时只为已授权QA做有界发现，未经筛选的旧内容不补推。

来源适配器至少覆盖笔记/会议说明、允许分析的Orbit会话、任务/日程/约谈、目标及联系人事实；真实外部连接只在已授权且有数据时参与，缺连接在来源状态中明示。模型输出事实、推断、动作及来源引用；字段校验后还须由服务端重读源版本与权限。来源文本是数据而非指令，不能改变工具/发送权限。事实不足或对象歧义保存候选原因，不伪造完整通知。

带可信时间的承诺按规格时间规则入提醒，无日期但有具体价值入建议；相关性须有当前目标或实际需求支撑，90天未联系单独不合格。承诺作者不能误认；否定、转述、取消、完成、冲突与过期在资格层抑制。AI可自动入箱但不自动建待办/发消息；接受走0038的幂等动作。

同事项跨来源合并证据，保留稳定通知ID/read/disposition；补充任务后不多一条相同提醒。建议每天最多3条，7天或窗口结束过期，无新事实不续期。扫描/模型/重试/费用上限采用项目计划固定值，持久化游标、尝试数、租约及成本预留。关闭主动发现取消未执行任务；关闭消息分析不影响真实通信。Push开通留到0040，0039模型失败不影响用户提醒和真实动态。

## 依赖和边界

0038记录/动作/证据契约已经合并验证；复用0018/0019笔记与建议采纳、0024目标匹配、0029云端只读面。0036的全局收口不阻塞服务端已提交数据发现。

不接入新的邮箱/聊天平台、不读取本地未同步正文、不自动发送通信、不批量重建联系人关系、不增加费用上限；真实Push策略仍归0040。

## 验证原则

每项以 [PLANNER](PLANNER.md) 的5项SC为准，先行为反例再最小实现。新功能的真实业务证据必须来自当次构建的Web/API与原生App，权限/身份/状态不能用截图或mock证明。

## run-01 接线范围

采用独立已提交云端适配器，复用notes/task/schema与既有provider，不修改0036的query-service/manifest。新增discovery/{contract,preferences-service,service-factory}.ts、共享notification-discovery contract/schema、/api/inbox/discovery/preferences handler/route及两端设置组件；必要接线覆盖SC-01/02/05。默认消息分析关闭，单独显式开启；原通信发送/阅读不依赖该开关。

队列/游标/租约/语义映射/日配额及预算沿用orbit_records独立集合和事务，不建立进程内生产状态。来源包只取actor已提交数据、正文上限2000字符、明确关联对象/目标；每次调用前和入箱前重验。模型输出只提供引用和候选，服务端验证摘录/真实关联/日期，推断独立标识。无可信绑定或时间时记录不合格原因，不猜同名人或截止日期。消息使用权威会话+binding参与者授权，不借旧chat预览的默认分析状态当授权。

真实模型链因历史未知费用暂不能调用；该限制只影响付费运行证据，代码、离线反例、真实PG队列及设置仍继续。

run-01补充必要路径：discovery/README.md记录worker启动/限额/预算与恢复；App DiscoverySettingsContent.tsx拆出纯呈现供行为验证，NotificationDiscoverySettings.tsx负责授权网络生命周期；Web notification-discovery-settings.tsx同样只消费认证API。shared/contract与api-schema新增notification-discovery.ts，App仅同步。对应SC-01/04/05。

确定性日程补充：inbox-record-service.ts及其测试让未来scheduledFor不提前计入活动通知/未读。仅日期承诺用账号时区09:00提醒，晚发现则当日立即提醒，不把09:00写成截止时间；到该日结束失效。账号时区/手动语言复用当前profile与account-language存储。source-only事实与AI判断明确分栏文案，不把推断混入原文。

追加行为测试：notification-discovery-worker-postgres、extractor、prefilter、API preferences及App直接settings/account consumers，验证实际事务/第三次重试/费用拦截/旧账号迟到回执。0038晚加的inbox-meeting-precedence-postgres夹具targetType字面量在0039类型检查中发现，已改为现有schedule_item；不修改实际提醒协议。

运行中直接消费者补充：`repos/orbit-app/tests/app-wide-primitives.test.ts` 和 `tests/notifications/merged-notification-lifecycle.test.ts` 补全新增消费者所需的导航/组件测试边界；不降低断言。Web 新增 `app/(app)/app/inbox/{notification-source-view-model.ts,notification-source-page.tsx,sources/[id]/page.tsx}` 及 `tests/services/notification-source-navigation.test.ts`，修改 `typed-notifications-tab.tsx`：发现通知的 Web 来源入口重新授权后显示原文，笔记必须额外核对本人身份/笔记ID/证据版本；不把原生专用路由直接加 `/app`。App 消息来源使用已有 `/inbox/[id]`。归属 SC-01/02/05。
