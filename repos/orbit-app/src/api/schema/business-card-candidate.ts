import { ingestContactCandidateSchema } from "./business-card-batch";
import type { IngestContactCandidateContract } from "../contract/business-card-batch";

// R12（DESIGN §4.1，复核 S1）：Web 名片批次（use-card-batch）读「可能是同一个联系人」候选的宽进读取函数。
// 候选 schema 在 business-card-batch.ts（命中理由 tolerantEnum，未知值读成 name_organization）。

/** 读取单个候选（确认接口 duplicate_review 带回的）：读不出时当作没有候选。 */
export function readIngestContactCandidate(value: unknown): IngestContactCandidateContract | null {
  const parsed = ingestContactCandidateSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

/** 读取 v2 `duplicates` 接口的 `{ matches }`：逐条读，读不出的那条当作没有候选，其余照常。 */
export function readIngestDuplicateMatches(value: unknown): Record<string, IngestContactCandidateContract | null> {
  const matches = value && typeof value === "object" && !Array.isArray(value) ? (value as { matches?: unknown }).matches : undefined;
  if (!matches || typeof matches !== "object" || Array.isArray(matches)) return {};
  const read: Record<string, IngestContactCandidateContract | null> = {};
  for (const [cardId, candidate] of Object.entries(matches as Record<string, unknown>)) read[cardId] = candidate === null ? null : readIngestContactCandidate(candidate);
  return read;
}
