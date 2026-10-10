/**
 * R23 计划生成流程（DESIGN §2.1–2.4、§5）：目標入力 → 背景（わたし / チーム / 目的）→ ≤5 問 → 確定した前提 →
 * 初版 → AI 修正 ≤3 → 手動編集 1 → 確定。状态在 `plan_intakes` / `plan_drafts`，命令回执在 `plan_flow_commands`。
 *
 * - 每个 AI 步骤两段式：先在事务外调 AI（不占按人的锁，模型要几十秒），再在事务里写结果与回执；
 *   同键重放读回执、不再调 AI；同键并发由账本的幂等键挡住（拿不到所有权的一方读当前状态）。
 * - 失败降级与上限说明（DESIGN §5.2 / §5.3）在这里决定：轻量调用（C1、C3、C4、C5）静默改用规则；C2 用规则下书并
 *   标出上限；C6 / C7 不保存任何东西、不计次。
 * - 确定 = `PlanV2Service.createPlanFromDraft`（同一份草稿重复确定只建一份），再把草稿、intake 标成已确定。
 */
import { createHash, randomUUID } from "node:crypto";

import { validateAllocations, type PlanAllocationSlot } from "../../../shared/compute/plan-allocation";
import { planFlowHref, planTaskSegmentHref, type PlanHrefPlatform } from "../../../shared/compute/plan-href";
import {
  PLAN_CAPABILITY_COPY,
  PLAN_GOAL_KIND_COPY,
  PLAN_QUESTION_COPY,
  PLAN_SHORT_NAME_COPY,
  planCopy,
  type PlanCopyLanguage,
} from "../../../shared/compute/plan-template-copy";
import {
  guessGoalKindByKeywords,
  PLAN_EVENT_SLOT,
  PLAN_GOAL_KINDS,
  PLAN_GOAL_TEMPLATES,
  planCapabilityGaps,
  planShortNameCandidates,
} from "../../../shared/compute/plan-templates";
import type {
  PlanAiStepView,
  PlanBackgroundMe,
  PlanBackgroundPurpose,
  PlanBackgroundTeam,
  PlanConfirmResult,
  PlanDraftChange,
  PlanDraftManualEditRequest,
  PlanDraftTurn,
  PlanDraftView,
  PlanGoalKind,
  PlanGoalKindResult,
  PlanIntakeAnswer,
  PlanIntakeBlockRequest,
  PlanIntakeCreateRequest,
  PlanIntakeListResponse,
  PlanIntakeMembersRequest,
  PlanIntakeView,
  PlanPremiseRow,
  PlanPremiseSource,
  PlanReadingItem,
  PlanTeamMember,
  PlanV2Content,
} from "../../../shared/contract/plan-v2";
import type { IndustryIdCode } from "../../../shared/contract/industries";
import { AppError, type AppErrorCode } from "../../../shared/errors/app-error";
import { AI_QUOTA_MONTHLY_LIMITS, nextTokyoMidnight, nextTokyoMonthStart, tokyoUsageMonth } from "../../ai-quota/constants";
import { publishedEntriesFor, resolveCitations } from "../landscape/store";
import { backgroundCacheKey, ruleLadder, ruleQuestions } from "./ai/rules";
import type { DraftOutput, DraftSlotInfo, PlanAiContact, PlanAiOutcome, PlanFlowAi } from "./ai/types";
import type { PlanFlowContact, PlanFlowContextSource } from "./flow-context";
import { emptyIntakeAiSteps, emptyStep } from "./repository";
import { PLAN_V2_GOAL_LIMIT, type PlanDraftContent, type PlanDraftPersonType, type PlanDraftRow, type PlanFlowStepRecord, type PlanIntakeRow, type PlanV2Repository, type PlanV2Scope, type PlanV2Transaction } from "./types";
import { allocationSlotsOf } from "./validate-content";
import type { PlanV2Service } from "./service";

/** 每人每月新建目标的上限（DESIGN §10 第 4 项，用户已确认）。按新建的生成流程计（「もう一度」不重复计）。 */
export const PLAN_NEW_GOAL_MONTHLY_LIMIT = 10;
/** C1 每人每东京日上限。 */
export const PLAN_GOAL_KIND_DAILY_LIMIT = 20;
/** C4 每个 intake 上限。 */
export const PLAN_LADDER_LIMIT = 3;
/** C7 每份草稿上限。 */
export const PLAN_AI_FIX_LIMIT = 3;
export const PLAN_TEAM_MEMBER_LIMIT = 12;
const GOAL_KIND_MIN_LENGTH = 6;

export const PLAN_FLOW_ERROR_REASONS = [
  "INTAKE_NOT_FOUND",
  "DRAFT_NOT_FOUND",
  "STALE",
  "BLOCK_ORDER",
  "BACKGROUND_LOCKED",
  "BACKGROUND_NOT_CONFIRMED",
  "LADDER_LIMIT",
  "QUESTIONS_NOT_READY",
  "PREMISE_NOT_READY",
  "DRAFT_CLOSED",
  "FIX_LIMIT",
  "MANUAL_EDIT_USED",
  "PLAN_GOAL_LIMIT",
  "GOAL_MONTHLY_LIMIT",
  "AI_FAILED",
  "AI_LIMIT",
  "AI_BUSY",
  "IDEMPOTENCY_KEY_REUSED",
  "INVALID_INPUT",
] as const;
export type PlanFlowErrorReason = (typeof PLAN_FLOW_ERROR_REASONS)[number];

const REASON_CODES: Record<PlanFlowErrorReason, AppErrorCode> = {
  AI_BUSY: "CONFLICT",
  AI_FAILED: "SERVICE_UNAVAILABLE",
  AI_LIMIT: "CONFLICT",
  BACKGROUND_LOCKED: "CONFLICT",
  BACKGROUND_NOT_CONFIRMED: "CONFLICT",
  BLOCK_ORDER: "CONFLICT",
  DRAFT_CLOSED: "CONFLICT",
  DRAFT_NOT_FOUND: "NOT_FOUND",
  FIX_LIMIT: "CONFLICT",
  GOAL_MONTHLY_LIMIT: "CONFLICT",
  IDEMPOTENCY_KEY_REUSED: "CONFLICT",
  INTAKE_NOT_FOUND: "NOT_FOUND",
  INVALID_INPUT: "VALIDATION_ERROR",
  LADDER_LIMIT: "CONFLICT",
  MANUAL_EDIT_USED: "CONFLICT",
  PLAN_GOAL_LIMIT: "CONFLICT",
  PREMISE_NOT_READY: "CONFLICT",
  QUESTIONS_NOT_READY: "CONFLICT",
  STALE: "CONFLICT",
};

export class PlanFlowError extends AppError {
  readonly reason: PlanFlowErrorReason;
  readonly details: { limit?: "daily" | "monthly"; retryOn?: string | null };
  constructor(reason: PlanFlowErrorReason, message: string, details: { limit?: "daily" | "monthly"; retryOn?: string | null } = {}) {
    super(REASON_CODES[reason], message);
    this.name = "PlanFlowError";
    this.reason = reason;
    this.details = details;
  }
}

export interface PlanFlowRequestContext {
  language: PlanCopyLanguage;
  platform: PlanHrefPlatform;
}

export interface PlanFlowService {
  guessGoalKind(text: string, context: PlanFlowRequestContext): Promise<PlanGoalKindResult>;
  listIntakes(context: PlanFlowRequestContext): Promise<PlanIntakeListResponse>;
  createIntake(request: PlanIntakeCreateRequest, context: PlanFlowRequestContext): Promise<PlanIntakeView>;
  getIntake(intakeId: string, context: PlanFlowRequestContext): Promise<PlanIntakeView | null>;
  retryBackground(intakeId: string, idempotencyKey: string, context: PlanFlowRequestContext): Promise<PlanIntakeView>;
  confirmBlock(intakeId: string, request: PlanIntakeBlockRequest, context: PlanFlowRequestContext): Promise<PlanIntakeView>;
  addMembers(intakeId: string, request: PlanIntakeMembersRequest, context: PlanFlowRequestContext): Promise<PlanIntakeView>;
  recomputeLadder(intakeId: string, request: { wants: string; idempotencyKey: string }, context: PlanFlowRequestContext): Promise<PlanIntakeView>;
  chooseQuestions(intakeId: string, idempotencyKey: string, context: PlanFlowRequestContext): Promise<PlanIntakeView>;
  submitAnswers(intakeId: string, request: { answers: readonly { questionId: string; values: readonly string[]; text: string | null }[]; idempotencyKey: string }, context: PlanFlowRequestContext): Promise<PlanIntakeView>;
  editPremise(intakeId: string, request: { key: string; value: string; idempotencyKey: string }, context: PlanFlowRequestContext): Promise<PlanIntakeView>;
  makeDraft(intakeId: string, idempotencyKey: string, context: PlanFlowRequestContext): Promise<PlanDraftView>;
  getDraft(draftId: string, context: PlanFlowRequestContext): Promise<PlanDraftView | null>;
  fix(draftId: string, request: { text: string; idempotencyKey: string }, context: PlanFlowRequestContext): Promise<PlanDraftView>;
  reset(draftId: string, idempotencyKey: string, context: PlanFlowRequestContext): Promise<PlanDraftView>;
  manualEdit(draftId: string, request: PlanDraftManualEditRequest, context: PlanFlowRequestContext): Promise<PlanConfirmResult>;
  confirm(draftId: string, idempotencyKey: string, context: PlanFlowRequestContext): Promise<PlanConfirmResult>;
}

export interface PlanFlowServiceOptions {
  repository: PlanV2Repository;
  planService: PlanV2Service;
  ai: PlanFlowAi;
  context: PlanFlowContextSource;
  scope: PlanV2Scope;
  now?: () => Date;
  newId?: () => string;
}

/* ------------------------------------------------------------------ */
/* 小工具                                                               */
/* ------------------------------------------------------------------ */

function sha(value: unknown): string {
  return createHash("sha256").update(typeof value === "string" ? value : JSON.stringify(value)).digest("hex");
}

function tri(language: PlanCopyLanguage, text: { ja: string; zh: string; en: string }): string {
  return text[language];
}

function capabilityLabel(id: string, language: PlanCopyLanguage): string {
  const copy = PLAN_CAPABILITY_COPY[id];
  return copy ? planCopy(copy, language) : id;
}

function shortName(id: string, language: PlanCopyLanguage): string {
  const copy = PLAN_SHORT_NAME_COPY[id] ?? PLAN_SHORT_NAME_COPY[id.split("@")[0] ?? id];
  return copy ? planCopy(copy, language) : id;
}

function tokyoDayStart(now: Date): string {
  return new Date(Date.parse(nextTokyoMidnight(now)) - 86_400_000).toISOString();
}

function tokyoMonthStart(now: Date): string {
  const [year, month] = tokyoUsageMonth(now).split("-").map(Number) as [number, number];
  return new Date(Date.UTC(year, month - 1, 1) - 9 * 3_600_000).toISOString();
}

function stepView(step: PlanFlowStepRecord): PlanAiStepView {
  return { limit: step.limit, retryOn: step.retryOn, state: step.state };
}

function outcomeStep(previous: PlanFlowStepRecord, outcome: PlanAiOutcome<unknown>, at: string, fallbackOnFailure: boolean): PlanFlowStepRecord {
  if (outcome.ok === true) return { ...previous, at, limit: null, operationId: outcome.operationId, retryOn: null, state: "done" };
  const denial = outcome as Extract<PlanAiOutcome<unknown>, { ok: false }>;
  const state = fallbackOnFailure ? "fallback" : "failed";
  return { ...previous, at, limit: denial.reason === "limit" ? denial.limit ?? "daily" : null, operationId: null, retryOn: denial.retryOn ?? null, state };
}

function aiError(outcome: Extract<PlanAiOutcome<unknown>, { ok: false }>): PlanFlowError {
  if (outcome.reason === "limit") return new PlanFlowError("AI_LIMIT", "The AI limit has been reached.", { limit: outcome.limit ?? "daily", retryOn: outcome.retryOn ?? null });
  if (outcome.reason === "busy") return new PlanFlowError("AI_BUSY", "This step is already running.");
  return new PlanFlowError("AI_FAILED", "The AI step failed. Nothing was saved and no attempt was used.");
}

function premiseSource(index: number): PlanPremiseSource {
  return (["q1", "q2", "q3", "q4", "q5"] as const)[index] ?? "q5";
}

function blankContent(): PlanDraftContent {
  return { allocationReasons: [], basis: [], citations: [], conclusion: "", diagnosis: "", event: { allocation: 0, targetCount: 1 }, personTypes: [], steps: [] };
}

/* ------------------------------------------------------------------ */
/* 服务                                                                 */
/* ------------------------------------------------------------------ */

export function createPlanFlowService(options: PlanFlowServiceOptions): PlanFlowService {
  const { ai, context: source, planService, repository, scope } = options;
  const nowDate = options.now ?? (() => new Date());
  const now = () => nowDate().toISOString();
  const newId = options.newId ?? (() => randomUUID());

  /* ---------- 回执 ---------- */

  async function replayed<T>(tx: Pick<PlanV2Transaction, "flowReceipt">, key: string, kind: string, body: unknown): Promise<T | null> {
    const receipt = await tx.flowReceipt(key);
    if (!receipt) return null;
    if (receipt.kind !== kind || receipt.fingerprint !== sha({ body, kind })) throw new PlanFlowError("IDEMPOTENCY_KEY_REUSED", "The idempotency key was used for a different request.");
    return receipt.response as T;
  }

  async function writeReceipt(tx: PlanV2Transaction, input: { key: string; kind: string; body: unknown; intakeId?: string | null; draftId?: string | null; planId?: string | null; response: Record<string, unknown> }) {
    await tx.insertFlowReceipt({
      createdAt: now(),
      draftId: input.draftId ?? null,
      fingerprint: sha({ body: input.body, kind: input.kind }),
      idempotencyKey: input.key,
      intakeId: input.intakeId ?? null,
      kind: input.kind,
      outcome: "applied",
      planId: input.planId ?? null,
      response: input.response,
    });
  }

  /* ---------- 读 ---------- */

  async function requireIntake(tx: Pick<PlanV2Transaction, "intake">, intakeId: string): Promise<PlanIntakeRow> {
    const intake = await tx.intake(intakeId);
    if (!intake) throw new PlanFlowError("INTAKE_NOT_FOUND", "Intake not found.");
    return intake;
  }

  async function requireDraft(tx: Pick<PlanV2Transaction, "draft">, draftId: string): Promise<PlanDraftRow> {
    const draft = await tx.draft(draftId);
    if (!draft) throw new PlanFlowError("DRAFT_NOT_FOUND", "Draft not found.");
    return draft;
  }

  async function newGoalsLeft(reader: Pick<PlanV2Transaction, "countIntakesSince">): Promise<number> {
    return Math.max(0, PLAN_NEW_GOAL_MONTHLY_LIMIT - (await reader.countIntakesSince(tokyoMonthStart(nowDate()))));
  }

  async function intakeView(reader: Pick<PlanV2Transaction, "countIntakesSince">, intake: PlanIntakeRow, context: PlanFlowRequestContext): Promise<PlanIntakeView> {
    const background = intake.background;
    const fallbackMe: PlanBackgroundMe = { headline: null, name: "", stance: null, wants: intake.goalText };
    const fallbackTeam: PlanBackgroundTeam = { members: [], mode: "solo" };
    const fallbackPurpose: PlanBackgroundPurpose = { reason: null, rungs: [], selectedLevel: null, suggestedLevel: null };
    return {
      aiSteps: {
        background: stepView(intake.aiSteps.background),
        draft: stepView(intake.aiSteps.draft),
        ladder: stepView(intake.aiSteps.ladder),
        members: stepView(intake.aiSteps.members),
        questions: stepView(intake.aiSteps.questions),
      },
      answers: intake.answers,
      background: {
        me: background.me ?? { confirmedAt: null, value: fallbackMe },
        purpose: background.purpose ?? { confirmedAt: null, value: fallbackPurpose },
        team: background.team ?? { confirmedAt: null, value: fallbackTeam },
      },
      draftId: intake.aiSteps.draftId,
      goal: intake.goalText,
      goalKind: intake.goalKind,
      href: planFlowHref(context.platform, intake.id),
      intakeId: intake.id,
      limits: { ladderLeft: Math.max(0, PLAN_LADDER_LIMIT - intake.aiSteps.ladderCount), newGoalsLeftThisMonth: await newGoalsLeft(reader) },
      planId: intake.planId,
      premise: intake.premise,
      premiseVersion: intake.aiSteps.premiseVersion,
      questions: intake.questions?.items ?? null,
      reading: background.reading,
      source: intake.source,
      status: intake.status,
      updatedAt: intake.updatedAt,
    };
  }

  function draftView(draft: PlanDraftRow, intake: PlanIntakeRow | null, context: PlanFlowRequestContext): PlanDraftView {
    const asContent = (content: PlanDraftContent): PlanV2Content => ({
      ...content,
      personTypes: content.personTypes.map(({ primaryIndustryId: _primary, secondaryIndustryId: _secondary, ...type }) => ({ ...type, skipped: false })),
    });
    return {
      aiFixLimit: PLAN_AI_FIX_LIMIT,
      aiFixUsed: draft.aiFixUsed,
      citations: resolveCitations(draft.content.citations, context.language),
      content: asContent(draft.content),
      draftId: draft.id,
      fix: stepView(draft.fix),
      goal: intake?.goalText ?? "",
      goalKind: intake?.goalKind ?? "unknown",
      intakeId: draft.intakeId,
      kind: draft.kind,
      manualEditAvailable: !draft.manualEditUsed && draft.status === "open",
      originContent: asContent(draft.originContent),
      planId: draft.planId,
      premise: draft.premise,
      purposeText: purposeTextOf(intake),
      revision: draft.updatedAt,
      status: draft.status,
      turns: draft.turns,
      updatedAt: draft.updatedAt,
    };
  }

  function purposeTextOf(intake: PlanIntakeRow | null): string | null {
    const purpose = intake?.background.purpose?.value;
    if (!purpose || purpose.selectedLevel === null) return null;
    return purpose.rungs.find((rung) => rung.level === purpose.selectedLevel)?.text ?? null;
  }

  /* ---------- 背景（C2） ---------- */

  function aliasContacts(contacts: readonly PlanFlowContact[]): { aliases: Map<string, PlanFlowContact>; input: PlanAiContact[] } {
    const aliases = new Map<string, PlanFlowContact>();
    const input = contacts.map((contact, index) => {
      const alias = `C${index + 1}`;
      aliases.set(alias, contact);
      return { alias, industry: contact.industry, name: contact.name, notes: contact.notes, organization: contact.organization, role: contact.role, tags: contact.tags };
    });
    return { aliases, input };
  }

  function headlineOf(contact: PlanFlowContact): string | null {
    return [contact.role, contact.organization].filter(Boolean).join(" · ") || null;
  }

  function selfMember(name: string, headline: string | null, capabilities: string[]): PlanTeamMember {
    return { basis: null, capabilities, contactId: null, headline, isSelf: true, memberId: "self", name: name || "—", otherCapabilities: [], relation: null, source: "profile" };
  }

  async function runBackground(intake: PlanIntakeRow, attempt: number, context: PlanFlowRequestContext): Promise<PlanIntakeRow> {
    const kind = intake.goalKind;
    const capabilities = [...PLAN_GOAL_TEMPLATES[kind].capabilities];
    const [profile, candidates] = await Promise.all([source.profile(scope.actorId), source.teamCandidates(scope.actorId)]);
    const { aliases, input } = aliasContacts(candidates);
    const outcome = await ai.background(
      { capabilities, contacts: input, goalKind: kind, goalText: intake.goalText, profile },
      { actorId: scope.actorId, language: context.language, ledgerKey: `intake:${intake.id}:background:${attempt}`, now: nowDate() },
    );
    const at = now();
    const reading: PlanReadingItem[] = [
      { detail: [profile.name, profile.headline].filter(Boolean).join(" · "), kind: "profile" },
      { detail: intake.goalText, kind: "goal" },
      ...(candidates.length > 0 ? [{ detail: candidates.map((contact) => contact.name).join("、"), kind: "network" as const }] : []),
      { detail: `${planCopy(PLAN_GOAL_KIND_COPY[kind], context.language)} · ${capabilities.length}`, kind: "capabilities" },
    ];
    let me: PlanBackgroundMe = { headline: profile.headline, name: profile.name, stance: null, wants: intake.goalText };
    let team: PlanBackgroundTeam = { members: [selfMember(profile.name, profile.headline, [])], mode: "solo" };
    let purpose: PlanBackgroundPurpose = { ...ruleLadder(intake.goalText), selectedLevel: 2 };
    if (outcome.ok === true) {
      const value = outcome.value;
      me = { ...me, stance: value.stance, wants: value.wants };
      const members: PlanTeamMember[] = [];
      for (const member of value.members) {
        if (member.alias === "self") {
          members.unshift(selfMember(profile.name, profile.headline, member.capabilities));
          continue;
        }
        const contact = aliases.get(member.alias);
        if (!contact) continue;
        members.push({ basis: null, capabilities: member.capabilities, contactId: contact.id, headline: headlineOf(contact), isSelf: false, memberId: `contact:${contact.id}`, name: contact.name, otherCapabilities: [], relation: member.relation, source: "network" });
      }
      if (!members.some((member) => member.isSelf)) members.unshift(selfMember(profile.name, profile.headline, []));
      team = { members, mode: members.length > 1 ? "team" : "solo" };
      purpose = { ...value.ladder, selectedLevel: value.ladder.suggestedLevel ?? 2 };
    }
    return {
      ...intake,
      aiSteps: { ...intake.aiSteps, background: { ...outcomeStep(intake.aiSteps.background, outcome, at, true), attempts: attempt } },
      background: { me: { confirmedAt: null, value: me }, purpose: { confirmedAt: null, value: purpose }, reading, team: { confirmedAt: null, value: team } },
      status: "background",
      updatedAt: at,
    };
  }

  /** 事务外调 AI，事务里写回（版本对不上就放弃这次结果，读当前状态）。 */
  async function applyAfterAi(intakeId: string, expectedUpdatedAt: string, compute: (intake: PlanIntakeRow) => Promise<PlanIntakeRow>, receipt: { key: string; kind: string; body: unknown }): Promise<PlanIntakeRow> {
    const before = await repository.read(scope, (reader) => requireIntake(reader, intakeId));
    if (before.updatedAt !== expectedUpdatedAt) return before;
    const next = await compute(before);
    return repository.transact(scope, async (tx) => {
      const prior = await replayed<{ intakeId: string }>(tx, receipt.key, receipt.kind, receipt.body);
      const current = await requireIntake(tx, intakeId);
      if (prior || current.updatedAt !== expectedUpdatedAt) return current;
      await tx.updateIntake(next);
      await writeReceipt(tx, { body: receipt.body, intakeId, key: receipt.key, kind: receipt.kind, response: { intakeId } });
      return next;
    });
  }

  /* ---------- 选题与前提 ---------- */

  function backgroundSummary(intake: PlanIntakeRow, language: PlanCopyLanguage): { text: string; gaps: string[] } {
    const me = intake.background.me?.value;
    const team = intake.background.team?.value;
    const purpose = intake.background.purpose?.value;
    const gaps = planCapabilityGaps(intake.goalKind, team?.members ?? []);
    const lines = [
      `goal: ${intake.goalText}`,
      `stance: ${me?.stance ?? "-"}`,
      `wants: ${me?.wants ?? "-"}`,
      `team: ${team?.mode ?? "solo"} ${(team?.members ?? []).map((member) => `${member.isSelf ? "self" : member.relation ?? "member"}[${[...member.capabilities].sort().join(",")}]`).join(" ")}`,
      `gaps: ${gaps.map((gap) => capabilityLabel(gap, language)).join(", ")}`,
      `purpose: ${purposeTextOf(intake) ?? "-"}`,
    ];
    return { gaps, text: lines.join("\n") };
  }

  function questionBank(kind: PlanGoalKind, language: PlanCopyLanguage) {
    return PLAN_GOAL_TEMPLATES[kind].questions.map((question) => {
      const copy = PLAN_QUESTION_COPY[question.id];
      return {
        id: question.id,
        options: question.options.map((value) => ({ label: copy?.options[value] ? planCopy(copy.options[value]!, language) : value, value })),
        prompt: copy ? planCopy(copy.prompt, language) : question.id,
        topic: copy ? planCopy(copy.topic, language) : question.id,
        type: question.type,
      };
    });
  }

  function buildPremise(intake: PlanIntakeRow, answers: readonly PlanIntakeAnswer[], language: PlanCopyLanguage): PlanPremiseRow[] {
    const team = intake.background.team?.value;
    const gaps = planCapabilityGaps(intake.goalKind, team?.members ?? []);
    const teamSize = team?.mode === "team" ? team.members.length : 1;
    const teamValue = tri(language, {
      en: `${teamSize} ${teamSize === 1 ? "person" : "people"}${gaps.length ? ` (gaps: ${gaps.map((gap) => capabilityLabel(gap, language)).join(", ")})` : ""}`,
      ja: `${teamSize}名${gaps.length ? `（空き：${gaps.map((gap) => capabilityLabel(gap, language)).join("・")}）` : ""}`,
      zh: `${teamSize}人${gaps.length ? `（空缺：${gaps.map((gap) => capabilityLabel(gap, language)).join("、")}）` : ""}`,
    });
    const rows: PlanPremiseRow[] = [
      { guessed: false, key: "purpose", label: tri(language, { en: "Purpose", ja: "目的", zh: "目的" }), source: "background", value: purposeTextOf(intake) ?? intake.goalText },
      { guessed: false, key: "team", label: tri(language, { en: "Team", ja: "チーム", zh: "团队" }), source: "background", value: teamValue },
    ];
    const bank = new Map(questionBank(intake.goalKind, language).map((item) => [item.id, item]));
    answers.forEach((answer, index) => {
      const item = bank.get(answer.questionId);
      if (!item) return;
      const labels = answer.values.map((value) => item.options.find((option) => option.value === value)?.label ?? value);
      const value = [labels.join("・"), answer.text].filter((part) => part && part.trim()).join(" · ");
      rows.push({
        guessed: answer.guessed,
        key: answer.questionId,
        label: item.topic,
        source: premiseSource(index),
        value: value || tri(language, { en: "Not answered (assumed)", ja: "未回答（推測で進めます）", zh: "未回答（按推测处理）" }),
      });
    });
    return rows;
  }

  /* ---------- 方案 ---------- */

  function slotInfos(kind: PlanGoalKind, industries: readonly IndustryIdCode[], language: PlanCopyLanguage): DraftSlotInfo[] {
    return PLAN_GOAL_TEMPLATES[kind].slots.filter((slot) => slot.slot !== PLAN_EVENT_SLOT).map((slot) => ({
      allocation: slot.allocation,
      emoji: slot.emoji,
      shortNames: planShortNameCandidates(slot.slot, industries).map((id) => ({ id, label: shortName(id, language) })),
      slot: slot.slot,
      targetCount: slot.targetCount,
    }));
  }

  function toDraftContent(output: DraftOutput, kind: PlanGoalKind, aliases: Map<string, PlanFlowContact>, language: PlanCopyLanguage, premise: readonly PlanPremiseRow[], stepKeys: readonly string[] = []): PlanDraftContent {
    const emoji = new Map(PLAN_GOAL_TEMPLATES[kind].slots.map((slot) => [slot.slot, slot.emoji]));
    const personTypes: PlanDraftPersonType[] = output.personTypes.map((type) => ({
      allocation: type.allocation,
      countRule: type.countRule,
      emoji: emoji.get(type.slot) ?? "👤",
      introRoutes: type.introRoutes.flatMap((route) => {
        const contact = aliases.get(route.viaAlias);
        return contact ? [{ viaContactId: contact.id, why: route.why }] : [];
      }),
      itemId: type.slot,
      key: type.slot,
      opener: type.opener,
      persona: type.persona,
      primaryIndustryId: type.primaryIndustryId,
      questions: type.questions,
      recognizeHints: type.recognizeHints,
      roleSituation: type.roleSituation,
      shortLabel: shortName(type.shortLabelId, language),
      shortLabelId: type.shortLabelId,
      slot: type.slot,
      targetCount: type.targetCount,
      why: type.why,
    }));
    return {
      allocationReasons: output.allocationReasons,
      basis: [
        ...premise.map((row) => ({ kind: "premise" as const, label: `${row.label}：${row.value}`, ref: row.key })),
        ...output.citations.map((citation) => ({ kind: "landscape" as const, label: citation.id, ref: `${citation.id}@${citation.version}` })),
        { kind: "template" as const, label: planCopy(PLAN_GOAL_KIND_COPY[kind], language), ref: `template:${kind}` },
      ],
      citations: output.citations,
      conclusion: output.conclusion,
      diagnosis: output.diagnosis,
      event: output.event,
      flow: output.flow,
      personTypes,
      steps: output.steps.map((step, index) => ({ doneCriteria: step.doneCriteria, key: stepKeys[index] ?? `step-${index + 1}`, personTypeKeys: step.personTypeKeys, title: step.title, why: step.why })),
    };
  }

  /** 给 AI 的当前方案（C7）：人物类型以枠 id 为 key；紹介ルート换回别名。 */
  function toDraftOutput(content: PlanDraftContent, aliasesById: Map<string, string>): DraftOutput {
    return {
      allocationReasons: [...content.allocationReasons],
      citations: [...content.citations],
      conclusion: content.conclusion,
      diagnosis: content.diagnosis,
      event: { ...content.event },
      flow: [...(content.flow ?? [])],
      personTypes: content.personTypes.map((type) => ({
        allocation: type.allocation,
        countRule: type.countRule,
        introRoutes: type.introRoutes.flatMap((route) => (aliasesById.has(route.viaContactId) ? [{ viaAlias: aliasesById.get(route.viaContactId)!, why: route.why }] : [])),
        opener: type.opener ?? null,
        persona: type.persona ?? null,
        primaryIndustryId: type.primaryIndustryId ?? null,
        questions: [...type.questions],
        recognizeHints: [...type.recognizeHints],
        roleSituation: type.roleSituation,
        shortLabelId: type.shortLabelId,
        slot: type.slot,
        targetCount: type.targetCount,
        why: type.why,
      })),
      steps: content.steps.map((step) => ({ doneCriteria: step.doneCriteria, personTypeKeys: [...step.personTypeKeys], title: step.title, why: step.why })),
    };
  }

  /** 两版方案的差分（AI 修正卡、手动编辑的「変更点」）。 */
  function diffContent(before: PlanDraftContent, after: PlanDraftContent, language: PlanCopyLanguage, reasons: ReadonlyMap<string, string> = new Map()): PlanDraftChange[] {
    const changes: PlanDraftChange[] = [];
    const push = (path: string, label: string, previous: string | null, next: string | null) => {
      if (previous === next) return;
      changes.push({ after: next, before: previous, label, path, reason: reasons.get(path) ?? null });
    };
    push("diagnosis", tri(language, { en: "Diagnosis", ja: "見立て", zh: "判断" }), before.diagnosis, after.diagnosis);
    push("conclusion", tri(language, { en: "Conclusion", ja: "進め方の結論", zh: "结论" }), before.conclusion, after.conclusion);
    const steps = Math.max(before.steps.length, after.steps.length);
    for (let index = 0; index < steps; index += 1) {
      const previous = before.steps[index];
      const next = after.steps[index];
      const n = index + 1;
      push(`steps.${index}.title`, tri(language, { en: `Step ${n} name`, ja: `Step ${n} の名前`, zh: `Step ${n} 名称` }), previous?.title ?? null, next?.title ?? null);
      push(`steps.${index}.doneCriteria`, tri(language, { en: `Step ${n} done when`, ja: `Step ${n} の目安`, zh: `Step ${n} 完成标准` }), previous?.doneCriteria ?? null, next?.doneCriteria ?? null);
    }
    const slots = [...new Set([...before.personTypes.map((type) => type.slot), ...after.personTypes.map((type) => type.slot)])];
    for (const slot of slots) {
      const previous = before.personTypes.find((type) => type.slot === slot);
      const next = after.personTypes.find((type) => type.slot === slot);
      const name = next?.shortLabel ?? previous?.shortLabel ?? slot;
      const describe = (type: PlanDraftPersonType | undefined) => (type ? tri(language, { en: `${type.allocation} pts · ${type.targetCount}`, ja: `${type.allocation} 点 · ${type.targetCount}人`, zh: `${type.allocation} 分 · ${type.targetCount}人` }) : null);
      push(`personTypes.${slot}`, name, describe(previous), describe(next));
      if (previous && next) push(`personTypes.${slot}.roleSituation`, name, previous.roleSituation, next.roleSituation);
    }
    const event = tri(language, { en: "Events", ja: "イベント", zh: "活动" });
    push("event", event, `${before.event.allocation}/${before.event.targetCount}`, `${after.event.allocation}/${after.event.targetCount}`);
    return changes;
  }

  async function aliasesForDraft(intake: PlanIntakeRow): Promise<{ aliases: Map<string, PlanFlowContact>; input: PlanAiContact[] }> {
    const contacts = await source.draftContacts(scope.actorId, intake.goalText, nowDate());
    return aliasContacts(contacts.slice(0, 200));
  }

  /* ---------- 确定 ---------- */

  async function confirmDraft(draft: PlanDraftRow, intake: PlanIntakeRow, manualEdit: boolean, context: PlanFlowRequestContext): Promise<PlanConfirmResult> {
    const content = draft.content;
    const result = await planService.createPlanFromDraft({
      content: {
        allocationReasons: content.allocationReasons,
        basis: content.basis,
        citations: content.citations,
        conclusion: content.conclusion,
        diagnosis: content.diagnosis,
        event: content.event,
        flow: content.flow,
        personTypes: content.personTypes.map(({ itemId: _itemId, ...type }) => type),
        steps: content.steps,
      },
      creationKey: draft.id,
      goalId: intake.id,
      goalKind: intake.goalKind,
      goalText: intake.goalText,
      manualEditAvailable: !manualEdit,
      premise: draft.premise,
      purposeLevel: intake.background.purpose?.value.selectedLevel ?? null,
      purposeText: purposeTextOf(intake),
    }).catch((error: unknown) => {
      if (error instanceof AppError && (error as { reason?: string }).reason === "PLAN_GOAL_LIMIT") throw new PlanFlowError("PLAN_GOAL_LIMIT", `At most ${PLAN_V2_GOAL_LIMIT} goals can be active at the same time.`);
      throw error;
    });
    const planId = result.plan.planId;
    await repository.transact(scope, async (tx) => {
      const currentDraft = await requireDraft(tx, draft.id);
      const currentIntake = await requireIntake(tx, intake.id);
      const at = now();
      if (currentDraft.status !== "confirmed") await tx.updateDraft({ ...currentDraft, confirmedAt: at, manualEditUsed: currentDraft.manualEditUsed || manualEdit, planId, status: "confirmed", updatedAt: at });
      if (currentIntake.status !== "planned") await tx.updateIntake({ ...currentIntake, planId, status: "planned", updatedAt: at });
    });
    return { archivedV1PlanId: result.archivedV1PlanId, href: planTaskSegmentHref(context.platform, planId), planId, replayed: !result.created };
  }

  /* ---------- 对外 ---------- */

  return {
    async guessGoalKind(text, context) {
      const goal = text.trim();
      const rule = (): PlanGoalKindResult => ({ goalKind: guessGoalKindByKeywords(goal), source: "rule" });
      if ([...goal].length < GOAL_KIND_MIN_LENGTH) return rule();
      const key = `goal-kind:${sha(goal.normalize("NFKC")).slice(0, 40)}`;
      const cached = await repository.read(scope, (reader) => reader.flowReceipt(key));
      if (cached?.kind === "goal_kind") return cached.response as unknown as PlanGoalKindResult;
      const used = await repository.read(scope, (reader) => reader.countFlowReceipts("goal_kind", tokyoDayStart(nowDate())));
      if (used >= PLAN_GOAL_KIND_DAILY_LIMIT) return rule();
      const outcome = await ai.goalKind({ text: goal }, { actorId: scope.actorId, language: context.language, ledgerKey: key, now: nowDate() });
      const result: PlanGoalKindResult = outcome.ok === true ? { goalKind: outcome.value.goalKind, source: "ai" } : rule();
      // 同文不重调：成功和降级都缓存（失败的操作在账本里已结算，同键也不会再调）。
      await repository.transact(scope, async (tx) => {
        if (await tx.flowReceipt(key)) return;
        await writeReceipt(tx, { body: { goal }, key, kind: "goal_kind", response: { ...result } });
      }).catch(() => undefined);
      return result;
    },

    async listIntakes(context) {
      return repository.read(scope, async (reader) => {
        const [intakes, left, active] = await Promise.all([reader.openIntakes(), newGoalsLeft(reader), reader.activePlans()]);
        return {
          activeGoalLimit: PLAN_V2_GOAL_LIMIT,
          activeGoals: active.length,
          intakes: intakes.map((intake) => ({ goal: intake.goalText, goalKind: intake.goalKind, href: planFlowHref(context.platform, intake.id), intakeId: intake.id, status: intake.status, updatedAt: intake.updatedAt })),
          newGoalsLeftThisMonth: left,
        };
      });
    },

    async createIntake(request, context) {
      if (!PLAN_GOAL_KINDS.includes(request.goalKind)) throw new PlanFlowError("INVALID_INPUT", "Unknown goal kind.");
      const body = { goalKind: request.goalKind, goalText: request.goalText.trim(), source: request.source };
      const created = await repository.transact(scope, async (tx) => {
        const prior = await replayed<{ intakeId: string }>(tx, request.idempotencyKey, "intake_create", body);
        if (prior) return { fresh: false, intake: await requireIntake(tx, prior.intakeId) };
        const active = await tx.activePlans();
        if (active.length >= PLAN_V2_GOAL_LIMIT) throw new PlanFlowError("PLAN_GOAL_LIMIT", `At most ${PLAN_V2_GOAL_LIMIT} goals can be active at the same time.`);
        if ((await newGoalsLeft(tx)) <= 0) throw new PlanFlowError("GOAL_MONTHLY_LIMIT", "No more new goals this month.", { limit: "monthly", retryOn: nextTokyoMonthStart(nowDate()) });
        const at = now();
        const intake: PlanIntakeRow = {
          aiSteps: emptyIntakeAiSteps(),
          answers: null,
          background: { me: null, purpose: null, reading: [], team: null },
          createdAt: at,
          goalKind: request.goalKind,
          goalText: body.goalText,
          id: `intake_${newId()}`,
          planId: null,
          premise: null,
          questions: null,
          source: request.source,
          status: "drafting",
          updatedAt: at,
        };
        await tx.insertIntake(intake);
        await writeReceipt(tx, { body, intakeId: intake.id, key: request.idempotencyKey, kind: "intake_create", response: { intakeId: intake.id } });
        return { fresh: true, intake };
      });
      let intake = created.intake;
      if (intake.status === "drafting" && intake.aiSteps.background.state === "none") {
        intake = await applyAfterAi(intake.id, intake.updatedAt, (current) => runBackground(current, 1, context), { body: { intakeId: intake.id, step: "background", attempt: 1 }, key: `${request.idempotencyKey}:background`, kind: "intake_background" });
      }
      return repository.read(scope, (reader) => intakeView(reader, intake, context));
    },

    async getIntake(intakeId, context) {
      return repository.read(scope, async (reader) => {
        const intake = await reader.intake(intakeId);
        return intake ? intakeView(reader, intake, context) : null;
      });
    },

    async retryBackground(intakeId, idempotencyKey, context) {
      const intake = await repository.read(scope, (reader) => requireIntake(reader, intakeId));
      const step = intake.aiSteps.background;
      const blocksConfirmed = Boolean(intake.background.me?.confirmedAt || intake.background.team?.confirmedAt || intake.background.purpose?.confirmedAt);
      const retriable = (intake.status === "drafting" || intake.status === "background") && step.state !== "done" && !blocksConfirmed;
      let next = intake;
      if (retriable) {
        const attempt = step.attempts + 1;
        next = await applyAfterAi(intakeId, intake.updatedAt, (current) => runBackground(current, attempt, context), { body: { attempt, intakeId, step: "background" }, key: idempotencyKey, kind: "intake_background" });
      }
      return repository.read(scope, (reader) => intakeView(reader, next, context));
    },

    async confirmBlock(intakeId, request, context) {
      const body = { ...request, idempotencyKey: undefined };
      const intake = await repository.transact(scope, async (tx) => {
        const prior = await replayed<{ intakeId: string }>(tx, request.idempotencyKey, "intake_block", body);
        const current = await requireIntake(tx, intakeId);
        if (prior) return current;
        if (current.status !== "background") throw new PlanFlowError("BACKGROUND_LOCKED", "The background can only be changed before the questions.");
        if (current.updatedAt !== request.expectedUpdatedAt) throw new PlanFlowError("STALE", "This flow was changed on another device.");
        const { me, team, purpose } = current.background;
        if (!me || !team || !purpose) throw new PlanFlowError("BLOCK_ORDER", "The background draft is not ready.");
        const at = now();
        const next: PlanIntakeRow = { ...current, background: { ...current.background }, updatedAt: at };
        const capabilities = new Set(PLAN_GOAL_TEMPLATES[current.goalKind].capabilities);
        if (request.block === "me") {
          next.background.me = { confirmedAt: at, value: { ...me.value, stance: request.me!.stance, wants: request.me!.wants.trim() } };
        } else if (request.block === "team") {
          if (!me.confirmedAt) throw new PlanFlowError("BLOCK_ORDER", "Confirm わたし first.");
          const byId = new Map(team.value.members.map((member) => [member.memberId, member]));
          const kept = request.team!.members.flatMap((change) => {
            const member = byId.get(change.memberId);
            if (!member) throw new PlanFlowError("INVALID_INPUT", "Unknown team member.");
            return [{ ...member, capabilities: change.capabilities.filter((id) => capabilities.has(id)), otherCapabilities: [...change.otherCapabilities], relation: member.isSelf ? null : change.relation }];
          });
          const self = kept.find((member) => member.isSelf) ?? team.value.members.find((member) => member.isSelf);
          if (!self) throw new PlanFlowError("INVALID_INPUT", "The team must include you.");
          const members = request.team!.mode === "solo" ? [self] : [self, ...kept.filter((member) => !member.isSelf)];
          next.background.team = { confirmedAt: at, value: { members, mode: request.team!.mode } };
        } else {
          if (!me.confirmedAt || !team.confirmedAt) throw new PlanFlowError("BLOCK_ORDER", "Confirm わたし and チーム first.");
          const level = request.purpose!.selectedLevel;
          if (!purpose.value.rungs.some((rung) => rung.level === level)) throw new PlanFlowError("INVALID_INPUT", "Unknown purpose level.");
          next.background.purpose = { confirmedAt: at, value: { ...purpose.value, selectedLevel: level } };
        }
        await tx.updateIntake(next);
        await writeReceipt(tx, { body, intakeId, key: request.idempotencyKey, kind: "intake_block", response: { intakeId } });
        return next;
      });
      return repository.read(scope, (reader) => intakeView(reader, intake, context));
    },

    async addMembers(intakeId, request, context) {
      const body = { ...request, idempotencyKey: undefined };
      const before = await repository.read(scope, (reader) => requireIntake(reader, intakeId));
      const prior = await repository.read(scope, (reader) => replayed<{ intakeId: string }>(reader, request.idempotencyKey, "intake_members", body));
      if (prior) return repository.read(scope, (reader) => intakeView(reader, before, context));
      if (before.status !== "background") throw new PlanFlowError("BACKGROUND_LOCKED", "The background can only be changed before the questions.");
      const capabilities = [...PLAN_GOAL_TEMPLATES[before.goalKind].capabilities];
      let added: PlanTeamMember[] = [];
      let membersStep = before.aiSteps.members;
      if (request.mode === "network") {
        const existing = new Set((before.background.team?.value.members ?? []).map((member) => member.contactId).filter(Boolean));
        const contacts = (await source.contacts(scope.actorId, request.contactIds)).filter((contact) => !existing.has(contact.id));
        if (contacts.length > 0) {
          const { aliases, input } = aliasContacts(contacts);
          const ids = contacts.map((contact) => contact.id).sort();
          const outcome = await ai.members({ capabilities, contacts: input, goalKind: before.goalKind }, { actorId: scope.actorId, language: context.language, ledgerKey: `intake:${intakeId}:members:${sha(ids).slice(0, 32)}`, now: nowDate() });
          const inferred = new Map(outcome.ok === true ? outcome.value.members.map((member) => [member.alias, member]) : []);
          membersStep = outcomeStep(membersStep, outcome, now(), true);
          added = [...aliases.entries()].map(([alias, contact]) => ({
            basis: inferred.get(alias)?.basis || null,
            capabilities: inferred.get(alias)?.capabilities ?? [],
            contactId: contact.id,
            headline: headlineOf(contact),
            isSelf: false,
            memberId: `contact:${contact.id}`,
            name: contact.name,
            otherCapabilities: [],
            relation: null,
            source: "network" as const,
          }));
        }
      } else {
        const relationLabel = tri(context.language, { en: request.relation, ja: { advisor: "アドバイザー", cofounder: "共同創業者", contractor: "業務委託", employee: "社員" }[request.relation], zh: { advisor: "顾问", cofounder: "联合创始人", contractor: "外包合作", employee: "员工" }[request.relation] });
        const contactId = request.alsoAddToNetwork ? await source.addContact(scope.actorId, { name: request.name.trim(), relationLabel }) : null;
        added = [{
          basis: null,
          capabilities: request.capabilities.filter((id) => capabilities.includes(id)),
          contactId,
          headline: relationLabel,
          isSelf: false,
          memberId: `manual:${newId()}`,
          name: request.name.trim(),
          otherCapabilities: [...request.otherCapabilities],
          relation: request.relation,
          source: "manual",
        }];
      }
      const intake = await repository.transact(scope, async (tx) => {
        const again = await replayed<{ intakeId: string }>(tx, request.idempotencyKey, "intake_members", body);
        const current = await requireIntake(tx, intakeId);
        if (again) return current;
        if (current.status !== "background" || !current.background.team) throw new PlanFlowError("BACKGROUND_LOCKED", "The background can only be changed before the questions.");
        const members = [...current.background.team.value.members];
        for (const member of added) if (!member.contactId || !members.some((item) => item.contactId === member.contactId)) members.push(member);
        if (members.length > PLAN_TEAM_MEMBER_LIMIT) throw new PlanFlowError("INVALID_INPUT", "Too many team members.");
        const at = now();
        const next: PlanIntakeRow = {
          ...current,
          aiSteps: { ...current.aiSteps, members: membersStep },
          background: { ...current.background, team: { confirmedAt: null, value: { members, mode: "team" } } },
          updatedAt: at,
        };
        await tx.updateIntake(next);
        await writeReceipt(tx, { body, intakeId, key: request.idempotencyKey, kind: "intake_members", response: { intakeId } });
        return next;
      });
      return repository.read(scope, (reader) => intakeView(reader, intake, context));
    },

    async recomputeLadder(intakeId, request, context) {
      const wants = request.wants.trim();
      const before = await repository.read(scope, (reader) => requireIntake(reader, intakeId));
      if (before.status !== "background") throw new PlanFlowError("BACKGROUND_LOCKED", "The background can only be changed before the questions.");
      const me = before.background.me;
      if (!me || !before.background.purpose) throw new PlanFlowError("BLOCK_ORDER", "The background draft is not ready.");
      if (me.value.wants === wants) return repository.read(scope, (reader) => intakeView(reader, before, context));
      if (before.aiSteps.ladderCount >= PLAN_LADDER_LIMIT) throw new PlanFlowError("LADDER_LIMIT", "The purpose ladder can be rebuilt at most 3 times.");
      const team = before.background.team?.value;
      const outcome = await ai.ladder(
        { goalText: before.goalText, team: `${team?.mode ?? "solo"} ${(team?.members ?? []).length}`, wants },
        { actorId: scope.actorId, language: context.language, ledgerKey: `intake:${intakeId}:ladder:${sha(wants).slice(0, 32)}`, now: nowDate() },
      );
      const intake = await repository.transact(scope, async (tx) => {
        const body = { wants };
        const prior = await replayed<{ intakeId: string }>(tx, request.idempotencyKey, "intake_ladder", body);
        const current = await requireIntake(tx, intakeId);
        if (prior) return current;
        if (current.status !== "background" || !current.background.me || !current.background.purpose) throw new PlanFlowError("BACKGROUND_LOCKED", "The background can only be changed before the questions.");
        const at = now();
        const purpose = outcome.ok === true
          ? { confirmedAt: null, value: { ...outcome.value, selectedLevel: outcome.value.suggestedLevel ?? 2 } }
          : current.background.purpose;
        const next: PlanIntakeRow = {
          ...current,
          aiSteps: { ...current.aiSteps, ladder: outcomeStep(current.aiSteps.ladder, outcome, at, true), ladderCount: current.aiSteps.ladderCount + (outcome.ok === true ? 1 : 0) },
          background: { ...current.background, me: { ...current.background.me, value: { ...current.background.me.value, wants } }, purpose },
          updatedAt: at,
        };
        await tx.updateIntake(next);
        await writeReceipt(tx, { body, intakeId, key: request.idempotencyKey, kind: "intake_ladder", response: { intakeId } });
        return next;
      });
      return repository.read(scope, (reader) => intakeView(reader, intake, context));
    },

    async chooseQuestions(intakeId, idempotencyKey, context) {
      const before = await repository.read(scope, (reader) => requireIntake(reader, intakeId));
      if (before.status !== "background") return repository.read(scope, (reader) => intakeView(reader, before, context));
      const { me, team, purpose } = before.background;
      if (!me?.confirmedAt || !team?.confirmedAt || !purpose?.confirmedAt) throw new PlanFlowError("BACKGROUND_NOT_CONFIRMED", "Confirm all three background blocks first.");
      const summary = backgroundSummary(before, context.language);
      const cacheKey = backgroundCacheKey(before.goalKind, summary.text);
      const cached = await repository.read(scope, (reader) => reader.flowReceipt(cacheKey));
      let chosen = cached?.kind === "questions_cache" ? (cached.response as unknown as { items: PlanIntakeRow["questions"] }).items : null;
      let step = before.aiSteps.questions;
      if (!chosen) {
        const bank = questionBank(before.goalKind, context.language);
        const outcome = await ai.questions({ background: summary.text, bank, gaps: summary.gaps, goalKind: before.goalKind }, { actorId: scope.actorId, language: context.language, ledgerKey: cacheKey, now: nowDate() });
        step = outcomeStep(step, outcome, now(), true);
        const picked = outcome.ok === true ? outcome.value : ruleQuestions({ gaps: summary.gaps, goalKind: before.goalKind }, () => tri(context.language, { en: "Chosen by the default order of this goal type.", ja: "この目標タイプの標準の順で選びました。", zh: "按这类目标的默认顺序选出。" }));
        chosen = { cacheKey, items: picked.questions.map((question) => ({ guess: question.guess, id: question.id, why: question.why })), skipped: picked.skipped };
      } else {
        step = { ...step, at: now(), state: "done" };
      }
      const questions = chosen;
      const intake = await repository.transact(scope, async (tx) => {
        const body = { intakeId };
        const prior = await replayed<{ intakeId: string }>(tx, idempotencyKey, "intake_questions", body);
        const current = await requireIntake(tx, intakeId);
        if (prior || current.status !== "background") return current;
        const at = now();
        const next: PlanIntakeRow = { ...current, aiSteps: { ...current.aiSteps, questions: step }, questions, status: "questions", updatedAt: at };
        await tx.updateIntake(next);
        await writeReceipt(tx, { body, intakeId, key: idempotencyKey, kind: "intake_questions", response: { intakeId } });
        if (step.state === "done" && !(await tx.flowReceipt(cacheKey))) {
          await writeReceipt(tx, { body: { cacheKey }, key: cacheKey, kind: "questions_cache", response: { items: questions } });
        }
        return next;
      });
      return repository.read(scope, (reader) => intakeView(reader, intake, context));
    },

    async submitAnswers(intakeId, request, context) {
      const body = { answers: request.answers };
      const intake = await repository.transact(scope, async (tx) => {
        const prior = await replayed<{ intakeId: string }>(tx, request.idempotencyKey, "intake_answers", body);
        const current = await requireIntake(tx, intakeId);
        if (prior) return current;
        if (current.status !== "questions" || !current.questions) throw new PlanFlowError("QUESTIONS_NOT_READY", "Choose the questions first.");
        const templates = new Map(PLAN_GOAL_TEMPLATES[current.goalKind].questions.map((question) => [question.id, question]));
        const given = new Map(request.answers.map((answer) => [answer.questionId, answer]));
        for (const answer of request.answers) {
          const template = templates.get(answer.questionId);
          if (!template || !current.questions.items.some((item) => item.id === answer.questionId)) throw new PlanFlowError("INVALID_INPUT", `Unknown question ${answer.questionId}.`);
          if (answer.values.some((value) => !template.options.includes(value))) throw new PlanFlowError("INVALID_INPUT", `Unknown option for ${answer.questionId}.`);
          if (template.type === "single" && answer.values.length > 1) throw new PlanFlowError("INVALID_INPUT", `${answer.questionId} takes one option.`);
        }
        const answers: PlanIntakeAnswer[] = current.questions.items.map((question) => {
          const answer = given.get(question.id);
          const text = answer?.text?.trim() || null;
          if (answer && (answer.values.length > 0 || text)) return { guessed: false, questionId: question.id, text, values: [...answer.values] };
          return { guessed: true, questionId: question.id, text: question.guess?.text ?? null, values: [...(question.guess?.values ?? [])] };
        });
        const at = now();
        const next: PlanIntakeRow = { ...current, aiSteps: { ...current.aiSteps, premiseVersion: 1 }, answers, premise: buildPremise(current, answers, context.language), status: "premise", updatedAt: at };
        await tx.updateIntake(next);
        await writeReceipt(tx, { body, intakeId, key: request.idempotencyKey, kind: "intake_answers", response: { intakeId } });
        return next;
      });
      return repository.read(scope, (reader) => intakeView(reader, intake, context));
    },

    async editPremise(intakeId, request, context) {
      const body = { key: request.key, value: request.value.trim() };
      const intake = await repository.transact(scope, async (tx) => {
        const prior = await replayed<{ intakeId: string }>(tx, request.idempotencyKey, "intake_premise", body);
        const current = await requireIntake(tx, intakeId);
        if (prior) return current;
        if ((current.status !== "premise" && current.status !== "drafted") || !current.premise) throw new PlanFlowError("PREMISE_NOT_READY", "Answer the questions first.");
        if (!current.premise.some((row) => row.key === request.key)) throw new PlanFlowError("INVALID_INPUT", "Unknown premise row.");
        const at = now();
        // 改前提 → 初版作废、重做（不计修正次数）。
        if (current.aiSteps.draftId) {
          const draft = await tx.draft(current.aiSteps.draftId);
          if (draft && draft.status === "open") await tx.updateDraft({ ...draft, status: "discarded", updatedAt: at });
        }
        const next: PlanIntakeRow = {
          ...current,
          aiSteps: { ...current.aiSteps, draft: emptyStep(), draftId: null, premiseVersion: current.aiSteps.premiseVersion + 1 },
          premise: current.premise.map((row) => (row.key === request.key ? { ...row, guessed: false, value: body.value } : row)),
          status: "premise",
          updatedAt: at,
        };
        await tx.updateIntake(next);
        await writeReceipt(tx, { body, intakeId, key: request.idempotencyKey, kind: "intake_premise", response: { intakeId } });
        return next;
      });
      return repository.read(scope, (reader) => intakeView(reader, intake, context));
    },

    async makeDraft(intakeId, idempotencyKey, context) {
      const before = await repository.read(scope, (reader) => requireIntake(reader, intakeId));
      if (before.aiSteps.draftId) {
        const existing = await repository.read(scope, (reader) => reader.draft(before.aiSteps.draftId!));
        if (existing) return draftView(existing, before, context);
      }
      if (before.status !== "premise" || !before.premise) throw new PlanFlowError("PREMISE_NOT_READY", "Answer the questions first.");
      const premiseVersion = before.aiSteps.premiseVersion;
      const attempt = before.aiSteps.draft.state === "failed" ? before.aiSteps.draft.attempts + 1 : Math.max(1, before.aiSteps.draft.attempts);
      const ledgerKey = attempt > 1 ? `draft:${intakeId}:${premiseVersion}#${attempt}` : `draft:${intakeId}:${premiseVersion}`;
      const industries: IndustryIdCode[] = [];
      const slots = slotInfos(before.goalKind, industries, context.language);
      const eventTemplate = PLAN_GOAL_TEMPLATES[before.goalKind].slots.find((slot) => slot.slot === PLAN_EVENT_SLOT)!;
      const landscape = publishedEntriesFor({ goalKind: before.goalKind, industries, now: nowDate() }).map((entry) => ({ id: entry.id, summary: entry.summary[context.language], title: entry.title[context.language], version: entry.version }));
      const { aliases, input: contacts } = await aliasesForDraft(before);
      const summary = backgroundSummary(before, context.language);
      const outcome = await ai.firstDraft({
        background: summary.text,
        contacts,
        eventSlot: { allocation: eventTemplate.allocation, targetCount: eventTemplate.targetCount },
        gaps: summary.gaps,
        goalKind: before.goalKind,
        goalText: before.goalText,
        landscape,
        premise: before.premise,
        purpose: purposeTextOf(before),
        slots,
      }, { actorId: scope.actorId, language: context.language, ledgerKey, now: nowDate() });
      const result = await repository.transact(scope, async (tx) => {
        const body = { intakeId, premiseVersion };
        const prior = await replayed<{ draftId: string }>(tx, idempotencyKey, "draft_create", body);
        const current = await requireIntake(tx, intakeId);
        if (prior) return { draft: await requireDraft(tx, prior.draftId), intake: current };
        if (current.aiSteps.draftId) return { draft: await requireDraft(tx, current.aiSteps.draftId), intake: current };
        if (current.status !== "premise" || current.aiSteps.premiseVersion !== premiseVersion) throw new PlanFlowError("STALE", "The premise changed while the draft was being written.");
        const at = now();
        if (outcome.ok === false) {
          await tx.updateIntake({ ...current, aiSteps: { ...current.aiSteps, draft: { ...outcomeStep(current.aiSteps.draft, outcome, at, false), attempts: attempt } }, updatedAt: at });
          return { failure: outcome as Extract<PlanAiOutcome<unknown>, { ok: false }>, intake: current };
        }
        const content = toDraftContent(outcome.value, current.goalKind, aliases, context.language, current.premise ?? []);
        const draft: PlanDraftRow = {
          aiFixUsed: 0,
          baseRevision: null,
          confirmedAt: null,
          content,
          createdAt: at,
          fix: emptyStep(),
          id: `draft_${newId()}`,
          intakeId,
          kind: "initial",
          manualEditUsed: false,
          originContent: content,
          planId: null,
          premise: current.premise ?? [],
          premiseVersion,
          status: "open",
          turns: [],
          updatedAt: at,
        };
        await tx.insertDraft(draft);
        const next: PlanIntakeRow = { ...current, aiSteps: { ...current.aiSteps, draft: { ...outcomeStep(current.aiSteps.draft, outcome, at, false), attempts: attempt }, draftId: draft.id }, status: "drafted", updatedAt: at };
        await tx.updateIntake(next);
        await writeReceipt(tx, { body, draftId: draft.id, intakeId, key: idempotencyKey, kind: "draft_create", response: { draftId: draft.id } });
        return { draft, intake: next };
      });
      if ("failure" in result && result.failure) throw aiError(result.failure);
      return draftView((result as { draft: PlanDraftRow }).draft, result.intake, context);
    },

    async getDraft(draftId, context) {
      return repository.read(scope, async (reader) => {
        const draft = await reader.draft(draftId);
        if (!draft) return null;
        return draftView(draft, draft.intakeId ? await reader.intake(draft.intakeId) : null, context);
      });
    },

    async fix(draftId, request, context) {
      const text = request.text.trim();
      const body = { text };
      const prior = await repository.read(scope, (reader) => replayed<{ draftId: string }>(reader, request.idempotencyKey, "draft_fix", body));
      const before = await repository.read(scope, (reader) => requireDraft(reader, draftId));
      const intake = before.intakeId ? await repository.read(scope, (reader) => requireIntake(reader, before.intakeId!)) : null;
      if (prior) return draftView(before, intake, context);
      if (before.status !== "open" || before.kind !== "initial" || !intake) throw new PlanFlowError("DRAFT_CLOSED", "This draft is closed.");
      if (before.manualEditUsed) throw new PlanFlowError("MANUAL_EDIT_USED", "The draft was edited by hand.");
      if (before.aiFixUsed >= PLAN_AI_FIX_LIMIT) throw new PlanFlowError("FIX_LIMIT", "All AI revisions have been used.");
      const n = before.aiFixUsed + 1;
      const attempt = before.fix.state === "failed" ? before.fix.attempts + 1 : 1;
      const ledgerKey = attempt > 1 ? `fix:${draftId}:${n}#${attempt}` : `fix:${draftId}:${n}`;
      const industries: IndustryIdCode[] = [];
      const slots = slotInfos(intake.goalKind, industries, context.language);
      const landscape = publishedEntriesFor({ goalKind: intake.goalKind, industries, now: nowDate() }).map((entry) => ({ id: entry.id, summary: entry.summary[context.language], title: entry.title[context.language], version: entry.version }));
      const { aliases, input: contacts } = await aliasesForDraft(intake);
      const aliasesById = new Map([...aliases.entries()].map(([alias, contact]) => [contact.id, alias]));
      const outcome = await ai.fix({
        contacts,
        current: toDraftOutput(before.content, aliasesById),
        goalKind: intake.goalKind,
        landscape,
        premise: before.premise,
        previousTurns: before.turns.map((turn) => turn.input),
        request: text,
        slots,
      }, { actorId: scope.actorId, language: context.language, ledgerKey, now: nowDate() });
      const draft = await repository.transact(scope, async (tx) => {
        const again = await replayed<{ draftId: string }>(tx, request.idempotencyKey, "draft_fix", body);
        const current = await requireDraft(tx, draftId);
        if (again) return current;
        if (current.aiFixUsed !== before.aiFixUsed || current.status !== "open") throw new PlanFlowError("STALE", "The draft changed while the revision was being written.");
        const at = now();
        if (outcome.ok === false) {
          // 失败不计次（DESIGN §5.2 C7）：只记步骤状态，修正次数不变。
          await tx.updateDraft({ ...current, fix: { ...outcomeStep(current.fix, outcome, at, false), attempts: attempt }, updatedAt: at });
          return { failure: outcome as Extract<PlanAiOutcome<unknown>, { ok: false }> };
        }
        const keys = current.content.steps.map((step) => step.key);
        const revised = toDraftContent(outcome.value.revised, intake.goalKind, aliases, context.language, current.premise, keys);
        const reasons = new Map(outcome.value.reasons.map((reason) => [reason.path, reason.reason]));
        const changes = diffContent(current.content, revised, context.language, reasons);
        const turn: PlanDraftTurn = {
          at,
          changes,
          input: text,
          n,
          noChangeReason: changes.length === 0 ? outcome.value.noChangeReason ?? tri(context.language, { en: "Nothing needed to change.", ja: "今回は変更しません。", zh: "这次不做修改。" }) : null,
          unchanged: outcome.value.unchanged,
        };
        const next: PlanDraftRow = {
          ...current,
          aiFixUsed: n,
          content: changes.length === 0 ? current.content : revised,
          fix: { ...outcomeStep(current.fix, outcome, at, false), attempts: 0 },
          originContent: changes.length === 0 ? current.originContent : revised,
          turns: [...current.turns, turn],
          updatedAt: at,
        };
        await tx.updateDraft(next);
        await writeReceipt(tx, { body, draftId, key: request.idempotencyKey, kind: "draft_fix", response: { draftId } });
        return next;
      });
      if ("failure" in draft) throw aiError(draft.failure as Extract<PlanAiOutcome<unknown>, { ok: false }>);
      return draftView(draft as PlanDraftRow, intake, context);
    },

    async reset(draftId, idempotencyKey, context) {
      const draft = await repository.transact(scope, async (tx) => {
        const body = { draftId };
        const prior = await replayed<{ draftId: string }>(tx, idempotencyKey, "draft_reset", body);
        const current = await requireDraft(tx, draftId);
        if (prior) return current;
        if (current.status !== "open" || current.manualEditUsed) throw new PlanFlowError("DRAFT_CLOSED", "This draft is closed.");
        const next = { ...current, content: current.originContent, updatedAt: now() };
        await tx.updateDraft(next);
        await writeReceipt(tx, { body, draftId, key: idempotencyKey, kind: "draft_reset", response: { draftId } });
        return next;
      });
      const intake = draft.intakeId ? await repository.read(scope, (reader) => reader.intake(draft.intakeId!)) : null;
      return draftView(draft, intake, context);
    },

    async manualEdit(draftId, request, context) {
      const body = { ...request, idempotencyKey: undefined };
      const saved = await repository.transact(scope, async (tx) => {
        const prior = await replayed<{ draftId: string }>(tx, request.idempotencyKey, "draft_manual_edit", body);
        const current = await requireDraft(tx, draftId);
        const intake = current.intakeId ? await requireIntake(tx, current.intakeId) : null;
        if (!intake) throw new PlanFlowError("DRAFT_CLOSED", "This draft is closed.");
        if (prior) return { draft: current, intake };
        if (current.status !== "open" || current.kind !== "initial") throw new PlanFlowError("DRAFT_CLOSED", "This draft is closed.");
        if (current.manualEditUsed) throw new PlanFlowError("MANUAL_EDIT_USED", "The plan can be edited by hand only once.");
        if (current.updatedAt !== request.expectedRevision) throw new PlanFlowError("STALE", "This draft was changed on another device.");
        const template = PLAN_GOAL_TEMPLATES[intake.goalKind];
        const byKey = new Map(current.content.personTypes.map((type) => [type.key, type]));
        const personTypes: PlanDraftPersonType[] = request.personTypes.map((change) => {
          if (change.key) {
            const type = byKey.get(change.key);
            if (!type) throw new PlanFlowError("INVALID_INPUT", `Unknown person type ${change.key}.`);
            return { ...type, allocation: change.allocation, targetCount: change.targetCount };
          }
          const slot = template.slots.find((item) => item.slot === change.slot && item.slot !== PLAN_EVENT_SLOT);
          if (!slot || byKey.has(slot.slot)) throw new PlanFlowError("INVALID_INPUT", "A new person type must be an unused template slot.");
          const label = shortName(slot.slot, context.language);
          return {
            allocation: change.allocation,
            countRule: tri(context.language, { en: "Counts once you have talked about the goal", ja: "目標について話せたら 1 人", zh: "聊到目标就算 1 人" }),
            emoji: slot.emoji,
            introRoutes: [],
            itemId: slot.slot,
            key: slot.slot,
            opener: null,
            persona: null,
            questions: [],
            recognizeHints: [label],
            roleSituation: label,
            shortLabel: label,
            shortLabelId: slot.slot,
            slot: slot.slot,
            targetCount: change.targetCount,
            why: "",
          };
        });
        const keys = new Set(personTypes.map((type) => type.key));
        if (keys.size !== personTypes.length) throw new PlanFlowError("INVALID_INPUT", "Person types must be unique.");
        let counter = current.content.steps.length;
        const existingSteps = new Set(current.content.steps.map((step) => step.key));
        const steps = request.steps.map((step) => {
          if (step.key && !existingSteps.has(step.key)) throw new PlanFlowError("INVALID_INPUT", `Unknown step ${step.key}.`);
          const typeKeys = step.personTypeKeys.filter((key) => key === PLAN_EVENT_SLOT || keys.has(key));
          const previous = step.key ? current.content.steps.find((item) => item.key === step.key) : undefined;
          return { doneCriteria: step.doneCriteria, key: step.key ?? `step-${(counter += 1)}`, personTypeKeys: typeKeys, title: step.title, why: previous?.why ?? null };
        });
        const content: PlanDraftContent = { ...current.content, event: { ...request.event }, personTypes, steps };
        const slots: PlanAllocationSlot[] = allocationSlotsOf(intake.goalKind, content);
        const allocation = validateAllocations(slots);
        if (allocation.ok === false) throw new PlanFlowError("INVALID_INPUT", `The allocation is not valid (${allocation.error}).`);
        const at = now();
        const changes = diffContent(current.content, content, context.language);
        const next: PlanDraftRow = { ...current, content, manualEditUsed: true, turns: current.turns, updatedAt: at };
        await tx.updateDraft(next);
        await writeReceipt(tx, { body, draftId, key: request.idempotencyKey, kind: "draft_manual_edit", response: { changes: changes.length, draftId } });
        return { draft: next, intake };
      });
      return confirmDraft(saved.draft, saved.intake, true, context);
    },

    async confirm(draftId, idempotencyKey, context) {
      const { draft, intake } = await repository.read(scope, async (reader) => {
        const current = await requireDraft(reader, draftId);
        const owner = current.intakeId ? await requireIntake(reader, current.intakeId) : null;
        return { draft: current, intake: owner };
      });
      if (!intake || draft.kind !== "initial") throw new PlanFlowError("DRAFT_CLOSED", "This draft is closed.");
      if (draft.status === "discarded") throw new PlanFlowError("DRAFT_CLOSED", "This draft is closed.");
      void idempotencyKey; // 同一份草稿重复确定只建一份（creationKey = 草稿 id），幂等由 createPlanFromDraft 保证。
      return confirmDraft(draft, intake, draft.manualEditUsed, context);
    },
  };
}

export const PLAN_FLOW_MONTHLY_BACKGROUND_LIMIT = AI_QUOTA_MONTHLY_LIMITS.plan_background;
export { blankContent as emptyPlanDraftContent };
