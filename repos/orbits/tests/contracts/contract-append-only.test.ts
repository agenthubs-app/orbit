import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { allowedBreaks, checkContractDir, compareContractShapes, extractContractShape, isDraftContract, readContractFiles } from "../../scripts/contract-snapshot.mjs";

// R08 (SC-R08-05): shared/contract is append-only, checked against .snapshot.json.
// The cases below include the R08 review's probes (M3 / M4 / m6 / m7).
const BASE = `
export type Status = "open" | "done" | "archived";
export interface Base { id: string }
export interface Extra { note?: string; owner: string }
export interface Item extends Base { title: string; note?: string; status: Status; meta: { a: string }; rows: readonly { n: number }[] }
export interface Page<T = string> { items: readonly T[] }
`;
const INDEX = `export type { Item, Status } from "./item";\n`;
const shape = (text: string, index = INDEX) => extractContractShape({ "item.ts": text, "index.ts": index });
const before = shape(BASE);
const breaksOf = (next: string, index = INDEX) => compareContractShapes(before, shape(next, index)).map((item: { kind: string; id: string }) => `${item.kind} ${item.id}`);

test("the current contract matches its snapshot and breaks nothing", () => {
  const { breaks, stale } = checkContractDir(join(process.cwd(), "shared", "contract"));
  assert.deepEqual(breaks, []);
  assert.equal(stale, false, "contract changed without updating the snapshot: node scripts/contract-snapshot.mjs --write");
});

test("the four breaks the PLANNER names all fail", () => {
  assert.deepEqual(breaksOf(BASE.replace(" title: string;", "")), ["removed-field item.ts::Item.title"], "a removed field");
  assert.deepEqual(breaksOf(BASE.replace(" title: string;", " heading: string;")), ["removed-field item.ts::Item.title", "added-required item.ts::Item.heading"], "a rename");
  assert.deepEqual(breaksOf(BASE.replace("Item extends Base { title: string; note?: string;", "Item extends Base { title: string; note: string;")), ["made-required item.ts::Item.note"], "optional made required");
  assert.deepEqual(breaksOf(BASE.replace(' | "done" |', " |")), ["removed-value item.ts::Status='done'"], "an enum that lost a value");
});

test("the review's probes: extends, nested objects, null / unknown, index re-exports, type parameters", () => {
  assert.deepEqual(breaksOf(BASE.replace("export interface Item extends Base {", "export interface Item extends Base, Extra {")), ["added-required item.ts::Item.owner"], "a new base brings a required field");
  assert.deepEqual(breaksOf(BASE.replace("meta: { a: string }", "meta: { a: string; b?: string }")), [], "an optional field inside an inline object");
  assert.deepEqual(breaksOf(BASE.replace("rows: readonly { n: number }[]", "rows: readonly { n: number; m?: string }[]")), [], "an optional field inside an array of inline objects");
  assert.deepEqual(breaksOf(BASE.replace("meta: { a: string }", "meta: { a: string; b: string }")), ["added-required item.ts::Item.meta.b"], "a required field inside an inline object");
  assert.deepEqual(breaksOf(BASE.replace("meta: { a: string }", "meta: {}")), ["removed-field item.ts::Item.meta.a"]);
  assert.deepEqual(breaksOf(BASE.replace(" title: string;", " title: string | null;")), ["changed-type item.ts::Item.title"], "null reaches readers that never handled it");
  assert.deepEqual(breaksOf(BASE.replace(" title: string;", " title: string | unknown;")), ["changed-type item.ts::Item.title"], "unknown erases the type");
  assert.deepEqual(breaksOf(BASE.replace(" title: string;", " title: string | number;")), [], "another union member is a widening");
  assert.deepEqual(breaksOf(BASE, `export type { Item } from "./item";\n`), ["removed-value index.ts::(exports)=Status"], "a re-export removed from index.ts");
  assert.deepEqual(breaksOf(BASE.replace("Page<T = string>", "Page<T = number>")), ["changed-type-params item.ts::Page<>"], "a changed type-parameter default");
});

test("additions pass", () => {
  assert.deepEqual(breaksOf(BASE.replace("status: Status;", "status: Status; density?: 1 | 2 | 3;")), [], "a new optional field");
  assert.deepEqual(breaksOf(BASE.replace('"open" | "done" | "archived"', '"open" | "done" | "archived" | "paused"')), [], "a new enum value");
  assert.deepEqual(breaksOf(BASE.replace("note?: string;", "note?: string | undefined;")), [], "| undefined on an optional field");
  assert.deepEqual(breaksOf(`${BASE}\nexport interface More { id: string }`), [], "a new type");
  assert.deepEqual(breaksOf(BASE, `export type { Item, Status, Page } from "./item";\n`), [], "a new re-export");
});

test("BREAKING.md lets a break through only from a complete table row", () => {
  const row = (cells: string[]) => `| ${cells.join(" | ")} |`;
  const full = row(["2026-10-10", "`item.ts::Item.title`", "moved to Header", "one title source", "甲 ✓ 乙 ✓", "App reads header.title"]);
  assert.deepEqual([...allowedBreaks(full)], ["item.ts::Item.title"]);
  assert.deepEqual([...allowedBreaks("We once mentioned `item.ts::Item.title` in prose.")], [], "prose is not a record");
  assert.deepEqual([...allowedBreaks(row(["2026-10-10", "`item.ts::Item.title`", "moved", "reason", "", "App"]))], [], "no agreement");
  assert.deepEqual([...allowedBreaks(row(["soon", "`item.ts::Item.title`", "moved", "reason", "甲 ✓ 乙 ✓", "App"]))], [], "no date");

  const dir = mkdtempSync(join(tmpdir(), "contract-"));
  try {
    writeFileSync(join(dir, "item.ts"), BASE);
    writeFileSync(join(dir, ".snapshot.json"), JSON.stringify(extractContractShape({ "item.ts": BASE })));
    writeFileSync(join(dir, "item.ts"), BASE.replace(" title: string;", ""));
    assert.equal(checkContractDir(dir).breaks.length, 1);
    writeFileSync(join(dir, "BREAKING.md"), `${full}\n`);
    assert.deepEqual(checkContractDir(dir).breaks, []);
    assert.equal(checkContractDir(dir).stale, true, "the snapshot still needs --write");
    assert.deepEqual([...allowedBreaks(readFileSync(join(dir, "BREAKING.md"), "utf8"))], ["item.ts::Item.title"]);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("only the JSDoc tag @draft in the header makes a draft", () => {
  assert.equal(isDraftContract("/**\n * R08 contract 12.\n * @draft until R22\n */\nexport interface A { id: string }"), true);
  assert.equal(isDraftContract("// @draft until R22\nexport interface A { id: string }"), true);
  assert.equal(isDraftContract("/** This file is not @draft any more. */\nexport interface A { id: string }"), false);
  assert.equal(isDraftContract("export interface A { id: string }\n/** @draft */"), false);
  const files = readContractFiles(join(process.cwd(), "shared", "contract"));
  // R22 fixed plan v2: no draft contract is left, so every file is in the snapshot.
  assert.equal("plan-v2.ts" in files, true);
  assert.equal("home-layout.ts" in files, true);
});
