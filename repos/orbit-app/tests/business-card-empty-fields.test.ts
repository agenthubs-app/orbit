import assert from "node:assert/strict";
import test from "node:test";
import {
  acquisitionResultToSummary,
  buildBusinessCardContactWriteRequest,
  buildContactDraftReviewRequest,
  contactDraftReviewFormFromSummary
} from "../src/view-models/contact-acquisition";

const scan = {
  capture: { imageDigest: "sha256:card-empty-fields" },
  draft: {
    id: "card-empty-fields",
    displayName: "Hana Sato",
    organization: "Aki Robotics",
    role: "Director",
    email: "wrong@example.invalid",
    phone: "+81-3-5555-0198",
    relationshipContext: "Met at an event",
    source: { type: "business_card_ocr" },
    evidence: [{ evidenceId: "evidence:card-empty-fields", excerpt: "Hana Sato" }]
  }
};

test("cleared optional fields stay empty in the contact write payload", () => {
  const summary = acquisitionResultToSummary(scan);
  const form = contactDraftReviewFormFromSummary(summary);
  const request = buildBusinessCardContactWriteRequest(summary, {
    ...form, email: "", organization: " ", role: "", phone: " "
  });
  assert.equal(request.success, true);
  if (!request.success) return;
  assert.deepEqual(request.request.body, {
    actorLabel: "Orbit iOS", confirmed: true,
    displayName: "Hana Sato", draftId: "card-empty-fields",
    email: "", organization: "", role: "", phone: "",
    imageDigest: "sha256:card-empty-fields",
    evidenceIds: ["evidence:card-empty-fields"],
    relationshipContext: "Met at an event"
  });
});

test("clearing the name blocks writing instead of restoring the recognized name", () => {
  const summary = acquisitionResultToSummary(scan);
  const request = buildBusinessCardContactWriteRequest(summary, {
    ...contactDraftReviewFormFromSummary(summary), displayName: " "
  });
  assert.equal(request.success, false);
});

test("a card without a review form still uses the original candidate", () => {
  const summary = acquisitionResultToSummary(scan);
  for (const form of [undefined, null]) {
    const request = buildBusinessCardContactWriteRequest(summary, form);
    assert.equal(request.success, true);
    if (!request.success) continue;
    assert.equal(request.request.body.displayName, "Hana Sato");
    assert.equal(request.request.body.email, "wrong@example.invalid");
  }
});

test("unrecognized card fields remain available for manual completion", () => {
  const summary = acquisitionResultToSummary({
    draft: { id: "empty-card", source: { type: "business_card_ocr" } }
  });
  assert.deepEqual(summary.reviewFields?.map(({ field, value }) => ({ field, value })), [
    { field: "displayName", value: "" },
    { field: "organization", value: "" },
    { field: "role", value: "" },
    { field: "email", value: "" },
    { field: "phone", value: "" }
  ]);
  const form = contactDraftReviewFormFromSummary(summary);
  form.displayName = " Hana Sato ";
  form.email = " hana@example.invalid ";
  const request = buildContactDraftReviewRequest(summary.draftId, form);
  assert.equal(request.success, true);
  if (!request.success) return;
  assert.deepEqual(request.request.body.reviewedFields, {
    displayName: "Hana Sato", email: "hana@example.invalid",
    organization: "", role: "", phone: ""
  });
});

test("a saved empty review value does not fall back to the original OCR field", () => {
  for (const reviewState of ["accepted", "edited"]) {
    const summary = acquisitionResultToSummary({
      ...scan,
      draft: {
        ...scan.draft,
        extractedFields: {
          email: { value: "wrong@example.invalid", reviewedValue: "", reviewState }
        }
      }
    });
    assert.equal(summary.reviewFields?.find(({ field }) => field === "email")?.value, "");
    assert.equal(contactDraftReviewFormFromSummary(summary).email, "");
  }
});

test("non-card drafts do not acquire a blank OCR review form", () => {
  const summary = acquisitionResultToSummary({
    draft: { id: "manual", displayName: "Hana Sato", source: { type: "manual" } }
  });
  assert.equal(summary.reviewFields, undefined);
});
