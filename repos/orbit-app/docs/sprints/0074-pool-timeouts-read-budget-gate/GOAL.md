# Sprint 0074 — 连接池、超时与读预算熔断

## 要实现什么

两件事。第一，数据库连接池与超时不再"全局 1、没有超时"：按运行环境（Vercel serverless / 长驻 worker / 本地）
各配一套池大小、连接超时、空闲超时、查询超时，可用环境变量覆盖；0062 修过的"两个并发请求耗尽连接池互相等待"场景
在新配置下必须仍然通过。第二，新增进程内**读预算闸门**：把已有的读指标（每条 SQL 的行数、字节数）按滑动窗口累计，
超过阈值时对非关键读取（联系人、活动、笔记等列表）明确拒绝并给出可观测理由，而账号／授权读取与所有写路径不受影响。
闸门与生产已开启的 `ORBIT_PG_READ_METRICS` 日志共用同一条指标流，不重复打日志。

## 做完能看到什么

- `VERCEL=1` 时池是 2/2、查询超时 15 s；本地是 4/4、30 s；显式 `ORBIT_DB_RUNTIME=worker` 是 4/4、60 s；`ORBIT_DB_POOL_MAX` 等可覆盖。
- `select pg_sleep(1)` 在查询超时 200 ms 的客户端上被拒绝，连接池不被卡死。
- 设 `ORBIT_READ_BUDGET_ROWS_PER_MINUTE=50` 后，第一次列表读把窗口用掉，之后的 `/api/contacts` 返回 503、
  错误里写明"read budget exceeded: rows 1548/50 in 60s window"，而 `/api/account/me` 与新建待办仍正常；
  窗口过期后自动恢复。闸门状态变化只打一条 `read_budget_gate` 日志。
- 不设阈值时闸门不存在，行为与今天完全一样（生产是否开启是部署决定，本 Sprint 只交付机制与推荐值）。

## 怎么验收

本机：配置解析单测；真实 Postgres 上的超时与 0062 并发保存测试；闸门单测 + 经真实 configured 接线的 handler 级测试
（非关键读 503 有理由、关键读与写正常、窗口恢复）；orbits 全量对照；Simulator + phoneweb 无回归。
不连云端、不部署、不改生产环境变量。

完整验收项和启动条件见 [PLANNER.md](PLANNER.md)。当前状态见[登记表](../README.md#sprint-登记表)。
