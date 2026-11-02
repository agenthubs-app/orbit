# Sprint R33 — 执行总结

## 结果

对应 [GOAL.md](GOAL.md)。界面没有改动；全部是服务端数据、契约、校验与事实层。

- 已验证能做到：
  - `schemaVersion: 3` 的 `plans.analysis`（outcome / summary / verdict / confidence / orderReasons / comparison / keyNumbers / risks / sources，sources 含 landscape 与 web）经内存仓库与 PostgreSQL 仓库写入再读出字段一致；v2 行读出时新字段为 `undefined`（SC-01）。
  - `checkDraftV3` 对四种坏输出各自处置并记 `repairs`；修正后仍不合规 `ok: false`；mock 对 fundraising / launch / sales 各有一份 v3 固定输出、0 次修理通过校验（SC-02）。
  - 同一联系人 3 条备注（含 1 条 3600 字）抽取后 `contact_facts` 是事实并集、重复文本一行、`memoId` 指向最早来源；长备注按段落 / 句子切成 3 段分别调用 mock provider（调用次数 = 段数、每段一次 reserve）；`memo_extractions` 记录与 `publicProfile` 写入与不带事实累积时逐字节相同；手动事实在后续抽取后仍在；某段失败时其余段事实已落库、作业报 `failed` 并列出失败段；某段被日限挡住 → `deferred`，到期重跑只做剩下的段（SC-03）。
  - 迁移 v8 前进后账本接受 `plan_search` / `plan_prep`（user 池、各自 max_calls）；`plan_search` 与初次 `plan_prep` 只记账，不占用户池 10 次与计划流程 15 次；重生成 `plan_prep`（`trigger: "manual"`）计入 15 次；回退 SQL 删掉两种用途的行后恢复 v7 约束，再前进又接受（SC-04）。
  - 契约快照 diff 只有新增；App `npm run sync:contract` 后只有 `src/api` 副本变化，App `npx tsc --noEmit` 通过（SC-05）。
- 仍未实现或未验证：
  - `PlanV2Service.detail()` 没有把 v3 字段透传到 `PlanV2Content`（PLANNER「所有现有读取方不改」）；R36a 接初稿页时在 `service.ts` 的 content 组装处把 `analysis` 的 v3 字段带上即可（契约字段已存在）。
  - `firstDraftV3` 在 `PlanFlowAi` 上是可选方法（只有 mock 实现）；R35 给 deepseek 实现后改为必选并切换 `flow-service` 的初版步骤。
  - 切段作业里「失败段」（HTTP 已发出）是终态，不自动重试；只有被日限 / 未配置 provider 挡住的段会顺延重跑。
  - D-3（生产 `ai_usage_ledger` 近 30 天 `memo_extraction` 行数）：本会话连不到生产库（连接器只见 staging），**待主会话查**；不影响本 Sprint。

## 运行记录

- 结果：completed（本地代码收口；生产迁移 / 部署未做，按规程停在授权前）
- Generator：Claude Fable 5.1（side session）／2026-11-01；Planner revision 1，PLANNER.md SHA256 前 16 位 `dd8d6912e3aad475`
- 分支：直接在 `chat-agent` 按路径提交（基线 `d6c9fefc8`，2026-11-01）；功能 SHA 见「验收结果」；未 push
- 档位 H；全量对照见下「全量测试对照」
- 付费 AI 调用：0 次（DeepSeek / Tavily 都没有真实调用；测试全部 mock）
- impact（开工时，GitNexus 索引刷新到 `d6c9fefc8` 后）：
  - `PlanV2Analysis` HIGH（136 上游）、`PlanV2Content`（契约）CRITICAL（273）、`PlanCitation`（契约）CRITICAL（244）：只加可选字段与 `2 | 3` 联合，现有读取方 0 处改动；契约快照脚本与 parity 测试证明只加不改。
  - `createLiveRecordMemoExtractionStore` CRITICAL（128）、`runConfiguredMemoExtraction` CRITICAL（158）、`runMemoExtraction` HIGH（128）：store 工厂签名不变；作业只在成功后多一步累积、超长备注才走新分支；既有 11 个作业测试整文件通过 + 逐字节对照测试。
  - `AiQuotaPurpose` HIGH（67）：只加联合成员；所有 `Record<AiQuotaPurpose, …>` 补齐了两键，`tsc` 通过。
  - `checkDraft` LOW；`PlanSource` 新符号。
  - UNKNOWN（文本确认）：`MEMO_EXTRACTION_LIMITS`（provider.ts 内部 + 新 segment.ts / job.ts）、`AI_QUOTA_PURPOSES`（只有 constants.ts 与新测试）、`AI_QUOTA_PURPOSE_POOLS` / `AI_QUOTA_DAILY_PURPOSE_LIMITS` / `PLAN_FLOW_PURPOSES`（ledger.ts、deepseek.ts、两个既有测试）；`memo_extractions` 其他读取方（rescan.ts、flow-context.ts、relationship-strength、data-rights purge）读的是既有字段，未动。
- `detect-changes --scope all`：No changes（工作树干净，非 partial / truncated）；`--scope compare --base-ref d6c9fefc8`：32 文件 115 符号、risk medium、非 partial / truncated。证据：`~/orbit-sprint-evidence/web/sprint-R33/run-01/detect-changes-*.txt`。

### 全量测试对照（RULES 5.2）

基线 = `d6c9fefc8` 的 `repos/orbits` 导出到 scratchpad 跑；HEAD = `022e8841d`。两边同样带 `ORBIT_EVENT_DATABASE_URL`（本机回环库），不 source `.env`。

| | 总数 | 通过 | 失败 | 跳过 |
| --- | --- | --- | --- | --- |
| 基线 | 8055 | 7403 | 75 | 577 |
| HEAD | 8081 | 7481 | 29 | 571 |

`comm -13` 新增失败 3 条，逐条复核后都不是本 Sprint 引起：
- `tests/api/event-registration-plan-sync.test.ts`「a failing plan sync never changes…」与 `tests/ui/plan-review-screens.test.tsx`「review entry: 3 cells…」：两个文件单独重跑，HEAD 与基线副本结果完全相同（各 38 用例 36 通过，失败的只有基线就有的两个 30 s 超时用例）——全量负载下的抖动。
- `tests/audits/full-product-functional-audit.test.ts`「runtime evidence keys anchored by file:line…」：指向 `app/(app)/app/agent/iorbit-0918/` 的 4 个 file:line 证据键，这些文件在 `d6c9fefc8..HEAD` 没有任何改动；基线副本在 scratchpad 路径下该审计走的是另一分支（通过），与 R33 无关，留给主会话 / 审计维护者。
基线比 HEAD 多出的 46 个失败是基线副本不在 `repos/orbits` 原路径下跑出的路径依赖用例（知识库 wiki、路由清单、证据审计等），HEAD 在原路径下这些都通过。日志：`~/orbit-sprint-evidence/web/sprint-R33/run-01/npm-test-{baseline,head}.txt`。

## 验收结果

| SC | pass / fail / blocked | 证据（测试文件或场景） | commit |
| --- | --- | --- | --- |
| SC-R33-01 | pass | `tests/plans/plan-v3-analysis-roundtrip.test.ts`（内存 + PostgreSQL，2 通过）；现有 v2 测试（`tests/plans/*`、`plans-v2-*-postgres`）整文件通过 | `3eb4194dd` |
| SC-R33-02 | pass | `tests/plans/plan-v3-draft-check.test.ts`（6 通过：3 种目标 mock 0 修理、无来源句、坏加粗、分量重排、坏引用 / 未核实行、规则 4）；既有 `tests/plans/plan-flow-ai.test.ts` 等 68 用例通过 | `835dc14b5` |
| SC-R33-03 | pass | `tests/capabilities/contact-facts.test.ts`（7 通过）；`tests/capabilities/memo-extraction-job.test.ts` 整文件 11 通过；memo 作业消费者 8 个文件 72 通过（含 r20b e2e、维护任务 PostgreSQL） | `0b60048e6` |
| SC-R33-04 | pass | `tests/capabilities/ai-usage-plan-v3-purposes-postgres.test.ts`（常量 + 前进 / 回退 / 再前进）；`plans-v2-migrations-postgres`、`r27-ai-usage-event-purposes-postgres`、`ai-usage-ledger-postgres`、配额消费者测试共 72 通过 | `022e8841d` |
| SC-R33-05 | pass | `node scripts/contract-snapshot.mjs`：只有新增（diff 里 7 行「删除」是既有快照落后于已提交契约的重排 / 枚举加值，脚本判定 0 破坏）；`tests/contracts/*` + `tests/api/redesign-contract-routes.test.ts` + `plan-v2-routes` 38 通过；App `sync:contract` 后 `git status` 只有 `src/api/**` 8 个文件、App `npx tsc --noEmit` 退出码 0、App 四个 sync 测试通过 | `3eb4194dd` |

`npx tsc --noEmit -p .`（Web）每个 SC 后各跑一次，退出码 0。

## 假设与额外阅读

- 额外阅读（上下文包之外）：`features/plans/v2/ai/normalize.ts`（v3 复用它做基础规整）、`features/plans/v2/flow-service.ts` 的 `toDraftContent`（确认 Step key 规则 `step-<n>`）、`features/plans/v2/service.ts` 的 content 组装（确认 v2 读取方不改）、`features/ai-quota/ledger.ts`（新用途的计数口径必须在这里落地）、`features/account/data-rights/purge/notes.ts`、`shared/storage/live-record-store.ts`、`tests/contracts/redesign-schema-parity.check.mts`、既有 PostgreSQL 测试夹具。
- 新增 / 额外改动的文件（PLANNER 文件表之外，RULES 0 登记）：
  - `features/ai-quota/ledger.ts`：`user_used` / `plan_flow_used` 的 SQL 与 `reserve` 分支——`plan_search` 与初次 `plan_prep` 不占任何日上限、重生成 `plan_prep` 计入 15 次。不改账本，`plan_search` 会落进用户池 10 次总熔断，8 次搜索就把用户当天的 AI 用完，与 DESIGN §2.6「不计入 15 次、单独记账」矛盾。
  - `features/account/data-rights/purge/notes.ts`：`contact_facts` 加进个人数据清除清单（事实来自本人备注）。既有清除测试通过。
  - `shared/contract/index.ts`：re-export 新类型。
- 模糊点的选择：
  - v3 的 AI 输出理由段按句给（`DraftSummarySentence { text, bold, refs }`），`PlanMarkedText` 的下标由 `checkDraftV3` 算：模型不擅长字符下标，按句对账也让「删句 / 去标记」有唯一确定的做法。
  - 「无来源句 → 删句」：每句至少 1 条 `ref`（来源或回答）；全删空 → `ok: false`。
  - 对比条行加可选 `typeKey`（对应人物类型 key，筛掉的类型为 null）：规则 3 需要知道哪一行对应哪个类型。
  - 规则 3 的修正 = 把参与对比的类型按判定重排、配点多重集不变（合计与 5 分一档自然不变）；合计 ≠ 100 交给既有校验器拒绝（不受模板约束时），受模板约束时 `normalize` 回到模板配点。
  - `stepKey` 不由模型给：由 Step 的 `personTypeKeys` 导出（`step-<n>`，与 `flow-service` 同一规则）；某类型不在任何 Step 里 → `ok: false`（DESIGN 规则 4 没有修复条款）。
  - `citations` 在 v3 由用到的 landscape 来源导出（v2 读取方的依据区照旧能显示）；v3 的 diagnosis / conclusion 不再要求 ①② 标记（`checkDraftStructure` 从 `checkDraftContent` 拆出，v2 行为逐字不变）。
  - `contact_facts` 合并键 = 本人 + 联系人 + 字段 + 规范化文本（NFKC、去空白、小写）；同一文本在 offering 与 seeking 里算两条事实。`eventTypes` 也按 DESIGN 表存为 `field: "event"`（枚举值文本）。
  - `memoDate`：`MemoExtractionJobInput` 加可选 `memoDate`，现有三个调用处（contacts handler、notes route、rescan）没传 → 用写入时刻；R37a 需要真实备注日期时在调用处补传。
  - 切段：每段一次 reserve，幂等键 `<memo key>#<段号>`（后台池、purpose `memo_extraction`）；记录新增可选 `segments` / `segmentOutputs` / `factsError`，单段路径不写这些字段。
  - `plan_prep` 的 `trigger` 约定：初次生成 `"plan"`（不计日限）、重生成 `"manual"`（计入 15 次）；`PLAN_PREP_REGENERATE_TRIGGER` 常量。
  - 迁移框架没有 down 机制：回退做成 `AI_USAGE_PLAN_V3_ROLLBACK_SQL` 导出常量（删两种用途的行 → 恢复 v7 约束 → 删 v8 登记），测试里前进 → 回退 → 再前进。
  - 契约快照 `--write` 顺带写入了之前已提交契约（calendar-external-events、event-discover、network-analysis-view）落后的快照与 App 副本；都是既有提交的机械同步，脚本判定 0 破坏。

## review 处理（仅 H 档）

| 意见 | 判断 | 处理 |
| --- | --- | --- |
| （方案期 review 已在 DESIGN / PLANNER 阶段完成；代码 review 由主会话决定是否安排） | — | — |

## 交接

- 给 R34（联网搜索）：
  - `PlanWebSource = { id, kind: "web", url, title, fetchedAt, snippet (≤300 字), query }`、`PlanLandscapeSource = { id, kind: "landscape", landscapeId, version }`，`PlanSource` 是两者联合；`id` 由服务层编号（建议 `S1`…，正文只用 `sourceId` 字符串）。
  - 账本用途 `plan_search`（user 池、`AI_QUOTA_MAX_CALLS.plan_search = 1`、不计任何日上限、provider 填 `tavily`）；每份计划 ≤8 次由调用处守（`PLAN_SEARCH_PER_PLAN_LIMIT`）。
  - `FirstDraftInputV3.sources` 就是搜索结果 + 业界现状库条目拼成的来源清单。
- 给 R35（起草 AI v3）：
  - 类型：`FirstDraftInputV3 extends FirstDraftInput { sources: PlanSource[]; answerKeys: string[] }`；模型输出 `DraftOutputV3 extends DraftOutput { outcome; summary: DraftSummarySentence[]; verdict; confidence; orderReasons; comparison | null; keyNumbers; risks }`（`summary` 每句 `{ text, bold: string | null, refs: PlanRef[] }`，`comparison.rows[].typeKey` = 人物类型 slot 或 null；不产出 `citations` / `sources`）。
  - 校验：`checkDraftV3(raw, input: ContentCheckInputV3, normalize?) : Checked<DraftV3>`，`ContentCheckInputV3 = ContentCheckInput & { sources; answerKeys: ReadonlySet<string> }`；`DraftV3` = 基础方案 + `schemaVersion: 3`、`summary: PlanMarkedText`、`personTypes[].stepKey`、`sources`、`citations`（导出）。`repairs` 码：`summary_sentence_dropped:<i>:no_source|unknown_ref`、`summary_mark_dropped:<i>`、`allocation_reranked_by_verdict`、`order_reason_unverified:<i>`、`key_number_unverified:<i>`、`comparison_row_unverified:<i>`、`risks_trimmed`（加 normalize 既有码）。
  - `PlanFlowAi.firstDraftV3?`（mock 已实现 `createMockPlanFlowAi().firstDraftV3` / `mockDraftV3(input, language)`）；deepseek 实现后改为必选；`flow-service` 把 `DraftV3` 写进 `PlanDraftContent` 时按 `schemaVersion: 3` 存 `analysis` 的新字段，并把 `stepKey` 写进 `plan_items.meta.personType.stepKey`。
  - `PlanV2Service.detail()` 透传 v3 字段的改动留给 R35 / R36a（本 Sprint 未动 `service.ts`）。
- 给 R37a（准备卡）：
  - 读取：`createLiveRecordContactFactStore({ store, workspaceId }).list({ actorId, contactId })`（配置版 `createConfiguredContactFactStore()`，≤500 条、按 `firstSeenAt` 正序）；`ContactFact = { id, actorId, contactId, field: offering|seeking|topic|event|manual, text, normalized, memoId, memoDate, firstSeenAt, lastSeenAt }`。
  - 手动加事实：`addManualContactFact(store, { actorId, contactId, text (≤80 字), at })`，同文本合并，抛 `ContactFactError("EMPTY_TEXT" | "TEXT_TOO_LONG")`；界面入口在 R37a / R37b。
  - 账本用途 `plan_prep`（user 池、`max_calls 3`）：初次生成 `trigger: "plan"` 不计日限、每份计划 ≤4 张由调用处守（`PLAN_PREP_INITIAL_CARDS_LIMIT`）；重生成 `trigger: "manual"`（`PLAN_PREP_REGENERATE_TRIGGER`）计入计划流程 15 次。
  - 备注日期：调用 `runConfiguredMemoExtraction` 时可传 `memoDate`（事实的 `memoDate`），现有调用处未传。
- 需要用户授权：生产执行迁移 v8（`scripts/migrate-web-runtime.ts` 会顺带前进；回退用 `AI_USAGE_PLAN_V3_ROLLBACK_SQL`）、部署、push。D-3 待主会话查生产账本。
