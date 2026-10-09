# Sprint R02 — 图标源 + 两端 Icon 组件

**Plan revision:** 2（2026-10-09：按用户决定收窄范围。修订 1 要在骨架里替换 App 72 个文件的 Ionicons 并移除依赖；这些旧屏之后都会被功能 Sprint 整屏重写并删除，见 RD-24，所以改为「旧屏原样保留，新代码禁止用 Ionicons，依赖在最后一个旧屏删除时移除」）。**模式:** existing-codebase / single-generator（执行人：小雨）。
**单一目标:** 建立 `repos/orbits/shared/design/icons.json`、两端 `Icon` 组件和图标展示页；导航壳用的图标改用新图标；用门禁保证新代码不再引入 Ionicons，旧屏里的 Ionicons 只减不增。
**易读目标:** [GOAL.md](GOAL.md)。
**基线:** R01 合入后的 `redesign` HEAD（`10e0a35a`）。
**进入条件:** R01 completed（`shared/design` 已在同步白名单，token 可用）。RD-10（修订）、RD-24 已定。

## 已查清的事实（按 `9d404c1c8`）

1. **设计稿图标**：`docs/designs/redesign-2026-10/kit/kit.js:3-50` 的对象 `P`，值为 SVG 内部的 path / circle / rect 字符串；`window.ic(name, cls)`（:51）包成 `<svg class="i" viewBox="0 0 24 24" aria-hidden="true">`。共 48 个：home, users, calendar, target, sparkle, plus, search, filter, sliders, bell, right, left, down, more, scan, nfc, link, image, mic, pen, mail, phone, check, clock, pin, settings, inbox, chart, out, x, send, flag, grid, brief, refresh, moon, share, layers, route, ticket, user, book, edit, task, list, note, menu, star。
2. **样式规格**：`kit/ui.css:15` `stroke: currentColor; fill: none; stroke-width: 1.7`，圆头圆角；尺寸默认 20、`.sm` 16、`.lg` 24（:15-17），底栏 21（:104）。target、more、nfc、list 含 `fill="currentColor"` 的实心小点。
3. **补充图标**：`kit/ui.css:316-324` 用 CSS mask + data-URI 的 5 个：alert, trash, undo, wifioff, copy（替代 ⚠️、🗑️、↩︎，`01-system.html:643`）。
4. **规则**：`01-system.html:219` 功能图标 = 1.7 线性描边放在圆形浅底上；分类图标 = emoji 风小图标放在马卡龙方块里；`:187` emoji 只用于分类，按钮一律用线性图标。
5. **App 现状**：72 个文件使用 Ionicons（70 个文件 `import … from "@expo/vector-icons"`），几乎全在旧屏里（归属见 `../screen-ownership.md`）；底栏图标单独用 react-native-svg 画（`src/components/OrbitNavigationIcon.tsx:12-17`）；`react-native-svg` 15.15.4 已安装。
6. **Web 现状**：旧页面多用自绘 SVG 或 emoji，随功能 Sprint 重写时更换。

## 上下文包

### 必读
- `kit/kit.js:3-64`、`kit/ui.css:15-17, 104, 316-324`、`01-system.html:187, 219, 643`。
- `../README.md` 的 RD-10、RD-24；`../screen-ownership.md`（哪些文件是旧屏）。
- App：`OrbitNavigationIcon.tsx`、`package.json`、Ionicons 使用点清单（`git grep -l "@expo/vector-icons" -- src app`，只统计，不改）。
- Web：`app/(app)/app/orbit-2026/`（R01 建立）。

### 关键符号与 impact
- `OrbitNavigationIcon`（底栏，HIGH 风险面）— 本 Sprint 只换图标来源，底栏结构在 R05 改。
- 生成脚本 `scripts/design-tokens/generate.mjs`（R01 建立）— 加图标输出时不得改变 token 产物（R01 的逐字一致测试兜底）。

### 易错边界
图标语义选错（比如把「删除」配成「关闭」）；补画的图标线宽或圆角和原图不一致；实心点图标在深色下不可见；图标作为唯一信息时缺少无障碍标签；门禁扫描范围写错，误拦旧屏或漏拦新代码。

## 契约（本 Sprint 定稿，REPORT 交接）

- **`repos/orbits/shared/design/icons.json`**：`{ "<name>": { "body": "<svg 内部标记>", "fill": ["dot"...]?, "source": "kit" | "drawn" } }`，48 + 5 + 补画；mask 类图标改写成普通路径。由 R01 的生成脚本一并生成 `shared/design/icons.ts`（同步到 App `src/api/design/icons.ts`）。
- **App `src/components/ui/Icon.tsx`**：`<Icon name size? color? accessibilityLabel?>`，`size` 取 16 / 20 / 21 / 24，默认 20，`color` 默认当前文字色（取自 token），线宽 1.7。只有装饰作用时隐藏于无障碍树；作为唯一信息时必须传 `accessibilityLabel`。
- **Web `app/(app)/app/orbit-2026/ui/Icon.tsx`**：同名同参数，内联 SVG，`aria-hidden` 规则同上。
- **对照表** `R02-icons/icon-mapping.md`：每个 Ionicons 名 → 新图标名（或「补画：<名字>」），附使用位置数量。这份表**给功能 Sprint 重写旧屏时查用**；补画清单按全部 Ionicons 用法一次画齐，功能 Sprint 不再各自补画。
- **Ionicons 门禁（ratchet）**：
  - 新代码零容忍：`src/components/ui/**`、导航壳文件，以及之后功能 Sprint 新建的屏幕目录，不得 import `@expo/vector-icons`（扫描范围用「允许旧用法的文件清单」反向定义，见下一条）；
  - 旧屏只减不增：开工时把现有 72 个文件记成允许清单 `tests/fixtures/ionicons-legacy-allowlist.json`；清单里的文件删掉后测试要求从清单移除；清单外的文件出现 Ionicons 即失败；
  - 清单清空时，测试要求同时移除 `@expo/vector-icons` 依赖。这一步由删掉最后一个旧屏的功能 Sprint 完成，合回 `chat-agent` 前的总验收核对（RD-24）。

## 范围与文件

- **新建**：`shared/design/icons.json`、生成的 `icons.ts`（两端）、两端 `Icon` 组件、两端图标展示页（App 开发包与 TestFlight 可见、Web 本地与 staging 可见，RD-15；若 R04 / R06 的组件展示页尚未建立，先建最小展示路由，R04 / R06 并入）、`R02-icons/icon-mapping.md`、Ionicons 允许清单。
- **修改**：`OrbitNavigationIcon.tsx`（改用 `Icon`）、R01 的生成脚本（加图标）。
- **测试**：新增 `icon-source-sync.test.ts`（两端副本与源一致）、`icon-render.test.tsx`（每个图标都能渲染、线宽与 viewBox 正确、深色可见）、`ionicons-ratchet.test.ts`（规则见契约）。
- **不做**：旧屏的图标替换（各功能 Sprint 整屏重写时一并换，见 `../screen-ownership.md`）；移除 Ionicons 依赖（清单清空时）；Web 旧页面图标；组件库；底栏结构。

## 验收契约

| SC | 操作链 | 主证据 |
| --- | --- | --- |
| SC-R02-01 一份图标源 | 改 `icons.json` 一个图标 → 生成 + 同步 → 两端展示页同时变 | `icon-source-sync.test.ts` |
| SC-R02-02 Ionicons 只减不增 | 在一个新组件里 import Ionicons → 测试失败；在允许清单外的旧文件里新增 → 失败；删掉清单内文件不移出清单 → 失败 | `ionicons-ratchet.test.ts`（含注入样例验证） |
| SC-R02-03 视觉一致 | 展示页全部图标（含补画）与设计稿 `kit` 并排截图，浅色 / 深色；补画图标与原图线宽、圆角一致 | 证据目录截图对照页 |
| SC-R02-04 导航壳图标 | 模拟器里底栏图标来自新图标源，选中 / 未选中、浅色 / 深色正确 | 截图 |

### 必需证据子表

| SC | 子断言 | 证据 |
| --- | --- | --- |
| 01 | 实心点图标（target、more、nfc、list）在深色下可见 | `icon-render.test.tsx` |
| 01 | 加图标后 R01 的 token 生成产物逐字不变 | `design-tokens-generated.test.ts` |
| 02 | 作为唯一信息的图标按钮都有无障碍标签（`Icon` 组件层面） | 渲染测试 |
| 03 | 对照表覆盖全部 Ionicons 用法；补画清单一次画齐；产品负责人在报告里过目（无需事先确认） | `icon-mapping.md`、REPORT |
| 全部 | 两端全量对照基线零新增失败；`tsc` 通过；`detect-changes` 写进 REPORT | 全量清单 |

## 执行顺序

1. 基线；统计 Ionicons 使用点，出对照表和补画清单，生成允许清单。
2. `icons.json` + 生成 + 两端 `Icon` + 展示页（RED → GREEN）。
3. 补画图标，展示页并排检查。
4. `OrbitNavigationIcon` 改用 `Icon`；接上 ratchet 门禁。
5. 截图、全量、REPORT。

## 失败与交接

某个 Ionicons 用法找不到合适语义：在对照表里列出并补画，功能 Sprint 直接用。REPORT 交接：图标名清单、`Icon` 组件用法、补画图标的命名与来源标记、ratchet 门禁的规则与允许清单位置。
