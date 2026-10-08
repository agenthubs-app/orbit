import assert from "node:assert/strict";
import test from "node:test";

import {
  attributionCardsFromItems,
  eventAttributionCandidate,
  resolveEventAttribution,
  tokyoDayKey,
  type AttributionEvent,
  type EventAttributionSource,
} from "../../features/plans/event-attribution";

// 活动 9/27 19:00（东京）开始 = 2026-09-27T10:00:00Z。
const MIXER: AttributionEvent = { eventId: "event:mixer", startsAt: "2026-09-27T10:00:00.000Z", title: "Tokyo Startup Mixer" };

test("tokyoDayKey buckets UTC instants by the Asia/Tokyo calendar day", () => {
  assert.equal(tokyoDayKey("2026-09-27T14:59:59.999Z"), "2026-09-27");
  assert.equal(tokyoDayKey("2026-09-27T15:00:00.000Z"), "2026-09-28");
  assert.equal(tokyoDayKey("not a date"), null);
});

test("window is the event start day or the next day in Tokyo time, judged by the scan time", () => {
  const cases: Array<[string, string, boolean]> = [
    ["day before (JST 9/26 23:59)", "2026-09-26T14:59:59.000Z", false],
    ["start day, JST midnight (UTC is still 9/26)", "2026-09-26T15:00:00.000Z", true],
    ["start day evening", "2026-09-27T12:00:00.000Z", true],
    ["next day, just after JST midnight", "2026-09-27T15:00:00.000Z", true],
    ["next day, last minute", "2026-09-28T14:59:59.000Z", true],
    ["third day, JST midnight", "2026-09-28T15:00:00.000Z", false],
  ];
  for (const [label, scannedAt, expected] of cases) {
    assert.equal(eventAttributionCandidate(scannedAt, [MIXER])?.eventId ?? null, expected ? MIXER.eventId : null, label);
  }
});

test("the nearest start wins when several registered events qualify", () => {
  const morning: AttributionEvent = { eventId: "event:breakfast", startsAt: "2026-09-27T23:00:00.000Z", title: "Breakfast" }; // JST 9/28 08:00
  // 9/28 10:00 JST：前一天晚上的 Mixer（次日窗口）和当天早上的 Breakfast 都在窗口里，早上那场更近。
  assert.equal(eventAttributionCandidate("2026-09-28T01:00:00.000Z", [MIXER, morning])?.eventId, "event:breakfast");
  // 9/27 20:00 JST：只有 Mixer（Breakfast 还没到开始日）。
  assert.equal(eventAttributionCandidate("2026-09-27T11:00:00.000Z", [MIXER, morning])?.eventId, "event:mixer");
});

function memorySource(events: AttributionEvent[], registered: Record<string, string[]>) {
  const calls: Array<{ from: string; to: string }> = [];
  const source: EventAttributionSource = {
    async listEventsStartingBetween(from, to) {
      calls.push({ from, to });
      return events.filter((event) => event.startsAt >= from && event.startsAt < to);
    },
    async registeredEventIds({ eventIds, userId }) {
      return new Set(eventIds.filter((id) => registered[userId]?.includes(id)));
    },
  };
  return { calls, source };
}

test("resolveEventAttribution uses the scan time, so confirming days later still attributes the card", async () => {
  const { calls, source } = memorySource([MIXER], { "user:alice": [MIXER.eventId] });
  // 名片在次日扫描；确认发生在一周后——候选只看扫描时间。
  const result = await resolveEventAttribution(source, {
    cards: [{ cardId: "card:1", scannedAt: "2026-09-28T03:00:00.000Z" }],
    userId: "user:alice",
  });
  assert.deepEqual(result.byCard, { "card:1": MIXER.eventId });
  assert.deepEqual(result.events, [MIXER]);
  // 扫描日 9/28 只可能对应 9/27 或 9/28 开始的活动。
  assert.deepEqual(calls, [{ from: "2026-09-26T15:00:00.000Z", to: "2026-09-28T15:00:00.000Z" }]);
});

test("events the user did not register for are never candidates", async () => {
  const { source } = memorySource([MIXER], { "user:bob": [MIXER.eventId] });
  const result = await resolveEventAttribution(source, {
    cards: [{ cardId: "card:1", scannedAt: "2026-09-27T12:00:00.000Z" }],
    userId: "user:alice",
  });
  assert.deepEqual(result, { byCard: { "card:1": null }, events: [] });
});

test("cards outside the window get no candidate while others in the same batch do", async () => {
  const { source } = memorySource([MIXER], { "user:alice": [MIXER.eventId] });
  const result = await resolveEventAttribution(source, {
    cards: [
      { cardId: "card:in", scannedAt: "2026-09-27T12:00:00.000Z" },
      { cardId: "card:late", scannedAt: "2026-09-29T12:00:00.000Z" },
    ],
    userId: "user:alice",
  });
  assert.deepEqual(result.byCard, { "card:in": MIXER.eventId, "card:late": null });
});

test("attributionCardsFromItems takes each card's first side (lowest seq) as its scan time", () => {
  assert.deepEqual(
    attributionCardsFromItems([
      { cardId: "c1", createdAt: "2026-09-27T12:00:05.000Z", seq: 2 },
      { cardId: "c1", createdAt: "2026-09-27T12:00:00.000Z", seq: 1 },
      { cardId: "c2", createdAt: "2026-09-27T12:01:00.000Z", seq: 3 },
    ]),
    [
      { cardId: "c1", scannedAt: "2026-09-27T12:00:00.000Z" },
      { cardId: "c2", scannedAt: "2026-09-27T12:01:00.000Z" },
    ],
  );
});
