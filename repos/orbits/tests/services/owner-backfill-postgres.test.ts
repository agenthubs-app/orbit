import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test, { type TestContext } from "node:test";
import { promisify } from "node:util";
import { Pool } from "pg";
import { createLiveContactDetailTagStatusService } from "../../features/contacts/live-detail-service";
import { createStorageContactGraphProvider } from "../../features/contacts/storage/contact-live-record-provider";
import { createPostgresContactScopeRecordReader } from "../../features/contacts/storage/contact-scope-postgres-reader";
import {
  assertOwnerBackfillTarget,
  ownerBackfillCopyId,
  runOwnerBackfill,
} from "../../features/sync/owner-backfill";
import { buildAccountContactFixtures } from "../../shared/mock/account-contact-fixtures";
import type { LiveRecord } from "../../shared/storage/live-record-store";
import { ORBIT_RECORDS_SCHEMA_SQL } from "../../shared/storage/migrations";
import { createPostgresLiveRecordStore } from "../../shared/storage/postgres-live-record-store";
import { createTransactionalPostgresClient } from "../../shared/storage/transactional-postgres";
import { STRICT_SYNC_REVISION_SQL, testRawWrite } from "../support/sync-revision-fixture";

// Sprint 0114 (offline design step 8, decisions 2-4): the owner backfill gives
// owner-less contact rows their owner by reference (or by the demo account that
// generated them), gives a source shared by several owners a per-owner copy,
// leaves platform public data alone and lists what it cannot decide. Real local
// Postgres, strict sync schema with the 0113 owner guard installed.
const databaseUrl = process.env.ORBIT_LIFECYCLE_TEST_DATABASE_URL;
const options = { skip: databaseUrl ? false : "Explicit isolated PostgreSQL URL required", timeout: 120_000 };
const W = "workspace:owner-backfill";
const A = "user_backfill_a";
const B = "user_backfill_b";
const C = "user_backfill_c";
const GENERATED = "account_orbit_generated";
const T0 = "2026-09-28T01:00:00.000Z";
const execFileAsync = promisify(execFile);

async function database(t: TestContext) {
  assert.ok(databaseUrl);
  assert.ok(["localhost", "127.0.0.1"].includes(new URL(databaseUrl).hostname), "local Postgres only");
  const schema = `owner_backfill_${randomUUID().replaceAll("-", "")}`;
  const admin = new Pool({ connectionString: databaseUrl, max: 1 });
  const pool = new Pool({ connectionString: databaseUrl, max: 4, options: `-c search_path=${schema} -c statement_timeout=15000` });
  const client = createTransactionalPostgresClient({ connectionString: databaseUrl, pool });
  t.after(async () => { try { await client.close(); } finally { try { await admin.query(`drop schema if exists ${schema} cascade`); } finally { await admin.end(); } } });
  await admin.query(`create schema ${schema}`);
  await client.query(ORBIT_RECORDS_SCHEMA_SQL);
  await client.query(STRICT_SYNC_REVISION_SQL);
  return { schema, pool, client, store: createPostgresLiveRecordStore({ client }) };
}

type Row = Omit<LiveRecord, "workspaceId" | "createdAt" | "updatedAt" | "lifecycleState" | "sourceType" | "sourceId" | "evidenceIds"> & Partial<LiveRecord>;
function row(input: Row): LiveRecord {
  return {
    workspaceId: W, sourceType: "manual", sourceId: input.recordId, lifecycleState: "active", evidenceIds: [],
    createdAt: T0, updatedAt: T0, ...input,
  } as LiveRecord;
}

function evidence(id: string, summary: string, userId: string | null, provider: string | null = "manual-capture"): LiveRecord {
  return row({
    collectionName: "evidence", recordId: id, userId, provider, evidenceIds: [id], targetType: "evidence", targetId: id,
    payload: { id, summary, sourceId: `source:${id}`, sourceType: "manual", confidence: 0.8, createdBy: "someone", occurredAt: T0 },
  });
}

/** One realistic contact graph (contact, connection, three evidence rows) from the account fixtures. */
function accountGraph(accountId: string, index = 0) {
  const fixture = buildAccountContactFixtures(accountId)[index]!;
  return {
    contact: fixture.contact as unknown as Record<string, unknown> & { id: string; evidenceIds: string[]; nextAction?: unknown },
    connection: fixture.connection as unknown as Record<string, unknown> & { id: string },
    evidence: fixture.evidenceRecords as unknown as (Record<string, unknown> & { id: string })[],
  };
}

async function seedGraph(store: ReturnType<typeof createPostgresLiveRecordStore>, input: {
  accountId: string; owners: { contact: string | null; connection: string | null; evidence: string | null };
  contactPatch?: Record<string, unknown>; contactPayloadAccountId?: boolean; index?: number;
}) {
  const graph = accountGraph(input.accountId, input.index);
  const contact = { ...graph.contact, ...(input.contactPayloadAccountId === false ? { accountId: undefined } : {}), ...input.contactPatch };
  if (contact.accountId === undefined) delete contact.accountId;
  for (const item of graph.evidence) {
    await store.upsertRecord(row({ collectionName: "evidence", recordId: item.id, userId: input.owners.evidence, provider: "orbit-account-contact-fixtures", evidenceIds: [item.id], payload: item }));
  }
  await store.upsertRecord(row({ collectionName: "contacts", recordId: graph.contact.id, userId: input.owners.contact, provider: "orbit-account-contact-fixtures", evidenceIds: contact.evidenceIds as string[], payload: contact }));
  await store.upsertRecord(row({ collectionName: "connections", recordId: graph.connection.id, userId: input.owners.connection, provider: "orbit-account-contact-fixtures", evidenceIds: contact.evidenceIds as string[], payload: graph.connection }));
  return { ...graph, contact };
}

async function owners(pool: Pool): Promise<Map<string, string | null>> {
  const result = await pool.query<{ k: string; user_id: string | null }>("select collection_name || '/' || record_id as k, user_id from orbit_records where workspace_id = $1", [W]);
  return new Map(result.rows.map((item) => [item.k, item.user_id]));
}

async function snapshot(pool: Pool, where = "true"): Promise<string> {
  const result = await pool.query<{ h: string | null }>(`select md5(string_agg(to_jsonb(r)::text, '|' order by collection_name, record_id)) as h from orbit_records r where ${where}`);
  return result.rows[0]?.h ?? "";
}

async function contactDetail(input: { client: ReturnType<typeof createTransactionalPostgresClient>; store: ReturnType<typeof createPostgresLiveRecordStore>; actorId: string; contactId: string }) {
  const provider = createStorageContactGraphProvider({
    store: input.store, workspaceId: W,
    contactScopeRecordReader: createPostgresContactScopeRecordReader({ client: input.client, workspaceId: W }),
  });
  const result = await createLiveContactDetailTagStatusService({ provider }).getContactDetail({ actorId: input.actorId, contactId: input.contactId });
  assert.equal(result.success, true, JSON.stringify(result).slice(0, 400));
  const detail = (result as unknown as { data: { contact: { evidence: readonly ({ evidenceId: string } & Record<string, unknown>)[] } & Record<string, unknown> } }).data.contact;
  // What the page shows: everything but the evidence ids (a copy has a new id, same content).
  return {
    evidence: detail.evidence.map(({ evidenceId: _id, ...shown }) => {
      const { evidenceId: _sourceEvidenceId, ...source } = (shown as { source: Record<string, unknown> }).source;
      return { ...shown, source };
    }),
    displayName: detail.displayName, source: detail.source, nextAction: detail.nextAction, relationshipContext: detail.relationshipContext,
  };
}

test("owner-less contact rows get their owner by reference; public data, sources no owned live row cites and undecidable rows are left and listed; generated sources get the demo account only on request", options, async (t) => {
  const { pool, client, store } = await database(t);
  // A's graph is owner-less throughout; the contact carries accountId A.
  const a = await seedGraph(store, { accountId: A, owners: { contact: null, connection: null, evidence: null }, contactPatch: { accountId: A } });
  // A detail state without an owner; its record id carries the actor.
  await store.upsertRecord(row({ collectionName: "contact_detail_states", recordId: `contact-detail:${A}:${a.contact.id}`, userId: null, payload: { actorId: A, contactId: a.contact.id, status: "active", tags: [], notes: [], updatedAt: T0 } }));
  // B's graph is fully owned: nothing of it may change.
  await seedGraph(store, { accountId: B, owners: { contact: B, connection: B, evidence: B } });
  // A contact with no accountId, but an owned connection points to it: owner by reference.
  const c = await seedGraph(store, { accountId: C, owners: { contact: null, connection: C, evidence: C }, contactPayloadAccountId: false });
  // A connection whose accountId disagrees with its contact's owner: listed, not assigned.
  await store.upsertRecord(row({ collectionName: "connections", recordId: "conn-conflict", userId: null, payload: { id: "conn-conflict", accountId: B, contactId: a.contact.id, stage: "nurture" } }));
  // A business-card contact with no accountId and no reference: undecidable.
  await store.upsertRecord(row({ collectionName: "contacts", recordId: "contact-orphan", userId: null, provider: "orbit-business-card-contact-write", payload: { id: "contact-orphan", displayName: "Orphan" } }));
  // Generated fixture rows: a source cited by an owner-less interaction memory, an orphan source nothing
  // live cites, and a soft-deleted connection of the demo account.
  await store.upsertRecord(evidence("evidence:gen:2", "generated interaction", null, "generated-relationship-fixtures"));
  await store.upsertRecord(row({ collectionName: "interactionMemories", recordId: "interaction_1", userId: null, provider: "generated-relationship-fixtures", evidenceIds: ["evidence:gen:2"], payload: { id: "interaction_1", evidenceIds: ["evidence:gen:2"] } }));
  await store.upsertRecord(evidence("evidence:gen:1", "generated orphan", null, "generated-relationship-fixtures"));
  await store.upsertRecord(row({ collectionName: "connections", recordId: "connection_gen_deleted", userId: null, provider: "generated-relationship-fixtures", lifecycleState: "deleted", payload: { id: "connection_gen_deleted", accountId: GENERATED, contactId: "contact_gen_missing", stage: "nurture" } }));
  // Platform public data: an attendee row and the source only it references.
  await store.upsertRecord(evidence("evidence:public:1", "attendee import", null, "generated-relationship-fixtures"));
  await store.upsertRecord(row({ collectionName: "attendees", recordId: "participant_1", userId: null, provider: "generated-relationship-fixtures", evidenceIds: ["evidence:public:1"], payload: { id: "participant_1", evidenceIds: ["evidence:public:1"] } }));
  // An unreferenced source that no demo account generated: undecidable.
  await store.upsertRecord(evidence("evidence:orphan:1", "who made this", null, "manual-capture"));
  const before = await owners(pool);
  const bBefore = await snapshot(pool, `user_id = '${B}'`);
  const publicBefore = await snapshot(pool, "collection_name = 'attendees'");

  const result = await runOwnerBackfill({ client, workspaceId: W, mode: "apply", backupPath: join(mkdtempSync(join(tmpdir(), "owner-backfill-")), "backup.jsonl") });
  const after = await owners(pool);

  assert.equal(after.get(`contacts/${a.contact.id}`), A, "contact: its accountId");
  assert.equal(after.get(`connections/${a.connection.id}`), A, "connection: its contact's owner");
  assert.equal(after.get(`contact_detail_states/contact-detail:${A}:${a.contact.id}`), A, "detail state: its actor");
  for (const item of a.evidence) assert.equal(after.get(`evidence/${item.id}`), A, "source: the owner of the contact that references it");
  assert.equal(after.get(`contacts/${c.contact.id}`), C, "contact without accountId: the owner of the connection that references it");
  assert.equal(after.get("evidence/evidence:gen:2"), null, "a generated source cited only by owner-less demo rows is left by default (owning it only adds read cost)");
  assert.equal(after.get("evidence/evidence:gen:1"), null, "so is an orphan source");
  assert.equal(after.get("connections/connection_gen_deleted"), GENERATED, "a deleted generated row is owned too");
  assert.equal(after.get("connections/conn-conflict"), null, "a disagreeing accountId is not guessed");
  assert.equal(after.get("contacts/contact-orphan"), null);
  assert.equal(after.get("evidence/evidence:orphan:1"), null);
  assert.equal(after.get("evidence/evidence:public:1"), null, "platform public data is not backfilled");
  assert.equal(await snapshot(pool, `user_id = '${B}'`), bBefore, "another account's rows are untouched");
  assert.equal(await snapshot(pool, "collection_name = 'attendees'"), publicBefore, "public rows are untouched");
  for (const [key, value] of before) if (value !== null) assert.equal(after.get(key), value, `an existing owner never changes (${key})`);

  const listed = (collection: string, id: string) => result.unresolvable.find((item) => item.collectionName === collection && item.recordId === id);
  assert.ok(listed("connections", "conn-conflict"));
  assert.ok(listed("contacts", "contact-orphan"));
  assert.ok(listed("evidence", "evidence:orphan:1"));
  assert.ok(result.skipped.some((item) => item.recordId === "evidence:public:1" && /public/.test(item.reason)));
  assert.ok(result.skipped.some((item) => item.recordId === "evidence:gen:1" && /cited by no row.*account_orbit_generated/.test(item.reason)), "the orphan is listed with the owner it would get");
  assert.ok(result.skipped.some((item) => item.recordId === "evidence:gen:2" && /owner-less interactionMemories.*account_orbit_generated/.test(item.reason)));
  assert.equal(result.counts.contacts?.ownerlessAfter, 1);
  assert.equal(result.counts.connections?.ownerlessAfter, 1);
  assert.equal(result.counts.contact_detail_states?.ownerlessAfter, 0);
  assert.equal(result.counts.evidence?.ownerlessAfter, 4, "the public source, the undecidable source and the two generated sources");
  assert.equal(result.counts.evidence?.skipped, 3);
  assert.equal(result.counts.evidence?.unresolvable, 1);
  assert.equal(result.verified, true);

  // Opting in gives both generated sources the demo account that generated them; the undecidable and public sources stay as they are.
  const withGenerated = await runOwnerBackfill({ client, workspaceId: W, mode: "apply", assignGeneratedSources: true, backupPath: join(mkdtempSync(join(tmpdir(), "owner-backfill-")), "generated.jsonl") });
  assert.deepEqual(withGenerated.assignments.map((item) => [item.recordId, item.owner, item.rule]), [["evidence:gen:1", GENERATED, "generated-by-demo-account"], ["evidence:gen:2", GENERATED, "generated-by-demo-account"]]);
  const final = await owners(pool);
  assert.equal(final.get("evidence/evidence:orphan:1"), null);
  assert.equal(final.get("evidence/evidence:public:1"), null);
});

test("a source shared by two owners gets a per-owner copy: references are re-pointed, nothing is lost, and each detail page shows the same sources", options, async (t) => {
  const { pool, client, store } = await database(t);
  const shared = evidence("evidence:shared:event-01", "Met at the Tokyo AI evening", null);
  await store.upsertRecord(shared);
  const a = await seedGraph(store, { accountId: A, owners: { contact: A, connection: A, evidence: A } });
  const b = await seedGraph(store, { accountId: B, owners: { contact: B, connection: B, evidence: B } });
  // Both contacts cite the shared source; B's next action cites it too.
  for (const [graph, owner] of [[a, A], [b, B]] as const) {
    const ids = [...graph.contact.evidenceIds, shared.recordId];
    const next = owner === B ? { ...(graph.contact.nextAction as object), evidenceId: shared.recordId } : graph.contact.nextAction;
    await store.upsertRecord(row({ collectionName: "contacts", recordId: graph.contact.id, userId: owner, provider: "orbit-account-contact-fixtures", evidenceIds: ids, payload: { ...graph.contact, evidenceIds: ids, nextAction: next } }));
  }
  // A source owned by A that C's contact also cites: C gets a copy, A keeps the original.
  const ownedByA = evidence("evidence:owned-by-a", "A's own capture", A);
  await store.upsertRecord(ownedByA);
  const c = await seedGraph(store, { accountId: C, owners: { contact: C, connection: C, evidence: C } });
  const cIds = [...c.contact.evidenceIds, ownedByA.recordId];
  await store.upsertRecord(row({ collectionName: "contacts", recordId: c.contact.id, userId: C, provider: "orbit-account-contact-fixtures", evidenceIds: cIds, payload: { ...c.contact, evidenceIds: cIds } }));
  // A source cited by A's note (a sync collection, never rewritten) and B's contact: A keeps it, B gets a copy.
  const noted = evidence("evidence:noted", "Cited from a note", null);
  await store.upsertRecord(noted);
  await testRawWrite(client, "notes", `insert into orbit_records (workspace_id, collection_name, record_id, user_id, source_type, source_id, evidence_ids, payload, created_at, updated_at)
    values ($1, 'notes', 'note-a', $2, 'manual', 'note-a', array['evidence:noted'], '{"id":"note-a","evidenceIds":["evidence:noted"]}', $3, $3)`, [W, A, T0]);
  const b2Ids = [...b.contact.evidenceIds, shared.recordId, noted.recordId];
  const bContact = (await pool.query<{ payload: Record<string, unknown> }>("select payload from orbit_records where collection_name = 'contacts' and record_id = $1", [b.contact.id])).rows[0]!.payload;
  await store.upsertRecord(row({ collectionName: "contacts", recordId: b.contact.id, userId: B, provider: "orbit-account-contact-fixtures", evidenceIds: b2Ids, payload: { ...bContact, evidenceIds: b2Ids } }));
  // A source cited by an event of A and a meeting of B: neither side can be re-pointed, so it is listed and left.
  const eventSource = evidence("evidence:event:01", "Event page", null);
  await store.upsertRecord(eventSource);
  await store.upsertRecord(row({ collectionName: "events", recordId: "event_01", userId: A, evidenceIds: ["evidence:event:01"], payload: { id: "event_01", evidenceIds: ["evidence:event:01"] } }));
  await store.upsertRecord(row({ collectionName: "meetings", recordId: "meeting_01", userId: B, evidenceIds: ["evidence:event:01"], payload: { id: "meeting_01", evidenceIds: ["evidence:event:01"] } }));

  const detailBefore = {
    a: await contactDetail({ client, store, actorId: A, contactId: a.contact.id }),
    b: await contactDetail({ client, store, actorId: B, contactId: b.contact.id }),
    c: await contactDetail({ client, store, actorId: C, contactId: c.contact.id }),
  };
  assert.ok(detailBefore.b.evidence.some((item) => (item as { excerpt?: string }).excerpt?.includes("Tokyo AI evening")), "the shared source is on B's page before");
  const noteBefore = await snapshot(pool, "collection_name = 'notes'");
  const eventsBefore = await snapshot(pool, "collection_name in ('events', 'meetings') or record_id = 'evidence:event:01'");
  const totalBefore = Number((await pool.query<{ n: string }>("select count(*)::text n from orbit_records")).rows[0]!.n);

  const result = await runOwnerBackfill({ client, workspaceId: W, mode: "apply", backupPath: join(mkdtempSync(join(tmpdir(), "owner-backfill-")), "backup.jsonl") });

  const read = async (collection: string, id: string) => (await pool.query<{ user_id: string | null; evidence_ids: string[]; payload: Record<string, unknown> }>(
    "select user_id, evidence_ids, payload from orbit_records where collection_name = $1 and record_id = $2", [collection, id])).rows[0];
  const sharedCopy = ownerBackfillCopyId(shared.recordId, B);
  assert.equal((await read("evidence", shared.recordId))?.user_id, A, "the lexically first owner keeps the original");
  const copy = await read("evidence", sharedCopy);
  assert.equal(copy?.user_id, B, "B owns its own copy");
  assert.deepEqual({ ...copy!.payload, id: shared.recordId }, shared.payload, "the copy carries the same content");
  assert.deepEqual(copy!.evidence_ids, [sharedCopy]);
  const bRow = await read("contacts", b.contact.id);
  assert.ok((bRow!.payload.evidenceIds as string[]).includes(sharedCopy) && !(bRow!.payload.evidenceIds as string[]).includes(shared.recordId), "B's contact points at B's copy");
  assert.ok(bRow!.evidence_ids.includes(sharedCopy) && !bRow!.evidence_ids.includes(shared.recordId));
  assert.equal((bRow!.payload.nextAction as { evidenceId: string }).evidenceId, sharedCopy, "the next action follows too");
  const aRow = await read("contacts", a.contact.id);
  assert.ok((aRow!.payload.evidenceIds as string[]).includes(shared.recordId), "A's contact keeps the original");

  assert.equal((await read("evidence", ownedByA.recordId))?.user_id, A, "an owned source keeps its owner");
  const cCopy = ownerBackfillCopyId(ownedByA.recordId, C);
  assert.equal((await read("evidence", cCopy))?.user_id, C);
  assert.ok(((await read("contacts", c.contact.id))!.payload.evidenceIds as string[]).includes(cCopy));

  assert.equal((await read("evidence", noted.recordId))?.user_id, A, "the owner whose reference cannot be re-pointed keeps the original");
  assert.equal((await read("evidence", ownerBackfillCopyId(noted.recordId, B)))?.user_id, B);
  assert.equal(await snapshot(pool, "collection_name = 'notes'"), noteBefore, "a sync-collection row is never rewritten");

  assert.equal(await snapshot(pool, "collection_name in ('events', 'meetings') or record_id = 'evidence:event:01'"), eventsBefore, "a source shared outside the contact categories is left as is");
  assert.ok(result.unresolvable.some((item) => item.recordId === "evidence:event:01" && /outside/.test(item.reason)));

  const totalAfter = Number((await pool.query<{ n: string }>("select count(*)::text n from orbit_records")).rows[0]!.n);
  assert.equal(totalAfter, totalBefore + 3, "three copies added, nothing removed");
  assert.equal(result.counts.evidence?.copied, 3);

  assert.deepEqual(await contactDetail({ client, store, actorId: A, contactId: a.contact.id }), detailBefore.a, "A's page shows the same sources");
  assert.deepEqual(await contactDetail({ client, store, actorId: B, contactId: b.contact.id }), detailBefore.b, "B's page shows the same sources");
  assert.deepEqual(await contactDetail({ client, store, actorId: C, contactId: c.contact.id }), detailBefore.c, "C's page shows the same sources");
});

test("dry run and preview never write; apply exports the rows it changes first; a second apply changes nothing", options, async (t) => {
  const { pool, client, store } = await database(t);
  await seedGraph(store, { accountId: A, owners: { contact: null, connection: null, evidence: null } });
  const b = await seedGraph(store, { accountId: B, owners: { contact: B, connection: B, evidence: B } });
  const shared = evidence("evidence:shared", "shared", null);
  await store.upsertRecord(shared);
  const ids = [...b.contact.evidenceIds, shared.recordId];
  await store.upsertRecord(row({ collectionName: "contacts", recordId: b.contact.id, userId: B, provider: "orbit-account-contact-fixtures", evidenceIds: ids, payload: { ...b.contact, evidenceIds: ids } }));
  const aContact = accountGraph(A).contact;
  const aIds = [...aContact.evidenceIds, shared.recordId];
  await store.upsertRecord(row({ collectionName: "contacts", recordId: aContact.id, userId: null, provider: "orbit-account-contact-fixtures", evidenceIds: aIds, payload: { ...aContact, evidenceIds: aIds } }));

  const untouched = await snapshot(pool);
  const dry = await runOwnerBackfill({ client, workspaceId: W, mode: "dry-run" });
  const preview = await runOwnerBackfill({ client, workspaceId: W, mode: "preview" });
  assert.equal(await snapshot(pool), untouched, "dry run and preview do not write");
  assert.equal(dry.assignments.length, preview.assignments.length);
  assert.ok(dry.assignments.length >= 5 && dry.copies.length === 1);
  await assert.rejects(runOwnerBackfill({ client, workspaceId: W, mode: "apply" }), /backup/i, "apply refuses without a backup path");
  assert.equal(await snapshot(pool), untouched);

  const dir = mkdtempSync(join(tmpdir(), "owner-backfill-"));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const first = await runOwnerBackfill({ client, workspaceId: W, mode: "apply", backupPath: join(dir, "first.jsonl") });
  assert.equal(first.assignments.length, dry.assignments.length);
  const lines = readFileSync(join(dir, "first.jsonl"), "utf8").trim().split("\n").map((line) => JSON.parse(line) as { kind: string; row: { collection_name: string; record_id: string; user_id: string | null } });
  assert.equal(lines[0]?.kind, "header");
  const exported = new Set(lines.filter((line) => line.kind === "before").map((line) => `${line.row.collection_name}/${line.row.record_id}`));
  for (const item of first.assignments) assert.ok(exported.has(`${item.collectionName}/${item.recordId}`), `assigned row exported before the change: ${item.recordId}`);
  for (const copy of first.copies) {
    assert.ok(exported.has(`evidence/${copy.sourceRecordId}`), "a copied source is exported");
    for (const ref of copy.repoints) assert.ok(exported.has(`${ref.collectionName}/${ref.recordId}`), "a re-pointed row is exported");
  }
  const assigned = new Set(first.assignments.map((item) => `${item.collectionName}/${item.recordId}`));
  assert.ok(lines.filter((line) => line.kind === "before" && assigned.has(`${line.row.collection_name}/${line.row.record_id}`)).every((line) => line.row.user_id === null), "rows are exported as they were before the change");

  const applied = await snapshot(pool);
  const second = await runOwnerBackfill({ client, workspaceId: W, mode: "apply", backupPath: join(dir, "second.jsonl") });
  assert.equal(second.assignments.length, 0, "a second run assigns nothing");
  assert.equal(second.copies.length, 0, "a second run copies nothing");
  assert.equal(await snapshot(pool), applied, "a second run changes 0 rows");
});

test("a remote database needs an explicit confirmation to apply; the CLI dry run reports counts and apply writes a backup", options, async (t) => {
  assert.throws(() => assertOwnerBackfillTarget({ connectionString: "postgresql://u@db.example.com:5432/orbit", target: "cloud", apply: true, confirmRemote: null }), /confirm-remote=db\.example\.com\/orbit/);
  assert.throws(() => assertOwnerBackfillTarget({ connectionString: "postgresql://u@127.0.0.1:5432/orbit", target: "cloud", apply: true, confirmRemote: "wrong/db" }), /confirm-remote/);
  assert.equal(assertOwnerBackfillTarget({ connectionString: "postgresql://u@db.example.com:5432/orbit", target: "cloud", apply: false, confirmRemote: null }).remote, true, "a dry run may read a remote database");
  assert.equal(assertOwnerBackfillTarget({ connectionString: "postgresql://u@db.example.com:5432/orbit", target: "cloud", apply: true, confirmRemote: "db.example.com/orbit" }).remote, true);

  const { schema, pool, store } = await database(t);
  await seedGraph(store, { accountId: A, owners: { contact: null, connection: null, evidence: null } });
  const url = new URL(databaseUrl!);
  url.searchParams.set("options", `-c search_path=${schema}`);
  const dir = mkdtempSync(join(tmpdir(), "owner-backfill-cli-"));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const env = { ...process.env, ORBIT_DATABASE_TARGET: "local", ORBIT_LOCAL_DATABASE_URL: url.toString(), ORBIT_LOCAL_WORKSPACE_ID: W };
  const cli = (...args: string[]) => execFileAsync("npx", ["tsx", join(__dirname, "../../scripts/backfill-owners.ts"), ...args], { cwd: join(__dirname, "../.."), env });
  const dry = await cli();
  assert.match(dry.stdout, /dry-run/);
  assert.match(dry.stdout, /contacts[^\n]*ownerless 1[^\n]*assign 1/);
  assert.equal((await pool.query("select 1 from orbit_records where user_id is null and workspace_id = $1", [W])).rows.length, 5, "the CLI dry run writes nothing");
  await cli("--apply", `--backup-dir=${dir}`);
  assert.equal((await pool.query("select 1 from orbit_records where user_id is null and workspace_id = $1", [W])).rows.length, 0);
  assert.equal(readdirSync(dir).filter((name) => name.endsWith(".jsonl")).length, 1, "apply wrote one backup file");
  const again = await cli("--apply", `--backup-dir=${dir}`);
  assert.match(again.stdout, /assigned 0[^\n]*copied 0/);
});
