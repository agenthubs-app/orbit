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
import { nextAward, PLAN_EVENT_SEGMENT_KEY, skipAwardPoints, summarizePlanScore, type PlanScoreAward, type PlanScoreSlot } from "../../../shared/compute/plan-score";
import { PLAN_GOAL_KINDS } from "../../../shared/compute/plan-templates";
import { tokyoUsageMonth } from "../../ai-quota/constants";
import type {
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
  type PlanV2Transaction,
  type PlanV2TypeItem,
} from "./types";

/** 見直し的月上限（Q6：所有人按 Free）。月用量由 R25 记在 `review_used`；R22 只读出来给概要显示。 */
export const PLAN_REVIEW_MONTHLY_LIMIT = 3;

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
  recordEventAttendanceForPlans(input: { eventId: string; title?: string; at?: string }): Promise<Array<{ planId: string; points: number; part: string }>>;
  planRemainingTargets(): Promise<PlanRemainingTargets[]>;
  activeTypeNeeds(): Promise<ActiveTypeNeeds>;
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
}

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
    return summarizePlanScore({ achievedAt: plan.achievedAt, awards: activeAwards(log).map(toScoreAward), now: at, slots: scoreSlots(plan, types) });
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

  async function goalItem(reader: PlanV2Reader, plan: PlanV2Row): Promise<PlanGoalListItem> {
    const log = await reader.log(plan.id);
    const score = await scoreOf(reader, plan);
    return {
      goal: plan.goalText,
      goalKind: plan.goalKind,
      lastOpenedAt: plan.lastOpenedAt,
      planId: plan.id,
      status: plan.achievedAt ? "achieved" : "active",
      talkedPeople: talkedPeople(log),
      total: score.total,
      ...(options.sample ? { sample: true as const } : {}),
    };
  }

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

  /** 唯一键上取第一个空位（撤销后同一人同一类型可以再记）。 */
  async function freeKey(tx: PlanV2Reader, base: string): Promise<string> {
    for (let n = 1; n < 1000; n += 1) {
      const key = `${base}:${n}`;
      if (!(await tx.hasLogKey(key))) return key;
    }
    throw new Error("No free plan log key.");
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
    const score = summarizePlanScore({ achievedAt: plan.achievedAt, awards: activeAwards(log).map(toScoreAward), now: now(), slots: scoreSlots(plan, types) });
    const completed = new Map<string, string | null>();
    for (const entry of log) {
      if (entry.event === "step_completed") completed.set(String(entry.payload.stepKey), entry.createdAt);
      if (entry.event === "step_reopened") completed.set(String(entry.payload.stepKey), null);
    }
    const used = await reviewUsedThisMonth(reader);
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
        reviewLeftThisMonth: Math.max(0, PLAN_REVIEW_MONTHLY_LIMIT - used),
        reviewMonthlyLimit: PLAN_REVIEW_MONTHLY_LIMIT,
      },
      revision: plan.revision,
      score,
      startsOn: plan.startsOn,
      ...(options.sample ? { sample: true as const } : {}),
    };
  }

  async function assertContact(contactId: string) {
    if (!options.references) return;
    const missing = await options.references.findMissingContactIds([contactId]);
    if (missing.length > 0) throw new PlanV2Error("REFERENCE_NOT_FOUND", "Contact not found.");
  }

  return {
    async summary() {
      return repository.read(scope, async (reader) => {
        const goals = await reader.goalPlans();
        const items: PlanGoalListItem[] = [];
        for (const plan of goals) items.push(await goalItem(reader, plan));
        const current = goals.find((plan) => plan.status === "active");
        let home: PlanV2HomeSummary | null = null;
        if (current) {
          home = {
            goal: current.goalText,
            goalKind: current.goalKind,
            planId: current.id,
            score: await scoreOf(reader, current),
            ...(options.sample ? { sample: true as const } : {}),
          };
        }
        return { current: home, goals: items };
      });
    },

    async listGoals() {
      return repository.read(scope, async (reader) => {
        const items: PlanGoalListItem[] = [];
        for (const plan of await reader.goalPlans()) items.push(await goalItem(reader, plan));
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
        const result = await command<Record<string, unknown>>(tx, { body: { anonymous, basis: request.basis, contactId, itemId: type.id }, key: request.idempotencyKey, kind: "award", planId: plan.id }, async () => {
          const log = await tx.log(plan.id);
          const mine = activeAwards(log).filter((entry) => entry.award.typeKey === type.personType.key);
          const at = request.at ?? now();
          if (contactId && mine.some((entry) => entry.award.contactId === contactId)) {
            return { outcome: "noop" as const, response: { awardLogId: null, part: "none", points: 0, reason: "already_counted", score: await scoreOf(tx, plan) } };
          }
          const next = nextAward({ allocation: type.allocation, anonymous, awards: mine.map((entry) => entry.award), skipped: Boolean(type.skippedAt), targetCount: type.targetCount });
          if (next.part === "none") {
            return { outcome: "noop" as const, response: { awardLogId: null, part: "none", points: 0, reason: next.reason, score: await scoreOf(tx, plan) } };
          }
          const keyBase = contactId ? `score:${plan.id}:${type.personType.key}:${contactId}` : `score:${plan.id}:${type.personType.key}:anon:${request.idempotencyKey}`;
          const payload: PlanAwardPayload = { anonymous, basis: request.basis, contactId, eventId: null, part: next.part, points: next.points, typeKey: type.personType.key };
          const entry = logEntry({
            body: `${type.shortLabel}：+${next.points}`,
            createdAt: at,
            event: "score_awarded",
            idempotencyKey: await freeKey(tx, keyBase),
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
          return { outcome: "applied" as const, response: { awardLogId: entry.id, part: next.part, points: next.points, score: await scoreOf(tx, plan) } };
        });
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
            idempotencyKey: await freeKey(tx, `skip:${plan.id}:${type.personType.key}`),
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
            idempotencyKey: await freeKey(tx, `step:${plan.id}:${key}`),
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
        for (const key of step.personTypeKeys) if (!keys.includes(key)) throw new PlanV2Error("INVALID_INPUT", `Step ${step.key} names an unknown person type.`);
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

    async recordEventAttendanceForPlans({ eventId, title, at }) {
      const event = requiredId(eventId, "eventId");
      return repository.transact(scope, async (tx) => {
        const results: Array<{ planId: string; points: number; part: string }> = [];
        for (const plan of await tx.activePlans()) {
          if (plan.eventAllocation <= 0) continue;
          const key = `score:${plan.id}:${PLAN_EVENT_SEGMENT_KEY}:${event}`;
          if (await tx.hasLogKey(key)) continue;
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
