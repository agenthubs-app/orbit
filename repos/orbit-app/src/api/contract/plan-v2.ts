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

/* ------------------------------------------------------------------ */
/* R23 生成流程（目標入力 → 背景 → ≤5 問 → 前提 → 初版 → AI 修正 → 手動編集 → 確定）  */
/* ------------------------------------------------------------------ */

export type PlanIntakeStatus = "drafting" | "background" | "questions" | "premise" | "drafted" | "planned" | "abandoned";
/** AI 步骤：none 没跑；done 成功；failed 失败（可「もう一度」，不计次）；fallback 用了规则（失败降级或碰到上限）。 */
export type PlanAiStepState = "none" | "done" | "failed" | "fallback";
/** 碰到的是哪一道上限（界面显示「上限」说明而不是失败卡，DESIGN §5.3）。 */
export type PlanAiLimitKind = "daily" | "monthly";

export interface PlanAiStepView {
  state: PlanAiStepState;
  limit?: PlanAiLimitKind | null;
  retryOn?: string | null;
}

export type PlanStance = "owner" | "cofounder" | "employee" | "individual";
export type PlanMemberSource = "profile" | "network" | "manual";
export type PlanMemberRelation = "cofounder" | "employee" | "contractor" | "advisor";

export interface PlanTeamMember {
  memberId: string;
  name: string;
  /** 一行说明（「AI エンジニア · Orbit」「共同創業者 · 週末中心」）。 */
  headline: string | null;
  source: PlanMemberSource;
  relation: PlanMemberRelation | null;
  /** 只有「人脈から」的成员有。 */
  contactId: string | null;
  /** 必要な力的 id（`plan-templates` 该类 8 项之内）。 */
  capabilities: readonly string[];
  /** 「＋ その他」写的清单外能力。 */
  otherCapabilities: readonly string[];
  isSelf: boolean;
  /** 「人脈から」推定能力的一句依据。 */
  basis?: string | null;
}

export interface PlanBackgroundMe {
  name: string;
  headline: string | null;
  stance: PlanStance | null;
  wants: string;
}

export interface PlanBackgroundTeam {
  mode: "solo" | "team";
  members: readonly PlanTeamMember[];
}

export interface PlanLadderRung {
  /** 1–4，上大下小；用户原文在第 2 级。 */
  level: number;
  text: string;
}

export interface PlanBackgroundPurpose {
  rungs: readonly PlanLadderRung[];
  suggestedLevel: number | null;
  reason: string | null;
  selectedLevel: number | null;
}

export interface PlanIntakeBlock<T> {
  value: T;
  confirmedAt: string | null;
}

/** 「読んでいるもの」：AI 下书时看了什么。 */
export interface PlanReadingItem {
  kind: "profile" | "goal" | "network" | "capabilities";
  detail: string;
}

/** 选出来的一问；题干与选项文字在 `shared/compute/plan-template-copy.ts`。 */
export interface PlanIntakeQuestion {
  id: string;
  why: string;
  /** 能从背景推出的答案（作答时预选，提交时标「推測」）。 */
  guess: { values: readonly string[]; text: string | null } | null;
}

export interface PlanIntakeAnswer {
  questionId: string;
  values: readonly string[];
  text: string | null;
  guessed: boolean;
}

export interface PlanIntakeLimits {
  /** 「やりたいこと」改了之后重算阶梯还剩几次（每个目标 3 次）。 */
  ladderLeft: number;
  /** 本月还能新建几个目标（每人每月 10 个）。 */
  newGoalsLeftThisMonth: number;
}

/** `GET /api/agent/plans/intakes/[id]` 等：一条生成流程。 */
export interface PlanIntakeView {
  intakeId: string;
  status: PlanIntakeStatus;
  source: PlanIntakeSource;
  goal: string;
  goalKind: PlanGoalKindRead;
  /** 本流程的页面地址（`plan-href`）。 */
  href: string;
  reading: readonly PlanReadingItem[];
  background: {
    me: PlanIntakeBlock<PlanBackgroundMe>;
    team: PlanIntakeBlock<PlanBackgroundTeam>;
    purpose: PlanIntakeBlock<PlanBackgroundPurpose>;
  };
  questions: readonly PlanIntakeQuestion[] | null;
  answers: readonly PlanIntakeAnswer[] | null;
  premise: readonly PlanPremiseRow[] | null;
  /** 前提每改一次 +1；初版按它重做（不计修正次数）。 */
  premiseVersion: number;
  draftId: string | null;
  planId: string | null;
  aiSteps: {
    background: PlanAiStepView;
    ladder: PlanAiStepView;
    questions: PlanAiStepView;
    members: PlanAiStepView;
    draft: PlanAiStepView;
  };
  limits: PlanIntakeLimits;
  updatedAt: string;
}

export interface PlanIntakeListItem {
  intakeId: string;
  goal: string;
  goalKind: PlanGoalKindRead;
  status: PlanIntakeStatus;
  href: string;
  updatedAt: string;
}

/** `GET /api/agent/plans/intakes`：未完成的生成流程（R21 可列在会话列表）+ 新目标的余量。 */
export interface PlanIntakeListResponse {
  intakes: readonly PlanIntakeListItem[];
  newGoalsLeftThisMonth: number;
  activeGoals: number;
  activeGoalLimit: number;
}

/** 方案里一处改动（AI 修正的差分卡、手动编辑的「変更点」）。 */
export interface PlanDraftChange {
  path: string;
  label: string;
  before: string | null;
  after: string | null;
  reason?: string | null;
}

export interface PlanDraftTurn {
  n: number;
  input: string;
  changes: readonly PlanDraftChange[];
  unchanged: readonly string[];
  /** AI 判断不改时的理由（「今回は変更しません」；这次也计 1 次）。 */
  noChangeReason: string | null;
  at: string;
}

/** 方案引用的一条业界现状（已解析，界面直接显示）。 */
export interface PlanCitationView {
  id: string;
  version: number;
  title: string;
  summary: string;
  sourceLabel: string;
  sourceUrl: string;
  sourcePublishedOn: string;
  updatedOn: string;
}

/** `…/draft`、`drafts/[id]/fix` 等：一份草稿。 */
export interface PlanDraftView {
  draftId: string;
  kind: "initial" | "review";
  status: "open" | "confirmed" | "discarded";
  intakeId: string | null;
  planId: string | null;
  goal: string;
  goalKind: PlanGoalKindRead;
  purposeText: string | null;
  premise: readonly PlanPremiseRow[];
  /** 草稿里人物类型的 `itemId` = 类型 key（还没有条目）。 */
  content: PlanV2Content;
  originContent: PlanV2Content;
  citations: readonly PlanCitationView[];
  aiFixUsed: number;
  aiFixLimit: number;
  manualEditAvailable: boolean;
  turns: readonly PlanDraftTurn[];
  fix: PlanAiStepView;
  /** 乐观并发的令牌（手动编辑带回）。 */
  revision: string;
  updatedAt: string;
}

/** 确定之后：新计划与 Task › プラン 的地址。 */
export interface PlanConfirmResult {
  planId: string;
  href: string;
  archivedV1PlanId: string | null;
  replayed: boolean;
}

export interface PlanGoalKindRequest {
  text: string;
}

export interface PlanGoalKindResult {
  goalKind: PlanGoalKind;
  /** ai = 模型推测；rule = 关键词规则（失败、上限或文字太短）。 */
  source: "ai" | "rule";
}

export interface PlanIntakeCreateRequest {
  goalText: string;
  goalKind: PlanGoalKind;
  source: PlanIntakeSource;
  idempotencyKey: string;
}

export interface PlanIntakeBlockRequest {
  block: "me" | "team" | "purpose";
  me?: { stance: PlanStance; wants: string };
  team?: {
    mode: "solo" | "team";
    members: readonly { memberId: string; capabilities: readonly string[]; otherCapabilities: readonly string[]; relation: PlanMemberRelation | null }[];
  };
  purpose?: { selectedLevel: number };
  expectedUpdatedAt: string;
  idempotencyKey: string;
}

export type PlanIntakeMembersRequest =
  | { mode: "network"; contactIds: readonly string[]; idempotencyKey: string }
  | {
      mode: "manual";
      name: string;
      relation: PlanMemberRelation;
      capabilities: readonly string[];
      otherCapabilities: readonly string[];
      alsoAddToNetwork: boolean;
      idempotencyKey: string;
    };

export interface PlanIntakeLadderRequest {
  wants: string;
  idempotencyKey: string;
}

export interface PlanFlowStepRequest {
  idempotencyKey: string;
}

export interface PlanIntakeAnswersRequest {
  answers: readonly { questionId: string; values: readonly string[]; text: string | null }[];
  idempotencyKey: string;
}

export interface PlanIntakePremiseRequest {
  key: string;
  value: string;
  idempotencyKey: string;
}

export interface PlanDraftFixRequest {
  text: string;
  idempotencyKey: string;
}

/** 手动编辑：一次提交全部变更，保存即确定（「このプランで始める」）。 */
export interface PlanDraftManualEditRequest {
  expectedRevision: string;
  steps: readonly { key: string | null; title: string; doneCriteria: string; personTypeKeys: readonly string[] }[];
  /** 留下的类型（不在里面的就是移除）；`slot` 只在新加类型时给。 */
  personTypes: readonly { key: string | null; slot?: string; targetCount: number; allocation: number }[];
  event: { targetCount: number; allocation: number };
  idempotencyKey: string;
}
