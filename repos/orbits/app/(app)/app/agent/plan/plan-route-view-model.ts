/**
 * 执行计划（Orbit_0918 iOrbit plan 屏）route view-model。
 *
 * 静态聚合，全部为已交付的既有数据源，不发明新能力：
 *   本周重点任务 = home-facts followups.current + 账本 approved/executing 项
 *   本周日程     = home-facts appointments（七日内已确认约谈）
 *   概览计数     = 上述真实计数 + 账本 awaiting_confirmation 计数
 * 「4 周推进节奏」无服务端接口 → 本屏不做（用户 2026-09-19 拍板：先静态聚合，
 * AI 能力版记入待办），不放设计稿 mock 数字。
 */
import type { AgentLedgerEntry } from "../../../../../features/agent/ledger/contract";
import type { HomeDashboardSnapshot } from "../home-dashboard-route-service";
import type { HomeFactsViewItem } from "../home-facts-view-model";

export type AgentPlanDataState = "pending" | "ready" | "empty" | "unavailable";

export interface AgentPlanFocusTask {
  dueLabel: string | null;
  href: string | null;
  id: string;
  kind: "followup" | "ledger";
  meta: string | null;
  title: string;
}

export interface AgentPlanScheduleItem {
  dayLabel: string;
  href: string;
  id: string;
  meta: string;
  timeLabel: string;
  title: string;
}

export interface AgentPlanOverviewCount {
  key: "decide" | "doing" | "focus" | "schedule";
  label: string;
  value: number | null;
}

export interface AgentPlanViewModel {
  focusState: AgentPlanDataState;
  focusTasks: readonly AgentPlanFocusTask[];
  overview: readonly AgentPlanOverviewCount[];
  schedule: readonly AgentPlanScheduleItem[];
  scheduleState: AgentPlanDataState;
}

const COPY = {
  en: {
    decide: "Needs your decision",
    doing: "In progress",
    focus: "Focus tasks",
    schedule: "This week's meetings",
  },
  zh: {
    decide: "等你决定",
    doing: "进行中",
    focus: "重点任务",
    schedule: "本周日程",
  },
} as const;

const PLAN_TZ = "Asia/Tokyo";

type PlanCopy = Record<keyof (typeof COPY)["zh"], string>;

function isFollowupItem(
  item: HomeFactsViewItem,
): item is Extract<HomeFactsViewItem, { contactName: string }> {
  return "contactName" in item;
}

function isAppointmentItem(
  item: HomeFactsViewItem,
): item is Extract<HomeFactsViewItem, { startsAtUtc: string }> {
  return "startsAtUtc" in item;
}

function dayLabel(iso: string, locale: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat(locale, {
    day: "numeric",
    month: "numeric",
    timeZone: PLAN_TZ,
    weekday: "short",
  }).format(date);
}

function timeLabel(iso: string, locale: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "--:--";
  return new Intl.DateTimeFormat(locale, {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: PLAN_TZ,
  }).format(date);
}

function joinMeta(...parts: readonly (string | null | undefined)[]): string | null {
  const value = parts.filter((part): part is string => Boolean(part?.trim())).join(" · ");
  return value || null;
}

function combineStates(
  left: AgentPlanDataState,
  right: AgentPlanDataState,
): AgentPlanDataState {
  if (left === "pending" || right === "pending") return "pending";
  if (left === "ready" || right === "ready") return "ready";
  if (left === "empty" || right === "empty") return "empty";
  return "unavailable";
}

export function buildAgentPlanViewModel(input: {
  language: "en" | "zh";
  ledger: readonly AgentLedgerEntry[] | "pending" | "unavailable";
  now?: Date;
  snapshot: HomeDashboardSnapshot | "pending" | "unavailable";
}): AgentPlanViewModel {
  const copy: PlanCopy = COPY[input.language === "en" ? "en" : "zh"];
  const locale = input.language === "en" ? "en-US" : "zh-CN";
  const facts = input.snapshot !== "pending" && input.snapshot !== "unavailable"
    ? input.snapshot.facts
    : null;

  const followupTasks: AgentPlanFocusTask[] = (facts?.followups.current.items ?? [])
    .filter(isFollowupItem)
    .map((item) => ({
      dueLabel: item.dueAt ? dayLabel(item.dueAt, locale) : null,
      href: item.href ?? null,
      id: item.key,
      kind: "followup" as const,
      meta: joinMeta(item.contactName, item.organization),
      title: item.title,
    }));

  const ledgerTasks: AgentPlanFocusTask[] = Array.isArray(input.ledger)
    ? input.ledger
        .filter(
          (entry) => entry.status === "approved" || entry.status === "executing",
        )
        .map((entry) => ({
          dueLabel: null,
          href: `/app/agent/actions?entry=${encodeURIComponent(entry.entryId)}`,
          id: entry.entryId,
          kind: "ledger" as const,
          meta: joinMeta(entry.contactName, entry.organization),
          title: entry.title,
        }))
    : [];

  const focusState: AgentPlanDataState = combineStates(
    facts ? (facts.followups.current.items.length > 0 ? "ready" : facts.followups.state === "unavailable" ? "unavailable" : "empty") : input.snapshot === "pending" ? "pending" : "unavailable",
    Array.isArray(input.ledger)
      ? ledgerTasks.length > 0
        ? "ready"
        : "empty"
      : input.ledger === "pending"
        ? "pending"
        : "unavailable",
  );

  const scheduleItems: AgentPlanScheduleItem[] = (facts?.appointments.items ?? [])
    .filter(isAppointmentItem)
    .map((item) => ({
      dayLabel: dayLabel(item.startsAtUtc, locale),
      href: item.href || "/app/schedule",
      id: item.key,
      meta: joinMeta(
        item.medium === "video"
          ? input.language === "zh" ? "视频" : "Video"
          : item.medium === "phone"
            ? input.language === "zh" ? "电话" : "Phone"
            : input.language === "zh" ? "线下" : "In person",
        item.needsReconfirmation
          ? input.language === "zh" ? "待重新确认" : "Needs reconfirmation"
          : null,
      ) ?? "",
      timeLabel: timeLabel(item.startsAtUtc, locale),
      title: input.language === "zh" ? "已确认约谈" : "Confirmed appointment",
    }));

  const appointmentsState: AgentPlanDataState = !facts
    ? input.snapshot === "pending"
      ? "pending"
      : "unavailable"
    : scheduleItems.length > 0
      ? "ready"
      : facts.appointments.state === "unavailable"
        ? "unavailable"
        : "empty";
  const scheduleState: AgentPlanDataState = appointmentsState === "ready" ? "ready" : appointmentsState;

  const decideCount = Array.isArray(input.ledger)
    ? input.ledger.filter((entry) => entry.status === "awaiting_confirmation").length
    : null;
  const doingCount = Array.isArray(input.ledger)
    ? ledgerTasks.length
    : null;

  return {
    focusState,
    focusTasks: [...followupTasks, ...ledgerTasks],
    overview: [
      { key: "focus", label: copy.focus, value: focusState === "unavailable" ? null : followupTasks.length + ledgerTasks.length },
      { key: "schedule", label: copy.schedule, value: scheduleState === "unavailable" ? null : scheduleItems.length },
      { key: "decide", label: copy.decide, value: decideCount },
      { key: "doing", label: copy.doing, value: doingCount },
    ],
    schedule: scheduleItems,
    scheduleState,
  };
}
