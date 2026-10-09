# Sprint R01 — REVIEW（独立复核）

**复核人：** 独立 AI 复核会话（不是执行人），2026-10-09。
**对象：** `fa429464..10e0a35a`（PR #1 合入 `redesign`），在 `redesign` HEAD `22174671` 上复核。
**依据：** PLANNER 修订 3（唯一契约）、README 通用规则 1 / 3 / 6 / 8、RD-05～RD-09、RD-24、RD-25。REPORT 只作为线索，下面每条都是复核人重新跑或重新读出来的。

## 结论：有条件通过

SC-R01-01～06 的主体都已实现，门禁是真的能拦住问题，两端全量对照基线零新增失败。但有 **2 条中等问题**，其中一条直接违反 RD-05「所有文字 × 底色 ≥4.5:1」（对比度清单漏了 `surface-3` 这块底色，现有代码里已有两处不达标）；另一条是旧名门禁把两个设计稿名字（`--accent`、`--scrim`）也当成旧名禁掉，R06 写新组件时会被误拦。

**条件：** M1、M2 在 `redesign` 上修完（RD-25）后 R01 视为完成；R02 可以同时开工，两者不改同一批文件。轻微问题可以随手修，也可以留给后续 Sprint。

没有严重问题。

## 逐 SC 核实

| SC | 结论 | 复核人做了什么 / 证据 |
| --- | --- | --- |
| 01 对照表经确认 | ✅ | REPORT 和 `color-mapping.md` 末尾有确认记录（2026-10-09，产品负责人经小雨转达，对照表修订 3，无修改意见）。提交顺序核对：改名提交 `cd4bf019`、`92b35845` 都在确认记录提交 `0bd469d8` 之后。确认是转述，复核人无法独立核实本人确认，只能核实记录存在且早于改名。 |
| 02 一份源生成两端 | ✅ | **端到端实测**：把 `tokens.json` 的 `ink-3-text` 改成 `#6F6677` → `npm run design:tokens` → App `npm run sync:contract` → Web `tokens.css`、App 副本 `src/api/design/tokens.ts` 都出现新值，`import("src/design/tokens")` 得到 `colors.ink3Text = #6F6677`，`design-sync` 3/3 通过。**手改拦截**：手改 `tokens.css` → `design-tokens-generated` 1 条失败（「stale or hand-edited」）；手改 `shared/design/tokens.ts` → 同测试 1 条失败；手改 App 副本 → `design-sync` 1 条失败（「edited by hand or is stale」）。**幂等**：连跑两次 `design:tokens` + 一次 `sync:contract`，`git status` 无变化。白名单：`compute-sync`/`domain-sync` 含 `design`；App `AGENTS.md` 已改（RD-08）。验证后全部 `git checkout` 还原。 |
| 03 对比度全部达标 | ⚠️ 部分 | 三处测试（`design-tokens-generated`、Web `orbit-contrast-tokens`、App `design-tokens`）都真的逐对算 WCAG 比值，并断言「每个 `*-text` 至少被检查一次」。**注入**：把源里 `ink-3-text` 改回设计原值 `#9C95A4` 并重新生成 → 4 条失败，门禁有效。PLANNER 点名的组合（ink / ink-2 / ink-3-text × bg / surface / surface-2，马卡龙文字 × 马卡龙底，coral-text × coral-soft，on-accent × accent，ok 系）全部覆盖且 ≥4.5。**但「所有文字 × 底色」没做到**：`surface-3` 是底色，不在任何清单里，复核人补算后 5 对不达标，代码里已有 2 处真实使用（见 M1）。 |
| 04 命名统一 | ⚠️ 基本达成 | App `design-legacy-names`：注入 `colors.text3` → 失败；注入 `"#777777"` → 失败。Web `design-tokens-legacy-names`：注入 `var(--text-2)` → 失败（「1 old names remain」）。复核人另用宽松正则搜 App 的 `.text2/.bgSoft/.hairline…`，只命中文案对象（`c.muted`、`c.live` 是界面文字），无残留。App 写死颜色：除 REPORT 列出的 2 个文件外为 0（测试强制）。**问题**：Web 门禁把设计稿名字 `--accent`、`--scrim` 也算旧名（注入 `var(--accent)` 同样失败），见 M2。 |
| 05 现有页面不坏 | ✅（含已知例外） | `theme-render` 的「重试」按钮断言已改为新值 light `[30,26,36]` / dark 新 ink，测试通过。复核人浏览器实测 Web 人脉 / 活动 / 设置：浅色正常；**深色下三页仍是 0918 浅色**（页面根 `rgb(251,251,254)`，而 `html/body` 已是新深色 `#19181C`），符合 PLANNER「不做」与 REPORT 已知例外，不判为回归（改动前截图同样是浅色）。控制台无错误。执行人 `compare.html` 前后对照已抽看人脉深色一组，与复核实测一致。App 未在模拟器上复核（见下文「运行时抽查」）。 |
| 06 字体与主题 | ✅ | 浏览器实测：Google Fonts 只在根 layout 加载一次（1 个 preload + 1 个 stylesheet + 2 个 preconnect，Noto Sans JP / SC 400/500/700/800）；`desktop.css`（含 Noto Serif SC）已无任何页面引用。把 `<html lang>` 依次设为 ja / zh-CN / en / fr，页面根字体依次为 Hiragino Sans / PingFang SC / -apple-system / Hiragino Sans（未知语言回退日语）；ja 下 0918 设置页 124 个文本元素全部是 Hiragino Sans 或数字字体 SF Pro Rounded，没有残留的写死中文字体。主题：清空存储 + 系统深色 → 重新加载后 `data-theme="dark"`、`html` 背景首帧即 `#19181C`（初始化脚本在 `<head>` 内、绘制前执行）；设置页点「浅色」→ 存储 `light`、重新加载仍为浅色；点「跟随系统」→ 存储清空，立即回到系统深色（`OrbitThemeRuntime` 监听 `prefers-color-scheme` 变化）。复核后已恢复为「跟随系统」。App：`appearance-preference` 测试覆盖 `Appearance.setColorScheme` + AsyncStorage 记住 + 设置页三选一；RN 0.86 的 `setColorScheme` 接受 `"unspecified"`，实现成立。 |

### 必需证据子表

| SC | 子断言 | 复核结果 |
| --- | --- | --- |
| 02 | 生成脚本幂等 | ✅ 测试断言两次渲染相同；复核人实跑两次 + 同步，工作区无变化 |
| 02 | 白名单含 `design`；`AGENTS.md` 已更新 | ✅ `design-sync` 在临时目录跑同步脚本，只复制 `tokens.ts` 并清掉旧文件；App `AGENTS.md` diff 已核 |
| 03 | 原值只做图形装饰的规则写进 README | ✅ `repos/orbits/shared/design/README.md`「颜色规则」。复核人搜索 App `color: colors.(ink3|coral|ok|accent|mac*Ink)`、Web `color: var(--ink-3|coral|ok|…)`：App 0 处；Web 3 处 `color: var(--plum-900)`（chip hover 等），plum-900 不在 README 的原值清单里，未计为违规 |
| 04 | App 写死 hex 改 token 或说明 | ✅ 门禁强制，只剩 REPORT 列出的 2 个文件 |
| 05 | `theme-render` 按钮背景断言更新为新值 | ✅ |
| 06 | Web 只一个地方加载字体；Noto Serif SC 不再被引用 | ✅ 产品代码无 Noto Serif SC 引用；`public/iorbit-starfield/fonts/desktop.css` 文件本身还在但无人加载 |
| 全部 | 全量零新增失败、typecheck / lint、detect-changes | ✅（typecheck 见 m2）。detect-changes 记录在执行人证据目录 `detect-changes-commit*.txt` |

## 运行时抽查

- **Web**：复用本机已在 3000 端口运行的 `repos/orbits` dev server（同一工作目录，HEAD 含 R01；`--ink-3-text` 实测为 `#6F6778`、旧变量 `--text-2` 为空，确认是新代码），内置浏览器里本地测试账号已登录。看了人脉、活动、设置三页的浅色和系统深色，以及字体和主题切换（结果见 SC-05、SC-06）。数据库是本地 `localhost` 库，没有连 Neon。
- **App**：**没有在模拟器上复核。** 本机没有已启动的模拟器；DerivedData 里只有 2026-09-16 的旧 Debug 包，早于 R01，要看新代码得重新装依赖、编译原生包并起 Metro，超出这次复核的范围。App 端的依据是：`appearance-preference`、`theme-render`、`design-tokens`、`design-sync` 等真实渲染测试，以及执行人证据目录 `after/app-*-{light,dark}.png`（App 网页版截图）。建议产品负责人按 RD-04 在模拟器上试一次「首页 + 设置 → 外观」。

## 改动面

- **0918 写死颜色没有被改值**：逐文件比较 diff 里新增与删除的十六进制值，除生成的 `orbit-2026/tokens.css` 外，没有任何文件引入新的颜色值；0918 文件只有变量改名和同名去重。去重有一个副作用：0918 局部 `--text-4`（`#9FA3C4`）并入 `--ink-3-text`（`#6B6F99`），这些地方的最浅灰字变深了一档，方向是更易读，不算越界。
- **选择器结构**：`orbit-reference-styles.tsx` 只删了变量层的块（旧深色重映射、`html[data-theme="light"] [data-orbit-real-page="agent"]` 的变量覆盖、宇宙背景渐变、英文衬线覆盖），规则选择器未改。符合「只改变量名和值，不改选择器结构」。
- **App 同步副本**：`src/api/design/tokens.ts` 与源逐字一致（测试 + 复核人重跑 `sync:contract` 无差异），副本与源在同一个提交 `cd4bf019` 里。
- **旧名残留**：见 SC-04；没有发现门禁以外的残留。
- **GitNexus impact（复核人重跑）**：`OrbitColors` CRITICAL（377）、`createThemedStyles` CRITICAL（215）、`getOrbitTheme` HIGH（5）与 REPORT 一致；`useOrbitTheme` 的输出复核脚本没能解析，未单独判定（REPORT 记为 CRITICAL 336）。新增符号 `setOrbitThemePreference`、`renderDesignTokenOutputs`、`adoptDesignTokens`、`ORBIT_THEME_INIT_SCRIPT` 返回 UNKNOWN，原因是索引早于 R01（见 m5），复核人已用文本搜索确认它们的使用点（根 layout、`orbit-theme.tsx`、生成脚本和测试）。REPORT 写的对策（签名不变、一次改完、typecheck + 旧名扫描兜底、两端全量对照）与实际 diff 相符。

## 问题清单

### 严重

无。

### 中等

**M1 对比度清单漏了 `surface-3` 底色，已有两处文字低于 4.5:1**
- 现象：三份对比度清单（`tokens.json` 的 `color.contrast`、App `TEXT_ON_SURFACE`、Web `TEXT_ON_SURFACE`）的底色只有 bg / surface / surface-2 和各自的 soft 色，没有 `surface-3`。补算结果：浅色 `ink-3-text` 在 `surface-3` 上 4.38、`mac-apricot-text` 4.47、`mac-blue-text` 4.46、`mac-teal-text` 4.49、`ok-text` 4.40；深色 `ink-3-text` 在 `surface-3` 上 **3.96**。违反 RD-05「所有文字 × 底色 ≥4.5:1」。
- 真实使用点：
  - App `repos/orbit-app/src/screens/events/EventOperationsContent.tsx:144` `gateState`（`surface3` 底 + `ink3Text` 字，10px）；
  - Web `repos/orbits/app/(app)/app/inbox/relationship-inbox-panel.tsx:1305` `.ri-list-total`（`--surface-3` 底 + `--ink-3-text` 字，10.5px）。
- 复现：用 `tokens.json` 的值对 `ink-3-text` / `surface-3` 算 WCAG 比值；或把 `["ink-3-text","surface-3"]` 加进 `color.contrast` 后跑 `tests/ui/design-tokens-generated.test.ts`。
- 建议修法：把 `surface-3` 加进三份清单（至少 ink / ink-2 / ink-3-text / accent-text 各一对），再二选一：(a) 把 `ink-3-text` 浅色、深色各加深一点使其在 `surface-3` 上也 ≥4.5，马卡龙和 ok 文字同理；(b) 在 README 写明 `surface-3` 只做轨道 / 分隔 / 骨架，不承载文字，并把上述两处改成 `ink-2`。两处使用点所在旧屏会被 R14 / 活动 Sprint 重写，但清单是 token 层的契约，应在 R01 补齐。顺带建议 App 和 Web 的测试直接读 `tokens.json` 的 `color.contrast`，不要各维护一份清单（见 m6）。

**M2 Web 旧名门禁把设计稿名字 `--accent`、`--scrim` 也禁掉了**
- 现象：`scripts/design-tokens/legacy-rename.mjs` 的改名表含 `"accent": "accent-text"`、`"scrim": "scrim-web"`，`LEGACY_NAME_PATTERN` 由改名表生成，所以产品代码里任何 `var(--accent)`、`var(--scrim)` 都会让 `design-tokens-legacy-names` 失败。但这两个正是 `tokens.json` 生成进 `tokens.css` 的设计稿名字（RD-06 要求一律用设计稿命名；README 也写着 `accent` 用于图标、圆点等图形）。
- 位置：`repos/orbits/scripts/design-tokens/legacy-rename.mjs:17`（`accent`）、`:51`（`scrim`）、`:106`（`LEGACY_NAME_PATTERN`）。
- 复现：在任一产品样式里写 `color: var(--accent)`，跑 `tests/ui/design-tokens-legacy-names.test.ts`，报 `…: --accent`。复核人用脚本比对 `tokens.css` 声明的全部变量与门禁正则，恰好命中这两个。
- 影响：R06 / R07 写新组件、导航壳用设计稿原值做图形时会被误拦，只能绕道写 `--plum-700` 或 `--accent-text`，和 README 的规则相反。
- 建议修法：一次性改名已经做完，把 `accent`、`scrim` 从**扫描**用的名单里去掉（改名表本身可保留供历史 codemod 使用，或拆成「改名表」和「禁用名单」两份）；再加一条测试：`tokens.css` 声明的任何变量都不得命中禁用名单。

### 轻微

**m1 `console-styles.ts` 仍有重复声明。** `repos/orbits/app/(app)/app/agent/iorbit-0918/console-styles.ts:22-23` 连续两行 `--ink-3-text: #687078;`（原 `--text-3` / `--text-4` 改名后），REPORT 说已去重。无视觉影响，删一行即可。

**m2 typecheck 不是真正的「通过」。** `npm run typecheck` / `typecheck:app` 都是 EXIT 2，8 个错误全在 `.next/types/validator.ts`（旧构建残留指向已删除的 `app/api/chat/*`）；`orbit-typecheck-ratchet` 因此失败。与基线相同、属环境，但通用规则 1 写的是「两端 `tsc` 通过」。建议在收口前删掉 `.next/types` 再跑一次，留下一份真正 0 错误的记录，之后各 Sprint 的基线也会干净。

**m3 App 冷启动可能闪一下系统主题。** `app/_layout.tsx:83-85` 在 `useEffect` 里异步读 AsyncStorage 再 `setColorScheme`，第一帧按系统明暗渲染。手动选了与系统相反的用户每次冷启动会看到一次切换。建议在启动画面隐藏前等 `loadAppearancePreference` 完成（成熟做法：偏好恢复完再隐藏 splash）。

**m4 Web 深色目前几乎看不到效果，页面边缘与根背景不一致。** 人脉 / 活动 / 设置在深色下仍是 0918 浅色，而 `html` / `body` 已是新深色 `#19181C`（`orbit-reference-styles.tsx` 的 `body:has(...), html:has(...) { background: var(--bg) }`），滚动回弹和页面短于视口时会露出深色边。属已知例外的连带结果；另外 `orbit-reference-styles.tsx` 里 `.orbit-organizer-topnav` 仍写死 `rgba(10, 8, 18, 0.66)`。建议产品负责人看截图时知道「Web 选深色暂时只影响新壳和少数 token 化的部件」，R07 换壳时一起处理。

**m5 GitNexus 索引早于 R01。** R01 新增的符号查不到调用方（UNKNOWN）。建议 R02 开工前跑 `node .gitnexus/run.cjs analyze --index-only`。

**m6 对比度清单有三份。** `tokens.json` `color.contrast`、App 和 Web 测试各写一份，内容已经不完全一样（例如 App / Web 检查了 `on-accent × ink`，源清单没有）。建议两端测试都从 `tokens.json` 读，只维护一份（与 M1 一起改）。

## 全量测试与基线对照

复核人在 `redesign` HEAD `22174671` 上重跑（Node v26.10.0，orbits 带 `LANG=en_US.UTF-8 LC_ALL=en_US.UTF-8`）。基线取执行人 `run-01/BASELINE.md`（`fa429464`）与 REPORT 收口数。

| 项目 | 基线（R01 前） | REPORT 收口 | 复核实测 | 对照 |
| --- | --- | --- | --- | --- |
| App `npm test` | 4062 条，1 失败，1 取消（负载超时） | 4074 条，1 失败 | **4074 条，4073 通过，1 失败，0 取消** | 唯一失败 `route-parity`「native app has a route for every web app surface」（`/start`，已知）。零新增 |
| App `tsc --noEmit` | 0 | 0 | **EXIT 0** | 一致 |
| orbits `npm test` | 6811 条，7 失败，872 跳过 | 6825 条，6 失败，872 跳过 | **6825 条，5946 通过，7 失败，872 跳过** | 7 条逐条对上基线：DEP0205 弃用警告 ×5（canonical membership operator、event profile contract repair operator、relationship-lifecycle preflight ×2、simulator acceptance fixtures CLI）、`orbit-typecheck-ratchet`（`.next` 残留）、`app-plan-match-sheet`「a slow match result falls through…」（偶发；复核人单独重跑 3 次均 20/20 通过）。零新增 |
| orbits `typecheck` | EXIT 2，8 个 `.next/types` 错误 | 同 | **EXIT 2，8 个，全部在 `.next/types/validator.ts`** | 一致（见 m2） |
| orbits `typecheck:app` | 同上 | 同 | **EXIT 2，8 个，同上** | 一致 |
| orbits `lint` | 通过 | 通过 | **EXIT 0** | 一致 |

## 复核过程说明

- 注入验证全部在当前工作区临时修改、跑完单个测试后立即 `git checkout` 还原；注入是在两端全量测试结束之后做的，没有污染全量结果。浏览器里切过的主题已恢复为「跟随系统」。
- 没有连 Neon、没有部署、没有调用付费 AI；用户未提交的文件（`bridge/*`、`docs/designs/Orbit_0918/`、`repos/orbits/docs/development/web-2026-09-17/*`、`repos/orbits/docs/operations/2026-09-25-neon-egress-audit.md`）未动。
- 复核日志在复核会话 scratchpad（`app-test.log`、`orbits-test.log`、`orbits-tc*.log`、`orbits-lint.log`），未入库。
