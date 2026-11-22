import assert from "node:assert/strict";
import test from "node:test";

import { runAgentGraph } from "../../features/agent-v1/graph/build";
import { listSearchWords } from "../../features/agent-v1/graph/nodes/resolve";
import { captureTrace, deepseekStub, graphKit, json, part, recordAccessOf, type ModelCall } from "./graph-kit";
import { memo, smallWorld } from "./read-kit";

/**
 * agent-design AG08 repair round 1: AE-UND-010 in the AG03 rerun at AG08 — the first layer gave "列出我记过的竞品" no
 * search words and no clue, and the read took the newest page of every note. Code searches by the part's own words.
 */

const ACTOR = "actor:a";
const NOW = "2026-11-15T01:00:00.000Z";

test("AE-UND-010: the part's own words, without the list verb, are the search words", () => {
  assert.equal(listSearchWords("列出我记过的竞品"), "竞品");
  assert.equal(listSearchWords("竞品笔记を一覧にして"), "竞品");
  assert.equal(listSearchWords("list my competitor notes"), "competitor");
});

function world() {
  const base = smallWorld();
  for (const record of base.records) if (record.userId === "user:a") record.userId = ACTOR;
  base.records.push(memo(ACTOR, "note:m33", "A 公司（Acme Cloud）标准版每席每月 1200 日元。", "2026-10-20T02:00:00.000Z", [], { title: "竞品笔记 A" }));
  base.records.push(memo(ACTOR, "note:m34", "B 公司（Borealis）起步价每月 30000 日元。", "2026-10-22T02:00:00.000Z", [], { title: "竞品笔记 B" }));
  return base;
}

test("AE-UND-010 graph: a note list with no search words from the first layer reads only the notes its words name", async () => {
  const message = "列出我记过的竞品";
  let materials = "";
  const replies: Record<string, (call: ModelCall) => string> = {
    answer: (call) => {
      materials = call.user;
      return json({ segments: [{ cites: [{ sentenceIds: [1], sourceRef: "s1" }], partId: "p1", text: "Acme Cloud 与 Borealis。" }] });
    },
    understand: () => json({ language: "zh", parts: [part({ dataSources: ["orbit_records"], deliverable: "list", requiredCapabilities: ["memo.read"], sourceQuote: message })], plainChat: false }),
  };
  const model = deepseekStub((call) => replies[call.node ?? ""](call));
  const records = recordAccessOf(world());
  const kit = graphKit(model.fetchImplementation, { now: NOW, records });
  const trace = captureTrace();
  try {
    await runAgentGraph(kit.deps, kit.input(message));
  } finally {
    trace.restore();
  }
  assert.match(materials, /Acme Cloud/u);
  assert.doesNotMatch(materials, /小林希望把实施费单列/u, "notes that are not about competitors are not read");
  assert.ok(trace.events.some((event) => event.type === "resolve.own_words" && event.words === "竞品"));
});
