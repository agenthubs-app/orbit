import { createHash } from "node:crypto";

export const PROFILE_CONTRACT_REPAIR_SCHEMA_VERSION = 1 as const;
export const PROFILE_CONTRACT_REPAIR_ID = "canonical-profile-empty-answer-v1" as const;

export interface ProfileContractRepairBlocker {
  code: string;
  eventId: string | null;
  message: string;
  targetToken: string | null;
}

export interface ProfileContractRepairEventEvidence {
  activationAuditFingerprint: string;
  configurationHeadRevision: number;
  configurationVersion: number;
  contentHash: string;
  eventId: string;
  eventRevision: number;
  eventVersion: number;
  inventoryCount: number;
  inventoryHash: string;
  profileEditDeadlineAt: string;
  sourceAuthority: "canonical";
}

export interface ProfileContractRepairInventoryRowFact {
  afterProfilePayloadHash: string | null;
  beforeProfilePayloadHash: string;
  candidateState: "candidate" | "unchanged";
  deletionPaths: readonly string[];
  eventId: string;
  lateRegistration: boolean;
  lifecycleHash: string;
  membershipHeadRevision: number;
  membershipStatus: "cancelled" | "rsvped";
  membershipVersion: number;
  profileHeadRevision: number;
  profileVersion: number;
  responsesHash: string;
  rowFingerprint: string;
  sourceAuthority: "canonical";
  targetToken: string;
}

export interface ProfileContractRepairTargetFact {
  afterProfilePayloadHash: string;
  beforeProfilePayloadHash: string;
  deletionPaths: readonly string[];
  eventId: string;
  lifecycleHash: string;
  membershipHeadRevision: number;
  membershipVersion: number;
  profileHeadRevision: number;
  profileVersion: number;
  responsesHash: string;
  sourceAuthority: "canonical";
  targetToken: string;
}

export interface ProfileContractRepairSource {
  blockers: readonly ProfileContractRepairBlocker[];
  events: readonly ProfileContractRepairEventEvidence[];
  inventory: readonly ProfileContractRepairInventoryRowFact[];
  targets: readonly ProfileContractRepairTargetFact[];
}

export interface ProfileContractRepairEventPlan
  extends ProfileContractRepairEventEvidence {
  blockers: readonly ProfileContractRepairBlocker[];
  targetCount: number;
  targetsHash: string;
}

export interface ProfileContractRepairPlan {
  applyEligible: boolean;
  applyPlanHash: string | null;
  blockers: readonly ProfileContractRepairBlocker[];
  diagnosticHash: string;
  eventCount: number;
  events: readonly ProfileContractRepairEventPlan[];
  repairId: typeof PROFILE_CONTRACT_REPAIR_ID;
  schemaVersion: typeof PROFILE_CONTRACT_REPAIR_SCHEMA_VERSION;
  targetCount: number;
  targets: readonly ProfileContractRepairTargetFact[];
}

export function compareUtf16CodeUnits(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

export function stableProfileRepairValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stableProfileRepairValue);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => compareUtf16CodeUnits(left, right))
      .map(([key, item]) => [key, stableProfileRepairValue(item)]),
  );
}

export function profileRepairInventoryRowFingerprint(
  value: Omit<ProfileContractRepairInventoryRowFact, "rowFingerprint">,
): string {
  return profileRepairHash(
    "canonical-profile-contract-repair:inventory-row:v1",
    value,
  );
}

export function profileRepairInventoryHash(
  values: readonly ProfileContractRepairInventoryRowFact[],
): string {
  const rows = [...values]
    .sort(
      (left, right) =>
        compareUtf16CodeUnits(left.eventId, right.eventId) ||
        compareUtf16CodeUnits(left.targetToken, right.targetToken),
    )
    .map((value) => ({
      rowFingerprint: value.rowFingerprint,
      targetToken: value.targetToken,
    }));
  return profileRepairHash(
    "canonical-profile-contract-repair:event-inventory:v1",
    rows,
  );
}

export function profileRepairHash(domain: string, value: unknown): string {
  return createHash("sha256")
    .update(`${domain}\0`)
    .update(JSON.stringify(stableProfileRepairValue(value)))
    .digest("hex");
}

export function profileRepairToken(domain: string, value: string): string {
  return `${domain}-sha256:${createHash("sha256")
    .update(`canonical-profile-contract-repair:${domain}\0${value}`)
    .digest("hex")}`;
}
