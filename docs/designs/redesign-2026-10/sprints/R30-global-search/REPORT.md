# R30 全局搜索 — REPORT（2026-10-17）

范围：一套搜索服务两端同用（`GET /api/search/global`）、Web ⌘K 面板本体（替换 R07 人脈面板）、App `/search` + Task 左上 🔍 改接（R20-01）。没连 Neon、没部署、没调付费 AI（A2：意味検索默认关）。主会话 2026-10-17 定 DESIGN §10 A1–A5 全按推荐。

## 1. 提交

| 阶段 | 提交 |
| --- | --- |
| 文档期 | `ea4746015`（GOAL / PLANNER / DESIGN / REVIEW）、`faf5b2f5b`（A1–A5 记录）、`445c9f29a`（补画 B1–B9，design-decisions） |
| 实施（服务 + 两端 + 门禁清单） | `6536ba98c` |
| 独立复核修正 + 门禁归因 + #495 画板修正 + 收口文档 | 本 REPORT 所在提交（`git log -1 -- docs/designs/redesign-2026-10/sprints/R30-global-search/REPORT.md`） |

## 2. 成功标准

| SC | 结果 |
| --- | --- |
| SC-R30-01 接口 | ✅ 空查询只答能力（types / semantic / searchedPeople / examples，live 按语言给示例）；mock 三例（高橋 / 投資家 + semantic / 半導体 商社）与画板一致；live 编排人脈搜索、计划关联、R27 活动搜索、两条 count；401；429；`q` ≤100、未知参数 400。能力部分按 actor 缓存 5 分钟（复核 m4） |
| SC-R30-02 排序与分组 | ✅ rank 0–4 → 最終接点 → 名前；多词 AND、NFKC 折叠——live 按词分别召回再按 id 取交集（复核 M3）；每组 6；人数总数取来源 total（复核 m1）；0 组不画 |
| SC-R30-03 命中高亮 | ✅ 服务端码点区间，两端只渲染；関連项不高亮 |
| SC-R30-04 空结果 | ✅ すべて / 人：没有人也没有对话才算空（活动只喂「イベントで探す」）；単类型イベント / 会話（A5）：该组没有命中才算空，标题按类型、不出业界建议（复核 M2）；近い条件なら ≤2、计数 >0；ほかの方法固定 2 行 |
| SC-R30-05 隐私与限流 | ✅ 未登录 401；两 actor 隔离（人脈服务本人作用域 + count 带 user_id）；真实账号 60 / 20 次每分钟 429、不自动重试；示例世界不计配额（演示访客共用一个 actor，复核 m5）；日志只记长度 / 组数 / 耗时（新测试断言日志不含查询原文） |
| SC-R30-06 会話开关（A1） | ✅ live `types` 不含 conversations → 两端不画 chip 与组；mock 四 chip。接口形状写进交接表 R21-09 |
| SC-R30-07 意味検索开关（A2） | ✅ live `available=false`：Web 底部「意味検索 OFF」、两端初期说明行隐藏、示例只给关键词能用的；不调任何 AI；mock 下 #58 / #55 可达 |
| SC-R30-08 Web ⌘K 键盘与入口 | ✅ ⌘K / Ctrl+K（输入框里也开、普通键不开）、`orbit:open-palette` 入口不变；↑↓ ↵ Tab / Shift+Tab Esc；⌘↵ 与「紹介ルートを聞く」**只预填**（复核 M1，见第 6 节）；Shift+Delete 删高亮的最近搜索 |
| SC-R30-09 App 搜索页（R20-01） | ✅ `/search` 四态 + 検索中（300ms 后骨架、不转圈；新回答到之前保留上一批结果，复核 m7）；Task 🔍 → `/search`；キャンセル `router.back()`；`parentForPath('/search')` → Task；`?q=` 初始查询（R11 交接用）；私有 + 仅在线，离线清单登记，查询与结果不存本机 |
| SC-R30-10 文案与 token | ✅ Web `copy/search.ts` 与 App `i18n/*/search.ts` 同一组（三语）；`shell.ts` 删 9 个 `palette*` 键、无新增；copy:qa 回到基线 204 条（本 Sprint 新增 0）。字重 600 没有 token（kit 只有 400 / 500 / 700 / 800 / 900），照画板写 600；`.kbd` 行高 1（C1 近似项，门禁已过） |
| SC-R30-11 旧实现清理 | ✅ R07 面板本体删除，`orbit-ask-routes` 不变；App `/contacts/list` 只剩人脈页自己的跳转 |
| SC-R30-12 补画与暂缓 | b12 #482–#487 已进 Web 清单并通过；#490–#497 进 App 清单；#488 / #489（单类型 A5）与 #498 / #499（検索中 B8）按 PLANNER 不进门禁；#495 画板缺样式已修（决定表 §46） |
| SC-R30-13 通用口径 | G05 两端同一套服务与文案；G06 无付费 AI；G08 失败 / 429 各一行提示；G12 Web 390 不做（A4）；G14 `orbit-ask-routes` 不变；G15 契约只加不改（快照 686 类型）；G18 无 AI 入口；G21 深色两端都过；G25 / G26 离线清单与路由快照已登记 |
| SC-R30-14 交接 | ✅ 交接表 R11-15、R21-09、R21-10、R30-01（done）/ 02–05；DEFERRED-A §2 / §4 |

## 3. 像素门禁

### Web（`views/web-R30.json`，mock 服务器 orbits-r30 :3030，1440，只比面板本体）

背景 `/app/contacts` 是 R11 的画面，这台服务上仍是旧页、不跟深色，所以按面板本体比（`--region 380,96,680,<设计稿面板高>`）。

| 视图 | 结果 |
| --- | --- |
| W-R30-P01 名前（b5 #57）/ P01d（b12 #485） | ✅ raw 0.0007 / 0.0021 |
| W-R30-P02 意味検索（b5 #58）/ P02d（b5 #71） | ✅ 0.0049（头像按名取色 [data]）/ 0.0017 |
| W-R30-P03 結果なし（b5 #59）/ P03d（b12 #487） | ✅ 0.0003 / 0.0020 |
| W-R30-P04 初期（b12 #482）/ P04d（#483） | ✅ 0.0052 / 0.0073（画板把聚焦光标画成占宽竖线，[data]，已报主会话） |
| 1024（A3） | ⏸ 工具两侧只能同一区域，画板只有 1440 → 交接表 R30-02 |

门禁修出来的实现差异：面板双重内边距（Modal bare 与面板各 10）、类型 chip 应为 kit `.chip`（3/9 11 700，选中 lav）、输入框被 chip 挤到 2 字宽、「消去」误用全局 `.btn`、输入行高 1.5、示例 / 说明行内边距、页脚键帽间距、意味検索横幅只「23人」加粗、示例数据「高橋さん」多了空格。

### App（`views/app-R30.json`，iPhone 16e (r17)，Metro :8117，API :3030）

| 视图 | 结果 |
| --- | --- |
| A-R30-P05 初期（b5 #53）/ P05d（b12 #491） | ✅ raw 0.0235 / 0.0268 |
| A-R30-P06 名前（b5 #54）/ P06d（#493） | ✅ 0.0286 / 0.0282 |
| A-R30-P07 意味検索（b5 #55）/ P07d（#495，画板已修） | ✅ 0.0420 / 0.0377 |
| A-R30-P08 結果なし（b5 #56）/ P08d（#497） | ✅ 0.0311 / 0.0300 |

超阈值带全部归因（`attribution-redesign-R30-app.json`）：光标画法 [data]、头像按名取色 [data]、意味検索横幅 iOS 折行 [raster]、其余为同字同色 ±1px 的 RN 行高取整 / 3x 栅格差 [raster]；P05 / P07 各 1 处缺块提示是光标与横幅折行处，已看三联图。検索中（#498 / #499）按 PLANNER 不进门禁。

#495 画板：b12 `.g9` 漏抄了 b5 的 `.banner` 规则（#488 / #489 / #494 / #495 横幅无底色），主会话同意由本会话照 b5 #55 补上（决定表 §46 已记），序号不变。

## 4. 测试

- orbits：`tests/search/global-search.test.ts` 17 项（排序 / AND / 折叠 / 高亮 / 空结果含单类型 / 建议 / 401 / 429 / 隔离 / 日志不含查询 / 能力缓存 / live 交集 / 总数）、`tests/search/iorbit-prefill.test.ts` 2 项、`tests/ui/orbit-2026-cmdk.test.tsx` 4 项（含 ⌘↵ 只写预填交接单、不写待发送提问）、`tests/ui/orbit-2026-search-panel.test.tsx` 3 项、parity、路由 CASES。
- App：`tests/global-search-screen.test.tsx` 8 项（Chromium 实渲染：初期 / 名前 / chip 收窄与 A1 / 結果なし + 只预填 / 検索中 300ms + 429 / `?q=` / 纯函数 / 路由接线）。
- 全量：orbits 7443 项、失败 7，对基线新增 1 条「CSS Modules 只用 token」，来自 deferred-a-s3 会话 `2dcd114dc` 的 `plan/TypeDetail.module.css:270`（主会话已让该会话修），本 Sprint 新增 0；App 3322 项、失败 2，均在基线内，新增 0。typecheck / lint / copy:qa（204 条基线，新增 0）通过

## 5. GitNexus

改前 impact：CommandPalette HIGH、useCommandPaletteShortcut HIGH、Modal CRITICAL（只加可选 `bare`）、parentForPath HIGH（只加一个 case）、`takeAgentPrefill` LOW；契约常量与 TaskScreen UNKNOWN（只追加，已文本核对调用点）。detect-changes（`6536ba98c` 前）：影响流程 DiscoverTab / CommandPalette，均在预期内；列表里的 bridge/handoffs 等是别的会话未提交的文件，未提交。

## 6. 独立复核（1 个子代理）与处理

| # | 发现 | 处理 |
| --- | --- | --- |
| M1 | ⌘↵ /「紹介ルートを聞く」走 `ask.submit`，到 iOrbit 页会自动发送（付费 AI），违反 DESIGN §1「只预填」 | `useOrbitAsk().prefill` → `stashAgentPrefill({ origin: null })` → 工作台 `takeAgentPrefill` 填进输入区，用户自己发送；`origin: null` 按普通提问发出；「紹介ルートを聞く」预填设计里的问句（两端 `alternativePrompt`）；源码扫描测试改为断言 `ask.prefill`、不再有 `ask.submit` |
| M2 | 选「イベント」后永远显示「一致する人はいません」 | 服务端 core、mock、两端客户端空结果判定按所选类型；标题分 人 / イベント / 会話 三种；单类型不出业界建议 |
| M3 | live 多词 AND 与全半角折叠不成立（reader 只 like 整串） | 人脈按折叠后的词分别召回（≤4 词、每词 50 行）再按 id 取交集；活动传折叠后的词；新测试覆盖 |
| m1 | 人数总数被截在 20 | 单词用 reader 的 total，多词用交集数 |
| m2 | 「紹介ルートを聞く」预填原始查询 | 预填问句（同 M1） |
| m3 | 示例只给日文 | live 示例按语言（演示世界仍日文，数据是日文） |
| m4 | 空查询每次跑两条 count | 按 actor 缓存 5 分钟 |
| m5 | 演示访客共用一个限流配额 | 示例世界不计配额（内存计算、无库无 AI） |
| m6 | listbox 里混非 option、× 键盘够不到、tab 无对应 | 分组 / 横幅 / 空状态标 `presentation`，无行时不挂 listbox；空结果改由列表外的 `aria-live` 播报；tab 加 `aria-controls`；Shift+Delete 删最近搜索 |
| m7 | 两端「検索中」期间表现不一致 | 统一为保留上一批结果、300ms 未回答再出骨架（App 改） |
| m8 | 测试缺口 | 补日志、单类型、⌘↵ 不发送、live 交集；隔离测试仍用假端口（真实隔离由人脈服务的本人作用域保证，见人脈服务自己的测试），记此说明 |

## 7. 暂缓与交接

交接表 R11-15（人脈 🔍 与 `?industry=`）、R21-09（会話搜索接口）、R21-10（只预填通道）、R30-02（1024 工具）、R30-04（検索中 / 单类型不进门禁）、R30-05（意味検索授权）；DEFERRED-A §2 / §4 同步。另：orbits 全量里「CSS Modules 只用 token」失败来自别的会话未提交的 `plan/TypeDetail.module.css:270`，不是本 Sprint。

## 8. 追加：意味検索 lite 打开（2026-10-17，决定表 §50）

用户授权「打开意味検索」。没有 embedding provider，按 DESIGN §10 A2 选项② 先上 lite（静态同义词表），不调任何 AI、不记账本：
- `shared/compute/search-synonyms.ts`（App 同步一份）：投資家 / 決裁者 / 製造業 / 弁護士 / エンジニア 五个概念（日中英）；`liteMatch` 判「一致 / 関連」并生成画板式理由（役職「パートナー」· VC / 会社が VC / メモ「…」）。
- live `semantic.available = true`；`semantic=1` 且查询含概念时，概念词逐个召回（≤12 次）与字面 AND 召回合并；结果按 一致 → 関連、`order: relevance`、`semantic {enabled, matched, related}`；不高亮、不出状态 chip。
- 示例只给 lite 真能命中的（ja「投資家」「製造業の決裁者」）；App 初期说明行照画板显示。
- 两端客户端：账号有意味検索时默认送 `1`、底部「意味検索 ON」；本机偏好 `orbit.search.semantic=off` 时送 `0`、底部 OFF、说明行隐藏。设定页的开关界面没有画板，归 R18（交接表 R30-06）。
- 测试：orbits lite 单测 + live 编排（一致 / 関連 / 计数 / 召回次数上限 / semantic=0 不扩展 / 示例过滤 / 不引入 AI 客户端）、Web 面板偏好、App 偏好；门禁 #58 / #71 / #55 / #494 / #495 在 mock 下复跑见下。
- 真 embedding：等用户在 Vercel 设好 OpenAI key 后按 DESIGN §5.2 接（lite 留作无 key 时的退路）。

门禁复跑（mock，lite 改动后）：Web P01–P04 浅深 8 张全过（意味検索 P02 #58 / P02d #71 raw 0.0049 / 0.0017）；App P05 / P05d（初期，说明行）、P07 / P07d（#55 / #495 意味検索）全过，raw 与改动前一致。
