# Sprint 0040 — 推送、旧数据切换与整体验收设计

本页落实[已确认产品规格](../../../../../docs/superpowers/specs/2026-09-16-notification-system-design.md)与[跨Sprint接口/策略](../NOTIFICATION_PROGRAM.md)。不另设运行状态或替代 Planner 验收。

统一策略在服务端计算账号时区日限、类别偏好、安静时段和有效性。自动AI推送每日最多2次，其中建议最多1次；普通建议静默。用户显式提醒不占AI预算，显式选定夜间时间可越过应用默认安静时段但不能绕过OS。跨设备共享通知记录和原子配额，设备回执独立；provider未知结果先对账，不无限重发。账号时区变化不得通过反复切换刷配额，保留已投递账本与窗口身份。

联系人消息使用独立偏好和每会话60秒声音窗口，会话静音仍保留应用内消息；没有AI限额或资格过滤。Push直达对应会话，其他通知直达具体对象/详情。锁屏默认隐藏正文，可选择显示；权限拒绝要如实显示状态且应用内功能继续。通知/消息两类开关不互相关闭。

投递前再校验源权限、完成、取消、过期、忽略和计划版本。每条提醒在每台设备每次计划投递只有一个owner（本地或服务端）；注册、撤销、登出及升级先完成取消/交接再启用新owner。重启与失败重试不重置身份，另一设备已经看到的OS横幅无法撤回，不作虚假承诺。安静时段结束只发送仍有效事项。

迁移分盘点→dry-run映射→已授权QA小范围apply→验证→按适用范围启用。逐条记录legacyId/newId、旧已读/用户计划、归档原因、源版本与批次；幂等可中断恢复。空话或无证据生成数据只归档，不重新变未读；保留原业务数据。旧自动T24h/T1h替换为统一30分钟前策略，用户明确选择的阶段保留。先停旧producer/调度或切到只投影模式，再启新发送器，禁止双写双响。回退按批次/版本恢复映射与未发送意图，已投递回执不能删除重放。

## 依赖和边界

0037～0039固定SHA已合并及对应验收完成；真实Push步骤需要可识别且授权的provider/project/token及可接收设备。缺Push环境不阻塞政策测试、迁移dry-run和同账号UI验证，但SC不得标全通过。

不扩大到生产数据清洗或未授权发布、不删原始业务数据、不清空账号/设备缓存、不用Simulator注入通知冒充远程送达。

## 验证原则

每项以 [PLANNER](PLANNER.md) 的5项SC为准，先行为反例再最小实现。新功能的真实业务证据必须来自当次构建的Web/API与原生App，权限/身份/状态不能用截图或mock证明。

## run-01 必要接线补充

- 复用 `notificationDeliveries`、pushDevices 和现有 provider；既有ledger新增可选policy source及typed领取lane，旧worker默认只领legacy。新 `features/notifications/{delivery-policy-repository,typed-delivery-worker,typed-delivery-source,typed-delivery-factory}.ts` 负责原子配额/声音窗口、发送前验证、既有账本执行，不建微服务。超时未知保持独立回执待对账，不盲目重发。
- 偏好扩展以 `notificationChannelPreferences` 保存类别/消息开关与CAS；锁屏/安静时段读取并原子更新既有 `notificationPreferences.entity`，避免两套隐私开关。新增 `shared/{contract,api-schema}/notification-delivery-policy.ts`、`app/api/inbox/delivery/{preferences,owner}` 及Web/App设置消费者；副本只走sync:contract。会话免打扰写入必须核对真实成员资格。
- `native-notifications.ts` 在新owner协议启用时先取消本机旧计划，成功才确认server owner；取消失败不确认。新worker仅对已完成交接的设备发送。`reminder-plan-service-factory.ts`/repository需让已切换actor的旧显式派发停止，计划/业务对象保留。`push-adapter.ts` 支持明确静音；通知响应仍只携带opaque deliveryId，经认证解析目的地。
- 必要直接消费者为 `RelationshipInboxScreen.tsx`、`NotificationLifecycle.tsx`、`OrbitNotificationsCoordinator.tsx` 及既有投递详情API。保持0035提示回调可组合，不改sync协调器/outbox/root layout。所有新增运行测试、migration CLI及路由/生命周期测试属于原SC-01～05。
- 全量回归发现0039 Web来源入口缺少原生同路径：新增 `app/inbox/sources/[id].tsx`，复用已有认证通知详情和来源动作；不复制另一套来源权限或页面状态。旧测试夹具需支持新增偏好只读请求/多个visibility监听器，保留原消息发送和切号断言。
- 迁移脚本 `scripts/migrate-notification-inbox.ts` 默认零写入，显式workspace/actor/batch/hash限定apply；每actor事务最多5000条，超限明确拒绝并要求分区方案。回退恢复未被用户改动的归档映射，保留所有发送回执和已抑制自动意图，legacy producer保持围栏，设备恢复local owner。新批次重新启用才交接server owner。
