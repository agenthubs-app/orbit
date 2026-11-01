# Sprint R34 — 执行总结

## 结果

对应 [GOAL.md](GOAL.md)。界面没有改动；全部是新模块 `repos/orbits/features/plans/search/*` 与测试，没有接进起草流程（主会话合流时注入）。

- 已验证能做到：
  - `planSearchQueries(input)` 对 6 种目标 × 3 语各生成 ≤8 条查询，顺序 点名(≤3) → 门槛(≤3) → 市场(≤2)，每条带 `kind` / `query`；查询只由模板固定词 + 目标原文 + 第一个行业标签组成，`premise` / `purpose` 的自由文本（含联系人与本人姓名）一律不进查询；目标原文为空 → 0 条（SC-01）。
  - `filterSearchResults(raw, { now })` 去掉非 https、社交平台个人页（x / twitter / facebook / instagram / threads 整站、linkedin `/in/`、note.com 用户页）、广告 / 追踪页（`utm_*`、`gclid` / `fbclid`、affiliate 参数、`ad` / `ads` / `affiliate` / `sponsored` / `promo` 路径段、`ad.` / `ads.` 子域）；同 host 只留分数最高一条（按完整 host，`meti.go.jp` 与 `jpo.go.jp` 各留）；`snippet` ≤300 字；每条带 `fetchedAt`（ISO）与 `query`，不带 `id`（SC-02）。
  - `createPlanSearchService({ provider, ledger, limit })` 对一份计划：每条查询 reserve（`plan_search` / user / `plan`、幂等键 `${prefix}#search-${n}`）→ beginCall（provider `tavily`、model `search:basic`）→ endCall → finish；真实 PostgreSQL 账本里恰好 `queries` 行、每行一条子账，`user_used` / `plan_flow_used` 为 0；同一 prefix 重跑不新增行（SC-03）。
  - 退化：某条查询抛错 / 超时 → 该条 `failed+1`、不重试、其余继续、`status: "partial"`；全部失败或账本拒绝 → `unavailable`、`sources: []`；`createDisabledPlanSearch()` 直接 `unavailable` 不记账不联网；`createMockPlanSearch()` 按目标返回固定 2–4 条（公共机构公开页，三语标题 / 摘要）；调用方永不收到异常（SC-04）。
  - `createTavilySearchProvider` 请求体固定 `{ query, search_depth: "basic", max_results: 3, include_answer: false }`、`Authorization: Bearer`、10 s `AbortController`（外部 signal 也能中止）、只取 `title / url / content / score`、缺字段条目丢弃、任何失败一个带 code 的 `TavilySearchError` 且不重试；`configuredPlanSearch(env)`：`ORBIT_PLAN_SEARCH=tavily` + `TAVILY_API_KEY` + live 账本 → tavily，否则 disabled（SC-05）。
  - 测试里真实网络调用 0 次：所有 HTTP 走注入的 `fetch`（计数断言），mock / disabled 不碰 fetch；`api.tavily.com` 不在 `scripts/test-paid-ai-boundary.mjs` 的拦截名单里（`scripts/` 不在本 Sprint 白名单，见交接）。
- 仍未实现或未验证：
  - 没有接进起草流程：`flow-factory.ts` / `flow-service.ts` 没动（R35 在改），注入一行由主会话合流时加（见交接）。
  - 真实 Tavily 调用 0 次（D-2 用户尚未注册 key）；查询模板的召回质量、Tavily 对日文查询的表现没有真实数据，留给 R38 的验证脚本。
  - 查询里没有用 `premise` 的地名 / 行业词（PLANNER 写的是「可以用」）：为了杜绝姓名泄露选择一律不注入，见「模糊点的选择」。

## 运行记录

- 结果：completed（本地代码收口；不涉及部署 / 生产迁移）
- Generator：Claude Fable 5.1（side session r34）／2026-11-01；Planner revision 1，PLANNER.md SHA256 前 16 位 `b31700e0dbf941a3`
- 分支：直接在 `chat-agent` 按路径提交（基线 `9eb2d23ef`，2026-11-01）；功能 SHA 见「验收结果」；未 push。R35 并行在同一工作区（其提交 `b790007dd` 落在本 Sprint 两条提交之间；其未提交改动 `features/plans/v2/**`、`tests/plans/{draft-flow,flow-fixture,flow-review-fixes,v2-service}.test.ts`、`tests/capabilities/plans-v2-flow-postgres.test.ts` 未带进任何 R34 提交，每次提交前 `git diff --cached --stat` 核对）
- 档位 H；全量对照见下「全量测试对照」
- 付费 AI / 外部调用：0 次（Tavily、DeepSeek 都没有真实调用）
- impact（开工时，索引为 R33 之前的状态）：
  - `AiQuotaGate` CRITICAL（210 上游，接口）：只读取、只多一个实现方调用它，接口不改。
  - `AI_QUOTA_MAX_CALLS` / `AI_QUOTA_PURPOSE_POOLS` UNKNOWN、`PLAN_SEARCH_PER_PLAN_LIMIT` 索引里没有符号 → 文本确认读取方：`constants.ts`、`ledger.ts`、`plans/v2/ai/deepseek.ts`、`tests/capabilities/ai-usage-plan-v3-purposes-postgres.test.ts` 等 9 个文件，全部只读，本 Sprint 不改这些常量。
- `detect-changes`：`--scope all` 跑在含 R35 未提交改动的工作区（7 文件 32 符号、critical，全部是 R35 的 `flow-service.ts` 等；非 partial / truncated）；本 Sprint 自己的文件全部是新文件，staged 检查报「no indexed symbols overlap」。重建索引后的 `--scope compare` 见下。证据：`~/orbit-sprint-evidence/web/sprint-R34/run-01/detect-changes-*.txt`。

### 全量测试对照（RULES 5.2）

基线 = R33 run-01 在原路径跑出的 HEAD 全量（`022e8841d`，`~/orbit-sprint-evidence/web/sprint-R33/run-01/npm-test-head.txt`；`022e8841d..9eb2d23ef` 只有文档改动，所以它就是本 Sprint 开工前的失败清单，且没有 R33 报告里 scratchpad 副本的路径依赖噪音）。本次 = `387fbe915` 工作区（含 R35 未提交改动）`npm test`，两边同样带 `ORBIT_EVENT_DATABASE_URL`（本机回环库），不 source `.env`。

| 运行 | tests | pass | fail | skipped |
| --- | --- | --- | --- | --- |
| 基线（R33 HEAD） | 8081 | 7481 | 29 | 571 |
| 本次（R34 HEAD + R35 工作区） | 8115 | 7515 | 29 | 571 |

失败清单对照（去掉用时后缀再 `comm`）：
- 新增 3 个：`tests/plans/plan-mock-design-c.test.ts`「C: mock review fix for the design sample」「the 青葉ベンチャーズ sample gives two changes…」、`tests/capabilities/plans-v2-flow-postgres.test.ts`「R25 review M1: two failed and one successful send…」。这两个文件及其依赖 `features/plans/v2/ai/mock.ts`、`flow-service.ts` 都在 R35 的未提交改动里，不 import `features/plans/search/**`。把 `387fbe915` 用 `git archive` 导出到 scratchpad（symlink `node_modules`）单独重跑这两个文件：9 用例 9 通过（`head-clean-two-files.txt`）→ 三个失败全部来自 R35 的工作区改动，与 R34 无关。
- 消失 2 个（基线有、本次没有）：`event-registration-plan-sync`「a failing plan sync never changes…」、`plan-review-screens`「review entry: 3 cells…」——R33 报告已记为全量负载下的 30 s 超时抖动。
- 其余 26 个与基线逐字相同。
- `paid-ai-boundary` 拦截 0 次；6 个 `plan-search-*` 测试文件 20 用例全部通过，PostgreSQL 用例没有被 skip（`ℹ skipped` 两边都是 571）。

日志：`~/orbit-sprint-evidence/web/sprint-R34/run-01/npm-test-head.txt`、`head-failures.txt`、`baseline-failures-r33-head.txt`。

重建索引（`analyze --index-only`，+17 文件）后：`detect-changes --scope compare --base-ref 9eb2d23ef` = 31 文件 11 符号、risk low、0 affected processes、非 partial / truncated（含 R35 的 `b790007dd` 与工作区文件，如 `search-port.ts` 的 `PlanSearchLike`）；`--scope all` = No changes detected。

## 验收结果

| SC | pass / fail / blocked | 证据（测试文件或场景） | commit |
| --- | --- | --- | --- |
| 接口 | pass | `features/plans/search/types.ts` 与两份 PLANNER 的「接口」逐字段一致；`npx tsc --noEmit -p .` 退出码 0 | `a23442428` |
| SC-R34-01 | pass | `tests/plans/plan-search-queries.test.ts`（4 通过：6 种 × 3 语 36 组条数 / 顺序 / 上限 / 占位符 / 含目标或行业 / 不含人名与 premise 文本 / 不重复；三语不同；无行业时含目标；空目标 0 条） | `2a65cfd34` |
| SC-R34-02 | pass | `tests/plans/plan-search-filter.test.ts`（4 通过：21 条夹具只剩 5 条合规；同 host 去重与 `go.jp` 不同机构各留；300 字截断；空输入） | `bf54c58f1` |
| SC-R34-03 | pass | `tests/plans/plan-search-service-postgres.test.ts`（真实 PostgreSQL、随机 schema，1 通过未 skip：8 行 `plan_search` / user / plan / 幂等键；8 条子账 provider `tavily`；user / planFlow = 0；重跑不新增行）；内存账本同断言在 `tests/plans/plan-search-service.test.ts`「happy path」 | `00b574edb` |
| SC-R34-04 | pass | `tests/plans/plan-search-service.test.ts`（7 通过：partial 不重试 / unavailable / 账本拒绝与 beginCall 抛错仍 finish / 空目标 / 真适配器 + 注入 fetch 的超时 / disabled 与 mock 6 种目标 2–4 条） | `62c394fb8` |
| SC-R34-05 | pass | `tests/plans/plan-search-tavily.test.ts`（3 通过：请求体与头、四字段与丢弃、超时 AbortController、外部 signal、连接失败 / 401 / 不可读 / 无 results 各一个错误且不重试）；`tests/plans/plan-search-factory.test.ts`（1 通过：开关关 / 无 key / 无账本 / 齐全 四种环境） | `77440cc04`（适配器）、`387fbe915`（factory） |

`npx tsc --noEmit -p .` 在收口时退出码 0（含 R35 的工作区改动）。

## 假设与额外阅读

- 额外阅读（上下文包之外）：`tests/support/plan-ai-fixture.ts`（`MemoryAiLedger`，内存账本测试复用）、`tests/support/plan-matching-harness.ts`（`databaseTest` / `assertLoopbackDatabaseUrl`）、`features/network-analysis/migrations.ts`（`ai_usage_calls` 列）、`shared/domain/industries.ts`（`industryLabel`）、`scripts/test-paid-ai-boundary.mjs`（确认 Tavily 不在拦截名单）。
- 新增文件（全部在 PLANNER 白名单内）：`features/plans/search/{types,queries,filter,tavily,service,mock,disabled,factory}.ts`、`tests/plans/plan-search-{queries,filter,tavily,service,service-postgres,factory}.test.ts`。修改：无。
- 模糊点的选择：
  - **premise / purpose 不进查询。** PLANNER 说模板「可以用答案里的地名 / 行业词」，但 `team` / 自由回答里常有联系人与本人姓名，没有可靠的去名手段；选择一律不注入，查询 = 模板固定词 + `goalText`（≤60 字）+ 第一个行业标签。代价：少了地名定位（可在 R38 看真实召回后决定是否加一个白名单式的地区词）。
  - **查询之间并发执行**（`Promise.all`）：串行最坏 8 × 10 s = 80 s，起草方等不起；账本幂等键各不相同，并发安全。代价：供应商限速时 8 条同时打出。
  - **同一 prefix 重跑**：已结清（succeeded / failed）的操作按账本语义回放 `owner: false`，本服务不再发请求、该条计失败（不能发一条账本里没有子账的 HTTP）；只有无响应而 released 的查询（超时 / 连接失败）按账本既有语义重开同一行再搜一次（不新增行）。全部回放 → `unavailable`。
  - **账本子账的 `model`** 固定 `search:basic`（账本要求非空；对应 `search_depth`），provider 取供应商名 `tavily`。有响应的调用 token 记 0 / 0（搜索没有 token），无响应记 null → 该操作 released（不计次、不记失败）。
  - **「广告页」启发式**只按路径段整词、`ad.` / `ads.` 子域、追踪 / 联盟参数判定，不做子串匹配（`adachi.tokyo.jp`、`/download/` 不能误杀）。
  - **note.com 个人页** = 路径只有一段（`note.com/<user>`）；文章页（`/<user>/n/<id>`）保留。linkedin 只拦 `/in/`，公司页保留。
  - mock 来源的 `query` 取真实模板生成的前 N 条查询词、`fetchedAt = context.now`，形状与 live 一致；live 下没配置一律 disabled，绝不用 mock。
  - 过程偏差：`tavily.ts` 的测试与实现同一批写出，没有先看它红（queries / filter / service 三个都先看了 RED）。

## 交接

- 给主会话（R35 落地后合流时加一行）：
  - 注入位置：`repos/orbits/features/plans/v2/flow-factory.ts` 的 `resolvePlanFlowService` → `createPlanFlowService({ …, search: live ? configuredPlanSearch() : createMockPlanSearch() })`，import：
    ```ts
    import { configuredPlanSearch } from "../search/factory";
    import { createMockPlanSearch } from "../search/mock";
    ```
    `createPlanFlowService` 的 `search?: PlanSearch` 参数由 R35 定义（`features/plans/v2/search-port.ts` 已在 R35 工作区出现）；调用时 `search.search({ goalKind, goalText, purpose, premise, industries, language }, { actorId, ledgerKeyPrefix: <该次起草的账本键前缀>, now })`，结果 `sources`（不带 `id`）由服务层编 `S<n>` 后并进 `FirstDraftInputV3.sources`；`status !== "ok"` 时 `risks` 多一条「本次未能联网核实」（DESIGN §3.2）。
  - 环境变量：`ORBIT_PLAN_SEARCH=tavily`（开关，默认关 = disabled）、`TAVILY_API_KEY`（D-2 用户注册后放本机 `.env.local` 与生产环境变量；生产变量按既有规矩停在授权前）。
  - Tavily 注册后本机验证（不在测试里跑）：
    ```bash
    ORBIT_PLAN_SEARCH=tavily TAVILY_API_KEY=<key> npx tsx -e 'import { createTavilySearchProvider } from "./features/plans/search/tavily"; createTavilySearchProvider({ apiKey: process.env.TAVILY_API_KEY! }).search("飲食・食品 市場規模 統計", {}).then((r) => console.log(JSON.stringify(r, null, 2)));'
    ```
    每次真实调用在 REPORT 登记次数（Tavily 免费档 1000 次 / 月，无 token 概念）。
  - 可选（不在本 Sprint 白名单）：把 `api.tavily.com` 加进 `scripts/test-paid-ai-boundary.mjs` 的 `PAID_AI_HOSTS`，让漏注入 fetch 的测试也被拦下。
- 给 R38（真实调用验证）：
  - 验证脚本建议：对三份计划（fundraising / sales / launch）各跑一次 `createPlanSearchService({ provider: createTavilySearchProvider({ apiKey }), ledger: <本机 live 账本> })`，登记 `queries / failed / sources.length`、每条 `url` 与被过滤掉的条数（`rejectSearchUrl` 导出可直接统计原因）；次数上限 3 × 8 = 24 次。
  - 看真实召回后再决定：是否给模板加地区词、是否把 `TAVILY_MAX_RESULTS` 调到 5、`PLAN_SEARCH_GOAL_TEXT_MAX`（60 字）是否合适。
- 需要用户授权：生产环境变量 `TAVILY_API_KEY` / `ORBIT_PLAN_SEARCH`、部署、push。
