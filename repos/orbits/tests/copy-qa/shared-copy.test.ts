import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { checkCopy } from "../../scripts/copy-qa/check.mjs";
import { loadSharedCopy } from "../../scripts/copy-qa/sources.mjs";
import { en } from "../../shared/copy/en";
import { ja } from "../../shared/copy/ja";
import { zh } from "../../shared/copy/zh";

// R03 contract A / SC-R03-02, SC-R03-06: the standard wording both clients take
// their fixed phrases from. Same groups and keys in all three languages, import-free
// (copied verbatim into the App), and zero copy-qa issues.
const shape = (copy: Record<string, Record<string, string>>) => Object.fromEntries(Object.entries(copy).map(([group, keys]) => [group, Object.keys(keys)]));

test("ja, zh and en declare the same groups and keys", () => {
  assert.deepEqual(shape(zh), shape(ja));
  assert.deepEqual(shape(en), shape(ja));
  for (const group of ["chip", "toast", "confirm", "filter", "aiCard", "offline", "error", "degraded", "loading", "sample", "quota", "push", "permission", "nav", "taskSegments", "homeEdit", "draftBoundary"]) {
    assert.ok(group in ja, `contract group ${group} missing`);
  }
});

test("the source files are import-free constants", () => {
  for (const lang of ["ja", "zh", "en"]) assert.doesNotMatch(readFileSync(`shared/copy/${lang}.ts`, "utf8"), /^\s*import\s/m);
});

test("copy-qa finds zero issues in the standard wording", async () => {
  const result = checkCopy(await loadSharedCopy(process.cwd()));
  assert.ok(result.entries > 100);
  assert.deepEqual(result.issues, []);
});

test("design wording that the glossary fixes stays verbatim", () => {
  assert.equal(ja.draftBoundary.notice, "送信はしません\u00a0· 送信はあなたが行います");
  assert.equal(ja.action.undo, "元に戻す");
  assert.equal(ja.action.tomorrow, "明日");
  assert.deepEqual(Object.values(ja.taskSegments), ["カレンダー", "To-do", "プラン", "メモ"]);
  assert.deepEqual([ja.nav.home, ja.nav.network, ja.nav.iorbit, ja.nav.events, ja.nav.task], ["ホーム", "人脈", "iOrbit", "イベント", "Task"]);
});
