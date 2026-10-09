import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import {
  LEGACY_CSS_VAR_RENAMES,
  LEGACY_NAME_PATTERN,
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
    for (const match of text.matchAll(LEGACY_NAME_PATTERN)) offenders.push(`${path}: ${match[0]}`);
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
  const oldName = new RegExp(LEGACY_NAME_PATTERN.source);
  for (const target of Object.values(LEGACY_CSS_VAR_RENAMES)) {
    assert.doesNotMatch(`--${target}`, oldName, `${target} is itself an old name`);
  }
});
