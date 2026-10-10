# Sprint R06 — REPORT

**执行人：** 小雨的执行会话，2026-10-10。**依据：** PLANNER 修订 1、README 通用规则、RD-15、RD-16、RD-17、RD-18、RD-24、RD-25。
**基线：** `redesign` `3e94d23d`（R05 提交后）。orbits：6866 条，开工时的全量与本 Sprint 第一批改动同时进行，3 条 token 测试被中途改动污染（已在本 Sprint 内更新并通过）；其余失败是既有的：5 条 Node 26 `DEP0205` 子进程测试、`full-product-functional-audit`「visible controls have static accessible-name evidence」（指向 R04 的 App 文件）、`event-registration-portrait-workspace`（偶发）。`typecheck:app`、`lint` 0。
**证据：** `~/orbit-sprint-evidence/redesign/R06/run-01/`（`compare.html` 对照页；`screens/` 展示页 1440 / 1024 / 390 × 浅 / 深 整页 6 张 + 弹层 / Toast 打开态 20 张；`design/` 设计稿 01-system 浅 / 深、web.html；`orbits-test.log`、`typecheck*.log`、`lint.log`、`app-test.log`、`detect-changes.txt`）。

## 做了什么

1. **作用域根 `Orbit2026Scope`**（`app/(app)/app/orbit-2026/ui/Scope.tsx`）：渲染 `data-orbit-2026`（可选 `as="main"`）、`lang`，基础字体 / 字号 / 颜色来自 R01 token；把 `ORBIT_Z` 发布成 `--z-raised … --z-toast` 变量，模块 CSS 不写层级数字；内含弹层宿主（对话框、抽屉、Toast 都渲染在作用域里面）；向组件提供页面语言的标准用词（`useStandardCopy()`）和减少动效状态（系统设置或强制，CSS 读 `data-motion="reduce"`）。开发和测试环境下如果被放进 `[data-orbit-real-page]` 里会 `console.error`。
2. **组件库**（`orbit-2026/ui/`，CSS Modules，统一由 `index.ts` 导出；按 App 库的分组放文件：每个 `Name.tsx` 配同名 `Name.module.css`）：
   - 基础：`Button`（primary / accent / secondary / ghost / danger / dangerGhost / dangerSoft，md 40 / sm 32，block，loading，图标）、`IconButton`（40 / 34，红点）、`Card`（default / flat / line，Web 圆角 22、内边距 20，可带标题行）、`Chip`（8 色含 `ok`）、`Avatar` / `AvatarStack`（与 App 同一个配色哈希）、`MacTile`、`Kbd`、`ListRow`（`hoverActions`：桌面悬停 / 键盘聚焦才出现，触屏或 ≤390 宽常显且 44×44，最多 3 个）、`SearchField`、`TextField`（字段错误 `role=alert`）、`Accordion`、`Table`（带 caption）。
   - 反馈：`ToastProvider` / `useToast()`（右下 24、宽 420、最多 3 条，最新在下；成功 / 提示 5 秒倒计时线；出错不自动消失；`keep` 撤销条不倒计时；撤销 / 动作随调用组件卸载而失效；深色仍是深色胶囊）、`Modal`（420 / 480 / 560，`top` 距顶 96，`form` 用 `--bg`，提示区放 `Kbd`）、`ConfirmDialog`（取消在左且先获得焦点，破坏性 = 实心珊瑚、点遮罩不关闭）、`Drawer`（lg 600、1280 宽以下 520；md 520；sm 380；四边留 14、圆角 28；深色加一条细边）、`Popover`（340–440、圆角 22、无遮罩）、`ContextMenu`（200、圆角 18、方向键 / Home / End、破坏项珊瑚）。
   - AI：`ConfirmCard`（待确认虚线 → 成功 ok 绿 → 失败珊瑚浅底）、`WhyDisclosure`（「根拠を見る」）。
   - 控件：`Toggle`（`role=switch`，开 = plum-700）、`CheckCircle`（完成 = ok 绿，RD-17）、`Checkbox`、`Radio`（都有 44 触控区）、`Segmented`（WAI-ARIA tabs：方向键 / Home / End 移动）、`FilterOption`（`aria-pressed`、✓）、`CategoryTabs`（`radiogroup`）。
   - 进度：`ProgressBar`、`RingChart`、`CountUp`（与 App 同一缓动；减少动效直接显示终值）。
   - 状态：`EmptyState`（引导：步骤、占位行、一个主按钮）、`Skeleton`（8 秒后「読み込みに時間がかかっています」+ 再試行）、`OfflineBar`（恢复后薄荷色 2 秒收起）、`RetryCard`、`DegradedCard`、`SampleTag` / `SampleBar`、`QuotaChip`。
   - 弹层栈 `layer-stack.ts`：整页一个打开层的栈，Esc 和点外部只作用于最上层。`useOrbitModalA11y` 只调用不改：每个对话框把「只有在最上层时才关闭」的回调交给它，所以抽屉里打开的确认框按 Esc 只关确认框。
   - 所有按钮的 `<button>` 都带 `btn` 类（`orbit-button-ratchet` 计数不变）。
3. **展示页 `/showcase/components`**（`app/showcase/components/`）：所有组件和状态、可切 跟随系统 / 浅 / 深、减少动效、1440 / 1024 / 390 预览宽度，语言跟 `?lang=` / cookie / 浏览器（与 R03 用词展示页同一规则）。可见性沿用 `app/showcase/layout.tsx`：本地和 Vercel 预览 / staging 可见，正式环境 404（`VERCEL_ENV=production`，没有 `VERCEL_ENV` 的生产构建也按正式处理）；产品页面清单脚本本来就排除 `/showcase`。
4. **token 补充（R01 源，只加不改）**：`radius.menu 18`（菜单）、`radius.tile 16`（色块、步骤）、`radius.tag 6`（键帽、示例角标、进度条）、`font.size.dialog-title 16`、`control 12.5`（分段、筛选）、`meta 12`（次要文字、小按钮）。设计稿用到而 R01 没有的值，按「新门禁只认 token」补进源文件，`npm run design:tokens` 重新生成两端（App 用 `npm run sync:contract` 同步，同一提交）。`r-xs` 是旧名单上的禁用名，所以叫 `tag`。
5. **新门禁**：
   - `tests/ui/orbit-2026-css-tokens.test.ts`：`orbit-2026/**` 和组件展示页的 `*.module.css` 里没有十六进制颜色、颜色函数字面量（rgb / hsl / lab …）、颜色名；`z-index` 只能是 `var(--z-*)`；圆角只能 `var(--r-*)`；字号只能 `var(--fs-*)`。附注入样例（每条规则一个必拦样例 + 一个合法样例）。
   - `tests/ui/orbit-2026-scope.test.ts`：新组件和展示页文件不 import 旧样式模块（`orbit-reference-styles`、`orbit-reference-primitives`、0918 域、`design/controls`、`globals.css` …）、不写 `data-orbit-real-page`；渲染断言作用域不在旧作用域里，嵌进去时会报一次错。
6. **测试**：`orbit-2026-ui-render`（9 条：十个组件族都渲染且只有一个作用域、浅 / 深所有可见文字对比度 ≥4.5:1（大字 3:1）、Tab 焦点环可见 + 分段方向键 + 开关空格、「完了」是 ok 绿、悬停按钮桌面隐藏 / 390 常显且 ≥44、抽屉断点宽度、减少动效下对话框和 Toast 只淡入而且非减少动效时确实有位移、三种宽度 × 两种主题无横向滚动）、`orbit-2026-toast`（4 条）、`orbit-2026-modal`（5 条：焦点锁定与归还、`--z-modal`=400、Esc 只关最上层、破坏性确认点遮罩不关、Popover / 菜单键盘与关闭）、`orbit-2026-showcase`（2 条）、两个门禁（4 条）。浏览器测试用 esbuild 的 `local-css` 处理 CSS Modules（与 Next 同样的局部类名），注入真实 `tokens.css`（`tests/ui/support/orbit-2026-harness.ts`）。

## 验收

| SC | 结论 | 证据 |
| --- | --- | --- |
| 01 组件齐全且对得上设计 | ✅ | 契约列出的组件全部在 `index.ts`；`compare.html`：展示页 1440 / 1024 / 390 × 浅 / 深 + 模态、确认、抽屉、菜单、弹出层、Toast 堆叠的打开态，与 01-system / web.html 并排 |
| 02 键盘与无障碍 | ✅ | `orbit-2026-ui-render`（焦点环、方向键、空格、对比度）、`orbit-2026-modal`（锁焦点、归还、Esc 层级、默认焦点在取消）、悬停按钮 390 常显。键盘走查记录见下 |
| 03 作用域干净 | ✅ | 两个新门禁；`orbit-button-ratchet`、`orbit-z-scale`、`orbit-modal-standard`、`orbit-scale-ratchet`、`orbit-css-template-literals` 通过且计数未上升（新按钮带 `btn`，层级全部经 `--z-*`，没有 `zIndex` 数字字面量） |
| 04 反馈组件行为 | ✅ | `orbit-2026-toast`（最多 3 条、位置 24 / 420、出错常驻、撤销条不倒计时、组件卸载后撤销消失、深色胶囊可读）；`orbit-2026-ui-render` 抽屉 600 / 520 / 380 与 1024 下 lg = 520 |
| 05 展示页只在内部可见 | ✅ | `orbit-2026-showcase`：本地 / 预览可见、正式 404、noindex、产品清单排除 |

### 必需证据子表

| SC | 子断言 | 结论 |
| --- | --- | --- |
| 01 | 「完成」用 `ok` 绿；深色 Toast 是深色胶囊 | ✅ `orbit-2026-ui-render`「完了 is ok green」、`orbit-2026-toast`「dark」+ 截图 `open-toasts-dark-*.png` |
| 02 | 减少动效时只剩淡入 | ✅ 系统设置和展示页开关两种方式都测了；对照组证明非减少动效时有位移 |
| 03 | 现有三个门禁通过且计数没有上升 | ✅ 见上 |
| 全部 | 两端全量零新增；`tsc` / `typecheck:app` / `lint`；`detect-changes` | 见「基线 → 收口」 |

**键盘走查记录**（Chromium，展示页）：Tab 依次经过主题分段、宽度分段、减少动效开关、各按钮，焦点环都是 2px accent；分段控件只有选中项在 Tab 序列里，方向键切换；「modal 480」回车打开 → 焦点在「閉じる」→ Tab 循环不出对话框 → Esc 关闭 → 焦点回到「modal 480」；「drawer lg」→ 抽屉里「nested confirm」→ 焦点在「キャンセル」→ Esc 只关确认框 → 再 Esc 关抽屉 → 焦点回到「drawer lg」；「context menu」回车 → 焦点在第一项 → ↓ / End 移动 → Esc 关闭并回到触发按钮。以上每一步都在 `orbit-2026-modal` 里自动断言。

## 自定决定（用户指示：疑问一律选推荐方案，写明理由）

1. **展示页放在 `/showcase/components`，不是 PLANNER 写的 `/app/dev/components`**：R02 / R03 的展示页已经是 `/showcase/icons`、`/showcase/copy`，App 的 R04 展示页也是 `/showcase/components`；同一个 layout 已经实现了 RD-15 的「正式环境 404」，产品清单脚本也已排除 `/showcase`。`/app/**` 在登录区和语言中间件里，放进去反而要额外排除。
2. **按 App 库的分组放文件**（`Basics`、`Controls`、`States`、`Overlay`、`Disclosure`、`Progress`…），而不是 40 个组件各一个文件：与 App 的 `src/components/ui` 一一对应，方便两端对照修改；每个 `.tsx` 都有同名 `.module.css`。
3. **补 6 个 token**（见第 4 条），不在组件里写数字：新门禁要求圆角和字号只用 token，设计稿里这几个值（12、12.5、16 字号，6、16、18 圆角）在多个组件里重复出现。
4. **对话框焦点锁定沿用 `useOrbitModalA11y`，Esc 层级用自己的弹层栈解决**：PLANNER 要求只调用不改该 hook；它每个对话框各自监听 Esc，嵌套时最下层先收到事件。给它的关闭回调只在本层位于栈顶时执行。对标：WAI-ARIA APG 的「Escape 关闭当前对话框」，以及 Radix / Headless UI 的层级栈。
5. **抽屉在 1280 宽以下把 lg 降到 520**：RD-17 规定 1024 宽时内容多的 520；lg 600 在 1024 宽会挤掉主区。md / sm 不随断点变。
6. **悬停快捷按钮在 `(hover: none)` 或 ≤390 宽时常显并放大到 44**：对标 Gmail / Linear 网页版行内操作在触屏上常显。
7. **危险按钮实心用 `coral-text` 底色**（与 App R04 自定决定 11 相同）：白字在设计原值 `coral` 上对比度不到 4.5。
8. **深色主题的预览改 `<html data-theme>`，不做作用域级主题**：R01 的 `tokens.css` 只在 `:root` 定义主题；作用域级主题需要改生成器，超出本 Sprint。展示页离开时恢复原值。
9. **示例模式**：`SampleTag` / `SampleBar` 是新视觉；拦截层 `DemoInterceptLayer` 不动。旧的 `DemoBanner` 属于旧顶栏，R07 换壳时在新壳里改用 `SampleBar`。

## 基线 → 收口

| 项目 | 基线 `3e94d23d` | 收口 | 对照 |
| --- | --- | --- | --- |
| orbits `npm test`（en-US） | 6866 条；既有失败：5 条 `DEP0205` 子进程测试、审计「static accessible-name evidence」（R04 的 App 文件）、偶发 `portrait-workspace` | 全量 6736 条（两个审计文件在全量里因同时截图超时，按文件级失败计）；**单独重跑两个审计文件 159 条，只剩「static accessible-name evidence」1 条**，失败项指向 R04 的 `OnlineOnlyBoundary.tsx:104`、`ui/States.tsx:112-113`，与基线同一条 | 零新增。审计生成器和测试的页面计数排除 `/showcase`（开发者展示页，正式环境 404，产品清单本来就排除），否则展示页的示例按钮会被当成产品控件 |
| orbits `typecheck` / `typecheck:app` / `lint` | 0 / 0 / 0 | **0 / 0 / 0** | |
| App `npm test` | 4170 条，3 失败（R05 收口） | **4170 条，4167 通过，3 失败** | 同样 3 条基线既有（`route-parity`、两条 events tab）；token 同步后 `design-sync` 通过 |
| App `tsc` | 0 | **0** | |

## GitNexus

- 改动的已有符号只有生成文件（`shared/design/tokens.ts`、`tokens.css`、App 的同步副本）和测试 `design-tokens-generated`（期望的圆角表加了 3 项）。`useOrbitModalA11y`、`ORBIT_Z` 只读取 / 调用：impact `UNKNOWN`（索引没有解析到这条调用），文本搜索确认它们在本 Sprint 里没有被修改。
- 新增文件全部在 `orbit-2026/ui/`、`app/showcase/components/`、`tests/ui/`，旧页面零改动。
- **detect-changes（提交前）：9 个已跟踪文件、6 个符号、受影响流程 0**（`detect-changes.txt`；新建文件未跟踪不计入；其中 `bridge/handoffs.md` 是用户自己的未提交文件，不在本次提交里）。

## 交接

- **新页面怎么进入新作用域**：页面（或 R07 的新壳）最外层渲染 `<Orbit2026Scope language={language}>`，里面放一个 `<ToastProvider>`；不要把它放进任何带 `data-orbit-real-page` 的元素里（开发环境会报错，门禁也会拦）。组件一律从 `app/(app)/app/orbit-2026/ui` 的 `index.ts` 导入。
- **旧页面内容放进新壳**：旧页面整体作为子元素放在新壳的主区里，它自己保留 `data-orbit-real-page`；新壳本身（左栏、主标题区、右栏）在新作用域里，两者是兄弟关系而不是嵌套。
- **写新组件的 CSS**：只用 `var(--…)`；层级 `var(--z-dropdown|overlay|modal|toast)`；圆角 `var(--r-*)`；字号 `var(--fs-*)`；减少动效用 `@media (prefers-reduced-motion: reduce)` 和 `:global([data-motion="reduce"])` 两处一起写（展示页和测试会强制开关）。
- **弹层**：用 `Modal` / `ConfirmDialog` / `Drawer` / `Popover` / `ContextMenu`，不要自己挂 `keydown`；需要「只在最上层生效」的自定义浮层用 `useLayer(open)`。
- **Toast**：`useToast().success(msg, { undo })`、`.error(msg, { action: { label, onSelect } })`、`.info(…)`；Web 一次最多 3 条。
- **门禁**：`orbit-2026-css-tokens`、`orbit-2026-scope`；新按钮必须带 `btn`（`Button` / `IconButton` 自带）。
- **展示页**：本地 `http://localhost:3000/showcase/components?lang=ja|zh|en`。

## 已知例外

- 截图用 Chromium（Playwright）；Safari 的 `color-mix()` 和 `:where()` 支持没有单独实测（两者 Safari 16.2+ / 14+ 已支持）。
- 展示页没有逐像素对照设计稿（RD-16 不做逐像素门禁）；对照页是并排截图。
