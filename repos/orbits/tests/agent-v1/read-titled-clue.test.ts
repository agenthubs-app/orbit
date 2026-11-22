import assert from "node:assert/strict";
import test from "node:test";

import { runAgentGraph } from "../../features/agent-v1/graph/build";
import { captureTrace, deepseekStub, graphKit, json, part, recordAccessOf, type ModelCall } from "./graph-kit";
import { memo, smallWorld } from "./read-kit";

/**
 * agent-design AG09 run-04 (coordinator, AE-WEB-004 R3 at 4f4815fa0). The first layer split "上网查一下我竞品笔记 C 里那家公司
 * 现在的官网报价。" into a memo read (clue "竞品笔记 C", no readFilter) and a web part. The clue's search words had "笔记" taken
 * out as a generic word ("竞品c"), which no note contains, so note C was not found and the answer said "没有找到相关的内容".
 * (The trace shows the 4f4815fa0 described-clue rule did not fire here: the clue was "竞品笔记 C", not a demonstrative.)
 * 1. A record clue that names a record by its title or label ("竞品笔记 C", "笔记 C") is also searched as written.
 * 2. A read part whose search came back empty does not say "nothing found" when another part of the same turn, whose
 *    words hold it, read and cited the record.
 */

const ACTOR = "actor:a";

function world() {
  const base = smallWorld();
  for (const record of base.records) if (record.userId === "user:a") record.userId = ACTOR;
  base.records.push(memo(ACTOR, "note:m33", "A 公司（Acme Cloud）标准版每席每月 1200 日元，年付九折。销售说可以谈到 1000。", "2026-10-20T02:00:00.000Z", [], { title: "竞品笔记 A" }));
  base.records.push(memo(ACTOR, "note:m35", "C 公司（Cirrus Works）不公开报价，朋友说去年签的是每席 900 日元。", "2026-10-25T02:00:00.000Z", [], { title: "竞品笔记 C" }));
  return base;
}

const handleOf = (call: ModelCall, pattern: RegExp) => pattern.exec(call.user)?.[1];

test("AE-WEB-004 wording, round 1: the note titled 竞品笔记 C is found by its title and answered from", async () => {
  const message = "上网查一下我竞品笔记 C 里那家公司现在的官网报价。";
  const replies: Record<string, (call: ModelCall) => string> = {
    answer: (call) => {
      const handle = handleOf(call, /(s\d+) — memo "竞品笔记 C"/u);
      assert.ok(handle, "note C is among the materials");
      return json({ segments: [{ cites: [{ sentenceIds: [1, 2], sourceRef: handle! }], partId: "p1", text: "笔记 C 记的是 Cirrus Works：不公开报价，朋友说去年签的是每席 900 日元。" }] });
    },
    // The first layer's output recorded in the failing run (20261117-235437-4f4815f-AG09-gate-run-03).
    understand: () => json({ parts: [
      part({ dataSources: ["orbit_records"], localId: "p1", objectClues: [{ entity: "memo", text: "竞品笔记 C" }], requiredCapabilities: ["memo.read"], sourceQuote: "我竞品笔记 C 里那家公司" }),
      part({ dataSources: ["public_web"], localId: "p2", requiredCapabilities: ["web.search"], sourceQuote: "上网查一下我竞品笔记 C 里那家公司现在的官网报价" }),
    ], plainChat: false }),
  };
  const model = deepseekStub((call) => replies[call.node ?? ""](call));
  const kit = graphKit(model.fetchImplementation, { records: recordAccessOf(world()) });
  const result = await runAgentGraph(kit.deps, kit.input(message));
  assert.ok(result.sourceRefs.includes("memo:note:m35"), result.text);
  assert.doesNotMatch(result.text, /没有找到相关的内容/u);
  assert.match(result.text, /Cirrus Works/u);
});

test("a read part that found nothing does not say so when another part of the same turn, holding its words, read the record", async () => {
  const message = "我竞品笔记 C 里那家公司的报价单是多少？";
  const trace = captureTrace();
  try {
    const replies: Record<string, (call: ModelCall) => string> = {
      answer: (call) => json({ segments: [{ cites: [{ sentenceIds: [1, 2], sourceRef: handleOf(call, /(s\d+) — memo "竞品笔记 C"/u)! }], partId: "p2", text: "笔记 C 记的是不公开报价，朋友说去年每席 900 日元。" }] }),
      understand: () => json({ parts: [
        part({ dataSources: ["orbit_records"], localId: "p1", objectClues: [{ entity: "memo", text: "报价单" }], requiredCapabilities: ["memo.read"], sourceQuote: "那家公司的报价单" }),
        part({ dataSources: ["orbit_records"], localId: "p2", readFilter: { text: "竞品笔记 C" }, requiredCapabilities: ["memo.read"], sourceQuote: "我竞品笔记 C 里那家公司的报价单是多少" }),
      ], plainChat: false }),
    };
    const model = deepseekStub((call) => replies[call.node ?? ""](call));
    const kit = graphKit(model.fetchImplementation, { records: recordAccessOf(world()) });
    const result = await runAgentGraph(kit.deps, kit.input(message));
    assert.ok(result.sourceRefs.includes("memo:note:m35"));
    assert.doesNotMatch(result.text, /没有找到相关的内容/u);
    assert.ok(trace.events.some((event) => event.type === "verify.no_record_covered"), `${result.text} ${JSON.stringify(result.partResults)}`);
  } finally {
    trace.restore();
  }
});
