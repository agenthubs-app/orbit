import assert from "node:assert/strict";
import test from "node:test";
import { projectMonthlyEgress } from "../../scripts/diagnostics/egress-capacity-model";

const input = { days: 30, quotaBytes: 5_000_000_000, reserveFraction: 0.3,
  fixedBackgroundBytesPerDay: 1_000_000, oneOffMonthlyBytes: 10_000_000,
  groups: [{ name: "legacy", dailyActiveUsers: 100, foregroundSecondsPerDay: 3600, pollIntervalSeconds: 15,
    pollDatabaseBytes: 1000, operations: [{ name: "open-list", countPerUserDay: 10, databaseBytes: 20000 }] }] };

test("capacity includes foreground idle polling, operations, background and one-off work", () => {
  const result = projectMonthlyEgress(input);
  assert.equal(result.usableBudgetBytes, 3_500_000_000);
  assert.equal(result.fixedMonthlyBytes, 40_000_000);
  assert.equal(result.groups[0]?.pollsPerUserDay, 240);
  assert.equal(result.projectedMonthlyBytes, 1_360_000_000);
  assert.equal(result.withinBudget, true);
  assert.equal(projectMonthlyEgress({ ...input, groups: [{ ...input.groups[0], dailyActiveUsers: 1000 }] }).withinBudget, false);
});
test("no foreground still consumes configured background and explicit operation budget", () => {
  const result = projectMonthlyEgress({ ...input, groups: [{ ...input.groups[0], foregroundSecondsPerDay: 0 }] });
  assert.equal(result.projectedMonthlyBytes, 640_000_000);
});
test("invalid rates cannot produce a misleading passing capacity result", () => {
  assert.throws(() => projectMonthlyEgress({ ...input, groups: [{ ...input.groups[0], pollIntervalSeconds: 0 }] }));
  assert.throws(() => projectMonthlyEgress({ ...input, fixedBackgroundBytesPerDay: -1 }));
  assert.throws(() => projectMonthlyEgress({ ...input, quotaBytes: Infinity }));
});
