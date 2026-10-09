# shared/design — 设计 token 源

改版 2026-10 的颜色、圆角、间距、字体、阴影、动效只在这里定义一次，两端都由它生成。

| 文件 | 说明 |
| --- | --- |
| `tokens.json` | **唯一的源**。人只改这个文件。 |
| `tokens.ts` | 生成：零 import 常量，经 `npm run sync:contract` 复制到 App `src/api/design/tokens.ts`。 |
| `app/(app)/app/orbit-2026/tokens.css` | 生成：Web CSS 变量（浅色在 `:root`，深色在 `[data-theme="dark"]` 和「未选择 + 系统深色」）。 |
| `icons.json` | **图标的唯一源**（R02）。人只改这个文件。 |
| `icons.ts` | 生成：图标形状常量，零 import，和 `tokens.ts` 一起同步到 App `src/api/design/icons.ts`。 |

## 改一个值

1. 改 `tokens.json`。
2. `npm run design:tokens`（本仓库）。
3. 到 `repos/orbit-app` 跑 `npm run sync:contract`，把副本和源放进同一个提交。

生成文件第一行写着「禁止手改」；手改后 `tests/ui/design-tokens-generated.test.ts` 会失败。App 副本由 App 的 `design-sync` 测试守住。

## 命名

- 名字照搬设计稿 `docs/designs/redesign-2026-10/kit/tokens.css`（ink、surface、plum、rose、mac、coral、ok…）。
- JSON 和 CSS 用连字符：`ink-3-text` → `var(--ink-3-text)`。
- TS 去掉连字符改驼峰，数字直接接在后面：`ink-3-text` → `ink3Text`，`plum-700` → `plum700`，`surface-2` → `surface2`，`card-web` → `cardWeb`。

## 颜色规则（RD-05）

- **文字一律用可读版**：`ink`、`ink-2`、`ink-3-text`、`accent-text`、`mac-*-text`、`coral-text`、`ok-text`、`on-*`。`color.contrast` 里列出的每一对「文字 × 底色」在浅色和深色下都必须 ≥4.5:1，测试逐对检查；新增文字用法时把组合加进清单。**这是唯一一份清单**：生成脚本把它写进 `tokens.ts` 的 `designContrast`，Web（`tests/ui/orbit-contrast-tokens.test.ts`、`design-tokens-generated.test.ts`）和 App（`tests/design-tokens.test.ts`）都读它，不另写。
- **设计原值只用于图形和装饰**：`ink-3`、`ink-4`、`accent`、`mac-*-ink`、`coral`、`ok`、`plum-*`、`rose-*` 用于图标、圆点、环形图、进度条、分隔，或 ≥18px 的粗体大字。不要拿它们写正文、标签或按钮字。
- **`surface-3` 只做轨道、分隔、骨架**（设计稿定义为「轨道 / 分隔」），不承载正文。它上面万一要放字（计数小胶囊、只读输入框），只能用 `ink` 或 `ink-2`：`ink-3-text`、马卡龙文字色、`ok-text` 在浅色 `surface-3` 上都低于 4.5（`ink-3-text` 深色只有 3.96）。`color.contrast` 里 `surface-3` 只列了这两对，两端门禁按它扫描：
  - Web `tests/ui/design-surface-3-text.test.ts`：同一条 CSS 规则或同一个内联样式对象里，`background: var(--surface-3)` 配了清单外的 `color` 即失败（禁用状态按钮除外，WCAG 1.4.3 不要求）。
  - App `tests/design-surface-3-text.test.ts`：同一个样式对象里 `backgroundColor: colors.surface3` 配了清单外的 `color` 即失败。
  - 扫描看不到层叠（父元素 `surface-3` 底、子元素自己设文字色），这种情况靠代码复核按本条检查。
- 马卡龙底（`mac-*`）只占小面积：图标底、chip、迷你卡，不做整张卡底。
- 绿色（`ok` 系）只表示「完成」。
- 补齐项（设计稿没有、本源补上的）：`*-text` 加深版、`ok-soft`、`on-ok`、`on-image`、`on-image-badge`、`scrim` / `scrim-web`（原在 `kit/ui.css`）。

## 字体（RD-09）

`font.family` 四组：`ja`（Hiragino Sans / Noto Sans JP）、`zh`（PingFang SC / Noto Sans SC）、`en`（系统字体）、`num`（数字，SF Pro Rounded）。Web 按 `<html lang>` 切换 `--font`，未知语言回退日语；App 在 iOS 用系统字体，不打包字体。不使用衬线体。

## 图标（R02）

- `icons.json`：`{ "<名字>": { "body": "<svg 内部标记>", "fill": ["dot"]?, "source": "kit" | "drawn" } }`。`kit` 是设计稿原图（`kit/kit.js` 的 48 个 + `kit/ui.css` 的 5 个补充图标，逐字照搬）；`drawn` 是 R02 按同样风格补画的。`fill: ["dot"]` 标记含实心小点（`fill="currentColor"`）的图标。
- 画法规格（照 `kit/ui.css:15`）：24 × 24 视框，描边 1.7，圆头圆角，不填充；尺寸只有 16 / 20（默认）/ 21（底栏）/ 24。`body` 只能用 `path`（`d`、`stroke-dasharray`）、`circle`、`rect` 和 `fill="currentColor"`，生成脚本遇到别的标记直接报错。
- 用法：App `src/components/ui/Icon.tsx`、Web `app/(app)/app/orbit-2026/ui/Icon.tsx`，都是 `<Icon name size? color? accessibilityLabel? />`。颜色默认跟随文字色（App 取主题 `ink`，Web 取 `currentColor`），实心点和描边同色；只做装饰时对读屏隐藏，图标单独表达意思（只有图标的按钮）时必须传 `accessibilityLabel`。
- 功能图标用线性图标、放在圆形浅底上；emoji 只用于分类（`01-system.html:187, 219`）。
- 加一个图标：先查 `docs/designs/redesign-2026-10/sprints/R02-icons/icon-mapping.md`，确实没有再按上面的规格画，`source: "drawn"`，在对照表补一行，然后跑 `npm run design:tokens` 和 App `npm run sync:contract`。展示页：Web `/showcase/icons`，App `/showcase/icons`（开发包和 TestFlight）。
