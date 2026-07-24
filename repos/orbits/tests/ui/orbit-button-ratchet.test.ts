/**
 * Ratchet gate for T5 (audit P1-2 + P1-3): button system enforcement.
 *
 * The `.btn` system (orbit-reference-styles.tsx) plus the `IconButton`
 * primitive (orbit-reference-primitives.tsx) are now the canonical way to
 * build a button in app/(app)/app. This test does not try to migrate the
 * whole app in one shot — it locks in what T5 already migrated and stops
 * new hand-rolled `<button>`s from creeping back in:
 *
 * (a) Sitewide: the number of non-`.btn` `<button>` elements under
 *     app/(app)/app must not go up. T5 brought it from 145 to 129 — that
 *     129 is a ceiling, not a target; future migrations should lower it.
 * (b) The five core surfaces migrated in T5 (today, contacts/all-actions,
 *     contacts list, agent, events explore) must have zero *unexplained*
 *     non-`.btn` buttons — every remaining one is named in EXEMPTIONS below
 *     with a reason (drag handle, filter chip, established card-hover
 *     pattern, or a pre-existing bespoke component with its own dedicated
 *     CSS + test coverage).
 */
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
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

/**
 * Extracts the opening-tag text starting at a `<button` match, tracking
 * brace depth (for `style={{...}}` / `onClick={() => {...}}`) and string
 * state (so a `>` inside `t({ en: "a>b" })` doesn't end the tag early).
 */
function extractOpeningTag(text: string, startIdx: number): string {
  let i = startIdx;
  let depth = 0;
  let inString: string | null = null;
  for (; i < text.length; i++) {
    const ch = text[i];
    if (inString) {
      if (ch === "\\") { i++; continue; }
      if (ch === inString) inString = null;
      continue;
    }
    if (ch === '"' || ch === "'" || ch === "`") { inString = ch; continue; }
    if (ch === "{") { depth++; continue; }
    if (ch === "}") { depth--; continue; }
    if (ch === ">" && depth === 0) return text.slice(startIdx, i + 1);
  }
  return text.slice(startIdx, i);
}

// Matches a standalone "btn" / "btn-*" class token, bounded by quote/brace/
// whitespace/comma — NOT by a hyphen, so page-specific suffixes like
// `orbit-agent-history-btn` or `orbit-top-icon-btn` correctly don't count.
const BTN_TOKEN = /(^|[\s"'`{,])btn(?:-[\w]+)?(?=[\s"'`},]|$)/;
const BUTTON_OPEN = /<button(?=[\s>])/g;

interface ButtonHit {
  file: string;
  line: number;
  isBtn: boolean;
}

function findButtons(file: string): ButtonHit[] {
  const text = readFileSync(file, "utf8");
  const rel = relative(projectRoot, file);
  const hits: ButtonHit[] = [];
  let m: RegExpExecArray | null;
  BUTTON_OPEN.lastIndex = 0;
  while ((m = BUTTON_OPEN.exec(text))) {
    const tag = extractOpeningTag(text, m.index);
    const line = text.slice(0, m.index).split("\n").length;
    hits.push({ file: rel, line, isBtn: BTN_TOKEN.test(tag) });
  }
  return hits;
}

// ---- (a) sitewide ratchet: non-.btn <button> count must not increase ----

test("non-.btn <button> count in app/(app)/app does not increase", () => {
  const allHits = walk(APP_DIR).flatMap(findButtons);
  const nonBtn = allHits.filter((hit) => !hit.isBtn);

  // T5 migrated the five core surfaces below and brought this from 145 to
  // 129. Only allowed to decrease — bump this down when a future task
  // migrates more of the remaining 129, never up to make room for a new
  // hand-rolled button.
  const CEILING = 129;

  assert.ok(
    nonBtn.length <= CEILING,
    `expected <= ${CEILING} non-.btn <button> elements in app/(app)/app, found ${nonBtn.length} ` +
      `(${nonBtn.length - CEILING} over ceiling):\n` +
      nonBtn.map((hit) => `  ${hit.file}:${hit.line}`).join("\n"),
  );
});

// ---- (b) the five T5 core surfaces: every non-.btn button is a named exemption ----

const CORE_FILES = [
  "app/(app)/app/today/orbit-real-today.tsx",
  "app/(app)/app/today/orbit-today-decision-form.tsx",
  "app/(app)/app/today/orbit-today-decision-panel.tsx",
  "app/(app)/app/contacts/all-actions/orbit-real-all-actions.tsx",
  "app/(app)/app/contacts/all-actions/orbit-all-actions-controls.tsx",
  "app/(app)/app/contacts/all-actions/orbit-all-actions-settings.tsx",
  "app/(app)/app/contacts/orbit-real-contacts.tsx",
  "app/(app)/app/agent/orbit-real-agent.tsx",
  "app/(app)/app/events/orbit-real-explore-client.tsx",
];

// Every non-.btn <button> left in the five core surfaces after T5, with why
// it wasn't converted to a `.btn` variant or `IconButton`. Line numbers are
// best-effort (source moves); the count is what the assertion actually
// checks — if a line drifts, update it here rather than loosening the gate.
const EXEMPTIONS: { file: string; line: number; reason: string }[] = [
  // -- contacts/orbit-real-contacts.tsx --
  { file: "app/(app)/app/contacts/orbit-real-contacts.tsx", line: 384, reason: "filter chip (suggested-query chip, className=\"chip\") — chips are a distinct pattern from .btn, not migrated per audit guidance" },
  { file: "app/(app)/app/contacts/orbit-real-contacts.tsx", line: 389, reason: "filter chip (pipeline-stage filter)" },
  { file: "app/(app)/app/contacts/orbit-real-contacts.tsx", line: 395, reason: "filter chip (value-type filter)" },
  { file: "app/(app)/app/contacts/orbit-real-contacts.tsx", line: 785, reason: "PickerSlot (filled) — card-style contact picker with a stacked avatar+label column layout; .btn's fixed 44px row height would clip it" },
  { file: "app/(app)/app/contacts/orbit-real-contacts.tsx", line: 790, reason: "PickerSlot (empty/dashed) — same card-style picker as above" },
  { file: "app/(app)/app/contacts/orbit-real-contacts.tsx", line: 841, reason: "className=\"card-hover\" — established sitewide clickable-card pattern (also used in home/agent/events), not part of the .btn system" },
  { file: "app/(app)/app/contacts/orbit-real-contacts.tsx", line: 921, reason: "filter chip (intro status filter, desktop)" },
  { file: "app/(app)/app/contacts/orbit-real-contacts.tsx", line: 945, reason: "filter chip (intro status filter, mobile)" },
  { file: "app/(app)/app/contacts/orbit-real-contacts.tsx", line: 1361, reason: "ScanContent dropzone — large card-style upload control (52px/36px padding, icon + heading + subtext); not a compact action button" },
  // -- agent/orbit-real-agent.tsx --
  { file: "app/(app)/app/agent/orbit-real-agent.tsx", line: 651, reason: "AgentMessageCopyButton — pre-existing bespoke .orbit-agent-message-copy component with its own hover/focus-visible CSS and a required data-orbit-agent-message-copy test hook (tests/pages/app-agent-message-copy.test.ts)" },
  { file: "app/(app)/app/agent/orbit-real-agent.tsx", line: 946, reason: "welcome-screen suggestion card — pre-existing bespoke .orbit-agent-suggestion component with its own hover/focus-visible CSS" },
  { file: "app/(app)/app/agent/orbit-real-agent.tsx", line: 970, reason: "className=\"card card-hover\" — established sitewide clickable-card pattern" },
  { file: "app/(app)/app/agent/orbit-real-agent.tsx", line: 1021, reason: "className=\"card card-hover\" — established sitewide clickable-card pattern" },
  { file: "app/(app)/app/agent/orbit-real-agent.tsx", line: 1069, reason: "className=\"card card-hover\" — established sitewide clickable-card pattern" },
  { file: "app/(app)/app/agent/orbit-real-agent.tsx", line: 1156, reason: "composer send button — pre-existing bespoke .orbit-agent-send component (gradient background, own focus-visible CSS); no .btn variant supports a gradient fill" },
  { file: "app/(app)/app/agent/orbit-real-agent.tsx", line: 1765, reason: "className=\"orbit-top-icon-btn\" — shared sitewide top-nav icon-button primitive used across many pages, not inline-styled; out of T5's per-page migration scope" },
  { file: "app/(app)/app/agent/orbit-real-agent.tsx", line: 1787, reason: "history-sidebar resize handle (role=\"separator\", cursor: col-resize) — a drag handle, not button semantics" },
  // -- events/orbit-real-explore-client.tsx --
  { file: "app/(app)/app/events/orbit-real-explore-client.tsx", line: 162, reason: "map-pin marker — bespoke absolutely-positioned SVG teardrop marker; .btn's box model would break the marker geometry" },
  { file: "app/(app)/app/events/orbit-real-explore-client.tsx", line: 277, reason: "filter chip (status filter, desktop)" },
  { file: "app/(app)/app/events/orbit-real-explore-client.tsx", line: 278, reason: "filter chip (topic filter, desktop)" },
  { file: "app/(app)/app/events/orbit-real-explore-client.tsx", line: 290, reason: "className=\"card-hover\" — established sitewide clickable-card pattern (map sidebar list item)" },
  { file: "app/(app)/app/events/orbit-real-explore-client.tsx", line: 322, reason: "filter chip (status filter, mobile)" },
  { file: "app/(app)/app/events/orbit-real-explore-client.tsx", line: 324, reason: "filter chip (topic filter, mobile)" },
];

test("the five T5 core surfaces have no non-.btn <button> outside the documented exemption list", () => {
  const exemptionsByFile = new Map<string, Set<number>>();
  for (const exemption of EXEMPTIONS) {
    if (!CORE_FILES.includes(exemption.file)) {
      throw new Error(`EXEMPTIONS references a file outside CORE_FILES: ${exemption.file}`);
    }
    const set = exemptionsByFile.get(exemption.file) ?? new Set<number>();
    set.add(exemption.line);
    exemptionsByFile.set(exemption.file, set);
  }

  const unexplained: ButtonHit[] = [];
  for (const relPath of CORE_FILES) {
    const hits = findButtons(join(projectRoot, relPath));
    const exemptLines = exemptionsByFile.get(relPath) ?? new Set<number>();
    for (const hit of hits) {
      if (!hit.isBtn && !exemptLines.has(hit.line)) unexplained.push(hit);
    }
  }

  assert.equal(
    unexplained.length,
    0,
    `found non-.btn <button> in a T5 core surface without a documented exemption:\n` +
      unexplained.map((hit) => `  ${hit.file}:${hit.line}`).join("\n") +
      `\nEither migrate it to .btn/IconButton, or add it to EXEMPTIONS with a reason.`,
  );
});

test("EXEMPTIONS stays in sync with source — every entry still points at a real non-.btn <button>", () => {
  const stale: { file: string; line: number }[] = [];
  for (const exemption of EXEMPTIONS) {
    const hits = findButtons(join(projectRoot, exemption.file));
    const stillThere = hits.some((hit) => hit.line === exemption.line && !hit.isBtn);
    if (!stillThere) stale.push(exemption);
  }

  assert.equal(
    stale.length,
    0,
    `EXEMPTIONS entries no longer match a non-.btn <button> (line drifted, or it was migrated — remove the entry):\n` +
      stale.map((s) => `  ${s.file}:${s.line}`).join("\n"),
  );
});
