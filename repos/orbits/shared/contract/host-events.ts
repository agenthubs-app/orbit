// R17 — 主催：運営センター、建活动 / 编辑 / 发布 / 中止。Owner: 甲 (R17). Used by: host (Web 運営センター / 建活动, App 運営センター).
// DESIGN: docs/designs/redesign-2026-10/sprints/host/DESIGN.md §2.1–§2.2、§4。
// 所有接口走 `requireEventCapability`（主办侧不经过参加者的名单规则 A）。
// 数字里来自参加者私人记录的（会後フォロー率）按 §2.9 做 <5 抑制：被抑制的格子为 null，界面显示「—」。

/** 正式生命周期（Event Core `draft|published|cancelled|archived`）。 */
export type HostEventLifecycle = "draft" | "published" | "cancelled" | "archived";
/** 行与运营台的状态：草稿 / 开催前 / 开催中 / 终了 / 中止 / 归档。 */
export type HostEventStatus = "draft" | "upcoming" | "live" | "ended" | "cancelled" | "archived";
/** 我在这场活动里的角色（owner 来自 Event Core；manager = operations ∪ reviewer）。 */
export type HostRole = "owner" | "manager" | "operations" | "check_in" | "reviewer" | "read_only_analyst";
/** 参加費的显示方式（A1：Orbit 不经手钱，只展示）。 */
export type HostEventFeeKind = "free" | "amount" | "pay_at_door" | "external_link";
export type HostAdmissionMode = "first_come" | "review";
/** 行内一句状态：受付中 · 残り N名 / マッチング未生成 / 審査待ち N名 / 会後フォロー N% / 下書き / 中止 / アーカイブ。 */
export type HostRowNoteKind = "check_in_open" | "matching_missing" | "review_pending" | "followup" | "draft" | "cancelled" | "archived" | "none";
/** 行的主按钮：受付を開く / 運営画面へ。 */
export type HostRowAction = "open_check_in" | "open_console";
/** 「下書き · 中止 · アーカイブ」= inactive。 */
export type HostCenterFilter = "all" | "upcoming" | "live" | "ended" | "inactive";
/** 対応が必要なこと 的种类（规则，`shared/compute/host-todo.ts`）。 */
export type HostTodoKind = "review_pending" | "matching_missing" | "profile_incomplete" | "publish_form" | "generate_matching" | "publish_matching" | "open_check_in";

export interface HostRowNote {
  kind: HostRowNoteKind;
  /** 残り N名 / 審査待ち N名。 */
  count?: number | null;
  /** 会後フォロー N%（<5 抑制时 null）。 */
  rate?: number | null;
  /** 中止日（「10/14 中止 · 42名に通知済み」）。 */
  at?: string | null;
}

export interface HostCenterEventRow {
  eventId: string;
  title: string;
  emoji: string | null;
  status: HostEventStatus;
  startsAt: string | null;
  endsAt: string | null;
  /** 「渋谷ストリーム」——行里的地点（会場名）。 */
  venue: string | null;
  applied: number;
  capacity: number | null;
  /** マッチ N（未生成时 null → 「—」）。 */
  matched: number | null;
  /** 受付 N（开催前 null → 「—」）。 */
  checkedIn: number | null;
  note: HostRowNote;
  action: HostRowAction;
  role: HostRole;
}

export interface HostCenterKpi {
  /** 開催予定 N（开催前 + 开催中）。 */
  upcoming: number;
  /** 今月 N件。 */
  upcomingThisMonth: number;
  appliedThisMonth: number;
  /** +42 先月比（无上月数据时 null）。 */
  appliedDeltaVsLastMonth: number | null;
  /** 平均受付率 %（没有已结束场次时 null）。 */
  averageCheckInRate: number | null;
  /** 会後フォロー率 %（§2.9：受付 <5 的场次不计入；全部被抑制时 null）。 */
  followupRate: number | null;
  /** 「終了 3件の平均」。 */
  followupEndedCount: number;
}

export interface HostTodoItem {
  kind: HostTodoKind;
  eventId: string;
  eventTitle: string;
  count?: number | null;
  /** あと N日。 */
  daysLeft?: number | null;
}

/** 次にやること（少量态右栏，一场活动的步骤）。 */
export interface HostNextStep {
  kind: "publish_form" | "review_pending" | "generate_matching" | "publish_matching" | "open_check_in" | "send_followup";
  done: boolean;
  /** 已完成时的日期（「10月1日 公開済み」）。 */
  doneAt?: string | null;
  count?: number | null;
  /** 「申込 20名を超えたら」的阈值。 */
  threshold?: number | null;
}

export interface HostNextSteps {
  eventId: string;
  eventTitle: string;
  steps: readonly HostNextStep[];
}

export interface HostCenterFilterCounts {
  all: number;
  upcoming: number;
  live: number;
  ended: number;
  inactive: number;
}

/** 標題下的一行：「主催イベント 6件 · 今月の申込 188名」。 */
export interface HostCenterSummary {
  eventCount: number;
  appliedThisMonth: number;
  /** 开催中 + 开催前（App マイページ「主催したイベント · N件 · 運営中」）。 */
  activeCount: number;
}

/** `GET /api/host/center?filter=&q=&page=`。空账号：`events` 为空、`kpi` 为 null。 */
export interface HostCenterResponse {
  summary: HostCenterSummary;
  kpi: HostCenterKpi | null;
  todo: readonly HostTodoItem[];
  next: HostNextSteps | null;
  /** 开催预定 / 申込 / 審査待ち / 共同運営者（少量态四格，取第一场开催前的活动）。 */
  spotlight: HostCenterSpotlight | null;
  filterCounts: HostCenterFilterCounts;
  events: readonly HostCenterEventRow[];
  page: number;
  pageCount: number;
  sample?: true;
}

export interface HostCenterSpotlight {
  eventId: string;
  startsAt: string | null;
  applied: number;
  capacity: number | null;
  pendingReview: number;
  cohosts: number;
}

/** 共同运营者头像（运营台页头「伊 小 中」）。 */
export interface HostCohostAvatar {
  actorId: string;
  name: string;
  initial: string;
}

/** 一场活动的主办侧视图（建活动 / 编辑 / 运营台页头共用）。 */
export interface HostEventView {
  eventId: string;
  lifecycle: HostEventLifecycle;
  status: HostEventStatus;
  title: string;
  emoji: string | null;
  startsAt: string | null;
  endsAt: string | null;
  timezone: string;
  /** 会場名（「渋谷ストリーム 4F ホール」）。 */
  venueName: string | null;
  /** エリア（「渋谷」）。 */
  venueArea: string | null;
  online: boolean;
  feeKind: HostEventFeeKind;
  feeAmountYen: number | null;
  feeUrl: string | null;
  capacity: number | null;
  description: string | null;
  organizerProfileId: string | null;
  organizerName: string | null;
  organizerEmoji: string | null;
  organizerSlug: string | null;
  /** 公开后才有：申込页短链 slug（`/e/<slug>`）与参加コード（`XXXX-XXXX`）。 */
  publicSlug: string | null;
  participationCode: string | null;
  admissionMode: HostAdmissionMode;
  registrationClosesAt: string | null;
  /** 主办方资料的关注人数（公開確認「フォロワー 140名にお知らせ」）。 */
  followerCount: number;
  /** 申込済み（含审核待）/ 承認済み / キャンセル待ち 人数（中止 / 变更确认用）。 */
  appliedCount: number;
  approvedCount: number;
  waitlistedCount: number;
  cohostCount: number;
  cohosts: readonly HostCohostAvatar[];
  myRole: HostRole;
  /** 我在这场活动的能力（`event-access` 的能力名 + `event.edit` / `event.cancel` / `check_in.walk_in` / `operations.read_summary`）。 */
  capabilities: readonly string[];
  cancelledAt: string | null;
  archivedAt: string | null;
  /** 乐观锁版本（Event Core `event_version`）。 */
  version: number;
  sample?: true;
}

/** `POST /api/host/events`：建草稿。 */
export interface HostEventInput {
  title: string;
  emoji?: string | null;
  startsAt: string;
  endsAt: string;
  timezone?: string;
  venueName?: string | null;
  venueArea?: string | null;
  online?: boolean;
  feeKind: HostEventFeeKind;
  feeAmountYen?: number | null;
  feeUrl?: string | null;
  capacity?: number | null;
  description?: string | null;
  organizerProfileId: string;
  /** 从模板开始（交流会 / 勉強会 / ラウンドテーブル）：预填说明文骨架、问题集、编组条件。 */
  templateId?: "mixer" | "study" | "roundtable" | null;
}

/** `PATCH /api/host/events/[id]`：改基本情報（`event.edit`）。已公开的活动改日時或会場时，`notify` 决定是否发定型通知。 */
export interface HostEventUpdateInput {
  expectedVersion: number;
  title?: string;
  emoji?: string | null;
  startsAt?: string;
  endsAt?: string;
  venueName?: string | null;
  venueArea?: string | null;
  online?: boolean;
  feeKind?: HostEventFeeKind;
  feeAmountYen?: number | null;
  feeUrl?: string | null;
  capacity?: number | null;
  description?: string | null;
  organizerProfileId?: string;
  /** 已公开且日時 / 会場有变化：true = 保存して知らせる，false = 知らせずに保存。 */
  notify?: boolean;
}

/** 已公开活动改日時 / 会場时的通知预览（「申込済み・承認済みの 104名とキャンセル待ち 8名に…」）。 */
export interface HostEventChangePreview {
  timeChanged: boolean;
  venueChanged: boolean;
  beforeStartsAt: string | null;
  afterStartsAt: string | null;
  beforeVenue: string | null;
  afterVenue: string | null;
  approvedCount: number;
  waitlistedCount: number;
}

export interface HostEventWriteResult {
  event: HostEventView;
  /** 改了日時 / 会場且还没决定通不通知时给预览；界面弹确认后带 `notify` 再提交。 */
  changePreview: HostEventChangePreview | null;
  /** 本次写入发出的定型通知人数（0 = 没发）。 */
  notified: number;
}

/** `POST /api/host/events/[id]/publish`（幂等）。 */
export interface HostEventPublishInput {
  expectedVersion: number;
}

/** `POST /api/host/events/[id]/cancel`（只有 owner，`event.cancel`）。 */
export interface HostEventCancelInput {
  expectedVersion: number;
  /** 参加者へのひとこと（任意，≤140 字，不能带链接）。 */
  hostNote?: string | null;
}

/** `POST /api/host/events/[id]/archive`：アーカイブする（`archived: true`，中止或已结束的活动）/ アーカイブを解除（回到 published 或 cancelled）。 */
export interface HostEventArchiveInput {
  expectedVersion: number;
  archived: boolean;
}

/** `POST /api/host/events/[id]/code/reissue`：删旧参加コード、发新码（旧码立即失效）。 */
export interface HostEventCodeReissueInput {
  expectedVersion: number;
}

/** `POST /api/host/desktop-link`：「PC で開くリンクを自分に送る」= 给自己的收件箱写一条（不发邮件）。 */
export interface HostDesktopLinkResult {
  sent: true;
  /** 收件箱里那条通知的链接目标。 */
  href: string;
}
