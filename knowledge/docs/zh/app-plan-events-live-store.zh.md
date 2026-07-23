# Events Live Store 实施计划

本页是 Orbit Wiki 的中文阅读版，也是中文阅读入口。它不是新的权威副本；权威内容仍以原始来源、关联代码和测试为准。

## 页面元信息

| 字段 | 内容 |
| --- | --- |
| 原始来源 | `repos/orbits/docs/superpowers/plans/2026-07-01-events-live-store.md` |
| 中文镜像 | `knowledge/docs/zh/app-plan-events-live-store.zh.md` |
| 分类 | `implementation-plan` |
| 状态 | `historical` |
| 新鲜度 | `likely-current` |
| 负责人域 | `events` |

## 怎么读

这页主要提供历史背景。不要把它当成当前实现说明，当前行为应回到相关代码路径、主题知识页和更新后的设计文档确认。

已登记来源和关联代码，但后续改动仍需要重新核对。

下方“结构化阅读入口”按原文标题列出阅读顺序。

## 中文摘要

为 Events 的 event-crud-import 子能力增加显式 live 模式的 TDD 任务清单：先写失败测试，再实现带 LiveEventStoreProvider 的 live 服务（未配置 provider 时返回 EVENTS_LIVE_STORE_UNCONFIGURED），最后仅在该子能力的 factory 注册 live。明确不涉及日历 provider 导入，live 不得回退到 mock/hybrid，仅创建成功后才置 liveDatabaseWriteExecuted。

## 审计依据

这是一份按任务分步执行的一次性实施计划（含 RED/GREEN 验证命令与 GitNexus 检测步骤）；Events live 能力的现状应以 features/events/event-crud-and-import/live-service.ts、service-factory 及对应能力测试为准。

## 结构化阅读入口

- 第 1 节：活动 Live Store 实现 计划
- 第 2 节：源标题：Global Constraints
- 第 3 节：任务 1: Live Store 测试
- 第 4 节：任务 2: 契约 和 Live 服务
- 第 5 节：任务 3: Factory 和 Docs
- 第 6 节：任务 4: 验证

## 保留的代码与命令证据

### 代码证据 1

```ts
const liveResolution = resolveEventCrudAndImportService("live");
assert.equal(liveResolution.success, true);

const unconfigured = createLiveEventCrudAndImportService().listEvents();
assert.equal(unconfigured.success, false);
assert.equal(unconfigured.error.code, "EVENTS_LIVE_STORE_UNCONFIGURED");
```

### 代码证据 2

```bash
cd repos/orbits && node --test --import tsx tests/capabilities/event-crud-and-import-live-store.test.ts
```

### 代码证据 3

```bash
cd repos/orbits && node --test --import tsx tests/capabilities/event-crud-and-import-live-store.test.ts
```

### 代码证据 4

```bash
cd repos/orbits && node --test --import tsx tests/capabilities/event-crud-and-import-live-store.test.ts tests/services/core-service-factories.test.ts
```

### 代码证据 5

```bash
cd repos/orbits && node --test --import tsx tests/capabilities/event-crud-and-import-live-store.test.ts tests/capabilities/event-crud-and-import-mock.test.ts tests/services/core-service-factories.test.ts
```

### 代码证据 6

```bash
cd repos/orbits && npm run lint && npm test
```

## 源文档正文

源文档正文主要不是中文。中文镜像不直接机翻全文，避免生成一份看似同步、实际难以审计的副本；阅读时先看本页摘要、审计依据、标题入口和代码证据。需要逐段核对时，请打开上方原始来源。
