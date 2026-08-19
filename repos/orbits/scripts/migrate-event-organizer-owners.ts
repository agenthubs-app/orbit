import { pathToFileURL } from "node:url";

import {
  applyEventOrganizerOwnerPlan,
  buildEventOrganizerOwnerPlan,
  XIAOYU_ACTOR_ID,
  type EventOrganizerOwnerPlan,
  type EventOrganizerOwnerSqlClient,
  type EventOrganizerOwnerVerification,
} from "../features/events/organizer-accounts/owner-migration";
import { resolveLiveDatabaseConnectionConfig } from "../shared/storage/live-database-config";
import { loadLocalEnv } from "./load-local-env";
import { Pool } from "pg";

export type EventOrganizerOwnerCommand =
  | { kind: "dry-run"; xiaoyuActorId: string }
  | { expectedCount: 16; expectedPlanHash: string; kind: "apply"; xiaoyuActorId: string };

function requiredOption(options: ReadonlyMap<string, string>, name: string): string {
  const value = options.get(name);
  if (!value) throw new Error(`${name} is required.`);
  return value;
}

export function parseEventOrganizerOwnerCommand(args: readonly string[]): EventOrganizerOwnerCommand {
  let mode: "dry-run" | "apply" | null = null;
  const options = new Map<string, string>();
  const names = new Set(["--xiaoyu-actor-id", "--expected-count", "--expected-plan-hash"]);
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index]!;
    if (arg === "--dry-run" || arg === "--apply") {
      if (mode !== null) throw new Error("Specify exactly one mode exactly once.");
      mode = arg.slice(2) as "dry-run" | "apply";
      continue;
    }
    if (!names.has(arg)) throw new Error(`Unknown organizer owner migration argument ${arg}.`);
    const value = args[index + 1];
    if (!value || value.startsWith("--") || options.has(arg)) {
      throw new Error(`Organizer owner migration argument ${arg} must appear exactly once with a value.`);
    }
    options.set(arg, value);
    index += 1;
  }
  if (mode === null) throw new Error("Specify exactly one of --dry-run or --apply.");
  const xiaoyuActorId = requiredOption(options, "--xiaoyu-actor-id");
  if (xiaoyuActorId !== XIAOYU_ACTOR_ID) throw new Error("Use the reviewed Xiaoyu actor ID.");
  if (mode === "dry-run") {
    if (options.size !== 1) throw new Error("--dry-run accepts only --xiaoyu-actor-id.");
    return { kind: "dry-run", xiaoyuActorId };
  }
  if (options.size !== 3 || requiredOption(options, "--expected-count") !== "16") {
    throw new Error("--apply requires --expected-count 16 and the reviewed hash.");
  }
  const expectedPlanHash = requiredOption(options, "--expected-plan-hash");
  if (!/^[a-f0-9]{64}$/u.test(expectedPlanHash)) {
    throw new Error("--apply requires --expected-plan-hash with 64 lowercase hex characters.");
  }
  return { expectedCount: 16, expectedPlanHash, kind: "apply", xiaoyuActorId };
}

export interface EventOrganizerOwnerRuntime {
  client: EventOrganizerOwnerSqlClient;
  close: () => Promise<void>;
  workspaceId: string;
}

export interface EventOrganizerOwnerRunnerOptions {
  applyPlan?: (input: {
    client: EventOrganizerOwnerSqlClient;
    expectedCount: number;
    expectedPlanHash: string;
    plan: EventOrganizerOwnerPlan;
    workspaceId: string;
    xiaoyuActorId: string;
  }) => Promise<EventOrganizerOwnerVerification>;
  buildPlan?: (input: {
    client: EventOrganizerOwnerSqlClient;
    workspaceId: string;
    xiaoyuActorId: string;
  }) => Promise<EventOrganizerOwnerPlan>;
  createRuntime?: () => EventOrganizerOwnerRuntime;
  loadEnv?: () => void;
  log?: (value: string) => void;
}

function createRuntime(): EventOrganizerOwnerRuntime {
  const database = resolveLiveDatabaseConnectionConfig();
  if (!database) throw new Error("Organizer owner migration requires a configured Orbit PostgreSQL database.");
  const pool = new Pool({ connectionString: database.connectionString, max: 1 });
  return { client: pool, close: () => pool.end(), workspaceId: database.workspaceId };
}

export async function runEventOrganizerOwnerCommand(
  args: readonly string[],
  options: EventOrganizerOwnerRunnerOptions = {},
): Promise<void> {
  const command = parseEventOrganizerOwnerCommand(args);
  (options.loadEnv ?? loadLocalEnv)();
  const runtime = (options.createRuntime ?? createRuntime)();
  const buildPlan = options.buildPlan ?? buildEventOrganizerOwnerPlan;
  const applyPlan = options.applyPlan ?? applyEventOrganizerOwnerPlan;
  const log = options.log ?? ((value: string) => console.log(value));
  try {
    const plan = await buildPlan({
      client: runtime.client,
      workspaceId: runtime.workspaceId,
      xiaoyuActorId: command.xiaoyuActorId,
    });
    if (command.kind === "dry-run") {
      log(JSON.stringify(plan, null, 2));
      return;
    }
    if (command.expectedCount !== 16 || command.expectedPlanHash !== plan.hash) {
      throw new Error(`Reviewed organizer owner plan mismatch: expected 16/${command.expectedPlanHash}, actual 16/${plan.hash}.`);
    }
    const verification = await applyPlan({
      client: runtime.client,
      expectedCount: command.expectedCount,
      expectedPlanHash: command.expectedPlanHash,
      plan,
      workspaceId: runtime.workspaceId,
      xiaoyuActorId: command.xiaoyuActorId,
    });
    log(JSON.stringify(verification, null, 2));
  } finally {
    await runtime.close();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  runEventOrganizerOwnerCommand(process.argv.slice(2)).catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  });
}
