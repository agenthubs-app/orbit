# Ink & Signal 人脉详情与编辑 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:executing-plans。沿用用户已批准 ZIP、功能优先、原地执行、不提交／推送／部署边界；不重复索取相同设计审批。

**Goal:** 实际 `/contacts/[id]` 对齐 `1c-人脉详情` 与 `3a-人脉编辑` 的视觉，保留当前业务能力与失败草稿。

**Architecture:** 保留 ContactDetailScreen 的资源入口及现有 view-model／备注组件，新增页面内编辑模式，不新增远程服务。只把支持字段组织成一次显式 PATCH；不修改共享生成副本。详情的身份、基本资料、合作信息为开放区域，来源和关系价值保持可访问，私有备注不冒充关联会议笔记。

**Tech Stack:** Expo Router、React Native、react-native-svg、现有 HTTP client、Zod、Node/RNW 渲染测试。

**Spec:** `docs/designs/2026-09-12-ink-signal/design_handoff_orbit_ink_signal/Orbit 改版方向.dc.html` 第 61–76、802–815 行及同名 PNG；参考已实际查看。

## 约束与已核实映射

- 基线 1524/1524；仅编辑 App，不新增数据库、API 或依赖。每个既有符号编辑前执行 GitNexus impact；HIGH/CRITICAL 先告知用户。
- 源稿 48pt 顶栏、72pt 详情头像／76pt 编辑头像、24pt 姓名、16pt inset、13pt 身份、12pt 地点、44pt 三项动作、15pt 区块标题、14pt 行值、72pt 键列。
- `/api/contacts/[id]` PATCH 白名单只有行业、状态、标签增删／替换、note、lastInteraction。姓名、职位、公司、邮箱显示真实只读值；不放更换头像、修改称呼或删除的假按钮。归档仍叫“暂不推进”，不改成删除。
- 状态保留 `active / needs_follow_up / nurture / archived`，不套用“初识／已合作／暂停”。按服务端 editableStatusOptions 及当前支持状态展示。
- “发消息”继续起草 `/inbox?contactId=…&participantName=…&organization=…`，不直接发送；没有当前新建日程表单，因此中间动作为“查看日程” `/schedule`；“写笔记”对应现有私有“写备注”，不提前实现 D7。
- 没有已核实会员身份字段，不伪造“外部联系人”；徽章显示真实来源和状态。基本资料未提供的字段显示“未填写”或省略，不填源图虚构邮箱／称呼。
- 普通刷新不能清空已填草稿；取消编辑不写入。保存中的重复点击只发一次；失败或不匹配的响应保留草稿。账号／服务器／Cookie／联系人／失焦隔离请求和页面状态。

## Task 1 · 详情结构与实际行为

**Files:** 修改 `src/screens/contacts/ContactDetailScreen.tsx`、`src/screens/contacts/ContactPage.tsx`、必要的 `ContactNotesSection.tsx`、`app/contacts/[id].tsx`；新增 `tests/ink-signal-contact-detail.test.ts`。

- [x] 新渲染测试先失败：实际路由显示“人脉详情”、真实姓名／公司／行业／邮箱与合作信息，头像 72pt，顶栏“编辑资料”，无主底栏，3 个 ≥44pt 动作；挂载与展开不写入。
- [x] 更新详情 chrome 与内容排列，保留真实图片优先、来源、关系价值重算与完整旧记录；“写备注”打开实际备注编辑器，原正文不翻译、不裁剪。
- [x] 实测并保留返回历史／直接入口回人脉、消息 query 编码、日程入口、备注失败草稿与重试。
- [x] 根路由使用完整身份作用域；无效／错误 ID 或异常详情数据不渲染虚构联系人，显示恢复操作。旧页面测试的样式期待按新设计更新，业务断言不能删除。

```ts
await press(page, "起草消息");
assert.equal(new URL(navigation.at(-1), "https://test.invalid").searchParams.get("contactId"), "contact:/1");
assert.deepEqual(writes, []);
```

## Task 2 · 有限字段编辑与保存

**Files:** 新增 App 消费模型 `src/view-models/contact-detail-editor.ts` 和测试 `tests/contact-detail-editor.test.ts`；接入同一 ContactDetailScreen 的编辑模式。

**Interfaces:** `contactDetailEditorFrom(data, contactId)` 返回可核实详情和原始标签／状态／行业；`buildContactDetailEditRequest(original, draft)` 只返回变更过的允许字段；`confirmContactDetailEdit(data, contactId, body)` 核对服务端回读。

- [x] 模型测试先失败：原始标签 ID 不用显示翻译替换，未改字段不发送，清空标签显式 `tags: []`，未改互动不写，状态遵守允许枚举，确认核对联系人 ID 与所有变更值。
- [x] 编辑页按源下划线、双列公司／职位、行业选择、状态 chips、标签呈现；只读字段明确，不画不能保存的光标。原互动输入在独立“互动记录”区域保留。
- [x] 顶栏取消只放弃本轮编辑，保存使用一次 PATCH；真实返回值确认后刷新详情并退出编辑；失败、非 2xx、pending、错误联系人或字段不匹配保留输入并给出提示。
- [x] 行为测试覆盖无变化、取消、组合保存、清空标签、失败重试、重复点击、普通刷新、账号／服务器／Cookie／联系人／焦点变化与迟到响应。

```ts
assert.deepEqual(buildContactDetailEditRequest(original, { ...draft, tags: [] }), { success: true, body: { tags: [] } });
assert.equal(confirmContactDetailEdit({ contact: { id: "other" } }, "contact:/1", { status: "active" }), false);
```

## Task 3 · 成组视觉核对与交接

- [x] 定向命令：`node --test --import tsx --import ./tests/helpers/register-render-hooks.mjs tests/ink-signal-contact-detail.test.ts tests/contact-detail-editor.test.ts tests/contact-notes-interactions.test.ts tests/contact-detail-screen-source.test.ts tests/contacts-redesign-interactions.test.ts`。
- [x] 390×844 详情与编辑实际截图分别与源稿成组对照，核对位置／字体／圆角／颜色；320pt、1.6 字号、820pt、末项滚动和输入反馈有位置断言。
- [x] `npm run typecheck`、`npm test`、`git diff --check`，独立只读复审；按实际证据更新设计 QA，原生与跨端未验范围明确保留。继续其余 ZIP 页面，不把本批当整包完成。
