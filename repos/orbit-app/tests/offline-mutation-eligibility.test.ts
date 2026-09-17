import assert from "node:assert/strict";
import test from "node:test";
import { isOfflineEligible, parseMutation } from "../src/data/sync/mutation-adapters";
import { OfflineDataPolicyRegistry } from "../src/data/offline/policy-registry";
import type { ScopePort } from "../src/data/offline/ports";

const facts = { actorPrivate: true, confirmed: true, connectionActive: true };
const command = { mutationId: "m1", kind: "note", entityId: "local:123e4567-e89b-42d3-a456-426614174000", operation: "create",
  baseRevision: null, patch: { body: "Hello" }, createdAt: "2026-09-16T00:00:00Z" };

test("only confirmed private operations from the four approved domains are eligible", () => {
  const allowed: Record<string, string[]> = {
    note: ["create", "update", "delete"], task: ["create", "update", "complete", "reopen", "cancel", "delete"],
    relationship_followup: ["update", "complete", "reopen", "cancel", "delete"], personal_schedule: ["create", "update", "delete"],
  };
  for (const [kind, operations] of Object.entries(allowed)) {
    for (const operation of operations) {
      assert.equal(isOfflineEligible(kind, operation, facts), true, `${kind}.${operation}`);
      assert.equal(isOfflineEligible(kind, operation, { ...facts, actorPrivate: false }), false);
      assert.equal(isOfflineEligible(kind, operation, { ...facts, confirmed: false }), false);
    }
  }
  for (const [kind, operation] of [["message", "create"], ["invitation", "send"], ["registration", "create"],
    ["appointment", "update"], ["profile", "update"], ["provider", "execute"], ["scan", "execute"],
    ["draft", "save"], ["task_suggestion", "accept"], ["task", "accept"], ["relationship_followup", "create"],
    ["note", "complete"], ["personal_schedule", "cancel"], ["unknown", "create"], ["toString", "create"], ["__proto__", "update"]] as const) {
    assert.equal(isOfflineEligible(kind, operation, facts), false, `${kind}.${operation}`);
  }
  assert.equal(isOfflineEligible("relationship_followup", "update", { ...facts, connectionActive: false }), false);
  assert.equal(isOfflineEligible("note", "create", { ...facts, connectionActive: false }), true);
});

test("strict mutation parsing accepts domain patches and retains opaque revisions and note text", () => {
  assert.deepEqual(parseMutation(command), command);
  const cases = [
    ["note", "update", { body: "  @Ada\n", mentions: [{ contactId: "c1", start: 2, end: 6, displayText: "@Ada" }], manualContactIds: ["c1"], eventIds: ["e1"] }],
    ["task", "create", { title: "Call", category: "personal", plannedDate: "2026-09-17", priority: "normal" }],
    ["task", "update", { dueAt: null, plannedDate: null, location: null }],
    ["relationship_followup", "update", { title: "Follow up" }],
    ["personal_schedule", "create", { title: "Focus", startsAt: "2026-09-17T09:00:00+09:00" }],
    ["personal_schedule", "update", { endsAt: null, location: null }],
  ] as const;
  for (const [kind, operation, patch] of cases) {
    const input = { ...command, kind, operation, entityId: operation === "create" ? command.entityId : "canonical:one",
      baseRevision: operation === "create" ? null : "  opaque revision/v2  ", patch };
    assert.deepEqual(parseMutation(input), input);
  }
  for (const kind of ["task", "relationship_followup"]) for (const operation of ["complete", "reopen", "cancel", "delete"]) {
    assert.equal(parseMutation({ ...command, kind, operation, entityId: "t1", baseRevision: "r1", patch: {} }).operation, operation);
  }
  for (const kind of ["note", "personal_schedule"]) {
    assert.equal(parseMutation({ ...command, kind, operation: "delete", entityId: "one", baseRevision: "r1", patch: {} }).operation, "delete");
  }
});

test("mutation parser rejects authority, credentials, binary, suggestions and unsupported fields", () => {
  for (const field of ["actorId", "workspaceId", "authorizationEpoch", "token", "cookie", "schemaVersion"]) {
    assert.throws(() => parseMutation({ ...command, [field]: "untrusted" }));
    assert.throws(() => parseMutation({ ...command, patch: { body: "Hello", [field]: "untrusted" } }));
  }
  for (const patch of [{ body: "Hello", bytes: [1, 2] }, { body: { token: "secret" } },
    { body: "Hello", mentions: [{ contactId: "c", start: 0, end: 1, displayText: "H", cookie: "secret" }] },
    { body: "Hello", attachment: "data:image/png;base64,AA==" }, { body: "" }]) {
    assert.throws(() => parseMutation({ ...command, patch }));
  }
  for (const patch of [{ title: "x", category: "event" }, { title: "x", category: "meeting" },
    { title: "x", category: "personal", suggestionId: "s1" }, { title: "x", category: "personal", relatedEventId: "e1" }]) {
    assert.throws(() => parseMutation({ ...command, kind: "task", patch }));
  }
  assert.throws(() => parseMutation({ ...command, kind: "relationship_followup" }));
  assert.throws(() => parseMutation({ ...command, kind: "profile" }));
  assert.throws(() => parseMutation({ ...command, operation: "accept" }));
});

test("mutation parser rejects missing revisions, invalid dates, empty patches and inconsistent mentions", () => {
  for (const input of [
    { ...command, mutationId: " " }, { ...command, createdAt: "yesterday" },
    { ...command, entityId: "server-id" }, { ...command, baseRevision: "r1" },
    { ...command, operation: "update", baseRevision: null },
    { ...command, operation: "update", baseRevision: " ", entityId: "n1" },
    { ...command, operation: "update", baseRevision: "r1", entityId: "n1", patch: {} },
    { ...command, operation: "delete", baseRevision: "r1", entityId: "n1", patch: { body: "x" } },
    { ...command, patch: { body: "Hello", mentions: [{ contactId: "c", start: 0, end: 2, displayText: "wrong" }] } },
    { ...command, kind: "task", patch: { title: "x", category: "personal", plannedDate: "2026-02-30" } },
    { ...command, kind: "personal_schedule", patch: { title: "x", startsAt: "2026-09-17T09:00:00Z", endsAt: "2026-09-17T08:00:00Z" } },
  ]) assert.throws(() => parseMutation(input));
});

test("create entity IDs require a complete local UUID", () => {
  for (const entityId of [
    "local:",
    "local:x",
    "local:123e4567-e89b-12d3-a456",
    "LOCAL:123e4567-e89b-42d3-a456-426614174000",
  ]) {
    assert.throws(() => parseMutation({ ...command, entityId }));
  }
  assert.equal(parseMutation({
    ...command,
    entityId: "local:123E4567-E89B-42D3-A456-426614174000",
  }).entityId, "local:123E4567-E89B-42D3-A456-426614174000");
});

test("note body and task title updates reject whitespace-only text", () => {
  assert.throws(() => parseMutation({
    ...command,
    operation: "update",
    baseRevision: "r1",
    entityId: "n1",
    patch: { body: "   \n" },
  }));
  assert.throws(() => parseMutation({
    ...command,
    kind: "task",
    operation: "update",
    baseRevision: "r1",
    entityId: "t1",
    patch: { title: "   \t" },
  }));
});

test("local-read capability never supplies online authority and an unbound registry denies reads", async () => {
  const scope = {};
  const port: ScopePort = { assertLocalRead: () => {}, storageKey: () => "verified-scope-key", isActive: () => true,
    requireOnline: async () => { throw Error("online-required"); } };
  port.assertLocalRead(scope, "note");
  assert.equal(isOfflineEligible("note", "create", facts), true);
  await assert.rejects(port.requireOnline(scope, "note"), /online-required/);
  assert.throws(() => new OfflineDataPolicyRegistry().resolve("GET", "/api/notes", "read"), /policy-not-registered/);
});
