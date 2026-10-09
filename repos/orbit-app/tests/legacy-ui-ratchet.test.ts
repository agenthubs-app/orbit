import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
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

// R04 review m7: "only shrinks" also against every committed version of the list,
// so a count a feature Sprint lowered cannot be raised back later. Skipped where
// git history is not available (e.g. an exported tree).
test("the allow list never grows back above any committed version", (t) => {
  let versions: string[];
  try {
    const shas = execFileSync("git", ["log", "--format=%H", "--", ALLOWLIST], { cwd: appRoot, encoding: "utf8" }).trim().split("\n").filter(Boolean);
    const repoPath = execFileSync("git", ["ls-files", "--full-name", ALLOWLIST], { cwd: appRoot, encoding: "utf8" }).trim() || `repos/orbit-app/${ALLOWLIST}`;
    versions = shas.map((sha) => execFileSync("git", ["show", `${sha}:${repoPath}`], { cwd: appRoot, encoding: "utf8" }));
  } catch {
    t.skip("no git history");
    return;
  }
  const problems: string[] = [];
  for (const version of versions) {
    const earlier = (JSON.parse(version) as { files: Record<string, LegacyCounts> }).files;
    for (const [path, counts] of Object.entries(allowlist)) {
      for (const kind of LEGACY_KINDS) {
        const before = earlier[path] === undefined ? 0 : earlier[path]![kind] ?? 0;
        if ((counts[kind] ?? 0) > before) problems.push(`${path}: ${kind} ${counts[kind]} > ${before} in an earlier version`);
      }
    }
  }
  assert.deepEqual([...new Set(problems)], []);
});

test("skeleton and infrastructure files have zero old patterns and can never be allow-listed", () => {
  assert.deepEqual(Object.keys(legacyByFile(appRoot)).filter((path) => ZERO.some((pattern) => pattern.test(path))), []);
  assert.deepEqual(Object.keys(allowlist).filter((path) => ZERO.some((pattern) => pattern.test(path))), []);
});

test("an old shared component with no users left is deleted", () => {
  // Users include other old components that still exist (review m7): deleting a
  // file another old component imports would break the build.
  const oldFiles = OLD_COMPONENTS.map((name) => `src/components/${name}.tsx`).filter((path) => existsSync(join(appRoot, path)));
  const candidates = [...Object.keys(legacyByFile(appRoot)), ...oldFiles];
  const usersOf = (name: string) => candidates.filter((path) => path !== `src/components/${name}.tsx` && readFileSync(join(appRoot, path), "utf8").match(new RegExp(`from ["'][^"']*components/${name}["']|from ["']\\./${name}["']`))).length;
  for (const name of OLD_COMPONENTS) {
    const file = join(appRoot, "src/components", `${name}.tsx`);
    if (usersOf(name) === 0) assert.equal(existsSync(file), false, `src/components/${name}.tsx has no users: delete it`);
  }
});

test("the scan follows symbols, not spellings (R04 review M4 injections)", () => {
  const rn = (body: string) => legacyCounts(body, "x.tsx");
  assert.deepEqual(rn('import * as RN from "react-native"; RN.Alert.alert("a");'), { alert: 1 });
  assert.deepEqual(rn('import { Alert } from "react-native"; const { alert } = Alert; alert("a");'), { alert: 1 });
  assert.deepEqual(rn('import { Modal as Sheet } from "react-native"; const a = <Sheet visible></Sheet>;'), { modal: 1 });
  assert.deepEqual(rn('import RN from "react-native"; const a = <RN.Modal visible />;'), { modal: 1 });
  assert.deepEqual(rn('const a = <View accessibilityRole={"tablist"} />; const b = <View role="tablist" />; const c = { accessibilityRole: "tablist" as const };'), { tablist: 3 });
  assert.deepEqual(rn('export { ErrorState as Err } from "../ErrorState"; export * from "../../design/controls";'), { oldComponent: 1, controls: 1 });
  // A local `Modal` that is not React Native's is not counted.
  assert.deepEqual(rn('import { Modal } from "./my-modal"; const a = <Modal />;'), {});
});

test("tab lists are allowed only in Segmented, Filters and the tab bar", () => {
  const owners = Object.entries(legacyByFile(appRoot)).filter(([path, counts]) => path.startsWith("src/components/ui/") && counts.tablist);
  assert.deepEqual(owners, []);
  assert.ok((legacyCounts(readFileSync(join(appRoot, "src/components/ui/Segmented.tsx"), "utf8"), "Segmented.tsx").tablist ?? 0) >= 1, "Segmented is a tab list");
});

test("the scan finds each old pattern", () => {
  assert.deepEqual(legacyCounts('import { Alert, Modal } from "react-native"; Alert.alert("a"); <Modal visible />; <View accessibilityRole="tablist" />;', "x.tsx"), { alert: 1, modal: 1, tablist: 1 });
  assert.deepEqual(legacyCounts('import { ErrorState } from "../../components/ErrorState"; import { buttonStyles } from "../../design/controls";', "x.tsx"), { oldComponent: 1, controls: 1 });
  assert.deepEqual(legacyCounts('import { EmptyState } from "../../components/ui";', "x.tsx"), {});
});
