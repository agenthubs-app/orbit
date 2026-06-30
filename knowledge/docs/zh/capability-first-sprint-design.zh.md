# Capability-first Sprint 设计

本页是 Orbit Wiki 的中文阅读版，也是中文阅读入口。它不是新的权威副本；权威内容仍以原始来源、关联代码和测试为准。

## 页面元信息

| 字段 | 内容 |
| --- | --- |
| 原始来源 | `docs/superpowers/specs/2026-06-24-capability-first-sprint-design.md` |
| 中文镜像 | `knowledge/docs/zh/capability-first-sprint-design.zh.md` |
| 分类 | `sprint-spec` |
| 状态 | `current` |
| 新鲜度 | `likely-current` |
| 负责人域 | `harness` |

## 怎么读

这页是当前阅读入口。具体字段、函数签名和运行行为仍以原始来源、相关代码路径和测试为准。

已登记来源和关联代码，但后续改动仍需要重新核对。

下方“结构化阅读入口”按原文标题列出阅读顺序。

## 中文摘要

解释为什么早期 Orbit sprint 以能力边界而不是页面组件为中心。

## 审计依据

已登记来源文档，后续变更通过 catalog 新鲜度状态追踪。

## 结构化阅读入口

- 第 1 节：能力 First Sprint 设计 for Orbit
- 第 2 节：为什么 Replaces The Component First 计划
- 第 3 节：Initial Real 实现
- 第 4 节：Initial Mock 边界
- 第 5 节：源标题：Sprint Waves
- 第 6 节：源标题：Wave 0: Runnable Framework
- 第 7 节：Wave 1: Account, Profile, 和 Consent
- 第 8 节：Wave 2: 联系人 获取 和 Sources
- 第 9 节：Wave 3: 联系人, Connections, 和 关系 上下文
- 第 10 节：Wave 4: 活动 Lifecycle 和 On Site 链路
- 第 11 节：Wave 5: 跟进, Messaging, 和 Chat
- 第 12 节：Wave 6: Analysis, Dashboard, Agent, 和 External Action 安全
- 第 13 节：Wave 7: 能力 集成 和 Bootstrap
- 第 14 节：Wave 8: App 路由 Composition
- 第 15 节：Wave 9: Mock MVP 验收

## 保留的代码与命令证据

源文档没有独立代码块；涉及的路径、命令和接口名保留在上方元信息中。


## 源文档正文

源文档正文主要不是中文。中文镜像不直接机翻全文，避免生成一份看似同步、实际难以审计的副本；阅读时先看本页摘要、审计依据、标题入口和代码证据。需要逐段核对时，请打开上方原始来源。
