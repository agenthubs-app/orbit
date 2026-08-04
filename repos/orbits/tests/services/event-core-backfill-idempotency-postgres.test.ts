import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";

import { Pool } from "pg";

import {
  applyEventCoreBackfillPlan,
  buildEventCoreBackfillPlan,
} from "../../features/events/core/backfill";
import { readEventCoreBackfillCandidates } from "../../features/events/core/backfill-sources";
import { EVENT_CANONICAL_V1_MANIFEST } from "../../features/events/core/migration/manifests/event-canonical-v1";
import { createEventOperationsPostgresClient } from "../../features/events/event-operations/storage/postgres-client";
import { runOrbitRecordsMigration } from "../../shared/storage/migrations";

const databaseUrl = process.env.ORBIT_EVENT_DATABASE_URL;

test(
  "canonical backfill is idempotent with and without a legacy event_ops row",
  {
    skip: databaseUrl ? false : "ORBIT_EVENT_DATABASE_URL is not configured",
    timeout: 30_000,
  },
  async () => {
    assert.ok(databaseUrl);
    const schema = `event_core_idempotency_${randomUUID().replaceAll("-", "")}`;
    const workspaceId = `workspace:idempotency:${schema}`;
    const adminPool = new Pool({ connectionString: databaseUrl, max: 1 });
    const migrationPool = new Pool({
      connectionString: databaseUrl,
      max: 1,
      options: `-c search_path=${schema}`,
    });
    const operationPool = new Pool({
      connectionString: databaseUrl,
      max: 1,
      options: `-c search_path=${schema}`,
    });
    const client = createEventOperationsPostgresClient({
      connectionString: databaseUrl,
      max: 1,
      pool: operationPool,
    });

    try {
      await adminPool.query(`create schema ${schema}`);
      await runOrbitRecordsMigration(migrationPool);
      await migrationPool.query(
        `insert into event_ops_events (
           workspace_id, event_id, organizer_actor_id, lifecycle_state,
           revision, created_at, updated_at, source_payload
         ) values (
           $1, 'event_signup_02', 'account:idempotency-owner', 'active',
           1, now(), now(), $2::jsonb
         )`,
        [workspaceId, JSON.stringify({ legacyEvidenceId: "evidence:legacy:event_signup_02" })],
      );
      await migrationPool.query(
        `insert into orbit_records (
           workspace_id, collection_name, record_id, user_id, source_type,
           source_id, evidence_ids, lifecycle_state, search_text, payload,
           created_at, updated_at
         ) values
         ($1, 'events', 'event_signup_02', 'account:idempotency-owner',
          'event_import', 'source:idempotency:event_signup_02', '{}', 'active', '',
          $2::jsonb, now(), now()),
         ($1, 'events', 'event_signup_03', 'account:idempotency-owner',
          'event_import', 'source:idempotency:event_signup_03', '{}', 'active', '',
          $3::jsonb, now(), now())`,
        [
          workspaceId,
          JSON.stringify({
            endsAt: "2026-09-01T14:00:00+09:00",
            location: "东京",
            name: "东京 AI 落地伙伴报名会",
            startsAt: "2026-09-01T14:00:00+09:00",
          }),
          JSON.stringify({
            endsAt: "2026-09-15T18:00:00+09:00",
            location: "东京",
            name: "日中投资人与创业者报名沙龙",
            startsAt: "2026-09-15T18:00:00+09:00",
          }),
        ],
      );

      const firstCandidates = await readEventCoreBackfillCandidates({
        client,
        defaultTimezone: "Asia/Tokyo",
        publicOwnerActorId: "account:idempotency-owner",
        workspaceId,
      });
      const firstPlan = buildEventCoreBackfillPlan(
        firstCandidates,
        EVENT_CANONICAL_V1_MANIFEST,
      );
      await applyEventCoreBackfillPlan({
        client,
        now: "2026-08-04T00:00:00.000Z",
        plan: firstPlan,
        workspaceId,
      });

      const firstState = await client.query<{
        content_hash: string;
        event_id: string;
        event_version: number;
        version_count: number;
      }>(
        `select e.event_id, e.event_version, v.content_hash,
                count(all_versions.event_version)::int as version_count
         from event_ops_events e
         join event_event_versions v
           on v.workspace_id = e.workspace_id
          and v.event_id = e.event_id
          and v.event_version = e.event_version
         join event_event_versions all_versions
           on all_versions.workspace_id = e.workspace_id
          and all_versions.event_id = e.event_id
         where e.workspace_id = $1
           and e.event_id in ('event_signup_02', 'event_signup_03')
         group by e.event_id, e.event_version, v.content_hash
         order by e.event_id`,
        [workspaceId],
      );
      assert.deepEqual(
        firstState.rows.map((row) => ({
          eventId: row.event_id,
          eventVersion: Number(row.event_version),
          versionCount: Number(row.version_count),
        })),
        [
          { eventId: "event_signup_02", eventVersion: 1, versionCount: 1 },
          { eventId: "event_signup_03", eventVersion: 1, versionCount: 1 },
        ],
      );

      const secondCandidates = await readEventCoreBackfillCandidates({
        client,
        defaultTimezone: "Asia/Tokyo",
        publicOwnerActorId: "account:idempotency-owner",
        workspaceId,
      });
      const secondPlan = buildEventCoreBackfillPlan(
        secondCandidates,
        EVENT_CANONICAL_V1_MANIFEST,
      );
      assert.equal(secondPlan.hash, firstPlan.hash);
      assert.deepEqual(
        secondPlan.events.map((event) => event.contentHash),
        firstPlan.events.map((event) => event.contentHash),
      );

      await applyEventCoreBackfillPlan({
        client,
        now: "2026-08-04T01:00:00.000Z",
        plan: secondPlan,
        workspaceId,
      });
      const secondState = await client.query<{
        alias_count: number;
        content_hash: string;
        event_id: string;
        event_version: number;
        version_count: number;
      }>(
        `select e.event_id, e.event_version, v.content_hash,
                (select count(*)::int from event_event_versions versions
                 where versions.workspace_id = e.workspace_id
                   and versions.event_id = e.event_id) as version_count,
                (select count(*)::int from event_aliases aliases
                 where aliases.workspace_id = e.workspace_id
                   and aliases.event_id = e.event_id) as alias_count
         from event_ops_events e
         join event_event_versions v
           on v.workspace_id = e.workspace_id
          and v.event_id = e.event_id
          and v.event_version = e.event_version
         where e.workspace_id = $1
           and e.event_id in ('event_signup_02', 'event_signup_03')
         order by e.event_id`,
        [workspaceId],
      );
      for (const row of secondState.rows) {
        const planned = secondPlan.events.find(
          (event) => event.eventId === row.event_id,
        );
        assert.equal(Number(row.event_version), 1);
        assert.equal(Number(row.version_count), 1);
        assert.equal(row.content_hash, planned?.contentHash);
        assert.equal(Number(row.alias_count), planned?.aliases.length);
      }
    } finally {
      await client.close();
      await migrationPool.end();
      await adminPool.query(`drop schema if exists ${schema} cascade`);
      await adminPool.end();
    }
  },
);
