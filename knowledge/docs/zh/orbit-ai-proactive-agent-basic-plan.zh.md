# Orbit AI 主动代理基础版实施计划

本页是 Orbit Wiki 的中文阅读版，也是中文阅读入口。它不是新的权威副本；权威内容仍以原始来源、关联代码和测试为准。

## 页面元信息

| 字段 | 内容 |
| --- | --- |
| 原始来源 | `docs/superpowers/plans/2026-07-01-orbit-ai-proactive-agent-basic.md` |
| 中文镜像 | `knowledge/docs/zh/orbit-ai-proactive-agent-basic-plan.zh.md` |
| 分类 | `implementation-plan` |
| 状态 | `historical` |
| 新鲜度 | `likely-current` |
| 负责人域 | `orbit-ai` |

## 怎么读

这页主要提供历史背景。不要把它当成当前实现说明，当前行为应回到相关代码路径、主题知识页和更新后的设计文档确认。

已登记来源和关联代码，但后续改动仍需要重新核对。

下方“结构化阅读入口”按原文标题列出阅读顺序。

## 中文摘要

以 mock-first 方式在 features/orbit-ai 下新增独立的 orbit-ai-proactive-agent 能力：把结构化信号（AgentSignal）转成投递到 Orbit AI 聊天窗口的主动助手消息（deliverySurface: orbit_ai_chat），Notifications 仅作为未来投递管道而非内容生产方。计划刻意绕开高影响的 createOrbitAgentConversationService，全部任务复选框已勾选完成。

## 审计依据

这是一份已执行完毕的一次性 TDD 实施计划（所有步骤标记为 [x]），属于历史材料；代码中已出现超出本计划范围的 live-proactive-service.ts 与 PROACTIVE_AGENT_LIVE_IMPLEMENTATION.md，说明主动代理能力已继续演进。当前行为应以 repos/orbits/features/orbit-ai 下的合约与服务代码及其 DESIGN.md 为准，本计划仅供追溯边界决策（主动内容归 Orbit AI 聊天、通知只做投递）。

## 结构化阅读入口

- 第 1 节：Orbit AI Proactive Agent Basic 实现 计划
- 第 2 节：源标题：Global Constraints
- 第 3 节：任务 1: Proactive Agent 契约 和 服务
- 第 4 节：任务 2: 设计 Documentation
- 第 5 节：任务 3: Factory 和 边界 Coverage
- 第 6 节：任务 4: 验证

## 保留的代码与命令证据

源文档没有独立代码块；涉及的路径、命令和接口名保留在上方元信息中。


## 源文档正文

源文档正文主要不是中文。中文镜像不直接机翻全文，避免生成一份看似同步、实际难以审计的副本；阅读时先看本页摘要、审计依据、标题入口和代码证据。需要逐段核对时，请打开上方原始来源。
