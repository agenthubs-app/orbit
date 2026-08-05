import { runOrbitAgentModelText, type GeminiOrbitAgentProviderConfig } from "../../orbit-ai/gemini-provider";
import type { AttendeePostEventAiArtifact } from "./contract";
import type { AttendeePostEventAiTaskPayload, AttendeePostEventAiTaskRepository } from "./task-repository";

const SYSTEM_INSTRUCTION = `You create one attendee's post-event reflection from explicit evidence owned by that attendee.
Return exactly one JSON object with exactly two keys: summary and messageDraft.
summary must be a non-empty string grounded only in the supplied evidence.
messageDraft must be either a non-empty string or null. Never invent people, commitments, meetings, or outcomes.`;

function parsedArtifact(text: string, task: AttendeePostEventAiTaskPayload, generatedAt: string): AttendeePostEventAiArtifact | null {
  let value: unknown;
  try { value = JSON.parse(text.trim()); } catch { return null; }
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const object = value as Record<string, unknown>;
  if (Object.keys(object).sort().join(",") !== "messageDraft,summary") return null;
  const summary = typeof object.summary === "string" ? object.summary.trim() : "";
  const messageDraft = object.messageDraft === null ? null : typeof object.messageDraft === "string" && object.messageDraft.trim() ? object.messageDraft.trim() : undefined;
  if (!summary || messageDraft === undefined) return null;
  return {
    evidenceHash: task.evidenceHash,
    evidenceIds: [...task.evidenceWhitelist],
    generatedAt,
    messageDraft,
    model: task.model,
    provider: task.provider,
    promptVersion: task.promptVersion,
    summary,
    version: task.version,
  };
}

export async function processAttendeePostEventAiTask(input: {
  config: GeminiOrbitAgentProviderConfig;
  now?: () => string;
  repository: AttendeePostEventAiTaskRepository;
  runModelText?: typeof runOrbitAgentModelText;
  workerId: string;
}): Promise<"empty" | "ready" | "retry" | "failed"> {
  const now = input.now ?? (() => new Date().toISOString());
  const task = await input.repository.claim({ leaseMs: 90_000, now: now(), workerId: input.workerId });
  if (!task?.lease) return "empty";
  const result = await (input.runModelText ?? runOrbitAgentModelText)({
    config: input.config,
    systemInstruction: SYSTEM_INSTRUCTION,
    userText: JSON.stringify({ eventId: task.eventId, evidence: task.evidenceSnapshot }),
  });
  const finishedAt = now();
  if (result.success === false) {
    const retryable = result.retryable;
    await input.repository.fail({ code: result.error.code, leaseToken: task.lease.token, now: finishedAt, retryable, taskId: task.taskId });
    return retryable && task.attemptCount < task.maxAttempts ? "retry" : "failed";
  }
  const artifact = parsedArtifact(result.text, task, finishedAt);
  if (!artifact) {
    await input.repository.fail({ code: "MODEL_SCHEMA_INVALID", leaseToken: task.lease.token, now: finishedAt, retryable: true, taskId: task.taskId });
    return task.attemptCount < task.maxAttempts ? "retry" : "failed";
  }
  const completed = await input.repository.complete({ artifact, leaseToken: task.lease.token, now: finishedAt, taskId: task.taskId });
  return completed ? "ready" : "retry";
}
