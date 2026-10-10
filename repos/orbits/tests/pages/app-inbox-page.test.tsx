import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { isOrbitPrivateAppPath } from "../../features/auth/app-auth-routing";

// R07 (SC-R07-04 / 05): the inbox is a page. It is the same panel component in
// inline mode, so it reads the same endpoints at the same 15-second cadence as the
// drawer did; the shell's unread dot reads once per shell (not once per page).
const panel = readFileSync("app/(app)/app/inbox/relationship-inbox-panel.tsx", "utf8");

test("the page renders the panel inline: no scrim, focus trap, resize handle or close button", () => {
  const page = readFileSync("app/(app)/app/inbox/page.tsx", "utf8");
  assert.match(page, /redirect\("\/app\/account\/login\?next=%2Fapp%2Finbox"\)/u);
  assert.match(panel, /export function RelationshipInboxPage\(\)/u);
  assert.match(panel, /<RelationshipInboxPanel key=\{version\} inline initialSeed=\{seed\}/u);
  assert.match(page, /<div className=\{styles\.page\}><RelationshipInboxPage \/><\/div>/u, "the page keeps the shell's main margins");
  assert.match(panel, /if \(inline\) return;\n\s+previouslyFocused/u, "no focus trap inline");
  assert.match(panel, /\{inline \? null : <div\n\s+aria-hidden="true"\n\s+onClick=\{onClose\}/u, "no scrim inline");
  assert.match(panel, /\{inline \? null : <><div className="ri-panel-header">/u, "no header / close / resize inline");
  assert.match(panel, /role=\{inline \? "region" : "dialog"\}/u);
});

test("reads and cadence are unchanged: one counts read per 15 seconds while visible, the same summary endpoint", () => {
  assert.equal((panel.match(/setInterval\(\(\) => void refreshCounts\(\), 15_000\)/gu) ?? []).length, 1);
  assert.match(panel, /if \(loading \|\| document\.visibilityState === "hidden"\) return;/u);
  const shell = readFileSync("app/(app)/app/orbit-2026/shell/Orbit2026Shell.tsx", "utf8");
  assert.equal((shell.match(/readInboxUnreadCounts\(/gu) ?? []).length, 1);
  assert.doesNotMatch(shell, /setInterval/u, "the shell's dot does not poll");
});

test("signed-out visitors are sent to sign-in for /app/inbox, /app/tasks and /app/home", () => {
  for (const path of ["/app/inbox", "/app/inbox/sources/s1", "/app/tasks", "/app/home"]) assert.equal(isOrbitPrivateAppPath(path), true, path);
});

// The bridge's behaviour (a visit with the seed; on the inbox page, the seed handed
// straight to the mounted panel) is rendered in tests/ui/orbit-2026-shell.test.tsx.
test("a compose request on the inbox page re-opens the panel with the new draft", () => {
  assert.match(panel, /window\.addEventListener\(INBOX_PAGE_COMPOSE_EVENT, onCompose\)/u);
  assert.match(panel, /setVersion\(\(value\) => value \+ 1\)/u);
});
