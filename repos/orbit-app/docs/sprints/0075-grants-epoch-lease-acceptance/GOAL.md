# Sprint 0075 — grants / epoch / lease 真实验收与 0033–0036 收口

## 要实现什么

补上登记表点名的三个缺项，让 App 的 v2 本地镜像在生产接线下真的能用：

1. **服务端真实 grants 与授权纪元**：`GET /api/sync/lease` 按当前登录人签发离线读取租约（App 既有契约 `OfflineReadEnvelope v2`），
   每个已注册域一条 grant，`authorizationEpoch` 由该账号的授权记录（accounts / auth_users / permissions）真实推导——撤权或权限变化就换纪元；
   `GET /api/sync/manifest` 与 `GET /api/sync/domains/:id` 按域分页，游标绑定 actor / workspace / domain / schema / registry / epoch。
2. **存储初始化与认证绑定**：App 的同步协调器拿到租约后才打开镜像，把 grants 变成仓库的 `activeReadScopes`；
   当前生产代码 `createLocalSyncRepository({ actorId, database })` 没有任何作用域绑定，v2 仓库的每次读都会抛 "read scope epoch is not bound"——这就是 0033 一直 running 的根因之一。
3. **纪元变更强制全量重建、撤权后镜像不可读**：租约里某域纪元变了，旧纪元的行、游标、可读状态整体清除，重新全量拉；
   租约里没有该域（撤权），域镜像清空且 `listRecords` 返回空。

拿到证据后为 0033 / 0034 / 0035 / 0036 各写 REPORT.md，登记表按实际证据更新——**不预填通过**。

## 做完能看到什么

- 本机三层拓扑：A、B 两个真实账号各自登录，A 的 lease/manifest/domain page 一行 B 的数据都没有；A 的游标拿 B 的会话来用被拒；
  把 A 的 `auth_users` 记录软删后，A 的 lease 没有 grants、manifest 为空、domain page 拒绝。
- App 协调器测试：租约 → 打开镜像 → 按域拉页 → `listRecords` 有数据；换纪元 → 旧行清空、重新全量；撤权 → 域清空。
- Simulator / phoneweb 无回归（屏幕尚未接 useSyncedCollection，属 0076）。

## 怎么验收

全部本机：orbits 单测 + 真实 PG 三层拓扑 + 两个真实账号的 HTTP 负例；App 协调器与仓库单测；两端全量对照；Simulator + phoneweb。
不连云端，不部署。

完整验收项和启动条件见 [PLANNER.md](PLANNER.md)。当前状态见[登记表](../README.md#sprint-登记表)。
