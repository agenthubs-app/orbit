import assert from "node:assert/strict";
import test from "node:test";

import {
  createAiSessionGroup,
  deleteAiSessionGroup,
  renameAiSessionGroup,
  updateAiSessionOrganization,
} from "../src/api/ai-session-management";
import type { OrbitApiClient } from "../src/api/client";

const meta = { featureMode: "mock", privacy: "test", runtimeBoundary: "test" };
const group = {
  createdAt: "2026-09-15T00:00:00.000Z",
  id: "group:work",
  name: "Work",
  revision: 1,
  updatedAt: "2026-09-15T00:00:00.000Z",
};
const session = {
  createdAt: "2026-09-15T00:00:00.000Z",
  id: "session:one",
  messages: [{ role: "user", text: "Plan launch" }],
  organization: { customTitle: "Launch", groupId: group.id, pinned: true, revision: 2 },
  pinned: true,
  title: "Launch",
  updatedAt: "2026-09-15T00:01:00.000Z",
};

test("App session management sends narrow revisioned mutations and accepts persisted receipts", async () => {
  const calls: Array<{ body: unknown; method: string; path: string }> = [];
  const result = (data: unknown) => ({ data, meta, status: 200, success: true as const });
  const client = {
    baseUrl: "https://orbit.test",
    delete: async (path: string, options?: { body?: unknown }) => {
      calls.push({ body: options?.body, method: "DELETE", path });
      return result({ deleted: true, id: group.id, ungroupedCount: 61 });
    },
    get: async () => result({}),
    patch: async (path: string, options?: { body?: unknown }) => {
      calls.push({ body: options?.body, method: "PATCH", path });
      return result(path.includes("sessions") ? { session, storage: { configured: true, persisted: true, source: "test" } } : { group: { ...group, name: "Work renamed", revision: 2 } });
    },
    post: async (path: string, options?: { body?: unknown }) => {
      calls.push({ body: options?.body, method: "POST", path });
      return { ...result({ group }), status: 201 };
    },
    put: async () => result({}),
  } as unknown as OrbitApiClient;

  assert.equal((await createAiSessionGroup(client, { id: group.id, mutationId: "mutation:create", name: group.name })).ok, true);
  assert.equal((await updateAiSessionOrganization(client, session.id, { expectedRevision: 1, mutationId: "mutation:session", patch: { groupId: group.id, pinned: true } })).ok, true);
  assert.equal((await renameAiSessionGroup(client, group.id, { expectedRevision: 1, mutationId: "mutation:rename", name: "Work renamed" })).ok, true);
  assert.equal((await deleteAiSessionGroup(client, group.id, { expectedRevision: 2, mutationId: "mutation:delete" })).ok, true);
  assert.deepEqual(calls, [
    { body: { id: group.id, mutationId: "mutation:create", name: group.name }, method: "POST", path: "/api/ai/conversations/groups" },
    { body: { expectedRevision: 1, mutationId: "mutation:session", patch: { groupId: group.id, pinned: true } }, method: "PATCH", path: "/api/ai/conversations/sessions/session%3Aone" },
    { body: { expectedRevision: 1, mutationId: "mutation:rename", name: "Work renamed" }, method: "PATCH", path: "/api/ai/conversations/groups/group%3Awork" },
    { body: { expectedRevision: 2, mutationId: "mutation:delete" }, method: "DELETE", path: "/api/ai/conversations/groups/group%3Awork" },
  ]);
});

test("App session management keeps a conflict visible", async () => {
  const client = {
    patch: async () => ({ error: { code: "CONFLICT", message: "当前状态已经变化，请刷新后再试。" }, meta, status: 409, success: false as const }),
  } as unknown as OrbitApiClient;
  const result = await updateAiSessionOrganization(client, "session:one", {
    expectedRevision: 1,
    mutationId: "mutation:conflict",
    patch: { pinned: true },
  });
  assert.deepEqual(result, { error: "当前状态已经变化，请刷新后再试。", ok: false });
});
