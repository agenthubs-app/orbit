# Sprint 0069 — 执行报告

## 结果

**blocked。** SC-01～04 有同版本证据（其中 01/03/04 为部分通过），SC-05 按构造不可达。
功能已提交并合并回 `chat-agent`（merge `ca8c50b15`，父 `daa4be352` + `d0333d2f0`），合并树验证通过。
唯一 B／run-01 已结束，不重开；不降低 SC、不把延后项标为通过。0033 登记表状态**不变**（仍 running）。
批准契约 [PLANNER.md](PLANNER.md) revision 1／SHA256
`83050279e9ce57ccf3731c5be66fa69359fb3984aedd9515348b61fc2bf1902e`。

## 先用人话说

增量同步的**核心零件**现在在主线上了：服务端 `GET /api/sync`（游标、水位线、按 actor 过滤的变更页），
App 侧的 sync-client / coordinator / freshness / `useSyncedCollection`，以及把分支的取消语义移植到
v2 本地仓库上。本机验证过：认证后 `/api/sync?limit=5` 返回 `highWatermark 9084`、5 条变更、HMAC 游标。

**但没有任何屏幕接上它，也不该接。** 归位过程中查清了两件设计案 Rev 4 没预见到的事：

1. **分支的 coordinator 没有 epoch 来源。** 主线 v2 仓库要求调用方绑定 `activeReadScopes()`（含
   `authorizationEpoch`），否则 `legacyScope` 抛 `legacy operation requires one explicit read scope`；
   分支 coordinator 用 `createLocalSyncRepository({ actorId, database })` 裸建仓库，其 12 个测试在 v2 上
   12/12 失败。epoch 的来源是 `/api/sync/lease` 签发的 grants —— 服务端不存在，正是 0075 的交付。
   在此之前接线屏幕，用户看到的是"同步失败"。
2. **分支把 sync 写锁触发器打进了基础 schema。** `orbit_records_assign_sync_revision()` 对未持锁的
   写入 `raise exception 'SYNC_WRITE_LOCK_REQUIRED'`；主线 0060–0062 的 personal-schedule 自写 SQL
   不经取锁 CTE。git 自动合并（hunk 不重叠）把它带进 `shared/storage/migrations.ts`，orbits 全量出现
   **26 项新增失败**（`personal-schedule-runtime` 10、`personal-schedule-transaction-associations` 3、
   参数化 ACL 用例 13）。锁序集成属 0034／0075。

因此本轮把落地范围收窄到"能在主线 v2 之上安全成活、且生产默认惰性"的部分。
**顺带给下游一个真事实**：全量对照发现，仓库 `npm test` 桩掉了 expo-sqlite，App 3461 全绿也抓不到真机
SQLite 路径的问题；本轮 Simulator 冷启动那次"落到登录页"是我的测试时序错误（服务重启与 App 冷启动放进同一并行批），
但它同时暴露"服务不可达时冷启动清空本地会话"的行为，与离线目标相悖 —— **观察，未核实根因，不在本轮扩范围**。

## 固定版本

| 内容 | 实际版本 |
| --- | --- |
| 基线 | `chat-agent` = `86e2471ce`（计划登记后 `daa4be352`） |
| 源分支 | `codex/sprint-0033-incremental-read-sync` = `d0333d2f0`；merge-base `a8ac3f761`（分支 36 提交 / 主线 249 提交） |
| 功能 merge | `ca8c50b15`，29 文件／+3603／−20 |
| 合并回主线 | `chat-agent` fast-forward 至 `ca8c50b15`；`git merge-base --is-ancestor d0333d2f0 chat-agent` 退出码 0 |

## 落地清单（29 文件）

**orbits（14）**：`app/api/sync/{route,handler}.ts`、`features/sync/{cursor,read-service,migrations}.ts`、
`features/sync/LIVE_IMPLEMENTATION.md`、`shared/contract/sync.ts`、`scripts/verify-incremental-sync-runtime.mjs`、
`tests/api/sync-route.test.ts`、`tests/services/{incremental-sync-legacy,incremental-sync-personal-schedule}.test.ts`、
`tests/services/incremental-sync-runtime-harness.test.mjs`。
路由由 `ORBIT_SYNC_CURSOR_SECRET` 门控：未配置 → `createConfiguredIncrementalSyncReadService()` 返回 null → 503。
**生产环境未配置该变量，路由默认惰性。**

**App（15）**：`src/data/sync/{sync-client,sync-coordinator,sync-freshness}.ts`、`src/hooks/useSyncedCollection.ts`、
`src/data/sync/local-sync-repository.ts`（v2 为基移植：`ApplyLocalSyncPageInput.canCommit?`、`applyPage → boolean` +
`LocalSyncPageSupersededError`、`getLastWorkspaceId`、`resetWorkspace`——后者在 v2 上同步清 `local_read_index/assets`，
不改 `local_read_scope_state`）、`src/api/contract/sync.ts`、`src/data/offline-read/route-domain-inventory.ts`
（新增 `sync` 传输域 + `sync-client GET /api/sync` 登记，策略 `durable_normalized`）、`src/data/snapshot-store{,.web}.ts`
（`retireSnapshot`）、`src/i18n/{zh,ja,en,messages}.ts`（`sync.*` 六键）、
`tests/{local-sync-repository,sync-freshness,snapshot-store,app-locale-notes}.test.ts`。

## 退回主线／明确延后（不是遗漏）

| 项 | 处置 | 归属 |
| --- | --- | --- |
| 8 个屏幕接线 + `TaskDetailScreen` + 配套 `tests/{notes-interactions,notes-list-interactions,personal-schedule-interactions,task-detail-interactions}` | 退回 chat-agent | 0076（Edit/New/NoteDetail/Tasks 的可组合方案已在本轮验证过写法，见 Git 历史 `3fa710ee8..ca8c50b15` 间的过程） |
| `shared/storage/{live-record-store,postgres-live-record-store,configured-live-record-store,migrations}.ts`（CAS + 锁 CTE + 基础 schema 触发器） | 退回 chat-agent | 0034／0075 |
| `features/connections/lifecycle/{postgres,migration}-repository.ts` | 退回 | 0075 |
| `features/notes/*`、`app/api/notes/[id]/*`、`tests/api/notes-routes`、`tests/services/notes-service`、`tests/fixtures/note-mutation-worker.ts` | 退回／不落地 | 0045（note-delete） |
| `scripts/sync-cloud-records.ts`、`tests/capabilities/orbit-ai-actor-query-tools.test.ts`、`src/view-models/task-list-scope.ts` | 退回 | 无关／0036 |
| `tests/synced-consumer-wiring.test.ts`、`tests/personal-schedule-list-sync-interactions.test.tsx`、`tests/tasks-screen-sync-interactions.test.tsx`、`tests/incremental-sync-coordinator.test.ts` | 不落地 | 0075／0076 验收规格 |
| `tests/services/incremental-sync.test.ts`（调 `NoteService.delete`，主线 3 个 TS 错误）、`tests/services/sync-migrations.test.ts`（1/9 断言基础 schema 接线） | 不落地 | 0045／0075 |
| 3 个部署助手（0068 已记） | — | — |

**`features/sync/migrations.ts` 在主线上因此没有直接测试覆盖**；其 9 项测试随 0075 的 `runOrbitRecordsMigration` 接线一起落地。

## SC 映射与证据

| SC | 状态 | 证据 |
| --- | --- | --- |
| SC-0069-01 分支成祖先；22 新文件；schema v2 四列主键不倒退 | **部分** | 祖先 ✓；新文件 17/22（5 个测试文件延后）；`LOCAL_SYNC_SCHEMA_VERSION = 2`、`PRIMARY KEY (workspace_id, domain_id, authorization_epoch, record_id)` 未动 ✓ |
| SC-0069-02 零新增失败；两端 typecheck 0 | pass | App 3433（0068 前）→ 3461/3461/0 fail；orbits 4201/86 fail = 0067 基线 86，唯一差异 `orbit-agent-gemini-live` 内两用例随时序互换（单跑 42/43，失败者本在基线内）；typecheck 0/0 |
| SC-0069-03 分支自带测试全绿 | **部分** | orbits 留下 4 文件 28/28；App `local-sync-repository` 17/17（夹具把 `workspace-server` 绑成 v2 scope，断言未动）+ `sync-freshness` 5/5；延后 6 个测试文件见上表 |
| SC-0069-04 `/api/sync` 可用受身份约束；脚本可跑 | **部分** | 未认证 401 ✓；认证后 200，`{workspaceId, nextCursor, hasMore, highWatermark:9084, serverTime, changes:5}` ✓；`verify-incremental-sync-runtime.mjs` 可执行但 preflight 拒绝：钉死 Node 22（本机 25.8；`/opt/homebrew/opt/node@22` 缺 `libsimdjson.30.dylib` 无法启动），且 `APP_FILES` 硬编码含已延后的 coordinator 测试 —— 两个原因任一成立即不可通过 |
| SC-0069-05 两次进入零业务 GET；phoneweb 同屏可用 | **not met** | 无屏幕接线，按构造不可达。无回归证据：Simulator 登录成功并读到数据（`GET /api/account/me`、`/api/contacts` 200）；phoneweb 真实 Chromium 登录、`/contacts` 78 行、console 0 errors |

## 语义合并的实际决定

- `local-sync-repository.ts`：主线 v2 事务体为基，分支加法 API 移植；`resetWorkspace` 额外清 v2 派生表以维持 `resetDomain` 同等不变式。
- `tests/app-wide-route-coverage.test.ts`（0068 遗留同型）、`docs/phoneweb/...REPORT.md`：见 0068。
- 三个 store 与 `notes/repository.ts` 曾做"两侧都保留"合并（含一次把签名切在括号中间导致 42 个 TS 错误的失误，已修），
  **随后因锁触发器规避而整体退回**，最终提交不含这些合并。过程留在 Git 历史，不作为交付。
- `tests/local-sync-repository.test.ts`：分支新增用例失败原因是 `workspace-server` 未绑 scope；把它加进夹具的
  `activeReadScopes` 列表（v2 要求每个调用方声明作用域），断言一字未改。

## 本机环境变更（不入库）

- `.env.local` 增加 `ORBIT_SYNC_CURSOR_SECRET`（随机 32 字节）。
- `orbit_events` 应用 `SYNC_REVISION_MIGRATION_SQL`（`sync_revision` 列、序列、锁函数、9084 行回填），
  随后把 `orbit_records_assign_sync_revision()` 改为**只分配 revision、不 raise**：写入恢复可用，
  提交屏障在 0075 前不启用，并发写入 revision 顺序不保证。仅供本机联调。
- Metro 曾报 `PersonalScheduleList.tsx (5:1) Unexpected token`：解冲突过程中的 `<<<<<<<` 标记，过程性、已消失。

## 下一步

- **0070（量尺）**按计划领取；它不依赖本轮延后项。
- 0075 必须在绑定 epoch（`/api/sync/lease` + `activeReadScopes`）与锁序集成（所有写入方取锁后才可把触发器接进基础 schema）两件事之后，
  再落地本轮延后的 6 个测试文件与 `sync-migrations.test.ts`。
- 0076 接线时以本轮 Git 历史中 Edit/New/NoteDetail/Tasks 的组合写法为起点；Notes 分页与 PersonalSchedule 回读回执需重新设计而非合并。
- 回退方式：`git revert -m 1 ca8c50b15`。
