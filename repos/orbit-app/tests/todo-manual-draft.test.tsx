import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";

import { OrbitLocaleContext, type OrbitLocaleContextValue } from "../src/i18n/OrbitLocaleContext";
import { createTranslator } from "../src/i18n/messages";
import { TodoManualDraft, todoManualDraftForScope, todoManualMailto } from "../src/screens/todo/TodoManualDraft";
import { renderToHtml, renderedText } from "./helpers/render";

const locale: OrbitLocaleContextValue = {
  choice: "ja", deviceLanguage: "ja", error: null, language: "ja", preference: { mode: "system", language: null, updatedAt: null },
  retryLanguageSave: async () => undefined, setLanguage: async () => undefined, source: "device", syncState: "idle", t: createTranslator("ja"),
};

test("manual draft is explicit about AI and external sending", () => {
  const element = createElement(OrbitLocaleContext.Provider, { value: locale }, createElement(TodoManualDraft, {
    title: "山本さんへ返信", value: "", onChange() {}, onClose() {}, onCopy() {}, onMail() {},
  }));
  const text = renderedText(element);
  assert.ok(text.includes("山本さんへ返信"));
  assert.ok(text.includes("AI は利用できません"));
  assert.ok(text.includes("送信はされません"));
  assert.ok(text.includes("保存されません"));
  assert.ok(text.includes("コピー"));
  assert.ok(text.includes("メールアプリで開く"));
  assert.ok(renderToHtml(element).includes("aria-disabled=\"true\""), "empty text cannot be handed off");
});

test("mailto contains only the user's encoded text and never a recipient", () => {
  assert.equal(todoManualMailto("こんにちは & またね"), "mailto:?body=%E3%81%93%E3%82%93%E3%81%AB%E3%81%A1%E3%81%AF%20%26%20%E3%81%BE%E3%81%9F%E3%81%AD");
  assert.equal(todoManualMailto("  "), null);
});

test("a draft from another account/server scope is never rendered", () => {
  const draft = { scopeKey: "actor-1:server-a", body: "private text" };
  assert.equal(todoManualDraftForScope(draft, "actor-1:server-a"), draft);
  assert.equal(todoManualDraftForScope(draft, "actor-2:server-a"), null);
  assert.equal(todoManualDraftForScope(draft, "actor-1:server-b"), null);
});
