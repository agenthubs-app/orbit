# Sprint R31a — App 组件库像素轮

**Plan revision:** 2（2026-10-18 按独立复核 S1–S3、M1–M10、m1–m9 与用户拍板 RD-27～RD-30 修订）。**模式:** existing-codebase / single-generator（负责：乙）。
**单一目标:** 逐件对照工具（**两端 CLI 都在本 Sprint 接好**）+ `[contrast]` 归因 + App 组件修正与补件 + 调用点改用新参数 + 替换手写件 + App「待组件库」画面重比 + 不退步。
**易读目标:** [GOAL.md](GOAL.md)。
**基线:** 开工时 `redesign` HEAD（编制时 `a7aa1e127`），按符号重新定位行号；已知失败以 README「骨架登记表」最后一行与各 Sprint 收口记录为准。
**进入条件:** R04、R05、R09 completed；甲已交付的门禁清单 `repos/orbits/scripts/visual/views/app-*.json` 与归因文件可用。RD-14、RD-16（2026-10-11 修订）、RD-24、RD-25、RD-26～RD-30 已定。
**提交方式:** 一人做，**直接在 `redesign` 上按路径提交**（RD-25、通用规则 12：`git commit -m … -- <自己的文件…>`，提交后 `git show --stat HEAD` 核对）。
**并行（RD-30 附）:** 本 Sprint 第一个里程碑「工具里程碑」= SC-R31a-01 + SC-R31a-02 合入。之后 **R31b 可以同时开工**：两者改的文件不重叠（App `src/components/ui/**` 与调用点 vs Web `orbit-2026/ui/**` 与调用点），共用的只有 `repos/orbits/scripts/visual/**`（工具里程碑后冻结，只允许修 bug，改动先在两条线的交接里写一句）。

## 交接条目（逐条写进 SC，REPORT 逐条写处理结果）

| DEFERRED-A §1 / 交接表 # | 内容（App 部分） |
| --- | --- |
| G23 | `Toast` 点按先关再回调；`BottomSheet` / `ActionSheet` 页面失焦自动关；确认 sheet 支持不可拖关；`MacTile` 小号 emoji 等逐件对齐 kit（Q1）；**新增 UnderlineTabs、可配置 TabBar（含会場玻璃底栏）、全屏搜索页容器，替换后删 `tests/fixtures/legacy-ui-deferred.json` 的 3 行** |
| G23b | `MacTile` emoji 21 / 17、圆角 13；`FilterOption` 上下 7 |
| U02 | 组件逐件对照（Q1） |
| R26-11 | `Segmented`（见契约 §3）→ 重跑 app-R26 的 13 / 14 / 15 / 30 / 30e（浅深 10 张） |
| R27-01 | 同上 → 重跑 A-R27-06 / 07 / 08 / **16u** / 29 / 31 / 33 / 34（浅深）；A-R27-26 另卡 expo-brightness 与 QR 内容（R27 REPORT:33），预计「部分 / 交还」 |
| R27-02 | `FilterOption` / `Toggle` → 重跑 A-R27-09；`Toast` → 重跑 A-R27-35 |
| R27-04 | 三处手写件（DiscoverPage 全屏搜索 `<Modal>`、EventDetailPage `.utabs`、VenuePage livebar）换新组件，删白名单行 |
| R17-17（App 部分） | `Segmented` → 重跑 A-R17-P05 |
| R17 REPORT:151 | App `BottomSheet` 没有深色变体（b12 #428）→ 补上 |
| R24-05c | Sheet / Dialog / Popover 对齐 → 重跑 app-plan-A 的 A-R24-05 / 12 / 13 / 16、app-plan-C 的 A-R25-01 / 08 / 11 / 12 |
| R16-01（App 部分） | `Segmented` → 补跑 A-R16-02 |
| R12-12 | `ConfirmDialog` 加图标位（含 `.dic.emo`）→ 重跑 A-R12-N09（及 N12） |
| R12 REWORK-REPORT-app §5（:59-61） | `Icon` 缺 12 / 13 号；`AppScreen` 内容区比 kit `.scroll` 上多 12、左右各少 2（加人各页暂用 `KIT_PAGE_INSET` 抵），`showBack=false` 时变大标题头 |
| R15 REWORK-REPORT §5（:85-87） | `Segmented` 要有行内档（kit `.seg` 是 `inline-flex`）；`Avatar` lg 字号 20 → kit 19；App `Icon` 缺 12 号（R15 无标「待组件库」的画面 id，A-R15-08 等已通过画面归入「不退步」） |
| R15 REVIEW:89 m4、REPORT:42 #9 | `BottomSheet` 支持只让遮罩点击不关（`dismissOnBackdrop={false}`），返回键与 VoiceOver 退出照常；去掉 `InviteConnectionSheets.tsx` 的 `ignoreDismiss` 绕法 |
| R15 REVIEW:78 | 失焦自动关做好后，删掉 `InviteSenderScreen` 页面层的 `useFocusEffect` 临时写法 |
| R30（App） | 全屏搜索页容器 → 替换 `src/screens/search/GlobalSearchScreen.tsx` 的手写容器，重跑 A-R30-P05–P08 |

## 已查清的事实（按 `a7aa1e127`）

1. **组件库**：`repos/orbit-app/src/components/ui/`：Accordion、ActionSheet、Avatar、BottomSheet、Button、Card、Checks、Chip、ConfirmCard、ConfirmDialog、Filters、FullDrawer、GlassSurface、Icon、IconButton、ListRow、MacTile、Portal、Pressable、Progress、Scrim、SearchField、Segmented、States、SwipeRow、Text、TextField、Toast、Toggle、WhyDisclosure（另有 `motion.ts`、`haptics*.ts`、`sheet-logic.ts`、`swipe-logic.ts`、`toast-model.ts`、`feedback-host.tsx`）。**没有 `Popover`**（`index.ts` 也未导出）。
2. **展示页**：本体 `src/screens/showcase/ComponentShowcaseScreen.tsx`；路由 `app/showcase/components.tsx`（另有 icons、copy）；`src/components/ui/showcase.ts` 只是 `showcaseEnabled` 开关。新增分小节路由时把 `components.tsx` 挪成 `app/showcase/components/index.tsx`，再加 `components/[section].tsx`；按 HOW-TO §7 登记 `tests/app-wide-route-coverage.test.ts`（`integratedFeatureRoutes`，约 :230）与 `scripts/page-offline-inventory.ts`（`device-only`，约 :59）并重新生成 `docs/offline/page-inventory.md`；`route-parity` 不受影响。
3. **01-system 规格格结构**（`docs/designs/redesign-2026-10/01-system.html`，约 :255 起由 JS 模板 `cell(cap, html, w)`、`comp(demo, d)`、`duo(...)`、`sec2(id, …)` 渲染）：只有 22 个小节有 id（`c-toast` … `n-add`）；`duo` 把浅色和深色并排画成两个 `.stage[data-theme]`；`comp` 里演示区和说明卡 `.doccard` 相邻；有 6 处 `mini()` 用 `transform: scale`。**`.utabs` 与 `.tabbar.livebar` 不在 `kit/ui.css`、也不在 01-system**：`.utabs` 在 `b2-events-flow.html:51-55`，会場底栏在 b2 的会場画板里。
4. **kit 规格（行号已核）**：`.seg` `ui.css:34-36`（`inline-flex`、字号 12、按钮内边距 6 / 13、选中有阴影）；`.tseg` :721-728；`.tabbar` :97-106；`.toast` :327-345（`.toast.pos` :337，bottom 100；`.notab` 40；无 ✕）；`.dialog` :354-360（`.dic.emo` :356）；`.sheet` :238-239；`.fopt` :395-398；`.tgl` :404-407；`.mac` / `.emo` :138-142。
5. **`Segmented` 现状**（`Segmented.tsx:107-110`）：撑满整行、`flex:1`、字号 12.5、`minHeight 38`、`hitSlop={4}`。R26 画板里的分段是撑满的，R15 画板是行内的；`.tseg`（Task）的 `taskOption` 写了 `minHeight 0` 不受影响；`SwipeSegments variant="seg"`（イベント页）会随之变化（预期）。
6. **`Toast`**：`ToastProvider` 已有 `hasTabBar`（`Toast.tsx:19`）；缺的是「页面自带底栏」的按页声明（会場页）。
7. **App 门禁工具**：`repos/orbits/scripts/visual/compare-redesign-app.mjs`（设计侧 3x 渲染后面积平均缩到 1x、`--font` 插 `BlinkMacSystemFont`，`README-redesign.md:73-75`）**没有 `--region` / `--crop`**（Web 的 `compare-redesign.mjs` 有）；共享库 `redesign-pixel-lib.mjs` 的归因只按理由前缀判定（约 :112-116），门禁带高 12px（`gridDy = 12`）。实现侧用模拟器真实截图；深链 `simctl openurl` 会弹系统确认框，模拟器控制工具未授权手势，R26 用开发开关 `open-path`（`orbit.dev.openPath`）跳转（R26 REPORT:177）。
8. **判定标准**：App 全屏门禁按决定表 §20（`maintenance/2026-10-12-decisions.md`:232）——所有超阈值带都有正当归因即通过，raw 只作参考；RD-29 起 Web 同此标准。
9. **对比度清单**：`shared/design/README.md:29` 规定 `tokens.json` 的 `color.contrast` 是「文字 × 底色」组合的唯一清单；`tokens.json` 原归甲（RD-30 起本 Sprint 由乙改）。

## 上下文包

### 必读
- 上表所列交接条目原文；DEFERRED-A §1、§3（R17-17）、§4（A-R27-26）；决定表 Q1、§17、§19、§20；`README-redesign.md`「提速」与 App 门禁节；HOW-TO §7、§8。
- `src/components/ui/**`、`src/screens/showcase/ComponentShowcaseScreen.tsx`、`app/showcase/**`、手写件所在 4 个屏幕、加人各页（`KIT_PAGE_INSET` 用法）、`InviteConnectionSheets.tsx`、`InviteSenderScreen.tsx`、`AppScreen.tsx`、各门禁清单与归因文件、`redesign-pixel-lib.mjs`。

### 关键符号与 impact（开工时重跑，HIGH / CRITICAL 在 REPORT 写对策）
- `Segmented`、`Toast` / `ToastProvider`、`BottomSheet`、`ActionSheet`、`ConfirmDialog`、`FilterOption`、`Toggle`、`MacTile`、`Avatar`、`Icon`：全站使用，HIGH；新参数要有默认值。
- `AppScreen`：**CRITICAL**（R05 记录 82 / 58），props 不变；内容区间距的修正以「不退步」全量重跑兜底。
- `OrbitTabBar`：新增可配置 `TabBar` 时主底栏外观与行为不变；每次组件改动后跑 `views/app-R05.json`。

### 易错边界（全部写进 SC）
改组件让已通过的画面退步；`Segmented` 默认改成行内导致撑满画面退步；触控区不足 44 或相邻两段命中区重叠；`Toast` 去 ✕ 后出错 Toast 无法关闭；失焦自动关误关正在输入的弹层；可配置 TabBar 影响主底栏；`[contrast]` 被滥用；展示页重排后旧的展示页测试失效；`AppScreen` 间距修正连带改变所有屏。

## 契约（本 Sprint 定稿，REPORT 交接）

### 1. 逐件对照（两端 CLI 都在本 Sprint 接好）
- **设计侧规格格选择器**：`#<sec2 id>` 之后第 n 个 `.cell`（`comp` 取 `.comp > div:first-child` 演示区，不截 `.doccard`），再按主题取 `.stage[data-theme=light|dark]`；`mini()` 缩放格不比，或先按 1/s 还原再比（REPORT 写明采用哪种）。新组件（UnderlineTabs、可配置 TabBar、全屏搜索页）在 01-system 没有规格格，以 b2 的对应画板区域为准（`.utabs` b2-events-flow.html:51-55 所在的 #17–#19，会場底栏 #27–#35，开工时用 `--list` 确认序号）。
- **实现侧**：App 展示页按规格格重排，每个规格格一个小节路由 `/showcase/components/<小节 id>?theme=light|dark`；小节固定画在安全区下方、整数坐标、固定宽度；清单里写 `rect`，工具按 `rect` 裁剪（给 `compare-redesign-app.mjs` 加 `--region`）。跳转用开发开关 `open-path`，不走 `simctl openurl`。
- **共享**：套件解析、规格格裁剪、`[contrast]` 判定都放进 `redesign-pixel-lib.mjs`；`compare-redesign-app.mjs` 与 `compare-redesign.mjs` 在本 Sprint 都接好，Web 侧至少用一个小节冒烟通过（R31b 直接用）。
- 清单：`views/app-R31a-components.json`（每项：设计稿文件、小节 id、格序号、主题、实现路由、`rect`）。
- **判定**：App 小节按决定表 §20 判（所有超阈值带都归因为 `[data]` / `[raster]` / `[contrast]` 即通过，raw 只作参考）；Web 小节按 RD-29（同一标准）。

### 2. `[contrast]` 归因（RD-26）
- 允许的替换写在 `repos/orbits/scripts/visual/contrast-substitutions.json`，每条写明「设计稿颜色 token → 实现颜色 token」及其在 `tokens.json` `color.contrast` 里对应的那一项；加测试保证两份清单一致（新增替换对必须先进 `color.contrast`）。
- **判定算法**（实现于 `redesign-pixel-lib.mjs`）：按主题从 `tokens.json` 取替换对两边的颜色值；对标 `[contrast]` 的带里每个差异像素，判断「设计像素 ≈ 原色与底色按某个 α 混合」且「实现像素 ≈ 加深色与同一底色按同一 α 混合」（ΔE 容差、α 步长写成常量）；**解释不了的差异像素超过带内差异像素的 5%** 即判该带不通过（阈值写成常量，REPORT 写实测分布）。
- 工具测试：清单内替换通过；把一个非清单颜色差异标成 `[contrast]` 判失败；同一带内混有真实缺陷时判失败。

### 3. 组件修正（App）
- **`Segmented`**：默认仍撑满，选项高 30；字号、内边距、选中阴影按 `.seg` 逐项对齐（以逐件对照为准）；**只加 `inline` 参数**对应 kit 行内 `.seg`（R15 下書き sheet 等改用它）；命中区只纵向外扩 `hitSlop={{ top: 7, bottom: 7 }}`，横向不扩。`.tseg` 不受影响。
- **`Toast`**：去掉 ✕（出错 Toast 点按关闭）；点按先关闭再执行回调；`ToastProvider` 之外新增按页声明「本页自带底栏」（会場页用），位置按 kit `.toast.pos`（bottom 100）/ `.notab`（40）。
- **`BottomSheet` / `ActionSheet`**：页面失焦（离开页面、切后台）自动关闭，但**正在输入（键盘弹出）时不关**；确认用的 sheet 可设不可拖关；新增 `dismissOnBackdrop={false}`（遮罩点击不关，返回键与 VoiceOver 退出照常）；补 `BottomSheet` 深色变体（b12 #428）。
- **`ConfirmDialog`**：加图标位（kit 48 / 圆角 16 图标块），支持 `.dic.emo` 变体（杏色底、24px emoji）。
- **`Popover`（新建）**：A-R24 / A-R25 的弹出层由新建 `Popover` 承担（kit 规格 340–440、圆角 22、无遮罩），开工时核对这些画面用的是哪种弹出层，REPORT 写明。
- `FilterOption` 上下内边距 7；`Toggle` 44×26；`MacTile` emoji 21 / 17、圆角 13；`Avatar` lg 字号 19；`Icon` 加 12 / 13 号。
- **`AppScreen` 内容区间距**：对齐 kit `.scroll`（上 −12、左右各 +2），`showBack=false` 时的头部按 kit；修正后删掉加人各页的 `KIT_PAGE_INSET` 抵消写法（调用点改参数，见 §5）。
- 逐件对照发现的其他差异：全部修正，或写明保留理由请产品负责人拍板（设计稿有的不许自己省略，RD-16）。

### 4. 新组件（App）
- `UnderlineTabs`、`TabBar`（可配置项目与样式，含会場玻璃底栏变体；`OrbitTabBar` 可以基于它，外观与行为不变）、`FullScreenSearch`（安全区 + 背景 + 搜索行 + chip 行 + 结果区）。
- 替换 `DiscoverPage.tsx`、`EventDetailPage.tsx`、`VenuePage.tsx`、`GlobalSearchScreen.tsx` 的手写件；删 `legacy-ui-deferred.json` 对应 3 行（清空后保留空 `files`）。
- 新组件进展示页和逐件对照套件（比对对象见 §1）。

### 5. 调用点、中途状态与重比（RD-28、RD-30）
- **调用点改用本 Sprint 新增的参数（尺寸档、图标位、`inline`、`dismissOnBackdrop`、按页底栏声明等），不算页面结构改动，在本 Sprint 内完成**（包括甲名下的页面，事先在交接表写一句通知甲）；只有要改页面 DOM / 布局的，才写进「交还」。
- **中途状态**（弹层展开、Toast 出现、确认框打开等）：给每个状态加只在开发包生效的状态开关（`design=` 参数或 `open-path` 参数，做法同 R12 的 `design=n08b`、R15 的 `?design=done`），写进 views 条目的 `url` / `shot`；正式构建里不存在（测试守住）。
- **重比**：开工第 1 步从各 Sprint REPORT 和一次全量门禁生成 `scripts/visual/pass-baseline-app.json`（已通过画面清单）和本 Sprint 的重比清单（上表所列画面的 id → suite）；组件修好后重跑重比清单，通过的在 DEFERRED-A §1 / §3 / §4 与交接表改 done（写提交号）；页面自身原因的写进 REPORT「交还」并追加到交接表对应 Sprint 节。

### 6. 不退步
- 每改一个组件：跑 `views/app-R05.json`（壳门禁）和组件套件。
- 收口：重跑 `pass-baseline-app.json` 里的全部画面，全部仍通过；退步的修到不退步。

## 像素 SC 与预检（HOW-TO §8 / 规则 11 的适用方式）
- **重比画面**：每个画面的设计稿文件 + 画板、宽度、主题、到达步骤，以原 Sprint 的 `views/app-*.json` 条目为准（重比清单列出 id → suite）；画板预检已在原 Sprint 做过，不重做。
- **组件小节**：「画板」就是 01-system 的规格格（新组件为 b2 画板区域），`views/app-R31a-components.json` 每项写明文件、小节 id、格序号、主题；预检第 3 项（token 缺口）对每个小节跑 `--style-diff` 或 `--extract-board` 列出近似值，结果贴进本目录 `preflight-checklist.md`，缺的 token 先补（RD-30 下由乙改 `tokens.json`）。

## 范围与文件

- 修改：`src/components/ui/**`、`src/screens/showcase/ComponentShowcaseScreen.tsx`、`app/showcase/**`、`AppScreen.tsx`、手写件所在 4 个屏幕、用到新参数的调用点（含加人各页、`InviteConnectionSheets.tsx`、`InviteSenderScreen.tsx`）、`tests/fixtures/legacy-ui-deferred.json`；`repos/orbits/scripts/visual/{compare-redesign-app.mjs,compare-redesign.mjs,redesign-pixel-lib.mjs,README-redesign.md}`；新增 `views/app-R31a-components.json`、`contrast-substitutions.json`、`pass-baseline-app.json`、`attribution-redesign-R31a-app.json`；`shared/design/tokens.json`（只在补 token / `color.contrast` 时）；DEFERRED-A、交接表。
- 测试：受影响的组件渲染测试与展示页测试（含旧展示页测试的迁移）；工具测试（套件解析、`rect` 裁剪、`[contrast]` 三种情况）；开发状态开关不进正式构建；`legacy-ui-ratchet` 条数保持通过。
- **不做**：Web 组件（R31b）；要改页面 DOM / 布局的事（交还）；新的业务组件。

## 验收契约

| SC | 操作链 | 主证据 |
| --- | --- | --- |
| SC-R31a-01 逐件对照工具（里程碑） | 展示页按规格格重排、每小节一个路由；App `--suite views/app-R31a-components.json` 整体或 `--only` 可跑；Web 侧一个小节冒烟通过；旧展示页测试已迁移 | 工具测试 + 运行输出 |
| SC-R31a-02 `[contrast]`（里程碑） | 清单内通过；非清单颜色标 `[contrast]` 失败；混有真实缺陷的带失败；`contrast-substitutions.json` 与 `color.contrast` 一致 | 工具测试 |
| SC-R31a-03 组件全部对齐 | 组件套件浅 / 深全部通过（§20 标准） | 门禁总表（小节 × 主题：raw、带数、归因路径） |
| SC-R31a-04 组件行为 | `Toast` 点按先关后回调、无 ✕、出错可点关、按页底栏声明生效；sheet 失焦自动关但输入时不关、确认 sheet 不可拖关、`dismissOnBackdrop={false}` 时返回键和 VoiceOver 仍可退出；`Segmented` 纵向命中区 ≥44、相邻不重叠 | 渲染测试 + 模拟器操作记录 |
| SC-R31a-05 新组件与替换 | 三个新组件进展示页并过对照；4 处手写件已替换；`legacy-ui-deferred.json` 清空 | 门禁 + `legacy-ui-ratchet` |
| SC-R31a-06 调用点与交接 | 新参数的调用点已改（含 `KIT_PAGE_INSET`、`ignoreDismiss`、`useFocusEffect` 临时写法已删）；交接条目逐条有结果 | diff + REPORT 条目表 |
| SC-R31a-07 待组件库画面重比 | 重比清单全部重跑；通过的已改 done；未过的有原因与去向；开发状态开关在正式包不可启用（`__DEV__` 门禁；不宣称 bundle 中无此代码） | 门禁总表 + 交还清单 + 测试 |
| SC-R31a-08 不退步 | 每次组件改动后 R05 壳门禁通过；收口时 `pass-baseline-app.json` 全部仍通过 | 收口全量门禁输出 |
| SC-R31a-09 测试与复核 | 两端全量对照基线零新增失败；`tsc` 通过；`detect-changes` 写进 REPORT；独立复核**自己重跑门禁** | 全量清单、REVIEW |

## 执行顺序

1. 记基线、刷新 GitNexus 索引、跑 impact；生成 `pass-baseline-app.json` 与重比清单。
2. **工具里程碑**：`redesign-pixel-lib.mjs` 的套件 / 裁剪 / `[contrast]`，两端 CLI 接好，展示页按规格格重排（测试先行）→ 合入并通知 R31b 可开工。
3. 第一次逐件对照，得到完整差异清单与 token 缺口（`preflight-checklist.md`）。
4. 按影响面修：`Segmented` → Sheet / Dialog / `Popover` / `ConfirmDialog` → `Toast` → `AppScreen` 间距 → `FilterOption` / `Toggle` / `MacTile` / `Avatar` / `Icon` → 其余；每改一件跑组件套件 + R05 壳门禁。
5. 新组件 + 替换手写件 + 删白名单行；调用点改参数；中途状态开关。
6. 重比，更新 DEFERRED-A / 交接表。
7. 不退步全量门禁、两端全量测试、REPORT、独立复核。

## 失败与交接

规格格自身矛盾或需要产品取舍：请产品负责人拍板，记进决定表新一节，该件暂缓，不阻塞其他件。REPORT 交接：工具用法（R31b 与以后改组件都要用）、`[contrast]` 清单与算法常量、新组件和新参数用法、开发状态开关清单、交还清单、DEFERRED-A 更新情况。
