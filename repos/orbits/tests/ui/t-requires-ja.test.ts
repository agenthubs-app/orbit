import assert from "node:assert/strict";
import test from "node:test";

import type { OrbitCopyTable } from "../../app/(app)/app/orbit-2026/copy/types";
import { pickCopy } from "../../app/(app)/app/orbit-2026/copy/types";
import { standardCopyFor } from "../../app/(app)/app/orbit-2026/copy/standard";

// R03 contract D (SC-R03-04): a Web copy table without Japanese does not type-check.
// The @ts-expect-error lines fail `npm run typecheck` the day `ja` becomes optional.
const ok = { save: { ja: "保存", zh: "保存", en: "Save", kind: "button" } } satisfies OrbitCopyTable;

// @ts-expect-error — ja is required
const missingJa: OrbitCopyTable = { save: { zh: "保存", en: "Save" } };

test("copy entries carry all three languages and pick by language", () => {
  assert.equal(pickCopy(ok.save, "ja"), "保存");
  assert.equal(pickCopy(ok.save, "en"), "Save");
  assert.ok(missingJa);
});

test("the Web reads the same standard wording as the App", () => {
  assert.equal(standardCopyFor("ja").nav.network, "人脈");
  assert.equal(standardCopyFor("zh").nav.network, "人脉");
  assert.equal(standardCopyFor("en").draftBoundary.notice, "Orbit won't send it\u00a0· You send it yourself");
});
