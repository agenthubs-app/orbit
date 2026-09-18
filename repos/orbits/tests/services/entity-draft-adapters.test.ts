import { strict as assert } from "node:assert";
import { test } from "node:test";

import type { EntityDraft } from "../../features/orbit-ai/entity-drafts/contract";
import {
  createContactDraftAdapter,
  createEventDraftAdapter,
  createNoteDraftAdapter,
  createScheduleDraftAdapter,
  createTaskDraftAdapter,
  taskCategoryForTitle,
} from "../../features/orbit-ai/entity-drafts/adapters";

const NOW = "2026-09-19T02:00:00.000Z";

function draft(overrides: Partial<EntityDraft>): EntityDraft {
  return {
    actorId: "actor:one",
    conversationId: "conversation:one",
    createdAt: NOW,
    draftId: "draft:1",
    fields: {},
    kind: "task",
    revision: 1,
    sourceRefs: [],
    state: "pending_confirmation",
    updatedAt: NOW,
    ...overrides,
  };
}

test("the task adapter carries the note and contact it came from", async () => {
  const seen: Record<string, unknown>[] = [];
  const adapter = createTaskDraftAdapter({
    async create(input) { seen.push(input); return { task: { id: "task:9" } }; },
  });

  const result = await adapter.write({
    actorId: "actor:one",
    draft: draft({
      fields: { dueAt: "2026-09-20T09:00:00Z", title: "跟进林玫的续费" },
      sourceRefs: [{ id: "note:1", kind: "note" }, { id: "contact:2", kind: "contact" }],
    }),
    idempotencyKey: "agent:c:d:1",
    now: NOW,
  });

  assert.equal(result.recordId, "task:9");
  assert.equal(seen[0]?.idempotencyKey, "agent:c:d:1");
  assert.equal(seen[0]?.sourceNoteId, "note:1");
  assert.equal(seen[0]?.relatedContactId, "contact:2");
  assert.equal(seen[0]?.dueAt, "2026-09-20T09:00:00.000Z", "a loose instant is normalised");
  assert.equal(seen[0]?.category, "relationship", "inferred from the title");
});

test("a time the model invented but cannot be parsed fails before any write", async () => {
  let calls = 0;
  const adapter = createTaskDraftAdapter({
    async create() { calls += 1; return { task: { id: "task:9" } }; },
  });

  await assert.rejects(
    adapter.write({
      actorId: "actor:one",
      draft: draft({ fields: { dueAt: "下周三下午", title: "跟进" } }),
      idempotencyKey: "k", now: NOW,
    }),
    /dueAt 不是一个可识别的时间/u,
  );
  assert.equal(calls, 0);
});

test("a note draft without a body keeps its title rather than writing an empty record", async () => {
  const seen: Record<string, unknown>[] = [];
  const adapter = createNoteDraftAdapter({
    async create(input) { seen.push(input); return { id: "note:9" }; },
  });

  await adapter.write({
    actorId: "actor:one",
    draft: draft({ fields: { title: "关西对接会要点" }, kind: "note" }),
    idempotencyKey: "k", now: NOW,
  });
  assert.equal(seen[0]?.body, "关西对接会要点");
});

test("the schedule adapter requires a start it can normalise", async () => {
  const adapter = createScheduleDraftAdapter({
    async create(_actorId, body) { return { id: `schedule:${body.idempotencyKey}` }; },
  });

  const result = await adapter.write({
    actorId: "actor:one",
    draft: draft({ fields: { startsAt: "2026-09-21T14:00:00Z", title: "视觉质检试点" }, kind: "schedule" }),
    idempotencyKey: "agent:c:d:1", now: NOW,
  });
  assert.equal(result.recordId, "schedule:agent:c:d:1");
});

test("a refused event write surfaces the service's own reason", async () => {
  const adapter = createEventDraftAdapter({
    async createEvent() { return { error: { message: "活动来源未配置" }, success: false }; },
  });

  await assert.rejects(
    adapter.write({
      actorId: "actor:one",
      draft: draft({ fields: { startsAt: "2026-09-22T01:00:00Z", title: "关西跨境商务对接会" }, kind: "event" }),
      idempotencyKey: "k", now: NOW,
    }),
    /活动来源未配置/u,
  );
});

test("a confirmed contact lands as a draft, which is the only path Orbit has", async () => {
  const adapter = createContactDraftAdapter({
    async createManualContactDraft(input) {
      assert.equal(input.displayName, "林玫");
      assert.equal(input.organization, "港湾创投");
      return { data: { draft: { draftId: "contact-draft:4" } }, success: true };
    },
  });

  const result = await adapter.write({
    actorId: "actor:one",
    draft: draft({ fields: { name: "林玫", organization: "港湾创投" }, kind: "contact" }),
    idempotencyKey: "k", now: NOW,
  });
  assert.equal(result.recordId, "contact-draft:4");
});

test("a contact draft with no id back is a failure, not a silent success", async () => {
  const adapter = createContactDraftAdapter({
    async createManualContactDraft() { return { data: { draft: null }, success: true }; },
  });

  await assert.rejects(
    adapter.write({
      actorId: "actor:one",
      draft: draft({ fields: { name: "林玫" }, kind: "contact" }),
      idempotencyKey: "k", now: NOW,
    }),
    /没有返回可回读的 id/u,
  );
});

test("task categories follow the titles the existing service already recognises", () => {
  assert.equal(taskCategoryForTitle("跟进林玫"), "relationship");
  assert.equal(taskCategoryForTitle("准备周五的会议"), "meeting");
  assert.equal(taskCategoryForTitle("报名关西交流会"), "event");
  assert.equal(taskCategoryForTitle("去医院复查"), "personal");
  assert.equal(taskCategoryForTitle("整理季度材料"), "work");
});
