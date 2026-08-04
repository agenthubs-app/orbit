import type {
  LiveRecord,
  LiveRecordStoreLike,
} from "../../../shared/storage/live-record-store";
import type {
  AttendeePostEventAiArtifact,
  AttendeePostEventAiArtifactReader,
  AttendeePostEventAiArtifactStatus,
  AttendeePostEventAiArtifactView,
} from "./contract";

export const ATTENDEE_POST_EVENT_AI_ARTIFACT_COLLECTION =
  "event_attendee_post_event_ai_artifacts";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function status(value: unknown): Exclude<AttendeePostEventAiArtifactStatus, "unconfigured"> | null {
  return value === "queued" || value === "running" || value === "ready" || value === "failed"
    ? value
    : null;
}

function text(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function evidenceIds(value: unknown): readonly string[] | null {
  if (!Array.isArray(value) || !value.every((item) => typeof item === "string" && item.trim())) {
    return null;
  }
  return [...new Set(value.map((item) => item.trim()))];
}

function readyArtifact(
  payload: Record<string, unknown>,
  permittedEvidenceIds: readonly string[],
): AttendeePostEventAiArtifact | null {
  if (!isRecord(payload.artifact) || !isRecord(payload.provenance)) return null;
  if (payload.provenance.generationMethod !== "ai-provider") return null;
  const summary = text(payload.artifact.summary);
  const generatedAt = text(payload.artifact.generatedAt);
  const model = text(payload.provenance.model);
  const provider = text(payload.provenance.provider);
  const artifactEvidenceIds = evidenceIds(payload.artifact.evidenceIds);
  const evidenceHash = text(payload.artifact.evidenceHash);
  const promptVersion = Number(payload.provenance.promptVersion);
  const version = Number(payload.artifact.version);
  if (!summary || !generatedAt || !model || !provider || !artifactEvidenceIds || !evidenceHash) return null;
  if (!Number.isSafeInteger(promptVersion) || promptVersion < 1) return null;
  if (!Number.isSafeInteger(version) || version < 1) return null;
  if (payload.evidenceHash !== evidenceHash || payload.version !== version) return null;
  const permitted = new Set(permittedEvidenceIds);
  if (artifactEvidenceIds.some((evidenceId) => !permitted.has(evidenceId))) return null;
  return {
    evidenceHash,
    evidenceIds: artifactEvidenceIds,
    generatedAt,
    messageDraft: text(payload.artifact.messageDraft),
    model,
    provider,
    promptVersion,
    summary,
    version,
  };
}

function viewFromRecord(
  record: LiveRecord<Record<string, unknown>>,
  input: { attendeeActorId: string; eventId: string },
): AttendeePostEventAiArtifactView | null {
  const payload = record.payload;
  if (
    payload.eventId !== input.eventId ||
    payload.attendeeActorId !== input.attendeeActorId
  ) {
    return null;
  }
  const artifactStatus = status(payload.status);
  if (!artifactStatus) return null;
  if (artifactStatus !== "ready") {
    return {
      artifact: null,
      eventId: input.eventId,
      failureCode:
        artifactStatus === "failed" ? "AI_GENERATION_FAILED" : null,
      status: artifactStatus,
      updatedAt: record.updatedAt,
    };
  }
  const artifact = readyArtifact(payload, record.evidenceIds);
  return artifact
    ? {
        artifact,
        eventId: input.eventId,
        failureCode: null,
        status: "ready",
        updatedAt: record.updatedAt,
      }
    : {
        artifact: null,
        eventId: input.eventId,
        failureCode: "AI_ARTIFACT_POLICY_REJECTED",
        status: "failed",
        updatedAt: record.updatedAt,
      };
}

export function createLiveRecordAttendeePostEventAiArtifactReader(input: {
  store: LiveRecordStoreLike<Record<string, unknown>>;
  workspaceId: string;
}): AttendeePostEventAiArtifactReader {
  return {
    async read(query) {
      const records = await input.store.listRecords({
        collectionName: ATTENDEE_POST_EVENT_AI_ARTIFACT_COLLECTION,
        lifecycleState: "active",
        targetId: query.eventId,
        targetType: "event",
        userId: query.attendeeActorId,
        workspaceId: input.workspaceId,
      });
      const selectedRecord = [...records]
        .sort((left, right) => {
          const leftVersion = Number(left.payload.version) || 0;
          const rightVersion = Number(right.payload.version) || 0;
          return rightVersion - leftVersion || right.updatedAt.localeCompare(left.updatedAt);
        })[0];
      if (!selectedRecord) return {
        artifact: null,
        eventId: query.eventId,
        failureCode: null,
        status: "unconfigured",
        updatedAt: null,
      };
      return viewFromRecord(selectedRecord, query) ?? {
        artifact: null,
        eventId: query.eventId,
        failureCode: "AI_ARTIFACT_POLICY_REJECTED",
        status: "failed",
        updatedAt: selectedRecord.updatedAt,
      };
    },
  };
}
