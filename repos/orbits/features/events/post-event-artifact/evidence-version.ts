import { createHash } from "node:crypto";

import type { AttendeePostEventEvidenceSnapshot } from "./task-repository";

export function postEventEvidenceHash(
  evidenceSnapshot: readonly AttendeePostEventEvidenceSnapshot[],
  evidenceWhitelist: readonly string[],
): string {
  const canonicalEvidence = [...evidenceSnapshot]
    .map((evidence) => ({
      ...evidence,
      commitments: [...evidence.commitments],
    }))
    .sort((left, right) => left.evidenceId.localeCompare(right.evidenceId));
  return createHash("sha256")
    .update(JSON.stringify({
      evidenceSnapshot: canonicalEvidence,
      evidenceWhitelist: [...new Set(evidenceWhitelist)].sort(),
    }))
    .digest("hex");
}
