import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test, { type TestContext } from "node:test";
import { Pool } from "pg";

import { createDomainReadService } from "../../features/sync/domain-read-service";
import { DASHBOARD_SYNC_DOMAINS, RECORD_SYNC_DOMAINS } from "../../features/sync/domain-registry";
import { createIncrementalSyncReadService } from "../../features/sync/read-service";
import { ORBIT_RECORDS_SCHEMA_SQL } from "../../shared/storage/migrations";
import { createTransactionalPostgresClient } from "../../shared/storage/transactional-postgres";
import { STRICT_SYNC_REVISION_SQL, testRawWrite } from "../support/sync-revision-fixture";

// Sprint 0117 (found while building the dashboard-graph reader): a sync page
// query that selects `sync_revision::text as sync_revision` and then says
// `order by sync_revision` sorts by the text column ("100" < "99"). Across a
// revision digit boundary a page would then hold the text-smallest rows and its
// cursor would jump past rows it never sent. Every page must order by the
// numeric revision.

const databaseUrl = process.env.ORBIT_LIFECYCLE_TEST_DATABASE_URL;
const options = { skip: databaseUrl ? false : "Explicit isolated PostgreSQL URL required", timeout: 60_000 };
const W = "workspace:revision-order";
const A = "actor:revision-order";
const SECRET = "revision-order-secret-0123456789abcdef0123456789abcdef";

async function host(t: TestContext) {
  assert.ok(databaseUrl);
  const schema = `revision_order_${randomUUID().replaceAll("-", "")}`;
  const admin = new Pool({ connectionString: databaseUrl, max: 1 });
  const pool = new Pool({ connectionString: databaseUrl, max: 2, options: `-c search_path=${schema} -c statement_timeout=15000` });
  const client = createTransactionalPostgresClient({ connectionString: databaseUrl, pool });
  t.after(async () => { try { await client.close(); } finally { try { await admin.query(`drop schema if exists ${schema} cascade`); } finally { await admin.end(); } } });
  await admin.query(`create schema ${schema}`);
  await client.query(ORBIT_RECORDS_SCHEMA_SQL);
  await client.query(STRICT_SYNC_REVISION_SQL);
  await client.query(`insert into orbit_records (workspace_id, collection_name, record_id, user_id, source_type, source_id, evidence_ids, lifecycle_state, search_text, payload, created_at, updated_at)
    values ($1, 'accounts', $2, $2, 'manual', $2, '{}', 'active', '', '{}'::jsonb, now(), now())`, [W, A]);
  // The next revisions straddle 99 → 100.
  await client.query("select setval('orbit_records_sync_revision_seq', 96)");
  return client;
}

async function insert(client: Awaited<ReturnType<typeof host>>, collection: string, ids: string[], lifecycle: "active" | "deleted") {
  for (const id of ids) {
    await testRawWrite(client, collection, `insert into orbit_records (workspace_id, collection_name, record_id, user_id, source_type, source_id, evidence_ids, lifecycle_state, search_text, payload, created_at, updated_at, deleted_at)
      values ($1, $2, $3, $4, 'manual', $3, '{}', $5, '', $6::jsonb, now(), now(), case when $5 = 'deleted' then now() end)`,
    [W, collection, id, A, lifecycle, JSON.stringify({ id, displayName: id, stage: "active", source: { type: "manual", id: `s:${id}` }, evidenceIds: [`e:${id}`], createdAt: "2026-09-01T00:00:00.000Z", updatedAt: "2026-09-01T00:00:00.000Z" })]);
  }
}

test("domain pages (records and dashboard graph) and the v1 page keep numeric revision order across a digit boundary", options, async (t) => {
  const client = await host(t);
  await insert(client, "notes", ["n97", "n98", "n99", "n100", "n101"], "deleted");
  await insert(client, "contacts", ["c102", "c103", "c104", "c105"], "active");
  const revisions = (await client.query<{ record_id: string; sync_revision: string }>("select record_id, sync_revision::text from orbit_records where collection_name in ('notes', 'contacts') order by orbit_records.sync_revision")).rows;
  assert.deepEqual(revisions.map((row) => row.sync_revision), ["97", "98", "99", "100", "101", "102", "103", "104", "105"], "the fixture straddles the boundary");

  for (const [domainId, domains, expected] of [
    ["notes", RECORD_SYNC_DOMAINS, ["n97", "n98", "n99", "n100", "n101"]],
    ["dashboard-graph", DASHBOARD_SYNC_DOMAINS, ["contacts/c102", "contacts/c103", "contacts/c104", "contacts/c105"]],
  ] as const) {
    const service = createDomainReadService({ client, cursorSecret: SECRET, now: () => "2026-09-28T00:00:00.000Z", domains });
    const ids: string[] = [];
    let cursor: string | undefined;
    for (let page = 0; page < 10; page += 1) {
      const result = await service.readDomainPage({ actorId: A, workspaceId: W, domainId, limit: 2, ...(cursor ? { cursor } : {}) });
      ids.push(...result.changes.map((change) => change.id));
      cursor = result.nextCursor;
      if (!result.hasMore) break;
    }
    assert.deepEqual(ids, expected, `${domainId}: every row, in revision order`);
  }

  const v1 = createIncrementalSyncReadService({ client, cursorSecret: SECRET, now: () => "2026-09-28T00:00:00.000Z" });
  const ids: string[] = [];
  let cursor: string | undefined;
  for (let page = 0; page < 10; page += 1) {
    const result = await v1.readPage({ actorId: A, workspaceId: W, limit: 2, ...(cursor ? { cursor } : {}) });
    ids.push(...result.changes.map((change) => change.id));
    cursor = result.nextCursor;
    if (!result.hasMore) break;
  }
  assert.deepEqual(ids, ["n97", "n98", "n99", "n100", "n101"], "v1 /api/sync: every row, in revision order");
});
