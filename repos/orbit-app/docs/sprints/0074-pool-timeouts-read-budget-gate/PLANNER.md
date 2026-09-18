# Sprint 0074 — 连接池、超时与读预算熔断

**Plan revision:** 1。**模式:** existing-codebase / single-generator。运行状态只在登记表。
**原需求:** 读取成本治理设计案 Rev 4 第 11 节 Phase B 第四项（0074）。
**单一目标:** 池与超时按环境配置；读预算超阈值时非关键读 fail closed、关键路径不受影响、理由可观测。
**易读目标:** [GOAL.md](GOAL.md)。
**基线:** `chat-agent` = `3ece6d171`（0073 completed）。
**进入条件:** 0070 completed（读指标 runner 与 0067 的观察者机制）。只用本机 Postgres，不连云端，不部署。

## 已查明的事实与本 Sprint 的核心判断

| 事实 | 数据 |
| --- | --- |
| 现状池 | configured store `DEFAULT_POOL_MAX = 1`；transactional 默认 `max = 2` 且 **无任何超时**；`createPgLiveRecordSqlClient` 只有 connection/idle 10 s，无查询超时 |
| 各处自建池 | business-card ingest 5、batch 4、image journal 2、maintenance 2、event-ops 8/12（自有 env）、通知 4 —— 本 Sprint 不碰这些（各有语义） |
| 环境判定先例 | `process.env.VERCEL === "1"`（event-ops runtime/queue、agent、acquisition）；生产走 Neon `-pooler` 主机（PgBouncer 事务模式） |
| pg 8.22 | 支持 `query_timeout`（客户端计时）与 `statement_timeout`／`lock_timeout` 启动参数（服务端）；启动 GUC 经 PgBouncer 不保证透传 |
| 读指标 | `createPostgresReadMetricsRunner(config, env)`：显式 observer **替代** env 的 console observer（二选一）——闸门若直接传 observer 会关掉生产日志，必须组合 |
| 0062 场景 | `tests/services/personal-schedule-transaction-associations.test.ts`："production factory keeps associated concurrent saves inside the max2 transaction pool" |
| write-gate 先例 | `features/sync/write-gate.ts` 是 advisory-lock 门；读预算门是进程内计数门，对齐其"调用方显式过门"的形状 |

**判断 1：超时分两层。** 所有环境都设客户端 `query_timeout`（池内连接不会被挂死）；服务端 `statement_timeout` 只在直连（local／worker）配置，serverless 走 pooler 不下发启动 GUC，避免不可验证的假设。
**判断 2：闸门 opt-in。** 无阈值环境变量时闸门不存在，行为零变化；本 Sprint 交付机制、测试与推荐值，生产开启是部署决定（云端排除）。
**判断 3：关键／非关键按集合分。** 关键集合 = `accounts, auth_users, permissions, profiles`（登录、授权、账号）；写路径永不过门。其余读取（列表、详情、聚合）为非关键。
**判断 4：不动各 feature 自建池。** 它们各有语义与 env；统一改动等于盲改。记录为后续项。

## 范围与文件

- 新建（orbits）：`shared/storage/database-runtime-profile.ts`（`resolveDatabaseRuntimeProfile(env)`）、`features/sync/read-budget-gate.ts`（`createReadBudgetGate`、`ReadBudgetExceededError`、`resolveReadBudgetGateOptions(env)`、`createReadBudgetGatedLiveRecordStore`）。
- 修改（orbits）：`shared/storage/postgres-read-metrics.ts`（导出 `createEnvReadMetricsObserver(env)` 以便组合，不改现有行为）、`shared/storage/postgres-live-record-store.ts`（`createPgLiveRecordSqlClient` 接受 `timeouts`）、`shared/storage/transactional-postgres.ts`（同上 + 默认 max 来自 profile）、`shared/storage/configured-live-record-store.ts`（默认 max 来自 profile；组合 observer；包一层闸门 store）。
- 新建（测试）：`tests/storage/database-runtime-profile.test.ts`、`tests/services/read-budget-gate.test.ts`、`tests/services/pool-timeouts-postgres.test.ts`、`tests/api/read-budget-gate-routes-postgres.test.ts`。
- 排除：各 feature 自建池；生产 env；云端；App 端；dashboard 等未接条件读的路由改造。

## 验收契约

| SC | 可观察行为 | 必需证据 |
| --- | --- | --- |
| SC-0074-01 | **按环境配置**：`VERCEL=1` → serverless（池 2/2、query 15 s、无 statement_timeout）；`ORBIT_DB_RUNTIME=worker` → 4/4、60 s、statement 60 s；默认 local → 4/4、30 s、30 s；`ORBIT_DB_POOL_MAX`／`ORBIT_DB_TX_POOL_MAX`／`ORBIT_DB_QUERY_TIMEOUT_MS`／`ORBIT_DB_STATEMENT_TIMEOUT_MS` 覆盖；非法值抛错而非静默 | `database-runtime-profile.test.ts` |
| SC-0074-02 | **超时生效且不卡池**：真实 PG 上 query_timeout 200 ms 的客户端执行 `pg_sleep(1)` 被拒且随后同一池能立刻执行普通查询；local profile 的 statement_timeout 让服务端以 `57014` 取消 | `pool-timeouts-postgres.test.ts` |
| SC-0074-03 | **0062 场景通过**：`personal-schedule-transaction-associations.test.ts` 在新默认池下仍绿；且每个 profile 的 transactional 池 ≥ 2（0062 前提） | 测试摘要 + profile 断言 |
| SC-0074-04 | **闸门语义**：窗口内累计行／字节任一超阈值 → 非关键 `listRecords/getRecord` 抛 `ReadBudgetExceededError`（AppError `SERVICE_UNAVAILABLE`，message 含 rows/bytes/阈值/窗口/集合）；关键集合读取与 upsert/delete/insert 不受影响；窗口过期恢复；状态变化各打一次 `read_budget_gate` 日志；未配置阈值时不包闸门；`ORBIT_PG_READ_METRICS=1` 时 console 指标日志仍逐条输出（不重复、不丢失） | `read-budget-gate.test.ts` |
| SC-0074-05 | **经真实接线**：env 设小阈值 + 真实 PG，`/api/contacts` 第一次 200、第二次 503 且 envelope error 含理由；同进程 `accounts` 读与任务创建 200/201；Simulator + phoneweb 在默认（无阈值）配置下无回归；orbits 全量与 0073 收口对照零新增失败；两端 typecheck 0 | `read-budget-gate-routes-postgres.test.ts`；截图／页面；摘要 |

## 一次 Generator 的执行顺序

1. 记录基线、`git status --short`、Planner SHA256，登记 run-01。
2. RED→GREEN：profile 解析测试 → `database-runtime-profile.ts`。
3. RED→GREEN：闸门单测 → `read-budget-gate.ts` + `createEnvReadMetricsObserver`。
4. 接线：两个 client 工厂接 `timeouts`；configured store／runtime 用 profile 默认 max、组合 observer、包闸门；RED→GREEN：超时 PG 测试、路由级闸门测试。
5. 0062 测试 + 定向集；orbits 全量；两端 typecheck。
6. 重启 Web/API（源码变了，默认无阈值）；Simulator + phoneweb 无回归。
7. 路径限定暂存 → staged `detect_changes` → commit → `merge --no-ff` → REPORT、登记表。

## 最小测试与检查

- 档位：**H**（共享存储基座与所有 configured 读路径）。
- 开发定向集：4 个新测试 + 0062 测试 + `tests/services/postgres-live-record-storage.test.ts` + 0070/0072 的 PG 测试。
- 收口：orbits 全量 + 两端 typecheck；App 零改动。

## 失败与交接

若组合 observer 无法保证 `ORBIT_PG_READ_METRICS` 日志逐条不变，停下记录——不得以关掉日志换闸门。
若 0062 测试在新默认池下变红，先查是否池语义变化导致，不得改回全局 1 掩盖。
报告须列 SC 映射、功能 SHA、命令与退出码、未提交项、其他端影响与下一步。
