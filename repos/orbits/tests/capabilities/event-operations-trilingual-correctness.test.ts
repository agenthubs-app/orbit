/**
 * Trilingual event AI, base-then-translate (2026-11-22): the model writes one Japanese base draft with fixed
 * keys; zh and en are translations of it. Every correctness hole from the Codex review must fail here.
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
const kai = participant("d", "Kai", "暂无");

type Kind = "base" | "zh" | "en" | "repair";
/**
 * A fake model that answers by call kind. Translations default to a faithful stand-in (keeps the placeholders and
 * digits of the Japanese text) unless a test overrides them.
 */
function model(options: {
  base: unknown;
  translate?: (language: "zh" | "en", id: string, ja: string) => string | undefined;
  translationReply?: (language: "zh" | "en") => unknown;
  repair?: unknown;
  fail?: Kind;
}) {
  const calls: Array<{ kind: Kind; userText: string }> = [];
  const usage = { cacheHitTokens: 0, completionTokens: 100, promptTokens: 1000, reasoningTokens: null };
  const run = async (input: { systemInstruction: string; userText: string }) => {
    const kind: Kind = input.systemInstruction.includes("language repair") ? "repair"
      : input.systemInstruction.includes("You translate Japanese") ? (input.systemInstruction.includes("Simplified Chinese") ? "zh" : "en")
      : "base";
    calls.push({ kind, userText: input.userText });
    const ok = (value: unknown) => ({ model: "test-model", provider: "openai" as const, responseMetadata: { finishReason: "stop", providerResponseBytes: 10, usage }, source: "provider:openai-responses-api" as const, success: true as const, text: typeof value === "string" ? value : JSON.stringify(value) });
    if (options.fail === kind) return { error: { code: "AI_REQUEST_FAILED" as const, message: "upstream 503" }, model: "test-model", provider: "openai" as const, responseMetadata: { finishReason: null, providerResponseBytes: 1, usage: { ...usage, completionTokens: 7, promptTokens: 70 } }, source: "provider:openai-responses-api" as const, success: false as const };
    if (kind === "base") return ok(options.base);
    if (kind === "repair") return ok(options.repair ?? { sentences: {} });
    const language = kind;
    const custom = options.translationReply?.(language);
    if (custom !== undefined) return ok(custom);
    const items = JSON.parse(input.userText.slice(input.userText.indexOf("\n") + 1)).items as Record<string, string>;
    const stand = (ja: string) => {
      const keep = [...(ja.match(/\{[^{}]+\}/gu) ?? []), ...(ja.match(/\d+/gu) ?? [])].join(" ");
      return language === "zh" ? `中文说明 ${keep}` : `English text ${keep}`;
    };
    return ok({ items: Object.fromEntries(Object.entries(items).map(([id, ja]) => [id, options.translate?.(language, id, ja) ?? stand(ja)])) });
  };
  return Object.assign(run, { calls }) as unknown as EventOperationsModelRunner & { calls: Array<{ kind: Kind; userText: string }> };
}
const provider = (runner: EventOperationsModelRunner) => createEventOperationsAiProvider({ trilingual: true, runModelText: runner });

const pick = (target: string, overrides: Record<string, unknown> = {}) => ({
  hint: `{S1}さんは{${target}}さんに導入事例から聞くとよいです。`,
  q1: "最初にどの業務で試しますか？",
  q2: "導入の決め手は何でしたか？",
  r1: `{S1}さんは医療分野の導入先を探しています。`,
  r2: `{${target}}さんは導入支援の経験があります。`,
  score: 80,
  target,
  ...overrides,
});
const two = { eventId: "event:t", recommendationCount: 2, sources: [{ candidateParticipants: [bo, mira], sourceParticipant: yamada }] };
const goodBase = (overrides: { p1?: Record<string, unknown>; p2?: Record<string, unknown> } = {}) => ({ S1: { none: null, p1: pick("S1C1", overrides.p1), p2: pick("S1C2", overrides.p2) } });

async function failsRetryably(runner: EventOperationsModelRunner, input = two, label = "") {
  const result = await provider(runner).generateRecommendations(input);
  assert.equal(result.success, false, label);
  if (!result.success) assert.equal(result.retryable, true, label);
  return result;
}

test("happy path: exactly K picks, 2 reasons / 2 questions / 1 hint, names filled by id, base fields zh, i18n ja/zh/en", async () => {
  const runner = model({ base: goodBase(), translate: (language, id) => (id === "S1.p1.r1" ? (language === "zh" ? "{S1}正在寻找医疗领域的合作方。" : "{S1} is looking for a healthcare partner.") : undefined) });
  const result = await provider(runner).generateRecommendations(two);
  assert.equal(result.success, true);
  if (!result.success) return;
  const row = result.data[0]!;
  assert.deepEqual(row.recommendations.map((item) => [item.targetParticipantId, item.rank]), [["participant:b", 1], ["participant:c", 2]]);
  const first = row.recommendations[0]!;
  assert.equal(first.reasons.length, 2);
  assert.equal(first.icebreakers.length, 2);
  assert.equal(first.reasons[0], "山田太郎正在寻找医疗领域的合作方。", "base string fields are the zh translation, names filled");
  assert.equal(first.i18n!.ja.reasons[0], "山田太郎さんは医療分野の導入先を探しています。");
  assert.equal(first.i18n!.en.reasons[0], "山田太郎 is looking for a healthcare partner.");
  assert.deepEqual(runner.calls.map((call) => call.kind).sort(), ["base", "en", "zh"], "one base draft, one call per translation");
  for (const value of ["山田太郎", "青空商事", "Beacon Health", "未来科技"]) assert.doesNotMatch(runner.calls[0]!.userText, new RegExp(value, "u"), `prompt carries no ${value}`);
  assert.doesNotMatch(runner.calls.find((call) => call.kind === "zh")!.userText, /score|target|S1C2"/u, "translation never sees the choice");
});

test("exactly K: fewer picks, a duplicate target, or a target outside the shortlist fails the batch (no dedupe, no shrinking)", async () => {
  await failsRetryably(model({ base: { S1: { none: null, p1: pick("S1C1") } } }), two, "one pick where two are required");
  await failsRetryably(model({ base: goodBase({ p2: { target: "S1C1" } }) }), two, "duplicate target");
  await failsRetryably(model({ base: goodBase({ p2: { target: "S1C9" } }) }), two, "not in the shortlist");
  await failsRetryably(model({ base: goodBase({ p1: { score: 80.5 } }) }), two, "score must be an integer");
  await failsRetryably(model({ base: { S1: { none: null, p1: pick("S1C1"), p2: null } } }), two, "a null pick is a structured failure");
});

test("no candidates: none is one sentence and there are no picks", async () => {
  const empty = { eventId: "event:t", recommendationCount: 4, sources: [{ candidateParticipants: [], sourceParticipant: yamada }] };
  const ok = await provider(model({ base: { S1: { none: "{S1}さんの条件に合う参加者は今回いません。" } } })).generateRecommendations(empty);
  assert.equal(ok.success, true);
  if (ok.success) assert.equal(ok.data[0]!.noMatchReasonI18n?.ja, "山田太郎さんの条件に合う参加者は今回いません。");
  await failsRetryably(model({ base: { S1: { none: null } } }), empty, "none missing");
});

test("placeholder scope and pairing in the base draft", async () => {
  await failsRetryably(model({ base: goodBase({ p1: { hint: "{S1}さんは{S1C2}さんにも会うとよいです。" } }) }), two, "p1 text names p2's target");
  await failsRetryably(model({ base: goodBase({ p1: { r2: "{S1C1:company}の事例が参考になります。" } }) }), two, "company without its person");
  await failsRetryably(model({ base: goodBase({ p1: { r2: "{S1}さんは{S1C2:company}と話すとよいです。" } }) }), two, "company of someone not in this pick");
});

test("a translation that changes people, placeholders, or numbers fails; it cannot re-choose", async () => {
  await failsRetryably(model({ base: goodBase(), translate: (language, id) => (language === "en" && id === "S1.p1.hint" ? "{S1} should ask {S1C2} first." : undefined) }), two, "en swaps the person");
  await failsRetryably(model({ base: goodBase({ p1: { r2: "{S1C1}さんは3社を支援しています。" } }), translate: (language, id) => (language === "en" && id === "S1.p1.r2" ? "{S1C1} has supported 5 companies." : undefined) }), two, "number changed");
});

test("translation ids must match exactly; a bad shape is retried once, then the batch fails", async () => {
  const runner = model({ base: goodBase(), translationReply: (language) => (language === "zh" ? { items: { "S1.p1.r1": "只有一条" } } : undefined) });
  await failsRetryably(runner, two);
  assert.equal(runner.calls.filter((call) => call.kind === "zh").length, 2, "zh asked twice");
});

test("names: a registered name or company written in the base or in a translation is rejected", async () => {
  await failsRetryably(model({ base: goodBase({ p1: { r1: "山田太郎さんは医療分野の導入先を探しています。" } }) }), two, "raw name in base");
  await failsRetryably(model({ base: goodBase(), translate: (language, id) => (language === "en" && id === "S1.p1.r2" ? "{S1C1} works at Beacon Health." : undefined) }), two, "raw company in en");
});

test("language: a flagged translation gets one repair from the Japanese, keeping placeholders; the full check runs again", async () => {
  const good = model({
    base: goodBase(),
    repair: { sentences: { s1: { en: "{S1} is looking for a healthcare partner." } } },
    translate: (language, id) => (language === "en" && id === "S1.p1.r1" ? "{S1} seeks 医療 partners." : undefined),
  });
  const ok = await provider(good).generateRecommendations(two);
  assert.equal(ok.success, true);
  const repairCall = good.calls.find((call) => call.kind === "repair")!;
  assert.match(repairCall.userText, /"source":"ja"/u);
  assert.match(repairCall.userText, /\{S1\}さんは医療分野の導入先を探しています。/u);
  const stillBad = model({ base: goodBase(), repair: { sentences: { s1: { en: "Meet {S1C2} about healthcare." } } }, translate: (language, id) => (language === "en" && id === "S1.p1.r1" ? "{S1} seeks 医療 partners." : undefined) });
  await failsRetryably(stillBad, two, "repair that swaps the person");
});

test("usage of earlier calls is kept when a translation request fails", async () => {
  const result = await provider(model({ base: goodBase(), fail: "en" })).generateRecommendations(two);
  assert.equal(result.success, false);
  assert.ok((result.responseMetadata?.usage?.promptTokens ?? 0) >= 1070, "base 1000 + failed en 70 (+ zh 1000 if it finished)");
});

test("a \"none\" company value is never a company, and the word in text is not a written name", async () => {
  const input = { eventId: "event:t", recommendationCount: 1, sources: [{ candidateParticipants: [kai], sourceParticipant: yamada }] };
  await failsRetryably(model({ base: { S1: { none: null, p1: pick("S1C1", { hint: "{S1C1:company}の{S1C1}さんに聞きましょう。" }) } } }), input, "no company to insert");
  const ok = await provider(model({ base: { S1: { none: null, p1: pick("S1C1", { r2: "{S1C1}さんは提携先がまだ暂无のようです。" }) } } })).generateRecommendations(input);
  assert.equal(ok.success, true);
});

test("prefix-less and {SOURCE} keys are the row's S-keys, still scope-checked", async () => {
  const ok = await provider(model({ base: goodBase({ p1: { hint: "{SOURCE}さんは{1C1}さんに聞くとよいです。" } }) })).generateRecommendations(two);
  assert.equal(ok.success, true);
  if (ok.success) assert.equal(ok.data[0]!.recommendations[0]!.i18n!.ja.memberHint, "山田太郎さんはBoさんに聞くとよいです。");
  await failsRetryably(model({ base: goodBase({ p1: { hint: "{1}さんは{1C2}さんに聞くとよいです。" } }) }), two, "{1C2} is not p1's target");
});

const tableInput = { eventId: "event:t", features: [], members: [yamada, bo], roundNumber: 1 as const, tableNumber: 3 };
const tableBase = (overrides: Record<string, unknown> = {}) => ({
  members: { M1: { p1: "最近の挑戦は何ですか？", p2: "次に会いたい人は？", why: "{M1}さんは導入先を探しています。" }, M2: { p1: "検証の期間は？", p2: "成果の指標は？", why: "{M2}さんは導入実績があります。" } },
  q1: "一つ目の質問です。", q2: "二つ目の質問です。", q3: "三つ目の質問です。", rationale: "導入側と提供側がそろう卓です。", theme: "医療 AI の導入",
  ...overrides,
});

test("table: fixed keys, seats from the program, names by id, three languages", async () => {
  const runner = model({ base: tableBase() });
  const result = await provider(runner).generateTableContent(tableInput);
  assert.equal(result.success, true);
  if (!result.success) return;
  assert.deepEqual(result.data.members, [{ participantId: "participant:a", seat: "R1-T3-S1" }, { participantId: "participant:b", seat: "R1-T3-S2" }]);
  assert.equal(result.data.i18n!.ja.memberRationales["participant:a"], "山田太郎さんは導入先を探しています。");
  assert.equal(result.data.icebreakers.length, 3);
  for (const value of ["山田太郎", "青空商事", "Beacon Health"]) assert.doesNotMatch(runner.calls[0]!.userText, new RegExp(value, "u"), value);
});

test("table: a missing member row, another member's company, or someone not at the table fails", async () => {
  const one = tableBase(); delete (one.members as Record<string, unknown>).M2;
  for (const [label, base] of [
    ["missing member", one],
    ["other member's company", tableBase({ members: { ...tableBase().members, M1: { ...tableBase().members.M1, why: "{M1}さんは{M2:company}に詳しいです。" } } })],
    ["not at this table", tableBase({ theme: "{M3}さんと話す卓" })],
  ] as const) {
    const result = await provider(model({ base })).generateTableContent(tableInput);
    assert.equal(result.success, false, label);
    if (!result.success) assert.equal(result.retryable, true, label);
  }
});

test("language rules on placeholder text: what passes and what does not", () => {
  const v = (ja: string, zh: string, en: string) => collectTrilingualOutputViolations({ en: [en], ja: [ja], zh: [zh] }, [yamada, mira]);
  assert.deepEqual(v("医療業界資金調達", "医疗行业融资", "Healthcare fundraising"), { chinese: [], english: [], japanese: [], names: [] }, "a Japanese noun-phrase title is fine");
  assert.equal(v("他正在寻找医疗领域的合作方。", "他正在寻找医疗领域的合作方。", "x").japanese.length, 1, "a Chinese sentence in the ja slot");
  assert.equal(v("テスト", "HELLO WORLD", "x").chinese.length, 1, "English in the zh slot");
  assert.equal(v("テスト", "資金調達について話しましょう。", "x").chinese.length, 1, "Japanese in the zh slot");
  assert.equal(v("テスト", "欢迎讨论未来科学。", "x").chinese.length, 0, "an ordinary phrase close to a company name is fine");
  assert.equal(v("テスト", "中文", "Meet 山田 about it").english.length, 1, "Han in en");
  assert.equal(v("{S1}さん", "{S1}", "{S1} and Yamada Taro").english.length, 0, "romanised names cannot be detected by characters (known limit)");
  assert.deepEqual(collectChineseOutputPolicyViolations(["利用 iPS 细胞和 mRNA 技术。"], []).disallowedTokens, [], "short mixed-case scientific abbreviations");
});
