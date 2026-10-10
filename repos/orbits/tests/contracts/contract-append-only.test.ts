import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { allowedBreaks, checkContractDir, compareContractShapes, extractContractShape, isDraftContract, readContractFiles } from "../../scripts/contract-snapshot.mjs";

// R08 (SC-R08-05): shared/contract is append-only, checked against .snapshot.json.
const BASE = `
export type Status = "open" | "done";
export interface Item { id: string; title: string; note?: string; status: Status }
`;
const shape = (text: string) => extractContractShape({ "item.ts": text });
const breaksOf = (next: string) => compareContractShapes(shape(BASE), shape(next)).map((item: { kind: string; id: string }) => `${item.kind} ${item.id}`);

test("the current contract matches its snapshot and breaks nothing", () => {
  const { breaks, stale } = checkContractDir(join(process.cwd(), "shared", "contract"));
  assert.deepEqual(breaks, []);
  assert.equal(stale, false, "contract changed without updating the snapshot: node scripts/contract-snapshot.mjs --write");
});

test("the four breaks all fail", () => {
  assert.deepEqual(breaksOf(BASE.replace(" title: string;", "")), ["removed-field item.ts::Item.title"], "a removed field");
  assert.deepEqual(breaksOf(BASE.replace(" title: string;", " heading: string;")), ["removed-field item.ts::Item.title", "added-required item.ts::Item.heading"], "a rename");
  assert.deepEqual(breaksOf(BASE.replace("note?: string", "note: string")), ["made-required item.ts::Item.note"], "optional made required");
  assert.deepEqual(breaksOf(BASE.replace(' | "done"', "")), ['removed-value item.ts::Status="done"'], "an enum that lost a value");
});

test("additions and widenings pass", () => {
  assert.deepEqual(breaksOf(BASE.replace("status: Status }", "status: Status; density?: 1 | 2 | 3 }")), [], "a new optional field");
  assert.deepEqual(breaksOf(BASE.replace('"open" | "done"', '"open" | "done" | "archived"')), [], "a new enum value");
  assert.deepEqual(breaksOf(BASE.replace("note?: string", "note?: string | null")), [], "a widened type");
  assert.deepEqual(breaksOf(`${BASE}\nexport interface Extra { id: string }`), [], "a new type");
  assert.deepEqual(breaksOf(BASE.replace("title: string", "title: number")), ["changed-type item.ts::Item.title"], "a narrowed or changed type still fails");
});

test("a break written in BREAKING.md is let through; the snapshot records it", () => {
  const dir = mkdtempSync(join(tmpdir(), "contract-"));
  try {
    writeFileSync(join(dir, "item.ts"), BASE);
    writeFileSync(join(dir, ".snapshot.json"), JSON.stringify(shape(BASE)));
    writeFileSync(join(dir, "item.ts"), BASE.replace(" title: string;", ""));
    assert.equal(checkContractDir(dir).breaks.length, 1);
    writeFileSync(join(dir, "BREAKING.md"), "| 2026-10-10 | `item.ts::Item.title` | moved to Header | one title source | 甲 ✓ 乙 ✓ | App reads header.title |\n");
    assert.deepEqual(checkContractDir(dir).breaks, []);
    assert.equal(checkContractDir(dir).stale, true, "the snapshot still needs --write");
    assert.deepEqual([...allowedBreaks(readFileSync(join(dir, "BREAKING.md"), "utf8"))], ["item.ts::Item.title"]);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("a contract marked @draft in its header is neither recorded nor checked", () => {
  assert.equal(isDraftContract("/**\n * @draft until R22\n */\nexport interface A { id: string }"), true);
  assert.equal(isDraftContract("export interface A { id: string }\n// mentions @draft later"), false);
  const files = readContractFiles(join(process.cwd(), "shared", "contract"));
  assert.equal("plan-v2.ts" in files, false);
  assert.equal("home-layout.ts" in files, true);
});
