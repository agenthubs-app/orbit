import { pathToFileURL } from "node:url";

import {
  applyOrganizerAccountBootstrapPlan,
  buildOrganizerAccountBootstrapPlan,
  XIAOYU_AUTH_USER_ID,
  type OrganizerAccountBootstrapPlan,
  type OrganizerAccountBootstrapVerification,
  type OrganizerAccountBootstrapDependencies,
  type OrganizerAccountBootstrapMembershipWriter,
  type OrganizerAccountBootstrapOwnershipWriter,
} from "../features/events/organizer-accounts/bootstrap";
import { createAuthUserService } from "../features/auth/auth-user-service";
import { createStorageAuthUserProvider } from "../features/auth/storage/auth-user-live-record-provider";
import { createStorageAuthAccountProvisioningProvider } from "../features/auth/storage/auth-account-provisioning-provider";
import { createStorageContactActorLinkProvider } from "../features/contacts/contact-actor-links/storage-provider";
import { createConfiguredPostgresLiveRecordStore } from "../shared/storage/configured-live-record-store";
import type { ClosableLiveRecordSqlClient } from "../shared/storage/postgres-live-record-store";
import type { LiveRecord } from "../shared/storage/live-record-store";
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
  if (xiaoyuAuthUserId !== XIAOYU_AUTH_USER_ID) {
    throw new Error("Use the reviewed Xiaoyu auth user ID.");
  }
  if (mode === "dry-run") {
    if (options.size !== 1) throw new Error("--dry-run accepts only --xiaoyu-auth-user-id.");
    return { kind: "dry-run", xiaoyuAuthUserId };
  }

  if (options.size !== 3) throw new Error("--apply requires only reviewed count and hash options.");
  const expectedCountText = requiredOption(options, "--expected-count");
  const expectedPlanHash = requiredOption(options, "--expected-plan-hash");
  if (expectedCountText !== "28") {
    throw new Error("--apply requires --expected-count 28.");
  }
  if (!/^[a-f0-9]{64}$/u.test(expectedPlanHash)) {
    throw new Error("--apply requires --expected-plan-hash with 64 lowercase hex characters.");
  }
  return { expectedCount: 28, expectedPlanHash, kind: "apply", xiaoyuAuthUserId };
}

export interface EventOrganizerAccountBootstrapRuntime {
  client: ClosableLiveRecordSqlClient;
  close: () => Promise<void>;
  dependencies: OrganizerAccountBootstrapDependencies;
}

export interface EventOrganizerAccountBootstrapRunnerOptions {
  applyPlan?: (
    input: {
      expectedCount: number;
      expectedPlanHash: string;
      password: string;
      plan: OrganizerAccountBootstrapPlan;
    },
    dependencies: OrganizerAccountBootstrapDependencies,
  ) => Promise<OrganizerAccountBootstrapVerification>;
  buildPlan?: (input: {
    dependencies: OrganizerAccountBootstrapDependencies;
    xiaoyuAuthUserId: string;
  }) => Promise<OrganizerAccountBootstrapPlan>;
  createDependencies?: () => EventOrganizerAccountBootstrapRuntime;
  env?: Record<string, string | undefined>;
  loadEnv?: () => void;
  log?: (value: string) => void;
}

function membershipRecordValues(
  record: LiveRecord<Record<string, unknown>>,
): readonly unknown[] {
  return [
    record.workspaceId,
    record.collectionName,
    record.recordId,
    record.userId ?? null,
    record.sourceType,
    record.sourceId,
    record.sourceLabel ?? null,
    record.provider ?? null,
    record.providerRecordId ?? null,
    [...record.evidenceIds],
    record.targetType ?? null,
    record.targetId ?? null,
    record.occurredAt ?? null,
    record.lifecycleState,
    record.searchText ?? "",
    record.payload,
    record.createdAt,
    record.updatedAt,
    record.deletedAt ?? null,
  ];
}

export function createPostgresOrganizerMembershipWriter({
  client,
}: {
  client: ClosableLiveRecordSqlClient;
}): OrganizerAccountBootstrapMembershipWriter {
  return {
    async insertIfAbsent(record) {
      const result = await client.query<{ record_id: string }>(
        `
          insert into orbit_records (
            workspace_id, collection_name, record_id, user_id, source_type,
            source_id, source_label, provider, provider_record_id, evidence_ids,
            target_type, target_id, occurred_at, lifecycle_state, search_text,
            payload, created_at, updated_at, deleted_at
          ) values (
            $1, $2, $3, $4, $5, $6, $7, $8, $9, $10,
            $11, $12, $13, $14, $15, $16, $17, $18, $19
          )
          on conflict (workspace_id, collection_name, record_id)
          do nothing
          returning record_id
        `,
        membershipRecordValues(record),
      );

      return result.rows.length === 1 ? "inserted" : "existing";
    },
  };
}

export function createPostgresOrganizerOwnershipWriter({
  client,
}: {
  client: ClosableLiveRecordSqlClient;
}): OrganizerAccountBootstrapOwnershipWriter {
  return {
    async lockForUpdate(input) {
      const result = await client.query<{ record_id: string }>(
        `
          select record_id
          from orbit_records
          where workspace_id = $1
            and collection_name = $2
            and record_id = $3
          for update
        `,
        [input.workspaceId, input.collectionName, input.recordId],
      );

      return result.rows.length === 1 ? "locked" : "missing";
    },
    async setOwnerIfAbsent(input) {
      const result = await client.query<{ record_id: string }>(
        `
          update orbit_records
          set user_id = $4
          where workspace_id = $1
            and collection_name = $2
            and record_id = $3
            and user_id is null
          returning record_id
        `,
        [input.workspaceId, input.collectionName, input.recordId, input.ownerActorId],
      );

      return result.rows.length === 1 ? "updated" : "existing";
    },
  };
}

function createDependencies(): EventOrganizerAccountBootstrapRuntime {
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
      membershipWriter: createPostgresOrganizerMembershipWriter({
        client: configured.client,
      }),
      ownershipWriter: createPostgresOrganizerOwnershipWriter({
        client: configured.client,
      }),
      store: configured.store,
      workspaceId: configured.workspaceId,
    },
  };
}

export async function runEventOrganizerAccountBootstrapCommand(
  args: readonly string[],
  options: EventOrganizerAccountBootstrapRunnerOptions = {},
): Promise<void> {
  const command = parseEventOrganizerAccountBootstrapCommand(args);
  (options.loadEnv ?? loadLocalEnv)();
  const env = options.env ?? process.env;
  if (command.kind === "apply" && env.NODE_ENV === "production") {
    throw new Error("Organizer bootstrap refuses NODE_ENV=production.");
  }
  const password = command.kind === "apply" ? env.ORBIT_DEMO_ORGANIZER_PASSWORD : undefined;
  if (command.kind === "apply" && (!password || password.length < 8)) {
    throw new Error("Set ORBIT_DEMO_ORGANIZER_PASSWORD to at least 8 characters before applying.");
  }

  const runtime = (options.createDependencies ?? createDependencies)();
  const buildPlan = options.buildPlan ?? buildOrganizerAccountBootstrapPlan;
  const applyPlan = options.applyPlan ?? applyOrganizerAccountBootstrapPlan;
  const log = options.log ?? ((value: string) => console.log(value));
  try {
    const plan = await buildPlan({
      dependencies: runtime.dependencies,
      xiaoyuAuthUserId: command.xiaoyuAuthUserId,
    });
    if (command.kind === "dry-run") {
      log(JSON.stringify(plan, null, 2));
      return;
    }
    if (command.expectedCount !== 28 || command.expectedPlanHash !== plan.hash) {
      throw new Error(`Reviewed organizer account plan mismatch: expected 28/${command.expectedPlanHash}, actual 28/${plan.hash}.`);
    }

    await runtime.client.query("BEGIN");
    try {
      const verification = await applyPlan({
        expectedCount: command.expectedCount,
        expectedPlanHash: command.expectedPlanHash,
        password,
        plan,
      }, runtime.dependencies);
      await runtime.client.query("COMMIT");
      log(JSON.stringify(verification, null, 2));
    } catch (error) {
      await runtime.client.query("ROLLBACK");
      throw error;
    }
  } finally {
    await runtime.close();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  runEventOrganizerAccountBootstrapCommand(process.argv.slice(2)).catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  });
}
