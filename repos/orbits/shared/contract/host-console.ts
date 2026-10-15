// R17 — 主催：イベント運営的六个页签（概要 / マッチング / 参加者 / 受付 / 申込設定 / レポート）。Owner: 甲 (R17).
// Used by: host (Web 运营台 + kiosk, App 运营 5 段 + 受付)。DESIGN §2.3–§2.9、§4。
// 读接口都按 `requireEventCapability` 授权；写接口沿用现有 admission / operations / experience 路由，
// 这里的读模型把它们合在一起给界面用（R27 同一做法）。

import type { HostEventView } from "./host-events";

// ─── 概要 ───────────────────────────────────────────────

/** 運営の進捗：申込受付 → マッチング生成 → グループ確認 → 結果を公開 → 当日受付。 */
export type HostProgressStep = "registration" | "generation" | "review_groups" | "publish" | "check_in";

export interface HostOverviewMatchingCard {
  state: HostMatchingState;
  roundCount: number;
  tableCount: number;
  unplaced: number;
}

export interface HostOverviewTodo {
  kind: "review_pending" | "profile_incomplete";
  count: number;
  /** 当日枠 N名分（審査待ち 卡的副行）。 */
  walkInSlots?: number | null;
}

/** `GET /api/host/events/[id]/overview`。 */
export interface HostOverviewResponse {
  event: HostEventView;
  applied: number;
  capacity: number | null;
  /** マッチ可能 = プロフィール完了 的人数。 */
  matchable: number;
  checkedIn: number;
  /** 到着率 %（受付人数 / 申込）。 */
  arrivalRate: number | null;
  /** 开场时刻（「19:00 開場」）。 */
  doorsOpenAt: string | null;
  pendingReview: number;
  /** 推薦の生成 %、1人あたり N名を推薦。 */
  recommendationRate: number | null;
  recommendationsPerPerson: number;
  /** 申込の推移：直近 14 日每天的申込数（旧 → 新）。 */
  trend: readonly number[];
  currentStep: HostProgressStep;
  completedSteps: readonly HostProgressStep[];
  todos: readonly HostOverviewTodo[];
  matching: HostOverviewMatchingCard;
  /** App レポート段摘要（受付率 / 名刺交換 / 会後フォロー；<5 抑制为 null）。 */
  reportSummary: HostReportSummary | null;
  sample?: true;
}

export interface HostReportSummary {
  checkInRate: number | null;
  exchangeRate: number | null;
  followupRate: number | null;
  checkedIn: number;
  total: number;
  /** 名刺交換 N件。 */
  exchanges: number | null;
  /** 「本日 21:40 時点」。 */
  asOf: string;
}

// ─── マッチング ───────────────────────────────────────────

export type HostMatchingState = "none" | "generating" | "draft" | "published";

/** 编组条件（规则后处理，`shared/compute/table-constraints.ts`；不改提示词）。 */
export interface HostMatchingConditions {
  tableSize: number;
  /** 1–3（配置只加 `round_count`）。 */
  roundCount: number;
  separateCompanies: boolean;
  avoidPreviousTablemates: boolean;
  investorPerTable: boolean;
}

export interface HostMatchingRound {
  index: number;
  startsAt: string;
  endsAt: string;
}

export interface HostMatchingMember {
  participantId: string;
  name: string;
  initial: string;
  org: string | null;
  role: string | null;
  /** 立場 chip（申込 Q1 的选项短名：投資家 / CFO / 事業会社 / 士業 …）。 */
  standing: string | null;
  /** 人工移动过的人：理由改为「主催者が配置」。 */
  placedByHost: boolean;
}

export interface HostMatchingTable {
  round: number;
  /** 「A」…。 */
  table: string;
  theme: string | null;
  members: readonly HostMatchingMember[];
  /** なぜ同じテーブル？（产物里的理由）。 */
  why: string | null;
  /** 欠席連絡 N名。 */
  absent: number;
}

/** `GET /api/host/events/[id]/matching?round=`。 */
export interface HostMatchingResponse {
  event: HostEventView;
  state: HostMatchingState;
  applied: number;
  profileComplete: number;
  /** 生成に必要な人数（20）。 */
  minimumApplied: number;
  /** 「新生成」已用次数 / 上限 3（失败的 retry 不计）。 */
  generationsUsed: number;
  generationsLimit: number;
  conditions: HostMatchingConditions;
  rounds: readonly HostMatchingRound[];
  /** 当前显示的轮次（1 起）。 */
  round: number;
  tables: readonly HostMatchingTable[];
  unplaced: readonly HostMatchingMember[];
  participantCount: number;
  tableCount: number;
  tableSizeMin: number;
  tableSizeMax: number;
  /** 满足不了「各テーブルに投資家」的卓数。 */
  unsatisfiedTables: number;
  generationId: string | null;
  /** 人工调整层（`event_ops_generation_overrides`）的版本，PUT 时带上。 */
  overridesVersion: number;
  sample?: true;
}

/** 一次拖动：把某人移到某一轮的某一卓（或移出到「未配置」）。 */
export interface HostMatchingMove {
  participantId: string;
  round: number;
  /** null = 未配置。 */
  toTable: string | null;
}

/** `PUT /api/host/events/[id]/matching/overrides`。 */
export interface HostMatchingOverridesInput {
  generationId: string;
  expectedVersion: number;
  moves: readonly HostMatchingMove[];
}

/** `POST /api/host/events/[id]/matching/generate`（新生成 ≤3）。 */
export interface HostMatchingGenerateInput {
  conditions: HostMatchingConditions;
  idempotencyKey: string;
}

/** `POST /api/host/events/[id]/matching/publish`：合成（产物 + 后处理 + overrides）→ 现有 publish 冻结。 */
export interface HostMatchingPublishInput {
  generationId: string;
  overridesVersion: number;
}

// ─── 参加者（审核）──────────────────────────────────────────

export type HostPeopleBucket = "pending" | "approved" | "waitlisted" | "rejected";
export type HostAdmissionDecision = "approve" | "waitlist" | "reject";

export interface HostPeopleRow {
  actorId: string;
  name: string;
  initial: string;
  org: string | null;
  role: string | null;
  /** 申込回答（「いちばん話したいこと」那一问）。 */
  answer: string | null;
  /** プロフィール完成度 0–100。 */
  profileScore: number;
  profileIncomplete: boolean;
  /** 参加歴：本主办方的活动次数（0 = 初参加）。 */
  attendCount: number;
  status: HostPeopleBucket;
  applicationVersion: number;
}

export interface HostPeopleCounts {
  pending: number;
  approved: number;
  waitlisted: number;
  rejected: number;
}

/** `GET /api/host/events/[id]/people?bucket=&q=&incomplete=1&cursor=`。 */
export interface HostPeopleResponse {
  event: HostEventView;
  bucket: HostPeopleBucket;
  counts: HostPeopleCounts;
  capacity: number | null;
  /** 残り枠（承認済み 以外的空位）。 */
  remaining: number | null;
  /** 申込回答一栏的问题短名（「いちばん話したいこと」）。 */
  answerLabel: string | null;
  rows: readonly HostPeopleRow[];
  /** さらに表示（N名）。 */
  more: number;
  nextCursor: string | null;
  /** 空态：申込页链接与申込設定摘要（質問 3問 · 審査制）。 */
  applyPath: string | null;
  questionCount: number;
  sample?: true;
}

/** `POST /api/host/events/[id]/people/[actorId]/decision`（批量 = 逐条调用，各带自己的版本号）。 */
export interface HostPeopleDecisionInput {
  decision: HostAdmissionDecision;
  expectedVersion: number;
}

export interface HostPeopleDecisionResult {
  actorId: string;
  status: HostPeopleBucket;
  applicationVersion: number;
  /** 变成 admitted 时分配的受付番号。 */
  receptionNumber: string | null;
  /** 写进 outbox 的定型通知（0 / 1）。 */
  notified: number;
}

// ─── 受付（kiosk）────────────────────────────────────────────

export type HostKioskStatus = "not_arrived" | "checked_in" | "waitlisted";

export interface HostKioskRow {
  participantId: string;
  actorId: string;
  name: string;
  initial: string;
  /** よみ（ひらがな，用于搜索）。 */
  kana: string | null;
  org: string | null;
  role: string | null;
  status: HostKioskStatus;
  checkedInAt: string | null;
  table: string | null;
  receptionNumber: string | null;
  /** 30 分钟内的签到可以撤销。 */
  undoable: boolean;
}

export interface HostKioskRecent {
  participantId: string;
  name: string;
  initial: string;
  org: string | null;
  at: string;
  table: string | null;
  receptionNumber: string | null;
}

/** `GET /api/host/events/[id]/kiosk?q=`。 */
export interface HostKioskResponse {
  eventId: string;
  title: string;
  venue: string | null;
  /** 受付 担当 伊藤 直子（受付）。 */
  staffName: string;
  staffRole: string;
  now: string;
  doorsOpenAt: string | null;
  checkedIn: number;
  total: number;
  rate: number;
  rows: readonly HostKioskRow[];
  recent: readonly HostKioskRecent[];
  /** N台で受付中（最近 60 秒有心跳的设备）。 */
  devices: number;
  /** 当日枠（`check_in.walk_in`）。 */
  canWalkIn: boolean;
  /** 满员时当日枠要先确认。 */
  overCapacity: boolean;
  /** 本机缓存名单的有效期（活动结束 +12 小时，A4）。 */
  cacheUntil: string;
  sample?: true;
}

/** `GET /api/host/events/[id]/kiosk/roster`：本机离线缓存用的当天名单（只给有受付权限的设备）。 */
export interface HostKioskRosterResponse {
  eventId: string;
  cacheUntil: string;
  rows: readonly HostKioskRow[];
  sample?: true;
}

/** `POST /api/events/[id]/operations/admin/check-ins/scan`。 */
export interface HostCheckInScanInput {
  payload: string;
  idempotencyKey: string;
}

/** `POST …/check-ins/[participantId]/admit-on-site`。 */
export interface HostAdmitOnSiteInput {
  idempotencyKey: string;
  /** 满员时必须为 true（确认后超定员受付，记 `over_capacity`）。 */
  confirmOverCapacity?: boolean;
}

/** `POST …/check-ins/[participantId]/undo`。 */
export interface HostCheckInUndoInput {
  idempotencyKey: string;
}

export interface HostCheckInResult {
  participantId: string;
  status: HostKioskStatus;
  checkedInAt: string | null;
  receptionNumber: string | null;
  table: string | null;
  name: string;
  /** 已经签过（多台同时签同一人 / 离线重复补发）：只记一次。 */
  duplicate: boolean;
  overCapacity: boolean;
}

/** `POST /api/events/[id]/operations/kiosk-heartbeat`。 */
export interface HostKioskHeartbeatInput {
  deviceId: string;
}

export interface HostKioskHeartbeatResult {
  devices: number;
}

// ─── 申込設定 ──────────────────────────────────────────────

export type HostQuestionKind = "single" | "multiple" | "free";

export interface HostSetupQuestion {
  id: string;
  prompt: string;
  kind: HostQuestionKind;
  required: boolean;
  options: readonly string[];
}

/** 定型お知らせ（6 种固定文，只显示、不可改）。 */
export type HostNoticeTemplateKind = "admission_approved" | "admission_rejected" | "admission_waitlisted" | "admission_promoted" | "matching_published" | "profile_incomplete";

export interface HostNoticeTemplate {
  kind: HostNoticeTemplateKind;
  text: string;
}

export interface HostQuestionSuggestion {
  count: number;
  /** 「製造業DX 朝会」の過去 2回。 */
  basisTitle: string | null;
  basisCount: number;
  questions: readonly HostSetupQuestion[];
}

/** `GET /api/host/events/[id]/setup`。 */
export interface HostSetupResponse {
  event: HostEventView;
  /** 公開中 / 未公開。 */
  formPublished: boolean;
  description: string;
  questions: readonly HostSetupQuestion[];
  capacity: number | null;
  registrationClosesAt: string | null;
  admissionMode: "first_come" | "review";
  applyPath: string | null;
  /** 未公開の変更 N件。 */
  unpublishedChanges: number;
  savedAt: string | null;
  /** 質問案を 3つ追加しますか？（规则，`question-suggest.ts`）。 */
  suggestion: HostQuestionSuggestion | null;
  notices: readonly HostNoticeTemplate[];
  /** 主催者からのひとこと（≤140 字，不能带链接；A10）。 */
  hostNote: string | null;
  /** 草稿乐观锁（experience head revision）。 */
  revision: number;
  sample?: true;
}

/** `PUT /api/host/events/[id]/setup`：存草稿（自动保存也走这里）。 */
export interface HostSetupDraftInput {
  expectedRevision: number;
  description: string;
  questions: readonly HostSetupQuestion[];
  capacity: number | null;
  registrationClosesAt: string | null;
  admissionMode: "first_come" | "review";
}

/** `POST /api/host/events/[id]/setup/publish`：公開する / 変更を公開。 */
export interface HostSetupPublishInput {
  expectedRevision: number;
}

/** `PUT /api/host/events/[id]/setup/host-note`。 */
export interface HostSetupHostNoteInput {
  hostNote: string | null;
}

// ─── レポート ──────────────────────────────────────────────

export interface HostReportFunnel {
  exchanged: number | null;
  drafted: number | null;
  followed: number | null;
  meetings: number | null;
}

export interface HostReportTableCell {
  round: number;
  table: string;
  exchanges: number | null;
}

export interface HostReportStandingItem {
  label: string;
  /** 百分比（<5 抑制时 null）。 */
  percent: number | null;
}

/** 全体（聚合；任何格子 <5 人显示「—」，并做差分保护）。 */
export interface HostReportAll {
  /** before = 开催前（只给申込推移 + 样例）。 */
  state: "before" | "after";
  applied: number;
  capacity: number | null;
  daysToStart: number | null;
  daysSincePublish: number | null;
  /** 告知から開催まで N日。 */
  daysPublishToEvent: number | null;
  trend: readonly number[];
  trendLabels: readonly string[];
  checkInRate: number | null;
  checkedIn: number | null;
  /** 名刺交換 N組（双方都确认的交换）。 */
  exchanges: number | null;
  exchangesPerPerson: number | null;
  exchangeRate: number | null;
  followups: number | null;
  followupRate: number | null;
  followupWindowDays: number;
  funnel: HostReportFunnel;
  tables: readonly HostReportTableCell[];
  /** 规则提示（「テーブル E は欠席 2名で 3名卓に…」）。 */
  tableNote: string | null;
  standingQuestion: string | null;
  standing: readonly HostReportStandingItem[];
  suppressedBelow: number;
}

export interface HostReportPerson {
  name: string;
  initial: string;
  org: string | null;
  role: string | null;
  table: string | null;
  standing: string | null;
  contactId: string | null;
}

/** 自分の視点：读 R24 / R27 的本人数据，不经主办权限。 */
export interface HostReportMine {
  met: number;
  exchanged: number;
  followed: number;
  followTotal: number;
  /** プランへの貢献（没有计划时 null）。 */
  contributionLabel: string | null;
  contributionDelta: number | null;
  contributionScore: number | null;
  /** 「2 / 3人」。 */
  contributionHave: number | null;
  contributionTarget: number | null;
  contributionGoal: string | null;
  contributionDetail: string | null;
  unfollowed: readonly HostReportPerson[];
  daysSinceExchange: number | null;
  /** 📝 進捗ログに記録しますか？ 的一句。 */
  logSuggestion: string | null;
}

/** `GET /api/host/events/[id]/report?view=all|mine`。 */
export interface HostReportResponse {
  event: HostEventView;
  view: "all" | "mine";
  all: HostReportAll | null;
  mine: HostReportMine | null;
  sample?: true;
}
