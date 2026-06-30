# Local Remote Database 边界

本页是 Orbit Wiki 的中文阅读版，也是中文阅读入口。它不是新的权威副本；权威内容仍以原始来源、关联代码和测试为准。

## 页面元信息

| 字段 | 内容 |
| --- | --- |
| 原始来源 | `repos/orbits/docs/architecture/local-remote-database.md` |
| 中文镜像 | `knowledge/docs/zh/local-remote-database.zh.md` |
| 分类 | `architecture` |
| 状态 | `current` |
| 新鲜度 | `verified-current` |
| 负责人域 | `data` |

## 怎么读

这页是当前阅读入口。具体字段、函数签名和运行行为仍以原始来源、相关代码路径和测试为准。

已和代码或测试做过明确核对。

下方“结构化阅读入口”按原文标题列出阅读顺序。

## 中文摘要

说明 app 本地/远端数据库边界和 relationship schema，是当前数据层和 mock/hybrid 模式的重要文档。

## 审计依据

已核对 ORBIT_LOCAL_REMOTE_DATABASE_SCHEMA_VERSION、orbit-database.ts、local-remote tests 和 relationship schema tests，当前数据层测试覆盖该边界。

## 结构化阅读入口

- 第 1 节：本地 远端 数据库 边界
- 第 2 节：源标题：Shape
- 第 3 节：源标题：Collections
- 第 4 节：源标题：Field Decisions
- 第 5 节：Sprint 81 Decision 审计
- 第 6 节：模式
- 第 7 节：Generated 关系 Seed
- 第 8 节：Browser 和 Server 边界
- 第 9 节：联系人
- 第 10 节：Core Agent Facing 服务
- 第 11 节：源标题：Hybrid Fallback

## 保留的代码与命令证据

### 代码证据 1

```text
Feature service
  -> provider / repository interface
  -> shared/local-remote-store
  -> browser localStorage adapter, or memory adapter outside the browser
```

### 代码证据 2

```bash
ORBIT_MODULE_MODE=hybrid ORBIT_FEATURE_MODE=hybrid npm run dev
```

### 代码证据 3

```text
remote rows or generated mockdata
  -> MockRuntimeFixtures / shared domain DTOs
  -> createOrbitLocalRemoteDatabase()
  -> feature hybrid services
```

### 代码证据 4

```text
source: local-remote-store:orbit.local-remote-database.v3
generationMethod: local-remote-store-query
databaseQueryExecuted: true
searchIndexReadExecuted: false
```

### 代码证据 5

```text
source: local-remote-store:orbit.local-remote-database.v3
generationMethod: local-remote-store-query
```

## 源文档正文

源文档正文主要不是中文。中文镜像不直接机翻全文，避免生成一份看似同步、实际难以审计的副本；阅读时先看本页摘要、审计依据、标题入口和代码证据。需要逐段核对时，请打开上方原始来源。
