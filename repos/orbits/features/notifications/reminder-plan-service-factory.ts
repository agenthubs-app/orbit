import { createConfiguredPostgresLiveRecordStore } from "../../shared/storage/configured-live-record-store";
import { createReminderPlanRepository } from "./reminder-plan-repository";
import { createReminderPlanService, type ReminderTargetAuthorizer } from "./reminder-plan-service";
import { createReminderPushDeviceGateway } from "./push-device-reminder-adapter";
import { createPushDeviceService } from "./push-device-service";
import {createConfiguredTransactionalPostgresRuntime} from '../../shared/storage/transactional-postgres';

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
    withDeliveryGate: async (actorId, operation) => {
      const runtime = createConfiguredTransactionalPostgresRuntime();
      if (!runtime || runtime.workspaceId !== configured.workspaceId) throw new Error('Delivery gate unavailable');
      await runtime.client.transaction(async db => {
        await db.query('select pg_advisory_xact_lock(hashtextextended($1,0))', [JSON.stringify(['notification-delivery-policy', configured.workspaceId, actorId])]);
        await operation();
      });
    },
    deliveryManagedExternally: async (actorId) => {
      const state = await configured.store.getRecord({ workspaceId: configured.workspaceId, collectionName: 'notificationCutover', recordId: actorId });
      return state?.userId === actorId && (state.payload.enabled === true || state.payload.legacyBlocked === true);
    },
    now: () => new Date().toISOString(),
    pushDevices: createReminderPushDeviceGateway({
      serviceForActor: (actorId) => createPushDeviceService({ actorId }),
    }),
    repository: createReminderPlanRepository({ store: configured.store, workspaceId: configured.workspaceId }),
    targetAuthorizer,
  });
}
