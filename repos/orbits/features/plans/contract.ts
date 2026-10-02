/**
 * 计划的结构化存储（RW-09，Sprint W0007）：类型、常量与状态机。
 *
 * 一份计划 = `plans` 一行（版本、生效／归档、目标快照、期限、起始日、分析、阶段）
 * + 若干 `plan_items`（四类：行动、人脉需求、要获得的信息、活动）
 * + `plan_log` 进展记录（自动 auto／手动 manual，结构化引用联系人／活动／条目）。
 *
 * 后续 Sprint 的依赖约定：
 * - W0008 生成计划时调用 `createVersion`；`basePlanId: null` 表示「只在没有生效计划时创建」，
 *   `creationKey` 让同一次生成重复提交只保存一份。
 * - W0009 周次以 `startsOn` 为第 1 周；「已延后 N 周」由 `suggestedWeek` 与当前周推导，
 *   手动延后另有 `defer_action`（`deferralCount` 计次）。
 * - W0010／W0012／W0015 通过 `updateItem` 的 `idempotencyKey` 幂等写状态与 auto 记录；
 *   引用只读结构化字段（`linkedContactIds`／`linkedEventId`／`targetItemId`），不从 `body` 反解。
 */
import type {
  IndustryIdCode,
  SecondaryIndustryIdCode,
} from "../../shared/contract/industries";
import type { PlanWeeklySummary } from "./weekly-summary";

/** 与目标编辑器的期限键一致（`goal-editor-model.ts` 的 `GoalHorizon`）：一个月内／3 个月内／一年内。 */
export const PLAN_HORIZONS = ["month", "quarter", "year"] as const;
export type PlanHorizon = (typeof PLAN_HORIZONS)[number];

export const PLAN_STATUSES = ["active", "archived"] as const;
export type PlanStatus = (typeof PLAN_STATUSES)[number];

export const PLAN_ITEM_KINDS = ["action", "network_need", "info", "event"] as const;
export type PlanItemKind = (typeof PLAN_ITEM_KINDS)[number];

export const ACTION_STATUSES = ["not_started", "in_progress", "done"] as const;
export type ActionStatus = (typeof ACTION_STATUSES)[number];

/** 人脉需求的条目状态由联系人关联推导：有人已建立联系 → established；有人已关联 → linked；否则 open。 */
export const NETWORK_NEED_STATUSES = ["open", "linked", "established"] as const;
export type NetworkNeedStatus = (typeof NETWORK_NEED_STATUSES)[number];

/** 信息的状态由答案推导：有答案 → answered。 */
export const INFO_STATUSES = ["open", "answered"] as const;
export type InfoStatus = (typeof INFO_STATUSES)[number];

export const EVENT_ITEM_STATUSES = ["recommended", "registered", "attended"] as const;
export type EventItemStatus = (typeof EVENT_ITEM_STATUSES)[number];

export type PlanItemStatus = ActionStatus | NetworkNeedStatus | InfoStatus | EventItemStatus;

export const PLAN_ITEM_STATUSES_BY_KIND: Readonly<Record<PlanItemKind, readonly PlanItemStatus[]>> = {
  action: ACTION_STATUSES,
  event: EVENT_ITEM_STATUSES,
  info: INFO_STATUSES,
  network_need: NETWORK_NEED_STATUSES,
};

/** 联系人与人脉需求（或行动）的两级关联：已关联 → 已建立联系。 */
export const CONTACT_LINK_STATES = ["linked", "established"] as const;
export type ContactLinkState = (typeof CONTACT_LINK_STATES)[number];

/**
 * 可由用户直接设置状态的两类条目的合法转移。人脉需求与信息的状态是推导出来的，不接受直接设置。
 * - 行动：未开始 → 进行中 → 完成；未开始可直接完成（打勾）；完成可撤销回未开始（取消勾选）。
 * - 活动：推荐 → 已报名 → 已参加；取消报名 已报名 → 推荐。已参加是终态。
 */
export const ACTION_TRANSITIONS: Readonly<Record<ActionStatus, readonly ActionStatus[]>> = {
  done: ["not_started"],
  in_progress: ["done"],
  not_started: ["in_progress", "done"],
};

export const EVENT_ITEM_TRANSITIONS: Readonly<Record<EventItemStatus, readonly EventItemStatus[]>> = {
  attended: [],
  recommended: ["registered"],
  registered: ["attended", "recommended"],
};

/** 联系人关联的合法转移：（无）→ 已关联 → 已建立联系；只有「已关联」可以取消。 */
export const CONTACT_LINK_TRANSITIONS = {
  establish: { from: "linked", to: "established" },
  link: { from: null, to: "linked" },
  unlink: { from: "linked", to: null },
} as const;

export const PLAN_LOG_KINDS = ["auto", "manual"] as const;
export type PlanLogKind = (typeof PLAN_LOG_KINDS)[number];

/**
 * 进展记录的事件类型。数据库不约束取值（后续 Sprint 会追加，如「进入新阶段」），
 * 由本常量和服务层校验。manual 记录一律是 `note`。
 */
export const PLAN_LOG_EVENTS = [
  "plan_created",
  "item_status_changed",
  "contact_linked",
  "contact_established",
  "contact_unlinked",
  "answer_updated",
  "action_deferred",
  /** W0012：计划进入新阶段（第 2 段起）；一年期同时补充该阶段的周级行动。每份计划每个阶段只一条。 */
  "phase_entered",
  /** W0048b：AI 计划第 3 段起的骨架阶段由 `plan-phase` 维护任务补细。每份计划每个阶段只一条（幂等键 `plan-refine:<planId>:<phaseIndex>`）。 */
  "phase_refined",
  "note",
] as const;
export type PlanLogEvent = (typeof PLAN_LOG_EVENTS)[number];

/** 记录由谁写入：用户操作（含手动记录）或系统（生成新版本、后续的自动生产者）。 */
export const PLAN_LOG_AUTHORS = ["user", "system"] as const;
export type PlanLogAuthor = (typeof PLAN_LOG_AUTHORS)[number];

export const PLAN_LIMITS = {
  answerLength: 4000,
  bodyLength: 2000,
  detailLength: 4000,
  goalLength: 2000,
  idLength: 200,
  itemsPerPlan: 300,
  logPageSize: 50,
  maxWeek: 60,
  phasesPerPlan: 12,
  titleLength: 500,
} as const;

export interface PlanPhase {
  /** 计划内唯一；条目用 `phaseKey` 引用。 */
  key: string;
  title: string;
  /** 以 `startsOn` 所在周为第 1 周；一年期的季度段同样用周次表示区间。 */
  startWeek: number;
  endWeek: number;
  granularity: "week" | "quarter";
  summary: string | null;
}

export interface NetworkNeedCriteria {
  primaryIndustryId: IndustryIdCode | null;
  secondaryIndustryId: SecondaryIndustryIdCode | null;
  titleKeywords: string[];
  description: string | null;
  /** W0048b：要认识几位（1–5）；缺省按 1（W0050 覆盖度用）。 */
  targetCount?: number;
}

export interface PlanContactLink {
  contactId: string;
  state: ContactLinkState;
  linkedAt: string;
  establishedAt: string | null;
}

export interface Plan {
  id: string;
  version: number;
  status: PlanStatus;
  goalSnapshot: string;
  horizon: PlanHorizon;
  /** YYYY-MM-DD，第 1 周的起点。 */
  startsOn: string;
  analysis: Record<string, unknown>;
  phases: PlanPhase[];
  sourceSessionId: string | null;
  previousPlanId: string | null;
  createdAt: string;
  updatedAt: string;
  archivedAt: string | null;
}

export interface PlanItem {
  id: string;
  planId: string;
  kind: PlanItemKind;
  /** 所属阶段；从旧版本带入、而新版本没有同名阶段时为 null。 */
  phaseKey: string | null;
  title: string;
  detail: string | null;
  suggestedWeek: number | null;
  status: PlanItemStatus;
  /** 按关联时间正序；`linkedContactIds` 是同一份数据的 id 列表（便于按联系人查询）。 */
  contactLinks: PlanContactLink[];
  linkedContactIds: string[];
  linkedEventId: string | null;
  answer: string | null;
  criteria: NetworkNeedCriteria | null;
  sortKey: number;
  deferralCount: number;
  completedAt: string | null;
  /** 从上一版本带入时指向旧条目。 */
  carriedFromItemId: string | null;
  meta: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export interface PlanLogEntry {
  id: string;
  planId: string;
  /** 这条记录所属的条目（auto：发生变化的条目；manual：用户挂在哪个条目下）。 */
  itemId: string | null;
  kind: PlanLogKind;
  event: PlanLogEvent;
  author: PlanLogAuthor;
  /** 兜底展示文字（中文）；界面应按 `event` 与结构化引用本地化。 */
  body: string;
  linkedContactIds: string[];
  linkedEventId: string | null;
  /** 另一个被引用的条目（如由某个人脉需求生成的「约 TA」行动）。 */
  targetItemId: string | null;
  fromStatus: string | null;
  toStatus: string | null;
  payload: Record<string, unknown>;
  idempotencyKey: string;
  createdAt: string;
}

export interface PlanSnapshot {
  plan: Plan;
  items: PlanItem[];
  /** 最近的进展记录，新的在前（最多 `PLAN_LIMITS.logPageSize` 条）。 */
  log: PlanLogEntry[];
}

/**
 * W0021：页面读取（iOrbit 首页、「我的计划」页）用的计划投影——只含界面实际用到的列。
 * 完整的 `PlanSnapshot` 是它的超集（结构类型可直接赋值），写接口返回的完整条目照常合并进来。
 * 数据库出站按列计，这些投影在 SQL 层就只选这些列（`repository.ts` 的 *_VIEW_COLUMNS）。
 */
export type PlanView = Omit<Plan, "previousPlanId" | "sourceSessionId" | "archivedAt" | "updatedAt">;
export type PlanViewItem = Omit<PlanItem, "planId" | "createdAt" | "updatedAt" | "carriedFromItemId">;
export type PlanViewLogEntry = Omit<PlanLogEntry, "planId" | "author" | "targetItemId" | "fromStatus" | "idempotencyKey">;

export interface PlanViewSnapshot {
  plan: PlanView;
  items: PlanViewItem[];
  /** 最近的进展记录，新的在前；首页读取（`includeLog: false`）为空数组。 */
  log: PlanViewLogEntry[];
}

export interface NewPlanItemInput {
  kind: PlanItemKind;
  phaseKey?: string | null;
  title: string;
  detail?: string | null;
  suggestedWeek?: number | null;
  /** 初始状态：行动只能 not_started；活动可 recommended／registered；另两类由数据推导，不接受。 */
  status?: PlanItemStatus;
  /** 人脉需求：初始已关联的联系人；行动：相关联系人（如「约 TA」）。 */
  contactIds?: string[];
  linkedEventId?: string | null;
  answer?: string | null;
  criteria?: Partial<NetworkNeedCriteria> | null;
  /** 新条目取代上一版本的哪个条目（同类）；其完成状态、答案、联系人按规则并入。 */
  inheritsFromItemId?: string | null;
  meta?: Record<string, unknown>;
}

export interface CreatePlanVersionInput {
  goalSnapshot: string;
  horizon: PlanHorizon;
  startsOn: string;
  analysis?: Record<string, unknown>;
  phases: Array<Omit<PlanPhase, "summary"> & { summary?: string | null }>;
  items: NewPlanItemInput[];
  sourceSessionId?: string | null;
  /**
   * 乐观并发：string = 必须等于当前生效计划 id；null = 必须当前没有生效计划；
   * 省略 = 不检查（直接取代当前生效计划）。
   */
  basePlanId?: string | null;
  /** 同一 key 重复创建时返回已保存的那一份，不再生成新版本。 */
  creationKey?: string | null;
}

export type PlanItemChange =
  | { op: "set_status"; status: PlanItemStatus }
  | { op: "link_contact"; contactId: string }
  | { op: "establish_contact"; contactId: string }
  | { op: "unlink_contact"; contactId: string }
  | { op: "set_answer"; answer: string | null }
  | { op: "defer_action"; toWeek: number };

export const PLAN_ITEM_CHANGE_OPS = [
  "set_status",
  "link_contact",
  "establish_contact",
  "unlink_contact",
  "set_answer",
  "defer_action",
] as const;

export interface UpdatePlanItemInput {
  itemId: string;
  change: PlanItemChange;
  /**
   * 命令回执：带 key 的请求（包括「与当前状态相同」的无变化请求）都在同一事务里记下回执，
   * 绑定条目与请求指纹。同 key 同请求 → 返回第一次的结果（replayed: true，不再写库）；
   * 同 key 不同请求 → `IDEMPOTENCY_KEY_REUSED`（409）。被拒绝的请求（非法转移等）不写回执。
   */
  idempotencyKey?: string | null;
}

export interface UpdatePlanItemResult {
  item: PlanItem;
  log: PlanLogEntry | null;
  replayed: boolean;
}

export interface AddManualLogInput {
  body: string;
  itemId?: string | null;
  targetItemId?: string | null;
  linkedContactIds?: string[];
  linkedEventId?: string | null;
  idempotencyKey?: string | null;
}

/** W0010：由人脉需求关联生成的「约 TA」行动在 `meta.source` 上的标记。 */
export const PLAN_MATCH_ACTION_SOURCE = "network_match";

/**
 * W0010：把联系人关联到人脉需求（确认匹配候选或手动关联），并在本周生成「约 TA」行动。
 * 同一需求 + 同一联系人只生成一条行动；重复提交（含同一幂等键回放）不再写库。
 * W0023：计划已过最后一周时只记关联和进展记录、不生成行动（`action: null`）；
 * 下一份计划（或重新分析）在新版本当周为这对生成「约 TA」。
 */
export interface LinkNeedContactInput {
  needItemId: string;
  contactId: string;
  /** 行动标题里的称呼（服务端按本人联系人解析后传入）；缺省为「TA」。 */
  contactName?: string | null;
  idempotencyKey?: string | null;
}

export interface LinkNeedContactResult {
  need: PlanItem;
  /**
   * 这一对的「约 TA」行动。W0023：计划已到期、到期前也没生成过时为 null
   * （只记了关联；下一份计划再安排）。
   */
  action: PlanItem | null;
  /** 这次真实关联时写的 auto 记录（`contact_linked`，`targetItemId` 指向行动，没有行动时为 null）；已关联时为 null。 */
  log: PlanLogEntry | null;
  replayed: boolean;
}

/** W0010：「约 TA」行动上的「记一次互动」：写一条互动记录、需求上的联系人变为已建立联系、行动完成。 */
export interface RecordInteractionInput {
  actionItemId: string;
  idempotencyKey?: string | null;
}

export interface RecordInteractionResult {
  action: PlanItem;
  need: PlanItem | null;
  entry: PlanLogEntry;
  replayed: boolean;
}

/**
 * W0010：确认／忽略一条匹配候选。一个按 actor 串行的事务里锁住候选、严格 CAS（只从 pending 转出），
 * 接受时同一事务关联联系人并生成「约 TA」行动。输掉并发的一方 `MATCH_ALREADY_DECIDED`（409）；
 * 同一决定重复提交回放现状（`replayed: true`）。
 */
export interface DecideMatchCandidateInput {
  candidateId: string;
  decision: "accept" | "dismiss";
  contactName?: string | null;
}

export interface DecideMatchCandidateResult {
  candidateId: string;
  status: "accepted" | "dismissed";
  link: LinkNeedContactResult | null;
  replayed: boolean;
}

/**
 * W0015：名片确认时核实「在已报名的活动 X 认识」后，把本人生效计划里对应活动（`linkedEventId`）
 * 标为已参加。状态只按 `EVENT_ITEM_TRANSITIONS` 推进：已报名 → 已参加；只是「推荐」时（服务端已核实
 * 本人报名了这场）内部先经过「已报名」。无论从哪一状态出发，只写一条「参加活动」进展记录。
 * 已参加是终态，重复调用不再写库；没有生效计划或计划里没有这场活动时什么都不做（`item: null`）。
 */
export interface MarkEventAttendedInput {
  eventId: string;
}

export interface MarkEventAttendedResult {
  item: PlanItem | null;
  /** 这次真实写入的 auto 记录（0 或 1 条）。 */
  logs: PlanLogEntry[];
}

/**
 * W0012：活动报名／取消报名后，本人生效计划里对应活动（`linkedEventId`）跟着变：
 * 报名 推荐 → 已报名；取消 已报名 → 推荐（W0007 的回退迁移）。已参加是终态，不再变。
 * 每次真实变化写一条 auto 记录，幂等键 `event-registered|event-cancelled:<item>:<registrationVersion>`；
 * 状态已一致（重复提交、已参加）时不写库。没有生效计划或计划里没有这场活动时什么都不做。
 */
export interface MarkEventRegistrationInput {
  eventId: string;
  registered: boolean;
  /** 报名记录的版本（`updatedAt`），让同一次报名的重试落在同一个幂等键上。 */
  registrationVersion: string;
}

export interface MarkEventRegistrationResult {
  item: PlanItem | null;
  log: PlanLogEntry | null;
}

/** W0012：进入新阶段的生产者结果（没有进入新阶段或已记过时 entered 为 null）。 */
export interface EnterPhaseResult {
  entered: PlanLogEntry | null;
  /** 一年期补充的周级行动（新增或补上周次的条目）。 */
  refined: PlanItem[];
}

/**
 * W0012：新版本的来历。
 * - `reanalysis`：重新分析，每个东京自然月 1 次（额度记在 `plan_log` 的唯一幂等键 `reanalysis:<YYYY-MM>` 上）；
 * - `next_plan`：周期到期后制定下一份，不占额度，但当前计划必须已过最后一周。
 * - `ai_regenerate`（W0048b）：老模板计划（`analysis.generator = "mock-template-v1"`）用 AI 重新生成，
 *   不写 `reanalysis:<月>` 键、不占月额度；生效计划不是模板计划时 400。
 * 只能由服务端的调用方传入（`createVersionWithOutcome` 第二个参数），请求体无法指定。
 */
export type PlanVersionOrigin = "reanalysis" | "next_plan" | "ai_regenerate";

/** W0048b：维护任务补细一个骨架阶段（事务外生成后，在这里幂等写入）。 */
export interface ApplyPhaseRefinementInput {
  planId: string;
  /** 0 起的阶段序号。 */
  phaseIndex: number;
  items: NewPlanItemInput[];
  /** review P2-3：这一阶段的跟进规则与要认识的人（写进 `analysis.phases[phaseIndex]`，同时置 `detailed: true`）。 */
  followups?: string[];
  who?: string[];
}

export interface ApplyPhaseRefinementResult {
  applied: boolean;
  reason?: "already_refined" | "plan_changed" | "phase_missing";
  items: PlanItem[];
  entry: PlanLogEntry | null;
}

export interface ReanalysisQuota {
  /** 东京自然月 YYYY-MM。 */
  month: string;
  limit: number;
  used: number;
  remaining: number;
}

export interface PlanService {
  getCurrent(): Promise<PlanSnapshot | null>;
  /**
   * W0021：页面读取（`GET /api/agent/plans/current` 与「我的计划」页 SSR 共用）。先在只读事务里判定
   * 「进入新阶段」是否还没记过（绑定 actor + 生效计划 id + 按计划 `startsOn` 东京日算出的目标阶段），
   * 只有没记过才进入写事务；然后读投影快照。进入失败不影响读取（每日 plan-phase 维护任务兜底）。
   * `includeLog: false`（首页）不读进展记录。
   */
  getCurrentView(options?: { includeLog?: boolean }): Promise<PlanViewSnapshot | null>;
  /** 本人任一版本（含已归档）；他人的计划一律视为不存在。 */
  getPlan(planId: string): Promise<PlanSnapshot | null>;
  listVersions(): Promise<Plan[]>;
  createVersion(input: CreatePlanVersionInput): Promise<PlanSnapshot>;
  /**
   * 同 `createVersion`，另外告诉调用方这次是新建（created）还是同一 `creationKey` 已保存过的那份。
   * 判定与保存在同一个按人串行的事务里，并发重复提交恰好一份 created（W0008 bootstrap 用）。
   */
  createVersionWithOutcome(
    input: CreatePlanVersionInput,
    options?: {
      origin?: PlanVersionOrigin;
      /**
       * W0023：带 `origin` 时，新版本为带入的已关联需求生成「约 TA」，标题里的称呼从这里取
       * （联系人 id → 称呼，调用方在事务外读一次）；没有的用「TA」。
       */
      contactNames?: Readonly<Record<string, string>>;
      /** W0048b：预先分配的新计划 id（AI 生成时快照先记下它）；缺省由服务生成。 */
      planId?: string;
    },
  ): Promise<{ snapshot: PlanSnapshot; created: boolean }>;
  updateItem(input: UpdatePlanItemInput): Promise<UpdatePlanItemResult>;
  addManualLog(input: AddManualLogInput): Promise<{ entry: PlanLogEntry; replayed: boolean }>;
  linkNeedContact(input: LinkNeedContactInput): Promise<LinkNeedContactResult>;
  decideMatchCandidate(input: DecideMatchCandidateInput): Promise<DecideMatchCandidateResult>;
  recordInteraction(input: RecordInteractionInput): Promise<RecordInteractionResult>;
  markEventAttended(input: MarkEventAttendedInput): Promise<MarkEventAttendedResult>;
  markEventRegistration(input: MarkEventRegistrationInput): Promise<MarkEventRegistrationResult>;
  /** 按东京周次惰性判定是否进入了新阶段；进入了就幂等写日志（一年期同时补充周级行动）。 */
  enterCurrentPhase(): Promise<EnterPhaseResult>;
  /**
   * W0048b：AI 计划里待补细的骨架阶段（当前阶段与下一阶段中 `analysis.phases[i].detailed === false`、
   * 还没有补细记录的）；没有生效计划、不是 AI 计划、或计划已到期时为 null。只读。
   */
  phaseRefinementTargets(): Promise<{ plan: Plan; targets: number[] } | null>;
  /** W0048b：幂等写入一个阶段的补细结果（幂等键 `plan-refine:<planId>:<phaseIndex>`）。 */
  applyPhaseRefinement(input: ApplyPhaseRefinementInput): Promise<ApplyPhaseRefinementResult>;
  /** 东京周一才有：上周（周一 00:00 到周日 24:00，东京）的进展小结；其他日子或没有计划时为 null。 */
  weeklySummary(): Promise<PlanWeeklySummary | null>;
  reanalysisQuota(): Promise<ReanalysisQuota>;
}

/**
 * 按 actor 校验引用的联系人与活动是否真实存在、是否属于本人（活动：公开目录里已发布的活动）。
 * 由 service-factory 按当前登录者构造并注入服务；返回找不到的 id（空数组 = 全部有效）。
 * 服务在创建版本、关联联系人、手动记录时调用，找不到即 `REFERENCE_NOT_FOUND`（404），不写库。
 */
export interface PlanReferenceValidator {
  findMissingContactIds(contactIds: readonly string[]): Promise<string[]>;
  findMissingEventIds(eventIds: readonly string[]): Promise<string[]>;
}

/** 服务层的业务错误原因（`PlanServiceError.reason`），API 按 `code` 映射 HTTP 状态。 */
export const PLAN_ERROR_REASONS = [
  "INVALID_INPUT",
  "PLAN_NOT_FOUND",
  "ITEM_NOT_FOUND",
  "NO_ACTIVE_PLAN",
  "PLAN_ARCHIVED",
  "ILLEGAL_TRANSITION",
  "BASE_PLAN_MISMATCH",
  "IDEMPOTENCY_KEY_REUSED",
  "REFERENCE_NOT_FOUND",
  "MATCH_ALREADY_DECIDED",
  "REANALYSIS_QUOTA_EXHAUSTED",
  "PLAN_NOT_ENDED",
] as const;
export type PlanErrorReason = (typeof PLAN_ERROR_REASONS)[number];
