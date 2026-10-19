# R14 REVIEW

**结论：未达收口验收；建议修复后复核。** 基于 `origin/redesign` `84fdda805` 的 R14 提交、PLANNER、REPORT、代码和证据日志。工作树保持干净，未修改或提交。

## S

未发现已证实的高危越权问题。

## M

1. **未授权的邮件摘要仍可经 API 开启。** [输入 schema](/Volumes/ORICO/Dev/worktrees/orbit/redesign/repos/orbits/shared/api-schema/notification-delivery-policy.ts:5) 接受 `secretaryMail:true`，[投递判定](/Volumes/ORICO/Dev/worktrees/orbit/redesign/repos/orbits/features/notifications/typed-delivery-source.ts:13) 随之放行 `mail_summary`。当前未找到该来源的生产者，故属潜在隐私风险，但与本期隐藏能力的决定不符。服务端应拒绝开启，并在投递层保持禁用，补负例测试。

2. **SC-15 未通过，“自身新失败 0”只能作有限结论。** [REPORT](/Volumes/ORICO/Dev/worktrees/orbit/redesign/docs/designs/redesign-2026-10/sprints/R14-push-notifications/REPORT.md:25) 记录三板像素 FAIL；证据日志显示 Web 全量 15 fail、2 cancelled，App 全量 38 fail、3 cancelled。App 串行复跑仅覆盖失败涉及的 18 个文件（484 pass、12 fail），支持“该集合未见新增稳定失败”，不能证明全量零新增。对齐三板并复跑门禁及全量，再按同一基线逐名比较。

3. **活动文件越过 R14 文件边界。** 提交 `42281428d` 修改 [R27 活动通知](/Volumes/ORICO/Dev/worktrees/orbit/redesign/repos/orbits/features/events/journey/notifications.ts:60)，而 [PLANNER](/Volumes/ORICO/Dev/worktrees/orbit/redesign/docs/designs/redesign-2026-10/sprints/R14-push-notifications/PLANNER.md:53) 指定该目录由事件线处理、R14 提交请求。修复方向正确，但 REPORT 未给出跨线批准依据；请主会话补审批及事件线交接记录。

## m

- [typed delivery 日志](/Volumes/ORICO/Dev/worktrees/orbit/redesign/repos/orbits/features/notifications/typed-delivery-factory.ts:43) 在缺表时输出原始 `actorId`。这是 R14 复用路径中的存量隐私问题；改为不记录账号标识或记录不可逆摘要。

## 核实通过项

定向复跑 Web 16/16、App 6/6。现有契约字段未改形，读响应宽进、写请求严格；未新增同步 DTO 或离线 outbox 字段。账号级配额预留、digest 幂等及发送前重判有代码和定向测试。新静态路由已登记，旧设置组件仍有引用而被保留；未发现 R14 修改组件库、token 或导航壳。Web 登录跳转目标为固定路径，远程推送 payload 仅含 `deliveryId`。