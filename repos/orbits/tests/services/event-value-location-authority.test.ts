import { strict as assert } from "node:assert";
import { test } from "node:test";

import { planEventDisplayFields } from "../../scripts/backfill-event-display-fields";
import { eventCoverPathFor } from "../../features/events/storage/event-cover-catalogue";

/**
 * Sprint 0090: the home feed showed Shanghai/Tokyo while the events list and the
 * event detail page showed 上海/东京, because the recommendation provider read
 * `payload.location` — the seed's English import原文 — ahead of the canonical
 * venue. Same shape as the title problem 0082 fixed; this locks the second half.
 */

function row(patch: Partial<Parameters<typeof planEventDisplayFields>[0][number]> = {}) {
  return {
    event_id: "event_01",
    canonical_title: "东京餐饮入境客增长会",
    canonical_venue: "东京",
    payload_title: "东京餐饮入境客增长会",
    payload_name: "東京インバウンド飲食店成長会 / Tokyo Inbound Restaurant Growth Forum",
    payload_venue: "东京",
    payload_cover: eventCoverPathFor("event_01"),
    ...patch,
  };
}

test("a record whose venue already matches the canonical head is left alone", () => {
  const planned = planEventDisplayFields([row()]);
  assert.deepEqual(planned, [], "no canonical difference means no write");
});

test("a stale English venue is planned for replacement by the canonical one", () => {
  const planned = planEventDisplayFields([
    row({ payload_venue: "Tokyo"}),
  ]);
  assert.equal(planned.length, 1);
  assert.deepEqual(planned[0]?.changes, ["venue"]);
  assert.equal(planned[0]?.currentVenue, "Tokyo");
  assert.equal(planned[0]?.canonicalVenue, "东京");
});

test("a record with no venue at all gets the canonical one", () => {
  const planned = planEventDisplayFields([
    row({ payload_venue: null}),
  ]);
  assert.deepEqual(planned[0]?.changes, ["venue"]);
});

test("an event without a canonical venue keeps whatever it had", () => {
  // There is nothing authoritative to copy, and inventing a place name would be
  // worse than showing the import原文.
  const planned = planEventDisplayFields([
    row({ canonical_venue: null, payload_venue: "Tokyo"}),
  ]);
  assert.deepEqual(planned, []);
});

test("an event without a canonical title is still skipped entirely (0082 behaviour)", () => {
  const planned = planEventDisplayFields([
    row({ canonical_title: null, payload_venue: "Tokyo" }),
  ]);
  assert.deepEqual(planned, []);
});

test("title and venue are planned together when both are stale", () => {
  const planned = planEventDisplayFields([
    row({ payload_title: "旧标题", payload_venue: "Tokyo"}),
  ]);
  assert.deepEqual(planned[0]?.changes, ["title", "venue"]);
});
