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

// ---- (a) radius tokens come from the generated design tokens (R01) ----

test("the design token stylesheet defines the design radius scale", () => {
  const tokens = source("app/(app)/app/orbit-2026/tokens.css");
  const expected: Record<string, string> = {
    "r-xl": "24px",
    "r-lg": "20px",
    "r-md": "14px",
    "r-sm": "10px",
    "r-sheet": "34px",
    "r-dialog": "28px",
    "r-card-web": "22px",
    "r-bubble": "18px",
    "r-pill": "999px",
  };
  for (const [name, value] of Object.entries(expected)) {
    const re = new RegExp(`--${name}:\\s*${value}\\s*;`);
    assert.ok(re.test(tokens), `--${name} expected ${value}`);
  }
  const styles = source("app/(app)/app/orbit-reference-styles.tsx");
  assert.ok(!/--r-[a-z-]+:\s*[0-9]+px/.test(styles), "radius is no longer redeclared in orbit-reference-styles.tsx");
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
  // stacking in events/events-0918/events-list.tsx) is instead expressed
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

// ---- (c) theme is controlled from settings, not a global floating layer ----

test("orbit-theme.tsx contains no floating theme-toggle layer", () => {
  const theme = source("app/(app)/app/orbit-theme.tsx");
  assert.ok(!theme.includes("9999"), "9999 still present in orbit-theme.tsx");
  assert.ok(!theme.includes(".orbit-theme-toggle"));
  assert.ok(!theme.includes("OrbitThemeToggle"));
});

// ---- (d) the CSS scale and ORBIT_Z are one scale, not two ----

test("the CSS --z-* tokens match ORBIT_Z", () => {
  const styles = source("app/(app)/app/orbit-reference-styles.tsx");
  const z = source("app/(app)/app/orbit-z.ts");

  for (const tier of ["raised", "sticky", "dropdown", "overlay", "modal", "toast"]) {
    const fromTs = z.match(new RegExp(`${tier}:\\s*(\\d+)`))?.[1];
    const fromCss = styles.match(new RegExp(`--z-${tier}:\\s*(\\d+)`))?.[1];

    assert.ok(fromTs, `ORBIT_Z.${tier} is missing`);
    assert.ok(fromCss, `--z-${tier} is missing from orbit-reference-styles.tsx`);
    assert.equal(
      fromCss,
      fromTs,
      `--z-${tier} (${fromCss}) and ORBIT_Z.${tier} (${fromTs}) must agree`,
    );
  }
});

test("the product stylesheet declares no global z-index outside the scale", () => {
  // 0/1/2 are local stacking inside a single component (a badge over an
  // avatar, a label over a gradient) — they never participate in the global
  // layer order, so they are not a tier and do not need a token.
  const LOCAL_STACKING = new Set(["0", "1", "2"]);
  const styles = source("app/(app)/app/orbit-reference-styles.tsx");
  const offenders: string[] = [];

  for (const match of styles.matchAll(/z-index:\s*([^;\n}]+)/g)) {
    const value = match[1].trim();
    if (value.startsWith("var(--z-") || value.startsWith("calc(var(--z-")) continue;
    if (LOCAL_STACKING.has(value)) continue;
    offenders.push(value);
  }

  assert.deepEqual(
    offenders,
    [],
    "Use var(--z-<tier>) instead of a raw z-index. Before this gate the " +
      "stylesheet ran three incompatible scales at once (35/60/70/90/100/120, " +
      "ORBIT_Z's 10..500, and the namecard layer's 3900/3950/4000), which is " +
      "how .nc-basis-pop ended up at 60 — below the sticky nav that occluded it. " +
      `Offending values: ${offenders.join(", ")}`,
  );
});
