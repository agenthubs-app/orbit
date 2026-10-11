import assert from "node:assert/strict";
import test from "node:test";

import { hasComparableDetail, isSameNameLoose, nameOnlyMatch, normalizePersonName } from "../../shared/compute/contact-name-match";

// R12（DESIGN §2.3 同名规则，复核 M6）。
const normalizeCases: readonly [string, string][] = [
  ["山田 太郎", "山田太郎"],
  ["山田　太郎", "山田太郎"],
  ["  山田太郎  ", "山田太郎"],
  ["John Smith", "johnsmith"],
  ["ＪＯＨＮ　ＳＭＩＴＨ", "johnsmith"],
  ["ﾔﾏﾀﾞ ﾀﾛｳ", "ヤマダタロウ"],
  ["ジョン・スミス", "ジョンスミス"],
  ["ｼﾞｮﾝ･ｽﾐｽ", "ジョンスミス"],
  ["王 小明", "王小明"],
  ["", ""],
];
for (const [input, expected] of normalizeCases) {
  test(`normalizePersonName(${JSON.stringify(input)}) = ${JSON.stringify(expected)}`, () => {
    assert.equal(normalizePersonName(input), expected);
  });
}

test("normalizePersonName: null and undefined read as empty", () => {
  assert.equal(normalizePersonName(null), "");
  assert.equal(normalizePersonName(undefined), "");
});

const sameCases: readonly [string | null, string | null, boolean][] = [
  ["山田 太郎", "山田太郎", true],
  ["山田　太郎", "山田 太郎", true],
  ["Aki Example", "aki  example", true],
  ["山田 太郎", "山田 花子", false],
  ["", "", false],
  ["   ", "", false],
  [null, "山田", false],
];
for (const [a, b, expected] of sameCases) {
  test(`isSameNameLoose(${JSON.stringify(a)}, ${JSON.stringify(b)}) = ${expected}`, () => {
    assert.equal(isSameNameLoose(a, b), expected);
    assert.equal(isSameNameLoose(b, a), expected, "symmetric");
  });
}

const nameOnly = { displayName: "山田 太郎" };
const withCompany = { displayName: "山田太郎", organization: "株式会社オービット" };
const withEmail = { displayName: "山田太郎", email: "taro@example.jp" };
const full = { displayName: "山田　太郎", organization: "株式会社オービット", email: "taro@example.jp", phone: "03-1234-5678" };
const other = { displayName: "山田 太郎", organization: "別会社", phone: "090-0000-0000" };

const matchCases: readonly [string, Parameters<typeof nameOnlyMatch>[0], Parameters<typeof nameOnlyMatch>[1], boolean][] = [
  ["only name ↔ business card (later scan finds the hand-typed person)", nameOnly, full, true],
  ["business card ↔ only name", full, nameOnly, true],
  ["name + company ↔ only name", withCompany, nameOnly, true],
  ["only name ↔ only name", nameOnly, { displayName: "山田太郎" }, true],
  ["both have details: left to findContactCandidate, no same-name hint", withCompany, withEmail, false],
  ["both have details at different companies", full, other, false],
  ["different names", nameOnly, { displayName: "山田 花子" }, false],
  ["blank detail strings count as none", { displayName: "山田太郎", organization: "  ", email: "", phone: null }, full, true],
  ["empty names never match", { displayName: "" }, { displayName: "" }, false],
];
for (const [name, existing, incoming, expected] of matchCases) {
  test(`nameOnlyMatch: ${name} → ${expected}`, () => {
    assert.equal(nameOnlyMatch(existing, incoming), expected);
    assert.equal(nameOnlyMatch(incoming, existing), expected, "symmetric");
  });
}

test("hasComparableDetail", () => {
  assert.equal(hasComparableDetail(nameOnly), false);
  assert.equal(hasComparableDetail(withCompany), true);
  assert.equal(hasComparableDetail({ displayName: "x", phone: "03" }), true);
});
