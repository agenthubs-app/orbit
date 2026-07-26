import { NextResponse } from "next/server";
import { auth } from "../../../../auth";
import {
  AGENT_FEEDBACK_OUTCOMES,
  AGENT_FEEDBACK_RATINGS,
  type AgentFeedbackOutcome,
  type AgentFeedbackRating,
  type AgentFeedbackService,
  type UpsertAgentFeedbackInput,
} from "../../../../features/agent/feedback/contract";
import { createAgentFeedbackService } from "../../../../features/agent/feedback/service-factory";
import { resolveModuleMode } from "../../../../shared/services/module-mode";

export async function resolveAgentFeedbackRequest(): Promise<{
  service: AgentFeedbackService;
} | null> {
  const session = await auth();
  const actorId = session?.user?.id?.trim();
  if (!actorId) return null;
  return {
    service: createAgentFeedbackService({
      actorId,
      mode: resolveModuleMode(),
    }),
  };
}

export function parseAgentFeedbackInput(
  value: unknown,
): UpsertAgentFeedbackInput | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return null;
  }
  const candidate = value as Record<string, unknown>;
  const runId =
    typeof candidate.runId === "string" ? candidate.runId.trim() : "";
  const rating =
    typeof candidate.rating === "string" &&
    AGENT_FEEDBACK_RATINGS.includes(
      candidate.rating as AgentFeedbackRating,
    )
      ? (candidate.rating as AgentFeedbackRating)
      : undefined;
  const outcome =
    typeof candidate.outcome === "string" &&
    AGENT_FEEDBACK_OUTCOMES.includes(
      candidate.outcome as AgentFeedbackOutcome,
    )
      ? (candidate.outcome as AgentFeedbackOutcome)
      : undefined;
  const stringArray = (input: unknown) =>
    Array.isArray(input) &&
    input.every((item) => typeof item === "string")
      ? (input as string[])
      : undefined;
  if (
    !runId ||
    (!rating && !outcome) ||
    (candidate.rating !== undefined && !rating) ||
    (candidate.outcome !== undefined && !outcome)
  ) {
    return null;
  }
  return {
    runId,
    ...(rating ? { rating } : {}),
    ...(outcome ? { outcome } : {}),
    sourceModules: stringArray(candidate.sourceModules),
    evidenceIds: stringArray(candidate.evidenceIds),
  };
}

export function agentFeedbackErrorResponse(
  error: unknown,
  status = 400,
): Response {
  return NextResponse.json(
    {
      success: false,
      error: {
        code: "AGENT_FEEDBACK_INVALID",
        message:
          error instanceof Error
            ? error.message
            : "Agent feedback is invalid.",
      },
    },
    { status },
  );
}

export function agentFeedbackUnauthorizedResponse(): Response {
  return NextResponse.json(
    {
      success: false,
      error: {
        code: "UNAUTHORIZED",
        message: "Sign in is required for Agent feedback.",
      },
    },
    { status: 401 },
  );
}
