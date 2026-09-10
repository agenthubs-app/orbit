# Orbit 全 App 视觉统一 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox syntax for tracking.

**Goal:** 将已确认的原生视觉语言落实到全部页面与状态。

**Architecture:** 共享 tokens、页头、分区和控件先行；各领域仅调整局部表现，不改变数据流。完成全量路由/状态检查后交付。

**Tech Stack:** Expo Router、React Native、TypeScript、Node test runner、RN Web、Playwright。

**Spec:** docs/superpowers/specs/2026-09-08-app-wide-style-design.md

## Global Constraints

- 仅修改 repos/orbit-app；不修改后端、API 合同、数据库或鉴权策略。
- 保留当前脏工作；不提交、推送、发布或更改真实业务记录。
- 沿用已批准蓝灰浅深色、原生字体和现有功能结构，不新增品牌方向或依赖。
- layout.pageInset=22、contentMax=540、control=44、primaryControl=50；普通控件允许随文字增长。
- 先用 GitNexus impact（repo=/Users/xzhao/Projects/orbit）分析每个将编辑的符号，再写代码；报告 HIGH/CRITICAL 风险。
- TDD：观察真实渲染/交互断言失败，再实现；现有测试不得无解释削弱。
- 不同领域编辑文件互斥；共享组件 Task 1 通过任务审查后，领域任务才能依赖它。
- 各 task 执行者不得派生子代理；所有审查由主代理安排。
- 每批报告包含覆盖文件/继承未改文件、impact 摘要、RED/GREEN 命令与结果、限制与未完成项。

---

### Task 1: 共享视觉基础与状态组件

**Files:**
- src/design/tokens.ts
- src/design/controls.ts
- src/components/AppScreen.tsx
- src/components/DataCard.tsx
- src/components/SectionHeader.tsx
- src/components/MetricPill.tsx
- src/components/EmptyState.tsx
- src/components/ErrorState.tsx
- src/components/LoadingState.tsx
- src/components/AppErrorBoundary.tsx
- Test: tests/app-wide-primitives.test.ts

**Interfaces:**
- Consumes: 已有 colors/darkColors、createThemedStyles 及组件 props。
- Produces: 实现规格的共享接口。AppScreen 保留 keyboard/refresh/back fallback；无框返回入口不缩小触控范围，标题不能 adjustsFontSizeToFit 代替可增长布局。DataCard section 使用开放底面与轻分隔，inset 承担真实容器，保留 title/detail/children/onPress。指标降权，不用蓝色填满次要统计。错误信息与重试保留。实现 createControlStyles，普通主次操作可增长，输入保持可编辑。不要改任何页面文件。

- [ ] **Step 1: Read and impact.** Read these files and adjacent tests, then run upstream impact on each function/style entry before modifying it. Report the risk. Do not edit excluded files.
- [ ] **Step 2: RED.** 在 320pt 下渲染真实 AppScreen、长标题、可点击 DataCard、inset 错误、输入和主次按钮。断言返回操作与无历史 fallback、可编辑输入、disabled 不触发、两种外观对比度和内容边界。视觉契约断言无多层外框，但需同时验证内容与点击行为。

```ts
// Render the real production consumer with controlled native/network boundaries.
const box = (await action.boundingBox())!;
assert.ok(box.height >= 44);
assert.ok(box.x >= 0 && box.x + box.width <= 320);
await action.click();
assert.deepEqual(await page.evaluate(() => window.fixture.requests), expectedRequests);
```

Run targeted tests with:
```sh
node --test --import tsx --import ./tests/helpers/register-render-hooks.mjs tests/app-wide-primitives.test.ts
```
Expected RED is a visible behavior/layout contract mismatch, not a syntax/import failure. Read the existing behavior to choose concrete actions/fixtures; name the actual production break caught by each test.

- [ ] **Step 3: Implement.** Apply the required visual migration. Preserve handlers, content and accessibility behavior. Representative integration:
```tsx
const controls = createControlStyles(colors);
const styles = StyleSheet.create({ ...controls, page: { paddingHorizontal: layout.pageInset } });
```
- [ ] **Step 4: GREEN.** Run the new tests, existing tests covering edited pages, and npm run typecheck. Fix unexpected failures before dependent work.
- [ ] **Step 5: Self-review and report.** Check rendered layout and diff scope, record direct/indirect coverage and evidence, then provide the report for independent task review. No commit is authorized.

### Task 2: 联系人与人脉分析

**Files:**
- src/screens/contacts/ContactsScreen.tsx
- src/screens/contacts/ContactDetailScreen.tsx
- src/screens/contacts/ContactPage.tsx
- src/screens/contacts/ContactAcquisitionScreen.tsx
- src/screens/contacts/ContactsDashboardScreen.tsx
- src/screens/contacts/ContactsGraphScreen.tsx
- src/screens/contacts/ContactPipelineScreen.tsx
- src/screens/contacts/ContactIntrosScreen.tsx
- src/screens/contacts/ContactStructureDetailScreen.tsx
- src/screens/dashboard/DashboardScreen.tsx
- Test: tests/app-wide-contacts.test.ts

**Interfaces:**
- Consumes: Task 1 的 layout/textStyles/createControlStyles、兼容的 AppScreen/DataCard；既有页面接口/API 均保持。
- Produces: 覆盖人脉总览/采集/分析/引荐/关系进展/结构详情/旧仪表盘，去掉重复容器并统一章节、按钮、输入和次要信息。保留真实图表/头像/统计语义，不能删除搜索、字段、展开、流程或记录。已经批准的列表/详情布局不推翻，改用共享 tokens 并让扩展/编辑/空态也一致；保留 ContactPage 特有返回目标。相机底面是语义特例，不改识别或保存逻辑。

- [ ] **Step 1: Read and impact.** Read these files and adjacent tests, then run upstream impact on each function/style entry before modifying it. Report the risk. Do not edit excluded files.
- [ ] **Step 2: RED.** 联系人采集/人脉总览/分析各至少一个真实消费者渲染；320pt 搜索或采集操作不溢出；可选择模式且不意外发写请求；保留原 7 项 contacts-redesign-interactions 测试和现有相关测试。

```ts
// Render the real production consumer with controlled native/network boundaries.
const box = (await action.boundingBox())!;
assert.ok(box.height >= 44);
assert.ok(box.x >= 0 && box.x + box.width <= 320);
await action.click();
assert.deepEqual(await page.evaluate(() => window.fixture.requests), expectedRequests);
```

Run targeted tests with:
```sh
node --test --import tsx --import ./tests/helpers/register-render-hooks.mjs tests/app-wide-contacts.test.ts
```
Expected RED is a visible behavior/layout contract mismatch, not a syntax/import failure. Read the existing behavior to choose concrete actions/fixtures; name the actual production break caught by each test.

- [ ] **Step 3: Implement.** Apply the required visual migration. Preserve handlers, content and accessibility behavior. Representative integration:
```tsx
primaryButton: { ...createControlStyles(colors).primaryButton },
sectionTitle: { ...textStyles.section, color: colors.ink }
```
- [ ] **Step 4: GREEN.** Run the new tests, existing tests covering edited pages, and npm run typecheck. Fix unexpected failures before dependent work.
- [ ] **Step 5: Self-review and report.** Check rendered layout and diff scope, record direct/indirect coverage and evidence, then provide the report for independent task review. No commit is authorized.

### Task 3: 活动、现场与邀请流程

**Files:**
- src/screens/events/EventsScreen.tsx
- src/screens/events/EventDetailScreen.tsx
- src/screens/events/EventRegistrationScreen.tsx
- src/screens/events/EventAttendeesScreen.tsx
- src/screens/events/EventCenterScreen.tsx
- src/screens/events/EventCenterContent.tsx
- src/screens/events/EventOperationsScreen.tsx
- src/screens/events/EventOperationsContent.tsx
- src/screens/events/EventAdmissionReviewScreen.tsx
- src/screens/events/EventAdmissionReviewContent.tsx
- src/screens/events/EventCheckInScreen.tsx
- src/screens/events/EventCheckInContent.tsx
- src/screens/events/EventRolesScreen.tsx
- src/screens/events/EventRolesContent.tsx
- src/screens/events/EventAnalyticsScreen.tsx
- src/screens/events/EventAnalyticsContent.tsx
- src/screens/party/PartyModeScreen.tsx
- src/screens/register/RegisterInviteScreen.tsx
- src/screens/organizer/OrganizerPublicScreen.tsx
- src/screens/home/HomeScreen.tsx
- Test: tests/app-wide-events.test.ts

**Interfaces:**
- Consumes: Task 1 的 layout/textStyles/createControlStyles、兼容的 AppScreen/DataCard；既有页面接口/API 均保持。
- Produces: 活动封面/日期/场地为主体，列表与详情减少双重卡片；报名、运营、签到、审核、角色、分析和邀请页保持同套页头与表单样式。所有按钮/筛选不裁剪且可触控；权限/数据失败与只读边界保留。对只使用共享组件且没有局部冲突的薄包装屏可以不改代码，但在报告中逐项记录继承覆盖。不得改后端或执行真实报名/签到。

- [ ] **Step 1: Read and impact.** Read these files and adjacent tests, then run upstream impact on each function/style entry before modifying it. Report the risk. Do not edit excluded files.
- [ ] **Step 2: RED.** 通过已有纯 Content 组件渲染成功/错误/权限分支；补 320pt 多按钮组和长活动名的内容边界断言，点击回调参数正确。保留活动 cover、报名字段、权限禁用条件；完整运行 event-* render/source tests 与新增测试。

```ts
// Render the real production consumer with controlled native/network boundaries.
const box = (await action.boundingBox())!;
assert.ok(box.height >= 44);
assert.ok(box.x >= 0 && box.x + box.width <= 320);
await action.click();
assert.deepEqual(await page.evaluate(() => window.fixture.requests), expectedRequests);
```

Run targeted tests with:
```sh
node --test --import tsx --import ./tests/helpers/register-render-hooks.mjs tests/app-wide-events.test.ts
```
Expected RED is a visible behavior/layout contract mismatch, not a syntax/import failure. Read the existing behavior to choose concrete actions/fixtures; name the actual production break caught by each test.

- [ ] **Step 3: Implement.** Apply the required visual migration. Preserve handlers, content and accessibility behavior. Representative integration:
```tsx
<DataCard variant="inset" title={title}>{form}</DataCard>
secondaryButton: { ...createControlStyles(colors).secondaryButton }
```
- [ ] **Step 4: GREEN.** Run the new tests, existing tests covering edited pages, and npm run typecheck. Fix unexpected failures before dependent work.
- [ ] **Step 5: Self-review and report.** Check rendered layout and diff scope, record direct/indirect coverage and evidence, then provide the report for independent task review. No commit is authorized.

### Task 4: AI、消息、任务与日程

**Files:**
- src/screens/ai/AiScreen.tsx
- src/screens/ai/AiConversationScreen.tsx
- src/screens/ai/OrbitNextActions.tsx
- src/screens/ai/AgentActionsScreen.tsx
- src/screens/chat/RelationshipChatScreen.tsx
- src/screens/chat/RelationshipChatDetailScreen.tsx
- src/screens/inbox/RelationshipInboxScreen.tsx
- src/screens/today/TodayScreen.tsx
- src/screens/tasks/TasksScreen.tsx
- src/screens/tasks/TaskDetailScreen.tsx
- src/screens/schedule/ScheduleScreen.tsx
- src/screens/schedule/ScheduleEventPreviewScreen.tsx
- src/screens/followups/FollowupsScreen.tsx
- src/screens/agent/AgentLedgerScreen.tsx
- src/screens/agent/AgentLedgerContent.tsx
- Test: tests/app-wide-workspaces.test.ts

**Interfaces:**
- Consumes: Task 1 的 layout/textStyles/createControlStyles、兼容的 AppScreen/DataCard；既有页面接口/API 均保持。
- Produces: AI 保留已批准的阅读画布/首页建议/输入器，统一顶栏、侧栏、历史与菜单的按钮、字体和底面。收件箱保留已完成邮件式列表与所有无发送能力说明，不倒退为旧统计卡。聊天详情/任务/今日/跟进/行动记录统一视觉。日历保持日周月网格和不同事件语义色，调整容器/字体/操作密度而不改时间逻辑。不能改变发送、保存、忽略、删除与 API 行为。

- [ ] **Step 1: Read and impact.** Read these files and adjacent tests, then run upstream impact on each function/style entry before modifying it. Report the risk. Do not edit excluded files.
- [ ] **Step 2: RED.** 受控边界下验证抽屉/历史/菜单打开关闭、草稿保持和窄屏按钮；日历视图切换保留日期与事件；任务可展开且不误触写操作。保留现有 inbox/contacts/AI 交互测试。

```ts
// Render the real production consumer with controlled native/network boundaries.
const box = (await action.boundingBox())!;
assert.ok(box.height >= 44);
assert.ok(box.x >= 0 && box.x + box.width <= 320);
await action.click();
assert.deepEqual(await page.evaluate(() => window.fixture.requests), expectedRequests);
```

Run targeted tests with:
```sh
node --test --import tsx --import ./tests/helpers/register-render-hooks.mjs tests/app-wide-workspaces.test.ts
```
Expected RED is a visible behavior/layout contract mismatch, not a syntax/import failure. Read the existing behavior to choose concrete actions/fixtures; name the actual production break caught by each test.

- [ ] **Step 3: Implement.** Apply the required visual migration. Preserve handlers, content and accessibility behavior. Representative integration:
```tsx
input: { ...createControlStyles(colors).input },
page: { backgroundColor: colors.surface, paddingHorizontal: layout.pageInset }
```
- [ ] **Step 4: GREEN.** Run the new tests, existing tests covering edited pages, and npm run typecheck. Fix unexpected failures before dependent work.
- [ ] **Step 5: Self-review and report.** Check rendered layout and diff scope, record direct/indirect coverage and evidence, then provide the report for independent task review. No commit is authorized.

### Task 5: 账号、设置与管理辅助页

**Files:**
- src/screens/profile/ProfileScreen.tsx
- src/screens/profile/AccountScreen.tsx
- src/screens/profile/AccountAuthScreen.tsx
- src/screens/profile/AccountPermissionsScreen.tsx
- src/screens/settings/SettingsScreen.tsx
- src/screens/settings/ApiSettingsScreen.tsx
- src/screens/admin/AdminScreen.tsx
- src/screens/admin/AdminLoginScreen.tsx
- src/screens/platform/PlatformScreen.tsx
- Test: tests/app-wide-account.test.ts

**Interfaces:**
- Consumes: Task 1 的 layout/textStyles/createControlStyles、兼容的 AppScreen/DataCard；既有页面接口/API 均保持。
- Produces: 设置采用清晰的导航行，保留目的地和权限条件；个人资料和登录/注册/找回密码/权限/管理页统一表单、主次操作、章节与错误提示。无需边界的说明使用开放分区；凭证、权限或风险输入保留 inset。保留原安全边界与 API 地址编辑行为。不能注销真实会话、发送重置邮件或更新真实配置。

- [ ] **Step 1: Read and impact.** Read these files and adjacent tests, then run upstream impact on each function/style entry before modifying it. Report the risk. Do not edit excluded files.
- [ ] **Step 2: RED.** 真实 SettingsScreen 导航与登录前后目的地显示；认证表单可编辑，错误后仍保留输入；权限控件禁用/可用可区分，320pt 操作无水平溢出。覆盖相关原有 render/source tests。

```ts
// Render the real production consumer with controlled native/network boundaries.
const box = (await action.boundingBox())!;
assert.ok(box.height >= 44);
assert.ok(box.x >= 0 && box.x + box.width <= 320);
await action.click();
assert.deepEqual(await page.evaluate(() => window.fixture.requests), expectedRequests);
```

Run targeted tests with:
```sh
node --test --import tsx --import ./tests/helpers/register-render-hooks.mjs tests/app-wide-account.test.ts
```
Expected RED is a visible behavior/layout contract mismatch, not a syntax/import failure. Read the existing behavior to choose concrete actions/fixtures; name the actual production break caught by each test.

- [ ] **Step 3: Implement.** Apply the required visual migration. Preserve handlers, content and accessibility behavior. Representative integration:
```tsx
<DataCard onPress={() => router.push(destination.href)} title={destination.title} detail={destination.detail} />
```
- [ ] **Step 4: GREEN.** Run the new tests, existing tests covering edited pages, and npm run typecheck. Fix unexpected failures before dependent work.
- [ ] **Step 5: Self-review and report.** Check rendered layout and diff scope, record direct/indirect coverage and evidence, then provide the report for independent task review. No commit is authorized.

### Task 6: 全路由与原生状态验收、统一修整

**Files:**
- tests/app-wide-route-coverage.test.ts
- docs/designs/2026-09-08-app-wide-style/README.md
- design-qa.md
- Test: tests/app-wide-route-coverage.test.ts

**Interfaces:**
- Consumes: Task 1 的 layout/textStyles/createControlStyles、兼容的 AppScreen/DataCard；既有页面接口/API 均保持。
- Produces: 从真实 app/ 入口建立 58 项覆盖矩阵（允许路由复用，4 条跳转单独标注）；补遗漏的 drawer/modal/edit/empty/error/loading 状态。逐条原生导航、截图检查；在真实权限/数据边界无法显示成功内容时记录，并用受控 fixture 验证内容。修整必须回到所属实现者、impact/TDD/审查，不能以只读空态冒充完整业务验收。

- [ ] **Step 1: Read and impact.** Read these files and adjacent tests, then run upstream impact on each function/style entry before modifying it. Report the risk. Do not edit excluded files.
- [ ] **Step 2: RED.** 路由覆盖测试读取真实路由入口，与独立维护的明确预期路由集合比较，缺页或新增未验收入口必须失败。渲染测试执行页面和交互，而不是仅断言文件名存在。完成 npm test、typecheck、diff 检查及独立整体审查。

```ts
// Render the real production consumer with controlled native/network boundaries.
const box = (await action.boundingBox())!;
assert.ok(box.height >= 44);
assert.ok(box.x >= 0 && box.x + box.width <= 320);
await action.click();
assert.deepEqual(await page.evaluate(() => window.fixture.requests), expectedRequests);
```

Run targeted tests with:
```sh
node --test --import tsx --import ./tests/helpers/register-render-hooks.mjs tests/app-wide-route-coverage.test.ts
```
Expected RED is a visible behavior/layout contract mismatch, not a syntax/import failure. Read the existing behavior to choose concrete actions/fixtures; name the actual production break caught by each test.

- [ ] **Step 3: Implement.** Apply the required visual migration. Preserve handlers, content and accessibility behavior. Representative integration:
```tsx
assert.deepEqual(actualRouteEntries.sort(), expectedRouteEntries.sort());
assert.ok(horizontalOverflow.length === 0, JSON.stringify(horizontalOverflow));
```
- [ ] **Step 4: GREEN.** Run the new tests, existing tests covering edited pages, and npm run typecheck. Fix unexpected failures before dependent work.
- [ ] **Step 5: Self-review and report.** Check rendered layout and diff scope, record direct/indirect coverage and evidence, then provide the report for independent task review. No commit is authorized.

