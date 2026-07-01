import {
  ORBIT_AI_PROACTIVE_AGENT_ERROR_DEFINITIONS,
  ORBIT_AI_PROACTIVE_AGENT_SIGNAL_TYPES,
  type OrbitAiProactiveAgentChatMessage,
  type OrbitAiProactiveAgentErrorCode,
  type OrbitAiProactiveAgentFailure,
  type OrbitAiProactiveAgentInput,
  type OrbitAiProactiveAgentPayload,
  type OrbitAiProactiveAgentProvenance,
  type OrbitAiProactiveAgentResult,
  type OrbitAiProactiveAgentService,
  type OrbitAiProactiveAgentSignal,
  type OrbitAiProactiveAgentSignalType,
  type OrbitAiProactiveAgentSuggestedAction,
} from "./proactive-contract";

export const ORBIT_AI_PROACTIVE_AGENT_FIXTURE_SOURCE =
  "fixture:features/orbit-ai/mock-proactive-service.ts" as const;

const fixtureCollectedAt = "2026-07-01T00:00:00.000Z";
const defaultConversationId = "demo-orbit-ai-proactive-conversation";

const supportedSignalTypes = new Set<string>(
  ORBIT_AI_PROACTIVE_AGENT_SIGNAL_TYPES,
);

const safetyLedger = {
  aiProviderRequested: false,
  calendarProviderRequested: false,
  emailProviderRequested: false,
  externalNetworkRequested: false,
  externalSideEffectsExecuted: false,
  liveDatabaseReadExecuted: false,
  liveDatabaseWriteExecuted: false,
  notificationDelivered: false,
  pushProviderRequested: false,
} as const;

const fixtureProvenance: OrbitAiProactiveAgentProvenance = {
  collectedAt: fixtureCollectedAt,
  evidenceIds: ["evidence:orbit-ai-proactive:fixture"],
  generationMethod: "fixture",
  privacy: "demo-orbit-ai-proactive-agent-only",
  safety: safetyLedger,
  source: ORBIT_AI_PROACTIVE_AGENT_FIXTURE_SOURCE,
  sourceLabel: "Orbit AI proactive agent fixture",
};

const defaultSignal: Required<
  Pick<OrbitAiProactiveAgentSignal, "signalId" | "type">
> &
  OrbitAiProactiveAgentSignal = {
  body: "Sarah wants to discuss climate fintech partnerships.",
  evidenceIds: ["evidence:calendar:sarah-breakfast"],
  occursAt: "2026-07-02T10:00:00.000Z",
  severity: "high",
  signalId: "signal:calendar:sarah-breakfast",
  sourceModule: "calendar",
  sourceRef: {
    id: "calendar-event:sarah-breakfast",
    label: "Breakfast with Sarah",
    type: "calendar_event",
  },
  title: "Breakfast with Sarah tomorrow",
  type: "calendar_event_upcoming",
};

function readText(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function normalizeSignal(
  signal: OrbitAiProactiveAgentSignal | null | undefined,
): (Required<Pick<OrbitAiProactiveAgentSignal, "signalId" | "type">> &
  OrbitAiProactiveAgentSignal) | null {
  if (!signal) return null;

  const signalId = readText(signal.signalId);
  const type = readText(signal.type);

  if (!signalId || !type) return null;

  return {
    ...signal,
    signalId,
    type,
  };
}

function failure(
  code: OrbitAiProactiveAgentErrorCode,
  evidenceIds: readonly string[] = ["evidence:orbit-ai-proactive:failure"],
): OrbitAiProactiveAgentFailure {
  const definition = ORBIT_AI_PROACTIVE_AGENT_ERROR_DEFINITIONS[code];

  return {
    success: false,
    error: {
      ...definition,
      evidenceIds,
      provenance: {
        ...fixtureProvenance,
        evidenceIds,
        generationMethod: "rule-based-proactive-state",
        sourceLabel: "Controlled Orbit AI proactive agent failure",
      },
      state: "failure",
    },
  };
}

function actionSetFor(
  signalType: OrbitAiProactiveAgentSignalType | string,
): readonly OrbitAiProactiveAgentSuggestedAction[] {
  if (signalType === "followup_due") {
    return [
      {
        actionId: "action:review-followup",
        label: "Review follow-up context",
        requiresConfirmation: true,
        targetSurface: "followups",
      },
      {
        actionId: "action:draft-message",
        label: "Draft a message",
        requiresConfirmation: true,
        targetSurface: "messages",
      },
      {
        actionId: "action:snooze-in-chat",
        label: "Snooze in Orbit AI",
        requiresConfirmation: true,
        targetSurface: "orbit_ai_chat",
      },
    ];
  }

  return [
    {
      actionId: "action:open-source-context",
      label: "Open source context",
      requiresConfirmation: true,
      targetSurface: "events",
    },
    {
      actionId: "action:prepare-relationship-context",
      label: "Prepare relationship context",
      requiresConfirmation: true,
      targetSurface: "contacts",
    },
    {
      actionId: "action:draft-followup-message",
      label: "Draft follow-up message",
      requiresConfirmation: true,
      targetSurface: "messages",
    },
  ];
}

function proactiveCopyFor(
  signal: Required<Pick<OrbitAiProactiveAgentSignal, "signalId" | "type">> &
    OrbitAiProactiveAgentSignal,
): string {
  const title = readText(signal.title) ?? "这个关系提醒";
  const body = readText(signal.body) ?? "我找到了一个需要你关注的关系信号。";

  switch (signal.type) {
    case "calendar_event_upcoming":
      return `你明天 10:00 要见 Sarah。我把它放在 Orbit AI 里提醒你，是因为这次会面和关系经营有关：${body} 建议你先准备关系上下文，再决定是否起草后续消息。`;
    case "calendar_event_changed":
      return `你的日历有变化：${title}。这可能影响你和对方的沟通节奏，我建议先检查关系上下文，再决定是否发送更新消息。`;
    case "followup_due":
      return `你有一个跟进事项到期：${title}。我建议先复核来源证据，再决定是否生成一条给对方的消息草稿。`;
    case "relationship_opportunity":
      return `我发现一个关系机会：${title}。这是根据现有关系证据生成的主动提醒，不会自动联系任何人。`;
    case "system_status":
    default:
      return `Orbit 需要你注意一个状态：${title}。${body} 我会把它保留在 Orbit AI 对话中，方便你继续追问。`;
  }
}

function messageFor(
  signal: Required<Pick<OrbitAiProactiveAgentSignal, "signalId" | "type">> &
    OrbitAiProactiveAgentSignal,
): OrbitAiProactiveAgentChatMessage {
  const evidenceIds =
    signal.evidenceIds && signal.evidenceIds.length > 0
      ? signal.evidenceIds
      : [`evidence:orbit-ai-proactive:${signal.signalId}`];

  return {
    content: proactiveCopyFor(signal),
    conversationId: defaultConversationId,
    createdAt: fixtureCollectedAt,
    deliverySurface: "orbit_ai_chat",
    evidenceIds,
    messageId: `proactive-message:${signal.signalId}`,
    role: "assistant",
    sourceSignalId: signal.signalId,
    turnKind: "proactive",
  };
}

function payloadFor(
  signal: Required<Pick<OrbitAiProactiveAgentSignal, "signalId" | "type">> &
    OrbitAiProactiveAgentSignal,
): OrbitAiProactiveAgentPayload {
  const message = messageFor(signal);

  return {
    message,
    nextAction:
      "Review this proactive assistant message inside the Orbit AI chat window before confirming any suggested action.",
    provenance: {
      ...fixtureProvenance,
      evidenceIds: message.evidenceIds,
      generationMethod: "rule-based-proactive-turn",
      sourceLabel: "Orbit AI proactive agent local rule",
    },
    signal,
    suggestedActions: actionSetFor(signal.type),
  };
}

function success(
  payload: OrbitAiProactiveAgentPayload,
): OrbitAiProactiveAgentResult {
  return {
    data: JSON.parse(JSON.stringify(payload)) as OrbitAiProactiveAgentPayload,
    success: true,
  };
}

function scenarioResult(input: OrbitAiProactiveAgentInput): OrbitAiProactiveAgentResult | null {
  if (input.scenario === "failure") {
    return failure("ORBIT_AI_PROACTIVE_AGENT_MOCK_FAILED");
  }

  return null;
}

export function createMockOrbitAiProactiveAgentService(): OrbitAiProactiveAgentService {
  return {
    createProactiveTurn(input = {}): OrbitAiProactiveAgentResult {
      const scenario = scenarioResult(input);

      if (scenario) {
        return scenario;
      }

      const signal =
        input.signal === undefined
          ? null
          : normalizeSignal(input.signal);

      if (!input.signal) {
        return failure("ORBIT_AI_PROACTIVE_AGENT_SIGNAL_REQUIRED");
      }

      if (!signal) {
        return failure("ORBIT_AI_PROACTIVE_AGENT_SIGNAL_ID_REQUIRED");
      }

      if (!supportedSignalTypes.has(signal.type)) {
        return failure("ORBIT_AI_PROACTIVE_AGENT_UNSUPPORTED_SIGNAL_TYPE");
      }

      return success(payloadFor(signal));
    },
  };
}

export function createFixtureOrbitAiProactiveAgentService(): OrbitAiProactiveAgentService {
  return {
    createProactiveTurn(): OrbitAiProactiveAgentResult {
      return success(payloadFor(defaultSignal));
    },
  };
}
