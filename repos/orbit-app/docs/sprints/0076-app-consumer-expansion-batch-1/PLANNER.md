# Sprint 0076 — App 消费者扩面 · 第一批（待办链）

**Plan revision:** 1。**模式:** existing-codebase / single-generator。运行状态只在登记表。
**原需求:** 读取成本治理设计案 Rev 4 第 11 节 Phase C 第二项（0076，可拆多个 run，本 run 为第一批）。
**单一目标:** 原生待办页镜像优先：冷启动后第二次进入 0 次业务网络请求；Web 不回归；棘轮下降。
**易读目标:** [GOAL.md](GOAL.md)。
**基线:** `chat-agent` = `cadbb2e10`（0075 completed）。
**进入条件:** 0071、0075 completed。只用本机 Web/API、Simulator、phoneweb。

## 已查明的事实与本 Sprint 的核心判断

| 事实 | 数据 |
| --- | --- |
| 0069 未落地屏幕接线 | 设计案写"0069 带回来的 8 屏已接线"——实际 0069 REPORT 明确延后了全部屏幕接线。本批是第一块真正接线 |
| 0033 分支的 `TasksScreen` 接线 | diff 可移植：`useSyncedCollection({ kind: "task" })`、`readTaskListItems({ tasks: records.map(r => r.payload) })`、变更后 `invalidate()` 回读镜像确认、`sync.*` 状态文案（i18n 键已在主线） |
| Web 无镜像 | `local-sync-database.web.ts` 为 online-only；`useSyncedCollection` 在 Web 上永远停在 `local-ready` 空集——直接照搬会把 phoneweb 待办页打成空白 |
| 平台分流先例 | `base-url.web.ts`、`batch-image-source.web.ts`、`local-sync-database.web.ts` |
| 服务端 tasks 列表 | canonical payload 嵌套在 `payload.task`，顶层无 `accountId`——`payloadAccountId` 过滤会把 canonical 行也过滤掉，**不能**用它在 SQL 侧剔除 80 条旧格式行；该优化需要新的查询能力，留后续 |
| 可零变化加 `limit: 1` 的调用 | 仅 `connection-live-record-provider.ts:274`（`recordIds: [connectionId]` + collectionName，主键唯一 ⇒ ≤1 行）。其余候选要么条件展开、要么不是查询 |

**判断 1：屏幕只认 `TaskListSource` 接口，数据源按平台分流。** `src/screens/tasks/task-list-source.ts`（原生：synced）与 `task-list-source.web.ts`（Web：`useApiResource`），Metro 按平台解析。
**判断 2：本批不改服务端 tasks 读路径。** "出库字节下降"在本批由"原生第二次进入不再请求 `/api/tasks`"体现（服务端日志可证），账本 `tasks.list` 数字不变——如实记录，不假装。
**判断 3：棘轮只降能零变化证明的那一格。** 174 → 173。设计案"计数持续下降"的主力要等列表 API 真分页，不在本批。

## 范围与文件

- 新建（App）：`src/screens/tasks/task-list-source.ts`、`src/screens/tasks/task-list-source.web.ts`。
- 修改（App）：`src/screens/tasks/TasksScreen.tsx`（换数据源、变更后镜像确认、同步状态文案）；`src/data/offline-read/route-domain-inventory.ts`（消费者登记随文件迁移）。
- 新建（App 测试）：`tests/tasks-screen-source-selection.test.ts`（源码级：原生源用 `useSyncedCollection`、Web 源用 `useApiResource`、屏幕不直接引用二者）。
- 修改（orbits）：`features/connections/storage/connection-live-record-provider.ts:274` `limit: 1`；`tests/audits/unbounded-list-reads.baseline.json` 该文件计数 −1。
- 排除：其他屏幕；HomeDashboard 待办区（走 `scope.client.get`，第二批）；服务端 tasks 读路径；Web 镜像；离线写入。

## 验收契约

| SC | 可观察行为 | 必需证据 |
| --- | --- | --- |
| SC-0076-01 | **数据源分流**：原生 `task-list-source.ts` 经 `useSyncedCollection`；Web `.web.ts` 经 `useApiResource(tasksPath())`；`TasksScreen.tsx` 不再 import 任一；inventory 守卫全绿（消费者登记迁到 `.web.ts`） | 源码级测试 + `offline-read-inventory.test.ts` |
| SC-0076-02 | **第二次进入 0 次业务请求**：Simulator 冷启动 → 待办页 → 首页 → 待办页；服务端日志第二次进入无 `GET /api/tasks`；列表计数与第一次一致 | 日志片段 + 两张截图 |
| SC-0076-03 | **变更后镜像确认**：Simulator 勾选一条待办 → PATCH 2xx → 镜像回读为 completed → UI 进入已完成分组；失败时显示 `sync.mutationPending` 而非静默 | 截图／日志 |
| SC-0076-04 | **棘轮与基线**：`unbounded-list-reads.baseline.json` 总数 174 → 173；`connections` 既有测试与 0070 账本全绿（`tasks.list` 数字不变，如实记录） | 审计测试、账本测试 |
| SC-0076-05 | **无回归**：App 全量与 0075 收口（3493）对照零新增失败；两端 typecheck 0；phoneweb 待办页仍 54/10/13 且请求 `/api/tasks` | 摘要、页面结果 |

## 一次 Generator 的执行顺序

1. 记录基线、`git status --short`、Planner SHA256，登记 run-01。
2. RED：源码级测试（源文件不存在必红）→ 写两个数据源模块 + 改屏幕 → GREEN；inventory 迁移。
3. 服务端 `limit: 1` + 棘轮 JSON；跑审计、connections、账本。
4. App 全量、两端 typecheck；Metro 热更新后 Simulator 两次进入 + 勾选；phoneweb 对照。
5. 路径限定暂存 → staged `detect_changes` → commit → `merge --no-ff` → REPORT、登记表。

## 最小测试与检查

- 档位：App **H**（屏幕 + 数据源）；orbits **L**（一行 `limit: 1`）。App 全量；orbits 定向集 + typecheck。

## 失败与交接

若 Simulator 第二次进入仍出现 `GET /api/tasks`，查数据源分流与 `useSyncedCollection` 的 mount 逻辑，不得用"第一次也不请求"掩盖。
若镜像回读与 PATCH 回执不一致，按 0033 分支设计显示 `sync.mutationPending`，不得直接信任回执覆盖镜像。
报告须列 SC 映射、功能 SHA、命令与退出码、未提交项、其他端影响与下一步。
