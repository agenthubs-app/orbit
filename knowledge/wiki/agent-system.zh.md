# Orbit Agent 系统

Orbit Agent 由两个相关但不同的层组成：产品内的 Orbit AI / Agent 功能，以及根 harness 的多 agent 生成流程。

## 产品内 Orbit AI

`features/orbit-ai` 是 AI command center 编排层。它把自然语言输入映射到联系人、活动、跟进、聊天上下文和 Agent action。它不拥有业务数据，必须通过各 feature service factory 调用能力。

## Agent Action

`features/agent` 拥有 action queue、autonomy settings 和 external action sandbox。Orbit AI 可以生成建议和 artifact，但不应绕过 agent 模块执行外部副作用。

## Bounded ReAct 方向

已提交的设计建议将 Orbit AI 演进为 bounded ReAct：工具注册集中在 `features/orbit-ai/agent-tools`，read/draft 工具可在预算内自动执行，write/external 工具必须生成确认请求。

## 安全边界

- 不执行任意 shell 命令。
- 不让模型定义工具。
- 不直接写数据库、日历、邮件或通知。
- 写入和外部动作必须经过 confirmation、sandbox preview 和 audit。

## 主要来源

- `repos/orbits/docs/architecture/modules/orbit-ai.md`
- `repos/orbits/docs/architecture/modules/agent.md`
- `docs/superpowers/specs/2026-06-30-orbit-bounded-react-tool-registry-design.md`
- `repos/orbits/features/orbit-ai/agent-tools/registry.ts`
