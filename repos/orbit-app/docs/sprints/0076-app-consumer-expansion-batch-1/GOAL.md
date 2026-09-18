# Sprint 0076 — App 消费者扩面 · 第一批（待办链）

## 要实现什么

把原生 App 的"待办"页从"每次进入都拉 `/api/tasks`"改成"从本地镜像读、网络只做增量"：
数据源换成 0075 打通的租约→镜像→域页协议（`useSyncedCollection({ kind: "task" })`），
完成／重开一条待办后以镜像回读确认。Web（phoneweb）没有镜像层（0077 之前），
待办页在 Web 上保持现有网络读取——通过平台分流的数据源模块实现，屏幕本身只认一个接口。

顺带把一处"按主键查一条却写 `"unbounded"`"的服务端读取改成 `limit: 1`，棘轮往下走一格。

## 做完能看到什么

- Simulator：冷启动登录 → 进待办页 → 回首页 → 再进待办页；服务端日志里第二次**没有** `GET /api/tasks`，
  至多是 `/api/sync/domains/tasks` 的增量或什么都没有；列表内容与第一次一致。
- 在待办页勾掉一条待办：PATCH 成功后镜像回读确认，UI 显示已完成；不再有"改完等网络整表刷新"。
- phoneweb 的待办页与今天完全一样（仍走 `/api/tasks`）。
- `unbounded-list-reads.baseline.json` 从 174 降到 173，`connection-live-record-provider` 那条主键查询是 `limit: 1`。

## 怎么验收

App 全量 + typecheck；服务端定向集（棘轮审计、0070 账本、connections 测试）+ typecheck；
Simulator 上按上面的步骤看服务端日志与截图；phoneweb 待办页对照。不连云端、不部署。

完整验收项和启动条件见 [PLANNER.md](PLANNER.md)。当前状态见[登记表](../README.md#sprint-登记表)。
