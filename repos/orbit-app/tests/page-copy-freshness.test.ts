import assert from "node:assert/strict";
import test from "node:test";

import { pageCopyFreshness } from "../src/data/sync/page-copy-freshness";

test("LF1: a copy is fresh inside its window and stale after it", () => {
  pageCopyFreshness.reset();
  const now = Date.parse("2026-10-21T10:00:00Z");
  assert.equal(pageCopyFreshness.isFresh("2026-10-21T09:58:30Z", 3 * 60_000, now), true);
  assert.equal(pageCopyFreshness.isFresh("2026-10-21T09:56:59Z", 3 * 60_000, now), false);
});

test("LF1: any accepted write ends every fresh window; copies saved after it are fresh again", () => {
  pageCopyFreshness.reset();
  const now = Date.parse("2026-10-21T10:00:00Z");
  pageCopyFreshness.noteWrite(Date.parse("2026-10-21T09:59:00Z"));
  assert.equal(pageCopyFreshness.isFresh("2026-10-21T09:58:30Z", 3 * 60_000, now), false);
  assert.equal(pageCopyFreshness.isFresh("2026-10-21T09:59:30Z", 3 * 60_000, now), true);
});

test("LF1: a copy dated in the future or unparseable is never fresh", () => {
  pageCopyFreshness.reset();
  const now = Date.parse("2026-10-21T10:00:00Z");
  assert.equal(pageCopyFreshness.isFresh("2026-10-21T10:05:00Z", 3 * 60_000, now), false);
  assert.equal(pageCopyFreshness.isFresh("not a date", 3 * 60_000, now), false);
});
