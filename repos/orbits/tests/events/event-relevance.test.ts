// 2026-11-15 活动不再打分：「跟你有关的事实」（event-relevance-proposal.html）。
import assert from "node:assert/strict";
import test from "node:test";

import { typesMentionedIn } from "../../shared/compute/event-attendee-typing";
import { compareByRelevance, eventRelevance } from "../../shared/compute/event-relevance";
import { eventRelevanceObject } from "../../shared/api-schema/event-relevance";

const types = [
  { emoji: "💼", key: "vc_partner", metCount: 0, shortLabel: "VC パートナー", skipped: false, targetCount: 3 },
  { emoji: "🧮", key: "cfo", metCount: 0, shortLabel: "CFO", skipped: false, targetCount: 2 },
  { emoji: "🚀", key: "funded_founder", metCount: 0, shortLabel: "起業家", skipped: false, targetCount: 3 },
];
const limits = { maxFee: 5000, maxTravelMinutes: 60 };
const none = { breakdown: {}, feeYen: null, known: [], limits, mentioned: [], travelMinutes: null, types };

test("0 人报名的新活动：内容提到计划类型 → topic，不扣分、不出结论", () => {
  const mentioned = typesMentionedIn("中日创业交流会：创业者・投资人・VC が集まる夜", types);
  assert.deepEqual(mentioned.sort(), ["funded_founder", "vc_partner"]);
  const result = eventRelevance({ ...none, mentioned });
  assert.equal(result.group, "topic");
  assert.deepEqual(result.topic?.labels, ["VC パートナー", "起業家"]);
  assert.deepEqual(result.people, []);
  assert.deepEqual(result.warnings, []);
});

test("有名单：想见的人按人数排，最多 3 类；已见够和跳过的类型不算", () => {
  const result = eventRelevance({
    ...none,
    breakdown: { cfo: { exhibitors: 0, registrants: 3, speakers: 0 }, funded_founder: { exhibitors: 0, registrants: 9, speakers: 0 }, vc_partner: { exhibitors: 0, registrants: 0, speakers: 2 } },
    mentioned: ["vc_partner"],
    types: types.map((type) => (type.key === "funded_founder" ? { ...type, metCount: 3 } : type)),
  });
  assert.equal(result.group, "people");
  assert.deepEqual(result.people.map((item) => [item.label, item.count, item.source]), [["CFO", 3, "registrants"], ["VC パートナー", 2, "speakers"]]);
  assert.equal(result.topic, null, "有人就不再说主题");
});

test("认识的人、超预算、路程过长才出；查不到的不出", () => {
  const result = eventRelevance({ ...none, feeYen: 8000, known: [{ name: "山田 健太" }], travelMinutes: 90 });
  assert.equal(result.group, "other");
  assert.deepEqual(result.known, { count: 1, names: ["山田 健太"] });
  assert.deepEqual(result.warnings, [{ feeYen: 8000, kind: "budget", limitYen: 5000 }, { kind: "travel", limitMinutes: 60, minutes: 90 }]);
  assert.deepEqual(eventRelevance({ ...none, feeYen: 5000, travelMinutes: 60 }).warnings, [], "等于上限不算超");
});

test("排序：people → topic → other，组内按日期", () => {
  const rel = (group: "people" | "topic" | "other") => ({ group, known: null, people: [], topic: null, warnings: [] });
  const rows = [
    { id: "other-early", relevance: rel("other"), startsAt: "2026-11-10T10:00:00Z" },
    { id: "topic", relevance: rel("topic"), startsAt: "2026-11-11T10:00:00Z" },
    { id: "people-late", relevance: rel("people"), startsAt: "2026-11-30T10:00:00Z" },
    { id: "people-early", relevance: rel("people"), startsAt: "2026-11-20T10:00:00Z" },
    { id: "none", relevance: null, startsAt: "2026-11-01T10:00:00Z" },
  ];
  assert.deepEqual([...rows].sort(compareByRelevance).map((row) => row.id), ["people-early", "people-late", "topic", "other-early", "none"]);
});

test("读宽松：看不懂的单项跳过，整块坏了当 null", () => {
  const parsed = eventRelevanceObject.parse({ group: "weird", known: { count: 0, names: [] }, people: [{ count: 2, emoji: "💼", label: "VC", source: "registrants", typeKey: "vc" }, { bad: true }], topic: null, warnings: [{ kind: "calendar" }, { feeYen: 9000, kind: "budget", limitYen: 5000 }] });
  assert.equal(parsed.group, "other");
  assert.equal(parsed.people.length, 1);
  assert.equal(parsed.known, null);
  assert.deepEqual(parsed.warnings, [{ feeYen: 9000, kind: "budget", limitYen: 5000 }]);
});
