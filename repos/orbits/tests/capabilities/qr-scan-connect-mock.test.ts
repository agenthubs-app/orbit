/**
 * QR 扫码建联 mock 的契约测试。
 *
 * 锁住扫码结果、互相关系上下文、确认候选和 debug-view 输出。
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
    `${pathFromRoot} must exist for the QR scan connect mock sprint`,
  );

  return (await import(pathToFileURL(absolutePath).href)) as TModule;
}

test("QR scan connect contract exposes scan result mutual context draft creation and errors", async () => {
  const contract = await importProjectModule<
    typeof import("../../features/acquisition/qr-contract")
  >("features/acquisition/qr-contract.ts");
  const fixtures = await importProjectModule<
    typeof import("../../features/acquisition/qr-fixtures")
  >("features/acquisition/qr-fixtures.ts");
  const serviceModule = await importProjectModule<
    typeof import("../../features/acquisition/mock-qr-service")
  >("features/acquisition/mock-qr-service.ts");

  const service = serviceModule.createMockQrScanConnectService();
  const success = service.scanQrCode();
  const empty = service.scanQrCode({ scenario: "empty" });
  const pending = service.scanQrCode({ scenario: "pending" });
  const failure = service.scanQrCode({ scenario: "failure" });
  const confirmed = service.confirmQrConnectionDraft({
    draftId: "demo-qr-draft",
  });

  assert.deepEqual(contract.QR_SCAN_CONNECT_ERROR_CODES, [
    "QR_SCAN_PAYLOAD_REQUIRED",
    "QR_SCAN_DRAFT_NOT_FOUND",
    "QR_SCAN_CONNECT_PENDING",
    "QR_SCAN_CONNECT_MOCK_FAILED",
    "QR_SCAN_CONNECT_LIVE_STORE_UNCONFIGURED",
    "QR_SCAN_CONNECT_LIVE_STORE_FAILED",
  ]);
  assert.equal(
    contract.QR_SCAN_CONNECT_ERROR_DEFINITIONS.QR_SCAN_PAYLOAD_REQUIRED.appCode,
    "VALIDATION_ERROR",
  );

  assert.equal(success.success, true);
  assert.equal(success.data.state, "success");
  assert.equal(success.data.scan.scanMethod, "fixture-camera-frame");
  assert.equal(success.data.scan.deviceCameraAccessed, false);
  assert.equal(success.data.scan.qrDecoderProviderCalled, false);
  assert.equal(success.data.scan.cryptographicValidationExecuted, false);
  assert.equal(success.data.scan.externalLookupExecuted, false);
  assert.equal(success.data.scan.databaseWriteExecuted, false);
  assert.equal(success.data.mutualContext?.eventName, "Climate founders dinner");
  assert.deepEqual(success.data.mutualContext?.mutualConnections, [
    "Rei Nakamura",
    "Samir Patel",
  ]);
  assert.equal(success.data.draft?.id, "demo-qr-draft");
  assert.equal(success.data.draft?.source.type, "qr_scan");
  assert.equal(success.data.draft?.displayName, "Mika Tan");
  assert.equal(success.data.draft?.role, "Founder");
  assert.equal(success.data.draft?.organization, "HelioGrid");
  assert.equal(success.data.draft?.confirmation.state, "pending");
  assert.equal(success.data.draft?.contactWriteExecuted, false);
  assert.equal(success.data.draft?.connectionWriteExecuted, false);
  assert.deepEqual(success.data.provenance.evidenceIds, [
    "evidence:qr-scan-frame-mika",
    "evidence:qr-mutual-context-mika",
    "evidence:qr-draft-mika",
  ]);
  assert.equal(success.data.provenance.source, fixtures.QR_SCAN_CONNECT_FIXTURE_SOURCE);

  assert.equal(empty.success, true);
  assert.equal(empty.data.state, "empty");
  assert.equal(empty.data.draft, null);
  assert.equal(empty.data.mutualContext, null);
  assert.equal(
    empty.data.nextAction,
    "Scan a relationship QR code before staging a connection draft.",
  );

  assert.equal(pending.success, true);
  assert.equal(pending.data.state, "pending");
  assert.equal(pending.data.draft, null);
  assert.equal(pending.data.scan.scanId, "scan:qr-pending");

  assert.equal(failure.success, false);
  assert.equal(failure.error.code, "QR_SCAN_CONNECT_MOCK_FAILED");
  assert.equal(failure.error.appCode, "SERVICE_UNAVAILABLE");

  assert.equal(confirmed.success, true);
  assert.equal(confirmed.data.state, "confirmed");
  assert.equal(confirmed.data.confirmedDraft.status, "confirmed");
  assert.equal(confirmed.data.contactCandidate.readyForContactWrite, true);
  assert.equal(confirmed.data.contactCandidate.contactWriteExecuted, false);
  assert.equal(confirmed.data.connectionCandidate.readyForConnectionWrite, true);
  assert.equal(confirmed.data.connectionCandidate.connectionWriteExecuted, false);
  assert.equal(confirmed.data.createdEvidence.createdBy, "mock-qr-service");
});

test("mock QR scan connect service is deterministic rule-based code with no external provider calls", async () => {
  const serviceModule = await importProjectModule<
    typeof import("../../features/acquisition/mock-qr-service")
  >("features/acquisition/mock-qr-service.ts");
  const service = serviceModule.createMockQrScanConnectService();
  const ruleInput = {
    qrText:
      "orbit-qr:name=Aria Cole;role=BD Lead;organization=Northstar Labs;event=Robotics salon;mutual=Jules Park;topic=pilot referrals",
    scanLabel: "northstar-qr.png",
  };

  assert.deepEqual(service.scanQrCode(), service.scanQrCode());
  assert.deepEqual(
    service.scanQrCode({ scenario: "unknown-scenario" }),
    service.scanQrCode(),
  );
  assert.deepEqual(
    service.scanQrCode(ruleInput),
    service.scanQrCode(ruleInput),
  );
  assert.deepEqual(
    service.confirmQrConnectionDraft({ draftId: "demo-qr-draft" }),
    service.confirmQrConnectionDraft({ draftId: "demo-qr-draft" }),
  );

  const ruleResult = service.scanQrCode(ruleInput);

  assert.equal(ruleResult.success, true);
  assert.equal(ruleResult.data.provenance.generationMethod, "rule-based-qr");
  assert.equal(ruleResult.data.scan.scanLabel, "northstar-qr.png");
  assert.equal(ruleResult.data.draft?.displayName, "Aria Cole");
  assert.equal(ruleResult.data.draft?.role, "BD Lead");
  assert.equal(ruleResult.data.draft?.organization, "Northstar Labs");
  assert.equal(ruleResult.data.mutualContext?.eventName, "Robotics salon");
  assert.deepEqual(ruleResult.data.mutualContext?.mutualConnections, [
    "Jules Park",
  ]);
  assert.deepEqual(ruleResult.data.mutualContext?.sharedTopics, [
    "pilot referrals",
  ]);

  for (const filePath of [
    "features/acquisition/qr-contract.ts",
    "features/acquisition/qr-fixtures.ts",
    "features/acquisition/mock-qr-service.ts",
    "app/api/contact-drafts/qr/scan/route.ts",
    "app/api/contact-drafts/[id]/confirm/route.ts",
    "features/acquisition/qr-scan-connect-mock/debug-view.tsx",
  ]) {
    const source = readFileSync(join(projectRoot, filePath), "utf8");

    assert.doesNotMatch(source, /\bfetch\s*\(/);
    assert.doesNotMatch(source, /Supabase|createClient|OAuth/i);
    assert.doesNotMatch(source, /XMLHttpRequest|WebSocket|EventSource/);
    assert.doesNotMatch(source, /navigator|mediaDevices|localStorage|indexedDB/);
    assert.doesNotMatch(source, /from ["']node:crypto["']|crypto\.subtle|createHash/);
    assert.doesNotMatch(
      source,
      /calendar provider|email provider|notification provider|database provider/i,
    );
    assert.doesNotMatch(source, /openai|anthropic|ai provider/i);
  }
});

test("QR scan connect API routes return stable envelopes with empty and failure paths", async () => {
  const scanRoute = await importProjectModule<
    typeof import("../../app/api/contact-drafts/qr/scan/route")
  >("app/api/contact-drafts/qr/scan/route.ts");
  const confirmRoute = await importProjectModule<
    typeof import("../../app/api/contact-drafts/[id]/confirm/route")
  >("app/api/contact-drafts/[id]/confirm/route.ts");
  const fixtures = await importProjectModule<
    typeof import("../../features/acquisition/qr-fixtures")
  >("features/acquisition/qr-fixtures.ts");

  const scanResponse = await scanRoute.POST(
    new Request("https://orbit.local/api/contact-drafts/qr/scan", {
      method: "POST",
    }),
  );
  const confirmResponse = await confirmRoute.POST(
    new Request("https://orbit.local/api/contact-drafts/demo-qr-draft/confirm", {
      method: "POST",
    }),
    {
      params: Promise.resolve({ id: "demo-qr-draft" }),
    },
  );
  const emptyResponse = await scanRoute.POST(
    new Request("https://orbit.local/api/contact-drafts/qr/scan?scenario=empty", {
      method: "POST",
    }),
  );
  const failureResponse = await scanRoute.POST(
    new Request(
      "https://orbit.local/api/contact-drafts/qr/scan?scenario=failure",
      {
        method: "POST",
      },
    ),
  );
  const blockedConfirmationResponse = await confirmRoute.POST(
    new Request(
      "https://orbit.local/api/contact-drafts/demo-qr-draft/confirm?scenario=pending",
      {
        method: "POST",
      },
    ),
    {
      params: Promise.resolve({ id: "demo-qr-draft" }),
    },
  );

  assert.equal(scanResponse.status, 200);
  assert.equal(scanResponse.headers.get("cache-control"), "no-store");
  assert.equal(scanResponse.headers.get("x-orbit-feature-mode"), "mock");
  assert.deepEqual(await scanResponse.json(), {
    success: true,
    data: fixtures.mockQrScanConnectFixture,
  });

  assert.equal(confirmResponse.status, 200);
  assert.deepEqual(await confirmResponse.json(), {
    success: true,
    data: fixtures.mockQrConnectionConfirmedFixture,
  });

  assert.equal(emptyResponse.status, 200);
  assert.deepEqual(await emptyResponse.json(), {
    success: true,
    data: fixtures.mockEmptyQrScanConnectFixture,
  });

  assert.equal(failureResponse.status, 503);
  assert.deepEqual(await failureResponse.json(), {
    success: false,
    error: {
      code: "SERVICE_UNAVAILABLE",
      message:
        "The mock QR scan connect boundary is pinned to a controlled failure scenario.",
      context: {
        boundary: "developer-admin",
        mode: "mock",
        privacy: "no-relationship-data",
        provenance:
          "Mock QR scan connect failure came from deterministic fixture rules.",
        qrScanConnectErrorCode: "QR_SCAN_CONNECT_MOCK_FAILED",
        service: "qr-scan-connect-mock",
      },
    },
  });

  assert.equal(blockedConfirmationResponse.status, 409);
  assert.deepEqual(await blockedConfirmationResponse.json(), {
    success: false,
    error: {
      code: "CONFLICT",
      message:
        "The mock QR scan connection draft is still pending scan validation.",
      context: {
        boundary: "developer-admin",
        mode: "mock",
        privacy: "no-relationship-data",
        provenance:
          "Mock QR scan connect failure came from deterministic fixture rules.",
        qrScanConnectErrorCode: "QR_SCAN_CONNECT_PENDING",
        service: "qr-scan-connect-mock",
      },
    },
  });
});

test("QR scan connect debug route renders all states and the live replacement handoff", async () => {
  const debugView = await importProjectModule<
    typeof import("../../features/acquisition/qr-scan-connect-mock/debug-view")
  >("features/acquisition/qr-scan-connect-mock/debug-view.tsx");
  const html = renderToStaticMarkup(
    React.createElement(debugView.QrScanConnectMockDemo),
  );
  const pageSource = readFileSync(
    join(projectRoot, "app/dev/capabilities/[slug]/page.tsx"),
    "utf8",
  );
  const liveDocPath =
    "features/acquisition/qr-scan-connect-mock/LIVE_IMPLEMENTATION.md";
  const liveDoc = readFileSync(join(projectRoot, liveDocPath), "utf8");

  assert.equal(
    debugView.QR_SCAN_CONNECT_MOCK_SLUG,
    "qr-scan-connect-mock",
  );
  assert.match(pageSource, /QR_SCAN_CONNECT_MOCK_SLUG/);
  assert.match(pageSource, /QrScanConnectMockDemo/);

  assert.match(html, /QR scan connect mock/);
  assert.match(html, /Camera and QR decode/);
  assert.match(html, /Mutual connection context/);
  assert.match(html, /Connection draft/);
  assert.match(html, /Success state/);
  assert.match(html, /Empty state/);
  assert.match(html, /Pending state/);
  assert.match(html, /Failure state/);
  assert.match(html, /Mika Tan/);
  assert.match(html, /HelioGrid/);
  assert.match(html, /demo-qr-draft/);
  assert.match(html, /QR_SCAN_CONNECT_MOCK_FAILED/);
  assert.match(html, /POST \/api\/contact-drafts\/qr\/scan/);
  assert.match(html, /POST \/api\/contact-drafts\/demo-qr-draft\/confirm/);
  assert.match(html, /Run confirm probe/);
  assert.match(html, new RegExp(liveDocPath));
  assert.match(html, /ORBIT_MODULE_MODE=live/);
  assert.match(html, /qr-scan-connect-workbench/);
  assert.match(
    html,
    /\.qr-scan-connect-workbench\s*\{[\s\S]*grid-template-columns:\s*minmax\(0,\s*1fr\)/,
  );
  assert.match(
    html,
    /\.qr-scan-connect-workbench \.workbench-shell,[\s\S]*\{[\s\S]*min-width:\s*0/,
  );
  assert.match(
    html,
    /\.qr-scan-connect-workbench \.orbit-chip,[\s\S]*\{[\s\S]*overflow-wrap:\s*anywhere/,
  );

  assert.match(
    liveDoc,
    /features\/acquisition\/live-qr-service\.ts/,
  );
  assert.match(
    liveDoc,
    /features\/acquisition\/storage\/qr-live-record-provider\.ts/,
  );
  assert.match(liveDoc, /ORBIT_MODULE_MODE=live/);
  assert.match(liveDoc, /camera permission/);
  assert.match(liveDoc, /QR decoder/);
  assert.match(liveDoc, /signature verifier/);
  assert.match(liveDoc, /remote live store/);
  assert.match(liveDoc, /privacy/);
  assert.match(liveDoc, /provenance/);
  assert.match(liveDoc, /replacement tests/);
});
