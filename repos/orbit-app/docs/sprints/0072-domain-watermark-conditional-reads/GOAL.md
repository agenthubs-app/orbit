# Sprint 0072 — 域水位线与条件请求

## 要实现什么

给最常被 App 反复拉取的 6 条 GET 路由（tasks / notes / schedule-items / contacts / connections / events）
加一道"没变就不读"的闸：服务端先用一条走索引、只回一行的水位线查询（`max(updated_at)` + `count(*)`）
算出这次响应会依赖的数据版本，做成 ETag；客户端带上上次的 ETag，没变就回 **304、零行业务读**，
客户端用上次的响应体。任何依赖集合的新增／修改／删除、以及账号授权相关集合的变化，都立刻让 ETag 失配。

App 端 `client.ts` 学会带 `If-None-Match` 并在 304 时回放上一次的 JSON（只放内存，不落盘）。
phoneweb 走同一个 client，自动受益。

## 做完能看到什么

- 同一账号连拉两次 `/api/tasks`：第一次 200 带 `ETag`，第二次 304、服务端只做了 1 条 SQL（1 行、几十字节）。
- 写入一条待办后再拉：立刻 200，ETag 变了。B 写自己的待办，A 的 ETag 不变（私有域按 `user_id` 分水位）。
- 改 `accounts` / `auth_users` / `permissions` 任一集合里该 workspace 的记录：所有路由的 ETag 都失配。
- App 里进入待办页两次，第二次网络请求是 304，页面数据仍完整。

## 怎么验收

本机跑：水位线查询在真实 Postgres 上走索引且只回 1 行（EXPLAIN + 读指标）；6 条路由的 handler 级测试
（200 → 304 → 写入 → 200）；跨账号与授权集合的失配用 0070 的三层拓扑夹具验；App client 单测；
两端 typecheck；App 全量 + orbits 全量前后对照（H 档）；Simulator + phoneweb 各进两次待办页看到 304。

完整验收项和启动条件见 [PLANNER.md](PLANNER.md)。当前状态见[登记表](../README.md#sprint-登记表)。
