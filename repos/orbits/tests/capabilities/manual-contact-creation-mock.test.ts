/**
 * 手动联系人创建 mock 的契约测试。
 *
 * 覆盖人工输入生成草稿、确认结果和 source-backed provenance。
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
    `${pathFromRoot} must exist for the manual contact creation mock sprint`,
  );

  return (await import(pathToFileURL(absolutePath).href)) as TModule;
}

test("manual contact creation contract exposes source note tags follow-up hints and confirmation", async () => {
  const contract = await importProjectModule<
    typeof import("../../features/acquisition/manual-contract")
  >("features/acquisition/manual-contract.ts");
  const serviceModule = await importProjectModule<
    typeof import("../../features/acquisition/mock-manual-service")
  >("features/acquisition/mock-manual-service.ts");

  const service = serviceModule.createMockManualContactCreationService();
  const success = service.createManualContactDraft();
  const empty = service.createManualContactDraft({ scenario: "empty" });
  const pending = service.createManualContactDraft({ scenario: "pending" });
  const failure = service.createManualContactDraft({ scenario: "failure" });
  const confirmed = service.confirmManualContactDraft({
    draftId: "demo-manual-draft",
  });

  assert.deepEqual(contract.MANUAL_CONTACT_CREATION_ERROR_CODES, [
    "MANUAL_CONTACT_NOTE_REQUIRED",
    "MANUAL_CONTACT_DRAFT_NOT_FOUND",
    "MANUAL_CONTACT_CONFIRMATION_NOT_ALLOWED",
    "MANUAL_CONTACT_CREATION_MOCK_FAILED",
  ]);
  assert.equal(
    contract.MANUAL_CONTACT_CREATION_ERROR_DEFINITIONS
      .MANUAL_CONTACT_NOTE_REQUIRED.appCode,
    "VALIDATION_ERROR",
  );

  assert.equal(success.success, true);
  assert.equal(success.data.state, "success");
  assert.equal(success.data.draft?.id, "demo-manual-draft");
  assert.equal(success.data.draft?.source.type, "manual");
  assert.match(success.data.draft?.note ?? "", /Kenji Watanabe/);
  assert.deepEqual(success.data.draft?.tags, [
    "event:climate-founders-dinner",
    "topic:storage-pilots",
    "priority:warm-follow-up",
  ]);
  assert.equal(
    success.data.draft?.followUpHint,
    "Send Kenji the storage pilot operator intro by Friday.",
  );
  assert.equal(success.data.draft?.duplicateCheck.mode, "mock-rule");
  assert.equal(success.data.draft?.duplicateCheck.externalLookupExecuted, false);
  assert.equal(success.data.draft?.confirmation.state, "pending");
  assert.deepEqual(success.data.provenance.evidenceIds, [
    "evidence:manual-note-kenji",
  ]);
  assert.equal(
    success.data.provenance.source,
    contract.MANUAL_CONTACT_CREATION_FIXTURE_SOURCE,
  );

  assert.equal(empty.success, true);
  assert.equal(empty.data.state, "empty");
  assert.equal(empty.data.draft, null);
  assert.equal(
    empty.data.nextAction,
    "Capture a manual note before staging a contact draft.",
  );

  assert.equal(pending.success, true);
  assert.equal(pending.data.state, "pending");
  assert.equal(pending.data.draft?.id, "demo-manual-draft");
  assert.equal(
    pending.data.provenance.generationMethod,
    "rule-based-manual-contact",
  );

  assert.equal(failure.success, false);
  assert.equal(failure.error.code, "MANUAL_CONTACT_CREATION_MOCK_FAILED");
  assert.equal(failure.error.appCode, "SERVICE_UNAVAILABLE");

  assert.equal(confirmed.success, true);
  assert.equal(confirmed.data.state, "confirmed");
  assert.equal(confirmed.data.confirmedDraft.status, "confirmed");
  assert.equal(confirmed.data.contactCandidate.readyForContactWrite, true);
  assert.equal(confirmed.data.contactCandidate.contactWriteExecuted, false);
  assert.equal(confirmed.data.contactCandidate.duplicateLookupExecuted, false);
  assert.equal(confirmed.data.createdEvidence.createdBy, "mock-manual-service");
  assert.equal(
    confirmed.data.nextAction,
    "Hand this source-backed candidate to the contact record service only after preserving manual note evidence.",
  );
});

test("mock manual contact creation service is deterministic and has no external provider calls", async () => {
  const serviceModule = await importProjectModule<
    typeof import("../../features/acquisition/mock-manual-service")
  >("features/acquisition/mock-manual-service.ts");
  const service = serviceModule.createMockManualContactCreationService();

  assert.deepEqual(
    service.createManualContactDraft(),
    service.createManualContactDraft(),
  );
  assert.deepEqual(
    service.createManualContactDraft({ scenario: "unknown-scenario" }),
    service.createManualContactDraft(),
  );
  assert.deepEqual(
    service.confirmManualContactDraft({ draftId: "demo-manual-draft" }),
    service.confirmManualContactDraft({ draftId: "demo-manual-draft" }),
  );
  assert.deepEqual(
    service.createManualContactDraft({
      note: "Duplicate check for Kenji Watanabe at Aster Grid",
      tags: ["duplicate"],
    }),
    service.createManualContactDraft({
      note: "Duplicate check for Kenji Watanabe at Aster Grid",
      tags: ["duplicate"],
    }),
  );

  for (const filePath of [
    "features/acquisition/manual-contract.ts",
    "features/acquisition/mock-manual-service.ts",
    "app/api/contact-drafts/manual/route.ts",
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

test("manual contact creation API routes return stable envelopes with empty and failure paths", async () => {
  const createRoute = await importProjectModule<
    typeof import("../../app/api/contact-drafts/manual/route")
  >("app/api/contact-drafts/manual/route.ts");
  const confirmRoute = await importProjectModule<
    typeof import("../../app/api/contact-drafts/[id]/confirm/route")
  >("app/api/contact-drafts/[id]/confirm/route.ts");
  const fixtures = await importProjectModule<
    typeof import("../../features/acquisition/manual-contract")
  >("features/acquisition/manual-contract.ts");

  const createResponse = await createRoute.POST(
    new Request("https://orbit.local/api/contact-drafts/manual", {
      method: "POST",
    }),
  );
  const confirmResponse = await confirmRoute.POST(
    new Request(
      "https://orbit.local/api/contact-drafts/demo-manual-draft/confirm",
      {
        method: "POST",
      },
    ),
    {
      params: Promise.resolve({ id: "demo-manual-draft" }),
    },
  );
  const emptyResponse = await createRoute.POST(
    new Request(
      "https://orbit.local/api/contact-drafts/manual?scenario=empty",
      {
        method: "POST",
      },
    ),
  );
  const failureResponse = await createRoute.POST(
    new Request(
      "https://orbit.local/api/contact-drafts/manual?scenario=failure",
      {
        method: "POST",
      },
    ),
  );
  const blockedConfirmationResponse = await confirmRoute.POST(
    new Request(
      "https://orbit.local/api/contact-drafts/demo-manual-draft/confirm?scenario=blocked",
      {
        method: "POST",
      },
    ),
    {
      params: Promise.resolve({ id: "demo-manual-draft" }),
    },
  );
  const validationResponse = await createRoute.POST(
    new Request("https://orbit.local/api/contact-drafts/manual", {
      body: JSON.stringify({ note: "" }),
      headers: {
        "content-type": "application/json",
      },
      method: "POST",
    }),
  );
  const formValidationResponse = await createRoute.POST(
    new Request("https://orbit.local/api/contact-drafts/manual", {
      body: new URLSearchParams({ note: "" }),
      headers: {
        "content-type": "application/x-www-form-urlencoded",
      },
      method: "POST",
    }),
  );

  assert.equal(createResponse.status, 201);
  assert.equal(createResponse.headers.get("cache-control"), "no-store");
  assert.equal(createResponse.headers.get("x-orbit-feature-mode"), "mock");
  assert.deepEqual(await createResponse.json(), {
    success: true,
    data: fixtures.mockManualContactCreationFixture,
  });

  assert.equal(confirmResponse.status, 200);
  assert.deepEqual(await confirmResponse.json(), {
    success: true,
    data: fixtures.mockManualContactConfirmedFixture,
  });

  assert.equal(emptyResponse.status, 200);
  assert.deepEqual(await emptyResponse.json(), {
    success: true,
    data: fixtures.mockEmptyManualContactCreationFixture,
  });

  assert.equal(failureResponse.status, 503);
  assert.deepEqual(await failureResponse.json(), {
    success: false,
    error: {
      code: "SERVICE_UNAVAILABLE",
      message:
        "The mock manual contact creation boundary is pinned to a controlled failure scenario.",
      context: {
        boundary: "developer-admin",
        manualContactCreationErrorCode:
          "MANUAL_CONTACT_CREATION_MOCK_FAILED",
        mode: "mock",
        privacy: "no-relationship-data",
        provenance:
          "Mock manual contact creation failure came from deterministic fixture rules.",
        service: "manual-contact-creation-mock",
      },
    },
  });

  assert.equal(blockedConfirmationResponse.status, 403);
  assert.deepEqual(await blockedConfirmationResponse.json(), {
    success: false,
    error: {
      code: "FORBIDDEN",
      message:
        "The mock manual contact draft cannot be confirmed in this controlled scenario.",
      context: {
        boundary: "developer-admin",
        manualContactCreationErrorCode:
          "MANUAL_CONTACT_CONFIRMATION_NOT_ALLOWED",
        mode: "mock",
        privacy: "no-relationship-data",
        provenance:
          "Mock manual contact creation failure came from deterministic fixture rules.",
        service: "manual-contact-creation-mock",
      },
    },
  });

  assert.equal(validationResponse.status, 400);
  assert.deepEqual(await validationResponse.json(), {
    success: false,
    error: {
      code: "VALIDATION_ERROR",
      message: "A manual note is required before staging a contact draft.",
      context: {
        boundary: "developer-admin",
        manualContactCreationErrorCode: "MANUAL_CONTACT_NOTE_REQUIRED",
        mode: "mock",
        privacy: "no-relationship-data",
        provenance:
          "Mock manual contact creation failure came from deterministic fixture rules.",
        service: "manual-contact-creation-mock",
      },
    },
  });

  assert.equal(formValidationResponse.status, 400);
  assert.deepEqual(await formValidationResponse.json(), {
    success: false,
    error: {
      code: "VALIDATION_ERROR",
      message: "A manual note is required before staging a contact draft.",
      context: {
        boundary: "developer-admin",
        manualContactCreationErrorCode: "MANUAL_CONTACT_NOTE_REQUIRED",
        mode: "mock",
        privacy: "no-relationship-data",
        provenance:
          "Mock manual contact creation failure came from deterministic fixture rules.",
        service: "manual-contact-creation-mock",
      },
    },
  });
});

test("manual contact creation debug route renders success empty pending and failure states", async () => {
  const debugView = await importProjectModule<
    typeof import("../../features/acquisition/manual-contact-creation-mock/debug-view")
  >("features/acquisition/manual-contact-creation-mock/debug-view.tsx");
  const html = renderToStaticMarkup(
    React.createElement(debugView.ManualContactCreationMockDemo),
  );
  const pageSource = readFileSync(
    join(projectRoot, "app/dev/capabilities/[slug]/page.tsx"),
    "utf8",
  );

  assert.equal(
    debugView.MANUAL_CONTACT_CREATION_MOCK_SLUG,
    "manual-contact-creation-mock",
  );
  assert.match(pageSource, /MANUAL_CONTACT_CREATION_MOCK_SLUG/);
  assert.match(pageSource, /ManualContactCreationMockDemo/);

  assert.match(html, /Manual contact creation mock/);
  assert.match(html, /Manual contact operator runbook/);
  assert.match(html, /Read the manual note evidence/);
  assert.match(html, /Confirm only after duplicate review/);
  assert.match(html, /Use probe paths for failure evidence/);
  assert.match(html, /Runtime console/);
  assert.match(html, /Current state/);
  assert.match(html, /Next action/);
  assert.match(html, /Review source evidence, then confirm the staged draft/);
  assert.match(html, /Primary operator action/);
  assert.match(html, /Confirm pending draft before any contact write/);
  assert.match(html, /Controlled paths stay separate/);
  assert.match(html, /Manual note intake/);
  assert.match(html, /Source ledger/);
  assert.match(html, /Success state/);
  assert.match(html, /Empty state/);
  assert.match(html, /Pending state/);
  assert.match(html, /Failure state/);
  assert.match(html, /Kenji Watanabe/);
  assert.match(html, /Aster Grid/);
  assert.match(html, /demo-manual-draft/);
  assert.match(html, /event:climate-founders-dinner/);
  assert.match(html, /Send Kenji the storage pilot operator intro by Friday/);
  assert.match(html, /mock-rule duplicate check/);
  assert.match(html, /external lookup stays false/);
  assert.match(html, /CONTACT_DRAFT_CREATION/);
  assert.match(html, /MANUAL_CONTACT_CREATION_MOCK_FAILED/);
  assert.match(html, /POST \/api\/contact-drafts\/manual/);
  assert.match(
    html,
    /POST \/api\/contact-drafts\/demo-manual-draft\/confirm/,
  );
  assert.match(html, /Expect 201 success envelope/);
  assert.match(html, /Expect 200 success envelope with no draft/);
  assert.match(html, /Run empty probe/);
  assert.match(html, /Run validation probe/);
  assert.match(html, /Run controlled failure probe/);
  assert.match(html, /Run blocked confirmation probe/);
  assert.match(
    html,
    /Expect 403 failure envelope with MANUAL_CONTACT_CONFIRMATION_NOT_ALLOWED context/,
  );
  assert.match(html, /Browser-submit these POST probes to collect real envelopes/);
  assert.match(html, /Live handoff evidence excerpts/);
  assert.match(
    html,
    /Live provider files live under features\/acquisition\/manual-contact-creation-mock\//,
  );
  assert.match(
    html,
    /ORBIT_MANUAL_CONTACT_PROVIDER switches from mock to live/,
  );
  assert.match(
    html,
    /Manual notes, tags, and follow-up hints preserve source evidence/,
  );
  assert.match(
    html,
    /Replacement tests cover create, confirm, validation, empty, and provider failure paths/,
  );
  assert.match(
    html,
    /features\/acquisition\/manual-contact-creation-mock\/LIVE_IMPLEMENTATION\.md/,
  );
});

test("manual contact creation live handoff covers replacement requirements", () => {
  const docPath =
    "features/acquisition/manual-contact-creation-mock/LIVE_IMPLEMENTATION.md";
  const doc = readFileSync(join(projectRoot, docPath), "utf8");

  assert.match(doc, /Live service and provider files/i);
  assert.match(doc, /Switch mechanism/i);
  assert.match(doc, /Required env vars and permissions/i);
  assert.match(doc, /Privacy and provenance constraints/i);
  assert.match(doc, /Replacement tests/i);
  assert.match(doc, /features\/acquisition\/manual-contract\.ts/);
  assert.match(doc, /features\/acquisition\/mock-manual-service\.ts/);
  assert.match(
    doc,
    /features\/acquisition\/manual-contact-creation-mock\/live-service\.ts/,
  );
  assert.match(doc, /app\/api\/contact-drafts\/manual\/route\.ts/);
  assert.match(doc, /app\/api\/contact-drafts\/\[id\]\/confirm\/route\.ts/);
  assert.match(doc, /ORBIT_MANUAL_CONTACT_PROVIDER/);
  assert.match(doc, /manual notes, tags, and follow-up hints/i);
  assert.match(doc, /source evidence/i);
  assert.match(doc, /explicit confirmation/i);
  assert.match(doc, /duplicate lookup/i);
  assert.match(doc, /Debug review surface/i);
  assert.match(doc, /Live handoff evidence excerpts/i);
  assert.match(
    doc,
    /Live provider files live under `features\/acquisition\/manual-contact-creation-mock\/`/,
  );
  assert.match(
    doc,
    /`ORBIT_MANUAL_CONTACT_PROVIDER` switches from mock to live/,
  );
  assert.match(
    doc,
    /Manual notes, tags, and follow-up hints preserve source evidence/,
  );
  assert.match(
    doc,
    /Replacement tests cover create, confirm, validation, empty, and provider failure paths/,
  );
});
