# Sprint R06 — REVIEW（独立复核）

**复核人：** 独立 AI 复核会话（不是执行人），2026-10-10。
**对象：** `git diff c7099cfb..a7610aa3`（单个提交 `a7610aa3`：代码、测试、token 补充、REPORT、README 登记）。
**依据：** PLANNER 修订 1（唯一契约）、GOAL.md、README「骨架通用规则」1–9、RD-15、RD-16、RD-17、RD-18、RD-24、RD-25；设计依据 `kit/ui.css`、`01-system.html`、`web.html`。REPORT 只作线索；下面每条结论都是复核人重跑、重读或注入验证得出的。
**复核环境说明：** 复核期间主工作区里有另一个会话（R07）正在改文件（`orbit-2026/ui/Overlay.*`、`orbit-ask-routes.ts`、多处旧页面，均未提交）。为了只看 R06 的提交，复核人用 `git archive a7610aa3` 把 `repos/orbits`、`repos/orbit-app` 导出到 scratchpad（`node_modules` 用软链接），所有定向测试、typecheck、lint、探针、注入和 dev server 都在这份快照里跑。主工作区只跑过一次全量（见下），没有写入任何文件。

## 结论：有条件通过

主体已经做到，复核人独立核实过：
- **组件齐全**：契约列出的 40 个组件都从 `orbit-2026/ui/index.ts` 导出，按 App 库的分组放文件，每个 `.tsx` 都有同名 `.module.css`。
- **作用域根**：`Orbit2026Scope` 渲染 `data-orbit-2026`，层级经 `--z-*` 由 `ORBIT_Z` 发布，弹层宿主在作用域里面。`tokens.css` 由根布局 `app/layout.tsx:7` 全局加载，没有在 Scope 里重复加载，做法合理。
- **全量零新增失败**：快照里 orbits 全量 6883 条：12 条失败 = 已知 6 条（5 条 DEP0205 + 审计「static accessible-name evidence」）+ 6 条快照环境造成的失败（快照不是 git 仓库、缺仓库根的 `docs/`、`knowledge/`；同样这 6 条在主工作区全量里都通过）。主工作区全量（含 R07 未提交改动）6890 条，只有已知 6 条失败。审计失败项全部指向 App 文件（`OnlineOnlyBoundary.tsx:104`、`ui/States.tsx:112-113` 等），没有 Web `orbit-2026` 的条目。
- **typecheck / typecheck:app / lint**：快照里都是 exit 0。
- **定向测试**：任务指定的那组 69 条，68 条通过。唯一失败是 `no-hardcoded-copy`「the allow list only shrinks」，原因是 R07 会话正在改 `orbit-ask-routes.ts`（未提交），与 R06 无关；在快照里这条通过。
- **展示页正式环境 404**：复核人在快照里起了两个 `next dev`：`VERCEL_ENV=production` 时 `/showcase/components` 返回 **404**，不设时返回 **200**。真实 Next 构建下新按钮样式正确（`bg` 为 ink、`padding 16px`、`radius 999px`），作用域不在旧作用域里。
- **token 补充符合 R01 规则**：6 个 token（`radius.menu/tile/tag`、`font.size.dialog-title/control/meta`）只加不改，`tokens.json → tokens.ts / tokens.css` 重新生成，App 副本 `src/api/design/tokens.ts` 同一提交同步。`r-xs` 是禁用旧名，改叫 `tag`，合理。
- **按钮带 `btn`、层级不写数字**：`orbit-button-ratchet`、`orbit-z-scale`、`orbit-modal-standard`、`orbit-scale-ratchet` 通过且计数没有上升。旧 `.btn` 样式全部挂在 `[data-orbit-real-page]` 下，不会漏进新作用域（复核人在 `app/**`、`public/**` 里搜过无作用域的 `.btn` 规则，没有）。

但有 **4 条中等问题**：
- **M1**：在 `Modal` / `Drawer` 里打开的 `Popover` / `ContextMenu` 被画在遮罩和抽屉下面，看不见也点不到。
- **M2**：`Popover` 的内容键盘到不了：打开时焦点不移进去；在弹窗里打开时，焦点锁让 Tab 永远到不了它。
- **M3**：CSS token 门禁漏拦多种写死颜色和数字的写法（复核人注入 10 种未被拦）。
- **M4**：作用域门禁抓不到真实的嵌套：「渲染断言」只测了一个人为搭的页面；旧页面里把新作用域包进 `data-orbit-real-page`，门禁照样通过。

没有严重问题。

**条件：** M1–M4 在 `redesign` 上修完（RD-25）。**R07 导航壳会直接在弹窗 / 抽屉里用弹出层和菜单，而且是第一次真正把新作用域和旧页面放在一起**，所以 M1、M2、M4 应在 R07 接入前修完。m 级可以随后处理。

## 逐 SC 核实

| SC | 结论 | 复核人做了什么 / 证据 |
| --- | --- | --- |
| 01 组件齐全且对得上设计 | ⚠️ 基本达成 | **组件**：逐个比对契约清单与 `index.ts`，全部在。<br>**规格**：读 CSS 对照 `kit/ui.css`：卡片 22 / 20；`.wmodal` 420 / 480 / 560、圆角 28、内边距 24、`top` 96；抽屉四边 14、圆角 28、lg 600（1280 以下 520）/ md 520 / sm 380；`.pop` 340–440、圆角 22、无遮罩；菜单 200 / 18；Toast 栈右下 24、宽 420、最多 3；`.kbd` 20 高、圆角 6；遮罩 `--scrim-web`。都对得上。危险实心按钮用 `coral-text`（与 R04 决定 11 一致，有理由）。<br>**RD-17**：`CheckCircle`、`Chip ok`、`ConfirmCard` 成功态是 `ok`；深色 Toast 是 `surface-3` 底 + `ink` 字。<br>**对照页**：整页 + 6 种打开态，不是逐组件并排；没有 390 宽的打开态，也没有 `web.html` 深色（m8）。<br>**问题**：弹出层 / 菜单在弹窗里看不见（M1） |
| 02 键盘与无障碍 | ⚠️ 部分 | **成立**：弹窗锁焦点、关闭后焦点回到触发按钮；抽屉里的确认框按 Esc 只关确认框（`useOrbitModalA11y` 每层都挂 keydown，非顶层的回调由 `isTop()` 挡住，复核人读代码确认监听顺序不影响结果）；弹出层里开菜单时 Esc 只关菜单；破坏性确认框焦点从「キャンセル」开始，点遮罩不关闭；`Segmented` 方向键 / Home / End；390 宽和触屏（复核人在 768 宽、`hasTouch` 下实测 `(hover: none)` 生效）悬停按钮常显且 44×44。<br>**不成立**：`Popover` 内容键盘到不了（M2）；`CategoryTabs` 是 `radiogroup` 但没有方向键（m3）；Toast 的「元に戻す」在 Tab 顺序最后、5 秒倒计时不暂停（m2） |
| 03 作用域干净 | ⚠️ 门禁有漏洞 | 现有代码确实干净：两个新门禁通过，复核人通读了全部 `.module.css`，没有写死颜色或数字层级。但两个门禁本身都能被绕过（M3、M4）。新作用域自己的按钮重置和组件类优先级相同，靠 CSS 加载顺序取胜（m5） |
| 04 反馈组件行为 | ⚠️ 基本达成 | 最多 3 条、最新在下、成功 / 提示 5 秒、出错不自动消失、`keep` 撤销条不倒计时、调用组件卸载后撤销失效：`orbit-2026-toast` 4 条通过，复核人读 `toast-model.ts` 确认。抽屉 600 / 520 / 380 与 1024 宽时 lg = 520：渲染测试通过。<br>**问题**：第 4 条把最旧的一条挤掉，即使它是出错 Toast（m1） |
| 05 展示页只在内部可见 | ✅ | 单元测试覆盖 `shouldHideShowcase` 四种环境；复核人另外用真实 dev server 验证：`VERCEL_ENV=production` → 404，本地 → 200。`robots: { index: false }`。路由放在 `/showcase/components`，不是 PLANNER 写的 `/app/dev/components`：沿用 R02 / R03 / R04 的位置和同一个 404 layout，理由成立，PLANNER 应同步改字（m7）。staging 是否可见见 m9 |

### 必需证据子表

| SC | 子断言 | 复核结论 |
| --- | --- | --- |
| 01 | 「完成」用 `ok` 绿；深色 Toast 是深色胶囊 | ✅ 渲染测试 + 截图 `open-toasts-dark-1440.png` 复核人看过 |
| 02 | 减少动效时只剩淡入 | ✅ 弹窗、`top` 弹窗、抽屉、Toast 改为 `fadeIn`；开关滑块、勾选缩放、手风琴箭头、进度条、环形图、骨架闪光、按下缩放都在 `prefers-reduced-motion` 和 `[data-motion=reduce]` 两处关掉；`CountUp` 直接显示终值。复核人逐个 `.module.css` 读过。小瑕疵见 m10 |
| 03 | 现有三个门禁通过且计数没有上升 | ✅ 复核人重跑通过 |
| 全部 | 全量零新增；`tsc` / `typecheck:app` / `lint`；`detect-changes` | ✅ 见「重跑」。`detect-changes` 只核对了证据文件（9 文件、6 符号、流程 0），未重跑 |

## 运行时抽查

### 重跑（`a7610aa3` 快照，`repos/orbits`）

| 命令 | 结果 |
| --- | --- |
| 指定的定向测试组 | 快照：全部通过。主工作区：69 / 68，唯一失败是 R07 未提交改动造成的 `allow list only shrinks` |
| `LANG=en_US.UTF-8 LC_ALL=en_US.UTF-8 npm test` | 快照 6883 / 12 失败（已知 6 + 快照环境 6）；主工作区 6890 / 6 失败（全部已知）。另有 872 条数据库测试跳过（本地没有配测试库，两次相同） |
| `npm run typecheck` / `typecheck:app` / `lint` | 0 / 0 / 0 |
| `next dev`，`VERCEL_ENV=production` | `/showcase/components` → 404 |
| `next dev`，本地 | `/showcase/components` → 200；新按钮样式正确 |

### 组件探针（scratchpad 里的临时场景，复用 `tests/ui/support/orbit-2026-harness.ts`）

| 探针 | 结果 |
| --- | --- |
| `Modal` 里打开 `Popover`，对其中按钮中心点做 `elementFromPoint` | 命中 `Overlay_scrim`：弹出层 `z-index` 200，在遮罩（400）下面 → M1 |
| `Modal` 里打开 `ContextMenu` | 同上，被遮罩盖住 → M1 |
| `Drawer` 里打开 `Popover` / `ContextMenu` | 命中 `Overlay_drawerBody`：被抽屉（300）盖住 → M1 |
| 上面两种情况按 Esc | 只关看不见的弹出层，弹窗 / 抽屉还在（层级栈逻辑本身是对的） |
| `Modal` 里用回车打开 `Popover`，连按 Tab 10 次 | 焦点停在触发按钮，10 次都到不了弹出层里的按钮 → M2 |
| `CategoryTabs` 聚焦「A」按 → | 选中和焦点都不动；Tab 从 A 走到 B（每一项都在 Tab 顺序里）→ m3 |
| 连发 3 条 `error`，再发 1 条 `success` | 屏幕上剩 `E2, E3, S4`：第一条出错 Toast 没被用户关就消失了 → m1 |
| 浅 / 深 × 页面、Toast、菜单、`top` 弹窗、抽屉，按祖先透明度合成后算对比度 | 只有一处不达标：浅色 `CategoryTabs` 的计数「18」（`opacity .75`）3.48:1 → m4。Toast 副文字、菜单、弹窗、抽屉都达标 |
| 先 `import Button` 再 `import Orbit2026Scope`（深路径导入） | 按钮背景变透明、内边距变 0：作用域的按钮重置盖过了组件样式 → m5。按 `index.ts` 的顺序导入时正常 |
| 1440×700，`Modal top` 放很长的内容 | 弹窗 `y=96, height=652`，底边在 748，超出视口 48px，最后一段内容和按钮滚不到 → m6 |
| 768 宽、`hasTouch` + `isMobile` | `(hover: none)` 成立，悬停按钮常显、44×44 ✅ |

### 注入（都在快照里做，用完删除；主工作区未写入）

`tests/ui/orbit-2026-css-tokens.test.ts`，往 `ui/ZzProbe.module.css` 写一行：

| 注入 | 结果 |
| --- | --- |
| `color: #fff` | ✅ 拦住 |
| `z-index: 400 !important`、`z-index: calc(var(--z-modal) + 1)` | ✅ 拦住 |
| `background: linear-gradient(90deg, var(--ink), white)` | ✅ 拦住 |
| `border: 1px solid white` | ❌ 未拦 |
| `outline: 2px solid red` | ❌ 未拦 |
| `box-shadow: 0 0 0 4px black` | ❌ 未拦 |
| `color: navy`、`background: teal` | ❌ 未拦（颜色名只认 12 个） |
| `color: Canvas`（系统色） | ❌ 未拦 |
| `font: 700 13px/1.4 sans-serif` | ❌ 未拦（字号写在简写里） |
| `border-top-left-radius: 12px` | ❌ 未拦 |
| 分行写的 `border-radius:` ↵ `12px;` | ❌ 未拦 |
| `border-radius: var(--r-pill) !important` | ⚠️ 误报（合法写法被拦） |

`tests/ui/orbit-2026-scope.test.ts`：

| 注入 | 结果 |
| --- | --- |
| `orbit-2026/ui/ZzLegacy.tsx`：`import "../../orbit-reference-styles"` + `data-orbit-real-page` | ✅ 拦住 |
| `orbit-2026/ui/ZzLegacy2.tsx`：`require(…orbit-reference-styles)`、`import(…)` | ❌ 未拦 |
| 旧页面 `app/(app)/app/zz-probe/page.tsx`：`<main data-orbit-real-page><Orbit2026Scope>…` | ❌ 未拦（这正是 RD-18 要防的情况）→ M4 |

注入后 `ls ui | grep Zz` 为 0，`zz-probe` 已删除；快照、dev server 已停止。

## 问题清单

### 严重

无。

### 中等

**M1 弹窗 / 抽屉里的弹出层和菜单被画在下面，看不见**
- **现象**：`Overlay.module.css:96`（`.popover`）和 `:108`（`.menu`）用 `--z-dropdown`（200），而抽屉是 `--z-overlay`（300，`:67`），弹窗和遮罩是 `--z-modal`（400，`:6`、`:19`）。三者都挂在同一个作用域宿主里，按 `z-index` 比较。
- **复现**：探针。在 `Modal` 或 `Drawer` 里放一个触发按钮，打开 `Popover` / `ContextMenu`，对里面的按钮做 `elementFromPoint`，命中的是遮罩或抽屉。此时它是层级栈最上层，Esc 先关的是这个看不见的层。
- **影响**：抽屉里的「更多」菜单、弹窗里的选择弹出层都是常见用法（R07 的右栏、⌘K 都会遇到）。现有测试只在页面层打开弹出层和菜单，所以没发现。
- **建议修法**：弹出层 / 菜单的层级跟随打开它的层，而不是固定 `dropdown`。做法之一：`useLayer` 返回当前深度，弹出层在弹层内时用 `calc(var(--z-modal) + 深度)`（需要在 `ORBIT_Z` / `--z-*` 里加一档「弹层内弹出」，或由 Scope 发布 `--z-popover-in-modal`）；做法之二（对标 Radix）：弹出层 Portal 到打开它的弹层容器里。补一条渲染测试：抽屉和弹窗里各开一次弹出层和菜单，用 `elementFromPoint` 断言可见、可点。

**M2 `Popover` 内容键盘到不了**
- **现象**：`Overlay.tsx:173-194`：打开时不移动焦点；内容经 `Portal`（`:13-18`）渲染在作用域宿主，也就是整页最后。页面层：键盘用户要 Tab 过整页才能到达。弹窗里：`useOrbitModalA11y` 的焦点锁只在弹窗卡片内循环，卡片外的弹出层永远到不了。另外 Tab 离开时弹出层不关。
- **复现**：探针，弹窗里用回车打开弹出层，连按 Tab 10 次都到不了其中的按钮。
- **影响**：违反 SC-02「键盘可达」。现在展示页的弹出层里只有文字，测试只测了 Esc 和点外部关闭，所以没暴露。
- **建议修法**：对标 WAI-ARIA 非模态对话框 / Radix Popover：打开后把焦点移到弹出层第一个可聚焦元素（没有就移到面板，`tabIndex=-1`），Tab 走出最后一个元素时关闭并回到触发按钮之后；同时解决 M1 的挂载位置，使它位于弹窗的焦点锁范围内。补测试：页面层和弹窗内各一次，键盘打开 → 焦点在弹出层里 → Esc 回到触发按钮。

**M3 CSS token 门禁漏拦多种写法**
- **现象**：`tests/ui/orbit-2026-css-tokens.test.ts:30-38` 是逐行的正则：
  - 颜色名只在 `color / background / border-*-color / fill / stroke / outline-color` 这些属性里查，而且只认 12 个颜色名；
  - 字号只查 `font-size`，圆角只查 `border-radius`；
  - 一条声明分两行写就完全看不到。
- **证据**：见注入表，`border` / `outline` / `box-shadow` 简写里的颜色名、`navy` / `teal` / 系统色、`font` 简写、`border-top-left-radius`、分行声明共 10 种未被拦；`!important` 的合法 token 写法反而误报。
- **影响**：SC-03「新 CSS 里没有写死颜色」和 RD-18「禁止十六进制颜色」靠这一个门禁守。R07 起会有大量新 CSS，门禁能被这样绕过，「门禁通过」就不能证明「没有写死颜色」。
- **建议修法**：用 PostCSS（仓库已经有 Next 的 postcss 依赖）逐条解析声明，不再按行匹配：
  - 任何属性的值里，去掉 `var(...)` 后不得有颜色关键字（用完整的 CSS 颜色名表 + 系统色，白名单只留 `transparent` / `currentColor` / `inherit`）、十六进制和颜色函数；
  - `font` 简写和所有 `*-radius` 长写同样只允许 `var(--fs-*)` / `var(--r-*)`；
  - 值允许尾随 `!important`。
  - 把上表的注入样例固化进「injection samples」测试。

**M4 作用域门禁抓不到真实的嵌套**
- **现象**：PLANNER 要求「`data-orbit-2026` 不出现在 `data-orbit-real-page` 元素的内部（渲染断言）」。实现里：
  - 渲染断言（`orbit-2026-scope.test.ts:27-46`）用的是测试自己拼的 HTML，测的是 Scope 里那句 `console.error` 会不会触发，而不是代码库里有没有这样的嵌套；
  - 静态检查（`:13-25`）只扫 `orbit-2026/` 和 `showcase/components/` 两个目录。
- **证据**：注入一个旧页面 `zz-probe/page.tsx`，在 `<main data-orbit-real-page>` 里渲染 `<Orbit2026Scope>`，两条测试都通过。`require()` / 动态 `import()` 引旧样式也不拦。运行时的 `console.error` 只在开发环境、只在挂载时检查一次，不会让任何测试失败。
- **影响**：RD-18 和「易错边界」第一条要防的正是旧页面或旧壳把新组件包进去。R07 起新壳和旧页面会第一次同时出现，现在的门禁对这种改动永远是绿的。
- **建议修法**（两层都做）：
  - 静态：扫 `app/**`，凡是 import 了 `orbit-2026/ui`（或 `Orbit2026Scope`）的文件，如果同一文件里还有 `data-orbit-real-page`，或者被某个带 `data-orbit-real-page` 的组件直接渲染，就报错；`require(` / `import(` 也计入旧样式导入；
  - 渲染：R07 起对新壳的真实路由（至少一条旧页面挂在新壳里）做渲染断言，`[data-orbit-real-page] [data-orbit-2026]` 计数为 0；
  - 可以再加：测试环境里 `console.error` 含「RD-18」时让测试失败。

### 轻微

- **m1 第 4 条 Toast 会把出错 Toast 挤掉**：`toast-model.ts:32-34` 直接保留最新 3 条。探针：3 条 error 后再发 1 条 success，第一条 error 没被关就消失了，与「出错不自动消失」相冲突。修法：挤出时先挤最旧的非出错、非 `keep` 条目；全是常驻条目时再挤最旧的（对标 Sonner：被挤出的条目在前面的条目关闭后重新出现）。
- **m2 Toast 倒计时不暂停，键盘难以及时撤销**：`Toast.tsx:61-65` 的计时器不随悬停或聚焦暂停；Toast 栈在作用域宿主末尾，键盘用户要 Tab 过整页才能到「元に戻す」，5 秒内很难做到（WCAG 2.2.1）。修法：悬停 / 聚焦 Toast 时暂停倒计时（对标 Gmail、Sonner）；或提供到最新 Toast 的快捷键。另外 `Toast.tsx:27` 的栈容器 `aria-live` 与每条的 `role=status/alert` 叠加，可能重复朗读，建议只留一种。
- **m3 `CategoryTabs` 没有方向键**：`Controls.tsx:84-95` 用了 `role=radiogroup` / `radio`，但所有选项都在 Tab 顺序里，方向键没反应。按 WAI-ARIA 单选组应只有选中项可 Tab、方向键切换；或者改用 `aria-pressed` 的按钮组，不声明 `radiogroup`。
- **m4 计数文字对比度不足，对比度测试有盲区**：`Controls.module.css:104` 的 `.count` 用 `opacity: .75`，浅色时「18」在 `surface-2` 上 3.48:1（11px）。渲染测试 `orbit-2026-ui-render.test.tsx:21` 直接跳过 `opacity < 1` 的元素，不算祖先透明度，也不打开 Toast、菜单、弹窗、抽屉取样。修法：计数改用 `--ink-3-text` 之类的文字色、去掉透明度；测试按祖先透明度合成颜色后再算，并在弹层打开态各取一次样。
- **m5 作用域的按钮重置靠加载顺序取胜**：`Scope.module.css:14-22` 的 `.scope :where(button)` 优先级是 (0,1,0)，与 `.button` 等组件类相同，谁后加载谁赢。探针：先深路径导入 `Button`、后导入 `Scope`，按钮背景和内边距被清空。现在经 `index.ts`（Scope 排第一）导入时正常，Next 实测也正常，但 `Overlay.tsx`、`States.tsx` 自己就是先 import `./Button`。修法：改成 `:where(.scope) button`（优先级 (0,0,1)），或者把重置放进 `@layer reset`。
- **m6 `top` 弹窗底部会超出视口**：`Overlay.module.css:16` 的 `max-height: calc(100vh - 48px)` 是给居中弹窗的；`.top`（`:31`）距顶 96 时最高仍是 `100vh - 48`，底部超出 48px（探针 1440×700：底边 748）。修法：`.top { max-height: calc(100vh - 96px - 24px); }`。
- **m7 展示页细节**：
  - 宽度切换（`ComponentShowcase.tsx:39`）只改容器 `max-width`，依赖视口媒体查询的行为（≤390 常显悬停按钮、1280 以下抽屉 lg = 520）在展示页上看不到，只有改浏览器窗口宽度才行。可用 `iframe` 预览，或在页面上注明。
  - 主题选「system」时（`:22-28`）挂载即删掉 `<html data-theme>`，用户在设置里选过的浅 / 深会在展示页上失效（离开时恢复）。默认应保留原值。
  - PLANNER 写的路由是 `/app/dev/components`，实际是 `/showcase/components`，理由成立；请在 PLANNER 里改字，避免后面的 Sprint 照抄错地址。
- **m8 对照页不是逐组件并排**：`compare.html` 是设计稿三张整页长图 + 展示页整页 + 6 种打开态，没有组件级的配对，也没有 390 宽的打开态和 `web.html` 深色。PLANNER 主证据是「与设计稿画板并排」，与 R04 m6 是同一问题。
- **m9 staging 是否可见需要确认**：`visibility.ts` 只在 `VERCEL_ENV !== "production"` 时显示。仓库里有 `vercel.staging.json`；如果 staging 是一个独立 Vercel 项目的正式环境部署，展示页在 staging 上会是 404，与 RD-15「staging 可见」不符。请在 REPORT 写明 staging 的 `VERCEL_ENV`；如果是 `production`，就加一个显式开关（例如 `ORBIT_SHOWCASE=1`）。
- **m10 小细节**：
  - `Button.module.css:101` 在 `[data-motion=reduce]` 下只停了旋转，没有像 `:95` 那样把右边框补上颜色，转圈变成一个缺口圆。
  - `ContextMenu` 里按 Tab 焦点离开菜单，但菜单不关（`Overlay.tsx:215-220` 只处理方向键）。
  - 悬停按钮在桌面上是 `opacity: 0`，但仍然可以被点到（`ListRow.module.css:51`）。可以加 `pointer-events: none`，在悬停 / 聚焦时恢复。
  - `RingChart` 的 `segments[].color` 是任意字符串，门禁只扫 CSS，`.tsx` 里传十六进制不会被拦。建议类型收窄为 token 名。

## 对 REPORT「自定决定」的评价

| # | 评价 |
| --- | --- |
| 1 展示页放 `/showcase/components` | 合理（同一 404 layout、与 R02–R04 一致）；PLANNER 需改字（m7） |
| 2 按 App 分组放文件 | 合理，每个 `.tsx` 都有同名模块 CSS，契约精神满足 |
| 3 补 6 个 token | 合理，只加不改，两端已同步，测试已更新 |
| 4 焦点锁沿用 hook，Esc 用层级栈 | 合理，复核人确认嵌套弹窗 / 抽屉的 Esc 与 Tab 都正确；但弹出层不在这套体系里（M1、M2） |
| 5 1280 以下 lg 降到 520 | 合理，符合 RD-17 |
| 6 `(hover: none)` 或 ≤390 常显 | 合理，复核人实测触屏和 390 都成立 |
| 7 危险实心用 `coral-text` | 合理（对比度），与 App 一致 |
| 8 深色预览改 `<html data-theme>` | 可以接受；「system」时会清掉用户设置（m7） |
| 9 示例模式只换视觉 | 合理，拦截层未动 |
| 审计排除 `/showcase` | 合理：开发展示页、正式环境 404、产品页面清单本来就排除。注意 App 侧的展示页（`ComponentShowcaseScreen.tsx`）仍在移动端审计里，两端口径不一致，属既有问题，可在 R09 统一 |

**REPORT 的数字核实**：全量、typecheck、lint、门禁计数与复核人重跑一致。**与实际不符的说法**：「契约列出的组件……键盘可达」对 `Popover`、`CategoryTabs` 不成立（M2、m3）；「两个新门禁」能证明「没有写死颜色」「不在旧作用域内」的说法过强（M3、M4）；「出错不自动消失」在超过 3 条时不成立（m1）。

## 附：复核人留下的痕迹

- 全部探针、注入、快照和 dev server 都在 scratchpad 里，已停止 / 删除；主工作区没有写入任何文件。
- 主工作区 `git status` 里的改动来自另一个会话（R07 进行中）以及用户自己的未提交文件，复核人没有碰。
- 本次只新增了本文件。

## 处理记录（执行会话，2026-10-10）

| 编号 | 处理 | 位置 / 证据 |
| --- | --- | --- |
| M1 | 已修：弹出层和菜单改用 `--z-modal` 层，和对话框同层、后渲染所以在其上；从抽屉 / 对话框里打开也看得见 | `Overlay.module.css`；`orbit-2026-modal` 断言 popover 的 z-index = 400 |
| M2 | 已修：`Popover` 打开时焦点移进面板（第一个可聚焦元素，否则面板本身 `tabIndex=-1`），关闭时回到触发按钮；顺带一并修了：菜单按 Tab 离开即关闭（m10） | `Overlay.tsx`；`orbit-2026-modal`「keyboard focus moves into the popover」 |
| M3 | 已修：门禁改为跨行读声明、忽略 `!important`；颜色名用 CSS Color 4 全表，覆盖 `border` / `outline` / `box-shadow` / `text-shadow` 等简写和自定义属性；`font` 简写必须用 `var(--fs-*)`；圆角长写同样只认 `var(--r-*)`。复核列出的 10 种绕过写法都加成注入样例（必拦），合法写法带 `!important` 不误报 | `orbit-2026-css-tokens.test.ts` |
| M4 | 已修：新增静态检查——作用域外的任何渲染 `data-orbit-real-page` 的文件都不得渲染 `<Orbit2026Scope>`；加上原有的运行时报错。R07 新壳把壳与旧页面做成兄弟节点（`orbit-2026-shell` 渲染断言两者互不嵌套） | `orbit-2026-scope.test.ts`；R07 |
| m1 | 已修：第 4 条 Toast 挤掉最旧的「会自己消失」的那条；出错和撤销条只有在全部都是它们时才会被挤掉 | `toast-model.ts`；`orbit-2026-toast` 用例改为 E1 保留 |
| m2 | 已修：悬停或聚焦 Toast 时暂停倒计时（计时线也暂停），键盘可从容按「元に戻す」（WCAG 2.2.1） | `Toast.tsx`；`orbit-2026-toast`「hovering … pauses」 |
| m3 | 已修：`CategoryTabs` 方向键移动选择（单选组惯例），只有选中项在 Tab 序列里 | `Controls.tsx` |
| m4 | 已修：计数改用 `ink-3-text`（不再半透明），选中的分类 / 筛选里继承文字色；对比度测试捕到的选中筛选计数 4.33 → 达标 | `Controls.module.css` |
| m5 | 已修：作用域基础重置包进 `:where(.scope)`，优先级为 0，任何组件类都能覆盖，与加载顺序无关 | `Scope.module.css` |
| m6 | 已修：`top` 弹窗最大高度 = 视口 − 120，内容在弹窗内滚动 | `Overlay.module.css` |
| m7 | 部分：展示页的宽度切换只改容器宽度、依赖窗口宽度的效果靠真实视口截图（`compare.html` 的 1024 / 390 截图是真实视口）；「system」恢复跟随系统是预期行为，离开展示页时恢复原设置；PLANNER 路由差异已在 REPORT 自定决定 1 说明 | — |
| m8 | 不改：对照页是整页 + 打开态并排，RD-16 不做逐像素 / 逐组件门禁；390 打开态与 web.html 深色留给 R09 截图集 | R09 |
| m9 | 需人确认：staging 的 `VERCEL_ENV` 若为 `production`，展示页在 staging 会 404。写入 R09「合回前总验收」清单 | R09 |
| m10 | 已修：减少动效时加载圈补齐边框；隐藏的悬停按钮 `pointer-events: none`（悬停 / 聚焦 / 触屏时恢复）；菜单 Tab 离开关闭；`RingChart` 颜色类型限定为 `var(--…)` | `Button.module.css`、`ListRow.module.css`、`Overlay.tsx`、`Progress.tsx` |

`tests/ui/orbit-2026-*` 全部通过（复核修复后 38 条）；`tests/ui/**` 的其他失败来自同一工作区里尚未提交的 R07 改动，随 R07 迁移。
