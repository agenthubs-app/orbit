import assert from "node:assert/strict";
import test from "node:test";

import { aiSessionSummaryPageSchema } from "../src/api/schema/ai-session-page";

const at = "2026-10-18T09:00:00.000Z";
const item = {
  id: "session:1", title: "Tokyo", firstUserText: "Question", lastMessagePreview: "Answer",
  createdAt: at, updatedAt: at, messageRevision: 2,
  organization: { customTitle: null, groupId: null, pinned: false, revision: 1 },
};

test("AI session responses discard future fields and only malformed list items", () => {
  const parsed = aiSessionSummaryPageSchema.parse({
    items: [null, { ...item, futureItemField: true, organization: { ...item.organization, futureOrganizationField: true } },
      { ...item, id: "session:bad", messageRevision: -1 }, { ...item, id: "session:1" }],
    nextCursor: "next-page", hasMore: true,
    storage: { configured: true, persisted: true, futureStorageField: true }, futurePageField: true,
  });
  assert.deepEqual(parsed.items, [item]);
  assert.equal(parsed.nextCursor, "next-page");
  assert.equal(parsed.hasMore, true);
  assert.deepEqual(parsed.storage, { configured: true, persisted: true });
});

test("AI session responses still reject broken page metadata and oversized raw pages", () => {
  const page = { items: [item], nextCursor: null, hasMore: true,
    storage: { configured: true, persisted: true } };
  assert.equal(aiSessionSummaryPageSchema.safeParse(page).success, false);
  assert.equal(aiSessionSummaryPageSchema.safeParse({ ...page, hasMore: false, items: Array(51).fill(null) }).success, false);
});
