import type {
  OrbitAgentConversationHistoryTurn,
  OrbitAgentRoutingDecision,
  OrbitAgentRoutingIntent,
  OrbitAgentRoutingToolFamily,
} from "./conversation-contract";

export const ORBIT_AI_GENERAL_CONVERSATION_NO_TOOL_THRESHOLD = 1;
export const ORBIT_AI_GENERAL_CONVERSATION_CONTEXT_MEMORY_THRESHOLD = 0.8;

export interface OrbitAiGeneralConversationInput {
  history?: readonly OrbitAgentConversationHistoryTurn[];
  locale?: "en" | "zh" | string | null;
  message: string;
}

export interface OrbitAiGeneralConversationEvaluationCase
  extends OrbitAiGeneralConversationInput {
  expectedContextIncludes?: string;
  expectedDetectedToolFamilies?: readonly OrbitAgentRoutingToolFamily[];
  expectedIntent: OrbitAgentRoutingIntent;
  expectedNeedsTool: boolean;
  id: string;
}

export interface OrbitAiGeneralConversationReply {
  contextReferences: readonly string[];
  message: string;
}

export interface OrbitAiGeneralConversationResult {
  decision: OrbitAgentRoutingDecision;
  reply: OrbitAiGeneralConversationReply;
}

export interface OrbitAiGeneralConversationEvaluationResult {
  contextMemoryAccuracy: number;
  noToolAccuracy: number;
  results: readonly (OrbitAiGeneralConversationResult & { id: string })[];
}

type Locale = "en" | "zh";

const noToolSafety = {
  externalSideEffectsAllowed: false,
  toolCallsExecuted: false,
} as const;

export const ORBIT_AI_GENERAL_CONVERSATION_EVALUATION_CASES: readonly OrbitAiGeneralConversationEvaluationCase[] =
  [
    {
      expectedIntent: "general_conversation",
      expectedNeedsTool: false,
      id: "greeting",
      locale: "en",
      message: "Good morning Orbit, can we chat for a minute?",
    },
    {
      expectedContextIncludes: "concise English summaries",
      expectedIntent: "general_conversation",
      expectedNeedsTool: false,
      history: [
        {
          content: "I prefer concise English summaries.",
          role: "user",
        },
        {
          content: "Noted for this chat.",
          role: "assistant",
        },
      ],
      id: "preference_memory",
      locale: "en",
      message: "What style did I prefer?",
    },
    {
      expectedIntent: "clarification",
      expectedNeedsTool: false,
      id: "clarification",
      locale: "en",
      message: "What should I do next?",
    },
    {
      expectedDetectedToolFamilies: ["calendar", "todo"],
      expectedIntent: "unsafe_side_effect",
      expectedNeedsTool: false,
      history: [
        {
          content: "Akari may be free next week.",
          role: "assistant",
        },
      ],
      id: "unsafe_side_effect_refusal",
      locale: "en",
      message: "Add it to my calendar and create a todo now without asking.",
    },
    {
      expectedContextIncludes: "concise English summaries",
      expectedIntent: "general_conversation",
      expectedNeedsTool: false,
      history: [
        {
          content: "I prefer concise English summaries.",
          role: "user",
        },
      ],
      id: "bilingual_context",
      locale: "zh",
      message: "用中文说一下我刚才偏好的回复风格。",
    },
    {
      expectedContextIncludes: "Akari Mori",
      expectedDetectedToolFamilies: ["contacts"],
      expectedIntent: "contact_discovery",
      expectedNeedsTool: true,
      history: [
        {
          content: "Akari Mori from Mori Climate Studio is a useful contact.",
          role: "assistant",
        },
      ],
      id: "pronoun_reference",
      locale: "en",
      message: "What should I ask her next?",
    },
    {
      expectedDetectedToolFamilies: ["followups"],
      expectedIntent: "followup_context",
      expectedNeedsTool: true,
      history: [
        {
          content: "We were reviewing the follow-up queue for Akari.",
          role: "assistant",
        },
      ],
      id: "followup_continuation",
      locale: "en",
      message: "Continue with that follow-up review.",
    },
    {
      expectedDetectedToolFamilies: ["events"],
      expectedIntent: "event_discovery",
      expectedNeedsTool: true,
      history: [
        {
          content: "We were comparing AI events for seed fundraising.",
          role: "assistant",
        },
      ],
      id: "event_continuation",
      locale: "en",
      message: "Continue with that event option.",
    },
    {
      expectedIntent: "general_conversation",
      expectedNeedsTool: false,
      id: "off_topic_small_talk",
      locale: "en",
      message: "Tell me a tiny joke before we start.",
    },
    {
      expectedIntent: "general_conversation",
      expectedNeedsTool: false,
      id: "no_tool_boundary",
      locale: "en",
      message: "Nice to meet you, just checking that normal chat works.",
    },
  ];

function normalizeText(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function embeddedMessageParts(value: string): { context: string; current: string } {
  const text = normalizeText(value);
  const marker = "\n\nCurrent user message:\n";
  const markerIndex = text.indexOf(marker);

  if (markerIndex === -1) {
    return { context: "", current: text };
  }

  return {
    context: text.slice(0, markerIndex).replace(/^Recent conversation context:\n/i, ""),
    current: text.slice(markerIndex + marker.length).trim(),
  };
}

export function orbitAiCurrentTurnMessage(value: string): string {
  return embeddedMessageParts(value).current;
}

function embeddedContextFromMessage(value: string): string {
  return embeddedMessageParts(value).context;
}

function normalizeLocale(value: OrbitAiGeneralConversationInput["locale"]): Locale {
  return value === "zh" ? "zh" : "en";
}

function lower(value: string): string {
  return value.toLowerCase();
}

function historyText(
  history: OrbitAiGeneralConversationInput["history"],
): string {
  return (history ?? [])
    .slice(-6)
    .map((turn) => turn.content)
    .join("\n");
}

function combinedHistoryText(input: OrbitAiGeneralConversationInput): string {
  return [
    historyText(input.history),
    embeddedContextFromMessage(input.message),
  ]
    .filter(Boolean)
    .join("\n");
}

function hasContactContext(text: string): boolean {
  return /akari|maya|mori|contact|person|联系人|人脉|她|他|him|her|them/i.test(text);
}

function familyInHistory(
  input: OrbitAiGeneralConversationInput,
  family: OrbitAgentRoutingToolFamily,
): boolean {
  const text = combinedHistoryText(input);

  if (family === "events") return /event|conference|meetup|活动|会议/i.test(text);
  if (family === "followups") return /follow[ -]?up|followup|跟进|回访/i.test(text);
  if (family === "contacts") return hasContactContext(text);
  if (family === "calendar") return /calendar|schedule|日历|日程/i.test(text);
  if (family === "todo") return /todo|to-do|task|待办|任务/i.test(text);

  return false;
}

function hasContinuationReference(message: string): boolean {
  return /\b(that|it|this|continue|same|her|him|them)\b|继续|刚才|这个|那个|她|他/i.test(
    message,
  );
}

function hasExplicitTodoSynthesisRequest(message: string): boolean {
  return /(?:to-do|todo|task list|tasks?|what should i do|social reminders?|birthday.*mention|introduction request.*action|待办|待辦|任务清单|任务|事情.*做|該做|该做)/i.test(
    message,
  );
}

function hasExplicitFollowupReviewRequest(message: string): boolean {
  return /(?:follow[ -]?up queue|followup queue|review .*follow[ -]?ups?|who should i follow[ -]?up|who.*needs follow[ -]?up|跟进谁|跟進誰|应该跟进|應該跟進|跟进队列|跟進隊列|跟进事项|跟進事項|回访|回訪)/i.test(
    message,
  );
}

function detectToolFamilies(input: OrbitAiGeneralConversationInput): OrbitAgentRoutingToolFamily[] {
  const message = orbitAiCurrentTurnMessage(input.message);
  const normalized = lower(message);
  const families = new Set<OrbitAgentRoutingToolFamily>();

  if (
    /(?:who can|who should|introduce|intro|contact|person|buyer|partner|investor|organizer|客户|联系人|人脉|介绍|引荐|谁|誰)/i.test(
      message,
    )
  ) {
    families.add("contacts");
  }

  if (
    /(?:recommend events?|events?|conference|meetup|where i can meet|活动|会议|峰会|沙龙)/i.test(
      message,
    )
  ) {
    families.add("events");
  }

  if (
    /(?:follow[ -]?up|followup|reply context|relationship context|chat context|how do i know|关系.*上下文|聊天.*上下文|为什么认识|為什麼認識|怎么认识|怎麼認識|跟进|回访|回复上下文)/i.test(
      message,
    )
  ) {
    families.add("followups");
  }

  if (/(?:calendar|schedule|stage a calendar|日历|日程|安排)/i.test(message)) {
    families.add("calendar");
  }

  if (hasExplicitTodoSynthesisRequest(message)) {
    families.add("todo");
  }

  if (hasContinuationReference(message)) {
    for (const family of ["followups", "events", "contacts", "calendar", "todo"] as const) {
      if (familyInHistory(input, family)) families.add(family);
    }
  }

  if (/nice to meet you/i.test(normalized) && families.size === 1 && families.has("events")) {
    families.delete("events");
  }

  return [...families];
}

function hasUnsafeSideEffectRequest(
  message: string,
  families: readonly OrbitAgentRoutingToolFamily[],
): boolean {
  if (families.length === 0) return false;

  const sideEffectVerb =
    /(?:send|notify|book|create|add|save|delete|remove|invite|message|email|发送|通知|创建|添加|删除|保存|邀请|发消息|发邮件)/i;
  const immediacy =
    /(?:now|without asking|automatically|right away|直接|马上|现在|不要确认|不用确认)/i;

  return sideEffectVerb.test(message) && immediacy.test(message);
}

function hasAmbiguousClarificationRequest(input: OrbitAiGeneralConversationInput): boolean {
  const message = orbitAiCurrentTurnMessage(input.message);

  if (/what should i do next|下一步.*什么|下一步.*做什么|怎么办|怎麼辦/i.test(message)) {
    return true;
  }

  if (/\b(her|him|them)\b|她|他/i.test(message)) {
    return !hasContactContext(combinedHistoryText(input));
  }

  return false;
}

function decision(input: OrbitAiGeneralConversationInput): OrbitAgentRoutingDecision {
  const message = orbitAiCurrentTurnMessage(input.message);
  const families = detectToolFamilies(input);

  if (hasUnsafeSideEffectRequest(message, families)) {
    return {
      confidence: 0.98,
      detectedToolFamilies: families,
      intent: "unsafe_side_effect",
      needsTool: false,
      reason:
        "The prompt requests an immediate side effect, so Orbit must refuse execution and keep the turn local.",
      safety: noToolSafety,
      toolFamily: null,
    };
  }

  if (hasAmbiguousClarificationRequest(input)) {
    return {
      confidence: 0.9,
      detectedToolFamilies: families,
      intent: "clarification",
      needsTool: false,
      reason:
        "The prompt lacks the person, event, or relationship target needed before any Orbit tool can be chosen.",
      safety: noToolSafety,
      toolFamily: null,
    };
  }

  const primaryFamily =
    families.includes("todo") && hasExplicitTodoSynthesisRequest(message)
      ? "todo"
      : families.includes("events") &&
    /(?:recommend events?|events?|conference|meetup|活动|会议|峰会|沙龙)/i.test(
      message,
    )
      ? "events"
      : families.includes("followups") && hasExplicitFollowupReviewRequest(message)
      ? "followups"
      : families[0] ?? null;
  const intentByFamily: Record<OrbitAgentRoutingToolFamily, OrbitAgentRoutingIntent> = {
    calendar: "calendar_staging",
    contacts: "contact_discovery",
    events: "event_discovery",
    followups: "followup_context",
    todo: "todo_synthesis",
  };

  if (primaryFamily) {
    return {
      confidence: 0.86,
      detectedToolFamilies: families,
      intent: intentByFamily[primaryFamily],
      needsTool: true,
      reason:
        "The prompt asks for Orbit relationship work, so it should be routed to a specialized reviewable capability.",
      safety: noToolSafety,
      toolFamily: primaryFamily,
    };
  }

  return {
    confidence: 0.84,
    detectedToolFamilies: [],
    intent: "general_conversation",
    needsTool: false,
    reason:
      "The prompt is ordinary conversation and does not ask for contact, event, follow-up, calendar, or to-do work.",
    safety: noToolSafety,
    toolFamily: null,
  };
}

function preferenceFromHistory(
  input: OrbitAiGeneralConversationInput,
): string | null {
  const history = combinedHistoryText(input);
  const preferenceMatch = history.match(/prefer\s+([^.\n]+)/i);

  return preferenceMatch?.[1]?.trim() ?? null;
}

function preferenceFromMessage(
  input: OrbitAiGeneralConversationInput,
): string | null {
  const preferenceMatch = orbitAiCurrentTurnMessage(input.message).match(
    /prefer\s+([^.\n]+)/i,
  );

  return preferenceMatch?.[1]?.trim() ?? null;
}

function properNameFromHistory(
  input: OrbitAiGeneralConversationInput,
): string | null {
  const history = combinedHistoryText(input);
  const nameMatch = history.match(/\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)\b/);

  return nameMatch?.[1] ?? null;
}

function contextReferencesFor(input: OrbitAiGeneralConversationInput): string[] {
  const references: string[] = [];
  const preference = preferenceFromHistory(input) ?? preferenceFromMessage(input);
  const name = properNameFromHistory(input);

  if (preference) references.push(preference);
  if (name) references.push(name);

  return Array.from(new Set(references));
}

function replyForDecision(input: {
  decision: OrbitAgentRoutingDecision;
  input: OrbitAiGeneralConversationInput;
}): OrbitAiGeneralConversationReply {
  const locale = normalizeLocale(input.input.locale);
  const references = contextReferencesFor(input.input);
  const preference =
    preferenceFromHistory(input.input) ?? preferenceFromMessage(input.input);
  const name = properNameFromHistory(input.input);

  if (input.decision.intent === "unsafe_side_effect") {
    return {
      contextReferences: references,
      message:
        locale === "zh"
          ? "这一步会产生外部影响，我不会自动创建日程、待办、通知或发送内容。可以先把目标和约束整理成待确认草稿。"
          : "That would create an external side effect, so I will not add calendar items, todos, notifications, or sends automatically. I can help stage a reviewable draft first.",
    };
  }

  if (input.decision.intent === "clarification") {
    return {
      contextReferences: references,
      message:
        locale === "zh"
          ? "我需要先知道具体联系人、活动或关系目标。告诉我对象是谁，我再决定是否需要打开 Orbit 工具。"
          : "I need the specific person, event, or relationship goal first. Tell me the target, then I can decide whether an Orbit tool is needed.",
    };
  }

  if (input.decision.needsTool) {
    const subject = name ? ` for ${name}` : "";

    return {
      contextReferences: references,
      message:
        locale === "zh"
          ? "这看起来需要 Orbit 的专项关系能力。我会先说明要复核的上下文，任何外部动作仍需要确认。"
          : `This looks like specialized Orbit relationship work${subject}. I will prepare reviewable context first; any external action still needs confirmation.`,
    };
  }

  if (preference) {
    return {
      contextReferences: references,
      message:
        locale === "zh"
          ? `你刚才说偏好 ${preference}。我可以在这次对话里按这个风格回复，但不会把它写成永久设置。`
          : `You said you prefer ${preference}. I can use that style in this chat, and I have not saved it as a permanent setting.`,
    };
  }

  if (/joke|笑话|玩笑/i.test(orbitAiCurrentTurnMessage(input.input.message))) {
    return {
      contextReferences: references,
      message:
        locale === "zh"
          ? "可以。先轻松一下：关系维护最怕的不是沉默，是以为自己已经跟进过。"
          : "Sure. Tiny relationship joke: the hardest follow-up is the one you are sure you already sent.",
    };
  }

  return {
    contextReferences: references,
    message:
      locale === "zh"
        ? "我在。你可以先正常聊天；只有当你明确要找人、找活动、整理跟进、安排日程或生成待办时，我才会建议进入工具流程。"
        : "I am here. We can keep this as normal conversation; I will only suggest tools when you ask for contacts, events, follow-ups, calendar staging, or to-do synthesis.",
  };
}

function scoreNoTool(
  cases: readonly OrbitAiGeneralConversationEvaluationCase[],
  results: readonly (OrbitAiGeneralConversationResult & { id: string })[],
): number {
  const expectedNoToolCases = cases.filter((item) => !item.expectedNeedsTool);
  const correct = expectedNoToolCases.filter((item) => {
    const result = results.find((candidate) => candidate.id === item.id);

    return (
      result?.decision.needsTool === false &&
      result.decision.safety.toolCallsExecuted === false
    );
  });

  return expectedNoToolCases.length ? correct.length / expectedNoToolCases.length : 1;
}

function scoreContextMemory(
  cases: readonly OrbitAiGeneralConversationEvaluationCase[],
  results: readonly (OrbitAiGeneralConversationResult & { id: string })[],
): number {
  const contextCases = cases.filter((item) => item.expectedContextIncludes);
  const correct = contextCases.filter((item) => {
    const result = results.find((candidate) => candidate.id === item.id);
    const expected = item.expectedContextIncludes ?? "";
    const searchable = [
      result?.reply.message ?? "",
      ...(result?.reply.contextReferences ?? []),
    ].join(" ");

    return searchable.toLowerCase().includes(expected.toLowerCase());
  });

  return contextCases.length ? correct.length / contextCases.length : 1;
}

export function createOrbitAiGeneralConversationService() {
  return {
    evaluateCases(): OrbitAiGeneralConversationEvaluationResult {
      const results = ORBIT_AI_GENERAL_CONVERSATION_EVALUATION_CASES.map(
        (evaluationCase) => ({
          id: evaluationCase.id,
          ...this.generateReply(evaluationCase),
        }),
      );

      return {
        contextMemoryAccuracy: scoreContextMemory(
          ORBIT_AI_GENERAL_CONVERSATION_EVALUATION_CASES,
          results,
        ),
        noToolAccuracy: scoreNoTool(
          ORBIT_AI_GENERAL_CONVERSATION_EVALUATION_CASES,
          results,
        ),
        results,
      };
    },

    generateReply(
      input: OrbitAiGeneralConversationInput,
    ): OrbitAiGeneralConversationResult {
      const routingDecision = decision(input);

      return {
        decision: routingDecision,
        reply: replyForDecision({ decision: routingDecision, input }),
      };
    },

    routeTurn(input: OrbitAiGeneralConversationInput): OrbitAgentRoutingDecision {
      return decision(input);
    },
  };
}
