# Sprint W0029 — 报名者名单与「谁会来」预览读取瘦身

**Plan revision:** 2（2026-09-29）。revision 1 经 Codex 方案 review（`scratchpad/w0029/codex-plan-review.txt`）修订，并并入用户裁决 D20；逐条处理见末尾「review 处理」。**模式:** existing-codebase / single-generator。运行状态以登记表为准。

**原需求:** RV-03、RV-05。来源：D19（W28-1 选 A）、D20。

**单一目标:** 活动详情页有两处读取全场报名，都改成只取所需字段，并且保留这些字段的原始 JSON 类型：
- **报名者名单**（`readRegisteredCatalogueAttendees`）：只取 `status`、`displayName`、`answers.positioning`。
- **匿名预览**（`/api/events/[id]/registration/preview`）：只取 `status`、`answers.industry`、`answers.positioning`。

以下这些都不变：名单与预览的可见结果（含顺序与展示 label）、访问门槛、隐私门槛、损坏数据时的失败语义（D20：W29-3 跟随 W28-4 选 A）。按 W0017 口径实测：名单和预览合计 ≤200 MB/月（D20：W29-1 选 A）；用户路径总账按下文「预算重算」判断是否放宽，放宽后也不超过 1.2 GB。

**易读目标:** [GOAL.md](GOAL.md)。

**基线:** 【W0028 合并后刷新】开工前由协调者改为 W0028 合并进 `chat-agent` 后的 SHA。文中行号按编制时的 `chat-agent` `a25f93ec` 核对。

**进入条件:**
- W0027、W0028 都已 completed 并已合并。
- 协调者已刷新所有标记【W0027／W0028 合并后刷新】的位置：基线、`registered-catalogue-attendees.ts` 的新行号、W0028 的轻量读取与读取封装名字、W0028 最终的有效性判断条件、W0027 与 W0028 REPORT 的实测流量（用于预算重算）、impact 结果。
- 本机 `orbit_test` 可用。
- 不需要云端授权，不调用付费 AI。

## 已定决定（D20，2026-09-29）

| 编号 | 决定 |
| --- | --- |
| W29-1 | A：名单＋预览合计 ≤200 MB/月。用户路径总额在重算后确实超过 1.0 GB 时才放宽，最高 1.2 GB（重算见下文） |
| W29-2 | A：匿名预览纳入本 Sprint |
| W29-3 | A（跟随 W28-4 A）：失败语义与旧读取逐项一致，包括解析时抛错、消费时抛错、静默丢弃，三类分别复现 |

## 已查清的事实（`a25f93ec`；review 后逐条核对源码，并用 node 实验验证）

1. **名单**：`features/events/registered-catalogue-attendees.ts`，【W0028 合并后刷新】第 35–50 行。
   - 调 `listCanonicalRegistrations(eventId)`。名单**只读 canonical**，不看报名窗口；这是现状，保持不变。
   - 先筛 `status === "rsvped"`，再对**已报名的行**执行：
     - `participantProfile.displayName?.trim() || "Orbit attendee"`；
     - `participantProfile.answers.positioning?.trim() || null`。
   - 只在本人已报名时调用。
2. **canonical 全场读取**：`canonical-registration-repository.ts:394–437`。
   - 用三表 join 读出全场行，按 `participant_id` 排序。
   - 逐行 `registrationFromRow`，任一行解析失败（**包括已取消的行**）就整次抛错 `rows contain invalid data`。
   - 解析失败的条件就是 W0028 PLANNER revision 3 事实 4 列出的那组，【W0028 合并后刷新】以它最终版为准：
     - 缺 `registrationProfile` 键：`clone(undefined)` 抛错，已用 node 验证；
     - 四个文本列有空串；
     - 四个时间列出现 `'infinity'`／`'-infinity'`：postgres-date 解析成 `Infinity`，`timestamp()` 抛错，已验证；
     - 非法 status、非对象 `profile_payload`：这两种由 CHECK 约束排除。
   - **`registrationProfile` 为 null 或非对象时，解析不抛错**，会原样放进 `participantProfile`，在消费时才可能抛错（见下表）。
3. **预览**：`app/api/events/[id]/registration/preview/handler.ts`。默认 `eventRegistrationRuntimeService.list({ eventId })`，按 `deadline-gated-service.ts:236–245` 选路：
   - **legacy**：`service.ts:160–162` → `live-record-provider.ts:115–129`。
     - 经 store 的读取闸门与去重。
     - SQL 是 `where workspace_id = $1 and collection_name = 'event_registrations' and lifecycle_state <> 'deleted' and target_type = 'event' and target_id = $eventId`，`order by coalesce(occurred_at, updated_at) desc, updated_at desc`（`postgres-live-record-store.ts:192–277`，不带 userId）。
     - 然后在 JS 里只丢弃 `isStoredEventRegistration` 不通过的行、以及 `registration.eventId !== eventId` 的行。**嵌套画像不校验**。
   - **canonical**：同事实 2。
   - 60 秒缓存：每个 handler 实例、每场活动一份（第 18、47–52、67–78 行）。
4. **预览的聚合规则**：`features/events/registration/cluster-preview.ts:28–63`。
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
   | 已取消的行，画像怎么坏都行 | 不访问（前提是能通过事实 2 的解析） | 不访问 |

   `#>>` 会把数字、布尔转成文本。用它取值会把本该抛错的行变成一个正常的桶（review P1-2），**所以禁止用 `#>>` 取这些字段**。
6. **名单的可见用途**：`event-detail.tsx:215–245` 用到完整名单，第 764 行只取前 4 个。所以**不能**在 SQL 里截断名单。
7. **影响等级**（`1d41bdf`，【刷新】）：
   - `listCanonicalRegistrations`：CRITICAL，存在歧义。
   - `registrationClusterPreview`：CRITICAL，直接调用 2 处。
   - `readRegisteredCatalogueAttendees`：CRITICAL，直接调用 3 处。
   - `eventRegistrationRuntimeService.list` 的另一个消费者是 `event-operations/service.ts:312`，**不改**。
   - `readCanonicalRegistrationInventoryWithExecutor` 的迁移调用方在 `canonical-migration/source-reader.ts:692`，**不改**。

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
  - **legacy status**：SQL 算出 `payload #> '{registration,status}' = '"rsvped"'::jsonb` 这样的布尔值，或者原样取 jsonb，在 JS 里判 `=== "rsvped"`。二者任选，但**不能用 `#>>`**。
  - 缺失的键和 null 等价：`jsonb_build_object` 会把 SQL NULL 写成 JSON null。按事实 5，缺失和 null 在每条访问上行为相同。
  - Generator 如果选择改在 JS 里做同样的裁剪，也可以，只要事实 5 的矩阵全部通过。
- **canonical**：`EventOperationsRepository` 新增 `listCanonicalRosterEntries(eventId)`。
  - 保留现有三表 join，按 `participant_id` 排序。
  - 每行带上与 W0028 相同的有效性布尔值【W0028 合并后刷新：直接复用那段 SQL 片段】，**覆盖所有行，包括已取消的行**；任一行无效就整体抛错，对应事实 2。
  - 如果在 SQL 里只返回 rsvped 行来省字节，有效性检查仍要覆盖全部行，例如 `bool_and(valid) over ()` 或单独一条聚合语句。选后者会多一条语句，需要在 REPORT 说明取舍。
  - PG 实现在 `canonical-registration-repository.ts`，内存实现在 `memory-repository.ts`（映射现有结果）。
- **legacy**：`EventRegistrationProvider` 新增 `listRegistrationRosterEntries(eventId)`。
  - PG 分支经过 W0028 的读取封装【刷新】：每次逻辑调用先过闸门，然后做 in-flight 去重。
  - SQL **完整复刻**事实 3 的 WHERE 和 ORDER BY（review P1-3），再加上与 `isStoredEventRegistration` 等价的结构条件，以及 `registration.eventId = $eventId`（`jsonb_typeof` 检查）。只有这些不合格的行才丢弃。
  - 旧 SQL 在排序键完全相同时顺序不确定。可以加 `record_id` 作为最后的决胜键让结果确定，加了就在 REPORT 说明。测试数据不构造完全相同的排序键。
  - 没有 SQL client 时，复用 `listRegistrations` 再映射，不新增 `limit: "unbounded"`。
- **runtime**：新增 `listRuntimeEventRosterEntries(eventId)`，选路照搬 deadline-gated 的 `list`：没有 canonical 服务时走 legacy；否则先读 enrollment，再在 legacy 与 canonical 之间选。
- **切换点**：
  - 名单改调 `repository.listCanonicalRosterEntries`（仍然只读 canonical）。
  - 预览 handler 默认的 `listRegistrations` 改为 `listRuntimeEventRosterEntries`；注入点的类型、测试替身同步更新。

## 预算重算（review P1-4；D20）

口径：1000 人、30 天，W0017 口径的数据库返回字节。从 W0021 的用户路径总账 884 MB 出发（计划、周一小结、待确认名片、活动归属、匹配候选五条路径；W0024～W0029 都没有改这五条，活动归属按 W28-2 保持不变）。

下面五条路径在 W0021 的总账里**原本不存在**，彼此互斥，不重复计数：

| # | 路径 | 来源 | 被替代的旧流量（整行，总账外） | 最终上限 | 编制时估算 |
| --- | --- | --- | --- | --- | --- |
| A | 活动页本人报名 | W0024 改按账号 id，W0028 改轻量 | W0024 之后约 311–383 MB（假设全部用户账号 id ≠ 会话 id） | A＋B ≤30 MB（W28-3） | 约 13.5 MB（约 450 B × 30,000 次） |
| B | 详情页本人报名 | W0027 改按账号 id，W0028 改轻量 | 约 150 MB（2.5 KB × 60,000 次） | 同上 | 约 5.4 MB（约 90 B × 60,000 次） |
| C | 详情页账号解析 | W0027 新增（**纯净增**） | 无 | ≤60 MB（W0027 SC-04） | 等 W0027 实测【刷新】 |
| D | 详情页名单 | 原本就有，W0029 改轻量 | 约 1.5 GB（2 万次 × 75 KB，假设 30 人活动、1/3 的打开者已报名） | D＋E ≤200 MB（W29-1） | 约 60 MB |
| E | 匿名预览 | 原本就有，W0029 改轻量 | 最坏约 4.5 GB（6 万次 × 75 KB，不计缓存） | 同上 | 最坏约 108 MB |

- **按上限汇总：** 884 + 30 + 60 + 200 = **1,174 MB**。超过 1.0 GB，未超过 1.2 GB。
- **按编制时估算汇总：** 884 + 19 + C + 168 ≈ **1,071 MB + C**。即使 C 为 0，也超过 1.0 GB。
- **与 revision 1 的差别：** revision 1 写的「剩约 26 MB」是用 1.0 GB 减掉 A＋B 与 C 的上限，再把 D、E 当作净增量来算的。实际上 D、E 是原本就有、只是没记进总账的流量。本表把每条路径的旧流量和最终流量分开列。
- **结论：**
  - 总账额度需要放宽，因为 A～E 五条路径第一次被记进总账。放宽到 **≤1.2 GB** 即可，在 D20 批准的范围内。
  - 这 五 条路径被替代的旧流量合计是 GB 级（仅 B、D、E 三条就约 6 GB 最坏值），所以真实出站会**大幅下降**。总账数字变大，只是因为统计范围扩大了。
- **收口规则（写进 SC-04）：**
  - 在 W0029 的 REPORT 里用实测值填这张表：A、B 取 W0028 REPORT，C 取 W0027 REPORT，D、E 取本 Sprint 实测【刷新】。
  - 实测合计 ≤1.0 GB → 不放宽。
  - 实测合计在 1.0 GB 与 1.2 GB 之间 → 按 D20 放宽，并登记给 W0019。
  - 实测合计 >1.2 GB → 本项 failed。

## 上下文包（Generator 从这里起步）

- **必读：**
  - `features/events/registered-catalogue-attendees.ts`【刷新】
  - `canonical-registration-repository.ts`：第 30–40、59–99、324–376、394–437、945–956 行，以及 W0028 新增的有效性片段【刷新】
  - `repository.ts`：第 270–285 行
  - `memory-repository.ts`：第 1120–1133 行
  - `live-record-provider.ts`：第 31–45、115–129 行，以及 W0028 的读取封装【刷新】
  - `shared/storage/postgres-live-record-store.ts`：第 192–277 行（WHERE 与 ORDER BY 原文）
  - `service.ts`：第 9–25、155–162 行
  - `deadline-gated-service.ts`：第 236–245 行
  - `runtime.ts`【刷新】
  - `cluster-preview.ts`：全文
  - `app/api/events/[id]/registration/preview/handler.ts`、`route.ts`
  - `orbit-registered-event-route-view-model.ts`
  - `event-detail.tsx`：第 215–245、764 行（只读）
  - W0027、W0028 REPORT 的流量表【刷新】
- **测试：**
  - `tests/api/event-registration-preview-route.test.ts`
  - `tests/pages/app-registered-event-lifecycle.test.ts`
  - `tests/pages/app-canonical-event-detail-view.test.ts`
  - W0027、W0028 新建的测试【刷新】
  - `tests/services/event-registration-batch.test.ts`
- **测量：** W0028 证据目录里的脚本【刷新路径】，复制后扩展。
- **易错边界（都有对应的 SC）：**
  - 不许用 `#>>` 取画像叶子。事实 5 的每一格都要复现。
  - legacy 的 WHERE、ORDER BY 一个都不能少。
  - 有效性检查要覆盖已取消的行，但消费逻辑不能访问已取消行的画像。
  - 名单不截断，只读 canonical，只在本人已报名时读取。
  - 预览只输出聚合结果，60 秒缓存不变。
  - legacy 读取要先过闸门、再去重。
  - 不改迁移读取、`currentParticipantsFor`。
  - 不新增 `limit: "unbounded"`。

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
- **排除：** 页面组件与可见行为；运营侧读取、通知、迁移读取；名单截断；数据库迁移与索引；部署。

## 验收契约（五项）

| SC | 可观察行为 | 必需证据 |
| --- | --- | --- |
| SC-W0029-01 | **名单等价，含失败语义**。本机 PG 造 canonical 数据，对比改前与改后 `readRegisteredCatalogueAttendees` 的结果：<br>(a) **正常情况**：rsvped、cancelled、`displayName` 缺失／null／空白、`positioning` 有首尾空白或缺失。`attendees` 深相等，**顺序相同**。<br>(b) **解析时抛错**：已取消的行和 rsvped 的行各造一次：缺 `registrationProfile` 键、文本列为空串、时间列为 infinity。新旧**都** reject。<br>(c) **消费时抛错，或不抛错**：按事实 5 名单列逐格造数据，放在 rsvped 行上时新旧的结果（reject 或具体值）一致；同样的坏画像放在已取消的行上时新旧都不 reject，除非同时命中了 (b)。<br>(d) **SQL 形状**：不返回整个 `profile_payload`，不使用 `#>>` 取画像叶子。 | 新测试先 RED 后 GREEN；0 skip |
| SC-W0029-02 | **预览等价，含聚合规则**：<br>(a) 对 legacy 和 canonical 两条路径，把旧完整 DTO 与新投影 DTO 分别交给 `registrationClusterPreview` 计算，结果深相等（review P2）。<br>(b) **聚合情况**：同一行业 ≥5 人与 <5 人；同一行业的大小写与原文不同（「SaaS」「saas」「SAAS」），并验证展示 label 取第一次出现的原文；人数相同的桶的先后顺序；超过 6 个桶时的截断；没有 industry 时退到 positioning 的 `@` 前段；cancelled 行。<br>(c) **失败矩阵**：按事实 5 预览列逐格造数据（包括数字、布尔类型的 industry／positioning，非对象的 answers），两条路径上新旧结果一致：reject、跳过或计入。legacy 结构不合格的行、`registration.eventId` 不符的行静默丢弃。<br>(d) **legacy 顺序**：新旧返回的行序列相同（WHERE、ORDER BY 完整复刻）。<br>(e) `tests/api/event-registration-preview-route.test.ts` 全部通过（不含个人数据、404、准入标记、60 秒缓存）。 | 新测试 + 现有测试 |
| SC-W0029-03 | **门槛、闸门与失败的外在表现**：<br>- 本人未报名时，名单读取 0 次。<br>- 名单读取 reject 时，详情页经现有 try/catch 显示 `unavailable`。<br>- 预览读取 reject 时，接口的表现与改前相同。<br>- legacy 投影每次调用都先过闸门；闸门关闭时 SQL 调用 0 次；并发的相同调用只发 1 条 SQL；失败后重新发起。<br>- canonical 读取不加闸门，与现状一致。<br>- W0027 的访问控制回归测试、W0028 的页面测试通过。 | 替身测试 + 现有测试 |
| SC-W0029-04 | **流量与总账**：<br>- 按 W0017 口径出改前与改后的对照表（语句数、行数、字节）：① 名单 5／30／100 人；② 预览 legacy 与 canonical 各 5／30／100 人。<br>- 语句数不变；如果额外加了有效性聚合语句，另列一行说明。<br>- 按事实与「预算重算」的假设估算：D＋E ≤200 MB／月。<br>- 用实测值填「预算重算」表，得出总账结论：≤1.0 GB 不放宽；1.0–1.2 GB 按 D20 放宽并登记给 W0019；>1.2 GB 本项 failed。 | 测量输出 + REPORT 两张表 |
| SC-W0029-05 | **回归**：<br>- 定向集通过：`app-canonical-event-detail-view`、`app-event-detail-page`、`app-registered-event-lifecycle`、`event-registration-preview-route`、`unbounded-list-reads`、`configured-live-record-store`，以及 W0027、W0028 的测试。<br>- tsc 通过。<br>- 3001 浏览器：verify-plan 看已报名活动的名单（与改前截图一致），verify-legacy 看未报名活动的预览卡片；桌面 1440 与手机 375 各一次，控制台 0 错误。<br>- 一次全量基线对照，没有新增失败。 | 测试输出、tsc、截图、RULES §5.2 |

## 一次 Generator 的执行顺序

1. 复核进入条件：W0027、W0028 已合并，所有【刷新】位置已由协调者更新。保存基线与 Planner 哈希，刷新索引，逐个符号跑 upstream impact。
2. 用测量脚本记下改前数据。先写一个「旧行为探针」测试，把事实 5 的矩阵在旧代码上跑一遍并固化期望值。如果发现与事实 5 不一致，以旧代码的实际行为为准，并在 REPORT 登记。
3. 写 RED（SC-01～03），再做最小实现：投影 → 两个接口与实现 → runtime → 两个切换点 → 更新替身。
4. 跑定向集与 tsc，实测改后数据，重算总账；对两条 SQL 跑 EXPLAIN。
5. 浏览器验证 → 暂存区 `detect-changes` → 按路径提交 → 全量对照 → 一次 Codex 代码 review（重点：隐私、失败语义、顺序）→ 由同一 Generator 修复 → 写 REPORT 并交接。

## 最小测试与检查

- **档位：H。** 理由：新增 SQL，扩展两个 CRITICAL 共享接口；涉及个人信息下发与匿名隐私聚合；触及读取闸门与去重。
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

交接：分支 `sprint/W0029-attendee-roster-trim`，固定最终 SHA，目标合并到 `chat-agent`。给 W0019 补上：总账额度（是否放宽到 ≤1.2 GB），以及上线后在 Neon 上要对照的名单与预览读取。

回退：revert 本 Sprint 的提交即可。接口都是新增的，不影响旧的消费者。

## 开放问题

无。W29-1～W29-3 已由 D20 决定。

## 观察项

- 运营侧的 `currentParticipantsFor`、通知 handler 的 canonical 列表、迁移时的来源读取，仍然读整行，本 Sprint 不处理。

## review 处理

| review 意见（`codex-plan-review.txt`） | 处理 |
| --- | --- |
| P1-1 canonical 损坏语义不准（review 认为 `registrationFromRow` 只校验 `profile_payload` 是对象，缺 `registrationProfile` 的已取消行不会导致失败） | **部分接受**。<br>- 用 node 验证：缺 `registrationProfile` **键**时 `clone(undefined)` 会抛错，所以已取消行缺这个键**也会**让整场读取失败（`invalidCount > 0`）。这一点 review 的判断不成立，事实 2 保留并注明验证过。<br>- review 指出的「消费时才抛错」成立：`registrationProfile` 为 null 或非对象、`answers` 与各叶子类型异常，都在已报名行被消费时才抛错；已取消行不访问。据此新增事实 5 的逐格矩阵，按名单、预览两个消费者分列。<br>- 解析失败条件补上 infinity 时间戳（node 验证）；非法 status 与非对象 `profile_payload` 由 CHECK 约束排除。<br>- SC-01 拆成 (b) 解析时抛错、(c) 消费时抛错、已取消行不访问三类，SC-02 (c) 同理。<br>- 交叉核对后回改 W0028：出 revision 3，补上 infinity 时间戳，写明 null 画像不抛错 |
| P1-2 legacy 的「损坏行静默丢弃」说得过宽；`#>>` 会把数字转成文本 | **接受**。事实 3 写明只有 `isStoredEventRegistration` 不通过或 eventId 不符的行才静默丢弃；嵌套画像按事实 5 复现旧结果（含 `.trim`／`.split` 抛错）；决定一节禁止用 `#>>` 取叶子，改为类型保真裁剪；SC-02 (c) 把这些格子加进 legacy PG 等价测试 |
| P1-3 legacy 顺序没有锁定 | **接受**。事实 3 抄录 WHERE 与 ORDER BY 原文，决定一节要求完整复刻（可加 `record_id` 作为最后的决胜键，并说明）；SC-02 (b)(d) 增加人数相同的桶、超过 6 个桶、大小写合并后的 label 选择，以及行序列相同的深相等测试 |
| P1-4 预算重复累计 | **接受**。新增「预算重算」一节：从 884 MB 出发，按 A～E 五条互斥路径分列「被替代的旧流量」与「最终上限／估算」。结论：按上限汇总 1,174 MB，按估算约 1,071 MB＋C，都超过 1.0 GB、低于 1.2 GB，需要按 D20 放宽到 ≤1.2 GB；真实出站大幅下降。SC-04 要求用实测值重算，并按 ≤1.0／1.0–1.2／>1.2 GB 三档给出结论 |
| P2 「`registrationClusterPreview` 一行不改」与新入参矛盾 | **接受**。改为「聚合规则不变」；投影保留同名嵌套路径，尽量不改访问逻辑；SC-02 (a) 要求旧完整 DTO 与新投影 DTO 分别计算后深相等 |
| D20（用户裁决 W29-1、W29-2、W29-3 均选 A） | 并入「已定决定」表；开放问题清空；上限与总账规则写进 SC-04 |
