/**
 * R22 计划 v2.2 的服务端内部类型（DESIGN §3）。对外形状在 `shared/contract/plan-v2.ts`；这里是行与服务接口。
 *
 * - 一个目标一行 `plans`（model_version = 2），生命周期内原地更新（`revision` 只因方案内容改变 +1）；
 * - 人物类型 = `plan_items.kind = 'network_need'`（`allocation`、`skipped_at`、`type_slot`，长文本在 `meta.personType`）；
 * - イベント枠 = `plans.event_allocation / event_target_count`，参加过的活动仍是 `kind = 'event'` 条目；
 * - 分数 = `plan_log` 的 `score_awarded` 减去被 `score_reversed` 对冲的记录（记账式，DESIGN §4.2）。
 */
import type {
  PlanLegacyDetail,
  PlanAiLimitKind,
  PlanAiStepState,
  PlanBackgroundMe,
  PlanBackgroundPurpose,
  PlanBackgroundTeam,
  PlanDraftTurn,
  PlanIntakeAnswer,
  PlanIntakeBlock,
  PlanIntakeQuestion,
  PlanIntakeSource,
  PlanIntakeStatus,
  PlanReadingItem,
  PlanV2Content,
  PlanV2PersonType,
  PlanAwardBasis,
  PlanAwardPart,
  PlanBasisRef,
  PlanCitation,
  PlanFlowCell,
  PlanGoalKind,
  PlanIntroRoute,
  PlanPremiseRow,
  PlanV2Step,
} from "../../../shared/contract/plan-v2";
import type { IndustryIdCode, SecondaryIndustryIdCode } from "../../../shared/contract/industries";
import type { PlanContactLink } from "../contract";

export const PLAN_V2_GOAL_LIMIT = 2;

/** `plan_log.event` 的 v2 取值（数据库不约束，服务层校验）。 */
export const PLAN_V2_LOG_EVENTS = [
  "plan_created",
  "score_awarded",
  "score_reversed",
  "step_completed",
  "step_reopened",
  "plan_revised",
  "review_used",
  "goal_achieved",
  // R24：面谈メモ判定的计分提议（确认卡）、待确认项的确认 / 驳回。
  "memo_coverage_proposed",
  "pending_accepted",
  "pending_dismissed",
] as const;
export type PlanV2LogEvent = (typeof PLAN_V2_LOG_EVENTS)[number];

/** `plans.analysis`（schemaVersion 2）：方案里除 Step、人物类型、イベント枠以外的部分。 */
export interface PlanV2Analysis {
  schemaVersion: 2;
  diagnosis: string;
  conclusion: string;
  flow?: PlanFlowCell[];
  citations: PlanCitation[];
  allocationReasons: string[];
  basis: PlanBasisRef[];
  sample?: true;
}

export interface PlanV2Row {
  id: string;
  version: number;
  status: "active" | "archived";
  goalId: string;
  goalText: string;
  goalKind: PlanGoalKind;
  purposeText: string | null;
  purposeLevel: number | null;
  premise: PlanPremiseRow[];
  analysis: PlanV2Analysis;
  /** Step（不含完成状态，完成由 `plan_log` 推出）。 */
  steps: Array<Omit<PlanV2Step, "completedAt">>;
  eventAllocation: number;
  eventTargetCount: number;
  revision: number;
  manualEditAvailable: boolean;
  startsOn: string;
  creationKey: string | null;
  achievedAt: string | null;
  lastOpenedAt: string | null;
  createdAt: string;
  updatedAt: string;
  archivedAt: string | null;
}

/** `plan_items.meta.personType`。 */
export interface PlanV2PersonTypeMeta {
  key: string;
  shortLabelId: string;
  emoji: string;
  why: string;
  questions: string[];
  countRule: string;
  recognizeHints: string[];
  persona: string | null;
  opener: string | null;
  introRoutes: PlanIntroRoute[];
}

export interface PlanV2TypeItem {
  id: string;
  planId: string;
  /** 固定短名（显示用）。 */
  shortLabel: string;
  /** 「役割 × 状況」一句话。 */
  roleSituation: string;
  slot: string;
  /** 规则匹配用的行业条件（R23 的初版给出；没有为 null）。 */
  primaryIndustryId: IndustryIdCode | null;
  secondaryIndustryId: SecondaryIndustryIdCode | null;
  allocation: number;
  targetCount: number;
  skippedAt: string | null;
  contactLinks: PlanContactLink[];
  sortKey: number;
  personType: PlanV2PersonTypeMeta;
  createdAt: string;
  updatedAt: string;
}

export interface PlanV2EventItem {
  id: string;
  planId: string;
  eventId: string;
  title: string;
  status: "recommended" | "registered" | "attended";
  sortKey: number;
  createdAt: string;
  updatedAt: string;
}

export interface PlanV2LogEntry {
  id: string;
  planId: string;
  itemId: string | null;
  event: PlanV2LogEvent;
  author: "user" | "system";
  body: string;
  linkedContactIds: string[];
  linkedEventId: string | null;
  payload: Record<string, unknown>;
  idempotencyKey: string;
  createdAt: string;
}

/** `score_awarded` 的 payload。 */
export interface PlanAwardPayload {
  typeKey: string;
  part: PlanAwardPart;
  basis: PlanAwardBasis;
  points: number;
  anonymous: boolean;
  contactId: string | null;
  eventId: string | null;
}

export interface PlanFlowReceipt {
  idempotencyKey: string;
  kind: string;
  planId: string | null;
  /** R23：生成流程的回执带 intake / 草稿。 */
  intakeId?: string | null;
  draftId?: string | null;
  fingerprint: string;
  outcome: "applied" | "noop";
  response: Record<string, unknown>;
  createdAt: string;
}

export interface PlanV2Scope {
  workspaceId: string;
  actorId: string;
}

export interface PlanV2Reader {
  plan(planId: string): Promise<PlanV2Row | null>;
  planByCreationKey(creationKey: string): Promise<PlanV2Row | null>;
  /** 生效中的 v2 计划（最多 2 份），按最近打开、再按创建时间倒序。 */
  activePlans(): Promise<PlanV2Row[]>;
  /** 生效与已达成的 v2 计划（目标列表用）。 */
  goalPlans(): Promise<PlanV2Row[]>;
  typeItems(planId: string): Promise<PlanV2TypeItem[]>;
  eventItems(planId: string): Promise<PlanV2EventItem[]>;
  /** 这份计划里的计分、Step 等 v2 记录（按时间正序）。 */
  log(planId: string): Promise<PlanV2LogEntry[]>;
  hasLogKey(idempotencyKey: string): Promise<boolean>;
  flowReceipt(idempotencyKey: string): Promise<PlanFlowReceipt | null>;
  /** R23：某类回执在某时刻之后的条数（C1 每日 20 次）。 */
  countFlowReceipts(kind: string, sinceIso: string): Promise<number>;
  intake(intakeId: string): Promise<PlanIntakeRow | null>;
  /** 未完成的生成流程（不含 planned / abandoned），按更新时间倒序。 */
  openIntakes(): Promise<PlanIntakeRow[]>;
  /** 某时刻之后新建的生成流程数（每月新目标 10 个）。 */
  countIntakesSince(sinceIso: string): Promise<number>;
  draft(draftId: string): Promise<PlanDraftRow | null>;
  /** R25：这份计划进行中的見直し / 手动编辑草稿（最多一份）。 */
  openReviewDraft(planId: string): Promise<PlanDraftRow | null>;
  /** R24：这些人物类型的匹配候补（待确认与已决定）。 */
  matchCandidates(itemIds: readonly string[]): Promise<PlanV2MatchCandidate[]>;
  /** R24：本人的联系人（名字、公司、职位、最后互动；他人的、已删除的不返回）。 */
  contactViews(contactIds: readonly string[]): Promise<PlanV2ContactView[]>;
  /** R24：按姓名找本人的联系人（线下聊过「この人ですか？」）。 */
  findContactsByName(name: string, limit: number): Promise<PlanV2ContactView[]>;
  maxVersion(): Promise<number>;
  /** 本人生效中的 v1 计划 id（没有为 null）。 */
  activeV1PlanId(): Promise<string | null>;
  /** R25：本人的 v1 计划只读摘要（新的在前，含条目）。 */
  legacyPlans(): Promise<PlanLegacyDetail[]>;
}

export interface PlanV2Transaction extends PlanV2Reader {
  insertPlan(plan: PlanV2Row): Promise<void>;
  updatePlan(plan: PlanV2Row): Promise<void>;
  /** 归档本人生效中的 v1 计划（确定第一份 v2 时）；返回被归档的 id。 */
  archiveActiveV1(at: string): Promise<string | null>;
  insertTypeItems(items: readonly PlanV2TypeItem[]): Promise<void>;
  updateTypeItem(item: PlanV2TypeItem): Promise<void>;
  insertEventItem(item: PlanV2EventItem): Promise<void>;
  updateEventItem(item: PlanV2EventItem): Promise<void>;
  insertLog(entry: PlanV2LogEntry): Promise<void>;
  insertFlowReceipt(receipt: PlanFlowReceipt): Promise<void>;
  insertIntake(intake: PlanIntakeRow): Promise<void>;
  updateIntake(intake: PlanIntakeRow): Promise<void>;
  insertDraft(draft: PlanDraftRow): Promise<void>;
  updateDraft(draft: PlanDraftRow): Promise<void>;
  /** R25：見直し / 手动编辑确定时移除没有得分的人物类型。 */
  deleteTypeItem(itemId: string): Promise<void>;
  /** R25：方案内容改变的一版（plan_revisions）。 */
  insertRevision(revision: PlanV2RevisionRow): Promise<void>;
  /** R24：候补 CAS（只有 pending 能变）；返回变更后的候补，已决定的返回现状，不存在为 null。 */
  decideMatchCandidate(candidateId: string, status: "accepted" | "dismissed", at: string): Promise<PlanV2MatchCandidate | null>;
}

export interface PlanV2Repository {
  transact<T>(scope: PlanV2Scope, operation: (tx: PlanV2Transaction) => Promise<T>): Promise<T>;
  read<T>(scope: PlanV2Scope, operation: (reader: PlanV2Reader) => Promise<T>): Promise<T>;
}

/* ------------------------------------------------------------------ */
/* R23 生成流程的行（`plan_intakes` / `plan_drafts`）                    */
/* ------------------------------------------------------------------ */

/** 一个 AI 步骤的状态机（DESIGN §5.1）：只有 none 和用户主动「もう一度」的 failed 才发起调用。 */
export interface PlanFlowStepRecord {
  state: PlanAiStepState;
  limit: PlanAiLimitKind | null;
  retryOn: string | null;
  /** 发起过几次（「もう一度」的幂等键序号）。 */
  attempts: number;
  operationId: string | null;
  at: string | null;
}

/** `plan_intakes.ai_steps`：各步骤状态 + 流程计数。 */
export interface PlanIntakeAiSteps {
  background: PlanFlowStepRecord;
  ladder: PlanFlowStepRecord;
  questions: PlanFlowStepRecord;
  members: PlanFlowStepRecord;
  draft: PlanFlowStepRecord;
  /** 「やりたいこと」改后重算阶梯用了几次（每 intake ≤3）。 */
  ladderCount: number;
  premiseVersion: number;
  draftId: string | null;
}

/** `plan_intakes.background`。 */
export interface PlanIntakeBackground {
  me: PlanIntakeBlock<PlanBackgroundMe> | null;
  team: PlanIntakeBlock<PlanBackgroundTeam> | null;
  purpose: PlanIntakeBlock<PlanBackgroundPurpose> | null;
  reading: PlanReadingItem[];
}

export interface PlanIntakeQuestionsState {
  items: PlanIntakeQuestion[];
  skipped: Array<{ id: string; reason: string }>;
  cacheKey: string;
}

export interface PlanIntakeRow {
  id: string;
  source: PlanIntakeSource;
  goalText: string;
  goalKind: PlanGoalKind;
  status: PlanIntakeStatus;
  background: PlanIntakeBackground;
  questions: PlanIntakeQuestionsState | null;
  answers: PlanIntakeAnswer[] | null;
  premise: PlanPremiseRow[] | null;
  aiSteps: PlanIntakeAiSteps;
  planId: string | null;
  createdAt: string;
  updatedAt: string;
}

/** 草稿里的人物类型：还没有条目，`itemId` = key；可带行业条件（规则匹配用）。 */
export type PlanDraftPersonType = Omit<PlanV2PersonType, "skipped"> & {
  primaryIndustryId?: IndustryIdCode | null;
  secondaryIndustryId?: SecondaryIndustryIdCode | null;
};

export interface PlanDraftContent extends Omit<PlanV2Content, "personTypes" | "sample"> {
  personTypes: PlanDraftPersonType[];
}

export interface PlanDraftRow {
  id: string;
  kind: "initial" | "review";
  intakeId: string | null;
  planId: string | null;
  baseRevision: number | null;
  status: "open" | "confirmed" | "discarded";
  content: PlanDraftContent;
  originContent: PlanDraftContent;
  premise: PlanPremiseRow[];
  aiFixUsed: number;
  manualEditUsed: boolean;
  turns: PlanDraftTurn[];
  /** 这份草稿基于第几版前提（存在 content 的 `_meta` 里）。 */
  premiseVersion: number;
  fix: PlanFlowStepRecord;
  createdAt: string;
  updatedAt: string;
  confirmedAt: string | null;
}

/* ------------------------------------------------------------------ */
/* R24 候补与联系人投影                                                  */
/* ------------------------------------------------------------------ */

export interface PlanV2MatchCandidate {
  id: string;
  needItemId: string;
  contactId: string;
  tier: "rule" | "ai";
  strength: "strong" | "candidate";
  reason: string | null;
  status: "pending" | "accepted" | "dismissed";
  createdAt: string;
}

export interface PlanV2ContactView {
  id: string;
  name: string;
  organization: string | null;
  role: string | null;
  lastInteractionAt: string | null;
  /** 对方也是 Orbit 用户（联系人关联了账户）。 */
  isOrbitUser: boolean;
}

/** R25：`plan_revisions` 一行。 */
export interface PlanV2RevisionRow {
  id: string;
  planId: string;
  fromRevision: number;
  toRevision: number;
  source: "review" | "manual_edit" | "goal_edit" | "undo";
  draftId: string | null;
  before: Record<string, unknown>;
  after: Record<string, unknown>;
  changes: unknown[];
  createdAt: string;
}
