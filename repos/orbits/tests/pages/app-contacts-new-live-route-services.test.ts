import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const projectRoot = join(fileURLToPath(import.meta.url), "../../..");

function source(path: string): string {
  return readFileSync(join(projectRoot, path), "utf8");
}

test("/app/contacts/new renders the action workspace without preflight side effects", async () => {
  const pageSource = source("app/(app)/app/contacts/new/page.tsx");
  const retiredRouteLoaderSource = source(
    "app/(app)/app/contacts/new/compose-app-contacts-new-from-previously-approved-mock-first-capabilities/contacts-new-route-services.ts",
  );
  const importWorkspaceSource = source(
    "app/(app)/app/contacts/orbit-real-cards-import.tsx",
  );

  assert.match(pageSource, /await auth\(\)/);
  assert.match(pageSource, /session\?\.user\?\.id/);
  assert.match(pageSource, /redirect\("\/app\/account\/login\?next=/);
  assert.match(pageSource, /OrbitRealCardsImport/);
  assert.match(pageSource, /resolveBusinessCardCaptureAvailability/);
  assert.match(pageSource, /businessCardAvailability=/);
  assert.doesNotMatch(pageSource, /getOrbitContactsViewModel/);
  assert.doesNotMatch(
    pageSource,
    /loadAppContactsNewRouteViewModel|scanBusinessCard|scanQrCode|importEventAttendees/,
  );
  assert.doesNotMatch(pageSource, /searchParams|confirmManualContactDraft/);
  assert.doesNotMatch(
    retiredRouteLoaderSource,
    /createAppContactsNewRouteServices|loadAppContactsNewRouteViewModel|readSearchParam|confirmManualContactDraft/,
  );
  assert.match(importWorkspaceSource, /BusinessCardCaptureWorkspace/);
  assert.match(importWorkspaceSource, /Not connected|未连接/);
  assert.match(importWorkspaceSource, /href="\/app\/contacts"/);
  assert.doesNotMatch(
    importWorkspaceSource,
    /className="card card-hover" href="\/app\/contacts\/new"/,
  );
});
