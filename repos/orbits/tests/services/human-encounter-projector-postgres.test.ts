import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";

import { Pool } from "pg";

import { createPostgresHumanEncounterProjectionRepository } from "../../features/encounters/projection-repository";
import { projectPendingHumanEncounters } from "../../features/encounters/projector";
import type { HumanEncounterRecord } from "../../features/encounters/service";
import { createEventOperationsPostgresClient } from "../../features/events/event-operations/storage/postgres-client";
import { loadLocalEnv } from "../../scripts/load-local-env";
import { ORBIT_RECORDS_SCHEMA_SQL } from "../../shared/storage/migrations";

loadLocalEnv();
const databaseUrl = process.env.ORBIT_EVENT_DATABASE_URL;

function encounter(id: string, observedAt: string, noteText: string): HumanEncounterRecord {
  return {
    actorId: "actor:aiko",
    commitments: ["Send a bilingual procurement brief", "Introduce the mobility data owner"],
    connectionId: "connection:aiko-ren",
    contactId: "contact:ren",
    createdAt: observedAt,
    encounterId: id,
    eventId: "event:tokyo-ai-night",
    nextStep: "Meet with the data owner next Friday",
    noteText,
    observedAt,
    privacy: "private",
    requestHash: `request-hash:${id}`,
    projection: { attempts: 0, availableAt: "2026-08-04T06:00:00.000Z", lastError: null, leaseExpiresAt: null, leaseToken: null, status: "pending" },
    talked: "yes",
    tags: ["mobility", "cross-border"],
    voiceMemoReference: null,
  };
}

test("PostgreSQL encounter workers lease durably, serialize same-contact append, and recover an in-transaction crash", { skip: databaseUrl ? false : "ORBIT_EVENT_DATABASE_URL is not configured" }, async () => {
  assert.ok(databaseUrl);
  const schema = `encounter_projector_${randomUUID().replaceAll("-", "")}`;
  const workspaceId = `workspace:${randomUUID()}`;
  const admin = new Pool({ connectionString: databaseUrl, max: 1 });
  const pool = new Pool({ connectionString: databaseUrl, max: 6, options: `-c search_path=${schema}` });
  const runtime = { client: createEventOperationsPostgresClient({ connectionString: databaseUrl, pool }), workspaceId };
  try {
    await admin.query(`create schema ${schema}`);
    await pool.query(ORBIT_RECORDS_SCHEMA_SQL);
    const values = [
      encounter("encounter:parallel:one", "2026-08-04T05:40:00.000Z", "First detailed conversation about enterprise AI procurement."),
      encounter("encounter:parallel:two", "2026-08-04T05:45:00.000Z", "Second detailed conversation about a mobility data pilot."),
    ];
    for (const value of values) {
      await pool.query(`insert into orbit_records (
        workspace_id, collection_name, record_id, user_id, source_type, source_id,
        source_label, evidence_ids, target_type, target_id, occurred_at,
        lifecycle_state, search_text, payload, created_at, updated_at
      ) values ($1, 'human_encounters', $2, $3, 'event_import', $4,
        'Explicit human encounter', '{}', 'contact', $5, $6,
        'active', $7, $8::jsonb, $6, $6)`, [workspaceId, value.encounterId, value.actorId, value.eventId, value.contactId, value.observedAt, value.noteText, JSON.stringify(value)]);
    }
    const repository = createPostgresHumanEncounterProjectionRepository(runtime);
    const [workerA, workerB] = await Promise.all([
      projectPendingHumanEncounters({ limit: 1, now: () => "2026-08-04T06:00:00.000Z", repository, workerId: "worker:a" }),
      projectPendingHumanEncounters({ limit: 1, now: () => "2026-08-04T06:00:00.000Z", repository, workerId: "worker:b" }),
    ]);
    assert.equal(workerA.completed + workerB.completed, 2);
    const detail = await pool.query<{ payload: { notes: readonly { noteId: string }[] } }>("select payload from orbit_records where workspace_id = $1 and collection_name = 'contact_detail_states'", [workspaceId]);
    assert.equal(detail.rows[0]?.payload.notes.length, 2);
    assert.equal(new Set(detail.rows[0]?.payload.notes.map((note) => note.noteId)).size, 2);

    const crash = encounter("encounter:crash", "2026-08-04T05:50:00.000Z", "A crash-safe follow-up record with concrete commitments.");
    await pool.query(`insert into orbit_records (
      workspace_id, collection_name, record_id, user_id, source_type, source_id,
      source_label, evidence_ids, target_type, target_id, occurred_at,
      lifecycle_state, search_text, payload, created_at, updated_at
    ) values ($1, 'human_encounters', $2, $3, 'event_import', $4,
      'Explicit human encounter', '{}', 'contact', $5, $6,
      'active', $7, $8::jsonb, $6, $6)`, [workspaceId, crash.encounterId, crash.actorId, crash.eventId, crash.contactId, crash.observedAt, crash.noteText, JSON.stringify(crash)]);
    const failed = await projectPendingHumanEncounters({ afterContactWrite: async () => { throw new Error("crash after contact write"); }, now: () => "2026-08-04T06:00:00.000Z", repository, workerId: "worker:crash" });
    assert.equal(failed.retried, 1);
    const afterCrash = await pool.query<{ payload: { notes: readonly { noteId: string }[] } }>("select payload from orbit_records where workspace_id = $1 and collection_name = 'contact_detail_states'", [workspaceId]);
    assert.equal(afterCrash.rows[0]?.payload.notes.filter((note) => note.noteId === `note:${crash.encounterId}`).length, 0, "contact append rolled back with source completion");
    const recovered = await projectPendingHumanEncounters({ now: () => "2026-08-04T06:01:00.000Z", repository, workerId: "worker:recovered" });
    assert.equal(recovered.completed, 1);
    const final = await pool.query<{ payload: { notes: readonly { noteId: string }[] } }>("select payload from orbit_records where workspace_id = $1 and collection_name = 'contact_detail_states'", [workspaceId]);
    assert.equal(final.rows[0]?.payload.notes.filter((note) => note.noteId === `note:${crash.encounterId}`).length, 1);
  } finally {
    await runtime.client.close();
    await admin.query(`drop schema if exists ${schema} cascade`);
    await admin.end();
  }
});
