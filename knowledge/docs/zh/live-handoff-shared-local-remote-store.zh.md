# Shared Runtime 交接：local remote store

本页是 Orbit Wiki 的中文阅读版，也是中文阅读入口。它不是新的权威副本；权威内容仍以原始来源、关联代码和测试为准。

## 页面元信息

| 字段 | 内容 |
| --- | --- |
| 原始来源 | `repos/orbits/shared/local-remote-store/RELATIONSHIP_SCHEMA_LIVE_IMPLEMENTATION.md` |
| 中文镜像 | `knowledge/docs/zh/live-handoff-shared-local-remote-store.zh.md` |
| 分类 | `implementation-handoff` |
| 状态 | `generated-evidence` |
| 新鲜度 | `likely-current` |
| 负责人域 | `shared:local-remote-store` |

## 怎么读

这页是当前阅读入口。具体字段、函数签名和运行行为仍以原始来源、相关代码路径和测试为准。

已登记来源和关联代码，但后续改动仍需要重新核对。

下方“结构化阅读入口”按原文标题列出阅读顺序。

## 中文摘要

记录 shared/local-remote-store 共享层从 mock 或本地实现迁移到 live/runtime provider 时的契约、替换点和验证要求。

## 审计依据

已核对共享代码目录存在：repos/orbits/shared/local-remote-store。具体数据结构和 API 仍以 shared 层源码与测试为准。

## 结构化阅读入口

- 第 1 节：关系 结构 Live 实现 记录
- 第 2 节：Sprint 81 Evidence 摘要
- 第 3 节：后续 Provider Files
- 第 4 节：远端 Tables
- 第 5 节：结构 Value Validation
- 第 6 节：源标题：Indexes
- 第 7 节：源标题：JSON Fields
- 第 8 节：Environment 和 权限
- 第 9 节：Privacy 和 Provenance
- 第 10 节：Migration 和 Version Behavior
- 第 11 节：Replacement 测试
- 第 12 节：Sprint 81 Live Replacement 审计

## 保留的代码与命令证据

源文档没有独立代码块；涉及的路径、命令和接口名保留在上方元信息中。


## 源文档正文

源文档正文主要不是中文。中文镜像不直接机翻全文，避免生成一份看似同步、实际难以审计的副本；阅读时先看本页摘要、审计依据、标题入口和代码证据。需要逐段核对时，请打开上方原始来源。
