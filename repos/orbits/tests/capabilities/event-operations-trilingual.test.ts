import assert from "node:assert/strict";
import test from "node:test";

import {
  collectChineseOutputPolicyViolations,
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

const tableText = (language: "ja" | "zh" | "en"): EventOperationsTableText => ({
  ja: { theme: "医療 AI の導入", rationale: "導入側と提供側がそろう卓です。", icebreakers: ["一つ目の質問です", "二つ目の質問です", "三つ目の質問です"], memberPrompts: { "participant:a": ["導入の壁は何ですか？", "誰が決めますか？"], "participant:b": ["検証の期間は？", "成果の指標は？"] }, memberRationales: { "participant:a": "導入先を探しているからです。", "participant:b": "導入実績があるからです。" } },
  zh: { theme: "医疗 AI 导入", rationale: "导入方与提供方同桌。", icebreakers: ["问题一", "问题二", "问题三"], memberPrompts: { "participant:a": ["导入难点是什么？", "谁来决定？"], "participant:b": ["验证周期多久？", "成果指标是什么？"] }, memberRationales: { "participant:a": "正在寻找导入方。", "participant:b": "有导入经验。" } },
  en: { theme: "Healthcare AI rollout", rationale: "Buyers and builders share this table.", icebreakers: ["Question one", "Question two", "Question three"], memberPrompts: { "participant:a": ["What blocks rollout?", "Who decides?"], "participant:b": ["How long is the pilot?", "What is the success metric?"] }, memberRationales: { "participant:a": "Looking for a rollout partner.", "participant:b": "Has rolled this out before." } },
})[language] as unknown as EventOperationsTableText;
const members = [{ participantId: "participant:a", seat: "R1-T1-S1" }, { participantId: "participant:b", seat: "R1-T1-S2" }];

test("configured provider is trilingual and fingerprints it", () => {
  const configured = createConfiguredEventOperationsAiProvider();
  assert.equal(configured.maxRecommendationShardSize, 3);
  assert.match(configured.requestFingerprint ?? "", /"participantTextLanguages":"ja-base-then-translate-v1"/u);
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
