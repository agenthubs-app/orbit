import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { Pool } from "pg";
import { createContactDetailGetHandler, createContactDetailPatchHandler } from "../../app/api/contacts/[id]/handler";
import { createLiveContactDetailTagStatusService } from "../../features/contacts/live-detail-service";
import { contactDetailTagStatusServiceFactory } from "../../features/contacts/service-factory";
import { createStorageContactGraphProvider } from "../../features/contacts/storage/contact-live-record-provider";
import { createPostgresLiveRecordStore } from "../../shared/storage/postgres-live-record-store";
import { ORBIT_RECORDS_SCHEMA_SQL } from "../../shared/storage/migrations";
import { createTransactionalPostgresClient } from "../../shared/storage/transactional-postgres";

const databaseUrl = process.env.ORBIT_LIFECYCLE_TEST_DATABASE_URL;
test("PostgreSQL + HTTP contact PATCH cannot bypass lifecycle or mutate private data on rejection", {
  skip: databaseUrl ? false : "Explicit isolated PostgreSQL URL required",
}, async (t) => {
  assert.ok(databaseUrl);
  const schema = `contact_guard_${randomUUID().replaceAll("-", "")}`;
  const admin = new Pool({ connectionString: databaseUrl, max: 1 });
  const pool = new Pool({ connectionString: databaseUrl, max: 2, options: `-c search_path=${schema} -c statement_timeout=5000` });
  const client = createTransactionalPostgresClient({ connectionString: databaseUrl, pool });
  const workspaceId = "workspace:contact-guard";
  const actorId = "actor:owner";
  const now = "2026-09-17T02:00:00.000Z";
  try {
    await admin.query(`create schema ${schema}`);
    await client.query(ORBIT_RECORDS_SCHEMA_SQL);
    const store = createPostgresLiveRecordStore({ client });
    const provider = createStorageContactGraphProvider({ store, workspaceId });
    const service = () => createLiveContactDetailTagStatusService({ provider, now: () => now });
    const resolution = contactDetailTagStatusServiceFactory.create("mock");
    t.mock.method(contactDetailTagStatusServiceFactory, "create", () => ({ ...resolution, service: service() }));
    const seed = async (id: string, marker?: "ready" | "pending", connection = true, version: number | null = 1) => {
      const base = { source: { type: "manual", id: "guard-test" }, evidenceIds: ["evidence:guard-test"], createdAt: now, updatedAt: now };
      for (const [collection, payload] of [
        ["contacts", { ...base, id, displayName: id, stage: "captured", lifecycleInitialization: marker }],
        ...(connection ? [["connections", { ...base, id: `connection:${id}`, accountId: actorId, contactId: id, version: version ?? undefined,
          lifecycleInitialization: marker, stage: "active", summary: "Guard test", valueTypes: [] }]] : []),
      ] as [string, Record<string, unknown>][]) {
        await client.query("insert into orbit_records (workspace_id, collection_name, record_id, user_id, source_type, source_id, payload, created_at, updated_at) values ($1,$2,$3,$4,'manual','guard-test',$5,$6,$6)", [workspaceId, collection, payload.id, actorId, payload, now]);
      }
      await provider.upsertContactDetailState!({ actorId, contactId: id, notes: [], tags: ["preserved"], status: "nurture", updatedAt: now });
    };
    const snapshot = async () => (await client.query("select collection_name,record_id,payload,updated_at from orbit_records order by collection_name,record_id")).rows;
    const patch = async (id: string, body: object, actor = actorId) => createContactDetailPatchHandler(async () => ({ id: actor }))(
      new Request(`https://orbit.test/api/contacts/${id}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }),
      { params: Promise.resolve({ id }) },
    );
    const get = async (id: string, actor = actorId) => createContactDetailGetHandler(async () => ({ id: actor }))(
      new Request(`https://orbit.test/api/contacts/${id}`), { params: Promise.resolve({ id }) },
    );
    await seed("canonical-no-marker");
    await seed("pending", "pending");
    await seed("ready", "ready");
    await seed("legacy", undefined, false);
    await seed("unversioned-connection", undefined, true, null);
    for (const id of ["canonical-no-marker", "pending", "ready", "unversioned-connection"]) {
      const before = await snapshot();
      const response = await patch(id, { status: "archived", note: "must not save", addTags: ["must-not-save"], primaryIndustryId: "finance_investment" });
      assert.equal(response.status, 409, id);
      assert.match(JSON.stringify(await response.json()), /CONTACT_DETAIL_CANONICAL_STATUS_LIFECYCLE_ONLY/);
      assert.deepEqual(await snapshot(), before, `${id}: mixed request must be rejected before any write`);
    }
    const read = await get("canonical-no-marker");
    assert.equal(read.status, 200);
    const body = await read.json();
    assert.equal(body.data.contact.status, "active");
    const beforeForeign = await snapshot();
    assert.equal((await get("canonical-no-marker", "actor:other")).status, 404);
    assert.equal((await patch("canonical-no-marker", { note: "not yours" }, "actor:other")).status, 404);
    assert.deepEqual(await snapshot(), beforeForeign);
    assert.equal((await patch("pending", { note: "private note", addTags: ["new-private-tag"] })).status, 200);
    const coldProvider = createStorageContactGraphProvider({ store: createPostgresLiveRecordStore({ client }), workspaceId });
    const privateState = await coldProvider.readContactDetailState!("pending", actorId);
    assert.equal(privateState?.status, "nurture", "note-only update preserves private status, not a lifecycle transition");
    assert.ok(privateState?.notes.some(note => note.body === "private note"));
    const pending = await get("pending");
    const pendingBody = await pending.json();
    assert.equal(pendingBody.data.contact.lifecycleInitialization, "pending");
    assert.equal(pendingBody.data.contact.status, "needs_follow_up");
    assert.equal((await patch("legacy", { status: "archived" })).status, 200);
    assert.equal((await provider.readContactDetailState!("legacy", actorId))?.status, "archived");

    await client.query("update orbit_records set payload=payload || '{\"version\":\"bad\"}'::jsonb where record_id='connection:canonical-no-marker'");
    const invalidBefore = await snapshot();
    await assert.rejects(async () => service().updateContactDetail({ actorId, contactId: "canonical-no-marker", status: "archived" }), /Invalid connection lifecycle version/);
    assert.deepEqual(await snapshot(), invalidBefore, "invalid version cannot downgrade to writable legacy");
  } finally {
    await client.close();
    try { await admin.query(`drop schema if exists ${schema} cascade`); } finally { await admin.end(); }
  }
});
