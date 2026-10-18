# R31a REPORT — App 组件库像素轮（A 线）

**状态：** done（部分），待复核——SC-03 已按 §52-2 人工例外收敛（43 / 44 自动通过，1 张两带人工接受；见 §11）、SC-07 部分（余项已交还），SC-08 不退步通过（唯一退步已修）。**worktree：** 原轮 `/Volumes/ORICO/Dev/worktrees/orbit/redesign-a`（`line-a`）；SC-03 补轮 `/Volumes/ORICO/Dev/worktrees/orbit/redesign-a2`（`line-a2`）。**模拟器：** Orbit Line A 16e（iPhone 16e，ja-JP，RD-33）。**环境：** 本地库 `orbit_line_a`、mock 服务器 :3200（`ORBIT_REDESIGN_MOCK=all`）、Metro :8082（`open-path,no-keyboard,add-scan`）；没连 Neon、没部署、没调付费 AI。**证据：** 原轮 `/Volumes/ORICO/Dev/line-a-evidence/R31a/`；SC-03 补轮 `/Volumes/ORICO/Dev/line-a-evidence/R31a-sc03/`。

## 1. 提交（按时间）

| 提交 | 内容 |
| --- | --- |
| `521b2254f` | 第 1 步：`pass-baseline-app.json`（124 pass / 14 R05 区域 / 91 未过）+ `rerun-list.json` |
| `1d306d07b` · `b09165557` | 工具里程碑：规格格定位 / 分侧 `--region` / `[contrast]` 判定、两端 CLI、`contrast-substitutions.json` + 一致性测试 |
| `c71733b9c` | App 展示页按 01-system 规格格重排 + `/showcase/components/[section]` + `views/app-R31a-components.json` |
| `7457b4cc0` | 组件第 1 轮：Segmented（.seg 30、`inline`、命中区只纵向）、FilterOption / CategoryTabs / Toggle / Checks / Chip、Icon 12 / 13（后加 15）+ `strokeWidth`、ConfirmDialog 图标位 / `.dic.emo` / `cancelVariant`、Toast（去 ✕、点按关、先关后回调、`usePageBottomBar`）、BottomSheet 失焦自动关 / `dismissOnBackdrop` / `draggable`、`shadow.knob`、01-system ① 深色 Toast 改稿（RD-33） |
| `ef8ecc9d1` | 新组件 UnderlineTabs / TabBar（live）/ FullScreenSearch，替换 4 处手写件，`legacy-ui-deferred.json` 清空 |
| `a37d0f551` | 组件第 2 轮：Button md 40 / lg 46、ActionSheet 画板标题头、Popover、AppScreen `inset="kit"`（加人各页删 `KIT_PAGE_INSET`）、01-system ⑮ 完成勾 / ② 焦点环（RD-33） |
| `d288c9e86` | R11a 请求：Chip `icon`、SearchField `trailing`、IconButton `solid`、`FormScreen` |
| `f6ba1e0b6` | `preflight-checklist.md` |
| `b7953dc89` | A-R17-P05 重比通过（R17 App 归因） |
| `5663dea90` | DEFERRED-A / 交接表更新 |
| `756463cfd` · `075ee2e69` · `a07256ed5`（主会话 cherry-pick 后推送） | RD-28 开发包中途状态开关（计划 sheet / 对话框、草稿 n09）、计划页确认框调用点、n09 用画板草稿 |
| `0e76ad18f` | 交还 R31a-H1–H5 写入交接表 |
| `6e6b997da` | SC-08 发现的导入三段 inset 退步修复 + 新模拟器 [raster] 归因 |

## 2. SC 对照

| SC | 结果 | 证据 |
| --- | --- | --- |
| SC-R31a-01 工具（里程碑） | done | 工具测试；两端 CLI；展示页小节路由（工具里程碑报告） |
| SC-R31a-02 `[contrast]`（里程碑） | done | `tests/scripts/redesign-pixel-components.test.ts`（清单内通过 / 非清单失败 / 混真实缺陷失败 / 一致性） |
| SC-R31a-03 组件全部对齐 | **收敛（§52-2 人工例外）** | 22 格 × 浅深 44 张：43 张自动通过、1 张 `c-ctl-0` 浅色的两条说明文字带按 §52-2 人工接受；其余 209 条超阈带已自动归因。旧基线 1 / 44 见 §3，新结果见 §11。|
| SC-R31a-04 组件行为 | done（渲染测试） | Toast 无 ✕ / 点按关 / 先关后回调 / 按页底栏（ui-toast）；sheet 遮罩不关但返回键关、路由变化自动关（ui-overlays）、输入时不关（ui-logic）；Segmented 纵向 ≥44 且相邻不重叠（ui-components-render）。模拟器手势验证未做（无手势工具授权） |
| SC-R31a-05 新组件与替换 | done | 4 处已替换；`legacy-ui-ratchet` 过；A-R30-P05–P08 8 / 8 通过（不退步） |
| SC-R31a-06 调用点与交接 | done（大部分） | `KIT_PAGE_INSET`、`ignoreDismiss`、`useFocusEffect` 临时写法已删；R15 下書き sheet `inline`；N12 / skip / 達成确认框图标位；会場 `usePageBottomBar`。条目表见 §4 |
| SC-R31a-07 重比 | **部分** | §4：R26-11 10 / 10、R17-17 2 / 2、R30 8 / 8 通过；其余余页面自身差异 → 交还 |
| SC-R31a-08 不退步 | done（§6） | 107 个基线键：唯一 R31a 退步（导入三段 inset）已修；其余为新模拟器字形残差（已逐带看过并归因）或环境状态 |
| SC-R31a-09 测试与复核 | 见 §5 | 待独立复核 |

## 3. SC-03 前逐件对照基线（App，16e，`views/app-R31a-components.json`）

| 小节 × 主题 | 结果 | raw | 超阈带（全部未归因） |
| --- | --- | --- | --- |
| c-toast-0-app-light | FAIL | 0.0399 | 6 |
| c-toast-0-app-dark | FAIL | 0.037 | 6 |
| c-confirm-0-app-light | FAIL | 0.0398 | 7 |
| c-confirm-0-app-dark | FAIL | 0.0316 | 5 |
| c-ai-0-app-light | FAIL | 0.2089 | 4 |
| c-ai-0-app-dark | FAIL | 0.234 | 4 |
| c-ai-1-app-light | FAIL | 0.1515 | 4 |
| c-ai-1-app-dark | FAIL | 0.1499 | 4 |
| c-ai-2-app-light | FAIL | 0.1907 | 4 |
| c-ai-2-app-dark | FAIL | 0.1924 | 4 |
| c-ai-3-app-light | FAIL | 0.2153 | 4 |
| c-ai-3-app-dark | FAIL | 0.1984 | 4 |
| c-why-0-app-light | FAIL | 0.1226 | 10 |
| c-why-0-app-dark | FAIL | 0.1597 | 11 |
| c-load-0-app-light | PASS | 0 | 0 |
| c-load-0-app-dark | FAIL | 0.1849 | 7 |
| c-load-1-app-light | FAIL | 0.1071 | 10 |
| c-load-1-app-dark | FAIL | 0.0894 | 10 |
| c-err-0-app-light | FAIL | 0.3855 | 7 |
| c-err-0-app-dark | FAIL | 0.3441 | 7 |
| c-err-1-app-light | FAIL | 0.208 | 8 |
| c-err-1-app-dark | FAIL | 0.2069 | 8 |
| c-err-2-app-light | FAIL | 0.1268 | 6 |
| c-err-2-app-dark | FAIL | 0.1333 | 6 |
| c-err-3-app-light | FAIL | 0.28 | 5 |
| c-err-3-app-dark | FAIL | 0.3625 | 6 |
| c-sample-0-app-light | FAIL | 0.2054 | 5 |
| c-sample-0-app-dark | FAIL | 0.175 | 6 |
| c-sample-1-app-light | FAIL | 0.2995 | 11 |
| c-sample-1-app-dark | FAIL | 0.2589 | 10 |
| c-chip-0-app-light | FAIL | 0.1483 | 6 |
| c-chip-0-app-dark | FAIL | 0.2271 | 7 |
| c-pay-0-app-light | FAIL | 0.3153 | 7 |
| c-pay-0-app-dark | FAIL | 0.326 | 7 |
| c-pay-1-app-light | FAIL | 0.2554 | 9 |
| c-pay-1-app-dark | FAIL | 0.2385 | 8 |
| c-text-0-app-light | FAIL | 0.1615 | 2 |
| c-text-0-app-dark | FAIL | 0.1687 | 2 |
| c-text-1-app-light | FAIL | 0.2283 | 3 |
| c-text-1-app-dark | FAIL | 0.1914 | 3 |
| c-text-2-app-light | FAIL | 0.4073 | 3 |
| c-text-2-app-dark | FAIL | 0.5798 | 3 |
| c-ctl-0-app-light | FAIL | 0.0694 | 6 |
| c-ctl-0-app-dark | FAIL | 0.0668 | 6 |

说明：
- 当时组件本身的 kit 数值已逐项对齐（`preflight-checklist.md`）；差距主要在展示页小节对规格格的「拼装」：规格格里的说明文字、示意布局（例如 c-ai 卡内的 emoji 方块与链接行、c-err 的离线横条组合、c-pay 的配额条、c-text-2 的全文气泡）在 App 组件里没有一一对应的件，需要逐格把小节拼成与格一致的结构（多数是展示页工作，少数需要组件补参数）。本节是 SC-03 补轮前的基线，收敛结果见 §11。
- 排除的格与理由在清单 `_excluded`：mini 缩放格、Web 格、290×470 示意比例小画框（c-layer-0 / 1）、文档 `.asheet` 固定 360 宽（c-confirm-1）、iOrbit / 系统推送 / 业务页格。
- `[contrast]` 常量：ΔE76 4、α 1/64、未解释上限 5%。真实图上的分布还没量（目前没有带标 `[contrast]`）。

## 4. 交接条目与重比结果（RD-28 / §5）

| 条目 | 处理 | 重比（16e） |
| --- | --- | --- |
| G23 / G23b / U02 | 组件已修（§1） | — |
| R26-11 | Segmented | A-R26-13 / 14 / 15 / 30 / 30e 浅深 **10 / 10 通过**（沿用 R26 归因文件） |
| R27-01 | Segmented | 16u 深通过；06 / 07 / 08 / 29 / 31 / 33 / 34 分段区不再超阈，余带为页面自身（探す chip 位置下移 3、轮播卡底部 4、搜索框 placeholder ink-3 → ink-3-text 可走 `[contrast]`、字形）→ **交还 R27**；26 另卡 expo-brightness |
| R27-02 | FilterOption / Toggle / Toast / 会場底栏声明 | A-R27-09 / 35 余页面差异 → **交还 R27** |
| R27-04 | 4 处手写件换新组件 | done；R30 8 张不退步 |
| R17-17（App） | Segmented | A-R17-P05 浅深 **通过**（`b7953dc89`，[raster] 逐带看过） |
| R16-01（App） | Segmented | A-R16-02 分段区对齐；余带：列表尾部行偏移 1–2、头像色 [data] → **交还 R16** |
| R12-12 | ConfirmDialog 图标位 + n09 开关 | A-R12-N09 对话框本体一致；余：草稿卡 🥂 来源 chip、「参加者から取り込む」图标 → **交还 R12**；N12 需样本账号未跑 |
| R24-05c | Popover 新建 + 开关 | A-R25-11 目標切替需改成 .gmenu 弹出菜单（行结构不同）→ **交还计划页**（RD-33）；A-R24-05 / 13 / 16、A-R25-01 / 12 各 sheet 内容结构与画板不同（标题头、行布局、主按钮）→ **交还计划页**；A-R24-12 / A-R25-08 改 `.dic.emo` 图标后余文案与 fixture 分数差 |
| R12 REWORK §5 | AppScreen 内容区 | `inset="kit"` opt-in（RD-33 接受），加人各页改用；Icon 12 / 13 已加；`showBack=false` 大标题头未改（旧屏专用，随各屏重写） |
| R15 REVIEW m4 / :78 | sheet 参数 / 失焦自动关 | done（`ignoreDismiss` 与 `useFocusEffect` 已删） |
| R17 REPORT:151 BottomSheet 深色 | — | kit `.sheet` 无深色专属样式，App 已随 token（surface / scrim）切换；当时引用的 b12 #428 编号已变（现为 QR 读取画板），未找到对应画板 → 请复核确认 |
| R11a 请求（RD-33） | Chip icon / SearchField trailing / FormScreen | done（`d288c9e86`） |

## 5. 测试

- App 全量（heavy.sh）：最近一次 3338 项，失败为基线同名（add-contact-screens 相机 / 批量 9 条、i18n-domain-split）与负载超时（S1 / 無効にする / plan skip，串行重跑过）；本 Sprint 新增失败 0。`tsc` 0。
- orbits：工具测试 22 / 22；token / 图标源测试过；全量 7460 项失败 7（与 R30 基线同数，typecheck 那条已修）。
- 新增测试：`tests/scripts/redesign-pixel-components.test.ts`、`tests/component-showcase.test.tsx`、`tests/ui-r31a-new-components.test.tsx`、`ui-overlays` / `ui-logic` / `ui-toast` / `ui-components-render` 增项。

## 6. SC-08 不退步（16e，heavy.sh）

范围：`pass-baseline-app.json` 的 124 个 pass 键里不需要手势的 115 个（另 9 个要手点、R05 区域 14 个未单独跑），实跑 107 个键（runner 按 view 跑浅深，部分 view 只有一个主题在基线里）。

| 结果 | 个数 | 说明 |
| --- | --- | --- |
| 首轮通过 | 80 | |
| **R31a 引起的退步，已修** | A-R16-03 / 04 / 05（6 键） | 导入「整理中 / LinkedIn / まとめて確認」三段原来也有 `KIT_PAGE_INSET`，删掉后没切 `inset="kit"`，整页下移 12 左移 2 → `6e6b997da` 修好，重跑位置回到 dx 0 / dy ≤2 |
| 换模拟器后的字形残差，逐带看过后记 [raster] | 17 键 | R16-01 / 03 / 05、R12-00 / 03 / 46 / N10 / N11、R15-10 / 12、R24-09：位置 dx ≤3 / dy ≤3、底色字色一致，只差 iOS 与 Chrome 字形栅格化（基线是在另一台 16e 上测的，新模拟器 Orbit Line A 16e 残差略大，越过 0.02）；归因写进各自 `attribution-redesign-*-app.json`（`6e6b997da`），用同一张截图 `--shot` 复算全部 PASS |
| 环境状态不同（非 R31a） | A-R12-15（名字没输入，保存钮灰）、A-R12-N10d（新模拟器没给相机权限，进了权限页）、A-R27-10（本机没有「最近の検索」历史）、A-R27-24（本机没存「名刺の残り」）、A-R25-03（见直し页接口在本环境加载超时） | 要么手势输入 / 授权，要么造本机状态；不属组件 |
| 待查 | A-R16-04 浅深 | 「名前が似ているだけの 2件」标签没出现：条件渲染改动来自 `17358002b`（R12 返工，R16 通过之后），看起来与 R31a 无关，需 R16 / R12 页面方确认 |

结论：R31a 组件改动造成的退步只有导入三段一处，已修；其余失败为模拟器字形残差（已归因）或环境状态。

## 7. 主会话代定（RD-33）

模拟器改 16e；深色 Toast 按 RD-17 改稿；c-layer-0 / 1 改用 b2 絞り込み；AppScreen `inset="kit"` opt-in；完成勾按 RD-17 绿（⑮ 改稿）；App 确认框 / 动作表不画焦点环（② 注释）；A-R25-11 记交还；R11a 组件请求纳入。

## 8. 自定决定（工程）

- 规格格设计侧把 `.stage` 文档雾面底换纯 `--bg`；规格格实现截图按设备点比；弹层 region 用 `c` / `b` 或 16e 实测点。
- 展示页示例数据放 `component-section-samples.json`（数据，不是界面文案）。
- Button md 由 44 改 kit 40（hitSlop 2 保 44 触控区）；相关旧测试改为 40。
- 计划页 / 评估页的页内抵消（−12 / +2）保留，未切 `inset="kit"`（PlanSegment 内 NewGoal 等未抵消，混用会移位）。

## 9. 交还清单（已写入交接表，并入 R32 交还清理轮，决定表 §52-5）

- **R31a-H1**（R26 / R27 节）：A-R27-06 / 07 / 08 / 09 / 29 / 31 / 33 / 34 / 35 页面自身差异。
- **R31a-H2**（R12 / R15 / R16 节）：A-R12-N09 草稿卡来源 chip 🥂、「参加者から取り込む」图标。
- **R31a-H3**（同上）：A-R16-02 列表尾部行偏移、尾部渐隐区内容。
- **R31a-H4**（R22–R25 节）：A-R25-11 目標切替改 Popover（.gmenu）并按画板重排行（RD-33）。
- **R31a-H5**（同上）：A-R24-05 / 13 / 16、A-R25-01 / 12 sheet 内容结构；A-R24-12 / A-R25-08 文案与 fixture 分数。

## 10. 未完成 / 下一步

1. 交还项由页面 Sprint 处理后再重比。
2. 独立复核（重跑门禁；SC-03 两条 §52-2 人工例外须保留独立记录）。

## 11. SC-03 收敛（line-a2，2026-10-18）

本轮在 `line-a2` 逐格对照 `01-system.html` 的 22 个 App 规格格（浅、深共 44 张），以 §3 的 1 / 44 为起点。示例文案和人物数据放在 `component-section-samples.json`；展示页使用真实 App 组件补齐 AI 确认三态、依据、加载、错误、示例、chip、配额与长文本示例。组件只增加按需启用的展示参数；原有调用点沿用默认外观。`ConfirmDialog` 的静态展示模式复用对话框本体，分别绘制规格格中的 322 点遮罩示意和 280 点示例拦截框。`Chip` 的 kit 展示模式使用 01-system 原始墨色，业务默认仍使用 RD-05 加深文字色；这些选项不改变旧调用点默认外观，故本轮没有触发 R05 壳门禁。套件按 16e 的 390 点宽设置裁剪，并开启逐带截图。

除下述截图写盘故障外，本轮没有改动 `scripts/visual/**` 工具代码。证据目录：`/Volumes/ORICO/Dev/line-a-evidence/R31a-sc03/`。App `tsc --noEmit --pretty false` 通过；定向组件测试 11 / 11、UI / 文案测试 33 / 33 通过。

门禁环境故障（修复前记录）：首个聚焦门禁 `baseline-ai0` 的浅、深两张都在 `xcrun simctl io … screenshot` 写入外置盘证据目录时返回 `NSCocoaErrorDomain 513` / `EPERM`，未产出可比较图。目录属主与权限正常，当前 shell 可在该目录创建文件；同一模拟器的 `simctl` 截到 `/tmp` 成功，随后 shell 复制到证据目录也成功。故障位于 `simctl` 对外置盘目标的写入边界。按本 Sprint 的工具例外，在本条记录后最小修改 App 比对脚本：先截到系统临时目录，再复制进 `--out`，不改变截图、裁剪或判定算法。等价的临时子目录截图与复制探针产出有效的 1170×2532 PNG；`node --check` 和视觉工具定向测试 7 / 7 通过。

修后首轮 `full-01` 产出全部 44 张截图，自动通过 2 / 44（两张 `c-load-0`），222 条带超阈且未归因。逐格三联图显示：`c-confirm-0`、`c-sample-1` 的设计格为内嵌对话框示意，原 App 截图却带整屏遮罩；`c-err-0/2`、`c-sample-0`、`c-pay-0/1`、`c-text-1/2` 有可见间距或折行差。这些按源码和裁剪图修展示结构与可选组件展示模式，没有当作 raster 归因。其余带待二轮截图核对后逐带记录。

`fix-01` 聚焦 11 格 × 浅深验证了遮罩示意、状态卡和配额卡的几何；发现示例拦截框底部差 12 点后，将静态竖排动作间隔补齐。`full-02` 再拍全部 44 张，超阈带降至 211；示例拦截框的缺块告警消失。逐张浅深三联图和告警裁剪复核时又发现 `c-text-1` 深色活动标题误用原生黑字，改为主题 `ink`；重试卡的 kit 正文字号从 13 校到设计的 12.5。两项定向重拍后，才给它们剩余的字形差写逐带归因。

最终 `full-final/summary.json` 在 `heavy.sh a2` 独占门禁下重跑全部 44 张，**43 / 44 自动 PASS**；211 条超阈带中 **209 条自动接受**（均为逐图核对的 `[raster]`），剩余 **2 条**只在 `A-R31a-c-ctl-0-app-light`，标记 `[contrast]` 并依决定表 §52-2 人工接受，故 CLI 仍以退出码 5 报 FAIL，不能称作 44 张自动通过。两带分别为 y=0–30、30–60，工具未解释比例 62.1%（329/530 px）、58.7%（299/509 px）；裁剪图见该视图 `bands/band-0.png`、`band-1.png`。规格格用原色，App 按 RD-05 保留加深文字色；等宽说明字导致替换算法覆盖不足。三联图中对应文字、位置与上下相邻结构一致；该人工例外由 §52-2 明确允许，不据此修改工具或放宽阈值。`attribution-redesign-R31a-app.json` 给 42 张有超阈带的视图逐带注明理由，另两张 `c-load-0` raw=0。综上 44 / 44 张都有可复核结论，但自动门禁仍为 43 / 44。

最终有 5 个缺块算法提示：`c-err-0` 浅深、`c-err-2` 浅色、`c-ctl-0` 浅深。各裁剪图中目标文案均可见，属于字形墨迹差，不是缺失组件。`full-02` 运行时共享重任务锁曾发生元数据写入竞态；最终 `full-final` 已确认持有 `a2` 锁后运行。磁盘门槛触发时，仅在确认没有运行中的 tsx 测试后清理一次性 `/private/tmp/tsx-501` 缓存，未触及项目文件。最终证据以 `full-final` 为准。

本轮按路径提交：App 组件 `5aa072d5d`、展示页与示例数据 `ce5a465d0`、套件清单／归因／截图写盘修复 `82a2bcf2b`；本报告单独提交。均只在 `line-a2`，未 push。

## 12. 复核处理（2026-10-19）

- **M3：** 按 REVIEW 提供的第二种收口方式，将 PLANNER SC-07 的开发状态开关验收改为“正式包不可启用”。`addDesignMock` 要求 `__DEV__` 为真；`ui-r31a-new-components.test.tsx` 覆盖 `__DEV__=false` 时 `open-path` 不生效。现有证据不证明开关代码未进入正式 bundle，故不再使用“不进正式构建”的表述。
