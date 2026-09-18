import { strict as assert } from "node:assert";
import { test } from "node:test";

import { createMemoryLiveRecordStore } from "../../shared/storage/live-record-store";
import type { EntityDraft } from "../../features/orbit-ai/entity-drafts/contract";
import {
  createLiveRecordEntityDraftRepository,
  entityDraftFromRecord,
  ENTITY_DRAFT_COLLECTION,
} from "../../features/orbit-ai/entity-drafts/live-record-repository";

const WORKSPACE = "workspace:test";
const NOW = "2026-09-19T02:00:00.000Z";

function draft(overrides: Partial<EntityDraft> = {}): EntityDraft {
  return {
    actorId: "actor:one",
    conversationId: "conversation:one",
    createdAt: NOW,
    draftId: "draft:1",
    fields: { title: "跟进林玫" },
    kind: "task",
    revision: 1,
    sourceRefs: [{ id: "note:1", kind: "note" }],
    state: "pending_confirmation",
    updatedAt: NOW,
    ...overrides,
  };
}

function repository() {
  const store = createMemoryLiveRecordStore<Record<string, unknown>>();
  return { repository: createLiveRecordEntityDraftRepository({ store, workspaceId: WORKSPACE }), store };
}

test("a saved draft reads back field for field", async () => {
  const { repository: repo } = repository();
  const saved = draft();
  await repo.save(saved);
  assert.deepEqual(await repo.get({ actorId: "actor:one", draftId: "draft:1" }), saved);
});

test("the pending draft is found by an indexed query, and stops being found once settled", async () => {
  const { repository: repo } = repository();
  await repo.save(draft());
  assert.equal((await repo.findPending({ actorId: "actor:one", conversationId: "conversation:one" }))?.draftId, "draft:1");

  await repo.save(draft({ createdRecordId: "task:1", state: "created" }));
  assert.equal(await repo.findPending({ actorId: "actor:one", conversationId: "conversation:one" }), null);
});

test("a draft in another conversation or another actor's is not pending here", async () => {
  const { repository: repo } = repository();
  await repo.save(draft());

  assert.equal(await repo.findPending({ actorId: "actor:one", conversationId: "conversation:two" }), null);
  assert.equal(await repo.findPending({ actorId: "actor:two", conversationId: "conversation:one" }), null);
  assert.equal(await repo.get({ actorId: "actor:two", draftId: "draft:1" }), null);
});

test("a row that cannot be read back as a draft is skipped, not guessed at", () => {
  const base = {
    collectionName: ENTITY_DRAFT_COLLECTION,
    createdAt: NOW,
    evidenceIds: [],
    lifecycleState: "active" as const,
    recordId: "draft:1",
    sourceId: "conversation:one",
    sourceType: "agent",
    updatedAt: NOW,
    userId: "actor:one",
    workspaceId: WORKSPACE,
  };
  const payload = {
    conversationId: "conversation:one", draftId: "draft:1",
    fields: { title: "x" }, kind: "task", revision: 1, state: "pending_confirmation",
  };

  assert.ok(entityDraftFromRecord({ ...base, payload }));
  assert.equal(entityDraftFromRecord({ ...base, payload: { ...payload, kind: "invoice" } }), null);
  assert.equal(entityDraftFromRecord({ ...base, payload: { ...payload, state: "approved" } }), null);
  assert.equal(entityDraftFromRecord({ ...base, payload: { ...payload, revision: 1.5 } }), null);
  assert.equal(entityDraftFromRecord({ ...base, payload: { ...payload, fields: {} } }), null, "a draft with no fields is corrupt, not empty");
  assert.equal(entityDraftFromRecord({ ...base, payload: { ...payload, fields: { title: "  " } } }), null);
  assert.equal(entityDraftFromRecord({ ...base, payload, userId: null }), null, "a draft with no owner is unreadable");
});
