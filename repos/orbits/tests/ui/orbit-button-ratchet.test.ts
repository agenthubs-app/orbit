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
  tag: string;
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
    hits.push({ file: rel, line, isBtn: BTN_TOKEN.test(tag), tag });
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
  "app/(app)/app/settings/orbit-agent-execution-settings.tsx",
  "app/(app)/app/contacts/orbit-real-contacts.tsx",
  "app/(app)/app/agent/orbit-real-agent.tsx",
  "app/(app)/app/events/orbit-real-explore-client.tsx",
];

// Every non-.btn <button> left in the core surfaces after T5, identified by a
// stable opening-tag marker rather than a source line. Line-number exemptions
// made unrelated imports and markup insertions invalidate the whole table.
const EXEMPTIONS: {
  count: number;
  file: string;
  marker: string;
  reason: string;
}[] = [
  {
    count: 1,
    file: "app/(app)/app/contacts/orbit-real-contacts.tsx",
    marker: "applySearchSuggestion(suggestion)",
    reason: "suggested-query chip",
  },
  {
    count: 2,
    file: "app/(app)/app/contacts/orbit-real-contacts.tsx",
    marker: "setStage(key)",
    reason: "desktop/mobile pipeline-stage filter chips",
  },
  {
    count: 2,
    file: "app/(app)/app/contacts/orbit-real-contacts.tsx",
    marker: "setValueTag",
    reason: "desktop/mobile value-type filter chips",
  },
  {
    count: 2,
    file: "app/(app)/app/contacts/orbit-real-contacts.tsx",
    marker: "onClick={onPick}",
    reason: "filled/empty card-style contact picker slots",
  },
  {
    count: 1,
    file: "app/(app)/app/contacts/orbit-real-contacts.tsx",
    marker: "className=\"card-hover\"",
    reason: "established clickable contact-card pattern",
  },
  {
    count: 2,
    file: "app/(app)/app/contacts/orbit-real-contacts.tsx",
    marker: "setFilter(item.key)",
    reason: "desktop/mobile introduction-status filter chips",
  },
  {
    count: 1,
    file: "app/(app)/app/agent/orbit-real-agent.tsx",
    marker: "className=\"orbit-agent-message-copy\"",
    reason: "message-copy control with dedicated focus and status behavior",
  },
  {
    count: 1,
    file: "app/(app)/app/agent/orbit-real-agent.tsx",
    marker: "className=\"orbit-agent-suggestion\"",
    reason: "welcome suggestion card",
  },
  {
    count: 3,
    file: "app/(app)/app/agent/orbit-real-agent.tsx",
    marker: "className=\"card card-hover\"",
    reason: "people, event, and task result cards",
  },
  {
    count: 1,
    file: "app/(app)/app/agent/orbit-real-agent.tsx",
    marker: "className=\"orbit-agent-send\"",
    reason: "composer control with a dedicated gradient state",
  },
  {
    count: 1,
    file: "app/(app)/app/agent/orbit-real-agent.tsx",
    marker: "className=\"orbit-top-icon-btn orbit-agent-history-btn\"",
    reason: "dedicated history icon control",
  },
  {
    count: 1,
    file: "app/(app)/app/agent/orbit-real-agent.tsx",
    marker: "data-orbit-agent-history-resize-handle",
    reason: "history-sidebar separator and drag handle",
  },
  {
    count: 1,
    file: "app/(app)/app/events/orbit-real-explore-client.tsx",
    marker: "onClick={() => onSelect(item)}",
    reason: "map-pin marker whose geometry is not a standard button",
  },
  {
    count: 2,
    file: "app/(app)/app/events/orbit-real-explore-client.tsx",
    marker: "setStatus(key)",
    reason: "desktop/mobile event-status filter chips",
  },
  {
    count: 2,
    file: "app/(app)/app/events/orbit-real-explore-client.tsx",
    marker: "setTopic(topic === item",
    reason: "desktop/mobile topic filter chips",
  },
  {
    count: 1,
    file: "app/(app)/app/events/orbit-real-explore-client.tsx",
    marker: "setSelectedId(item.id)",
    reason: "clickable map sidebar card",
  },
];

test("the five T5 core surfaces have no non-.btn <button> outside the documented exemption list", () => {
  for (const exemption of EXEMPTIONS) {
    if (!CORE_FILES.includes(exemption.file)) {
      throw new Error(`EXEMPTIONS references a file outside CORE_FILES: ${exemption.file}`);
    }
  }

  const unexplained: ButtonHit[] = [];
  for (const relPath of CORE_FILES) {
    const hits = findButtons(join(projectRoot, relPath));
    for (const hit of hits) {
      const matched = EXEMPTIONS.filter(
        (exemption) =>
          exemption.file === hit.file && hit.tag.includes(exemption.marker),
      );
      if (!hit.isBtn && matched.length === 0) unexplained.push(hit);
      assert.ok(
        hit.isBtn || matched.length <= 1,
        `non-.btn <button> matched multiple exemptions at ${hit.file}:${hit.line}`,
      );
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
  const stale: string[] = [];
  for (const exemption of EXEMPTIONS) {
    const hits = findButtons(join(projectRoot, exemption.file));
    const matching = hits.filter(
      (hit) => !hit.isBtn && hit.tag.includes(exemption.marker),
    );
    if (matching.length !== exemption.count) {
      stale.push(
        `${exemption.file} marker=${JSON.stringify(exemption.marker)} expected=${exemption.count} actual=${matching.length}`,
      );
    }
  }

  assert.equal(
    stale.length,
    0,
    `EXEMPTIONS markers no longer match their documented non-.btn controls:\n` +
      stale.map((entry) => `  ${entry}`).join("\n"),
  );
});
