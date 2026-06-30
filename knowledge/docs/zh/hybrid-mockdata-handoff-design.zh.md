# Hybrid Mockdata Handoff 设计

本页是 Orbit Wiki 的中文阅读版，也是中文阅读入口。它不是新的权威副本；权威内容仍以原始来源、关联代码和测试为准。

## 页面元信息

| 字段 | 内容 |
| --- | --- |
| 原始来源 | `docs/superpowers/specs/2026-06-30-hybrid-mockdata-handoff-design.md` |
| 中文镜像 | `knowledge/docs/zh/hybrid-mockdata-handoff-design.zh.md` |
| 分类 | `sprint-spec` |
| 状态 | `current` |
| 新鲜度 | `likely-current` |
| 负责人域 | `data` |

## 怎么读

这页是当前阅读入口。具体字段、函数签名和运行行为仍以原始来源、相关代码路径和测试为准。

已登记来源和关联代码，但后续改动仍需要重新核对。

下方“结构化阅读入口”按原文标题列出阅读顺序。

## 中文摘要

定义 relationship mockdata 如何生成 TypeScript fixture 并接入 hybrid local-remote database。

## 审计依据

已核对 relationship_data_goal_runner.py、generated-relationship-fixtures.ts、fixtures.ts 和 hybrid/local-remote 相关测试存在。

## 结构化阅读入口

- 第 1 节：Hybrid Mockdata Handoff 设计
- 第 2 节：目标
- 第 3 节：架构
- 第 4 节：源标题：Requirements
- 第 5 节：Non 目标
- 第 6 节：验证

## 保留的代码与命令证据

### 代码证据 1

```text
feature hybrid service
  -> createOrbitLocalRemoteDatabase()
  -> defaultMockFixtures
  -> MockRuntimeFixtures DTOs from shared/domain/contracts.ts
```

## 源文档正文

源文档正文主要不是中文。中文镜像不直接机翻全文，避免生成一份看似同步、实际难以审计的副本；阅读时先看本页摘要、审计依据、标题入口和代码证据。需要逐段核对时，请打开上方原始来源。
