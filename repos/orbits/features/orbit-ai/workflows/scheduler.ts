import type { OrbitPushAdapter } from "../../notifications/push-adapter";
import { shouldSendPreEventNudge } from "../../notifications/push-adapter";
import type { PreEventBriefInput } from "./pre-event-brief-v1";
import { createPreEventBriefWorkflow } from "./pre-event-brief-v1";
import type { AgentRuntimeService } from "../../agent/runtime/service";

export interface ScheduledBriefCandidate extends PreEventBriefInput {
  viewedAt?: string;
  costlyMiss: boolean;
  pushEnabled: boolean;
  pushToken?: string;
}

export function createAgentWorkflowScheduler(input: {
  runtime: AgentRuntimeService;
  push: OrbitPushAdapter | null;
  now?: () => string;
  preferences?: {
    preEventBriefPushEnabled: boolean;
    quietHours: { start: string; end: string };
  };
}) {
  return {
    async tick(candidates: readonly ScheduledBriefCandidate[]) {
      const now = input.now?.() ?? new Date().toISOString();
      const workflow = createPreEventBriefWorkflow(input.runtime);
      const generated = [];
      const pushed = [];
      const skipped = [];

      for (const candidate of candidates) {
        const remaining = Date.parse(candidate.startsAt) - Date.parse(now);
        if (
          !Number.isFinite(remaining) ||
          remaining <= 0 ||
          remaining > 24 * 60 * 60_000
        ) {
          skipped.push(candidate.eventId);
          continue;
        }

        generated.push(
          await workflow.run({
            ...candidate,
            trigger: "scheduler",
          }),
        );

        if (
          candidate.pushToken &&
          input.push &&
          shouldSendPreEventNudge({
            now,
            startsAt: candidate.startsAt,
            viewedAt: candidate.viewedAt,
            costlyMiss: candidate.costlyMiss,
            pushEnabled:
              candidate.pushEnabled &&
              (input.preferences?.preEventBriefPushEnabled ?? true),
            quietHours: input.preferences
              ? {
                  startHour: Number(
                    input.preferences.quietHours.start.split(":")[0],
                  ),
                  endHour: Number(
                    input.preferences.quietHours.end.split(":")[0],
                  ),
                }
              : undefined,
          })
        ) {
          const receipt = await input.push.send({
            token: candidate.pushToken,
            title: `还有 2 小时：${candidate.title}`,
            body: "会前简报已准备，查看重点人物和未完成承诺。",
            data: {
              eventId: candidate.eventId,
              href: `/app/today?event=${encodeURIComponent(candidate.eventId)}`,
              kind: "pre_event_brief",
            },
          });
          pushed.push({ eventId: candidate.eventId, receiptId: receipt.receiptId });
        }
      }

      return { generated, pushed, skipped };
    },
  };
}
