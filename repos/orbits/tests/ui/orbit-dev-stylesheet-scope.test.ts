/**
 * Gate test for T8 (audit P1-7): `app/globals.css` is the `app/dev/**`
 * workbench stylesheet, not an app-wide one.
 *
 * Plan (a) was implemented: every rule in globals.css is namespaced under
 * `.orbit-dev-root` (rather than bare `button`/`input`/`:root`/etc.), the
 * `app/(app)/app` product route group no longer imports it at all, and
 * `app/dev/layout.tsx` imports it once and mounts the `.orbit-dev-root`
 * wrapper around every `/dev/**` page.
 *
 * (a) The product layout must not import globals.css — that's the leak
 *     T8 closes.
 * (b) The dev layout must exist, import globals.css, and render the
 *     `.orbit-dev-root` class so the scoped rules actually apply.
 * (c) globals.css itself must contain no bare top-level element/`:root`/`*`
 *     selector — every rule must be scoped under `.orbit-dev-root`, so a
 *     future edit can't reopen the app-wide leak by accident.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const projectRoot = join(fileURLToPath(import.meta.url), "../../..");

const APP_LAYOUT_PATH = "app/(app)/app/layout.tsx";
const DEV_LAYOUT_PATH = "app/dev/layout.tsx";
const GLOBALS_CSS_PATH = "app/globals.css";

function source(path: string): string {
  return readFileSync(join(projectRoot, path), "utf8");
}

test("app/(app)/app/layout.tsx does not import the dev workbench stylesheet", () => {
  const text = source(APP_LAYOUT_PATH);
  assert.doesNotMatch(
    text,
    /import\s+["'][^"']*globals\.css["']/,
    `${APP_LAYOUT_PATH} must not import globals.css — that stylesheet's bare button/input/` +
      `select/textarea resets and --orbit-* tokens are for the /dev workbench only`,
  );
});

test("app/dev/layout.tsx imports globals.css and mounts .orbit-dev-root", () => {
  const text = source(DEV_LAYOUT_PATH);
  assert.match(
    text,
    /import\s+["'][^"']*globals\.css["']/,
    `${DEV_LAYOUT_PATH} must import globals.css so /dev/** pages still get workbench styling`,
  );
  assert.match(
    text,
    /className="orbit-dev-root"/,
    `${DEV_LAYOUT_PATH} must render the .orbit-dev-root wrapper class — globals.css rules are ` +
      `namespaced under it and won't apply otherwise`,
  );
});

/**
 * Extracts every rule's selector text (the text immediately before its `{`),
 * skipping `@media (...) {` wrapper lines — depth-tracked so it handles the
 * nested rules inside `@media` blocks at the end of the file correctly.
 */
function extractSelectorLists(css: string): string[] {
  const withoutComments = css.replace(/\/\*[\s\S]*?\*\//g, "");
  const selectors: string[] = [];
  let depth = 0;
  let buf = "";
  for (const ch of withoutComments) {
    if (ch === "{") {
      const trimmed = buf.trim();
      if (depth === 0 && !trimmed.startsWith("@media")) {
        selectors.push(trimmed);
      } else if (depth === 1) {
        // depth was already incremented past the @media wrapper's `{` by the
        // time we reach a nested rule's `{`, so this is a real selector too.
        selectors.push(trimmed);
      }
      depth += 1;
      buf = "";
    } else if (ch === "}") {
      depth -= 1;
      buf = "";
    } else {
      buf += ch;
    }
  }
  return selectors.filter(Boolean);
}

test("globals.css has no bare selector outside the .orbit-dev-root namespace", () => {
  const css = source(GLOBALS_CSS_PATH);
  const selectorLists = extractSelectorLists(css);

  const unscoped = selectorLists.filter((list) =>
    list
      .split(",")
      .map((sel) => sel.trim())
      .some((sel) => sel.length > 0 && !sel.startsWith(".orbit-dev-root")),
  );

  assert.equal(
    unscoped.length,
    0,
    `found selector list(s) in ${GLOBALS_CSS_PATH} not scoped under .orbit-dev-root:\n` +
      unscoped.map((s) => `  ${JSON.stringify(s)}`).join("\n"),
  );
});
