import { createHash } from "node:crypto";

import type {
  EventOperationsPostgresClient,
  EventOperationsSqlExecutor,
} from "../../event-operations/storage/postgres-client";

export interface EventExperienceMigration {
  name: string;
  sql: string;
  version: number;
}

const EVENT_EXPERIENCE_V1_SQL = `
create table event_ops_experience_versions (
  workspace_id text not null,
  event_id text not null,
  experience_version bigint not null check (experience_version > 0),
  configuration jsonb not null check (jsonb_typeof(configuration) = 'object'),
  configuration_hash text not null,
  created_by_actor_id text not null,
  created_at timestamptz not null,
  primary key (workspace_id, event_id, experience_version),
  foreign key (workspace_id, event_id)
    references event_ops_events (workspace_id, event_id) on delete cascade
);

create table event_ops_experience_heads (
  workspace_id text not null,
  event_id text not null,
  draft_version bigint,
  published_version bigint,
  revision bigint not null default 0 check (revision >= 0),
  published_at timestamptz,
  frozen_at timestamptz,
  primary key (workspace_id, event_id),
  foreign key (workspace_id, event_id)
    references event_ops_events (workspace_id, event_id) on delete cascade,
  foreign key (workspace_id, event_id, draft_version)
    references event_ops_experience_versions (workspace_id, event_id, experience_version)
    on delete restrict,
  foreign key (workspace_id, event_id, published_version)
    references event_ops_experience_versions (workspace_id, event_id, experience_version)
    on delete restrict
);

create index event_ops_experience_versions_created_idx
  on event_ops_experience_versions (workspace_id, event_id, created_at desc);
`;

export const EVENT_EXPERIENCE_MIGRATIONS: readonly EventExperienceMigration[] = [
  {
    name: "event-experience-v1-versioned-heads",
    sql: EVENT_EXPERIENCE_V1_SQL,
    version: 1,
  },
];

function statements(sql: string): readonly string[] {
  return sql
    .split(";")
    .map((value) => value.trim())
    .filter(Boolean);
}

function checksum(sql: string): string {
  return createHash("sha256").update(sql).digest("hex");
}

export const EVENT_EXPERIENCE_SCHEMA_MIGRATIONS =
  EVENT_EXPERIENCE_MIGRATIONS.map((migration) => ({
    checksum: checksum(migration.sql),
    name: migration.name,
    version: migration.version,
  }));

async function ensureMigrationTable(
  transaction: EventOperationsSqlExecutor,
): Promise<void> {
  await transaction.query(`create table if not exists event_ops_experience_schema_migrations (
    version integer primary key check (version > 0),
    name text not null,
    checksum text not null,
    applied_at timestamptz not null default now()
  )`);
}

/**
 * Apply the feature-owned schema only after event-operations has created its
 * event table. The ledger and advisory lock make a retry safe while the
 * checksum prevents silently changing an applied migration in place.
 */
export async function runEventExperienceMigrations(
  client: EventOperationsPostgresClient,
  migrations: readonly EventExperienceMigration[] = EVENT_EXPERIENCE_MIGRATIONS,
): Promise<void> {
  await client.transaction(async (transaction) => {
    await transaction.query(
      "select pg_advisory_xact_lock(hashtextextended('orbit:event-experience-schema', 0))",
    );
    await ensureMigrationTable(transaction);
    for (const migration of [...migrations].sort(
      (left, right) => left.version - right.version,
    )) {
      const expectedChecksum = checksum(migration.sql);
      const existing = await transaction.query<{ checksum: string }>(
        "select checksum from event_ops_experience_schema_migrations where version = $1",
        [migration.version],
      );
      if (existing.rows[0]) {
        if (existing.rows[0].checksum !== expectedChecksum) {
          throw new Error(
            `Event experience migration v${migration.version} checksum mismatch.`,
          );
        }
        continue;
      }
      for (const statement of statements(migration.sql)) {
        await transaction.query(statement);
      }
      await transaction.query(
        "insert into event_ops_experience_schema_migrations (version, name, checksum) values ($1, $2, $3)",
        [migration.version, migration.name, expectedChecksum],
      );
    }
  }, { isolation: "read committed" });
}
