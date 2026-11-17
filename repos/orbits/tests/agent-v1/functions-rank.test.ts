import assert from "node:assert/strict";
import test from "node:test";

import { rankCandidates, type RankCandidate } from "../../features/agent-v1/functions/rank";
import { graded } from "./judgment-kit";
import { fnWorld, runFn } from "./functions-kit";

/**
 * agent-design AG10-2: only candidates read under the account's authorization; a time that is not announced stays
 * unknown and is listed apart; ties come out in the same order whatever the input order; a judgment answer for a
 * candidate that does not exist (E999), or a repeated one, is rejected.
 */

interface Item extends RankCandidate {
  startsAt: string | null;
}
const item = (id: string, startsAt: string | null, words = ""): Item => ({ id, ref: `event:${id}`, startsAt, words });

test("ties: shuffled ten times, the same order (the natural field, then the record id)", async () => {
  const items = [item("e3", "2026-11-21T01:00:00.000Z"), item("e1", "2026-11-21T01:00:00.000Z"), item("e2", "2026-11-22T01:00:00.000Z"), item("e4", "2026-11-21T01:00:00.000Z"), item("e0", "2026-11-20T01:00:00.000Z")];
  const orders = new Set<string>();
  for (let round = 0; round < 10; round += 1) {
    const shuffled = [...items].sort(() => Math.random() - 0.5);
    const result = await rankCandidates<Item>({ candidates: shuffled, count: 5, field: null, natural: { direction: "asc", value: (candidate) => candidate.startsAt }, time: [{ days: "weekend", hard: false, exclude: false, part: "morning", source: "turn", words: "周末上午" }], timeOf: (candidate) => candidate.startsAt, timeZone: "Asia/Tokyo", topic: null });
    orders.add(result.ordered.map((entry) => entry.candidate.id).join(","));
  }
  assert.deepEqual([...orders], ["e1,e3,e4,e2,e0"]);
});

test("a start time that is missing or cannot be read is listed apart, never placed in the time order", async () => {
  const result = await rankCandidates<Item>({ candidates: [item("e1", "2026-11-21T01:00:00.000Z"), item("e106", null), item("bad", "not a time"), item("e2", "2026-11-19T10:00:00.000Z")], count: 10, field: { direction: "asc", value: (candidate) => candidate.startsAt }, natural: { direction: "asc", value: (candidate) => candidate.startsAt }, time: [], timeOf: (candidate) => candidate.startsAt, timeZone: "Asia/Tokyo", topic: null });
  assert.deepEqual(result.ordered.map((entry) => entry.candidate.id), ["e2", "e1"]);
  assert.deepEqual(result.untimed.map((entry) => entry.id).sort(), ["bad", "e106"]);
});

test("the judgment's answer for E999 (never asked) and a repeated candidate are rejected; only real candidates are listed", async () => {
  const result = await rankCandidates<Item>({
    candidates: [item("e1", "2026-11-21T01:00:00.000Z", "摄影展"), item("e1", "2026-11-21T01:00:00.000Z", "摄影展"), item("e2", "2026-11-22T00:30:00.000Z", "街拍"), item("e4", "2026-11-21T10:00:00.000Z", "设计")],
    count: 2,
    field: null,
    judge: async (kept) => ({ durationMs: 1, inputTokens: 1, rejected: 1, sent: true, unavailable: null, verdicts: new Map(kept.map(({ key }) => [key, { answer: key === "c3" ? "insufficient" : "match", confidence: 0.9, fallback: false, key, question: "match.level" as const, raw: "match", reason: null, threshold: 0.6 }])) }),
    natural: { direction: "asc", value: (candidate) => candidate.startsAt },
    time: [],
    timeOf: (candidate) => candidate.startsAt,
    timeZone: "Asia/Tokyo",
    topic: "摄影展和街拍",
  });
  assert.equal(result.rejected, 1, "the E999 answer is counted as rejected");
  assert.deepEqual(result.ordered.map((entry) => entry.candidate.id).sort(), ["e1", "e2"]);
  assert.ok(result.ordered.every((entry) => entry.candidate.id !== "E999"));
});

test("graph (AE-FN-007): an E999 answer from the judgment is dropped and traced; two real events of the dates are listed", async () => {
  const message = "从 11 月 21 日和 22 日的活动里挑两场，最好跟 @兴趣笔记 的主题有关。";
  const run = await runFn(message, [{ dataSources: ["orbit_records"], deliverable: "ranked_list", objectClues: [{ entity: "memo", referenceId: "r1", text: "@兴趣笔记" }], rank: { basis: "@兴趣笔记 的主题", count: 2 }, readFilter: { from: "2026-11-21", to: "2026-11-22" }, requiredCapabilities: ["event.read", "memo.read", "fn.rank"], sourceQuote: message }], {
    judge: (id) => (id.endsWith("c4") ? graded(0.9, 0.05, 0.05) : graded(0.05, 0.15, 0.8)),
    judgeOptions: { extra: { match_level__E999: graded(0, 0, 1) } },
    references: [{ id: "note:m36", name: "兴趣笔记", type: "memo" }],
  });
  const listed = run.events.filter((event) => event.type === "fn.rank").at(-1)!.listed as string[];
  assert.equal(listed.length, 2);
  for (const ref of listed) assert.ok(["event:event:e101", "event:event:e102", "event:event:e105"].includes(ref), ref);
  assert.ok(run.events.some((event) => event.type === "functions.rejected" && Number(event.rejected) === 1));
  assert.doesNotMatch(run.result.text, /E999/u);
});

test("graph (AE-FN-006): 'AI 和定价方面的活动，按时间先后排' — only the related ones, by start time; one with no time is said to be not announced", async () => {
  const message = "我想去听 AI 和定价方面的活动，把相关的几场按时间先后排一下。";
  const run = await runFn(message, [{ dataSources: ["orbit_records"], deliverable: "ranked_list", rank: { basis: "AI 和定价", direction: "asc", orderBy: "startsAt" }, readFilter: { order: "newest", text: "AI 和定价" }, requiredCapabilities: ["event.read", "fn.rank"], sourceQuote: message }], { judge: () => graded(0.9, 0.05, 0.05) });
  const ranked = run.events.filter((event) => event.type === "fn.rank").at(-1)!;
  assert.deepEqual(ranked.listed, ["event:event:e103"]);
  assert.deepEqual(ranked.untimed, ["event:event:e106"], "the account's own draft with no start time: not announced");
  assert.match(run.result.text, /SaaS 定价研讨会（11月19日（周四） 19:00/u);
  assert.match(run.result.text, /时间未公布（没有排进先后）：AI 产品沙龙/u);
  assert.doesNotMatch(run.result.text, /AI 产品沙龙（\d/u, "no date given to E106");
});

test("graph: only what the account may read — another organizer's draft and another account's records never appear", async () => {
  const message = "按开始时间列出公开的活动。";
  const run = await runFn(message, [{ dataSources: ["orbit_records"], deliverable: "list", rank: { direction: "asc", orderBy: "startsAt" }, requiredCapabilities: ["event.read", "fn.rank"], sourceQuote: message }]);
  const listed = run.events.filter((event) => event.type === "fn.rank").at(-1)!.listed as string[];
  assert.ok(!listed.includes("event:event:other-draft"));
  assert.deepEqual(listed, ["event:event:e103", "event:event:e101", "event:event:e104", "event:event:e102", "event:event:e105", "event:event:e107"]);
  void fnWorld;
});
