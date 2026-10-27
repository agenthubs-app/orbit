import assert from "node:assert/strict";
import test from "node:test";

import { createNoteAssociationReader } from "../../features/notes/association-reader";
import { createMemoryLiveRecordStore } from "../../shared/storage/live-record-store";

const contact = {
  id: "contact:ada", displayName: "Ada Lin", organization: "Orbit", role: "Founder", stage: "active" as const,
  source: { id: "source:ada", type: "manual" as const, label: "Manual", sourceId: "source:ada" }, evidenceIds: ["evidence:ada"] as const,
  createdAt: "2026-09-15T00:00:00.000Z", updatedAt: "2026-09-15T00:00:00.000Z",
};

test("association reader returns only actor-visible contacts and existing events", async () => {
  const store = createMemoryLiveRecordStore<Record<string, unknown>>([{
    workspaceId: "workspace:test", collectionName: "events", recordId: "event:one", sourceType: "manual", sourceId: "event:one",
    evidenceIds: [], lifecycleState: "active", createdAt: "2026-09-15T00:00:00.000Z", updatedAt: "2026-09-15T00:00:00.000Z", payload: {},
  }]);
  const reader = createNoteAssociationReader({
    store, workspaceId: "workspace:test",
    contactProvider: {
      source: "test", sourceLabel: "Test",
      async readContactGraph(actorId = "") { return { contacts: actorId === "account:one" ? [contact] : [], connections: [], evidence: [], generatedAt: contact.updatedAt }; },
      async readContactGraphForContact(id, actorId = "") { return { contacts: id === contact.id && actorId === "account:one" ? [contact] : [], connections: [], evidence: [], generatedAt: contact.updatedAt }; },
      async readContactGraphForList(_input, actorId = "") { return { contacts: actorId === "account:one" ? [contact] : [], connections: [], evidence: [], generatedAt: contact.updatedAt }; },
    },
  });
  assert.deepEqual(await reader.accessibleContactIds({ actorId: "account:one", ids: ["contact:ada", "contact:hidden"] }), ["contact:ada"]);
  assert.deepEqual(await reader.accessibleContactIds({ actorId: "account:two", ids: ["contact:ada"] }), []);
  assert.deepEqual(await reader.accessibleEventIds({ actorId: "account:one", ids: ["event:one", "event:missing"] }), ["event:one"]);
  assert.deepEqual(await reader.searchContactIds({ actorId: "account:one", query: "Ada" }), ["contact:ada"]);
});

test("association reader also accepts the actor's own event-operations events, and only those", async () => {
  const store = createMemoryLiveRecordStore<Record<string, unknown>>([]);
  const queries: unknown[][] = [];
  const reader = createNoteAssociationReader({
    store, workspaceId: "workspace:test",
    contactProvider: { source: "test", sourceLabel: "Test", async readContactGraph() { return { contacts: [], connections: [], evidence: [], generatedAt: contact.updatedAt }; } },
    eventOps: {
      async query<TRow>(_text: string, values: readonly unknown[] = []) {
        queries.push([...values]);
        const [workspaceId, actorId, ids] = values as [string, string, string[]];
        const mine = workspaceId === "workspace:test" && actorId === "account:one" ? ["event_signup_01"] : [];
        return { rows: ids.filter((id) => mine.includes(id)).map((event_id) => ({ event_id })) as unknown as TRow[] };
      },
    },
  });
  assert.deepEqual(await reader.accessibleEventIds({ actorId: "account:one", ids: ["event_signup_01", "event_signup_02"] }), ["event_signup_01"]);
  assert.deepEqual(await reader.accessibleEventIds({ actorId: "account:two", ids: ["event_signup_01"] }), []);
  assert.deepEqual(queries[0], ["workspace:test", "account:one", ["event_signup_01", "event_signup_02"]]);
});
