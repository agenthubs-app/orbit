import { strict as assert } from "node:assert";
import { test } from "node:test";

import { slugFromTitle } from "../../features/events/event-crud-and-import/event-slug";

/**
 * Sprint 0093: a Chinese title used to slug to the empty string, so every
 * manually created event was stored as `event:live-record:` and overwrote the
 * one before it. Found by creating two different events from the agent and
 * seeing one row.
 */
test("a title with no ASCII still gets an id of its own", () => {
  const first = slugFromTitle("关西跨境商务对接会");
  const second = slugFromTitle("东京 AI 落地伙伴对接会");
  assert.notEqual(first, "");
  assert.notEqual(first, second, "two different Chinese titles must not share one record");
  assert.equal(first, slugFromTitle("关西跨境商务对接会"), "the same event created twice stays one record");
});

test("an ASCII title keeps the readable slug it always had", () => {
  assert.equal(slugFromTitle("Storage Investor Dinner"), "storage-investor-dinner");
  assert.equal(slugFromTitle("  Customer Dinner  "), "customer-dinner");
});

test("a title that is only punctuation still resolves to something", () => {
  assert.equal(slugFromTitle("---"), slugFromTitle("---"));
  assert.notEqual(slugFromTitle("---"), "");
  assert.equal(slugFromTitle("   "), "untitled");
});
