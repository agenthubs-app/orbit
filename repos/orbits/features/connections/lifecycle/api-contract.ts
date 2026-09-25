import type { ContractMatches } from "../../../shared/contract-check";
import type { z } from "zod";
import type { relationshipTaskPageSchema } from "../../../shared/api-schema/relationship-lifecycle";
import type { RelationshipLifecycleSnapshot, RelationshipTaskClosingOutcome } from "./contract";
import type { RelationshipLifecycleSnapshotDTO, RelationshipCompletionOutcome, RelationshipTaskPageDTO } from "../../../shared/contract/relationship-lifecycle";
export type { RelationshipLifecycleSnapshotDTO, RelationshipCompletionInput, RelationshipTaskSummary, RelationshipTaskPageDTO } from "../../../shared/contract/relationship-lifecycle";
export const lifecycleSnapshotContractMatches: ContractMatches<RelationshipLifecycleSnapshot, RelationshipLifecycleSnapshotDTO> = true;
export const lifecycleOutcomeContractMatches: ContractMatches<RelationshipTaskClosingOutcome, RelationshipCompletionOutcome> = true;
export const lifecycleTaskPageContractMatches: ContractMatches<z.infer<typeof relationshipTaskPageSchema>, RelationshipTaskPageDTO> = true;
