import assert from "node:assert/strict";
import test from "node:test";

import type { OrbitLandingEventView } from "../../app/(app)/app/orbit-landing-route-view-model";
import {
  eventTopics,
  exploreTopicFilters,
  matchesExploreFilters,
  topicLabel,
} from "../../app/(app)/app/events/explore-model";

function event(overrides: Partial<OrbitLandingEventView>): OrbitLandingEventView {
  return {
    address: "Tokyo Midtown",
    code: "EV-1",
    id: "ev-1",
    industry: "AI",
    name: "AI 交流会",
    place: "Tokyo Midtown",
    status: "upcoming",
    stats: { youRsvped: false },
    tags: ["Cloud", "Tokyo Midtown", "event_import", " AI "],
    theme: "cloud",
    ...overrides,
  } as OrbitLandingEventView;
}

test("eventTopics dedupes, strips internal source markers and venue echoes", () => {
  assert.deepEqual(eventTopics(event({})), ["AI", "Cloud"]);
});

test("topicLabel translates only in zh/ja and keeps unknown topics verbatim", () => {
  assert.equal(topicLabel("Finance", "en"), "Finance");
  assert.equal(topicLabel("Finance", "zh"), "金融");
  assert.equal(topicLabel("Finance", "ja"), "金融");
  assert.equal(topicLabel("unknown-topic", "zh"), "unknown-topic");
});

test("exploreTopicFilters caps at 8 unique topics in first-seen order", () => {
  const events = Array.from({ length: 10 }, (_, i) => event({ industry: `T${i}`, tags: [] }));
  assert.deepEqual(exploreTopicFilters(events), ["T0", "T1", "T2", "T3", "T4", "T5", "T6", "T7"]);
});

test("matchesExploreFilters combines status, topic and query", () => {
  const registered = event({ stats: { youRsvped: true } as OrbitLandingEventView["stats"], status: "ended" });
  assert.equal(matchesExploreFilters(registered, { language: "zh", query: "", status: "registered", topic: "all" }), true);
  assert.equal(matchesExploreFilters(registered, { language: "zh", query: "", status: "upcoming", topic: "all" }), false);
  assert.equal(matchesExploreFilters(event({}), { language: "zh", query: "", status: "all", topic: "Cloud" }), true);
  assert.equal(matchesExploreFilters(event({}), { language: "zh", query: "", status: "all", topic: "Fintech" }), false);
  assert.equal(matchesExploreFilters(event({}), { language: "zh", query: "EV-1", status: "all", topic: "all" }), true);
  assert.equal(matchesExploreFilters(event({ industry: "Finance" }), { language: "zh", query: "金融", status: "all", topic: "all" }), true, "query matches the translated topic label");
  assert.equal(matchesExploreFilters(event({ industry: "Finance" }), { language: "en", query: "金融", status: "all", topic: "all" }), false);
  assert.equal(matchesExploreFilters(event({}), { language: "zh", query: "nope", status: "all", topic: "all" }), false);
});
