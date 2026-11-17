import assert from "node:assert/strict";
import test from "node:test";

import { runAgentGraph } from "../../features/agent-v1/graph/build";
import { captureTrace, deepseekStub, graphKit, json, part, recordAccessOf, type ModelCall } from "./graph-kit";
import { contact, memo } from "./read-kit";

/**
 * agent-design AG10 (AE-SCL-020, 会前回顾): "her current salary expectation" reads the person's newest notes as well as the
 * ones holding the words — the newest note says "updated her expectation" without the word "salary", and it is the one
 * that holds now (设计稿 §4 新的为准).
 */

const ACTOR = "actor:a";

test("a 'current' read with words also reads the person's newest notes, so a newer note that words it differently is there", async () => {
  const records = [
    contact(ACTOR, "contact:priya", "Priya Raman", { notes: "Salary expectation: JPY 21M base (noted Feb 2026)", organization: "Corvid Robotics" }),
    memo(ACTOR, "note:lm12", "First call with Priya Raman. Salary expectation: JPY 18M base.", "2025-03-14T09:00:00.000Z", ["contact:priya"]),
    memo(ACTOR, "note:lm13", "Priya was promoted to VP of Engineering. Her expectation is now JPY 21M base.", "2026-02-20T06:00:00.000Z", ["contact:priya"]),
    memo(ACTOR, "note:lm14", "Priya updated her expectation: JPY 24M base plus equity. Earlier figures are out of date.", "2026-10-30T03:00:00.000Z", ["contact:priya"]),
  ];
  const message = "I'm meeting Priya Raman tomorrow. What is her current salary expectation?";
  let materials = "";
  const model = deepseekStub((call: ModelCall) => {
    if (call.node === "understand") return json({ language: "en", parts: [part({ dataSources: ["orbit_records"], objectClues: [{ entity: "contact", text: "Priya Raman" }], readFilter: { current: true, text: "salary expectation" }, requiredCapabilities: ["memo.read", "profile.read"], sourceQuote: message })], plainChat: false });
    materials = call.user;
    const handle = /(s\d+) — memo[^\n]*\n\s+1\. Priya updated/u.exec(call.user)?.[1] ?? "s1";
    return json({ segments: [{ cites: [{ sentenceIds: [1], sourceRef: handle }], partId: "p1", profile: [], text: "Her expectation is now JPY 24M base plus equity." }] });
  });
  const kit = graphKit(model.fetchImplementation, { now: "2026-11-15T01:00:00.000Z", records: recordAccessOf({ events: [], records }) });
  const trace = captureTrace();
  try {
    const result = await runAgentGraph(kit.deps, kit.input(message, { locale: "en" }));
    assert.match(materials, /Priya updated her expectation: JPY 24M base plus equity/u, "the newest note is among the materials");
    assert.ok(trace.events.some((event) => event.type === "resolve.current_newest"));
    assert.ok(result.sourceRefs.includes("memo:note:lm14"));
  } finally {
    trace.restore();
  }
});
