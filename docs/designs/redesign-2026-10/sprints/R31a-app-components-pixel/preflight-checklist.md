# R31a 预检清单：App 组件 ↔ kit 数值（第一次逐件对照，2026-10-18）

PLANNER「像素 SC 与预检」第 3 项（token 缺口 / 近似值）。规格格没有 DOM 可做 `--style-diff`（App 侧是模拟器截图），所以按「照源码搬」做：kit `ui.css` / 01-system 文档样式逐项对 App 组件源码，差异直接改成 kit 数值；缺的 token 先补。逐件对照的像素结果见 REPORT「门禁总表」。

## token / 图标源缺口（已补）

| 缺口 | kit 出处 | 处理 |
| --- | --- | --- |
| 开关圆钮阴影 `0 1px 3px color-mix(ink 25%)` | `.tgl::after` ui.css:405 | `tokens.json` `shadow.knob`（浅 `rgba(30,26,36,.25)` / 深 `rgba(243,240,246,.25)`），App `designShadow.knob`，Web `--shadow-knob` 随生成多一个变量 |
| 图标 12 / 13 / 15 号 | `.chip svg` 12、`.ckr` / `.cbx svg` 13、`.toast .tk` / `.okmark svg` 15 | `scripts/design-tokens/generate.mjs` `ICON_SPEC.sizes` 加 12 / 13 / 15（两端 `designIconSpec.sizes`） |
| 小图标粗描边 2.4 / 2.2 | `.ckr svg`、`.toast .tk svg` | App `Icon` 加 `strokeWidth` 参数（不进 token：只有这两处） |
| Toast 状态圆 / 撤销钮的混色 | `.toast.info .tk` `color-mix(bg 22%)`、`.undo` `color-mix(bg 16%)` | `toast-model.mixHex` 按主题从 token 现算（不新增 token） |

## 组件逐项（kit → App 改后）

| 组件 | kit 数值 | 改前 App | 改后 |
| --- | --- | --- | --- |
| Segmented `.seg` | 外 3 / gap 2；按钮 6 / 13、12 / 600、行高 1.5 → 30 高；选中 surface + `0 1px 2px`，字重不变 | 38 高、12.5、选中 700、无阴影、hitSlop 4 | 30 高、12 / 600、选中阴影、`inline` 参数、命中区只纵向 7 |
| FilterOption `.fopt` | 7 / 12、12.5 / 700、1.5 透明边；on：plum-500 边 + accent-soft + plum-700「✓」900 | minHeight 36、✓ 用 16 号图标 | 7 / 12、✓ 字形（accent-text，ΔRGB ≤ 3，保 4.5:1） |
| CategoryTabs `.cat` | 7 / 12、无边框、gap 5 | 带 1.5 透明边（宽高各多 3） | 无边框；命中区 6 上下 / 3 左右 |
| Toggle `.tgl` | 44×26、圆钮 20 + 阴影 | 无阴影 | `shadow.knob` |
| CheckCircle / Checkbox / Radio | 勾 13 号 2.4 描边；单选内点 inset 3 → 8.4 | 勾 16 号 1.7；内点 9 | 13 / 2.4；8.4（完成勾保持 ok 绿：RD-17 / RD-33，01-system ⑮ 已改稿） |
| Chip `.chip` | 3 / 9、11 / 700、行高 1.5 → 22.5 高 | 无行高（约 19 高） | 行高 16.5 |
| Button `.btn` | 40 高；sm 32；动作表 `.actsheet .btn` 46 | md 44 | md 40（hitSlop 2 保 44）、新增 lg 46 |
| ConfirmDialog `.dialog` | 296、22 / 18 / 16、r28、`.dic` 48 / r16、`.dic.emo` 杏色 24px emoji、`.dt` 16 / 800 / 1.4、`--shadow-float` | 无阴影、无 emoji 图标位、标题行高 22 | 阴影、`icon` 参数（含 `{ emoji }`）、`cancelVariant`、行高 22.4；焦点环 App 不画（RD-33） |
| ActionSheet `.actsheet` | 画板标题头：emo 40 + 左对齐 15（b4 16）/ 1.4 + `.lbl`；`.eff` 12.5 ink-2；按钮 46 | 居中 16 / 800 标题、效果图标 ink-3-text、按钮 44 | `emoji` / `subtitle` / `titleSize` 标题头；效果图标 ink-2；按钮 46；破坏性不因遮罩 / 拖拽关闭 |
| Toast `.toast` | 9 / 9 / 12、r999、13 / 700 / 1.3、`.tk` 26、副行 11 / 600 / .68；无 ✕；深色 = surface-3 胶囊（RD-17，01-system ① 已改稿） | 有 ✕、副行不透明、状态圆 16 号图标、信息圆 ink-3 | 去 ✕、点按关、先关后回调、副行 .68、15 号 2.2 图标、kit 混色、`icon` / action `icon` / `stay`、`usePageBottomBar()` |
| BottomSheet `.sheet` | 左右底 8、r34、抓手 38×5 | — | 失焦自动关（输入时不关）、`dismissOnBackdrop` / `draggable` |
| Popover（App `.gmenu`，b4 #28） | r24、padding 8、`--shadow-float`、遮罩；行 `.gi` gap 10 / padding 10 / r16，选中 surface-2，13.5 / 700 + `.lbl` | 无 | 新建 `Popover` / `PopoverRow` / `PopoverDivider` |
| UnderlineTabs（b2 `.utabs`） | gap 20、margin 14 0 12、9 0、13 / 700 / 1.5、ink-3 → ink、下划线 2.5 r2 | EventDetailPage 手写 | 新建并替换 |
| TabBar（`.tabbar` / `.livebar`） | 62 高玻璃胶囊、padding 6、gap 2、21 号图标 + 10 / 700；livebar right 16 | VenuePage 手写 | 新建（`variant="live"`）并替换 |
| FullScreenSearch | b5 `.sbar`（gap 10、取消 40）/ b2 探す（gap 8、聚焦 2px plum-300、取消 32） | DiscoverPage RN `<Modal>`、GlobalSearchScreen 手写 | 新建（`kind` / `overlay`）并替换 |
| AppScreen 内容区（kit `.scroll`） | 顶部紧贴顶栏、左右 18 | 上 12、左右 16（加人 / 计划 / 评估页各自抵消） | `inset="kit"` opt-in（RD-33）；加人各页改用并删 `KIT_PAGE_INSET` |
| MacTile / Avatar | `.emo` 40 / r13 / 21、sm 32 / r10 / 17；`.av.lg` 19 | 已一致 | 不变 |

## 规格格本身的问题（不改组件，记录处理）

- c-confirm-0 / c-sample-1：`.scrimbox` 内容宽 < 对话框 296，网格居中溢出时对话框贴左（x = 18 而不是居中的 13）→ 清单 region 按格内实际位置取（16e 上 x 29）。
- c-confirm-1：文档示意 `.asheet` 固定 360 宽、外框 380，真机动作表 = 屏宽 − 16 → 不进逐件对照，ActionSheet 走真实画板（b4 #19 / b12）。
- c-layer-0 / 1：`frame(290, 470)` 示意比例小画框 → 不进逐件对照，BottomSheet / FilterOption 走 b2 絞り込み（A-R27-09）。
- 规格格里的说明文字（`.lbl` 中文注释、`<code>`）：01-system `<html lang="zh">`，CDP 核实汉字仍走 Hiragino、`<code>` 走 Courier → 展示页按同字体画（`code` 用 Courier）。
