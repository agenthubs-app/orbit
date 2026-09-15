import assert from "node:assert/strict";
import test from "node:test";

import { createTranslator } from "../src/i18n/messages";

test("profile main-chain chrome is available in Chinese, Japanese, and English", () => {
  const zh = createTranslator("zh");
  const ja = createTranslator("ja");
  const en = createTranslator("en");

  assert.equal(zh("profile.title"), "我的");
  assert.equal(ja("profile.edit"), "プロフィールを編集");
  assert.equal(en("profile.save"), "Save profile");
  assert.equal(en("profile.chooseNamed", { name: "Industry" }), "Choose Industry");
});

test("profile identity and user-authored fields remain literal across languages", () => {
  const identity = "林悦 · Hoshino Studio";
  const goal = "Meet 日本市場の partners";

  for (const language of ["zh", "ja", "en"] as const) {
    const t = createTranslator(language);
    assert.equal(t.literal(identity), identity);
    assert.equal(t.literal(goal), goal);
  }
});

test("password reset and permissions chrome is available in all three languages", () => {
  const zh = createTranslator("zh");
  const ja = createTranslator("ja");
  const en = createTranslator("en");

  assert.equal(zh("reset.title"), "重置密码");
  assert.equal(ja("reset.confirmPassword"), "新しいパスワードを確認");
  assert.equal(en("reset.useLink"), "Use reset link");
  assert.equal(zh("permissions.title"), "权限中心");
  assert.equal(ja("permissions.requestCalendar"), "カレンダーの確認を申請");
  assert.equal(en("permissions.signedOutTitle"), "Sign in to view permissions");
});

test("profile extraction and suggestion operations have localized controls and states", () => {
  const zh = createTranslator("zh");
  const ja = createTranslator("ja");
  const en = createTranslator("en");

  assert.equal(zh("profile.extractionTitle"), "补全资料");
  assert.equal(ja("profile.chooseResumeFile"), "履歴書ファイルを選択");
  assert.equal(en("profile.applyExtraction"), "Apply to edit form");
  assert.equal(ja("profile.suggestionsTitle"), "プロフィール更新の提案");
  assert.equal(en("profile.confirmSuggestion"), "Confirm suggestion");
  assert.equal(en("profile.currentValue"), "Current");
});

test("the five routed profile pages have complete localized chrome", () => {
  const keys = [
    "profile.editPageTitle", "profile.moreTitle", "profile.tagsTitle", "profile.previewTitle",
    "profile.currentWork", "profile.spokenLanguages", "profile.openSuggestions", "profile.openPreview",
    "profile.dismissSuggestion", "profile.acceptAllSuggestions", "profile.previewNotice",
  ] as const;
  for (const language of ["zh", "ja", "en"] as const) {
    const t = createTranslator(language);
    for (const key of keys) {
      assert.ok(t(key).trim().length > 0);
      assert.notEqual(t(key), key);
    }
  }
});
