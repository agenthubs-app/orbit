/**
 * W0028：本人报名轻量读取（只取 eventId／status）。
 *
 * SC-01 等价：本机 PostgreSQL 临时 schema 造数，新旧读取逐项对照（legacy 投影与 canonical 两路；
 *   批量与单场；失败语义也一致——旧读取 reject 的新读取也 reject，反之亦然）。runtime 层用子进程
 *   按真实配置加载 `registration/runtime.ts`，直接对照新旧 runtime 函数。
 * SC-02 详情页本人判定：rsvped 才下发名单；整行 `eventRegistrationRuntimeService.get` 0 次。
 * SC-03 失败、闸门、去重：闸门在发 SQL 之前生效；并发相同读取只发一条 SQL；失败不缓存；
 *   任一路读取失败都向上抛，不当成「未报名」。
 */
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import Module, { createRequire } from "node:module";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import test, { type TestContext } from "node:test";

import { Pool, type PoolClient } from "pg";

import { createPostgresCanonicalRegistrationMethods } from "../../features/events/event-operations/storage/canonical-registration-repository";
import type { EventOperationsPostgresRuntime } from "../../features/events/event-operations/storage/postgres-client";
import { createEventOperationsPostgresClient } from "../../features/events/event-operations/storage/postgres-client";
import { createPostgresEventOperationsRepository } from "../../features/events/event-operations/storage/postgres-repository";
import { runEventOperationsMigrations } from "../../features/events/event-operations/storage/migrations";
import { createMemoryEventOperationsRepository } from "../../features/events/event-operations/storage/memory-repository";
import { legacyResponsesFromAnswers } from "../../features/events/registration/interview-response-contract";
import {
  createMemoryEventRegistrationProvider,
  eventRegistrationId,
} from "../../features/events/registration/service";
import { createEventRegistrationLiveRecordProvider } from "../../features/events/registration/storage/live-record-provider";
import type { EventRegistration } from "../../features/events/registration/contract";
import { ReadBudgetExceededError, type ReadBudgetGate } from "../../features/sync/read-budget-gate";
import {
  createConfiguredPostgresLiveRecordStore,
  createGatedDedupedCustomRead,
  createInflightReadDeduper,
} from "../../shared/storage/configured-live-record-store";
import { createMemoryLiveRecordStore } from "../../shared/storage/live-record-store";
import { ORBIT_RECORDS_SCHEMA_SQL } from "../../shared/storage/migrations";
import { createPostgresLiveRecordStore } from "../../shared/storage/postgres-live-record-store";

const root = join(fileURLToPath(import.meta.url), "../../..");
const require = createRequire(import.meta.url);
const databaseUrl = process.env.ORBIT_EVENT_DATABASE_URL;
const pgSkip = { skip: databaseUrl ? false : "ORBIT_EVENT_DATABASE_URL is not configured" };
const WORKSPACE = "workspace:w0028-status";

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

interface SqlCall { text: string; values: readonly unknown[] }

function countingClient(rows: readonly Record<string, unknown>[] = [], options: { failFirst?: number; hold?: Promise<void> } = {}) {
  const calls: SqlCall[] = [];
  let failures = options.failFirst ?? 0;
  return {
    calls,
    client: {
      async query<TRow>(text: string, values: readonly unknown[] = []) {
        calls.push({ text, values });
        if (options.hold) await options.hold;
        if (failures > 0) {
          failures -= 1;
          throw new Error("status sql failed");
        }
        return { rows: rows as TRow[] };
      },
    },
  };
}

function spyGate(open = false) {
  const checks: Array<string | undefined> = [];
  const gate: ReadBudgetGate = {
    assertAllowed(input) {
      checks.push(input.collectionName);
      if (open) {
        throw new ReadBudgetExceededError({ bytes: 2, maxBytes: 1, maxRows: null, rows: 0, windowMs: 60_000, collectionName: input.collectionName });
      }
    },
    observe() {},
    snapshot() {
      return { bytes: 0, maxBytes: 1, maxRows: null, open, rows: 0, windowMs: 60_000 };
    },
  };
  return { checks, gate };
}

function statusProvider(client: ReturnType<typeof countingClient>["client"], gate: ReadBudgetGate | null) {
  return createEventRegistrationLiveRecordProvider({
    statusSql: { client, read: createGatedDedupedCustomRead(createInflightReadDeduper(), gate) },
    store: createMemoryLiveRecordStore<Record<string, unknown>>(),
    workspaceId: WORKSPACE,
  });
}

/** Column list between the outer `select` and its `from`. */
function selectedColumns(text: string): string {
  const match = /select([\s\S]*?)\bfrom\b/iu.exec(text);
  assert.ok(match, "a select statement");
  return match[1]!;
}

function assertNoWideColumns(text: string) {
  const columns = selectedColumns(text);
  assert.doesNotMatch(columns, /(^|,)\s*(\w+\.)?payload\s*(,|$)/imu, "does not return payload");
  assert.doesNotMatch(columns, /(^|,)\s*(\w+\.)?profile_payload\s*(,|$)/imu, "does not return profile_payload");
  assert.doesNotMatch(columns, /search_text/iu, "does not return search_text");
  assert.doesNotMatch(columns, /\*/u, "does not select *");
}

function stubModules(t: TestContext, modules: Record<string, unknown>, fresh: readonly string[]) {
  const ids = [...Object.keys(modules), ...fresh].map((id) => require.resolve(id));
  const before = new Map(ids.map((id) => [id, require.cache[id]]));
  t.after(() => {
    for (const [id, previous] of before) {
      if (previous) require.cache[id] = previous;
      else delete require.cache[id];
    }
  });
  for (const [id, exports] of Object.entries(modules)) {
    const resolved = require.resolve(id);
    const replacement = new Module(resolved);
    replacement.filename = resolved;
    replacement.loaded = true;
    replacement.exports = exports;
    require.cache[resolved] = replacement;
  }
  for (const id of fresh) delete require.cache[require.resolve(id)];
}

/** Runtime-level registered map with the page semantics: Map last-wins, then `status === "rsvped"`. */
function registeredByEvent(rows: readonly { eventId: string; status: unknown }[], eventIds: readonly string[]) {
  const byEvent = new Map(rows.map((row) => [row.eventId, row] as const));
  return Object.fromEntries(eventIds.map((eventId) => [eventId, byEvent.get(eventId)?.status === "rsvped"]));
}

async function settle<T>(read: () => Promise<T>): Promise<{ ok: true; value: T } | { ok: false }> {
  try {
    return { ok: true, value: await read() };
  } catch {
    return { ok: false };
  }
}

// ---------------------------------------------------------------------------
// SC-01 SQL shape (no database)
// ---------------------------------------------------------------------------

test("SC-01 legacy status read: one statement, event-id filtered, no payload/search_text columns", async () => {
  const counting = countingClient([]);
  const provider = statusProvider(counting.client, null);
  assert.deepEqual(await provider.listRegistrationStatusesForUser("user:a", ["event:b", "event:a", "event:b"]), []);
  assert.equal(counting.calls.length, 1);
  const [call] = counting.calls;
  assertNoWideColumns(call!.text);
  assert.match(call!.text, /= any\(\$3::text\[\]\)/u);
  assert.match(call!.text, /collection_name = 'event_registrations'/u);
  assert.match(call!.text, /lifecycle_state <> 'deleted'/u);
  assert.deepEqual(call!.values, [WORKSPACE, "user:a", ["event:a", "event:b"]]);
});

test("SC-01 legacy status read: empty event ids issue no statement", async () => {
  const counting = countingClient([]);
  const provider = statusProvider(counting.client, spyGate().gate);
  assert.deepEqual(await provider.listRegistrationStatusesForUser("user:a", []), []);
  assert.equal(counting.calls.length, 0);
});

test("SC-01 legacy single status read: looks up the registration record id only", async () => {
  const counting = countingClient([]);
  const provider = statusProvider(counting.client, null);
  assert.equal(await provider.getRegistrationStatus("event:a", "user:a"), null);
  assert.equal(counting.calls.length, 1);
  assertNoWideColumns(counting.calls[0]!.text);
  assert.deepEqual(counting.calls[0]!.values, [WORKSPACE, eventRegistrationId("event:a", "user:a"), "event:a", "user:a"]);
});

test("SC-01 canonical status read: one statement keyed by actor id, only event_id/status/valid", async () => {
  const counting = countingClient([]);
  const methods = createPostgresCanonicalRegistrationMethods({ client: counting.client, workspaceId: "workspace:test" } as unknown as EventOperationsPostgresRuntime);
  assert.deepEqual(await methods.listCanonicalRegistrationStatusesForUser("actor:a", ["event:a", "event:b", "event:a"]), []);
  assert.deepEqual(await methods.listCanonicalRegistrationStatusesForUser("actor:a", []), []);
  assert.equal(counting.calls.length, 1, "empty event ids issue no statement");
  const [call] = counting.calls;
  assertNoWideColumns(call!.text);
  assert.match(call!.text, /membership_head\.actor_id = \$2/u);
  assert.match(call!.text, /membership_head\.event_id = any\(\$3::text\[\]\)/u);
  assert.match(call!.text, /join event_ops_membership_versions/u, "keeps the version join (W28-4 A)");
  assert.match(call!.text, /join event_ops_profile_versions/u, "keeps the profile join (W28-4 A)");
  assert.deepEqual(call!.values, ["workspace:test", "actor:a", ["event:a", "event:b"]]);

  assert.equal(await methods.getCanonicalRegistrationStatus("event:a", "actor:a"), null);
  assertNoWideColumns(counting.calls[1]!.text);
  assert.deepEqual(counting.calls[1]!.values, ["workspace:test", "event:a", "actor:a"]);
});

test("SC-01 canonical status read rejects when any joined row fails the old validity rules", async () => {
  const rows = [
    { event_id: "event:a", status: "rsvped", valid: true },
    { event_id: "event:b", status: "cancelled", valid: false },
  ];
  const methods = createPostgresCanonicalRegistrationMethods({ client: countingClient(rows).client, workspaceId: "w" } as unknown as EventOperationsPostgresRuntime);
  await assert.rejects(methods.listCanonicalRegistrationStatusesForUser("actor:a", ["event:a", "event:b"]));
  const single = createPostgresCanonicalRegistrationMethods({ client: countingClient([rows[1]!]).client, workspaceId: "w" } as unknown as EventOperationsPostgresRuntime);
  await assert.rejects(single.getCanonicalRegistrationStatus("event:b", "actor:a"));
});

test("SC-01 memory implementations map the full reads to event id and status", async () => {
  const registration = (eventId: string, userId: string, status: "rsvped" | "cancelled") => ({
    cancelledAt: null, eventId, id: eventRegistrationId(eventId, userId),
    participantProfile: { answers: {}, displayName: "A", eventId, id: `p:${eventId}`, updatedAt: "2026-01-01T00:00:00.000Z", userId },
    participantProfileId: `p:${eventId}`, reactivatedAt: null, registeredAt: "2026-01-01T00:00:00.000Z",
    sideEffects: { calendarUpdateExecuted: false, emailSent: false, globalProfileWriteExecuted: false, notificationDelivered: false, organizerMessageSent: false, refundRequested: false },
    status, updatedAt: "2026-01-01T00:00:00.000Z", userId,
  }) as unknown as EventRegistration;
  const seed = [registration("event:a", "u", "rsvped"), registration("event:b", "u", "cancelled"), registration("event:a", "v", "rsvped")];
  const provider = createMemoryEventRegistrationProvider(seed);
  assert.deepEqual(
    [...await provider.listRegistrationStatusesForUser("u", ["event:a", "event:b", "event:c"])].sort((l, r) => l.eventId.localeCompare(r.eventId)),
    [{ eventId: "event:a", status: "rsvped" }, { eventId: "event:b", status: "cancelled" }],
  );
  assert.deepEqual(await provider.getRegistrationStatus("event:b", "u"), { eventId: "event:b", status: "cancelled" });
  assert.equal(await provider.getRegistrationStatus("event:c", "u"), null);

  const repository = createMemoryEventOperationsRepository({ canonicalRegistrations: seed });
  assert.deepEqual(
    [...await repository.listCanonicalRegistrationStatusesForUser("u", ["event:a", "event:b"])].sort((l, r) => l.eventId.localeCompare(r.eventId)),
    [{ eventId: "event:a", status: "rsvped" }, { eventId: "event:b", status: "cancelled" }],
  );
  assert.deepEqual(await repository.getCanonicalRegistrationStatus("event:a", "u"), { eventId: "event:a", status: "rsvped" });
  assert.equal(await repository.getCanonicalRegistrationStatus("event:a", "w"), null);

  // Without a status SQL reader (memory store, scripts, seeds) the live-record provider maps its full reads.
  const store = createMemoryLiveRecordStore<Record<string, unknown>>();
  const plain = createEventRegistrationLiveRecordProvider({ store, workspaceId: WORKSPACE });
  await plain.saveRegistration(seed[0]!);
  await plain.saveRegistration(seed[1]!);
  assert.deepEqual(
    [...await plain.listRegistrationStatusesForUser("u", ["event:a", "event:b"])].sort((l, r) => l.eventId.localeCompare(r.eventId)),
    [{ eventId: "event:a", status: "rsvped" }, { eventId: "event:b", status: "cancelled" }],
  );
  assert.deepEqual(await plain.getRegistrationStatus("event:a", "u"), { eventId: "event:a", status: "rsvped" });
});

// ---------------------------------------------------------------------------
// SC-03 gate / dedupe / failure (no database)
// ---------------------------------------------------------------------------

test("SC-03 (b) a closed read-budget gate rejects the legacy status read before any SQL", async () => {
  const counting = countingClient([]);
  const { checks, gate } = spyGate(true);
  const provider = statusProvider(counting.client, gate);
  await assert.rejects(provider.listRegistrationStatusesForUser("user:a", ["event:a"]), ReadBudgetExceededError);
  await assert.rejects(provider.getRegistrationStatus("event:a", "user:a"), ReadBudgetExceededError);
  assert.equal(counting.calls.length, 0);
  assert.deepEqual(checks, ["event_registrations", "event_registrations"]);
});

test("SC-03 (c) concurrent identical legacy status reads: gate checked per call, one SQL, same result; failures are not cached", async () => {
  let release!: () => void;
  const hold = new Promise<void>((resolve) => { release = resolve; });
  const rows = [{ event_id: "event:a", issue: null, status: "rsvped" }];
  const counting = countingClient(rows, { hold });
  const { checks, gate } = spyGate();
  const provider = statusProvider(counting.client, gate);
  const first = provider.listRegistrationStatusesForUser("user:a", ["event:a", "event:b"]);
  const second = provider.listRegistrationStatusesForUser("user:a", ["event:b", "event:a", "event:a"]);
  release();
  const [left, right] = await Promise.all([first, second]);
  assert.deepEqual(left, [{ eventId: "event:a", status: "rsvped" }]);
  assert.deepEqual(right, left);
  assert.equal(checks.length, 2, "gate checked for each logical call");
  assert.equal(counting.calls.length, 1, "identical in-flight reads share one statement");

  // A different user or event set is a different read.
  await provider.listRegistrationStatusesForUser("user:b", ["event:a"]);
  assert.equal(counting.calls.length, 2);

  const failing = countingClient(rows, { failFirst: 1 });
  const failingProvider = statusProvider(failing.client, null);
  const results = await Promise.allSettled([
    failingProvider.getRegistrationStatus("event:a", "user:a"),
    failingProvider.getRegistrationStatus("event:a", "user:a"),
  ]);
  assert.deepEqual(results.map((result) => result.status), ["rejected", "rejected"]);
  assert.equal(failing.calls.length, 1);
  assert.equal((await failingProvider.getRegistrationStatus("event:a", "user:a"))?.status, "rsvped");
  assert.equal(failing.calls.length, 2, "the failed read is not cached");
});

test("SC-03 (c) configured store: the status reader shares the store gate/dedupe and store writes evict it", async () => {
  let releaseRead!: () => void;
  const heldRead = new Promise<void>((resolve) => { releaseRead = resolve; });
  let statusReads = 0;
  const configured = createConfiguredPostgresLiveRecordStore({
    createClient: () => ({
      close: async () => undefined,
      async query<TRow>(text: string) {
        if (/update orbit_records/iu.test(text)) return { rows: [] as TRow[] };
        statusReads += 1;
        await heldRead;
        return { rows: [] as TRow[] };
      },
    }),
    env: { ORBIT_DATABASE_URL: "postgresql://unused.invalid/w0028-status-dedupe", ORBIT_WORKSPACE_ID: "workspace:w0028-dedupe" },
  })!;
  const provider = createEventRegistrationLiveRecordProvider({
    statusSql: { client: configured.client, read: configured.customRead },
    store: configured.store,
    workspaceId: configured.workspaceId,
  });
  const before = provider.getRegistrationStatus("event:a", "user:a");
  const joined = provider.getRegistrationStatus("event:a", "user:a");
  await Promise.resolve();
  assert.equal(statusReads, 1, "identical in-flight reads share one statement");
  await configured.store.deleteRecord({
    collectionName: "event_registrations", deletedAt: "2026-01-01T00:00:00.000Z", recordId: "r", workspaceId: configured.workspaceId,
  });
  const after = provider.getRegistrationStatus("event:a", "user:a");
  await Promise.resolve();
  await Promise.resolve();
  assert.equal(statusReads, 2, "a read started after a store write does not reuse the older in-flight read");
  releaseRead();
  await Promise.all([before, joined, after]);
});

// ---------------------------------------------------------------------------
// runtime wiring (require.cache stubs)
// ---------------------------------------------------------------------------

interface RuntimeScenario {
  canonical?: "ok" | "fails" | "unconfigured";
  enrollment: "legacy_unenrolled" | "enrolled";
  legacy?: "ok" | "fails";
  rows?: { eventId: string; status: string | null }[];
}

function loadRuntime(t: TestContext, scenario: RuntimeScenario) {
  const fullRowCalls: string[] = [];
  const statusCalls: string[] = [];
  const fullRow = (name: string) => async () => {
    fullRowCalls.push(name);
    return [];
  };
  const rows = scenario.rows ?? [];
  const modules: Record<string, unknown> = {
    [join(root, "features/events/registration/deadline-gated-service.ts")]: {
      createDeadlineGatedEventRegistrationService: () => ({ get: fullRow("runtimeService.get") }),
      resolveEventRegistrationAvailability: () => "open",
      resolveEventRegistrationWindowState: () => ({ availability: "open" }),
    },
    [join(root, "features/events/registration/service.ts")]: { createEventRegistrationService: () => ({}) },
    [join(root, "features/events/core/runtime.ts")]: {
      createConfiguredEventCoreService: () => ({ getPublishedEvent: async (eventId: string) => ({ eventId, phase: "upcoming" }) }),
    },
    [join(root, "features/events/registration/storage/event-operations-window-provider.ts")]: {
      createConfiguredEventOperationsRegistrationWindowProvider: () => ({ getEnrollment: async () => ({ state: scenario.enrollment }) }),
    },
    [join(root, "features/events/registration/storage/live-record-provider.ts")]: {
      createConfiguredEventRegistrationProvider: () => ({
        getRegistration: fullRow("legacy.getRegistration"),
        getRegistrationStatus: async (eventId: string, userId: string) => {
          statusCalls.push(`legacy.get:${eventId}:${userId}`);
          if (scenario.legacy === "fails") throw new Error("legacy status read failed");
          return rows.find((row) => row.eventId === eventId) ?? null;
        },
        listRegistrationStatusesForUser: async (userId: string) => {
          statusCalls.push(`legacy.list:${userId}`);
          if (scenario.legacy === "fails") throw new Error("legacy status read failed");
          return rows;
        },
        listRegistrationsForUser: fullRow("legacy.listRegistrationsForUser"),
      }),
    },
    [join(root, "features/events/event-operations/repository.ts")]: {
      createConfiguredEventOperationsRepository: () =>
        scenario.canonical === "unconfigured"
          ? null
          : {
              cancelCanonicalRegistration: async () => null,
              getCanonicalRegistration: fullRow("canonical.getCanonicalRegistration"),
              getCanonicalRegistrationStatus: async (eventId: string, userId: string) => {
                statusCalls.push(`canonical.get:${eventId}:${userId}`);
                if (scenario.canonical === "fails") throw new Error("canonical status read failed");
                return rows.find((row) => row.eventId === eventId) ?? null;
              },
              listCanonicalRegistrations: fullRow("canonical.listCanonicalRegistrations"),
              listCanonicalRegistrationStatusesForUser: async (userId: string) => {
                statusCalls.push(`canonical.list:${userId}`);
                if (scenario.canonical === "fails") throw new Error("canonical status read failed");
                return rows;
              },
              listCanonicalRegistrationsForUser: fullRow("canonical.listCanonicalRegistrationsForUser"),
              registerCanonicalParticipant: async () => null,
            },
    },
  };
  const runtimePath = join(root, "features/events/registration/runtime.ts");
  stubModules(t, modules, [runtimePath]);
  return {
    fullRowCalls,
    runtime: require(runtimePath) as typeof import("../../features/events/registration/runtime"),
    statusCalls,
  };
}

for (const failing of ["legacy", "canonical"] as const) {
  test(`SC-03 (a) a failing ${failing} status read rejects readRuntimeEventRegistrationStates instead of reading as unregistered`, async (t) => {
    const loaded = loadRuntime(t, {
      canonical: failing === "canonical" ? "fails" : "ok",
      enrollment: "enrolled",
      legacy: failing === "legacy" ? "fails" : "ok",
    });
    await assert.rejects(loaded.runtime.readRuntimeEventRegistrationStates({ eventIds: ["event:a"], userId: "actor:a" }));
    const single = loadRuntime(t, {
      canonical: failing === "canonical" ? "fails" : "ok",
      enrollment: failing === "legacy" ? "legacy_unenrolled" : "enrolled",
      legacy: failing === "legacy" ? "fails" : "ok",
    });
    await assert.rejects(single.runtime.readRuntimeEventRegistrationStatus({ eventId: "event:a", userId: "actor:a" }));
    assert.deepEqual([...loaded.fullRowCalls, ...single.fullRowCalls], []);
  });
}

test("SC-03 (d) repository unconfigured: canonical is empty for the batch read; the single read falls back like the runtime service", async (t) => {
  const loaded = loadRuntime(t, { canonical: "unconfigured", enrollment: "enrolled", rows: [{ eventId: "event:a", status: "rsvped" }] });
  assert.deepEqual(await loaded.runtime.readRuntimeEventRegistrationStates({ eventIds: ["event:a"], userId: "actor:a" }), {
    "event:a": { availability: "open", registered: false },
  });
  assert.deepEqual(await loaded.runtime.listRuntimeEventRegistrationStatusesForUser({ eventIds: ["event:a"], userId: "actor:a" }), []);
  // eventRegistrationRuntimeService.get without a canonical service reads the base (legacy) provider.
  assert.deepEqual(await loaded.runtime.readRuntimeEventRegistrationStatus({ eventId: "event:a", userId: "actor:a" }), { eventId: "event:a", status: "rsvped" });
  assert.deepEqual(loaded.statusCalls, ["legacy.list:actor:a", "legacy.list:actor:a", "legacy.get:event:a:actor:a"]);
  assert.deepEqual(loaded.fullRowCalls, []);
});

test("SC-02 readRuntimeEventRegistrationStates routes by enrollment through the status reads only", async (t) => {
  for (const enrollment of ["legacy_unenrolled", "enrolled"] as const) {
    const loaded = loadRuntime(t, {
      enrollment,
      rows: [{ eventId: "event:a", status: "rsvped" }, { eventId: "event:b", status: "cancelled" }, { eventId: "event:c", status: null }],
    });
    assert.deepEqual(await loaded.runtime.readRuntimeEventRegistrationStates({ eventIds: ["event:a", "event:b", "event:c", "event:d"], userId: "actor:a" }), {
      "event:a": { availability: "open", registered: true },
      "event:b": { availability: "open", registered: false },
      "event:c": { availability: "open", registered: false },
      "event:d": { availability: "open", registered: false },
    });
    assert.deepEqual(await loaded.runtime.readRuntimeEventRegistrationStatus({ eventId: "event:a", userId: "actor:a" }), { eventId: "event:a", status: "rsvped" });
    assert.deepEqual(loaded.statusCalls, [
      "legacy.list:actor:a",
      "canonical.list:actor:a",
      enrollment === "enrolled" ? "canonical.get:event:a:actor:a" : "legacy.get:event:a:actor:a",
    ]);
    assert.deepEqual(loaded.fullRowCalls, [], "no full-row reads");
    // Signed out: no personal read at all.
    await loaded.runtime.readRuntimeEventRegistrationStates({ eventIds: ["event:a"], userId: null });
    assert.equal(loaded.statusCalls.length, 3);
  }
});

// ---------------------------------------------------------------------------
// SC-02 / SC-03 (e) detail page own-registration decision
// ---------------------------------------------------------------------------

function loadDetail(t: TestContext, own: { status: string | null } | null | "fails") {
  const calls: string[] = [];
  // W0029: the roster reads the attendee projection (`listCanonicalRosterEntries`).
  const attendee = (displayName: string, status: "rsvped" | "cancelled") => ({
    participantProfile: status === "rsvped" ? { answers: { positioning: `${displayName} role` }, displayName } : null, status,
  });
  const modules: Record<string, unknown> = {
    [join(root, "features/events/registration/runtime.ts")]: {
      eventRegistrationRuntimeService: {
        get: async () => {
          calls.push("runtimeService.get");
          return null;
        },
      },
      readRuntimeEventRegistrationStatus: async ({ eventId, userId }: { eventId: string; userId: string }) => {
        calls.push(`status:${eventId}:${userId}`);
        if (own === "fails") throw new Error("status read failed");
        return own ? { eventId, status: own.status } : null;
      },
    },
    [join(root, "features/events/event-operations/repository.ts")]: {
      createConfiguredEventOperationsRepository: () => ({
        listCanonicalRosterEntries: async (eventId: string) => {
          calls.push(`roster:${eventId}`);
          return [attendee("Aiko", "rsvped"), attendee("Gone", "cancelled")];
        },
      }),
    },
  };
  const attendeesPath = join(root, "features/events/registered-catalogue-attendees.ts");
  stubModules(t, modules, [attendeesPath]);
  return {
    calls,
    read: (require(attendeesPath) as typeof import("../../features/events/registered-catalogue-attendees")).readRegisteredCatalogueAttendees,
  };
}

test("SC-02 detail decision: rsvped discloses the roster; cancelled / missing / non-string status do not; the full-row service is never used", async (t) => {
  const registered = loadDetail(t, { status: "rsvped" });
  assert.deepEqual(await registered.read({ actorId: " actor:a ", eventId: " event:a " }), {
    attendees: [{ displayName: "Aiko", organization: null, role: "Aiko role" }],
    eventId: "event:a",
  });
  assert.deepEqual(registered.calls, ["status:event:a:actor:a", "roster:event:a"]);

  for (const own of [{ status: "cancelled" }, { status: null }, null]) {
    const loaded = loadDetail(t, own);
    assert.equal(await loaded.read({ actorId: "actor:a", eventId: "event:a" }), null);
    assert.deepEqual(loaded.calls, ["status:event:a:actor:a"]);
  }
});

test("SC-03 (e) a failing detail status read rejects (page shows unavailable) before any private-event decision", async (t) => {
  const loaded = loadDetail(t, "fails");
  await assert.rejects(loaded.read({ actorId: "actor:a", eventId: "event:a" }), /status read failed/u);
  assert.deepEqual(loaded.calls, ["status:event:a:actor:a"]);

  const { resolveCanonicalEventDetailView } = require(join(root, "app/(app)/app/canonical-event-detail-view.ts")) as typeof import("../../app/(app)/app/canonical-event-detail-view");
  const privateEvent = {
    archivedAt: null, cancelledAt: null, description: "d", endsAt: "2030-03-14T12:30:00.000Z", eventId: "event:a", eventVersion: 1,
    lifecycleState: "published", organizerActorId: "actor:organizer", phase: "upcoming", publicCode: null, sourcePayload: {},
    startsAt: "2030-03-14T09:30:00.000Z", timezone: "Asia/Tokyo", title: "Private", venue: "Tokyo", workspaceId: "w",
  };
  await assert.rejects(
    resolveCanonicalEventDetailView({ actorId: "actor:a", routeId: "event:a" }, {
      accessService: {
        get: async () => ({ eventId: "event:a", owner: false, revision: 1, role: null, state: null, subjectActorId: "actor:a" }),
        grant: async () => { throw new Error("not used"); },
        revoke: async () => { throw new Error("not used"); },
      },
      coreService: { getEvent: async () => privateEvent, getPublishedEvent: async () => privateEvent, listEvents: async () => [privateEvent], listPublishedEvents: async () => [privateEvent] },
      now: new Date("2030-01-01T00:00:00.000Z"),
      readOperationsSummary: async () => null,
      readRegisteredContext: loaded.read,
      readRegistrationAvailability: async () => "open",
    } as never),
    /status read failed/u,
    "a failed own-registration read is not turned into forbidden/not registered",
  );
});

// ---------------------------------------------------------------------------
// SC-01 PostgreSQL equivalence (orbit_test, temporary schema)
// ---------------------------------------------------------------------------

async function withSchema(run: (input: { pool: Pool; schema: string }) => Promise<void>, timeZone?: string) {
  assert.ok(databaseUrl);
  const schema = `w0028_status_${randomUUID().replaceAll("-", "")}`;
  const admin = new Pool({ connectionString: databaseUrl, max: 1 });
  const pool = new Pool({ connectionString: databaseUrl, max: 4, options: `-c search_path=${schema}${timeZone ? ` -c TimeZone=${timeZone}` : ""}` });
  try {
    await admin.query(`create schema ${schema}`);
    await run({ pool, schema });
  } finally {
    await pool.end();
    try {
      await admin.query(`drop schema if exists ${schema} cascade`);
    } finally {
      await admin.end();
    }
  }
}

async function asReplica(pool: Pool, run: (client: PoolClient) => Promise<void>) {
  const client = await pool.connect();
  try {
    await client.query("begin");
    await client.query("set local session_replication_role = replica");
    await run(client);
    await client.query("commit");
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    client.release();
  }
}

function sqlClient(pool: Pool) {
  return { query: async <TRow>(text: string, values?: readonly unknown[]) => ({ rows: (await pool.query(text, values as unknown[])).rows as TRow[] }) };
}

interface LegacyRow {
  createdAt?: string;
  deletedAt?: string | null;
  lifecycle?: "active" | "deleted";
  occurredAt?: string | null;
  payload: unknown;
  recordId: string;
  updatedAt?: string;
  userId: string;
}

async function insertLegacy(pool: Pool, row: LegacyRow) {
  await pool.query(
    `insert into orbit_records (workspace_id, collection_name, record_id, user_id, source_type, source_id, payload,
       created_at, updated_at, occurred_at, deleted_at, lifecycle_state)
     values ($1, 'event_registrations', $2, $3, 'manual', $2, $4::jsonb, $5::timestamptz, $6::timestamptz, $7::timestamptz, $8::timestamptz, $9)`,
    [WORKSPACE, row.recordId, row.userId, JSON.stringify(row.payload), row.createdAt ?? "2026-01-01T00:00:00Z",
      row.updatedAt ?? "2026-01-02T00:00:00Z", row.occurredAt === undefined ? "2026-01-02T00:00:00Z" : row.occurredAt,
      row.deletedAt ?? null, row.lifecycle ?? "active"],
  );
}

function legacyPayload(eventId: string, userId: string, registration: Record<string, unknown> = {}, extra: Record<string, unknown> = {}) {
  const id = eventRegistrationId(eventId, userId);
  return {
    registration: { eventId, id, participantProfile: { answers: { industry: "SaaS" } }, status: "rsvped", userId, ...registration },
    registrationId: id,
    ...extra,
  };
}

test("SC-01 PG legacy projection: status reads equal the full reads (status matrix, duplicates, structure, scope, deletion)", pgSkip, async () => {
  await withSchema(async ({ pool }) => {
    await pool.query(ORBIT_RECORDS_SCHEMA_SQL);
    const client = sqlClient(pool);
    const oldProvider = createEventRegistrationLiveRecordProvider({ store: createPostgresLiveRecordStore({ client }), workspaceId: WORKSPACE });
    const newProvider = createEventRegistrationLiveRecordProvider({
      statusSql: { client, read: createGatedDedupedCustomRead(createInflightReadDeduper(), null) },
      store: createPostgresLiveRecordStore({ client }),
      workspaceId: WORKSPACE,
    });
    const U = "account:u";
    const V = "account:v";
    const ev = (name: string) => `event:legacy-${name}`;
    const withoutStatus = legacyPayload(ev("status-missing"), U);
    delete (withoutStatus.registration as Record<string, unknown>).status;
    const rows: LegacyRow[] = [
      { payload: legacyPayload(ev("rsvped"), U), recordId: eventRegistrationId(ev("rsvped"), U), userId: U },
      { payload: legacyPayload(ev("cancelled"), U, { status: "cancelled" }), recordId: eventRegistrationId(ev("cancelled"), U), userId: U },
      { payload: withoutStatus, recordId: eventRegistrationId(ev("status-missing"), U), userId: U },
      { payload: legacyPayload(ev("status-null"), U, { status: null }), recordId: eventRegistrationId(ev("status-null"), U), userId: U },
      { payload: legacyPayload(ev("status-pending"), U, { status: "pending" }), recordId: eventRegistrationId(ev("status-pending"), U), userId: U },
      { payload: legacyPayload(ev("status-number"), U, { status: 1 }), recordId: eventRegistrationId(ev("status-number"), U), userId: U },
      { payload: legacyPayload(ev("status-object"), U, { status: { value: "rsvped" } }), recordId: eventRegistrationId(ev("status-object"), U), userId: U },
      // someone else's registration for an in-page event
      { payload: legacyPayload(ev("other-user"), V), recordId: eventRegistrationId(ev("other-user"), V), userId: V },
      // duplicates for the same event: the older record wins (list order is newest first, Map keeps the last)
      { occurredAt: "2026-02-01T00:00:00Z", payload: legacyPayload(ev("duplicate-a"), U, { status: "cancelled" }), recordId: "dup-a-new", userId: U },
      { occurredAt: "2026-01-01T00:00:00Z", payload: legacyPayload(ev("duplicate-a"), U), recordId: "dup-a-old", userId: U },
      { occurredAt: "2026-02-01T00:00:00Z", payload: legacyPayload(ev("duplicate-b"), U), recordId: "dup-b-new", userId: U },
      { occurredAt: "2026-01-01T00:00:00Z", payload: legacyPayload(ev("duplicate-b"), U, { status: "cancelled" }), recordId: "dup-b-old", userId: U },
      // structural damage: skipped, not fatal
      { payload: { registration: legacyPayload(ev("no-registration-id"), U).registration }, recordId: eventRegistrationId(ev("no-registration-id"), U), userId: U },
      { payload: legacyPayload(ev("user-mismatch"), U, { userId: V }), recordId: eventRegistrationId(ev("user-mismatch"), U), userId: U },
      { payload: legacyPayload(ev("event-id-number"), U, { eventId: 7 }), recordId: eventRegistrationId(ev("event-id-number"), U), userId: U },
      { payload: { registration: [], registrationId: "x" }, recordId: eventRegistrationId(ev("registration-array"), U), userId: U },
      { payload: legacyPayload(ev("id-mismatch"), U, { id: "other-id" }), recordId: eventRegistrationId(ev("id-mismatch"), U), userId: U },
      { payload: [1, 2], recordId: "array-payload", userId: U },
      { payload: 5, recordId: "number-payload", userId: U },
      // deleted
      { lifecycle: "deleted", payload: legacyPayload(ev("deleted"), U), recordId: eventRegistrationId(ev("deleted"), U), userId: U },
      // non-fatal odd timestamps: infinite occurred_at is read as null
      { occurredAt: "infinity", payload: legacyPayload(ev("occurred-infinity"), U), recordId: eventRegistrationId(ev("occurred-infinity"), U), userId: U },
    ];
    for (let index = 0; index < 20; index += 1) {
      rows.push({ payload: legacyPayload(`event:legacy-outside-${index}`, U), recordId: eventRegistrationId(`event:legacy-outside-${index}`, U), userId: U });
    }
    for (const row of rows) await insertLegacy(pool, row);
    const eventIds = [
      "rsvped", "cancelled", "status-missing", "status-null", "status-pending", "status-number", "status-object", "other-user",
      "duplicate-a", "duplicate-b", "no-registration-id", "user-mismatch", "event-id-number", "registration-array", "id-mismatch",
      "deleted", "occurred-infinity", "never-registered",
    ].map(ev);

    for (const user of [U, V, "account:nobody"]) {
      const before = await oldProvider.listRegistrationsForUser(user, eventIds);
      const after = await newProvider.listRegistrationStatusesForUser(user, eventIds);
      assert.deepEqual(registeredByEvent(after, eventIds), registeredByEvent(before, eventIds), `batch for ${user}`);
      // Same records (ties in the shared ORDER BY are unordered in both reads; duplicates are ordered above).
      assert.deepEqual(after.map((row) => row.eventId).sort(), before.map((row) => row.eventId).sort(), `same rows for ${user}`);
      for (const eventId of eventIds) {
        const full = await oldProvider.getRegistration(eventId, user);
        const light = await newProvider.getRegistrationStatus(eventId, user);
        assert.equal(light === null, full === null, `single presence ${eventId} ${user}`);
        assert.equal(light?.status === "rsvped", full?.status === "rsvped", `single rsvped ${eventId} ${user}`);
      }
    }
    const expected = registeredByEvent(await newProvider.listRegistrationStatusesForUser(U, eventIds), eventIds);
    assert.equal(expected[ev("rsvped")], true);
    assert.equal(expected[ev("duplicate-a")], true);
    assert.equal(expected[ev("duplicate-b")], false);
    // The batch read never compared registration.id with registrationId; the single read does.
    assert.equal(expected[ev("id-mismatch")], true);
    assert.equal(await newProvider.getRegistrationStatus(ev("id-mismatch"), U), null);
    assert.equal(Object.values(expected).filter(Boolean).length, 4, "rsvped, duplicate-a, id-mismatch, occurred-infinity");
  });
});

test("SC-01 PG legacy projection: failure semantics match the full read (unreadable rows reject both, in or out of the page)", pgSkip, async () => {
  await withSchema(async ({ pool }) => {
    await pool.query(ORBIT_RECORDS_SCHEMA_SQL);
    const client = sqlClient(pool);
    const oldProvider = createEventRegistrationLiveRecordProvider({ store: createPostgresLiveRecordStore({ client }), workspaceId: WORKSPACE });
    const newProvider = createEventRegistrationLiveRecordProvider({
      statusSql: { client, read: createGatedDedupedCustomRead(createInflightReadDeduper(), null) },
      store: createPostgresLiveRecordStore({ client }),
      workspaceId: WORKSPACE,
    });
    const page = "event:legacy-page";
    const outside = "event:legacy-outside";
    // `rejects` is the full read's verdict; boundary values depend on the session time zone and are parity-only here
    // (covered per time zone below).
    const cases: Array<{ name: string; row: (user: string) => LegacyRow; rejects?: boolean }> = [
      { name: "created_at infinity", rejects: true, row: (u) => ({ createdAt: "infinity", payload: legacyPayload(page, u), recordId: eventRegistrationId(page, u), userId: u }) },
      { name: "updated_at -infinity", rejects: true, row: (u) => ({ payload: legacyPayload(page, u), recordId: eventRegistrationId(page, u), updatedAt: "-infinity", userId: u }) },
      { name: "updated_at beyond JS range", rejects: true, row: (u) => ({ payload: legacyPayload(page, u), recordId: eventRegistrationId(page, u), updatedAt: "275761-01-01T00:00:00Z", userId: u }) },
      { name: "occurred_at beyond JS range", rejects: true, row: (u) => ({ occurredAt: "275761-01-01T00:00:00Z", payload: legacyPayload(page, u), recordId: eventRegistrationId(page, u), userId: u }) },
      { name: "deleted_at beyond JS range", rejects: true, row: (u) => ({ deletedAt: "275761-01-01T00:00:00Z", payload: legacyPayload(page, u), recordId: eventRegistrationId(page, u), userId: u }) },
      { name: "occurred_at -infinity", rejects: false, row: (u) => ({ occurredAt: "-infinity", payload: legacyPayload(page, u), recordId: eventRegistrationId(page, u), userId: u }) },
      { name: "deleted_at infinity", rejects: false, row: (u) => ({ deletedAt: "infinity", payload: legacyPayload(page, u), recordId: eventRegistrationId(page, u), userId: u }) },
      { name: "updated_at at the JS maximum", row: (u) => ({ payload: legacyPayload(page, u), recordId: eventRegistrationId(page, u), updatedAt: "275760-09-13T00:00:00Z", userId: u }) },
      { name: "out-of-page row with infinite created_at", rejects: true, row: (u) => ({ createdAt: "infinity", payload: legacyPayload(outside, u), recordId: eventRegistrationId(outside, u), userId: u }) },
      { name: "json null payload", rejects: true, row: (u) => ({ payload: null, recordId: eventRegistrationId(page, u), userId: u }) },
      { name: "json string payload (not JSON text)", rejects: true, row: (u) => ({ payload: "not json", recordId: eventRegistrationId(page, u), userId: u }) },
      { name: "json string payload holding null", rejects: true, row: (u) => ({ payload: "null", recordId: eventRegistrationId(page, u), userId: u }) },
      { name: "json string payload holding a registration", rejects: false, row: (u) => ({ payload: JSON.stringify(legacyPayload(page, u)), recordId: eventRegistrationId(page, u), userId: u }) },
      { name: "json string payload holding an object without registration", rejects: false, row: (u) => ({ payload: "{}", recordId: eventRegistrationId(page, u), userId: u }) },
      { name: "deleted row with infinite created_at", rejects: false, row: (u) => ({ createdAt: "infinity", lifecycle: "deleted", payload: legacyPayload(page, u), recordId: eventRegistrationId(page, u), userId: u }) },
    ];
    for (const [index, entry] of cases.entries()) {
      const user = `account:case-${index}`;
      await insertLegacy(pool, entry.row(user));
      // a healthy in-page registration next to the damaged one
      await insertLegacy(pool, { payload: legacyPayload("event:legacy-healthy", user), recordId: eventRegistrationId("event:legacy-healthy", user), userId: user });
      const eventIds = [page, "event:legacy-healthy"];
      const before = await settle(() => oldProvider.listRegistrationsForUser(user, eventIds));
      const after = await settle(() => newProvider.listRegistrationStatusesForUser(user, eventIds));
      if (entry.rejects !== undefined) assert.equal(before.ok, !entry.rejects, `old batch baseline for ${entry.name}`);
      assert.equal(after.ok, before.ok, `batch reject parity for ${entry.name}`);
      if (before.ok && after.ok) assert.deepEqual(registeredByEvent(after.value, eventIds), registeredByEvent(before.value, eventIds), entry.name);
      for (const eventId of [page, outside, "event:legacy-healthy"]) {
        const full = await settle(() => oldProvider.getRegistration(eventId, user));
        const light = await settle(() => newProvider.getRegistrationStatus(eventId, user));
        assert.equal(light.ok, full.ok, `single reject parity for ${entry.name} / ${eventId}`);
        if (full.ok && light.ok) {
          assert.equal(light.value === null, full.value === null, `single presence ${entry.name} / ${eventId}`);
          assert.equal(light.value?.status === "rsvped", full.value?.status === "rsvped", `single rsvped ${entry.name} / ${eventId}`);
        }
      }
    }
  });
});

async function canonicalFixture(pool: Pool) {
  const client = createEventOperationsPostgresClient({ connectionString: databaseUrl!, pool });
  await runEventOperationsMigrations(client);
  const repository = createPostgresEventOperationsRepository({ client, workspaceId: WORKSPACE });
  const base = (await pool.query<{ now: Date }>("select statement_timestamp() as now")).rows[0]!.now.getTime();
  const at = (minutes: number) => new Date(base + minutes * 60_000).toISOString();
  const answers = { industry: "SaaS", lookingFor: "partners", valueOffered: "localisation" };
  async function createEvent(eventId: string) {
    const d = 60 * 24 * 7;
    await repository.saveConfiguration({
      checkInOpensAt: at(d - 5), eventEndsAt: at(d + 180), eventId, eventStartsAt: at(d + 30), maxAttemptsPerTask: 3,
      organizerActorId: "organizer-1", profileEditDeadlineAt: at(d + 10), recommendationCount: 4, registrationCutoffAt: at(d + 20),
      resultsAvailableAt: at(d + 25), roundOneStartsAt: at(d + 45), roundTwoStartsAt: at(d + 90), shardSize: 6, tableSize: 6, updatedAt: at(0),
    });
    await repository.activateCanonicalRegistrations(eventId, []);
    await pool.query("update event_ops_events set lifecycle_state_v2 = 'published' where workspace_id = $1 and event_id = $2", [WORKSPACE, eventId]);
  }
  async function register(eventId: string, userId: string, status: "rsvped" | "cancelled" = "rsvped") {
    await repository.registerCanonicalParticipant({
      answers, displayName: "Owner Example", eventId, interviewResponses: [...legacyResponsesFromAnswers(answers, at(-1))], userId,
    });
    if (status === "cancelled") await repository.cancelCanonicalRegistration({ eventId, userId });
  }
  return { client, createEvent, register, repository };
}

test("SC-01 PG canonical: status reads equal the full reads (rsvped, cancelled, other user, out of page)", pgSkip, async () => {
  await withSchema(async ({ pool }) => {
    const { createEvent, register, repository } = await canonicalFixture(pool);
    const events = ["event:c-rsvped", "event:c-cancelled", "event:c-other", "event:c-outside", "event:c-none"];
    for (const eventId of events) await createEvent(eventId);
    await register("event:c-rsvped", "actor:u");
    await register("event:c-cancelled", "actor:u", "cancelled");
    await register("event:c-other", "actor:v");
    await register("event:c-outside", "actor:u");
    const page = events.filter((eventId) => eventId !== "event:c-outside");
    for (const user of ["actor:u", "actor:v", "actor:nobody"]) {
      const before = await repository.listCanonicalRegistrationsForUser(user, page);
      const after = await repository.listCanonicalRegistrationStatusesForUser(user, page);
      assert.deepEqual(registeredByEvent(after, page), registeredByEvent(before, page), user);
      assert.deepEqual(after.map((row) => row.eventId), before.map((row) => row.eventId));
      for (const eventId of events) {
        const full = await repository.getCanonicalRegistration(eventId, user);
        const light = await repository.getCanonicalRegistrationStatus(eventId, user);
        assert.deepEqual(light, full ? { eventId: full.eventId, status: full.status } : null, `${eventId} ${user}`);
      }
    }
    assert.deepEqual(registeredByEvent(await repository.listCanonicalRegistrationStatusesForUser("actor:u", page), page), {
      "event:c-cancelled": false, "event:c-none": false, "event:c-other": false, "event:c-rsvped": true,
    });
  });
});

test("SC-01 PG canonical: damaged rows reject exactly where the full read rejects (W28-4 A)", pgSkip, async () => {
  await withSchema(async ({ pool }) => {
    const { createEvent, register, repository } = await canonicalFixture(pool);
    const where = "workspace_id = $1 and event_id = $2 and actor_id = $3";
    const versionWhere = `${where} and membership_version = (select membership_version from event_ops_membership_heads where ${where})`;
    const profileWhere = "workspace_id = $1 and event_id = $2 and (participant_id, profile_version) = (select participant_id, profile_version from event_ops_membership_heads where workspace_id = $1 and event_id = $2 and actor_id = $3)";
    const cases: Array<{ name: string; rejects?: boolean; sql: string[] }> = [
      { name: "profile_payload without registrationProfile", rejects: true, sql: [`update event_ops_profile_versions set profile_payload = profile_payload - 'registrationProfile' where ${profileWhere}`] },
      { name: "registrationProfile null", rejects: false, sql: [`update event_ops_profile_versions set profile_payload = jsonb_set(profile_payload, '{registrationProfile}', 'null') where ${profileWhere}`] },
      { name: "registrationProfile string", rejects: false, sql: [`update event_ops_profile_versions set profile_payload = jsonb_set(profile_payload, '{registrationProfile}', '"text"') where ${profileWhere}`] },
      { name: "registrationProfile array", rejects: false, sql: [`update event_ops_profile_versions set profile_payload = jsonb_set(profile_payload, '{registrationProfile}', '[1]') where ${profileWhere}`] },
      { name: "source_registration_id empty", rejects: true, sql: [`update event_ops_membership_versions set source_registration_id = '' where ${versionWhere}`] },
      {
        name: "participant_id empty", rejects: true, sql: [
          `update event_ops_profile_versions set participant_id = '' where ${profileWhere}`,
          `update event_ops_membership_heads set participant_id = '' where ${where}`,
        ],
      },
      { name: "registered_at infinity", rejects: true, sql: [`update event_ops_membership_versions set registered_at = 'infinity' where ${versionWhere}`] },
      { name: "registered_at -infinity", rejects: true, sql: [`update event_ops_membership_versions set registered_at = '-infinity' where ${versionWhere}`] },
      { name: "registered_at beyond JS range", rejects: true, sql: [`update event_ops_membership_versions set registered_at = '275761-01-01T00:00:00Z' where ${versionWhere}`] },
      { name: "head updated_at infinity", rejects: true, sql: [`update event_ops_membership_heads set updated_at = 'infinity' where ${where}`] },
      { name: "head updated_at -infinity", rejects: true, sql: [`update event_ops_membership_heads set updated_at = '-infinity' where ${where}`] },
      { name: "cancelled_at infinity", rejects: true, sql: [`update event_ops_membership_versions set cancelled_at = 'infinity' where ${versionWhere}`] },
      { name: "cancelled_at -infinity", rejects: true, sql: [`update event_ops_membership_versions set cancelled_at = '-infinity' where ${versionWhere}`] },
      { name: "reactivated_at infinity", rejects: true, sql: [`update event_ops_membership_versions set reactivated_at = 'infinity' where ${versionWhere}`] },
      { name: "reactivated_at -infinity", rejects: true, sql: [`update event_ops_membership_versions set reactivated_at = '-infinity' where ${versionWhere}`] },
      { name: "reactivated_at beyond JS range", rejects: true, sql: [`update event_ops_membership_versions set reactivated_at = '275761-01-01T00:00:00Z' where ${versionWhere}`] },
      { name: "registered_at at the JS maximum", sql: [`update event_ops_membership_versions set registered_at = '275760-09-13T00:00:00Z' where ${versionWhere}`] },
    ];
    const healthy = "event:c-healthy";
    await createEvent(healthy);
    let index = 0;
    for (const entry of cases) {
      for (const status of ["rsvped", "cancelled"] as const) {
        const actor = `actor:case-${index}`;
        const damaged = `event:c-damaged-${index++}`;
        await createEvent(damaged);
        await register(damaged, actor, status);
        await register(healthy, actor);
        await asReplica(pool, async (client) => {
          for (const text of entry.sql) {
            const result = await client.query(text, [WORKSPACE, damaged, actor]);
            assert.equal(result.rowCount, 1, `${entry.name}: ${text}`);
          }
        });
        const label = `${entry.name} (${status})`;
        const before = await settle(() => repository.listCanonicalRegistrationsForUser(actor, [damaged, healthy]));
        const after = await settle(() => repository.listCanonicalRegistrationStatusesForUser(actor, [damaged, healthy]));
        if (entry.rejects !== undefined) assert.equal(before.ok, !entry.rejects, `old batch baseline: ${label}`);
        assert.equal(after.ok, before.ok, `batch reject parity: ${label}`);
        if (before.ok && after.ok) assert.deepEqual(registeredByEvent(after.value, [damaged, healthy]), registeredByEvent(before.value, [damaged, healthy]), label);
        for (const eventId of [damaged, healthy]) {
          const full = await settle(() => repository.getCanonicalRegistration(eventId, actor));
          const light = await settle(() => repository.getCanonicalRegistrationStatus(eventId, actor));
          assert.equal(light.ok, full.ok, `single reject parity: ${label} / ${eventId}`);
          if (full.ok && light.ok) assert.deepEqual(light.value, full.value ? { eventId: full.value.eventId, status: full.value.status } : null, `${label} / ${eventId}`);
        }
      }
    }
  });
});

test("SC-01 PG runtime: the new runtime reads equal listRuntimeEventRegistrationsForUser / eventRegistrationRuntimeService.get and return only lightweight columns", pgSkip, async () => {
  await withSchema(async ({ pool, schema }) => {
    const { createEvent, register } = await canonicalFixture(pool);
    await pool.query(ORBIT_RECORDS_SCHEMA_SQL);
    const canonicalEvents = ["event:r-canonical-rsvped", "event:r-canonical-cancelled", "event:r-canonical-none", "event:r-shadowed"];
    for (const eventId of canonicalEvents) await createEvent(eventId);
    await register("event:r-canonical-rsvped", "actor:u");
    await register("event:r-canonical-cancelled", "actor:u", "cancelled");
    const legacyRows: LegacyRow[] = [
      { payload: legacyPayload("event:r-legacy-rsvped", "actor:u"), recordId: eventRegistrationId("event:r-legacy-rsvped", "actor:u"), userId: "actor:u" },
      { payload: legacyPayload("event:r-legacy-cancelled", "actor:u", { status: "cancelled" }), recordId: eventRegistrationId("event:r-legacy-cancelled", "actor:u"), userId: "actor:u" },
      { payload: legacyPayload("event:r-legacy-pending", "actor:u", { status: "pending" }), recordId: eventRegistrationId("event:r-legacy-pending", "actor:u"), userId: "actor:u" },
      // A legacy projection row for an enrolled (canonical) event must be ignored by both reads.
      { payload: legacyPayload("event:r-shadowed", "actor:u"), recordId: eventRegistrationId("event:r-shadowed", "actor:u"), userId: "actor:u" },
    ];
    for (let index = 0; index < 20; index += 1) {
      legacyRows.push({ payload: legacyPayload(`event:r-outside-${index}`, "actor:u"), recordId: eventRegistrationId(`event:r-outside-${index}`, "actor:u"), userId: "actor:u" });
    }
    for (const row of legacyRows) await insertLegacy(pool, row);
    const eventIds = [...canonicalEvents, "event:r-legacy-rsvped", "event:r-legacy-cancelled", "event:r-legacy-pending", "event:r-legacy-none"];

    const runtimeUrl = new URL(databaseUrl!);
    runtimeUrl.searchParams.set("options", `-c search_path=${schema}`);
    const runtimeModule = new URL("../../features/events/registration/runtime.ts", import.meta.url).href;
    const env: Record<string, string | undefined> = { ...process.env, ORBIT_EVENT_DATABASE_URL: runtimeUrl.href, ORBIT_FEATURE_MODE: "live", ORBIT_MODULE_MODE: "live", ORBIT_WORKSPACE_ID: WORKSPACE };
    for (const key of Object.keys(env)) {
      if (/^ORBIT_(DATABASE_TARGET|LOCAL_|LIVE_DATABASE_URL|DATABASE_URL|READ_BUDGET_)/u.test(key)) delete env[key];
    }
    const script = `
      import { createRequire } from "node:module";
      const requireRepo = createRequire(${JSON.stringify(join(root, "package.json"))});
      const { Client } = requireRepo("pg");
      const log = { active: false, columns: [] };
      const original = Client.prototype.query;
      const capture = (result) => { if (log.active && result) for (const entry of [result].flat()) log.columns.push((entry.fields ?? []).map((field) => field.name)); };
      Client.prototype.query = function (...args) {
        const last = args[args.length - 1];
        if (typeof last === "function") {
          args[args.length - 1] = (error, result) => { if (!error) capture(result); last(error, result); };
          return original.apply(this, args);
        }
        const returned = original.apply(this, args);
        if (returned && typeof returned.then === "function") return returned.then((result) => { capture(result); return result; });
        return returned;
      };
      const module = await import(${JSON.stringify(runtimeModule)});
      const runtime = module.default ?? module;
      const eventIds = ${JSON.stringify(eventIds)};
      const out = {};
      for (const user of ["actor:u", "actor:nobody"]) {
        const full = await runtime.listRuntimeEventRegistrationsForUser({ eventIds, userId: user });
        log.active = true;
        const light = await runtime.listRuntimeEventRegistrationStatusesForUser({ eventIds, userId: user });
        log.active = false;
        const states = await runtime.readRuntimeEventRegistrationStates({ eventIds, userId: user });
        const single = {};
        for (const eventId of eventIds) {
          const fullOne = await runtime.eventRegistrationRuntimeService.get({ eventId, userId: user });
          log.active = true;
          const lightOne = await runtime.readRuntimeEventRegistrationStatus({ eventId, userId: user });
          log.active = false;
          single[eventId] = { full: fullOne === null ? null : fullOne.status, light: lightOne === null ? null : lightOne.status };
        }
        out[user] = {
          full: full.map((row) => ({ eventId: row.eventId, status: row.status })),
          light,
          registered: Object.fromEntries(Object.entries(states).map(([eventId, state]) => [eventId, state.registered])),
          single,
        };
      }
      out.columns = log.columns;
      console.log(JSON.stringify(out));
      process.exit(0);
    `;
    const run = spawnSync(process.execPath, ["--import", "tsx", "--input-type=module", "-e", script], { encoding: "utf8", env: env as NodeJS.ProcessEnv, timeout: 60_000 });
    assert.equal(run.status, 0, run.stderr);
    const out = JSON.parse(run.stdout.trim().split("\n").at(-1)!) as Record<string, unknown> & { columns: string[][] };
    for (const user of ["actor:u", "actor:nobody"]) {
      const result = out[user] as {
        full: { eventId: string; status: string }[];
        light: { eventId: string; status: string | null }[];
        registered: Record<string, boolean>;
        single: Record<string, { full: string | null; light: string | null }>;
      };
      assert.deepEqual(registeredByEvent(result.light, eventIds), registeredByEvent(result.full, eventIds), `batch ${user}`);
      assert.deepEqual(result.registered, registeredByEvent(result.full, eventIds), `page states ${user}`);
      for (const eventId of eventIds) {
        const { full, light } = result.single[eventId]!;
        assert.equal(light === null, full === null, `single presence ${eventId} ${user}`);
        assert.equal(light === "rsvped", full === "rsvped", `single rsvped ${eventId} ${user}`);
      }
    }
    const registered = (out["actor:u"] as { registered: Record<string, boolean> }).registered;
    assert.deepEqual(Object.keys(registered).filter((eventId) => registered[eventId]).sort(), ["event:r-canonical-rsvped", "event:r-legacy-rsvped"]);

    const returnedColumns = new Set(out.columns.flat());
    assert.ok(returnedColumns.has("status"), "the status reads went through PostgreSQL");
    for (const wide of ["payload", "profile_payload", "search_text", "participant_id", "source_registration_id"]) {
      assert.equal(returnedColumns.has(wide), false, `no ${wide} column is returned by the lightweight path`);
    }
  });
});

test("SC-01 PG JS-date boundary: status reads reject exactly where node-pg parsing makes the full reads reject, in any session time zone", pgSkip, async () => {
  const values = [
    "275760-09-12T09:00:00Z",
    "275760-09-12T23:59:59.999Z",
    "275760-09-13T00:00:00Z",
    "275760-09-13T00:00:00.000500Z",
    "275760-09-13T00:00:00.001Z",
    "275760-09-13T10:00:00Z",
  ];
  for (const timeZone of ["UTC", "Asia/Shanghai", "America/Los_Angeles", "Pacific/Kiritimati"]) {
    await withSchema(async ({ pool }) => {
      const { createEvent, register, repository } = await canonicalFixture(pool);
      await pool.query(ORBIT_RECORDS_SCHEMA_SQL);
      const client = sqlClient(pool);
      const oldProvider = createEventRegistrationLiveRecordProvider({ store: createPostgresLiveRecordStore({ client }), workspaceId: WORKSPACE });
      const newProvider = createEventRegistrationLiveRecordProvider({
        statusSql: { client, read: createGatedDedupedCustomRead(createInflightReadDeduper(), null) },
        store: createPostgresLiveRecordStore({ client }),
        workspaceId: WORKSPACE,
      });
      const verdicts = new Set<boolean>();
      for (const [index, value] of values.entries()) {
        for (const column of ["updatedAt", "occurredAt"] as const) {
          const user = `account:${column}-${index}`;
          const eventId = "event:legacy-boundary";
          await insertLegacy(pool, { [column]: value, payload: legacyPayload(eventId, user), recordId: eventRegistrationId(eventId, user), userId: user });
          const before = await settle(() => oldProvider.listRegistrationsForUser(user, [eventId]));
          const after = await settle(() => newProvider.listRegistrationStatusesForUser(user, [eventId]));
          assert.equal(after.ok, before.ok, `legacy ${column}=${value} in ${timeZone}`);
          const full = await settle(() => oldProvider.getRegistration(eventId, user));
          const light = await settle(() => newProvider.getRegistrationStatus(eventId, user));
          assert.equal(light.ok, full.ok, `legacy single ${column}=${value} in ${timeZone}`);
          verdicts.add(before.ok);
        }
        const actor = `actor:boundary-${index}`;
        const eventId = `event:c-boundary-${index}`;
        await createEvent(eventId);
        await register(eventId, actor);
        await asReplica(pool, async (connection) => {
          await connection.query(
            `update event_ops_membership_versions set registered_at = $4::timestamptz
             where workspace_id = $1 and event_id = $2 and actor_id = $3`,
            [WORKSPACE, eventId, actor, value],
          );
        });
        const before = await settle(() => repository.listCanonicalRegistrationsForUser(actor, [eventId]));
        const after = await settle(() => repository.listCanonicalRegistrationStatusesForUser(actor, [eventId]));
        assert.equal(after.ok, before.ok, `canonical registered_at=${value} in ${timeZone}`);
        const full = await settle(() => repository.getCanonicalRegistration(eventId, actor));
        const light = await settle(() => repository.getCanonicalRegistrationStatus(eventId, actor));
        assert.equal(light.ok, full.ok, `canonical single registered_at=${value} in ${timeZone}`);
        verdicts.add(before.ok);
      }
      assert.deepEqual([...verdicts].sort(), [false, true], `the boundary is exercised on both sides in ${timeZone}`);
    }, timeZone);
  }
});
