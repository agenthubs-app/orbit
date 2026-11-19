import assert from "node:assert/strict";
import test from "node:test";

import { seenAllowedBy, seenCountsIn, withoutWrongSeenCounts } from "../../features/agent-v1/answer/counts";
import { runAgentGraph } from "../../features/agent-v1/graph/build";
import { captureTrace, deepseekStub, graphKit, json, part, recordAccessOf } from "./graph-kit";
import { pagedWorld } from "./read-kit";

/**
 * agent-design AG09 opening item (AG08 协调者复核 交接 2, AE-SCL-008): a sentence that says how many records were seen
 * this turn must agree with the read's coverage record; one that does not is not delivered (code's coverage line says
 * the right numbers). In AE-SCL-008 the answer said 「10件しか見えていない」 while 50 of 64 had been seen.
 */

test("seen counts are found in zh, ja and en; listing or checking is not a seen count", () => {
  assert.deepEqual(seenCountsIn("ただし期限が近い順に10件しか見えていないので、これは一部です。"), [10]);
  assert.deepEqual(seenCountsIn("なお、期限が近い50件を見ただけで、それより先のものは見ていません。"), [50]);
  assert.deepEqual(seenCountsIn("我只看到 7 条，其余的没看。"), [7]);
  assert.deepEqual(seenCountsIn("看了其中 50 条。"), [50]);
  assert.deepEqual(seenCountsIn("I only looked at the first 10 notes."), [10]);
  assert.deepEqual(seenCountsIn("期限を過ぎているものは3件です。"), [], "a count of what was found is not a seen count");
  assert.deepEqual(seenCountsIn("下面列出 3 条过期的待办。"), [], "listing is not coverage");
});

test("AE-SCL-008's answer: the sentence saying 10 were seen goes, the one saying 50 stays", () => {
  const said = "東都精機の鈴木健太さんに関連する未完了のToDoは全部で64件です。ただし期限が近い順に10件しか見えていないので、これは全体の一部を並べたものではありません。\n\n期限を過ぎている未完了のToDoは次の3件です。なお、期限が近い50件を見ただけで、それより先のものは見ていません。";
  const allowed = seenAllowedBy([{ seen: 50 }]);
  const { dropped, text } = withoutWrongSeenCounts(said, allowed);
  assert.deepEqual(dropped, [10]);
  assert.doesNotMatch(text, /10件しか/u);
  assert.match(text, /全部で64件です。/u);
  assert.match(text, /50件を見ただけ/u);
  assert.equal(withoutWrongSeenCounts("我看了 50 条。", allowed).text, "我看了 50 条。");
  assert.deepEqual([...seenAllowedBy([{ seen: 20 }, { seen: 30 }])].sort((a, b) => a - b), [20, 30, 50], "several kinds: each and the sum");
});

test("graph: a read that saw part of the notes does not deliver a sentence with a different seen count", async () => {
  const trace = captureTrace();
  try {
    const world = pagedWorld(400);
    for (const record of world.records) if (record.userId === "user:a") record.userId = "actor:a";
    const records = recordAccessOf(world, { maxPages: 1 });
    const message = "我和小林健的笔记一共有多少篇？最近一篇写了什么？";
    const model = deepseekStub([
      json({ parts: [part({ dataSources: ["orbit_records"], objectClues: [{ entity: "contact", text: "小林健" }], requiredCapabilities: ["memo.read"], sourceQuote: message })], plainChat: false }),
      (call) => {
        const handle = /(s\d+) — memo/u.exec(call.user)![1];
        return json({ segments: [{ cites: [{ sentenceIds: [1], sourceRef: handle }], partId: "p1", text: "我只看到 7 条，其余的没看。最近一篇是第 399 篇。" }] });
      },
    ]);
    const kit = graphKit(model.fetchImplementation, { records });
    const result = await runAgentGraph(kit.deps, kit.input(message));
    const coverage = result.partResults[0].coverage ?? [];
    assert.ok(coverage.length && coverage[0].seen !== 7 && coverage[0].seen < (coverage[0].total ?? Infinity), `a partial read (${JSON.stringify(coverage)})`);
    assert.doesNotMatch(result.text, /只看到 7 条/u);
    assert.match(result.text, /第 399 篇/u);
    assert.ok(trace.events.some((event) => event.type === "answer.seen_counts_dropped"));
  } finally {
    trace.restore();
  }
});
