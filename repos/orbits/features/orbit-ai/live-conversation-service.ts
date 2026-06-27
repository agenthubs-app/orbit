import {
  type OrbitAgentArtifactKind,
  type OrbitAgentArtifactPayload,
  type OrbitAgentArtifactTaskRequest,
} from "./artifact-contract";
import {
  ORBIT_AGENT_CONVERSATION_ERROR_DEFINITIONS,
  type OrbitAgentConversationErrorCode,
  type OrbitAgentConversationFailure,
  type OrbitAgentConversationInput,
  type OrbitAgentConversationMessage,
  type OrbitAgentConversationPayload,
  type OrbitAgentConversationProvenance,
  type OrbitAgentConversationResult,
  type OrbitAgentConversationScenario,
  type OrbitAgentConversationService,
  type OrbitAgentConversationSummary,
  type OrbitAgentProposedToolIntent,
  type OrbitAgentSafetyLedger,
  type OrbitAgentSendMessageInput,
} from "./conversation-contract";
import {
  createGeminiOrbitAgentPlanner,
  type GeminiOrbitAgentIntent,
  type GeminiOrbitAgentPlannerResult,
  type GeminiOrbitAgentProviderConfig,
  type GeminiOrbitAgentToolName,
  type GeminiOrbitAgentToolRequest,
} from "./gemini-provider";
import { createMockOrbitAgentArtifactTaskService } from "./mock-artifact-task-service";

const liveCollectedAt = "2026-06-27T00:00:00.000Z";
const liveConversationId = "live-orbit-agent-conversation";

const supportedScenarios = new Set<OrbitAgentConversationScenario>([
  "success",
  "empty",
  "pending",
  "failure",
]);

function safetyLedger(input: {
  aiProviderRequested: boolean;
  domainToolCallsExecuted?: boolean;
  externalNetworkRequested: boolean;
}): OrbitAgentSafetyLedger {
  return {
    aiProviderRequested: input.aiProviderRequested,
    calendarProviderRequested: false,
    domainToolCallsExecuted: input.domainToolCallsExecuted ?? false,
    emailProviderRequested: false,
    externalNetworkRequested: input.externalNetworkRequested,
    externalSideEffectsExecuted: false,
    liveDatabaseReadExecuted: false,
    liveDatabaseWriteExecuted: false,
    notificationDelivered: false,
  };
}

function provenance(input: {
  generationMethod: OrbitAgentConversationProvenance["generationMethod"];
  label: string;
  safety: OrbitAgentSafetyLedger;
}): OrbitAgentConversationProvenance {
  return {
    collectedAt: liveCollectedAt,
    evidenceIds: ["evidence:orbit-agent:gemini-live-provider"],
    generationMethod: input.generationMethod,
    privacy: "demo-orbit-agent-conversation-only",
    safety: input.safety,
    source: "provider:gemini-interactions-api",
    sourceLabel: input.label,
  };
}

function normalizeScenario(
  scenario?: OrbitAgentConversationInput["scenario"],
): OrbitAgentConversationScenario {
  if (
    scenario &&
    supportedScenarios.has(scenario as OrbitAgentConversationScenario)
  ) {
    return scenario as OrbitAgentConversationScenario;
  }

  return "success";
}

function readText(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function failure(
  code: OrbitAgentConversationErrorCode,
  safety: OrbitAgentSafetyLedger,
  message?: string,
): OrbitAgentConversationFailure {
  const definition = ORBIT_AGENT_CONVERSATION_ERROR_DEFINITIONS[code];

  return {
    error: {
      ...definition,
      evidenceIds: ["evidence:orbit-agent:gemini-live-failure"],
      message: message ?? definition.message,
      provenance: provenance({
        generationMethod: "gemini-live-agent-state",
        label: "Gemini Orbit Agent live provider failure",
        safety,
      }),
      state: "failure",
    },
    success: false,
  };
}

function success(payload: OrbitAgentConversationPayload): OrbitAgentConversationResult {
  return {
    data: JSON.parse(JSON.stringify(payload)) as OrbitAgentConversationPayload,
    success: true,
  };
}

function conversationSummary(
  message: OrbitAgentConversationMessage | null,
): OrbitAgentConversationSummary {
  return {
    conversationId: liveConversationId,
    evidenceIds: ["evidence:orbit-agent:gemini-live-provider"],
    lastMessagePreview:
      message?.content ??
      "Gemini-backed Orbit Agent is ready for a natural-language request.",
    title: "Gemini Orbit Agent conversation",
    updatedAt: message?.createdAt ?? liveCollectedAt,
  };
}

function statePayload(input: {
  assistantMessage: string;
  safety: OrbitAgentSafetyLedger;
  state: "empty" | "pending" | "success";
}): OrbitAgentConversationPayload {
  const messages =
    input.state === "empty"
      ? []
      : [
          {
            content: input.assistantMessage,
            conversationId: liveConversationId,
            createdAt: liveCollectedAt,
            evidenceIds: ["evidence:orbit-agent:gemini-live-provider"],
            messageId: "orbit-agent-live-ready",
            role: "assistant" as const,
          },
        ];

  return {
    activeConversationId: input.state === "empty" ? null : liveConversationId,
    artifacts: [],
    assistantMessage: input.assistantMessage,
    conversations:
      input.state === "empty" ? [] : [conversationSummary(messages[0] ?? null)],
    messages,
    nextAction:
      "Send a natural-language prompt; Orbit will ask Gemini to plan before any internal tool is considered.",
    proposedToolIntents: [],
    provenance: provenance({
      generationMethod: "gemini-live-agent-state",
      label: "Gemini Orbit Agent live provider state",
      safety: input.safety,
    }),
    state: input.state,
  };
}

function scenarioResult(
  scenario: OrbitAgentConversationScenario,
): OrbitAgentConversationResult | null {
  const safe = safetyLedger({
    aiProviderRequested: false,
    externalNetworkRequested: false,
  });

  switch (scenario) {
    case "empty":
      return success(
        statePayload({
          assistantMessage:
            "Gemini-backed Orbit Agent has no active local conversation yet.",
          safety: safe,
          state: "empty",
        }),
      );
    case "pending":
      return success(
        statePayload({
          assistantMessage:
            "Gemini-backed Orbit Agent is waiting behind a local guard.",
          safety: safe,
          state: "pending",
        }),
      );
    case "failure":
      return failure("ORBIT_AGENT_GEMINI_REQUEST_FAILED", safe);
    case "success":
    default:
      return null;
  }
}

function toolNameForIntent(
  intent: GeminiOrbitAgentIntent,
): GeminiOrbitAgentToolName | null {
  if (intent === "event_recommendations") {
    return "events.recommend";
  }

  if (intent === "contact_recommendations") {
    return "contacts.recommend";
  }

  if (intent === "followup_queue") {
    return "followups.reviewQueue";
  }

  if (intent === "relationship_chat_context") {
    return "chat.context";
  }

  return null;
}

function artifactKindForTool(
  toolName: GeminiOrbitAgentToolName,
): OrbitAgentArtifactKind {
  const kinds: Record<GeminiOrbitAgentToolName, OrbitAgentArtifactKind> = {
    "chat.context": "relationship_chat_context",
    "contacts.recommend": "contact_recommendations",
    "events.recommend": "event_recommendations",
    "followups.reviewQueue": "followup_queue",
  };

  return kinds[toolName];
}

function proposedIntentForTool(
  request: GeminiOrbitAgentToolRequest,
): OrbitAgentProposedToolIntent {
  const labels: Record<GeminiOrbitAgentToolName, string> = {
    "chat.context": "Review relationship conversation context",
    "contacts.recommend": "Recommend relevant contacts",
    "events.recommend": "Inspect event context",
    "followups.reviewQueue": "Review follow-up queue",
  };

  return {
    intentId: `intent:gemini:${request.toolName}`,
    label: labels[request.toolName],
    reason:
      "Gemini selected this allowed Orbit tool from the user prompt; execution remains inside Orbit and requires confirmation before side effects.",
    requiresUserConfirmation: true,
    toolFamily:
      request.toolName === "chat.context"
        ? "relationship_chat"
        : request.toolName.startsWith("events.")
          ? "events"
          : request.toolName.startsWith("contacts.")
            ? "contacts"
            : "followups",
  };
}

function artifactForRequest(input: {
  message: string;
  request: GeminiOrbitAgentToolRequest;
}): OrbitAgentArtifactPayload | null {
  const artifactService = createMockOrbitAgentArtifactTaskService();
  const request: OrbitAgentArtifactTaskRequest = {
    conversationId: liveConversationId,
    kind: artifactKindForTool(input.request.toolName),
    presentation: {
      preferredSurface: "side_panel",
      title: proposedIntentForTool(input.request).label,
      widthHint: "half",
    },
    query: input.message,
  };
  const result = artifactService.createArtifactTask(request);

  return result.success ? result.data : null;
}

function failureForPlannerResult(
  plannerResult: Extract<GeminiOrbitAgentPlannerResult, { success: false }>,
): OrbitAgentConversationResult {
  const safety = safetyLedger({
    aiProviderRequested: plannerResult.error.code !== "GEMINI_API_KEY_MISSING",
    externalNetworkRequested: plannerResult.error.code !== "GEMINI_API_KEY_MISSING",
  });

  if (plannerResult.error.code === "GEMINI_API_KEY_MISSING") {
    return failure(
      "ORBIT_AGENT_GEMINI_API_KEY_MISSING",
      safety,
      plannerResult.error.message,
    );
  }

  if (plannerResult.error.code === "GEMINI_SCHEMA_INVALID") {
    return failure(
      "ORBIT_AGENT_GEMINI_SCHEMA_INVALID",
      safety,
      plannerResult.error.message,
    );
  }

  return failure(
    "ORBIT_AGENT_GEMINI_REQUEST_FAILED",
    safety,
    plannerResult.error.message,
  );
}

function userMessage(content: string): OrbitAgentConversationMessage {
  return {
    content,
    conversationId: liveConversationId,
    createdAt: "2026-06-27T00:01:00.000Z",
    evidenceIds: ["evidence:orbit-agent:gemini-user-message"],
    messageId: "orbit-agent-gemini-user-latest",
    role: "user",
  };
}

function assistantMessage(content: string): OrbitAgentConversationMessage {
  return {
    content,
    conversationId: liveConversationId,
    createdAt: "2026-06-27T00:01:01.000Z",
    evidenceIds: ["evidence:orbit-agent:gemini-assistant-reply"],
    messageId: "orbit-agent-gemini-assistant-latest",
    role: "assistant",
  };
}

export function createLiveOrbitAgentConversationService(
  config: GeminiOrbitAgentProviderConfig = {},
): OrbitAgentConversationService {
  const planner = createGeminiOrbitAgentPlanner(config);

  return {
    getConversation(input): OrbitAgentConversationResult {
      const scenario = scenarioResult(normalizeScenario(input.scenario));

      if (scenario) {
        return scenario;
      }

      if (readText(input.conversationId) !== liveConversationId) {
        return failure(
          "ORBIT_AGENT_CONVERSATION_NOT_FOUND",
          safetyLedger({
            aiProviderRequested: false,
            externalNetworkRequested: false,
          }),
        );
      }

      return success(
        statePayload({
          assistantMessage:
            "Gemini-backed Orbit Agent is ready for a natural-language request.",
          safety: safetyLedger({
            aiProviderRequested: false,
            externalNetworkRequested: false,
          }),
          state: "success",
        }),
      );
    },

    listConversations(input = {}): OrbitAgentConversationResult {
      const scenario = scenarioResult(normalizeScenario(input.scenario));

      if (scenario) {
        return scenario;
      }

      return success(
        statePayload({
          assistantMessage:
            "Gemini-backed Orbit Agent is ready for a natural-language request.",
          safety: safetyLedger({
            aiProviderRequested: false,
            externalNetworkRequested: false,
          }),
          state: "success",
        }),
      );
    },

    async sendMessage(input: OrbitAgentSendMessageInput) {
      const scenario = scenarioResult(normalizeScenario(input.scenario));

      if (scenario) {
        return scenario;
      }

      const message = readText(input.message);

      if (!message) {
        return failure(
          "ORBIT_AGENT_MESSAGE_REQUIRED",
          safetyLedger({
            aiProviderRequested: false,
            externalNetworkRequested: false,
          }),
        );
      }

      const plannerResult = await planner.plan({
        locale: input.locale,
        message,
      });

      if (plannerResult.success === false) {
        return failureForPlannerResult(plannerResult);
      }

      const fallbackToolName = toolNameForIntent(plannerResult.data.intent);
      const toolRequests =
        plannerResult.data.toolRequests.length > 0
          ? plannerResult.data.toolRequests
          : fallbackToolName
            ? [
                {
                  arguments: {},
                  requiresUserConfirmation: true as const,
                  toolName: fallbackToolName,
                },
              ]
            : [];
      const artifacts = toolRequests
        .map((request) => artifactForRequest({ message, request }))
        .filter((artifact): artifact is OrbitAgentArtifactPayload =>
          Boolean(artifact),
        );
      const messages = [
        userMessage(message),
        assistantMessage(plannerResult.data.assistantMessage),
      ];
      const safety = safetyLedger({
        aiProviderRequested: true,
        domainToolCallsExecuted: toolRequests.length > 0,
        externalNetworkRequested: true,
      });

      return success({
        activeConversationId: liveConversationId,
        artifacts,
        assistantMessage: plannerResult.data.assistantMessage,
        conversations: [conversationSummary(messages[messages.length - 1])],
        messages,
        nextAction:
          "Review the Gemini-planned Orbit result; confirm before any external action or record write.",
        proposedToolIntents: toolRequests.map(proposedIntentForTool),
        provenance: provenance({
          generationMethod: "gemini-live-agent-reply",
          label: `Gemini Orbit Agent live reply via ${plannerResult.data.model}`,
          safety,
        }),
        state: "success",
      });
    },
  };
}
