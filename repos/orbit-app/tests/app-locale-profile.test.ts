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
