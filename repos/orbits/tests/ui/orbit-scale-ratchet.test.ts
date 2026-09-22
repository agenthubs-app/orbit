/**
 * Ratchet gate for T6 (audit P1-5): type & spacing scale enforcement.
 *
 * orbit-reference-styles.tsx now documents the canonical scale (see the
 * comment block atop its token section):
 *   fontSize:   0, 11, 12, 13, 14, 15, 16, 18, 22, 28
 *   fontWeight: 400, 500, 600, 700, 800
 *   gap:        0, 4, 8, 12, 16, 20, 24, 32, 48
 *
 * T6 snapped eight core surfaces (today x3, all-actions x3 — the ledger screen retired 2026-09, its controls now live in agent/actions — agent,
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

// The scale governs React style objects. Pages that carry a stylesheet as a
// template literal (`const X = \`… .foo { gap: 9px } …\``) are the same
// "extracted string template, not a style object" case that excludes
// orbit-reference-styles.tsx wholesale — and `gap: 9px` matches the same
// regex as `gap: 9`. Blank out template-literal bodies (keeping newlines so
// reported line numbers stay right) so CSS text does not count as a hit.
function withoutTemplateLiterals(text: string): string {
  return text.replace(/`(?:\\[\s\S]|[^\\`])*`/g, (block) =>
    "`" + "\n".repeat((block.match(/\n/g) ?? []).length) + "`",
  );
}

// Matches `<prop>: <number>` in a style object (e.g. `fontSize: 13.5`,
// `gap: 6`). `\b` before the property name keeps this from matching a
// differently-named property that merely ends in the same word (there are
// none of those for these three props today, but it costs nothing).
function findScaleViolations(file: string, prop: string, scale: Set<number>): ScaleHit[] {
  const text = withoutTemplateLiterals(readFileSync(file, "utf8"));
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
  // Orbit_0918 task 8: legacy orbit-real contact views deleted → 63 to 48.
  // Events task 6 (2026-09-22) deleted /app/party* (orbit-real-party.tsx) → 36.
  // 运营台 task 6 (2026-09-22) deleted roles/event-role-management-workspace.tsx
  // (fontSize 10 style object) → 35 (measured).
  const CEILING = 35;

  assert.ok(
    hits.length <= CEILING,
    `expected <= ${CEILING} off-scale fontSize literals in app/(app)/app, found ${hits.length} ` +
      `(${hits.length - CEILING} over ceiling):\n${formatHits(hits)}`,
  );
});

test("fontWeight literals outside {400,500,600,700,800} in app/(app)/app do not increase", () => {
  const hits = SITEWIDE_FILES.flatMap((f) => findScaleViolations(f, "fontWeight", FONT_WEIGHT_SCALE));

  // Orbit_0918 task 8: legacy orbit-real contact views deleted → 22 to 20.
  // Events task 6 (2026-09-22) deleted /app/party* (orbit-real-party.tsx) → 16.
  const CEILING = 16;

  assert.ok(
    hits.length <= CEILING,
    `expected <= ${CEILING} off-scale fontWeight literals in app/(app)/app, found ${hits.length} ` +
      `(${hits.length - CEILING} over ceiling):\n${formatHits(hits)}`,
  );
});

test("gap literals outside the scale in app/(app)/app do not increase", () => {
  const hits = SITEWIDE_FILES.flatMap((f) => findScaleViolations(f, "gap", GAP_SCALE));

  // Orbit_0918 task 8: legacy orbit-real contact views deleted → 250 to 230.
  // 个人中心 task 6 deleted orbit-real-profile.tsx → 227.
  // Events task 6 (2026-09-22) deleted /app/party* (orbit-real-party.tsx +
  // event-operations-controls.tsx) → 194.
  // 运营台 task 4 (2026-09-22) deleted event-admission-review-workspace.tsx
  // (gap 6/7/10/14/18 style objects) → 181 (measured).
  // 运营台 task 6 (2026-09-22) deleted roles/event-role-management-workspace.tsx
  // (gap 6/10 style objects) → 174 (measured).
  // 运营台 task 7 (2026-09-22) shared OpsBoundary replaced the admission page's
  // gap 10 boundary row with the on-scale 12 → 173 (measured).
  // iOrbit task 6a (2026-09-23) deleted the fused agent files, the three old
  // sibling screens, chat/ and the /app/today · /app/schedule · /app/followups
  // routes → 167 (measured). fontSize (35) and fontWeight (16) are unchanged:
  // the deleted files carried no off-scale literal of those two kinds.
  const CEILING = 167;

  assert.ok(
    hits.length <= CEILING,
    `expected <= ${CEILING} off-scale gap literals in app/(app)/app, found ${hits.length} ` +
      `(${hits.length - CEILING} over ceiling):\n${formatHits(hits)}`,
  );
});

// ---- (b) the eight T6-snapped files: zero violations, all three properties ----

// iOrbit 任务 6a（2026-09-23）：`/app/today` 三个 T6 文件随路由删除
// （`orbit-today-decision-form.tsx` 还有消费者，移到 `agent/actions/`）；
// `orbit-real-agent.tsx` 删除，取而代之把 Orbit_0918 的 iOrbit 屏级文件加进来——
// 它们本来就是零内联几何（皮肤全在 `iorbit-styles.ts` 的模板字符串里），
// 加进这张零容忍清单是为了防止后续改动把内联几何写回去。
const SNAPPED_FILES = [
  "app/(app)/app/settings/orbit-agent-execution-settings.tsx",
  "app/(app)/app/agent/actions/orbit-all-actions-controls.tsx",
  "app/(app)/app/agent/actions/orbit-today-decision-form.tsx",
  "app/(app)/app/agent/iorbit-0918/iorbit-shell.tsx",
  "app/(app)/app/agent/iorbit-0918/iorbit-screen-frame.tsx",
  "app/(app)/app/agent/iorbit-0918/iorbit-home.tsx",
  "app/(app)/app/agent/iorbit-0918/iorbit-chat.tsx",
  "app/(app)/app/agent/iorbit-0918/iorbit-chat-aside.tsx",
  "app/(app)/app/agent/iorbit-0918/iorbit-history-drawer.tsx",
  "app/(app)/app/agent/iorbit-0918/iorbit-actions.tsx",
  "app/(app)/app/agent/iorbit-0918/iorbit-plan.tsx",
  "app/(app)/app/agent/iorbit-0918/iorbit-strategy.tsx",
];

test("every snapped file has zero off-scale fontSize/fontWeight/gap literals", () => {
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

test("every snapped file has zero numeric (non-token) borderRadius literals", () => {
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
