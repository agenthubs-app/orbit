# BR-027 — 有依据的自主发现

2026-09-16；功能4aa21961a，chat-agent合并131723ddb；web_status source_ready；app_status consumer_ready；verification_status blocked。

云端最小证据、独立消息分析授权、持久有界队列、事实资格、幂等去重/日限和累计费用预留已接线；两端设置和真实笔记双向回读、实际worker零模型调用阻断已验证。来源页重新授权，App使用真实路由。API/契约由Web拥有，App走sync:contract。完整证据、全量失败/定向修复与合并检查见[0039报告](../repos/orbit-app/docs/sprints/0039-evidence-based-notification-discovery/REPORT.md)。

原$5账本历史增量未知，专用provider未启用：真实发现→采纳及AI三语完整运行尚未验收。没有把测试provider当真实调用，也没有新Push。0040可在已固定协议上实现独立策略/迁移，依赖真实AI与设备的SC继续开放。与0033～0036无源码覆盖。
