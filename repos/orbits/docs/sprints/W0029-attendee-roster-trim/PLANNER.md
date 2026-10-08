# Sprint W0029 — 报名者名单与「谁会来」预览读取瘦身

**Plan revision:** 3（2026-09-29）。revision 1 经 Codex 方案 review（`scratchpad/w0029/codex-plan-review.txt`）修订，并并入用户裁决 D20；逐条处理见末尾「review 处理」。revision 3 按 W0027／W0028／W0030 合并后的 `chat-agent` 刷新占位（基线、行号、复用件、预算实测、impact），SC 语义不变，见文末「修订记录」。**模式:** existing-codebase / single-generator。运行状态以登记表为准。

**原需求:** RV-03、RV-05。来源：D19（W28-1 选 A）、D20、D22（执行顺序 W0028 → W0030 → W0029）。

**单一目标:** 活动详情页有两处读取全场报名，都改成只取所需字段，并且保留这些字段的原始 JSON 类型：
- **报名者名单**（`readRegisteredCatalogueAttendees`）：只取 `status`、`displayName`、`answers.positioning`。
- **匿名预览**（`/api/events/[id]/registration/preview`）：只取 `status`、`answers.industry`、`answers.positioning`。

以下这些都不变：名单与预览的可见结果（含顺序与展示 label）、访问门槛、隐私门槛、损坏数据时的失败语义（D20：W29-3 跟随 W28-4 选 A）。按 W0017 口径实测：名单和预览合计 ≤200 MB/月（D20：W29-1 选 A）；用户路径总账按下文「预算重算」判断是否放宽，放宽后也不超过 1.2 GB。

**易读目标:** [GOAL.md](GOAL.md)。

**基线:** `chat-agent` `4722fcad`（W0027 合并 `2d6bf323`、W0028 合并 `2ef85b1f`、W0030 合并 `1e8c037d` 之后）。文中行号按 `4722fcad` 核对；Generator 开工时用 `git diff 4722fcad HEAD -- <修改白名单>` 复核，有变化以开工时为准并在 REPORT 登记。

**进入条件:**
- W0027、W0028、W0030 都已 completed 并已合并。✔（见登记表运行记录）
- 协调者已刷新所有原标记【合并后刷新】的位置：基线、`registered-catalogue-attendees.ts` 的新行号、W0028 的轻量读取与读取封装名字、W0028 最终的有效性判断条件、W0027／W0028／W0030 REPORT 的实测流量（用于预算重算）、impact 结果。✔（revision 3）
- 本机 `orbit_test` 可用。
- 不需要云端授权，不调用付费 AI。

## 已定决定（D20，2026-09-29）

| 编号 | 决定 |
| --- | --- |
| W29-1 | A：名单＋预览合计 ≤200 MB/月。用户路径总额在重算后确实超过 1.0 GB 时才放宽，最高 1.2 GB（重算见下文） |
| W29-2 | A：匿名预览纳入本 Sprint |
| W29-3 | A（跟随 W28-4 A）：失败语义与旧读取逐项一致，包括解析时抛错、消费时抛错、静默丢弃，三类分别复现。W28-4 的执行方式已定（见「前序交接要点」W0028 偏差 2、3），本 Sprint 照同一做法 |

## 已查清的事实（`4722fcad`；revision 2 在 `a25f93ec` 上逐条核对源码并用 node 实验验证，revision 3 按合并后代码复核行号并补入 W0028 查明的旧读取抛错点）

1. **名单**：`features/events/registered-catalogue-attendees.ts`（53 行）。
   - 第 26–35 行：先用 W0028 的 `readRuntimeEventRegistrationStatus({ eventId, userId: actorId })` 判定本人是否 `rsvped`，不是就返回 null。**只在本人已报名时读名单**；该读取抛错照旧向上抛。
   - 第 37–41 行：`createConfiguredEventOperationsRepository()`，未配置时返回 null；否则调 `listCanonicalRegistrations(eventId)`。名单**只读 canonical**，不看报名窗口；这是现状，保持不变。
   - 第 42–52 行：先筛 `status === "rsvped"`，再对**已报名的行**执行：
     - `participantProfile.displayName?.trim() || "Orbit attendee"`；
     - `participantProfile.answers.positioning?.trim() || null`。
2. **canonical 全场读取**：`features/events/event-operations/storage/canonical-registration-repository.ts`。
   - 方法 `listCanonicalRegistrations`（第 1012–1018 行）→ `listCanonicalRegistrationsWithExecutor`（第 446–456 行）→ `readCanonicalRegistrationInventoryWithExecutor`（第 458–488 行）：`registrationSelect()`（第 410–428 行）＋`REGISTRATION_FROM` 三表 join（第 352–364 行），`where workspace_id = $1 and event_id = $2 order by membership_head.participant_id`。
   - 逐行 `registrationFromRow`（第 328–350 行），任一行解析失败（**包括已取消的行**）就整次抛错 `rows contain invalid data`。
   - 解析失败的条件以 W0028 最终版为准，已写成可复用的 SQL 片段 **`REGISTRATION_ROW_VALID`**（第 366–388 行，注释第 366–373 行），W0028 的 `registrationStatusSelect`（第 390–398 行）以 `... as valid` 返回、`registrationStatusFromRow`（第 400–408 行）在 `valid !== true` 时抛错：
     - `profile_payload` 是对象，且含 `registrationProfile` **键**（缺键时 `clone(undefined)` 抛错，已用 node 验证）；
     - 四个文本列 `event_id`、`actor_id`、`participant_id`、`source_registration_id` 非空串；
     - `registered_at`、`head updated_at` 能解析成合法 JS 日期，`cancelled_at`／`reactivated_at` 为 null 或能解析：判断式是 `jsDateSafeTimestampSql(column)`（`shared/storage/postgres-js-date-sql.ts`），覆盖 ±infinity 与超出 JS 日期范围（约 275760 年，临界值随会话时区变化）两类；
     - status 为 `rsvped`／`cancelled`（也由 CHECK 约束保证）。
   - **`registrationProfile` 为 null 或非对象时，解析不抛错**，会原样放进 `participantProfile`，在消费时才可能抛错（见事实 5）。
   - 同一读取的其他调用方**不改**：`event-operations/service.ts:312` `currentParticipantsFor`（经 `repository.listCanonicalRegistrations`）、`runtime.ts:32–33` 的 `canonicalService.list`（只被预览 handler 经 deadline-gated 选路调用）、`canonical-migration/source-reader.ts:692`（`readCanonicalRegistrationInventoryWithExecutor`）。
3. **预览**：`app/api/events/[id]/registration/preview/handler.ts`（82 行）。默认 `eventRegistrationRuntimeService.list({ eventId })`（第 31–33 行），按 `deadline-gated-service.ts:236–245` 选路：没有 canonical 服务时走 legacy；否则先读 enrollment，`legacy_unenrolled`／`legacy_importing` 走 legacy，其余走 canonical。
   - **legacy**：`service.ts:195–196`（base service `list`）→ `features/events/registration/storage/live-record-provider.ts:227–240` `listRegistrations`。
     - 经 configured store 的读取闸门与去重。
     - SQL 由 `shared/storage/postgres-live-record-store.ts:192–277` `listQuery` 生成：`where workspace_id = $1 and collection_name = 'event_registrations' and lifecycle_state <> 'deleted' and target_type = 'event' and target_id = $eventId`，`order by coalesce(occurred_at, updated_at) desc, updated_at desc`（第 273 行，不带 userId）。
     - 每行先过 `rowToRecord`，再在 JS 里只丢弃 `isStoredEventRegistration`（第 51–65 行）不通过的行、以及 `registration.eventId !== eventId` 的行。**嵌套画像不校验**。
     - **旧读取会整次抛错的行**（W0028 REPORT 偏差 2、3 查明，本次对照 `live-record-provider.ts:67–83` 注释）：`created_at`／`updated_at` 不能解析成合法 JS 日期；`occurred_at`／`deleted_at` 是超出 JS 日期范围的有限值；payload 是 JSON `null`（`isStoredEventRegistration` 访问 `null.registration` 抛错）。payload 是 JSON 字符串时旧读取会 `JSON.parse` 后再判断。W0028 已把这些写成 `LEGACY_ROW_UNREADABLE`（第 77–83 行）、`LEGACY_STORED_REGISTRATION`（第 85–91 行）和带 `issue` 列的返回约定（`LEGACY_STATUS_COLUMNS` 第 92–99 行，JS 端 `legacyStatusRowPayload` 第 147–153 行）。
   - **canonical**：同事实 2。
   - 60 秒缓存：每个 handler 实例、每场活动一份（第 18、47–53、67–79 行）。
4. **预览的聚合规则**：`features/events/registration/cluster-preview.ts:28–61`。
   - 只统计 `status === "rsvped"` 的行。
   - 每行的 label：`answers.industry?.trim()`，为空时退到 `answers.positioning?.split("@")[0]?.trim()`，再为空跳过。
   - 分组键 `label.toLocaleLowerCase("en-US")`。**展示 label 取迭代中第一次出现的原文**，所以行的顺序会影响展示。
   - 桶至少 5 人；按人数降序做稳定排序，同人数按第一次出现的先后；只取前 6 个；人数向下取到 5 的倍数。
5. **消费时的抛错规则**：在 node 下按 JavaScript 语义逐条核对。`?.` 只短路 `null`／`undefined`；对 `false`、`0` 等调用 `.trim()` 仍然抛错。

   | 值 | 名单（只看已报名的行） | 预览（只看 rsvped 的行） |
   | --- | --- | --- |
   | 画像（canonical `registrationProfile`／legacy `participantProfile`）缺失或 null | 抛错（`.displayName`） | 抛错（`.answers`） |
   | 画像是非对象（字符串、数字、布尔、数组） | `.displayName` 得到 undefined → "Orbit attendee"；接着 `.answers.positioning` 抛错 | `.answers` 得到 undefined → `.industry` 抛错 |
   | `displayName` 缺失、null、空串或只有空白 | "Orbit attendee" | 不访问 |
   | `displayName` 是非字符串且非 null（数字、布尔、对象、数组） | 抛错（`.trim`） | 不访问 |
   | `answers` 缺失或 null | 抛错 | 抛错 |
   | `answers` 是非对象非 null（字符串、数字、布尔、数组） | positioning 得到 undefined → role 为 null | industry、positioning 都是 undefined → 该行跳过 |
   | `industry` 缺失、null、空串或只有空白 | 不访问 | 退到 positioning |
   | `industry` 是非字符串且非 null | 不访问 | 抛错（`.trim`） |
   | `positioning` 是非字符串且非 null | 抛错（`.trim`） | 只有退到 positioning 时才抛错（`.split`） |
   | legacy `status` 是 `"rsvped"` 以外的任何值（含非字符串） | — | 该行不统计 |
   | legacy 顶层结构不合格（`isStoredEventRegistration` 不通过），或 `registration.eventId` 与活动不符 | — | 静默丢弃 |
   | legacy 行时间戳不可解析（事实 3），或 payload 为 JSON `null`（不论状态、不论属于哪场活动的 payload） | — | 整次抛错（`rowToRecord`／`isStoredEventRegistration`） |
   | legacy payload 为 JSON 字符串 | — | 按旧逻辑 `JSON.parse` 后同上判断（解析失败则抛错） |
   | 已取消的行，画像怎么坏都行 | 不访问（前提是能通过事实 2 的解析） | 不访问（前提是能通过事实 2／3 的行级解析） |

   `#>>` 会把数字、布尔转成文本。用它取值会把本该抛错的行变成一个正常的桶（review P1-2），**所以禁止用 `#>>` 取这些字段**。
6. **名单的可见用途**：`app/(app)/app/events/events-0918/event-detail.tsx:227–245` 用到完整名单，第 762–764 行只取前 4 个。所以**不能**在 SQL 里截断名单。入口：`orbit-registered-event-route-view-model.ts:35、46`、`canonical-event-detail-view.ts:231`。
7. **影响等级**（`4722fcad`，`analyze --force --index-only` 全量重建后；增量索引这次 FTS 失败，按名查询会错配，必须全量重建）：
   - `readRegisteredCatalogueAttendees`：LOW，影响 4，直接 3，执行流 1（`AppEventDetailPage`）。revision 2 在旧索引上是 CRITICAL；等级下降不改变本 Sprint 的 H 档判断（理由见「最小测试与检查」）。
   - `registrationClusterPreview`：LOW，影响 2，直接 1。`createEventRegistrationPreviewHandler`：LOW，影响 1。
   - `listCanonicalRegistrations`：同名 4 个候选；接口方法（`repository.ts:281`）LOW，影响 6，直接 2；PG 实现（`canonical-registration-repository.ts:1012`）与内存实现（`memory-repository.ts:1130`）为 **UNKNOWN**，已用文本搜索补查：生产调用方只有事实 1、事实 2 列出的三处。
   - `EventOperationsRepository`：HIGH，影响 118，直接 23。`EventRegistrationProvider`：HIGH，影响 91，直接 15。`createEventRegistrationLiveRecordProvider`：HIGH，影响 33，直接 6。
   - `createPostgresCanonicalRegistrationMethods`：**CRITICAL**，影响 42，直接 1。`createMemoryEventOperationsRepository`：**UNKNOWN**（W0028 文本搜索：5 个文件，都经接口类型，由 tsc 覆盖）。
   - `readCanonicalRegistrationInventoryWithExecutor`：LOW，影响 5，直接 2（迁移读取，**不改**）。
   - 复用件 `createGatedDedupedCustomRead`（`ConfiguredPostgresLiveRecordStore.customRead` 的实现）：**CRITICAL**，影响 277；本 Sprint **只调用、不修改**。

## 决定：新增「类型保真的裁剪 DTO」投影，不改现有全场读取

- **投影形状（review P2）**：返回的 DTO 与旧 `EventRegistration` 的**同名路径、同样嵌套**，但只保留要用的叶子：`{ status, participantProfile: <裁剪后的画像> }`。
  - 名单和预览的聚合代码继续读 `registration.participantProfile.answers...`，**聚合规则不变**。
  - 函数的参数类型可以放宽成结构子集。字段访问写法如果有必要改动，要由 SC-02 的「旧完整 DTO 与新投影 DTO 分别计算后深相等」来锁住。
- **裁剪规则（类型保真）**：要让事实 5 表中每一格的结果（抛错、退回、跳过）与旧读取一致。建议在 SQL 里用 `#>`（jsonb）配合 `jsonb_typeof`：
  - **画像**：
    - 对象 → `jsonb_build_object('displayName', <叶子>, 'answers', <answers 规则>)`；预览可以不带 displayName。
    - 缺失或 null → `null`。
    - 其他类型 → 占位 `0`。`0` 与原值在事实 5 的每条访问上行为相同，同时避免把异常大的原值读回来。
  - **answers**：
    - 对象 → `jsonb_build_object('industry', <叶子>, 'positioning', <叶子>)`，名单只要 positioning。
    - 缺失或 null → `null`。
    - 其他类型（含数组）→ 占位 `0`。
  - **叶子**（`displayName`／`industry`／`positioning`）：
    - 字符串 → 原值；
    - 缺失或 null → `null`；
    - 其他类型 → 占位 `0`（会触发与原值相同的 `.trim`／`.split` 抛错）。
  - **legacy status**：SQL 算出 `payload #> '{registration,status}' = '"rsvped"'::jsonb` 这样的布尔值，或者原样取 jsonb，在 JS 里判 `=== "rsvped"`。二者任选，但**不能用 `#>>`**。（W0028 的 `LEGACY_STATUS_COLUMNS` 用 `jsonb_typeof = 'string'` 再 `#>>`，只适用于「只认 `=== "rsvped"`」的比较，结果等价；照搬时须确认非字符串 status 仍判为不统计。）
  - 缺失的键和 null 等价：`jsonb_build_object` 会把 SQL NULL 写成 JSON null。按事实 5，缺失和 null 在每条访问上行为相同。
  - Generator 如果选择改在 JS 里做同样的裁剪，也可以，只要事实 5 的矩阵全部通过。
- **canonical**：`EventOperationsRepository` 新增 `listCanonicalRosterEntries(eventId)`。
  - 保留现有 `REGISTRATION_FROM` 三表 join，按 `participant_id` 排序。
  - 每行带上 **`${REGISTRATION_ROW_VALID} as valid`**（直接复用 W0028 的常量，不另写一份），**覆盖所有行，包括已取消的行**；任一行 `valid !== true` 就整体抛错，对应事实 2。
  - 如果在 SQL 里只返回 rsvped 行来省字节，有效性检查仍要覆盖全部行，例如 `bool_and(valid) over ()` 或单独一条聚合语句。选后者会多一条语句，需要在 REPORT 说明取舍。
  - canonical 读取与现状一致，**不加闸门**（`client.query` 直连，与 W0028 的 `getCanonicalRegistrationStatus` 同样写法）。
  - PG 实现在 `canonical-registration-repository.ts`（与 `listCanonicalRegistrations` 相邻），内存实现在 `memory-repository.ts`（映射 `canonicalRegistrationService.list` 的结果，第 1130–1132 行旁）。
- **legacy**：`EventRegistrationProvider` 新增 `listRegistrationRosterEntries(eventId)`。
  - PG 分支**复用 W0028 已有的 `statusSql: { client, read }` 依赖**（`live-record-provider.ts:34–45`；`read` 即 `ConfiguredPostgresLiveRecordStore.customRead`，与 store 共用闸门与 in-flight 去重，store 写入会驱逐进行中的读取，失败不缓存）。调用形如 `statusSql.read({ collectionName: EVENT_REGISTRATION_COLLECTION, key: JSON.stringify(["listRegistrationRosterEntries", workspaceId, eventId]), read: () => statusSql.client.query(...) })`。不另建去重或闸门，不改 `configured-live-record-store.ts`。
  - SQL **完整复刻**事实 3 的 WHERE 和 ORDER BY（review P1-3）。行级处理照搬 W0028 的做法：
    - `LEGACY_ROW_UNREADABLE` 为真的行照样返回并标 `issue = 'unreadable'`，JS 端抛错（与旧读取整次抛错一致）；
    - payload 为 JSON 字符串的行返回原文（`issue = 'payload:…'`），JS 端按旧逻辑 `JSON.parse` 后走 `isStoredEventRegistration` 与 eventId 判断；
    - 其余行用与 `isStoredEventRegistration` 等价的 `LEGACY_STORED_REGISTRATION` 加 `registration.eventId = $eventId`（`jsonb_typeof` 检查）过滤，只有这些不合格的行才丢弃。
  - 旧 SQL 在排序键完全相同时顺序不确定。可以加 `record_id` 作为最后的决胜键让结果确定，加了就在 REPORT 说明。测试数据不构造完全相同的排序键。
  - 没有 `statusSql` 时（内存 store、测试），复用 `listRegistrations` 再映射，不新增 `limit: "unbounded"`。
- **runtime**：`features/events/registration/runtime.ts` 新增 `listRuntimeEventRosterEntries(eventId)`，选路照搬 deadline-gated 的 `list`，写法参照同文件 W0028 的 `readRuntimeEventRegistrationStatus`（第 167–184 行）：没有 canonical 仓库时走 legacy；否则先读 enrollment，再在 legacy 与 canonical 之间选。
- **切换点**：
  - 名单（`registered-catalogue-attendees.ts:39–41`）改调 `repository.listCanonicalRosterEntries`（仍然只读 canonical，仍在本人 rsvped 判定之后）。
  - 预览 handler 默认的 `listRegistrations`（第 23–25、31–33 行）改为 `listRuntimeEventRosterEntries`；注入点的类型、测试替身同步更新。

## 预算重算（review P1-4；D20；revision 3 用实测值刷新）

口径：1000 人、30 天，W0017 口径的数据库返回字节（每条语句返回行 JSON 字节之和），1.0 GB 按 1,000 MB 计（与 W0021 一致）。从 W0021 的用户路径总账 **884 MB** 出发（计划、周一小结、待确认名片、活动归属、匹配候选五条路径；W0024～W0030 都没有改这五条，活动归属按 W28-2 保持不变）。

下面五条路径在 W0021 的总账里**原本不存在**，彼此互斥，不重复计数：

| # | 路径 | 来源 | 被替代的旧流量（整行，总账外） | 最终上限 | 实测／估算 |
| --- | --- | --- | --- | --- | --- |
| A | 活动页本人报名 | W0024 改按账号 id，W0028 改轻量 | 382.80 MB（W0028 实测改前，每次 12,760 B × 30,000 次） | A＋B ≤30 MB（W28-3） | **实测 10.35 MB**（W0028） |
| B | 详情页本人判定（含 enrollment） | W0027 改按账号 id，W0028 改轻量 | 167.28 MB（W0028 实测改前） | 同上 | **实测 18.30 MB**（W0028；不含 enrollment 为 4.14 MB） |
| C | 详情页账号解析 | W0027 新增（**纯净增**），W0030 改轻量 | 无（W0027 上线时为 119.0 MB） | ≤60 MB（W0027 SC-04） | **实测 25.2 MB**（W0030，单次 420 B × 60,000 次） |
| D | 详情页名单 | 原本就有，W0029 改轻量 | 约 1,556 MB（W0028 ④ 实测：31 人 77,802 B／次 × 20,000 次；6 人为 15,057 B／次） | D＋E ≤200 MB（W29-1） | 编制时估算约 60 MB（约 100 B／行 × 30 行 × 20,000 次），**本 Sprint 实测** |
| E | 匿名预览 | 原本就有，W0029 改轻量 | 最坏约 3,758 MB（legacy：31 人 62,633 B × 60,000 次）；canonical 最坏约 4,682 MB（enrollment 236 B＋名单 77,802 B）；6 人 legacy 12,123 B／次；均不计 60 秒缓存 | 同上 | 编制时估算最坏约 108 MB，**本 Sprint 实测** |

次数假设沿用 revision 2：每人每天打开详情页 2 次（60,000 次／月）；名单只对已报名者读取，按 30 人活动、1/3 的打开者已报名计 20,000 次；预览按每次打开都读、不计缓存计 60,000 次（最坏）。

- **已实测部分：** 884 + 10.35 + 18.30 + 25.2 = **937.85 MB**。留给 D＋E 的「不放宽」余量为 1,000 − 937.85 = **62.15 MB**。
- **按编制时估算：** 937.85 + 60 + 108 ≈ **1,105.85 MB**，超过 1.0 GB、低于 1.2 GB。
- **按上限：** 937.85 + 200 = **1,137.85 MB**，低于 1.2 GB。也就是说，只要 SC-04 的 D＋E ≤200 MB 成立，总账不可能超过 1.2 GB。
- **结论：**
  - 按估算**大概率需要按 D20 放宽到 ≤1.2 GB**（D＋E 要压到 62.15 MB 以内才不需要放宽）。放宽在 D20 批准范围内，不需要新的用户决定；最终由本 Sprint 的 D、E 实测值定。
  - 五条路径被替代的旧流量合计是 GB 级（A、B 两行实测共约 550 MB；D、E 两行约 5.3–6.2 GB 最坏值），真实出站会**大幅下降**。总账数字变大，只是因为统计范围扩大了。
- **口径外（不并入本表，由 W0031 处理）：**
  - W0030 REPORT 的「全站受益表」：账号解析在 `/app/agent`、`/app/contacts`、`/app/tasks`、收件箱轮询等入口的读取（改前约 18.0 GB、改后约 3.8 GB／月，上限不去重的信息项）。这些入口不在 W0021 的 884 MB 口径里，本表不计。
  - D24／W0031：收件箱轮询每 15 秒调 `/api/account/me` 3–4 次、每个页面加载 2 次，账号会话服务读完整图约 1,978 B／次，约 9.5 GB／月。同样不在 884 MB 口径里，由 W0031 单独测量、定上限。
- **收口规则（写进 SC-04）：**
  - 在 W0029 的 REPORT 里用实测值填这张表：A、B 取 W0028 REPORT，C 取 W0030 REPORT，D、E 取本 Sprint 实测。
  - 实测合计 ≤1.0 GB → 不放宽。
  - 实测合计在 1.0 GB 与 1.2 GB 之间 → 按 D20 放宽，并登记给 W0019。
  - 实测合计 >1.2 GB → 本项 failed。

## 上下文包（Generator 从这里起步）

- **必读（行号按 `4722fcad`）：**
  - `features/events/registered-catalogue-attendees.ts`：全文（53 行）。
  - `features/events/event-operations/storage/canonical-registration-repository.ts`：第 25–31、63–103（`clone`／`timestamp`／`text`／`jsonValue`）、328–488（`registrationFromRow`、`REGISTRATION_FROM`、`REGISTRATION_ROW_VALID`、status 读取、`registrationSelect`、全场读取）、1001–1045 行（W0028 的 status 方法与 `listCanonicalRegistrations`，新方法写在这里）。
  - `features/events/event-operations/repository.ts`：第 250–292 行（接口，W0028 的两个 status 方法是写法样例）。
  - `features/events/event-operations/storage/memory-repository.ts`：第 1125–1147 行。
  - `features/events/registration/storage/live-record-provider.ts`：第 1–153 行（`statusSql` 依赖、`isStoredEventRegistration`、`LEGACY_ROW_UNREADABLE`、`LEGACY_STORED_REGISTRATION`、`LEGACY_STATUS_COLUMNS`、`legacyStatusRowPayload`）、第 227–240 行（`listRegistrations`）、第 261–293 行（`listRegistrationStatusesForUser`，`statusSql.read` 的调用样例）、第 355–373 行（配置 provider 接线）。
  - `shared/storage/configured-live-record-store.ts`：第 25–45 行（`customRead` 与 `LiveRecordCustomRead` 契约），只读。
  - `shared/storage/postgres-js-date-sql.ts`：全文（19 行），只读。
  - `shared/storage/postgres-live-record-store.ts`：第 192–277 行（WHERE 与 ORDER BY 原文）。
  - `features/events/registration/service.ts`：第 10–35 行（provider 接口）、125–135 行（内存 provider）、195–196 行（base `list`）。
  - `features/events/registration/deadline-gated-service.ts`：第 236–245 行。
  - `features/events/registration/runtime.ts`：第 1–46 行（接线）、第 162–184 行（`readRuntimeEventRegistrationStatus` 选路样例）。
  - `features/events/registration/cluster-preview.ts`：全文。
  - `app/api/events/[id]/registration/preview/handler.ts`、`route.ts`。
  - `app/(app)/app/orbit-registered-event-route-view-model.ts`、`app/(app)/app/canonical-event-detail-view.ts:225–235`。
  - `app/(app)/app/events/events-0918/event-detail.tsx`：第 227–245、762–764 行（只读）。
- **测试：**
  - `tests/api/event-registration-preview-route.test.ts`
  - `tests/pages/app-registered-event-lifecycle.test.ts`
  - `tests/pages/app-canonical-event-detail-view.test.ts`、`tests/pages/app-event-detail-page.test.tsx`
  - W0027：`tests/pages/app-event-detail-actor-id.test.tsx`（访问控制回归）
  - W0028：`tests/services/event-registration-status-read.test.ts`（PG 夹具、runtime 子进程、四时区对照的写法都可复用）
  - `tests/services/event-registration-batch.test.ts`、`tests/capabilities/event-registration-live.test.ts`
  - `tests/audits/unbounded-list-reads.test.ts`、`tests/storage/configured-live-record-store.test.ts`
- **测量：** 复制 `~/orbit-sprint-evidence/web/sprint-W0028/run-01/measure-w0028-status-bytes.ts`（其 ④ 段就是名单与预览的改前测量）到本 Sprint 证据目录再扩展，不放进仓库。
- **前序交接要点：**
  - W0027：详情页先解析账号 id（`resolveAuthenticatedApiActorFromSession`），解析失败 → `unavailable`；名单只在本人已报名时下发。
  - W0028：`EventRegistrationStatusRecord`（`registration/contract.ts`）；legacy `listRegistrationStatusesForUser`／`getRegistrationStatus`，canonical `listCanonicalRegistrationStatusesForUser`／`getCanonicalRegistrationStatus`，runtime `readRuntimeEventRegistrationStatus`；**`ConfiguredPostgresLiveRecordStore.customRead({ collectionName, key, read })`**（与 store 共用闸门与 in-flight 去重，写入驱逐，失败不缓存）；**`jsDateSafeTimestampSql(column)`**。W28-4 的执行方式：legacy 把旧读取会抛错的行带 `issue` 标记返回、JS 端照旧抛错（偏差 2），超出 JS 日期范围的时间戳按会话时区判断、测试在 4 个时区对照（偏差 3）。W29-3 跟随。
  - W0030：同样以 `{ client, read }` 形式复用 `customRead` 与 `jsDateSafeTimestampSql`，未改 `configured-live-record-store.ts`；本 Sprint 照此，不新增封装。详情页账号解析实测 25.2 MB／月（预算表 C 行）。
  - W0017／W0021：流量口径是每条语句返回行 JSON 字节之和（拦截 `pg.Client.prototype.query`），临时 schema 里测，测完删除。
- **易错边界（都有对应的 SC）：**
  - 不许用 `#>>` 取画像叶子。事实 5 的每一格都要复现（SC-01、SC-02）。
  - legacy 的 WHERE、ORDER BY 一个都不能少；旧读取会整次抛错的行（事实 3）照样抛错（SC-02）。
  - 有效性检查要覆盖已取消的行，但消费逻辑不能访问已取消行的画像（SC-01）。
  - 名单不截断，只读 canonical，只在本人已报名时读取（SC-01、SC-03）。
  - 预览只输出聚合结果，60 秒缓存不变（SC-02）。
  - legacy 读取经 `customRead` 先过闸门、再去重；不另造封装（SC-03）。
  - 不改迁移读取、`currentParticipantsFor`、`configured-live-record-store.ts`（SC-05 回归）。
  - 不新增 `limit: "unbounded"`（SC-05 审计棘轮）。

## 范围与文件

- **修改：**
  - `features/events/event-operations/repository.ts`
  - `features/events/event-operations/storage/canonical-registration-repository.ts`
  - `features/events/event-operations/storage/memory-repository.ts`
  - `features/events/registration/service.ts`
  - `features/events/registration/storage/live-record-provider.ts`
  - `features/events/registration/runtime.ts`
  - `features/events/registered-catalogue-attendees.ts`
  - `features/events/registration/cluster-preview.ts`（只放宽参数类型，必要时调整字段访问；聚合规则不变）
  - `app/api/events/[id]/registration/preview/handler.ts`
  - 对应的测试，以及 tsc 报错涉及的测试替身
- **新建：** `tests/services/event-roster-entries.test.ts`（SQL 形状、PG 等价矩阵、失败矩阵、排序与 label）。
- **排除：** 页面组件与可见行为；运营侧读取、通知、迁移读取；名单截断；`shared/storage/configured-live-record-store.ts`；数据库迁移与索引；部署。

## 验收契约（五项）

| SC | 可观察行为 | 必需证据 |
| --- | --- | --- |
| SC-W0029-01 | **名单等价，含失败语义**。本机 PG 造 canonical 数据，对比改前与改后 `readRegisteredCatalogueAttendees` 的结果：<br>(a) **正常情况**：rsvped、cancelled、`displayName` 缺失／null／空白、`positioning` 有首尾空白或缺失。`attendees` 深相等，**顺序相同**。<br>(b) **解析时抛错**：已取消的行和 rsvped 的行各造一次：缺 `registrationProfile` 键、文本列为空串、时间列为 infinity（及事实 2 所列其他不能解析成 JS 日期的值）。新旧**都** reject。<br>(c) **消费时抛错，或不抛错**：按事实 5 名单列逐格造数据，放在 rsvped 行上时新旧的结果（reject 或具体值）一致；同样的坏画像放在已取消的行上时新旧都不 reject，除非同时命中了 (b)。<br>(d) **SQL 形状**：不返回整个 `profile_payload`，不使用 `#>>` 取画像叶子。 | 新测试先 RED 后 GREEN；0 skip |
| SC-W0029-02 | **预览等价，含聚合规则**：<br>(a) 对 legacy 和 canonical 两条路径，把旧完整 DTO 与新投影 DTO 分别交给 `registrationClusterPreview` 计算，结果深相等（review P2）。<br>(b) **聚合情况**：同一行业 ≥5 人与 <5 人；同一行业的大小写与原文不同（「SaaS」「saas」「SAAS」），并验证展示 label 取第一次出现的原文；人数相同的桶的先后顺序；超过 6 个桶时的截断；没有 industry 时退到 positioning 的 `@` 前段；cancelled 行。<br>(c) **失败矩阵**：按事实 5 预览列逐格造数据（包括数字、布尔类型的 industry／positioning，非对象的 answers），两条路径上新旧结果一致：reject、跳过或计入。legacy 结构不合格的行、`registration.eventId` 不符的行静默丢弃。<br>(d) **legacy 顺序**：新旧返回的行序列相同（WHERE、ORDER BY 完整复刻）。<br>(e) `tests/api/event-registration-preview-route.test.ts` 全部通过（不含个人数据、404、准入标记、60 秒缓存）。 | 新测试 + 现有测试 |
| SC-W0029-03 | **门槛、闸门与失败的外在表现**：<br>- 本人未报名时，名单读取 0 次。<br>- 名单读取 reject 时，详情页经现有 try/catch 显示 `unavailable`。<br>- 预览读取 reject 时，接口的表现与改前相同。<br>- legacy 投影每次调用都先过闸门；闸门关闭时 SQL 调用 0 次；并发的相同调用只发 1 条 SQL；失败后重新发起。<br>- canonical 读取不加闸门，与现状一致。<br>- W0027 的访问控制回归测试、W0028 的页面测试通过。 | 替身测试 + 现有测试 |
| SC-W0029-04 | **流量与总账**：<br>- 按 W0017 口径出改前与改后的对照表（语句数、行数、字节）：① 名单 5／30／100 人；② 预览 legacy 与 canonical 各 5／30／100 人。<br>- 语句数不变；如果额外加了有效性聚合语句，另列一行说明。<br>- 按事实与「预算重算」的假设估算：D＋E ≤200 MB／月。<br>- 用实测值填「预算重算」表，得出总账结论：≤1.0 GB 不放宽；1.0–1.2 GB 按 D20 放宽并登记给 W0019；>1.2 GB 本项 failed。 | 测量输出 + REPORT 两张表 |
| SC-W0029-05 | **回归**：<br>- 定向集通过：`app-canonical-event-detail-view`、`app-event-detail-page`、`app-registered-event-lifecycle`、`event-registration-preview-route`、`unbounded-list-reads`、`configured-live-record-store`，以及 W0027、W0028 的测试。<br>- tsc 通过。<br>- 3001 浏览器：verify-plan 看已报名活动的名单（与改前截图一致），verify-legacy 看未报名活动的预览卡片；桌面 1440 与手机 375 各一次，控制台 0 错误。<br>- 一次全量基线对照，没有新增失败。 | 测试输出、tsc、截图、RULES §5.2 |

## 一次 Generator 的执行顺序

1. 复核进入条件（W0027、W0028、W0030 已合并；revision 3 已刷新全部占位）。保存基线与 Planner 哈希，`git diff 4722fcad HEAD -- <修改白名单>` 核对行号；刷新索引（增量索引 FTS 失败时用 `analyze --force --index-only`），逐个符号跑 upstream impact，UNKNOWN 用文本搜索补查。
2. 用测量脚本记下改前数据。先写一个「旧行为探针」测试，把事实 5 的矩阵在旧代码上跑一遍并固化期望值。如果发现与事实 5 不一致，以旧代码的实际行为为准，并在 REPORT 登记。
3. 写 RED（SC-01～03），再做最小实现：投影 → 两个接口与实现 → runtime → 两个切换点 → 更新替身。
4. 跑定向集与 tsc，实测改后数据，重算总账；对两条 SQL 跑 EXPLAIN。
5. 浏览器验证 → 暂存区 `detect-changes` → 按路径提交 → 全量对照 → 一次 Codex 代码 review（重点：隐私、失败语义、顺序）→ 由同一 Generator 修复 → 写 REPORT 并交接。`next-env.d.ts` 按协调者指令不还原、不提交。

## 最小测试与检查

- **档位：H。** 理由：新增 SQL，扩展两个 HIGH 级共享接口（`EventOperationsRepository` 影响 118、`EventRegistrationProvider` 影响 91）并改 CRITICAL 的 `createPostgresCanonicalRegistrationMethods`；涉及个人信息下发与匿名隐私聚合；经共享闸门与去重（CRITICAL 复用件）。
- **定向测试：** 新测试加 SC-05 列出的文件。跑 PG 测试前先 export `ORBIT_EVENT_DATABASE_URL`（指向本机 `orbit_test`），并跑 `node scripts/assert-local-test-databases.mjs`；**不要 source `.env`**。
- **收口：** tsc、一次全量对照、一次 Codex 代码 review。
- **不运行：** 付费 AI、Preview、生产库。

## 失败与交接

REPORT 需要写：
- 投影与切换点；
- 裁剪规则的最终实现；
- 「旧行为探针」结果，以及与事实 5 的差异；
- 等价矩阵与失败矩阵的覆盖情况；
- 两张表：流量对照、总账重算；
- 总账是否放宽，以及放宽的依据；
- 仍然整读整行的地方。

交接：分支 `sprint/W0029-attendee-roster-trim`，固定最终 SHA，目标合并到 `chat-agent`。给 W0019 补上：总账额度（是否放宽到 ≤1.2 GB），以及上线后在 Neon 上要对照的名单与预览读取。给 W0031：本 Sprint 合并 SHA（W0031 的进入条件）。

回退：revert 本 Sprint 的提交即可。接口都是新增的，不影响旧的消费者。

## 开放问题

无。W29-1～W29-3 已由 D20 决定。

## 观察项

- 运营侧的 `currentParticipantsFor`、通知 handler 的 canonical 列表、迁移时的来源读取，仍然读整行，本 Sprint 不处理。
- 收件箱轮询与 `/api/account/me` 的账号会话服务读取不在本 Sprint 的总账口径里，由 W0031 处理（D24）。

## review 处理

| review 意见（`codex-plan-review.txt`） | 处理 |
| --- | --- |
| P1-1 canonical 损坏语义不准（review 认为 `registrationFromRow` 只校验 `profile_payload` 是对象，缺 `registrationProfile` 的已取消行不会导致失败） | **部分接受**。<br>- 用 node 验证：缺 `registrationProfile` **键**时 `clone(undefined)` 会抛错，所以已取消行缺这个键**也会**让整场读取失败（`invalidCount > 0`）。这一点 review 的判断不成立，事实 2 保留并注明验证过。<br>- review 指出的「消费时才抛错」成立：`registrationProfile` 为 null 或非对象、`answers` 与各叶子类型异常，都在已报名行被消费时才抛错；已取消行不访问。据此新增事实 5 的逐格矩阵，按名单、预览两个消费者分列。<br>- 解析失败条件补上 infinity 时间戳（node 验证）；非法 status 与非对象 `profile_payload` 由 CHECK 约束排除。<br>- SC-01 拆成 (b) 解析时抛错、(c) 消费时抛错、已取消行不访问三类，SC-02 (c) 同理。<br>- 交叉核对后回改 W0028：出 revision 3，补上 infinity 时间戳，写明 null 画像不抛错 |
| P1-2 legacy 的「损坏行静默丢弃」说得过宽；`#>>` 会把数字转成文本 | **接受**。事实 3 写明只有 `isStoredEventRegistration` 不通过或 eventId 不符的行才静默丢弃；嵌套画像按事实 5 复现旧结果（含 `.trim`／`.split` 抛错）；决定一节禁止用 `#>>` 取叶子，改为类型保真裁剪；SC-02 (c) 把这些格子加进 legacy PG 等价测试 |
| P1-3 legacy 顺序没有锁定 | **接受**。事实 3 抄录 WHERE 与 ORDER BY 原文，决定一节要求完整复刻（可加 `record_id` 作为最后的决胜键，并说明）；SC-02 (b)(d) 增加人数相同的桶、超过 6 个桶、大小写合并后的 label 选择，以及行序列相同的深相等测试 |
| P1-4 预算重复累计 | **接受**。新增「预算重算」一节：从 884 MB 出发，按 A～E 五条互斥路径分列「被替代的旧流量」与「最终上限／估算」。SC-04 要求用实测值重算，并按 ≤1.0／1.0–1.2／>1.2 GB 三档给出结论（revision 3 已用 A、B、C 实测值刷新） |
| P2 「`registrationClusterPreview` 一行不改」与新入参矛盾 | **接受**。改为「聚合规则不变」；投影保留同名嵌套路径，尽量不改访问逻辑；SC-02 (a) 要求旧完整 DTO 与新投影 DTO 分别计算后深相等 |
| D20（用户裁决 W29-1、W29-2、W29-3 均选 A） | 并入「已定决定」表；开放问题清空；上限与总账规则写进 SC-04 |

## 修订记录

- revision 1（2026-09-29）：初版。
- revision 2（2026-09-29）：按 Codex 方案 review 修订（见上表），并入 D20。
- revision 3（2026-09-29）：按 W0027（`2d6bf323`）、W0028（`2ef85b1f`）、W0030（`1e8c037d`）合并后的 `chat-agent` `4722fcad` 刷新占位：基线与全部行号；事实 2 改为引用 W0028 的 `REGISTRATION_ROW_VALID`（时间戳判断扩到超出 JS 日期范围）；事实 3／事实 5 补入 W0028 查明的 legacy 行级抛错（时间戳、JSON null／字符串 payload）；legacy 投影改为复用 `statusSql`（`customRead`）与 W0028 的 `issue` 约定，canonical 复用 `REGISTRATION_ROW_VALID`；预算表 A／B／C 用 W0028、W0030 实测值（10.35／18.30／25.2 MB），D／E 用 W0028 ④ 改前实测，重算结论为「估算约 1,106 MB，大概率按 D20 放宽到 ≤1.2 GB；D＋E ≤62.15 MB 时不放宽；上限情形 1,138 MB」；注明 W0030 全站受益表与 W0031 收件箱轮询不在 884 MB 口径内；impact 按 `4722fcad` 全量重建索引重跑。SC 语义不变（SC-01 (b) 只把「infinity」补注为「及事实 2 所列其他不能解析成 JS 日期的值」，与 W29-3 同义）。旧文件 sha256 `c2445ca8a91a578a994e9140a6d9279dffcd911125aa371da0c58dd6a384d4cc`。
