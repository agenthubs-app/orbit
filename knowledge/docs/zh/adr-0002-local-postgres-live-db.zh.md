# ADR-0002：本地 Live 数据库选用 Local Postgres

本页是 Orbit Wiki 的中文阅读版，也是中文阅读入口。它不是新的权威副本；权威内容仍以原始来源、关联代码和测试为准。

## 页面元信息

| 字段 | 内容 |
| --- | --- |
| 原始来源 | `docs/adr/0002-local-postgres-for-local-live-database.md` |
| 中文镜像 | `knowledge/docs/zh/adr-0002-local-postgres-live-db.zh.md` |
| 分类 | `adr` |
| 状态 | `current` |
| 新鲜度 | `likely-current` |
| 负责人域 | `data` |

## 怎么读

这页是当前阅读入口。具体字段、函数签名和运行行为仍以原始来源、相关代码路径和测试为准。

已登记来源和关联代码，但后续改动仍需要重新核对。

下方“结构化阅读入口”按原文标题列出阅读顺序。

## 中文摘要

决定第一个 Local Live Database 目标是本地 Postgres（而非 SQLite 或完整 Supabase 本地栈），使开发数据存储贴近未来 Supabase 生产形态；hybrid 仍是 localStorage/内存迁移模式，不等同于 Local Live Database。

## 审计依据

长期架构决定记录（ADR），仍是权威方向；具体连接与配置行为以 repos/orbits/shared/storage/postgres-live-record-store.ts 与 live-database-config.ts 的代码及相关存储测试为准。

## 结构化阅读入口

- 第 1 节：本地 Postgres For 本地 Live 数据库
- 第 2 节：源标题：Considered Options
- 第 3 节：源标题：Consequences

## 保留的代码与命令证据

源文档没有独立代码块；涉及的路径、命令和接口名保留在上方元信息中。


## 源文档正文

源文档正文主要不是中文。中文镜像不直接机翻全文，避免生成一份看似同步、实际难以审计的副本；阅读时先看本页摘要、审计依据、标题入口和代码证据。需要逐段核对时，请打开上方原始来源。
