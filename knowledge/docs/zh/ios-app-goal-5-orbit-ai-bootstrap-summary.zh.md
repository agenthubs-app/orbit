# iOS App 目标 5：Orbit AI 启动摘要计划

本页是 Orbit Wiki 的中文阅读版，也是中文阅读入口。它不是新的权威副本；权威内容仍以原始来源、关联代码和测试为准。

## 页面元信息

| 字段 | 内容 |
| --- | --- |
| 原始来源 | `docs/superpowers/plans/2026-07-03-orbit-ios-app-goal-5-orbit-ai-bootstrap-summary.md` |
| 中文镜像 | `knowledge/docs/zh/ios-app-goal-5-orbit-ai-bootstrap-summary.zh.md` |
| 分类 | `implementation-plan` |
| 状态 | `historical` |
| 新鲜度 | `likely-current` |
| 负责人域 | `ios-app` |

## 怎么读

这页主要提供历史背景。不要把它当成当前实现说明，当前行为应回到相关代码路径、主题知识页和更新后的设计文档确认。

已登记来源和关联代码，但后续改动仍需要重新核对。

下方“结构化阅读入口”按原文标题列出阅读顺序。

## 中文摘要

为 Orbit AI Tab 增加 API 驱动的启动摘要：通过 /api/app/bootstrap 读取关系上下文，在 bootstrap 视图模型中新增 bootstrapMetrics 生成 Events/Follow-ups/Relationships/Assistant actions 等紧凑指标卡，让用户发消息前先看到当日关系概览。坚持不新增第六个 Tab、不做营销式首页。

## 审计依据

一次性 TDD 实施计划，属于已执行的历史材料；repos/orbit-app/src/view-models/bootstrap.ts 与 bootstrap-view-model.test.ts 已包含对应实现。当前摘要卡的字段与文案以 orbit-app 代码和 orbits 侧 bootstrap API 载荷为准。

## 结构化阅读入口

- 第 1 节：Orbit iOS App 目标 5: Orbit AI Bootstrap 摘要 实现 计划
- 第 2 节：源标题：Global Constraints
- 第 3 节：任务 1: Bootstrap 摘要 View Model
- 第 4 节：任务 2: Orbit AI Startup 摘要 UI
- 第 5 节：任务 3: Visual 验证 和 Docs
- 第 6 节：源标题：Self Review
- 第 7 节：执行 Choice

## 保留的代码与命令证据

### 代码证据 1

```ts
test("bootstrapMetrics creates compact home metrics", () => {
  const metrics = bootstrapMetrics({
    assistantActionCount: 2,
    highValueRelationships: 5,
    nextAction: "Review today's follow-ups.",
    pendingFollowupCount: 4,
    profileName: "Xinyi Zhao",
    relationshipAssetCount: 42,
    summary: "You have 4 follow-ups and 2 upcoming events.",
    upcomingEventCount: 2,
    workspaceName: "Orbit Dev"
  });

  assert.deepEqual(metrics, [
    { label: "Events", value: 2 },
    { label: "Follow-ups", value: 4 },
    { label: "Relationships", value: 42 },
    { label: "Assistant actions", value: 2 }
  ]);
});
```

### 代码证据 2

```bash
cd repos/orbit-app
npm test -- tests/bootstrap-view-model.test.ts
```

### 代码证据 3

```ts
export interface BootstrapMetric {
  label: string;
  value: number;
}

export function bootstrapMetrics(
  summary: AppBootstrapSummary
): BootstrapMetric[] {
  return [
    { label: "Events", value: summary.upcomingEventCount },
    { label: "Follow-ups", value: summary.pendingFollowupCount },
    { label: "Relationships", value: summary.relationshipAssetCount },
    { label: "Assistant actions", value: summary.assistantActionCount }
  ];
}
```

### 代码证据 4

```bash
cd repos/orbit-app
npm test -- tests/bootstrap-view-model.test.ts
```

### 代码证据 5

```text
gitnexus_impact target=AiScreen direction=upstream file_path=repos/orbit-app/src/screens/ai/AiScreen.tsx
```

### 代码证据 6

```ts
const bootstrapState = useApiResource<unknown>(
  ORBIT_API_ENDPOINTS.bootstrap,
  () => false
);
```

### 代码证据 7

```tsx
<OrbitSummaryCard state={bootstrapState} />
```

### 代码证据 8

```bash
cd repos/orbit-app
npm test
npm run typecheck
```

### 代码证据 9

```markdown
Orbit AI also reads `/api/app/bootstrap` to show the startup relationship summary above the composer.
```

### 代码证据 10

```bash
cd repos/orbit-app
CI=1 EXPO_PUBLIC_ORBIT_API_BASE_URL=http://localhost:3000 npx expo start --web --port 19006 --clear
```

### 代码证据 11

```text
/tmp/orbit-app-ai-bootstrap-summary.png
```

### 代码证据 12

```bash
git add src/view-models/bootstrap.ts tests/bootstrap-view-model.test.ts src/screens/ai/AiScreen.tsx README.md
gitnexus_detect_changes scope=staged repo=orbit
git commit -m "feat(mobile): show Orbit AI startup summary"
```

## 源文档正文

源文档正文主要不是中文。中文镜像不直接机翻全文，避免生成一份看似同步、实际难以审计的副本；阅读时先看本页摘要、审计依据、标题入口和代码证据。需要逐段核对时，请打开上方原始来源。
