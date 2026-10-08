# Sprint W0028 — 执行总结

对应 [GOAL.md](GOAL.md)。改了哪些文件看 git diff，这里不逐文件复述。

## 结果

- 已验证能做到：
  - 活动页 `/app/events`（含「我的活动」）、iOrbit 首页 `/app/agent`、引导页 `/app/start` 判断「我报没报」时，数据库只返回活动 id 和状态。legacy 旧报名只取当前页面涉及的活动；这个人另有 20 场旧报名时，读取字节不变（SC-01、SC-04）。
  - 活动详情页判断「我报没报」也只取活动 id 和状态。已报名时仍下发名单，已取消或没报名时不下发（SC-02）。
  - 新旧读取在本机 PG 上逐项对照一致，包括失败语义：旧读取报错的坏数据，新读取也报错；旧读取不报错的，新读取也不报错（SC-01）。
  - 读取失败照旧向上抛，不会显示成「未报名」。闸门关闭时在发 SQL 之前拒绝；并发的相同读取只发一条 SQL（SC-03）。
  - 活动页每次本人报名读取 ≤345 B（改前 12,760 B）。活动页＋详情页本人报名读取合计每月 28.65 MB（改前 550 MB，上限 30 MB）（SC-04）。
  - 3001 上 verify-plan 看活动页（全部／我的活动）和已报名活动的详情页，桌面 1440 与手机 375 都正常，控制台 0 错误（SC-05）。
- 仍未实现或未验证：
  - 名单读取和「谁会来」匿名预览仍读整行，本 Sprint 只实测，由 W0029 处理（D19）。

## 运行记录

- 结果：completed
- Generator：Claude Opus 5.5，2026-09-29，run-01；Planner revision 4（sha256 `2058d383ce7de238e5e5cb5d9cb26156f362bb2e7f63acabf8b1ca595778ad69`）
- 分支 `sprint/W0028-registration-status-read`，基线 `56770528`；功能 SHA `1d70b2cd`；`chat-agent` 合并 SHA：见登记表
- 档位 H。全量对照：基线 5729 测试、失败 80；HEAD 5750 测试、失败 80；新增失败 0（`08-fail-*.txt`、`08-new-failures.txt` 为空）
- 付费 AI 调用 0；未 push；未碰生产库
- REPORT 由协调者按 Generator 交回的正文落盘
- 证据：`~/orbit-sprint-evidence/web/sprint-W0028/run-01/`

## 验收结果

| SC | 结果 | 证据 |
| --- | --- | --- |
| SC-W0028-01 等价（含失败语义） | pass | `tests/services/event-registration-status-read.test.ts`，覆盖：SQL 形状 5 项；PG legacy 状态矩阵（rsvped、cancelled；status 缺失／null／`"pending"`／数字／对象；别人的报名；20 场集合外；重复记录两种顺序；结构损坏 6 种；已删除）；legacy 失败矩阵 15 种；canonical 常规对照与损坏矩阵 17 种 × rsvped／cancelled；runtime 子进程按真实配置对照新旧 runtime 函数，并断言轻量路径不返回 payload、profile_payload 等列；JS 日期边界在 4 个时区对照。PG 部分在 `orbit_test` 上 0 skip。RED `01-red.txt`（20/20 fail），GREEN `02-green-targeted.txt` |
| SC-W0028-02 页面行为不变、走轻量路径 | pass | W0024、W0018 页面测试原断言未改，只换替身，并加「整行方法 0 次」断言；详情页本人判定测试（rsvped 时下发名单；cancelled、null、无报名时返回 null；`eventRegistrationRuntimeService.get` 0 次）；`app-registered-event-lifecycle`、W0027 `app-event-detail-actor-id` 通过。RED `01-red-pages.txt` |
| SC-W0028-03 失败、闸门、去重 | pass | 同一个新测试文件：(a) 任一路抛错 → reject；(b) 闸门关闭 → `ReadBudgetExceededError`，SQL 0 次；(c) 并发相同参数（eventIds 顺序不同也算）→ 闸门 2 次、SQL 1 次、结果相同，失败后重新发 SQL；配置 store 的写入会驱逐进行中的轻量读取；(d) repository 未配置 → canonical 为空，单场读取与 runtime service 一样回退 legacy；(e) 详情页本人判定抛错 → `resolveCanonicalEventDetailView` reject（页面 try/catch 显示 unavailable），不进入私密活动判定 |
| SC-W0028-04 流量 | pass | `04-measure.txt`（脚本 `measure-w0028-status-bytes.ts`），数据见下 |
| SC-W0028-05 回归 | pass | `03-regression-sc05.txt`（100/100）；`03-tsc.txt` exit 0；浏览器 `06-browser.json` 与 6 张截图；全量对照无新增失败 |

### SC-04 实测（W0017 口径：每条语句返回行 JSON 字节之和）

| 场景 | legacy 改前 → 改后 | canonical 改前 → 改后 |
| --- | --- | --- |
| ① 13 场目录，每路 1 场报名 | 1 条／2,073 B → 1 条／66 B | 1 条／2,552 B → 1 条／69 B |
| ① 13 场目录，每路 5 场报名 | 1 条／10,365 B → 1 条／330 B | 1 条／12,760 B → 1 条／345 B |
| ② 在 ① 5 场基础上，另有 20 场目录外 legacy 旧报名 | 1 条／25 行／53,877 B → 1 条／5 行／330 B | 12,760 B → 345 B |
| ③ 详情页本人判定单场（含 enrollment 1 条，236 B） | 2 条／2,073 B → 2 条／66 B | 2 条／2,788 B → 2 条／305 B |

- 语句数改前改后相同。报名窗口读取 13 条／1,180 B，不变，单列。
- 月估算（1000 人 × 30 天，每人每天活动页 1 次、详情页 2 次，5 场报名全落在字节较大的一路）：
  - A 行 活动页本人报名：382.80 MB → **10.35 MB**
  - B 行 详情页本人判定（含 enrollment）：167.28 MB → **18.30 MB**；不计 enrollment 为 4.14 MB
  - 合计：550.08 MB → **28.65 MB ≤ 30 MB**；不计 enrollment 为 14.49 MB
  - 参考（超出假设）：每人 10 场（两路各 5 场）时，合计 38.55 MB
- 基线复测：W0024 原脚本在基线上重跑，数字与 W0024 一致（`01-measure-before-w0024-script.txt`）。

### ④ 名单与匿名预览（只测，不计入上限，交 W0029）

| 活动人数（含本人） | canonical 名单 `listCanonicalRegistrations` | legacy 预览 `listRegistrations` |
| --- | --- | --- |
| 6 | 1 条／6 行／15,057 B | 1 条／6 行／12,123 B |
| 31 | 1 条／31 行／77,802 B | 1 条／31 行／62,633 B |

- 已报名用户打开详情页 = 本人判定（上表 ③）+ canonical 名单。
- 匿名预览 = enrollment 1 条 + 同一个名单读取（enrolled 活动），或 legacy `listRegistrations`。

### EXPLAIN（本机小数据，见 `04-measure.txt` 末尾）

- legacy 批量：走 `orbit_records_private_owner_idx`（workspace, collection, user_id）索引扫描，其余条件作为 Filter，再按旧顺序排序。
- legacy 单场：小数据下计划选了 `private_owner_idx` 加 `record_id` 过滤；查询条件与旧的 `getRecord` 相同，真实数据量下应走主键。
- canonical 批量：heads 表按（workspace, actor_id）索引扫描，再与两张 version 表的主键做嵌套循环，与旧整行读取同形。
- 不需要新索引。

## 偏差

1. **`statusSql` 形状与 PLANNER 不同**：PLANNER 建议 `{ client; gate }`，在 provider 内自建去重；实际是 `{ client; read }`，`read` 是配置 store 新增的 `customRead`。闸门（每次逻辑调用都查，发 SQL 之前）和 in-flight 去重都与 store 共用同一个 deduper，所以 store 的写入会像驱逐普通读取一样驱逐进行中的轻量读取；失败不缓存。为此从 `createReadDedupedLiveRecordStore` 抽出 `createInflightReadDeduper`，并新增 `createGatedDedupedCustomRead`、类型 `LiveRecordCustomRead`、`ConfiguredPostgresLiveRecordStore.customRead`。store 原有行为不变，`configured-live-record-store.test.ts` 通过。
2. **legacy 也按 D20 保持失败语义**（PLANNER 对 legacy 只要求结构和 status 语义）。旧读取会解析这个用户的每一行，下列情况会让它报错：`created_at`／`updated_at` 不能解析成合法 JS 日期；`occurred_at`／`deleted_at` 是超出 JS 日期范围的有限值；payload 是 JSON `null`；payload 是 JSON 字符串（旧读取会对它 `JSON.parse`）。轻量 SQL 把这些行带 `issue` 标记返回，不论属于哪场活动，JS 端照旧报错；JSON 字符串 payload 原文带回，在 JS 里按旧逻辑解析和判断，结果完全一致。正常数据里没有这些行，不增加字节。
3. **补上的抛错点**：node-pg 解析超出 JS 日期范围（约 275760 年）的时间戳会得到 Invalid Date，`toISOString()` 随后抛错；临界值取决于会话时区（postgres-date 先按本地墙钟做 `Date.UTC`，再减时区偏移）。两条 SQL 共用新文件 `shared/storage/postgres-js-date-sql.ts` 的判断式，测试在 UTC、Asia/Shanghai、America/Los_Angeles、Pacific/Kiritimati 四个时区对照。
4. `next-env.d.ts` 按协调者指令不还原（PLANNER 写的 `git checkout -- next-env.d.ts` 不执行）。

## 假设与额外阅读

- 上下文包之外读了：`shared/storage/postgres-live-record-store.ts`（`rowToRecord`、时间戳解析、`listQuery` 排序）；`shared/storage/migrations.ts`；`shared/storage/live-database-config.ts`；`registration/storage/event-operations-window-provider.ts`；`app/(app)/app/canonical-event-detail-view.ts` 第 100–175 行与 `app/(app)/app/events/[id]/page.tsx` 第 140–200 行；`app/api/events/[id]/registration/preview/handler.ts`；`event-operations/storage/worker-wake.ts`；`tests/services/event-operations-canonical-registration.test.ts`；`node_modules/postgres-date`。
- 命名沿用 PLANNER 建议。
- legacy SQL 返回 `issue` 列（text，正常行为 null）；canonical 按 PLANNER 返回 `valid` 布尔值。
- legacy 批量 SQL 的 eventIds 排序去重（去重键需要）；canonical 与旧读取一样保持传入顺序。
- canonical 构造不出来的情况：非法 status、非对象 `profile_payload` 由 CHECK 约束排除，判断式里仍保留防御；`event_id`、`actor_id` 为空串受外键约束，难以构造，未单独造数，判断条件保留。
- 批量读取从未比较 `registration.id` 和 `registrationId`，单场读取会比较；新旧读取在这一点上都照旧，已在测试里断言。
- `tests/audits/unbounded-list-reads.test.ts` 在基线和本分支都失败，原因是与本 Sprint 无关的 `features/orbit-ai/storage/orbit-agent-chat-session-live-record-provider.ts`（5 > 基线 4）。`live-record-provider.ts` 的计数仍为 2，本 Sprint 没有新增 `limit: "unbounded"`。
- verify-plan 的浏览器验收只读；结束后已 `--reset verify-plan`，summary 与验收前逐字一致（`09-summary-after.txt`）。临时脚本已删，cookie 没落盘。

## GitNexus

- 开工 impact（`00-impact.txt`）：HIGH：`readRuntimeEventRegistrationStates`（影响 4，直接 3）、`createEventRegistrationLiveRecordProvider`（33）、`EventRegistrationProvider`（91）、`EventOperationsRepository`（118）。CRITICAL：`createReadDedupedLiveRecordStore`（277）、`createConfiguredPostgresLiveRecordStore`（477）、`createPostgresCanonicalRegistrationMethods`（42）。LOW：`readRegisteredCatalogueAttendees`、`createConfiguredEventRegistrationProvider`、`registrationSelect`、`registrationFromRow`。UNKNOWN：`createMemoryEventOperationsRepository`（文本搜索 5 个文件使用，都经接口类型，tsc 覆盖）。
- 提交前 `detect-changes --scope staged`（`07-detect-changes-feature.txt`）：14 个文件、91 个符号、281 个流程，risk critical。来源是共享 store 工厂和两个接口的新增成员；行号平移带出的同文件方法没有实际改动。store 原有行为由既有 store 测试和全量对照覆盖。

## review 处理（仅 H 档）

| 意见 | 判断 | 处理 |
| --- | --- | --- |
| Codex `codex review --base chat-agent`（全文 `codex-review.txt`）P1：`next-env.d.ts` 指向 `.next-verify` | 不成立：3001 验收 server 自动改写的工作树未提交文件，分支 diff 不含它 | 无需修改；对功能改动无其他意见 |

## 交接

- 新接口：
  - 类型 `EventRegistrationStatusRecord = { eventId: string; status: string | null }`（`registration/contract.ts`）；调用方只认 `status === "rsvped"`。
  - legacy provider：`EventRegistrationProvider.listRegistrationStatusesForUser(userId, eventIds)`、`getRegistrationStatus(eventId, userId)`。
  - canonical repository：`EventOperationsRepository.listCanonicalRegistrationStatusesForUser`、`getCanonicalRegistrationStatus`。
  - runtime：`listRuntimeEventRegistrationStatusesForUser({ eventIds, userId })`、`readRuntimeEventRegistrationStatus({ eventId, userId })`。
  - 自定义 SQL 走配置 store 的闸门和去重：`ConfiguredPostgresLiveRecordStore.customRead({ collectionName, key, read })`。
  - 超出 JS 日期范围的判断式：`jsDateSafeTimestampSql(column)`。W0029、W0030 可复用这两件。
- 给 W0029 的流量数据：A 行 10.35 MB／月；B 行 18.30 MB／月（含 enrollment；不含为 4.14 MB）；名单与预览见上方 ④ 表。
- 给 W0019：上线后在 Neon 控制台对照 `listRegistrationStatusesForUser`（orbit_records，带 `issue` 列）和 `listCanonicalRegistrationStatusesForUser`（带 `valid` 列）的返回量。
- W28-2 后续候选（未切换，仍读整行）：活动归属（3 处调用 `listRuntimeEventRegistrationsForUser`）；计划对账 `reconcileEventRegistrationsBatch`；journeys；目标推荐。
- 提示：SC-04 按「每人 5 场报名」的假设通过；如果每人有 10 场，合计约 38.55 MB。
- 回退：revert 功能提交 `1d70b2cd`。接口只是新增，旧消费者不受影响。
