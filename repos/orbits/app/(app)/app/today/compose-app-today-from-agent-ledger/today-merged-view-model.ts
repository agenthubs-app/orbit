/**
 * Today × 日程 合并页 route view-model。
 *
 * 三个来源并行加载（账本 / 关系安排 / 跟进日程），任一失败只降级对应区块，
 * 不拖垮整页——每个 section 的 loader 各自包一层 try/catch，再一起
 * `Promise.all`，这样一次意外抛错不会让另外两个区块也失败。
 *
 * 同时负责把 ?date= / ?view= 解析进日历状态，并把关系安排里"已确认"的活动
 * 合流进时间轴（design doc §2 左栏时间轴合流），以及给右栏"可复核安排"算出
 * 哪些卡片和选中日期无关、需要淡化（design doc §7.2：只降不透明度，不隐藏）。
 */
import {
  loadAppFollowupsRouteViewModel,
  type AppFollowupsRouteControls,
  type AppFollowupsRouteScenario,
  type AppFollowupsRouteStateViewModel,
  type AppFollowupsRouteViewModel,
} from "../../followups/compose-app-followups-from-previously-approved-mock-first-capabilities/followups-route-view-model";
import { followupsRouteToOrbitScheduleViewModel } from "../../followups/compose-app-followups-from-previously-approved-mock-first-capabilities/followups-view-model-adapter";
import type {
  OrbitScheduleConnectionView,
  OrbitScheduleItemView,
  OrbitScheduleViewModel,
} from "../../orbit-schedule-route-view-model";
import {
  loadAppScheduleRouteViewModel,
  type AppScheduleRouteControls,
  type AppScheduleArrangementViewModel,
  type AppScheduleRouteStateViewModel,
  type AppScheduleRouteViewModel,
} from "../../schedule/schedule-route-view-model";
import {
  eventsOn,
  firstDayWithMeetings,
  type CalendarView,
} from "../orbit-today-time-spine-helpers";
import {
  loadAppTodayRouteViewModel,
  type AppTodayRouteControls,
  type AppTodayRouteViewModel,
  type AppTodaySearchParams,
} from "./today-route-view-model";
import type { AgentLedgerService } from "../../../../../features/agent/ledger/service";

export type AppTodayMergedSearchParams = AppTodaySearchParams & {
  date?: string | string[];
  view?: string | string[];
};

export interface AppTodayMergedCalendarState {
  selected: CalendarView;
  view: "day" | "month";
}

export interface AppTodayMergedViewModel {
  calendar: AppTodayMergedCalendarState;
  /** ids of arrangement cards unrelated to the selected date — dim, don't hide. */
  dimmedArrangementIds: ReadonlySet<string>;
  followups: AppFollowupsRouteViewModel;
  schedule: AppScheduleRouteViewModel;
  /** merged left-column feed: followups meetings + confirmed arrangement events. null when the followups source failed to load. */
  timeSpine: OrbitScheduleViewModel | null;
  today: AppTodayRouteViewModel;
}

export interface AppTodayMergedRouteControls {
  followups?: AppFollowupsRouteControls;
  schedule?: AppScheduleRouteControls;
  today?: AppTodayRouteControls;
}

export interface AppTodayMergedLoaders {
  loadFollowups: () => Promise<AppFollowupsRouteViewModel>;
  loadSchedule: () => Promise<AppScheduleRouteViewModel>;
  loadToday: (
    searchParams?: AppTodaySearchParams,
  ) => Promise<AppTodayRouteViewModel>;
}

const defaultLoaders: AppTodayMergedLoaders = {
  loadFollowups: loadAppFollowupsRouteViewModel,
  loadSchedule: loadAppScheduleRouteViewModel,
  loadToday: loadAppTodayRouteViewModel,
};

export function createAppTodayMergedLoaders(
  ledgerService: AgentLedgerService | null,
  actorId: string,
  controls: AppTodayMergedRouteControls = {},
): AppTodayMergedLoaders {
  return {
    ...defaultLoaders,
    loadFollowups: () =>
      loadAppFollowupsRouteViewModel(
        controls.followups,
        undefined,
        actorId,
      ),
    loadSchedule: () =>
      loadAppScheduleRouteViewModel(controls.schedule, undefined, actorId),
    loadToday: (searchParams) =>
      loadAppTodayRouteViewModel(
        searchParams,
        { ledgerService },
        controls.today,
      ),
  };
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "未知错误";
}

function readParam(
  searchParams: AppTodayMergedSearchParams | undefined,
  key: string,
): string | null {
  const value = searchParams?.[key];

  if (typeof value === "string") return value;
  if (Array.isArray(value)) return value[0] ?? null;

  return null;
}

function pad2(value: number): string {
  return String(value).padStart(2, "0");
}

function dateKeyFromParts(parts: { d: number; m: number; y: number }): string {
  return `${parts.y}-${pad2(parts.m + 1)}-${pad2(parts.d)}`;
}

function parseDateParam(
  searchParams: AppTodayMergedSearchParams | undefined,
): CalendarView | null {
  const raw = readParam(searchParams, "date");
  const match = raw?.match(/^(\d{4})-(\d{2})-(\d{2})$/);

  if (!match) return null;

  const y = Number(match[1]);
  const m = Number(match[2]) - 1;
  const d = Number(match[3]);

  if (!Number.isFinite(y) || !Number.isFinite(m) || !Number.isFinite(d)) {
    return null;
  }

  return { d, m, y };
}

function parseViewParam(
  searchParams: AppTodayMergedSearchParams | undefined,
): "day" | "month" {
  return readParam(searchParams, "view") === "month" ? "month" : "day";
}

// ---- per-section degradation: an unexpected throw still yields the
// section's own typed failure/route-state shape, so the page never has to
// special-case "the loader threw" vs. "the loader returned a controlled
// failure". ----

function todayLoadFailureViewModel(message: string): AppTodayRouteViewModel {
  return {
    decideCount: 0,
    errorCode: "TODAY_SECTION_LOAD_FAILED",
    evidenceIds: [],
    failureMessage: message,
    sections: [],
    selectedEntry: null,
    state: "failure",
  };
}

function scheduleLoadFailureViewModel(message: string): AppScheduleRouteViewModel {
  const routeState: AppScheduleRouteStateViewModel = {
    copy: {
      description: message,
      eyebrow: "日程安排",
      guardrail: "加载失败期间，Orbit 不会写入日历、提醒、消息或外部系统。",
      nextStep: "重新加载今天的工作台，或稍后再试。",
      title: "可复核安排暂时无法加载",
    },
    errorCode: "SCHEDULE_SECTION_LOAD_FAILED",
    evidenceIds: [],
    recoveryActions: [{ href: "/app/today", label: "重新加载" }],
    scenario: "failure",
  };

  return { routeState, state: "route-state" };
}

function followupsLoadFailureViewModel(
  message: string,
): AppFollowupsRouteViewModel {
  const scenario: AppFollowupsRouteScenario = "failure";
  const routeState: AppFollowupsRouteStateViewModel = {
    copy: {
      description: message,
      emptyState: "时间脊柱暂时没有可显示的约见。",
      guardrail: "加载失败期间，Orbit 不会写入日历、提醒、消息或外部系统。",
      nextStep: "重新加载今天的工作台，或稍后再试。",
      purpose: "来源不可用时，仍显示可见的恢复入口。",
      title: "时间脊柱暂时无法加载",
    },
    errorCode: "FOLLOWUPS_SECTION_LOAD_FAILED",
    evidenceIds: [],
    recoveryActions: [{ href: "/app/today", label: "重新加载" }],
    scenario,
  };

  return { routeState, state: "route-state" };
}

async function loadTodaySection(
  searchParams: AppTodayMergedSearchParams | undefined,
  loadToday: AppTodayMergedLoaders["loadToday"],
): Promise<AppTodayRouteViewModel> {
  try {
    return await loadToday(searchParams);
  } catch (error) {
    return todayLoadFailureViewModel(errorMessage(error));
  }
}

async function loadScheduleSection(
  loadSchedule: AppTodayMergedLoaders["loadSchedule"],
): Promise<AppScheduleRouteViewModel> {
  try {
    return await loadSchedule();
  } catch (error) {
    return scheduleLoadFailureViewModel(errorMessage(error));
  }
}

async function loadFollowupsSection(
  loadFollowups: AppTodayMergedLoaders["loadFollowups"],
): Promise<AppFollowupsRouteViewModel> {
  try {
    return await loadFollowups();
  } catch (error) {
    return followupsLoadFailureViewModel(errorMessage(error));
  }
}

// ---- timeline merge: confirmed arrangement *events* become extra timeline
// entries, rendered by the exact same SchedRow card as a meeting. Contact
// arrangements stay right-column only (design doc §2). ----

function eventArrangementDateTime(
  timing: string,
): { date: string; durationMinutes: number | null; time: string } | null {
  const match = timing.match(
    /(\d{4})年(\d{1,2})月(\d{1,2})日\s*(\d{1,2}):(\d{2})-(\d{1,2}):(\d{2})/,
  );

  if (!match) return null;

  const [, y, m, d, startH, startMin, endH, endMin] = match;
  const start = Number(startH) * 60 + Number(startMin);
  const end = Number(endH) * 60 + Number(endMin);

  return {
    date: `${y}-${pad2(Number(m))}-${pad2(Number(d))}`,
    durationMinutes: end >= start ? end - start : null,
    time: `${pad2(Number(startH))}:${startMin}`,
  };
}

function durationLabel(minutes: number | null): string {
  if (minutes == null) return "时长待定";
  if (minutes % 60 === 0) return `${minutes / 60} 小时`;
  return `${minutes} 分钟`;
}

function confirmedEventTimelineItems(
  arrangements: readonly AppScheduleArrangementViewModel[],
): { connections: OrbitScheduleConnectionView[]; items: OrbitScheduleItemView[] } {
  const connections: OrbitScheduleConnectionView[] = [];
  const items: OrbitScheduleItemView[] = [];

  for (const arrangement of arrangements) {
    if (arrangement.target.kind !== "event") continue;
    if (!/已确认|confirmed/i.test(arrangement.statusLabel)) continue;

    const parsed = eventArrangementDateTime(arrangement.timing);
    if (!parsed) continue;

    const connectionId = `arrangement:${arrangement.id}`;
    connections.push({
      company: "关系安排",
      displayName: arrangement.primaryName,
      g: "g-amber",
      id: connectionId,
      initial: arrangement.primaryName.trim().slice(0, 1) || "活",
      title: "已确认活动",
    });
    items.push({
      cid: connectionId,
      date: parsed.date,
      detailHref: arrangement.href,
      dur: durationLabel(parsed.durationMinutes),
      id: arrangement.id,
      place: arrangement.secondaryName.replace(/^地点：/, ""),
      status: "已确认",
      time: parsed.time,
      topic: arrangement.primaryName,
    });
  }

  return { connections, items };
}

function mergeTimeSpine(
  followupsSchedule: OrbitScheduleViewModel,
  scheduleRoute: AppScheduleRouteViewModel,
): OrbitScheduleViewModel {
  if (scheduleRoute.state !== "success") return followupsSchedule;

  const { connections: eventConnections, items: eventItems } =
    confirmedEventTimelineItems(scheduleRoute.arrangements);

  if (eventItems.length === 0) return followupsSchedule;

  return {
    connections: [...followupsSchedule.connections, ...eventConnections],
    schedules: [...followupsSchedule.schedules, ...eventItems],
    today: followupsSchedule.today,
  };
}

// ---- filter-dim: arrangement cards unrelated to the selected date get
// opacity .45 in the right column. Decision cards have no date attribute
// and are never touched by this rule (design doc §7.2, decided 2026-07-25). ----

function contactArrangementDateKey(
  arrangement: AppScheduleArrangementViewModel,
  todayKey: string,
): string | null {
  const label = arrangement.timing.replace(/^跟进时机：/, "");

  if (label === "今天") return todayKey;
  if (label === "明天") return addDaysToDateKey(todayKey, 1);

  const withinDays = label.match(/^(\d+)\s*天内$/);
  if (withinDays) return addDaysToDateKey(todayKey, Number(withinDays[1]));

  return null;
}

function addDaysToDateKey(key: string, days: number): string {
  const [y, m, d] = key.split("-").map(Number);
  const date = new Date(y, m - 1, d);
  date.setDate(date.getDate() + days);

  return dateKeyFromParts({ d: date.getDate(), m: date.getMonth(), y: date.getFullYear() });
}

function arrangementRelatedDateKey(
  arrangement: AppScheduleArrangementViewModel,
  todayKey: string,
): string | null {
  if (arrangement.target.kind === "event") {
    return eventArrangementDateTime(arrangement.timing)?.date ?? null;
  }

  return contactArrangementDateKey(arrangement, todayKey);
}

function computeDimmedArrangementIds(
  scheduleRoute: AppScheduleRouteViewModel,
  selectedDateKey: string,
  todayKey: string,
): ReadonlySet<string> {
  if (scheduleRoute.state !== "success") return new Set();

  const dimmed = new Set<string>();
  for (const arrangement of scheduleRoute.arrangements) {
    const relatedDate = arrangementRelatedDateKey(arrangement, todayKey);
    if (relatedDate && relatedDate !== selectedDateKey) dimmed.add(arrangement.id);
  }

  return dimmed;
}

export async function loadAppTodayMergedViewModel(
  searchParams?: AppTodayMergedSearchParams,
  loaders: AppTodayMergedLoaders = defaultLoaders,
): Promise<AppTodayMergedViewModel> {
  const requestedEntry = readParam(searchParams, "entry");
  const todaySearchParams = requestedEntry
    ? { entry: requestedEntry }
    : undefined;
  const [today, schedule, followups] = await Promise.all([
    loadTodaySection(todaySearchParams, loaders.loadToday),
    loadScheduleSection(loaders.loadSchedule),
    loadFollowupsSection(loaders.loadFollowups),
  ]);

  const followupsSchedule =
    followups.state === "success"
      ? followupsRouteToOrbitScheduleViewModel(followups)
      : null;
  const timeSpine =
    followupsSchedule && mergeTimeSpine(followupsSchedule, schedule);

  const now = new Date();
  const todayKey = dateKeyFromParts({ d: now.getDate(), m: now.getMonth(), y: now.getFullYear() });
  const requestedDate = parseDateParam(searchParams);
  const selected =
    requestedDate ??
    (timeSpine ? firstDayWithMeetings(timeSpine) : { m: now.getMonth(), y: now.getFullYear() });
  const selectedDateKey =
    selected.d != null ? dateKeyFromParts({ d: selected.d, m: selected.m, y: selected.y }) : todayKey;

  return {
    calendar: { selected, view: parseViewParam(searchParams) },
    dimmedArrangementIds: computeDimmedArrangementIds(schedule, selectedDateKey, todayKey),
    followups,
    schedule,
    timeSpine,
    today,
  };
}

// Exported for the timeline-merge & VM tests — pure, no I/O.
export const __internal = {
  eventArrangementDateTime,
  eventsOn,
};
