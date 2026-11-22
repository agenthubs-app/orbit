/**
 * verifyCitations (agent-design AG05-3, PLANNER 易错边界 4): code checks every citation of the answer.
 *
 * - A cited handle must be a material of this request — a record read in this request, under the
 *   permissions of now (a record read in an earlier turn is not a material unless read again).
 * - Every cited sentence number must exist in that material.
 * - A segment of a part that reads records keeps only its valid citations; with none left it is
 *   dropped (no statement about the user's records without a source).
 * - A discussion part cites nothing.
 *
 * Whether the sentences really support the statement is the judgment model's question (AG08).
 */
import type { AnswerOutput, Material } from "./schema";

export interface VerifiedSegment {
  partId: string;
  text: string;
  cites: { ref: string; sentenceIds: number[] }[];
}

export interface Verification {
  segments: Map<string, VerifiedSegment>;
  /** What was wrong (told to the model in the one repair). */
  problems: string[];
  /** Wanted parts with no usable segment. */
  missing: string[];
}

export function verifyCitations(output: AnswerOutput, input: { materials: readonly Material[]; readParts: ReadonlySet<string>; wanted: ReadonlySet<string> }): Verification {
  const byHandle = new Map(input.materials.map((material) => [material.handle, material]));
  const segments = new Map<string, VerifiedSegment>();
  const problems: string[] = [];
  for (const segment of output.segments) {
    if (!input.wanted.has(segment.partId) || segments.has(segment.partId)) continue;
    if (!segment.text) {
      problems.push(`${segment.partId}: the text is empty`);
      continue;
    }
    const reads = input.readParts.has(segment.partId);
    if (!reads) {
      if (segment.cites.length) problems.push(`${segment.partId} is a discussion item and cites nothing; remove its cites`);
      segments.set(segment.partId, { cites: [], partId: segment.partId, text: segment.text });
      continue;
    }
    const cites: VerifiedSegment["cites"] = [];
    for (const cite of segment.cites) {
      const material = byHandle.get(cite.sourceRef);
      if (!material) {
        problems.push(`${segment.partId} cites "${cite.sourceRef}", which is not one of the materials given (${[...byHandle.keys()].join(", ") || "none"})`);
        continue;
      }
      const known = new Set(material.sentences.map((sentence) => sentence.id));
      const wrong = cite.sentenceIds.filter((id) => !known.has(id));
      if (!cite.sentenceIds.length) problems.push(`${segment.partId} cites ${cite.sourceRef} without sentence numbers`);
      if (wrong.length) problems.push(`${segment.partId} cites sentence ${wrong.join(", ")} of ${cite.sourceRef}, which has sentences 1–${material.sentences.length}`);
      const valid = cite.sentenceIds.filter((id) => known.has(id));
      if (!valid.length) continue;
      const existing = cites.find((item) => item.ref === material.ref);
      if (existing) existing.sentenceIds = [...new Set([...existing.sentenceIds, ...valid])].sort((left, right) => left - right);
      else cites.push({ ref: material.ref, sentenceIds: [...new Set(valid)].sort((left, right) => left - right) });
    }
    if (!cites.length) {
      problems.push(`${segment.partId} answers from the user's records but has no valid citation; cite the materials it relies on`);
      continue;
    }
    segments.set(segment.partId, { cites, partId: segment.partId, text: segment.text });
  }
  const missing = [...input.wanted].filter((id) => !segments.has(id));
  for (const id of missing) if (!problems.some((problem) => problem.startsWith(`${id} `) || problem.startsWith(`${id}:`))) problems.push(`no answer text for ${id}`);
  return { missing, problems, segments };
}
