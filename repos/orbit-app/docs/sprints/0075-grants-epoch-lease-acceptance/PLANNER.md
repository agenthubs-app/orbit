# Sprint 0075 — grants / epoch / lease 真实验收与 0033–0036 收口

**Plan revision:** 1。**模式:** existing-codebase / single-generator。运行状态只在登记表。
**原需求:** 读取成本治理设计案 Rev 4 第 11 节 Phase C 首项（0075）；0033 DESIGN.md 第 17 节读取协议。
**单一目标:** 服务端签发真实 grants／epoch／lease，App 镜像按租约绑定作用域；纪元变更全量重建、越权拉取被拒、撤权镜像不可读，全部有本机证据。
**易读目标:** [GOAL.md](GOAL.md)。
**基线:** `chat-agent` = `543627493`（0074 completed）。
**进入条件:** 0069、0070 completed。只用本机 Postgres 与本机 Web/API，不连云端，不部署。

## 已查明的事实与本 Sprint 的核心判断

| 事实 | 数据 |
| --- | --- |
| 契约已存在且两端同源 | `universal-read.ts`（server／App 逐字相同）：`OfflineReadEnvelope v2 {grants[{workspaceId, domainId, authorizationEpoch}], databaseKeyRef…}`、`DomainManifest`、`DomainPage`、`CursorClaims`；App 的 `evaluateOfflineRead / assertOfflineReadGrant` 已实现租约规则 |
| 服务端只有 `/api/sync`（v1 混合页） | 无 lease／manifest／domains 路由；v1 游标只绑 actor/workspace |
| App 生产接线断裂 | `sync-coordinator.ts:134` `createLocalSyncRepository({ actorId, database })` 无 `registeredDomainIds`／`activeReadScopes` → v2 仓库任何读写都抛 `read scope epoch is not bound`；v1 `applyPage` 对混合 kind 页抛 `legacy page spans domains`。即：**当前生产路径与 v2 存储不可能一起工作** |
| App 域 id | `LEGACY_DOMAINS`：note→`notes`、task→`tasks`、personal_schedule→`personal-schedule`（另有 contacts／followups／notifications 未在 sync 集合内） |
| 服务端可同步集合 | `notes / tasks / personal_schedule_items`（有 `sync_revision` 与写锁触发器，0069） |
| 本机账号 | `qa@orbit.test`（密码在会话内，不回显）；第二账号需本机新建 |

**判断 1：授权纪元由授权数据推导，不新建表。** `epoch = sha256(actorId, workspaceId, 该账号在 accounts/auth_users/permissions 的水位指纹)` 前 32 位；账号的 `auth_users` 记录软删即"未授权"（无 grants）。可验证、可复现、与 0072 的授权水位同源。
**判断 2：注册表 v1 只含三个 sync 集合。** contacts 等 workspace 域的按人过滤仍在 0076／后续；本 Sprint 不假装它们已可镜像。
**判断 3：协调器改走域页协议。** 租约 → manifest → 逐域 `domains/:id` → `applyDomainPage`。旧 `/api/sync` 路由保留不删（0069 的验收脚本依赖），App 不再调用它。
**判断 4：0033–0036 的 REPORT 只写证据能支撑的状态。** 预计 0033 由 running 改为 blocked（全域覆盖未达，但身份／存储／协议三块已有真实证据），0034／0035／0036 维持 blocked 并写明缺项。

## 范围与文件

- 新建（orbits）：`features/sync/domain-registry.ts`、`features/sync/authorization-epoch.ts`、`features/sync/domain-cursor.ts`（v2 claims）、`features/sync/domain-read-service.ts`（复用 0069 的行映射）、`app/api/sync/lease/route.ts`、`app/api/sync/manifest/route.ts`、`app/api/sync/domains/[domainId]/route.ts` + 共用 `app/api/sync/domain-handlers.ts`。
- 新建（orbits 测试）：`tests/api/sync-lease-manifest-domains.test.ts`、`tests/services/sync-domain-topology-postgres.test.ts`。
- 修改（App）：`src/data/sync/sync-client.ts`（+lease/manifest/domain page）、`src/data/sync/sync-coordinator.ts`（租约绑定、域页拉取、纪元变更重建、撤权清空）、`src/data/sync/local-sync-repository.ts`（+`retireEpochs`）、`src/data/offline-read/route-domain-inventory.ts`（登记新端点）。
- 新建（App 测试）：`tests/sync-coordinator-lease.test.ts`；修改 `tests/local-sync-repository.test.ts`（retireEpochs）。
- 文档：`0033/0034/0035/0036/REPORT.md`；登记表。
- 排除：屏幕接线（0076）；contacts 等 workspace 域镜像；资源 manifest；Web 镜像（0077）；AI 可见性验收（0036 自身）；云端。

## 验收契约

| SC | 可观察行为 | 必需证据 |
| --- | --- | --- |
| SC-0075-01 | **真实 grants／epoch／lease**：`/api/sync/lease` 返回通过 App `offlineReadEnvelopeSchema` 的 v2 信封，grants 覆盖注册表三域，`offlineReadExpiresAt ≤ sessionExpiresAt`；`/api/sync/manifest` 每域 epoch 与 lease 一致；`/api/sync/domains/:id` 返回 `DomainPage`，游标 claims 含 epoch／generation／registry；授权集合写入后 epoch 改变，旧游标 → 409 `SYNC_RESET_REQUIRED` | 单测 + PG 拓扑测试 |
| SC-0075-02 | **跨 actor 越权被拒（真实双账号）**：本机两个真实账号登录，A 的 domain page 无 B 行；A 的游标由 B 的会话出示 → 409；B 的 manifest 不含 A 的水位；PG 拓扑测试同样断言 | curl 记录（不回显凭据）+ 测试 |
| SC-0075-03 | **纪元变更强制全量重建；撤权镜像不可读**：App 协调器在租约纪元变化时清除旧纪元行／游标／可读状态并重新全量拉取（`listRecords` 先空后满）；租约不含某域时该域 `listRecords` 为空且旧行已删；服务端把 A 的 `auth_users` 软删后 lease 无 grants、manifest 空、domain page 拒绝 | App 协调器测试 + 仓库测试 + PG 拓扑测试 |
| SC-0075-04 | **生产接线可用**：`useSyncedCollection` 所走的协调器路径在 fake HTTP 下完成 租约→镜像→域页→读取，不再出现 `read scope epoch is not bound`／`legacy page spans domains`；用本机 Web/API + qa 账号跑一段 Node 脚本走完真实 HTTP 链（lease→manifest→domains→本地 SQLite）并读回记录数 | 测试 + 脚本输出 |
| SC-0075-05 | **收口与无回归**：0033–0036 四份 REPORT 按证据写状态并更新登记表；App 全量、orbits 全量与 0074 收口对照零新增失败；两端 typecheck 0；Simulator + phoneweb 无回归 | 摘要、截图 |

## 一次 Generator 的执行顺序

1. 记录基线、`git status --short`、Planner SHA256，登记 run-01。
2. RED→GREEN（orbits）：registry／epoch／cursor v2／domain read service 单测 → 三条路由 → PG 拓扑测试。
3. RED→GREEN（App）：`retireEpochs` 仓库测试；协调器租约测试（fake client）；sync-client 扩展；inventory 登记。
4. 本机双账号 HTTP 负例（新建第二账号，凭据只存 scratchpad）；Node 脚本跑真实链。
5. 两端全量 + typecheck；Simulator + phoneweb。
6. 四份 REPORT + 登记表；路径限定暂存 → staged `detect_changes` → commit → `merge --no-ff` → 0075 REPORT、登记表。

## 最小测试与检查

- 档位：**H**（App 同步核心 + 服务端新路由）。两端全量。
- 开发定向集：新增测试 + `tests/local-sync-repository.test.ts` + `tests/local-read-scope.test.ts` + `tests/mirror-topology.test.ts` + orbits `tests/api/sync-route.test.ts` + 0070 拓扑。

## 失败与交接

若协调器改造无法在不改 8 个屏幕的前提下完成，缩到"仓库绑定 + 域页协议 + 测试"，屏幕留 0076，如实记录。
若第二真实账号无法本机建立，SC-02 以 PG 拓扑 + 注入 actor 的 handler 测试为证据并说明缺口。
四份 REPORT 一律不写未验证的"通过"。报告须列 SC 映射、功能 SHA、命令与退出码、未提交项、其他端影响与下一步。
