import type { AgentRunDetail, AgentRunStep } from "./contract";
import { orderedRunDetail } from "./service";

/**
 * Sprint 0103 (AI trace A1). A conversation turn no longer writes one
 * agentRunSteps row per timing span: the spans already live on the turn's
 * request record (`result.data.diagnostics.timings`). The run detail derives
 * the same steps from there, with the same ids, names, kinds, sequences and
 * statuses the rows used to hold, and now also the measured durationMs.
 */

export interface ConversationTimingSpan {
  phase: string;
  durationMs?: number;
  skipped?: boolean;
}

export interface ConversationTurnRecord {
  /** The completed request's stored conversation result. */
  result: unknown;
  /** When the request record was last written; used as the steps' timestamps. */
  updatedAt?: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function stepKind(phase: string): AgentRunStep["kind"] {
  if (phase === "planner" || phase === "synthesis") return "ai";
  if (phase === "artifact_generation" || phase === "tool_mapping") return "tool";
  return "deterministic";
}

function readTimings(data: Record<string, unknown>): ConversationTimingSpan[] {
  const diagnostics = data.diagnostics;
  const timings = isRecord(diagnostics) ? diagnostics.timings : undefined;
  if (!Array.isArray(timings)) return [];
  return timings.flatMap((span) =>
    isRecord(span) && typeof span.phase === "string"
      ? [{
          phase: span.phase,
          durationMs: typeof span.durationMs === "number" ? span.durationMs : 0,
          skipped: span.skipped === true,
        }]
      : [],
  );
}

/** Steps of one conversation turn, in the shape the step rows had before 0103. */
export function conversationRunStepsFromTurn(
  runId: string,
  turn: ConversationTurnRecord,
  fallbackAt: string,
): AgentRunStep[] {
  if (!isRecord(turn.result) || !isRecord(turn.result.data)) return [];
  const data = turn.result.data;
  if (data.runId !== runId) return [];
  const conversationId =
    typeof data.activeConversationId === "string" && data.activeConversationId.trim()
      ? data.activeConversationId.trim()
      : undefined;
  const spans = readTimings(data);
  const traceSteps: ConversationTimingSpan[] =
    spans.length > 0 ? spans : [{ durationMs: 0, phase: "final_response", skipped: false }];
  const at = turn.updatedAt ?? fallbackAt;
  return traceSteps.map((span, index) => ({
    attempt: 1,
    ...(index === 0 && conversationId ? { inputRef: `conversation:${conversationId}` } : {}),
    kind: stepKind(span.phase),
    name: span.phase,
    ...(index === traceSteps.length - 1 ? { outputRef: `${runId}:response` } : {}),
    runId,
    sequence: index + 1,
    status: span.skipped ? "skipped" : "completed",
    stepId: `${runId}:step:${index + 1}:${span.phase}`,
    durationMs: span.durationMs ?? 0,
    createdAt: at,
    updatedAt: at,
  }));
}

/** Adds the turn's derived steps to a run's stored steps, in run-detail order. */
export function withConversationTurnSteps(
  detail: AgentRunDetail,
  turn: ConversationTurnRecord | null,
): AgentRunDetail {
  if (!turn) return detail;
  const derived = conversationRunStepsFromTurn(detail.run.runId, turn, detail.run.updatedAt);
  const stored = new Set(detail.steps.map((step) => step.stepId));
  return orderedRunDetail({
    ...detail,
    // Runs recorded before 0103 still hold these steps as rows; never list them twice.
    steps: [...detail.steps, ...derived.filter((step) => !stored.has(step.stepId))],
  });
}
