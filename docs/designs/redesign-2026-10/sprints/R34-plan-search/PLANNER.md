# Sprint R34 — 计划 v3：起草前的联网搜索

**Plan revision:** 1。**模式:** existing-codebase / single-generator。**档位:** H（外部付费调用、AI 账本）。
**单一目标:** 新模块 `features/plans/search/*`：按目标类型的查询模板、Tavily 适配器、过滤与去重、每次查询记账、失败退化、mock 与未配置实现；对外只暴露一个 `PlanSearch` 接口，不接进 `flow-service`（R35 留可选依赖，主会话合流时在 `flow-factory` 注入）。
**易读目标:** [GOAL.md](GOAL.md)。**整体设计:** [plan-v3/DESIGN.md](../plan-v3/DESIGN.md)（§2.3 网页来源、§2.6 配额、§3.2 搜索规矩、§6 D-2 / D-5）。
**基线:** 开工时 `chat-agent` HEAD（当前 `20d77cf78`，含 R33 全部提交）；工作区里 `docs/designs/redesign-2026-10/sprints/R35-*` 是并行 Sprint 的文件，不得带进本 Sprint 提交。
**进入条件:** R33 已完成（`PlanWebSource`、`plan_search` 用途、`PLAN_SEARCH_PER_PLAN_LIMIT` 在代码里）；D-2 / D-5 已定（每份计划 ≤8 次：点名 3、门槛 3、市场 2）；不依赖 R35。
**分支:** 直接在 `chat-agent` 提交，按路径提交；提交前 `git diff --cached` 只含本 Sprint 文件。**并行提醒:** R35 同时在 `features/plans/v2/**` 改代码，本 Sprint 不得碰 `features/plans/v2/**`、`flow-factory.ts`、`shared/contract/**`。

## 已查清的事实（按 `20d77cf78`）

1. 代码仓库根在 `repos/orbits`（下文路径都相对它）。目标类型 `PlanGoalKind = "launch" | "fundraising" | "sales" | "hiring" | "partnership" | "career"`（`shared/contract/plan-v2.ts:10`）。
2. R33 已加：`PlanWebSource = { id, kind: "web", url, title, fetchedAt, snippet (≤300 字), query }`、`PlanLandscapeSource`、`PlanSource` 联合（`shared/contract/plan-v2.ts`）；`id` 由服务层编号——**本 Sprint 不编号**，`id` 先留空字符串由 R35 的服务层改成 `S<n>`（或本模块返回不含 `id` 的 `Omit<PlanWebSource, "id">`，二选一，PLANNER 定：返回 `Omit<PlanWebSource, "id">`）。
3. 账本：`AiQuotaGate.reserve({ actorId, pool, purpose, trigger, idempotencyKey, now })` → `beginCall(operationId, { model, provider })` → `endCall(callId, usage | null)` → `finish(operationId, "succeeded" | "failed")`（`features/ai-quota/gate.ts`、`ledger.ts`）；`plan_search` 在 user 池、`AI_QUOTA_MAX_CALLS.plan_search = 1`、`isRecordOnly` 为真（不占用户池 10 次、不占计划流程 15 次，`ledger.ts:98-101`）；每份计划上限常量 `PLAN_SEARCH_PER_PLAN_LIMIT = 8`（`features/ai-quota/constants.ts:104`）。DeepSeek 的用法范例在 `features/plans/v2/ai/deepseek.ts:31-60`（reserve → beginCall → endCall，失败也 endCall）。
4. HTTP 范例：`features/ai/deepseek-json-chat.ts`（`AbortController` + `setTimeout` 超时、错误类带 code）；本模块照这个写 `tavily.ts`，`fetch` 通过依赖注入便于测试。
5. live 下的运行时：`getConfiguredNetworkAnalysisRuntime()` 给 `ledger`（`features/plans/v2/flow-factory.ts:32-35` 的拿法）；环境变量没有 `.env.example`，只有本机 `.env.local`（不读、不改）。
6. 业界现状库条目有 `source.url`（`features/plans/landscape/types.ts`）——过滤规则里「同域去重」只在网页来源之间做，不和 landscape 比。
7. 代码里还没有任何 Tavily 代码（只有 R33 的常量注释提到）。Tavily REST：`POST https://api.tavily.com/search`，body `{ api_key | Authorization: Bearer, query, search_depth: "basic", max_results: 3, include_answer: false }`，响应 `results[] = { title, url, content, score }`。以官方文档为准，适配器只取这四个字段。

## 上下文包

### 必读
- DESIGN §2.3、§2.6、§3.2、§6 D-2 / D-5、§7 风险第一条。
- `shared/contract/plan-v2.ts`（`PlanWebSource`、`PlanGoalKind`、`PlanPremiseRow` 形状，只读）。
- `features/ai-quota/{constants,gate,ledger}.ts`；`features/plans/v2/ai/deepseek.ts`（记账范例，只读）；`features/ai/deepseek-json-chat.ts`（HTTP 范例，只读）。
- `features/plans/v2/types.ts` 里 `PlanPremiseRow`（问答行：`questionId`、答案文本）——查询模板可以用答案里的地名 / 行业词。
- 测试范例：`tests/plans/plan-flow-ai.test.ts`（假 chat + 内存账本）、`tests/capabilities/ai-usage-plan-v3-purposes-postgres.test.ts`（测试库账本）。

### 接口（和 R35 的约定，两边 PLANNER 一致，不得改名）

```ts
// features/plans/search/types.ts
export interface PlanSearchInput {
  goalKind: PlanGoalKind; goalText: string; purpose: string | null;
  premise: readonly PlanPremiseRow[]; industries: readonly IndustryIdCode[]; language: PlanCopyLanguage;
}
export interface PlanSearchContext { actorId: string; ledgerKeyPrefix: string; now: Date }   // 幂等键 = `${prefix}#search-${n}`
export interface PlanSearchResult {
  status: "ok" | "partial" | "unavailable";          // unavailable = 全部失败 / 未配置 / 超时全败
  sources: Array<Omit<PlanWebSource, "id">>;         // 已过滤去重、≤8×3 条上限内；id 由 R35 编
  queries: number; failed: number;
}
export interface PlanSearch { readonly id: "tavily" | "mock" | "disabled"; search(input: PlanSearchInput, context: PlanSearchContext): Promise<PlanSearchResult> }
```

### 关键符号与 impact（开工时跑 `node .gitnexus/run.cjs impact "<symbol>" --direction upstream --repo .`，结果写进 REPORT）
- 全部是新文件；只读取 `AiQuotaGate`、`PLAN_SEARCH_PER_PLAN_LIMIT`、`AI_QUOTA_MAX_CALLS`、`AI_QUOTA_PURPOSE_POOLS`（不改）。impact 对这四个跑一遍登记即可。
- UNKNOWN 必须文本确认：`PLAN_SEARCH_PER_PLAN_LIMIT` 现有读取方（预期只有 constants.ts 与 R33 测试）。

### 易错边界（全部对应 SC）
查询里带联系人姓名或本人姓名（泄露个人信息，禁止）；同一份计划重跑搜索再记 8 行账（幂等键必须含 `ledgerKeyPrefix` 与序号）；一次查询失败就整体抛错（必须按查询独立失败，`failed` 计数）；超时不中断 fetch（必须 `AbortController`）；重试（禁止，DESIGN §3.2「失败不重试」）；片段超过 300 字；同域去重把 `go.jp` 下不同机构当同域（按完整 host 去重，不按根域）；非 https 漏过；社交平台个人页（x.com / twitter.com / facebook.com / instagram.com / linkedin.com/in/ / note.com 个人页 / threads.net）漏过；`unavailable` 时仍返回零星来源（全失败或未配置 → `sources: []`）；`partial` 时少于 8 次查询；`endCall` 在异常路径漏记。

## 范围与文件

- 读取：上文必读；禁止全库再盘点。
- 新建：`features/plans/search/{types,queries,filter,tavily,service,mock,disabled,factory}.ts`、`tests/plans/plan-search-*.test.ts`（查询模板、过滤、服务记账与退化、tavily 适配器）。
- 修改：无（`.env` 变量名 `TAVILY_API_KEY`、开关 `ORBIT_PLAN_SEARCH=tavily` 只写在 `factory.ts` 的注释与 REPORT）。
- 排除：`features/plans/v2/**`、`flow-factory.ts`、契约、界面、生产变量、真实 Tavily 调用、准备卡。

## 验收契约（最多五项）

| SC | 可观察行为 | 必需证据 |
| --- | --- | --- |
| SC-R34-01 | `planSearchQueries(input)` 对 6 种目标各返回 ≤8 条、顺序 点名(≤3) → 门槛(≤3) → 市场(≤2)，每条带 `kind` 与 `query`；查询词含 `goalText` 或行业词，不含 premise 以外的自由文本、不含任何人名字段；三语各能生成（`language` 决定查询语言，日语优先） | `plan-search-queries` 测试：6 种 × 3 语 36 组断言条数 / 顺序 / 不含占位符残留 |
| SC-R34-02 | `filterSearchResults(raw)`：去掉非 https、社交个人页、广告页（url 含 `utm_`/`ad`/`affiliate` 等启发式清单）；同 host 只留分数最高一条；`snippet` 截到 ≤300 字；输出带 `fetchedAt`（ISO）与 `query` | `plan-search-filter` 测试：含每类坏 url 的夹具，输出只剩合规项 |
| SC-R34-03 | `createPlanSearchService({ provider, ledger, limit })` 对一份计划：每条查询 reserve（purpose `plan_search`、pool `user`、trigger `plan`、幂等键 `${prefix}#search-${n}`）→ beginCall（provider `tavily`）→ endCall → finish；测试库 `ai_usage_ledger` 里恰好 `queries` 行且 `user_used` / `plan_flow_used` 不增加；同一 prefix 重跑不新增行 | `plan-search-service-postgres` 测试（测试库账本）；内存账本版本同断言 |
| SC-R34-04 | 退化：某条查询 fetch 抛错或超 10 s → 该条 `failed+1`、不重试、其余继续，`status: "partial"`；全部失败 → `status: "unavailable"`、`sources: []`；`createDisabledPlanSearch()` 直接 `unavailable`、不记账；`createMockPlanSearch()` 按目标返回固定 2–4 条 | `plan-search-service` 测试（假 provider 超时 / 抛错 / 全败）；测试里真实网络调用 0 次（`fetch` 注入计数断言） |
| SC-R34-05 | `tavily.ts` 适配器：请求体字段固定（`search_depth: basic`、`max_results: 3`、`include_answer: false`）、`Authorization` 头带 key、10 s `AbortController`；响应只取 `title / url / content / score`，缺字段的条目丢弃；`configuredPlanSearch(env)`：`ORBIT_PLAN_SEARCH=tavily` 且有 `TAVILY_API_KEY` 且有 live 账本 → tavily，否则 disabled | `plan-search-tavily` 测试（假 fetch 捕获请求体与头）；factory 三种环境断言 |

## 一次 Generator 的执行顺序

1. 复核进入条件，保存基线 SHA 与本文件 SHA256；`git status --short` 确认 R35 的文件不在白名单。
2. 对「关键符号」impact 登记；UNKNOWN 文本确认。
3. **先提交 `types.ts`（接口约定）作为第一条操作链**，让 R35 能尽早对照；再按 SC-01 → 02 → 05 → 03 → 04 RED → 最小实现 → 定向 GREEN；每个 SC 一条操作链提交。
4. 收口：改动测试所在完整文件；`npx tsc --noEmit -p .`；H 档本地代码收口跑一次 `npm test` 对照基线（R33 REPORT 的基线做法：失败清单不新增）。
5. `detect-changes --scope all`（`partial / truncated` 视为未检查，重跑）；写 REPORT；交接给主会话（`configuredPlanSearch` 的注入位置：`flow-factory.ts` 的 `createPlanFlowService({ search })`，由主会话在 R35 落地后加一行）。

## 最小测试与检查

- 档位 H：外部付费调用、账本。
- 开发定向集：`tests/plans/plan-search-*.test.ts`。
- 操作链收口集：上述文件整文件 + `tests/capabilities/ai-usage-plan-v3-purposes-postgres.test.ts` + `tests/capabilities/ai-usage-ledger-postgres.test.ts`；`npx tsc --noEmit -p .`。
- 集成触发：本地代码收口一次 `npm test`，按 RULES 5.2 对照基线。
- 不运行：浏览器与模拟器；真实 Tavily / DeepSeek 调用（0 次）；生产迁移；App 仓库（契约不变）。

## 失败与交接

进入条件缺项不启动。REPORT 含 SC 映射、各操作链 SHA、impact 结果、命令与退出码、未完成项；交接列出给主会话（注入一行的位置与写法、环境变量名、Tavily 注册后本机验证的命令）、给 R38（真实调用验证脚本与 token / 次数登记方式）。
