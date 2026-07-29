/**
 * Gate test for T4 (audit P0-7 + P1-4): dialog/modal unification onto
 * ModalShell + the shared useOrbitModalA11y focus-trap hook + ORBIT_Z.
 *
 * (a) ModalShell (orbit-account-shell.tsx) carries role="dialog" and is
 *     built on useOrbitModalA11y, not an inline reimplementation.
 * (b) The remaining migrated dialogs (account-auth and party
 *     PersonDetailOverlay) no longer hand-roll their own Esc listener.
 *     Admin's unpersisted CreateEventModal was retired.
 * (c) The relationship inbox drawer (which keeps its own hand-rolled trap by
 *     design) still exposes aria-modal for assistive tech.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const projectRoot = join(fileURLToPath(import.meta.url), "../../..");

function source(path: string): string {
  return readFileSync(join(projectRoot, path), "utf8");
}

const MODAL_SHELL_PATH = "app/(app)/app/orbit-account-shell.tsx";
const ACCOUNT_AUTH_PATH = "app/(app)/app/account/orbit-real-account-auth.tsx";
const PARTY_PATH = "app/(app)/app/dashboard/orbit-real-party.tsx";
const ADMIN_PATHS = [
  "app/(app)/app/admin/orbit-real-admin-login.tsx",
  "app/(app)/app/admin/orbit-real-admin-shell.tsx",
  "app/(app)/app/admin/orbit-real-admin-workspace.tsx",
  "app/(app)/app/admin/orbit-real-admin-events.tsx",
];
const INBOX_PATH = "app/(app)/app/inbox/relationship-inbox-panel.tsx";

const MIGRATED_FILES = [ACCOUNT_AUTH_PATH, PARTY_PATH];

// ---- (a) ModalShell is the single source of dialog a11y behavior ----

test("ModalShell uses useOrbitModalA11y instead of an inline focus trap", () => {
  const shell = source(MODAL_SHELL_PATH);
  assert.match(shell, /import\s*\{\s*useOrbitModalA11y\s*\}\s*from\s*"\.\/orbit-modal-a11y"/);
  assert.match(shell, /const cardRef = useOrbitModalA11y\(onClose\)/);
  // The inline trap this replaced always keyed off `document.addEventListener("keydown"`.
  assert.ok(
    !shell.includes('document.addEventListener("keydown"'),
    "ModalShell should no longer hand-roll its own keydown listener",
  );
});

test("ModalShell's dialog card carries role=\"dialog\" and aria-modal", () => {
  const shell = source(MODAL_SHELL_PATH);
  assert.match(shell, /role="dialog"/);
  assert.match(shell, /aria-modal="true"/);
});

test("ModalShell exposes a dialog/bottom-sheet variant and routes through ORBIT_Z.modal", () => {
  const shell = source(MODAL_SHELL_PATH);
  assert.match(shell, /variant\?:\s*"dialog"\s*\|\s*"bottom-sheet"/);
  assert.match(shell, /zIndex:\s*ORBIT_Z\.modal/);
});

test("ModalShell's bottom-sheet variant keeps its geometry: pinned to the bottom edge, capped width, top-only rounding", () => {
  const shell = source(MODAL_SHELL_PATH);
  assert.match(shell, /flex-end/);
  assert.match(shell, /min\(100%, 460px\)/);
  assert.match(shell, /var\(--r-xl\)/);
});

// ---- (b) migrated dialogs no longer hand-roll their own Esc listener ----

test("account-auth and party no longer own an independent keydown/Esc listener", () => {
  for (const path of MIGRATED_FILES) {
    const text = source(path);
    assert.ok(
      !/addEventListener\(\s*["']keydown["']/.test(text),
      `${path} should no longer call addEventListener("keydown" directly — Esc handling now comes from useOrbitModalA11y (via ModalShell or wired directly)`,
    );
  }
});

test("account-auth dialog is wired to the shared focus-trap hook and carries role/aria-modal", () => {
  const text = source(ACCOUNT_AUTH_PATH);
  assert.match(text, /import\s*\{\s*useOrbitModalA11y\s*\}\s*from\s*"\.\.\/orbit-modal-a11y"/);
  assert.match(text, /useOrbitModalA11y\(handleClose\)/);
  assert.match(text, /role="dialog"/);
  assert.match(text, /aria-modal="true"/);
});

test("party PersonDetailOverlay is migrated onto ModalShell in bottom-sheet variant", () => {
  const text = source(PARTY_PATH);
  assert.match(text, /import\s*\{\s*ModalShell\s*\}\s*from\s*"\.\.\/orbit-account-shell"/);
  assert.match(text, /variant="bottom-sheet"/);
});

test("admin does not retain the unpersisted CreateEventModal", () => {
  const text = ADMIN_PATHS.map(source).join("\n");
  assert.doesNotMatch(
    text,
    /CreateEventModal|<ModalShell\b|useOrbitModalA11y/,
  );
});

// ---- (c) inbox drawer keeps its own trap, but must still announce as a dialog ----

test("relationship inbox drawer exposes aria-modal for assistive tech", () => {
  const text = source(INBOX_PATH);
  assert.match(text, /aria-modal="true"/);
  assert.match(text, /role="dialog"/);
  assert.match(text, /zIndex:\s*ORBIT_Z\.overlay/);
});
