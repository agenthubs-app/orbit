import assert from "node:assert/strict";
import test from "node:test";
import { createSyncDomainHandlers } from "../../app/api/sync/domain-handlers";
import { createDomainCursorCodec } from "../../features/sync/domain-cursor";
import { SYNC_DOMAINS, SYNC_REGISTRY_VERSION, SYNC_DOMAIN_SCHEMA_VERSION } from "../../features/sync/domain-registry";
import { createDomainReadService } from "../../features/sync/domain-read-service";
import { createTaskRepository } from "../../features/tasks/repository";
import { createTaskService } from "../../features/tasks/service";
import { offlineReadEnvelopeSchema, domainPageSchema, domainManifestSchema } from "../../shared/api-schema/universal-read";
import { createMemoryLiveRecordStore } from "../../shared/storage/live-record-store";

// Server-side grants, epochs and per-domain pages against a scripted SQL client:
// the epoch is derived from the actor's authorization rows, and every cursor is
// bound to actor / workspace / domain / schema / registry / epoch / generation.
const SECRET = "lease-manifest-domains-test-secret-0123456789abcdef";
const W = "workspace:w";
const A = "actor:a";
const NOW = "2026-09-18T08:00:00.000Z";

interface Scripted { auth: { max: string | null; count: number; identity: number }; rows: Record<string, { record_id: string; sync_revision: number; payload: Record<string, unknown> }[]> }

function scriptedClient(state: Scripted) {
  const calls: string[] = [];
  return {
    calls,
    client: {
      async query<T>(text: string, values?: readonly unknown[]) {
        calls.push(text);
        if (text.includes("sync:authorization-epoch")) {
          return { rows: [{ max_updated_at: state.auth.max, count: String(state.auth.count), identity_count: String(state.auth.identity) } as T] };
        }
        if (text.includes("sync:domain:high-watermark")) {
          const rows = state.rows[String(values?.[2])] ?? [];
          return { rows: [{ high_watermark: String(rows.reduce((max, row) => Math.max(max, row.sync_revision), 0)) } as T] };
        }
        if (text.includes("sync:domain:page")) {
          const collection = String(values?.[2]);
          const canonicalOnly = (row: { payload: Record<string, unknown> }) => collection !== "tasks" || "task" in row.payload;
          const after = Number(values?.[3]); const high = Number(values?.[4]); const limit = Number(values?.[5]);
          const rows = (state.rows[collection] ?? []).filter(canonicalOnly).filter((row) => row.sync_revision > after && row.sync_revision <= high)
            .sort((l, r) => l.sync_revision - r.sync_revision).slice(0, limit)
            .map((row) => ({ workspace_id: W, collection_name: collection, record_id: row.record_id, user_id: A, lifecycle_state: "active", payload: row.payload, updated_at: NOW, deleted_at: null, sync_revision: String(row.sync_revision) }));
          return { rows: rows as T[] };
        }
        throw new Error(`unexpected SQL: ${text.slice(0, 60)}`);
      },
    },
  };
}

// Canonical task payloads come from the real repository so the page filter (payload ? 'task') sees production shapes.
const canonicalStore = createMemoryLiveRecordStore<Record<string, unknown>>();
const canonicalTasks = createTaskService({ repository: createTaskRepository({ store: canonicalStore, workspaceId: W }) });
async function task(id: string, sync_revision: number) {
  const created = await canonicalTasks.create({ actorId: A, title: id, category: "work", idempotencyKey: `k:${id}`, now: NOW });
  const record = canonicalStore.listRecords({ workspaceId: W, collectionName: "tasks", limit: "unbounded" }).find((row) => row.recordId === created.task.id)!;
  return { record_id: record.recordId, sync_revision, payload: record.payload };
}

function harness(state: Scripted, options: { conditional?: boolean } = {}) {
  const { client, calls } = scriptedClient(state);
  const service = createDomainReadService({ client, cursorSecret: SECRET, now: () => NOW });
  // The manifest watermark covers the actor's registered collections plus the shared authorization rows.
  const watermarkClient = {
    async query<T>(text: string, values?: readonly unknown[]) {
      calls.push(text);
      if (!text.includes("domain:watermark:user")) throw new Error(`unexpected watermark SQL: ${text.slice(0, 60)}`);
      const own = values?.[1] as string[];
      const business = own.flatMap((collection) => state.rows[collection] ?? []);
      const max = business.length ? `2026-09-18T07:${String(Math.max(...business.map((row) => row.sync_revision))).padStart(2, "0")}:00Z` : state.auth.max;
      return { rows: [{ max_updated_at: max, count: String(business.length + state.auth.count) } as T] };
    },
  };
  const handlers = createSyncDomainHandlers({
    resolveActor: async () => ({ id: A, userId: A, workspaceId: W }), createService: () => service, now: () => Date.parse(NOW),
    conditionalRead: options.conditional ? { client: watermarkClient, workspaceId: W, version: "test" } : { client: null },
  });
  return { handlers, service, calls };
}

test("lease covers the registry with epochs derived from the actor's authorization rows and validates against the App schema", async () => {
  const { handlers } = harness({ auth: { max: "2026-09-18T07:00:00Z", count: 3, identity: 1 }, rows: {} });
  const response = await handlers.lease(new Request("https://orbit.local/api/sync/lease?baseUrl=https%3A%2F%2Fapp.orbit.local%2F"));
  assert.equal(response.status, 200);
  const body = await response.json() as { success: true; data: unknown };
  const envelope = offlineReadEnvelopeSchema.parse(body.data);
  assert.equal(envelope.actorId, A);
  assert.equal(envelope.baseUrl, "https://app.orbit.local");
  assert.deepEqual(envelope.grants.map((grant) => grant.domainId).sort(), SYNC_DOMAINS.map((domain) => domain.domainId).sort());
  assert.ok(envelope.grants.every((grant) => grant.workspaceId === W && /^[a-f0-9]{32}$/.test(grant.authorizationEpoch)));
  assert.ok(envelope.offlineReadExpiresAt <= envelope.sessionExpiresAt);
  assert.equal(envelope.lastVerifiedAt, Date.parse(NOW));
  const manifest = await handlers.manifest(new Request("https://orbit.local/api/sync/manifest"));
  const parsed = domainManifestSchema.parse(((await manifest.json()) as { data: unknown }).data);
  assert.equal(parsed.registryVersion, SYNC_REGISTRY_VERSION);
  for (const entry of parsed.domains) {
    assert.equal(entry.authorizationEpoch, envelope.grants.find((grant) => grant.domainId === entry.domainId)!.authorizationEpoch, "manifest and lease agree on the epoch");
    assert.equal(entry.schemaVersion, SYNC_DOMAIN_SCHEMA_VERSION);
  }
});

test("an actor without authorization rows gets a lease with no grants and an empty manifest, and domain pages are refused", async () => {
  const { handlers } = harness({ auth: { max: null, count: 0, identity: 0 }, rows: { tasks: [await task("t1", 1)] } });
  const lease = offlineReadEnvelopeSchema.parse(((await (await handlers.lease(new Request("https://orbit.local/api/sync/lease?baseUrl=https%3A%2F%2Fapp.orbit.local"))).json()) as { data: unknown }).data);
  assert.deepEqual(lease.grants, []);
  const manifest = domainManifestSchema.parse(((await (await handlers.manifest(new Request("https://orbit.local/api/sync/manifest"))).json()) as { data: unknown }).data);
  assert.deepEqual(manifest.domains, []);
  const page = await handlers.domain(new Request("https://orbit.local/api/sync/domains/tasks"), "tasks");
  assert.equal(page.status, 403);
});

test("domain pages walk one collection with epoch-bound cursors; an epoch change invalidates the cursor with SYNC_RESET_REQUIRED", async () => {
  const [t1, t2, t3] = [await task("t1", 1), await task("t2", 2), await task("t3", 3)];
  const legacy = { record_id: "legacy:1", sync_revision: 4, payload: { id: "legacy:1", accountId: A, title: "legacy", status: "open", source: { type: "manual", id: "t" }, evidenceIds: ["e"], createdAt: NOW, updatedAt: NOW } };
  const state: Scripted = { auth: { max: "2026-09-18T07:00:00Z", count: 3, identity: 1 }, rows: { tasks: [t1, t2, t3, legacy], notes: [] } };
  const { handlers } = harness(state);
  const first = await handlers.domain(new Request("https://orbit.local/api/sync/domains/tasks?limit=2"), "tasks");
  assert.equal(first.status, 200);
  const page1 = domainPageSchema.parse(((await first.json()) as { data: unknown }).data);
  assert.equal(page1.domainId, "tasks");
  assert.deepEqual(page1.changes.map((change) => change.id), [t1.record_id, t2.record_id]);
  assert.equal(page1.hasMore, true);
  assert.equal(page1.registryVersion, SYNC_REGISTRY_VERSION);
  const claims = createDomainCursorCodec({ secret: SECRET }).decode(page1.nextCursor, { actorId: A, workspaceId: W, domainId: "tasks", authorizationEpoch: page1.authorizationEpoch, generation: page1.generation, schemaVersion: SYNC_DOMAIN_SCHEMA_VERSION, registryVersion: SYNC_REGISTRY_VERSION }, Date.parse(NOW));
  assert.equal(claims.afterRevision, "2");
  const second = await handlers.domain(new Request(`https://orbit.local/api/sync/domains/tasks?limit=2&cursor=${encodeURIComponent(page1.nextCursor)}`), "tasks");
  const page2 = domainPageSchema.parse(((await second.json()) as { data: unknown }).data);
  assert.deepEqual(page2.changes.map((change) => change.id), [t3.record_id], "legacy-shaped rows never reach the v2 mirror");
  assert.equal(page2.hasMore, false);
  const third = await handlers.domain(new Request(`https://orbit.local/api/sync/domains/tasks?cursor=${encodeURIComponent(page2.nextCursor)}`), "tasks");
  assert.deepEqual(domainPageSchema.parse(((await third.json()) as { data: unknown }).data).changes, []);
  // An authorization change moves the epoch: the old cursor must force a full rebuild.
  state.auth = { max: "2026-09-18T07:30:00Z", count: 4, identity: 1 };
  const stale = await handlers.domain(new Request(`https://orbit.local/api/sync/domains/tasks?cursor=${encodeURIComponent(page2.nextCursor)}`), "tasks");
  assert.equal(stale.status, 409);
  assert.equal(((await stale.json()) as { error: { context: { syncErrorCode: string } } }).error.context.syncErrorCode, "SYNC_RESET_REQUIRED");
  // Another actor presenting the same cursor is refused before any page row is read.
  const other = createSyncDomainHandlers({ resolveActor: async () => ({ id: "actor:b", userId: "actor:b", workspaceId: W }), createService: () => createDomainReadService({ client: scriptedClient(state).client, cursorSecret: SECRET, now: () => NOW }), now: () => Date.parse(NOW) });
  assert.equal((await other.domain(new Request(`https://orbit.local/api/sync/domains/tasks?cursor=${encodeURIComponent(page1.nextCursor)}`), "tasks")).status, 409);
  assert.equal((await handlers.domain(new Request("https://orbit.local/api/sync/domains/unknown"), "unknown")).status, 404);
});

test("manifest is a conditional read: unchanged data answers 304 from one watermark row, a change answers 200 with a new ETag", async () => {
  const state: Scripted = { auth: { max: "2026-09-18T07:00:00Z", count: 3, identity: 1 }, rows: { tasks: [await task("task:1", 1)] } };
  const { handlers, calls } = harness(state, { conditional: true });
  const first = await handlers.manifest(new Request("https://orbit.local/api/sync/manifest"));
  assert.equal(first.status, 200);
  const etag = first.headers.get("ETag");
  assert.ok(etag && etag.startsWith("W/\""), "manifest carries a weak ETag");
  assert.equal(first.headers.get("Cache-Control"), "private, no-cache");
  const manifest = domainManifestSchema.parse(((await first.json()) as { data: unknown }).data);
  assert.equal(manifest.domains.find((entry) => entry.domainId === "tasks")?.watermark, "1");

  calls.length = 0;
  const unchanged = await handlers.manifest(new Request("https://orbit.local/api/sync/manifest", { headers: { "If-None-Match": etag! } }));
  assert.equal(unchanged.status, 304);
  assert.equal(unchanged.headers.get("ETag"), etag);
  assert.deepEqual(calls.map((sql) => sql.includes("domain:watermark:user") ? "watermark" : "other"), ["watermark"], "an unchanged manifest costs exactly one watermark row");

  state.rows.tasks!.push(await task("task:2", 2));
  calls.length = 0;
  const changed = await handlers.manifest(new Request("https://orbit.local/api/sync/manifest", { headers: { "If-None-Match": etag! } }));
  assert.equal(changed.status, 200);
  assert.notEqual(changed.headers.get("ETag"), etag);
  assert.equal(domainManifestSchema.parse(((await changed.json()) as { data: unknown }).data).domains.find((entry) => entry.domainId === "tasks")?.watermark, "2");
  assert.ok(calls.some((sql) => sql.includes("sync:domain:high-watermark")), "a changed manifest re-reads the domain watermarks");
});
