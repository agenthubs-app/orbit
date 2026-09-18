# Sprint 0067 — 主线与生产源码对齐

**Plan revision:** 1。**模式:** existing-codebase / single-generator。运行状态只在登记表。
**原需求:** 读取成本治理设计案 Rev 4 第 02 节（未合并存量）与第 11 节 Phase 0。
**单一目标:** 主线重新包含生产正在运行的源码，且生产库围栏与本地切换开关正确嵌套。
**易读目标:** [GOAL.md](GOAL.md)。
**基线:** `chat-agent` = `8e5bd493a`；待集成 `origin/codex/production-cutover-read-write-20260917` = `161e9e6c4`；merge-base = `29efb4c9d`。
**进入条件:** 无外部依赖。只用本机 Postgres，不连任何云端库，不部署。

## 集成方式（本 Sprint 的固定约定）

三次归位（0067／0068／0069）**统一使用 `git merge --no-ff`，不使用 rebase**。理由逐条：

1. **不改写已发布 SHA。** 生产分支已推到 `origin`；而整套 Sprint 规程靠"固定 SHA 交接"运作，
   历史 REPORT 里记录的功能 SHA 一旦被 rebase 改写即全部失效。
2. **冲突只解一次。** 生产分支 4 个提交、0033 分支 36 个提交、phoneweb 分支 65 个提交；
   rebase 会让同一文件的同一处冲突在多个提交里反复出现。
3. **符合仓库惯例。** 0064／0065／0066 均为 `merge(sprint-XXXX): ...`。
4. **detect_changes 需要完整范围。** 一个 merge commit 给出"本次集成整体改了什么"；
   rebase 会把一次集成打散成数十个片段，每份影响分析都不完整。
5. **可回退。** `git revert -m 1 <merge-commit>` 一条命令即可退出整次集成。

已知代价：`git log --graph` 留下分叉合并结构，且冲突集中在一次解决而非分摊。接受。

## 范围与文件

- 读取：本 Sprint GOAL／PLANNER、[RULES](../RULES.md)、生产分支 diff 与其
  `repos/orbits/docs/operations/production-cutover-20260917.md`。不重新盘点全库。
- 修改（冲突合并）：`repos/orbits/shared/storage/live-database-config.ts`、
  `configured-live-record-store.ts`、`live-record-store.ts`、`postgres-live-record-store.ts`、
  `migrations.ts`；`features/{account,auth,contacts}/**` 对应 provider；
  `app/api/_shared/authenticated-actor.ts`。
- 新建（由 merge 带入）：`scripts/assert-local-test-databases.mjs`、
  `tests/architecture/local-test-database-boundary.test.ts`、
  `tests/capabilities/{account-identity-read-budget,auth-concurrent-registration,production-database-target}.test.ts`、
  `tests/services/{conditional-live-record-postgres,contact-list-owner-read-postgres,contact-list-projection-postgres}.test.ts`、
  `repos/orbits/docs/operations/production-cutover-20260917.md`。
- 新建（本 Sprint 文档）：本目录 `GOAL.md`／`PLANNER.md`／`REPORT.md`。
- 排除：phoneweb 基座（0068）、0033 同步存量（0069）、任何读取护栏改造（0071）、
  部署与域名操作、云端数据库连接、生产分支自身尚未完成的四条工作流验收。

## 验收契约

| SC | 可观察行为 | 必需证据 |
| --- | --- | --- |
| SC-0067-01 | 主线包含生产源码：`git merge-base --is-ancestor 161e9e6c4 chat-agent` 退出码 0 | 命令与退出码 |
| SC-0067-02 | 围栏与开关正确嵌套：① 模拟生产且已钉死且主机匹配 → 正常解析；② 模拟生产但未钉死 → 抛错拒绝；③ 已钉死但主机不匹配 → 抛错拒绝；④ 非生产 + `target=local` → 用本机连接串。四种组合互不干扰 | 扩展后的 `tests/storage/live-database-target.test.ts` 与分支自带 `production-database-target.test.ts` 全绿 |
| SC-0067-03 | 合并树可编译可测：`npm run typecheck`、`npm run typecheck:app` 退出码 0；本次 merge 带入的 9 个测试文件全部通过 | 命令、退出码、通过数 |
| SC-0067-04 | 本机以 `ORBIT_DATABASE_TARGET=local` 启动 Web/API，用真实测试账号登录成功并读到该账号数据 | 运行时观察记录（脱敏）：登录 HTTP 结果、一个业务列表的实际条数 |
| SC-0067-05 | 集成方式合规：`--no-ff` merge，提交信息为 `merge(sprint-0067): ...`；staged `gitnexus_detect_changes` 范围已核对，未夹带其他线或用户未提交内容 | detect_changes 摘要与最终 commit SHA |

## 一次 Generator 的执行顺序

1. 记录基线、`git status --short`、Planner SHA256，登记 run-01。
2. 对 `resolveLiveDatabaseConnectionConfig` 做 GitNexus upstream impact（已知 CRITICAL，先报告再动）。
3. 在 `codex/sprint-0067-mainline-alignment` 分支执行 `git merge --no-ff`，逐个解冲突；
   围栏在外、开关在内。
4. 先写／扩展 SC-0067-02 的四组合断言（RED），再落合并实现（GREEN）。
5. 跑 SC-0067-03 的定向集与两端 typecheck；本 Sprint 属 H 档，本地代码收口时做一次 I 检查。
6. SC-0067-04 的本机运行时验证。
7. 路径限定暂存 → staged `detect_changes` → commit → 由协调者合并回 `chat-agent` 并验证合并树。
8. 写 `REPORT.md`，更新登记表。

## 最小测试与检查

- 档位：**H**。改动落在共享存储基础设施与身份/授权解析路径上，必须覆盖失败、隔离与传递消费者。
- 开发定向集：`tests/storage/live-database-target.test.ts`（四组合）、
  `tests/capabilities/production-database-target.test.ts`、
  `tests/services/conditional-live-record-postgres.test.ts`、
  `tests/architecture/local-test-database-boundary.test.ts`。
- 操作链收口集：merge 带入的 9 个测试文件 + `repos/orbits` 与 `repos/orbit-app` 两端 typecheck。
- 集成触发：含 H，本地代码收口时对 `repos/orbits` 跑一次全量；`repos/orbit-app` 若 diff 为空则复用既有证据并说明。
- 不运行：任何云端数据库连接、任何部署、iOS Simulator（本 Sprint 不改 App 运行行为）。

## 失败与交接

冲突若出现无法在不改变任一侧语义的前提下调和的情况，停止合并、保留冲突清单并产出 `blocked` 报告，
不擅自选边或删除任一侧实现。生产分支尚未完成的四条工作流（完整分页、服务端聚合重设计、
跨端写入冒烟、逐域条件写入采纳）**不在本 Sprint 范围**，不得在 REPORT 中标为通过。
报告须列 SC 映射、功能 SHA、命令与退出码、未提交项、其他端影响与下一步。
