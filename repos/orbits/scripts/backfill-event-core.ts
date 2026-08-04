import { buildEventCoreBackfillPlan, applyEventCoreBackfillPlan } from "../features/events/core/backfill";
import { readEventCoreBackfillCandidates } from "../features/events/core/backfill-sources";
import { runEventCoreMigrations } from "../features/events/core/storage/migrations";
import { EVENT_CANONICAL_V1_MANIFEST } from "../features/events/core/migration/manifests/event-canonical-v1";
import { createEventOperationsPostgresClient } from "../features/events/event-operations/storage/postgres-client";
import { resolveLiveDatabaseConnectionConfig } from "../shared/storage/live-database-config";
import { runOrbitRecordsMigration } from "../shared/storage/migrations";
import { loadLocalEnv } from "./load-local-env";
import { Pool } from "pg";

type BackfillCommandMode =
  | { kind: "dry-run" }
  | { expectedCount: number; expectedPlanHash: string; kind: "apply" };

function optionValue(args: readonly string[], name: string): string | null {
  const inline = args.find((arg) => arg.startsWith(`${name}=`));
  if (inline) return inline.slice(name.length + 1);
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] ?? null : null;
}

export function parseEventCoreBackfillCommand(
  args: readonly string[],
): BackfillCommandMode {
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index]!;
    if (arg === "--dry-run" || arg === "--apply") continue;
    if (arg === "--expected-plan-hash" || arg === "--expected-count") {
      index += 1;
      continue;
    }
    if (
      arg.startsWith("--expected-plan-hash=") ||
      arg.startsWith("--expected-count=")
    ) {
      continue;
    }
    throw new Error(`Unknown Event Core backfill argument ${arg}.`);
  }
  const dryRun = args.includes("--dry-run");
  const apply = args.includes("--apply");
  if (dryRun === apply) {
    throw new Error("Specify exactly one of --dry-run or --apply.");
  }
  const expectedPlanHash = optionValue(args, "--expected-plan-hash");
  const expectedCountText = optionValue(args, "--expected-count");
  if (dryRun) {
    if (expectedPlanHash !== null || expectedCountText !== null) {
      throw new Error("Expected plan arguments are valid only with --apply.");
    }
    return { kind: "dry-run" };
  }
  if (!expectedPlanHash || !/^[a-f0-9]{64}$/u.test(expectedPlanHash)) {
    throw new Error("--apply requires --expected-plan-hash with 64 lowercase hex characters.");
  }
  if (!expectedCountText || !/^[1-9][0-9]*$/u.test(expectedCountText)) {
    throw new Error("--apply requires --expected-count with a positive integer.");
  }
  const expectedCount = Number(expectedCountText);
  if (!Number.isSafeInteger(expectedCount) || expectedCount < 1) {
    throw new Error("--expected-count must be a positive safe integer.");
  }
  return {
    expectedCount,
    expectedPlanHash,
    kind: "apply",
  };
}

async function main(): Promise<void> {
  const command = parseEventCoreBackfillCommand(process.argv.slice(2));
  loadLocalEnv();
  const database = resolveLiveDatabaseConnectionConfig();
  if (!database) {
    throw new Error("Event Core backfill requires a configured Orbit PostgreSQL database.");
  }
  const defaultTimezone = process.env.EVENT_CORE_BACKFILL_TIMEZONE?.trim();
  const publicOwnerActorId = process.env.EVENT_CORE_PUBLIC_OWNER_ACTOR_ID?.trim();
  if (!defaultTimezone || !publicOwnerActorId) {
    throw new Error(
      "Set EVENT_CORE_BACKFILL_TIMEZONE and EVENT_CORE_PUBLIC_OWNER_ACTOR_ID explicitly; the backfill does not guess missing timezone or ownership.",
    );
  }

  // Schema migrations intentionally use a raw pg Pool. ORBIT_RECORDS_SCHEMA_SQL
  // contains multiple statements, for which node-postgres returns Result[].
  // EventOperationsPostgresClient is a typed single-result/transaction boundary
  // and must not be widened to handle that migration-only response shape.
  const migrationPool = new Pool({
    connectionString: database.connectionString,
    max: 1,
  });
  let client: ReturnType<typeof createEventOperationsPostgresClient> | null = null;
  try {
    await runOrbitRecordsMigration(migrationPool);
    await runEventCoreMigrations(migrationPool);
    client = createEventOperationsPostgresClient({
      connectionString: database.connectionString,
      max: 1,
    });
    const candidates = await readEventCoreBackfillCandidates({
      client,
      defaultTimezone,
      publicOwnerActorId,
      workspaceId: database.workspaceId,
    });
    const plan = buildEventCoreBackfillPlan(
      candidates,
      EVENT_CANONICAL_V1_MANIFEST,
    );
    if (command.kind === "dry-run") {
      console.log(JSON.stringify({
        count: plan.count,
        hash: plan.hash,
        migrationId: plan.migrationId,
        resolutionCount: plan.resolutionCount,
      }, null, 2));
      return;
    }
    if (
      command.expectedPlanHash !== plan.hash ||
      command.expectedCount !== plan.count
    ) {
      throw new Error(
        `Reviewed Event Core plan mismatch: expected count/hash ${command.expectedCount}/${command.expectedPlanHash}, actual ${plan.count}/${plan.hash}.`,
      );
    }
    const verification = await applyEventCoreBackfillPlan({
      client,
      plan,
      workspaceId: database.workspaceId,
    });
    if (verification.count !== plan.count || verification.hash !== plan.hash) {
      throw new Error("Event Core backfill count/hash verification failed.");
    }
    console.log(JSON.stringify(verification, null, 2));
  } finally {
    try {
      await client?.close();
    } finally {
      await migrationPool.end();
    }
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
