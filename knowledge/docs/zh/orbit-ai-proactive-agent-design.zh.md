# Orbit AI 主动 Agent 设计

本页是 Orbit Wiki 的中文阅读版，也是中文阅读入口。它不是新的权威副本；权威内容仍以原始来源、关联代码和测试为准。

## 页面元信息

| 字段 | 内容 |
| --- | --- |
| 原始来源 | `repos/orbits/docs/superpowers/specs/2026-07-01-orbit-ai-proactive-agent-design.md` |
| 中文镜像 | `knowledge/docs/zh/orbit-ai-proactive-agent-design.zh.md` |
| 分类 | `sprint-spec` |
| 状态 | `current` |
| 新鲜度 | `likely-current` |
| 负责人域 | `orbit-ai` |

## 怎么读

这页是当前阅读入口。具体字段、函数签名和运行行为仍以原始来源、相关代码路径和测试为准。

已登记来源和关联代码，但后续改动仍需要重新核对。

下方“结构化阅读入口”按原文标题列出阅读顺序。

## 中文摘要

定义 Orbit AI 作为唯一用户侧助理收件箱：feature 信号（AgentSignal）经 proactive agent 转成 Orbit AI 聊天窗内的主动助理回合（ProactiveAgentMessage，deliverySurface=orbit_ai_chat）；Orbit AI 拥有主动解释与文案，Chat 拥有人际沟通，Notifications 只管投递机制；首版 mock-first、不触发任何外部副作用。

## 审计依据

定义 Orbit AI/Chat/Notifications 归属边界的设计文档，边界仍是权威；具体 proactive 行为以 repos/orbits/features/orbit-ai/proactive-contract.ts 与 app/api/ai/proactive-turns/route.ts 的代码及测试为准。

## 结构化阅读入口

- 第 1 节：Orbit AI Proactive Agent 设计
- 第 2 节：目标
- 第 3 节：产品 边界
- 第 4 节：数据 链路
- 第 5 节：源标题：Domain Objects
- 第 6 节：源标题：Initial Signal Types
- 第 7 节：运行时 规则
- 第 8 节：实现 Scope

## 保留的代码与命令证据

### 代码证据 1

```text
Events / Calendar / Contacts / Followups / System
  -> AgentSignal
  -> Orbit AI Proactive Agent
  -> ProactiveAgentMessage
  -> Orbit AI chat conversation
  -> optional notification delivery pointer
```

## 源文档正文

源文档正文主要不是中文。中文镜像不直接机翻全文，避免生成一份看似同步、实际难以审计的副本；阅读时先看本页摘要、审计依据、标题入口和代码证据。需要逐段核对时，请打开上方原始来源。
