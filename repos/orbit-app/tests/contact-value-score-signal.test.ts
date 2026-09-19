import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

import { contactsToSummaries } from "../src/view-models/contacts";

/**
 * Sprint 0089: the most prominent slot on every contact row held 价值分, which is
 * min(95, 60 + valueTypes.length * 12) on the server — a relabelled count. In the
 * demo data 76 of 78 contacts scored exactly 84 and two scored 72, because 76 had
 * two value types and two had one. The number could take three values and took
 * one; the types it came from vary across eight combinations.
 */

const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

function contact(id: string, valueTypes: readonly string[]) {
  return {
    id, name: `联系人${id}`, role: "投资总监", organization: "港湾创投",
    relationship: "合作过一次", status: "active",
    updatedAt: "2026-09-19T00:00:00.000Z",
    value: { score: Math.min(95, 60 + valueTypes.length * 12), valueTypes },
  };
}

test("the score reproduces as a pure function of the type count, which is the whole problem", () => {
  // Same shape as the live data: nearly every contact lands on one number.
  const summaries = contactsToSummaries({
    contacts: [
      ...Array.from({ length: 5 }, (_, i) => contact(`c${i}`, ["referral_path", "strategic_fit"])),
      contact("c9", ["knowledge_exchange"]),
    ],
  });
  const scores = new Set(summaries.map((row) => row.valueScore));
  assert.deepEqual([...scores].sort(), [72, 84], "three possible values, two observed");
});

test("the value types behind it do carry variety, and the row now shows them", () => {
  const summaries = contactsToSummaries({
    contacts: [
      contact("c1", ["referral_path", "strategic_fit"]),
      contact("c2", ["knowledge_exchange", "community_context"]),
      contact("c3", ["commercial_opportunity", "referral_path"]),
    ],
  });
  assert.deepEqual(summaries.map((row) => row.valueLabels.join(" · ")), [
    "引荐路径 · 战略契合",
    "知识交流 · 社群资源",
    "商业机会 · 引荐路径",
  ]);
  assert.equal(new Set(summaries.map((row) => row.valueScore)).size, 1, "…while the score is identical for all three");
});

test("a contact with no value types shows nothing rather than a floor score", () => {
  const [summary] = contactsToSummaries({ contacts: [contact("c1", [])] });
  assert.deepEqual(summary?.valueLabels, []);
});

test("the contacts list renders the value types in that slot, not the score", () => {
  const screen = read("src/screens/contacts/ContactsScreen.tsx");
  assert.match(screen, /contact\.valueLabels\.join\(" · "\)/u);
  assert.doesNotMatch(screen, /styles\.contactMatchScore\}>\{contact\.valueScore\}/u);
  assert.doesNotMatch(screen, /searchResultScore/u, "the search row already shows the same types as chips");
});
