import type { OrbitPushAdapter } from "../../notifications/push-adapter";
import { shouldSendPreEventNudge } from "../../notifications/push-adapter";
import type { NotificationDeliveryService } from "../../notifications/delivery-service";
import { eventPilotDecision } from "../../../shared/config/event-pilot-gate";
import type { PreEventBriefInput } from "./pre-event-brief-v1";
import { createPreEventBriefWorkflow } from "./pre-event-brief-v1";
import type { AgentRuntimeService } from "../../agent/runtime/service";
import type { PreEventBriefCandidateCollector } from "./pre-event-brief-candidate-source";

export interface ScheduledBriefCandidate extends PreEventBriefInput {
  eventRevision?: string;
  eventVersion?: number;
  timeZone?: string;
  viewedAt?: string;
  costlyMiss: boolean;
  pushEnabled: boolean;
  pushToken?: string;
}

export function createAgentWorkflowScheduler(input: {
  collector: PreEventBriefCandidateCollector;
  delivery?: NotificationDeliveryService;
  runtime: AgentRuntimeService;
  push: OrbitPushAdapter | null;
  env?: Readonly<Record<string, string | undefined>>;
  now?: () => string;
  preferences?: {
    preEventBriefPushEnabled: boolean;
    quietHours: { start: string; end: string };
    timeZone: string;
  };
}) {
  return {
    async tick() {
      const now = input.now?.() ?? new Date().toISOString();
      const candidates = await input.collector.collect({ now });
      const workflow = createPreEventBriefWorkflow(input.runtime);
      const generated = [];
      const pushed = [];
      const skipped = [];

      for (const candidate of candidates) {
        const pilot = eventPilotDecision({
          capability: "proactive_reminders",
          env: input.env,
          eventId: candidate.eventId,
        });
        if (!pilot.enabled) {
          skipped.push(candidate.eventId);
          continue;
        }
        const remaining = Date.parse(candidate.startsAt) - Date.parse(now);
        if (
          !Number.isFinite(remaining) ||
          remaining <= 0 ||
          remaining > 24 * 60 * 60_000
        ) {
          skipped.push(candidate.eventId);
          continue;
        }

        const result = await workflow.run({
          ...candidate,
          trigger: "scheduler",
        });
        generated.push(result);
        const briefAction = result.actions.find((action) =>
          action.operations.some(
            (operation) => operation.operationType === "generate_meeting_brief",
          ),
        );

        if (
          shouldSendPreEventNudge({
            now,
            startsAt: candidate.startsAt,
            viewedAt: candidate.viewedAt ?? briefAction?.viewedAt,
            costlyMiss: candidate.costlyMiss,
            pushEnabled:
              candidate.pushEnabled &&
              (input.preferences?.preEventBriefPushEnabled ?? true),
            quietHours: input.preferences?.quietHours,
            timeZone: input.preferences?.timeZone,
          })
        ) {
          if (input.delivery) {
            const queued = await input.delivery.materialize({
              body: "你有一条会前准备提醒，打开 Orbit 查看。",
              phase: "pre_event",
              scheduledFor: now,
              signalId: `event_upcoming:${candidate.eventId}`,
              signalRevision:
                candidate.eventRevision ??
                `${candidate.eventVersion ?? "legacy"}:${candidate.startsAt}`,
              title: "Orbit 提醒",
            });
            if (queued.created) {
              pushed.push({
                deliveryId: queued.delivery.deliveryId,
                eventId: candidate.eventId,
              });
            }
          } else if (candidate.pushToken && input.push) {
            // Compatibility path for isolated workflow tests. Production route
            // always supplies the durable delivery service above.
            const receipt = await input.push.send({
              token: candidate.pushToken,
              title: "Orbit 提醒",
              body: "你有一条会前准备提醒，打开 Orbit 查看。",
              data: {
                deliveryId: `legacy:event:${candidate.eventId}`,
              },
            });
            pushed.push({
              eventId: candidate.eventId,
              receiptId: receipt.receiptId,
            });
          }
        }
      }

      return { generated, pushed, skipped };
    },
  };
}
