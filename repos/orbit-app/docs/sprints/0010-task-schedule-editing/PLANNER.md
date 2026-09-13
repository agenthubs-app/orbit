# Sprint 0010 — 待办、地点与个人日程编辑

**Plan revision:** 1。**模式:** existing-codebase / single-generator。运行状态只在登记表。
**原需求:** R-08／B6。**单一目标:** 在批准的云端事项协议上补齐个人事项、地点及日期清空／提醒语义，三页回读同记录。
**基线:** 承接 0009 REPORT 和 [日期编辑证据](../../verification/2026-09-13-app-connectivity.md#13-r-08待办日期与截止时间编辑)；既有标题／备注、日期草稿、版本／幂等和匹配回执直接复用。
**进入条件:** 0009 已提交；B6 明确无 contactId 的个人事项创建、地点、清空日期、个人日程写入、版本冲突及提醒变更语义，具备授权隔离对象与 Web/App 共同版本。
**契约前置:** 现 `PATCH /api/tasks/:id` 拒绝空日期／null，无地点更新字段，`/api/schedule-items` 只有 GET；新方法／字段／回执及允许同步清单补入 Planner 并审阅后才能启动。

## 范围与文件

- 读取：[原计划 R-08](../../superpowers/plans/2026-09-13-app-remaining-functionality-and-connectivity.md#r-08待办日程独立编辑)、[API 缺口](../../api-gaps.md#task-dates-and-personal-schedule-editing-2026-09-13)、[日期子计划](../../superpowers/plans/2026-09-13-task-date-editing.md)、0009 REPORT。
- 读取：`src/api/contract/tasks.ts`、`src/api/contract/reminders.ts`、`src/notifications/native-notifications.ts`、0009 的时区接口；本 Sprint 不改通用通知调度器。
- 修改白名单：`src/screens/today/TodayScreen.tsx`、`src/screens/tasks/TaskDetailScreen.tsx`、`src/screens/schedule/ScheduleScreen.tsx`、`src/screens/home/HomeDashboardScreen.tsx`。
- 修改白名单：`src/view-models/today-tasks.ts`、`src/view-models/task-dates.ts`、`src/view-models/schedule.ts`、`src/view-models/home-dashboard.ts`；只触及事项编辑及回读。
- 条件性新建：`src/api/personal-schedule.ts`、`src/view-models/personal-schedule-editor.ts`、`tests/personal-schedule-interactions.test.tsx`、`tests/task-location-interactions.test.tsx`；位置与编辑交互按批准设计接入现有页面。
- 测试白名单：上述新测试与下列现有测试；文档仅本 Sprint `REPORT.md`；原始证据在 `build/harness-state/evidence/sprint-0010/run-01/`，先确认被忽略。
- 排除：Google／Apple 日历写权限、自动转成已确认会面、笔记建议（0019）、提醒引擎／服务端迁移、重新实现既有日期设置或长标题修复。

## 验收契约（最多五项）

| SC | 可观察行为 | 必需证据 |
| --- | --- | --- |
| SC-0010-01 | 用户可创建无 contactId 的个人事项并再次打开；其事项类型与状态真实，重复提交／重试只产生一条。 | 新 personal-schedule 交互测试与授权创建后同 ID 重开回读。 |
| SC-0010-02 | 日期、时间、地点可按协议编辑；明确清空后回读为空；仅有日期不补午夜截止时间，既有未提交标题／备注不夹带保存。 | task-date、task-location 交互测试；授权 PATCH／日程编辑的回执及重开记录。 |
| SC-0010-03 | 保存失败保留输入，版本冲突不覆盖远端，新账号／对象／迟到回执不能接受旧保存；用户明确重试沿用正确幂等意图。 | 现有日期／详情回归加新冲突、错误回执与作用域交互测试。 |
| SC-0010-04 | 改日期后提醒按批准语义更新或明确保持原计划；用户看到的提醒与服务端回读一致，无隐式外部日历权限申请。 | 对已有 `/api/reminders` 的受控读取／回执、必要实体提醒时间验证及权限调用记录。 |
| SC-0010-05 | 首页、待办、日历和 Web/App 对同一事项的日期、地点、状态回读一致；跨日／时区按 0009，公开活动预览不会自动创建私人事项。 | 原生编辑／键盘操作、同环境双向修改与重开；预览零写入回归。 |

## 一次 Generator 的执行顺序

1. 核对 B6、0009 接口和真实对象授权；缺写入或提醒语义先登记 blocked，不消耗 run-01；不根据 GET 猜测 POST。
2. 保存 Planner 哈希、HEAD／diff 和文件锁；逐符号 upstream impact，HIGH／CRITICAL 先报告，避免与其他首页／时区 Sprint 并行。
3. 承接有效日期 RED／GREEN，为个人事项、地点和清空／提醒差异补 RED；按批准 B6 最小实现，沿用已验证草稿与回执保护。
4. 同一 Generator 运行定向和 H 最终集，完成必要真实写入与原生回读；按 RULES 有限修复，不设 Evaluator 或再次生成。
5. 独立功能经验证后由协调者路径限定暂存、detect_changes、commit；写 REPORT 及跨端交接并结束。

## 最小测试与检查

- 档位：本次编制为 D；未来实施为 H，涉及业务写入、幂等、版本与提醒，必须类型检查、直接消费者及提交前一次全量。
- 以下命令 cwd 均为 `/Users/xzhao/Projects/orbit/repos/orbit-app`，本轮仅声明、不执行。

```sh
node --test --import tsx --import ./tests/helpers/register-render-hooks.mjs tests/task-detail-interactions.test.ts tests/task-date-interactions.test.ts tests/task-dates-view-model.test.ts tests/today-tasks-view-model.test.ts tests/schedule-view-model.test.ts
node --test --import tsx --import ./tests/helpers/register-render-hooks.mjs tests/home-dashboard.test.ts tests/home-dashboard-interactions.test.ts tests/ink-signal-schedule.test.ts tests/schedule-event-preview-view-model.test.ts tests/schedule-event-preview-screen-source.test.ts
```

- 新文件创建后：`node --test --import tsx --import ./tests/helpers/register-render-hooks.mjs tests/personal-schedule-interactions.test.tsx tests/task-location-interactions.test.tsx`；SC-01～04 的新增写入均经过真实路由／HTTP 客户端边界。
- H 最终集：`npm run typecheck`、`npm test`、`git diff --check`；批准 B6 副本改变才加 `node --test --import tsx --import ./tests/helpers/register-render-hooks.mjs tests/contract-sync.test.ts tests/api-schema-sync.test.ts tests/domain-sync.test.ts`。 同版本全量已包含这些同步用例时直接引用结果，不再单独重跑。
- HTTP：已知 task update 用 `expectedUpdatedAt` 与 `idempotencyKey`，新地点／清空／日程语义由 B6 提供；测试 2xx 接收不能替代 GET 持久化证据。
- 原生：Simulator 验证日期／时间／地点输入、键盘与失败草稿；提醒时间变化用授权实体设备；同对象 Web→App、App→Web 各回读一次。
- 不运行：外部日历联动、AI／OCR、全部用户旅程、Lighthouse、无关构建；未获设备／对象授权则保留必要 SC 受阻，不改成只读通过。

## 失败与交接

清空日期、地点、日程写入或提醒任一必要协议缺失则不启动；不能通过本地保存掩盖后端不支持。现有日期 UI 不关闭完整 R-08。
运行后必要回读失败／对象撤销按 RULES 记录 blocked／failed，保留已验证独立功能提交及未提交内容，不自动重开 Generator。
REPORT 包含 SC→文件→功能 SHA→证据、B6 版本、事项／提醒脱敏 ID、两端实际版本、失败／未验项；提供 Bridge 交接内容，不直接改根台账。
