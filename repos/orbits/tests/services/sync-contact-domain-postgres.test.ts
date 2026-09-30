import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test, { type TestContext } from "node:test";
import { Pool } from "pg";
import { createSyncDomainHandlers } from "../../app/api/sync/domain-handlers";
import { createLiveContactDetailTagStatusService } from "../../features/contacts/live-detail-service";
import { createStorageContactGraphProvider } from "../../features/contacts/storage/contact-live-record-provider";
import { createPostgresContactCardReader } from "../../features/contacts/storage/contact-list-postgres-reader";
import { createPostgresContactScopeRecordReader } from "../../features/contacts/storage/contact-scope-postgres-reader";
import { isSyncCollection } from "../../features/sync/commit-order-lock";
import { createDomainReadService } from "../../features/sync/domain-read-service";
import { CONTACT_SYNC_DOMAINS, findSyncDomain, ownerGuardedCollections, SYNC_DOMAINS } from "../../features/sync/domain-registry";
import { localContactDirectory, localContactDirectorySummary } from "../../shared/api-schema/contact-local-directory";
import type { ContactSyncPayload } from "../../shared/contract/contact-local-directory";
import { domainManifestSchema, domainPageSchema, offlineReadEnvelopeSchema } from "../../shared/api-schema/universal-read";
import { ORBIT_RECORDS_SCHEMA_SQL } from "../../shared/storage/migrations";
import { createPostgresLiveRecordStore } from "../../shared/storage/postgres-live-record-store";
import { createTransactionalPostgresClient } from "../../shared/storage/transactional-postgres";
import { STRICT_SYNC_REVISION_SQL } from "../support/sync-revision-fixture";

// Sprint 0116 (offline 1b): the account's contacts on the device, with their
// relationships (connections), detail states and the sources (evidence) they
// cite. This local Postgres plays the server holding accounts A and B; every
// device pull goes through the real sync route handlers, and the server's own
// contact list/search SQL and detail service are the reference the device copy
// is compared with.
const databaseUrl = process.env.ORBIT_LIFECYCLE_TEST_DATABASE_URL;
const options = { skip: databaseUrl ? false : "Explicit isolated PostgreSQL URL required", timeout: 120_000 };
const W = "workspace:contact-domain";
const A = "actor:contacts-a";
const B = "actor:contacts-b";
const SECRET = "contact-domain-secret-0123456789abcdef0123456789abcdef";
const CARD_SECRET = "contact-card-secret-0123456789abcdef0123456789abcdef";
const DOMAIN = "contacts";
let clock = "2026-09-28T01:00:00.000Z";
let tick = 0;

/** A strictly increasing timestamp: list order never depends on a tie. */
function next(): string {
  tick += 1;
  return new Date(Date.parse("2026-09-20T00:00:00.000Z") + tick * 60_000).toISOString();
}

async function host(t: TestContext) {
  clock = "2026-09-28T01:00:00.000Z";
  tick = 0;
  assert.ok(databaseUrl);
  assert.ok(["localhost", "127.0.0.1"].includes(new URL(databaseUrl).hostname), "local Postgres only");
  const schema = `contact_domain_${randomUUID().replaceAll("-", "")}`;
  const admin = new Pool({ connectionString: databaseUrl, max: 1 });
  const pool = new Pool({ connectionString: databaseUrl, max: 4, options: `-c search_path=${schema} -c statement_timeout=15000` });
  const client = createTransactionalPostgresClient({ connectionString: databaseUrl, pool });
  t.after(async () => { try { await client.close(); } finally { try { await admin.query(`drop schema if exists ${schema} cascade`); } finally { await admin.end(); } } });
  await admin.query(`create schema ${schema}`);
  await client.query(ORBIT_RECORDS_SCHEMA_SQL);
  await client.query(STRICT_SYNC_REVISION_SQL);
  const store = createPostgresLiveRecordStore({ client });
  const identity = async (actor: string, state: "active" | "deleted") => store.upsertRecord({
    workspaceId: W, collectionName: "accounts", recordId: actor, userId: actor, sourceType: "manual", sourceId: actor, evidenceIds: [],
    lifecycleState: state, createdAt: "2026-09-01T00:00:00.000Z", updatedAt: next(), payload: { id: actor },
  });
  for (const actor of [A, B]) await identity(actor, "active");
  const now = () => clock;
  const service = createDomainReadService({ client, cursorSecret: SECRET, now, domains: CONTACT_SYNC_DOMAINS });
  const handlersFor = (actor: string) => createSyncDomainHandlers({
    resolveActor: async () => ({ id: actor, userId: actor, workspaceId: W }), createService: () => service, now: () => Date.parse(clock),
    conditionalRead: { client, workspaceId: W, version: "test" },
  });
  const cards = createPostgresContactCardReader({ client, workspaceId: W, cursorSecret: CARD_SECRET });
  const details = createLiveContactDetailTagStatusService({
    now,
    provider: createStorageContactGraphProvider({ store, workspaceId: W, contactScopeRecordReader: createPostgresContactScopeRecordReader({ client, workspaceId: W }) }),
  });
  const base = (collectionName: string, recordId: string, userId: string | null, payload: Record<string, unknown>, stamp = next()) => ({
    workspaceId: W, collectionName, recordId, ...(userId ? { userId } : {}), sourceType: "manual", sourceId: recordId,
    evidenceIds: Array.isArray(payload.evidenceIds) ? payload.evidenceIds as string[] : [], occurredAt: stamp,
    lifecycleState: "active" as const, createdAt: stamp, updatedAt: stamp, payload,
  });
  const write = {
    async contact(owner: string, id: string, fields: Record<string, unknown> & { evidenceIds: string[] }) {
      const stamp = next();
      await store.upsertRecord(base("contacts", id, owner, {
        id, accountId: owner, displayName: id, organization: "", role: "", stage: "active",
        source: { type: "manual", id: `source:${id}` }, createdAt: stamp, updatedAt: stamp, ...fields,
      }, stamp));
    },
    async connection(owner: string, id: string, contactId: string, fields: Record<string, unknown> & { evidenceIds: string[] }) {
      const stamp = next();
      await store.upsertRecord(base("connections", id, owner, {
        id, accountId: owner, contactId, stage: "active", summary: `relationship ${id}`, valueTypes: [],
        source: { type: "manual", id: `source:${id}` }, createdAt: stamp, updatedAt: stamp, ...fields,
      }, stamp));
    },
    async evidence(owner: string | null, id: string, summary: string) {
      const stamp = next();
      await store.upsertRecord(base("evidence", id, owner, {
        id, sourceType: "manual", sourceId: `source:${id}`, summary, occurredAt: stamp, confidence: 0.9, createdBy: "test",
      }, stamp));
    },
    async detailState(owner: string, contactId: string, tags: string[]) {
      const stamp = next();
      await store.upsertRecord(base("contact_detail_states", `contact-detail:${encodeURIComponent(owner)}:${encodeURIComponent(contactId)}`, owner, {
        actorId: owner, contactId, tags, status: "active", notes: [], updatedAt: stamp,
      }, stamp));
    },
    async remove(collectionName: string, id: string) {
      await store.deleteRecord({ workspaceId: W, collectionName, recordId: id, deletedAt: next() });
    },
  };
  return { pool, client, store, identity, handlersFor, cards, details, write };
}

type Host = Awaited<ReturnType<typeof host>>;

/** A device's mirror of the contacts domain, following its cursor through the real route handler (resets on 409 like the App). */
function device(h: Host, actor: string) {
  const rows = new Map<string, ContactSyncPayload>();
  let cursor: string | undefined;
  const log = { resets: 0 };
  return {
    rows,
    log,
    async pull(): Promise<{ upserts: number; deletes: number; ids: string[] }> {
      let upserts = 0, deletes = 0;
      const ids: string[] = [];
      for (let page = 0; page < 40; page += 1) {
        const response = await h.handlersFor(actor).domain(new Request(`https://orbit.local/api/sync/domains/${DOMAIN}?limit=2${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ""}`), DOMAIN);
        if (response.status === 409) { rows.clear(); cursor = undefined; log.resets += 1; continue; }
        assert.equal(response.status, 200, await response.clone().text());
        const data = domainPageSchema.parse(((await response.json()) as { data: unknown }).data);
        for (const change of data.changes) {
          ids.push(change.id);
          if (change.operation === "upsert") { rows.set(change.id, change.payload as unknown as ContactSyncPayload); upserts += 1; }
          else { rows.delete(change.id); deletes += 1; }
        }
        cursor = data.nextCursor;
        if (!data.hasMore) return { upserts, deletes, ids };
      }
      throw new Error("pagination did not terminate");
    },
  };
}

async function seedTwoAccounts(h: Host) {
  // A's own sources; one of them is A's copy of a source B also cites (0114 gave each owner a copy).
  await h.write.evidence(A, "ev:a1", "会议上聊过储能试点");
  await h.write.evidence(A, "ev:shared", "共用来源 A 的那份");
  await h.write.evidence(A, "ev:a3", "Met at the Tokyo mixer");
  await h.write.evidence(B, "ev:shared~owner-b", "共用来源 B 的那份 secret-b-source");
  await h.write.evidence(B, "ev:b1", "secret-b-evidence");
  // Sources that must never reach A's device: unreferenced (orphan) rows, a row without an owner, and B's row cited by A's contact.
  await h.write.evidence(A, "ev:orphan-a", "orphan-owned-by-a");
  await h.write.evidence(null, "ev:ownerless", "ownerless-unresolved-source");
  await h.write.evidence(B, "ev:foreign", "foreign-row-owned-by-b");
  await h.write.contact(A, "c:a1", { displayName: "张伟", organization: "星河能源", role: "首席执行官", evidenceIds: ["ev:a1"] });
  await h.write.connection(A, "cn:a1", "c:a1", { summary: "储能试点合作伙伴", valueTypes: ["strategic_fit"], evidenceIds: ["ev:a1"] });
  await h.write.contact(A, "c:a2", { displayName: "佐藤 花子", organization: "東京ベンチャーズ", evidenceIds: ["ev:shared", "ev:foreign"] });
  await h.write.detailState(A, "c:a2", ["vip"]);
  await h.write.contact(A, "c:a3", { displayName: "Émile Zola", organization: "Rougon Labs", evidenceIds: ["ev:a3", "ev:ownerless"] });
  await h.write.contact(B, "c:b1", { displayName: "B Secret Person", organization: "secret-b-org", evidenceIds: ["ev:b1", "ev:shared~owner-b"] });
  await h.write.connection(B, "cn:b1", "c:b1", { summary: "secret-b-relationship", evidenceIds: ["ev:b1"] });
  await h.write.detailState(B, "c:b1", ["secret-b-tag"]);
}

const DROPPED_DETAIL_FLAGS = new Set([
  "tagWriteExecuted", "statusWriteExecuted", "noteWriteExecuted", "productionAuditLogWriteExecuted", "databaseReadExecuted",
  "databaseWriteExecuted", "externalNetworkRequested", "deviceRequested", "aiProviderRequested", "calendarProviderRequested",
  "emailProviderRequested", "notificationDelivered",
]);

function withoutFlags(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(withoutFlags);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(Object.entries(value).filter(([key]) => !DROPPED_DETAIL_FLAGS.has(key)).map(([key, item]) => [key, withoutFlags(item)]));
}

test("registry: contacts is a leased device domain read from orbit_records with its relationships, detail states and cited sources; all four collections are owner guarded and take the commit-order lock", options, async (t) => {
  const domain = findSyncDomain(DOMAIN, SYNC_DOMAINS);
  assert.ok(domain, "contacts is leased to every authorized account");
  assert.equal(domain.exposure, "device");
  assert.deepEqual(domain.ownership, { rule: "column", column: "user_id" });
  assert.equal(domain.source.kind, "contact_graph");
  assert.deepEqual(domain.attachments.map((attachment) => attachment.collectionName), ["connections", "contact_detail_states", "evidence"]);
  assert.deepEqual([...domain.fields].sort(), ["card", "detail", "id", "search", "tags"]);
  for (const collection of ["contacts", "connections", "contact_detail_states", "evidence"]) {
    assert.ok(ownerGuardedCollections().includes(collection), `${collection} is owner guarded`);
    assert.ok(isSyncCollection(collection), `${collection} writes take the commit-order lock`);
  }
  const h = await host(t);
  const lease = offlineReadEnvelopeSchema.parse(((await (await h.handlersFor(A).lease(new Request("https://orbit.local/api/sync/lease?baseUrl=https%3A%2F%2Fapp.local"))).json()) as { data: unknown }).data);
  assert.deepEqual(lease.grants.map((grant) => grant.domainId), [DOMAIN]);
});

test("isolation: A's device holds only A's contacts, relationships, detail states and A's own copy of a shared source; orphan, ownerless and foreign sources never arrive", options, async (t) => {
  const h = await host(t);
  await seedTwoAccounts(h);
  const a = device(h, A);
  const b = device(h, B);
  await a.pull();
  await b.pull();
  assert.deepEqual([...a.rows.keys()].sort(), ["c:a1", "c:a2", "c:a3"]);
  assert.deepEqual([...b.rows.keys()].sort(), ["c:b1"]);
  const aText = JSON.stringify([...a.rows.values()]);
  for (const secret of ["secret-b", "B Secret Person", "orphan-owned-by-a", "ownerless-unresolved-source", "foreign-row-owned-by-b", "共用来源 B 的那份"]) {
    assert.ok(!aText.includes(secret), `${secret} must not reach A's device`);
  }
  assert.ok(!JSON.stringify([...b.rows.values()]).includes("共用来源 A 的那份"));
  const a2 = a.rows.get("c:a2")!;
  assert.deepEqual((a2.detail as { contact: { evidence: { evidenceId: string }[] } }).contact.evidence.map((item) => item.evidenceId), ["ev:shared"], "A sees its own copy of the shared source and not B's row");
  assert.ok(a2.search.text.includes("共用来源 A 的那份"));
  assert.deepEqual(a2.tags, ["vip"]);
  // Only the manual's fields leave the server: no record metadata, no provider or source-row internals.
  for (const payload of a.rows.values()) {
    assert.deepEqual(Object.keys(payload).sort(), ["card", "detail", "id", "search", "tags"]);
    assert.equal((payload.detail as { provenance?: unknown }).provenance, undefined);
    assert.ok(!JSON.stringify(payload).includes("\"providerRecordId\""));
    assert.ok(!JSON.stringify(payload).includes("Executed\""));
  }
});

test("incremental: a full first pull, then only the contact whose relationship, cited source or detail state changed; unrelated and orphan writes send nothing; deletes remove the contact", options, async (t) => {
  const h = await host(t);
  await seedTwoAccounts(h);
  const a = device(h, A);
  assert.deepEqual((await a.pull()).upserts, 3);
  assert.deepEqual(await a.pull(), { upserts: 0, deletes: 0, ids: [] }, "nothing changed");

  await h.write.connection(A, "cn:a1", "c:a1", { summary: "储能试点：第二阶段", valueTypes: ["strategic_fit"], evidenceIds: ["ev:a1"] });
  assert.deepEqual(await a.pull(), { upserts: 1, deletes: 0, ids: ["c:a1"] }, "a relationship edit resends its contact only");
  assert.ok(a.rows.get("c:a1")!.search.text.includes("第二阶段"));

  await h.write.evidence(A, "ev:a3", "Met at the Tokyo mixer, then again in Osaka");
  assert.deepEqual(await a.pull(), { upserts: 1, deletes: 0, ids: ["c:a3"] }, "a cited source edit resends the contact that cites it");
  assert.ok(a.rows.get("c:a3")!.search.text.includes("Osaka"));

  await h.write.evidence(A, "ev:orphan-a", "orphan edited");
  await h.write.evidence(null, "ev:ownerless", "ownerless edited");
  await h.write.contact(B, "c:b1", { displayName: "B Secret Person", organization: "secret-b-org-2", evidenceIds: ["ev:b1", "ev:shared~owner-b"] });
  assert.deepEqual(await a.pull(), { upserts: 0, deletes: 0, ids: [] }, "orphan, ownerless and another account's writes send A nothing");

  await h.write.detailState(A, "c:a2", ["vip", "investor"]);
  assert.deepEqual(await a.pull(), { upserts: 1, deletes: 0, ids: ["c:a2"] });
  assert.deepEqual(a.rows.get("c:a2")!.tags, ["vip", "investor"]);

  await h.write.remove("connections", "cn:a1");
  assert.deepEqual(await a.pull(), { upserts: 1, deletes: 0, ids: ["c:a1"] }, "a deleted relationship resends its contact without it");
  assert.ok(!a.rows.get("c:a1")!.search.text.includes("第二阶段"));
  assert.equal((a.rows.get("c:a1")!.detail as { contact: { connectionId?: string } }).contact.connectionId, undefined);

  await h.write.remove("contacts", "c:a2");
  assert.deepEqual(await a.pull(), { upserts: 0, deletes: 1, ids: ["c:a2"] }, "a soft-deleted contact is sent as a delete");
  assert.deepEqual([...a.rows.keys()].sort(), ["c:a1", "c:a3"]);
  assert.deepEqual(await a.pull(), { upserts: 0, deletes: 0, ids: [] });

  // A new device: the first page (bookmark 0) carries no tombstones; a later
  // page of the same first pull may carry the delete of a contact it never had
  // (as the event domains do), which leaves its copy unchanged.
  const fresh = device(h, A);
  const first = await fresh.pull();
  assert.ok(first.deletes <= 1, "at most the one deleted contact");
  assert.deepEqual([...fresh.rows.keys()].sort(), ["c:a1", "c:a3"]);
});

test("revocation: an actor whose identity rows are gone gets no grant and cannot read contacts; the epoch change resets the cursor and the rebuild matches", options, async (t) => {
  const h = await host(t);
  await seedTwoAccounts(h);
  const a = device(h, A);
  await a.pull();
  await h.identity(A, "deleted");
  const lease = offlineReadEnvelopeSchema.parse(((await (await h.handlersFor(A).lease(new Request("https://orbit.local/api/sync/lease?baseUrl=https%3A%2F%2Fapp.local"))).json()) as { data: unknown }).data);
  assert.deepEqual(lease.grants, []);
  assert.equal((await h.handlersFor(A).domain(new Request(`https://orbit.local/api/sync/domains/${DOMAIN}`), DOMAIN)).status, 403);
  await h.identity(A, "active");
  const before = [...a.rows.keys()].sort();
  await a.pull();
  assert.equal(a.log.resets, 1, "the old cursor is refused once and the domain is rebuilt");
  assert.deepEqual([...a.rows.keys()].sort(), before);
});

test("the manifest stays conditional: unchanged is a 304; a contact, relationship, cited source or detail state write is a 200", options, async (t) => {
  const h = await host(t);
  await seedTwoAccounts(h);
  const manifest = async (etag?: string) => h.handlersFor(A).manifest(new Request("https://orbit.local/api/sync/manifest", etag ? { headers: { "If-None-Match": etag } } : {}));
  let response = await manifest();
  assert.equal(response.status, 200);
  const entry = domainManifestSchema.parse(((await response.json()) as { data: unknown }).data).domains.find((domain) => domain.domainId === DOMAIN);
  assert.ok(entry && Number(entry.watermark) > 0);
  let etag = response.headers.get("ETag")!;
  assert.equal((await manifest(etag)).status, 304);
  for (const change of [
    () => h.write.contact(A, "c:a3", { displayName: "Émile Zola", organization: "Rougon Labs 2", evidenceIds: ["ev:a3"] }),
    () => h.write.connection(A, "cn:a1", "c:a1", { summary: "manifest", evidenceIds: ["ev:a1"] }),
    () => h.write.evidence(A, "ev:a1", "manifest source"),
    () => h.write.detailState(A, "c:a1", ["manifest"]),
  ]) {
    await change();
    response = await manifest(etag);
    assert.equal(response.status, 200);
    etag = response.headers.get("ETag")!;
    assert.equal((await manifest(etag)).status, 304);
  }
});

test("owner guard and lock: an owned contact row cannot change owner, a first owner can still be given, an ownerless source is not blocked, and an unlocked contact write is refused", options, async (t) => {
  const h = await host(t);
  await seedTwoAccounts(h);
  for (const [collection, id] of [["contacts", "c:a1"], ["connections", "cn:a1"], ["contact_detail_states", `contact-detail:${encodeURIComponent(A)}:c%3Aa2`], ["evidence", "ev:a1"]] as const) {
    await assert.rejects(
      h.client.query(`with sync_write_lock as materialized (select set_config('orbit.sync_write_lock_key', orbit_records_sync_write_lock_key()::text, true) as k from (select pg_advisory_xact_lock(orbit_records_sync_write_lock_key())) l) update orbit_records set user_id = $3 from sync_write_lock where workspace_id = $1 and collection_name = '${collection}' and record_id = $2`, [W, id, B]),
      /SYNC_OWNER_CHANGE_UNREGISTERED/, `${collection} cannot move to another owner`,
    );
  }
  // The ownerless source keeps working (payload edits) and can be given its first owner.
  await h.write.evidence(null, "ev:ownerless", "still writable");
  await h.client.query(`with sync_write_lock as materialized (select set_config('orbit.sync_write_lock_key', orbit_records_sync_write_lock_key()::text, true) as k from (select pg_advisory_xact_lock(orbit_records_sync_write_lock_key())) l) update orbit_records set user_id = $2 from sync_write_lock where workspace_id = $1 and collection_name = 'evidence' and record_id = 'ev:ownerless' and user_id is null`, [W, A]);
  await assert.rejects(
    h.client.query("update orbit_records set payload = payload where workspace_id = $1 and collection_name = 'contacts' and record_id = 'c:a1'", [W]),
    /SYNC_WRITE_LOCK_REQUIRED/, "a contact write without the commit-order lock is refused",
  );
});

// SC-0116-03: the device searches its copy with the same rules the server list uses.
const UNICODE_CONTACTS: { id: string; displayName: string; organization?: string; role?: string; location?: string; profileSnippet?: string; relationship?: string; source?: string; tags?: string[]; sourceType?: string; stage?: string; valueTypes?: string[] }[] = [
  { id: "u:zh", displayName: "张伟", organization: "星河能源", role: "首席执行官", relationship: "储能试点合作伙伴", source: "会议上聊过储能", tags: ["vip"], valueTypes: ["strategic_fit"] },
  { id: "u:ja", displayName: "佐藤 花子", organization: "東京ベンチャーズ", location: "東京都", source: "名刺交換", sourceType: "business_card_ocr" },
  { id: "u:kana", displayName: "ｶﾀｶﾅ ﾀﾛｳ", organization: "ｱｲｳ商事" },
  { id: "u:tr", displayName: "İstanbul Kaya", organization: "ISTANBUL LOGISTICS", stage: "needs_follow_up" },
  { id: "u:de", displayName: "Jürgen Straße", organization: "STRASSE GmbH", valueTypes: ["knowledge_exchange"] },
  { id: "u:el", displayName: "ΟΔΥΣΣΕΥΣ Παππάς", organization: "Σίγμα Ναυτιλία" },
  { id: "u:fw", displayName: "ＡＢＣ Ｔｒａｄｉｎｇ", organization: "全角商社" },
  { id: "u:nfc", displayName: "Émile Zola", organization: "Rougon Labs", tags: ["writer"] },
  { id: "u:nfd", displayName: "Émile Durand", organization: "Decomposed Inc" },
  { id: "u:emoji", displayName: "🚀 Rocket Chen", organization: "Rocket Labs 🚀", stage: "nurture" },
  { id: "u:mc", displayName: "McDonald O'Brien", organization: "Anne-Marie & Co", role: "Partner", sourceType: "referral" },
  { id: "u:like", displayName: "Percent_Person", organization: "50% Off_Co", profileSnippet: "Discounts 100% of the time" },
  { id: "u:case", displayName: "mIxEd CaSe Name", organization: "UPPER lower", stage: "archived" },
  { id: "u:ko", displayName: "김민수", organization: "서울 테크", location: "Seoul" },
];
const QUERIES = [
  "", "张", "星河", "储能", "会议上聊过", "佐藤", "東京", "ｶﾀ", "ｱｲｳ", "istanbul", "i̇stanbul", "İSTANBUL", "İstanbul", "straße", "STRASSE", "strasse",
  "οδυσσευς", "ΟΔΥΣΣΕΥΣ", "σίγμα", "ａｂｃ", "ABC", "émile", "Émile", "émile", "🚀", "mc", "o'b", "anne-marie", "%", "_", "50%", "  zola  ", "　zola　",
  "nomatch", "vip", "writer", "strategic_fit", "partner", "김", "seoul", "a", "e",
];

async function seedUnicode(h: Host) {
  for (const row of UNICODE_CONTACTS) {
    await h.write.evidence(A, `ev:${row.id}`, row.source ?? `source for ${row.id}`);
    await h.write.contact(A, row.id, {
      displayName: row.displayName, organization: row.organization ?? "", role: row.role ?? "", location: row.location ?? "",
      ...(row.profileSnippet ? { profileSnippet: row.profileSnippet } : {}), stage: row.stage ?? "active",
      source: { type: row.sourceType ?? "manual", id: `source:${row.id}` }, evidenceIds: [`ev:${row.id}`],
    });
    if (row.relationship || row.valueTypes) {
      await h.write.connection(A, `cn:${row.id}`, row.id, { summary: row.relationship ?? `relationship ${row.id}`, valueTypes: row.valueTypes ?? [], evidenceIds: [`ev:${row.id}`] });
    }
    if (row.tags) await h.write.detailState(A, row.id, row.tags);
  }
  // B holds a contact that matches most queries; it must never appear in A's results on either side.
  await h.write.evidence(B, "ev:b-noise", "张 東京 istanbul straße 🚀 zola vip");
  await h.write.contact(B, "u:b-noise", { displayName: "张 Zola 🚀 İstanbul", organization: "東京 STRASSE", evidenceIds: ["ev:b-noise"] });
}

async function serverIds(h: Host, query: Parameters<Host["cards"]["page"]>[0]): Promise<string[]> {
  const ids: string[] = [];
  let cursor: string | null = null;
  do {
    const page = await h.cards.page({ ...query, limit: 50, ...(cursor ? { cursor } : {}) }, A);
    ids.push(...page.items.map((item) => item.id));
    cursor = page.nextCursor;
  } while (cursor);
  return ids;
}

test("search parity: over a Chinese/Japanese/Korean/Latin/Greek/emoji corpus the device's matches and order equal the server's contact search for every query and filter", options, async (t) => {
  const h = await host(t);
  await seedUnicode(h);
  const a = device(h, A);
  await a.pull();
  const rows = [...a.rows.values()];
  assert.equal(rows.length, UNICODE_CONTACTS.length);
  const mismatches: string[] = [];
  for (const query of QUERIES) {
    const server = await serverIds(h, { query });
    const local = localContactDirectory(rows, { query }).map((row) => row.id);
    if (JSON.stringify(server) !== JSON.stringify(local)) mismatches.push(`${JSON.stringify(query)} server=${JSON.stringify(server)} local=${JSON.stringify(local)}`);
    assert.ok(!server.includes("u:b-noise") && !local.includes("u:b-noise"));
  }
  const filters = [
    { sourceFilters: ["business_card_ocr"] }, { sourceFilters: ["referral", "manual"] }, { statusFilters: ["needs_follow_up"] }, { statusFilters: ["nurture", "archived"] },
    { tagFilters: ["vip"] }, { valueFilters: ["strategic_fit"] }, { valueFilters: ["knowledge_exchange"], query: "gmbh" }, { query: "o", statusFilters: ["active"] },
  ];
  for (const filter of filters) {
    const server = await serverIds(h, filter);
    const local = localContactDirectory(rows, filter).map((row) => row.id);
    if (JSON.stringify(server) !== JSON.stringify(local)) mismatches.push(`${JSON.stringify(filter)} server=${JSON.stringify(server)} local=${JSON.stringify(local)}`);
    const { asOf: _asOf, ...serverSummary } = await h.cards.summary(filter, A);
    assert.deepEqual(localContactDirectorySummary(rows, filter), serverSummary, `summary parity for ${JSON.stringify(filter)}`);
  }
  assert.deepEqual(mismatches, [], "every query and filter matches the server");
  // The device's card is the server's card.
  const serverCards = new Map((await h.cards.page({ limit: 50 }, A)).items.map((item) => [item.id, item]));
  for (const row of rows) assert.deepEqual(row.card, serverCards.get(row.id), `card ${row.id}`);
});

test("detail parity: every synced contact's detail equals the server's contact detail read (without provenance and write flags)", options, async (t) => {
  const h = await host(t);
  await seedUnicode(h);
  await h.write.detailState(A, "u:ja", ["tokyo"]);
  const a = device(h, A);
  await a.pull();
  for (const [id, payload] of a.rows) {
    const served = await h.details.getContactDetail({ actorId: A, contactId: id });
    assert.equal(served.success, true, id);
    if (!served.success) continue;
    const { provenance: _provenance, ...data } = served.data as unknown as Record<string, unknown>;
    assert.deepEqual(payload.detail, withoutFlags(data), `detail ${id}`);
  }
});
