export type AttendeePostEventAiArtifactStatus =
  | "queued"
  | "running"
  | "ready"
  | "failed"
  | "unconfigured";

export interface AttendeePostEventAiArtifact {
  evidenceHash: string;
  evidenceIds: readonly string[];
  generatedAt: string;
  messageDraft: string | null;
  model: string;
  provider: string;
  promptVersion: number;
  summary: string;
  version: number;
  /** R27 E3（prompt v3+）：会後まとめ 3 条（每条带依据）。旧版本没有这两项，读取方按缺省处理。 */
  highlights?: readonly AttendeePostEventHighlight[];
  /** R27 E3：逐人的次の一手（attendeeId 已从别名换回；类型建议只会是计划人物类型字典里的 key）。 */
  nextSteps?: readonly AttendeePostEventNextStep[];
}

export interface AttendeePostEventHighlight {
  emoji: string;
  title: string;
  detail: string;
  evidence: string;
}

export interface AttendeePostEventNextStep {
  attendeeId: string;
  followupDate: string;
  thanksDraft: { subject: string; body: string };
  planTypeSuggestion?: string | null;
}

export interface AttendeePostEventAiArtifactView {
  artifact: AttendeePostEventAiArtifact | null;
  eventId: string;
  failureCode: string | null;
  status: AttendeePostEventAiArtifactStatus;
  updatedAt: string | null;
}

export interface AttendeePostEventAiArtifactReader {
  read(input: {
    attendeeActorId: string;
    eventId: string;
  }): Promise<AttendeePostEventAiArtifactView>;
}
