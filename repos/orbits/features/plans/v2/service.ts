/**
 * R22 计划 v2.2 的服务（DESIGN §3、§4、§8）。
 *
 * - 读：目标列表、首页组件的当前目标、概要（`PlanV2Detail`）；
 * - 计分命令：有名字 / 无名字的「话过了」、撤销、跳过 / 撤回、Step 完成 / 撤回。这些不带 `expectedRevision`、
 *   不推进 `revision`，正确性靠幂等回执（`plan_flow_commands`）、`plan_log` 的唯一键和按人串行的事务；
 * - 给其他 Sprint：`createPlanFromDraft`（R23）、`addEventToPlan` / `recordEventAttendanceForPlans` /
 *   `planRemainingTargets`（R26）、`activeTypeNeeds`（R11 / 人脉分析，经 `active-needs.ts`）。
 *
 * 分数口径全部在 `shared/compute/plan-score.ts`（两端共用）；这里只负责把记录读出来、写进去。
 */
import { createHash, randomUUID } from "node:crypto";

import { validateAllocations, type PlanAllocationSlot } from "../../../shared/compute/plan-allocation";
import { nextAward, PLAN_EVENT_SEGMENT_KEY, skipAwardPoints, summarizePlanScore, type PlanScoreAward, type PlanScoreReversal, type PlanScoreSlot } from "../../../shared/compute/plan-score";
import { PLAN_GOAL_KINDS } from "../../../shared/compute/plan-templates";
import { AI_QUOTA_MONTHLY_LIMITS, tokyoUsageMonth } from "../../ai-quota/constants";
import type { PlanHrefPlatform } from "../../../shared/compute/plan-href";
import type { PlanCopyLanguage } from "../../../shared/compute/plan-template-copy";
import { candidatesFor, pendingItems, recommendScore, recentAwards, stepProgress, stepSuggestions, todayChance, typeDetail as buildTypeDetail, typeStats, type OverviewInput, type PlanEventFact } from "./overview";
import { introDraftText, proposalDraftText } from "./drafts";
import type {
  PlanAchievementView,
  PlanLegacyDetail,
  PlanLegacyListResponse,
  PlanAwardRequest,
  PlanAwardResult,
  PlanCommandResult,
  PlanGoalKind,
  PlanGoalListItem,
  PlanPremiseRow,
  PlanScoreView,
  PlanV2Content,
  PlanV2Detail,
  PlanV2HomeSummary,
  PlanV2PersonType,
  PlanV2SummaryResponse,
  PlanCandidateDecisionResult,
  PlanContactFit,
  PlanIntroDraftResult,
  PlanPendingDecisionResult,
  PlanPendingItem,
  PlanPersonTypeDetail,
  PlanProposalResult,
  PlanTalkedOfflineRequest,
  PlanTalkedOfflineResult,
} from "../../../shared/contract/plan-v2";
import type { IndustryIdCode, SecondaryIndustryIdCode } from "../../../shared/contract/industries";
import { AppError, type AppErrorCode } from "../../../shared/errors/app-error";
import type { PlanContactLink, PlanReferenceValidator } from "../contract";
import { needStatus } from "./repository";
import {
  PLAN_V2_GOAL_LIMIT,
  type PlanAwardPayload,
  type PlanV2EventItem,
  type PlanV2LogEntry,
  type PlanV2Reader,
  type PlanV2Repository,
  type PlanV2Row,
  type PlanV2Scope,
  type PlanV2ContactView,
  type PlanV2Transaction,
  type PlanV2TypeItem,
} from "./types";

/** 見直し的月上限（Q6：所有人按 Free）。月用量由 R25 记在 `review_used`；R22 只读出来给概要显示。 */
export const PLAN_REVIEW_MONTHLY_LIMIT = 3;

/** 見直し（C9）在 AI 账本里的月成本上限（`plan_review`，非 released 的操作；失败有 HTTP 响应也算）。不在这里改数字。 */
export const PLAN_REVIEW_AI_MONTHLY_LIMIT = AI_QUOTA_MONTHLY_LIMITS.plan_review ?? PLAN_REVIEW_MONTHLY_LIMIT;

/** R25 复核 M1：读 AI 账本里本月 `plan_review` 已占的次数（读不到时返回 null，只按用户次数显示）。 */
export type PlanReviewBudgetReader = (actorId: string, now: Date) => Promise<number | null>;

/** 账本（`AiUsageLedger.countMonthly`）→ 见直的成本读数；出错（如表未迁移）按读不到处理。 */
export function ledgerReviewBudget(ledger: { countMonthly(actorId: string, purpose: "plan_review", now: Date): Promise<number> }): PlanReviewBudgetReader {
  return async (actorId, now) => ledger.countMonthly(actorId, "plan_review", now).catch(() => null);
}

export type PlanReviewLimitReason = "monthly" | "ai_budget";

/**
 * R25 复核 M1：见直剩余次数 = min(用户看得到的次数剩余, 账本本月剩余)。用户次数只扣成功的送出；账本连失败也算，
 * 所以账本可能先用完——这时界面也显示 0，并给出原因 `ai_budget`（用户次数用完时为 `monthly`）。还有剩余时没有原因。
 */
export function planReviewQuota(used: number, ledgerUsed: number | null): { left: number; reason: PlanReviewLimitReason | null } {
  const userLeft = Math.max(0, PLAN_REVIEW_MONTHLY_LIMIT - used);
  const budgetLeft = ledgerUsed === null ? Number.POSITIVE_INFINITY : Math.max(0, PLAN_REVIEW_AI_MONTHLY_LIMIT - ledgerUsed);
  const left = Math.min(userLeft, budgetLeft);
  if (left > 0) return { left, reason: null };
  return { left: 0, reason: userLeft <= 0 ? "monthly" : "ai_budget" };
}

export const PLAN_V2_ERROR_REASONS = [
  "PLAN_NOT_FOUND",
  "ITEM_NOT_FOUND",
  "STEP_NOT_FOUND",
  "AWARD_NOT_FOUND",
  "PLAN_ACHIEVED",
  "PLAN_GOAL_LIMIT",
  "IDEMPOTENCY_KEY_REUSED",
  "INVALID_INPUT",
  "REFERENCE_NOT_FOUND",
  "TYPE_SKIPPED",
  "CANDIDATE_NOT_FOUND",
  "PENDING_NOT_FOUND",
  /** 复核 M1：这张待确认卡已经确认 / 不采用过（换了幂等键再决定）。同键重放返回原结果，不报这个错。 */
  "PENDING_DECIDED",
  /** 复核 M2：线下聊过「新しく登録」建联系人失败（不再静默改成匿名）；界面让用户选择重试或「名前なしで記録」。 */
  "CONTACT_CREATE_FAILED",
  /** 复核 M2：同一个幂等键的上一次请求还没结束（或中途断掉）：不再新建联系人。 */
  "REQUEST_IN_PROGRESS",
] as const;
export type PlanV2ErrorReason = (typeof PLAN_V2_ERROR_REASONS)[number];

const REASON_CODES: Record<PlanV2ErrorReason, AppErrorCode> = {
  AWARD_NOT_FOUND: "NOT_FOUND",
  IDEMPOTENCY_KEY_REUSED: "CONFLICT",
  INVALID_INPUT: "VALIDATION_ERROR",
  ITEM_NOT_FOUND: "NOT_FOUND",
  PLAN_ACHIEVED: "CONFLICT",
  PLAN_GOAL_LIMIT: "CONFLICT",
  PLAN_NOT_FOUND: "NOT_FOUND",
  REFERENCE_NOT_FOUND: "NOT_FOUND",
  STEP_NOT_FOUND: "NOT_FOUND",
  TYPE_SKIPPED: "CONFLICT",
  CANDIDATE_NOT_FOUND: "NOT_FOUND",
  PENDING_NOT_FOUND: "NOT_FOUND",
  PENDING_DECIDED: "CONFLICT",
  CONTACT_CREATE_FAILED: "SERVICE_UNAVAILABLE",
  REQUEST_IN_PROGRESS: "CONFLICT",
};

export class PlanV2Error extends AppError {
  readonly reason: PlanV2ErrorReason;
  constructor(reason: PlanV2ErrorReason, message: string) {
    super(REASON_CODES[reason], message);
    this.name = "PlanV2Error";
    this.reason = reason;
  }
}

/** R23 确定方案时交给 `createPlanFromDraft` 的内容（人物类型还没有条目 id）。 */
export interface CreatePlanFromDraftInput {
  /** 草稿 id：同一份草稿重复确定只建一份。 */
  creationKey: string;
  /** intake id：一个目标一份生效计划。 */
  goalId: string;
  goalText: string;
  goalKind: PlanGoalKind;
  purposeText?: string | null;
  purposeLevel?: number | null;
  premise: PlanPremiseRow[];
  content: Omit<PlanV2Content, "personTypes"> & {
    personTypes: Array<Omit<PlanV2PersonType, "itemId" | "skipped"> & { primaryIndustryId?: IndustryIdCode | null; secondaryIndustryId?: SecondaryIndustryIdCode | null }>;
  };
  /** 生成流程里没用过手动编辑 → 确定后仍有 1 次（DESIGN §9 #32）。 */
  manualEditAvailable: boolean;
}

export interface PlanRemainingTargets {
  planId: string;
  goalKind: PlanGoalKind;
  types: Array<{ itemId: string; key: string; slot: string; allocation: number; targetCount: number; remaining: number; skipped: boolean }>;
  event: { allocation: number; targetCount: number; remaining: number };
}

/** 一个生效计划里的人脉需求 / 人物类型（v1 与 v2 合并读时的公共形状）。 */
export interface ActiveTypeNeed {
  planId: string;
  itemId: string;
  title: string;
  description: string | null;
  primaryIndustryId: IndustryIdCode | null;
  secondaryIndustryId: SecondaryIndustryIdCode | null;
  targetCount: number;
  contactLinks: PlanContactLink[];
  skipped: boolean;
}

export interface PlanV2Service {
  summary(): Promise<PlanV2SummaryResponse>;
  listGoals(): Promise<PlanGoalListItem[]>;
  detail(planId: string): Promise<PlanV2Detail | null>;
  markOpened(planId: string): Promise<void>;
  award(input: { planId: string; itemId: string; request: PlanAwardRequest }): Promise<PlanAwardResult>;
  undo(input: { planId: string; logId: string; idempotencyKey: string }): Promise<PlanCommandResult>;
  skip(input: { planId: string; itemId: string; idempotencyKey: string }): Promise<PlanCommandResult>;
  unskip(input: { planId: string; itemId: string; idempotencyKey: string }): Promise<PlanCommandResult>;
  setStepCompleted(input: { planId: string; stepKey: string; completed: boolean; idempotencyKey: string }): Promise<PlanCommandResult>;
  createPlanFromDraft(input: CreatePlanFromDraftInput): Promise<{ plan: PlanV2Detail; created: boolean; archivedV1PlanId: string | null }>;
  addEventToPlan(input: { planId?: string | null; eventId: string; title?: string }): Promise<{ planId: string; itemId: string; created: boolean } | null>;
  /** `skipIfEverScored`（对账任务用）：这份计划为这场活动计过分（含已撤销）就不再记——用户撤销的不自动补回。 */
  recordEventAttendanceForPlans(input: { eventId: string; title?: string; at?: string; skipIfEverScored?: boolean }): Promise<Array<{ planId: string; points: number; part: string }>>;
  planRemainingTargets(): Promise<PlanRemainingTargets[]>;
  activeTypeNeeds(): Promise<ActiveTypeNeeds>;
  /** 本人有没有生效中的 v2 计划（v1 生成前的便宜检查）。 */
  hasActivePlan(): Promise<boolean>;
  /* ---------- R24 ---------- */
  /** 概要（带 R24 的可选字段：今日のチャンス、三格、Step 进度、最近加分、待确认）。 */
  overview(planId: string, view?: PlanViewOptions): Promise<PlanV2Detail | null>;
  /** R25：完成页（只有达成的计划）。 */
  achievement(planId: string, language: PlanCopyLanguage): Promise<PlanAchievementView | null>;
  /** R25：v1 计划只读。 */
  legacyList(): Promise<PlanLegacyListResponse>;
  legacyDetail(planId: string): Promise<PlanLegacyDetail | null>;
  typeDetail(planId: string, itemId: string, view?: PlanViewOptions): Promise<PlanPersonTypeDetail | null>;
  /** 人物类型详情里的 ✓ / ✕：只关联联系人，不生成「约 TA」行动。 */
  decideCandidate(input: { planId: string; itemId: string; contactId: string; decision: "accept" | "dismiss"; idempotencyKey: string }): Promise<PlanCandidateDecisionResult>;
  /** 旧候补接口（matching-service）的 v2 分流：按候补 id 决定。 */
  decideCandidateById(input: { candidateId: string; decision: "accept" | "dismiss" }): Promise<{ status: "accepted" | "dismissed"; replayed: boolean; planId: string; itemId: string } | null>;
  /** 手动关联（matching-service.linkManually 的 v2 分流）。 */
  linkTypeContact(input: { itemId: string; contactId: string }): Promise<{ planId: string; itemId: string } | null>;
  talkedOffline(input: { planId: string; itemId: string; request: PlanTalkedOfflineRequest }): Promise<PlanTalkedOfflineResult>;
  proposal(input: { planId: string; itemId: string; contactId: string; slots: readonly string[]; language: PlanCopyLanguage }): Promise<PlanProposalResult>;
  introDraft(input: { planId: string; itemId: string; viaContactId: string; language: PlanCopyLanguage }): Promise<PlanIntroDraftResult>;
  pending(view?: PlanViewOptions): Promise<PlanPendingItem[]>;
  decidePending(input: { id: string; decision: "accept" | "dismiss"; answered?: readonly number[]; idempotencyKey: string }): Promise<PlanPendingDecisionResult>;
  contactFit(contactId: string): Promise<PlanContactFit>;
  /** C11：面谈メモ判定的结果 → ≥2 问出计分提议（确认卡）；AI 不可用时出手动勾选卡。 */
  proposeMemoCoverage(input: { contactId: string; memoId: string; coverage: ReadonlyArray<{ itemId: string; answered: readonly number[] }>; manual?: boolean }): Promise<number>;
}

export interface PlanViewOptions {
  language?: PlanCopyLanguage;
  platform?: PlanHrefPlatform;
}

/** 生效中的 v2 计划（概要）与它们的人物类型（人脉分析、覆盖度、联系人计划说明合并读取用）。 */
export interface ActiveTypeNeeds {
  plans: Array<{ planId: string; goalText: string; startsOn: string; createdAt: string; updatedAt: string }>;
  needs: ActiveTypeNeed[];
}

export interface PlanV2ServiceOptions {
  repository: PlanV2Repository;
  scope: PlanV2Scope;
  references?: PlanReferenceValidator;
  now?: () => Date;
  newId?: () => string;
  /** mock 模式（演示世界）：响应带 `sample: true`。 */
  sample?: boolean;
  /** R24：会える活動的事实（库内活动；没有就是空）。 */
  events?: () => Promise<PlanEventFact[]>;
  /** R24：线下聊过新建联系人（来源「プラン」）；不可用时为 null。 */
  createContact?: (input: { name: string }) => Promise<string | null>;
  /** R25 复核 M1：AI 账本里本月见直已占的次数（live 由账本给；没有时只按用户次数）。 */
  reviewBudget?: PlanReviewBudgetReader;
}

/** memo 判定达到几问才出计分提议（DESIGN §2.7）。 */
export const PLAN_MEMO_COVERAGE_MIN = 2;

function fingerprint(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function requiredId(value: unknown, field: string): string {
  if (typeof value !== "string" || !value.trim() || value.length > 200) throw new PlanV2Error("INVALID_INPUT", `${field} is required.`);
  return value.trim();
}

/** 未被对冲的计分记录。 */
export function activeAwards(log: readonly PlanV2LogEntry[]): Array<PlanV2LogEntry & { award: PlanAwardPayload }> {
  const reversed = new Set(log.filter((entry) => entry.event === "score_reversed").map((entry) => String(entry.payload.awardLogId)));
  return log
    .filter((entry) => entry.event === "score_awarded" && !reversed.has(entry.id))
    .map((entry) => ({ ...entry, award: entry.payload as unknown as PlanAwardPayload }));
}

/** 被对冲的计分（「今日 +N」要减掉今天的对冲）。 */
export function scoreReversals(log: readonly PlanV2LogEntry[]): PlanScoreReversal[] {
  const awards = new Map(log.filter((entry) => entry.event === "score_awarded").map((entry) => [entry.id, entry]));
  return log.flatMap((entry) => {
    if (entry.event !== "score_reversed") return [];
    const award = awards.get(String(entry.payload.awardLogId));
    if (!award) return [];
    return [{ awardedAt: award.createdAt, points: Number((award.payload as unknown as PlanAwardPayload).points ?? 0), reversedAt: entry.createdAt }];
  });
}

/**
 * 「確定以来」的记录数（見直し的 `PlanReviewView.sinceConfirmed` 与概要的 `PlanV2Detail.sinceConfirmed` 共用这一个口径）：
 * 按计划创建的时刻比（startsOn 是东京日期，不能和 UTC 时间戳按字符串比）；话过 = talked / self_report / memo 的未撤销计分条数，
 * 活动 = event 计分条数，Step = step_completed 记录条数。
 */
export function planSinceConfirmed(plan: Pick<PlanV2Row, "createdAt"> | null, log: readonly PlanV2LogEntry[]): { talked: number; events: number; stepsCompleted: number } {
  const since = (entry: { createdAt: string }) => !plan || Date.parse(entry.createdAt) >= Date.parse(plan.createdAt);
  const awards = activeAwards(log).filter(since);
  // 复核 m2：Step 按每一步的最终状态算——确定以来完成、之后没被撤回的才算；完成 → 撤回 → 再完成算 1。
  const steps = new Map<string, string | null>();
  for (const entry of log) {
    if (entry.event === "step_completed") steps.set(String(entry.payload.stepKey), entry.createdAt);
    if (entry.event === "step_reopened") steps.set(String(entry.payload.stepKey), null);
  }
  return {
    events: awards.filter((entry) => entry.award.basis === "event").length,
    stepsCompleted: [...steps.values()].filter((at): at is string => at !== null && since({ createdAt: at })).length,
    talked: awards.filter((entry) => entry.award.basis === "talked" || entry.award.basis === "self_report" || entry.award.basis === "memo").length,
  };
}

/**
 * 计分记录的唯一键：`<base>:<n>`，n = 同一键基下已被对冲的条数 + 1（确定性）。
 * 同一时刻的重复写入撞上唯一键（数据库兜底，不只靠服务层先查）；撤销之后重记拿到下一个 n。
 */
export function awardKey(log: readonly PlanV2LogEntry[], base: string): string {
  const reversed = new Set(log.filter((entry) => entry.event === "score_reversed").map((entry) => String(entry.payload.awardLogId)));
  const used = log.filter((entry) => entry.event === "score_awarded" && entry.idempotencyKey.startsWith(`${base}:`) && reversed.has(entry.id)).length;
  return `${base}:${used + 1}`;
}

function toScoreAward(entry: PlanV2LogEntry & { award: PlanAwardPayload }): PlanScoreAward {
  return { anonymous: entry.award.anonymous, at: entry.createdAt, basis: entry.award.basis, id: entry.id, part: entry.award.part, points: entry.award.points, typeKey: entry.award.typeKey };
}

function scoreSlots(plan: PlanV2Row, types: readonly PlanV2TypeItem[]): PlanScoreSlot[] {
  return [
    ...types.map((item) => ({ allocation: item.allocation, emoji: item.personType.emoji, key: item.personType.key, shortLabel: item.shortLabel, skipped: Boolean(item.skippedAt), targetCount: item.targetCount })),
    { allocation: plan.eventAllocation, emoji: "🎟️", key: PLAN_EVENT_SEGMENT_KEY, shortLabel: "イベント", skipped: false, targetCount: plan.eventTargetCount },
  ];
}

export function createPlanV2Service(options: PlanV2ServiceOptions): PlanV2Service {
  const { repository, scope } = options;
  const now = () => (options.now ? options.now() : new Date()).toISOString();
  const newId = options.newId ?? (() => randomUUID());

  async function scoreOf(reader: PlanV2Reader, plan: PlanV2Row, at = now()): Promise<PlanScoreView> {
    // 同一个事务连接上的查询依次执行（pg 不支持一条连接并发查询）。
    const types = await reader.typeItems(plan.id);
    const log = await reader.log(plan.id);
    return summarizePlanScore({ achievedAt: plan.achievedAt, awards: activeAwards(log).map(toScoreAward), now: at, reversals: scoreReversals(log), slots: scoreSlots(plan, types) });
  }

  function talkedPeople(log: readonly PlanV2LogEntry[]): number {
    const people = new Set<string>();
    let anonymous = 0;
    for (const entry of activeAwards(log)) {
      if (entry.award.basis === "skip" || entry.award.typeKey === PLAN_EVENT_SEGMENT_KEY) continue;
      if (entry.award.contactId) people.add(entry.award.contactId);
      else if (entry.award.anonymous) anonymous += 1;
    }
    return people.size + anonymous;
  }

  async function goalItem(reader: PlanV2Reader, plan: PlanV2Row): Promise<PlanGoalListItem & { score: PlanScoreView }> {
    // 每个目标只读一次条目与记录（复核 m6）。
    const types = await reader.typeItems(plan.id);
    const log = await reader.log(plan.id);
    const score = summarizePlanScore({ achievedAt: plan.achievedAt, awards: activeAwards(log).map(toScoreAward), now: now(), reversals: scoreReversals(log), slots: scoreSlots(plan, types) });
    return {
      goal: plan.goalText,
      goalKind: plan.goalKind,
      lastOpenedAt: plan.lastOpenedAt,
      planId: plan.id,
      status: plan.achievedAt ? "achieved" : "active",
      score,
      talkedPeople: talkedPeople(log),
      total: score.total,
      ...(options.sample ? { sample: true as const } : {}),
    };
  }

  const withoutScore = ({ score: _score, ...item }: PlanGoalListItem & { score: PlanScoreView }): PlanGoalListItem => item;

  async function requireActivePlan(tx: PlanV2Reader, planId: string): Promise<PlanV2Row> {
    const plan = await tx.plan(planId);
    if (!plan) throw new PlanV2Error("PLAN_NOT_FOUND", "Plan not found.");
    if (plan.achievedAt) throw new PlanV2Error("PLAN_ACHIEVED", "This goal is already achieved; its score is final.");
    if (plan.status !== "active") throw new PlanV2Error("PLAN_NOT_FOUND", "Plan not found.");
    return plan;
  }

  async function requireType(tx: PlanV2Reader, plan: PlanV2Row, itemId: string): Promise<PlanV2TypeItem> {
    const item = (await tx.typeItems(plan.id)).find((type) => type.id === itemId);
    if (!item) throw new PlanV2Error("ITEM_NOT_FOUND", "Person type not found.");
    return item;
  }

  /** 带幂等回执的命令：同键同内容重放第一次的结果；同键不同内容 409。 */
  async function command<T extends Record<string, unknown>>(
    tx: PlanV2Transaction,
    input: { key: string; kind: string; planId: string; body: unknown },
    run: () => Promise<{ outcome: "applied" | "noop"; response: T }>,
  ): Promise<T & { replayed: boolean }> {
    const key = `${input.kind}:${requiredId(input.key, "idempotencyKey")}`;
    const print = fingerprint({ body: input.body, kind: input.kind, planId: input.planId });
    const receipt = await tx.flowReceipt(key);
    if (receipt) {
      if (receipt.fingerprint !== print || receipt.kind !== input.kind) throw new PlanV2Error("IDEMPOTENCY_KEY_REUSED", "The idempotency key was used for a different request.");
      return { ...(receipt.response as T), replayed: true };
    }
    const result = await run();
    await tx.insertFlowReceipt({ createdAt: now(), fingerprint: print, idempotencyKey: key, kind: input.kind, outcome: result.outcome, planId: input.planId, response: result.response });
    return { ...result.response, replayed: false };
  }

  function logEntry(input: Omit<PlanV2LogEntry, "id" | "createdAt" | "author"> & { author?: PlanV2LogEntry["author"]; createdAt?: string }): PlanV2LogEntry {
    return { author: input.author ?? "user", createdAt: input.createdAt ?? now(), id: `plog_${newId()}`, ...input };
  }

  /** 计分时间：不填 = 现在；填了必须在计划开始日（东京）到「现在 + 5 分钟」之间。 */
  function awardTime(plan: PlanV2Row, at: string | undefined): string {
    if (!at) return now();
    const time = Date.parse(at);
    const earliest = Date.parse(`${plan.startsOn}T00:00:00+09:00`);
    if (!Number.isFinite(time) || time < earliest || time > Date.parse(now()) + 5 * 60_000) {
      throw new PlanV2Error("INVALID_INPUT", "The time must be between the plan's start and now.");
    }
    return new Date(time).toISOString();
  }

  async function reviewUsedThisMonth(reader: PlanV2Reader): Promise<number> {
    const month = tokyoUsageMonth(new Date(now()));
    let used = 0;
    for (const plan of await reader.goalPlans()) {
      used += (await reader.log(plan.id)).filter((entry) => entry.event === "review_used" && entry.payload.month === month).length;
    }
    return used;
  }

  async function buildDetail(reader: PlanV2Reader, plan: PlanV2Row): Promise<PlanV2Detail> {
    const types = await reader.typeItems(plan.id);
    const log = await reader.log(plan.id);
    const active = await reader.activePlans();
    const score = summarizePlanScore({ achievedAt: plan.achievedAt, awards: activeAwards(log).map(toScoreAward), now: now(), reversals: scoreReversals(log), slots: scoreSlots(plan, types) });
    const completed = new Map<string, string | null>();
    for (const entry of log) {
      if (entry.event === "step_completed") completed.set(String(entry.payload.stepKey), entry.createdAt);
      if (entry.event === "step_reopened") completed.set(String(entry.payload.stepKey), null);
    }
    const used = await reviewUsedThisMonth(reader);
    const review = planReviewQuota(used, options.reviewBudget ? await options.reviewBudget(scope.actorId, new Date(now())) : null);
    const since = planSinceConfirmed(plan, log);
    return {
      achievedAt: plan.achievedAt,
      content: {
        allocationReasons: plan.analysis.allocationReasons,
        basis: plan.analysis.basis,
        citations: plan.analysis.citations,
        conclusion: plan.analysis.conclusion,
        diagnosis: plan.analysis.diagnosis,
        event: { allocation: plan.eventAllocation, targetCount: plan.eventTargetCount },
        ...(plan.analysis.flow ? { flow: plan.analysis.flow } : {}),
        personTypes: types.map((item) => ({
          allocation: item.allocation,
          countRule: item.personType.countRule,
          emoji: item.personType.emoji,
          introRoutes: item.personType.introRoutes,
          itemId: item.id,
          key: item.personType.key,
          opener: item.personType.opener,
          persona: item.personType.persona,
          questions: item.personType.questions,
          recognizeHints: item.personType.recognizeHints,
          roleSituation: item.roleSituation,
          shortLabel: item.shortLabel,
          shortLabelId: item.personType.shortLabelId,
          skipped: Boolean(item.skippedAt),
          slot: item.slot,
          targetCount: item.targetCount,
          why: item.personType.why,
        })),
        ...(plan.analysis.sample ? { sample: true as const } : {}),
        steps: plan.steps.map((step) => ({ ...step, completedAt: completed.get(step.key) ?? null })),
      },
      goal: plan.goalText,
      goalKind: plan.goalKind,
      planId: plan.id,
      premise: plan.premise,
      purposeText: plan.purposeText,
      quota: {
        activeGoalLimit: PLAN_V2_GOAL_LIMIT,
        activeGoals: active.length,
        manualEditAvailable: plan.manualEditAvailable,
        reviewLeftThisMonth: review.left,
        reviewMonthlyLimit: PLAN_REVIEW_MONTHLY_LIMIT,
        ...(review.reason ? { reviewLimitReason: review.reason } : {}),
      },
      revision: plan.revision,
      score,
      sinceConfirmed: { events: since.events, stepsDone: since.stepsCompleted, talkedPeople: since.talked },
      startsOn: plan.startsOn,
      ...(options.sample ? { sample: true as const } : {}),
    };
  }

  async function assertContact(contactId: string) {
    if (!options.references) return;
    const missing = await options.references.findMissingContactIds([contactId]);
    if (missing.length > 0) throw new PlanV2Error("REFERENCE_NOT_FOUND", "Contact not found.");
  }

  async function loadEvents(): Promise<PlanEventFact[]> {
    if (!options.events) return [];
    try {
      return await options.events();
    } catch (error) {
      // 活动读不到不挡概要：会える活動这一块为空。
      console.error(JSON.stringify({ error: error instanceof Error ? error.name : "unknown", event: "plan_v2_events_unavailable" }));
      return [];
    }
  }

  async function overviewInput(reader: PlanV2Reader, plan: PlanV2Row, events: PlanEventFact[], view: PlanViewOptions): Promise<OverviewInput> {
    const types = await reader.typeItems(plan.id);
    const log = await reader.log(plan.id);
    const awards = activeAwards(log);
    const candidates = await reader.matchCandidates(types.map((type) => type.id));
    const contactIds = new Set<string>();
    for (const candidate of candidates) contactIds.add(candidate.contactId);
    for (const entry of awards) if (entry.award.contactId) contactIds.add(entry.award.contactId);
    for (const type of types) for (const route of type.personType.introRoutes) contactIds.add(route.viaContactId);
    for (const entry of log) if (entry.event === "memo_coverage_proposed" && typeof entry.payload.contactId === "string") contactIds.add(entry.payload.contactId);
    const contacts = new Map((await reader.contactViews([...contactIds])).map((contact) => [contact.id, contact]));
    return { awards, candidates, contacts, events, language: view.language ?? "ja", log, plan, platform: view.platform ?? "web", types };
  }

  /** 把联系人关联到类型（linked；已 established 的不降级）。 */
  async function linkContact(tx: PlanV2Transaction, type: PlanV2TypeItem, contactId: string) {
    if (type.contactLinks.some((link) => link.contactId === contactId)) return;
    const at = now();
    await tx.updateTypeItem({ ...type, contactLinks: [...type.contactLinks, { contactId, establishedAt: null, linkedAt: at, state: "linked" }], updatedAt: at });
  }

  async function applyCandidateDecision(tx: PlanV2Transaction, type: PlanV2TypeItem, candidateId: string, decision: "accept" | "dismiss"): Promise<"accepted" | "dismissed"> {
    const decided = await tx.decideMatchCandidate(candidateId, decision === "accept" ? "accepted" : "dismissed", now());
    if (!decided) throw new PlanV2Error("CANDIDATE_NOT_FOUND", "Candidate not found.");
    // 只关联，不生成 v1 式「约 TA」行动（DESIGN §2.6）。
    if (decided.status === "accepted") await linkContact(tx, type, decided.contactId);
    return decided.status === "pending" ? (decision === "accept" ? "accepted" : "dismissed") : decided.status;
  }

  /**
   * 计分的事务体（award、memo 确认卡、线下聊过新建联系人共用；复核 M1 / M2）：不写幂等回执，回执由调用方的 `command` 负责。
   * 同人同类型已计过 → noop（already_counted）；`nextAward` 给 none → noop（skipped / anonymous_over_target）。
   */
  async function scoreIn(
    tx: PlanV2Transaction,
    plan: PlanV2Row,
    type: PlanV2TypeItem,
    input: { anonymous: boolean; basis: PlanAwardPayload["basis"]; contactId: string | null; at: string; anonymousKey?: string },
  ): Promise<{ outcome: "applied" | "noop"; response: Record<string, unknown> }> {
    const { anonymous, contactId, at } = input;
    const log = await tx.log(plan.id);
    const mine = activeAwards(log).filter((entry) => entry.award.typeKey === type.personType.key);
    if (contactId && mine.some((entry) => entry.award.contactId === contactId)) {
      return { outcome: "noop", response: { awardLogId: null, part: "none", points: 0, reason: "already_counted", score: await scoreOf(tx, plan) } };
    }
    const next = nextAward({ allocation: type.allocation, anonymous, awards: mine.map((entry) => entry.award), skipped: Boolean(type.skippedAt), targetCount: type.targetCount });
    if (next.part === "none") return { outcome: "noop", response: { awardLogId: null, part: "none", points: 0, reason: next.reason, score: await scoreOf(tx, plan) } };
    const keyBase = contactId ? `score:${plan.id}:${type.personType.key}:${contactId}` : `score:${plan.id}:${type.personType.key}:anon:${input.anonymousKey ?? newId()}`;
    const payload: PlanAwardPayload = { anonymous, basis: input.basis, contactId, eventId: null, part: next.part, points: next.points, typeKey: type.personType.key };
    const entry = logEntry({
      body: `${type.shortLabel}：+${next.points}`,
      createdAt: at,
      event: "score_awarded",
      idempotencyKey: awardKey(log, keyBase),
      itemId: type.id,
      linkedContactIds: contactId ? [contactId] : [],
      linkedEventId: null,
      payload: payload as unknown as Record<string, unknown>,
      planId: plan.id,
    });
    await tx.insertLog(entry);
    if (contactId) {
      const links = type.contactLinks.filter((link) => link.contactId !== contactId);
      const previous = type.contactLinks.find((link) => link.contactId === contactId);
      links.push({ contactId, establishedAt: at, linkedAt: previous?.linkedAt ?? at, state: "established" });
      await tx.updateTypeItem({ ...type, contactLinks: links, updatedAt: now() });
    }
    return { outcome: "applied", response: { awardLogId: entry.id, part: next.part, points: next.points, score: await scoreOf(tx, plan) } };
  }

  /**
   * 线下聊过「新しく登録」（复核 M2，照 R23 复核 M4「人脈にも登録する」的做法）：
   * 1. 事务内按幂等键占位（`talked_offline_claim:<key>`，同时校验计划、类型与时间）；
   * 2. 事务外建联系人（来源「プラン」）；
   * 3. 事务内回填：用同一个幂等键计分（`award:<key>`），并写结果回执（`talked_offline_done:<key>`）。
   * 同键重放读结果回执，不再建联系人；占位还在、结果回执没有（上一次还在进行或中途断掉）→ 409 REQUEST_IN_PROGRESS，
   * 不冒险再建一人。建联系人失败 → 结果回执记失败并返回 CONTACT_CREATE_FAILED（不再静默改成匿名；同键重放仍是这个错，
   * 界面换新键重试或让用户选「名前なしで記録」）。对标 Stripe 幂等键：结果（含失败）按键保存、进行中的同键请求返回 409。
   */
  async function createContactAndAward(input: { planId: string; itemId: string; name: string; at?: string; idempotencyKey: string }): Promise<PlanTalkedOfflineResult> {
    const key = requiredId(input.idempotencyKey, "idempotencyKey");
    const id = requiredId(input.planId, "planId");
    const claimKey = `talked_offline_claim:${key}`;
    const doneKey = `talked_offline_done:${key}`;
    const print = fingerprint({ body: { at: input.at ?? null, itemId: input.itemId, name: input.name }, kind: "talked_offline_contact", planId: id });
    const replayDone = (receipt: { fingerprint: string; response: Record<string, unknown> }): PlanTalkedOfflineResult => {
      if (receipt.fingerprint !== print) throw new PlanV2Error("IDEMPOTENCY_KEY_REUSED", "The idempotency key was used for a different request.");
      if (receipt.response.failed === true) throw new PlanV2Error("CONTACT_CREATE_FAILED", "The contact could not be created.");
      const award = receipt.response.award as PlanAwardResult;
      return { award: { ...award, replayed: true }, createdContactId: String(receipt.response.createdContactId) };
    };
    const claimed = await repository.transact(scope, async (tx) => {
      const plan = await requireActivePlan(tx, id);
      const type = await requireType(tx, plan, requiredId(input.itemId, "itemId"));
      if (input.at) awardTime(plan, input.at);
      const done = await tx.flowReceipt(doneKey);
      if (done) return { done };
      const claim = await tx.flowReceipt(claimKey);
      if (claim) {
        if (claim.fingerprint !== print) throw new PlanV2Error("IDEMPOTENCY_KEY_REUSED", "The idempotency key was used for a different request.");
        throw new PlanV2Error("REQUEST_IN_PROGRESS", "The same request is still in progress.");
      }
      // 同一个键已经用于别的计分（例如先选了匿名）：建联系人之前就拒绝，不留孤儿联系人。
      if (await tx.flowReceipt(`award:${key}`)) throw new PlanV2Error("IDEMPOTENCY_KEY_REUSED", "The idempotency key was used for a different request.");
      await tx.insertFlowReceipt({ createdAt: now(), fingerprint: print, idempotencyKey: claimKey, kind: "talked_offline_claim", outcome: "applied", planId: plan.id, response: { itemId: type.id } });
      return { done: null };
    });
    if (claimed.done) return replayDone(claimed.done);

    let created: string | null = null;
    try {
      created = options.createContact ? await options.createContact({ name: input.name }) : null;
    } catch (error) {
      console.error(JSON.stringify({ error: error instanceof Error ? error.name : "unknown", event: "plan_v2_talked_offline_create_contact_failed" }));
      created = null;
    }

    const outcome = await repository.transact(scope, async (tx) => {
      const done = await tx.flowReceipt(doneKey);
      if (done) return { replay: done };
      if (!created) {
        await tx.insertFlowReceipt({ createdAt: now(), fingerprint: print, idempotencyKey: doneKey, kind: "talked_offline_done", outcome: "noop", planId: id, response: { failed: true } });
        return { failed: true as const };
      }
      const contactId = created;
      const plan = await requireActivePlan(tx, id);
      const type = await requireType(tx, plan, requiredId(input.itemId, "itemId"));
      const award = await command<Record<string, unknown>>(tx, { body: { anonymous: false, basis: "talked", contactId, itemId: type.id }, key, kind: "award", planId: plan.id }, async () =>
        scoreIn(tx, plan, type, { anonymous: false, at: awardTime(plan, input.at), basis: "talked", contactId }));
      const { replayed: _replayed, ...stored } = award;
      await tx.insertFlowReceipt({ createdAt: now(), fingerprint: print, idempotencyKey: doneKey, kind: "talked_offline_done", outcome: "applied", planId: plan.id, response: { award: stored, createdContactId: contactId } });
      return { result: { award: award as unknown as PlanAwardResult, createdContactId: contactId } };
    });
    if ("replay" in outcome && outcome.replay) return replayDone(outcome.replay);
    if ("failed" in outcome) throw new PlanV2Error("CONTACT_CREATE_FAILED", "The contact could not be created.");
    return (outcome as { result: PlanTalkedOfflineResult }).result;
  }

  return {
    async summary() {
      return repository.read(scope, async (reader) => {
        const goals = await reader.goalPlans();
        const items: Array<PlanGoalListItem & { score: PlanScoreView }> = [];
        for (const plan of goals) items.push(await goalItem(reader, plan));
        const current = goals.find((plan) => plan.status === "active");
        let home: PlanV2HomeSummary | null = null;
        if (current) {
          home = {
            goal: current.goalText,
            goalKind: current.goalKind,
            planId: current.id,
            score: items.find((item) => item.planId === current.id)!.score,
            ...(options.sample ? { sample: true as const } : {}),
          };
        }
        return { current: home, goals: items.map(withoutScore) };
      });
    },

    async listGoals() {
      return repository.read(scope, async (reader) => {
        const items: PlanGoalListItem[] = [];
        for (const plan of await reader.goalPlans()) items.push(withoutScore(await goalItem(reader, plan)));
        return items;
      });
    },

    async detail(planId) {
      const id = requiredId(planId, "planId");
      return repository.read(scope, async (reader) => {
        const plan = await reader.plan(id);
        if (!plan || (plan.status !== "active" && !plan.achievedAt)) return null;
        return buildDetail(reader, plan);
      });
    },

    async markOpened(planId) {
      const id = requiredId(planId, "planId");
      await repository.transact(scope, async (tx) => {
        const plan = await tx.plan(id);
        if (!plan || (plan.status !== "active" && !plan.achievedAt)) throw new PlanV2Error("PLAN_NOT_FOUND", "Plan not found.");
        await tx.updatePlan({ ...plan, lastOpenedAt: now() });
      });
    },

    async award({ planId, itemId, request }) {
      const contactId = request.contactId ? requiredId(request.contactId, "contactId") : null;
      const anonymous = request.anonymous === true;
      if (Boolean(contactId) === anonymous) throw new PlanV2Error("INVALID_INPUT", "Give either a contact or anonymous.");
      if (request.basis !== "talked" && request.basis !== "self_report") throw new PlanV2Error("INVALID_INPUT", "Unknown basis.");
      if (contactId) await assertContact(contactId);
      return repository.transact(scope, async (tx) => {
        const plan = await requireActivePlan(tx, requiredId(planId, "planId"));
        const type = await requireType(tx, plan, requiredId(itemId, "itemId"));
        const result = await command<Record<string, unknown>>(tx, { body: { anonymous, basis: request.basis, contactId, itemId: type.id }, key: request.idempotencyKey, kind: "award", planId: plan.id }, async () =>
          scoreIn(tx, plan, type, { anonymous, anonymousKey: request.idempotencyKey, at: awardTime(plan, request.at), basis: request.basis, contactId }));
        return result as unknown as PlanAwardResult;
      });
    },

    async undo({ planId, logId, idempotencyKey }) {
      return repository.transact(scope, async (tx) => {
        const plan = await requireActivePlan(tx, requiredId(planId, "planId"));
        const target = requiredId(logId, "logId");
        const result = await command(tx, { body: { logId: target }, key: idempotencyKey, kind: "undo", planId: plan.id }, async () => {
          const log = await tx.log(plan.id);
          const award = activeAwards(log).find((entry) => entry.id === target);
          if (!award) {
            if (log.some((entry) => entry.id === target && entry.event === "score_awarded")) {
              return { outcome: "noop" as const, response: { score: await scoreOf(tx, plan) } };
            }
            throw new PlanV2Error("AWARD_NOT_FOUND", "Score record not found.");
          }
          if (award.award.basis === "skip") throw new PlanV2Error("INVALID_INPUT", "Use unskip to take back a skip.");
          if (award.itemId) {
            const type = (await tx.typeItems(plan.id)).find((item) => item.id === award.itemId);
            // 跳过 = 满额：跳过期间撤销已得分会让满额不成立，先撤回跳过（对标 YNAB 锁定已对账的分类）。
            if (type?.skippedAt) throw new PlanV2Error("TYPE_SKIPPED", "Take back the skip before undoing a score of this type.");
          }
          await tx.insertLog(logEntry({
            body: `取り消し：-${award.award.points}`,
            event: "score_reversed",
            idempotencyKey: `reverse:${award.id}`,
            itemId: award.itemId,
            // 对冲记录不挂联系人：关系强度与时间线按「挂了联系人的计划记录」计互动，撤销不该再算一次。
            linkedContactIds: [],
            linkedEventId: award.linkedEventId,
            payload: { awardLogId: award.id, reason: "undo" },
            planId: plan.id,
          }));
          if (award.award.contactId && award.itemId) {
            const type = (await tx.typeItems(plan.id)).find((item) => item.id === award.itemId);
            if (type) {
              // 面谈记录与关联保留，只撤销「话过了」：关联退回 linked。
              const links = type.contactLinks.map((link) => (link.contactId === award.award.contactId ? { ...link, establishedAt: null, state: "linked" as const } : link));
              await tx.updateTypeItem({ ...type, contactLinks: links, updatedAt: now() });
            }
          }
          return { outcome: "applied" as const, response: { score: await scoreOf(tx, plan) } };
        });
        return result as PlanCommandResult;
      });
    },

    async skip({ planId, itemId, idempotencyKey }) {
      return repository.transact(scope, async (tx) => {
        const plan = await requireActivePlan(tx, requiredId(planId, "planId"));
        const type = await requireType(tx, plan, requiredId(itemId, "itemId"));
        const result = await command(tx, { body: { itemId: type.id, op: "skip" }, key: idempotencyKey, kind: "skip", planId: plan.id }, async () => {
          if (type.skippedAt) return { outcome: "noop" as const, response: { score: await scoreOf(tx, plan) } };
          const mine = activeAwards(await tx.log(plan.id)).filter((entry) => entry.award.typeKey === type.personType.key);
          const points = skipAwardPoints(type.allocation, mine.map((entry) => entry.award));
          const at = now();
          const payload: PlanAwardPayload = { anonymous: false, basis: "skip", contactId: null, eventId: null, part: "base", points, typeKey: type.personType.key };
          await tx.insertLog(logEntry({
            body: `${type.shortLabel}：習熟済み +${points}`,
            event: "score_awarded",
            idempotencyKey: awardKey(await tx.log(plan.id), `skip:${plan.id}:${type.personType.key}`),
            itemId: type.id,
            linkedContactIds: [],
            linkedEventId: null,
            payload: payload as unknown as Record<string, unknown>,
            planId: plan.id,
          }));
          await tx.updateTypeItem({ ...type, skippedAt: at, updatedAt: at });
          return { outcome: "applied" as const, response: { score: await scoreOf(tx, plan) } };
        });
        return result as PlanCommandResult;
      });
    },

    async unskip({ planId, itemId, idempotencyKey }) {
      return repository.transact(scope, async (tx) => {
        const plan = await requireActivePlan(tx, requiredId(planId, "planId"));
        const type = await requireType(tx, plan, requiredId(itemId, "itemId"));
        const result = await command(tx, { body: { itemId: type.id, op: "unskip" }, key: idempotencyKey, kind: "unskip", planId: plan.id }, async () => {
          if (!type.skippedAt) return { outcome: "noop" as const, response: { score: await scoreOf(tx, plan) } };
          const skipAward = activeAwards(await tx.log(plan.id)).find((entry) => entry.award.typeKey === type.personType.key && entry.award.basis === "skip");
          if (skipAward) {
            await tx.insertLog(logEntry({
              body: `${type.shortLabel}：スキップを取り消し`,
              event: "score_reversed",
              idempotencyKey: `reverse:${skipAward.id}`,
              itemId: type.id,
              linkedContactIds: [],
              linkedEventId: null,
              payload: { awardLogId: skipAward.id, reason: "unskip" },
              planId: plan.id,
            }));
          }
          await tx.updateTypeItem({ ...type, skippedAt: null, updatedAt: now() });
          return { outcome: "applied" as const, response: { score: await scoreOf(tx, plan) } };
        });
        return result as PlanCommandResult;
      });
    },

    async setStepCompleted({ planId, stepKey, completed, idempotencyKey }) {
      return repository.transact(scope, async (tx) => {
        const plan = await requireActivePlan(tx, requiredId(planId, "planId"));
        const key = requiredId(stepKey, "stepKey");
        if (!plan.steps.some((step) => step.key === key)) throw new PlanV2Error("STEP_NOT_FOUND", "Step not found.");
        const result = await command(tx, { body: { completed, stepKey: key }, key: idempotencyKey, kind: completed ? "step_complete" : "step_reopen", planId: plan.id }, async () => {
          const log = await tx.log(plan.id);
          const last = [...log].reverse().find((entry) => (entry.event === "step_completed" || entry.event === "step_reopened") && entry.payload.stepKey === key);
          const isDone = last?.event === "step_completed";
          if (isDone === completed) return { outcome: "noop" as const, response: { completedAt: isDone ? last!.createdAt : null, score: await scoreOf(tx, plan) } };
          const entry = logEntry({
            body: completed ? `Step 完了：${plan.steps.find((step) => step.key === key)!.title}` : `Step を未完了に戻しました`,
            event: completed ? "step_completed" : "step_reopened",
            idempotencyKey: `step:${plan.id}:${key}:${log.filter((item) => (item.event === "step_completed" || item.event === "step_reopened") && item.payload.stepKey === key).length + 1}`,
            itemId: null,
            linkedContactIds: [],
            linkedEventId: null,
            payload: { stepKey: key },
            planId: plan.id,
          });
          await tx.insertLog(entry);
          return { outcome: "applied" as const, response: { completedAt: completed ? entry.createdAt : null, score: await scoreOf(tx, plan) } };
        });
        return result as PlanCommandResult;
      });
    },

    async createPlanFromDraft(input) {
      const creationKey = requiredId(input.creationKey, "creationKey");
      const goalId = requiredId(input.goalId, "goalId");
      if (!PLAN_GOAL_KINDS.includes(input.goalKind)) throw new PlanV2Error("INVALID_INPUT", "Unknown goal kind.");
      const goalText = typeof input.goalText === "string" ? input.goalText.trim() : "";
      if (!goalText || goalText.length > 2000) throw new PlanV2Error("INVALID_INPUT", "goalText is required.");
      const content = input.content;
      const keys = content.personTypes.map((type) => type.key);
      if (new Set(keys).size !== keys.length || keys.includes(PLAN_EVENT_SEGMENT_KEY)) throw new PlanV2Error("INVALID_INPUT", "Person type keys must be unique.");
      const stepKeys = content.steps.map((step) => step.key);
      if (new Set(stepKeys).size !== stepKeys.length) throw new PlanV2Error("INVALID_INPUT", "Step keys must be unique.");
      for (const step of content.steps) {
        for (const key of step.personTypeKeys) if (key !== PLAN_EVENT_SEGMENT_KEY && !keys.includes(key)) throw new PlanV2Error("INVALID_INPUT", `Step ${step.key} names an unknown person type.`);
      }
      const slots: PlanAllocationSlot[] = [
        ...content.personTypes.map((type, index) => ({ allocation: type.allocation, earnedBase: 0, key: type.key, metCount: 0, skipped: false, targetCount: type.targetCount, templateIndex: index })),
        { allocation: content.event.allocation, earnedBase: 0, isEvent: true, key: PLAN_EVENT_SEGMENT_KEY, metCount: 0, skipped: false, targetCount: content.event.targetCount, templateIndex: content.personTypes.length },
      ];
      const allocation = validateAllocations(slots);
      if (allocation.ok === false) throw new PlanV2Error("INVALID_INPUT", `The allocation is not valid (${allocation.error}${allocation.key ? `: ${allocation.key}` : ""}).`);

      return repository.transact(scope, async (tx) => {
        const existing = await tx.planByCreationKey(creationKey);
        if (existing) return { archivedV1PlanId: null, created: false, plan: await buildDetail(tx, existing) };
        const active = await tx.activePlans();
        if (active.some((plan) => plan.goalId === goalId)) throw new PlanV2Error("PLAN_GOAL_LIMIT", "This goal already has an active plan.");
        if (active.length >= PLAN_V2_GOAL_LIMIT) throw new PlanV2Error("PLAN_GOAL_LIMIT", `At most ${PLAN_V2_GOAL_LIMIT} goals can be active at the same time.`);
        const at = now();
        const archivedV1PlanId = await tx.archiveActiveV1(at);
        const plan: PlanV2Row = {
          achievedAt: null,
          analysis: {
            allocationReasons: [...content.allocationReasons],
            basis: [...content.basis],
            citations: [...content.citations],
            conclusion: content.conclusion,
            diagnosis: content.diagnosis,
            ...(content.flow ? { flow: [...content.flow] } : {}),
            schemaVersion: 2,
            ...(content.sample ? { sample: true as const } : {}),
          },
          archivedAt: null,
          createdAt: at,
          creationKey,
          eventAllocation: content.event.allocation,
          eventTargetCount: content.event.targetCount,
          goalId,
          goalKind: input.goalKind,
          goalText,
          id: `plan_${newId()}`,
          lastOpenedAt: at,
          manualEditAvailable: input.manualEditAvailable,
          premise: [...input.premise],
          purposeLevel: input.purposeLevel ?? null,
          purposeText: input.purposeText ?? null,
          revision: 1,
          startsOn: tokyoDate(at),
          status: "active",
          steps: content.steps.map((step) => ({ doneCriteria: step.doneCriteria, key: step.key, personTypeKeys: [...step.personTypeKeys], title: step.title, why: step.why })),
          updatedAt: at,
          version: (await tx.maxVersion()) + 1,
        };
        await tx.insertPlan(plan);
        await tx.insertTypeItems(content.personTypes.map((type, index) => ({
          allocation: type.allocation,
          contactLinks: [],
          createdAt: at,
          id: `pitem_${newId()}`,
          personType: {
            countRule: type.countRule,
            emoji: type.emoji,
            introRoutes: [...type.introRoutes],
            key: type.key,
            opener: type.opener ?? null,
            persona: type.persona ?? null,
            questions: [...type.questions],
            recognizeHints: [...type.recognizeHints],
            shortLabelId: type.shortLabelId,
            why: type.why,
          },
          planId: plan.id,
          primaryIndustryId: type.primaryIndustryId ?? null,
          roleSituation: type.roleSituation,
          secondaryIndustryId: type.secondaryIndustryId ?? null,
          shortLabel: type.shortLabel,
          skippedAt: null,
          slot: type.slot,
          sortKey: index + 1,
          targetCount: type.targetCount,
          updatedAt: at,
        })));
        await tx.insertLog(logEntry({ author: "system", body: `プランを確定しました：${goalText}`, event: "plan_created", idempotencyKey: `plan-created:${plan.id}`, itemId: null, linkedContactIds: [], linkedEventId: null, payload: { goalId, revision: 1 }, planId: plan.id }));
        return { archivedV1PlanId, created: true, plan: await buildDetail(tx, plan) };
      });
    },

    async addEventToPlan({ planId, eventId, title }) {
      const event = requiredId(eventId, "eventId");
      if (options.references) {
        const missing = await options.references.findMissingEventIds([event]);
        if (missing.length > 0) throw new PlanV2Error("REFERENCE_NOT_FOUND", "Event not found.");
      }
      return repository.transact(scope, async (tx) => {
        const active = await tx.activePlans();
        const plan = planId ? active.find((item) => item.id === planId) : active[0];
        if (!plan) return null;
        const items = await tx.eventItems(plan.id);
        const existing = items.find((item) => item.eventId === event);
        if (existing) return { created: false, itemId: existing.id, planId: plan.id };
        const at = now();
        const item: PlanV2EventItem = { createdAt: at, eventId: event, id: `pitem_${newId()}`, planId: plan.id, sortKey: 1000 + items.length, status: "recommended", title: title?.trim() || "イベント", updatedAt: at };
        await tx.insertEventItem(item);
        return { created: true, itemId: item.id, planId: plan.id };
      });
    },

    async recordEventAttendanceForPlans({ eventId, title, at, skipIfEverScored }) {
      const event = requiredId(eventId, "eventId");
      return repository.transact(scope, async (tx) => {
        const results: Array<{ planId: string; points: number; part: string }> = [];
        for (const plan of await tx.activePlans()) {
          if (plan.eventAllocation <= 0) continue;
          const planLog = await tx.log(plan.id);
          if (activeAwards(planLog).some((entry) => entry.award.eventId === event)) continue;
          if (skipIfEverScored && planLog.some((entry) => entry.event === "score_awarded" && entry.linkedEventId === event)) continue;
          const key = awardKey(planLog, `score:${plan.id}:${PLAN_EVENT_SEGMENT_KEY}:${event}`);
          const when = at ?? now();
          const items = await tx.eventItems(plan.id);
          const item = items.find((candidate) => candidate.eventId === event);
          let itemId: string;
          if (item) {
            itemId = item.id;
            if (item.status !== "attended") await tx.updateEventItem({ ...item, status: "attended", updatedAt: when });
          } else {
            itemId = `pitem_${newId()}`;
            await tx.insertEventItem({ createdAt: when, eventId: event, id: itemId, planId: plan.id, sortKey: 1000 + items.length, status: "attended", title: title?.trim() || "イベント", updatedAt: when });
          }
          const mine = activeAwards(await tx.log(plan.id)).filter((entry) => entry.award.typeKey === PLAN_EVENT_SEGMENT_KEY);
          const next = nextAward({ allocation: plan.eventAllocation, anonymous: false, awards: mine.map((entry) => entry.award), skipped: false, targetCount: plan.eventTargetCount });
          if (next.part === "none") continue;
          const payload: PlanAwardPayload = { anonymous: false, basis: "event", contactId: null, eventId: event, part: next.part, points: next.points, typeKey: PLAN_EVENT_SEGMENT_KEY };
          await tx.insertLog(logEntry({ author: "system", body: `${title?.trim() || "イベント"}に参加 +${next.points}`, createdAt: when, event: "score_awarded", idempotencyKey: key, itemId, linkedContactIds: [], linkedEventId: event, payload: payload as unknown as Record<string, unknown>, planId: plan.id }));
          results.push({ part: next.part, planId: plan.id, points: next.points });
        }
        return results;
      });
    },

    async planRemainingTargets() {
      return repository.read(scope, async (reader) => {
        const out: PlanRemainingTargets[] = [];
        for (const plan of await reader.activePlans()) {
          const types = await reader.typeItems(plan.id);
          const awards = activeAwards(await reader.log(plan.id));
          const metOf = (typeKey: string) => awards.filter((entry) => entry.award.typeKey === typeKey && entry.award.part === "base" && entry.award.basis !== "skip").length;
          out.push({
            event: { allocation: plan.eventAllocation, remaining: Math.max(0, plan.eventTargetCount - metOf(PLAN_EVENT_SEGMENT_KEY)), targetCount: plan.eventTargetCount },
            goalKind: plan.goalKind,
            planId: plan.id,
            types: types.map((type) => ({
              allocation: type.allocation,
              itemId: type.id,
              key: type.personType.key,
              remaining: type.skippedAt ? 0 : Math.max(0, type.targetCount - metOf(type.personType.key)),
              skipped: Boolean(type.skippedAt),
              slot: type.slot,
              targetCount: type.targetCount,
            })),
          });
        }
        return out;
      });
    },

    async achievement(planId, language) {
      const id = requiredId(planId, "planId");
      return repository.read(scope, async (reader) => {
        const plan = await reader.plan(id);
        if (!plan || !plan.achievedAt) return null;
        const types = await reader.typeItems(plan.id);
        const log = await reader.log(plan.id);
        const score = summarizePlanScore({ achievedAt: plan.achievedAt, awards: activeAwards(log).map(toScoreAward), now: now(), reversals: scoreReversals(log), slots: scoreSlots(plan, types) });
        // いちばん効いたこと：聊出来的分最高的人物类型（规则，不调 AI）；依据是该类型最近的加分记录。
        const best = score.segments.filter((segment) => !segment.skipped && segment.key !== PLAN_EVENT_SEGMENT_KEY && segment.earned + segment.overflow > 0)
          .sort((left, right) => right.earned + right.overflow - (left.earned + left.overflow))[0];
        const bestRecords = best ? activeAwards(log).filter((entry) => entry.award.typeKey === best.key).slice(-3) : [];
        return {
          achievedAt: plan.achievedAt,
          bestMove: best
            ? {
                basis: bestRecords.map((entry) => ({ kind: "record" as const, label: entry.body || best.shortLabel, ref: entry.id })),
                text: language === "en" ? `Talking with ${best.shortLabel} (${best.earned + best.overflow} pts)` : language === "zh" ? `和${best.shortLabel}聊（${best.earned + best.overflow} 分）` : `${best.shortLabel}との対話（${best.earned + best.overflow} 点）`,
              }
            : null,
          events: activeAwards(log).filter((entry) => entry.award.basis === "event").length,
          goal: plan.goalText,
          goalKind: plan.goalKind,
          planId: plan.id,
          skippedAreas: score.segments.filter((segment) => segment.skipped).map((segment) => segment.shortLabel),
          talkedPeople: talkedPeople(log),
          total: score.total,
          ...(options.sample ? { sample: true as const } : {}),
        } satisfies PlanAchievementView;
      });
    },

    async legacyList() {
      const plans = await repository.read(scope, (reader) => reader.legacyPlans());
      return { plans: plans.map(({ analysisSummary: _summary, items: _items, ...item }) => item) };
    },

    async legacyDetail(planId) {
      const id = requiredId(planId, "planId");
      const plans = await repository.read(scope, (reader) => reader.legacyPlans());
      return plans.find((plan) => plan.planId === id) ?? null;
    },

    async overview(planId, view = {}) {
      const id = requiredId(planId, "planId");
      const events = await loadEvents();
      return repository.read(scope, async (reader) => {
        const plan = await reader.plan(id);
        if (!plan || (plan.status !== "active" && !plan.achievedAt)) return null;
        const detail = await buildDetail(reader, plan);
        const input = await overviewInput(reader, plan, events, view);
        const at = now();
        return {
          ...detail,
          pending: pendingItems(input, at),
          recentAwards: recentAwards(input),
          stepProgress: stepProgress(input),
          stepSuggestions: stepSuggestions(input),
          todayChance: plan.status === "active" ? todayChance(input, at) : null,
          typeStats: typeStats(input, at),
        };
      });
    },

    async typeDetail(planId, itemId, view = {}) {
      const id = requiredId(planId, "planId");
      const events = await loadEvents();
      return repository.read(scope, async (reader) => {
        const plan = await reader.plan(id);
        if (!plan || (plan.status !== "active" && !plan.achievedAt)) return null;
        const input = await overviewInput(reader, plan, events, view);
        const type = input.types.find((item) => item.id === itemId);
        return type ? buildTypeDetail(input, type, now(), Boolean(options.sample)) : null;
      });
    },

    async decideCandidate({ planId, itemId, contactId, decision, idempotencyKey }) {
      return repository.transact(scope, async (tx) => {
        const plan = await requireActivePlan(tx, requiredId(planId, "planId"));
        const type = await requireType(tx, plan, requiredId(itemId, "itemId"));
        const candidate = (await tx.matchCandidates([type.id])).find((item) => item.contactId === contactId);
        if (!candidate) throw new PlanV2Error("CANDIDATE_NOT_FOUND", "Candidate not found.");
        const result = await command<Record<string, unknown>>(tx, { body: { candidateId: candidate.id, decision }, key: idempotencyKey, kind: "candidate_decision", planId: plan.id }, async () => {
          const status = await applyCandidateDecision(tx, type, candidate.id, decision);
          return { outcome: "applied" as const, response: { candidateId: candidate.id, status } };
        });
        return result as unknown as PlanCandidateDecisionResult;
      });
    },

    async decideCandidateById({ candidateId, decision }) {
      return repository.transact(scope, async (tx) => {
        for (const plan of await tx.activePlans()) {
          for (const type of await tx.typeItems(plan.id)) {
            const candidate = (await tx.matchCandidates([type.id])).find((item) => item.id === candidateId);
            if (!candidate) continue;
            const replayed = candidate.status !== "pending";
            const status = replayed ? (candidate.status as "accepted" | "dismissed") : await applyCandidateDecision(tx, type, candidate.id, decision);
            return { itemId: type.id, planId: plan.id, replayed, status };
          }
        }
        return null;
      });
    },

    async linkTypeContact({ itemId, contactId }) {
      await assertContact(requiredId(contactId, "contactId"));
      return repository.transact(scope, async (tx) => {
        for (const plan of await tx.activePlans()) {
          const type = (await tx.typeItems(plan.id)).find((item) => item.id === itemId);
          if (!type) continue;
          await linkContact(tx, type, contactId);
          return { itemId: type.id, planId: plan.id };
        }
        return null;
      });
    },

    async talkedOffline({ planId, itemId, request }) {
      if (request.contactId) return { award: await this.award({ itemId, planId, request: { at: request.at, basis: "talked", contactId: request.contactId, idempotencyKey: request.idempotencyKey } }) };
      if (request.anonymous) return { award: await this.award({ itemId, planId, request: { anonymous: true, at: request.at, basis: "self_report", idempotencyKey: request.idempotencyKey } }) };
      const name = (request.name ?? "").trim();
      if (!name) throw new PlanV2Error("INVALID_INPUT", "Give a contact, a name or anonymous.");
      if (!request.createContact) {
        const matches = await repository.read(scope, (reader) => reader.findContactsByName(name, 5));
        if (matches.length > 0) return { matches: matches.map((contact) => ({ company: contact.organization, contactId: contact.id, name: contact.name })) };
      }
      return createContactAndAward({ at: request.at, idempotencyKey: request.idempotencyKey, itemId, name, planId });
    },

    async proposal({ planId, itemId, contactId, slots, language }) {
      const { contact, plan, type } = await repository.read(scope, async (reader) => {
        const current = await requireActivePlan(reader, requiredId(planId, "planId"));
        const item = await requireType(reader, current, requiredId(itemId, "itemId"));
        const [view] = await reader.contactViews([requiredId(contactId, "contactId")]);
        if (!view) throw new PlanV2Error("REFERENCE_NOT_FOUND", "Contact not found.");
        return { contact: view, plan: current, type: item };
      });
      // 站内结构化请求要等收件箱（R13 / R14）的面谈请求接口；在那之前一律只出草稿，绝不显示「已发送」。
      return { draft: proposalDraftText({ contactName: contact.name, goal: plan.goalText, language, questions: type.personType.questions, slots, typeLabel: type.shortLabel }), kind: "draft", requestId: null };
    },

    async introDraft({ planId, itemId, viaContactId, language }) {
      return repository.read(scope, async (reader) => {
        const plan = await requireActivePlan(reader, requiredId(planId, "planId"));
        const type = await requireType(reader, plan, requiredId(itemId, "itemId"));
        const route = type.personType.introRoutes.find((item) => item.viaContactId === viaContactId);
        if (!route) throw new PlanV2Error("REFERENCE_NOT_FOUND", "Introduction route not found.");
        const [via] = await reader.contactViews([viaContactId]);
        if (!via) throw new PlanV2Error("REFERENCE_NOT_FOUND", "Contact not found.");
        return { viaName: via.name, ...introDraftText({ goal: plan.goalText, language, roleSituation: type.roleSituation, typeLabel: type.shortLabel, viaName: via.name }) };
      });
    },

    async pending(view = {}) {
      const events = await loadEvents();
      return repository.read(scope, async (reader) => {
        const items: PlanPendingItem[] = [];
        for (const plan of await reader.activePlans()) items.push(...pendingItems(await overviewInput(reader, plan, events, view), now()));
        return items;
      });
    },

    async decidePending({ id, decision, answered, idempotencyKey }) {
      const pendingId = requiredId(id, "id");
      if (pendingId.startsWith("candidate:")) {
        const result = await this.decideCandidateById({ candidateId: pendingId.slice("candidate:".length), decision });
        if (!result) throw new PlanV2Error("PENDING_NOT_FOUND", "Pending item not found.");
        return { id: pendingId, replayed: result.replayed, status: result.status };
      }
      if (pendingId.startsWith("step:")) {
        const [, planId, ...rest] = pendingId.split(":");
        const stepKey = rest.join(":");
        if (decision === "accept") {
          await this.setStepCompleted({ completed: true, idempotencyKey, planId: planId!, stepKey });
          return { id: pendingId, replayed: false, status: "accepted" };
        }
        return repository.transact(scope, async (tx) => {
          const plan = await requireActivePlan(tx, planId!);
          const result = await command<Record<string, unknown>>(tx, { body: { pendingId }, key: idempotencyKey, kind: "pending_dismiss", planId: plan.id }, async () => {
            await tx.insertLog(logEntry({ body: `step suggestion dismissed: ${stepKey}`, event: "pending_dismissed", idempotencyKey: `pending:${pendingId}:${(await tx.log(plan.id)).length}`, itemId: null, linkedContactIds: [], linkedEventId: null, payload: { kind: "step_suggestion", pendingId, stepKey }, planId: plan.id }));
            return { outcome: "applied" as const, response: { id: pendingId, status: "dismissed" } };
          });
          return result as unknown as PlanPendingDecisionResult;
        });
      }
      // memo 计分提议：确认才计分（basis memo）；手动勾选卡要 ≥2 问。
      // 复核 M1：「查是否已决定 → 计分 → 写决定」在同一个事务里；同键重放返回原结果（回执），
      // 已决定的卡换新键再决定 → 409 PENDING_DECIDED（对标 Stripe 对已 capture 的支付再 capture 报状态冲突，而不是静默成功）。
      return repository.transact(scope, async (tx) => {
        let located: { entry: PlanV2LogEntry; plan: PlanV2Row } | null = null;
        for (const plan of await tx.activePlans()) {
          const entry = (await tx.log(plan.id)).find((item) => item.id === pendingId && item.event === "memo_coverage_proposed");
          if (entry) {
            located = { entry, plan };
            break;
          }
        }
        if (!located) throw new PlanV2Error("PENDING_NOT_FOUND", "Pending item not found.");
        const { entry, plan } = located;
        const contactId = String(entry.payload.contactId ?? "");
        const itemId = entry.itemId ?? "";
        const manual = entry.payload.manual === true;
        const covered = manual ? [...new Set(answered ?? [])].sort() : ((entry.payload.answered as number[]) ?? []);
        const result = await command<Record<string, unknown>>(tx, { body: { decision, pendingId, ...(manual && decision === "accept" ? { answered: covered } : {}) }, key: idempotencyKey, kind: "pending_decision", planId: plan.id }, async () => {
          const log = await tx.log(plan.id);
          if (log.some((item) => (item.event === "pending_accepted" || item.event === "pending_dismissed") && item.payload.pendingId === pendingId)) {
            throw new PlanV2Error("PENDING_DECIDED", "This pending item has already been decided.");
          }
          let award: Record<string, unknown> | null = null;
          if (decision === "accept") {
            if (covered.length < PLAN_MEMO_COVERAGE_MIN) throw new PlanV2Error("INVALID_INPUT", "At least two of the three questions must be covered.");
            const type = await requireType(tx, plan, itemId);
            award = { ...(await scoreIn(tx, plan, type, { anonymous: false, at: now(), basis: "memo", contactId })).response, replayed: false };
          }
          const type = (await tx.typeItems(plan.id)).find((item) => item.id === itemId);
          const label = type?.shortLabel ?? "memo";
          await tx.insertLog(logEntry({ body: decision === "accept" ? `${label}：メモから記録` : `${label}：メモの提案を見送り`, event: decision === "accept" ? "pending_accepted" : "pending_dismissed", idempotencyKey: `pending:${pendingId}`, itemId, linkedContactIds: [], linkedEventId: null, payload: { kind: "memo_coverage", pendingId }, planId: plan.id }));
          return { outcome: "applied" as const, response: { award, id: pendingId, status: decision === "accept" ? "accepted" : "dismissed" } };
        });
        return result as unknown as PlanPendingDecisionResult;
      });
    },

    async contactFit(contactId) {
      const id = requiredId(contactId, "contactId");
      return repository.read(scope, async (reader) => {
        const fits: PlanContactFit["fits"][number][] = [];
        let contact: PlanV2ContactView | undefined;
        let contactRead = false;
        for (const plan of await reader.activePlans()) {
          const types = await reader.typeItems(plan.id);
          const awards = activeAwards(await reader.log(plan.id));
          const candidates = await reader.matchCandidates(types.map((type) => type.id));
          for (const type of types) {
            const talked = awards.some((entry) => entry.award.typeKey === type.personType.key && entry.award.contactId === id);
            const linked = type.contactLinks.some((link) => link.contactId === id);
            const candidate = candidates.find((item) => item.needItemId === type.id && item.contactId === id && item.status === "pending");
            const status = talked ? "talked" : linked ? "linked" : candidate ? "candidate" : null;
            if (!status) continue;
            const base = { emoji: type.personType.emoji, goal: plan.goalText, itemId: type.id, planId: plan.id, shortLabel: type.shortLabel, status } as const;
            if (status !== "candidate" || !candidate) {
              fits.push(base);
              continue;
            }
            // 复核 m3：候补给推荐度与理由（与人物类型详情的候补同一口径）。
            if (!contactRead) {
              [contact] = await reader.contactViews([id]);
              contactRead = true;
            }
            fits.push({ ...base, reason: candidate.reason ?? null, recommendScore: recommendScore(candidate, contact, now()) });
          }
        }
        return { contactId: id, fits };
      });
    },

    async proposeMemoCoverage({ contactId, memoId, coverage, manual }) {
      const id = requiredId(contactId, "contactId");
      return repository.transact(scope, async (tx) => {
        let proposed = 0;
        for (const plan of await tx.activePlans()) {
          const types = await tx.typeItems(plan.id);
          const log = await tx.log(plan.id);
          const awards = activeAwards(log);
          const candidates = await tx.matchCandidates(types.map((type) => type.id));
          for (const item of coverage) {
            const type = types.find((candidate) => candidate.id === item.itemId);
            if (!type || type.skippedAt) continue;
            // 复核 m6：只给这个类型的候补（未驳回）或已关联的人出提议；陌生人跳过（不靠调用方先筛）。
            const related = type.contactLinks.some((link) => link.contactId === id)
              || candidates.some((candidate) => candidate.needItemId === type.id && candidate.contactId === id && candidate.status !== "dismissed");
            if (!related) continue;
            if (awards.some((entry) => entry.award.typeKey === type.personType.key && entry.award.contactId === id)) continue;
            const answered = [...new Set(item.answered.filter((index) => index >= 0 && index <= 2))];
            if (!manual && answered.length < PLAN_MEMO_COVERAGE_MIN) continue;
            const key = `memo-coverage:${memoId}:${type.id}`;
            if (log.some((entry) => entry.idempotencyKey === key)) continue;
            await tx.insertLog(logEntry({ author: "system", body: manual ? `${type.shortLabel}：メモから確認（手動）` : `${type.shortLabel}：メモで ${answered.length}/3 問`, event: "memo_coverage_proposed", idempotencyKey: key, itemId: type.id, linkedContactIds: [], linkedEventId: null, payload: { answered, contactId: id, manual: manual === true, memoId }, planId: plan.id }));
            proposed += 1;
          }
        }
        return proposed;
      });
    },

    async hasActivePlan() {
      return repository.read(scope, async (reader) => (await reader.activePlans()).length > 0);
    },

    async activeTypeNeeds() {
      return repository.read(scope, async (reader) => {
        const needs: ActiveTypeNeed[] = [];
        const plans = await reader.activePlans();
        for (const plan of plans) {
          for (const type of await reader.typeItems(plan.id)) {
            needs.push({ contactLinks: type.contactLinks, description: type.roleSituation, itemId: type.id, planId: plan.id, primaryIndustryId: type.primaryIndustryId, secondaryIndustryId: type.secondaryIndustryId, skipped: Boolean(type.skippedAt), targetCount: type.targetCount, title: type.shortLabel });
          }
        }
        return { needs, plans: plans.map((plan) => ({ createdAt: plan.createdAt, goalText: plan.goalText, planId: plan.id, startsOn: plan.startsOn, updatedAt: plan.updatedAt })) };
      });
    },
  };
}

/** 东京自然日（YYYY-MM-DD）。 */
function tokyoDate(iso: string): string {
  return new Date(Date.parse(iso) + 9 * 3_600_000).toISOString().slice(0, 10);
}

export { needStatus };
