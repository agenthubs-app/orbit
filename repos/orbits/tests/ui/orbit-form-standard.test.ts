/**
 * Gate test for T7 (audit P1-6): form field unification onto the FormField
 * primitive (orbit-reference-primitives.tsx).
 *
 * (a) FormField now has real external adopters: register (email field),
 *     account-auth (all login/signup/forgot fields), and admin's
 *     CreateEventModal (basics + time/place fields) all import and render
 *     it — up from zero before T7.
 * (b) Sitewide `role="alert"` markers must not go down: T7 keeps every
 *     existing announcement (FormField renders its own dynamically) while
 *     standardizing error semantics — it should never remove one.
 * (c) The three migrated files no longer hand-roll a bare
 *     `className="field-error"` — error text goes through FormField's
 *     `.field-error-text` combo instead.
 * (d) events/[id]/register (explicitly exempt from the FormField migration
 *     — field-heavy, non-standard per-question layout) still has its error
 *     marker aligned to the standard combo: the free-text answer input
 *     carries `aria-invalid` alongside the existing `role="alert"` banner.
 */
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const projectRoot = join(fileURLToPath(import.meta.url), "../../..");
const APP_DIR = join(projectRoot, "app/(app)/app");

const PRIMITIVES_PATH = "app/(app)/app/orbit-reference-primitives.tsx";
const REGISTER_PATH = "app/(app)/app/register/orbit-real-register.tsx";
const ACCOUNT_AUTH_PATH = "app/(app)/app/account/orbit-real-account-auth.tsx";
const ADMIN_PATH = "app/(app)/app/admin/orbit-real-admin.tsx";
const EVENT_REGISTRATION_WORKSPACE_PATH =
  "app/(app)/app/events/[id]/register/event-registration-workspace.tsx";

const MIGRATED_FILES = [REGISTER_PATH, ACCOUNT_AUTH_PATH, ADMIN_PATH];

function source(path: string): string {
  return readFileSync(join(projectRoot, path), "utf8");
}

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

// ---- (a) FormField has ≥3 real external adopters ----

test("FormField is imported and rendered by at least 3 files outside its own definition", () => {
  const files = walk(APP_DIR).filter((full) => relative(projectRoot, full) !== PRIMITIVES_PATH);
  const adopters = files.filter((full) => {
    const text = readFileSync(full, "utf8");
    // Require both a real import and a JSX usage — a stray comment
    // mentioning "FormField" (e.g. the exemption note on the registration
    // workspace) must not count as adoption.
    return /import\s*\{[^}]*\bFormField\b[^}]*\}\s*from\s*["'][^"']*orbit-reference-primitives["']/.test(text)
      && /<FormField\b/.test(text);
  });

  assert.ok(
    adopters.length >= 3,
    `expected >=3 files importing+rendering FormField, found ${adopters.length}: ${adopters.map((f) => relative(projectRoot, f)).join(", ")}`,
  );

  for (const path of MIGRATED_FILES) {
    const full = join(projectRoot, path);
    assert.ok(
      adopters.some((f) => f === full),
      `${path} should be a FormField adopter`,
    );
  }
});

// ---- (b) role="alert" must not regress sitewide ----

// Baseline captured after T7's migration (register/account-auth/admin onto
// FormField + the event-registration-workspace aria-invalid alignment).
// FormField itself sets role="alert" dynamically (`role={error ? "alert" :
// undefined}`), so this literal-string count intentionally only tracks the
// hand-rolled markers that existed before T7 — it must never go down.
const ROLE_ALERT_BASELINE = 8;

test('role="alert" count in app/(app)/app does not decrease', () => {
  const count = walk(APP_DIR)
    .map((full) => readFileSync(full, "utf8"))
    .reduce((total, text) => total + (text.match(/role="alert"/g) ?? []).length, 0);

  assert.ok(
    count >= ROLE_ALERT_BASELINE,
    `expected role="alert" count >= ${ROLE_ALERT_BASELINE}, found ${count}`,
  );
});

// ---- (c) migrated files no longer hand-roll a bare field-error class ----

test("register, account-auth, and admin no longer hand-roll className=\"field-error\"", () => {
  for (const path of MIGRATED_FILES) {
    const text = source(path);
    assert.ok(
      !text.includes('className="field-error"'),
      `${path} should route error text through FormField's .field-error-text combo, not a bare className="field-error"`,
    );
  }
});

// ---- (d) exempt workspace still gets the standard error-marker combo ----

test("event-registration-workspace is documented as exempt from FormField and keeps role=\"alert\" + aria-invalid aligned", () => {
  const text = source(EVENT_REGISTRATION_WORKSPACE_PATH);
  assert.match(text, /FormField/, "exemption comment should reference FormField by name");
  assert.match(text, /豁免/, "exemption should be documented inline");
  assert.match(text, /role="alert"/);
  assert.match(text, /aria-invalid=\{error \? true : undefined\}/);
});
