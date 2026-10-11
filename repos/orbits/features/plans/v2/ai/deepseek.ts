/**
 * R23 C1–C7 的真实实现（DeepSeek，`deepseek-v4-flash`）。每次操作都经过 AI 账本（DESIGN §5.1）：
 * `reserve`（用途固定池、`trigger: plan`、幂等键）→ 每次 HTTP 前 `beginCall`、后 `endCall` → `finish`。
 * 输出先过 zod 再过业务校验；不合格时在同一操作内修复重试 1 次（受 `max_calls` 约束），仍不合格 → failed。
 * 失败的操作在账本里是 failed / released，不计用户看得到的次数（由服务层决定是否计入修正次数）。
 */
import { DeepseekJsonChatError } from "../../../ai/deepseek-json-chat";
import { AI_QUOTA_MAX_CALLS, AI_QUOTA_PURPOSE_POOLS, type AiQuotaPurpose } from "../../../ai-quota/constants";
import type { AiQuotaGate } from "../../../ai-quota/gate";
import type { PlanAiChat } from "../../ai-generator";
import { PLAN_V2_PROMPT_VERSION, repairMessage, systemPrompt, TASKS } from "./prompts";
import { checkBackground, checkDraft, checkFix, checkGoalKind, checkLadder, checkMembers, checkNextGoals, checkQuestions, checkReviewFix, checkReviewMarks, type Checked } from "./schemas";
import type { FirstDraftInput, PlanAiContext, PlanAiOutcome, PlanFlowAi } from "./types";

export type PlanFlowAiLog = (entry: Record<string, unknown>) => void;

const defaultLog: PlanFlowAiLog = (entry) => console.info(JSON.stringify(entry));

export interface DeepseekPlanFlowAiDeps {
  chat: PlanAiChat;
  ledger: AiQuotaGate;
  model: string;
  log?: PlanFlowAiLog;
  /** 可选：模型输出被拒时交出原文（本机验证脚本留作回归 fixture；产品里不传）。 */
  onRejected?: (entry: { step: string; attempt: number; content: string; issues: readonly string[] }) => void;
}

export function createDeepseekPlanFlowAi(deps: DeepseekPlanFlowAiDeps): PlanFlowAi {
  const log = deps.log ?? defaultLog;

  async function run<T>(step: string, purpose: AiQuotaPurpose, context: PlanAiContext, task: string, input: unknown, check: (raw: unknown) => Checked<T>): Promise<PlanAiOutcome<T>> {
    const pool = AI_QUOTA_PURPOSE_POOLS[purpose] ?? "user";
    const reservation = await deps.ledger.reserve({ actorId: context.actorId, idempotencyKey: context.ledgerKey, now: context.now, pool, purpose, trigger: "plan" });
    if (reservation.ok !== true) {
      const denial = reservation as Extract<typeof reservation, { ok: false }>;
      if (denial.reason === "disabled") return { ok: false, reason: "disabled" };
      return { limit: denial.reason === "monthly_limit" ? "monthly" : "daily", ok: false, reason: "limit", retryOn: denial.retryOn ?? null };
    }
    if (!reservation.owner) return { ok: false, reason: reservation.status === "failed" ? "failed" : "busy" };
    const operationId = reservation.operationId;
    const system = systemPrompt(task, context.language);
    const user = JSON.stringify(input);
    const attempts = Math.min(2, AI_QUOTA_MAX_CALLS[purpose]);
    let issues: string[] = [];
    let outcome: "succeeded" | "failed" = "failed";
    try {
      for (let attempt = 1; attempt <= attempts; attempt += 1) {
        const callId = (await deps.ledger.beginCall(operationId, { model: deps.model, provider: "deepseek" })).callId;
        let content: string;
        try {
          const result = await deps.chat({ system, user: attempt === 1 ? user : repairMessage(user, issues) });
          await deps.ledger.endCall(callId, result.usage);
          content = result.content;
        } catch (error) {
          const usage = error instanceof DeepseekJsonChatError && error.usage ? { inputTokens: error.usage.inputTokens, outputTokens: error.usage.outputTokens } : null;
          await deps.ledger.endCall(callId, usage).catch(() => undefined);
          log({ attempt, error: error instanceof DeepseekJsonChatError ? error.code : "unknown", event: "plan_v2_ai_call_failed", operationId, promptVersion: PLAN_V2_PROMPT_VERSION, step });
          if (error instanceof DeepseekJsonChatError && error.code === "INVALID_OUTPUT") {
            issues = ["the answer was not valid JSON"];
            continue;
          }
          return { ok: false, reason: "failed" };
        }
        let raw: unknown;
        try {
          raw = JSON.parse(content);
        } catch {
          issues = ["the answer was not valid JSON"];
          log({ attempt, event: "plan_v2_ai_output_rejected", issues, operationId, promptVersion: PLAN_V2_PROMPT_VERSION, step });
          deps.onRejected?.({ attempt, content, issues, step });
          continue;
        }
        const checked = check(raw);
        if (checked.ok === true) {
          outcome = "succeeded";
          log({ attempt, event: "plan_v2_ai_succeeded", operationId, promptVersion: PLAN_V2_PROMPT_VERSION, step });
          return { ok: true, operationId, value: checked.value };
        }
        issues = (checked as Extract<Checked<T>, { ok: false }>).issues;
        log({ attempt, event: "plan_v2_ai_output_rejected", issues: issues.slice(0, 5), operationId, promptVersion: PLAN_V2_PROMPT_VERSION, step });
        deps.onRejected?.({ attempt, content, issues, step });
      }
      return { ok: false, reason: "failed" };
    } finally {
      await deps.ledger.finish(operationId, outcome).catch(() => undefined);
    }
  }

  return {
    id: "deepseek",
    background: (input, context) => run("background", "plan_background", context, TASKS.background, input, (raw) => checkBackground(raw, input)),
    firstDraft: (input, context) => run("first_draft", "plan_draft", context, TASKS.firstDraft, input, (raw) => checkDraft(raw, draftCheckInput(input))),
    fix: (input, context) => run("fix", "plan_revise", context, TASKS.fix, input, (raw) => checkFix(raw, draftCheckInput(input), input.current)),
    goalKind: (input, context) => run("goal_kind", "plan_intake", context, TASKS.goalKind, input, checkGoalKind),
    ladder: (input, context) => run("ladder", "plan_intake", context, TASKS.ladder, input, (raw) => checkLadder(raw, input.goalText)),
    members: (input, context) => run("members", "plan_intake", context, TASKS.members, input, (raw) => checkMembers(raw, input)),
    questions: (input, context) => run("questions", "plan_intake", context, TASKS.questions, input, (raw) => checkQuestions(raw, input)),
    reviewMarks: (input, context) => run("review_marks", "plan_review_mark", context, TASKS.reviewMarks, input, (raw) => checkReviewMarks(raw, input)),
    reviewFix: (input, context) => run("review_fix", "plan_review", context, TASKS.reviewFix, input, (raw) => checkReviewFix(raw, { ...draftCheckInput(input), enforceTemplate: false }, input.current, input)),
    nextGoals: (input, context) => run("next_goals", "plan_intake", context, TASKS.nextGoals, input, (raw) => checkNextGoals(raw, input)),
  };
}

function draftCheckInput(input: Pick<FirstDraftInput, "goalKind" | "slots" | "landscape" | "contacts">) {
  return { aliases: new Set(input.contacts.map((contact) => contact.alias)), enforceTemplate: true, goalKind: input.goalKind, landscape: input.landscape, slots: input.slots };
}
