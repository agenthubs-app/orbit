import { createHash } from "node:crypto";

import { createConfiguredPostgresLiveRecordStore } from "../../shared/storage/configured-live-record-store";
import type { LiveDatabaseEnv } from "../../shared/storage/live-database-config";
import {
  createMemoryLiveRecordStore,
  type LiveRecord,
  type LiveRecordStoreLike,
} from "../../shared/storage/live-record-store";
import type { LiveRecordSqlClient } from "../../shared/storage/postgres-live-record-store";
import type { OrbitPushAdapter } from "./push-adapter";
import { createPushDeviceService, type PushDeviceService } from "./push-device-service";

export const NOTIFICATION_DELIVERY_COLLECTION = "notificationDeliveries" as const;
export const NOTIFICATION_DELIVERY_MAX_ATTEMPTS = 5;
export const NOTIFICATION_DELIVERY_LEASE_TIMEOUT_MS = 15 * 60_000;
export const NOTIFICATION_DELIVERY_DAILY_PUSH_LIMIT = 2;

export type NotificationDeliveryPhase = "pre_event" | "post_event" | "commitment";
export type NotificationDeliveryChannel = "push" | "in_app";
export type NotificationDeliveryStatus =
  | "scheduled"
  | "processing"
  | "receipt_pending"
  | "sent"
  | "retry_scheduled"
  | "suppressed"
  | "failed"
  | "dead_letter";

export interface NotificationDeliveryTarget {
  deliveryId: string;
  kind: "inbox";
}

export interface NotificationDelivery {
  deviceId: string;
  deliveryId: string;
  actorId: string;
  signalId: string;
  signalRevision: string;
  phase: NotificationDeliveryPhase;
  channel: NotificationDeliveryChannel;
  status: NotificationDeliveryStatus;
  title: string;
  body: string;
  data: Readonly<Record<string, string>>;
  scheduledFor: string;
  availableAt: string;
  attempt: number;
  maxAttempts: number;
  leaseOwner?: string;
  leasedAt?: string;
  providerReceiptId?: string;
  lastError?: string;
  suppressionReason?: string;
  createdAt: string;
  updatedAt: string;
  deliveredAt?: string;
}

export interface NotificationDeliveryPublicView
  extends Omit<NotificationDelivery, "actorId" | "data" | "deviceId"> {
  data: Readonly<{ deliveryId: string }>;
  target: NotificationDeliveryTarget;
}

interface NotificationDeliveryRecordPayload extends Record<string, unknown> {
  kind: "notification_delivery";
  delivery: NotificationDelivery;
}

export interface NotificationDeliveryService {
  get: (deliveryId: string) => Promise<NotificationDelivery | null>;
  list: (input?: {
    status?: NotificationDeliveryStatus;
    limit?: number;
  }) => Promise<readonly NotificationDelivery[]>;
  materialize: (input: {
    signalId: string;
    signalRevision: string;
    phase: NotificationDeliveryPhase;
    channel?: NotificationDeliveryChannel;
    title: string;
    body: string;
    data?: Readonly<Record<string, string>>;
    scheduledFor: string;
  }) => Promise<{
    created: boolean;
    delivery: NotificationDelivery;
    deliveries: readonly NotificationDelivery[];
  }>;
  claimReady: (input: {
    now: string;
    limit: number;
    workerId: string;
  }) => Promise<readonly NotificationDelivery[]>;
  markSent: (input: {
    deliveryId: string;
    workerId: string;
    providerReceiptId: string;
    now: string;
  }) => Promise<NotificationDelivery>;
  markRetry: (input: {
    deliveryId: string;
    workerId: string;
    error: string;
    now: string;
  }) => Promise<NotificationDelivery>;
  markReceiptPending: (input: {
    deliveryId: string;
    workerId: string;
    providerReceiptId: string;
    now: string;
  }) => Promise<NotificationDelivery>;
  markReceiptVerified: (input: {
    deliveryId: string;
    providerReceiptId: string;
    now: string;
  }) => Promise<NotificationDelivery>;
  markReceiptFailed: (input: {
    deliveryId: string;
    providerReceiptId: string;
    error: string;
    now: string;
  }) => Promise<NotificationDelivery>;
  defer: (input: {
    deliveryId: string;
    workerId: string;
    availableAt: string;
    now: string;
  }) => Promise<NotificationDelivery>;
  markSuppressed: (input: {
    deliveryId: string;
    workerId: string;
    reason: string;
    now: string;
  }) => Promise<NotificationDelivery>;
};

export interface NotificationDeliveryPreferences {
  preEventBriefPushEnabled: boolean;
  postEventReminderPushEnabled: boolean;
  followupDuePushEnabled?: boolean;
  quietHours: { start: string; end: string };
  timeZone: string;
}

export interface StorageNotificationDeliveryServiceOptions {
  actorId: string;
  store: LiveRecordStoreLike<NotificationDeliveryRecordPayload>;
  workspaceId: string;
  sqlClient?: LiveRecordSqlClient;
  devices?: PushDeviceService;
  now?: () => string;
}

function required(value: string, label: string, max = 256): string {
  const normalized = typeof value === "string" ? value.trim() : "";
  if (!normalized || normalized.length > max) {
    throw new Error(`${label} is invalid.`);
  }
  return normalized;
}

function actorWorkspaceId(workspaceId: string, actorId: string): string {
  required(actorId, "Actor");
  return required(workspaceId, "Workspace");
}

function stableDeliveryId(input: {
  actorId: string;
  deviceId: string;
  signalId: string;
  signalRevision: string;
  phase: NotificationDeliveryPhase;
  channel: NotificationDeliveryChannel;
}): string {
  const digest = createHash("sha256")
    .update(
      [input.actorId, input.deviceId, input.signalId, input.signalRevision, input.phase, input.channel].join(
        "\u0000",
      ),
    )
    .digest("hex");
  return `notification-delivery:${digest}`;
}

function safeData(
  _input: Readonly<Record<string, string>> | undefined,
  deliveryId: string,
): Readonly<Record<string, string>> {
  // Delivery data is intentionally opaque. Signal identity, phase, and
  // content belong to the authenticated delivery ledger, never to a push
  // payload that can be exposed by the operating system lock screen.
  return { deliveryId };
}

function recordFor(
  workspaceId: string,
  delivery: NotificationDelivery,
): LiveRecord<NotificationDeliveryRecordPayload> {
  return {
    collectionName: NOTIFICATION_DELIVERY_COLLECTION,
    createdAt: delivery.createdAt,
    evidenceIds: [],
    lifecycleState: "active",
    payload: { delivery, kind: "notification_delivery" },
    recordId: delivery.deliveryId,
    searchText: `${delivery.phase} ${delivery.signalId}`,
    sourceId: delivery.signalId,
    sourceLabel: "Orbit durable notification delivery",
    sourceType: "agent_signal",
    updatedAt: delivery.updatedAt,
    userId: delivery.actorId,
    workspaceId,
  };
}

function deliveryFromRecord(
  record: LiveRecord<NotificationDeliveryRecordPayload>,
): NotificationDelivery | null {
  const delivery = record.payload.delivery;
  if (
    !delivery ||
    typeof delivery !== "object" ||
    typeof delivery.deliveryId !== "string" ||
    typeof delivery.actorId !== "string" ||
    typeof delivery.signalId !== "string" ||
    typeof delivery.status !== "string"
  ) {
    return null;
  }
  return delivery;
}

function retryAt(now: string, attempt: number): string {
  const parsed = Date.parse(now);
  const delay = Math.min(15 * 60_000, 30_000 * 2 ** Math.max(0, attempt - 1));
  return new Date((Number.isFinite(parsed) ? parsed : Date.now()) + delay).toISOString();
}

function isPermanentPushError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return /DeviceNotRegistered|MessageTooBig|InvalidCredentials|invalid token|not registered/i.test(
    message,
  );
}

function isDeviceNotRegistered(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return /DeviceNotRegistered|invalid token|not registered/i.test(message);
}

function parseDeliveryPayload(value: unknown): NotificationDelivery | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const payload = value as { delivery?: unknown };
  if (!payload.delivery || typeof payload.delivery !== "object") return null;
  return payload.delivery as NotificationDelivery;
}

export function createStorageNotificationDeliveryService({
  actorId,
  devices,
  now = () => new Date().toISOString(),
  sqlClient,
  store,
  workspaceId,
}: StorageNotificationDeliveryServiceOptions): NotificationDeliveryService {
  const normalizedActorId = required(actorId, "Actor");
  const scopedWorkspaceId = actorWorkspaceId(workspaceId, normalizedActorId);
  let mutationQueue: Promise<void> = Promise.resolve();
  let claimQueue: Promise<void> = Promise.resolve();

  async function serial<T>(operation: () => Promise<T>): Promise<T> {
    const previous = mutationQueue;
    let release: () => void = () => undefined;
    mutationQueue = new Promise<void>((resolve) => {
      release = resolve;
    });
    await previous;
    try {
      return await operation();
    } finally {
      release();
    }
  }

  async function read(deliveryId: string): Promise<NotificationDelivery | null> {
    const record = await store.getRecord({
      collectionName: NOTIFICATION_DELIVERY_COLLECTION,
      recordId: required(deliveryId, "Delivery"),
      workspaceId: scopedWorkspaceId,
    });
    return record ? deliveryFromRecord(record) : null;
  }

  async function save(delivery: NotificationDelivery): Promise<NotificationDelivery> {
    await store.upsertRecord(recordFor(scopedWorkspaceId, delivery));
    return delivery;
  }

  async function updateOwned(
    input: { deliveryId: string; workerId: string; now: string },
    update: (delivery: NotificationDelivery) => NotificationDelivery,
  ): Promise<NotificationDelivery> {
    return serial(async () => {
      const existing = await read(input.deliveryId);
      if (!existing) throw new Error(`Notification delivery ${input.deliveryId} was not found.`);
      if (existing.status !== "processing" || existing.leaseOwner !== input.workerId) {
        throw new Error("Notification delivery lease is no longer owned by this worker.");
      }
      return save(update(existing));
    });
  }

  async function claimWithStore(input: {
    now: string;
    limit: number;
    workerId: string;
  }): Promise<NotificationDelivery[]> {
    const leaseExpiredBefore = new Date(
      Date.parse(input.now) - NOTIFICATION_DELIVERY_LEASE_TIMEOUT_MS,
    ).toISOString();
    const records = await store.listRecords({
      collectionName: NOTIFICATION_DELIVERY_COLLECTION,
      lifecycleState: "active",
      userId: normalizedActorId,
      workspaceId: scopedWorkspaceId,
    });
    const claimed = records
      .flatMap((record) => {
        const delivery = deliveryFromRecord(record);
        return delivery ? [delivery] : [];
      })
      .filter(
        (delivery) =>
          delivery.channel === "push" &&
          delivery.availableAt <= input.now &&
          ((delivery.status === "scheduled" || delivery.status === "retry_scheduled") ||
            (delivery.status === "processing" &&
              Boolean(delivery.leasedAt) &&
              delivery.leasedAt! <= leaseExpiredBefore)),
      )
      .sort((left, right) => left.availableAt.localeCompare(right.availableAt))
      .slice(0, Math.max(0, input.limit))
      .map((delivery) => ({
        ...delivery,
        attempt: delivery.attempt + 1,
        leaseOwner: input.workerId,
        leasedAt: input.now,
        status: "processing" as const,
        updatedAt: input.now,
      }));
    for (const delivery of claimed) await save(delivery);
    return claimed;
  }

  return {
    async get(deliveryId) {
      return read(deliveryId);
    },
    async list(input = {}) {
      const records = await store.listRecords({
        collectionName: NOTIFICATION_DELIVERY_COLLECTION,
        lifecycleState: "active",
        userId: normalizedActorId,
        workspaceId: scopedWorkspaceId,
      });
      return records
        .flatMap((record) => {
          const delivery = deliveryFromRecord(record);
          return delivery ? [delivery] : [];
        })
        .filter((delivery) => !input.status || delivery.status === input.status)
        .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
        .slice(0, Math.max(1, Math.min(500, input.limit ?? 100)));
    },
    async materialize(input) {
      return serial(async () => {
        const phase = input.phase;
        const channel = input.channel ?? "push";
        const signalId = required(input.signalId, "Signal");
        const signalRevision = required(input.signalRevision, "Signal revision");
        const title = required(input.title, "Title", 160);
        const body = required(input.body, "Body", 512);
        const scheduledFor = required(input.scheduledFor, "Scheduled time");
        if (!Number.isFinite(Date.parse(scheduledFor))) {
          throw new Error("Scheduled time must be a valid ISO timestamp.");
        }
        const activeDevices = devices
          ? (await devices.listActive()).map((device) => device.deviceId)
          : ["actor-device"];
        const deliveries: NotificationDelivery[] = [];
        let created = false;
        for (const deviceId of activeDevices) {
          const deliveryId = stableDeliveryId({
            actorId: normalizedActorId,
            channel,
            deviceId,
            phase,
            signalId,
            signalRevision,
          });
          const existing = await read(deliveryId);
          if (existing) {
            deliveries.push(existing);
            continue;
          }
          const createdAt = now();
          const delivery: NotificationDelivery = {
            actorId: normalizedActorId,
            attempt: 0,
            availableAt: scheduledFor,
            body,
            channel,
            createdAt,
            data: safeData(input.data, deliveryId),
            deliveryId,
            deviceId,
            maxAttempts: NOTIFICATION_DELIVERY_MAX_ATTEMPTS,
            phase,
            scheduledFor,
            signalId,
            signalRevision,
            status: "scheduled",
            title,
            updatedAt: createdAt,
          };
          const record = recordFor(scopedWorkspaceId, delivery);
          if (sqlClient) {
            const inserted = await sqlClient.query<{ record_id: string }>(
            `
              insert into orbit_records (
                workspace_id, collection_name, record_id, user_id,
                source_type, source_id, source_label, provider,
                provider_record_id, evidence_ids, target_type, target_id,
                occurred_at, lifecycle_state, search_text, payload,
                created_at, updated_at, deleted_at
              ) values (
                $1, $2, $3, $4, $5, $6, $7, $8, $9, $10,
                $11, $12, $13, $14, $15, $16, $17, $18, $19
              )
              on conflict (workspace_id, collection_name, record_id) do nothing
              returning record_id
            `,
            [
              record.workspaceId,
              record.collectionName,
              record.recordId,
              record.userId ?? null,
              record.sourceType,
              record.sourceId,
              record.sourceLabel ?? null,
              record.provider ?? null,
              record.providerRecordId ?? null,
              [...record.evidenceIds],
              record.targetType ?? null,
              record.targetId ?? null,
              record.occurredAt ?? null,
              record.lifecycleState,
              record.searchText ?? "",
              record.payload,
              record.createdAt,
              record.updatedAt,
              record.deletedAt ?? null,
            ],
            );
            created ||= inserted.rows.length > 0;
            const persisted = await read(deliveryId);
            if (!persisted) throw new Error("Notification delivery insert returned no row.");
            deliveries.push(persisted);
            continue;
          }
          await store.upsertRecord(record);
          created = true;
          deliveries.push(delivery);
        }
        const primary = deliveries[0];
        if (!primary) {
          const fallbackId = stableDeliveryId({
            actorId: normalizedActorId,
            channel,
            deviceId: "actor-device",
            phase,
            signalId,
            signalRevision,
          });
          const createdAt = now();
          return {
            created: false,
            delivery: {
              actorId: normalizedActorId,
              attempt: 0,
              availableAt: scheduledFor,
              body,
              channel,
              createdAt,
              data: safeData(input.data, fallbackId),
              deliveryId: fallbackId,
              deviceId: "actor-device",
              maxAttempts: NOTIFICATION_DELIVERY_MAX_ATTEMPTS,
              phase,
              scheduledFor,
              signalId,
              signalRevision,
              status: "suppressed",
              suppressionReason: "no_active_device",
              title,
              updatedAt: createdAt,
            },
            deliveries: [],
          };
        }
        return {
          created,
          delivery: primary,
          deliveries,
        };
      });
    },
    async claimReady(input) {
      const claimed = sqlClient
        ? await (async () => {
            const leaseExpiredBefore = new Date(
              Date.parse(input.now) - NOTIFICATION_DELIVERY_LEASE_TIMEOUT_MS,
            ).toISOString();
            const result = await sqlClient.query<{ payload: unknown }>(
              `
                with ready as (
                  select record_id
                  from orbit_records
                  where workspace_id = $1
                    and collection_name = $2
                    and user_id = $3
                    and lifecycle_state <> 'deleted'
                    and payload->'delivery'->>'channel' = 'push'
                    and payload->'delivery'->>'availableAt' <= $4::timestamptz
                    and (
                      payload->'delivery'->>'status' in ('scheduled', 'retry_scheduled')
                      or (
                        payload->'delivery'->>'status' = 'processing'
                        and (payload->'delivery'->>'leasedAt')::timestamptz <= $5::timestamptz
                      )
                    )
                  order by payload->'delivery'->>'availableAt' asc
                  for update skip locked
                  limit $6
                )
                update orbit_records as records
                set payload = jsonb_set(
                  jsonb_set(
                    jsonb_set(
                      jsonb_set(records.payload, '{delivery,status}', '"processing"'::jsonb),
                      '{delivery,attempt}',
                      to_jsonb(coalesce((records.payload->'delivery'->>'attempt')::int, 0) + 1)
                    ),
                    '{delivery,leasedAt}', to_jsonb($4::text)
                  ),
                  '{delivery,leaseOwner}', to_jsonb($7::text)
                ),
                updated_at = $4::timestamptz
                from ready
                where records.workspace_id = $1
                  and records.collection_name = $2
                  and records.record_id = ready.record_id
                returning records.payload
              `,
              [
                scopedWorkspaceId,
                NOTIFICATION_DELIVERY_COLLECTION,
                normalizedActorId,
                input.now,
                leaseExpiredBefore,
                Math.max(0, input.limit),
                input.workerId,
              ],
            );
            return result.rows.flatMap((row) => {
              const delivery = parseDeliveryPayload(
                typeof row.payload === "string" ? JSON.parse(row.payload) : row.payload,
              );
              return delivery ? [delivery] : [];
            });
          })()
        : await (async () => {
            const previous = claimQueue;
            let release: () => void = () => undefined;
            claimQueue = new Promise<void>((resolve) => {
              release = resolve;
            });
            await previous;
            try {
              return await claimWithStore(input);
            } finally {
              release();
            }
          })();
      return claimed;
    },
    async markSent(input) {
      return updateOwned(input, (delivery) => ({
        ...delivery,
        deliveredAt: input.now,
        leaseOwner: undefined,
        leasedAt: undefined,
        lastError: undefined,
        providerReceiptId: required(input.providerReceiptId, "Provider receipt"),
        status: "sent",
        updatedAt: input.now,
      }));
    },
    async markReceiptPending(input) {
      return updateOwned(input, (delivery) => ({
        ...delivery,
        deliveredAt: undefined,
        lastError: undefined,
        leaseOwner: undefined,
        leasedAt: undefined,
        providerReceiptId: required(input.providerReceiptId, "Provider receipt"),
        status: "receipt_pending",
        updatedAt: input.now,
      }));
    },
    async markReceiptVerified(input) {
      return serial(async () => {
        const existing = await read(input.deliveryId);
        if (!existing) throw new Error(`Notification delivery ${input.deliveryId} was not found.`);
        if (existing.status === "sent") return existing;
        if (existing.status !== "receipt_pending") {
          throw new Error("Notification delivery receipt is no longer pending.");
        }
        return save({
          ...existing,
          deliveredAt: input.now,
          lastError: undefined,
          providerReceiptId: required(input.providerReceiptId, "Provider receipt"),
          status: "sent",
          updatedAt: input.now,
        });
      });
    },
    async markReceiptFailed(input) {
      return serial(async () => {
        const existing = await read(input.deliveryId);
        if (!existing) throw new Error(`Notification delivery ${input.deliveryId} was not found.`);
        if (existing.status === "failed") return existing;
        if (existing.status !== "receipt_pending") {
          throw new Error("Notification delivery receipt is no longer pending.");
        }
        return save({
          ...existing,
          lastError: required(input.error, "Receipt error", 1024),
          leaseOwner: undefined,
          leasedAt: undefined,
          providerReceiptId: required(input.providerReceiptId, "Provider receipt"),
          status: "failed",
          updatedAt: input.now,
        });
      });
    },
    async markRetry(input) {
      return updateOwned(input, (delivery) => {
        const shouldDeadLetter = delivery.attempt >= delivery.maxAttempts;
        return {
          ...delivery,
          availableAt: shouldDeadLetter ? delivery.availableAt : retryAt(input.now, delivery.attempt),
          lastError: required(input.error, "Delivery error", 1024),
          leaseOwner: undefined,
          leasedAt: undefined,
          status: shouldDeadLetter ? "dead_letter" : "retry_scheduled",
          updatedAt: input.now,
        };
      });
    },
    async defer(input) {
      const availableAt = required(input.availableAt, "Deferred delivery time");
      if (!Number.isFinite(Date.parse(availableAt))) {
        throw new Error("Deferred delivery time must be a valid ISO timestamp.");
      }
      return updateOwned(input, (delivery) => ({
        ...delivery,
        availableAt,
        lastError: undefined,
        leaseOwner: undefined,
        leasedAt: undefined,
        status: "retry_scheduled",
        suppressionReason: undefined,
        updatedAt: input.now,
      }));
    },
    async markSuppressed(input) {
      return updateOwned(input, (delivery) => ({
        ...delivery,
        leaseOwner: undefined,
        leasedAt: undefined,
        status: "suppressed",
        suppressionReason: required(input.reason, "Suppression reason", 128),
        updatedAt: input.now,
      }));
    },
  };
}

function localDateStart(now: string, timeZone = "UTC"): string {
  try {
    const nowMs = Date.parse(now);
    if (!Number.isFinite(nowMs)) throw new Error("Invalid current time.");
    const local = zonedParts(nowMs, timeZone);
    const midnight = zonedLocalToInstant(
      { ...local, hour: 0, minute: 0 },
      timeZone,
    );
    if (Number.isFinite(midnight)) return new Date(midnight).toISOString();
  } catch {
    // Fall through to UTC; malformed user preferences must not crash the
    // durable worker. Quiet-hours validation still fails closed separately.
  }
  return `${now.slice(0, 10)}T00:00:00.000Z`;
}

interface QuietHoursState {
  inQuietHours: boolean;
  nextEndAt: string | null;
  valid: boolean;
}

interface ZonedParts {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
}

function parseClock(value: string): { hour: number; minute: number } | null {
  const match = value.match(/^([01]\d|2[0-3]):([0-5]\d)$/);
  return match
    ? { hour: Number(match[1]), minute: Number(match[2]) }
    : null;
}

function zonedParts(instantMs: number, timeZone: string): ZonedParts {
  const parts = new Intl.DateTimeFormat("en-CA", {
    day: "2-digit",
    hour: "2-digit",
    hourCycle: "h23",
    minute: "2-digit",
    month: "2-digit",
    timeZone,
    year: "numeric",
  }).formatToParts(new Date(instantMs));
  const value = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((part) => part.type === type)?.value);
  return {
    day: value("day"),
    hour: value("hour"),
    minute: value("minute"),
    month: value("month"),
    year: value("year"),
  };
}

function zonedLocalToInstant(local: ZonedParts, timeZone: string): number {
  const targetAsUtc = Date.UTC(
    local.year,
    local.month - 1,
    local.day,
    local.hour,
    local.minute,
  );
  let candidate = targetAsUtc;
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const observed = zonedParts(candidate, timeZone);
    const observedAsUtc = Date.UTC(
      observed.year,
      observed.month - 1,
      observed.day,
      observed.hour,
      observed.minute,
    );
    const correction = targetAsUtc - observedAsUtc;
    candidate += correction;
    if (correction === 0) break;
  }
  return candidate;
}

function localDateAfter(local: ZonedParts, days: number): Pick<ZonedParts, "year" | "month" | "day"> {
  const date = new Date(
    Date.UTC(local.year, local.month - 1, local.day + days),
  );
  return {
    day: date.getUTCDate(),
    month: date.getUTCMonth() + 1,
    year: date.getUTCFullYear(),
  };
}

function quietHoursState(
  now: string,
  preferences: Pick<NotificationDeliveryPreferences, "quietHours" | "timeZone">,
): QuietHoursState {
  const start = parseClock(preferences.quietHours.start);
  const end = parseClock(preferences.quietHours.end);
  const nowMs = Date.parse(now);
  if (!start || !end || !Number.isFinite(nowMs)) {
    return { inQuietHours: true, nextEndAt: null, valid: false };
  }
  try {
    const local = zonedParts(nowMs, preferences.timeZone);
    const current = local.hour * 60 + local.minute;
    const startMinute = start.hour * 60 + start.minute;
    const endMinute = end.hour * 60 + end.minute;
    const inQuietHours =
      startMinute === endMinute
        ? false
        : startMinute > endMinute
          ? current >= startMinute || current < endMinute
          : current >= startMinute && current < endMinute;
    if (!inQuietHours) {
      return { inQuietHours: false, nextEndAt: null, valid: true };
    }

    const endDate =
      startMinute > endMinute && current >= startMinute
        ? localDateAfter(local, 1)
        : localDateAfter(local, 0);
    let candidate = zonedLocalToInstant(
      { ...endDate, hour: end.hour, minute: end.minute },
      preferences.timeZone,
    );
    if (!Number.isFinite(candidate) || candidate <= nowMs) {
      const nextDate = localDateAfter(local, 1);
      candidate = zonedLocalToInstant(
        { ...nextDate, hour: end.hour, minute: end.minute },
        preferences.timeZone,
      );
    }
    return {
      inQuietHours: true,
      nextEndAt: Number.isFinite(candidate) && candidate > nowMs
        ? new Date(candidate).toISOString()
        : null,
      valid: true,
    };
  } catch {
    return { inQuietHours: true, nextEndAt: null, valid: false };
  }
}

export interface NotificationDeliveryWorkerResult {
  claimed: number;
  deferred: number;
  receiptPending: number;
  sent: number;
  retried: number;
  suppressed: number;
  deadLettered: number;
}

export function createNotificationDeliveryWorker(input: {
  delivery: NotificationDeliveryService;
  devices: PushDeviceService;
  push: OrbitPushAdapter | null;
  preferences?: () => Promise<NotificationDeliveryPreferences>;
  now?: () => string;
  dailyPushLimit?: number;
  sourceEligible?: (delivery: NotificationDelivery) => Promise<boolean>;
}) {
  return {
    async run(options: { workerId: string; limit?: number }): Promise<NotificationDeliveryWorkerResult> {
      const now = input.now?.() ?? new Date().toISOString();
      const limit = Math.max(1, Math.min(100, options.limit ?? 25));
      const claimed = await input.delivery.claimReady({
        limit,
        now,
        workerId: required(options.workerId, "Worker"),
      });
      const result: NotificationDeliveryWorkerResult = {
        claimed: claimed.length,
        deferred: 0,
        deadLettered: 0,
        receiptPending: 0,
        retried: 0,
        sent: 0,
        suppressed: 0,
      };
      const preferences = input.preferences ? await input.preferences() : null;
      if (input.push?.getReceipt) {
        const pendingReceipts = await input.delivery.list({
          limit: 500,
          status: "receipt_pending",
        });
        for (const pending of pendingReceipts) {
          if (!pending.providerReceiptId) continue;
          try {
            const receipt = await input.push.getReceipt(pending.providerReceiptId);
            if (receipt.status === "pending") continue;
            if (receipt.status === "ok") {
              await input.delivery.markReceiptVerified({
                deliveryId: pending.deliveryId,
                now,
                providerReceiptId: pending.providerReceiptId,
              });
              continue;
            }
            if (/DeviceNotRegistered|not registered|invalid token/i.test(receipt.error ?? "")) {
              await input.devices.revoke(pending.deviceId);
            }
            await input.delivery.markReceiptFailed({
              deliveryId: pending.deliveryId,
              error: receipt.error ?? "Push provider receipt failed.",
              now,
              providerReceiptId: pending.providerReceiptId,
            });
          } catch {
            // Receipt lookup is best effort. Keep the durable receipt pending
            // so a later worker can reconcile it without sending another push.
          }
        }
      }
      const devices = await input.devices.listActive();
      const dayStart = localDateStart(now, preferences?.timeZone);
      const alreadySent = (await input.delivery.list({ limit: 500 })).filter(
        (delivery) =>
          (delivery.status === "sent" || delivery.status === "receipt_pending") &&
          delivery.updatedAt >= dayStart,
      ).length;
      let sentToday = alreadySent;

      for (const delivery of claimed) {
        if (input.sourceEligible && !(await input.sourceEligible(delivery))) {
          await input.delivery.markSuppressed({
            deliveryId: delivery.deliveryId,
            now,
            reason: "source_inactive",
            workerId: options.workerId,
          });
          result.suppressed += 1;
          continue;
        }
        const enabled =
          !preferences ||
          (delivery.phase === "pre_event"
            ? preferences.preEventBriefPushEnabled
            : delivery.phase === "post_event"
              ? preferences.postEventReminderPushEnabled
              : (preferences.followupDuePushEnabled ?? true));
        const quietHours = preferences
          ? quietHoursState(now, preferences)
          : { inQuietHours: false, nextEndAt: null, valid: true };
        if (!enabled) {
          await input.delivery.markSuppressed({
            deliveryId: delivery.deliveryId,
            now,
            reason: !enabled ? "preference_disabled" : "quiet_hours",
            workerId: options.workerId,
          });
          result.suppressed += 1;
          continue;
        }
        if (preferences && quietHours.inQuietHours) {
          if (quietHours.nextEndAt) {
            await input.delivery.defer({
              availableAt: quietHours.nextEndAt,
              deliveryId: delivery.deliveryId,
              now,
              workerId: options.workerId,
            });
            result.deferred += 1;
          } else {
            await input.delivery.markSuppressed({
              deliveryId: delivery.deliveryId,
              now,
              reason: quietHours.valid ? "quiet_hours_unresolvable" : "invalid_quiet_hours",
              workerId: options.workerId,
            });
            result.suppressed += 1;
          }
          continue;
        }
        if (sentToday >= (input.dailyPushLimit ?? NOTIFICATION_DELIVERY_DAILY_PUSH_LIMIT)) {
          await input.delivery.markSuppressed({
            deliveryId: delivery.deliveryId,
            now,
            reason: "daily_push_limit",
            workerId: options.workerId,
          });
          result.suppressed += 1;
          continue;
        }
        if (!input.push) {
          await input.delivery.markSuppressed({
            deliveryId: delivery.deliveryId,
            now,
            reason: "push_provider_unconfigured",
            workerId: options.workerId,
          });
          result.suppressed += 1;
          continue;
        }
        const device = devices.find((candidate) => candidate.deviceId === delivery.deviceId);
        if (!device) {
          await input.delivery.markSuppressed({
            deliveryId: delivery.deliveryId,
            now,
            reason: "device_revoked",
            workerId: options.workerId,
          });
          result.suppressed += 1;
          continue;
        }

        let receipt: { receiptId: string; verified?: boolean } | null = null;
        let lastError: unknown = null;
        try {
          receipt = await input.push.send({
            body: delivery.body,
            data: delivery.data,
            title: delivery.title,
            token: device.token,
          });
        } catch (error) {
          lastError = error;
        }
        if (receipt?.receiptId && receipt.verified) {
          await input.delivery.markSent({
            deliveryId: delivery.deliveryId,
            now,
            providerReceiptId: receipt.receiptId,
            workerId: options.workerId,
          });
          sentToday += 1;
          result.sent += 1;
        } else if (receipt?.receiptId) {
          await input.delivery.markReceiptPending({
            deliveryId: delivery.deliveryId,
            now,
            providerReceiptId: receipt.receiptId,
            workerId: options.workerId,
          });
          sentToday += 1;
          result.receiptPending += 1;
        } else if (lastError && isPermanentPushError(lastError)) {
          if (isDeviceNotRegistered(lastError)) {
            await input.devices.revoke(delivery.deviceId);
          }
          await input.delivery.markSuppressed({
            deliveryId: delivery.deliveryId,
            now,
            reason: "invalid_push_token",
            workerId: options.workerId,
          });
          result.suppressed += 1;
        } else {
          const updated = await input.delivery.markRetry({
            deliveryId: delivery.deliveryId,
            error: lastError instanceof Error ? lastError.message : "Push provider failed.",
            now,
            workerId: options.workerId,
          });
          if (updated.status === "dead_letter") result.deadLettered += 1;
          else result.retried += 1;
        }
      }
      return result;
    },
  };
}

interface NotificationDeliveryServiceGlobal {
  __orbitNotificationDeliveryServices?: Map<string, NotificationDeliveryService>;
  __orbitNotificationDeliveryMemoryStores?: Map<string, LiveRecordStoreLike<NotificationDeliveryRecordPayload>>;
}

const notificationDeliveryGlobal = globalThis as typeof globalThis & NotificationDeliveryServiceGlobal;

export interface ConfiguredNotificationDeliveryServiceOptions {
  actorId: string;
  env?: LiveDatabaseEnv;
}

export function createNotificationDeliveryService(
  input: ConfiguredNotificationDeliveryServiceOptions,
): NotificationDeliveryService {
  const actorId = required(input.actorId, "Actor");
  const configured = createConfiguredPostgresLiveRecordStore<NotificationDeliveryRecordPayload>({
    env: input.env,
  });
  const baseWorkspaceId = configured?.workspaceId ?? "orbit-notification-local";
  const key = `${baseWorkspaceId}\u0000${actorId}`;
  const services = notificationDeliveryGlobal.__orbitNotificationDeliveryServices ?? new Map<string, NotificationDeliveryService>();
  notificationDeliveryGlobal.__orbitNotificationDeliveryServices = services;
  const existing = services.get(key);
  if (existing) return existing;
  const memoryStores = notificationDeliveryGlobal.__orbitNotificationDeliveryMemoryStores ?? new Map<string, LiveRecordStoreLike<NotificationDeliveryRecordPayload>>();
  notificationDeliveryGlobal.__orbitNotificationDeliveryMemoryStores = memoryStores;
  const store =
    configured?.store ??
    memoryStores.get(key) ??
    createMemoryLiveRecordStore<NotificationDeliveryRecordPayload>();
  if (!configured) memoryStores.set(key, store);
  const service = createStorageNotificationDeliveryService({
    actorId,
    devices: createPushDeviceService({ actorId, env: input.env }),
    sqlClient: configured?.client,
    store,
    workspaceId: baseWorkspaceId,
  });
  services.set(key, service);
  return service;
}

export function resetNotificationDeliveryServicesForTests(): void {
  notificationDeliveryGlobal.__orbitNotificationDeliveryServices?.clear();
  notificationDeliveryGlobal.__orbitNotificationDeliveryMemoryStores?.clear();
}
