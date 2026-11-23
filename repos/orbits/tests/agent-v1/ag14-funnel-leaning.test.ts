/**
 * agent-design AG14 (AE-SCL-027): among candidates that stay "not established" after the judgment, one the model found
 * more likely related than not — but under the calibrated threshold — is ordered before the ones it found unrelated.
 * It keeps the conservative label (it is never said to fit); a rule hit and every established level still go first;
 * candidates the model found unrelated keep their start-time order.
 */
import assert from "node:assert/strict";
import test from "node:test";

import { askJudgment, newJudgmentBudget } from "../../features/agent-v1/judgment/ask";
import { funnel, type FunnelCandidate } from "../../features/agent-v1/judgment/funnel";
import { access, graded, judgeStub } from "./judgment-kit";

type Event = FunnelCandidate & { startsAt: string };

/** The six day-time events of AE-SCL-027 (regular-v1), in start order. */
const EVENTS: Event[] = [
  { id: "re03", startsAt: "2026-11-21T01:00:00.000Z", words: "柴烧器物展 柴烧 器物" },
  { id: "plants", startsAt: "2026-11-21T02:00:00.000Z", words: "植物体验课 植物" },
  { id: "wood", startsAt: "2026-11-21T04:00:00.000Z", words: "木工工作坊 木工" },
  { id: "re05", startsAt: "2026-11-21T05:00:00.000Z", words: "茶道具市集 茶道具 市集" },
  { id: "clothes", startsAt: "2026-11-22T03:00:00.000Z", words: "古着工作坊 古着" },
  { id: "re04", startsAt: "2026-11-22T04:00:00.000Z", words: "金缮入门工作坊 金缮" },
];

/** The answers the judgment gave in the dev run (levels 0, 1, 2), by candidate. */
const ANSWERS: Record<string, [number, number, number]> = {
  clothes: [0.83, 0.14, 0.03],
  plants: [0.86, 0.1, 0.04],
  re03: [0.02, 0.34, 0.64],
  re04: [0.3, 0.44, 0.26],
  re05: [0.02, 0.33, 0.65],
  wood: [0.61, 0.31, 0.08],
};

async function rank(answers: Record<string, [number, number, number]>, threshold: number) {
  const stub = judgeStub(() => undefined);
  let keys = new Map<string, string>();
  const result = await funnel<Event>({
    basis: "器物、茶",
    candidates: EVENTS,
    count: 6,
    judge: async (kept) => {
      keys = new Map(kept.map(({ key, candidate }) => [key, candidate.id]));
      const judge = judgeStub((id) => graded(...answers[keys.get(id.replace(/^match_level__/u, ""))!]));
      return askJudgment(access(judge.fetchImplementation, { thresholds: { calibratedOn: "test", cells: { "match.level": { en: threshold, ja: threshold, zh: threshold } }, model: "gemini-decision-1", version: "t" } }), newJudgmentBudget(), { input: ["x"], items: kept.map(({ key }) => ({ key, question: "match.level", subject: key })), language: "ja", purpose: "rank" });
    },
    mode: "conversation",
    order: { direction: "asc", value: (candidate) => candidate.startsAt },
  });
  void stub;
  return result.ordered.map((item) => ({ id: item.candidate.id, level: item.level }));
}

test("under a strict threshold the leaning candidate comes third, still labelled not established", async () => {
  const ordered = await rank(ANSWERS, 0.932);
  assert.deepEqual(ordered.slice(0, 3).map((item) => item.id).sort(), ["re03", "re04", "re05"]);
  assert.deepEqual(ordered[2], { id: "re04", level: "insufficient" });
  // The ones the model found unrelated keep their start order after it.
  assert.deepEqual(ordered.slice(3).map((item) => item.id), ["plants", "wood", "clothes"]);
});

test("a candidate the model found unrelated never jumps ahead: with no leaning one, the order is the start time", async () => {
  const ordered = await rank({ ...ANSWERS, re04: [0.7, 0.2, 0.1] }, 0.932);
  assert.deepEqual(ordered.slice(2).map((item) => item.id), ["plants", "wood", "clothes", "re04"]);
});

test("a leaning below one half does not count (it is more likely unrelated than not)", async () => {
  const ordered = await rank({ ...ANSWERS, re04: [0.55, 0.3, 0.15] }, 0.932);
  assert.deepEqual(ordered.slice(2).map((item) => item.id), ["plants", "wood", "clothes", "re04"]);
});
