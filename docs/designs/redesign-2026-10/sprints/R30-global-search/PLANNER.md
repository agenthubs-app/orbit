# Sprint R30 — 全局搜索（两端）

**Plan revision:** 2（2026-10-17，文档期；按独立复核 [REVIEW.md](REVIEW.md) m08–m11 及 DESIGN 修订同步修订）。**模式:** existing-codebase / single-generator（执行人：小雨（甲））。**档位:** H。

**单一目标:** 两端全局搜索，一套服务（DESIGN §1.2）：
- 服务端 `GET /api/search/global`（契约 `global-search`，capability 第一天 live）：空查询给能力与示例；编排联系人列表搜索 + R27 `event-search` +（R21 后）会話搜索；分组、排序、命中高亮、空结果建议；401 / 429 / 本人数据隔离；
- Web ⌘K 面板本体重写（b5 #57 / #58 / #59 / #71 = 交接表 W-R07-05 / 06）；
- App 全屏搜索页 `/search`（b5 #53–#56）+ Task 左上 🔍 改接（R20-01）；
- 能力开关 `search.conversations`（R21 前关）与 `search.semantic`（默认关、不调付费 AI）。

**易读目标:** [GOAL.md](GOAL.md)。**整体设计:** [search/DESIGN.md](../search/DESIGN.md)。

**基线:** 开工时的 `redesign` HEAD（文档写于 `1deb5d032`）。

**进入条件:**
- DESIGN 已复核并按复核改完（[REVIEW](REVIEW.md)）；
- DESIGN §10 A1–A5：**主会话 2026-10-17 答复「全按推荐」**——按「推荐」做（A1 会話 chip 不显示、A2 意味検索默认关、A3 1024 同一面板按 `--region` 比、A4 390 不做、A5 单类型画面同结构不进门禁）；
- C1–C3 token 第一天补；
- B1–B9 补画到之前，对应画面按规则 11 暂缓（SC-R30-12）。

**分支:** 一人做，直接在 `redesign` 上提交；共用工作区按路径提交（G25）。

## 已查清的事实（`1deb5d032`，开工时用 GitNexus 复核）

见 DESIGN §1.1，共 11 条。施工时最容易踩的几条：
- 交接表写的「web.html W-R07-05 / 06」是 R07 门禁的**视图名**；画板在 `b5-me-inbox.html` #57 / #59（+ #58 / #71 意味検索），`web.html` 里没有 ⌘K 画板。
- `event-search` 已 live，未登录 401；`people` 子组受规则 A 限制。
- 会話没有现成接口：sessions 列表的 `q` 能搜正文（`searchText`），但没有命中片段 / `href` / 副标题，收件箱没有 `q`（DESIGN §1.1 #5）。
- 没有 embedding 能力，DeepSeek 没有 embedding 接口。
- App Task 🔍 现在 `router.push("/contacts/list")`（`TaskScreen.tsx:116`）。
- 联系人搜索的字段 = 氏名、役職、会社、所在地、profile_snippet、relationship_context、next_action（`contact-list-postgres-reader.ts:131`）。

## 上下文包

### 必读
- DESIGN 全文；REVIEW 处理记录；交接表「R30 搜索」R30-01、U01、R20-01、G01–G26（重点 G05 / G06 / G08 / G12 / G14 / G15 / G18 / G21 / G25 / G26）；决定表 §9-1、D16；README 规则 11 / 12 / 13；DEFERRED-A §1「全屏搜索页容器」、§2「R30 ← R21」。
- 设计稿：`b5-me-inbox.html` #53–#59、#71；参考 `b11-nav-v3.html` #43、`b2-events-flow.html` #10、`b12` #20 / #21（W-R06-07c 容器）。一律 `--extract-board` 单块抽取。
- 代码：`orbit-2026/shell/CommandPalette.tsx`、`orbit-2026/copy/shell.ts`、`features/events/journey/{service,search-core,handlers}.ts`、`shared/contract/event-search.ts`、`shared/api-schema/event-search.ts`、`features/contacts/storage/contact-list-postgres-reader.ts`、`features/search/filter-options.ts`、`features/redesign-contracts/service-factory.ts`、App `src/screens/task/TaskScreen.tsx`、`src/screens/events/v2/DiscoverPage.tsx`（搜索页与最近搜索的现成做法）、`src/view-models/app-navigation.ts`。

### 关键符号与 impact（开工时重跑，结果写 REPORT）
- `CommandPalette` / `useCommandPaletteShortcut`：重写本体，保持导出名与 props（`open` / `onClose`），壳不改。
- `createContactsListSearchAndFilterService`：只调用，不改。
- `contact-list-postgres-reader.ts`：只加 `countByIndustry`（追加函数，不改现有 SQL）。
- `createEventJourneyService().search` / `searchEvents`：只调用；`normalize` 搬到 `shared/compute/search-normalize.ts` 后 R27 改引用（只搬不改，测试不变）。
- `REDESIGN_CONTRACT_CAPABILITIES` / `REDESIGN_CONTRACT_LIVE_CAPABILITIES`：只追加 `global-search`（预期 CRITICAL，对策「只追加」）。
- `TaskScreen`：改一行跳转目标。
- `parentForPath`：加 `/search` 一项。
- `shellCopy.palette*`：只减不增；新文案进 `copy/search.ts`。

### 易错边界（全部写进 SC）
- **隔离**：别的 actor 的联系人 / 会話出现在结果里；未报名活动的参加者名字进了 `note`；`sample` 数据在 live 出现。
- **输入**：`q` 空 / 全空白 / 101 字；多词只命中一个词也算命中；全半角、大小写不折叠；NFKC 折叠后高亮位置错位（映射回原文）。
- **分组**：0 条的组画了空标题；「すべて」每组超过 5；组计数用了显示条数；コマンド 组在 App 出现。
- **空结果**：有活动命中却显示「一致する人はいません」（画板如此，是正确行为，别「修」掉）；建议计数为 0 的行仍显示；没有业界匹配时画了空的「近い条件なら」；「ほかの方法」少于 2 行。
- **能力开关**：`types` 不含 `conversations` 时客户端仍画 chip；`semantic.available=false` 时底部仍显示 ON / App 初期显示说明行；mock 下开关没按 fixture 打开导致 #58 / #55 截不出。
- **键盘**：Tab 跑出面板；↵ 在建议行无反应；⌘↵ 发送了消息（只能预填）；Esc 没清空输入；打开面板时焦点不在输入框。
- **请求**：没防抖、旧响应覆盖新结果（竞态）；429 自动重试；查询文本进日志。
- **App**：搜索页用 `AppScreen` 带出了标题栏；状态栏被画了（规则 13）；返回走错一级页；`/contacts/list` 跳转仍在 Task。
- **提交**：契约改了 App 副本没同步；`shell.ts` 的旧 `palette*` 键删了但别处还在用（`copy:qa`）。

## 契约（第一天提交，`contract:` 开头，「App 需要同步」）

- 新 `shared/contract/global-search.ts`、`shared/api-schema/global-search.ts`（DESIGN §3.1）；`index.ts` 导出；快照 `--write`；parity 一行；App `sync:contract` 同一提交。HOW-TO 第 3 节清单里的 handler 放 `features/search/global/handlers.ts`（用 `redesignContractRoute` 包装），`mock-service.ts` 加分支，其余照清单（DESIGN §3.1 末条）。
- capability `global-search`：`REDESIGN_CONTRACT_CAPABILITIES` + `REDESIGN_CONTRACT_LIVE_CAPABILITIES`；`mock-service.ts` 行为 = `shared/mock/demo-world/global-search.ts`（DESIGN §8）。
- 不改 `event-search` 契约。

## 迁移

无（本期不建索引、不加表）。意味検索开启时的 `search-embeddings` 迁移见 DESIGN §5.2，不在本期。

## 范围与文件

见 DESIGN §7。**不在本期**：会話数据源（R21 / R13）、embedding（授权后）、人脈页 🔍 接线（R11-02）、探す搜索页改造（R27 已交付）、全屏搜索页容器组件（乙组件库）。

## 测试

| 文件 | 覆盖 |
| --- | --- |
| `tests/search/global-search.test.ts`（orbits，新） | 排序 rank 0–3、多词 AND、NFKC / 全半角折叠、高亮区间（含折叠映射）、组截断与总数、空结果建议（业界匹配 / 无匹配 / 计数 0 过滤）、`alternatives` 固定 2 条、两个 actor 隔离、规则 A、`types` 随开关、`semantic.available=false`、401、429、`q` 边界 |
| `tests/api/redesign-contract-routes.test.ts` | `global-search` mock 成功 / live 401 |
| `tests/contracts/redesign-schema-parity.check.mts`、`demo-world-consistency` | 契约 parity；fixture `sample: true` |
| `tests/ui/orbit-2026-search-panel.test.tsx`（新） | 四态渲染、chip 切换、↑↓↵ Tab Esc ⌘↵、最近の検索、`shellCopy.palette*` 归零 |
| `tests/ui/api-auth-proxy-boundary.test.ts` | `/api/search/global` 需登录 |
| `tests/events/r27-journey-routes.test.ts` | 不变（normalize 搬家后仍过） |
| App `tests/global-search-screen.test.tsx`（新；App `tests/` 平铺） | 四态、chip、点人 / 活动 / 建议跳转、キャンセル、Task 🔍 → `/search` |
| App `tests/route-parity.test.ts`、`contract-fixtures-parse.test.ts`、`legacy-ui-ratchet` | `/search` 多出不需例外；fixture 解析；手写容器登记 `legacy-ui-deferred.json` 一行 |
| 三语 | `npm run copy:qa` 0；`hardcoded-copy` 门禁零新增 |

基线按 HOW-TO 第 0 节第 3 条记录（已知失败以 README 骨架登记表最后一行为准），收口零新增。

## 验收契约

| SC | 操作链 | 主证据 |
| --- | --- | --- |
| SC-R30-01 接口（**R30-01 / U01**） | `GET /api/search/global`：空查询返回能力与示例；mock 三例（高橋 / 投資家+semantic / 半導体 商社）形状与画板一致（含 `via`、`examples`）；live 编排三源；401；429；`q` 边界 | `global-search.test.ts` + 路由 CASES |
| SC-R30-02 排序与分组 | rank 0–3、AND、组顺序、每组 6 / 单类 20、总数、0 组不画；`reason` 与 `status` 二选一渲染 | 单测 + 渲染 |
| SC-R30-03 命中高亮 | 两端用服务端 `highlights`；折叠映射正确；関連项不高亮 | 单测 + 两端渲染 |
| SC-R30-04 空结果 | 标题 / 副标题 / 近い条件なら（≤2、计数>0）/ ほかの方法（2）/ 首行焦点 | 单测 + 像素 P03 / P08 |
| SC-R30-05 隐私与限流 | 两 actor 隔离、规则 A、未登录 401、60 / 20 次每分钟 429、日志不含 `q`、最近の検索不上传 | 单测 + 代码检查 |
| SC-R30-06 会話开关（**A1**） | live `types` 不含 conversations → 不画 chip 与组；mock 四 chip；开关打开后的接线点有测试桩 | 单测 + 渲染 |
| SC-R30-07 意味検索开关（**A2**） | `available=false`：底部「意味検索 OFF」、App 说明行隐藏、不调任何 AI；mock fixture 下 #58 / #55 画面可达 | 单测 + 像素 P02 / P07 |
| SC-R30-08 Web ⌘K 键盘与入口 | ⌘K / 左栏 🔍 / 标题区 🔍 / 右栏入口；↑↓↵ Tab Esc ⌘↵（只预填）；输入框内 ⌘K 仍开、普通键不开（R07 回归） | 渲染测试 + 点击验证 |
| SC-R30-09 App 搜索页与入口（**R20-01**） | `/search` 四态；Task 🔍 → `/search`；キャンセル 回来源页；无状态栏（规则 13）；`parentForPath` | App 测试 + 像素 P05–P08 |
| SC-R30-10 文案与 token | 三语进 `copy/search.ts`；`shell.ts` 旧键只减不增；C1–C3 token 补齐，无手抄近似值 | `copy:qa` + 门禁 |
| SC-R30-11 旧实现清理 | R07 面板本体代码删除；`orbit-ask-routes` / G14 不变；`/contacts/list` 跳转只剩人脈页自己的 | 测试 + grep |
| SC-R30-12 补画与暂缓（**B1–B9**） | 补画认可后加进 `views/*-R30.json` 重比；暂缓项登记交接表 R30 节 + DEFERRED-A | 门禁总表 |
| SC-R30-13 通用口径 | G05 / G06 / G08 / G12 / G14 / G15 / G18 / G21 / G25 / G26 逐条 | REPORT 逐条 |
| SC-R30-14 交接 | 交接表 R21 节追加「会話搜索接口形状（DESIGN §3.2）」、R11 节追加「人脈 🔍 → `/search`、`industry` 参数」；DEFERRED-A §2 R30 行补细节；§4 加「意味検索授权」 | 交接表 diff |

### 像素 SC（README 通用规则 11；规则 13）

- 归因文件：`repos/orbits/scripts/visual/attribution-redesign-R30.json`（Web）、`attribution-redesign-R30-app.json`；画面清单 `views/web-R30.json`、`views/app-R30.json`（mock 服务器 `ORBIT_REDESIGN_MOCK=global-search,…`，独立端口 / `distDir`）。
- **每行一个画面**，浅 / 深各一张；Web 1440 截完整页面（含壳，背景 `/app/contacts`，面板用 `--steps` `{"keys":"Meta+k"}` + `{"type":"高橋"}` 打开）；App 模拟器真实画面（iPhone 16e）。
- Web 1024：按 A3 推荐只比面板区域（`--region`，面板居中位置由实施算出写进 views）；Web 390：不做（G12）。深色、Web 初期：**设计稿无**，B1–B9 补画后加行；在那之前标「暂缓」。

| SC | 画面 | 画板 | 宽度 / 主题 | 到达方式 |
| --- | --- | --- | --- | --- |
| P01 | ⌘K · 名前（結果） | `b5` #57 | 1440 · 浅；深 **B2** | `/app/contacts` → ⌘K → 输入「高橋」（mock：四 chip、会話 2 条） |
| P01b | ⌘K · 名前 · 1024 | `b5` #57（A3：`--region` 面板） | 1024 · 浅；深 B2 | 同 P01 |
| P02 | ⌘K · 意味検索 | `b5` #58（浅）/ #71（深） | 1440 · 浅 / 深 | ⌘K → 输入「投資家」（mock：`semantic` fixture 开） |
| P02b | ⌘K · 意味検索 · 1024 | 同上（`--region`） | 1024 · 浅 / 深 | 同 P02 |
| P03 | ⌘K · 結果なし | `b5` #59 | 1440 · 浅；深 **B3** | ⌘K → 输入「半導体 商社」 |
| P03b | ⌘K · 結果なし · 1024 | 同上（`--region`） | 1024 · 浅；深 B3 | 同 P03 |
| P04 | ⌘K · 初期 | **B1**（设计稿无） | 1440 · 浅 / 深 | ⌘K，不输入（mock：最近の検索 4 条） |
| P04b | ⌘K · 初期 · 1024 | B1（`--region`） | 1024 · 浅 / 深 | 同 P04 |
| P05 | App ① 検索 · 初期 | `b5` #53 | App · 浅；深 **B4** | Task 左上 🔍（mock：最近の検索 4 条；`semantic.available=true` 时说明行出现——按 fixture） |
| P06 | App ② 結果 · 名前 | `b5` #54 | App · 浅；深 **B5** | 输入「高橋」 |
| P07 | App ③ 結果 · 意味検索 | `b5` #55 | App · 浅；深 **B6** | 输入「投資家」（mock semantic 开） |
| P08 | App ④ 結果なし | `b5` #56 | App · 浅；深 **B7** | 输入「半導体 商社」 |

**不进门禁**：検索中（B8 可选）、单类型 chip 画面（A5 / B9 补画后加）、live 三 chip 状态与「意味検索 OFF」状态（能力开关的数据状态，A1 / A2）、Web 390（G12）、Task 页本身（R05 / R20 的画面）。

### 画板预检（HOW-TO 第 8 节；`board-preflight.mjs` 2026-10-17 实跑：`--design b5-me-inbox.html --board-index 53,54,55,56,57,58,59,71`；开工时对 `views/*-R30.json` 重跑并更新本表）

**五项总结论**：
- ① 自洽：8 块画板**疑似不自洽 0 处**（工具）；人工核对：#57 / #54「人 · 2」= 2 行、「イベント · 1」= 1 行、「会話 · 2」= 2 行 ✓；#58 / #55「23人（一致 9 · 関連 14）」= 9 + 14 ✓，画了 6 行（n > 5 且有「関連度順」尾注，属截断显示）✓；#59 / #56「286人」与背景人脈页「286 人」一致 ✓。
- ② 数据来源：全部元素都有来源（下表）。**疑似无功能 6 处全部有解释**：🎤 是活动 emoji（`event-emoji.ts`，与 R27 PLANNER 同一结论，非语音）；「名前・会社・「投資家」」是背景人脈页的搜索框（R11 的画面，不是本 Sprint 元素）。没有要「去掉 / 记为以后」的元素；唯一没有字段的是「出展 12社」（DESIGN §4.4，按数据文字处理）和「VC 3名が参加予定」的人数（由 `people` 条数算）。
- ③ token：近似但不等 4 项（都是 `.kbd` 行高 1 vs `--lh-display` 1.05）、缺 token 28 项（Web：阴影 ×4、字距 -0.02 ×4；App：全是手机画框外壳 54px 圆角 / 黑色 island / 手机阴影 / 30 · 60 间距 ×4 块 ×5）→ DESIGN §10 C1–C3；画框外壳按规则 13 不实现。
- ④ 组件：`Modal top`（W-R06-07c 560 / 680 容器，G23 已知 Modal 差在 380 档，与本面板无关）、`Chip`、`Kbd`（G23b 字色待定，C1 一并处理）、`Avatar`、`MacTile`（emoji 方块，G23b 21 / 17）；App 全屏搜索页容器缺（DEFERRED-A §1），到位前手写并登记。
- ⑤ fixture：DESIGN §8 三个输入照画板造；中途状态「弹层打开」= `--steps` 按 ⌘K 并输入；App 用深链 `/search?q=` 或输入步骤。宽度 / 主题：Web 只有 1440 浅（#58 另有深 #71），App 只有浅 → B1–B9 与 A3。

| 画板 | ① 自洽 | ② 输入框 / 疑似无功能 → 结论 | ③ token（近似 / 缺） |
| --- | --- | --- | --- |
| b5 #53 ① 検索 · 初期（App） | ✓ | 搜索输入 → `q`；最近の検索 → 本机存储；示例 chip → 字典；底部说明 → `semantic.available` | 近似：无；缺：手机画框外壳 5 项（规则 13） |
| b5 #54 ② 結果 · 名前（App） | ✓ | 🎤 = 活动 emoji（非语音）；状态 chip → `status`；会話两行 → R21 / R13（本期 fixture） | 同上 |
| b5 #55 ③ 結果 · 意味検索（App） | ✓（9 + 14 = 23） | 理由行 → `reason`；「関連度順」→ `order`；「参加者から」→ 活动 `people` | 同上 |
| b5 #56 ④ 結果なし（App） | ✓ | 两组建议 → `suggestions` / `alternatives`；人数 → `count`；「出展 12社」无字段 → 数据文字 | 同上 |
| b5 #57 ⌘K · 名前（Web） | ✓ | 背景人脈页搜索框 = R11 元素；🎤 同上；Esc / ⌘ / ↵ 键帽 → `Kbd`；「意味検索 ON」→ `semantic` | 近似：`.kbd` 行高 1 ×7；缺：面板阴影、`.cnt` 字距 -0.02 |
| b5 #58 ⌘K · 意味検索（Web 浅） | ✓ | 同 #55 + コマンド 行 → `useOrbitAsk` | 同 #57 |
| b5 #59 ⌘K · 結果なし（Web） | ✓ | 同 #56 + 底部提示行 | 近似：`.kbd` 行高 1 ×5；缺：同 #57 |
| b5 #71 ⌘K · 意味検索（Web 深） | ✓ | 同 #58 | 近似：同；缺：深色阴影首层 `rgba(255,255,255,.06)`、字距 |

### 必需证据子表

| SC | 子断言 | 证据 |
| --- | --- | --- |
| 01 / 05 | 两 actor 各建联系人后互搜 0 条；未报名活动的参加者不进 `note`；61 次 / 分钟第 61 次 429 | 测试输出摘要 |
| 06 / 07 | live 响应 `types=["people","events"]`、`semantic.available=false`；mock 响应四组 + `semantic.enabled=true` | 响应样本（REPORT 附 JSON 摘要） |
| 09 | Task 🔍 → `/search` → キャンセル 回 Task（模拟器录屏或两张截图） | 证据目录 |
| P01–P08 | 门禁总表，证据目录 `~/orbit-sprint-evidence/redesign/R30/run-01/` | REPORT |
| 全部 | 三语、`copy:qa` 0；两端全量零新增失败；`tsc`、`typecheck:app`、`lint`；`detect-changes` | 全量清单 |

## 执行顺序

1. 索引、`impact`；C1–C3 token；契约 + capability + mock fixture（App 同步）提交。
2. `shared/compute` 纯函数（RED 先行：normalize / terms / highlight / rank）→ 编排服务（三源、建议、开关、限流）→ 路由与测试。
3. Web：面板本体（照 #57 源码搬）→ 結果なし → 意味検索（fixture）→ 初期（B1 到后）→ 键盘 → 删旧本体（边写边比 `--style-diff`）。
4. App：`/search` 四态 → Task 🔍 改接 → `parentForPath` → `legacy-ui-deferred.json` 登记。
5. 交接表 / DEFERRED-A 追加（SC-14）；全量、REPORT、`detect-changes`、提交推送；独立复核 → 修复 → 模拟器走查。

## 失败与交接

- **B1–B9 未到**：对应画面暂缓，REPORT 列出；门禁总表只含能截的。
- **A1–A5 未答**：按推荐做（进入条件）。
- **R21 接口迟迟不到**：本期收口不等它；`search.conversations` 开关与接线桩留在代码里，DEFERRED-A §2 那一行写上接线点文件。
- **同一画面 3 轮不过**：停下，写「未过」清单并 SendMessage 主会话（G25）。
