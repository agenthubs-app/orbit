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

export interface LiveOrbitAiProactiveAgentServiceOptions {
  now?: () => string;
}

const liveSource = "live-policy:orbit-ai-proactive-agent" as const;
const defaultConversationId = "live-orbit-ai-proactive-conversation";
const supportedSignalTypes = new Set<string>(
  ORBIT_AI_PROACTIVE_AGENT_SIGNAL_TYPES,
);

function safetyLedger() {
  return {
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
}

function provenance(input: {
  collectedAt: string;
  evidenceIds: readonly string[];
  generationMethod: OrbitAiProactiveAgentProvenance["generationMethod"];
  sourceLabel: string;
}): OrbitAiProactiveAgentProvenance {
  return {
    collectedAt: input.collectedAt,
    evidenceIds: input.evidenceIds,
    generationMethod: input.generationMethod,
    privacy: "live-orbit-ai-proactive-agent-policy-only",
    safety: safetyLedger(),
    source: liveSource,
    sourceLabel: input.sourceLabel,
  };
}

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
  input: {
    collectedAt: string;
    evidenceIds?: readonly string[];
  },
): OrbitAiProactiveAgentFailure {
  const definition = ORBIT_AI_PROACTIVE_AGENT_ERROR_DEFINITIONS[code];
  const evidenceIds = input.evidenceIds ?? [`evidence:${code.toLowerCase()}`];

  return {
    success: false,
    error: {
      ...definition,
      evidenceIds,
      provenance: provenance({
        collectedAt: input.collectedAt,
        evidenceIds,
        generationMethod: "live-policy-proactive-state",
        sourceLabel: "Orbit AI proactive agent live policy failure",
      }),
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
        actionId: "action:keep-in-orbit-ai-chat",
        label: "Keep in Orbit AI chat",
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
  const title = readText(signal.title) ?? "A relationship signal needs review";
  const body =
    readText(signal.body) ??
    "I found a source-backed relationship signal that may need your attention.";

  switch (signal.type) {
    case "calendar_event_upcoming":
      return `You have an upcoming relationship event: ${title}. ${body} I kept this inside Orbit AI so you can review context before confirming any next action.`;
    case "calendar_event_changed":
      return `A calendar relationship signal changed: ${title}. ${body} Review source context before sending updates or changing plans.`;
    case "followup_due":
      return `A follow-up is due: ${title}. ${body} Review the source evidence in Orbit AI before confirming a draft or reminder.`;
    case "relationship_opportunity":
      return `I found a relationship opportunity: ${title}. ${body} No outreach has been sent.`;
    case "system_status":
    default:
      return `Orbit needs attention: ${title}. ${body} I kept this as a proactive Orbit AI chat turn.`;
  }
}

function messageFor(input: {
  collectedAt: string;
  signal: Required<Pick<OrbitAiProactiveAgentSignal, "signalId" | "type">> &
    OrbitAiProactiveAgentSignal;
}): OrbitAiProactiveAgentChatMessage {
  const evidenceIds =
    input.signal.evidenceIds && input.signal.evidenceIds.length > 0
      ? input.signal.evidenceIds
      : [`evidence:orbit-ai-proactive-live:${input.signal.signalId}`];

  return {
    content: proactiveCopyFor(input.signal),
    conversationId: defaultConversationId,
    createdAt: input.collectedAt,
    deliverySurface: "orbit_ai_chat",
    evidenceIds,
    messageId: `proactive-live-message:${input.signal.signalId}`,
    role: "assistant",
    sourceSignalId: input.signal.signalId,
    turnKind: "proactive",
  };
}

function payloadFor(input: {
  collectedAt: string;
  signal: Required<Pick<OrbitAiProactiveAgentSignal, "signalId" | "type">> &
    OrbitAiProactiveAgentSignal;
}): OrbitAiProactiveAgentPayload {
  const message = messageFor(input);

  return {
    message,
    nextAction:
      "Review this proactive assistant message inside the Orbit AI chat window before confirming any suggested action.",
    provenance: provenance({
      collectedAt: input.collectedAt,
      evidenceIds: message.evidenceIds,
      generationMethod: "live-policy-proactive-turn",
      sourceLabel: "Orbit AI proactive agent live policy",
    }),
    signal: input.signal,
    suggestedActions: actionSetFor(input.signal.type),
  };
}

function success(
  payload: OrbitAiProactiveAgentPayload,
): OrbitAiProactiveAgentResult {
  return {
    success: true,
    data: payload,
  };
}

export function createLiveOrbitAiProactiveAgentService({
  now = () => new Date().toISOString(),
}: LiveOrbitAiProactiveAgentServiceOptions = {}): OrbitAiProactiveAgentService {
  return {
    createProactiveTurn(input = {}): OrbitAiProactiveAgentResult {
      const collectedAt = now();

      if (input.scenario === "failure") {
        return failure("ORBIT_AI_PROACTIVE_AGENT_LIVE_POLICY_FAILED", {
          collectedAt,
        });
      }

      const signal =
        input.signal === undefined ? null : normalizeSignal(input.signal);

      if (!input.signal) {
        return failure("ORBIT_AI_PROACTIVE_AGENT_SIGNAL_REQUIRED", {
          collectedAt,
        });
      }

      if (!signal) {
        return failure("ORBIT_AI_PROACTIVE_AGENT_SIGNAL_ID_REQUIRED", {
          collectedAt,
        });
      }

      if (!supportedSignalTypes.has(signal.type)) {
        return failure("ORBIT_AI_PROACTIVE_AGENT_UNSUPPORTED_SIGNAL_TYPE", {
          collectedAt,
          evidenceIds: [`evidence:orbit-ai-proactive-live:${signal.signalId}`],
        });
      }

      return success(payloadFor({ collectedAt, signal }));
    },
  };
}
