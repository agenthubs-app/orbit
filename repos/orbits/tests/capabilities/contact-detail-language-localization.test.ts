import assert from "node:assert/strict";
import test from "node:test";

import {
  contactDetailCopy,
  localizeContactSourceLabel,
  selectContactEvidenceText,
} from "../../features/contacts/contact-detail-localization";

const legacySummary =
  "佐藤 健一 / Kenichi Sato at North Star Foods. " +
  "JA: 北星餐飲の店舗運営責任者。 " +
  "ZH: 北星餐饮的门店经营负责人。 " +
  "EN: Store operations lead at North Star Foods.";

test("contact source labels use exactly the selected system language", () => {
  const base = {
    displayName: "佐藤健一",
    label: "二维码交换记录：佐藤健一",
    sourceType: "qr_scan" as const,
  };

  assert.equal(localizeContactSourceLabel({ ...base, language: "zh" }), "二维码交换记录：佐藤健一");
  assert.equal(localizeContactSourceLabel({ ...base, language: "en" }), "QR scan with 佐藤健一");
  assert.equal(localizeContactSourceLabel({ ...base, language: "ja" }), "佐藤健一とのQRコード交換");
});

test("legacy multilingual summaries select one segment instead of concatenating", () => {
  assert.deepEqual(selectContactEvidenceText(legacySummary, "zh"), {
    contentLanguage: "zh",
    text: "北星餐饮的门店经营负责人。",
  });
  assert.deepEqual(selectContactEvidenceText(legacySummary, "en"), {
    contentLanguage: "en",
    text: "Store operations lead at North Star Foods.",
  });
  assert.deepEqual(selectContactEvidenceText(legacySummary, "ja"), {
    contentLanguage: "ja",
    text: "北星餐飲の店舗運営責任者。",
  });
});

test("contact system fallbacks cover all supported languages", () => {
  assert.equal(contactDetailCopy("zh").relationshipContact, "人脉联系人");
  assert.equal(contactDetailCopy("en").relationshipContact, "Relationship contact");
  assert.equal(contactDetailCopy("ja").relationshipContact, "人脈の連絡先");
});
