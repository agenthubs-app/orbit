import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import type { EventOperationsRepository } from "../features/events/event-operations/repository";
import { createConfiguredEventOperationsPostgresRuntime } from "../features/events/event-operations/storage/postgres-client";
import { createPostgresEventOperationsRepository } from "../features/events/event-operations/storage/postgres-repository";

function percentile(values: readonly number[], fraction: number): number | null {
  if (values.length === 0) return null;
  const ordered = [...values].sort((left, right) => left - right);
  return ordered[Math.ceil(fraction * ordered.length) - 1] ?? null;
}

function durations(
  values: readonly { claimedAt: string; finishedAt: string | null }[],
): number[] {
  return values.flatMap((value) =>
    value.finishedAt === null
      ? []
      : [Math.max(0, Date.parse(value.finishedAt) - Date.parse(value.claimedAt))],
  );
}

export async function buildEventOperationsAttemptReport(
  repository: Pick<EventOperationsRepository, "listTaskAttempts">,
  generationId: string,
) {
  const attempts = await repository.listTaskAttempts(generationId);
  const kinds = [...new Set(attempts.map((attempt) => attempt.kind))].sort();
  const finished = attempts.filter((attempt) => attempt.finishedAt !== null);
  const earliestEligible = attempts
    .map((attempt) => Date.parse(attempt.eligibleAt))
    .filter(Number.isFinite)
    .sort((left, right) => left - right)[0];
  const latestFinished = finished
    .map((attempt) => Date.parse(attempt.finishedAt!))
    .filter(Number.isFinite)
    .sort((left, right) => right - left)[0];

  const byKind = Object.fromEntries(
    kinds.map((kind) => {
      const rows = attempts.filter((attempt) => attempt.kind === kind);
      const elapsed = durations(rows);
      const queueWait = rows.map((attempt) =>
        Math.max(0, Date.parse(attempt.claimedAt) - Date.parse(attempt.eligibleAt)),
      );
      const provider = rows.flatMap((attempt) =>
        attempt.providerAdapterDurationMs === null
          ? []
          : [attempt.providerAdapterDurationMs],
      );
      const validation = rows.flatMap((attempt) =>
        attempt.domainValidationDurationMs === null
          ? []
          : [attempt.domainValidationDurationMs],
      );
      return [
        kind,
        {
          attempts: rows.length,
          durationMs: {
            max: elapsed.length === 0 ? null : Math.max(...elapsed),
            p50: percentile(elapsed, 0.5),
            p95: percentile(elapsed, 0.95),
          },
          outcomes: Object.fromEntries(
            [...new Set(rows.map((row) => row.outcome ?? "running"))]
              .sort()
              .map((outcome) => [
                outcome,
                rows.filter((row) => (row.outcome ?? "running") === outcome)
                  .length,
              ]),
          ),
          providerAdapterMsP95: percentile(provider, 0.95),
          queueWaitMsP95: percentile(queueWait, 0.95),
          retries: rows.filter(
            (attempt) => attempt.attempt > 1 || attempt.retryRound > 0,
          ).length,
          validationMsP95: percentile(validation, 0.95),
        },
      ];
    }),
  );

  return {
    attemptCount: attempts.length,
    byKind,
    failureCodes: Object.fromEntries(
      [...new Set(finished.flatMap((attempt) => attempt.failureCode ?? []))]
        .sort()
        .map((code) => [
          code,
          finished.filter((attempt) => attempt.failureCode === code).length,
        ]),
    ),
    generationDurationMs:
      earliestEligible === undefined || latestFinished === undefined
        ? null
        : Math.max(0, latestFinished - earliestEligible),
    generationId,
    runningAttempts: attempts.length - finished.length,
  };
}

export async function loadEventOperationsAttemptReport(input: {
  close: () => Promise<void>;
  generationId: string;
  repository: Pick<EventOperationsRepository, "listTaskAttempts">;
}) {
  try {
    return await buildEventOperationsAttemptReport(
      input.repository,
      input.generationId,
    );
  } finally {
    await input.close();
  }
}

async function main(): Promise<void> {
  const generationId = process.argv[2]?.trim();
  if (!generationId) {
    throw new Error(
      "Usage: npm run event-operations:attempt-report -- <generation-id>",
    );
  }
  const runtime = createConfiguredEventOperationsPostgresRuntime();
  if (!runtime) {
    throw new Error("ORBIT_EVENT_DATABASE_URL is not configured.");
  }
  const report = await loadEventOperationsAttemptReport({
    close: () => runtime.client.close(),
    generationId,
    repository: createPostgresEventOperationsRepository(runtime),
  });
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
}

if (
  process.argv[1] &&
  fileURLToPath(import.meta.url) === resolve(process.argv[1])
) {
  void main().catch((error: unknown) => {
    process.stderr.write(
      `${error instanceof Error ? error.message : "Attempt report failed."}\n`,
    );
    process.exitCode = 1;
  });
}
