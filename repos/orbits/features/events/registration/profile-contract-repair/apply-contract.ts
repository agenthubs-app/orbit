export interface ApplyProfileContractRepairCommand {
  connectionString: string;
  expectedCount: number;
  expectedPlanHash: string;
  repairId: string;
  workspaceId: string;
}

export interface ApplyProfileContractRepairResult {
  count: number;
  planHash: string;
  resultHash: string;
  status: "already_applied" | "applied";
}

export class ProfileContractRepairApplyError extends Error {
  constructor(readonly code: string) {
    super("Canonical profile contract repair could not be applied.");
    this.name = "ProfileContractRepairApplyError";
  }
}

const KEYS = [
  "connectionString",
  "expectedCount",
  "expectedPlanHash",
  "repairId",
  "workspaceId",
] as const;
const HASH = /^[0-9a-f]{64}$/u;
const REPAIR_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,199}$/u;

export function parseApplyProfileContractRepairCommand(
  input: unknown,
): ApplyProfileContractRepairCommand {
  try {
    if (!input || typeof input !== "object" || Array.isArray(input)) throw 0;
    const prototype = Object.getPrototypeOf(input);
    if (prototype !== Object.prototype && prototype !== null) throw 0;
    const keys = Reflect.ownKeys(input);
    if (
      keys.length !== KEYS.length ||
      keys.some((key) => typeof key !== "string" || !KEYS.includes(key as never))
    ) throw 0;
    const record = input as Record<string, unknown>;
    const values: Record<string, unknown> = Object.create(null);
    for (const key of KEYS) {
      const descriptor = Reflect.getOwnPropertyDescriptor(record, key);
      if (!descriptor || !("value" in descriptor) || !descriptor.enumerable) throw 0;
      values[key] = descriptor.value;
    }
    if (
      typeof values.connectionString !== "string" ||
      values.connectionString.length === 0 ||
      values.connectionString.trim() !== values.connectionString ||
      typeof values.workspaceId !== "string" ||
      values.workspaceId.length === 0 ||
      values.workspaceId.length > 200 ||
      values.workspaceId.trim() !== values.workspaceId ||
      typeof values.repairId !== "string" ||
      !REPAIR_ID.test(values.repairId) ||
      !Number.isSafeInteger(values.expectedCount) ||
      Number(values.expectedCount) <= 0 ||
      typeof values.expectedPlanHash !== "string" ||
      !HASH.test(values.expectedPlanHash)
    ) throw 0;
    return Object.freeze({
      connectionString: values.connectionString,
      expectedCount: values.expectedCount,
      expectedPlanHash: values.expectedPlanHash,
      repairId: values.repairId,
      workspaceId: values.workspaceId,
    }) as ApplyProfileContractRepairCommand;
  } catch {
    throw new ProfileContractRepairApplyError("PROFILE_CONTRACT_REPAIR_COMMAND_INVALID");
  }
}
