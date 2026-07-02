import {
  EVENT_GOAL_READINESS_ERROR_DEFINITIONS,
  type EventGoalAndReadinessService,
  type EventGoalFocus,
  type EventGoalReadinessErrorCode,
  type EventGoalReadinessFailure,
  type EventGoalReadinessInput,
  type EventGoalReadinessPayload,
  type EventGoalReadinessResult,
  type EventGoalRecord,
  type EventGoalSetInput,
  type EventGoalSetPayload,
  type EventGoalSetResult,
  type EventGoalSuggestion,
  type EventGoalSuggestionInput,
  type EventGoalSuggestionsPayload,
  type EventGoalSuggestionsResult,
} from "./contract";
import type { EventCapabilityRecordProvider } from "../storage/event-work-record-provider";

export interface LiveEventGoalAndReadinessServiceOptions {
  now?: () => string;
  provider?:
    | EventCapabilityRecordProvider<
        EventGoalReadinessPayload | EventGoalSetPayload
      >
    | null;
}

const supportedFocusValues = new Set<EventGoalFocus>([
  "operator_intros",
  "storage_pilot",
  "investor_context",
]);

function clonePayload<TPayload>(payload: TPayload): TPayload {
  return JSON.parse(JSON.stringify(payload)) as TPayload;
}

function normalizeEventId(eventId?: string | null): string {
  return eventId?.trim() ?? "";
}

function normalizeFocus(
  relationshipFocus?: EventGoalSuggestionInput["relationshipFocus"],
): EventGoalFocus | null {
  return relationshipFocus &&
    supportedFocusValues.has(relationshipFocus as EventGoalFocus)
    ? (relationshipFocus as EventGoalFocus)
    : null;
}

function failure(
  code: EventGoalReadinessErrorCode,
  input: {
    collectedAt: string;
    provider?: EventCapabilityRecordProvider<object> | null;
  },
): EventGoalReadinessFailure {
  const definition = EVENT_GOAL_READINESS_ERROR_DEFINITIONS[code];
  const evidenceIds = [`evidence:${code.toLowerCase()}`];

  return {
    success: false,
    error: {
      ...definition,
      state: "failure",
      provenance: {
        source: input.provider?.source ?? "live-store:goal-readiness:unconfigured",
        sourceLabel:
          input.provider?.sourceLabel ?? "Unconfigured goal readiness store",
        evidenceIds,
        collectedAt: input.collectedAt,
        privacy: "demo-event-goal-readiness-only",
        generationMethod: "live-store-query",
        aiProviderRequested: false,
        calendarProviderRequested: false,
        liveCalendarRequested: false,
        liveDatabaseWriteExecuted: false,
        externalNetworkRequested: false,
        emailProviderRequested: false,
        notificationDelivered: false,
      },
      evidenceIds,
    },
  };
}

function withLiveProvenance(
  payload: EventGoalReadinessPayload,
  input: {
    generationMethod: EventGoalReadinessPayload["provenance"]["generationMethod"];
    provider: EventCapabilityRecordProvider<object>;
    writeExecuted: boolean;
  },
): EventGoalReadinessPayload {
  return {
    ...payload,
    event: {
      ...payload.event,
      liveDatabaseWriteExecuted: input.writeExecuted,
    },
    goal: payload.goal
      ? {
          ...payload.goal,
          liveDatabaseWriteExecuted: input.writeExecuted,
        }
      : null,
    readinessChecklist: payload.readinessChecklist.map((item) => ({
      ...item,
      liveDatabaseWriteExecuted: input.writeExecuted,
    })),
    provenance: {
      ...payload.provenance,
      source: input.provider.source,
      sourceLabel: input.provider.sourceLabel,
      generationMethod: input.generationMethod,
      liveDatabaseWriteExecuted: input.writeExecuted,
    },
  };
}

function suggestionsFor(
  payload: EventGoalReadinessPayload,
  relationshipFocus?: EventGoalSuggestionInput["relationshipFocus"],
): readonly EventGoalSuggestion[] {
  const focus = normalizeFocus(relationshipFocus);

  return focus
    ? payload.suggestedGoals.filter((goal) => goal.focus === focus)
    : payload.suggestedGoals;
}

function suggestionsPayload(
  payload: EventGoalReadinessPayload,
  suggestions: readonly EventGoalSuggestion[],
  provider: EventCapabilityRecordProvider<object>,
): EventGoalSuggestionsPayload {
  return {
    state: suggestions.length > 0 ? "success" : "empty",
    event: payload.event,
    suggestedGoals: suggestions,
    summary:
      suggestions.length > 0
        ? "Live storage returned event goal suggestions."
        : "No live storage goal suggestions matched this focus.",
    provenance: {
      ...payload.provenance,
      source: provider.source,
      sourceLabel: provider.sourceLabel,
      evidenceIds:
        suggestions.length > 0
          ? suggestions.flatMap((goal) => goal.evidenceIds)
          : payload.provenance.evidenceIds,
      generationMethod: "live-store-query",
      liveDatabaseWriteExecuted: false,
    },
    nextAction:
      suggestions.length > 0
        ? "Choose a live storage goal or enter a concise event goal."
        : "Set a manual event goal before composing readiness.",
  };
}

function nextGoalRecord(input: {
  existingGoal: EventGoalRecord | null;
  goalText: string;
  now: string;
  payload: EventGoalReadinessPayload;
  selectedSuggestion: EventGoalSuggestion | null;
}): EventGoalRecord {
  const fallbackSuggestion = input.payload.suggestedGoals[0] ?? null;
  const selectedSuggestion = input.selectedSuggestion ?? fallbackSuggestion;

  return {
    ...(input.existingGoal ?? {
      goalId: `goal:live:${input.payload.event.id}`,
      eventId: input.payload.event.id,
      priority: "primary" as const,
      source: input.payload.event.source,
      evidenceIds:
        selectedSuggestion?.evidenceIds ?? input.payload.provenance.evidenceIds,
      createdAt: input.now,
      generatedBy: "mock-goal-form" as const,
      aiProviderRequested: false,
      liveDatabaseWriteExecuted: true,
      externalNetworkRequested: false,
    }),
    intent: input.goalText,
    selectedSuggestionId: selectedSuggestion?.goalId ?? null,
    updatedAt: input.now,
    liveDatabaseWriteExecuted: true,
  };
}

export function createLiveEventGoalAndReadinessService({
  now = () => new Date().toISOString(),
  provider,
}: LiveEventGoalAndReadinessServiceOptions = {}): EventGoalAndReadinessService {
  async function loadReadiness(
    input: EventGoalReadinessInput,
  ): Promise<EventGoalReadinessPayload | EventGoalReadinessFailure["error"]> {
    const collectedAt = now();
    const eventId = normalizeEventId(input.eventId);

    if (!eventId) {
      return failure("EVENT_GOAL_READINESS_EVENT_ID_REQUIRED", {
        collectedAt,
        provider,
      }).error;
    }

    if (!provider) {
      return failure("EVENT_GOAL_READINESS_LIVE_STORE_UNCONFIGURED", {
        collectedAt,
        provider,
      }).error;
    }

    const payload = await provider.getPayload(eventId);

    if (!payload) {
      return failure("EVENT_GOAL_READINESS_EVENT_NOT_FOUND", {
        collectedAt,
        provider,
      }).error;
    }

    return withLiveProvenance(payload, {
      generationMethod: "live-store-query",
      provider,
      writeExecuted: false,
    });
  }

  function toFailure(
    error: EventGoalReadinessFailure["error"],
  ): EventGoalReadinessFailure {
    return {
      success: false,
      error,
    };
  }

  return {
    async suggestGoals(input = {}): Promise<EventGoalSuggestionsResult> {
      const payload = await loadReadiness(input);

      if ("code" in payload) {
        return toFailure(payload);
      }

      if (!provider) {
        return failure("EVENT_GOAL_READINESS_LIVE_STORE_UNCONFIGURED", {
          collectedAt: now(),
          provider,
        });
      }

      return {
        success: true,
        data: suggestionsPayload(
          payload,
          suggestionsFor(payload, input.relationshipFocus),
          provider,
        ),
      };
    },
    async setGoal(input = {}): Promise<EventGoalSetResult> {
      const goalText = input.goalText?.trim();

      if (!goalText) {
        return failure("EVENT_GOAL_READINESS_GOAL_REQUIRED", {
          collectedAt: now(),
          provider,
        });
      }

      const payload = await loadReadiness(input);

      if ("code" in payload) {
        return toFailure(payload);
      }

      if (!provider) {
        return failure("EVENT_GOAL_READINESS_LIVE_STORE_UNCONFIGURED", {
          collectedAt: now(),
          provider,
        });
      }

      const selectedSuggestion =
        payload.suggestedGoals.find(
          (suggestion) => suggestion.goalId === input.selectedSuggestionId,
        ) ?? null;
      const goal = nextGoalRecord({
        existingGoal: payload.goal,
        goalText,
        now: now(),
        payload,
        selectedSuggestion,
      });
      const updatedPayload = withLiveProvenance(
        {
          ...payload,
          state: "success",
          goal,
          summary: "Live storage updated the event goal and readiness state.",
          nextAction:
            "Review the live storage readiness checklist before the event.",
        },
        {
          generationMethod: "live-store-goal-setting",
          provider,
          writeExecuted: true,
        },
      );
      const data: EventGoalSetPayload = {
        ...updatedPayload,
        state: "success",
        goal,
        acceptedGoalText: goalText,
      };

      await provider.upsertPayload(data.event.id, data, {
        evidenceIds: data.provenance.evidenceIds,
      });

      return {
        success: true,
        data: clonePayload(data),
      };
    },
    async getReadiness(input = {}): Promise<EventGoalReadinessResult> {
      const payload = await loadReadiness(input);

      if ("code" in payload) {
        return toFailure(payload);
      }

      return {
        success: true,
        data: clonePayload(payload),
      };
    },
  };
}
