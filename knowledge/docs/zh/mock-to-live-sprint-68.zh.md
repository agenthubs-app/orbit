# Sprint 68 Mock-to-Live 交接文档

本页是 Orbit Wiki 的中文阅读版，也是中文阅读入口。它不是新的权威副本；权威内容仍以原始来源、关联代码和测试为准。

## 页面元信息

| 字段 | 内容 |
| --- | --- |
| 原始来源 | `repos/orbits/docs/mock-to-live/verify-that-the-capability-first-framework-can-run-the-mvp-loop-in-mock-mode-wit/LIVE_IMPLEMENTATION.md` |
| 中文镜像 | `knowledge/docs/zh/mock-to-live-sprint-68.zh.md` |
| 分类 | `implementation-handoff` |
| 状态 | `current` |
| 新鲜度 | `likely-current` |
| 负责人域 | `architecture` |

## 怎么读

这页是当前阅读入口。具体字段、函数签名和运行行为仍以原始来源、相关代码路径和测试为准。

已登记来源和关联代码，但后续改动仍需要重新核对。

下方“结构化阅读入口”按原文标题列出阅读顺序。

## 中文摘要

记录 capability-first framework mock mode 到 live implementation 的替换要求。

## 审计依据

已核对 capability registry、service factory tests 和 mock-to-live handoff tests 仍覆盖该框架；该文档作为 Sprint 68 交接证据保留。

## 结构化阅读入口

- 第 1 节：源标题：Sprint 68 Mock Live Handoff
- 第 2 节：Live 服务 Provider Files
- 第 3 节：源标题：Switch Mechanism
- 第 4 节：Required Env Vars Or 权限
- 第 5 节：源标题：Privacy Provenance Constraints
- 第 6 节：Replacement 测试
- 第 7 节：源标题：Sprint 68 Evidence Mapping

## 保留的代码与命令证据

源文档没有独立代码块；涉及的路径、命令和接口名保留在上方元信息中。


## 源文档正文

源文档正文主要不是中文。中文镜像不直接机翻全文，避免生成一份看似同步、实际难以审计的副本；阅读时先看本页摘要、审计依据、标题入口和代码证据。需要逐段核对时，请打开上方原始来源。
