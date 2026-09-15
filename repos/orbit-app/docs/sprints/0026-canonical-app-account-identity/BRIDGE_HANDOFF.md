# Sprint 0026 — Bridge 交接

- Bridge ID：`BR-020`。
- 状态：`verified`。
- Web/API：`source_ready`；本 Sprint 没有修改 Web 产品代码或共享契约。既有 `GET /api/account/me` 继续提供 `account.id`，匿名请求返回 401。
- App：`consumer_ready`；功能提交 `f5f595df4`，邀请 scope 补漏 `3385369dd`。
- 用户可见结果：登录主体 ID 与业务账号 ID 不同时，待办、个人日程、笔记及相关 AI／人脉／消息入口不再把合法 owner 当成外部账号。
- 失败策略：账号接口失败、未登录、缺少或空的 `account.id` 时保持未登录边界；不回退 raw ID，不从业务记录猜 owner。
- 兼容边界：活动会话、名片导入 session scope、认证和密码重置继续使用 raw login subject；理由见 [IDENTITY_AUDIT.md](IDENTITY_AUDIT.md)。
- 运行证据：当前 `http://127.0.0.1:3000/api/health` 为 `live/ok`；iOS Simulator `9BF990F2-45B8-42CE-8543-E583B941DA17` 在 8082 bundle 下恢复登录并读取待办、个人日程和笔记工作区。iOS 当前源码构建 0 error／0 warning。
- 下游约束：新增业务 owner、actor-scoped cache／draft／receipt 时使用 `auth.actorId`；只有契约明确是认证 session subject 时才使用 `auth.user.id`，并在审计表记录理由。
- 发布边界：本地 Web 服务和 Simulator 验证不代表远程部署或实体设备发布；本 Sprint 没有写生产数据库或外部服务。
