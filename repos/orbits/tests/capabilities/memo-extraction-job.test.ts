/**
 * W0046 SC-W0046-04：memo 提取管线（门默认关闭）。
 *
 * - 「始终拒绝」闸门：作业记 disabled、provider 0 次调用、联系人行 0 次写；
 * - daily_limit：记 deferred 到 retryOn、0 次调用；一条 memo 只 reserve 1 次操作，每次 HTTP 各有 beginCall／endCall；
 * - 按 (noteId, 正文哈希) 幂等，先落 started 再调用，重试不再调用；
 * - 写回只过 canWriteEnrichedValue（空栏／ai 可写，user／card／存量无来源值不覆盖），来源记 ai／memo_extraction；
 * - DeepSeek 适配器：json_object、thinking disabled、超时；只发 memo 正文与对方公司／职位。
 */
import assert from "node:assert/strict";
import test from "node:test";

import { createAlwaysDenyAiQuotaGate, type AiQuotaGate } from "../../features/ai-quota/gate";
import { memoExtractionKey, runMemoExtraction } from "../../features/contacts/memo-extraction/job";
import {
  createDeepseekMemoExtractionProvider,
  createMockMemoExtractionProvider,
  MemoExtractionError,
  type MemoExtractionProvider,
} from "../../features/contacts/memo-extraction/provider";
import { createLiveRecordMemoExtractionStore } from "../../features/contacts/memo-extraction/store";
import { createStorageContactGraphProvider } from "../../features/contacts/storage/contact-live-record-provider";
import { createMemoryLiveRecordStore, type LiveRecord } from "../../shared/storage/live-record-store";

const NOW = new Date("2026-10-02T03:00:00.000Z");
const JOB = { actorId: "a", contactId: "own", noteId: "note:live-contact-detail-update:m1", body: "她在找 B 轮投资人，可以提供 SaaS 出海经验", contact: { organization: "Nexa", role: "CEO" } };
const OUTPUT = { offering: ["SaaS 出海经验"], seeking: ["B 轮投资人"], topics: ["融资"], eventTypes: ["met" as const] };

function memoryStore() {
  const live = createMemoryLiveRecordStore();
  const store = createLiveRecordMemoExtractionStore({ store: live, workspaceId: "w" });
  const count = async () => (await live.listRecords({ limit: 10, workspaceId: "w", collectionName: "memo_extractions" })).length;
  return { ...store, live, count, status: async (key: string) => (await store.get({ actorId: "a", key }))?.status };
}

function countingGate(reply: Awaited<ReturnType<AiQuotaGate["reserve"]>>) {
  const log: string[] = [];
  const gate: AiQuotaGate = {
    async reserve(input) { log.push(`reserve:${input.pool}:${input.purpose}:${input.trigger}:${input.idempotencyKey}`); return reply; },
    async beginCall(operationId, call) { log.push(`begin:${operationId}:${call.provider}`); return { callId: "call-1" }; },
    async endCall(callId, usage) { log.push(`end:${callId}:${usage ? `${usage.inputTokens}/${usage.outputTokens}` : "none"}`); },
    async finish(operationId, outcome) { log.push(`finish:${operationId}:${outcome}`); },
  };
  return { gate, log };
}

test("始终拒绝的闸门：记 disabled、provider 0 次、联系人行 0 次写；重跑仍 0 次调用", async () => {
  const store = memoryStore();
  const provider = createMockMemoExtractionProvider(OUTPUT);
  let writes = 0;
  const deps = { gate: createAlwaysDenyAiQuotaGate(), provider, store, applyValues: async () => { writes += 1; return []; }, now: () => NOW };
  const first = await runMemoExtraction(JOB, deps);
  assert.equal(first.status, "disabled");
  assert.equal(first.key, memoExtractionKey(JOB.noteId, JOB.body));
  assert.match(first.key, /^memo:note:live-contact-detail-update:m1:[0-9a-f]{24}$/);
  const second = await runMemoExtraction(JOB, deps);
  assert.equal(second.status, "disabled");
  assert.equal(provider.calls.length, 0);
  assert.equal(writes, 0);
  assert.equal(await store.count(), 1);
});

test("daily_limit：记 deferred 到 retryOn、0 次调用；retryOn 之前重跑不再 reserve", async () => {
  const store = memoryStore();
  const provider = createMockMemoExtractionProvider(OUTPUT);
  const { gate, log } = countingGate({ ok: false, reason: "daily_limit", retryOn: "2026-10-03T00:00:00.000+09:00" });
  const record = await runMemoExtraction(JOB, { gate, provider, store, applyValues: async () => [], now: () => NOW });
  assert.equal(record.status, "deferred");
  assert.equal(record.retryOn, "2026-10-03T00:00:00.000+09:00");
  await runMemoExtraction(JOB, { gate, provider, store, applyValues: async () => [], now: () => NOW });
  assert.equal(provider.calls.length, 0);
  assert.deepEqual(log, [`reserve:background:memo_extraction:auto:${record.key}`]);
});

test("放行时：先落 started 再调用；一次 reserve、一组 beginCall／endCall、一次 finish；重试不再调用", async () => {
  const store = memoryStore();
  const { gate, log } = countingGate({ ok: true, operationId: "op-1", owner: true, status: "reserved" });
  const mock = createMockMemoExtractionProvider(OUTPUT);
  let statusAtCall: string | undefined;
  const provider: MemoExtractionProvider = {
    ...mock,
    async extract(input) {
      statusAtCall = await store.status(memoExtractionKey(JOB.noteId, JOB.body));
      const result = await mock.extract(input);
      return { ...result, usage: { inputTokens: 120, outputTokens: 30, latencyMs: 5 } };
    },
  };
  const applied: unknown[] = [];
  const record = await runMemoExtraction(JOB, { gate, provider, store, applyValues: async (input) => { applied.push(input); return ["offering", "seeking", "topics"]; }, now: () => NOW });
  assert.equal(statusAtCall, "started");
  assert.equal(record.status, "succeeded");
  assert.deepEqual(record.writtenFields, ["offering", "seeking", "topics"]);
  assert.deepEqual(record.output?.eventTypes, ["met"]);
  assert.deepEqual(log.map((entry) => entry.split(":")[0]), ["reserve", "begin", "end", "finish"]);
  assert.equal(log[2], "end:call-1:120/30");
  assert.equal(log[3], "finish:op-1:succeeded");
  assert.equal(mock.calls.length, 1);
  assert.deepEqual(mock.calls[0], { memo: JOB.body, contact: JOB.contact });
  assert.equal(applied.length, 1);
  const again = await runMemoExtraction(JOB, { gate, provider, store, applyValues: async () => [], now: () => NOW });
  assert.equal(again.status, "succeeded");
  assert.equal(mock.calls.length, 1);
  assert.equal(log.length, 4);
  // 正文变了是另一条提取。
  assert.notEqual(memoExtractionKey(JOB.noteId, `${JOB.body}！`), record.key);
});

test("provider 失败：记 failed，有响应的用量照记，finish failed；重试不再调用", async () => {
  const store = memoryStore();
  const { gate, log } = countingGate({ ok: true, operationId: "op-2", owner: true, status: "reserved" });
  let calls = 0;
  const provider: MemoExtractionProvider = {
    model: "m", providerName: "p",
    async extract() { calls += 1; throw new MemoExtractionError("INVALID_OUTPUT", "bad", { inputTokens: 50, outputTokens: 2, latencyMs: 1 }); },
  };
  const record = await runMemoExtraction(JOB, { gate, provider, store, applyValues: async () => [], now: () => NOW });
  assert.equal(record.status, "failed");
  assert.equal(record.error, "INVALID_OUTPUT");
  assert.deepEqual(log.slice(2), ["end:call-1:50/2", "finish:op-2:failed"]);
  await runMemoExtraction(JOB, { gate, provider, store, applyValues: async () => [], now: () => NOW });
  assert.equal(calls, 1);
});

test("写回只过 canWriteEnrichedValue：空栏与 ai 值可写，user／card／存量无来源值不覆盖", async () => {
  const AT = "2026-09-25T00:00:00.000Z";
  const base = { workspaceId: "w", sourceType: "manual", sourceId: "f", evidenceIds: ["e"], lifecycleState: "active" as const, createdAt: AT, updatedAt: AT, userId: "a", collectionName: "contacts" };
  const common = { source: { type: "manual", id: "f" }, evidenceIds: ["e"], createdAt: AT, updatedAt: AT, stage: "active", accountId: "a" };
  const prov = (origin: string, via = "card_ocr") => ({ origin, updatedAt: AT, via });
  const store = createMemoryLiveRecordStore([
    { ...base, recordId: "empty", payload: { ...common, id: "empty", displayName: "E" } },
    { ...base, recordId: "ai", payload: { ...common, id: "ai", displayName: "A", publicProfile: { offering: ["旧推断"] }, enrichment: { version: 1, fields: { offering: prov("ai", "memo_extraction") } } } },
    { ...base, recordId: "user", payload: { ...common, id: "user", displayName: "U", publicProfile: { offering: ["手填"] }, enrichment: { version: 1, fields: { offering: prov("user", "contact_edit") } } } },
    { ...base, recordId: "card", payload: { ...common, id: "card", displayName: "C", publicProfile: { offering: ["名片"] }, enrichment: { version: 1, fields: { offering: prov("card") } } } },
    { ...base, recordId: "legacy", payload: { ...common, id: "legacy", displayName: "L", publicProfile: { offering: ["存量"] } } },
    { ...base, recordId: "foreign", userId: "b", payload: { ...common, accountId: "b", id: "foreign", displayName: "F" } },
  ] as LiveRecord[]);
  const provider = createStorageContactGraphProvider({ store, workspaceId: "w" });
  const values = [{ field: "offering" as const, value: ["新提取"], origin: "ai" as const, via: "memo_extraction" as const }];
  const at = "2026-10-02T03:00:00.000Z";
  const read = async (id: string) => (await store.getRecord({ workspaceId: "w", collectionName: "contacts", recordId: id }))!.payload as Record<string, any>;

  assert.deepEqual(await provider.applyContactMemoExtraction!("empty", "a", values, at), ["offering"]);
  assert.deepEqual((await read("empty")).publicProfile.offering, ["新提取"]);
  assert.deepEqual((await read("empty")).enrichment.fields.offering, { origin: "ai", updatedAt: at, via: "memo_extraction" });
  assert.deepEqual(await provider.applyContactMemoExtraction!("ai", "a", values, at), ["offering"]);
  assert.deepEqual((await read("ai")).publicProfile.offering, ["新提取"]);
  for (const [id, kept] of [["user", "手填"], ["card", "名片"], ["legacy", "存量"]] as const) {
    const before = (await read(id)).updatedAt;
    assert.deepEqual(await provider.applyContactMemoExtraction!(id, "a", values, at), [], id);
    assert.deepEqual((await read(id)).publicProfile.offering, [kept]);
    assert.equal((await read(id)).updatedAt, before, `${id} must not be written`);
  }
  // 越权与非 ai 来源拒绝。
  await assert.rejects(() => Promise.resolve(provider.applyContactMemoExtraction!("foreign", "a", values, at)));
  assert.deepEqual(await provider.applyContactMemoExtraction!("empty", "a", [{ ...values[0], field: "seeking", origin: "user" }] as never, at), []);
});

test("memo_extractions 存储：按本人与键读写，他人记录读不到", async () => {
  const live = createMemoryLiveRecordStore();
  const store = createLiveRecordMemoExtractionStore({ store: live, workspaceId: "w" });
  const record = await runMemoExtraction(JOB, { gate: createAlwaysDenyAiQuotaGate(), provider: null, store, applyValues: async () => [], now: () => NOW });
  assert.equal((await store.get({ actorId: "a", key: record.key }))?.status, "disabled");
  assert.equal(await store.get({ actorId: "b", key: record.key }), null);
  const rows = await live.listRecords({ limit: 10, workspaceId: "w", collectionName: "memo_extractions" });
  assert.equal(rows.length, 1);
  assert.equal(rows[0].userId, "a");
});

test("DeepSeek 适配器：json_object、thinking disabled；只发 memo 正文与公司／职位；超时报 PROVIDER_TIMEOUT", async () => {
  const requests: { url: string; body: Record<string, any>; headers: Record<string, string> }[] = [];
  const provider = createDeepseekMemoExtractionProvider({
    apiKey: "test-key",
    model: "deepseek-test",
    fetchImplementation: (async (url: string, init: RequestInit) => {
      requests.push({ url, body: JSON.parse(String(init.body)), headers: init.headers as Record<string, string> });
      return new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify({ offering: ["A", "A", 3], seeking: ["B"], topics: [], eventTypes: ["met", "bogus"] }) } }], usage: { prompt_tokens: 11, completion_tokens: 7 } }), { status: 200 });
    }) as typeof fetch,
  });
  const result = await provider.extract({ memo: " 聊了融资 ", contact: { organization: "Nexa", role: "CEO", email: "x@y.z", phone: "090" } as never });
  assert.deepEqual(result.output, { offering: ["A"], seeking: ["B"], topics: [], eventTypes: ["met"] });
  assert.deepEqual(result.usage.inputTokens, 11);
  const body = requests[0].body;
  assert.equal(requests[0].url, "https://api.deepseek.com/chat/completions");
  assert.deepEqual(body.response_format, { type: "json_object" });
  assert.deepEqual(body.thinking, { type: "disabled" });
  assert.equal(body.model, "deepseek-test");
  assert.deepEqual(JSON.parse(body.messages[1].content), { memo: "聊了融资", company: "Nexa", title: "CEO" });
  assert.doesNotMatch(JSON.stringify(body), /x@y\.z|090/);

  const slow = createDeepseekMemoExtractionProvider({
    apiKey: "k",
    timeoutMs: 10,
    fetchImplementation: ((_url: string, init: RequestInit) => new Promise((_resolve, reject) => {
      init.signal?.addEventListener("abort", () => reject(new Error("aborted")));
    })) as typeof fetch,
  });
  await assert.rejects(() => slow.extract({ memo: "x", contact: {} }), (error: unknown) => error instanceof MemoExtractionError && error.code === "PROVIDER_TIMEOUT");
});

test("并发：同一 memo 的两个作业同时跑，只有认领胜者 reserve／调用 provider／finish 各一次", async () => {
  const store = memoryStore();
  const { gate, log } = countingGate({ ok: true, operationId: "op-c", owner: true, status: "reserved" });
  const provider = createMockMemoExtractionProvider(OUTPUT);
  const deps = { gate, provider, store, applyValues: async () => ["offering"] as const, now: () => NOW };
  const [left, right] = await Promise.all([runMemoExtraction(JOB, deps), runMemoExtraction(JOB, deps)]);
  assert.equal(log.filter((entry) => entry.startsWith("reserve")).length, 1);
  assert.equal(log.filter((entry) => entry.startsWith("finish")).length, 1);
  assert.equal(provider.calls.length, 1);
  assert.ok([left.status, right.status].includes("succeeded"));
  assert.equal(await store.status(memoExtractionKey(JOB.noteId, JOB.body)), "succeeded");
  // 闸门关闭时并发也只有一次 reserve。
  const closed = memoryStore();
  const deny = countingGate({ ok: false, reason: "disabled" });
  await Promise.all([1, 2, 3].map(() => runMemoExtraction(JOB, { ...deps, gate: deny.gate, store: closed })));
  assert.ok(deny.log.length >= 1 && deny.log.length <= 3);
  assert.equal(await closed.count(), 1);
  assert.equal(provider.calls.length, 1);
});

test("beginCall 失败：HTTP 未发出 → finish 释放、转为可重试；之后重跑才调用 provider，且只一次", async () => {
  const store = memoryStore();
  const provider = createMockMemoExtractionProvider(OUTPUT);
  const log: string[] = [];
  let failBegin = true;
  const gate: AiQuotaGate = {
    async reserve() { log.push("reserve"); return { ok: true, operationId: `op-${log.length}`, owner: true, status: "reserved" }; },
    async beginCall() { log.push("begin"); if (failBegin) throw new Error("ledger down"); return { callId: "call-x" }; },
    async endCall() { log.push("end"); },
    async finish(_id, outcome) { log.push(`finish:${outcome}`); },
  };
  let clock = NOW.getTime();
  const deps = { gate, provider, store, applyValues: async () => [] as const, now: () => new Date(clock) };
  const first = await runMemoExtraction(JOB, deps);
  assert.equal(first.status, "deferred");
  assert.match(first.error ?? "", /^BEGIN_CALL_FAILED/);
  assert.equal(provider.calls.length, 0);
  assert.deepEqual(log, ["reserve", "begin", "finish:failed"]);
  failBegin = false;
  clock += 1000;
  const second = await runMemoExtraction(JOB, deps);
  assert.equal(second.status, "succeeded");
  assert.equal(provider.calls.length, 1);
  clock += 1000;
  await runMemoExtraction(JOB, deps);
  assert.equal(provider.calls.length, 1);
});
