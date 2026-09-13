# Ink & Signal 公共视觉与导航 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. 沿用本会话原地逐批执行；不提交、推送或部署。

**Goal:** 将已批准的白底、墨黑、信号蓝、细线分区和五入口导航落实到现有 App，作为全包页面改版的共同基础。

**Architecture:** 保留 Expo Router 和现有 screen/hooks/API。AppScreen 对主入口显示底栏，对次级页显示有明确上级的导航；IORBIT 独立全屏。公共控件只改外观，业务 handler、草稿与权限仍由原消费者持有。

**Tech Stack:** 现有 Expo / React Native / TypeScript、react-native-svg、Node + RNW 渲染/交互测试，无新增依赖。

**Spec:** [设计映射及来源](../../designs/2026-09-12-ink-signal/README.md)，原包 [README](../../designs/2026-09-12-ink-signal/design_handoff_orbit_ink_signal/README.md)、1c 主页面截图和 TabBar.dc.html 的 ink 变体。

## Global Constraints

- 只编辑 App，保留已有未提交资料、共享契约副本、服务端代码和锁定依赖。
- 前置导入批次基线 1425 tests passed、typecheck passed；公共层复审修复后 1437/1437（103.907 秒），typecheck 和 diff check 通过，独立复审通过；逐页/native 视觉 QA 仍未验收。
- 主白底 #FFFFFF，墨黑 #0B1220，信号蓝 #0A5CFF，分区 #E6E8EE，列表线 #EEF0F4，辅助面 #F5F7FA；inset 16，主标题 30/900，区块标题 15/800；唯一阴影为浮动底栏。
- 保留深色模式。必要文字仍保持 4.5:1 对比度；原稿低对比 ink-3 仅用于装饰/禁用图标，必要小字使用同稿 ink-2。交接明示这一差异，不宣称两项均逐像素相同。
- 图标采用原始 TabBar SVG 几何的原生转写（保留来源注释）或已有同义图标库，不手绘新品牌图形。
- 五入口顺序：首页、人脉、IORBIT、活动、我的。AI 用 push 进入独立页面；其他主入口 replace，不堆叠切换历史。
- 二级页无底栏；返回优先真实历史，无历史时回明确上级。触控至少 44pt；大字号不截断；保留键盘滚动、主题切换和 RefreshControl。
- 未提供的新建日程/笔记行为不生成假入口。后续首页只连接现有创建流程，其余用已有功能对应项并记录差异。

### Task 1: 导航语义与公共容器

**Files:** Create `src/view-models/app-navigation.ts`, `src/components/OrbitTabBar.tsx`, `src/components/OrbitNavigationIcon.tsx`, `tests/ink-signal-shell.test.ts`; modify `src/components/AppScreen.tsx`.

**Interfaces:** `mainTabForPath(pathname: string)` → `home|contacts|events|profile|null`；`parentForPath(pathname: string)` → `{ href: string; label: string }`。`OrbitTabBar({ active })` 负责五个按钮，`OrbitNavigationIcon({ name, size, color })` 使用源图标。AppScreen 保留旧 props，新增可选 header/headerActions/titleAccessory，旧 screen 无需改业务 handler。

- [x] 写行为失败测试：主入口按钮顺序/选中状态、二级页无底栏、AI 跳转、真实历史优先 back、无历史回上级。

~~~ts
assert.equal(mainTabForPath("/contacts"), "contacts");
assert.equal(mainTabForPath("/contacts/one"), null);
assert.deepEqual(parentForPath("/settings/api"), { href: "/settings", label: "设置" });
// 实际点击 IORBIT 按钮后：
assert.deepEqual(navigation, [{ method: "push", href: "/ai" }]);
~~~

- [x] 运行 `node --import tsx --test tests/ink-signal-shell.test.ts`，观察缺少底栏/上级返回行为的失败。
- [x] 对 AppScreen 和 style factory 做上游分析。按来源 72h/36r 底栏、46×46/15r 中央入口、48h 导航栏实现；safe-area 底部留白，滚动内容预留底栏高度；键盘弹出时隐藏底栏。
- [x] 渲染检查 320/390 宽长标题/长按钮不溢出，light/dark 保留草稿，最后控件可滚动到无遮挡位置。

### Task 2: 公共视觉 tokens 与控件

**Files:** Modify `src/design/tokens.ts`, `src/design/controls.ts`; update intentional legacy-color expectations in `tests/theme-render.test.tsx`, `tests/app-wide-primitives.test.ts`; extend `tests/ink-signal-shell.test.ts`.

**Interfaces:** Existing colors/darkColors/textStyles/layout/radius/shadows and createControlStyles fields remain compatible. Selected chips use ink background and inverse text; inputs/secondary controls use source outline/radii.

- [ ] 在真实控件消费者中先测试主/次动作和选中标签可识别、可读、可点击、保留草稿；观察新层级缺失的失败。原稿精确值用实际截图对照，不以常量检查代替视觉检查。
- [x] 改前报告 CRITICAL 范围：tokens 68 直接引用、controls 43 直接引用/最新 12 关联入口、AppScreen 49 直接引用/11 关联入口。
- [x] 修改主色、排版与间距；普通阴影清零；保留深色语义色与业务图表所需区分。

~~~ts
primaryButton: { backgroundColor: colors.ink, minHeight: 50, borderRadius: 12 }
primaryButtonText: { color: colors.onAccent, fontWeight: "700" }
secondaryButton: { backgroundColor: colors.surface, minHeight: 46, borderWidth: 1, borderColor: colors.ink }
selectedChip: { backgroundColor: colors.ink }
selectedChipText: { color: colors.onAccent }
~~~

- [x] 运行主题、公共控件、导航、导入交互测试及 typecheck。只更新被新稿明确替代的旧视觉期待；真实行为失败必须修复，不删除/跳过。

### Task 3: 整包接续与验收账本

**Files:** Update 设计目录 README 和本计划。

- [ ] 本批验证后继续页面批次，不把公共换色当全包完成：首页 Split Day 与真实数据；人脉列表/详情/编辑/个人；活动列表/详情/运营/权限；IORBIT 首页/会话/失败；日周月日程/待办/跟进；设置/登录/账号/收件箱/导入/异常态。
- [ ] 每个选定截图在相同状态与视口并列查看原稿及实现，记录差异。保留原生字号已知问题，不能把 RNW 通过写成实机通过。
- [ ] 全量 npm test、typecheck、diff check，逐批独立审查；App 内交接记录版本、另一端影响、差异和未验范围。无真实跨端联验，不关闭 Bridge 验收。

## 自检

本批只是整包底座，26 页完成审计仍需逐页证据。新增 props 保持旧调用；导航不改权限；失败基线先修复；图形与视觉来自已选定稿。既有业务未画在稿内的部分仍需复核。
