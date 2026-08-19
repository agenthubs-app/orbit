import { createHash } from "node:crypto";

import type {
  EventOperationsPostgresClient,
  EventOperationsSqlExecutor,
} from "../event-operations/storage/postgres-client";

export interface EventAnalyticsMigration {
  name: string;
  sql: string;
  version: number;
}

const EVENT_ANALYTICS_V1_SQL = `
create table event_analytics_roi_snapshots (
  workspace_id text not null,
  event_id text not null,
  metric_version text not null,
  revision bigint not null check (revision > 0),
  formula_hash text not null,
  window_ends_at timestamptz not null,
  finalized_at timestamptz not null,
  source_watermark jsonb not null check (jsonb_typeof(source_watermark) = 'object'),
  metrics jsonb not null check (jsonb_typeof(metrics) = 'object'),
  previous_revision bigint,
  recompute_reason text,
  primary key (workspace_id, event_id, metric_version, revision),
  foreign key (workspace_id, event_id, metric_version, previous_revision)
    references event_analytics_roi_snapshots (
      workspace_id, event_id, metric_version, revision
    ) on delete restrict,
  check (
    (revision = 1 and previous_revision is null and recompute_reason is null)
    or
    (revision > 1 and previous_revision = revision - 1 and length(btrim(recompute_reason)) > 0)
  )
);

create table event_analytics_roi_snapshot_heads (
  workspace_id text not null,
  event_id text not null,
  metric_version text not null,
  revision bigint not null check (revision > 0),
  updated_at timestamptz not null,
  primary key (workspace_id, event_id, metric_version),
  foreign key (workspace_id, event_id, metric_version, revision)
    references event_analytics_roi_snapshots (
      workspace_id, event_id, metric_version, revision
    ) on delete restrict
);
`;

export const EVENT_ANALYTICS_MIGRATIONS: readonly EventAnalyticsMigration[] = [
  {
    name: "event-analytics-v1-immutable-roi-snapshots",
    sql: EVENT_ANALYTICS_V1_SQL,
    version: 1,
  },
];

function statements(sql: string): readonly string[] {
  return sql.split(";").map((value) => value.trim()).filter(Boolean);
}

function checksum(sql: string): string {
  return createHash("sha256").update(sql).digest("hex");
}

async function ensureMigrationTable(
  transaction: EventOperationsSqlExecutor,
): Promise<void> {
  await transaction.query(`create table if not exists event_analytics_schema_migrations (
    version integer primary key,
    name text not null,
    checksum text not null,
    applied_at timestamptz not null default now()
  )`);
}

export async function runEventAnalyticsMigrations(
  client: EventOperationsPostgresClient,
  migrations: readonly EventAnalyticsMigration[] = EVENT_ANALYTICS_MIGRATIONS,
): Promise<void> {
  await client.transaction(async (transaction) => {
    await transaction.query(
      "select pg_advisory_xact_lock(hashtextextended('orbit:event-analytics-schema', 0))",
    );
    await ensureMigrationTable(transaction);
    for (const migration of [...migrations].sort(
      (left, right) => left.version - right.version,
    )) {
      const expectedChecksum = checksum(migration.sql);
      const existing = await transaction.query<{ checksum: string }>(
        "select checksum from event_analytics_schema_migrations where version = $1",
        [migration.version],
      );
      if (existing.rows[0]) {
        if (existing.rows[0].checksum !== expectedChecksum) {
          throw new Error(
            `Event analytics migration v${migration.version} checksum mismatch.`,
          );
        }
        continue;
      }
      for (const statement of statements(migration.sql)) {
        await transaction.query(statement);
      }
      await transaction.query(
        "insert into event_analytics_schema_migrations (version, name, checksum) values ($1, $2, $3)",
        [migration.version, migration.name, expectedChecksum],
      );
    }
  }, { isolation: "read committed" });
}
