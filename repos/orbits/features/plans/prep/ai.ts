/**
 * R37a 准备卡的 AI（plan-v3/DESIGN.md §3.3 / §3.4）：两步——`pick`（从编号候选里挑 1–3 件 + 标题 / 理由 / 阶段目标一句）、
 * `card`（一件事的切入点 + 开场白，按句给画线出处）。都记在 `plan_prep` 用途上：初次 `trigger: "plan"`（只记账），
 * 重新生成 `trigger: "manual"`（计入计划流程每日 15 次）。
 *
 * - mock：确定性输出（开发 / 测试 / 授权前）；disabled：live 没开 AI 时一律「不可用」，服务层退回通用模板 / 去认识提示。
 * - deepseek：骨架同 `features/plans/v2/ai/deepseek.ts`（reserve → ≤2 次 chat，第二次带 issues → finish）。真调用归 R38。
 */
import { z } from "zod";
import { DeepseekJsonChatError } from "../../ai/deepseek-json-chat";
import { AI_QUOTA_MAX_CALLS } from "../../ai-quota/constants";
import type { AiQuotaGate } from "../../ai-quota/gate";
import type { PlanCopyLanguage } from "../../../shared/compute/plan-template-copy";
import type { PlanAiChat } from "../ai-generator";
import type { PlanAiOutcome } from "../v2/ai/types";
import { repairMessage, systemPrompt } from "../v2/ai/prompts";
import type { PlanPrepRef } from "../../../shared/contract/plan-v2";
import type { PlanPickInput, PlanPickOutput, PlanPrepAi, PlanPrepAiContext, PlanPrepCardInput, PlanPrepCardOutput } from "./types";

export const PLAN_PREP_PROMPT_VERSION = "plan-prep-2026-11-v1";

const disabled = async <T>(): Promise<PlanAiOutcome<T>> => ({ ok: false, reason: "disabled" });

export function createDisabledPlanPrepAi(): PlanPrepAi {
  return { card: disabled, id: "disabled", pick: disabled };
}

/* ---------- mock ---------- */

const MOCK_COPY: Record<PlanCopyLanguage, { lead: string; contact: (label: string) => string; event: string; reason: (summary: string) => string; hook: { label: string; reason: string }; open: string; ask: string }> = {
  en: { ask: "Could we talk for 20 minutes?", contact: (label) => `Talk with this ${label}`.slice(0, 18), event: "Go to this event", hook: { label: "Last time", reason: "Open with what you talked about last time." }, lead: "Start with the easiest people to reach.", open: "Hello, ", reason: (summary) => `Matches this stage: ${summary}`.slice(0, 50) },
  ja: { ask: "20分ほどお話しできませんか。", contact: (label) => `${label}と話してみる`.slice(0, 18), event: "このイベントに行ってみる", hook: { label: "前回の話から", reason: "前に話した話題から入ると、相手も思い出しやすく、覚えていたことも伝わります。" }, lead: "まずは声をかけやすい人から始めましょう。", open: "こんにちは、", reason: (summary) => `この段階に合う相手：${summary}`.slice(0, 50) },
  zh: { ask: "方便约 20 分钟聊聊吗？", contact: (label) => `和这位${label}聊聊`.slice(0, 18), event: "去这场活动看看", hook: { label: "从上次聊的说起", reason: "开口先提你们聊过的话题，对方更容易想起你，也知道你记得他。" }, lead: "先从最容易联系上的人开始。", open: "您好，", reason: (summary) => `和这一阶段对得上：${summary}`.slice(0, 50) },
};

/** mock：挑前 3 个候选（人优先，活动排后），标题与理由是固定句式。 */
export function createMockPlanPrepAi(): PlanPrepAi {
  return {
    id: "mock",
    async pick(input) {
      const copy = MOCK_COPY[input.language];
      const picks = input.candidates.slice(0, 3).map((candidate) => ({
        bold: null,
        no: candidate.no,
        reason: copy.reason(candidate.summary),
        title: candidate.kind === "event" ? copy.event : copy.contact(candidate.typeLabel ?? ""),
      }));
      return { ok: true, operationId: null, value: { lead: copy.lead, picks } };
    },
    async card(input) {
      const copy = MOCK_COPY[input.language];
      const facts = input.facts.slice(0, 2);
      const who = input.fields.find((field) => field.key === "profile.organization");
      const sentences: PlanPrepCardOutput["sentences"] = [];
      if (who) sentences.push({ text: `${copy.open}${who.value}。`, underlines: [{ ref: { field: who.key, kind: "card" }, text: who.value }] });
      for (const fact of facts) sentences.push({ text: `${fact.text}。`, underlines: [{ ref: { factId: fact.id, kind: "fact" }, text: fact.text }] });
      sentences.push({ text: copy.ask, underlines: [] });
      return {
        ok: true,
        operationId: null,
        value: { hook: copy.hook, planFit: input.kind === "event" ? copy.lead : null, sentences, usedAnswers: [], usedFacts: facts.map((fact) => fact.id) },
      };
    },
  };
}

/* ---------- deepseek ---------- */

const pickSchema = z.object({
  lead: z.string().nullable().optional(),
  picks: z.array(z.object({ no: z.number().int(), title: z.string(), reason: z.string(), bold: z.string().nullable().optional() })).max(5),
});

const prepRef = z.union([
  z.object({ kind: z.literal("fact"), factId: z.string() }),
  z.object({ kind: z.literal("answer"), questionKey: z.string() }),
  z.object({ kind: z.literal("card"), field: z.string() }),
]);
const cardSchema = z.object({
  hook: z.object({ label: z.string(), reason: z.string() }),
  usedFacts: z.array(z.string()).max(8),
  usedAnswers: z.array(z.string()).max(8),
  sentences: z.array(z.object({ text: z.string(), underlines: z.array(z.object({ text: z.string(), ref: prepRef })).max(4) })).min(1).max(8),
  planFit: z.string().nullable().optional(),
});

export const PLAN_PREP_TASKS = {
  pick: [
    "Choose what the user should do first in the current stage of their plan.",
    "Input: the goal, the current stage (number, title, done criteria), the user's answers, and numbered candidates (people in the user's network and events). Candidates have no names on purpose.",
    "Pick 1 to 3 candidates by number only. Never write a person's name, never invent a candidate.",
    "For each pick write: title (≤18 characters, a suggestion such as \"talk with … about …\"), reason (≤50 characters, may quote the user's answers; facts only from the input), bold (one substring of reason, ≤14 characters, or null).",
    "lead: one sentence (≤40 characters) saying what this stage is for, or null.",
    'Output: {"lead": string|null, "picks": [{"no": number, "title": string, "reason": string, "bold": string|null}]}',
  ].join("\n"),
  card: [
    "Write a short opening message for the user to contact one person (or to open a conversation at one event), and the angle to open with.",
    "Use only the input: fields (card / profile / event page, each with a key), facts (with ids, from the user's notes), and the user's answers (with keys). Do not guess motives; do not invent shared experiences.",
    "hook: label ≤12 characters, reason ≤60 characters (why this opening works).",
    "sentences: the message split into sentences, ≤160 characters in total. Every concrete detail taken from the input must be an underline: {text: an exact substring of that sentence, ref: {kind:\"fact\",factId} | {kind:\"answer\",questionKey} | {kind:\"card\",field}}. Sentences without input details have no underlines.",
    "usedFacts / usedAnswers: the ids / keys you used (facts 2–4 when available).",
    "planFit: for events only, one sentence ≤40 characters on how the event fits the plan; otherwise null.",
    'Output: {"hook": {"label": string, "reason": string}, "usedFacts": string[], "usedAnswers": string[], "sentences": [{"text": string, "underlines": [{"text": string, "ref": {...}}]}], "planFit": string|null}',
  ].join("\n"),
};

export interface DeepseekPlanPrepAiDeps {
  chat: PlanAiChat;
  ledger: AiQuotaGate;
  model: string;
  log?: (entry: Record<string, unknown>) => void;
}

export function createDeepseekPlanPrepAi(deps: DeepseekPlanPrepAiDeps): PlanPrepAi {
  const log = deps.log ?? ((entry) => console.info(JSON.stringify(entry)));

  async function run<T>(step: string, context: PlanPrepAiContext, task: string, input: unknown, schema: z.ZodType<T>): Promise<PlanAiOutcome<T>> {
    const reservation = await deps.ledger.reserve({ actorId: context.actorId, idempotencyKey: context.ledgerKey, now: context.now, pool: "user", purpose: "plan_prep", trigger: context.trigger });
    if (reservation.ok !== true) {
      const denial = reservation as Extract<typeof reservation, { ok: false }>;
      if (denial.reason === "disabled") return { ok: false, reason: "disabled" };
      return { limit: denial.reason === "monthly_limit" ? "monthly" : "daily", ok: false, reason: "limit", retryOn: denial.retryOn ?? null };
    }
    if (!reservation.owner) return { ok: false, reason: reservation.status === "failed" ? "failed" : "busy" };
    const operationId = reservation.operationId;
    const system = systemPrompt(task, context.language);
    const user = JSON.stringify(input);
    let issues: string[] = [];
    let outcome: "succeeded" | "failed" = "failed";
    try {
      for (let attempt = 1; attempt <= Math.min(2, AI_QUOTA_MAX_CALLS.plan_prep); attempt += 1) {
        const callId = (await deps.ledger.beginCall(operationId, { model: deps.model, provider: "deepseek" })).callId;
        let content: string;
        try {
          const result = await deps.chat({ system, user: attempt === 1 ? user : repairMessage(user, issues) });
          await deps.ledger.endCall(callId, result.usage);
          content = result.content;
        } catch (error) {
          const usage = error instanceof DeepseekJsonChatError && error.usage ? { inputTokens: error.usage.inputTokens, outputTokens: error.usage.outputTokens } : null;
          await deps.ledger.endCall(callId, usage).catch(() => undefined);
          log({ attempt, error: error instanceof DeepseekJsonChatError ? error.code : "unknown", event: "plan_prep_ai_call_failed", operationId, promptVersion: PLAN_PREP_PROMPT_VERSION, step });
          if (error instanceof DeepseekJsonChatError && error.code === "INVALID_OUTPUT") { issues = ["the answer was not valid JSON"]; continue; }
          return { ok: false, reason: "failed" };
        }
        let raw: unknown;
        try { raw = JSON.parse(content); } catch { issues = ["the answer was not valid JSON"]; continue; }
        const parsed = schema.safeParse(raw);
        if (parsed.success) {
          outcome = "succeeded";
          log({ attempt, event: "plan_prep_ai_succeeded", operationId, promptVersion: PLAN_PREP_PROMPT_VERSION, step });
          return { ok: true, operationId, value: parsed.data };
        }
        issues = parsed.error.issues.slice(0, 5).map((issue) => `${issue.path.join(".")}: ${issue.message}`);
        log({ attempt, event: "plan_prep_ai_output_rejected", issues, operationId, promptVersion: PLAN_PREP_PROMPT_VERSION, step });
      }
      return { ok: false, reason: "failed" };
    } finally {
      await deps.ledger.finish(operationId, outcome).catch(() => undefined);
    }
  }

  return {
    id: "deepseek",
    async card(input, context) {
      const outcome = await run("card", context, PLAN_PREP_TASKS.card, input, cardSchema);
      if (outcome.ok !== true) return outcome as PlanAiOutcome<PlanPrepCardOutput>;
      const value: PlanPrepCardOutput = { hook: outcome.value.hook, planFit: outcome.value.planFit ?? null, sentences: outcome.value.sentences.map((sentence) => ({ text: sentence.text, underlines: sentence.underlines.map((line) => ({ ref: line.ref as PlanPrepRef, text: line.text })) })), usedAnswers: outcome.value.usedAnswers, usedFacts: outcome.value.usedFacts };
      return { ok: true, operationId: outcome.operationId, value };
    },
    async pick(input, context) {
      const outcome = await run("pick", context, PLAN_PREP_TASKS.pick, input, pickSchema);
      if (outcome.ok !== true) return outcome as PlanAiOutcome<PlanPickOutput>;
      const value: PlanPickOutput = { lead: outcome.value.lead ?? null, picks: outcome.value.picks.map((pick) => ({ bold: pick.bold ?? null, no: pick.no, reason: pick.reason, title: pick.title })) };
      return { ok: true, operationId: outcome.operationId, value };
    },
  };
}

export type { PlanPickInput, PlanPickOutput, PlanPrepCardInput };
