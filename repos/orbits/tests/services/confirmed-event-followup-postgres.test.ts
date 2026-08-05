import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";

import { Pool } from "pg";

import { CONFIRMED_EVENT_FOLLOWUP_COLLECTION, createConfirmedEventFollowupService } from "../../features/events/confirmed-followup/service";
import type { HumanEncounterRecord } from "../../features/encounters/service";
import { createStorageFollowupActionWriter } from "../../features/followups/action-writer";
import { createStorageReminderActionWriter } from "../../features/notifications/action-writer";
import { loadLocalEnv } from "../../scripts/load-local-env";
import { ORBIT_RECORDS_SCHEMA_SQL } from "../../shared/storage/migrations";
import { createPostgresLiveRecordStore } from "../../shared/storage/postgres-live-record-store";

loadLocalEnv();

const databaseUrl = process.env.ORBIT_EVENT_DATABASE_URL;

test(
  "PostgreSQL persists one actor-scoped task and in-app reminder for concurrent idempotent confirmations",
  { skip: databaseUrl ? false : "ORBIT_EVENT_DATABASE_URL is not configured" },
  async () => {
    assert.ok(databaseUrl);
    const schema = `confirmed_followup_${randomUUID().replaceAll("-", "")}`;
    const workspaceId = `workspace:confirmed-followup:${randomUUID()}`;
    const actorId = "actor:aiko-pg";
    const eventId = "event:tokyo-ai-night-pg";
    const encounter: HumanEncounterRecord = {
      actorId,
      commitments: ["Share the bilingual procurement scorecard"],
      connectionId: null,
      contactId: "contact:ren-owned-by-aiko-pg",
      createdAt: "2026-08-05T08:00:00.000Z",
      encounterId: "encounter:aiko-ren-pg",
      eventId,
      nextStep: "Schedule a thirty-minute pilot review",
      noteText: "Reviewed Japanese retail procurement constraints and measurable pilot gates.",
      observedAt: "2026-08-05T07:45:00.000Z",
      privacy: "private",
      projection: { attempts: 0, availableAt: "2026-08-05T08:00:00.000Z", lastError: null, leaseExpiresAt: null, leaseToken: null, status: "pending" },
      requestHash: "hash:pg",
      talked: "yes",
      tags: ["procurement", "pilot"],
      voiceMemoReference: null,
    };
    const admin = new Pool({ connectionString: databaseUrl, max: 1 });
    const pool = new Pool({ connectionString: databaseUrl, max: 4, options: `-c search_path=${schema}` });
    try {
      await admin.query(`create schema ${schema}`);
      for (const statement of ORBIT_RECORDS_SCHEMA_SQL.split(";")) {
        if (statement.trim()) await pool.query(statement);
      }
      const store = createPostgresLiveRecordStore<Record<string, unknown>>({
        client: {
          async query(text, values) {
            const result = await pool.query(text, values === undefined ? undefined : [...values]);
            return { rows: result.rows };
          },
        },
      });
      const service = createConfirmedEventFollowupService({
        encounters: { async list() { return [encounter]; } },
        followups: createStorageFollowupActionWriter({ store, userId: actorId, workspaceId }),
        now: () => "2026-08-05T08:00:00.000Z",
        reminders: createStorageReminderActionWriter({ store, userId: actorId, workspaceId }),
        store,
        workspaceId,
      });
      const input = { actorId, dueAt: "2026-08-12T06:30:00.000Z", encounterId: encounter.encounterId, eventId, sourceIndex: 0, sourceKind: "next_step" as const };
      const [left, right] = await Promise.all([service.confirm(input), service.confirm(input)]);
      assert.equal(left.taskId, right.taskId);
      assert.equal(left.reminderId, right.reminderId);
      const persisted = await pool.query<{ collection_name: string; evidence_ids: string[]; payload: Record<string, unknown>; user_id: string }>(`
        select collection_name, evidence_ids, payload, user_id
        from orbit_records
        where workspace_id = $1 and collection_name = any($2::text[])
        order by collection_name
      `, [workspaceId, [CONFIRMED_EVENT_FOLLOWUP_COLLECTION, "notifications", "tasks"]]);
      assert.equal(persisted.rowCount, 3);
      assert.deepEqual(persisted.rows.map((row) => row.collection_name), [CONFIRMED_EVENT_FOLLOWUP_COLLECTION, "notifications", "tasks"]);
      assert.ok(persisted.rows.every((row) => row.user_id === actorId));
      assert.ok(persisted.rows.every((row) => row.evidence_ids[0] === `evidence:human-encounter:${encounter.encounterId}`));
      const marker = persisted.rows.find((row) => row.collection_name === CONFIRMED_EVENT_FOLLOWUP_COLLECTION);
      assert.equal((marker?.payload.provenance as Record<string, unknown>).eventId, eventId);
      assert.equal(marker?.payload.taskHref, "/app/followups");
      assert.equal(persisted.rows.find((row) => row.collection_name === "notifications")?.payload.channel, "in_app");
    } finally {
      await pool.end();
      await admin.query(`drop schema if exists ${schema} cascade`);
      await admin.end();
    }
  },
);
