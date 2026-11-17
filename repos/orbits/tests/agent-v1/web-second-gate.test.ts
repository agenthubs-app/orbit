import assert from "node:assert/strict";
import test from "node:test";

import { runAgentGraph } from "../../features/agent-v1/graph/build";
import { newJudgmentBudget } from "../../features/agent-v1/judgment/ask";
import { TEST_THRESHOLDS } from "./judgment-kit";
import { secondGate } from "../../features/agent-v1/web/second-gate";
import { captureTrace, deepseekStub, graphKit, json, part } from "./graph-kit";
import { judgmentAccess, outboundJudge, toolsStub, webAccess } from "./web-kit";

/**
 * agent-design AG09-3: the second gate. Only a sure "no" to outbound.extra sends a query that passed every code rule;
 * "yes", not sure (below the threshold), a timeout and a question not enabled (no calibrated cell) all keep it back.
 */

const MESSAGE = "查一下 Acme Cloud 官网现在的标准版价格";

test("secondGate: no → send; yes, not sure, timeout, not enabled → not sent", async () => {
  const input = { language: "zh" as const, message: MESSAGE, query: "Acme Cloud 官网 价格" };
  const no = outboundJudge(0.03);
  assert.equal((await secondGate(judgmentAccess(no.fetchImplementation), newJudgmentBudget(), input)).send, true);
  assert.match(no.calls[0].body.input[0].text, /Acme Cloud 官网现在的标准版价格/u, "the user's own words");
  assert.match(JSON.stringify(no.calls[0].body.questions), /Acme Cloud 官网 价格/u, "and the candidate query, nothing else");
  assert.equal((await secondGate(judgmentAccess(outboundJudge(0.9).fetchImplementation), newJudgmentBudget(), input)).send, false, "yes");
  assert.equal((await secondGate(judgmentAccess(outboundJudge(0.35).fetchImplementation), newJudgmentBudget(), input)).send, false, "no, but below the threshold (0.65 < 0.8)");
  const hang = await secondGate(judgmentAccess(outboundJudge(0.03, { hang: true }).fetchImplementation), newJudgmentBudget(), input);
  assert.equal(hang.send, false, "timeout");
  assert.equal((await secondGate(judgmentAccess(no.fetchImplementation, TEST_THRESHOLDS), newJudgmentBudget(), input)).send, false, "not calibrated: not enabled");
  assert.equal((await secondGate(undefined, newJudgmentBudget(), input)).send, false, "no judgment at all");
});

for (const [name, judge] of [["yes", () => outboundJudge(0.9)], ["timeout", () => outboundJudge(0.03, { hang: true })]] as const) {
  test(`graph: second gate ${name} → no search, one blocked query, the answer says it did not look it up`, async () => {
    const trace = captureTrace();
    try {
      const model = deepseekStub((call) => {
        if (call.node === "understand") return json({ parts: [part({ dataSources: ["public_web"], requiredCapabilities: ["web.search"], sourceQuote: MESSAGE, webTarget: { qualifiers: ["official", "price"], quote: "Acme Cloud" } })], plainChat: false });
        throw new Error(`unexpected model call in ${call.node}`);
      });
      const tools = toolsStub();
      const kit = graphKit(model.fetchImplementation);
      kit.deps.web = webAccess(tools);
      kit.deps.judgment = judgmentAccess(judge().fetchImplementation);
      const result = await runAgentGraph(kit.deps, kit.input(MESSAGE));
      assert.equal(tools.calls.length, 0);
      assert.equal(trace.events.filter((event) => event.type === "web.outbound_blocked").length, 1);
      assert.match(result.text, /这次没有联网查/u);
    } finally {
      trace.restore();
    }
  });
}
