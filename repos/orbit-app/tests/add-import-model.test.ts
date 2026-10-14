import assert from "node:assert/strict";
import test from "node:test";

import { strToU8, zipSync } from "fflate";

import { buildVcards } from "../src/api/compute/vcard-build";
import { addCount, commitPlan, splitImportRows } from "../src/screens/add/import/import-model";
import { IMPORT_DESIGN } from "../src/screens/add/import/import-design";

import { prepareLinkedInFile, toPickPerson } from "../src/screens/add/import/import-device";

test("連絡先 design sample adds up the way b9 A2 ② counts it (1,284 / 238 work / 46 family-shop / 214 company / 96 work mail)", () => {
  const people = IMPORT_DESIGN.pick.map((entry, index) => toPickPerson(String(index), entry, (key) => key));
  assert.equal(people.length, 1284);
  assert.equal(people.filter((person) => person.likely).length, 238);
  assert.equal(people.filter((person) => person.excluded).length, 46);
  assert.equal(people.filter((person) => person.hasCompany).length, 214);
  assert.equal(people.filter((person) => person.workMail).length, 96);
  // Only the chosen people become vCards (nothing else leaves the phone).
  const chosen = IMPORT_DESIGN.pick.slice(0, 3);
  assert.equal((buildVcards(chosen).match(/BEGIN:VCARD/g) ?? []).length, 3);
});

test("まとめて確認 design sample: 238 = 4 auto + 2 similar + 14 要確認 + 218 → 234人を人脈に追加, every merge confirmed", () => {
  const rows = IMPORT_DESIGN.review.rows;
  const split = splitImportRows(rows);
  assert.equal(split.total, 238);
  assert.equal(addCount(split), 234);
  const plan = commitPlan(rows, Object.fromEntries(split.duplicates.map((row) => [row.seq, true])));
  assert.equal(plan.mergeConfirmations.length, 6);
});

test("LinkedIn: a ZIP gives its Connections.csv; a CSV goes as it is; anything else is refused", () => {
  const zip = zipSync({ "Export/Connections.csv": strToU8("First Name\nKyohei\n"), "Export/Messages.csv": strToU8("x") });
  const picked = prepareLinkedInFile(zip, "Basic.zip");
  assert.equal(picked.ok && picked.name, "Connections.csv");
  assert.deepEqual(prepareLinkedInFile(zipSync({ "a.csv": strToU8("1"), "b.csv": strToU8("2") }), "x.zip"), { ok: false, reason: "add.import.errZipNoCsv" });
  assert.equal(prepareLinkedInFile(strToU8("a,b"), "c.csv").ok, true);
  assert.deepEqual(prepareLinkedInFile(strToU8("x"), "a.png"), { ok: false, reason: "add.import.errWrongType" });
});
