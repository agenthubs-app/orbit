# Sprint 0036 — AI 全域读取与跨端验收

让用户已授权给 AI 的每个数据域都有可追溯的云端查询入口，并能明确分辨 AI 已看到的版本和仍留在本机的变化。

- AI 能按授权读取历史 AI 对话、联系人、人脉证据、消息、通知、笔记、任务、跟进、日程、会议、活动、目标和用户可见的 Agent 数据；未开启 AI 能力的离线数据仍不可读。
- 每次查询有字段白名单、有界分页、云端 revision、读取时间和证据引用；局部结果不会被表述成完整历史，删除或撤权后不能继续读旧正文。
- App 按领域和数量提示 pending、conflict、failed 变化尚未被 AI 看到；服务端确认并取得相应 canonical revision 后才消除提示。本地正文和设备草稿不进入 AI 请求。
- 数据审查文档和私有 Data Atlas 逐域说明权威来源、存储、离线读写、AI 读、同步状态和剩余限制。
- 在同版本 production Web/API、连接主线 Metro 的 iOS Simulator 和已授权 AI provider 上，证明各业务族新增、修改、删除、撤权、离线冷启动与恢复后的数据边界一致。

验收以 [PLANNER.md](PLANNER.md) 的五项 SC 为准，逐步执行计划见 [实施计划](../../../../../docs/superpowers/plans/2026-09-16-sprint-0036-ai-coverage-acceptance.md)。本页说明预期结果，不代表已经实现或通过验收。
