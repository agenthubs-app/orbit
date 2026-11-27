import assert from "node:assert/strict";
import test from "node:test";
import { buildSync } from "esbuild";
import { createRequire } from "node:module";

// 2026-11-15 活动不再打分：「あなたに関係すること」的标签（纯函数）与事实卡（renderToStaticMarkup）。
// docs/designs/redesign-2026-10/event-relevance-proposal.html：标签最多 3 个，顺序 想见的人(≤2) → 认识的人 → 主题 → 提醒，有提醒总留一格。
const compiled = buildSync({ stdin: { contents: `
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { RelevanceCard, RelevanceChips, relevanceChips, relevanceRows, registrationChipText } from './app/(app)/app/orbit-2026/events/Relevance';
export { relevanceChips, relevanceRows, registrationChipText };
export function card(relevance, language) { return renderToStaticMarkup(<RelevanceCard relevance={relevance} language={language} />); }
export function chips(relevance, language) { return renderToStaticMarkup(<RelevanceChips relevance={relevance} language={language} />); }
`, loader: "tsx", resolveDir: process.cwd() }, bundle: true, write: false, platform: "node", format: "cjs", packages: "external", loader: { ".css": "empty", ".module.css": "empty" }, jsx: "automatic" });
type Rel = Record<string, unknown> | null | undefined;
const m: {
  relevanceChips: (rel: Rel, language: string) => { key: string; tone: string; text: string }[];
  relevanceRows: (rel: Rel, language: string) => { key: string; main: string; basis: string | null }[];
  registrationChipText: (count: number | null | undefined, language: string) => string | null;
  card: (rel: Rel, language: string) => string;
  chips: (rel: Rel, language: string) => string;
} = {} as never;
const mod = { exports: m };
new Function("require", "module", "exports", compiled.outputFiles[0]!.text)(createRequire(process.cwd() + "/package.json"), mod, m);
Object.assign(m, mod.exports);

const person = (label: string, count: number, source = "registrants") => ({ count, emoji: "💼", label, source, typeKey: label.toLowerCase() });
const empty = { group: "other", known: null, people: [], topic: null, warnings: [] };
const budget = { feeYen: 15000, kind: "budget", limitYen: 5000 };
const travel = { kind: "travel", limitMinutes: 60, minutes: 95 };
const texts = (rel: Rel, language = "ja") => m.relevanceChips(rel, language).map((chip) => chip.text);

test("chips: people (≤2) → known → warning; the wording per source and language", () => {
  const rel = { ...empty, group: "people", known: { count: 2, names: [] }, people: [person("CFO", 3), person("VC", 2, "speakers"), person("弁護士", 1)] };
  assert.deepEqual(texts(rel), ["CFO 3名", "VC 2名（登壇）", "知り合い 2名"]);
  assert.deepEqual(texts(rel, "zh"), ["CFO 3位", "VC 2位（演讲）", "认识的人2位"]);
  assert.deepEqual(texts(rel, "en"), ["CFO ×3", "VC ×2 (speaking)", "2 you know"]);
  assert.deepEqual(texts({ ...empty, group: "people", people: [person("製造業 DX 責任者", 12, "exhibitors")] }), ["製造業 DX 責任者 12社"]);
  assert.deepEqual(texts({ ...empty, group: "people", people: [person("Maker", 12, "exhibitors")] }, "en"), ["Maker · 12 exhibitors"]);
  assert.deepEqual(m.relevanceChips(rel, "ja").map((chip) => chip.tone), ["lav", "lav", "teal"]);
});

test("chips: a warning always keeps one of the 3 slots; more warnings fill free slots", () => {
  const full = { ...empty, group: "people", known: { count: 1, names: [] }, people: [person("CFO", 3), person("VC", 2)], warnings: [budget] };
  assert.deepEqual(texts(full), ["CFO 3名", "VC 2名", "予算オーバー"]);
  assert.deepEqual(m.relevanceChips(full, "ja").map((chip) => chip.tone), ["lav", "lav", "warn"]);
  assert.deepEqual(texts({ ...empty, group: "people", people: [person("CFO", 3)], warnings: [budget, travel] }), ["CFO 3名", "予算オーバー", "移動が長い"]);
  assert.deepEqual(texts({ ...empty, warnings: [travel] }, "zh"), ["路程较远"]);
  assert.deepEqual(texts({ ...empty, warnings: [budget] }, "en"), ["Over budget"]);
});

test("chips: topic only when nobody is listed; nothing for no relevance / an empty one", () => {
  assert.deepEqual(texts({ ...empty, group: "topic", topic: { labels: ["VC パートナー"] } }), ["テーマが近い"]);
  assert.deepEqual(texts({ ...empty, group: "topic", topic: { labels: ["VC"] } }, "en"), ["Related topic"]);
  assert.deepEqual(texts({ ...empty, group: "people", people: [person("VC", 1)], topic: { labels: ["VC"] } }), ["VC 1名"]);
  assert.deepEqual(texts(null), []);
  assert.deepEqual(texts(undefined), []);
  assert.deepEqual(texts(empty), []);
  assert.equal(m.chips(empty, "ja"), "");
  assert.equal(m.chips(null, "ja"), "");
});

test("registration chip: only from 10 registrations", () => {
  assert.equal(m.registrationChipText(9, "ja"), null);
  assert.equal(m.registrationChipText(null, "ja"), null);
  assert.equal(m.registrationChipText(128, "ja"), "申込 128名");
  assert.equal(m.registrationChipText(10, "zh"), "报名10人");
  assert.equal(m.registrationChipText(46, "en"), "46 registered");
});

test("card: 0 registrants, topic only → one row 「目標の「A」「B」に近いテーマ」 from the description (plan or profile goal)", () => {
  const html = m.card({ ...empty, group: "topic", topic: { labels: ["VC パートナー", "起業家"] } }, "ja");
  assert.match(html, /data-relevance-card/);
  assert.match(html, /あなたに関係すること/);
  assert.equal((html.match(/data-relevance-row=/g) ?? []).length, 1);
  assert.match(html, /目標の「VC パートナー」「起業家」に近いテーマ<small>イベント説明より<\/small>/);
  assert.match(m.card({ ...empty, group: "topic", topic: { labels: ["VC", "Founder"] } }, "en"), /Close to “VC”, “Founder” in your goals<small>From the event description<\/small>/);
  assert.match(m.card({ ...empty, group: "topic", topic: { labels: ["VC"] } }, "zh"), /与你目标里的「VC」主题相近<small>来自活动说明<\/small>/);
});

test("card: people + known + budget → three rows with their basis lines; budget in coral", () => {
  const rel = { ...empty, group: "people", known: { count: 2, names: ["山田 健太", "高橋 葵"] }, people: [person("CFO", 3), person("VC", 2)], warnings: [budget] };
  const html = m.card(rel, "ja");
  assert.equal((html.match(/data-relevance-row=/g) ?? []).length, 3);
  assert.match(html, /会いたい人 · CFO 3名 · VC 2名<small>申込者より<\/small>/);
  assert.match(html, /知り合い 2名が参加予定<small>山田 健太・高橋 葵<\/small>/);
  assert.match(html, /予算 ¥5,000 を超えています<small>参加費 ¥15,000<\/small>/);
  assert.ok(html.indexOf('data-relevance-row="people"') < html.indexOf('data-relevance-row="known"'));
  assert.ok(html.indexOf('data-relevance-row="known"') < html.indexOf('data-relevance-row="budget-0"'));
  assert.doesNotMatch(html, /おすすめ|スコア|\/ 100/);
  const zh = m.card(rel, "zh");
  assert.match(zh, /和你有关/); assert.match(zh, /想见的人 · CFO 3位 · VC 2位<small>来自报名名单<\/small>/); assert.match(zh, /认识的人有2位参加/); assert.match(zh, /超出预算 ¥5,000<small>费用 ¥15,000<\/small>/);
  const en = m.card(rel, "en");
  assert.match(en, /About you/); assert.match(en, /People you want to meet · CFO ×3 · VC ×2<small>From registrations<\/small>/); assert.match(en, /2 people you know are going/); assert.match(en, /Over your ¥5,000 budget<small>Fee ¥15,000<\/small>/);
});

test("card: known without names has no basis line; speakers / travel wording", () => {
  const rows = m.relevanceRows({ ...empty, group: "people", known: { count: 1, names: [] }, people: [person("VC", 2, "speakers")], warnings: [travel] }, "ja");
  assert.deepEqual(rows.map((row) => [row.main, row.basis]), [["会いたい人 · VC 2名（登壇）", "登壇者より"], ["知り合い 1名が参加予定", null], ["移動 約95分（上限 60分）", null]]);
  assert.equal(m.relevanceRows({ ...empty, warnings: [travel] }, "zh")[0]!.main, "路程约95分钟（上限60分钟）");
  assert.equal(m.relevanceRows({ ...empty, warnings: [travel] }, "en")[0]!.main, "About 95 min away (limit 60)");
});

test("card: nothing to say → nothing rendered", () => {
  assert.equal(m.card(empty, "ja"), "");
  assert.equal(m.card(null, "ja"), "");
  assert.equal(m.card(undefined, "en"), "");
  assert.equal(m.card({ ...empty, known: { count: 0, names: [] } }, "ja"), "");
});
