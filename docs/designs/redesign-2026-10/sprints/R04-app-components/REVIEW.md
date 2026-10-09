# Sprint R04 — REVIEW（独立复核）

**复核人：** 独立 AI 复核会话（不是执行人），2026-10-10。
**对象：** `git diff 8a904dbd..f76da719`（`c5e1bab8` 代码、`f76da719` REPORT + README），在 `redesign` HEAD `f76da719` 上复核。
**依据：** PLANNER 修订 2（唯一契约）、GOAL.md、README 通用规则 1–9、RD-14（修订）、RD-15、RD-16、RD-17、RD-24、RD-25；设计依据 `kit/ui.css`、`kit/kit.js`、`01-system.html`。REPORT 只作线索；下面每条结论都是复核人重跑、重读或注入验证得出的。
**基线：** `8a904dbd`：App 4111 条 / 1 失败（`route-parity` 的 `/start`）；App `tsc` 0。

## 结论：有条件通过

主体已经做到，复核人独立核实过：
- **组件齐全**：契约列出的五类组件都在 `src/components/ui/`，统一从 `index.ts` 导出。尺寸与 PLANNER「已查清的事实」第 6 条逐项对得上（按钮 md 改 44 属于有理由的自定决定）。
- **全量测试零新增失败**：复核人重跑 App `npm test`，4140 条，4139 通过，1 失败。失败的正是基线已知的 `native app has a route for every web app surface`（`/start`）。`npx tsc --noEmit` exit 0。`ui-*` 与 `legacy-ui-ratchet` 单独跑 26/26 通过。
- **旧写法开工快照确实反映基线**：复核人用 `git archive 8a904dbd` 导出基线的 `src/`、`app/`，用同一扫描器重扫，结果与 `legacy-ui-opening.json` 完全相同（88 个文件；alert 15 / modal 11 / tablist 9 / oldComponent 203 / controls 48）。重新生成后 sha256 与测试里写死的值一致。
- **基础设施里旧写法为 0**，且不能写进允许清单。
- **`AuthSessionProvider` 破坏性语义安全**：没有宿主时两个请求都按「取消」返回（复核人实测 `presentConfirm` → `false`，`presentActionSheet` → `null`），不会执行破坏性操作。
- **原生依赖已锁定**，`.native.ts` 平台文件的做法正确。

但有 **8 条中等问题**：
- **M1**：Toast 被画在所有弹层下面，REPORT「Toast 永远最上」与实现相反。复核人实测：弹层打开时 Toast 被遮罩盖住。
- **M2**：撤销按钮触控区只有 32pt。「全部可点组件 ≥44」的测试没有覆盖 Toast。
- **M3**：「2 倍字号不裁切」的测试测不出横向省略号。复核人实测 320 宽、2 倍字号时有截断，测试照样通过。
- **M4**：旧写法门禁有多种绕过方式。其中 REPORT 说「新组件里写 `tablist` 被拦」，实际不拦。
- **M5**：「有未同步修改时注销」从确认框改成了动作表，默认焦点没有放在安全选项上，与契约和设计稿都不符。
- **M6**：弹层键盘避让没有任何测试，与 80% 规则叠加时存在顶部被推出屏幕的风险。
- **M7**：「减少动效时只剩淡入」没有被完整证明，实现也有缺口。
- **M8**：SC-05 / SC-06 的模拟器走查没有完成。REPORT 已如实登记为例外，但契约要求的证据仍然缺。

没有严重问题。

**条件：**
- M1–M7 在 `redesign` 上修完（RD-25）；
- M8 由人在模拟器或真机上把展示页和登录 / 登出 / 离线 / 错误边界走一遍，补截图或录屏。

两项都完成后，R04 视为完成。R05 可以同时开工，但 R05 有底栏，会马上用到 Toast 的位置和层级，所以 **M1 应在 R05 接入 Toast 之前修完**。

## 逐 SC 核实

| SC | 结论 | 复核人做了什么 / 证据 |
| --- | --- | --- |
| 01 组件齐全且对得上设计 | ⚠️ 基本达成 | **组件齐全**：逐个比对契约清单与 `ui/*.tsx` 和 `index.ts`：基础 11 个、反馈 6 个（含 `presentConfirm` / `presentActionSheet`）、AI 2 个、控件 10 个、状态 8 个都在。<br>**规格对照**：按钮胶囊、按下 .96、危险三态；圆钮 40 / 34；卡片 24 / 18 / flat / line；chip 11/700、最大宽 160；头像 38 / 30 / 56、叠放 -8；左滑 72 / 50 / -170；搜索与输入 44、圆角 14；确认框 296、圆角 28、取消在左；动作表钮 46（实际 44，见自定决定 6）；弹层抓手 38×5、80%；抽屉 318；骨架 8 秒后提示重试；开关 44×26；勾 22 / 20 / 18；进度 6 / 4；数字滚动 1100ms。逐项读源码，均对得上。<br>**RD-17**：`CheckCircle`、`ConfirmCard` 成功态用 `ok`；深色 Toast 用 `surface3` 底 + `ink` 字，`ui-toast` 测了明暗两种亮度。但 `Chip` 没有 `ok` 色，展示页「完了」用的是 teal（m2）。<br>**对照页**：`compare.html` 是整页并排，不是逐组件；弹层类没有打开态截图（m6） |
| 02 行为正确 | ⚠️ 部分 | **Toast**：一次一条、出错常驻、撤销条（`keep`）不倒计时、页面卸载后撤销被移除，模型与渲染测试都成立。复核人重读 `toast-model.ts:31-35` 与 `Toast.tsx:36`：卸载由 `useToast` 的 effect 清理触发，逻辑正确。位置 100 / 40 只测了纯函数。层级问题见 M1。<br>**确认框**：破坏性时焦点在取消、点遮罩不关闭、Android 返回 = 取消，`ui-dialog` 4 条覆盖（焦点是用 shim 版 `findNodeHandle` 记录的，原生未验证，m10）。<br>**弹层**：拖动和 80% 只有纯函数测试（`ui-logic`）。`ui-components-render` 的弹层用例标题说「点遮罩关闭」，实际没点遮罩（m8）。键盘避让没有测试（M6）。<br>**左滑**：阈值 50、72 宽、纵向不抢手势（`activeOffsetX ±10` + `failOffsetY ±12` + `claimsGesture`），纯函数测试成立；原生跟手未验证（M8） |
| 03 无障碍与减少动效 | ⚠️ 部分 | **触控区**：只测了 gallery 场景里的可点元素。Toast 撤销钮 32pt、没有 hitSlop，不在 gallery 里，没被测到（M2）。其余组件逐个读 `hitSlop` + 尺寸，都 ≥44。<br>**2× 字号**：测试只比纵向 `scrollHeight`，测不出省略号（M3）。<br>**减少动效**：只测了数字、进度条、骨架三项。REPORT 写的「减少动效时无 transform」没有对应断言（M7） |
| 04 旧写法只减不增 | ⚠️ 基本达成 | **开工快照**：与基线重扫逐文件一致（见上）。**允许清单**：85 个文件，13 / 11 / 9 / 202 / 47，与 REPORT 一致。<br>**基础设施 0 处**：`ZERO` 名单强制。<br>**旧组件归零即删**：规则在，`MetricPill` 已删。<br>**注入结果**见下表：清单外文件、清单加行、调大条数、新组件里的 `Alert.alert` / `<Modal>` / 旧组件 / `controls` 都被拦。但别名、命名空间、解构、`role=` 写法、表达式写法、re-export 都能绕过，`ui/**` 里写 `tablist` 也不拦（M4）。<br>**依赖**：`react-native` 锁 `0.86.0`，与 `node_modules` 和锁文件一致；`gesture-handler 2.32.0`、`reanimated 4.5.1`、`worklets 0.10.1`、`expo-blur 57.0.3`、`expo-haptics 57.0.3` 在锁文件与安装版本一致。`expo-doctor.txt` 没有对这 5 个报不匹配 |
| 05 基础设施改完不坏 | ⚠️ 测试通过 / 走查缺 | **原有测试**：全部通过（全量零新增）。<br>**逻辑和 props 不变**：`AppErrorBoundary`、`OnlineOnlyBoundary`、`OrbitRouteAccessBoundary` 的 diff 只动了渲染部分，逻辑与 props 未动。`OnlineOnlyBoundary` 删掉了 `export { NeedsNetworkState }` 这个再导出，`tsc` 0，没有调用方受影响。<br>**`AuthSessionProvider`**：三种结果 keep / discard / cancel 一一对应，无宿主时按取消处理，语义安全；交互形式偏离契约（M5）。<br>**`audit-offline-read-surfaces`**：key 未移动，测试通过。<br>**模拟器**：登录 / 登出 / 会话失效 / 离线 / 无权限 / 错误边界的走查没做（M8） |
| 06 原生能力真实可用 | ⚠️ 部分 | 开发包重建后能启动、能打开展示页（`sim/01-launch.png`、`sim/10-showcase-top.png`、`sim/10-showcase-tree.txt`）。左滑跟手、弹层拖动、触感、毛玻璃没有验证，REPORT 如实登记（M8） |

### 必需证据子表

| SC | 子断言 | 复核结论 |
| --- | --- | --- |
| 01 | 「完成」用 `ok` 绿；深色 Toast 是深色胶囊 | ⚠️ `CheckCircle` / `ConfirmCard` / Toast 成立；`Chip` 与 `SwipeRow` 的「完了」用 teal，不是 `ok`（m2） |
| 02 | 破坏性确认默认焦点在取消，点遮罩不关闭 | ✅ `ConfirmDialog`；❌ 注销时的动作表没有默认焦点（M5） |
| 04 | `react-native` 锁定；新依赖与 SDK 匹配 | ✅ |
| 04 | 允许清单初始条数写进 REPORT | ✅ 数字经基线重扫核实 |
| 05 | 离线读取审计 key | ✅ 未移动，测试通过 |
| 全部 | 全量零新增失败；`tsc`；`detect-changes` | ✅ 复核人重跑：4140 / 4139 / 1（已知）；`tsc` 0。`detect-changes` 只核对了 REPORT 和证据文件，未重跑 |

## 运行时抽查

### 重跑

| 命令（`repos/orbit-app`） | 结果 |
| --- | --- |
| `npx tsc --noEmit` | exit 0 |
| `npm test` | tests 4140，pass 4139，fail 1：`native app has a route for every web app surface`（actual `['/start']`，基线已知） |
| `node --test … tests/ui-*.test.ts tests/legacy-ui-ratchet.test.ts` | 26 / 26 通过 |

### 组件探针（复核人在 scratchpad 写的临时场景，复用 `tests/helpers/ui-harness.ts`，不改仓库）

| 探针 | 结果 |
| --- | --- |
| 打开 `BottomSheet`，再发一条 `toast.error` | Toast 中心点的 `elementFromPoint` 不是 Toast（被遮罩盖住） → M1 |
| 打开破坏性 `ConfirmDialog`，再发一条 `toast.error` | 同上，被遮罩盖住 → M1 |
| `toast.success(…, { undo })` 的「元に戻す」 | 72.6 × **32**，`data-hitslop=0` → M2 |
| 320 宽、2× 字号，四段 `Segmented` + 两个按钮 | 「カレンダー」「プラン」`scrollWidth > clientWidth`（横向截断）。用现有测试的判定（`[role=button]` 的 `scrollHeight`）检查同一页面，结果为空 → M3 |

### 注入（验证后全部还原；`git status` 只剩用户自己的未提交文件）

| 注入 | 位置 | 结果 |
| --- | --- | --- |
| `Alert.alert("x")` | `src/components/ui/ZzA.tsx` | ✅ 拦住 |
| `import * as RN …; RN.Alert.alert()` | `ui/ZzB.tsx` | ❌ 未拦 |
| `const { alert } = Alert; alert()` | `ui/ZzC.tsx` | ❌ 未拦 |
| `<Modal visible />` | `ui/ZzD.tsx` | ✅ 拦住 |
| `import { Modal as Sheet }; <Sheet />` | `ui/ZzE.tsx` | ❌ 未拦 |
| `<View accessibilityRole="tablist" />` | `ui/ZzF.tsx` | ❌ 未拦（`ui/**` 整目录豁免 tablist） |
| `import { ErrorState } from "../ErrorState"` | `ui/ZzG.tsx` | ✅ 拦住 |
| `import … from "../../design/controls"` | `ui/ZzH.tsx` | ✅ 拦住 |
| `Alert.alert` | 清单外 `src/screens/zz/ZzOut.tsx` | ✅ 拦住 |
| `accessibilityRole={"tablist"}`、`role="tablist"` | `src/screens/zz/ZzTab1.tsx` | ❌ 两种都未拦 |
| `export { ErrorState as Err } from …` 再从 barrel 导入使用 | `src/screens/zz/ZzReexp.ts` + `ZzUse.tsx` | ❌ 未拦 |
| 允许清单加一行 `ZzOut.tsx: alert 1` | 清单 | ✅ 拦住（超过开工快照） |
| 把 `confirm-event-cancellation.ts` 的 alert 调成 2 | 清单 | ✅ 拦住（超过开工快照 + 实际低于清单） |

## 问题清单

### 严重

无。

### 中等

**M1 Toast 永远在弹层下面，REPORT 写的是「Toast 永远最上」**
- **现象**：`app/_layout.tsx:90-95` 的挂载顺序是 `UiPortalHost > ToastProvider > children`。`Portal.tsx:23-30` 先渲染 `{children}`（ToastProvider 和它的 Toast 都在里面），再把弹层渲染在上面。所以任何对话框、弹层、抽屉打开时，Toast 都在遮罩下面。`ui-scenarios.tsx:122` 的测试场景也是这个顺序，但没有同时打开弹层和 Toast 的用例。
- **证据**：探针中，打开 `BottomSheet` 或 `ConfirmDialog` 后，Toast 中心点 `elementFromPoint` 命中的不是 Toast。REPORT「自定决定 1」原文：「一个宿主让『Toast 永远最上』成立」。
- **影响**：弹层里保存失败时 `toast.error` 用户看不到（出错 Toast 常驻，但被遮住）。R05 起功能 Sprint 会在弹层里大量用 Toast。
- **建议修法**：Toast 改为在 Portal 宿主里最后渲染，例如 `UiPortalHost` 留一个固定的最上层插槽，或者把 `ToastProvider` 放到 `UiPortalHost` 外层，并让它渲染在宿主之后。补一条「弹层打开时 Toast 可见、可点」的渲染测试。

**M2 Toast「元に戻す」触控区 32pt，测试没覆盖**
- **现象**：`Toast.tsx:80` 撤销钮没有 `hitSlop`，`styles.undo` 是 `minHeight: 32`（`:103`）。
- **证据**：探针实测 72.6 × 32、`data-hitslop=0`。`ui-components-render.test.ts:55-62` 的触控区测试只扫 gallery 场景，gallery 里没有 Toast、对话框、弹层和抽屉。
- **影响**：撤销是 Toast 的核心操作，直接违反 SC-03「所有组件触控区 ≥44」。REPORT SC-03 写「全部可点元素」，但不成立。
- **建议修法**：撤销钮加 `hitSlop={6}`（或胶囊保持 32、外层命中区 44）。触控区测试补跑 toast、dialog、sheet 打开态和 `FullDrawer`。

**M3「2 倍字号不裁切」的测试测不出横向省略号**
- **现象**：`ui-components-render.test.ts:64-73` 只检查 `[role="button"]` 的 `scrollHeight > clientHeight`。按钮、分段、chip 的文字都是 `numberOfLines={1}`，截断是横向省略号，发生在内层 Text 上，这个判定永远发现不了。
- **证据**：探针 320 宽、2×：「カレンダー」「プラン」横向截断，用现有判定检查同一页面结果为空。REPORT「已知例外」也承认 web 截图里分段控件有省略号，而测试照样通过。
- **影响**：SC-03 的主证据实际上不能证明「不裁切」。iOS 上 `adjustsFontSizeToFit` 能缩字，但按钮、chip、`ListRow` 标题等没有缩字，截断不会被发现。
- **建议修法**：判定改为「带文字的元素 `scrollWidth > clientWidth`」。分段控件在 web 上的已知例外单独豁免并注明；其余组件必须为 0。

**M4 旧写法门禁可以被绕过；REPORT 的注入声明不准确**
- **现象**：`tests/support/legacy-ui.ts:19-21` 用字面文本匹配：`Alert.alert`、标签名 `Modal`、字符串字面量的 `accessibilityRole="tablist"`；`:22-27` 只看 `ImportDeclaration`。`:34` 的 `TABLIST_OWNERS` 把整个 `src/components/ui/` 豁免掉。
- **证据**：见「注入」表，6 种写法未被拦：
  - `RN.Alert.alert`；
  - 解构 `alert`；
  - `Modal as Sheet`；
  - `accessibilityRole={"tablist"}`；
  - `role="tablist"`（基线里已经在用 `role="dialog"`，例如 `PersonalScheduleRules.tsx:29`）；
  - re-export barrel。

  另外 `ui/ZzF.tsx` 里写 `tablist` 也不拦。REPORT SC-04 写「注入样例（新组件里写 … `tablist` … 全部被拦）」，实际那条「注入样例」只是 `legacyCounts(…, "x.tsx")` 的单元测试（`legacy-ui-ratchet.test.ts:75-79`），没有对 `ui/**` 路径做过注入。
- **影响**：RD-24 的合回前总验收依赖这份清单「为空」。能被绕过的门禁会让「清单为空」失去意义。
- **建议修法**：
  - 按符号判断：解析 `react-native` 的 import 绑定（含别名、namespace），统计 `Alert` 的成员调用和 `Modal` 的 JSX 使用；
  - `tablist` 同时认 `role`，以及 JSX 表达式里的字符串；
  - `ExportDeclaration` 的 `moduleSpecifier` 也计入；
  - `tablist` 豁免收窄到 `Segmented.tsx`、`Filters.tsx`、`OrbitTabBar.tsx` 三个文件；
  - 把上面的注入样例固化成测试。

**M5 注销确认从「确认框」变成「动作表」，默认焦点不在安全选项**
- **现象**：`AuthSessionProvider.tsx` 的 `confirmPendingWriteSignOut` 改用 `presentActionSheet`，「放弃并注销」（破坏性）排第一。`ActionSheet.tsx` / `BottomSheet.tsx` 不设任何初始无障碍焦点。
- **对照**：PLANNER「易错边界」：「替换 `Alert` 后……破坏性操作必须仍是确认框，默认焦点在『キャンセル』，点遮罩不关闭」。`01-system.html` ② 动作表的设计稿也把 `focus` 放在「〜を続ける」。
- **结果层面是安全的**：遮罩、拖动、返回、无宿主都返回 cancel。
- **影响**：读屏和键盘用户的起点不在安全选项；与契约字面要求不符，而这个偏离只写在「自定决定 3」里。
- **建议修法**：
  - `ActionSheet` 支持 `defaultFocusKey`，破坏性动作表默认聚焦「〜を続ける / キャンセル」，并补 `ui-dialog` 同类断言；
  - 或者由产品负责人确认采用动作表，并在 PLANNER 里把这条易错边界改成「确认框或动作表，焦点在安全项」。

**M6 弹层键盘避让没有测试，且与 80% 规则冲突**
- **现象**：`BottomSheet.tsx:44-45` 是 `KeyboardAvoidingView(padding)` 包一个 `maxHeight = 80% 屏高` 的弹层。按代码推断：键盘弹出时容器高度 = 屏高 − 键盘高度，而内容很多的弹层仍是 80% 屏高，`justifyContent: flex-end` 会把弹层顶部推出屏幕上沿，抓手和上方输入框都看不到。
- **证据**：这是代码推断，复核人没有在原生上验证。全仓库没有任何键盘相关测试，`ui-components-render` 只在弹层里放了一个 `TextField`，没有检查键盘。
- **影响**：PLANNER 要求「弹层里的键盘遮挡输入框」写进 SC，但 SC-02 的证据里没有。
- **建议修法**：键盘出现时把 `maxHeight` 改为 `(屏高 − 键盘高度 − 安全区) × 0.8`，或改用 reanimated 的 `useAnimatedKeyboard`。补测试：注入一个模拟键盘高度，断言弹层顶部 ≥ 安全区上沿、聚焦的输入框在可见区内。模拟器走查（M8）也要包括这一项。

**M7 「减少动效只剩淡入」没有被证明，且有缺口**
- **现象**：
  1. `ui-components-render.test.ts:75-86` 只测了 `CountUp`、`ProgressBar`、`Skeleton`。Toast 位移、确认框缩放、抽屉 / 弹层位移、按压缩放都没有断言。reanimated stub 的 `withTiming` 直接返回终值，无论如何都测不到。REPORT SC-03 写「减少动效时无 transform」，没有对应测试。
  2. `Segmented.tsx:43` 的 `SwipeSegments` 点分段时 `scrollTo({ animated: true })`，不看 `useReducedMotion()`，整页横向滑动。
  3. `motion.ts:13` 每个组件实例的初值都是 `false`，要等 `AccessibilityInfo.isReduceMotionEnabled()` 异步返回后才变成 true。所以「挂载即可见」的组件在系统开启减少动效时，头几帧仍按有动效执行（`UiFeedbackHost` 弹出的确认框 / 动作表，每条新 Toast，`BottomSheet` 初始 `offset = height`），随后再跳到终点。每个 `UiPressable` 还各自发一次原生查询、各挂一个监听，长列表里有上百个。
- **影响**：RD-16「所有动画遵守减少动效」的证据不完整，并有可见的违例。
- **建议修法**：
  - `useReducedMotion` 改为模块级缓存，同步读，只订阅一次（或直接用 reanimated 的同步 `useReducedMotion`）；
  - `SwipeSegments` 在 reduced 时 `animated: false`；
  - 渲染测试在 reduced 下打开 toast、dialog、drawer，断言这些元素的计算样式 `transform` 为 `none` 或单位矩阵。

**M8 SC-05 / SC-06 的模拟器走查没做（已如实登记，但证据仍缺）**
- **现象**：REPORT「已知例外」：左滑跟手、弹层拖动、触感、毛玻璃，以及登录 / 登出 / 会话失效 / 离线边界 / 错误边界，都没有在模拟器上点按。证据只有启动截图和展示页顶部截图；`sim/p4-after-toggle-tap.png` 是点按失败的那次尝试。
- **评价**：理由（会话没有模拟器面板授权、XCUITest 点按无效）属实，处置方式（交由人手动走查）合理。但契约主证据是「模拟器截图 / 录屏」，现在不能记为 ✅。
- **建议修法**：由人在开发包里按 REPORT「已知例外」列出的步骤过一遍，加上 M6 的键盘和 M1 的「弹层上发 Toast」两项。截图 / 录屏放进 `run-01/sim/`，然后把 SC-05 / SC-06 改为 ✅。

### 轻微

- **m1 REPORT 交接文字与实现不符**：交接里写 `toast.success(msg, { undo })`「撤销条不倒计时」。按 `toast-model.ts:26`，只有 `keep: true` 才不倒计时，普通带 undo 的 Toast 5 秒后消失（这与设计稿一致）。修法：改交接文字，写明 `keep` 的用法。
- **m2 「完了」chip 用 teal，不是 `ok`**：`Chip` 的 7 色里没有 `ok`。展示页 `ComponentShowcaseScreen.tsx:56` 的「完了」chip、`:66` 的左滑「完了」动作都是 teal。REPORT SC-01 写「`Chip` 已完成 用 `ok` 绿」，不成立。teal 视觉上偏绿，设计稿 01-system:201 也是 teal，但 RD-17 写的是「一律 `ok`」。修法：给 `Chip` 加 `ok` 色并用于「完了」，或者由产品负责人确认 teal 可以接受，并更新 RD-17 的说明。
- **m3 `Progress.tsx:3` 直接 `import … from "react-native-svg"`**：没有走 `./svg`，与自定决定 7（web / 测试不引原生模块）不一致。测试能过，是因为 harness 把它替换成了 stub。修法：改为 `./svg`。
- **m4 `OrbitRouteAccessBoundary.tsx:11` 未使用的 `Text` 导入**：改成 `UiText` 后遗留。
- **m5 展示页没有「字号倍数」开关**：PLANNER 要求「可切换浅色 / 深色、字号倍数、减少动效」，现在跟随系统，REPORT 也没有把它列为自定决定。另外浅 / 深按钮调用的是 `setAppearanceChoice`，会改掉用户真实的外观设置。修法：加一个本页内的字号倍数覆盖，或者补登记决定；外观切换改为本页局部覆盖。
- **m6 SC-01 对照页是整页并排**：PLANNER 要求「每个组件与设计稿画板并排」，`compare.html` 是展示页长图对 `01-system` 全页长图（36,749px）。Toast / 确认框 / 动作表 / 弹层 / 抽屉的打开态都没有截图。
- **m7 允许清单「只减不增」只和开工快照比，不和上一版比**：某个文件的条数被功能 Sprint 降低以后，再把清单调回开工值并加回旧写法，测试照样通过。另外旧组件文件之间的互相引用不计入使用者（`legacy-ui.ts:43` 跳过旧组件自身），可能误要求删除仍被别的旧组件引用的文件。修法：测试再和 `git show HEAD:…allowlist.json`（或清单里记录的历史最小值）比较。
- **m8 弹层渲染用例名不副实**：`ui-components-render.test.ts:99-106` 标题是「closes on a backdrop tap」，实际没有点遮罩；而且同时打开两个弹层，只断言「两个事件之一」出现。
- **m9 Toast 缺设计稿里的「再試行 / 開く」动作**：01-system ① 要求出错 Toast 带「再試行」、info 可带「開く」，撤销钮带 undo 图标。`ToastInput` 只有 `undo`。契约没有点名，但功能 Sprint 会需要。
- **m10 无障碍细节**：
  - `ConfirmDialog` 的初始焦点在 `onLayout` 里立即 `setAccessibilityFocus`，原生 VoiceOver 通常需要延迟一帧，未验证；
  - `SwipeRow.tsx:44-47` 的 `accessibilityActions` 挂在非 `accessible` 的容器上，iOS 不会暴露；藏在行面下面的动作按钮仍可被读屏聚焦；
  - `CheckCircle` 一次按下同时触发轻触感和成功触感。
- **m11 `BottomSheet` 细节**：
  - 点遮罩关闭后 `offset` 停在 0，再次打开没有上滑动画；
  - 拖动未达阈值的回弹不看减少动效；
  - `Gesture.Pan()` 每次渲染都重建；
  - 关闭阈值用的是 `maxHeight`，不是弹层实际高度。
- **m12 Portal 内容取宿主处的 context**：弹层里的 `Button` / `Scrim` 读的是根部的 `ReducedMotionOverride`，不是调用方的。所以展示页打开「reduce motion」后，对话框里的按钮按下仍会缩放。修法：`UiPortal` 把调用方的 override 值一并带到宿主。

## 对 REPORT「自定决定」的评价

| # | 评价 |
| --- | --- |
| 1 Portal 代替 RN Modal | 合理，对标也成立；但「Toast 永远最上」与实现相反（M1） |
| 2 命令式 API | 合理；无宿主按取消，复核人实测成立 |
| 3 注销用动作表 | 对标 iOS HIG 合理，但偏离契约字面要求，且缺默认焦点（M5） |
| 4 `tablist` 豁免 `ui/**` 与底栏 | 方向合理，范围太宽（M4） |
| 5 RN 锁 0.86.0 | 合理（PLANNER 原话「锁成实际安装的版本」）；Hermes 回归转「后续」也合理 |
| 6 按钮 md 44 | 合理（HIG 44pt），已在测试里注明 |
| 7 `.native.ts` 平台文件 | 正确：Metro 原生构建按 `.ios` → `.native` → `.ts` 解析，`metro.config.js` 没有改平台解析；web 和 esbuild 取 `.ts`。`Progress.tsx` 漏改（m3） |
| 8 `"worklet"` 标注 | 正确；`babel-preset-expo` 在装了 worklets 时会自动加插件，开发包能启动也说明插件生效 |
| 9 分段 1.4× 封顶加缩字 | 合理（对标 `UISegmentedControl`），但测试测不出截断（M3） |
| 10 路由 `/showcase/components` | 合理，沿用 R02 / R03 |
| 11 危险底色 `coralText` | 合理（对比度），偏离设计稿「`--coral` 实心」，已写明理由 |
| 12 `NeedsNetworkState` 暂不删 | 符合门禁规则 |
| 13 `.env.development.local` 指本地 | 合理，没有碰 `.env.local`，符合规则 6 |

**REPORT 的数字核实：**
- 4140 / 4139 / 1：复核人重跑一致。
- 开工快照 88 个文件 15 / 11 / 9 / 203 / 48：基线重扫一致。
- 允许清单 85 个文件 13 / 11 / 9 / 202 / 47：读清单一致。
- 页面清单 96 条：diff 一致。
- **与实际不符的说法**：「Toast 永远最上」（M1）、「全部可点元素 ≥44」（M2）、「新组件里写 `tablist` 被拦」（M4）、「减少动效时无 transform」（M7）、「`Chip` 已完成用 `ok` 绿」（m2）、「撤销条不倒计时」用在 `{ undo }` 上（m1）。

## 附：复核人留下的痕迹

- 全部探针和注入文件都在仓库外的 scratchpad，或已删除。
- `tests/fixtures/legacy-ui-allowlist.json` 已从备份还原。
- `git status` 只剩用户自己的未提交文件（`bridge/*`、`docs/designs/Orbit_0918/`、`repos/orbits/docs/...`）。
- 本次只新增了本文件。

## 处理记录（执行人，2026-10-10）

| 编号 | 处理 | 位置 / 证据 |
| --- | --- | --- |
| M1 | 已修：`ToastProvider` 包在 `UiPortalHost` 外，Toast 画在弹层之后 | `app/_layout.tsx`、`Toast.tsx` 注释；`ui-overlays`「a toast shows above every open overlay」对确认框 / 动作表 / 弹层 / 抽屉逐个用 `elementFromPoint` 验证并点按「再試行」 |
| M2 | 已修：撤销 / 动作钮 `hitSlop={6}`（32 + 12 = 44） | `Toast.tsx`；`ui-overlays` 触控区测试覆盖四种打开的弹层和三种 Toast |
| M3 | 已修：判定改为带文字元素的横向和纵向溢出；只豁免 iOS 缩字的分段（`data-shrink`）；新检测找到 `ListRow` 副标题截断 → 大字号下最多 3 行 | `ui-components-render`（展示集合 + 确认框 / 动作表 / 抽屉，320 × 2×）、`ListRow.tsx`、REPORT 自定决定 17 |
| M4 | 已修：按符号统计（别名、namespace、默认导入、解构、`RN.Modal`）、`role` 与表达式 / props 对象里的 tablist、再导出；tablist 豁免收窄到 `Segmented` / `Filters` / 底栏；注入样例固化为测试。用基线 `8a904dbd` 重扫与开工快照逐文件一致，快照和哈希不变 | `tests/support/legacy-ui.ts`、`legacy-ui-ratchet`（9 条） |
| M5 | 已修：`ActionSheet` 加 `defaultFocusKey`（缺省第一个非破坏性选项），焦点在「〜を続ける」，与设计稿 ② 一致；保留动作表（三选一），写入 REPORT 自定决定 3，请产品负责人事后确认 | `ActionSheet.tsx`；`ui-overlays`「starts screen-reader focus on the safe choice」 |
| M6 | 已修：键盘弹出时最大高度 = min(80% 屏高, 屏高 − 键盘 − 安全区 − 12)，内容在弹层内滚动 | `sheet-logic.ts`、`BottomSheet.tsx`；`ui-overlays` 键盘用例（纯函数 + 模拟键盘事件下弹层顶部和第一个输入框在屏内）。原生键盘仍列入 M8 手动走查 |
| M7 | 已修：系统设置整个 App 只读一次（模块级缓存 + `useSyncExternalStore`），之后出现的弹层 / Toast 第一帧就是减少动效；`SwipeSegments` 在减少动效下不带动画切页 | `motion.ts`、`Segmented.tsx`；`ui-overlays`「Reduce Motion」：四种弹层打开后无任何 transform，只开系统设置时 Toast 第一帧无位移 |
| M8 | 已做（用户授权模拟器后）：左滑跟手、弹层滑入 / 拖动关闭、键盘避让、破坏性确认框点遮罩不关闭、动作表、深色、超大字号、登录 / 会话恢复 / 离线边界 / 有未同步修改时退出（动作表三选项，点遮罩 = 取消，加密保存后退出）全部在模拟器开发包上实测通过；R02 M3 底栏截图一并补上。剩余：触感需真机；毛玻璃在展示页上没有可模糊的内容；错误边界未人为触发（测试覆盖） | REPORT SC-05 / SC-06、`~/orbit-sprint-evidence/redesign/R04/run-01/sim/20–44` |
| m1 | 已修：交接改为 `{ undo }` 5 秒、`keep` 才是不倒计时的撤销条 | REPORT「交接」 |
| m2 | 已修：`Chip` 和左滑动作加 `ok` 色，「完了」改用 `ok` | `Chip.tsx`、`SwipeRow.tsx`、展示页 |
| m3 | 已修：`Progress.tsx` 改走 `./svg` | |
| m4 | 已修：删掉未用的 `Text` 导入 | `OrbitRouteAccessBoundary.tsx` |
| m5 | 已修 / 登记：浅深预览离开展示页时恢复用户设置；字号不做页内开关（Dynamic Type 是系统级），写入 REPORT 自定决定 10 | `ComponentShowcaseScreen.tsx` |
| m6 | 已修：对照页补确认框 / 动作表 / 弹层 / 抽屉 / Toast 打开态，与设计稿对应画板逐个并排 | `compare.html`、`pairs/` |
| m7 | 已修：清单还要不高于任何一个已提交版本（`git log` 逐版比较，无 git 时跳过）；旧组件之间的引用也算使用者 | `legacy-ui-ratchet` |
| m8 | 已修：旧用例删除，改为 `ui-overlays` 里真正点遮罩、按返回 | `ui-overlays` |
| m9 | 已修：Toast 可带一个动作（「再試行」「開く」），撤销钮带撤销图标 | `toast-model.ts`、`Toast.tsx`、展示页 |
| m10 | 已修：确认框和动作表的初始焦点延后一帧；左滑行对读屏是一整行、动作作为自定义动作、行下按钮隐藏；完成勾只发成功触感（取消勾选发轻触感） | `ConfirmDialog.tsx`、`ActionSheet.tsx`、`SwipeRow.tsx`、`Checks.tsx` |
| m11 | 已修：关闭后复位到屏外（再次打开有上滑）；回弹遵守减少动效；手势用 `useMemo`；关闭阈值用实测高度 | `BottomSheet.tsx` |
| m12 | 已修：`UiPortal` 把调用方的减少动效覆盖值带到宿主 | `Portal.tsx` |

**收口：** App `tsc` 0；全量 4151 条，4149 通过，2 失败：`route-parity`（基线已知）+ `ink-signal-card-review`「wide-dark」（全量时同时在截图，单独重跑 2 次 31/31 通过，R04 未碰该屏）。`ui-*` + `legacy-ui-ratchet` 37 / 37。detect-changes：23 个已跟踪文件、68 个符号、受影响流程 0，风险 low。
