# Sprint 0078 — Web 消费者接入增量同步

## 要实现什么

让 0077 建好的浏览器镜像真的被用起来：协调器接上 `/api/sync/manifest`——每次同步先拿一份各域水位线，
和本地游标记住的水位线一比，没变的域一页都不拉；服务端把 manifest 做成条件读（ETag／304），于是"数据没变"的
一次同步只碰授权行和水位线，业务表一行不读。Web 的 `/tasks` 路由从"每次都请求 `/api/tasks`"改成"镜像优先 + 后台
增量"，能力不可用（非 HTTPS、无 OPFS 等）时仍走网络。状态文案与原生同一套（本地就绪／同步中／最新／已过期／失败）。

## 做完能看到什么

- phoneweb（localhost）第一次进 `/tasks`：lease → manifest → 域页；再进一次：0 次业务请求；强制刷新：lease + manifest（304），无域页。
- 断网后刷新 `/tasks`：列表仍在，标"已过期"；镜像为空且下载失败：显示错误，不是空列表。
- 登出：浏览器库与密钥一起清掉；再登录从零拉取。
- 静态导出的首屏（SSR HTML）不依赖镜像，导出成功。
- 原生：本地 schema 升到 v3（游标多一列水位线），Simulator 待办页与 0076 一致。

## 怎么验收

协调器单测（manifest 未变 → 0 次域页）；服务端 manifest 304 单测 + PG 三层拓扑（第二次同步 0 行业务读）；
Web 源选择单测；Playwright 真实 Chromium 跑离线／错误态；phoneweb 网络请求清单截图；Simulator 对照；App 全量与两端 typecheck。
个人日程域已在白名单内并会被同步，但 Web 没有独立的个人日程列表路由，消费者接入留第二批。

完整验收项和启动条件见 [PLANNER.md](PLANNER.md)。当前状态见[登记表](../README.md#sprint-登记表)。
