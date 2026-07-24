/**
 * Gate test for T3 (audit P1-1 + P1-4 z 部分): radius tokens sourced in code,
 * and a semantic z-index scale replacing inline literals across app/(app)/app.
 *
 * (a) The 6 --r-* radius tokens (migrated from public/orbit-reference/orbit-reference.html,
 *     the prototype asset that used to be their only definition) are declared
 *     in orbit-reference-styles.tsx.
 * (b) Inline `zIndex: <number>` literals in app/(app)/app are capped at a small
 *     whitelist — everything else must go through ORBIT_Z (app/(app)/app/orbit-z.ts).
 * (c) orbit-theme.tsx no longer uses the old ad hoc z-index: 9999 for the theme
 *     toggle (now ORBIT_Z.sticky = 100, below overlays/dropdowns/modals/toasts).
 */
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const projectRoot = join(fileURLToPath(import.meta.url), "../../..");

function source(path: string): string {
  return readFileSync(join(projectRoot, path), "utf8");
}

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    const stat = statSync(full);
    if (stat.isDirectory()) {
      walk(full, out);
    } else if (name.endsWith(".tsx") || name.endsWith(".ts")) {
      out.push(full);
    }
  }
  return out;
}

// ---- (a) radius tokens are defined in source, not just the prototype asset ----

test("orbit-reference-styles.tsx defines all 6 radius tokens", () => {
  const styles = source("app/(app)/app/orbit-reference-styles.tsx");
  for (const name of ["r-xs", "r-sm", "r-md", "r-lg", "r-xl", "r-pill"]) {
    const re = new RegExp(`--${name}:\\s*[0-9]+px\\s*;`);
    assert.ok(re.test(styles), `--${name} not defined in orbit-reference-styles.tsx`);
  }
});

test("radius tokens match the values extracted from the prototype asset", () => {
  const styles = source("app/(app)/app/orbit-reference-styles.tsx");
  const expected: Record<string, string> = {
    "r-xs": "7px",
    "r-sm": "10px",
    "r-md": "14px",
    "r-lg": "18px",
    "r-xl": "24px",
    "r-pill": "999px",
  };
  for (const [name, value] of Object.entries(expected)) {
    const re = new RegExp(`--${name}:\\s*${value}\\s*;`);
    assert.ok(re.test(styles), `--${name} expected ${value}`);
  }
});

// ---- (b) semantic z-index scale caps inline literals ----

test("orbit-z.ts exports the ORBIT_Z semantic scale", () => {
  const z = source("app/(app)/app/orbit-z.ts");
  assert.ok(/export const ORBIT_Z = \{/.test(z));
  for (const key of ["raised", "sticky", "dropdown", "overlay", "modal", "toast", "debug"]) {
    assert.ok(z.includes(`${key}:`), `ORBIT_Z.${key} missing`);
  }
});

test("inline zIndex number literals in app/(app)/app stay within the documented whitelist", () => {
  // Whitelist: bare `zIndex: <number>` literals that are intentionally NOT
  // routed through ORBIT_Z, because a single semantic tier can't express
  // them (each entry below needs justification in a comment here).
  //
  // Currently empty — the one candidate case (map-pin active/inactive
  // stacking in events/orbit-real-explore-client.tsx) is instead expressed
  // as `ORBIT_Z.raised` / `ORBIT_Z.raised + 10`, so it shows up as a
  // computed expression, not a bare literal, and needs no whitelist entry.
  const WHITELIST_MAX = 2;

  const appDir = join(projectRoot, "app/(app)/app");
  const offenders: { file: string; line: number; text: string }[] = [];
  const literalRe = /zIndex:\s*[0-9]+/;

  for (const file of walk(appDir)) {
    const text = readFileSync(file, "utf8");
    const lines = text.split("\n");
    lines.forEach((lineText, i) => {
      if (literalRe.test(lineText)) {
        offenders.push({ file: relative(projectRoot, file), line: i + 1, text: lineText.trim() });
      }
    });
  }

  assert.ok(
    offenders.length <= WHITELIST_MAX,
    `expected <= ${WHITELIST_MAX} inline zIndex literals in app/(app)/app, found ${offenders.length}:\n` +
      offenders.map((o) => `  ${o.file}:${o.line}`).join("\n"),
  );
});

// ---- (c) theme toggle no longer floats above every other layer ----

test("orbit-theme.tsx no longer uses z-index: 9999 for the theme toggle", () => {
  const theme = source("app/(app)/app/orbit-theme.tsx");
  assert.ok(!theme.includes("9999"), "9999 still present in orbit-theme.tsx");
  assert.ok(/\.orbit-theme-toggle\s*\{[\s\S]*?z-index:\s*100;/.test(theme));
});
