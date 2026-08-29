import { createConfiguredPostgresLiveRecordStore } from "../../shared/storage/configured-live-record-store";
import { createReminderPlanRepository } from "./reminder-plan-repository";
import { createReminderPlanService, type ReminderTargetAuthorizer } from "./reminder-plan-service";

function containsId(value: unknown, id: string, depth = 0): boolean {
  if (depth > 4) return false;
  if (value === id) return true;
  if (Array.isArray(value)) return value.some((item) => containsId(item, id, depth + 1));
  if (!value || typeof value !== "object") return false;
  return Object.values(value as Record<string, unknown>).some((item) => containsId(item, id, depth + 1));
}

export function createConfiguredReminderPlanService() {
  const configured = createConfiguredPostgresLiveRecordStore();
  if (!configured) throw new Error("Reminder plan storage is not configured");
  const targetAuthorizer: ReminderTargetAuthorizer = {
    async assertOwned({ actorId, targetId, targetType }) {
      const candidates = new Set([targetId]);
      if (targetType === "schedule_item" && targetId.startsWith("schedule:")) {
        candidates.add(targetId.slice("schedule:".length));
      }
      const records = await configured.store.listRecords({ userId: actorId, workspaceId: configured.workspaceId });
      const owned = records.some((record) =>
        [...candidates].some((id) => record.recordId === id || record.sourceId === id || record.targetId === id || containsId(record.payload, id)));
      if (!owned) throw new Error("target not owned");
    },
  };
  return createReminderPlanService({
    now: () => new Date().toISOString(),
    repository: createReminderPlanRepository({ store: configured.store, workspaceId: configured.workspaceId }),
    targetAuthorizer,
  });
}
