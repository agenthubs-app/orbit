# Sprint 0111 执行报告：AI 运行记录一年后自动删除，存量重复轨迹清理完毕（AI A4 + A5）

**run-01**。Generator 为子代理（没有再派子代理），报告由协调者代存。
- 分支：`sprint/0111-ai-trace-retention`，基线 `7f8a3cc08`，加开工提交 `e628ae50a`。
- 最后功能提交：`4cfbb762d`。没有推送，没有合并。
- GOAL.md 和 PLANNER.md 都没改。

**状态：completed。** SC-01 到 SC-05 都有证据。orbits 全量第一次跑出 1 条失败，是本 Sprint 引入的，已经修好并回归通过（见第 5 节）。生产上没做任何操作。

## 1. 结论

**一年保留期已接进每日维护任务。** 维护接口 `/api/internal/maintenance` 每跑一轮，新增的 `agent_run_retention` 任务就执行一次。
- 删除单位是整套：运行记录和它的步骤、动作、发件箱、回执，按运行编号关联，一起删。
- 删除条件：运行、每个动作、每条发件箱都已进入终态，并且最晚结束时间早于 365 天前。
- 有任何未结束的成员，这套就不删。
- 每一套在自己的事务里删除，不会只删一半。每轮最多检查 500 套，按 50 条一页读，并受维护预算的截止时间约束。
- 请求记录保留，内容不动，只清掉它指向已删运行的链接。

**0103 回填前的旧子记录会被发现并报告。** 如果某套里有子记录还没有运行编号，这套不删，也不当作正常跳过：
- 汇总里记 `blockedUnlinked` 和 `unlinkedRows`；
- 这项任务标为失败，维护接口返回 503；
- 日志提示先执行 `npm run db:migrate:agent-run-targets`。

**存量清理命令 `npm run db:cleanup:agent-trace-legacy`。**
- 默认只统计、不改库。
- 加 `--execute` 才会删除：先把所有要删的行和要清链接的请求记录，完整导出成一个新的 JSON Lines 文件。已有同名文件时拒绝执行，文件权限是 600。导出写盘完成后，只删导出过的那些行。
- 删除范围：全部统计记录、全部普通问答运行（没有任何动作的运行）、这些运行的步骤，同时清掉请求记录上指向它们的链接。
- 带动作的运行和它的子记录不动。
- 有未回填的子记录时，命令拒绝执行，也不写备份文件。
- 连接的不是本机数据库时，还必须加 `--confirm-remote=<host>/<数据库名>`，而且要和实际连接的库完全一致。
- 可以重复执行，第二次删 0 行。

**本地库已实际清理（`orbit_events`，在代码提交并测试之后执行）。**

| 集合 | 清理前 | 清理后 |
|---|---|---|
| agentAnalyticsEvents（统计） | 650 | 0 |
| agentRuns（运行） | 76 | 0 |
| agentRunSteps（步骤） | 589 | 0 |
| 请求记录（行数） | 51 | 51 |
| 请求记录上的运行链接 | 38 | 0 |
| agentActions（旧集合） | 60 | 60 |
| orbit_records 总行数 | 10,560 | 9,245 |

- 共删 1,315 行，正好等于 650 + 76 + 589。
- 备份文件：`repos/orbits/build/agent-trace-cleanup/agent-trace-orbit_events-2026-09-27T203013837Z.jsonl`，1,353 行（1,315 行删除加 38 行清链接），2,230,857 字节。旁边还有一个 259 字节的文件，是第二次执行时只写了表头的空备份。
- 备份里有对话内容，不入库、不外传。
- 3000 端口的开发服务照常运行：`/` 返回 200，`/api/health` 返回 200。

**另外改了一处 0103 的回填 SQL。** 现在只有运行还在时，才给请求记录补运行链接；原来重跑回填，会把已清掉的链接又指回已删的运行。有测试覆盖。

## 2. 逐项验收

| SC | 结果 | 证据 |
|---|---|---|
| 01 边界：366 天删、364 天留；有未结束动作不删；不留孤立子记录 | 通过 | 真库测试：366 天那套 5 行全删，其余每一行和删除前完全一样；364 天、等待确认、「运行已完成但动作推迟」、「100 天前撤销」这几套都保留；孤立子记录为 0 |
| 02 请求记录保留但不再指向已删运行；运行详情返回既有的「找不到」 | 通过 | 真库和真 handler：删除前 `/api/ai/runs/[id]` 返回 200、`runKind=agent`；删除后返回的状态码和 success 字段与从未存在的编号一致；请求记录的 payload 不变，链接为空；`findByRunId` 返回 null；重跑回填后仍是空 |
| 03 存量命令：dry-run 不改库；先导出再删；再执行删 0 行；带动作的运行不受影响 | 通过 | 依次在三个库执行：先 `orbit_test`（临时 schema，复制开发数据后再加 1 套带动作运行），再 `orbit_events` 的临时副本，最后 `orbit_events`。三处都是「统计 → 备份 → 删除 → 再执行删 0 → 再 dry-run 为 0」。在副本上按集合做了哈希对比：只有 agentAnalyticsEvents、agentRuns、agentRunSteps 三个集合变化；请求记录只有链接变了，payload 和 updated_at 的哈希与原库一致；带动作的那套在 `orbit_test` 上保留了运行 1 行、步骤 1 行、动作 1 行 |
| 04 维护任务接入每日 pass，受预算约束，失败不影响其他任务；本地调用接口一次，汇总字段正确 | 通过 | 真 handler 测试：带错误密钥返回 401，且什么都没删；带正确密钥返回 200，汇总字段正确。运行时：生产构建跑在 3100，连 `orbit_events` 的临时副本；不带密钥和带错误密钥都返回 401；带 CRON_SECRET 返回 200，其中 `agent_run_retention` 为 examined 1、runSetsDeleted 1、rowsDeleted 5，步骤、动作、发件箱、回执各删 1，请求链接清掉 1，failed 0；365 天内那套和两条请求记录都还在；第二轮全部是 0；其余 9 个任务正常（4 个 ok，含本任务；6 个因本地没配置而跳过），failed 为 0 |
| 05 两端全量、typecheck、棘轮 | 通过（全量曾失败 1 条，已修，见第 5 节） | 见第 5 节 |

**新增测试及各自证明的内容：**

`tests/services/agent-run-retention.test.ts`，8 条单元测试，测「这套什么时候算结束」这个判定函数：
- 阈值是 365 天；
- 运行未结束，这套就不会到期；
- 4 种非终态动作都会让这套保持未结束；
- 6 种终态动作各自用哪个时间字段；
- 后来的 updatedAt（撤销、重试、回执）会把结束时间往后推；
- 发件箱的终态和非终态；
- 未知状态当作未结束，无法解析的时间忽略。

`tests/services/agent-run-retention-postgres.test.ts`，14 条，真 Postgres，用生产迁移建表：
1. SC-01 边界：366 天整套删除，364 天、未结束、动作推迟、晚撤销都保留；除被删那 5 行外，其余行逐行完全一致；无孤立子记录；第二轮删 0。
2. 隔离：其他 workspace、另一账号的同名运行和它的请求记录、agentSignals、agentPreferences、旧 `agentActions`、contacts 都不受影响。
3. SC-02：请求记录保留、链接清空、payload 不变；运行详情返回「找不到」；回填不会重新挂回去。
4. 未回填的子记录：这套被报告而不是被删，任务标为失败，并提示补救命令；同一轮里已回填的另一套照常删除；回填后下一轮整套删除。
5. 有上限：每轮上限 3、每页 2 条时分三轮删完；候选查询都带 limit；截止时间一到就停。
6. 中断后恢复：第二套在事务里执行完删除语句、提交前模拟崩溃，结果整套回滚完好；下一轮恰好删 2 套、10 行，没有孤立子记录。
7. SC-04：真维护 handler 带鉴权；任务的数据库连接从环境变量读取，和生产一致。
8. 本任务失败时，同一轮的下一个任务照常执行。
9. 存量 dry-run：各项计数精确，库完全不变。
10. 存量正式执行：备份里的行就是被删的行，并且是完整原行；请求记录的内容不变；带动作那套完整保留；其他 workspace 不变；再执行删 0。
11. 有未回填子记录时拒绝执行，不写备份，库不变。
12. 存量中断后恢复：已提交的批次保持删除，剩下的重新导出再删，两次合计与初始计数一致；第一份备份仍是完整的。
13. 不覆盖已有的备份文件。
14. 远程确认：本地可以直接执行；远程 dry-run 可以；远程 `--execute` 不带确认或确认不匹配都被拒绝，报错里不带密码。

`tests/services/configured-maintenance-reminder-wiring.test.ts` 新增 1 条：生产任务列表里 `agent_run_retention` 恰好一个，排在 `read_cost_rollup` 之前，没配数据库时返回跳过。

**RED 记录**（在 `build/harness-state/evidence/sprint-0111/run-01/commands/` 下）：
- `red-unit.txt`、`red-head-state.txt`：新模块不存在时，两个测试文件都失败。
- `red-wiring.txt`：换回 HEAD 版的 `configured-tasks.ts`，新增的接线测试失败。
- `mutations.txt`，7 个变异各自让对应测试变红，都已还原：
  1. 去掉未回填检查；
  2. 忽略非终态动作；
  3. 不清请求链接；
  4. 换回 HEAD 版的回填 SQL；
  5. 删除时只删运行、不删子记录；
  6. 存量命令忽略未回填记录；
  7. 存量命令把所有运行都当作普通问答。

## 3. 设计取舍

1. **结束时间取所有成员上最晚的时间。** 包括 updatedAt、completedAt、failedAt、rejectedAt、canceledAt、undoneAt、processedAt。这样偏保守：很晚才撤销或重试的动作，会让整套晚些到期。未知状态当作未结束；运行上完全没有可用时间的，永不到期。
2. **回执也检查状态。** 回执的三种状态都是终态，所以实际上不会因为回执而挡住删除。
3. **候选只看运行自身的时间先做 SQL 预筛。** 一套的结束时间不可能早于它的运行，所以最近的运行根本不进候选。之后在事务里锁住运行行，重读子记录，再用判定函数决定删不删。
4. **遇到未回填的子记录就算失败，维护接口返回 503。** 这样生产上如果漏了 0103 回填，会立刻被监控看到；不会删错，也不会悄悄跳过。
5. **存量命令只删导出过的那些行。** 在事务里再确认一次这条运行仍然没有任何动作。请求链接也只清导出过的那几条，而且只在它仍指向这些运行时才清。
6. **两个判断口径：**
   - 「普通问答运行」= actionIds 为空，并且没有任何动作、发件箱或回执属于它（有没有运行编号都算）。
   - 孤立步骤（指向的运行已不存在）只报告、不删。本地三个库都是 0。
7. **统计记录不进一年保留期。** 0110 起已经没有地方写统计，存量命令会把它们一次性删光。
8. **任务顺序：** `agent_run_retention` 排在 `read_cost_rollup` 之前，保持「读取量汇总最后执行」这条既有断言不变。
9. **写入审计的分类：** sync 写锁审计只统计 insert 和 update 语句，所以两个新文件各记 1 条（请求链接的 update），归为 non-sync。

## 4. 文件与提交

**提交：**
- `538eef2c2` feat(orbits): one-year AI run-set retention in the maintenance pass and a backed-up legacy trace cleanup (0111)
- `4cfbb762d` test(orbits): classify the 0111 retention writers in the sync write-lock audit

**新增**（都在 `repos/orbits/` 下）：
- `features/agent/retention/run-retention.ts`：常量、判定函数、整套删除、每轮一次的清理
- `features/agent/retention/legacy-trace-cleanup.ts`：统计、导出、删除、远程确认
- `features/agent/retention/maintenance-task.ts`
- `scripts/cleanup-agent-trace-legacy.ts`
- `tests/services/agent-run-retention.test.ts`
- `tests/services/agent-run-retention-postgres.test.ts`

**修改：**
- `features/operations/maintenance/configured-tasks.ts`：接入新任务
- `features/agent/storage/agent-runtime-live-record-provider.ts`：回填 SQL 加上「运行存在」条件
- `package.json`：新增 `db:cleanup:agent-trace-legacy`
- `tests/services/configured-maintenance-reminder-wiring.test.ts`
- `tests/storage/sync-write-lock-audit.test.ts`

**没有提交的：** `repos/orbits/next-env.d.ts`（构建时自动改的，开工前就已修改）、全部 `codex-review.md`、`.claude/skills/gitnexus/`、`output/`。原有 stash 没有动。

## 5. 全量、typecheck、棘轮

**orbits `npm test`**（在 `538eef2c2` 上）：5244 条，4737 通过，**1 条失败**，505 跳过，1 条 todo。
- 失败的是 `sync-write-lock-audit`「every orbit_records writer is classified…」，原因是两个新写入文件还没登记。这是本 Sprint 引入的问题。
- 在 `4cfbb762d` 登记后，这个文件单独跑 4/4 通过，Postgres 测试集里也再跑了一次。没有再跑一次全量。
- 按规则如实记录：全量曾失败，局部修复后回归通过。
- 那条 todo 是已登记的 chat-session provider 棘轮超额（5 > 4），交给 0112，不是本 Sprint 的问题。

**App `npm test`**：3718 条，3716 通过，2 条失败，都在 `tasks-unification-interactions`：
- 「list retains overdue…」；
- 「suggestion next page…」，这条是 0103 就登记过的不稳定用例。
- 这个文件单独跑 3 次都是 19/19。另外误把全量又跑了 2 次，两次都是 3718/3718。
- 本 Sprint 没改 App 代码，判为负载下不稳定。「list retains overdue…」是这次新出现的不稳定名字，请协调者登记。

**typecheck 和 lint：** orbits `typecheck` 为 0，`typecheck:app` 为 0，`npm run lint` 为 0，App `typecheck` 为 0。

**棘轮：** 读取上限棘轮基线合计仍是 156，没有新增 `limit: "unbounded"`；读取成本基线没有改动。

## 6. Postgres 测试

找法：所有使用 `ORBIT_LIFECYCLE_TEST_DATABASE_URL`、又引用到 agent 模块、orbit-ai 存储、AI/agent 接口或维护任务的测试文件，共 10 个；再加 `agent-worker-postgres-recovery` 和几个相关的非数据库文件。全部用 `--test-concurrency=1` 跑。

**在 `orbit_test` 上：83/83 通过，0 跳过。** 文件如下：
- `read-cost-postgres`
- `agent-ledger-paging-postgres`
- `agent-run-retention-postgres`
- `agent-run-trace-postgres`
- `canonical-inbox-plan-changes-postgres`
- `canonical-inbox-projection-postgres`
- `dashboard-snapshot-postgres`
- `personal-schedule-window-maintenance-postgres`
- `schedule-reminder-refresh-cutover-postgres`
- `agent-worker-postgres-recovery`
- 以及非数据库文件：`agent-run-retention`、`configured-maintenance-reminder-wiring`、`maintenance-pass`、`sync-write-lock-audit`

**在 `orbit_cutover_test_20260917` 上：** `canonical-reminder-wake-postgres` 26/26。

**合计 109/109。** 日志在 `build/harness-state/evidence/sprint-0111/run-01/commands/postgres-env-*.txt`。

## 7. 运行时证据

证据在 `build/harness-state/evidence/sprint-0111/run-01/`：
- `api/maintenance-route.txt`：3100 生产构建（`next build --webpack` 加 `next start -p 3100`），连 `orbit_events` 的临时副本，所有数据库地址变量都钉到本机，付费 AI 的 key 置空，CRON_SECRET 用临时随机值。结果见 SC-04 一行。
- `commands/cleanup-orbit_test.txt`、`cleanup-scratch.txt`、`cleanup-orbit_events.txt`、`cleanup-guard.txt`：远程确认检查的实测，用一个假主机，在连接之前就被拒绝，另测了未知参数被拒绝。

**清理与收尾：**
- 3100 已按 PID 停止。
- 临时副本库 `orbit_events_0111_scratch` 已删除。
- `orbit_test` 里的 `cleanup_0111_qa` schema 和测试 schema 都已删除。
- scratchpad 里的副本 dump、测试备份和临时密钥都已删除。
- 3000 没有碰过，现在返回 200。
- **付费 AI 调用：0 次。**

## 8. GitNexus

- `createConfiguredMaintenanceTasks`：upstream 影响 6 处，LOW，涉及维护 HTTP、heartbeat 和 scheduler。
- `AGENT_RUN_TARGET_BACKFILL_SQL`：索引里没收录，结果是 UNKNOWN。全文搜索确认只有 `scripts/migrate-agent-run-targets.ts` 和 `agent-run-trace-postgres` 测试两处使用，两处都已覆盖。
- detect-changes（staged 与 compare）：risk low，没有受影响的流程。索引有些过期，符号名因行号偏移显示不准。

## 9. 生产上线步骤（给用户，都要用户确认后才能执行）

**0. 先确认 0103 回填已在生产执行（只读）：**
```sql
select count(*) from orbit_records
 where target_id is null
   and collection_name in ('agentRunSteps','agentActionsV2','agentOutbox','agentExecutionReceipts')
   and coalesce(payload->'entity'->>'runId','') <> '';
```
结果不为 0，就先执行 `npm run db:migrate:agent-run-targets`。清理命令本身也会拒绝执行，保留期任务会返回 503 报警。

**① 只读统计：**
```sql
select collection_name, count(*) from orbit_records
 where collection_name in ('agentRuns','agentRunSteps','agentActionsV2','agentOutbox','agentExecutionReceipts','agentAnalyticsEvents','orbit_agent_chat_requests')
 group by 1;

select jsonb_array_length(coalesce(payload->'entity'->'actionIds','[]'::jsonb)) > 0 as has_actions, count(*)
  from orbit_records where collection_name = 'agentRuns' group by 1;
```
或者用生产环境变量运行 `npm run db:cleanup:agent-trace-legacy`，默认就是 dry-run，只读，会打印 host 和数据库名，不打印连接串。

**② 用户确认后执行导出和删除：**
```
npm run db:cleanup:agent-trace-legacy -- --execute --confirm-remote=<host>/<数据库名> --backup-dir=/Volumes/ORICO/<目录>
```
先导出完整备份再删除，每批在一个事务里完成。中途中断的话，重新执行即可，只处理剩下的行。

**③ 再 dry-run：** 统计记录、普通问答运行、步骤、请求链接四项都应为 0。

**④ 部署新代码后**，每日维护任务会自动执行一年保留期。生产上如果还没有满一年的带动作运行，每轮删 0 行；接口返回里的 `agent_run_retention` 汇总就是删除计数。

**顺序：** 0103 回填 → 统计 → 备份和删除 → 再统计。不需要迁移。

## 10. 遗留与需要知悉

1. App 新出现一个不稳定用例：`tasks-unification-interactions`「list retains overdue and undated work…」，负载下失败 1 次，单独跑 3 次都通过。请协调者登记。
2. `agentFeedback` 行里可能还带着已删运行的 runId。反馈功能按决定 5 不在本 Sprint 范围内；删除后提交反馈会返回 404，这是既有行为。
3. 保留期任务没有处理那些「运行已删、但带 payload runId 的统计记录」。0110 起统计已停写，存量这次已全部删除。
4. 维护任务的日志里会打出 `agent_run_retention` 汇总行，都是计数，不含任何个人数据。
## 11. 协调者复核

协调者在 `4cfbb762d` 上独立复核：

- **orbits 全量**：5244 条，4738 通过，**0 失败**，505 跳过。子代理那次「局部修复后没有重跑全量」，这次复跑补上了，最终全量通过。
- **App 全量**：3718/3718 通过。子代理遇到的两条 `tasks-unification-interactions` 这次没有出现。「list retains overdue…」已加入不稳定观察名单。
- **Postgres 测试**：涉及 agent、orbit-ai、维护任务、收件箱、读取成本、看板，并且使用 `orbit_test` 的全部文件，排除了需要 cutover 库的 4 个文件，共 164 条，160 通过，0 失败，4 跳过。
- **本机开发库**：agentRuns、agentRunSteps、agentAnalyticsEvents 都已经是 0；请求记录 51 条保留。
- **备份文件**：在 `repos/orbits/build/agent-trace-cleanup/`，被 `.gitignore` 的 `build` 规则忽略，权限 600，不会被提交。里面有本机开发库的对话内容，留在本机。
- **生产步骤**：已写入 `PRODUCTION_ROLLOUT.md`，需要用户确认。
