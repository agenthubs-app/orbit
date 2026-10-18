import assert from "node:assert/strict";
import test from "node:test";
import { buildOfflineAiSessionDelete, buildOfflineAiSessionMutation } from "../src/data/sync/ai-session-outbox-mutation";
import type { SyncRecord } from "../src/api/contract/sync";
import type { LocalSyncQueuedMutation } from "../src/data/sync/local-sync-repository";
import { uploadAllOutboxes } from "../src/data/sync/upload-outboxes";

const at = "2026-10-18T09:00:00.000Z";
const organization = { customTitle: null, groupId: null, pinned: false, revision: 0 };
const mirror: SyncRecord<Record<string, unknown>> = {
  actorId: "actor-1", workspaceId: "workspace-1", kind: "ai_session", id: "session-1",
  revision: "r1", updatedAt: at, deletedAt: null, syncState: "synced", aiVisibility: "excluded",
  payload: { id: "session-1", title: "Original", firstUserText: "Hello", lastMessagePreview: "Hi",
    createdAt: at, updatedAt: at, messageCount: 2, messageRevision: 2, organization },
};

function fixture() {
  const mutation = buildOfflineAiSessionMutation({ mutationId: "pin-1", sessionId: "session-1", expectedRevision: 0,
    patch: { pinned: true }, createdAt: at });
  let row: LocalSyncQueuedMutation | null = { ...mutation, actorId: "actor-1", workspaceId: "workspace-1", state: "queued",
    attemptCount: 0, firstAttemptAt: null, serverSnapshot: null, dependsOn: null };
  let acknowledged: SyncRecord | null = null;
  let failure: { state: string; errorCode: string } | null = null;
  const repository = {
    async getLease() { return null; },
    async listQueuedMutations(query: { domainId?: string }) { return row && query.domainId === "ai-sessions" ? [row] : []; },
    async beginOutboxMutationAttempt() { return row; },
    async acknowledgeOutboxMutation(input: { record: SyncRecord }) { acknowledged = input.record; row = null; },
    async markOutboxMutationFailure(input: { state: string; errorCode: string }) { failure = input; row = null; },
    async getRecord() { return mirror; },
  };
  return { repository, get acknowledged() { return acknowledged; }, get failure() { return failure; } };
}

test("the App reconnect round includes queued iOrbit organization edits", async () => {
  const state = fixture();
  await uploadAllOutboxes({
    actorId: "actor-1", baseUrl: "https://host.example", workspaceId: "workspace-1", signal: new AbortController().signal,
    repository: state.repository as any, syncClient: {} as any,
    writeClient: { async patch() { return { success: true, status: 200, data: { session: { id: "session-1", title: "Original",
      createdAt: at, updatedAt: at, messages: [{ role: "user", text: "Hello" }],
      organization: { ...organization, pinned: true, revision: 1 }, pinned: true },
      storage: { configured: true, persisted: true, source: "local" } } }; } } as any,
  });
  assert.equal((state.acknowledged?.payload as Record<string, unknown>)?.organization &&
    ((state.acknowledged?.payload as Record<string, unknown>).organization as Record<string, unknown>).pinned, true);
});

test("reconnect sends the frozen iOrbit PATCH and applies its organization receipt to the mirror", async () => {
  const module: any = await import("../src/data/sync/ai-session-outbox-upload").catch(() => ({}));
  assert.equal(typeof module.createAiSessionOutboxUploader, "function");
  const state = fixture();
  const requests: unknown[] = [];
  const uploader = module.createAiSessionOutboxUploader({
    actorId: "actor-1", baseUrl: "https://host.example", workspaceId: "workspace-1", repository: state.repository,
    writeClient: { async patch(path: string, options: { body: unknown }) {
      requests.push([path, options.body]);
      return { success: true, status: 200, data: { session: { id: "session-1", title: "Original",
        createdAt: at, updatedAt: at, messages: [{ role: "user", text: "Hello" }],
        organization: { ...organization, pinned: true, revision: 1 }, pinned: true },
        storage: { configured: true, persisted: true, source: "local" } } };
    } },
  });
  const result = await uploader.run();
  assert.equal(result.acknowledged, 1);
  assert.deepEqual(requests, [["/api/ai/conversations/sessions/session-1", {
    expectedRevision: 0, mutationId: "pin-1", patch: { pinned: true },
  }]]);
  assert.deepEqual((state.acknowledged?.payload as Record<string, unknown>)?.organization,
    { customTitle: null, groupId: null, pinned: true, revision: 1 });
});

test("a server PIN_LIMIT receipt stays a visible conflict, not a retried write", async () => {
  const module: any = await import("../src/data/sync/ai-session-outbox-upload").catch(() => ({}));
  assert.equal(typeof module.createAiSessionOutboxUploader, "function");
  const state = fixture();
  const uploader = module.createAiSessionOutboxUploader({
    actorId: "actor-1", baseUrl: "https://host.example", workspaceId: "workspace-1", repository: state.repository,
    writeClient: { async patch() { return { success: false, status: 409, error: { code: "PIN_LIMIT", message: "Five pins" } }; } },
  });
  const result = await uploader.run();
  assert.equal(result.conflicts, 1);
  assert.equal(state.failure?.state, "conflict");
  assert.equal(state.failure?.errorCode, "PIN_LIMIT");
  assert.equal(state.acknowledged, null);
});

test("after local undo expires, reconnect DELETE hides the mirrored session on server acknowledgement", async () => {
  const { createAiSessionOutboxUploader } = await import("../src/data/sync/ai-session-outbox-upload");
  const mutation = buildOfflineAiSessionDelete({ mutationId: "delete-1", sessionId: "session-1", expectedRevision: 0, createdAt: at });
  let row: LocalSyncQueuedMutation | null = { ...mutation, actorId: "actor-1", workspaceId: "workspace-1", state: "queued",
    attemptCount: 0, firstAttemptAt: null, serverSnapshot: null, dependsOn: null };
  let acknowledged: SyncRecord | null = null;
  const requests: string[] = [];
  const uploader = createAiSessionOutboxUploader({
    actorId: "actor-1", baseUrl: "https://host.example", workspaceId: "workspace-1", now: () => Date.parse(at) + 6000,
    repository: {
      async listQueuedMutations() { return row ? [row] : []; },
      async beginOutboxMutationAttempt() { return row; },
      async acknowledgeOutboxMutation(input) { acknowledged = input.record; row = null; },
      async markOutboxMutationFailure() { throw new Error("DELETE should be acknowledged"); },
      async getRecord() { return mirror; },
    },
    writeClient: { async delete(path: string) { requests.push(path); return { success: true, status: 200,
      data: { deleted: true, undoToken: null, undoUntil: null, storage: { configured: true, persisted: true, source: "local" } } } as any; },
      async patch() { throw new Error("DELETE must not become PATCH"); } } as any,
  });
  const result = await uploader.run();
  assert.equal(result.acknowledged, 1);
  assert.deepEqual(requests, ["/api/ai/conversations/sessions/session-1"]);
  assert.equal((acknowledged as SyncRecord | null)?.deletedAt, new Date(Date.parse(at) + 6000).toISOString());
});
