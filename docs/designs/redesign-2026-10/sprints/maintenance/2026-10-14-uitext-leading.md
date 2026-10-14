# App 日文混排行距修正（UiText leading，2026-10-14）

来源：R25 `REWORK-REPORT-app.md` §9.2-1、交接表 R24-11「待 UiText 行距」。口径：决定表 §19-2 / §20。

## 1. 方案（动代码前写定）

### 1.1 根因复查
- RN 0.86 Fabric 的 `RCTTextLayoutManager` 已经 `layoutManager.usesFontLeading = NO`，`lineHeight` 写成 NSParagraphStyle `minimumLineHeight = maximumLineHeight`。所以「原生侧关 usesFontLeading」这个候选**已经是现状**，不解决问题。
- R25 第 3 轮的推断模型（**实验后被推翻，见 §2.1**）：TextKit 的行高 = max(lineHeight, 该行各字体的 最大 ascender + 最大 descender + 最大 leading)，maximumLineHeight 压不住字体自带 leading。Hiragino Sans leading 0.5em，SF 为 0：
  - 纯 Hiragino 行：asc+desc+leading = 1.5em，lineHeight ≥ 1.5em 时不变（设计稿大多 ≥ 1.5em）；
  - 含 SF 拉丁字 / 数字的行：SF asc+desc（16.5px 19.43）+ Hiragino leading 8.25 = 27.7 > 24.75；12px：14.13 + 6 = 20.1 > 18.6。
- 当时推断：多出来的高度只是字体 leading。

### 1.2 候选比较
| 候选 | 结论 |
|---|---|
| UiText 显式 lineHeight + 像素补偿 | 不可行：哪一行含拉丁字取决于折行，JS 侧不知道；补偿会让纯日文行变矮 |
| 拆混排 run / 拉丁字也换 Hiragino | 拉丁字字形变成 Hiragino 的，偏离设计稿（R05 选择 (b) 明确拉丁字用 SF） |
| 改日文 locale 的拉丁字 fallback 顺序 | 同上，且 iOS 不提供按 run 改 cascade 的 RN 入口 |
| 原生关 usesFontLeading | 已经是 NO（见 1.1），无效 |
| **原生 NSLayoutManagerDelegate 逐行定高**（采用） | iOS 上做「精确行高」的成熟做法（`layoutManager(_:shouldSetLineFragmentRect:…)`，CJK 阅读 / 排版类 App 常用）；只改长高的那一行，等于 CSS 固定 line-height 的行为 |

### 1.3 做法与影响面
- 本地 Expo 模块 `repos/orbit-app/modules/orbit-text-leading`（ios/ 是 CNG 生成目录，不能直接改；不 patch RN 源码）。+load 时钩 `-[NSLayoutManager setUsesFontLeading:]`：RN 在 `RCTTextLayoutManager` 新建 NSLayoutManager 后立刻设 NO，此时（普通 NSLayoutManager、还没有 delegate）挂一个共享的行片段 delegate。
- delegate 只改同时满足 4 条的行：① 段落有固定 lineHeight（min == max）；② TextKit 给的行高 > lineHeight；③ 行内没有附件（内嵌 View / 图片）；④ 行内所有字体的 asc+desc（含 RN 的 baselineOffset）≤ lineHeight——即多出来的只有字体 leading。改法：行高设回 lineHeight，基线随之上移同样的量（TextKit 把多出的高度加在字形上方，字形相对行底不动，与同 lineHeight 的纯行一致——实验核对见 §2）。
- 不受影响：纯 SF 行（leading 0，不会长高）、纯 Hiragino 行（lineHeight ≥ 1.5em 时不长高）、没写 lineHeight 的文字、行内大字号 / emoji 撑高的行（④ 不满足）、TextInput（UITextView 自带布局，不走这条路）、Android。UiText 本身不改（impact CRITICAL 253 的 JS 组件不动）；影响面 = iOS 上所有 RN Text 中「混排且长高」的行，正是 bug 本身。
- 开关：NSUserDefaults `OrbitTextLeading`（每次启动读一次）：`off` = RN 原行为（A/B 用）、`log` = 打开并打印每一行的改动。默认开。
- A/B：同一构建，`xcrun simctl spawn <udid> defaults write app.agenthubs.orbit OrbitTextLeading off|on` 后重启 App，R05 壳 / R12 / R15 / R16 / 计划已过 9 屏各截一次，先比 App 截图本身（没变的画面直接判不变差），变了的再看门禁带。

> 下面 §1.3 是动代码前写定的初版方案（按 R25 的「行高被 leading 撑高」模型）；§2.1 的实验推翻了这个模型，终版做法见 §2.2，开关与 A/B 方法不变。

## 2. 实验与终版

### 2.1 实验：行盒不高，是基线不齐
log 模式下逐行打印 TextKit 给的行片段（A-R24-07 类型详情一屏全部文字）：**每一行的高度都正好等于 lineHeight**，没有一行被撑高；不同的是基线：
| 段落 | 纯 Hiragino 行基线 | 含 SF 的行基线 | 差 |
|---|---|---|---|
| 12px / lh 18.6（候补理由） | 17.16 | 15.71 | 1.45 |
| 11px / lh 16.5 | 15.18 | 13.85 | 1.33 |

TextKit 在固定行高下把基线放在「lineHeight − 该行最大 descender」。SF 的 descender（0.241em）比 Hiragino（0.12em）大，含拉丁字 / 数字的行于是比纯日文行高 1.3–2pt；上一行混排、下一行纯日文时，两行文字看起来就差 lineHeight + 1.5～2（16.5px 量出 27、12px 量出 20），段落总高度其实不变。R25 的「1.68em」是用墨迹行间距反推的，巧合地与 asc+desc+leading 吻合。

### 2.2 终版做法
- kit 字体栈 `-apple-system, "SF Pro Display", "SF Pro Text", "Hiragino Sans", …` 以 SF 打头，Chrome 的每一行共用 SF 的 strut：基线 = (lineHeight − (SF ascender + descender)) / 2 + SF ascender，Hiragino 字形也落在这条基线上。
- 原生模块 `repos/orbit-app/modules/orbit-text-leading`（本地 Expo 模块，`ios/OrbitTextLeading.m`）：钩点同 §1.3（RN 建 NSLayoutManager 后设 usesFontLeading = NO 时挂行片段 delegate）；delegate 把**日文段落里**的每一行基线放到上式位置（再加回 RN 自己的 NSBaselineOffset，绘制时会减掉）。
- 只动同时满足的行：① 段落固定 lineHeight（min == max）且 TextKit 给的行高就是它；② 这段文字里有同字号的 Hiragino Sans（= 日文 UI 的 UiText）；③ 该行没有附件、只含系统字体（SF）和 Hiragino Sans、字号一致。没写 lineHeight、非日文、全 SF 的文字、含 emoji / PingFang 等回退字体的行、混字号的行、内嵌 View 一律不动；TextInput、Android 不经过这里。UiText（JS，impact CRITICAL 253）一行没改。
- 候选「hira」（混排行下移到纯日文行位置，纯日文行不动）也实现过一版做 A/B（§3），整体更差，删掉。
- 开关：NSUserDefaults `OrbitTextLeading`：`off` 关、`log` 开并打印每一行改动；不设 = 开。

## 3. A/B 重比（同一构建，`defaults write app.agenthubs.orbit OrbitTextLeading off|on` 后重启 App；16e 3BE3…，mock :3206，Metro :8084）

证据：`~/orbit-sprint-evidence/redesign/R23-25-app/L-{off,hira,css,fin}/`（fin = 终版代码，与 css 逐张一致），重算 `RS/`，脚本 `ab3.sh`、`tools/newbands.py`。

### 3.1 已通过的画面（不得变差）
| 组 | off（修前） | 终版 | 说明 |
|---|---|---|---|
| 计划已过 A-R23-02a / 03 / 04 / 09a / 10、A-R25-09（浅深 12 张；05、A-R25-03 需手点，未重截） | 全过 | 全过 | raw：03 0.030→0.029、04 0.046→0.043、09a 0.037→0.036、A-R25-09 0.036→0.035；02a 0.061→0.067；10 0.0785→0.079，新出 1 条带（y 510-540，dx 0 dy 0，同字）记 [raster] |
| R12 App A-R12-02 / 03 / 04 / 46 / b9-00 | 全过 | 全过 | 03 / 04 / 46 / b9-00 各新出 1 条超阈带，dx 0 dy ≤1、ΔE 0（如 03「続けて撮る」），裁剪核对同字 → [raster]（写入 attribution-redesign-R12-app.json），重算 PASS |
| R05 壳（区域门禁 region.mjs，`--grid 30`） | — | 持平 / 更好 | Task 顶栏 0,50,390,128：04 / 05 / 07 0.016→0.019（副标题日期「10月7日（水）」混排行亚像素下移，墨迹行 ≤1px，肉眼同）；首页头 .hhead 01 0.078→0.081（同因）；マイページ 顶栏 11 0.016→0.012 更好；底栏胶囊全部不变 |
| R16 App 01–05 | （本来未过） | raw 全部下降 | 01 0.046→0.035、03 0.025→0.023、05 0.051→0.049 |
| R15 App | 未跑 | — | 7 张都要在「iPhone 16e (add)」上手点到状态，本会话不占用那台模拟器；R15 页面同为 UiText，改动机制与 R12 相同 |

hira 候选：计划已过 9 屏里 04 变不过、R12 02 / 03 / 46 / b9-00 变不过，raw 普遍 +0.007，弃用。

### 3.2 「待 UiText 行距」11 屏重比（§20 口径）
行距本身已对上（A-R24-07 实测：头卡标题两行 设计 164 / 188，修前 164 / 191，终版 164 / 189；候补理由 12px 行间 设计 18 / 19，修前 20，终版 18 / 18）。

| 画面 | 修前 raw 浅 / 深 | 终版 raw 浅 / 深 | 结果 |
|---|---|---|---|
| A-R23-02b 今月の上限 | 0.065 / 0.062 | 0.063 / 0.060 | **通过**：剩余带均为同字抗锯齿 / chip emoji 字形 [raster] |
| A-R24-09 CVC 类型详情 | 0.069 / 0.054 | 0.067 / 0.052 | **通过**：「判定：」计数规则句来自 fixture countRule [data]，其余 [raster] |
| A-R25-16 以前のプラン 详情 | 0.071 / 0.067 | 0.070 / 0.066 | **通过**：「会いたい人」行头像配色 / 完了状态 [data]（行高随之 dy −5），其余 [raster] |
| A-R24-07 VC 类型详情 | 0.114 / 0.097 | 0.113 / 0.097 | 未过：浅色 7 条 dy 4–5（上方头卡 / 推薦度块累计下移 3–4，非行距）、色差带（头像色 / 接点 [data] 待逐条核） |
| A-R24-12b 弁護士 スキップ後 | 0.159 / 0.153 | 0.157 / 0.151 | 未过：画板带 toast（需真做一次スキップ），dy ±12 结构差 |
| A-R23-08 背景 3/3 | 0.083 / — | 未重截 | 需手点；另有 §9.2-2 折行多一行 |
| N17a 目的 1段だけ | 0.104 / 0.085 | 0.103 / 0.083 | 未过：需手点确认两块（静态截图不是画板状态），5 条 dy>3 |
| A-R23-11 確定した前提 | 0.131 / 0.127 | 0.131 / 0.128 | 未过：回答气泡长短 [data] 引起的 dx/dy 12 下移，待逐条归因 |
| A-R23-12 AI 初版 | 0.162 / 0.142 | 0.163 / 0.143 | 未过：同 11（气泡 / 方案名长短） |
| A-R23-15 AI 修正 1 回後 | 0.177 / 0.130 | 0.177 / 0.130 | 未过：同 12 |
| A-R23-16 使い切り | 0.183 / 0.137 | 0.183 / 0.137 | 未过：同 12 |

另：**A-R23-02c 目標 2つ**（主会话补充要求）0.073 / 0.071 → 0.071 / 0.070，**通过**：「›」颜色已对上；目标列表第 2 行是另一条目标（fixture 顺序 / 分数）[data]，其余 [raster]。

结论：本修正去掉了「混排行与纯日文行基线差 1.3–2pt」这一系统差，已过画面无一变差；11 屏里 3 屏转为通过，其余 7 屏（08 未重截）剩下的是数据长短、手点态、toast 等与行距无关的差，回到各自的返工清单。

## 4. 未做 / 后续
- 日文输入画面的 fixture 预填（A-R23-01 已输入 + 聚焦、A-R23-17 改名后静止态、A-R25-05 送出修正后）：要从 Task 段深链把「设计稿状态」参数穿过 TaskScreen（乙）到 PlanGoalInput / 見直し composer，并给 3 屏各开新一轮返工，本会话未做。
- R15 App 7 张需在「16e (add)」上手点，未重比。
- 计划 A-R23-05 / A-R25-03（手点态）未重截；两屏的文字机制与已重比的 03 / 04 相同。

## 5. 独立复核（1 个子任务，全新上下文，只读）
H 0 / M 2 / L 5。公式、baselineOffset 语义（与 RCTApplyBaselineOffset 方向一致）、测量 / 绘制 / 点击 / onTextLayout 一致性、adjustsFontSizeToFit、线程安全均确认无问题。
| 项 | 处理 |
|---|---|
| M1 截断（numberOfLines）的最后一行，TextKit 把隐藏尾字也算进该行，尾部若有 emoji / 异字号 / 内嵌 View，该行不调整，与上一行又差 1.4–2pt | 记为已知局限（该行退回 RN 原行为，不比修前差），写进文件头注释 |
| M2 lineHeight < SF 字高时居中会把下沿推出行框、被 RN 视图裁掉 | 已修：这种行不动 |
| L1 注释把与 Chrome 的一致说成「完全」，实际 Blink 取整、Hiragino 半行距有 ≤1px 差 | 已改注释 |
| L2 注释未提 Paper RCTTextShadowView 也命中、TextInput 不调整 | 已改注释 |
| L3 每个行片段都扫整段文字找 Hiragino | 已改：每个 layout manager 只扫一次，结果挂在 layout manager 上 |
| L4 钩点会挂到任何「新建普通 NSLayoutManager + 关 font leading」的代码；method 判空 | 判空已加；改动只对定行高且含 Hiragino 的文字生效，风险低，未进一步收紧 |
| L5 modules/ 需提交；+load 是否被链接要可见；A/B 用启动参数 | modules/ 随本次提交；log 模式在 +load 打「enabled」；注释写明 `-OrbitTextLeading off` 启动参数 |

## 6. 测试
- App 全量（`npm test`）：3977 条，3974 过、1 失败、2 skip。失败 = `invite-code-screens.test.tsx` S1（R15 既有失败，纯 JS 渲染测试，与原生模块无关）。原生模块不在 JS 测试覆盖内，靠 §3 的 A/B 门禁验证。
