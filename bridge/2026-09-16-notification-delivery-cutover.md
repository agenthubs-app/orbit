# BR-028 — 通知投递与旧流切换

2026-09-16；功能 `eacd7a227`；chat-agent合并 `0b552649d`。web_status source_ready；app_status consumer_ready；verification_status blocked。

Web/API提供四通道系统推送偏好、会话免打扰、安静时段、隐私和CAS，事务配额/声音窗口，typed source/worker及actor级迁移。App同步共享契约，取消本地计划后按generation确认所有权，响应opaque deliveryId后认证解析目的地。消息独立于AI分析授权，关闭AI/免打扰仍能在会话中阅读。

当前production Web与iPhone17Pro共同QA已完成偏好双向读写、真实消息入站、三语设置与迁移/回滚对账；14条业务记录不变。合并树Web16/16、App129/129、两端typecheck通过；两端一次全量的失败和修复后复验保留在[0040报告](../repos/orbit-app/docs/sprints/0040-notification-delivery-cutover/REPORT.md)，不声称全量通过。

真实AI历史费用/专用provider仍缺；远程Push项目、密钥/设备注册和接收设备均缺，未完成实际交接与送达。本轮原生回复自动化未取得新出站message回执，保留未确认状态。恢复需补齐报告列明的真实条件，不能用测试provider或Simulator注入替代。关闭run、暂停本线20分钟跟进和发现watch，保留31037 Web供查看。

没有覆盖0033～0036的sync/outbox/query-service/manifest及另一线运行环境。0035后续消费通知协调器时须保留通知处理及身份失效行为，并验证与同步提示组合。回退按批次/version恢复未改动映射，旧自动producer继续隔离，不删除用户计划或投递回执；完整操作见Web `features/notifications/DELIVERY.md`。
