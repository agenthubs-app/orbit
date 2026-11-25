/**
 * 2026-11-26 报名问答七处设计改动（实走三场后）：不替用户编经历；「想聊的话题」真问话题；资料先选上（题库题按选项位置）；
 * 强项各自一个选项并去重；问法一题一问、不寒暄、用「你」；话题 chip 只放话题；公开范围写全。另：先到先得的完成页、答题前进度。
 */
import assert from "node:assert/strict";
import test from "node:test";

import { eventsJourneyCopy } from "../../app/(app)/app/orbit-2026/copy/eventsJourney";
import type { EventJoinAnswer } from "../../shared/contract/event-join";
import { hostQuestionProfilePrefill, libraryQuestion } from "../../shared/domain/host-question-library";
import { createJoinService, profileFromAnswers, type JoinInterviewPlan, type JoinPorts, type JoinProfileTags } from "../../features/events/journey/join";
import { AdaptiveInterviewGenerationError, fixedInterviewQuestion, generateEventPersona, nextAdaptiveInterviewQuestion, questionTextAcceptable, unsupportedClaim } from "../../features/events/registration/adaptive-interview-service";

const answer = (field: string, value: string, n: number): EventJoinAnswer => ({ answer: value, field, prompt: `q${n}`, questionToken: `t${n}` });
const event = { description: "日中企业法务讲座", relationshipContext: "", title: "跨境法务讲座", venue: "東京" } as never;
const turn = (field: string, value = "x") => ({ answer: value, field, prompt: "q" }) as never;

function fakePorts(overrides: Partial<JoinPorts> = {}): JoinPorts {
  return {
    cancel: async () => undefined,
    createSchedule: async () => "sch",
    event: async () => ({ endsAt: null, registrationClosesAt: "2026-12-03T14:59:00.000Z", review: false, startsAt: "2026-12-07T10:00:00.000Z", title: "T" }),
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

function stubModel(reply: Record<string, unknown>, seen?: { system?: string; user?: string }) {
  return (async (input: { systemInstruction: string; userText: string }) => {
    if (seen) { seen.system = input.systemInstruction; seen.user = input.userText; }
    return { model: "m", provider: "p", success: true, text: JSON.stringify(reply) };
  }) as never;
}

test("1. options never claim the person's experience; the prompt says so; the self-introduction keeps to what was said", async () => {
  const seen: { system?: string } = {};
  await assert.rejects(nextAdaptiveInterviewQuestion({ event, language: "zh", modelRunner: stubModel({ acknowledgment: "", field: "valueOffered", options: ["处理过跨境合同纠纷", "搭建过个人信息合规体系"], prompt: "你能给别人提供什么帮助？" }, seen), plan: {}, transcript: [turn("targetAttendees")] }), AdaptiveInterviewGenerationError);
  assert.match(seen.system ?? "", /Options never state facts about the person/);
  await assert.rejects(nextAdaptiveInterviewQuestion({ event, language: "zh", modelRunner: stubModel({ acknowledgment: "", field: "experienceHighlight", options: ["跨境合同", "个人信息合规"], prompt: "你最想分享的一段实战经历是什么？" }), plan: {}, transcript: [turn("targetAttendees"), turn("valueOffered")] }), AdaptiveInterviewGenerationError, "asking for their experience is refused (the join page then asks the fixed question)");
  const ok = await nextAdaptiveInterviewQuestion({ event, language: "zh", modelRunner: stubModel({ acknowledgment: "", field: "valueOffered", options: ["法务咨询", "介绍客户"], prompt: "你能给认识的人提供什么帮助？" }), plan: {}, transcript: [turn("targetAttendees")] });
  assert.deepEqual(ok.question?.options, ["法务咨询", "介绍客户"]);
  // Persona: a specialty the person never stated drops the draft (the page falls back to the profile intro).
  assert.equal(unsupportedClaim("我是律所顾问，专注协助日企进入中国市场。", "想认识日企法务\n协助日企进入中国市场"), true);
  assert.equal(unsupportedClaim("我专注跨境并购。", "我专注跨境并购"), false);
  const persona = { energyStyle: "主动交流", industryTags: ["法律"], offering: "可以提供法务咨询", openers: ["你好", "最近在忙什么"], seeking: "想认识日企的法务负责人", tagline: "律所顾问", tags: ["法务", "跨境", "日企"] };
  const drafted = await generateEventPersona({ event, language: "zh", modelRunner: stubModel({ ...persona, selfIntroDraft: "我是律所顾问，专注协助日企进入中国市场，欢迎交流。", topics: ["跨境合规"] }), transcript: [turn("targetAttendees", "日企法务"), turn("experienceHighlight", "跨境合规")] });
  assert.equal(drafted.selfIntroDraft, undefined);
  assert.deepEqual(drafted.topics, ["跨境合规"]);
  const plain = await generateEventPersona({ event, language: "zh", modelRunner: stubModel({ ...persona, selfIntroDraft: "我是律所顾问，想认识日企的法务负责人，聊聊跨境合规。" }), transcript: [turn("targetAttendees", "日企法务")] });
  assert.equal(plain.selfIntroDraft, "我是律所顾问，想认识日企的法务负责人，聊聊跨境合规。");
});

test("2. 「想聊的话题」 asks topics: the field meaning in the prompt, the fixed question, and profile topics preselected (≤ 2)", async () => {
  const seen: { system?: string; user?: string } = {};
  await nextAdaptiveInterviewQuestion({ event, language: "zh", modelRunner: stubModel({ acknowledgment: "", field: "experienceHighlight", options: ["跨境合规", "数据出境"], prompt: "这次想聊哪些话题？" }, seen), plan: { knownOptions: { experienceHighlight: ["生成式 AI"] } }, transcript: [turn("targetAttendees"), turn("valueOffered")] });
  assert.match(seen.system ?? "", /experienceHighlight: which topics they want to talk about at THIS event/);
  assert.deepEqual(JSON.parse(seen.user ?? "{}").knownOptions, { experienceHighlight: ["生成式 AI"] });
  for (const language of ["ja", "zh", "en"] as const) {
    const fixed = fixedInterviewQuestion({ language, plan: { focusFields: ["experienceHighlight"] }, reason: "x", transcript: [] });
    assert.match(fixed.question?.prompt ?? "", /話題|话题|topics/);
  }
  const service = createJoinService({ ports: fakePorts({
    next: async () => ({ allowCustom: true, field: "experienceHighlight", options: ["跨境合规", "数据出境"], prompt: "这次想聊哪些话题？", questionToken: "t" }),
    profileTags: async () => ({ offering: [], seeking: [], topics: ["日本市場", "Generative AI", "Web3"] }),
  }) });
  const question = (await service.next("ev", [], "zh", false, "actor:a"))?.question;
  assert.deepEqual(question?.prefill, ["日本市场", "生成式 AI"], "in the page language, at most the question's limit");
  assert.deepEqual(question?.options.slice(0, 3), ["日本市场", "生成式 AI", "Web3"]);
});

test("3. host library questions: the profile preselects lib-role / lib-purpose / lib-topic by option position; nothing when it does not fit", async () => {
  const facts = { goalIds: ["funding", "customers"], industryId: "professional_services", secondaryIndustryId: "professional_services.legal", seniority: "manager", topicKeys: ["生成式 AI", "Web3"] };
  const role = libraryQuestion("lib-role", "zh")!;
  assert.deepEqual(hostQuestionProfilePrefill(role, facts).map((i) => role.options[i]), ["专业服务、顾问"]);
  assert.deepEqual(hostQuestionProfilePrefill(role, { seniority: "founder" }).map((i) => role.options[i]), ["创业者、经营者"]);
  assert.deepEqual(hostQuestionProfilePrefill(role, {}), [], "no basis → nothing selected");
  const purpose = libraryQuestion("lib-purpose", "ja")!;
  assert.deepEqual(hostQuestionProfilePrefill(purpose, facts).map((i) => purpose.options[i]), ["資金調達のため", "商談・協業先を探したい"]);
  assert.deepEqual(hostQuestionProfilePrefill(purpose, { goalIds: ["awareness"] }), []);
  const topic = libraryQuestion("lib-topic", "en")!;
  assert.deepEqual(hostQuestionProfilePrefill(topic, facts).map((i) => topic.options[i]), ["AI and digital transformation"], "Web3 has no close option");
  assert.deepEqual(hostQuestionProfilePrefill({ ...role, prompt: "あなたは？" }, facts), [], "an edited question is not preselected");
  // Through the service: shown in the page language, preselected; the user can still pick anything.
  const tags: JoinProfileTags = { goalIds: ["funding"], industryId: "professional_services", offering: [], seeking: [], seniority: "manager", topics: [] };
  const service = createJoinService({ ports: fakePorts({ hostQuestions: async () => [libraryQuestion("lib-role", "ja")!, libraryQuestion("lib-purpose", "ja")!], profileTags: async () => tags }) });
  const first = (await service.next("ev", [], "zh", false, "actor:a"))?.question;
  assert.deepEqual(first?.prefill, ["专业服务、顾问"]);
  const second = (await service.next("ev", [answer("host:lib-role", "专业服务、顾问", 1)], "zh", false, "actor:a"))?.question;
  assert.deepEqual(second?.prefill, ["为了融资"]);
  // The interview's own 目的 question: the profile goals preselected.
  const ai = createJoinService({ ports: fakePorts({ next: async () => ({ allowCustom: true, field: "desiredOutcome", options: ["找到客户", "了解行业"], prompt: "这次最想有什么收获？", questionToken: "t" }), profileTags: async () => ({ ...tags, goalIds: ["customers", "research"] }) }) });
  const goal = (await ai.next("ev", [], "zh", false, "actor:a"))?.question;
  assert.deepEqual(goal?.prefill, ["获取客户", "学习行业趋势"]);
});

test("4. strengths: one option each, all preselected; AI options that repeat them are dropped; the interview is told what is already there", async () => {
  let plan: JoinInterviewPlan | undefined;
  const service = createJoinService({ ports: fakePorts({
    next: async (_e, _a, _l, _m, p) => { plan = p; return { allowCustom: true, field: "valueOffered", options: ["渠道与客户引荐", "Customer introductions", "技术支持"], prompt: "你能提供什么帮助？", questionToken: "t" }; },
    profileTags: async () => ({ offering: ["客户引荐", "Industry expertise", "法务财税咨询", "人才推荐"], seeking: [] }),
  }) });
  const question = (await service.next("ev", [], "zh", false, "actor:a"))?.question;
  assert.deepEqual(question?.options, ["客户引荐", "行业经验", "法务财税咨询", "人才推荐", "技术支持"]);
  assert.deepEqual(question?.prefill, ["客户引荐", "行业经验", "法务财税咨询", "人才推荐"], "the 4th strength is selected too");
  assert.equal(question?.multi, true);
  assert.deepEqual(plan?.knownOptions?.valueOffered, ["客户引荐", "行业经验", "法务财税咨询", "人才推荐"]);
});

test("5. one question, one sentence, no greeting or service-speak, 你 not 您", () => {
  assert.equal(questionTextAcceptable("欢迎参加本次讲座。为了帮你精准对接，你最希望认识哪类人？", ["律师", "企业法务"]), false);
  assert.equal(questionTextAcceptable("你最想认识哪类人？你能提供什么？", ["a", "b"]), false);
  assert.equal(questionTextAcceptable("您最想认识哪类人？", ["a", "b"]), false);
  assert.equal(questionTextAcceptable("Welcome! Who would you like to meet?", ["a", "b"]), false);
  assert.equal(questionTextAcceptable("ご参加ありがとうございます。誰に会いたいですか？", ["a", "b"]), false);
  assert.equal(questionTextAcceptable("这次最想认识哪类人？", ["律师", "企业法务"]), true);
  assert.equal(questionTextAcceptable("どんな人に会いたいですか？", ["弁護士", "法務担当"]), true);
  assert.equal(questionTextAcceptable("Who would you most like to meet?", ["Lawyers", "In-house counsel"]), true);
});

test("6. topic chips only hold topics: no strengths, goals or who-to-meet, even when the persona mixes them in", async () => {
  const answers = [answer("valueOffered", "日本市场资源 · 客户引荐", 1), answer("desiredOutcome", "商谈合作", 2), answer("experienceHighlight", "海外拓展", 3), answer("host:lib-topic", "融资", 4)];
  const profile = profileFromAnswers(answers, { personaTopics: ["客户引荐", "法务财税", "跨境合规"], review: false });
  assert.deepEqual(profile.topics, ["海外拓展", "融资", "法务财税", "跨境合规"]);
  const service = createJoinService({ ports: fakePorts({ persona: async () => ({ selfIntroDraft: "我想聊海外拓展。", tags: ["客户引荐", "日本市场资源"], topics: ["跨境合规"] }) }) });
  const drafted = await service.profile("actor:a", "ev", answers, true, "zh");
  assert.deepEqual(drafted?.topics, ["海外拓展", "融资", "跨境合规"], "persona tags are not topics");
});

test("7. visibility line lists what you offer (three languages), matching the field rules", async () => {
  const { registrationFieldVisibility } = await import("../../features/events/registration/interview-question-token.server");
  assert.equal(registrationFieldVisibility("valueOffered"), "event_attendees");
  assert.equal(registrationFieldVisibility("industry"), "event_attendees");
  assert.equal(registrationFieldVisibility("desiredOutcome"), "matching_only");
  assert.match(eventsJourneyCopy.visAllFields.zh, /能提供的/);
  assert.match(eventsJourneyCopy.visAllFields.ja, /提供できること/);
  assert.match(eventsJourneyCopy.visAllFields.en, /what you offer/);
  assert.match(eventsJourneyCopy.visOrgFields.zh, /参加目的 · 想见的人/);
});

test("first-come registration: confirmed flow copy exists in three languages; the calendar line has no 「result」 wording", () => {
  for (const key of ["flowConfirmed", "flowConfirmedSub", "calendarLineFinal"] as const) for (const language of ["ja", "zh", "en"] as const) assert.ok(eventsJourneyCopy[key][language]);
  assert.doesNotMatch(eventsJourneyCopy.calendarLineFinal.zh, /结果/);
});

test("progress: profile strengths do not count before the questions are done (44 %, not 72 %); after 5 they fill the core items", async () => {
  const service = createJoinService({ ports: fakePorts({ profileTags: async () => ({ offering: ["客户引荐"], seeking: ["投资人"] }) }) });
  assert.equal((await service.profile("actor:a", "ev", [], false, "zh"))?.coverage, 44);
  const five = ["lib-role", "lib-industry", "lib-company-stage", "lib-language", "lib-source"].map((id, n) => answer(`host:${id}`, "x", n));
  const after = await service.profile("actor:a", "ev", five, false, "zh");
  assert.deepEqual(after?.items.filter((item) => item.done).map((item) => item.key), ["company", "target", "offer"]);
});
