import assert from "node:assert/strict";
import test from "node:test";

import type { EventOperationsParticipant } from "../../features/events/event-operations/contract";
import { buildDeterministicCandidates } from "../../features/events/event-operations/candidate-retrieval";
import { needConcept, offerAnswersNeed, offerConcept, topicsShare } from "../../features/events/event-operations/match-concepts";
import { matchingParticipant, splitAnswerTerms } from "../../features/events/event-operations/matching-profile";

function card(id: string, overrides: Partial<EventOperationsParticipant> = {}): EventOperationsParticipant {
  return {
    actorId: `user_${id}`,
    company: null,
    displayName: id,
    energyStyle: null,
    evidenceIds: [],
    experienceHighlight: null,
    industry: null,
    languages: [],
    lateRegistration: false,
    needs: [],
    offers: [],
    participantId: `participant_${id}`,
    profileCompleteness: "partial",
    role: null,
    seniority: null,
    topics: [],
    ...overrides,
  };
}

test("a multiple-choice answer joined by · splits into its options, and an option label keeps its own 、", () => {
  assert.deepEqual(splitAnswerTerms("创业者、经营者 · 同行业的人 · 投资人"), ["创业者", "经营者", "同行业的人", "投资人"]);
  assert.deepEqual(splitAnswerTerms("专业人士（律师、顾问等） · 研究人员"), ["专业人士（律师、顾问等）", "研究人员"]);
  assert.deepEqual(splitAnswerTerms("事業パートナー / 共同創業者"), ["事業パートナー / 共同創業者"]);
  assert.deepEqual(splitAnswerTerms("SNS運用, PR"), ["SNS運用", "PR"]);
  assert.deepEqual(splitAnswerTerms(null), []);
});

test("registration people-types and goals map to concepts the program can match", () => {
  assert.equal(needConcept("投资人"), "funding");
  assert.equal(needConcept("寻找投资"), "funding");
  assert.equal(needConcept("获取客户"), "customers");
  assert.equal(needConcept("企业业务负责人"), "enterprise");
  assert.equal(needConcept("专业人士（律师、顾问等）"), "professional");
  assert.equal(offerConcept("客户引荐"), "enterprise_intro");
  assert.equal(offerConcept("人脈の紹介"), "alliance");
  assert.ok(offerAnswersNeed("寻找投资", "投資家・VCの紹介"));
  assert.ok(offerAnswersNeed("专业人士（律师、顾问等）", "法务财税咨询"));
  assert.ok(offerAnswersNeed("M&A / 事業承継の相談", "M&A・事業売却支援"));
  assert.ok(!offerAnswersNeed("寻找投资", "客户引荐"));
});

test("one industry in two languages is a shared topic", () => {
  assert.ok(topicsShare("科技与互联网", "テクノロジー・インターネット"));
  assert.ok(!topicsShare("科技与互联网", "零售与消费"));
});

test("the matching card is rebuilt from the answers and the account profile; the event goal is not a topic", () => {
  const stored = card("a", {
    industry: "科技与互联网",
    needs: ["创业者", "经营者 · 同行业的人 · 投资人", "寻找投资 · 获取客户"],
    offers: ["行业经验 · 产品与技术咨询"],
    topics: ["科技与互联网", "寻找投资 · 获取客户"],
  });
  const rebuilt = matchingParticipant(stored, {
    account: { offering: ["产品与技术咨询"], seeking: ["潜在客户"], topics: ["生成式 AI"] },
    answers: {
      desiredOutcome: "寻找投资 · 获取客户",
      industry: "科技与互联网",
      targetAttendees: "创业者、经营者 · 同行业的人 · 投资人",
      valueOffered: "行业经验 · 产品与技术咨询",
    },
  });
  assert.deepEqual(rebuilt.needs, ["创业者", "经营者", "同行业的人", "投资人", "寻找投资", "获取客户", "潜在客户"]);
  assert.deepEqual(rebuilt.offers, ["行业经验", "产品与技术咨询"]);
  assert.deepEqual(rebuilt.topics, ["科技与互联网", "生成式 AI"]);
  assert.equal(rebuilt.displayName, "a");
  assert.equal(rebuilt.participantId, stored.participantId);
});

test("without answers or an account the stored card is returned unchanged", () => {
  const stored = card("b", { needs: ["投资人"] });
  assert.equal(matchingParticipant(stored, { account: null, answers: null }), stored);
});

test("rebuilt cards give real matches where the stored cards had none", () => {
  const founder = card("founder", {
    profileAnswers: { desiredOutcome: "寻找投资 · 获取客户", industry: "科技与互联网", targetAttendees: "投资人 · 企业业务负责人", valueOffered: "产品与技术咨询" },
    needs: ["投资人 · 企业业务负责人", "寻找投资 · 获取客户"],
    offers: ["产品与技术咨询"],
    topics: ["科技与互联网", "寻找投资 · 获取客户"],
  });
  const investor = card("investor", {
    profileAnswers: { desiredOutcome: "寻找需要资金支持的创业者", industry: "金融与投资", targetAttendees: "创业者、经营者", valueOffered: "投資家・VCの紹介 · エンジェル投資" },
    needs: ["创业者", "经营者", "寻找需要资金支持的创业者"],
    offers: ["投資家・VCの紹介 · エンジェル投資"],
    topics: ["金融与投资", "寻找需要资金支持的创业者"],
  });
  const real = (participants: EventOperationsParticipant[]) =>
    buildDeterministicCandidates({ generationId: "g", participants, recommendationCount: 5 }).candidates.filter(
      (candidate) => candidate.sourceParticipantId === founder.participantId && Number(candidate.featurePayload.realNeedOffer) > 0,
    ).length;
  assert.equal(real([founder, investor]), 0);
  assert.equal(real([founder, investor].map((participant) => matchingParticipant(participant, {}))), 1);
});

test("a reason may name a profile fact in another language or a directly related concept, but not a concept neither person has", async () => {
  const { unsupportedProfileTerms } = await import("../../features/events/event-operations/match-concepts");
  assert.deepEqual(unsupportedProfileTerms("プロダクト・技術相談について話せます", ["产品与技术咨询"]), []);
  assert.deepEqual(unsupportedProfileTerms("投資家・VCの紹介を受けられます", ["寻找投资"]), []);
  assert.deepEqual(unsupportedProfileTerms("エンジニアの採用について", ["人才推荐"]), []);
  assert.deepEqual(unsupportedProfileTerms("{TARGET}さんが関心を持つ海外展開（総合）", ["生成AI / LLMの活用", "投資家・VCの紹介"]), ["海外展開"]);
});

test("the matching card carries what the person does from the account profile", () => {
  const rebuilt = matchingParticipant(card("c"), { account: { bio: "在东京经营中日贸易公司", headline: "贸易公司代表", seniority: "founder" }, answers: { industry: "贸易与物流" } });
  assert.equal(rebuilt.about, "贸易公司代表 / 在东京经营中日贸易公司");
  assert.equal(rebuilt.seniority, "founder");
});

test("candidates who answer the reader's own needs rank above people only the reader can help", () => {
  const reader = card("reader", { needs: ["投资人"], offers: ["产品与技术咨询"] });
  const investor = card("investor", { offers: ["投資家・VCの紹介"] });
  const helpee = card("helpee", { needs: ["技術的なアドバイス"] });
  const { candidates } = buildDeterministicCandidates({ generationId: "g", participants: [reader, investor, helpee], recommendationCount: 5 });
  const order = candidates.filter((c) => c.sourceParticipantId === reader.participantId).sort((a, b) => a.retrievalRank - b.retrievalRank).map((c) => c.targetParticipantId);
  assert.deepEqual(order.slice(0, 2), [investor.participantId, helpee.participantId]);
});
