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
    `${pathFromRoot} must exist for the business card scan OCR mock sprint`,
  );

  return (await import(pathToFileURL(absolutePath).href)) as TModule;
}

test("business card scan OCR contract exposes capture upload OCR and extracted contact draft boundaries", async () => {
  const contract = await importProjectModule<
    typeof import("../../features/acquisition/business-card-contract")
  >("features/acquisition/business-card-contract.ts");
  const fixtures = await importProjectModule<
    typeof import("../../features/acquisition/business-card-fixtures")
  >("features/acquisition/business-card-fixtures.ts");
  const serviceModule = await importProjectModule<
    typeof import("../../features/acquisition/mock-business-card-service")
  >("features/acquisition/mock-business-card-service.ts");

  const service: contract.BusinessCardScanOcrService =
    serviceModule.createMockBusinessCardScanOcrService();
  const success = service.scanBusinessCard();
  const empty = service.scanBusinessCard({ scenario: "empty" });
  const pending = service.scanBusinessCard({ scenario: "pending" });
  const failure = service.scanBusinessCard({ scenario: "failure" });
  const draftLookup = service.getBusinessCardDraft({
    draftId: "demo-business-card-draft",
  });

  assert.deepEqual(contract.BUSINESS_CARD_SCAN_OCR_ERROR_CODES, [
    "BUSINESS_CARD_IMAGE_REQUIRED",
    "BUSINESS_CARD_DRAFT_NOT_FOUND",
    "BUSINESS_CARD_SCAN_NOT_READY",
    "BUSINESS_CARD_SCAN_OCR_MOCK_FAILED",
  ]);
  assert.equal(
    contract.BUSINESS_CARD_SCAN_OCR_ERROR_DEFINITIONS
      .BUSINESS_CARD_IMAGE_REQUIRED.appCode,
    "VALIDATION_ERROR",
  );

  assert.equal(success.success, true);
  assert.equal(success.data.state, "success");
  assert.equal(success.data.capture.captureMethod, "fixture-camera-frame");
  assert.equal(success.data.capture.deviceCameraAccessed, false);
  assert.equal(success.data.capture.uploadStorageExecuted, false);
  assert.equal(success.data.capture.storageWriteExecuted, false);
  assert.equal(success.data.ocr.status, "complete");
  assert.equal(success.data.ocr.ocrProviderCalled, false);
  assert.equal(success.data.ocr.aiExtractionExecuted, false);
  assert.match(success.data.ocr.rawText, /Hana Sato/);
  assert.equal(success.data.draft?.id, "demo-business-card-draft");
  assert.equal(success.data.draft?.source.type, "business_card_ocr");
  assert.equal(success.data.draft?.displayName, "Hana Sato");
  assert.equal(success.data.draft?.role, "Head of Robotics Partnerships");
  assert.equal(success.data.draft?.organization, "Aki Robotics");
  assert.equal(success.data.draft?.email, "hana.sato@akirobotics.example");
  assert.equal(success.data.draft?.phone, "+81-3-5555-0198");
  assert.equal(success.data.draft?.confirmation.state, "pending");
  assert.equal(success.data.draft?.contactWriteExecuted, false);
  assert.equal(
    success.data.draft?.evidence[0].createdBy,
    "mock-business-card-service",
  );
  assert.deepEqual(success.data.provenance.evidenceIds, [
    "evidence:business-card-capture-hana",
    "evidence:business-card-ocr-hana",
    "evidence:business-card-draft-hana",
  ]);
  assert.equal(
    success.data.provenance.source,
    fixtures.BUSINESS_CARD_SCAN_OCR_FIXTURE_SOURCE,
  );

  assert.equal(empty.success, true);
  assert.equal(empty.data.state, "empty");
  assert.equal(empty.data.draft, null);
  assert.equal(empty.data.ocr.status, "empty");
  assert.deepEqual(empty.data.ocr.rawTextLines, []);
  assert.equal(
    empty.data.nextAction,
    "Capture a readable card image before staging a contact draft.",
  );

  assert.equal(pending.success, true);
  assert.equal(pending.data.state, "pending");
  assert.equal(pending.data.draft, null);
  assert.equal(pending.data.ocr.status, "pending");
  assert.equal(pending.data.capture.captureId, "capture:business-card-pending");

  assert.equal(failure.success, false);
  assert.equal(failure.error.code, "BUSINESS_CARD_SCAN_OCR_MOCK_FAILED");
  assert.equal(failure.error.appCode, "SERVICE_UNAVAILABLE");

  assert.equal(draftLookup.success, true);
  assert.deepEqual(draftLookup.data, fixtures.mockBusinessCardContactDraft);
});

test("mock business card scan OCR service is deterministic rule-based code with no external provider calls", async () => {
  const serviceModule = await importProjectModule<
    typeof import("../../features/acquisition/mock-business-card-service")
  >("features/acquisition/mock-business-card-service.ts");
  const service = serviceModule.createMockBusinessCardScanOcrService();
  const ruleInput = {
    imageText:
      "Jordan Lee\nPartner\nNimbus Labs\njordan@nimbus.example\n+1 415 555 0104",
    imageName: "nimbus-card.jpg",
  };

  assert.deepEqual(service.scanBusinessCard(), service.scanBusinessCard());
  assert.deepEqual(
    service.scanBusinessCard({ scenario: "unknown-scenario" }),
    service.scanBusinessCard(),
  );
  assert.deepEqual(
    service.scanBusinessCard(ruleInput),
    service.scanBusinessCard(ruleInput),
  );

  const ruleResult = service.scanBusinessCard(ruleInput);

  assert.equal(ruleResult.success, true);
  assert.equal(ruleResult.data.provenance.generationMethod, "rule-based-card-ocr");
  assert.equal(ruleResult.data.capture.imageName, "nimbus-card.jpg");
  assert.equal(ruleResult.data.draft?.displayName, "Jordan Lee");
  assert.equal(ruleResult.data.draft?.role, "Partner");
  assert.equal(ruleResult.data.draft?.organization, "Nimbus Labs");
  assert.equal(ruleResult.data.draft?.email, "jordan@nimbus.example");
  assert.equal(ruleResult.data.draft?.phone, "+1 415 555 0104");

  for (const filePath of [
    "features/acquisition/business-card-contract.ts",
    "features/acquisition/business-card-fixtures.ts",
    "features/acquisition/mock-business-card-service.ts",
    "app/api/contact-drafts/business-card/scan/route.ts",
    "app/api/contact-drafts/[id]/route.ts",
    "features/acquisition/business-card-scan-ocr-mock/debug-view.tsx",
  ]) {
    const source = readFileSync(join(projectRoot, filePath), "utf8");

    assert.doesNotMatch(source, /\bfetch\s*\(/);
    assert.doesNotMatch(source, /Supabase|createClient|OAuth/i);
    assert.doesNotMatch(source, /XMLHttpRequest|WebSocket|EventSource/);
    assert.doesNotMatch(source, /navigator|mediaDevices|localStorage|indexedDB/);
    assert.doesNotMatch(source, /openai|anthropic|ai provider/i);
    assert.doesNotMatch(source, /s3|gcs|blob storage|database provider/i);
  }
});

test("business card scan OCR API routes return stable envelopes with empty and failure paths", async () => {
  const scanRoute = await importProjectModule<
    typeof import("../../app/api/contact-drafts/business-card/scan/route")
  >("app/api/contact-drafts/business-card/scan/route.ts");
  const draftRoute = await importProjectModule<
    typeof import("../../app/api/contact-drafts/[id]/route")
  >("app/api/contact-drafts/[id]/route.ts");
  const fixtures = await importProjectModule<
    typeof import("../../features/acquisition/business-card-fixtures")
  >("features/acquisition/business-card-fixtures.ts");

  const scanResponse = await scanRoute.POST(
    new Request("https://orbit.local/api/contact-drafts/business-card/scan", {
      method: "POST",
    }),
  );
  const draftResponse = await draftRoute.GET(
    new Request(
      "https://orbit.local/api/contact-drafts/demo-business-card-draft",
      {
        method: "GET",
      },
    ),
    {
      params: Promise.resolve({ id: "demo-business-card-draft" }),
    },
  );
  const emptyResponse = await scanRoute.POST(
    new Request(
      "https://orbit.local/api/contact-drafts/business-card/scan?scenario=empty",
      {
        method: "POST",
      },
    ),
  );
  const failureResponse = await scanRoute.POST(
    new Request(
      "https://orbit.local/api/contact-drafts/business-card/scan?scenario=failure",
      {
        method: "POST",
      },
    ),
  );
  const missingResponse = await draftRoute.GET(
    new Request("https://orbit.local/api/contact-drafts/missing-card-draft", {
      method: "GET",
    }),
    {
      params: Promise.resolve({ id: "missing-card-draft" }),
    },
  );

  assert.equal(scanResponse.status, 200);
  assert.equal(scanResponse.headers.get("cache-control"), "no-store");
  assert.equal(scanResponse.headers.get("x-orbit-feature-mode"), "mock");
  assert.deepEqual(await scanResponse.json(), {
    success: true,
    data: fixtures.mockBusinessCardScanOcrFixture,
  });

  assert.equal(draftResponse.status, 200);
  assert.deepEqual(await draftResponse.json(), {
    success: true,
    data: fixtures.mockBusinessCardContactDraft,
  });

  assert.equal(emptyResponse.status, 200);
  assert.deepEqual(await emptyResponse.json(), {
    success: true,
    data: fixtures.mockEmptyBusinessCardScanOcrFixture,
  });

  assert.equal(failureResponse.status, 503);
  assert.deepEqual(await failureResponse.json(), {
    success: false,
    error: {
      code: "SERVICE_UNAVAILABLE",
      message:
        "The mock business card scan OCR boundary is pinned to a controlled failure scenario.",
      context: {
        boundary: "developer-admin",
        businessCardScanOcrErrorCode: "BUSINESS_CARD_SCAN_OCR_MOCK_FAILED",
        mode: "mock",
        privacy: "no-relationship-data",
        provenance:
          "Mock business card scan OCR failure came from deterministic fixture rules.",
        service: "business-card-scan-ocr-mock",
      },
    },
  });

  assert.equal(missingResponse.status, 404);
  assert.deepEqual(await missingResponse.json(), {
    success: false,
    error: {
      code: "NOT_FOUND",
      message: "No mock business card contact draft matches that id.",
      context: {
        boundary: "developer-admin",
        businessCardScanOcrErrorCode: "BUSINESS_CARD_DRAFT_NOT_FOUND",
        mode: "mock",
        privacy: "no-relationship-data",
        provenance:
          "Mock business card scan OCR failure came from deterministic fixture rules.",
        service: "business-card-scan-ocr-mock",
      },
    },
  });
});

test("business card scan OCR debug route renders all states and the live replacement handoff", async () => {
  const debugView = await importProjectModule<
    typeof import("../../features/acquisition/business-card-scan-ocr-mock/debug-view")
  >("features/acquisition/business-card-scan-ocr-mock/debug-view.tsx");
  const html = renderToStaticMarkup(
    React.createElement(debugView.BusinessCardScanOcrMockDemo),
  );
  const pageSource = readFileSync(
    join(projectRoot, "app/dev/capabilities/[slug]/page.tsx"),
    "utf8",
  );
  const liveDocPath =
    "features/acquisition/business-card-scan-ocr-mock/LIVE_IMPLEMENTATION.md";
  const liveDoc = readFileSync(join(projectRoot, liveDocPath), "utf8");

  assert.equal(
    debugView.BUSINESS_CARD_SCAN_OCR_MOCK_SLUG,
    "business-card-scan-ocr-mock",
  );
  assert.match(pageSource, /BUSINESS_CARD_SCAN_OCR_MOCK_SLUG/);
  assert.match(pageSource, /BusinessCardScanOcrMockDemo/);

  assert.match(html, /Business card scan OCR mock/);
  assert.match(html, /Card image capture/);
  assert.match(html, /OCR extraction/);
  assert.match(html, /Extracted contact draft/);
  assert.match(html, /Success state/);
  assert.match(html, /Empty state/);
  assert.match(html, /Pending state/);
  assert.match(html, /Failure state/);
  assert.match(html, /Hana Sato/);
  assert.match(html, /Aki Robotics/);
  assert.match(html, /demo-business-card-draft/);
  assert.match(html, /BUSINESS_CARD_SCAN_OCR_MOCK_FAILED/);
  assert.match(html, /POST \/api\/contact-drafts\/business-card\/scan/);
  assert.match(html, /GET \/api\/contact-drafts\/demo-business-card-draft/);
  assert.match(html, new RegExp(liveDocPath));
  assert.match(html, /ORBIT_BUSINESS_CARD_SCAN_PROVIDER/);
  assert.match(html, /business-card-ocr-workbench/);
  assert.match(
    html,
    /\.business-card-ocr-workbench\s*\{[\s\S]*grid-template-columns:\s*minmax\(0,\s*1fr\)/,
  );
  assert.match(
    html,
    /\.business-card-ocr-workbench \.workbench-shell,[\s\S]*\{[\s\S]*min-width:\s*0/,
  );
  assert.match(
    html,
    /\.business-card-ocr-workbench \.orbit-chip,[\s\S]*\{[\s\S]*overflow-wrap:\s*anywhere/,
  );

  assert.match(
    liveDoc,
    /features\/acquisition\/business-card-scan-ocr-mock\/live-service\.ts/,
  );
  assert.match(
    liveDoc,
    /features\/acquisition\/business-card-scan-ocr-mock\/providers\//,
  );
  assert.match(liveDoc, /ORBIT_BUSINESS_CARD_SCAN_PROVIDER/);
  assert.match(liveDoc, /camera permission/);
  assert.match(liveDoc, /OCR provider/);
  assert.match(liveDoc, /storage bucket/);
  assert.match(liveDoc, /privacy/);
  assert.match(liveDoc, /provenance/);
  assert.match(liveDoc, /replacement tests/);
});
