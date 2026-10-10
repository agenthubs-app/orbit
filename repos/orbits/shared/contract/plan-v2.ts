/**
 * R22 计划 v2.2 契约（正式版，负责人：甲）。
 * 使用方：首页「プラン スコア」组件与小组件（R10 / R19，乙）、Task › プラン（R23–R25）、人脈（R11）、
 * iOrbit 深链（R21）、活动评分（R26）。设计：docs/designs/redesign-2026-10/sprints/plan-v2.2/DESIGN.md。
 * 只加不改（README 通用规则 10；破坏性改动先在 BREAKING.md 登记）。
 */

export type PlanGoalKind = "launch" | "fundraising" | "sales" | "hiring" | "partnership" | "career";
/** 读取时未知的目标类型落到 `unknown`：界面只显示目标文，不显示类型名和 emoji。 */
export type PlanGoalKindRead = PlanGoalKind | "unknown";
export type PlanIntakeSource = "task" | "onboarding" | "next_goal" | "iorbit";
export type PlanPremiseSource = "background" | "q1" | "q2" | "q3" | "q4" | "q5" | "record";
export type PlanAwardBasis = "talked" | "self_report" | "memo" | "event" | "skip";
export type PlanAwardPart = "base" | "overflow";
export type PlanGoalStatus = "active" | "achieved";

/** 业界现状库的一条引用。 */
export interface PlanCitation {
  id: string;
  version: number;
}

/** 「?」里展开的一条依据。 */
export interface PlanBasisRef {
  kind: "premise" | "landscape" | "record" | "template";
  ref: string;
  label: string;
}

export interface PlanV2Step {
  key: string;
  title: string;
  /** 完了の目安：写成可数的状态。 */
  doneCriteria: string;
  why: string | null;
  personTypeKeys: readonly string[];
  /** 读模型：由 `plan_log` 的 step_completed / step_reopened 推出；没完成为 null。 */
  completedAt?: string | null;
}

export interface PlanIntroRoute {
  viaContactId: string;
  why: string;
}

export interface PlanV2PersonType {
  /** `plan_items.id`。 */
  itemId: string;
  key: string;
  /** 模板枠 id。 */
  slot: string;
  /** 固定短名字典 id（`<slot>` 或 `<slot>@<industry>`）。 */
  shortLabelId: string;
  shortLabel: string;
  emoji: string;
  /** 「役割 × 状況」一句话。 */
  roleSituation: string;
  /** 配点，5 的倍数。 */
  allocation: number;
  /** 目标人数 1–5。 */
  targetCount: number;
  why: string;
  /** 聞くこと 3 問。 */
  questions: readonly string[];
  countRule: string;
  recognizeHints: readonly string[];
  persona?: string | null;
  opener?: string | null;
  introRoutes: readonly PlanIntroRoute[];
  skipped: boolean;
}

export interface PlanV2EventBlock {
  allocation: number;
  /** 目标次数 1–10。 */
  targetCount: number;
}

export interface PlanFlowCell {
  emoji: string;
  label: string;
  note: string;
}

/** 一份方案的内容（初版、修正、确定后都是这个形状）。 */
export interface PlanV2Content {
  diagnosis: string;
  conclusion: string;
  flow?: readonly PlanFlowCell[];
  steps: readonly PlanV2Step[];
  personTypes: readonly PlanV2PersonType[];
  event: PlanV2EventBlock;
  citations: readonly PlanCitation[];
  allocationReasons: readonly string[];
  basis: readonly PlanBasisRef[];
  sample?: true;
}

/** 构成条的一段（人物类型或 `event`）。 */
export interface PlanScoreSegment {
  key: string;
  shortLabel: string;
  emoji: string;
  allocation: number;
  /** 已得的 base 分（含跳过记的满额）。 */
  earned: number;
  /** 超过目标人数后的半分合计。 */
  overflow: number;
  skipped: boolean;
}

export interface PlanScoreView {
  /** 总分，整数，不封顶。 */
  total: number;
  /** 聊出来的分（含超额）。 */
  talked: number;
  /** 跳过记的分。 */
  skipped: number;
  overflow: number;
  /** 到满分 100 还差多少（不含超额）。 */
  remainingToFull: number;
  /** 东京今天新增的分。 */
  todayDelta: number;
  segments: readonly PlanScoreSegment[];
}

export interface PlanTodayChance {
  label: string;
  points: number;
  href: string;
}

/** 首页「プラン スコア」组件用的当前目标。 */
export interface PlanV2HomeSummary {
  planId: string;
  goal: string;
  goalKind: PlanGoalKindRead;
  score: PlanScoreView;
  todayChance?: PlanTodayChance | null;
  sample?: true;
}

export interface PlanGoalListItem {
  planId: string;
  goal: string;
  goalKind: PlanGoalKindRead;
  status: PlanGoalStatus;
  total: number;
  talkedPeople: number;
  lastOpenedAt?: string | null;
  sample?: true;
}

/** `GET /api/agent/plans/v2/summary`：当前目标（最近打开）+ 目标列表；没有 v2 计划时 current 为 null。 */
export interface PlanV2SummaryResponse {
  current: PlanV2HomeSummary | null;
  goals: readonly PlanGoalListItem[];
}

export interface PlanPremiseRow {
  key: string;
  label: string;
  value: string;
  source: PlanPremiseSource;
  /** 用户没答、按推测填的。 */
  guessed: boolean;
}

export interface PlanQuotaView {
  reviewLeftThisMonth: number;
  reviewMonthlyLimit: number;
  manualEditAvailable: boolean;
  activeGoals: number;
  activeGoalLimit: number;
}

/** `GET /api/agent/plans/v2/[planId]`：概要。 */
export interface PlanV2Detail {
  planId: string;
  revision: number;
  goal: string;
  goalKind: PlanGoalKindRead;
  purposeText: string | null;
  startsOn: string;
  premise: readonly PlanPremiseRow[];
  content: PlanV2Content;
  score: PlanScoreView;
  quota: PlanQuotaView;
  achievedAt: string | null;
  sample?: true;
}

/** 记一次「话过了」（有名字 / 无名字）。 */
export interface PlanAwardRequest {
  contactId?: string;
  anonymous?: true;
  at?: string;
  basis: "talked" | "self_report";
  idempotencyKey: string;
}

export interface PlanAwardResult {
  awardLogId: string | null;
  points: number;
  part: PlanAwardPart | "none";
  reason?: "skipped" | "anonymous_over_target" | "already_counted";
  score: PlanScoreView;
  replayed: boolean;
}

export interface PlanUndoRequest {
  idempotencyKey: string;
}

export interface PlanSkipRequest {
  idempotencyKey: string;
}

export interface PlanStepRequest {
  idempotencyKey: string;
}

/** 撤销、跳过、Step 完成之后的结果：新的分数（Step 另带完成时间）。 */
export interface PlanCommandResult {
  score: PlanScoreView;
  replayed: boolean;
  completedAt?: string | null;
}

/** `GET /api/agent/plans/v2`：目标列表（生效 + 已达成）。 */
export interface PlanGoalListResponse {
  goals: readonly PlanGoalListItem[];
}

/** `POST /api/agent/plans/v2/[planId]/open` 的结果。 */
export interface PlanOpenResult {
  planId: string;
}
