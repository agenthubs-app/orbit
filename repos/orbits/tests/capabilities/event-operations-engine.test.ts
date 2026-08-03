import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";

import {
  createEventOperationsEngine,
  type EventOperationsEngine,
} from "../../features/events/event-operations/engine";
import {
  EventOperationsError,
  type EventOperationsAiProvider,
  type EventOperationsConfiguration,
  type EventOperationsParticipant,
} from "../../features/events/event-operations/contract";
import { createMemoryEventOperationsRepository } from "../../features/events/event-operations/storage/memory-repository";

const EVENT_ID = "event:event-operations-test";
const ORGANIZER_ID = "actor:organizer";

function participants(count = 8): EventOperationsParticipant[] {
  return Array.from({ length: count }, (_, index) => ({
    actorId: `actor:${index + 1}`,
    company: `Company ${String.fromCharCode(65 + index)}`,
    displayName: `Participant ${index + 1}`,
    energyStyle: index % 2 === 0 ? "structured" : "exploratory",
    evidenceIds: [`evidence:registration:${index + 1}`],
    experienceHighlight: `Led a distinct initiative numbered ${index + 1}`,
    industry: ["AI", "Climate", "Healthcare", "Fintech"][index % 4],
    languages: index % 3 === 0 ? ["ja", "en"] : ["zh", "en"],
    lateRegistration: index === count - 1,
    needs: [`Need ${index + 1}`],
    offers: [`Offer ${index + 1}`],
    participantId: `participant:${index + 1}`,
    profileCompleteness: index === count - 2 ? "partial" : "complete",
    role: `Role ${index + 1}`,
    seniority: index % 2 === 0 ? "founder" : "director",
    topics: [`Topic ${index + 1}`, `Shared ${index % 3}`],
  }));
}

function stableValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stableValue);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => [key, stableValue(item)]),
  );
}

function capturedSnapshot(
  values: readonly EventOperationsParticipant[],
  configured = configuration(),
) {
  const ordered = [...values].sort((left, right) =>
    left.participantId.localeCompare(right.participantId),
  );
  return {
    configuration: configured,
    configurationHash: createHash("sha256")
      .update(JSON.stringify(stableValue(configured)))
      .digest("hex"),
    configurationVersion: 1,
    snapshot: {
      capturedAt: "2026-08-02T09:00:00.000Z",
      hash: createHash("sha256")
        .update(JSON.stringify(stableValue(ordered)))
        .digest("hex"),
      participants: ordered,
    },
    sourceVersions: ordered.map((participant) => ({
      actorId: participant.actorId,
      membershipVersion: 1,
      participantId: participant.participantId,
      profileVersion: 1,
    })),
  };
}

function configuration(
  overrides: Partial<EventOperationsConfiguration> = {},
): EventOperationsConfiguration {
  return {
    checkInOpensAt: "2026-08-02T08:00:00.000Z",
    eventEndsAt: "2026-08-02T13:00:00.000Z",
    eventId: EVENT_ID,
    eventStartsAt: "2026-08-02T09:00:00.000Z",
    maxAttemptsPerTask: 2,
    organizerActorId: ORGANIZER_ID,
    profileEditDeadlineAt: "2026-08-02T07:00:00.000Z",
    recommendationCount: 2,
    registrationCutoffAt: "2026-08-02T08:00:00.000Z",
    resultsAvailableAt: "2026-08-02T08:30:00.000Z",
    roundOneStartsAt: "2026-08-02T09:30:00.000Z",
    roundTwoStartsAt: "2026-08-02T10:30:00.000Z",
    shardSize: 2,
    tableSize: 4,
    updatedAt: "2026-08-01T00:00:00.000Z",
    ...overrides,
  };
}

function createAiProvider(input: {
  alwaysFailParticipantId?: string;
  failParticipantId?: string;
  requestFingerprint?: string;
  shouldFail?: () => boolean;
  tracker?: { active: number; maxActive: number; calls: Map<string, number> };
} = {}): EventOperationsAiProvider {
  return {
    requestFingerprint: input.requestFingerprint,
    async generateRecommendations(request) {
      const shardKey = request.sources
        .map(({ sourceParticipant }) => sourceParticipant.participantId)
        .join(",");
      if (input.tracker) {
        input.tracker.active += 1;
        input.tracker.maxActive = Math.max(
          input.tracker.maxActive,
          input.tracker.active,
        );
        input.tracker.calls.set(
          shardKey,
          (input.tracker.calls.get(shardKey) ?? 0) + 1,
        );
        await new Promise((resolve) => setTimeout(resolve, 2));
        input.tracker.active -= 1;
      }
      if (
        request.sources.some(
          ({ sourceParticipant }) =>
            sourceParticipant.participantId === input.alwaysFailParticipantId ||
            (sourceParticipant.participantId === input.failParticipantId &&
              input.shouldFail?.()),
        )
      ) {
        return {
          error: {
            code: "AI_UNAVAILABLE" as const,
            message: "The configured model is unavailable.",
          },
          success: false as const,
        };
      }
      const rows = request.sources.map(
        ({ candidateParticipants, sourceParticipant: source }) => {
        return {
          noMatchReason: null,
          recommendations: candidateParticipants
            .slice(0, request.recommendationCount)
            .map((target, rank) => ({
              icebreakers: [
                `Discuss concrete overlap with ${target.participantId}`,
                `Compare a next step with ${target.participantId}`,
              ] as [string, string],
              memberHint: `Start with evidence-backed context for rank ${rank + 1}.`,
              rank: rank + 1,
              reasons: [
                `AI identified offer/need evidence for ${target.participantId}.`,
                `AI identified a topic bridge for ${target.participantId}.`,
              ] as [string, ...string[]],
              score: 90 - rank * 5,
              targetParticipantId: target.participantId,
            })),
          sourceParticipantId: source.participantId,
        };
        },
      );
      return {
        data: rows,
        model: "test-model",
        provider: "test-provider",
        success: true as const,
      };
    },
    async generateGroupingFeatures(request) {
      return {
        data: request.sources.map(
          ({ recommendations, sourceParticipant }) => ({
            affinityParticipantIds: recommendations.recommendations
              .slice(0, request.maxAffinityCount)
              .map((recommendation) => recommendation.targetParticipantId),
            facilitationHint: `Ask ${sourceParticipant.displayName} about concrete evidence.`,
            participantId: sourceParticipant.participantId,
            primaryTopic: sourceParticipant.topics[0] ?? "peer exchange",
            secondaryTopic: sourceParticipant.needs[0] ?? "next steps",
          }),
        ),
        model: "test-model",
        provider: "test-provider",
        success: true,
      };
    },
    async generateTableContent(request) {
      return {
        data: {
          icebreakers: [
            `Round ${request.roundNumber} opening`,
            `Table ${request.tableNumber} connection`,
            `Table ${request.tableNumber} next step`,
          ],
          memberPrompts: Object.fromEntries(
            request.members.map((participant) => [
              participant.participantId,
              [
                `Ask ${participant.displayName} about their concrete work`,
                `Ask ${participant.displayName} what introduction helps`,
              ],
            ]),
          ),
          memberRationales: Object.fromEntries(
            request.members.map((participant) => [
              participant.participantId,
              `AI grouped ${participant.displayName} here because their supplied offers, needs, and topics contribute specifically to this table.`,
            ]),
          ),
          members: request.members.map((participant, index) => ({
            participantId: participant.participantId,
            seat: `R${request.roundNumber}-T${request.tableNumber}-S${index + 1}`,
          })),
          rationale: `AI rationale for assigned round ${request.roundNumber} table ${request.tableNumber}.`,
          tableNumber: request.tableNumber,
          theme: `AI table theme ${request.roundNumber}-${request.tableNumber}`,
        },
        model: "test-model",
        provider: "test-provider",
        success: true,
      };
    },
  };
}

function harness(input: {
  aiProvider?: EventOperationsAiProvider;
  now?: () => string;
} = {}) {
  const repository = createMemoryEventOperationsRepository({
    configurations: [configuration()],
  });
  let tick = 0;
  const now =
    input.now ??
    (() => `2026-08-02T09:${String(tick++).padStart(2, "0")}:00.000Z`);
  const engine = createEventOperationsEngine({
    aiProvider: input.aiProvider ?? createAiProvider(),
    now,
    repository,
    token: () => `lease:${tick}`,
  });
  return { engine, repository };
}

async function createAndRun(
  engine: EventOperationsEngine,
  input: { idempotencyKey?: string; values?: readonly EventOperationsParticipant[] } = {},
) {
  const generation = await engine.createGeneration({
    actorId: ORGANIZER_ID,
    capturedSnapshot: capturedSnapshot(input.values ?? participants()),
    idempotencyKey: input.idempotencyKey,
  });
  const progress = await runUntilTerminal(engine, generation.generationId, 2);
  return { generation, progress };
}

async function runUntilTerminal(
  engine: EventOperationsEngine,
  generationId: string,
  maxConcurrency: number,
) {
  for (let batch = 0; batch < 20; batch += 1) {
    const progress = await engine.runGeneration({
      actorId: ORGANIZER_ID,
      generationId,
      maxConcurrency,
      workerId: `worker:test:${batch}`,
    });
    if (progress.status !== "queued" && progress.status !== "running") {
      return progress;
    }
  }
  throw new Error("Event operations generation did not reach a terminal state.");
}

test("event operations runs recommendation shards with bounded concurrency and atomically publishes complete AI results", async () => {
  const tracker = { active: 0, maxActive: 0, calls: new Map<string, number>() };
  const { engine } = harness({ aiProvider: createAiProvider({ tracker }) });
  const { generation, progress } = await createAndRun(engine);

  assert.equal(progress.status, "completed");
  assert.equal(progress.percent, 100);
  assert.equal(progress.totalTasks, 13);
  assert.equal(tracker.maxActive, 2);

  const published = await engine.publishGeneration({
    actorId: ORGANIZER_ID,
    generationId: generation.generationId,
  });
  assert.equal(published.directory.length, 8);
  assert.equal(published.recommendations.length, 8);
  assert.equal(published.grouping.roundOne.flatMap((table) => table.members).length, 8);
  assert.equal(published.grouping.roundTwo.flatMap((table) => table.members).length, 8);
  for (const table of [
    ...published.grouping.roundOne,
    ...published.grouping.roundTwo,
  ]) {
    assert.deepEqual(
      Object.keys(table.memberRationales).sort(),
      table.members.map((member) => member.participantId).sort(),
    );
    assert.ok(Object.values(table.memberRationales).every((value) => value.trim()));
  }
  assert.ok(
    published.graph.edges.some((edge) => edge.kind === "recommendation"),
  );
  assert.ok(published.graph.edges.some((edge) => edge.kind === "round_one_table"));
  assert.ok(published.graph.edges.some((edge) => edge.kind === "round_two_topic"));
});

test("rolling workers skip other AI fingerprints without poisoning or blocking publication", async () => {
  const repository = createMemoryEventOperationsRepository({
    configurations: [configuration()],
  });
  const generationEngine = createEventOperationsEngine({
    aiProvider: createAiProvider({ requestFingerprint: "ai-stack:v1" }),
    now: () => "2026-08-02T09:00:00.000Z",
    repository,
    token: () => "lease:generation-worker",
  });
  const generation = await generationEngine.createGeneration({
    actorId: ORGANIZER_ID,
    capturedSnapshot: capturedSnapshot(participants()),
  });
  assert.equal(generation.aiRequestFingerprint, "ai-stack:v1");

  const tracker = { active: 0, maxActive: 0, calls: new Map<string, number>() };
  const upgradedWorker = createEventOperationsEngine({
    aiProvider: createAiProvider({
      requestFingerprint: "ai-stack:v2",
      tracker,
    }),
    now: () => "2026-08-02T09:01:00.000Z",
    repository,
    token: () => "lease:upgraded-worker",
  });
  const progress = await upgradedWorker.runGeneration({
    actorId: ORGANIZER_ID,
    generationId: generation.generationId,
    maxConcurrency: 2,
    workerId: "worker:rolling-v2",
  });

  assert.equal(progress.status, "queued");
  assert.equal(tracker.calls.size, 0);
  const untouchedTasks = await repository.listTasks(generation.generationId);
  assert.ok(
    untouchedTasks.every(
      (task) => task.status === "queued" && task.attempts === 0,
    ),
  );

  const completed = await runUntilTerminal(
    generationEngine,
    generation.generationId,
    2,
  );
  assert.equal(completed.status, "completed");
  const published = await upgradedWorker.publishGeneration({
    actorId: ORGANIZER_ID,
    generationId: generation.generationId,
  });
  assert.equal(published.generationId, generation.generationId);
  const upgradedGeneration = await upgradedWorker.createGeneration({
    actorId: ORGANIZER_ID,
    capturedSnapshot: capturedSnapshot(participants()),
  });
  assert.notEqual(upgradedGeneration.generationId, generation.generationId);
  assert.equal(upgradedGeneration.aiRequestFingerprint, "ai-stack:v2");
});

test("engine fails a table task when member rationales have missing, extra, or unknown members", async (context) => {
  for (const variant of ["missing", "extra", "unknown-replacement"] as const) {
    await context.test(variant, async () => {
      const delegate = createAiProvider();
      const aiProvider: EventOperationsAiProvider = {
        generateGroupingFeatures: (request) =>
          delegate.generateGroupingFeatures(request),
        generateRecommendations: (request) =>
          delegate.generateRecommendations(request),
        async generateTableContent(request) {
          const result = await delegate.generateTableContent(request);
          if (result.success === false) return result;
          const memberRationales = { ...result.data.memberRationales };
          const firstParticipantId = request.members[0]!.participantId;
          if (variant === "missing") {
            delete memberRationales[firstParticipantId];
          } else if (variant === "extra") {
            memberRationales["participant:unknown"] =
              "An unknown member must never enter a table artifact.";
          } else {
            delete memberRationales[firstParticipantId];
            memberRationales["participant:unknown"] =
              "An unknown replacement must never satisfy exact member counts.";
          }
          return {
            ...result,
            data: { ...result.data, memberRationales },
          };
        },
      };
      const configured = configuration({ maxAttemptsPerTask: 1 });
      const repository = createMemoryEventOperationsRepository({
        configurations: [configured],
      });
      const engine = createEventOperationsEngine({
        aiProvider,
        now: () => "2026-08-02T09:00:00.000Z",
        repository,
        token: () => `lease:member-rationale:${variant}`,
      });
      const generation = await engine.createGeneration({
        actorId: ORGANIZER_ID,
        capturedSnapshot: capturedSnapshot(participants(4), configured),
        idempotencyKey: `invalid-member-rationale:${variant}`,
      });
      const progress = await runUntilTerminal(
        engine,
        generation.generationId,
        4,
      );
      assert.equal(progress.status, "failed");
      const failedTableTask = (
        await repository.listTasks(generation.generationId)
      ).find(
        (task) =>
          task.kind === "table_content_shard" &&
          task.status === "failed",
      );
      assert.equal(
        failedTableTask?.errorCode,
        "EVENT_OPERATIONS_AI_SCHEMA_INVALID",
      );
      assert.match(failedTableTask?.errorMessage ?? "", /rationales/u);
    });
  }
});

test("a failed shard fails the whole new generation and keeps the old published generation visible", async () => {
  const { engine, repository } = harness();
  const first = await createAndRun(engine, { idempotencyKey: "published-good" });
  const oldPublished = await engine.publishGeneration({
    actorId: ORGANIZER_ID,
    generationId: first.generation.generationId,
  });

  const failingEngine = createEventOperationsEngine({
    aiProvider: createAiProvider({ alwaysFailParticipantId: "participant:1" }),
    now: () => "2026-08-02T11:00:00.000Z",
    repository,
    token: () => "lease:failing",
  });
  const changedParticipants = participants().map((participant) => ({
    ...participant,
    topics: [...participant.topics, "changed snapshot"],
  }));
  const failing = await failingEngine.createGeneration({
    actorId: ORGANIZER_ID,
    capturedSnapshot: capturedSnapshot(changedParticipants),
    idempotencyKey: "new-failing-generation",
  });
  const failedProgress = await runUntilTerminal(
    failingEngine,
    failing.generationId,
    3,
  );

  assert.equal(failedProgress.status, "failed");
  await assert.rejects(
    () =>
      failingEngine.publishGeneration({
        actorId: ORGANIZER_ID,
        generationId: failing.generationId,
      }),
    /fully completed AI generation/u,
  );
  assert.equal(
    (await repository.getPublishedResult(EVENT_ID))?.generationId,
    oldPublished.generationId,
  );
  const exhausted = (await repository.listTasks(failing.generationId)).find(
    (task) => task.errorCode === "EVENT_OPERATIONS_AI_UNAVAILABLE",
  );
  assert.equal(exhausted?.attempts, exhausted?.attemptLimit);
});

test("hard topology/configuration failures are terminal on the first provider attempt", async () => {
  const delegate = createAiProvider();
  let groupingCalls = 0;
  const repository = createMemoryEventOperationsRepository({
    configurations: [configuration({ maxAttemptsPerTask: 3, shardSize: 2 })],
  });
  const engine = createEventOperationsEngine({
    aiProvider: {
      generateRecommendations: (request) => delegate.generateRecommendations(request),
      async generateGroupingFeatures() {
        groupingCalls += 1;
        throw new EventOperationsError(
          "EVENT_OPERATIONS_CONFIGURATION_INVALID",
          "Injected impossible hard grouping constraint.",
        );
      },
      generateTableContent: (request) => delegate.generateTableContent(request),
    },
    now: () => "2026-08-02T11:30:00.000Z",
    repository,
    token: () => "lease:terminal-constraint",
  });
  const generation = await engine.createGeneration({
    actorId: ORGANIZER_ID,
    capturedSnapshot: capturedSnapshot(
      participants(2),
      configuration({ maxAttemptsPerTask: 3, shardSize: 2 }),
    ),
    idempotencyKey: "terminal-hard-constraint",
  });

  const progress = await runUntilTerminal(engine, generation.generationId, 2);
  assert.equal(progress.status, "failed");
  assert.equal(groupingCalls, 1);
  const failed = (await repository.listTasks(generation.generationId)).find(
    (task) => task.kind === "grouping_feature_shard",
  );
  assert.equal(failed?.attempts, 3);
  assert.equal(failed?.errorCode, "EVENT_OPERATIONS_CONFIGURATION_INVALID");
});

test("manual retry resumes only failed shards and never reruns completed shards", async () => {
  let shouldFail = true;
  const tracker = { active: 0, maxActive: 0, calls: new Map<string, number>() };
  const { engine } = harness({
    aiProvider: createAiProvider({
      failParticipantId: "participant:1",
      shouldFail: () => shouldFail,
      tracker,
    }),
  });
  const generation = await engine.createGeneration({
    actorId: ORGANIZER_ID,
    capturedSnapshot: capturedSnapshot(
      participants(),
      configuration({ maxAttemptsPerTask: 1 }),
    ),
    idempotencyKey: "retry-resume",
  });
  const firstProgress = await engine.runGeneration({
    actorId: ORGANIZER_ID,
    generationId: generation.generationId,
    maxConcurrency: 4,
    workerId: "worker:first",
  });
  assert.equal(firstProgress.status, "failed");
  const completedShardCalls = new Map(tracker.calls);

  shouldFail = false;
  await engine.retryGeneration({
    actorId: ORGANIZER_ID,
    generationId: generation.generationId,
  });
  const retried = await runUntilTerminal(engine, generation.generationId, 4);
  assert.equal(retried.status, "completed");
  for (const [shard, calls] of completedShardCalls) {
    if (!shard.includes("participant:1")) {
      assert.equal(tracker.calls.get(shard), calls);
    }
  }
  assert.equal(tracker.calls.get("participant:1,participant:2"), 2);
});

test("an expired running lease is requeued and resumes within the original retry budget", async () => {
  const tracker = { active: 0, maxActive: 0, calls: new Map<string, number>() };
  const repository = createMemoryEventOperationsRepository({
    configurations: [configuration({ maxAttemptsPerTask: 2, shardSize: 2 })],
  });
  let lease = 0;
  const engine = createEventOperationsEngine({
    aiProvider: createAiProvider({ tracker }),
    leaseMs: 1_000,
    now: () => "2026-08-02T10:00:00.000Z",
    repository,
    token: () => `lease:recovered:${++lease}`,
  });
  const generation = await engine.createGeneration({
    actorId: ORGANIZER_ID,
    capturedSnapshot: capturedSnapshot(participants(2)),
    idempotencyKey: "expired-running-lease",
  });
  const shard = (await repository.listTasks(generation.generationId)).find(
    (task) => task.kind === "recommendation_shard",
  );
  assert.ok(shard);
  await repository.replaceTaskForTest({
    ...shard,
    attempts: 1,
    leaseExpiresAt: "2026-08-02T09:59:59.000Z",
    leaseToken: "lease:crashed-worker",
    status: "running",
    updatedAt: "2026-08-02T09:59:58.000Z",
    workerId: "worker:crashed",
  });

  const progress = await runUntilTerminal(engine, generation.generationId, 1);

  assert.equal(progress.status, "completed");
  assert.equal(tracker.calls.get("participant:1,participant:2"), 1);
  const recovered = await repository.getTask(shard.taskId);
  assert.equal(recovered?.status, "completed");
  assert.equal(recovered?.attempts, 2);
  assert.equal(recovered?.leaseToken, null);
});

test("a live lease is not stolen and an expired exhausted lease fails explicitly", async () => {
  const tracker = { active: 0, maxActive: 0, calls: new Map<string, number>() };
  const repository = createMemoryEventOperationsRepository({
    configurations: [configuration({ maxAttemptsPerTask: 1, shardSize: 2 })],
  });
  let currentTime = "2026-08-02T10:00:00.000Z";
  const engine = createEventOperationsEngine({
    aiProvider: createAiProvider({ tracker }),
    now: () => currentTime,
    repository,
    token: () => "lease:unexpected",
  });
  const generation = await engine.createGeneration({
    actorId: ORGANIZER_ID,
    capturedSnapshot: capturedSnapshot(
      participants(2),
      configuration({ maxAttemptsPerTask: 1, shardSize: 2 }),
    ),
    idempotencyKey: "live-then-exhausted-lease",
  });
  const shard = (await repository.listTasks(generation.generationId)).find(
    (task) => task.kind === "recommendation_shard",
  );
  assert.ok(shard);
  await repository.replaceTaskForTest({
    ...shard,
    attempts: 1,
    leaseExpiresAt: "2026-08-02T10:00:30.000Z",
    leaseToken: "lease:active-worker",
    status: "running",
    updatedAt: currentTime,
    workerId: "worker:active",
  });

  const liveProgress = await engine.runGeneration({
    actorId: ORGANIZER_ID,
    generationId: generation.generationId,
    maxConcurrency: 1,
    workerId: "worker:observer",
  });
  assert.equal(liveProgress.status, "running");
  assert.equal(liveProgress.runningTasks, 1);
  assert.equal(tracker.calls.size, 0);
  assert.equal((await repository.getTask(shard.taskId))?.leaseToken, "lease:active-worker");

  currentTime = "2026-08-02T10:01:00.000Z";
  const failedProgress = await engine.runGeneration({
    actorId: ORGANIZER_ID,
    generationId: generation.generationId,
    maxConcurrency: 1,
    workerId: "worker:recovery",
  });
  assert.equal(failedProgress.status, "failed");
  assert.equal(tracker.calls.size, 0);
  const exhausted = await repository.getTask(shard.taskId);
  assert.equal(exhausted?.status, "failed");
  assert.equal(exhausted?.errorCode, "EVENT_OPERATIONS_LEASE_LOST");
  assert.equal(exhausted?.leaseToken, null);
});

test("a recovered lease fences the stale worker result", async () => {
  const delegate = createAiProvider();
  let recommendationCalls = 0;
  let releaseFirst!: () => void;
  let signalFirstStarted!: () => void;
  const firstGate = new Promise<void>((resolve) => {
    releaseFirst = resolve;
  });
  const firstStarted = new Promise<void>((resolve) => {
    signalFirstStarted = resolve;
  });
  const aiProvider: EventOperationsAiProvider = {
    generateGroupingFeatures: (request) =>
      delegate.generateGroupingFeatures(request),
    generateTableContent: (request) =>
      delegate.generateTableContent(request),
    async generateRecommendations(request) {
      recommendationCalls += 1;
      const callNumber = recommendationCalls;
      const result = await delegate.generateRecommendations(request);
      if (result.success === false) return result;
      const marker = callNumber === 1 ? "stale-first-worker" : "recovered-worker";
      const marked = {
        ...result,
        data: result.data.map((row) => ({
          ...row,
          recommendations: row.recommendations.map((recommendation) => ({
            ...recommendation,
            reasons: [`${marker} produced this recommendation`] as [string],
          })),
        })),
      };
      if (callNumber === 1) {
        signalFirstStarted();
        await firstGate;
      }
      return marked;
    },
  };
  const repository = createMemoryEventOperationsRepository({
    configurations: [configuration({ maxAttemptsPerTask: 2, shardSize: 2 })],
  });
  let currentTime = "2026-08-02T10:00:00.000Z";
  let lease = 0;
  const engine = createEventOperationsEngine({
    aiProvider,
    leaseMs: 1_000,
    now: () => currentTime,
    repository,
    token: () => `lease:concurrent:${++lease}`,
  });
  const generation = await engine.createGeneration({
    actorId: ORGANIZER_ID,
    capturedSnapshot: capturedSnapshot(participants(2)),
    idempotencyKey: "fence-stale-worker",
  });

  const staleRun = engine.runGeneration({
    actorId: ORGANIZER_ID,
    generationId: generation.generationId,
    maxConcurrency: 1,
    workerId: "worker:stale",
  });
  await firstStarted;
  currentTime = "2026-08-02T10:00:02.000Z";
  const recoveredProgress = await engine.runGeneration({
    actorId: ORGANIZER_ID,
    generationId: generation.generationId,
    maxConcurrency: 1,
    workerId: "worker:recovered",
  });
  assert.equal(recoveredProgress.status, "running");
  const recoveredTerminal = await runUntilTerminal(
    engine,
    generation.generationId,
    1,
  );
  assert.equal(recoveredTerminal.status, "completed");

  releaseFirst();
  assert.equal((await staleRun).status, "completed");
  const shard = (await repository.listTasks(generation.generationId)).find(
    (task) => task.kind === "recommendation_shard",
  );
  assert.equal(shard?.attempts, 2);
  assert.equal(shard?.output?.kind, "recommendation_shard");
  if (shard?.output?.kind === "recommendation_shard") {
    assert.match(
      shard.output.recommendations[0].recommendations[0].reasons[0],
      /recovered-worker/u,
    );
  }
});

test("event operations rejects organizer mutations from a different actor", async () => {
  const { engine } = harness();
  await assert.rejects(
    () =>
      engine.createGeneration({
        actorId: "actor:not-organizer",
        capturedSnapshot: capturedSnapshot(participants()),
      }),
    /Only the configured organizer/u,
  );
});

test("N=13 tableSize=6 uses balanced non-singleton tables and bounded round-two remix", async () => {
  const values = participants(13).map((participant, index) => ({
    ...participant,
    company: index < 6 ? "Shared Company" : participant.company,
  }));
  const configured = configuration({ shardSize: 3, tableSize: 6 });
  const repository = createMemoryEventOperationsRepository({
    configurations: [configured],
  });
  const engine = createEventOperationsEngine({
    aiProvider: createAiProvider(),
    now: () => "2026-08-02T09:00:00.000Z",
    repository,
    token: () => "lease:balanced",
  });
  const generation = await engine.createGeneration({
    actorId: ORGANIZER_ID,
    capturedSnapshot: capturedSnapshot(values, configured),
    idempotencyKey: "balanced-13-by-6",
  });
  const progress = await runUntilTerminal(engine, generation.generationId, 8);
  assert.equal(progress.status, "completed");
  const published = await engine.publishGeneration({
    actorId: ORGANIZER_ID,
    generationId: generation.generationId,
  });
  assert.deepEqual(
    published.grouping.roundOne.map((table) => table.members.length),
    [5, 4, 4],
  );
  assert.deepEqual(
    published.grouping.roundTwo.map((table) => table.members.length),
    [5, 4, 4],
  );
  const participantById = new Map(
    values.map((participant) => [participant.participantId, participant]),
  );
  for (const table of published.grouping.roundOne) {
    const sharedCompanyCount = table.members.filter(
      (member) =>
        participantById.get(member.participantId)?.company === "Shared Company",
    ).length;
    assert.ok(sharedCompanyCount <= 2);
  }
  const origin = new Map(
    published.grouping.roundOne.flatMap((table) =>
      table.members.map((member) => [
        member.participantId,
        table.tableNumber,
      ] as const),
    ),
  );
  let repeatedPairs = 0;
  let totalPairs = 0;
  for (const table of published.grouping.roundTwo) {
    const originCounts = new Map<number, number>();
    for (const member of table.members) {
      const value = origin.get(member.participantId)!;
      originCounts.set(value, (originCounts.get(value) ?? 0) + 1);
    }
    assert.ok(
      Math.max(...originCounts.values()) <= Math.ceil(table.members.length / 2),
    );
    for (let left = 0; left < table.members.length; left += 1) {
      for (let right = left + 1; right < table.members.length; right += 1) {
        totalPairs += 1;
        if (
          origin.get(table.members[left]!.participantId) ===
          origin.get(table.members[right]!.participantId)
        ) {
          repeatedPairs += 1;
        }
      }
    }
  }
  assert.ok(repeatedPairs / totalPairs <= 0.34);
});
