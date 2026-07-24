import assert from "node:assert/strict";
import test from "node:test";

import { createRedactedBusinessCardEvaluationRecord } from "../../scripts/evaluate-business-card-ocr";

test("business card OCR evaluation records cost and review metrics without extracted PII", () => {
  const record = createRedactedBusinessCardEvaluationRecord({
    extractedValues: {
      displayName: "Private Name",
      email: "private@example.com",
      phone: "+81 90 0000 0000",
    },
    fileName: "card1.jpg",
    issueCodes: ["MULTIPLE_OFFICES", "SHARED_CONTACT_VALUE"],
    model: "gemini-3.5-flash-lite",
    usage: {
      inputTokens: 1156,
      latencyMs: 5163,
      outputTokens: 236,
    },
    valid: true,
  });
  const serialized = JSON.stringify(record);

  assert.equal(record.estimatedCostUsd, 0.000937);
  assert.equal(record.reviewIssueCount, 2);
  assert.deepEqual(record.reviewIssueCodes, [
    "MULTIPLE_OFFICES",
    "SHARED_CONTACT_VALUE",
  ]);
  assert.equal(serialized.includes("Private Name"), false);
  assert.equal(serialized.includes("private@example.com"), false);
  assert.equal(serialized.includes("+81 90 0000 0000"), false);
});
