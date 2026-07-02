import {
  EVENT_VALUE_RECOMMENDATION_ERROR_DEFINITIONS,
  type AcceptEventValueRecommendationInput,
  type EventValueRecommendation,
  type EventValueRecommendationAcceptancePayload,
  type EventValueRecommendationAcceptanceResult,
  type EventValueRecommendationCalendarFit,
  type EventValueRecommendationErrorCode,
  type EventValueRecommendationFactors,
  type EventValueRecommendationFailure,
  type EventValueRecommendationInput,
  type EventValueRecommendationProfile,
  type EventValueRecommendationProvenance,
  type EventValueRecommendationScenario,
  type EventValueRecommendationScoreBand,
  type EventValueRecommendationService,
  type EventValueRecommendationSignal,
  type EventValueRecommendationSourceReference,
  type EventValueRecommendationsPayload,
  type EventValueRecommendationsResult,
} from "./event-value-contract";
import type {
  LiveEventValueRecommendationProvider,
  LiveEventValueStoreRecord,
} from "./storage/event-value-live-record-provider";

export interface LiveEventValueRecommendationServiceOptions {
  provider?: LiveEventValueRecommendationProvider | null;
}

const supportedScenarios = new Set<EventValueRecommendationScenario>([
  "success",
  "empty",
  "pending",
  "failure",
]);

const supportedCalendarFits = new Set<EventValueRecommendationCalendarFit>([
  "open",
  "tight",
  "conflict",
]);

function clonePayload<TPayload>(payload: TPayload): TPayload {
  return JSON.parse(JSON.stringify(payload)) as TPayload;
}

function normalizeScenario(
  scenario?: EventValueRecommendationInput["scenario"],
): EventValueRecommendationScenario {
  if (
    scenario &&
    supportedScenarios.has(scenario as EventValueRecommendationScenario)
  ) {
    return scenario as EventValueRecommendationScenario;
  }

  return "success";
}

function normalizedLimit(limit?: number | null): number | null {
  if (!Number.isFinite(limit ?? Number.NaN)) {
    return null;
  }

  return Math.max(0, Math.floor(limit as number));
}

function normalizeText(value?: string | null): string {
  return value?.trim().toLowerCase() ?? "";
}

function terms(value: string): readonly string[] {
  return value
    .split(/[\s,;:/|()［］【】]+/)
    .map((term) => term.trim().toLowerCase())
    .filter((term) => term.length > 2);
}

function uniqueStrings(values: readonly string[]): string[] {
  return Array.from(new Set(values.filter((value) => value.trim().length > 0)));
}

function collectedAt(events: readonly LiveEventValueStoreRecord[]): string {
  return (
    events
      .map((event) => event.updatedAt)
      .filter((value) => value.trim().length > 0)
      .sort()
      .at(-1) ?? new Date(0).toISOString()
  );
}

function normalizeCalendarFit(
  calendarFit?: EventValueRecommendationInput["calendarFit"],
): EventValueRecommendationCalendarFit {
  return calendarFit && supportedCalendarFits.has(calendarFit as EventValueRecommendationCalendarFit)
    ? (calendarFit as EventValueRecommendationCalendarFit)
    : "open";
}

function sourceForEvent(
  event: LiveEventValueStoreRecord,
): EventValueRecommendationSourceReference {
  return {
    type: "event_import",
    id: event.source.id,
    label: event.source.label,
    providerRecordId: event.source.providerRecordId,
    generatedBy: "live-store-query",
  };
}

function fallbackSource(): EventValueRecommendationSourceReference {
  return {
    type: "event_import",
    id: "source:event-value:live-store-unconfigured",
    label: "Unconfigured event value live store",
    providerRecordId: "event-value-live-store-unconfigured",
    generatedBy: "live-store-query",
  };
}

function liveProvenance(input: {
  collectedAt?: string;
  databaseQueryExecuted: boolean;
  evidenceIds?: readonly string[];
  generationMethod: EventValueRecommendationProvenance["generationMethod"];
  provider?: LiveEventValueRecommendationProvider | null;
  source?: string;
  sourceLabel?: string;
}): EventValueRecommendationProvenance {
  return {
    source:
      input.source ??
      input.provider?.source ??
      "live-record-store:event-value-recommendations:unconfigured",
    sourceLabel:
      input.sourceLabel ??
      input.provider?.sourceLabel ??
      "Unconfigured event value recommendation live store",
    evidenceIds:
      input.evidenceIds ??
      ["evidence:event-value-live-store-unconfigured"],
    collectedAt: input.collectedAt ?? new Date(0).toISOString(),
    privacy: "live-event-value-recommendation-only",
    generationMethod: input.generationMethod,
    calendarProviderRequested: false,
    calendarAvailabilitySynced: false,
    liveEventDiscoveryFeedRequested: false,
    databaseQueryExecuted: input.databaseQueryExecuted,
    databaseWriteExecuted: false,
    productionAuditLogWriteExecuted: false,
    externalNetworkRequested: false,
    deviceRequested: false,
    aiProviderRequested: false,
    emailProviderRequested: false,
    notificationDelivered: false,
  };
}

function failure(
  code: EventValueRecommendationErrorCode,
  provenance: EventValueRecommendationProvenance,
): EventValueRecommendationFailure {
  const definition = EVENT_VALUE_RECOMMENDATION_ERROR_DEFINITIONS[code];

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

function scoreBand(score: number): EventValueRecommendationScoreBand {
  if (score >= 80) {
    return "high";
  }

  if (score >= 60) {
    return "medium";
  }

  return "low";
}

function matchingTermCount(input: {
  event: LiveEventValueStoreRecord;
  goal: string;
}): number {
  const haystack = [
    input.event.title,
    input.event.description,
    input.event.industry,
    input.event.location,
    input.event.source.label,
  ]
    .join(" ")
    .toLowerCase();

  return terms(input.goal).filter((term) => haystack.includes(term)).length;
}

function scoreParts(
  event: LiveEventValueStoreRecord,
  input: EventValueRecommendationInput,
): {
  calendarScore: number;
  densityScore: number;
  goalScore: number;
  industryScore: number;
  locationScore: number;
  recommendationScore: number;
} {
  const profileGoal = normalizeText(input.profileGoal);
  const location = normalizeText(input.location);
  const industry = normalizeText(input.industryPreference);
  const eventLocation = normalizeText(event.location);
  const eventIndustry = normalizeText(event.industry);
  const matchedTerms = matchingTermCount({ event, goal: profileGoal });

  return {
    calendarScore: normalizeCalendarFit(input.calendarFit) === "open" ? 8 : 3,
    densityScore: Math.min(14, event.attendeeDensity * 2),
    goalScore: profileGoal ? Math.min(28, matchedTerms * 9) : 18,
    industryScore:
      !industry || eventIndustry.includes(industry) || event.title.toLowerCase().includes(industry)
        ? 18
        : 5,
    locationScore:
      !location || eventLocation === location
        ? 18
        : eventLocation.includes(location) || location.includes(eventLocation)
          ? 10
          : 3,
    recommendationScore: Math.min(10, event.recommendationCount * 3),
  };
}

function scoreForEvent(
  event: LiveEventValueStoreRecord,
  input: EventValueRecommendationInput,
): number {
  const parts = scoreParts(event, input);

  return Math.min(
    99,
    Math.max(
      0,
      Math.round(
        20 +
          parts.goalScore +
          parts.locationScore +
          parts.industryScore +
          parts.densityScore +
          parts.calendarScore +
          parts.recommendationScore,
      ),
    ),
  );
}

function factorsFor(
  event: LiveEventValueStoreRecord,
  input: EventValueRecommendationInput,
): EventValueRecommendationFactors {
  const parts = scoreParts(event, input);
  const denominator = Math.max(
    1,
    parts.goalScore +
      parts.locationScore +
      parts.industryScore +
      parts.densityScore +
      parts.calendarScore,
  );

  return {
    attendeeDensity: Number((parts.densityScore / denominator).toFixed(2)),
    calendarFit: Number((parts.calendarScore / denominator).toFixed(2)),
    industryPreference: Number((parts.industryScore / denominator).toFixed(2)),
    location: Number((parts.locationScore / denominator).toFixed(2)),
    profileGoal: Number((parts.goalScore / denominator).toFixed(2)),
  };
}

function signal(input: {
  detail: string;
  event: LiveEventValueStoreRecord;
  factor: keyof EventValueRecommendationFactors;
  label: string;
  signalId: string;
  weight: number;
}): EventValueRecommendationSignal {
  return {
    signalId: input.signalId,
    label: input.label,
    detail: input.detail,
    factor: input.factor,
    weight: input.weight,
    evidenceIds: input.event.evidenceIds,
    source: sourceForEvent(input.event),
    generatedBy: "live-event-value-rule",
    liveEventDiscoveryFeedRequested: false,
    calendarProviderRequested: false,
    databaseQueryExecuted: true,
    aiProviderRequested: false,
    externalNetworkRequested: false,
  };
}

function signalsFor(
  event: LiveEventValueStoreRecord,
  factors: EventValueRecommendationFactors,
): readonly EventValueRecommendationSignal[] {
  return [
    signal({
      detail: `${event.title} matched the live-store event context and source label.`,
      event,
      factor: "profileGoal",
      label: "Goal fit",
      signalId: `signal:event-value:${event.id}:goal-fit`,
      weight: factors.profileGoal,
    }),
    signal({
      detail: `${event.attendeeDensity} attendees and ${event.recommendationCount} match recommendations are available for this event.`,
      event,
      factor: "attendeeDensity",
      label: "Relationship density",
      signalId: `signal:event-value:${event.id}:density`,
      weight: factors.attendeeDensity,
    }),
  ];
}

function recommendationForEvent(
  event: LiveEventValueStoreRecord,
  input: EventValueRecommendationInput,
): EventValueRecommendation {
  const valueScore = scoreForEvent(event, input);
  const factors = factorsFor(event, input);

  return {
    eventId: event.id,
    title: event.title,
    startsAt: event.startsAt,
    endsAt: event.endsAt,
    location: event.location,
    venue: event.venue,
    industry: event.industry,
    attendeeDensity: event.attendeeDensity,
    calendarFit: normalizeCalendarFit(input.calendarFit),
    valueScore,
    scoreBand: scoreBand(valueScore),
    factors,
    signals: signalsFor(event, factors),
    recommendedAction:
      "Review the live event evidence, then decide whether to prepare attendee outreach inside Orbit.",
    source: sourceForEvent(event),
    evidenceIds: event.evidenceIds,
    generatedBy: "live-store-event-value",
    calendarAvailabilitySynced: false,
    liveEventDiscoveryFeedRequested: false,
    externalNetworkRequested: false,
    databaseQueryExecuted: true,
    aiProviderRequested: false,
    calendarProviderRequested: false,
    emailProviderRequested: false,
    notificationDelivered: false,
  };
}

function rankedRecommendations(
  events: readonly LiveEventValueStoreRecord[],
  input: EventValueRecommendationInput,
): readonly EventValueRecommendation[] {
  const resolvedLimit = normalizedLimit(input.limit);
  const recommendations = events
    .map((event) => recommendationForEvent(event, input))
    .sort((left, right) => {
      return (
        right.valueScore - left.valueScore ||
        left.startsAt.localeCompare(right.startsAt) ||
        left.eventId.localeCompare(right.eventId)
      );
    });

  return resolvedLimit === null
    ? recommendations
    : recommendations.slice(0, resolvedLimit);
}

function profileFor(input: {
  firstEvent?: LiveEventValueStoreRecord;
  recommendation?: EventValueRecommendation;
  request: EventValueRecommendationInput;
}): EventValueRecommendationProfile {
  const source =
    input.recommendation?.source ??
    (input.firstEvent ? sourceForEvent(input.firstEvent) : fallbackSource());

  return {
    profileId: "profile:live-event-value",
    goal:
      input.request.profileGoal?.trim() ||
      "Prioritize source-backed live events for relationship building",
    location:
      input.request.location?.trim() ||
      input.recommendation?.location ||
      input.firstEvent?.location ||
      "Live event source",
    industryPreference:
      input.request.industryPreference?.trim() ||
      input.recommendation?.industry ||
      input.firstEvent?.industry ||
      "relationship development",
    calendarFit: normalizeCalendarFit(input.request.calendarFit),
    source,
    evidenceIds:
      input.recommendation?.evidenceIds ??
      input.firstEvent?.evidenceIds ??
      ["evidence:event-value-live-store-profile"],
  };
}

function recommendationsPayload(input: {
  events: readonly LiveEventValueStoreRecord[];
  provider: LiveEventValueRecommendationProvider;
  request: EventValueRecommendationInput;
}): EventValueRecommendationsResult {
  const recommendations = rankedRecommendations(input.events, input.request);
  const evidenceIds =
    recommendations.length > 0
      ? uniqueStrings(recommendations.flatMap((recommendation) => recommendation.evidenceIds))
      : ["evidence:event-value-live-store-empty"];
  const provenance = liveProvenance({
    collectedAt: collectedAt(input.events),
    databaseQueryExecuted: true,
    evidenceIds,
    generationMethod: "live-store-event-value",
    provider: input.provider,
  });

  return {
    success: true,
    data: clonePayload({
      state: recommendations.length > 0 ? "success" : "empty",
      profile: profileFor({
        firstEvent: input.events[0],
        recommendation: recommendations[0],
        request: input.request,
      }),
      recommendations,
      summary:
        recommendations.length > 0
          ? "Live store rules ranked sourced events by query fit, location, industry, attendee density, and existing match evidence without external feeds or AI."
          : "No live event value recommendations are available from the configured store.",
      provenance,
      nextAction:
        recommendations.length > 0
          ? "Review the top live event and its evidence before changing calendars, saved records, messages, or notifications."
          : "Seed or import source-backed events before ranking event value.",
    } satisfies EventValueRecommendationsPayload),
  };
}

function acceptancePayload(input: {
  event: LiveEventValueStoreRecord;
  provider: LiveEventValueRecommendationProvider;
}): EventValueRecommendationAcceptancePayload {
  const acceptedEvent = recommendationForEvent(input.event, {});

  return {
    state: "accepted",
    acceptedEvent,
    action: {
      actionId: `event-value-action:${acceptedEvent.eventId}:accept`,
      label: "Accept live event value recommendation",
      generatedBy: "live-event-value-service",
      evidenceIds: acceptedEvent.evidenceIds,
      source: acceptedEvent.source,
      externalNetworkRequested: false,
      calendarProviderRequested: false,
      notificationDelivered: false,
      databaseWriteExecuted: false,
      productionAuditLogWriteExecuted: false,
    },
    summary:
      "The live event value decision was accepted as an in-app preview without writing databases, calendars, notifications, or external messages.",
    provenance: liveProvenance({
      collectedAt: input.event.updatedAt,
      databaseQueryExecuted: true,
      evidenceIds: acceptedEvent.evidenceIds,
      generationMethod: "live-store-acceptance",
      provider: input.provider,
    }),
    nextAction:
      "Keep the accepted event source-backed until a separate live action sandbox is explicitly invoked.",
  };
}

function unconfiguredFailure(
  generationMethod: EventValueRecommendationProvenance["generationMethod"],
): EventValueRecommendationFailure {
  return failure(
    "EVENT_VALUE_RECOMMENDATION_LIVE_STORE_UNCONFIGURED",
    liveProvenance({
      databaseQueryExecuted: false,
      generationMethod,
    }),
  );
}

export function createLiveEventValueRecommendationService({
  provider,
}: LiveEventValueRecommendationServiceOptions = {}): EventValueRecommendationService {
  return {
    async listRecommendedEvents(input = {}): Promise<EventValueRecommendationsResult> {
      const scenario = normalizeScenario(input.scenario);

      if (!provider) {
        return unconfiguredFailure("live-store-event-value");
      }

      const events = await provider.listEvents();

      if (scenario === "failure") {
        return failure(
          "EVENT_VALUE_RECOMMENDATION_MOCK_FAILED",
          liveProvenance({
            collectedAt: collectedAt(events),
            databaseQueryExecuted: true,
            evidenceIds: uniqueStrings(events.flatMap((event) => event.evidenceIds)),
            generationMethod: "live-store-event-value",
            provider,
          }),
        );
      }

      if (scenario === "pending") {
        return failure(
          "EVENT_VALUE_RECOMMENDATION_PENDING",
          liveProvenance({
            collectedAt: collectedAt(events),
            databaseQueryExecuted: true,
            evidenceIds: uniqueStrings(events.flatMap((event) => event.evidenceIds)),
            generationMethod: "live-store-event-value",
            provider,
          }),
        );
      }

      return recommendationsPayload({
        events: scenario === "empty" ? [] : events,
        provider,
        request: input,
      });
    },

    async acceptRecommendedEvent(
      input = {},
    ): Promise<EventValueRecommendationAcceptanceResult> {
      const eventId = input.eventId?.trim() ?? "";

      if (!eventId) {
        return failure(
          "EVENT_VALUE_RECOMMENDATION_EVENT_ID_REQUIRED",
          liveProvenance({
            databaseQueryExecuted: false,
            generationMethod: "live-store-acceptance",
            provider,
          }),
        );
      }

      if (!provider) {
        return unconfiguredFailure("live-store-acceptance");
      }

      const scenario = normalizeScenario(input.scenario);
      const event = await provider.getEvent(eventId);

      if (scenario === "failure") {
        return failure(
          "EVENT_VALUE_RECOMMENDATION_MOCK_FAILED",
          liveProvenance({
            collectedAt: event?.updatedAt,
            databaseQueryExecuted: true,
            evidenceIds: event?.evidenceIds ?? [
              "evidence:event-value-live-store-acceptance-failed",
            ],
            generationMethod: "live-store-acceptance",
            provider,
          }),
        );
      }

      if (scenario === "pending") {
        return failure(
          "EVENT_VALUE_RECOMMENDATION_PENDING",
          liveProvenance({
            collectedAt: event?.updatedAt,
            databaseQueryExecuted: true,
            evidenceIds: event?.evidenceIds ?? [
              "evidence:event-value-live-store-pending",
            ],
            generationMethod: "live-store-acceptance",
            provider,
          }),
        );
      }

      if (!event || scenario === "empty") {
        return failure(
          "EVENT_VALUE_RECOMMENDATION_EVENT_NOT_FOUND",
          liveProvenance({
            collectedAt: event?.updatedAt,
            databaseQueryExecuted: true,
            evidenceIds: event?.evidenceIds ?? [
              "evidence:event-value-live-store-event-not-found",
            ],
            generationMethod: "live-store-acceptance",
            provider,
          }),
        );
      }

      return {
        success: true,
        data: clonePayload(
          acceptancePayload({
            event,
            provider,
          }),
        ),
      };
    },
  };
}
