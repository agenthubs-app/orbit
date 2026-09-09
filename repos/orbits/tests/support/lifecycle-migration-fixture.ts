import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { Pool } from "pg";
import type { LiveRecord } from "../../shared/storage/live-record-store";
import { ORBIT_RECORDS_SCHEMA_SQL } from "../../shared/storage/migrations";
import { createTransactionalPostgresClient, type TransactionalPostgresClient } from "../../shared/storage/transactional-postgres";
import type { LifecycleMigrationPlan } from "../../features/connections/lifecycle/migration-plan";
import { runLifecycleMigrationSchema } from "../../features/connections/lifecycle/migration-schema";

export const migrationActorId = "actor:migration-test";
export const migrationWorkspaceId = "workspace:migration-test";
export const migrationNow = "2026-09-09T01:00:00.000Z";
export const migrationManifest = { schemaVersion: 1 as const, actorId: migrationActorId, workspaceId: migrationWorkspaceId, ownerRepairs: [] };
// Only this dedicated test setting is read; never source application .env files.
const databaseUrl = process.env.ORBIT_LIFECYCLE_TEST_DATABASE_URL;
export const lifecycleMigrationDatabaseTest = { skip: databaseUrl ? false : "ORBIT_LIFECYCLE_TEST_DATABASE_URL is not configured" };

export function lifecycleMigrationFixtureRecord(collectionName: string, recordId: string, payload: Record<string, unknown>, userId: string | null = migrationActorId): LiveRecord {
  return { collectionName, recordId, payload, userId, workspaceId: migrationWorkspaceId, sourceType: "manual", sourceId: "source:retained", sourceLabel: "PRIVATE SOURCE", provider: "fixture", providerRecordId: "fixture:1", evidenceIds: ["evidence:retained"], targetType: "contact", targetId: "contact:a", occurredAt: migrationNow, lifecycleState: "active", searchText: "PRIVATE SEARCH", createdAt: migrationNow, updatedAt: migrationNow };
}

// Test-only literal approval. This helper is never imported by production code
// and cannot authorize any real-data migration.
export function lifecycleMigrationFixtureCommand(plan: LifecycleMigrationPlan) {
  return {
    manifest: structuredClone(migrationManifest), actorId: migrationActorId,
    operatorId: "operator:test-reviewer", runId: "run:test", now: migrationNow,
    review: { schemaVersion: 1 as const, actorId: migrationActorId, workspaceId: migrationWorkspaceId, sourceHash: plan.sourceHash, manifestHash: plan.manifestHash, planHash: plan.planHash, reviewedBy: "operator:test-reviewer", reviewedAt: "2026-09-09T00:30:00.000Z", approved: true as const },
  };
}

export interface LifecycleMigrationDatabaseFixture {
  client: TransactionalPostgresClient;
  insert(row: LiveRecord): Promise<void>;
  records(): Promise<readonly { workspace_id: string; collection_name: string; record_id: string; user_id: string | null; payload: Record<string, unknown>; [key: string]: unknown }[]>;
  receiptCount(): Promise<number>;
}

export async function withLifecycleMigrationDatabase(operation: (fixture: LifecycleMigrationDatabaseFixture) => Promise<void>) {
  assert.ok(databaseUrl, "An explicit isolated test database URL is required.");
  const schema = `migration_${randomUUID().replaceAll("-", "")}`;
  const admin = new Pool({ connectionString: databaseUrl, max: 1, connectionTimeoutMillis: 2000 });
  const pool = new Pool({ connectionString: databaseUrl, max: 4, connectionTimeoutMillis: 2000, options: `-c search_path=${schema} -c statement_timeout=5000` });
  const client = createTransactionalPostgresClient({ connectionString: databaseUrl, pool });
  try {
    await admin.query(`create schema ${schema}`);
    await client.query(ORBIT_RECORDS_SCHEMA_SQL);
    await runLifecycleMigrationSchema(client);
    await runLifecycleMigrationSchema(client);
    const insert = async (row: LiveRecord) => {
      await client.query("insert into orbit_records (workspace_id,collection_name,record_id,user_id,source_type,source_id,source_label,provider,provider_record_id,evidence_ids,target_type,target_id,occurred_at,lifecycle_state,search_text,payload,created_at,updated_at,deleted_at) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19)", [row.workspaceId,row.collectionName,row.recordId,row.userId ?? null,row.sourceType,row.sourceId,row.sourceLabel ?? null,row.provider ?? null,row.providerRecordId ?? null,[...row.evidenceIds],row.targetType ?? null,row.targetId ?? null,row.occurredAt ?? null,row.lifecycleState,row.searchText ?? "",row.payload,row.createdAt,row.updatedAt,row.deletedAt ?? null]);
    };
    await insert(lifecycleMigrationFixtureRecord("contacts", "contact:a", { id: "contact:a", stage: "active", displayName: "PRIVATE CONTACT", createdAt: migrationNow, updatedAt: migrationNow }));
    await insert(lifecycleMigrationFixtureRecord("connections", "connection:a", { id: "connection:a", contactId: "contact:a", accountId: migrationActorId, stage: "active", activeGoal: "PRIVATE GOAL", createdAt: migrationNow, updatedAt: migrationNow }));
    await operation({
      client, insert,
      records: async () => (await client.query<{ record: Awaited<ReturnType<LifecycleMigrationDatabaseFixture["records"]>>[number] }>("select to_jsonb(r) as record from orbit_records r order by workspace_id,collection_name,record_id")).rows.map(row => row.record),
      receiptCount: async () => Number((await client.query<{ count: string }>("select count(*)::text as count from relationship_lifecycle_migration_receipts")).rows[0].count),
    });
  } finally {
    await client.close();
    try { await admin.query(`drop schema if exists ${schema} cascade`); }
    finally { await admin.end(); }
  }
}
