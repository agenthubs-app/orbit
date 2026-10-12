# Sprint R05 — App 导航壳像素返工 REPORT（2026-10-12）

> 依据：[README](../README.md) RD-16 修订与通用规则 11、[HOW-TO 第 8 节](../HOW-TO-START-A-FEATURE-SPRINT.md#8-截图对照页与像素门禁)、[2026-10-11 像素盘点](../maintenance/2026-10-11-pixel-audit.md) §2.2 A-R05-01～11、「共性问题（App）」第 1–4 条、§4.1 第 2 组；[2026-10-12 拍板结果](../maintenance/2026-10-12-decisions.md)（D01、D04、D05、D07；D03 → R20、D06 → R21、D19 → R11）；Web 壳返工的做法见 [R07 REWORK-REPORT](../R07-web-shell/REWORK-REPORT.md)。
> 范围：App 导航壳——Task 容器的外框（顶栏、四段分段、页码点）、二级页顶栏（`AppScreen` 的返回栏、マイページ）、页面雾面背景、底栏胶囊、D07 底栏随二级页滑走。各页正文（首页、人脈、イベント、iOrbit、Task 各段内容、マイページ正文）仍是旧屏，归 R10 / R11 / R26 / R21 / R20 / R18，不在本次范围；首页、人脈、イベント、iOrbit 的**顶栏**也随正文归各自 Sprint（与 Web D09 同口径，已发主会话知悉）。
> 代码提交：`9bce4149`（已 push）。证据：`~/orbit-sprint-evidence/redesign/R05/rework/`（`r8/<画面>-<主题>/` 为最终一轮，各含 simulator-raw / design / app / diff / triptych / cells.json / result.json 与 `region-*/` 局部视图；`gate.sh` 批量脚本、`region.mjs` 局部门禁、`bbox.mjs` / `col.mjs` / `raw.mjs` 量像素；`impact-rework.txt`、`detect-changes.txt`、`app-test-1.log` / `app-test-2.log`）。

## 1. 结论

- **壳的几何、颜色、图标已逐像素对齐**（iPhone 16e 模拟器，浅 / 深都截）：Task 顶栏三段式与分段、二级页顶栏、雾面背景（取样色值 ±1）、底栏胶囊的位置 / 尺寸 / 边线 / 选中块 / 图标位置与颜色，在 `bbox` / 取样上与设计稿一致。
- **局部门禁（30px 细带）仍有超阈带，全部在 0.02–0.047 之间**，来源只有三类（逐带看过 triptych）：
  1. **数据**：Task 顶栏日期「10月12日（月）」↔ 示例「10月7日（水）」、マイページ完成度 100% ↔ 60%——已写 `[data]` 归因（`attribution-redesign-R05.json`）。
  2. **假名粗体字形**：Mac 上 Chrome 按字重直接取 Hiragino Sans W7 / W8，iOS 系统字体回退的假名更窄更细（实测把标题显式设成 `HiraginoSans-W8` 后宽度与粗细即与设计图一致）。影响分段「カレンダー / プラン / メモ」、底栏全部标签、マイページ 标题。**待主会话 / 用户拍板**（见第 5 节）。
  3. **图标亚像素**：门禁工具已按 R05 的发现改为设计侧 3x 渲染（`37209736`），但 Yoga 与 Chrome 对 x.5pt 的取整方向不同，底栏 21pt 图标的竖边相差 1 个设备像素（1/3pt），只框图标的细带 0.027–0.029。不是设计偏离；是否接受见第 5 节。
- **整屏仍不过**：正文是旧屏，差异来自正文（见第 3 节表）。
- **D07 已做**：从一级页推入二级页时，底栏随页面向左滑出（350ms、与原生栈同速），返回时滑回；减少动态效果时直接隐藏。

## 2. 做了什么

| 部分 | 改动 | 依据 |
| --- | --- | --- |
| 顶栏组件 | 新增 `ShellTopBar`：kit `.topbar` 的 44 / 1fr / 44 三段，标题 17 / 800（行高 25.5，字距 .01em）、副标题 11.5 / 500（`--ink-3`，RD-05 壳内例外，待确认）、左右各放 40pt 圆钮；标题可换行（kit 无 nowrap，长标题 / 大字号会长高）；`useShellTopGap` 让 16e（安全区 47）也从 50pt 开始，与画框状态栏带一致（仅 iOS） | kit `ui.css:83–93`、`kit.js topbar()` |
| Task 容器 | 顶栏改「🔍 · Task + 日期 · ＋」；日期按语言的字典模板（日文「10月7日（水）」全角括号）；🔍 暂接人脈检索（App 还没有全局检索，对应 Web 🔍 → ⌘K，已告知主会话）；分段改 kit `.tseg`（按钮 7 / 0 内边距、12.5 / 700、选中 `0 1px 2px` 阴影）与 `.tswipe`（上 8、下 12）；左右边距 18 | app.html `taskHead`、`ui.css:722–727`；盘点共性 2 |
| 二级页顶栏 | `AppScreen` 的返回栏换成 `ShellTopBar`：左 ‹ 圆钮（只有图标；读屏名仍是「返回 / 返回设置」等）、居中标题、右侧 `headerActions`；去掉底部分隔线 | 盘点共性 1；A-R05-10 |
| マイページ | `ShellBackBar` 改为同一顶栏：‹ · 「マイページ」+「プロフィール N%」（资料完成度）· ⚙（原太阳钮，进设定）；页内重复的大标题行去掉；保留「受信箱」行（R05 有意保留） | b5 マイページ 画板；A-R05-11 |
| 雾面背景 | 新增 `ShellBackground`：两团径向渐变（420×320 @ 0% 0%、380×300 @ 100% 8%，70% 处透明）叠在 `--bg` 上，固定不随滚动；用于 `AppScreen`、Task、イベント、マイページ、iOrbit（页面底色由 `--surface` 改 `--bg`） | kit `.phone` 背景（`ui.css:65`）；盘点共性 4 |
| 底栏 | 标签行高 15（10 × 1.5，原 12 使图标高 1.5pt）、未选中色 `--ink-3`（RD-05 壳内例外，待确认）；D07 滑出 / 滑入 | `ui.css:97–106`；D07 |
| 圆钮 | `IconButton`：画 40pt（或 34pt）圆，外面是真正 44pt 的按压区，用负外边距抵回，布局占位不变；未读点 7×7 | D01；kit `.rbtn .dot` |
| 文字基线 | `cjkLift`：同一行框里 iOS 把粗体字放得比浏览器低约 1pt、含假名汉字的行再低约 1pt，壳内文字按实测上移（顶栏标题 −1 / −2、副标题 −0.5 / −1、分段 −1 / −1.5、底栏标签 −0.67） | 本次逐像素实测（`bbox.mjs`） |
| token / 文案 | `shadows.segment`；`shell.task.headerDate`、`shell.me.completeness`（三语，copy-kinds 登记为 label）；SVG 包装补 `Defs / RadialGradient / Stop` | — |

## 3. 像素门禁（返工前 → 返工后）

返工前 = 2026-10-11 盘点 run-01（整屏）；返工后 = `r8/`（门禁工具 3x 设计渲染之后）。局部视图：Task 顶栏 + 分段 + 页码点 `0,50,390,128`；マイページ 顶栏 `0,50,390,64`；底栏胶囊 `14,756,362,62`（只框胶囊本身，排除旧正文）。全部 `--grid 30`（底栏 31），阈值 0.02。

| 画面 | 返工前整屏 浅 / 深 | 返工后整屏 浅 / 深 | 顶栏局部 浅 / 深 | 底栏局部 浅 / 深 | 超阈带来源 |
| --- | --- | --- | --- | --- | --- |
| A-R05-01 ホーム | 0.126 / 0.106 | 0.073 / 0.117 | 归 R10 | 0.023 / 0.031 | 字形（标签）、图标亚像素 |
| A-R05-02 人脈 | 0.159 / 0.140 | 0.091 / 0.152* | 归 R11 | 0.024 / 0.026* | 同上 |
| A-R05-03 イベント | 0.194 / 0.171 | 0.141 / 0.253* | 归 R26 | 0.023 / 0.030 | 同上；深色整屏变高是旧正文在新底色上的对比（正文归 R26） |
| A-R05-04 Task · カレンダー | 0.109 / 0.148 | 0.088 / 0.168* | 0.018 / 0.019 | 0.024 / 0.024 | 顶栏：日期 [data]、分段假名字形 |
| A-R05-05 Task · To-do | 0.101 / 0.114 | 0.083 / 0.132* | 0.017 / 0.017 | 0.024 / 0.022 | 同上 |
| A-R05-07 Task · メモ | 0.097 / 0.103 | 0.087 / 0.096* | 0.017 / 0.017 | 0.025 / 0.037 | 同上 |
| A-R05-11 マイページ | 0.166 / 0.159 | 0.129 / 0.175* | 0.030 / 0.031 | — | 完成度 [data]、标题假名字形 |
| A-R05-09 iOrbit | 0.120 / 0.113 | 未重跑 | 归 R21 | 无底栏 | 只加了雾面背景 |

\* 取 r7（1x 设计渲染）一轮的整屏数；r8 人脈深色一轮设计侧截图失败，收口全量时重跑。

- 顶栏局部的整块 raw 已 ≤ 0.02（Task）；超阈带是第 1 带（日期，已 `[data]`）与第 2 带（分段假名）。
- 底栏胶囊：拆开看，只框图标行 0.027–0.029，只框标签行 0.040–0.047（假名）；胶囊外形、边线、阴影、选中块所在带均为 0。
- A-R05-06（To-do 空态，需换账号）、A-R05-08（横滑过渡）、A-R05-10（联系人详情，本机同步 503）与盘点时一样未截。

### 3.1 归因（`repos/orbits/scripts/visual/attribution-redesign-R05.json`）

只写了 `[data]`：Task 三段 × 浅深的顶栏第 1 带（日期）、マイページ 浅深第 1 带（完成度数字；文字居中，数字宽度不同会带动整行左右移）。字形与亚像素两类**没有**写成 `[data]`。

### 3.2 发现并已由门禁工具会话修正的两处工具问题

- 设计画框页面 y 为小数时截出 390×845、底栏低 1px → `29591783` 改为先把画框搬到左上角整数坐标。
- 1x 渲染时 Chrome 把 SVG 图标边对齐整像素，和真机 3x 缩小后的半像素灰边对不上 → `37209736` 改为设计侧 3x 渲染再面积平均缩到 1x。
- 另：设计侧 `-apple-system` 在门禁环境里解析不到 SF、英文数字退到 Hiragino——门禁工具已加 `appDesignFontFix`（英文数字走 SF）。

## 4. 用户 / 主会话拍板

本次没有新的用户拍板；D01、D07 按 2026-10-12 拍板结果实现。按「成熟产品惯例自己定、告知主会话」处理的两件：Task 🔍 暂接人脈检索；首页 / 人脈 / イベント / iOrbit 顶栏随正文归各自 Sprint。

## 5. 仍待拍板 / 交给别的 Sprint

| # | 事项 | 推荐 | 状态 |
| --- | --- | --- | --- |
| ① | RD-05 壳内例外扩到 App：底栏未选中标签、顶栏副标题用 `--ink-3`（Web 已有同样例外） | 同意（对标 iOS 标签栏未选中项浅灰） | 已按推荐做，等主会话确认 |
| ② | 假名粗体字形：iOS 系统回退 vs 设计图 Hiragino W7/W8 | (a) 认定为渲染差异，门禁另立「[font] 假名字形」类别（同带几何颜色须对齐）；(b) App 日文统一显式用 Hiragino 各字重（属 R01 token，全 App）；(c) 门禁侧模拟 iOS 回退（不推荐） | 等拍板；这些带单列，不算 `[data]` |
| ③ | 图标 1/3pt 亚像素（Yoga 与 Chrome 取整方向不同） | 认定为渲染差异；不在 App 里挪 0.17pt 去凑 | 等拍板 |
| ④ | Task 🔍 的正式目的地（全局检索） | 后续 Sprint 做 App 全局检索后改接 | 交后续 |
| ⑤ | 首页 `.hhead`、人脈 / イベント 顶栏、iOrbit ≡ / ✕ 与输入栏 | R10 / R11 / R26 / R21（D06） | 交各 Sprint |

## 6. 影响面（GitNexus）与对策

| 符号 | 风险 | 对策 |
| --- | --- | --- |
| `AppScreen` | **CRITICAL**（97 处受影响、63 直接） | 只改外观：props 全部保留（`backLabel` 仍可用作读屏名）；嵌入 Task 段时不画背景与顶栏；全量 3967 条测试 |
| `GlassSurface` | HIGH（5 / 2） | 未改动 |
| `IconButton` / `Segmented` | UNKNOWN → 文字检索：14 / 7 个文件 | 圆钮占位用负外边距保持 40 / 34；`Segmented` 只给 Task 用的 `tseg` 变体加样式，默认 `.seg` 不变 |
| `OrbitTabBar` / `ShellTabBar` / `SwipeSegments` / `ShellBackBar` / 各屏 | LOW | — |
| `TaskScreen` / `HomeDashboardScreen` | UNKNOWN（文字检索：Task 由 `app/task.tsx` 挂载；首页本次未改） | — |

`detect-changes --scope all`：工作区共 57 个文件（含其他会话的 Web 计划页与文档改动），本次只提交 App 壳相关 30 个文件；风险 critical 来自 `AppScreen`，对策同上。记录：`impact-rework.txt`、`detect-changes.txt`。

## 7. 测试

- `npx tsc --noEmit`：通过。
- App 全量：3967 条，失败 2（`notification-registration-races` 一组定时用例、`ink-signal-profile` 一条点击超时），**单独重跑都通过**，是全量并发下的超时，不是本次改动（`app-test-2.log`）。
- 按新壳更新的测试（断言旧样式的地方）：返回钮只剩图标（读屏名不变）、顶栏标题 17px、マイページ 底色 `--bg`、Task 分段高 ≥ 32（kit 32.75）、40pt 圆钮的可视盒（D01；按压区由新结构保证 44）、离线清单登记的行号、日程编辑页「备注行不被保存栏挡住」改为先滚到底再判断（顶栏由 49 变 60）。

## 8. 改动的文件

`repos/orbit-app/src/components/{ShellTopBar.tsx（新）, ShellBackground.tsx（新）, ui/cjk-lift.ts（新）, AppScreen.tsx, OrbitTabBar.tsx, ShellBackBar.tsx, ui/IconButton.tsx, ui/Segmented.tsx, ui/svg.ts, ui/svg.native.ts}`、`src/design/tokens.ts`、`src/i18n/{copy-kinds.ts, ja|zh|en/shell.ts}`、`src/screens/{task/TaskScreen.tsx, profile/ProfileScreen.tsx, events/EventsScreen.tsx, ai/AiScreen.tsx, showcase/ComponentShowcaseScreen.tsx}`、`scripts/audit-offline-read-surfaces.ts`；测试 `tests/{app-wide-account, app-wide-primitives, ink-signal-event-operations, ink-signal-shell}.test.ts`、`tests/{personal-schedule-interactions, shell-back-restore, skeleton-japanese, task-container}.test.tsx`；`repos/orbits/scripts/visual/attribution-redesign-R05.json`（新）。
