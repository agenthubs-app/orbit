import assert from "node:assert/strict";
import test from "node:test";
import type { LiveRecord } from "../../shared/storage/live-record-store";
import { assessRelationshipLifecycleMigration } from "../../features/connections/lifecycle/migration-preflight";

const now = "2026-08-21T01:00:00.000Z";
const actorId = "actor:a";
const workspaceId = "workspace:test";
function record(collectionName: string, recordId: string, userId: string | null, payload: Record<string, unknown>): LiveRecord {
  return { workspaceId, collectionName, recordId, userId, payload, sourceType: "manual", sourceId: "test", evidenceIds: [], createdAt: now, updatedAt: now, lifecycleState: "active" };
}
function records(stage = "active"): LiveRecord[] {
  return [
    record("contacts", "contact:a", actorId, { id: "contact:a", stage, version: 1 }),
    record("connections", "connection:a", actorId, { id: "connection:a", accountId: actorId, contactId: "contact:a", stage, activeGoal: "PRIVATE RELATIONSHIP GOAL", version: 1, createdAt: now, updatedAt: now }),
  ];
}
function task(overrides: Record<string, unknown> = {}, owner: string | null = actorId) {
  return record("tasks", "task:a", owner, { id: "task:a", connectionId: "connection:a", contactId: "contact:a", relationshipPurpose: "follow_up", status: "open", title: "PRIVATE TASK TITLE", dueAt: now, version: 1, createdAt: now, updatedAt: now, ...overrides });
}
const assess = (rows: LiveRecord[]) => assessRelationshipLifecycleMigration({ actorId, workspaceId, records: rows });

test("canonical active and archived contacts pass preflight without changing records", () => {
  for (const stage of ["active", "archived"]) {
    const input = records(stage);
    const before = structuredClone(input);
    const report = assess(input);
    assert.equal(report.readyForCutover, true);
    assert.deepEqual(report.counts, { contacts: 1, connections: 1, relationshipTasks: 0, ignored: 0 });
    assert.deepEqual(report.issues, []);
    assert.deepEqual(input, before);
  }
});

test("confirmed contacts need exactly one owned connection", () => {
  assert.deepEqual(assess(records().slice(0, 1)).issues, [{ code: "MISSING_CONNECTION", collectionName: "contacts", recordId: "contact:a" }]);
  const duplicate = records();
  duplicate.push({ ...duplicate[1], recordId: "connection:second", payload: { ...duplicate[1].payload, id: "connection:second" } });
  assert.ok(assess(duplicate).issues.some(({ code }) => code === "MULTIPLE_CONNECTIONS"));
});

test("payload claims and contact links never override missing or conflicting owners", () => {
  for (const index of [0, 1]) {
    for (const owner of [null, "actor:other"]) {
      const input = records();
      input[index].userId = owner;
      input.push(record("contact_actor_links", "link", actorId, { contactId: "contact:a", actorId }));
      const report = assess(input);
      assert.equal(report.readyForCutover, false);
      assert.ok(report.issues.some(({ code, recordId }) => recordId === input[index].recordId && code === (owner === null ? "MISSING_OWNER" : "OWNER_CONFLICT")));
    }
  }
});

test("missing versions need repair and malformed versions are never accepted as defaults", () => {
  for (const index of [0, 1, 2]) {
    for (const value of [undefined, null, 0, -1, 1.5, "1"]) {
      const input = [...records(), task()];
      input[index].payload.version = value;
      const report = assess(input);
      assert.equal(report.readyForCutover, false);
      assert.ok(report.issues.some(({ code, recordId }) => recordId === input[index].recordId && code === (value === undefined ? "MISSING_VERSION" : "INVALID_VERSION")));
    }
  }
});

test("only explicit dated relationship tasks satisfy follow-up and maintenance stages", () => {
  for (const [stage, purpose] of [["needs_follow_up", "follow_up"], ["nurture", "maintenance"]]) {
    assert.equal(assess([...records(stage), task({ relationshipPurpose: purpose })]).readyForCutover, true);
    for (const change of [{ relationshipPurpose: undefined }, { relationshipPurpose: "unknown" }, { dueAt: undefined }, { dueAt: "2026-02-30T01:00:00Z" }, { status: "completed" }]) {
      const report = assess([...records(stage), task({ relationshipPurpose: purpose, ...change })]);
      assert.equal(report.readyForCutover, false);
      assert.ok(report.issues.some(({ code }) => code === "MISSING_DATED_TASK"));
    }
  }
});

test("preflight reports absent goals and archived open tasks instead of inventing repairs", () => {
  const input = records();
  input[1].payload.activeGoal = " ";
  assert.ok(assess(input).issues.some(({ code }) => code === "MISSING_GOAL"));
  assert.ok(assess([...records("archived"), task()]).issues.some(({ code }) => code === "ARCHIVED_OPEN_TASKS"));
  assert.equal(assess([...records("archived"), task({ status: "completed" })]).readyForCutover, true);
});

test("legacy acquisition and unknown stages remain review cases even with a contact fallback", () => {
  for (const stage of ["captured", "reviewing", "unknown"]) {
    const input = records();
    input[1].payload.stage = stage;
    const report = assess(input);
    assert.equal(report.readyForCutover, false);
    assert.ok(report.issues.some(({ code }) => code === (stage === "unknown" ? "UNKNOWN_STAGE" : "ACQUISITION_REVIEW")));
  }
});

test("preflight rejects malformed payloads, mismatched ids and missing references", () => {
  const malformed = records();
  malformed[1].payload = null as unknown as Record<string, unknown>;
  assert.ok(assess(malformed).issues.some(({ code }) => code === "INVALID_RECORD"));
  const mismatch = records();
  mismatch[1].payload.id = "connection:other";
  assert.ok(assess(mismatch).issues.some(({ code }) => code === "INVALID_RECORD"));
  const missing = records();
  missing[1].payload.contactId = "contact:missing";
  assert.ok(assess(missing).issues.some(({ code }) => code === "INVALID_REFERENCE"));
});

test("foreign or malformed relationship tasks cannot satisfy a stage", () => {
  for (const invalid of [task({}, "actor:other"), task({}, null), task({ contactId: "contact:other" }), task({ connectionId: "connection:other" }), task({ status: "unknown" })]) {
    const report = assess([...records("needs_follow_up"), invalid]);
    assert.equal(report.readyForCutover, false);
    assert.ok(report.issues.some(({ code }) => ["OWNER_CONFLICT", "MISSING_OWNER", "INVALID_REFERENCE", "INVALID_TASK"].includes(code)));
    assert.ok(report.issues.some(({ code }) => code === "MISSING_DATED_TASK"));
  }
});

test("reports are order independent, scope explicit and free of private payload text", () => {
  const input = [...records("nurture"), task(), record("contacts", "contact:unrelated", "actor:other", { id: "contact:unrelated", version: null }), { ...task(), workspaceId: "workspace:other" }];
  const report = assess(input);
  assert.deepEqual(report, assess([...input].reverse()));
  assert.equal(report.counts.ignored, 2);
  const text = JSON.stringify(report);
  assert.equal(text.includes("PRIVATE"), false);
  assert.equal(text.includes("contact:unrelated"), false);
  assert.equal(text.includes("workspace:other"), false);
});

test("preflight rejects an unspecified actor or workspace", () => {
  for (const scope of [{ actorId: "", workspaceId }, { actorId, workspaceId: " " }]) {
    assert.throws(() => assessRelationshipLifecycleMigration({ ...scope, records: [] }), /scope/i);
  }
});

test("malformed task payloads and lifecycle fields cannot silently pass preflight", () => {
  const malformed = task();
  malformed.payload = null as unknown as Record<string, unknown>;
  assert.equal(assess([...records(), malformed]).readyForCutover, false);
  for (const override of [{ status: ["open"] }, { title: " " }, { createdAt: undefined }, { updatedAt: "2026-02-30T01:00:00Z" }]) {
    assert.ok(assess([...records(), task(override)]).issues.some(({ code }) => code === "INVALID_TASK"));
  }
  const invalidConnection = records();
  invalidConnection[1].payload.updatedAt = "invalid";
  assert.ok(assess(invalidConnection).issues.some(({ code }) => code === "INVALID_RECORD"));
});

test("valid but noncanonical task dates require normalization before indexed cutover", () => {
  const report = assess([...records("needs_follow_up"), task({ dueAt: "2026-08-21T10:00:00+09:00" })]);
  assert.equal(report.readyForCutover, false);
  assert.ok(report.issues.some(({ code, recordId }) => code === "NON_CANONICAL_DATE" && recordId === "task:a"));
});

test("generic tasks do not count as obligations but their relationship ownership must still match", () => {
  const own = task({ relationshipPurpose: undefined });
  assert.equal(assess([...records("archived"), own]).readyForCutover, true);
  for (const invalid of [task({ relationshipPurpose: undefined }, "actor:other"), task({ relationshipPurpose: undefined, contactId: "contact:other" })]) {
    const report = assess([...records("archived"), invalid]);
    assert.equal(report.readyForCutover, false);
    assert.ok(report.issues.some(({ code }) => code === "OWNER_CONFLICT" || code === "INVALID_REFERENCE"));
  }
});

test("optional active goals must remain readable in every stage", () => {
  for (const activeGoal of [123, " "]) {
    const input = records("archived");
    input[1].payload.activeGoal = activeGoal;
    assert.ok(assess(input).issues.some(({ code, recordId }) => code === "INVALID_RECORD" && recordId === "connection:a"));
  }
});

test("a foreign duplicate physical key blocks the scoped record without disclosing foreign fields", () => {
  const input = records();
  input.push({ ...input[1], userId: "actor:other", payload: { ...input[1].payload, accountId: "actor:other", activeGoal: "PRIVATE FOREIGN GOAL" } });
  const report = assess(input);
  assert.equal(report.readyForCutover, false);
  assert.ok(report.issues.some(({ code, recordId }) => code === "INVALID_RECORD" && recordId === "connection:a"));
  assert.deepEqual(report, assess([...input].reverse()));
  assert.equal(JSON.stringify(report).includes("PRIVATE"), false);
});

test("malformed explicit generic-task connection references are reported instead of ignored", () => {
  for (const connectionId of [" ", 123, null]) {
    const report = assess([...records(), task({ relationshipPurpose: undefined, connectionId })]);
    assert.equal(report.readyForCutover, false);
    assert.ok(report.issues.some(({ code, recordId }) => code === "INVALID_REFERENCE" && recordId === "task:a"));
  }
});
