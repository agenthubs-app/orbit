import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

import { runAgentGraph } from "../../features/agent-v1/graph/build";
import { createGraphExecutor } from "../../features/agent-v1/graph/executor";
import { conversationCardId } from "../../features/agent-v1/entry/confirm-boundary";
import { handleAgentV1Send } from "../../features/agent-v1/entry/http";
import { acceptMessage, getRequestResult, settleSession, type AgentEntryDependencies } from "../../features/agent-v1/entry/service";
import { createMemoryAgentEntryStore } from "../../features/agent-v1/entry/store";
import { DEFAULT_DEEPSEEK_ORBIT_AGENT_MODEL } from "../../features/orbit-ai/gemini-provider";
import { createCardKit, freeze } from "../services/agent-ledger-card-kit";
import { captureTrace, deepseekStub, graphKit, json, part } from "./graph-kit";

/**
 * agent-design AG03-3 and the graph's wiring: an ordinary discussion is answered with the one model
 * call (no second call, no record read, no write proposal); the entry runs the graph inside the AG02
 * confirmation boundary; with the switch off the protocol-3 entry is closed and the old path is used.
 */

const CHAT = "第一次给潜在客户写邮件，开头是直接说来意好，还是先寒暄两句好？";

test("plain chat: one model call, its reply is shown; nothing read, nothing proposed", async () => {
  const model = deepseekStub([json({ parts: [part({ sourceQuote: CHAT })], plainChat: true, reply: "建议直接说来意，再用一句话寒暄收尾：对方时间有限。" })]);
  const trace = captureTrace();
  try {
    const kit = graphKit(model.fetchImplementation);
    const result = await runAgentGraph(kit.deps, kit.input(CHAT));
    assert.equal(model.calls.length, 1);
    assert.equal(model.calls[0].node, "understand");
    assert.equal(model.calls[0].body.model, "deepseek-flash");
    assert.deepEqual(model.calls[0].body.response_format, { type: "json_object" });
    assert.equal(result.text, "建议直接说来意，再用一句话寒暄收尾：对方时间有限。");
    assert.deepEqual(result.partResults, [{ partId: "p1", route: "answer", sourceQuote: CHAT, status: "answered", verdict: "accept" }]);
    assert.equal(result.status, "completed");
    assert.deepEqual(trace.events.filter((event) => event.type === "node.enter").map((event) => event.node), ["intake", "understand", "route", "answer", "verify", "deliver"]);
    assert.equal(trace.events.some((event) => /^(read\.|card\.|exec\.)/u.test(String(event.type))), false);
    assert.deepEqual(kit.authorized, [{ actorId: "actor:a", references: [] }], "intake checks the @ references and reads nothing else");
  } finally {
    trace.restore();
  }
});

test("the reply of a plain-chat output is not shown when code finds a part that is not a discussion", async () => {
  const message = "帮我想想催款邮件的开头怎么写，再看看小林上次说了什么。";
  const model = deepseekStub([
    json({ parts: [part({ localId: "p1", sourceQuote: "帮我想想催款邮件的开头怎么写" }), part({ dataSources: ["orbit_records"], localId: "p2", requiredCapabilities: ["memo.read"], sourceQuote: "再看看小林上次说了什么" })], plainChat: true, reply: "小林上次说他会付款。" }),
    json({ segments: [{ partId: "p1", text: "开头先感谢对方，再提付款日期。" }] }),
  ]);
  const kit = graphKit(model.fetchImplementation);
  const result = await runAgentGraph(kit.deps, kit.input(message));
  assert.equal(model.calls.length, 2);
  assert.doesNotMatch(result.text, /小林上次说他会付款/u);
  assert.match(result.text, /开头先感谢对方/u);
  // AG05: the read runs (an empty account here): nothing found, said by code; "this version cannot read" is gone.
  assert.match(result.text, /没有找到相关的内容/u);
  assert.doesNotMatch(result.text, /还不能读/u);
});

test("the default main model name is deepseek-flash (CONVENTIONS §2)", () => {
  assert.equal(DEFAULT_DEEPSEEK_ORBIT_AGENT_MODEL, "deepseek-flash");
});

function entryDeps(execute: AgentEntryDependencies["execute"]): AgentEntryDependencies {
  return { execute, schedule: (task) => { void task(); }, sessions: null, store: createMemoryAgentEntryStore() };
}

const body = (message: string, sessionId: string) => ({ clientMessageId: `m:${Math.random()}`, locale: "zh" as const, message, protocolVersion: 3 as const, references: [], sessionId });

test("through the entry: the graph's parts land in the result document; waiting for acceptance leaves the request waiting_user", async () => {
  const first = "帮我找摄影主题的活动，这次没有合适的就一直找下去，找到我满意为止。";
  const model = deepseekStub([json({ parts: [
    part({ deliverable: "list", localId: "p1", requiredCapabilities: ["event.read"], sourceQuote: "帮我找摄影主题的活动" }),
    part({ deliverable: "list", localId: "p2", persistence: "until_satisfied", requiredCapabilities: ["event.read"], sourceQuote: "这次没有合适的就一直找下去，找到我满意为止" }),
  ], plainChat: false })]);
  const cards = createCardKit();
  const kit = graphKit(model.fetchImplementation);
  const deps = entryDeps(createGraphExecutor("mock", { ...kit.deps, runtime: cards.runtime }));
  const { receipt } = await acceptMessage(deps, { actorId: "actor:a", body: body(first, "session:flow") });
  await settleSession("actor:a", "session:flow");
  const document = await getRequestResult(deps, { actorId: "actor:a", requestId: receipt.requestId });
  assert.equal(document?.status, "waiting_user");
  // AG21a (coordinator's decision 2): the search asked for now is answered now (before: "unfinished", a directory search).
  assert.deepEqual(document?.partResults.map((item) => [item.sourceQuote, item.status]), [["帮我找摄影主题的活动", "answered"], ["这次没有合适的就一直找下去，找到我满意为止", "awaiting_acceptance"]]);
  assert.match(document?.answer?.text ?? "", /要不要这样做，由你决定/u);
  const next = await acceptMessage(deps, { actorId: "actor:a", body: body("再说一句", "session:flow") });
  assert.notEqual(next.receipt.status, "queued", "a request waiting for the user does not hold up the lane");
});

test("the AG02 boundary stays around the graph: a bare 「确认」 while a card waits never reaches the graph and decides nothing", async () => {
  const model = deepseekStub([]);
  const cards = createCardKit();
  const kit = graphKit(model.fetchImplementation);
  const executor = createGraphExecutor("mock", { ...kit.deps, runtime: cards.runtime });
  const requestId = "agreq_prepared";
  await freeze(cards, [{ capability: "todo.create", set: { title: "续订域名" } }], conversationCardId(requestId));
  const card = await cards.runtime.getAction(conversationCardId(requestId));
  await cards.repository.saveAction?.({ ...card!, origin: { conversationId: "session:boundary", kind: "conversation", requestId } } as never);
  const result = await executor({ actorId: "actor:a", fetchImplementation: model.fetchImplementation, history: [], input: { locale: "zh", message: "确认", references: [] }, requestId: "agreq_next", sessionId: "session:boundary", signal: new AbortController().signal });
  assert.equal(model.calls.length, 0);
  assert.match(result.text, /请点卡上的「确认以上1项」/u);
  assert.equal((await cards.runtime.getAction(conversationCardId(requestId)))?.status, "awaiting_confirmation");
});

test("a card prepared for this request is shown; its write part waits for the click and is not called 'not done'", async () => {
  const message = "新建一条待办，标题叫「续订域名」，计划日 11 月 30 日。";
  const model = deepseekStub([json({ parts: [part({ deliverable: "change", requiredCapabilities: ["todo.create"], sourceQuote: message })], plainChat: false })]);
  const cards = createCardKit();
  const kit = graphKit(model.fetchImplementation);
  const requestId = "agreq_seeded";
  await freeze(cards, [{ capability: "todo.create", set: { plannedDate: "2026-11-30", title: "续订域名" } }], conversationCardId(requestId));
  const executor = createGraphExecutor("mock", { ...kit.deps, runtime: cards.runtime });
  const result = await executor({ actorId: "actor:a", fetchImplementation: model.fetchImplementation, history: [], input: { locale: "zh", message, references: [] }, requestId, sessionId: "session:test", signal: new AbortController().signal });
  assert.equal(result.actionPreview?.actionId, conversationCardId(requestId));
  assert.equal(result.partResults?.[0]?.status, "awaiting_confirmation");
  assert.ok(result.partResults?.[0]?.operationId);
  assert.doesNotMatch(result.text, /现在还不能|这一版还不能/u);
  assert.match(result.text, /点卡上的「确认以上1项」后才会执行/u);
});

test("switch off: protocol 3 is refused and the graph never runs; the old route is untouched", async () => {
  const previous = process.env.ORBIT_AGENT_V1_MODE;
  delete process.env.ORBIT_AGENT_V1_MODE;
  try {
    let ran = 0;
    const response = await handleAgentV1Send({ actorId: "actor:a", body: body(CHAT, "session:off"), dependencies: entryDeps(async () => { ran += 1; return { sourceRefs: [], text: "" }; }), mode: "mock" });
    assert.equal(response.status, 400);
    assert.equal(ran, 0);
  } finally {
    if (previous !== undefined) process.env.ORBIT_AGENT_V1_MODE = previous;
  }
  const http = fs.readFileSync(path.join(process.cwd(), "features/agent-v1/entry/http.ts"), "utf8");
  assert.match(http, /execute: createGraphExecutor\(mode\)/u, "with the switch on, the entry executes the graph");
});
