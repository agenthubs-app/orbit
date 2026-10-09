# shared/design — 设计 token 源

改版 2026-10 的颜色、圆角、间距、字体、阴影、动效只在这里定义一次，两端都由它生成。

| 文件 | 说明 |
| --- | --- |
| `tokens.json` | **唯一的源**。人只改这个文件。 |
| `tokens.ts` | 生成：零 import 常量，经 `npm run sync:contract` 复制到 App `src/api/design/tokens.ts`。 |
| `app/(app)/app/orbit-2026/tokens.css` | 生成：Web CSS 变量（浅色在 `:root`，深色在 `[data-theme="dark"]` 和「未选择 + 系统深色」）。 |

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

- **文字一律用可读版**：`ink`、`ink-2`、`ink-3-text`、`accent-text`、`mac-*-text`、`coral-text`、`ok-text`、`on-*`。`color.contrast` 里列出的每一对「文字 × 底色」在浅色和深色下都必须 ≥4.5:1，测试逐对检查；新增文字用法时把组合加进清单。
- **设计原值只用于图形和装饰**：`ink-3`、`ink-4`、`accent`、`mac-*-ink`、`coral`、`ok`、`plum-*`、`rose-*` 用于图标、圆点、环形图、进度条、分隔，或 ≥18px 的粗体大字。不要拿它们写正文、标签或按钮字。
- 马卡龙底（`mac-*`）只占小面积：图标底、chip、迷你卡，不做整张卡底。
- 绿色（`ok` 系）只表示「完成」。
- 补齐项（设计稿没有、本源补上的）：`*-text` 加深版、`ok-soft`、`on-ok`、`on-image`、`on-image-badge`、`scrim` / `scrim-web`（原在 `kit/ui.css`）。

## 字体（RD-09）

`font.family` 四组：`ja`（Hiragino Sans / Noto Sans JP）、`zh`（PingFang SC / Noto Sans SC）、`en`（系统字体）、`num`（数字，SF Pro Rounded）。Web 按 `<html lang>` 切换 `--font`，未知语言回退日语；App 在 iOS 用系统字体，不打包字体。不使用衬线体。
