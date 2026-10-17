import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToHtml } from "./helpers/render";
import { createTranslator } from "../src/i18n/messages";
import { accountDesignFixtures } from "../fixtures/account-design";
test("R18a suggestions render six object cards/ten fields and only present sources without undo promises", async () => {
  const module = await import("../src/screens/me/AccountSuggestionsContent").catch(() => null); assert.ok(module);
  const cards = accountDesignFixtures.suggestions.map(card => ({ ...card, fields: card.fields.map((field, index) => ({ ...field, id: `${card.id}:${index}`, value: field.proposed })) }));
  const html = renderToHtml(createElement(module.AccountSuggestionsContent, { cards, t: createTranslator("ja"), selected: new Set(), filter: "all", busy: false, onFilter: () => {}, onSelect: () => {}, onDismiss: () => {}, onAll: () => {}, onApply: () => {}, onEntry: () => {} }));
  assert.equal((html.match(/data-testid="account-suggestion-card"/g) ?? []).length, 6);
  assert.ok(html.includes("佐藤")); assert.ok(html.includes("職務経歴書"));
  for (const phrase of ["元に戻", "変更履歴", "取り消し"]) assert.ok(!html.includes(phrase));
});
test("R18a empty suggestions offer all three existing input paths and a labeled non-interactive sample", async () => {
  const module = await import("../src/screens/me/AccountSuggestionsContent").catch(() => null); assert.ok(module);
  const html = renderToHtml(createElement(module.AccountSuggestionsContent, { cards: [], t: createTranslator("ja"), selected: new Set(), filter: "all", busy: false, onFilter: () => {}, onSelect: () => {}, onDismiss: () => {}, onAll: () => {}, onApply: () => {}, onEntry: () => {} }));
  for (const text of ["名刺をスキャン", "職務経歴書を読み込む", "iOrbit に近況を話す", "サンプル"]) assert.ok(html.includes(text), text);
});
