# Events Live Store 首版设计（event-crud-import）

本页是 Orbit Wiki 的中文阅读版，也是中文阅读入口。它不是新的权威副本；权威内容仍以原始来源、关联代码和测试为准。

## 页面元信息

| 字段 | 内容 |
| --- | --- |
| 原始来源 | `repos/orbits/docs/superpowers/specs/2026-07-01-events-live-store-design.md` |
| 中文镜像 | `knowledge/docs/zh/events-live-store-design.zh.md` |
| 分类 | `sprint-spec` |
| 状态 | `historical` |
| 新鲜度 | `likely-current` |
| 负责人域 | `events` |

## 怎么读

这页主要提供历史背景。不要把它当成当前实现说明，当前行为应回到相关代码路径、主题知识页和更新后的设计文档确认。

已登记来源和关联代码，但后续改动仍需要重新核对。

下方“结构化阅读入口”按原文标题列出阅读顺序。

## 中文摘要

为 event-crud-import 单个能力设计首个 live 模式：注册显式 live 构造器、缺配置时以 EVENTS_LIVE_STORE_UNCONFIGURED 受控失败、契约的数据库执行标志放宽为 boolean 且 live 写入成功后才置 true；明确排除日历/OAuth/后台同步等 Calendar Provider Import 范畴。

## 审计依据

一次性设计规格，对应实现已落地（roadmap 记录 event-crud-import live 已完成）；当前行为以 repos/orbits/features/events/event-crud-and-import/live-service.ts 与 tests/capabilities/event-crud-and-import-live-store.test.ts 为准，长期边界见 ADR-0001。

## 结构化阅读入口

- 第 1 节：活动 Live Store 设计
- 第 2 节：目标
- 第 3 节：源标题：Scope
- 第 4 节：Domain 边界
- 第 5 节：运行时 Behavior
- 第 6 节：契约 变更
- 第 7 节：源标题：Files
- 第 8 节：源标题：Testing
- 第 9 节：源标题：Later Work

## 保留的代码与命令证据

源文档没有独立代码块；涉及的路径、命令和接口名保留在上方元信息中。


## 源文档正文

源文档正文主要不是中文。中文镜像不直接机翻全文，避免生成一份看似同步、实际难以审计的副本；阅读时先看本页摘要、审计依据、标题入口和代码证据。需要逐段核对时，请打开上方原始来源。
