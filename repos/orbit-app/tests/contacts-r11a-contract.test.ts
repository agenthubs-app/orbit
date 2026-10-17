import assert from "node:assert/strict";
import test from "node:test";

import { contactCardSchema, contactCardSummarySchema } from "../src/api/schema/contact-card-page";
import { contactGoalRelatedIdsSchema } from "../src/api/schema/contact-goal-related";
import { contactCompletionQuestionSchema } from "../src/api/schema/contact-completion";
import { DEMO_GOAL_RELATED } from "../../orbits/shared/mock/demo-world/network";

// R11a SC-04：App 读新卡片宽进——未知 sourceChip / metKind 落兜底值，新字段可选；目標に関係的演示数据能解析。
const card = { id: "c1", displayName: "高橋 美咲", organization: "青葉ベンチャーズ", role: "パートナー", sourceType: "business_card_ocr", status: "active", pendingInitialization: false, nextActionPreview: "", valueTypes: [], updatedAt: "2026-10-18T00:00:00.000Z" };

test("an old card without R11a fields still parses; new fields are optional", () => {
  const parsed = contactCardSchema.parse(card);
  assert.equal(parsed.density, undefined);
  assert.equal(parsed.sourceChip, undefined);
});

test("unknown sourceChip / metKind values read as manual / other; known values pass through", () => {
  const parsed = contactCardSchema.parse({ ...card, density: 2, sourceChip: "carrier-pigeon", metKind: "conference-call", region: { countryCode: "JP", city: "Tokyo" }, addedAt: "2026-10-01T00:00:00.000Z", primaryIndustryId: "finance" });
  assert.equal(parsed.sourceChip, "manual");
  assert.equal(parsed.metKind, "other");
  assert.equal(parsed.density, 2);
  assert.equal(contactCardSchema.parse({ ...card, sourceChip: "event", metKind: "visit" }).sourceChip, "event");
  assert.equal(contactCompletionQuestionSchema.parse({ id: "q", contactId: "c", question: "?", options: ["A", "B"], askedOn: "2026-10-18", skipCount: 0, sourceChip: "event" }).sourceChip, "event");
});

test("the summary's R11a counts parse; goal-related demo data parses", () => {
  const summary = contactCardSummarySchema.parse({ total: 3, sources: {}, statuses: {}, values: {}, tags: [], hasMoreTags: false, asOf: "2026-10-18T00:00:00.000Z",
    densityCounts: { 1: 1, 2: 1, 3: 1 }, addedThisMonth: 2, tabCounts: { goalRelated: 1, needsFollowUp: 0 }, sourceChips: { meishi: 3 }, industries: { none: 3 }, regions: { Tokyo: 3 }, metKinds: { event: 3 } });
  assert.deepEqual(summary.tabCounts, { goalRelated: 1, needsFollowUp: 0 });
  const goal = contactGoalRelatedIdsSchema.parse({ ...DEMO_GOAL_RELATED, asOf: "2026-10-18T00:00:00.000Z" });
  assert.equal(goal.sample, true);
  assert.equal(goal.links?.length, goal.ids.length);
});
