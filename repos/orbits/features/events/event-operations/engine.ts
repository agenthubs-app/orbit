import { Buffer } from "node:buffer";
import { createHash, randomUUID } from "node:crypto";

import {
  EventOperationsError,
  type EventOperationsAiProvider,
  type EventOperationsAiResult,
  type EventOperationsConfiguration,
  type EventOperationsCapturedSnapshot,
  type EventOperationsFailureCode,
  type EventOperationsGeneration,
  type EventOperationsGenerationTask,
  type EventOperationsGraphEdge,
  type EventOperationsGroupingFeature,
  type EventOperationsGroupingResult,
  type EventOperationsParticipant,
  type EventOperationsParticipantRecommendations,
  type EventOperationsProgress,
  type EventOperationsPublishedResult,
  type EventOperationsRecommendationTaskOutput,
  type EventOperationsRelationshipGraph,
  type EventOperationsTable,
  type EventOperationsTaskOutput,
} from "./contract";
import { buildDeterministicCandidates } from "./candidate-retrieval";
import type {
  EventOperationsRepository,
  EventOperationsTaskAttemptMeasurement,
} from "./repository";

export interface EventOperationsEngine {
  createGeneration(input: {
    actorId: string;
    capturedSnapshot: EventOperationsCapturedSnapshot;
    idempotencyKey?: string | null;
  }): Promise<EventOperationsGeneration>;
  getProgress(generationId: string): Promise<EventOperationsProgress>;
  publishGeneration(input: {
    actorId: string;
    generationId: string;
  }): Promise<EventOperationsPublishedResult>;
  retryGeneration(input: {
    actorId: string;
    generationId: string;
  }): Promise<EventOperationsGeneration>;
  runGeneration(input: {
    actorId: string;
    generationId: string;
    maxConcurrency?: number;
    signal?: AbortSignal;
    workerId: string;
  }): Promise<EventOperationsProgress>;
}

export interface EventOperationsEngineOptions {
  aiProvider: EventOperationsAiProvider;
  heartbeatMs?: number;
  leaseMs?: number;
  maxConcurrency?: number;
  monotonicNow?: () => number;
  now?: () => string;
  repository: EventOperationsRepository;
  token?: () => string;
}

const DEFAULT_LEASE_MS = 5 * 60 * 1_000;
const DEFAULT_MAX_CONCURRENCY = 4;

function stableValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stableValue);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => [key, stableValue(item)]),
  );
}

function hash(value: unknown): string {
  return createHash("sha256")
    .update(JSON.stringify(stableValue(value)))
    .digest("hex");
}

function safeSerializedBytes(value: unknown): number {
  try {
    const serialized = JSON.stringify(stableValue(value));
    return serialized === undefined ? 0 : Buffer.byteLength(serialized, "utf8");
  } catch {
    return 0;
  }
}

function normalizedParticipants(
  participants: readonly EventOperationsParticipant[],
): EventOperationsParticipant[] {
  const byId = new Map<string, EventOperationsParticipant>();
  for (const participant of participants) {
    const participantId = participant.participantId.trim();
    const actorId = participant.actorId.trim();
    if (!participantId || !actorId || byId.has(participantId)) {
      throw new EventOperationsError(
        "EVENT_OPERATIONS_PARTICIPANT_NOT_FOUND",
        "Every generation participant must have unique participant and actor ids.",
      );
    }
    byId.set(participantId, {
      ...participant,
      actorId,
      participantId,
    });
  }
  return [...byId.values()].sort((left, right) =>
    left.participantId.localeCompare(right.participantId),
  );
}

function requireOrganizer(
  generation: EventOperationsGeneration,
  actorId: string,
): void {
  if (!actorId.trim() || generation.organizerActorId !== actorId.trim()) {
    throw new EventOperationsError(
      "EVENT_OPERATIONS_FORBIDDEN",
      "Only this event's organizer can operate recommendation generations.",
    );
  }
}

function failureCodeFor(
  result: Extract<EventOperationsAiResult<unknown>, { success: false }>,
): EventOperationsFailureCode {
  switch (result.error.code) {
    case "AI_UNAVAILABLE":
      return "EVENT_OPERATIONS_AI_UNAVAILABLE";
    case "AI_TIMEOUT":
      return "EVENT_OPERATIONS_AI_TIMEOUT";
    case "AI_JSON_INVALID":
      return "EVENT_OPERATIONS_AI_JSON_INVALID";
    case "AI_SCHEMA_INVALID":
      return "EVENT_OPERATIONS_AI_SCHEMA_INVALID";
    case "AI_REQUEST_FAILED":
    default:
      return "EVENT_OPERATIONS_SHARD_FAILED";
  }
}

function nonEmpty(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function validateRecommendations(input: {
  allowedTargetIdsBySource: ReadonlyMap<string, ReadonlySet<string>>;
  participantIds: readonly string[];
  recommendationCount: number;
  snapshotParticipants: readonly EventOperationsParticipant[];
  value: readonly EventOperationsParticipantRecommendations[];
}): readonly EventOperationsParticipantRecommendations[] {
  const expectedSources = new Set(input.participantIds);
  const allParticipants = new Set(
    input.snapshotParticipants.map((participant) => participant.participantId),
  );
  const seenSources = new Set<string>();

  if (input.value.length !== expectedSources.size) {
    throw new EventOperationsError(
      "EVENT_OPERATIONS_AI_SCHEMA_INVALID",
      "The AI shard did not return exactly one result for every source participant.",
    );
  }

  for (const row of input.value) {
    if (
      !expectedSources.has(row.sourceParticipantId) ||
      seenSources.has(row.sourceParticipantId)
    ) {
      throw new EventOperationsError(
        "EVENT_OPERATIONS_AI_SCHEMA_INVALID",
        "The AI shard returned an unknown or duplicate source participant.",
      );
    }
    seenSources.add(row.sourceParticipantId);

    if (row.recommendations.length === 0 && !nonEmpty(row.noMatchReason)) {
      throw new EventOperationsError(
        "EVENT_OPERATIONS_AI_SCHEMA_INVALID",
        "A participant with no AI match must include a concrete no-match reason.",
      );
    }
    if (row.recommendations.length > input.recommendationCount) {
      throw new EventOperationsError(
        "EVENT_OPERATIONS_AI_SCHEMA_INVALID",
        "The AI shard returned more recommendations than configured.",
      );
    }

    const seenTargets = new Set<string>();
    for (const [index, recommendation] of row.recommendations.entries()) {
      if (
        recommendation.rank !== index + 1 ||
        recommendation.targetParticipantId === row.sourceParticipantId ||
        !allParticipants.has(recommendation.targetParticipantId) ||
        !input.allowedTargetIdsBySource
          .get(row.sourceParticipantId)
          ?.has(recommendation.targetParticipantId) ||
        seenTargets.has(recommendation.targetParticipantId) ||
        !Number.isFinite(recommendation.score) ||
        recommendation.score < 0 ||
        recommendation.score > 100 ||
        !Array.isArray(recommendation.reasons) ||
        recommendation.reasons.length === 0 ||
        !recommendation.reasons.every(nonEmpty) ||
        !Array.isArray(recommendation.icebreakers) ||
        recommendation.icebreakers.length !== 2 ||
        !recommendation.icebreakers.every(nonEmpty) ||
        !nonEmpty(recommendation.memberHint)
      ) {
        throw new EventOperationsError(
          "EVENT_OPERATIONS_AI_SCHEMA_INVALID",
          "An AI recommendation violated the event operations schema.",
        );
      }
      seenTargets.add(recommendation.targetParticipantId);
    }
    if (
      (row.recommendations.length === 0 && !nonEmpty(row.noMatchReason)) ||
      (row.recommendations.length > 0 && row.noMatchReason !== null)
    ) {
      throw new EventOperationsError(
        "EVENT_OPERATIONS_AI_SCHEMA_INVALID",
        "Recommendation rows must use noMatchReason only for an empty result.",
      );
    }
  }

  return input.value;
}

function validateRound(input: {
  participants: readonly EventOperationsParticipant[];
  round: readonly EventOperationsTable[];
  tableSize: number;
}): void {
  const expected = new Set(
    input.participants.map((participant) => participant.participantId),
  );
  const assigned = new Set<string>();
  const tableNumbers = new Set<number>();

  for (const table of input.round) {
    if (
      !Number.isInteger(table.tableNumber) ||
      table.tableNumber < 1 ||
      tableNumbers.has(table.tableNumber) ||
      !nonEmpty(table.theme) ||
      !nonEmpty(table.rationale) ||
      table.members.length === 0 ||
      table.members.length > input.tableSize ||
      !table.memberPrompts ||
      typeof table.memberPrompts !== "object" ||
      Array.isArray(table.memberPrompts) ||
      !table.memberRationales ||
      typeof table.memberRationales !== "object" ||
      Array.isArray(table.memberRationales) ||
      !Array.isArray(table.icebreakers) ||
      table.icebreakers.length !== 3 ||
      !table.icebreakers.every(nonEmpty)
    ) {
      throw new EventOperationsError(
        "EVENT_OPERATIONS_AI_SCHEMA_INVALID",
        "An AI table violated the event operations table schema.",
      );
    }
    tableNumbers.add(table.tableNumber);
    const seats = new Set<string>();
    const memberIds = new Set(
      table.members.map((member) => member.participantId),
    );
    const promptIds = Object.keys(table.memberPrompts);
    const rationaleIds = Object.keys(table.memberRationales);
    if (
      memberIds.size !== table.members.length ||
      promptIds.length !== memberIds.size ||
      promptIds.some((participantId) => !memberIds.has(participantId)) ||
      rationaleIds.length !== memberIds.size ||
      rationaleIds.some((participantId) => !memberIds.has(participantId))
    ) {
      throw new EventOperationsError(
        "EVENT_OPERATIONS_AI_SCHEMA_INVALID",
        "Table member prompts and rationales must have exactly one key per assigned member.",
      );
    }

    for (const member of table.members) {
      const prompts = table.memberPrompts[member.participantId];
      const memberRationale = table.memberRationales[member.participantId];
      if (
        !expected.has(member.participantId) ||
        assigned.has(member.participantId) ||
        !nonEmpty(member.seat) ||
        seats.has(member.seat) ||
        !Array.isArray(prompts) ||
        prompts.length !== 2 ||
        !prompts.every(nonEmpty) ||
        !nonEmpty(memberRationale)
      ) {
        throw new EventOperationsError(
          "EVENT_OPERATIONS_AI_SCHEMA_INVALID",
          "An AI table member, prompt, or member rationale violated the schema.",
        );
      }
      assigned.add(member.participantId);
      seats.add(member.seat);
    }
  }

  if (assigned.size !== expected.size) {
    throw new EventOperationsError(
      "EVENT_OPERATIONS_AI_SCHEMA_INVALID",
      "Every snapshot participant must be assigned exactly once in each round.",
    );
  }
}

function validateGrouping(input: {
  participants: readonly EventOperationsParticipant[];
  tableSize: number;
  value: EventOperationsGroupingResult;
}): EventOperationsGroupingResult {
  validateRound({
    participants: input.participants,
    round: input.value.roundOne,
    tableSize: input.tableSize,
  });
  validateRound({
    participants: input.participants,
    round: input.value.roundTwo,
    tableSize: input.tableSize,
  });
  if (input.value.roundOne.length > 1) {
    if (
      input.value.roundOne.some((table) => table.members.length < 2) ||
      input.value.roundTwo.some((table) => table.members.length < 2)
    ) {
      throw new EventOperationsError(
        "EVENT_OPERATIONS_AI_SCHEMA_INVALID",
        "A multi-table round cannot contain a singleton table.",
      );
    }
    const roundOneTableByParticipant = new Map(
      input.value.roundOne.flatMap((table) =>
        table.members.map((member) => [
          member.participantId,
          table.tableNumber,
        ] as const),
      ),
    );
    let repeatedPairs = 0;
    let totalPairs = 0;
    for (const table of input.value.roundTwo) {
      const originCounts = new Map<number, number>();
      for (const member of table.members) {
        const origin = roundOneTableByParticipant.get(member.participantId)!;
        originCounts.set(origin, (originCounts.get(origin) ?? 0) + 1);
      }
      if (
        Math.max(...originCounts.values()) >
        Math.ceil(table.members.length / 2)
      ) {
        throw new EventOperationsError(
          "EVENT_OPERATIONS_AI_SCHEMA_INVALID",
          "Round two over-concentrated members from one round-one table.",
        );
      }
      for (let left = 0; left < table.members.length; left += 1) {
        for (let right = left + 1; right < table.members.length; right += 1) {
          totalPairs += 1;
          if (
            roundOneTableByParticipant.get(
              table.members[left].participantId,
            ) ===
            roundOneTableByParticipant.get(
              table.members[right].participantId,
            )
          ) {
            repeatedPairs += 1;
          }
        }
      }
    }
    if (totalPairs > 0 && repeatedPairs / totalPairs > 0.34) {
      throw new EventOperationsError(
        "EVENT_OPERATIONS_AI_SCHEMA_INVALID",
        "Round two repeated too many round-one peer pairs.",
      );
    }
  }
  return input.value;
}

function validateGroupingFeatures(input: {
  allowedTargetIdsBySource: ReadonlyMap<string, ReadonlySet<string>>;
  maxAffinityCount: number;
  participantIds: readonly string[];
  value: readonly EventOperationsGroupingFeature[];
}): readonly EventOperationsGroupingFeature[] {
  const expected = new Set(input.participantIds);
  const seen = new Set<string>();
  if (input.value.length !== expected.size) {
    throw new EventOperationsError(
      "EVENT_OPERATIONS_AI_SCHEMA_INVALID",
      "The grouping feature shard must return one row per source participant.",
    );
  }
  for (const feature of input.value) {
    const affinities = new Set(feature.affinityParticipantIds);
    if (
      !expected.has(feature.participantId) ||
      seen.has(feature.participantId) ||
      !nonEmpty(feature.primaryTopic) ||
      !nonEmpty(feature.secondaryTopic) ||
      !nonEmpty(feature.facilitationHint) ||
      feature.affinityParticipantIds.length > input.maxAffinityCount ||
      affinities.size !== feature.affinityParticipantIds.length ||
      feature.affinityParticipantIds.some(
        (participantId) =>
          participantId === feature.participantId ||
          !input.allowedTargetIdsBySource
            .get(feature.participantId)
            ?.has(participantId),
      )
    ) {
      throw new EventOperationsError(
        "EVENT_OPERATIONS_AI_SCHEMA_INVALID",
        "A grouping feature row violated its bounded candidate schema.",
      );
    }
    seen.add(feature.participantId);
  }
  return input.value;
}

function balancedCapacities(participantCount: number, tableSize: number): number[] {
  const tableCount = Math.ceil(participantCount / tableSize);
  if (tableCount <= 1) return [participantCount];
  if (Math.floor(participantCount / tableCount) < 2) {
    throw new EventOperationsError(
      "EVENT_OPERATIONS_CONFIGURATION_INVALID",
      "This participant count and table size cannot avoid singleton tables.",
    );
  }
  const base = Math.floor(participantCount / tableCount);
  const remainder = participantCount % tableCount;
  return Array.from(
    { length: tableCount },
    (_, index) => base + (index < remainder ? 1 : 0),
  );
}

function signalTokens(values: readonly (string | null)[]): ReadonlySet<string> {
  return new Set(
    values
      .flatMap((value) =>
        (value ?? "")
          .normalize("NFKC")
          .toLocaleLowerCase("en")
          .split(/[^\p{L}\p{N}]+/u),
      )
      .filter((value) => value.length >= 2),
  );
}

function signalOverlap(
  left: ReadonlySet<string>,
  right: ReadonlySet<string>,
): number {
  let count = 0;
  for (const value of left) if (right.has(value)) count += 1;
  return count;
}

function deterministicAssignments(input: {
  features: readonly EventOperationsGroupingFeature[];
  participants: readonly EventOperationsParticipant[];
  tableSize: number;
}): readonly {
  participantIds: readonly string[];
  roundNumber: 1 | 2;
  tableNumber: number;
}[] {
  const participantById = new Map(
    input.participants.map((participant) => [
      participant.participantId,
      participant,
    ]),
  );
  const affinityByParticipant = new Map(
    input.features.map((feature) => [
      feature.participantId,
      new Set(feature.affinityParticipantIds),
    ]),
  );
  const needsByParticipant = new Map(
    input.participants.map((participant) => [
      participant.participantId,
      signalTokens(participant.needs),
    ]),
  );
  const offersByParticipant = new Map(
    input.participants.map((participant) => [
      participant.participantId,
      signalTokens(participant.offers),
    ]),
  );
  const companyFrequency = new Map<string, number>();
  for (const participant of input.participants) {
    const company = participant.company?.trim().toLocaleLowerCase("en");
    if (company) companyFrequency.set(company, (companyFrequency.get(company) ?? 0) + 1);
  }
  const capacities = balancedCapacities(
    input.participants.length,
    input.tableSize,
  );
  const companyLimit = (company: string): number =>
    Math.ceil((companyFrequency.get(company) ?? 1) / capacities.length);
  const pairScore = (
    left: EventOperationsParticipant,
    right: EventOperationsParticipant,
    repeatedPairPenalty: number,
  ): number => {
    const affinity =
      (affinityByParticipant.get(left.participantId)?.has(right.participantId)
        ? 20
        : 0) +
      (affinityByParticipant.get(right.participantId)?.has(left.participantId)
        ? 20
        : 0);
    const complementarity =
      signalOverlap(
        needsByParticipant.get(left.participantId)!,
        offersByParticipant.get(right.participantId)!,
      ) +
      signalOverlap(
        needsByParticipant.get(right.participantId)!,
        offersByParticipant.get(left.participantId)!,
      );
    const sameCompany =
      left.company &&
      right.company &&
      left.company.trim().toLocaleLowerCase("en") ===
        right.company.trim().toLocaleLowerCase("en")
        ? 1
        : 0;
    return affinity + complementarity * 8 - sameCompany * 30 - repeatedPairPenalty;
  };
  const ordered = [...input.participants].sort((left, right) => {
    const leftCompany = left.company?.trim().toLocaleLowerCase("en") ?? "";
    const rightCompany = right.company?.trim().toLocaleLowerCase("en") ?? "";
    return (
      (companyFrequency.get(rightCompany) ?? 0) -
        (companyFrequency.get(leftCompany) ?? 0) ||
      (affinityByParticipant.get(right.participantId)?.size ?? 0) -
        (affinityByParticipant.get(left.participantId)?.size ?? 0) ||
      left.participantId.localeCompare(right.participantId)
    );
  });
  const roundOneParticipants = capacities.map(
    () => [] as EventOperationsParticipant[],
  );
  for (const participant of ordered) {
    const company = participant.company?.trim().toLocaleLowerCase("en") ?? "";
    const available = roundOneParticipants
      .map((members, index) => ({ index, members }))
      .filter(({ index, members }) => members.length < capacities[index]!);
    const companySafe = company
      ? available.filter(
          ({ members }) =>
            members.filter(
              (member) =>
                member.company?.trim().toLocaleLowerCase("en") === company,
            ).length < companyLimit(company),
        )
      : available;
    const choices = companySafe.length > 0 ? companySafe : available;
    const selected = choices
      .map(({ index, members }) => ({
        index,
        score:
          members.reduce(
            (sum, member) => sum + pairScore(participant, member, 0),
            0,
          ) -
          (members.length / capacities[index]!) * 5,
      }))
      .sort(
        (left, right) => right.score - left.score || left.index - right.index,
      )[0]!;
    roundOneParticipants[selected.index]!.push(participant);
  }
  const remixedOrder: EventOperationsParticipant[] = [];
  for (let seat = 0; seat < input.tableSize; seat += 1) {
    for (const table of roundOneParticipants) {
      const participant = table[seat];
      if (participant) remixedOrder.push(participant);
    }
  }
  const roundTwoParticipants: EventOperationsParticipant[][] = [];
  let offset = 0;
  for (const capacity of capacities) {
    roundTwoParticipants.push(remixedOrder.slice(offset, offset + capacity));
    offset += capacity;
  }
  const roundOneOrigin = new Map(
    roundOneParticipants.flatMap((members, tableIndex) =>
      members.map((member) => [member.participantId, tableIndex] as const),
    ),
  );
  const tableScore = (members: readonly EventOperationsParticipant[]): number => {
    let score = 0;
    for (let left = 0; left < members.length; left += 1) {
      for (let right = left + 1; right < members.length; right += 1) {
        const repeated =
          roundOneOrigin.get(members[left]!.participantId) ===
          roundOneOrigin.get(members[right]!.participantId);
        score += pairScore(members[left]!, members[right]!, repeated ? 40 : 0);
      }
    }
    return score;
  };
  const respectsOriginCap = (
    members: readonly EventOperationsParticipant[],
  ): boolean => {
    const counts = new Map<number, number>();
    for (const member of members) {
      const origin = roundOneOrigin.get(member.participantId)!;
      counts.set(origin, (counts.get(origin) ?? 0) + 1);
    }
    return Math.max(...counts.values()) <= Math.ceil(members.length / 2);
  };
  for (const participant of ordered) {
    const currentTableIndex = roundTwoParticipants.findIndex((members) =>
      members.some((member) => member.participantId === participant.participantId),
    );
    const affinityTargets = [...(affinityByParticipant.get(participant.participantId) ?? [])]
      .sort()
      .slice(0, 8);
    for (const targetId of affinityTargets) {
      const target = participantById.get(targetId);
      if (!target) continue;
      const targetTableIndex = roundTwoParticipants.findIndex((members) =>
        members.some((member) => member.participantId === targetId),
      );
      if (targetTableIndex < 0 || targetTableIndex === currentTableIndex) continue;
      const left = [...roundTwoParticipants[currentTableIndex]!];
      const right = [...roundTwoParticipants[targetTableIndex]!];
      const participantIndex = left.findIndex(
        (member) => member.participantId === participant.participantId,
      );
      const targetIndex = right.findIndex(
        (member) => member.participantId === targetId,
      );
      left[participantIndex] = target;
      right[targetIndex] = participant;
      if (!respectsOriginCap(left) || !respectsOriginCap(right)) continue;
      const before =
        tableScore(roundTwoParticipants[currentTableIndex]!) +
        tableScore(roundTwoParticipants[targetTableIndex]!);
      const after = tableScore(left) + tableScore(right);
      if (after > before) {
        roundTwoParticipants[currentTableIndex] = left;
        roundTwoParticipants[targetTableIndex] = right;
        break;
      }
    }
  }
  const assignments = (
    groups: readonly (readonly EventOperationsParticipant[])[],
    roundNumber: 1 | 2,
  ) =>
    groups.map((members, tableIndex) => ({
      participantIds: members.map((member) => member.participantId),
      roundNumber,
      tableNumber: tableIndex + 1,
    }));
  return [
    ...assignments(roundOneParticipants, 1),
    ...assignments(roundTwoParticipants, 2),
  ];
}

function graphFor(input: {
  grouping: EventOperationsGroupingResult;
  participants: readonly EventOperationsParticipant[];
  recommendations: readonly EventOperationsParticipantRecommendations[];
}): EventOperationsRelationshipGraph {
  const edges = new Map<string, EventOperationsGraphEdge>();

  for (const row of input.recommendations) {
    for (const recommendation of row.recommendations) {
      const edgeKey = `recommendation:${row.sourceParticipantId}:${recommendation.targetParticipantId}`;
      edges.set(edgeKey, {
        fromParticipantId: row.sourceParticipantId,
        id: `event-operations-edge:recommendation:${hash(edgeKey).slice(0, 20)}`,
        kind: "recommendation",
        label: `AI recommendation #${recommendation.rank} · ${recommendation.score}`,
        toParticipantId: recommendation.targetParticipantId,
      });
    }
  }

  const addTableEdges = (
    round: readonly EventOperationsTable[],
    kind: "round_one_table" | "round_two_topic",
  ) => {
    for (const table of round) {
      for (let left = 0; left < table.members.length; left += 1) {
        for (let right = left + 1; right < table.members.length; right += 1) {
          const leftParticipantId = table.members[left].participantId;
          const rightParticipantId = table.members[right].participantId;
          for (const [fromParticipantId, toParticipantId] of [
            [leftParticipantId, rightParticipantId],
            [rightParticipantId, leftParticipantId],
          ] as const) {
            const edgeKey = `${kind}:${fromParticipantId}:${toParticipantId}`;
            edges.set(edgeKey, {
              fromParticipantId,
              id: `event-operations-edge:${kind}:${hash(edgeKey).slice(0, 20)}`,
              kind,
              label: `${table.theme} · table ${table.tableNumber}`,
              toParticipantId,
            });
          }
        }
      }
    }
  };

  addTableEdges(input.grouping.roundOne, "round_one_table");
  addTableEdges(input.grouping.roundTwo, "round_two_topic");

  return {
    edges: [...edges.values()],
    nodes: input.participants.map((participant) => ({
      company: participant.company,
      displayName: participant.displayName,
      participantId: participant.participantId,
    })),
  };
}

function progressFor(
  generation: EventOperationsGeneration,
  tasks: readonly EventOperationsGenerationTask[],
  claimedTasks = 0,
): EventOperationsProgress {
  const completedTasks = tasks.filter((task) => task.status === "completed").length;
  const failedTasks = tasks.filter((task) => task.status === "failed").length;
  const runningTasks = tasks.filter((task) => task.status === "running").length;
  const queuedTasks = tasks.length - completedTasks - failedTasks - runningTasks;
  return {
    claimedTasks,
    completedTasks,
    failedTasks,
    generationId: generation.generationId,
    percent: tasks.length === 0 ? 0 : Math.round((completedTasks / tasks.length) * 100),
    queuedTasks,
    runningTasks,
    status: generation.status,
    totalTasks: tasks.length,
  };
}

export function createEventOperationsEngine({
  aiProvider,
  heartbeatMs: requestedHeartbeatMs,
  leaseMs = DEFAULT_LEASE_MS,
  maxConcurrency = DEFAULT_MAX_CONCURRENCY,
  monotonicNow = () => globalThis.performance.now(),
  now = () => new Date().toISOString(),
  repository,
  token = randomUUID,
}: EventOperationsEngineOptions): EventOperationsEngine {
  const aiRequestFingerprint =
    aiProvider.requestFingerprint ?? "event-operations-ai-provider:unspecified";
  const aiRequestHash = (request: unknown) =>
    hash({ aiRequestFingerprint, request });
  const heartbeatMs = Math.max(
    25,
    Math.min(
      Math.floor(leaseMs / 3),
      Math.floor(requestedHeartbeatMs ?? leaseMs / 3),
    ),
  );
  async function requireGeneration(
    generationId: string,
  ): Promise<EventOperationsGeneration> {
    const generation = await repository.getGeneration(generationId);
    if (!generation) {
      throw new EventOperationsError(
        "EVENT_OPERATIONS_GENERATION_NOT_FOUND",
        "The event operations generation does not exist.",
      );
    }
    return generation;
  }

  async function configurationFor(
    generation: EventOperationsGeneration,
  ): Promise<EventOperationsConfiguration> {
    const configuration = await repository.getGenerationConfiguration(
      generation.generationId,
    );
    if (!configuration) {
      throw new EventOperationsError(
        "EVENT_OPERATIONS_NOT_CONFIGURED",
        "Event operations must be configured before running AI.",
      );
    }
    return configuration;
  }

  async function executeTask(input: {
    configuration: EventOperationsConfiguration;
    generation: EventOperationsGeneration;
    task: EventOperationsGenerationTask;
  }): Promise<void> {
    const claimed = input.task;
    if (!claimed.leaseToken || claimed.status !== "running") {
      throw new EventOperationsError(
        "EVENT_OPERATIONS_LEASE_LOST",
        "The repository returned an invalid task lease.",
      );
    }

    const measurement: EventOperationsTaskAttemptMeasurement = {
      domainValidationDurationMs: 0,
      model: null,
      provider: null,
      providerAdapterDurationMs: 0,
      requestBytes: 0,
      responseBytes: 0,
    };
    const elapsed = (startedAt: number) =>
      Math.max(0, monotonicNow() - startedAt);

    async function measureProvider<T>(
      request: unknown,
      operation: () => Promise<EventOperationsAiResult<T>>,
    ): Promise<EventOperationsAiResult<T>> {
      measurement.requestBytes += safeSerializedBytes(request);
      const startedAt = monotonicNow();
      try {
        const result = await operation();
        measurement.responseBytes += safeSerializedBytes(result);
        if (result.success) {
          measurement.provider = result.provider;
          measurement.model = result.model;
        }
        return result;
      } finally {
        measurement.providerAdapterDurationMs += elapsed(startedAt);
      }
    }

    function measureValidation<T>(operation: () => T): T {
      const startedAt = monotonicNow();
      try {
        return operation();
      } finally {
        measurement.domainValidationDurationMs += elapsed(startedAt);
      }
    }

    async function fail(
      code: EventOperationsFailureCode,
      message: string,
    ): Promise<void> {
      await repository.failTask({
        code,
        failedAt: now(),
        leaseEpoch: claimed.leaseEpoch,
        leaseToken: claimed.leaseToken!,
        message,
        retryable:
          code !== "EVENT_OPERATIONS_CONFIGURATION_INVALID" &&
          code !== "EVENT_OPERATIONS_GENERATION_NOT_READY" &&
          code !== "EVENT_OPERATIONS_PARTICIPANT_NOT_FOUND",
        taskId: claimed.taskId,
        telemetry: { ...measurement },
      });
    }

    async function complete(
      completion: Omit<
        Parameters<EventOperationsRepository["completeTask"]>[0],
        "telemetry"
      >,
    ): Promise<void> {
      if (
        !(
          await repository.completeTask({
            ...completion,
            telemetry: {
              ...measurement,
              model: measurement.model ?? completion.artifact.model,
              provider: measurement.provider ?? completion.artifact.provider,
              responseBytes:
                measurement.responseBytes || safeSerializedBytes(completion.output),
            },
          })
        )
      ) {
        throw new EventOperationsError(
          "EVENT_OPERATIONS_LEASE_LOST",
          "The task lease was lost before the AI artifact could be persisted.",
        );
      }
    }

    if (input.generation.aiRequestFingerprint !== aiRequestFingerprint) {
      throw new EventOperationsError(
        "EVENT_OPERATIONS_CONFIGURATION_INVALID",
        "The repository returned a task for a different AI request fingerprint.",
      );
    }

    try {
      const participantById = new Map(
        input.generation.snapshot.participants.map((participant) => [
          participant.participantId,
          participant,
        ]),
      );
      const candidateRecords =
        claimed.kind === "grouping_reduce"
          ? []
          : await repository.listCandidates(
              input.generation.generationId,
              claimed.participantIds,
            );
      const candidatesBySource = new Map<string, EventOperationsParticipant[]>();
      const allowedTargetIdsBySource = new Map<string, Set<string>>();
      for (const sourceParticipantId of claimed.participantIds) {
        const sourceCandidates = candidateRecords.filter(
          (candidate) =>
            candidate.sourceParticipantId === sourceParticipantId,
        );
        candidatesBySource.set(
          sourceParticipantId,
          sourceCandidates.flatMap((candidate) => {
            const participant = participantById.get(
              candidate.targetParticipantId,
            );
            return participant ? [participant] : [];
          }),
        );
        allowedTargetIdsBySource.set(
          sourceParticipantId,
          new Set(
            sourceCandidates.map(
              (candidate) => candidate.targetParticipantId,
            ),
          ),
        );
      }

      if (claimed.kind === "recommendation_shard") {
        const request = {
          eventId: input.generation.eventId,
          recommendationCount: input.configuration.recommendationCount,
          sources: claimed.participantIds.map((participantId) => ({
            candidateParticipants: candidatesBySource.get(participantId) ?? [],
            sourceParticipant: participantById.get(participantId)!,
          })),
        };
        const result = await measureProvider(request, () =>
          aiProvider.generateRecommendations(request),
        );
        if (result.success === false) {
          await fail(failureCodeFor(result), result.error.message);
          return;
        }
        const recommendations = measureValidation(() =>
          validateRecommendations({
            allowedTargetIdsBySource,
            participantIds: claimed.participantIds,
            recommendationCount: input.configuration.recommendationCount,
            snapshotParticipants: input.generation.snapshot.participants,
            value: result.data,
          }),
        );
        const output: EventOperationsTaskOutput = {
          kind: "recommendation_shard",
          recommendations,
        };
        await complete({
          artifact: {
            evidenceMetadata: {
              aiRequestFingerprint,
              participantIds: [...claimed.participantIds],
              snapshotHash: input.generation.snapshot.hash,
            },
            kind: "recommendation_shard",
            model: result.model,
            provider: result.provider,
            requestHash: aiRequestHash(request),
            responseHash: hash(output),
            schemaVersion: 1,
          },
          completedAt: now(),
          leaseEpoch: claimed.leaseEpoch,
          leaseToken: claimed.leaseToken,
          output,
          taskId: claimed.taskId,
        });
        return;
      }

      const dependencyTasks = await repository.listTasks(
        input.generation.generationId,
      );
      const recommendations = dependencyTasks.flatMap((task) =>
        task.output?.kind === "recommendation_shard"
          ? task.output.recommendations
          : [],
      );
      const groupingFeatures = dependencyTasks.flatMap((task) =>
        task.output?.kind === "grouping_feature_shard"
          ? task.output.features
          : [],
      );

      if (claimed.kind === "grouping_feature_shard") {
        const maxAffinityCount = Math.min(
          4,
          Math.max(1, input.configuration.recommendationCount),
        );
        const request = {
          eventId: input.generation.eventId,
          maxAffinityCount,
          sources: claimed.participantIds.map((participantId) => {
            const recommendation = recommendations.find(
              (row) => row.sourceParticipantId === participantId,
            );
            if (!recommendation) {
              throw new EventOperationsError(
                "EVENT_OPERATIONS_GENERATION_NOT_READY",
                "A grouping feature task is missing its recommendation dependency.",
              );
            }
            return {
              candidateParticipants:
                candidatesBySource.get(participantId) ?? [],
              recommendations: recommendation,
              sourceParticipant: participantById.get(participantId)!,
            };
          }),
        };
        const result = await measureProvider(request, () =>
          aiProvider.generateGroupingFeatures(request),
        );
        if (result.success === false) {
          await fail(failureCodeFor(result), result.error.message);
          return;
        }
        const features = measureValidation(() =>
          validateGroupingFeatures({
            allowedTargetIdsBySource,
            maxAffinityCount,
            participantIds: claimed.participantIds,
            value: result.data,
          }),
        );
        const output: EventOperationsTaskOutput = {
          features,
          kind: "grouping_feature_shard",
        };
        await complete({
          artifact: {
            evidenceMetadata: {
              aiRequestFingerprint,
              participantIds: [...claimed.participantIds],
              snapshotHash: input.generation.snapshot.hash,
            },
            kind: "grouping_feature_shard",
            model: result.model,
            provider: result.provider,
            requestHash: aiRequestHash(request),
            responseHash: hash(output),
            schemaVersion: 1,
          },
          completedAt: now(),
          leaseEpoch: claimed.leaseEpoch,
          leaseToken: claimed.leaseToken,
          output,
          taskId: claimed.taskId,
        });
        return;
      }

      if (claimed.kind === "grouping_reduce") {
        if (groupingFeatures.length !== input.generation.snapshot.participants.length) {
          throw new EventOperationsError(
            "EVENT_OPERATIONS_GENERATION_NOT_READY",
            "The grouping reducer requires one validated feature per participant.",
          );
        }
        const reducerRequest = {
          features: groupingFeatures,
          tableSize: input.configuration.tableSize,
        };
        measurement.requestBytes += safeSerializedBytes(reducerRequest);
        const assignments = measureValidation(() =>
          deterministicAssignments({
            features: groupingFeatures,
            participants: input.generation.snapshot.participants,
            tableSize: input.configuration.tableSize,
          }),
        );
        const output: EventOperationsTaskOutput = {
          assignments,
          kind: "grouping_reduce",
        };
        await complete({
          artifact: {
            evidenceMetadata: {
              aiRequestFingerprint,
              dependencyTaskIds: [...claimed.dependsOnTaskIds],
              snapshotHash: input.generation.snapshot.hash,
            },
            kind: "grouping_reduce",
            model: "grouping-assignment-v1",
            provider: "orbit-hard-constraint-reducer",
            requestHash: aiRequestHash(reducerRequest),
            responseHash: hash(output),
            schemaVersion: 1,
          },
          completedAt: now(),
          leaseEpoch: claimed.leaseEpoch,
          leaseToken: claimed.leaseToken,
          output,
          taskId: claimed.taskId,
        });
        return;
      }

      const reducer = dependencyTasks.find(
        (task) => task.output?.kind === "grouping_reduce",
      )?.output;
      if (!reducer || reducer.kind !== "grouping_reduce") {
        throw new EventOperationsError(
          "EVENT_OPERATIONS_GENERATION_NOT_READY",
          "Table content requires a completed grouping assignment.",
        );
      }
      const partition = /:table-content:r([12]):(\d+)$/u.exec(claimed.taskId);
      if (!partition) {
        throw new EventOperationsError(
          "EVENT_OPERATIONS_CONFIGURATION_INVALID",
          "The table content task id has no round/table partition.",
        );
      }
      const roundNumber = Number(partition[1]) as 1 | 2;
      const tableNumber = Number(partition[2]);
      const assignment = reducer.assignments.find(
        (value) =>
          value.roundNumber === roundNumber &&
          value.tableNumber === tableNumber,
      );
      if (!assignment) {
        throw new EventOperationsError(
          "EVENT_OPERATIONS_GENERATION_NOT_READY",
          "The reducer produced no assignment for this table content task.",
        );
      }
      const members = assignment.participantIds.map(
        (participantId) => participantById.get(participantId)!,
      );
      const memberIds = new Set(assignment.participantIds);
      const request = {
        eventId: input.generation.eventId,
        features: groupingFeatures.filter((feature) =>
          memberIds.has(feature.participantId),
        ),
        members,
        roundNumber,
        tableNumber,
      };
      const result = await measureProvider(request, () =>
        aiProvider.generateTableContent(request),
      );
      if (result.success === false) {
        await fail(failureCodeFor(result), result.error.message);
        return;
      }
      measureValidation(() => {
        if (result.data.tableNumber !== tableNumber) {
          throw new EventOperationsError(
            "EVENT_OPERATIONS_AI_SCHEMA_INVALID",
            "The table content response changed its assigned table number.",
          );
        }
        validateRound({
          participants: members,
          round: [result.data],
          tableSize: input.configuration.tableSize,
        });
      });
      const output: EventOperationsTaskOutput = {
        kind: "table_content_shard",
        roundNumber,
        table: result.data,
      };
      await complete({
        artifact: {
          evidenceMetadata: {
            aiRequestFingerprint,
            participantIds: [...assignment.participantIds],
            roundNumber,
            snapshotHash: input.generation.snapshot.hash,
            tableNumber,
          },
          kind: "table_content_shard",
          model: result.model,
          provider: result.provider,
          requestHash: aiRequestHash(request),
          responseHash: hash(output),
          schemaVersion: 2,
        },
        completedAt: now(),
        leaseEpoch: claimed.leaseEpoch,
        leaseToken: claimed.leaseToken,
        output,
        taskId: claimed.taskId,
      });
    } catch (error) {
      const eventError =
        error instanceof EventOperationsError
          ? error
          : new EventOperationsError(
              "EVENT_OPERATIONS_SHARD_FAILED",
              error instanceof Error ? error.message : "The AI task failed.",
            );
      if (eventError.code === "EVENT_OPERATIONS_LEASE_LOST") return;
      await fail(eventError.code, eventError.message);
    }
  }

  async function executeTaskWithHeartbeat(input: {
    configuration: EventOperationsConfiguration;
    generation: EventOperationsGeneration;
    task: EventOperationsGenerationTask;
  }): Promise<void> {
    const task = input.task;
    if (!task.leaseToken || !task.workerId || task.status !== "running") {
      throw new EventOperationsError(
        "EVENT_OPERATIONS_LEASE_LOST",
        "The repository returned an invalid task lease for heartbeat.",
      );
    }

    let finished = false;
    let heartbeatFailure: unknown = null;
    let pendingHeartbeat = Promise.resolve();
    const timer = setInterval(() => {
      pendingHeartbeat = pendingHeartbeat.then(async () => {
        if (finished || heartbeatFailure) return;
        const heartbeatAt = now();
        try {
          const retained = await repository.heartbeatTask({
            heartbeatAt,
            leaseEpoch: task.leaseEpoch,
            leaseMs,
            leaseToken: task.leaseToken!,
            taskId: task.taskId,
            workerId: task.workerId!,
          });
          if (!retained && !finished) {
            heartbeatFailure = new EventOperationsError(
              "EVENT_OPERATIONS_LEASE_LOST",
              "The task lease heartbeat was rejected by its fencing token.",
            );
          }
        } catch (error) {
          if (!finished) heartbeatFailure = error;
        }
      });
    }, heartbeatMs);
    timer.unref?.();

    try {
      await executeTask(input);
      finished = true;
      await pendingHeartbeat;
    } finally {
      finished = true;
      clearInterval(timer);
      await pendingHeartbeat;
    }
  }

  return {
    async createGeneration({
      actorId,
      capturedSnapshot,
      idempotencyKey,
    }) {
      const configuration = capturedSnapshot.configuration;
      if (hash(configuration) !== capturedSnapshot.configurationHash) {
        throw new EventOperationsError(
          "EVENT_OPERATIONS_CONFIGURATION_INVALID",
          "The captured event configuration hash is invalid.",
        );
      }
      if (
        !actorId.trim() ||
        actorId.trim() !== configuration.organizerActorId.trim()
      ) {
        throw new EventOperationsError(
          "EVENT_OPERATIONS_FORBIDDEN",
          "Only the configured organizer can create an AI generation.",
        );
      }
      const normalized = normalizedParticipants(
        capturedSnapshot.snapshot.participants,
      );
      const timestamp = capturedSnapshot.snapshot.capturedAt;
      if (normalized.length === 0) {
        throw new EventOperationsError(
          "EVENT_OPERATIONS_PARTICIPANT_NOT_FOUND",
          "A generation requires at least one registered participant.",
        );
      }
      const snapshotHash = hash(normalized);
      if (snapshotHash !== capturedSnapshot.snapshot.hash) {
        throw new EventOperationsError(
          "EVENT_OPERATIONS_CONFIGURATION_INVALID",
          "The captured participant snapshot hash is invalid.",
        );
      }
      const resolvedIdempotencyKey =
        idempotencyKey?.trim() ||
        hash({
          configuration: {
            recommendationCount: configuration.recommendationCount,
            shardSize: configuration.shardSize,
            tableSize: configuration.tableSize,
          },
          aiRequestFingerprint,
          eventId: configuration.eventId,
          snapshotHash,
        });
      const generationId = `event-operations-generation:${hash({
        eventId: configuration.eventId,
        idempotencyKey: resolvedIdempotencyKey,
      }).slice(0, 32)}`;
      const shardSize = Math.max(1, Math.floor(configuration.shardSize));
      const shardTaskIds = Array.from(
        { length: Math.ceil(normalized.length / shardSize) },
        (_, shardIndex) => `${generationId}:recommendations:${shardIndex}`,
      );
      const featureTaskIds = shardTaskIds.map(
        (_, shardIndex) => `${generationId}:grouping-features:${shardIndex}`,
      );
      const reducerTaskId = `${generationId}:grouping-reduce`;
      const tableCount = Math.ceil(normalized.length / configuration.tableSize);
      const tableContentTaskIds = ([1, 2] as const).flatMap((roundNumber) =>
        Array.from(
          { length: tableCount },
          (_, tableIndex) =>
            `${generationId}:table-content:r${roundNumber}:${tableIndex + 1}`,
        ),
      );
      const expectedTaskCount =
        shardTaskIds.length +
        featureTaskIds.length +
        1 +
        tableContentTaskIds.length;
      const generation: EventOperationsGeneration = {
        aiRequestFingerprint,
        completedAt: null,
        createdAt: timestamp,
        errorCode: null,
        errorMessage: null,
        eventId: configuration.eventId,
        expectedTaskCount,
        generationId,
        idempotencyKey: resolvedIdempotencyKey,
        organizerActorId: actorId.trim(),
        publishedAt: null,
        snapshot: {
          capturedAt: capturedSnapshot.snapshot.capturedAt,
          hash: snapshotHash,
          participants: normalized,
        },
        status: "queued",
        updatedAt: timestamp,
      };
      const tasks: EventOperationsGenerationTask[] = shardTaskIds.map(
        (taskId, shardIndex) => {
          const index = shardIndex * shardSize;
          return {
          attemptLimit: Math.max(1, configuration.maxAttemptsPerTask),
          attempts: 0,
          completedAt: null,
          createdAt: timestamp,
          dependsOnTaskIds: [],
          errorCode: null,
          errorMessage: null,
          eventId: configuration.eventId,
          generationId,
          kind: "recommendation_shard",
          leaseEpoch: 0,
          leaseExpiresAt: null,
          leaseToken: null,
          output: null,
          participantIds: normalized
            .slice(index, index + shardSize)
            .map((participant) => participant.participantId),
          retryRound: 0,
          status: "queued",
          taskId,
          updatedAt: timestamp,
          workerId: null,
          };
        },
      );
      tasks.push(
        ...featureTaskIds.map((taskId, shardIndex) => {
          const index = shardIndex * shardSize;
          return {
            attemptLimit: Math.max(1, configuration.maxAttemptsPerTask),
            attempts: 0,
            completedAt: null,
            createdAt: timestamp,
            dependsOnTaskIds: [shardTaskIds[shardIndex]!],
            errorCode: null,
            errorMessage: null,
            eventId: configuration.eventId,
            generationId,
            kind: "grouping_feature_shard" as const,
            leaseEpoch: 0,
            leaseExpiresAt: null,
            leaseToken: null,
            output: null,
            participantIds: normalized
              .slice(index, index + shardSize)
              .map((participant) => participant.participantId),
            retryRound: 0,
            status: "queued" as const,
            taskId,
            updatedAt: timestamp,
            workerId: null,
          };
        }),
      );
      tasks.push({
        attemptLimit: Math.max(1, configuration.maxAttemptsPerTask),
        attempts: 0,
        completedAt: null,
        createdAt: timestamp,
        dependsOnTaskIds: featureTaskIds,
        errorCode: null,
        errorMessage: null,
        eventId: configuration.eventId,
        generationId,
        kind: "grouping_reduce",
        leaseEpoch: 0,
        leaseExpiresAt: null,
        leaseToken: null,
        output: null,
        participantIds: normalized.map((participant) => participant.participantId),
        retryRound: 0,
        status: "queued",
        taskId: reducerTaskId,
        updatedAt: timestamp,
        workerId: null,
      });
      tasks.push(
        ...tableContentTaskIds.map((taskId) => ({
          attemptLimit: Math.max(1, configuration.maxAttemptsPerTask),
          attempts: 0,
          completedAt: null,
          createdAt: timestamp,
          dependsOnTaskIds: [reducerTaskId],
          errorCode: null,
          errorMessage: null,
          eventId: configuration.eventId,
          generationId,
          kind: "table_content_shard" as const,
          leaseEpoch: 0,
          leaseExpiresAt: null,
          leaseToken: null,
          output: null,
          participantIds: [],
          retryRound: 0,
          status: "queued" as const,
          taskId,
          updatedAt: timestamp,
          workerId: null,
        })),
      );
      const candidateRetrieval = buildDeterministicCandidates({
        generationId,
        participants: normalized,
        recommendationCount: configuration.recommendationCount,
      });
      return repository.initializeGeneration({
        candidates: candidateRetrieval.candidates,
        capturedSnapshot,
        generation,
        tasks,
      });
    },

    async getProgress(generationId) {
      const generation = await requireGeneration(generationId);
      return progressFor(
        generation,
        await repository.listTasks(generation.generationId),
      );
    },

    async publishGeneration({ actorId, generationId }) {
      const generation = await requireGeneration(generationId);
      requireOrganizer(generation, actorId);
      if (generation.status === "published") {
        const existing = await repository.getPublishedResult(generation.eventId);
        if (existing?.generationId === generation.generationId) return existing;
      }
      if (generation.status !== "completed") {
        throw new EventOperationsError(
          "EVENT_OPERATIONS_GENERATION_NOT_READY",
          "Only a fully completed AI generation can be published.",
        );
      }
      const configuration = await configurationFor(generation);
      const tasks = await repository.listTasks(generation.generationId);
      if (tasks.length === 0 || tasks.some((task) => task.status !== "completed")) {
        throw new EventOperationsError(
          "EVENT_OPERATIONS_GENERATION_NOT_READY",
          "Every generation task must complete before atomic publication.",
        );
      }
      const recommendations = tasks.flatMap((task) =>
        task.output?.kind === "recommendation_shard"
          ? task.output.recommendations
          : [],
      );
      const tableOutputs = tasks.flatMap((task) =>
        task.output?.kind === "table_content_shard" ? [task.output] : [],
      );
      if (tableOutputs.length === 0) {
        throw new EventOperationsError(
          "EVENT_OPERATIONS_GENERATION_NOT_READY",
          "The completed generation has no validated AI table content.",
        );
      }
      const grouping = validateGrouping({
        participants: generation.snapshot.participants,
        tableSize: configuration.tableSize,
        value: {
          roundOne: tableOutputs
            .filter((output) => output.roundNumber === 1)
            .map((output) => output.table)
            .sort((left, right) => left.tableNumber - right.tableNumber),
          roundTwo: tableOutputs
            .filter((output) => output.roundNumber === 2)
            .map((output) => output.table)
            .sort((left, right) => left.tableNumber - right.tableNumber),
        },
      });
      const publishedAt = now();
      const result: EventOperationsPublishedResult = {
        directory: generation.snapshot.participants,
        eventId: generation.eventId,
        generationId: generation.generationId,
        graph: graphFor({
          grouping,
          participants: generation.snapshot.participants,
          recommendations,
        }),
        grouping,
        profileEditDeadlineAt: configuration.profileEditDeadlineAt,
        publishedAt,
        recommendations,
        resultsAvailableAt: configuration.resultsAvailableAt,
        snapshotHash: generation.snapshot.hash,
      };

      return repository.publishGenerationAtomically(
        result,
        generation.organizerActorId,
      );
    },

    async retryGeneration({ actorId, generationId }) {
      const generation = await requireGeneration(generationId);
      requireOrganizer(generation, actorId);
      return repository.retryFailedGeneration(generationId, now());
    },

    async runGeneration({
      actorId,
      generationId,
      maxConcurrency: requestedConcurrency,
      signal,
      workerId,
    }) {
      let generation = await requireGeneration(generationId);
      requireOrganizer(generation, actorId);
      if (
        generation.status === "completed" ||
        generation.status === "published" ||
        generation.status === "superseded"
      ) {
        return progressFor(
          generation,
          await repository.listTasks(generation.generationId),
        );
      }
      if (generation.status === "failed") {
        return progressFor(
          generation,
          await repository.listTasks(generation.generationId),
        );
      }
      if (generation.aiRequestFingerprint !== aiRequestFingerprint) {
        return progressFor(
          generation,
          await repository.listTasks(generation.generationId),
        );
      }
      const configuration = await configurationFor(generation);
      const concurrency = Math.max(
        1,
        Math.min(32, Math.floor(requestedConcurrency ?? maxConcurrency)),
      );

      const inFlight = new Set<Promise<void>>();
      let claimedTasks = 0;
      let executionError: unknown = null;

      async function fillAvailableSlots(): Promise<void> {
        if (signal?.aborted || executionError !== null) return;
        const availableSlots = concurrency - inFlight.size;
        if (availableSlots <= 0) return;
        let claimed: readonly EventOperationsGenerationTask[];
        try {
          claimed = await repository.claimTasks({
            aiRequestFingerprint,
            generationId: generation.generationId,
            leaseMs,
            leaseTokenPrefix: token(),
            limit: availableSlots,
            now: now(),
            workerId,
          });
        } catch (error) {
          executionError ??= error;
          return;
        }
        claimedTasks += claimed.length;
        for (const task of claimed) {
          let execution!: Promise<void>;
          execution = executeTaskWithHeartbeat({ configuration, generation, task })
            .catch((error: unknown) => {
              executionError ??= error;
            })
            .finally(() => {
              inFlight.delete(execution);
            });
          inFlight.add(execution);
        }
      }

      for (;;) {
        await fillAvailableSlots();
        if (inFlight.size === 0) break;
        await Promise.race(inFlight);
      }
      if (executionError !== null) throw executionError;
      generation = await repository.finalizeGeneration(generationId, now());
      return progressFor(
        generation,
        await repository.listTasks(generation.generationId),
        claimedTasks,
      );
    },
  };
}
