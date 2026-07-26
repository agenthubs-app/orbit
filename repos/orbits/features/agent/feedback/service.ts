import type {
  LiveRecord,
  LiveRecordStoreLike,
} from "../../../shared/storage/live-record-store";
import type {
  AgentFeedback,
  AgentFeedbackOutcome,
  AgentFeedbackRating,
  AgentFeedbackRecordPayload,
  AgentFeedbackService,
  UpsertAgentFeedbackInput,
} from "./contract";
import {
  AGENT_FEEDBACK_OUTCOMES,
  AGENT_FEEDBACK_RATINGS,
} from "./contract";

export const AGENT_FEEDBACK_COLLECTION = "agentFeedback" as const;

function required(value: string, label: string, maximum: number): string {
  const normalized = value.trim();
  if (!normalized) throw new Error(`${label} is required.`);
  if (normalized.length > maximum) {
    throw new Error(`${label} must be ${maximum} characters or fewer.`);
  }
  return normalized;
}

function strings(
  values: readonly string[] | undefined,
  maximum: number,
): string[] {
  return [
    ...new Set(
      (values ?? []).flatMap((value) => {
        const normalized = value.trim();
        return normalized && normalized.length <= 240 ? [normalized] : [];
      }),
    ),
  ].slice(0, maximum);
}

function rating(value: AgentFeedbackRating | undefined) {
  if (
    value !== undefined &&
    !AGENT_FEEDBACK_RATINGS.includes(value)
  ) {
    throw new Error("Unknown Agent feedback rating.");
  }
  return value;
}

function outcome(value: AgentFeedbackOutcome | undefined) {
  if (
    value !== undefined &&
    !AGENT_FEEDBACK_OUTCOMES.includes(value)
  ) {
    throw new Error("Unknown Agent feedback outcome.");
  }
  return value;
}

function actorWorkspaceId(workspaceId: string, actorId: string): string {
  return `${workspaceId}:agent-actor:${required(actorId, "Actor id", 180)}`;
}

function feedbackRecord(
  workspaceId: string,
  feedback: AgentFeedback,
): LiveRecord<AgentFeedbackRecordPayload> {
  return {
    workspaceId,
    collectionName: AGENT_FEEDBACK_COLLECTION,
    recordId: feedback.feedbackId,
    sourceType: "agent_action",
    sourceId: feedback.runId,
    sourceLabel: "User-recorded Agent result feedback",
    evidenceIds: feedback.evidenceIds,
    lifecycleState: "active",
    searchText: [
      feedback.rating,
      feedback.outcome,
      ...feedback.sourceModules,
    ]
      .filter(Boolean)
      .join(" "),
    payload: { kind: "agent_feedback", feedback },
    createdAt: feedback.createdAt,
    updatedAt: feedback.updatedAt,
  };
}

export function createStorageAgentFeedbackService(input: {
  actorId: string;
  store: LiveRecordStoreLike<AgentFeedbackRecordPayload>;
  workspaceId: string;
  now?: () => string;
}): AgentFeedbackService {
  const scopedWorkspaceId = actorWorkspaceId(
    input.workspaceId,
    input.actorId,
  );
  const now = input.now ?? (() => new Date().toISOString());

  async function records() {
    return input.store.listRecords({
      workspaceId: scopedWorkspaceId,
      collectionName: AGENT_FEEDBACK_COLLECTION,
    });
  }

  async function list() {
    return (await records())
      .flatMap((record) =>
        record.payload.kind === "agent_feedback"
          ? [record.payload.feedback]
          : [],
      )
      .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
  }

  async function get(runId: string) {
    const normalizedRunId = required(runId, "Run id", 240);
    const record = await input.store.getRecord({
      workspaceId: scopedWorkspaceId,
      collectionName: AGENT_FEEDBACK_COLLECTION,
      recordId: `feedback:${normalizedRunId}`,
    });
    return record?.payload.kind === "agent_feedback"
      ? record.payload.feedback
      : null;
  }

  return {
    list,
    get,
    async upsert(candidate: UpsertAgentFeedbackInput) {
      const runId = required(candidate.runId, "Run id", 240);
      const existing = await get(runId);
      const timestamp = now();
      const nextRating = rating(candidate.rating ?? existing?.rating);
      const nextOutcome = outcome(candidate.outcome ?? existing?.outcome);
      if (!nextRating && !nextOutcome) {
        throw new Error("A feedback rating or business outcome is required.");
      }
      const feedback: AgentFeedback = {
        feedbackId: `feedback:${runId}`,
        runId,
        ...(nextRating ? { rating: nextRating } : {}),
        ...(nextOutcome ? { outcome: nextOutcome } : {}),
        sourceModules: strings(
          candidate.sourceModules ?? existing?.sourceModules,
          12,
        ),
        evidenceIds: strings(
          candidate.evidenceIds ?? existing?.evidenceIds,
          40,
        ),
        createdAt: existing?.createdAt ?? timestamp,
        updatedAt: timestamp,
      };
      await input.store.upsertRecord(
        feedbackRecord(scopedWorkspaceId, feedback),
      );
      return feedback;
    },
    async remove(runId: string) {
      const existing = await get(runId);
      if (!existing) return;
      await input.store.deleteRecord({
        workspaceId: scopedWorkspaceId,
        collectionName: AGENT_FEEDBACK_COLLECTION,
        recordId: existing.feedbackId,
        deletedAt: now(),
      });
    },
    async context(limit = 12) {
      return (await list())
        .slice(0, Math.max(0, Math.min(30, Math.floor(limit))))
        .map((feedback) => ({
          summary: [
            feedback.rating
              ? `The user marked an earlier Agent result ${feedback.rating}.`
              : "",
            feedback.outcome
              ? `The reported business outcome was ${feedback.outcome}.`
              : "",
            feedback.sourceModules.length > 0
              ? `The result used ${feedback.sourceModules.join(", ")} data.`
              : "",
          ]
            .filter(Boolean)
            .join(" "),
        }));
    },
  };
}
