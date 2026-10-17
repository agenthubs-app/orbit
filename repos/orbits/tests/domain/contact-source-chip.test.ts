import assert from "node:assert/strict";
import test from "node:test";

import { contactMetKind, contactSourceChip, meetingNoteValue, type ContactSourceChipInput } from "../../shared/compute/contact-source-chip";
import { mergeContactDensity } from "../../shared/compute/contact-density";

// R11a SC-02：出どころ 6 值（含イベント、汎用 CSV → 手入力、旧导入兜底）。
const chipCases: readonly [string, ContactSourceChipInput, string][] = [
  ["business card scan", { sourceType: "business_card_ocr" }, "meishi"],
  ["QR scan", { sourceType: "qr_scan" }, "meishi"],
  ["LinkedIn CSV (format)", { sourceType: "external_contacts", format: "linkedin", sourceLabel: "CSV 导入" }, "linkedin"],
  ["generic CSV with a LinkedIn URL column counts as manual (format wins)", { sourceType: "external_contacts", format: "generic", sourceLabel: "CSV 导入", hasLinkedinNote: true }, "manual"],
  ["vCard (format)", { sourceType: "external_contacts", format: "vcard", sourceLabel: "vCard 导入" }, "phone"],
  ["event roster import (format)", { sourceType: "event_import", format: "event" }, "event"],
  ["event roster import without format", { sourceType: "event_import" }, "event"],
  ["legacy vCard import without format", { sourceType: "external_contacts", sourceLabel: "vCard 导入" }, "phone"],
  ["legacy LinkedIn import without format", { sourceType: "external_contacts", sourceLabel: "CSV 导入", hasLinkedinNote: true }, "linkedin"],
  ["legacy generic CSV without format", { sourceType: "external_contacts", sourceLabel: "CSV 导入" }, "manual"],
  ["manual entry", { sourceType: "manual" }, "manual"],
  ["invite-linked person reads as self, whatever the stored source", { sourceType: "referral", inviteLinked: true }, "self"],
  ["invite-linked beats business card", { sourceType: "business_card_ocr", inviteLinked: true }, "self"],
  ["unlinked referral is manual", { sourceType: "referral" }, "manual"],
  ["unknown format falls back to the legacy rule", { sourceType: "external_contacts", format: "xml", sourceLabel: "vCard" }, "phone"],
];
for (const [name, input, expected] of chipCases) {
  test(`contactSourceChip: ${name}`, () => assert.equal(contactSourceChip(input), expected));
}

test("meetingNoteValue reads the 出会い line with either colon", () => {
  assert.equal(meetingNoteValue("会社メモ\n出会い：紹介（田中さん）\n他"), "紹介（田中さん）");
  assert.equal(meetingNoteValue("  出会い : 訪問"), "訪問");
  assert.equal(meetingNoteValue("LinkedIn: https://x"), null);
  assert.equal(meetingNoteValue(undefined), null);
});

const metCases: readonly [string, Parameters<typeof contactMetKind>[0], string][] = [
  ["event import", { sourceType: "event_import" }, "event"],
  ["met at an event (metEventId)", { sourceType: "business_card_ocr", metEventId: "ev1" }, "event"],
  ["event beats a referral note", { sourceType: "manual", metEventId: "ev1", meetingNote: "紹介" }, "event"],
  ["invite-linked", { sourceType: "manual", inviteLinked: true }, "referral"],
  ["referral source", { sourceType: "referral" }, "referral"],
  ["intro note (manual v2 / daily question)", { sourceType: "manual", meetingNote: "紹介（田中さん）" }, "referral"],
  ["visit note", { sourceType: "business_card_ocr", meetingNote: "訪問（本社）" }, "visit"],
  ["商談 note", { sourceType: "manual", meetingNote: "定例の商談で" }, "visit"],
  ["English meeting note", { sourceType: "manual", meetingNote: "Client Meeting" }, "visit"],
  ["other note", { sourceType: "manual", meetingNote: "前職の同僚" }, "other"],
  ["nothing known", { sourceType: "manual" }, "other"],
  ["blank metEventId is not an event", { sourceType: "manual", metEventId: "  " }, "other"],
];
for (const [name, input, expected] of metCases) {
  test(`contactMetKind: ${name}`, () => assert.equal(contactMetKind(input), expected));
}

test("mergeContactDensity: plan-related or self-reported people read ●●●; otherwise the card's level", () => {
  assert.equal(mergeContactDensity(1, { goalRelated: true }), 3);
  assert.equal(mergeContactDensity(2, { selfReported: true }), 3);
  assert.equal(mergeContactDensity(2, {}), 2);
  assert.equal(mergeContactDensity(null, {}), 1);
  assert.equal(mergeContactDensity(undefined, { goalRelated: false }), 1);
});
