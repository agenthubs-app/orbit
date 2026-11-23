import assert from "node:assert/strict";
import test from "node:test";

import { validateUnderstandOutput } from "../../features/agent-v1/understand/validate";
import { buildQuery } from "../../features/agent-v1/web/query";
import { isVocabularyWord } from "../../features/agent-v1/web/vocabulary";
import { part } from "./graph-kit";

/** agent-design AG09-2: code builds every query from the message's own words and the fixed vocabulary, word by word traced. */

test("the query is the message's name plus vocabulary words in the message's language, each word with its origin", () => {
  const zh = buildQuery({ language: "zh", message: "查一下 Acme Cloud 官网现在的标准版价格", partId: "p1", target: { qualifiers: ["official", "price"], quote: "Acme Cloud" } });
  assert.equal(zh.ok, true);
  if (zh.ok) {
    assert.equal(zh.candidate.text, "Acme Cloud 官网 价格");
    assert.deepEqual(zh.candidate.tokens.map((token) => token.origin), ["message", "vocabulary", "vocabulary"]);
    assert.equal(zh.candidate.needsConfirmation, false);
  }
  const ja = buildQuery({ language: "ja", message: "是枝真紀さんの代表作と現在の役職を調べてください。", partId: "p1", target: { qualifiers: ["works", "current", "role"], quote: "是枝真紀さん" } });
  assert.equal(ja.ok && ja.candidate.text, "是枝真紀 代表作 現在", "the honorific is not looked up");
  const en = buildQuery({ language: "en", message: "What does Lumen ATS charge?", partId: "p1", target: { qualifiers: ["price"], quote: "Lumen ATS" } });
  assert.equal(en.ok && en.candidate.text, "Lumen ATS pricing");
  for (const word of ["官网", "料金", "pricing", "最新", "役職"]) assert.equal(isVocabularyWord(word), true, word);
  assert.equal(isVocabularyWord("折扣"), false);
});

test("run-02 repair 2 (AE-SCL-015): a query carries at most two qualifier words, the first two the first layer gave", () => {
  const built = buildQuery({ language: "zh", message: "查一下 Kasane Pack 官网上 S 号缓冲箱现在卖多少钱", partId: "p1", target: { qualifiers: ["official", "price", "product"], quote: "Kasane Pack" } });
  assert.equal(built.ok && built.candidate.text, "Kasane Pack 官网 价格");
  const person = buildQuery({ language: "ja", message: "是枝真紀さんの代表作と現在の役職を調べてください。", partId: "p1", target: { qualifiers: ["works", "current", "role"], quote: "是枝真紀" } });
  assert.equal(person.ok && person.candidate.text, "是枝真紀 代表作 現在");
});

test("an unknown qualifier is dropped; a quote not in the message, or one pointing at private records, builds nothing", () => {
  const built = buildQuery({ language: "zh", message: "查一下 Acme Cloud 的价格", partId: "p1", target: { qualifiers: ["price", "discount" as never], quote: "Acme Cloud" } });
  assert.equal(built.ok && built.candidate.text, "Acme Cloud 价格");
  assert.deepEqual(buildQuery({ language: "zh", message: "查一下 Acme Cloud 的价格", partId: "p1", target: { qualifiers: [], quote: "Borealis" } }), { ok: false, reason: "not_in_message" });
  assert.deepEqual(buildQuery({ language: "zh", message: "查一下我笔记里那家公司", partId: "p1", target: { qualifiers: [], quote: "笔记里那家公司" } }), { ok: false, reason: "private_pointer" });
  assert.deepEqual(buildQuery({ language: "zh", message: "查一下", partId: "p1", target: null }), { ok: false, reason: "no_target" });
  assert.deepEqual(buildQuery({ language: "en", message: `Look up ${"x".repeat(120)}`, partId: "p1", target: { qualifiers: [], quote: "x".repeat(120) } }), { ok: false, reason: "too_long" });
});

test("an @ contact's name comes from the record and makes the query one to show first", () => {
  const built = buildQuery({ language: "zh", message: "上网查查 @小林 现在的公开职务。", partId: "p1", references: [{ name: "小林健", quote: "@小林" }], target: { qualifiers: ["current", "role"], quote: "@小林" } });
  assert.equal(built.ok, true);
  if (built.ok) {
    assert.equal(built.candidate.text, "小林健 最新 职务");
    assert.deepEqual(built.candidate.tokens[0], { origin: "contact_record", text: "小林健" });
    assert.equal(built.candidate.needsConfirmation, true);
  }
});

test("the first layer's webTarget keeps only words of the message and known codes; a model-written query has no field", () => {
  const message = "查一下 Acme Cloud 官网现在的标准版价格";
  const raw = { parts: [part({ dataSources: ["public_web"], requiredCapabilities: ["web.search"], sourceQuote: message, webTarget: { qualifiers: ["official", "price", "cheap"], quote: "Acme Cloud", query: "Acme Cloud price 1200" } })], plainChat: false };
  const result = validateUnderstandOutput(raw, { message, handles: new Set(), openItemRefs: new Set() });
  assert.equal(result.ok, true);
  if (result.ok) {
    assert.deepEqual(result.output.parts[0].webTarget, { qualifiers: ["official", "price"], quote: "Acme Cloud" });
    assert.ok(result.dropped.some((item) => item.includes("cheap")));
  }
  const elsewhere = validateUnderstandOutput({ parts: [part({ requiredCapabilities: ["web.search"], sourceQuote: message, webTarget: { qualifiers: [], quote: "Cirrus Works" } })], plainChat: false }, { message, handles: new Set(), openItemRefs: new Set() });
  assert.equal(elsewhere.ok && elsewhere.output.parts[0].webTarget, undefined);
});
