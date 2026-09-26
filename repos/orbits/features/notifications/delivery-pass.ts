import { createConfiguredEventOperationsPostgresRuntime } from "../events/event-operations/storage/postgres-client";
import { createConfiguredExpoPushAdapter } from "./push-adapter";
import { createConfiguredPushDeviceActorEnumerator } from "./push-device-service";
import type { DeliveryPolicyRepository } from './delivery-policy-repository';
import { createTypedDeliveryRuntime } from './typed-delivery-factory';

// One bounded delivery pass over every opted-in actor. The long-running
// `scripts/run-notification-delivery-worker.ts` loop and the scheduled
// maintenance pass share this body so redelivery does not depend on a
// never-ending process being alive somewhere.

export interface NotificationDeliveryPassCounts {
  claimed: number;
  deferred: number;
  deadLettered: number;
  receiptPending: number;
  receiptUnknown: number;
  retried: number;
  sent: number;
  suppressed: number;
}

export interface NotificationDeliveryPassResult {
  actorCount: number;
  /** Actors skipped because the caller's deadline passed. */
  deferredActors: number;
  result: NotificationDeliveryPassCounts;
  workerId: string;
}

export interface NotificationDeliveryPassOptions {
  /** Epoch milliseconds; actors are not started once it has passed. */
  deadline?: number;
  actors?: { listOptedInActorIds(): Promise<string[]> } | null;
  eventRuntime?: ReturnType<typeof createConfiguredEventOperationsPostgresRuntime>;
  limit?: number;
  now?: string;
  push?: ReturnType<typeof createConfiguredExpoPushAdapter>;
  workerId: string;
}

export class NotificationDeliveryUnconfigured extends Error {
  constructor(readonly reason: "actor_database" | "event_database") {
    super(`Notification delivery is unavailable: ${reason} is not configured.`);
    this.name = "NotificationDeliveryUnconfigured";
  }
}

type TypedCutover = {
  batchId: string;
  enabled: boolean;
  generation: number;
  legacyBlocked?: boolean;
  since: string;
};

type TypedCutoverRepository = Pick<DeliveryPolicyRepository, 'cutover' | 'get' | 'save' | 'tx'>;

export async function ensureTypedDeliveryCutover(input: {
  actorId: string;
  now: string;
  repository: TypedCutoverRepository;
}): Promise<TypedCutover> {
  const existing = await input.repository.cutover(input.actorId);
  if (existing) return existing;
  return input.repository.tx(input.actorId, async (database) => {
    const current = await input.repository.get<TypedCutover>(database, 'notificationCutover', input.actorId);
    if (current) return current;
    const next: TypedCutover = {
      enabled: true,
      legacyBlocked: true,
      generation: 1,
      since: input.now,
      batchId: 'typed-default',
    };
    await input.repository.save(database, 'notificationCutover', input.actorId, input.actorId, next);
    return next;
  });
}

export async function runNotificationDeliveryPass(
  options: NotificationDeliveryPassOptions,
): Promise<NotificationDeliveryPassResult> {
  const actors = options.actors === undefined ? createConfiguredPushDeviceActorEnumerator() : options.actors;
  if (!actors) throw new NotificationDeliveryUnconfigured("actor_database");
  const eventRuntime = options.eventRuntime === undefined
    ? createConfiguredEventOperationsPostgresRuntime()
    : options.eventRuntime;
  if (!eventRuntime) throw new NotificationDeliveryUnconfigured("event_database");
  const push = options.push === undefined ? createConfiguredExpoPushAdapter() : options.push;
  const now = options.now ?? new Date().toISOString();
  const { workerId } = options;
  const actorIds = await actors.listOptedInActorIds();
  const total: NotificationDeliveryPassCounts = {
    claimed: 0, deferred: 0, deadLettered: 0, receiptPending: 0, receiptUnknown: 0, retried: 0, sent: 0, suppressed: 0,
  };
  let deferredActors = 0;

  for (const [index, actorId] of actorIds.entries()) {
    if (options.deadline !== undefined && Date.now() >= options.deadline) {
      deferredActors += 1;
      continue;
    }
    const typed = createTypedDeliveryRuntime({ ...eventRuntime, actorId, now: () => now, push });
    await ensureTypedDeliveryCutover({ actorId, now, repository: typed.repository });
    await typed.materialize();
    const result = await typed.worker.run({ limit: options.limit ?? 25, workerId: `${workerId}:${index}` });
    for (const key of Object.keys(total) as (keyof NotificationDeliveryPassCounts)[]) total[key] += result[key];
  }
  return { actorCount: actorIds.length, deferredActors, result: total, workerId };
}
