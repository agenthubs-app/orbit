# Sprint R02 — REPORT

**执行人：** 小雨的执行会话，2026-10-09。**依据：** PLANNER 修订 2、README 通用规则 1–9、RD-10（修订）、RD-15、RD-24、RD-25。
**基线：** `redesign` `19fe37b59`（R01 复核问题修完后的新基线，见 `R01-design-tokens/REVIEW.md`「处理记录」）。
**证据目录：** `~/orbit-sprint-evidence/redesign/R02/run-01/`（`compare.html` / `compare.png` 并排对照页、`screens/`、`inventory/`、`ionicons-ratchet-injection.txt`、全量日志）。

## 提交

直接在 `redesign` 上提交（RD-25）：代码提交 `9fa732ab2`（图标源、两端 Icon、展示页、导航图标、门禁、登记项），文档一个提交（本 REPORT、登记表）。提交号见 `git log -- docs/designs/redesign-2026-10/sprints/R02-icons`。

## 做了什么

1. **统计与对照表**：用 TypeScript 类型检查器统计 App 全部 Ionicons 用法（凡上下文类型是 Ionicons 图标名的字符串字面量都算，包括 `name` 属性、`keyof typeof Ionicons.glyphMap` 类型的映射和字面量联合）：**114 个名字、446 处、73 个文件**。逐个定新图标，出 [`icon-mapping.md`](icon-mapping.md)。
2. **图标源**：`repos/orbits/shared/design/icons.json`，91 个图标 = 设计稿 48（`kit.js`，逐字照搬）+ 5（`ui.css` mask 图标解码成普通路径）+ **补画 38**。R01 的生成脚本 `scripts/design-tokens/generate.mjs` 一并生成 `shared/design/icons.ts`（零 import，形状解析成 `{ tag, d | cx… }`），App `sync:contract` 白名单加 `icons.ts`。token 产物（`tokens.ts`、`tokens.css`）逐字不变。
3. **两端 `Icon`**：App `src/components/ui/Icon.tsx`（react-native-svg）、Web `app/(app)/app/orbit-2026/ui/Icon.tsx`（内联 SVG），同名同参数 `<Icon name size? color? accessibilityLabel? />`。
4. **展示页**：App `app/showcase/icons.tsx`（开发包或 `EXPO_PUBLIC_ORBIT_SHOWCASE=1` 的 TestFlight 包可见，正式版跳回首页）；Web `app/showcase/icons/page.tsx`（本地、Vercel 预览 / staging 可见，正式环境 404；CSS Modules + `[data-orbit-2026]`，无十六进制颜色）。
5. **导航壳**：`OrbitNavigationIcon` 改用 `Icon`（kit 的 TABS：home / users / sparkle / calendar；「我的」暂用 user，Task tab 随 R05）。
6. **门禁**：App `tests/ionicons-ratchet.test.ts` + 允许清单 `tests/fixtures/ionicons-legacy-allowlist.json`（72 个文件）。
7. **旧屏一律未改**（RD-24）。

## 验收

| SC | 结论 | 证据 |
| --- | --- | --- |
| 01 一份图标源 | ✅ | Web `tests/ui/icon-source-sync.test.ts`（kit 48 + 5 与设计稿逐字一致；契约字段；`icons.ts` 与渲染结果逐字一致、确定性；不碰 token 产物；对照表只指向存在的图标、补画清单与源一致）；App `tests/icon-source-sync.test.ts`（副本与源逐字一致、名单与 JSON 一致）、`tests/design-sync.test.ts`（同步只拷 `tokens.ts` + `icons.ts`）。端到端：改 `icons.json` 的 `plus` → `design:tokens` → `sync:contract` → 两端展示页的 `plus` 同时变，记录见下文「SC-01 端到端」 |
| 02 Ionicons 只减不增 | ✅ | `tests/ionicons-ratchet.test.ts` 4 种注入全部被拦（`ionicons-ratchet-injection.txt`）：① 新组件 `src/components/ui/Bad.tsx` import → 失败；② 清单外旧文件 `src/screens/agent/AgentLedgerContent.tsx` 新增 import → 失败；③ 删掉清单内文件不移出清单 → 失败；④ 把新代码路径塞进清单 → 失败。还原后 5/5 通过 |
| 03 视觉一致 | ✅ | `compare.html` / `compare.png`：设计稿 kit 原样渲染 ↔ Web 展示页 ↔ App 展示页，浅色 / 深色。kit 原图几何由测试证明逐字一致；补画 38 个与 kit 同规格（24 视框、1.7 线宽、圆头圆角、圆角矩形同档 3 / 3.5 / 4.5），并排看线重与风格一致 |
| 04 导航壳图标 | ⚠️ 部分 | `tests/navigation-icon.test.tsx`（每个 tab 的输出与 `<Icon name=… size={21}>` 逐字相同；选中 / 未选中颜色直通；尺寸归档）；`screens/app-tabbar-{light,dark}.png` 是 `OrbitTabBar` 真实组件经 react-native-web 渲染（选中「人脉」）。**模拟器截图没有拿到**，原因见「已知例外」 |

### 必需证据子表

| SC | 子断言 | 结果 |
| --- | --- | --- |
| 01 | 实心点图标（target、more、nfc、list）在深色下可见 | ✅ App `tests/icon-render.test.tsx`：深色主题下点的 `fill` = 深色 `ink`（与描边同色），`ink` 对 `bg` / `surface` ≥3:1（WCAG 1.4.11）；Web `tests/ui/icon-render.test.tsx`：点 `fill` 跟随描边色（含传入颜色时）。证据截图深色对照 |
| 01 | 加图标后 R01 的 token 生成产物逐字不变 | ✅ `design-tokens-generated.test.ts` 通过；`icons` 输出与 `DESIGN_TOKEN_OUTPUTS` 不相交（测试断言）；`git status` 里 `tokens.ts`、`tokens.css` 无改动 |
| 02 | 作为唯一信息的图标都有无障碍标签（组件层面） | ✅ 两端渲染测试：不传标签 → `aria-hidden`；传 `accessibilityLabel` → `role="img"` + `aria-label`。App 在原生端用 `accessible` / `accessibilityRole="image"` / `accessibilityLabel`，在 web 端用 ARIA（react-native-svg 会把属性交给 DOM） |
| 03 | 对照表覆盖全部用法；补画一次画齐；产品负责人在报告里过目 | ✅ 114 / 114 有去处（113 个映射到图标，`logo-google` 不收，见下）；38 个补画全部被对照表引用，测试保证补画清单与源一致。**请产品负责人看 `compare.png` 和 [`icon-mapping.md`](icon-mapping.md)**（无需事先确认） |
| 全部 | 两端全量零新增失败；`tsc` 通过；detect-changes | 见「基线 → 收口」「GitNexus」 |

### SC-01 端到端

`sc01-end-to-end.txt`：把 `icons.json` 的 `plus` 改成 `M12 4v16M4 12h16` → `npm run design:tokens` → App `npm run sync:contract` → Web 展示页（dev server 热更新后）出现新路径；App 副本含新路径，App 的源一致性和展示页测试通过；Web「kit 原图逐字一致」测试按预期失败（改了设计稿原图就该失败）。还原后两端回到 kit 几何。

## 基线 → 收口

| 项目 | 基线 `19fe37b59` | 收口 | 对照 |
| --- | --- | --- | --- |
| App `npm test` | 4077 条，1 失败（`route-parity` `/start`） | **4096 条，4094 通过，2 失败** | `route-parity`（已知）+ `task-date-interactions`「non-2xx receipt…」：R02 未碰该文件，单独重跑 3/3 通过，判为负载偶发。零新增 |
| App `tsc --noEmit` | EXIT 0 | **EXIT 0** | |
| orbits `npm test` | 6832 条，6 失败（DEP0205 ×5、`app-plan-match-sheet` 偶发 ×1），872 跳过 | **6845 条，5967 通过，6 失败，872 跳过** | DEP0205 ×5（基线）+ `event-profile-contract-repair-apply`「serialization and deadlock SQLSTATE retries…」：R02 未碰该文件，单独重跑 3/3 通过，偶发（基线那条 `app-plan-match-sheet` 偶发这次通过）。零新增 |
| orbits `typecheck` / `typecheck:app` / `lint` | 0 / 0 / 0 | **0 / 0 / 0** | |

第一次收口全量发现 5 条新增失败，都是新路由 / 新同步文件带出的登记项，已修：App 离线页面清单（`scripts/page-offline-inventory.ts` 登记 `/showcase/icons` 为 device-only，重新生成 `docs/offline/page-inventory.md`）、App 路由覆盖（`integratedFeatureRoutes` 加 `/showcase/icons`）、App `compute-sync` / `domain-sync` 测试的临时源目录补 `icons.ts`、Web 产品面清单（`generate-product-surface-manifest.mjs` 把 `/showcase` 和 `/dev` 一样排除：开发展示页，正式环境隐藏）。另有 App 一条 `opt-out leaves the canonical registry…` 在原生编译占满 CPU 时 10 秒超时，单独重跑和第二次全量均通过，判为负载偶发。

## GitNexus

- 开工前已按 R01 复核 m5 刷新索引。
- `OrbitNavigationIcon`：**HIGH**（66 个下游，经 `OrbitTabBar` 进几乎所有屏）。对策：签名不变（`name` / `size` / `color`），只换内部画法；`tests/navigation-icon.test.tsx` 锁定每个 tab 的输出；`OrbitTabBar` 未改；底栏渲染截图核对。尺寸：底栏传 22 → 21（kit 底栏值），24 → 24；`ContactsScreen` 空态传 28 → 24（旧屏不改，空态图标小 4px，可接受，R11 重写）。
- `isProductionPage`（产品面清单）：LOW（3）。
- 生成脚本 `main`、同步脚本 `syncTargets`：impact 返回 UNKNOWN（同名符号 / 模块常量），文本搜索确认只在各自脚本的 CLI 入口使用。
- 新增符号（`Icon`、`parseIconBody`、`renderDesignIconOutputs`、`showcaseEnabled`、`shouldHideShowcase` 等）在索引里还没有，调用点用文本搜索确认：只在展示页、导航图标、生成脚本和测试里。
- detect-changes（提交前）：14 个文件、26 个符号，**受影响流程 0，风险 low**（`detect-changes.txt`）。

## 交接（契约）

- **图标名清单**：`shared/design/icons.json` 的键（91 个），类型 `DesignIconName` / `IconName`。kit：home, users, calendar, target, sparkle, plus, search, filter, sliders, bell, right, left, down, more, scan, nfc, link, image, mic, pen, mail, phone, check, clock, pin, settings, inbox, chart, out, x, send, flag, grid, brief, refresh, moon, share, layers, route, ticket, user, book, edit, task, list, note, menu, star, alert, trash, undo, wifioff, copy。补画（`source: "drawn"`）：arrow, up, minus, circle, dot, square, check-circle, check-double, x-circle, info, at, chat, camera, images, id-card, user-plus, lock, key, shield, login, eye, eye-off, bulb, bolt, flame, heart, sun, folder, archive, attach, upload, save, swap, merge, map, navigate, pushpin, skip。
- **用法**：App `import { Icon } from "src/components/ui/Icon"`，Web `import { Icon } from "app/(app)/app/orbit-2026/ui/Icon"`；`size` 只能 16 / 20（默认）/ 21 / 24；`color` 默认 App 主题 `ink`、Web `currentColor`；只有图标的按钮必须传 `accessibilityLabel`。规格和加图标流程写在 `shared/design/README.md`「图标」。
- **旧屏换图标**：查 [`icon-mapping.md`](icon-mapping.md)；换完把文件从允许清单删掉。
- **门禁**：`repos/orbit-app/tests/ionicons-ratchet.test.ts`。清单外不得 import `@expo/vector-icons`；清单项必须仍存在且仍用 Ionicons（只减不增，上限 72）；新代码区（`src/components/ui/`、`OrbitNavigationIcon`、`OrbitTabBar`、`src/screens/showcase/`、`app/showcase/`）永远不能进清单——**功能 Sprint 新建屏幕目录时把目录加进 `NEW_CODE`**；清单清空时测试要求同时删掉 `@expo/vector-icons` 依赖（合回前总验收核对，RD-24）。门禁按文件计，同一个清单内文件里多加一处 Ionicons 拦不住（PLANNER 定的粒度）。
- **展示页可见性**：App `showcaseEnabled()`（`__DEV__` 或 `EXPO_PUBLIC_ORBIT_SHOWCASE=1`；TestFlight 构建配置要加这个变量，R04 接构建配置时落实）；Web `shouldHideShowcase()`（`VERCEL_ENV=production` 或非 Vercel 的生产构建隐藏）。R04 / R06 的组件展示页并入同一路由前缀 `/showcase`。

## 成熟惯例自定的取舍

- **带圈 / 实心变体合并**：`add-circle`、`arrow-forward-circle`、`remove-circle` 映射到不带圈的线性图标，因为设计稿规则是「功能图标放在圆形浅底上」（`01-system.html:219`），圈由容器提供；`checkmark-circle`、`close-circle` 例外地补画了带圈版，因为它们单独表达「完成态」「清空输入」，iOS / Material 都这么用。
- **返回**：`arrow-back` 和 `chevron-back` 都用设计稿的 `left`（iOS 返回惯例是尖括号）；「下一步」类的 `arrow-forward` 用补画的 `arrow`。
- **置顶 vs 地点**：Ionicons `pin` 在旧屏是「置顶会话」，设计稿 `pin` 是定位针，所以地点用 `pin`、置顶补画 `pushpin`。
- **`logo-google` 不收进图标集**：品牌标志按 Google Identity 品牌规范使用官方多色 G 标，不做成单色线性图标；由 R18 重写登录页时放进按钮。
- **保存**：补画「下载进托盘」形状的 `save`，不用软盘（主流产品已不用软盘表示保存）。
- **App 展示页文字**是图标名（标识符），不是产品文案；R03 的写死文字门禁接入时把展示页列为开发页面处理。

## 已知例外与偏差

- **SC-R02-04 模拟器截图没有完成。** 编译了 Debug 原生包（iPhone 17 Pro 模拟器，`BUILD SUCCEEDED`）并装上启动，但：① 模拟器面板没有授权给本会话（「Let Claude use it」未同意），无法点掉系统的「在 Orbit 中打开？」确认框，也无法操作；② **`repos/orbit-app/.env.local` 把 App 的服务器地址设成了正式环境 `https://orbitailink.com`**，Debug 包和 Metro 网页版都会内联这个地址，所以不能在这个配置下登录看首页底栏（规则 6 不碰生产）。发现后立即停掉 App 并卸载、停掉 Metro。**影响说明**：App 启动时未登录，只会发出未登录状态下的会话恢复请求（读，无写、无登录），本会话没有向正式环境提交任何数据。替代证据：`OrbitTabBar` 真实组件经 react-native-web 渲染的浅 / 深截图 + 渲染测试。**建议产品负责人按 RD-04 在模拟器里看一眼底栏**（需要先把 App 指向本地服务器，例如去掉 `.env.local` 里的正式地址），或授权模拟器给下一次复核会话。
- App 展示页截图同上，用 react-native-web 渲染真实组件（App 渲染测试走的同一条路径），不是模拟器。
- 原生端的无障碍属性分支（`accessible` / `accessibilityRole` / `accessibilityLabel`）只由类型检查覆盖：测试环境是 react-native-web，走 web 分支。
- 测试替身 `tests/helpers/stubs/react-native-svg.js` 补了 `Circle`、`Rect`，并丢弃原生专用的无障碍属性（以前 `OrbitNavigationIcon` 用到的 `Circle` / `Rect` 在替身里不存在，只是没有测试渲染过它）。

## 剩余

- R04：TestFlight 构建配置加 `EXPO_PUBLIC_ORBIT_SHOWCASE=1`；组件展示页并入 `/showcase`。
- R05：底栏结构和 Task tab（`task` 图标已在源里）；R01 m3 启动画面。
- 功能 Sprint：按对照表换旧屏图标并缩短允许清单；新屏目录加进 `NEW_CODE`。
