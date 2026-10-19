import assert from "node:assert/strict";
import test from "node:test";
import { taskPageSchema } from "../src/api/schema/task-page";

test("App accepts the additive relationship marker and personal task-page scope", () => {
  const page = taskPageSchema.parse({
    actorId: "a", status: "open", scope: "personal", query: "", counts: { open: 1, completed: 0 }, total: 1,
    hasMore: false, nextCursor: null, asOf: "2026-10-17T00:00:00Z", items: [{
      id: "one", titlePreview: "Call back", locationPreview: null, status: "open", category: "work", priority: "normal",
      plannedDate: "2026-10-17", dueAt: null, updatedAt: "2026-10-17T00:00:00Z", relatedContact: null, relationship: false,
    }],
  });
  assert.equal(page.scope, "personal");
  assert.equal(page.items[0]?.relationship, false);
});

test("App task-page responses accept newer fields but still reject unknown task states", () => {
  const response = {
    actorId: "a", status: "open", scope: "personal", query: "", futurePageField: "server-v2",
    dueWindow: { plannedThrough: "2026-10-17", dueBefore: "2026-10-18T00:00:00.000Z", futureWindowField: true },
    counts: { open: 1, completed: 0, futureCount: 1 }, total: 1,
    hasMore: false, nextCursor: null, asOf: "2026-10-17T00:00:00Z", items: [{
      id: "one", titlePreview: "Call back", locationPreview: null, status: "open", category: "work", priority: "normal",
      plannedDate: "2026-10-17", dueAt: null, updatedAt: "2026-10-17T00:00:00Z",
      relatedContact: { id: "contact:1", namePreview: "One", organizationPreview: "Org", futureContactField: true },
      futureCardField: "server-v2",
    }],
  };
  const page = taskPageSchema.parse(response);
  assert.equal(page.items[0]?.relatedContact?.namePreview, "One");
  assert.equal("futurePageField" in page, false);
  assert.equal("futureCardField" in page.items[0]!, false);
  assert.equal("futureContactField" in page.items[0]!.relatedContact!, false);
  assert.equal("futureCount" in page.counts, false);
  assert.equal("futureWindowField" in page.dueWindow!, false);
  assert.equal(taskPageSchema.safeParse({ ...response, status: "archived" }).success, false);
});

test("App skips an unknown task category without losing the page total", () => {
  const card = { id: "known", titlePreview: "Call back", locationPreview: null, status: "open", category: "work",
    priority: "normal", plannedDate: null, dueAt: null, updatedAt: "2026-10-17T00:00:00Z", relatedContact: null };
  const page = taskPageSchema.parse({ actorId: "a", status: "open", scope: "all", query: "",
    counts: { open: 2, completed: 0 }, total: 2, hasMore: false, nextCursor: null,
    asOf: "2026-10-17T00:00:00Z", items: [card, { ...card, id: "future", category: "future-category" }] });
  assert.deepEqual(page.items.map(item => item.id), ["known"]);
  assert.equal(page.total, 2);
  assert.equal(page.counts.open, 2);
});
