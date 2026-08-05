import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { createConfiguredEventOperationsAiProvider } from "../features/events/event-operations/ai-provider";
import type {
  EventOperationsAiProvider,
  EventOperationsGroupingFeature,
  EventOperationsParticipant,
  EventOperationsParticipantRecommendations,
} from "../features/events/event-operations/contract";
import { createEventOperationsPostgresClient } from "../features/events/event-operations/storage/postgres-client";
import { createPostgresEventOperationsRepository } from "../features/events/event-operations/storage/postgres-repository";
import { hashEvaluationValue } from "./evaluate-event-operations-recommendations";
import { loadLocalEnv } from "./load-local-env";

export interface GroupingGateOptions {
  concurrency: number;
  execute: boolean;
  generationId: string;
  rounds: number;
}

export function parseGroupingGateOptions(args: readonly string[]): GroupingGateOptions {
  const value = (name: string) => {
    const index = args.indexOf(`--${name}`);
    return index >= 0 ? args[index + 1] : undefined;
  };
  const generationId = value("generation-id")?.trim();
  const concurrency = Number(value("concurrency") ?? 8);
  const rounds = Number(value("rounds") ?? 5);
  if (!generationId) throw new Error("--generation-id is required.");
  if (!Number.isInteger(concurrency) || concurrency < 1) {
    throw new Error("--concurrency must be a positive integer.");
  }
  if (!Number.isInteger(rounds) || rounds < 1) {
    throw new Error("--rounds must be a positive integer.");
  }
  return {
    concurrency,
    execute: args.includes("--execute"),
    generationId,
    rounds,
  };
}

export function validateGroupingGateOutput(input: {
  allowedTargetIdsBySource: ReadonlyMap<string, ReadonlySet<string>>;
  maxAffinityCount: number;
  participantIds: readonly string[];
  value: readonly EventOperationsGroupingFeature[];
}): string | null {
  const expected = new Set(input.participantIds);
  const seen = new Set<string>();
  if (input.value.length !== expected.size) return "source_count";
  for (const feature of input.value) {
    const affinities = new Set(feature.affinityParticipantIds);
    if (!expected.has(feature.participantId)) return "unknown_source";
    if (seen.has(feature.participantId)) return "duplicate_source";
    if (
      !feature.primaryTopic.trim() ||
      !feature.secondaryTopic.trim() ||
      !feature.facilitationHint.trim()
    ) return "empty_text";
    if (feature.affinityParticipantIds.length > input.maxAffinityCount) {
      return "affinity_limit";
    }
    if (affinities.size !== feature.affinityParticipantIds.length) {
      return "duplicate_affinity";
    }
    if (feature.affinityParticipantIds.some((participantId) =>
      participantId === feature.participantId ||
      !input.allowedTargetIdsBySource.get(feature.participantId)?.has(participantId))) {
      return "affinity_outside_shortlist";
    }
    seen.add(feature.participantId);
  }
  return null;
}

async function mapRolling<TValue, TResult>(
  values: readonly TValue[],
  concurrency: number,
  operation: (value: TValue) => Promise<TResult>,
): Promise<readonly TResult[]> {
  const results = new Array<TResult>(values.length);
  let cursor = 0;
  await Promise.all(
    Array.from({ length: Math.min(concurrency, values.length) }, async () => {
      for (;;) {
        const index = cursor;
        cursor += 1;
        if (index >= values.length) return;
        results[index] = await operation(values[index]!);
      }
    }),
  );
  return results;
}

type GroupingRequest = Parameters<EventOperationsAiProvider["generateGroupingFeatures"]>[0];

async function evaluateGroupingRequest(input: {
  allowedTargetIdsBySource: ReadonlyMap<string, ReadonlySet<string>>;
  maxAttempts: number;
  participantIds: readonly string[];
  provider: EventOperationsAiProvider;
  request: GroupingRequest;
}) {
  const attempts = [];
  const logicalStarted = performance.now();
  for (let attemptOrdinal = 1; attemptOrdinal <= input.maxAttempts; attemptOrdinal += 1) {
    const started = performance.now();
    const result = await input.provider.generateGroupingFeatures(input.request);
    const durationMs = performance.now() - started;
    if (result.success === false) {
      attempts.push({
        attemptOrdinal,
        completionTokens: result.responseMetadata?.usage?.completionTokens ?? null,
        durationMs,
        errorCode: result.error.code,
        finishReason: result.responseMetadata?.finishReason ?? null,
        jsonFailureShape: result.error.jsonFailureShape ?? null,
        overallBusinessValid: false,
        promptTokens: result.responseMetadata?.usage?.promptTokens ?? null,
        providerResponseBytes: result.responseMetadata?.providerResponseBytes ?? null,
        retryable: result.retryable === true,
        validationReason: null,
      });
      if (result.retryable !== true || attemptOrdinal === input.maxAttempts) break;
      await new Promise<void>((resolveDelay) =>
        setTimeout(resolveDelay, 250 + Math.floor(Math.random() * 751)));
      continue;
    }
    const validationReason = validateGroupingGateOutput({
      allowedTargetIdsBySource: input.allowedTargetIdsBySource,
      maxAffinityCount: input.request.maxAffinityCount,
      participantIds: input.participantIds,
      value: result.data,
    });
    attempts.push({
      attemptOrdinal,
      completionTokens: result.responseMetadata?.usage?.completionTokens ?? null,
      durationMs,
      errorCode: validationReason ? "EVENT_OPERATIONS_AI_SCHEMA_INVALID" : null,
      finishReason: result.responseMetadata?.finishReason ?? null,
      jsonFailureShape: null,
      overallBusinessValid: validationReason === null,
      promptTokens: result.responseMetadata?.usage?.promptTokens ?? null,
      providerResponseBytes: result.responseMetadata?.providerResponseBytes ?? null,
      retryable: false,
      validationReason,
    });
    break;
  }
  const final = attempts.at(-1)!;
  return {
    attemptCount: attempts.length,
    attempts,
    finalValid: final.overallBusinessValid,
    recoveredByRetry: final.overallBusinessValid && attempts.length > 1,
    totalDurationMs: performance.now() - logicalStarted,
    totalTokens: attempts.reduce(
      (total, attempt) =>
        total + (attempt.promptTokens ?? 0) + (attempt.completionTokens ?? 0),
      0,
    ),
  };
}

async function main(): Promise<void> {
  loadLocalEnv();
  const options = parseGroupingGateOptions(process.argv.slice(2));
  const databaseUrl = process.env.ORBIT_EVENT_DATABASE_URL;
  if (!databaseUrl) throw new Error("ORBIT_EVENT_DATABASE_URL is required.");
  const client = createEventOperationsPostgresClient({ connectionString: databaseUrl });
  try {
    const repository = createPostgresEventOperationsRepository({
      client,
      workspaceId: process.env.ORBIT_WORKSPACE_ID ?? "workspace:default",
    });
    const generation = await repository.getGeneration(options.generationId);
    if (!generation || generation.status === "queued" || generation.status === "running") {
      throw new Error("A frozen settled generation is required.");
    }
    const participantIds = generation.snapshot.participants.map(
      (participant) => participant.participantId,
    );
    const [configuration, tasks, candidates] = await Promise.all([
      repository.getGenerationConfiguration(options.generationId),
      repository.listTasks(options.generationId),
      repository.listCandidates(options.generationId, participantIds),
    ]);
    if (!configuration || tasks.some((task) => task.status === "running")) {
      throw new Error("Configuration or lease precondition failed.");
    }
    const stateBefore = hashEvaluationValue({ candidates, configuration, generation, tasks });
    const participantById = new Map(
      generation.snapshot.participants.map((participant) =>
        [participant.participantId, participant] as const),
    );
    const recommendations = tasks.flatMap((task) =>
      task.output?.kind === "recommendation_shard"
        ? task.output.recommendations
        : [],
    );
    const recommendationBySource = new Map(
      recommendations.map((row) => [row.sourceParticipantId, row] as const),
    );
    const groupingTasks = tasks
      .filter((task) => task.kind === "grouping_feature_shard")
      .sort((left, right) => left.taskId.localeCompare(right.taskId));
    const built = groupingTasks.map((task) => {
      const allowedTargetIdsBySource = new Map<string, ReadonlySet<string>>();
      const sources = task.participantIds.map((participantId) => {
        const sourceParticipant = participantById.get(participantId);
        const recommendation = recommendationBySource.get(participantId);
        const sourceCandidates = candidates.filter(
          (candidate) => candidate.sourceParticipantId === participantId,
        );
        const candidateParticipants = sourceCandidates.flatMap((candidate) => {
          const participant = participantById.get(candidate.targetParticipantId);
          return participant ? [participant] : [];
        });
        if (!sourceParticipant || !recommendation) {
          throw new Error("A grouping request dependency is missing.");
        }
        allowedTargetIdsBySource.set(
          participantId,
          new Set(sourceCandidates.map((candidate) => candidate.targetParticipantId)),
        );
        return { candidateParticipants, recommendations: recommendation, sourceParticipant };
      });
      return {
        allowedTargetIdsBySource,
        participantIds: task.participantIds,
        request: {
          eventId: generation.eventId,
          maxAffinityCount: Math.min(4, Math.max(1, configuration.recommendationCount)),
          sources,
        },
        taskId: task.taskId,
      };
    });
    const sourceCounts = built.map((item) => item.request.sources.length).sort((a, b) => a - b);
    if (
      generation.snapshot.participants.length !== 64 ||
      built.length !== 11 ||
      sourceCounts.join(",") !== [4, ...Array.from({ length: 10 }, () => 6)].join(",") ||
      built.some((item) => item.request.sources.some(
        (source) => source.candidateParticipants.length !== 16)) ||
      recommendations.length !== 64
    ) {
      throw new Error("Frozen grouping topology precondition failed.");
    }
    const provider = createConfiguredEventOperationsAiProvider({ requestTimeoutMs: 90_000 });
    const logical = Array.from(
      { length: options.rounds },
      (_, roundIndex) => built.map((item) => ({ ...item, round: roundIndex + 1 })),
    ).flat();
    const results = options.execute
      ? await mapRolling(logical, options.concurrency, async (item) => ({
          ...(await evaluateGroupingRequest({
            allowedTargetIdsBySource: item.allowedTargetIdsBySource,
            maxAttempts: configuration.maxAttemptsPerTask,
            participantIds: item.participantIds,
            provider,
            request: item.request,
          })),
          requestHash: hashEvaluationValue(item.request),
          round: item.round,
          taskId: item.taskId,
        }))
      : logical.map((item) => ({
          attemptCount: 0,
          attempts: [],
          finalValid: null,
          recoveredByRetry: null,
          requestHash: hashEvaluationValue(item.request),
          round: item.round,
          taskId: item.taskId,
          totalDurationMs: 0,
          totalTokens: 0,
        }));
    const [generationAfter, configurationAfter, tasksAfter, candidatesAfter] =
      await Promise.all([
        repository.getGeneration(options.generationId),
        repository.getGenerationConfiguration(options.generationId),
        repository.listTasks(options.generationId),
        repository.listCandidates(options.generationId, participantIds),
      ]);
    if (
      !generationAfter ||
      !configurationAfter ||
      hashEvaluationValue({
        candidates: candidatesAfter,
        configuration: configurationAfter,
        generation: generationAfter,
        tasks: tasksAfter,
      }) !== stateBefore
    ) {
      throw new Error("Read-only state changed.");
    }
    const safeBase = {
      requestFingerprintHash: hashEvaluationValue(provider.requestFingerprint ?? ""),
      stateStable: true,
    } as const;
    for (const result of results) {
      process.stdout.write(`${JSON.stringify({ ...safeBase, ...result })}\n`);
    }
    if (options.execute && results.some((result) => result.finalValid !== true)) {
      process.exitCode = 1;
    }
  } finally {
    await client.close();
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  void main().catch(() => {
    process.stderr.write("Grouping gate failed.\n");
    process.exitCode = 1;
  });
}
