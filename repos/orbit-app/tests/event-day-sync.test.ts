import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test, { type TestContext } from "node:test";
import type { SyncChangeKind } from "../src/api/contract/sync";
import type { DomainChange, DomainManifest, DomainPage, OfflineReadEnvelope } from "../src/api/contract/universal-read";
import { initializeLocalSyncDatabase } from "../src/data/sync/local-sync-database";
import { createSyncCoordinator, type SyncCoordinatorLifecycle } from "../src/data/sync/sync-coordinator";
import type { SyncClient } from "../src/data/sync/sync-client";
import { WEB_MIRROR_DOMAIN_IDS } from "../src/data/sync/web-mirror-storage";
import { NodeTestDatabase } from "./helpers/node-sync-database";

// Sprint 0115: the App side of the event-day domains — the real coordinator and
// the real SQLite mirror (node:sqlite) against a scripted host that speaks the
// domain protocol: pulled when granted, a delete removes the row, a revoked
// grant retires every row of the domain.
const baseUrl = "https://host.example";
const A = "actor-a";
const W = "workspace-host";
const T0 = Date.parse("2026-10-02T09:00:00.000Z");
const hashPayload = async (json: string) => createHash("sha256").update(json).digest("hex");
const EVENT_DOMAINS = ["event-registrations", "registered-events", "event-published-results"] as const;

interface Host {
  epoch: string;
  granted: string[];
  /** Every change ever made per domain, in revision order; a cursor is an index into it. */
  log: Record<string, DomainChange[]>;
  calls: string[];
}

function lease(host: Host): OfflineReadEnvelope {
  return {
    version: 2, baseUrl, actorId: A, subject: "user-a", sessionExpiresAt: T0 + 30 * 86_400_000, offlineReadExpiresAt: T0 + 7 * 86_400_000, lastVerifiedAt: T0,
    grants: host.granted.map((domainId) => ({ workspaceId: W, domainId, authorizationEpoch: host.epoch })), databaseKeyRef: "key-ref",
  };
}

function client(host: Host): SyncClient {
  return {
    async getLease() { host.calls.push("lease"); return lease(host); },
    async getManifest(): Promise<DomainManifest> {
      return { registryVersion: 2, domains: host.granted.map((domainId) => ({ domainId, schemaVersion: 2, workspaceId: W, authorizationEpoch: host.epoch, generation: "g", watermark: String((host.log[domainId] ?? []).length), history: "complete", membershipCursor: null })) };
    },
    async getDomainPage(input): Promise<DomainPage> {
      host.calls.push(`page:${input.domainId}`);
      if (!host.granted.includes(input.domainId)) throw new Error(`ungranted ${input.domainId}`);
      const log = host.log[input.domainId] ?? [];
      const after = input.cursor ? Number(input.cursor) : 0;
      return {
        domainId: input.domainId, schemaVersion: 2, registryVersion: 2, authorizationEpoch: host.epoch, changes: log.slice(after),
        nextCursor: String(log.length), highWatermark: String(log.length), hasMore: false, generation: "g", serverTime: new Date(T0).toISOString(),
      };
    },
    async getPage() { throw new Error("legacy /api/sync must not be used"); },
  };
}

async function device(t: TestContext, host: Host) {
  const database = new NodeTestDatabase();
  t.after(() => database.close());
  await initializeLocalSyncDatabase(database);
  const lifecycle: SyncCoordinatorLifecycle = {
    async setScope() { return true; },
    async withDatabase(scope, operation) { return operation(database, scope ?? { baseUrl, actorId: A }); },
  };
  const session = createSyncCoordinator({ lifecycle, now: () => T0, hashPayload }).openScope({ actorId: A, baseUrl, client: client(host), scopeKey: "k" });
  t.after(() => session.deactivate());
  return {
    async sync() { const request = session.synchronize("registered_event", { reason: "explicit" }); await request.started; return request.promise; },
    async ids(kind: SyncChangeKind) { return ((await session.readCollection(kind))?.records ?? []).map((record) => record.id).sort(); },
    async payload(kind: SyncChangeKind, id: string) { return ((await session.readCollection(kind))?.records ?? []).find((record) => record.id === id)?.payload as Record<string, unknown> | undefined; },
  };
}

const upsert = (id: string, revision: string, payload: Record<string, unknown>): DomainChange => ({ id, revision, operation: "upsert", payload });

test("granted event domains are pulled into the mirror and read per kind", async (t) => {
  const host: Host = { epoch: "e1", granted: ["tasks", ...EVENT_DOMAINS], calls: [], log: {
    "event-registrations": [upsert("event-1", "1", { eventId: "event-1", membershipStatus: "rsvped", admissionStatus: null })],
    "registered-events": [upsert("event-1", "2", { eventId: "event-1", title: "Climate night" })],
    "event-published-results": [upsert("event-1", "3", { eventId: "event-1", generationId: "g1" })],
  } };
  const d = await device(t, host);
  const result = await d.sync();
  assert.equal(result?.error, null, String(result?.error));
  for (const domain of EVENT_DOMAINS) assert.ok(host.calls.includes(`page:${domain}`), `${domain} is pulled`);
  assert.deepEqual(await d.ids("event_registration"), ["event-1"]);
  assert.deepEqual(await d.ids("registered_event"), ["event-1"]);
  assert.deepEqual(await d.ids("event_published_result"), ["event-1"]);
  assert.equal((await d.payload("registered_event", "event-1"))?.title, "Climate night");
});

test("a cancellation's deletes remove the event and its published result from the device; the registration row says cancelled", async (t) => {
  const host: Host = { epoch: "e1", granted: [...EVENT_DOMAINS], calls: [], log: {
    "event-registrations": [upsert("event-1", "1", { eventId: "event-1", membershipStatus: "rsvped", admissionStatus: null })],
    "registered-events": [upsert("event-1", "2", { eventId: "event-1" }), upsert("event-2", "4", { eventId: "event-2" })],
    "event-published-results": [upsert("event-1", "3", { eventId: "event-1" })],
  } };
  const d = await device(t, host);
  await d.sync();
  host.log["event-registrations"]!.push(upsert("event-1", "5", { eventId: "event-1", membershipStatus: "cancelled", admissionStatus: null }));
  host.log["registered-events"]!.push({ id: "event-1", revision: "5", operation: "delete", payload: null });
  host.log["event-published-results"]!.push({ id: "event-1", revision: "5", operation: "delete", payload: null });
  const result = await d.sync();
  assert.equal(result?.error, null);
  assert.deepEqual(await d.ids("registered_event"), ["event-2"], "the cancelled event left the device");
  assert.deepEqual(await d.ids("event_published_result"), [], "the published seats and recommendations left the device");
  assert.equal((await d.payload("event_registration", "event-1"))?.membershipStatus, "cancelled");
});

test("a lease that no longer grants the event domains retires every event row on the device", async (t) => {
  const host: Host = { epoch: "e1", granted: ["tasks", ...EVENT_DOMAINS], calls: [], log: {
    "registered-events": [upsert("event-1", "2", { eventId: "event-1" })],
    "event-published-results": [upsert("event-1", "3", { eventId: "event-1" })],
  } };
  const d = await device(t, host);
  await d.sync();
  assert.deepEqual(await d.ids("registered_event"), ["event-1"]);
  host.granted = ["tasks"];
  await d.sync();
  assert.deepEqual(await d.ids("registered_event"), [], "revoked: retired");
  assert.deepEqual(await d.ids("event_published_result"), []);
});

test("the browser mirror whitelist carries the event-day domains (decision recorded in the threat model)", () => {
  for (const domain of EVENT_DOMAINS) assert.ok(WEB_MIRROR_DOMAIN_IDS.includes(domain), domain);
});
