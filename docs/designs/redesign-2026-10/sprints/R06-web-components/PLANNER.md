# Sprint R06 — Web 组件库

**Plan revision:** 1。**模式:** existing-codebase / single-generator（执行人：小雨）。
**单一目标:** 在 `repos/orbits/app/(app)/app/orbit-2026/ui/` 建立五类通用组件（CSS Modules，新作用域）与展示页；补齐针对新写法的门禁。
**易读目标:** [GOAL.md](GOAL.md)。
**基线:** R01、R02、R03 合入后的 `redesign` HEAD（R04 / R05 是否合入不影响本 Sprint）。
**进入条件:** R01（token 变量文件）、R02（Web `Icon`）、R03（文案源、Web 新文案目录）completed。RD-15、RD-16、RD-17、RD-18 已定。

## 已查清的事实（按 `9d404c1c8`）

1. **现有写法**：0918 各域把 CSS 写成字符串常量（如 `network-0918/network-shell.tsx:75` 的 `NETWORK_STYLES`），用 `<style>` 插入（:38）；全仓库 0 个 `.module.css`，没有 Tailwind；`app/globals.css` 只给 dev 用，作用域 `.orbit-dev-root`（`tests/ui/orbit-dev-stylesheet-scope.test.ts:35`）。
2. **旧作用域的按钮重置**：`orbit-reference-styles.tsx:33-55` 有 `[data-orbit-real-page] button/input/select/textarea { background/border/padding/font: initial|inherit … }`，优先级 (0,1,1)，单个类选择器压不过；`.btn` 基类（:594-611）还会带入非设计声明，所以各域都要逐条覆盖。**新作用域不得嵌在 `[data-orbit-real-page]` 里面**（RD-18）。
3. **层级**：`app/(app)/app/orbit-z.ts:28-36` 的 `ORBIT_Z`（raised 10 / sticky 100 / dropdown 200 / overlay 300 / modal 400 / toast 500 / debug 900）；`tests/ui/orbit-z-scale.test.ts:74-106` 限制 `zIndex` 数字字面量最多 2 个。
4. **弹窗无障碍**：`useOrbitModalA11y`（`orbit-account-shell.tsx` 的 `ModalShell` 在用，:144-211）；`tests/ui/orbit-modal-standard.test.ts:49-130` 要求 `role=dialog`、`ORBIT_Z.modal`、迁移过的对话框不自挂 keydown。
5. **门禁**：`orbit-scale-ratchet`（只统计 React style 对象，模板字符串 CSS 被剔除，:76-80；刻度 fontSize {0,11,12,13,14,15,16,18,22,28}，上限 fontSize 35 / fontWeight 16 / gap 167，:60-62, 120-160）；`orbit-button-ratchet`（不带 `.btn` 类的 `<button>` ≤79，正则在 :70，:128）；`orbit-css-template-literals`（CSS 模板串里不得出现反引号）。新组件写在 CSS Modules 里，不受 scale-ratchet 统计，但要补同等效力的新门禁（见契约）。
6. **示例模式**：`_demo/demo-mode-core.tsx` 的 `DemoModeProvider`（:72）、`DemoBanner`（:166）、`DemoNavPill`（:201）、`DemoInterceptLayer`（:126，`ORBIT_Z.modal`，:251）——新组件库的「示例角标 / 横条」要与它对接（拦截层沿用，视觉换成新组件）。
7. **设计规格（Web 专有部分）**：卡片圆角 22、内边距 20（`kit/ui.css:281`）；表格 `.table`（:283-287）；居中弹窗 `.wmodal` 宽 420 / 480 / 560、圆角 28、内边距 24，`.top` 距顶 96（:364-371）；抽屉 `.drawer` 四边留 14、宽 600、圆角 28（:374），1024 宽时内容多的 520、内容少的 380（RD-17）；弹出层 `.pop` 340–440、圆角 22、无遮罩；上下文菜单 200 / 圆角 18；Toast 堆叠 `.toast-stack` 右下 24、宽 420、最多 3 条（`ui.css:327-345`）；键盘提示 `.kbd` 高 20、圆角 6（:432-435）；悬停出现快捷按钮代替左滑（`01-system.html:227`）；遮罩 `--scrim-web` .22。通用组件规格与 App 相同（见 R04 PLANNER 第 6 条）。

## 上下文包

### 必读
- `kit/ui.css`、`kit/kit.js`、`01-system.html`（组件与交互规则）、`web.html`、`b8-responsive.html:1248-1259`（断点）、`IMPLEMENTATION-PLAN.md` §3.4–3.6。
- Web：`orbit-reference-styles.tsx:33-55, 594-611`、`orbit-z.ts`、`orbit-account-shell.tsx`（`ModalShell`、`useOrbitModalA11y`）、`_demo/demo-mode-core.tsx`、第 5 条列出的门禁测试、`next.config.*`。

### 关键符号与 impact（开工时重跑）
- `useOrbitModalA11y`、`ORBIT_Z`：只调用，不改。
- `DemoInterceptLayer` 等示例模式组件：本 Sprint 只新增视觉组件，不改拦截逻辑。

### 易错边界（全部写进 SC）
新作用域被包在旧作用域里（按钮重置生效）；CSS Modules 里写死颜色或数字层级；焦点在弹窗关闭后丢失；Esc 在嵌套弹层里关错层；Toast 堆叠超过 3 条；悬停快捷按钮在触屏上不可用（390 宽时要常显）；深色下抽屉阴影不可见；减少动效时仍有位移。

## 契约（本 Sprint 定稿，REPORT 交接）

- **目录**：`app/(app)/app/orbit-2026/ui/`，每个组件 `Name.tsx` + `Name.module.css`，统一由 `index.ts` 导出；作用域根组件 `<Orbit2026Scope>` 渲染 `data-orbit-2026` 并加载 R01 的 `tokens.css`。
- **组件**：与 R04 同名同语义（`Button`、`IconButton`、`Card`、`Chip`、`Avatar`、`AvatarStack`、`MacTile`、`ListRow`、`SearchField`、`TextField`、`Accordion`、`ToastProvider` / `useToast`、`ConfirmDialog`、`Modal`（420 / 480 / 560，`top` 变体）、`Drawer`（`size`: lg 600 / md 520 / sm 380，按断点）、`Popover`、`ContextMenu`、`ConfirmCard`、`WhyDisclosure`、`Toggle`、`CheckCircle`、`Checkbox`、`Radio`、`Segmented`、`FilterOption`、`CategoryTabs`、`ProgressBar`、`RingChart`、`CountUp`、`EmptyState`、`Skeleton`、`OfflineBar`、`RetryCard`、`DegradedCard`、`SampleTag` / `SampleBar`、`QuotaChip`、`Kbd`、`Table`）。App 的 `SwipeRow` 在 Web 对应 `ListRow` 的 `hoverActions`（390 宽以下常显）。
- **行为**：键盘可达、焦点可见、Esc 关最上层、弹窗锁焦点（`useOrbitModalA11y`）、关闭后焦点回到触发元素；层级只用 `ORBIT_Z`；`prefers-reduced-motion` 时只保留淡入；`Toast` 最多 3 条，出错不自动消失，撤销条不倒计时。
- **新门禁**：
  - `orbit-2026-css-tokens.test.ts`：`orbit-2026/**/*.module.css` 里禁止十六进制颜色和 `rgb()` 字面量（只能用 `var(--…)`）；`z-index` 只能是 `var(--z-*)`；圆角和字号只能用 token 变量。
  - `orbit-2026-scope.test.ts`：`data-orbit-2026` 不出现在 `data-orbit-real-page` 元素的内部（渲染断言）；新组件文件不 import 旧作用域的样式。
  - 按钮：新 `Button` 渲染的 `<button>` 带 `btn` 类（满足 `orbit-button-ratchet` 正则）。
- **展示页**：`/app/dev/components`，可切明暗、减少动效、三档宽度预览；在本地与预览 / staging 可见，正式环境返回 404（RD-15；用现有环境区分方式，开工时查明并写进 REPORT）。登录路由前缀、产品页面清单按需要登记（展示页若不应计入产品清单，写明排除方式）。

## 范围与文件

- 新建：`orbit-2026/ui/**`、`<Orbit2026Scope>`、展示页路由、上述新门禁与组件测试。
- 修改：仅在需要时修改 `next.config.*`（CSS Modules 默认可用，通常不需要）、示例模式组件对接点、产品页面清单生成脚本（排除展示页）。
- 测试：新增 `orbit-2026-ui-render.test.tsx`（每个组件：明暗对比度、焦点可见、键盘操作、减少动效）、`orbit-2026-toast.test.tsx`、`orbit-2026-modal.test.tsx`（焦点锁定与归还、Esc 层级）、两个新门禁；现有 `orbit-modal-standard`、`orbit-button-ratchet`、`orbit-z-scale` 保持通过。
- **不做**：导航壳（R07）；旧页面的任何改动；业务专用组件。

## 验收契约

| SC | 操作链 | 主证据 |
| --- | --- | --- |
| SC-R06-01 组件齐全且对得上设计 | 展示页列出全部组件和状态；与设计稿画板并排（1440 / 1024 / 390 × 浅色 / 深色） | 证据目录截图对照页 |
| SC-R06-02 键盘与无障碍 | Tab 顺序合理、焦点可见；Esc 关最上层；弹窗锁焦点、关闭后焦点归还；390 宽悬停按钮常显 | `orbit-2026-ui-render`、`orbit-2026-modal` + 键盘走查记录 |
| SC-R06-03 作用域干净 | 新作用域不在旧作用域内；新 CSS 里没有写死颜色、数字层级 | 两个新门禁 |
| SC-R06-04 反馈组件行为 | Toast 最多 3 条、出错常驻、撤销条不倒计时；抽屉按断点取 520 / 380 | `orbit-2026-toast` + 渲染测试 |
| SC-R06-05 展示页只在内部可见 | 本地 / staging 打开正常；模拟正式环境时 404 | 路由测试 |

### 必需证据子表

| SC | 子断言 | 证据 |
| --- | --- | --- |
| 01 | 「完成」用 `ok` 绿；深色 Toast 是深色胶囊 | 截图 + 渲染测试 |
| 02 | 减少动效时只剩淡入 | 渲染测试 |
| 03 | 现有 `orbit-button-ratchet`、`orbit-z-scale`、`orbit-modal-standard` 通过且计数没有上升 | 测试输出 |
| 全部 | 两端全量对照基线零新增失败（orbits 用 en-US 语言环境）；`tsc`、`typecheck:app`、`lint` 通过；`detect-changes` 写进 REPORT | 全量清单 |

## 执行顺序

1. 基线；确认 CSS Modules 在当前 Next 配置下可用；查环境区分方式。
2. 新门禁先写（RED）；作用域根组件。
3. 组件逐类实现（测试先行），展示页同步搭。
4. 截图对照并修正；键盘走查。
5. 全量、REPORT。

## 失败与交接

CSS Modules 与现有构建冲突：停下报告，不退回字符串写法（RD-18 已定）。REPORT 交接：组件清单和用法、作用域使用规则（新页面怎么进入新作用域、旧页面内容怎么放在新壳里）、新门禁说明、展示页入口。
