# Connections 证据 Live Store 计划（Goal 3）

本页是 Orbit Wiki 的中文阅读版，也是中文阅读入口。它不是新的权威副本；权威内容仍以原始来源、关联代码和测试为准。

## 页面元信息

| 字段 | 内容 |
| --- | --- |
| 原始来源 | `repos/orbits/docs/superpowers/plans/2026-07-01-connections-live-store.md` |
| 中文镜像 | `knowledge/docs/zh/app-plan-connections-live-store.zh.md` |
| 分类 | `implementation-plan` |
| 状态 | `historical` |
| 新鲜度 | `likely-current` |
| 负责人域 | `connections` |

## 怎么读

这页主要提供历史背景。不要把它当成当前实现说明，当前行为应回到相关代码路径、主题知识页和更新后的设计文档确认。

已登记来源和关联代码，但后续改动仍需要重新核对。

下方“结构化阅读入口”按原文标题列出阅读顺序。

## 中文摘要

将连接/证据读取模型从 mock-only 迁移到基于 orbit_records（connections/contacts/evidence 集合）的 live 存储模式：新增 live 连接证据服务与存储 provider，注册 live 模式，API 路由改为 await 异步服务，addEvidence 在 live 模式下保持 fail-closed。验收含内存 live store 读到 510 条连接及远端 Postgres 返回生成的关系连接。

## 审计依据

这是一份 2026-07-01 的一次性实施计划（goal/scope/acceptance 形式），描述的是当时的目标而非现状；实际行为应以 features/connections 下的 live 服务、service-factory 及对应测试为准。

## 结构化阅读入口

- 第 1 节：目标 3: Connections Evidence Live Store
- 第 2 节：目标
- 第 3 节：源标题：Scope
- 第 4 节：验收

## 保留的代码与命令证据

源文档没有独立代码块；涉及的路径、命令和接口名保留在上方元信息中。


## 源文档正文

源文档正文主要不是中文。中文镜像不直接机翻全文，避免生成一份看似同步、实际难以审计的副本；阅读时先看本页摘要、审计依据、标题入口和代码证据。需要逐段核对时，请打开上方原始来源。
