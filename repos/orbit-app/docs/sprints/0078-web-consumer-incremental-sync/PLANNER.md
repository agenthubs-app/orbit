# Sprint 0078 — Web 消费者接入增量同步

**Plan revision:** 1。**模式:** existing-codebase / single-generator。运行状态只在登记表。
**原需求:** 读取成本治理设计案 Rev 4 第 11 节 Phase D 第二项（0078）。
**单一目标:** 同步协调器以 manifest 水位线门控域页拉取，服务端 manifest 条件读；Web `/tasks` 镜像优先 + 后台增量，能力不可用时网络；离线可读标 stale、空镜像失败显错误、登出清库、SSR 首屏不依赖镜像。
**易读目标:** [GOAL.md](GOAL.md)。
**基线:** `chat-agent` = `bc39eeb24`（0077 completed）。
**进入条件:** 0077 completed。只用本机 phoneweb + Chromium + Simulator。

## 已查明的事实与本 Sprint 的核心判断

| 事实 | 数据 |
| --- | --- |
| 协调器现状 | `runSync`：lease → 按域 retireEpochs → 每个域从存储游标起拉页直到 `hasMore=false`；**不调用** `getManifest`（sync-client 已有该方法） |
| 服务端 manifest | `createSyncDomainHandlers().manifest` 直接 `NextResponse.json`，`noStore`；未用 0072 的 `conditionalJsonRead` |
| 本地游标表 | `sync_cursors(workspace_id, domain_id, authorization_epoch, cursor, last_successful_sync_at, bootstrap_state, completeness, generation)`，**没有水位线列**；游标 token 对客户端不透明 |
| 本地 schema | `LOCAL_SYNC_SCHEMA_VERSION = 2`；`migrateLocalRead` 按版本分步，v1→v2 走复制校验 |
| Web `/tasks` 源 | `task-list-source.web.ts` = `useApiResource(tasksPath(), () => false, { cachePolicy: "network-only" })`；原生 `task-list-source.ts` = `useSyncedCollection({ kind: "task" })` |
| `useApiResource` | 第二参数是 `isEmpty` 判定，不是跳过开关；无 enabled 参数 |
| 状态标签 | 原生 5 态 `sync.localReady / syncing / fresh / stale / failure`；设计案七态（partial / not-downloaded / not-authorized / locked）在 App 里没有对应 UI |
| 个人日程 | 域在白名单且会被同步；Web 只有 `app/schedule/personal/[id]`、`new` 两个编辑路由，列表内嵌在首页／个人页的 `/api/schedule-items` 读取里 |
| 二次访问 | 0076 证明：新鲜度窗口内第二次进入 0 请求；窗口外或前台唤醒才会同步——manifest 门控作用于这类同步 |

**判断 1：manifest 门控放在协调器，两端共享。** lease 之后调 `getManifest`；对每个已绑定作用域，若本地游标 `bootstrap_state='complete'` 且 `high_watermark` 与 manifest `watermark`、`generation` 与 manifest `generation` 都相等，则跳过该域的域页拉取。manifest 缺该域（撤权）由既有 retireEpochs 路径处理。
**判断 2：水位线落在游标行里，本地 schema v3。** `sync_cursors` 加 `high_watermark TEXT`（可空）；`applyDomainPage` 写 `page.highWatermark`；v2→v3 只做 `ALTER TABLE ADD COLUMN`，不复制、不重建；旧行 `NULL` 意味着"不可比较 → 照拉"。
**判断 3：manifest 服务端做条件读。** 复用 `conditionalJsonRead`：作用域 = 注册表三集合（用户范围）+ 共享授权集合；数据未变 → 304，App `client.get` 的 0072 条件缓存回放上一次 manifest。
**判断 4：Web `/tasks` 双源并存、按能力切换。** `task-list-source.web.ts` 同时调用 `useSyncedCollection` 与 `useApiResource`（hook 顺序固定）；`useWebMirrorStatus().mode === "local-mirror"` 时以镜像为源，否则以网络为源。网络源在镜像态下会多一次 `/api/tasks`——用 `cachePolicy` 与 scopeKey 不变时的既有去重规避不了，因此把网络源改为**可跳过**：给 `useApiResource` 加可选 `enabled`（默认 true）。原生源逻辑抽成 `task-list-source-mirror.ts` 供两端复用。
**判断 5：状态与 App 对齐 = 复用 5 态。** 不新造七态；离线时镜像非空 → `stale`，镜像空 → `failure` 显示错误。
**判断 6：SSR 不碰镜像。** 静态导出在 Node 里渲染：`browserMirrorEnvironment()` 在无 `navigator` 时探测为 online-only，首屏 HTML 走网络源的 loading 态；导出成功即证据。

## 范围与文件

- 修改（orbits）：`app/api/sync/domain-handlers.ts`（manifest 走 `conditionalJsonRead`）；`tests/api/sync-lease-manifest-domains.test.ts` 增 304 用例；`tests/services/sync-domain-topology-postgres.test.ts` 增"第二次同步 0 行业务读"用例（用 `configuredReadMetrics` 观察器或 SQL 计数）。
- 修改（App）：`src/data/sync/local-sync-schema.ts`（v3 + 列）、`local-read-migrations.ts`（v2→v3）、`local-sync-repository.ts`（`LocalSyncCursor.highWatermark`、写读）、`sync-coordinator.ts`（manifest 门控）、`src/hooks/useApiResource.ts`（`enabled`）、`src/screens/tasks/task-list-source.web.ts`（双源）、新建 `src/screens/tasks/task-list-source-mirror.ts`、`task-list-source.ts` 改为复用、`src/data/offline-read/route-domain-inventory.ts`（登记不变或按文件移动）。
- 测试（App）：`tests/sync-coordinator-lease.test.ts` 增 manifest 门控用例；`tests/local-sync-repository.test.ts` 增 v2→v3 迁移用例；`tests/tasks-screen-source-selection.test.ts` 改 Web 源断言；`tests/mirror-topology.test.ts` 增 codec 越权用例；新建 `tests/web-tasks-mirror-browser.test.ts`（Playwright：伪服务器下首次同步→二次 0 域页→离线 stale→空镜像失败显错→登出清库）。
- 排除：个人日程 Web 列表消费者（无路由，第二批）；七态新增 UI；`/api/sync/domains/:id` 条件读（有 manifest 门控后收益小，记录不做）。

## 验收契约

| SC | 可观察行为 | 必需证据 |
| --- | --- | --- |
| SC-0078-01 | **manifest 门控**：数据未变的第二次同步，协调器只调 lease + manifest，0 次域页；水位线变化的域才拉页；服务端第二次 manifest 带 If-None-Match → 304，且业务集合 0 行读 | 协调器单测；orbits API 单测；PG 拓扑用例 |
| SC-0078-02 | **Web `/tasks` 镜像优先**：能力可用时源是 `useSyncedCollection`，不可用时是 `useApiResource`；phoneweb localhost 第一次进 `/tasks` 出现 lease/manifest/域页，第二次进入 0 次业务请求，列表计数与 `/api/tasks` 一致 | 源选择单测；phoneweb 请求清单与截图 |
| SC-0078-03 | **离线与错误态**：已同步后断网刷新 → 列表可读且标 `sync.stale`；镜像为空且首次下载失败 → 显示失败文案而不是空列表 | 浏览器测试 |
| SC-0078-04 | **登出清库与 SSR**：登出后 IndexedDB 无该 digest 密钥、再登录 `listRecords` 为空；`expo export` exit 0，`dist/tasks.html` 可渲染 | 浏览器测试 + 导出日志 |
| SC-0078-05 | **无回归与越权**：App 全量对照 3501 零新增失败；orbits 定向集绿；两端 typecheck 0；Simulator 待办页在本地 schema v2→v3 迁移后仍 52/12；三层拓扑：B 的仓库（不同 codec／作用域）读不到 A 的密文行 | 摘要、截图、拓扑用例 |

## 一次 Generator 的执行顺序

1. 记录基线、`git status --short`、Planner SHA256，登记 run-01；建分支 `codex/sprint-0078-web-consumers`。
2. RED→GREEN（App）：schema v3 + 迁移 + 仓库 `highWatermark`；协调器 manifest 门控（单测：未变 0 域页、变了拉页、manifest 失败回退为照拉并记录）。
3. RED→GREEN（orbits）：manifest 条件读 304；PG 拓扑第二次同步 0 行业务读。
4. Web 源：`useApiResource.enabled`、`task-list-source-mirror.ts`、`.web.ts` 双源；源选择单测；inventory 登记。
5. 浏览器测试（SC-03／04）；`web:export`；phoneweb 请求清单与截图；Simulator 待办页对照（含 v3 迁移日志）。
6. App 全量、orbits 定向集 + typecheck；路径限定暂存 → staged `detect_changes` → commit → `merge --no-ff` → REPORT、登记表。

## 最小测试与检查

- 档位：App **H**（协调器、schema、屏幕源）；orbits **M**（一个 handler + 两个测试文件）。
- 开发定向集：`sync-coordinator-lease`、`local-sync-repository`、`mirror-topology`、`tasks-screen-source-selection`、`today-tasks-screen-source`、`offline-read-inventory`、新浏览器测试；orbits `sync-lease-manifest-domains`、`sync-domain-topology-postgres`、`read-cost-baseline`。

## 失败与交接

若 manifest 条件读的作用域无法用 `readDomainWatermark` 精确覆盖注册表三集合（例如 canonical-only 过滤导致水位线与页内容不一致），退回为"manifest 不做 304、只做客户端门控"，并把原因写进 REPORT。若 v2→v3 迁移在 Simulator 触发 `SYNC_INIT_FAILED`，停下：不得用删库重建替代迁移。报告须列 SC 映射、功能 SHA、命令与退出码、未提交项、其他端影响与下一步。
