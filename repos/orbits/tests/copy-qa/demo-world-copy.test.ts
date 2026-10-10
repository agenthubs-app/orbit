import assert from "node:assert/strict";
import test from "node:test";

import { checkCopy } from "../../scripts/copy-qa/check.mjs";
import * as world from "../../shared/mock/demo-world";
import * as fixtures from "../../shared/mock/demo-world/fixtures";

// R08 (SC-R08-04 sub-assertion): the Japanese the demo world shows on screen
// passes the R03 checks (glossary, forbidden words, width, simplified-only
// glyphs, tone). Only Japanese exists here, so only the ja rules apply.
function japaneseStrings(value: unknown, path: string, out: Array<{ id: string; ja: string }>): void {
  if (typeof value === "string") {
    if (/[぀-ヿ一-鿿]/u.test(value)) out.push({ id: path, ja: value });
  } else if (Array.isArray(value)) value.forEach((item, index) => japaneseStrings(item, `${path}[${index}]`, out));
  else if (value && typeof value === "object") for (const [key, item] of Object.entries(value)) japaneseStrings(item, `${path}.${key}`, out);
}

test("the demo world's Japanese passes copy-qa", () => {
  const entries: Array<{ id: string; ja: string }> = [];
  japaneseStrings({ ...world }, "world", entries);
  japaneseStrings({ ...fixtures }, "fixtures", entries);
  assert.ok(entries.length > 40, `${entries.length} strings`);
  const result = checkCopy(entries);
  const issues = result.issues.filter((issue: { rule: string; lang?: string }) => issue.lang === "ja" && issue.rule !== "empty");
  assert.deepEqual(issues, []);
});
