import { activateCanonicalRegistrationsWithExecutor } from "../../event-operations/storage/canonical-registration-repository";
import { EVENT_OPERATIONS_SCHEMA_MIGRATIONS } from "../../event-operations/storage/migrations";
import type { EventOperationsSqlExecutor } from "../../event-operations/storage/postgres-client";
import { EventRegistrationWindowError } from "../deadline-gated-service";
import {
  CanonicalMembershipMigrationApplyCommandError,
  parseCanonicalMembershipMigrationApplyCommand,
} from "./apply-contract";
import {
  CANONICAL_MEMBERSHIP_MIGRATION_ID,
  CANONICAL_MEMBERSHIP_MIGRATION_SCHEMA_VERSION,
  canonicalMigrationHash,
  type CanonicalMembershipAuthority,
  type CanonicalMembershipMigrationEventPlan,
} from "./contract";
import { parseCanonicalMembershipOperatorManifest } from "./operator-manifest";
import { buildCanonicalMembershipMigrationPlan } from "./planner";
import {
  withCanonicalMembershipMigrationSnapshot,
  type CanonicalMembershipMigrationSnapshot,
} from "./snapshot-runner";
import { readCanonicalMembershipMigrationSource } from "./source-reader";

const EVENT_OPERATIONS_CANONICAL_LEDGER_MIGRATION_VERSION = 12;
const MAX_RAW_MANIFEST_BYTES = 65_536;
const HASH = /^[a-f0-9]{64}$/u;

export type CanonicalMembershipMigrationApplyErrorCode =
  | "CANONICAL_MEMBERSHIP_MIGRATION_ACTIVATION_INVALID"
  | "CANONICAL_MEMBERSHIP_MIGRATION_COMMAND_INVALID"
  | "CANONICAL_MEMBERSHIP_MIGRATION_DATABASE_FAILED"
  | "CANONICAL_MEMBERSHIP_MIGRATION_LEDGER_CORRUPT"
  | "CANONICAL_MEMBERSHIP_MIGRATION_MANIFEST_INVALID"
  | "CANONICAL_MEMBERSHIP_MIGRATION_NOT_READY"
  | "CANONICAL_MEMBERSHIP_MIGRATION_PLAN_ALREADY_APPLIED"
  | "CANONICAL_MEMBERSHIP_MIGRATION_PLAN_DRIFT"
  | "CANONICAL_MEMBERSHIP_MIGRATION_REPLAY_MISMATCH"
  | "CANONICAL_MEMBERSHIP_MIGRATION_RETRY_EXHAUSTED";

export class CanonicalMembershipMigrationApplyError extends Error {
  constructor(readonly code: CanonicalMembershipMigrationApplyErrorCode) {
    super("Canonical membership migration apply failed.");
    this.name = "CanonicalMembershipMigrationApplyError";
  }
}

export type CanonicalMembershipMigrationApplyResult = Readonly<{
  count: number;
  planHash: string;
  resultHash: string;
  status: "applied" | "already_applied";
}>;

type Command = ReturnType<
  typeof parseCanonicalMembershipMigrationApplyCommand
>;
type Row = Record<string, unknown>;

class CanonicalMembershipMigrationLedgerInsertConflict extends Error {
  constructor() {
    super("Canonical membership migration ledger insert conflicted.");
    this.name = "CanonicalMembershipMigrationLedgerInsertConflict";
  }
}

interface CanonicalMembershipMigrationEventLedgerFact {
  readonly action: "activate" | "verify_canonical";
  readonly authority: CanonicalMembershipAuthority;
  readonly deadlineEvidenceHash: string | null;
  readonly eventAggregateHash: string;
  readonly eventId: string;
  readonly targetCount: number;
}

interface CanonicalMembershipMigrationRunLedgerFact {
  readonly expectedCount: number;
  readonly manifestHash: string;
  readonly migrationId: typeof CANONICAL_MEMBERSHIP_MIGRATION_ID;
  readonly planHash: string;
  readonly schemaVersion: typeof CANONICAL_MEMBERSHIP_MIGRATION_SCHEMA_VERSION;
}

function fail(code: CanonicalMembershipMigrationApplyErrorCode): never {
  throw new CanonicalMembershipMigrationApplyError(code);
}

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function sqlState(error: unknown): string | null {
  return error &&
    typeof error === "object" &&
    typeof (error as { code?: unknown }).code === "string"
    ? (error as { code: string }).code
    : null;
}

function runLedgerFact(command: Command): CanonicalMembershipMigrationRunLedgerFact {
  return {
    expectedCount: command.expectedCount,
    manifestHash: command.manifestHash,
    migrationId: CANONICAL_MEMBERSHIP_MIGRATION_ID,
    planHash: command.expectedPlanHash,
    schemaVersion: CANONICAL_MEMBERSHIP_MIGRATION_SCHEMA_VERSION,
  };
}

function eventLedgerFact(
  event: CanonicalMembershipMigrationEventPlan,
): CanonicalMembershipMigrationEventLedgerFact {
  if (
    event.action === "blocked" ||
    (event.authority === "canonical_membership" &&
      event.action !== "verify_canonical") ||
    (event.authority === "legacy_registration" &&
      event.action !== "activate") ||
    (event.authority === "canonical_membership" && event.deadline !== null) ||
    (event.authority === "legacy_registration" && event.deadline === null)
  ) {
    fail("CANONICAL_MEMBERSHIP_MIGRATION_PLAN_DRIFT");
  }
  return {
    action: event.action,
    authority: event.authority,
    deadlineEvidenceHash:
      event.authority === "legacy_registration"
        ? canonicalMigrationHash({
            deadline: event.deadline,
            domain: "canonical-membership-deadline-evidence:v1",
          })
        : null,
    eventAggregateHash: canonicalMigrationHash({
      domain: "canonical-membership-event-aggregate:v1",
      event: {
        action: event.action,
        authority: event.authority,
        eventId: event.eventId,
        source: event.source,
      },
    }),
    eventId: event.eventId,
    targetCount: event.source.validCount,
  };
}

export function canonicalMembershipMigrationLedgerResultHash(input: {
  events: readonly CanonicalMembershipMigrationEventLedgerFact[];
  run: CanonicalMembershipMigrationRunLedgerFact;
}): string {
  return canonicalMigrationHash({
    domain: "canonical-membership-ledger-result:v1",
    events: [...input.events].sort((left, right) =>
      compareText(left.eventId, right.eventId),
    ),
    run: input.run,
  });
}

async function assertReady(executor: EventOperationsSqlExecutor): Promise<void> {
  const expected = EVENT_OPERATIONS_SCHEMA_MIGRATIONS.find(
    (migration) =>
      migration.version === EVENT_OPERATIONS_CANONICAL_LEDGER_MIGRATION_VERSION,
  );
  const relations = await executor.query<{
    current_schema: string | null;
    events: string | null;
    events_schema: string | null;
    migrations: string | null;
    migrations_schema: string | null;
    runs: string | null;
    runs_schema: string | null;
  }>(
    `select
       current_schema() as current_schema,
       to_regclass('event_ops_schema_migrations')::text as migrations,
       to_regclass('event_ops_canonical_membership_migration_runs')::text as runs,
       to_regclass('event_ops_canonical_membership_migration_events')::text as events,
       (select namespace.nspname
          from pg_class relation
          join pg_namespace namespace on namespace.oid = relation.relnamespace
         where relation.oid = to_regclass('event_ops_schema_migrations')) as migrations_schema,
       (select namespace.nspname
          from pg_class relation
          join pg_namespace namespace on namespace.oid = relation.relnamespace
         where relation.oid = to_regclass('event_ops_canonical_membership_migration_runs')) as runs_schema,
       (select namespace.nspname
          from pg_class relation
          join pg_namespace namespace on namespace.oid = relation.relnamespace
         where relation.oid = to_regclass('event_ops_canonical_membership_migration_events')) as events_schema`,
  );
  const relation = relations.rows[0];
  if (
    !expected ||
    !relation?.migrations ||
    !relation.runs ||
    !relation.events ||
    !relation.current_schema ||
    relation.migrations_schema !== relation.current_schema ||
    relation.runs_schema !== relation.current_schema ||
    relation.events_schema !== relation.current_schema
  ) {
    fail("CANONICAL_MEMBERSHIP_MIGRATION_NOT_READY");
  }
  const actual = await executor.query<{ checksum: unknown; name: unknown }>(
    `select name, checksum
       from event_ops_schema_migrations
      where version = $1`,
    [EVENT_OPERATIONS_CANONICAL_LEDGER_MIGRATION_VERSION],
  );
  if (
    actual.rows.length !== 1 ||
    actual.rows[0]?.name !== expected.name ||
    actual.rows[0]?.checksum !== expected.checksum
  ) {
    fail("CANONICAL_MEMBERSHIP_MIGRATION_NOT_READY");
  }
}

async function advisoryLock(
  executor: EventOperationsSqlExecutor,
  key: string,
): Promise<void> {
  await executor.query(
    `select pg_advisory_xact_lock(hashtextextended($1, 0))`,
    [key],
  );
}

function parseEventLedgerRows(
  rows: readonly Row[],
): readonly CanonicalMembershipMigrationEventLedgerFact[] {
  const seen = new Set<string>();
  const events = rows.map((row) => {
    const eventId = row.event_id;
    const authority = row.authority;
    const targetCount = Number(row.target_count);
    const eventAggregateHash = row.event_aggregate_hash;
    const deadlineEvidenceHash = row.deadline_evidence_hash;
    if (
      typeof eventId !== "string" ||
      !eventId ||
      eventId.trim() !== eventId ||
      seen.has(eventId) ||
      (authority !== "canonical_membership" &&
        authority !== "legacy_registration") ||
      typeof eventAggregateHash !== "string" ||
      !HASH.test(eventAggregateHash) ||
      !Number.isSafeInteger(targetCount) ||
      targetCount < 0 ||
      (authority === "canonical_membership"
        ? deadlineEvidenceHash !== null
        : typeof deadlineEvidenceHash !== "string" ||
          !HASH.test(deadlineEvidenceHash))
    ) {
      fail("CANONICAL_MEMBERSHIP_MIGRATION_LEDGER_CORRUPT");
    }
    seen.add(eventId);
    const normalizedDeadlineEvidenceHash =
      authority === "canonical_membership"
        ? null
        : (deadlineEvidenceHash as string);
    return {
      action:
        authority === "canonical_membership" ? "verify_canonical" : "activate",
      authority,
      deadlineEvidenceHash: normalizedDeadlineEvidenceHash,
      eventAggregateHash,
      eventId,
      targetCount,
    } as const;
  });
  return events.sort((left, right) => compareText(left.eventId, right.eventId));
}

async function replayExistingRun(
  executor: EventOperationsSqlExecutor,
  command: Command,
): Promise<CanonicalMembershipMigrationApplyResult | null> {
  const runs = await executor.query<Row>(
    `select migration_id, schema_version, plan_hash, manifest_hash,
            expected_count, result_hash
       from event_ops_canonical_membership_migration_runs
      where workspace_id = $1 and migration_run_id = $2`,
    [command.workspaceId, command.migrationRunId],
  );
  if (runs.rows.length === 0) return null;
  if (runs.rows.length !== 1) {
    fail("CANONICAL_MEMBERSHIP_MIGRATION_LEDGER_CORRUPT");
  }
  const run = runs.rows[0]!;
  if (
    run.migration_id !== CANONICAL_MEMBERSHIP_MIGRATION_ID ||
    Number(run.schema_version) !== CANONICAL_MEMBERSHIP_MIGRATION_SCHEMA_VERSION ||
    run.plan_hash !== command.expectedPlanHash ||
    run.manifest_hash !== command.manifestHash ||
    Number(run.expected_count) !== command.expectedCount
  ) {
    fail("CANONICAL_MEMBERSHIP_MIGRATION_REPLAY_MISMATCH");
  }
  if (typeof run.result_hash !== "string" || !HASH.test(run.result_hash)) {
    fail("CANONICAL_MEMBERSHIP_MIGRATION_LEDGER_CORRUPT");
  }
  const eventRows = await executor.query<Row>(
    `select event_id, authority, event_aggregate_hash,
            deadline_evidence_hash, target_count
       from event_ops_canonical_membership_migration_events
      where workspace_id = $1 and migration_run_id = $2
      order by event_id collate "C"`,
    [command.workspaceId, command.migrationRunId],
  );
  const events = parseEventLedgerRows(eventRows.rows);
  const count = events.reduce((total, event) => {
    const next = total + event.targetCount;
    if (!Number.isSafeInteger(next)) {
      fail("CANONICAL_MEMBERSHIP_MIGRATION_LEDGER_CORRUPT");
    }
    return next;
  }, 0);
  if (count !== command.expectedCount) {
    fail("CANONICAL_MEMBERSHIP_MIGRATION_LEDGER_CORRUPT");
  }
  const resultHash = canonicalMembershipMigrationLedgerResultHash({
    events,
    run: runLedgerFact(command),
  });
  if (resultHash !== run.result_hash) {
    fail("CANONICAL_MEMBERSHIP_MIGRATION_LEDGER_CORRUPT");
  }
  return Object.freeze({
    count: command.expectedCount,
    planHash: command.expectedPlanHash,
    resultHash,
    status: "already_applied" as const,
  });
}

function parseReviewedManifest(rawManifest: unknown, command: Command) {
  if (
    typeof rawManifest !== "string" ||
    Buffer.byteLength(rawManifest, "utf8") < 1 ||
    Buffer.byteLength(rawManifest, "utf8") > MAX_RAW_MANIFEST_BYTES
  ) {
    fail("CANONICAL_MEMBERSHIP_MIGRATION_MANIFEST_INVALID");
  }
  const parsed = parseCanonicalMembershipOperatorManifest(rawManifest);
  if (
    parsed.blockers.length > 0 ||
    !parsed.manifest ||
    parsed.manifestHash !== command.manifestHash
  ) {
    fail("CANONICAL_MEMBERSHIP_MIGRATION_MANIFEST_INVALID");
  }
  return parsed;
}

async function lockMigrationScope(
  executor: EventOperationsSqlExecutor,
  command: Command,
): Promise<void> {
  const actorRows = await executor.query<{
    actor_id: unknown;
    event_id: unknown;
  }>(
    `select event_id, actor_id
       from (
         select membership.event_id, membership.actor_id
           from event_ops_membership_heads membership
           join event_ops_events event_row
             on event_row.workspace_id = membership.workspace_id
            and event_row.event_id = membership.event_id
          where membership.workspace_id = $1
            and event_row.lifecycle_state_v2 is not null
         union
         select record.target_id as event_id, record.user_id as actor_id
           from orbit_records record
           join event_ops_events event_row
             on event_row.workspace_id = record.workspace_id
            and event_row.event_id = record.target_id
          where record.workspace_id = $1
            and record.collection_name = 'event_registrations'
            and record.deleted_at is null
            and record.lifecycle_state <> 'deleted'
            and event_row.lifecycle_state_v2 is not null
            and event_row.registration_migration_state <> 'canonical'
       ) actor_scope
      order by event_id collate "C", actor_id collate "C"`,
    [command.workspaceId],
  );
  for (const row of actorRows.rows) {
    if (
      typeof row.event_id !== "string" ||
      typeof row.actor_id !== "string" ||
      !row.event_id ||
      !row.actor_id
    ) {
      continue;
    }
    await advisoryLock(
      executor,
      `event-operations-registration:${command.workspaceId}:${row.event_id}:${row.actor_id}`,
    );
  }
  await executor.query(
    `select event_id
       from event_ops_events
      where workspace_id = $1 and lifecycle_state_v2 is not null
      order by event_id collate "C"
      for update`,
    [command.workspaceId],
  );
  await executor.query(
    `select event_id
       from event_ops_configuration_heads
      where workspace_id = $1
      order by event_id collate "C"
      for update`,
    [command.workspaceId],
  );
  await executor.query(
    `select configuration.event_id, configuration.configuration_version
       from event_ops_configurations configuration
       join event_ops_configuration_heads head
         on head.workspace_id = configuration.workspace_id
        and head.event_id = configuration.event_id
        and head.configuration_version = configuration.configuration_version
      where configuration.workspace_id = $1
      order by configuration.event_id collate "C"
      for update of configuration`,
    [command.workspaceId],
  );
  await executor.query(
    `select event_id, actor_id
       from event_ops_membership_heads
      where workspace_id = $1
      order by event_id collate "C", actor_id collate "C"
      for update`,
    [command.workspaceId],
  );
  await executor.query(
    `select event_id, participant_id
       from event_ops_profile_heads
      where workspace_id = $1
      order by event_id collate "C", participant_id collate "C"
      for update`,
    [command.workspaceId],
  );
}

async function insertLedger(input: {
  command: Command;
  events: readonly CanonicalMembershipMigrationEventLedgerFact[];
  executor: EventOperationsSqlExecutor;
  resultHash: string;
}): Promise<void> {
  const now = await input.executor.query<{ value: unknown }>(
    `select statement_timestamp() as value`,
  );
  const appliedAt = now.rows[0]?.value;
  if (!(appliedAt instanceof Date) && typeof appliedAt !== "string") {
    fail("CANONICAL_MEMBERSHIP_MIGRATION_DATABASE_FAILED");
  }
  try {
    await input.executor.query(
      `insert into event_ops_canonical_membership_migration_runs (
         workspace_id, migration_run_id, migration_id, schema_version,
         plan_hash, manifest_hash, expected_count, result_hash,
         applied_at, created_at
       ) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$9)`,
      [
        input.command.workspaceId,
        input.command.migrationRunId,
        CANONICAL_MEMBERSHIP_MIGRATION_ID,
        CANONICAL_MEMBERSHIP_MIGRATION_SCHEMA_VERSION,
        input.command.expectedPlanHash,
        input.command.manifestHash,
        input.command.expectedCount,
        input.resultHash,
        appliedAt,
      ],
    );
  } catch (error) {
    if (sqlState(error) === "23505") {
      throw new CanonicalMembershipMigrationLedgerInsertConflict();
    }
    throw error;
  }
  for (const event of input.events) {
    await input.executor.query(
      `insert into event_ops_canonical_membership_migration_events (
         workspace_id, migration_run_id, event_id, authority,
         event_aggregate_hash, deadline_evidence_hash, target_count, created_at
       ) values ($1,$2,$3,$4,$5,$6,$7,$8)`,
      [
        input.command.workspaceId,
        input.command.migrationRunId,
        event.eventId,
        event.authority,
        event.eventAggregateHash,
        event.deadlineEvidenceHash,
        event.targetCount,
        appliedAt,
      ],
    );
  }
}

async function applyInTransaction(input: {
  command: Command;
  rawManifest: unknown;
  snapshot: CanonicalMembershipMigrationSnapshot;
}): Promise<CanonicalMembershipMigrationApplyResult> {
  const executor = input.snapshot.executor;
  await assertReady(executor);
  await advisoryLock(
    executor,
    `event-operations-canonical-membership-run:${input.command.workspaceId}:${input.command.migrationRunId}`,
  );
  const replay = await replayExistingRun(executor, input.command);
  if (replay) return replay;

  const parsedManifest = parseReviewedManifest(input.rawManifest, input.command);
  await advisoryLock(
    executor,
    `event-operations-canonical-membership-workspace:${input.command.workspaceId}`,
  );
  await advisoryLock(
    executor,
    `event-operations-canonical-membership-plan:${input.command.workspaceId}:${input.command.expectedPlanHash}`,
  );
  const duplicate = await executor.query<{ migration_run_id: unknown }>(
    `select migration_run_id
       from event_ops_canonical_membership_migration_runs
      where workspace_id = $1 and migration_id = $2 and plan_hash = $3`,
    [
      input.command.workspaceId,
      CANONICAL_MEMBERSHIP_MIGRATION_ID,
      input.command.expectedPlanHash,
    ],
  );
  if (duplicate.rows.length > 0) {
    fail("CANONICAL_MEMBERSHIP_MIGRATION_PLAN_ALREADY_APPLIED");
  }

  await lockMigrationScope(
    executor,
    input.command,
  );
  const source = await readCanonicalMembershipMigrationSource({
    snapshot: input.snapshot,
    workspaceId: input.command.workspaceId,
  });
  const plan = buildCanonicalMembershipMigrationPlan({
    facts: source.facts,
    parsedManifest,
    sourceBlockers: source.blockers,
  });
  if (
    !plan.applyEligible ||
    plan.applyPlanHash !== input.command.expectedPlanHash ||
    plan.manifestHash !== input.command.manifestHash ||
    plan.total.validRegistrations !== input.command.expectedCount ||
    plan.total.invalidRegistrations !== 0
  ) {
    fail("CANONICAL_MEMBERSHIP_MIGRATION_PLAN_DRIFT");
  }

  const events = plan.events.map(eventLedgerFact).sort((left, right) =>
    compareText(left.eventId, right.eventId),
  );
  const resultHash = canonicalMembershipMigrationLedgerResultHash({
    events,
    run: runLedgerFact(input.command),
  });
  await insertLedger({
    command: input.command,
    events,
    executor,
    resultHash,
  });

  const sourceByEvent = new Map(
    source.facts.map((fact) => [fact.eventId, fact]),
  );
  for (const event of plan.events) {
    if (event.action === "verify_canonical") continue;
    if (event.action !== "activate") {
      fail("CANONICAL_MEMBERSHIP_MIGRATION_PLAN_DRIFT");
    }
    const fact = sourceByEvent.get(event.eventId);
    if (!fact || fact.authority !== "legacy_registration") {
      fail("CANONICAL_MEMBERSHIP_MIGRATION_PLAN_DRIFT");
    }
    let applied;
    try {
      applied = await activateCanonicalRegistrationsWithExecutor({
        eventId: event.eventId,
        executor,
        registrations: fact.registrations,
        registrationMigrationOptions:
          event.deadline?.source === "operator_manifest"
            ? {
                evidenceId: event.deadline.evidenceId,
                profileEditDeadlineAt: event.deadline.profileEditDeadlineAt,
                source: "operator_manifest",
              }
            : undefined,
        workspaceId: input.command.workspaceId,
      });
    } catch (error) {
      if (error instanceof EventRegistrationWindowError) {
        fail("CANONICAL_MEMBERSHIP_MIGRATION_ACTIVATION_INVALID");
      }
      throw error;
    }
    if (
      applied.state !== "canonical" ||
      applied.count !== event.source.validCount ||
      applied.hash !== event.source.hash
    ) {
      fail("CANONICAL_MEMBERSHIP_MIGRATION_ACTIVATION_INVALID");
    }
  }

  return Object.freeze({
    count: input.command.expectedCount,
    planHash: input.command.expectedPlanHash,
    resultHash,
    status: "applied" as const,
  });
}

async function retryDelay(attempt: number): Promise<void> {
  const delay = Math.min(100, 10 * 2 ** attempt) + Math.floor(Math.random() * 10);
  await new Promise<void>((resolve) => setTimeout(resolve, delay));
}

export async function applyCanonicalMembershipMigration(
  commandInput: unknown,
  rawManifestInput: unknown,
): Promise<CanonicalMembershipMigrationApplyResult> {
  let command: Command;
  try {
    command = parseCanonicalMembershipMigrationApplyCommand(commandInput);
  } catch (error) {
    if (error instanceof CanonicalMembershipMigrationApplyCommandError) {
      fail("CANONICAL_MEMBERSHIP_MIGRATION_COMMAND_INVALID");
    }
    throw error;
  }

  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      return await withCanonicalMembershipMigrationSnapshot({
        connectionString: command.connectionString,
        isolation: "serializable",
        operation: (snapshot) =>
          applyInTransaction({
            command,
            rawManifest: rawManifestInput,
            snapshot,
          }),
      });
    } catch (error) {
      if (error instanceof CanonicalMembershipMigrationApplyError) throw error;
      const state = sqlState(error);
      const concurrentLedgerInsert =
        error instanceof CanonicalMembershipMigrationLedgerInsertConflict;
      if (
        !concurrentLedgerInsert &&
        state !== "40001" &&
        state !== "40P01"
      ) {
        fail("CANONICAL_MEMBERSHIP_MIGRATION_DATABASE_FAILED");
      }
      if (attempt === 2) {
        fail("CANONICAL_MEMBERSHIP_MIGRATION_RETRY_EXHAUSTED");
      }
      await retryDelay(attempt);
    }
  }
  fail("CANONICAL_MEMBERSHIP_MIGRATION_RETRY_EXHAUSTED");
}
