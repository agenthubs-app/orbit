# Sprint R02 — 图标源 + App 图标全量替换

**Plan revision:** 1。**模式:** existing-codebase / single-generator（执行人：小雨）。
**单一目标:** 建立 `repos/orbits/shared/design/icons.json` 与两端 `Icon` 组件；App 全部 Ionicons 换成新图标（缺的补画）；移除 `@expo/vector-icons` 的图标用法与依赖（若无其他用途）。
**易读目标:** [GOAL.md](GOAL.md)。
**基线:** R01 合入后的 `redesign` HEAD。
**进入条件:** R01 completed（`shared/design` 已在同步白名单，token 可用）。RD-10 已定。

## 已查清的事实（按 `9d404c1c8`）

1. **设计稿图标**：`docs/designs/redesign-2026-10/kit/kit.js:3-50` 的对象 `P`，值为 SVG 内部的 path / circle / rect 字符串；`window.ic(name, cls)`（:51）包成 `<svg class="i" viewBox="0 0 24 24" aria-hidden="true">`。共 48 个：home, users, calendar, target, sparkle, plus, search, filter, sliders, bell, right, left, down, more, scan, nfc, link, image, mic, pen, mail, phone, check, clock, pin, settings, inbox, chart, out, x, send, flag, grid, brief, refresh, moon, share, layers, route, ticket, user, book, edit, task, list, note, menu, star。
2. **样式规格**：`kit/ui.css:15` `stroke: currentColor; fill: none; stroke-width: 1.7`，圆头圆角；尺寸默认 20、`.sm` 16、`.lg` 24（:15-17），底栏 21（:104）。target、more、nfc、list 含 `fill="currentColor"` 的实心小点。
3. **补充图标**：`kit/ui.css:316-324` 用 CSS mask + data-URI 的 5 个：alert, trash, undo, wifioff, copy（替代 ⚠️、🗑️、↩︎，`01-system.html:643`）。
4. **规则**：`01-system.html:219` 功能图标 = 1.7 线性描边放在圆形浅底上；分类图标 = emoji 风小图标放在马卡龙方块里；`:187` emoji 只用于分类，按钮一律用线性图标。
5. **App 现状**：72 个文件使用 Ionicons（70 个文件 `import … from "@expo/vector-icons"`）；底栏图标单独用 react-native-svg 画（`src/components/OrbitNavigationIcon.tsx:12-17`）；`react-native-svg` 15.15.4 已安装。
6. **Web 现状**：旧页面多用自绘 SVG 或 emoji；RD-10 只要求 App 全量替换，Web 旧页面的图标随功能 Sprint 重做时更换。

## 上下文包

### 必读
- `kit/kit.js:3-64`、`kit/ui.css:15-17, 104, 316-324`、`01-system.html:187, 219, 643`。
- App：`OrbitNavigationIcon.tsx`、全部 Ionicons 使用点（`git grep -l "@expo/vector-icons" -- src app`）、`package.json`。
- Web：`app/(app)/app/orbit-2026/`（R01 建立）。

### 关键符号与 impact
- 每个改动的屏幕组件开工时跑 impact；Ionicons 本身是第三方，无图谱。
- `OrbitNavigationIcon`（HIGH 风险面：底栏）— 本 Sprint 只换图标来源，底栏结构在 R05 改。

### 易错边界
图标语义选错（比如把「删除」配成「关闭」）；补画的图标线宽或圆角和原图不一致；实心点图标在深色下不可见；图标作为唯一信息时缺少无障碍标签；移除依赖后某个页面运行时报错（静态 import 以外的动态引用）。

## 契约（本 Sprint 定稿，REPORT 交接）

- **`repos/orbits/shared/design/icons.json`**：`{ "<name>": { "body": "<svg 内部标记>", "fill": ["dot"...]?, "source": "kit" | "drawn" } }`，48 + 5 + 补画；mask 类图标改写成普通路径。由 R01 的生成脚本一并生成 `shared/design/icons.ts`（同步到 App `src/api/design/icons.ts`）。
- **App `src/components/ui/Icon.tsx`**：`<Icon name size? color? accessibilityLabel?>`，`size` 取 16 / 20 / 21 / 24，默认 20，`color` 默认当前文字色（取自 token），线宽 1.7。只有装饰作用时隐藏于无障碍树；作为唯一信息时必须传 `accessibilityLabel`。
- **Web `app/(app)/app/orbit-2026/ui/Icon.tsx`**：同名同参数，内联 SVG，`aria-hidden` 规则同上。
- **对照表** `R02-icons/icon-mapping.md`：每个 Ionicons 名 → 新图标名（或「补画：<名字>」），附使用位置数量。补画清单单独列出并附草图截图。

## 范围与文件

- 新建：`shared/design/icons.json`、生成的 `icons.ts`（两端）、两端 `Icon` 组件、两端图标展示页（App 开发包与 TestFlight 可见、Web 本地与 staging 可见，RD-15；若 R04 / R06 的组件展示页尚未建立，先建最小展示路由，R04 / R06 并入）、`R02-icons/icon-mapping.md`。
- 修改：App 72 个使用 Ionicons 的文件、`OrbitNavigationIcon.tsx`（改用 `Icon`）、`package.json`（移除依赖，前提是没有其他用途）、R01 的生成脚本（加图标）。
- 测试：新增 `icon-source-sync.test.ts`（两端副本与源一致）、`icon-render.test.tsx`（每个图标都能渲染、线宽与 viewBox 正确、深色可见）、`no-ionicons.test.ts`（扫描 src / app）。
- **不做**：Web 旧页面图标替换；组件库；底栏结构。

## 验收契约

| SC | 操作链 | 主证据 |
| --- | --- | --- |
| SC-R02-01 一份图标源 | 改 `icons.json` 一个图标 → 生成 + 同步 → 两端展示页同时变 | `icon-source-sync.test.ts` |
| SC-R02-02 App 全量替换 | App 代码里 0 处 Ionicons 引用，依赖已移除（或 REPORT 说明为何保留） | `no-ionicons.test.ts`、`package.json` diff |
| SC-R02-03 视觉一致 | 展示页全部图标（含补画）与设计稿 `kit` 并排截图，浅色 / 深色；补画图标与原图线宽、圆角一致 | 证据目录截图对照页 |
| SC-R02-04 页面抽查 | 模拟器里首页、人脉、联系人详情、活动、待办、AI、设置各截一张，图标语义正确、无缺失 | 截图 |

### 必需证据子表

| SC | 子断言 | 证据 |
| --- | --- | --- |
| 01 | 实心点图标（target、more、nfc、list）在深色下可见 | `icon-render.test.tsx` |
| 02 | 作为唯一信息的图标按钮都有无障碍标签 | 渲染测试 |
| 03 | 对照表经产品负责人在报告里过目（无需事先确认） | REPORT |
| 全部 | 两端全量对照基线零新增失败；`tsc` 通过；`detect-changes` 写进 REPORT | 全量清单 |

## 执行顺序

1. 基线；统计 Ionicons 使用点，出对照表和补画清单。
2. `icons.json` + 生成 + 两端 `Icon` + 展示页（RED → GREEN）。
3. 补画图标，展示页并排检查。
4. 逐文件替换 App 图标，移除依赖。
5. 截图、全量、REPORT。

## 失败与交接

某个图标找不到合适语义：在 REPORT 列出并补画，不得保留 Ionicons。REPORT 交接：图标名清单、`Icon` 组件用法、补画图标的命名与来源标记。
