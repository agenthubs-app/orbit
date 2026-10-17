# Sprint R31b — Web 组件库像素轮

**Plan revision:** 2（2026-10-18 按独立复核与用户拍板 RD-27～RD-30 修订）。**模式:** existing-codebase / single-generator（负责：乙）。
**单一目标:** 用 R31a 的逐件对照工具和 `[contrast]` 归因，Web 组件修正与补件、调用点改用新参数、替换 Web 手写件、处理全局 `.btn` 漏入、Web「待组件库」画面重比、不退步。
**易读目标:** [GOAL.md](GOAL.md)。
**基线:** R31a 工具里程碑合入后的 `redesign` HEAD，按符号重新定位行号。
**进入条件:** R31a **工具里程碑**完成（SC-R31a-01、02：逐件对照工具两端已接好并有 Web 冒烟、`contrast-substitutions.json` 与一致性测试、README 规则 11 修订已合入）。**不必等 R31a 全部完成**，两者并行（RD-30）。RD-16（2026-10-11 修订）、RD-17、RD-18、RD-26～RD-30 已定。
**提交方式:** 一人做，直接在 `redesign` 上按路径提交（RD-25、通用规则 12）。与 R31a 并行时只碰 Web 文件；`repos/orbits/scripts/visual/**` 在工具里程碑后冻结，只修 bug，改动先在两条线的交接里写一句。

## 交接条目（逐条写进 SC，REPORT 逐条写处理结果）

| DEFERRED-A §1 / 交接表 # | 内容（Web 部分） |
| --- | --- |
| G23 | Web `Modal` 加 380 档（D42）；`Kbd` 字色、`MacTile` 小号 emoji、非壳抽屉深色细边逐件对齐 kit（Q1） |
| G23b | `MacTile` emoji 21 / 17、圆角 13；`Chip` 杏色字（kit `-ink`，实现 `-text`）与 `Kbd` 字色（kit `ink-3`，实现 `ink-3-text`）→ 走 `[contrast]`（RD-26）；`FilterOption` 上下 7；`Modal` 的 `header`、`Button` 的 `trailing` 保留；**Button / IconButton / FilterOption / Checkbox 之外的组件的 `.btn` 漏入在本 Sprint 处理** |
| R24-05 | `Modal` 加 380 档、标题左侧图标块、`closable={false}`；`Drawer` ✕ 白色圆底、标题下副标题 → **R24 REPORT 自定 7（420 宽保留）推翻，调用点改用 380 档**（RD-28） |
| R24-05b | 重跑 `web-plan-A.json` 的 W-R24-03 / 09b / 11 / 12、`web-plan-B.json` 的 W-R23-06；过了把计划页 REWORK-REPORT-web §2 改成通过 |
| R17-17（Web 部分） | 抽屉内边距 22；**画板 b6 #20 改成 520 宽，不加 540 档**（RD-27）→ 重跑 W-R17-P26 |
| W-R26-31 | `Modal` 380 宽和关闭钮 → **R26 REPORT 自定 7 推翻**，调用点改 380 档 → 重跑 W-R26-31 |
| W-R27-13 | `FilterOption` 上下 7、`Toggle` 44×26 → 重跑 W-R27-13 |
| R16-01（Web 部分） | `Chip` 杏色字 → 补跑 W-R16-08 浅色 |
| R15 REWORK-REPORT | Web 端标「待组件库」的剩余画面 → 重跑（开工第 1 步从 R15 REWORK-REPORT 列出具体 id 写进重比清单） |
| U02 | Web 组件逐件对照 |

## 已查清的事实（按 `a7aa1e127`）

1. **组件库**：`repos/orbits/app/(app)/app/orbit-2026/ui/`：`Basics`、`Button`、`Controls`、`Disclosure`、`Fields`、`Icon`、`ListRow`、`Overlay`（Modal / Drawer / Popover 等）、`Progress`、`Scope`、`States`、`Table`、`Toast`，以及 `layer-stack.ts`、`toast-model.ts`；每个组件配 `.module.css`。
2. **展示页**：`repos/orbits/app/showcase/components/*`（只在非生产，R06 复核 m9 要求核对 staging 的 `VERCEL_ENV`）；已有 `/showcase/components/<id>?env=legacy` 可以把组件放进「旧页面 + 新壳」环境渲染——用它做 `.btn` 漏入对照。
3. **门禁工具**：`compare-redesign.mjs`（`--suite`、`--only`、`--changed`、`--style-diff`、`--crop`、`--extract-board`）；清单 `views/web-*.json`（web-R07、web-R17、web-R26、web-R27、web-R30、web-plan-A/B/C、web-add-R12、web-invite-R15、web-import-R16），归因 `attribution-redesign-*.json`。R31a 工具里程碑后支持组件套件与 `[contrast]`。
4. **Web 手写件（已核）**：主办 `HostCenter.tsx:227`、`HostConsole.tsx:263` / `:277`、`HostPeople.tsx:119`、`HostMatching.tsx:311`、`HostSetup.tsx:94`；计划 `BackgroundBlocks.tsx:358`；活动 `VenuePage.tsx:322`、`EventsScreen.tsx:185`、`detail.module.css:11`（`.utabs`）；搜索 `SearchPanel.tsx:207`。开工时按符号复核（行号会漂）。
5. **旧样式漏入**：`orbit-reference-styles.tsx` 的全局 `.btn` 等规则会作用到新组件；Button、IconButton、FilterOption、Checkbox 已用双类写回（G13），其余未处理（决定表 §17）。`orbit-2026-scope`、`orbit-2026-css-tokens` 门禁现行有效。
6. **设计规格（行号已核）**：`kit/ui.css` `.wmodal` 420 / 480 / 560、圆角 28、内边距 24、`.top` :364-371；`.drawer` 四边 14、宽 600、圆角 28 :374；`.fopt` :394-400；`.tgl` :403-410；`.kbd` :432-435；`.mac` / `.emo` :138-144。D42（Modal 380 档）；RD-17（抽屉内容多 520 / 少 380）；RD-27（b6 #20 画板改 520）。

## 上下文包

### 必读
- 上表交接条目与「通用口径」；DEFERRED-A §1；决定表 Q1、§17、§20；R31a REPORT 或工具里程碑说明（工具用法、`[contrast]` 清单与算法常量）；`README-redesign.md`；HOW-TO §8。
- `orbit-2026/ui/**`、Web 展示页源码、`orbit-reference-styles.tsx` 里会漏入的全局规则、上面列出的手写件、各门禁清单与归因文件。

### 关键符号与 impact（开工时重跑，HIGH / CRITICAL 在 REPORT 写对策）
- `Modal`、`Drawer`、`Popover`（`Overlay`）、`FilterOption`、`Toggle`、`Chip`、`Kbd`、`MacTile`：全站使用，按 HIGH 处理；新增尺寸档、图标块、副标题都**只加参数、默认值不变**；必须改默认外观的，以「不退步」重跑证明。
- `Orbit2026Shell` 与壳门禁 `views/web-R07.json`：每次组件改动后都要跑。
- 修改甲名下页面（主办、活动、计划）的手写件前：在交接表写一句通知甲（RD-30）。

### 易错边界（全部写进 SC）
加 380 档时改变了已有档位；Modal 不带 ✕ 时没有其他关闭方式（必须有取消按钮且 Esc 可关）；Drawer 副标题挤压长标题；处理 `.btn` 漏入时改坏旧页面的旧按钮；`[contrast]` 被滥用；断点下抽屉宽度规则（RD-17）被破坏；新增图标块抢键盘焦点；替换手写件时改了页面布局。

## 契约（本 Sprint 定稿，REPORT 交接）

### 1. 逐件对照（用 R31a 工具）
- Web 展示页按 `01-system.html` 规格格重排，每个规格格一个小节路由 `/showcase/components/<小节 id>`；规格格选择器、`mini()` 处理、`.doccard` 跳过沿用 R31a 契约 §1。新清单 `views/web-R31b-components.json`（浅 / 深；无响应式差异的组件只比 1440，有断点差异的——如 Drawer——比 1440 / 1024 / 390）。
- 每个组件另以 `?env=legacy` 再比一次（「旧页面 + 新壳」环境），结果应与新页面环境一致。
- **判定（RD-29）**：所有超阈值带都归因为 `[data]` / `[raster]` / `[contrast]`（限 `contrast-substitutions.json`）即通过，raw 只作参考，与 App §20 一致。

### 2. 组件修正（Web）
- `Modal`：新增 380 宽档；标题左侧可放图标块（kit 规格）；`closable={false}` 时不画 ✕（此时必须有取消按钮，Esc 仍可关、焦点归还）。
- `Drawer`：✕ 白色圆底；标题下可放副标题（长标题换行，不被挤压）；内边距 22；非壳抽屉深色下有细边；**宽度仍只有 RD-17 的 520 / 380 两档**；断点规则不变。
- `FilterOption` 上下 7；`Toggle` 44×26；`MacTile` emoji 21 / 17、圆角 13；`Avatar` lg 字号 19（与 App 一致）。
- `Chip` 杏色字、`Kbd` 字色：保留加深版，门禁走 `[contrast]`；需要补替换对时先进 `tokens.json` `color.contrast`，再进 `contrast-substitutions.json`，每条在 REPORT 说明。
- **全局 `.btn` 等旧样式漏入**：用 `?env=legacy` 对照找出所有受影响的新组件，统一处理（沿用 G13 双类写回，或在组件根上做隔离，二选一写进 REPORT），加测试：新组件在旧页面环境里渲染与新页面一致。
- 逐件对照发现的其他差异：全部修正，或写明保留理由请产品负责人拍板。

### 3. 新组件与手写件（Web）
- 补 `UnderlineTabs`（对应 b2 `.utabs`）；其余手写件按「已查清的事实」第 4 条逐个判断该换成哪个现有或新组件，**全部替换**；新组件进展示页和逐件对照套件。只换组件、不改页面布局；要改布局的写进「交还」。

### 4. 调用点、中途状态与重比（RD-28）
- 调用点改用本 Sprint 新参数（380 档、图标块、`closable`、副标题等）在本 Sprint 内完成，含推翻 R24 / R26 自定 7。
- 中途状态（弹窗 / 抽屉打开等）用只在开发环境生效的状态开关（`design=` 参数，做法同 R12），写进 views 条目；生产构建不存在（测试守住）。
- **重比**：开工第 1 步生成 `scripts/visual/pass-baseline-web.json`（已通过画面）和重比清单（上表画面 id → suite × 宽度 × 主题）；通过的在 DEFERRED-A §1 与交接表改 done（写提交号）；页面自身原因的写进 REPORT「交还」并追加到交接表对应 Sprint 节。

### 5. 不退步
- 每改一个组件：跑 `views/web-R07.json` 和 `views/web-R31b-components.json`。
- 收口：重跑 `pass-baseline-web.json` 全部画面，全部仍通过。

## 像素 SC 与预检

- **重比画面**：画板、宽度、主题、到达步骤以原 Sprint 的 `views/web-*.json` 条目为准，预检不重做。
- **组件小节**：「画板」即 01-system 规格格（`UnderlineTabs` 为 b2 画板区域）；预检第 3 项对每个小节跑 `--style-diff` / `--extract-board`，结果写进本目录 `preflight-checklist.md`，缺的 token 先补。

## 范围与文件

- 修改：`orbit-2026/ui/**`、`repos/orbits/app/showcase/components/*`、上面列出的手写件所在文件、用到新参数的调用点；新增 `views/web-R31b-components.json`、`pass-baseline-web.json`、`attribution-redesign-R31b.json`；必要时 `tokens.json`（`color.contrast` 与缺的 token）和 `contrast-substitutions.json`；DEFERRED-A、交接表、计划页 REWORK-REPORT-web §2 状态。**不改** `scripts/visual/**`（只修 bug）。
- 测试：受影响的组件渲染测试；「新组件在旧页面里不被旧样式影响」；开发状态开关不进生产；现有 `orbit-2026-scope`、`orbit-2026-css-tokens`、`orbit-button-ratchet`、`orbit-z-scale`、`orbit-modal-standard` 保持通过。
- **不做**：App 组件（R31a）；页面布局改动（交还）；新的业务组件。

## 验收契约

| SC | 操作链 | 主证据 |
| --- | --- | --- |
| SC-R31b-01 组件全部对齐 | `--suite views/web-R31b-components.json` 浅 / 深（有断点的 × 三宽度）全部通过（RD-29 标准） | 门禁总表 |
| SC-R31b-02 新尺寸与新部件 | Modal 380 档、图标块、无 ✕ 模式；Drawer 白圆 ✕、副标题（长标题不挤压）、内边距 22、深色细边、仍只有 520 / 380；已有档位外观不变 | 逐件对照 + 渲染测试 |
| SC-R31b-03 旧样式不漏入 | 每个新组件 `?env=legacy` 与新页面环境一致；旧页面旧按钮不变 | 新增测试 + 两种环境对照 |
| SC-R31b-04 键盘与无障碍 | 无 ✕ 的 Modal 可 Esc 关闭、焦点归还；图标块不进 Tab 顺序 | `orbit-2026-modal` 等测试 + 键盘走查记录 |
| SC-R31b-05 手写件与调用点 | 列出的手写件全部替换或写明交还；380 档等调用点已改；甲已被通知 | diff + REPORT 条目表 |
| SC-R31b-06 待组件库画面重比 | 重比清单全部重跑；通过的改 done；未过的有原因与去向 | 门禁总表 + 交还清单 |
| SC-R31b-07 不退步 | 每次组件改动后 R07 壳门禁通过；收口 `pass-baseline-web.json` 全部仍通过 | 收口全量门禁输出 |
| SC-R31b-08 测试与复核 | 两端全量对照基线零新增失败（orbits 用 en-US）；`tsc`、`typecheck:app`、`lint` 通过；`detect-changes` 写进 REPORT；独立复核**自己重跑门禁** | 全量清单、REVIEW |

## 执行顺序

1. 记基线、刷新 GitNexus 索引、跑 impact；生成 `pass-baseline-web.json` 与重比清单（含 R15 的 id）。
2. 展示页按规格格重排，接组件套件；第一次逐件对照（新页面与 `?env=legacy` 两种环境），得到差异清单与 token 缺口。
3. 按影响面修：Modal / Drawer → `.btn` 漏入 → FilterOption / Toggle / MacTile / Avatar → Chip / Kbd（`[contrast]`）→ 其余；每改一件跑组件套件 + R07 壳门禁。
4. `UnderlineTabs` + 替换手写件（先通知甲）；调用点改参数；开发状态开关。
5. 重比，更新 DEFERRED-A / 交接表。
6. 不退步全量门禁、两端全量测试、REPORT、独立复核。

## 失败与交接

同 R31a。REPORT 交接：Web 组件新参数用法、旧样式隔离方式、手写件替换清单、交还清单、DEFERRED-A 更新情况。
