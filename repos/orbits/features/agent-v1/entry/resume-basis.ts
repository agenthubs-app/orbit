import type { AgentAnswerBasisContract, AgentPartResult, AgentResultDocument } from "../../../shared/contract/agent-v1";

/**
 * agent-design AG07 repair 2 (AE-XL-003, AE-XL-002): a click resumes a paused request without reading again, so
 * the resumed run has no read material to write a basis line from. The answer it delivers still carries the read
 * part answered before the pause; that answer rests on the same records, so their basis line and sourceRefs stay.
 * A resume that wrote its own basis keeps its own; when the read part is no longer answered, nothing is carried.
 */
export function keepEarlierBasis(
  previous: Pick<AgentResultDocument, "answer" | "partResults"> | null,
  resumed: { basis: AgentAnswerBasisContract | null; partResults: readonly AgentPartResult[]; sourceRefs: readonly string[] },
): { basis: AgentAnswerBasisContract | null; sourceRefs: readonly string[] } {
  if (resumed.basis || !previous?.answer?.basis) return { basis: resumed.basis, sourceRefs: resumed.sourceRefs };
  const answeredBefore = new Set(previous.partResults.filter((part) => part.route === "read" && part.status === "answered").map((part) => part.partId));
  const stillAnswered = resumed.partResults.some((part) => answeredBefore.has(part.partId) && part.status === "answered");
  if (!stillAnswered) return { basis: resumed.basis, sourceRefs: resumed.sourceRefs };
  return { basis: previous.answer.basis, sourceRefs: [...new Set([...previous.answer.sourceRefs, ...resumed.sourceRefs])] };
}
