import { strict as assert } from "node:assert";
import { test } from "node:test";

import {
  entityDraftIdempotencyKey,
  parseEntityDraftProposal,
  readEntityDraftIntent,
} from "../../features/orbit-ai/entity-drafts/contract";
import type { EntityDraft } from "../../features/orbit-ai/entity-drafts/contract";
import {
  createEntityDraftService,
  type EntityDraftRepository,
  type EntityDraftWriteAdapter,
} from "../../features/orbit-ai/entity-drafts/service";

const ACTOR = "actor:one";
const CONVERSATION = "conversation:one";
const NOW = "2026-09-19T02:00:00.000Z";

function memoryRepository(): EntityDraftRepository & { rows: Map<string, EntityDraft> } {
  const rows = new Map<string, EntityDraft>();
  return {
    rows,
    async findPending({ actorId, conversationId }) {
      for (const draft of rows.values()) {
        if (
          draft.actorId === actorId &&
          draft.conversationId === conversationId &&
          draft.state === "pending_confirmation"
        ) return draft;
      }
      return null;
    },
    async get({ actorId, draftId }) {
      const draft = rows.get(draftId);
      return draft && draft.actorId === actorId ? draft : null;
    },
    async save(draft) { rows.set(draft.draftId, draft); },
  };
}

function recordingAdapter(overrides: Partial<EntityDraftWriteAdapter> = {}) {
  const calls: { idempotencyKey: string; title: string }[] = [];
  const adapter: EntityDraftWriteAdapter = {
    kind: "task",
    async write({ draft, idempotencyKey }) {
      calls.push({ idempotencyKey, title: draft.fields.title ?? "" });
      return { recordId: `task:${calls.length}` };
    },
    ...overrides,
  };
  return { adapter, calls };
}

const PROPOSAL = {
  fields: { dueAt: "2026-09-20T09:00:00.000Z", title: "整理笔记的后续行动" },
  kind: "task",
  sourceRefs: [{ id: "note:1", kind: "note" }],
};

test("a proposal writes nothing until the user confirms it", async () => {
  const repository = memoryRepository();
  const { adapter, calls } = recordingAdapter();
  const service = createEntityDraftService({ adapters: [adapter], repository });

  const draft = await service.propose({
    actorId: ACTOR, conversationId: CONVERSATION, draftId: "draft:1", now: NOW, proposal: PROPOSAL,
  });

  assert.equal(draft?.state, "pending_confirmation");
  assert.equal(calls.length, 0, "proposing must not reach the domain adapter");

  const outcome = await service.confirm({ actorId: ACTOR, draftId: "draft:1", now: NOW });
  assert.equal(outcome.kind, "created");
  assert.equal(outcome.draft?.state, "created");
  assert.equal(outcome.draft?.createdRecordId, "task:1");
  assert.equal(calls.length, 1);
});

test("a second proposal supersedes the first so that 确认 has one referent", async () => {
  const repository = memoryRepository();
  const { adapter } = recordingAdapter();
  const service = createEntityDraftService({ adapters: [adapter], repository });

  await service.propose({ actorId: ACTOR, conversationId: CONVERSATION, draftId: "draft:1", now: NOW, proposal: PROPOSAL });
  await service.propose({
    actorId: ACTOR, conversationId: CONVERSATION, draftId: "draft:2", now: NOW,
    proposal: { ...PROPOSAL, fields: { title: "另一件事" } },
  });

  assert.equal(repository.rows.get("draft:1")?.state, "superseded");
  const pending = await service.pending({ actorId: ACTOR, conversationId: CONVERSATION });
  assert.equal(pending?.draftId, "draft:2");
});

test("confirming twice does not write twice, and an edit earns a new key", async () => {
  const repository = memoryRepository();
  const { adapter, calls } = recordingAdapter();
  const service = createEntityDraftService({ adapters: [adapter], repository });

  await service.propose({ actorId: ACTOR, conversationId: CONVERSATION, draftId: "draft:1", now: NOW, proposal: PROPOSAL });
  const first = await service.confirm({ actorId: ACTOR, draftId: "draft:1", now: NOW });
  const again = await service.confirm({ actorId: ACTOR, draftId: "draft:1", now: NOW });

  assert.equal(first.kind, "created");
  assert.equal(again.kind, "not_pending", "an already-created draft is not pending");
  assert.equal(calls.length, 1);
  assert.equal(calls[0]?.idempotencyKey, "agent:conversation:one:draft:1:1");
});

test("editing a field before confirming changes the key and the written title", async () => {
  const repository = memoryRepository();
  const { adapter, calls } = recordingAdapter();
  const service = createEntityDraftService({ adapters: [adapter], repository });

  await service.propose({ actorId: ACTOR, conversationId: CONVERSATION, draftId: "draft:1", now: NOW, proposal: PROPOSAL });
  const revised = await service.revise({
    actorId: ACTOR, draftId: "draft:1", fields: { title: "改过的标题" }, now: NOW,
  });
  assert.equal(revised?.revision, 2);

  await service.confirm({ actorId: ACTOR, draftId: "draft:1", now: NOW });
  assert.equal(calls[0]?.title, "改过的标题");
  assert.equal(calls[0]?.idempotencyKey, "agent:conversation:one:draft:1:2");
});

test("a failed write leaves the draft confirmable again and says why", async () => {
  const repository = memoryRepository();
  const { adapter } = recordingAdapter({
    async write() { throw new Error("待办服务暂时不可用"); },
  });
  const service = createEntityDraftService({ adapters: [adapter], repository });

  await service.propose({ actorId: ACTOR, conversationId: CONVERSATION, draftId: "draft:1", now: NOW, proposal: PROPOSAL });
  const outcome = await service.confirm({ actorId: ACTOR, draftId: "draft:1", now: NOW });

  assert.equal(outcome.kind, "failed");
  assert.equal(outcome.draft?.state, "pending_confirmation");
  assert.equal(outcome.draft?.failureReason, "待办服务暂时不可用");
});

test("cancelling leaves nothing to confirm", async () => {
  const repository = memoryRepository();
  const { adapter, calls } = recordingAdapter();
  const service = createEntityDraftService({ adapters: [adapter], repository });

  await service.propose({ actorId: ACTOR, conversationId: CONVERSATION, draftId: "draft:1", now: NOW, proposal: PROPOSAL });
  await service.cancel({ actorId: ACTOR, draftId: "draft:1", now: NOW });

  assert.equal(await service.pending({ actorId: ACTOR, conversationId: CONVERSATION }), null);
  assert.equal((await service.confirm({ actorId: ACTOR, draftId: "draft:1", now: NOW })).kind, "not_pending");
  assert.equal(calls.length, 0);
});

test("another actor cannot confirm a draft", async () => {
  const repository = memoryRepository();
  const { adapter, calls } = recordingAdapter();
  const service = createEntityDraftService({ adapters: [adapter], repository });

  await service.propose({ actorId: ACTOR, conversationId: CONVERSATION, draftId: "draft:1", now: NOW, proposal: PROPOSAL });
  const outcome = await service.confirm({ actorId: "actor:two", draftId: "draft:1", now: NOW });

  assert.equal(outcome.kind, "not_pending");
  assert.equal(outcome.draft, null);
  assert.equal(calls.length, 0);
});

test("a kind with no adapter is reported, not silently dropped", async () => {
  const repository = memoryRepository();
  const { adapter } = recordingAdapter();
  const service = createEntityDraftService({ adapters: [adapter], repository });

  await service.propose({
    actorId: ACTOR, conversationId: CONVERSATION, draftId: "draft:1", now: NOW,
    proposal: { fields: { name: "林玫" }, kind: "contact", sourceRefs: [] },
  });
  assert.equal((await service.confirm({ actorId: ACTOR, draftId: "draft:1", now: NOW })).kind, "unsupported");
});

test("the schema rejects anything that is not a confirmable draft", () => {
  assert.equal(parseEntityDraftProposal(null), null);
  assert.equal(parseEntityDraftProposal({ fields: { title: "x" }, kind: "invoice" }), null, "unknown kind");
  assert.equal(parseEntityDraftProposal({ fields: {}, kind: "task" }), null, "no fields");
  assert.equal(parseEntityDraftProposal({ fields: { title: "   " }, kind: "task" }), null, "blank title");
  assert.equal(parseEntityDraftProposal({ fields: { notes: "x" }, kind: "task" }), null, "missing required title");
  assert.equal(parseEntityDraftProposal({ fields: { title: "x" }, kind: "schedule" }), null, "schedule needs a start");
  assert.equal(
    parseEntityDraftProposal({ fields: { title: "x" }, kind: "task", sourceRefs: [{ id: "n", kind: "invoice" }] }),
    null, "unknown source kind",
  );
  assert.deepEqual(parseEntityDraftProposal(PROPOSAL), {
    fields: { dueAt: "2026-09-20T09:00:00.000Z", title: "整理笔记的后续行动" },
    kind: "task",
    sourceRefs: [{ id: "note:1", kind: "note" }],
  });
});

test("typing a confirmation is read by code, not by the model", () => {
  for (const text of ["确认", "确认创建", "就这样", "好的，创建", "confirm", "Go ahead"]) {
    assert.equal(readEntityDraftIntent(text), "confirm", text);
  }
  for (const text of ["取消", "算了", "先不创建", "cancel", "never mind"]) {
    assert.equal(readEntityDraftIntent(text), "cancel", text);
  }
  // Anything that is a real instruction must not be mistaken for a confirmation.
  for (const text of ["确认一下我明天的日程", "帮我把这条笔记整理成待办", "取消我明天的会议", ""]) {
    assert.equal(readEntityDraftIntent(text), null, text);
  }
});

test("the idempotency key names the conversation, the draft and its revision", () => {
  assert.equal(
    entityDraftIdempotencyKey({ conversationId: "c1", draftId: "d1", revision: 3 }),
    "agent:c1:d1:3",
  );
});
