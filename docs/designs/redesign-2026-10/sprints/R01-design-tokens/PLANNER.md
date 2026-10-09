# Sprint R01 — 设计源：一份 token 源生成两端，新配色覆盖旧配色

**Plan revision:** 3（2026-10-09：修订 2 纳入 0918 写死颜色，已按用户决定撤回，范围回到修订 1）。**模式:** existing-codebase / single-generator（执行人：小雨）。
**单一目标:** 建立 `repos/orbits/shared/design/tokens.json`（含补齐项与文字加深版），生成两端 token 文件；两端所有颜色引用改用设计稿命名并取新值；字体按语言切换；默认主题跟随系统。
**易读目标:** [GOAL.md](GOAL.md)。
**基线:** `redesign` HEAD（编制时 `9d404c1c8`），开工时按符号重新定位行号。
**进入条件:** 无前置 Sprint。RD-05、RD-06、RD-07、RD-08、RD-09 已定。

## 已查清的事实（按 `9d404c1c8`）

1. **设计稿 token**：`docs/designs/redesign-2026-10/kit/tokens.css` 浅色在 `:root,[data-theme="light"]`（:5-69），深色在 `[data-theme="dark"]`（:71-113）。颜色：`--bg --fog-a/b/c --surface --surface-2 --surface-3 --line --glass --glass-line --ink --ink-2 --ink-3 --ink-4 --plum-900/700/500/300/100 --rose-700/500/300/100 --accent --accent-soft --on-accent --mac-{pink,apricot,blue,teal,lav} --mac-*-ink --coral --coral-soft --ok`。另有 `--r-xl 24 --r-lg 20 --r-md 14 --r-sm 10 --gap 14 --ease cubic-bezier(.2,.8,.2,1) --font --font-num --shadow-float`；遮罩 `--scrim .28 / --scrim-web .22`（深色 .55）在 `kit/ui.css:310-311`。
2. **设计稿缺口**：没有字号、字重 token，层级只写在 `01-system.html:204-208`（Big Number 38–46/800、Title 20–26/800、Card title 14.5/800、Body 13–14/500–700、Label 11.5/500）；`ui.css` 写死的圆角：sheet 34、dialog / wmodal / drawer 28、Web 卡片和首页组件 22、气泡 / 左滑 18、胶囊 999；动效时长写在 `01-system.html:223-232`（150 / 300 / 320 / 350 / 450 / 600 / 1100–1200ms）。
3. **对比度不达标**（`IMPLEMENTATION-PLAN.md:586, 845`）：`ink-3` 在 `surface-2` 上 2.54:1；马卡龙文字色 3.86–4.47:1；`coral` 在 `coral-soft` 上 2.14:1。深色下 `.step.done` 白字在 `--ok` 上也偏低（推断）。
4. **App 现状**：`repos/orbit-app/src/design/tokens.ts`（171 行）导出 `colors`（37 key，:1-39）、`darkColors`（:44-81）、`radius`、`spacing`、`typography`、`layout`、`textStyles`、`rowRoleStyles`、`shadows`（全为 `boxShadow:"none"`）。`theme.ts` 的 `useOrbitTheme()` / `createThemedStyles()` 无 Provider，直接读 `useColorScheme()`；用法：`createThemedStyles` 108 文件、`useOrbitTheme` 43、`createControlStyles` 50、import `design/tokens` 95；另有 22 处写死的 6 位 hex。没有手动切换明暗的功能。
5. **App 相关测试**：`tests/design-tokens.test.ts`（:13-36 两套各 13 组对比度 ≥4.5；:38-44 圆角与字号关系；:46-54 阴影必须用 `boxShadow`）；`tests/theme-wiring.test.ts`（:8 `userInterfaceStyle` 必须 `automatic`；:15-32 `.tsx` 不得以值方式 import `colors`）；`tests/theme-render.test.tsx`（:128-131 断言「重试」按钮背景 light `rgb(11,18,32)` / dark `rgb(240,240,236)`，换色后必须更新为新值）。
6. **Web 现状**：颜色分散在 5 处——`app/(app)/app/orbit-reference-styles.tsx:1910` 起的暗色变量重映射（`--r-*` :1955-1960、`--z-*` :2019-2024、`--ff*` :2031-2040、英文 `--ff-display` :2060）；`orbit-theme.tsx:22+` 的浅色主题；`orbit-0918-tokens.ts:8-53`；`app/layout.tsx:19-27` 的 `--orbit-*`；`shared/ui/theme.ts`（只有 dev 页用）。`app/layout.tsx:287,305` 的 `themeInitScript` 默认深色。`app/(app)/app/` 下约 4,302 处写死 hex（73 个文件），集中在 0918 各域样式表。
7. **Web 字体**：`/iorbit-starfield/fonts/desktop.css`（Noto Sans SC、Noto Serif SC、Newsreader、JetBrains Mono）在 `app/(app)/app/layout.tsx:36` 与 `orbit-starfield-desktop.tsx:49` 加载；Google Fonts 在 4 处重复插入：`orbit-public-shell.tsx:401-404`、`orbit-landing-0918.tsx:445`、`profile/onboarding-0918/onboarding-flow.tsx:419`、`events/events-0918/event-register-modal.tsx:112`。
8. **Web 相关门禁**：`tests/ui/orbit-contrast-tokens.test.ts`（:109-184，正则读 reference styles 与 orbit-theme 的变量算对比度）、`orbit-z-scale`（:40-60 断言 6 个 `--r-*` 值）、`orbit-p2-gates.test.ts:45-49`（`--ff-serif: 'Noto Serif SC'`）、`orbit-a11y-runtime-mounted.test.ts:19-30`（layout 含 desktop.css link）、`orbit-settings-theme`、`orbit-html-lang`。
9. **同步**：`repos/orbit-app/scripts/sync-contract.mjs:19-41` 只同步 `contract`、`api-schema`、`domain`（两个字典）、`compute`；`tests/compute-sync.test.ts:62-99` 断言 `src/api` 下只有这 4 个目录；`domain-sync` / `compute-sync` 在临时目录跑脚本，缺源目录会抛错；`repos/orbit-app/AGENTS.md:6-13` 写着「Do not broaden that whitelist」（RD-08 已授权放宽）。

## 上下文包

### 必读
- 设计：`kit/tokens.css`、`kit/ui.css`（:15-17 图标尺寸、:146-149 chip、:161-167 按钮、:310-312 scrim）、`01-system.html`（:187 分层原则、:204-232 字号层级与动效、:496 chip 不只靠颜色、:593 绿色只表示完成）、`IMPLEMENTATION-PLAN.md` §3.1。
- App：`src/design/{tokens,theme,controls}.ts`、上述三个测试、`scripts/sync-contract.mjs`、`AGENTS.md`、`app.config.*`。
- Web：`orbit-reference-styles.tsx`（:1910-2060）、`orbit-theme.tsx`、`orbit-0918-tokens.ts`、`app/layout.tsx`、`app/(app)/app/layout.tsx`、`scripts/build-reference-css.mjs`、上述门禁测试。

### 关键符号与 impact（开工时重跑）
- App `colors` / `darkColors` / `OrbitColors`（`src/design/tokens.ts`）— 95 个文件 import，按 HIGH 处理；`createThemedStyles` 108 处、`createControlStyles` 50 处。**改名必须一次完成，typecheck 兜底。**
- Web `orbit-reference-styles.tsx` 的变量层 — 约 41 个测试文件提到 `data-orbit-real-page`，按 CRITICAL 处理；本 Sprint 只改变量名和值，不改选择器结构。
- `themeInitScript`（`app/layout.tsx`）— 每个页面都执行，HIGH。

### 易错边界（全部写进 SC）
对照表未经确认就改名；生成文件被手改；只改了浅色忘了深色；对比度测试只测部分组合；旧名字残留在测试或注释以外的代码里；Web 删除 Noto Serif SC 后有页面丢字体；默认主题改动导致首屏闪烁；App 副本被直接修改而不是同步。

## 契约（本 Sprint 定稿，REPORT 交接）

- **源文件 `repos/orbits/shared/design/tokens.json`**，结构：
  - `color.light` / `color.dark`：设计稿全部颜色 + **文字加深版**（建议命名 `ink-3-text`、`mac-*-text`、`coral-text`，开工时在对照表里定名），每个颜色带用途说明；
  - `radius`：`xl 24 / lg 20 / md 14 / sm 10 / sheet 34 / dialog 28 / card-web 22 / bubble 18 / pill 999`；
  - `space`：`gap 14` + 组件内边距用到的刻度（4 / 8 / 12 / 14 / 16 / 18 / 20 / 22 / 24 / 26 / 34）；
  - `font.family`：`ja` / `zh` / `en` / `num` 四组字体栈（RD-09）；`font.size`、`font.weight`、`font.lineHeight`：按 `01-system.html:204-208` 定层级名（如 `display`、`title`、`cardTitle`、`body`、`label`、`caption`），具体数值写进 JSON；
  - `shadow.float`、`scrim.app` / `scrim.web`；`motion.ease` 与 `motion.duration.{press,expand,swipe,count,enter,sheet,dialog,toastIn,toastOut}`。
- **生成脚本** `repos/orbits/scripts/design-tokens/generate.mjs`（`npm run design:tokens`），产物（文件头写「由 tokens.json 生成，禁止手改」）：
  - `repos/orbits/shared/design/tokens.ts`：纯常量（零 import），经同步进入 App `src/api/design/tokens.ts`；
  - Web 变量文件 `app/(app)/app/orbit-2026/tokens.css`：`:root` 浅色 + `@media (prefers-color-scheme: dark)` 和 `[data-theme="dark"]` 深色；
  - App `src/design/tokens.ts` 改为从同步副本取值，再组装 RN 专用结构（`textStyles` 等）。
- **命名**：两端代码里的颜色、圆角、字号引用全部换成设计稿名字（RD-06）。App 的 `colors.text2` → `colors.ink2`（键名风格按 TS 惯例去掉连字符，规则写进 REPORT），Web 的 `var(--text-2)` → `var(--ink-2)`。不保留旧名字。
- **对照表**：`docs/designs/redesign-2026-10/sprints/R01-design-tokens/color-mapping.md` + 一个色块对照页（截图放证据目录）。列出 App 37 个旧 key、Web 各层旧变量 → 新名字 + 新值 + 用途。没有一对一对应的（如 App `live`、`amber`、`sky`）写明选择理由。**产品负责人确认后才执行改名**，确认记录写进 REPORT。
- **字体**：Web 按 `<html lang>` 切换字体栈（ja → Hiragino Sans / Noto Sans JP，zh-CN → PingFang SC / Noto Sans SC，en → 系统字体）；Noto Sans JP 用 Google Fonts，只加载 400 / 500 / 700 / 800，并在一个地方加载（删掉 4 处重复）；删除 Noto Serif SC 和 Newsreader 的使用。App 在 iOS 用系统字体（日文环境即 Hiragino），不打包字体。
- **默认主题**：Web `themeInitScript` 改为无用户设置时跟随 `prefers-color-scheme`；两端设置页提供 自动 / 浅色 / 深色，App 用 `Appearance.setColorScheme` 实现手动切换并持久化。

## 范围与文件

- 新建：`repos/orbits/shared/design/{tokens.json,tokens.ts,README.md}`、`scripts/design-tokens/generate.mjs`、`app/(app)/app/orbit-2026/tokens.css`、`R01-design-tokens/color-mapping.md`；App `src/api/design/tokens.ts`（同步副本）。
- 修改：App `src/design/{tokens,theme,controls}.ts`、所有引用旧颜色名的文件、`scripts/sync-contract.mjs`、`AGENTS.md`、设置页（主题选项）；Web `orbit-reference-styles.tsx` 变量层、`orbit-theme.tsx`、`orbit-0918-tokens.ts`、`app/layout.tsx`、`app/(app)/app/layout.tsx`、字体加载点、设置页、`scripts/build-reference-css.mjs`（如需改名映射）。
- 测试：更新 App `design-tokens`、`theme-render`、`compute-sync`、`domain-sync`；新增 `design-sync.test.ts`；Web 更新 `orbit-contrast-tokens`、`orbit-z-scale`、`orbit-p2-gates`、`orbit-a11y-runtime-mounted`、`orbit-settings-theme`；新增 `design-tokens-generated.test.ts`。
- **不做**：图标（R02）、文案（R03）、组件（R04 / R06）、导航（R05 / R07）。**0918 各域样式表里写死的 hex 不在本 Sprint 范围**：改版是按屏替换（`IMPLEMENTATION-PLAN.md` §0.1「边界 B」），这些页面会在功能 Sprint 里整屏重写并删除，现在逐处改色是白做。骨架期间它们挂在新壳里保持旧颜色，是已知结果；每个旧屏由哪个功能 Sprint 重写见 [`../screen-ownership.md`](../screen-ownership.md)。（修订 2 曾纳入，修订 3 按用户决定撤回。）

## 验收契约

| SC | 操作链 | 主证据 |
| --- | --- | --- |
| SC-R01-01 对照表经确认 | 出 `color-mapping.md` 与色块对照页 → 产品负责人确认 → 才开始改名 | REPORT 的确认记录（日期、确认人、修改意见） |
| SC-R01-02 一份源生成两端 | 改 `tokens.json` 一个颜色 → 跑 `npm run design:tokens` 和 `sync:contract` → 两端同时变；手改任一生成文件 → 测试失败 | `design-tokens-generated.test.ts`、App `design-sync.test.ts` |
| SC-R01-03 对比度全部达标 | 两端测试覆盖所有「文字 × 底色」组合（ink / ink-2 / 加深版 ink-3 在 bg / surface / surface-2 上；马卡龙文字在对应马卡龙底上；coral 文字在 coral-soft 上；on-accent 在 accent 上；成功文字在 ok 相关底上），浅色和深色都 ≥4.5:1 | App `design-tokens.test.ts`、Web `orbit-contrast-tokens.test.ts` |
| SC-R01-04 命名统一 | 两端代码里没有旧颜色名（测试夹具和本 Sprint 的对照表除外） | 静态扫描测试（旧名清单来自对照表） |
| SC-R01-05 现有页面不坏 | App 首页、人脉、活动、待办、AI；Web 首页（iOrbit）、人脉、活动、设置、待办；各截浅色 / 深色，前后并排 | 证据目录截图对照页；REPORT 列出已知例外（0918 写死颜色，按 screen-ownership.md 归属功能 Sprint） |
| SC-R01-06 字体与主题 | 日 / 中 / 英三种界面字体正确；Web 首次访问跟随系统明暗、无闪烁；两端设置可切 自动 / 浅色 / 深色并记住 | 页面测试 + 截图 |

### 必需证据子表

| SC | 子断言 | 证据 |
| --- | --- | --- |
| 02 | 生成脚本幂等（连续跑两次无差异） | 测试 |
| 02 | `compute-sync` 的目录白名单含 `design`；`AGENTS.md` 同步说明已更新 | 测试 + diff |
| 03 | 设计原值只用于图形和装饰的规则写进 `shared/design/README.md` | 文档 |
| 04 | App 22 处写死 hex 改用 token 或在 REPORT 说明保留原因（如品牌图） | 扫描结果 |
| 05 | `theme-render` 的按钮背景断言更新为新值并通过 | 测试 |
| 06 | Web 只有一个地方加载字体；Noto Serif SC 不再被引用 | 扫描测试 |
| 全部 | 两端全量对照基线零新增失败；`tsc`、`typecheck:app`、`lint` 通过；`detect-changes` 结果写进 REPORT | 全量清单 |

## 执行顺序

1. 记录基线；对 `colors`、`createThemedStyles`、`orbit-reference-styles` 变量层、`themeInitScript` 跑 impact。
2. 写 `tokens.json`（含加深版，先算好对比度）和生成脚本（RED → GREEN）。
3. 出对照表和色块页，**停下来等产品负责人确认**。
4. 确认后：App 改名并接入同步副本；Web 改名并接入新变量文件；改字体加载；改默认主题与设置。
5. 截图对照、全量、REPORT。

## 失败与交接

对照表未确认：只能完成第 2 步，不改名、不合并。REPORT 交接：`tokens.json` 结构与命名规则、生成命令、文字加深版的名字和用途规则、对照表最终版、已知例外清单（0918 写死颜色所在文件）。
