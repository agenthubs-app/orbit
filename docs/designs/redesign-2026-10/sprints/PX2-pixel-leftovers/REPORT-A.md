# PX2 A 批：共享组件与 token 交接

执行基线：`origin/redesign` = `7cba90d6a628a21da02f92639d9e9612a4f795bf`；A 组件/token/测试版本 `f18a6dc9f`。仅在 `redesign-a` worktree 修改 A 自有组件、共享 token、定向测试及本报告；未改 B/C/D/E 页面、画板或 fixture。证据根：`/Volumes/ORICO/Dev/worktrees/orbit/_evidence-a2/PX2/`（各 `run-*` 独立保存；未标 `run-*` 的 `compare/`、`logs/`、`preflight/` 路径都在 `run-01/` 下）。本批没有连 Neon／生产、部署或 push。

## A1 · 文字／颜色 token

| 证据与测量 | 改动 | 受影响键与交接 |
| --- | --- | --- |
| `compare/web-title-p04/` 的 `W-R18c-P04-original-1440-light` 新三联图有效：raw `0.0072`、超阈 `1` 带且未归因、缺块提示 `2`。`style-diff.json` 测得画板标题 `28px / 42px`，页面 `24px / 36px`，标题宽 `336px / 288px`，x `552 / 576`。 | 在 token 单一来源增加 `font.size.title-lg = 28`，生成 Web `--fs-title-lg` 和 App `designFont.size.titleLg`；不改全局现有 `title=24`。 | C：`W-R18c-P04-*` 标题页需接新 token 并重拍三宽浅深；`W/A-R18c-P05-*` 的账户行与标题仍由 C 核对。当前 P04 FAIL，token 存在不代表页面已对齐。 |
| `preflight/widgets.{json,md}`：`widgets.html` 六板合计 `19 near / 70 missing / 2 dark crossover`。重复出现的 `54` 圆角、`30/60/15` 间距、系统 dock 图标、玻璃叠色和大字号均来自画板局部系统外壳；暗色 crossover 是浅色 dock 图标使用 `rgba(255,255,255,.7)`。 | 依据 PX2 §8 D15 的“画板对齐真实产品”决定，未把这些局部系统值写入全局产品 token，也未改全局 ink/glass。 | D：`R19` 局部 renderer 与 `R10/R32 A-R05-02` 暗色壳待画板/页面对齐后重比。R19 WidgetKit 实屏仍为 X 门禁，不算通过。 |
| `run-04/compare/app-r05-dark-bar/` 的 `A-R05-S03-app-dark` 以 `app.html` #8 的底栏裁区 `14,756,362,62` 重比：raw `0.0164`、1 未归因带、0 缺块；y0–30 背景设计 `#2c2c34`、原生 `#2c242c`（ΔE4.8），字/图形主色同为 `#84848c`。整屏 `A-R05-02-app-dark` raw `0.0849`、22 未归因、11 缺块，受 286 对 80 人样本污染，不作底栏结论。 | 共享暗色 `glass=rgba(44,42,50,.62)` 与 kit 相同；原生 `GlassSurface` 的 BlurView + tint 混色、D 壳的底层内容和图标栅格共同决定成像，故未凭单一采样改全局 `glass`。 | D：按该裁区三联图调 `OrbitTabBar`/壳的局部叠色与图标；复测 `A-R05-S03-app-dark` 和 R10/R32 暗色壳键，不能把整屏数据差归因成 token。 |

## A2 · 行与弹层

| 组件 | 前 → 后，测量／验证 | 页面键与责任 |
| --- | --- | --- |
| Web `Modal` | 宽档原有 420、480、560；增加可选 `520px`，浏览器定向测试量到 520，原 420 等宽度不变。 | R32 `W-R23-06` 页面现用独立 `FlowDialog(width=520)`，共享 `Modal` 新档尚未被该页消费。`run-01/compare/web-w05/` 因目标 intake 404 无效；切换本线计划 mock 与 `b12-140-add-member` fixture 后，`run-02/compare/web-w05-mock/` 浅深有效但均 FAIL：raw `0.0175/0.0157`、各 2 未归因带，浅色缺块提示 1。局部图中候选人的副文案与弹层纵向位置不同。 |
| App `PopoverRow` | 原无禁用 API；现 `disabled` 同步禁用点击、`aria-disabled` 与灰色标题。定向 HTML 测试验证两项语义及禁用属性。 | R32 计划页 `A-R25-11` 目标切换菜单须用禁用行。`run-04/compare/app-p12-valid/` 同态浅深均有效但 FAIL：raw `0.0999/0.0874`、各 19 未归因带、缺块 `10/9`。面板圆角24、padding8、行 padding10 与 b4 `.gmenu` 一致；页面图标尺寸/行内容、背景数据仍异。早期 `run-01/02` 计划服务错误态、`run-03` 登录页图像均单列无效。 |
| App `InlineChip` | 新增可嵌在 `UiText` 内随长文本换行的 chip；原块级 `Chip` 保留。定向测试确认文字后是内联 `span`。 | `run-04/compare/app-p13-valid/` 的 `A-R24-05` 同态浅深有效但 FAIL：raw `0.1049/0.0965`、未归因 `21/18`、缺块各 `7`。前提「チーム」行中的「推測」在实现另起一行，使行高和后续内容错位；页面须接新 API。 |
| Web `Drawer` / App `FullDrawer` | 均增加可选左开；Web kit 的 1440 宽 `sm` 变体实测左 x=`14`、右 x=`1046`，同为宽 `380`；App 左 `x=0`、宽 `318`，右开默认不变，左右圆角与入场方向对应。 | E：App `A-R21-04/14` 可接 `FullDrawer side="left"`。Web R21 目前使用 E 自有 `IOrbitHistoryDrawer`（`ir-drawer-scrim` 仍 `justify-content:flex-end`），并未使用共享 `Drawer`；b8 #11 是聊天容器内宽272的左面板，#12 是视口左缘宽318的抽屉，不能把通用 Web x14/380 测试当作 R21 已修。`compare/app-r21-left-handoff/` 的 `A-R21-04` 新三联图有效但页面尚在右侧，raw `0.4139`、未归因 `28`、缺块 `16`；设计左 x=0／宽318，当前实现右 x≈72／宽318。R11a `W-R11-06/06d/06-390/11`、`A-R11-04/06/10/12` 及 R11b 行/环由 E 复核默认路径。 |
| `ListRow` / `BottomSheet` | 核对 kit `.list > .li` 的 `padding:11px 0`、标题 `14/700` 与 App 现有行 `minHeight:56`、纵向 padding11；R04 已规定常规字号一行、放大字号最多三行，本批无可归因的共享尺寸差，未做高风险全局改动。App sheet 上限保持 80%。 | C/E 检查 `R18c P05`、`R11a/b` 长文案行的具体板；D 按 PX2 §8 D12 把 `R32 P15` 画板约 87% 高压到 80%，不得把旧板差算共享组件通过。 |

## A3 · 语义与防退步

App `Toggle` 的 RN Web `aria-checked` 与原 `accessibilityState.checked` 同值；`CategoryTabs` 的 `aria-selected` 与当前高亮状态同值。`PopoverRow` 禁用态也同时给出原生状态与 Web 属性。受影响的通知／受信箱／设置定向测试列于下方；B 的 R13 行/Tab 与 C 的 R18a 设置页面仍需各自视觉门禁。

### 给 B/C/D/E 的接入键

| 页面线 | A API/测量交接 | 需重比的键 |
| --- | --- | --- |
| B | `CategoryTabs` 选中语义与视觉态、`ListRow` 默认行高；通知/受信箱定向测试只证明行为。 | `A-R13-01/02/04/05/07/08-app-light`；`W-R13-01/02/04-1440-light`、`W-R13-04d-1440-dark`。 |
| C | `--fs-title-lg:28px` 与 App `titleLg:28`；P04 h1 现仍 24/36，账户行未被 A 改。 | `W/A-R18c-P04/P05-*`，含 Web 1440/1024/390 浅深、App 浅深；设置页 `A-R18a-08-app-light`、`W-R18a-P08-1440-light/dark` 与 `W-R18a-P15-1024-light/dark`。 |
| D | R19 局部 token/玻璃值须按 D15 核对画板；底栏暗色已测得原生 blur 混色 ΔE4.8，需在壳局部复核。 | `R19` 六 family × 浅深局部诊断键及 X 实屏门禁；`A-R05-S03-app-dark` 裁区、`A-R05-02-app-light/dark` 整屏、R10 首页/壳暗色键。 |
| E | App 可接 `FullDrawer side="left"`，Web 现有 `IOrbitHistoryDrawer` 需按 b8 #11/#12 自行对齐左侧容器和窄屏尺寸；共享 Web `Drawer side="left"` 是可选 kit 能力，当前 R21 页面尚未消费。现有 R11a 抽屉/行页面须用同态 286 actor 重拍。 | `W-R21-R03-1024-light/R04-390-light`、`A-R21-04-app-light/14-app-dark`；R11a `W-R11-06` 三宽浅深、`W-R11-08/09/09u/10`、`A-R11-04/05/06/06d/08/09/10`；R11b `A-R11b-01/02/05/06-app-light`。 |

R32 计划页 `A-R24-05`、`A-R25-11`、`W-R23-06` 在 PX2 账本记为 A 直接命中键，但实际消费点位于计划页目录，超出本批组件/token 的写入边界；新 API 已就绪，页面接入及无效截图见下文⑫。

Bridge 交接：Web 与 App 使用同一 `tokens.json` 来源，生成的 Web CSS、共享 TS 和 App 镜像已同步；本次没有改 API、持久化契约或跨端状态同步。另一端影响是 Web 可选 520 Modal/左 Drawer 与 App 可选左 FullDrawer/禁用菜单行/内联 chip，以及两端可用的 28px 标题 token。页面消费点、未完成像素门禁和验证范围见上表与⑫；不能凭类型检查标记业务/视觉对齐完成。由 Bridge 协调者按 `bridge/templates/handoff.md` 更新根台账。

先前自动 PASS 的 R31a App 组件格共 43 张；本批取 `c-confirm-0`、`c-ai-3`、`c-why-0`、`c-chip-0`、`c-text-2` 的浅深各一张，`compare/app-pass-sample/summary.json` **10/10 自动 PASS、0 未归因、0 缺块**，覆盖 `10/43 = 23.3%`。`c-ctl-0` 深色另为自动 PASS；浅色仍是 R31a 已记录的 §52-2 对比替代算法人工例外（此次 raw `0.0694`、6 超带、2 未归因、1 缺块），未把它计为清洁 PASS。

R31b Web 组件格先前 58 张自动 PASS；本批取 toast、confirm、layer、chip、text、why 六格的浅深共 12 张，`compare/web-pass-sample/summary.json` **12/12 自动 PASS、0 未归因**。`W-R31b-c-confirm-2-1440-light` 的唯一缺块提示是左上角 `x0–24/y0–24` 的圆角背景；三联图中标题、正文与按钮均完整，已人工核对，保留原始告警。合并两个受影响组件基线为 `22 / (43+58) = 21.8%`，覆盖浅深、弹层和有缺块告警的键；Web 抽样均 1440，窄宽由页面线在各自 suite 补测。

## 验证记录

| 门禁 | 结果与证据 |
| --- | --- |
| App `npm run typecheck` / Web `npm run typecheck` / Web `npm run typecheck:app` | 均退出 `0`；`logs/app-typecheck.log`、`logs/web-typecheck.log`、`logs/web-typecheck-app.log`。 |
| App 组件、token、通知、受信箱、设置定向测试 | `55/55`，退出 `0`；`logs/app-focused.log`。 |
| Web Modal/Drawer 定向测试 | `12/12`，退出 `0`；`logs/web-focused.log`。 |
| Web 全量一次 | `7,979` 测试、`6,934` pass、`5` fail、`1,040` skip，退出 `1`；`logs/web-full.log`。五个失败名与 `_evidence-main/r28d-web-full.log` 完全相同，**新增 0**；基线为 `7,978 / 6,933 / 5 / 1,040`。失败仍是 `manifest generation writes the required repository artifacts`、`merging fills empty fields…`、`only the dev route imports the design fixtures`、两个 R12 `add-scan-flow` 测试。全量不能称 PASS。 |
| App 全量一次 | `3,328` 测试、`3,324` pass、`2` fail、`2` skip，退出 `1`；`logs/app-full.log`。两个失败名是 `the original split key set retains its current approved copy snapshot` 与 `S1 これまでのコード…統合する merges…`，均在 `_evidence-main/r28d-app-full.log` 中，**新增 0**；基线为 `3,324 / 3,318 / 4 / 2`。全量不能称 PASS。 |

视觉脚本的 `A-R24-05` 浅深图、逐带 JSON 和 `summary.json` 已全部写出，随后 Node 进程约 60 秒无输出且未退出；终止后外层退出 `130`。本报告只引用已写出的有效截图和 FAIL 数值，不将该退出码当作成功门禁。`run-01/02` 的计划服务错误态、`run-03` 的原生登录页为无效帧，均保留；`run-04` 在本线 mock fixture + QA 登录后才进入有效目标态。

定向测试采用先红后绿：`run-01/logs/web-modal-red.log`、`web-drawer-red.log`、`app-components-red.log`、`app-inline-red.log`、`app-token-red.log`、`app-drawer-red.log` 保存新增断言失败；修复后的覆盖在 `web-focused.log` 与 `app-focused.log`。所有共享改动是可选 API 或显式语义属性，现有默认视觉由上文 22 张此前 PASS 格抽查验证。

## ⑫ 已知像素差与无效证据

| 键 | 画板／主题／原图 | 最新数值与具体差异 | 后续责任 |
| --- | --- | --- | --- |
| `W-R18c-P04-original-1440-light` | `b7-account-misc.html` 原批准板；`compare/web-title-p04/…/{design,app,diff,triptych}.png` | raw `0.0072`、1 未归因带、2 缺块提示；h1 字号和行高 28/42 对 24/36，容器位置/宽度也不同。仅 A token 新增；页面尚未接。 | C 接 token、改页面，复测批准草案 P04/P05 的三宽浅深。 |
| `A-R21-04-app-light` | `b4-plan-iorbit.html` #38 目标左抽屉；`run-01/compare/app-r21-left-handoff/…/{design,app,diff,triptych}.png` | raw `0.4139`、28 未归因带、16 缺块；页面仍从右开，文字/数据亦异。 | E 接 App 左开 API、固定 actor 内容，复测 04/14；Web 独立历史抽屉按 b8 #11/#12 调整。 |
| `A-R25-11-app-light/dark` | `b4-plan-iorbit.html` #28；`run-04/compare/app-p12-valid/…/{design,app,diff,triptych}.png`，计划 mock fixture `c-goals-b4-menu` | 有效 FAIL：raw `0.0999/0.0874`、各 19 未归因带、缺块 `10/9`；菜单底部比画板约早 16 点，前景行与背景内容仍有差。首次错误态/登录页截图另计无效。 | R32 计划页接禁用态与同态内容；面板/行基础样式已按 b4 `.gmenu` 复核，勿把页面行内容差记为 shared PASS。 |
| `A-R24-05-app-light/dark` | `b12-missing-states.html` #198；`run-04/compare/app-p13-valid/…/{design,app,diff,triptych}.png`，计划 mock fixture `b12-206-premise` | 有效 FAIL：raw `0.1049/0.0965`、未归因 `21/18`、缺块 `7/7`；「推測」chip 在实现另起行，之后的文字/行高位置被推下。 | R32 计划页接 `InlineChip` 并核对 sheet 行数据；80% 上限未改。 |
| `A-R05-S03-app-dark` | `app.html` #8 底栏裁区；`run-04/compare/app-r05-dark-bar/…/{design,app,diff,triptych}.png` | 有效 FAIL：raw `0.0164`、1 未归因带、0 缺块；y0–30 玻璃背景 `#2c2c34` 对 `#2c242c`，ΔE4.8。 | D 核对壳局部 blur/tint/底层；token 定义已与 kit 相同，不能直接改全局玻璃色。 |
| `W-R11-06-1440-light` | `web.html` #7；`run-04/compare/web-r11a-drawer/…/triptych.png` | 代表页新截图截到“連絡先を読み込めませんでした”，未达到详情抽屉目标态；脚本 `[data-network-contact-ready]` 等待超时，原始 raw `0.0480`、24 未归因、62 缺块仅作无效帧诊断，不入像素分母。当前 QA 世界 80 人，suite 要 `many286` 与 `design-person-001`。 | E 固定 286 同态 actor/联系人后复测 R11a 抽屉、编辑与返回链。 |
| `W-R23-06-1440-light/dark` | `b12-missing-states.html` #140；`run-02/compare/web-w05-mock/…/{design,app,diff,triptych}.png`，计划 mock fixture `b12-140-add-member` | 有效 FAIL：raw `0.0175/0.0157`，各 2 未归因带；浅色缺块提示 `x840–864/y480–504`。弹层本身已是 520 宽，候选人副文案/纵向位置与板不同。`run-01` 的 404 超时独立记无效。 | R32 计划页核对固定候选人与弹层布局，再按原键浅深重拍；共享 `Modal` 新 520 档不会自动改变独立 `FlowDialog`。 |
| `R19` 六张局部 Widget 板与 WidgetKit 实屏 | `preflight/widgets.{json,md}` | 19 near／70 missing／2 暗色串色为局部系统壳/画板值；无新有效实屏截图。 | D 按 D15 改板和局部 renderer；正式 WidgetKit 仍待 X 门禁授权。 |

本批没有把无效截图、未接入 API、画板待改或历史人工例外记作像素 PASS。页面线接入后以本报告的组件版本和原始图作为前后对照，按 PX2 §5 重跑同态 triptych。
