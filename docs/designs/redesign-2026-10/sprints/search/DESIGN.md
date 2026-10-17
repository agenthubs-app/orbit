# 搜索整体设计（R30）

**版本 1.1（2026-10-17，执行人：小雨（甲）的文档会话；文档阶段，未改代码）。** 按独立复核 [REVIEW.md](../R30-global-search/REVIEW.md) M01–M08、m01–m07、m12、m13 修订，处理记录见 REVIEW 末尾。

本文是 R30「全局搜索」功能 Sprint 的依据，两端都做：

- Web ⌘K 面板本体（分组结果、类型 chip、命中高亮、无结果的「近い条件なら」「ほかの方法」、底部提示与「意味検索」状态）；
- App 全局搜索页（初期 / 結果 / 結果なし）与入口（Task 左上 🔍，交接表 R20-01）；
- 服务端一个全局搜索接口，两端同用；
- 会話数据源与意味検索的能力开关。

**依据**（越往后越权威）：

- **设计稿**（一律 `--extract-board` 单块抽取，不读整个文件）：
  - `b5-me-inbox.html` **#57「⌘K · 名前」、#58「⌘K · 意味検索」、#59「⌘K · 結果なし」、#71「⌘K · 意味検索」（深色）**——这就是交接表写的 W-R07-05 / 06（R07 门禁的视图名，不是 web.html 的画板名；`web.html` 里没有 ⌘K 画板，`01-system.html` ⑬ 只有容器规格）；
  - `b5-me-inbox.html` **#53「① 検索 · 初期」、#54「② 結果 · 名前」、#55「③ 結果 · 意味検索」、#56「④ 結果なし」**（App，phone 390×844，只有浅色）；
  - 参考：`b11-nav-v3.html` #43「④ 会話リスト · 検索」（iOrbit 会話搜索的画法，归 R21）、`b2-events-flow.html` #10「探す · 検索输入中」（R27 已做）、`b12` W-R06-07c「Modal 560 · top」（容器）。
- **旧方案**：R07 做的 ⌘K 只有人脈一组（`CommandPalette.tsx`，调 `/api/search/relationships`，最多 6 条）；像素盘点 W-R07-05 / 06 不通过（PA L256–274）。**以本文为准**。
- **高于本文的**：README「用户决定」与通用规则 11 / 12 / 13；决定表 `maintenance/2026-10-12-decisions.md` §9-1（R30 的由来）、D16（⌘K 去掉隐私说明行）；交接表「R30 搜索」R30-01、U01、R20-01、G12（390 没有 ⌘K）、通用口径 G01–G26；R27 已交付的 `event-search`（[events/DESIGN.md](../events/DESIGN.md) §4.2）。
- **已定的产品口径（不再讨论）**：
  - 搜索只在**本人数据**内：本人的联系人、本人能看名单的活动（规则 A，`features/events/journey/roster-policy.ts`）、本人的会話与收件箱。未登录不可用。
  - ⌘K 的「iOrbit に聞く」只**预填**，不自动发送（R21-07 的右栏示例问题是另一回事）；「邮件止于草稿」不受影响（搜索不发任何东西）。
  - 骨架阶段没有产品内的付费 AI 调用（README 通用规则 6）；本轮也没有付费 AI 配额（主会话 2026-10-17）。

## 1. 为什么要重做，重做成什么样

### 1.1 现状（代码 @ `1deb5d032`，路径相对 `repos/orbits` / `repos/orbit-app`）

| # | 事实 | 位置 |
| --- | --- | --- |
| 1 | Web ⌘K 面板是壳的一部分：`Modal top` 680、标题「検索と iOrbit」、紫描边输入框、只有「人脈」一组（≤6 条）、最后一行「iOrbit に聞く」+ ⌘↵；D16 已去掉隐私说明行 | `app/(app)/app/orbit-2026/shell/CommandPalette.tsx`（140 行）；快捷键在 `Orbit2026Shell.tsx:58`；文案 `orbit-2026/copy/shell.ts:28–39, 58` |
| 2 | 它调的是「关系自然语言搜索」：`POST /api/search/relationships`，规则后端（`backends/basic-rules-backend.ts`），不是 embedding；live 读联系人与连接记录（`live-service.ts`） | `app/api/search/relationships/route.ts`；`features/search/{contract,service,live-service,service-factory}.ts`；`features/search/DESIGN.md` |
| 3 | 联系人列表搜索（人脈页在用，App 端点 `contactsSearch`）：`POST /api/contacts/search`，按 actor / workspace 作用域，在 `search_blob` 上做 `like '%q%'`；字段 = 氏名、役職、会社、所在地、profile_snippet、relationship_context、next_action … | `app/api/contacts/search/handler.ts`；`features/contacts/storage/contact-list-postgres-reader.ts:131–140, 790–800`；App `src/api/endpoints.ts:37, 69` |
| 4 | 活动搜索 `GET /api/events/search?q=&limit=` 已 live（R27）：三组 events / organizers / people；people 只在**我能看名单的**近 20 场 upcoming 活动的公开参加者里找我的联系人；匹配 = NFKC + 小写 + 去空白后 `includes` | 契约 `shared/contract/event-search.ts`；校验 `shared/api-schema/event-search.ts`（`q` 1–100 字、`limit` 1–20 默认 5，`.strict()`）；路由 `app/api/events/search/route.ts` → `features/events/journey/handlers.ts:127`（`auth: "required"`，未登录 401）；实现 `features/events/journey/service.ts:111`、纯函数 `search-core.ts:41`；live 端口 `live.ts:159, 215, 235`；测试 `tests/events/r27-journey-routes.test.ts:36, 63` |
| 5 | 会話：iOrbit 会话列表 `GET /api/ai/conversations/sessions?q=` 在 `id + searchText + customTitle` 上做 `includes`；`searchText` = 会话全部消息正文拼接（截 8000 字，`orbit-agent-chat-session-live-record-provider.ts:197`），所以**标题和正文都能命中**，但返回的是会话摘要（title / lastMessagePreview），**没有命中片段、没有面板要的 `href` 与「{日期} · iOrbit との会話」副标题**；收件箱 `GET /api/inbox/notifications` 没有 `q`。画板要求的「会話」组（✨ iOrbit 会话 + 📧 受信箱邮件，b11 #43「タイトルと中身の両方から探します」）**没有现成接口**，归 R21（iOrbit）/ R13（收件箱）；R21 可以在 sessions 列表的 `q` 上加命中片段，而不是另建索引 | `app/api/ai/conversations/sessions/handler.ts:121–134`；`features/orbit-ai/storage/orbit-agent-chat-session-summary-page.ts:118–126`；`app/api/inbox/notifications/handler.ts:18–21` |
| 6 | 没有 embedding / 向量能力：仓库里所有 `embedding*` 字段都是 `false` 的占位（dashboard、recommendations），没有 pgvector 迁移、没有 embedding provider；生产 AI provider 是 DeepSeek 文本模型，DeepSeek 不提供 embedding 接口 | `features/recommendations/contract.ts:149`；`shared/compute/dashboard-distribution-contract.ts:11`；`features/ai-quota/constants.ts`（用途枚举里没有搜索） |
| 7 | App 没有全局搜索：Task 左上 🔍 `router.push("/contacts/list")`；探す的搜索页是 `DiscoverPage` 里的 RN `<Modal>`（R27，待组件库的「全屏搜索页容器」，DEFERRED-A §1）；最近搜索存 AsyncStorage `orbit.events.recentSearches`（5 条） | `src/screens/task/TaskScreen.tsx:116`；`src/screens/events/v2/DiscoverPage.tsx:25, 288`；`src/screens/events/v2/journey-api.ts:53` |
| 8 | 限流的现成写法：按 actor 每分钟计数（`countUrlFetchesSince` ≥ N → `RATE_LIMITED` → 429） | `features/events/assessment/service.ts:363–365`；`features/events/host/handlers.ts:130` |
| 9 | 契约能力登记：`REDESIGN_CONTRACT_CAPABILITIES` / `REDESIGN_CONTRACT_LIVE_CAPABILITIES`；没有 live 实现的 capability 在 live 返回 503 `NOT_IMPLEMENTED`，界面用 `whenNotImplemented` 隐藏（G18） | `features/redesign-contracts/service-factory.ts:10–33`；`shared/compute/not-implemented.ts` |
| 10 | 壳只在 `shellAppliesTo` 的页面挂 ⌘K；kiosk 不注册（G14） | `orbit-2026/shell/shell-routes.ts:21`（`shellAppliesTo`）；`orbit-global-ask/orbit-ask-routes.ts:38, 56`（`EXCLUDED_SEGMENTS`、`allowsOrbitAsk`） |
| 11 | App 路由对等测试：每个 Web 页面要有 App 路由，例外要有人拍板；App 多出的路由不受限 | `repos/orbit-app/tests/route-parity.test.ts`、`route-parity-exceptions.ts` |

### 1.2 新的形状

- **一个接口**：`GET /api/search/global?q=&types=&limit=&semantic=` → 分组结果（人 / イベント / 会話 / コマンド建议）+ 命中位置 + 无结果时的「近い条件なら」「ほかの方法」。服务端 `features/search/global/` 只做**编排**：调现有的联系人列表搜索、R27 活动搜索、（R21 到位后）会話搜索，再统一排序、截断、算命中位置和建议。不新建索引、不改三个数据源。
- **两端只画**：Web 重写 `CommandPalette.tsx`（壳目录，甲负责）+ 新的面板本体 `orbit-2026/search/`；App 新二级页 `/search`（`src/screens/search/GlobalSearchScreen.tsx`），Task 🔍 改接；人脈页 🔍（R11-02）可直接复用。
- **能力开关两枚**：`search.conversations`（会話组 / chip，R21 接口到位后打开）和 `search.semantic`（意味検索，默认关；开启需付费 embedding，见 §5）。开关只决定「显示不显示 / 调不调」，不改画面结构。
- **演示世界照画板**：mock 模式下三组都有 fixture（含会話两条），让每张画板都能截出来过门禁（G08）；live 下没有的组不显示（G18）。

## 2. 用户流程（逐屏）

### 2.1 Web ⌘K 面板

入口：⌘K / Ctrl+K（输入框里也行，普通字母不触发，R07 已做）、左栏 🔍、页面标题区 🔍 插槽（`ShellSearchButton`）、右栏「iOrbit に聞く… ⌘K」。390 没有 ⌘K（G12）。

| 状态 | 画板 | 内容 |
| --- | --- | --- |
| 初期（空输入） | **设计稿无**（§10 B1） | 推荐照 App #53：搜索行占位「人・イベント・会話を検索」+ chip 行；正文「最近の検索」（≤5，右上「消去」）和「こんな検索もできます」示例 chip；底部提示行同下 |
| 输入中 / 結果 | b5 #57 | 第一行：🔍 + 输入文字 + 光标（无边框）；右侧 chip「すべて · 人 · イベント · 会話」+ `Esc` 键帽；细分隔线。分组：「人 · 2」（头像首字、姓名、会社 · 役職、右侧状态 chip）、「イベント · 1」（活动 emoji 方块、标题、「高橋 さんも参加予定 · 10/16」）、「会話 · 2」（✨ iOrbit 会话 / 📧 受信箱，日期 · 来源）、「コマンド」（✨ iOrbit に聞く：「高橋」+ ⌘ ↵ 两个键帽）。命中词高亮。底部：「↑ ↓ 移動 / ↵ 開く / Tab 種類を切替」+ 右侧「意味検索 ON」 |
| 意味検索 | b5 #58（浅）/ #71（深） | 结果上方一行「意味で検索：「投資家」に関係する 23人（一致 9 · 関連 14）」；「人 · 23 関連度順」，每行右侧是**理由**（役職「パートナー」· VC / 会社が VC / メモ「VC 4社と面識」/ 「投資家を紹介できる」/ 投資契約に強い（関連））；「イベント · 2」（🥂 CFO Night Tokyo vol.18 · VC 3名が参加予定 · 今夜 · 参加者から） |
| 結果なし | b5 #59 | 居中 🔎 +「「半導体 商社」に一致する人はいません」+「286人の名前・会社・役職・メモを探しました」；「近い条件なら」两行（🏭 製造業 › 電子部品 · 12人 · 業界で絞り込む；📦 商社・流通 · 35人 · 業界で絞り込む，首行灰底高亮）；「ほかの方法」两行（✨ iOrbit に紹介ルートを聞く · 「半導体商社の人に会うには？」；🎟️ イベントで探す · 製造業 DX カンファレンス 大阪 · 出展 12社）；底部提示行同上 |
| 検索中 | 设计稿无（不进门禁） | 保留 R07 的「検索中…」行，250 ms 内不闪（见 §9） |

键盘：↑↓ 在所有行（含建议行、コマンド行）移动，↵ 打开；Tab / Shift+Tab 在 chip 间循环（すべて → 人 → イベント → 会話 → すべて）；⌘↵ 把输入交给 iOrbit（`useOrbitAsk`，只预填）；Esc 关闭并清空。打开面板时背景页不变（画板背景是人脈页，门禁从 `/app/contacts` 打开）。

### 2.2 App 全局搜索页

入口：Task 左上 🔍（R20-01）；人脈页 🔍（R11-02，R11 接线）。全屏二级页 `/search`，打开时键盘弹出、输入框聚焦；「キャンセル」返回来源页。规则 13：画板顶部 9:41 状态栏不画。

| 状态 | 画板 | 内容 |
| --- | --- | --- |
| ① 初期 | b5 #53 | 搜索行（占位「人・イベント・会話を検索」）+ キャンセル；chip 行；「最近の検索 / 消去」4 条；「こんな検索もできます」示例 chip（投資家、製造業の決裁者、先月会った人、紹介してくれそうな人、3か月 連絡していない人）；底部说明「言葉の意味でも探します。「投資家」で VC・CVC・エンジェルもヒットします」（**只在意味検索开启时显示**，§5） |
| ② 結果 · 名前 | b5 #54 | 与 Web 同：人 · 2 / イベント · 1 / 会話 · 2；没有 コマンド 组、没有键帽 |
| ③ 結果 · 意味検索 | b5 #55 | 与 Web #58 同（没有 コマンド） |
| ④ 結果なし | b5 #56 | 与 Web #59 同（没有底部提示行） |

点人 → 联系人详情；点活动 → 活动詳細（`href`）；点会話 → iOrbit 会话 / 收件箱条目（R21 / R13 的路由）；点「近い条件なら」→ 人脈页带业界筛选；点「イベントで探す」→ 探す页带 `q`；点「iOrbit に紹介ルートを聞く」→ iOrbit 页并预填问题（不发送）。

### 2.3 示例 chip 与「最近の検索」

- 「こんな検索もできます」固定 5 条，来自字典（`search.examples`），点一下等于输入；意味検索关闭时只保留能用关键词命中的 2 条（「投資家」「製造業の決裁者」靠同义词仍能命中部分，其余 3 条是语义类，关闭时不显示——这是**数据文字**层面的差异，不改结构；若主会话要求保留 5 条，则全部保留、点了走关键词）。
- 「最近の検索」只存本机（App AsyncStorage `orbit.search.recent`、Web `localStorage`），≤5 条、去重、「消去」清空；**不上传服务端**（§6）。

## 3. 一套搜索服务

### 3.1 接口

`GET /api/search/global?q=<0–100 字>&types=people,events,conversations&limit=<1–20，默认 5>&semantic=<0|1>`，`auth: "required"`（mock 模式无 actor 也可）。

- **`q` 允许为空**（去空白后 0 字）：空查询不搜任何数据源，只返回「能力」部分——`types`（本次可用的组，决定 chip 行）、`semantic.available / enabled`（底部「意味検索 ON / OFF」、App 初期底部说明行）、`searchedPeople`、`examples`（「こんな検索もできます」5 条，服务端按 `semantic.available` 过滤）。面板打开 / App 页进入时先发一次空查询（结果按 actor 缓存 5 分钟），初期画面靠它画，不需要等用户输入。
- **`semantic` 由客户端送**：`semantic.available = true` 时默认送 `1`（面板里的「意味検索 ON」是状态显示，不是开关；用户在設定里关掉后客户端送 `0`）；`available = false` 时客户端不送，服务端也忽略。

```ts
// shared/contract/global-search.ts（新；文件头写 Owner: 甲 (R30)。Used by: Web ⌘K, App /search）
export type GlobalSearchType = "people" | "events" | "conversations";
export interface SearchHighlight { field: "title" | "subtitle"; start: number; end: number }  // code point 位置，两端同一纯函数算
export interface GlobalSearchPersonHit {
  contactId: string; name: string; initial: string; org?: string | null; role?: string | null;
  status?: "in_progress" | "acquaintance" | null;   // 右侧状态 chip：推進中（在当前计划里）/ 知り合い（其余）；无计划时 null → 不画 chip
  reason?: string | null;                             // 意味検索时的理由行（役職「パートナー」· VC）；关键词搜索为 null
  related?: boolean;                                  // 意味検索：関連（非一致）
  // 渲染规则：reason 非空时画理由行、不画状态 chip（画板 #58 / #55 的行没有 chip）；reason 为空时画 status chip（#57 / #54）
  highlights: readonly SearchHighlight[]; href: string;
}
export interface GlobalSearchEventHit {
  eventId: string; title: string; emoji: string; startsAt: string;
  note: string;                                       // 「高橋 さんも参加予定 · 10/16」「VC 3名が参加予定 · 今夜」——服务端拼好（三语字典），客户端不再算
  via?: "attendees" | null;                           // 画板 #58 / #55 行尾的独立玫瑰色药丸「参加者から」（kit `.mr`）：命中来自参加者名单时为 attendees，客户端画药丸；关键词命中标题时 null
  highlights: readonly SearchHighlight[]; href: string;
}
export interface GlobalSearchConversationHit { id: string; kind: "iorbit" | "inbox"; title: string; subtitle: string; highlights: readonly SearchHighlight[]; href: string }
export interface GlobalSearchGroup<T> { total: number; items: readonly T[]; order?: "relevance" }
export interface GlobalSearchSuggestion { kind: "industry"; label: string; count: number; href: string; emoji: string }        // 近い条件なら
export interface GlobalSearchAlternative { kind: "ask_iorbit" | "events"; label: string; detail: string; href: string; emoji: string } // ほかの方法
export interface GlobalSearchResponse {
  query: string;
  types: readonly GlobalSearchType[];                 // 本次可用的组（live 下 R21 前不含 conversations）
  people: GlobalSearchGroup<GlobalSearchPersonHit>;
  events: GlobalSearchGroup<GlobalSearchEventHit>;
  conversations?: GlobalSearchGroup<GlobalSearchConversationHit>;
  semantic: { available: boolean; enabled: boolean; matched?: number; related?: number };   // 底部「意味検索 ON/OFF」与「意味で検索：…」行
  searchedPeople: number;                             // 「286人の名前・会社・役職・メモを探しました」
  examples: readonly string[];                        // 「こんな検索もできます」示例（空查询时返回；semantic 不可用时只给关键词能命中的）
  suggestions: readonly GlobalSearchSuggestion[];     // 0 件时 ≤2 条
  alternatives: readonly GlobalSearchAlternative[];   // 0 件时固定 2 条
  sample?: true;
}
```

- 校验 `shared/api-schema/global-search.ts`：响应宽进（`readableItems`、`tolerantEnum` 兜底 `status → null`、`via → null`，`kind` 未知整条跳过），请求 `.strict()`（README 通用规则 10）。`q` 0–100 字（空 = 能力查询），`limit` 沿用 `eventSearchQueryObject`。
- HOW-TO 第 3 节「新增契约」清单的落点：handler 不放 `features/redesign-contracts/handlers.ts`，而是 `features/search/global/handlers.ts` 用同一个 `redesignContractRoute(capability, schema, …)` 包装（与 R27 `journeyRoute` 的做法一致）；`mock-service.ts` 加 `global-search` 分支指向 §8 fixture；其余（route 文件、CASES、parity、fixture `sample: true`、App 解析测试、快照）照清单。
- 契约只加不改；`shared/contract/index.ts` 导出；`node scripts/contract-snapshot.mjs --write`；App `npm run sync:contract` 同一提交。
- capability `global-search` 加进 `REDESIGN_CONTRACT_CAPABILITIES`，**第一天就进 `REDESIGN_CONTRACT_LIVE_CAPABILITIES`**（它只编排已有 live 服务，没有「尚未实现」的部分）；mock 行为在 `mock-service.ts`，fixture 在 `shared/mock/demo-world/global-search.ts`（§8）。
- 路由 `app/api/search/global/route.ts` 只 re-export handler；`tests/api/redesign-contract-routes.test.ts` 的 `CASES` 加 mock 成功 / live 401；parity check 加一行；App `tests/contract-fixtures-parse.test.ts` 解析一遍。
- `/api/search/global` 走 `requireAuthenticatedActor`（同 `authenticatedApiActorRequiredResponse`）；App 的 `api-auth-proxy-boundary` 测试把它列为需登录接口。

### 3.2 数据源

| 组 | 来源 | 现状 | R30 要做 |
| --- | --- | --- | --- |
| **人** | `createContactsListSearchAndFilterService`（`features/contacts/service-factory.ts:62`；路由 `/api/contacts/search`），live 读 `contact-list-postgres-reader.ts`（`search_blob` like，字段见 §1.1 #3） | 已有，actor / workspace 作用域 | 服务函数直接调用（不经 HTTP）；`limit` 传 `20`（单类页签上限），再按 §4 排序截断；状态 chip 用计划关联（`planGoalRelatedContactIds`，R11-05 同一来源）：在计划里 → `in_progress`，否则 `acquaintance`；没有计划 → null |
| **イベント** | `createEventJourneyService().search(actorId, q, limit)`（`features/events/journey/service.ts:111`；契约 `event-search.ts`） | 已 live（R27）；people 子组受规则 A 限制 | 只取 `events`；`note` 由 `people`（我的联系人在该活动）或 `myStatus` 拼：「{姓} さんも参加予定 · {M/D}」「参加予定 · {M/D}」「{M/D}」；`organizers` 本期不显示（画板没有） |
| **会話** | **接口不存在，归 R21**（iOrbit 会話：标题 + 正文；收件箱：R13）。现有 `GET /api/ai/conversations/sessions?q=` 只匹配标题 / 首句 / 末句预览 | 不可用 | 本期 `types` 不含 `conversations`，chip 不显示（§10 A1）；R21 交付 `searchConversations(actorId, q, limit)`（title、正文命中片段、`href`）后，在编排层接上并打开 `search.conversations` 开关。接口形状写进交接表 R21 节（由实施会话追加） |
| **コマンド** | 客户端：`useOrbitAsk`（Web） | 已有 | Web 只有一行「iOrbit に聞く：「{q}」」；App 画板没有这一组，不画 |
| **近い条件なら** | 业界分类：`features/search/filter-options.ts` 的业界选项表（粗分类 `RelationshipNaturalSearchIndustry`，类型在 `features/search/contract.ts:25`）+ 联系人的一级 / 二级业界 `primaryIndustryIds` / `secondaryIndustryIds`（`IndustrySelectionContract`，开工时用 `context` 定位其字典文件）+ 联系人搜索按业界筛选的计数 | 分类已有；按业界计数要加一个 `countByIndustry(actorId, industryIds)` 读法（只读，复用 reader 的 `primaryIndustryIds` 筛选条件） | §4.4 |

### 3.3 共享纯函数（`shared/compute`，两端同步）

- `search-normalize.ts`：`normalizeSearchText`（NFKC → 小写 → 去空白，**与 `search-core.ts:39` 同一规则**，R27 的函数搬到这里并由它复用，只搬不改）；`splitSearchTerms`（按空白拆词，≥2 词时 AND）。
- `search-highlight.ts`：`highlightRanges(text, terms) → SearchHighlight[]`（在原文上找每个词的 code point 区间；NFKC 折叠后的位置映射回原文；重叠合并）。服务端算一次放进响应，客户端只渲染；App / Web 的渲染测试用同一组 fixture。
- `search-rank.ts`：§4 的排序比较器（纯函数，便于测试）。

## 4. 排序、分组、命中高亮、空结果

### 4.1 分组与截断

- 组顺序固定：人 → イベント → 会話 → コマンド。标题「人 · {total}」用**组总数**，不是显示条数。
- 「すべて」下每组最多 `limit` 条，**默认 6**（画板 #58 / #55 / #71 在「すべて」下画了 6 个人；#57 的 2 / 1 / 2 是总数不足 6）；客户端固定传 6，契约默认值也写 6。单类型 chip 下每次最多 20 条；再多的不加「さらに表示」行（**单类型画面设计稿无**，§10 B9 / A5）——先只显示前 20 条，组标题仍写总数，B9 补画定了再加「さらに表示」。
- 一个组 0 条就不画该组（不画空标题）；三组都 0 → 結果なし 画面（§4.4）；コマンド 组始终在（Web）。

### 4.2 关键词排序（意味検索关闭）

人（每个候选算一个 rank，再按 rank → 最終接点新→旧 → 名字）：

| rank | 条件 |
| --- | --- |
| 0 | 氏名**前缀**命中第一个词（联系人没有よみ字段；R17-09 加了よみ后再纳入） |
| 1 | 氏名包含全部词 |
| 2 | 会社或役職包含全部词 |
| 3 | 其余字段（所在地、メモ类字段）命中 |

イベント：沿用 `searchEvents` 的结果顺序（只搜开始时间在 6 小时前之后的活动，按 `startsAt` 升序；过去的活动本期不搜，R27 的规则不改）。会話（R21 后）：按最后活动时间降序。

多词：按空白拆词，**每个词都要命中**（可以在不同字段）；「半導体 商社」= 既有「半導体」又有「商社」。单词不拆（「高橋」只是一个词）。与 R27 的 `search-core` 一致：NFKC 折叠，全半角、大小写不分。

### 4.3 命中高亮

- 在 title（人名 / 活动标题 / 会話标题）和 subtitle（会社 · 役職 / note）上高亮每个词的所有出现；高亮样式照画板的内联 `mark{background:var(--rose-100); …}`（kit 里没有 `.hl` 类，抽 #57 源码照搬，颜色用 token）。
- 意味検索的「関連」项（非一致）不高亮，只显示理由行。

### 4.4 空结果：「近い条件なら」与「ほかの方法」

触发：`q` 非空且人 / イベント /（会話）三组都是 0 条。

- 标题「「{q}」に一致する人はいません」（即使 chip 在「すべて」；画板如此）；副标题「{searchedPeople}人の名前・会社・役職・メモを探しました」，`searchedPeople` = 本人联系人总数。
- **近い条件なら（≤2 条）**：把每个词与业界分类表匹配（名称、别名、二级名称；「半導体」→ 製造業 › 電子部品，「商社」→ 商社・流通），按匹配到的分类取本人联系人计数（`countByIndustry`），只显示计数 > 0 的，最多 2 条，格式「{emoji} {一级} › {二级} · {n}人 · 業界で絞り込む」，`href` = 人脈页带业界筛选（R11 的筛选参数；R11 未做前用现有 `/app/contacts?industry=`，R11 接手时保持参数名）。词都匹配不到分类 → 这一组不画。
- **ほかの方法（固定 2 条）**：
  1. 「✨ iOrbit に紹介ルートを聞く」· 「{q 去空白}の人に会うには？」→ iOrbit 页预填，不发送；
  2. 「🎟️ イベントで探す」· 右侧文字 = 活动搜索对同一 `q` 的首条（「{title} · 出展 {n}社」中的「出展 n社」需要活动 payload 的展商数——没有这个字段，**只显示「{title} · {M/D}」**，属数据文字差异）；活动也 0 条时显示「探すで条件を変えて探す」并链到探す页带 `q`。
- 首行灰底高亮 = 键盘焦点默认落在第一条建议（画板状态）。

### 4.5 状态 chip「推進中 / 知り合い」

- `in_progress`（推進中）：该联系人在本人当前计划的人物类型里（`planGoalRelatedContactIds`）；`acquaintance`（知り合い）：其余。没有计划 → 不画 chip（`status: null`）。
- 文案进字典 `search.status.*`；颜色照画板 chip（推進中 plum、知り合い ink-3，kit `.chip`）。

## 5. 意味検索（能力开关 `search.semantic`，默认关）

### 5.1 本期（默认关，不调付费 AI）

- 服务端 `semantic.available = false`（没有 embedding provider 时恒为 false）；客户端底部显示「意味検索 OFF」（画板里它是 `span.lbl` 纯文字，不是按钮；同一元素、文字不同；§10 A2 的拍板项），不可点（对标 Notion AI 未订阅时的灰态）。
- App 初期画面底部「言葉の意味でも探します…」一行在 `available = false` 时不显示。
- b5 #58 / #71 / #55「意味検索」三张画板的门禁：mock 模式下用 fixture 把 `semantic.available/enabled = true` 和理由行造出来（G08：只读演示服务器 + 固定示例结果，不调 AI），画面可以做并过门禁；live 下在授权前不会出现。

### 5.1b 现状（2026-10-17，决定表 §50）：lite 已打开

用户授权「打开意味検索」；没有 embedding provider，先上本节末行的「意味検索 lite」作为 ON 的第一阶段：`shared/compute/search-synonyms.ts`（概念 = 查询里的词 + 同义词 + 公司标记），live `semantic.available = true`，编排层对概念词逐个召回（≤12 次单词读取）后与字面 AND 召回合并，`liteMatch` 判「一致 / 関連」并生成理由；用户在设定里关掉后客户端送 `semantic=0`（本机偏好 `orbit.search.semantic`；设定页开关归 R18）。不调 AI、不记账本。下面 5.2 的真 embedding 仍等 key。

### 5.2 开启后的实现（等用户授权；写在这里不是本期范围）

| 项 | 做法 |
| --- | --- |
| 模型 | 需要**另加 embedding provider**：生产 provider DeepSeek 没有 embedding 接口。候选 OpenAI `text-embedding-3-small`（1536 维，多语言，日文可用）或 Voyage `voyage-3-lite`；新增环境变量 `ORBIT_EMBEDDING_PROVIDER` / key。Embedding 不生成文本，不存在「幻觉」，但联系人姓名与会社会出境——**id 不出境、文本出境**要在隐私条款里写明（同计划页提示词的口径） |
| 索引 | 迁移 `search-embeddings`：Neon 开 `vector` 扩展，新表 `contact_embeddings(workspace_id, contact_id, model, dims, embedding vector(1536), source_hash, updated_at)`；联系人写入后台异步更新（变更时按 `source_hash` 判重，不重算）；活动同理 `event_embeddings`（可选，第二阶段） |
| 查询 | 每次搜索 1 次 embedding 调用（query，≤30 token）→ 余弦近邻 top 50 → 与关键词结果合并：关键词命中 = 「一致」，仅向量命中（相似度 ≥ 阈值 0.78，开工时在演示库上定）= 「関連」；理由行用**规则**生成（命中在哪个字段：役職「…」、会社が VC、メモ「…」），不调生成模型 |
| 账本与上限 | 用途 `search_semantic` 加进 `AI_QUOTA_PURPOSES`（`features/ai-quota/constants.ts`），`AI_QUOTA_MAX_CALLS = 1`；按次记账，不进用户池日上限（搜索是高频操作，对标：Notion / Slack 的 AI 搜索不按次限用户）；但有每人每分钟 20 次的查询限流（§6） |
| 成本估算 | `text-embedding-3-small` 约 $0.02 / 1M token。初次索引：每个联系人约 100 token（姓名、会社、役職、所在地、メモ摘要），一个 286 人的用户 ≈ 2.9 万 token ≈ **$0.0006 / 用户**；1 万用户 × 平均 300 联系人 × 100 token = 3 亿 token ≈ **$6 一次性**，之后只对变更的联系人重算。查询：每次 ≤30 token，1 万用户 × 每天 10 次 × 30 天 × 30 token = 9000 万 token ≈ **$1.8 / 月**。真正的成本在工程（迁移、后台索引、provider 接入与测试），不在 token |
| 免费的替代（不同意付费时） | 「意味検索 lite」：静态同义词表（`shared/compute/search-synonyms.ts`：投資家 → VC / CVC / エンジェル / ベンチャーキャピタル / パートナー；決裁者 → 社長 / 役員 / 部長 …），命中同义词的项标「関連」并给理由「役職「パートナー」· VC」。零成本、可解释，能覆盖画板示例；缺点是只认表里的词 |

## 6. 限流与隐私

- **未登录不可用**：`/api/search/global` 没有 actor → 401（同 `event-search`）；页面上未登录本来进不了壳。Web 390 没有 ⌘K；公开页、kiosk 不注册 ⌘K（G12 / G14 不变）。
- **只在本人数据内**：三个数据源各自已按 actor / workspace 作用域；编排层不做任何跨 actor 查询；活动里的「人」沿用规则 A（只在本人能看名单的活动里找，`roster-policy.ts`）。测试：两个 actor 的联系人互相搜不到；未报名活动的名单不出现在 note 里。
- **限流**：每人每分钟 60 次（关键词）/ 20 次（意味検索）；超出 → 429 `RATE_LIMITED`（写法同 `features/events/assessment/service.ts:363`：按 actor 在窗口内计数，先用内存 + 数据库二选一，由实施定；对标 GitHub 搜索 API 已登录 30 次 / 分钟、Linear 客户端 300 ms 防抖）。客户端：250 ms 防抖（与 `DiscoverPage` 一致）、新请求 `AbortController` 取消旧请求、429 时显示「少し待ってからもう一度」不重试。
- **查询文本不落应用日志**：服务端日志只记长度、组数、耗时，不记 `q`；账本（意味検索开启后）只记 token 数。**已知边界**：`GET ?q=` 会出现在 Vercel 的请求日志与浏览器历史里（与现有 `/api/events/search?q=`、`/api/ai/conversations/sessions?q=` 相同）。对标 GitHub / Linear 的搜索都用 GET 查询串；本期沿用 GET，并在 REPORT 写明；若用户要求连平台日志也不留，改成 `POST` body（契约形状不变，只改方法），实施期一处可改。
- **最近の検索只存本机**（§2.3）；示例模式（演示世界）下也不上传。
- **响应不夹带别人的数据**：`note`、`reason` 只用本人可见字段；会話命中片段（R21）截到 80 字。
- 查询长度 1–100 字（`.strict()`），超长 400。

## 7. 两端界面与路由

### Web（`repos/orbits`）

| 文件 | 做什么 |
| --- | --- |
| `app/(app)/app/orbit-2026/shell/CommandPalette.tsx` | 重写：只保留打开 / 关闭 / 快捷键 / 焦点与 `useOrbitAsk` 交接；面板本体换成 `orbit-2026/search/SearchPanel.tsx`。壳目录归甲（R07），改前跑 `impact`（`CommandPalette`、`useCommandPaletteShortcut`、`Orbit2026Shell`） |
| `app/(app)/app/orbit-2026/search/{SearchPanel,SearchGroups,SearchEmpty,SearchFooter}.tsx` + `*.module.css` | 面板本体，照 b5 #57 / #59 的 DOM 与 kit CSS 搬（`.wmodal.top`、`.kbd`、`.chip`、`.hl`） |
| `app/(app)/app/orbit-2026/search/use-global-search.ts` | 防抖、取消、chip 状态、键盘导航（↑↓↵ Tab Esc ⌘↵）、最近の検索（localStorage） |
| `app/(app)/app/orbit-2026/copy/search.ts` | 文案（三语），`shell.ts` 的 `palette*` 键只减不增，用完即删 |
| `app/api/search/global/route.ts`、`features/search/global/{service,handlers,mock-service,rank,suggestions}.ts` | 接口与编排 |
| `features/contacts/storage/contact-list-postgres-reader.ts` | 只加 `countByIndustry`（热点文件：甲自己，`impact` 后只追加） |
| 测试 | `tests/search/global-search.test.ts`（排序、AND、高亮、建议、隔离、401 / 429）、`tests/ui/orbit-2026-search-panel.test.tsx`（渲染、键盘）、`tests/api/redesign-contract-routes.test.ts` CASES、`tests/ui/api-auth-proxy-boundary.test.ts` |

### App（`repos/orbit-app`）

| 文件 | 做什么 |
| --- | --- |
| `app/search.tsx` → `src/screens/search/GlobalSearchScreen.tsx` | 全屏二级页：搜索行 + キャンセル、chip、四种状态；不用 `AppScreen` 顶栏（画板没有标题栏），用 `ShellBackground` + 安全区（规则 13 不画状态栏）；`parentForPath("/search")` 返回打开它的一级页（`src/view-models/app-navigation.ts`）。全屏搜索页容器是组件库待补件（DEFERRED-A §1「全屏搜索页容器」），到位前与 R27 同样手写并登记 `legacy-ui-deferred.json` 一行 |
| `src/screens/search/search-api.ts` | `GET /api/search/global`（`platform=app`），schema 解析 `src/api/schema/global-search.ts`（sync 来的副本） |
| `src/screens/task/TaskScreen.tsx:116` | 🔍 `router.push("/search")`（R20-01）；`accessibilityLabel` 换成 `search.open` |
| `src/screens/contacts/ContactsScreen.tsx` | 不动（R11-02 接线时把顶栏 🔍 指到 `/search`） |
| 测试 | `tests/global-search-screen.test.tsx`（四态渲染、chip 切换、点人跳转、キャンセル；App `tests/` 平铺）、`tests/route-parity.test.ts`（App 多出 `/search` 不需例外；Web 没有对应页面）、`tests/contract-fixtures-parse.test.ts` |

## 8. 演示世界 fixture（照画板）

`shared/mock/demo-world/global-search.ts`（人和事只从 `index.ts` 取，`sample: true`）：

| 输入 | 结果 |
| --- | --- |
| 「高橋」 | 人 2（高橋 美咲 · 青葉ベンチャーズ · パートナー · 推進中；高橋 亮 · 東亜精機 · 生産技術部 課長 · 知り合い）；イベント 1（🎤 Japan SaaS Summit 2026 秋 · 高橋 さんも参加予定 · 10/16）；会話 2（`kind: iorbit` title「高橋 さんへのお礼の下書き」subtitle「10/7 · iOrbit との会話」——「iOrbit：」前缀由客户端按 `kind` 画；`kind: inbox` title「Re: 事業計画書 v3 のご送付」subtitle「高橋 美咲 · 受信箱 · 今日」） |
| 「投資家」+ `semantic=1` | `semantic {available:true, enabled:true, matched:9, related:14}`；人 23（前 6 条照 #58 的人和理由）；イベント 2（🥂 CFO Night Tokyo vol.18 · note「VC 3名が参加予定 · 今夜」· `via: attendees`） |
| 「半導体 商社」 | 三组 0；`searchedPeople: 286`；suggestions 2（🏭 製造業 › 電子部品 12；📦 商社・流通 35）；alternatives 2（iOrbit：「半導体商社の人に会うには？」；🎟️ 製造業 DX カンファレンス 大阪） |
| 其他 | 空结果 + 由规则算出的建议 |

演示世界里现有 10 个人物没有「高橋 亮」「山本 彩」等（画板示例）：fixture 允许在**搜索结果**里出现额外示例人物（只做显示，`href` 指向演示联系人或 `#`），`demo-world-consistency` 对这些条目按 `sample: true` 放行；不往 `index.ts` 加人（避免影响其他 Sprint 的计数）。

## 9. 自定决定（对标成熟产品；与画板无关的工程决定）

| # | 决定 | 对标 |
| --- | --- | --- |
| E1 | 服务端编排，不建新索引：三个数据源各自搜，编排层合并 | Slack 搜索按 messages / files / channels 分别查再合并；Notion 分 pages / people |
| E2 | 多词 AND、NFKC 折叠、不分大小写与全半角 | GitHub / Linear 的关键词搜索 |
| E3 | 250 ms 防抖 + 取消旧请求 + 「検索中」不闪（<250 ms 不显示） | Linear ⌘K、Raycast |
| E4 | 「すべて」每组 6 条（照画板）、单类 20 条；「さらに表示」等 B9 画板 | Slack「すべて」每类 3–5 条 + 「もっと見る」 |
| E5 | 组计数显示总数，不显示「5+」 | Notion 搜索的 type 计数 |
| E6 | 焦点默认在第一条结果；无结果时在第一条建议 | Linear / Raycast |
| E7 | 最近の検索只存本机 5 条，不上传 | Slack / Notion 的最近搜索按设备保存；隐私最小化 |
| E8 | 429 不自动重试，提示稍后再试 | GitHub API 对 429 的客户端惯例 |
| E9 | 意味検索理由行用规则生成（命中字段），不用生成模型 | Linear 语义搜索只给相关度，不生成解释；避免幻觉与费用 |
| E10 | App 搜索页是普通二级页（不是 RN `<Modal>`），返回走 `parentForPath` | R27 用 Modal 是因为缺组件（DEFERRED-A）；二级页能过 route-parity 与返回规则（G15） |
| E11 | 会話组 live 下由 `types` 决定可见性，客户端不写死 | 能力开关惯例（G18） |

## 10. 需要定的事（推荐做法 + 对标；A = 主会话 / 用户拍板，B = design-decisions 补画 / 改画板，C = token）

### A 主会话 2026-10-17 确认全按推荐（原为待拍板）

**主会话 2026-10-17 已答复：A1–A5 全按推荐**（原话：「DESIGN §10 A1–A5 全按你的推荐定」）。下表「推荐」一栏即定稿；「不同意时」一栏不再适用。缺画板 B1–B9 已交 design-decisions 补画会话（补在 b12 末尾），补好前先做服务端与已有画板的画面，缺画板的状态照画板结构实现、门禁留到序号到了再加。

| # | 事项 | 推荐 | 对标 | 不同意时 |
| --- | --- | --- | --- | --- |
| A1 | **会話 chip**：R21 的会話搜索接口不存在（§1.1 #5） | 数据源不可用时**不显示该 chip 和该组**（`types` 不含 `conversations`，chip 行只有 すべて / 人 / イベント + Esc，其余不变）；R21 接口到位后打开 `search.conversations` 一个开关。登记 DEFERRED-A §2「R30 ← R21」（已有一行）与交接表 R30 节；mock 模式下用 fixture 显示四个 chip，画板 #57 / #54 等照常过门禁；**live 的三 chip 状态没有画板，不进门禁，暂缓**到 R21 | Linear 的 ⌘K 只列已接入的实体；Slack 搜索在无权限的数据源上不显示过滤器 | 保留 chip 但禁用（灰态 + 「まもなく」提示）：要补画禁用态画板 |
| A2 | **「意味検索 ON」**：需要 embedding（付费 AI），本轮无配额（§5） | 做成能力开关 `search.semantic`，**默认关、不调付费 AI**；关时底部 pill 显示「意味検索 OFF」（同一元素，文字不同），App 初期底部的说明行隐藏；开启的实现与成本见 §5.2，等用户授权后另开一轮（含迁移 `search-embeddings`、provider、账本用途 `search_semantic`） | Notion「AI で検索」是付费功能的开关；Slack 的 AI 搜索只对订阅用户开 | ① 立即做付费版：需授权 provider 与费用（§5.2 估算）；② 免费 lite 同义词版（§5.2 末行）作为「ON」的第一阶段 |
| A3 | **Web 1024 宽度**：⌘K 没有 1024 画板 | 面板与 1440 同一份（680 宽、距顶 96 的居中模态，不随宽度变），壳按 1024 规则；门禁 1024 用 `--region` 只比面板区域（面板位置随视口居中，由实施算出），背景页按 R07 1024 壳；不补画 | Linear / Notion 的 ⌘K 在任何桌面宽度都是同一尺寸 | 补画 1024 整屏画板（B 组加 3 张） |
| A4 | **Web 390**：G12 已定没有 ⌘K | 不做、不进门禁；App 全局搜索页是手机的入口 | 已定（2026-10-12） | — |
| A5 | **单类型 chip 画面**没有画板（Tab 切到「人」后只剩一组） | 结构与「すべて」完全相同、只是少了别的组（数据差异），本期按此实现，不进门禁；「さらに表示」行等 B9 补画后加 | Linear ⌘K 过滤后布局不变 | 补画 B9 后按画板加行并进门禁 |

### B 交 design-decisions 补画（只加在 `b12` 末尾；浅 / 深各一框）

| # | 画面 | 推荐画法 |
| --- | --- | --- |
| B1 | Web ⌘K · 初期（空输入） | 照 App #53：占位「人・イベント・会話を検索」、chip 行、「最近の検索 / 消去」、「こんな検索もできます」、底部提示行 |
| B9 | 单类型 chip（例：「人」）结果页，Web + App | 同 #57 / #54 结构，只剩一组，组尾「さらに表示（{n}）」行；补画前单类型画面不进门禁（A5） |
| B2 | Web ⌘K · 名前（#57）深色 | 同 #71 的深色处理 |
| B3 | Web ⌘K · 結果なし（#59）深色 | 同上 |
| B4 | App ① 初期（#53）深色 | 同 b5 其他 App 深色画板（#65–#68）的处理 |
| B5 | App ② 結果 · 名前（#54）深色 | 同上 |
| B6 | App ③ 結果 · 意味検索（#55）深色 | 同上 |
| B7 | App ④ 結果なし（#56）深色 | 同上 |
| B8 | App ⑤ 検索中（可选，不进门禁） | 搜索行 + chip + 一行「検索中…」；不画可以不画，实现沿用 R07 做法 |

B1–B9 到位前对应画面按规则 11 暂缓；A1 的「三 chip」live 状态与 A2 的「意味検索 OFF」状态属于能力开关的**数据状态**（同一结构、不同文字 / 少一个 chip），不另补画，门禁在 mock 下照四 chip / ON 的画板过。

### C token（R01 流程补，不用拍板，开工第一天做）

预检（PLANNER 预检表）只报 3 类，其中只有 C1 属于本面板：

| # | 画板值 | 处理 |
| --- | --- | --- |
| C1 | 键帽 `.kbd` 行高 1（×5–7，近似 `--lh-display` 1.05） | 核对 kit `.kbd` 与现有 `Kbd` 组件：若 kit 就是 `line-height:1`，补 `--lh-none: 1`（App `designFont.lineHeight.none`）并让 `Kbd` 用它；G23b 的 Kbd 字色一并按 RD-05 口径定 |
| C2 | 阴影 `0 0 0 1 rgba(40,30,50,.06), 0 30 70 -30 rgba(40,20,70,.35)` | **不是本面板的**：预检报的元素是画板外框 `div.web.no-rail`（门禁截图时已去掉）；面板 `.wmodal` 用现成 `--shadow-float`。不补 token |
| C3 | 字距 -0.02em（`.cnt`「286」） | **不是本面板的**：那是背景人脈页（R11）的计数元素。不补；R11 预检时自己处理 |

App 画板的 54px 圆角、黑色 island、手机阴影、30 / 60 间距全部是手机画框外壳（规则 13），不实现、不补 token。

## 11. 待授权与暂缓

| 事项 | 卡在什么 | 解锁后 |
| --- | --- | --- |
| 会話组 | R21 会話搜索接口（+ R13 收件箱搜索） | 接 `searchConversations`，打开 `search.conversations`，补 live 三 chip → 四 chip 的回归；重跑 #57 / #54 对应画面 |
| 意味検索 | 用户授权 embedding provider 与费用（§5.2） | 迁移 `search-embeddings`、provider、账本；默认仍关，设置里开 |
| B1–B9 补画 | design-decisions 补画 + 用户过目 | 加进 `views/*-R30.json` 重比 |
| 全屏搜索页容器 | 乙的组件库像素轮（DEFERRED-A §1） | 换组件并删 `legacy-ui-deferred.json` 对应行 |
| 「出展 12社」 | 活动没有展商数字段 | 有字段后补进 `alternatives[1].detail` |
| 人脈页业界筛选参数 | R11 重写人脈页 | 保持 `?industry=` 参数名，R11 接手 |

不连 Neon、不部署；本轮没有付费 AI 调用。

## 12. 和其他 Sprint 的接口

| Sprint | 谁等谁 | 内容 |
| --- | --- | --- |
| R20 Task（乙） | R30 → R20 | Task 🔍 改接 `/search`（R20-01）：R30 直接改 `TaskScreen.tsx:116` 一行；R20 重写 Task 时保留 |
| R11 人脈（乙） | R30 → R11 | 人脈页 🔍 可直接 `router.push("/search")`；「近い条件なら」的业界筛选参数名 `industry`；R11-05 的 `planGoalRelatedContactIds` 与状态 chip 同源 |
| R21 iOrbit（乙） | R21 → R30 | 交付 `searchConversations(actorId, q, limit)`（标题 + 正文片段 + `href`），R30 的能力开关打开；「iOrbit に聞く」预填走 `useOrbitAsk`（R21 重写输入区时保持） |
| R13 收件箱（乙） | R13 → R30 | 收件箱消息搜索（📧 行）同上，可与 R21 合成一个会話接口 |
| R27 活动（甲，已完成） | R27 → R30 | `event-search` 服务函数与契约（已交付）；`normalizeSearchText` 搬到 `shared/compute` 后 R27 改引用（只搬不改） |
| R07 壳（甲，已完成） | — | `CommandPalette.tsx` 重写在壳目录内；快捷键、`ShellSearchButton`、右栏入口不变 |

## 13. GitNexus（本文写作时）

文档阶段未跑 `impact`；实施第一天对以下符号跑 `impact --direction upstream` 并把结果写进 REPORT：`CommandPalette`、`useCommandPaletteShortcut`、`Orbit2026Shell`、`createContactsListSearchAndFilterService`、`createEventJourneyService`（`search`）、`searchEvents`、`TaskScreen`、`parentForPath`、`REDESIGN_CONTRACT_CAPABILITIES`。预期：`CommandPalette` 只有壳一个调用方；`searchEvents` 有 R27 探す与测试两处；`REDESIGN_CONTRACT_CAPABILITIES` 会报 CRITICAL（表类常量），对策「只追加一项，不改已有项」。
