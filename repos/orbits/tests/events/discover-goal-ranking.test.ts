/**
 * 2026-11-27 探す：没有计划、资料里有目标 → 按目标模板关键词粗排（纯规则，不用 AI；不显示分数，只给「主题相近」事实）。
 */
import assert from "node:assert/strict";
import test from "node:test";

import { eventDiscoverQueryObject } from "../../shared/api-schema/event-discover";
import { eventDiscoverResponseSchema } from "../../shared/api-schema/event-discover";
import { goalKeywordsForProfileGoal } from "../../features/events/assessment/configured";
import { buildDiscover, goalKeywordHits, type DiscoverCandidate } from "../../features/events/journey/discover-core";

const NOW = new Date("2026-10-07T03:00:00.000Z");
const q = (input: Record<string, string> = {}) => eventDiscoverQueryObject.parse(input);
const candidate = (id: string, day: number, title: string, description?: string): DiscoverCandidate => ({ description, emoji: "🎟️", eventId: id, organizerId: `org-${id}`, organizerName: `主催 ${id}`, startsAt: `2026-10-${String(day).padStart(2, "0")}T19:00:00+09:00`, title, venue: "渋谷" });
const events = [
  candidate("early", 9, "交流会 秋"),
  candidate("vc", 12, "スタートアップ ピッチ", "VC と投資家が登壇します"),
  candidate("mid", 14, "もくもく会"),
  candidate("raise", 20, "シリーズA 資金調達ナイト"),
];
const base = { attendedOrganizers: new Set<string>(), candidates: events, feedback: [], followedOrganizers: new Set<string>(), hasPlan: false, myEventIds: new Set<string>(), now: NOW, query: q(), signedIn: true };

test("profile goal → template keywords only for the four plan kinds", () => {
  assert.ok(goalKeywordsForProfileGoal("寻找投资").includes("資金調達"));
  assert.ok(goalKeywordsForProfileGoal("採用：エンジニア").includes("hiring"));
  assert.deepEqual(goalKeywordsForProfileGoal("提升品牌曝光"), [], "brand awareness has no plan kind");
  assert.deepEqual(goalKeywordsForProfileGoal("学习行业趋势"), []);
  assert.deepEqual(goalKeywordsForProfileGoal("自由に書いた目標"), []);
  assert.deepEqual(goalKeywordsForProfileGoal(null), []);
});

test("no plan + goal: events naming the goal come first (date order inside), with a topic fact, no score", () => {
  const keywords = goalKeywordsForProfileGoal("寻找投资");
  const out = buildDiscover({ ...base, goalKeywords: keywords });
  assert.deepEqual(out.all.map((row) => row.eventId), ["vc", "raise", "early", "mid"]);
  assert.deepEqual(buildDiscover({ ...base, goalKeywords: keywords }).all.map((row) => row.eventId), ["vc", "raise", "early", "mid"], "deterministic");
  assert.equal(out.popularityFallback, true, "still the no-plan state (guide card stays)");
  assert.deepEqual(out.all.find((row) => row.eventId === "raise")?.relevance?.topic?.labels, ["資金調達", "シリーズ"], "overlapping keywords count once");
  assert.deepEqual(goalKeywordHits(events[1]!, keywords), ["投資家", "VC"]);
  assert.equal(out.all.find((row) => row.eventId === "raise")?.relevance?.group, "topic");
  assert.equal(out.all.find((row) => row.eventId === "early")?.relevance, undefined);
  assert.equal(out.all.some((row) => row.score !== undefined || row.verdict !== undefined), false, "no scores");
  assert.equal(out.planFit.length, 0);
  assert.equal(out.past?.every((row) => row.relevance === undefined), true, "ended events untouched");
  eventDiscoverResponseSchema.parse(out);
});

test("no goal (or a goal without a plan kind): date order unchanged", () => {
  const dates = ["early", "vc", "mid", "raise"];
  assert.deepEqual(buildDiscover(base).all.map((row) => row.eventId), dates);
  assert.deepEqual(buildDiscover({ ...base, goalKeywords: goalKeywordsForProfileGoal("提升品牌曝光") }).all.map((row) => row.eventId), dates);
  assert.equal(buildDiscover(base).all.some((row) => row.relevance !== undefined), false);
});

test("with a plan the goal keywords are ignored (plan logic as before); signed out and 開催済み never rank", () => {
  const keywords = goalKeywordsForProfileGoal("寻找投资");
  const planned = buildDiscover({ ...base, goalKeywords: keywords, hasPlan: true });
  assert.deepEqual(planned.all.map((row) => row.eventId), ["early", "vc", "mid", "raise"]);
  assert.equal(planned.popularityFallback, false);
  assert.deepEqual(buildDiscover({ ...base, goalKeywords: keywords, signedIn: false }).all.map((row) => row.eventId), ["early", "vc", "mid", "raise"]);
  const past = buildDiscover({ ...base, goalKeywords: keywords, now: new Date("2026-11-30T00:00:00.000Z"), query: q({ period: "past" }) });
  assert.equal(past.all.some((row) => row.relevance !== undefined), false);
});
