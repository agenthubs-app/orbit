import assert from "node:assert/strict";
import test from "node:test";
import React from "react";

import type { EventRelevance } from "../src/api/contract/event-relevance";
import { eventsV2 as en } from "../src/i18n/en/eventsV2";
import { eventsV2 as ja } from "../src/i18n/ja/eventsV2";
import { eventsV2 as zh } from "../src/i18n/zh/eventsV2";
import { RelevanceCard, RelevanceChips, registrationChipLabel, relevanceChips, relevanceRows, type RelevanceT } from "../src/screens/events/v2/Relevance";
import { planEventGroups } from "../src/screens/plan/plan-type-kit";
import type { PlanEventOption } from "../src/api/contract/plan-v2";
import { renderedText, renderToHtml } from "./helpers/render";

// 2026-11-15 活动不再打分（event-relevance-proposal.html）：标签与「あなたに関係すること」卡只由 EventRelevance 拼。
const translator = (dictionary: Record<string, string>): RelevanceT => (key, values) =>
  (dictionary[key] ?? key).replace(/\{(\w+)\}/gu, (_, name: string) => String(values?.[name] ?? ""));
const tJa = translator(ja);
const tZh = translator(zh);
const tEn = translator(en);

const empty: EventRelevance = { group: "other", known: null, people: [], topic: null, warnings: [] };
const vc = { count: 3, emoji: "💼", label: "VC パートナー", source: "registrants", typeKey: "vc" } as const;
const cfo = { count: 2, emoji: "📊", label: "CFO", source: "speakers", typeKey: "cfo" } as const;
const lawyer = { count: 1, emoji: "⚖️", label: "弁護士", source: "exhibitors", typeKey: "lawyer" } as const;
const budget = { feeYen: 8000, kind: "budget", limitYen: 5000 } as const;
const travel = { kind: "travel", limitMinutes: 60, minutes: 95 } as const;

test("chips: wording per source and language", () => {
  const rel: EventRelevance = { ...empty, group: "people", people: [vc, cfo] };
  assert.deepEqual(relevanceChips(rel, tJa).map((chip) => chip.label), ["VC パートナー 3名", "CFO 2名（登壇）"]);
  assert.deepEqual(relevanceChips(rel, tZh).map((chip) => chip.label), ["VC パートナー 3位", "CFO 2位（演讲）"]);
  assert.deepEqual(relevanceChips(rel, tEn).map((chip) => chip.label), ["VC パートナー ×3", "CFO ×2 (speaking)"]);
  assert.deepEqual(relevanceChips({ ...empty, group: "people", people: [lawyer] }, tJa).map((chip) => chip.label), ["弁護士 1社"]);
  assert.deepEqual(relevanceChips({ ...empty, group: "people", people: [lawyer] }, tEn).map((chip) => chip.label), ["弁護士 · 1 exhibitors"]);
  assert.deepEqual(relevanceChips({ ...empty, group: "topic", known: { count: 1, names: [] }, topic: { labels: ["VC"] }, warnings: [travel] }, tJa).map((chip) => [chip.label, chip.tone]),
    [["知り合い 1名", "teal"], ["テーマが近い", "blue"], ["移動が長い", "coral"]]);
});

test("chips: at most 3, people (≤2) → known → topic → warnings, and a warning always keeps a slot", () => {
  const full: EventRelevance = { group: "people", known: { count: 2, names: ["山田"] }, people: [vc, cfo, lawyer], topic: null, warnings: [budget] };
  assert.deepEqual(relevanceChips(full, tJa).map((chip) => chip.kind), ["people", "people", "budget"]);
  assert.deepEqual(relevanceChips({ ...full, warnings: [] }, tJa).map((chip) => chip.kind), ["people", "people", "known"]);
  assert.deepEqual(relevanceChips({ ...full, people: [vc] }, tJa).map((chip) => chip.kind), ["people", "known", "budget"]);
  assert.deepEqual(relevanceChips({ ...empty, warnings: [budget, travel] }, tJa).map((chip) => chip.kind), ["budget", "travel"]);
  assert.deepEqual(relevanceChips({ ...full, people: [vc], warnings: [budget, travel] }, tJa).map((chip) => chip.kind), ["people", "known", "budget"]);
  assert.deepEqual(relevanceChips(empty, tJa), []);
  assert.deepEqual(relevanceChips(null, tJa), []);
  assert.deepEqual(relevanceChips(undefined, tJa), []);
});

test("registration chip only from 10 registrants", () => {
  assert.equal(registrationChipLabel(128, tJa), "申込 128名");
  assert.equal(registrationChipLabel(10, tZh), "报名10人");
  assert.equal(registrationChipLabel(12, tEn), "12 registered");
  assert.equal(registrationChipLabel(9, tJa), null);
  assert.equal(registrationChipLabel(0, tJa), null);
  assert.equal(registrationChipLabel(null, tJa), null);
});

test("card: a new event with 0 registrants shows only the topic row", () => {
  const rel: EventRelevance = { ...empty, group: "topic", topic: { labels: ["VC パートナー", "起業家"] } };
  const text = renderedText(<RelevanceCard relevance={rel} t={tJa} />);
  assert.match(text, /あなたに関係すること/u);
  assert.match(text, /目標の「VC パートナー」「起業家」に近いテーマ/u);
  assert.match(text, /イベント説明より/u);
  assert.doesNotMatch(text, /会いたい人|知り合い|予算/u);
  assert.match(renderedText(<RelevanceCard relevance={rel} t={tEn} />), /Close to “VC パートナー”, “起業家” in your goals/u);
  assert.match(renderedText(<RelevanceCard relevance={rel} t={tZh} />), /与你目标里的「VC パートナー」「起業家」主题相近/u);
});

test("card: people + known + budget, one row each with its basis", () => {
  const rel: EventRelevance = { group: "people", known: { count: 1, names: ["山田 健太", "高橋 葵"] }, people: [{ ...vc, label: "CFO", count: 3 }, { ...vc, label: "VC", count: 2, typeKey: "vc2" }], topic: null, warnings: [budget] };
  const text = renderedText(<RelevanceCard relevance={rel} t={tJa} onPeople={() => undefined} />);
  assert.match(text, /会いたい人 · CFO 3名 · VC 2名/u);
  assert.match(text, /申込者より/u);
  assert.match(text, /知り合い 1名が参加予定/u);
  assert.match(text, /山田 健太・高橋 葵/u);
  assert.match(text, /予算 ¥5,000 を超えています/u);
  assert.match(text, /参加費 ¥8,000/u);
  assert.match(renderToHtml(<RelevanceCard relevance={rel} t={tJa} onPeople={() => undefined} />), /role="button"[^>]*aria-label="会いたい人 · CFO 3名 · VC 2名"|aria-label="会いたい人 · CFO 3名 · VC 2名"[^>]*role="button"/u);
  const zhText = renderedText(<RelevanceCard relevance={rel} t={tZh} />);
  assert.match(zhText, /和你有关/u);
  assert.match(zhText, /想见的人 · CFO 3位 · VC 2位/u);
  assert.match(zhText, /认识的人有1位参加/u);
  assert.match(zhText, /超出预算 ¥5,000/u);
  assert.equal(relevanceRows({ ...rel, people: [cfo] }, tJa)[0]!.basis, "登壇者より");
  assert.equal(relevanceRows({ ...rel, known: { count: 2, names: [] } }, tJa)[1]!.basis, null);
  assert.equal(relevanceRows({ ...empty, warnings: [travel] }, tJa)[0]!.main, "移動 約95分（上限 60分）");
});

test("card: nothing to say → nothing rendered; no scores anywhere", () => {
  assert.equal(renderToHtml(<RelevanceCard relevance={empty} t={tJa} />), "");
  assert.equal(renderToHtml(<RelevanceCard relevance={null} t={tJa} />), "");
  assert.equal(renderToHtml(<RelevanceChips chips={[]} />), "");
  const text = renderedText(<RelevanceCard relevance={{ ...empty, group: "people", people: [vc] }} t={tJa} />);
  assert.doesNotMatch(text, /おすすめ|条件付き|見送り|点/u);
});

test("plan type events: people → topic → other groups, by date inside, empty groups left out", () => {
  const option = (eventId: string, startsAt: string, group: EventRelevance["group"] | null): PlanEventOption => ({
    eventId, expectedCount: null, relevance: group ? { ...empty, group } : null, score: { rubricVersion: "v2", scoreBreakdown: [], total: 99, verdict: "recommend" }, startsAt, title: eventId, venue: null,
  });
  const groups = planEventGroups([
    option("other-high-score", "2026-11-01T10:00:00+09:00", "other"),
    option("people-late", "2026-11-20T10:00:00+09:00", "people"),
    option("people-early", "2026-11-10T10:00:00+09:00", "people"),
    option("no-relevance", "2026-11-02T10:00:00+09:00", null),
  ]);
  assert.deepEqual(groups.map((entry) => [entry.group, entry.events.map((event) => event.eventId)]), [
    ["people", ["people-early", "people-late"]],
    ["other", ["other-high-score", "no-relevance"]],
  ]);
});
