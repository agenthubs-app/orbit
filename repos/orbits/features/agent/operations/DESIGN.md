# Agent Operations Health

这个模块只回答“Agent 的后台能力是否真的在运行”，不保存用户关系内容，也不替代
Run/Action 账本。

- 心跳按 actor 与 workspace 隔离，只保存 worker id、时间和本轮处理数量。
- 120 秒内的心跳视为 healthy；更早的记录为 stale；没有记录为 not_seen。
- CLI worker 默认每 30 秒写一次，避免按 2 秒轮询频率持续写数据库。
- 内部 HTTP worker 每次完成调用后也写同一心跳。
- 用户 API 只返回脱敏状态：AI key 是否已配置、是否使用持久化数据库、worker 新鲜度
  和外部写入策略。密钥、连接串、token、prompt 与关系数据永不进入该响应。
- 心跳写入失败不会中断 outbox 或 Playbook；worker 会输出结构化
  `AGENT_HEARTBEAT_FAILED` 诊断并继续处理业务任务。
