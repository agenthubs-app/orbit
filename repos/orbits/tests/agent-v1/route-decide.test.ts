import assert from "node:assert/strict";
import test from "node:test";

import { createMemoryAgentSessionStateStore } from "../../features/agent-v1/context/session-state";
import { runAgentGraph } from "../../features/agent-v1/graph/build";
import { decideRoute, settleDependencies } from "../../features/agent-v1/route/decide";
import type { UnderstandPart } from "../../features/agent-v1/understand/schema";
import { validateUnderstandOutput } from "../../features/agent-v1/understand/validate";
import { captureTrace, deepseekStub, graphKit, json, part } from "./graph-kit";

/**
 * agent-design AG03-2: each part's verdict and route follow 设计稿 §3.1 and 附录 A, decided by code.
 * The table is the criteria; a model's own verdict is dropped; accepting an alternative in words
 * records which alternative was accepted and makes no decision and no rule.
 */

function understood(overrides: Record<string, unknown>): UnderstandPart {
  const message = String(overrides.sourceQuote ?? "x");
  const result = validateUnderstandOutput({ parts: [part({ sourceQuote: message, ...overrides })], plainChat: false }, { handles: new Set(), message, openItemRefs: new Set() });
  assert.equal(result.ok, true, JSON.stringify(result));
  return (result as { output: { parts: UnderstandPart[] } }).output.parts[0];
}

const TABLE: { name: string; part: Record<string, unknown>; verdict: string; route: string; waitReason?: string | null }[] = [
  { name: "根据三份竞品笔记列价格差异（Orbit 记录，商业话题也不联网）", part: { dataSources: ["orbit_records"], deliverable: "comparison", requiredCapabilities: ["memo.read", "fn.compare"] }, route: "read", verdict: "accept" },
  { name: "查一家公司官网的公开报价", part: { dataSources: ["public_web"], requiredCapabilities: ["web.search", "web.fetch"] }, route: "web_lookup", verdict: "accept" },
  { name: "用户给了价格页链接", part: { dataSources: ["public_web"], requiredCapabilities: ["web.fetch"] }, route: "web_lookup", verdict: "accept" },
  { name: "日本市场进入调研：自找竞品、交叉核验", part: { deliverable: "summary", requiredCapabilities: ["external.deepResearch", "web.search"] }, route: "suggest_external_agent", verdict: "convert" },
  { name: "读另一位用户的客户笔记", part: { dataOwner: "other_user", dataSources: ["orbit_records"], requiredCapabilities: ["memo.read"] }, route: "explain_limit", verdict: "decline", waitReason: "permission_missing" },
  { name: "一直找下去，找到满意为止", part: { persistence: "until_satisfied", requiredCapabilities: ["event.read"] }, route: "offer_alternative", verdict: "convert", waitReason: "awaiting_acceptance" },
  { name: "把待办改到周五", part: { deliverable: "change", requiredCapabilities: ["todo.update"] }, route: "propose_write", verdict: "accept" },
  { name: "改到周五——等等，先别改", part: { constraints: ["先别改"], deliverable: "change", requiredCapabilities: ["todo.update"] }, route: "answer", verdict: "accept" },
  { name: "don't add anything to my to-dos", part: { constraints: ["don't add anything to my to-dos"], deliverable: "change", requiredCapabilities: ["todo.create"] }, route: "answer", verdict: "accept" },
  { name: "もし返事が来なかったら消す？", part: { clarity: "statement", requiredCapabilities: ["todo.delete"], sourceQuote: "もし今週中に返事が来なかったら、ToDoは消したほうがいいのかな？" }, route: "answer", verdict: "accept" },
  { name: "转述上司的命令", part: { clarity: "statement", requiredCapabilities: ["todo.delete"] }, route: "answer", verdict: "accept" },
  { name: "读不出要办什么", part: { clarity: "none" }, route: "clarify", verdict: "accept" },
  { name: "要写入但缺对象", part: { clarity: "missing_one", deliverable: "change", requiredCapabilities: ["todo.update"] }, route: "clarify", verdict: "accept", waitReason: "object_ambiguous" },
  { name: "普通讨论", part: { requiredCapabilities: [] }, route: "answer", verdict: "accept" },
];

for (const row of TABLE) {
  test(`附录 A: ${row.name} → ${row.verdict} / ${row.route}`, () => {
    const decision = decideRoute(understood(row.part));
    assert.equal(decision.verdict, row.verdict);
    assert.equal(decision.route, row.route);
    if (row.waitReason !== undefined) assert.equal(decision.waitReason, row.waitReason);
  });
}

test("accepting the alternative wins over an open-ended reading of the same words", () => {
  const accepted = { ...understood({ deliverable: "rule", intentBasis: "accepted_context", persistence: "until_satisfied", requiredCapabilities: ["rule.create"], sourceQuote: "好，那就按你说的定期留意吧。" }), continues: { kind: "alternative" as const, ref: "o1" } };
  assert.equal(decideRoute(accepted, { acceptedAlternative: { leadsTo: "rule.create" } }).route, "propose_write");
  assert.equal(decideRoute(accepted).route, "offer_alternative", "without an open alternative it is still open-ended");
});

test("a model's own verdict and route are dropped; code decides from the capabilities", () => {
  const message = "根据我记的那三份竞品笔记，列出它们提到的价格差异。";
  const result = validateUnderstandOutput({ parts: [{ ...part({ dataSources: ["orbit_records"], requiredCapabilities: ["memo.read"], sourceQuote: message }), route: "suggest_external_agent", verdict: "decline" }], plainChat: false }, { handles: new Set(), message, openItemRefs: new Set() });
  assert.equal(result.ok, true);
  if (result.ok !== true) return;
  assert.equal("verdict" in result.output.parts[0], false);
  assert.deepEqual(decideRoute(result.output.parts[0]), { blockedWrites: [], reason: "the user's Orbit records", route: "read", verdict: "accept", waitReason: null });
});

test("a part whose prerequisite is not done waits for it (dependency_pending)", () => {
  const parts = [
    { dependsOn: [], localId: "p1", status: "suggested_external" as const, waitReason: null },
    { dependsOn: ["p1"], localId: "p2", status: "answered" as const, waitReason: null },
    { dependsOn: ["p2"], localId: "p3", status: "unfinished" as const, waitReason: null },
  ];
  settleDependencies(parts as never);
  assert.deepEqual(parts.map((item) => [item.localId, item.status, item.waitReason]), [["p1", "suggested_external", null], ["p2", "waiting_dependency", "dependency_pending"], ["p3", "waiting_dependency", "dependency_pending"]]);
});

// Release-2 gate 2 (AE-UND-011/012; coordinator, 2026-11-20): this release makes scheduled tasks in chat (AG15), so an accepted
// 「定期留意」 goes on to AG15's own path — here the request names no time to run at, so AG15's question for it. Before: 「定期
// 留意要建一条定期任务，现在还不能在对话里建，所以还没有建任何定期任务」 (that assertion changed below; the rest kept).
test("accepting the alternative in words: the accepted alternative is recorded, no decision, no card yet — AG15 asks when to run", async () => {
  const trace = captureTrace();
  try {
    const first = "帮我找摄影主题的活动，这次没有合适的就一直找下去，找到我满意为止。";
    const second = "好，那就按你说的定期留意吧。";
    const model = deepseekStub([
      json({ parts: [
        part({ dataSources: ["orbit_records"], deliverable: "list", localId: "p1", objectClues: [{ entity: "event", text: "摄影主题的活动" }], requiredCapabilities: ["event.read"], sourceQuote: "帮我找摄影主题的活动" }),
        part({ dependsOn: [], deliverable: "list", localId: "p2", persistence: "until_satisfied", requiredCapabilities: ["event.read"], sourceQuote: "这次没有合适的就一直找下去，找到我满意为止" }),
      ], plainChat: false }),
      (call) => {
        assert.match(call.user, /o1 \(alternative\)/u, "the open alternative is offered to the first layer");
        return json({ parts: [part({ continues: { kind: "alternative", ref: "o1" }, deliverable: "rule", localId: "p1", requiredCapabilities: ["rule.create"], sourceQuote: second })], plainChat: false });
      },
      // AG15's one call that points at the words (of the request the alternative was offered for): no time to run at.
      json({ basisText: null, count: null, domain: "event", schedule: null, scheduleText: null, scopeText: null, target: null, until: null, untilText: null, verb: "create" }),
    ]);
    const kit = graphKit(model.fetchImplementation);
    const one = await runAgentGraph(kit.deps, kit.input(first));
    assert.equal(one.status, "waiting_user");
    // AG21a (coordinator's decision 2): 「帮我找摄影主题的活动」 is a search answered now (before: refused as a directory search,
    // "unfinished"); the keep-looking-if-none part is still the bounded alternative, offered first.
    assert.deepEqual(one.partResults.map((item) => [item.status, item.verdict, item.route, item.waitReason]), [["answered", "accept", "read", undefined], ["awaiting_acceptance", "convert", "offer_alternative", "awaiting_acceptance"]]);
    assert.match(one.text, /定期留意 Orbit 的活动目录/u);
    const stored = await kit.sessionState.get("actor:a", "session:a");
    assert.equal(stored?.openItems[0]?.kind, "alternative");

    const two = await runAgentGraph(kit.deps, kit.input(second));
    assert.equal(two.state.acceptedAlternativeRef, stored?.openItems[0]?.ref);
    assert.equal(two.status, "completed");
    assert.match(two.text, /没看出多久跑一次、几点跑，所以这次没有设/u, two.text);
    assert.doesNotMatch(two.text, /现在还不能在对话里建/u);
    assert.doesNotMatch(two.text, /已经建好|已建好|已开始/u);
    assert.equal((await kit.sessionState.get("actor:a", "session:a"))?.openItems.length, 0, "the accepted alternative is no longer open");
    assert.equal(trace.events.some((event) => String(event.type).startsWith("card.")), false, "no card, no decision");
  } finally {
    trace.restore();
  }
});

test("release-2 gate 2: an accepted 「定期留意」 whose request says when to run makes AG15's new-task card (from the request's words)", async () => {
  const trace = captureTrace();
  try {
    const first = "每周五上午九点帮我找摄影主题的活动，没有合适的就一直找下去，找到我满意为止。";
    const second = "好，那就按你说的定期留意吧。";
    const model = deepseekStub([
      json({ parts: [part({ dataSources: ["orbit_records"], deliverable: "list", localId: "p1", persistence: "until_satisfied", requiredCapabilities: ["event.read"], sourceQuote: first })], plainChat: false }),
      json({ parts: [part({ continues: { kind: "alternative", ref: "o1" }, deliverable: "rule", localId: "p1", requiredCapabilities: ["rule.create"], sourceQuote: second })], plainChat: false }),
      json({ basisText: "摄影主题", count: null, domain: "event", schedule: { daysOfWeek: [5], kind: "weekly", time: "09:00" }, scheduleText: "每周五上午九点", scopeText: "活动", target: null, until: null, untilText: null, verb: "create" }),
    ]);
    const kit = graphKit(model.fetchImplementation);
    await runAgentGraph(kit.deps, kit.input(first));
    const two = await runAgentGraph(kit.deps, kit.input(second));
    const intent = trace.events.find((event) => event.type === "rule.intent");
    assert.equal(intent?.capability, "rule.create", two.text);
    assert.doesNotMatch(two.text, /现在还不能在对话里建|还没有建任何定期任务/u);
  } finally {
    trace.restore();
  }
});

test("the session state store keeps one state per account and session", async () => {
  const store = createMemoryAgentSessionStateStore();
  await store.put("a", { lastMentioned: [], openItems: [], sessionId: "s", shownList: null, updatedAt: "t" });
  assert.equal(await store.get("b", "s"), null);
  assert.equal((await store.get("a", "s"))?.sessionId, "s");
});
