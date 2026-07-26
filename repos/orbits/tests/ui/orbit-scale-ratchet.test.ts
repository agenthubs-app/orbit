/**
 * Ratchet gate for T6 (audit P1-5): type & spacing scale enforcement.
 *
 * orbit-reference-styles.tsx now documents the canonical scale (see the
 * comment block atop its token section):
 *   fontSize:   0, 11, 12, 13, 14, 15, 16, 18, 22, 28
 *   fontWeight: 400, 500, 600, 700, 800
 *   gap:        0, 4, 8, 12, 16, 20, 24, 32, 48
 *
 * T6 snapped eight core surfaces (today x3, contacts/all-actions x3, agent,
 * contacts) to this scale and converted every numeric `borderRadius` literal
 * in them to a `var(--r-*)` token. This test does not try to migrate the
 * whole app in one shot — it locks in what T6 already snapped and stops new
 * off-scale literals from creeping back in:
 *
 * (a) Sitewide: the number of fontSize / fontWeight / gap literals outside
 *     the scale, under app/(app)/app, must not go up. These are ceilings,
 *     not targets — future migrations should lower them.
 * (b) The eight files T6 snapped must have zero violations each, for all
 *     three properties.
 *
 * `orbit-reference-styles.tsx` and any `*starfield*` file are excluded from
 * both counts: orbit-reference-styles.tsx carries the legacy prototype CSS
 * (extracted string templates, not React style objects) that predates the
 * scale and is out of scope for T6; the starfield canvas files use fontSize/
 * gap-shaped numeric literals for particle/coordinate math that has nothing
 * to do with typography or layout spacing.
 */
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { basename, join, relative } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const projectRoot = join(fileURLToPath(import.meta.url), "../../..");
const APP_DIR = join(projectRoot, "app/(app)/app");

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    const stat = statSync(full);
    if (stat.isDirectory()) {
      if (name === "node_modules" || name === ".next") continue;
      walk(full, out);
    } else if (name.endsWith(".tsx") || name.endsWith(".ts")) {
      out.push(full);
    }
  }
  return out;
}

function isExcludedFromCount(file: string): boolean {
  const name = basename(file);
  if (name.toLowerCase().includes("starfield")) return true;
  if (name === "orbit-reference-styles.tsx") return true;
  return false;
}

// The T6 scale (see orbit-reference-styles.tsx token-section comment).
const FONT_SIZE_SCALE = new Set([0, 11, 12, 13, 14, 15, 16, 18, 22, 28]);
const FONT_WEIGHT_SCALE = new Set([400, 500, 600, 700, 800]);
const GAP_SCALE = new Set([0, 4, 8, 12, 16, 20, 24, 32, 48]);

interface ScaleHit {
  file: string;
  line: number;
  value: number;
}

// Matches `<prop>: <number>` in a style object (e.g. `fontSize: 13.5`,
// `gap: 6`). `\b` before the property name keeps this from matching a
// differently-named property that merely ends in the same word (there are
// none of those for these three props today, but it costs nothing).
function findScaleViolations(file: string, prop: string, scale: Set<number>): ScaleHit[] {
  const text = readFileSync(file, "utf8");
  const rel = relative(projectRoot, file);
  const re = new RegExp(`\\b${prop}\\s*:\\s*(-?[0-9]+(?:\\.[0-9]+)?)`, "g");
  const hits: ScaleHit[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    const value = Number(m[1]);
    if (!scale.has(value)) {
      const line = text.slice(0, m.index).split("\n").length;
      hits.push({ file: rel, line, value });
    }
  }
  return hits;
}

function formatHits(hits: ScaleHit[]): string {
  return hits.map((hit) => `  ${hit.file}:${hit.line} = ${hit.value}`).join("\n");
}

// ---- (a) sitewide ratchets: off-scale literal counts must not increase ----

const SITEWIDE_FILES = walk(APP_DIR).filter((f) => !isExcludedFromCount(f));

test("fontSize literals outside the scale in app/(app)/app do not increase", () => {
  const hits = SITEWIDE_FILES.flatMap((f) => findScaleViolations(f, "fontSize", FONT_SIZE_SCALE));

  // T6 snapped 8 core surfaces to 0 violations each. This ceiling covers
  // everything else in the app that T6 did not touch — only decrease it as
  // future tasks migrate more files onto the scale.
  const CEILING = 63;

  assert.ok(
    hits.length <= CEILING,
    `expected <= ${CEILING} off-scale fontSize literals in app/(app)/app, found ${hits.length} ` +
      `(${hits.length - CEILING} over ceiling):\n${formatHits(hits)}`,
  );
});

test("fontWeight literals outside {400,500,600,700,800} in app/(app)/app do not increase", () => {
  const hits = SITEWIDE_FILES.flatMap((f) => findScaleViolations(f, "fontWeight", FONT_WEIGHT_SCALE));

  const CEILING = 22;

  assert.ok(
    hits.length <= CEILING,
    `expected <= ${CEILING} off-scale fontWeight literals in app/(app)/app, found ${hits.length} ` +
      `(${hits.length - CEILING} over ceiling):\n${formatHits(hits)}`,
  );
});

test("gap literals outside the scale in app/(app)/app do not increase", () => {
  const hits = SITEWIDE_FILES.flatMap((f) => findScaleViolations(f, "gap", GAP_SCALE));

  const CEILING = 250;

  assert.ok(
    hits.length <= CEILING,
    `expected <= ${CEILING} off-scale gap literals in app/(app)/app, found ${hits.length} ` +
      `(${hits.length - CEILING} over ceiling):\n${formatHits(hits)}`,
  );
});

// ---- (b) the eight T6-snapped files: zero violations, all three properties ----

const SNAPPED_FILES = [
  "app/(app)/app/today/orbit-real-today.tsx",
  "app/(app)/app/today/orbit-today-decision-panel.tsx",
  "app/(app)/app/today/orbit-today-decision-form.tsx",
  "app/(app)/app/settings/orbit-agent-execution-settings.tsx",
  "app/(app)/app/contacts/all-actions/orbit-real-all-actions.tsx",
  "app/(app)/app/contacts/all-actions/orbit-all-actions-controls.tsx",
  "app/(app)/app/agent/orbit-real-agent.tsx",
  "app/(app)/app/contacts/orbit-real-contacts.tsx",
];

test("the eight T6-snapped files have zero off-scale fontSize/fontWeight/gap literals", () => {
  const allHits: ScaleHit[] = [];
  for (const relPath of SNAPPED_FILES) {
    const full = join(projectRoot, relPath);
    allHits.push(...findScaleViolations(full, "fontSize", FONT_SIZE_SCALE));
    allHits.push(...findScaleViolations(full, "fontWeight", FONT_WEIGHT_SCALE));
    allHits.push(...findScaleViolations(full, "gap", GAP_SCALE));
  }

  assert.equal(
    allHits.length,
    0,
    `found off-scale literals in a T6-snapped file (must be 0):\n${formatHits(allHits)}`,
  );
});

test("the eight T6-snapped files have zero numeric (non-token) borderRadius literals", () => {
  const re = /\bborderRadius\s*:\s*(-?[0-9]+(?:\.[0-9]+)?)/g;
  const hits: ScaleHit[] = [];
  for (const relPath of SNAPPED_FILES) {
    const full = join(projectRoot, relPath);
    const text = readFileSync(full, "utf8");
    let m: RegExpExecArray | null;
    re.lastIndex = 0;
    while ((m = re.exec(text))) {
      const line = text.slice(0, m.index).split("\n").length;
      hits.push({ file: relPath, line, value: Number(m[1]) });
    }
  }

  assert.equal(
    hits.length,
    0,
    `found numeric borderRadius literals in a T6-snapped file — should be var(--r-*) (must be 0):\n${formatHits(hits)}`,
  );
});
