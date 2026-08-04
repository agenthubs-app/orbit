import { createConfiguredPostgresLiveRecordStore } from "../../../shared/storage/configured-live-record-store";
import type { AttendeePostEventAiArtifactReader } from "./contract";
import { createLiveRecordAttendeePostEventAiArtifactReader } from "./live-record-reader";
import { createAttendeePostEventAiTaskRepository, type AttendeePostEventAiTaskRepository } from "./task-repository";

export function createConfiguredAttendeePostEventAiArtifactReader(): AttendeePostEventAiArtifactReader | null {
  const configured = createConfiguredPostgresLiveRecordStore<Record<string, unknown>>();
  return configured
    ? createLiveRecordAttendeePostEventAiArtifactReader({
        store: configured.store,
        workspaceId: configured.workspaceId,
      })
    : null;
}

export function createConfiguredAttendeePostEventAiTaskRepository(): AttendeePostEventAiTaskRepository | null {
  const configured = createConfiguredPostgresLiveRecordStore<Record<string, unknown>>();
  return configured
    ? createAttendeePostEventAiTaskRepository({
        client: configured.client,
        store: configured.store,
        workspaceId: configured.workspaceId,
      })
    : null;
}
