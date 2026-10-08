# Sprint W0041 — 执行总结（run-01）

> 本报告正文由 Generator（run-01）撰写；子代理写文件被环境拦截，由协调者按原文写入并提交。

## 结果

对应 [GOAL.md](GOAL.md)。

- **已验证能做到：**
  - 首页服务端复合读取只读首页实际显示的数据。本机三个验收账号单次读取：
    - `user_verify_plan`：58,808 B／11 条 → **2,378 B／6 条**（−95.96%）；
    - `user_verify_legacy`：50,670 B／11 条 → 1,598 B／5 条；
    - `user_verify_new`：24,424 B／9 条 → 1,450 B／5 条。
  - 改后读取不再含整 workspace `orbit_records` 读取，也不再含整目录 `event_ops_events` 读取。
  - 噪声对照：别人的数据涨了 655 行，本人首页字节、行数、语句数**都不变**（改前同条件 +130,550 B）。
  - 首页各块显示不变：
    - mock 51 组（W0040 的 33 组 + 联系人 18 组）逐字节相同；
    - live 边界对照只有两处差异，均在下面「已知且接受的差异」中登记；
    - 真实页面 375 截图逐字节相同，1440 截图只差右上角「现在 10:52／10:54」。
  - 真实页面整次 SSR 的读回执（含页面级读取）：
    - `/app/agent`：24 条／53,907 B → 18 条／4,835 B；
    - `/app/home/events`：22 条／53,319 B → 16 条／4,247 B。
  - 预算：单次 2,378 B 低于硬门槛 3,143 B，也低于目标线 2,644 B（低 266 B）。
- **仍未实现或未验证：**
  - 资料两条读取（919 + 503 B）按 W41-5 没有动。
  - 单次字节随本人数据线性增长：每多 1 场已报名活动约 +720 B，每多 1 场本人旧活动约 +2.8 KB（见 SC-05 ⑤）。验收账号数据少，门槛只对它们成立。
  - 100% 档仍不可达：总账 ① 本身已超额度。

## 运行记录

- 结果：**completed**
- Generator：Claude Opus 5.5，2026-10-02；Planner revision 2（SHA256 `93c840555297abafbfa5edb4ac59bee5206787c74ca5385f8ec00e2bc3d3bbcd`），D47（W41-1～6 全按推荐）
- 分支 `sprint/W0041-home-ssr-read-narrow`（起点 `a18dd1a8`）：
  - 功能 `d5d5ae58`
  - review 修复 `365d8375`
  - 报告：见本文件所在提交
  - `chat-agent` 合并 SHA：见登记表
- 档位 H。全量对照（RULES §5.2，用「本 Sprint 路径临时检出为基线版本、移走新测试」代替 stash）：
  - 基线 6,190 项，失败 9；
  - 改后 6,208 项，失败 9；
  - **新增失败 0**（9 项为既有失败：typecheck 的 `.next` validator、operator script／preflight／manifest／evidence 类）。
  - 全量里新 PG 用例因未设 `ORBIT_EVENT_DATABASE_URL` 而 skip（+4 skipped），它们在定向集里已跑过（见 SC-02）。
- 付费 AI 调用 0；未 push；未部署；未连生产或 Preview。
- 证据目录 `~/orbit-sprint-evidence/web/sprint-W0041/run-01/`。

## 验收结果

| SC | 结论 | 证据 |
| --- | --- | --- |
| SC-W0041-01 | **pass** | 见下方「SC-01 详情」 |
| SC-W0041-02 | **pass**（登记两项差异） | 见下方「SC-02 详情」 |
| SC-W0041-03 | **pass** | 见下方「SC-03 详情」 |
| SC-W0041-04 | **pass** | 见下方「SC-04 详情」 |
| SC-W0041-05 | **pass**（达到目标线） | 下方预算表；`measure-after.jsonl`、`sensitivity-after.jsonl` |

**SC-01 详情**
- `measure-before/after.jsonl`：开头有 host=localhost 与 workspaceId 证明行。
- 改后三账号的 `wideOrbitRecordsStatements` 与 `wideCatalogueStatements` 都为 0。
- `noise-before/after.jsonl`：临时 workspace `workspace:w0041-noise-*`，10 个其他账号向 contacts、connections、evidence、旧 events 各插 100 条，另发布 20 场本人未报名、由他人报名的活动。
  - 改后噪声增量 0 B／0 条；改前 +130,550 B。
  - 测完删除，剩余 0 行。
- 语句数：有报名的账号 6 条，无报名的 5 条。
- `tests/audits/unbounded-list-reads.test.ts` 通过（ratchet 不变）。

**SC-02 详情**
- (a) `matrix-diff.txt`：mock 51 组 0 差异。
- (b) live 对照（`orbit_test` 随机 schema，固定时钟，26 组）：21 组相同。差异只有两类：
  - 两组只差错误文本；
  - 三组是 phase2 的 W41-2 差异。
- (c) 并跑测试：
  - `tests/services/home-contacts-summary-postgres.test.ts`：25 个 actor 场景，含 35 条联系人、archived 与歧义落在第 30 条之后、非法 version 8 种、关系 version、歧义与非歧义、非 object payload、重复 id；
  - `tests/services/canonical-participant-event-journeys.test.ts` 的 PG 用例：已发布／未发布 × 坏 rsvped／坏 cancelled、草稿、取消、同开始时间排序、他人坏活动；
  - `tests/pages/app-home-ssr-read-narrow.test.ts`：失败映射、无 actor、未配置、解析失败、读取抛错。
  - RED 记录：`red-services.txt`、`red-journeys.txt`、`red-home.txt`。
  - GREEN：`targeted.txt`，296 项通过、0 失败、0 skip，PG 指向 `localhost/orbit_test`，事先跑过 `assert-local-test-databases`。
- (d) 截图 `before/after-agent-1440.jpg`、`before/after-agent-375.jpg`；页面文本逐项相同；`page-read-receipts.txt`。

**SC-03 详情**
- `/app/home/events` 与首页同一 loader，同一对照覆盖；`app-home-live-route-services` 通过。
- 旧活动 SQL 归属：`tests/capabilities/event-owned-records-postgres.test.ts`，逐条、逐序与原 JS 过滤相等。覆盖 userId、accountId 字符串、数字、数组、对象、null、deleted、其他 workspace、两端空白、无 actor 0 查询、内存 store 原路径、configured 注入。
- 以下测试均在 `targeted.txt` 中通过：
  - `app-events-live-route-services`
  - `app-contacts-live-route-services`
  - `event-crud-and-import(-live-store)`
  - `canonical-participant-event-journeys`
  - `app-canonical-agent-personal-scope`
  - `event-registration-status-read`
  - `event-core*`
- `sc03-zero-diff.txt`：联系人页模型、`contact-live-record-provider.ts`、profile、dashboard／活动池、App 端 diff 为空。`listPublishedEvents` 与 `listCanonicalRegistrationsForUser` 的实现未改，只放宽了 journey 依赖的 `Pick` 类型。

**SC-04 详情**
- `app-agent-guide-demo-page.test.tsx` 26 项通过（`guide-demo-after.txt`），既有断言未改。
- 新增一例：示例期 1 次首页读取，计数服务解析 1 次，联系人列表服务的调用栈都不经过 `contacts-route-view-model`。
- 临时还原首页接线时新例 RED（`guide-demo-red-restored-wiring.txt`，5 项失败）。

### SC-05 数据库月预算表（D39 1.6 GB = 1,600 MB，十进制）

人群模型沿用 W0040：真实期 120,000 次／月；示例期 10,000 次／月。

| 行 | 10% 档 | 20% 档 | 100% 档 |
| --- | --- | --- | --- |
| ① 开工时总账（D32，不含首页 SSR） | 1,222.78 MB | 1,282.63 MB | 1,761.38 MB |
| ② 首页 SSR 真实期：2,378 B × 120,000 | 285.36 MB | 285.36 MB | 285.36 MB |
| ③ 示例期：1,450 B × 10,000 | 14.50 MB | 14.50 MB | 14.50 MB |
| **合计·去重口径（① + ②）** | **1,508.14 MB**（余 91.86） | **1,567.99 MB**（余 32.01） | **2,046.74 MB**（超 446.74） |
| **合计·直接相加（① + ② + ③）** | **1,522.64 MB**（余 77.36） | **1,582.49 MB**（余 17.51） | **2,061.24 MB**（超 461.24） |
| ④ 被消除：改前 58,808 B × 120,000 = 7,056.96 MB；24,424 B × 10,000 = 244.24 MB | −6,771.60 MB | −6,771.60 MB | −6,771.60 MB（示例期另 −229.74 MB） |

**判定（W41-1）：**
- 单次 2,378 B，低于硬门槛 3,143 B，SC-01 硬判据通过。
- 也低于目标线 2,644 B（差额 −266 B），属于「达到目标线」。
- 另两条参考上限也低于：20% 档直接相加按同单次 2,441 B；示例期按 1.4 KB 时 2,528 B。
- 100% 档不可达：① 已超 161.38 MB，后续选项是 D39「服务端共享缓存活动目录」。

**⑤ 参考行（不进门槛）**

页面级三项读取，`user_verify_plan` 改后，改前在括号里：

| 读取 | 改后 | 改前 |
| --- | --- | --- |
| canonical id | 0 B／1 条 | 17,613 B／1 条 |
| 报名状态 | 1,429 B／6 条 | 1,429 B／6 条 |
| 社群 | 0 B／1 条 | 0 B／1 条 |

canonical id 那项也读旧活动 provider，所以同样受益于本次的归属下推。

本人数据增长的敏感度：临时 workspace 实际造数据测，`sensitivity-after.jsonl`，账号没有资料。

| 场景 | 单次 | 语句数 | 每场增量 |
| --- | --- | --- | --- |
| 已报名 0 场 | 146 B | 5 | — |
| 已报名 5 场 | 3,736 B | 6 | 约 +718 B |
| 已报名 20 场 | 14,546 B | 6 | 约 +720 B |
| 本人旧活动 5 场 | 13,982 B | 14 | 约 +2.8 KB |

本人旧活动的增量较大，因为它触发活动页模型的逐场读取，旧活动读取在一次请求内发生 2 次，属既有行为。

月度含义：人均多 1 场已报名活动约 +86.4 MB／月，接近 10% 档全部余量（去重 91.86 MB），超过 20% 档余量。

## 已知且接受的差异（W41-2）

1. **与本人无关的坏数据不再拖垮首页。**
   - 某场与本人无关的已发布活动缺 title 时，改前每个有 rawSubject 的首页都会失败（`Published event … is missing title.`），改后正常显示。
   - 别人的坏旧活动行、草稿活动、别人的坏联系人行，改前改后都不读。
   - 证据：live 对照 phase2，以及 journeys PG 用例末段。
2. **本人在已发布活动上的坏报名行：仍然失败，但错误文本变了。**
   - 两边都是普通 `Error`，没有 code。
   - 改前文本是逐字段的，例如 `Canonical event registration row is missing source_registration_id.`；改后是 W0028 状态投影的统一文本 `Canonical event registration row is invalid.`。
   - 失败与否完全一致：已发布活动上的坏 rsvped 和坏 cancelled 都失败；未发布活动上的坏行都不失败。
3. **重复 contact id 并列时取哪一行，改前改后都不确定。**
   - 同一 payload id 有多条联系人、且排序键 `coalesce(occurred_at, updated_at)` 与 `updated_at` 完全相同时，改前由 Map 的「最后一条」决定，顺序本身不确定；改后同样取不确定的一条。
   - 排序键不同的情况已按旧语义复刻（review 修复）。

## 假设与额外阅读

额外阅读（上下文包之外，都是为复刻语义而读的调用链）：
- `contacts-route-view-model.ts`：读了全文中与输入解析相关的部分，确认首页传入的列表输入。
- `features/contacts/live-service.ts` 全段、`service-factory.ts`、`mock-service.ts` 的无筛选路径、`contact-graph-query.ts` 的 `buildPayload`／`toContactListItems`／`includesText`。
- `contact-live-record-provider.ts`：读了全文，只读未改。
- `shared/storage/postgres-live-record-store.ts` 的 `listQuery`／`rowToRecord`：发现原读取**有** `ORDER BY coalesce(occurred_at, updated_at) desc, updated_at desc`，与 PLANNER 事实 5 说的「无 ORDER BY」不符；新 reader 沿用同一 ORDER BY，并跑测试按行序比对。
- `configured-live-record-store.ts`（`customRead` 闸门／去重）、`features/sync/read-budget-gate.ts`。
- `features/contacts/contact-intros-summary-reader.ts`：SQL 复刻有效性的先例。
- `shared/services/module-mode.ts`、`event-operations/storage/postgres-repository.ts`（方法组合）。
- `tests/services/event-registration-status-read.test.ts`：PG 造数夹具。
- `scripts/verify-server.sh`、`verify-session-cookie.ts`。

选择：
- **新增方法与位置：**
  - `EventCoreRepository.listEventsByIds?`：PG 实现在 `core/storage/postgres-repository.ts`。
  - `EventCoreService.listPublishedEventsByIds?`：仓库有按 id 读取时才提供。
  - `EventOperationsRepository.listPublishedCanonicalRegistrationStatusesForUser?`：PG 实现在 `canonical-registration-repository.ts`，join 已发布活动，沿用 `REGISTRATION_ROW_VALID`。
  - 三者都是**可选**方法。内存仓库没有 event core 的「已发布」状态，无法表达这个 join；journey reader 在依赖缺任一新方法时走原两步路径。因此 `memory-repository.ts` 没有改，偏离了 PLANNER 文件表的「同步内存实现」。
- **新文件：**
  - `features/contacts/home-contacts-summary.ts`：计数服务与 `homeContactsSummaryServiceFactory`，capability 与模式和 app 联系人工厂一致，列表服务经同一工厂解析。
  - `features/contacts/storage/home-contacts-summary-postgres-reader.ts`：单条计数 SQL，经 `customRead` 走闸门与去重。
  - `features/events/event-crud-and-import/providers/owned-events-postgres-reader.ts`。
- **首页仍有联系人页模型分支：**首页带 `query`／`source`／`status`／`tag`／`value` 任一搜索参数时，仍走联系人页模型，保证与改前逐项一致。生产调用方都传 `undefined`。
- **计数 SQL 的复刻细节：**
  - `version` 校验用 float8 复刻 `JSON.parse` 后的 `Number.isSafeInteger`；
  - trim 字符集复刻 JS `trim`；
  - 用 `jsonb_each` 复现非 object payload 的同一数据库错误；
  - 报错顺序与页模型一致：联系人 version → 关系 version → 歧义。
- **测试库：**PG 测试用 `ORBIT_EVENT_DATABASE_URL=postgresql://li@localhost:5432/orbit_test`（每次随机 schema，只删自己的）。本机测量用 `node --env-file=.env.local`（开发库 `orbit_newui_events_20260922`，脚本断言 localhost），噪声与敏感度都在临时 workspace 中跑，测完剩余 0 行。
- **GitNexus：**
  - 开工时全量重建 `analyze --index-only --force`（47 s，`gitnexus-rebuild.txt`），重建后名字解析正常。
  - impact 结果（`impact-*.txt`）：

    | 符号 | 结果 |
    | --- | --- |
    | `loadAppHomeRouteViewModel` | 歧义 3 候选，主候选 LOW／4；按 PLANNER 视为 CRITICAL |
    | `readConfiguredCanonicalParticipantEventJourneys` | UNKNOWN，0 调用方；文本复核只有首页与测试（`impact-text-callers.txt`） |
    | `createCanonicalParticipantEventJourneyReader` | LOW |
    | `createStorageEventStoreProvider` | HIGH（5） |
    | `createConfiguredStorageEventStoreProvider` | HIGH（8） |
    | `createEventCoreService` | **CRITICAL**（43） |
    | `createPostgresEventCoreRepository` | **CRITICAL**（24） |
    | `createPostgresCanonicalRegistrationMethods` | **CRITICAL**（45） |

  - 三个 CRITICAL 的 impact 是在动手后补跑的。改动只新增可选方法、不改既有方法；全量对照新增失败 0。
  - detect-changes：功能提交 16 文件、45 符号、risk low（`detect-changes-feature.txt`）。review 修复提交报「diff 触及 2 个文件，但没有已索引符号」，因为新文件不在开工时的索引里（`detect-changes-review-fix.txt`），已以 `git diff --stat` 代替核对。

## review 处理（H 档，Codex `gpt-5.6-sol`，`codex-review.txt`）

| 意见 | 判断 | 处理 |
| --- | --- | --- |
| P2：同一 payload id 有多条联系人时，旧图由 Map「最后一条」的 `lifecycleInitialization` 决定关系 stage 是否覆盖；新 SQL 只要任一条 pending 就不覆盖，`inProgress` 会不同 | 合理 | `365d8375`：用 `distinct on` 按旧列表顺序取最后一条（最旧）作为权威行。加 3 个重复 id 场景，在修复前的 SQL 上 RED（`review-fix-red.txt`），修复后 GREEN |

意见共 1 条，已修复，没有不采纳的意见。

## 交接

- **合并：**分支 `sprint/W0041-home-ssr-read-narrow`，最终功能 SHA `365d8375`（报告在其后单独提交），合并目标 `chat-agent`。
- **合并树建议跑：**`targeted.txt` 的 18 个文件，PG 用例需设 `ORBIT_EVENT_DATABASE_URL` 指向本机 `orbit_test`；再加 `npx tsc --noEmit -p .`。
- **接口：**
  - 首页联系人数：`createHomeContactsSummaryService().readSummary(actorId)`，返回 `{ success, knownPeople, inProgress } | { success: false, error: { code, evidenceIds } }`。
  - 旧活动归属：provider 选项 `ownedEventRecordReader`。
  - 已报名活动：`listPublishedCanonicalRegistrationStatusesForUser` 与 `listPublishedEventsByIds`。
- **大目标 4：**W0045／W0046 改 `contactFromRecord`（加字段）后，如果有效性规则变了，`home-contacts-summary-postgres-reader.ts` 要同步。后跑的一方要重跑 `tests/services/home-contacts-summary-postgres.test.ts` 的并跑比对。
- **W0042（P1）起点：**首页 SSR 已降到 2.4 KB。下一个大头是客户端挂载后的读取（dashboard snapshot、signals 等，不在本门槛内）。
- **后续选项（按收益）：**
  1. 已报名活动只取「未结束 + 近 N 天」（W41-3，需要产品决定；敏感度见 ⑤，人均每多 1 场约 86 MB／月）；
  2. 资料两条读取收窄（W41-5，约 0.3–0.6 KB）；
  3. P3：SSR 与 dashboard 重复读取合并；
  4. 100% 档走 D39 共享缓存。
- **需要用户决定：**无新的阻塞项。W41-3 的显示范围仍待产品决定，不阻塞本 Sprint。
- **回退：**`git revert 365d8375 d5d5ae58`。没有迁移，也没有数据写入。
