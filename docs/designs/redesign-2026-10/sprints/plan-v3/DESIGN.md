# 计划初稿 v3 实施方案（R33–R38）

**版本 1（2026-11-01，方案阶段，未改代码）。** 设计稿已定稿：[`plan-draft-v5-proposal.html`](../../plan-draft-v5-proposal.html)（页面标 v16，顶栏「字段表」页是字段契约）。本文说清这次改什么、建在 v2.2 的哪些东西上、拆成哪几个 Sprint、每个 Sprint 的边界和验收、哪些事要用户授权。各 Sprint 的 `GOAL.md` / `PLANNER.md` 在本文批准后再写，不重复本文。

依据与约束（都已定，不再讨论）：
- grill 定稿（2026-10-31）：行动为主、分析只作依据；骨架固定、AI 从固定区块里挑；结论必须带可点来源，无来源只进「待核实」；联网搜索优先级 点名 > 规则门槛 > 市场数据。
- 设计稿迭代中定下的规则（v7–v16）：建议口吻；每件事写理由；分数有说明；初稿页只看和调、确认后才有计划主页；结论→阶段→行动→人→证据一条链对齐；结果在前、分数退后；不猜动机；来源有清单；只用 Orbit 现有数据，没有的不编；没记录的行不显示；备注全量看、按相关性挑、AI 只措辞、输出逐句对账。
- 引荐系统还没做：涉及引荐的内容全部待定，本期不做。
- v2.2 的既有决定继续有效：AI 只提议用户决定；处处有据；不编造；不代发；示例数据不写库；契约只加不改（`BREAKING.md` 例外）。

## 1. 改什么、不改什么

### 1.1 v2.2 已有、这次直接复用

| v2.2 已有 | 这次怎么用 |
| --- | --- |
| 定目标 → 背景确认 → ≤5 问 → 初版 → AI 修正 ≤3 → 手动编辑 → 确定 的流程（`PlanFlowScreen`、`flow-service.ts`） | 流程不变，只换「初版」这一步的内容和画面（R35、R36） |
| `PlanV2Step`：`title` / `doneCriteria` / `why` / `personTypeKeys` | 就是设计稿的「阶段」和「完成标志」，不加字段 |
| `PlanV2TypeItem`：`shortLabel` / `roleSituation` / `allocation` / `targetCount` / `personType.{why, questions, recognizeHints}` | 就是「要认识这几类人」一行；分量、人数、3 问都在 |
| `PlanV2Analysis`：`diagnosis` / `conclusion` / `citations` / `allocationReasons` / `basis` | 保留；新内容以 `schemaVersion: 3` 追加字段（§2） |
| 业界现状库 `features/plans/landscape`（14 条，`{id, version}` 引用） | 保留为来源类型之一；网页来源是新类型（§2.3） |
| memo 抽取 `features/contacts/memo-extraction`（offering / seeking / topics / eventTypes） | 准备卡的事实来源；要改成累积、切段（R33） |
| AI 配额 `features/ai-quota`（`plan_background` / `plan_draft` / `plan_revise` / `plan_review`，用户池每日 15 次） | 新增 `plan_prep`、`plan_search` 两个用途（R33 迁移） |
| 计划主页（`PlanOverview` 等）的分数、空位、记录加分 | 保留；头部改成「阶段在前、分数退后」，加勾选清单与准备卡（R37） |

### 1.2 这次新增

1. **初版内容 v3**：目标结果、理由段（引用回答与来源）、判定 + 信心、顺序理由、对比条、关键数字、风险 / 待核实、来源清单。
2. **联网搜索**：起草前按「点名 > 规则门槛 > 市场数据」搜 ≤8 次，结果进来源清单；网页来源存 url + 标题 + 抓取时间 + 片段。
3. **初稿页**：按设计稿重做：结论区、路线（含完成标志）、按阶段分组的可调类型表（删 / 人数 / 分量 / 合计 100 才能确定）、依据区。
4. **准备卡**：确认计划时对「先做的事」逐件生成：用到的事实、切入点、为什么这样开口、开场白草稿（画线片段逐一对账）、缺什么提示。
5. **事实层**：联系人事实累积表（来源备注 id + 日期），超长备注切段抽取，备注页手动加事实。
6. **计划主页**：目标结果 + 当前阶段在前；勾选清单（1–3 件，系统候选、AI 只给编号）；准备卡展开；「资料有更新」标记。

### 1.3 明确不做

- 引荐（请谁介绍、暖度标签、先问对方是否愿意）：等引荐系统。
- 用户资料新增「学校」「以前的公司」字段。
- 「他最近」（对方的公开动态）：联网搜索只搜计划层面的事实，不搜个人。
- 付费、配额上调。

两端同步（用户 2026-11-01 决定，推翻方案版本 1 的「只做 Web」）：App 的初稿页与计划主页和 Web 同一期做完，契约经 `npm run sync:contract` 同步；App 的像素基准是设计稿原型的「手机」视图（390 宽）。

## 2. 数据与契约（只加不改）

### 2.1 `PlanV2Analysis` → `schemaVersion: 3`

```ts
interface PlanV2AnalysisV3 extends PlanV2Analysis {
  schemaVersion: 3;
  outcome: string;                       // 目标的结果，≤20 字
  summary: PlanMarkedText;               // 理由段：3–4 句 ≤150 字，带加粗与引用
  verdict: "feasible" | "conditional" | "not_recommended";
  confidence: { level: "high" | "mid" | "low"; reason: string };   // reason ≤60 字
  orderReasons: PlanCitedLine[];         // 为什么是这个顺序，2–3 条
  comparison: {                          // 对比条
    title: string; funnel: string;       // 「先找哪类投资人」「7 类按…筛出 5 类」
    rows: Array<{ label: string; score: number; verdict: "preferred" | "possible" | "not_recommended"; sourceIds: string[] }>;
  } | null;
  keyNumbers: Array<{ value: string; label: string; sourceIds: string[] }>;   // 0–3
  risks: Array<{ kind: "risk" | "unverified"; text: string }>;                // 0–3
  sources: PlanSource[];                 // 来源清单，编号 = 数组下标 + 1
}
interface PlanMarkedText { text: string; marks: Array<{ start: number; end: number }>; refs: Array<{ start: number; end: number; ref: PlanRef }> }
interface PlanCitedLine { text: string; sourceIds: string[] }
type PlanRef = { kind: "answer"; questionKey: string } | { kind: "source"; sourceId: string };
```

- `schemaVersion: 2` 的旧计划照旧读；读模型遇到 2 时新字段为空、页面退回 v2.2 的画面（不自动重写，沿用 D44）。
- `PlanV2TypeItem` 加可选 `stepKey`（属于哪个阶段；v2.2 的 `Step.personTypeKeys` 反向已有，这里只是冗余便于分组，写入时两边一致）。

### 2.2 校验（`checkDraftV3`，在 `features/plans/v2/ai/schemas.ts` 旁新增）

全部按字段表的上限，并加四条硬规则：
1. `summary.marks` 每句 ≤1 处、≤14 字，且是原文子串；`refs` 指向的 `sourceId` 必须在 `sources` 里，`questionKey` 必须在本次回答里。不满足：去掉该标记 / 删该句。
2. `comparison.rows[].sourceIds`、`keyNumbers[].sourceIds`、`orderReasons[].sourceIds` 都非空且存在；没有来源的行移到 `risks`（`kind: "unverified"`）。
3. 分量顺序与对比条判定一致（`not_recommended` ≤ `possible` ≤ `preferred` 对应类型的 `allocation`）；合计 + `eventAllocation` = 100。不满足自动修正一次（按判定重排并按 5 取整），仍不满足 → 退回「没能起草」。
4. `verdict` / `confidence.level` 枚举；`steps` 2–4 个且每个 `doneCriteria` 非空；`personTypes` 3–6 类且每类 `stepKey` 存在。

### 2.3 来源与网页引用

```ts
type PlanSource =
  | { id: string; kind: "landscape"; landscapeId: string; version: number }
  | { id: string; kind: "web"; url: string; title: string; fetchedAt: string; snippet: string; query: string };
```

- 网页来源只存上面这些，不存全文；`snippet` ≤300 字。
- 过期复核：来源清单显示抓取日期；超过 180 天的在依据区标「可能已更新」，不自动重搜。

### 2.4 事实层（联系人）

新集合 `contact_facts`（和现有 `memo_extractions` 一样走 record store 集合，按 workspace / actor 作用域，不建 SQL 表、不走 SQL 迁移）：

| 列 | 说明 |
| --- | --- |
| id, contactId | |
| field | `offering` / `seeking` / `topic` / `event` / `manual` |
| text | ≤40 字（`manual` ≤80 字） |
| memoId, memoDate | 来源备注；`manual` 时 memoId 为空 |
| firstSeenAt, lastSeenAt | 合并时更新 |
| normalized | 去空白小写，用于合并 |

- 抽取作业写入时**追加**到 `contact_facts`，同时照旧更新联系人的 offering / seeking / topics（现有消费者不变）。
- 超过 `MEMO_EXTRACTION_LIMITS.memoChars`（2000）的备注按段落切到 ≤2000 字分别抽，结果合并；每段一次调用，走后台池配额。
- 备注详情页加「补一条事实」入口（`field: "manual"`）。

### 2.5 准备卡

```ts
interface PlanPrepCard {
  planId: string; actionKey: string;       // 对应「先做的事」一件
  usedFacts: string[];                      // contact_facts.id
  usedAnswers: string[];                    // questionKey
  hook: { label: string; reason: string };  // ≤12 字 / ≤60 字
  draft: PlanMarkedText;                    // ≤160 字；每个 ref 指向 usedFacts 或 usedAnswers
  gaps: Array<"memo" | "interaction">;      // 底部「可以补充」
  generatedAt: string; staleSince: string | null;   // 「资料有更新」
  fallback: boolean;                        // 校验不过退回通用模板
}
```

存在 `plan_items.meta.prep`（事件类也是一个 item）。`draft.refs` 每个都要能对上 `usedFacts` / `usedAnswers`，对不上的句子删；整段删空 → `fallback: true`，用固定模板「说清你是谁 + 很小的请求」。

### 2.6 AI 用途与配额（迁移 v8）

| 用途 | 池 | 触发 | 限额 |
| --- | --- | --- | --- |
| `plan_search` | user | 起草时自动 | 每份计划 ≤8 次搜索（不计入 15 次 AI 调用，单独记在 `ai_usage_ledger`，provider = tavily） |
| `plan_prep` | user | 确定计划时自动；「资料有更新」后用户点重生成 | 每份计划初次 ≤4 件；重生成计入每日 15 次 |

`ai_usage_ledger.purpose` 的 check 约束加这两个值（同 v5–v7 的做法）。

## 3. AI 调用的规矩

### 3.1 起草（替换现有 `firstDraft`）

输入在 v2.2 基础上加：搜索结果（≤8 条，每条 url / 标题 / 片段）、业界现状库条目、回答的 `questionKey` 列表、固定的 6 种区块说明。输出 `DraftOutputV3`，经 `checkDraftV3`。提示词要点：
- 只能引用输入里的来源和回答；没有来源的判断只能写进 `risks`。
- 先写 `outcome` 和 `conclusion`，再写 `summary`；`summary` 的每个外部事实必须带 `sourceId`。
- `steps` 的 `doneCriteria` 写成可观察的结果。
- 分量按 `comparison` 的判定排。
- 人物类型的 `questions` 恰好 3 条。

### 3.2 搜索（起草前）

- 规划：由规则不是 AI 决定搜什么。按目标类型的模板生成 ≤8 条查询，顺序 点名（具体机构 / 活动 / 名单）→ 规则门槛（制度、资格、流程）→ 市场数据（统计）。模板写在 `features/plans/search/queries.ts`，按 6 种目标类型各一组。
- 执行：Tavily `search`（`search_depth: basic`，`max_results: 3`，日本站点优先），10 s 超时，失败不重试；全部失败 → 起草照常进行，依据区只有业界现状库，`risks` 多一条「本次未能联网核实」。
- 过滤：去掉非 https、社交平台个人页、明显广告页；同域去重。

### 3.3 准备卡（确定计划时）

输入：该联系人的**全部** `contact_facts`（通常 5–30 条）+ 名片字段 + 怎么认识 + 上次联系 + 你的资料 + 本次回答 + 目标 + 人物类型；活动类：活动页字段。单人输入 >2 万字先调一次「压缩成事实清单」。
输出：`{ hook, hookReason, usedFacts, usedAnswers, draft }`，经 §2.5 对账。
共同点不交给 AI：规则比对你的资料（来自 / 语言 / 行业）与名片字段、事实文本里的地名 / 公司 / 行业词。

### 3.4 mock 与 disabled

`features/plans/v2/ai/mock.ts` 补 v3 的固定输出（三种目标各一份，取自设计稿示例数据）；`disabled.ts` 返回「没能起草」照旧。测试全部走 mock，真调用只在 REPORT 登记。

## 4. Sprint 拆分

| Sprint | 档 | 内容 | 依赖 | 主要文件 |
| --- | --- | --- | --- | --- |
| **R33 数据与契约** | H | §2 全部：`schemaVersion: 3` 类型与读写、`PlanSource`、`contact_facts` 表与累积写入、切段抽取、手动加事实、迁移 v8、契约快照只加不改检查 | 无 | `shared/contract/plan-v2.ts`、`features/plans/v2/{types,repository,service}.ts`、`features/contacts/memo-extraction/*`、`features/network-analysis/migrations.ts`、`features/ai-quota/constants.ts` |
| **R34 联网搜索** | H（外部调用） | §3.2：Tavily 适配器、查询模板、过滤、记账、失败退化；来源清单落库 | R33 | 新 `features/plans/search/*`、`features/ai-quota/*` |
| **R35 起草 AI v3** | H（付费 AI） | §3.1 + §2.2：提示词、`checkDraftV3`、自动修正、mock；`flow-service` 的初版步骤改产出 v3 | R33、R34 | `features/plans/v2/ai/{prompts,schemas,deepseek,mock}.ts`、`flow-service.ts` |
| **R36a 初稿页 Web** | L | 设计稿初稿页：结论区（含「用到的你的信息」）、路线 + 完成标志、按阶段分组的可调类型表、依据区；确定按钮受合计 100 约束；v2 旧计划退回旧画面 | R35 | `app/(app)/app/orbit-2026/plan/{DraftCard,PlanFlowScreen,PlanManualEditScreen}.tsx`、CSS Modules |
| **R36b 初稿页 App** | L | 同 R36a，按原型「手机」视图；契约副本经 `sync:contract` | R35 | `repos/orbit-app/src/screens/plan/{PlanFlowScreen,plan-flow-kit,PlanManualEditScreen}.tsx`、`app/plans/flow/[intakeId].tsx` |
| **R37a 准备卡服务与 Web 主页** | H（付费 AI） | §3.3 + §2.5：确定时生成准备卡、对账、通用模板；Web 主页头部改「阶段在前」、勾选清单（系统候选 + AI 编号）、准备卡展开、「可以补充」、「资料有更新」 | R33、R35、R36a | `features/plans/v2/{service,flow-service}.ts`、新 `features/plans/prep/*`、`app/(app)/app/orbit-2026/plan/{PlanOverview*,…}.tsx` |
| **R37b App 主页** | L | App 计划主页同 R37a 的界面部分（服务端已由 R37a 提供） | R37a、R36b | `repos/orbit-app/src/screens/plan/{PlanOverview,plan-overview-ui}.tsx` |
| **R38 收口** | I | 全量测试对照基线（两端）；像素门禁（§6 D-4，Web 三宽度 + App 模拟器）；三种目标的真调用各 1 次并登记；文档与 DEFERRED 登记；停在部署 / TestFlight 前 | R33–R37b | — |

顺序：R33 → R34 ∥ R35（R35 可先用 mock 搜索结果开工）→ R36a ∥ R36b → R37a → R37b → R38。并行的两条线文件不重叠（Web 与 App 各自仓库）。

## 5. 各 Sprint 的验收要点（SC 草案，PLANNER 时定稿）

- **R33**：v2 行照常读写；v3 行往返不丢字段；`contact_facts` 对同一文本只有一行且 `lastSeenAt` 更新；2000 字以上备注切段后事实并集 ≥ 单段；契约快照 diff 只有新增；迁移 v8 在测试库前进后退各一次。
- **R34**：查询模板覆盖 6 种目标各 ≤8 条；Tavily 超时 / 失败时起草继续且 `risks` 有记录；同域去重；每次搜索记一行 ledger；测试中真实网络调用 0。
- **R35**：mock 下三种目标各产出能过 `checkDraftV3` 的草稿；注入「无来源的句子」「加粗非子串」「分量与判定相反」「引用不存在的来源号」四种坏输出，分别被删句 / 去标记 / 修正一次 / 删句；修正两次仍坏 → 「没能起草」。
- **R36a / R36b**：三种目标 Web 1440 / 1024 / 390 × 浅深渲染，App 模拟器浅深；删一类 / 调人数 / 调分量后合计实时正确，≠100 时按钮禁用；初稿页无勾选框、无准备卡；`schemaVersion: 2` 的计划进入初稿步骤仍显示旧画面；页面不闪动规则。
- **R37a / R37b**：确定时生成 ≤4 张准备卡；两端主页同一数据同一画面；注入「引用不存在 factId」「画线片段不在事实里」→ 该句删；整段删空 → 通用模板；没有记录的行不渲染且 `gaps` 正确；新增备注后 `staleSince` 置位、主页显示标记；重生成计入每日限额。
- **R38**：`npm test` 失败清单不新增；像素门禁按 D-4；REPORT 记真调用次数与 token。

## 6. 需要用户决定或授权

| 编号 | 事项 | 推荐 |
| --- | --- | --- |
| D-1 | 初稿页的删 / 调人数 / 调分量，和 v2.2「手动编辑 1 次」的关系 | **初稿页上的调整不限次数、不占「手动编辑」**（它不调 AI，对标 Linear / Notion 接受提案前随便改）；「手动编辑 1 次」保留给确定后的主页 |
| D-2 | Tavily 账号与 key | 用户注册（免费档 1000 次 / 月，不绑卡），key 放本机 `.env.local` 与生产环境变量；按 §2.6 每份计划 ≤8 次，1000 次约够 120 份计划 / 月 |
| D-3 | memo 抽取在生产是否已开（代码里走配额门禁，W0046 时真调用 0 次） | R33 开工前由主会话查生产 ledger 确认；没开则和 R37 一起打开 |
| D-4 | 像素门禁的基准 | 设计稿是 HTML 原型不是画板：**以 `plan-draft-v5-proposal.html` 在 1440 / 1024 / 390 的截图为基准**，归因规则同 RD-29 |
| D-5 | 搜索预算 | 每份计划 ≤8 次（点名 3、门槛 3、市场 2） |
| D-6 | 端 | ~~本期只做 Web~~ → **用户 2026-11-01 定：两端同步**，App 的初稿页与主页由 R36b / R37b 同期做；App 像素基准 = 原型「手机」视图 390 宽，模拟器截图比对（RD-16） |
| 授权项 | 生产迁移 v8、生产环境变量 `TAVILY_API_KEY`、部署、TestFlight | 按既有规矩，R38 停在部署前等授权 |

**用户决定（2026-11-01）：D-1～D-5 全按推荐；D-6 改为两端同步。**

**2026-11-02 补充决定（用户「剩下的做一下」= 按主会话推荐）：**

| # | 问题 | 决定 |
|---|---|---|
| D-3 结论 | memo 抽取在生产是否已开 | **已开**：生产 Vercel 有 `DEEPSEEK_API_KEY`，`runConfiguredMemoExtraction` 只看密钥 + 配额门禁、没有别的开关，记笔记即触发。生产库 ep-calm-queen 连接器看不到，30 天行数未能直接核对，R38 用真实账号时顺带确认；不需要随 R37 再开 |
| D-7 | 初稿页「重新起草」 | **接接口**（对标 ChatGPT「重新生成」计入用量）：`POST …/drafts/[draftId]/redraft`，占一次 AI 修正、与「让 AI 改 · 剩 N 次」共用上限；复用已有来源不重新搜索；成功换掉初稿（「恢复 AI 初稿」回到新版），未确定的调整作废、有调整先确认；失败不扣次数。R36a / R36b 补做 |
| D-8 | 1024 与深色无设计稿 | 接受：1024 按 1440 流式、深色按 token，只截图留档、不进门禁 |
| D-9 | 页身面包屑行与页头副标题重复 | 照原型保留（RD-16 逐像素） |


## 7. 风险

- 搜索结果质量不稳：靠规则模板和过滤，不靠 AI 选查询；起草提示词只允许引用片段里出现的数字。
- 准备卡成本：每份计划多 ≤4 次 DeepSeek 调用，输入几千字，按量计费可忽略；配额上计入每日 15 次会挤占 AI 修正次数 → 初次生成不计入，只有重生成计入（§2.6）。
- 旧计划：v2 行不升级，页面降级显示；用户点「重新生成」才产生 v3（不占月额度，沿用 D42）。
- 契约快照：只加字段；`BREAKING.md` 不动。
