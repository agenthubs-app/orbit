import { runOrbitAgentModelText, type GeminiOrbitAgentProviderConfig } from "../../orbit-ai/gemini-provider";
import type { AiQuotaGate } from "../../ai-quota/gate";
import { createLedgeredRunner } from "../journey/ledgered-runner";
import type { AttendeePostEventAiArtifact } from "./contract";
import { E3_PROMPT_VERSION, E3_SYSTEM_INSTRUCTION, e3RepairInstruction, e3UserText, parseE3 } from "./e3";
import type { AttendeePostEventAiTaskPayload, AttendeePostEventAiTaskRepository } from "./task-repository";

const SYSTEM_INSTRUCTION = `You create one attendee's post-event reflection from explicit evidence owned by that attendee.
Return exactly one JSON object with exactly two keys: summary and messageDraft.
summary must be a non-empty string grounded only in the supplied evidence.
messageDraft must be either a non-empty string or null. Write it from the current attendee's first-person perspective to the counterpart, so never refer to the current attendee by name in the third person.
Never invent people, commitments, meetings, outcomes, or relative time expressions such as yesterday, tomorrow, or next week unless that exact relative expression appears in the supplied evidence.`;

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
  /** R27（A5）：账本（只记账）；不传 = 不记账（旧行为）。 */
  ledger?: AiQuotaGate | null;
}): Promise<"empty" | "ready" | "retry" | "failed"> {
  const now = input.now ?? (() => new Date().toISOString());
  const task = await input.repository.claim({ leaseMs: 90_000, now: now(), workerId: input.workerId });
  if (!task?.lease) return "empty";
  if (task.promptVersion >= E3_PROMPT_VERSION && task.context) return processE3(input, task, now);
  const result = await (input.runModelText ?? runOrbitAgentModelText)({
    config: input.config,
    systemInstruction: SYSTEM_INSTRUCTION,
    userText: JSON.stringify({
      attendee: { displayName: task.attendeeDisplayName?.trim() || "the attendee" },
      eventId: task.eventId,
      evidence: task.evidenceSnapshot,
    }),
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

/** R27 E3：v3 任务（带 context）——别名进、校验 + 修复 1 次、换回 id；账本只记账。 */
async function processE3(
  input: { config: GeminiOrbitAgentProviderConfig; repository: AttendeePostEventAiTaskRepository; runModelText?: typeof runOrbitAgentModelText; ledger?: AiQuotaGate | null },
  task: AttendeePostEventAiTaskPayload & { lease: { token: string } },
  now: () => string,
): Promise<"ready" | "retry" | "failed"> {
  const context = task.context!;
  const aliased = e3UserText(task, context);
  const ledgered = createLedgeredRunner({ actorId: task.attendeeActorId, gate: input.ledger ?? null, idempotencyKey: `${task.taskId}:a${task.attemptCount}`, purpose: "event_post_summary", runner: input.runModelText ?? runOrbitAgentModelText });
  // 同 R26 E1/E2：DeepSeek 关思考、单次 60 秒（实测思考模式 20 秒内回不来）。
  const config = { ...input.config, deepseekThinking: false, jsonOutput: true, requestTimeoutMs: 60_000 };
  const first = await ledgered.run({ config, systemInstruction: E3_SYSTEM_INSTRUCTION, userText: aliased.userText });
  let parsed = first.success ? parseE3(first.text, aliased, context) : null;
  let last = first;
  if (first.success && parsed && parsed.ok === false) {
    last = await ledgered.run({ config, systemInstruction: e3RepairInstruction(parsed.reason), userText: `${aliased.userText}\n\nPrevious answer:\n${first.text.slice(0, 4000)}` });
    parsed = last.success ? parseE3(last.text, aliased, context) : null;
  }
  const finishedAt = now();
  if (last.success === false) {
    await ledgered.finish("failed");
    await input.repository.fail({ code: last.error.code, leaseToken: task.lease.token, now: finishedAt, retryable: last.retryable, taskId: task.taskId });
    return last.retryable && task.attemptCount < task.maxAttempts ? "retry" : "failed";
  }
  if (!parsed || parsed.ok === false) {
    await ledgered.finish("failed");
    // 修复后仍不过：不再自动重试（避免反复付费），界面走规则退路。
    await input.repository.fail({ code: "MODEL_SCHEMA_INVALID", leaseToken: task.lease.token, now: finishedAt, retryable: false, taskId: task.taskId });
    return "failed";
  }
  await ledgered.finish("succeeded");
  const artifact: AttendeePostEventAiArtifact = {
    evidenceHash: task.evidenceHash,
    evidenceIds: [...task.evidenceWhitelist],
    generatedAt: finishedAt,
    highlights: parsed.value.highlights,
    messageDraft: parsed.value.messageDraft,
    model: task.model,
    nextSteps: parsed.value.nextSteps,
    provider: task.provider,
    promptVersion: task.promptVersion,
    summary: parsed.value.summary,
    version: task.version,
  };
  const completed = await input.repository.complete({ artifact, leaseToken: task.lease.token, now: finishedAt, taskId: task.taskId });
  return completed ? "ready" : "retry";
}
