/**
 * Gate test for T4 (audit P0-7 + P1-4): dialog/modal unification onto
 * ModalShell + the shared useOrbitModalA11y focus-trap hook + ORBIT_Z.
 *
 * (a) ModalShell (orbit-account-shell.tsx) carries role="dialog" and is
 *     built on useOrbitModalA11y, not an inline reimplementation.
 * (b) The three migrated dialogs (account-auth, party PersonDetailOverlay,
 *     admin CreateEventModal) no longer hand-roll their own Esc listener —
 *     that behavior now comes from the shared hook (directly, or via
 *     ModalShell).
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
const ADMIN_PATH = "app/(app)/app/admin/orbit-real-admin.tsx";
const INBOX_PATH = "app/(app)/app/inbox/relationship-inbox-panel.tsx";

const MIGRATED_FILES = [ACCOUNT_AUTH_PATH, PARTY_PATH, ADMIN_PATH];

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

// ---- (b) migrated dialogs no longer hand-roll their own Esc listener ----

test("account-auth, party, and admin no longer own an independent keydown/Esc listener", () => {
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

test("admin CreateEventModal is migrated onto ModalShell", () => {
  const text = source(ADMIN_PATH);
  assert.match(text, /import\s*\{\s*ModalShell\s*\}\s*from\s*"\.\.\/orbit-account-shell"/);
  assert.match(text, /<ModalShell\b/);
  // The hook now lives once inside ModalShell, not duplicated at the call site.
  assert.ok(
    !text.includes("useOrbitModalA11y"),
    "admin CreateEventModal should no longer call useOrbitModalA11y directly — ModalShell owns it now",
  );
});

// ---- (c) inbox drawer keeps its own trap, but must still announce as a dialog ----

test("relationship inbox drawer exposes aria-modal for assistive tech", () => {
  const text = source(INBOX_PATH);
  assert.match(text, /aria-modal="true"/);
  assert.match(text, /role="dialog"/);
  assert.match(text, /zIndex:\s*ORBIT_Z\.overlay/);
});
