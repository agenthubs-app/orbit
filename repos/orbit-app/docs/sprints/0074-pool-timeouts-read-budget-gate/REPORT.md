# Sprint 0074 — 执行报告

## 结果

**completed。** 五项 SC 均有同版本证据，功能已提交并以 `merge --no-ff` 合回 `chat-agent`。
唯一 run-01。批准契约为 [PLANNER.md](PLANNER.md) revision 1／SHA256
`9da1ef19bd45aa287b6e0cf6678f34a9bdd09921662764ff51a929978d1c0cce`。

## 先用人话说

连接池不再是"全局 1、没有超时"：Vercel 上 2/2 池、15 s 客户端查询超时（不下发服务端 GUC，因为走 Neon pooler 不保证透传）；
本地与长驻 worker 4/4 池并加服务端 `statement_timeout`。一条挂住的 `pg_sleep(1)` 在 200 ms 被客户端放弃，同一个池马上能继续用。
0062 那个"两个并发保存耗尽连接池互相等待"的测试在新默认下 14/14 仍绿。

读预算闸门交付为 **opt-in**：设了 `ORBIT_READ_BUDGET_ROWS_PER_MINUTE` 才存在。经真实接线验证：预算 100 行、联系人列表每次约 25 行，
第 5 次 `/api/contacts` 返回 503，错误里写明 `read budget exceeded: rows 125/100 in 60000ms window (collection contacts)`，
同一进程里 `accounts` 读取与新建待办照常，状态变化只打一条 `read_budget_gate` 日志。生产是否开启是部署决定。

## 固定版本

| 内容 | 实际版本 |
| --- | --- |
| 基线 | `chat-agent` = `3ece6d171`；登记后 `10a58dec6` |
| 功能提交 | `c72776bd9` feat(sprint-0074) |
| 合并 | `4e70fdbb9` merge(sprint-0074)（`--no-ff`），`merge-base --is-ancestor` 退出码 0 |

## SC 映射与证据

| SC | 状态 | 证据 |
| --- | --- | --- |
| SC-0074-01 按环境配置 | pass | `database-runtime-profile.test.ts` 4/4：serverless／worker／local 三档数值；显式 `ORBIT_DB_RUNTIME` 优先于 VERCEL；四个覆盖键生效；`0`／`many`／`-1`／`cloud` 抛 `ORBIT_DB_*` 错误 |
| SC-0074-02 超时生效不卡池 | pass | `pool-timeouts-postgres.test.ts` 3/3：query_timeout 200 ms 拒绝 `pg_sleep(1)`（<900 ms）后同池立即 `select 1`；local profile 的 statement_timeout 以 `57014` 取消，事务内同样；serverless 不含 statement_timeout 启动参数 |
| SC-0074-03 0062 场景 | pass | `personal-schedule-transaction-associations.test.ts` 14/14；每个 profile 的 transactional 池 ≥ 2 有断言 |
| SC-0074-04 闸门语义 | pass | `read-budget-gate.test.ts` 5/5：行／字节双限、非关键 fail closed、关键集合与 `critical` 直通、窗口过期恢复、状态变化只各一次、无阈值时 store 原样返回、与 env console 观察者组合后指标日志仍恰一条 |
| SC-0074-05 真实接线与运行时 | pass | `read-budget-gate-routes-postgres.test.ts` 1/1（真实 configured 接线）：首次 200，重复至 503 且 envelope `SERVICE_UNAVAILABLE` 带理由，一条 open 日志，`accounts` 读 1 条、任务 POST 201、直接 store 读 contacts 拒绝；Simulator 冷启动 14×200 + 1×304、0 个 5xx；phoneweb 78 位联系人；orbits 全量 4234 / 3992 / 87，与 0073 收口对照仅 +2——两条既有测试硬编码旧默认池 1／2，改为按 profile 断言后 13/13；两端 typecheck 0 |

## 执行中发现并修掉的一个真问题

闸门错误在 contacts／events／connections 的 GET 里会**未被捕获地抛出**（这三条路由没有 try/catch），到 Next 就是匿名 500，
不满足"明确拒绝且有可观测理由"。修在六条热路由共用的 `conditionalJsonRead`：produce 抛出的 `AppError` 映射为 failure envelope
（status 由 `getHttpStatusForAppErrorCode` 决定）。其它未接条件读的路由仍会以 500 呈现闸门错误——记为后续项。

## 判断与取舍

- 闸门 opt-in、阈值不预设：进程级读预算没有实测生产数据就给默认值，等于盲目熔断。推荐起点：Vercel 单实例 `ORBIT_READ_BUDGET_ROWS_PER_MINUTE=20000`、`_BYTES_PER_MINUTE=20971520`（0070 基线一次 dashboard 5 068 行／3.5 MB），开启前先看 `postgres_read_metric` 的分钟级聚合。
- 各 feature 自建池（名片 5/4/2、维护 2、通知 4、event-ops 8/12）未动：各有语义与 env，盲改等于赌。
- serverless 不下发 `statement_timeout`：PgBouncer 对启动 GUC 的透传不可在本机验证；客户端 `query_timeout` 已保证池不被挂死，服务端仍可能继续跑完那条语句——如实记录。

## 顺带发现（不在本 Sprint 修）

1. 除六条热路由外的 GET 路由对 `AppError` 没有统一的 envelope 映射（各自 try/catch 或没有）。
2. `ORBIT_PG_READ_METRICS` 的 console 观察者是逐条打印；生产真正需要的是分钟级聚合（闸门内部已有滑动窗口，可作为聚合来源）。

## 未提交、影响与下一步

- 未提交：`repos/orbits/next-env.d.ts` 等用户既有改动，全程未暂存。
- `detect_changes`（staged，两条测试改动前）：16 符号 / 11 文件 / 51 流程 / CRITICAL——全部经 `createConfiguredPostgresLiveRecordStore`／transactional runtime；由 orbits 全量与运行时验证覆盖。
- 回退方式：`git revert -m 1 4e70fdbb9`。
- 运行环境：本机 Postgres `orbit_sprint0067_test`；Web/API 3000（dev HMR）；phoneweb 32111；Simulator `DA432E9E`。未连云端、未部署、未改生产 env。
- 预算：无 AI/OCR 调用。
- 下一步：Phase C **0075**（grants／epoch／lease 真实验收，收口 0033–0036）。
