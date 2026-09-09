import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { loadContactsAnalysis } from "../../app/(app)/app/contacts/analysis/contacts-analysis-route-service";

const projectRoot = join(fileURLToPath(import.meta.url), "../../..");

function source(path: string): string {
  return readFileSync(join(projectRoot, path), "utf8");
}

test("contacts dashboard loads analysis for the authenticated account actor", () => {
  const pageSource = source("app/(app)/app/contacts/dashboard/page.tsx");

  assert.match(pageSource, /const session = await auth\(\)/);
  assert.match(pageSource, /resolveAuthenticatedApiActorFromSession/);
  assert.match(pageSource, /userId: session\.user\.id/);
  assert.match(pageSource, /Authenticated Orbit account membership is unavailable\./);
  assert.match(pageSource, /loadContactsAnalysis\(actor\.id, language\)/);
  assert.doesNotMatch(pageSource, /loadContactsAnalysis\(session\.user\.id, language\)/);
  assert.match(pageSource, /ContactsAnalysisWorkspace initialView=\{view\}/);
  assert.match(pageSource, /redirect\("\/app\/account\/login/);
});

test("contacts analysis forwards each authenticated actor and rejects an empty actor", async () => {
  const seen: string[] = [];
  const service = { getDashboard: async ({ actorId }: { actorId: string }) => {
    seen.push(actorId);
    return { success: false as const, error: { code: "MOBILE_CONTACTS_DASHBOARD_REQUIRED_SECTION_FAILED" as const, section: "aggregate" as const } };
  } };
  for (const actorId of ["account:one", "account:two"]) {
    assert.equal((await loadContactsAnalysis(actorId, "zh", service)).state, "error");
  }
  assert.equal((await loadContactsAnalysis(" ", "zh", service)).state, "error");
  assert.deepEqual(seen, ["account:one", "account:two"]);
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

test("contacts dashboard responsive roots do not occupy or flow beside each other", () => {
  const dashboardSource = source(
    "app/(app)/app/contacts/orbit-real-cards-dashboard.tsx",
  );

  assert.match(
    dashboardSource,
    /className="orbit-page orbit-desktop-only"/,
  );
  assert.match(
    dashboardSource,
    /className="orbit-mobile-only"[\s\S]*?flexDirection: "column"/,
  );
  assert.doesNotMatch(
    dashboardSource,
    /className="orbit-page" data-orbit-real-page="contacts-dashboard"/,
  );
});
