/**
 * Today × 日程 合并页 route view-model。
 *
 * 两个权威来源并行加载：操作账本，以及真实日程（actor-owned confirmed
 * appointments + user-approved Orbit Schedule events）。联系人状态、跟进建议和
 * 活动库存都不是日程，不参与这个页面的日历或标题计数。
 */
import type { OrbitScheduleViewModel } from "../../orbit-schedule-route-view-model";
import {
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
import {
  emptyTodayAppointmentSchedule,
  loadConfiguredTodaySchedule,
} from "./today-appointment-schedule";

export type AppTodayMergedSearchParams = AppTodaySearchParams & {
  date?: string | string[];
  view?: string | string[];
};

export interface AppTodayMergedCalendarState {
  selected: CalendarView;
  view: "day" | "month";
}

export interface AppTodayMergedViewModel {
  /** One summary derived from the actionable rows actually rendered on Today. */
  attention: {
    decisionCount: number;
    pendingScheduleCount: number;
    total: number;
  };
  calendar: AppTodayMergedCalendarState;
  /** Confirmed persisted appointments + explicitly approved Orbit Schedule events. */
  timeSpine: OrbitScheduleViewModel | null;
  timeSpineError: {
    description: string;
    guardrail: string;
    recoveryActions: readonly { href: string; label: string }[];
    title: string;
  } | null;
  today: AppTodayRouteViewModel;
}

export interface AppTodayMergedRouteControls {
  appointments?: { scenario?: "failure" };
  today?: AppTodayRouteControls;
}

export interface AppTodayMergedLoaders {
  loadTimeSpine: () => Promise<OrbitScheduleViewModel>;
  loadToday: (
    searchParams?: AppTodaySearchParams,
  ) => Promise<AppTodayRouteViewModel>;
}

const defaultLoaders: AppTodayMergedLoaders = {
  loadTimeSpine: async () => emptyTodayAppointmentSchedule(),
  loadToday: loadAppTodayRouteViewModel,
};

export function createAppTodayMergedLoaders(
  ledgerService: AgentLedgerService | null,
  actorId: string,
  controls: AppTodayMergedRouteControls = {},
): AppTodayMergedLoaders {
  return {
    ...defaultLoaders,
    loadTimeSpine: () => {
      if (controls.appointments?.scenario === "failure") {
        throw new Error("appointment source unavailable");
      }
      return loadConfiguredTodaySchedule(actorId);
    },
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
    hiddenDecisionCount: 0,
    errorCode: "TODAY_SECTION_LOAD_FAILED",
    evidenceIds: [],
    failureMessage: message,
    sections: [],
    selectedEntry: null,
    state: "failure",
  };
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

async function loadTimeSpineSection(
  loadTimeSpine: AppTodayMergedLoaders["loadTimeSpine"],
): Promise<{
  error: AppTodayMergedViewModel["timeSpineError"];
  viewModel: OrbitScheduleViewModel | null;
}> {
  try {
    return { error: null, viewModel: await loadTimeSpine() };
  } catch (error) {
    return {
      error: {
        description: errorMessage(error),
        guardrail: "来源不可用期间，Orbit 不会把跟进任务、提醒或 AI 建议冒充为日程。",
        recoveryActions: [{ href: "/app/today", label: "重新加载" }],
        title: "真实约谈暂时无法加载",
      },
      viewModel: null,
    };
  }
}

function attentionSummary(
  today: AppTodayRouteViewModel,
  timeSpine: OrbitScheduleViewModel | null,
  selectedDateKey: string,
): AppTodayMergedViewModel["attention"] {
  const decisionCount = today.state === "failure" ? 0 : today.decideCount;
  const pendingScheduleCount =
    timeSpine?.schedules.filter(
      (schedule) =>
        schedule.date === selectedDateKey && schedule.status === "待确认",
    ).length ?? 0;

  return {
    decisionCount,
    pendingScheduleCount,
    total: decisionCount + pendingScheduleCount,
  };
}

export async function loadAppTodayMergedViewModel(
  searchParams?: AppTodayMergedSearchParams,
  loaders: AppTodayMergedLoaders = defaultLoaders,
): Promise<AppTodayMergedViewModel> {
  const requestedEntry = readParam(searchParams, "entry");
  const todaySearchParams = requestedEntry
    ? { entry: requestedEntry }
    : undefined;
  const [today, timeSpineSection] = await Promise.all([
    loadTodaySection(todaySearchParams, loaders.loadToday),
    loadTimeSpineSection(loaders.loadTimeSpine),
  ]);
  const timeSpine = timeSpineSection.viewModel;

  const now = new Date();
  const todayKey = dateKeyFromParts({ d: now.getDate(), m: now.getMonth(), y: now.getFullYear() });
  const requestedDate = parseDateParam(searchParams);
  const selected =
    requestedDate ??
    (timeSpine ? firstDayWithMeetings(timeSpine) : { m: now.getMonth(), y: now.getFullYear() });
  const selectedDateKey =
    selected.d != null ? dateKeyFromParts({ d: selected.d, m: selected.m, y: selected.y }) : todayKey;

  return {
    attention: attentionSummary(today, timeSpine, selectedDateKey),
    calendar: { selected, view: parseViewParam(searchParams) },
    timeSpine,
    timeSpineError: timeSpineSection.error,
    today,
  };
}
