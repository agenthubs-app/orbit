import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import test from "node:test";

import { scanCopy, scanWebCopy } from "../support/hardcoded-copy";

// R03 contract D / RD-24 (SC-R03-04): Web text under app/(app)/app is written as
// { ja, zh, en } — through t({...}) or a copy table in orbit-2026/copy/. Two counts
// per file: hard-coded CJK strings, and { zh, en } objects with no Japanese. New
// code: zero of both. Old pages: the counts recorded when R03 started only go down.
const ALLOWLIST = "tests/fixtures/hardcoded-copy-legacy-allowlist.json";
const OPENING = "tests/fixtures/hardcoded-copy-opening.json";
// sha256 of the opening snapshot: 235 files, 2,306 hard-coded, 3,695 missing ja. Never regenerate it.
const OPENING_SHA256 = "84f66e022e3e662bfde917d494bf15a02949b2311fbf7cdb7bac505e2576962b";

// Skeleton files that must stay at zero (R03 D). Feature Sprints add their new pages.
const ZERO = [/^app\/\(app\)\/app\/orbit-2026\//, /^app\/\(app\)\/app\/orbit-language-/, /^app\/\(app\)\/app\/layout\.tsx$/];

type Counts = { hardcoded: number; missingJa: number };
const allowlist = (JSON.parse(readFileSync(ALLOWLIST, "utf8")) as { files: Record<string, Counts> }).files;
const openingText = readFileSync(OPENING, "utf8");
const opening = JSON.parse(openingText) as Record<string, Counts>;

test("the opening snapshot is the one recorded when R03 started", () => {
  assert.equal(createHash("sha256").update(openingText).digest("hex"), OPENING_SHA256);
});

test("no page has more hard-coded text or missing Japanese than the allow list grants", () => {
  const over: string[] = [];
  for (const [path, counts] of Object.entries(scanWebCopy(process.cwd()))) {
    const allowed = allowlist[path] ?? { hardcoded: 0, missingJa: 0 };
    if (counts.hardcoded > allowed.hardcoded) over.push(`${path}: hard-coded ${counts.hardcoded} > ${allowed.hardcoded}`);
    if (counts.missingJa > allowed.missingJa) over.push(`${path}: missing ja ${counts.missingJa} > ${allowed.missingJa}`);
  }
  assert.deepEqual(over, [], "write { ja, zh, en } (t({...}) or orbit-2026/copy/)");
});

test("the allow list only shrinks", () => {
  const actual = scanWebCopy(process.cwd());
  const problems: string[] = [];
  for (const [path, allowed] of Object.entries(allowlist)) {
    const start = opening[path];
    if (!start) problems.push(`${path} was not in the opening snapshot`);
    else if (allowed.hardcoded > start.hardcoded || allowed.missingJa > start.missingJa) problems.push(`${path}: above the opening counts`);
    const now = actual[path] ?? { hardcoded: 0, missingJa: 0 };
    if (now.hardcoded < allowed.hardcoded || now.missingJa < allowed.missingJa) problems.push(`${path}: now ${JSON.stringify(now)}, lower the allow list`);
  }
  assert.deepEqual(problems, []);
});

test("skeleton files stay at zero and can never be allow-listed", () => {
  assert.deepEqual(Object.keys(scanWebCopy(process.cwd())).filter((path) => ZERO.some((pattern) => pattern.test(path))), []);
  assert.deepEqual(Object.keys(allowlist).filter((path) => ZERO.some((pattern) => pattern.test(path))), []);
});

test("the scan: hard-coded strings count once, translation objects need ja", () => {
  assert.deepEqual(scanCopy('const a = "保存"; const b = `残り${n}件`;'), { hardcoded: 2, missingJa: 0 });
  assert.deepEqual(scanCopy('t({ en: "Save", zh: "保存" })'), { hardcoded: 0, missingJa: 1 });
  assert.deepEqual(scanCopy('t({ en: "Save", zh: "保存", ja: "" })'), { hardcoded: 0, missingJa: 1 });
  assert.deepEqual(scanCopy('t({ en: "Save", zh: "保存", ja: "保存" })'), { hardcoded: 0, missingJa: 0 });
  assert.deepEqual(scanCopy('const c = <p data-testid="一覧">{t({ en: "A", zh: "甲", ja: "あ" })}</p>;', "x.tsx"), { hardcoded: 0, missingJa: 0 });
});
