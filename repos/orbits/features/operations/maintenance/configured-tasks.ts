import { createConfiguredPostgresLiveRecordStore } from "../../../shared/storage/configured-live-record-store";
import {
  getConfiguredEventOperationsDispatchRuntime,
  readEventOperationsPendingWork,
} from "../../events/event-operations/cloud-worker";
import { publishEventOperationsWake } from "../../events/event-operations/queue";
import { getConfiguredIngestV2 } from "../../acquisition/business-card-ingest-v2/configured";
import { redispatchPendingCardWork } from "../../acquisition/business-card-dispatch-scan";
import { getConfiguredCardUploadSources } from "../../acquisition/storage/business-card-upload-source-runtime";
import { redispatchPendingAgentActions } from "../../agent/runtime/dispatch-scan";
import { dispatchPasswordResetMail } from "../../auth/password-reset-dispatch";
import { NotificationDeliveryUnconfigured, runNotificationDeliveryPass } from "../../notifications/delivery-pass";
import { createConfiguredCanonicalReminderMaintenanceTask } from "../../notifications/configured-canonical-reminder-maintenance";
import type { MaintenanceTask } from "./pass";

// The production task list. Each task checks its own configuration and reports
// `skipped` instead of failing when a subsystem is intentionally absent (no
// private Blob, no mail transport, no push database), so an unconfigured
// environment does not turn every scheduled pass into an alert.

export function createConfiguredMaintenanceTasks({
  env = process.env,
  workerId = "maintenance",
}: { env?: NodeJS.ProcessEnv; workerId?: string } = {}): MaintenanceTask[] {
  const queueAvailable = env.VERCEL === "1";
  return [
    createConfiguredCanonicalReminderMaintenanceTask({ env, workerId }),
    {
      // A queue publish is a wake, not the work ledger. This scan repairs a
      // lost producer publish and also wakes outbox rows created by event
      // registration/check-in paths that do not go through generation start.
      name: "event_operations_redispatch",
      async run() {
        if (!queueAvailable) return { skipped: "queue_unavailable" };
        const configured = getConfiguredEventOperationsDispatchRuntime();
        if (!configured) return { skipped: "database_unconfigured" };
        await configured.ready;
        const pending = await readEventOperationsPendingWork({
          aiRequestFingerprint: configured.aiRequestFingerprint,
          client: configured.client,
          workspaceId: configured.workspaceId,
        });
        if (!pending.generationPending && !pending.outboxPending) {
          return { examined: 0, published: 0 };
        }
        await publishEventOperationsWake({
          reason: "maintenance",
          workspaceId: configured.workspaceId,
        });
        return {
          examined: Number(pending.generationPending) + Number(pending.outboxPending),
          published: 1,
        };
      },
    },
    {
      // Re-publishes one queue wake per pipeline whenever the database still
      // holds unfinished card work, expired raw uploads or pending cleanups.
      name: "business_card_redispatch",
      async run() {
        if (!queueAvailable) return { skipped: "queue_unavailable" };
        const configured = createConfiguredPostgresLiveRecordStore();
        if (!configured) return { skipped: "database_unconfigured" };
        const { examined, published, failed } = await redispatchPendingCardWork({
          client: configured.client, workspaceId: configured.workspaceId,
        });
        return { examined, published, failed };
      },
    },
    {
      name: "agent_action_redispatch",
      async run() {
        if (!queueAvailable) return { skipped: "queue_unavailable" };
        const configured = createConfiguredPostgresLiveRecordStore();
        if (!configured) return { skipped: "database_unconfigured" };
        const { examined, published, failed } = await redispatchPendingAgentActions({
          client: configured.client, workspaceId: configured.workspaceId,
        });
        return { examined, published, failed };
      },
    },
    {
      // Safety net for the password-reset queue: delivers up to three leased
      // mails whose queue wake was lost.
      name: "password_reset_redelivery",
      async run() {
        const counts = await dispatchPasswordResetMail(3);
        if (!counts.configured) return { skipped: "mail_unconfigured" };
        return { sent: counts.sent, retry: counts.retry };
      },
    },
    {
      // Physically deletes consumed or expired raw uploads once every issued
      // upload grant has expired (the repository owns that fence).
      name: "raw_upload_reclaim",
      async run() {
        const sources = await getConfiguredCardUploadSources();
        if (!sources) return { skipped: "private_blob_unconfigured" };
        const v1 = await sources.reap("v1");
        const v2 = await sources.reap("v2");
        return { deleted: v1.deleted + v2.deleted, failed: v1.failed + v2.failed };
      },
    },
    {
      // Orphaned V2 derivative images whose batch item never attached them.
      // V1 derivative cleanup runs inside the V1 queue tick that
      // business_card_redispatch wakes.
      name: "derivative_image_reclaim",
      async run() {
        const ingest = getConfiguredIngestV2();
        if (!ingest) return { skipped: "database_unconfigured" };
        await ingest.ready;
        if (!ingest.store.reapUnattachedWrites) return { skipped: "filesystem_store" };
        return { deleted: await ingest.store.reapUnattachedWrites() };
      },
    },
    {
      name: "notification_redelivery",
      async run({ deadline }) {
        try {
          const pass = await runNotificationDeliveryPass({ deadline, workerId });
          return {
            actors: pass.actorCount,
            deferredActors: pass.deferredActors,
            claimed: pass.result.claimed,
            sent: pass.result.sent,
            retried: pass.result.retried,
            deadLettered: pass.result.deadLettered,
          };
        } catch (error) {
          if (error instanceof NotificationDeliveryUnconfigured) return { skipped: error.reason };
          throw error;
        }
      },
    },
  ];
}
