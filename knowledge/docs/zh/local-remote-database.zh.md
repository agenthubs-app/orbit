# Local Remote Database 边界

本页是 Orbit Wiki 的中文阅读版。它保留原始文档的路径、代码块、命令和接口标识，用中文说明阅读目的、审计依据和结构入口。

## 页面元信息

| 字段 | 内容 |
| --- | --- |
| 原始来源 | `repos/orbits/docs/architecture/local-remote-database.md` |
| 中文镜像 | `knowledge/docs/zh/local-remote-database.zh.md` |
| 分类 | `architecture` |
| 状态 | `current` |
| 新鲜度 | `verified-current` |
| 负责人域 | `data` |

## 中文摘要

说明 app 本地/远端数据库边界和 relationship schema，是当前数据层和 mock/hybrid 模式的重要文档。

## 审计依据

已核对 ORBIT_LOCAL_REMOTE_DATABASE_SCHEMA_VERSION、orbit-database.ts、local-remote tests 和 relationship schema tests，当前数据层测试覆盖该边界。

## 结构化阅读入口

- 第 1 节：本地 远端 数据库 边界
- 第 2 节：源文档第 2 个标题
- 第 3 节：源文档第 3 个标题
- 第 4 节：源文档第 4 个标题
- 第 5 节：Sprint 81 Decision 审计
- 第 6 节：源文档第 6 个标题
- 第 7 节：Generated 关系 Seed
- 第 8 节：Browser And Server 边界
- 第 9 节：联系人
- 第 10 节：Core Agent Facing 服务
- 第 11 节：源文档第 11 个标题

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

该源文档主体不是中文。当前中文阅读版先保留中文摘要、审计依据、结构化入口和代码证据，不把英文原文混入默认阅读正文。
