import type { AgentRuntimeService } from "../../agent/runtime/service";
import type { EventMatchmakingService, MatchmakingParticipant } from "../../events/matchmaking/service";
import type { OrbitKnownWorkflow } from "./contract";
import { workflowId } from "./id";

export interface EventMatchmakingInput {
  eventId: string;
  eventTitle: string;
  requester: MatchmakingParticipant;
  candidates: readonly MatchmakingParticipant[];
  conversationId?: string;
  trigger?: "chat" | "today" | "manual";
  limit?: number;
}

export interface EventMatchmakingArtifact {
  eventId: string;
  matches: ReturnType<EventMatchmakingService["rank"]>;
  organizerMetrics: {
    recommendationCount: number;
    aggregateOnly: true;
    privateMemoIncluded: false;
    relationshipHistoryIncluded: false;
    privateFollowupIncluded: false;
  };
}

export function createEventMatchmakingWorkflow(
  runtime: AgentRuntimeService,
  matchmaking: EventMatchmakingService,
): OrbitKnownWorkflow<EventMatchmakingInput, EventMatchmakingArtifact> {
  return {
    key: "event_matchmaking_v1",
    version: 1,
    canHandle: (trigger) =>
      trigger === "event_matchmaking_requested" ||
      trigger === "event_goal_confirmed",
    async run(input) {
      if (!input.eventId.trim() || !input.requester.participantId.trim()) {
        throw new Error("eventId and requester are required.");
      }
      const runId = workflowId("run:event-matchmaking", {
        eventId: input.eventId,
        requesterParticipantId: input.requester.participantId,
        goals: input.requester.goals,
      });
      let run = await runtime.createRun({
        runId,
        workflowKey: "event_matchmaking_v1",
        workflowVersion: 1,
        conversationId: input.conversationId,
        trigger: input.trigger ?? "manual",
      });
      const matches = matchmaking.rank({
        eventId: input.eventId,
        requester: input.requester,
        candidates: input.candidates,
        limit: input.limit ?? 3,
      });
      await runtime.addRunStep({
        stepId: `${runId}:rank`,
        runId,
        kind: "deterministic",
        name: "rank_explainable_event_matches",
        status: "completed",
        attempt: 1,
        inputRef: input.eventId,
        outputRef: `${runId}:matches`,
      });
      const actions = await Promise.all(
        matches.map(async (match) => {
          const actionId = workflowId("action:introduction-request", {
            runId,
            targetParticipantId: match.participantId,
          });
          return runtime.proposeAction({
            actionId,
            runId,
            workflowKey: "event_matchmaking_v1",
            workflowVersion: 1,
            conversationId: input.conversationId,
            title: `申请认识 ${match.displayName}`,
            contactName: match.displayName,
            organization: match.organization,
            whyNow: match.reasons.join("；"),
            riskLevel: "write",
            payloadVersion: 1,
            preview:
              "确认后只向对方发出认识请求；对方同意前不披露联系方式、不创建预约。",
            compensation: {
              supported: false,
              preview: "请求发出后不能静默撤回对方已看到的通知。",
            },
            operations: [
              {
                operationId: `${actionId}:create-request`,
                operationType: "create_intro_request",
                executorKey: "events.createIntroductionRequest",
                idempotencyKey: `${actionId}:v1`,
                payloadVersion: 1,
                payload: {
                  requestId: `intro-request:${actionId}`,
                  eventId: input.eventId,
                  requesterParticipantId: input.requester.participantId,
                  targetParticipantId: match.participantId,
                  proposedSlots:
                    input.requester.availableSlots?.slice(0, 5) ?? [],
                  evidenceIds: match.evidenceIds,
                },
                preview: `向 ${match.displayName} 发出认识请求`,
                riskLevel: "write",
                compensation: { supported: false },
              },
            ],
            evidenceChips: match.evidenceIds.slice(0, 3).map((evidenceId) => ({
              kind: "event_material" as const,
              label: "活动报名画像",
              evidenceId,
            })),
            evidenceIds: match.evidenceIds,
            sourceRefs: [
              {
                type: "event_import",
                id: `source:event:${input.eventId}`,
                label: input.eventTitle,
                providerRecordId: input.eventId,
                generatedBy: "live-store-query",
              },
            ],
          });
        }),
      );
      const detail = await runtime.getRun(runId);
      run = detail?.run ?? run;
      return {
        run,
        actions,
        artifact: {
          eventId: input.eventId,
          matches,
          organizerMetrics: {
            recommendationCount: matches.length,
            aggregateOnly: true,
            privateMemoIncluded: false,
            relationshipHistoryIncluded: false,
            privateFollowupIncluded: false,
          },
        },
      };
    },
  };
}
