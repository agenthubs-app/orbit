# Orbit Agent 系统

Orbit Agent 由两个相关但不同的层组成：产品内的 Orbit AI / Agent 功能，以及根 harness 的多 agent 生成流程。本页只做阅读导航；具体字段和执行顺序以代码、contract 和测试为准。

## 产品内 Orbit AI

`features/orbit-ai` 是产品内的对话式编排层。它把自然语言输入映射到联系人、活动、跟进、聊天上下文、dashboard 和 Agent action。

当前代码把 Orbit AI 分成三个 capability：

- `orbit-ai-command`：旧 command center，负责输入到功能面板的路由。
- `orbit-agent-conversation`：chat agent conversation，live 模式走 provider planner、内部 tool/artifact mapping 和可选 synthesis。
- `orbit-agent-artifact-task`：生成 review-only artifact，例如活动推荐、人脉推荐、跟进队列和关系聊天上下文。

这三类能力都通过 `features/orbit-ai/service-factory.ts` 暴露。页面、API route 和 dev tool 不应直接依赖 mock 或 live provider 实现。

## 当前执行链

产品 chat、full-chain trace 和 planner-only 诊断都应走同一个 `features/orbit-ai/live-agent-runtime.ts`：

1. 本地 guardrail。
2. provider planner。
3. 工具白名单和 artifact kind 映射。
4. artifact producer 生成可复核结果。
5. 可选 synthesis。
6. conversation payload 返回页面。

`/dev/orbit-ai/trace` 通过 `live-conversation-trace.ts` 把这条链路转成 debugger payload。`trace-contract.ts` 中的 `runtimeSnapshot` 应展示本次运行看到的 planner、tools、artifact producers、renderers 和 unknown renderer warnings。

## Agent Action

`features/agent` 拥有 action queue、autonomy settings 和 external action sandbox。Orbit AI 可以生成建议、tool intent 和 artifact，但不应绕过 agent 模块执行外部副作用。

## Bounded ReAct 方向

已提交的设计建议将 Orbit AI 演进为 bounded ReAct：工具注册集中在 `features/orbit-ai/agent-tools`，read/draft 工具可在预算内自动执行，write/external 工具必须生成确认请求。

这仍是受限工具系统，不是让模型自由定义工具。模型只能选择已注册、已通过 schema 和 safety gate 的工具。

## 安全边界

- 不执行任意 shell 命令。
- 不让模型定义工具。
- 不直接写数据库、日历、邮件或通知。
- artifact producer 只生成 review-only 视图。
- 写入和外部动作必须经过 confirmation、sandbox preview 和 audit。
- 缺少 live provider key 时必须 fail closed，不回退到 mock 假装成功。

## 主要来源

- `repos/orbits/docs/architecture/modules/orbit-ai.md`
- `repos/orbits/features/orbit-ai/DESIGN.md`
- `repos/orbits/docs/superpowers/specs/2026-06-29-orbit-ai-trace-debug-design.zh.md`
- `repos/orbits/docs/architecture/orbit-ai-agent-performance-check-2026-06-30.md`
- `repos/orbits/features/orbit-ai/service-factory.ts`
- `repos/orbits/features/orbit-ai/live-agent-runtime.ts`
- `repos/orbits/features/orbit-ai/trace-contract.ts`
- `repos/orbits/features/orbit-ai/agent-tools/registry.ts`
