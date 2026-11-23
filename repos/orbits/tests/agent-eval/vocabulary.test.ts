import assert from "node:assert/strict";
import fs from "node:fs";
import { test } from "node:test";

import { EVAL_README } from "./lib/paths";
import { BASE_CHECK_WORDS, BASE_STEP_WORDS, EXTRA_CHECK_WORDS, EXTRA_STEP_WORDS } from "./lib/vocabulary";

function section(markdown: string, heading: string): string {
  const start = markdown.indexOf(heading);
  assert.ok(start >= 0, `README has ${heading}`);
  const next = markdown.indexOf("\n### ", start + heading.length);
  const nextTop = markdown.indexOf("\n## ", start + heading.length);
  const end = [next, nextTop].filter((index) => index > 0).sort((a, b) => a - b)[0] ?? markdown.length;
  return markdown.slice(start, end);
}

/** First-column words of a table: "| `word: ...` |" or "| word |". */
function firstColumnWords(text: string): string[] {
  return text
    .split("\n")
    .filter((line) => line.startsWith("| ") && !line.startsWith("| ---") && !/^\| (步骤|判定|词) \|/u.test(line))
    .map((line) => line.split("|")[1].trim().replace(/^`|`$/gu, ""))
    .map((cell) => cell.match(/^([a-z_]+)/u)?.[1] ?? "")
    .filter(Boolean);
}

const readme = fs.readFileSync(EVAL_README, "utf8");

test("§3.1 step words match vocabulary.ts", () => {
  const words = new Set(firstColumnWords(section(readme, "### 3.1")));
  // `disconnect` and `reconnect` share one row.
  words.add("reconnect");
  assert.deepEqual([...words].sort(), [...BASE_STEP_WORDS].sort());
});

test("§3.2 check words match vocabulary.ts (variants named in a row's text included)", () => {
  const text = section(readme, "### 3.2");
  const words = new Set(firstColumnWords(text));
  for (const word of BASE_CHECK_WORDS) {
    assert.ok(words.has(word) || text.includes(`\`${word}`), `${word} is in README §3.2`);
  }
  for (const word of words) assert.ok((BASE_CHECK_WORDS as readonly string[]).includes(word), `${word} is in vocabulary.ts`);
});

test("§3.4 supplementary words are all in vocabulary.ts", () => {
  const text = section(readme, "### 3.4");
  const checks = text.slice(text.indexOf("**代码判定**"), text.indexOf("**夹具增量。**"));
  // A §3.4 row may extend a §3.2 word (`order`); only the new words belong to EXTRA_CHECK_WORDS.
  const checkWords = new Set(firstColumnWords(checks).filter((word) => !(BASE_CHECK_WORDS as readonly string[]).includes(word)));
  assert.deepEqual([...checkWords].sort(), [...EXTRA_CHECK_WORDS].sort());
  const steps = text.slice(text.indexOf("**步骤**"), text.indexOf("**代码判定**"));
  for (const word of EXTRA_STEP_WORDS) assert.ok(steps.includes(`| ${word} |`), `${word} is a §3.4 step`);
});
