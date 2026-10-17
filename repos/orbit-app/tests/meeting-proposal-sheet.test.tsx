import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { MeetingProposalSheet, type MeetingProposalSheetProps } from "../src/screens/calendar/MeetingProposalSheet";
import { OrbitLocaleContext, type OrbitLocaleContextValue } from "../src/i18n/OrbitLocaleContext";
import { createTranslator } from "../src/i18n/messages";
import type { OrbitLanguage } from "../src/api/contract/language";
import { renderToHtml, renderedText } from "./helpers/render";

function sheet(language: OrbitLanguage, props: Partial<MeetingProposalSheetProps> = {}) {
  const value: OrbitLocaleContextValue = {
    choice: language, deviceLanguage: language, error: null, language, preference: { mode: "system", language: null, updatedAt: null },
    retryLanguageSave: async () => undefined, setLanguage: async () => undefined, source: "device", syncState: "idle", t: createTranslator(language),
  };
  return createElement(OrbitLocaleContext.Provider, { value }, createElement(MeetingProposalSheet, { open: true, contactId: "c1", onClose() {}, ...props }));
}

for (const [language, expected] of [
  ["ja", ["面談の日程提案", "候補を選ぶ", "形式と場所", "送る前の確認"]],
  ["zh", ["提议会面时间", "选择候选时间", "形式与地点", "发送前确认"]],
  ["en", ["Propose meeting times", "Choose times", "Format and place", "Review before sending"]],
] as const) {
  test(`${language}: open meeting proposal renders its three empty steps`, () => {
    let sent = 0;
    const text = renderedText(sheet(language, { onSent: () => { sent++; }, appointmentId: "meeting1", initialCandidates: [{ startsAt: "2026-10-20T01:00:00Z", endsAt: "2026-10-20T02:00:00Z" }] }));
    for (const label of expected) assert.ok(text.includes(label), `${label} is visible`);
    assert.ok(text.indexOf(expected[1]) < text.indexOf(expected[2]) && text.indexOf(expected[2]) < text.indexOf(expected[3]));
    assert.equal(sent, 0, "the skeleton never submits a proposal");
  });
}

test("closed meeting proposal renders no sheet", () => {
  assert.equal(renderToHtml(sheet("ja", { open: false })), "");
});
