# Sprint R04 — App 组件库

**Plan revision:** 2（2026-10-09：按用户决定收窄范围。修订 1 要在骨架里把各旧屏的 `Alert.alert`、自用 `Modal`、手写分段和旧公用组件全部替换并删除；这些旧屏之后都会被功能 Sprint 整屏重写并删除，见 RD-24，所以改为「组件库 + 展示页 + 会保留的基础设施改用新组件；旧屏原样保留，旧写法用门禁只减不增」）。**模式:** existing-codebase / single-generator（执行人：小雨）。
**单一目标:** 在 `repos/orbit-app/src/components/ui/` 建立五类通用组件与展示页；会保留的基础设施（访问边界、离线边界、错误边界、`AuthSessionProvider`）改用新组件；旧写法和旧公用组件用门禁只减不增，留给功能 Sprint 整屏重写时清掉；加入原生依赖并锁定 `react-native` 版本。
**易读目标:** [GOAL.md](GOAL.md)。
**基线:** R01、R02、R03 合入后的 `redesign` HEAD。
**进入条件:** R01（token）、R02（`Icon`）、R03（文案源、字典拆分）completed。RD-14（修订）、RD-15、RD-16、RD-17、RD-24 已定。

## 已查清的事实（按 `9d404c1c8`）

1. **现有公用组件**（`src/components/`，引用数为文件数）：`ErrorState` 46、`LoadingState` 41、`DataCard` 36、`OfflineNotice` 36、`EmptyState` 26、`NeedsNetworkState` 14、`SectionHeader` 2、`MetricPill` 0（`tests/today-tasks-screen-source.test.ts:27` 断言 Today 不用它）。逻辑类组件 `OrbitRouteAccessBoundary`（74）、`OnlineOnlyBoundary`（35）、`AppErrorBoundary`（2）**不在替换范围**，只把它们渲染的视觉部分换成新组件。
2. **缺失**：没有 Toast、Sheet、Dialog、Switch、Segment、Chip 组件。`<Modal>` 在 9 个屏幕各自直接用（如 `TaskDetailScreen`、`AiScreen`、`LivePersonSheet`）；分段控件 9 处各自写 `accessibilityRole="tablist"`（如 `TasksScreen.tsx:149,244`、`ScheduleScreen.tsx:279`、`RelationshipInboxScreen.tsx:1031`、`EventsScreen.tsx:361`、`NotesScreen.tsx:77`）；`Alert.alert` 15 处分布在 11 个文件（活动 / 人脉名片相关和 `AuthSessionProvider`）；`<Switch>` 0 处。
3. **依赖**：`package.json` 有 `react-native-svg`、`react-native-safe-area-context`、`expo-router`；**没有** `react-native-gesture-handler`、`react-native-reanimated`、`expo-blur`、`expo-haptics`；`"react-native": "latest"` 未锁定。
4. **主题接入**：`createThemedStyles` / `useOrbitTheme`（R01 后取新 token）；`tests/theme-wiring.test.ts:15-32` 禁止 `.tsx` 以值方式 import `colors`。
5. **渲染测试方式**：`tests/theme-render.test.tsx` 用 react-native-web 渲染组件成 HTML 检查对比度与明暗；`tests/ink-signal-*.test.ts` 用 Playwright + esbuild 夹具渲染真实组件（`ink-signal-shell.test.ts:31-90`）。没有 Jest 快照。
6. **设计规格**（`kit/ui.css`、`01-system.html`）：按钮高 40 / 小 32、胶囊、按下 scale .96（:161-167），危险三态（:348-350）；圆钮 40 / 34（:87-93, 168）；卡片圆角 24、内边距 18、`.flat` / `.line`（:117-120），靠浅色块分层不靠阴影（`01-system.html:187,215`）；chip 3/9、11/700、7 色、最大宽 160（:146-149）；头像 38 / 30 / 56、叠放 -8（:153-158）；列表行（:186-191）；左滑行：动作钮宽 72、阈值 50、最大 -170（:194-202，`kit.js:153-161`）；搜索 44、输入 44 / 圆角 14（:234, 288）；折叠 350ms（:213-217）；Toast（:327-345，规则 `01-system.html:288-310`：墨色胶囊、主句 ≤16 字、一个按钮、5 秒倒计时线、出错不自动消失、撤销条不倒计时、App 一次一条、有底栏 bottom 100 / 无底栏 40）；确认框 296 / 圆角 28、取消在左、放不下竖排（:353-360），规则 `01-system.html:313-333`；动作表钮高 46（:361-363）；底部弹层圆角 34、抓手 38×5、超过 80% 高固定上沿（:238-239）；全高抽屉 318；骨架屏 shimmer 1.6s、超过 8 秒提示重试（:246，`01-system.html:445-450`）；AI 确认卡三态（:377-385，规则 `01-system.html:386-391`）；「?」依据（:292, 388-389）；开关 44×26（:403-410）；完成勾 22、多选 20、单选 18（:411-429）；分段 `.seg` 与 Task 四等分 `.tseg`（:34-36, 721-728）；筛选 `.fopt` / `.cat`（:394-400）；进度条 6 / 细 4（:172-177）；环形图（`kit.js:54-64`）；数字滚动 1100ms（`kit.js:125-131`）；示例角标、配额条、离线条、降级卡、字段错误（`01-system.html:119-142, 465-469`）；空态 guide / step / ghost-row（:220-231）。动效时长见 R01 token。
7. **设计矛盾的决定**（RD-17）：「完成」一律用 `ok` 绿；深色 Toast 仍是深色胶囊（比背景亮一档的面色 + 浅色字）。

## 上下文包

### 必读
- `kit/ui.css`、`kit/kit.js`、`01-system.html`（组件、交互规则 :222-232, 288-391, 445-469, 593）、`IMPLEMENTATION-PLAN.md` §3.4–3.5。
- App：`src/components/*`、`src/design/*`、上面列出的 Modal / 分段 / Alert 使用点、`theme-render.test.tsx`、`ink-signal-shell.test.ts`（夹具做法）。

### 关键符号与 impact（开工时重跑）
- `ErrorState`、`LoadingState`、`DataCard`、`OfflineNotice`、`EmptyState`、`NeedsNetworkState` — 每个 14–46 处引用，按 HIGH 处理。**本 Sprint 不改不删**，只登记进旧组件允许清单；最后一个使用者被功能 Sprint 删除时由该 Sprint 删掉组件。
- `OrbitRouteAccessBoundary`（74）、`OnlineOnlyBoundary`（35）、`AppErrorBoundary`（2）的视觉部分改用新组件 — 逻辑和 props 不变，跑 impact 后按 HIGH 处理；若改动让 `scripts/audit-offline-read-surfaces.ts:22-39` 的「文件:行号」key 移动，同步更新。
- `AuthSessionProvider` 的 `Alert.alert` — 登录路径，HIGH；替换后走一遍登录、登出、会话失效。

### 易错边界（全部写进 SC）
Toast 撤销回调在页面卸载后仍执行；确认框打开时返回手势或硬件返回键的行为；弹层里的键盘遮挡输入框；左滑行和页面纵向滚动冲突；减少动效时弹层仍有位移；2 倍字号下按钮文字裁切；深色下骨架屏不可见；替换 `Alert` 后丢失原来的确认语义（破坏性操作必须仍是确认框，默认焦点在「キャンセル」，点遮罩不关闭）。

## 契约（本 Sprint 定稿，REPORT 交接）

- 目录 `src/components/ui/`，每个组件一个文件，统一从 `src/components/ui/index.ts` 导出。组件只从 token 取颜色、圆角、字号、时长，只从文案源取固定说法。
- **旧写法门禁（ratchet）`legacy-ui-ratchet`**：
  - 新代码零容忍：`src/components/ui/**`、导航壳，以及之后功能 Sprint 新建的屏幕，不得使用 `Alert.alert`、直接 `<Modal>`、手写 `accessibilityRole="tablist"`、旧公用组件（`DataCard`、旧 `EmptyState`、`ErrorState`、`LoadingState`、`OfflineNotice`、`NeedsNetworkState`、`SectionHeader`、`MetricPill`）、旧 `controls.ts`；
  - 旧屏只减不增：开工时把现有使用点按「文件 → 条数」记成允许清单 `tests/fixtures/legacy-ui-allowlist.json`；清单外出现即失败；清单内条数只能减少；文件删除后必须移出清单；
  - 某个旧组件的使用点归零时，测试要求同时删除该组件文件；清单清空的进度由功能 Sprint 推进，合回 `chat-agent` 前的总验收要求清单为空（RD-24）。
- **基础**：`Button`（`variant`: primary / accent / ghost / danger / dangerGhost / dangerSoft；`size`: md / sm；`block`）、`IconButton`（40 / 34，可带红点）、`Card`（default / flat / line）、`Chip`（7 色，`label` ≤8 字，不可点）、`Avatar`（38 / 30 / 56，马卡龙色，`AvatarStack`）、`MacTile`、`ListRow`、`SwipeRow`（最多 3 个动作，阈值 50）、`SearchField`、`TextField`（含字段错误态）、`Accordion`。
- **反馈**：`ToastProvider` + `useToast()`（success / error / info；`undo` 选项生成撤销条；一次一条，新的顶替旧的；位置随是否有底栏变化）、`ConfirmDialog`（296；破坏性默认焦点在取消；点遮罩不关闭）、`ActionSheet`、`BottomSheet`（可拖动、抓手、80% 规则、键盘避让）、`FullDrawer`（318）、按钮加载态。
- **AI**：`ConfirmCard`（`state`: pending / success / failure，原位变化）、`WhyDisclosure`。
- **控件**：`Toggle`、`CheckCircle`（绿）、`Checkbox`、`Radio`、`Segmented`（含可横滑的 Task 分段 `SwipeSegments`）、`FilterOption`、`CategoryTabs`、`ProgressBar`、`RingChart`、`CountUp`。
- **状态**：`EmptyState`（新，guide / steps / ghost rows）、`Skeleton`、`OfflineBar`（「待機中 N」→ 恢复后变薄荷色 2 秒收起）、`RetryCard`、`DegradedCard`、`SampleTag` / `SampleBar`、`QuotaChip`。
- **统一行为**：按下 scale .96 + 轻触感；触控区 ≥44；2 倍字号不裁切；`useReducedMotion()` 为真时只保留淡入（位移、缩放、闪烁、数字滚动全部关闭）。
- **展示页**：`app/dev/components.tsx`（路由名开工时按现有约定定），可切换浅色 / 深色、字号倍数、减少动效；只在开发包与 TestFlight 可见、正式版隐藏（RD-15），区分方式开工时查现有构建渠道机制，没有就新增一个公开环境变量并写进 REPORT。
- **原生依赖**：加 `react-native-gesture-handler`、`react-native-reanimated`、`expo-blur`、`expo-haptics`（版本按当前 Expo SDK 推荐）；`react-native` 锁定为当前 `node_modules` 实际安装的版本。重建模拟器开发包验证；TestFlight 构建按现有流程，需要时另行授权。

## 范围与文件

- **新建**：`src/components/ui/**`、展示页路由、对应测试。
- **修改**：
  - `OrbitRouteAccessBoundary` / `OnlineOnlyBoundary` / `AppErrorBoundary` 的视觉部分；
  - `AuthSessionProvider` 的 `Alert.alert`；
  - `package.json` 和锁文件；`app.config.*`（如插件需要）。
- **删除**：`MetricPill`（0 处引用）。其余旧公用组件和旧 `controls.ts` 留到使用点归零时删除（见门禁）。
- **登记**：
  - 展示页路由登记到 `tests/app-wide-route-coverage.test.ts` 的 `integratedFeatureRoutes`；
  - `scripts/page-offline-inventory.ts` 登记为 `device-only`，然后重新生成 `docs/offline/page-inventory.md`；
  - 行号移动后更新 `audit-offline-read-surfaces.ts` 的 key。
- **测试**：
  - 新增 `ui-components-render.test.tsx`（每个组件：明暗对比度、触控区、2 倍字号、减少动效）、`ui-toast.test.tsx`（撤销、顶替、出错不消失、卸载后不执行）、`ui-dialog.test.tsx`（焦点、遮罩、返回）、`legacy-ui-ratchet.test.ts`（规则见契约）；
  - 更新 `theme-render.test.tsx`，以及依赖旧组件的测试。
- **不做**：旧屏里 `Alert.alert` / `Modal` / 分段 / 旧公用组件的替换（各功能 Sprint 整屏重写时做，RD-24）；业务专用组件（首页组件框、计划构成条、日历、笔记 @ 标签等，归各功能 Sprint）；底栏和导航（R05）。

## 验收契约

| SC | 操作链 | 主证据 |
| --- | --- | --- |
| SC-R04-01 组件齐全且对得上设计 | 展示页列出全部组件和状态；每个组件与设计稿画板并排（浅色、深色、320 宽、2 倍字号） | 证据目录截图对照页 |
| SC-R04-02 行为正确 | Toast 撤销、顶替、出错常驻；确认框焦点和遮罩；弹层拖动和 80% 规则；左滑阈值 | `ui-toast`、`ui-dialog`、`ui-components-render` |
| SC-R04-03 无障碍与减少动效 | 所有组件触控区 ≥44；2 倍字号不裁切；减少动效时只剩淡入 | `ui-components-render` |
| SC-R04-04 旧写法只减不增 | 在新组件或允许清单外的文件里用 `Alert.alert` / 直接 `Modal` / 手写分段 / 旧公用组件 → 测试失败；基础设施里 0 处旧写法 | `legacy-ui-ratchet.test.ts`（含注入样例验证） |
| SC-R04-05 基础设施改完不坏 | 原有测试通过；模拟器里走一遍：登录 / 登出 / 会话失效、无网络时的离线边界、无权限路由、错误边界 | 原有测试 + 模拟器截图 |
| SC-R04-06 原生能力真实可用 | 模拟器开发包重建后，左滑跟手、弹层拖动顺滑、毛玻璃生效、触感（真机或 REPORT 说明） | 模拟器录屏或截图 |

### 必需证据子表

| SC | 子断言 | 证据 |
| --- | --- | --- |
| 01 | 「完成」相关组件用 `ok` 绿；深色 Toast 是深色胶囊 | 截图 + 渲染测试 |
| 02 | 破坏性确认默认焦点在「キャンセル」，点遮罩不关闭 | `ui-dialog` |
| 04 | `react-native` 已锁定版本；新依赖版本与 Expo SDK 匹配 | `package.json` diff、`npx expo-doctor`（或等价检查）输出 |
| 04 | 允许清单的初始条数（按写法分类）写进 REPORT | REPORT |
| 05 | 若行号 key 移动，`audit-offline-read-surfaces` 已同步，离线读取审计通过 | 测试 |
| 全部 | 两端全量对照基线零新增失败；`tsc` 通过；`detect-changes` 写进 REPORT | 全量清单 |

## 执行顺序

1. 记录基线；跑 impact；统计旧写法使用点。
2. 加原生依赖、锁版本、重建开发包，确认能启动。
3. 组件逐类实现，测试先行；同时搭展示页。
4. 截图对照并修正。
5. 生成旧写法允许清单，接上门禁；基础设施改用新组件；删除 `MetricPill`；同步更新路由登记和离线清单。
6. 模拟器走查、全量测试、写 REPORT。

## 失败与交接

原生依赖装不上或开发包起不来：停下报告，不降级成纯 JS 实现（RD-14 已定加依赖）。

REPORT 交接内容：组件清单和用法、展示页入口、Toast 和确认框的使用规则（什么时候用哪个）、减少动效的实现方式、旧写法门禁的规则与允许清单位置（功能 Sprint 重写旧屏时从清单移除）。
