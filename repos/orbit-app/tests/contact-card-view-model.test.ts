import assert from "node:assert/strict";
import test from "node:test";
import { contactCardViews, contactCardFilters } from "../src/view-models/contact-card-pages";

test("compact cards keep pending state and actual value labels; global counts never come from the loaded page", () => {
  const items = contactCardViews([{ id: "c", displayName: "Ren", organization: "Org", role: "Designer", sourceType: "manual", status: "active", pendingInitialization: true, nextActionPreview: "do not suggest before initialization", valueTypes: ["knowledge_exchange"], updatedAt: "2026-09-25T00:00:00Z" }], "en");
  assert.equal(items.length, 1); assert.equal(items[0]!.lifecycleInitialization, "pending"); assert.equal(items[0]!.nextAction, "");
  const filters = contactCardFilters({ total: 10000, sources: { manual: 10000 }, statuses: { active: 9000, needs_follow_up: 500 }, tags: [{ value: "custom", count: 400 }], values: { knowledge_exchange: 300 }, hasMoreTags: true, asOf: "2026-09-25T00:00:00Z" }, {}, {}, "en");
  assert.equal(filters.dimensions.actionState[0]!.count, 10000);
  assert.equal(filters.dimensions.relationshipProgress.find(x => x.value === "active")?.count, 9500);
  assert.equal(filters.advanced.find(x => x.key === "tag")?.options[0]?.count, 400);
  assert.equal(filters.hasMoreTags, true);
});
