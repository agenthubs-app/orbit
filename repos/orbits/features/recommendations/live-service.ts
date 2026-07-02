import {
  EVENT_RECOMMENDATION_ERROR_DEFINITIONS,
  type EventAttendeeRecommendation,
  type EventOpeningLineInput,
  type EventOpeningLinePayload,
  type EventOpeningLineResult,
  type EventOpeningLineStyle,
  type EventRecommendationAttendee,
  type EventRecommendationErrorCode,
  type EventRecommendationEvent,
  type EventRecommendationFailure,
  type EventRecommendationInput,
  type EventRecommendationMatchSignal,
  type EventRecommendationOpeningLine,
  type EventRecommendationProvenance,
  type EventRecommendationScenario,
  type EventRecommendationScoreBand,
  type EventRecommendationSourceReference,
  type EventRecommendationsPayload,
  type EventRecommendationsResult,
} from "./contract";
import type {
  ConnectionDTO,
  ContactDTO,
  EventDTO,
  EventParticipantIntentDTO,
  MatchRecommendationDTO,
  NetworkPersonDTO,
} from "../../shared/domain/contracts";
import type { EventRecommendationService } from "./service";
import type {
  LiveEventRecommendationAttendeeDTO,
  LiveEventRecommendationGraph,
} from "./storage/event-recommendation-live-record-provider";

type LiveEventRecommendationProviderResult<TResult> = Promise<TResult> | TResult;

export interface LiveEventRecommendationProvider {
  source: string;
  sourceLabel: string;
  readEventRecommendationGraph: (
    eventId: string,
  ) => LiveEventRecommendationProviderResult<LiveEventRecommendationGraph>;
}

export interface LiveEventRecommendationServiceOptions {
  provider?: LiveEventRecommendationProvider | null;
}

const defaultEventId = "event_01";

const supportedScenarios = new Set<EventRecommendationScenario>([
  "success",
  "empty",
  "pending",
  "failure",
]);

const supportedOpeningLineStyles = new Set<EventOpeningLineStyle>([
  "warm_context",
  "context_question",
  "post_event_follow_up",
]);

function clonePayload<TPayload>(payload: TPayload): TPayload {
  return JSON.parse(JSON.stringify(payload)) as TPayload;
}

function normalizeScenario(
  scenario?:
    | EventRecommendationInput["scenario"]
    | EventOpeningLineInput["scenario"],
): EventRecommendationScenario {
  if (
    scenario &&
    supportedScenarios.has(scenario as EventRecommendationScenario)
  ) {
    return scenario as EventRecommendationScenario;
  }

  return "success";
}

function normalizeEventId(eventId?: string | null): string {
  if (eventId === undefined) {
    return defaultEventId;
  }

  return eventId?.trim() ?? "";
}

function normalizedLimit(limit?: number | null): number | null {
  if (!Number.isFinite(limit ?? Number.NaN)) {
    return null;
  }

  return Math.max(0, Math.floor(limit as number));
}

function uniqueStrings(values: readonly string[]): string[] {
  return Array.from(new Set(values.filter((value) => value.trim().length > 0)));
}

function sourceForEvent(
  event: EventDTO,
  providerRecordId: string,
): EventRecommendationSourceReference {
  return {
    type: "event_import",
    id: event.source.id,
    label: event.source.label ?? "Live event recommendation source",
    eventId: event.id,
    providerRecordId,
    generatedBy: "live-store-query",
  };
}

function eventForRecommendation(event: EventDTO): EventRecommendationEvent {
  return {
    id: event.id,
    title: event.name,
    venue: event.location ?? "",
    startsAt: event.startsAt,
    endsAt: event.endsAt ?? event.startsAt,
    source: sourceForEvent(event, event.id),
    calendarProviderRequested: false,
    liveCalendarRequested: false,
    liveDatabaseWriteExecuted: false,
    externalNetworkRequested: false,
  };
}

function evidenceIdsFor(
  graph: LiveEventRecommendationGraph,
  recommendations: readonly MatchRecommendationDTO[] = graph.recommendations,
): readonly string[] {
  return uniqueStrings([
    ...(graph.event?.evidenceIds ?? []),
    ...recommendations.flatMap((recommendation) => recommendation.evidenceIds),
  ]);
}

function liveProvenance(input: {
  graph?: LiveEventRecommendationGraph | null;
  generationMethod: EventRecommendationProvenance["generationMethod"];
  provider?: LiveEventRecommendationProvider | null;
  source?: string;
  sourceLabel?: string;
  evidenceIds?: readonly string[];
  databaseQueryExecuted: boolean;
}): EventRecommendationProvenance {
  return {
    source:
      input.source ??
      input.provider?.source ??
      "live-record-store:event-recommendations:unconfigured",
    sourceLabel:
      input.sourceLabel ??
      input.provider?.sourceLabel ??
      "Unconfigured event recommendation live store",
    evidenceIds:
      input.evidenceIds ??
      (input.graph ? evidenceIdsFor(input.graph) : [
        "evidence:event-recommendation-live-store-unconfigured",
      ]),
    collectedAt: input.graph?.generatedAt ?? new Date(0).toISOString(),
    privacy: "live-event-recommendation-only",
    generationMethod: input.generationMethod,
    vectorSearchExecuted: false,
    embeddingsGenerated: false,
    rankingProviderRequested: false,
    databaseQueryExecuted: input.databaseQueryExecuted,
    databaseWriteExecuted: false,
    productionAuditLogWriteExecuted: false,
    externalNetworkRequested: false,
    deviceRequested: false,
    aiProviderRequested: false,
    calendarProviderRequested: false,
    emailProviderRequested: false,
    notificationDelivered: false,
  };
}

function failure(
  code: EventRecommendationErrorCode,
  provenance: EventRecommendationProvenance,
): EventRecommendationFailure {
  const definition = EVENT_RECOMMENDATION_ERROR_DEFINITIONS[code];

  return {
    success: false,
    error: {
      ...definition,
      state: "failure",
      provenance,
      evidenceIds: provenance.evidenceIds,
    },
  };
}

function scenarioFailure(
  scenario: EventRecommendationScenario,
  provenance: EventRecommendationProvenance,
): EventRecommendationFailure | null {
  if (scenario === "failure") {
    return failure("EVENT_RECOMMENDATION_MOCK_FAILED", provenance);
  }

  if (scenario === "pending") {
    return failure("EVENT_RECOMMENDATION_PENDING", provenance);
  }

  return null;
}

function scoreBand(score: number): EventRecommendationScoreBand {
  if (score >= 80) {
    return "high";
  }

  if (score >= 60) {
    return "medium";
  }

  return "low";
}

function firstSentence(text: string): string {
  return text.split(".")[0]?.trim() || text;
}

function primaryNeed(reason: string): string {
  const withoutPrefix = reason.replace(/^Need\/offer fit:\s*/i, "");
  const [need] = withoutPrefix.split("↔");

  return firstSentence(need ?? withoutPrefix);
}

function byId<TItem extends { id: string }>(
  records: readonly TItem[],
): ReadonlyMap<string, TItem> {
  return new Map(records.map((record) => [record.id, record]));
}

function contactsById(
  records: readonly ContactDTO[],
): ReadonlyMap<string, ContactDTO> {
  return byId(records);
}

function connectionsById(
  records: readonly ConnectionDTO[],
): ReadonlyMap<string, ConnectionDTO> {
  return byId(records);
}

function peopleById(
  records: readonly NetworkPersonDTO[],
): ReadonlyMap<string, NetworkPersonDTO> {
  return byId(records);
}

function attendeesById(
  records: readonly LiveEventRecommendationAttendeeDTO[],
): ReadonlyMap<string, LiveEventRecommendationAttendeeDTO> {
  return byId(records);
}

function intentsByAttendeeId(
  records: readonly EventParticipantIntentDTO[],
): ReadonlyMap<string, EventParticipantIntentDTO> {
  return new Map(records.map((intent) => [intent.attendeeId, intent]));
}

function fallbackAttendeeName(recommendation: MatchRecommendationDTO): string {
  return (
    recommendation.contactId ??
    recommendation.targetPersonId ??
    recommendation.attendeeId ??
    "Live recommendation target"
  );
}

function relationshipContext(input: {
  attendee: LiveEventRecommendationAttendeeDTO | undefined;
  connection: ConnectionDTO | undefined;
  contact: ContactDTO | undefined;
  person: NetworkPersonDTO | undefined;
  recommendation: MatchRecommendationDTO;
}): string {
  return (
    input.connection?.summary ??
    input.contact?.profileSnippet ??
    input.person?.profileSnippet ??
    input.attendee?.role ??
    input.recommendation.reason
  );
}

function eventIntent(
  recommendation: MatchRecommendationDTO,
  intent: EventParticipantIntentDTO | undefined,
): string {
  if (intent) {
    return [
      ...intent.lookingFor.map((item) => `Looking for ${item}`),
      ...intent.canOffer.map((item) => `Can offer ${item}`),
    ].join("; ");
  }

  return primaryNeed(recommendation.reason);
}

function attendeeForRecommendation(
  recommendation: MatchRecommendationDTO,
  graph: LiveEventRecommendationGraph,
): EventRecommendationAttendee {
  const attendees = attendeesById(graph.attendees);
  const contacts = contactsById(graph.contacts);
  const connections = connectionsById(graph.connections);
  const people = peopleById(graph.networkPeople);
  const intents = intentsByAttendeeId(graph.intents);
  const attendee = recommendation.attendeeId
    ? attendees.get(recommendation.attendeeId)
    : undefined;
  const contact = recommendation.contactId
    ? contacts.get(recommendation.contactId)
    : undefined;
  const connection = recommendation.connectionId
    ? connections.get(recommendation.connectionId)
    : undefined;
  const person = recommendation.targetPersonId
    ? people.get(recommendation.targetPersonId)
    : undefined;
  const intent = recommendation.attendeeId
    ? intents.get(recommendation.attendeeId)
    : undefined;
  const source = sourceForEvent(
    graph.event as EventDTO,
    recommendation.attendeeId ?? recommendation.id,
  );

  return {
    attendeeId: recommendation.attendeeId ?? recommendation.id,
    displayName:
      attendee?.displayName ??
      contact?.displayName ??
      person?.displayName ??
      fallbackAttendeeName(recommendation),
    role: attendee?.role ?? contact?.role ?? person?.role ?? "",
    organization:
      attendee?.organization ?? contact?.organization ?? person?.organization ?? "",
    relationshipContext: relationshipContext({
      attendee,
      connection,
      contact,
      person,
      recommendation,
    }),
    eventIntent: eventIntent(recommendation, intent),
    source,
    evidenceIds: attendee?.evidenceIds ?? recommendation.evidenceIds,
    externalProfileRequested: false,
    databaseQueryExecuted: true,
    aiProviderRequested: false,
    calendarProviderRequested: false,
    emailProviderRequested: false,
    notificationDelivered: false,
  };
}

function matchSignalsForRecommendation(
  recommendation: MatchRecommendationDTO,
  source: EventRecommendationSourceReference,
): readonly EventRecommendationMatchSignal[] {
  const topics =
    recommendation.sharedTopics.length > 0
      ? recommendation.sharedTopics
      : [recommendation.recommendationType.replace(/_/g, " ")];

  return topics.map((topic, index) => ({
    signalId: `${recommendation.id}:signal:${index + 1}`,
    label: topic,
    detail: recommendation.reason,
    weight: Math.max(0.1, Math.min(1, recommendation.businessRelevanceScore / 100)),
    evidenceIds: recommendation.evidenceIds,
    source,
    generatedBy: "live-match-signal-rule",
    vectorSearchExecuted: false,
    embeddingGenerated: false,
    rankingProviderRequested: false,
    aiProviderRequested: false,
    externalNetworkRequested: false,
    databaseQueryExecuted: true,
  }));
}

function openingLineText(
  recommendation: MatchRecommendationDTO,
  attendee: EventRecommendationAttendee,
  style: EventOpeningLineStyle,
): string {
  const need = primaryNeed(recommendation.reason);

  if (style === "context_question") {
    return `${attendee.displayName}, I saw this event match around ${need}. What would make a follow-up useful after the event?`;
  }

  if (style === "post_event_follow_up") {
    return `${attendee.displayName}, following up from the event, I wanted to keep the conversation grounded in ${need}.`;
  }

  return `${attendee.displayName}, your context around ${need} stood out. I would like to compare notes after this event.`;
}

function openingLineForRecommendation(
  recommendation: MatchRecommendationDTO,
  attendee: EventRecommendationAttendee,
  style: EventOpeningLineStyle,
): EventRecommendationOpeningLine {
  return {
    lineId: `${recommendation.id}:opening-line:${style}`,
    eventId: recommendation.eventId,
    attendeeId: attendee.attendeeId,
    style,
    text: openingLineText(recommendation, attendee, style),
    rationale:
      "This opening line is assembled from live store recommendation evidence without calling an AI provider.",
    source: attendee.source,
    evidenceIds: recommendation.evidenceIds,
    generatedBy: "live-opening-line-rule",
    aiProviderRequested: false,
    externalNetworkRequested: false,
    calendarProviderRequested: false,
    emailProviderRequested: false,
    notificationDelivered: false,
  };
}

function toRecommendation(input: {
  graph: LiveEventRecommendationGraph;
  rank: number;
  recommendation: MatchRecommendationDTO;
}): EventAttendeeRecommendation {
  const attendee = attendeeForRecommendation(input.recommendation, input.graph);
  const openingLine = openingLineForRecommendation(
    input.recommendation,
    attendee,
    "warm_context",
  );

  return {
    recommendationId: input.recommendation.id,
    eventId: input.recommendation.eventId,
    attendee,
    rank: input.rank,
    score: input.recommendation.score,
    scoreBand: scoreBand(input.recommendation.score),
    reasons: [input.recommendation.reason],
    matchSignals: matchSignalsForRecommendation(
      input.recommendation,
      attendee.source,
    ),
    openingLine,
    recommendedAction:
      input.recommendation.suggestedActions[0] ?? "Review source evidence",
    source: attendee.source,
    evidenceIds: input.recommendation.evidenceIds,
    generatedBy: "live-store-ranking",
    vectorSearchExecuted: false,
    embeddingGenerated: false,
    rankingProviderRequested: false,
    aiProviderRequested: false,
    databaseQueryExecuted: true,
    externalNetworkRequested: false,
    calendarProviderRequested: false,
    emailProviderRequested: false,
    notificationDelivered: false,
  };
}

function sortedRecommendations(
  recommendations: readonly MatchRecommendationDTO[],
): readonly MatchRecommendationDTO[] {
  return [...recommendations].sort((left, right) => {
    return (
      right.score - left.score ||
      left.createdAt.localeCompare(right.createdAt) ||
      left.id.localeCompare(right.id)
    );
  });
}

function recommendationsForLimit(
  graph: LiveEventRecommendationGraph,
  limit?: number | null,
): readonly EventAttendeeRecommendation[] {
  const resolvedLimit = normalizedLimit(limit);
  const sorted = sortedRecommendations(graph.recommendations);
  const limited = resolvedLimit === null ? sorted : sorted.slice(0, resolvedLimit);

  return limited.map((recommendation, index) =>
    toRecommendation({
      graph,
      rank: index + 1,
      recommendation,
    }),
  );
}

function recommendationsPayload(
  graph: LiveEventRecommendationGraph,
  provider: LiveEventRecommendationProvider,
  input: EventRecommendationInput,
): EventRecommendationsResult {
  if (!graph.event) {
    return failure(
      "EVENT_RECOMMENDATION_EVENT_NOT_FOUND",
      liveProvenance({
        graph,
        generationMethod: "live-store-ranking",
        provider,
        databaseQueryExecuted: true,
      }),
    );
  }

  const recommendations = recommendationsForLimit(graph, input.limit);
  const provenance = liveProvenance({
    graph,
    generationMethod: "live-store-ranking",
    provider,
    evidenceIds:
      recommendations.length > 0
        ? uniqueStrings(recommendations.flatMap((item) => item.evidenceIds))
        : evidenceIdsFor(graph),
    databaseQueryExecuted: true,
  });

  return {
    success: true,
    data: clonePayload({
      state: recommendations.length > 0 ? "success" : "empty",
      event: eventForRecommendation(graph.event),
      recommendations,
      summary:
        recommendations.length > 0
          ? "Live store ranking returned source-backed event recommendations without vector, model, or external network calls."
          : "No live store event recommendations are ready for this event.",
      provenance,
      nextAction:
        recommendations.length > 0
          ? "Review the top live recommendation before using its opening line."
          : "Review attendee evidence or generate recommendations before composing opening lines.",
    } satisfies EventRecommendationsPayload),
  };
}

function normalizeOpeningLineStyle(
  style: EventOpeningLineInput["style"],
): EventOpeningLineStyle {
  if (style && supportedOpeningLineStyles.has(style as EventOpeningLineStyle)) {
    return style as EventOpeningLineStyle;
  }

  return "warm_context";
}

function findOpeningLineRecommendation(
  graph: LiveEventRecommendationGraph,
  attendeeId?: string | null,
): MatchRecommendationDTO | null {
  const normalizedAttendeeId = attendeeId?.trim();
  const recommendations = sortedRecommendations(graph.recommendations);

  if (!normalizedAttendeeId) {
    return recommendations[0] ?? null;
  }

  return (
    recommendations.find(
      (recommendation) =>
        recommendation.attendeeId === normalizedAttendeeId ||
        recommendation.contactId === normalizedAttendeeId ||
        recommendation.targetPersonId === normalizedAttendeeId,
    ) ?? null
  );
}

function openingLinePayload(
  graph: LiveEventRecommendationGraph,
  provider: LiveEventRecommendationProvider,
  input: EventOpeningLineInput,
): EventOpeningLineResult {
  if (!graph.event) {
    return failure(
      "EVENT_RECOMMENDATION_EVENT_NOT_FOUND",
      liveProvenance({
        graph,
        generationMethod: "live-store-opening-line",
        provider,
        databaseQueryExecuted: true,
      }),
    );
  }

  const recommendation = findOpeningLineRecommendation(graph, input.attendeeId);

  if (!recommendation) {
    return failure(
      "EVENT_RECOMMENDATION_ATTENDEE_NOT_FOUND",
      liveProvenance({
        graph,
        generationMethod: "live-store-opening-line",
        provider,
        databaseQueryExecuted: true,
      }),
    );
  }

  const attendee = attendeeForRecommendation(recommendation, graph);
  const style = normalizeOpeningLineStyle(input.style);
  const openingLine = openingLineForRecommendation(recommendation, attendee, style);
  const mappedRecommendation = {
    ...toRecommendation({
      graph,
      rank:
        sortedRecommendations(graph.recommendations).findIndex(
          (item) => item.id === recommendation.id,
        ) + 1,
      recommendation,
    }),
    openingLine,
  };
  const alternatives = recommendationsForLimit(graph, 4)
    .filter((item) => item.recommendationId !== mappedRecommendation.recommendationId)
    .map((item) => item.openingLine);

  return {
    success: true,
    data: clonePayload({
      state: "success",
      event: eventForRecommendation(graph.event),
      recommendation: mappedRecommendation,
      openingLine,
      alternatives,
      summary:
        "The opening line is assembled from live recommendation evidence without sending a message.",
      provenance: liveProvenance({
        graph,
        generationMethod: "live-store-opening-line",
        provider,
        evidenceIds: openingLine.evidenceIds,
        databaseQueryExecuted: true,
      }),
      nextAction:
        "Review the line and keep evidence attached before any external message action.",
    } satisfies EventOpeningLinePayload),
  };
}

function unconfiguredFailure(): EventRecommendationFailure {
  return failure(
    "EVENT_RECOMMENDATION_LIVE_STORE_UNCONFIGURED",
    liveProvenance({
      generationMethod: "live-store-ranking",
      databaseQueryExecuted: false,
    }),
  );
}

export function createLiveEventRecommendationService({
  provider,
}: LiveEventRecommendationServiceOptions = {}): EventRecommendationService {
  return {
    async listEventRecommendations(input = {}): Promise<EventRecommendationsResult> {
      const scenario = normalizeScenario(input.scenario);
      const eventId = normalizeEventId(input.eventId);

      if (!eventId) {
        return failure(
          "EVENT_RECOMMENDATION_EVENT_ID_REQUIRED",
          liveProvenance({
            generationMethod: "live-store-ranking",
            provider,
            databaseQueryExecuted: false,
          }),
        );
      }

      if (!provider) {
        return unconfiguredFailure();
      }

      const graph = await provider.readEventRecommendationGraph(eventId);
      const scenarioFailureResult = scenarioFailure(
        scenario,
        liveProvenance({
          graph,
          generationMethod: "live-store-ranking",
          provider,
          databaseQueryExecuted: true,
        }),
      );

      if (scenarioFailureResult) {
        return scenarioFailureResult;
      }

      if (scenario === "empty") {
        return recommendationsPayload(
          {
            ...graph,
            recommendations: [],
          },
          provider,
          input,
        );
      }

      return recommendationsPayload(graph, provider, input);
    },

    async composeOpeningLine(input = {}): Promise<EventOpeningLineResult> {
      const scenario = normalizeScenario(input.scenario);
      const eventId = normalizeEventId(input.eventId);

      if (!eventId) {
        return failure(
          "EVENT_RECOMMENDATION_EVENT_ID_REQUIRED",
          liveProvenance({
            generationMethod: "live-store-opening-line",
            provider,
            databaseQueryExecuted: false,
          }),
        );
      }

      if (!provider) {
        return failure(
          "EVENT_RECOMMENDATION_LIVE_STORE_UNCONFIGURED",
          liveProvenance({
            generationMethod: "live-store-opening-line",
            databaseQueryExecuted: false,
          }),
        );
      }

      const graph = await provider.readEventRecommendationGraph(eventId);
      const scenarioFailureResult = scenarioFailure(
        scenario,
        liveProvenance({
          graph,
          generationMethod: "live-store-opening-line",
          provider,
          databaseQueryExecuted: true,
        }),
      );

      if (scenarioFailureResult) {
        return scenarioFailureResult;
      }

      if (scenario === "empty") {
        return failure(
          "EVENT_RECOMMENDATION_ATTENDEE_NOT_FOUND",
          liveProvenance({
            graph,
            generationMethod: "live-store-opening-line",
            provider,
            databaseQueryExecuted: true,
          }),
        );
      }

      return openingLinePayload(graph, provider, input);
    },
  };
}
