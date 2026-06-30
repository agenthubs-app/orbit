# Bounded ReAct 工具注册设计

本页是 Orbit Wiki 的中文阅读版，也是中文阅读入口。它不是新的权威副本；权威内容仍以原始来源、关联代码和测试为准。

## 页面元信息

| 字段 | 内容 |
| --- | --- |
| 原始来源 | `docs/superpowers/specs/2026-06-30-orbit-bounded-react-tool-registry-design.md` |
| 中文镜像 | `knowledge/docs/zh/bounded-react-tool-registry.zh.md` |
| 分类 | `sprint-spec` |
| 状态 | `current` |
| 新鲜度 | `likely-current` |
| 负责人域 | `orbit-ai` |

## 怎么读

这页是当前阅读入口。具体字段、函数签名和运行行为仍以原始来源、相关代码路径和测试为准。

已登记来源和关联代码，但后续改动仍需要重新核对。

下方“结构化阅读入口”按原文标题列出阅读顺序。

## 中文摘要

设计 Orbit AI bounded ReAct runtime、工具 registry、policy gate、确认边界和工具风险等级。

## 审计依据

已登记关联代码路径：repos/orbits/features/orbit-ai/agent-tools/registry.ts。

## 结构化阅读入口

- 第 1 节：Orbit Bounded ReAct Tool Registry 设计
- 第 2 节：摘要
- 第 3 节：当前 Problem
- 第 4 节：设计 目标
- 第 5 节：Non 目标
- 第 6 节：Ownership 边界
- 第 7 节：源标题：Tool Model
- 第 8 节：源标题：Risk Levels
- 第 9 节：运行时 链路
- 第 10 节：Provider 契约
- 第 11 节：Confirmation 路径
- 第 12 节：关系 Existing Agent 模块
- 第 13 节：源标题：File Placement
- 第 14 节：Initial 实现 Slice
- 第 15 节：错误 处理
- 第 16 节：Testing 策略
- 第 17 节：验收 标准

## 保留的代码与命令证据

### 代码证据 1

```text
features/orbit-ai/
  agent-runtime/
    react-loop.ts
    policy-gate.ts
    run-trace.ts
  agent-tools/
    registry.ts
    contacts-tool-adapters.ts
    events-tool-adapters.ts
    followups-tool-adapters.ts
    chat-tool-adapters.ts
    agent-action-tool-adapters.ts
    calendar-tool-adapters.ts
```

### 代码证据 2

```ts
interface OrbitAgentTool<TInput, TOutput> {
  name: string;
  description: string;
  inputSchema: unknown;
  outputSchema: unknown;
  riskLevel: "read" | "draft" | "write" | "external";
  requiresConfirmation: boolean;
  allowedModes: readonly ("mock" | "hybrid" | "live")[];
  timeoutMs: number;
  execute: (input: TInput, context: OrbitAgentToolContext) => Promise<TOutput>;
  redactObservation: (output: TOutput) => unknown;
  audit: OrbitAgentToolAuditPolicy;
}
```

### 代码证据 3

```text
1. Normalize user message.
2. Run existing local safety boundaries.
3. Build allowed tool list from registry and policy.
4. Ask provider for the next step:
   - final answer
   - tool call with schema-valid input
   - clarification request
5. Policy gate checks the requested tool.
6. Execute read/draft tool or create confirmation request for write/external tool.
7. Redact and store observation.
8. Repeat until final answer, confirmation request, failure, or loop budget reached.
9. Return messages, artifacts, proposed tool intents, run trace, provenance, and safety ledger.
```

### 代码证据 4

```text
User: Add lunch with Maya next Wednesday.

ReAct:
  read contacts.search
  read calendar.listAvailability
  draft calendar.createEventDraft
  draft message.createDraft
  stop with confirmation request

User confirms:
  execute through calendar/action sandbox service
  write audit record
```

### 代码证据 5

```text
agent.actionQueue.list
agent.actionQueue.createProposal
agent.externalAction.preview
```

### 代码证据 6

```text
Find why I know Maya, check whether next Wednesday is a reasonable time,
and prepare a lunch invite.
```

## 源文档正文

源文档正文主要不是中文。中文镜像不直接机翻全文，避免生成一份看似同步、实际难以审计的副本；阅读时先看本页摘要、审计依据、标题入口和代码证据。需要逐段核对时，请打开上方原始来源。
