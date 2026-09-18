# Sprint 0069 — 增量同步存量归位主线

## 要实现什么

把 `codex/sprint-0033-incremental-read-sync` 上已经写好的增量同步实现合回 `chat-agent`：
服务端 `/api/sync` 路由与游标／读取服务，App 侧 sync-client / sync-coordinator / sync-freshness /
`useSyncedCollection` 钩子，以及已经接上这套读路径的 8 个屏幕（notes×4、schedule×2、tasks×2）。
主线上的本地 SQLite schema 已经演进到 v2（epoch 作用域），归位时**以主线 v2 为基**，把分支的加法 API
移植上去，绝不把 schema 退回 v1。

## 做完能看到什么

- 主线出现 `GET /api/sync` 路由；App 侧 8 个屏幕通过 `useSyncedCollection` 从本地镜像读数据，
  网络只负责推进游标。
- 在 Simulator 上进入笔记／个人日程／待办任一屏幕两次：第二次进入不再对该集合发起业务 GET，
  数据来自本地镜像；服务端日志能看到第一次的 `/api/sync` 拉取与第二次的静默。
- 主线既有的 v1→v2 本地迁移、epoch 作用域、`applyDomainPage`／`resetDomain` 全部保留；
  分支新增的 `getLastWorkspaceId`／`resetWorkspace`／`applyPage` 的 `canCommit` 取消语义在 v2 上可用。

## 怎么验收

先用 Git 事实确认分支已成主线祖先、22 个文件就位。
再用 App 全量做同环境前后对照（0068 收口时为 3452 全绿），零新增失败；
两端 typecheck 0；分支自带 10 个测试文件在主线全绿。
最后按常设要求在 Simulator 实跑：一个已接线屏幕的"两次进入"行为，以及 phoneweb 上同一屏幕仍可用。

本 Sprint 只做归位，不补 grants／epoch 真实验收（那是 0075），不扩面（那是 0076）。
完整验收项和启动条件见 [PLANNER.md](PLANNER.md)。当前状态见[登记表](../README.md#sprint-登记表)。
