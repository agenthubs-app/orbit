# Sprint R02 — REVIEW（独立复核）

**复核人：** 独立 AI 复核会话（不是执行人），2026-10-10。
**对象：** `410cd8137..12767b0c5`（`9fa732ab2` 代码、`12767b0c5` REPORT 与登记表），在 `redesign` HEAD `12767b0c5` 上复核。基线 `19fe37b59`。
**依据：** PLANNER 修订 2（唯一契约）、README 通用规则 1–9、RD-10（修订）、RD-15、RD-24、RD-25；设计稿 `kit/kit.js`、`kit/ui.css`、`01-system.html`。REPORT 只作为线索，下面每条都是复核人重新跑或重新读出来的。

## 结论：有条件通过

图标源、生成与同步、两端 `Icon`、展示页、导航壳换图标都已实现，kit 原图逐字一致，R01 token 产物不变，旧屏文件一个没改，两端全量对照基线零新增失败。但有 **3 条中等问题**：

- **M1** Ionicons 门禁的「只减不增」只按**条数**卡，不按**成员**卡：删掉一个旧屏后，可以把一个新屏塞进允许清单，测试照样通过（复核人注入实测）。这正是后续功能 Sprint 最容易踩的路径。
- **M2** 对照表有一处语义配错：`mail-unread-outline` 在旧屏里是**发送消息**按钮，对照表却写成「`mail`，未读用 dot 叠在右上」。正是 PLANNER「易错边界」点名的那类错误，功能 Sprint 会照表抄。
- **M3** SC-R02-04 的主证据（模拟器底栏截图）缺失。REPORT 已如实说明原因（模拟器未授权、App `.env.local` 指向正式环境，规则 6 禁止碰生产）；复核人按同一约束也没有启动模拟器，无法补。

**条件：** M1、M2 在 `redesign` 上修完（RD-25）；M3 由产品负责人在本地环境下用模拟器看一眼底栏（浅 / 深、选中 / 未选中），或者在 R05 改底栏结构时一并补截图并在登记表注明。满足后 R02 视为完成。轻微问题可以随手修，也可以留给后续 Sprint。

没有严重问题。

## 逐 SC 核实

| SC | 结论 | 复核人做了什么 / 证据 |
| --- | --- | --- |
| 01 一份图标源 | ✅ | **逐字核对**：复核人用 `vm` 直接执行 `kit.js` 里的对象 `P`（不靠正则），48 个与 `icons.json` 的 `body` 逐字相同、`source` 全为 `kit`；`ui.css:320-324` 的 5 个 mask 图标解码后（`fill='black'` → `currentColor`）与源一致。源共 91 个 = kit 53 + 补画 38。**端到端实测**：把补画图标 `minus` 改成 `M4 12h16` → `npm run design:tokens` → App `npm run sync:contract` → App 副本出现新路径，dev server 上 `/showcase/icons` 的 HTML 出现新路径；两端相关测试 27/27 通过；重新生成后 `tokens.ts`、`tokens.css` 无变化（`git status` 只有三份图标文件）。**手改拦截**：手改 App 副本 → `icon-source-sync`「byte-identical」失败；手改 `shared/design/icons.ts` → Web `icon-source-sync`「byte-identical … deterministic」失败。全部已 `git checkout` 还原，还原后展示页回到原路径。 |
| 02 Ionicons 只减不增 | ⚠️ 有缺口 | 允许清单 72 个文件，复核人用 `git grep @expo/vector-icons 19fe37b59 -- src app` 重算，**与清单完全一致**。注入实测：新组件 `src/components/ui/Bad.tsx` 里 `import { Ionicons }` → 失败 ✅；`export * from "@expo/vector-icons"` → 失败 ✅；**删掉清单内文件 `NoteEventPicker.tsx` 并移出清单，同时新建 `src/screens/feature-x/NewScreen.tsx` import Ionicons 并加进清单 → 5/5 通过 ❌**（见 M1）；裸的副作用 `import "@expo/vector-icons"` → 5/5 通过（见 m1）。执行人证据 `ionicons-ratchet-injection.txt` 的 4 种注入复核人抽读一致。扫描范围是 `src/`、`app/` 全部源文件（以清单反向定义），旧屏不会被误拦；App 根目录其他源码目录（`plugins/`、`scripts/`）不是界面代码，未扫描可以接受。 |
| 03 视觉一致 | ✅ | 复核人用 Playwright 打开 dev server 的 `/showcase/icons`，浅 / 深各截一张：标题 `Icons · 91`，97 个 `<svg>` 全部 `viewBox="0 0 24 24"`、`stroke-width="1.7"`、`aria-hidden`；实心点 `fill` 浅色 `rgb(30,26,36)`、深色 `rgb(243,240,246)`（与 `--ink` 同色，深色下可见）。另把 38 个补画图标放大到 96px 与 kit 原图并排目检：线宽、圆头圆角、圆角矩形档位（3 / 3.5 / 4.5）一致，风格统一。语义抽查见 M2、m2。执行人 `compare.html` 链接完整，但 `compare.png` 缺 3 张图（m3）。 |
| 04 导航壳图标 | ⚠️ 部分 | `OrbitNavigationIcon` 现在只是 `TAB_ICONS` 映射 + `<Icon>`（home / users / sparkle / calendar / user，与 `kit.js:95` 的 TABS 一致，Task tab 留 R05）；`navigation-icon.test.tsx` 断言每个 tab 的输出与 `<Icon size={21}>` 逐字相同、颜色直通。执行人的 react-native-web 底栏截图（浅 / 深）复核人已看：选中「人脉」、中间 iOrbit 黑 / 白方块里的 sparkle 反色正确。**模拟器截图缺失**（M3）。 |

### 必需证据子表

| SC | 子断言 | 复核结果 |
| --- | --- | --- |
| 01 | 实心点图标（target、more、nfc、list）在深色下可见 | ✅ App `icon-render.test.tsx` 在深色主题下断言点的 `fill` = 深色 `ink`，且 `ink` 对 `bg` / `surface` ≥3:1；Web 运行时实测深色点色 = `--ink`（`rgb(243,240,246)`） |
| 01 | 加图标后 R01 token 产物逐字不变 | ✅ diff 未触及 `tokens.ts` / `tokens.css`；`design-tokens-generated` 通过；复核人端到端重新生成后两文件无变化；测试断言 `DESIGN_ICON_OUTPUTS` 与 `DESIGN_TOKEN_OUTPUTS` 不相交 |
| 02 | 作为唯一信息的图标有无障碍标签（`Icon` 组件层面） | ✅ 两端：不传标签 → `aria-hidden`；传 `accessibilityLabel` → `role="img"` + `aria-label`。App 原生分支（`accessible` / `accessibilityRole` / `accessibilityLabel`）只有类型检查覆盖（m5） |
| 03 | 对照表覆盖全部 Ionicons 用法；补画一次画齐；产品负责人过目 | ⚠️ 覆盖：复核人用 Ionicons `glyphMap` 扫描 72 个清单文件 + 2 个数据文件里所有带连字符的图标名字面量，没有对照表遗漏的名字；表内 114 行、合计 446 处，与 REPORT 一致；补画清单与源由测试保证一致。**语义**：1 处配错（M2），2 处可商榷（m2）。产品负责人过目：REPORT 已请其看 `compare.png` 和对照表，尚无过目记录（PLANNER 允许事后过目） |
| 全部 | 两端全量零新增失败；`tsc` 通过；detect-changes | ✅ 见下文「全量测试与基线对照」；detect-changes 记录在执行人证据 `detect-changes.txt`（14 文件、26 符号、受影响流程 0） |

## 运行时抽查

- **Web**：复用本机已在 3000 端口运行的 `repos/orbits` dev server（同一工作目录，HEAD 含 R02；端到端实测时页面能热更新出复核人改的路径，确认是当前代码）。用 `repos/orbits/node_modules/playwright` 以 `colorScheme: light / dark` 打开 `/showcase/icons`，结果见 SC-01、SC-03。页面不需要登录，没有连数据库。
- **App**：按规则 6 **没有启动模拟器或 Metro**（`repos/orbit-app/.env.local` 指向正式环境）。App 侧只看了执行人的 react-native-web 截图（`screens/app-showcase-*.png`、`app-tabbar-*.png`）和渲染测试。
- **GitNexus**：`impact OrbitNavigationIcon upstream` → **HIGH**，66 个下游（经 `OrbitTabBar`、`AppScreen` 进几乎所有屏），与 REPORT 一致；签名未变、`OrbitTabBar` 未改，对策成立。

## 改动面

- **新建**：`shared/design/icons.json` / `icons.ts`、App 副本 `src/api/design/icons.ts`、两端 `Icon`、两端展示页（App `app/showcase/icons.tsx` + `src/screens/showcase/`，Web `app/showcase/`）、门禁测试与允许清单、`icon-mapping.md`、测试 7 个。
- **修改**：`OrbitNavigationIcon.tsx`（内部改用 `Icon`）、R01 生成脚本（加图标输出，token 输出路径不变）、App 同步白名单加 `icons.ts`、`AGENTS.md`、`shared/design/README.md`、产品面清单排除 `/showcase`、App 离线页面清单与路由覆盖登记 `/showcase/icons`、测试替身 `react-native-svg` 补 `Circle` / `Rect`、`compute-sync` / `domain-sync` 临时目录补 `icons.ts`。
- **旧屏（RD-24）**：diff 里没有任何旧屏文件（`src/screens/**` 只新增 `showcase/`，Web 无旧页面改动）。唯一的间接视觉变化是旧屏 `ContactsScreen.tsx:1571` 空态用的 `OrbitNavigationIcon`：图形换成 kit 的 `users`，尺寸 28 → 24（REPORT 已说明，R11 重写）。属于导航壳组件的预期连带，不判为违反 RD-24。
- **展示页可见性（RD-15）**：Web `shouldHideShowcase()`：有 `VERCEL_ENV` 时只在 `production` 隐藏，无 `VERCEL_ENV` 的生产构建也隐藏（失败即关闭），实现正确；App `showcaseEnabled()` = `__DEV__ || EXPO_PUBLIC_ORBIT_SHOWCASE === "1"`，正式包跳回首页；但 TestFlight 构建配置还没加这个变量（m4）。

## 问题清单

### 严重

无。

### 中等

**M1 允许清单只卡条数、不卡成员，「只减不增」可以被替换绕过**
- 现象：`the allow list only shrinks` 只断言「每项仍存在且仍 import Ionicons」和「条数 ≤ 72」；`NEW_CODE` 只挡 5 个固定路径。删掉（或改写）一个旧屏后，把任意新屏路径加进清单，全部测试通过。PLANNER 契约是「开工时把现有 72 个文件记成允许清单……清单外的文件出现 Ionicons 即失败」，意图是冻结开工时那 72 个文件；REPORT 交接还要求「功能 Sprint 新建屏幕目录时把目录加进 `NEW_CODE`」，靠人记得，忘了就漏。
- 位置：`repos/orbit-app/tests/ionicons-ratchet.test.ts:16`、`:51-55`、`:20-26`。
- 复现：删除 `src/screens/notes/NoteEventPicker.tsx` 并从清单移除；新建 `src/screens/feature-x/NewScreen.tsx`，内容 `import { Ionicons } from "@expo/vector-icons"`，加进清单 → `node --test --import tsx tests/ionicons-ratchet.test.ts` 5/5 通过。（复核人已还原。）
- 建议修法：在测试里写死开工快照（72 个路径的常量数组，或清单内容的哈希加一份只读副本），断言 `allowlist ⊆ OPENING_FILES`；`NEW_CODE` 可以保留作为补充说明，但不再是唯一防线。

**M2 对照表把「发送消息」按钮配成了「邮件 + 未读点」**
- 现象：`mail-unread-outline` 唯一的用法是收件箱回复区的 `ActionButton`，文案是 `inbox.sendMessage` / `inbox.retrySend` / 暂存草稿，语义是**发送**；对照表配成 `mail`，说明写「未读用 dot 叠在右上」，与实际用法不符。功能 Sprint 照表抄会把发送按钮画成信封 + 未读点。
- 位置：`docs/designs/redesign-2026-10/sprints/R02-icons/icon-mapping.md:90`（使用位置 `:260`）；用法 `repos/orbit-app/src/screens/inbox/RelationshipInboxScreen.tsx:1436`。
- 复现：`sed -n 1433,1440p repos/orbit-app/src/screens/inbox/RelationshipInboxScreen.tsx`。
- 建议修法：改成 `send`（kit 已有，`paper-plane-outline` 也映射到 `send`），说明写「发送消息按钮」。顺带按「用法上下文」再过一遍只出现 1 次的映射（这类最容易按名字猜错）。

**M3 SC-R02-04 主证据（模拟器底栏截图）缺失**
- 现象：PLANNER 验收契约 SC-04 的主证据是「模拟器里底栏图标……截图」；现在只有渲染测试和 react-native-web 截图。执行人没能拿到的原因属实（`repos/orbit-app/.env.local` 指向 `https://orbitailink.com`，规则 6 禁止）；复核人同样受此约束无法补。
- 位置：REPORT「已知例外」第一条；登记表 R02 行已标「SC-04 模拟器截图待补」。
- 复现：`~/orbit-sprint-evidence/redesign/R02/run-01/screens/` 无模拟器截图。
- 建议修法：产品负责人（或获授权的会话）把 App 临时指向本地服务器后，在模拟器里看底栏浅 / 深、选中 / 未选中，截图放进证据目录；或在 R05 改底栏结构时补齐并在登记表注明 R02 的 SC-04 由 R05 截图关闭。原生端无障碍分支（m5）可以一并看一眼。

### 轻微

**m1 门禁认不出裸的副作用 import**
- 现象：`IONICONS_IMPORT` 只认 `from` / `require(` / `import(`，`import "@expo/vector-icons";` 不会命中。单靠副作用 import 画不出图标，实际风险低，但测试名叫「sees every way of pulling Ionicons in」。
- 位置：`repos/orbit-app/tests/ionicons-ratchet.test.ts:28`。
- 复现：新建 `src/components/ui/Bad.tsx` 内容 `import "@expo/vector-icons";` → 5/5 通过。
- 建议修法：正则加 `import\s*` 分支（`(?:from\s*|import\s*|require\(\s*|import\(\s*)`），并在自检用例里加一条。

**m2 两处图标语义可商榷**
- 现象：① `diamond-outline → star`：旧屏用在人脉覆盖信号的「稀缺 / 独特」类（`ContactsDashboardScreen.tsx:1463`），而 `star` 在成熟产品里几乎都是「收藏 / 星标」，后续若真有收藏功能会撞义。② 补画的 `merge`（`icons.json:88`）画的是一条竖线从上方节点分叉到右侧节点，读起来更像「分支」，和 kit 的 `route` 也接近；「合并重复联系人」用这个形状不直观。
- 位置：`icon-mapping.md:58`、`:74`、`:166`；`repos/orbits/shared/design/icons.json:88`。
- 复现：放大渲染 `merge` 与 `route` 并排看。
- 建议修法：① 产品负责人过目时确认，或补画一个「宝石 / 稀有」形状；② 把 `merge` 改成两条线汇入一条（类似 Lucide `merge` / `git-merge` 的箭头汇合形），保持 1.7 线宽与圆头。

**m3 `compare.png` 缺 3 张图**
- 现象：对照页 PNG 里「App 展示页（深色）」和两张「App 底栏」位置是破图标；`compare.html` 本身链接正确、文件都在，是截 PNG 时图片还没加载完。产品负责人按 REPORT 看 `compare.png` 会以为缺证据。
- 位置：`~/orbit-sprint-evidence/redesign/R02/run-01/compare.png`（对应 `compare.html:21`、`:26-27`）。
- 建议修法：等 `load` 事件或 `networkidle` 后重截 `compare.png`。

**m4 App 展示页在 TestFlight 还看不到（RD-15 只做了一半）**
- 现象：`showcaseEnabled()` 依赖 `EXPO_PUBLIC_ORBIT_SHOWCASE=1`，但构建配置（`app.config.ts` / EAS 配置）里没有这个变量，TestFlight 包现在会跳回首页。REPORT 已列为 R04 待办。
- 位置：`repos/orbit-app/src/components/ui/showcase.ts`；REPORT「剩余」。
- 建议修法：R04 接构建配置时落实，并在 R04 的验收里加一条 TestFlight 可见的证据。

**m5 App `Icon` 原生无障碍分支无运行时覆盖；导航图标尺寸静默吸附**
- 现象：① 测试环境走 react-native-web 分支，原生分支（`accessible: false` + `importantForAccessibility: "no-hide-descendants"` / `accessibilityRole: "image"`）只有类型检查。② `OrbitNavigationIcon` 接受任意 `number`，`size >= 24 ? 24 : 21`，传 16 也会变 21，调用方不会得到提示。
- 位置：`repos/orbit-app/src/components/ui/Icon.tsx:50-55`；`repos/orbit-app/src/components/OrbitNavigationIcon.tsx:20`。
- 建议修法：① 加一个 `Platform.OS` 打桩为 `ios` 的单元测试断言属性；② R05 重做底栏时把 `size` 收窄成 `IconSize`。

**m6 App `.env.local` 指向正式环境，会继续卡住后续 Sprint 的模拟器验收**
- 现象：不是 R02 的代码问题，但它让 R02 的 SC-04 无法闭环，R04 / R05 同样会遇到。
- 位置：`repos/orbit-app/.env.local`（本地文件，不在仓库）。
- 建议修法：由产品负责人决定一个本地开发用的覆盖方式（例如单独的 `.env.development.local` 指向本地服务器），写进 Sprint 通用规则，避免执行会话误连生产。

## 全量测试与基线对照

| 项目 | 基线 `19fe37b59`（README / REPORT） | 复核实跑 | 对照 |
| --- | --- | --- | --- |
| App `npm test` | 4077 条，1 失败（`route-parity` `/start`） | **4096 条，4095 通过，1 失败**（单独跑的第二次全量） | 只有已知的 `route-parity`。零新增 |
| App `npx tsc --noEmit` | 0 | **0** | |
| orbits `npm test`（`LANG/LC_ALL=en_US.UTF-8`） | 6832 条，6 失败（DEP0205 ×5 + 偶发） | **6845 条，5968 通过，5 失败，872 跳过** | 5 条都是 DEP0205 子进程类（`event-canonical-membership-operator-runner`、`event-profile-contract-repair-operator-runner`、`relationship-lifecycle-preflight-cli` ×2、`simulator-acceptance-fixtures`），日志里 DEP0205 1080 次。零新增 |
| orbits `typecheck` / `typecheck:app` / `lint` | 0 / 0 / 0 | **0 / 0 / 0**（先删了 `.next/types`） | |

说明：复核人第一次把两端全量**同时**在后台跑，App 出现 12 条失败，其中 10 条耗时约 480 秒（负载超时），2 条约 25 秒（`app-wide-account` ×2、`app-wide-contacts` 1 条）。把这 9 个文件单独重跑：534/534 通过；随后 App 全量**单独**再跑一次，只剩已知的 `route-parity`。判为两套全量并发造成的负载失败，与 R02 无关。新增测试 19 条（App）、13 条（orbits）与条数增量一致。

## 复核过程说明

1. 读 README（通用规则、RD-10 / 15 / 24 / 25）、GOAL、PLANNER 修订 2、REPORT、对照表、R01 REVIEW 格式；看 `git diff 410cd8137..12767b0c5` 全部 37 个文件。
2. 用脚本执行 `kit.js` 的 `P` 对象与 `icons.json` 逐字比对；解码 `ui.css` mask 对比；放大渲染 38 个补画图标目检；按用法上下文抽查对照表里只出现 1 次和语义易混的映射（发现 M2、m2）。
3. 用 `git grep` 在基线重算 Ionicons 文件清单，与允许清单逐行对比；用 Ionicons `glyphMap` 扫描清单文件中的图标名，确认对照表无遗漏。
4. 门禁注入 4 组（新组件 import、`export *`、副作用 import、删一加一替换），每组后立即删除注入文件 / `git checkout` 还原。
5. SC-01 端到端（改 `minus` → 生成 → 同步 → 展示页 → 测试）与两处手改拦截，结束后 `git checkout` 还原，并确认展示页回到原路径。
6. Playwright 截取 Web 展示页浅 / 深并读取 DOM 属性与计算颜色；GitNexus `impact OrbitNavigationIcon`。
7. 两端全量、typecheck、lint（见上）。
8. 没有启动 App 模拟器或 Metro，没有连 Neon，没有部署，没有调用付费 AI；没有改产品代码、没有提交。最后 `git status`：除本文件外，复核人没有留下改动。复核期间工作区新出现了 `docs/designs/redesign-2026-10/sprints/R03-copy-and-ja/` 下 3 个未跟踪文件（`glossary.md`、`research.md`、`style-guide.md`），不是复核人创建的，应来自同时进行的 R03 会话，未触碰。

## 处理记录（执行人，2026-10-10）

修在 `redesign` 上（RD-25），代码提交 `ac07300af`。

| 问题 | 修法 | 状态 |
| --- | --- | --- |
| **M1** 清单只卡条数 | `tests/ionicons-ratchet.test.ts` 写死开工时的 72 个文件（`OPENING`），清单必须是它的子集；注释写明「永远不要往里加」。注入复测：删掉 `AppScreen.tsx`、换进新屏 `src/screens/zz/NewScreen.tsx`（条数不变）→ 失败（`ionicons-ratchet-injection.txt`「注入 5」）。 | 已修 |
| **M2** `mail-unread-outline` 配错 | 对照表改为 `send`，说明写明旧屏用法是收件箱对话里的 App 内「发送消息」按钮，不是邮件代发（是否保留这个按钮由 R13 决定）。 | 已修 |
| **M3** SC-04 缺模拟器截图 | **未在 R02 关闭，转 R04 / R05。** 原因与复核一致（模拟器未授权、`.env.local` 指向正式环境）。R04 本来就要重建模拟器开发包并走查，届时按 m6 的办法指向本地服务器后补截底栏；R05 改底栏时再截一次。 | 转 R04 |
| **m1** 裸 import | 正则加上 `import "@expo/vector-icons"` 形式，自测样例补一条。 | 已修 |
| **m2** 语义可商榷 | `diamond-outline` 改为补画的 `gem`（不再与「收藏」撞义）；`merge` 重画为两条线汇成一条向下的箭头。补画数 38 → 39，对照表和展示页同步。 | 已修 |
| **m3** `compare.png` 缺图 | 截图脚本等所有图片加载完再截；6 张图齐全，已重截（含新的 gem / merge）。 | 已修 |
| **m4** TestFlight 看不到展示页 | 按 R04 PLANNER，构建渠道变量在 R04 接入（`EXPO_PUBLIC_ORBIT_SHOWCASE=1`）。 | 转 R04 |
| **m5** 原生无障碍无运行时覆盖；尺寸吸附 | `iconAccessibility(label, platform)` 导出并加测试，覆盖 ios / android / web 三个分支。尺寸吸附是有意设计（图标只有 16 / 20 / 21 / 24 四档），已在 REPORT 写明，不改。 | 已修 / 不改（有理由） |
| **m6** `.env.local` 指向正式环境 | 不改用户的 `.env.local`。R04 用 Expo 优先级更高的 `.env.development.local`（本地、不入库）把开发包指向本地服务器，并先确认打包产物里不再出现正式地址再启动模拟器。 | 转 R04 |

### 修复后全量（`ac07300af`）

| 项目 | 结果 |
| --- | --- |
| App `npm test` | 4097 条，4096 通过，1 失败（已知 `route-parity` `/start`） |
| App `tsc` | EXIT 0 |
| orbits `npm test` | 6845 条，5968 通过，5 失败（DEP0205 ×5，基线），872 跳过 |
| orbits `typecheck` / `typecheck:app` / `lint` | 0 / 0 / 0 |
| detect-changes | 8 个文件、3 个符号，受影响流程 0 |
