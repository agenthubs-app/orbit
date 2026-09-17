import assert from "node:assert/strict";
import test from "node:test";

import type { AiReadPermission, ReadAdapter, ReadScope } from "../../features/orbit-ai/data-query/read-contract";
import {
  AI_READ_PERMISSIONS,
  AI_READ_TOOLS,
  assertAiReadAllowed,
  projectReadFields,
  resolveAiReadPermission,
  validateAiReadFields,
} from "../../features/orbit-ai/data-query/permission-registry";
import { createAiReadInputSchema } from "../../features/orbit-ai/data-query/query-schema";

const scope: ReadScope = {
  actorId: "actor:a",
  workspaceId: "workspace:a",
  authorizationEpoch: "epoch:1",
};

function permission(enabled: boolean): AiReadPermission {
  return {
    tool: "notes.query",
    domain: "notes",
    schemaVersion: 1,
    fields: ["title"],
    maxItems: 10,
    enabled: async () => enabled,
  };
}

function adapter(authorized: boolean): ReadAdapter {
  return {
    authorize: async () => authorized,
    page: async () => ({ rows: [], snapshot: "snapshot:1", partialReasons: [] }),
    authorizeEvidence: async () => [],
    readCurrentAtRevision: async () => [],
  };
}

test("offline eligibility cannot enable AI and unknown fields fail closed", async () => {
  await assert.rejects(assertAiReadAllowed(scope, permission(false), adapter(true)), /AI_NOT_AUTHORIZED/);
  assert.throws(() => projectReadFields({ title: "x", providerToken: "SECRET" }, ["title"]), /UNKNOWN_FIELD/);
  assert.deepEqual(projectReadFields({ title: "x" }, ["title"]), { title: "x" });

  for (const key of ["actorId", "workspaceId", "authorizationEpoch", "userId", "accountId", "profileId"]) {
    assert.equal(createAiReadInputSchema("notes.query").parse({ operation: "list", query: "notes", [key]: "b" }).success, false);
  }
});

test("both capability and source authorization are required for every read", async () => {
  await assert.rejects(assertAiReadAllowed(scope, permission(true), adapter(false)), /AI_NOT_AUTHORIZED/);
  await assert.rejects(
    assertAiReadAllowed({ ...scope, authorizationEpoch: "" }, permission(true), adapter(true)),
    /AI_NOT_AUTHORIZED/,
  );
  await assert.doesNotReject(assertAiReadAllowed(scope, permission(true), adapter(true)));
});

test("registry is complete, unique, disabled by default, and version strict", async () => {
  assert.equal(AI_READ_TOOLS.length, 13);
  assert.equal(new Set(AI_READ_TOOLS).size, 13);
  assert.deepEqual(AI_READ_PERMISSIONS.map((entry) => entry.tool), AI_READ_TOOLS);
  for (const entry of AI_READ_PERMISSIONS) {
    assert.equal(entry.schemaVersion, 1);
    assert.equal(entry.maxItems, 10);
    assert.equal(await entry.enabled(scope), false);
    assert.ok(entry.fields.length > 0);
  }
  assert.equal(resolveAiReadPermission("notes.query", 1).domain, "notes");
  assert.throws(() => resolveAiReadPermission("unknown.query", 1), /UNKNOWN_AI_READ_TOOL/);
  assert.throws(() => resolveAiReadPermission("notes.query", 2), /UNKNOWN_SCHEMA_VERSION/);
});

test("strict input rejects malformed pagination and tool-specific filters", () => {
  const notes = createAiReadInputSchema("notes.query");
  assert.equal(notes.parse({ operation: "list", query: "notes", limit: 0 }).success, false);
  assert.equal(notes.parse({ operation: "list", query: "notes", limit: 11 }).success, false);
  assert.equal(notes.parse({ operation: "get", query: "note" }).success, false);
  assert.equal(notes.parse({ operation: "list", query: "notes", cursor: "x".repeat(2_049) }).success, false);
  assert.equal(notes.parse({ operation: "list", query: "notes", status: "open" }).success, false);
  assert.equal(
    createAiReadInputSchema("tasks.query").parse({ operation: "list", query: "tasks", status: "open" }).success,
    true,
  );
  assert.equal(
    createAiReadInputSchema("events.query").parse({ operation: "list", query: "events", eventId: "event:1" }).success,
    true,
  );
});

test("tool projection schemas reject wrong types and nested unknown data", () => {
  assert.deepEqual(validateAiReadFields("notes.query", { title: "Note", contactIds: ["contact:1"] }), {
    title: "Note",
    contactIds: ["contact:1"],
  });
  assert.throws(() => validateAiReadFields("notes.query", { title: 42 }), /INVALID_FIELD/);
  assert.throws(() => validateAiReadFields("notifications.query", { sourceIds: [{ token: "SECRET" }] }), /INVALID_FIELD/);
  assert.throws(() => validateAiReadFields("agentData.query", { preferenceKey: "theme", hiddenPrompt: "SECRET" }), /INVALID_FIELD/);
});
