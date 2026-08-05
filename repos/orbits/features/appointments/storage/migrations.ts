import { createHash } from "node:crypto";

import type { EventOperationsPostgresClient, EventOperationsSqlExecutor } from "../../events/event-operations/storage/postgres-client";

export interface AppointmentMigration {
  acceptedLegacyChecksums?: readonly string[];
  name: string;
  sql: string;
  version: number;
}

const APPOINTMENT_V1_SQL = `
create table appointment_aggregates (
  workspace_id text not null,
  appointment_id text not null,
  owner_actor_id text not null,
  invitee_actor_id text not null,
  contact_id text not null,
  event_id text,
  status text not null check (status in (
    'draft', 'awaiting_response', 'negotiating', 'confirmed',
    'reschedule_pending', 'cancelled', 'completed'
  )),
  version bigint not null check (version > 0),
  payload jsonb not null check (jsonb_typeof(payload) = 'object'),
  created_at timestamptz not null,
  updated_at timestamptz not null,
  primary key (workspace_id, appointment_id)
);

create index appointment_owner_updated_idx
  on appointment_aggregates (workspace_id, owner_actor_id, updated_at desc);
create index appointment_invitee_updated_idx
  on appointment_aggregates (workspace_id, invitee_actor_id, updated_at desc);
create index appointment_contact_idx
  on appointment_aggregates (workspace_id, contact_id, updated_at desc);

create table appointment_command_receipts (
  workspace_id text not null,
  idempotency_key text not null,
  actor_id text not null,
  appointment_id text not null,
  aggregate_version bigint not null,
  created_at timestamptz not null,
  primary key (workspace_id, actor_id, idempotency_key),
  foreign key (workspace_id, appointment_id)
    references appointment_aggregates (workspace_id, appointment_id)
    on delete cascade
);

create table appointment_outbox (
  workspace_id text not null,
  outbox_event_id text not null,
  appointment_id text not null,
  aggregate_version bigint not null,
  event_type text not null,
  dedupe_key text not null,
  payload jsonb not null check (jsonb_typeof(payload) = 'object'),
  status text not null default 'pending'
    check (status in ('pending', 'processing', 'completed', 'retry', 'failed', 'cancelled')),
  available_at timestamptz not null,
  attempt_count integer not null default 0 check (attempt_count >= 0),
  lease_token text,
  lease_expires_at timestamptz,
  last_error text,
  created_at timestamptz not null,
  updated_at timestamptz not null,
  primary key (workspace_id, outbox_event_id),
  unique (workspace_id, dedupe_key),
  foreign key (workspace_id, appointment_id)
    references appointment_aggregates (workspace_id, appointment_id)
    on delete cascade
);

create index appointment_outbox_claim_idx
  on appointment_outbox (workspace_id, status, available_at, lease_expires_at);
`;

const APPOINTMENT_V2_SQL = `
alter table appointment_aggregates
  add column relationship_pair_id text,
  add column authority_request_id text,
  add column contact_ids_by_actor jsonb;

update appointment_aggregates set
  relationship_pair_id = coalesce(payload ->> 'relationshipPairId', 'legacy-relationship:' || appointment_id),
  authority_request_id = coalesce(payload ->> 'authorityRequestId', 'legacy-authority:' || appointment_id),
  contact_ids_by_actor = coalesce(payload -> 'contactIdsByActor', jsonb_build_object(owner_actor_id, contact_id));

alter table appointment_aggregates
  alter column relationship_pair_id set not null,
  alter column authority_request_id set not null,
  alter column contact_ids_by_actor set not null,
  alter column contact_id drop not null;

create unique index appointment_active_relationship_pair_idx
  on appointment_aggregates (workspace_id, relationship_pair_id, coalesce(event_id, ''))
  where status not in ('cancelled', 'completed');
`;

const APPOINTMENT_V3_SQL = `
alter table appointment_command_receipts
  add column resource_id text,
  add column command text,
  add column request_hash text,
  add column response_snapshot jsonb;

update appointment_command_receipts receipt set
  resource_id = receipt.appointment_id,
  command = 'legacy-unversioned',
  request_hash = 'legacy:' || md5(receipt.actor_id || ':' || receipt.idempotency_key),
  response_snapshot = aggregate.payload
from appointment_aggregates aggregate
where aggregate.workspace_id = receipt.workspace_id
  and aggregate.appointment_id = receipt.appointment_id;

alter table appointment_command_receipts
  alter column resource_id set not null,
  alter column command set not null,
  alter column request_hash set not null,
  alter column response_snapshot set not null;
`;

const APPOINTMENT_V4_SQL = `
update appointment_outbox set
  status = 'retry',
  available_at = now(),
  attempt_count = 0,
  lease_token = null,
  lease_expires_at = null,
  last_error = 'Requeued after appointment action notification projector repair.',
  updated_at = now()
where status = 'completed'
  and event_type in (
    'appointment.proposed',
    'appointment.countered',
    'appointment.reschedule.proposed'
  )
  and payload #>> '{projection,policy}' = 'provider_not_configured'
  and jsonb_typeof(payload #> '{projection,notificationIds}') = 'array'
  and jsonb_array_length(payload #> '{projection,notificationIds}') = 0;
`;

export const APPOINTMENT_MIGRATIONS: readonly AppointmentMigration[] = [
  {
    acceptedLegacyChecksums: ["6017beac4ad0c360264be4f86301c34c3b401c5b8d5c84469875a2b852a6b70f"],
    name: "appointment-v1-aggregate-outbox",
    sql: APPOINTMENT_V1_SQL,
    version: 1,
  },
  { name: "appointment-v2-bilateral-relationship-identity", sql: APPOINTMENT_V2_SQL, version: 2 },
  { name: "appointment-v3-idempotency-request-snapshot", sql: APPOINTMENT_V3_SQL, version: 3 },
  { name: "appointment-v4-requeue-missed-action-notifications", sql: APPOINTMENT_V4_SQL, version: 4 },
];

export const APPOINTMENT_SCHEMA_VERSION = APPOINTMENT_MIGRATIONS.at(-1)!.version;
export const APPOINTMENT_SCHEMA_SQL = APPOINTMENT_MIGRATIONS.map((migration) => migration.sql).join("\n");

function statements(sql: string): readonly string[] {
  return sql.split(";").map((value) => value.trim()).filter(Boolean);
}

function checksum(sql: string): string {
  return createHash("sha256").update(sql).digest("hex");
}

async function ensureMigrationTable(transaction: EventOperationsSqlExecutor): Promise<void> {
  await transaction.query(`create table if not exists appointment_schema_migrations (
    version integer primary key,
    name text not null,
    checksum text not null,
    applied_at timestamptz not null default now()
  )`);
}

export async function runAppointmentMigrations(
  client: EventOperationsPostgresClient,
  migrations: readonly AppointmentMigration[] = APPOINTMENT_MIGRATIONS,
): Promise<void> {
  await client.transaction(async (transaction) => {
    await transaction.query("select pg_advisory_xact_lock(hashtextextended('orbit:appointment-schema', 0))");
    await ensureMigrationTable(transaction);
    for (const migration of [...migrations].sort((left, right) => left.version - right.version)) {
      const expectedChecksum = checksum(migration.sql);
      const existing = await transaction.query<{ checksum: string }>(
        "select checksum from appointment_schema_migrations where version = $1",
        [migration.version],
      );
      if (existing.rows[0]) {
        if (existing.rows[0].checksum !== expectedChecksum && !migration.acceptedLegacyChecksums?.includes(existing.rows[0].checksum)) throw new Error(`Appointment migration v${migration.version} checksum mismatch.`);
        continue;
      }
      for (const statement of statements(migration.sql)) await transaction.query(statement);
      await transaction.query(
        "insert into appointment_schema_migrations (version, name, checksum) values ($1, $2, $3)",
        [migration.version, migration.name, expectedChecksum],
      );
    }
  // The transaction-scoped advisory lock is the serialization mechanism.
  // READ COMMITTED intentionally takes a fresh snapshot after a concurrent
  // runner releases the lock; SERIALIZABLE would retain a pre-lock snapshot
  // and could replay already-applied DDL.
  }, { isolation: "read committed" });
}
