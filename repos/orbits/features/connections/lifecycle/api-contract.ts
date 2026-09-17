import type { ContractMatches } from "../../../shared/contract-check";
import type { RelationshipLifecycleSnapshot, RelationshipTaskClosingOutcome } from "./contract";
import type { RelationshipLifecycleSnapshotDTO, RelationshipCompletionOutcome } from "../../../shared/contract/relationship-lifecycle";
export type { RelationshipLifecycleSnapshotDTO, RelationshipCompletionInput, RelationshipTaskSummary } from "../../../shared/contract/relationship-lifecycle";
export const lifecycleSnapshotContractMatches: ContractMatches<RelationshipLifecycleSnapshot, RelationshipLifecycleSnapshotDTO> = true;
export const lifecycleOutcomeContractMatches: ContractMatches<RelationshipTaskClosingOutcome, RelationshipCompletionOutcome> = true;
