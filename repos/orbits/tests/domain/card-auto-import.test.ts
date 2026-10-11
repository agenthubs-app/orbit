import assert from "node:assert/strict";
import test from "node:test";

import {
  decideCardAutoAction,
  isCardAutoImportEligible,
  isCardAutoMergeEligible,
  type CardAutoActionInput,
  type CardAutoImportFacts,
} from "../../shared/compute/card-auto-import";

// R12（DESIGN §2.2 第 5 步、§9 #5 #9）：两端共用的「读完自动进人脈」规则。用例与 Web 现有
// tests/pages/app-card-batch-model.test.ts、app-card-batch-event-attribution.test.tsx 一一对应。
const clean: CardAutoImportFacts = {
  reviewable: true, allExtracted: true, allConfirmed: false, invalidStructure: false, hasMissingImageDigest: false,
  hasTerminalFailure: false, issueCount: 0, conflictedFieldCount: 0, staleFieldCount: 0, enrichmentNeedsReview: false, displayName: "山田 太郎",
};

const importCases: readonly [string, Partial<CardAutoImportFacts>, boolean][] = [
  ["clean, fully extracted card with a name", {}, true],
  ["any review issue (e.g. NATIVE_ROMANIZED_NAME_CONFLICT)", { issueCount: 1 }, false],
  ["still being recognized", { allExtracted: false }, false],
  ["recognition failed", { hasTerminalFailure: true, allExtracted: false }, false],
  ["not reviewable", { reviewable: false }, false],
  ["already confirmed", { allConfirmed: true }, false],
  ["invalid two-sided structure", { invalidStructure: true }, false],
  ["missing image digest", { hasMissingImageDigest: true }, false],
  ["sides disagree on a field", { conflictedFieldCount: 1 }, false],
  ["stale field source", { staleFieldCount: 1 }, false],
  ["industry / seniority / region sides disagree (W0045)", { enrichmentNeedsReview: true }, false],
  ["no name", { displayName: "" }, false],
  ["whitespace-only name", { displayName: "  　 ".replace("　", " ") }, false],
];

for (const [name, change, expected] of importCases) {
  test(`auto-import: ${name} → ${expected}`, () => {
    assert.equal(isCardAutoImportEligible({ ...clean, ...change }), expected);
  });
}

const mergeCases: readonly [string, Partial<CardAutoImportFacts>, boolean][] = [
  ["clean card", {}, true],
  ["review issues do not block a merge with an identical contact", { issueCount: 3 }, true],
  ["no name in the draft does not block (the contact's fields match)", { displayName: "" }, true],
  ["still being recognized", { allExtracted: false }, false],
  ["recognition failed", { hasTerminalFailure: true }, false],
  ["sides disagree on a field", { conflictedFieldCount: 2 }, false],
  ["industry sides disagree", { enrichmentNeedsReview: true }, false],
];

for (const [name, change, expected] of mergeCases) {
  test(`auto-merge: ${name} → ${expected}`, () => {
    assert.equal(isCardAutoMergeEligible({ ...clean, ...change }), expected);
  });
}

const base: CardAutoActionInput = { ...clean, hasEventCandidate: false, candidate: null, skipped: false };
const decideCases: readonly [string, Partial<CardAutoActionInput>, ReturnType<typeof decideCardAutoAction>][] = [
  ["clean card without candidate", {}, "import"],
  ["W0015: a card with an event-attribution candidate stays for the user", { hasEventCandidate: true }, "review"],
  ["W0015 wins over an identical contact", { hasEventCandidate: true, candidate: { identical: true } }, "review"],
  ["identical contact → merge", { candidate: { identical: true } }, "merge"],
  ["identical contact with review issues → still merge", { candidate: { identical: true }, issueCount: 2 }, "merge"],
  ["identical contact but sides disagree → review", { candidate: { identical: true }, conflictedFieldCount: 1 }, "review"],
  ["similar contact (not identical) → review", { candidate: { identical: false } }, "review"],
  ["same-name candidate (identical is always false) → review", { candidate: { identical: false }, displayName: "山田 太郎" }, "review"],
  ["skipped card", { skipped: true }, "review"],
  ["already confirmed", { allConfirmed: true }, "review"],
  ["not reviewable", { reviewable: false }, "review"],
  ["flagged card without candidate", { issueCount: 1 }, "review"],
  ["no name without candidate", { displayName: "" }, "review"],
  // R12 复核 m9：查重没成功的卡（不知道有没有同名 / 相似的人）一律留给用户。
  ["duplicate lookup failed → review even when clean", { candidateLookupFailed: true }, "review"],
  ["duplicate lookup failed wins over an identical candidate", { candidateLookupFailed: true, candidate: { identical: true } }, "review"],
  ["lookup explicitly succeeded", { candidateLookupFailed: false }, "import"],
];

for (const [name, change, expected] of decideCases) {
  test(`decide: ${name} → ${expected}`, () => {
    assert.equal(decideCardAutoAction({ ...base, ...change }), expected);
  });
}
