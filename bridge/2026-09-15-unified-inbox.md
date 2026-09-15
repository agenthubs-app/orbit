# BR-024 — App 统一收件箱

- 创建/更新日期：2026-09-15
- 总状态：consumer_ready
- 优先级：P1
- 发起角色：E 线 Sprint 0030
- 下一责任方：运行数据／共同环境负责人
- web_status：source_ready
- app_status：consumer_ready
- verification_status：同账号 live Web/API 与 iOS Simulator 已验证真实待办投影、逐条 read、全部已读、下拉刷新和前后台持久；其余 live 类别受 QA payload 限制

## 变化

- App 默认收件箱由消息/提醒双页签、搜索和卡片布局改为 3a 扁平时间流：全部、活动、待办、人脉四个筛选，真实未读数和确认式“全部已读”。
- App 新增私有 feed adapter 与 batch coordinator；复用既有 conversation、notification、relationship signal API，没有改共享 DTO、Web source、数据库或 HIGH 风险 `relationshipAlertsToView`。
- 无显式 href 的旧 task reminder 只在 `followupTaskId` 合法时生成 `/tasks/<encoded-id>`；服务器若显式给出不安全 href，继续拒绝导航。

## 版本与接口

- 分支：`codex/e-line-sprint-0030`。
- 规划：`213a6681c`；产品与测试固定 HEAD：`4d351f0a0eddc1479eebb3a6b6852a466cad322d`。
- Web/API 运行版本：`d37d6545dc2a588fe595cea25f1c5991c0e93a77`；`http://127.0.0.1:31019`，Next production，health `live/ok`。
- 读取：`GET /api/relationship-communication/conversations`、`GET /api/notifications`、`GET /api/relationship-signals/email-calendar`。
- 写入：既有 `POST /api/notifications/:id/state` 与 conversation read endpoint；固定并发 4，逐项验证精确回执后刷新三源。

## 验收证据

- 自动化：inbox matrix 231/231；App typecheck；完整 App 2828/2828，0 fail、0 skip；原生构建 0 error、0 warning。
- 设计：780×1688 同视口 source/implementation 对照，P0/P1/P2 全部关闭，`design-qa.md` 为 passed。
- 身份：用户确认 Web 登录；`/api/account/me` 确认 App/Web 共用 canonical account `user_orbit_primary_qa`、中文偏好和同一 PostgreSQL record store。
- live payload：conversation 0；notification 40，全部为 task target 且无 occurrence timestamp；relationship signal 200，全部 pending 且早于 30 天。
- 原生：`全部 40`、待办 40；单项 read 后 39；批量完成后服务端 40/40 read、UI 0 unread；pull-to-refresh 与 background/foreground 后保持。

## 限制和关闭条件

- 现有 QA 数据没有当前 activity/contact/IORBIT/conversation，无法现场点击这些类别；没有为验收伪造行。
- 40 个历史提醒的 `followupTaskId` 与 `/api/tasks` 当前 1 个 task 的交集为 0；路由已打开，但详情按事实显示目标不存在。
- live partial failure 未通过破坏运行服务制造；确定性测试已覆盖 partial HTTP、错误回执、throw、stale scope 和重试。
- 关闭为 `verified` 的条件：在同一 QA 环境提供每个缺失类别至少一条当前且目标存在的记录，并提供受控单项 read failure；完成原生点击、恢复和 Web 回读。

## 更新历史

- 2026-09-15，E 线：Sprint 0030 实现完成；真实 task/read/refresh 链路通过，缺失类别和历史悬空 task 引用按实际 payload 登记。
