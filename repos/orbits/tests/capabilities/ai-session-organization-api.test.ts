import assert from "node:assert/strict";
import test from "node:test";

import { createOrbitAgentChatSessionHandlers } from "../../app/api/ai/conversations/sessions/[id]/handler";
import { createOrbitAgentChatSessionsHandlers } from "../../app/api/ai/conversations/sessions/handler";
import { createOrbitAgentChatGroupsHandlers } from "../../app/api/ai/conversations/groups/handler";
import { createOrbitAgentChatGroupHandlers } from "../../app/api/ai/conversations/groups/[id]/handler";
import { createMemoryOrbitAgentChatOrganizationStore } from "../../features/orbit-ai/storage/orbit-agent-chat-session-transactions";
import { createStorageOrbitAgentChatSessionProvider } from "../../features/orbit-ai/storage/orbit-agent-chat-session-live-record-provider";
import { createMemoryLiveRecordStore } from "../../shared/storage/live-record-store";

function request(path: string, method = "GET", body?: unknown) {
  return new Request(`https://orbit.local${path}`, {
    body: body === undefined ? undefined : JSON.stringify(body),
    headers: body === undefined ? undefined : { "content-type": "application/json" },
    method,
  });
}

test("organization APIs create groups, patch sessions, filter, search, and paginate deterministically", async () => {
  const actorId = "actor:api-owner";
  const provider = createStorageOrbitAgentChatSessionProvider({
    actorId,
    store: createMemoryLiveRecordStore<Record<string, unknown>>(),
    workspaceId: "workspace:api",
  });
  const organizationStore = createMemoryOrbitAgentChatOrganizationStore({
    actorId,
    now: () => "2026-09-15T00:00:00.000Z",
    workspaceId: "workspace:api",
  });
  const dependencies = {
    organizationStoreForActor: () => organizationStore,
    providerForActor: () => provider,
    resolveActor: async () => ({ id: actorId }),
  };
  const groups = createOrbitAgentChatGroupsHandlers(dependencies);
  const groupItems = createOrbitAgentChatGroupHandlers(dependencies);
  const sessions = createOrbitAgentChatSessionsHandlers(dependencies);
  const sessionItems = createOrbitAgentChatSessionHandlers(dependencies);

  const createResponse = await groups.POST(
    request("/api/ai/conversations/groups", "POST", {
      id: "group:alpha",
      mutationId: "mutation:create-alpha",
      name: "Alpha",
    }),
  );
  const created = (await createResponse.json()).data.group;
  assert.equal(createResponse.status, 201);
  assert.equal(created.name, "Alpha");

  for (let index = 0; index < 55; index += 1) {
    const stamp = index < 2 ? "2026-09-15T01:00:00.000Z" : `2026-09-14T${String(index % 24).padStart(2, "0")}:00:00.000Z`;
    await provider.upsertSession({
      createdAt: stamp,
      id: `session:${String(index).padStart(2, "0")}`,
      messages: [{ id: `message:${index}`, role: "user", text: index === 54 ? "Needle project" : `Message ${index}` }],
      title: `Session ${index}`,
      updatedAt: stamp,
    });
  }
  const patchResponse = await sessionItems.PATCH(
    request("/api/ai/conversations/sessions/session%3A54", "PATCH", {
      expectedRevision: 0,
      mutationId: "mutation:organize-54",
      patch: { customTitle: "Needle renamed", groupId: created.id, pinned: true },
    }),
    { params: Promise.resolve({ id: "session:54" }) },
  );
  const patched = (await patchResponse.json()).data.session;
  assert.equal(patchResponse.status, 200);
  assert.equal(patched.organization.revision, 1);
  assert.equal(patched.customTitle, "Needle renamed");
  assert.equal(patched.pinned, true);

  const searchResponse = await sessions.GET(
    request("/api/ai/conversations/sessions?q=needle&groupId=group%3Aalpha&pinned=true"),
  );
  const search = (await searchResponse.json()).data;
  assert.deepEqual(search.items.map((item: { id: string }) => item.id), ["session:54"]);
  assert.equal(search.nextCursor, null);

  const firstResponse = await sessions.GET(
    request("/api/ai/conversations/sessions?limit=50"),
  );
  const first = (await firstResponse.json()).data;
  assert.equal(first.items.length, 50);
  assert.equal(typeof first.nextCursor, "string");
  const secondResponse = await sessions.GET(
    request(`/api/ai/conversations/sessions?limit=50&cursor=${encodeURIComponent(first.nextCursor)}`),
  );
  const second = (await secondResponse.json()).data;
  assert.equal(second.items.length, 5);
  assert.equal(second.nextCursor, null);
  const allIds = [...first.items, ...second.items].map((item: { id: string }) => item.id);
  assert.equal(new Set(allIds).size, 55);
  assert.ok(allIds.indexOf("session:00") < allIds.indexOf("session:01"));

  const conflictResponse = await sessionItems.PATCH(
    request("/api/ai/conversations/sessions/session%3A54", "PATCH", {
      expectedRevision: 0,
      mutationId: "mutation:stale-54",
      patch: { pinned: false },
    }),
    { params: Promise.resolve({ id: "session:54" }) },
  );
  assert.equal(conflictResponse.status, 409);

  const renameResponse = await groupItems.PATCH(
    request("/api/ai/conversations/groups/group%3Aalpha", "PATCH", {
      expectedRevision: created.revision,
      mutationId: "mutation:rename-alpha",
      name: "Alpha renamed",
    }),
    { params: Promise.resolve({ id: created.id }) },
  );
  assert.equal(renameResponse.status, 200);
  assert.equal((await renameResponse.json()).data.group.name, "Alpha renamed");

  const deleteOnce = await sessionItems.DELETE(
    request("/api/ai/conversations/sessions/session%3A54", "DELETE"),
    { params: Promise.resolve({ id: "session:54" }) },
  );
  const deleteAgain = await sessionItems.DELETE(
    request("/api/ai/conversations/sessions/session%3A54", "DELETE"),
    { params: Promise.resolve({ id: "session:54" }) },
  );
  assert.equal((await deleteOnce.json()).data.deleted, true);
  assert.equal((await deleteAgain.json()).data.deleted, true);
  const lateSave = await sessions.POST(
    request("/api/ai/conversations/sessions", "POST", {
      createdAt: "2026-09-15T00:00:00.000Z",
      id: "session:54",
      messages: [{ role: "user", text: "Late save" }],
      title: "Late save",
      updatedAt: "2026-09-15T02:00:00.000Z",
    }),
  );
  assert.equal(lateSave.status, 410);
  assert.equal((await lateSave.json()).error.code, "CONFLICT");
});

test("organization APIs hide another actor's groups and sessions", async () => {
  const sessionRecords = createMemoryLiveRecordStore<Record<string, unknown>>();
  const organizationRecords = createMemoryLiveRecordStore<Record<string, unknown>>();
  const stores = new Map<string, ReturnType<typeof createMemoryOrbitAgentChatOrganizationStore>>();
  const providers = new Map<string, ReturnType<typeof createStorageOrbitAgentChatSessionProvider>>();
  for (const actorId of ["actor:alice", "actor:bob"]) {
    providers.set(actorId, createStorageOrbitAgentChatSessionProvider({ actorId, store: sessionRecords, workspaceId: "workspace:isolation" }));
    stores.set(actorId, createMemoryOrbitAgentChatOrganizationStore({ actorId, store: organizationRecords, workspaceId: "workspace:isolation" }));
  }
  await providers.get("actor:alice")!.upsertSession({
    createdAt: "2026-09-15T00:00:00.000Z",
    id: "session:private",
    messages: [{ role: "user", text: "Private" }],
    title: "Private",
    updatedAt: "2026-09-15T00:00:00.000Z",
  });
  await stores.get("actor:alice")!.createGroup({ id: "group:private", mutationId: "mutation:private", name: "Private" });

  const actorId = "actor:bob";
  const dependencies = {
    organizationStoreForActor: (_mode: unknown, id: string) => stores.get(id)!,
    providerForActor: (_mode: unknown, id: string) => providers.get(id)!,
    resolveActor: async () => ({ id: actorId }),
  };
  const groups = createOrbitAgentChatGroupsHandlers(dependencies);
  const sessions = createOrbitAgentChatSessionsHandlers(dependencies);
  const sessionItems = createOrbitAgentChatSessionHandlers(dependencies);

  assert.deepEqual((await (await groups.GET(request("/api/ai/conversations/groups"))).json()).data.groups, []);
  assert.deepEqual((await (await sessions.GET(request("/api/ai/conversations/sessions"))).json()).data.items, []);
  const patchResponse = await sessionItems.PATCH(
    request("/api/ai/conversations/sessions/session%3Aprivate", "PATCH", {
      expectedRevision: 0,
      mutationId: "mutation:intrude",
      patch: { pinned: true },
    }),
    { params: Promise.resolve({ id: "session:private" }) },
  );
  assert.equal(patchResponse.status, 404);
});
