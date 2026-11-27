/**
 * 2026-11-26 报名问答：所有文字跟界面语言（?lang → x-orbit-lang → orbit-lang cookie → ja）；主办方题库题按语言显示、
 * 回答存回公开的写法；资料标签预填按语言；主办方的目的 / 话题题计入确认资料；访谈先补目的・话题、不重复问；满 5 题后可补缺项。
 */
import assert from "node:assert/strict";
import test from "node:test";

import { eventJoinStepSchema } from "../../shared/api-schema/event-join";
import { libraryQuestion } from "../../shared/domain/host-question-library";
import type { HostSetupQuestion } from "../../shared/contract/host-console";
import type { EventJoinAnswer } from "../../shared/contract/event-join";
import { JOURNEY_EVENT_ID } from "../../shared/mock/demo-world/events-journey";
import { createEventJourneyRoutes } from "../../features/events/journey/handlers";
import { createJoinService, profileFromAnswers, validHostAnswers, type JoinInterviewPlan, type JoinPorts } from "../../features/events/journey/join";
import { fixedInterviewQuestion, fixedInterviewQuestionText, nextAdaptiveInterviewQuestion } from "../../features/events/registration/adaptive-interview-service";
import { requestContext } from "../../features/plans/v2/flow-handlers";
import { anonymousMicrocache } from "../../features/events/journey/anonymous-microcache";
import { signDerivedJoinAnswers } from "../../features/events/journey/join-live";
import { FIXED_INTERVIEW_QUESTION_MODEL, FIXED_INTERVIEW_QUESTION_PROVIDER } from "../../features/events/registration/adaptive-interview-service";
import { signAdaptiveInterviewQuestion, verifyInterviewResponseSubmissions } from "../../features/events/registration/interview-question-token.server";
import { missingCoreProfileFields } from "../../features/events/registration/interview-response-contract";

const answer = (field: string, value: string, n: number): EventJoinAnswer => ({ answer: value, field, prompt: `q${n}`, questionToken: `t${n}` });

function fakePorts(overrides: Partial<JoinPorts> = {}): JoinPorts {
  return {
    cancel: async () => undefined,
    createSchedule: async () => "sch",
    event: async () => ({ endsAt: "2026-12-07T12:30:00.000Z", registrationClosesAt: "2026-12-03T14:59:00.000Z", review: false, startsAt: "2026-12-07T10:00:00.000Z", title: "CFO Night" }),
    next: async () => null,
    persona: async () => null,
    profileIntro: async () => null,
    readTentative: async () => null,
    registrationStatus: async () => "none",
    removeSchedule: async () => undefined,
    renameSchedule: async () => undefined,
    saveIntro: async () => undefined,
    saveTentative: async () => undefined,
    submit: async () => ({ status: "registered", submittedAt: "2026-11-26T00:00:00.000Z" }),
    ...overrides,
  };
}

test("language: the join route reads the orbit-lang cookie when the call carries no language (Chinese questions for a Chinese page)", async () => {
  const seen: string[] = [];
  const service = createJoinService({ ports: fakePorts({ next: async (_event, _answers, language) => { seen.push(language); return { allowCustom: true, field: "targetAttendees", options: ["投资人", "同行"], prompt: "这次最想认识哪类人？", questionToken: "t" }; } }) });
  const routes = createEventJourneyRoutes({ liveJoin: async () => service, liveService: async () => ({}) as never, resolveActor: async () => ({ id: "actor:a" }) as never, resolveMode: () => "live" });
  const call = (headers: Record<string, string>, url = "http://localhost/x") => routes.joinNext(new Request(url, { body: JSON.stringify({ answers: [] }), headers: { "content-type": "application/json", ...headers }, method: "POST" }), { params: Promise.resolve({ id: "ev" }) });
  const zh = eventJoinStepSchema.parse((await (await call({ cookie: "a=1; orbit-lang=zh" })).json()).data);
  assert.equal(seen.at(-1), "zh");
  assert.equal(zh.question?.help, "同场参会者也能看到（可多选）", "help text in Chinese too");
  await call({ cookie: "orbit-lang=zh", "x-orbit-lang": "en" });
  assert.equal(seen.at(-1), "en", "the header beats the cookie");
  await call({ cookie: "orbit-lang=zh" }, "http://localhost/x?lang=ja");
  assert.equal(seen.at(-1), "ja", "?lang beats both");
  await call({});
  assert.equal(seen.at(-1), "ja", "nothing → ja");
});

test("plans requestContext: same order (?lang → x-orbit-lang → cookie → ja); platform unchanged", () => {
  const ctx = (url: string, headers: Record<string, string> = {}) => requestContext(new Request(url, { headers }));
  assert.deepEqual(ctx("http://x/api?lang=en", { cookie: "orbit-lang=zh", "x-orbit-lang": "ja" }), { language: "en", platform: "web" });
  assert.deepEqual(ctx("http://x/api", { cookie: "orbit-lang=zh", "x-orbit-lang": "ja", "x-orbit-platform": "app" }), { language: "ja", platform: "app" });
  assert.deepEqual(ctx("http://x/api", { cookie: "orbit-lang=zh" }), { language: "zh", platform: "web" });
  assert.deepEqual(ctx("http://x/api", { cookie: "session=1" }), { language: "ja", platform: "web" });
  assert.deepEqual(ctx("http://x/api", { "x-orbit-lang": "zh-CN" }), { language: "zh", platform: "web" });
});

test("anonymous microcache keeps a cookie-only language apart", async () => {
  const cached = anonymousMicrocache({ ttlMs: 60_000 });
  let loads = 0;
  const load = async () => { loads += 1; return new Response("{}", { status: 200 }); };
  await cached(new Request("http://x/api/events/e/overview", { headers: { cookie: "orbit-lang=zh" } }), load);
  await cached(new Request("http://x/api/events/e/overview", { headers: { cookie: "orbit-lang=ja" } }), load);
  await cached(new Request("http://x/api/events/e/overview", { headers: { cookie: "orbit-lang=zh" } }), load);
  assert.equal(loads, 2);
});

test("host questions: a library question shows in the page language; an answer in any language is kept as the published option", async () => {
  const published = [libraryQuestion("lib-purpose", "ja")!, { id: "custom-1", kind: "single", options: ["はい", "いいえ"], prompt: "懇親会に出ますか？", required: true } satisfies HostSetupQuestion];
  const saved: Record<string, string>[] = [];
  const service = createJoinService({ ports: fakePorts({ hostQuestions: async () => published, saveHostAnswers: async (_actor, _event, answers) => { saved.push({ ...answers }); } }) });
  const first = (await service.next("ev", [], "zh"))?.question;
  assert.equal(first?.prompt, "参加这次活动的目的是？（可多选）");
  assert.ok(first?.options.includes("扩展人脉") && first.multi);
  const second = (await service.next("ev", [answer("host:lib-purpose", "扩展人脉 · 收集信息", 1)], "zh"))?.question;
  assert.deepEqual([second?.prompt, second?.options], ["懇親会に出ますか？", ["はい", "いいえ"]], "the host's own question stays as written");
  await service.submit("actor:a", "ev", [answer("host:lib-purpose", "扩展人脉 · 收集信息", 1), answer("host:custom-1", "はい", 2)], "zh");
  assert.deepEqual(saved, [{ "custom-1": "はい", "lib-purpose": "人脈を広げたい · 情報収集" }], "stored as the published (host-language) options");
  // English answers, a whole option, junk dropped, a single-choice host question still single.
  assert.deepEqual(validHostAnswers(published, [answer("host:lib-purpose", "To learn · nonsense", 1)]), { "lib-purpose": "学びたい" });
  assert.deepEqual(validHostAnswers(published, [answer("host:custom-1", "Yes", 1)]), {}, "a host-written question only takes its own options");
  // A library question the host edited keeps its own wording everywhere.
  const edited = [{ ...libraryQuestion("lib-topic", "ja")!, prompt: "今日いちばん話したいことは？" }];
  const shown = (await createJoinService({ ports: fakePorts({ hostQuestions: async () => edited }) }).next("ev", [], "en"))?.question;
  assert.equal(shown?.prompt, "今日いちばん話したいことは？");
  assert.deepEqual(validHostAnswers(edited, [answer("host:lib-topic", "Fundraising", 1)]), {}, "an edited question is not translated, so only its own options count");
});

test("prefill: profile tags show in the page language (any language version of a known tag); own tags stay", async () => {
  const service = createJoinService({ ports: fakePorts({
    next: async () => ({ allowCustom: true, field: "targetAttendees", options: ["同行"], prompt: "?", questionToken: "t" }),
    profileTags: async () => ({ offering: [], seeking: ["投資家", "Co-founders", "做跨境的朋友"] }),
  }) });
  const question = (await service.next("ev", [], "zh", false, "actor:a"))?.question;
  assert.deepEqual(question?.prefill, ["投资人", "联合创始人", "做跨境的朋友"]);
  assert.deepEqual(question?.options, ["投资人", "联合创始人", "做跨境的朋友", "同行"]);
});

test("profile: host purpose / topic answers fill 参会目的 / 想聊的话题 (by question id); topics show as chips", () => {
  const profile = profileFromAnswers([answer("host:lib-purpose", "扩展人脉", 1), answer("host:lib-topic", "融资 · 海外拓展 · 其他", 2), answer("host:lib-role", "学生", 3)], { review: false });
  assert.deepEqual(profile.items.filter((item) => item.done).map((item) => item.key), ["company", "purpose", "topics"]);
  assert.equal(profile.coverage, 72);
  assert.deepEqual(profile.topics, ["融资", "海外拓展"]);
  assert.equal(profileFromAnswers([answer("host:lib-meet", "投资人", 1), answer("host:lib-offer", "投资", 2)], { review: false }).coverage, 72);
});

test("interview plan (2026-11-27): covered items are skipped; when the questions left are no more than the uncovered items, each one targets an uncovered item (core first); no 6th question", async () => {
  const plans: (JoinInterviewPlan | undefined)[] = [];
  const service = createJoinService({ ports: fakePorts({
    hostQuestions: async () => [libraryQuestion("lib-role", "ja")!, libraryQuestion("lib-industry", "ja")!, libraryQuestion("lib-purpose", "ja")!],
    next: async (_event, _answers, _language, _more, plan) => { plans.push(plan); const field = plan?.focusFields?.[0] ?? "targetAttendees"; return { allowCustom: true, field, options: ["a", "b"], prompt: "?", questionToken: `t-${field}` }; },
  }) });
  const host = [answer("host:lib-role", "学生", 1), answer("host:lib-industry", "教育", 2), answer("host:lib-purpose", "学习", 3)];
  // 2 questions left, 3 items uncovered (会いたい人・提供できること・話題) → the 4th question must be 会いたい人.
  const fourth = await service.next("ev", host, "zh");
  assert.deepEqual(plans.at(-1), { focusFields: ["targetAttendees"] });
  assert.deepEqual([fourth?.question?.field, fourth?.index, fourth?.total], ["targetAttendees", 4, 5]);
  const fifth = await service.next("ev", [...host, answer("targetAttendees", "投资人", 4)], "zh");
  assert.deepEqual(plans.at(-1), { focusFields: ["valueOffered"] }, "then 提供できること, before 話題");
  assert.equal(fifth?.question?.field, "valueOffered");
  const five = [...host, answer("targetAttendees", "投资人", 4), answer("valueOffered", "经验", 5)];
  const callsBefore = plans.length;
  assert.equal((await service.next("ev", five, "zh"))?.done, true, "5 answers → the review, even with 話題 still blank");
  assert.equal((await service.next("ev", five, "zh", true))?.done, true, "an old client's 「追加」 (more) gets done, not a 6th question");
  assert.equal(plans.length, callsBefore, "the interview is not asked again");
});

test("interview plan: with room to spare the interview chooses freely and profile-covered items are skipped", async () => {
  const plans: (JoinInterviewPlan | undefined)[] = [];
  const service = createJoinService({ ports: fakePorts({
    next: async (_event, _answers, _language, _more, plan) => { plans.push(plan); return { allowCustom: true, field: "desiredOutcome", options: ["a", "b"], prompt: "?", questionToken: "t" }; },
    profileTags: async () => ({ offering: ["業界経験"], seeking: [] }),
  }) });
  await service.next("ev", [], "zh", false, "actor:a");
  assert.deepEqual(plans.at(-1)?.skipFields, ["positioning", "industry", "valueOffered"], "提供できること comes from the profile, not asked again");
  assert.equal(plans.at(-1)?.focusFields, undefined);
});

test("sample route: past 5 answers no 6th question; the review's optional 「追加」 (focus) asks that one item", async () => {
  const routes = createEventJourneyRoutes({ resolveActor: async () => ({ id: "actor:a" }) as never, resolveMode: () => "mock" });
  const post = (body: unknown) => new Request("http://localhost/x", { body: JSON.stringify(body), headers: { "content-type": "application/json" }, method: "POST" });
  const params = { params: Promise.resolve({ id: JOURNEY_EVENT_ID }) };
  const five = ["desiredOutcome", "experienceHighlight", "targetAttendees", "followUpPreference", "energyStyle"].map((field, n) => answer(field, "x", n));
  const done = eventJoinStepSchema.parse((await (await routes.joinNext(post({ answers: five, more: true }), params)).json()).data);
  assert.deepEqual([done.done, done.question], [true, null]);
  const step = eventJoinStepSchema.parse((await (await routes.joinNext(post({ answers: five, focus: "offer", more: true }), params)).json()).data);
  assert.deepEqual([step.done, step.question?.field], [false, "valueOffered"]);
});

test("interview service: with a join plan, purpose / topics come right after the two core questions; skipped and focused fields are honoured", async () => {
  const event = { description: "", relationshipContext: "", title: "T", venue: "V" } as never;
  let remaining: string[] = [];
  const modelRunner = (async (input: { userText: string }) => {
    remaining = JSON.parse(input.userText).remainingFields;
    return { model: "m", provider: "p", success: true, text: JSON.stringify({ acknowledgment: "", field: remaining[0], options: ["a", "b"], prompt: "这是下一道问题吗？" }) };
  }) as never;
  const turn = (field: string) => ({ answer: "x", field, prompt: "q" }) as never;
  await nextAdaptiveInterviewQuestion({ event, language: "zh", modelRunner, plan: { skipFields: ["positioning", "industry"] }, transcript: [turn("targetAttendees"), turn("valueOffered")] });
  assert.deepEqual(remaining, ["desiredOutcome", "experienceHighlight"]);
  await nextAdaptiveInterviewQuestion({ event, language: "zh", modelRunner, plan: { skipFields: ["positioning", "industry", "desiredOutcome"] }, transcript: [turn("targetAttendees"), turn("valueOffered")] });
  assert.deepEqual(remaining, ["experienceHighlight"]);
  await nextAdaptiveInterviewQuestion({ event, language: "zh", modelRunner, transcript: [turn("targetAttendees"), turn("valueOffered")] });
  assert.ok(remaining.includes("positioning") && remaining.includes("energyStyle"), "without a plan (other callers) the choice stays open");
  const fiveTurns = ["targetAttendees", "valueOffered", "desiredOutcome", "energyStyle", "followUpPreference"].map(turn);
  assert.equal((await nextAdaptiveInterviewQuestion({ event, language: "zh", modelRunner, transcript: fiveTurns })).done, true);
  const focused = await nextAdaptiveInterviewQuestion({ event, language: "zh", modelRunner, plan: { focusFields: ["experienceHighlight"] }, transcript: fiveTurns });
  assert.deepEqual([focused.done, focused.question?.field], [false, "experienceHighlight"]);
  // Fixed fallback: same skips / focus, in the page language.
  const fixed = fixedInterviewQuestion({ language: "zh", plan: { skipFields: ["desiredOutcome"] }, reason: "AI_LIMIT", transcript: [turn("targetAttendees"), turn("valueOffered")] });
  assert.deepEqual([fixed.question?.field, fixed.question?.prompt], ["experienceHighlight", "你想和别人聊哪些话题？"]);
  assert.equal(fixedInterviewQuestion({ language: "ja", plan: { focusFields: ["experienceHighlight"] }, reason: "x", transcript: fiveTurns }).question?.prompt, "どんな話題で話したいですか？");
});


// ---- 2026-11-27 用户反馈：5 题内按覆盖出题；任何主办方题 / 资料组合、AI 正常 / 不出 / 偏题，都不出第 6 题、提交都成功 ----
const SECRET = "s".repeat(32);
const ITEM_KEYS = ["target", "offer", "purpose", "topics"] as const;
const HOST_ITEM: Record<string, (typeof ITEM_KEYS)[number] | undefined> = { "lib-meet": "target", "lib-offer": "offer", "lib-purpose": "purpose", "lib-topic": "topics" };
type AiMode = "normal" | "empty" | "offTopic" | "throws";

async function walkAndSubmit(hostIds: readonly string[], tags: { seeking: string[]; offering: string[] } | null, review: boolean, ai: AiMode = "normal") {
  const signFixed = (field: string, prompt: string, options: readonly string[]) => signAdaptiveInterviewQuestion({ actorId: "actor:a", eventId: "ev", language: "zh", secret: SECRET,
    question: { acknowledgment: "", field: field as never, options: [...options], prompt, provenance: { fallbackReason: "AI_LIMIT", generationMethod: "deterministic-fallback", model: FIXED_INTERVIEW_QUESTION_MODEL, provider: FIXED_INTERVIEW_QUESTION_PROVIDER } } });
  const fixedFor = (field: string) => { const text = fixedInterviewQuestionText(field as never, "zh")!; return { allowCustom: true, field, options: [...text.options], prompt: text.prompt, questionToken: signFixed(field, text.prompt, text.options) }; };
  let submitted: { answer: string; questionToken: string }[] = [];
  let aiCalls = 0;
  const service = createJoinService({ ports: fakePorts({
    event: async () => ({ endsAt: null, registrationClosesAt: "2026-12-03T14:59:00.000Z", review, startsAt: "2026-12-07T10:00:00.000Z", title: "T" }),
    hostQuestions: async () => hostIds.map((id) => libraryQuestion(id, "ja")!),
    // The interview stub: normal = the fixed questions honouring the plan (like the live route); empty = never a question;
    // offTopic = always 交流スタイル (a field the plan did not ask for).
    next: async (_event, answers, language, _more, plan) => {
      aiCalls += 1;
      if (ai === "empty") return null;
      if (ai === "throws") throw Object.assign(new Error("interview unavailable"), { status: 503 });
      if (ai === "offTopic") return fixedFor("energyStyle");
      const step = fixedInterviewQuestion({ language, plan: plan as never, reason: "AI_LIMIT", transcript: answers.map((item) => ({ answer: item.answer, field: item.field as never, prompt: item.prompt })) });
      return step.question ? fixedFor(step.question.field) : null;
    },
    fixedQuestion: async (_actor, _event, field) => fixedFor(field),
    profileTags: async () => tags,
    submit: async (_event, answers, from) => {
      submitted = [...answers.map((item) => ({ answer: item.answer, questionToken: item.questionToken })), ...(from?.derived ? await signDerivedJoinAnswers({ actorId: "actor:a", derived: from.derived, eventId: "ev", language: from.language, secret: SECRET }) : [])];
      return { status: review ? "pending_review" : "registered", submittedAt: "2026-11-26T00:00:00.000Z" };
    },
  }) });
  const answers: EventJoinAnswer[] = [];
  for (let guard = 0; guard < 12; guard += 1) {
    const step = await service.next("ev", answers, "zh", false, "actor:a");
    if (!step || step.done || !step.question) break;
    const value = step.question.prefill?.length ? step.question.prefill.join(" · ") : step.question.options[0]!;
    answers.push({ answer: value, field: step.question.field, prompt: step.question.prompt, questionToken: step.question.questionToken });
  }
  const after = await service.next("ev", answers, "zh", true, "actor:a");
  // The review asks for the profile with the intro draft once the questions are done (RegisterFlow draftIntro).
  const profile = await service.profile("actor:a", "ev", answers, true, "zh");
  const result = await service.submit("actor:a", "ev", answers, "zh");
  // (Live adds the profile facts 立場 / 業界 to every submission, so it is never empty; here nothing signed = nothing to verify.)
  const verified = submitted.length ? verifyInterviewResponseSubmissions({ actorId: "actor:a", eventId: "ev", responses: submitted, secret: SECRET }) : [];
  return { after, aiCalls, answers, fields: verified.map((item) => item.field), missingCore: missingCoreProfileFields(verified), profile, result };
}

/** 应当留空的项：主办方题与资料都没覆盖的项（核心在前），减去主办方题之后剩下的题数能问到的。 */
function expectedBlank(hostIds: readonly string[], tags: { seeking: string[]; offering: string[] } | null): string[] {
  const covered = new Set(hostIds.map((id) => HOST_ITEM[id]).filter(Boolean));
  if (tags?.seeking.length) covered.add("target");
  if (tags?.offering.length) covered.add("offer");
  const uncovered = ITEM_KEYS.filter((item) => !covered.has(item));
  return uncovered.slice(Math.max(0, 5 - hostIds.length));
}

function combos<T>(pool: readonly T[], max: number): T[][] {
  const out: T[][] = [[]];
  for (const item of pool) for (const combo of [...out]) if (combo.length < max) out.push([...combo, item]);
  return out;
}

test("every host question set × profile × AI (normal / empty / off-topic / down): at most 5 questions, no 6th, items covered core first, the submission goes through", async () => {
  const pool = ["lib-role", "lib-industry", "lib-meet", "lib-offer", "lib-purpose", "lib-topic", "lib-source"];
  const profiles = [null, { offering: ["業界経験"], seeking: ["投資家"] }, { offering: [], seeking: ["投資家"] }, { offering: ["業界経験"], seeking: [] }];
  let runs = 0;
  for (const hostIds of combos(pool, 5)) {
    for (const tags of profiles) {
      for (const ai of ["normal", "empty", "offTopic", "throws"] as const) {
        const review = runs % 2 === 1;
        const run = await walkAndSubmit(hostIds, tags, review, ai);
        const label = `${hostIds.join(",") || "no host"} / tags ${JSON.stringify(tags)} / ${ai}`;
        assert.ok(run.answers.length <= 5, `≤ 5 questions: ${label}`);
        assert.equal(run.after?.done, true, `no 6th question: ${label}`);
        assert.equal(run.result?.status, review ? "pending_review" : "registered", label);
        const blank = run.profile?.items.filter((item) => !item.done).map((item) => item.key) ?? [];
        assert.deepEqual(blank, ITEM_KEYS.filter((item) => expectedBlank(hostIds, tags).includes(item)).sort((a, b) => ["company", "purpose", "topics", "target", "offer"].indexOf(a) - ["company", "purpose", "topics", "target", "offer"].indexOf(b)), `blank items: ${label}`);
        assert.equal(new Set(run.fields).size, run.fields.length, `no field twice: ${label}`);
        runs += 1;
      }
    }
  }
  assert.ok(runs > 1000);
});

test("whenever the questions left can cover the four items, the review is 100 % (the usual case)", async () => {
  for (const hostIds of [[], ["lib-meet"], ["lib-role"], ["lib-role", "lib-offer"], ["lib-meet", "lib-offer", "lib-purpose", "lib-topic"]]) {
    for (const ai of ["normal", "empty", "offTopic", "throws"] as const) {
      const run = await walkAndSubmit(hostIds, null, false, ai);
      assert.equal(run.profile?.coverage, 100, `${hostIds.join(",")} / ${ai}`);
      assert.deepEqual(run.missingCore, []);
    }
  }
});

test("the reported case: a single lib-meet no longer drops 会いたい人 from the submission", async () => {
  const run = await walkAndSubmit(["lib-meet"], null, false);
  assert.ok(run.fields.includes("targetAttendees"));
  assert.ok(!run.answers.some((item) => item.field === "targetAttendees"), "not asked again — the host answer is signed instead");
});

test("5 host questions covering nothing: profile tags fill the core items; without tags the registration still goes through with them blank", async () => {
  const hosts = ["lib-role", "lib-industry", "lib-company-stage", "lib-language", "lib-source"];
  const withTags = await walkAndSubmit(hosts, { offering: ["業界経験"], seeking: ["投資家"] }, false);
  assert.equal(withTags.answers.length, 5);
  assert.deepEqual(withTags.missingCore, []);
  const without = await walkAndSubmit(hosts, null, true);
  assert.equal(without.answers.length, 5, "no 6th question");
  assert.deepEqual(without.missingCore, ["targetAttendees", "valueOffered"]);
  assert.equal(without.result?.status, "pending_review", "accepted with the blanks");
});

test("the review's optional 「追加」 (focus) always gets a question for that item, even when the interview is down or off-topic", async () => {
  for (const next of [async () => null, async () => { throw new Error("down"); }, async () => ({ allowCustom: true, field: "energyStyle", options: ["a", "b"], prompt: "?", questionToken: "t" })]) {
    const service = createJoinService({ ports: fakePorts({ fixedQuestion: async (_actor, _event, field) => ({ allowCustom: true, field, options: ["A", "B"], prompt: "固定", questionToken: `fixed-${field}` }), next: next as never }) });
    const five = ["desiredOutcome", "experienceHighlight", "targetAttendees", "followUpPreference", "energyStyle"].map((field, n) => answer(field, "x", n));
    const step = await service.next("ev", five, "ja", true, "actor:a", "offer");
    assert.deepEqual([step?.done, step?.question?.field, step?.question?.questionToken], [false, "valueOffered", "fixed-valueOffered"]);
  }
});
