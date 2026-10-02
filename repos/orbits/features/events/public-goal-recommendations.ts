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

/**
 * W0036：「近期可报名」候选（首页推荐活动池的近期来源）。已排除已开始、已取消、本人主办、本人已报名；
 * 按开始时间升序；服务端不截断（计划点名的活动排第几场都要能解析到）。
 */
export interface PublicGoalUpcomingEvent {
  endsAt: string;
  eventId: string;
  publicCode: string;
  startsAt: string;
  title: string;
  venue: string;
}

export interface PublicGoalRecommendationsResult {
  items: readonly PublicGoalRecommendationItem[];
  state: PublicGoalRecommendationsState;
  /**
   * W0036：四种状态都带。目标这一段只决定 `state` 与 `items`；目录 + 报名这一段独立求值得到
   * `upcoming`——没设目标、读目标失败时照样读目录与报名；目录或报名读失败时为空数组。
   */
  upcoming: readonly PublicGoalUpcomingEvent[];
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
const emptyUpcoming: readonly PublicGoalUpcomingEvent[] = [];
const preferredRecordStatuses = new Set(["cancelled", "confirmed", "imported"]);
const registrationStatuses = new Set(["cancelled", "rsvped"]);

function unavailable(
  upcoming: readonly PublicGoalUpcomingEvent[] = emptyUpcoming,
): PublicGoalRecommendationsResult {
  return { items: emptyItems, state: "unavailable", upcoming };
}

function emptyState(
  state: "needs_goal" | "no_match",
  upcoming: readonly PublicGoalUpcomingEvent[] = emptyUpcoming,
): PublicGoalRecommendationsResult {
  return { items: emptyItems, state, upcoming };
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

/** 目录 + 本人报名这一段的结果：可报名候选（已排除已报名，升序）。 */
interface BookableCandidates {
  bookable: readonly ValidatedCandidate[];
}

/**
 * 读目录并对全部候选读一次本人报名（候选为空时不读报名）。语句与改前的 success／no_match 路径相同：
 * `readPublicCatalogue` 1 次 + `listMemberships` ≤1 次。任何读取或校验失败都抛错，由调用方决定降级。
 */
async function readBookableCandidates(
  dependencies: Pick<PublicGoalRecommendationsDependencies, "listMemberships" | "readPublicCatalogue">,
  accountId: string,
  now: Date,
): Promise<BookableCandidates> {
  const catalogue = await dependencies.readPublicCatalogue(now);
  const candidates = candidatesFromCatalogue(catalogue, accountId, now.getTime());
  if (candidates.length === 0) return { bookable: [] };
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
  return {
    bookable: candidates
      .filter((candidate) => !registered.has(candidate.eventId))
      .sort(
        (left, right) =>
          left.startsAtMs - right.startsAtMs ||
          left.eventId.localeCompare(right.eventId),
      ),
  };
}

function upcomingFrom(bookable: readonly ValidatedCandidate[]): readonly PublicGoalUpcomingEvent[] {
  return bookable.map((candidate) => ({
    endsAt: candidate.record.endsAt,
    eventId: candidate.eventId,
    publicCode: candidate.publicCode,
    startsAt: candidate.record.startsAt,
    title: candidate.record.title,
    venue: candidate.record.venue,
  }));
}

/**
 * W0036：只读「近期可报名」（不读目标）。首页示例期在服务端用它给真实活动（RH-03）；语句与推荐服务的
 * 目录 + 报名这一段相同（目录 1 次 + 报名 ≤1 次）。读取或校验失败时抛错，由调用方降级。
 */
export async function readPublicUpcomingEvents(
  dependencies: Pick<PublicGoalRecommendationsDependencies, "listMemberships" | "readPublicCatalogue">,
  accountId: string,
  now: Date,
): Promise<readonly PublicGoalUpcomingEvent[]> {
  if (typeof accountId !== "string" || !accountId.trim() || accountId !== accountId.trim()) {
    throw new Error("A canonical account id is required.");
  }
  const { bookable } = await readBookableCandidates(dependencies, accountId, now);
  return upcomingFrom(bookable);
}

/** W0050：可报名候选多带一段 description（需求 ↔ 活动按标题 + 简介匹配命中词）。 */
export interface PublicBookableEvent extends PublicGoalUpcomingEvent {
  description: string;
}

/**
 * W0050：与 `readPublicUpcomingEvents` 同一套候选规则（共用 `readBookableCandidates`：排除已开始、已取消、本人主办、
 * 已报名，按开始时间升序；目录 1 次 + 本人报名 ≤1 次），只多带 `description`。原函数不动。读取或校验失败时抛错。
 */
export async function readPublicBookableEvents(
  dependencies: Pick<PublicGoalRecommendationsDependencies, "listMemberships" | "readPublicCatalogue">,
  accountId: string,
  now: Date,
): Promise<readonly PublicBookableEvent[]> {
  if (typeof accountId !== "string" || !accountId.trim() || accountId !== accountId.trim()) {
    throw new Error("A canonical account id is required.");
  }
  const { bookable } = await readBookableCandidates(dependencies, accountId, now);
  return upcomingFrom(bookable).map((event, index) => ({ ...event, description: bookable[index]!.record.description }));
}

type GoalRead =
  | { kind: "goal"; goal: string }
  | { kind: "needs_goal" }
  | { kind: "unavailable" };

async function readGoal(
  dependencies: PublicGoalRecommendationsDependencies,
  accountId: string,
): Promise<GoalRead> {
  let goalValue: unknown;
  try {
    goalValue = await dependencies.readRelationshipGoal(accountId);
  } catch {
    return { kind: "unavailable" };
  }
  if (goalValue === null || goalValue === undefined) return { kind: "needs_goal" };
  if (typeof goalValue !== "string") return { kind: "unavailable" };
  const goal = goalValue.trim();
  return goal ? { goal, kind: "goal" } : { kind: "needs_goal" };
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

  // 目标这一段只决定 state 与 items。没设目标、读目标失败时不再提前返回（W0036 兜底「近期活动」）：
  // 目录 + 报名照读，只是这两条路径因此各多出目录 1 次、报名 1 次。
  const goalRead = await readGoal(dependencies, accountId);
  if (goalRead.kind !== "goal") {
    let upcoming = emptyUpcoming;
    try {
      upcoming = upcomingFrom((await readBookableCandidates(dependencies, accountId, now)).bookable);
    } catch {
      // 目录或报名读失败：池为空是如实的。
    }
    return goalRead.kind === "needs_goal"
      ? emptyState("needs_goal", upcoming)
      : unavailable(upcoming);
  }
  const goal = goalRead.goal;

  // 有目标时目录或报名读失败仍按原样整体 unavailable（upcoming 为空）。
  const { bookable } = await readBookableCandidates(dependencies, accountId, now);
  const upcoming = upcomingFrom(bookable);
  if (bookable.length === 0) {
    return emptyState("no_match", upcoming);
  }

  const scored = bookable
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
    return emptyState("no_match", upcoming);
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
    upcoming,
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
