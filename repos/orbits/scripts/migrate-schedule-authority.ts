import { fileURLToPath, pathToFileURL } from "node:url";

import { dryRunScheduleMigration } from "../features/personal-schedule/migration";
import { createConfiguredPostgresLiveRecordStore } from "../shared/storage/configured-live-record-store";
import { loadLocalEnv } from "./load-local-env";

export interface ScheduleAuthorityMigrationCommand {
  actorId: string;
  mode: "dry-run";
}

export function parseScheduleAuthorityMigrationCommand(argv: readonly string[]): ScheduleAuthorityMigrationCommand {
  let actorId: string | null = null;
  let dryRun = false;
  for (let index = 0; index < argv.length; index++) {
    const argument = argv[index];
    if (argument === "--dry-run" && !dryRun) {
      dryRun = true;
      continue;
    }
    if (argument === "--actor-id" && actorId === null) {
      actorId = argv[++index]?.trim() || null;
      continue;
    }
    throw new Error(`Unsupported or repeated argument: ${argument ?? "<missing>"}`);
  }
  if (!dryRun) throw new Error("Specify --dry-run. Apply mode requires a separately reviewed migration plan.");
  if (!actorId) throw new Error("Specify a non-empty --actor-id.");
  return { actorId, mode: "dry-run" };
}

export async function runScheduleAuthorityMigrationCommand(argv: readonly string[]): Promise<void> {
  const command = parseScheduleAuthorityMigrationCommand(argv);
  loadLocalEnv();
  const configured = createConfiguredPostgresLiveRecordStore<Record<string, unknown>>();
  if (!configured) {
    throw new Error(
      "Set ORBIT_EVENT_DATABASE_URL, ORBIT_LIVE_DATABASE_URL, or ORBIT_DATABASE_URL before running the schedule authority dry-run.",
    );
  }
  try {
    const result = await dryRunScheduleMigration({
      actorId: command.actorId,
      store: configured.store,
      workspaceId: configured.workspaceId,
    });
    process.stdout.write(`${JSON.stringify({ ...result, actorId: command.actorId, mode: command.mode, workspaceId: configured.workspaceId }, null, 2)}\n`);
  } finally {
    await configured.client.close();
  }
}

if (process.argv[1] && pathToFileURL(fileURLToPath(import.meta.url)).href === pathToFileURL(process.argv[1]).href) {
  runScheduleAuthorityMigrationCommand(process.argv.slice(2)).catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  });
}
