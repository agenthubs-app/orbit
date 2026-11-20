/**
 * The answer step's output (设计稿附录 C `AnswerOutput`; agent-design AG05). The model writes segments
 * and cites material handles (s1, s2 …) with sentence numbers; code maps the handles back to record refs
 * and checks every citation (verify.ts). Gaps are decided by code from what the reads returned — a
 * model's gaps are never taken.
 */
import { parseModelJson } from "../understand/validate";
import { composeStructured } from "./blocks";
import type { Sentence } from "../text/sentences";
import type { RecordView } from "../domains/types";

export type GapReason = "no_record" | "partial" | "unreadable" | "conflict" | "service_error" | "budget";

export interface AnswerCite {
  sourceRef: string;
  sentenceIds: number[];
}

export interface AnswerSegment {
  partId: string;
  text: string;
  cites: AnswerCite[];
  /** run-03 repair 1: the model's profile-check entries as given (profile-check.ts verifies them); absent when not given. */
  profile?: unknown[];
  /** AG07 repair 2: the model's change-check entries as given (change-check.ts verifies them); absent when not given. */
  changes?: unknown[];
}

export interface AnswerOutput {
  segments: AnswerSegment[];
  gaps: { partId: string; reason: GapReason }[];
}

/** One record given to the answer step: a short handle, the ref it stands for, code's header line, the sentences. */
export interface Material {
  handle: string;
  ref: string;
  partId: string;
  /** AG09: "web" for a public web page fetched in this request (graph/nodes/probe.ts). */
  kind: RecordView["kind"] | "web";
  header: string;
  sentences: Sentence[];
  version: string;
  /** run-03 repair 1: when the record is dated (a note's interaction or writing time, a to-do's update). */
  at?: string | null;
  /** run-03 repair 1: a contact profile's own values, for the profile check. */
  profile?: { organization: string | null; role: string | null; updatedAt: string | null };
}

export function parseAnswerOutput(text: string, language: "zh" | "ja" | "en" = "zh"): { ok: true; value: AnswerOutput } | { ok: false; error: string } {
  const parsed = parseModelJson(text);
  if (parsed.ok === false) return parsed;
  const raw = parsed.value as { segments?: unknown } | null;
  if (!raw || !Array.isArray(raw.segments)) return { error: "segments must be a list", ok: false };
  const segments: AnswerSegment[] = [];
  for (const segment of raw.segments as Record<string, unknown>[]) {
    if (!segment || typeof segment !== "object") continue;
    const cites: AnswerCite[] = [];
    for (const cite of Array.isArray(segment.cites) ? (segment.cites as Record<string, unknown>[]) : []) {
      if (!cite || typeof cite.sourceRef !== "string") continue;
      const ids = Array.isArray(cite.sentenceIds) ? cite.sentenceIds.map(Number).filter((id) => Number.isInteger(id)) : [];
      cites.push({ sentenceIds: ids, sourceRef: cite.sourceRef.trim() });
    }
    // AG19 (D4): the structured fields (lead, body) become the text version in code's line convention; an answer given
    // as one text is kept whole, its Markdown symbols taken out.
    segments.push({ cites, partId: typeof segment.partId === "string" ? segment.partId : "", text: composeStructured(segment, language) ?? "", ...(Array.isArray(segment.profile) ? { profile: segment.profile as unknown[] } : {}), ...(Array.isArray(segment.changes) ? { changes: segment.changes as unknown[] } : {}) });
  }
  return { ok: true, value: { gaps: [], segments } };
}
