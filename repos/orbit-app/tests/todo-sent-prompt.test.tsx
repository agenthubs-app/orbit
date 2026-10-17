import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";

import { OrbitLocaleContext, type OrbitLocaleContextValue } from "../src/i18n/OrbitLocaleContext";
import { createTranslator } from "../src/i18n/messages";
import { TodoSentPrompt } from "../src/screens/todo/TodoSentPrompt";
import { renderedText } from "./helpers/render";

const locale: OrbitLocaleContextValue = {
  choice: "ja", deviceLanguage: "ja", error: null, language: "ja", preference: { mode: "system", language: null, updatedAt: null },
  retryLanguageSave: async () => undefined, setLanguage: async () => undefined, source: "device", syncState: "idle", t: createTranslator("ja"),
};

test("after handoff, ask if the message was sent without claiming any app-side send", () => {
  const text = renderedText(createElement(OrbitLocaleContext.Provider, { value: locale },
    createElement(TodoSentPrompt, { busy: false, confirmationStarted: false, onYes() {}, onNotYet() {} })));
  assert.ok(text.includes("送りましたか？"));
  assert.ok(text.includes("はい"));
  assert.ok(text.includes("まだ"));
});

test("after a write starts, only retry remains; do not discard a partial checkpoint", () => {
  const text = renderedText(createElement(OrbitLocaleContext.Provider, { value: locale },
    createElement(TodoSentPrompt, { busy: false, confirmationStarted: true, onYes() {}, onNotYet() {} })));
  assert.ok(text.includes("記録をもう一度試す"));
  assert.ok(!text.includes("まだ"));
});
