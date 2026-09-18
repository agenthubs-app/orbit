# Sprint 0069 — 增量同步存量归位

**Plan revision:** 1。**模式:** existing-codebase / single-generator。运行状态只在登记表。
**原需求:** 读取成本治理设计案 Rev 4 第 02 节（未合并存量）与第 11 节 Phase 0；0033 登记表状态 running 且无 REPORT。
**单一目标:** 分支上已完成的增量同步实现进入主线，主线 v2 本地 schema 与 epoch 作用域不倒退。
**易读目标:** [GOAL.md](GOAL.md)。
**基线:** `chat-agent` = `86e2471ce`（0068 completed）；待集成 `codex/sprint-0033-incremental-read-sync` = `d0333d2f0`；merge-base `a8ac3f761`（分支侧 36 提交，主线侧 249 提交）。
**进入条件:** 0067／0068 completed。只用本机环境，不部署、不连云端。

## 已查明的事实与合并策略（本 Sprint 的核心判断）

**主线不是落后，是领先。** 冲突面 28 个文件，其中最关键的一处不是机械冲突：

| | 分支 | 主线 |
| --- | --- | --- |
| `local-sync-schema.ts` | `SCHEMA_VERSION = 1`，`sync_records` 主键 `(workspace_id, kind, record_id)` | `SCHEMA_VERSION = 2`，主键 `(workspace_id, domain_id, authorization_epoch, record_id)`，多 `local_read_{assets,index,scope_state}` 三表 |
| `local-sync-repository.ts` | +71/−16：`getLastWorkspaceId()`、`resetWorkspace(ws, canCommit)`、`applyPage` 加 `canCommit` 并返回 boolean、`LocalSyncPageSupersededError` | +118/−14：epoch 作用域、`applyDomainPage`、`resetDomain`、`isReadable`，以及 `legacyScope(workspaceId, kind)` 垫片把旧 `(workspaceId, kind)` 调用映射到 v2 |
| `local-read-migrations.ts` | 无 | 真实 v1→v2 迁移：复制／校验／改名交换／主键形状校验 |

分支的 `sync-coordinator.ts` 只依赖五个仓库方法：`getLastWorkspaceId`、`getCursor(ws)`、
`listRecords({ws, kind})`、`resetWorkspace(ws, canCommit)`、`applyPage({...,canCommit}) → boolean`。
后三者的旧签名主线已通过 `legacyScope` 垫片承接；前两者及 `canCommit`／boolean 返回是纯加法。

**因此 `local-sync-repository.ts` 的解法固定为：以主线 v2 实现为基，移植分支的加法 API；
`local-sync-schema.ts` 不在冲突面（分支未改），git 自动取主线 v2。** 任何把 schema 或主键退回 v1 的解法都不接受。

其余冲突（`shared/storage/*` 四文件是 0067 与分支 `compareAndSwapRecord` 各改不同区域；
`features/notes/*` 是分支的笔记删除并发锁与主线小改；8 屏幕与 i18n 字典）预期为机械合并，逐个核对。

## 集成方式

沿用 0067 固定约定：`git merge --no-ff`，不 rebase。理由见 [0067 PLANNER](../0067-mainline-production-alignment/PLANNER.md#集成方式本-sprint-的固定约定)。

## 范围与文件

- 读取：两侧 `local-sync-repository.ts`／`local-sync-schema.ts`／`local-read-migrations.ts`、分支 `sync-coordinator.ts`、[RULES](../RULES.md)。
- 新建（由 merge 带入，22 个）：`repos/orbits/app/api/sync/{route,handler}.ts`、`features/sync/{cursor,read-service,migrations}.ts`、
  `scripts/verify-incremental-sync-runtime.mjs`、5 个 orbits 测试；`repos/orbit-app/src/data/sync/{sync-client,sync-coordinator,sync-freshness}.ts`、
  `src/hooks/useSyncedCollection.ts`、5 个 App 测试。
- 修改（冲突合并，28 个）：上表三文件为语义合并；`shared/storage/{live-record-store,postgres-live-record-store,configured-live-record-store,migrations}.ts`、
  `features/{notes,connections/lifecycle}/*`、8 个屏幕、4 个 i18n 字典、对应测试为机械合并。
- 排除：grants／epoch 真实验收与 0033–0036 收口（0075）；8 屏之外的消费者扩面（0076）；
  任何读取护栏改造（0071）；部署；云端连接。

## 验收契约

| SC | 可观察行为 | 必需证据 |
| --- | --- | --- |
| SC-0069-01 | 分支成为主线祖先；22 个新文件在主线存在；**主线 `LOCAL_SYNC_SCHEMA_VERSION` 仍为 2，`sync_records` 主键仍为四列** | `git merge-base --is-ancestor` 退出码 0；文件清单；schema 常量与主键断言 |
| SC-0069-02 | 原生零新增失败：App 全量相对 0068 收口（3452/3452）同环境对照零新增；两端 typecheck 0 | 前后全量摘要 + 失败集合 diff；typecheck 退出码 |
| SC-0069-03 | 分支自带测试在主线 v2 上全绿：5 个 App 测试文件 + 5 个 orbits 测试文件；其中 `local-sync-repository.test.ts` 同时覆盖主线 v2 作用域用例与分支新增的 `getLastWorkspaceId`／`resetWorkspace`／`canCommit` 用例 | 命令、退出码、通过数 |
| SC-0069-04 | 服务端 `/api/sync` 可用且受身份约束：本机 Web/API 上未认证请求被拒；认证后返回符合 `DomainPage` 形状的页；`verify-incremental-sync-runtime.mjs` 可跑 | HTTP 状态与响应形状记录、脚本退出码 |
| SC-0069-05 | **运行时验收**：Simulator 进入一个已接线屏幕（笔记或待办）两次，第二次不对该集合发起业务 GET（服务端日志证明）；phoneweb 上同一屏幕仍可用 | 服务端请求日志两次对照、Simulator 截图、phoneweb 页面结果 |

## 一次 Generator 的执行顺序

1. 记录基线、`git status --short`、Planner SHA256，登记 run-01。
2. 对 `createLocalSyncRepository`、`applyPage`、`listRecords`（orbits 侧 `LiveRecordListQuery`）做 GitNexus upstream impact；HIGH/CRITICAL 先报告。
3. 在 `codex/sprint-0069-incremental-sync` 分支 `git merge --no-ff`，先解语义冲突（repository 以主线为基移植加法 API），再解机械冲突。
4. 先让 `local-sync-repository.test.ts` 同时包含两侧用例（RED：分支用例在主线 v2 上必然缺方法），再落移植（GREEN）。
5. 跑 SC-03 定向集与两端 typecheck；本 Sprint 属 H 档，本地代码收口时对 App 端跑一次全量；orbits 端跑受影响目录（`tests/services/*sync*`、`tests/api/sync-route`）与 typecheck。
6. 路径限定暂存 → staged `detect_changes` → merge commit → 合并回 `chat-agent` 并验证合并树。
7. 重启 Web/API（源码已变），执行 SC-04 与 SC-05。
8. 写 `REPORT.md`，更新登记表。

## 最小测试与检查

- 档位：**H**。改动落在本地存储基座、服务端同步路由与 8 个产品屏幕。
- 开发定向集：`tests/local-sync-repository.test.ts`（合并后）、`tests/incremental-sync-coordinator.test.ts`、`tests/sync-freshness.test.ts`、`tests/synced-consumer-wiring.test.ts`、`tests/tasks-screen-sync-interactions.test.tsx`、`tests/personal-schedule-list-sync-interactions.test.tsx`；orbits 侧 `tests/api/sync-route.test.ts`、`tests/services/incremental-sync*.test.ts`、`tests/services/sync-migrations.test.ts`。
- 操作链收口集：App 全量 + 两端 typecheck。
- 集成触发：含 H，App 端一次全量；orbits 端本 Sprint 只新增文件、冲突文件为机械合并，跑受影响目录 + typecheck，不跑全量（0067 刚做过同环境全量对照，且本次 orbits 改动不触及身份／授权解析路径）。若冲突解决过程中发现 orbits 侧语义改动，升级为全量。
- 不运行：真实物理设备、部署、云端连接。

## 失败与交接

若 `local-sync-repository.ts` 的语义合并无法在保留主线 v2 作用域与分支取消语义两者的前提下完成，停止并产出 `blocked` 报告，
列出具体不可调和点，不擅自退回 v1。若 App 全量出现新增失败且无法定位源码原因，如实记录为 `failed`。
本 Sprint 完成不等于 0033 completed —— 0033 登记表状态由 0075 拿到 grants／epoch 真实验收证据后再改。
报告须列 SC 映射、功能 SHA、命令与退出码、未提交项、其他端影响与下一步。
