import assert from "node:assert/strict";
import test from "node:test";

import {
  collectTrilingualOutputViolations,
  createConfiguredEventOperationsAiProvider,
  createEventOperationsAiProvider,
  TRILINGUAL_MAX_RECOMMENDATION_SHARD,
} from "../../features/events/event-operations/ai-provider";
import { publicRecommendations, publicTable } from "../../features/events/event-operations/attendee-public";
import type { EventOperationsParticipant, EventOperationsTable } from "../../features/events/event-operations/contract";
import {
  eventOperationsRequestLanguage,
  eventOperationsTextLanguage,
  participantRecommendationsIn,
  tableIn,
} from "../../features/events/event-operations/text-language";
import { composeGrouping } from "../../features/events/host/storage/matching";

function participant(id: string, displayName: string, company: string): EventOperationsParticipant {
  return {
    actorId: `actor:${id}`, company, displayName, energyStyle: null, evidenceIds: [], experienceHighlight: null, industry: "AI",
    languages: ["ja"], lateRegistration: false, needs: ["資金調達"], offers: ["SaaS 導入"], participantId: `participant:${id}`,
    profileCompleteness: "complete", role: "CEO", seniority: null, topics: ["AI"],
  };
}
const yamada = participant("a", "山田太郎", "青空商事");
const bo = participant("b", "Bo", "Beacon Health");

function text(value: unknown) {
  return async () => ({ model: "test-model", provider: "openai" as const, source: "provider:openai-responses-api" as const, success: true as const, text: JSON.stringify(value) });
}

const goodRecommendation = {
  rank: 1, score: 88, targetCandidateKey: "S1C1",
  ja: { icebreakers: ["最初にどの業務で試しますか？", "導入の決め手は何でしたか？"], memberHint: "山田太郎さんと Bo さんは導入事例の話から始めるとよいです。", reasons: ["山田太郎さんは医療分野での導入先を探しています。"] },
  zh: { icebreakers: ["您打算先在哪个业务试用？", "当时选择导入的关键是什么？"], memberHint: "山田太郎和 Bo 可以先聊导入案例。", reasons: ["山田太郎正在寻找医疗领域的合作方。"] },
  en: { icebreakers: ["Which workflow would you pilot first?", "What made the last rollout work?"], memberHint: "山田太郎 and Bo can start from rollout stories.", reasons: ["山田太郎 is looking for a healthcare partner."] },
};
const recommendationInput = { eventId: "event:t", recommendationCount: 4, sources: [{ candidateParticipants: [bo], sourceParticipant: yamada }] };

test("trilingual recommendations: one output, base fields = zh, i18n carries all three", async () => {
  const provider = createEventOperationsAiProvider({ trilingual: true, runModelText: text({ recommendations: [{ noMatchReason: null, recommendations: [goodRecommendation], sourceKey: "S1" }] }) });
  assert.equal(provider.maxRecommendationShardSize, TRILINGUAL_MAX_RECOMMENDATION_SHARD);
  const result = await provider.generateRecommendations(recommendationInput);
  assert.equal(result.success, true);
  if (!result.success) return;
  const row = result.data[0]!;
  const item = row.recommendations[0]!;
  assert.equal(item.targetParticipantId, "participant:b");
  assert.deepEqual(item.reasons, goodRecommendation.zh.reasons);
  assert.deepEqual(item.i18n?.ja.reasons, goodRecommendation.ja.reasons);
  assert.deepEqual(item.i18n?.en.icebreakers, goodRecommendation.en.icebreakers);
  assert.equal(row.noMatchReasonI18n, undefined);
});

test("trilingual recommendations: a no-match row carries noMatchReason in three languages", async () => {
  const provider = createEventOperationsAiProvider({ trilingual: true, runModelText: text({ recommendations: [{ noMatchReason: { ja: "条件に合う相手が今回はいません。", zh: "这次没有符合条件的对象。", en: "No one fits this time." }, recommendations: [], sourceKey: "S1" }] }) });
  const result = await provider.generateRecommendations(recommendationInput);
  assert.equal(result.success, true);
  if (!result.success) return;
  assert.equal(result.data[0]!.noMatchReason, "这次没有符合条件的对象。");
  assert.equal(participantRecommendationsIn(result.data[0]!, "en").noMatchReason, "No one fits this time.");
});

test("trilingual recommendations: wrong-language or inconsistent output is a retryable failure, never a fallback", async () => {
  const cases = {
    japaneseWrittenInChinese: { ...goodRecommendation, ja: { ...goodRecommendation.ja, memberHint: "山田太郎和 Bo 可以先聊导入案例与采购流程。" } },
    englishWithChinese: { ...goodRecommendation, en: { ...goodRecommendation.en, reasons: ["山田太郎 正在寻找 healthcare partner."] } },
    reasonCountDiffers: { ...goodRecommendation, en: { ...goodRecommendation.en, reasons: ["one", "two"] } },
    missingLanguage: { rank: 1, score: 88, targetCandidateKey: "S1C1", ja: goodRecommendation.ja, zh: goodRecommendation.zh },
  };
  for (const [name, item] of Object.entries(cases)) {
    const provider = createEventOperationsAiProvider({ trilingual: true, runModelText: text({ recommendations: [{ noMatchReason: null, recommendations: [item], sourceKey: "S1" }] }) });
    const result = await provider.generateRecommendations(recommendationInput);
    assert.equal(result.success, false, name);
    if (!result.success) assert.equal(result.retryable, true, name);
  }
});

test("language checks allow names in their own script and short Japanese noun phrases", () => {
  const ok = collectTrilingualOutputViolations({ en: ["Meet 山田太郎 of 青空商事 about pilots."], ja: ["AI 投資", "山田太郎さんと話す"], zh: [] }, [yamada]);
  assert.deepEqual(ok, { english: [], japanese: [] });
  const bad = collectTrilingualOutputViolations({ en: ["Talk about 资金"], ja: ["他正在寻找医疗领域的合作方"], zh: [] }, [yamada]);
  assert.equal(bad.english.length, 1);
  assert.equal(bad.japanese.length, 1);
});

const tableText = (language: "ja" | "zh" | "en") => ({
  ja: { theme: "医療 AI の導入", rationale: "導入側と提供側がそろう卓です。", icebreakers: ["一つ目の質問です", "二つ目の質問です", "三つ目の質問です"], memberPrompts: { "participant:a": ["導入の壁は何ですか？", "誰が決めますか？"], "participant:b": ["検証の期間は？", "成果の指標は？"] }, memberRationales: { "participant:a": "導入先を探しているからです。", "participant:b": "導入実績があるからです。" } },
  zh: { theme: "医疗 AI 导入", rationale: "导入方与提供方同桌。", icebreakers: ["问题一", "问题二", "问题三"], memberPrompts: { "participant:a": ["导入难点是什么？", "谁来决定？"], "participant:b": ["验证周期多久？", "成果指标是什么？"] }, memberRationales: { "participant:a": "正在寻找导入方。", "participant:b": "有导入经验。" } },
  en: { theme: "Healthcare AI rollout", rationale: "Buyers and builders share this table.", icebreakers: ["Question one", "Question two", "Question three"], memberPrompts: { "participant:a": ["What blocks rollout?", "Who decides?"], "participant:b": ["How long is the pilot?", "What is the success metric?"] }, memberRationales: { "participant:a": "Looking for a rollout partner.", "participant:b": "Has rolled this out before." } },
})[language];
const tableInput = { eventId: "event:t", features: [], members: [yamada, bo], roundNumber: 1 as const, tableNumber: 1 };
const members = [{ participantId: "participant:a", seat: "R1-T1-S1" }, { participantId: "participant:b", seat: "R1-T1-S2" }];

test("trilingual table: same membership in one output, base = zh, i18n = three languages", async () => {
  const provider = createEventOperationsAiProvider({ trilingual: true, runModelText: text({ tableNumber: 1, members, ja: tableText("ja"), zh: tableText("zh"), en: tableText("en") }) });
  const result = await provider.generateTableContent(tableInput);
  assert.equal(result.success, true);
  if (!result.success) return;
  assert.equal(result.data.theme, "医疗 AI 导入");
  assert.equal(result.data.i18n?.ja.theme, "医療 AI の導入");
  assert.equal(tableIn(result.data, "en").memberRationales["participant:b"], "Has rolled this out before.");
});

test("trilingual table: a language that misses a member is a retryable failure", async () => {
  const ja = tableText("ja");
  const provider = createEventOperationsAiProvider({ trilingual: true, runModelText: text({ tableNumber: 1, members, ja: { ...ja, memberRationales: { "participant:a": ja.memberRationales["participant:a"] } }, zh: tableText("zh"), en: tableText("en") }) });
  const result = await provider.generateTableContent(tableInput);
  assert.equal(result.success, false);
  if (!result.success) assert.equal(result.retryable, true);
});

test("configured provider is trilingual and fingerprints it", () => {
  const configured = createConfiguredEventOperationsAiProvider();
  assert.equal(configured.maxRecommendationShardSize, 2);
  assert.match(configured.requestFingerprint ?? "", /"participantTextLanguages":"ja-zh-en-v1"/u);
  assert.doesNotMatch(createEventOperationsAiProvider().requestFingerprint ?? "", /participantTextLanguages/u);
});

const storedTable: EventOperationsTable = { icebreakers: ["问题一", "问题二", "问题三"], i18n: { en: tableText("en"), ja: tableText("ja"), zh: tableText("zh") }, members, rationale: "导入方与提供方同桌。", tableNumber: 1, theme: "医疗 AI 导入", memberPrompts: tableText("zh").memberPrompts, memberRationales: tableText("zh").memberRationales };

test("reading picks the viewer language; results without i18n stay as stored", () => {
  assert.equal(tableIn(storedTable, "ja").theme, "医療 AI の導入");
  const { i18n: _drop, ...legacy } = storedTable;
  assert.deepEqual(tableIn(legacy, "en"), legacy);
  assert.equal(eventOperationsTextLanguage("zh-CN"), "zh");
  assert.equal(eventOperationsTextLanguage(undefined), "ja");
  assert.equal(eventOperationsRequestLanguage(new Request("https://x.test/api?lang=en", { headers: { "x-orbit-lang": "zh" } })), "en");
  assert.equal(eventOperationsRequestLanguage(new Request("https://x.test/api", { headers: { "x-orbit-lang": "zh" } })), "zh");
  assert.equal(eventOperationsRequestLanguage(new Request("https://x.test/api", { headers: { cookie: "a=1; orbit-lang=en" } })), "en");
});

test("offline sync rows carry i18n; online public shapes do not unless asked", () => {
  assert.equal("i18n" in (publicTable(storedTable) ?? {}), false);
  assert.deepEqual(publicTable(storedTable, { includeI18n: true })?.i18n?.en.theme, "Healthcare AI rollout");
  const recs = { noMatchReason: null, recommendations: [{ icebreakers: ["a", "b"] as const, i18n: { en: { icebreakers: ["a", "b"] as const, memberHint: "h", reasons: ["r"] as [string] }, ja: { icebreakers: ["あ", "い"] as const, memberHint: "ひ", reasons: ["り"] as [string] }, zh: { icebreakers: ["a", "b"] as const, memberHint: "h", reasons: ["r"] as [string] } }, memberHint: "h", rank: 1, reasons: ["r"] as [string], score: 80, targetParticipantId: "participant:b" }], sourceParticipantId: "participant:a" };
  assert.equal("i18n" in publicRecommendations(recs)!.recommendations[0]!, false);
  assert.equal(publicRecommendations(recs, { includeI18n: true })!.recommendations[0]!.i18n?.ja.memberHint, "ひ");
});

test("host moves keep each person's own text in every language; host placement is said in each language", () => {
  const grouping = { roundOne: [storedTable, { ...storedTable, tableNumber: 2, members: [], memberPrompts: {}, memberRationales: {}, i18n: { en: { ...tableText("en"), memberPrompts: {}, memberRationales: {} }, ja: { ...tableText("ja"), memberPrompts: {}, memberRationales: {} }, zh: { ...tableText("zh"), memberPrompts: {}, memberRationales: {} } } }], roundTwo: [] };
  const moved = composeGrouping(grouping, [
    { absent: 0, members: [{ initial: "B", name: "Bo", org: null, participantId: "participant:b", placedByHost: false, role: null, standing: null }], round: 1, table: "A", theme: null, why: null },
    { absent: 0, members: [{ initial: "山", name: "山田太郎", org: null, participantId: "participant:a", placedByHost: true, role: null, standing: null }], round: 1, table: "B", theme: null, why: null },
  ], 6);
  const second = moved.roundOne.find((table) => table.tableNumber === 2)!;
  assert.equal(second.i18n?.en.memberRationales["participant:a"], "Placed by the host");
  assert.equal(second.i18n?.ja.memberRationales["participant:a"], "主催者が配置");
  assert.deepEqual(second.i18n?.ja.memberPrompts["participant:a"], tableText("ja").memberPrompts["participant:a"]);
  const first = moved.roundOne.find((table) => table.tableNumber === 1)!;
  assert.deepEqual(Object.keys(first.i18n!.zh.memberRationales), ["participant:b"]);
});
