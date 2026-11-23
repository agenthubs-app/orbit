import assert from "node:assert/strict";
import test from "node:test";

import { JudgmentRequestError, requestDecisions, retryableJudgmentFailure } from "../../features/agent-v1/judgment/gemini-decision";
import { captureTrace } from "./graph-kit";
import { runFn } from "./functions-kit";

/**
 * agent-design AG13 repair round 6 (judged run-06): about 40% of judgment calls hung until the 3 s abort while the others
 * answered in ~0.5 s. (1) The client retries a hung / unreachable / 5xx call once at once, with a fresh limit; never a 4xx,
 * an unreadable body or the caller's own stop. (2) AE-FN-001: with the topic check not finished, the reply does not say
 * all five events "match"; the list stays in the order code can test (weekend mornings first).
 */

const QUESTIONS = { match_level__c1: { answer_type: "noul", prompt: "q" } } as never;
const ANSWER = { answers: { match_level__c1: { confidence: 0.9, noul: 0.8, type: "noul" } }, usage: { total_input_tokens: 10 } };
const hang = (init?: RequestInit) => new Promise<Response>((_resolve, reject) => init?.signal?.addEventListener("abort", () => reject(new Error("aborted")), { once: true }));
const ok = () => new Response(JSON.stringify(ANSWER), { headers: { "content-type": "application/json" }, status: 200 });

test("a hung call is sent once more with a fresh limit; both attempts are traced", async () => {
  let calls = 0;
  const trace = captureTrace();
  try {
    const result = await requestDecisions({ apiKey: "k", fetchImplementation: (async (_url: unknown, init?: RequestInit) => (++calls === 1 ? hang(init) : ok())) as typeof fetch, input: ["text"], questions: QUESTIONS, timeoutMs: 30 });
    assert.equal(calls, 2);
    assert.equal(result.answers.match_level__c1?.type, "noul");
    assert.ok(trace.events.some((event) => event.type === "judgment.attempt_failed" && event.attempt === 1 && event.code === "timeout"));
    assert.ok(trace.events.some((event) => event.type === "judgment.retry" && event.attempt === 2 && event.outcome === "answered"));
  } finally {
    trace.restore();
  }
});

test("a call that hangs twice fails as a timeout after two attempts", async () => {
  let calls = 0;
  await assert.rejects(requestDecisions({ apiKey: "k", fetchImplementation: (async (_url: unknown, init?: RequestInit) => { calls += 1; return hang(init); }) as typeof fetch, input: ["text"], questions: QUESTIONS, timeoutMs: 30 }), (error: unknown) => error instanceof JudgmentRequestError && error.code === "timeout");
  assert.equal(calls, 2);
});

test("a 5xx is retried; a 4xx, an unreadable body and the caller's own stop are not", async () => {
  let calls = 0;
  const fiveHundred = await requestDecisions({ apiKey: "k", fetchImplementation: (async () => (++calls === 1 ? new Response("{}", { status: 503 }) : ok())) as typeof fetch, input: ["text"], questions: QUESTIONS, timeoutMs: 200 });
  assert.equal(calls, 2);
  assert.ok(fiveHundred.answers.match_level__c1);
  calls = 0;
  await assert.rejects(requestDecisions({ apiKey: "k", fetchImplementation: (async () => { calls += 1; return new Response("{}", { status: 400 }); }) as typeof fetch, input: ["text"], questions: QUESTIONS, timeoutMs: 200 }));
  assert.equal(calls, 1, "a 4xx is not retried");
  calls = 0;
  await assert.rejects(requestDecisions({ apiKey: "k", fetchImplementation: (async () => { calls += 1; return new Response("not json", { status: 200 }); }) as typeof fetch, input: ["text"], questions: QUESTIONS, timeoutMs: 200 }));
  assert.equal(calls, 1, "an unreadable body is not retried");
  const controller = new AbortController();
  calls = 0;
  const pending = requestDecisions({ apiKey: "k", fetchImplementation: (async (_url: unknown, init?: RequestInit) => { calls += 1; return hang(init); }) as typeof fetch, input: ["text"], questions: QUESTIONS, signal: controller.signal, timeoutMs: 1000 });
  controller.abort();
  await assert.rejects(pending);
  assert.equal(calls, 1, "the caller's own stop is not retried");
  assert.equal(retryableJudgmentFailure(new JudgmentRequestError("http_error", "x", true, 502)), true);
  assert.equal(retryableJudgmentFailure(new JudgmentRequestError("http_error", "x", true, 429)), false);
});

test("AE-FN-001: the topic check timed out — the reply does not say all five match; weekend mornings stay first", async () => {
  const message = "从 @东京街头摄影展 @街拍工作坊 @SaaS 定价研讨会 @设计师之夜 @独立出版市集 里挑三场，优先周末上午，最好跟 @兴趣笔记 的主题有关。";
  const refs = [["event:e101", "东京街头摄影展", "event"], ["event:e102", "街拍工作坊", "event"], ["event:e103", "SaaS 定价研讨会", "event"], ["event:e104", "设计师之夜", "event"], ["event:e105", "独立出版市集", "event"], ["note:m36", "兴趣笔记", "memo"]].map(([id, name, type]) => ({ id, name, type }));
  const run = await runFn(message, [{ dataSources: ["orbit_records"], deliverable: "ranked_list", objectClues: refs.map((ref, index) => ({ entity: ref.type, referenceId: `r${index + 1}`, text: `@${ref.name}` })), rank: { basis: "跟 @兴趣笔记 的主题有关", count: 3, within: "周末上午" }, requiredCapabilities: ["event.read", "memo.read", "fn.rank"], sourceQuote: message }], { judgeOptions: { hang: true }, references: refs });
  const listed = run.events.filter((event) => event.type === "fn.rank").at(-1)!.listed as string[];
  assert.deepEqual([...listed].sort(), ["event:event:e101", "event:event:e102", "event:event:e105"], "the three weekend mornings, by code");
  assert.doesNotMatch(run.result.text, /符合条件的一共/u, run.result.text);
  assert.match(run.result.text, /这次没能核对（复核暂时不可用）/u, run.result.text);
  assert.ok(run.events.some((event) => event.type === "functions.coverage_unchecked"));
});
