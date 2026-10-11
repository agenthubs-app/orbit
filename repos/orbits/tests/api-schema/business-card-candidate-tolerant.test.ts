import assert from "node:assert/strict";
import test from "node:test";

import { ingestConfirmationResponseSchema, ingestContactCandidateObject } from "../../shared/api-schema/business-card-batch";
import { readIngestContactCandidate, readIngestDuplicateMatches } from "../../shared/api-schema/business-card-candidate";

// R12（DESIGN §4.1，复核 S1）：名片候选的命中理由加了 `name`（同名）。读取端先宽进：
// 不认识的理由读成 `name_organization`，整条响应不因此失败。
const candidate = { contactId: "contact:existing", displayName: "山田 太郎", organization: "", role: "", email: "", phone: "", address: "", identical: false };

test("matchedOn: the new 'name' reason reads as itself", () => {
  assert.deepEqual(ingestContactCandidateObject.parse({ ...candidate, matchedOn: ["name"] }).matchedOn, ["name"]);
});

test("a candidate with an unknown matchedOn value does not fail the whole response", () => {
  const parsed = ingestContactCandidateObject.parse({ ...candidate, matchedOn: ["fax", "email"] });
  assert.deepEqual(parsed.matchedOn, ["name_organization", "email"]);
  // 两个未知值都落到同一个兜底值时只留一个。
  assert.deepEqual(ingestContactCandidateObject.parse({ ...candidate, matchedOn: ["fax", "telex", "name_organization"] }).matchedOn, ["name_organization"]);
  const response = ingestConfirmationResponseSchema.parse({ state: "duplicate_review", duplicateContactId: "contact:existing", candidate: { ...candidate, matchedOn: ["future_reason"] } });
  assert.equal(response.state, "duplicate_review");
  assert.deepEqual(response.state === "duplicate_review" ? response.candidate?.matchedOn : null, ["name_organization"]);
});

test("Web readers: the duplicates response and a confirm candidate are read tolerantly", () => {
  assert.equal(readIngestContactCandidate(null), null);
  assert.equal(readIngestContactCandidate({ contactId: "" }), null);
  assert.deepEqual(readIngestContactCandidate({ ...candidate, matchedOn: ["later"] })?.matchedOn, ["name_organization"]);
  const matches = readIngestDuplicateMatches({ matches: {
    "card:a": { ...candidate, matchedOn: ["name"] },
    "card:b": null,
    "card:c": { ...candidate, matchedOn: ["unknown"] },
    "card:d": { broken: true },
  } });
  assert.deepEqual(matches["card:a"]?.matchedOn, ["name"]);
  assert.equal(matches["card:b"], null);
  assert.deepEqual(matches["card:c"]?.matchedOn, ["name_organization"]);
  assert.equal(matches["card:d"], null, "an unreadable candidate reads as no candidate; the others are kept");
  assert.deepEqual(readIngestDuplicateMatches(null), {});
  assert.deepEqual(readIngestDuplicateMatches({ matches: "nope" }), {});
});
