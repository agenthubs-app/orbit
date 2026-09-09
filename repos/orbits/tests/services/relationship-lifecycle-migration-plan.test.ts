import assert from "node:assert/strict";
import test from "node:test";
import type { LiveRecord } from "../../shared/storage/live-record-store";
import { applyLifecycleMigrationChanges, lifecycleMigrationRecordHash, parseLifecycleMigrationManifest, planRelationshipLifecycleMigration, type LifecycleMigrationManifest } from "../../features/connections/lifecycle/migration-plan";

const actorId = "actor:migration";
const workspaceId = "workspace:migration";
const now = "2026-08-21T01:00:00.000Z";
const manifest: LifecycleMigrationManifest = { schemaVersion: 1, actorId, workspaceId, ownerRepairs: [] };
function record(collectionName: string, recordId: string, payload: Record<string, unknown>, userId: string | null = actorId): LiveRecord {
  return { collectionName, recordId, workspaceId, userId, payload, sourceType: "manual", sourceId: "source:retained", evidenceIds: ["evidence:retained"], createdAt: now, updatedAt: now, lifecycleState: "active" };
}
function graph(stage = "active"): LiveRecord[] {
  return [
    record("contacts", "contact:a", { id: "contact:a", stage, displayName: "PRIVATE CONTACT NAME", createdAt: now, updatedAt: now }),
    record("connections", "connection:a", { id: "connection:a", accountId: actorId, contactId: "contact:a", stage, activeGoal: "PRIVATE GOAL", createdAt: now, updatedAt: now }),
  ];
}
function detail(status: string, updatedAt = "2026-08-22T01:00:00.000Z", userId: string | null = actorId): LiveRecord {
  return record("contact_detail_states", "detail:a", { actorId, contactId: "contact:a", status, updatedAt, notes: [{ body: "PRIVATE NOTE" }] }, userId);
}
function task(patch: Record<string, unknown> = {}, owner: string | null = actorId): LiveRecord {
  return record("tasks", "task:a", { id: "task:a", connectionId: "connection:a", contactId: "contact:a", title: "PRIVATE TASK TITLE", status: "open", relationshipPurpose: "follow_up", dueAt: "2026-08-25T10:00:00+09:00", createdAt: now, updatedAt: now, ...patch }, owner);
}
const plan = (records: readonly LiveRecord[], input = manifest) => planRelationshipLifecycleMigration({ records, manifest: input });

test("planning initializes only missing versions and preserves private content and input objects", () => {
  const rows = graph();
  const before = structuredClone(rows);
  const result = plan(rows);
  assert.equal(result.applyEligible, true);
  assert.deepEqual(result.changes.map(c => [c.collectionName, c.payload]), [["connections", { version: 1 }], ["contacts", { version: 1 }]]);
  assert.deepEqual(result.after.issues, []);
  assert.deepEqual(rows, before);
  const projected = applyLifecycleMigrationChanges(rows, result.changes);
  assert.equal(projected[0].payload.version, 1);
  assert.equal(projected[0].payload.displayName, "PRIVATE CONTACT NAME");
  assert.equal(projected[1].payload.activeGoal, "PRIVATE GOAL");
  assert.equal(projected[1].updatedAt, now);
  assert.deepEqual(projected[1].evidenceIds, ["evidence:retained"]);
  assert.equal(JSON.stringify(result).includes("PRIVATE"), false);
  assert.equal(result.databaseWriteExecuted, false);
});

test("canonical connection stage wins over newer detail and contact stages", () => {
  const rows = graph("archived");
  rows[0].payload.stage = "active";
  rows.push(detail("nurture"));
  const result = plan(rows);
  assert.equal(result.applyEligible, true);
  assert.equal(result.changes.some(c => c.payload.stage !== undefined), false);
  assert.equal(applyLifecycleMigrationChanges(rows, result.changes)[1].payload.stage, "archived");
});

test("legacy stage resolution uses a newer owned detail state then the canonical contact fallback", () => {
  for (const [detailTime, expected] of [["2026-08-22T01:00:00.000Z", "archived"], ["2026-08-20T01:00:00.000Z", "active"], [now, "active"]]) {
    const rows = graph();
    rows[1].payload.stage = "legacy";
    rows.push(detail("archived", detailTime));
    const result = plan(rows);
    assert.equal(result.applyEligible, true);
    assert.equal(result.changes.find(c => c.collectionName === "connections")?.payload.stage, expected);
  }
  const rows = graph(); rows[1].payload.stage = "reviewing";
  assert.equal(plan(rows).changes.find(c => c.collectionName === "connections")?.payload.stage, "active");
});

test("ambiguous or unreadable detail timestamps cannot silently select a fallback", () => {
  const rows = graph(); rows[1].payload.stage = "legacy";
  for (const records of [
    [...rows, detail("archived", "yesterday")],
    [...rows, detail("archived"), { ...detail("nurture"), recordId: "detail:second" }],
    [{ ...rows[0], payload: { ...rows[0].payload, updatedAt: "not-a-date" } }, rows[1], detail("archived")],
  ]) {
    const result = plan(records);
    assert.equal(result.applyEligible, false);
    assert.ok(result.issues.some(i => ["INVALID_RECORD", "AMBIGUOUS_STAGE"].includes(i.code)));
    assert.equal(result.changes.some(c => c.payload.stage !== undefined), false);
  }
});

test("only explicit evidenced empty-owner repairs can establish ownership", () => {
  const rows = graph(); rows[0].userId = null;
  assert.equal(plan(rows).applyEligible, false);
  const repaired = plan(rows, { ...manifest, ownerRepairs: [{ collectionName: "contacts", recordId: "contact:a", evidenceId: "evidence:review" }] });
  assert.equal(repaired.applyEligible, true);
  assert.equal(repaired.changes.find(c => c.collectionName === "contacts")?.owner, actorId);
  assert.equal(rows[0].userId, null);
  for (const owner of [actorId, "actor:other"]) {
    rows[0].userId = owner;
    assert.throws(() => plan(rows, { ...manifest, ownerRepairs: [{ collectionName: "contacts", recordId: "contact:a", evidenceId: "evidence:review" }] }));
  }
  assert.throws(() => plan(rows, { ...manifest, ownerRepairs: [{ collectionName: "contacts", recordId: "contact:missing", evidenceId: "evidence:review" }] }));
});

test("detail ownership claims and ContactActorLink never authorize stage migration", () => {
  for (const owner of [null, "actor:other"]) {
    const rows = graph(); rows[1].payload.stage = "legacy";
    rows.push(detail("archived", undefined, owner), record("contact_actor_links", "link:a", { contactId: "contact:a", linkedActorId: actorId }));
    const result = plan(rows);
    assert.equal(result.applyEligible, false);
    assert.ok(result.issues.some(i => i.code === (owner === null ? "MISSING_OWNER" : "OWNER_CONFLICT")));
    assert.equal(result.changes.some(c => c.payload.stage !== undefined), false);
  }
  const rows = graph(); rows[1].payload.stage = "legacy"; rows.push(detail("archived", undefined, null));
  const result = plan(rows, { ...manifest, ownerRepairs: [{ collectionName: "contact_detail_states", recordId: "detail:a", evidenceId: "evidence:review" }] });
  assert.equal(result.applyEligible, true);
  assert.equal(result.changes.find(c => c.collectionName === "connections")?.payload.stage, "archived");
});

test("dated obligations are normalized without inventing dates, goals, purposes or cancellations", () => {
  for (const [stage, purpose] of [["needs_follow_up", "follow_up"], ["nurture", "maintenance"]]) {
    const rows = [...graph(stage), task({ relationshipPurpose: purpose })];
    const result = plan(rows);
    assert.equal(result.applyEligible, true);
    assert.deepEqual(result.changes.find(c => c.collectionName === "tasks")?.payload, { version: 1, dueAt: "2026-08-25T01:00:00.000Z" });
    assert.equal(applyLifecycleMigrationChanges(rows, result.changes)[2].payload.title, "PRIVATE TASK TITLE");
  }
  for (const rows of [graph("needs_follow_up"), [...graph("nurture"), task({ relationshipPurpose: undefined })], [...graph("archived"), task()], [...graph("needs_follow_up"), task({ dueAt: "2026-02-30T01:00:00Z" })]]) {
    const result = plan(rows);
    assert.equal(result.applyEligible, false);
    assert.ok(result.issues.some(i => ["MISSING_DATED_TASK", "ARCHIVED_OPEN_TASKS", "INVALID_TASK"].includes(i.code)));
    assert.ok(result.changes.every(c => Object.keys(c.payload).every(k => ["version", "stage", "dueAt"].includes(k))));
  }
  const noGoal = graph(); delete noGoal[1].payload.activeGoal;
  assert.ok(plan(noGoal).issues.some(i => i.code === "MISSING_GOAL"));
});

test("unknown acquisition stages and malformed versions remain explicit review items", () => {
  for (const [stage, code] of [["captured", "ACQUISITION_REVIEW"], ["reviewing", "ACQUISITION_REVIEW"], ["unknown", "UNKNOWN_STAGE"]]) {
    const result = plan(graph(stage));
    assert.equal(result.applyEligible, false);
    assert.ok(result.issues.some(i => i.code === code));
  }
  for (const version of [null, "1", 0, -1, 1.5]) {
    const rows = graph(); rows[1].payload.version = version;
    assert.equal(plan(rows).applyEligible, false);
    assert.equal(plan(rows).changes.find(c => c.collectionName === "connections"), undefined);
  }
  const rows = graph(); rows[1].payload.version = 7;
  assert.equal(plan(rows).changes.find(c => c.collectionName === "connections"), undefined);
});

test("duplicates and foreign references block the whole plan without disclosing foreign content", () => {
  for (const rows of [
    [...graph(), { ...graph()[1], recordId: "connection:b", payload: { ...graph()[1].payload, id: "connection:b" } }],
    [...graph(), { ...graph()[0], userId: "actor:other", payload: { ...graph()[0].payload, displayName: "FOREIGN PRIVATE" } }],
    [...graph("needs_follow_up"), task({}, "actor:other")],
  ]) {
    const result = plan(rows);
    assert.equal(result.applyEligible, false);
    assert.equal(JSON.stringify(result).includes("PRIVATE"), false);
  }
});

test("hashes are stable across row and object ordering, but bind every source change", () => {
  const rows = [...graph(), { ...task(), workspaceId: "workspace:other" }, record("contacts", "contact:foreign", { id: "contact:foreign", displayName: "FOREIGN PRIVATE" }, "actor:other")];
  const ordered = rows.map(row => Object.fromEntries(Object.entries(row).reverse()) as LiveRecord);
  assert.deepEqual(plan(rows), plan(ordered.reverse()));
  for (const change of [
    (row: LiveRecord) => { row.payload.displayName = "changed"; },
    (row: LiveRecord) => { row.sourceId = "source:changed"; },
    (row: LiveRecord) => { row.updatedAt = "2026-08-23T01:00:00.000Z"; },
  ]) {
    const changed = structuredClone(rows); change(changed[0]);
    assert.notEqual(plan(changed).sourceHash, plan(rows).sourceHash);
  }
  assert.equal(lifecycleMigrationRecordHash(rows[0]), lifecycleMigrationRecordHash({ ...rows[0], sourceLabel: null, provider: null, searchText: null }));
  const projected = applyLifecycleMigrationChanges(rows, plan(rows).changes);
  assert.deepEqual(projected.slice(2), rows.slice(2));
  assert.equal(JSON.stringify(plan(rows)).includes("FOREIGN"), false);
});

test("strict manifest parsing rejects unreviewable or ambiguous ownership commands", () => {
  const repair = { collectionName: "contacts", recordId: "contact:a", evidenceId: "evidence:review" };
  for (const value of [null, [], { ...manifest, approved: true }, { ...manifest, actorId: " " }, { ...manifest, ownerRepairs: [{ ...repair, evidenceId: "" }] }, { ...manifest, ownerRepairs: [repair, repair] }, { ...manifest, ownerRepairs: [{ ...repair, collectionName: "contact_actor_links" }] }, { ...manifest, ownerRepairs: [{ ...repair, userId: actorId }] }]) {
    assert.throws(() => parseLifecycleMigrationManifest(value));
  }
  const source = { ...manifest, ownerRepairs: [repair] };
  const parsed = parseLifecycleMigrationManifest(source);
  source.ownerRepairs[0].recordId = "contact:changed";
  assert.equal(parsed.ownerRepairs[0].recordId, "contact:a");
});

test("applying prepared changes rejects stale or forged patches and never changes the input", () => {
  const rows = graph(); const changes = plan(rows).changes;
  const changed = structuredClone(rows); changed[0].payload.displayName = "edited since review";
  assert.throws(() => applyLifecycleMigrationChanges(changed, changes));
  assert.throws(() => applyLifecycleMigrationChanges(rows, [...changes, changes[0]]));
  assert.throws(() => applyLifecycleMigrationChanges(rows, [{ ...changes[0], afterHash: "0".repeat(64) }]));
  assert.throws(() => applyLifecycleMigrationChanges(rows, [{ ...changes[0], payload: { title: "forged" } } as never]));
  for (const row of rows) { Object.freeze(row.payload); Object.freeze(row); }
  Object.freeze(rows);
  assert.equal(applyLifecycleMigrationChanges(rows, changes)[0].payload.version, 1);
});

test("dated generic tasks must be valid next-action data before a plan is eligible", () => {
  for (const patch of [{ title: " " }, { status: "unknown" }, { status: ["open"] }, { createdAt: "yesterday" }, { updatedAt: "tomorrow" }]) {
    const result = plan([...graph(), task({ relationshipPurpose: undefined, ...patch })]);
    assert.equal(result.applyEligible, false);
    assert.ok(result.issues.some(i => i.collectionName === "tasks" && i.code === "INVALID_TASK"));
  }
  const rows = [...graph(), task({ relationshipPurpose: undefined })];
  assert.equal(plan(rows).applyEligible, true);
  const undated = [...graph(), task({ relationshipPurpose: undefined, dueAt: undefined })];
  assert.equal(plan(undated).changes.find(c => c.collectionName === "tasks")?.payload.dueAt, undefined);
});

test("snapshot guards reject hooks and invalid JSON without evaluating private getters", () => {
  let getterCalls = 0;
  const rows = graph();
  Object.defineProperty(rows[0].payload, "privateGetter", { enumerable: true, get() { getterCalls++; return "PRIVATE GETTER"; } });
  assert.throws(() => plan(rows));
  assert.throws(() => applyLifecycleMigrationChanges(rows, []));
  assert.equal(getterCalls, 0);
  const cyclic: Record<string, unknown> = {}; cyclic.self = cyclic;
  for (const invalid of [cyclic, new Date(), [,,], { toJSON() { throw new Error("PRIVATE JSON"); } }, { [Symbol("private")]: true }]) {
    const input = graph(); input[0].payload.extra = invalid;
    assert.throws(() => plan(input), error => error instanceof Error && !error.message.includes("PRIVATE"));
  }
});

test("manifest parsing rejects unknown fields even when their value is undefined", () => {
  assert.throws(() => parseLifecycleMigrationManifest({ ...manifest, approved: undefined }));
  assert.throws(() => parseLifecycleMigrationManifest({ ...manifest, ownerRepairs: [{ collectionName: "contacts", recordId: "contact:a", evidenceId: "evidence:a", owner: undefined }] }));
});

test("a foreign detail referring to the actor contact cannot be bypassed by stage fallback", () => {
  const rows = graph(); rows[1].payload.stage = "legacy";
  const foreign = detail("archived", undefined, "actor:other"); foreign.payload.actorId = "actor:other";
  const result = plan([...rows, foreign]);
  assert.equal(result.applyEligible, false);
  assert.ok(result.issues.some(i => i.collectionName === "contact_detail_states" && i.code === "OWNER_CONFLICT"));
  assert.equal(result.changes.some(c => c.payload.stage !== undefined), false);
});

test("an ownership manifest cannot adopt orphan or foreign-claiming records", () => {
  const orphanDetail = detail("active", undefined, null);
  orphanDetail.payload.actorId = "actor:other";
  orphanDetail.payload.contactId = "contact:elsewhere";
  const wrongClaim = detail("active", undefined, null); wrongClaim.payload.actorId = "actor:other";
  const orphanTask = task({ connectionId: undefined, contactId: undefined, relationshipPurpose: undefined }, null);
  const orphanContact = record("contacts", "contact:orphan", { id: "contact:orphan" }, null);
  for (const row of [orphanDetail, wrongClaim, orphanTask, orphanContact]) {
    assert.throws(() => plan([...graph(), row], { ...manifest, ownerRepairs: [{ collectionName: row.collectionName as "tasks", recordId: row.recordId, evidenceId: "evidence:review" }] }));
  }
  const rows = [...graph("needs_follow_up"), task({}, null)]; rows[0].userId = null; rows[1].userId = null;
  const repairs = rows.map(row => ({ collectionName: row.collectionName as "tasks", recordId: row.recordId, evidenceId: "evidence:review" }));
  assert.equal(plan(rows, { ...manifest, ownerRepairs: repairs }).applyEligible, true);
});

test("deleted records cannot hide duplicate physical identities in the reviewed snapshot", () => {
  for (const version of [undefined, 1]) {
    const rows = graph(); rows[0].payload.version = version;
    rows.push({ ...structuredClone(rows[0]), lifecycleState: "deleted", deletedAt: now });
    const result = plan(rows);
    assert.equal(result.applyEligible, false);
    assert.ok(result.issues.some(i => i.collectionName === "contacts" && i.recordId === "contact:a" && i.code === "INVALID_RECORD"));
    assert.equal(result.changes.some(c => c.collectionName === "contacts"), false);
  }
});

test("canonical stage authority does not waive detail ownership or reference consistency", () => {
  for (const row of [detail("active", undefined, null), detail("active", undefined, "actor:other"), { ...detail("active"), payload: { ...detail("active").payload, contactId: "contact:foreign" } }]) {
    if (row.userId === "actor:other") row.payload.actorId = "actor:other";
    const result = plan([...graph(), row]);
    assert.equal(result.applyEligible, false);
    assert.ok(result.issues.some(i => i.collectionName === "contact_detail_states" && ["MISSING_OWNER", "OWNER_CONFLICT", "INVALID_REFERENCE"].includes(i.code)));
    assert.equal(result.changes.some(c => c.payload.stage !== undefined), false);
  }
});

test("record lifecycle values must be strings, not coercible JSON data", () => {
  const rows = graph(); rows[0].lifecycleState = ["active"] as never;
  assert.throws(() => plan(rows));
});
