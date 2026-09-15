import assert from "node:assert/strict";
import test from "node:test";

import {
  createMemoryOrbitAgentChatOrganizationStore,
  OrbitAgentChatOrganizationError,
} from "../../features/orbit-ai/storage/orbit-agent-chat-session-transactions";
import { createMemoryLiveRecordStore } from "../../shared/storage/live-record-store";

test("organization mutations are actor scoped, CAS protected, and idempotent", async () => {
  const records = createMemoryLiveRecordStore<Record<string, unknown>>();
  const alice = createMemoryOrbitAgentChatOrganizationStore({
    actorId: "actor:alice",
    store: records,
    workspaceId: "workspace:test",
  });
  const bob = createMemoryOrbitAgentChatOrganizationStore({
    actorId: "actor:bob",
    store: records,
    workspaceId: "workspace:test",
  });

  const group = await alice.createGroup({
    id: "group:launch",
    mutationId: "mutation:create-launch",
    name: "Launch",
  });
  assert.equal(group.revision, 1);
  assert.equal(
    (
      await alice.createGroup({
        id: "group:launch-two",
        mutationId: "mutation:create-launch-two",
        name: "Launch",
      })
    ).name,
    "Launch",
  );
  assert.deepEqual(
    await alice.createGroup({
      id: "group:launch",
      mutationId: "mutation:create-launch",
      name: "Launch",
    }),
    group,
  );
  assert.equal(await bob.getGroup("group:launch"), null);

  const organization = await alice.mutateSessionOrganization(
    "session:one",
    {
      expectedRevision: 0,
      mutationId: "mutation:organize-one",
      patch: { customTitle: "Launch notes", groupId: group.id, pinned: true },
    },
  );
  assert.deepEqual(organization, {
    customTitle: "Launch notes",
    groupId: group.id,
    pinned: true,
    revision: 1,
  });
  assert.deepEqual(
    await alice.mutateSessionOrganization("session:one", {
      expectedRevision: 0,
      mutationId: "mutation:organize-one",
      patch: { customTitle: "Launch notes", groupId: group.id, pinned: true },
    }),
    organization,
  );

  await assert.rejects(
    alice.mutateSessionOrganization("session:one", {
      expectedRevision: 0,
      mutationId: "mutation:stale",
      patch: { pinned: false },
    }),
    (error) =>
      error instanceof OrbitAgentChatOrganizationError &&
      error.code === "REVISION_CONFLICT",
  );
  await assert.rejects(
    alice.mutateSessionOrganization("session:two", {
      expectedRevision: 0,
      mutationId: "mutation:missing-group",
      patch: { groupId: "group:missing" },
    }),
    (error) =>
      error instanceof OrbitAgentChatOrganizationError &&
      error.code === "GROUP_NOT_FOUND",
  );
});

test("deleting a group atomically ungroups every session, including more than one page", async () => {
  const store = createMemoryOrbitAgentChatOrganizationStore({
    actorId: "actor:owner",
    workspaceId: "workspace:delete-group",
  });
  const group = await store.createGroup({
    id: "group:large",
    mutationId: "mutation:create-large",
    name: "Large group",
  });

  await Promise.all(
    Array.from({ length: 61 }, (_, index) =>
      store.mutateSessionOrganization(`session:${index}`, {
        expectedRevision: 0,
        mutationId: `mutation:move:${index}`,
        patch: { groupId: group.id },
      }),
    ),
  );

  const deleted = await store.deleteGroup(group.id, {
    expectedRevision: group.revision,
    mutationId: "mutation:delete-large",
  });
  assert.deepEqual(deleted, { deleted: true, id: group.id, ungroupedCount: 61 });
  assert.deepEqual(
    await store.deleteGroup(group.id, {
      expectedRevision: group.revision,
      mutationId: "mutation:delete-large",
    }),
    deleted,
  );
  const organizations = await store.listSessionOrganizations(
    Array.from({ length: 61 }, (_, index) => `session:${index}`),
  );
  assert.equal(organizations.size, 61);
  assert.equal([...organizations.values()].every((item) => item.groupId === null), true);
});

test("memory organization transactions roll back every write when commit fails", async () => {
  let failCommit = false;
  const store = createMemoryOrbitAgentChatOrganizationStore({
    actorId: "actor:rollback",
    beforeCommit: () => {
      if (failCommit) throw new Error("injected commit failure");
    },
    workspaceId: "workspace:rollback",
  });
  const group = await store.createGroup({
    id: "group:rollback",
    mutationId: "mutation:create-rollback",
    name: "Rollback",
  });
  await store.mutateSessionOrganization("session:a", {
    expectedRevision: 0,
    mutationId: "mutation:move-a",
    patch: { groupId: group.id },
  });
  await store.mutateSessionOrganization("session:b", {
    expectedRevision: 0,
    mutationId: "mutation:move-b",
    patch: { groupId: group.id },
  });

  failCommit = true;
  await assert.rejects(
    store.deleteGroup(group.id, {
      expectedRevision: group.revision,
      mutationId: "mutation:delete-rollback",
    }),
    /injected commit failure/,
  );
  failCommit = false;

  assert.equal((await store.getGroup(group.id))?.name, "Rollback");
  assert.equal((await store.getSessionOrganization("session:a")).groupId, group.id);
  assert.equal((await store.getSessionOrganization("session:b")).groupId, group.id);
});
