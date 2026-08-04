import { createHash } from "node:crypto";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import type {
  EventOperationsCandidate,
  EventOperationsGeneration,
  EventOperationsGenerationTask,
} from "../features/events/event-operations/contract";
import { createEventOperationsAiProvider } from "../features/events/event-operations/ai-provider";
import { createEventOperationsPostgresClient } from "../features/events/event-operations/storage/postgres-client";
import { createPostgresEventOperationsRepository } from "../features/events/event-operations/storage/postgres-repository";
import { loadLocalEnv } from "./load-local-env";

export interface EvaluationOptions {
  concurrency: number;
  execute: boolean;
  generationId: string;
  rounds: number;
  temperatures: readonly number[];
}

export interface EvaluationTaskRecord {
  candidateCount: number;
  requestContentHash: string;
  requestHash: string;
  sourceCount: number;
  taskHash: string;
  taskOrdinal: number;
}

export function parseEvaluationOptions(
  args: readonly string[],
): EvaluationOptions {
  const values = new Map<string, string>();
  for (let index = 0; index < args.length; index += 1) {
    const key = args[index];
    if (!key?.startsWith("--")) continue;
    const nextValue = args[index + 1];
    const value =
      nextValue?.startsWith("--") || nextValue === undefined
        ? "true"
        : nextValue;
    values.set(key.slice(2), value);
    if (value === nextValue) index += 1;
  }
  const generationId = values.get("generation-id")?.trim();
  if (!generationId) throw new Error("--generation-id is required.");
  const numberValue = (key: string, fallback: number) => {
    const value = Number(values.get(key) ?? fallback);
    if (!Number.isInteger(value) || value < 1) {
      throw new Error(`--${key} must be a positive integer.`);
    }
    return value;
  };
  const temperatures = (values.get("temperatures") ?? "1,0.2")
    .split(",")
    .map((value) => Number(value.trim()));
  if (
    !temperatures.length ||
    temperatures.some(
      (value) => !Number.isFinite(value) || value < 0 || value > 2,
    )
  ) {
    throw new Error(
      "--temperatures must be comma-separated numbers from 0 through 2.",
    );
  }
  return {
    concurrency: numberValue("concurrency", 1),
    execute: values.get("execute") === "true",
    generationId,
    rounds: numberValue("rounds", 3),
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
  return createHash("sha256")
    .update(JSON.stringify(stableEvaluationValue(value)))
    .digest("hex");
}

/** Reconstructs the exact recommendation request hash without emitting profiles. */
export function createRecommendationTaskEvaluationRecords(input: {
  aiRequestFingerprint: string;
  candidates: readonly EventOperationsCandidate[];
  eventId: string;
  participants: readonly { participantId: string }[];
  recommendationCount: number;
  tasks: readonly EventOperationsGenerationTask[];
}): readonly EvaluationTaskRecord[] {
  const participantById = new Map(
    input.participants.map((participant) => [
      participant.participantId,
      participant,
    ]),
  );
  const candidates = [...input.candidates].sort(
    (left, right) =>
      left.sourceParticipantId.localeCompare(right.sourceParticipantId) ||
      left.retrievalRank - right.retrievalRank,
  );
  return input.tasks
    .filter((task) => task.kind === "recommendation_shard")
    .sort((left, right) => left.taskId.localeCompare(right.taskId))
    .map((task, taskOrdinal) => {
      const taskCandidates = candidates.filter((candidate) =>
        task.participantIds.includes(candidate.sourceParticipantId),
      );
      const request = {
        eventId: input.eventId,
        recommendationCount: input.recommendationCount,
        sources: task.participantIds.map((participantId) => ({
          candidateParticipants: taskCandidates
            .filter(
              (candidate) =>
                candidate.sourceParticipantId === participantId,
            )
            .flatMap((candidate) => {
              const participant = participantById.get(
                candidate.targetParticipantId,
              );
              return participant ? [participant] : [];
            }),
          sourceParticipant: participantById.get(participantId),
        })),
      };
      return {
        candidateCount: taskCandidates.length,
        requestContentHash: hashEvaluationValue(request),
        requestHash: hashEvaluationValue({
          aiRequestFingerprint: input.aiRequestFingerprint,
          request,
        }),
        sourceCount: task.participantIds.length,
        taskHash: hashEvaluationValue(task.taskId),
        taskOrdinal: taskOrdinal + 1,
      };
    });
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
  generation: EventOperationsGeneration;
  tasks: readonly EventOperationsGenerationTask[];
}) {
  return hashEvaluationValue(input);
}

async function main(): Promise<void> {
  loadLocalEnv();
  const options = parseEvaluationOptions(process.argv.slice(2));
  if (options.execute) {
    throw new Error(
      "--execute is unavailable until the shared engine domain validator is wired; dry-run only.",
    );
  }
  const databaseUrl = process.env.ORBIT_EVENT_DATABASE_URL;
  if (!databaseUrl) throw new Error("ORBIT_EVENT_DATABASE_URL is required.");
  const client = createEventOperationsPostgresClient({
    connectionString: databaseUrl,
  });
  try {
    const repository = createPostgresEventOperationsRepository({
      client,
      workspaceId: process.env.ORBIT_WORKSPACE_ID ?? "workspace:default",
    });
    const generation = await repository.getGeneration(options.generationId);
    if (!generation) throw new Error("Generation was not found.");
    const [configuration, tasks, candidates] = await Promise.all([
      repository.getGenerationConfiguration(generation.generationId),
      repository.listTasks(generation.generationId),
      repository.listCandidates(
        generation.generationId,
        generation.snapshot.participants.map(
          (participant) => participant.participantId,
        ),
      ),
    ]);
    if (!configuration) {
      throw new Error("Generation configuration was not found.");
    }
    const stateHashBefore = evaluationStateHash({
      candidates,
      generation,
      tasks,
    });
    const base = redactEvaluationRecord({
      candidateCount: candidates.length,
      generationId: generation.generationId,
      requestFingerprint: generation.aiRequestFingerprint,
      snapshotHash: generation.snapshot.hash,
      taskCount: tasks.filter((task) => task.kind === "recommendation_shard")
        .length,
    });
    for (const temperature of options.temperatures) {
      const provider = createEventOperationsAiProvider({
        config: {
          deepseekThinking: false,
          jsonOutput: true,
          maxTokens: 8192,
          provider: "deepseek",
          temperature,
        },
      });
      const recommendationTasks = createRecommendationTaskEvaluationRecords({
        aiRequestFingerprint: provider.requestFingerprint ?? "",
        candidates,
        eventId: generation.eventId,
        participants: generation.snapshot.participants,
        recommendationCount: configuration.recommendationCount,
        tasks,
      });
      const requestSetHash = hashEvaluationValue(
        recommendationTasks.map((task) => task.requestHash),
      );
      const requestContentSetHash = hashEvaluationValue(
        recommendationTasks.map((task) => task.requestContentHash),
      );
      for (const task of recommendationTasks) {
        for (let round = 0; round < options.rounds; round += 1) {
          process.stdout.write(
            `${JSON.stringify({
              ...base,
              candidateCount: task.candidateCount,
              concurrency: options.concurrency,
              domainValidation: "not-run",
              execute: false,
              overallBusinessValid: null,
              plannedOnly: true,
              requestContentHash: task.requestContentHash,
              requestContentSetHash,
              requestHash: task.requestHash,
              requestSetHash,
              round: round + 1,
              sourceCount: task.sourceCount,
              taskHash: task.taskHash,
              taskOrdinal: task.taskOrdinal,
              temperature,
            })}\n`,
          );
        }
      }
    }
    const [generationAfter, tasksAfter, candidatesAfter] = await Promise.all([
      repository.getGeneration(generation.generationId),
      repository.listTasks(generation.generationId),
      repository.listCandidates(
        generation.generationId,
        generation.snapshot.participants.map(
          (participant) => participant.participantId,
        ),
      ),
    ]);
    if (
      !generationAfter ||
      evaluationStateHash({
        candidates: candidatesAfter,
        generation: generationAfter,
        tasks: tasksAfter,
      }) !== stateHashBefore
    ) {
      throw new Error(
        "Generation state changed during the read-only evaluation.",
      );
    }
  } finally {
    await client.close();
  }
}

if (
  process.argv[1] &&
  fileURLToPath(import.meta.url) === resolve(process.argv[1])
) {
  void main().catch((error: unknown) => {
    process.stderr.write(
      `${error instanceof Error ? error.message : "Evaluation failed."}\n`,
    );
    process.exitCode = 1;
  });
}
