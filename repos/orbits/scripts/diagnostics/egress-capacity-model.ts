import { readFileSync } from "node:fs";
import { z } from "zod";

const nonnegative = z.number().finite().nonnegative();
export const egressCapacityInputSchema = z.object({
  days: z.number().int().min(1).max(31),
  quotaBytes: z.number().finite().positive(),
  reserveFraction: z.number().min(0).max(1),
  fixedBackgroundBytesPerDay: nonnegative,
  oneOffMonthlyBytes: nonnegative,
  groups: z.array(z.object({
    name: z.string().min(1),
    dailyActiveUsers: nonnegative,
    foregroundSecondsPerDay: nonnegative.max(86400),
    pollIntervalSeconds: z.number().finite().positive(),
    pollDatabaseBytes: nonnegative,
    operations: z.array(z.object({ name: z.string(), countPerUserDay: nonnegative, databaseBytes: nonnegative })),
  })),
});
export type EgressCapacityInput = z.infer<typeof egressCapacityInputSchema>;

/** Planning estimate, not a Neon billing meter or a quota enforcement mechanism. */
export function projectMonthlyEgress(raw: unknown) {
  const input = egressCapacityInputSchema.parse(raw);
  const usableBudgetBytes = input.quotaBytes * (1 - input.reserveFraction);
  const fixedMonthlyBytes = input.fixedBackgroundBytesPerDay * input.days + input.oneOffMonthlyBytes;
  const groups = input.groups.map(group => {
    const pollsPerUserDay = Math.ceil(group.foregroundSecondsPerDay / group.pollIntervalSeconds);
    const pollingBytesPerUserDay = pollsPerUserDay * group.pollDatabaseBytes;
    const operationsBytesPerUserDay = group.operations.reduce((sum, op) => sum + op.countPerUserDay * op.databaseBytes, 0);
    const bytesPerUserDay = pollingBytesPerUserDay + operationsBytesPerUserDay;
    return { name: group.name, dailyActiveUsers: group.dailyActiveUsers, pollsPerUserDay,
      pollingBytesPerUserDay, operationsBytesPerUserDay, bytesPerUserDay,
      monthlyBytes: input.days * group.dailyActiveUsers * bytesPerUserDay };
  });
  const projectedMonthlyBytes = fixedMonthlyBytes + groups.reduce((sum, group) => sum + group.monthlyBytes, 0);
  if (!Number.isFinite(projectedMonthlyBytes)) throw new Error("Capacity calculation overflow");
  return { kind: "planning_estimate_not_provider_billing", usableBudgetBytes, fixedMonthlyBytes,
    projectedMonthlyBytes, remainingBudgetBytes: usableBudgetBytes - projectedMonthlyBytes,
    withinBudget: projectedMonthlyBytes <= usableBudgetBytes, groups };
}

if (process.argv[1]?.endsWith("/egress-capacity-model.ts")) {
  try {
    const file = process.argv.find(arg => arg.startsWith("--input="))?.slice("--input=".length);
    if (!file) throw new Error("Use --input=/absolute/path/capacity.json; database-returned bytes, not HTTP bytes");
    const result = projectMonthlyEgress(JSON.parse(readFileSync(file, "utf8")));
    console.log(JSON.stringify(result, null, 2));
    if (!result.withinBudget) process.exitCode = 2;
  } catch (error) { console.error(error instanceof Error ? error.message : "Invalid capacity input"); process.exitCode = 1; }
}
