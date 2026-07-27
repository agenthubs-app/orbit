import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const projectRoot = join(fileURLToPath(import.meta.url), "../../..");

function source(path: string): string {
  return readFileSync(join(projectRoot, path), "utf8");
}

test("contacts dashboard loads the authenticated account's contacts", () => {
  const pageSource = source("app/(app)/app/contacts/dashboard/page.tsx");

  assert.match(pageSource, /const session = await auth\(\)/);
  assert.match(pageSource, /loadAppContactsRouteViewModel\(undefined, session\.user\.id\)/);
  assert.match(pageSource, /contactsRouteToOrbitContactsViewModel/);
  assert.match(pageSource, /redirect\("\/app\/account\/login/);
});

test("contacts dashboard has a real zero-data state and no demo metrics or people", () => {
  const dashboardSource = source(
    "app/(app)/app/contacts/orbit-real-cards-dashboard.tsx",
  );

  assert.match(dashboardSource, /data-orbit-contacts-dashboard-empty/);
  assert.match(dashboardSource, /viewModel\.connections/);
  assert.doesNotMatch(dashboardSource, /Emily Wong|佐藤花|陈伟|刘洋/);
  assert.doesNotMatch(dashboardSource, /value: "128"|128 contacts|共 128 位/);
});
