import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import test from "node:test";

// R02 / RD-10 (revised) / RD-24 (SC-R02-02): new code draws icons with
// src/components/ui/Icon.tsx. Old screens keep their Ionicons until the feature
// Sprint that rewrites them (docs/designs/redesign-2026-10/sprints/screen-ownership.md);
// the allow list holds exactly those files and only shrinks. When it is empty the
// @expo/vector-icons dependency goes too (checked again before merging back).
const appRoot = new URL("..", import.meta.url).pathname;
const ALLOWLIST_PATH = "tests/fixtures/ionicons-legacy-allowlist.json";
const allowlist = (JSON.parse(readFileSync(join(appRoot, ALLOWLIST_PATH), "utf8")) as { files: string[] }).files;

// 72 files imported Ionicons when R02 started; the list may only get shorter.
const OPENING_COUNT = 72;

// Places that are new by definition: no Ionicons here, ever, allow list or not.
// Feature Sprints add their new screen directories here as they create them.
const NEW_CODE = [
  /^src\/components\/ui\//,
  /^src\/components\/OrbitNavigationIcon\.tsx$/,
  /^src\/components\/OrbitTabBar\.tsx$/,
  /^src\/screens\/showcase\//,
  /^app\/showcase\//,
];

const IONICONS_IMPORT = /(?:from\s*|require\(\s*|import\(\s*)["']@expo\/vector-icons(?:\/[^"']*)?["']/;

function importsIonicons(source: string) {
  return IONICONS_IMPORT.test(source);
}

function sourceFiles() {
  const files: string[] = [];
  for (const root of ["src", "app"]) {
    for (const entry of readdirSync(join(appRoot, root), { recursive: true, withFileTypes: true })) {
      if (entry.isFile() && /\.[cm]?[jt]sx?$/.test(entry.name)) files.push(relative(appRoot, join(entry.parentPath, entry.name)));
    }
  }
  return files;
}

test("no file outside the legacy allow list imports @expo/vector-icons", () => {
  const allowed = new Set(allowlist);
  const offenders = sourceFiles().filter((path) => !allowed.has(path) && importsIonicons(readFileSync(join(appRoot, path), "utf8")));
  assert.deepEqual(offenders, [], "use <Icon> from src/components/ui/Icon (lookup: R02-icons/icon-mapping.md)");
});

test("the allow list only shrinks: every entry still exists and still imports Ionicons", () => {
  const stale = allowlist.filter((path) => !existsSync(join(appRoot, path)) || !importsIonicons(readFileSync(join(appRoot, path), "utf8")));
  assert.deepEqual(stale, [], `remove these from ${ALLOWLIST_PATH}`);
  assert.ok(allowlist.length <= OPENING_COUNT, `the allow list grew past ${OPENING_COUNT}`);
  assert.deepEqual(allowlist, [...new Set(allowlist)].sort(), "keep the allow list sorted and unique");
});

test("new-code places can never be allow-listed", () => {
  assert.deepEqual(allowlist.filter((path) => NEW_CODE.some((pattern) => pattern.test(path))), []);
});

test("the dependency goes when the last legacy file does", () => {
  const pkg = JSON.parse(readFileSync(join(appRoot, "package.json"), "utf8")) as { dependencies: Record<string, string> };
  if (allowlist.length === 0) assert.equal(pkg.dependencies["@expo/vector-icons"], undefined, "allow list is empty: remove @expo/vector-icons from package.json");
  else assert.ok(pkg.dependencies["@expo/vector-icons"], "legacy screens still need @expo/vector-icons");
});

test("the import check sees every way of pulling Ionicons in", () => {
  assert.ok(importsIonicons('import { Ionicons } from "@expo/vector-icons";'));
  assert.ok(importsIonicons("import Ionicons from '@expo/vector-icons/Ionicons';"));
  assert.ok(importsIonicons('const { Ionicons } = require("@expo/vector-icons");'));
  assert.ok(importsIonicons('const icons = await import("@expo/vector-icons");'));
  assert.ok(!importsIonicons('import { Icon } from "../components/ui/Icon"; // was @expo/vector-icons'));
});
