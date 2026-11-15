import assert from "node:assert/strict";
import test from "node:test";

import { appCardLine, appEventWhen, clipboardEventUrl, meetCountOf, orderAssessed, relativeDay } from "../src/screens/events/v2/events-model";
import { announceEventChanged, publicOrganizerName, subscribeEventChanged } from "../src/screens/events/v2/journey-model";
import type { EventAssessmentContract } from "../src/api/contract/event-assessment";

// R26 App イベント: date / chip helpers match the boards (app.html #14 / #15); 2026-11-15 no score ring / verdict.
const base = (id: string, total: number, extra: Partial<EventAssessmentContract> = {}): EventAssessmentContract => ({
  createdAt: "2026-10-07T00:00:00.000Z", facts: { price: "¥15,000", startsAt: "2026-10-16T10:00:00+09:00", title: id }, id, missingFields: [], rubricVersion: "event-score-v2", scoreBreakdown: [], sourceKind: "url", status: "ready", total, verdict: total >= 70 ? "recommend" : total >= 50 ? "conditional" : "skip", ...extra,
});

test("dates in Tokyo: 10月16日（金） / evening 10月7日（水）19:00", () => {
  assert.equal(appEventWhen("2026-10-16T10:00:00+09:00", "ja"), "10月16日（金）");
  assert.equal(appEventWhen("2026-10-07T19:00:00+09:00", "ja"), "10月7日（水）19:00");
  assert.equal(appCardLine(base("a", 82), "ja", "無料"), "10月16日（金） · ¥15,000");
  assert.equal(relativeDay("2026-10-07T19:00:00+09:00", new Date("2026-10-07T03:00:00.000Z")), "tonight");
});

test("会いたい人 count; 調べたイベント newest first (reading on top), never by score", () => {
  assert.equal(meetCountOf(base("a", 82, { meetCandidates: [{ basis: "", count: 3, emoji: "💼", label: "VC", source: "speakers" }, { basis: "", count: 11, emoji: "🏭", label: "DX", source: "exhibitors" }, { basis: "", count: 2, emoji: "👋", label: "known", source: "known" }] })), 14);
  const at = (id: string, total: number, createdAt: string, extra: Partial<EventAssessmentContract> = {}) => base(id, total, { createdAt, ...extra });
  assert.deepEqual(orderAssessed([
    at("old-high", 95, "2026-10-01T00:00:00.000Z"),
    at("new-low", 20, "2026-10-09T00:00:00.000Z"),
    at("mid", 60, "2026-10-05T00:00:00.000Z", { userDecision: "dismissed" }),
    at("reading", 0, "2026-09-01T00:00:00.000Z", { status: "reading" }),
  ]).map((item) => item.id), ["reading", "new-low", "mid", "old-high"]);
});

test("UX E2: 粘贴网址 takes the first http(s) link from the clipboard, nothing else", () => {
  assert.equal(clipboardEventUrl("https://peatix.com/event/123"), "https://peatix.com/event/123");
  assert.equal(clipboardEventUrl("見てみて 「https://example.com/e?id=1」 よろしく"), "https://example.com/e?id=1");
  assert.equal(clipboardEventUrl("ただのメモ"), null);
  assert.equal(clipboardEventUrl(""), null);
  assert.equal(clipboardEventUrl(null), null);
});

test("UX E6 / E8: the server's 「Organizer #id」 placeholder is not a name; registration changes reach the open detail", () => {
  assert.equal(publicOrganizerName("Organizer #1Q8PXWU"), null);
  assert.equal(publicOrganizerName("  "), null);
  assert.equal(publicOrganizerName("東京SaaS会"), "東京SaaS会");
  const heard: string[] = [];
  const stop = subscribeEventChanged((id) => heard.push(id));
  announceEventChanged("event-1");
  stop();
  announceEventChanged("event-2");
  assert.deepEqual(heard, ["event-1"]);
});
