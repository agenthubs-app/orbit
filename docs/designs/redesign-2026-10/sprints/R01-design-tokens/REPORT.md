# Sprint R01 — REPORT

**状态：执行完成，等待独立复核（`REVIEW.md`）和产品负责人看截图后合回 `redesign`。** 分支 `redesign-R01-design-tokens`（未推送）。执行人：小雨（执行会话），2026-10-09。PLANNER 最终版本：修订 3。

## 提交

| 提交 | 内容 |
| --- | --- |
| `33bf1ada` | token 源 `tokens.json`、生成脚本、生成产物、`design-tokens-generated` 测试、对照表初版 |
| `2de09e6d` | 对照表修订 2（把 0918 写死颜色纳入，后撤回） |
| `d3bf3d2c` | 修订 3：范围回到 token 层；新增 [`../screen-ownership.md`](../screen-ownership.md) |
| `0bd469d8` | 记录产品负责人确认；归属表 v2（R28 引导、R29 运营后台、落地页并入 R18、pipeline 由 R11 删除） |
| `cd4bf019` | App：同步副本、改名、主题选择、测试 |
| `92b35845` | Web：接入 tokens.css、删旧颜色层、改名、字体、主题选择、门禁 |
| `11750d67` | Web：0918 样式的写死中文字体栈改用 `var(--font)` |

## 确认记录（SC-R01-01）

| 日期 | 确认人 | 结论 | 修改意见 |
| --- | --- | --- | --- |
| 2026-10-09 | 产品负责人（小雨转达） | 确认对照表修订 3（`color-mapping.md` + 色块页 https://claude.ai/artifact/1HirHKmva3wLQhBt6BMoBu 第 3 版） | 无 |

确认前的过程：初版问题列表按「新旧合并」思路写，用户指出改版是 UI 换新；修订 2 曾把 0918 写死颜色纳入，用户进一步说明界面是全量按屏重写，修订 3 收回到 token 层，旧屏改由功能 Sprint 整屏重写（见归属表）。改名代码全部在确认之后提交。

## 验收

| SC | 结果 | 证据 |
| --- | --- | --- |
| 01 对照表经确认 | ✅ | 上表；`color-mapping.md` 末尾确认记录 |
| 02 一份源生成两端 | ✅ | `tests/ui/design-tokens-generated.test.ts`（生成文件与源逐字一致、两次渲染一致、手改即失败——证据目录 `sc02-checks.log`）；App `tests/design-sync.test.ts`（副本逐字一致、只同步 `tokens.ts`、`colors/darkColors` 即同步值）；`compute-sync` 白名单含 `design`；App `AGENTS.md` 已更新 |
| 03 对比度全部达标 | ✅ | Web `tests/ui/orbit-contrast-tokens.test.ts`（读浏览器实际拿到的 `tokens.css`，浅 / 深 / 系统深色兜底三块）；App `tests/design-tokens.test.ts`；源头 `design-tokens-generated.test.ts`。覆盖 ink / ink-2 / ink-3-text 在 bg / surface / surface-2 上，accent-text 在 accent-soft 上，五个马卡龙文字在各自底和 surface 上，coral-text、ok-text 在浅底和面上，on-accent、on-ok，浅色和深色都 ≥4.5:1；「每个 *-text 都被检查」也有断言 |
| 04 命名统一 | ✅ | App `tests/design-legacy-names.test.ts`（旧 key / 旧圆角 / 旧字号 + 写死颜色）；Web `tests/ui/design-tokens-legacy-names.test.ts`（旧 CSS 变量名，含生成的原型样式表）。已用注入样例验证两个扫描都能拦住旧名 |
| 05 现有页面不坏 | ✅（含已知例外） | 截图对照页 `~/orbit-sprint-evidence/redesign/R01/run-01/compare.html`（`compare.png`）：App 首页 / 人脉 / 活动 / 待办 / AI，Web 首页（iOrbit）/ 人脉 / 活动 / 设置 / 待办，改动前 `fa4294647` ↔ 改动后，浅 / 深各一张，同一本地测试账号与数据 |
| 06 字体与主题 | ✅ | Web：`tests/ui/design-fonts.test.ts`（只在根 layout 加载一次字体、无衬线 / 等宽旧字体、0918 不再写死中文字体、`--font` 跟随 `<html lang>`）；浏览器实测日 Hiragino Sans、中 PingFang SC、英系统字体（`after/web-after-report.json`、`web-settings-font-*.png`）；首屏主题实测：无存储时 body 出现即为系统明暗，无闪烁；`tests/ui/orbit-theme-preference.test.ts`（真实执行首屏脚本 + 自动 / 浅色 / 深色记住）。App：`tests/appearance-preference.test.tsx`（`Appearance.setColorScheme`、AsyncStorage 记住、设置页三选一真实渲染） |

### 必需证据子表

| SC | 子断言 | 结果 |
| --- | --- | --- |
| 02 | 生成脚本幂等 | ✅ 测试 + `sc02-checks.log`（两次 sha 相同） |
| 02 | 白名单含 `design`、`AGENTS.md` 已更新 | ✅ `compute-sync.test.ts`、`domain-sync.test.ts`、两端 `AGENTS.md` |
| 03 | 原值只做图形装饰的规则写进 README | ✅ `repos/orbits/shared/design/README.md` |
| 04 | App 写死颜色改 token 或说明 | ✅ 57 种全部处理，保留 2 处（见例外） |
| 05 | `theme-render` 按钮背景断言更新为新值 | ✅ light `rgb(30,26,36)` / dark `rgb(243,240,246)` |
| 06 | Web 只一个地方加载字体；Noto Serif SC 不再被引用 | ✅ `design-fonts.test.ts` |
| 全部 | 全量零新增失败、typecheck / lint、detect-changes | ✅ 见下 |

## 基线 → 收口（逐条对照）

基线细节见 `run-01/BASELINE.md`（PLANNER 写的「orbits 0 失败」与本机不同，差异全部来自环境）。

| 项目 | 基线 | 收口 |
| --- | --- | --- |
| App `npm test` | 4062 条，1 失败（route-parity `/start`），1 条负载超时 | 4074 条（+12 新测试），1 失败（同一条 route-parity） |
| App `tsc` | 0（补装已声明依赖后） | 0 |
| orbits `npm test` | 6811 条，7 失败（Node 26 弃用警告 ×5、`.next` 残留 ×1、偶发 ×1），872 跳过 | 6825 条（+14），6 失败（同一批环境失败，偶发那条通过），872 跳过 |
| orbits `typecheck` / `typecheck:app` | 各 8 个 `.next/types` 残留错误 | 相同 8 个 |
| orbits `lint` | 通过 | 通过 |

收口日志：`final-orbits-test.log`、`final-app-test.log`、`final-*-typecheck*.log`、`final-orbits-lint.log`。

偶发：App `tasks-unification-interactions`「suggestion next page…」在中间一轮全量里失败过一次，改动前后单独重跑分别为 3/3、5/6 通过，收口全量通过，属计时类偶发。

## GitNexus

- impact（改前）：`OrbitColors` CRITICAL（377）、`createThemedStyles` CRITICAL（215）、`useOrbitTheme` CRITICAL（336）、`createControlStyles` CRITICAL（386）、`getOrbitTheme` HIGH（5）；`colors` / `darkColors` / `themeInitScript` / `ORBIT_THEME_INIT_SCRIPT` / `ORBIT_0918_COLORS` 为 UNKNOWN，已用文本搜索确认（97 个文件引用 App tokens 等）。`orbit-reference-styles` 变量层按 PLANNER 视为 CRITICAL。记录：`impact-summary.txt`。
- 对策：App 改名一次完成（131 个文件 3,588 处，codemod + `tsc` 兜底 + 旧名扫描）；`createThemedStyles` / `useOrbitTheme` / `createControlStyles` 的签名与结构不变，只换取值；`getOrbitTheme` 签名和返回语义不变（仍返回生效的 light / dark），「自动」另加 `getOrbitThemePreference` / `setOrbitThemePreference`；Web 只改变量名和值，不改选择器结构；两端全量对照基线。
- detect-changes：App 提交前 critical（245 文件 / 580 符号 / 89 流程，全站改名的预期结果）；Web 提交前 102 文件 / 208 符号 / 64 流程；字体修正 14 文件 / 0 流程。记录：`detect-changes-commit*.txt`。

## 交接（契约）

- **源**：`repos/orbits/shared/design/tokens.json`。`color.usage` / `color.light` / `color.dark`（同序同键）、`color.contrast`（文字 × 底色对子清单，测试逐对检查）、`radius`、`space`、`font.family`（ja / zh / en / num）、`font.size`（display 38、number 22、title 24、title-sm 20、card-title 14.5、body 14、body-sm 13、label 11.5、caption 11）、`font.weight`、`font.line-height`、`shadow.float`、`motion`（ease + press / swipe / dialog / sheet / expand / toast-in / toast-out / enter / count / stagger / shimmer）。
- **生成**：`npm run design:tokens`（orbits）→ `shared/design/tokens.ts`（零 import，App 经 `npm run sync:contract` 复制到 `src/api/design/tokens.ts`）+ `app/(app)/app/orbit-2026/tokens.css`（根 layout import；浅色 `:root`，深色 `:root[data-theme="dark"]` 和「未选择 + 系统深色」）。
- **命名**：JSON / CSS 用连字符（`--ink-3-text`）；TS 去连字符驼峰、数字接后（`ink3Text`、`plum700`、`surface2`、`cardWeb`）。
- **文字加深版**：`ink-3-text`、`accent-text`、`mac-*-text`、`coral-text`、`ok-text`，加 `on-ok`；补齐项另有 `ok-soft`、`on-image`、`on-image-badge`、`scrim` / `scrim-web`。文字只用可读版，设计原值只做图形、装饰和 ≥18px 粗体（README）。
- **旧名改名表**：`repos/orbits/scripts/design-tokens/legacy-rename.mjs`（Web codemod、原型样式表生成、旧名扫描三处共用）。
- **主题**：Web 首屏脚本在 `app/(app)/app/orbit-theme-init.ts`；`localStorage["orbit-theme"]` 无值 = 自动。App 偏好在 `src/design/appearance.ts`（AsyncStorage `orbit:appearance:v1`）。

## 已知例外与偏差

- **0918 写死颜色**（PLANNER「不做」，修订 3）：Web 人脉 / 活动 / iOrbit / 个人 / 引导 / 主办等页面样式表里的十六进制保持旧样，深色下仍是 0918 浅色；每个旧屏的重写归属见 `screen-ownership.md`，逐值清单 `color-mapping-values.md` 留作参考。0918 的局部配色覆盖改名后有重复声明，已按原「主名字」的值去重（console-styles、event-registration-workspace、profile-legacy-settings）。
- **星空首页场景**：保留深色场景到 R21，变量块已换新名字；衬线 / 等宽字体已去掉，canvas 用具体无衬线字体栈（canvas 读不到 CSS 变量）。
- **Web 顶栏药丸**：0918 写死浅色，R07 换新左栏时删除。
- **App 保留的 2 处固定颜色**：`EventExperienceContent` 的四个活动强调色选项（主办方选的活动品牌色，存在活动配置里）；`batch-image-compressor.web.ts` 的 JPEG 画布白底。
- **内部 `/dev/**`**（`app/globals.css`、`shared/ui/theme.ts`）不改，扫描排除（归属表决定 12）。
- **0918 字体栈**：原计划只去衬线体；浏览器实测发现 0918 样式写死「Noto Sans SC」使日 / 英界面显示中文字形，按 RD-09 把这些字体栈（只动字体，不动颜色）改为 `var(--font)`。
- **分支名**：`redesign/R01-design-tokens` 与已有的 `redesign` 分支冲突（git 引用路径），改用 `redesign-R01-design-tokens`。后续 Sprint 建议同样用连字符。
- **测试基础设施**：orbits 测试启动器加 `scripts/test-css-stub.mjs`，让 Node 测试把 `.css` import 当空模块（根 layout 现在 import tokens.css）；Next 构建不受影响。
- **环境**：App 本地 `node_modules` 缺已声明的 `expo-image-manipulator`，`npm install` 补齐（lock 文件无变化）。
- **App 分类色**：头像底色、日程图例、分析色板按对照表「分类用马卡龙 / 数据图只用 plum·rose」改了；其余 `okText` / `coralText` 等状态色是机械改名，具体页面的语义复查在各功能 Sprint 重写时进行。

## 剩余

- 独立 AI 复核写 `REVIEW.md`；产品负责人看 `compare.html` 并试用后合回 `redesign`。
- 推送 Sprint 分支需用户同意。
- 下一个 Sprint：R02 图标。
