import type { ContactPipelineStageCode } from "../contract/contact-pipeline-page";

const stageDecisions = [
  ["captured", "to_contact"],
  ["needs_follow_up", "to_contact"],
  ["reviewing", "in_progress"],
  ["active", "in_progress"],
  ["nurture", "nurture"],
  ["archived", "archived"],
] as const satisfies readonly (readonly [string, ContactPipelineStageCode])[];

const stagesByRelationshipStatus = new Map<string, ContactPipelineStageCode>(stageDecisions);

/** The shared stage decision used by the bounded server projection and the device mirror. */
export function contactPipelineStageFor(status: string | null | undefined): ContactPipelineStageCode | null {
  return status == null ? null : stagesByRelationshipStatus.get(status) ?? null;
}

/** A SQL expression for the server's already-bounded, actor-owned projection. */
export function contactPipelineStageCase(expression: string): string {
  const cases = stageDecisions.map(([status, stage]) => `when '${status}' then '${stage}'`).join("\n      ");
  return `case ${expression}\n      ${cases}\n    end`;
}
