import assert from "node:assert/strict";
import { test } from "node:test";

import { quoteSourceWords, untranslatedProblem, untranslatedSourceWords } from "../../features/agent-v1/answer/source-words";

/**
 * AG14 UI run, early judge on AE-REF-007 R2: the Japanese paraphrase of the Chinese note 「客户访谈」 kept 交付周期, 报价 and
 * 修订版 as they were. Code finds such words; the answer step's one repair names them.
 */
const NOTE = "田中说他们最在意交付周期，报价可以分两期，希望月底前看到修订版。";
const NAMES = ["@客户访谈 の内容をふまえて、@田中浩 さんの @回复田中的询价 をどう直したらいいか提案してもらえますか。", "Title: 回复田中的询价", "Linked contact: 田中浩", "memo \"客户访谈\", written 11月11日"];
const ANSWER = "「客户访谈」メモによると、田中さんが最も気にしているのは交付周期で、报价は二段階に分けられ、月末までに修订版を見たいとのことです。返信は、①冒頭で交付周期を明示する、②価格は二段階に分けた案として示す、という形に直すのがよさそうです。「回复田中的询价」はまだ未完了で、期限は11月17日（火）18:00です。";

test("AE-REF-007: the Chinese words a Japanese answer kept from the note are found; names, titles and quotes are not", () => {
  assert.deepEqual(untranslatedSourceWords({ language: "ja", material: [NOTE], names: NAMES, text: ANSWER }), ["交付周期", "报价", "修订版"]);
});

test("a Japanese answer that says them in Japanese passes; two shared characters (月末, 期限) are plain Japanese", () => {
  const fixed = "「客户访谈」メモによると、田中さんが最も気にしているのは納期で、見積もりは二段階に分けられ、月末までに修正版を見たいとのことです。";
  assert.deepEqual(untranslatedSourceWords({ language: "ja", material: [NOTE], names: NAMES, text: fixed }), []);
});

test("Japanese material and Chinese answers are never checked; English answers are checked for any copied run", () => {
  assert.deepEqual(untranslatedSourceWords({ language: "ja", material: ["山本さんと打ち合わせ。原稿は12月5日までに送ると約束した。"], names: [], text: "原稿は12月5日までに送ると約束しています。" }), []);
  assert.deepEqual(untranslatedSourceWords({ language: "zh", material: [NOTE], names: [], text: "田中最在意交付周期。" }), []);
  assert.deepEqual(untranslatedSourceWords({ language: "en", material: [NOTE], names: NAMES, text: "Tanaka cares most about 交付周期; the quote can be split in two." }), ["交付周期"]);
});

/**
 * Gate run-03 judges (AE-REF-007 R1): 「最も在意しているのは納期」 — 在意 is Chinese, although both characters exist in
 * Japanese. Any copied run counts unless it is an everyday word Japanese writes the same way.
 */
const NOTE_2 = "田中说他最在意交期，下周要再考虑一下预算，也希望多沟通，月底前给答复，安排一次会议。";
test("everyday Chinese words whose characters all exist in Japanese are found too: 在意, 考虑, 沟通, 安排", () => {
  const answer = "田中さんが最も在意しているのは納期で、来週もう一度、考虑し、もっと沟通したいとのことです。月末までに返事をして、会議を安排します。";
  assert.deepEqual(untranslatedSourceWords({ language: "ja", material: [NOTE_2], names: NAMES, text: answer }).sort(), ["在意", "安排", "沟通", "考虑"]);
  // Everyday Japanese written with the same characters (月末, 希望) and the record's own words in quotes are left alone.
  assert.deepEqual(untranslatedSourceWords({ language: "ja", material: ["希望月底前看到修订版。"], names: [], text: "先方の希望は月末までに修正版を受け取ることです。" }), []);
  assert.deepEqual(untranslatedSourceWords({ language: "ja", material: ["月底前给答复，期限是月末。"], names: [], text: "月末までに返事をします。期限は「月底」です。" }), []);
});

test("what the repair still carries is delivered as a quote of the record, never as the answer's own words", () => {
  assert.equal(quoteSourceWords("田中さんが最も在意しているのは納期です。「客户访谈」の在意も同じ。", ["在意"], "ja"), "田中さんが最も「在意」しているのは納期です。「客户访谈」の「在意」も同じ。");
  assert.equal(quoteSourceWords("Tanaka cares about 交付周期 and \"报价\".", ["交付周期", "报价"], "en"), "Tanaka cares about \"交付周期\" and \"报价\".");
  const quoted = quoteSourceWords("田中さんが最も在意しているのは納期です。", ["在意"], "ja");
  assert.deepEqual(untranslatedSourceWords({ language: "ja", material: [NOTE_2], names: NAMES, text: quoted }), [], "once quoted, nothing is left to find");
});

/**
 * Coordinator after AE-REF-007 run 4: quotation marks exempt their content only when the whole quoted string is taken word
 * for word from what was read (a record, its name or title, the user's own message). A title the model made up and put in
 * quotation marks is the answer's own wording.
 */
test("a made-up title in quotation marks is the answer's own wording; a verbatim quote of a record is not", () => {
  const madeUp = "タイトルを「田中さん向けに、交付周期を明記した見積の修订版を送る」のように変えるのがよいです。";
  assert.deepEqual(untranslatedSourceWords({ language: "ja", material: [NOTE], names: NAMES, text: madeUp }).sort(), ["交付周期", "修订版"]);
  // A record's own words quoted verbatim, the record's title and the user's own message stay exempt.
  assert.deepEqual(untranslatedSourceWords({ language: "ja", material: [NOTE], names: NAMES, text: "メモには「报价可以分两期」とあり、「回复田中的询价」を直すのがよいです。" }), []);
  // Integrator (AE-WEB-008): nothing inside quotation marks is ever marked and marks never nest — the made-up title is
  // named in the repair note, but delivery leaves quoted text as it is.
  assert.equal(quoteSourceWords(madeUp, ["交付周期", "修订版"], "ja"), madeUp);
  assert.equal(quoteSourceWords("メモには「报价可以分两期」とあります。", ["报价"], "ja"), "メモには「报价可以分两期」とあります。");
});

/**
 * Integrator on agent-v1-next (AE-WEB-008, 2026-11-20): a Japanese answer from a Chinese web page came out as
 * 『『北行』列車』 and 東「都映」画 — pieces of a title and of a company name were taken for copied words. The unit is a
 * whole Han run; a piece of a longer run is nothing; quoted text is never marked; marks never nest.
 */
const PAGE = ["林晓的代表作有《夏之庭》（2019）和《北行列车》（2023）。", "她现任东都映画的创意总监，北行时也常去都映的老片场。"];
test("AE-WEB-008: a title and a company name stay whole — no piece of them is a copied word", () => {
  for (const text of ["代表作は『夏之庭』（2019）と『北行列車』（2023）で、現在は東都映画のクリエイティブディレクターです。", "代表作は『夏之庭』と『北行列車』です。\n現在は東都映画のクリエイティブディレクターです。"]) {
    const found = untranslatedSourceWords({ language: "ja", material: PAGE, names: [], text });
    assert.deepEqual(found, [], text);
    assert.equal(quoteSourceWords(text, ["北行", "都映"], "ja"), text, "pieces of 北行列車 and 東都映画 are never marked");
  }
});

test("a short copied word that stands alone as its own run is still found and marked", () => {
  const text = "撮影所へは北行の列車で通い、都映の撮影所にもよく行ったそうです。";
  assert.deepEqual(untranslatedSourceWords({ language: "ja", material: PAGE, names: [], text }).sort(), ["北行", "都映"]);
  assert.equal(quoteSourceWords(text, ["北行", "都映"], "ja"), "撮影所へは「北行」の列車で通い、「都映」の撮影所にもよく行ったそうです。");
});

test("record values shown as such stay as they are (AE-MEM-007 R4: an event's topics listed in an English answer)", () => {
  const material = ["Title: SaaS 定价研讨会", "Topics: 定价, SaaS", "关于定价的研讨会。"];
  const names = material.filter((line) => /^[A-Z][A-Za-z «»]+: /u.test(line));
  assert.deepEqual(untranslatedSourceWords({ language: "en", material: material.filter((line) => !names.includes(line)), names, text: "SaaS 定价研讨会 — topics: 定价、SaaS." }), []);
});

test("the repair note names the words and keeps record names as they are", () => {
  const note = untranslatedProblem("p1", ["交付周期", "报价"], "ja");
  assert.match(note, /p1: the answer is in Japanese/u);
  assert.match(note, /交付周期, 报价/u);
  assert.match(note, /Only a name, title, place or tag the material gives stays as it is/u);
});
