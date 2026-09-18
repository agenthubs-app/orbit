import { strict as assert } from "node:assert";
import { test } from "node:test";

import { createEntityDraftRouteHandlers } from "../../app/api/ai/entity-drafts/handler";
import type { EntityDraft } from "../../features/orbit-ai/entity-drafts/contract";
import {
  createEntityDraftService,
  type EntityDraftRepository,
  type EntityDraftWriteAdapter,
} from "../../features/orbit-ai/entity-drafts/service";

const ACTOR = { id: "actor:one", workspaceId: "workspace:test" };
const CONVERSATION = "conversation:one";

function memoryRepository(): EntityDraftRepository {
  const rows = new Map<string, EntityDraft>();
  return {
    async findPending({ actorId, conversationId }) {
      for (const draft of rows.values()) {
        if (draft.actorId === actorId && draft.conversationId === conversationId && draft.state === "pending_confirmation") return draft;
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

function harness(adapter?: Partial<EntityDraftWriteAdapter>) {
  const repository = memoryRepository();
  const writes: string[] = [];
  const service = createEntityDraftService({
    adapters: [{
      kind: "task",
      async write({ idempotencyKey }) { writes.push(idempotencyKey); return { recordId: "task:1" }; },
      ...adapter,
    }],
    repository,
  });
  const handlers = createEntityDraftRouteHandlers({
    resolveActor: async () => ACTOR,
    serviceFor: () => service,
  });
  return { handlers, service, writes };
}

const PROPOSAL = { fields: { title: "跟进林玫" }, kind: "task", sourceRefs: [] };

async function seed(service: ReturnType<typeof harness>["service"]) {
  await service.propose({
    actorId: ACTOR.id, conversationId: CONVERSATION, draftId: "draft:1",
    now: "2026-09-19T02:00:00.000Z", proposal: PROPOSAL,
  });
}

function post(body: unknown) {
  return new Request("https://orbit.test/api/ai/entity-drafts/draft:1", {
    body: JSON.stringify(body), method: "POST",
  });
}

test("the pending draft is readable so a reopened conversation still shows its card", async () => {
  const { handlers, service } = harness();
  await seed(service);

  const response = await handlers.GET(
    new Request(`https://orbit.test/api/ai/entity-drafts?conversationId=${CONVERSATION}`),
  );
  const body = await response.json();
  assert.equal(response.status, 200);
  assert.equal(body.data.draft.draftId, "draft:1");
  assert.equal(body.data.draft.state, "pending_confirmation");
  assert.equal(body.data.draft.actorId, undefined, "the view never returns the actor id");
});

test("confirming writes once and reports the created record", async () => {
  const { handlers, service, writes } = harness();
  await seed(service);

  const response = await handlers.POST(post({ action: "confirm" }), "draft:1");
  const body = await response.json();
  assert.equal(response.status, 200);
  assert.equal(body.data.draft.state, "created");
  assert.equal(body.data.draft.createdRecordId, "task:1");
  assert.deepEqual(writes, ["agent:conversation:one:draft:1:1"]);
});

test("confirming a draft that is not pending is a 404, not a second write", async () => {
  const { handlers, service, writes } = harness();
  await seed(service);
  await handlers.POST(post({ action: "confirm" }), "draft:1");

  const response = await handlers.POST(post({ action: "confirm" }), "draft:1");
  assert.equal(response.status, 404);
  assert.equal(writes.length, 1);
});

test("a refused write answers with a failure status and the reason, keeping the draft confirmable", async () => {
  const { handlers, service } = harness({
    async write() { throw new Error("待办服务暂时不可用"); },
  });
  await seed(service);

  const response = await handlers.POST(post({ action: "confirm" }), "draft:1");
  const body = await response.json();
  assert.equal(response.status, 503, "a 200 would let a status-only client believe the record exists");
  assert.equal(body.error.message, "待办服务暂时不可用");
  assert.equal(body.error.context.entityDraftWriteFailed, "true");
  assert.equal(body.error.context.entityDraftState, "pending_confirmation");

  const pending = await service.pending({ actorId: ACTOR.id, conversationId: CONVERSATION });
  assert.equal(pending?.draftId, "draft:1", "the user can fix a field and try again");
});

test("revising bumps the revision, and the later write uses the new key", async () => {
  const { handlers, service, writes } = harness();
  await seed(service);

  const revised = await handlers.POST(post({ action: "revise", fields: { title: "改过的标题" } }), "draft:1");
  const body = await revised.json();
  assert.equal(body.data.draft.revision, 2);
  assert.equal(body.data.draft.fields.title, "改过的标题");

  await handlers.POST(post({ action: "confirm" }), "draft:1");
  assert.deepEqual(writes, ["agent:conversation:one:draft:1:2"]);
});

test("cancelling leaves nothing pending and never writes", async () => {
  const { handlers, service, writes } = harness();
  await seed(service);

  assert.equal((await handlers.POST(post({ action: "cancel" }), "draft:1")).status, 200);
  assert.equal(await service.pending({ actorId: ACTOR.id, conversationId: CONVERSATION }), null);
  assert.equal(writes.length, 0);
});

test("a request without a recognised action is refused before touching the draft", async () => {
  const { handlers, service, writes } = harness();
  await seed(service);

  for (const body of [{ action: "approve" }, {}, { action: "revise" }, { action: "revise", fields: { title: "  " } }]) {
    const response = await handlers.POST(post(body), "draft:1");
    assert.equal(response.status, 400, JSON.stringify(body));
  }
  assert.equal(writes.length, 0);
  assert.equal((await service.pending({ actorId: ACTOR.id, conversationId: CONVERSATION }))?.revision, 1);
});

test("an unauthenticated request cannot confirm anything", async () => {
  const { service, writes } = harness();
  await seed(service);
  const handlers = createEntityDraftRouteHandlers({
    resolveActor: async () => null,
    serviceFor: () => service,
  });

  assert.equal((await handlers.POST(post({ action: "confirm" }), "draft:1")).status, 401);
  assert.equal(writes.length, 0);
});

test("reading the pending draft requires naming the conversation", async () => {
  const { handlers } = harness();
  const response = await handlers.GET(new Request("https://orbit.test/api/ai/entity-drafts"));
  assert.equal(response.status, 400);
});
