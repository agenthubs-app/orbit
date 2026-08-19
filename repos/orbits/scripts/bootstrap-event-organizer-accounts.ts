import { pathToFileURL } from "node:url";

import {
  applyOrganizerAccountBootstrapPlan,
  buildOrganizerAccountBootstrapPlan,
  type OrganizerAccountBootstrapDependencies,
} from "../features/events/organizer-accounts/bootstrap";
import { createAuthUserService } from "../features/auth/auth-user-service";
import { createStorageAuthUserProvider } from "../features/auth/storage/auth-user-live-record-provider";
import { createStorageAuthAccountProvisioningProvider } from "../features/auth/storage/auth-account-provisioning-provider";
import { createStorageContactActorLinkProvider } from "../features/contacts/contact-actor-links/storage-provider";
import { createConfiguredPostgresLiveRecordStore } from "../shared/storage/configured-live-record-store";
import type { ClosableLiveRecordSqlClient } from "../shared/storage/postgres-live-record-store";
import { loadLocalEnv } from "./load-local-env";

export type EventOrganizerAccountBootstrapCommand =
  | { kind: "dry-run"; xiaoyuAuthUserId: string }
  | {
    expectedCount: number;
    expectedPlanHash: string;
    kind: "apply";
    xiaoyuAuthUserId: string;
  };

function requiredOption(
  values: ReadonlyMap<string, string>,
  name: string,
): string {
  const value = values.get(name);
  if (!value) throw new Error(`${name} is required.`);
  return value;
}

export function parseEventOrganizerAccountBootstrapCommand(
  args: readonly string[],
): EventOrganizerAccountBootstrapCommand {
  let mode: "dry-run" | "apply" | null = null;
  const options = new Map<string, string>();
  const optionNames = new Set([
    "--xiaoyu-auth-user-id",
    "--expected-count",
    "--expected-plan-hash",
  ]);

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index]!;
    if (arg === "--dry-run" || arg === "--apply") {
      if (mode !== null) throw new Error("Specify exactly one mode exactly once.");
      mode = arg.slice(2) as "dry-run" | "apply";
      continue;
    }
    if (!optionNames.has(arg)) {
      throw new Error(`Unknown organizer bootstrap argument ${arg}.`);
    }
    const value = args[index + 1];
    if (!value || value.startsWith("--") || options.has(arg)) {
      throw new Error(`Organizer bootstrap argument ${arg} must appear exactly once with a value.`);
    }
    options.set(arg, value);
    index += 1;
  }

  if (mode === null) throw new Error("Specify exactly one of --dry-run or --apply.");
  const xiaoyuAuthUserId = requiredOption(options, "--xiaoyu-auth-user-id");
  if (mode === "dry-run") {
    if (options.size !== 1) throw new Error("--dry-run accepts only --xiaoyu-auth-user-id.");
    return { kind: "dry-run", xiaoyuAuthUserId };
  }

  if (options.size !== 3) throw new Error("--apply requires only reviewed count and hash options.");
  const expectedCountText = requiredOption(options, "--expected-count");
  const expectedPlanHash = requiredOption(options, "--expected-plan-hash");
  if (expectedCountText !== "20") {
    throw new Error("--apply requires --expected-count 20.");
  }
  if (!/^[a-f0-9]{64}$/u.test(expectedPlanHash)) {
    throw new Error("--apply requires --expected-plan-hash with 64 lowercase hex characters.");
  }
  return { expectedCount: 20, expectedPlanHash, kind: "apply", xiaoyuAuthUserId };
}

function createDependencies(): {
  client: ClosableLiveRecordSqlClient;
  close: () => Promise<void>;
  dependencies: OrganizerAccountBootstrapDependencies;
} {
  const configured = createConfiguredPostgresLiveRecordStore({ max: 1 });
  if (!configured) {
    throw new Error("Organizer bootstrap requires a configured Orbit PostgreSQL database.");
  }
  const authUserProvider = createStorageAuthUserProvider({
    store: configured.store,
    workspaceId: configured.workspaceId,
  });
  const accountProvisioner = createStorageAuthAccountProvisioningProvider({
    store: configured.store,
    workspaceId: configured.workspaceId,
  });

  return {
    client: configured.client,
    close: configured.client.close,
    dependencies: {
      accountProvisioner,
      authUserProvider,
      authUserService: createAuthUserService({ accountProvisioner, provider: authUserProvider }),
      contactActorLinkProvider: createStorageContactActorLinkProvider({
        store: configured.store,
        workspaceId: configured.workspaceId,
      }),
      store: configured.store,
      workspaceId: configured.workspaceId,
    },
  };
}

async function main(): Promise<void> {
  const command = parseEventOrganizerAccountBootstrapCommand(process.argv.slice(2));
  loadLocalEnv();
  if (command.kind === "apply" && process.env.NODE_ENV === "production") {
    throw new Error("Organizer bootstrap refuses NODE_ENV=production.");
  }
  const password = command.kind === "apply" ? process.env.ORBIT_DEMO_ORGANIZER_PASSWORD : undefined;
  if (command.kind === "apply" && (!password || password.length < 8)) {
    throw new Error("Set ORBIT_DEMO_ORGANIZER_PASSWORD to at least 8 characters before applying.");
  }

  const runtime = createDependencies();
  try {
    const plan = await buildOrganizerAccountBootstrapPlan({
      dependencies: runtime.dependencies,
      xiaoyuAuthUserId: command.xiaoyuAuthUserId,
    });
    if (command.kind === "dry-run") {
      console.log(JSON.stringify(plan, null, 2));
      return;
    }
    if (command.expectedCount !== 20 || command.expectedPlanHash !== plan.hash) {
      throw new Error(`Reviewed organizer account plan mismatch: expected 20/${command.expectedPlanHash}, actual 20/${plan.hash}.`);
    }

    await runtime.client.query("BEGIN");
    try {
      const verification = await applyOrganizerAccountBootstrapPlan({
        expectedCount: command.expectedCount,
        expectedPlanHash: command.expectedPlanHash,
        password,
        plan,
      }, runtime.dependencies);
      await runtime.client.query("COMMIT");
      console.log(JSON.stringify(verification, null, 2));
    } catch (error) {
      await runtime.client.query("ROLLBACK");
      throw error;
    }
  } finally {
    await runtime.close();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  });
}
