import assert from "node:assert/strict";
import test from "node:test";

import {
  resolveAuthenticatedApiActorIdentity,
} from "../../app/api/_shared/authenticated-actor";
import type {
  LiveAccountSessionGraph,
} from "../../features/account/storage/account-live-record-provider";

const graph: LiveAccountSessionGraph = {
  accounts: [
    {
      id: "account:a",
      name: "Account A",
      createdAt: "2026-07-28T00:00:00.000Z",
      updatedAt: "2026-07-28T00:00:00.000Z",
    },
    {
      id: "account:b",
      name: "Account B",
      createdAt: "2026-07-28T00:00:00.000Z",
      updatedAt: "2026-07-28T00:00:00.000Z",
    },
  ],
  evidenceIds: ["evidence:account-membership"],
  generatedAt: "2026-07-28T00:00:00.000Z",
  profiles: [
    {
      id: "profile:a",
      accountId: "account:a",
      displayName: "Actor A",
      createdAt: "2026-07-28T00:00:00.000Z",
      updatedAt: "2026-07-28T00:00:00.000Z",
    },
    {
      id: "profile:b",
      accountId: "account:b",
      displayName: "Actor B",
      createdAt: "2026-07-28T00:00:00.000Z",
      updatedAt: "2026-07-28T00:00:00.000Z",
    },
  ],
};

test("authenticated actor resolves a profile subject to its owning account", () => {
  const actor = resolveAuthenticatedApiActorIdentity({
    graph,
    mode: "live",
    session: {
      email: "actor-a@example.test",
      name: "Actor A",
      userId: "profile:a",
    },
    workspaceId: "workspace:shared",
  });

  assert.deepEqual(actor, {
    accountId: "account:a",
    email: "actor-a@example.test",
    id: "account:a",
    name: "Actor A",
    profileId: "profile:a",
    userId: "profile:a",
    workspaceId: "workspace:shared",
  });
});

test("authenticated actor accepts a legacy account subject without selecting another account", () => {
  const actor = resolveAuthenticatedApiActorIdentity({
    graph,
    mode: "live",
    session: {
      userId: "account:b",
    },
    workspaceId: "workspace:shared",
  });

  assert.equal(actor?.id, "account:b");
  assert.equal(actor?.profileId, "profile:b");
  assert.equal(actor?.userId, "account:b");
});

test("authenticated actor fails closed when the session has no persisted membership", () => {
  const actor = resolveAuthenticatedApiActorIdentity({
    graph,
    mode: "live",
    session: {
      userId: "profile:unknown",
    },
    workspaceId: "workspace:shared",
  });

  assert.equal(actor, null);
});

test("mock actor remains self-owned when no live membership graph exists", () => {
  const actor = resolveAuthenticatedApiActorIdentity({
    graph: null,
    mode: "mock",
    session: {
      userId: "mock:user",
    },
    workspaceId: "workspace:mock",
  });

  assert.equal(actor?.id, "mock:user");
  assert.equal(actor?.accountId, "mock:user");
});
