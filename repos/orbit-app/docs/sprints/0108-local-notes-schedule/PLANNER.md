# Sprint 0108 — 笔记与个人日程读本地 + 同步流水号的生产安全迁移

**Plan revision:** 1。**模式:** existing-codebase / single-generator。运行状态只在登记表。
**原需求:** 「断网也能用」第 2 期（`docs/designs/2026-09-27-data-architecture/offline-design.html` 第 6 步：服务器已登记，只差页面改成以本地为主）；0102 REPORT 登记的生产前提「生产库是否有 `sync_revision`、怎样安全加上」。承接历史 0033（全域离线只读）中笔记、个人日程两类的屏幕部分。
**单一目标:** App 笔记、个人日程页面本地优先；同步流水号在「所有写入取锁」的前提下可安全上线。
**易读目标:** [GOAL.md](GOAL.md)。
**基线:** 按执行顺序前一个已合并的 Sprint（开工时追加提交号）。0106、0107 若在等待设计案批准，可被越过，之后再按依赖补做。
**进入条件:** 无外部授权。生产迁移的**执行**不在本 Sprint 内，需用户确认（见「生产」）。

## 已查明的事实（2026-09-27）

- 服务端注册表 `repos/orbits/features/sync/domain-registry.ts:18-22`：`notes`、`tasks`、`personal-schedule`（集合 `personal_schedule_items`）。页读取 `domain-read-service.ts:34-58` 只读 `user_id = 本人` 的行；任务行缺嵌套 `task` 会被跳过（:55）。
- 严格版迁移 `features/sync/migrations.ts:18-153`：序列 `orbit_records_sync_revision_seq`、列 `sync_revision`、`orbit_records_is_sync_collection()`（三类）、`orbit_records_acquire_sync_write_lock(collection)`（`pg_advisory_xact_lock` + GUC `orbit.sync_write_lock_key`）、触发器在未取锁时抛 `SYNC_WRITE_LOCK_REQUIRED`（55P03）、回填、唯一索引、`orbit_records_sync_actor_idx`、0102 的 `orbit_records_graph_version_idx`。**这把锁的作用是保证「提交顺序 = 流水号顺序」**，否则后提交的较小流水号会被已经越过它的书签漏掉。
- **产品代码没有任何地方取这把锁**（只有测试 `flow-topology-postgres.test.ts:61`、`sync-domain-topology-postgres.test.ts:49`；`write-gate.ts:11` 仅测试使用）。0069 REPORT：装严格触发器时 orbits 新增 26 条失败（个人日程运行时 10、日程事务关联 3、参数化 ACL 13），原因是 0060–0062 的个人日程 SQL 不取锁。本地开发库用的是 0069 放宽版（只 `nextval`，不查锁）；测试夹具 `tests/support/sync-revision-fixture.ts` 同样放宽。`shared/storage/migrations.ts` 不包含同步迁移。
- 生产库有没有 `sync_revision` 未知（本 Sprint 不连生产）。
- App：`src/data/sync/sync-coordinator.ts:25` `REGISTERED_DOMAIN_IDS = notes, tasks, personal-schedule`；待办页走 `useSyncedCollection({kind:"task"})` → `mirrorTaskListSource`（`src/screens/tasks/task-list-source.ts:44-47`，共享逻辑 `task-list-source-mirror.ts`，hook `src/hooks/useSyncedCollection.ts:57`）。笔记 `app/notes/*`、`src/screens/notes/*` 全部 `useApiResource(..., network-only)`（`/api/notes`、`notePath`、`/api/tasks/note-page`）。个人日程：`PersonalScheduleList.tsx:34`（90 天窗口，嵌在 TasksScreen）、`PersonalScheduleDetailScreen.tsx:33`、`PersonalScheduleScreen.tsx:61,90` 用 `client.get` 带头 `x-orbit-personal-schedule-version: 3`。`ScheduleScreen` 聚合 `/api/tasks/page`、公开活动、scheduleItems（公开活动仍走网络，属于 B 类，0115 处理）。
- App 本地库 `local-sync-schema.ts` v3（`sync_records` 等）；纪元变化时 `retireEpochs` 保留 pending/conflicted（`local-sync-repository.ts:450-467`）。
- 网页本地镜像（0077/0078）只有 `/tasks` 使用；本 Sprint 不改网页。

## 范围与文件

1. **写入取锁**：凡是写入 `notes`、`tasks`、`personal_schedule_items` 的路径（通用 `upsertRecord`/`transactional-postgres`、个人日程 SQL、任务相关事务、脚本与种子）在同一事务里先取提交顺序锁。优先在共享存储层统一处理，避免逐个调用点修改；逐一列出被覆盖的写入路径。
2. **迁移**：把严格版同步迁移接入可执行的迁移入口（与 `db:migrate:live` 同一机制或独立命令），可重复执行；回填分批，写明锁与耗时预估；提供回滚（关闭触发器）步骤。本地开发库从放宽版切换到严格版，测试夹具同步切换。
3. **App 页面**：笔记列表/详情/编辑页读取、个人日程列表/详情读取改为本地优先（沿用待办页的 hook 与数据源模式）；在线写入成功后触发该类同步；断网时显示「截至」并禁用写入入口（提示需要联网）。
4. **离线策略与清单**：`offline-policy`、`route-domain-inventory` 中对应路由的读取策略更新为本地优先。
- 排除：断网写（0120+）；网页端；新增同步类别；公开活动。

## 验收契约

| SC | 可观察行为 | 必需证据 |
| --- | --- | --- |
| SC-0108-01 | 严格版触发器下，所有写入三类数据的产品路径与脚本正常（0069 记录的 26 条失败不再出现）；两个并发事务「先领号后提交」时，客户端按书签同步不漏行 | 真库并发测试（先 RED）+ orbits 全量 |
| SC-0108-02 | 迁移命令在空库、已放宽的库、已严格的库上都能重复执行；回填后无空值、无重复；回滚步骤实测可用 | 本地三种库的执行记录 |
| SC-0108-03 | 双账号「本机库扮演服务器」测试：隔离（A 的手机里没有 B 的行）、增量（首次全量→改一行只传一行→再同步 0 行）、软删除同步到手机后消失 | 真库测试 |
| SC-0108-04 | App 笔记与个人日程页本地优先：有网时先显示本地再更新；断网时显示「截至」、写入入口提示需要联网；在线写入后本地随之更新 | App 测试 + phoneweb 与 Simulator 飞行模式截图 |
| SC-0108-05 | 读取成本：打开笔记页不再每次整页下载（小票/账本对照）；两端全量、typecheck 通过；棘轮不增加 | 小票对照 + 摘要 |

## 测试

- 档位 H（共享写入路径 + 触发器）。开发集：同步拓扑 Postgres 测试、个人日程运行时与事务测试、并发提交顺序测试、App 同步与屏幕测试；收口：两端全量各一次；Postgres 测试按 `ORBIT_LIFECYCLE_TEST_DATABASE_URL` 约定显式运行。
- 运行时：本地生产构建 + phoneweb + Simulator，双账号。

## 生产（需用户确认后由用户或协调者执行）

报告必须给出：① 如何在生产只读判断 `sync_revision` 是否存在；② 迁移执行顺序（先部署「写入取锁」的代码，再跑迁移；反过来会让写入失败）；③ 回填批量与预计锁时间；④ 回滚。协调者汇总进 `PRODUCTION_ROLLOUT.md`。

## 失败与交接

若「统一在存储层取锁」不可行，改为逐个写入路径取锁并加一道审计测试（新写入路径未取锁则失败），在报告中说明。交接给 0113：同步读取仍只认 `user_id = 本人` 的万能表行；新类别与专用表来源由 0113 扩展。
