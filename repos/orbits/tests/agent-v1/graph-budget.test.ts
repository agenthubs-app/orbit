import assert from "node:assert/strict";
import test, { mock } from "node:test";

import { runAgentGraph } from "../../features/agent-v1/graph/build";
import { callMainModel, modelCallLimit, MODEL_NODE_TIMEOUT_MS } from "../../features/agent-v1/models/main";
import { captureTrace, deepseekStub, graphKit, json, part } from "./graph-kit";

/**
 * agent-design AG03-5: an unusable first-layer output is repaired at most once; code checks the
 * round's call budget before every model call (default 4, a lower deployment value wins); when it
 * runs out, what code already settled is delivered and the rest is listed as not done, saying why.
 */

const MALFORMED = "{\"not\": \"the expected structure\"";

test("an unusable output is repaired once; the repaired output is used", async () => {
  const message = "那如果对方一直没回，第二封隔多久再发？";
  const model = deepseekStub([MALFORMED, json({ parts: [part({ sourceQuote: message })], plainChat: true, reply: "隔 3 到 5 个工作日再发第二封。" })]);
  const kit = graphKit(model.fetchImplementation);
  const result = await runAgentGraph(kit.deps, kit.input(message));
  assert.equal(model.calls.length, 2);
  assert.match(model.calls[1].user, /could not be used/u, "the repair is told what was wrong");
  assert.equal(result.text, "隔 3 到 5 个工作日再发第二封。");
  assert.equal(result.partResults[0].status, "answered");
});

test("hotfix 2026-11-20 (AE-UND-013 went to 5 calls): an unusable output, then a repaired plain reply of several sentences — two calls in all, the reply is one paragraph, no call to lay it out", async () => {
  const message = "那如果对方一直没回，第二封隔多久再发？";
  const long = "一般隔 3 到 5 个工作日再发第二封。第二封要短一些，只提一个具体的问题。如果还没回，可以再隔一周换个话题联系。";
  const model = deepseekStub([MALFORMED, json({ parts: [part({ sourceQuote: message })], plainChat: true, reply: long })]);
  const kit = graphKit(model.fetchImplementation);
  const trace = captureTrace();
  try {
    const result = await runAgentGraph(kit.deps, kit.input(message));
    assert.equal(model.calls.length, 2, "understand and its one repair; no layout call");
    assert.deepEqual(model.calls.map((call) => call.node), ["understand", "understand"]);
    assert.equal(result.text, long);
    assert.deepEqual(result.blocks, [{ text: long, type: "paragraph" }]);
    assert.equal(result.partResults[0].status, "answered");
    const budget = trace.events.filter((event) => event.type === "budget" && event.what === "model_calls");
    assert.ok(budget.every((event) => Number(event.used) <= Number(event.limit)), "every call was inside the round's limit");
  } finally {
    trace.restore();
  }
});

test("hotfix 2026-11-20 (AE-ANS-007): a plain reply with its own numbered lines is laid out by code — conclusion, then points — still one call", async () => {
  const message = "下周要第一次拜访一家新客户，帮我想想要准备什么，分几点说。";
  const reply = "第一次拜访新客户，建议按这几点准备：\n1. 客户基本情况：公司业务、规模和最近动向。\n2. 拜访目标：这次想拿到什么结果。\n3. 问题清单：准备几个开放式问题。\n如果你告诉我客户所在行业，我可以说得更具体。";
  const model = deepseekStub([json({ parts: [part({ sourceQuote: message })], plainChat: true, reply })]);
  const kit = graphKit(model.fetchImplementation);
  const result = await runAgentGraph(kit.deps, kit.input(message));
  assert.equal(model.calls.length, 1);
  assert.deepEqual(result.blocks.map((block) => block.type), ["conclusion", "points", "paragraph"]);
  assert.equal(result.text, reply);
  const points = result.blocks[1];
  assert.deepEqual(points.type === "points" && points.items.map((item) => item.head), ["客户基本情况", "拜访目标", "问题清单"]);
});

test("still unusable after the one repair: no third call, and the user is told it was not handled", async () => {
  const message = "跟客户开完会之后，跟进邮件一般隔几天发比较合适？";
  const model = deepseekStub([MALFORMED, MALFORMED, MALFORMED]);
  const kit = graphKit(model.fetchImplementation);
  const result = await runAgentGraph(kit.deps, kit.input(message));
  assert.equal(model.calls.length, 2);
  assert.match(result.text, /这次没处理成/u);
  assert.doesNotMatch(result.text, /not|structure/u, "no broken structured text is shown");
  assert.deepEqual(result.partResults, [{ partId: "p1", reason: "model_output_invalid", status: "failed" }]);
});

test("limit 1 (model-budget-1): the external suggestion is delivered, the discussion part is unfinished because the calls ran out", async () => {
  const message = "帮我想想催款邮件的开头怎么写比较得体；另外做一份东南亚物流市场的进入调研，自己找竞品和行业数据交叉核验。";
  const model = deepseekStub([json({ parts: [
    part({ localId: "p1", sourceQuote: "帮我想想催款邮件的开头怎么写比较得体" }),
    part({ deliverable: "summary", localId: "p2", requiredCapabilities: ["external.deepResearch"], sourceQuote: "另外做一份东南亚物流市场的进入调研，自己找竞品和行业数据交叉核验" }),
  ], plainChat: false })]);
  const trace = captureTrace();
  try {
    const kit = graphKit(model.fetchImplementation, { modelCallLimit: 1 });
    const result = await runAgentGraph(kit.deps, kit.input(message));
    assert.equal(model.calls.length, 1);
    assert.deepEqual(result.partResults.map((item) => [item.sourceQuote, item.status, item.reason]), [
      ["帮我想想催款邮件的开头怎么写比较得体", "unfinished", "budget"],
      ["另外做一份东南亚物流市场的进入调研，自己找竞品和行业数据交叉核验", "suggested_external", undefined],
    ]);
    assert.match(result.text, /催款邮件的开头怎么写比较得体」这次没做完：这一轮能用的处理次数已经用完了，并不是 Orbit 做不了这件事/u);
    assert.match(result.text, /Codex 或 Claude/u);
    assert.ok(trace.events.some((event) => event.type === "budget" && event.exhausted === true && event.node === "answer"));
  } finally {
    trace.restore();
  }
});

test("limit 4 by default: understand plus one answer call for a mixed request", async () => {
  const message = "帮我想想催款邮件的开头怎么写比较得体；再查一下 Acme Cloud 的价格。";
  const model = deepseekStub([
    json({ parts: [part({ localId: "p1", sourceQuote: "帮我想想催款邮件的开头怎么写比较得体" }), part({ dataSources: ["public_web"], localId: "p2", requiredCapabilities: ["web.search"], sourceQuote: "再查一下 Acme Cloud 的价格" })], plainChat: false }),
    json({ segments: [{ partId: "p1", text: "开头先感谢合作，再提醒付款日期。" }] }),
  ]);
  const kit = graphKit(model.fetchImplementation);
  const result = await runAgentGraph(kit.deps, kit.input(message));
  assert.equal(model.calls.length, 2);
  assert.deepEqual(model.calls.map((call) => call.node), ["understand", "answer"]);
  assert.equal(result.state.budget.limit, 4);
  assert.match(result.text, /^开头先感谢合作/u);
  // AG09: without web access (no switch, no key) code says the web is off; no web request is made.
  assert.match(result.text, /联网查询现在是关着的/u);
});

test("the call limit: ORBIT_AGENT_MODEL_CALL_LIMIT (default 4) and a lower eval deployment setting wins", () => {
  const trace = captureTrace();
  try {
    assert.equal(modelCallLimit({}), 4);
    assert.equal(modelCallLimit({ ORBIT_AGENT_MODEL_CALL_LIMIT: "3" }), 3);
    trace.settings.model_calls_limit = 1;
    assert.equal(modelCallLimit({}), 1);
    assert.equal(modelCallLimit({ ORBIT_AGENT_MODEL_CALL_LIMIT: "2" }), 1);
  } finally {
    trace.restore();
  }
});

test("a failed call (timeout, 5xx) gets the round's one second chance inside the budget; a second failure is reported, not made up", async () => {
  process.env.DEEPSEEK_API_KEY ??= "test-key-not-real";
  const message = "跟进邮件一般隔几天发？";
  let calls = 0;
  const flaky = (failures: number) => (async () => {
    calls += 1;
    if (calls <= failures) return new Response(JSON.stringify({ error: { message: "busy" } }), { status: 503 });
    return new Response(JSON.stringify({ choices: [{ finish_reason: "stop", index: 0, message: { content: json({ parts: [part({ sourceQuote: message })], plainChat: true, reply: "隔 2 到 3 个工作日。" }), role: "assistant" } }] }), { status: 200 });
  }) as typeof fetch;
  const once = graphKit(flaky(1));
  const recovered = await runAgentGraph(once.deps, once.input(message));
  assert.equal(calls, 2);
  assert.equal(recovered.text, "隔 2 到 3 个工作日。");
  calls = 0;
  const twice = graphKit(flaky(2));
  const failed = await runAgentGraph(twice.deps, twice.input(message));
  assert.equal(calls, 2, "no third call");
  assert.match(failed.text, /这次没处理成/u);
  assert.deepEqual(failed.partResults, [{ partId: "p1", reason: "model_error", status: "failed" }]);
});

test("over the budget no request is sent", async () => {
  const model = deepseekStub([]);
  const budget = { limit: 2, used: 2 };
  const result = await callMainModel({ budget, fetchImplementation: model.fetchImplementation, node: "answer", purpose: "first", requestId: "r", system: "s", user: "u" });
  assert.equal(result.ok, false);
  assert.equal(model.calls.length, 0);
  assert.equal(budget.used, 2);
});

test("one model call times out after 15 seconds", async () => {
  process.env.DEEPSEEK_API_KEY ??= "test-key-not-real";
  assert.equal(MODEL_NODE_TIMEOUT_MS, 15_000);
  mock.timers.enable({ apis: ["setTimeout"] });
  try {
    let sent = 0;
    const never = (async () => { sent += 1; return new Promise<Response>(() => undefined); }) as typeof fetch;
    const pending = callMainModel({ budget: { limit: 4, used: 0 }, fetchImplementation: never, node: "understand", purpose: "first", requestId: "r", system: "s", user: "u" });
    let settled = false;
    void pending.then(() => { settled = true; });
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(sent, 1);
    mock.timers.tick(14_999);
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(settled, false);
    mock.timers.tick(1);
    const result = await pending;
    assert.equal(result.ok, false);
    if (result.ok === false) assert.match(result.message, /15000ms/u);
  } finally {
    mock.timers.reset();
  }
});
