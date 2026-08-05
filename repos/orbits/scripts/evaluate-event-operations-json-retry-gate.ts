import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { createEventOperationsAiProvider } from "../features/events/event-operations/ai-provider";
import { createEventOperationsPostgresClient } from "../features/events/event-operations/storage/postgres-client";
import { createPostgresEventOperationsRepository } from "../features/events/event-operations/storage/postgres-repository";
import { buildRecommendationTasks, evaluateRecommendationTask, hashEvaluationValue, type BuiltRecommendationTask, type EvaluationExecutionResult } from "./evaluate-event-operations-recommendations";
import { loadLocalEnv } from "./load-local-env";

const RETRYABLE_JSON_SHAPES = new Set(["empty", "parse_syntax", "unterminated_envelope"]);

export interface JsonRetryOptions { concurrency: number; execute: boolean; generationId: string; rounds: number; }
export interface JsonRetryAttempt extends EvaluationExecutionResult {
  attemptOrdinal: number;
  retryDelayMsAfter: number | null;
}

export function parseJsonRetryOptions(args: readonly string[]): JsonRetryOptions {
  const value = (name: string) => {
    const index = args.indexOf(`--${name}`);
    return index >= 0 ? args[index + 1] : undefined;
  };
  const generationId = value("generation-id")?.trim();
  if (!generationId) throw new Error("--generation-id is required.");
  const concurrency = Number(value("concurrency") ?? 8);
  const rounds = Number(value("rounds") ?? 3);
  if (!Number.isInteger(concurrency) || concurrency < 1) throw new Error("--concurrency must be a positive integer.");
  if (!Number.isInteger(rounds) || rounds < 1) throw new Error("--rounds must be a positive integer.");
  return { concurrency, execute: args.includes("--execute"), generationId, rounds };
}

export function shouldRetryJsonAttempt(result: EvaluationExecutionResult): boolean {
  return result.errorCode === "AI_JSON_INVALID" && result.jsonFailureShape !== null && RETRYABLE_JSON_SHAPES.has(result.jsonFailureShape);
}

export async function runBoundedJsonRetry(input: {
  evaluate: () => Promise<EvaluationExecutionResult>;
  maxAttempts?: number;
  retryDelayMs?: () => number;
  sleep?: (delayMs: number) => Promise<void>;
}) {
  const attempts: JsonRetryAttempt[] = [];
  const started = performance.now();
  const maxAttempts = input.maxAttempts ?? 3;
  const retryDelayMs = input.retryDelayMs ?? (() => 250 + Math.floor(Math.random() * 751));
  const sleep = input.sleep ?? ((delayMs: number) => new Promise<void>((resolve) => setTimeout(resolve, delayMs)));
  for (let attemptOrdinal = 1; attemptOrdinal <= maxAttempts; attemptOrdinal += 1) {
    const result = await input.evaluate();
    attempts.push({ ...result, attemptOrdinal, retryDelayMsAfter: null });
    if (result.overallBusinessValid || !shouldRetryJsonAttempt(result)) break;
    if (attemptOrdinal < maxAttempts) {
      const delayMs = retryDelayMs();
      attempts[attempts.length - 1] = { ...attempts[attempts.length - 1]!, retryDelayMsAfter: delayMs };
      await sleep(delayMs);
    }
  }
  const final = attempts.at(-1)!;
  return {
    attemptCount: attempts.length,
    attempts,
    finalValid: final.overallBusinessValid,
    recoveredByRetry: final.overallBusinessValid && attempts.length > 1,
    totalDurationMs: performance.now() - started,
    totalTokens: attempts.reduce((total, attempt) => total + (attempt.promptTokens ?? 0) + (attempt.completionTokens ?? 0), 0),
  };
}

export async function mapRolling<T, TResult>(values: readonly T[], concurrency: number, evaluate: (value: T) => Promise<TResult>): Promise<readonly TResult[]> {
  const results = new Array<TResult>(values.length); let next = 0;
  await Promise.all(Array.from({ length: Math.min(concurrency, values.length) }, async () => {
    while (next < values.length) { const index = next; next += 1; results[index] = await evaluate(values[index]!); }
  }));
  return results;
}

async function main(): Promise<void> {
  loadLocalEnv(); const options = parseJsonRetryOptions(process.argv.slice(2));
  const databaseUrl = process.env.ORBIT_EVENT_DATABASE_URL; if (!databaseUrl) throw new Error("ORBIT_EVENT_DATABASE_URL is required.");
  const client = createEventOperationsPostgresClient({ connectionString: databaseUrl });
  try {
    const repository = createPostgresEventOperationsRepository({ client, workspaceId: process.env.ORBIT_WORKSPACE_ID ?? "workspace:default" });
    const generation = await repository.getGeneration(options.generationId); if (!generation || generation.status === "queued" || generation.status === "running") throw new Error("A frozen settled generation is required.");
    const [configuration, tasks, candidates] = await Promise.all([repository.getGenerationConfiguration(options.generationId), repository.listTasks(options.generationId), repository.listCandidates(options.generationId, generation.snapshot.participants.map((p) => p.participantId))]);
    if (!configuration || tasks.some((task) => task.status === "running" || task.leaseToken !== null)) throw new Error("Configuration or lease precondition failed.");
    const before = hashEvaluationValue({ candidates, configuration, generation, tasks });
    const built = buildRecommendationTasks({ aiRequestFingerprint: "json-retry-gate", candidates, configuration, eventId: generation.eventId, participants: generation.snapshot.participants, tasks });
    const sourceParticipantIds = built.flatMap((task) => task.participantIds);
    const sourceCounts = built.map((task) => task.request.sources.length).sort((left, right) => left - right);
    if (
      built.length !== 11 ||
      generation.snapshot.participants.length !== 64 ||
      sourceParticipantIds.length !== 64 ||
      new Set(sourceParticipantIds).size !== 64 ||
      sourceCounts.join(",") !== [4, ...Array.from({ length: 10 }, () => 6)].join(",") ||
      built.some((task) => task.request.sources.some((source) => source.candidateParticipants.length !== 16))
    ) throw new Error("Frozen S6 topology precondition failed.");
    const logical = Array.from({ length: options.rounds }, (_, round) => built.map((task) => ({ round: round + 1, task }))).flat();
    const results = options.execute ? await mapRolling(logical, options.concurrency, async ({ round, task }) => {
      const retry = await runBoundedJsonRetry({ evaluate: async () => {
        const provider = createEventOperationsAiProvider({ config: { deepseekThinking: false, jsonOutput: true, maxTokens: 8192, provider: "deepseek", requestTimeoutMs: 90_000, temperature: 0.2 } });
        return evaluateRecommendationTask({ provider, recommendationCount: configuration.recommendationCount, snapshotParticipants: generation.snapshot.participants, task });
      } });
      return { ...retry, requestHash: hashEvaluationValue(task.request), round, taskOrdinal: task.record.taskOrdinal };
    }) : logical.map(({ round, task }) => ({ attemptCount: 0, attempts: [], finalValid: null, recoveredByRetry: null, requestHash: hashEvaluationValue(task.request), round, taskOrdinal: task.record.taskOrdinal, totalDurationMs: 0, totalTokens: 0 }));
    const [after, afterConfig, afterTasks, afterCandidates] = await Promise.all([repository.getGeneration(options.generationId), repository.getGenerationConfiguration(options.generationId), repository.listTasks(options.generationId), repository.listCandidates(options.generationId, generation.snapshot.participants.map((p) => p.participantId))]);
    if (!after || !afterConfig || hashEvaluationValue({ candidates: afterCandidates, configuration: afterConfig, generation: after, tasks: afterTasks }) !== before) throw new Error("Read-only state changed.");
    for (const result of results) process.stdout.write(`${JSON.stringify(result)}\n`);
    if (options.execute && results.some((result) => result.finalValid !== true)) process.exitCode = 1;
  } finally { await client.close(); }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) void main().catch(() => { process.stderr.write("JSON retry gate failed.\n"); process.exitCode = 1; });
