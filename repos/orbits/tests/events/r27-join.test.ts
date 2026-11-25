/**
 * R27 SC-R27-06 参加登録 facade：≤5 问、多选 / 上限按字段、カバー率规则（44 + 14×4）、确认页「追加」再问一题、改过的自己紹介随报名留存、只在 draft 时调 persona、
 * 审核制活动 409 → 审核申请、仮予定确认后才写 + 结果出来后改名 / 删除、示例模式不写库；公開範囲按字段（服务端策略）。
 */
import { eventsJourneyCopy } from "../../app/(app)/app/orbit-2026/copy/eventsJourney";
import assert from "node:assert/strict";
import test from "node:test";

import { eventJoinProfileSchema, eventJoinStepSchema } from "../../shared/api-schema/event-join";
import { JOURNEY_EVENT_ID } from "../../shared/mock/demo-world/events-journey";
import { registrationFieldVisibility, signAdaptiveInterviewQuestion, verifyInterviewResponseSubmissions } from "../../features/events/registration/interview-question-token.server";
import { eventOperationsParticipantFromRegistration } from "../../features/events/event-operations/participant";
import { createEventJourneyRoutes } from "../../features/events/journey/handlers";
import { createJoinService, profileFactQuestions, profileFromAnswers, questionShape, tentativeTitle, type JoinPorts } from "../../features/events/journey/join";

const answer = (field: string, value: string, n: number) => ({ answer: value, field, prompt: `q${n}`, questionToken: `t${n}` });
const post = (body: unknown) => new Request("http://localhost/x", { body: JSON.stringify(body), headers: { "content-type": "application/json" }, method: "POST" });
const params = { params: Promise.resolve({ id: JOURNEY_EVENT_ID }) };

test("questions: 会いたい人 is multi-select, 話したいテーマ at most 2, the rest single; never more than 5", async () => {
  // 2026-11-26: 提供できること / 目的 are multi too (profile strengths / goals are separate, preselected options); 目的 at most 2.
  assert.deepEqual([questionShape("targetAttendees", "ja").multi, questionShape("experienceHighlight", "ja").max, questionShape("desiredOutcome", "ja").max, questionShape("valueOffered", "ja").multi, questionShape("energyStyle", "ja").multi], [true, 2, 2, true, false]);
  const routes = createEventJourneyRoutes({ resolveActor: async () => ({ id: "actor:a" }) as never, resolveMode: () => "mock" });
  const first = eventJoinStepSchema.parse((await (await routes.joinNext(post({ answers: [] }), params)).json()).data);
  assert.deepEqual([first.index, first.total, first.question?.field], [1, 5, "desiredOutcome"]);
  const five = ["desiredOutcome", "experienceHighlight", "targetAttendees", "valueOffered", "followUpPreference"].map((field, n) => answer(field, "x", n));
  const done = eventJoinStepSchema.parse((await (await routes.joinNext(post({ answers: five }), params)).json()).data);
  assert.deepEqual([done.done, done.question ?? null], [true, null]);
  const six = eventJoinStepSchema.parse((await (await routes.joinNext(post({ answers: [...five, answer("industry", "x", 6)] }), params)).json()).data);
  assert.equal(six.done, true, "past 5 answers the flow only ends (a follow-up is asked only for a missing item, see below)");
  const ten = Array.from({ length: 10 }, (_, n) => answer("industry", "x", n));
  assert.equal((await routes.joinNext(post({ answers: ten }), params)).status, 400, "a tenth answer is rejected (5 + at most 4 follow-ups)");
  const three = five.slice(0, 3);
  const enough = eventJoinStepSchema.parse((await (await routes.joinNext(post({ answers: three }), params)).json()).data);
  assert.deepEqual([enough.done, enough.index], [true, 3], "the sample interview judges 3 answers enough (review shows 提供できること △)");
  const more = eventJoinStepSchema.parse((await (await routes.joinNext(post({ answers: three, more: true }), params)).json()).data);
  assert.deepEqual([more.done, more.question?.field], [false, "valueOffered"], "「追加」 asks one more question");
});

test("profile coverage is a rule (company 44 + 14 each) and the AI persona only runs for the draft", async () => {
  const three = [answer("desiredOutcome", "資金調達", 1), answer("experienceHighlight", "シリーズAの資本政策 · CFO 採用", 2)];
  const profile = profileFromAnswers(three, { review: true });
  assert.equal(profile.coverage, 72);
  assert.deepEqual(profile.topics, ["シリーズAの資本政策", "CFO 採用"]);
  assert.equal(profileFromAnswers([...three, answer("targetAttendees", "VC・CVC", 3)], { review: true }).coverage, 86);
  let personaCalls = 0;
  const ports = fakePorts({ persona: async () => { personaCalls += 1; return { selfIntroDraft: "製造業向け SaaS の代表です。資本政策の話を伺いたいです。", tags: [] }; } });
  const service = createJoinService({ ports });
  await service.profile("actor:a", "ev", three, false, "ja");
  assert.equal(personaCalls, 0);
  const draft = eventJoinProfileSchema.parse(await service.profile("actor:a", "ev", three, true, "ja"));
  assert.equal(personaCalls, 1);
  assert.equal(draft.selfIntro?.source, "ai_draft");
});

test("submit: a screened event (409) becomes a review application; the tentative entry is written only on confirm and renamed / removed when the result arrives", async () => {
  const calls: string[] = [];
  const intros: string[] = [];
  let status: "pending_review" | "registered" | "rejected" = "pending_review";
  const store = new Map<string, { scheduleItemId: string; final: boolean }>();
  const service = createJoinService({ ports: fakePorts({
    createSchedule: async (_actor, input) => { calls.push(`create:${input.title}`); return "sch1"; },
    readTentative: async (actor, event) => store.get(`${actor}:${event}`) ?? null,
    registrationStatus: async () => status,
    removeSchedule: async () => { calls.push("remove"); },
    renameSchedule: async (_actor, _id, title) => { calls.push(`rename:${title}`); },
    saveIntro: async (actor, event, text) => { intros.push(`${actor}:${event}:${text}`); },
    saveTentative: async (actor, event, record) => { store.set(`${actor}:${event}`, record); },
    submit: async () => ({ status: "pending_review", submittedAt: "2026-09-20T05:32:00.000Z" }),
  }) });
  const result = await service.submit("actor:a", "ev", [answer("targetAttendees", "VC", 1)], "ja", "編集した自己紹介");
  assert.deepEqual(intros, ["actor:a:ev:編集した自己紹介"], "the edited self-introduction is kept with the registration");
  assert.equal(result?.status, "pending_review");
  assert.equal(result?.tentative?.title, "仮：CFO Night");
  assert.deepEqual(calls, [], "nothing is written to the calendar before the user confirms");
  await service.tentative("actor:a", "ev", "k1", "ja");
  await service.tentative("actor:a", "ev", "k2", "ja");
  assert.deepEqual(calls, ["create:仮：CFO Night"], "one tentative entry, idempotent");
  status = "registered";
  await service.syncTentative("actor:a", "ev", "ja");
  await service.syncTentative("actor:a", "ev", "ja");
  assert.deepEqual(calls.slice(1), ["rename:CFO Night"], "renamed once when admitted");
  assert.equal(tentativeTitle("CFO Night Tokyo vol.18", "en"), "Tentative: CFO Night");
});

test("sample mode: submit answers without writing; signed-out callers are refused in live", async () => {
  const routes = createEventJourneyRoutes({ resolveActor: async () => ({ id: "actor:a" }) as never, resolveMode: () => "mock" });
  const res = await routes.joinSubmit(post({ answers: [answer("targetAttendees", "VC・CVC", 1)], idempotencyKey: "k" }), params);
  assert.equal((await res.json()).data.status, "pending_review");
  const live = createEventJourneyRoutes({ liveJoin: async () => null, liveService: async () => null, resolveActor: async () => null, resolveMode: () => "live" });
  assert.equal((await live.joinSubmit(post({ answers: [answer("targetAttendees", "VC", 1)], idempotencyKey: "k" }), params)).status, 401);
});

test("公開範囲 is a per-field server policy: every answer of a new submission is shared with attendees (2026-11-26)", () => {
  assert.equal(registrationFieldVisibility("desiredOutcome"), "event_attendees");
  assert.equal(registrationFieldVisibility("targetAttendees"), "event_attendees");
  assert.equal(registrationFieldVisibility("valueOffered"), "event_attendees");
  assert.equal(registrationFieldVisibility("positioning"), "event_attendees");
});

function fakePorts(overrides: Partial<JoinPorts> = {}): JoinPorts {
  return {
    cancel: async () => undefined,
    createSchedule: async () => "sch",
    now: () => Date.parse("2026-09-20T00:00:00.000Z"),
    event: async () => ({ endsAt: "2026-10-07T12:30:00.000Z", registrationClosesAt: "2026-10-03T14:59:00.000Z", review: true, startsAt: "2026-10-07T10:00:00.000Z", title: "CFO Night Tokyo vol.18" }),
    next: async () => null,
    persona: async () => null,
    profileIntro: async () => null,
    readTentative: async () => null,
    registrationStatus: async () => "none",
    removeSchedule: async () => undefined,
    renameSchedule: async () => undefined,
    saveIntro: async () => undefined,
    saveTentative: async () => undefined,
    submit: async () => ({ status: "registered", submittedAt: "2026-09-20T05:32:00.000Z" }),
    ...overrides,
  };
}

test("会いたい人 / 提供できること: what the profile already says comes first and selected; other questions stay as asked", async () => {
  let field = "targetAttendees";
  const service = createJoinService({ ports: fakePorts({
    next: async () => ({ allowCustom: true, field, options: ["投資家", "同業者"], prompt: "?", questionToken: "t" }),
    profileTags: async () => ({ offering: ["紹介", "業界の知見"], seeking: ["投資家", "顧客"] }),
  }) });
  const ask = async () => (await service.next("ev", [], "ja", false, "actor:a"))?.question;
  assert.deepEqual([(await ask())?.options, (await ask())?.prefill], [["投資家", "顧客", "同業者"], ["投資家", "顧客"]]);
  field = "valueOffered"; // 2026-11-26: one option per strength, each preselected and removable on its own
  assert.deepEqual([(await ask())?.options, (await ask())?.prefill], [["紹介", "業界の知見", "投資家", "同業者"], ["紹介", "業界の知見"]]);
  field = "desiredOutcome";
  assert.equal((await ask())?.prefill, undefined);
  field = "targetAttendees";
  assert.equal((await service.next("ev", [], "ja"))?.question?.prefill, undefined);
});

test("公司・职位、行业：问答没问到的由资料补上（固定题，签名后两条报名路都收）；问到的不动；只有职位不补", async () => {
  const facts = { industry: "金融・投資", organization: "株式会社ミナトリンク", role: "代表取締役 CEO" };
  const questions = profileFactQuestions(facts, ["targetAttendees"], "zh");
  assert.deepEqual(questions.map((item) => [item.field, item.answer]), [["positioning", "代表取締役 CEO @ 株式会社ミナトリンク"], ["industry", "金融・投資"]]);
  assert.deepEqual(profileFactQuestions(facts, ["positioning", "industry"], "en"), []);
  assert.deepEqual(profileFactQuestions({ ...facts, organization: null }, [], "en").map((item) => item.field), ["industry"]);
  assert.deepEqual(profileFactQuestions(null, [], "en"), []);
  const responses = questions.map(({ answer, ...question }) => ({ answer, questionToken: signAdaptiveInterviewQuestion({ actorId: "a", eventId: "e", language: "zh", secret: "s".repeat(32),
    question: { ...question, acknowledgment: "", provenance: { fallbackReason: "profile", generationMethod: "deterministic-fallback", model: "fixed-questions-v1", provider: "orbit-fixed" } } }) }));
  const verified = verifyInterviewResponseSubmissions({ actorId: "a", eventId: "e", responses, secret: "s".repeat(32) });
  const participant = eventOperationsParticipantFromRegistration({ id: "r", participantProfile: { answers: {}, displayName: "佐藤", interviewResponses: verified }, participantProfileId: "p", registeredAt: "2026-11-25T00:00:00.000Z", userId: "a" } as never, { lateRegistration: false, profileEditDeadlineAt: null });
  assert.deepEqual([participant.company, participant.role, participant.industry], ["株式会社ミナトリンク", "代表取締役 CEO", "金融・投資"]);
  let seen: unknown;
  await createJoinService({ ports: fakePorts({ submit: async (_event, _answers, from) => { seen = from; return { status: "registered", submittedAt: "2026-09-20T05:32:00.000Z" }; } }) }).submit("actor:a", "ev", [], "ja");
  assert.deepEqual(seen, { actorId: "actor:a", language: "ja" });
});

test("cancel: the registration is cancelled and the tentative calendar entry goes with it", async () => {
  const calls: string[] = [];
  let status: "pending_review" | "cancelled" = "pending_review";
  const service = createJoinService({ ports: fakePorts({
    cancel: async () => { calls.push("cancel"); status = "cancelled"; },
    readTentative: async () => ({ final: false, scheduleItemId: "sch1" }),
    registrationStatus: async () => status,
    removeSchedule: async (_actor, id) => { calls.push(`remove:${id}`); },
  }) });
  assert.deepEqual(await service.cancel("actor:a", "ev", "ja"), { eventId: "ev", status: "cancelled" });
  assert.deepEqual(calls, ["cancel", "remove:sch1"]);
  const routes = createEventJourneyRoutes({ resolveActor: async () => ({ id: "actor:a" }) as never, resolveMode: () => "mock" });
  assert.equal((await (await routes.joinCancel(post({ idempotencyKey: "k" }), params)).json()).data.status, "cancelled");
});

test("cancel after a confirmed registration still removes the renamed calendar entry, and a removed entry is not reused", async () => {
  const calls: string[] = [];
  let record: { scheduleItemId: string; final: boolean; removed?: boolean } | null = { final: true, scheduleItemId: "sch-final" };
  let status: "registered" | "cancelled" = "registered";
  const service = createJoinService({ ports: fakePorts({
    cancel: async () => { status = "cancelled"; },
    createSchedule: async () => { calls.push("create"); return "sch-new"; },
    readTentative: async () => record,
    registrationStatus: async () => status,
    removeSchedule: async (_actor, id) => { calls.push(`remove:${id}`); },
    saveTentative: async (_actor, _event, next) => { record = next; },
  }) });
  await service.cancel("actor:a", "ev", "ja");
  assert.deepEqual(calls, ["remove:sch-final"]);
  assert.equal(record?.removed, true);
  await service.syncTentative("actor:a", "ev", "ja");
  assert.deepEqual(calls, ["remove:sch-final"], "a removed entry is not removed twice");
  status = "registered";
  assert.equal((await service.tentative("actor:a", "ev", "k2", "ja"))?.scheduleItemId, "sch-new", "re-registering writes a fresh entry");
});

test("signed-out overview never lists attendee names (counts only)", async () => {
  const routes = createEventJourneyRoutes({ resolveActor: async () => null, resolveMode: () => "mock" });
  const body = await (await routes.overview(new Request(`http://orbit.test/api/events/${JOURNEY_EVENT_ID}/overview`), { params: Promise.resolve({ id: JOURNEY_EVENT_ID }) })).json();
  assert.equal(body.data.signedOut, true);
  assert.deepEqual(body.data.attendees, []);
  assert.deepEqual(body.data.knownAttendees, []);
});

test("roster policy A: a signed-in user sees names only after registering; counts are always there", async () => {
  const { setJourneyMockState } = await import("../../features/events/journey/mock");
  const { canSeeRoster } = await import("../../features/events/journey/roster-policy");
  const routes = createEventJourneyRoutes({ resolveActor: async () => ({ id: "actor:a" }) as never, resolveMode: () => "mock" });
  const read = async () => (await (await routes.overview(new Request(`http://orbit.test/api/events/${JOURNEY_EVENT_ID}/overview`), { params: Promise.resolve({ id: JOURNEY_EVENT_ID }) })).json()).data;
  try {
    setJourneyMockState({ overview: "many", registration: "none" });
    const locked = await read();
    assert.equal(locked.rosterLocked, true);
    assert.deepEqual(locked.attendees, []);
    assert.deepEqual(locked.knownAttendees, []);
    assert.ok(locked.attendeeCounts.all > 0 && locked.attendeeCounts.known > 0, "counts stay");
    setJourneyMockState({ registration: "registered" });
    const open = await read();
    assert.equal(open.rosterLocked, undefined);
    assert.ok(open.attendees.length > 0);
  } finally {
    setJourneyMockState({ registration: "none" });
  }
  assert.equal(canSeeRoster({ registrationStatus: "pending_review", signedIn: true }), false, "pending review is not an attendee yet");
  assert.equal(canSeeRoster({ signedIn: true }, "signed_in"), true, "the alternative switch opens it to any signed-in user");
  assert.equal(canSeeRoster({ signedIn: false }, "signed_in"), false);
});

test("cancelling an already cancelled registration succeeds again without calling the registration routes", async () => {
  let called = 0;
  const removed: string[] = [];
  const service = createJoinService({ ports: fakePorts({ cancel: async () => { called += 1; throw new Error("409"); }, registrationStatus: async () => "cancelled", removeIntro: async (_actor, event) => { removed.push(event); } }) });
  assert.deepEqual(await service.cancel("actor:a", "ev", "ja"), { eventId: "ev", status: "cancelled" });
  assert.equal(called, 0);
  assert.deepEqual(removed, ["ev"]);
  // Never registered (or still active and failing): the error is not swallowed.
  await assert.rejects(createJoinService({ ports: fakePorts({ cancel: async () => { throw new Error("404"); } }) }).cancel("actor:a", "ev", "ja"));
});

test("参加目的 / 会いたい人 of a new submission: stored event_attendees on every path (asked, from organizer questions, from the profile)", () => {
  const sign = (field: string, provider: string) => ({ answer: "A", questionToken: signAdaptiveInterviewQuestion({ actorId: "a", eventId: "e", language: "zh", secret: "s".repeat(32),
    question: { acknowledgment: "", field: field as never, options: ["A", "B"], prompt: "这次活动的一个问题？", provenance: provider === "orbit-fixed" ? { fallbackReason: "profile", generationMethod: "deterministic-fallback", model: "fixed-questions-v1", provider } : { fallbackReason: null, generationMethod: "orbit-agent-model-adaptive", model: "m", provider } } }) });
  for (const provider of ["deepseek", "orbit-fixed"]) {
    const verified = verifyInterviewResponseSubmissions({ actorId: "a", eventId: "e", responses: ["desiredOutcome", "targetAttendees", "valueOffered"].map((field) => sign(field, provider)), secret: "s".repeat(32) });
    assert.deepEqual(verified.map((item) => item.visibility), ["event_attendees", "event_attendees", "event_attendees"], provider);
  }
});

test("資料の「提供・求めていること」を非公開にした人：報名で資料から静かに補わない（追加で聞く）；公開なら補い、確認画面に「プロフィールから」と出し、編集すると本人の回答に替わる", async () => {
  const { projectPublicProfile } = await import("../../features/profile/public-projection");
  const own = { displayName: "佐藤", headline: "", homeMarket: "", id: "p", offering: ["紹介"], organization: "A", preferredIntroChannels: [], relationshipGoal: "", role: "", seeking: ["投資家"], targetRelationshipTypes: [], topics: ["生成 AI"], updatedAt: "" };
  const hostQuestions = ["h1", "h2", "h3", "h4", "h5"].map((id) => ({ id, kind: "free", options: [], prompt: `質問 ${id}`, required: false }));
  const hostAnswers = hostQuestions.map((item) => ({ answer: "回答", field: `host:${item.id}`, prompt: item.prompt, questionToken: `host:${item.id}` }));
  for (const full of [true, false]) for (const open of [true, false]) {
    const shown = projectPublicProfile({ ...own, publicFields: { companyRole: true, intro: true, offeringSeeking: open } } as never);
    const submitted: unknown[] = [];
    const asked: (readonly string[] | undefined)[] = [];
    const service = createJoinService({ ports: fakePorts({
      hostQuestions: async () => (full ? hostQuestions : []) as never,
      next: async (_event, _answers, _language, _more, plan) => { asked.push(plan?.focusFields); const field = plan?.focusFields?.[0] ?? "targetAttendees"; return { allowCustom: true, field, options: ["A", "B"], prompt: "どんな方に会いたいですか？", questionToken: "t" }; },
      profileTags: async () => ({ goalIds: ["g"], offering: shown.offering ?? [], seeking: shown.seeking ?? [] }),
      submit: async (_event, _answers, from) => { submitted.push(from?.derived ?? []); return { status: "registered", submittedAt: "2026-11-26T00:00:00.000Z" }; },
    }) });
    if (!full) {
      // 枠が空いている：どちらでも会いたい人は本人に聞く（公開時だけ資料の選択肢を先に選んでおく）。
      const step = await service.next("ev", [], "ja", false, "actor:a");
      assert.equal(step?.question?.field, "targetAttendees");
      assert.deepEqual(step?.question?.prefill, open ? ["投資家"] : undefined);
      continue;
    }
    const rest = [{ answer: "x", field: "desiredOutcome", prompt: "?", questionToken: "t" }, { answer: "y", field: "experienceHighlight", prompt: "?", questionToken: "t" }];
    const all = [...hostAnswers, ...rest];
    const step = await service.next("ev", all, "ja", false, "actor:a");
    const profile = await service.profile("actor:a", "ev", all, false, "ja");
    const item = (key: string) => profile!.items.find((entry) => entry.key === key)!;
    if (open) {
      assert.equal(step?.done, true);
      assert.deepEqual([item("target"), item("offer")], [{ done: true, fromProfile: true, key: "target" }, { done: true, fromProfile: true, key: "offer" }]);
      assert.equal(item("purpose").fromProfile, undefined, "an answered item is not marked");
      // 編集：その項目だけ聞き直し、答えたら印が消え、資料では補わない。
      const again = await service.next("ev", all, "ja", true, "actor:a", "target");
      assert.equal(again?.question?.field, "targetAttendees");
      assert.deepEqual(asked.at(-1), ["targetAttendees"]);
      const answered = [...all, { answer: "製造業", field: "targetAttendees", prompt: "?", questionToken: "t" }];
      assert.equal((await service.next("ev", answered, "ja", false, "actor:a"))?.done, true);
      assert.deepEqual((await service.profile("actor:a", "ev", answered, false, "ja"))!.items.find((entry) => entry.key === "target"), { done: true, key: "target" });
      await service.submit("actor:a", "ev", answered, "ja");
      assert.deepEqual(submitted.at(-1), [{ answer: "紹介", field: "valueOffered", source: "profile" }]);
    } else {
      assert.equal(step?.done, false, "not filled silently: the missing core items are asked");
      assert.deepEqual(asked.at(-1), ["targetAttendees", "valueOffered"]);
      assert.deepEqual([item("target"), item("offer")], [{ done: false, key: "target" }, { done: false, key: "offer" }]);
      await service.submit("actor:a", "ev", all, "ja");
      assert.deepEqual(submitted.at(-1), [], "nothing from the profile is submitted");
    }
  }
});

test("changing a registration: closed, cancelled, rejected and decided ones are refused with a reason the page can show; nothing is written", async () => {
  const { JoinRefusedError } = await import("../../features/events/journey/join");
  const calls: string[] = [];
  const ports = (status: "registered" | "cancelled" | "rejected" | "none", overrides: Partial<JoinPorts> = {}) => fakePorts({ registrationStatus: async () => status, removeIntro: async () => { calls.push("removeIntro"); }, saveIntro: async () => { calls.push("saveIntro"); }, submit: async () => { calls.push("submit"); return { status: "registered", submittedAt: "2026-09-20T05:32:00.000Z" }; }, ...overrides });
  const reason = (expected: string) => (error: unknown) => error instanceof JoinRefusedError && error.reason === expected && error.code === "CONFLICT";
  await assert.rejects(createJoinService({ ports: ports("registered", { now: () => Date.parse("2026-10-04T00:00:00.000Z") }) }).submit("a", "ev", [], "zh", "介绍", true), reason("JOIN_CLOSED"));
  await assert.rejects(createJoinService({ ports: ports("cancelled") }).submit("a", "ev", [], "zh", "介绍", true), reason("JOIN_CANCELLED"));
  await assert.rejects(createJoinService({ ports: ports("rejected") }).submit("a", "ev", [], "zh", "介绍", true), reason("JOIN_REJECTED"));
  assert.deepEqual(calls, []);
  // Without `edit`, a cancelled person registers again as before.
  assert.equal((await createJoinService({ ports: ports("cancelled") }).submit("a", "ev", [], "zh", "介绍"))?.status, "registered");
  assert.equal((await createJoinService({ ports: ports("registered") }).submit("a", "ev", [], "zh", "新的介绍", true))?.status, "registered");
  assert.deepEqual(calls, ["submit", "saveIntro", "submit", "saveIntro"]);
  // The route says why.
  const routes = createEventJourneyRoutes({ liveJoin: async () => createJoinService({ ports: ports("registered", { submit: async () => { throw new JoinRefusedError("JOIN_LOCKED", "decided"); } }) }) as never, liveService: async () => ({}) as never, resolveActor: async () => ({ id: "actor:a" }) as never, resolveMode: () => "live" });
  const response = await routes.joinSubmit(post({ answers: [answer("targetAttendees", "VC", 1)], edit: true, idempotencyKey: "k" }), params);
  assert.equal(response.status, 409);
  assert.equal((await response.json()).error.context.reason, "JOIN_LOCKED");
  for (const key of ["joinClosed", "joinLocked", "joinRejected", "joinCancelled", "joinUpdated"] as const) for (const language of ["ja", "zh", "en"] as const) assert.ok(eventsJourneyCopy[key][language]);
});

test("the line above the questions names no number of questions (it can be more than five)", () => {
  for (const language of ["ja", "zh", "en"] as const) assert.doesNotMatch(eventsJourneyCopy.regPrefilledLine[language], /\d|五|five/i);
  assert.match(eventsJourneyCopy.regPrefilledLine.zh, /只需回答几个问题$/);
});
