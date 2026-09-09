import assert from "node:assert/strict";
import test from "node:test";
import { acquisitionResultToSummary, buildContactAcquisitionRequest, type ContactAcquisitionFormState } from "../src/view-models/contact-acquisition";

test("scan risks survive the summary adapter with usable Chinese review instructions", () => {
  const summary = acquisitionResultToSummary({
    draft: { id: "risk-card", source: { type: "business_card_ocr" } },
    ocr: { reviewIssues: [
      { code: "INVALID_EMAIL", field: "emails", message: "Review the email labeled work." },
      { code: "MULTIPLE_OFFICES", field: "addresses", message: "Confirm the primary office." },
      { code: "FUTURE_ISSUE", field: "other", message: "请确认名片背面的补充信息。" },
    ] },
  });
  assert.deepEqual(summary.reviewIssues, [
    { code: "INVALID_EMAIL", message: "邮箱可能有误，请对照名片核对。" },
    { code: "MULTIPLE_OFFICES", message: "名片有多个办公地点，请确认要保留的信息。" },
    { code: "FUTURE_ISSUE", message: "请确认名片背面的补充信息。" },
  ]);
});

test("a malformed risk is not silently dropped from the review requirements", () => {
  const summary = acquisitionResultToSummary({
    draft: { id: "risk-card", source: { type: "business_card_ocr" } },
    ocr: { reviewIssues: [null] },
  });
  assert.equal(summary.reviewIssues?.length, 1);
  assert.match(summary.reviewIssues![0]!.message, /请对照名片/u);
});

test("unknown risk codes cannot resolve object prototype properties as display copy", () => {
  const summary = acquisitionResultToSummary({
    draft: { id: "risk-card", source: { type: "business_card_ocr" } },
    ocr: { reviewIssues: [{ code: "toString", message: "Unknown future risk" }] },
  });
  assert.equal(typeof summary.reviewIssues?.[0]?.message, "string");
  assert.match(summary.reviewIssues![0]!.message, /请对照名片/u);
});

test("text-only card input is rejected instead of being sent to image OCR", () => {
  const form: ContactAcquisitionFormState = {
    displayName: "", followUpHint: "", imageName: "card", imageText: "New Person\nnew@example.invalid",
    note: "", organization: "", qrText: "", role: "", scanLabel: "", tagsText: "",
  };
  const textOnly = buildContactAcquisitionRequest("businessCard", form);
  assert.equal(textOnly.success, false);
  if (!textOnly.success) assert.match(textOnly.error, /图片/u);
  const image = buildContactAcquisitionRequest("businessCard", { ...form, imageBase64: "test-image", imageMimeType: "image/png" });
  assert.equal(image.success, true);
  if (image.success) assert.equal("imageText" in image.request.body, false);
});
