# BR-020 — App canonical account identity

- 创建/更新日期：2026-09-15
- 总状态：verified
- 优先级：P1
- 发起角色：Bridge
- 下一责任方及是否已接单：已完成，无待接单项
- web_status：source_ready
- app_status：consumer_ready
- verification_status：App 身份解析、owner-scoped 消费者、完整回归、当前 live Web health 和登录态 iOS Simulator 已验证
- 依赖/阻塞：无；远程部署与实体设备属于发布验收
- 设计/实现/发布授权来源（如适用）：用户批准追加 C 线 Sprint 0026，并授权连续实施

## 变化与证据

- 旧行为 → 新行为：App 曾把 Auth.js raw `userId` 当作业务 `accountId`，两者不同时会误拒合法待办／日程／笔记；现在登录或恢复会话后从 `GET /api/account/me` 取得唯一 canonical account identity。
- Web/API：复用现有 `/api/account/me`，不修改 Web 代码、HTTP 字段、数据库或共享契约。当前匿名请求保持 401，health 为 `live/ok`。
- App：`AuthSessionProvider` 同时暴露 raw `user` 与 canonical `accountId`／`actorId`；owner-scoped 业务、快照、草稿、回执、AI intent、人脉、消息和邀请使用 canonical actor。
- 失败边界：账号响应失败、未登录、缺字段或空 ID 时 fail closed；不回退 raw ID，不从业务响应猜 owner。foreign owner 仍被拒绝。
- 兼容：活动会话、名片导入 session scope、认证和密码重置保留 raw subject；逐项理由见 [身份审计](../repos/orbit-app/docs/sprints/0026-canonical-app-account-identity/IDENTITY_AUDIT.md)。
- 版本：功能 `f5f595df4`；邀请 scope 补漏 `3385369dd`。

## 验收结果

- App `npm run typecheck` 与最终完整测试 exit 0；身份、快照、任务、日程、笔记、AI、人脉、消息和邀请定向测试通过。
- iOS 当前源码构建 0 error／0 warning；Simulator `9BF990F2-45B8-42CE-8543-E583B941DA17` 指向 C 线 8082 bundle，登录恢复后读取 54 条未完成待办、3 条当日日程，并打开笔记工作区。
- 当前 Web `http://127.0.0.1:3000/api/health` 返回 live/ok；本 Sprint 不修改 Web，因此未重建或重启生产服务。
- `useApiResource` 上游影响为 CRITICAL；最终 staged detect_changes 为 HIGH，已用完整 App 回归覆盖。邀请组件在陈旧索引中未找到，实际以精确源码断言和关系通信组合测试覆盖。
- 本地运行不代表远程部署、实体设备或生产数据验收；没有外部写入。

## 更新历史

- 2026-09-15 15:20 JST，Sprint 0026 run-01 启动并冻结 raw login subject／canonical account 边界。
- 2026-09-15 16:13 JST，功能与邀请 scope 补漏完成；自动化、构建、Web health、Simulator 三条读取链和最终身份审计通过，BR-020 更新为 verified。
