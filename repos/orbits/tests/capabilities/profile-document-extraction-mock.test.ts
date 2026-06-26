import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  PROFILE_DOCUMENT_EXTRACTION_ERROR_CODES,
  PROFILE_DOCUMENT_EXTRACTION_ERROR_DEFINITIONS,
} from "../../features/profile/extraction-contract";
import {
  mockBusinessCardExtractionFixture,
  mockEmptyResumeExtractionFixture,
  mockPendingBusinessCardExtractionFixture,
  mockResumeExtractionFixture,
} from "../../features/profile/extraction-fixtures";
import { createMockProfileDocumentExtractionService } from "../../features/profile/mock-extraction-service";
import {
  ProfileDocumentExtractionCapabilityDemo,
  PROFILE_DOCUMENT_EXTRACTION_CAPABILITY_SLUG,
} from "../../features/profile/profile-document-extraction-mock/debug-view";
import * as businessCardRoute from "../../app/api/profile/extractions/business-card/route";
import * as resumeRoute from "../../app/api/profile/extractions/resume/route";

const projectRoot = join(fileURLToPath(import.meta.url), "../../..");

test("profile document extraction contract exposes typed resume and business-card draft behavior", () => {
  const service = createMockProfileDocumentExtractionService();
  const resume = service.extractResumeDraft();
  const businessCard = service.extractBusinessCardDraft();
  const empty = service.extractResumeDraft({ scenario: "empty" });
  const pending = service.extractBusinessCardDraft({ scenario: "pending" });
  const failure = service.extractResumeDraft({ scenario: "failure" });

  assert.deepEqual(PROFILE_DOCUMENT_EXTRACTION_ERROR_CODES, [
    "PROFILE_DOCUMENT_REQUIRED",
    "PROFILE_DOCUMENT_UNSUPPORTED_TYPE",
    "PROFILE_DOCUMENT_EXTRACTION_FAILED",
  ]);
  assert.equal(
    PROFILE_DOCUMENT_EXTRACTION_ERROR_DEFINITIONS
      .PROFILE_DOCUMENT_UNSUPPORTED_TYPE.appCode,
    "VALIDATION_ERROR",
  );

  assert.equal(resume.success, true);
  assert.equal(resume.data.state, "success");
  assert.equal(resume.data.kind, "resume");
  assert.equal(resume.data.draft.displayName, "Ari Lane");
  assert.equal(resume.data.draft.organization, "Orbit");
  assert.equal(resume.data.draft.confidence, "high");
  assert.deepEqual(resume.data.provenance.evidenceIds, [
    "evidence:resume-text-profile",
    "evidence:resume-founder-context",
  ]);

  assert.equal(businessCard.success, true);
  assert.equal(businessCard.data.state, "success");
  assert.equal(businessCard.data.kind, "business-card");
  assert.equal(businessCard.data.draft.displayName, "Mina Sato");
  assert.equal(businessCard.data.draft.email, "mina.sato@example.test");
  assert.deepEqual(businessCard.data.draft.suggestedProfileFields, {
    homeMarket: "Tokyo",
    preferredIntroChannels: ["event follow-up", "email"],
  });

  assert.equal(empty.success, true);
  assert.equal(empty.data.state, "empty");
  assert.equal(empty.data.draft, null);
  assert.equal(
    empty.data.provenance.source,
    mockEmptyResumeExtractionFixture.provenance.source,
  );

  assert.equal(pending.success, true);
  assert.equal(pending.data.state, "pending");
  assert.equal(pending.data.draft, null);
  assert.equal(
    pending.data.provenance.sourceLabel,
    mockPendingBusinessCardExtractionFixture.provenance.sourceLabel,
  );

  assert.equal(failure.success, false);
  assert.equal(failure.error.code, "PROFILE_DOCUMENT_EXTRACTION_FAILED");
  assert.equal(failure.error.appCode, "SERVICE_UNAVAILABLE");
});

test("mock profile document extraction service is deterministic and has no external provider calls", () => {
  const service = createMockProfileDocumentExtractionService();

  assert.deepEqual(service.extractResumeDraft(), service.extractResumeDraft());
  assert.deepEqual(
    service.extractBusinessCardDraft(),
    service.extractBusinessCardDraft(),
  );
  assert.deepEqual(
    service.extractResumeDraft({ scenario: "unknown-scenario" }),
    service.extractResumeDraft(),
  );

  for (const filePath of [
    "features/profile/extraction-contract.ts",
    "features/profile/extraction-fixtures.ts",
    "features/profile/mock-extraction-service.ts",
  ]) {
    const source = readFileSync(join(projectRoot, filePath), "utf8");

    assert.doesNotMatch(source, /\bfetch\s*\(/);
    assert.doesNotMatch(source, /Supabase|createClient|oauth/i);
    assert.doesNotMatch(source, /XMLHttpRequest|WebSocket|EventSource/);
    assert.doesNotMatch(source, /navigator|localStorage|indexedDB/);
    assert.doesNotMatch(
      source,
      /calendar service|email service|notification service|provider call/i,
    );
    assert.doesNotMatch(source, /openai|anthropic|ai provider/i);
  }
});

test("profile document extraction API routes return stable success envelopes", async () => {
  const resumeResponse = await resumeRoute.POST(
    new Request("https://orbit.local/api/profile/extractions/resume", {
      method: "POST",
    }),
  );
  const businessCardResponse = await businessCardRoute.POST(
    new Request("https://orbit.local/api/profile/extractions/business-card", {
      method: "POST",
    }),
  );

  assert.equal(resumeResponse.status, 200);
  assert.equal(resumeResponse.headers.get("cache-control"), "no-store");
  assert.equal(resumeResponse.headers.get("x-orbit-feature-mode"), "mock");
  assert.deepEqual(await resumeResponse.json(), {
    success: true,
    data: mockResumeExtractionFixture,
  });

  assert.equal(businessCardResponse.status, 200);
  assert.equal(businessCardResponse.headers.get("cache-control"), "no-store");
  assert.deepEqual(await businessCardResponse.json(), {
    success: true,
    data: mockBusinessCardExtractionFixture,
  });
});

test("profile document extraction API routes document empty, pending, and controlled failure paths", async () => {
  const emptyResponse = await resumeRoute.POST(
    new Request(
      "https://orbit.local/api/profile/extractions/resume?scenario=empty",
      {
        method: "POST",
      },
    ),
  );
  const pendingResponse = await businessCardRoute.POST(
    new Request(
      "https://orbit.local/api/profile/extractions/business-card?scenario=pending",
      {
        method: "POST",
      },
    ),
  );
  const failureResponse = await businessCardRoute.POST(
    new Request(
      "https://orbit.local/api/profile/extractions/business-card?scenario=failure",
      {
        method: "POST",
      },
    ),
  );

  assert.equal(emptyResponse.status, 200);
  assert.deepEqual(await emptyResponse.json(), {
    success: true,
    data: mockEmptyResumeExtractionFixture,
  });

  assert.equal(pendingResponse.status, 200);
  assert.deepEqual(await pendingResponse.json(), {
    success: true,
    data: mockPendingBusinessCardExtractionFixture,
  });

  assert.equal(failureResponse.status, 503);
  assert.deepEqual(await failureResponse.json(), {
    success: false,
    error: {
      code: "SERVICE_UNAVAILABLE",
      message:
        "The mock document extraction path is pinned to a controlled failure scenario.",
      context: {
        boundary: "developer-admin",
        documentKind: "business-card",
        mode: "mock",
        privacy: "no-relationship-data",
        profileDocumentExtractionErrorCode:
          "PROFILE_DOCUMENT_EXTRACTION_FAILED",
        provenance:
          "Mock profile document extraction failure came from deterministic fixture rules.",
        service: "profile-document-extraction-mock",
      },
    },
  });
});

test("profile document extraction debug route renders success, empty, pending, and failure states", () => {
  const html = renderToStaticMarkup(
    React.createElement(ProfileDocumentExtractionCapabilityDemo),
  );
  const pageSource = readFileSync(
    join(projectRoot, "app/dev/capabilities/[slug]/page.tsx"),
    "utf8",
  );

  assert.equal(
    PROFILE_DOCUMENT_EXTRACTION_CAPABILITY_SLUG,
    "profile-document-extraction-mock",
  );
  assert.match(pageSource, /PROFILE_DOCUMENT_EXTRACTION_CAPABILITY_SLUG/);
  assert.match(pageSource, /ProfileDocumentExtractionCapabilityDemo/);

  assert.match(html, /Profile document extraction mock/);
  assert.match(html, /Success state/);
  assert.match(html, /Empty state/);
  assert.match(html, /Pending state/);
  assert.match(html, /Failure state/);
  assert.match(html, /Ari Lane/);
  assert.match(html, /Mina Sato/);
  assert.match(html, /Resume draft/);
  assert.match(html, /Business card draft/);
  assert.match(html, /PROFILE_DOCUMENT_EXTRACTION_FAILED/);
  assert.match(html, /POST \/api\/profile\/extractions\/resume/);
  assert.match(html, /POST \/api\/profile\/extractions\/business-card/);
  assert.match(html, /Expect 503 failure envelope/);
  assert.match(
    html,
    /curl -s -X POST http:\/\/localhost:3000\/api\/profile\/extractions\/business-card\?scenario=pending/,
  );
  assert.match(html, /Expected status: 503/);
  assert.match(
    html,
    /features\/profile\/profile-document-extraction-mock\/LIVE_IMPLEMENTATION\.md/,
  );
});

test("profile document extraction live handoff covers replacement requirements", () => {
  const doc = readFileSync(
    join(
      projectRoot,
      "features/profile/profile-document-extraction-mock/LIVE_IMPLEMENTATION.md",
    ),
    "utf8",
  );

  assert.match(doc, /Live service and provider files/i);
  assert.match(doc, /Switch mechanism/i);
  assert.match(doc, /Required env vars and permissions/i);
  assert.match(doc, /Privacy and provenance constraints/i);
  assert.match(doc, /Replacement tests/i);
  assert.match(doc, /features\/profile\/mock-extraction-service\.ts/);
  assert.match(doc, /features\/profile\/extraction-contract\.ts/);
  assert.match(doc, /app\/api\/profile\/extractions\/resume\/route\.ts/);
  assert.match(
    doc,
    /app\/api\/profile\/extractions\/business-card\/route\.ts/,
  );
  assert.match(doc, /ORBIT_PROFILE_OCR_PROVIDER/);
  assert.match(doc, /source and evidence provenance/i);
});
