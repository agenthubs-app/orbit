import type {
  EventCrudImportProvenance,
  EventListResult,
  EventRecord,
  EventStatus,
} from "./event-crud-and-import/contract";
import type {
  EventCrudAndImportService,
  EventCrudAndImportServiceResult,
} from "./event-crud-and-import/service";
import { createEventCrudAndImportService } from "./service-factory";

export interface EventsRecommendationToolInput {
  query: string;
  toolArguments?: Record<string, unknown> | null;
}

export interface EventsRecommendationCandidate {
  databaseQueryExecuted: boolean;
  description: string;
  endsAt: string;
  eventId: string;
  evidenceIds: readonly string[];
  matchReasons: readonly string[];
  nextAction: string;
  recommendedPreparation: string;
  relationshipContext: string;
  score: number;
  sourceLabel: string;
  startsAt: string;
  status: EventStatus;
  title: string;
  venue: string;
}

export interface EventsRecommendationToolResult {
  candidates: readonly EventsRecommendationCandidate[];
  databaseQueryExecuted: boolean;
  evidenceIds: readonly string[];
  sourceLabel: string;
  state: "success" | "empty" | "failure";
  summary: string;
}

export type EventsRecommendationToolResultValue =
  | EventsRecommendationToolResult
  | Promise<EventsRecommendationToolResult>;

export interface EventsRecommendationTool {
  recommend: (
    input: EventsRecommendationToolInput,
  ) => EventsRecommendationToolResultValue;
}

export interface EventsRecommendationToolOptions {
  eventService?: EventCrudAndImportService;
}

const preferredStatuses = new Set<EventStatus>(["confirmed", "imported"]);
const supportedStatuses = new Set<EventStatus>([
  "cancelled",
  "confirmed",
  "draft",
  "imported",
  "pending_import",
]);

function readText(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function normalizedLimit(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return 5;
  }

  return Math.max(0, Math.floor(value));
}

function normalizedStatus(value: unknown): EventStatus | null {
  return typeof value === "string" && supportedStatuses.has(value as EventStatus)
    ? (value as EventStatus)
    : null;
}

function tokensFor(query: string): readonly string[] {
  return Array.from(
    new Set(
      query
        .toLowerCase()
        .split(/[^a-z0-9\u3040-\u30ff\u3400-\u9fff]+/u)
        .map((token) => token.trim())
        .filter((token) => token.length >= 2),
    ),
  );
}

function eventText(event: EventRecord): string {
  return [
    event.title,
    event.description,
    event.venue,
    event.relationshipContext,
    event.recommendedPreparation,
    event.nextAction,
    event.sourceMetadata.label,
  ]
    .join(" ")
    .toLowerCase();
}

function databaseReadExecuted(provenance: EventCrudImportProvenance): boolean {
  return (
    provenance.generationMethod === "live-store-query" ||
    provenance.source.includes("live-store") ||
    provenance.source.includes("postgres")
  );
}

function evidenceIdsFor(event: EventRecord): readonly string[] {
  const evidenceIds = event.evidence.map((evidence) => evidence.evidenceId);

  return evidenceIds.length > 0
    ? evidenceIds
    : [`evidence:event:${event.id}:missing`];
}

function matchScore(input: {
  event: EventRecord;
  query: string;
  tokens: readonly string[];
}): { matchedTokens: readonly string[]; score: number } {
  const text = eventText(input.event);
  const matchedTokens = input.tokens.filter((token) => text.includes(token));
  const statusScore = preferredStatuses.has(input.event.status) ? 20 : 0;
  const queryScore = matchedTokens.length * 10;
  const contextScore = readText(input.event.relationshipContext) ? 10 : 0;
  const preparationScore = readText(input.event.recommendedPreparation) ? 10 : 0;
  const fallbackScore = input.tokens.length === 0 ? 15 : 0;

  return {
    matchedTokens,
    score: Math.min(
      100,
      statusScore + queryScore + contextScore + preparationScore + fallbackScore,
    ),
  };
}

function matchReasonsFor(input: {
  event: EventRecord;
  matchedTokens: readonly string[];
  query: string;
}): readonly string[] {
  const reasons: string[] = [];

  if (input.matchedTokens.length > 0) {
    reasons.push(`Matched request query "${input.query}" against live event text.`);
  }

  const relationshipContext = readText(input.event.relationshipContext);

  if (relationshipContext) {
    reasons.push(relationshipContext);
  }

  const recommendedPreparation = readText(input.event.recommendedPreparation);

  if (recommendedPreparation) {
    reasons.push(recommendedPreparation);
  }

  return reasons.length > 0
    ? reasons
    : ["Event is available from live Events data for review."];
}

function candidateFor(input: {
  databaseQueryExecuted: boolean;
  event: EventRecord;
  query: string;
  sourceLabel: string;
  tokens: readonly string[];
}): EventsRecommendationCandidate {
  const { matchedTokens, score } = matchScore({
    event: input.event,
    query: input.query,
    tokens: input.tokens,
  });

  return {
    databaseQueryExecuted: input.databaseQueryExecuted,
    description: input.event.description,
    endsAt: input.event.endsAt,
    eventId: input.event.id,
    evidenceIds: evidenceIdsFor(input.event),
    matchReasons: matchReasonsFor({
      event: input.event,
      matchedTokens,
      query: input.query,
    }),
    nextAction: input.event.nextAction,
    recommendedPreparation: input.event.recommendedPreparation,
    relationshipContext: input.event.relationshipContext,
    score,
    sourceLabel: input.sourceLabel,
    startsAt: input.event.startsAt,
    status: input.event.status,
    title: input.event.title,
    venue: input.event.venue,
  };
}

function compareCandidates(
  left: EventsRecommendationCandidate,
  right: EventsRecommendationCandidate,
): number {
  const scoreDifference = right.score - left.score;

  if (scoreDifference !== 0) {
    return scoreDifference;
  }

  return left.startsAt.localeCompare(right.startsAt);
}

function resultForList(
  listResult: EventListResult,
  input: EventsRecommendationToolInput,
): EventsRecommendationToolResult {
  if (listResult.success === false) {
    return {
      candidates: [],
      databaseQueryExecuted: false,
      evidenceIds: listResult.error.evidenceIds,
      sourceLabel: listResult.error.provenance.sourceLabel,
      state: "failure",
      summary: listResult.error.message,
    };
  }

  const query = input.query.trim();
  const limit = normalizedLimit(input.toolArguments?.limit);
  const tokens = tokensFor(query);
  const databaseQueryExecuted = databaseReadExecuted(listResult.data.provenance);
  const candidates = listResult.data.events
    .filter((event) => event.status !== "cancelled")
    .map((event) =>
      candidateFor({
        databaseQueryExecuted,
        event,
        query,
        sourceLabel: listResult.data.provenance.sourceLabel,
        tokens,
      }),
    )
    .sort(compareCandidates)
    .slice(0, limit);
  const evidenceIds = candidates.flatMap((candidate) => candidate.evidenceIds);

  return {
    candidates,
    databaseQueryExecuted,
    evidenceIds:
      evidenceIds.length > 0
        ? [...new Set(evidenceIds)]
        : listResult.data.provenance.evidenceIds,
    sourceLabel: listResult.data.provenance.sourceLabel,
    state: candidates.length > 0 ? "success" : "empty",
    summary:
      candidates.length > 0
        ? `${candidates.length} event(s) matched the request from live Events data.`
        : "No live Events records matched this request.",
  };
}

function isPromiseLike<TResult>(
  result: EventCrudAndImportServiceResult<TResult>,
): result is Promise<TResult> {
  const maybePromise = result as { then?: unknown };

  return typeof maybePromise.then === "function";
}

export function createEventsRecommendationTool(
  options: EventsRecommendationToolOptions = {},
): EventsRecommendationTool {
  const eventService = options.eventService ?? createEventCrudAndImportService();

  return {
    recommend(input): EventsRecommendationToolResultValue {
      const statusFilter = normalizedStatus(input.toolArguments?.statusFilter);
      const listResult = eventService.listEvents(
        statusFilter ? { statusFilter } : {},
      );

      if (isPromiseLike(listResult)) {
        return listResult.then((resolved) => resultForList(resolved, input));
      }

      return resultForList(listResult, input);
    },
  };
}
