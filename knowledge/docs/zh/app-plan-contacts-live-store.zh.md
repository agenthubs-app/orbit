# Contacts Live Store 计划（Goal 2）

本页是 Orbit Wiki 的中文阅读版，也是中文阅读入口。它不是新的权威副本；权威内容仍以原始来源、关联代码和测试为准。

## 页面元信息

| 字段 | 内容 |
| --- | --- |
| 原始来源 | `repos/orbits/docs/superpowers/plans/2026-07-01-contacts-live-store.md` |
| 中文镜像 | `knowledge/docs/zh/app-plan-contacts-live-store.zh.md` |
| 分类 | `implementation-plan` |
| 状态 | `historical` |
| 新鲜度 | `likely-current` |
| 负责人域 | `contacts` |

## 怎么读

这页主要提供历史背景。不要把它当成当前实现说明，当前行为应回到相关代码路径、主题知识页和更新后的设计文档确认。

已登记来源和关联代码，但后续改动仍需要重新核对。

下方“结构化阅读入口”按原文标题列出阅读顺序。

## 中文摘要

将 Contacts 列表/搜索/筛选能力从 hybrid 本地远端数据迁移到共享 orbit_records 表的 live 存储模式：保留 contract.ts 为 DTO 边界，新增 live 服务与读取 contacts/connections/evidence 的存储 provider，注册 live 模式并让 /api/contacts 路由异步化。验收含内存 live store 读到 66 个联系人及 live 模式无数据库配置时 fail-closed。

## 审计依据

这是一份 2026-07-01 的一次性实施计划，记录当时的迁移目标与验收标准；当前实际实现应以 features/contacts 下的 live 服务、存储 provider 与 service-factory 及其测试为准。

## 结构化阅读入口

- 第 1 节：目标 2: 联系人 Live Store
- 第 2 节：目标
- 第 3 节：源标题：Scope
- 第 4 节：验收

## 保留的代码与命令证据

源文档没有独立代码块；涉及的路径、命令和接口名保留在上方元信息中。


## 源文档正文

源文档正文主要不是中文。中文镜像不直接机翻全文，避免生成一份看似同步、实际难以审计的副本；阅读时先看本页摘要、审计依据、标题入口和代码证据。需要逐段核对时，请打开上方原始来源。
