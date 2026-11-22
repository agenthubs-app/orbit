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

type Kind = "choose" | "base" | "baseRepair" | "zh" | "en" | "repair";
/**
 * A fake model that answers by call kind. Translations default to a faithful stand-in (keeps the placeholders and
 * digits of the Japanese text) unless a test overrides them.
 */
function model(options: {
  base: unknown;
  choose?: unknown;
  translate?: (language: "zh" | "en", id: string, ja: string) => string | undefined;
  translationReply?: (language: "zh" | "en") => unknown;
  repair?: unknown;
  baseRepair?: unknown;
  fail?: Kind;
}) {
  const calls: Array<{ kind: Kind; userText: string }> = [];
  const usage = { cacheHitTokens: 0, completionTokens: 100, promptTokens: 1000, reasoningTokens: null };
  const run = async (input: { systemInstruction: string; userText: string }) => {
    const kind: Kind = input.systemInstruction.includes("You choose who should meet whom") ? "choose"
      : input.systemInstruction.includes("You fix single Japanese") ? "baseRepair"
      : input.systemInstruction.includes("language repair") ? "repair"
      : input.systemInstruction.includes("You translate Japanese") ? (input.systemInstruction.includes("Simplified Chinese") ? "zh" : "en")
      : "base";
    calls.push({ kind, userText: input.userText });
    const ok = (value: unknown) => ({ model: "test-model", provider: "openai" as const, responseMetadata: { finishReason: "stop", providerResponseBytes: 10, usage }, source: "provider:openai-responses-api" as const, success: true as const, text: typeof value === "string" ? value : JSON.stringify(value) });
    if (options.fail === kind) return { error: { code: "AI_REQUEST_FAILED" as const, message: "upstream 503" }, model: "test-model", provider: "openai" as const, responseMetadata: { finishReason: null, providerResponseBytes: 1, usage: { ...usage, completionTokens: 7, promptTokens: 70 } }, source: "provider:openai-responses-api" as const, success: false as const };
    if (kind === "choose") return ok(options.choose ?? { S1: [{ basis: [["S1.n1", "S1C1.o1"]], score: 90, target: "S1C1" }, { basis: [["S1.n1", "S1C2.o1"]], score: 80, target: "S1C2" }] });
    if (kind === "base") return ok(options.base);
    if (kind === "repair") return ok(options.repair ?? { sentences: {} });
    if (kind === "baseRepair") return ok(options.baseRepair ?? { texts: {} });
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

const pair = (overrides: Record<string, unknown> = {}) => ({
  hint: "まずは{TARGET}さんに導入事例から聞いてみましょう。",
  q1: "最初にどの業務で試しますか？",
  q2: "導入の決め手は何でしたか？",
  r1: { ev: ["S.n1", "T.o1"], text: "医療分野の導入先を探しているので、{TARGET}さんと話す価値があります。" },
  r2: { ev: ["T.n1", "S.o1"], text: "{TARGET}さんは導入支援の経験があります。" },
  ...overrides,
});
const two = { eventId: "event:t", recommendationCount: 2, sources: [{ candidateParticipants: [bo, mira], sourceParticipant: yamada }] };
const goodBase = (overrides: { p1?: Record<string, unknown>; p2?: Record<string, unknown> } = {}) => ({ "S1.p1": pair(overrides.p1), "S1.p2": pair(overrides.p2) });

async function failsRetryably(runner: EventOperationsModelRunner, input = two, label = "") {
  const result = await provider(runner).generateRecommendations(input);
  assert.equal(result.success, false, label);
  if (!result.success) assert.equal(result.retryable, true, label);
  return result;
}

test("happy path: exactly K picks, 2 reasons / 2 questions / 1 hint, names filled by id, base fields zh, i18n ja/zh/en", async () => {
  const runner = model({ base: goodBase(), translate: (language, id) => (id === "S1.p1.r1" ? (language === "zh" ? "您正在寻找医疗领域的合作方，值得和{S1C1}聊聊。" : "You are looking for a healthcare partner, so {S1C1} is worth meeting.") : undefined) });
  const result = await provider(runner).generateRecommendations(two);
  assert.equal(result.success, true);
  if (!result.success) return;
  const row = result.data[0]!;
  assert.deepEqual(row.recommendations.map((item) => [item.targetParticipantId, item.rank]), [["participant:b", 1], ["participant:c", 2]]);
  const first = row.recommendations[0]!;
  assert.equal(first.reasons.length, 2);
  assert.equal(first.icebreakers.length, 2);
  assert.equal(first.reasons[0], "您正在寻找医疗领域的合作方，值得和Bo聊聊。", "base string fields are the zh translation, names filled; the reader is 您");
  assert.equal(first.i18n!.ja.reasons[0], "医療分野の導入先を探しているので、Boさんと話す価値があります。");
  assert.equal(first.i18n!.en.reasons[0], "You are looking for a healthcare partner, so Bo is worth meeting.");
  assert.deepEqual(runner.calls.map((call) => call.kind).sort(), ["base", "choose", "en", "zh"], "choose, one base draft, one call per translation");
  for (const value of ["山田太郎", "青空商事", "Beacon Health", "未来科技"]) assert.doesNotMatch(runner.calls[0]!.userText, new RegExp(value, "u"), `prompt carries no ${value}`);
  assert.doesNotMatch(runner.calls.find((call) => call.kind === "zh")!.userText, /score|target|S1C2"/u, "translation never sees the choice");
});

test("exactly K: fewer picks, a duplicate target, or a target outside the shortlist fails the batch (no dedupe, no shrinking)", async () => {
  await failsRetryably(model({ base: goodBase(), choose: { S1: [{ basis: [["S1.n1", "S1C1.o1"]], score: 90, target: "S1C1" }] } }), two, "one pick where two are required");
  await failsRetryably(model({ base: goodBase(), choose: { S1: [{ basis: [["S1.n1", "S1C1.o1"]], score: 90, target: "S1C1" }, { basis: [["S1.n1", "S1C1.o1"]], score: 80, target: "S1C1" }] } }), two, "duplicate target");
  await failsRetryably(model({ base: goodBase(), choose: { S1: [{ basis: [["S1.n1", "S1C1.o1"]], score: 90, target: "S1C1" }, { basis: [["S1.n1", "S1C9.o1"]], score: 80, target: "S1C9" }] } }), two, "not in the shortlist");
  await failsRetryably(model({ base: goodBase(), choose: { S1: [{ basis: [["S1.n1", "S1C1.o1"]], score: 90.5, target: "S1C1" }, { basis: [["S1.n1", "S1C2.o1"]], score: 80, target: "S1C2" }] } }), two, "score must be an integer");
  await failsRetryably(model({ base: goodBase(), choose: { S1: [{ basis: [["S1.n1", "S1C1.o1"]], score: 90, target: "S1C1" }, null] } }), two, "a null pick is a structured failure");
  await failsRetryably(model({ base: { "S1.p1": pair() } }), two, "a text row missing for a chosen pair");
});

test("the text is bound to its pair: only {TARGET} exists (the reader is addressed, not named), so it cannot drift to another candidate", async () => {
  const runner = model({ base: goodBase(), choose: { S1: [{ basis: [["S1.n1", "S1C2.o1"]], score: 90, target: "S1C2" }, { basis: [["S1.n1", "S1C1.o1"]], score: 80, target: "S1C1" }] } });
  const result = await provider(runner).generateRecommendations(two);
  assert.equal(result.success, true);
  if (!result.success) return;
  assert.equal(result.data[0]!.recommendations[0]!.targetParticipantId, "participant:c");
  assert.equal(result.data[0]!.recommendations[0]!.i18n!.ja.memberHint, "まずはMiraさんに導入事例から聞いてみましょう。", "{TARGET} is this pick's target");
  const writePrompt = runner.calls.find((call) => call.kind === "base")!.userText;
  assert.doesNotMatch(writePrompt, /S1C\d/u, "the writer never sees candidate keys");
  await failsRetryably(model({ base: goodBase({ p1: { hint: "{S1C2}さんにも会うとよいです。" } }) }), two, "a candidate key written into text");
});

test("no candidates: none is one sentence and there are no picks", async () => {
  const empty = { eventId: "event:t", recommendationCount: 4, sources: [{ candidateParticipants: [], sourceParticipant: yamada }] };
  const ok = await provider(model({ base: { "S1.none": { none: "今回は条件に合う参加者がいません。" } }, choose: { S1: [] } })).generateRecommendations(empty);
  assert.equal(ok.success, true);
  if (ok.success) assert.equal(ok.data[0]!.noMatchReasonI18n?.ja, "今回は条件に合う参加者がいません。");
  await failsRetryably(model({ base: { "S1.none": { none: "" } }, choose: { S1: [] } }), empty, "none empty");
});

test("company pairing in the base draft", async () => {
  await failsRetryably(model({ base: goodBase({ p1: { r2: { ev: ["T.n1", "S.o1"], text: "{TARGET:company}の事例が参考になります。" } } }) }), two, "company without its person");
});

test("a translation that changes people, placeholders, or numbers fails; it cannot re-choose", async () => {
  await failsRetryably(model({ base: goodBase(), translate: (language, id) => (language === "en" && id === "S1.p1.hint" ? "Ask {S1C2} first." : undefined) }), two, "en swaps the person");
  await failsRetryably(model({ base: goodBase({ p1: { r2: { ev: ["T.n1", "S.o1"], text: "{TARGET}さんは3社を支援しています。" } } }), translate: (language, id) => (language === "en" && id === "S1.p1.r2" ? "{S1C1} has supported 5 companies." : undefined) }), two, "number changed");
});

test("translation ids must match exactly; a bad shape is retried once, then the batch fails", async () => {
  const runner = model({ base: goodBase(), translationReply: (language) => (language === "zh" ? { items: { "S1.p1.r1": "只有一条" } } : undefined) });
  await failsRetryably(runner, two);
  assert.equal(runner.calls.filter((call) => call.kind === "zh").length, 2, "zh asked twice");
});

test("names: a registered name or company written in the base or in a translation is rejected", async () => {
  await failsRetryably(model({ base: goodBase({ p1: { r1: { ev: ["S.n1", "T.o1"], text: "山田太郎さんは医療分野の導入先を探しています。" } } }) }), two, "raw name in base");
  await failsRetryably(model({ base: goodBase(), translate: (language, id) => (language === "en" && id === "S1.p1.r2" ? "{S1C1} works at Beacon Health." : undefined) }), two, "raw company in en");
});

test("language: a flagged translation gets one repair from the Japanese, keeping placeholders; the full check runs again", async () => {
  const good = model({
    base: goodBase(),
    repair: { sentences: { s1: { en: "You are looking for a healthcare partner, so {S1C1} is worth meeting." } } },
    translate: (language, id) => (language === "en" && id === "S1.p1.r1" ? "You seek 医療 partners; meet {S1C1}." : undefined),
  });
  const ok = await provider(good).generateRecommendations(two);
  assert.equal(ok.success, true);
  const repairCall = good.calls.find((call) => call.kind === "repair")!;
  assert.match(repairCall.userText, /医療分野の導入先を探しているので、\{S1C1\}さんと話す価値があります。/u);
  assert.match(repairCall.userText, /医療分野の導入先を探しているので、\{S1C1\}さんと話す価値があります。/u);
  const stillBad = model({ base: goodBase(), repair: { sentences: { s1: { en: "Meet {S1C2} about healthcare." } } }, translate: (language, id) => (language === "en" && id === "S1.p1.r1" ? "You seek 医療 partners; meet {S1C1}." : undefined) });
  await failsRetryably(stillBad, two, "repair that swaps the person");
});

test("usage of earlier calls is kept when a translation request fails", async () => {
  const result = await provider(model({ base: goodBase(), fail: "en" })).generateRecommendations(two);
  assert.equal(result.success, false);
  assert.ok((result.responseMetadata?.usage?.promptTokens ?? 0) >= 1070, "base 1000 + failed en 70 (+ zh 1000 if it finished)");
});

test("a \"none\" company value is never a company, and the word in text is not a written name", async () => {
  const input = { eventId: "event:t", recommendationCount: 1, sources: [{ candidateParticipants: [kai], sourceParticipant: yamada }] };
  await failsRetryably(model({ base: { "S1.p1": pair({ hint: "{TARGET:company}の{TARGET}さんに聞きましょう。" }) }, choose: { S1: [{ basis: [["S1.n1", "S1C1.o1"]], score: 80, target: "S1C1" }] } }), input, "no company to insert");
  const ok = await provider(model({ base: { "S1.p1": pair({ r2: { ev: ["T.n1", "S.o1"], text: "{TARGET}さんは提携先がまだ暂无のようです。" } }) }, choose: { S1: [{ basis: [["S1.n1", "S1C1.o1"]], score: 80, target: "S1C1" }] } })).generateRecommendations(input);
  assert.equal(ok.success, true);
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

test("JSON missing only its final closing brackets is completed (syntax only); anything else stays invalid", async () => {
  const { parseJsonClosingTail } = await import("../../features/events/event-operations/ai-provider");
  assert.deepEqual(parseJsonClosingTail('{"a":{"b":"x}"}'), { a: { b: "x}" } }, "a brace inside a string is text, not structure");
  assert.deepEqual(parseJsonClosingTail('{"a":[1,2]'), { a: [1, 2] });
  assert.equal(parseJsonClosingTail('{"a":"unfinished'), null, "an unfinished string is not repaired");
  assert.equal(parseJsonClosingTail('{"a":1]}'), null, "a wrong closer is not repaired");
  assert.equal(parseJsonClosingTail('{"a":[1,2]', "length"), null, "output cut by the length limit is never completed");
  const cut = JSON.stringify({ "S1.p1": pair() });
  const truncated = await provider(model({ base: cut.slice(0, -1) })).generateRecommendations(two);
  assert.equal(truncated.success, false, "completing a truncated output that lost a whole pair still fails the exact-keys check");
  const text = JSON.stringify({ "S1.p1": pair(), "S1.p2": pair() });
  const ok = await provider(model({ base: text.slice(0, -1) })).generateRecommendations(two);
  assert.equal(ok.success, true, "the write step's output one brace short");
});

test("trailing markup after the JSON (leaked tool-call tags) is a retryable failure, never trimmed", async () => {
  const text = `${JSON.stringify({ "S1.p1": pair(), "S1.p2": pair() })}</｜｜DSML｜｜ parameter>`;
  await failsRetryably(model({ base: text }), two);
});

// ---------------------------------------------------------------------------------------------------------------
// Fact anchors (2026-11-22). Facts: S = source (n1 資金調達, o1 SaaS 導入, t1 AI, c1 AI, c2 CEO), T = target (same shape).
// The four errors found by hand in the 12-person sample, de-identified, must fail; the fourth kind (a stretched but
// legal need×offer pair) is left to semantic review and passes the program.
// ---------------------------------------------------------------------------------------------------------------
const withReason = (field: "r1" | "r2", ev: string[], text: string) => goodBase({ p1: { [field]: { ev, text } } });

test("error kind 1 — one person's need presented as the other's: a need and an offer of the same owner is not a pair", async () => {
  await failsRetryably(model({ base: withReason("r2", ["T.o1", "T.n1"], "{TARGET}さんはSaaS導入を支援でき、あなたが相談したい資金調達に応えられます。") }), two);
});

test("error kind 2 — a topic presented as expertise: need × topic is not a pair", async () => {
  await failsRetryably(model({ base: withReason("r1", ["S.n1", "T.t1"], "{TARGET}さんのAIの知見があなたの資金調達に役立ちます。") }), two);
});

test("error kind 4 — a need presented as an offer: need × need is not a pair", async () => {
  await failsRetryably(model({ base: withReason("r1", ["S.n1", "T.n1"], "{TARGET}さんの資金調達の経験があなたに役立ちます。") }), two);
});

test("error kind 3 — a stretched claim on a legal need × offer pair passes the program (left to semantic review)", async () => {
  const ok = await provider(model({ base: withReason("r1", ["S.n1", "T.o1"], "{TARGET}さんのSaaS導入の人脈が、あなたの投資家探しの橋渡しになります。") })).generateRecommendations(two);
  assert.equal(ok.success, true);
});

test("evidence rules: unknown facts, a need left unanswered, a reason off the chosen basis, and an illegal basis all fail", async () => {
  await failsRetryably(model({ base: withReason("r1", ["S.n9", "T.o1"], "資金調達について{TARGET}さんと話せます。") }), two, "unknown fact");
  await failsRetryably(model({ base: withReason("r1", ["S.n1", "T.o1", "T.n1"], "資金調達について{TARGET}さんと話せます。") }), two, "T.n1 has no answering offer in this reason");
  assert.equal((await provider(model({ base: withReason("r1", ["S.n1", "T.o1", "T.c2"], "資金調達について{TARGET}さんと話せます。") })).generateRecommendations(two)).success, true, "context facts may accompany a pair");
  await failsRetryably(model({ base: goodBase({ p1: { r1: { ev: ["S.t1", "T.t1"], text: "あなたと{TARGET}さんはAIに関心があります。" }, r2: { ev: ["S.t1", "T.t1"], text: "{TARGET}さんもAIに関心があります。" } } }) }), two, "neither reason uses the chosen need×offer basis");
  await failsRetryably(model({ base: goodBase(), choose: { S1: [{ basis: [["S1.n1", "S1.o1"]], score: 90, target: "S1C1" }, { basis: [["S1.n1", "S1C2.o1"]], score: 80, target: "S1C2" }] } }), two, "a basis with no legal pair left");
  const mixed = model({ base: goodBase(), choose: { S1: [{ basis: [["S1.n1", "S1C1.n1"], ["S1.n9", "S1C1.o1"], ["S1.n1", "S1C1.o1"]], score: 90, target: "S1C1" }, { basis: [["S1.n1", "S1C2.o1"]], score: 80, target: "S1C2" }] } });
  assert.equal((await provider(mixed).generateRecommendations(two)).success, true, "illegal and unknown pairs are dropped when a legal one remains");
  assert.match(mixed.calls.find((call) => call.kind === "base")!.userText, /"basis":\[\["S\.n1","T\.o1"\]\]/u, "the writer gets only the legal pair");
  await failsRetryably(model({ base: goodBase(), choose: { S1: [{ basis: [], score: 90, target: "S1C1" }, { basis: [["S1.n1", "S1C2.o1"]], score: 80, target: "S1C2" }] } }), two, "no basis");
});

test("the writer sees owned, typed facts and the basis; evidence never reaches attendees", async () => {
  const runner = model({ base: goodBase() });
  const result = await provider(runner).generateRecommendations(two);
  assert.equal(result.success, true);
  const writePrompt = runner.calls.find((call) => call.kind === "base")!.userText;
  assert.match(writePrompt, /"id":"S\.n1","kind":"need","text":"資金調達"/u);
  assert.match(writePrompt, /"basis":\[\["S\.n1","T\.o1"\]\]/u);
  assert.doesNotMatch(JSON.stringify(result), /"ev"|S\.n1|T\.o1/u, "no evidence in the output");
});

test("style: questions are addressed directly (no placeholders); Japanese names always get exactly one さん", async () => {
  await failsRetryably(model({ base: goodBase({ p1: { q1: "{TARGET}さんが最初に試す業務は？" } }) }), two, "a question in the third person");
  await failsRetryably(model({ base: goodBase({ p1: { q2: "{S1}さんの事例は参考になりそうですか？" } }) }), two, "the asker never names themselves either (no self-honorific)");
  const ok = await provider(model({ base: goodBase({ p1: { hint: "まずは{TARGET}様に聞くとよいです。" } }) })).generateRecommendations(two);
  assert.equal(ok.success, true);
  if (ok.success) assert.equal(ok.data[0]!.recommendations[0]!.i18n!.ja.memberHint, "まずはBoさんに聞くとよいです。");
});

test("style: 贵公司 and 你 are repaired from the Japanese; calques are steered, not failed", async () => {
  const runner = model({
    base: goodBase(),
    repair: { sentences: { s1: { zh: "您正在寻找医疗领域的合作伙伴，值得和{S1C1}聊聊。" } } },
    translate: (language, id) => (language === "zh" && id === "S1.p1.r1" ? "你正在寻找合作方，可以和{S1C1}聊聊。" : undefined),
  });
  const ok = await provider(runner).generateRecommendations(two);
  assert.equal(ok.success, true);
  assert.ok(runner.calls.some((call) => call.kind === "repair"));
  assert.equal(collectTrilingualOutputViolations({ en: [], ja: [], zh: ["请问你最近在做什么？"] }, []).chinese.length, 1, "你 → 您");
  assert.equal(collectTrilingualOutputViolations({ en: [], ja: [], zh: ["您目前面临的课题是什么？"] }, []).chinese.length, 0, "a calque is not a failure");
});

test("per-text repair: a base text breaking a rule is rewritten once and checked again; a translation that drifts is re-translated from the Japanese", async () => {
  const fixedQuestion = model({ base: goodBase({ p1: { q1: "{TARGET}さんが最初に試す業務は？" } }), baseRepair: { texts: { t1: "最初にどの業務で試しますか？" } } });
  const ok = await provider(fixedQuestion).generateRecommendations(two);
  assert.equal(ok.success, true, "question naming the target is fixed by one rewrite");
  assert.ok(fixedQuestion.calls.some((call) => call.kind === "baseRepair"));
  const stillBad = model({ base: goodBase({ p1: { q1: "{TARGET}さんが最初に試す業務は？" } }), baseRepair: { texts: { t1: "{TARGET}さんは何から始めますか？" } } });
  await failsRetryably(stillBad, two, "a rewrite that keeps the problem fails the batch");
  const drifted = model({
    base: goodBase(),
    repair: { sentences: { s1: { en: "Start by asking {S1C1} about rollout stories." } } },
    translate: (language, id) => (language === "en" && id === "S1.p1.hint" ? "Ask {S1C2} first." : undefined),
  });
  const reTranslated = await provider(drifted).generateRecommendations(two);
  assert.equal(reTranslated.success, true, "a translation naming another person is re-translated from the Japanese");
  assert.match(drifted.calls.find((call) => call.kind === "repair")!.userText, /"source":"ja"/u);
});

test("the reader is addressed, never named: a base text naming them is rewritten once, or the batch fails", async () => {
  const fixed = model({ base: goodBase({ p1: { hint: "{SOURCE}さんは{TARGET}さんに聞くとよいです。" } }), baseRepair: { texts: { t1: "まずは{TARGET}さんに聞いてみましょう。" } } });
  const ok = await provider(fixed).generateRecommendations(two);
  assert.equal(ok.success, true);
  if (ok.success) assert.equal(ok.data[0]!.recommendations[0]!.i18n!.ja.memberHint, "まずはBoさんに聞いてみましょう。");
  await failsRetryably(model({ base: goodBase({ p1: { hint: "{SOURCE}さんは{TARGET}さんに聞くとよいです。" } }), baseRepair: { texts: { t1: "{SOURCE}さんから聞きましょう。" } } }), two, "still naming the reader");
});
