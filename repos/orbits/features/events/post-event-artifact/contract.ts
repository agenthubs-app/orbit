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
