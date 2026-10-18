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
