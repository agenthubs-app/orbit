# Sprint 0026 — App 统一账号身份

## 要实现什么

让 App 从账号接口取得 canonical account ID，并用它校验待办、个人日程、笔记及本地账号隔离数据，避免登录主体 ID 与业务 owner ID 不同的合法账号被误判为无权访问。

## 做完能看到什么

- 用户正常登录后，待办列表／详情、个人日程列表／详情和笔记列表／详情／编辑都能显示属于该账号的数据。
- 登录主体 ID 继续用于登录会话；业务 owner 校验、本地快照、草稿和 AI 预填回执统一使用 canonical account ID。
- `/api/account/me` 失败、缺字段或返回另一种结构时，App 不从第一条业务记录猜测 owner，也不放宽越权校验；外部账号数据仍被拒绝。

## 怎么验收

用 `userId != accountId`、两者相同、账号接口失败和外部 owner 四组夹具覆盖身份解析及三条业务链，再在当前 iOS Simulator 用真实登录会话恢复待办、个人日程和笔记。App 跑定向、类型检查和全量测试，并确认当前 Web/API 生产进程健康、账号契约未漂移。

完整范围和验收项见 [PLANNER.md](PLANNER.md)。本页不表示已经实现；状态以[登记表](../README.md#sprint-登记表)和执行后的 REPORT 为准。
