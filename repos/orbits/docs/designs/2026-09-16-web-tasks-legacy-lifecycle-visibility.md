# Web Tasks 中的 legacy 人脉生命周期可见性

## 2026-09-16 R1 完成入口增量

用户批准五项闭环后，在保留原集合与语义的基础上补充：

- 当前有效关联任务新增 `/app/tasks/relationship/:connectionId` 处理入口，历史和孤儿项不提供完成操作。联系人详情仍保留来源展示，不假装已有编辑器。
- 新 `GET /api/connections/:id/lifecycle` 返回当前 actor 的事务快照；同路径 `POST` 严格验证 task ID、两个 expected version、幂等键及四种显式 outcome，并复用既有 `completeTask` 服务。未知账号/关联拒绝，不接收客户端 owner。
- App 用 `GET /api/relationship-tasks` 读取同一 actor 的关系任务；契约/schema 经既有 sync 通道。普通 Task API 保持不变。
- 新跟进任务会在原事务内保存用户确认操作的真实 evidence，再引用该证据，修复旧 source-linked reader 因空 evidenceIds 隐藏新任务的问题。回滚包含 evidence，不补造过去事实。
- 两端失败保留输入、重试复用原意图、显式刷新云端版本。归档需确认忽略其余未完成跟进；不发外部消息。

当前本地验证：API 四种结果、两版本、重放及权限；隔离 PostgreSQL 并发／回滚和 Web 列表 28/28。线上与原生验收另记，不能由本地测试推定完成。以下初始只读方案保留为历史基线。

## 目的

解决 canonical generic Task API 无法解码旧 `TaskDTO` 时，关系生命周期任务在 Web Tasks 页面不可见的问题。

## 方案

- `/app/tasks` 先解析当前 authenticated actor，再通过现有 followup live-record provider 读取 actor-scoped graph。
- 从当前 actor 的 legacy task 图构建只读视图；`open/scheduled` 计入当前跟进，`completed/dismissed` 放到历史折叠分区。缺失联系人、缺失连接或相互不一致的记录单列为无法关联，不生成猜测链接。
- 保留 legacy status（`open`、`scheduled`、`completed`、`dismissed`）和 `dueAt` 语义，不转换为 `TaskItemDTO`。
- 人脉 section 是独立只读入口。每项只在关系图解析出联系人时链接联系人详情；孤儿记录显示未关联且不可查看。
- 页面提示“跟进完成操作尚未接入此页面；当前仅查看记录”，不会自动完成、推断 outcome、创建 reminder/event/activity，也不会调用 generic task API 写入。
- provider 未配置、读取失败或没有关联记录时显示明确的空/不可用状态，不伪造任务。

## 边界

本方案不修改 canonical task service/repository/decoder、legacy writers 或 relationship lifecycle 写语义。当前 section 只提供查看联系人和跟进记录的入口，不完成生命周期操作，也不替代下一步选择。

当前联系人详情的关系阶段为来源数据只读展示，尚未提供跟进完成或 outcome 选择控件；该缺口列入 R1 最小剩余项，本轮不新增写接口或替代 lifecycle。

刷新浏览器会重新读取服务端关系图；该分区没有本地业务副本。普通待办自己的刷新/筛选仍只作用于普通待办，不能据此宣称两个任务域已统一完成。
