import {
  EVENT_PARTICIPANT_PROFILE_FIELDS,
  type EventParticipantProfileField,
} from "../contract";
import { compareUtf16CodeUnits } from "./contract";

export const PROFILE_CONTRACT_REPAIR_LEDGER_SCHEMA_VERSION = 1 as const;
export const PROFILE_CONTRACT_REPAIR_TYPE =
  "canonical_profile_empty_answer_v1" as const;

export type ProfileContractRepairRemovedPath =
  | `participant.profileAnswers.${EventParticipantProfileField}`
  | `registrationProfile.answers.${EventParticipantProfileField}`;

export const PROFILE_CONTRACT_REPAIR_REMOVED_PATHS = Object.freeze(
  EVENT_PARTICIPANT_PROFILE_FIELDS.flatMap((field) => [
    `participant.profileAnswers.${field}` as const,
    `registrationProfile.answers.${field}` as const,
  ]).sort(compareUtf16CodeUnits),
) satisfies readonly ProfileContractRepairRemovedPath[];

export interface ProfileContractRepairLedgerRun {
  /** Operator-assigned run identity; this is not the planner algorithm id. */
  repairId: string;
  repairType: typeof PROFILE_CONTRACT_REPAIR_TYPE;
  schemaVersion: typeof PROFILE_CONTRACT_REPAIR_LEDGER_SCHEMA_VERSION;
  workspaceId: string;
  planHash: string;
  expectedCount: number;
  resultHash: string;
  appliedAt: string;
  revertedAt: string | null;
  createdAt: string;
}

export interface ProfileContractRepairLedgerItem {
  workspaceId: string;
  repairId: string;
  eventId: string;
  actorId: string;
  participantId: string;
  sourceProfileVersion: number;
  targetProfileVersion: number;
  sourceMembershipVersion: number;
  targetMembershipVersion: number;
  beforeProfileHash: string;
  afterProfileHash: string;
  beforeMembershipHash: string;
  afterMembershipHash: string;
  removedPaths: readonly ProfileContractRepairRemovedPath[];
  createdAt: string;
}
