/**
 * W0029：报名者名单与「谁会来」匿名预览只读所需字段（`EventRegistrationRosterEntry`）。
 *
 * 旧行为探针：把 PLANNER 事实 5 的矩阵在完整 DTO 上跑一遍（用旧代码的逐字副本与现行聚合函数），
 *   固化每一格的期望（reject／具体值）。
 * SC-01 名单等价：本机 PG 造 canonical 数据，旧读取（`listCanonicalRegistrations` + 旧映射）与新
 *   `readRegisteredCatalogueAttendees` 逐格对照，含解析时抛错、消费时抛错、已取消行不访问画像；SQL 形状。
 * SC-02 预览等价：legacy 与 canonical 两路，旧完整 DTO 与新投影分别交给聚合函数，结果深相等；聚合
 *   情况（大小写合并与展示 label、并列、超过 6 桶、positioning 回退、cancelled）；失败矩阵；legacy
 *   行序列与旧读取相同。
 * SC-03 门槛、闸门与失败：名单只在本人已报名时读、读取失败向上抛；legacy 投影先过闸门、并发去重、
 *   失败不缓存；canonical 不加闸门；runtime 选路；预览 handler 默认走投影。
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
import { registrationClusterPreview } from "../../features/events/registration/cluster-preview";
import type { EventRegistration } from "../../features/events/registration/contract";
import { legacyResponsesFromAnswers } from "../../features/events/registration/interview-response-contract";
import {
  createMemoryEventRegistrationProvider,
  eventRegistrationId,
} from "../../features/events/registration/service";
import { createEventRegistrationLiveRecordProvider } from "../../features/events/registration/storage/live-record-provider";
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
const WORKSPACE = "workspace:w0029-roster";

type Fields = "attendees" | "preview";
// Loaded lazily so each test fails on its own before the projection module exists (RED).
function projection() {
  return require(join(root, "features/events/registration/roster-entry.ts")) as {
    rosterEntryFromRegistration: (registration: { participantProfile?: unknown; status?: unknown }, fields: Fields) => unknown;
  };
}
// The new methods, typed loosely so this file compiles before and after they exist.
type RosterList = (eventId: string, fields: Fields) => Promise<readonly unknown[]>;
function canonicalRoster(repository: object): RosterList {
  return (repository as { listCanonicalRosterEntries: RosterList }).listCanonicalRosterEntries.bind(repository);
}
function legacyRoster(provider: object): RosterList {
  return (provider as { listRegistrationRosterEntries: RosterList }).listRegistrationRosterEntries.bind(provider);
}

// ---------------------------------------------------------------------------
// Old code, verbatim (6e0663ca): the oracle every new read is compared with.
// ---------------------------------------------------------------------------

/* eslint-disable @typescript-eslint/no-explicit-any */
/** registered-catalogue-attendees.ts lines 42–51 at 6e0663ca. */
function oldAttendees(registrations: readonly any[]) {
  return registrations
    .filter((item) => item.status === "rsvped")
    .map((attendee) => ({
      displayName:
        attendee.participantProfile.displayName?.trim() || "Orbit attendee",
      organization: null,
      role: attendee.participantProfile.answers.positioning?.trim() || null,
    }));
}

/** cluster-preview.ts lines 28–61 at 6e0663ca. */
function oldClusterPreview(registrations: readonly any[]) {
  const active = registrations.filter(
    (registration) => registration.status === "rsvped",
  );
  const counts = new Map<string, { count: number; label: string }>();
  for (const registration of active) {
    const answers = registration.participantProfile.answers;
    const industry =
      answers.industry?.trim() ||
      answers.positioning?.split("@")[0]?.trim() ||
      "";
    if (!industry) continue;
    const key = industry.toLocaleLowerCase("en-US");
    const current = counts.get(key);
    if (current) current.count += 1;
    else counts.set(key, { count: 1, label: industry });
  }
  const buckets = [...counts.values()]
    .filter((bucket) => bucket.count >= 5)
    .sort((left, right) => right.count - left.count)
    .slice(0, 6)
    .map((bucket) => ({
      count: Math.floor(bucket.count / 5) * 5,
      label: bucket.label,
    }));
  return { buckets, total: active.length };
}
/* eslint-enable @typescript-eslint/no-explicit-any */

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

type Settled<T> = { ok: true; value: T } | { ok: false };
async function settle<T>(read: () => Promise<T> | T): Promise<Settled<T>> {
  try {
    return { ok: true, value: await read() };
  } catch {
    return { ok: false };
  }
}

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
          throw new Error("roster sql failed");
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

function projectionProvider(client: ReturnType<typeof countingClient>["client"], gate: ReadBudgetGate | null) {
  return createEventRegistrationLiveRecordProvider({
    statusSql: { client, read: createGatedDedupedCustomRead(createInflightReadDeduper(), gate) },
    store: createMemoryLiveRecordStore<Record<string, unknown>>(),
    workspaceId: WORKSPACE,
  });
}

/** Column list between the outer `select` and its first top-level `from`. */
function selectedColumns(text: string): string {
  const match = /select([\s\S]*?)\bfrom\s+(orbit_records|event_ops_membership_heads)\b/iu.exec(text);
  assert.ok(match, "a select statement");
  return match[1]!;
}

function assertNarrowColumns(text: string) {
  const columns = selectedColumns(text);
  assert.doesNotMatch(columns, /(^|,)\s*(\w+\.)?payload\s*(,|$)/imu, "does not return payload");
  assert.doesNotMatch(columns, /(^|,)\s*(\w+\.)?profile_payload\s+as\b|(^|,)\s*(\w+\.)?profile_payload\s*(,|$)/imu, "does not return profile_payload");
  assert.doesNotMatch(columns, /search_text|source_registration_id\s*(,|$)|participant_id\s*(,|$)|\*/iu, "no wide or identifying columns");
  // Type fidelity: profile leaves are never read as text (`#>>` / `->>` turn 7 into "7").
  assert.doesNotMatch(columns, /->>\s*'(displayName|industry|positioning|answers)'/u);
  assert.doesNotMatch(columns, /#>>\s*'\{[^}]*(participantProfile|displayName|industry|positioning|answers)/u);
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

function fullRegistration(input: { eventId?: string; id: string; profile?: unknown; status?: unknown }): EventRegistration {
  const eventId = input.eventId ?? "event:probe";
  const registration: Record<string, unknown> = {
    cancelledAt: null, eventId, id: eventRegistrationId(eventId, input.id),
    participantProfileId: `profile:${input.id}`, reactivatedAt: null, registeredAt: "2026-01-01T00:00:00.000Z",
    sideEffects: { calendarUpdateExecuted: false, emailSent: false, globalProfileWriteExecuted: false, notificationDelivered: false, organizerMessageSent: false, refundRequested: false },
    status: "status" in input ? input.status : "rsvped", updatedAt: "2026-01-01T00:00:00.000Z", userId: input.id,
  };
  if ("profile" in input && input.profile !== MISSING) registration.participantProfile = input.profile;
  return registration as unknown as EventRegistration;
}

// ---------------------------------------------------------------------------
// Fact 5 matrix (PLANNER): one damaged row next to four healthy "Probe" rows.
// ---------------------------------------------------------------------------

const MISSING = Symbol("missing");
const HEALTHY_ANSWERS = { industry: "Probe", positioning: "Healthy @ Orbit" };
const DAMAGED_ANSWERS = { industry: "Probe", positioning: "Probe @ Orbit" };
type RosterVerdict = "reject" | { displayName: string; role: string | null };
type PreviewVerdict = "reject" | "counted" | "not-counted";
interface Cell { name: string; preview: PreviewVerdict; profile: unknown; roster: RosterVerdict }

const profileWith = (overrides: Record<string, unknown>, answers: unknown = DAMAGED_ANSWERS) => {
  const profile: Record<string, unknown> = { displayName: "Damaged", ...overrides };
  if (answers !== MISSING) profile.answers = answers;
  for (const [key, value] of Object.entries(overrides)) if (value === MISSING) delete profile[key];
  return profile;
};
const answersWith = (overrides: Record<string, unknown>) => {
  const answers: Record<string, unknown> = { ...DAMAGED_ANSWERS, ...overrides };
  for (const [key, value] of Object.entries(overrides)) if (value === MISSING) delete answers[key];
  return profileWith({}, answers);
};
const damaged = (role: string | null = "Probe @ Orbit", displayName = "Damaged") => ({ displayName, role });

const CELLS: Cell[] = [
  { name: "profile missing", preview: "reject", profile: MISSING, roster: "reject" },
  { name: "profile null", preview: "reject", profile: null, roster: "reject" },
  { name: "profile string", preview: "reject", profile: "text", roster: "reject" },
  { name: "profile number", preview: "reject", profile: 5, roster: "reject" },
  { name: "profile boolean", preview: "reject", profile: true, roster: "reject" },
  { name: "profile array", preview: "reject", profile: [1], roster: "reject" },
  { name: "healthy", preview: "counted", profile: profileWith({}), roster: damaged() },
  { name: "displayName missing", preview: "counted", profile: profileWith({ displayName: MISSING }), roster: damaged(undefined, "Orbit attendee") },
  { name: "displayName null", preview: "counted", profile: profileWith({ displayName: null }), roster: damaged(undefined, "Orbit attendee") },
  { name: "displayName empty", preview: "counted", profile: profileWith({ displayName: "" }), roster: damaged(undefined, "Orbit attendee") },
  { name: "displayName blank", preview: "counted", profile: profileWith({ displayName: " 　\t" }), roster: damaged(undefined, "Orbit attendee") },
  { name: "displayName padded", preview: "counted", profile: profileWith({ displayName: "  Aiko \n" }), roster: damaged(undefined, "Aiko") },
  { name: "displayName number", preview: "counted", profile: profileWith({ displayName: 7 }), roster: "reject" },
  { name: "displayName zero", preview: "counted", profile: profileWith({ displayName: 0 }), roster: "reject" },
  { name: "displayName boolean", preview: "counted", profile: profileWith({ displayName: false }), roster: "reject" },
  { name: "displayName object", preview: "counted", profile: profileWith({ displayName: {} }), roster: "reject" },
  { name: "displayName array", preview: "counted", profile: profileWith({ displayName: [] }), roster: "reject" },
  { name: "answers missing", preview: "reject", profile: profileWith({}, MISSING), roster: "reject" },
  { name: "answers null", preview: "reject", profile: profileWith({}, null), roster: "reject" },
  { name: "answers string", preview: "not-counted", profile: profileWith({}, "text"), roster: damaged(null) },
  { name: "answers number", preview: "not-counted", profile: profileWith({}, 5), roster: damaged(null) },
  { name: "answers boolean", preview: "not-counted", profile: profileWith({}, true), roster: damaged(null) },
  { name: "answers array", preview: "not-counted", profile: profileWith({}, ["Probe"]), roster: damaged(null) },
  { name: "industry missing (falls back to positioning)", preview: "counted", profile: answersWith({ industry: MISSING }), roster: damaged() },
  { name: "industry null", preview: "counted", profile: answersWith({ industry: null }), roster: damaged() },
  { name: "industry empty", preview: "counted", profile: answersWith({ industry: "" }), roster: damaged() },
  { name: "industry JS whitespace only", preview: "counted", profile: answersWith({ industry: " 　 ﻿ \n" }), roster: damaged() },
  { name: "industry zero-width space (not JS whitespace)", preview: "not-counted", profile: answersWith({ industry: "​" }), roster: damaged() },
  { name: "industry other case, padded", preview: "counted", profile: answersWith({ industry: "  PROBE " }), roster: damaged() },
  { name: "industry number", preview: "reject", profile: answersWith({ industry: 7 }), roster: damaged() },
  { name: "industry boolean", preview: "reject", profile: answersWith({ industry: false }), roster: damaged() },
  { name: "industry object", preview: "reject", profile: answersWith({ industry: {} }), roster: damaged() },
  { name: "industry array", preview: "reject", profile: answersWith({ industry: ["Probe"] }), roster: damaged() },
  { name: "positioning number, industry present", preview: "counted", profile: answersWith({ positioning: 7 }), roster: "reject" },
  { name: "positioning number, industry missing", preview: "reject", profile: answersWith({ industry: MISSING, positioning: 7 }), roster: "reject" },
  { name: "positioning array, industry blank", preview: "reject", profile: answersWith({ industry: " ", positioning: ["Probe"] }), roster: "reject" },
  { name: "positioning object, industry null", preview: "reject", profile: answersWith({ industry: null, positioning: {} }), roster: "reject" },
  { name: "positioning boolean, industry present", preview: "counted", profile: answersWith({ positioning: true }), roster: "reject" },
  { name: "positioning padded, industry missing", preview: "counted", profile: answersWith({ industry: MISSING, positioning: "  Probe @ X  " }), roster: damaged("Probe @ X") },
  { name: "positioning without @, industry empty", preview: "counted", profile: answersWith({ industry: "", positioning: "probe" }), roster: damaged("probe") },
  { name: "positioning starting with @", preview: "not-counted", profile: answersWith({ industry: MISSING, positioning: "@ Probe" }), roster: damaged("@ Probe") },
  { name: "positioning blank", preview: "not-counted", profile: answersWith({ industry: MISSING, positioning: "  " }), roster: damaged(null) },
  { name: "positioning and industry missing", preview: "not-counted", profile: answersWith({ industry: MISSING, positioning: MISSING }), roster: damaged(null) },
  { name: "positioning null, industry null", preview: "not-counted", profile: answersWith({ industry: null, positioning: null }), roster: damaged(null) },
];

const HEALTHY_ATTENDEES = [0, 1, 2, 3].map((index) => ({ displayName: `Healthy ${index}`, organization: null, role: "Healthy @ Orbit" }));
function expectedPreview(verdict: PreviewVerdict, status: "rsvped" | "cancelled") {
  if (status === "cancelled") return { buckets: [], total: 4 };
  if (verdict === "reject") return "reject" as const;
  return { buckets: verdict === "counted" ? [{ count: 5, label: "Probe" }] : [], total: 5 };
}
function healthyFull(eventId: string) {
  return [0, 1, 2, 3].map((index) => fullRegistration({
    eventId, id: `healthy-${index}`, profile: { answers: { ...HEALTHY_ANSWERS }, displayName: `Healthy ${index}` },
  }));
}

// ---------------------------------------------------------------------------
// 旧行为探针
// ---------------------------------------------------------------------------

test("旧行为探针: fact 5 matrix on full DTOs (old roster mapping, current cluster preview == old)", async () => {
  for (const cell of CELLS) {
    for (const status of ["rsvped", "cancelled"] as const) {
      const rows = [...healthyFull("event:probe"), fullRegistration({ id: "damaged", profile: cell.profile, status })];
      const roster = await settle(() => oldAttendees(rows));
      const preview = await settle(() => oldClusterPreview(rows));
      const current = await settle(() => registrationClusterPreview(rows));
      const label = `${cell.name} (${status})`;
      if (status === "cancelled") {
        assert.deepEqual(roster, { ok: true, value: HEALTHY_ATTENDEES }, `roster ${label}: a cancelled row is never read`);
      } else if (cell.roster === "reject") {
        assert.equal(roster.ok, false, `roster ${label}`);
      } else {
        assert.deepEqual(roster, { ok: true, value: [...HEALTHY_ATTENDEES, { ...cell.roster, organization: null }] }, `roster ${label}`);
      }
      const expected = expectedPreview(cell.preview, status);
      assert.deepEqual(preview, expected === "reject" ? { ok: false } : { ok: true, value: expected }, `preview ${label}`);
      assert.deepEqual(current, preview, `current cluster preview equals the old one: ${label}`);
    }
  }
  // Other statuses are not counted (legacy keeps any stored status).
  for (const status of ["cancelled", "pending", null, undefined, 1, { value: "rsvped" }, "RSVPED"]) {
    const rows = [fullRegistration({ id: "x", profile: null, status })];
    assert.deepEqual(oldClusterPreview(rows), { buckets: [], total: 0 });
    assert.deepEqual(oldAttendees(rows), []);
  }
});

// ---------------------------------------------------------------------------
// Projection in JS (memory implementations, JSON-string legacy payloads)
// ---------------------------------------------------------------------------

test("SC-01/SC-02 JS projection: every fact-5 cell behaves like the full DTO in both consumers", async () => {
  const { rosterEntryFromRegistration } = projection();
  for (const cell of CELLS) {
    for (const status of ["rsvped", "cancelled", "pending", 1, null] as const) {
      const rows = [...healthyFull("event:probe"), fullRegistration({ id: "damaged", profile: cell.profile, status })];
      const label = `${cell.name} (${String(status)})`;
      assert.deepEqual(
        await settle(() => oldAttendees(rows.map((row) => rosterEntryFromRegistration(row, "attendees")))),
        await settle(() => oldAttendees(rows)),
        `roster ${label}`,
      );
      assert.deepEqual(
        await settle(() => registrationClusterPreview(rows.map((row) => rosterEntryFromRegistration(row, "preview")) as never)),
        await settle(() => oldClusterPreview(rows)),
        `preview ${label}`,
      );
    }
  }
  // Only the needed leaves survive; non-rsvped rows carry no profile at all.
  const full = fullRegistration({ id: "a", profile: { answers: { industry: "SaaS", lookingFor: "x", positioning: "CTO @ A", valueOffered: "y" }, createdAt: "t", displayName: "Aiko", eventId: "e", id: "p", userId: "u" } });
  assert.deepEqual(rosterEntryFromRegistration(full, "attendees"), { participantProfile: { answers: { positioning: "CTO @ A" }, displayName: "Aiko" }, status: "rsvped" });
  assert.deepEqual(rosterEntryFromRegistration(full, "preview"), { participantProfile: { answers: { industry: "SaaS", positioning: null } }, status: "rsvped" });
  assert.deepEqual(rosterEntryFromRegistration({ ...full, status: "cancelled" }, "preview"), { participantProfile: null, status: "cancelled" });
});

test("SC-01/SC-02 memory implementations map their full reads through the same projection", async () => {
  const { rosterEntryFromRegistration } = projection();
  const seed = [
    fullRegistration({ eventId: "event:a", id: "u", profile: { answers: { industry: "SaaS", positioning: "CTO @ A" }, displayName: "U" } }),
    fullRegistration({ eventId: "event:a", id: "v", profile: { answers: {}, displayName: "V" }, status: "cancelled" }),
    fullRegistration({ eventId: "event:b", id: "u", profile: { answers: {}, displayName: "U" } }),
  ];
  const memoryProvider = createMemoryEventRegistrationProvider(seed);
  for (const fields of ["attendees", "preview"] as const) {
    assert.deepEqual(
      await legacyRoster(memoryProvider)("event:a", fields),
      (await memoryProvider.listRegistrations("event:a")).map((row) => rosterEntryFromRegistration(row, fields)),
    );
  }
  const repository = createMemoryEventOperationsRepository({ canonicalRegistrations: seed });
  for (const fields of ["attendees", "preview"] as const) {
    assert.deepEqual(
      await canonicalRoster(repository)("event:a", fields),
      (await repository.listCanonicalRegistrations("event:a")).map((row) => rosterEntryFromRegistration(row, fields)),
    );
  }
  // Without a projection SQL reader (memory store, scripts) the live-record provider maps its full read.
  const plain = createEventRegistrationLiveRecordProvider({ store: createMemoryLiveRecordStore<Record<string, unknown>>(), workspaceId: WORKSPACE });
  for (const registration of seed) await plain.saveRegistration(registration);
  assert.deepEqual(
    await legacyRoster(plain)("event:a", "preview"),
    (await plain.listRegistrations("event:a")).map((row) => rosterEntryFromRegistration(row, "preview")),
  );
});

// ---------------------------------------------------------------------------
// SC-01 / SC-02 SQL shape (no database)
// ---------------------------------------------------------------------------

test("SC-01 (d) canonical roster SQL: one statement, same joins/filter/order, narrow jsonb columns, validity over every row", async () => {
  const counting = countingClient([]);
  const methods = createPostgresCanonicalRegistrationMethods({ client: counting.client, workspaceId: "workspace:test" } as unknown as EventOperationsPostgresRuntime);
  for (const fields of ["attendees", "preview"] as const) {
    assert.deepEqual(await canonicalRoster(methods)("event:a", fields), []);
  }
  assert.equal(counting.calls.length, 2);
  for (const call of counting.calls) {
    assertNarrowColumns(call.text);
    assert.match(call.text, /join event_ops_membership_versions/u);
    assert.match(call.text, /join event_ops_profile_versions/u);
    assert.match(call.text, /where membership_head\.workspace_id = \$1\s+and membership_head\.event_id = \$2\s+order by membership_head\.participant_id\s*$/u);
    assert.match(call.text, /profile_version\.profile_payload \? 'registrationProfile'/u, "reuses REGISTRATION_ROW_VALID");
    assert.doesNotMatch(call.text, /->>/u);
    assert.deepEqual(call.values, ["workspace:test", "event:a"]);
  }
  assert.doesNotMatch(selectedColumns(counting.calls[1]!.text), /displayName/u, "the anonymous preview never reads names");
  assert.doesNotMatch(selectedColumns(counting.calls[0]!.text), /industry/u);
});

test("SC-02 (d) legacy preview SQL: one statement, the full read's WHERE and ORDER BY, narrow jsonb columns", async () => {
  const counting = countingClient([]);
  const provider = projectionProvider(counting.client, null);
  assert.deepEqual(await legacyRoster(provider)("event:a", "preview"), []);
  assert.equal(counting.calls.length, 1);
  const [call] = counting.calls;
  assertNarrowColumns(call!.text);
  for (const condition of [
    /workspace_id = \$1/u, /collection_name = 'event_registrations'/u, /lifecycle_state <> 'deleted'/u,
    /target_type = 'event'/u, /target_id = \$2/u,
  ]) assert.match(call!.text, condition);
  assert.match(call!.text, /order by coalesce\(occurred_at, updated_at\) desc, updated_at desc\s*$/u);
  assert.doesNotMatch(selectedColumns(call!.text), /displayName/u);
  assert.deepEqual(call!.values, [WORKSPACE, "event:a"]);
});

test("SC-01 canonical roster rejects when any row (rsvped or cancelled) fails the old validity rules", async () => {
  for (const status of ["rsvped", "cancelled"]) {
    const rows = [{ k: null, q: null, s: "rsvped", n: "A" }, { k: "invalid", s: status }];
    const methods = createPostgresCanonicalRegistrationMethods({ client: countingClient(rows).client, workspaceId: "w" } as unknown as EventOperationsPostgresRuntime);
    await assert.rejects(canonicalRoster(methods)("event:a", "attendees"));
  }
});

// ---------------------------------------------------------------------------
// SC-03 gate / dedupe / failure (no database)
// ---------------------------------------------------------------------------

test("SC-03 a closed read-budget gate rejects the legacy projection before any SQL", async () => {
  const counting = countingClient([]);
  const { checks, gate } = spyGate(true);
  const provider = projectionProvider(counting.client, gate);
  await assert.rejects(legacyRoster(provider)("event:a", "preview"), ReadBudgetExceededError);
  assert.equal(counting.calls.length, 0);
  assert.deepEqual(checks, ["event_registrations"]);
});

test("SC-03 concurrent identical legacy projections: gate per call, one SQL, same result; failures are not cached", async () => {
  let release!: () => void;
  const hold = new Promise<void>((resolve) => { release = resolve; });
  const rows = [{ i: "SaaS", k: null, q: null, s: "rsvped" }];
  const counting = countingClient(rows, { hold });
  const { checks, gate } = spyGate();
  const provider = projectionProvider(counting.client, gate);
  const first = legacyRoster(provider)("event:a", "preview");
  const second = legacyRoster(provider)("event:a", "preview");
  release();
  const [left, right] = await Promise.all([first, second]);
  assert.deepEqual(left, [{ participantProfile: { answers: { industry: "SaaS", positioning: null } }, status: "rsvped" }]);
  assert.deepEqual(right, left);
  assert.equal(checks.length, 2, "gate checked for each logical call");
  assert.equal(counting.calls.length, 1, "identical in-flight reads share one statement");
  await legacyRoster(provider)("event:b", "preview");
  assert.equal(counting.calls.length, 2, "another event is another read");

  const failing = countingClient(rows, { failFirst: 1 });
  const failingProvider = projectionProvider(failing.client, null);
  const results = await Promise.allSettled([legacyRoster(failingProvider)("event:a", "preview"), legacyRoster(failingProvider)("event:a", "preview")]);
  assert.deepEqual(results.map((result) => result.status), ["rejected", "rejected"]);
  assert.equal(failing.calls.length, 1);
  assert.equal((await legacyRoster(failingProvider)("event:a", "preview")).length, 1);
  assert.equal(failing.calls.length, 2, "the failed read is not cached");
});

test("SC-03 configured store: the legacy projection shares the store gate/dedupe and store writes evict it", async () => {
  let releaseRead!: () => void;
  const heldRead = new Promise<void>((resolve) => { releaseRead = resolve; });
  let reads = 0;
  const configured = createConfiguredPostgresLiveRecordStore({
    createClient: () => ({
      close: async () => undefined,
      async query<TRow>(text: string) {
        if (/update orbit_records/iu.test(text)) return { rows: [] as TRow[] };
        reads += 1;
        await heldRead;
        return { rows: [] as TRow[] };
      },
    }),
    env: { ORBIT_DATABASE_URL: "postgresql://unused.invalid/w0029-roster-dedupe", ORBIT_WORKSPACE_ID: "workspace:w0029-dedupe" },
  })!;
  const provider = createEventRegistrationLiveRecordProvider({
    statusSql: { client: configured.client, read: configured.customRead },
    store: configured.store,
    workspaceId: configured.workspaceId,
  });
  const before = legacyRoster(provider)("event:a", "preview");
  const joined = legacyRoster(provider)("event:a", "preview");
  await Promise.resolve();
  assert.equal(reads, 1, "identical in-flight reads share one statement");
  await configured.store.deleteRecord({ collectionName: "event_registrations", deletedAt: "2026-01-01T00:00:00.000Z", recordId: "r", workspaceId: configured.workspaceId });
  const after = legacyRoster(provider)("event:a", "preview");
  await Promise.resolve();
  await Promise.resolve();
  assert.equal(reads, 2, "a read started after a store write does not reuse the older in-flight read");
  releaseRead();
  await Promise.all([before, joined, after]);
});

// ---------------------------------------------------------------------------
// SC-03 roster gate (registered-catalogue-attendees) and detail page failure
// ---------------------------------------------------------------------------

function loadAttendees(t: TestContext, input: { own: string | null; repository?: object | null; roster?: readonly unknown[] | "fails" }) {
  const calls: string[] = [];
  const modules: Record<string, unknown> = {
    [join(root, "features/events/registration/runtime.ts")]: {
      readRuntimeEventRegistrationStatus: async ({ eventId, userId }: { eventId: string; userId: string }) => {
        calls.push(`status:${eventId}:${userId}`);
        return input.own === null ? null : { eventId, status: input.own };
      },
    },
    [join(root, "features/events/event-operations/repository.ts")]: {
      createConfiguredEventOperationsRepository: () =>
        input.repository !== undefined
          ? input.repository
          : {
              listCanonicalRegistrations: async () => {
                calls.push("full-roster");
                return [];
              },
              listCanonicalRosterEntries: async (eventId: string, fields: string) => {
                calls.push(`roster:${eventId}:${fields}`);
                if (input.roster === "fails") throw new Error("roster read failed");
                return input.roster ?? [];
              },
            },
    },
  };
  const attendeesPath = join(root, "features/events/registered-catalogue-attendees.ts");
  stubModules(t, modules, [attendeesPath]);
  return {
    calls,
    read: (require(attendeesPath) as typeof import("../../features/events/registered-catalogue-attendees")).readRegisteredCatalogueAttendees,
  };
}

test("SC-03 roster: read only after the actor's own rsvped status, only the attendee projection, never the full rows", async (t) => {
  const entry = (displayName: string, status: string) => ({ participantProfile: status === "rsvped" ? { answers: { positioning: ` ${displayName} role ` }, displayName } : null, status });
  const registered = loadAttendees(t, { own: "rsvped", roster: [entry("Aiko", "rsvped"), entry("Gone", "cancelled"), entry("Ben", "rsvped")] });
  assert.deepEqual(await registered.read({ actorId: " actor:a ", eventId: " event:a " }), {
    attendees: [
      { displayName: "Aiko", organization: null, role: "Aiko role" },
      { displayName: "Ben", organization: null, role: "Ben role" },
    ],
    eventId: "event:a",
  });
  assert.deepEqual(registered.calls, ["status:event:a:actor:a", "roster:event:a:attendees"]);

  for (const own of ["cancelled", null, "pending"]) {
    const loaded = loadAttendees(t, { own });
    assert.equal(await loaded.read({ actorId: "actor:a", eventId: "event:a" }), null);
    assert.deepEqual(loaded.calls, ["status:event:a:actor:a"], `no roster read when own status is ${own}`);
  }
  const unconfigured = loadAttendees(t, { own: "rsvped", repository: null });
  assert.equal(await unconfigured.read({ actorId: "actor:a", eventId: "event:a" }), null);
});

test("SC-03 a failing roster read rejects readRegisteredCatalogueAttendees and the detail view (page shows unavailable)", async (t) => {
  const loaded = loadAttendees(t, { own: "rsvped", roster: "fails" });
  await assert.rejects(loaded.read({ actorId: "actor:a", eventId: "event:a" }), /roster read failed/u);
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
    /roster read failed/u,
  );
});

// ---------------------------------------------------------------------------
// SC-03 runtime routing and the preview handler's default read
// ---------------------------------------------------------------------------

function loadRuntime(t: TestContext, scenario: { canonical?: "ok" | "fails" | "unconfigured"; enrollment: string; legacy?: "ok" | "fails" }) {
  const fullRowCalls: string[] = [];
  const projectionCalls: string[] = [];
  const fullRow = (name: string) => async () => {
    fullRowCalls.push(name);
    return [];
  };
  const entries = (source: string) => [{ participantProfile: { answers: { industry: source } }, status: "rsvped" }];
  const modules: Record<string, unknown> = {
    [join(root, "features/events/registration/deadline-gated-service.ts")]: {
      createDeadlineGatedEventRegistrationService: () => ({ get: fullRow("runtimeService.get"), list: fullRow("runtimeService.list") }),
      resolveEventRegistrationAvailability: () => "open",
      resolveEventRegistrationWindowState: () => ({ availability: "open" }),
    },
    [join(root, "features/events/registration/service.ts")]: { createEventRegistrationService: () => ({}) },
    [join(root, "features/events/core/runtime.ts")]: { createConfiguredEventCoreService: () => null },
    [join(root, "features/events/registration/storage/event-operations-window-provider.ts")]: {
      createConfiguredEventOperationsRegistrationWindowProvider: () => ({
        getEnrollment: async (eventId: string) => {
          projectionCalls.push(`enrollment:${eventId}`);
          return { state: scenario.enrollment };
        },
      }),
    },
    [join(root, "features/events/registration/storage/live-record-provider.ts")]: {
      createConfiguredEventRegistrationProvider: () => ({
        listRegistrationRosterEntries: async (eventId: string, fields: string) => {
          projectionCalls.push(`legacy:${eventId}:${fields}`);
          if (scenario.legacy === "fails") throw new Error("legacy projection failed");
          return entries("legacy");
        },
        listRegistrations: fullRow("legacy.listRegistrations"),
      }),
    },
    [join(root, "features/events/event-operations/repository.ts")]: {
      createConfiguredEventOperationsRepository: () =>
        scenario.canonical === "unconfigured"
          ? null
          : {
              cancelCanonicalRegistration: async () => null,
              listCanonicalRegistrations: fullRow("canonical.listCanonicalRegistrations"),
              listCanonicalRosterEntries: async (eventId: string, fields: string) => {
                projectionCalls.push(`canonical:${eventId}:${fields}`);
                if (scenario.canonical === "fails") throw new Error("canonical projection failed");
                return entries("canonical");
              },
              registerCanonicalParticipant: async () => null,
            },
    },
  };
  const runtimePath = join(root, "features/events/registration/runtime.ts");
  stubModules(t, modules, [runtimePath]);
  return {
    fullRowCalls,
    projectionCalls,
    runtime: require(runtimePath) as typeof import("../../features/events/registration/runtime") & {
      listRuntimeEventRosterEntries: (input: { eventId: string; fields: Fields }) => Promise<readonly unknown[]>;
    },
  };
}

test("SC-03 runtime roster read routes like eventRegistrationRuntimeService.list, through the projections only", async (t) => {
  for (const [enrollment, source] of [["legacy_unenrolled", "legacy"], ["legacy_importing", "legacy"], ["enrolled", "canonical"], ["legacy_imported", "canonical"]] as const) {
    const loaded = loadRuntime(t, { enrollment });
    const result = await loaded.runtime.listRuntimeEventRosterEntries({ eventId: "event:a", fields: "preview" });
    assert.deepEqual(result, [{ participantProfile: { answers: { industry: source } }, status: "rsvped" }], enrollment);
    assert.deepEqual(loaded.projectionCalls, ["enrollment:event:a", `${source}:event:a:preview`]);
    assert.deepEqual(loaded.fullRowCalls, []);
  }
  const unconfigured = loadRuntime(t, { canonical: "unconfigured", enrollment: "enrolled" });
  assert.deepEqual(await unconfigured.runtime.listRuntimeEventRosterEntries({ eventId: "event:a", fields: "preview" }), [{ participantProfile: { answers: { industry: "legacy" } }, status: "rsvped" }]);
  assert.deepEqual(unconfigured.projectionCalls, ["legacy:event:a:preview"], "no enrollment read without a canonical repository (as the runtime service)");
  for (const failing of ["legacy", "canonical"] as const) {
    const loaded = loadRuntime(t, { canonical: failing === "canonical" ? "fails" : "ok", enrollment: failing === "legacy" ? "legacy_unenrolled" : "enrolled", legacy: failing === "legacy" ? "fails" : "ok" });
    await assert.rejects(loaded.runtime.listRuntimeEventRosterEntries({ eventId: "event:a", fields: "preview" }), /projection failed/u);
  }
});

test("SC-03 preview handler: the default read is the runtime preview projection; a failing read rejects as before (no cache entry)", async (t) => {
  const calls: string[] = [];
  let fail = true;
  const modules: Record<string, unknown> = {
    [join(root, "features/events/registration/runtime.ts")]: {
      eventRegistrationRuntimeService: { list: async () => { calls.push("runtimeService.list"); return []; } },
      listRuntimeEventRosterEntries: async (input: { eventId: string; fields: string }) => {
        calls.push(`roster:${input.eventId}:${input.fields}`);
        if (fail) throw new Error("preview read failed");
        return Array.from({ length: 5 }, () => ({ participantProfile: { answers: { industry: "SaaS", positioning: null } }, status: "rsvped" }));
      },
    },
  };
  const handlerPath = join(root, "app/api/events/[id]/registration/preview/handler.ts");
  stubModules(t, modules, [handlerPath]);
  const { createEventRegistrationPreviewHandler } = require(handlerPath) as typeof import("../../app/api/events/[id]/registration/preview/handler");
  const handler = createEventRegistrationPreviewHandler({ loadEvent: async () => ({ id: "event:a" }) as never, resolveAdmissionControlled: async () => false });
  const context = { params: Promise.resolve({ id: "event:a" }) };
  await assert.rejects(handler(new Request("http://localhost/api"), context), /preview read failed/u);
  fail = false;
  const response = await handler(new Request("http://localhost/api"), { params: Promise.resolve({ id: "event:a" }) });
  assert.deepEqual(await response.json(), { data: { admissionControlled: false, buckets: [{ count: 5, label: "SaaS" }], total: 5 }, success: true });
  assert.deepEqual(calls, ["roster:event:a:preview", "roster:event:a:preview"], "the failure was not cached; the full-row list is never used");
});

// ---------------------------------------------------------------------------
// PostgreSQL (orbit_test, temporary schema)
// ---------------------------------------------------------------------------

async function withSchema(run: (input: { pool: Pool; schema: string }) => Promise<void>) {
  assert.ok(databaseUrl);
  const schema = `w0029_roster_${randomUUID().replaceAll("-", "")}`;
  const admin = new Pool({ connectionString: databaseUrl, max: 1 });
  const pool = new Pool({ connectionString: databaseUrl, max: 4, options: `-c search_path=${schema}` });
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

async function canonicalFixture(pool: Pool) {
  const client = createEventOperationsPostgresClient({ connectionString: databaseUrl!, pool });
  await runEventOperationsMigrations(client);
  const repository = createPostgresEventOperationsRepository({ client, workspaceId: WORKSPACE });
  const base = (await pool.query<{ now: Date }>("select statement_timestamp() as now")).rows[0]!.now.getTime();
  const at = (minutes: number) => new Date(base + minutes * 60_000).toISOString();
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
  async function register(eventId: string, userId: string, input: { answers?: Record<string, string>; displayName?: string; status?: "rsvped" | "cancelled" } = {}) {
    const answers = input.answers ?? { ...HEALTHY_ANSWERS };
    await repository.registerCanonicalParticipant({
      answers, displayName: input.displayName ?? "Owner Example", eventId, interviewResponses: [...legacyResponsesFromAnswers(answers, at(-1))], userId,
    });
    if (input.status === "cancelled") await repository.cancelCanonicalRegistration({ eventId, userId });
  }
  const where = "workspace_id = $1 and event_id = $2 and actor_id = $3";
  const versionWhere = `${where} and membership_version = (select membership_version from event_ops_membership_heads where ${where})`;
  const profileWhere = "workspace_id = $1 and event_id = $2 and (participant_id, profile_version) = (select participant_id, profile_version from event_ops_membership_heads where workspace_id = $1 and event_id = $2 and actor_id = $3)";
  /** Overwrites the stored registrationProfile (MISSING removes the key). */
  async function setProfile(eventId: string, actorId: string, profile: unknown) {
    await asReplica(pool, async (session) => {
      const result = profile === MISSING
        ? await session.query(`update event_ops_profile_versions set profile_payload = profile_payload - 'registrationProfile' where ${profileWhere}`, [WORKSPACE, eventId, actorId])
        : await session.query(`update event_ops_profile_versions set profile_payload = jsonb_set(profile_payload, '{registrationProfile}', $4::jsonb) where ${profileWhere}`, [WORKSPACE, eventId, actorId, JSON.stringify(profile)]);
      assert.equal(result.rowCount, 1);
    });
  }
  async function damage(eventId: string, actorId: string, statements: readonly string[]) {
    await asReplica(pool, async (session) => {
      for (const text of statements) {
        const result = await session.query(text.replaceAll("${where}", where).replaceAll("${versionWhere}", versionWhere).replaceAll("${profileWhere}", profileWhere), [WORKSPACE, eventId, actorId]);
        assert.equal(result.rowCount, 1, text);
      }
    });
  }
  return { client, createEvent, damage, register, repository, setProfile };
}

/** readRegisteredCatalogueAttendees wired to a real repository, the actor already rsvped. */
function attendeesReader(t: TestContext, repository: object) {
  const modules: Record<string, unknown> = {
    [join(root, "features/events/registration/runtime.ts")]: {
      readRuntimeEventRegistrationStatus: async ({ eventId }: { eventId: string }) => ({ eventId, status: "rsvped" }),
    },
    [join(root, "features/events/event-operations/repository.ts")]: { createConfiguredEventOperationsRepository: () => repository },
  };
  const attendeesPath = join(root, "features/events/registered-catalogue-attendees.ts");
  stubModules(t, modules, [attendeesPath]);
  const { readRegisteredCatalogueAttendees } = require(attendeesPath) as typeof import("../../features/events/registered-catalogue-attendees");
  return async (eventId: string) => (await readRegisteredCatalogueAttendees({ actorId: "actor:viewer", eventId }))?.attendees ?? null;
}

async function compareCanonical(input: {
  eventId: string;
  label: string;
  newAttendees: (eventId: string) => Promise<unknown>;
  repository: ReturnType<typeof createPostgresEventOperationsRepository>;
}) {
  const { rosterEntryFromRegistration } = projection();
  const { eventId, label, repository } = input;
  const full = await settle(() => repository.listCanonicalRegistrations(eventId));
  const rosterBefore = await settle(async () => oldAttendees(await repository.listCanonicalRegistrations(eventId)));
  const rosterAfter = await settle(() => input.newAttendees(eventId));
  assert.deepEqual(rosterAfter, rosterBefore, `roster: ${label}`);
  const previewBefore = await settle(async () => oldClusterPreview(await repository.listCanonicalRegistrations(eventId)));
  const entries = await settle(() => canonicalRoster(repository)(eventId, "preview"));
  const previewAfter = await settle(async () => registrationClusterPreview((await canonicalRoster(repository)(eventId, "preview")) as never));
  assert.deepEqual(previewAfter, previewBefore, `preview: ${label}`);
  if (full.ok) {
    // (a) the full DTO and the projection give the same aggregate; the projection is the JS trim of the full rows, in order.
    assert.deepEqual(previewAfter, await settle(() => registrationClusterPreview(full.value)), `full DTO aggregate: ${label}`);
    for (const fields of ["attendees", "preview"] as const) {
      assert.deepEqual(await canonicalRoster(repository)(eventId, fields), full.value.map((row) => rosterEntryFromRegistration(row, fields)), `projection rows (${fields}): ${label}`);
    }
  } else {
    assert.equal(entries.ok, false, `projection rejects with the full read: ${label}`);
  }
  return { preview: previewAfter, roster: rosterAfter };
}

test("SC-01/SC-02 PG canonical: fact-5 matrix, rsvped and cancelled, roster and preview equal the old reads", pgSkip, async (t) => {
  await withSchema(async ({ pool }) => {
    const { createEvent, register, repository, setProfile } = await canonicalFixture(pool);
    const newAttendees = attendeesReader(t, repository);
    let index = 0;
    for (const cell of CELLS) {
      for (const status of ["rsvped", "cancelled"] as const) {
        const eventId = `event:canonical-cell-${index++}`;
        await createEvent(eventId);
        for (let healthy = 0; healthy < 4; healthy += 1) await register(eventId, `actor:healthy-${healthy}`, { displayName: `Healthy ${healthy}` });
        await register(eventId, "actor:damaged", { answers: { ...DAMAGED_ANSWERS }, displayName: "Damaged", status });
        // canonical keeps its profile under registrationProfile; a missing key is a parse failure (below), so use null here.
        await setProfile(eventId, "actor:damaged", cell.profile === MISSING ? null : cell.profile);
        const label = `${cell.name} (${status})`;
        const result = await compareCanonical({ eventId, label, newAttendees, repository });
        // The comparison above is against the old code; also pin the verdict from the probe.
        if (status === "cancelled") {
          assert.equal(result.roster.ok, true, label);
        } else if (cell.roster === "reject" || cell.profile === MISSING) {
          assert.equal(result.roster.ok, false, label);
        }
        const expected = expectedPreview(cell.profile === MISSING ? "reject" : cell.preview, status);
        assert.equal(result.preview.ok, expected !== "reject", `preview verdict: ${label}`);
      }
    }
  });
});

test("SC-01 (b) PG canonical: rows the full read cannot parse reject roster and preview, cancelled rows included", pgSkip, async (t) => {
  await withSchema(async ({ pool }) => {
    const { createEvent, damage, register, repository, setProfile } = await canonicalFixture(pool);
    const newAttendees = attendeesReader(t, repository);
    const cases: Array<{ name: string; profile?: typeof MISSING; rejects?: boolean; sql?: string[] }> = [
      { name: "profile_payload without registrationProfile", profile: MISSING, rejects: true },
      { name: "source_registration_id empty", rejects: true, sql: ["update event_ops_membership_versions set source_registration_id = '' where ${versionWhere}"] },
      { name: "participant_id empty", rejects: true, sql: ["update event_ops_profile_versions set participant_id = '' where ${profileWhere}", "update event_ops_membership_heads set participant_id = '' where ${where}"] },
      { name: "registered_at infinity", rejects: true, sql: ["update event_ops_membership_versions set registered_at = 'infinity' where ${versionWhere}"] },
      { name: "registered_at beyond JS range", rejects: true, sql: ["update event_ops_membership_versions set registered_at = '275761-01-01T00:00:00Z' where ${versionWhere}"] },
      { name: "head updated_at -infinity", rejects: true, sql: ["update event_ops_membership_heads set updated_at = '-infinity' where ${where}"] },
      { name: "cancelled_at infinity", rejects: true, sql: ["update event_ops_membership_versions set cancelled_at = 'infinity' where ${versionWhere}"] },
      { name: "reactivated_at beyond JS range", rejects: true, sql: ["update event_ops_membership_versions set reactivated_at = '275761-01-01T00:00:00Z' where ${versionWhere}"] },
      { name: "registered_at at the JS maximum", sql: ["update event_ops_membership_versions set registered_at = '275760-09-13T00:00:00Z' where ${versionWhere}"] },
    ];
    let index = 0;
    for (const entry of cases) {
      for (const status of ["rsvped", "cancelled"] as const) {
        const eventId = `event:canonical-parse-${index++}`;
        await createEvent(eventId);
        for (let healthy = 0; healthy < 5; healthy += 1) await register(eventId, `actor:healthy-${healthy}`, { displayName: `Healthy ${healthy}` });
        await register(eventId, "actor:damaged", { status });
        if (entry.profile === MISSING) await setProfile(eventId, "actor:damaged", MISSING);
        if (entry.sql) await damage(eventId, "actor:damaged", entry.sql);
        const label = `${entry.name} (${status})`;
        const result = await compareCanonical({ eventId, label, newAttendees, repository });
        if (entry.rejects !== undefined) {
          assert.equal(result.roster.ok, !entry.rejects, `old baseline: ${label}`);
          assert.equal(result.preview.ok, !entry.rejects, `old baseline: ${label}`);
        }
      }
    }
  });
});

test("SC-02 (b) PG canonical: aggregation cases (case folding and first label, ties, more than six buckets, positioning fallback, cancelled)", pgSkip, async (t) => {
  await withSchema(async ({ pool }) => {
    const { createEvent, register, repository } = await canonicalFixture(pool);
    const newAttendees = attendeesReader(t, repository);
    const eventId = "event:canonical-aggregate";
    await createEvent(eventId);
    let actor = 0;
    const add = async (answers: Record<string, string>, status: "rsvped" | "cancelled" = "rsvped") =>
      register(eventId, `actor:${String(actor++).padStart(3, "0")}`, { answers, displayName: `Person ${actor}`, status });
    for (const industry of ["SaaS", "saas", "SAAS", "SaaS", "saas"]) await add({ industry });
    for (const industry of ["Alpha", "Bravo", "Charlie", "Delta", "Echo", "Foxtrot", "Golf"]) {
      for (let count = 0; count < 5; count += 1) await add({ industry });
    }
    for (let count = 0; count < 4; count += 1) await add({ industry: "Hotel" });
    for (let count = 0; count < 5; count += 1) await add({ positioning: "Designer @ Studio" });
    for (let count = 0; count < 5; count += 1) await add({ industry: "Cancelled Industry" }, "cancelled");
    const result = await compareCanonical({ eventId, label: "aggregate", newAttendees, repository });
    assert.equal(result.preview.ok, true);
    const preview = (result.preview as { value: ReturnType<typeof registrationClusterPreview> }).value;
    assert.equal(preview.total, 49);
    assert.equal(preview.buckets.length, 6, "truncated to six buckets");
    const full = await repository.listCanonicalRegistrations(eventId);
    const firstSaas = full.find((row) => row.status === "rsvped" && row.participantProfile.answers.industry?.toLowerCase() === "saas");
    assert.ok(preview.buckets.every((bucket) => bucket.count === 5));
    const saas = preview.buckets.find((bucket) => bucket.label.toLowerCase() === "saas");
    if (saas) assert.equal(saas.label, firstSaas!.participantProfile.answers.industry, "label is the first occurrence's original text");
    assert.equal((result.roster as { value: unknown[] }).value.length, 49);
  });
});

async function insertLegacy(pool: Pool, row: {
  createdAt?: string; deletedAt?: string | null; eventId: string; lifecycle?: "active" | "deleted"; occurredAt?: string | null;
  payload: unknown; recordId: string; targetId?: string | null; updatedAt?: string; userId: string;
}) {
  await pool.query(
    `insert into orbit_records (workspace_id, collection_name, record_id, user_id, source_type, source_id, payload,
       created_at, updated_at, occurred_at, deleted_at, lifecycle_state, target_type, target_id)
     values ($1, 'event_registrations', $2, $3, 'manual', $2, $4::jsonb, $5::timestamptz, $6::timestamptz, $7::timestamptz, $8::timestamptz, $9, 'event', $10)`,
    [WORKSPACE, row.recordId, row.userId, JSON.stringify(row.payload), row.createdAt ?? "2026-01-01T00:00:00Z",
      row.updatedAt ?? "2026-01-02T00:00:00Z", row.occurredAt === undefined ? "2026-01-02T00:00:00Z" : row.occurredAt,
      row.deletedAt ?? null, row.lifecycle ?? "active", row.targetId === undefined ? row.eventId : row.targetId],
  );
}

function legacyPayload(eventId: string, userId: string, registration: Record<string, unknown> = {}) {
  const id = eventRegistrationId(eventId, userId);
  const value: Record<string, unknown> = {
    eventId, id, participantProfile: { answers: { ...HEALTHY_ANSWERS }, displayName: userId }, status: "rsvped", userId, ...registration,
  };
  for (const [key, item] of Object.entries(registration)) if (item === MISSING) delete value[key];
  return { registration: value, registrationId: id };
}

function legacyProviders(pool: Pool) {
  const client = sqlClient(pool);
  return {
    newProvider: createEventRegistrationLiveRecordProvider({
      statusSql: { client, read: createGatedDedupedCustomRead(createInflightReadDeduper(), null) },
      store: createPostgresLiveRecordStore({ client }),
      workspaceId: WORKSPACE,
    }),
    oldProvider: createEventRegistrationLiveRecordProvider({ store: createPostgresLiveRecordStore({ client }), workspaceId: WORKSPACE }),
  };
}

async function compareLegacy(providers: ReturnType<typeof legacyProviders>, eventId: string, label: string) {
  const { rosterEntryFromRegistration } = projection();
  const full = await settle(() => providers.oldProvider.listRegistrations(eventId));
  const before = await settle(async () => oldClusterPreview(await providers.oldProvider.listRegistrations(eventId)));
  const after = await settle(async () => registrationClusterPreview((await legacyRoster(providers.newProvider)(eventId, "preview")) as never));
  assert.deepEqual(after, before, `preview: ${label}`);
  if (full.ok) {
    assert.deepEqual(after, await settle(() => registrationClusterPreview(full.value)), `full DTO aggregate: ${label}`);
    // (d) same rows, same order, as the JS trim of the full read.
    assert.deepEqual(await legacyRoster(providers.newProvider)(eventId, "preview"), full.value.map((row) => rosterEntryFromRegistration(row, "preview")), `rows: ${label}`);
  }
  return after;
}

test("SC-02 PG legacy: fact-5 matrix, rsvped and cancelled, preview equals the old read", pgSkip, async () => {
  await withSchema(async ({ pool }) => {
    await pool.query(ORBIT_RECORDS_SCHEMA_SQL);
    const providers = legacyProviders(pool);
    let index = 0;
    for (const cell of CELLS) {
      for (const status of ["rsvped", "cancelled"] as const) {
        const eventId = `event:legacy-cell-${index++}`;
        for (let healthy = 0; healthy < 4; healthy += 1) {
          await insertLegacy(pool, { eventId, payload: legacyPayload(eventId, `u:healthy-${healthy}`), recordId: eventRegistrationId(eventId, `u:healthy-${healthy}`), userId: `u:healthy-${healthy}` });
        }
        await insertLegacy(pool, {
          eventId, occurredAt: "2026-01-03T00:00:00Z", payload: legacyPayload(eventId, "u:damaged", { participantProfile: cell.profile, status }),
          recordId: eventRegistrationId(eventId, "u:damaged"), userId: "u:damaged",
        });
        const label = `${cell.name} (${status})`;
        const after = await compareLegacy(providers, eventId, label);
        const expected = expectedPreview(cell.preview, status);
        // The damaged row is the newest, so its original text (e.g. "PROBE") can be the shown label.
        const folded = after.ok ? { ok: true, value: { ...after.value, buckets: after.value.buckets.map((bucket) => ({ ...bucket, label: bucket.label.toLowerCase() === "probe" ? "Probe" : bucket.label })) } } : after;
        assert.deepEqual(folded, expected === "reject" ? { ok: false } : { ok: true, value: expected }, `verdict: ${label}`);
      }
    }
    // Any stored status other than the string "rsvped" is not counted; the damaged profile is never read.
    for (const status of ["pending", null, MISSING, 1, { value: "rsvped" }, "RSVPED"]) {
      const eventId = `event:legacy-status-${index++}`;
      await insertLegacy(pool, { eventId, payload: legacyPayload(eventId, "u:x", { participantProfile: null, status }), recordId: eventRegistrationId(eventId, "u:x"), userId: "u:x" });
      assert.deepEqual(await compareLegacy(providers, eventId, `status ${String(status)}`), { ok: true, value: { buckets: [], total: 0 } });
    }
  });
});

test("SC-02 PG legacy: row-level failures reject, structurally invalid rows drop, out-of-scope rows are never read", pgSkip, async () => {
  await withSchema(async ({ pool }) => {
    await pool.query(ORBIT_RECORDS_SCHEMA_SQL);
    const providers = legacyProviders(pool);
    type Row = Parameters<typeof insertLegacy>[1];
    const cases: Array<{ name: string; outcome: "reject" | "dropped" | "counted"; row: (eventId: string) => Row }> = [
      { name: "created_at infinity", outcome: "reject", row: (e) => ({ createdAt: "infinity", eventId: e, payload: legacyPayload(e, "u:d"), recordId: "d", userId: "u:d" }) },
      { name: "updated_at -infinity", outcome: "reject", row: (e) => ({ eventId: e, payload: legacyPayload(e, "u:d"), recordId: "d", updatedAt: "-infinity", userId: "u:d" }) },
      { name: "updated_at beyond JS range", outcome: "reject", row: (e) => ({ eventId: e, payload: legacyPayload(e, "u:d"), recordId: "d", updatedAt: "275761-01-01T00:00:00Z", userId: "u:d" }) },
      { name: "occurred_at beyond JS range", outcome: "reject", row: (e) => ({ eventId: e, occurredAt: "275761-01-01T00:00:00Z", payload: legacyPayload(e, "u:d"), recordId: "d", userId: "u:d" }) },
      { name: "deleted_at beyond JS range", outcome: "reject", row: (e) => ({ deletedAt: "275761-01-01T00:00:00Z", eventId: e, payload: legacyPayload(e, "u:d"), recordId: "d", userId: "u:d" }) },
      { name: "cancelled row with infinite created_at", outcome: "reject", row: (e) => ({ createdAt: "infinity", eventId: e, payload: legacyPayload(e, "u:d", { status: "cancelled" }), recordId: "d", userId: "u:d" }) },
      { name: "occurred_at -infinity", outcome: "counted", row: (e) => ({ eventId: e, occurredAt: "-infinity", payload: legacyPayload(e, "u:d"), recordId: "d", userId: "u:d" }) },
      { name: "deleted_at infinity", outcome: "counted", row: (e) => ({ deletedAt: "infinity", eventId: e, payload: legacyPayload(e, "u:d"), recordId: "d", userId: "u:d" }) },
      { name: "json null payload", outcome: "reject", row: (e) => ({ eventId: e, payload: null, recordId: "d", userId: "u:d" }) },
      { name: "json string payload (not JSON text)", outcome: "reject", row: (e) => ({ eventId: e, payload: "not json", recordId: "d", userId: "u:d" }) },
      { name: "json string payload holding null", outcome: "reject", row: (e) => ({ eventId: e, payload: "null", recordId: "d", userId: "u:d" }) },
      { name: "json string payload holding this event's registration", outcome: "counted", row: (e) => ({ eventId: e, payload: JSON.stringify(legacyPayload(e, "u:d")), recordId: "d", userId: "u:d" }) },
      { name: "json string payload holding a damaged profile", outcome: "reject", row: (e) => ({ eventId: e, payload: JSON.stringify(legacyPayload(e, "u:d", { participantProfile: { answers: { industry: 7 } } })), recordId: "d", userId: "u:d" }) },
      { name: "json string payload holding another event's registration", outcome: "dropped", row: (e) => ({ eventId: e, payload: JSON.stringify(legacyPayload("event:other", "u:d")), recordId: "d", userId: "u:d" }) },
      { name: "json string payload holding {}", outcome: "dropped", row: (e) => ({ eventId: e, payload: "{}", recordId: "d", userId: "u:d" }) },
      { name: "no registrationId", outcome: "dropped", row: (e) => ({ eventId: e, payload: { registration: legacyPayload(e, "u:d").registration }, recordId: "d", userId: "u:d" }) },
      { name: "registration array", outcome: "dropped", row: (e) => ({ eventId: e, payload: { registration: [], registrationId: "x" }, recordId: "d", userId: "u:d" }) },
      { name: "registration.eventId number", outcome: "dropped", row: (e) => ({ eventId: e, payload: legacyPayload(e, "u:d", { eventId: 7 }), recordId: "d", userId: "u:d" }) },
      { name: "registration.userId missing", outcome: "dropped", row: (e) => ({ eventId: e, payload: legacyPayload(e, "u:d", { userId: MISSING }), recordId: "d", userId: "u:d" }) },
      { name: "registration.eventId of another event", outcome: "dropped", row: (e) => ({ eventId: e, payload: legacyPayload("event:other", "u:d"), recordId: "d", userId: "u:d" }) },
      { name: "array payload", outcome: "dropped", row: (e) => ({ eventId: e, payload: [1, 2], recordId: "d", userId: "u:d" }) },
      { name: "number payload", outcome: "dropped", row: (e) => ({ eventId: e, payload: 5, recordId: "d", userId: "u:d" }) },
      { name: "deleted row with infinite created_at", outcome: "dropped", row: (e) => ({ createdAt: "infinity", eventId: e, lifecycle: "deleted", payload: legacyPayload(e, "u:d"), recordId: "d", userId: "u:d" }) },
      { name: "another target with infinite created_at", outcome: "dropped", row: (e) => ({ createdAt: "infinity", eventId: e, payload: legacyPayload(e, "u:d"), recordId: "d", targetId: "event:other", userId: "u:d" }) },
      { name: "no target with a damaged profile", outcome: "dropped", row: (e) => ({ eventId: e, payload: legacyPayload(e, "u:d", { participantProfile: null }), recordId: "d", targetId: null, userId: "u:d" }) },
    ];
    let index = 0;
    for (const entry of cases) {
      const eventId = `event:legacy-row-${index++}`;
      for (let healthy = 0; healthy < 4; healthy += 1) {
        await insertLegacy(pool, { eventId, payload: legacyPayload(eventId, `u:healthy-${healthy}`), recordId: `${eventId}:h${healthy}`, userId: `u:healthy-${healthy}` });
      }
      const row = entry.row(eventId);
      await insertLegacy(pool, { ...row, recordId: `${eventId}:${row.recordId}` });
      const after = await compareLegacy(providers, eventId, entry.name);
      const expected = entry.outcome === "reject" ? { ok: false } : { ok: true, value: entry.outcome === "counted" ? { buckets: [{ count: 5, label: "Probe" }], total: 5 } : { buckets: [], total: 4 } };
      assert.deepEqual(after, expected, `verdict: ${entry.name}`);
    }
  });
});

test("SC-02 (b)(d) PG legacy: aggregation cases and the full read's row order (newest first)", pgSkip, async () => {
  await withSchema(async ({ pool }) => {
    await pool.query(ORBIT_RECORDS_SCHEMA_SQL);
    const providers = legacyProviders(pool);
    const eventId = "event:legacy-aggregate";
    let minute = 0;
    const add = async (answers: Record<string, unknown>, status = "rsvped", options: { occurredAt?: string | null } = {}) => {
      const user = `u:${String(minute).padStart(3, "0")}`;
      const occurredAt = options.occurredAt === undefined ? new Date(Date.UTC(2026, 0, 1, 0, minute++)).toISOString() : options.occurredAt;
      await insertLegacy(pool, {
        eventId, occurredAt, payload: legacyPayload(eventId, user, { participantProfile: { answers, displayName: user }, status }),
        recordId: eventRegistrationId(eventId, user), updatedAt: new Date(Date.UTC(2026, 0, 2, 0, minute++)).toISOString(), userId: user,
      });
    };
    // Written oldest first; the read is newest first (coalesce(occurred_at, updated_at) desc, updated_at desc).
    for (const industry of ["SaaS", "saas", "SAAS", "SaaS", "sAaS"]) await add({ industry });
    for (const industry of ["Alpha", "Bravo", "Charlie", "Delta", "Echo", "Foxtrot", "Golf"]) {
      for (let count = 0; count < 5; count += 1) await add({ industry });
    }
    for (let count = 0; count < 4; count += 1) await add({ industry: "Hotel" });
    for (let count = 0; count < 5; count += 1) await add({ positioning: "Designer @ Studio" });
    for (let count = 0; count < 5; count += 1) await add({ industry: "Cancelled Industry" }, "cancelled");
    // A null occurred_at sorts by its (newest) updated_at, so this row is the group's first occurrence.
    await add({ industry: "sAAS" }, "rsvped", { occurredAt: null });
    const after = await compareLegacy(providers, eventId, "aggregate");
    assert.equal(after.ok, true);
    const preview = (after as { value: ReturnType<typeof registrationClusterPreview> }).value;
    assert.equal(preview.total, 50);
    assert.equal(preview.buckets.length, 6);
    assert.deepEqual(preview.buckets[0], { count: 5, label: "sAAS" }, "six case variants merge, floor to 5, and show the first occurrence's original text");
    // Ties keep the first-occurrence order of the newest-first read.
    assert.deepEqual(preview.buckets.slice(1).map((bucket) => bucket.label), ["Designer", "Golf", "Foxtrot", "Echo", "Delta"]);
  });
});

test("SC-02 PG runtime: listRuntimeEventRosterEntries equals eventRegistrationRuntimeService.list on both paths and returns only narrow columns", pgSkip, async () => {
  await withSchema(async ({ pool, schema }) => {
    const { createEvent, register } = await canonicalFixture(pool);
    await pool.query(ORBIT_RECORDS_SCHEMA_SQL);
    const canonicalEvent = "event:runtime-canonical";
    const legacyEvent = "event:runtime-legacy";
    await createEvent(canonicalEvent);
    for (let index = 0; index < 6; index += 1) {
      await register(canonicalEvent, `actor:${index}`, { answers: { industry: index % 2 ? "SaaS" : "saas", positioning: "P @ Q" }, status: index === 5 ? "cancelled" : "rsvped" });
      await insertLegacy(pool, {
        eventId: legacyEvent, occurredAt: new Date(Date.UTC(2026, 0, 1, index)).toISOString(),
        payload: legacyPayload(legacyEvent, `u:${index}`, { participantProfile: { answers: { industry: index % 2 ? "Fin" : "FIN" } } }),
        recordId: eventRegistrationId(legacyEvent, `u:${index}`), userId: `u:${index}`,
      });
    }
    // A legacy row for the enrolled event must be ignored by both reads.
    await insertLegacy(pool, { eventId: canonicalEvent, payload: legacyPayload(canonicalEvent, "u:shadow"), recordId: "shadow", userId: "u:shadow" });

    const runtimeUrl = new URL(databaseUrl!);
    runtimeUrl.searchParams.set("options", `-c search_path=${schema}`);
    const runtimeModule = new URL("../../features/events/registration/runtime.ts", import.meta.url).href;
    const previewModule = new URL("../../features/events/registration/cluster-preview.ts", import.meta.url).href;
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
      const runtimeImport = await import(${JSON.stringify(runtimeModule)});
      const runtime = runtimeImport.default ?? runtimeImport;
      const previewImport = await import(${JSON.stringify(previewModule)});
      const { registrationClusterPreview } = previewImport.default ?? previewImport;
      const out = {};
      for (const eventId of ${JSON.stringify([canonicalEvent, legacyEvent, "event:runtime-none"])}) {
        const full = await runtime.eventRegistrationRuntimeService.list({ eventId });
        log.active = true;
        const light = await runtime.listRuntimeEventRosterEntries({ eventId, fields: "preview" });
        log.active = false;
        out[eventId] = { full: registrationClusterPreview(full), light: registrationClusterPreview(light), rows: light.length, fullRows: full.length };
      }
      out.columns = log.columns;
      console.log(JSON.stringify(out));
      process.exit(0);
    `;
    const run = spawnSync(process.execPath, ["--import", "tsx", "--input-type=module", "-e", script], { encoding: "utf8", env: env as NodeJS.ProcessEnv, timeout: 60_000 });
    assert.equal(run.status, 0, run.stderr);
    const out = JSON.parse(run.stdout.trim().split("\n").at(-1)!) as Record<string, { full: unknown; light: unknown; rows: number; fullRows: number }> & { columns: string[][] };
    for (const eventId of [canonicalEvent, legacyEvent, "event:runtime-none"]) {
      assert.deepEqual(out[eventId]!.light, out[eventId]!.full, eventId);
      assert.equal(out[eventId]!.rows, out[eventId]!.fullRows, eventId);
    }
    const canonicalPreview = out[canonicalEvent]!.light as { buckets: { count: number; label: string }[]; total: number };
    assert.equal(canonicalPreview.total, 5);
    assert.deepEqual(canonicalPreview.buckets.map((bucket) => [bucket.count, bucket.label.toLowerCase()]), [[5, "saas"]]);
    assert.deepEqual(out[legacyEvent]!.light, { buckets: [{ count: 5, label: "Fin" }], total: 6 });
    const returnedColumns = new Set(out.columns.flat());
    assert.ok(returnedColumns.has("s"), "the projections went through PostgreSQL");
    for (const wide of ["payload", "profile_payload", "search_text", "participant_id", "source_registration_id", "actor_id", "user_id", "record_id"]) {
      assert.equal(returnedColumns.has(wide), false, `no ${wide} column is returned`);
    }
  });
});
