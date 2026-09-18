import type { PublicEventRecordCatalogueSnapshot } from "./core/public-catalogue";
import type { EventRecord } from "./event-crud-and-import/contract";
import { matchedTokensForText } from "./event-recommendation-tool";
import type { EventRegistration } from "./registration/contract";

export type PublicGoalRecommendationsState =
  | "success"
  | "needs_goal"
  | "no_match"
  | "unavailable";

export interface PublicGoalRecommendationItem {
  description: string;
  eventId: string;
  matchedTokens: readonly string[];
  publicCode: string;
  sourceEvidenceIds: readonly string[];
  startsAt: string;
  title: string;
  venue: string;
}

export interface PublicGoalRecommendationsResult {
  items: readonly PublicGoalRecommendationItem[];
  state: PublicGoalRecommendationsState;
}

export interface PublicGoalRecommendationsInput {
  accountId?: string | null;
}

export type PublicGoalRecommendationMembership = Pick<
  EventRegistration,
  "eventId" | "status" | "userId"
>;

export interface PublicGoalRecommendationsDependencies {
  listMemberships: (input: {
    accountId: string;
    eventIds: readonly string[];
  }) => Promise<readonly PublicGoalRecommendationMembership[]>;
  now?: () => Date;
  readPublicCatalogue: (
    now: Date,
  ) => Promise<PublicEventRecordCatalogueSnapshot>;
  readRelationshipGoal: (
    accountId: string,
  ) => Promise<string | null | undefined>;
}

export interface PublicGoalRecommendationsService {
  recommend: (
    input: PublicGoalRecommendationsInput,
  ) => Promise<PublicGoalRecommendationsResult>;
}

interface ValidatedCandidate {
  endsAtMs: number;
  eventId: string;
  evidenceIds: readonly string[];
  organizerId: string;
  publicCode: string;
  record: EventRecord;
  startsAtMs: number;
}

interface CandidateFacts extends ValidatedCandidate {
  duplicateKey: string;
}

const emptyItems: readonly PublicGoalRecommendationItem[] = [];
const preferredRecordStatuses = new Set(["cancelled", "confirmed", "imported"]);
const registrationStatuses = new Set(["cancelled", "rsvped"]);

function unavailable(): PublicGoalRecommendationsResult {
  return { items: emptyItems, state: "unavailable" };
}

function emptyState(
  state: "needs_goal" | "no_match",
): PublicGoalRecommendationsResult {
  return { items: emptyItems, state };
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function requiredText(value: unknown): string {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error("Invalid recommendation metadata");
  }
  return value.trim();
}

function requiredIdentifier(value: unknown): string {
  const normalized = requiredText(value);
  if (normalized !== value) {
    throw new Error("Invalid recommendation identifier");
  }
  return normalized;
}

function validTimestamp(value: unknown): {
  milliseconds: number;
  value: string;
} {
  if (typeof value !== "string") {
    throw new Error("Invalid recommendation timestamp");
  }
  const milliseconds = Date.parse(value);
  if (!Number.isFinite(milliseconds)) {
    throw new Error("Invalid recommendation timestamp");
  }
  return { milliseconds, value };
}

function mapValue(
  value: unknown,
): Record<string, unknown> {
  if (!isObject(value)) {
    throw new Error("Invalid recommendation catalogue map");
  }
  return value;
}

function hasOwn(value: Record<string, unknown>, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(value, key);
}

function evidenceIdsFor(record: EventRecord): readonly string[] {
  if (!Array.isArray(record.evidence) || record.evidence.length === 0) {
    throw new Error("Invalid recommendation evidence");
  }
  const evidenceIds = record.evidence.map((evidence) => {
    if (!isObject(evidence)) {
      throw new Error("Invalid recommendation evidence");
    }
    return requiredIdentifier(evidence.evidenceId);
  });
  return [...new Set(evidenceIds)];
}

function candidateFactsFor(
  recordValue: unknown,
  organizerIds: Record<string, unknown>,
  publicCodes: Record<string, unknown>,
  participantCounts: Record<string, unknown>,
): CandidateFacts {
  if (!isObject(recordValue)) {
    throw new Error("Invalid recommendation event");
  }
  const record = recordValue as unknown as EventRecord;
  const eventId = requiredIdentifier(record.id);
  const title = requiredText(record.title);
  if (typeof record.description !== "string") {
    throw new Error("Invalid recommendation description");
  }
  const venue = requiredText(record.venue);
  const startsAt = validTimestamp(record.startsAt);
  const endsAt = validTimestamp(record.endsAt);
  if (endsAt.milliseconds <= startsAt.milliseconds) {
    throw new Error("Invalid recommendation time range");
  }
  if (
    typeof record.status !== "string" ||
    !preferredRecordStatuses.has(record.status)
  ) {
    throw new Error("Invalid recommendation event status");
  }
  if (!isObject(record.sourceMetadata)) {
    throw new Error("Invalid recommendation source metadata");
  }
  const evidenceIds = evidenceIdsFor(record);

  if (!hasOwn(organizerIds, eventId)) {
    throw new Error("Missing recommendation organizer");
  }
  const organizerId = requiredIdentifier(organizerIds[eventId]);
  if (!hasOwn(publicCodes, eventId)) {
    throw new Error("Missing recommendation public code");
  }
  const publicCode = requiredIdentifier(publicCodes[eventId]);
  if (!hasOwn(participantCounts, eventId)) {
    throw new Error("Missing recommendation participant count");
  }
  const participantCount = participantCounts[eventId];
  if (
    typeof participantCount !== "number" ||
    !Number.isSafeInteger(participantCount) ||
    participantCount < 0
  ) {
    throw new Error("Invalid recommendation participant count");
  }

  const duplicateKey = JSON.stringify({
    description: record.description,
    endsAt: endsAt.milliseconds,
    evidenceIds: [...evidenceIds].sort(),
    eventId,
    organizerId,
    publicCode,
    startsAt: startsAt.milliseconds,
    status: record.status,
    title,
    venue,
  });

  return {
    duplicateKey,
    endsAtMs: endsAt.milliseconds,
    eventId,
    evidenceIds,
    organizerId,
    publicCode,
    record: {
      ...record,
      title,
      venue,
      startsAt: startsAt.value,
      endsAt: endsAt.value,
    },
    startsAtMs: startsAt.milliseconds,
  };
}

function candidatesFromCatalogue(
  catalogue: PublicEventRecordCatalogueSnapshot,
  accountId: string,
  nowMilliseconds: number,
): readonly ValidatedCandidate[] {
  if (!isObject(catalogue)) {
    throw new Error("Invalid recommendation catalogue");
  }
  const generatedAt = validTimestamp(catalogue.generatedAt);
  if (!Number.isFinite(generatedAt.milliseconds)) {
    throw new Error("Invalid recommendation catalogue timestamp");
  }
  if (!Array.isArray(catalogue.records)) {
    throw new Error("Invalid recommendation catalogue records");
  }
  const organizerIds = mapValue(catalogue.organizerIds);
  const publicCodes = mapValue(catalogue.publicCodes);
  const participantCounts = mapValue(catalogue.participantCounts);
  const candidatesById = new Map<string, CandidateFacts>();

  for (const record of catalogue.records) {
    const candidate = candidateFactsFor(
      record,
      organizerIds,
      publicCodes,
      participantCounts,
    );
    const previous = candidatesById.get(candidate.eventId);
    if (previous) {
      if (previous.duplicateKey !== candidate.duplicateKey) {
        throw new Error("Conflicting recommendation event duplicate");
      }
      continue;
    }
    candidatesById.set(candidate.eventId, candidate);
  }

  const publicCodeOwners = new Map<string, string>();
  for (const candidate of candidatesById.values()) {
    const normalizedCode = candidate.publicCode.toLocaleLowerCase("en-US");
    const previousOwner = publicCodeOwners.get(normalizedCode);
    if (previousOwner && previousOwner !== candidate.eventId) {
      throw new Error("Conflicting recommendation public code");
    }
    publicCodeOwners.set(normalizedCode, candidate.eventId);
  }

  return [...candidatesById.values()]
    .filter(
      (candidate) =>
        candidate.startsAtMs > nowMilliseconds &&
        candidate.record.status !== "cancelled" &&
        candidate.organizerId !== accountId,
    )
    .map(({ duplicateKey: _duplicateKey, ...candidate }) => candidate);
}

function registeredEventIds(
  memberships: unknown,
  accountId: string,
  candidateIds: ReadonlySet<string>,
): ReadonlySet<string> {
  if (!Array.isArray(memberships)) {
    throw new Error("Invalid recommendation memberships");
  }
  const seenEventIds = new Set<string>();
  const registered = new Set<string>();
  for (const membership of memberships) {
    if (!isObject(membership)) {
      throw new Error("Invalid recommendation membership");
    }
    const eventId = requiredIdentifier(membership.eventId);
    const userId = requiredIdentifier(membership.userId);
    if (userId !== accountId || !candidateIds.has(eventId)) {
      throw new Error("Out-of-scope recommendation membership");
    }
    if (
      typeof membership.status !== "string" ||
      !registrationStatuses.has(membership.status)
    ) {
      throw new Error("Invalid recommendation membership status");
    }
    if (seenEventIds.has(eventId)) {
      throw new Error("Duplicate recommendation membership");
    }
    seenEventIds.add(eventId);
    if (membership.status === "rsvped") {
      registered.add(eventId);
    }
  }
  return registered;
}

async function recommendWithDependencies(
  dependencies: PublicGoalRecommendationsDependencies,
  input: PublicGoalRecommendationsInput,
): Promise<PublicGoalRecommendationsResult> {
  const accountId = input?.accountId;
  if (typeof accountId !== "string" || !accountId.trim()) {
    return unavailable();
  }
  if (accountId !== accountId.trim()) {
    return unavailable();
  }
  const now = dependencies.now?.() ?? new Date();
  if (!(now instanceof Date) || !Number.isFinite(now.getTime())) {
    return unavailable();
  }

  const goalValue = await dependencies.readRelationshipGoal(accountId);
  if (goalValue === null || goalValue === undefined) {
    return emptyState("needs_goal");
  }
  if (typeof goalValue !== "string") {
    return unavailable();
  }
  const goal = goalValue.trim();
  if (!goal) {
    return emptyState("needs_goal");
  }

  const catalogue = await dependencies.readPublicCatalogue(now);
  const candidates = candidatesFromCatalogue(catalogue, accountId, now.getTime());
  if (candidates.length === 0) {
    return emptyState("no_match");
  }

  const candidateIds = candidates.map((candidate) => candidate.eventId);
  const memberships = await dependencies.listMemberships({
    accountId,
    eventIds: candidateIds,
  });
  const registered = registeredEventIds(
    memberships,
    accountId,
    new Set(candidateIds),
  );

  const scored = candidates
    .filter((candidate) => !registered.has(candidate.eventId))
    .map((candidate) => {
      const matchedTokens = matchedTokensForText(
        `${candidate.record.title} ${candidate.record.description}`,
        goal,
      );
      return { candidate, matchedTokens };
    })
    .filter((value) => value.matchedTokens.length > 0)
    .sort(
      (left, right) =>
        right.matchedTokens.length - left.matchedTokens.length ||
        left.candidate.startsAtMs - right.candidate.startsAtMs ||
        left.candidate.eventId.localeCompare(right.candidate.eventId),
    )
    .slice(0, 3);

  if (scored.length === 0) {
    return emptyState("no_match");
  }

  return {
    items: scored.map(({ candidate, matchedTokens }) => ({
      description: candidate.record.description,
      eventId: candidate.eventId,
      matchedTokens,
      publicCode: candidate.publicCode,
      sourceEvidenceIds: candidate.evidenceIds,
      startsAt: candidate.record.startsAt,
      title: candidate.record.title,
      venue: candidate.record.venue,
    })),
    state: "success",
  };
}

export function createPublicGoalRecommendationsService(
  dependencies: PublicGoalRecommendationsDependencies,
): PublicGoalRecommendationsService {
  return {
    recommend: async (input) => {
      try {
        return await recommendWithDependencies(dependencies, input);
      } catch {
        return unavailable();
      }
    },
  };
}
