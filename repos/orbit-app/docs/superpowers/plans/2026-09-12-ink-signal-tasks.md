# Ink & Signal 待办列表与详情 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将已批准的 2a 待办与待办详情视觉应用于真实任务，保留现有写入、草稿、提醒及历史能力。

**Architecture:** 列表改用现有无状态过滤的 `tasksPath()`，同一份记录生成未完成／完成计数和日期分组。详情保留行内编辑、原有 mutation scope 与版本冲突逻辑，仅重排标题、真实元数据、内容与固定动作区；不修改公共 AppScreen、API 或共享契约。

**Tech Stack:** Expo、React Native、TypeScript、现有 RNW / Playwright / node:test。

**Spec:** `docs/designs/2026-09-12-ink-signal/README.md`；原稿 `2a-待办.png`、`2a-待办详情.png` 及 HTML 第 298–331 行。

## Global Constraints

- 只编辑 `repos/orbit-app`；沿用用户批准的原地工作，不提交、推送、部署或写入真实数据库。
- 白底、墨黑、信号蓝、16pt inset；最小触控 44pt；系统大字号和深色模式可用。
- 功能优先，不伪造联系人、来源、创建时间或状态；列表“＋”进入现有 `/today` 添加表单。
- `tasksPath()` 已只读核对服务端支持全部状态，无分页截断；取消记录不混入未完成或完成。
- 分组用东京真实日期：逾期、今天、之后、未安排；不把过期和无日期事项丢掉。打开未完成标签时保留完成记录区，点击该行使用记录自身状态恢复。
- 行内失焦保存、expectedUpdatedAt、失败草稿、同步锁、迟到写入隔离、提醒授权和删除行为保留；不增加新的删除或取消能力。
- 仅做本批定向回归；全量回归在剩余页面后统一执行。RNW 证据不当作原生真机验收。

## Files and interfaces

- Modify `src/screens/tasks/TasksScreen.tsx`: 开放列表、下划线 tabs、真实计数和日期分组、按行状态 complete/reopen。
- Modify `src/screens/tasks/TaskDetailScreen.tsx`: 24pt 标题和复选框、状态／日期、元数据、内容、保留的设置与固定底部操作；编辑按钮聚焦现有标题输入，不改保存协议。
- Modify `src/view-models/today-tasks.ts`: `TaskListRowView` 增加可选 `plannedDate` / `dueAt`；`TaskDetailView` 增加可选 `createdAt` / `sourceLabel` / `relatedContactId` / `relatedEventId`，仅投影已有真实字段。
- Create `tests/ink-signal-tasks.test.ts`: 真实屏幕、VM、RNW；只替换设备／导航／外部 I/O，包含视图、跳转、写入及多尺寸对照。
- Modify `tests/today-tasks-screen-source.test.ts`, `tests/app-wide-workspaces.test.ts`: 更新已批准视觉的旧 tab / 布局期待；保留业务断言。
- Preserve `tests/task-detail-interactions.test.ts` 全部草稿／重试／权限断言；若新增原生安全区 hook，只补设备边界夹具。

### Task 1: 分组待办列表

**Consumes:** `tasksPath(): string`; `tasksToListView(payload, "open" | "completed", now?)`; `client.patch(taskPath(id), {body: {action, idempotencyKey}})`。

**Produces:** 未完成／已完成真实计数与日期分组，方形复选框和完整文字；完成区的恢复不受当前标签影响。

- [x] 新增先失败的页面测试：固定东京 2026-09-11，三条今天／两条未来／一条已完成；额外逾期和无日期记录各归其组，取消不出现。验证标签状态与下划线、44pt 触控、完成预览的恢复请求及详情 ID 编码。

```ts
await page.getByRole("tab", { name: "未完成 5", exact: true }).waitFor();
await page.getByRole("checkbox", { name: "恢复：发送上次活动总结", exact: true }).click();
assert.equal(requests[0].body.action, "reopen");
assert.equal(requests[0].path, "/api/tasks/done%3A1");
```

- [x] `node --import tsx --test tests/ink-signal-tasks.test.ts`，确认失败来自缺失分组／新视觉而不是装配错误。
- [x] GitNexus 已逐符号分析后实施，保留 requestedMode 深链；当前日期由东京时区生成，不写死参考数据。

```ts
const open = tasksToListView(state.data, "open", now);
const completed = tasksToListView(state.data, "completed", now);
const action = item.status === "completed" ? "reopen" : "complete";
```

- [x] 跑新测试及 today/tasks VM、source、workspaces 回归；截图并核对正常、大字号、深色。

### Task 2: 待办详情与保留操作

**Consumes:** 原有 `taskDetailToView`, `taskActivitiesToView`, `reminderPlansToView` 和 `mutate` / `save` / `changeStatus` / 提醒处理器。

**Produces:** 以真实任务为内容的开放详情与固定完成／编辑操作，无修改时聚焦编辑不写；来源、创建时间及关联跳转来自记录。

- [x] 新增先失败测试：真实手动来源、创建日期、关联联系人链接、备注正文、复选框与主动作；编辑聚焦但不写、保存失败保留草稿、完成／恢复使用原协议。320pt 双倍文字与 820pt 深色不横溢或遮挡底栏。

```ts
await page.getByText("手动创建", { exact: true }).waitFor();
await page.getByRole("button", { name: "编辑待办", exact: true }).last().click();
assert.equal(await page.getByRole("textbox", { name: "待办标题", exact: true }).evaluate(el => el === document.activeElement), true);
assert.deepEqual(requests, []);
```

- [x] 运行新测试确认 RED；补 UI 和可选元数据投影，不重写已有变更逻辑。

```tsx
<TextInput ref={titleInputRef} accessibilityLabel="待办标题" multiline onBlur={save} onChangeText={setTitle} value={title} />
<Pressable accessibilityLabel="编辑待办" onPress={() => titleInputRef.current?.focus()} />
```

- [x] 定向测试、typecheck、diff check；与两张同状态源图成组对照；独立复审并修复 Important/Critical 问题。
- [x] 更新本批 QA、根 `design-qa.md` 与设计 README，记录原生／真实写入未验范围；继续联系跟进，不在此声称全包完成。

## Self-review

两张稿的布局及自己的保留操作均覆盖。参考“关联人脉”中的姓名／头像不在任务契约内，显示真实关联跳转而不编造；无支持字段不展示空壳元数据。分组和所有按钮均有消费者交互断言。现有目录模式保持，不新增框架、依赖或公共容器接口。
