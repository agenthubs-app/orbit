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
  PlanAchieveRequest,
  PlanGoalEditRequest,
  PlanGoalEditResult,
  PlanNextGoalsResponse,
  PlanQuotaResponse,
  PlanReviewFixRequest,
  PlanReviewToggleRequest,
  PlanReviewView,
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
import { activeAwards, PLAN_REVIEW_MONTHLY_LIMIT, type PlanV2Service } from "./service";
import type { PlanV2Row, PlanV2TypeItem } from "./types";

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
  "PLAN_NOT_FOUND",
  "PLAN_ACHIEVED",
  "REVIEW_LIMIT",
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
  PLAN_ACHIEVED: "CONFLICT",
  PLAN_NOT_FOUND: "NOT_FOUND",
  REVIEW_LIMIT: "CONFLICT",
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
  /* ---------- R25 ---------- */
  /** 開始見直し：打开（或续上）这份计划的见直草稿 + 前提预标（C8，每天最多一次；打开不扣次数）。 */
  startReview(planId: string, idempotencyKey: string, context: PlanFlowRequestContext): Promise<PlanReviewView>;
  getReview(draftId: string, context: PlanFlowRequestContext): Promise<PlanReviewView | null>;
  /** R25：这份计划进行中的見直し（没有为 null，不新建）。 */
  currentReview(planId: string, context: PlanFlowRequestContext): Promise<PlanReviewView | null>;
  /** 发出修正（C9）：扣本月见直 1 次（失败不扣，不改也扣）。 */
  reviewFix(draftId: string, request: PlanReviewFixRequest, context: PlanFlowRequestContext): Promise<PlanReviewView>;
  /** 逐条 ✓ / ✕（只对最新一轮）；配点由回流保证合计 100。 */
  toggleChange(draftId: string, changeId: string, request: PlanReviewToggleRequest, context: PlanFlowRequestContext): Promise<PlanReviewView>;
  quota(): Promise<PlanQuotaResponse>;
  /** 确定后的手动编辑：开一份只做手动编辑的见直草稿（不调 AI、不扣见直）。 */
  openManualEdit(planId: string, idempotencyKey: string, context: PlanFlowRequestContext): Promise<PlanDraftView>;
  achieve(planId: string, request: PlanAchieveRequest): Promise<{ planId: string; achievedAt: string }>;
  nextGoals(planId: string, context: PlanFlowRequestContext): Promise<PlanNextGoalsResponse>;
  editGoal(planId: string, request: PlanGoalEditRequest, context: PlanFlowRequestContext): Promise<PlanGoalEditResult>;
}

export interface PlanFlowServiceOptions {
  repository: PlanV2Repository;
  planService: PlanV2Service;
  ai: PlanFlowAi;
  context: PlanFlowContextSource;
  scope: PlanV2Scope;
  now?: () => Date;
  newId?: () => string;
  /** R24：确定后为新计划入队 plan 来源的候补匹配（幂等、只跑规则层）；失败只记日志。 */
  afterConfirmed?: (input: { actorId: string; planId: string }) => Promise<void>;
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

  /** 失败的 AI 步骤也留回执：同键重放直接返回同一个错误，不再调 AI（复核 m2）。 */
  function failureResponse(failure: Extract<PlanAiOutcome<unknown>, { ok: false }>): Record<string, unknown> {
    return { failure: { limit: failure.limit ?? null, reason: failure.reason, retryOn: failure.retryOn ?? null } };
  }

  function throwIfFailedReceipt(response: Record<string, unknown> | null): void {
    const failure = response?.failure as { reason: "failed" | "limit" | "busy" | "disabled"; limit: "daily" | "monthly" | null; retryOn: string | null } | undefined;
    if (failure) throw aiError({ limit: failure.limit ?? undefined, ok: false, reason: failure.reason, retryOn: failure.retryOn });
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

  async function runBackground(intake: PlanIntakeRow, attempt: number, context: PlanFlowRequestContext): Promise<PlanIntakeRow | null> {
    const kind = intake.goalKind;
    const capabilities = [...PLAN_GOAL_TEMPLATES[kind].capabilities];
    const [profile, candidates] = await Promise.all([source.profile(scope.actorId), source.teamCandidates(scope.actorId)]);
    const { aliases, input } = aliasContacts(candidates);
    const outcome = await ai.background(
      { capabilities, contacts: input, goalKind: kind, goalText: intake.goalText, profile },
      { actorId: scope.actorId, language: context.language, ledgerKey: `intake:${intake.id}:background:${attempt}`, now: nowDate() },
    );
    // 同键操作正在进行（或刚完成）：不是失败，不写回，读当前状态（复核 M2）。
    if (outcome.ok === false && outcome.reason === "busy") return null;
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
    // 「もう一度」时保留用户自己加的成员（手写的、AI 下书没提到的人脈から）（复核 m6）。
    if (attempt > 1 && intake.background.team) {
      const drafted = new Set(team.members.map((member) => member.contactId).filter(Boolean));
      const candidateIds = new Set(candidates.map((contact) => contact.id));
      const kept = intake.background.team.value.members.filter((member) => !member.isSelf && (member.source === "manual" || (member.contactId && !candidateIds.has(member.contactId) && !drafted.has(member.contactId))));
      if (kept.length) team = { members: [...team.members, ...kept], mode: "team" };
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
  async function applyAfterAi(intakeId: string, expectedUpdatedAt: string, compute: (intake: PlanIntakeRow) => Promise<PlanIntakeRow | null>, receipt: { key: string; kind: string; body: unknown }): Promise<PlanIntakeRow> {
    // 同键重放先查回执，不再调 AI（复核 M1）。
    const replay = await repository.read(scope, async (reader) => ({ intake: await requireIntake(reader, intakeId), prior: await replayed<{ intakeId: string }>(reader, receipt.key, receipt.kind, receipt.body) }));
    if (replay.prior) return replay.intake;
    const before = replay.intake;
    if (before.updatedAt !== expectedUpdatedAt) return before;
    const next = await compute(before);
    if (!next) return repository.read(scope, (reader) => requireIntake(reader, intakeId));
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
      // 复核 M3：Step 的关联类型与理由的变化也要在差分里看得见。
      const typeLabels = (keys: readonly string[] | undefined) => (keys ? keys.map((key) => after.personTypes.find((type) => type.key === key)?.shortLabel ?? before.personTypes.find((type) => type.key === key)?.shortLabel ?? tri(language, { en: "Events", ja: "イベント", zh: "活动" })).join("・") : null);
      if (previous && next && JSON.stringify(previous.personTypeKeys) !== JSON.stringify(next.personTypeKeys)) {
        push(`steps.${index}.personTypeKeys`, tri(language, { en: `Step ${n} people`, ja: `Step ${n} の人物タイプ`, zh: `Step ${n} 的人物类型` }), typeLabels(previous.personTypeKeys), typeLabels(next.personTypeKeys));
      }
      if (previous && next) push(`steps.${index}.why`, tri(language, { en: `Step ${n} reason`, ja: `Step ${n} の理由`, zh: `Step ${n} 的理由` }), previous.why ?? null, next.why ?? null);
    }
    const slots = [...new Set([...before.personTypes.map((type) => type.slot), ...after.personTypes.map((type) => type.slot)])];
    for (const slot of slots) {
      const previous = before.personTypes.find((type) => type.slot === slot);
      const next = after.personTypes.find((type) => type.slot === slot);
      const name = next?.shortLabel ?? previous?.shortLabel ?? slot;
      const describe = (type: PlanDraftPersonType | undefined) => (type ? tri(language, { en: `${type.allocation} pts · ${type.targetCount}`, ja: `${type.allocation} 点 · ${type.targetCount}人`, zh: `${type.allocation} 分 · ${type.targetCount}人` }) : null);
      push(`personTypes.${slot}`, name, describe(previous), describe(next));
      if (previous && next) push(`personTypes.${slot}.roleSituation`, name, previous.roleSituation, next.roleSituation);
      if (previous && next) push(`personTypes.${slot}.why`, `${name} · ${tri(language, { en: "why", ja: "理由", zh: "理由" })}`, previous.why, next.why);
    }
    const event = tri(language, { en: "Events", ja: "イベント", zh: "活动" });
    push("event", event, `${before.event.allocation}/${before.event.targetCount}`, `${after.event.allocation}/${after.event.targetCount}`);
    const cites = (content: PlanDraftContent) => content.citations.map((citation) => `${citation.id} v${citation.version}`).join("・") || null;
    push("citations", tri(language, { en: "Sources", ja: "参考資料", zh: "参考资料" }), cites(before), cites(after));
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
    if (result.created && options.afterConfirmed) {
      await options.afterConfirmed({ actorId: scope.actorId, planId }).catch((error: unknown) => {
        console.error(JSON.stringify({ error: error instanceof Error ? error.name : "unknown", event: "plan_flow_enqueue_match_failed" }));
      });
    }
    return { archivedV1PlanId: result.archivedV1PlanId, href: planTaskSegmentHref(context.platform, planId), planId, replayed: !result.created };
  }

  /* ---------- R25 見直し、達成、目标编辑 ---------- */

  type StoredTurn = PlanDraftRow["turns"][number] & { base?: PlanDraftContent; revised?: PlanDraftContent };
  const MANUAL_ONLY = -1; // 只做手动编辑的见直草稿（premiseVersion 记 -1）。

  async function requirePlan(reader: Pick<PlanV2Transaction, "plan">, planId: string): Promise<PlanV2Row> {
    const plan = await reader.plan(planId);
    if (!plan || plan.status !== "active") {
      if (plan?.achievedAt) throw new PlanFlowError("PLAN_ACHIEVED", "This goal is already achieved.");
      throw new PlanFlowError("PLAN_NOT_FOUND", "Plan not found.");
    }
    return plan;
  }

  function planContentOf(plan: PlanV2Row, types: readonly PlanV2TypeItem[]): PlanDraftContent {
    return {
      allocationReasons: [...plan.analysis.allocationReasons],
      basis: [...plan.analysis.basis],
      citations: [...plan.analysis.citations],
      conclusion: plan.analysis.conclusion,
      diagnosis: plan.analysis.diagnosis,
      event: { allocation: plan.eventAllocation, targetCount: plan.eventTargetCount },
      flow: plan.analysis.flow ? [...plan.analysis.flow] : [],
      personTypes: types.map((type) => ({
        allocation: type.allocation,
        countRule: type.personType.countRule,
        emoji: type.personType.emoji,
        introRoutes: [...type.personType.introRoutes],
        itemId: type.personType.key,
        key: type.personType.key,
        opener: type.personType.opener,
        persona: type.personType.persona,
        primaryIndustryId: type.primaryIndustryId,
        questions: [...type.personType.questions],
        recognizeHints: [...type.personType.recognizeHints],
        roleSituation: type.roleSituation,
        secondaryIndustryId: type.secondaryIndustryId,
        shortLabel: type.shortLabel,
        shortLabelId: type.personType.shortLabelId,
        slot: type.slot,
        targetCount: type.targetCount,
        why: type.personType.why,
      })),
      steps: plan.steps.map((step) => ({ ...step, personTypeKeys: [...step.personTypeKeys] })),
    };
  }

  /** 每个类型已得的 base 分与已计入人数（只读；跳过记的满额也算已得）。 */
  function earnedOf(log: Parameters<typeof activeAwards>[0]): { earned: Record<string, number>; met: Record<string, number> } {
    const earned: Record<string, number> = {};
    const met: Record<string, number> = {};
    for (const entry of activeAwards(log)) {
      if (entry.award.part !== "base") continue;
      earned[entry.award.typeKey] = (earned[entry.award.typeKey] ?? 0) + entry.award.points;
      if (entry.award.basis !== "skip") met[entry.award.typeKey] = (met[entry.award.typeKey] ?? 0) + 1;
    }
    return { earned, met };
  }

  async function reviewUsedThisMonth(reader: Pick<PlanV2Transaction, "goalPlans" | "log">): Promise<number> {
    const month = tokyoUsageMonth(nowDate());
    let used = 0;
    for (const plan of await reader.goalPlans()) used += (await reader.log(plan.id)).filter((entry) => entry.event === "review_used" && entry.payload.month === month).length;
    return used;
  }

  async function reviewView(reader: Pick<PlanV2Transaction, "plan" | "goalPlans" | "log" | "flowReceipt">, draft: PlanDraftRow, context: PlanFlowRequestContext): Promise<PlanReviewView> {
    const plan = await reader.plan(draft.planId ?? "");
    const used = await reviewUsedThisMonth(reader);
    const marks = plan ? await reader.flowReceipt(`review-mark:${plan.id}:${tokyoUsageMonth(nowDate())}:${tokyoDayStart(nowDate()).slice(0, 10)}`) : null;
    const log = plan ? await reader.log(plan.id) : [];
    // 「確定以来」按计划创建的时刻比（startsOn 是东京日期，不能和 UTC 时间戳按字符串比）。
    const since = (entry: { createdAt: string }) => !plan || Date.parse(entry.createdAt) >= Date.parse(plan.createdAt);
    const awards = activeAwards(log).filter(since);
    const base = draftView(draft, null, context);
    return {
      draft: { ...base, goal: plan?.goalText ?? "", goalKind: plan?.goalKind ?? "unknown", purposeText: plan?.purposeText ?? null, turns: base.turns.map(({ base: _base, revised: _revised, ...turn }: StoredTurn) => turn) },
      premiseMarks: ((marks?.response as { marks?: PlanReviewView["premiseMarks"] } | undefined)?.marks ?? []),
      resetsAt: nextTokyoMonthStart(nowDate()),
      reviewLeftThisMonth: Math.max(0, PLAN_REVIEW_MONTHLY_LIMIT - used),
      reviewMonthlyLimit: PLAN_REVIEW_MONTHLY_LIMIT,
      sinceConfirmed: {
        events: awards.filter((entry) => entry.award.basis === "event").length,
        stepsCompleted: log.filter((entry) => entry.event === "step_completed").length,
        talked: awards.filter((entry) => entry.award.basis === "talked" || entry.award.basis === "self_report" || entry.award.basis === "memo").length,
      },
    };
  }

  /** 按 ✓ / ✕ 从这一轮的基线重新组装方案；配点合计不是 100 时从配点高的类型按 5 点回流（不低于已得、跳过的不动）。 */
  function applyAccepted(turn: StoredTurn, earned: Record<string, number>, skipped: ReadonlySet<string>): PlanDraftContent {
    const base = structuredClone(turn.base!);
    const revised = turn.revised!;
    const accepted = (path: string) => turn.changes.some((change) => change.path === path && change.accepted !== false);
    if (accepted("diagnosis")) base.diagnosis = revised.diagnosis;
    if (accepted("conclusion")) base.conclusion = revised.conclusion;
    if (accepted("citations")) base.citations = [...revised.citations];
    if (accepted("event")) base.event = { ...revised.event };
    const steps = Math.max(base.steps.length, revised.steps.length);
    const nextSteps: Array<PlanDraftContent["steps"][number]> = [];
    for (let index = 0; index < steps; index += 1) {
      const before = base.steps[index];
      const after = revised.steps[index];
      const touched = turn.changes.filter((change) => change.path.startsWith(`steps.${index}.`));
      const take = touched.length > 0 && touched.every((change) => change.accepted !== false);
      if (take) {
        if (after) nextSteps.push({ ...after });
      } else if (before) nextSteps.push({ ...before });
    }
    base.steps = nextSteps;
    base.personTypes = base.personTypes.map((type) => {
      const after = revised.personTypes.find((item) => item.slot === type.slot);
      if (!after) return type;
      return {
        ...type,
        ...(accepted(`personTypes.${type.slot}`) ? { allocation: after.allocation, targetCount: after.targetCount } : {}),
        ...(accepted(`personTypes.${type.slot}.roleSituation`) ? { roleSituation: after.roleSituation } : {}),
        ...(accepted(`personTypes.${type.slot}.why`) ? { why: after.why } : {}),
      };
    });
    let diff = 100 - base.personTypes.reduce((sum, type) => sum + type.allocation, 0) - base.event.allocation;
    while (diff !== 0) {
      const step = diff > 0 ? 5 : -5;
      const candidates = base.personTypes.filter((type) => !skipped.has(type.slot) && (step > 0 || type.allocation - 5 >= Math.max(5, earned[type.key] ?? earned[type.slot] ?? 0))).sort((a, b) => b.allocation - a.allocation);
      const target = candidates[0];
      if (!target) break;
      target.allocation += step;
      diff -= step;
    }
    return base;
  }

  async function confirmReviewDraft(draftId: string, context: PlanFlowRequestContext): Promise<PlanConfirmResult> {
    return repository.transact(scope, async (tx) => {
      const draft = await requireDraft(tx, draftId);
      if (draft.kind !== "review" || !draft.planId) throw new PlanFlowError("DRAFT_CLOSED", "This draft is closed.");
      if (draft.status === "confirmed") return { archivedV1PlanId: null, href: planTaskSegmentHref(context.platform, draft.planId), planId: draft.planId, replayed: true };
      if (draft.status !== "open") throw new PlanFlowError("DRAFT_CLOSED", "This draft is closed.");
      const plan = await requirePlan(tx, draft.planId);
      if (plan.revision !== draft.baseRevision) throw new PlanFlowError("STALE", "This plan was changed on another device.");
      const types = await tx.typeItems(plan.id);
      const { earned, met } = earnedOf(await tx.log(plan.id));
      const content = draft.content;
      const byKey = new Map(types.map((type) => [type.personType.key, type]));
      const keys = new Set(content.personTypes.map((type) => type.key));
      // 确定那一刻的已得分重新校验（DESIGN §3.2 第 9 条）。
      for (const type of content.personTypes) {
        const current = byKey.get(type.key);
        if (type.allocation < (earned[type.key] ?? 0)) throw new PlanFlowError("INVALID_INPUT", `${type.shortLabel}: points cannot go below what was already earned.`);
        if (type.targetCount < (met[type.key] ?? 0)) throw new PlanFlowError("INVALID_INPUT", `${type.shortLabel}: the target cannot go below the people already counted.`);
        if (current?.skippedAt && current.allocation !== type.allocation) throw new PlanFlowError("INVALID_INPUT", `${type.shortLabel}: a skipped type keeps its points.`);
        if (type.allocation < 5) throw new PlanFlowError("INVALID_INPUT", "Each person type needs at least 5 points.");
      }
      for (const type of types) {
        if (!keys.has(type.personType.key) && ((earned[type.personType.key] ?? 0) > 0 || type.skippedAt)) throw new PlanFlowError("INVALID_INPUT", `${type.shortLabel} already has points and cannot be removed.`);
      }
      const allocation = validateAllocations(allocationSlotsOf(plan.goalKind, content));
      if (allocation.ok === false) throw new PlanFlowError("INVALID_INPUT", `The allocation is not valid (${allocation.error}).`);
      const at = now();
      const before = planContentOf(plan, types);
      const manualOnly = draft.premiseVersion === MANUAL_ONLY;
      const next: PlanV2Row = {
        ...plan,
        analysis: { ...plan.analysis, allocationReasons: [...content.allocationReasons], basis: [...content.basis], citations: [...content.citations], conclusion: content.conclusion, diagnosis: content.diagnosis, ...(content.flow ? { flow: [...content.flow] } : {}) },
        eventAllocation: content.event.allocation,
        eventTargetCount: content.event.targetCount,
        // 每次見直し确定后重新给 1 次手动编辑；这次用过手动编辑（或本来就是手动编辑）就是 0。
        manualEditAvailable: manualOnly ? false : !draft.manualEditUsed,
        premise: [...draft.premise],
        revision: plan.revision + 1,
        steps: content.steps.map((step) => ({ doneCriteria: step.doneCriteria, key: step.key, personTypeKeys: [...step.personTypeKeys], title: step.title, why: step.why })),
        updatedAt: at,
      };
      await tx.updatePlan(next);
      let sortKey = Math.max(0, ...types.map((type) => type.sortKey));
      for (const type of content.personTypes) {
        const current = byKey.get(type.key);
        const meta = { countRule: type.countRule, emoji: type.emoji, introRoutes: [...type.introRoutes], key: type.key, opener: type.opener ?? null, persona: type.persona ?? null, questions: [...type.questions], recognizeHints: [...type.recognizeHints], shortLabelId: type.shortLabelId, why: type.why };
        if (current) {
          await tx.updateTypeItem({ ...current, allocation: type.allocation, personType: meta, roleSituation: type.roleSituation, shortLabel: type.shortLabel, targetCount: type.targetCount, updatedAt: at });
        } else {
          await tx.insertTypeItems([{ allocation: type.allocation, contactLinks: [], createdAt: at, id: `pitem_${newId()}`, personType: meta, planId: plan.id, primaryIndustryId: type.primaryIndustryId ?? null, roleSituation: type.roleSituation, secondaryIndustryId: type.secondaryIndustryId ?? null, shortLabel: type.shortLabel, skippedAt: null, slot: type.slot, sortKey: (sortKey += 1), targetCount: type.targetCount, updatedAt: at }]);
        }
      }
      for (const type of types) if (!keys.has(type.personType.key)) await tx.deleteTypeItem(type.id);
      const changes = diffContent(before, content, context.language);
      await tx.insertRevision({ after: content as unknown as Record<string, unknown>, before: before as unknown as Record<string, unknown>, changes, createdAt: at, draftId: draft.id, fromRevision: plan.revision, id: `prev_${newId()}`, planId: plan.id, source: manualOnly ? "manual_edit" : "review", toRevision: plan.revision + 1 });
      await tx.updateDraft({ ...draft, confirmedAt: at, status: "confirmed", updatedAt: at });
      return { archivedV1PlanId: null, href: planTaskSegmentHref(context.platform, plan.id), planId: plan.id, replayed: false };
    });
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
        // 同一个连接上顺序查询（复核 m8：pg 不允许同一 client 并发查询）。
        const intakes = await reader.openIntakes();
        const left = await newGoalsLeft(reader);
        const active = await reader.activePlans();
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
        intake = await applyAfterAi(intake.id, intake.updatedAt, (current) => runBackground(current, 1, context), { body: { intakeId: intake.id, step: "background" }, key: `${request.idempotencyKey}:background`, kind: "intake_background" });
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
      const replay = await repository.read(scope, async (reader) => ({ intake: await requireIntake(reader, intakeId), prior: await replayed<{ intakeId: string }>(reader, idempotencyKey, "intake_background", { intakeId, step: "background" }) }));
      if (replay.prior) return repository.read(scope, (reader) => intakeView(reader, replay.intake, context));
      const intake = replay.intake;
      const step = intake.aiSteps.background;
      const blocksConfirmed = Boolean(intake.background.me?.confirmedAt || intake.background.team?.confirmedAt || intake.background.purpose?.confirmedAt);
      const retriable = (intake.status === "drafting" || intake.status === "background") && step.state !== "done" && !blocksConfirmed;
      let next = intake;
      if (retriable) {
        const attempt = step.attempts + 1;
        next = await applyAfterAi(intakeId, intake.updatedAt, (current) => runBackground(current, attempt, context), { body: { intakeId, step: "background" }, key: idempotencyKey, kind: "intake_background" });
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
          // 账本键带本 intake 第几次推定（同一组人移除后再加也会重新推定，不会撞上早已成功的旧键；复核 M2）。
          const attempt = membersStep.attempts + 1;
          const outcome = await ai.members({ capabilities, contacts: input, goalKind: before.goalKind }, { actorId: scope.actorId, language: context.language, ledgerKey: `intake:${intakeId}:members:${attempt}:${sha(ids).slice(0, 16)}`, now: nowDate() });
          const inferred = new Map(outcome.ok === true ? outcome.value.members.map((member) => [member.alias, member]) : []);
          membersStep = outcome.ok === false && outcome.reason === "busy" ? membersStep : { ...outcomeStep(membersStep, outcome, now(), true), attempts: attempt };
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
        // 复核 M4：先在事务里占位写成员（校验状态、人数、回执），再建联系人，最后回填 contactId——
        // 请求失败不留孤儿联系人，同键并发只建一张。
        added = [{
          basis: null,
          capabilities: request.capabilities.filter((id) => capabilities.includes(id)),
          contactId: null,
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
      if (request.mode === "manual" && request.alsoAddToNetwork && added[0] && intake.background.team?.value.members.some((member) => member.memberId === added[0]!.memberId)) {
        const memberId = added[0].memberId;
        const contactId = await source.addContact(scope.actorId, { name: request.name.trim(), relationLabel: added[0].headline ?? "" });
        if (contactId) {
          const filled = await repository.transact(scope, async (tx) => {
            const current = await requireIntake(tx, intakeId);
            const team = current.background.team;
            if (!team || !team.value.members.some((member) => member.memberId === memberId)) return current;
            const next: PlanIntakeRow = { ...current, background: { ...current.background, team: { ...team, value: { ...team.value, members: team.value.members.map((member) => (member.memberId === memberId ? { ...member, contactId, source: "network" as const } : member)) } } }, updatedAt: now() };
            await tx.updateIntake(next);
            return next;
          });
          return repository.read(scope, (reader) => intakeView(reader, filled, context));
        }
      }
      return repository.read(scope, (reader) => intakeView(reader, intake, context));
    },

    async recomputeLadder(intakeId, request, context) {
      const wants = request.wants.trim();
      const replay = await repository.read(scope, async (reader) => ({ intake: await requireIntake(reader, intakeId), prior: await replayed<{ intakeId: string }>(reader, request.idempotencyKey, "intake_ladder", { wants }) }));
      if (replay.prior) return repository.read(scope, (reader) => intakeView(reader, replay.intake, context));
      const before = replay.intake;
      if (before.status !== "background") throw new PlanFlowError("BACKGROUND_LOCKED", "The background can only be changed before the questions.");
      const me = before.background.me;
      if (!me || !before.background.purpose) throw new PlanFlowError("BLOCK_ORDER", "The background draft is not ready.");
      if (me.value.wants === wants) return repository.read(scope, (reader) => intakeView(reader, before, context));
      if (before.aiSteps.ladderCount >= PLAN_LADDER_LIMIT) throw new PlanFlowError("LADDER_LIMIT", "The purpose ladder can be rebuilt at most 3 times.");
      const team = before.background.team?.value;
      const attempt = before.aiSteps.ladder.attempts + 1;
      const outcome = await ai.ladder(
        { goalText: before.goalText, team: `${team?.mode ?? "solo"} ${(team?.members ?? []).length}`, wants },
        { actorId: scope.actorId, language: context.language, ledgerKey: `intake:${intakeId}:ladder:${attempt}`, now: nowDate() },
      );
      // 同键操作正在进行：不写回，读当前状态（复核 M2）。
      if (outcome.ok === false && outcome.reason === "busy") return repository.read(scope, async (reader) => intakeView(reader, await requireIntake(reader, intakeId), context));
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
          aiSteps: { ...current.aiSteps, ladder: { ...outcomeStep(current.aiSteps.ladder, outcome, at, true), attempts: attempt }, ladderCount: current.aiSteps.ladderCount + (outcome.ok === true ? 1 : 0) },
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
      // 缓存键用与界面语言无关的摘要（能力用 id；复核 m5）。
      const cacheKey = backgroundCacheKey(before.goalKind, backgroundSummary(before, "en").text.replace(/^gaps: .*$/m, `gaps: ${summary.gaps.join(",")}`));
      const cached = await repository.read(scope, (reader) => reader.flowReceipt(cacheKey));
      let chosen = cached?.kind === "questions_cache" ? (cached.response as unknown as { items: PlanIntakeRow["questions"] }).items : null;
      let step = before.aiSteps.questions;
      if (!chosen) {
        const bank = questionBank(before.goalKind, context.language);
        const attempt = step.attempts + 1;
        const outcome = await ai.questions({ background: summary.text, bank, gaps: summary.gaps, goalKind: before.goalKind }, { actorId: scope.actorId, language: context.language, ledgerKey: `${cacheKey}:${intakeId}:${attempt}`, now: nowDate() });
        // 同键操作正在进行（双击「質問へ」）：不写回，让界面稍后重读（复核 M2）。
        if (outcome.ok === false && outcome.reason === "busy") throw new PlanFlowError("AI_BUSY", "This step is already running.");
        step = { ...outcomeStep(step, outcome, now(), true), attempts: attempt };
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
      const early = await repository.read(scope, async (reader) => {
        const intake = await requireIntake(reader, intakeId);
        const receipt = await reader.flowReceipt(idempotencyKey);
        return { intake, receipt: receipt && receipt.kind === "draft_create" && receipt.intakeId === intakeId ? receipt.response : null };
      });
      throwIfFailedReceipt(early.receipt);
      const before = early.intake;
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
          const failure = outcome as Extract<PlanAiOutcome<unknown>, { ok: false }>;
          if (failure.reason !== "busy") {
            await tx.updateIntake({ ...current, aiSteps: { ...current.aiSteps, draft: { ...outcomeStep(current.aiSteps.draft, outcome, at, false), attempts: attempt } }, updatedAt: at });
            await writeReceipt(tx, { body, intakeId, key: idempotencyKey, kind: "draft_create", response: failureResponse(failure) });
          }
          return { failure, intake: current };
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
      const prior = await repository.read(scope, (reader) => replayed<Record<string, unknown>>(reader, request.idempotencyKey, "draft_fix", body));
      throwIfFailedReceipt(prior);
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
          const failure = outcome as Extract<PlanAiOutcome<unknown>, { ok: false }>;
          if (failure.reason !== "busy") {
            await tx.updateDraft({ ...current, fix: { ...outcomeStep(current.fix, outcome, at, false), attempts: attempt }, updatedAt: at });
            await writeReceipt(tx, { body, draftId, key: request.idempotencyKey, kind: "draft_fix", response: failureResponse(failure) });
          }
          return { failure };
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
        // R25：見直し草稿（含只手动编辑的）也走这里，目标类型取计划本身。
        const reviewPlan = current.kind === "review" && current.planId ? await requirePlan(tx, current.planId) : null;
        const goalKind = intake?.goalKind ?? reviewPlan?.goalKind;
        if (!goalKind) throw new PlanFlowError("DRAFT_CLOSED", "This draft is closed.");
        if (prior) return { draft: current, intake };
        if (current.status !== "open") throw new PlanFlowError("DRAFT_CLOSED", "This draft is closed.");
        if (current.manualEditUsed) throw new PlanFlowError("MANUAL_EDIT_USED", "The plan can be edited by hand only once.");
        if (current.updatedAt !== request.expectedRevision) throw new PlanFlowError("STALE", "This draft was changed on another device.");
        const template = PLAN_GOAL_TEMPLATES[goalKind];
        const byKey = new Map(current.content.personTypes.map((type) => [type.key, type]));
        const personTypes: PlanDraftPersonType[] = request.personTypes.map((change) => {
          if (change.key) {
            const type = byKey.get(change.key);
            if (!type) throw new PlanFlowError("INVALID_INPUT", `Unknown person type ${change.key}.`);
            return { ...type, allocation: change.allocation, targetCount: change.targetCount };
          }
          const slot = template.slots.find((item) => item.slot === change.slot && item.slot !== PLAN_EVENT_SLOT);
          if (!slot || current.content.personTypes.some((type) => type.slot === slot.slot)) throw new PlanFlowError("INVALID_INPUT", "A new person type must be an unused template slot.");
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
        const slots: PlanAllocationSlot[] = allocationSlotsOf(goalKind, content);
        const allocation = validateAllocations(slots);
        if (allocation.ok === false) throw new PlanFlowError("INVALID_INPUT", `The allocation is not valid (${allocation.error}).`);
        // 复核 m1：人物类型至少 5 点；要去掉就移除这个类型。
        if (personTypes.some((type) => type.allocation < 5)) throw new PlanFlowError("INVALID_INPUT", "Each person type needs at least 5 points; remove the type instead.");
        const at = now();
        const changes = diffContent(current.content, content, context.language);
        const next: PlanDraftRow = { ...current, content, manualEditUsed: true, turns: current.turns, updatedAt: at };
        await tx.updateDraft(next);
        await writeReceipt(tx, { body, draftId, key: request.idempotencyKey, kind: "draft_manual_edit", response: { changes: changes.length, draftId } });
        return { draft: next, intake };
      });
      if (saved.draft.kind === "review") return confirmReviewDraft(saved.draft.id, context);
      if (!saved.intake) throw new PlanFlowError("DRAFT_CLOSED", "This draft is closed.");
      return confirmDraft(saved.draft, saved.intake, true, context);
    },

    async startReview(planId, idempotencyKey, context) {
      const today = tokyoDayStart(nowDate()).slice(0, 10);
      const markKey = `review-mark:${planId}:${tokyoUsageMonth(nowDate())}:${today}`;
      // 先建（或续上）草稿：打开不扣次数。
      const draft = await repository.transact(scope, async (tx) => {
        const plan = await requirePlan(tx, planId);
        const prior = await tx.flowReceipt(idempotencyKey);
        if (prior?.kind === "review_start" && typeof prior.response.draftId === "string") return requireDraft(tx, prior.response.draftId);
        const open = (await tx.openReviewDraft(plan.id));
        if (open && open.baseRevision === plan.revision && open.premiseVersion !== MANUAL_ONLY) {
          await writeReceipt(tx, { body: { planId }, draftId: open.id, key: idempotencyKey, kind: "review_start", planId: plan.id, response: { draftId: open.id } });
          return open;
        }
        const at = now();
        if (open) await tx.updateDraft({ ...open, status: "discarded", updatedAt: at });
        const content = planContentOf(plan, await tx.typeItems(plan.id));
        const created: PlanDraftRow = { aiFixUsed: 0, baseRevision: plan.revision, confirmedAt: null, content, createdAt: at, fix: emptyStep(), id: `draft_${newId()}`, intakeId: null, kind: "review", manualEditUsed: false, originContent: content, planId: plan.id, premise: [...plan.premise], premiseVersion: 0, status: "open", turns: [], updatedAt: at };
        await tx.insertDraft(created);
        await writeReceipt(tx, { body: { planId }, draftId: created.id, key: idempotencyKey, kind: "review_start", planId: plan.id, response: { draftId: created.id } });
        return created;
      });
      // C8：每份计划每东京日最多一次，结果当天缓存；失败也缓存为空（不扣见直）。
      const cached = await repository.read(scope, (reader) => reader.flowReceipt(markKey));
      if (!cached) {
        const plan = await repository.read(scope, (reader) => requirePlan(reader, planId));
        const log = await repository.read(scope, (reader) => reader.log(plan.id));
        const records = log.filter((entry) => Date.parse(entry.createdAt) >= Date.parse(plan.createdAt) && (entry.event === "score_awarded" || entry.event === "step_completed")).slice(-30).map((entry) => ({
          at: entry.createdAt,
          id: entry.id,
          kind: entry.event === "step_completed" ? ("step" as const) : (entry.payload as { basis?: string }).basis === "event" ? ("event" as const) : ("talked" as const),
          text: entry.body.slice(0, 120),
        }));
        const outcome = records.length > 0 ? await ai.reviewMarks({ goalKind: plan.goalKind, premise: plan.premise, records }, { actorId: scope.actorId, language: context.language, ledgerKey: markKey, now: nowDate() }) : null;
        if (!(outcome && outcome.ok === false && outcome.reason === "busy")) {
          await repository.transact(scope, async (tx) => {
            if (await tx.flowReceipt(markKey)) return;
            await writeReceipt(tx, { body: { planId, today }, key: markKey, kind: "review_marks", planId, response: { marks: outcome?.ok === true ? outcome.value.marks : [] } });
          }).catch(() => undefined);
        }
      }
      return repository.read(scope, (reader) => reviewView(reader, draft, context));
    },

    async getReview(draftId, context) {
      return repository.read(scope, async (reader) => {
        const draft = await reader.draft(draftId);
        if (!draft || draft.kind !== "review") return null;
        return reviewView(reader, draft, context);
      });
    },

    async currentReview(planId, context) {
      return repository.read(scope, async (reader) => {
        const draft = await reader.openReviewDraft(planId);
        return draft ? reviewView(reader, draft, context) : null;
      });
    },

    async reviewFix(draftId, request, context) {
      const body = { premise: request.premise, text: request.text };
      const early = await repository.read(scope, async (reader) => ({ draft: await requireDraft(reader, draftId), prior: await replayed<Record<string, unknown>>(reader, request.idempotencyKey, "review_fix", body) }));
      throwIfFailedReceipt(early.prior);
      if (early.prior) return repository.read(scope, (reader) => reviewView(reader, early.draft, context));
      const draft = early.draft;
      if (draft.kind !== "review" || draft.status !== "open" || !draft.planId || draft.premiseVersion === MANUAL_ONLY) throw new PlanFlowError("DRAFT_CLOSED", "This draft is closed.");
      const plan = await repository.read(scope, (reader) => requirePlan(reader, draft.planId!));
      const used = await repository.read(scope, (reader) => reviewUsedThisMonth(reader));
      if (used >= PLAN_REVIEW_MONTHLY_LIMIT) throw new PlanFlowError("REVIEW_LIMIT", "All reviews for this month have been used.", { limit: "monthly", retryOn: nextTokyoMonthStart(nowDate()) });
      const premise = draft.premise.map((row) => {
        const edit = request.premise.find((item) => item.key === row.key);
        return edit ? { ...row, guessed: false, value: edit.value } : row;
      });
      if (request.premise.some((edit) => !draft.premise.some((row) => row.key === edit.key))) throw new PlanFlowError("INVALID_INPUT", "Unknown premise row.");
      const { earned } = earnedOf(await repository.read(scope, (reader) => reader.log(plan.id)));
      const skippedSlots = (await repository.read(scope, (reader) => reader.typeItems(plan.id))).filter((type) => type.skippedAt).map((type) => type.slot);
      const n = draft.turns.length + 1;
      const attempt = draft.fix.state === "failed" ? draft.fix.attempts + 1 : 1;
      const ledgerKey = attempt > 1 ? `review:${draftId}:${n}#${attempt}` : `review:${draftId}:${n}`;
      const slots = slotInfos(plan.goalKind, [], context.language);
      const landscape = publishedEntriesFor({ goalKind: plan.goalKind, industries: [], now: nowDate() }).map((entry) => ({ id: entry.id, summary: entry.summary[context.language], title: entry.title[context.language], version: entry.version }));
      const contacts = aliasContacts((await source.draftContacts(scope.actorId, plan.goalText, nowDate())).slice(0, 200));
      const aliasesById = new Map([...contacts.aliases.entries()].map(([alias, contact]) => [contact.id, alias]));
      const premiseNote = request.premise.map((edit) => `${premise.find((row) => row.key === edit.key)?.label ?? edit.key}：${edit.value}`).join(" / ");
      const outcome = await ai.reviewFix({
        contacts: contacts.input,
        current: toDraftOutput(draft.content, aliasesById),
        earned: Object.fromEntries(Object.entries(earned).map(([key, points]) => [draft.content.personTypes.find((type) => type.key === key)?.slot ?? key, points])),
        goalKind: plan.goalKind,
        landscape,
        premise,
        previousTurns: draft.turns.map((turn) => turn.input),
        request: [premiseNote, request.text ?? ""].filter(Boolean).join("\n"),
        skippedSlots,
        slots,
      }, { actorId: scope.actorId, language: context.language, ledgerKey, now: nowDate() });
      const result = await repository.transact(scope, async (tx) => {
        const again = await replayed<Record<string, unknown>>(tx, request.idempotencyKey, "review_fix", body);
        const current = await requireDraft(tx, draftId);
        if (again) return { draft: current };
        if (current.turns.length !== draft.turns.length || current.status !== "open") throw new PlanFlowError("STALE", "The draft changed while the revision was being written.");
        const at = now();
        if (outcome.ok === false) {
          const failure = outcome as Extract<PlanAiOutcome<unknown>, { ok: false }>;
          if (failure.reason !== "busy") {
            // 失败不扣见直（DESIGN §2.8）。
            await tx.updateDraft({ ...current, fix: { ...outcomeStep(current.fix, outcome, at, false), attempts: attempt }, updatedAt: at });
            await writeReceipt(tx, { body, draftId, key: request.idempotencyKey, kind: "review_fix", response: failureResponse(failure) });
          }
          return { failure };
        }
        const usedNow = await reviewUsedThisMonth(tx);
        if (usedNow >= PLAN_REVIEW_MONTHLY_LIMIT) throw new PlanFlowError("REVIEW_LIMIT", "All reviews for this month have been used.", { limit: "monthly", retryOn: nextTokyoMonthStart(nowDate()) });
        const keys = current.content.steps.map((step) => step.key);
        const revised = toDraftContent(outcome.value.revised, plan.goalKind, contacts.aliases, context.language, premise, keys);
        // 保留原方案里人物类型的 key（确定时按 key 对应已有条目）。
        revised.personTypes = revised.personTypes.map((type) => {
          const original = current.content.personTypes.find((item) => item.slot === type.slot);
          return original ? { ...type, itemId: original.key, key: original.key, primaryIndustryId: original.primaryIndustryId ?? type.primaryIndustryId, secondaryIndustryId: original.secondaryIndustryId ?? null } : type;
        });
        revised.steps = revised.steps.map((step) => ({ ...step, personTypeKeys: step.personTypeKeys.map((key) => current.content.personTypes.find((type) => type.slot === key)?.key ?? key) }));
        const reasons = new Map(outcome.value.reasons.map((reason) => [reason.path, reason.reason]));
        const changes = diffContent(current.content, revised, context.language, reasons).map((change, index) => ({ ...change, accepted: true, id: `t${n}-${index + 1}` }));
        const turn: StoredTurn = {
          at,
          base: current.content,
          changes,
          input: [premiseNote, request.text ?? ""].filter(Boolean).join("\n"),
          n,
          noChangeReason: changes.length === 0 ? outcome.value.noChangeReason ?? tri(context.language, { en: "Nothing needed to change.", ja: "今回は変更しません。", zh: "这次不做修改。" }) : null,
          revised,
          unchanged: outcome.value.unchanged,
        };
        const month = tokyoUsageMonth(nowDate());
        // 不改也计 1 次；月计数由唯一键兜底（并发两次发送只扣到上限）。
        await tx.insertLog({ author: "system", body: `review ${month} #${usedNow + 1}`, createdAt: at, event: "review_used", id: `plog_${newId()}`, idempotencyKey: `review:${month}:${usedNow + 1}`, itemId: null, linkedContactIds: [], linkedEventId: null, payload: { draftId, month }, planId: plan.id });
        const next: PlanDraftRow = { ...current, content: changes.length ? revised : current.content, fix: { ...outcomeStep(current.fix, outcome, at, false), attempts: 0 }, premise, turns: [...current.turns, turn], updatedAt: at };
        await tx.updateDraft(next);
        await writeReceipt(tx, { body, draftId, key: request.idempotencyKey, kind: "review_fix", response: { draftId } });
        return { draft: next };
      });
      if ("failure" in result && result.failure) throw aiError(result.failure as Extract<PlanAiOutcome<unknown>, { ok: false }>);
      return repository.read(scope, (reader) => reviewView(reader, (result as { draft: PlanDraftRow }).draft, context));
    },

    async toggleChange(draftId, changeId, request, context) {
      const draft = await repository.transact(scope, async (tx) => {
        const current = await requireDraft(tx, draftId);
        if (current.kind !== "review" || current.status !== "open" || !current.planId) throw new PlanFlowError("DRAFT_CLOSED", "This draft is closed.");
        const turns = [...current.turns] as StoredTurn[];
        const last = turns[turns.length - 1];
        if (!last || !last.base || !last.revised || !last.changes.some((change) => change.id === changeId)) throw new PlanFlowError("INVALID_INPUT", "Only the latest proposal can be toggled.");
        const updatedTurn: StoredTurn = { ...last, changes: last.changes.map((change) => (change.id === changeId ? { ...change, accepted: request.accepted } : change)) };
        const { earned } = earnedOf(await tx.log(current.planId));
        const skipped = new Set((await tx.typeItems(current.planId)).filter((type) => type.skippedAt).map((type) => type.slot));
        const content = applyAccepted(updatedTurn, earned, skipped);
        const next: PlanDraftRow = { ...current, content, turns: [...turns.slice(0, -1), updatedTurn], updatedAt: now() };
        await tx.updateDraft(next);
        return next;
      });
      return repository.read(scope, (reader) => reviewView(reader, draft, context));
    },

    async quota() {
      return repository.read(scope, async (reader) => {
        const used = await reviewUsedThisMonth(reader);
        const active = await reader.activePlans();
        return { activeGoalLimit: PLAN_V2_GOAL_LIMIT, activeGoals: active.length, newGoalsLeftThisMonth: await newGoalsLeft(reader), resetsAt: nextTokyoMonthStart(nowDate()), reviewLeftThisMonth: Math.max(0, PLAN_REVIEW_MONTHLY_LIMIT - used), reviewMonthlyLimit: PLAN_REVIEW_MONTHLY_LIMIT };
      });
    },

    async openManualEdit(planId, idempotencyKey, context) {
      const draft = await repository.transact(scope, async (tx) => {
        const plan = await requirePlan(tx, planId);
        const prior = await tx.flowReceipt(idempotencyKey);
        if (prior?.kind === "manual_edit_open" && typeof prior.response.draftId === "string") return requireDraft(tx, prior.response.draftId);
        if (!plan.manualEditAvailable) throw new PlanFlowError("MANUAL_EDIT_USED", "The manual edit has been used.");
        const open = await tx.openReviewDraft(plan.id);
        const at = now();
        if (open) await tx.updateDraft({ ...open, status: "discarded", updatedAt: at });
        const content = planContentOf(plan, await tx.typeItems(plan.id));
        const created: PlanDraftRow = { aiFixUsed: 0, baseRevision: plan.revision, confirmedAt: null, content, createdAt: at, fix: emptyStep(), id: `draft_${newId()}`, intakeId: null, kind: "review", manualEditUsed: false, originContent: content, planId: plan.id, premise: [...plan.premise], premiseVersion: MANUAL_ONLY, status: "open", turns: [], updatedAt: at };
        await tx.insertDraft(created);
        await writeReceipt(tx, { body: { planId }, draftId: created.id, key: idempotencyKey, kind: "manual_edit_open", planId: plan.id, response: { draftId: created.id } });
        return created;
      });
      return (await repository.read(scope, (reader) => reviewView(reader, draft, context))).draft;
    },

    async achieve(planId, request) {
      return repository.transact(scope, async (tx) => {
        const prior = await tx.flowReceipt(request.idempotencyKey);
        if (prior?.kind === "achieve") return prior.response as { planId: string; achievedAt: string };
        const plan = await requirePlan(tx, planId);
        if (plan.revision !== request.expectedRevision) throw new PlanFlowError("STALE", "This plan was changed on another device.");
        const at = now();
        // 达成 = archived + achieved_at：分数定格、不占生效名额、候补任务停。
        await tx.updatePlan({ ...plan, achievedAt: at, archivedAt: at, status: "archived", updatedAt: at });
        await tx.insertLog({ author: "user", body: plan.goalText.slice(0, 2000), createdAt: at, event: "goal_achieved", id: `plog_${newId()}`, idempotencyKey: `achieved:${plan.id}`, itemId: null, linkedContactIds: [], linkedEventId: null, payload: {}, planId: plan.id });
        const open = await tx.openReviewDraft(plan.id);
        if (open) await tx.updateDraft({ ...open, status: "discarded", updatedAt: at });
        await writeReceipt(tx, { body: { planId }, key: request.idempotencyKey, kind: "achieve", planId: plan.id, response: { achievedAt: at, planId: plan.id } });
        return { achievedAt: at, planId: plan.id };
      });
    },

    async nextGoals(planId, context) {
      const key = `next-goal:${planId}`;
      const cached = await repository.read(scope, (reader) => reader.flowReceipt(key));
      if (cached?.kind === "next_goals") return cached.response as unknown as PlanNextGoalsResponse;
      const plan = await repository.read(scope, async (reader) => {
        const row = await reader.plan(planId);
        if (!row || !row.achievedAt) throw new PlanFlowError("PLAN_NOT_FOUND", "Plan not found.");
        return row;
      });
      const log = await repository.read(scope, (reader) => reader.log(plan.id));
      const records = activeAwards(log).slice(-20).map((entry) => ({ id: entry.id, text: entry.body.slice(0, 120) }));
      const outcome = await ai.nextGoals({ goalKind: plan.goalKind, goalText: plan.goalText, records, summary: `${plan.goalText} / ${plan.analysis.conclusion}` }, { actorId: scope.actorId, language: context.language, ledgerKey: key, now: nowDate() });
      if (outcome.ok === false && outcome.reason === "busy") throw new PlanFlowError("AI_BUSY", "This step is already running.");
      const result: PlanNextGoalsResponse = outcome.ok === true
        ? { candidates: outcome.value.candidates.map((candidate) => ({ basis: candidate.evidenceIds.map((id) => ({ kind: "record" as const, label: log.find((entry) => entry.id === id)?.body ?? id, ref: id })), goalKind: candidate.goalKind, goalText: candidate.goalText })), source: "ai" }
        : { candidates: [], source: "none" };
      await repository.transact(scope, async (tx) => {
        if (await tx.flowReceipt(key)) return;
        await writeReceipt(tx, { body: { planId }, key, kind: "next_goals", planId, response: result as unknown as Record<string, unknown> });
      }).catch(() => undefined);
      return result;
    },

    async editGoal(planId, request, context) {
      const result = await repository.transact(scope, async (tx) => {
        const prior = await tx.flowReceipt(request.idempotencyKey);
        if (prior?.kind === "goal_edit") return prior.response as unknown as PlanGoalEditResult;
        const plan = await requirePlan(tx, planId);
        if (plan.revision !== request.expectedRevision) throw new PlanFlowError("STALE", "This plan was changed on another device.");
        const at = now();
        const goalText = request.goalText?.trim() || plan.goalText;
        const goalKind = request.goalKind ?? plan.goalKind;
        // 只改目标字段，不动配点（save_only）；save_and_rebuild 再开一份见直草稿，前提的目的行换成新目标。
        const next: PlanV2Row = { ...plan, goalKind, goalText, revision: plan.revision + 1, updatedAt: at };
        await tx.updatePlan(next);
        await tx.insertRevision({ after: { goalKind, goalText }, before: { goalKind: plan.goalKind, goalText: plan.goalText }, changes: [], createdAt: at, draftId: null, fromRevision: plan.revision, id: `prev_${newId()}`, planId: plan.id, source: "goal_edit", toRevision: plan.revision + 1 });
        let reviewDraftId: string | null = null;
        if (request.mode === "save_and_rebuild") {
          const open = await tx.openReviewDraft(plan.id);
          if (open) await tx.updateDraft({ ...open, status: "discarded", updatedAt: at });
          const content = planContentOf(next, await tx.typeItems(plan.id));
          const premise = next.premise.map((row) => (row.key === "purpose" ? { ...row, guessed: false, value: goalText } : row));
          const created: PlanDraftRow = { aiFixUsed: 0, baseRevision: next.revision, confirmedAt: null, content, createdAt: at, fix: emptyStep(), id: `draft_${newId()}`, intakeId: null, kind: "review", manualEditUsed: false, originContent: content, planId: plan.id, premise, premiseVersion: 0, status: "open", turns: [], updatedAt: at };
          await tx.insertDraft(created);
          reviewDraftId = created.id;
        }
        const response: PlanGoalEditResult = { planId: plan.id, reviewDraftId, revision: next.revision };
        await writeReceipt(tx, { body: { goalKind: request.goalKind ?? null, goalText: request.goalText ?? null, mode: request.mode }, key: request.idempotencyKey, kind: "goal_edit", planId: plan.id, response: response as unknown as Record<string, unknown> });
        return response;
      });
      void context;
      return result;
    },

    async confirm(draftId, idempotencyKey, context) {
      const { draft, intake } = await repository.read(scope, async (reader) => {
        const current = await requireDraft(reader, draftId);
        const owner = current.intakeId ? await requireIntake(reader, current.intakeId) : null;
        return { draft: current, intake: owner };
      });
      if (draft.kind === "review") return confirmReviewDraft(draftId, context);
      if (!intake || draft.kind !== "initial") throw new PlanFlowError("DRAFT_CLOSED", "This draft is closed.");
      if (draft.status === "discarded") throw new PlanFlowError("DRAFT_CLOSED", "This draft is closed.");
      void idempotencyKey; // 同一份草稿重复确定只建一份（creationKey = 草稿 id），幂等由 createPlanFromDraft 保证。
      return confirmDraft(draft, intake, draft.manualEditUsed, context);
    },
  };
}

export const PLAN_FLOW_MONTHLY_BACKGROUND_LIMIT = AI_QUOTA_MONTHLY_LIMITS.plan_background;
export { blankContent as emptyPlanDraftContent };
