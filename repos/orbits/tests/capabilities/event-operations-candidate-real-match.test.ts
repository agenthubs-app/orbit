/**
 * Real-match recall (2026-11-22): people the concept table says truly match enter the shortlist first, before the
 * token-overlap guess; the shortlist size and the comparison budget stay as they were. Fictional profiles only.
 */
import assert from "node:assert/strict";
import test from "node:test";

import { buildDeterministicCandidates, eventOperationsCandidateLimit } from "../../features/events/event-operations/candidate-retrieval";
import type { EventOperationsParticipant } from "../../features/events/event-operations/contract";

function person(id: string, profile: Partial<Pick<EventOperationsParticipant, "needs" | "offers" | "topics" | "industry" | "experienceHighlight">>): EventOperationsParticipant {
  return {
    actorId: `actor:${id}`, company: `Company ${id}`, displayName: `Person ${id}`, energyStyle: null, evidenceIds: [], experienceHighlight: null,
    industry: null, languages: ["ja", "zh"], lateRegistration: false, needs: [], offers: [], participantId: `participant:${id}`,
    profileCompleteness: "complete", role: null, seniority: null, topics: [], ...profile,
  };
}

test("a sparse profile with several real matches in the event gets all of them into its shortlist", () => {
  const sparse = person("sparse", { offers: ["大企業への営業紹介"] });
  // Six people whose need that one offer answers, and many who look similar by words but do not match.
  const matches = Array.from({ length: 6 }, (_, index) => person(`match-${index}`, { needs: ["大企業との協業機会"], topics: ["海外展開（総合）"] }));
  const lookalikes = Array.from({ length: 40 }, (_, index) => person(`noise-${index}`, { needs: ["SNS運用アドバイス"], offers: ["大企業への営業紹介"], topics: ["生成AI / LLMの活用"], industry: "営業" }));
  const participants = [sparse, ...matches, ...lookalikes];
  const result = buildDeterministicCandidates({ generationId: "g", participants, recommendationCount: 5 });
  const shortlist = result.candidates.filter((candidate) => candidate.sourceParticipantId === sparse.participantId);
  assert.equal(shortlist.length, eventOperationsCandidateLimit(5), "the shortlist size is unchanged");
  const top = shortlist.slice(0, 6).map((candidate) => candidate.targetParticipantId).sort();
  assert.deepEqual(top, matches.map((match) => match.participantId).sort(), "every real match ranks first");
  assert.ok(shortlist.slice(0, 6).every((candidate) => candidate.featurePayload.realNeedOffer === 1));
});

test("need/offer answers rank above shared topics, which rank above word overlap", () => {
  const source = person("s", { needs: ["資金調達（シード〜プレA）"], topics: ["Web3 / ブロックチェーン"] });
  const investor = person("investor", { offers: ["投資家・VCの紹介"] });
  const sameTopic = person("topic", { topics: ["Web3"] });
  const wordsOnly = person("words", { offers: ["資金調達（シード〜プレA）"] });
  const result = buildDeterministicCandidates({ generationId: "g", participants: [source, investor, sameTopic, wordsOnly], recommendationCount: 5 });
  const order = result.candidates.filter((candidate) => candidate.sourceParticipantId === source.participantId).map((candidate) => candidate.targetParticipantId);
  assert.deepEqual(order, [investor.participantId, sameTopic.participantId, wordsOnly.participantId]);
});

test("real-match recall with real tags stays within the N×K comparison budget at 1,000 people", () => {
  const needs = ["海外展開パートナー", "資金調達（シード〜プレA）", "大企業との協業機会", "AI / DX推進の相談", "SNS運用アドバイス"];
  const offers = ["海外市場の販路・知見", "投資家・VCの紹介", "大企業への営業紹介", "AI・機械学習の導入支援", "SNSマーケティング"];
  const topics = ["生成AI / LLMの活用", "海外展開（総合）", "中国ビジネス", "Web3 / ブロックチェーン"];
  const participants = Array.from({ length: 1_000 }, (_, index) => person(String(index).padStart(4, "0"), {
    needs: [needs[index % 5]!, needs[(index + 2) % 5]!], offers: [offers[(index + 1) % 5]!], topics: [topics[index % 4]!],
  }));
  const limit = eventOperationsCandidateLimit(5);
  const result = buildDeterministicCandidates({ generationId: "g", participants, recommendationCount: 5 });
  assert.equal(result.metrics.shortlistEntries, participants.length * limit);
  assert.ok(result.metrics.pairComparisons <= participants.length * limit * 8, `pair comparisons ${result.metrics.pairComparisons}`);
  assert.ok(result.metrics.facetBucketVisits <= participants.length * limit * 64, `facet visits ${result.metrics.facetBucketVisits}`);
});
