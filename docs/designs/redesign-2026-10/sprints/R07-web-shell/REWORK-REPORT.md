# Sprint R07 — 像素返工 REPORT（2026-10-12）

> 依据：[README](../README.md) RD-16 修订与通用规则 11、[HOW-TO 第 8 节](../HOW-TO-START-A-FEATURE-SPRINT.md#8-截图对照页与像素门禁)、[2026-10-11 像素盘点](../maintenance/2026-10-11-pixel-audit.md) §2.1 W-R07-01～12 与「共性问题」1–3、7，§4.1 第 1 组；[2026-10-12 拍板结果](../maintenance/2026-10-12-decisions.md)（D16 / D17 / D18、X01–X04、X12，b12 补画画板定稿）；本会话里用户对 4 条新问题的拍板（见第 4 节）。
> 范围：Web 导航壳（左栏、主标题区、右栏与 1024 抽屉、390 顶部条与胶囊、头像菜单、示例药丸、页面雾面背景）与 Task 容器的标题区。页面正文（首页、人脈、iOrbit、イベント、受信箱、Task 各段）仍是旧屏，归各功能 Sprint，不在本次范围。
> 证据：`~/orbit-sprint-evidence/redesign/pixel-audit/run-02/web-shell/`（`final4/<画面>/` 各含 design / app / diff / triptych / cells.json / result.json；`final4.log` 复核修复后的门禁原始输出（第一轮的 `final/`、`final.log` 保留作对照）；`gate.py` 批量脚本；`s3-count3/` 计数验证；`impact-pre.log`；`detect-changes.log`）。
> **复核后修订（2026-10-12）**：独立复核 [REWORK-REVIEW](REWORK-REVIEW.md) 判「不通过」（S1–S3、M1–M6、m1–m8）。本文第 1、3、5–7 节已按修复后的结果改写，修复明细见第 9 节。

## 1. 结论

- **壳的各部分过门禁**（Web 1440 / 1024 / 390 × 浅 / 深；复核后局部视图改用 `--grid 30` 细带，每张「通过」都看过 triptych；超阈值带只剩写明理由的 `[data]`：测试账号头像首字、头像菜单本人信息、1024「次の一手」的建议计数）：左栏、主标题区（首页 + Task 四个页签里的三个）、1440 右栏、1024 标题区与抽屉的头尾、390 顶部条与胶囊、Task 390 页签栏、头像菜单（1440 弹出层 / 390 底部弹层；旧页面 Task 上也一样）、受信箱页与 iOrbit 页上的左栏。第一轮写的「全部通过」不准确：1024 抽屉尾是假通过（输入框被挤出可视区），1024 标题区是擦线通过（缺计数），复核后都已修正或归因。
- **整屏仍不过**：每个画面的正文还是旧屏或占位（首页 = 「ホームを準備しています」、Task 各段 = 旧页面、受信箱 / iOrbit = 旧屏），差异来自正文，不来自壳。这些画面要等 R10 / R11 / R13 / R20 / R21 / R25 换成新屏后整屏过门禁。
- **两处壳内未过、原因不在壳**：① Task › メモ 标题区缺设计稿的「＋ メモを追加」（Web 还没有メモ功能，按钮没有可做的事，等 R20）；② 1024 抽屉的中间内容：设计稿画的是 3 条「次の一手」建议，实现还没有建议数据，显示的是空态右栏（内容与 1440 右栏的 `ホーム 新用户空状态` 画板相同；抽屉内容宽 340、右栏 316，没有单独的逐像素门禁）——等 R10 接上首页建议。
- ⌘K 面板（W-R07-05 / 06）只做了 D16（去掉隐私说明行）；面板本体的分组结果（人 / イベント / 会話 / コマンド）、类型 chip、「近い条件なら」需要活动与会话的搜索接口，属于功能工作，没有在本次做（见第 6 节）。

## 2. 做了什么

| 部分 | 改动 | 依据 |
| --- | --- | --- |
| 主标题区 | 三段式：左槽（页签 / 🔍 圆钮）· 居中标题 + 日期副标题 · 右槽（主按钮、🔔、編集）；标题块按设计稿是「标题 + 行内 small」，高 51；新增壳绘制的 `ShellSearchButton`（🔍 → ⌘K）和 `ShellBellButton`（🔔 → 受信箱，未读红点）；插槽接口只加不改（`ShellPage` 原有 6 个插槽不变） | web.html `mainhead` / `searchBtn` / `headR`；盘点 X01 |
| 首页标题 | 「10月 / 10月1日–10月31日」（按界面语言用平台日期格式）+ 🔍 + 🔔 + ⊞ 編集 | web.html ホーム |
| Task 容器 | 页签进左槽（kit `.tseg`，7 / 18）、「Task / 月份范围」、右槽 ＋ 按钮：プラン「目標を追加」→ 目標入力；カレンダー「予定を追加」、To-do「To-doを追加」→ 触发旧页面现有的新建入口（`data-task-add`）；メモ 不放（没有功能）；Task 也有右栏；390 页签全宽放顶部条下；不在壳里渲染时（单测）页签留在页面上 | web.html `wTaskHead`、b8 #7 |
| 左栏 | 去掉「⌘K 検索」项（快捷键保留，入口改为标题区 🔍）；主催图标 brief；标签 10.5（新 token `--fs-nav`）、颜色 `--ink-3`；头像 40 淡紫圆（`--mac-lav` / `--mac-lav-ink`），菜单打开时淡紫光圈 | web.html `webFrame`；X03；D15；用户拍板（第 4 节②） |
| 右栏 | 照 `assistRail('empty')`：✨ iOrbit、はじめまして卡、こんなことを聞けます + 3 个问题（点了交给 iOrbit，带当前页上下文）、底部「iOrbit に聞く… ⌘K」 | web.html #0 |
| 1024 | 标题区最右「✨ 次の一手」按钮（有建议时带珊瑚计数，打开时淡紫底）→ 380 抽屉：左上 ✕、右侧「Esc で閉じる」，下面是同一右栏 | b12 N07 / N07b（比 b6 #34 新，按 Q2 以新为准） |
| 390 | 顶部条「O Orbit」字标 + 受信箱圆钮 + 头像，无搜索钮；首页与 Task 照稿不出主标题行（新插槽 `phoneFold`，标题并入页面），其他页面保留标题行与左右插槽（返回钮、主按钮、次の一手）；胶囊距底 8、字 10；示例药丸在窄屏仍显示 | b6 `mwHead` / `.mweb .tabbar`；X04；D18；复核 S2 |
| 头像菜单 | 1440：340 弹出层，在左栏右侧 8、底边对齐头像；390：底部弹层（8 边距、圆角 34、抓手）。项目：本人（头像 36、姓名、第二行邮箱）· マイページ › · 言語 · 外観 · ログアウト（珊瑚 ghost）；不再有 参加するイベント / 設定 / 主催 | b12 W-R07-07 / 07b 推荐版（用户 2026-10-12 认可）；D18 |
| 示例药丸 | 杏色「🧪 サンプル ⌄」放标题区左侧；读屏名仍是「サンプル · ガイドを始める / 続ける」 | b1「药丸 + 写操作拦截（Web）」；D17 |
| ⌘K | 去掉「iOrbit に聞く」下的隐私说明行（隐私边界仍由回答侧 `local:orbit-agent-privacy-boundary` 保证） | D16 |
| 背景 | 壳根节点加两团雾面渐变（`--fog-a` 左上、`--fog-b` 右上） | kit `.web`；X12 |
| 组件库（只加不改） | `Drawer` 加 `bare`（无标题行与 ✕，内容自带头部）；`Popover` 加 `place`（自定位置）与 `tight`（8 内边距）；新增 `BottomSheet`（kit `.sheet`） | 01-system ③ |
| token | `font.size`：`nav 10.5`、`tab 10`、`emoji-sm 17`、`row 13.5`；`radius.row 12`；日文字体栈改为设计稿 `--font`（系统字体优先）；App 副本 `src/api/design/tokens.ts` 同步 | 用户拍板（第 4 节①） |
| 旧页面样式兜底 | 旧页面加载的全局 `.btn`（44 高、15px、圆角 10、nowrap、1px 边）会改掉壳里的按钮：标题区、Task 页签、抽屉 ✕、右栏示例问题与输入入口、头像菜单分段与ログアウト都用双类选择器把 kit 值逐项写回 | Task 页实测；复核 M2（门禁 W-R07-03DT / 07MT 在 Task 页上跑） |
| マイページ | 旧マイページ页签栏加「主催」（链到 `/app/events/center`，不高亮），手机 Web 由此进主催页；过渡做法，正式版由 R18 账户改版按设计稿做 | 用户拍板 2026-10-12（复核 M3）；b12 W-R07-07b |

## 3. 像素门禁（返工前 → 返工后）

返工前 = 2026-10-11 盘点 run-01；返工后 = 复核修复后的 `final4/`（本表由 `final4.log` 生成；整屏视图 `--grid 100`，局部视图 `--grid 30`）。局部视图的坐标：1440 左栏 `0,0,84,960`、主标题区 `84,0,996,90`、右栏 `1080,0,360,960`；1024 左栏 `0,0,72,880`、主标题区 `72,0,952,90`、抽屉 `630,14,380,852`（头 `…,80`、尾 `630,786,380,80`）；390 顶部条 `0,0,390,60`、胶囊 `0,764,390,72`、Task 页签 `0,0,390,110`；头像菜单 1440 `92,627,340,315`、390 `8,478,374,358`。

| 视图 | 宽 | 返工前 浅 / 深 | 返工后 浅 | 返工后 深 | 结论 |
| --- | --- | --- | --- | --- | --- |
| W-R07-01 首页整屏 | 1440 | 0.05 / 0.0583 | ✗ 0.0191 · 超阈 3（未归因 3） | ✗ 0.022 · 超阈 3（未归因 3） | 正文是旧屏 / 占位（不在本次范围） |
| W-R07-01L 左栏 | 1440 | 0.0472 / 0.0491 | ✓ 0.0031 · 超阈 1（未归因 0） | ✓ 0.0032 · 超阈 1（未归因 0） | 通过 |
| W-R07-01H 主标题区 | 1440 | 0.0208 / 0.0321 | ✓ 0.0028 · 超阈 0（未归因 0） | ✓ 0.0028 · 超阈 0（未归因 0） | 通过 |
| W-R07-01R 右栏 360 | 1440 | 0.0565 / 0.0629 | ✓ 0 · 超阈 0（未归因 0） | ✓ 0 · 超阈 0（未归因 0） | 通过 |
| W-R07-01 首页整屏 | 1024 | 0.0533 / 0.0597 | ✗ 0.0495 · 超阈 7（未归因 7） | ✗ 0.0563 · 超阈 7（未归因 7） | 正文是旧屏 / 占位（不在本次范围） |
| W-R07-01L 左栏 | 1024 | —（新视图） | ✓ 0.004 · 超阈 1（未归因 0） | ✓ 0.0041 · 超阈 2（未归因 0） | 通过 |
| W-R07-01H 主标题区 | 1024 | —（新视图） | ✓ 0.0196 · 超阈 1（未归因 0） | ✓ 0.0195 · 超阈 1（未归因 0） | 通过（第 1 带 `[data]`：建议计数，见第 9 节 S3） |
| W-R07-03 1024 抽屉整屏 | 1024 | 0.0527 / 0.0505 | ✗ 0.0502 · 超阈 6（未归因 6） | ✗ 0.0468 · 超阈 6（未归因 6） | 正文是旧屏 / 占位（不在本次范围） |
| W-R07-03D 1024 抽屉 | 1024 | —（新视图） | ✗ 0.0686 · 超阈 16（未归因 16） | ✗ 0.0676 · 超阈 17（未归因 17） | 抽屉中间是空态右栏，设计稿画 3 条建议（等 R10 数据）；头尾单独过门禁 |
| W-R07-03DH 1024 抽屉 · 头 | 1024 | —（新视图） | ✓ 0.0082 · 超阈 0（未归因 0） | ✓ 0.0087 · 超阈 0（未归因 0） | 通过 |
| W-R07-03DF 1024 抽屉 · 尾 | 1024 | —（新视图） | ✓ 0 · 超阈 0（未归因 0） | ✓ 0 · 超阈 0（未归因 0） | 通过（第一轮浅色是假通过，S1 已修） |
| W-R07-02L 1024 左栏 · 人脈 tooltip（b6 #34） | 1024 | —（新视图） | ✓ 0.0049 · 超阈 1（未归因 0） | ✓ 0.005 · 超阈 2（未归因 0） | 通过 |
| W-R07-07 头像菜单整屏 | 1440 | —（新视图） | ✗ 0.0482 · 超阈 6（未归因 6） | ✗ 0.0532 · 超阈 6（未归因 6） | 正文是旧屏 / 占位（不在本次范围） |
| W-R07-07M 头像菜单（弹出层） | 1440 | —（新视图） | ✓ 0.0119 · 超阈 2（未归因 0） | ✓ 0.0118 · 超阈 2（未归因 0） | 通过 |
| W-R07-07b 头像菜单 390 整屏 | 390 | —（新视图） | ✗ 0.0535 · 超阈 7（未归因 7） | ✗ 0.0465 · 超阈 7（未归因 7） | 正文是旧屏 / 占位（不在本次范围） |
| W-R07-07bM 头像菜单 390（底部弹层） | 390 | —（新视图） | ✓ 0.0096 · 超阈 2（未归因 0） | ✓ 0.0095 · 超阈 2（未归因 0） | 通过 |
| W-R07-01 首页整屏 | 390 | 0.0875 / 0.1068 | ✗ 0.0872 · 超阈 9（未归因 9） | ✗ 0.1035 · 超阈 9（未归因 9） | 正文是旧屏 / 占位（不在本次范围） |
| W-R07-01T 390 顶部条 | 390 | —（新视图） | ✓ 0.009 · 超阈 0（未归因 0） | ✓ 0.0094 · 超阈 0（未归因 0） | 通过 |
| W-R07-01B 390 胶囊 | 390 | —（新视图） | ✓ 0 · 超阈 0（未归因 0） | ✓ 0.0001 · 超阈 0（未归因 0） | 通过 |
| W-R07-Tcalendar Task › カレンダー 整屏 | 1440 | 0.0484 / 0.0786 | ✗ 0.0436 · 超阈 3（未归因 3） | ✗ 0.0692 · 超阈 5（未归因 5） | 正文是旧屏 / 占位（不在本次范围） |
| W-R07-TcalendarH Task › カレンダー 标题区 | 1440 | —（新视图） | ✓ 0.0051 · 超阈 0（未归因 0） | ✓ 0.0053 · 超阈 0（未归因 0） | 通过 |
| W-R07-TcalendarL Task › カレンダー 左栏 | 1440 | —（新视图） | ✓ 0.0031 · 超阈 1（未归因 0） | ✓ 0.0032 · 超阈 1（未归因 0） | 通过 |
| W-R07-Ttodo Task › To-do 整屏 | 1440 | 0.0585 / 0.071 | ✗ 0.0577 · 超阈 39（未归因 39） | ✗ 0.0724 · 超阈 39（未归因 39） | 正文是旧屏 / 占位（不在本次范围） |
| W-R07-TtodoH Task › To-do 标题区 | 1440 | —（新视图） | ✓ 0.0049 · 超阈 0（未归因 0） | ✓ 0.0052 · 超阈 0（未归因 0） | 通过 |
| W-R07-TtodoL Task › To-do 左栏 | 1440 | —（新视图） | ✓ 0.0004 · 超阈 0（未归因 0） | ✓ 0.0004 · 超阈 0（未归因 0） | 通过 |
| W-R07-Tmemo Task › メモ 整屏 | 1440 | 0.0577 / 0.0827 | ✗ 0.056 · 超阈 8（未归因 8） | ✗ 0.0776 · 超阈 8（未归因 8） | 正文是旧屏 / 占位（不在本次范围） |
| W-R07-TmemoH Task › メモ 标题区 | 1440 | —（新视图） | ✗ 0.0476 · 超阈 2（未归因 2） | ✗ 0.0482 · 超阈 2（未归因 2） | 缺「＋ メモを追加」（Web 无メモ功能，等 R20） |
| W-R07-TmemoL Task › メモ 左栏 | 1440 | —（新视图） | ✓ 0.0031 · 超阈 1（未归因 0） | ✓ 0.0032 · 超阈 1（未归因 0） | 通过 |
| W-R07-Tplan Task › プラン 整屏 | 1440 | —（新视图） | ✗ 0.0348 · 超阈 5（未归因 5） | ✗ 0.0843 · 超阈 16（未归因 16） | 正文是旧屏 / 占位（不在本次范围） |
| W-R07-TplanH Task › プラン 标题区 | 1440 | —（新视图） | ✓ 0.0053 · 超阈 0（未归因 0） | ✓ 0.0056 · 超阈 0（未归因 0） | 通过 |
| W-R07-Tplan Task › プラン 整屏 | 390 | —（新视图） | ✗ 0.1487 · 超阈 8（未归因 8） | ✗ 0.1652 · 超阈 7（未归因 7） | 正文是旧屏 / 占位（不在本次范围） |
| W-R07-TplanT Task › プラン 390 页签栏 | 390 | —（新视图） | ✓ 0.0049 · 超阈 0（未归因 0） | ✓ 0.0051 · 超阈 0（未归因 0） | 通过 |
| W-R07-11 受信箱 整屏 | 1440 | 0.032 / 0.0554 | ✗ 0.0279 · 超阈 5（未归因 5） | ✗ 0.0489 · 超阈 5（未归因 5） | 正文是旧屏 / 占位（不在本次范围） |
| W-R07-11L 受信箱 左栏 | 1440 | —（新视图） | ✓ 0 · 超阈 0（未归因 0） | ✓ 0 · 超阈 0（未归因 0） | 通过 |
| W-R07-12 iOrbit 整屏 | 1440 | 0.0553 / 0.9326 | ✗ 0.0438 · 超阈 6（未归因 6） | ✗ 0.9316 · 超阈 12（未归因 12） | 正文是旧屏 / 占位（不在本次范围） |
| W-R07-12L iOrbit 左栏 | 1440 | —（新视图） | ✓ 0.0004 · 超阈 0（未归因 0） | ✓ 0.0004 · 超阈 0（未归因 0） | 通过 |
| W-R07-03DT 1024 抽屉（旧页面 Task › To-do 上，复核 M2） | 1024 | —（新视图） | ✗ 0.0686 · 超阈 16（未归因 16） | ✗ 0.0676 · 超阈 17（未归因 17） | 同 W-R07-03D（数字相同，说明旧页面上抽屉没被全局 `.btn` 改样式） |
| W-R07-07MT 头像菜单（旧页面 Task › To-do 上，复核 M2） | 1440 | —（新视图） | ✓ 0.0119 · 超阈 2（未归因 0） | ✓ 0.0118 · 超阈 2（未归因 0） | 通过（与首页数字相同） |

### 3.1 归因（`repos/orbits/scripts/visual/attribution-redesign-R07.json`）

三类，都是看过三联图后写的（局部视图 `--grid 30`，带号按 30 像素重编）：

- 左栏底部头像的首字（设计稿「佐」/ 测试账号「OQ」）：1440 第 30 带、1024 第 27 / 28 带；
- 头像菜单第一行本人信息（「佐藤 健一 / 株式会社ミナトリンク」/「Orbit QA / qa@orbit.test」）：1440 弹出层第 0 / 1 带（首页与 Task 页）、390 底部弹层第 1 / 2 带。session 里没有公司名，第二行显示邮箱（成熟产品账号菜单的常见写法），同一位置同一字号；
- 1024「次の一手」按钮的建议计数（设计稿「3」，测试账号没有建议）：1024 标题区第 1 带；临时传 `count=3` 验证过按钮组逐像素对齐（第 9 节 S3）。

### 3.2 门禁工具的三处修正（`compare-redesign.mjs`，README 已同步）

1. **设计画框搬到页面左上角再截**（外面套一层与原祖先同名类的空壳，保留 b12 按分组写的 CSS 嵌套样式）。原因：画框在文档深处时要先滚动，带 `backdrop-filter` 的右栏在滚动偏移下文字栅格化差 1px 行；实测 DOM 位置完全一致，搬到顶部后右栏差异从 0.0053 变为 0。
2. **先隐藏 Next 开发指示器再执行 `--click` / `--steps`**：指示器盖在左下角，挡住了左栏头像的点击。
3. **主题只靠 `colorScheme`，不写 `localStorage["orbit-theme"]`**：写了会让头像菜单的「外観」显示成手动选了浅 / 深（设计稿是「自動」）；另外 390 画框里底部弹层与遮罩和胶囊一样被抬在 Safari 底栏上方，一并放回。

## 4. 用户拍板（本会话，2026-10-12，全部按推荐）

| # | 问题 | 定的做法 | 落实 |
| --- | --- | --- | --- |
| ① | 字体：设计稿 `-apple-system` 优先 vs RD-09 日文 Hiragino 优先 | 照设计稿：系统字体优先（英文数字 SF），假名汉字仍 Hiragino | `tokens.json` `font.family.ja`；README RD-09 已写修订 |
| ② | 左栏未选中项 `--ink-3` 对比度不到 4.5:1 | 照设计稿浅灰（对标 iOS 标签栏） | README RD-05 已写例外 |
| ③ | 390 去掉搜索钮后手机没有 ⌘K 入口 | 照稿去掉：搜人走人脈页搜索框，提问走底栏 iOrbit | 顶部条无 🔍 |
| ④ | b6 #34 tooltip 画板没画悬停底色 | 改画板补上悬停底色 | `b6-host-polish.html` `.side a.hov`；门禁视图 W-R07-02L |

另：拍板页结果里与壳有关的 D16 / D17 / D18 / D15 / X01–X04 / X12 已全部落实（第 2 节）。

## 5. 仍待拍板 / 交给别的 Sprint

- **D09**（旧页面不出主标题区、没有右栏、深色仍是浅色）：已定「照设计稿，各功能 Sprint 整屏重写」——壳这边插槽都就绪，各页面换新屏时用 `ShellPage` 填标题 / 页签 / 右栏即可。
- **D10–D13**（Task 各段、首页、受信箱的正文）：R10 / R13 / R20。
- **D18 的遗留**：已按用户拍板在旧マイページ临时加「主催」入口（第 2 节）；正式版由 **R18** 账户改版按设计稿做，已写进 README 合回前清单。D18 文字与推荐版画板矛盾，已请 design-decisions 会话改正。
- **メモ「＋ メモを追加」**：等 R20 做出 Web メモ。
- **1024 抽屉 / 右栏的建议内容与计数**：等 R10 提供首页「次の一手」数据；现在右栏照「新用户空状态」画板显示。
- **⌘K 面板本体（W-R07-05 / 06）**：需要活动、会话搜索与「近い条件なら」的数据源，建议单独开一个 Sprint（壳返工的后续）。
- **组件库**：`Kbd` 字色为 `--ink-3-text`（kit 为 `--ink-3`）、`MacTile` 小号 emoji 为 16（kit 17）、深色抽屉的 1px 细边（壳的抽屉已按 b12 去掉，其余抽屉未动）等，属于返工顺序第 6 组「组件库逐件对照」。
- **其他页面的标题区三段式（共性问题 1）**，壳的插槽已就绪，由各页面的 Sprint 填：受信箱（左「メッセージ / 通知」分段、副标题「未読 n件」、右 ⚙）→ **R13**；iOrbit（左 ≡、副标题、右「＋ 新しい会話」）→ **R21**；Task 右栏「次の一手 · Taskから」内容 → **R20 / R10**；首页编辑态「ドラッグで組み替え」提示条 → **R10**。
- **右栏示例问题的交互**（复核 m5）：点一下直接发给 iOrbit（对标 ChatGPT / Gemini 的建议 chip 直接发送；设计稿写「点了交给 iOrbit」），保持现状。

## 6. 影响面（GitNexus）与对策

`impact-pre.log`（改前逐个跑 `impact --direction upstream`）：

| 符号 | 风险 | 直接调用方 | 对策 |
| --- | --- | --- | --- |
| `Orbit2026Shell` / `ShellFrame` / `ShellSidebar` / `ShellMobileTop` / `DefaultRail` / `ShellBottomBar` / `AccountMenu` | LOW | 1–2（`AppLayout`） | 壳是全站唯一外框（HIGH 风险面）：三档宽度 × 浅深全部过门禁；`orbit-2026-shell` 16 条渲染测试（含 🔍 → ⌘K、三段式、头像菜单位置、390 底部弹层、胶囊不盖住页面末行与旧页面固定控件、旧页面对话框盖过胶囊） |
| `ShellSlots`（类型） | CRITICAL（2954，同名类型误解析） | — | 插槽只加不改；`ShellPage` 调用方 14 处已 grep 核对（首页、Task、计划 6 屏、加人 3 屏、受信箱、示例药丸） |
| `HomePlaceholder` | CRITICAL（136 流程，首页入口） | 1 | 只改标题区插槽内容；首页渲染与 ⌘K 测试通过 |
| `Drawer` / `Popover` / `useAnchorPosition` | CRITICAL | 10 / 3 / 2 | 只加可选参数，默认分支逐字不变；`orbit-2026-ui-render`、`orbit-modal-standard`、计划弹窗测试通过 |
| `ShellDemoPill` | HIGH | 2 | 药丸换样式但保留 `data-orbit-guide-demo-pill` 与点击行为；读屏名不变；iOrbit / 人脈示例模式测试更新并通过 |
| `TaskContainer` / `ShellPage` / `PersonalScheduleWorkspace` | UNKNOWN | grep：`tasks/page.tsx` / 14 处 / `tasks/page.tsx` + `tasks/personal/page.tsx` | `app-tasks-container` 6 条、个人日程测试通过；旧页面只加 `data-task-add` 属性 |
| `TaskComposer` | HIGH | 1 | 只加 `data-task-add` 属性 |
| `CommandPalette` / `monthHeading` | LOW | 1 / 2 | 删一行隐私说明；新函数有单测 |
| `ShellPage`（复核修复） | CRITICAL（35） | 14 处页面 | 只加可选插槽 `phoneFold`，默认行为回到返工前（390 显示标题行）；只有首页、Task 传入；新增 390 标题行与抽屉尾两条渲染测试 |
| `ProfileShell`（复核修复） | HIGH（4） | マイページ各屏 | 页签列表加一项「主催」链接，其余不变；`app-profile-shell` 测试更新；审计里按行号登记的证据（`interaction-matrix.md`、`button-action-coverage.md`、`generate-full-product-functional-audit.mjs`）随行号 +2 改指 |
| `ShellRailButton` / `AccountMenu` / `ShellBellButton` / `Drawer`（复核修复） | LOW / LOW / LOW / CRITICAL | 6 / 4 / 3 / 10 | 补 `aria-expanded`、未读读屏名；`Drawer` 只在 `bare`（仅壳使用）时加类去掉深色细边，默认分支不变 |

## 7. 测试

**复核修复后（2026-10-12 第二轮）**：
- orbits 全量（`orbit_test`）：7497 条，失败 1：`notification-discovery-worker-postgres`「saved cloud facts drain in bounded batches」在门禁同时运行、负载高时偶发（期望 0 得 20），单独重跑 3 / 3 通过；本次改动不涉及通知与数据库代码。中途发现的 4 条由本轮改动引起的失败已修：硬编码文案（マイページ「主催」补日文）、token 测试（登记 `logo-sm`）、审计按行号登记的证据（行号 +2 改指）。
- App 全量：3967 条，失败 0（token 副本只加 `logoSm` / `logo` 两个键）。
- `npm run typecheck` 无错误；`npm run lint` 通过；`npm run copy:qa` 2531 条 0 问题。
- 新增测试：390 未声明 `phoneFold` 的页面保留标题行与左右插槽、「次の一手」按钮 `aria-expanded`；1024 抽屉底部「iOrbit に聞く…」完整落在抽屉内（撤掉修复时此条失败，已验证）；マイページ第四个页签「主办」。

**第一轮**：

- orbits 全量（连本机库 `orbit_test`）：7495 条，失败 0（`ORBIT_EVENT_DATABASE_URL=postgres://localhost/orbit_test`，基线 0 失败，零新增）。
- App 全量：3967 条，失败 0（1 条通知竞态用例超时被取消，单独重跑 16/16 通过，与本次改动无关）。
- `npm run typecheck`：本次改动无错误（工作区里另一个会话未提交的 invite-codes / contact-import 改动有类型错误，不是本次文件）；`npm run lint` 通过；`npm run copy:qa` 0 问题。
- detect-changes：31 文件 / 50 符号 / 12 条流程，风险 high（壳是全站外框，预期如此）；31 个文件里 `bridge/handoffs.md` 是用户自己的未提交文件，不是本次改动。输出存 `detect-changes.log`。

## 8. 改动的文件

产品：`orbit-2026/shell/{Orbit2026Shell.tsx, shell.module.css, slots.tsx, month-heading.ts, ShellDemoPill.tsx, CommandPalette.tsx, palette.module.css}`、`orbit-2026/home/HomePlaceholder.tsx`、`orbit-2026/task/{TaskContainer.tsx, task.module.css}`、`orbit-2026/ui/{Overlay.tsx, Overlay.module.css, index.ts}`、`orbit-2026/copy/shell.ts`、`orbit-2026/tokens.css`（生成）、`shared/design/{tokens.json, tokens.ts}`、`tasks/{personal-schedule-workspace.tsx, tasks-controls.tsx}`（只加属性）、App `src/api/design/tokens.ts`（副本）。
工具与设计稿：`scripts/visual/{compare-redesign.mjs, README-redesign.md, attribution-redesign-R07.json}`、`docs/designs/redesign-2026-10/b6-host-polish.html`（1024 tooltip 画板补悬停底色）。
测试：`tests/ui/{orbit-2026-shell.test.tsx, support/orbit-2026-shell-harness.ts, design-fonts.test.ts, design-tokens-generated.test.ts, orbit-global-ask-pinned-bar.test.ts, orbit-top-nav-structure.test.ts}`、`tests/pages/{app-agent-iorbit-home.test.tsx, app-agent-general-conversation.test.tsx}`。

复核修复另改：`orbit-2026/ui/{Overlay.tsx, Overlay.module.css}`（bare 抽屉深色去细边）、`profile/profile-0918/profile-shell.tsx`（主催页签）、`shared/design/{tokens.json, tokens.ts}` + `orbit-2026/tokens.css`（`font.size.logo 17`、`radius.logo-sm 11`）+ App 副本、`docs/audits/{button-action-coverage.md, full-product-functional-audit/interaction-matrix.md}` 与 `scripts/generate-full-product-functional-audit.mjs`（行号改指）、`scripts/visual/README-redesign.md`（基线不可比、局部视图细带）、sprints `README.md`（RD-05 例外扩大、合回前清单加 R18 主催入口）；测试 `tests/ui/{orbit-2026-shell.test.tsx, support/orbit-2026-shell-harness.ts, design-tokens-generated.test.ts}`、`tests/pages/app-profile-shell.test.tsx`。

## 9. 复核修复（2026-10-12，对应 [REWORK-REVIEW](REWORK-REVIEW.md)）

| 编号 | 处理 | 证据 |
| --- | --- | --- |
| S1 抽屉尾被挤出 | 抽屉里的 `railBody` 不再叠 `min-height: 100%`（由 `drawerRail > :last-child { flex: 1 }` 撑满） | W-R07-03DF 浅 / 深 raw 0（第一轮浅 0.0132 是假通过）；新测试「1024: the drawer fits its foot」撤掉修复时失败 |
| S2 390 标题区全藏 | 新插槽 `phoneFold`（只加不改）：只有首页、Task 声明「标题并入页面」，<768 才收起标题行；其余页面恢复返工前的标题行与左右插槽 | 实测 390：名刺スキャン「人脈を追加に戻る」+ 标题可见，人脈を追加 标题 + 次の一手可见，首页 / Task 照稿无标题行；新测试「390: a page that does not fold…」 |
| S3 1024 标题区擦线 | 差异来自建议计数（数据）：`[data]` 归因并写明验证——临时传 `count=3` 重跑，按钮组逐像素对齐（raw 0.0068 / 0.0066） | `s3-count3/`；`attribution-redesign-R07.json` W-R07-01H-1024 第 1 带 |
| M1 浅灰次要文字 | 用户拍板照设计稿：RD-05 例外扩大到壳内次要文字与示例药丸（README 已改） | README RD-05 |
| M2 旧页面弹层被 `.btn` 改样式 | 抽屉 ✕、右栏示例问题与输入入口、头像菜单分段与ログアウト、次の一手按钮逐项写回 height / padding / border / radius / font / white-space | 新增门禁视图 W-R07-03DT（Task 页抽屉，与首页数字相同）、W-R07-07MT（Task 页头像菜单 raw 0.0119，与首页相同） |
| M3 手机无主催入口 | 用户拍板：旧マイページ页签栏临时加「主催」；正式版 R18；D18 文字已请 design-decisions 改正 | `profile-shell.tsx`；README 合回前清单 |
| M4 工具改动的基线 | README-redesign 注明 2026-10-12 起数字与 run-01 不可直接比较、新画板首次使用先抽对旧基线 | `scripts/visual/README-redesign.md` |
| M5 REPORT 说法 | 第 1、3、5–7 节已按复核结果改写（假通过、擦线通过、抽屉中间没有单独门禁、390 插槽） | 本文 |
| M6 局部视图粗带 | 局部视图改 `--grid 30`，归因带号重编；细带又查出并修掉三处真差异：左栏 logo 字号 16→17（新 token `--fs-logo`）、390 logo 圆角 10→11（新 token `--r-logo-sm`）与行高 1.55→1.5、壳抽屉深色 1px 细边（b12 没有，只对 `bare` 抽屉去掉） | `final4/`；W-R07-01L / 11L / 12L / TtodoL 第 1 带、01T / TplanT 第 0 带、03DH / 03DF 深色第 1 带转为 0 超阈 |
| m1 | 注释改为「設定 / 主催 经マイページ」 | `Orbit2026Shell.tsx` |
| m2 | 次の一手按钮加 `aria-haspopup="dialog"`、`aria-expanded` | 测试 |
| m3 | 🔔 有未读时读屏名为「受信箱 · 未読あり」（新文案 `inboxUnread` 三语） | 测试 |
| m4 | 600 字重、9px 13px 等是 kit 原值，保留；留给第 6 组组件库对照时统一补 token | — |
| m5 | 示例问题直接发送，对标 ChatGPT / Gemini 建议 chip（第 5 节） | — |
| m6 | 同 M6（logo 字号、圆角、行高已修） | — |
| m7 | gate.py 注释写明 b6 #34 只取未作废的左栏部分 | `gate.py` |
| m8 | 第 5 节点名受信箱 / iOrbit / Task 右栏 / 首页编辑提示条的归属 Sprint | 第 5 节 |

## 10. 2026-10-12 style-diff 补修：logo 与标题区按钮行高 1.55 → 1.5

- 起因：门禁新加的 `--style-diff` 查出两处像素门禁没报的差异——左栏 logo「O」、标题区按钮（`.mainhead .btn`）文字继承 body 的 `--lh-body` 1.55，kit 是 1.5。
- 改法：`shell.module.css` 的 `.logo` 与 `.mainhead :global(.btn)` 各加 `line-height: 1.5`（壳内其它文字都是写死 1.5，没有 1.5 的 token；`--lh-body` 1.55 全站在用，未动）。两处盒子高度固定（42 / 40），不影响布局。
- 验证（`:3005` / `.next-gate`）：`run-lh15-final*/` W-R07-01L、01H、TplanH 1440/1024 × 浅/深全部 PASS，style-diff 这两处行高 0 项；全套 `run-lh15-all/` + `run-lh15-retry/` 壳区域视图 43/50 过，未过的 03D / 03DT（1024 抽屉）、TmemoH 在撤掉本改动的基线 `run-lh15-base/` 数字完全相同，属原有问题；整页视图大量超阈来自页面内容（计划页返工进行中等），不属本项。`tests/ui/orbit-2026-shell.test.tsx` 18/18。
- 遗留：01H-1024 的「次の一手」按钮宽 130/106 来自建议计数徽标（数据，已归因）；TplanH 页签 style-diff 报 `gap` normal/0 与当前页签 `box-shadow` 差异，未修，待看。

- **2026-10-12 追记（R05 会话）**：token `font.line-height.body`（`--lh-body`）照 kit `body` 由 1.55 改为 1.5，全站 orbit-2026 作用域默认行高随之对齐设计稿；壳内 7aa6682b 的两处显式 1.5 现已与默认值相同。R07 全套门禁复跑（run-lhbody15，偶发项单独重跑）与改前基线逐张一致，无退步；03D / 03DT / TmemoH 仍是原有问题。
