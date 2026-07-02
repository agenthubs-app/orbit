import assert from "node:assert/strict";
import test from "node:test";

import { createLiveProfileDocumentExtractionService } from "../../features/profile/live-extraction-service";
import {
  createProfileDocumentExtractionService,
  resolveProfileDocumentExtractionService,
} from "../../features/profile/service-factory";

test("live profile document extraction is an explicit policy-only provider", () => {
  const service = createLiveProfileDocumentExtractionService({
    now: () => "2026-07-02T07:00:00.000Z",
  });

  const resume = service.extractResumeDraft({
    fileName: "operator-profile.pdf",
    mimeType: "application/pdf",
    text: "source-backed profile text",
  });
  const businessCard = service.extractBusinessCardDraft({
    fileName: "operator-card.png",
    mimeType: "image/png",
    text: "source-backed card text",
  });

  assert.equal(resume.success, true);
  assert.equal(resume.data.state, "empty");
  assert.equal(resume.data.kind, "resume");
  assert.equal(resume.data.draft, null);
  assert.equal(
    resume.data.provenance.privacy,
    "live-profile-document-policy-only",
  );
  assert.equal(resume.data.provenance.extractionMethod, "live-policy-no-op");
  assert.deepEqual(resume.data.provenance.evidenceIds, [
    "evidence:profile-document-live-policy:resume",
  ]);
  assert.match(resume.data.nextAction, /reviewed profile text/i);

  assert.equal(businessCard.success, true);
  assert.equal(businessCard.data.state, "empty");
  assert.equal(businessCard.data.kind, "business-card");
  assert.equal(
    businessCard.data.provenance.evidenceIds[0],
    "evidence:profile-document-live-policy:business-card",
  );
});

test("profile document extraction factory resolves live policy provider", () => {
  const resolution = resolveProfileDocumentExtractionService("live");
  const service = createProfileDocumentExtractionService("live");
  const resume = service.extractResumeDraft();

  assert.equal(
    resolution.success,
    true,
    resolution.success === false ? resolution.error.message : "",
  );
  assert.equal(resolution.mode, "live");
  assert.equal(resume.success, true);
  assert.equal(resume.data.provenance.extractionMethod, "live-policy-no-op");
});
