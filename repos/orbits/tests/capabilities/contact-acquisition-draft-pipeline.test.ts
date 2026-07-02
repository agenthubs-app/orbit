/**
 * 联系人获取草稿 pipeline 的契约测试。
 *
 * 验证草稿列表、确认结果、scenario 状态和 debug-view 的 source-backed 输出。
 */
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

const projectRoot = join(fileURLToPath(import.meta.url), "../../..");

async function importProjectModule<TModule>(
  pathFromRoot: string,
): Promise<TModule> {
  const absolutePath = join(projectRoot, pathFromRoot);

  assert.equal(
    existsSync(absolutePath),
    true,
    `${pathFromRoot} must exist for the contact acquisition draft pipeline sprint`,
  );

  return (await import(pathToFileURL(absolutePath).href)) as TModule;
}

test("contact acquisition draft pipeline contract exposes source-aware drafts, confirmation, and evidence creation", async () => {
  const contract = await importProjectModule<
    typeof import("../../features/acquisition/contract")
  >("features/acquisition/contract.ts");
  const fixtures = await importProjectModule<
    typeof import("../../features/acquisition/fixtures")
  >("features/acquisition/fixtures.ts");
  const serviceModule = await importProjectModule<
    typeof import("../../features/acquisition/mock-service")
  >("features/acquisition/mock-service.ts");

  const service = serviceModule.createMockContactAcquisitionDraftService();
  const success = service.listContactDrafts();
  const empty = service.listContactDrafts({ scenario: "empty" });
  const pending = service.listContactDrafts({ scenario: "pending" });
  const failure = service.listContactDrafts({ scenario: "failure" });
  const confirmed = service.confirmContactDraft({
    draftId: "demo-draft-1",
  });

  assert.deepEqual(contract.CONTACT_ACQUISITION_DRAFT_ERROR_CODES, [
    "CONTACT_DRAFT_LIVE_STORE_UNCONFIGURED",
    "CONTACT_DRAFT_NOT_FOUND",
    "CONTACT_DRAFT_ALREADY_CONFIRMED",
    "CONTACT_DRAFT_CONFIRMATION_NOT_ALLOWED",
    "CONTACT_DRAFT_PIPELINE_FAILED",
  ]);
  assert.equal(
    contract.CONTACT_ACQUISITION_DRAFT_ERROR_DEFINITIONS
      .CONTACT_DRAFT_NOT_FOUND.appCode,
    "NOT_FOUND",
  );

  assert.equal(success.success, true);
  assert.equal(success.data.state, "success");
  assert.equal(success.data.drafts.length, 3);
  assert.deepEqual(
    success.data.drafts.map((draft) => draft.source.type),
    ["manual", "business_card_ocr", "referral"],
  );
  assert.equal(success.data.drafts[0].id, "demo-draft-1");
  assert.equal(success.data.drafts[0].confirmation.state, "pending");
  assert.equal(success.data.drafts[0].confirmation.required, true);
  assert.equal(success.data.drafts[0].evidence[0].createdBy, "mock-pipeline");
  assert.deepEqual(success.data.provenance.evidenceIds, [
    "evidence:manual-note-akari",
    "evidence:card-scan-mateo",
    "evidence:referral-emi",
  ]);
  assert.equal(
    success.data.provenance.source,
    fixtures.CONTACT_ACQUISITION_DRAFT_FIXTURE_SOURCE,
  );

  assert.equal(empty.success, true);
  assert.equal(empty.data.state, "empty");
  assert.deepEqual(empty.data.drafts, []);
  assert.equal(
    empty.data.nextAction,
    "Wait for a sourced acquisition event before staging a contact draft.",
  );

  assert.equal(pending.success, true);
  assert.equal(pending.data.state, "pending");
  assert.equal(pending.data.drafts.length, 1);
  assert.equal(pending.data.drafts[0].id, "demo-draft-1");
  assert.equal(
    pending.data.provenance.generationMethod,
    "rule-based-contact-draft",
  );

  assert.equal(failure.success, false);
  assert.equal(failure.error.code, "CONTACT_DRAFT_PIPELINE_FAILED");
  assert.equal(failure.error.appCode, "SERVICE_UNAVAILABLE");

  assert.equal(confirmed.success, true);
  assert.equal(confirmed.data.state, "confirmed");
  assert.equal(confirmed.data.confirmedDraft.status, "confirmed");
  assert.equal(confirmed.data.confirmedDraft.confirmation.state, "confirmed");
  assert.equal(confirmed.data.createdEvidence.createdBy, "mock-pipeline");
  assert.equal(confirmed.data.contactCandidate.readyForContactWrite, true);
  assert.equal(
    confirmed.data.nextAction,
    "Send this candidate to the contact record service only after preserving the source and evidence ids.",
  );
});

test("mock contact acquisition draft service is deterministic and has no external provider calls", async () => {
  const serviceModule = await importProjectModule<
    typeof import("../../features/acquisition/mock-service")
  >("features/acquisition/mock-service.ts");
  const service = serviceModule.createMockContactAcquisitionDraftService();

  assert.deepEqual(service.listContactDrafts(), service.listContactDrafts());
  assert.deepEqual(
    service.listContactDrafts({ scenario: "unknown-scenario" }),
    service.listContactDrafts(),
  );
  assert.deepEqual(
    service.confirmContactDraft({ draftId: "demo-draft-1" }),
    service.confirmContactDraft({ draftId: "demo-draft-1" }),
  );

  for (const filePath of [
    "features/acquisition/contract.ts",
    "features/acquisition/fixtures.ts",
    "features/acquisition/service.ts",
    "features/acquisition/mock-service.ts",
    "app/api/contact-drafts/route.ts",
    "app/api/contact-drafts/[id]/confirm/route.ts",
  ]) {
    const source = readFileSync(join(projectRoot, filePath), "utf8");

    assert.doesNotMatch(source, /\bfetch\s*\(/);
    assert.doesNotMatch(source, /Supabase|createClient|OAuth/i);
    assert.doesNotMatch(source, /XMLHttpRequest|WebSocket|EventSource/);
    assert.doesNotMatch(source, /navigator|localStorage|indexedDB/);
    assert.doesNotMatch(
      source,
      /calendar provider|email provider|notification provider|database provider/i,
    );
    assert.doesNotMatch(source, /openai|anthropic|ai provider/i);
  }
});

test("contact draft API routes return stable envelopes and documented empty or failure paths", async () => {
  const listRoute = await importProjectModule<
    typeof import("../../app/api/contact-drafts/route")
  >("app/api/contact-drafts/route.ts");
  const confirmRoute = await importProjectModule<
    typeof import("../../app/api/contact-drafts/[id]/confirm/route")
  >("app/api/contact-drafts/[id]/confirm/route.ts");
  const fixtures = await importProjectModule<
    typeof import("../../features/acquisition/fixtures")
  >("features/acquisition/fixtures.ts");

  const listResponse = await listRoute.GET(
    new Request("https://orbit.local/api/contact-drafts", {
      method: "GET",
    }),
  );
  const confirmResponse = await confirmRoute.POST(
    new Request(
      "https://orbit.local/api/contact-drafts/demo-draft-1/confirm",
      {
        method: "POST",
      },
    ),
    {
      params: Promise.resolve({ id: "demo-draft-1" }),
    },
  );
  const reloadAfterConfirmResponse = await listRoute.GET(
    new Request("https://orbit.local/api/contact-drafts", {
      method: "GET",
    }),
  );
  const emptyResponse = await listRoute.GET(
    new Request("https://orbit.local/api/contact-drafts?scenario=empty", {
      method: "GET",
    }),
  );
  const pendingResponse = await listRoute.GET(
    new Request("https://orbit.local/api/contact-drafts?scenario=pending", {
      method: "GET",
    }),
  );
  const failureResponse = await listRoute.GET(
    new Request("https://orbit.local/api/contact-drafts?scenario=failure", {
      method: "GET",
    }),
  );
  const missingResponse = await confirmRoute.POST(
    new Request(
      "https://orbit.local/api/contact-drafts/missing-draft/confirm",
      {
        method: "POST",
      },
    ),
    {
      params: Promise.resolve({ id: "missing-draft" }),
    },
  );

  assert.equal(listResponse.status, 200);
  assert.equal(listResponse.headers.get("cache-control"), "no-store");
  assert.equal(listResponse.headers.get("x-orbit-feature-mode"), "mock");
  assert.deepEqual(await listResponse.json(), {
    success: true,
    data: fixtures.mockContactAcquisitionDraftFixture,
  });

  assert.equal(confirmResponse.status, 200);
  assert.deepEqual(await confirmResponse.json(), {
    success: true,
    data: fixtures.mockContactDraftConfirmedFixture,
  });

  assert.equal(reloadAfterConfirmResponse.status, 200);
  assert.deepEqual(await reloadAfterConfirmResponse.json(), {
    success: true,
    data: fixtures.mockContactAcquisitionDraftFixture,
  });

  assert.equal(emptyResponse.status, 200);
  assert.deepEqual(await emptyResponse.json(), {
    success: true,
    data: fixtures.mockEmptyContactAcquisitionDraftFixture,
  });

  assert.equal(pendingResponse.status, 200);
  assert.deepEqual(await pendingResponse.json(), {
    success: true,
    data: fixtures.mockPendingContactAcquisitionDraftFixture,
  });

  assert.equal(failureResponse.status, 503);
  assert.deepEqual(await failureResponse.json(), {
    success: false,
    error: {
      code: "SERVICE_UNAVAILABLE",
      message:
        "The mock contact acquisition draft pipeline is pinned to a controlled failure scenario.",
      context: {
        boundary: "developer-admin",
        contactAcquisitionDraftErrorCode: "CONTACT_DRAFT_PIPELINE_FAILED",
        mode: "mock",
        privacy: "no-relationship-data",
        provenance:
          "Mock contact acquisition draft failure came from deterministic fixture rules.",
        service: "contact-acquisition-draft-pipeline-mock",
      },
    },
  });

  assert.equal(missingResponse.status, 404);
  assert.deepEqual(await missingResponse.json(), {
    success: false,
    error: {
      code: "NOT_FOUND",
      message: "No mock contact acquisition draft matches that id.",
      context: {
        boundary: "developer-admin",
        contactAcquisitionDraftErrorCode: "CONTACT_DRAFT_NOT_FOUND",
        mode: "mock",
        privacy: "no-relationship-data",
        provenance:
          "Mock contact acquisition draft failure came from deterministic fixture rules.",
        service: "contact-acquisition-draft-pipeline-mock",
      },
    },
  });
});

test("contact acquisition draft debug route renders success, empty, pending, and failure states", async () => {
  const debugView = await importProjectModule<
    typeof import("../../features/acquisition/contact-acquisition-draft-pipeline/debug-view")
  >(
    "features/acquisition/contact-acquisition-draft-pipeline/debug-view.tsx",
  );
  const html = renderToStaticMarkup(
    React.createElement(debugView.ContactAcquisitionDraftPipelineDemo),
  );
  const pageSource = readFileSync(
    join(projectRoot, "app/dev/capabilities/[slug]/page.tsx"),
    "utf8",
  );

  assert.equal(
    debugView.CONTACT_ACQUISITION_DRAFT_PIPELINE_SLUG,
    "contact-acquisition-draft-pipeline",
  );
  assert.match(pageSource, /CONTACT_ACQUISITION_DRAFT_PIPELINE_SLUG/);
  assert.match(pageSource, /ContactAcquisitionDraftPipelineDemo/);

  assert.match(html, /Contact acquisition draft pipeline/);
  assert.match(html, /Operator runbook/);
  assert.match(html, /Review source evidence/);
  assert.match(html, /Confirm the staged candidate/);
  assert.match(html, /Reload the mock queue/);
  assert.match(html, /Success state/);
  assert.match(html, /Empty state/);
  assert.match(html, /Pending state/);
  assert.match(html, /Failure state/);
  assert.match(html, /Akari Mori/);
  assert.match(html, /Mateo Rivera/);
  assert.match(html, /Emi Tanaka/);
  assert.match(html, /demo-draft-1/);
  assert.match(html, /manual note after climate founder dinner/);
  assert.match(html, /No contact is written until confirmation/);
  assert.match(html, /Before confirmation/);
  assert.match(html, /After confirmation/);
  assert.match(html, /CONTACT_DRAFT_PIPELINE_FAILED/);
  assert.match(html, /GET \/api\/contact-drafts/);
  assert.match(
    html,
    /POST \/api\/contact-drafts\/demo-draft-1\/confirm/,
  );
  assert.match(html, /Reload after confirmation/);
  assert.match(html, /Expect 404 failure envelope/);
  assert.match(html, /Live handoff evidence excerpts/);
  assert.match(
    html,
    /Storage-backed contact draft live provider lives under features\/acquisition\/storage\/contact-draft-live-record-provider\.ts/,
  );
  assert.match(
    html,
    /ORBIT_MODULE_MODE=live gates the live contact draft API path/,
  );
  assert.match(
    html,
    /Operator confirmation precedes every contact write/,
  );
  assert.match(
    html,
    /Replacement tests cover draft list, confirm, privacy, and debug states/,
  );
  assert.match(
    html,
    /features\/acquisition\/contact-acquisition-draft-pipeline\/LIVE_IMPLEMENTATION\.md/,
  );
});

test("contact acquisition draft live handoff covers replacement requirements", () => {
  const docPath =
    "features/acquisition/contact-acquisition-draft-pipeline/LIVE_IMPLEMENTATION.md";
  const doc = readFileSync(join(projectRoot, docPath), "utf8");

  assert.match(doc, /Live service and provider files/i);
  assert.match(doc, /Switch mechanism/i);
  assert.match(doc, /Required env vars and permissions/i);
  assert.match(doc, /Privacy and provenance constraints/i);
  assert.match(doc, /Replacement tests/i);
  assert.match(doc, /features\/acquisition\/contract\.ts/);
  assert.match(doc, /features\/acquisition\/mock-service\.ts/);
  assert.match(doc, /features\/acquisition\/live-service\.ts/);
  assert.match(
    doc,
    /features\/acquisition\/storage\/contact-draft-live-record-provider\.ts/,
  );
  assert.match(doc, /app\/api\/contact-drafts\/route\.ts/);
  assert.match(doc, /app\/api\/contact-drafts\/\[id\]\/confirm\/route\.ts/);
  assert.match(doc, /ORBIT_MODULE_MODE=live/);
  assert.match(doc, /ORBIT_EVENT_DATABASE_URL/);
  assert.match(doc, /ORBIT_WORKSPACE_ID/);
  assert.match(doc, /source and evidence provenance/i);
  assert.match(doc, /operator confirmation/i);
  assert.match(doc, /business-card OCR/i);
  assert.match(doc, /QR scanning/i);
  assert.match(doc, /email and calendar signals/i);
  assert.match(doc, /Debug review surface/i);
  assert.match(doc, /Live handoff evidence excerpts/i);
  assert.match(
    doc,
    /Storage-backed contact draft live provider lives under `features\/acquisition\/storage\/contact-draft-live-record-provider\.ts`/,
  );
  assert.match(
    doc,
    /`ORBIT_MODULE_MODE=live` gates the live contact draft API path/,
  );
  assert.match(doc, /Operator confirmation precedes every contact write/);
  assert.match(
    doc,
    /Replacement tests cover draft list, confirm, privacy, and debug states/,
  );
});
