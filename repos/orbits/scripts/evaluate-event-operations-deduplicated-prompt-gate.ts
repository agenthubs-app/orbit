import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { createEventOperationsAiProvider } from "../features/events/event-operations/ai-provider";
import { createEventOperationsPostgresClient } from "../features/events/event-operations/storage/postgres-client";
import { createPostgresEventOperationsRepository } from "../features/events/event-operations/storage/postgres-repository";
import {
  buildRecommendationTasks,
  evaluateRecommendationTask,
  hashEvaluationValue,
} from "./evaluate-event-operations-recommendations";
import { mapRolling } from "./evaluate-event-operations-json-retry-gate";
import { loadLocalEnv } from "./load-local-env";

export interface DeduplicatedPromptGateOptions {
  concurrency: number;
  execute: boolean;
  generationId: string;
  rounds: number;
}

export function parseDeduplicatedPromptGateOptions(
  args: readonly string[],
): DeduplicatedPromptGateOptions {
  const value = (name: string) => {
    const index = args.indexOf(`--${name}`);
    return index >= 0 ? args[index + 1] : undefined;
  };
  const generationId = value("generation-id")?.trim();
  const concurrency = Number(value("concurrency") ?? 8);
  const rounds = Number(value("rounds") ?? 3);
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

async function main(): Promise<void> {
  loadLocalEnv();
  const options = parseDeduplicatedPromptGateOptions(process.argv.slice(2));
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
    const [configuration, tasks, candidates] = await Promise.all([
      repository.getGenerationConfiguration(options.generationId),
      repository.listTasks(options.generationId),
      repository.listCandidates(
        options.generationId,
        generation.snapshot.participants.map((participant) => participant.participantId),
      ),
    ]);
    if (!configuration || tasks.some((task) => task.status === "running" || task.leaseToken !== null)) {
      throw new Error("Configuration or lease precondition failed.");
    }
    const stateHashBefore = hashEvaluationValue({ candidates, configuration, generation, tasks });
    const provider = createEventOperationsAiProvider({
      config: {
        deepseekThinking: false,
        jsonOutput: true,
        maxTokens: 8192,
        provider: "deepseek",
        requestTimeoutMs: 90_000,
        temperature: 0.2,
      },
      recommendationPromptEncoding: "deduplicated",
    });
    const builtTasks = buildRecommendationTasks({
      aiRequestFingerprint: provider.requestFingerprint ?? "",
      candidates,
      configuration,
      eventId: generation.eventId,
      participants: generation.snapshot.participants,
      tasks,
    });
    const sourceParticipantIds = builtTasks.flatMap((task) => task.participantIds);
    const sourceCounts = builtTasks
      .map((task) => task.request.sources.length)
      .sort((left, right) => left - right);
    if (
      builtTasks.length !== 11 ||
      generation.snapshot.participants.length !== 64 ||
      sourceParticipantIds.length !== 64 ||
      new Set(sourceParticipantIds).size !== 64 ||
      sourceCounts.join(",") !== [4, ...Array.from({ length: 10 }, () => 6)].join(",") ||
      builtTasks.some((task) =>
        task.request.sources.some((source) => source.candidateParticipants.length !== 16))
    ) {
      throw new Error("Frozen S6 topology precondition failed.");
    }
    const logicalTasks = Array.from(
      { length: options.rounds },
      (_, roundIndex) => builtTasks.map((task) => ({ round: roundIndex + 1, task })),
    ).flat();
    const results = options.execute
      ? await mapRolling(logicalTasks, options.concurrency, async ({ round, task }) => ({
          ...(await evaluateRecommendationTask({
            provider,
            recommendationCount: configuration.recommendationCount,
            snapshotParticipants: generation.snapshot.participants,
            task,
          })),
          requestHash: hashEvaluationValue(task.request),
          round,
          taskOrdinal: task.record.taskOrdinal,
        }))
      : logicalTasks.map(({ round, task }) => ({
          overallBusinessValid: null,
          requestHash: hashEvaluationValue(task.request),
          round,
          taskOrdinal: task.record.taskOrdinal,
        }));
    const [generationAfter, configurationAfter, tasksAfter, candidatesAfter] = await Promise.all([
      repository.getGeneration(options.generationId),
      repository.getGenerationConfiguration(options.generationId),
      repository.listTasks(options.generationId),
      repository.listCandidates(
        options.generationId,
        generation.snapshot.participants.map((participant) => participant.participantId),
      ),
    ]);
    if (!generationAfter || !configurationAfter) throw new Error("Generation state disappeared.");
    const stateHashAfter = hashEvaluationValue({
      candidates: candidatesAfter,
      configuration: configurationAfter,
      generation: generationAfter,
      tasks: tasksAfter,
    });
    if (stateHashAfter !== stateHashBefore) throw new Error("Read-only state changed.");
    const safeBase = {
      promptEncoding: "deduplicated",
      requestFingerprintHash: hashEvaluationValue(provider.requestFingerprint ?? ""),
      stateStable: true,
    } as const;
    for (const result of results) {
      process.stdout.write(`${JSON.stringify({ ...safeBase, ...result })}\n`);
    }
    if (
      options.execute &&
      results.some((result) => result.overallBusinessValid !== true)
    ) {
      process.exitCode = 1;
    }
  } finally {
    await client.close();
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  void main().catch(() => {
    process.stderr.write("Deduplicated prompt gate failed.\n");
    process.exitCode = 1;
  });
}
