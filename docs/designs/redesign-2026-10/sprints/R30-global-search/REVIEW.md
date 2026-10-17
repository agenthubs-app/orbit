# R30 全局搜索 · 文档期独立复核

- **复核日期**：2026-10-17
- **复核对象**：`R30-global-search/GOAL.md`、`R30-global-search/PLANNER.md`（revision 1）、`search/DESIGN.md`（版本 1）、`R30-global-search/preflight-checklist.md`（抽查）。代码事实按工作区 HEAD `46a9135f1`（文档写于 `1deb5d032`，两者之间只有一次文案提交，所引路径与行号未受影响）。
- **复核方法**：
  - 逐条对照 HOW-TO 第 0 / 3 / 8 节、交接表 R30-01 / U01 / R20-01 / R21 节 / G01–G26、README 骨架通用规则 1–13 与 RD-16、DEFERRED-A、决定表 §9-1 / D16；写法参照 R17 PLANNER、host/DESIGN §10、events/DESIGN §4.2 / §10。
  - 代码事实：DESIGN §1.1 表 11 条与 §3 / §6 / §7 引用的每个路径、行号用 `sed -n` / `grep` 核对（orbits 与 orbit-app 两仓库）。
  - 设计稿：`compare-redesign.mjs --list --design b5-me-inbox.html` 核对序号；`--extract-board` 单块抽取 #53–#59、#71 到 scratch，提取可见文字与局部 CSS（`mark`、`.mr`、`.wmodal`、`.kbd`、`.cnt`）对照 DESIGN §2 / §4 / §10 C。
  - 预检：重跑 `board-preflight.mjs --design b5-me-inbox.html --board-index 53,54,55,56,57,58,59,71`，核对 PLANNER 预检表五项总结论里的数字。
  - 未改 GOAL / PLANNER / DESIGN，未 commit。

## 结论

**有条件通过（文档期）**：GOAL / PLANNER / DESIGN 的骨架齐全，HOW-TO 要求的要素（含每画面像素 SC、预检五项、新增契约清单、A/B/C 分组）都在，交接表 R30-01 / U01 / R20-01 都落进了 SC，G12 / G14 / G15 / G18 / G25 遵守，预检工具数字（自洽 0、近似 4、缺 token 28、疑似无功能 6）复跑一致，画板序号全部正确。

但**接口形状与画板之间有 4 处对不上**（M01–M04），**2 处事实错误**（M05 会話 `q` 实际含正文片段、M06 成本算术），**1 处隐私覆盖不全**（M07 GET `?q=` 进平台请求日志），以及 C2 / C3 两个 token 项误归到本面板（M08）。这些都是文档期能改、不改会直接变成实现返工或像素门禁不过的问题，建议作者修完再开工。m 级为路径 / 用词 / 命名修正。

## 问题表

| # | 位置 | 问题 | 依据 | 建议改法 |
| --- | --- | --- | --- | --- |
| **M01** | DESIGN §3.1 契约、§2.1 初期、§2.2 ①、§5.1；PLANNER P04 / P05 | **初期（空输入）状态拿不到 `types` 与 `semantic.available`**。接口 `q` 为 1–100 字必填，而画板 #53 初期就要画底部「言葉の意味でも探します…」（取决于 `semantic.available`），B1 Web 初期要画 chip 行（取决于 `types` 是否含 `conversations`）和底部「意味検索 ON / OFF」。客户端在第一次有效查询之前没有任何来源得到这两个值；另外客户端什么时候送 `semantic=1` 也没写（画板上没有可切换的开关，A2 说 pill 点了不做事）。 | `eventSearchQueryObject` 的 `q: min(1)`（`shared/api-schema/event-search.ts:34`，DESIGN 说沿用）；#53 可见文字含「言葉の意味でも探します。「投資家」で VC・CVC・エンジェルもヒットします」；DESIGN §5.1「App 初期画面底部…在 `available = false` 时不显示」 | 二选一并写进 §3.1：① 允许 `q` 为空（空 `q` 返回 `types` / `semantic` / `searchedPeople` 与空组，不触发限流计数）；② 另加 `GET /api/search/global/capabilities`（对标 Slack 搜索过滤器由能力接口决定）。同时补一句「客户端在 `semantic.available && enabled` 时送 `semantic=1`，否则不送」。PLANNER P04 / P05 的到达方式按此改。 |
| **M02** | DESIGN §3.1 `GlobalSearchEventHit.note`、§2.1 意味検索行、§3.2 イベント行；PLANNER 预检表 #55「参加者から → 活动 `people`」 | **「参加者から」在画板上是独立的玫瑰色小药丸，不是 `note` 文字的一部分**。DESIGN 把它拼进 `note`（「VC 3名が参加予定 · 今夜 · 参加者から」），实现后像素必然不对（11px 粗体、`rose-700` 字、`rose-100` 底、999 圆角，右侧对齐）。 | #55 / #58 / #71 源码：`<span>VC 3名が参加予定 · 今夜</span>` 与 `<span class="mr">参加者から</span>` 是两个元素；`.mr { font-size:11px; color:var(--rose-700); background:var(--rose-100); padding:2px 8px; border-radius:999px; font-weight:700 }` | 契约加字段，例如 `GlobalSearchEventHit.via?: "attendees" \| null`（文案进字典 `search.via.attendees`），`note` 只到「· 今夜」；§2.1 / §3.2 / 预检表同步改；`.mr` 样式照源码搬（颜色 token `--rose-700` / `--rose-100` 若 Web token 层没有，列进 C 组）。 |
| **M03** | DESIGN §4.1「すべて下每组最多 `limit`（默认 5）条」、§9 E4；PLANNER ①「画了 6 行…属截断显示 ✓」 | **规则与画板冲突**：#55 / #58 / #71 处于「すべて」chip，却画了 **6** 行人；按 §4.1 只能有 5 行。预检 ① 把它解释成「截断显示」并打 ✓，但没有改规则。像素门禁（P02 / P07）要求 6 行。 | #55 / #58 / #71 可见文字：人 · 23 后面 高橋 / 山本 / 森 / 伊藤 / 渡辺 / 中村 共 6 行；#57 / #54 关键词模式人 2 行无法区分 5 还是 6 | 把 §4.1 改成可同时满足两类画板的规则，推荐：「すべて」下每组默认 **6** 条（`limit` 默认 6；对标 Raycast / Linear ⌘K 每组 5–6 条），或意味検索模式每组 6、关键词模式 5 并写明理由。E4、PLANNER SC-R30-02「每组 5」、`tests/search/global-search.test.ts` 的覆盖项同步改。 |
| **M04** | DESIGN §4.1「单类型 chip 下最多 20 条…组尾『さらに表示（{total−20}）』」；§2.1 状态表；PLANNER 像素 SC 表 | **单类型 chip（只看「人」/「イベント」）的画面没有任何画板，而 DESIGN 为它新增了一个画板上不存在的元素「さらに表示」行**。HOW-TO 第 8 节：找不到画板的状态必须标「设计稿无」并先请用户拍板；RD-16 不许自己加元素。PLANNER 像素 SC 也没有这个画面（Tab 切到「人」后的样子）。 | HOW-TO §8「先找画板…标『设计稿无』并先请用户拍板画法，不许自己发挥」；README RD-16 ②；b5 列表 #53–#59 / #71 全是「すべて」状态 | §10 B 组加 **B9「⌘K / App · 单类型 chip 结果（人 20 条 + さらに表示）」**（浅 / 深），A 组加一条「单类型上限 20 与『さらに表示』行是否照 Slack『もっと見る』做」；PLANNER 像素 SC 加 P09（「设计稿无」+ 拍板结论），到位前按规则 11 暂缓；§2.1 状态表加「单类型」一行。 |
| **M05** | DESIGN §1.1 #5、§3.2 会話行、PLANNER「已查清的事实」第 3 条 | **事实错误**：写「sessions 列表的 `q` 只在 id + searchText + customTitle 上做 includes（title、首句、最后一条预览，**不含正文**）」。实际 live 的 `searchText` 是把**每条消息正文**追加进去的（上限 8000 字：前 2000 + 后 5999），所以 `q` 能命中正文（有上限、无命中片段）。「接口不存在」的结论要改成「接口存在但形状不够」：没有命中片段 / `href` / 收件箱，且是 live-record 全文 includes，不是搜索服务。归 R21 的结论可以不变，但理由要对。 | `features/orbit-ai/storage/orbit-agent-chat-session-live-record-provider.ts:685`（消息记录 `searchText` 含 `message.text`）、`:775, :811`（`newTexts.push(...message.text)`）、`:872`（`boundedSearchText([searchHead, ...newTexts])`）、`:197–198`（8000 / 2000）；`orbit-agent-chat-session-summary-page.ts:118–126` 只是 includes | §1.1 #5 改为：「`GET /api/ai/conversations/sessions?q=` 在 `id + searchText + customTitle` 上 includes，`searchText` 含标题与全部消息正文（截 8000 字），**没有命中片段、来源 `href`、收件箱**；要让画板的 `会話` 行成立需要 R21 交付 `searchConversations`」。PLANNER 第 3 条同步。顺带把「首句、最后一条预览」删掉（代码里没有这个口径）。 |
| **M06** | DESIGN §5.2「成本估算」 | **算术错误**：① 「286 人 ≈ 3 万 token ≈ **$0.0006 / 人**」——3 万 token × $0.02 / 1M = $0.0006 是 **286 人合计**，不是每人；② 「1 万用户 × 300 联系人 ≈ 6000 万 token」——按同一口径每人 ≈100 token，300 万联系人 ≈ **3 亿** token ≈ **$6**，不是 6000 万 / $1.2（6000 万相当于每联系人 20 token，与前文 60–120 矛盾）。查询部分（9000 万 token ≈ $1.8 / 月）正确。 | $0.02 / 1M token × 30,000 = $0.0006；10,000 × 300 × 100 = 3×10⁸ | 改成：初次索引 286 人 ≈ 3 万 token ≈ $0.0006（合计）；1 万用户 × 300 人 × ~100 token ≈ 3 亿 token ≈ $6 一次性；查询 ≈ $1.8 / 月。结论「成本在工程不在 token」仍成立。 |
| **M07** | DESIGN §6「查询文本不落日志」；PLANNER SC-R30-05「日志不含 `q`」 | **只覆盖了应用日志**。接口是 `GET …?q=`，查询文本会进 Vercel 请求日志 / 访问日志、代理日志和浏览器历史，这些不受「服务端日志只记长度」约束。隐私口径要么承认并写明（对标 GitHub / Slack 搜索同样 GET），要么改 POST（与现有 `/api/contacts/search`、`/api/search/relationships` 一致）。 | `app/api/contacts/search/handler.ts`（POST）、`app/api/search/relationships/route.ts`（POST）；`event-search` 为 GET | 推荐：保持 GET（可缓存、可深链 `/search?q=`）但在 §6 加一行「`q` 会出现在平台请求日志与浏览器历史，属已知；应用日志、账本、分析事件不记 `q`」，并把 SC-R30-05 的「日志不含 `q`」限定为应用日志 + 分析事件；若主会话要求更严，改 POST 并同步 App `search-api.ts`。 |
| **M08** | DESIGN §10 C2 / C3；PLANNER 预检 ③「缺：面板阴影、`.cnt` 字距」 | **C2、C3 两项都不是本面板的 token**：预检报的缺阴影元素是 `div.web.no-rail`（画板外框，等同手机画框装饰），画板里 `.wmodal` 用的就是现成 `var(--shadow-float)`；`.cnt「286」` 是背景人脈页的大数字（R11 元素，与「名前・会社・「投資家」」搜索框同理）。按 C2 补 `--shadow-modal`、按 C3 补 `--ls-tight` 都是为别处补 token。 | 预检输出「shadow … 例：div.web.no-rail」「letterSpacing -0.02 例：span.cnt「286」」；#57 源码 `.wmodal { … box-shadow: var(--shadow-float) }`、`<span class="cnt" data-to="286">` 在 `.big` 统计块内；`kit/tokens.css:65,114` 已有 `--shadow-float` 浅 / 深 | C2 改为「`.wmodal` 用现成 `--shadow-float`，外框阴影是画板装饰不实现（与规则 13 同口径）」；C3 改为「背景页元素，归 R11，不在本期」。C 组只剩 C1（`.kbd` 行高 1，kit `ui.css:433` 就是 `line-height:1`，预检结论成立）。预检表 ③ 同步。 |
| m01 | DESIGN §1.1 #10 | 路径错：`orbit-2026/shell/orbit-ask-routes.ts:38, 56` 不存在。`allowsOrbitAsk` 在 `app/(app)/app/orbit-global-ask/orbit-ask-routes.ts:56`（kiosk 注释在 :37），`shellAppliesTo` 在 `orbit-2026/shell/shell-routes.ts:21`。 | `ls app/(app)/app/orbit-2026/shell/` 无该文件；HOW-TO 第 7 节也写 `orbit-global-ask/orbit-ask-routes.ts` | 改成两个路径。 |
| m02 | DESIGN §3.2「近い条件なら」行 | `RelationshipNaturalSearchIndustry` 类型在 `features/search/contract.ts:25`，`IndustrySelectionContract` 在 `shared/contract/industries.ts:104`；`filter-options.ts` 只导出 `relationshipNaturalSearchAvailableFilters`（含业界标签与一级 / 二级）。另外 `href = /app/contacts?industry=` 写成「现有」，但人脈列表页 `AppContactsSearchParams` 是泛 `Record<string,…>`，仓库里能确认读 `industry` 的只有 `/api/search/relationships`（API）和 `network-0918` 分析页的筛选表单，列表页是否按 `?industry=` 筛选未证实。 | `features/search/filter-options.ts:11,23,65`；`contacts-route-view-model.ts:13`；`app/api/search/relationships/route.ts:44` | 路径写准；`href` 一句改为「R11 未做前暂按 `/app/contacts?industry=`（需实施时确认列表页读此参数，否则先落到人脈页并由 R11 接）」，并进 §11 待办。 |
| m03 | DESIGN §4.3「由 kit `.hl` 搬」 | kit `ui.css` 没有 `.hl`；画板高亮是 `mark { background: var(--rose-100); color: inherit; border-radius: 4px; padding: 0 2px }`（画板内联样式）。 | `grep '\.hl' kit/ui.css` 为空；#57 源码 | 改为「照画板 `mark` 规则搬（`--rose-100`、r 4、padding 0 2）」；若 Web token 层没有 `--rose-100` / `--rose-700`，并入 C 组。 |
| m04 | DESIGN §2.1 初期行、§10 B1 | Web 初期的示例标题写「こんな**ことも**検索できます」，App #53 画板是「こんな**検索も**できます」（§2.2 ①、§2.3 用的是后者）。B1 照 #53 补画时应与画板一致，避免两端两种文案。 | #53 可见文字 | 统一为「こんな検索もできます」。 |
| m05 | DESIGN §4.2 rank 0「氏名（或よみ）前缀」 | 联系人没有「よみ」字段（搜索字段表 §1.1 #3 / reader `contactSearchFieldsSql` 里没有；交接表 R17-09 也写「よみ没有数据源」）。 | `contact-list-postgres-reader.ts:131–142`；HANDOFF R17-09 | 删「或よみ」，或改为「有よみ字段后再加」。 |
| m06 | DESIGN §4.2 イベント排序「先 upcoming…再 past」 | 现成 `searchEvents` 只在 upcoming（开始时间 ≥ now−6h）里找，`createEventJourneyService().search` 不会返回 past；DESIGN 又说「只调用、不改」。规则里的 past 一档永远为空，测试也写不出。 | `features/events/journey/search-core.ts:43`（`upcoming = events.filter(...)`） | 改成「只搜 upcoming（沿用 R27），past 不在本期」，或在 §11 登记「past 活动搜索待 R27 扩 `searchEvents`」。 |
| m07 | DESIGN §3.1 `GlobalSearchPersonHit.status` / `reason`；§2.1 意味検索 | #55 / #58 的人行右侧只有理由行，没有状态 chip；契约两者都可同时有值，但没写渲染规则（有 `reason` 时不画 `status` chip？）。 | #55 源码人行只有 `<span>役職「パートナー」· VC</span>` | §4.5 加一句「`reason` 非空时右侧只画理由，不画状态 chip（画板如此）」。 |
| m08 | PLANNER 像素 SC 表 | 1024 列只给了 P01b / P02b / P03b，初期（P04，B1 到后）没有 1024 行；A3 的「同一面板 `--region`」对初期同样适用。 | A3 推荐；HOW-TO §8「每个画面写一条像素 SC」 | 加 P04b（1024 · 浅 / 深 · `--region`），B1 到后一起比。 |
| m09 | PLANNER「契约」节；DESIGN §3.1 / §7 | HOW-TO 第 3 节新增契约清单里的「`handlers.ts` 加处理函数（`redesignContractRoute`）」一项没有出现：DESIGN 把 handler 放在 `features/search/global/handlers.ts`，路由 re-export 它，而不是 `features/redesign-contracts/handlers.ts`。可以这样做（host-operations 也是自有目录），但要写明「不用 `redesignContractRoute`，`redesign-contract-routes.test.ts` 的 CASES 用自有 handler」并确认该测试的 harness 支持。 | HOW-TO §3 第 5 条第 4 小项；`features/redesign-contracts/service-factory.ts:10–33` | PLANNER「契约」节补一行说明；DESIGN §3.1 第 4 点补「handler 在 `features/search/global/handlers.ts`，mock / live 分支在那里按 capability 切」。 |
| m10 | DESIGN §7 App 测试、PLANNER 测试表 | App `tests/` 是平铺的（`*.test.ts(x)` 直接放在 `tests/`），没有 `tests/screens/` 目录。 | `ls repos/orbit-app/tests` | 改为 `tests/global-search-screen.test.tsx` 之类的平铺命名。 |
| m11 | PLANNER SC-R30-06 标注「**U01 / A1**」 | U01 是整条「全局搜索与 ⌘K 面板本体」（已移交 R30-01），不只是会話开关。标在 SC-06 容易让 REPORT 把 U01 当成「只处理会話 chip」。 | HANDOFF U01 / R30-01 | SC-01 标「R30-01 / U01」，SC-06 只标「A1」。 |
| m12 | DESIGN §5.1「底部 pill」 | #57 / #59 的「意味検索 ON」是 `span.lbl`（纯文字，`margin-left:auto`），不是 pill / 按钮；「点它不做任何事」的说法不必要。 | #57 源码 `<span class="lbl" style="margin-left:auto">意味検索 ON` | 改为「底部右侧文字 `lbl`，ON / OFF 只换字」。 |
| m13 | DESIGN §8 会話 fixture 第 1 条 | 画板会話行的副标题是「10/7 · iOrbit との会話」，fixture 写成「· 10/7」少了来源字段；同一行标题在画板里是「iOrbit：」前缀 + 标题两段。 | #54 / #57 可见文字 | fixture 写全两段：`title: "高橋 さんへのお礼の下書き"`、`subtitle: "10/7 · iOrbit との会話"`，`kind: "iorbit"` 由客户端画「iOrbit：」前缀（三语字典）。 |

## 逐条核对

| # | 清单项 | 结论 | 证据 / 备注 |
| --- | --- | --- | --- |
| 1 | HOW-TO 要求的 GOAL / PLANNER 要素 | **✓（有 2 处补）** | 单一目标、进入条件、已查清的事实（委托 DESIGN §1.1，11 条）、上下文包、关键符号与 impact（开工时重跑，与 R17 同写法）、易错边界、契约（7 处里缺 `handlers.ts` 的说明 → m09）、测试、SC-01–14、每画面像素 SC（画板文件 + 序号 + 宽度 + 主题 + 到达方式；B1 标「设计稿无」、1024 引 A3、390 引 G12）、预检五项 + 逐画板表、必需证据、执行顺序、失败与交接都在。缺口：单类型 chip 画面没有像素 SC（M04）、初期 1024（m08）。 |
| 2 | 交接表 R30-01 / U01 / R20-01 落进 SC；G12 / G14 / G15 / G18 / G25 | **✓** | R30-01 → SC-01（接口）、SC-02–04（分组 / 高亮 / 空结果）、SC-08（chip / 底部）；U01 → SC-06（标注位置见 m11）；R20-01 → SC-09。G12：像素 SC「Web 390 不做」+ SC-13；G14：SC-11「`orbit-ask-routes` 不变」；G15：SC-09 `parentForPath` + E10 普通二级页；G18：E11 `types` 决定可见性 + capability 第一天 live；G25：「分支」节按路径提交 + 失败与交接 3 轮停。R21 节「会話搜索接口形状」由 SC-14 追加 ✓。 |
| 3 | 「一套搜索服务两端同用」是否成立 | **✗（M01 / M02 / M05 修后成立）** | 逐元素：状态 chip → `status` ✓；理由行 → `reason` ✓；note → `note` ✓；建议行 emoji / 计数 / 去向 → `GlobalSearchSuggestion.emoji/count/href` ✓；ほかの方法两行 → `alternatives` ✓；「286人…」→ `searchedPeople` ✓；底部「意味検索 ON/OFF」→ `semantic` ✓（但初期状态拿不到 → M01）；「関連度順」→ `order` ✓；「参加者から」→ **无字段**（M02）；「意味で検索：…23人（一致 9 · 関連 14）」→ `semantic.matched/related` ✓。数据源表路径真实（`service-factory.ts:62`、`service.ts:111`、`search-core.ts:39/41`、`live.ts:159/215/235`、`handlers.ts:127`、`r27-journey-routes.test.ts:36/63` 全部核对一致）。会話「接口不存在」判断**理由不对**（M05）：`q` 实际能命中正文；缺的是命中片段 / `href` / 收件箱。 |
| 4 | 排序 / 分组 / 高亮 / 空结果自洽、可测、无遗漏状态 | **✗（M03 / M04 / m05 / m06 / m07）** | 「関連度順」已有 `order` ✓；「参加者から」见 M02；「すべて」每组 5 与画板 6 行冲突（M03）；单类型 chip 画面无画板却加元素（M04）；rank 0 的よみ无字段（m05）；past 活动不可达（m06）。高亮折叠映射、空结果「有活动命中仍显示『一致する人はいません』」的说明、建议 ≤2 / 计数 >0 / 固定 2 条都写清且可测 ✓。 |
| 5 | 限流与隐私 | **✓（M07 补一句）** | 未登录 401：`auth: "required"` 同 `event-search` ✓；本人数据：三源各自 actor 作用域 + 规则 A ✓；限流 60 / 20 次每分钟，写法引用 `assessment/service.ts:363–365`（`countUrlFetchesSince` ≥ N → `RATE_LIMITED`）与 `host/handlers.ts:130`（429）核对属实 ✓；对标 GitHub 搜索 API 30 次 / 分钟属实 ✓；必需证据「第 61 次 429」与 60 一致 ✓。应用日志不记 `q` ✓，但 GET `?q=` 进平台日志未覆盖（M07）。 |
| 6 | §10 A1–A4 与 B 组 | **✓（算术 ✗ → M06）** | A1–A4 每条「推荐 + 对标 + 不同意时」齐（A4 已定用「—」合理）。A1 按主会话要求：会話 chip 不显示 + `search.conversations` 开关 ✓；A2：`search.semantic` 默认关、不调付费 AI、开启实现（provider / 迁移 / 查询 / 账本）与成本都在 §5.2 ✓，但成本算术错（M06）。B1–B7 覆盖了全部「设计稿无」的宽度 / 主题：Web 深色 #57 / #59（B2 / B3；#58 已有 #71）、Web 初期（B1）、App 深色 ×4（B4–B7，参照 #65–#68 确为 App 深色画板 ✓）；1024 按 A3 不补画 ✓。没有把能力开关状态（live 三 chip、意味検索 OFF）当成补画 ✓（§10 B 末段明确）。遗漏：单类型 chip 画面（M04）。 |
| 7 | README 规则 13 与「缺 token」手机画框项 | **✓** | PLANNER ③ 与 DESIGN §10 C 末段把 54px 圆角 / island / 手机阴影 / 30 · 60 间距（4 块 × 5 = 20 项，与工具输出一致）全部按规则 13 归为外壳不实现、不补 token，正确。Web 侧同理的 `div.web.no-rail` 外框阴影却被当成面板阴影（M08），应同样按装饰处理。 |
| 8 | 文档互引一致 | **✓（m11）** | PLANNER P01–P08 ↔ DESIGN B1–B7、A3 对得上；SC-07 ↔ A2、SC-06 ↔ A1、SC-12 ↔ B1–B7、SC-14 ↔ §3.2 / §12；DESIGN §4.4 ↔ §11「出展 12社」；链接 `../search/DESIGN.md`、`PLANNER.md`、`REVIEW.md`、`../README.md#功能登记表`、`../events/DESIGN.md` 路径正确；参考画板 `b11-nav-v3.html` #43「④ 会話リスト · 検索」、`b2-events-flow.html` #10「探す · 検索输入中」、`b12-missing-states.html` #20 / #21 W-R06-07c 序号与标题核对一致。 |
| 9 | 事实 / 路径 / 行号 / 画板序号 | **✗（M05 / M08 / m01 / m02 / m03 / m05 / m10）** | 核对一致的：`CommandPalette.tsx` 140 行、`searchPeople` 6 条、`Orbit2026Shell.tsx:58`、`shell.ts:28–39, 58`、`contact-list-postgres-reader.ts:131–140, 790–800`、`event-search.ts` 校验 1–100 / 1–20 默认 5 `.strict()`、`sessions/handler.ts:121–134`、`summary-page.ts:118–126`、`inbox/notifications/handler.ts:18–21` 无 `q`、`service-factory.ts:10–33`、`ai-quota/constants.ts` 无搜索用途、`assessment/service.ts:363–365`、`recommendations/contract.ts:149`、`dashboard-distribution-contract.ts:11`、`TaskScreen.tsx:116` `router.push("/contacts/list")`、`DiscoverPage.tsx:25, 288`、`journey-api.ts:53`、`endpoints.ts:37, 69`、`legacy-ui-deferred.json` 现有 3 行、`route-parity(-exceptions)`、`demo-world/index.ts` 只有「高橋 美咲」；b5 #53–#59 / #71 序号与标题一致；预检数字一致。错的见左列。 |

## 处理记录

（由作者填写）

**2026-10-17，作者（文档会话）处理，全部修进 DESIGN v1.1 / PLANNER rev 2：**

| # | 处理 |
| --- | --- |
| M01 | DESIGN §3.1：`q` 允许为空 = 能力查询（返回 `types` / `semantic` / `searchedPeople` / `examples`），面板打开时先发一次；写明客户端何时送 `semantic=1` |
| M02 | DESIGN §3.1 / §8：`GlobalSearchEventHit` 加 `via: "attendees"`，「参加者から」由客户端画独立药丸；fixture 同步 |
| M03 | DESIGN §4.1 / E4、PLANNER SC-02：「すべて」每组默认 6 条（照 #58 / #55 / #71） |
| M04 | DESIGN §4.1、§10 新增 A5 与 B9：单类型画面同结构、不进门禁，「さらに表示」等 B9 补画；PLANNER「不进门禁」同步 |
| M05 | DESIGN §1.1 #5 改写：sessions `q` 能搜正文，缺的是命中片段 / `href` / 副标题与收件箱；PLANNER「已查清的事实」同步 |
| M06 | DESIGN §5.2 成本重算：单用户 ≈ $0.0006，1 万用户 ≈ 3 亿 token ≈ $6 一次性，查询 ≈ $1.8 / 月 |
| M07 | DESIGN §6：写明 GET `?q=` 会进平台请求日志与浏览器历史（与现有搜索接口相同），沿用 GET 并写 REPORT，用户要求时改 POST |
| M08 | DESIGN §10 C2 / C3 改为「不是本面板的元素，不补 token」，只剩 C1 |
| m01 | DESIGN §1.1 #10 路径改为 `shell/shell-routes.ts:21` + `orbit-global-ask/orbit-ask-routes.ts` |
| m02 | DESIGN §3.2 业界分类的类型位置改写；`?industry=` 不再称「现有」，由 R11 定参数名 |
| m03 | DESIGN §4.3：高亮照画板内联 `mark{background:var(--rose-100)}`，不引用不存在的 `.hl` |
| m04 | DESIGN §2.1 / B1 示例标题统一为「こんな検索もできます」 |
| m05 | DESIGN §4.2 rank 0 去掉よみ（R17-09 加字段后再纳入） |
| m06 | DESIGN §4.2 イベント排序改为沿用 `searchEvents`（只搜 upcoming） |
| m07 | DESIGN §3.1：`reason` 非空画理由行不画 chip，否则画 `status` chip；PLANNER SC-02 加断言 |
| m08 | PLANNER 像素 SC 加 P04b（初期 1024） |
| m09 | PLANNER 契约节 + DESIGN §3.1 末条：handler 放 `features/search/global/handlers.ts` 用 `redesignContractRoute` 包装，其余照 HOW-TO 清单 |
| m10 | App 测试文件改为 `tests/global-search-screen.test.tsx`（平铺） |
| m11 | U01 标到 SC-01，SC-06 只标 A1 |
| m12 | DESIGN §5.1：「意味検索 OFF」是 `span.lbl` 纯文字、不可点 |
| m13 | DESIGN §8 会話 fixture 补「· iOrbit との会話」副标题，「iOrbit：」前缀由 `kind` 画 |

未改：REVIEW 本身的「逐条核对」表保留复核时的原始结论（含 ✗），以本处理记录为准。
