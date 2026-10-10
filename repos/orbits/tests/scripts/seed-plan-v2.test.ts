import assert from "node:assert/strict";
import test from "node:test";

import { assertSeedTarget, seedDraft } from "../../scripts/seed-plan-v2";
import { validateAllocations } from "../../shared/compute/plan-allocation";

// R22 SC-R22-08：种子脚本只写本机测试库，造的方案本身合规（配点合计 100）。
test("seed-plan-v2 refuses anything but a loopback test database", () => {
  assert.doesNotThrow(() => assertSeedTarget("postgres://localhost/orbit_test", {}));
  assert.doesNotThrow(() => assertSeedTarget("postgres://127.0.0.1:5432/orbit_w5_test", {}));
  assert.throws(() => assertSeedTarget("postgres://db.example.neon.tech/orbit", {}), /loopback/);
  assert.throws(() => assertSeedTarget("postgres://localhost/orbit_prod_copy", {}), /production or staging/);
  assert.throws(() => assertSeedTarget("postgres://localhost/orbit_staging_20260917", {}), /production or staging/);
  assert.throws(() => assertSeedTarget("postgres://localhost/orbit_test", { VERCEL_ENV: "production" }), /never runs in production/);
});

test("the seed draft is a valid plan (allocations in steps of 5, total 100)", () => {
  const draft = seedDraft("g");
  const slots = [
    ...draft.content.personTypes.map((type, index) => ({ allocation: type.allocation, earnedBase: 0, key: type.key, metCount: 0, skipped: false, targetCount: type.targetCount, templateIndex: index })),
    { allocation: draft.content.event.allocation, earnedBase: 0, isEvent: true, key: "event", metCount: 0, skipped: false, targetCount: draft.content.event.targetCount, templateIndex: 99 },
  ];
  assert.equal(validateAllocations(slots).ok, true);
});
