/**
 * The product stylesheets are authored as TypeScript template literals
 * (`const x = ` … backtick-delimited … `). A stray backtick inside one — most
 * easily introduced by writing a CSS comment that quotes a selector or property
 * "like `this`" — silently terminates the literal and turns the rest of the
 * file into invalid TypeScript. The failure mode is a fully blank page, and the
 * compiler error points at the comment rather than at the real problem.
 *
 * This happened four separate times while landing the UI-audit fixes, so it is
 * a gate rather than a note: inside a CSS template literal, use plain prose or
 * quotes, never backticks.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const projectRoot = join(fileURLToPath(import.meta.url), "../../..");

/** Files whose CSS lives in backtick-delimited template literals. */
const CSS_TEMPLATE_FILES = [
  "app/(app)/app/orbit-reference-styles.tsx",
  "app/(app)/app/orbit-theme.tsx",
];

/**
 * Returns the line numbers that sit inside a template literal, by tracking
 * whether an unescaped backtick has opened one. Good enough for these files:
 * they alternate between ordinary TS and long CSS strings, and every literal
 * opens and closes at the start/end of a line.
 */
function backticksInsideTemplates(source: string): { line: number; text: string }[] {
  const offenders: { line: number; text: string }[] = [];
  let inTemplate = false;

  source.split("\n").forEach((line, index) => {
    const ticks = (line.match(/(?<!\\)`/g) ?? []).length;

    if (!inTemplate) {
      // A line that opens a literal and does not close it starts a CSS block.
      if (ticks % 2 === 1) inTemplate = true;
      return;
    }

    if (ticks === 0) return;

    // Inside a literal, the only legitimate backtick is the single one that
    // closes it. Anything else is a stray that will truncate the CSS.
    if (ticks === 1 && line.trim() === "`;") {
      inTemplate = false;
      return;
    }

    offenders.push({ line: index + 1, text: line.trim().slice(0, 90) });
    if (ticks % 2 === 1) inTemplate = false;
  });

  return offenders;
}

for (const file of CSS_TEMPLATE_FILES) {
  test(`${file} has no stray backtick inside a CSS template literal`, () => {
    const offenders = backticksInsideTemplates(readFileSync(join(projectRoot, file), "utf8"));

    assert.deepEqual(
      offenders,
      [],
      "A backtick inside a CSS template literal ends the string early and breaks the " +
        "whole module (blank page). Write the comment without backticks:\n" +
        offenders.map((o) => `  ${file}:${o.line}  ${o.text}`).join("\n"),
    );
  });
}
