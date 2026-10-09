// R01 / RD-06: the confirmed old → new CSS custom-property names
// (docs/designs/redesign-2026-10/sprints/R01-design-tokens/color-mapping.md).
//
// Used by:
//   - the one-off rename of the Web code base (this file's CLI, see below);
//   - scripts/build-reference-css.mjs, so the regenerated prototype stylesheet
//     speaks the new names too;
//   - tests/ui/design-tokens-legacy-names.test.ts, which fails when an old
//     name reappears.
//
//   node scripts/design-tokens/legacy-rename.mjs <file>...   rewrite files in place

import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const LEGACY_CSS_VAR_RENAMES = {
  // colour
  "accent": "accent-text",
  "accent-hover": "plum-900",
  "accent-press": "plum-900",
  "accent-softer": "accent-soft",
  "accent-ring": "plum-300",
  "accent-grad": "accent-text",
  "accent-grad-bar": "accent-text",
  "text": "ink",
  "text-2": "ink-2",
  "text-3": "ink-3-text",
  "text-4": "ink-3-text",
  "bg-soft": "bg",
  "bg-sunken": "surface-2",
  "border": "line",
  "border-2": "line",
  "hairline": "line",
  "border-strong": "ink-4",
  "live": "ok-text",
  "live-text": "ok-text",
  "live-soft": "ok-soft",
  "amber": "mac-apricot-text",
  "amber-text": "mac-apricot-text",
  "amber-soft": "mac-apricot",
  "rose": "coral-text",
  "rose-text": "coral-text",
  "rose-soft": "coral-soft",
  "danger": "coral-text",
  "danger-soft": "coral-soft",
  "on-danger": "on-accent",
  "signal": "coral-text",
  "sky": "mac-blue-text",
  "sky-soft": "mac-blue",
  "on-dark": "on-image",
  "scrim": "scrim-web",
  "glass-bar": "glass",
  "glass-chip": "glass",
  "orbit-ink": "ink",
  "orbit-muted": "ink-2",
  "orbit-field": "bg",
  "orbit-line": "line",
  "orbit-deep": "accent-text",
  "orbit-signal": "coral-text",
  // shadow: the design keeps one floating shadow; the light ones go away
  "sh-lg": "shadow-float",
  "sh-pop": "shadow-float",
  // radius and type
  "r-xs": "r-sm",
  "fs-11": "fs-caption",
  "fs-12": "fs-label",
  "fs-13": "fs-body-sm",
  "ff": "font",
  "ff-serif": "font",
  "ff-display": "font",
  "ff-tight": "font",
  "ff-mono": "font-num",
};

// Old names that have no successor: their uses become `none`.
export const LEGACY_SHADOWS_REMOVED = ["sh-xs", "sh-sm", "sh-md"];

export const LEGACY_CSS_VAR_NAMES = [...Object.keys(LEGACY_CSS_VAR_RENAMES), ...LEGACY_SHADOWS_REMOVED];

const names = Object.keys(LEGACY_CSS_VAR_RENAMES).sort((a, b) => b.length - a.length).map((name) => name.replace(/-/g, "\\-"));
// `--name` not preceded or followed by another name character, so `--text`
// never matches inside `--text-2`, `--orbit-text` or a `.chip--live` class.
const RENAME = new RegExp(`(?<![\\w-])--(${names.join("|")})(?![\\w-])`, "g");
// var(--sh-sm) or var(--sh-sm, <fallback with one level of parentheses>)
const REMOVED_SHADOW = new RegExp(`var\\(\\s*--(?:${LEGACY_SHADOWS_REMOVED.join("|")})(?:\\s*,[^()]*(?:\\([^()]*\\)[^()]*)*)?\\)`, "g");

export function renameLegacyCssVars(text) {
  return text.replace(REMOVED_SHADOW, "none").replace(RENAME, (_, name) => `--${LEGACY_CSS_VAR_RENAMES[name]}`);
}

/**
 * The prototype stylesheet (public/orbit-reference) carries its own `:root`
 * token block: the old light palette, radius, shadows and Inter / Geist font
 * stacks. R01 drops it — every value comes from the generated design tokens
 * (app/(app)/app/orbit-2026/tokens.css) — and renames the remaining rules.
 * Used by scripts/build-reference-css.mjs and by the runtime fallback in
 * orbit-reference-styles.tsx.
 */
export function adoptDesignTokens(css) {
  const withoutPrototypeTokens = css.replace(
    /:root\s*\{(?:\s*--[\w-]+\s*:[^;]*;)+\s*\}\s*/,
    "/* :root tokens come from orbit-2026/tokens.css (R01) */\n",
  );
  return renameLegacyCssVars(withoutPrototypeTokens);
}

export const LEGACY_NAME_PATTERN = new RegExp(`(?<![\\w-])--(?:${LEGACY_CSS_VAR_NAMES.sort((a, b) => b.length - a.length).map((name) => name.replace(/-/g, "\\-")).join("|")})(?![\\w-])`, "g");

function main(files) {
  let changed = 0;
  for (const file of files) {
    const before = readFileSync(file, "utf8");
    const after = renameLegacyCssVars(before);
    if (after !== before) {
      writeFileSync(file, after);
      changed += 1;
    }
  }
  console.log(`renamed legacy CSS variables in ${changed} of ${files.length} files`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main(process.argv.slice(2));
