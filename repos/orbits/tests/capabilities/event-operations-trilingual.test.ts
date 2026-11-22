import assert from "node:assert/strict";
import test from "node:test";

import {
  collectTrilingualOutputViolations,
  createConfiguredEventOperationsAiProvider,
  createEventOperationsAiProvider,
  TRILINGUAL_MAX_RECOMMENDATION_SHARD,
} from "../../features/events/event-operations/ai-provider";
import { publicRecommendations, publicTable } from "../../features/events/event-operations/attendee-public";
import type { EventOperationsGroupingResult, EventOperationsParticipant, EventOperationsTable, EventOperationsTableText } from "../../features/events/event-operations/contract";
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
  return sequence(value);
}
/** Model replies in order (the last one repeats); records every prompt. */
function sequence(...values: unknown[]) {
  const prompts: string[] = [];
  const run = async (input: { userText: string }) => {
    prompts.push(input.userText);
    const value = values[Math.min(prompts.length - 1, values.length - 1)];
    return { model: "test-model", provider: "openai" as const, source: "provider:openai-responses-api" as const, success: true as const, text: typeof value === "string" ? value : JSON.stringify(value) };
  };
  return Object.assign(run, { prompts });
}
const sentence = (ja: string, zh: string, en: string) => ({ en, ja, zh });

const goodRecommendation = {
  icebreakers: [sentence("最初にどの業務で試しますか？", "您打算先在哪个业务试用？", "Which workflow would you pilot first?"), sentence("導入の決め手は何でしたか？", "当时选择导入的关键是什么？", "What made the last rollout work?")],
  memberHint: sentence("山田太郎さんと Bo さんは導入事例の話から始めるとよいです。", "山田太郎和 Bo 可以先聊导入案例。", "山田太郎 and Bo can start from rollout stories."),
  rank: 1,
  reasons: [sentence("山田太郎さんは医療分野での導入先を探しています。", "山田太郎正在寻找医疗领域的合作方。", "山田太郎 is looking for a healthcare partner.")],
  score: 88,
  targetCandidateKey: "S1C1",
};
const recommendationInput = { eventId: "event:t", recommendationCount: 4, sources: [{ candidateParticipants: [bo], sourceParticipant: yamada }] };
const recommendationsDoc = (item: unknown) => ({ recommendations: [{ noMatchReason: null, recommendations: [item], sourceKey: "S1" }] });

test("trilingual recommendations: paired sentences, base fields = zh, i18n carries all three", async () => {
  const provider = createEventOperationsAiProvider({ trilingual: true, runModelText: text(recommendationsDoc(goodRecommendation)) });
  assert.equal(provider.maxRecommendationShardSize, TRILINGUAL_MAX_RECOMMENDATION_SHARD);
  const result = await provider.generateRecommendations(recommendationInput);
  assert.equal(result.success, true);
  if (!result.success) return;
  const row = result.data[0]!;
  const item = row.recommendations[0]!;
  assert.equal(item.targetParticipantId, "participant:b");
  assert.deepEqual(item.reasons, ["山田太郎正在寻找医疗领域的合作方。"]);
  assert.deepEqual(item.i18n?.ja.reasons, ["山田太郎さんは医療分野での導入先を探しています。"]);
  assert.deepEqual(item.i18n?.en.icebreakers, ["Which workflow would you pilot first?", "What made the last rollout work?"]);
  assert.equal(row.noMatchReasonI18n, undefined);
});

test("trilingual recommendations: a no-match row carries noMatchReason in three languages", async () => {
  const provider = createEventOperationsAiProvider({ trilingual: true, runModelText: text({ recommendations: [{ noMatchReason: sentence("条件に合う相手が今回はいません。", "这次没有符合条件的对象。", "No one fits this time."), recommendations: [], sourceKey: "S1" }] }) });
  const result = await provider.generateRecommendations(recommendationInput);
  assert.equal(result.success, true);
  if (!result.success) return;
  assert.equal(result.data[0]!.noMatchReason, "这次没有符合条件的对象。");
  assert.equal(participantRecommendationsIn(result.data[0]!, "en").noMatchReason, "No one fits this time.");
});

test("trilingual recommendations: a structural miss is a retryable failure, never a fallback", async () => {
  const cases = {
    unpairedSentence: { ...goodRecommendation, memberHint: "山田太郎和 Bo 可以先聊导入案例。" },
    missingLanguage: { ...goodRecommendation, reasons: [{ ja: "理由です", zh: "理由" }] },
    threeIcebreakers: { ...goodRecommendation, icebreakers: [...goodRecommendation.icebreakers, goodRecommendation.icebreakers[0]] },
  };
  for (const [name, item] of Object.entries(cases)) {
    const provider = createEventOperationsAiProvider({ trilingual: true, runModelText: text(recommendationsDoc(item)) });
    const result = await provider.generateRecommendations(recommendationInput);
    assert.equal(result.success, false, name);
    if (!result.success) assert.equal(result.retryable, true, name);
  }
});

test("trilingual recommendations: flagged ja/en sentences get one bounded repair from zh, checked again", async () => {
  const bad = { ...goodRecommendation, reasons: [sentence("山田太郎正在寻找医疗领域的合作方和投资。", "山田太郎正在寻找医疗领域的合作方。", "山田太郎 seeks 資金調達 partners.")] };
  const runner = sequence(recommendationsDoc(bad), { sentences: { s1: { en: "山田太郎 is looking for funding partners.", ja: "山田太郎さんは医療分野の協業先を探しています。" } } });
  const provider = createEventOperationsAiProvider({ trilingual: true, runModelText: runner });
  const result = await provider.generateRecommendations(recommendationInput);
  assert.equal(result.success, true);
  if (!result.success) return;
  assert.equal(runner.prompts.length, 2, "one generation call plus one repair call");
  assert.match(runner.prompts[1]!, /"rewrite":\["ja","en"\]/u);
  assert.match(runner.prompts[1]!, /山田太郎正在寻找医疗领域的合作方。/u, "the repair translates from the zh sentence");
  const item = result.data[0]!.recommendations[0]!;
  assert.deepEqual(item.i18n?.en.reasons, ["山田太郎 is looking for funding partners."]);
  assert.deepEqual(item.i18n?.ja.reasons, ["山田太郎さんは医療分野の協業先を探しています。"]);
});

test("trilingual recommendations: a repair that still fails is a retryable failure and the raw text reaches only the opt-in hook", async () => {
  const bad = { ...goodRecommendation, reasons: [sentence("山田太郎さんは医療分野での導入先を探しています。", "山田太郎正在寻找医疗领域的合作方。", "山田太郎 seeks 資金調達 partners.")] };
  const seen: Array<{ kind: string; stage: string; text: string }> = [];
  const provider = createEventOperationsAiProvider({
    onTrilingualFailureText: (detail) => seen.push(detail),
    runModelText: sequence(recommendationsDoc(bad), { sentences: { s1: { en: "Still 資金調達." } } }),
    trilingual: true,
  });
  const result = await provider.generateRecommendations(recommendationInput);
  assert.equal(result.success, false);
  if (!result.success) assert.equal(result.retryable, true);
  assert.deepEqual(seen.map((item) => [item.kind, item.stage]), [["repair", "repair_language"]]);
  assert.match(seen[0]!.text, /資金調達/u);
});

test("trilingual output: invalid JSON is reported with its shape to the hook", async () => {
  const seen: string[] = [];
  const provider = createEventOperationsAiProvider({ onTrilingualFailureText: (detail) => seen.push(detail.stage), runModelText: sequence('{"recommendations":[{"sourceKey":"S1",'), trilingual: true });
  const result = await provider.generateRecommendations(recommendationInput);
  assert.equal(result.success, false);
  assert.equal(seen.length, 1);
  assert.match(seen[0]!, /^json_/u);
});

test("language checks allow names in their own script and short Japanese noun phrases", () => {
  const ok = collectTrilingualOutputViolations({ en: ["Meet 山田太郎 of 青空商事 about pilots."], ja: ["AI 投資", "山田太郎さんと話す"], zh: [] }, [yamada]);
  assert.deepEqual(ok, { english: [], japanese: [] });
  const bad = collectTrilingualOutputViolations({ en: ["Talk about 资金"], ja: ["他正在寻找医疗领域的合作方"], zh: [] }, [yamada]);
  assert.equal(bad.english.length, 1);
  assert.equal(bad.japanese.length, 1);
});

const tableText = (language: "ja" | "zh" | "en"): EventOperationsTableText => ({
  ja: { theme: "医療 AI の導入", rationale: "導入側と提供側がそろう卓です。", icebreakers: ["一つ目の質問です", "二つ目の質問です", "三つ目の質問です"], memberPrompts: { "participant:a": ["導入の壁は何ですか？", "誰が決めますか？"], "participant:b": ["検証の期間は？", "成果の指標は？"] }, memberRationales: { "participant:a": "導入先を探しているからです。", "participant:b": "導入実績があるからです。" } },
  zh: { theme: "医疗 AI 导入", rationale: "导入方与提供方同桌。", icebreakers: ["问题一", "问题二", "问题三"], memberPrompts: { "participant:a": ["导入难点是什么？", "谁来决定？"], "participant:b": ["验证周期多久？", "成果指标是什么？"] }, memberRationales: { "participant:a": "正在寻找导入方。", "participant:b": "有导入经验。" } },
  en: { theme: "Healthcare AI rollout", rationale: "Buyers and builders share this table.", icebreakers: ["Question one", "Question two", "Question three"], memberPrompts: { "participant:a": ["What blocks rollout?", "Who decides?"], "participant:b": ["How long is the pilot?", "What is the success metric?"] }, memberRationales: { "participant:a": "Looking for a rollout partner.", "participant:b": "Has rolled this out before." } },
})[language] as unknown as EventOperationsTableText;
const tableInput = { eventId: "event:t", features: [], members: [yamada, bo], roundNumber: 1 as const, tableNumber: 1 };
const members = [{ participantId: "participant:a", seat: "R1-T1-S1" }, { participantId: "participant:b", seat: "R1-T1-S2" }];

const pairedTable = (overrides: Record<string, unknown> = {}) => {
  const ja = tableText("ja"), zh = tableText("zh"), en = tableText("en");
  const ids = ["participant:a", "participant:b"];
  return {
    icebreakers: [0, 1, 2].map((i) => sentence(ja.icebreakers[i]!, zh.icebreakers[i]!, en.icebreakers[i]!)),
    memberPrompts: Object.fromEntries(ids.map((id) => [id, [0, 1].map((i) => sentence(ja.memberPrompts[id]![i]!, zh.memberPrompts[id]![i]!, en.memberPrompts[id]![i]!))])),
    memberRationales: Object.fromEntries(ids.map((id) => [id, sentence(ja.memberRationales[id]!, zh.memberRationales[id]!, en.memberRationales[id]!)])),
    members,
    rationale: sentence(ja.rationale, zh.rationale, en.rationale),
    tableNumber: 1,
    theme: sentence(ja.theme, zh.theme, en.theme),
    ...overrides,
  };
};

test("trilingual table: paired sentences, same membership, base = zh, i18n = three languages", async () => {
  const provider = createEventOperationsAiProvider({ trilingual: true, runModelText: text(pairedTable()) });
  const result = await provider.generateTableContent(tableInput);
  assert.equal(result.success, true);
  if (!result.success) return;
  assert.equal(result.data.theme, "医疗 AI 导入");
  assert.equal(result.data.i18n?.ja.theme, "医療 AI の導入");
  assert.equal(tableIn(result.data, "en").memberRationales["participant:b"], "Has rolled this out before.");
});

test("trilingual table: a member missing from the per-member text is a retryable failure", async () => {
  const table = pairedTable();
  const provider = createEventOperationsAiProvider({ trilingual: true, runModelText: text({ ...table, memberRationales: { "participant:a": table.memberRationales["participant:a"] } }) });
  const result = await provider.generateTableContent(tableInput);
  assert.equal(result.success, false);
  if (!result.success) assert.equal(result.retryable, true);
});

test("configured provider is trilingual and fingerprints it", () => {
  const configured = createConfiguredEventOperationsAiProvider();
  assert.equal(configured.maxRecommendationShardSize, 2);
  assert.match(configured.requestFingerprint ?? "", /"participantTextLanguages":"ja-zh-en-v2-paired"/u);
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
  const noMatch = publicRecommendations({ noMatchReason: "无", noMatchReasonI18n: { en: "None", ja: "なし", zh: "无" }, recommendations: [], sourceParticipantId: "participant:a" }, { includeI18n: true })!;
  assert.deepEqual(noMatch.i18n, { en: { noMatchReason: "None" }, ja: { noMatchReason: "なし" }, zh: { noMatchReason: "无" } });
});

test("host moves keep each person's own text in every language; host placement is said in each language", () => {
  const grouping: EventOperationsGroupingResult = { roundOne: [storedTable, { ...storedTable, tableNumber: 2, members: [], memberPrompts: {}, memberRationales: {}, i18n: { en: { ...tableText("en"), memberPrompts: {}, memberRationales: {} }, ja: { ...tableText("ja"), memberPrompts: {}, memberRationales: {} }, zh: { ...tableText("zh"), memberPrompts: {}, memberRationales: {} } } }], roundTwo: [] };
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
