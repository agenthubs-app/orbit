/**
 * 运营台（Orbit_0918）纯模型：hub 状态 chip / 卡片 CTA / hubTabs 过滤 / 六页签 / 各屏标题。
 * 值来自 docs/designs/Orbit_0918/Events 运营台.dc.html renderVals（506–523 `events` 装饰、
 * 636–658 `titles` / `opsTabs` / `hubTabs`）。不含 React / fetch。角色与生命周期谓词原样来自
 * center/event-center-workspace.tsx（59–108 行），语义不变。
 */
import type {
  EventAnalyticsAttendeeReport,
  EventAnalyticsOrganizerAggregate,
} from "../../../../../features/events/event-analytics/contract";
import type {
  EventExperienceHead,
  EventExperienceQuestion,
  EventExperienceQuestionTrack,
} from "../../../../../features/events/experience/contract";
import type {
  EventOperationsGeneration,
  EventOperationsPublishedResult,
  EventOperationsTable,
} from "../../../../../features/events/event-operations/contract";
import type { EventCenterItem, EventRole } from "./use-event-center";

// ═══ 路由 ═══

export type OpsView = "ops" | "match" | "people" | "checkin" | "form" | "report";

export function eventPagePath(eventId: string): string {
  return `/app/events/${encodeURIComponent(eventId)}`;
}

export function operationsPath(eventId: string): string {
  return `${eventPagePath(eventId)}/operations`;
}

/** 「更多 ⌄」→ 导出 CSV（旧运营台 `${baseUrl}/export`；参会者 / 签到页无 useEventOperations 会话时直接拼）。 */
export function exportCsvHref(eventId: string): string {
  return `/api/events/${encodeURIComponent(eventId)}/operations/admin/export`;
}

/** 审阅修订 7：`/operations/roles` 属删除清单，管理角色一律进 `?drawer=roles` 抽屉。 */
export function rolesDrawerHref(eventId: string): string {
  return `${operationsPath(eventId)}?drawer=roles`;
}

/** 设计 647–654 `opsTabs`；href 为计划「页面接线」一节的应用侧 URL。 */
export const OPS_TABS: readonly { key: OpsView; label: string; href: (eventId: string) => string }[] = [
  { key: "ops", label: "概览", href: (id) => operationsPath(id) },
  { key: "match", label: "匹配与分组", href: (id) => `${operationsPath(id)}?tab=match` },
  { key: "people", label: "参会者", href: (id) => `${operationsPath(id)}/admission` },
  { key: "checkin", label: "签到", href: (id) => `${operationsPath(id)}/check-in` },
  { key: "form", label: "报名设置", href: (id) => `${operationsPath(id)}/experience` },
  { key: "report", label: "数据报告", href: (id) => `${eventPagePath(id)}/analytics` },
];

/** `/operations` 页内两屏；`?tab=` 解析只认 `match`，其余（含缺省）→ 概览（page.tsx 服务端调用，故放纯模型）。 */
export type OpsConsoleTab = Extract<OpsView, "ops" | "match">;

export function opsConsoleTab(value: string | string[] | undefined): OpsConsoleTab {
  const raw = Array.isArray(value) ? value[0] : value;
  return raw === "match" ? "match" : "ops";
}

export function opsHref(eventId: string, view: OpsView): string {
  const tab = OPS_TABS.find((item) => item.key === view) ?? OPS_TABS[0];
  return tab.href(eventId);
}

/** 设计 637–644 `titles`：[title, sub, crumb]；ops 屏标题为「{活动标题} · 运营台」（设计写死 Tokyo AI Meetup）。 */
export const TITLES: Record<OpsView, { title: string; sub: string; crumb: string }> = {
  ops: { title: "运营台", sub: "管理活动准备、匹配分组、现场签到与数据查看。", crumb: "运营台" },
  match: { title: "匹配与分组", sub: "根据参会者资料生成推荐和现场分组。", crumb: "匹配与分组" },
  people: { title: "参会者", sub: "查看报名名单与资料完整度。", crumb: "参会者" },
  checkin: { title: "签到", sub: "面向现场工作人员的最小签到视图，仅显示签到所需信息。", crumb: "签到" },
  form: { title: "报名设置", sub: "编辑用户点击报名后看到的问题与说明。", crumb: "报名设置" },
  report: { title: "数据报告", sub: "查看活动整体表现与会后跟进情况。", crumb: "数据报告" },
};

export function consoleTitle(view: OpsView, eventTitle: string): string {
  return view === "ops" ? `${eventTitle} · ${TITLES.ops.title}` : TITLES[view].title;
}

// ═══ 角色 / 生命周期谓词（原样来自 event-center-workspace.tsx 59–108 行）═══

export const ROLE_LABEL: Record<EventRole, string> = {
  owner: "活动负责人",
  operations: "运营",
  check_in: "签到",
  reviewer: "审核",
  read_only_analyst: "只读分析",
};

export function canOpenOperations(item: EventCenterItem): boolean {
  return item.owner || item.role === "operations";
}

export function canOpenCheckIn(item: EventCenterItem): boolean {
  return item.owner || item.role === "operations" || item.role === "check_in";
}

export function canOpenAnalytics(item: EventCenterItem): boolean {
  return item.owner || item.role === "operations" || item.role === "read_only_analyst";
}

export function canReviewAdmission(item: EventCenterItem): boolean {
  return item.owner || item.role === "reviewer";
}

export function onsiteOperationsAvailable(item: EventCenterItem): boolean {
  return !item.migrationPending && item.lifecycleState === "published";
}

export function analyticsAvailable(item: EventCenterItem): boolean {
  return !item.migrationPending && (item.lifecycleState === "published" || item.lifecycleState === "archived");
}

export function lifecycleRestrictionCopy(item: EventCenterItem): string {
  if (item.lifecycleState === "draft") {
    return "活动发布前不开放运营台、签到台与报名审核；负责人仍可管理活动角色。";
  }
  if (item.lifecycleState === "cancelled") {
    return "活动已取消，运营台、签到台与报名审核均已关闭。";
  }
  if (item.lifecycleState === "archived") {
    return "活动已归档，现场运营、签到与报名审核已关闭；有权限的成员仍可查看历史分析。";
  }
  return "当前生命周期不开放运营台、签到台与报名审核。";
}

export const MIGRATION_PENDING_COPY =
  "该活动尚未完成 Event Core 主数据迁移。为避免从旧活动域读取或授权，运营、签到、分析与角色管理暂不可用。";

export const BOOTSTRAP_LIMITED_COPY =
  "首次运营配置必须由活动负责人初始化；初始化完成后，运营角色才能继续调整配置并执行现场流程。";

export function eventTitle(item: EventCenterItem): string {
  if (item.migrationPending) return "活动资料待迁移";
  return item.title?.trim() || "未命名活动";
}

// ═══ 时间阶段 ═══

export type HubPhase = "upcoming" | "live" | "ended";

function parseTime(value: string | null): number | null {
  if (!value) return null;
  const ms = Date.parse(value);
  return Number.isFinite(ms) ? ms : null;
}

/** 原 event-center-workspace 的阶段推导：开始前 upcoming / 结束后 ended / 其余 live；开始时间缺失 → null。 */
export function hubPhase(item: Pick<EventCenterItem, "startsAt" | "endsAt">, now: number): HubPhase | null {
  const start = parseTime(item.startsAt);
  const end = parseTime(item.endsAt);
  if (start === null && end === null) return null;
  if (start !== null && now < start) return "upcoming";
  if (end !== null && now > end) return "ended";
  return "live";
}

const ENDED_LIFECYCLES = new Set(["archived", "legacy_archived", "cancelled"]);

/** hubTabs 分桶：已结束（生命周期终态或时间已过）/ 进行中 / 即将开始（含草稿与未排期）。 */
export function hubBucket(item: EventCenterItem, now: number): HubPhase {
  if (ENDED_LIFECYCLES.has(item.lifecycleState)) return "ended";
  const phase = hubPhase(item, now);
  if (phase === "ended" || phase === "live") return phase;
  return "upcoming";
}

// ═══ 状态 chip（设计 507/511/515/519 `status`/`chipBg`/`chipColor`）═══

export type HubChipKind = "registering" | "soon" | "live" | "ended" | "draft" | "cancelled" | "pending";

const CHIP_TONE: Record<"green" | "indigo" | "accent" | "muted", { chipBg: string; chipColor: string }> = {
  green: { chipBg: "#E6F1EC", chipColor: "#2F6B4F" },
  indigo: { chipBg: "#ECEEFB", chipColor: "#2E3270" },
  accent: { chipBg: "#ECEEFB", chipColor: "#4B4FC7" },
  muted: { chipBg: "#F1F1FA", chipColor: "#6B6F99" },
};

export interface HubStatusChip {
  chipBg: string;
  chipColor: string;
  kind: HubChipKind;
  label: string;
}

const CHIP_BY_KIND: Record<HubChipKind, HubStatusChip> = {
  registering: { kind: "registering", label: "报名中", ...CHIP_TONE.green },
  soon: { kind: "soon", label: "即将开始", ...CHIP_TONE.indigo },
  live: { kind: "live", label: "进行中", ...CHIP_TONE.accent },
  ended: { kind: "ended", label: "已结束", ...CHIP_TONE.muted },
  // 设计只有四种状态；以下三种是真实生命周期必须区分的补充，配色沿用设计四色。
  draft: { kind: "draft", label: "草稿", ...CHIP_TONE.indigo },
  cancelled: { kind: "cancelled", label: "已取消", ...CHIP_TONE.muted },
  pending: { kind: "pending", label: "待迁移", ...CHIP_TONE.muted },
};

/** 「即将开始」= 已发布且 24 小时内开始（`/api/events/center` 无报名窗字段，以开始时间代之）。 */
export const SOON_WINDOW_MS = 24 * 60 * 60 * 1000;

export function hubStatusChip(item: EventCenterItem, now: number): HubStatusChip {
  if (item.migrationPending) return CHIP_BY_KIND.pending;
  if (item.lifecycleState === "cancelled") return CHIP_BY_KIND.cancelled;
  if (item.lifecycleState === "archived" || item.lifecycleState === "legacy_archived") return CHIP_BY_KIND.ended;
  const phase = hubPhase(item, now);
  if (phase === "ended") return CHIP_BY_KIND.ended;
  if (item.lifecycleState === "draft") return CHIP_BY_KIND.draft;
  if (phase === "live") return CHIP_BY_KIND.live;
  const start = parseTime(item.startsAt);
  if (start !== null && start - now <= SOON_WINDOW_MS) return CHIP_BY_KIND.soon;
  return CHIP_BY_KIND.registering;
}

// ═══ hubTabs（设计 656–657）═══

export type HubTab = "all" | HubPhase;

export const HUB_TABS: readonly { key: HubTab; label: string }[] = [
  { key: "all", label: "全部" },
  { key: "upcoming", label: "即将开始" },
  { key: "live", label: "进行中" },
  { key: "ended", label: "已结束" },
];

export function hubTabMatches(item: EventCenterItem, tab: HubTab, now: number): boolean {
  if (tab === "all") return true;
  if (item.migrationPending) return false;
  return hubBucket(item, now) === tab;
}

/** 设计搜索框 placeholder「搜索活动名称、地点或关键词…」：按标题 + 地点匹配。 */
export function matchesHubQuery(item: EventCenterItem, query: string): boolean {
  const needle = query.trim().toLowerCase();
  if (!needle) return true;
  return [eventTitle(item), item.venue ?? ""].some((field) => field.toLowerCase().includes(needle));
}

// ═══ 卡片动作（原 event-center-workspace 174–201 行的动作表 + 设计 CTA 装饰）═══

export type HubActionKey = "operations" | "admission" | "checkin" | "analytics" | "view" | "roles";

export interface HubAction {
  href: string;
  key: HubActionKey;
  label: string;
  /** 既有测试断言的 `data-event-center-*` 标记。 */
  marker?: "data-event-center-admission" | "data-event-center-analytics" | "data-event-center-manage-roles";
}

/** 该卡可见的全部动作（迁移待确认 → 空：不得出现任何指向该活动的链接）。 */
export function hubActions(item: EventCenterItem): HubAction[] {
  if (item.migrationPending) return [];
  const onsite = onsiteOperationsAvailable(item);
  const report = analyticsAvailable(item);
  const ops = operationsPath(item.eventId);
  const actions: (HubAction & { visible: boolean })[] = [
    { key: "operations", label: "进入运营 →", href: ops, visible: onsite && canOpenOperations(item) },
    { key: "admission", label: "报名审核", href: `${ops}/admission`, marker: "data-event-center-admission", visible: onsite && canReviewAdmission(item) },
    { key: "checkin", label: "签到台", href: `${ops}/check-in`, visible: onsite && canOpenCheckIn(item) },
    { key: "analytics", label: "查看数据", href: `${eventPagePath(item.eventId)}/analytics`, marker: "data-event-center-analytics", visible: report && canOpenAnalytics(item) },
    { key: "view", label: "查看活动页面", href: eventPagePath(item.eventId), visible: true },
    { key: "roles", label: "管理角色", href: rolesDrawerHref(item.eventId), marker: "data-event-center-manage-roles", visible: Boolean(item.owner) },
  ];
  return actions.filter((action) => action.visible).map(({ visible: _visible, ...action }) => action);
}

export type HubCtaTone = "dark" | "ghost";

/** 设计 510/522 的 `btnBg`/`btnColor`/`btnBorder`。 */
export const HUB_CTA_TONE: Record<HubCtaTone, { btnBg: string; btnColor: string; btnBorder: string }> = {
  dark: { btnBg: "#0E1225", btnColor: "#FFFFFF", btnBorder: "#0E1225" },
  ghost: { btnBg: "#FFFFFF", btnColor: "#2E3270", btnBorder: "#B9BCEB" },
};

export interface HubCta extends HubAction {
  tone: HubCtaTone;
}

/**
 * 主按钮：已结束 → 「查看数据」（ghost），否则「进入运营 →」（dark）；无该能力时按阶段退到角色的
 * 本职动作（开始前审核 / 现场签到 / 结束后数据），最后退到「查看活动页面」。迁移待确认 → null。
 */
export function hubCta(item: EventCenterItem, now: number): HubCta | null {
  const actions = hubActions(item);
  if (actions.length === 0) return null;
  const bucket = hubBucket(item, now);
  const preference: HubActionKey[] = bucket === "ended"
    ? ["analytics", "operations", "checkin", "admission", "view"]
    : bucket === "live"
      ? ["operations", "checkin", "admission", "analytics", "view"]
      : ["operations", "admission", "analytics", "checkin", "view"];
  const primary = preference.map((key) => actions.find((action) => action.key === key)).find(Boolean);
  if (!primary) return null;
  const tone: HubCtaTone = primary.key === "analytics" || primary.key === "view" ? "ghost" : "dark";
  return { ...primary, tone };
}

/** `···` 菜单 = 主按钮以外的其余动作（顺序不变）。 */
export function hubSecondaryActions(item: EventCenterItem, now: number): HubAction[] {
  const primary = hubCta(item, now);
  return hubActions(item).filter((action) => action.key !== primary?.key);
}

// ═══ 三计数（审阅修订 4：每卡 `GET /api/events/{id}/analytics/aggregate`；非 2xx → 「—」）═══

export const COUNT_PLACEHOLDER = "—";

export interface HubCounts {
  checkin: string;
  match: string;
  signup: string;
}

export function hubCounts(aggregate: EventAnalyticsOrganizerAggregate | null | undefined): HubCounts {
  if (!aggregate) return { signup: COUNT_PLACEHOLDER, match: COUNT_PLACEHOLDER, checkin: COUNT_PLACEHOLDER };
  return {
    signup: String(aggregate.registrations.active),
    match: aggregate.grouping.published ? String(aggregate.grouping.roundOne.assignedParticipants) : COUNT_PLACEHOLDER,
    checkin: String(aggregate.checkIns.checkedIn),
  };
}

// ═══ 日期 / 时间（设计 `e.date`「2026年9月20日（周日）」+ `e.time`「19:00 – 21:00」；东京时区）═══

const TOKYO = { timeZone: "Asia/Tokyo" } as const;

function clockOf(ms: number): string {
  const parts = new Intl.DateTimeFormat("zh-CN", { hour: "2-digit", hour12: false, minute: "2-digit", ...TOKYO }).formatToParts(new Date(ms));
  const get = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value ?? "";
  return `${get("hour")}:${get("minute")}`;
}

export function hubDateTime(item: Pick<EventCenterItem, "startsAt" | "endsAt">): { date: string; time: string } | null {
  const start = parseTime(item.startsAt);
  if (start === null) return null;
  const parts = new Intl.DateTimeFormat("zh-CN", { day: "numeric", month: "numeric", weekday: "short", year: "numeric", ...TOKYO }).formatToParts(new Date(start));
  const get = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value ?? "";
  const date = `${get("year")}年${get("month")}月${get("day")}日（${get("weekday")}）`;
  const end = parseTime(item.endsAt);
  const time = end !== null && end > start ? `${clockOf(start)} – ${clockOf(end)}` : clockOf(start);
  return { date, time };
}

/** 页头「当前身份」：所有可见活动的角色去重（负责人优先），无活动 → null。 */
export function identityLabel(items: readonly EventCenterItem[]): string | null {
  const labels = new Set<string>();
  for (const item of items) {
    if (item.migrationPending) continue;
    labels.add(item.owner ? ROLE_LABEL.owner : ROLE_LABEL[item.role]);
  }
  return labels.size ? [...labels].join(" · ") : null;
}

// ═══ 概览「运营进度」五阶段（设计 524–544 `stepData`/`steps`；任务 3 数据决定：全部由真实生命周期推导）═══


export type PipelineStepState = "done" | "now" | "todo";

export interface PipelineStep {
  label: string;
  /** 真实时间戳的「M月D日」；无来源 → 空；当前阶段 → 「当前阶段」（设计 527 行）。 */
  meta: string;
  state: PipelineStepState;
}

/** 推导输入：全部来自 `GET /operations/admin` 的工作区 + 当前时间。 */
export interface PipelineState {
  now: number;
  /** 配置缺失（首次运营配置未初始化）→ null：只保留生成 / 发布两个可判定阶段。 */
  registrationCutoffAt: string | null;
  eventStartsAt: string | null;
  eventEndsAt: string | null;
  /** 最新一次生成（`workspace.generations[0]`）；无 → null。 */
  newestGeneration: Pick<EventOperationsGeneration, "status" | "completedAt" | "createdAt"> | null;
  /** 发布指针；无 → null。 */
  publishedAt: string | null;
}

/** 设计 meta「9月1日」：东京时区 M月D日；无效 → 空。 */
export function shortDate(value: string | null | undefined): string {
  const ms = parseTime(value ?? null);
  if (ms === null) return "";
  const parts = new Intl.DateTimeFormat("zh-CN", { day: "numeric", month: "numeric", ...TOKYO }).formatToParts(new Date(ms));
  const get = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value ?? "";
  return `${get("month")}月${get("day")}日`;
}

export const PIPELINE_STEP_LABELS = ["报名中", "已生成匹配", "等待检查分组", "未发布", "活动现场"] as const;

/**
 * 报名中 = 报名窗开着（截止前且尚未生成）；已生成匹配 = 最新生成 completed/published；
 * 等待检查分组 = completed 且未发布（当前阶段）；未发布 / 已发布 = 发布指针；活动现场 = eventPhase active/ended。
 * 各阶段 done 独立判定，「当前阶段」= 第一个未完成阶段（设计只有一个实心点）。
 */
export function pipelineSteps(state: PipelineState): PipelineStep[] {
  const cutoff = parseTime(state.registrationCutoffAt);
  const starts = parseTime(state.eventStartsAt);
  const ends = parseTime(state.eventEndsAt);
  const generated = state.newestGeneration?.status === "completed" || state.newestGeneration?.status === "published";
  const published = state.publishedAt !== null;
  const registrationClosed = cutoff !== null && state.now >= cutoff;
  const eventEnded = ends !== null && state.now > ends;

  const defs: { label: string; done: boolean; meta: string }[] = [
    { label: "报名中", done: registrationClosed || generated, meta: shortDate(state.registrationCutoffAt) },
    { label: "已生成匹配", done: generated, meta: generated ? shortDate(state.newestGeneration?.completedAt ?? state.newestGeneration?.createdAt) : "" },
    { label: "等待检查分组", done: published, meta: "" },
    { label: published ? "已发布" : "未发布", done: published, meta: shortDate(state.publishedAt) },
    { label: "活动现场", done: eventEnded, meta: shortDate(state.eventStartsAt) },
  ];
  // 活动已开始但尚未结束 → 现场阶段是「当前」，前置阶段是否完成不影响（现场是时间事实）。
  const eventActive = starts !== null && ends !== null && state.now >= starts && state.now <= ends;
  const firstOpen = defs.findIndex((def) => !def.done);
  const currentIndex = eventActive ? 4 : firstOpen;
  return defs.map((def, index) => ({
    label: def.label,
    meta: index === currentIndex ? "当前阶段" : def.meta,
    state: def.done ? "done" : index === currentIndex ? "now" : "todo",
  }));
}

/** 设计 532–544 行的 step 装饰（mark / dotBg / ringColor / leftLine / rightLine / weight / color / metaColor）。 */
export interface PipelineStepStyle {
  color: string;
  dotBg: string;
  leftLine: string;
  mark: string;
  metaColor: string;
  rightLine: string;
  ringColor: string;
  weight: 400 | 700;
}

export function pipelineStepStyle(steps: readonly PipelineStep[], index: number): PipelineStepStyle {
  const step = steps[index];
  const done = step.state === "done";
  const now = step.state === "now";
  const prevDone = index > 0 && steps[index - 1].state === "done";
  return {
    mark: done ? "✓" : now ? "●" : "",
    dotBg: done ? "#4B4FC7" : "#FFFFFF",
    ringColor: done || now ? "#4B4FC7" : "#DDDEFA",
    leftLine: index === 0 ? "transparent" : prevDone ? "#4B4FC7" : "#E8E9F6",
    rightLine: index === steps.length - 1 ? "transparent" : done ? "#4B4FC7" : "#E8E9F6",
    weight: now ? 700 : 400,
    color: now || done ? "#0E1225" : "#9FA3C4",
    metaColor: now ? "#4B4FC7" : "#9FA3C4",
  };
}

// ═══ 匹配与分组：两轮桌卡（审阅修订 1：只读 `publishedResult.grouping`）═══

export type MatchRound = 1 | 2;

export function roundTables(published: EventOperationsPublishedResult | null | undefined, round: MatchRound): readonly EventOperationsTable[] {
  if (!published) return [];
  return round === 1 ? published.grouping.roundOne : published.grouping.roundTwo;
}

/** 设计 690–691 `r1Bg…`：选中 `#DDDEFA/#2E3270/500`，未选 `transparent/#6B6F99/400`。 */
export const ROUND_TOGGLE_TONE = {
  on: { bg: "#DDDEFA", color: "#2E3270", weight: 500 },
  off: { bg: "transparent", color: "#6B6F99", weight: 400 },
} as const;

// ═══ 概览 / 匹配 计数（审阅修订 6：可参与匹配 = `profileCompleteness !== "minimal"`；资料不足 = `=== "minimal"`）═══

export function matchEligibleCount(participants: readonly { profileCompleteness: string }[]): number {
  return participants.filter((participant) => participant.profileCompleteness !== "minimal").length;
}

/**
 * 资料不足 = minimal 且**尚未**进入匹配（任务 3 评审 Important：已出现在已发布目录 / 最新 completed 快照中的参会者
 * 不再计入「暂未进入分组」）。`matched` 来自 `matchedParticipantIds`，按 participantId 或 actorId 命中。
 */
export function insufficientProfileCount(
  participants: readonly { actorId?: string; participantId?: string; profileCompleteness: string }[],
  matched: ReadonlySet<string> = EMPTY_IDS,
): number {
  return participants.filter((participant) => participant.profileCompleteness === "minimal" && !isMatched(participant, matched)).length;
}

/** 已发布 → 「已发布」；最新生成 completed 未发布 → 「待发布」；其余 → 「未发布」（与 hook 的 publishedMatchStatus 同义，供纯测试）。 */
export function matchResultLabel(state: Pick<PipelineState, "newestGeneration" | "publishedAt">): "已发布" | "待发布" | "未发布" {
  if (state.publishedAt !== null) return "已发布";
  if (state.newestGeneration?.status === "completed") return "待发布";
  return "未发布";
}

// ═══ 参会者屏（设计 211–251；renderVals 562–578 / 659–665；审阅修订 3）═══

const EMPTY_IDS: ReadonlySet<string> = new Set();

function isMatched(participant: { actorId?: string; participantId?: string }, matched: ReadonlySet<string>): boolean {
  return (participant.participantId !== undefined && matched.has(participant.participantId))
    || (participant.actorId !== undefined && matched.has(participant.actorId));
}

/**
 * 「已参与匹配」集合：已发布 → `publishedResult.directory`（participantId + actorId）；否则最新一条 completed 生成的
 * `snapshot.participants`（只有 participantId）；都没有 → 空。`generations` 按新→旧排列（与 `newestGeneration` 同源）。
 */
export function matchedParticipantIds(
  workspace: {
    generations: readonly { generation: Pick<EventOperationsGeneration, "snapshot" | "status"> }[];
    publishedResult: Pick<EventOperationsPublishedResult, "directory"> | null;
  } | null | undefined,
): ReadonlySet<string> {
  if (!workspace) return EMPTY_IDS;
  if (workspace.publishedResult) {
    return new Set(workspace.publishedResult.directory.flatMap((entry) => [entry.participantId, entry.actorId]));
  }
  const completed = workspace.generations.find(({ generation }) => generation.status === "completed");
  return completed ? new Set(completed.generation.snapshot.participants.map((entry) => entry.participantId)) : EMPTY_IDS;
}

export type PeopleFilter = "all" | "complete" | "incomplete" | "matched";

/** 设计 659 `peopleFilters` 顺序。 */
export const PEOPLE_FILTERS: readonly { key: PeopleFilter; label: string }[] = [
  { key: "all", label: "全部" },
  { key: "complete", label: "资料完整" },
  { key: "incomplete", label: "资料待补充" },
  { key: "matched", label: "已参与匹配" },
];

/** 设计 662–664：选中 `#2E3270` 底白字 500 / 未选白底 `#3B3F7A` 边 `#DDDEFA` 400。 */
export const PEOPLE_FILTER_TONE = {
  on: { bg: "#2E3270", border: "#2E3270", color: "#FFFFFF", weight: 500 },
  off: { bg: "#FFFFFF", border: "#DDDEFA", color: "#3B3F7A", weight: 400 },
} as const;

/** 设计 `p.org`「Google / 产品经理」= company / role；缺一取有的一项；都缺 → 空。 */
export function peopleOrg(participant: { company: string | null; role: string | null }): string {
  return [participant.company, participant.role].filter((part): part is string => Boolean(part && part.trim())).join(" / ");
}

export interface PeopleChip {
  bg: string;
  color: string;
  label: string;
}

/** 设计 575：资料状态 完整 `#E6F1EC/#2F6B4F` / 待补充 `#FBF1E4/#9A6B22`；完整 = `profileCompleteness !== "minimal"`。 */
export function peopleDocChip(participant: { profileCompleteness: string }): PeopleChip {
  return participant.profileCompleteness !== "minimal"
    ? { bg: "#E6F1EC", color: "#2F6B4F", label: "完整" }
    : { bg: "#FBF1E4", color: "#9A6B22", label: "待补充" };
}

/** 设计 576：匹配状态 已参与匹配 `#ECEEFB/#4B4FC7` / 待补充 `#F1F1FA/#6B6F99`。 */
export function peopleMatchChip(matched: boolean): PeopleChip {
  return matched
    ? { bg: "#ECEEFB", color: "#4B4FC7", label: "已参与匹配" }
    : { bg: "#F1F1FA", color: "#6B6F99", label: "待补充" };
}

/** 设计 574 `avatarBg: i % 2 ? '#ECEEFB' : '#DDDEFA'`（签到表 594 同规则）。 */
export function peopleAvatarBg(index: number): "#DDDEFA" | "#ECEEFB" {
  return index % 2 ? "#ECEEFB" : "#DDDEFA";
}

export interface PeopleRowSource {
  actorId: string;
  company: string | null;
  displayName: string;
  participantId: string;
  profileCompleteness: string;
  role: string | null;
}

/** 设计 570–573：四筛选 + 搜索（姓名 + 公司 + 职位，小写包含）。 */
export function filterPeople<T extends PeopleRowSource>(
  participants: readonly T[],
  filter: PeopleFilter,
  query: string,
  matched: ReadonlySet<string>,
): T[] {
  const needle = query.trim().toLowerCase();
  return participants.filter((participant) => {
    const complete = participant.profileCompleteness !== "minimal";
    const inMatch = isMatched(participant, matched);
    if (filter === "complete" && !complete) return false;
    if (filter === "incomplete" && complete) return false;
    if (filter === "matched" && !inMatch) return false;
    if (!needle) return true;
    return `${participant.displayName}${peopleOrg(participant)}`.toLowerCase().includes(needle);
  });
}

/** 右栏三统计：总报名 / 资料完整 / 待补充。 */
export function peopleStats(participants: readonly { profileCompleteness: string }[]): { complete: number; incomplete: number; total: number } {
  const complete = matchEligibleCount(participants);
  return { complete, incomplete: participants.length - complete, total: participants.length };
}

// ═══ 签到屏（设计 253–298；renderVals 580–612 / 666–670 / 696–701；审阅修订 11）═══

export type CheckinFilter = "pending" | "done" | "all";

/** 设计 666 `checkFilters` 顺序：未签到 / 已签到 / 全部。 */
export const CHECKIN_FILTERS: readonly { key: CheckinFilter; label: string }[] = [
  { key: "pending", label: "未签到" },
  { key: "done", label: "已签到" },
  { key: "all", label: "全部" },
];

/** 设计 669：选中 `#DDDEFA/#2E3270/500`，未选 `transparent/#6B6F99/400`。 */
export const CHECKIN_FILTER_TONE = {
  on: { bg: "#DDDEFA", color: "#2E3270", weight: 500 },
  off: { bg: "transparent", color: "#6B6F99", weight: 400 },
} as const;

/** 设计 596–597：状态 chip（「签到失败」无持久态，不出现）。 */
export const CHECKIN_STATUS_CHIP = {
  pending: { bg: "#F1F1FA", color: "#6B6F99", label: "未签到" },
  done: { bg: "#E6F1EC", color: "#2F6B4F", label: "已签到" },
} as const;

/** 设计 598–602：标记到场（黑底）/ 已签到（`#F1F1FA` 底 `#9FA3C4` 字，cursor default）。 */
export const CHECKIN_BUTTON_TONE = {
  arrive: { bg: "#0E1225", border: "#0E1225", color: "#FFFFFF", cursor: "pointer" },
  done: { bg: "#F1F1FA", border: "#F1F1FA", color: "#9FA3C4", cursor: "default" },
} as const;

export interface RosterRowSource {
  checkedIn: boolean;
  checkedInAt: string | null;
  displayName: string;
  participantId: string;
}

/** 设计 586–589 的筛选 + 搜索；搜索 = 姓名小写包含 或 participantId 后缀（旧 limited-check-in-roster 规则）。 */
export function filterRoster<T extends RosterRowSource>(items: readonly T[], filter: CheckinFilter, query: string): T[] {
  const needle = query.trim().toLowerCase();
  return items.filter((item) => {
    if (filter === "pending" && item.checkedIn) return false;
    if (filter === "done" && !item.checkedIn) return false;
    if (!needle) return true;
    return item.displayName.toLowerCase().includes(needle) || item.participantId.toLowerCase().endsWith(needle);
  });
}

/** 四卡：未签到 = 总数 − 已签到。 */
export function checkinCounts(items: readonly { checkedIn: boolean }[]): { checked: number; pending: number } {
  const checked = items.filter((item) => item.checkedIn).length;
  return { checked, pending: items.length - checked };
}

/** 「最新签到」= `checkedInAt` 倒序前 5。 */
export function latestCheckIns<T extends RosterRowSource>(items: readonly T[], limit = 5): T[] {
  return items
    .filter((item) => item.checkedIn && item.checkedInAt !== null && Number.isFinite(Date.parse(item.checkedInAt)))
    .sort((left, right) => Date.parse(right.checkedInAt as string) - Date.parse(left.checkedInAt as string))
    .slice(0, limit);
}

const JST_OFFSET_MS = 9 * 60 * 60 * 1_000;

/** 设计 `l.time`「14:28」：固定 JST 偏移 + UTC getter（与 events-0918/party-date-time.ts 同法，服务端 / 浏览器字节一致）。 */
export function checkInClock(value: string | null | undefined): string {
  const ms = parseTime(value ?? null);
  if (ms === null) return "—";
  const tokyo = new Date(ms + JST_OFFSET_MS);
  return `${String(tokyo.getUTCHours()).padStart(2, "0")}:${String(tokyo.getUTCMinutes()).padStart(2, "0")}`;
}

// ═══ 报名设置屏（设计 300–367；renderVals 608–615 / 704–706；审阅修订 12）═══

/** 说明上限按 API（1000；设计 200 是 mock 初值）。 */
export const FORM_INTRO_LIMIT = 1000;
/** 题集上限（V2 0–4 题）。 */
export const FORM_QUESTION_LIMIT = 4;

export interface FormQuestionRow {
  no: string;
  req: string;
  reqBg: string;
  reqColor: string;
  title: string;
}

/** 设计 608–615：序号 / 题干 / 必填 chip（`#FBECEA/#B5473A`）或 选填（`#F1F1FA/#6B6F99`）；题目契约无 type → 类型 chip 省略。 */
export function formQuestionRows(questions: readonly Pick<EventExperienceQuestion, "prompt" | "required">[]): FormQuestionRow[] {
  return questions.map((question, index) => ({
    no: String(index + 1),
    req: question.required ? "必填" : "选填",
    reqBg: question.required ? "#FBECEA" : "#F1F1FA",
    reqColor: question.required ? "#B5473A" : "#6B6F99",
    title: question.prompt,
  }));
}

export interface FormStatusChip {
  bg: string;
  color: string;
  label: string;
}

/**
 * 顶部状态 chip：`frozenAt` 已到（hook `frozen` 同口径）→ 已冻结（设计警示色 `#FBF1E4/#9A6B22`）；
 * 草稿版本高于已发布 或 尚未发布 → 草稿中（设计 302 `#E6F1EC/#2F6B4F`）；否则 已发布 vN（`#ECEEFB/#4B4FC7`，设计无此态）。
 */
export function formStatusChip(head: EventExperienceHead | null | undefined, now: number): FormStatusChip {
  const frozenAt = parseTime(head?.frozenAt ?? null);
  if (frozenAt !== null && frozenAt <= now) return { bg: "#FBF1E4", color: "#9A6B22", label: "已冻结" };
  const published = head?.publishedVersion ?? null;
  const draft = head?.draftVersion ?? null;
  if (published === null || (draft !== null && draft > published)) return { bg: "#E6F1EC", color: "#2F6B4F", label: "草稿中" };
  return { bg: "#ECEEFB", color: "#4B4FC7", label: `已发布 v${published}` };
}

/** 设计 302「◷ 上次保存 5 分钟前」：以 `draft.createdAt` 相对 `now`；无草稿 / 无效 → 「◷ 尚未保存」。 */
export function lastSavedChip(createdAt: string | null | undefined, now: number): string {
  const ms = parseTime(createdAt ?? null);
  if (ms === null) return "◷ 尚未保存";
  const elapsed = Math.max(0, now - ms);
  const minutes = Math.floor(elapsed / 60_000);
  if (minutes < 1) return "◷ 上次保存 刚刚";
  if (minutes < 60) return `◷ 上次保存 ${minutes} 分钟前`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `◷ 上次保存 ${hours} 小时前`;
  return `◷ 上次保存 ${Math.floor(hours / 24)} 天前`;
}

/** 预览：positioning 单选圆，其余多选方框（审阅修订 12）。 */
export function previewChoice(intent: EventExperienceQuestion["intent"]): "single" | "multi" {
  return intent === "positioning" ? "single" : "multi";
}

export function canAddQuestion(track: EventExperienceQuestionTrack, count: number): boolean {
  return track === "v2" && count < FORM_QUESTION_LIMIT;
}

/** 「＋ 添加问题」禁用时的说明；可添加 → null。 */
export function addQuestionHint(track: EventExperienceQuestionTrack, count: number): string | null {
  if (track !== "v2") return "V1 轨道固定两题必答；切到 V2 后可增删。";
  if (count >= FORM_QUESTION_LIMIT) return `最多 ${FORM_QUESTION_LIMIT} 题。`;
  return null;
}

// ═══ 数据报告屏（设计 369–445；renderVals 617–627 / 700–711；审阅修订 14）═══

export interface ReportStat {
  bg: string;
  icon: string;
  iconBg: string;
  iconColor: string;
  key: string;
  label: string;
  value: number;
}

/** 设计 378–381 四卡装饰（背景 / 图标底色逐字）。 */
const REPORT_STAT_TONE = [
  { bg: "#F7F7FD", icon: "⚇", iconBg: "#ECEEFB", iconColor: "#4B4FC7" },
  { bg: "#F1F8F4", icon: "✓", iconBg: "#E0EFE6", iconColor: "#2F6B4F" },
  { bg: "#FDF8EF", icon: "⇄", iconBg: "#F5E3C2", iconColor: "#9A6B22" },
  { bg: "#F7F7FD", icon: "▤", iconBg: "#ECEEFB", iconColor: "#4B4FC7" },
] as const;

function statsOn(cells: readonly { key: string; label: string; value: number }[]): ReportStat[] {
  return cells.map((cell, index) => ({ ...REPORT_STAT_TONE[index], ...cell }));
}

/** 整体视图四大数（features/events/event-analytics/report.tsx:141–155 字段）。 */
export function reportStats(aggregate: EventAnalyticsOrganizerAggregate): ReportStat[] {
  return statsOn([
    { key: "registrations", label: "报名人数", value: aggregate.registrations.active },
    { key: "checkedIn", label: "到场人数", value: aggregate.checkIns.checkedIn },
    { key: "contacts", label: "联系方式交换", value: aggregate.contactRequests.accepted },
    { key: "followups", label: "后续跟进", value: aggregate.roi.metrics.strongActions.followupReminders },
  ]);
}

/** 我的视图四大数（report.tsx:271–276）。 */
export function attendeeStats(report: EventAnalyticsAttendeeReport): ReportStat[] {
  return statsOn([
    { key: "contacts", label: "已同意联系", value: report.contactRequests.accepted },
    { key: "captured", label: "本人交流记录", value: report.encounters.captured },
    { key: "projected", label: "已投影交流", value: report.encounters.projected },
    { key: "appointments", label: "已完成约谈", value: report.appointments.completed },
  ]);
}

/** 现场转化：整数百分比 + 「分子 / 分母」；分母 0 → 「—」。 */
export function reportRate(numerator: number, denominator: number): { detail: string; value: string } {
  return {
    detail: `${numerator} / ${denominator}`,
    value: denominator === 0 ? "—" : `${Math.round((numerator * 100) / denominator)}%`,
  };
}

/** 会后跟进：已生成 follow-up = `roi.metrics.strongActions.followupReminders`；「已完成跟进」无字段 → 该格省略。 */
export function reportFollowup(aggregate: EventAnalyticsOrganizerAggregate): { generated: number } {
  return { generated: aggregate.roi.metrics.strongActions.followupReminders };
}

/** 设计 439「2026年9月16日 23:59」：固定 JST 偏移 + UTC getter（同 `checkInClock`）。 */
export function reportClock(value: string | null | undefined): string {
  const ms = parseTime(value ?? null);
  if (ms === null) return "—";
  const tokyo = new Date(ms + JST_OFFSET_MS);
  const hh = String(tokyo.getUTCHours()).padStart(2, "0");
  const mm = String(tokyo.getUTCMinutes()).padStart(2, "0");
  return `${tokyo.getUTCFullYear()}年${tokyo.getUTCMonth() + 1}月${tokyo.getUTCDate()}日 ${hh}:${mm}`;
}

/** 设计 709–710：整体 / 我的视图 toggle 装饰。 */
export const REPORT_VIEW_TONE = {
  on: { bg: "#2E3270", color: "#FFFFFF", weight: 500 },
  off: { bg: "transparent", color: "#6B6F99", weight: 400 },
} as const;

/** report.tsx:278–281 签到行：已签到 + JST HH:mm；未签到 → 空副文案。 */
export function attendeeCheckInLine(report: Pick<EventAnalyticsAttendeeReport, "checkIn">): { label: string; sub: string } {
  const checked = report.checkIn.status === "checked_in";
  return { label: checked ? "已签到" : "未签到", sub: checked && report.checkIn.checkedInAt ? checkInClock(report.checkIn.checkedInAt) : "" };
}

/** report.tsx:282–289 分组行文案原样。 */
export function attendeeGroupingLine(report: Pick<EventAnalyticsAttendeeReport, "grouping">): string {
  const grouping = report.grouping;
  if (grouping.status === "available") {
    return `已可见${grouping.roundOneTableNumber ? ` · 第一轮第 ${grouping.roundOneTableNumber} 桌` : ""}${grouping.roundTwoTableNumber ? ` · 第二轮第 ${grouping.roundTwoTableNumber} 桌` : ""}`;
  }
  return grouping.status === "locked" ? "已发布，暂未到可见时间" : "尚未发布";
}

/** report.tsx:253–266 / 298–307 AI 产物状态 + 说明文案原样。 */
export function attendeeAiStatus(
  status: EventAnalyticsAttendeeReport["aiArtifact"]["status"],
  hasArtifact: boolean,
): { description: string; label: string } {
  switch (status) {
    case "queued":
      return { description: "AI 产物正在排队，尚无可展示内容。", label: "排队中" };
    case "running":
      return { description: "AI 产物正在生成，存储并 ready 前不会展示草稿。", label: "生成中" };
    case "failed":
      return { description: "AI 产物生成失败；不会以模板或推测内容替代。", label: "生成失败" };
    case "unconfigured":
      return { description: "尚无可读取的 AI 产物；不会触发生成或返回替代文案。", label: "未启用" };
    default:
      return {
        description: hasArtifact ? "已读取基于本人许可证据生成的现有 AI 产物。" : "AI 产物状态为 ready，但没有可显示的已验证内容。",
        label: "已生成",
      };
  }
}
