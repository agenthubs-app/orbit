/**
 * R27 live 端口的纯映射（`features/events/journey/live-mapping.ts`）：替身数据，不连库。
 * 守：主办方 actor id 不外传、公开参加者只认 event_attendees、判定数字原样、会後输入与确定的去重键、通知写入形状。
 */
import assert from "node:assert/strict";
import test from "node:test";

import { inboxNotificationWriteSchema } from "../../shared/api-schema/inbox-notifications";
import { emptyJudgeContext, judgeEvent, type JudgeContext } from "../../features/events/assessment/judge";
import type { EventOperationsAttendeeWorkspace } from "../../features/events/event-operations/service";
import type { EventRegistration } from "../../features/events/registration/contract";
import type { EventProfileResponseSnapshot } from "../../features/events/registration/interview-response-contract";
import { createJourneyLivePorts } from "../../features/events/journey/live";
import {
  afterConfirmationIds,
  afterDraftFrom,
  afterMetFrom,
  afterPlanFrom,
  contactHistoryFrom,
  followupDueAt,
  followupTaskTitle,
  inboxUpsertFor,
  journeyEventFromCanonical,
  judgeEntryFrom,
  linkedTypeByContactFrom,
  organizerHistory,
  organizerKeyFor,
  organizerNameFrom,
  payloadSpeakerNames,
  publicAttendeesFromRegistrations,
  reasonFromCandidate,
  venueWorkspaceFrom,
  type PlanTypeLite,
} from "../../features/events/journey/live-mapping";
import { buildAfter } from "../../features/events/journey/after-core";
import { inboxNotificationId } from "../../features/notifications/inbox-record-service";

const ORGANIZER = "actor:organizer-secret-42";

test("organizerKeyFor：单向、稳定、不含 actor id；空 → null", () => {
  const key = organizerKeyFor(ORGANIZER)!;
  assert.match(key, /^org_[0-9a-f]{16}$/);
  assert.equal(organizerKeyFor(` ${ORGANIZER} `), key);
  assert.notEqual(organizerKeyFor("actor:other"), key);
  assert.ok(!key.includes("organizer-secret"));
  assert.equal(organizerKeyFor(""), null);
  assert.equal(organizerKeyFor(null), null);
});

test("journeyEventFromCanonical：费用 / 议程 / 定员 / 审核 / 截止 / 主办名；输出里没有主办 actor id", () => {
  const event = {
    description: " CFO が集まる夜 ",
    endsAt: "2026-10-16T12:00:00.000Z",
    eventId: "evt-1",
    organizerActorId: ORGANIZER,
    publicCode: "CFO18",
    sourcePayload: { agenda: [{ at: "19:00", title: "キーノート" }, { title: "no time" }], capacity: 80, emoji: "🌃", feeYen: 3000, organizerName: "CFO Night 実行委員会" },
    startsAt: "2026-10-16T10:00:00.000Z",
    title: "CFO Night Tokyo vol.18",
    venue: "渋谷",
  };
  const withPolicy = journeyEventFromCanonical(event, { policy: { admissionMode: "approval_required", capacity: 60, registrationClosesAt: "2026-10-15T15:00:00.000Z" }, registrationCount: 42 });
  assert.equal(withPolicy.priceYen, 3000);
  assert.deepEqual(withPolicy.agenda, [{ at: "19:00", title: "キーノート" }]);
  assert.equal(withPolicy.capacity, 60);
  assert.equal(withPolicy.review, true);
  assert.equal(withPolicy.registrationClosesAt, "2026-10-15T15:00:00.000Z");
  assert.equal(withPolicy.organizerName, "CFO Night 実行委員会");
  assert.equal(withPolicy.organizerKey, organizerKeyFor(ORGANIZER));
  assert.equal(withPolicy.emoji, "🌃");
  assert.equal(withPolicy.description, "CFO が集まる夜");
  assert.equal(withPolicy.registrationCount, 42);
  assert.deepEqual(withPolicy.badges, []);
  assert.ok(!JSON.stringify(withPolicy).includes("organizer-secret"));

  const bare = journeyEventFromCanonical({ ...event, sourcePayload: {} }, { policy: null, registrationCount: 0 });
  assert.equal(bare.capacity, null);
  assert.equal(bare.review, false);
  assert.equal(bare.priceYen, null);
  assert.match(bare.organizerName!, /^Organizer #/);
  assert.ok(!JSON.stringify(bare).includes("organizer-secret"));
  assert.equal(organizerNameFrom({ organizer: "Orbit" }, ORGANIZER), "Orbit");
  assert.deepEqual(payloadSpeakerNames({ speakers: ["伊藤 直子", { name: "森 拓也" }, 3, { title: "x" }] }), ["伊藤 直子", "森 拓也"]);
});

function response(field: EventProfileResponseSnapshot["field"], displayText: string, visibility: EventProfileResponseSnapshot["visibility"]): EventProfileResponseSnapshot {
  return { answer: { customText: null, displayText, selectedOptionIds: [] }, answerSource: "participant", answeredAt: "2026-10-01T00:00:00.000Z", field, generation: null, question: null, questionId: null, questionSource: "legacy_unknown", responseId: `${field}-${displayText}`, visibility };
}

function registration(id: string, name: string, responses: EventProfileResponseSnapshot[] | undefined, status: EventRegistration["status"] = "rsvped"): EventRegistration {
  return {
    cancelledAt: null,
    eventId: "evt-1",
    id: `reg-${id}`,
    participantProfile: { answers: { positioning: "secret role @ Secret Co" }, createdAt: "2026-10-01T00:00:00.000Z", displayName: name, eventId: "evt-1", id: `pp-${id}`, interviewResponses: responses, updatedAt: "2026-10-01T00:00:00.000Z", userId: `actor:${id}` },
    participantProfileId: `pp-${id}`,
    reactivatedAt: null,
    registeredAt: "2026-10-01T00:00:00.000Z",
    sideEffects: { calendarUpdateExecuted: false, emailSent: false, globalProfileWriteExecuted: false, notificationDelivered: false, organizerMessageSent: false, refundRequested: false },
    status,
    updatedAt: "2026-10-01T00:00:00.000Z",
    userId: `actor:${id}`,
  };
}

test("publicAttendeesFromRegistrations：只出 event_attendees 可见的人与字段；total = 有效报名；不出 actor id", () => {
  const result = publicAttendeesFromRegistrations([
    registration("ito", "伊藤 直子", [response("positioning", "CFO @ ハルモニア", "event_attendees"), response("experienceHighlight", "キーノート登壇", "event_attendees")]),
    registration("mori", "森 拓也", [response("positioning", "VP @ ブルーム証券", "matching_only")]),
    registration("old", "旧 登録", undefined),
    registration("kato", "加藤 健太", [response("positioning", "営業本部長 @ アクシス商事", "event_attendees"), response("experienceHighlight", "非公開の経歴", "matching_only")]),
    registration("gone", "取消 済", [response("positioning", "CEO @ X", "event_attendees")], "cancelled"),
  ], ["伊藤直子"]);
  assert.equal(result.total, 4);
  assert.deepEqual(result.attendees.map((item) => item.name), ["伊藤 直子", "加藤 健太"]);
  const ito = result.attendees[0]!;
  assert.equal(ito.attendeeId, "pp-ito");
  assert.equal(ito.org, "ハルモニア");
  assert.equal(ito.role, "CFO");
  assert.equal(ito.note, "キーノート登壇");
  assert.equal(ito.speaker, true);
  const kato = result.attendees[1]!;
  assert.equal(kato.note, null, "matching_only の回答は出さない");
  assert.equal(kato.speaker, false);
  const serialized = JSON.stringify(result);
  assert.ok(!serialized.includes("actor:"));
  assert.ok(!serialized.includes("Secret Co"));
  assert.ok(!serialized.includes("ブルーム証券"));
});

const PLAN_TYPES: PlanTypeLite[] = [
  { allocation: 40, itemId: "item-vc", key: "vc_partner", roleSituation: null, shortLabel: "VC パートナー", skipped: false, targetCount: 3 },
  { allocation: 30, itemId: "item-cfo", key: "cfo", roleSituation: null, shortLabel: "CFO", skipped: false, targetCount: 2 },
];

test("judgeEntryFrom：分数 / 判定 / 3 维与 judgeEvent 原样一致；理由与根拠", () => {
  const context: JudgeContext = {
    ...emptyJudgeContext("ja", [{ id: "c1", name: "高橋 美咲" }]),
    goalLabel: "シリーズA 資金調達",
    planId: "plan-1",
    types: PLAN_TYPES.map((type) => ({ allocation: type.allocation, emoji: "💼", key: type.key, metCount: 0, shortLabel: type.shortLabel, skipped: false, targetCount: type.targetCount })),
  };
  const result = judgeEvent({
    context,
    eventId: "evt-1",
    facts: { agenda: [{ at: "19:00", title: "ネットワーキング", minutes: 60 }], endsAt: "2026-10-16T12:00:00.000Z", price: "¥3,000", startsAt: "2026-10-16T10:00:00.000Z", title: "CFO Night", venue: "渋谷" },
    orbit: { attendeeSource: "registrants", expected: { vc_partner: 3 }, feeYen: 3000, firstDegree: 1, known: [{ contactId: "c1", name: "高橋 美咲" }], registrantCount: 20, secondDegree: null },
  });
  const entry = judgeEntryFrom(result, { assessmentId: "as-1", goal: "シリーズA 資金調達", language: "ja", planFitNames: ["清水 玲奈"] });
  assert.equal(entry.score, result.total);
  assert.equal(entry.verdict, result.verdict);
  assert.deepEqual(entry.display, { goalFit: result.display.goalFit.value, people: result.display.people.value, timeCost: result.display.timeCost.value });
  assert.equal(entry.basis, result.basisLines.join(" · "));
  assert.deepEqual(entry.knownAttendees, ["高橋 美咲"]);
  assert.equal(entry.assessmentId, "as-1");
  assert.deepEqual(entry.planFitNames, ["清水 玲奈"]);
  assert.equal(entry.meetCandidates![0]!.label, "VC パートナー");
  assert.ok(entry.reason?.startsWith("VC パートナー "));
  assert.equal(entry.reasonDetail, `プラン「シリーズA 資金調達」で会うべき人と重なるため。根拠：${result.basisLines.join(" · ")}。`);

  assert.equal(reasonFromCandidate({ basis: "登壇 3名", count: 3, emoji: "💼", label: "VC パートナー", source: "speakers" }, "ja"), "VC パートナー 3名が登壇");
  assert.equal(reasonFromCandidate({ basis: "", count: 2, emoji: "💼", label: "VC", source: "registrants" }, "en"), "2 VC registered");
  assert.equal(reasonFromCandidate(undefined, "ja"), null);
  const noCandidates = judgeEntryFrom({ ...result, meetCandidates: [] }, { assessmentId: null, goal: "g", language: "zh", planFitNames: [] });
  assert.equal(noCandidates.reason, null);
  assert.equal(noCandidates.reasonDetail, null);
});

test("organizerHistory：回数 / 第一次 / 平均（已开始的）/ 每月", () => {
  const now = new Date("2026-10-07T03:00:00.000Z");
  const monthly = organizerHistory([
    { registrationCount: 100, startsAt: "2026-08-20T10:00:00.000Z" },
    { registrationCount: 120, startsAt: "2026-09-17T10:00:00.000Z" },
    { registrationCount: 5, startsAt: "2026-10-16T10:00:00.000Z" },
  ], now)!;
  assert.deepEqual(monthly, { averageAttendance: 110, editions: 3, monthly: true, since: "2026-08-20T10:00:00.000Z" });
  const sparse = organizerHistory([{ registrationCount: 10, startsAt: "2026-03-01T10:00:00.000Z" }, { registrationCount: 0, startsAt: "2026-06-01T10:00:00.000Z" }, { registrationCount: 0, startsAt: "2026-12-01T10:00:00.000Z" }], now)!;
  assert.equal(sparse.monthly, false);
  assert.equal(sparse.averageAttendance, 5);
  assert.equal(organizerHistory([{ registrationCount: 0, startsAt: "2026-12-01T10:00:00.000Z" }], now)!.averageAttendance, null);
  assert.equal(organizerHistory([], now), null);
});

test("contactHistoryFrom / linkedTypeByContactFrom", () => {
  assert.deepEqual(contactHistoryFrom({ channel: "email_signal", occurredAt: "2026-09-24T01:00:00.000Z", summary: "x" }), [{ at: "2026-09-24T01:00:00.000Z", kind: "email" }]);
  assert.deepEqual(contactHistoryFrom({ channel: "weird", occurredAt: "2026-09-24T01:00:00.000Z" }), [{ at: "2026-09-24T01:00:00.000Z", kind: "other" }]);
  assert.deepEqual(contactHistoryFrom({ occurredAt: "not a date" }), []);
  assert.deepEqual(contactHistoryFrom(null), []);
  const linked = linkedTypeByContactFrom(PLAN_TYPES, [{ contactLinks: [{ contactId: "c1" }], itemId: "item-cfo" }, { contactLinks: [{ contactId: "c1" }, { contactId: "c2" }], itemId: "item-vc" }, { contactLinks: [{ contactId: "c3" }], itemId: "other-plan-item" }]);
  assert.deepEqual([...linked.entries()], [["c1", "cfo"], ["c2", "vc_partner"]]);
});

function participant(id: string, name: string, company: string | null, role: string | null) {
  return { actorId: `actor:${id}`, company, displayName: name, energyStyle: null, evidenceIds: [], experienceHighlight: null, industry: null, languages: [], lateRegistration: false, needs: [], offers: ["資本政策"], participantId: id, profileCompleteness: "partial" as const, role, seniority: null, topics: ["SaaS"] };
}

function workspace(): EventOperationsAttendeeWorkspace {
  const request = (requestId: string, requester: string, target: string, status: string, contactId: string | null, withdrawnAt: string | null = null) => ({ acceptedAt: null, contactId, createdAt: "2026-10-16T11:00:00.000Z", declinedAt: null, eventId: "evt-1", requestId, requesterParticipantId: requester, revision: 2, status, targetParticipantId: target, updatedAt: "2026-10-16T11:00:00.000Z", withdrawnAt });
  const table = (tableNumber: number, members: string[]) => ({ icebreakers: ["a", "b", "c"] as [string, string, string], memberPrompts: {}, memberRationales: { me: "同じ関心" }, members: members.map((participantId, index) => ({ participantId, seat: String(index + 1) })), rationale: "資金調達", tableNumber, theme: "シリーズA" });
  return {
    checkIn: { checkedInAt: "2026-10-16T10:05:00.000Z", participantId: "me" },
    checkInAvailable: false,
    configuration: { checkInOpensAt: "2026-10-16T09:30:00.000Z", eventEndsAt: "2026-10-16T12:00:00.000Z", eventId: "evt-1", eventStartsAt: "2026-10-16T10:00:00.000Z", roundOneStartsAt: "2026-10-16T10:30:00.000Z", roundTwoStartsAt: "2026-10-16T11:00:00.000Z" },
    contactRequests: [
      request("r1", "me", "p-shimizu", "accepted", "c-shimizu"),
      request("r2", "p-inoue", "me", "accepted", "c-inoue"),
      request("r3", "me", "p-kato", "awaiting_target_consent", null),
      request("r4", "me", "p-okada", "accepted", "c-okada", "2026-10-16T11:30:00.000Z"),
    ],
    directory: [participant("me", "佐藤 健一", "ミナトリンク", "CEO"), participant("p-shimizu", "清水 玲奈", "Sorae Capital", "プリンシパル"), participant("p-inoue", "井上 早紀", "ノードワークス", "CFO"), participant("p-kato", "加藤 健太", "アクシス商事", "営業本部長"), participant("p-okada", "岡田 悠", "テクノハブ", "CEO")],
    me: participant("me", "佐藤 健一", "ミナトリンク", "CEO"),
    recommendations: { noMatchReason: null, recommendations: [{ icebreakers: ["x"], memberHint: null, reasons: ["投資領域が近い"], score: 0.9, targetParticipantId: "p-shimizu" }], sourceParticipantId: "me" },
    resultsState: "ready",
    roundOneTable: table(2, ["me", "p-okada"]),
    roundTwoTable: null,
  } as unknown as EventOperationsAttendeeWorkspace;
}

test("venueWorkspaceFrom：参加者侧字段（不带 actorId）+ 已发布分组的全部桌", () => {
  const ws = workspace();
  const grouping = { roundOne: [ws.roundOneTable!, { ...ws.roundOneTable!, members: [{ participantId: "p-kato", seat: "1" }], tableNumber: 3 }], roundTwo: [] };
  const venue = venueWorkspaceFrom(ws, { grouping });
  assert.equal(venue.me.participantId, "me");
  assert.equal(venue.directory.length, 5);
  assert.equal(venue.contactRequests[0]!.createdAt, "2026-10-16T11:00:00.000Z");
  assert.equal(venue.roundOneTable!.tableNumber, 2);
  assert.deepEqual(venue.rounds!.one.map((table) => table.tableNumber), [2, 3]);
  assert.equal(venue.recommendations!.recommendations[0]!.targetParticipantId, "p-shimizu");
  assert.ok(!JSON.stringify(venue).includes("actor:"));
  assert.equal(venueWorkspaceFrom(ws, null).rounds, null);
});

test("afterMetFrom：只算已互换（accepted、未撤回）的人；想见的人 = 归到计划类型的人；已关联类型", () => {
  const out = afterMetFrom(workspace(), { linkedTypeByContact: new Map([["c-inoue", "cfo"]]), types: PLAN_TYPES });
  assert.deepEqual(out.met.map((person) => [person.attendeeId, person.contactId, person.wanted, person.linkedTypeKey]), [["p-shimizu", "c-shimizu", true, null], ["p-inoue", "c-inoue", true, "cfo"]]);
  assert.equal(out.wantedTotal, 2, "清水（Capital）と井上（CFO）");
  assert.equal(afterMetFrom(workspace(), { linkedTypeByContact: new Map(), types: [] }).wantedTotal, 0);
});

test("afterPlanFrom → buildAfter：已得人数 / 已得分 / counted（同人同类型只计一次）", () => {
  const plan = afterPlanFrom({
    before: 46,
    goal: "シリーズA 資金調達",
    links: [{ contactLinks: [{ contactId: "c-inoue", state: "established" }, { contactId: "c-x", state: "linked" }], itemId: "item-cfo" }],
    remaining: [{ key: "vc_partner", remaining: 2, targetCount: 3 }, { key: "cfo", remaining: 1, targetCount: 2 }],
    segments: [{ earned: 14, key: "vc_partner" }, { earned: 15, key: "cfo" }],
    types: PLAN_TYPES,
  });
  assert.deepEqual(plan.slots.map((slot) => [slot.key, slot.label, slot.earnedCount, slot.earnedPoints]), [["vc_partner", "VC パートナー", 1, 14], ["cfo", "CFO", 1, 15]]);
  assert.deepEqual([...plan.counted], ["cfo:c-inoue"]);
  const met = afterMetFrom(workspace(), { linkedTypeByContact: new Map([["c-inoue", "cfo"], ["c-shimizu", "vc_partner"]]), types: PLAN_TYPES }).met;
  const after = buildAfter({ ai: null, event: { eventId: "evt-1", startsAt: "2026-10-16T10:00:00.000Z", title: "CFO Night" }, meetings: 0, met, plan, wantedTotal: 2 });
  const inoue = after.nextSteps.find((step) => step.attendeeId === "p-inoue")!;
  assert.equal(inoue.alreadyCounted, true);
  assert.ok(after.score!.after > 46);
});

test("afterDraftFrom：E3 → AI 下書き；旧产物 → summary / messageDraft；未完成 → 都没有", () => {
  const base = { evidenceHash: "h", evidenceIds: [], generatedAt: "2026-10-16T13:00:00.000Z", messageDraft: "ありがとうございました", model: "m", promptVersion: 3, provider: "p", summary: "  よい会でした ", version: 1 };
  const ai = afterDraftFrom({ artifact: { ...base, highlights: [{ detail: "d", emoji: "💡", evidence: "e", title: "t" }], nextSteps: [{ attendeeId: "p-shimizu", followupDate: "2026-10-19", planTypeSuggestion: "vc_partner", thanksDraft: { body: "b", subject: "s" } }] }, status: "ready" });
  assert.equal(ai.ai!.highlights.length, 1);
  assert.equal(ai.ai!.nextSteps[0]!.planTypeSuggestion, "vc_partner");
  assert.equal(ai.legacy, null);
  assert.deepEqual(afterDraftFrom({ artifact: base, status: "ready" }), { ai: null, legacy: { messageDraft: "ありがとうございました", summary: "よい会でした" } });
  assert.deepEqual(afterDraftFrom({ artifact: base, status: "running" }), { ai: null, legacy: null });
  assert.deepEqual(afterDraftFrom(null), { ai: null, legacy: null });
});

test("会後確定：フォロー日 9:00 JST、标题、确定性的去重键", () => {
  assert.equal(followupDueAt("2026-10-19"), "2026-10-19T00:00:00.000Z");
  assert.equal(followupDueAt("2026/10/19"), null);
  assert.equal(followupTaskTitle("清水 玲奈"), "清水さんへフォロー");
  assert.equal(afterConfirmationIds.row("a", "e", "p1"), afterConfirmationIds.row("a", "e", "p1"));
  assert.notEqual(afterConfirmationIds.row("a", "e", "p1"), afterConfirmationIds.row("b", "e", "p1"));
  assert.notEqual(afterConfirmationIds.key("a", "e", "k1"), afterConfirmationIds.key("a", "e", "k2"));
  assert.match(afterConfirmationIds.event("a", "e"), /^eac-event:[0-9a-f]{32}$/);
  assert.equal(afterConfirmationIds.taskKey("e", "p1"), "r27-after:e:p1");
});

test("inboxUpsertFor：截止 = reminder（带 dueAt）、准备 = suggestion；通过收件箱写入校验", () => {
  const nowIso = "2026-10-14T00:00:00.000Z";
  for (const sourceKind of ["event_deadline", "event_prep"] as const) {
    const upsert = inboxUpsertFor("actor:me", { at: "2026-10-15T15:00:00.000Z", body: "申込締切は明日です", eventId: "evt-1", href: "/events/evt-1", semanticKey: `r27:${sourceKind}:evt-1`, sourceKind, title: "CFO Night" }, nowIso);
    assert.equal(upsert.kind, sourceKind === "event_deadline" ? "reminder" : "suggestion");
    assert.equal(Boolean(upsert.dueAt), sourceKind === "event_deadline");
    const parsed = inboxNotificationWriteSchema.safeParse({ ...upsert, disposition: "open", id: inboxNotificationId("actor:me", upsert.semanticKey), readAt: null, revision: 1, updatedAt: nowIso });
    assert.ok(parsed.success, JSON.stringify(parsed.error?.issues));
  }
});

test("createJourneyLivePorts：非 live 模式 → null（同 getConfiguredEventAssessmentRuntime 约定）", () => {
  const previous = { feature: process.env.ORBIT_FEATURE_MODE, module: process.env.ORBIT_MODULE_MODE };
  process.env.ORBIT_MODULE_MODE = "mock";
  try {
    assert.equal(createJourneyLivePorts(), null);
  } finally {
    if (previous.module === undefined) delete process.env.ORBIT_MODULE_MODE; else process.env.ORBIT_MODULE_MODE = previous.module;
  }
});
