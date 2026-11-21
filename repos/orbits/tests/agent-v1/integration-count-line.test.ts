/**
 * Release-2 gate 2 (AE-ANS-002; AE-MEM-001, 003, 006, 009, 011): with saved preferences applied the count line under the
 * lead said how many passed the hard conditions — 「符合条件的一共22场」 where 22 were left after the saved evening rule, not
 * the ones that fit the saved topic; 「符合条件的一共5场」 where only 3 of the week's 5 are at the preferred time. The count line
 * now says how many meet everything the lead names (the hotfix's code-owned count rule), and how many there were.
 */
import assert from "node:assert/strict";
import test from "node:test";

import { rankCountLine } from "../../features/agent-v1/graph/nodes/functions";
import { graded } from "./judgment-kit";
import { runFn, type TestMemory } from "./functions-kit";

const MM1: TestMemory = { appliesTo: ["event.recommend"], category: "preference", content: "推荐活动时优先周末上午", id: "MM1", structured: { dayPart: "morning", preferredDays: ["Sat", "Sun"], strength: "prefer" } };
const MM2: TestMemory = { appliesTo: ["event.recommend"], category: "constraint", content: "不要推荐晚上的活动", id: "MM2" };
const PHOTO: TestMemory = { appliesTo: ["event.recommend"], category: "preference", content: "推荐活动时优先摄影主题", id: "MM4", structured: { strength: "prefer", topics: ["摄影"] } };
const EVENT_RANK = (quote: string, extra: Record<string, unknown> = {}) => ({ dataSources: ["orbit_records"], deliverable: "ranked_list", requiredCapabilities: ["event.read", "fn.rank"], sourceQuote: quote, ...extra });
const UNIT = { en: "", ja: "件", zh: "场" };

test("AE-MEM-001/003/006/009/011 「给我推荐几场下周的活动。」 with 「优先周末上午」 saved: 5 in the week, 3 at that time — the line says 3", async () => {
  const message = "给我推荐几场下周的活动。";
  const run = await runFn(message, [EVENT_RANK(message, { readFilter: { from: "2026-11-16", to: "2026-11-22" } })], { memories: [MM1] });
  assert.match(run.result.text, /这段时间一共5场，符合条件的一共3场。/u, run.result.text);
  assert.doesNotMatch(run.result.text, /符合条件的一共5场/u);
});

test("AE-ANS-002 「最近有哪些活动适合我？」 with a saved topic and 「不要晚上的」: the upcoming in all, then those that fit the topic", async () => {
  const message = "最近有哪些活动适合我？";
  const run = await runFn(message, [{ dataSources: ["orbit_records"], deliverable: "list", requiredCapabilities: ["event.read"], sourceQuote: message }], { judge: (id, _question, call) => {
    // A match for the events whose line names 摄影; the others do not fit.
    const key = id.replace(/^match_level__/u, "");
    const line = call.body.input.map((item) => item.text).join("\n").split("\n").find((text) => text.startsWith(`[${key}]`)) ?? "";
    return /摄影/u.test(line) ? graded(0.05, 0.15, 0.8) : graded(0.9, 0.05, 0.05);
  }, memories: [PHOTO, MM2] });
  // Six events have not started (and one has no time yet); two of them start in the evening; three of the rest are about 摄影.
  assert.match(run.result.text, /还没开始的活动共6场，符合条件的一共3场。/u, run.result.text);
  assert.doesNotMatch(run.result.text, /符合条件的一共4场/u, "the four left after the evening rule are not all a fit");
});

test("the line: fewer meet than are listed, none meets, not all looked at, and unchanged when nothing only ranks", () => {
  const base = { inScope: null, judged: 0, matching: 5, noun: "活动", period: false, semantic: false, truncated: 0, unit: UNIT, upcoming: false };
  assert.equal(rankCountLine("zh", { ...base, listed: 3, meeting: 5 }), "符合条件的一共5场，这里列的是前3场。", "as before");
  assert.equal(rankCountLine("zh", { ...base, listed: 5, meeting: 3 }), "符合条件的有3场，排在前面；后面2场不完全符合。");
  assert.equal(rankCountLine("zh", { ...base, listed: 3, meeting: 0 }), "没有完全符合这些条件的，下面是最接近的3场。");
  assert.equal(rankCountLine("zh", { ...base, judged: 20, listed: 3, meeting: 4, semantic: true, truncated: 8 }), "符合条件的一共4场，这里列的是前3场。（这次细看了20场，还有8场没有细看。）");
  assert.equal(rankCountLine("en", { ...base, inScope: 30, listed: 3, meeting: 4, noun: "events", upcoming: true, unit: { en: "", ja: "件", zh: "场" } }), "30 events have not started yet; 4 in all match; these are the first 3.");
});
