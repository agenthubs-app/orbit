import assert from "node:assert/strict";
import test from "node:test";

import { createAccountDesignFixtureStore } from "../../features/profile/design-fixtures/service";

test("design profile reads use the 25/50/100 card states and isolate actor revisions", () => {
  const store = createAccountDesignFixtureStore(() => "2026-10-18T00:00:00.000Z");
  assert.equal(store.read("actor:a", "25").data.completeness.card?.score, 25);
  assert.equal(store.read("actor:a", "50").data.completeness.card?.score, 50);
  assert.equal(store.read("actor:a", "100").data.completeness.card?.score, 100);

  const before = store.read("actor:a", "25").data.profile!;
  const saved = store.update("actor:a", "25", {
    expectedUpdatedAt: before.updatedAt,
    mutationId: "mutation-a-1",
    offering: ["工場 DX の導入支援"],
    publicFields: { companyRole: false, offeringSeeking: true, intro: false },
  });
  assert.equal(saved.success, true);
  if (!saved.success) return;
  assert.equal(saved.data.completeness.card?.score, 50);
  assert.deepEqual(saved.data.profile?.publicFields, { companyRole: false, offeringSeeking: true, intro: false });
  assert.ok(saved.data.profile!.updatedAt > before.updatedAt);
  assert.deepEqual(store.read("actor:a", "25").data.profile, saved.data.profile);
  assert.equal(store.read("actor:b", "25").data.completeness.card?.score, 25);
  assert.equal(store.read("actor:a", "50").data.completeness.card?.score, 50);
});

test("design saves enforce CAS, preserve omitted visibility, and reject invalid nested visibility", () => {
  const store = createAccountDesignFixtureStore(() => "2026-10-18T00:00:00.000Z");
  const initial = store.read("actor:a", "100").data.profile!;
  const first = store.update("actor:a", "100", {
    expectedUpdatedAt: initial.updatedAt, mutationId: "mutation-a-2",
    publicFields: { companyRole: true, offeringSeeking: false, intro: true },
  });
  assert.equal(first.success, true);
  if (!first.success) return;
  const replay = store.update("actor:a", "100", {
    expectedUpdatedAt: initial.updatedAt, mutationId: "mutation-a-2",
    publicFields: { companyRole: true, offeringSeeking: false, intro: true },
  });
  assert.deepEqual(replay, first);
  const conflict = store.update("actor:a", "100", {
    expectedUpdatedAt: initial.updatedAt, mutationId: "mutation-a-3", bio: "変更",
  });
  assert.equal(conflict.success, false);
  if (!conflict.success) assert.equal(conflict.error.code, "PROFILE_VERSION_CONFLICT");
  const invalid = store.update("actor:a", "100", {
    expectedUpdatedAt: first.data.profile!.updatedAt, mutationId: "mutation-a-4",
    publicFields: { companyRole: true, offeringSeeking: true, intro: true, extra: true },
  } as never);
  assert.equal(invalid.success, false);
  if (!invalid.success) assert.equal(invalid.error.code, "PROFILE_VALIDATION_FAILED");
  const later = store.update("actor:a", "100", {
    expectedUpdatedAt: first.data.profile!.updatedAt, mutationId: "mutation-a-5", bio: "自己紹介を更新しました",
  });
  assert.equal(later.success, true);
  if (later.success) assert.equal(later.data.profile?.publicFields?.offeringSeeking, false);
});
