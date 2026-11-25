import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { test } from "node:test";

import { legalCopy } from "../app/(app)/app/orbit-2026/copy/legal";
import { LEGAL_VERSIONS, PUBLISHED_PRIVACY_VERSIONS, PUBLISHED_TERMS_VERSIONS, isPublishedLegalConsent } from "../shared/compute/legal-version";

// 每个版本对应的正文哈希：正文改了而没加新版本，这里会失败。加版本时把新哈希补在这里（旧的不删）。
const TEXT: Record<"terms" | "privacy", Record<string, string>> = {
  terms: { "2026-11-25": "eed5df722de9d3d9" },
  privacy: { "2026-11-25": "96fd37d838842854" },
};
const digest = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex").slice(0, 16);

test("公开的条款正文与版本号对得上", () => {
  assert.equal(digest(legalCopy.terms), TEXT.terms[LEGAL_VERSIONS.terms]);
  assert.equal(digest(legalCopy.privacy), TEXT.privacy[LEGAL_VERSIONS.privacy]);
  for (const version of PUBLISHED_TERMS_VERSIONS) assert.ok(TEXT.terms[version]);
  for (const version of PUBLISHED_PRIVACY_VERSIONS) assert.ok(TEXT.privacy[version]);
});

test("只认发布过的版本", () => {
  assert.equal(isPublishedLegalConsent(LEGAL_VERSIONS.terms, LEGAL_VERSIONS.privacy), true);
  assert.equal(isPublishedLegalConsent("2020-01-01", LEGAL_VERSIONS.privacy), false);
  assert.equal(isPublishedLegalConsent(undefined, LEGAL_VERSIONS.privacy), false);
});
