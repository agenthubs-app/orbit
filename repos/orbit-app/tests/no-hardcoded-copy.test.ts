import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

import { hardcodedCopyByFile, hardcodedCopyCount } from "./support/hardcoded-copy";

// R03 contract D / RD-12 (revised) / RD-24 (SC-R03-04): user-visible text lives in
// the domain dictionaries (src/i18n/<locale>/) or the standard copy (src/api/copy,
// via useStandardCopy). New code: zero hard-coded text. Old screens: the counts
// recorded when R03 started may only go down; the feature Sprint that rewrites a
// screen takes it to zero and drops the line (merge-back gate: list empty).
const appRoot = new URL("..", import.meta.url).pathname;
const ALLOWLIST = "tests/fixtures/hardcoded-copy-legacy-allowlist.json";
const OPENING = "tests/fixtures/hardcoded-copy-opening.json";
// sha256 of the opening snapshot: 148 files, 3,779 strings. Never regenerate it.
const OPENING_SHA256 = "a18fa02efb093b7ccd9c318182256de077fc5441d8d1b77a3838962e7642f2d3";

// Skeleton files that must stay at zero (R03 D): navigation shell, kept
// infrastructure and everything new. Feature Sprints add their new screens here.
const ZERO = [
  /^src\/components\/ui\//,
  /^src\/screens\/showcase\//,
  /^app\/showcase\//,
  // R23 plan v2.2 generation flow.
  /^src\/screens\/plan\//,
  /^app\/plans\//,
  /^src\/components\/(?:AppScreen|OrbitTabBar|OrbitNavigationIcon|OrbitRouteAccessBoundary|OnlineOnlyBoundary|AppErrorBoundary)\.tsx$/,
  /^src\/view-models\/app-navigation\.ts$/,
  /^src\/api\/AuthSessionProvider\.tsx$/,
  /^src\/i18n\/(?:standard-copy|messages|locale-core|OrbitLocaleContext|OrbitLocaleProvider)\.tsx?$/,
];

const allowlist = (JSON.parse(readFileSync(join(appRoot, ALLOWLIST), "utf8")) as { files: Record<string, number> }).files;
const openingText = readFileSync(join(appRoot, OPENING), "utf8");
const opening = JSON.parse(openingText) as Record<string, number>;

test("the opening snapshot is the one recorded when R03 started", () => {
  assert.equal(createHash("sha256").update(openingText).digest("hex"), OPENING_SHA256);
});

test("no file has more hard-coded text than the allow list grants (zero outside it)", () => {
  const over: string[] = [];
  for (const [path, count] of Object.entries(hardcodedCopyByFile(appRoot))) {
    const allowed = allowlist[path] ?? 0;
    if (count > allowed) over.push(`${path}: ${count} > ${allowed}`);
  }
  assert.deepEqual(over, [], "move the text into src/i18n/<locale>/<domain>.ts or use useStandardCopy()");
});

test("the allow list only shrinks: within the opening snapshot, and lowered when a file improves", () => {
  const actual = hardcodedCopyByFile(appRoot);
  const problems: string[] = [];
  for (const [path, allowed] of Object.entries(allowlist)) {
    if (!(path in opening)) problems.push(`${path} was not in the opening snapshot`);
    else if (allowed > opening[path]!) problems.push(`${path}: ${allowed} > opening ${opening[path]}`);
    if ((actual[path] ?? 0) < allowed) problems.push(`${path}: now ${actual[path] ?? 0}, lower the allow list from ${allowed}`);
  }
  assert.deepEqual(problems, []);
});

test("skeleton files stay at zero and can never be allow-listed", () => {
  const actual = hardcodedCopyByFile(appRoot);
  assert.deepEqual(Object.keys(actual).filter((path) => ZERO.some((pattern) => pattern.test(path))), []);
  assert.deepEqual(Object.keys(allowlist).filter((path) => ZERO.some((pattern) => pattern.test(path))), []);
});

test("the scan counts literals, templates and JSX text, and skips comments, test ids and logs", () => {
  assert.equal(hardcodedCopyCount('const a = "保存"; const b = `残り${n}件`; // 注释'), 2);
  assert.equal(hardcodedCopyCount('const c = <Text>保存する</Text>;', "x.tsx"), 1);
  assert.equal(hardcodedCopyCount('const d = <View testID="一覧" />; console.warn("失败");', "x.tsx"), 0);
  assert.equal(hardcodedCopyCount('const e = locale.t("common.save");'), 0);
});
