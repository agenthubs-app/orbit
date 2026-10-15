/**
 * R27 SC-R27-10 E3：会後まとめ 3 条 + 逐人的次の一手。别名进（联系人 / 证据 id 不出境）、schema 校验 + 修复 1 次、
 * 类型建议越出字典被丢弃、别名换回、修复后仍不过 → 失败不重试；v2 旧任务照旧；账本记 event_post_summary（只记账）。
 */
import assert from "node:assert/strict";
import test from "node:test";

import { ATTENDEE_POST_EVENT_AI_PROMPT_VERSION } from "../../features/events/post-event-artifact/provider-config";
import { createLiveRecordAttendeePostEventAiArtifactReader } from "../../features/events/post-event-artifact/live-record-reader";
import { processAttendeePostEventAiTask } from "../../features/events/post-event-artifact/processor";
import { createAttendeePostEventAiTaskRepository } from "../../features/events/post-event-artifact/task-repository";
import { e3UserText, parseE3, type AttendeePostEventAiContext } from "../../features/events/post-event-artifact/e3";
import { createLedgeredRunner } from "../../features/events/journey/ledgered-runner";
import type { AiQuotaGate } from "../../features/ai-quota/gate";
import { createMemoryLiveRecordStore } from "../../shared/storage/live-record-store";

const context: AttendeePostEventAiContext = {
  eventDate: "2026-10-07",
  eventTitle: "CFO Night Tokyo vol.18",
  language: "ja",
  people: [{ contactId: "contact:shimizu", name: "清水 玲奈", org: "Sorae Capital" }, { contactId: "contact:inoue", name: "井上 早紀" }],
  planTypes: [{ key: "vc_partner", label: "VC パートナー" }, { key: "cfo_experienced", label: "CFO 経験者" }],
};
const evidence = [
  { commitments: ["11月にオフィス訪問"], contactId: "contact:shimizu", evidenceId: "evidence:human-encounter:1", nextStep: "候補日を送る", noteText: "B2B SaaS に注力", observedAt: "2026-10-07T21:04:00+09:00", talked: "yes" as const },
  { commitments: [], contactId: "contact:inoue", evidenceId: "evidence:human-encounter:2", nextStep: "", noteText: "優先株の条件は 2社以上で比較を", observedAt: "2026-10-07T20:31:00+09:00", talked: "yes" as const },
];
const good = {
  highlights: [{ detail: "清水さんは B2B SaaS に注力。11月にオフィス訪問の約束", emoji: "💼", evidence: "交換記録 21:04 · メモ「11月にオフィスへ」", title: "VC との接点が増えました" }],
  messageDraft: "清水様 昨夜はありがとうございました。",
  nextSteps: [
    { followupDate: "2026-10-09", person: "p1", planType: "t1", thanksBody: "清水様\n\n昨夜はありがとうございました。", thanksSubject: "昨夜の CFO Night のお礼" },
    { followupDate: "2026-10-12", person: "p2", planType: "t9", thanksBody: "井上様\n\nありがとうございました。", thanksSubject: "お礼" },
  ],
  summary: "VC 2名と資本政策の具体的な助言。",
};

test("E3 input uses aliases only: no contact / evidence ids leave the server", () => {
  const aliased = e3UserText({ attendeeDisplayName: "佐藤 健一", evidenceSnapshot: evidence }, context);
  assert.doesNotMatch(aliased.userText, /contact:|evidence:human-encounter/);
  const body = JSON.parse(aliased.userText);
  assert.deepEqual(body.people.map((person: { ref: string }) => person.ref), ["p1", "p2"]);
  assert.deepEqual(body.planTypes.map((type: { ref: string }) => type.ref), ["t1", "t2"]);
  assert.equal(body.evidence[0].person, "p1");
});

test("E3 parse: maps refs back, drops a type outside the plan dictionary, rejects unknown people / early dates", () => {
  const aliased = e3UserText({ evidenceSnapshot: evidence }, context);
  const parsed = parseE3(JSON.stringify(good), aliased, context);
  assert.equal(parsed.ok, true);
  if (parsed.ok !== true) return;
  assert.deepEqual(parsed.value.nextSteps.map((step) => [step.attendeeId, step.planTypeSuggestion]), [["contact:shimizu", "vc_partner"], ["contact:inoue", null]]);
  assert.equal(parseE3(JSON.stringify({ ...good, nextSteps: [{ ...good.nextSteps[0], person: "p7" }] }), aliased, context).ok, false);
  assert.equal(parseE3(JSON.stringify({ ...good, nextSteps: [{ ...good.nextSteps[0], followupDate: "2026-10-06" }] }), aliased, context).ok, false);
  assert.equal(parseE3(JSON.stringify({ ...good, highlights: [] }), aliased, context).ok, false);
  assert.equal(parseE3("not json", aliased, context).ok, false);
});

async function queued(withContext: boolean) {
  const store = createMemoryLiveRecordStore<Record<string, unknown>>();
  const repository = createAttendeePostEventAiTaskRepository({ store, workspaceId: "workspace:test" });
  await repository.request({ attendeeActorId: "actor:a", attendeeDisplayName: "佐藤 健一", ...(withContext ? { context } : {}), eventId: "event:1", evidenceSnapshot: evidence, evidenceWhitelist: evidence.map((item) => item.evidenceId), model: "deepseek-chat", promptVersion: ATTENDEE_POST_EVENT_AI_PROMPT_VERSION, provider: "deepseek", requestedAt: "2026-10-07T13:00:00.000Z" });
  return { reader: createLiveRecordAttendeePostEventAiArtifactReader({ store, workspaceId: "workspace:test" }), repository };
}

function ledger() {
  const calls: string[] = [];
  const gate: AiQuotaGate = {
    beginCall: async () => { calls.push("begin"); return { callId: `c${calls.length}` }; },
    endCall: async () => { calls.push("end"); },
    finish: async (_op, outcome) => { calls.push(`finish:${outcome}`); },
    reserve: async (input) => { calls.push(`reserve:${input.purpose}:${input.pool}`); return { ok: true, operationId: "op", owner: true, status: "reserved" } as never; },
  };
  return { calls, gate };
}

test("E3 worker: invalid first answer → one repair → ready artifact with highlights / next steps; ledger records both calls", async () => {
  const { reader, repository } = await queued(true);
  const { calls, gate } = ledger();
  const systems: string[] = [];
  const answers = ["{\"summary\": \"\"}", JSON.stringify(good)];
  const outcome = await processAttendeePostEventAiTask({
    config: { apiKey: "test", provider: "deepseek" },
    ledger: gate,
    now: () => "2026-10-07T13:01:00.000Z",
    repository,
    runModelText: async (input) => { systems.push(input.systemInstruction); return { model: "deepseek-chat", provider: "deepseek", source: "env", success: true, text: answers.shift()! } as never; },
    workerId: "w",
  });
  assert.equal(outcome, "ready");
  assert.equal(systems.length, 2);
  assert.match(systems[1]!, /previous answer was rejected/);
  const view = await reader.read({ attendeeActorId: "actor:a", eventId: "event:1" });
  assert.equal(view.artifact?.promptVersion, 3);
  assert.equal(view.artifact?.highlights?.length, 1);
  assert.deepEqual(view.artifact?.nextSteps?.map((step) => step.attendeeId), ["contact:shimizu", "contact:inoue"]);
  assert.deepEqual(calls, ["reserve:event_post_summary:system", "begin", "end", "begin", "end", "finish:succeeded"]);
});

test("E3 worker: still invalid after the repair → failed without retry (UI falls back to rules)", async () => {
  const { reader, repository } = await queued(true);
  let count = 0;
  const outcome = await processAttendeePostEventAiTask({ config: { apiKey: "t", provider: "deepseek" }, now: () => "2026-10-07T13:01:00.000Z", repository, runModelText: async () => { count += 1; return { model: "m", provider: "deepseek", source: "env", success: true, text: "{}" } as never; }, workerId: "w" });
  assert.equal(outcome, "failed");
  assert.equal(count, 2, "generation + one repair");
  assert.equal((await reader.read({ attendeeActorId: "actor:a", eventId: "event:1" })).status, "failed");
});

test("v3 task without context (names unreadable) keeps the v2 single-summary behaviour", async () => {
  const { reader, repository } = await queued(false);
  const outcome = await processAttendeePostEventAiTask({ config: { apiKey: "t", provider: "deepseek" }, now: () => "2026-10-07T13:01:00.000Z", repository, runModelText: async () => ({ model: "m", provider: "deepseek", source: "env", success: true, text: JSON.stringify({ messageDraft: null, summary: "まとめ" }) }) as never, workerId: "w" });
  assert.equal(outcome, "ready");
  const view = await reader.read({ attendeeActorId: "actor:a", eventId: "event:1" });
  assert.equal(view.artifact?.summary, "まとめ");
  assert.equal(view.artifact?.highlights, undefined);
});

test("ledgered runner: an unavailable ledger never blocks the call (record only)", async () => {
  const runner = createLedgeredRunner({ actorId: "a", gate: { ...ledger().gate, reserve: async () => { throw new Error("check violation"); } }, idempotencyKey: "k", purpose: "event_post_summary", runner: async () => ({ model: "m", provider: "deepseek", source: "env", success: true, text: "ok" }) as never });
  const result = await runner.run({ systemInstruction: "s", userText: "u" });
  assert.equal(result.success, true);
  assert.equal(runner.calls(), 1);
});
