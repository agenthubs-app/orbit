# Sprint 0070 — 执行报告

## 结果

**completed。** 五项 SC 均有同版本证据，功能已提交并以 `merge --no-ff` 合回 `chat-agent`。
唯一 run-01，未启动第二次 Generator。批准契约为 [PLANNER.md](PLANNER.md) revision 1／SHA256
`221eb101c4b47ac9d2673d40bdf793e2909c5d4bb75a160d5791b82031bcb22b`。

## 先用人话说

设计案图 6 的三层拓扑现在是一组会红的测试，不是一张图：本机 Postgres 扮演云端 host，同时装着
用户 A（30 联系人／5 待办）、用户 B（10／3）和主办方（2 活动／2 待办）；A 逐页拉 `/api/sync`
读取服务，B 和主办方的行一条都不出现，A 的游标拿去冒充 B 直接被拒；A 的联系人列表也只有 A 的 30 条。
三次拉取呈现 **全量 5 → 持锁写 1 条后恰 1 条 → 再拉 0 条**。客户端这边，同一台设备的 SQLite 里
B 的仓库读不到 A 的行，塞进带 B 记录的页被拒，撤销 A 某域后该域清空、其他域不动。

同时把"一次业务操作花多少 SQL／多少行／多少字节"冻成了尺子（`read-cost-baseline.json`）。
第一次量出来的数字本身就是后面 Sprint 要对付的问题：

| 操作链 | SQL 条数 | 行 | 字节 | 一眼看出的问题 |
| --- | ---: | ---: | ---: | --- |
| `contacts.list` | 6 | 1 548 | 1 374 261 | 六次往返，1.3 MB 才拼出一页联系人 |
| `tasks.list` | 1 | 92 | 125 682 | 读 92 行只展示 12 条（80 条旧格式行读进来再丢掉） |
| `notes.list` | 1 | 12 | 14 134 | 已是按 owner 精确读取 |
| `dashboard` | 1 | 5 068 | 3 570 222 | 一条 SQL 把 3.5 MB 整图拉回来做聚合 |
| `events.list` | 1 | 13 | 21 268 | 小 |

后面 0071（LIMIT／投影）等 Sprint 的验收就是把这张表的数字往下改；往上改测试会红。

## 固定版本

| 内容 | 实际版本 |
| --- | --- |
| 基线 | `chat-agent` = `59f33a9ec`；登记后 `2b02e66e7` |
| 功能提交 | `1618d7723` test(sprint-0070): three-layer flow topology tests and frozen read-cost baseline |
| 合并 | `dd9dd5a88` merge(sprint-0070)（`--no-ff`），`merge-base --is-ancestor` 退出码 0 |

## SC 映射与证据

| SC | 状态 | 证据 |
| --- | --- | --- |
| SC-0070-01 可复现／棘轮／咬人 | pass | `read-cost-baseline.test.ts`：五链各连跑两次 `{queries,rows,bytes}` 逐项 `deepEqual`；两次独立进程输出的 `read_cost_baseline_measured` 完全一致；空基线首跑 RED（`no budget recorded` ×5），冻结后 GREEN；每链 `rows−1` 预算 `assert.throws(ReadCostBudgetError)`，另有纯函数用例逐维度验证 |
| SC-0070-02 服务端越权负例 | pass | `flow-topology-postgres.test.ts` 用例 1：A limit=2 分 3+ 页拉完得 5 条，全部 `accountId===ownerUserId===A`，id 不含 `:b:`／`:organizer:`；B 得 3 条全 `task:b:`；A 游标以 B 身份 `readPage` → rejects；`listContacts(A)` 30 条全 `contact:a:`，`listContacts(B)` 10 条全 `contact:b:` |
| SC-0070-03 三次拉取 | pass | 用例 2：无游标 → 5 条 `hasMore=false`；持锁（`orbit_records_acquire_sync_write_lock`）写 A 1 条 + B 1 条 → A 带游标恰 `["task:a:new"]`，高水位递增；再拉 → `[]`。用例 3：不持锁写 sync 集合 → `SYNC_WRITE_LOCK_REQUIRED` |
| SC-0070-04 客户端镜像隔离 | pass | `mirror-topology.test.ts` 3/3：含 B 记录的 `applyPage` → `actorId does not match`；B 的 scope 经 A 仓库 `applyDomainPage` → `read scope does not match`；同 SQLite 上 B 仓库 `listRecords`→`[]`、`getRecord`→`null`、拿 A 的 scope 读/重置均被拒且 A 的行原样；`resetDomain(tasks)` 后 tasks `[]`、notes 仍 1 条，重新授权可回填 |
| SC-0070-05 运行时无回归 + `.mjs` 实际执行 | pass | 两端 typecheck 0 error；App 全量 **3483/3483 pass / 0 fail / 0 skip**（0069 收口 3461 → +22 = 12 + 7 个 `.mjs` 用例 + 3 个镜像用例，逐项对得上）；orbits 定向集（`tests/performance` + `flow-topology*`）27/27，经 `run-node-tests.mjs` 的非本地库闸门；Simulator 冷启动首页 14 待办、会话保持（截图）；phoneweb `/contacts` 渲染 78 位联系人 |

## 与 PLANNER 的一处事实修正

SC-03 原文写"持锁写入 1 条 A 的**联系人**"。`createIncrementalSyncReadService` 只同步
`notes / tasks / personal_schedule_items` 三个集合（`orbit_records_is_sync_collection`），
联系人写入根本不会出现在 `/api/sync` 里，用它做"恰 1 条变更"会把测试做成空转。实际以 **待办** 为写入对象，
"一次写入 → 一条增量 → 再拉零条"的意图不变。联系人进入增量同步是 0076 扩面的事。

## 顺带发现（不在本 Sprint 修）

1. **orbits 侧同样的 glob 缺口**：`scripts/run-node-tests.mjs` 只匹配 `tests/**/*.test.{ts,tsx}`，
   `tests/services/incremental-sync-runtime-harness.test.mjs` 在 orbits 全量里静默不跑。PLANNER 允许清单只含 App 的
   `package.json`，故未动；建议下一个触碰 orbits 测试基础设施的 Sprint 一并纳入。
2. **镜像隔离靠 epoch 而不靠 actor 列**：`sync_records` 主键是 `(workspace, domain, epoch, record)`，没有 actor 列。
   本 Sprint 断言的是"B 出示 A 的 scope 被拒"与"B 自己的 epoch 下无行"；若两个账号拿到字面相同的 epoch 字符串，
   同一 SQLite 上是可以互读的。epoch 由服务端 `/api/sync/lease` 按 actor 签发（0075），届时应把"epoch 跨账号唯一"
   作为服务端契约测试补上。
3. `tasks.list` 读 92 行只展示 12 条：80 条生成夹具是旧格式（无 `accountId/ownerUserId/category`），
   仓库先全读再在内存里丢弃。真实库里若有旧格式行，成本同样白付——0071 做投影时可顺手让 SQL 侧过滤。
4. `tests/local-read-scope.test.ts`、`tests/local-read-migrations.test.ts` 各自还有一份 `LocalSyncDatabase` 测试实现，
   与抽出的 `NodeTestDatabase` 不同源；不在允许清单，未合并。

## 未提交、影响与下一步

- 未提交：`AGENT.md`、`AGENTS.md`、`CLAUDE.md`、`repos/orbits/next-env.d.ts`、根目录截图删除等为用户既有改动，全程未暂存。
- `detect_changes`（staged）：8 文件 / 0 索引符号 / 0 受影响流程 / LOW——本 Sprint 无产品源码改动。
- 回退方式：`git revert -m 1 dd9dd5a88`。
- 运行环境：本机 Postgres `orbit_sprint0067_test`（每测试随机 schema，跑完 drop）；Web/API 127.0.0.1:3000（target=local）；
  phoneweb 127.0.0.1:32111；Simulator `DA432E9E`。全程未连云端、未部署。
- 预算：无 AI/OCR 调用。
- 下一步：Phase B **0071 读取护栏（LIMIT／投影／按需字段）**，验收尺就是本 Sprint 冻结的 `read-cost-baseline.json`——
  `contacts.list` 的 6 条 SQL／1.3 MB 与 `dashboard` 的 3.5 MB 是首要目标。
