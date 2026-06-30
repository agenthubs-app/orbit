# Hybrid Mockdata Handoff 设计

本页是 Orbit Wiki 的中文阅读版。它保留原始文档的路径、代码块、命令和接口标识，用中文说明阅读目的、审计依据和结构入口。

## 页面元信息

| 字段 | 内容 |
| --- | --- |
| 原始来源 | `docs/superpowers/specs/2026-06-30-hybrid-mockdata-handoff-design.md` |
| 中文镜像 | `knowledge/docs/zh/hybrid-mockdata-handoff-design.zh.md` |
| 分类 | `sprint-spec` |
| 状态 | `current` |
| 新鲜度 | `likely-current` |
| 负责人域 | `data` |

## 中文摘要

定义 relationship mockdata 如何生成 TypeScript fixture 并接入 hybrid local-remote database。

## 审计依据

已核对 relationship_data_goal_runner.py、generated-relationship-fixtures.ts、fixtures.ts 和 hybrid/local-remote 相关测试存在。

## 结构化阅读入口

- 第 1 节：Hybrid Mockdata Handoff 设计
- 第 2 节：目标
- 第 3 节：架构
- 第 4 节：源文档第 4 个标题
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

该源文档主体不是中文。当前中文阅读版先保留中文摘要、审计依据、结构化入口和代码证据，不把英文原文混入默认阅读正文。
