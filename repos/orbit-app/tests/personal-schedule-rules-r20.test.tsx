import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";

import { PersonalScheduleRepeatChoices } from "../src/screens/schedule/PersonalScheduleRules";
import { OrbitLocaleContext, type OrbitLocaleContextValue } from "../src/i18n/OrbitLocaleContext";
import { createTranslator } from "../src/i18n/messages";
import type { PersonalScheduleDraft } from "../src/view-models/personal-schedule-editor";
import { renderToHtml, renderedText } from "./helpers/render";

const locale: OrbitLocaleContextValue = { choice: "ja", deviceLanguage: "ja", error: null, language: "ja", preference: { mode: "system", language: null, updatedAt: null }, retryLanguageSave: async () => undefined, setLanguage: async () => undefined, source: "device", syncState: "idle", t: createTranslator("ja") };
const draft: PersonalScheduleDraft = { title: "Review", startDate: "2026-10-07", startTime: "10:00", endDate: "2026-10-07", endTime: "11:00", location: "", recurrence: { frequency: "weekly" } };

test("repeat sheet renders only the recurrence rules the live contract saves", () => {
  const view = createElement(OrbitLocaleContext.Provider, { value: locale }, createElement(PersonalScheduleRepeatChoices, { draft, disabled: false, onChange() {} }));
  const html = renderToHtml(view), text = renderedText(view);
  assert.equal((html.match(/role="radio"/gu) ?? []).length, 4);
  for (const label of ["繰り返しなし", "毎日", "毎週", "毎月"]) assert.match(text, new RegExp(label, "u"));
  for (const unsupported of ["隔週", "平日", "カスタム"]) assert.doesNotMatch(text, new RegExp(unsupported, "u"));
  assert.match(html, /aria-checked="true" aria-label="毎週"/u);
});
