# Orbit AI 面板本地化架构

本页是 Orbit Wiki 的中文阅读版，也是中文阅读入口。它不是新的权威副本；权威内容仍以原始来源、关联代码和测试为准。

## 页面元信息

| 字段 | 内容 |
| --- | --- |
| 原始来源 | `repos/orbits/features/orbit-ai/PANEL_LOCALIZATION.md` |
| 中文镜像 | `knowledge/docs/zh/orbit-ai-panel-localization.zh.md` |
| 分类 | `architecture` |
| 状态 | `current` |
| 新鲜度 | `likely-current` |
| 负责人域 | `orbit-ai` |

## 怎么读

这页是当前阅读入口。具体字段、函数签名和运行行为仍以原始来源、相关代码路径和测试为准。

已登记来源和关联代码，但后续改动仍需要重新核对。

下方“结构化阅读入口”按原文标题列出阅读顺序。

## 中文摘要

Sprint 92 把 Orbit AI 右侧结果面板的用户可见文案集中到 panel-localization.ts，按 panel/artifact/metadata/actions/confidence/calendar/proactive/conversation/recovery 九个命名空间组织；缺失翻译键时回退原文，技术溯源字段（id、路径、provider 名、时间戳等）刻意不翻译。React 页面经 /app/agent 本地适配器间接消费，避免 UI 直接 import feature 模块。

## 审计依据

这是现行架构约定文档：新增用户可见文案应加入对应命名空间而非页面本地修补；命名空间与回退行为以 features/orbit-ai/panel-localization.ts 实现为准。

## 结构化阅读入口

- 第 1 节：源标题：Orbit AI Panel Localization
- 第 2 节：源标题：Namespaces
- 第 3 节：源标题：Fallback Behavior

## 保留的代码与命令证据

源文档没有独立代码块；涉及的路径、命令和接口名保留在上方元信息中。


## 源文档正文

源文档正文主要不是中文。中文镜像不直接机翻全文，避免生成一份看似同步、实际难以审计的副本；阅读时先看本页摘要、审计依据、标题入口和代码证据。需要逐段核对时，请打开上方原始来源。
