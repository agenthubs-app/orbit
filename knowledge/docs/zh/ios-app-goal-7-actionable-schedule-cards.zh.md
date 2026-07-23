# iOS App 目标 7：可行动的日程卡片计划

本页是 Orbit Wiki 的中文阅读版，也是中文阅读入口。它不是新的权威副本；权威内容仍以原始来源、关联代码和测试为准。

## 页面元信息

| 字段 | 内容 |
| --- | --- |
| 原始来源 | `docs/superpowers/plans/2026-07-03-orbit-ios-app-goal-7-actionable-schedule-cards.md` |
| 中文镜像 | `knowledge/docs/zh/ios-app-goal-7-actionable-schedule-cards.zh.md` |
| 分类 | `implementation-plan` |
| 状态 | `historical` |
| 新鲜度 | `likely-current` |
| 负责人域 | `ios-app` |

## 怎么读

这页主要提供历史背景。不要把它当成当前实现说明，当前行为应回到相关代码路径、主题知识页和更新后的设计文档确认。

已登记来源和关联代码，但后续改动仍需要重新核对。

下方“结构化阅读入口”按原文标题列出阅读顺序。

## 中文摘要

把 Schedule Tab 从占位文案升级为可行动的跟进上下文：扩展 schedule 视图模型保留 /api/tasks 中的 contactName、organization、priority、recommendedAction 字段并在紧凑卡片中渲染，不新增后端路由，也暂不加任务详情路由（等详情 API 存在再说）。

## 审计依据

一次性 TDD 实施计划，属于已执行的历史材料；repos/orbit-app/src/view-models/schedule.ts 与 ScheduleScreen.tsx 已实现扩展字段。当前卡片字段与展示逻辑以 orbit-app 代码及 orbits 侧 /api/tasks 载荷为准。

## 结构化阅读入口

- 第 1 节：Orbit iOS App 目标 7: Actionable Schedule Cards 实现 计划
- 第 2 节：源标题：Global Constraints
- 第 3 节：任务 1: Expand Schedule View Model
- 第 4 节：任务 2: 渲染 Actionable Cards
- 第 5 节：任务 3: 验证 和 Commit
- 第 6 节：源标题：Self Review
- 第 7 节：执行 Choice

## 保留的代码与命令证据

### 代码证据 1

```ts
contactName: "Maya Chen",
organization: "Kumo Grid",
priority: "today",
recommendedAction: "Send a concise recap before suggesting a pilot call."
```

### 代码证据 2

```ts
contactName: "Maya Chen",
organization: "Kumo Grid",
priority: "today",
recommendedAction: "Send a concise recap before suggesting a pilot call."
```

### 代码证据 3

```bash
cd repos/orbit-app
npm test -- tests/screen-state.test.ts
```

### 代码证据 4

```ts
export interface ScheduleItem {
  contactName: string;
  dueAt: string;
  id: string;
  organization: string;
  priority: string;
  recommendedAction: string;
  title: string;
}
```

### 代码证据 5

```ts
contactName: stringField(task, "contactName"),
organization: stringField(task, "organization"),
priority: stringField(task, "priority", "follow-up"),
recommendedAction: stringField(
  task,
  "recommendedAction",
  "Review before taking action."
)
```

### 代码证据 6

```bash
cd repos/orbit-app
npm test -- tests/screen-state.test.ts
```

### 代码证据 7

```text
gitnexus_impact target=ScheduleScreen direction=upstream file_path=repos/orbit-app/src/screens/schedule/ScheduleScreen.tsx
```

### 代码证据 8

```tsx
<DataCard detail={scheduleDetail(task)} key={task.id} title={task.title}>
  <Text style={styles.actionText}>{task.recommendedAction}</Text>
  <Text style={styles.priorityText}>{task.priority}</Text>
</DataCard>
```

### 代码证据 9

```ts
function scheduleDetail(task: ScheduleItem): string {
  return [task.dueAt, task.contactName, task.organization]
    .filter(Boolean)
    .join(" | ");
}
```

### 代码证据 10

```ts
actionText: {
  color: colors.ink,
  fontSize: typography.small,
  lineHeight: 20
},
priorityText: {
  color: colors.accent,
  fontSize: typography.caption,
  fontWeight: "800",
  textTransform: "uppercase"
}
```

### 代码证据 11

```markdown
- Schedule: reads `/api/tasks` and shows actionable follow-up context.
```

### 代码证据 12

```bash
cd repos/orbit-app
npm test
npm run typecheck
```

### 代码证据 13

```text
/tmp/orbit-app-schedule-actionable-cards.png
```

### 代码证据 14

```bash
git add docs/superpowers/plans/2026-07-03-orbit-ios-app-goal-7-actionable-schedule-cards.md repos/orbit-app/README.md repos/orbit-app/src/view-models/schedule.ts repos/orbit-app/src/screens/schedule/ScheduleScreen.tsx repos/orbit-app/tests/screen-state.test.ts
gitnexus_detect_changes scope=staged repo=orbit
git commit -m "feat(mobile): show actionable schedule cards"
```

## 源文档正文

源文档正文主要不是中文。中文镜像不直接机翻全文，避免生成一份看似同步、实际难以审计的副本；阅读时先看本页摘要、审计依据、标题入口和代码证据。需要逐段核对时，请打开上方原始来源。
