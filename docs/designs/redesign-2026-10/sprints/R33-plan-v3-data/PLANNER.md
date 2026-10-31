# Sprint R33 — 计划 v3：数据、契约与事实层

**Plan revision:** 1。**模式:** existing-codebase / single-generator。**档位:** H（共享契约、写入、迁移、AI 配额）。
**单一目标:** `PlanV2Analysis` 升到 `schemaVersion: 3`（只加字段）并落到读写与校验；`PlanSource` 网页来源类型；`contact_facts` 事实集合与累积写入、切段抽取、手动加事实；`ai_usage_ledger` 迁移 v8 加 `plan_search` / `plan_prep`；契约快照与 App 同步副本。
**易读目标:** [GOAL.md](GOAL.md)。**整体设计:** [plan-v3/DESIGN.md](../plan-v3/DESIGN.md)（§2 数据与契约、§2.6 配额、§4 拆分、§6 决定）。
**基线:** 开工时 `chat-agent` HEAD（当前 `7a81588d0`）；工作区里用户未提交的 `docs/designs/redesign-2026-10/plan-draft-v*-proposal.html` 与 `sprints/plan-v3/` 不得带进本 Sprint 提交。
**进入条件:** DESIGN 的 D-1～D-6 已由用户决定（2026-11-01）；D-3「生产 memo 抽取是否已开」由主会话在开工前查生产账本并记进本文「已查清的事实」；不依赖 R34 以后的 Sprint。
**分支:** 直接在 `chat-agent` 提交（沿用 RD-25 的做法），按路径提交；提交前 `git diff --cached` 只含本 Sprint 文件。

## 已查清的事实（按 `7a81588d0`，开工时复核）

1. `PlanV2Analysis`（`features/plans/v2/types.ts:58`）`schemaVersion: 2`，字段 `diagnosis / conclusion / flow? / citations / allocationReasons / basis / sample? / goalBackground? / goalNote?`；`PlanCitation = { id, version }`、`PlanBasisRef = { kind: premise|landscape|record|template, ref, label }`、`PlanV2Step` 已有 `doneCriteria`（`shared/contract/plan-v2.ts:32`）。
2. 草稿校验入口 `checkDraft` / `checkFix` / `checkReviewFix`（`features/plans/v2/ai/schemas.ts`），返回 `Checked<T>`（`ok + repairs?` 或 `issues`）；内容限额在 `validate-content.ts`（步骤 1–7、恰好 3 问、分量 5 步合计 100）。
3. 备注抽取：`features/contacts/memo-extraction/{provider,job,store,rescan}.ts`。输出 `offering / seeking / topics / eventTypes`（`itemsPerField 5`、`itemChars 40`、`memoChars 2000`，超长**截断**）；结果写进 record store 集合 `memo_extractions`（`createLiveRecordMemoExtractionStore`）并更新联系人 `publicProfile` 的三个字段（覆盖）；作业经 `AiQuotaGate`（后台池）；R24 加了 `planQuestions` / `questionCoverage`。
4. AI 账本：`ai_usage_ledger.purpose` 的 check 约束由 `features/network-analysis/migrations.ts` 维护，最新 v7（`ai-usage-event-registration-question`），写法是「按定义找约束名 drop 再 add」；用途常量与池 / 日限在 `features/ai-quota/constants.ts`（`AI_QUOTA_PURPOSES`、`AI_QUOTA_PURPOSE_POOLS`、`AI_QUOTA_DAILY_PURPOSE_LIMITS`、`PLAN_FLOW_PURPOSES`）。
5. 计划仓库：`createPostgresPlanV2Repository` / `createMemoryPlanV2Repository`（`features/plans/v2/repository.ts`）；`analysis` 以 JSON 列整体存取，加字段不需要 SQL 迁移。
6. 契约：`shared/contract/plan-v2.ts` 在快照内，只加不改；App 通过 `repos/orbit-app` 的 `npm run sync:contract` 复制 `shared/contract`、`shared/compute`；提交信息以 `contract:` 开头并注明「App 需要同步」。
7. 待查（开工前主会话补）：生产 `ai_usage_ledger` 里 `purpose = 'memo_extraction'` 近 30 天的行数（D-3）。

## 上下文包

### 必读
- DESIGN §1.1、§2.1–§2.6、§3.4、§6 D-1～D-6。
- `shared/contract/plan-v2.ts`、`shared/api-schema/plan-v2.ts`、`shared/api-schema/tolerant.ts`、`scripts/contract-snapshot.mjs`、`shared/contract/BREAKING.md`（只读，确认本 Sprint 不需要登记）。
- `features/plans/v2/{types,repository,validate-content}.ts`、`features/plans/v2/ai/{schemas,types,mock}.ts`、`features/plans/landscape/{types,store}.ts`。
- `features/contacts/memo-extraction/{provider,job,store,rescan}.ts`、`features/contacts/detail-contract.ts`（notes、lastInteraction 的形状）。
- `features/ai-quota/{constants,ledger,gate}.ts`、`features/network-analysis/migrations.ts`（v7 写法）。
- 测试：`tests/contracts/*`、`features/plans/v2` 与 `features/contacts/memo-extraction` 现有测试各一个（照其夹具写新用例）、`features/network-analysis` 迁移测试。

### 关键符号与 impact（开工时跑 `node .gitnexus/run.cjs impact "<symbol>" --direction upstream --repo .`，结果写进 REPORT）
- `PlanV2Analysis`、`PlanV2Content`：只加可选字段 + `schemaVersion: 2 | 3`；所有现有读取方不改。
- `checkDraft`：不改；新增 `checkDraftV3`（同文件或 `schemas-v3.ts`），R35 接线。
- `createLiveRecordMemoExtractionStore`、`runConfiguredMemoExtraction`：在作业**成功写入后**追加一步「累积到 `contact_facts`」；现有 `memo_extractions` 写入与 `publicProfile` 覆盖行为不变（加回归测试）。
- `MEMO_EXTRACTION_LIMITS.memoChars`：不改值；超长在作业层切段（每段 ≤2000 字、按段落边界），每段一次 provider 调用、各占一次后台池配额。
- `AiQuotaPurpose`、`AI_QUOTA_PURPOSES`、`AI_QUOTA_PURPOSE_POOLS`、`AI_QUOTA_DAILY_PURPOSE_LIMITS`：只加值（`plan_search`、`plan_prep`，都在 user 池；`plan_search` 不计入 `PLAN_FLOW_PURPOSES` 的 15 次，另设每份计划 ≤8 次由 R34 在调用处守；`plan_prep` 初次生成不计日限、重生成计入，由 R37a 用 `trigger` 区分）。
- UNKNOWN 必须文本确认：`memo_extractions` 集合的其他读取方（`rescan.ts`、联系人详情）、`PlanCitation` 的消费者（`PlanCitationView` 组装处）。

### 易错边界（全部对应 SC）
v2 计划被当成 v3 读出空字段导致页面崩；v3 写入被 `validate-content` 旧规则拒绝；`sources` 编号与正文引用错位（引用用 `sourceId` 字符串，不用数组下标）；事实累积把不同联系人的事实合并（合并键必须含 `contactId`）；切段把一句话从中间切开（按段落 / 句号边界）；切段作业失败一半（每段独立记账、已写入的事实保留、失败段登记重试）；手动事实被下一次抽取覆盖或删掉；`memo_extractions` 原行为改变；迁移 v8 回退后 `plan_search` 行残留导致约束加不回去（回退前删除这两种用途的行，同 v5–v7 先例）；契约快照出现删改；App 副本未同步导致 App typecheck 失败。

## 范围与文件

- 读取：上文必读；禁止全库再盘点。
- 修改：`shared/contract/plan-v2.ts`、`shared/api-schema/plan-v2.ts`、`shared/contract/.snapshot.json`（脚本生成）、`features/plans/v2/{types,repository,validate-content}.ts`、`features/plans/v2/ai/{types,schemas,mock}.ts`、`features/contacts/memo-extraction/{job,store}.ts`、`features/ai-quota/constants.ts`、`features/network-analysis/migrations.ts`、`repos/orbit-app/src/api/contract/*`（仅 `sync:contract` 产物）。
- 新建：`features/contacts/facts/{types,store,accumulate}.ts`（`contact_facts` 集合、合并、手动加）、`features/plans/v2/ai/schemas-v3.ts`（若不并入 schemas.ts）、对应测试文件、`features/contacts/memo-extraction/segment.ts`（切段）。
- 排除：任何界面；联网搜索（R34）；起草提示词（R35）；准备卡生成（R37a）；备注页「补一条事实」的界面入口（R37a / R37b，本 Sprint 只做存储与服务方法）；生产迁移执行；App 画面。

## 验收契约（最多五项）

| SC | 可观察行为 | 必需证据 |
| --- | --- | --- |
| SC-R33-01 | `schemaVersion: 3` 的 analysis（含 `outcome / summary / verdict / confidence / orderReasons / comparison / keyNumbers / risks / sources`，`sources` 含 landscape 与 web 两种）经 Postgres 与内存仓库写入再读出字段一致；`schemaVersion: 2` 行读出时新字段为 `undefined`，现有 v2 测试全部不变 | `features/plans/v2` 仓库往返测试（两种仓库）；现有 v2 测试文件整文件通过 |
| SC-R33-02 | `checkDraftV3` 对四种坏输出各自处置：无来源句 → 删句并记 `repairs`；加粗非原句子串 / >14 字 → 去标记；分量与对比条判定相反 → 自动修正一次并合计 100；引用不存在的 `sourceId` / `questionKey` → 删句；修正后仍不合规 → `ok: false` | `schemas-v3` 测试，四种坏输入 + 一份好输入（取自 mock） |
| SC-R33-03 | 对同一联系人依次抽取 3 条备注（含 1 条 3000 字），`contact_facts` 为三条备注事实的并集，重复文本只一行且 `lastSeenAt` 更新、`memoId` 指向最早来源；3000 字备注切成 ≥2 段分别调用 mock provider，provider 调用次数 = 段数，`memo_extractions` 与 `publicProfile` 的既有写入与改前逐字节相同；手动加的事实在后续抽取后仍在；某一段 provider 失败时其余段的事实已落库且作业报告失败段 | `features/contacts/facts` 与 `memo-extraction` 测试（mock provider，真实调用 0 次）；既有 memo-extraction 测试整文件通过 |
| SC-R33-04 | 迁移 v8 在测试库前进后 `ai_usage_ledger` 接受 `plan_search` / `plan_prep`，回退后恢复 v7 约束；`AI_QUOTA_PURPOSES` 含两值且 `plan_search` 不在 `PLAN_FLOW_PURPOSES`；账本 `reserve` 对两新用途按 user 池记账 | 迁移测试（前进 / 回退）、`ai-quota` 常量与账本测试 |
| SC-R33-05 | `node scripts/contract-snapshot.mjs` 的 diff 只有新增；`repos/orbit-app` 执行 `npm run sync:contract` 后 `git status` 只有契约副本变化，`npx tsc --noEmit` 通过；提交信息以 `contract:` 开头并注明「App 需要同步」 | 快照 diff 输出、App typecheck 退出码 |

## 一次 Generator 的执行顺序

1. 复核进入条件（含 D-3 事实），保存基线 SHA 与本文件 SHA256；`git status --short` 确认用户未提交文件不在白名单。
2. 对「关键符号」逐个 impact，HIGH / CRITICAL 写进 REPORT；UNKNOWN 文本确认。
3. 按 SC-01 → 02 → 03 → 04 → 05 的顺序 RED → 最小实现 → 定向 GREEN；每个 SC 一条操作链提交（契约与快照、App 同步副本同一提交）。
4. 收口：改动测试所在完整文件 + 直接消费者；`npx tsc --noEmit -p .`；H 档本地代码收口跑一次 `npm test` 对照基线（失败清单不新增）。
5. `detect-changes --scope all`（`partial / truncated` 视为未检查，重跑）；写 REPORT；交接给 R34 / R35（契约字段名、`checkDraftV3` 签名、`contact_facts` 读取方法、新用途常量）。

## 最小测试与检查

- 档位 H：共享契约、写入路径、迁移、配额常量。
- 开发定向集：`features/plans/v2` 仓库测试（新增往返）、`schemas-v3` 测试、`features/contacts/facts` 测试、`memo-extraction` 作业测试（切段、失败段）、迁移测试、`ai-quota` 测试。
- 操作链收口集：上述文件整文件 + `tests/contracts/*` + `tests/api/redesign-contract-routes.test.ts`；`npx tsc --noEmit -p .`；App 仓库 `npx tsc --noEmit`。
- 集成触发：本地代码收口一次 `npm test`，按 RULES 5.2 对照基线失败清单。
- 不运行：浏览器与模拟器（无界面改动）；真实 DeepSeek / Tavily 调用（本 Sprint 0 次）；生产迁移。

## 失败与交接

缺 D-3 事实不阻塞开工（只影响 R37a 是否要一起打开抽取），其余进入条件缺项不启动。REPORT 含 SC 映射、各操作链 SHA、impact 结果、命令与退出码、App 同步副本的提交、未完成项；交接列出给 R34（`PlanSource.web` 形状、`plan_search` 用途）、R35（`checkDraftV3` 签名与 `DraftOutputV3`）、R37a（`contact_facts` 读取与手动加事实的方法、`plan_prep` 用途与 `trigger` 约定）。
