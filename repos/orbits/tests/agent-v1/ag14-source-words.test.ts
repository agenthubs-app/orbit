import assert from "node:assert/strict";
import { test } from "node:test";

import { untranslatedProblem, untranslatedSourceWords } from "../../features/agent-v1/answer/source-words";

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

test("the repair note names the words and keeps record names as they are", () => {
  const note = untranslatedProblem("p1", ["交付周期", "报价"], "ja");
  assert.match(note, /p1: the answer is in Japanese/u);
  assert.match(note, /交付周期, 报价/u);
  assert.match(note, /inside 「」/u);
});
