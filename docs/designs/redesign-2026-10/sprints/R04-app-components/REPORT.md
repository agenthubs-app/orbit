# Sprint R04 — REPORT

**执行人：** 小雨的执行会话，2026-10-10。**依据：** PLANNER 修订 2、README 通用规则、RD-14（修订）、RD-15、RD-16、RD-17、RD-24、RD-25。
**基线：** `redesign` `8a904dbd`（R03 复核修复后：App 4111 条 / 1 已知失败；orbits typecheck:app 0）。
**提交：** 代码 `c5e1bab8`；本 REPORT 在其后。
**证据：** `~/orbit-sprint-evidence/redesign/R04/run-01/`（`compare.html` 对照页、`screens/` 展示页与设计稿截图、`sim/` 模拟器开发包截图、`expo-doctor.txt`、`app-test.log`、`app-tsc.log`、`orbits-typecheck-app.log`、`detect-changes.txt`）。

## 做了什么

1. **原生依赖**（SC-04 子表）：`expo-blur ~57.0.3`、`expo-haptics ~57.0.3`、`react-native-gesture-handler ~2.32.0`、`react-native-reanimated 4.5.1`（及其要求的 `react-native-worklets 0.10.1`），都是 `expo install` 按 SDK 57 给的版本，`expo-doctor` 没有对这 5 个报版本问题；`react-native` 从 `"latest"` 锁成实际安装的 `0.86.0`。`expo prebuild` + `pod install`（`RNReanimated`、`RNGestureHandler`、`ExpoHaptics`、`ExpoBlur`、`RNWorklets` 都进了 Podfile.lock）+ Debug 模拟器构建成功，开发包在 iPhone 17 Pro 模拟器上启动、进入登录页、打开展示页均正常（`sim/01-launch.png`、`sim/10-showcase-top.png`）。
2. **组件库** `repos/orbit-app/src/components/ui/`，从 `index.ts` 统一导出（用法见「交接」）：
   - 基础：`Button`（primary / accent / secondary / ghost / danger / dangerGhost / dangerSoft；md / sm；block；loading）、`IconButton`（40 / 34，红点）、`Card`（default / flat / line）、`Chip`（7 色）、`Avatar` / `AvatarStack`、`MacTile`、`ListRow`、`SwipeRow`（≤3 个动作、阈值 50、跟手）、`SearchField`、`TextField`（字段错误）、`Accordion`、`UiText`、`UiPressable`（按下 .96 + 轻触感）。
   - 反馈：`ToastProvider` / `useToast()`、`ConfirmDialog`、`ActionSheet`、`BottomSheet`、`FullDrawer`，以及给非组件代码用的 `presentConfirm()` / `presentActionSheet()`。
   - AI：`ConfirmCard`（pending / success / failure 原位变化）、`WhyDisclosure`。
   - 控件：`Toggle`、`CheckCircle`（`ok` 绿 + 成功触感）、`Checkbox`、`Radio`、`Segmented`、`SwipeSegments`、`FilterOption`、`CategoryTabs`、`ProgressBar`、`RingChart`、`CountUp`。
   - 状态：`EmptyState`（guide / steps / ghost rows）、`Skeleton`（8 秒后提示重试）、`OfflineBar`（恢复后薄荷色 2 秒收起）、`RetryCard`、`DegradedCard`、`SampleTag` / `SampleBar`、`QuotaChip`、`GlassSurface`（expo-blur）。
   - 统一行为：`useReducedMotion()`（系统设置，展示页可强制开关）为真时，位移、缩放、闪烁、数字滚动全部关闭，只留淡入。
3. **展示页** `/showcase/components`（`app/showcase/components.tsx` → `src/screens/showcase/ComponentShowcaseScreen.tsx`）：所有组件和状态，可切换浅色 / 深色 / 跟随系统、减少动效；字号跟随系统设置。可见性与 R02 / R03 展示页相同（`showcaseEnabled()`：开发包，或构建时 `EXPO_PUBLIC_ORBIT_SHOWCASE=1` 的 TestFlight 包；正式版重定向回首页）。已登记 `app-wide-route-coverage` 的 `integratedFeatureRoutes` 和 `page-offline-inventory`（device-only），`docs/offline/page-inventory.md` 已重新生成（96 条路由）。
4. **根布局挂载**（`app/_layout.tsx`）：`GestureHandlerRootView`（最外层）、`UiPortalHost`、`ToastProvider`（主标签页上 `hasTabBar`，按 `mainTabForPath`）、`UiFeedbackHost`。
5. **保留的基础设施改用新组件**（逻辑与 props 不变）：
   - `AuthSessionProvider`：两处 `Alert.alert` → `presentActionSheet`（有未同步修改时注销：放弃并注销〔破坏性〕/ 保留并注销 / 取消）与 `presentConfirm`（换账号登录时旧账号有未同步修改）；没有宿主时一律按「取消」处理（不会误删数据）。
   - `AppErrorBoundary`：`createControlStyles` + 手写按钮 → `UiText` + `Button`（primary，带刷新图标）。
   - `OnlineOnlyBoundary`：旧 `NeedsNetworkState` + 手写返回 → `RetryCard` + `Button`（ghost，返回图标）。
   - `OrbitRouteAccessBoundary`：`Text` → `UiText`。
   - `scripts/audit-offline-read-surfaces.ts` 的「文件:行号」key 不涉及这几个文件，无需同步。
6. **删除** `MetricPill`（0 处引用），`app-wide-primitives` 测试里对应断言一并删除。
7. **旧写法门禁** `tests/legacy-ui-ratchet.test.ts`（AST 统计，规则见「交接」）。开工快照 `tests/fixtures/legacy-ui-opening.json`（哈希写死在测试里）：**88 个文件；`Alert.alert` 15、直接 `<Modal>` 11、手写 `tablist` 9、旧公用组件 203、旧 `design/controls` 48**。基础设施改完后允许清单 `tests/fixtures/legacy-ui-allowlist.json`：85 个文件；13 / 11 / 9 / 202 / 47。
8. **测试**：`ui-logic`（滑动阈值、弹层 80% 规则、Toast 规则等纯函数）、`ui-toast`、`ui-dialog`、`ui-components-render`（Playwright + esbuild + react-native-web 渲染真实组件）、`legacy-ui-ratchet`；`auth-session-provider-races` 改为替身 `feedback-requests`（22 条通过）。

## 验收

| SC | 结论 | 证据 |
| --- | --- | --- |
| 01 组件齐全且对得上设计 | ✅ | `compare.html`：展示页 浅 / 深 × 390 / 320 × 1× / 2× 字号（5 张，横向溢出 0）；确认框 / 动作表 / 底部弹层 / 抽屉 / Toast 的打开态与设计稿对应画板逐个并排（`pairs/`）；模拟器开发包实拍展示页。「完成」相关（`CheckCircle`、`ConfirmCard` 成功态、`Chip` 的 `ok` 色、左滑「完了」）用 `ok` 绿；深色 Toast 是深色胶囊（`ui-toast` 断言 + 截图） |
| 02 行为正确 | ✅（逻辑与 web 渲染）/ ⚠️ 原生手势见「已知例外」 | `ui-toast`（撤销、顶替、出错常驻、卸载后撤销不执行）、`ui-dialog`（破坏性默认焦点在取消、点遮罩不关闭、返回键 = 取消、命令式 API）、`ui-overlays`（Toast 在打开的弹层之上可点、动作表焦点在安全选项、点遮罩 / 返回关闭弹层、键盘弹出时弹层顶部不出屏）、`ui-logic`（左滑 72 / 50 / 26、弹层 80% 与下拉 1/4 或快速下滑关闭） |
| 03 无障碍与减少动效 | ✅ | `ui-components-render`：组件集合的可点元素触控区 ≥44（含 hitSlop）、2× 字号 320 宽横向和纵向都不截断（展示集合 + 确认框 / 动作表 / 抽屉；分段控件在 iOS 缩字，web 豁免）、浅深对比度、数字 / 进度 / 骨架在减少动效下静止；`ui-overlays`：打开的弹层和三种 Toast 的触控区 ≥44，减少动效下弹层和 Toast 从第一帧起没有位移（含只开系统设置的情况） |
| 04 旧写法只减不增 | ✅ | `legacy-ui-ratchet`（9 条）：开工快照哈希、清单外为 0、清单只减（对开工快照，且不高于任何一个已提交的清单版本）、基础设施和 `ui/**` 0 处且不可入清单、`tablist` 只允许 `Segmented` / `Filters` / 底栏三个文件、旧组件归零时必须删文件（其他旧组件也算使用者）、按符号统计的注入样例（`RN.Alert`、解构 `alert`、`Modal as Sheet`、`RN.Modal`、`role="tablist"`、表达式和 props 对象里的 tablist、再导出）。扫描器加强后用基线 `8a904dbd` 重扫，结果与开工快照逐文件一致，快照和哈希不变。`package.json` diff + `expo-doctor.txt` |
| 05 基础设施改完不坏 | ✅（测试）/ ⚠️ 模拟器走查部分完成 | 原有测试全部通过（App 全量零新增失败，见下表）；`auth-session-provider-races` 22 条覆盖注销 / 换账号 / 会话失效分支；模拟器上开发包启动后未登录直达登录页（访问边界生效）。登录 / 登出 / 离线边界 / 错误边界的模拟器点按走查未做，见「已知例外」 |
| 06 原生能力真实可用 | ⚠️ 部分 | 开发包重建后原生模块全部加载（启动、渲染展示页、毛玻璃组件渲染无报错）；**左滑跟手、弹层拖动、触感未能在模拟器上用自动化验证**，见「已知例外」 |

### 必需证据子表

| SC | 子断言 | 结论 |
| --- | --- | --- |
| 01 | 「完成」用 `ok` 绿；深色 Toast 深色胶囊 | ✅ 截图 + `ui-components-render` / `ui-toast` |
| 02 | 破坏性确认默认焦点在取消，点遮罩不关闭 | ✅ `ui-dialog` |
| 04 | `react-native` 已锁定；新依赖与 SDK 匹配 | ✅ `0.86.0`；`expo-doctor` 未对新依赖报错（它报的 3 项是旧问题，见「后续」） |
| 04 | 允许清单初始条数 | ✅ 上文第 7 条 |
| 05 | `audit-offline-read-surfaces` key | ✅ 无移动 |
| 全部 | 全量零新增失败；`tsc` 0；`detect-changes` | ✅ 见下表与 GitNexus 一节 |

## 自定决定（用户指示：疑问一律选推荐方案，写明理由）

1. **弹层不用 RN `<Modal>`，用根部唯一的 Portal 宿主**。对标：`@gorhom/portal`、React Navigation 的 overlay 做法；理由：RN Modal 每个是独立原生窗口，Toast 无法盖在 Modal 之上、多个 Modal 叠放和返回手势各自为政；一个宿主让「后打开的在上面」成立，也让门禁可以禁止直接 `<Modal>`。`ToastProvider` 包在 `UiPortalHost` 外面，Toast 画在弹层之后，所以弹层打开时 Toast 仍在最上、可点（复核 M1 后改正；`ui-overlays` 验证）。
2. **给非组件代码一个命令式 API**（`presentConfirm` / `presentActionSheet`，返回 Promise）。对标：iOS `UIAlertController` present、旧 `Alert.alert` 的用法；理由：`AuthSessionProvider` 这类 Provider 在宿主之上、拿不到 hook。没有宿主时按「取消」返回，绝不默认执行破坏性操作。
3. **「有未同步修改时注销」用动作表（三选一），「换账号」用确认框（二选一）**。对标：iOS HIG——两个以上选择、其中含破坏性选项用 action sheet；二选一确认用 alert。破坏性选项放第一位标红，取消单独在底部。PLANNER 易错边界写「破坏性操作必须仍是确认框，默认焦点在取消，点遮罩不关闭」：三选一放不进确认框，所以按其本意落实为「动作表默认焦点在安全选项（〜を続ける）」——`ActionSheet` 的 `defaultFocusKey`，缺省为第一个非破坏性选项，与设计稿 ② 动作表的焦点位置一致（复核 M5）；点遮罩 / 返回 / 无宿主都按取消。请产品负责人事后确认，若坚持确认框，改为两步（先选「放弃 / 保留」，放弃再确认）。
4. **门禁对 `tablist` 豁免 `src/components/ui/**` 和 `OrbitTabBar`**：它们就是被允许的唯一实现（`Segmented`、`CategoryTabs`、底栏），否则门禁会拦住组件库本身。开工快照在加豁免后生成。
5. **`react-native` 锁 0.86.0**（PLANNER：锁成实际安装的版本），不顺手升 0.86.3：升级会动 Hermes 和全部原生依赖，属于单独一次升级（见「后续」）。
6. **按钮 md 高 44（设计稿 40）**、sm 32 + hitSlop 6、`IconButton` 34 + hitSlop。对标 iOS HIG 最小触控 44pt；设计稿在桌面浏览器里按 40 画，实际 App 以 44 为准。旧 `app-wide-primitives` 测试对重试按钮要求 50（旧控件的高度）→ 改为 44 并注明。
7. **Web / 测试打包不引入原生模块**：`haptics.native.ts`（真触感）/ `haptics.ts`（空实现），`svg.native.ts`（react-native-svg）/ `svg.ts`（DOM `<svg>`）。对标：React Native 平台扩展名惯例（Metro 原生构建优先取 `.native.ts`）。理由：基础设施改用新组件后，几十个用 esbuild 打包真实屏幕的旧测试会被 `expo-modules-core` / RN 内部文件打断（第一次全量 1173 条失败）；这样改不需要逐个测试加替身，展示页在 web 上也能正常显示。原生构建行为不变。
8. **手势辅助函数标 `"worklet"`**（`swipe-logic`、`sheet-logic`）：Reanimated 的手势回调在 UI 线程执行，调用的函数必须是 worklet；在 JS 里仍是普通函数，单测不受影响。
9. **分段控件在大字号下限制放大（1.4×）并缩字适配**。对标 `UISegmentedControl`（等宽分段不随 Dynamic Type 无限放大，长按看大字）；完整文字保留在 `accessibilityLabel`。320pt + 2× 字号下四段原本被省略号截断。
10. **展示页路由用 `/showcase/components`**（PLANNER 写 `app/dev/components.tsx`，「按现有约定定」）：R02 / R03 已经是 `/showcase/icons`、`/showcase/copy`，沿用；TestFlight 显示方式也沿用 `EXPO_PUBLIC_ORBIT_SHOWCASE=1`（R02 复核 m4）。展示页的分节名用英文标识（开发者页面），示例文字一律取标准用词。**字号不做页内开关**（复核 m5）：iOS 的大字号是系统级的 Dynamic Type，页内放大不能模拟 `maxFontSizeMultiplier` 等真实行为；在模拟器用「设置 › 辅助功能 › 更大字体」或 `xcrun simctl ui <设备> content_size accessibility-extra-large` 检查。浅 / 深按钮只做预览，离开展示页时恢复用户原来的外观设置。
11. **危险按钮底色用 `coralText`（不是 `coral`）**：白字在 `coral` 上对比度不到 4.5；`coralText` 达标且观感仍是「危险红」。
12. **`OnlineOnlyBoundary` 改用 `RetryCard`，旧 `NeedsNetworkState` 不删**：还有 14 个旧屏在用，按门禁留到最后一个使用者被重写时删除。
13. **模拟器只连本地服务器**：`repos/orbit-app/.env.local` 指向正式环境，没有改它；新增被 gitignore 的 `.env.development.local`（`http://localhost:3000`），Expo 在开发模式下它优先级最高；核对过开发包实际生效的地址是本地（`.env.local` 只作为一个被覆盖的 env 文件模块出现在开发包里）。模拟器上原本没装过 Orbit，所以也没有存下来的服务器地址。
14. **左滑行对读屏是一整行**：行本身可聚焦，左滑动作作为它的自定义动作（iOS 邮件同样做法），藏在行面下的按钮对读屏隐藏，避免同一动作出现两次（复核 m10）。「完了」类左滑动作和 chip 用 `ok` 色（RD-17，复核 m2）。
15. **Toast 可带一个动作按钮**（出错时「再試行」、info「開く」），与撤销互斥，规则同撤销：调用的页面卸载后按钮移除（复核 m9，对照 01-system ①）。
16. **系统「减少动效」整个 App 只读一次**（模块级缓存 + 一个监听），之后出现的弹层 / Toast 第一帧就知道；`useReducedMotion()` 签名不变（复核 M7；impact CRITICAL，因为所有按钮都经过它，全量回归零新增）。
17. **列表行在大字号下换行**（`ListRow` 字号倍数 >1.2 时标题 / 副标题最多 3 行）。对标 iOS 表格单元格：大字号下文字换行，不截成省略号（复核 M3 的新检测找到的）。

## 基线 → 收口

| 项目 | 基线 `8a904dbd` | 收口 | 对照 |
| --- | --- | --- | --- |
| App `npm test` | 4111 条，1 失败（`route-parity`） | **4140 条，4139 通过，1 失败**；复核修复后 **4151 条，4149 通过，2 失败** | 复核修复后：`route-parity`（已知）+ `ink-signal-card-review`「wide-dark」（跑全量时同时在截图，CPU 争用；单独重跑 2 次 31/31 通过，R04 未碰该屏）。零新增 |
| App `tsc` | 0 | **0** | |
| orbits `typecheck:app` | 0 | **0** | R04 未改 orbits（`npm test` / `lint` 未重跑） |

中途问题（已解决）：基础设施引入组件库后第一次全量 1173 条失败（旧测试打包拉进原生模块），由自定决定 7 解决；`theme-render` 的语义比对把图标的主题色当作结构差异 → 比对时忽略 SVG 颜色属性；`app-performance-wiring` 的根布局替身补上新挂载的宿主。

## GitNexus

- `confirmPendingWriteSignOut`：HIGH（6）。对策：三种结果（keep / discard / cancel）与原来一一对应，`auth-session-provider-races` 22 条覆盖。
- `OnlineOnlyBoundary` LOW（1）、`NeedsNetworkPage` LOW（2）、`AppErrorScreen` LOW（3）、`OrbitAuthLoading` LOW（2）：只换视觉，props 不变。
- `RootLayout`：UNKNOWN（expo-router 按约定加载默认导出，没有静态调用方）；文本确认只有 `app-performance-wiring` 测试直接打包它，已更新。
- 复核修复：`useReducedMotion` CRITICAL（所有按钮经 `UiPressable` 用它；签名不变，只改为同步缓存）、`UiPortal` / `BottomSheet` / `ActionSheet` HIGH（新增可选参数，旧调用不变），`legacyCounts` UNKNOWN（测试工具，只被门禁测试用）。**detect-changes（复核修复提交前）：23 个已跟踪文件、68 个符号、受影响流程 0，风险 low**（`detect-changes-reviewfix.txt`）。
- **detect-changes（提交前）：19 个已跟踪文件、39 个符号、受影响流程 0，风险 low**（`detect-changes.txt`；新建的 `ui/**` 等未跟踪文件不计入；列表里的 `bridge/handoffs.md` 是用户自己的未提交文件，不在本次提交里）。

## 交接

- **组件怎么用**：一律从 `src/components/ui` 导入。新屏不要直接写 `Pressable` + 样式当按钮，用 `Button` / `IconButton` / `ListRow`；固定说法读 `useStandardCopy()`。
- **Toast 还是确认框**：
  - 操作已经完成、可撤销 → `toast.success(msg, { undo })`（5 秒后消失）；需要更长时间可撤销（如交换名片）→ 加 `keep: true` 和 `sub`（撤销条：不倒计时，直到关闭）；页面卸载后撤销不再执行；
  - 操作失败 → `toast.error(msg, { action: { label: copy.action.retry, onPress } })`（不自动消失）；
  - 不可撤销的破坏性操作 → 先 `ConfirmDialog`（`destructive`，默认焦点在取消、点遮罩不关闭）；三个以上选择或带后果说明 → `ActionSheet`；
  - 在组件外（Provider、工具函数）→ `presentConfirm` / `presentActionSheet`。
  - App 一次只显示一条 Toast，新的顶替旧的。
- **键盘**：`BottomSheet` 在键盘弹出时把最大高度降到键盘以上（安全区和 12pt 间距之下），内容多时在弹层内滚动。
- **减少动效**：`useReducedMotion()`（系统设置；`ReducedMotionOverride` 可在展示页 / 测试里强制）。新组件凡是位移、缩放、闪烁、数字滚动，都要在它为真时关掉，只保留淡入。
- **手势**：用 `react-native-gesture-handler` + Reanimated；手势回调里调用的辅助函数要标 `"worklet"`。
- **只在原生上有的能力**放 `*.native.ts`，同名 `*.ts` 给 web / 测试一个等价的空实现或 DOM 实现。
- **旧写法门禁**：允许清单 `repos/orbit-app/tests/fixtures/legacy-ui-allowlist.json`（文件 → 各类条数）。规则：清单外 0；条数只减，下降必须同步改小；文件删除或归零就删行；不能超过开工快照；基础设施与 `ui/**` 永远为 0。某个旧公用组件的使用点归零时，测试要求同时删除该组件文件。功能 Sprint 重写旧屏时从清单移除；合回 `chat-agent` 前要求清单为空（RD-24）。
- **展示页**：开发包里打开 `orbit://showcase/components`；TestFlight 构建时加 `EXPO_PUBLIC_ORBIT_SHOWCASE=1`。
- **模拟器跑开发包**：保留 `.env.development.local` 指向本地；起 Metro 时**不要带 `CI=1`**（CI 模式关闭文件监听，改了代码不会重新打包——本次因此看到过旧代码）。

## 已知例外

- **原生手势与触感未自动化验证（SC-02 / SC-06 的原生部分）**：模拟器面板未授权给会话，这台机器的 Xcode 也没有 Simulator 图形界面；改用临时 XCUITest 工程驱动已安装的开发包时，打开深链（系统确认框）能点，但对 App 内的点按 / 拖动不生效（开关点了不变，每一步都等几分钟「App 空闲」——展示页里有常驻的加载转圈和骨架闪烁）。所以左滑跟手、弹层拖动、触感、毛玻璃效果只验证了「原生模块加载、组件渲染无报错」和纯逻辑 / web 渲染测试，**需要人在模拟器或真机上手动过一遍展示页**（左滑一行、拖动弹层、点开关和完成勾感受触感、滚到底看毛玻璃；复核后加两项：打开弹层后点「toast error」，Toast 应在遮罩之上；弹层里点输入框弹出键盘，弹层顶部和输入框应可见）。手动走查时如果左滑不跟手，先确认 Metro 不是 `CI=1` 启动。
- **登录 / 登出 / 会话失效 / 离线边界 / 错误边界的模拟器走查未做**：同上无法点按，且需要本地测试账号登录。由 `auth-session-provider-races`（22 条）、`app-error-boundary-source`、`app-wide-primitives`（错误页渲染、重试可点）覆盖；和上一条一起手动过。
- **R02 复核 M3（模拟器底栏截图）仍未补**：底栏只在登录后出现，同样卡在无法点按登录。转 R05（导航壳 Sprint 本来就要在模拟器上验收底栏）。
- **web 截图里分段控件在 320 + 2× 下有省略号**：iOS 上 `adjustsFontSizeToFit` 会缩字，web 不支持该属性。

## 后续（不属于 R04 范围）

- `expo-doctor` 报的 3 项旧问题：`@expo/vector-icons` 缺 `expo-font` peer（R02 之后旧屏仍用 Ionicons，随 Ionicons 清零一起处理或直接补装）；Hermes V1 内存回归，需升 `expo@57.0.9+` / RN `0.86.2+`；17 个包有补丁版本落后。建议单独做一次「SDK 57 补丁升级」，升完重建开发包、跑全量。
