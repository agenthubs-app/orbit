import { createHash } from "node:crypto";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  type EventOperationsAiProvider,
  type EventOperationsCandidate,
  type EventOperationsConfiguration,
  type EventOperationsGeneration,
  type EventOperationsGenerationTask,
  type EventOperationsJsonFailureShape,
  type EventOperationsParticipant,
} from "../features/events/event-operations/contract";
import { createEventOperationsAiProvider } from "../features/events/event-operations/ai-provider";
import {
  RecommendationValidationError,
  type RecommendationValidationReason,
  validateRecommendations,
} from "../features/events/event-operations/recommendation-validation";
import { createEventOperationsPostgresClient } from "../features/events/event-operations/storage/postgres-client";
import { createPostgresEventOperationsRepository } from "../features/events/event-operations/storage/postgres-repository";
import { loadLocalEnv } from "./load-local-env";

export interface EvaluationOptions {
  concurrency: number;
  execute: boolean;
  generationId: string;
  requestTimeoutMs: number;
  rounds: number;
  temperatures: readonly number[];
}

export interface EvaluationPairBlock<TSource> {
  children: readonly (readonly TSource[])[];
  pairBlockOrdinal: number;
  sources: readonly TSource[];
  taskId: string;
}

export interface EvaluationScheduledShard<TSource> {
  armShardSize: 3 | 6;
  childCount: number;
  childIndex: number;
  pairBlockOrdinal: number;
  round: number;
  scheduleOrdinal: number;
  sources: readonly TSource[];
  taskId: string;
}

export interface EvaluationTaskRecord {
  candidateCount: number;
  requestContentHash: string;
  requestHash: string;
  sourceCount: number;
  taskHash: string;
  taskOrdinal: number;
}

export interface EvaluationExecutionResult {
  adapterDurationMs: number;
  adapterOutcome: "failed" | "not-run" | "succeeded";
  cacheHitTokens: number | null;
  completionTokens: number | null;
  domainValidation: "failed" | "not-run" | "passed";
  domainValidationDurationMs: number;
  errorCode: string | null;
  finishReason: string | null;
  messageCategory: string | null;
  jsonFailureShape: EventOperationsJsonFailureShape | null;
  overallBusinessValid: boolean;
  promptTokens: number | null;
  providerResponseBytes: number | null;
  reasoningTokens: number | null;
  totalDurationMs: number;
  validationReason: RecommendationValidationReason | null;
}

interface BuiltRecommendationTask {
  allowedTargetIdsBySource: ReadonlyMap<string, ReadonlySet<string>>;
  participantIds: readonly string[];
  record: EvaluationTaskRecord;
  request: Parameters<EventOperationsAiProvider["generateRecommendations"]>[0];
  taskId: string;
}

export function parseEvaluationOptions(args: readonly string[]): EvaluationOptions {
  const values = new Map<string, string>();
  for (let index = 0; index < args.length; index += 1) {
    const key = args[index];
    if (!key?.startsWith("--")) continue;
    const nextValue = args[index + 1];
    const value = nextValue?.startsWith("--") || nextValue === undefined ? "true" : nextValue;
    values.set(key.slice(2), value);
    if (value === nextValue) index += 1;
  }
  const generationId = values.get("generation-id")?.trim();
  if (!generationId) throw new Error("--generation-id is required.");
  const numberValue = (key: string, fallback: number) => {
    const value = Number(values.get(key) ?? fallback);
    if (!Number.isInteger(value) || value < 1) throw new Error(`--${key} must be a positive integer.`);
    return value;
  };
  const temperatures = (values.get("temperatures") ?? "0.2")
    .split(",")
    .map((value) => Number(value.trim()));
  if (!temperatures.length || temperatures.some((value) => !Number.isFinite(value) || value < 0 || value > 2)) {
    throw new Error("--temperatures must be comma-separated numbers from 0 through 2.");
  }
  if (temperatures.length !== 1 || temperatures[0] !== 0.2) {
    throw new Error("The paired shard experiment requires exactly --temperatures 0.2.");
  }
  const rawTaskOrdinals = values.get("task-ordinals")?.split(",").map((value) => value.trim());
  if (rawTaskOrdinals?.some((value) => !/^[1-9]\d*$/u.test(value))) {
    throw new Error("--task-ordinals must be comma-separated positive integers.");
  }
  if (rawTaskOrdinals !== undefined) {
    throw new Error("The paired shard experiment does not allow --task-ordinals; it requires full 64-source coverage.");
  }
  const rounds = numberValue("rounds", 3);
  if (rounds !== 3) throw new Error("The paired shard experiment requires exactly --rounds 3.");
  return {
    concurrency: numberValue("concurrency", 8),
    execute: values.get("execute") === "true",
    generationId,
    requestTimeoutMs: numberValue("request-timeout-ms", 90_000),
    rounds,
    temperatures,
  };
}

function stableEvaluationValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stableEvaluationValue);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => [key, stableEvaluationValue(item)]),
  );
}

/** Stable identifier for logs; never emit prompt, response, or participant text. */
export function hashEvaluationValue(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(stableEvaluationValue(value))).digest("hex");
}

export function selectEvaluationTasks<T extends { record: EvaluationTaskRecord }>(
  tasks: readonly T[],
  taskOrdinals?: readonly number[],
): readonly T[] {
  if (!taskOrdinals) return tasks;
  const byOrdinal = new Map(tasks.map((task) => [task.record.taskOrdinal, task]));
  for (const taskOrdinal of taskOrdinals) {
    if (!byOrdinal.has(taskOrdinal)) throw new Error(`Unknown recommendation task ordinal: ${taskOrdinal}.`);
  }
  const requested = new Set(taskOrdinals);
  return tasks.filter((task) => requested.has(task.record.taskOrdinal));
}

/** Stable PG task blocks, retaining source order and splitting only within each block. */
export function createEvaluationPairBlocks<TSource>(
  tasks: readonly { sources: readonly TSource[]; taskId: string }[],
): readonly EvaluationPairBlock<TSource>[] {
  return [...tasks]
    .sort((left, right) => left.taskId.localeCompare(right.taskId))
    .map((task, index) => ({
      children: Array.from({ length: Math.ceil(task.sources.length / 3) }, (_, childIndex) =>
        task.sources.slice(childIndex * 3, childIndex * 3 + 3),
      ),
      pairBlockOrdinal: index + 1,
      sources: task.sources,
      taskId: task.taskId,
    }));
}

/** Rotates S6, S3a, S3b start order by round and pair-block ordinal. */
export function createPairedShardSchedule<TSource>(
  tasks: readonly { sources: readonly TSource[]; taskId: string }[],
  rounds = 3,
): readonly EvaluationScheduledShard<TSource>[] {
  if (rounds !== 3) throw new Error("The paired shard experiment requires exactly three rounds.");
  const scheduled: EvaluationScheduledShard<TSource>[] = [];
  for (let round = 1; round <= rounds; round += 1) {
    for (const block of createEvaluationPairBlocks(tasks)) {
      if (block.children.length !== 2) {
        throw new Error("Every paired shard block must split into exactly two size-3 children.");
      }
      const triad: Omit<EvaluationScheduledShard<TSource>, "scheduleOrdinal">[] = [
        { armShardSize: 6, childCount: 1, childIndex: 1, pairBlockOrdinal: block.pairBlockOrdinal, round, sources: block.sources, taskId: block.taskId },
        ...block.children.map((sources, childIndex) => ({
          armShardSize: 3 as const,
          childCount: block.children.length,
          childIndex: childIndex + 1,
          pairBlockOrdinal: block.pairBlockOrdinal,
          round,
          sources,
          taskId: block.taskId,
        })),
      ];
      const start = (round + block.pairBlockOrdinal) % triad.length;
      for (let offset = 0; offset < triad.length; offset += 1) {
        scheduled.push({ ...triad[(start + offset) % triad.length]!, scheduleOrdinal: scheduled.length + 1 });
      }
    }
  }
  return scheduled;
}

function buildRecommendationTasks(input: {
  aiRequestFingerprint: string;
  candidates: readonly EventOperationsCandidate[];
  configuration: Pick<EventOperationsConfiguration, "recommendationCount">;
  eventId: string;
  participants: readonly EventOperationsParticipant[];
  tasks: readonly EventOperationsGenerationTask[];
}): readonly BuiltRecommendationTask[] {
  const participantById = new Map(input.participants.map((participant) => [participant.participantId, participant]));
  const candidates = [...input.candidates].sort(
    (left, right) =>
      left.sourceParticipantId.localeCompare(right.sourceParticipantId) ||
      left.retrievalRank - right.retrievalRank,
  );
  return input.tasks
    .filter((task) => task.kind === "recommendation_shard")
    .sort((left, right) => left.taskId.localeCompare(right.taskId))
    .map((task, taskOrdinal) => {
      const taskCandidates = candidates.filter((candidate) => task.participantIds.includes(candidate.sourceParticipantId));
      const allowedTargetIdsBySource = new Map<string, ReadonlySet<string>>();
      const request = {
        eventId: input.eventId,
        recommendationCount: input.configuration.recommendationCount,
        sources: task.participantIds.map((participantId) => {
          const sourceCandidates = taskCandidates.filter((candidate) => candidate.sourceParticipantId === participantId);
          allowedTargetIdsBySource.set(
            participantId,
            new Set(sourceCandidates.map((candidate) => candidate.targetParticipantId)),
          );
          return {
            candidateParticipants: sourceCandidates.flatMap((candidate) => {
              const participant = participantById.get(candidate.targetParticipantId);
              return participant ? [participant] : [];
            }),
            sourceParticipant: participantById.get(participantId)!,
          };
        }),
      };
      return {
        allowedTargetIdsBySource,
        participantIds: task.participantIds,
        record: {
          candidateCount: taskCandidates.length,
          requestContentHash: hashEvaluationValue(request),
          requestHash: hashEvaluationValue({ aiRequestFingerprint: input.aiRequestFingerprint, request }),
          sourceCount: task.participantIds.length,
          taskHash: hashEvaluationValue(task.taskId),
          taskOrdinal: taskOrdinal + 1,
        },
        request,
        taskId: task.taskId,
      };
    });
}

/** Reconstructs hashes for the same recommendation-shard inputs as the worker. */
export function createRecommendationTaskEvaluationRecords(input: {
  aiRequestFingerprint: string;
  candidates: readonly EventOperationsCandidate[];
  eventId: string;
  participants: readonly EventOperationsParticipant[];
  recommendationCount: number;
  tasks: readonly EventOperationsGenerationTask[];
}): readonly EvaluationTaskRecord[] {
  return buildRecommendationTasks({
    ...input,
    configuration: { recommendationCount: input.recommendationCount },
  }).map((task) => task.record);
}

function emptyTelemetry(): EvaluationExecutionResult {
  return {
    adapterDurationMs: 0,
    adapterOutcome: "failed",
    cacheHitTokens: null,
    completionTokens: null,
    domainValidation: "not-run",
    domainValidationDurationMs: 0,
    errorCode: null,
    finishReason: null,
    messageCategory: null,
    jsonFailureShape: null,
    overallBusinessValid: false,
    promptTokens: null,
    providerResponseBytes: null,
    reasoningTokens: null,
    totalDurationMs: 0,
    validationReason: null,
  };
}

function responseTelemetry(result: Awaited<ReturnType<EventOperationsAiProvider["generateRecommendations"]>>) {
  const metadata = result.responseMetadata;
  return {
    cacheHitTokens: metadata?.usage?.cacheHitTokens ?? null,
    completionTokens: metadata?.usage?.completionTokens ?? null,
    finishReason: metadata?.finishReason ?? null,
    promptTokens: metadata?.usage?.promptTokens ?? null,
    providerResponseBytes: metadata?.providerResponseBytes ?? null,
    reasoningTokens: metadata?.usage?.reasoningTokens ?? null,
  };
}

/** Executes a single adapter call and the identical domain validation used by the worker. */
export async function evaluateRecommendationTask(input: {
  provider: Pick<EventOperationsAiProvider, "generateRecommendations">;
  recommendationCount: number;
  snapshotParticipants: readonly EventOperationsParticipant[];
  task: BuiltRecommendationTask;
}): Promise<EvaluationExecutionResult> {
  const startedAt = performance.now();
  let result: Awaited<ReturnType<EventOperationsAiProvider["generateRecommendations"]>>;
  try {
    result = await input.provider.generateRecommendations(input.task.request);
  } catch {
    return {
      ...emptyTelemetry(),
      adapterDurationMs: performance.now() - startedAt,
      errorCode: "ADAPTER_EXCEPTION",
      messageCategory: "adapter-exception",
      totalDurationMs: performance.now() - startedAt,
    };
  }
  const adapterDurationMs = performance.now() - startedAt;
  if (result.success === false) {
    return {
      ...emptyTelemetry(),
      ...responseTelemetry(result),
      adapterDurationMs,
      errorCode: result.error.code,
      jsonFailureShape: result.error.jsonFailureShape ?? null,
      messageCategory: `adapter-${result.error.code.toLowerCase()}`,
      totalDurationMs: adapterDurationMs,
    };
  }
  const validationStartedAt = performance.now();
  try {
    validateRecommendations({
      allowedTargetIdsBySource: input.task.allowedTargetIdsBySource,
      participantIds: input.task.participantIds,
      recommendationCount: input.recommendationCount,
      snapshotParticipants: input.snapshotParticipants,
      value: result.data,
    });
    return {
      ...emptyTelemetry(),
      ...responseTelemetry(result),
      adapterDurationMs,
      adapterOutcome: "succeeded",
      domainValidation: "passed",
      domainValidationDurationMs: performance.now() - validationStartedAt,
      overallBusinessValid: true,
      totalDurationMs: performance.now() - startedAt,
    };
  } catch (error) {
    return {
      ...emptyTelemetry(),
      ...responseTelemetry(result),
      adapterDurationMs,
      adapterOutcome: "succeeded",
      domainValidation: "failed",
      domainValidationDurationMs: performance.now() - validationStartedAt,
      errorCode: error instanceof RecommendationValidationError ? error.code : "DOMAIN_VALIDATION_EXCEPTION",
      messageCategory: error instanceof RecommendationValidationError ? "domain-validation" : "domain-validation-exception",
      totalDurationMs: performance.now() - startedAt,
      validationReason: error instanceof RecommendationValidationError ? error.reason : null,
    };
  }
}

export function redactEvaluationRecord(input: {
  candidateCount: number;
  generationId: string;
  requestFingerprint: string;
  snapshotHash: string;
  taskCount: number;
}) {
  return {
    candidateCount: input.candidateCount,
    generationHash: hashEvaluationValue(input.generationId),
    requestFingerprintHash: hashEvaluationValue(input.requestFingerprint),
    snapshotHash: input.snapshotHash,
    taskCount: input.taskCount,
  };
}

function evaluationStateHash(input: {
  candidates: readonly EventOperationsCandidate[];
  configuration: EventOperationsConfiguration;
  generation: EventOperationsGeneration;
  tasks: readonly EventOperationsGenerationTask[];
}) {
  return hashEvaluationValue(input);
}

async function mapWithConcurrency<T, TResult>(
  values: readonly T[],
  concurrency: number,
  evaluate: (value: T) => Promise<TResult>,
): Promise<readonly TResult[]> {
  const results = new Array<TResult>(values.length);
  let nextIndex = 0;
  await Promise.all(Array.from({ length: Math.min(concurrency, values.length) }, async () => {
    while (nextIndex < values.length) {
      const index = nextIndex;
      nextIndex += 1;
      results[index] = await evaluate(values[index]!);
    }
  }));
  return results;
}

export function interleaveEvaluationArms<T>(
  arms: readonly (readonly T[])[],
  rounds: number,
): readonly { armIndex: number; round: number; value: T }[] {
  if (arms.length === 0) return [];
  const shardCount = arms[0]!.length;
  if (arms.some((arm) => arm.length !== shardCount)) {
    throw new Error("Every evaluation arm must contain the same shard set.");
  }
  const planned: { armIndex: number; round: number; value: T }[] = [];
  for (let roundIndex = 0; roundIndex < rounds; roundIndex += 1) {
    for (let shardIndex = 0; shardIndex < shardCount; shardIndex += 1) {
      for (let offset = 0; offset < arms.length; offset += 1) {
        const armIndex = (roundIndex + shardIndex + offset) % arms.length;
        planned.push({
          armIndex,
          round: roundIndex + 1,
          value: arms[armIndex]![shardIndex]!,
        });
      }
    }
  }
  return planned;
}

function derivePairedEvaluationTask(input: {
  aiRequestFingerprint: string;
  base: BuiltRecommendationTask;
  sources: Parameters<EventOperationsAiProvider["generateRecommendations"]>[0]["sources"];
}): BuiltRecommendationTask {
  const participantIds = input.sources.map((source) => source.sourceParticipant.participantId);
  const request = { ...input.base.request, sources: input.sources };
  return {
    allowedTargetIdsBySource: new Map(
      participantIds.map((participantId) => [participantId, input.base.allowedTargetIdsBySource.get(participantId) ?? new Set<string>()]),
    ),
    participantIds,
    record: {
      candidateCount: input.sources.reduce((count, source) => count + source.candidateParticipants.length, 0),
      requestContentHash: hashEvaluationValue(request),
      requestHash: hashEvaluationValue({ aiRequestFingerprint: input.aiRequestFingerprint, request }),
      sourceCount: input.sources.length,
      taskHash: input.base.record.taskHash,
      taskOrdinal: input.base.record.taskOrdinal,
    },
    request,
    taskId: input.base.taskId,
  };
}

function assertPairedExperimentInput(input: {
  pairBlocks: readonly EvaluationPairBlock<Parameters<EventOperationsAiProvider["generateRecommendations"]>[0]["sources"][number]>[];
  snapshotParticipants: readonly EventOperationsParticipant[];
  schedule: readonly EvaluationScheduledShard<Parameters<EventOperationsAiProvider["generateRecommendations"]>[0]["sources"][number]>[];
}): void {
  const sourceIds = input.pairBlocks.flatMap((block) => block.sources.map((source) => source.sourceParticipant.participantId));
  const snapshotIds = new Set(input.snapshotParticipants.map((participant) => participant.participantId));
  if (sourceIds.length !== 64 || snapshotIds.size !== 64 || new Set(sourceIds).size !== 64 || sourceIds.some((sourceId) => !snapshotIds.has(sourceId))) {
    throw new Error("The paired shard experiment requires 64 sources exactly once.");
  }
  if (input.schedule.length !== 99) throw new Error("The paired shard experiment requires exactly 99 planned calls.");
  for (const block of input.pairBlocks) {
    if (block.sources.some((source) => source.candidateParticipants.length !== 16)) {
      throw new Error("The paired shard experiment requires exactly 16 candidates for every source.");
    }
    const expectedCandidates = new Map(
      block.sources.map((source) => [source.sourceParticipant.participantId, source.candidateParticipants.map((candidate) => candidate.participantId)]),
    );
    for (const child of block.children) {
      for (const source of child) {
        const expected = expectedCandidates.get(source.sourceParticipant.participantId) ?? [];
        const actual = source.candidateParticipants.map((candidate) => candidate.participantId);
        if (expected.length !== actual.length || expected.some((candidateId, index) => candidateId !== actual[index])) {
          throw new Error("The paired shard experiment changed a source candidate shortlist.");
        }
      }
    }
  }
}

async function main(): Promise<void> {
  loadLocalEnv();
  const options = parseEvaluationOptions(process.argv.slice(2));
  const databaseUrl = process.env.ORBIT_EVENT_DATABASE_URL;
  if (!databaseUrl) throw new Error("ORBIT_EVENT_DATABASE_URL is required.");
  const client = createEventOperationsPostgresClient({ connectionString: databaseUrl });
  try {
    const repository = createPostgresEventOperationsRepository({
      client,
      workspaceId: process.env.ORBIT_WORKSPACE_ID ?? "workspace:default",
    });
    const generation = await repository.getGeneration(options.generationId);
    if (!generation) throw new Error("Generation was not found.");
    if (generation.status === "queued" || generation.status === "running") {
      throw new Error("The paired shard experiment requires a settled generation.");
    }
    const [configuration, tasks, candidates] = await Promise.all([
      repository.getGenerationConfiguration(generation.generationId),
      repository.listTasks(generation.generationId),
      repository.listCandidates(generation.generationId, generation.snapshot.participants.map((participant) => participant.participantId)),
    ]);
    if (!configuration) throw new Error("Generation configuration was not found.");
    if (tasks.some((task) => task.status === "running" || task.leaseToken !== null)) {
      throw new Error("The paired shard experiment requires every generation task lease to be inactive.");
    }
    const stateHashBefore = evaluationStateHash({ candidates, configuration, generation, tasks });
    const base = redactEvaluationRecord({
      candidateCount: candidates.length,
      generationId: generation.generationId,
      requestFingerprint: generation.aiRequestFingerprint,
      snapshotHash: generation.snapshot.hash,
      taskCount: tasks.filter((task) => task.kind === "recommendation_shard").length,
    });
    const temperature = options.temperatures[0]!;
    const provider = createEventOperationsAiProvider({
      config: {
        deepseekThinking: false,
        jsonOutput: true,
        maxTokens: 8192,
        provider: "deepseek",
        requestTimeoutMs: options.requestTimeoutMs,
        temperature,
      },
    });
    const builtTasks = buildRecommendationTasks({
        aiRequestFingerprint: provider.requestFingerprint ?? "",
        candidates,
        configuration,
        eventId: generation.eventId,
        participants: generation.snapshot.participants,
        tasks,
      });
    const baseByTaskId = new Map(builtTasks.map((task) => [task.taskId, task]));
    const pairInputs = builtTasks.map((task) => ({ taskId: task.taskId, sources: task.request.sources }));
    const pairBlocks = createEvaluationPairBlocks(pairInputs);
    const schedule = createPairedShardSchedule(pairInputs, options.rounds);
    assertPairedExperimentInput({
      pairBlocks,
      schedule,
      snapshotParticipants: generation.snapshot.participants,
    });
    const planned = schedule.map((scheduled) => {
      const baseTask = baseByTaskId.get(scheduled.taskId);
      if (!baseTask) throw new Error("The paired shard experiment lost a source block.");
      const task = derivePairedEvaluationTask({
        aiRequestFingerprint: provider.requestFingerprint ?? "",
        base: baseTask,
        sources: scheduled.sources,
      });
      return {
        ...scheduled,
        provider,
        task,
        temperature,
        virtualTaskHash: hashEvaluationValue({
          armShardSize: scheduled.armShardSize,
          childIndex: scheduled.childIndex,
          pairBlockOrdinal: scheduled.pairBlockOrdinal,
          request: task.request,
        }),
      };
    });
    const experimentStartedAt = performance.now();
    const executions = options.execute
      ? await mapWithConcurrency(planned, options.concurrency, async (item) => {
          const startedOffsetMs = performance.now() - experimentStartedAt;
          const telemetry = await evaluateRecommendationTask({
            provider: item.provider,
            recommendationCount: configuration.recommendationCount,
            snapshotParticipants: generation.snapshot.participants,
            task: item.task,
          });
          return { ...telemetry, finishedOffsetMs: performance.now() - experimentStartedAt, startedOffsetMs };
        })
      : planned.map(() => ({
          ...emptyTelemetry(),
          adapterOutcome: "not-run" as const,
          domainValidation: "not-run" as const,
          finishedOffsetMs: null,
          overallBusinessValid: false,
          startedOffsetMs: null,
        }));
    const pairedSize3BusinessValid = new Map<string, boolean>();
    for (const item of planned) {
      if (item.armShardSize !== 3) continue;
      const key = `${item.round}:${item.pairBlockOrdinal}`;
      const siblings = planned
        .map((candidate, candidateIndex) => ({ candidate, telemetry: executions[candidateIndex]! }))
        .filter(({ candidate }) =>
          candidate.armShardSize === 3 &&
          candidate.pairBlockOrdinal === item.pairBlockOrdinal &&
          candidate.round === item.round,
        );
      pairedSize3BusinessValid.set(key, siblings.length === 2 && siblings.every(({ telemetry }) => telemetry.overallBusinessValid));
    }
    const [generationAfter, configurationAfter, tasksAfter, candidatesAfter] = await Promise.all([
      repository.getGeneration(generation.generationId),
      repository.getGenerationConfiguration(generation.generationId),
      repository.listTasks(generation.generationId),
      repository.listCandidates(generation.generationId, generation.snapshot.participants.map((participant) => participant.participantId)),
    ]);
    if (!generationAfter || !configurationAfter) throw new Error("Generation state changed during evaluation.");
    const stateHashAfter = evaluationStateHash({
      candidates: candidatesAfter,
      configuration: configurationAfter,
      generation: generationAfter,
      tasks: tasksAfter,
    });
    if (stateHashAfter !== stateHashBefore) throw new Error("Generation state changed during the read-only evaluation.");
    for (const [index, item] of planned.entries()) {
      const telemetry = executions[index]!;
      process.stdout.write(`${JSON.stringify({
        ...base,
        ...item.task.record,
        ...telemetry,
        actualSourceCount: item.task.record.sourceCount,
        armShardSize: item.armShardSize,
        childCount: item.childCount,
        childIndex: item.childIndex,
        concurrency: options.concurrency,
        execute: options.execute,
        pairBlockOrdinal: item.pairBlockOrdinal,
        pairedSize3BusinessValid: options.execute && item.armShardSize === 3
          ? pairedSize3BusinessValid.get(`${item.round}:${item.pairBlockOrdinal}`) ?? false
          : null,
        requestTimeoutMs: options.requestTimeoutMs,
        overallBusinessValid: options.execute ? telemetry.overallBusinessValid : null,
        round: item.round,
        scheduleOrdinal: item.scheduleOrdinal,
        stateHashAfter,
        stateHashBefore,
        temperature: item.temperature,
        taskHash: item.armShardSize === 6 ? item.task.record.taskHash : null,
        virtualTaskHash: item.virtualTaskHash,
      })}\n`);
    }
  } finally {
    await client.close();
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  void main().catch((error: unknown) => {
    process.stderr.write(`${error instanceof Error ? error.message : "Evaluation failed."}\n`);
    process.exitCode = 1;
  });
}
