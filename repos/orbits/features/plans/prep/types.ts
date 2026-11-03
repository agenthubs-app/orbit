/**
 * R37a 计划 v3 主页「先做的事」与准备卡（plan-v3/DESIGN.md §2.5 / §3.3）。
 *
 * 存放：`plans.analysis.home`（一份 JSON；见 R37a PLANNER「自定决定」）。读出时去掉内部字段成为 `PlanHomeView`。
 * AI 的输入输出只含编号与受限文本：候选用编号（AI 不写名字），事实用 id，回答用 questionKey。
 */
import type { PlanCopyLanguage } from "../../../shared/compute/plan-template-copy";
import type { PlanHomeAction, PlanMarkedText, PlanPrepCardView, PlanPrepRef, PlanPrepRow } from "../../../shared/contract/plan-v2";
import type { PlanAiOutcome } from "../v2/ai/types";

/** 字段表上限（计划主页）。 */
export const PLAN_HOME_LIMITS = {
  actions: 3,
  candidates: 8,
  candidatesPerType: 2,
  eventCandidates: 2,
  leadChars: 40,
  titleChars: 18,
  reasonChars: 50,
  boldChars: 14,
  hookLabelChars: 12,
  hookReasonChars: 60,
  draftChars: 160,
  planFitChars: 40,
  usedFacts: 4,
  /** 生成中超过这么久没写回 = 上次中断，允许重来。 */
  pendingStaleMs: 2 * 60_000,
} as const;

export interface StoredPlanHomeAction extends Omit<PlanHomeAction, "prep"> {
  doneAt: string | null;
  prep: PlanPrepCardView | null;
  /** 该卡的重新生成次数（幂等键序号）。 */
  regenerations: number;
  /** 最近一次重新生成请求的幂等键（同键重放直接返回现状）。 */
  lastRegenerateKey?: string;
}

export interface StoredPlanHome {
  version: 1;
  state: "pending" | "ready" | "failed";
  startedAt: string;
  updatedAt: string;
  /** 生成时的候选签名（排序后的候选 key）；候选变了且上次为空时允许补生成。 */
  candidateSignature: string;
  lead: string | null;
  actions: StoredPlanHomeAction[];
  /** 初次生成已用掉的 AI 调用（挑选 + 准备卡），≤ `PLAN_PREP_INITIAL_CARDS_LIMIT`。 */
  initialCalls: number;
}

/** 规则列出的一个候选（编号 = 下标 + 1）。 */
export interface PlanHomeCandidate {
  key: string;
  kind: "contact" | "event";
  contactId: string | null;
  eventId: string | null;
  typeKey: string | null;
  typeLabel: string | null;
  stepNumber: number;
  /** 给 AI 看的一行（职位 · 公司 / 活动名 · 日期 · 地点）；不含名字。 */
  summary: string;
  avatar: string;
  meta: string;
}

/** 准备卡生成用的联系人资料（系统字段）。 */
export interface PlanPrepContactCard {
  id: string;
  name: string;
  organization: string | null;
  role: string | null;
  industry: string | null;
  createdAt: string | null;
  /** 怎么认识：来源标签（「名片」「手动添加」…）与关联活动名。 */
  sourceLabel: string | null;
  sourceEventTitle: string | null;
  lastInteractionAt: string | null;
  lastInteractionLabel: string | null;
}

export interface PlanPrepEventCard {
  id: string;
  title: string;
  startsAt: string;
  venue: string | null;
  about: string | null;
}

export interface PlanPrepProfile {
  name: string;
  organization: string | null;
  role: string | null;
  homeMarket: string | null;
  spokenLanguages: readonly string[];
  industry: string | null;
}

export interface PlanPrepFact {
  id: string;
  text: string;
  date: string | null;
  memoId: string | null;
}

/** 生成准备卡需要的外部数据（live 读库；mock / 测试给固定值）。 */
export interface PlanPrepContext {
  profile(actorId: string): Promise<PlanPrepProfile>;
  contacts(actorId: string, ids: readonly string[]): Promise<PlanPrepContactCard[]>;
  facts(actorId: string, contactId: string): Promise<PlanPrepFact[]>;
}

/* ---------- AI 输入输出 ---------- */

export interface PlanPickInput {
  language: PlanCopyLanguage;
  goal: string;
  outcome: string | null;
  stage: { number: number; title: string; doneCriteria: string };
  answers: ReadonlyArray<{ key: string; label: string; value: string }>;
  candidates: ReadonlyArray<{ no: number; kind: "contact" | "event"; typeLabel: string | null; stepNumber: number; summary: string }>;
}

export interface PlanPickOutput {
  lead: string | null;
  picks: Array<{ no: number; title: string; reason: string; bold: string | null }>;
}

export interface PlanPrepCardInput {
  language: PlanCopyLanguage;
  goal: string;
  outcome: string | null;
  kind: "contact" | "event";
  typeLabel: string | null;
  questions: readonly string[];
  /** 名片 / 活动页 / 你的资料：`key` 是开场白 `card` 引用的字段名。 */
  fields: ReadonlyArray<{ key: string; label: string; value: string }>;
  facts: ReadonlyArray<{ id: string; text: string; date: string | null }>;
  answers: ReadonlyArray<{ key: string; label: string; value: string }>;
  /**
   * R38-01：用户和这个人见过没有（系统判断，不让 AI 猜）。`met` = 扫过名片 / 有关联活动 / 有联系记录 / 用户记过关于他的备注（事实）；`unknown` = 只是加进了人脉；
   * 活动卡为 `event`。`met` 时开场白不许用「初次见面」类问候。
   */
  relationship: "met" | "unknown" | "event";
}

/** 开场白按句给：每句带画线片段与出处。服务端逐句对账后拼成 `PlanPrepDraft`。 */
export interface PlanPrepCardOutput {
  hook: { label: string; reason: string };
  usedFacts: string[];
  usedAnswers: string[];
  sentences: Array<{ text: string; underlines: Array<{ text: string; ref: PlanPrepRef }> }>;
  planFit: string | null;
}

export interface PlanPrepAiContext {
  actorId: string;
  language: PlanCopyLanguage;
  now: Date;
  ledgerKey: string;
  /** `plan` = 初次生成（只记账）；`manual` = 用户点重新生成（计入每日 15 次）。 */
  trigger: "plan" | "manual";
}

export interface PlanPrepAi {
  readonly id: "mock" | "deepseek" | "disabled";
  pick(input: PlanPickInput, context: PlanPrepAiContext): Promise<PlanAiOutcome<PlanPickOutput>>;
  card(input: PlanPrepCardInput, context: PlanPrepAiContext): Promise<PlanAiOutcome<PlanPrepCardOutput>>;
}

export type { PlanMarkedText, PlanPrepRow };
