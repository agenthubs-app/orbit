/**
 * 名片复核确认 flow 的契约测试。
 *
 * 验证草稿复核、确认结果、错误状态和 debug-view 的受控输出。
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
    `${pathFromRoot} must exist for the business card review sprint`,
  );

  return (await import(pathToFileURL(absolutePath).href)) as TModule;
}

test("business card review contract exposes human field review before contact confirmation", async () => {
  const contract = await importProjectModule<
    typeof import("../../features/acquisition/business-card-review-contract")
  >("features/acquisition/business-card-review-contract.ts");
  const serviceModule = await importProjectModule<
    typeof import("../../features/acquisition/mock-business-card-review-service")
  >("features/acquisition/mock-business-card-review-service.ts");

  const service: contract.BusinessCardReviewService =
    serviceModule.createMockBusinessCardReviewService();
  const success = service.getReviewDraft({
    draftId: "demo-business-card-draft",
  });
  const empty = service.getReviewDraft({
    draftId: "demo-business-card-draft",
    scenario: "empty",
  });
  const pending = service.getReviewDraft({
    draftId: "demo-business-card-draft",
    scenario: "pending",
  });
  const failure = service.getReviewDraft({
    draftId: "demo-business-card-draft",
    scenario: "failure",
  });
  const reviewed = service.updateReviewDraft({
    draftId: "demo-business-card-draft",
    reviewedFields: {
      displayName: "Hana Sato",
      organization: "Aki Robotics",
    },
  });
  const confirmed = service.confirmReviewedDraft({
    draftId: "demo-business-card-draft",
  });

  assert.deepEqual(contract.BUSINESS_CARD_REVIEW_ERROR_CODES, [
    "BUSINESS_CARD_REVIEW_DRAFT_NOT_FOUND",
    "BUSINESS_CARD_REVIEW_FIELDS_REQUIRED",
    "BUSINESS_CARD_REVIEW_PENDING",
    "BUSINESS_CARD_REVIEW_CONFIRMATION_NOT_ALLOWED",
    "BUSINESS_CARD_REVIEW_MOCK_FAILED",
  ]);
  assert.equal(
    contract.BUSINESS_CARD_REVIEW_ERROR_DEFINITIONS
      .BUSINESS_CARD_REVIEW_DRAFT_NOT_FOUND.appCode,
    "NOT_FOUND",
  );

  assert.equal(success.success, true);
  assert.equal(success.data.state, "success");
  assert.equal(success.data.reviewDraft.id, "demo-business-card-draft");
  assert.equal(success.data.reviewDraft.status, "pending_review");
  assert.equal(success.data.reviewDraft.source.type, "business_card_ocr");
  assert.equal(success.data.reviewDraft.extractedFields.displayName.value, "Hana Sato");
  assert.equal(success.data.reviewDraft.extractedFields.email.reviewState, "needs_review");
  assert.equal(success.data.reviewDraft.contactWriteExecuted, false);
  assert.equal(success.data.reviewDraft.databaseWriteExecuted, false);
  assert.equal(success.data.reviewDraft.aiProviderCalled, false);
  assert.equal(success.data.reviewDraft.ocrProviderCalled, false);
  assert.deepEqual(success.data.provenance.evidenceIds, [
    "evidence:business-card-review-source-hana",
    "evidence:business-card-review-fields-hana",
  ]);
  assert.equal(
    success.data.provenance.source,
    contract.BUSINESS_CARD_REVIEW_FIXTURE_SOURCE,
  );

  assert.equal(empty.success, true);
  assert.equal(empty.data.state, "empty");
  assert.equal(empty.data.reviewDraft, null);
  assert.equal(
    empty.data.nextAction,
    "Wait for extracted business card fields before starting review.",
  );

  assert.equal(pending.success, true);
  assert.equal(pending.data.state, "pending");
  assert.equal(pending.data.reviewDraft?.status, "pending_review");
  assert.equal(
    pending.data.nextAction,
    "Review the extracted fields before confirming the contact candidate.",
  );

  assert.equal(failure.success, false);
  assert.equal(failure.error.code, "BUSINESS_CARD_REVIEW_MOCK_FAILED");
  assert.equal(failure.error.appCode, "SERVICE_UNAVAILABLE");

  assert.equal(reviewed.success, true);
  assert.equal(reviewed.data.state, "success");
  assert.equal(reviewed.data.reviewDraft.status, "reviewed");
  assert.equal(reviewed.data.reviewDraft.extractedFields.displayName.reviewState, "accepted");
  assert.equal(reviewed.data.reviewDraft.reviewedBy, "Demo reviewer");
  assert.equal(reviewed.data.reviewEvidence.createdBy, "mock-business-card-review-service");
  assert.equal(reviewed.data.contactCandidateReady, false);

  assert.equal(confirmed.success, true);
  assert.equal(confirmed.data.state, "confirmed");
  assert.equal(confirmed.data.confirmedDraft.status, "confirmed");
  assert.equal(confirmed.data.contactCandidate.readyForContactWrite, true);
  assert.equal(confirmed.data.contactCandidate.contactWriteExecuted, false);
  assert.equal(confirmed.data.createdEvidence.createdBy, "mock-business-card-review-service");
  assert.equal(
    confirmed.data.nextAction,
    "Send the reviewed card candidate to the contact service with source and evidence ids intact.",
  );
});

test("mock business card review service is deterministic and has no external provider calls", async () => {
  const serviceModule = await importProjectModule<
    typeof import("../../features/acquisition/mock-business-card-review-service")
  >("features/acquisition/mock-business-card-review-service.ts");
  const service = serviceModule.createMockBusinessCardReviewService();
  const ruleInput = {
    draftId: "demo-business-card-draft",
    reviewedFields: {
      displayName: "Hana Sato",
      role: "Head of Robotics Partnerships",
      organization: "Aki Robotics",
      email: "hana.sato@akirobotics.example",
      phone: "+81-3-5555-0198",
    },
    reviewerLabel: "Demo reviewer",
  };

  assert.deepEqual(
    service.getReviewDraft({ draftId: "demo-business-card-draft" }),
    service.getReviewDraft({ draftId: "demo-business-card-draft" }),
  );
  assert.deepEqual(
    service.getReviewDraft({
      draftId: "demo-business-card-draft",
      scenario: "unknown-scenario",
    }),
    service.getReviewDraft({ draftId: "demo-business-card-draft" }),
  );
  assert.deepEqual(
    service.updateReviewDraft(ruleInput),
    service.updateReviewDraft(ruleInput),
  );
  assert.deepEqual(
    service.confirmReviewedDraft({ draftId: "demo-business-card-draft" }),
    service.confirmReviewedDraft({ draftId: "demo-business-card-draft" }),
  );

  const reviewed = service.updateReviewDraft(ruleInput);

  assert.equal(reviewed.success, true);
  assert.equal(reviewed.data.reviewDraft.provenance.generationMethod, "rule-based-card-review");
  assert.equal(reviewed.data.reviewDraft.extractedFields.displayName.reviewedValue, "Hana Sato");
  assert.equal(reviewed.data.reviewDraft.extractedFields.role.reviewedValue, "Head of Robotics Partnerships");
  assert.equal(reviewed.data.reviewDraft.extractedFields.phone.reviewedValue, "+81-3-5555-0198");

  for (const filePath of [
    "features/acquisition/business-card-review-contract.ts",
    "features/acquisition/mock-business-card-review-service.ts",
    "features/acquisition/business-card-review-and-confirm-flow/debug-view.tsx",
    "app/api/contact-drafts/[id]/route.ts",
    "app/api/contact-drafts/[id]/confirm/route.ts",
  ]) {
    const source = readFileSync(join(projectRoot, filePath), "utf8");

    assert.doesNotMatch(source, /\bfetch\s*\(/);
    assert.doesNotMatch(source, /Supabase|createClient|OAuth/i);
    assert.doesNotMatch(source, /XMLHttpRequest|WebSocket|EventSource/);
    assert.doesNotMatch(source, /navigator|mediaDevices|localStorage|indexedDB/);
    assert.doesNotMatch(
      source,
      /calendar provider|email provider|notification provider|database provider/i,
    );
    assert.doesNotMatch(source, /openai|anthropic|ai provider/i);
    assert.doesNotMatch(source, /s3|gcs|blob storage/i);
  }
});

test("business card review API routes return stable envelopes with empty and failure paths", async () => {
  const draftRoute = await importProjectModule<
    typeof import("../../app/api/contact-drafts/[id]/route")
  >("app/api/contact-drafts/[id]/route.ts");
  const confirmRoute = await importProjectModule<
    typeof import("../../app/api/contact-drafts/[id]/confirm/route")
  >("app/api/contact-drafts/[id]/confirm/route.ts");
  const contract = await importProjectModule<
    typeof import("../../features/acquisition/business-card-review-contract")
  >("features/acquisition/business-card-review-contract.ts");

  const patchResponse = await draftRoute.PATCH(
    new Request("https://orbit.local/api/contact-drafts/demo-business-card-draft", {
      method: "PATCH",
    }),
    {
      params: Promise.resolve({ id: "demo-business-card-draft" }),
    },
  );
  const confirmResponse = await confirmRoute.POST(
    new Request(
      "https://orbit.local/api/contact-drafts/demo-business-card-draft/confirm",
      {
        method: "POST",
      },
    ),
    {
      params: Promise.resolve({ id: "demo-business-card-draft" }),
    },
  );
  const emptyResponse = await draftRoute.PATCH(
    new Request(
      "https://orbit.local/api/contact-drafts/demo-business-card-draft?scenario=empty",
      {
        method: "PATCH",
      },
    ),
    {
      params: Promise.resolve({ id: "demo-business-card-draft" }),
    },
  );
  const failureResponse = await draftRoute.PATCH(
    new Request(
      "https://orbit.local/api/contact-drafts/demo-business-card-draft?scenario=failure",
      {
        method: "PATCH",
      },
    ),
    {
      params: Promise.resolve({ id: "demo-business-card-draft" }),
    },
  );
  const pendingConfirmResponse = await confirmRoute.POST(
    new Request(
      "https://orbit.local/api/contact-drafts/demo-business-card-draft/confirm?scenario=pending",
      {
        method: "POST",
      },
    ),
    {
      params: Promise.resolve({ id: "demo-business-card-draft" }),
    },
  );
  const editedFieldResponse = await draftRoute.PATCH(
    new Request("https://orbit.local/api/contact-drafts/demo-business-card-draft", {
      body: JSON.stringify({
        reviewedFields: {
          displayName: "Hana Sato",
          role: "Head of Robotics Partnerships",
          organization: "Aki Robotics",
          email: "hana@aki-robotics.example",
          phone: "+81-3-5555-0198",
        },
        reviewerLabel: "Operations reviewer",
      }),
      method: "PATCH",
    }),
    {
      params: Promise.resolve({ id: "demo-business-card-draft" }),
    },
  );

  assert.equal(patchResponse.status, 200);
  assert.equal(patchResponse.headers.get("cache-control"), "no-store");
  assert.equal(patchResponse.headers.get("x-orbit-feature-mode"), "mock");
  assert.deepEqual(await patchResponse.json(), {
    success: true,
    data: contract.mockBusinessCardReviewUpdatedFixture,
  });

  assert.equal(confirmResponse.status, 200);
  assert.deepEqual(await confirmResponse.json(), {
    success: true,
    data: contract.mockBusinessCardReviewConfirmedFixture,
  });

  assert.equal(emptyResponse.status, 200);
  assert.deepEqual(await emptyResponse.json(), {
    success: true,
    data: contract.mockEmptyBusinessCardReviewFixture,
  });

  assert.equal(failureResponse.status, 503);
  assert.deepEqual(await failureResponse.json(), {
    success: false,
    error: {
      code: "SERVICE_UNAVAILABLE",
      message:
        "The mock business card review boundary is pinned to a controlled failure scenario.",
      context: {
        boundary: "developer-admin",
        businessCardReviewErrorCode: "BUSINESS_CARD_REVIEW_MOCK_FAILED",
        mode: "mock",
        privacy: "no-relationship-data",
        provenance:
          "Mock business card review failure came from deterministic fixture rules.",
        service: "business-card-review-and-confirm-flow-mock",
      },
    },
  });

  assert.equal(pendingConfirmResponse.status, 409);
  assert.deepEqual(await pendingConfirmResponse.json(), {
    success: false,
    error: {
      code: "CONFLICT",
      message:
        "The mock business card review is still pending human field review.",
      context: {
        boundary: "developer-admin",
        businessCardReviewErrorCode: "BUSINESS_CARD_REVIEW_PENDING",
        mode: "mock",
        privacy: "no-relationship-data",
        provenance:
          "Mock business card review failure came from deterministic fixture rules.",
        service: "business-card-review-and-confirm-flow-mock",
      },
    },
  });

  assert.equal(editedFieldResponse.status, 200);
  const editedFieldEnvelope = await editedFieldResponse.json();

  assert.equal(editedFieldEnvelope.success, true);
  assert.equal(
    editedFieldEnvelope.data.reviewDraft.extractedFields.email.reviewState,
    "edited",
  );
  assert.equal(
    editedFieldEnvelope.data.reviewDraft.extractedFields.email.reviewedValue,
    "hana@aki-robotics.example",
  );
  assert.equal(editedFieldEnvelope.data.reviewDraft.reviewedBy, "Operations reviewer");
  assert.equal(editedFieldEnvelope.data.reviewDraft.contactWriteExecuted, false);
  assert.equal(editedFieldEnvelope.data.reviewDraft.databaseWriteExecuted, false);
});

test("business card review debug route renders success empty pending and failure states", async () => {
  const debugView = await importProjectModule<
    typeof import("../../features/acquisition/business-card-review-and-confirm-flow/debug-view")
  >(
    "features/acquisition/business-card-review-and-confirm-flow/debug-view.tsx",
  );
  const html = renderToStaticMarkup(
    React.createElement(debugView.BusinessCardReviewAndConfirmFlowDemo),
  );
  const pageSource = readFileSync(
    join(projectRoot, "app/dev/capabilities/[slug]/page.tsx"),
    "utf8",
  );
  const liveDocPath =
    "features/acquisition/business-card-review-and-confirm-flow/LIVE_IMPLEMENTATION.md";
  const liveDoc = readFileSync(join(projectRoot, liveDocPath), "utf8");

  assert.equal(
    debugView.BUSINESS_CARD_REVIEW_AND_CONFIRM_FLOW_SLUG,
    "business-card-review-and-confirm-flow",
  );
  assert.match(pageSource, /BUSINESS_CARD_REVIEW_AND_CONFIRM_FLOW_SLUG/);
  assert.match(pageSource, /BusinessCardReviewAndConfirmFlowDemo/);

  assert.match(html, /Business card review and confirm flow/);
  assert.match(html, /Review extracted fields/);
  assert.match(html, /Correct extracted fields/);
  assert.match(html, /Original extraction/);
  assert.match(html, /Operator correction/);
  assert.match(html, /name="reviewedFields.displayName"/);
  assert.match(html, /name="reviewedFields.role"/);
  assert.match(html, /name="reviewedFields.organization"/);
  assert.match(html, /name="reviewedFields.email"/);
  assert.match(html, /name="reviewedFields.phone"/);
  assert.match(html, /data-api-method="PATCH"/);
  assert.match(html, /Accept or edit fields/);
  assert.match(html, /Confirm reviewed card/);
  assert.match(html, /No contact write runs during review/);
  assert.match(html, /Success state/);
  assert.match(html, /Empty state/);
  assert.match(html, /Pending state/);
  assert.match(html, /Failure state/);
  assert.match(html, /Hana Sato/);
  assert.match(html, /Aki Robotics/);
  assert.match(html, /demo-business-card-draft/);
  assert.match(html, /BUSINESS_CARD_REVIEW_MOCK_FAILED/);
  assert.match(html, /PATCH \/api\/contact-drafts\/demo-business-card-draft/);
  assert.match(
    html,
    /POST \/api\/contact-drafts\/demo-business-card-draft\/confirm/,
  );
  assert.match(html, new RegExp(liveDocPath));
  assert.match(html, /ORBIT_BUSINESS_CARD_REVIEW_PROVIDER/);
  assert.match(html, /Live handoff evidence excerpts/);
  assert.match(
    html,
    /Provider adapters live under features\/acquisition\/business-card-review-and-confirm-flow\/providers\//,
  );
  assert.match(
    html,
    /Human review stays between OCR extraction and contact creation/,
  );
  assert.match(
    html,
    /Replacement tests cover review, confirm, privacy, and debug states/,
  );

  assert.match(liveDoc, /Live service and provider files/i);
  assert.match(liveDoc, /Switch mechanism/i);
  assert.match(liveDoc, /Required env vars and permissions/i);
  assert.match(liveDoc, /Privacy and provenance constraints/i);
  assert.match(liveDoc, /Replacement tests/i);
  assert.match(liveDoc, /features\/acquisition\/business-card-review-contract\.ts/);
  assert.match(liveDoc, /features\/acquisition\/mock-business-card-review-service\.ts/);
  assert.match(liveDoc, /features\/acquisition\/business-card-review-and-confirm-flow\/live-service\.ts/);
  assert.match(liveDoc, /app\/api\/contact-drafts\/\[id\]\/route\.ts/);
  assert.match(liveDoc, /app\/api\/contact-drafts\/\[id\]\/confirm\/route\.ts/);
  assert.match(liveDoc, /ORBIT_BUSINESS_CARD_REVIEW_PROVIDER/);
  assert.match(liveDoc, /source and evidence provenance/i);
  assert.match(liveDoc, /human review/i);
  assert.match(liveDoc, /contact creation/i);
});
