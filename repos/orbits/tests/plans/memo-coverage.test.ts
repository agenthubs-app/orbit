/**
 * R24 SC-R24-05（C11）：面谈メモ判定并入 memo 提取（不增加调用次数）。
 * 开关关（不带 planQuestions）时输入与提示词和 W0046 完全一样；带上时只用别名 T1…；≥2 问出确认卡由服务决定；
 * AI 不可用 → 手动勾选卡。
 */
import assert from "node:assert/strict";
import test from "node:test";

import { createAlwaysDenyAiQuotaGate, type AiQuotaGate } from "../../features/ai-quota/gate";
import { runMemoExtraction } from "../../features/contacts/memo-extraction/job";
import {
  buildMemoExtractionInput,
  createDeepseekMemoExtractionProvider,
  createMockMemoExtractionProvider,
  MEMO_EXTRACTION_SYSTEM_PROMPT,
  memoExtractionSystemPrompt,
  parseMemoExtractionContent,
} from "../../features/contacts/memo-extraction/provider";
import { createLiveRecordMemoExtractionStore } from "../../features/contacts/memo-extraction/store";
import { createMemoryLiveRecordStore } from "../../shared/storage/live-record-store";

const NOW = new Date("2026-10-07T03:00:00.000Z");
const PLAN = [{ itemId: "pitem_secret_1", questions: ["最初に何を？", "どこでつまずいた？", "次は誰と？"] }];
const JOB = { actorId: "a", body: "シリーズA の進め方と、つまずいた点を聞いた", contact: { organization: "X", role: "CEO" }, contactId: "c1", noteId: "note:m1" };
const store = () => createLiveRecordMemoExtractionStore({ store: createMemoryLiveRecordStore(), workspaceId: "w" });
const openGate = (): AiQuotaGate => ({
  async beginCall() { return { callId: "call-1" }; },
  async endCall() {},
  async finish() {},
  async reserve() { return { ok: true, operationId: "op-1", owner: true, status: "reserved" }; },
});

test("switch off: the model input and the system prompt are exactly W0046's", () => {
  const plain = buildMemoExtractionInput({ contact: JOB.contact, memo: JOB.body });
  assert.deepEqual(Object.keys(plain).sort(), ["company", "memo", "title"]);
  assert.equal(memoExtractionSystemPrompt({ contact: JOB.contact, memo: JOB.body }), MEMO_EXTRACTION_SYSTEM_PROMPT);
});

test("switch on: the three questions go as alias T1, never the item id; coverage maps back to the item", () => {
  const input = buildMemoExtractionInput({ contact: JOB.contact, memo: JOB.body, planQuestions: PLAN });
  assert.deepEqual(input.planTypes, [{ questions: PLAN[0]!.questions, type: "T1" }]);
  assert.ok(!JSON.stringify(input).includes("pitem_secret_1"));
  const output = parseMemoExtractionContent(JSON.stringify({ eventTypes: ["met"], offering: [], questionCoverage: [{ answered: [0, 1, 7, 1], type: "T1" }, { answered: [0], type: "T9" }], seeking: [], topics: [] }), PLAN);
  assert.deepEqual(output.questionCoverage, [{ answered: [0, 1], itemId: "pitem_secret_1" }]);
});

test("the real provider sends the alias input and the extended prompt in one HTTP call", async () => {
  const bodies: Array<{ messages: Array<{ content: string }> }> = [];
  const provider = createDeepseekMemoExtractionProvider({
    apiKey: "k",
    fetchImplementation: async (_url, init) => {
      bodies.push(JSON.parse(String(init!.body)));
      return new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify({ eventTypes: [], offering: [], questionCoverage: [{ answered: [0, 2], type: "T1" }], seeking: [], topics: [] }) } }], usage: { completion_tokens: 10, prompt_tokens: 100 } }), { status: 200 });
    },
  });
  const result = await provider.extract({ contact: JOB.contact, memo: JOB.body, planQuestions: PLAN });
  assert.equal(bodies.length, 1);
  assert.match(bodies[0]!.messages[0]!.content, /questionCoverage/);
  assert.deepEqual(result.output.questionCoverage, [{ answered: [0, 2], itemId: "pitem_secret_1" }]);
});

test("the job hands the coverage to the plan (not manual) when the AI ran", async () => {
  const calls: unknown[] = [];
  const provider = createMockMemoExtractionProvider({ eventTypes: [], offering: [], questionCoverage: [{ answered: [0, 2], itemId: "pitem_secret_1" }], seeking: [], topics: [] });
  await runMemoExtraction({ ...JOB, planQuestions: PLAN }, { applyValues: async () => [], gate: openGate(), now: () => NOW, onPlanCoverage: async (input) => { calls.push(input); }, provider, store: store() });
  assert.equal(provider.calls.length, 1, "no extra AI call");
  assert.deepEqual(provider.calls[0]!.planQuestions, PLAN);
  assert.equal(calls.length, 1);
  assert.equal((calls[0] as { manual: boolean }).manual, false);
});

test("AI unavailable (gate closed) → a manual tick card; switch off → nothing for the plan", async () => {
  const calls: Array<{ manual: boolean }> = [];
  await runMemoExtraction({ ...JOB, noteId: "note:m2", planQuestions: PLAN }, { applyValues: async () => [], gate: createAlwaysDenyAiQuotaGate(), now: () => NOW, onPlanCoverage: async (input) => { calls.push(input); }, provider: createMockMemoExtractionProvider(), store: store() });
  assert.deepEqual(calls.map((call) => call.manual), [true]);
  const none: unknown[] = [];
  await runMemoExtraction({ ...JOB, noteId: "note:m3" }, { applyValues: async () => [], gate: openGate(), now: () => NOW, onPlanCoverage: async (input) => { none.push(input); }, provider: createMockMemoExtractionProvider(), store: store() });
  assert.deepEqual(none, []);
});
