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
import { contactSyncPayloads, localContactCardPage, localContactDetail, localContactLabel } from "../src/view-models/contacts-local";

// Sprint 0116: the App side of the contacts domain — the real coordinator and
// the real SQLite mirror (node:sqlite) against a scripted host that speaks the
// domain protocol: pulled when granted, rows become the screens' contact rows,
// an edit replaces a row, a delete removes it, a revoked grant retires them all.
const baseUrl = "https://host.example";
const A = "actor-a";
const W = "workspace-host";
const T0 = Date.parse("2026-10-02T09:00:00.000Z");
const hashPayload = async (json: string) => createHash("sha256").update(json).digest("hex");

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
    async sync() { const request = session.synchronize("contact", { reason: "explicit" }); await request.started; return request.promise; },
    async records(kind: SyncChangeKind) { return (await session.readCollection(kind))?.records ?? []; },
    async ids(kind: SyncChangeKind) { return ((await session.readCollection(kind))?.records ?? []).map((record) => record.id).sort(); },
    async payload(kind: SyncChangeKind, id: string) { return ((await session.readCollection(kind))?.records ?? []).find((record) => record.id === id)?.payload as Record<string, unknown> | undefined; },
  };
}

const upsert = (id: string, revision: string, payload: Record<string, unknown>): DomainChange => ({ id, revision, operation: "upsert", payload });

function row(id: string, name: string, minute: number, extra: Record<string, unknown> = {}) {
  return {
    id, card: { id, displayName: name, organization: "星河能源", role: "顾问", sourceType: "manual", status: "active", pendingInitialization: false, nextActionPreview: "", valueTypes: [], updatedAt: "2026-10-01T00:00:00.000Z" },
    tags: [], search: { text: name + " 星河能源", occurredAt: `2026-10-01T00:0${minute}:00.000000Z`, updatedAt: `2026-10-01T00:0${minute}:00.000000Z`, error: null },
    detail: { state: "success", contact: { id, displayName: name } }, ...extra,
  };
}

test("a granted contacts domain is pulled into the mirror and becomes the list, detail and chip rows", async (t) => {
  const host: Host = { epoch: "e1", granted: ["notes", "contacts"], calls: [], log: {
    contacts: [upsert("contact-1", "1", row("contact-1", "张伟", 2)), upsert("contact-2", "2", row("contact-2", "佐藤 花子", 1))],
  } };
  const d = await device(t, host);
  const result = await d.sync();
  assert.equal(result?.error, null, String(result?.error));
  assert.ok(host.calls.includes("page:contacts"), "contacts is pulled");
  const rows = contactSyncPayloads(await d.records("contact"));
  assert.deepEqual(rows.map((payload) => payload.id).sort(), ["contact-1", "contact-2"]);
  assert.deepEqual(localContactCardPage(rows, { query: "佐藤" }, null, "now").items.map((card) => card.displayName), ["佐藤 花子"]);
  assert.equal((localContactDetail(rows, "contact-1")?.contact as { displayName: string }).displayName, "张伟");
  assert.equal(localContactLabel(rows, "contact-2")?.name, "佐藤 花子");
});

test("an edit replaces the contact on the device and a delete removes it", async (t) => {
  const host: Host = { epoch: "e1", granted: ["contacts"], calls: [], log: {
    contacts: [upsert("contact-1", "1", row("contact-1", "张伟", 2)), upsert("contact-2", "2", row("contact-2", "佐藤 花子", 1))],
  } };
  const d = await device(t, host);
  await d.sync();
  host.log.contacts!.push(upsert("contact-1", "3", row("contact-1", "张伟（已改名）", 2)));
  host.log.contacts!.push({ id: "contact-2", revision: "4", operation: "delete", payload: null });
  const result = await d.sync();
  assert.equal(result?.error, null);
  const rows = contactSyncPayloads(await d.records("contact"));
  assert.deepEqual(rows.map((payload) => payload.id), ["contact-1"], "the deleted contact left the device");
  assert.equal(rows[0]?.card?.displayName, "张伟（已改名）");
});

test("a lease that no longer grants contacts retires every contact row on the device", async (t) => {
  const host: Host = { epoch: "e1", granted: ["notes", "contacts"], calls: [], log: { contacts: [upsert("contact-1", "1", row("contact-1", "张伟", 2))] } };
  const d = await device(t, host);
  await d.sync();
  assert.equal((await d.records("contact")).length, 1);
  host.granted = ["notes"];
  await d.sync();
  assert.deepEqual(await d.records("contact"), [], "revoked: retired");
});

test("a malformed mirror row is ignored by the screens, never shown half-built", () => {
  assert.deepEqual(contactSyncPayloads([
    { id: "ok", payload: row("ok", "张伟", 1) },
    { id: "wrong-id", payload: row("other", "别人", 1) },
    { id: "no-search", payload: { ...row("no-search", "X", 1), search: null } },
    { id: "bad-card", payload: { ...row("bad-card", "X", 1), card: { id: "bad-card" } } },
  ]).map((payload) => payload.id), ["ok"]);
});

test("the browser mirror whitelist carries contacts (decision recorded in the threat model)", () => {
  assert.ok(WEB_MIRROR_DOMAIN_IDS.includes("contacts"));
});
