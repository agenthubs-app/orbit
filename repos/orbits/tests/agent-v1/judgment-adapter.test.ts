import assert from "node:assert/strict";
import test from "node:test";

import { askJudgment, newJudgmentBudget } from "../../features/agent-v1/judgment/ask";
import { GEMINI_DECISIONS_URL, JUDGMENT_MODEL, JUDGMENT_TIMEOUT_MS, JudgmentRequestError, requestDecisions, wireIdOf } from "../../features/agent-v1/judgment/gemini-decision";
import { access, judgeStub, noul, score } from "./judgment-kit";

/**
 * agent-design AG08-4: the Gemini Decisions adapter — the request as the real endpoint takes it (checked on
 * 2026-11-17), the 3 s timeout, non-2xx answers and a missing key. The endpoint is a stub (npm test refuses the host).
 */

test("AG08-4 the request: POST to the decisions endpoint, x-goog-api-key, the model, text input and the question types", async () => {
  const stub = judgeStub((id) => (id.startsWith("intent") ? noul(0.1) : score(2, 0.9)));
  const result = await requestDecisions({
    apiKey: "test-key",
    fetchImplementation: stub.fetchImplementation,
    input: ["排序依据：聊独立出版", "[c1] 山本直子"],
    questions: {
      [wireIdOf("intent.explicitWrite", "m")]: { instructions: "明确要求写入吗", type: "noul" },
      [wireIdOf("match.level", "c1")]: { criteria: ["证据不足", "部分匹配", "匹配"], instructions: "c1 的匹配程度", type: "score" },
    },
  });
  const call = stub.calls[0];
  assert.equal(call.url, GEMINI_DECISIONS_URL);
  assert.equal(call.headers["x-goog-api-key"], "test-key");
  assert.equal(call.headers["content-type"], "application/json");
  assert.equal(call.body.model, JUDGMENT_MODEL);
  assert.deepEqual(call.body.input, [{ text: "排序依据：聊独立出版", type: "text" }, { text: "[c1] 山本直子", type: "text" }]);
  assert.deepEqual(Object.keys(call.body.questions).sort(), ["intent_explicitWrite__m", "match_level__c1"], "ids the endpoint accepts ([A-Za-z0-9_-]{1,64})");
  assert.deepEqual(call.body.questions.match_level__c1.criteria, ["证据不足", "部分匹配", "匹配"], "score levels go as a list");
  assert.equal(call.body.questions.intent_explicitWrite__m.criteria, undefined, "noul takes no criteria");
  assert.equal(result.answers.match_level__c1.score, 2);
  assert.equal(result.inputTokens, 200, "usage.total_input_tokens");
  assert.throws(() => wireIdOf("match.level", "x".repeat(70)), /not accepted/u);
});

test("AG08-4 a 3 s timeout per request; a request that does not answer is a timeout, with no response", async () => {
  assert.equal(JUDGMENT_TIMEOUT_MS, 3_000);
  const stub = judgeStub(() => noul(0.9), { hang: true });
  const started = Date.now();
  await assert.rejects(
    requestDecisions({ apiKey: "k", fetchImplementation: stub.fetchImplementation, input: ["x"], questions: { q: { instructions: "?", type: "noul" } }, timeoutMs: 40 }),
    (error: unknown) => error instanceof JudgmentRequestError && error.code === "timeout" && error.responded === false,
  );
  assert.ok(Date.now() - started < 2_000);
  // Through askJudgment, a timeout is "unavailable" and every item is conservative.
  const outcome = await askJudgment(access(stub.fetchImplementation, { timeoutMs: 40 }), newJudgmentBudget(), { input: ["小林今天来电话了。"], items: [{ key: "m", question: "intent.explicitWrite", subject: "m" }], language: "zh", purpose: "intent" });
  assert.equal(outcome.unavailable, "timeout");
  assert.equal(outcome.sent, true);
  assert.deepEqual({ answer: outcome.verdicts.get("m")!.answer, fallback: outcome.verdicts.get("m")!.fallback, reason: outcome.verdicts.get("m")!.reason }, { answer: "no", fallback: true, reason: "unavailable" });
});

test("AG08-4 a non-2xx answer is an error with a response; askJudgment falls back", async () => {
  const stub = judgeStub(() => noul(0.9), { status: 503 });
  await assert.rejects(
    requestDecisions({ apiKey: "k", fetchImplementation: stub.fetchImplementation, input: ["x"], questions: { q: { instructions: "?", type: "noul" } } }),
    (error: unknown) => error instanceof JudgmentRequestError && error.code === "http_error" && error.responded === true && error.status === 503,
  );
  const outcome = await askJudgment(access(stub.fetchImplementation), newJudgmentBudget(), { input: ["x"], items: [{ key: "d1", question: "duplicate.same", subject: "d1" }], language: "zh", purpose: "duplicate" });
  assert.equal(outcome.unavailable, "http_error");
  assert.equal(outcome.verdicts.get("d1")!.answer, "unsure", "duplicate.same's conservative result: ask the user");
});

test("AG08-4 no key: nothing is sent, every item is conservative", async () => {
  const stub = judgeStub(() => score(2, 0.99));
  const budget = newJudgmentBudget();
  const outcome = await askJudgment({ apiKey: null, fetchImplementation: stub.fetchImplementation, thresholds: access(stub.fetchImplementation).thresholds }, budget, { input: ["x"], items: [{ key: "c1", question: "match.level", subject: "c1" }], language: "en", purpose: "rank" });
  assert.equal(stub.calls.length, 0);
  assert.equal(budget.used, 0);
  assert.equal(outcome.unavailable, "no_key");
  assert.equal(outcome.verdicts.get("c1")!.answer, "insufficient");
  const none = await askJudgment(undefined, newJudgmentBudget(), { input: ["x"], items: [{ key: "c1", question: "match.level", subject: "c1" }], language: "en", purpose: "rank" });
  assert.equal(none.sent, false);
});

test("AG08-4 a malformed answer is dropped: that item is conservative (missing), the others stand", async () => {
  const stub = judgeStub((id) => (id.endsWith("c1") ? { confidence: 2, type: "score" } : score(2, 0.9)));
  const outcome = await askJudgment(access(stub.fetchImplementation), newJudgmentBudget(), { input: ["x"], items: [{ key: "c1", question: "match.level", subject: "c1" }, { key: "c2", question: "match.level", subject: "c2" }], language: "zh", purpose: "rank" });
  assert.equal(outcome.verdicts.get("c1")!.reason, "missing");
  assert.equal(outcome.verdicts.get("c2")!.answer, "match");
});
