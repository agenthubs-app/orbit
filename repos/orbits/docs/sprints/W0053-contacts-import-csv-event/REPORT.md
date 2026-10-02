# Sprint W0053 — 执行总结

> 报告由协调者按 Generator 原文写入（子代理写文件被拦）。协调者注：第一段起 dev server 时 next dev 改写过用户未提交的 `repos/orbits/next-env.d.ts`（现为 `.next-verify` 路径），已告知用户；第二段起改为先备份、后还原。

## 结果

对应 [GOAL.md](GOAL.md)。

**已验证能做到：**
- 「导入人脉」页的上传 CSV、导入通讯录（vCard）、从活动添加三种方式都已接通。
- 上传后服务端解析：
  - 显示识别出的格式、行数和无法读取的行。
  - LinkedIn 的 Connections.csv 自动识别；通用表格按中、英、日表头自动对应，可在页面上改对应。
  - 支持带 BOM 的 UTF-8、UTF-16 和 Shift_JIS 编码。
  - vCard 支持 2.1、3.0、4.0，一个文件可以有多张卡。
  - 引号没闭合的坏行标成「格式有误」，不会吞掉后面的正常行。
  - 超过 5 MB 或 2,000 条，在读完文件之前就拒绝。
- 核对表把新联系人、可能重复、文件内重复、无法导入分开列出：
  - 每条可能重复都显示命中原因和两边的字段。
  - 完全一致的预选「合并」；不完全一致的必须由你选择，服务端拒绝含未决行的提交。
  - 「全部按建议处理，确认导入」一键提交。
  - 合并只补空字段，不同的信息写进「导入补充」备注。
- 同一个文件导入两次，第二次 0 新增。
- 导入后每个写入事务（≤200 人）走一次 W0048a 三层更新：补全、规则匹配进「待确认」、快照判定。
  - 导入不改计划：plans、plan_items、plan_log 逐行不变，只多出 pending 候选。
  - 后台池用满时，导入记录显示「补全明天继续」。
- 从活动添加：
  - 只列你在现场互相交换过名片的人，按活动分组。
  - 只补空「在该活动认识」。
  - 联系人还没同步出来的显示「同步中」，不会新建。
- 导入记录显示真实的来源、文件名、总数、新建数、合并数，以及后续更新状态。
- 提交写到一半进程中断：维护任务会续写完成，不会产生重复联系人；7 天内没能续写完的显示「导入中断（部分已写入）」。
- 原始文件不保存，解析行在导入结束 7 天后删除。
- 页面上不再出现「10,000 条」「.xlsx」「即将开放」。

**仍未实现或未验证：**
- 浏览器里的活动导入用了接口桩：本机验收账号没有现场交换记录。真实后端由 Postgres 测试覆盖。
- 写入时只返回必要列，需要改共享 record store，没做，列为 D32 候选。

## 运行记录

- **结果：** 等协调者合并；合并树验证通过后标 completed。
- **执行者：** Generator Opus 5.5，2026-10-03。Planner revision 4，SHA256 `2f82a1de…ccb2`，开工时核对一致。
- **分支：** `sprint/W0053-contacts-import-csv-event`，基线 `0a31d839`。
  - 功能 `d5e8853f`、review 修复 `eac3b266`、测试登记 `20be279c`（固定最终 SHA）。
  - `chat-agent` 合并 SHA：见 README 运行记录。
- **档位：** H。
- **全量对照：** 基线和本分支都设了本机库变量，没有 source .env；清单在证据目录 `fail-*.txt`。
  - **基线**（只把本 Sprint 的路径恢复到 `0a31d839`）：6,611 个测试，82 个失败，73 个 skipped。
  - **第一次全量**（`eac3b266`）：84 个失败。比基线多出 3 条：
    - `web-runtime-migration` 冒烟测试：确定性失败。原因是测试没登记新的迁移表和数据表，已在 `20be279c` 修复。
    - `event-profile-contract-repair-apply`、`canonical-inbox-plan-changes-postgres`：单独重跑两次都通过。
  - **第二次全量**（`20be279c`）：6,638 个测试，81 个失败，73 个 skipped。上面那三条都没再出现，另多出 1 条 `event-registration-plan-sync`，单独重跑两次 5/5 通过。
  - **结论：** 稳定新增失败 0。三条偶发失败两次全量各不相同、单独都能通过，按偶发处理；它们都不在本 Sprint 改动范围内。
- **付费 AI：** 0 次。本机库 `ai_usage_calls` 前后都是 14 行，`ai_usage_ledger` 都是 10 行，两轮浏览器验证都核对过。验证用的 dev server 把 `DEEPSEEK_API_KEY` 和三个生成器开关都置空。
- **push：** 无。生产迁移、部署也没做。

## 验收结果

| SC | 结果 | 证据 |
| --- | --- | --- |
| SC-W0053-01 解析 | pass | `tests/capabilities/contact-import-parse.test.ts` 9/9；路由测试：别人的批次 404，5 MB 与行数上限都在读完前返回 413，坏行带原因 |
| SC-W0053-02 去重与确认 | pass | `tests/api/contact-import-routes.test.ts` 11/11（本机库）；`business-card-contact-match.test.ts` 13/13，默认标签不变 |
| SC-W0053-03 三层更新、不改计划 | pass | `tests/services/contact-import-layers-postgres.test.ts` 3/3（真实入口、账本、计划表，mock 模型）；路由测试中的 SC-03 用例和 review 用例 |
| SC-W0053-04 活动导入 | pass | `tests/services/contact-import-events-postgres.test.ts` 1/1（真实现场交换仓储 + outbox 投影） |
| SC-W0053-05 页面与收口 | pass | `tests/pages/app-network-import.test.tsx` 9/9；`tests/pages/app-network-import.browser.mjs` 1440、375 都是 PASS，控制台 0 错误；截图在 `browser/`、`browser-round2/`；tsc 源码 0 错；全量稳定新增失败 0；Codex review 一次 |

**数据库测试的非 skip 输出：**
- 运行条件：两个库变量都指向 `postgresql://li@localhost:5432/orbit_newui_events_20260922`；先跑 `node scripts/assert-local-test-databases.mjs`，通过。
- 每个文件都是 fail 0、skipped 0：

| 文件 | pass |
|---|---|
| `tests/api/contact-import-routes.test.ts` | 11 |
| `tests/services/contact-import-layers-postgres.test.ts` | 3 |
| `tests/services/contact-import-events-postgres.test.ts` | 1 |
| `tests/api/business-card-ingest-v2-routes.test.ts` | 12 |
| `tests/capabilities/business-card-contact-write.test.ts` | 10 |
| `tests/capabilities/plan-matching.test.ts` | 16 |
| `tests/api/agent-plan-candidates-routes.test.ts` | 12 |
| `tests/capabilities/duplicate-detection-merge-live-store.test.ts` | 6 |
| `tests/capabilities/event-attendee-import-live-store.test.ts` | 6 |
| `tests/capabilities/external-contacts-import-live-store.test.ts` | 11 |
| `tests/capabilities/contact-acquisition-draft-live-store.test.ts` | 7 |
| `tests/services/contact-card-page-postgres.test.ts` | 3 |
| `tests/services/network-new-contact-layers.test.ts` | 3 |
| `tests/services/web-runtime-migration.test.ts` | 1 |

- 证据：`closing-set-2.txt`。

**D39 流量（review 后重测）：**
- 口径：一批 200 行（其中 20 行重复），账号已有 1,000 位联系人，联系人带真实规模的 search_text。
- 查重读取不再带 search_text 后，上传从 894,989 B 降到 622,409 B（−272,580 B）。
- 一批合计 1,104,024 B，261 条语句：

| 环节 | 字节 |
|---|---|
| 上传 | 622 KB |
| 核对表 4 页 | 84 KB |
| 读摘要 | 1 KB |
| 改 20 行决定 | 16 KB |
| 提交 | 372 KB（其中写入时返回整行约 261 KB） |
| 后续更新 | 8 KB |
| 读导入记录 | 1 KB |

- 第一段报的 1,101,001 B 偏低：当时的测试联系人没有 search_text。
- 按「1000 人 × 每人每月 1 批」折算约 +1,104 MB/月。并入 D32 后三档累计约 **7,842 / 7,902 / 8,381 MB**。
- 200 位联系人的账号约 +0.5 MB/批。
- 候选瘦身（D32）：写入只返回必要列，约省 261 KB/批；需要改共享 record store，没做。
- 证据：`traffic-d39-after-review.txt`、`traffic-d39-before-omit.txt`。

## 假设与额外阅读

**上下文包之外读过的文件**（都是先用 GitNexus 或 grep 定位再读）：
- 三层入口与装配：`features/network-analysis/new-contact-layers.ts`、`layers-runtime.ts`、`runtime.ts`。
- 补全：`features/contacts/enrichment/text-enrichment.ts`（确认补全没有单独的真实开关）、`apply-enrichment.ts`。
- 联系人写入与存储：`features/contacts/live-contact-write-service.ts`（ContactDTO 怎么构造）、`shared/storage/postgres-live-record-store.ts`（按 updated_at 的条件更新、`omitSearchText`）。
- 活动标题：`features/events/core/storage/postgres-repository.ts`（`event_ops_events.title`）。
- 测试夹具：`tests/services/event-contact-request-inbox-postgres.test.ts`（现场交换）、`tests/support/network-analysis-harness.ts`、`tests/support/plan-matching-harness.ts`、`features/plans/match-worker.ts`。
- 其他：`features/operations/maintenance/configured-tasks.ts`、`network-shell.tsx`（CSS）、`tests/ui/orbit-0918-anchor-colour.test.ts`、`tests/services/web-runtime-migration.test.ts`。

**对模糊点的选择：**
1. 三层入口的来源键是 `contact-import:<批次>:<事务号>`，不是 PLANNER 写的纯批次 id。原因：`enqueuePlanMatchJob` 按来源键去重，同一批多个事务共用批次 id 时，后面的会被丢掉。
2. 三层更新在 `after()` 里执行；维护任务 `contact-import` 负责续写、重试和清理。
3. 「本次提交确认合并」的做法：提交时带上本批全部待合并的 `{seq, contactId}`，服务端要求与库里的待合并行完全一致。「全部按建议处理」就是一次这样的提交。
4. 上传用原始文件体，元数据放请求头，文件名做 URI 编码。
5. 活动导入里，已经记着别的活动的人计为「跳过」，但仍随这批走三层更新。
6. 导入屏原有两栏在 375 下不折行，主区被挤成约 54px：只在导入屏样式里加了「≤900px 改单栏」。
7. 迁移 v1 已经在本机库执行过，review 修复追加 v2 而不是改 v1。v1 里的 `layers_pending` 和 `layers_lease_until` 两列保留不用。

**PLANNER 文件表之外新增的路径：**
- `features/contacts/import/parse/stream-limit.ts`：上传时边读边数记录。
- `features/contacts/import/runtime.ts`：生产装配。
- `app/(app)/app/contacts/network-0918/network-import-client.ts` 和 `network-import-styles.ts`：页面的接口调用与样式。
- `tests/pages/app-network-import.browser.mjs`：浏览器交互脚本，不在 `npm test` 里，需要本机 dev server。
- 改了 `tests/services/web-runtime-migration.test.ts`：登记新的迁移表和数据表。

## review 处理（H 档，Codex 一次）

| 意见 | 判断 | 处理 |
| --- | --- | --- |
| P1-1 committing 批次中断后卡住 | 采纳 | 维护任务接手 5 分钟没推进的 committing 批次，按已保存的决定续写；批次行锁下只写还没写的行，不会重复写。到期仍没写完的转 `failed`（原因 `interrupted_expired`），导入记录可见。用例：第 2 个写入事务时「崩溃」，续写后共 450 人、0 重复；用原意图重放也不重复写 |
| P1-2 清理删掉待重试批次，更新丢失 | 采纳（选「独立轻量记录」） | 新表 `contact_import_followups`：每个写入事务一行，存这一事务的联系人 id，与联系人写入同一事务登记，清理解析行不影响它。用例：12 个过期待重试批次先被清理，之后 12 条更新都按正确的联系人执行 |
| P2-1 行数上限要读完才检查 | 采纳 | 上传时边读边数完整记录：CSV 超过 2,003 条（2,000 行数据 + 表头 + LinkedIn 说明段 2 条）、vCard 超过 2,000 张，立即停止读取并返回 413。用例：2,001 行之后对方还在持续发送，服务端在 10 个分块内就停下 |
| P2-2 未闭合引号吞掉后续行 | 采纳 | 引号字段跨过 20 个物理行或到文件末尾仍未闭合时，这条记录只取第一行并标 `malformed_row`（不可导入），从下一行接着解析；改字段对应后标记仍保留 |
| P2-3 三层更新租约没有所有权 | 采纳 | 改成按任务行逐条领取，带租约令牌；完成和释放都以令牌为条件。用例：租约过期被重新领取后，旧 worker 的完成和释放都返回 false，新 worker 正常完成 |
| P2-4 数据库测试缺环境变量时静默 skip | 部分采纳 | 门控不改（全仓约定）；本报告逐文件列出了非 skip 输出 |
| P3-1 页面测试只看静态 HTML | 采纳 | 新增 Playwright 交互脚本，1440 和 375 都是 PASS，控制台 0 错误。覆盖：选文件、改对应、翻 4 页、选决定、提交、导入记录、活动导入（接口桩）、键盘焦点环、无横向滚动 |
| P3-2 文件选择的键盘焦点不可见 | 采纳 | 文件 input 改成标准的视觉隐藏写法，外层 label 加 `:focus-within` 焦点环；交互脚本断言了焦点环 |
| P3-3 流量 | 部分采纳 | 查重读取加 `omitSearchText: true`，实测每批 −272 KB。写入只返回必要列需要改共享 store 的默认行为，按裁决列为 D32 候选 |

## 交接（给 W0054 / W0055）

- **表**（迁移锁键 `orbit:contact-import-schema`）：
  - v1：`contact_import_batches`、`contact_import_rows`。
  - v2：新增 `contact_import_followups`；批次状态加 `failed`；新增 `failure_reason` 列。
  - 已登记到 `scripts/migrate-web-runtime.ts` 和 `scripts/setup-minimal-staging.ts`。本机库已执行 v1 和 v2。
- **API**：全部用 `resolveAuthenticatedApiActor`，别人的批次返回 404；`contact-drafts/**` 没动。

| 方法 | 路径 | 用途 |
|---|---|---|
| GET / POST | `/api/contacts/import` | 导入记录 / 上传文件 |
| GET / POST | `/api/contacts/import/events` | 可导入的活动 / 导入一场活动 |
| GET / PATCH | `/api/contacts/import/:id` | 批次与核对摘要 / 改字段对应 |
| GET / PATCH | `/api/contacts/import/:id/rows` | 核对表分页 / 改决定 |
| POST | `/api/contacts/import/:id/commit` | 提交（`confirmationIntentId` + `mergeConfirmations`） |
| POST | `/api/contacts/import/:id/cancel` | 取消 |

- **稳定 id：** `contact:import:<sha256(actor\0batch\0seq) 前 24 位>`。
- **来源：**
  - CSV / vCard 新建的联系人：`{type:"external_contacts", id: 批次, label: "CSV 导入" | "vCard 导入"}`。
  - 活动导入只补 `metEventId` / `metEventTitle`，不改来源。
  - 证据 id：`evidence:contact-import:<批次>:<seq>`。
- **`mergeCardIntoContact` 新参数：** 可选 `supplementLabel`，默认仍是「名片补充」。
- **活动交换读取：** `listActorEventExchanges(executor, { workspaceId, actorId, eventId? })` 和 `summarizeImportableEvents`，都在 `features/contacts/import/events-source.ts`。
- **三层入口来源键：** `contact-import:<批次>:<事务号>`。
- **上限：** 5 MB 与 2,000 行都在读完前拒绝；核对表 50 行一页；一个写入事务 ≤200 行。
- **维护任务 `contact-import`**，每轮依次：
  1. 续写中断的提交，≤5 批
  2. 跑到期的三层更新任务，≤20 条
  3. 清理到期的解析行，≤50 批
- **W0055 生产切换清单要写进去：**
  - 生产执行 contact-import 迁移 v1 和 v2。
  - 导入补全随 `DEEPSEEK_API_KEY` 和迁移一起开启，不另设开关，计入后台池（60 次/日）。
- **D32：** 导入约 +1,104 MB/月，三档累计约 7,842 / 7,902 / 8,381 MB；候选瘦身是写入只返回必要列。
- **本机库遗留：** verify-plan 账号下有若干导入批次，包括 2 批 181 行的交互测试，约 370 位以「QA Person」开头的测试联系人；另有 1 批核对中、1 批已取消。
- **回退：** 按序 revert `20be279c`、`eac3b266`、`d5e8853f`。新表是追加的，旧代码不读，可以留着。
- **用户决定：** 无新增。流量登记 D32、补全不加开关，协调者已定。
