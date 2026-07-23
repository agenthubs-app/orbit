# Orbit AI 普通对话路由评估

本页是 Orbit Wiki 的中文阅读版，也是中文阅读入口。它不是新的权威副本；权威内容仍以原始来源、关联代码和测试为准。

## 页面元信息

| 字段 | 内容 |
| --- | --- |
| 原始来源 | `repos/orbits/features/orbit-ai/GENERAL_CONVERSATION_EVALUATION.md` |
| 中文镜像 | `knowledge/docs/zh/orbit-ai-general-conversation-evaluation.zh.md` |
| 分类 | `evaluation` |
| 状态 | `current` |
| 新鲜度 | `likely-current` |
| 负责人域 | `orbit-ai` |

## 怎么读

这页是当前阅读入口。具体字段、函数签名和运行行为仍以原始来源、相关代码路径和测试为准。

已登记来源和关联代码，但后续改动仍需要重新核对。

下方“结构化阅读入口”按原文标题列出阅读顺序。

## 中文摘要

Sprint 88 普通对话路由层的评估文档：mock/SSR 预览路径用确定性 general-conversation-service 判断是否需要工具，live 路径则完全交给模型 planner 做意图路由（general_chat 直接自由回复，其它 intent 受 schema 和工具 allowlist 约束），routingDecisionFromPlannerIntent 保持统一展示契约。接受阈值为 no-tool 正确率 100%、上下文记忆正确率 80%。

## 审计依据

这是评估文档且已随架构演进更新（明确 live 路径不再消费规则判断）；读者应注意 mock 与 live 的路由机制不同，实际行为以 general-conversation-service.ts、live-agent-runtime.ts 及评估测试为准。

## 结构化阅读入口

- 第 1 节：源标题：Orbit AI General Conversation Evaluation
- 第 2 节：目标
- 第 3 节：设计 Evaluation Analysis 循环
- 第 4 节：产品 Trust Cue
- 第 5 节：验收 Threshold
- 第 6 节：Mock Live Replacement 记录

## 保留的代码与命令证据

源文档没有独立代码块；涉及的路径、命令和接口名保留在上方元信息中。


## 源文档正文

## 目标

Sprint 88 为 Orbit AI 增加一个可检查的普通对话路由层。它先判断当前 turn 是否真的需要联系人、活动、跟进、日程或待办能力；如果只是问候、偏好记忆、澄清、双语上下文、代词引用里的普通追问或闲聊，就生成普通 assistant 回复，不调用 provider、领域工具或外部动作。

## Design-Evaluation-Analysis Loop

1. Design: `general-conversation-service.ts` 暴露 `routeTurn()` 和 `generateReply()`，返回 `routingDecision`。它现在是 **mock / SSR 预览路径**（`mock-conversation-service.ts`、`conversation-preview-service.ts`）的确定性、无 provider 路由层。**Live 路径（`live-agent-runtime.ts`）不再消费这个规则判断：意图路由完全交给模型 planner（`gemini-provider.ts`），`general_chat` 直接返回模型自由回复，其它 intent 由 planner schema + 校验器 allowlist 约束到白名单工具。** `routingDecisionFromPlannerIntent()` 只把模型 intent 翻译成同一个 `routingDecision` 展示契约，供前端 no-tool 标记和 dev trace 使用。
2. Evaluation: `ORBIT_AI_GENERAL_CONVERSATION_EVALUATION_CASES` 固定十个命名案例：greeting、preference_memory、clarification、unsafe_side_effect_refusal、bilingual_context、pronoun_reference、followup_continuation、event_continuation、off_topic_small_talk、no_tool_boundary。
3. Analysis: `evaluateCases()` 计算 no-tool correctness 与 context-memory correctness。失败时先看 `routingDecision.detectedToolFamilies` 和 `reply.contextReferences`，再调整规则或补案例。

## Product Trust Cue

`/app/agent` 的输入框在用户提交敏感关系上下文前显示 no-tool 边界：普通聊天不会执行外部动作，发送、日程、待办和人脉改动仍需用户确认。这个提示只说明已验证的本地/无工具安全边界，不承诺不会经过服务端对话 API。

## Acceptance Threshold

- No-tool correctness: 100%。所有普通对话、安全拒绝和澄清案例都必须保持 `needsTool=false`，并且 `safety.toolCallsExecuted=false`。
- Context-memory correctness: 80%。带近期上下文的案例必须在回复或 `contextReferences` 中保留关键偏好或人物引用。

## Mock-To-Live Replacement Notes

- Current deterministic boundary: `features/orbit-ai/general-conversation-service.ts`（现仅用于 mock / SSR 预览路径与本评估用例）。
- Live provider files: live 路径已通过 `live-agent-runtime.ts` + `gemini-provider.ts` 接入模型；意图分类与普通对话回复都由模型产出，`routingDecisionFromPlannerIntent()` 保持同一个 `routingDecision` shape 供前端与 trace 使用。
- Switch from mock to live: live 路径下，`runLiveOrbitAgentRuntime` 先跑本地安全边界（隐私/密钥/危机/注入等规则，命中即本地短路，不调用模型），再无条件调用 planner。模型返回 `general_chat` 时给出自由回复；返回其它 intent 时仍受 planner schema 与 `validateGeminiOrbitAgentPlannerOutput` 的工具 allowlist 约束，工具不能由自由文本任意推断。缺 provider API key 时 fail closed，不回退到规则文案。
- Required env vars or permissions: none for the deterministic implementation. A future live generator would require the selected model provider API key already used by Orbit Agent, but must not require Gmail, calendar, contacts, notification, or write permissions.
- Privacy and provenance constraints: ordinary replies may use only recent in-chat turns provided by the caller. They must not read external accounts, write relationship state, send messages, create calendar events, create tasks, deliver notifications, or hide side effects.
- Replacement tests: keep `tests/capabilities/orbit-ai-general-conversation-evaluation.test.ts` green, add provider-specific no-tool cases before enabling a live generator, and keep `/app/agent` page tests verifying that no stale panel opens for ordinary replies.
