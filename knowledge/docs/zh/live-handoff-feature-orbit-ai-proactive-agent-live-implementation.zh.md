# orbit-ai 能力 Live 交接：proactive agent

本页是 Orbit Wiki 的中文阅读版，也是中文阅读入口。它不是新的权威副本；权威内容仍以原始来源、关联代码和测试为准。

## 页面元信息

| 字段 | 内容 |
| --- | --- |
| 原始来源 | `repos/orbits/features/orbit-ai/PROACTIVE_AGENT_LIVE_IMPLEMENTATION.md` |
| 中文镜像 | `knowledge/docs/zh/live-handoff-feature-orbit-ai-proactive-agent-live-implementation.zh.md` |
| 分类 | `implementation-handoff` |
| 状态 | `generated-evidence` |
| 新鲜度 | `likely-current` |
| 负责人域 | `feature:orbit-ai` |

## 怎么读

这页是当前阅读入口。具体字段、函数签名和运行行为仍以原始来源、相关代码路径和测试为准。

已登记来源和关联代码，但后续改动仍需要重新核对。

下方“结构化阅读入口”按原文标题列出阅读顺序。

## 中文摘要

记录 orbit-ai 模块 proactive agent 能力的 live 实现 边界：需要替换的服务、环境变量、权限约束和验证要求。

## 审计依据

已核对对应 feature 目录存在：repos/orbits/features/orbit-ai。具体切换行为以 service factory 与测试为准。

## 结构化阅读入口

- 第 1 节：Orbit AI Proactive Agent Live 实现
- 第 2 节：当前 本地 Delivery Semantics
- 第 3 节：后续 Live 服务 和 Provider Files
- 第 4 节：Provider Switch 和 Configuration
- 第 5 节：Privacy 和 Provenance Constraints
- 第 6 节：Replacement 测试

## 保留的代码与命令证据

源文档没有独立代码块；涉及的路径、命令和接口名保留在上方元信息中。


## 源文档正文

源文档正文主要不是中文。中文镜像不直接机翻全文，避免生成一份看似同步、实际难以审计的副本；阅读时先看本页摘要、审计依据、标题入口和代码证据。需要逐段核对时，请打开上方原始来源。
