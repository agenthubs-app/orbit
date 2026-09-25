import type { ContractMatches } from "../../shared/contract-check";
import type { ContactPipelineStageCode } from "../../shared/contract/contact-pipeline-page";

export const CONTACT_PIPELINE_STAGES = ["to_contact", "in_progress", "nurture", "archived"] as const;
export type ContactPipelineStage = (typeof CONTACT_PIPELINE_STAGES)[number];
export type ContactPipelineStageMatchesContract = ContractMatches<ContactPipelineStage, ContactPipelineStageCode>;
