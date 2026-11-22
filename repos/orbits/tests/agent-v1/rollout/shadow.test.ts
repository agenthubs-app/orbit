import assert from "node:assert/strict";
import test from "node:test";
import { MemorySaver } from "@langchain/langgraph";

import type { AgentGraphResult } from "../../../features/agent-v1/graph/build";
import { compareSides, configuredShadowDeps, createMemoryShadowStore, messagesBefore, oldSideOf, runShadowComparison, scheduleShadowComparison, type ShadowRunDeps, type ShadowSide } from "../../../features/agent-v1/rollout/shadow";
import { buildShadowReport, shadowReportMarkdown } from "../../../features/agent-v1/rollout/shadow-report";

/**
 * agent-design AG18-2: shadow mode. The new flow runs read-only after the old answer: no card, no ledger row, no
 * session state, no web; only a comparison record per account and request. A failure of the new side never reaches the
 * user and becomes one divergence with the request id.
 */

const OLD_OK = { data: { assistantMessage: "11 月 12 日你们聊了实施费单列。", provenance: { evidenceIds: ["note:m31"] }, routingDecision: { intent: "general_conversation" } }, success: true };

function graphResult(overrides: Partial<AgentGraphResult> = {}): AgentGraphResult {
  return { actionPreview: null, basis: null, blocks: [], cardLine: null, clarifications: [], earlier: [], memoryUse: [], modelCalls: 2, partResults: [], paused: false, sourceRefs: ["memo:note:m31"], state: {} as never, status: "completed", text: "上次（11 月 12 日）小林说想把实施费单列。", web: { pages: [], queries: [] }, ...overrides } as AgentGraphResult;
}

function deps(store = createMemoryShadowStore(), runGraph?: ShadowRunDeps["runGraph"]): ShadowRunDeps {
  return {
    graph: {
      authorizeReferences: async () => [],
      checkpointer: new MemorySaver(),
      loadMessages: async () => [],
      now: () => "2026-11-15T01:00:00.000Z",
      sessionState: { get: async () => null, put: async () => { throw new Error("the shadow pass must not write session state"); } },
    },
    now: () => "2026-11-15T01:00:01.000Z",
    records: null,
    ...(runGraph ? { runGraph } : {}),
    store,
    workspaceId: "workspace:test",
  };
}

test("the new side runs read-only: its card is only noted, its graph gets no web and its own request id", async () => {
  const store = createMemoryShadowStore();
  let seen: { cards?: unknown; web?: unknown; requestId?: string } = {};
  const record = await runShadowComparison(deps(store, async (graphDeps, input) => {
    seen = { cards: graphDeps.cards, requestId: input.requestId, web: graphDeps.web };
    // The graph proposes a write: the card access notes it and returns no card (nothing in any ledger).
    const frozen = await graphDeps.cards!.freeze({ intents: [{ capability: "todo.update", set: { plannedDate: "2026-11-20" }, targetId: "task:t42" }] as never, locale: "zh", requestId: input.requestId, sessionId: input.sessionId });
    assert.equal(frozen, null);
    return graphResult({ sourceRefs: [] });
  }), { actorId: "actor:a", locale: "zh", message: "把给小林发修订报价改到周五", old: OLD_OK, requestId: "request:1", sessionId: "session:1" });
  assert.equal(seen.web, undefined);
  assert.equal(seen.requestId, "shadow:request:1");
  assert.deepEqual(record?.new.card, { ops: [{ op: "todo.update", set: { plannedDate: "2026-11-20" }, target: "task:t42" }] });
  assert.equal(store.all().length, 1);
  assert.deepEqual(record?.divergences.map((item) => item.field).sort(), ["card", "cited"]);
});

test("wording is not a divergence; a card, its operations, citations, a question and an error are", () => {
  const side = (overrides: Partial<ShadowSide> = {}): ShadowSide => ({ card: null, cited: ["note:m31"], clarification: false, error: null, outside: [], reads: [], status: "answered", text: "A", ...overrides });
  assert.deepEqual(compareSides(side({ text: "一种说法" }), side({ text: "完全不同的说法" })), []);
  assert.deepEqual(compareSides(side(), side({ cited: ["note:m31", "contact:c17"] })).map((item) => item.field), ["cited"]);
  assert.deepEqual(compareSides(side(), side({ clarification: true })).map((item) => item.field), ["clarification"]);
  assert.deepEqual(compareSides(side({ card: { ops: [{ op: "todo.update", set: { plannedDate: "2026-11-20" }, target: "t" }] } }), side({ card: { ops: [{ op: "todo.update", set: { plannedDate: "2026-11-21" }, target: "t" }] } })).map((item) => item.field), ["card_ops"]);
  assert.deepEqual(compareSides(side(), side({ error: "boom", status: "failed" })).map((item) => item.field), ["error"]);
  assert.deepEqual(compareSides(side(), side({ outside: ["memo:note:x"] })).map((item) => item.field), ["outside"]);
});

test("the old side: its draft card, its direct to-do and its citations", () => {
  const old = oldSideOf({ data: { assistantMessage: "好的", entityDraft: { fields: { plannedDate: "2026-11-20", title: "给小林发修订报价" }, kind: "task" }, provenance: { evidenceIds: ["task:t42"] } }, success: true });
  assert.deepEqual(old.card, { ops: [{ op: "todo.create", set: { plannedDate: "2026-11-20", title: "给小林发修订报价" }, target: null }] });
  assert.deepEqual(old.cited, ["task:t42"]);
  // Where the old answer came from is not a record: it is not compared.
  assert.deepEqual(oldSideOf({ data: { assistantMessage: "x", provenance: { evidenceIds: ["orbit-agent:model-provider", "note:m31"] } }, success: true }).cited, ["note:m31"]);
  assert.equal(oldSideOf({ error: { code: "MODEL_UNAVAILABLE" }, success: false }).error, "MODEL_UNAVAILABLE");
});

test("a failure of the new side is one divergence with the request id; the store keeps it; nothing throws", async () => {
  const store = createMemoryShadowStore();
  const record = await runShadowComparison(deps(store, async () => { throw new Error("model unavailable"); }), { actorId: "actor:a", locale: "zh", message: "上次客户访谈里田中说了什么？", old: OLD_OK, requestId: "request:fail", sessionId: "session:1" });
  assert.equal(record?.requestId, "request:fail");
  assert.equal(record?.new.error, "model unavailable");
  assert.deepEqual(record?.divergences.map((item) => item.field), ["error"]);
  assert.equal(record?.old.text, OLD_OK.data.assistantMessage);
  // scheduled outside a request: an error in configuring or running it is traced, never thrown at the caller
  assert.doesNotThrow(() => scheduleShadowComparison("mock", { actorId: "actor:a", locale: "zh", message: "x", old: OLD_OK, requestId: "request:s", sessionId: "s" }, deps(store, async () => { throw new Error("again"); })));
});

test("the eval fault point `shadow` fails the new side once (README fault where: shadow)", async () => {
  const holder = globalThis as { __orbitAgentEval?: unknown };
  const before = holder.__orbitAgentEval;
  let armed = true;
  holder.__orbitAgentEval = { emit: () => undefined, takeFault: (where: string) => (where === "shadow" && armed ? ((armed = false), { kind: "fail_once", where }) : null) };
  try {
    const store = createMemoryShadowStore();
    const first = await runShadowComparison(deps(store, async () => graphResult()), { actorId: "actor:a", locale: "zh", message: "q", old: OLD_OK, requestId: "request:f1", sessionId: "s" });
    const second = await runShadowComparison(deps(store, async () => graphResult()), { actorId: "actor:a", locale: "zh", message: "q", old: OLD_OK, requestId: "request:f2", sessionId: "s" });
    assert.match(String(first?.new.error), /shadow/u);
    assert.equal(second?.new.error, null);
  } finally {
    holder.__orbitAgentEval = before;
  }
});

test("records are kept per account; the report groups each account's own and nothing else", async () => {
  const store = createMemoryShadowStore();
  await runShadowComparison(deps(store, async () => graphResult()), { actorId: "actor:a", locale: "zh", message: "上次和小林聊了什么？", old: OLD_OK, requestId: "request:a1", sessionId: "s:a" });
  await runShadowComparison(deps(store, async () => graphResult({ sourceRefs: ["memo:note:mb1"] })), { actorId: "actor:b", locale: "zh", message: "上次和小林聊了什么？", old: { data: { assistantMessage: "小林诚要降价。", provenance: { evidenceIds: ["note:mb1"] } }, success: true }, requestId: "request:b1", sessionId: "s:b" });
  assert.deepEqual((await store.list("actor:a")).map((item) => item.requestId), ["request:a1"]);
  assert.deepEqual((await store.list("actor:b")).map((item) => item.requestId), ["request:b1"]);
  const report = await buildShadowReport(store, [{ account: "A", actorId: "actor:a" }, { account: "B", actorId: "actor:b" }], () => "2026-11-21T00:00:00.000Z");
  assert.deepEqual(report.groups.map((group) => [group.account, group.compared, group.divergences, group.foreign.length]), [["A", 1, 0, 0], ["B", 1, 0, 0]]);
  assert.equal(report.totals.foreign, 0);
  const markdown = shadowReportMarkdown(report);
  assert.match(markdown, /request:a1/u);
  assert.match(markdown, /账号 B/u);
});

test("the shadow pass reads the conversation up to this message only (the old path already stored its turn)", () => {
  const messages = [{ role: "user" as const, text: "前一句" }, { role: "assistant" as const, text: "前一句的回答" }, { role: "user" as const, text: "这一句" }, { role: "assistant" as const, text: "旧通路的回答" }];
  assert.deepEqual(messagesBefore(messages, "这一句").map((item) => item.text), ["前一句", "前一句的回答"]);
  assert.equal(messagesBefore(messages, "没出现过").length, 4);
});

test("the configured shadow dependencies never write: no web, a memory checkpoint, session state read only", async () => {
  const configured = configuredShadowDeps("mock", "actor:a");
  assert.equal("web" in configured.graph && configured.graph.web !== undefined, false);
  assert.ok(configured.graph.checkpointer instanceof MemorySaver);
  await configured.graph.sessionState.put("actor:a", { sessionId: "s", updatedAt: "2026-11-15T00:00:00.000Z" } as never);
  assert.equal(await configured.graph.sessionState.get("actor:a", "s"), null);
});
