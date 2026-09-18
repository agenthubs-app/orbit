# Sprint 0070 — 三层数据流测试拓扑与读取成本基线

**Plan revision:** 1。**模式:** existing-codebase / single-generator。运行状态只在登记表。
**原需求:** 读取成本治理设计案 Rev 4 第 06 节（图 6 三层拓扑）与第 11 节 Phase A；用户 2026-09-18 指令
"数据流测试先利用本地数据库，在本地 host 上模拟远程数据库，区分其与 app/web 内本地；app/web 内本地只放用户自己的信息，host 放所有数据"。
**单一目标:** 三层拓扑与读取成本账本成为可重复执行、可断言的测试，并冻结当前基线。
**易读目标:** [GOAL.md](GOAL.md)。
**基线:** `chat-agent` = `59f33a9ec`（0069 blocked 已登记）。
**进入条件:** 0067 completed（读预算测试形状、`assert-local-test-databases.mjs` 闸门、`ORBIT_LIFECYCLE_TEST_DATABASE_URL` 约定）。
不依赖 0069 的延后项：本 Sprint 只用 0069 已落地的 `createIncrementalSyncReadService` 与 `SYNC_REVISION_MIGRATION_SQL`。
只用本机 Postgres，不连云端，不部署。

## 已查明可复用的地基（不重造）

| 需要 | 已有 | 位置 |
| --- | --- | --- |
| 读指标采集 | `createPostgresReadMetricsRunner` + `PostgresReadMetricsObserver`，两个 PG client 均接受 `readMetrics` | `shared/storage/postgres-read-metrics.ts`、`postgres-live-record-store.ts:38`、`transactional-postgres.ts:32` |
| 每测试独立本地库 | `ORBIT_LIFECYCLE_TEST_DATABASE_URL` + 随机 schema + `search_path`（0067） | `tests/services/contact-scoped-read-postgres.test.ts:11-32` |
| 非本地库拒绝 | `assertLocalTestDatabases()`（0067） | `scripts/assert-local-test-databases.mjs` |
| 服务端过滤点 | `createIncrementalSyncReadService({client, cursorSecret}).readPage({actorId, workspaceId, cursor?, limit})`；SQL `where user_id = $2` + payload `accountId/ownerUserId` 二次核对 | `features/sync/read-service.ts:68-110, 218-225` |
| 联系人 scoped reader | `createPostgresContactScopeRecordReader`（0067） | `features/contacts/storage/contact-scope-postgres-reader.ts` |
| 客户端镜像 | v2 `createLocalSyncRepository({actorId, database, baseUrl, registeredDomainIds, activeReadScopes})`；`assertScope` 对 actor 不匹配抛 `read scope does not match…`；`resetDomain` 置 `readable=0` | `src/data/sync/local-sync-repository.ts:162-193, 307` |
| 测试用 SQLite | `NodeTestDatabase`（目前是 `tests/local-sync-repository.test.ts:17` 的文件内私有类） | 需抽成共享 helper |
| 性能测试目录 | `tests/performance/`（已有 4 文件） | `repos/orbits/tests/performance/` |

## 范围与文件

- 读取：上表各文件；[RULES](../RULES.md)；本目录 GOAL／PLANNER。不重新盘点全库。
- 新建（orbits）：`tests/performance/read-cost-ledger.ts`（观察者聚合：按操作链名累计 `{queries, rows, bytes}`，
  `assertWithinBudget`）、`tests/performance/read-cost-baseline.json`（冻结基线）、
  `tests/performance/read-cost-baseline.test.ts`（可复现 + 棘轮 + 预算超限必红）、
  `tests/services/flow-topology-postgres.test.ts`（多用户 host 播种、服务端越权负例、全量→增量→0 行）。
- 新建（App）：`tests/helpers/node-sync-database.ts`（从 `local-sync-repository.test.ts` 抽出 `NodeTestDatabase`）、
  `tests/mirror-topology.test.ts`（镜像只含本人行、切账号不可读、撤权后域清空）。
- 修改（App）：`package.json` 的 `test` glob 增加 `"tests/**/*.test.mjs"`（0068 发现 2 个 `.mjs` 静默不跑）；
  `tests/local-sync-repository.test.ts` 改为引用共享 helper（行为不变）。
- 修改（orbits）：无产品源码。若账本需要在 `createPgLiveRecordSqlClient` 之外注入观察者，只允许测试内包装，不改生产路径。
- 排除：任何读取路径优化（0071+）；Web 镜像实现（0077）；云端库；生产 `ORBIT_PG_READ_METRICS` 配置变更；
  0069 延后项的落地。

## 验收契约

| SC | 可观察行为 | 必需证据 |
| --- | --- | --- |
| SC-0070-01 | **可复现**：同一账号同一操作链（contacts.list / tasks.list / notes.list / dashboard / events.list）在同一播种下连跑两次，`{queries, rows, bytes}` 逐项相等；**棘轮**：当前值 ≤ `read-cost-baseline.json`；**咬人**：把某链预算设为实际值−1，`assertWithinBudget` 抛错且测试红（用 `assert.throws` 固定） | `read-cost-baseline.test.ts` 全绿；基线 JSON 进仓库 |
| SC-0070-02 | **服务端越权负例**：host 播种 A（≥30 联系人）、B（≥10）、主办方；`readPage({actorId:A})` 逐页拉完，结果中 `userId === B` 的行为 **0**，且 payload `accountId/ownerUserId` 无一等于 B；`listContacts({actorId:A})` 同理 | `flow-topology-postgres.test.ts` |
| SC-0070-03 | **三次拉取**：A 首次无游标拉取 → N>0 且分页到 `hasMore=false`；持锁写入 1 条 A 的联系人后带游标拉取 → 恰 1 条变更；再拉一次 → 0 条变更 | 同上；写入经 `orbit_records_acquire_sync_write_lock` 走正规协议 |
| SC-0070-04 | **客户端镜像隔离**：绑定 A 的仓库 `applyPage` 含 B 记录的页被拒（`validateAndSerializeRecord` 拒绝异 actor）；同一 SQLite 上以 B 身份建仓库读 A 的行 → 抛 `read scope does not match`；`resetDomain(A 某域)` 后该域 `listRecords` 返回 `[]` 而其他域不受影响 | `mirror-topology.test.ts` |
| SC-0070-05 | **运行时无回归**（常设要求）：本 Sprint 不改产品源码，Simulator 冷启动可登录读数、phoneweb 登录读 78 联系人；`npm test` 新纳入的 2 个 `.mjs` 在全量中实际执行且通过 | 截图／页面结果；全量摘要中 tests 数较 0069 收口（3461）增加且 fail 0 |

## 一次 Generator 的执行顺序

1. 记录基线、`git status --short`、Planner SHA256，登记 run-01。
2. 抽 `NodeTestDatabase` 为共享 helper（impact：仅测试文件引用）；确认两个 `.mjs` 单跑通过后再扩 glob。
3. RED：先写 `flow-topology-postgres.test.ts` 的越权负例与三次拉取（此时无播种夹具，必红），再写夹具与播种。
4. RED：`read-cost-baseline.test.ts` 先以空基线跑（棘轮无对照必红），跑出数字后冻结 JSON，转 GREEN；加"预算−1 必红"用例。
5. RED→GREEN：`mirror-topology.test.ts` 三条断言。
6. 两端 typecheck；App 全量（含新纳入的 `.mjs`）；orbits 只跑 `tests/performance` + `tests/services/flow-topology*`（本 Sprint 不改 orbits 产品源码，不触发全量）。
7. Simulator + phoneweb 无回归确认。
8. 路径限定暂存 → staged `detect_changes` → commit → 合并回 `chat-agent` → REPORT、登记表。

## 最小测试与检查

- 档位：**L**（只增测试与测试 helper，不改运行行为）。但 `package.json` 的 `test` 脚本变更属测试基础配置，
  按 RULES 5.1 触发一次 App 全量以证明新纳入文件实际执行。
- 开发定向集：新增 4 个测试文件 + `tests/local-sync-repository.test.ts`（helper 抽出后行为不变）。
- 不运行：orbits 全量（无产品源码变更，0069 收口刚做过同环境对照）；云端；部署。

## 失败与交接

若 `orbit_events` 之外的专用本地测试库不可用，停止并标 blocked（不得改用开发库或云端库做播种）。
若某条操作链两次运行数字不相等，先查非确定性来源（时间戳、随机 ID、并发），不得用"取最小值"或放宽相等断言掩盖。
基线 JSON 一旦冻结，后续 Sprint 只能向下修改并在其 REPORT 说明原因。
报告须列 SC 映射、功能 SHA、命令与退出码、未提交项、其他端影响与下一步。
