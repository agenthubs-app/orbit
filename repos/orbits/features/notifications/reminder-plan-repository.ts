import type { LiveRecord, LiveRecordStoreLike } from "../../shared/storage/live-record-store";
import type {
  DevicePushTokenDTO,
  NotificationDeliveryDTO,
  NotificationPreferencesDTO,
  ReminderPlanDTO,
  ReminderTargetType,
} from "./reminder-plan-contract";

const COLLECTIONS = {
  deliveries: "notificationDeliveries",
  devices: "devicePushTokens",
  plans: "reminderPlans",
  preferences: "notificationPreferences",
} as const;

type Entity = ReminderPlanDTO | DevicePushTokenDTO | NotificationDeliveryDTO | NotificationPreferencesDTO;

interface StoragePayload extends Record<string, unknown> {
  entity: Entity;
}

export interface ReminderPlanRepository {
  listDuePlans(now: string): Promise<readonly ReminderPlanDTO[]>;
  listPlans(input: { actorId: string; includeCancelled?: boolean; targetId?: string; targetType?: ReminderTargetType }): Promise<readonly ReminderPlanDTO[]>;
  getPlan(actorId: string, id: string): Promise<ReminderPlanDTO | null>;
  savePlan(plan: ReminderPlanDTO): Promise<ReminderPlanDTO>;
  getPreferences(actorId: string): Promise<NotificationPreferencesDTO | null>;
  savePreferences(preferences: NotificationPreferencesDTO): Promise<NotificationPreferencesDTO>;
  listDevices(actorId: string): Promise<readonly DevicePushTokenDTO[]>;
  saveDevice(device: DevicePushTokenDTO): Promise<DevicePushTokenDTO>;
  listDeliveries(actorId: string): Promise<readonly NotificationDeliveryDTO[]>;
  getDelivery(actorId: string, id: string): Promise<NotificationDeliveryDTO | null>;
  saveDelivery(delivery: NotificationDeliveryDTO): Promise<NotificationDeliveryDTO>;
}

function recordFor(collectionName: string, entity: Entity): LiveRecord<StoragePayload> {
  const actorId = entity.ownerUserId;
  const id = "id" in entity ? entity.id : entity.accountId;
  const createdAt = "createdAt" in entity ? entity.createdAt : entity.updatedAt;
  return {
    collectionName,
    createdAt,
    evidenceIds: [],
    lifecycleState: "active",
    payload: { entity },
    recordId: id,
    searchText: "title" in entity ? `${entity.title} ${"body" in entity ? entity.body : ""}`.trim() : null,
    sourceId: id,
    sourceLabel: "Orbit reminder plan service",
    sourceType: "system",
    updatedAt: entity.updatedAt,
    userId: actorId,
    workspaceId: "",
  };
}

export function createReminderPlanRepository({
  store,
  workspaceId,
}: {
  store: LiveRecordStoreLike<Record<string, unknown>>;
  workspaceId: string;
}): ReminderPlanRepository {
  async function list<T extends Entity>(collectionName: string, actorId: string): Promise<readonly T[]> {
    const records = await store.listRecords({ collectionName, userId: actorId, workspaceId });
    return records.flatMap((record) => {
      const entity = (record.payload as StoragePayload).entity;
      return entity && typeof entity === "object" ? [entity as T] : [];
    });
  }

  async function get<T extends Entity>(collectionName: string, actorId: string, id: string): Promise<T | null> {
    const record = await store.getRecord({ collectionName, recordId: id, workspaceId });
    if (!record || record.userId !== actorId) return null;
    return ((record.payload as StoragePayload).entity as T | undefined) ?? null;
  }

  async function save<T extends Entity>(collectionName: string, entity: T): Promise<T> {
    const record = recordFor(collectionName, entity);
    record.workspaceId = workspaceId;
    await store.upsertRecord(record as unknown as LiveRecord<Record<string, unknown>>);
    return entity;
  }

  return {
    async listDuePlans(now) {
      const records = await store.listRecords({ collectionName: COLLECTIONS.plans, workspaceId });
      return records.flatMap((record) => {
        const entity = (record.payload as StoragePayload).entity;
        if (!entity || !("fireAt" in entity) || entity.status !== "scheduled" || entity.fireAt > now) return [];
        return [entity as ReminderPlanDTO];
      });
    },
    async listPlans(input) {
      const values = await list<ReminderPlanDTO>(COLLECTIONS.plans, input.actorId);
      return values.filter((item) =>
        (input.includeCancelled || item.status !== "cancelled") &&
        (!input.targetId || item.targetId === input.targetId) &&
        (!input.targetType || item.targetType === input.targetType));
    },
    getPlan: (actorId, id) => get(COLLECTIONS.plans, actorId, id),
    savePlan: (value) => save(COLLECTIONS.plans, value),
    getPreferences: (actorId) => get(COLLECTIONS.preferences, actorId, actorId),
    savePreferences: (value) => save(COLLECTIONS.preferences, value),
    listDevices: (actorId) => list(COLLECTIONS.devices, actorId),
    saveDevice: (value) => save(COLLECTIONS.devices, value),
    listDeliveries: (actorId) => list(COLLECTIONS.deliveries, actorId),
    getDelivery: (actorId, id) => get(COLLECTIONS.deliveries, actorId, id),
    saveDelivery: (value) => save(COLLECTIONS.deliveries, value),
  };
}
