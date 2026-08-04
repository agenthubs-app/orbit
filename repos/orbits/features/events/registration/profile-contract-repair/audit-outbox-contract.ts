import {
  PROFILE_CONTRACT_REPAIR_LEDGER_SCHEMA_VERSION,
  PROFILE_CONTRACT_REPAIR_REMOVED_PATHS,
  PROFILE_CONTRACT_REPAIR_TYPE,
  type ProfileContractRepairRemovedPath,
} from "./ledger-contract";

export const PROFILE_CONTRACT_REPAIR_EVENT_TYPE =
  "event.registration.profile_contract_repaired" as const;
export const PROFILE_CONTRACT_REPAIR_AUDIT_ACTION =
  PROFILE_CONTRACT_REPAIR_EVENT_TYPE;

export interface ProfileContractRepairAuditOutboxPayload {
  activationAuditFingerprint: string;
  afterMembershipHash: string;
  afterProfileHash: string;
  beforeMembershipHash: string;
  beforeProfileHash: string;
  configurationVersion: number;
  eventContentHash: string;
  eventId: string;
  eventVersion: number;
  occurredAt: string;
  planHash: string;
  preservedStatus: "cancelled" | "rsvped";
  profileEditDeadlineAt: string;
  removedPaths: readonly ProfileContractRepairRemovedPath[];
  repairId: string;
  repairType: typeof PROFILE_CONTRACT_REPAIR_TYPE;
  schemaVersion: typeof PROFILE_CONTRACT_REPAIR_LEDGER_SCHEMA_VERSION;
  sourceMembershipVersion: number;
  sourceProfileVersion: number;
  targetMembershipVersion: number;
  targetProfileVersion: number;
  targetToken: string;
}

export type ProfileContractRepairAuditOutboxParseResult =
  | {
      ok: true;
      value: ProfileContractRepairAuditOutboxPayload;
    }
  | {
      code: "EVENT_OPERATIONS_PROFILE_REPAIR_PAYLOAD_INVALID";
      message: "The profile repair outbox payload is invalid.";
      ok: false;
    };

const INVALID_RESULT = Object.freeze({
  code: "EVENT_OPERATIONS_PROFILE_REPAIR_PAYLOAD_INVALID" as const,
  message: "The profile repair outbox payload is invalid." as const,
  ok: false as const,
});
const HASH_PATTERN = /^[0-9a-f]{64}$/;
const OPERATOR_RUN_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,199}$/;
const CANONICAL_EVENT_ID_PATTERN = /^[\p{L}\p{M}\p{N}\p{S}._:-]+$/u;
const TARGET_TOKEN_PATTERN = /^profile-target-sha256:[0-9a-f]{64}$/;
const CANONICAL_TIMESTAMP_PATTERN =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;
const EXPECTED_KEYS = Object.freeze([
  "activationAuditFingerprint",
  "afterMembershipHash",
  "afterProfileHash",
  "beforeMembershipHash",
  "beforeProfileHash",
  "configurationVersion",
  "eventContentHash",
  "eventId",
  "eventVersion",
  "occurredAt",
  "planHash",
  "preservedStatus",
  "profileEditDeadlineAt",
  "removedPaths",
  "repairId",
  "repairType",
  "schemaVersion",
  "sourceMembershipVersion",
  "sourceProfileVersion",
  "targetMembershipVersion",
  "targetProfileVersion",
  "targetToken",
].sort());
const REMOVED_PATHS = new Set<string>(PROFILE_CONTRACT_REPAIR_REMOVED_PATHS);

function isPlainRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function exactDataSnapshot(
  value: Readonly<Record<string, unknown>>,
): Readonly<Record<string, unknown>> | null {
  const keys = Reflect.ownKeys(value);
  if (
    keys.length !== EXPECTED_KEYS.length ||
    keys.some((key) => typeof key !== "string") ||
    (keys as string[])
      .sort()
      .some((key, index) => key !== EXPECTED_KEYS[index])
  ) {
    return null;
  }
  const snapshot: Record<string, unknown> = Object.create(null);
  for (const key of EXPECTED_KEYS) {
    const descriptor = Reflect.getOwnPropertyDescriptor(value, key);
    if (!descriptor || !("value" in descriptor) || !descriptor.enumerable) {
      return null;
    }
    snapshot[key] = descriptor.value;
  }
  return snapshot;
}

function isPositiveSafeInteger(value: unknown): value is number {
  return Number.isSafeInteger(value) && Number(value) > 0;
}

function isCanonicalTimestamp(value: unknown): value is string {
  if (typeof value !== "string" || !CANONICAL_TIMESTAMP_PATTERN.test(value)) {
    return false;
  }
  const parsed = new Date(value);
  return Number.isFinite(parsed.valueOf()) && parsed.toISOString() === value;
}

function isCanonicalEventId(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.length > 0 &&
    value.length <= 200 &&
    value.normalize("NFC") === value &&
    CANONICAL_EVENT_ID_PATTERN.test(value)
  );
}

function arrayDataSnapshot(value: unknown): readonly unknown[] | null {
  if (!Array.isArray(value)) return null;
  const keys = Reflect.ownKeys(value);
  const lengthDescriptor = Reflect.getOwnPropertyDescriptor(value, "length");
  if (
    !lengthDescriptor ||
    !("value" in lengthDescriptor) ||
    !Number.isSafeInteger(lengthDescriptor.value) ||
    lengthDescriptor.value < 0
  ) {
    return null;
  }
  const length = lengthDescriptor.value as number;
  if (
    keys.length !== length + 1 ||
    !keys.includes("length") ||
    Array.from({ length }, (_, index) => String(index)).some(
      (key) => !keys.includes(key),
    )
  ) {
    return null;
  }
  const snapshot: unknown[] = [];
  for (let index = 0; index < length; index += 1) {
    const descriptor = Reflect.getOwnPropertyDescriptor(value, String(index));
    if (!descriptor || !("value" in descriptor) || !descriptor.enumerable) {
      return null;
    }
    snapshot.push(descriptor.value);
  }
  return snapshot;
}

function areRemovedPathsValid(
  value: unknown,
): readonly ProfileContractRepairRemovedPath[] | null {
  const snapshot = arrayDataSnapshot(value);
  if (!snapshot || snapshot.length === 0) return null;
  if (
    snapshot.some(
      (path) => typeof path !== "string" || !REMOVED_PATHS.has(path),
    )
  ) {
    return null;
  }
  const paths = snapshot as ProfileContractRepairRemovedPath[];
  if (new Set(paths).size !== paths.length) return null;
  if (paths.some((path, index) => index > 0 && paths[index - 1]! >= path)) {
    return null;
  }
  const selected = new Set<string>(paths);
  if (!paths.every(
    (path) =>
      !path.startsWith("participant.profileAnswers.") ||
      selected.has(
        path.replace(
          "participant.profileAnswers.",
          "registrationProfile.answers.",
        ),
      ),
  )) {
    return null;
  }
  return Object.freeze([...paths]);
}

export function parseProfileContractRepairAuditOutboxPayload(
  input: unknown,
): ProfileContractRepairAuditOutboxParseResult {
  try {
    if (!isPlainRecord(input)) return INVALID_RESULT;
    const value = exactDataSnapshot(input);
    if (!value) return INVALID_RESULT;

    const sourceProfileVersion = value.sourceProfileVersion;
    const targetProfileVersion = value.targetProfileVersion;
    const sourceMembershipVersion = value.sourceMembershipVersion;
    const targetMembershipVersion = value.targetMembershipVersion;
    const hashes = [
      value.activationAuditFingerprint,
      value.afterMembershipHash,
      value.afterProfileHash,
      value.beforeMembershipHash,
      value.beforeProfileHash,
      value.eventContentHash,
      value.planHash,
    ];
    const removedPaths = areRemovedPathsValid(value.removedPaths);

    if (
      value.schemaVersion !== PROFILE_CONTRACT_REPAIR_LEDGER_SCHEMA_VERSION ||
      value.repairType !== PROFILE_CONTRACT_REPAIR_TYPE ||
      typeof value.repairId !== "string" ||
      !OPERATOR_RUN_ID_PATTERN.test(value.repairId) ||
      !isCanonicalEventId(value.eventId) ||
      typeof value.targetToken !== "string" ||
      !TARGET_TOKEN_PATTERN.test(value.targetToken) ||
      hashes.some((hash) => typeof hash !== "string" || !HASH_PATTERN.test(hash)) ||
      !isPositiveSafeInteger(value.eventVersion) ||
      !isPositiveSafeInteger(value.configurationVersion) ||
      !isPositiveSafeInteger(sourceProfileVersion) ||
      !isPositiveSafeInteger(targetProfileVersion) ||
      targetProfileVersion !== sourceProfileVersion + 1 ||
      !isPositiveSafeInteger(sourceMembershipVersion) ||
      !isPositiveSafeInteger(targetMembershipVersion) ||
      targetMembershipVersion !== sourceMembershipVersion + 1 ||
      value.beforeProfileHash === value.afterProfileHash ||
      value.beforeMembershipHash === value.afterMembershipHash ||
      (value.preservedStatus !== "cancelled" && value.preservedStatus !== "rsvped") ||
      !isCanonicalTimestamp(value.profileEditDeadlineAt) ||
      !isCanonicalTimestamp(value.occurredAt) ||
      !removedPaths
    ) {
      return INVALID_RESULT;
    }

    const parsed = Object.freeze({
      activationAuditFingerprint: value.activationAuditFingerprint,
      afterMembershipHash: value.afterMembershipHash,
      afterProfileHash: value.afterProfileHash,
      beforeMembershipHash: value.beforeMembershipHash,
      beforeProfileHash: value.beforeProfileHash,
      configurationVersion: value.configurationVersion,
      eventContentHash: value.eventContentHash,
      eventId: value.eventId,
      eventVersion: value.eventVersion,
      occurredAt: value.occurredAt,
      planHash: value.planHash,
      preservedStatus: value.preservedStatus,
      profileEditDeadlineAt: value.profileEditDeadlineAt,
      removedPaths,
      repairId: value.repairId,
      repairType: value.repairType,
      schemaVersion: value.schemaVersion,
      sourceMembershipVersion,
      sourceProfileVersion,
      targetMembershipVersion,
      targetProfileVersion,
      targetToken: value.targetToken,
    }) as ProfileContractRepairAuditOutboxPayload;
    return Object.freeze({ ok: true as const, value: parsed });
  } catch {
    return INVALID_RESULT;
  }
}
