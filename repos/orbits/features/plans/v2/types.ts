/**
 * R22 计划 v2.2 的服务端内部类型（DESIGN §3）。对外形状在 `shared/contract/plan-v2.ts`；这里是行与服务接口。
 *
 * - 一个目标一行 `plans`（model_version = 2），生命周期内原地更新（`revision` 只因方案内容改变 +1）；
 * - 人物类型 = `plan_items.kind = 'network_need'`（`allocation`、`skipped_at`、`type_slot`，长文本在 `meta.personType`）；
 * - イベント枠 = `plans.event_allocation / event_target_count`，参加过的活动仍是 `kind = 'event'` 条目；
 * - 分数 = `plan_log` 的 `score_awarded` 减去被 `score_reversed` 对冲的记录（记账式，DESIGN §4.2）。
 */
import type {
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
  maxVersion(): Promise<number>;
  /** 本人生效中的 v1 计划 id（没有为 null）。 */
  activeV1PlanId(): Promise<string | null>;
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
}

export interface PlanV2Repository {
  transact<T>(scope: PlanV2Scope, operation: (tx: PlanV2Transaction) => Promise<T>): Promise<T>;
  read<T>(scope: PlanV2Scope, operation: (reader: PlanV2Reader) => Promise<T>): Promise<T>;
}
