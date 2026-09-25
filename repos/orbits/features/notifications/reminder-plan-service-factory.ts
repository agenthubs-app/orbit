import { createConfiguredPostgresLiveRecordStore } from "../../shared/storage/configured-live-record-store";
import { createPostgresLiveRecordStore } from "../../shared/storage/postgres-live-record-store";
import { createReminderPlanRepository } from "./reminder-plan-repository";
import { createReminderPlanService, type ReminderTargetAuthorizer } from "./reminder-plan-service";
import { createReminderPushDeviceGateway } from "./push-device-reminder-adapter";
import { createPushDeviceService } from "./push-device-service";
import { createConfiguredTransactionalPostgresRuntime } from '../../shared/storage/transactional-postgres';
import type { LiveRecordStoreLike } from '../../shared/storage/live-record-store';
import type { ReminderTargetType } from './reminder-plan-contract';
import { assertCanonicalReminderTargetOwned, type CanonicalReminderWakePublisher } from "./canonical-reminder-wake";
import { createCanonicalReminderCommandService, type CanonicalReminderCommandRuntime } from "./canonical-reminder-command-transaction";
import type { LiveDatabaseEnv } from "../../shared/storage/live-database-config";
import { createInboxProjectionWorkRepository } from "./storage/inbox-projection-work";

export async function assertReminderTargetOwned(input: { store: LiveRecordStoreLike; workspaceId: string; actorId: string; targetId: string; targetType: ReminderTargetType }) {
  return assertCanonicalReminderTargetOwned(input);
}

export interface ConfiguredReminderPlanServiceOptions {
  env?: LiveDatabaseEnv;
  runtime?: CanonicalReminderCommandRuntime;
  now?: () => string;
  publisher?: CanonicalReminderWakePublisher;
}

export function createConfiguredReminderPlanService(options: ConfiguredReminderPlanServiceOptions = {}) {
  const transactional = options.runtime ?? createConfiguredTransactionalPostgresRuntime({ env: options.env, max: 2 });
  const configured = options.runtime
    ? { store: createPostgresLiveRecordStore({ client: options.runtime.client }), workspaceId: options.runtime.workspaceId }
    : createConfiguredPostgresLiveRecordStore({ env: options.env });
  if (!configured) throw new Error("Reminder plan storage is not configured");
  if (!transactional || transactional.workspaceId !== configured.workspaceId) throw new Error("Reminder plan transactional storage is not configured");
  const now = options.now ?? options.runtime?.now ?? (() => new Date().toISOString());
  const targetAuthorizer: ReminderTargetAuthorizer = {
    assertOwned: command => assertReminderTargetOwned({ ...configured, ...command }),
  };
  const base = createReminderPlanService({
    withDeliveryGate: async (actorId, operation) => {
      await transactional.client.transaction(async db => {
        await db.query('select pg_advisory_xact_lock(hashtextextended($1,0))', [JSON.stringify(['notification-delivery-policy', configured.workspaceId, actorId])]);
        await operation();
      });
    },
    deliveryManagedExternally: async (actorId) => {
      const state = await configured.store.getRecord({ workspaceId: configured.workspaceId, collectionName: 'notificationCutover', recordId: actorId });
      return state?.userId === actorId && (state.payload.enabled === true || state.payload.legacyBlocked === true);
    },
    now,
    pushDevices: createReminderPushDeviceGateway({
      serviceForActor: (actorId) => createPushDeviceService({ actorId }),
    }),
    repository: createReminderPlanRepository({ store: configured.store, workspaceId: configured.workspaceId }),
    targetAuthorizer,
  });
  const commands = createCanonicalReminderCommandService({
    runtime: {
      client: transactional.client,
      workspaceId: configured.workspaceId,
      now,
      publisher: options.publisher ?? options.runtime?.publisher,
      inboxProjection: (options.env ?? process.env).ORBIT_CANONICAL_INBOX_PROJECTION === "1"
        ? options.runtime?.inboxProjection ?? createInboxProjectionWorkRepository({client:transactional.client,workspaceId:configured.workspaceId,now})
        : undefined,
    },
  });
  return { ...base, ...commands };
}
