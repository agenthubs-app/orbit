import { createConfiguredPostgresLiveRecordStore } from "../../../shared/storage/configured-live-record-store";
import { createConfiguredHumanEncounterService } from "../../encounters/runtime";
import { createStorageFollowupActionWriter } from "../../followups/action-writer";
import { createStorageReminderActionWriter } from "../../notifications/action-writer";
import { createConfirmedEventFollowupService, type ConfirmedEventFollowupService } from "./service";

export function createConfiguredConfirmedEventFollowupService(
  actorId: string,
): ConfirmedEventFollowupService | null {
  const configured = createConfiguredPostgresLiveRecordStore<Record<string, unknown>>();
  const encounters = createConfiguredHumanEncounterService();
  return configured && encounters
    ? createConfirmedEventFollowupService({
        encounters,
        followups: createStorageFollowupActionWriter({
          store: configured.store,
          userId: actorId,
          workspaceId: configured.workspaceId,
        }),
        reminders: createStorageReminderActionWriter({
          store: configured.store,
          userId: actorId,
          workspaceId: configured.workspaceId,
        }),
        store: configured.store,
        workspaceId: configured.workspaceId,
      })
    : null;
}
