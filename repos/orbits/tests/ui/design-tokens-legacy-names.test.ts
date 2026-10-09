import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import {
  LEGACY_BANNED_CSS_VAR_NAMES,
  LEGACY_BANNED_NAME_PATTERN,
  LEGACY_CSS_VAR_RENAMES,
  renameLegacyCssVars,
} from "../../scripts/design-tokens/legacy-rename.mjs";

// R01 / RD-06 (SC-R01-04): the Web product speaks only the design's variable
// names. The old names come from the confirmed mapping (color-mapping.md).
// Internal /dev workbench pages keep their own stylesheet and are excluded.
const ROOTS = ["app", "features", "shared"];
const EXCLUDED = [
  "app/dev/",
  "app/globals.css",
  "shared/ui/theme.ts",
  "app/(app)/app/orbit-2026/tokens.css",
];

function productFiles() {
  const files: string[] = ["public/orbit-reference/orbit-reference.generated.css"];
  for (const root of ROOTS) {
    for (const entry of readdirSync(root, { recursive: true, withFileTypes: true })) {
      if (!entry.isFile() || !/\.(tsx?|css|mjs)$/.test(entry.name)) continue;
      const path = join(entry.parentPath, entry.name);
      if (EXCLUDED.some((prefix) => path.startsWith(prefix))) continue;
      files.push(path);
    }
  }
  return files;
}

test("no product file declares or reads an old CSS variable name", () => {
  const offenders: string[] = [];
  for (const path of productFiles()) {
    const text = readFileSync(path, "utf8");
    for (const match of text.matchAll(LEGACY_BANNED_NAME_PATTERN)) offenders.push(`${path}: ${match[0]}`);
  }
  assert.deepEqual(offenders.slice(0, 40), [], `${offenders.length} old names remain`);
});

test("the rename keeps name boundaries and drops the light shadows", () => {
  assert.equal(
    renameLegacyCssVars("color: var(--text); border: 1px solid var(--border-2); --accent: #000; background: var(--accent-soft);"),
    "color: var(--ink); border: 1px solid var(--line); --accent-text: #000; background: var(--accent-soft);",
  );
  assert.equal(renameLegacyCssVars(".chip--live { color: var(--orbit-text) }"), ".chip--live { color: var(--orbit-text) }");
  assert.equal(renameLegacyCssVars("box-shadow: var(--sh-xs, 0 1px 2px rgba(23, 33, 31, 0.08));"), "box-shadow: none;");
  assert.equal(renameLegacyCssVars("box-shadow: var(--sh-pop);"), "box-shadow: var(--shadow-float);");
  const oldName = new RegExp(LEGACY_BANNED_NAME_PATTERN.source);
  for (const target of Object.values(LEGACY_CSS_VAR_RENAMES)) {
    assert.doesNotMatch(`--${target}`, oldName, `${target} is itself an old name`);
  }
});

// R01 review M2: `accent` and `scrim` were old names (renamed once to accent-text
// and scrim-web) but are also design-kit names the source generates. The rename
// table keeps them for the historical codemod; the scan list must not.
test("no variable the generated tokens.css declares is on the banned list", () => {
  const declared = [...readFileSync("app/(app)/app/orbit-2026/tokens.css", "utf8").matchAll(/(?<![\w-])--([\w-]+)\s*:/g)].map((match) => match[1]!);
  assert.ok(declared.includes("accent") && declared.includes("scrim"));
  const banned = new RegExp(`^(?:${LEGACY_BANNED_NAME_PATTERN.source})$`);
  assert.deepEqual([...new Set(declared)].filter((name) => banned.test(`--${name}`)), []);
  for (const name of new Set(declared)) assert.ok(!LEGACY_BANNED_CSS_VAR_NAMES.includes(name), `--${name} is a design name`);
});

test("design names pass the scan while their old neighbours are still caught", () => {
  const scan = (css: string) => [...css.matchAll(new RegExp(LEGACY_BANNED_NAME_PATTERN.source, "g"))].map((match) => match[0]);
  assert.deepEqual(scan("color: var(--accent); background: var(--scrim); fill: var(--accent-soft);"), []);
  assert.deepEqual(scan("color: var(--accent-hover); background: var(--text-2);"), ["--accent-hover", "--text-2"]);
});
