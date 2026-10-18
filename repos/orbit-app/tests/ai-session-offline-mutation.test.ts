import assert from "node:assert/strict";
import test from "node:test";

test("an offline iOrbit rename keeps its revision and mutation id in the frozen request", async () => {
  const module: any = await import("../src/data/sync/ai-session-outbox-mutation").catch(() => ({}));
  assert.equal(typeof module.buildOfflineAiSessionMutation, "function", "offline iOrbit mutation builder exists");
  const { buildOfflineAiSessionMutation, parseOfflineAiSessionRequest } = module;
  const queued = buildOfflineAiSessionMutation({
    mutationId: "rename-1",
    sessionId: "session-1",
    expectedRevision: 3,
    patch: { customTitle: "Osaka follow-up" },
    createdAt: "2026-10-18T09:00:00.000Z",
  });

  assert.equal(queued.domainId, "ai-sessions");
  assert.equal(queued.kind, "ai_session");
  assert.equal(queued.operation, "update");
  assert.equal(queued.baseRevision, "3");
  assert.deepEqual(JSON.parse(queued.requestJson), {
    expectedRevision: 3,
    mutationId: "rename-1",
    patch: { customTitle: "Osaka follow-up" },
  });
  assert.deepEqual(parseOfflineAiSessionRequest(queued).requestBody, {
    expectedRevision: 3,
    mutationId: "rename-1",
    patch: { customTitle: "Osaka follow-up" },
  });
});

test("a changed request cannot be uploaded under the queued iOrbit mutation id", async () => {
  const module: any = await import("../src/data/sync/ai-session-outbox-mutation").catch(() => ({}));
  assert.equal(typeof module.buildOfflineAiSessionMutation, "function", "offline iOrbit mutation builder exists");
  const { buildOfflineAiSessionMutation, parseOfflineAiSessionRequest } = module;
  const queued = buildOfflineAiSessionMutation({
    mutationId: "pin-1",
    sessionId: "session-1",
    expectedRevision: 0,
    patch: { pinned: true },
    createdAt: "2026-10-18T09:00:00.000Z",
  });

  assert.throws(() => parseOfflineAiSessionRequest({ ...queued, requestJson: JSON.stringify({
    expectedRevision: 0,
    mutationId: "pin-2",
    patch: { pinned: true },
  }) }), /mutation/i);
  assert.throws(() => parseOfflineAiSessionRequest({ ...queued, requestJson: JSON.stringify({
    expectedRevision: 9,
    mutationId: "pin-1",
    patch: { pinned: true },
  }) }), /revision/i);
});

test("a queued offline rename appears in the local history until the server answers", async () => {
  const { buildOfflineAiSessionMutation } = await import("../src/data/sync/ai-session-outbox-mutation");
  const module: any = await import("../src/view-models/ai-sessions-local");
  assert.equal(typeof module.overlayAiSessionMutations, "function");
  const row = { id: "session-1", title: "Original", firstUserText: "Hello", lastMessagePreview: "Hi",
    createdAt: "2026-10-18T09:00:00.000Z", updatedAt: "2026-10-18T09:00:00.000Z", messageRevision: 2,
    organization: { customTitle: null, groupId: null, pinned: false, revision: 0 } };
  const mutation = buildOfflineAiSessionMutation({ mutationId: "rename-1", sessionId: "session-1", expectedRevision: 0,
    patch: { customTitle: "After Osaka" }, createdAt: "2026-10-18T09:00:00.000Z" });
  const queued = { ...mutation, actorId: "actor-1", workspaceId: "workspace-1", state: "queued", attemptCount: 0,
    firstAttemptAt: null, serverSnapshot: null, dependsOn: null };

  const pending = module.overlayAiSessionMutations([row], [queued]);
  assert.equal(pending[0].organization.customTitle, "After Osaka");
  assert.deepEqual(module.localAiSessionPage(pending, { q: "After Osaka" }).items.map((item: { id: string }) => item.id), ["session-1"]);
  assert.equal(module.overlayAiSessionMutations([row], [{ ...queued, state: "conflict" }])[0].organization.customTitle, null);
});

test("an offline delete hides a mirrored session while its five-second local undo can cancel it", async () => {
  const module: any = await import("../src/data/sync/ai-session-outbox-mutation");
  const rows: any = await import("../src/view-models/ai-sessions-local");
  assert.equal(typeof module.buildOfflineAiSessionDelete, "function");
  const queued = module.buildOfflineAiSessionDelete({ mutationId: "delete-1", sessionId: "session-1",
    expectedRevision: 3, createdAt: "2026-10-18T09:00:00.000Z" });
  assert.equal(queued.operation, "delete");
  assert.equal(Date.parse(queued.nextRetryAt) - Date.parse(queued.createdAt), 5000);
  assert.deepEqual(module.parseOfflineAiSessionDelete(queued), { sessionId: "session-1", expectedRevision: 3, mutationId: "delete-1" });
  const row = { id: "session-1", organization: { revision: 3 } };
  assert.deepEqual(rows.overlayAiSessionMutations([row], [{ ...queued, state: "queued" }]), []);
  assert.deepEqual(rows.overlayAiSessionMutations([row], [{ ...queued, state: "conflict" }]), [row]);
});
