# Live Record 存储层实施计划

本页是 Orbit Wiki 的中文阅读版，也是中文阅读入口。它不是新的权威副本；权威内容仍以原始来源、关联代码和测试为准。

## 页面元信息

| 字段 | 内容 |
| --- | --- |
| 原始来源 | `repos/orbits/docs/superpowers/plans/2026-07-01-live-record-storage.md` |
| 中文镜像 | `knowledge/docs/zh/app-plan-live-record-storage.zh.md` |
| 分类 | `implementation-plan` |
| 状态 | `historical` |
| 新鲜度 | `likely-current` |
| 负责人域 | `data` |

## 怎么读

这页主要提供历史背景。不要把它当成当前实现说明，当前行为应回到相关代码路径、主题知识页和更新后的设计文档确认。

已登记来源和关联代码，但后续改动仍需要重新核对。

下方“结构化阅读入口”按原文标题列出阅读顺序。

## 中文摘要

新增 shared/storage 薄存储层的 TDD 计划：定义数据库中立的 LiveRecord 信封与 LiveRecordStore 接口（list/get/upsert/delete）、内存实现和 orbit_records 的 Postgres 迁移 SQL，并以 Events 存储 provider 作为第一个消费者。约束包括不含 feature 业务规则、DTO 映射留在 feature provider、Search/Orbit AI 不直接读存储、单测不依赖运行中的 Postgres。

## 审计依据

这是一份 2026-07-01 的一次性实施计划，奠定了 shared/storage 与 hybrid local-remote-store 并存的边界；存储层现状应以 shared/storage/live-record-store.ts、migrations.ts 及 live-record-storage 测试为准。

## 结构化阅读入口

- 第 1 节：Live 记录 Storage 实现 计划
- 第 2 节：源标题：Global Constraints
- 第 3 节：任务 1: Live 记录 Store 契约
- 第 4 节：任务 2: 活动 Storage Provider
- 第 5 节：任务 3: Documentation 和 Typecheck Coverage
- 第 6 节：任务 4: Full 验证

## 保留的代码与命令证据

### 代码证据 1

```bash
node --test --import tsx tests/services/live-record-storage.test.ts
```

### 代码证据 2

```bash
node --test --import tsx tests/services/live-record-storage.test.ts
```

### 代码证据 3

```bash
node --test --import tsx tests/capabilities/event-crud-and-import-live-store.test.ts
```

### 代码证据 4

```bash
node --test --import tsx tests/services/live-record-storage.test.ts tests/capabilities/event-crud-and-import-live-store.test.ts
```

### 代码证据 5

```bash
npm run lint
node --test --import tsx tests/services/live-record-storage.test.ts tests/capabilities/event-crud-and-import-live-store.test.ts
```

### 代码证据 6

```bash
node --test --import tsx tests/services/live-record-storage.test.ts tests/capabilities/event-crud-and-import-live-store.test.ts tests/services/local-remote-store.test.ts tests/services/hybrid-service-factories.test.ts
```

### 代码证据 7

```bash
npm run lint
npm test
```

## 源文档正文

源文档正文主要不是中文。中文镜像不直接机翻全文，避免生成一份看似同步、实际难以审计的副本；阅读时先看本页摘要、审计依据、标题入口和代码证据。需要逐段核对时，请打开上方原始来源。
