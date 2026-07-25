import type { OrbitPushAdapter } from "../../notifications/push-adapter";
import { shouldSendPreEventNudge } from "../../notifications/push-adapter";
import type { PreEventBriefInput } from "./pre-event-brief-v1";
import { createPreEventBriefWorkflow } from "./pre-event-brief-v1";
import type { AgentRuntimeService } from "../../agent/runtime/service";
import type { PreEventBriefCandidateCollector } from "./pre-event-brief-candidate-source";

export interface ScheduledBriefCandidate extends PreEventBriefInput {
  viewedAt?: string;
  costlyMiss: boolean;
  pushEnabled: boolean;
  pushToken?: string;
}

export function createAgentWorkflowScheduler(input: {
  collector: PreEventBriefCandidateCollector;
  runtime: AgentRuntimeService;
  push: OrbitPushAdapter | null;
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
          candidate.pushToken &&
          input.push &&
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
          pushed.push({
            eventId: candidate.eventId,
            receiptId: receipt.receiptId,
          });
        }
      }

      return { generated, pushed, skipped };
    },
  };
}
