import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

import { LEGACY_KINDS, legacyByFile, legacyCounts, OLD_COMPONENTS, type LegacyCounts } from "./support/legacy-ui";

// R04 / RD-14 (revised) / RD-24 (SC-R04-04): new code uses src/components/ui. Old
// screens keep Alert.alert, their own <Modal>, hand-written tablists, the old shared
// components and design/controls until the feature Sprint that rewrites them; the
// counts recorded when R04 started may only go down. An old component whose last
// user is gone must be deleted. Merge-back gate (RD-24): the list is empty.
const appRoot = new URL("..", import.meta.url).pathname;
const ALLOWLIST = "tests/fixtures/legacy-ui-allowlist.json";
const OPENING = "tests/fixtures/legacy-ui-opening.json";
// sha256 of the opening snapshot: 88 files — Alert.alert 15, <Modal> 11, hand-written tablist 9,
// old shared components 203, design/controls 48. Never regenerate it.
const OPENING_SHA256 = "94f51f3ff67920bd4bf0e4417f4cbb14b382cff7bc471952e3a0cd7cf4c2ee95";

// Places that must never use the old ways. Feature Sprints add their new screens here.
const ZERO = [
  /^src\/components\/ui\//,
  /^src\/screens\/showcase\//,
  /^app\/showcase\//,
  /^src\/components\/(?:AppScreen|OrbitTabBar|OrbitNavigationIcon|OrbitRouteAccessBoundary|OnlineOnlyBoundary|AppErrorBoundary)\.tsx$/,
  /^src\/api\/AuthSessionProvider\.tsx$/,
];

const allowlist = (JSON.parse(readFileSync(join(appRoot, ALLOWLIST), "utf8")) as { files: Record<string, LegacyCounts> }).files;
const openingText = readFileSync(join(appRoot, OPENING), "utf8");
const opening = JSON.parse(openingText) as Record<string, LegacyCounts>;

test("the opening snapshot is the one recorded when R04 started", () => {
  assert.equal(createHash("sha256").update(openingText).digest("hex"), OPENING_SHA256);
});

test("no file uses an old UI pattern more than the allow list grants", () => {
  const over: string[] = [];
  for (const [path, counts] of Object.entries(legacyByFile(appRoot))) {
    for (const kind of LEGACY_KINDS) {
      const allowed = allowlist[path]?.[kind] ?? 0;
      if ((counts[kind] ?? 0) > allowed) over.push(`${path}: ${kind} ${counts[kind]} > ${allowed}`);
    }
  }
  assert.deepEqual(over, [], "use src/components/ui (ConfirmDialog, ActionSheet, BottomSheet, Segmented, EmptyState, RetryCard …)");
});

test("the allow list only shrinks: within the opening snapshot, lowered as files improve", () => {
  const actual = legacyByFile(appRoot);
  const problems: string[] = [];
  for (const [path, counts] of Object.entries(allowlist)) {
    for (const kind of LEGACY_KINDS) {
      const allowed = counts[kind] ?? 0;
      if (allowed > (opening[path]?.[kind] ?? 0)) problems.push(`${path}: ${kind} above the opening snapshot`);
      if ((actual[path]?.[kind] ?? 0) < allowed) problems.push(`${path}: ${kind} now ${actual[path]?.[kind] ?? 0}, lower the allow list from ${allowed}`);
    }
  }
  assert.deepEqual(problems, []);
});

test("skeleton and infrastructure files have zero old patterns and can never be allow-listed", () => {
  assert.deepEqual(Object.keys(legacyByFile(appRoot)).filter((path) => ZERO.some((pattern) => pattern.test(path))), []);
  assert.deepEqual(Object.keys(allowlist).filter((path) => ZERO.some((pattern) => pattern.test(path))), []);
});

test("an old shared component with no users left is deleted", () => {
  const usersOf = (name: string) => Object.entries(legacyByFile(appRoot)).filter(([path]) => readFileSync(join(appRoot, path), "utf8").match(new RegExp(`from ["'][^"']*components/${name}["']|from ["']\\./${name}["']`))).length;
  for (const name of OLD_COMPONENTS) {
    const file = join(appRoot, "src/components", `${name}.tsx`);
    if (usersOf(name) === 0) assert.equal(existsSync(file), false, `src/components/${name}.tsx has no users: delete it`);
  }
});

test("the scan finds each old pattern", () => {
  assert.deepEqual(legacyCounts('Alert.alert("a"); <Modal visible />; <View accessibilityRole="tablist" />;', "x.tsx"), { alert: 1, modal: 1, tablist: 1 });
  assert.deepEqual(legacyCounts('import { ErrorState } from "../../components/ErrorState"; import { buttonStyles } from "../../design/controls";', "x.tsx"), { oldComponent: 1, controls: 1 });
  assert.deepEqual(legacyCounts('import { EmptyState } from "../../components/ui";', "x.tsx"), {});
});
