/**
 * R33 SC-R33-03（plan-v3/DESIGN.md §2.4）：事实累积、切段抽取、手动加事实；mock provider，真实调用 0 次。
 *
 * - 同一联系人依次抽取 3 条备注（含 1 条 3000 字）：`contact_facts` 是三条备注事实的并集，重复文本只一行且 lastSeenAt 更新、
 *   memoId 指向最早来源；3000 字备注切成 ≥2 段分别调用 provider，调用次数 = 段数；
 * - `memo_extractions` 记录与 `publicProfile` 的既有写入与不带事实累积时逐字节相同；
 * - 手动加的事实在后续抽取后仍在；某一段 provider 失败时其余段的事实已落库且作业报告失败段；
 * - 切段只切在段落 / 句子边界，各段拼回来等于原文；某段被日限挡住 → deferred，到期重跑只做剩下的段。
 */
import assert from "node:assert/strict";
import test from "node:test";

import type { AiQuotaGate } from "../../features/ai-quota/gate";
import { accumulateContactFacts, addManualContactFact, ContactFactError, factsFromExtraction } from "../../features/contacts/facts/accumulate";
import { createLiveRecordContactFactStore } from "../../features/contacts/facts/store";
import { contactFactId, normalizeFactText } from "../../features/contacts/facts/types";
import { memoExtractionKey, mergeSegmentOutputs, runMemoExtraction, type MemoExtractionJobDeps, type MemoExtractionJobInput } from "../../features/contacts/memo-extraction/job";
import { createMockMemoExtractionProvider, MEMO_EXTRACTION_LIMITS, MemoExtractionError, type MemoExtractionInput, type MemoExtractionOutput, type MemoExtractionProvider } from "../../features/contacts/memo-extraction/provider";
import { segmentMemo } from "../../features/contacts/memo-extraction/segment";
import { createLiveRecordMemoExtractionStore } from "../../features/contacts/memo-extraction/store";
import { createStorageContactGraphProvider } from "../../features/contacts/storage/contact-live-record-provider";
import { createMemoryLiveRecordStore, type LiveRecord } from "../../shared/storage/live-record-store";

const ACTOR = "a";
const CONTACT = "c1";
const AT = "2026-09-25T00:00:00.000Z";

function world() {
  const live = createMemoryLiveRecordStore([{
    workspaceId: "w", collectionName: "contacts", recordId: CONTACT, userId: ACTOR, sourceType: "manual", sourceId: "f", evidenceIds: ["e"], lifecycleState: "active", createdAt: AT, updatedAt: AT,
    payload: { source: { type: "manual", id: "f" }, evidenceIds: ["e"], createdAt: AT, updatedAt: AT, stage: "active", accountId: ACTOR, id: CONTACT, displayName: "田中" },
  }, {
    workspaceId: "w", collectionName: "contacts", recordId: "c2", userId: ACTOR, sourceType: "manual", sourceId: "f", evidenceIds: ["e"], lifecycleState: "active", createdAt: AT, updatedAt: AT,
    payload: { source: { type: "manual", id: "f" }, evidenceIds: ["e"], createdAt: AT, updatedAt: AT, stage: "active", accountId: ACTOR, id: "c2", displayName: "佐藤" },
  }] as LiveRecord[]);
  const facts = createLiveRecordContactFactStore({ store: live, workspaceId: "w" });
  const memos = createLiveRecordMemoExtractionStore({ store: live, workspaceId: "w" });
  const contacts = createStorageContactGraphProvider({ store: live, workspaceId: "w" });
  let tick = Date.parse("2026-10-02T03:00:00.000Z");
  const now = () => new Date((tick += 1000));
  const gateLog: string[] = [];
  const gate: AiQuotaGate = {
    async reserve(input) { gateLog.push(`reserve:${input.idempotencyKey}`); return { ok: true, operationId: `op:${input.idempotencyKey}`, owner: true, status: "reserved" }; },
    async beginCall(operationId) { gateLog.push(`begin:${operationId}`); return { callId: `${operationId}#1` }; },
    async endCall(callId, usage) { gateLog.push(`end:${callId}:${usage ? "ok" : "none"}`); },
    async finish(operationId, outcome) { gateLog.push(`finish:${operationId}:${outcome}`); },
  };
  const profile = async (id = CONTACT) => ((await live.getRecord({ workspaceId: "w", collectionName: "contacts", recordId: id }))!.payload as { publicProfile?: Record<string, string[]> }).publicProfile ?? {};
  const deps = (provider: MemoExtractionProvider, withFacts = true): MemoExtractionJobDeps => ({
    gate, provider, store: memos, now,
    applyValues: async ({ actorId, contactId, values, at }) => contacts.applyContactMemoExtraction!(contactId, actorId, values, at),
    ...(withFacts ? { accumulateFacts: (input) => accumulateContactFacts(facts, input) } : {}),
  });
  return { contacts, deps, facts, gate, gateLog, live, memos, profile };
}

const job = (noteId: string, body: string, contactId = CONTACT, memoDate?: string): MemoExtractionJobInput => ({ actorId: ACTOR, body, contact: { organization: "Nexa", role: "CEO" }, contactId, noteId, ...(memoDate ? { memoDate } : {}) });

/** 按段内容决定输出的 mock provider（段里出现关键字就给对应事实）。 */
function keywordProvider(rules: Array<{ when: string; output: Partial<MemoExtractionOutput> }>, fail?: (input: MemoExtractionInput) => boolean) {
  const calls: MemoExtractionInput[] = [];
  const provider: MemoExtractionProvider & { calls: MemoExtractionInput[] } = {
    calls, model: "mock-memo-extraction", providerName: "mock",
    async extract(input) {
      calls.push(input);
      if (fail?.(input)) throw new MemoExtractionError("PROVIDER_REQUEST_FAILED", "boom");
      const output: MemoExtractionOutput = { eventTypes: [], offering: [], seeking: [], topics: [] };
      for (const rule of rules) {
        if (!input.memo.includes(rule.when)) continue;
        for (const field of ["offering", "seeking", "topics", "eventTypes"] as const) if (rule.output[field]) (output[field] as string[]).push(...(rule.output[field] as string[]));
      }
      return { model: "mock-memo-extraction", output, usage: { inputTokens: 10, outputTokens: 2, latencyMs: 1 } };
    },
  };
  return provider;
}

const sentence = (text: string, times: number) => Array.from({ length: times }, () => text).join("");

test("three memos (one of 3000 characters) accumulate the union of facts; duplicates are one row with the earliest memo and a later lastSeenAt", async () => {
  const w = world();
  const provider = keywordProvider([
    { when: "出海", output: { offering: ["SaaS 出海経験"], seeking: ["B 輪投資家"], topics: ["資金調達"], eventTypes: ["met"] } },
    { when: "採用", output: { offering: ["SaaS 出海経験"], seeking: ["エンジニア採用"], topics: ["採用"] } },
    { when: "東京", output: { topics: ["東京のイベント"], eventTypes: ["followed_up"] } },
    { when: "大阪", output: { seeking: ["大阪の販路"], eventTypes: ["met"] } },
  ]);
  const long = `${sentence("東京のイベントで会った。", 100)}\n\n${sentence("大阪の販路を探している。", 100)}\n${sentence("出海の話もした。", 100)}`;
  assert.ok(Array.from(long).length >= 3000, `long memo is ${Array.from(long).length} chars`);
  const segments = segmentMemo(long);
  assert.ok(segments.length >= 2);

  const m1 = await runMemoExtraction(job("note:m1", "彼女は SaaS 出海の経験がある。", CONTACT, "2026-09-01T00:00:00.000Z"), w.deps(provider));
  assert.equal(m1.status, "succeeded");
  const m2 = await runMemoExtraction(job("note:m2", "採用の相談。SaaS 出海の話も。", CONTACT, "2026-09-10T00:00:00.000Z"), w.deps(provider));
  assert.equal(m2.status, "succeeded");
  const m3 = await runMemoExtraction(job("note:m3", long, CONTACT, "2026-09-20T00:00:00.000Z"), w.deps(provider));
  assert.equal(m3.status, "succeeded", JSON.stringify(m3));
  assert.equal(provider.calls.length, 2 + segments.length, "the long memo is one provider call per segment");
  assert.deepEqual(provider.calls.slice(2).map((call) => call.memo), segments);
  assert.deepEqual(m3.segments, { done: segments.map((_, index) => index), failed: [], total: segments.length });
  assert.equal(w.gateLog.filter((entry) => entry.startsWith("reserve:")).length, 2 + segments.length, "each segment is its own reservation");

  const facts = await w.facts.list({ actorId: ACTOR, contactId: CONTACT });
  const texts = facts.map((fact) => `${fact.field}:${fact.text}`).sort();
  assert.deepEqual(texts, [
    "event:followed_up", "event:met",
    "offering:SaaS 出海経験",
    "seeking:B 輪投資家", "seeking:エンジニア採用", "seeking:大阪の販路",
    "topic:採用", "topic:東京のイベント", "topic:資金調達",
  ]);
  const offering = facts.find((fact) => fact.field === "offering")!;
  assert.equal(offering.memoId, "note:m1", "the duplicate keeps the earliest memo");
  assert.equal(offering.memoDate, "2026-09-01T00:00:00.000Z");
  assert.ok(offering.lastSeenAt > offering.firstSeenAt, "lastSeenAt moved to the later extraction");
  assert.equal(offering.id, contactFactId({ actorId: ACTOR, contactId: CONTACT, field: "offering", normalized: normalizeFactText("SaaS 出海経験") }));
  // 另一个联系人的同一文本是另一行（合并键含 contactId）。
  await runMemoExtraction(job("note:m4", "出海経験の人。", "c2"), w.deps(provider));
  assert.equal((await w.facts.list({ actorId: ACTOR, contactId: "c2" })).find((fact) => fact.field === "offering")!.memoId, "note:m4");
  assert.equal((await w.facts.list({ actorId: ACTOR, contactId: CONTACT })).length, 9);
  // 联系人行照旧只写三个字段（合并结果）。
  assert.deepEqual(await w.profile(), { offering: ["SaaS 出海経験"], seeking: ["大阪の販路", "B 輪投資家"], topics: ["東京のイベント", "資金調達"] });
});

test("the memo_extractions record and the publicProfile write are byte-identical with and without fact accumulation", async () => {
  const output = { eventTypes: ["met" as const], offering: ["SaaS 出海経験"], seeking: ["B 輪投資家"], topics: ["資金調達"] };
  const run = async (withFacts: boolean) => {
    const w = world();
    const applied: unknown[] = [];
    const deps = w.deps(createMockMemoExtractionProvider(output), withFacts);
    const record = await runMemoExtraction(job("note:same", "同じ本文。"), { ...deps, applyValues: async (input) => { applied.push(input); return deps.applyValues(input); } });
    const stored = await w.live.getRecord({ workspaceId: "w", collectionName: "memo_extractions", recordId: `memo-extraction:${ACTOR}:${memoExtractionKey("note:same", "同じ本文。")}` });
    return { applied, profile: await w.profile(), record, stored, facts: await w.facts.list({ actorId: ACTOR, contactId: CONTACT }) };
  };
  const [without, with_] = [await run(false), await run(true)];
  assert.deepEqual(with_.record, without.record);
  assert.deepEqual(with_.stored, without.stored);
  assert.deepEqual(with_.applied, without.applied);
  assert.deepEqual(with_.profile, without.profile);
  assert.equal(without.facts.length, 0);
  assert.equal(with_.facts.length, 4);
  assert.equal(JSON.stringify(with_.stored).includes("segments"), false, "a single-segment memo carries no segment fields");
});

test("a manual fact survives later extractions; it merges on text and refuses empty or over-long text", async () => {
  const w = world();
  const manual = await addManualContactFact(w.facts, { actorId: ACTOR, at: "2026-10-01T00:00:00.000Z", contactId: CONTACT, text: "  京都出身、週末は登山  " });
  assert.equal(manual.field, "manual");
  assert.equal(manual.text, "京都出身、週末は登山");
  assert.equal(manual.memoId, null);
  const again = await addManualContactFact(w.facts, { actorId: ACTOR, at: "2026-10-05T00:00:00.000Z", contactId: CONTACT, text: "京都出身、週末は 登山" });
  assert.equal(again.id, manual.id, "same text (whitespace ignored) is the same row");
  assert.equal(again.firstSeenAt, "2026-10-01T00:00:00.000Z");
  assert.equal(again.lastSeenAt, "2026-10-05T00:00:00.000Z");
  await runMemoExtraction(job("note:after", "出海の話。"), w.deps(createMockMemoExtractionProvider({ eventTypes: [], offering: ["出海"], seeking: [], topics: [] })));
  const facts = await w.facts.list({ actorId: ACTOR, contactId: CONTACT });
  assert.deepEqual(facts.map((fact) => [fact.field, fact.text]), [["manual", "京都出身、週末は登山"], ["offering", "出海"]]);
  await assert.rejects(addManualContactFact(w.facts, { actorId: ACTOR, at: AT, contactId: CONTACT, text: "   " }), (error: unknown) => error instanceof ContactFactError && error.code === "EMPTY_TEXT");
  await assert.rejects(addManualContactFact(w.facts, { actorId: ACTOR, at: AT, contactId: CONTACT, text: "あ".repeat(81) }), (error: unknown) => error instanceof ContactFactError && error.code === "TEXT_TOO_LONG");
  // 他人读不到。
  assert.deepEqual(await w.facts.list({ actorId: "b", contactId: CONTACT }), []);
});

test("when one segment fails, the other segments' facts are stored and the job reports the failed segment", async () => {
  const w = world();
  const provider = keywordProvider([
    { when: "東京", output: { topics: ["東京のイベント"] } },
    { when: "大阪", output: { seeking: ["大阪の販路"] } },
    { when: "出海", output: { offering: ["SaaS 出海経験"] } },
  ], (input) => input.memo.includes("大阪"));
  const long = `${sentence("東京のイベントで会った。", 100)}\n\n${sentence("大阪の販路を探している。", 100)}\n\n${sentence("出海の話もした。", 100)}`;
  const segments = segmentMemo(long);
  const failing = segments.findIndex((segment) => segment.includes("大阪"));
  const record = await runMemoExtraction(job("note:partial", long), w.deps(provider));
  assert.equal(record.status, "failed");
  assert.equal(record.error, "SEGMENT_FAILED");
  assert.deepEqual(record.segments, { done: segments.map((_, index) => index).filter((index) => index !== failing), failed: [failing], total: segments.length });
  assert.equal(provider.calls.length, segments.length);
  const facts = (await w.facts.list({ actorId: ACTOR, contactId: CONTACT })).map((fact) => fact.text).sort();
  assert.deepEqual(facts, ["SaaS 出海経験", "東京のイベント"], "facts of the successful segments are stored");
  assert.deepEqual(await w.profile(), { offering: ["SaaS 出海経験"], topics: ["東京のイベント"] });
  assert.equal(w.gateLog.filter((entry) => entry === `finish:op:${record.key}#${failing}:failed`).length, 1);
  // 终态：重跑不再调用 provider。
  await runMemoExtraction(job("note:partial", long), w.deps(provider));
  assert.equal(provider.calls.length, segments.length);
});

test("a daily limit on a later segment defers the job and a rerun only extracts the remaining segments", async () => {
  const w = world();
  const provider = keywordProvider([{ when: "東京", output: { topics: ["東京のイベント"] } }, { when: "大阪", output: { seeking: ["大阪の販路"] } }]);
  const long = `${sentence("東京のイベントで会った。", 100)}\n\n${sentence("大阪の販路を探している。", 100)}`;
  const segments = segmentMemo(long);
  assert.equal(segments.length, 2);
  let limited = true;
  const gate: AiQuotaGate = {
    ...w.gate,
    async reserve(input) {
      if (limited && input.idempotencyKey.endsWith("#1")) return { ok: false, reason: "daily_limit", retryOn: "2026-10-02T15:00:00.000Z" };
      return w.gate.reserve(input);
    },
  };
  const first = await runMemoExtraction(job("note:limit", long), { ...w.deps(provider), gate });
  assert.equal(first.status, "deferred");
  assert.equal(first.retryOn, "2026-10-02T15:00:00.000Z");
  assert.deepEqual(first.segments, { done: [0], failed: [], total: 2 });
  assert.equal(provider.calls.length, 1);
  assert.deepEqual((await w.facts.list({ actorId: ACTOR, contactId: CONTACT })).map((fact) => fact.text), ["東京のイベント"]);
  limited = false;
  const second = await runMemoExtraction(job("note:limit", long), { ...w.deps(provider), gate, now: () => new Date("2026-10-02T16:00:00.000Z") });
  assert.equal(second.status, "succeeded");
  assert.deepEqual(second.segments, { done: [0, 1], failed: [], total: 2 });
  assert.equal(provider.calls.length, 2, "only the remaining segment is extracted");
  assert.deepEqual(second.output, { eventTypes: [], offering: [], seeking: ["大阪の販路"], topics: ["東京のイベント"] });
});

test("segmentMemo cuts on paragraph and sentence boundaries, never inside a sentence, and the parts rejoin to the original", () => {
  const short = "短い。";
  assert.deepEqual(segmentMemo(short), [short]);
  const sentences = Array.from({ length: 300 }, (_, index) => `第${index + 1}文はここで終わる。`);
  const body = `${sentences.slice(0, 100).join("")}\n\n${sentences.slice(100, 200).join("")}\n${sentences.slice(200).join("")}`;
  const parts = segmentMemo(body);
  assert.ok(parts.length >= 2);
  assert.equal(parts.join(""), body);
  for (const part of parts) {
    assert.ok(Array.from(part).length <= MEMO_EXTRACTION_LIMITS.memoChars);
    assert.match(part.trimEnd(), /[。\n]$/u, "every part ends at a sentence or paragraph boundary");
  }
  // 只有一句话且超长：硬切，仍拼得回原文。
  const giant = "あ".repeat(4500);
  const hard = segmentMemo(giant);
  assert.deepEqual(hard.map((part) => part.length), [2000, 2000, 500]);
  assert.equal(hard.join(""), giant);
  // 英文句号也算句子边界。
  const english = `${"This is a sentence. ".repeat(150)}`.trimEnd();
  const en = segmentMemo(english);
  assert.equal(en.join(""), english);
  assert.ok(en.every((part) => /\.$/u.test(part.trimEnd())));
});

test("mergeSegmentOutputs unions the lists in order, caps them at itemsPerField and merges question coverage", () => {
  const merged = mergeSegmentOutputs([
    { eventTypes: ["met"], offering: ["a", "b"], seeking: [], topics: ["t1"], questionCoverage: [{ answered: [0], itemId: "T1" }] },
    { eventTypes: ["met", "followed_up"], offering: ["b", "c", "d", "e", "f", "g"], seeking: ["s"], topics: ["t1"], questionCoverage: [{ answered: [2], itemId: "T1" }, { answered: [], itemId: "T2" }] },
  ]);
  assert.deepEqual(merged, { eventTypes: ["met", "followed_up"], offering: ["a", "b", "c", "d", "e"], questionCoverage: [{ answered: [0, 2], itemId: "T1" }, { answered: [], itemId: "T2" }], seeking: ["s"], topics: ["t1"] });
  assert.deepEqual(factsFromExtraction({ eventTypes: [], offering: [" 同じ ", "同じ"], seeking: [], topics: ["x".repeat(50)] }).map((fact) => fact.text), ["同じ", "x".repeat(40)]);
});
