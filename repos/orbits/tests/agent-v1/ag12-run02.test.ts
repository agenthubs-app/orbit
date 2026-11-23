import assert from "node:assert/strict";
import test from "node:test";

import { withoutOnlineDenials, withoutQuoteResidue } from "../../features/agent-v1/answer/claims";
import { expiryLine } from "../../features/agent-v1/answer/change-check";
import type { Material } from "../../features/agent-v1/answer/schema";
import { stripCardTalk } from "../../features/agent-v1/entry/approval-claims";
import { decideRoute } from "../../features/agent-v1/route/decide";
import { ACTOR, contactWorld, json, runContact } from "./contact-kit";
import { memo } from "./read-kit";

/**
 * agent-design AG12 run-02 (coordinator review of run-01): four sentence rules, all in code.
 * 1. AE-WEB-004 R3: a sentence that says Orbit cannot go online loses only that clause; the sourced remainder stays.
 * 2. AE-CTX-005 R1: when a sentence about a confirmation card is dropped, a request to confirm that refers to it goes too.
 * 3. AE-SCL-016 R2: a cited record that itself says an earlier value has expired gets that sentence said by code.
 * 4. AE-AMB-011: no empty or unbalanced quote is left on screen after a strip rule.
 */

test("1 AE-WEB-004 R3: only the clause denying the web goes; the note's sourced content stays (zh, ja, en)", () => {
  const zh = withoutOnlineDenials("笔记记的是：它不公开报价，只有朋友说去年签的价格是每席 900 日元；至于它现在的官网报价，我这边没法上网查，所以没有官网现价可报。");
  assert.equal(zh.text, "笔记记的是：它不公开报价，只有朋友说去年签的价格是每席 900 日元。");
  assert.deepEqual(zh.dropped, ["至于它现在的官网报价，我这边没法上网查，所以没有官网现价可报。"]);
  const ja = withoutOnlineDenials("メモには、価格は非公開で、友人の話では昨年の契約は1席900円だったとあります。現在の公式価格については、インターネットにアクセスできないため確認できません。");
  assert.equal(ja.text, "メモには、価格は非公開で、友人の話では昨年の契約は1席900円だったとあります。");
  const jaInline = withoutOnlineDenials("メモでは1席900円ですが、インターネットにアクセスできないため、公式価格は分かりません。");
  assert.equal(jaInline.text, "メモでは1席900円です。");
  const en = withoutOnlineDenials("Your note says they don't publish prices and a friend paid JPY 900 per seat last year; as for the current list price, I can't browse the web, so I have no official figure.");
  assert.equal(en.text, "Your note says they don't publish prices and a friend paid JPY 900 per seat last year.");
  // Stability run 2: "我也无法替你上网查询" (替你 between the words).
  const zh2 = withoutOnlineDenials("笔记里写着它不公开报价，只有朋友提到去年签约价是每席 900 日元——官网上的现行报价，笔记里没有，我也无法替你上网查询。");
  assert.equal(zh2.text, "笔记里写着它不公开报价，只有朋友提到去年签约价是每席 900 日元——官网上的现行报价，笔记里没有。");
  // A sentence that is only the denial still goes whole; nothing else changes.
  assert.equal(withoutOnlineDenials("我无法上网。笔记 C 里写的是 Cirrus Works。").text, "笔记 C 里写的是 Cirrus Works。");
  assert.equal(withoutOnlineDenials("笔记里写的是 900 日元。").text, "笔记里写的是 900 日元。");
});

test("2 AE-CTX-005 R1: a dropped card sentence takes the request to confirm with it (zh, ja, en); an unrelated question stays", () => {
  const ja = stripCardTalk("結びはシンプルに。\n\nちなみに、山本さんの食事のToDo（11月20日）は確認カードのまま止まっています。\n\n確定してよければ教えてください。");
  assert.equal(ja.text, "結びはシンプルに。");
  assert.ok(ja.dropped.includes("確定してよければ教えてください。"));
  const zh = stripCardTalk("邮件要短。另外，改期那条还在确认卡上等你。确认的话告诉我一声。");
  assert.equal(zh.text, "邮件要短。");
  const en = stripCardTalk("Keep it short. The reschedule is still waiting on the confirmation card. Let me know if you want to confirm it.");
  assert.equal(en.text, "Keep it short.");
  // With no card sentence dropped, an ordinary question is kept.
  assert.equal(stripCardTalk("邮件要短。要不要我再改一版？").text, "邮件要短。要不要我再改一版？");
  assert.equal(stripCardTalk("結びはシンプルに。確定してよければ教えてください。").text, "結びはシンプルに。確定してよければ教えてください。");
});

const material = (ref: string, at: string, header: string, sentences: string[]): Material => ({ at, handle: ref, header, kind: "memo", partId: "p2", ref, sentences: sentences.map((text, index) => ({ id: index + 1, text })), version: "1" } as Material);

test("3 AE-SCL-016 R2: the cited newer record says the earlier quote has expired; code says it when the answer does not", () => {
  const lm09 = material("memo:note:lm09", "2026-11-02T01:00:00.000Z", 'memo "Lumen ATS quote (updated)"', ["Lumen ATS updated their quote: Team plan at JPY 2,050 per seat per month, minimum 20 seats.", "The September quote of JPY 1,900 has expired."]);
  const answer = "The public page is higher than the latest quote: JPY 2,400 versus JPY 2,050 in the quote of Nov 2.";
  assert.equal(expiryLine("en", [lm09], answer, "Asia/Tokyo"), '(The record of Nov 2 also says: "The September quote of JPY 1,900 has expired.")');
  assert.equal(expiryLine("en", [lm09], `${answer} The September quote of JPY 1,900 has expired.`, "Asia/Tokyo"), null, "already said");
  const zh = material("memo:note:q2", "2026-11-02T01:00:00.000Z", 'memo "报价"', ["报价更新为每席 2,050 日元。", "9 月那份 1,900 日元的报价已经过期。"]);
  assert.equal(expiryLine("zh", [zh], "按 11 月 2 日的报价比较。", "Asia/Tokyo"), "（11月2日的记录里还写着：「9 月那份 1,900 日元的报价已经过期。」）");
  const ja = material("memo:note:q3", "2026-11-02T01:00:00.000Z", 'memo "見積"', ["見積が1席2,050円に更新されました。", "9月の1,900円の見積は期限切れです。"]);
  assert.equal(expiryLine("ja", [ja], "11月2日の見積と比べます。", "Asia/Tokyo"), "（11月2日の記録には「9月の1,900円の見積は期限切れです。」とも書かれています。）");
  assert.equal(expiryLine("en", [material("memo:note:x", "2026-11-02T01:00:00.000Z", "memo", ["Team plan at JPY 2,050."])], answer, "Asia/Tokyo"), null, "no expiry in the record");
});

test("3 wiring: a grounded answer citing such a record carries the code-written clause", async () => {
  const world = contactWorld((records) => records.push(memo(ACTOR, "note:lm09", "Lumen ATS updated their quote: Team plan at JPY 2,050 per seat per month, minimum 20 seats. The September quote of JPY 1,900 has expired.", "2026-11-02T01:00:00.000Z", ["contact:c17"], { title: "Lumen ATS quote (updated)" })));
  const message = "What is the latest quote 小林健 gave me?";
  const run = await runContact(message, [{ dataSources: ["orbit_records"], objectClues: [{ entity: "contact", text: "小林健" }], requiredCapabilities: ["memo.read"], sourceQuote: message }], [], {
    answer: (call) => {
      const handle = /(s\d+) — memo "Lumen ATS quote/u.exec(call.user)?.[1] ?? "s1";
      return json({ segments: [{ cites: [{ sentenceIds: [1], sourceRef: handle }], partId: "p1", text: "The latest quote is JPY 2,050 per seat per month, minimum 20 seats." }] });
    },
    language: "en",
    world,
  });
  assert.match(run.result.text, /also says: "The September quote of JPY 1,900 has expired\."/u, run.result.text);
});

test("stability run (AE-SCL-016): a part that hands over a link to read is a web lookup even when the first layer calls it a statement", () => {
  const part = { clarity: "statement", constraints: [], dataOwner: "self", dataSources: ["public_web"], intentBasis: "instruction", persistence: "this_turn", requiredCapabilities: ["web.fetch"], sourceQuote: "Here is Lumen ATS's pricing page: https://lumen-ats.example.test/pricing." } as never;
  assert.equal(decideRoute(part).route, "web_lookup");
  // The rule is for a part that only opens the page; a part that also reads records keeps its usual route ("a statement" is not overridden).
  assert.equal(decideRoute({ ...(part as object), dataSources: ["orbit_records", "public_web"], requiredCapabilities: ["web.fetch", "memo.read"] } as never).route, "answer");
  // Saying not to open it, or no link at all: as before.
  assert.notEqual(decideRoute({ ...(part as object), negation: true } as never).route, "web_lookup");
  assert.equal(decideRoute({ ...(part as object), requiredCapabilities: ["memo.read"], dataSources: ["orbit_records"], sourceQuote: "Here is my note." } as never).route, "answer");
});

test("4 AE-AMB-011: an empty or unbalanced quote left by a strip rule is cleaned; whole quotes stay", () => {
  assert.equal(withoutQuoteResidue("3. 提供价值型（适合关系还浅的场合）：\n」\n理由：直接说开。"), "3. 提供价值型（适合关系还浅的场合）：\n理由：直接说开。");
  assert.equal(withoutQuoteResidue("可以这样写：「」。"), "可以这样写。");
  assert.equal(withoutQuoteResidue("」理由：直接说开。"), "理由：直接说开。");
  assert.equal(withoutQuoteResidue("Try: \"\" then the rest."), "Try: then the rest.");
  const whole = "1. 承接上次接触：\n「上次聊到的〇〇，我后来又想了一下。」\n理由：有具体指向。";
  assert.equal(withoutQuoteResidue(whole), whole);
  assert.equal(withoutQuoteResidue("标题「关于交付周期」很好。"), "标题「关于交付周期」很好。");
});
