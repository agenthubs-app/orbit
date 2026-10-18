import assert from "node:assert/strict";
import test from "node:test";

import { boundedGoalRelatedIds, internalGoalRelatedIds, wrapContactCardReader, type ContactCardService } from "../../features/contacts/card-service";
import type { ContactsListSearchFilterInput } from "../../features/contacts/contract";
import { GOAL_RELATED_IDS_LIMIT, GOAL_RELATED_READ_IDS_LIMIT } from "../../features/contacts/storage/contact-list-postgres-reader";

// R11a REVIEW M2：公开接口（GET /api/contacts/goal-related-ids）仍截 500；列表 / 汇总的内部读取带完整集合，不漏人。
const many = Array.from({ length: 1_200 }, (_, n) => `c${String(n).padStart(5, "0")}`);

test("the server's own list and summary reads carry every goal-related id, not the public 500", async () => {
  const seen: ContactsListSearchFilterInput[] = [];
  const reader = {
    async page(query: ContactsListSearchFilterInput) { seen.push(query); return { items: [], nextCursor: null, hasMore: false, asOf: "2026-10-18T00:00:00.000Z" }; },
    async summary(query: ContactsListSearchFilterInput) { seen.push(query); return {} as never; },
  } as unknown as ContactCardService;
  const service = wrapContactCardReader(reader, { id: "a" }, { goalRelatedIds: async () => [...many, "c00001", " "], inviteLinkedIds: async () => [] });
  await service.page({ limit: 30, goalRelated: true }, "a");
  await service.summary({}, "a");
  for (const query of seen) {
    assert.equal(query.goalRelatedContactIds?.length, many.length);
    assert.equal(query.goalRelatedContactIds?.[0], "c00000");
  }
  assert.equal(boundedGoalRelatedIds(many).ids.length, GOAL_RELATED_IDS_LIMIT, "the public endpoint keeps its cap");
});

test("only an absurd input beyond the internal guard is cut", () => {
  const huge = Array.from({ length: GOAL_RELATED_READ_IDS_LIMIT + 3 }, (_, n) => `x${n}`);
  assert.equal(internalGoalRelatedIds(huge).length, GOAL_RELATED_READ_IDS_LIMIT);
  assert.deepEqual(internalGoalRelatedIds(["b", "a", "a", ""]), ["a", "b"]);
});
