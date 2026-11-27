/**
 * iOrbit 对话计量与每日上限（2026-11-27）：一轮 = 账本一次操作（agent_chat / user / manual），每次模型 HTTP 一条子账带 token；
 * 超限的这一轮不调用模型、回固定的话（三语）；账本出问题照常对话（fail-open）。账本用内存替身（真实 PostgreSQL 的口径见
 * tests/capabilities/ai-usage-agent-chat-postgres.test.ts）。
 */
import assert from "node:assert/strict";
import { test } from "node:test";

import { AGENT_CHAT_DAILY_LIMIT, AI_QUOTA_MAX_CALLS } from "../../features/ai-quota/constants";
import type { AiQuotaGate, AiQuotaReservation, AiQuotaReserveInput } from "../../features/ai-quota/gate";
import { acceptMessage, getRequestResult, settleSession, type AgentEntryDependencies, type AgentEntryExecutor } from "../../features/agent-v1/entry/service";
import { createMemoryAgentEntryStore } from "../../features/agent-v1/entry/store";
import { agentChatDailyLimitText } from "../../features/agent-v1/entry/usage-gate";

const LIMIT_TEXT = { en: agentChatDailyLimitText("en"), ja: agentChatDailyLimitText("ja"), zh: agentChatDailyLimitText("zh") };
import { createGraphExecutor } from "../../features/agent-v1/graph/executor";
import { requestDecisions, requestDecisionsOnce } from "../../features/agent-v1/judgment/gemini-decision";
import { callMainModel } from "../../features/agent-v1/models/main";
import { runWithModelUsageMeter, type ModelCallUsage, type ModelUsageMeter } from "../../features/agent-v1/models/usage-meter";
import { createCardKit } from "../services/agent-ledger-card-kit";
import { deepseekStub, graphKit, json, part, recordAccessOf } from "./graph-kit";
import { smallWorld } from "./read-kit";

interface Call { operationId: string; provider: string; model: string; usage?: ModelCallUsage | null }

/** An in-memory AI ledger with the same contract as ai-quota/ledger.ts (one operation per key, released without a response). */
function memoryLedger(options: { usedToday?: number; fail?: "reserve" | "beginCall" | "endCall" | "finish" } = {}) {
  const reserves: AiQuotaReserveInput[] = [];
  const operations = new Map<string, { key: string; status: string; calls: Call[] }>();
  let usedToday = options.usedToday ?? 0;
  const gate: AiQuotaGate = {
    async reserve(input): Promise<AiQuotaReservation> {
      reserves.push(input);
      if (options.fail === "reserve") throw new Error("ledger down");
      const existing = [...operations.entries()].find(([, op]) => op.key === input.idempotencyKey);
      if (existing && existing[1].status !== "released") return { ok: true, operationId: existing[0], owner: input.takeover === true && existing[1].status === "reserved", status: existing[1].status as "reserved" };
      if (input.purpose === "agent_chat" && usedToday >= AGENT_CHAT_DAILY_LIMIT) return { limit: "agent_chat", ok: false, reason: "daily_limit", retryOn: "2026-11-27T15:00:00.000Z" };
      const id = `aiop_${operations.size + 1}`;
      operations.set(id, { calls: [], key: input.idempotencyKey, status: "reserved" });
      return { ok: true, operationId: id, owner: true, status: "reserved" };
    },
    async beginCall(operationId, call) {
      if (options.fail === "beginCall") throw new Error("ledger down");
      const op = operations.get(operationId)!;
      if (op.status !== "reserved") throw new Error("not open");
      if (op.calls.length >= AI_QUOTA_MAX_CALLS.agent_chat) throw new Error("max calls");
      op.calls.push({ operationId, ...call });
      return { callId: `${operationId}#${op.calls.length}` };
    },
    async endCall(callId, usage) {
      if (options.fail === "endCall") throw new Error("ledger down");
      const [operationId, seq] = callId.split("#");
      operations.get(operationId)!.calls[Number(seq) - 1].usage = usage;
    },
    async finish(operationId, outcome) {
      if (options.fail === "finish") throw new Error("ledger down");
      const op = operations.get(operationId)!;
      if (op.status !== "reserved") return;
      op.status = op.calls.some((call) => call.usage) ? outcome : "released";
      if (op.status !== "released") usedToday += 1;
    },
  };
  return { gate, operations, reserves, used: () => usedToday };
}

function silenceWarnings(): { warnings: string[]; restore: () => void } {
  const warnings: string[] = [];
  const original = console.warn;
  console.warn = (message?: unknown) => { warnings.push(String(message)); };
  return { restore: () => { console.warn = original; }, warnings };
}

const ASK = json({ parts: [part({ clarity: "multiple_readings", objectClues: [{ entity: "contact", text: "小林" }], readings: [{ capabilities: ["contact.read"], deliverable: "answer", label: "查小林的资料" }, { capabilities: ["todo.update"], deliverable: "change", label: "改小林相关的待办" }], requiredCapabilities: ["contact.read"], sourceQuote: "帮我处理一下小林那件事" })], plainChat: false });

function graphEntry(usage: AiQuotaGate | null) {
  const model = deepseekStub(() => ASK);
  const world = smallWorld();
  for (const record of world.records) if (record.userId === "user:a") record.userId = "actor:a";
  const kit = graphKit(model.fetchImplementation, { records: recordAccessOf(world) });
  const store = createMemoryAgentEntryStore();
  const cards = createCardKit();
  const deps: AgentEntryDependencies = { execute: createGraphExecutor("mock", { ...kit.deps, entryStore: store, runtime: cards.runtime }), schedule: (task) => { void task(); }, sessions: null, store, usage };
  return { deps, model };
}

let sessionSeq = 0;
async function send(deps: AgentEntryDependencies, message: string, locale: "zh" | "ja" | "en" = "zh") {
  const sessionId = `session:usage:${(sessionSeq += 1)}`;
  const { receipt } = await acceptMessage(deps, { actorId: "actor:a", body: { clientMessageId: "m:1", locale, message, protocolVersion: 3, references: [], sessionId } });
  await settleSession("actor:a", sessionId);
  return (await getRequestResult(deps, { actorId: "actor:a", requestId: receipt.requestId }))!;
}

test("one round through the graph = one agent_chat operation in the user pool, its model call recorded with the provider's tokens", async () => {
  const ledger = memoryLedger();
  const { deps, model } = graphEntry(ledger.gate);
  const doc = await send(deps, "帮我处理一下小林那件事。");
  assert.notEqual(doc.status, "failed");
  assert.equal(model.calls.length, 1);
  assert.equal(ledger.reserves.length, 1);
  const reserve = ledger.reserves[0];
  assert.deepEqual([reserve.pool, reserve.purpose, reserve.trigger, reserve.takeover], ["user", "agent_chat", "manual", true]);
  assert.match(reserve.idempotencyKey, /^agent-chat:/u);
  const [op] = [...ledger.operations.values()];
  assert.equal(op.status, "succeeded");
  assert.deepEqual(op.calls.map((call) => [call.provider, call.usage]), [["deepseek", { inputTokens: 100, outputTokens: 10 }]]);
  assert.equal(ledger.used(), 1);
});

test("every exit of a round lands on the same operation: main model calls, a failed one with no usage, and judgment attempts", async () => {
  const ledger = memoryLedger();
  process.env.DEEPSEEK_API_KEY ??= "test-key-not-real";
  let main = 0;
  const mainFetch = (async () => {
    main += 1;
    if (main === 2) return new Response(JSON.stringify({ error: { message: "busy" } }), { status: 503 });
    return new Response(JSON.stringify({ choices: [{ finish_reason: "stop", index: 0, message: { content: "{}", role: "assistant" } }], usage: { completion_tokens: 7 * main, prompt_tokens: 70 * main } }), { status: 200 });
  }) as typeof fetch;
  let judged = 0;
  const judgmentFetch = (async () => {
    judged += 1;
    if (judged === 1) return new Response("{}", { status: 500 });
    return new Response(JSON.stringify({ answers: { q: { confidence: 0.9, noul: 0.8, type: "noul" } }, usage: { total_input_tokens: 42 } }), { status: 200 });
  }) as typeof fetch;
  const execute: AgentEntryExecutor = async () => {
    const budget = { limit: 4, used: 0 };
    const base = { budget, fetchImplementation: mainFetch, node: "answer" as const, requestId: "r", system: "s", user: "u" };
    await callMainModel({ ...base, purpose: "first" });
    await callMainModel({ ...base, purpose: "retry" });
    await callMainModel({ ...base, purpose: "repair" });
    // requestDecisions retries a 5xx once: two HTTP, the first without a usage.
    await requestDecisions({ apiKey: "k", fetchImplementation: judgmentFetch, input: ["x"], questions: { q: { instructions: "i", type: "noul" } } });
    await requestDecisionsOnce({ apiKey: "k", fetchImplementation: judgmentFetch, input: ["x"], questions: { q: { instructions: "i", type: "noul" } } });
    return { sourceRefs: [], text: "ok" };
  };
  const store = createMemoryAgentEntryStore();
  const doc = await send({ execute, schedule: (task) => { void task(); }, sessions: null, store, usage: ledger.gate }, "hi", "en");
  assert.equal(doc.answer?.text, "ok");
  const [op] = [...ledger.operations.values()];
  assert.deepEqual(op.calls.map((call) => [call.provider, call.usage ?? null]), [
    ["deepseek", { inputTokens: 70, outputTokens: 7 }],
    ["deepseek", null],
    ["deepseek", { inputTokens: 210, outputTokens: 21 }],
    ["gemini", null],
    ["gemini", { inputTokens: 42, outputTokens: 0 }],
    ["gemini", { inputTokens: 42, outputTokens: 0 }],
  ]);
  assert.equal(op.status, "succeeded");
});

test("a round that made no model call is released and not counted", async () => {
  const ledger = memoryLedger();
  const store = createMemoryAgentEntryStore();
  await send({ execute: async () => ({ sourceRefs: [], text: "rules only" }), schedule: (task) => { void task(); }, sessions: null, store, usage: ledger.gate }, "hi");
  assert.deepEqual([...ledger.operations.values()].map((op) => op.status), ["released"]);
  assert.equal(ledger.used(), 0);
});

test("over the daily limit (round 101): no model request, the fixed reply in the interface language, a completed answer (not an error)", async () => {
  for (const locale of ["zh", "ja", "en"] as const) {
    const ledger = memoryLedger({ usedToday: AGENT_CHAT_DAILY_LIMIT });
    const { deps, model } = graphEntry(ledger.gate);
    const doc = await send(deps, "帮我处理一下小林那件事。", locale);
    assert.equal(model.calls.length, 0, `${locale}: no model request`);
    assert.equal(doc.status, "completed");
    assert.equal(doc.answer?.text, LIMIT_TEXT[locale]);
    assert.deepEqual(doc.partResults.map((item) => item.status), ["answered"]);
    assert.equal(ledger.operations.size, 0, "nothing is reserved for a refused round");
  }
});

test("round 100 still runs, round 101 is refused (the count comes from the ledger)", async () => {
  const ledger = memoryLedger({ usedToday: AGENT_CHAT_DAILY_LIMIT - 1 });
  const { deps, model } = graphEntry(ledger.gate);
  const hundredth = await send(deps, "帮我处理一下小林那件事。");
  assert.notEqual(hundredth.answer?.text, LIMIT_TEXT.zh);
  assert.equal(model.calls.length, 1);
  const next = await send(deps, "帮我处理一下小林那件事。");
  assert.equal(next.answer?.text, LIMIT_TEXT.zh);
  assert.equal(model.calls.length, 1, "the 101st round sends nothing");
});

test("the fixed reply: three languages with the public number (from the constant), plain (no exclamation mark), Japanese for an unknown locale", () => {
  assert.equal(agentChatDailyLimitText("zh"), `今天的 ${AGENT_CHAT_DAILY_LIMIT} 轮对话已用完，明天恢复。已有的内容照常可以查看。`);
  assert.equal(agentChatDailyLimitText("ja"), `本日の会話${AGENT_CHAT_DAILY_LIMIT}回を使い切りました。明日また使えます。これまでの内容はいつもどおりご覧いただけます。`);
  assert.match(agentChatDailyLimitText("en"), new RegExp(`^Today's ${AGENT_CHAT_DAILY_LIMIT} conversations are used up`, "u"));
  assert.equal(agentChatDailyLimitText("fr"), LIMIT_TEXT.ja);
  assert.match(agentChatDailyLimitText("zh", 7), /今天的 7 轮对话/u, "the number follows the ledger's cap");
  for (const text of Object.values(LIMIT_TEXT)) assert.doesNotMatch(text, /[!！]/u);
});

test("a ledger that fails never stops the conversation (fail-open) and leaves a warning", async () => {
  for (const fail of ["reserve", "beginCall", "endCall", "finish"] as const) {
    const ledger = memoryLedger({ fail });
    const { deps, model } = graphEntry(ledger.gate);
    const quiet = silenceWarnings();
    let doc;
    try {
      doc = await send(deps, "帮我处理一下小林那件事。");
    } finally {
      quiet.restore();
    }
    assert.equal(model.calls.length, 1, `${fail}: the model is still called`);
    assert.notEqual(doc.status, "failed", fail);
    assert.notEqual(doc.answer?.text, LIMIT_TEXT.zh, fail);
    assert.ok(quiet.warnings.some((line) => /agent_chat_ledger_/u.test(line)), `${fail}: a warning is logged`);
  }
});

test("a ledger that is not migrated yet (disabled) or a round without a ledger runs as before", async () => {
  const disabled: AiQuotaGate = {
    async beginCall() { throw new Error("unused"); },
    async endCall() { throw new Error("unused"); },
    async finish() { throw new Error("unused"); },
    async reserve() { return { ok: false, reason: "disabled" }; },
  };
  for (const usage of [disabled, null]) {
    const { deps, model } = graphEntry(usage);
    const quiet = silenceWarnings();
    try {
      const doc = await send(deps, "帮我处理一下小林那件事。");
      assert.notEqual(doc.status, "failed");
    } finally {
      quiet.restore();
    }
    assert.equal(model.calls.length, 1);
  }
});

test("outside a metered round the exits record nothing", async () => {
  const seen: string[] = [];
  const meter: ModelUsageMeter = { async begin(call) { seen.push(call.provider); return "c"; }, async end() {} };
  process.env.DEEPSEEK_API_KEY ??= "test-key-not-real";
  const model = deepseekStub(() => "{}");
  await callMainModel({ budget: { limit: 4, used: 0 }, fetchImplementation: model.fetchImplementation, node: "answer", purpose: "first", requestId: "r", system: "s", user: "u" });
  assert.deepEqual(seen, []);
  await runWithModelUsageMeter(meter, () => callMainModel({ budget: { limit: 4, used: 0 }, fetchImplementation: model.fetchImplementation, node: "answer", purpose: "first", requestId: "r", system: "s", user: "u" }));
  assert.deepEqual(seen, ["deepseek"]);
});

test("max_calls covers the round's exits: main budget 4 + judgment 3 requests × 2 attempts", () => {
  assert.equal(AI_QUOTA_MAX_CALLS.agent_chat, 10);
  assert.ok(AI_QUOTA_MAX_CALLS.agent_chat <= 20, "the table allows at most 20");
});

test("2026-11-27 tiers: over the free monthly 100, the round answers with the number, the reset date and the Pro limit; the tier reaches the ledger", async () => {
  const reserves: AiQuotaReserveInput[] = [];
  const gate: AiQuotaGate = {
    async beginCall() { throw new Error("unused"); },
    async endCall() { throw new Error("unused"); },
    async finish() { throw new Error("unused"); },
    async reserve(input) { reserves.push(input); return { cap: 100, limit: "monthly", ok: false, reason: "monthly_limit", retryOn: "2026-11-30T15:00:00.000Z", used: 100 }; },
  };
  const { deps, model } = graphEntry(gate);
  const doc = await send({ ...deps, tier: "free" }, "帮我处理一下小林那件事。", "zh");
  assert.equal(model.calls.length, 0);
  assert.equal(doc.status, "completed");
  assert.equal(doc.answer?.text, "这个月的 100 轮对话已用完，12月1日恢复。升级到 Pro 每月可对话 1,000 轮。");
  assert.equal(reserves[0]?.tier, "free");
  const pro = await send({ ...graphEntry(gate).deps, tier: "pro" }, "帮我处理一下小林那件事。", "en");
  assert.equal(reserves.at(-1)?.tier, "pro");
  assert.equal(pro.answer?.text, "This month's 100 conversations are used up. They come back on December 1. Everything you already have can still be viewed as usual.", "the ledger's cap is what the line says; no upgrade line on pro");
});
