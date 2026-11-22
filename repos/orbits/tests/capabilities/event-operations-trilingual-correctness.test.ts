/**
 * 2026-11-22 Codex review: correctness holes that must fail (written red first).
 * Fixtures are fictional; no attendee data.
 */
import assert from "node:assert/strict";
import test from "node:test";

import {
  collectChineseOutputPolicyViolations,
  collectTrilingualOutputViolations,
  createEventOperationsAiProvider,
  type EventOperationsModelRunner,
} from "../../features/events/event-operations/ai-provider";
import type { EventOperationsParticipant } from "../../features/events/event-operations/contract";

function participant(id: string, displayName: string, company: string): EventOperationsParticipant {
  return {
    actorId: `actor:${id}`, company, displayName, energyStyle: null, evidenceIds: [], experienceHighlight: null, industry: "AI",
    languages: ["ja"], lateRegistration: false, needs: ["資金調達"], offers: ["SaaS 導入"], participantId: `participant:${id}`,
    profileCompleteness: "complete", role: "CEO", seniority: null, topics: ["AI"],
  };
}
const yamada = participant("a", "山田太郎", "青空商事");
const bo = participant("b", "Bo", "Beacon Health");
const mira = participant("c", "Mira", "未来科技");

function sequence(...values: unknown[]) {
  const prompts: string[] = [];
  const run = async (input: { userText: string }) => {
    prompts.push(input.userText);
    const value = values[Math.min(prompts.length - 1, values.length - 1)];
    if (value instanceof Error) return { error: { code: "AI_REQUEST_FAILED" as const, message: value.message }, model: "test-model", provider: "openai" as const, responseMetadata: { finishReason: null, providerResponseBytes: 1, usage: { cacheHitTokens: 0, completionTokens: 7, promptTokens: 70, reasoningTokens: null } }, source: "provider:openai-responses-api" as const, success: false as const };
    return { model: "test-model", provider: "openai" as const, responseMetadata: { finishReason: "stop", providerResponseBytes: 10, usage: { cacheHitTokens: 0, completionTokens: 100, promptTokens: 1000, reasoningTokens: null } }, source: "provider:openai-responses-api" as const, success: true as const, text: typeof value === "string" ? value : JSON.stringify(value) };
  };
  return Object.assign(run, { prompts }) as unknown as EventOperationsModelRunner & { prompts: string[] };
}
const sentence = (ja: string, zh: string, en: string) => ({ en, ja, zh });
const item = (overrides: Record<string, unknown> = {}) => ({
  icebreakers: [sentence("最初にどの業務で試しますか？", "您打算先在哪个业务试用？", "Which workflow would you pilot first?"), sentence("導入の決め手は何でしたか？", "当时选择导入的关键是什么？", "What made the last rollout work?")],
  memberHint: sentence("{S1}さんと{S1C1}さんは導入事例から話すとよいです。", "{S1}和{S1C1}可以先聊导入案例。", "{S1} and {S1C1} can start from rollout stories."),
  rank: 1,
  reasons: [sentence("{S1}さんは医療分野の導入先を探しています。", "{S1}正在寻找医疗领域的合作方。", "{S1} is looking for a healthcare partner.")],
  score: 88,
  targetCandidateKey: "S1C1",
  ...overrides,
});
const twoCandidates = { eventId: "event:t", recommendationCount: 4, sources: [{ candidateParticipants: [bo, mira], sourceParticipant: yamada }] };
const doc = (...items: unknown[]) => ({ recommendations: [{ noMatchReason: null, recommendations: items, sourceKey: "S1" }] });

async function fails(value: unknown, input = twoCandidates, label = "") {
  const provider = createEventOperationsAiProvider({ trilingual: true, runModelText: sequence(value) });
  const result = await provider.generateRecommendations(input);
  assert.equal(result.success, false, label);
  if (!result.success) assert.equal(result.retryable, true, label);
}

test("placeholder scope: a recommendation may only name its own source and its own target", async () => {
  await fails(doc(item({ memberHint: sentence("{S1}さんと{S1C1}さん", "{S1}和{S1C1}", "{S1} and {S1C2}") })), twoCandidates, "en points at another candidate");
  await fails(doc(item({ memberHint: sentence("{S1}さんと{S1C2}さん", "{S1}和{S1C2}", "{S1} and {S1C2}") })), twoCandidates, "all three point at a candidate that is not this target");
});

test("placeholder consistency: the three languages of one sentence reference the same placeholders", async () => {
  await fails(doc(item({ memberHint: sentence("{S1}さんと{S1C1}さん", "{S1}和{S1C1}", "{S1} can start here.") })), twoCandidates, "en drops a person");
});

test("a company placeholder must belong to a person named in the same text", async () => {
  await fails(doc(item({ memberHint: sentence("{S1C1:company}の方と話す", "和{S1C1:company}的人聊", "Talk with someone at {S1C1:company}") })), twoCandidates, "company without its person");
  await fails(doc(item({ memberHint: sentence("{S1}さんは{S1C1:company}と話す", "{S1}和{S1C1:company}聊", "{S1} talks to {S1C1:company}") })), twoCandidates, "company of someone not named");
});

test("numbers must be the same in all three languages; equivalent wordings are not mismatches", async () => {
  await fails(doc(item({ reasons: [sentence("{S1}さんは3社と提携しています。", "{S1}已与3家公司合作。", "{S1} partners with 5 companies.")] })), twoCandidates);
  for (const [ja, zh, en] of [
    ["{S1}さんはフォロワー100万人です。", "{S1}有100万粉丝。", "{S1} has 1 million followers."],
    ["{S1}さんはフォロワー100万人です。", "{S1}有百万粉丝。", "{S1} has over one million followers."],
    ["{S1}さんは10年の経験があります。", "{S1}有十年经验。", "{S1} has a decade of experience."],
  ]) {
    const provider = createEventOperationsAiProvider({ trilingual: true, runModelText: sequence(doc(item({ reasons: [sentence(ja!, zh!, en!)] }))) });
    assert.equal((await provider.generateRecommendations(twoCandidates)).success, true, en);
  }
});

test("a registered name or company written by the model itself (not a placeholder) is rejected", async () => {
  await fails(doc(item({ memberHint: sentence("山田太郎さんと{S1C1}さん", "山田太郎和{S1C1}", "山田太郎 and {S1C1}") })), twoCandidates, "raw name");
  await fails(doc(item({ memberHint: sentence("{S1}さんは Beacon Health に注目", "{S1}关注 Beacon Health", "{S1} follows Beacon Health") })), twoCandidates, "raw Latin company");
});

test("a repair that leaves an unknown or changed placeholder fails the final check", async () => {
  const bad = item({ reasons: [sentence("{S1}正在寻找医疗领域的合作方。", "{S1}正在寻找医疗领域的合作方。", "{S1} seeks 医療 partners.")] });
  const leftover = createEventOperationsAiProvider({ trilingual: true, runModelText: sequence(doc(bad), { sentences: { s1: { en: "Meet {S1C9} about healthcare.", ja: "{S1}さんは医療分野の協業先を探しています。" } } }) });
  assert.equal((await leftover.generateRecommendations(twoCandidates)).success, false, "unknown placeholder after repair");
  const changed = createEventOperationsAiProvider({ trilingual: true, runModelText: sequence(doc(bad), { sentences: { s1: { en: "{S1C1} seeks healthcare partners.", ja: "{S1}さんは医療分野の協業先を探しています。" } } }) });
  assert.equal((await changed.generateRecommendations(twoCandidates)).success, false, "repair swapped the person");
});

test("usage of the first call is kept when the repair request itself fails", async () => {
  const bad = item({ reasons: [sentence("{S1}正在寻找医疗领域的合作方。", "{S1}正在寻找医疗领域的合作方。", "{S1} seeks 医療 partners.")] });
  const provider = createEventOperationsAiProvider({ trilingual: true, runModelText: sequence(doc(bad), new Error("upstream 503")) });
  const result = await provider.generateRecommendations(twoCandidates);
  assert.equal(result.success, false);
  assert.equal(result.responseMetadata?.usage?.promptTokens, 1070, "1000 from generation + 70 from the failed repair");
});

test("a null entry among recommendations is a structured failure, not a thrown error", async () => {
  await fails({ recommendations: [{ noMatchReason: null, recommendations: [item(), null], sourceKey: "S1" }] });
});

test("the trilingual prompt carries neither names nor companies", async () => {
  const runner = sequence(doc(item()));
  await createEventOperationsAiProvider({ trilingual: true, runModelText: runner }).generateRecommendations(twoCandidates);
  for (const value of ["山田太郎", "青空商事", "Beacon Health", "未来科技"]) assert.doesNotMatch(runner.prompts[0]!, new RegExp(value, "u"), value);
});

test("language rules: what passes and what does not (on placeholder text)", () => {
  const v = (ja: string, zh: string, en: string) => collectTrilingualOutputViolations({ en: [en], ja: [ja], zh: [zh] }, [yamada, mira]);
  assert.deepEqual(v("医療業界資金調達", "医疗行业融资", "Healthcare fundraising"), { chinese: [], english: [], japanese: [], names: [] }, "a Japanese noun-phrase title is fine");
  assert.equal(v("他正在寻找医疗领域的合作方。", "他正在寻找医疗领域的合作方。", "x").japanese.length, 1, "a Chinese sentence in the ja slot");
  assert.equal(v("テスト", "HELLO WORLD", "x").chinese.length, 1, "English in the zh slot");
  assert.equal(v("テスト", "資金調達について話しましょう。", "x").chinese.length, 1, "Japanese in the zh slot");
  assert.equal(v("テスト", "欢迎讨论未来科学。", "x").chinese.length, 0, "an ordinary phrase close to a company name is not a renamed company");
  assert.equal(v("テスト", "中文", "Meet 山田 about it").english.length, 1, "Han in en");
  assert.equal(v("{S1}さん", "{S1}", "{S1} and Yamada Taro").english.length, 0, "romanised names cannot be detected by characters (known limit)");
  assert.deepEqual(collectChineseOutputPolicyViolations(["利用 iPS 细胞和 mRNA 技术。"], []).disallowedTokens, [], "short mixed-case scientific abbreviations");
});

const tableRow = (key: string, seat: string, rationale = sentence(`{${key}}さんはこの卓に合います。`, `{${key}}适合这一桌。`, `{${key}} fits this table.`)) => ({
  memberKey: key,
  prompts: [sentence("最近の挑戦は？", "最近的挑战是什么？", "What is your latest challenge?"), sentence("次に会いたい人は？", "接下来想见谁？", "Who do you want to meet next?")],
  rationale,
  seat,
});
const tableDoc = (rows: unknown[]) => ({
  icebreakers: [sentence("一つ目の質問です", "第一个问题", "Question one"), sentence("二つ目の質問です", "第二个问题", "Question two"), sentence("三つ目の質問です", "第三个问题", "Question three")],
  members: rows,
  rationale: sentence("導入側と提供側がそろう卓です。", "导入方与提供方同桌。", "Buyers and builders share this table."),
  tableNumber: 1,
  theme: sentence("医療 AI の導入", "医疗 AI 导入", "Healthcare AI rollout"),
});
const tableInput = { eventId: "event:t", features: [], members: [yamada, bo], roundNumber: 1 as const, tableNumber: 1 };

test("table: a company placeholder of another member is rejected; the table prompt carries no names or companies", async () => {
  const good = createEventOperationsAiProvider({ trilingual: true, runModelText: sequence(tableDoc([tableRow("M1", "S1"), tableRow("M2", "S2")])) });
  assert.equal((await good.generateTableContent(tableInput)).success, true);
  const runner = sequence(tableDoc([tableRow("M1", "S1", sentence("{M1}さんは{M2:company}に詳しい", "{M1}熟悉{M2:company}", "{M1} knows {M2:company}")), tableRow("M2", "S2")]));
  const wrongCompany = createEventOperationsAiProvider({ trilingual: true, runModelText: runner });
  const result = await wrongCompany.generateTableContent(tableInput);
  assert.equal(result.success, false);
  if (!result.success) assert.equal(result.retryable, true);
  for (const value of ["山田太郎", "青空商事", "Beacon Health"]) assert.doesNotMatch(runner.prompts[0]!, new RegExp(value, "u"), value);
});

test("table: a placeholder of someone not at this table is rejected", async () => {
  const provider = createEventOperationsAiProvider({ trilingual: true, runModelText: sequence(tableDoc([tableRow("M1", "S1", sentence("{M3}さんと話す", "和{M3}聊", "Talk with {M3}")), tableRow("M2", "S2")])) });
  assert.equal((await provider.generateTableContent(tableInput)).success, false);
});

test("a \"none\" company value is not a company: never filled, never treated as a written name", async () => {
  const nobody = participant("d", "Kai", "暂无");
  const input = { eventId: "event:t", recommendationCount: 4, sources: [{ candidateParticipants: [nobody], sourceParticipant: yamada }] };
  const fills = createEventOperationsAiProvider({ trilingual: true, runModelText: sequence(doc(item({ memberHint: sentence("{S1C1:company}の{S1C1}さん", "{S1C1:company}的{S1C1}", "{S1C1} of {S1C1:company}") }))) });
  assert.equal((await fills.generateRecommendations(input)).success, false, "no registered company to insert");
  const ordinary = createEventOperationsAiProvider({ trilingual: true, runModelText: sequence(doc(item({ memberHint: sentence("{S1}さんは提携先がまだ暂无のようです。", "{S1}目前暂无合作方。", "{S1} has no partner yet.") }))) });
  const result = await ordinary.generateRecommendations(input);
  assert.equal(result.success, true, "the word 暂无 in text is not a written company name");
});

test("a key that lost its prefix is the only key of that shape; it is still scope-checked", async () => {
  const ok = createEventOperationsAiProvider({ trilingual: true, runModelText: sequence(doc(item({ memberHint: sentence("{1}さんと{1C1}さん", "{1}和{1C1}", "{1} and {1C1}") }))) });
  const result = await ok.generateRecommendations(twoCandidates);
  assert.equal(result.success, true);
  if (result.success) assert.equal(result.data[0]!.recommendations[0]!.i18n!.en.memberHint, "山田太郎 and Bo");
  await fails(doc(item({ memberHint: sentence("{1}さんと{1C2}さん", "{1}和{1C2}", "{1} and {1C2}") })), twoCandidates, "{1C2} is not this recommendation's target");
});
