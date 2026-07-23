# iOS App 目标 8：可行动的联系人卡片计划

本页是 Orbit Wiki 的中文阅读版，也是中文阅读入口。它不是新的权威副本；权威内容仍以原始来源、关联代码和测试为准。

## 页面元信息

| 字段 | 内容 |
| --- | --- |
| 原始来源 | `docs/superpowers/plans/2026-07-03-orbit-ios-app-goal-8-actionable-contact-cards.md` |
| 中文镜像 | `knowledge/docs/zh/ios-app-goal-8-actionable-contact-cards.zh.md` |
| 分类 | `implementation-plan` |
| 状态 | `historical` |
| 新鲜度 | `likely-current` |
| 负责人域 | `ios-app` |

## 怎么读

这页主要提供历史背景。不要把它当成当前实现说明，当前行为应回到相关代码路径、主题知识页和更新后的设计文档确认。

已登记来源和关联代码，但后续改动仍需要重新核对。

下方“结构化阅读入口”按原文标题列出阅读顺序。

## 中文摘要

让 Contacts Tab 展示下一步行动、状态与价值上下文：扩展联系人摘要映射器输出 nextAction、用户可读的 status（如 needs_follow_up 转为 Needs follow up）与 valueScore，在现有卡片列表中渲染并保留详情导航，同时不暴露 source/provider 等内部字段。

## 审计依据

一次性 TDD 实施计划，属于已执行的历史材料；repos/orbit-app/src/view-models/contacts.ts 与 ContactsScreen.tsx 已实现扩展映射。当前联系人卡片行为以 orbit-app 代码及 orbits 侧 /api/contacts 载荷为准。

## 结构化阅读入口

- 第 1 节：Orbit iOS App 目标 8: Actionable 联系人 Cards 实现 计划
- 第 2 节：源标题：Global Constraints
- 第 3 节：任务 1: Expand 联系人 摘要 Mapper
- 第 4 节：任务 2: 渲染 Actionable 联系人 Cards
- 第 5 节：任务 3: 验证 和 Commit
- 第 6 节：源标题：Self Review
- 第 7 节：执行 Choice

## 保留的代码与命令证据

### 代码证据 1

```ts
nextAction: "Send the storage intro.",
status: "needs_follow_up",
value: {
  score: 91
}
```

### 代码证据 2

```ts
nextAction: "Send the storage intro.",
status: "Needs follow up",
valueScore: 91
```

### 代码证据 3

```bash
cd repos/orbit-app
npm test -- tests/screen-state.test.ts
```

### 代码证据 4

```ts
export interface ContactSummary {
  id: string;
  name: string;
  nextAction: string;
  organization: string;
  relationship: string;
  status: string;
  valueScore: number | null;
}
```

### 代码证据 5

```ts
function numberField(record: Record<string, unknown>, fieldName: string): number | null {
  const value = record[fieldName];
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function labelFromToken(value: string, fallback: string): string {
  const normalized = value.replace(/[_-]+/gu, " ").trim().toLowerCase();
  if (!normalized) {
    return fallback;
  }
  return `${normalized.charAt(0).toUpperCase()}${normalized.slice(1)}`;
}

function valueScore(contact: Record<string, unknown>): number | null {
  const value = contact.value;
  return isRecord(value) ? numberField(value, "score") : null;
}
```

### 代码证据 6

```ts
nextAction: stringField(
  contact,
  "nextAction",
  "Ask Orbit AI for the next relationship move."
),
status: labelFromToken(stringField(contact, "status"), "Active"),
valueScore: valueScore(contact)
```

### 代码证据 7

```bash
cd repos/orbit-app
npm test -- tests/screen-state.test.ts
```

### 代码证据 8

```text
gitnexus_impact target=ContactsScreen direction=upstream file_path=repos/orbit-app/src/screens/contacts/ContactsScreen.tsx
```

### 代码证据 9

```tsx
<Text style={styles.relationshipText}>{contact.relationship}</Text>
<Text style={styles.nextActionText}>{contact.nextAction}</Text>
{contact.valueScore === null ? null : (
  <Text style={styles.valueText}>{contact.valueScore} value score</Text>
)}
```

### 代码证据 10

```tsx
detail={[contact.organization, contact.status].filter(Boolean).join(" | ")}
```

### 代码证据 11

```ts
relationshipText: {
  color: colors.ink,
  fontSize: typography.small,
  lineHeight: 20
},
nextActionText: {
  color: colors.muted,
  fontSize: typography.small,
  lineHeight: 20
},
valueText: {
  color: colors.accent,
  fontSize: typography.caption,
  fontWeight: "800",
  textTransform: "uppercase"
}
```

### 代码证据 12

```markdown
- Contacts: reads `/api/contacts` and shows next action, status, and value context.
```

### 代码证据 13

```bash
cd repos/orbit-app
npm test
npm run typecheck
```

### 代码证据 14

```text
/tmp/orbit-app-contacts-actionable-cards.png
```

### 代码证据 15

```bash
git add docs/superpowers/plans/2026-07-03-orbit-ios-app-goal-8-actionable-contact-cards.md repos/orbit-app/README.md repos/orbit-app/src/view-models/contacts.ts repos/orbit-app/src/screens/contacts/ContactsScreen.tsx repos/orbit-app/tests/screen-state.test.ts
gitnexus_detect_changes scope=staged repo=orbit
git commit -m "feat(mobile): show actionable contact cards"
```

## 源文档正文

源文档正文主要不是中文。中文镜像不直接机翻全文，避免生成一份看似同步、实际难以审计的副本；阅读时先看本页摘要、审计依据、标题入口和代码证据。需要逐段核对时，请打开上方原始来源。
