import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test, { type TestContext } from "node:test";
import { Pool } from "pg";

import { createSyncDomainHandlers } from "../../app/api/sync/domain-handlers";
import { createDomainReadService } from "../../features/sync/domain-read-service";
import { SYNC_DOMAINS } from "../../features/sync/domain-registry";
import { domainManifestSchema } from "../../shared/api-schema/universal-read";
import { ORBIT_RECORDS_SCHEMA_SQL } from "../../shared/storage/migrations";
import { createPostgresLiveRecordStore } from "../../shared/storage/postgres-live-record-store";
import { createTransactionalPostgresClient } from "../../shared/storage/transactional-postgres";
import { STRICT_SYNC_REVISION_SQL } from "../support/sync-revision-fixture";

// Sprint 0118 (coordinator item from 0117): the manifest's conditional read
// keyed its ETag on max(updated_at) + count(*) of the actor's sync collections.
// A write that sets updated_at to an earlier time (a replayed client save, a
// backfill, a clock step) moves neither, so the route answered 304 and the
// device kept its stale copy. Every write takes a new sync_revision from one
// sequence, so the key is now built from max(sync_revision) of every source the
// manifest covers; this test writes an earlier updated_at and still sees 200.

const databaseUrl = process.env.ORBIT_LIFECYCLE_TEST_DATABASE_URL;
const options = { skip: databaseUrl ? false : "Explicit isolated PostgreSQL URL required", timeout: 60_000 };
const W = "workspace:manifest-watermark";
const A = "actor:manifest-a";
const B = "actor:manifest-b";
const SECRET = "manifest-watermark-secret-0123456789abcdef0123456789";
const NOW = "2026-09-28T00:00:00.000Z";

async function host(t: TestContext) {
  assert.ok(databaseUrl);
  assert.ok(["localhost", "127.0.0.1"].includes(new URL(databaseUrl).hostname), "local Postgres only");
  const schema = `manifest_watermark_${randomUUID().replaceAll("-", "")}`;
  const admin = new Pool({ connectionString: databaseUrl, max: 1 });
  const pool = new Pool({ connectionString: databaseUrl, max: 4, options: `-c search_path=${schema} -c statement_timeout=15000` });
  const client = createTransactionalPostgresClient({ connectionString: databaseUrl, pool });
  t.after(async () => { try { await client.close(); } finally { try { await admin.query(`drop schema if exists ${schema} cascade`); } finally { await admin.end(); } } });
  await admin.query(`create schema ${schema}`);
  await client.query(ORBIT_RECORDS_SCHEMA_SQL);
  await client.query(STRICT_SYNC_REVISION_SQL);
  const store = createPostgresLiveRecordStore({ client });
  for (const actor of [A, B]) {
    await store.upsertRecord({
      workspaceId: W, collectionName: "accounts", recordId: actor, userId: actor, sourceType: "manual", sourceId: actor, evidenceIds: [],
      lifecycleState: "active", createdAt: "2026-09-01T00:00:00.000Z", updatedAt: "2026-09-01T00:00:00.000Z", payload: { id: actor },
    });
  }
  const service = createDomainReadService({ client, cursorSecret: SECRET, now: () => NOW, domains: SYNC_DOMAINS.filter((domain) => domain.source.kind !== "event_derived") });
  const handlers = (actor: string) => createSyncDomainHandlers({
    resolveActor: async () => ({ id: actor, userId: actor, workspaceId: W }), createService: () => service, now: () => Date.parse(NOW),
    conditionalRead: { client, workspaceId: W, version: "test" },
  });
  const note = (id: string, title: string, updatedAt: string, userId = A) => store.upsertRecord({
    workspaceId: W, collectionName: "notes", recordId: id, userId, sourceType: "manual", sourceId: id, evidenceIds: [], lifecycleState: "active",
    createdAt: "2026-09-01T00:00:00.000Z", updatedAt, payload: { id, accountId: userId, ownerUserId: userId, title, body: title, version: 1, createdAt: "2026-09-01T00:00:00.000Z", updatedAt },
  });
  async function manifest(actor: string, etag?: string) {
    const response = await handlers(actor).manifest(new Request("https://orbit.local/api/sync/manifest", etag ? { headers: { "If-None-Match": etag } } : {}));
    const body = response.status === 200 ? domainManifestSchema.parse(((await response.json()) as { data: unknown }).data) : null;
    return { status: response.status, etag: response.headers.get("ETag"), body };
  }
  return { client, store, note, manifest };
}

test("a write that moves updated_at backwards still changes the manifest (no stale 304)", options, async (t) => {
  const h = await host(t);
  await h.note("n1", "first", "2026-09-20T00:00:00.000Z");
  await h.note("n2", "second", "2026-09-25T00:00:00.000Z");
  const before = await h.manifest(A);
  assert.equal(before.status, 200);
  assert.ok(before.etag);
  assert.equal((await h.manifest(A, before.etag!)).status, 304, "nothing changed: 304");

  // n1 is rewritten with an earlier updated_at: max(updated_at) and count(*) do not move.
  await h.note("n1", "first, edited", "2026-09-19T00:00:00.000Z");
  const after = await h.manifest(A, before.etag!);
  assert.equal(after.status, 200, "the edit must reach the device");
  const watermark = (m: typeof before) => m.body!.domains.find((entry) => entry.domainId === "notes")!.watermark;
  assert.ok(BigInt(watermark(after)) > BigInt(watermark(before)), "the notes watermark moved with the new sync revision");
  assert.equal((await h.manifest(A, after.etag!)).status, 304, "and then it is stable again");
});

test("another actor's writes, however their updated_at moves, keep A's manifest at 304", options, async (t) => {
  const h = await host(t);
  await h.note("n1", "first", "2026-09-20T00:00:00.000Z");
  const before = await h.manifest(A);
  await h.note("b1", "b", "2026-09-10T00:00:00.000Z", B);
  await h.note("b1", "b edited", "2026-09-09T00:00:00.000Z", B);
  assert.equal((await h.manifest(A, before.etag!)).status, 304);
});
