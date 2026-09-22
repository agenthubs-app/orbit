/**
 * iOrbit 概览屏（Orbit_0918）。
 *
 * JSX 逐元素来自 docs/designs/Orbit_0918/iOrbit.dc.html 第 46–253 行：
 *   49–55   标题行（iOrbit / 副标题 / 今天日期）
 *   57–74   提问输入 + 四枚 chips + 「打开对话」
 *   77–146  今日日程（78–110）与 日历（109–146）
 *   148–170 已报名活动
 *   172–193 建议与行动
 *   195–212 联系人机会
 *   214–236 本周推进
 *   237–252 继续对话
 *
 * 数据全部真实，设计 `renderVals`（820–907）里的 days / taskData / weekData /
 * selLabel / planDoneLabel 一概不用（计划「审阅修订」19、20）：
 *   - 已报名活动 / 本周目标：服务端注入的 home route view model
 *   - 今日日程 / 月历 / 联系人机会：`refreshHomeDashboardAction()` 的 D25 facts
 *   - 建议与行动：`POST /api/agent/signals?view=home`，行内 done / snooze 走
 *     `PATCH /api/agent/signals/{id}`（「审阅修订」10：写操作不得丢）
 *   - 本周推进进度：`GET /api/agent/ledger` 的真实状态
 *   - 继续对话：`GET /api/ai/conversations/sessions?limit=3`（「审阅修订」16）
 * 无数据一律走空态文案，不伪造数字。
 */
"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import type { AgentLedgerEntry } from "../../../../../features/agent/ledger/contract";
import { useOrbitLanguage } from "../../orbit-language-context";
import type { OrbitHomeViewModel } from "../../orbit-home-route-view-model";
import type { HomeDashboardSnapshot } from "../home-dashboard-route-service";
import type {
  HomeFactsAppointmentItem,
  HomeFactsFollowupItem,
  HomeFactsPersonalItem,
} from "../home-facts-route-service";
import type { HomeFactsViewItem } from "../home-facts-view-model";
import {
  agentSignalsToNextActionRows,
  type AgentTodaySignalView,
} from "../orbit-agent-next-actions";
import {
  iorbitCalendarCells,
  iorbitDayKey,
  iorbitLedgerProgress,
  iorbitRelativeDayLabel,
  iorbitSelectedDayLabel,
} from "./iorbit-model";

const TZ = "Asia/Tokyo";

type Loadable<T> = T | "pending" | "unavailable";

export interface IOrbitHomeSession {
  createdAt: string;
  id: string;
  title: string;
}

export interface IOrbitHomeProps {
  home: OrbitHomeViewModel | null;
  /** 覆盖点，仅测试使用：默认动态 import `home-dashboard-actions`（server action）。 */
  loadSnapshot?: () => Promise<Loadable<HomeDashboardSnapshot>>;
  navigate: (href: string) => void;
  /** 发起提问（壳负责写 `?q=` 并切到对话分支）。 */
  onAsk: (query: string) => void;
  onOpenChat: () => void;
  onOpenHistory: () => void;
  onOpenSession: (sessionId: string) => void;
}

const isPersonalFact = (item: HomeFactsViewItem): item is HomeFactsPersonalItem =>
  "startsAt" in item;
const isAppointmentFact = (item: HomeFactsViewItem): item is HomeFactsAppointmentItem =>
  "startsAtUtc" in item;
const isFollowupFact = (
  item: HomeFactsViewItem,
): item is HomeFactsFollowupItem & { href: string | null } => "contactName" in item;

interface ScheduleRow {
  dayKey: string;
  id: string;
  meta: string;
  /** 排序键：真实时间戳。全天项取当日 00:00（JST），因此排在当天最前。 */
  startMs: number;
  time: string;
  title: string;
  tone: "a" | "b" | "c";
}

function parseHomeSessions(value: unknown): IOrbitHomeSession[] {
  if (typeof value !== "object" || value === null) return [];
  const items = (value as { sessions?: unknown; items?: unknown }).sessions ??
    (value as { items?: unknown }).items;
  if (!Array.isArray(items)) return [];
  const out: IOrbitHomeSession[] = [];
  for (const item of items) {
    if (typeof item !== "object" || item === null) continue;
    const record = item as Record<string, unknown>;
    if (typeof record.id !== "string") continue;
    const createdAt =
      typeof record.updatedAt === "string"
        ? record.updatedAt
        : typeof record.createdAt === "string"
          ? record.createdAt
          : "";
    const organization = record.organization as { customTitle?: unknown } | undefined;
    const custom =
      typeof organization?.customTitle === "string" ? organization.customTitle.trim() : "";
    const title = typeof record.title === "string" ? record.title.trim() : "";
    out.push({ createdAt, id: record.id, title: custom || title });
  }
  return out;
}

function isLedgerEntries(value: unknown): value is { entries: readonly AgentLedgerEntry[] } {
  return (
    typeof value === "object" &&
    value !== null &&
    Array.isArray((value as { entries?: unknown }).entries)
  );
}

function initials(name: string): string {
  const trimmed = name.trim();
  if (!trimmed) return "?";
  const ascii = trimmed.match(/[A-Za-z]+/gu);
  if (ascii && ascii.length > 0) {
    return ascii
      .slice(0, 2)
      .map((part) => part[0]!.toUpperCase())
      .join("");
  }
  return trimmed.slice(0, 1);
}

/** 服务端错误体 `{error:{message}}`（沿用 `orbit-agent-today-workspace.tsx:29-40`）。 */
function signalErrorMessage(value: unknown): string | null {
  if (
    typeof value === "object" &&
    value !== null &&
    "error" in value &&
    typeof (value as { error?: unknown }).error === "object" &&
    (value as { error: unknown }).error !== null &&
    "message" in (value as { error: Record<string, unknown> }).error &&
    typeof (value as { error: { message?: unknown } }).error.message === "string"
  ) {
    return (value as { error: { message: string } }).error.message;
  }
  return null;
}

function snoozeUntilTomorrow(): string {
  const next = new Date();
  next.setDate(next.getDate() + 1);
  next.setHours(9, 0, 0, 0);
  return next.toISOString();
}

export function IOrbitHome({
  home,
  loadSnapshot,
  navigate,
  onAsk,
  onOpenChat,
  onOpenHistory,
  onOpenSession,
}: IOrbitHomeProps) {
  const { language, t } = useOrbitLanguage();
  const lang: "en" | "zh" = language === "zh" ? "zh" : "en";
  const locale = lang === "zh" ? "zh-CN" : "en-US";

  const [draft, setDraft] = useState("");
  const [snapshot, setSnapshot] = useState<Loadable<HomeDashboardSnapshot>>("pending");
  const [ledger, setLedger] = useState<Loadable<readonly AgentLedgerEntry[]>>("pending");
  const [signals, setSignals] = useState<Loadable<readonly AgentTodaySignalView[]>>("pending");
  const [sessions, setSessions] = useState<Loadable<readonly IOrbitHomeSession[]>>("pending");
  const [signalBusyId, setSignalBusyId] = useState<string | null>(null);
  const [signalError, setSignalError] = useState<string | null>(null);
  const [signalsRefreshing, setSignalsRefreshing] = useState(false);

  const now = useMemo(() => new Date(), []);
  const todayKey = iorbitDayKey(now);
  const [todayYear, todayMonth, todayDay] = todayKey.split("-").map(Number) as [
    number,
    number,
    number,
  ];
  const [selectedDay, setSelectedDay] = useState(todayDay);

  useEffect(() => {
    if (typeof window === "undefined") return;
    let live = true;
    const load = loadSnapshot
      ? loadSnapshot()
      : import("../home-dashboard-actions")
          .then((mod) => mod.refreshHomeDashboardAction())
          .then((result) =>
            result.state === "snapshot"
              ? (result.snapshot as Loadable<HomeDashboardSnapshot>)
              : ("unavailable" as const),
          );
    void load
      .then((value) => {
        if (live) setSnapshot(value);
      })
      .catch(() => {
        if (live) setSnapshot("unavailable");
      });
    return () => {
      live = false;
    };
  }, [loadSnapshot]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const controller = new AbortController();
    void fetch("/api/agent/ledger", { cache: "no-store", signal: controller.signal })
      .then(async (response) => {
        const body = (await response.json().catch(() => null)) as {
          data?: unknown;
          success?: boolean;
        } | null;
        if (!response.ok || !body?.success || !isLedgerEntries(body.data)) {
          setLedger("unavailable");
          return;
        }
        setLedger(body.data.entries);
      })
      .catch(() => setLedger("unavailable"));
    return () => controller.abort();
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const controller = new AbortController();
    void fetch("/api/ai/conversations/sessions?limit=3", {
      cache: "no-store",
      signal: controller.signal,
    })
      .then(async (response) => {
        const body = (await response.json().catch(() => null)) as { data?: unknown } | null;
        if (response.ok && body?.data) setSessions(parseHomeSessions(body.data));
        else setSessions("unavailable");
      })
      .catch(() => setSessions("unavailable"));
    return () => controller.abort();
  }, []);

  const refreshSignals = useCallback(
    async (background = false) => {
      if (background) setSignalsRefreshing(true);
      try {
        const response = await fetch("/api/agent/signals?view=home", { method: "POST" });
        const payload = (await response.json().catch(() => null)) as {
          data?: { signals?: readonly AgentTodaySignalView[] };
        } | null;
        if (!response.ok || !payload?.data?.signals) {
          setSignals("unavailable");
          return;
        }
        setSignals(payload.data.signals);
      } catch {
        setSignals("unavailable");
      } finally {
        if (background) setSignalsRefreshing(false);
      }
    },
    [],
  );

  useEffect(() => {
    if (typeof window === "undefined") return;
    void refreshSignals();
  }, [refreshSignals]);

  const updateSignal = async (
    signalId: string,
    status: "dismissed" | "snoozed",
  ) => {
    setSignalBusyId(signalId);
    setSignalError(null);
    try {
      const response = await fetch(`/api/agent/signals/${encodeURIComponent(signalId)}`, {
        body: JSON.stringify({
          status,
          snoozedUntil: status === "snoozed" ? snoozeUntilTomorrow() : undefined,
        }),
        headers: { "content-type": "application/json" },
        method: "PATCH",
      });
      const payload = (await response.json().catch(() => null)) as {
        data?: { signal?: AgentTodaySignalView };
      } | null;
      const updated = payload?.data?.signal;
      if (!response.ok || !updated) {
        setSignalError(
          signalErrorMessage(payload) ??
            t({ en: "The update failed. Please retry.", zh: "更新失败，请重试。" }),
        );
        return;
      }
      setSignals((current) =>
        Array.isArray(current)
          ? current.map((item) => (item.signalId === updated.signalId ? updated : item))
          : current,
      );
    } catch (cause) {
      setSignalError(
        cause instanceof Error
          ? cause.message
          : t({ en: "The update failed. Please retry.", zh: "更新失败，请重试。" }),
      );
    } finally {
      setSignalBusyId(null);
    }
  };

  const facts =
    snapshot !== "pending" && snapshot !== "unavailable" ? snapshot.facts : null;
  const personalItems = (facts?.personal.items ?? []).filter(isPersonalFact);
  const appointmentItems = (facts?.appointments.items ?? []).filter(isAppointmentFact);
  const followupItems = (facts?.followups.current.items ?? []).filter(isFollowupFact);

  const fmtTime = useCallback(
    (iso: string) => {
      const date = new Date(iso);
      return Number.isNaN(date.getTime())
        ? "--:--"
        : new Intl.DateTimeFormat(locale, {
            hour: "2-digit",
            minute: "2-digit",
            timeZone: TZ,
          }).format(date);
    },
    [locale],
  );

  // 设计 152/161 是「接下来要去的两场」：未开始的按时间正序排前，已结束的按时间倒序排后。
  const registeredEvents = useMemo(() => {
    const nowMs = now.getTime();
    return (home?.events ?? [])
      .filter((event) => event.youRsvped || event.stats.youRsvped)
      .map((event) => ({ at: Date.parse(event.startsAt), event }))
      .sort((a, b) => {
        const aPast = a.at < nowMs;
        const bPast = b.at < nowMs;
        if (aPast !== bPast) return aPast ? 1 : -1;
        return aPast ? b.at - a.at : a.at - b.at;
      })
      .map((entry) => entry.event);
  }, [home, now]);

  const scheduleRows: readonly ScheduleRow[] = useMemo(() => {
    const rows: ScheduleRow[] = [
      ...appointmentItems.map((item) => ({
        dayKey: iorbitDayKey(new Date(item.startsAtUtc)),
        id: `appointment:${item.key}`,
        startMs: Date.parse(item.startsAtUtc),
        meta:
          item.medium === "video"
            ? t({ en: "Video", zh: "视频" })
            : item.medium === "phone"
              ? t({ en: "Phone", zh: "电话" })
              : t({ en: "In person", zh: "线下" }),
        time: fmtTime(item.startsAtUtc),
        title: t({ en: "Confirmed appointment", zh: "已确认约谈" }),
        tone: "a" as const,
      })),
      ...personalItems.map((item) => ({
        dayKey: item.occurrenceDate ?? item.startsAt.slice(0, 10),
        id: `personal:${item.key}`,
        startMs: item.allDay
          ? Date.parse(`${item.occurrenceDate ?? item.startsAt.slice(0, 10)}T00:00:00+09:00`)
          : Date.parse(item.startsAt),
        meta: t({ en: "Personal schedule", zh: "个人日程" }),
        time: item.allDay ? t({ en: "All day", zh: "全天" }) : fmtTime(item.startsAt),
        title: item.title,
        tone: "b" as const,
      })),
      ...registeredEvents.map((event) => ({
        dayKey: iorbitDayKey(new Date(event.startsAt)),
        id: `event:${event.id}`,
        startMs: Date.parse(event.startsAt),
        meta: event.venue || event.place,
        time: `${fmtTime(event.startsAt)} – ${fmtTime(event.endsAt)}`,
        title: event.name,
        tone: "c" as const,
      })),
    ];
    // 按真实时间戳排，不能按格式化后的字符串：en-US 的 "06:30 PM" 会排在
    // "10:30 AM" 前面，全天项在两种语言下都无序。无法解析的时间沉到最后。
    return rows.sort((a, b) => {
      const left = Number.isFinite(a.startMs) ? a.startMs : Number.POSITIVE_INFINITY;
      const right = Number.isFinite(b.startMs) ? b.startMs : Number.POSITIVE_INFINITY;
      return left - right || a.id.localeCompare(b.id);
    });
  }, [appointmentItems, fmtTime, personalItems, registeredEvents, t]);

  const todayRows = scheduleRows.filter((row) => row.dayKey === todayKey);
  const monthPrefix = `${todayYear}-${String(todayMonth).padStart(2, "0")}`;
  const selectedKey = `${monthPrefix}-${String(selectedDay).padStart(2, "0")}`;
  const selectedRows = scheduleRows.filter((row) => row.dayKey === selectedKey);
  const markedDays = useMemo(() => {
    const strong = new Set<number>();
    const soft = new Set<number>();
    for (const row of scheduleRows) {
      if (!row.dayKey.startsWith(monthPrefix)) continue;
      const day = Number(row.dayKey.slice(8, 10));
      if (row.tone === "b") soft.add(day);
      else strong.add(day);
    }
    return { soft, strong };
  }, [monthPrefix, scheduleRows]);
  const cells = useMemo(
    () => iorbitCalendarCells(todayYear, todayMonth),
    [todayMonth, todayYear],
  );

  const signalRows = Array.isArray(signals)
    ? agentSignalsToNextActionRows(signals, lang).slice(0, 3)
    : [];

  const progress = Array.isArray(ledger) ? iorbitLedgerProgress(ledger) : null;
  const focusTasks = Array.isArray(ledger)
    ? ledger
        .filter(
          (entry) =>
            entry.status === "approved" ||
            entry.status === "executing" ||
            entry.status === "completed",
        )
        .slice(0, 3)
    : [];

  const recentSessions = Array.isArray(sessions) ? sessions.slice(0, 3) : [];

  // 设计 54：「2026年9月18日 · 星期五」——日期与星期之间是「 · 」，Intl 不会自己加。
  const todayLabel = [
    new Intl.DateTimeFormat(locale, {
      day: "numeric",
      month: "long",
      timeZone: TZ,
      year: "numeric",
    }).format(now),
    new Intl.DateTimeFormat(locale, { timeZone: TZ, weekday: "long" }).format(now),
  ].join(" · ");
  // 设计 115 是「2026年 9月」（年月之间有一个空格），zh-CN 的 Intl 会给「2026年9月」。
  const monthLabel =
    lang === "zh"
      ? `${todayYear}年 ${todayMonth}月`
      : new Intl.DateTimeFormat(locale, { month: "long", timeZone: TZ, year: "numeric" }).format(now);
  const weekdayLabels =
    lang === "zh"
      ? ["日", "一", "二", "三", "四", "五", "六"]
      : ["S", "M", "T", "W", "T", "F", "S"];

  const submitDraft = () => {
    const value = draft.trim();
    if (!value) return;
    setDraft("");
    onAsk(value);
  };

  const briefLines: string[] = [];
  if (snapshot !== "pending") {
    briefLines.push(
      todayRows.length > 0
        ? t({
            en: `${todayRows.length} item(s) on today's schedule, starting at ${todayRows[0]!.time}.`,
            zh: `今天有 ${todayRows.length} 项日程安排，最早一项 ${todayRows[0]!.time} 开始。`,
          })
        : t({
            en: "Nothing confirmed on today's schedule.",
            zh: "今天没有已确认的日程。",
          }),
    );
  }
  if (signalRows.length > 0) {
    briefLines.push(
      t({
        en: `${signalRows.length} relationship change(s) waiting for you.`,
        zh: `有 ${signalRows.length} 条关系变化等待处理。`,
      }),
    );
  }

  // 「审阅修订」37：四个来源都不是 pending 了才算就绪，像素比对按它等待而不是固定 400ms。
  const ready =
    snapshot !== "pending" &&
    ledger !== "pending" &&
    signals !== "pending" &&
    sessions !== "pending";

  return (
    <div className="ir-home" data-orbit-iorbit-ready={ready ? "true" : "false"}>
      {/* 设计 49–55 */}
      <div className="ir-head">
        <div className="ir-head-copy">
          <h1 className="ir-h1">iOrbit</h1>
          <p className="ir-sub">
            {t({
              en: "Today's priorities, events and relationship moves — already sorted for you.",
              zh: "今天的重要事项、活动与人脉推进，我已经帮你整理好了。",
            })}
          </p>
        </div>
        <span className="ir-today">{todayLabel}</span>
      </div>

      {/* 设计 57–74 */}
      <div className="ir-grid-ask">
        <div className="ir-ask-col">
          <div className="ir-ask">
            <span className="ir-ask-icon">✦</span>
            <input
              aria-label={t({ en: "Ask iOrbit", zh: "向 iOrbit 提问" })}
              className="ir-ask-input"
              data-orbit-iorbit-ask-input
              onChange={(event) => setDraft(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  submitDraft();
                }
              }}
              placeholder={t({
                en: "What do you want to move forward today?",
                zh: "今天你想推进什么？",
              })}
              value={draft}
            />
            <button
              aria-label={t({ en: "Send", zh: "发送" })}
              className="btn ir-ask-send"
              onClick={submitDraft}
              type="button"
            >
              →
            </button>
          </div>
          <div className="ir-chips">
            <button
              className="btn ir-chip"
              onClick={() => onAsk(t({ en: "Plan my day", zh: "帮我安排今天" }))}
              type="button"
            >
              {t({ en: "Plan my day", zh: "帮我安排今天" })}
            </button>
            <button
              className="btn ir-chip"
              onClick={() =>
                onAsk(t({ en: "Recommend events for me", zh: "推荐适合我的活动" }))
              }
              type="button"
            >
              {t({ en: "Recommend events for me", zh: "推荐适合我的活动" })}
            </button>
            {/* 设计 66/67：这两枚是导航不是发消息（「审阅修订」16）。 */}
            <a className="ir-chip" href="/app/agent/strategy?view=contacts">
              {t({ en: "Who should I contact first?", zh: "我该先联系谁" })}
            </a>
            <a className="ir-chip" href="/app/agent/strategy">
              {t({ en: "Draft a plan for me", zh: "帮我制定推进计划" })}
            </a>
          </div>
        </div>
        <button className="btn ir-open-chat" onClick={onOpenChat} type="button">
          <span className="ir-open-chat-icon">▤</span>
          {t({ en: "Open chat", zh: "打开对话" })} <span className="ir-caret">›</span>
        </button>
      </div>

      <div className="ir-grid-cards">
        {/* 设计 78–110：今日日程 */}
        <section className="ir-card">
          <div className="ir-card-head">
            <span className="ir-card-title">
              <span className="ir-card-icon">▦</span>
              <strong className="ir-card-h">{t({ en: "Today", zh: "今日日程" })}</strong>
            </span>
            <a className="ir-card-link" href="/app/agent/plan">
              {t({ en: "Full schedule →", zh: "查看完整日程 →" })}
            </a>
          </div>
          <div className="ir-brief">
            <span className="ir-brief-head">
              <span className="ir-brief-icon">☀</span>{" "}
              {t({ en: "Today's brief", zh: "今日简报" })}
            </span>
            {briefLines.length > 0 ? (
              briefLines.map((line) => (
                <span className="ir-brief-line" key={line}>
                  · {line}
                </span>
              ))
            ) : (
              <span className="ir-brief-line">
                ·{" "}
                {t({
                  en: "Reading your day…",
                  zh: "正在读取今天的事实…",
                })}
              </span>
            )}
          </div>
          {todayRows.length > 0 ? (
            <div className="ir-agenda">
              {todayRows.map((row, index) => (
                <div
                  className={index === 0 ? "ir-agenda-row" : "ir-agenda-row ir-agenda-div"}
                  key={row.id}
                >
                  <span className="ir-agenda-time">{row.time}</span>
                  <span className={`ir-agenda-dot ir-tone-${row.tone}`} />
                  <span className="ir-agenda-copy">
                    <strong className="ir-agenda-title">{row.title}</strong>
                    <span className="ir-agenda-meta">{row.meta}</span>
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <p className="ir-note">
              {snapshot === "pending"
                ? t({ en: "Reading your schedule…", zh: "正在读取日程…" })
                : snapshot === "unavailable"
                  ? t({
                      en: "The schedule source is unavailable right now.",
                      zh: "日程来源暂时不可用。",
                    })
                  : t({
                      en: "Nothing confirmed for today.",
                      zh: "今天没有已确认的日程。",
                    })}
            </p>
          )}
        </section>

        {/* 设计 109–146：日历 */}
        <section className="ir-card" id="calendar">
          <div className="ir-card-head">
            <span className="ir-card-title">
              <span className="ir-card-icon">▦</span>
              <strong className="ir-card-h">{t({ en: "Calendar", zh: "日历" })}</strong>
            </span>
            <a className="ir-card-link" href="/app/agent/plan">
              {t({ en: "Open schedule →", zh: "进入日程页 →" })}
            </a>
          </div>
          <div className="ir-cal-grid">
            <div className="ir-cal-left">
              <div className="ir-cal-bar">
                <strong className="ir-cal-month">{monthLabel}</strong>
                <span className="ir-cal-nav">
                  {/* 设计 117/118 的 ‹ › 本身没有 handler，且跨月没有数据源 → aria-disabled（偏差）。 */}
                  <button
                    aria-disabled="true"
                    aria-label={t({ en: "Previous month", zh: "上个月" })}
                    className="btn ir-cal-nav-btn"
                    type="button"
                  >
                    ‹
                  </button>
                  <button
                    aria-disabled="true"
                    aria-label={t({ en: "Next month", zh: "下个月" })}
                    className="btn ir-cal-nav-btn"
                    type="button"
                  >
                    ›
                  </button>
                </span>
              </div>
              <div className="ir-cal-wd">
                {weekdayLabels.map((label, index) => (
                  <span key={`${label}-${index}`}>{label}</span>
                ))}
              </div>
              <div className="ir-cal-days">
                {cells.map((day, index) =>
                  day === null ? (
                    <span className="ir-day-blank" key={`blank-${index}`} />
                  ) : (
                    <button
                      aria-pressed={day === selectedDay}
                      className={
                        day === selectedDay ? "btn ir-day ir-day-on" : "btn ir-day"
                      }
                      data-orbit-iorbit-day={day}
                      key={`day-${day}`}
                      onClick={() => setSelectedDay(day)}
                      type="button"
                    >
                      {day}
                      <span
                        className={
                          day === selectedDay
                            ? "ir-day-dot"
                            : markedDays.strong.has(day)
                              ? "ir-day-dot ir-day-dot-a"
                              : markedDays.soft.has(day)
                                ? "ir-day-dot ir-day-dot-b"
                                : "ir-day-dot"
                        }
                      />
                    </button>
                  ),
                )}
              </div>
            </div>
            <div className="ir-day-panel" data-orbit-iorbit-day-panel>
              <div className="ir-day-panel-head">
                <strong className="ir-day-panel-title">
                  {iorbitSelectedDayLabel(todayYear, todayMonth, selectedDay, lang)}
                </strong>
                <span className="ir-day-panel-count">
                  {t({
                    en: `${selectedRows.length} item(s)`,
                    zh: `${selectedRows.length} 个日程`,
                  })}
                </span>
              </div>
              {selectedRows.length > 0 ? (
                selectedRows.map((row) => (
                  <div className="ir-day-item" key={row.id}>
                    <span className={`ir-day-item-dot ir-tone-${row.tone}`} />
                    <span className="ir-day-item-copy">
                      <span className="ir-day-item-meta">{row.time}</span>
                      <strong className="ir-day-item-title">{row.title}</strong>
                      <span className="ir-day-item-meta">{row.meta}</span>
                    </span>
                  </div>
                ))
              ) : (
                <span className="ir-day-item-meta">
                  {t({ en: "Nothing scheduled.", zh: "这一天没有日程。" })}
                </span>
              )}
            </div>
          </div>
        </section>

        {/* 设计 148–170：已报名活动 */}
        <section className="ir-card ir-card-16">
          <div className="ir-card-head">
            <span className="ir-card-title">
              <span className="ir-card-icon">✧</span>
              <strong className="ir-card-h">
                {t({ en: "Registered events", zh: "已报名活动" })}
              </strong>
            </span>
            <a className="ir-card-link" href="/app/events">
              {t({ en: "Event recommendations →", zh: "查看活动推荐 →" })}
            </a>
          </div>
          {registeredEvents.length > 0 ? (
            registeredEvents.slice(0, 2).map((event, index) => {
              const start = new Date(event.startsAt);
              return (
                <a
                  className="ir-event"
                  href={`/app/events/${encodeURIComponent(event.id)}`}
                  key={event.id}
                >
                  <span
                    className={
                      index === 0 ? "ir-event-date ir-bg-a" : "ir-event-date ir-bg-b"
                    }
                  >
                    <span className="ir-event-month">
                      {new Intl.DateTimeFormat(locale, {
                        month: lang === "zh" ? "numeric" : "short",
                        timeZone: TZ,
                      }).format(start)}
                    </span>
                    {/* 设计 153 是裸数字「18」；zh-CN 的 Intl 会给「18日」，所以直接取日号。 */}
                    <strong className="ir-event-day">
                      {Number(iorbitDayKey(start).slice(8, 10))}
                    </strong>
                  </span>
                  <span className="ir-event-copy">
                    <strong className="ir-event-title">{event.name}</strong>
                    <span className="ir-event-meta">◎ {event.venue || event.place}</span>
                    <span className="ir-event-meta">
                      ◷{" "}
                      {new Intl.DateTimeFormat(locale, {
                        timeZone: TZ,
                        weekday: "short",
                      }).format(start)}{" "}
                      {fmtTime(event.startsAt)} – {fmtTime(event.endsAt)}
                    </span>
                  </span>
                  <span className="ir-event-chip">
                    {t({ en: "Registered", zh: "已报名" })}
                  </span>
                  <span className="ir-caret">›</span>
                </a>
              );
            })
          ) : (
            <p className="ir-note">
              {t({
                en: "No registered events yet.",
                zh: "还没有已报名的活动。",
              })}
            </p>
          )}
        </section>

        {/* 设计 172–193：建议与行动 */}
        <section className="ir-card ir-card-14">
          <div className="ir-card-head">
            <span className="ir-card-title">
              <span className="ir-card-icon">✦</span>
              <strong className="ir-card-h">
                {t({ en: "Suggestions and actions", zh: "建议与行动" })}
              </strong>
            </span>
            <a className="ir-card-link" href="/app/agent/actions">
              {t({ en: "All suggestions →", zh: "查看建议与行动 →" })}
            </a>
          </div>
          {/* 设计没有画失败提示；`orbit-agent-today-workspace.tsx:147+` 原本会把写失败
              显式告诉用户，换屏不能把它吞掉。 */}
          {signalError ? (
            <p className="ir-note ir-note-error" role="alert">
              {signalError}
            </p>
          ) : null}
          {signalRows.length > 0 ? (
            signalRows.map((row) => (
              <div
                className="ir-signal"
                data-orbit-agent-signal={row.signal.signalId}
                key={row.signal.signalId}
              >
                <button
                  className="btn ir-action"
                  onClick={() => {
                    const open = row.signal.actions.find(
                      (action) => action.actionId === "open",
                    );
                    navigate(open?.href ?? "/app/agent/actions");
                  }}
                  type="button"
                >
                  <span className="ir-action-icon">
                    {row.signal.type === "followup_due"
                      ? "✉"
                      : row.signal.type === "event_upcoming"
                        ? "▦"
                        : "⚇"}
                  </span>
                  <span className="ir-action-copy">
                    <strong className="ir-action-title">{row.title}</strong>
                    <span className="ir-action-desc">{row.context}</span>
                  </span>
                  <span className="ir-caret">›</span>
                </button>
                {/* 设计没有画这两枚控件；既有的 done / snooze 写操作不得丢（「审阅修订」10）。 */}
                <span className="ir-signal-ops">
                  <button
                    className="btn ir-signal-op"
                    disabled={signalBusyId === row.signal.signalId}
                    onClick={() => void updateSignal(row.signal.signalId, "dismissed")}
                    type="button"
                  >
                    {t({ en: "Done", zh: "完成" })}
                  </button>
                  <button
                    className="btn ir-signal-op"
                    disabled={signalBusyId === row.signal.signalId}
                    onClick={() => void updateSignal(row.signal.signalId, "snoozed")}
                    type="button"
                  >
                    {t({ en: "Remind tomorrow", zh: "明天提醒" })}
                  </button>
                </span>
              </div>
            ))
          ) : (
            <p className="ir-note">
              {signals === "pending"
                ? t({ en: "Checking relationship changes…", zh: "正在核对关系变化…" })
                : signals === "unavailable"
                  ? t({
                      en: "Relationship signals are unavailable.",
                      zh: "暂时无法读取关系信号。",
                    })
                  : t({
                      en: "You are caught up.",
                      zh: "今天没有必须处理的变化。",
                    })}
            </p>
          )}
          <button
            className="btn ir-refresh"
            data-orbit-agent-signals-refresh
            disabled={signalsRefreshing}
            onClick={() => void refreshSignals(true)}
            type="button"
          >
            {signalsRefreshing
              ? t({ en: "Refreshing", zh: "刷新中" })
              : t({ en: "Refresh", zh: "刷新" })}
          </button>
        </section>

        {/* 设计 195–212：联系人机会 */}
        <section className="ir-card ir-card-14">
          <div className="ir-card-head">
            <span className="ir-card-title">
              <span className="ir-card-icon">⚇</span>
              <strong className="ir-card-h">
                {t({ en: "Contact opportunities", zh: "联系人机会" })}
              </strong>
            </span>
            <a className="ir-card-link" href="/app/contacts">
              {t({ en: "Contact suggestions →", zh: "查看联系人建议 →" })}
            </a>
          </div>
          {followupItems.length > 0 ? (
            followupItems.slice(0, 2).map((item, index) => (
              <a
                className="ir-person"
                href={item.href ?? "/app/contacts"}
                key={item.key}
              >
                <span
                  className={
                    index === 0 ? "ir-person-avatar ir-bg-a" : "ir-person-avatar ir-bg-b"
                  }
                >
                  {initials(item.contactName)}
                </span>
                <span className="ir-person-copy">
                  <span className="ir-person-name-row">
                    <strong className="ir-person-name">{item.contactName}</strong>
                    <span className="ir-person-meta">{item.organization}</span>
                  </span>
                  <span className="ir-person-meta">{item.title}</span>
                </span>
                <span className="ir-caret">›</span>
              </a>
            ))
          ) : (
            <p className="ir-note">
              {snapshot === "pending"
                ? t({ en: "Reading your contacts…", zh: "正在读取联系人…" })
                : t({
                    en: "No contact opportunity is waiting.",
                    zh: "暂时没有待推进的联系人机会。",
                  })}
            </p>
          )}
        </section>

        {/* 设计 214–236：本周推进 */}
        <section className="ir-card ir-card-16">
          <div className="ir-card-head">
            <span className="ir-card-title">
              <span className="ir-card-icon">◎</span>
              <strong className="ir-card-h">
                {t({ en: "This week", zh: "本周推进" })}
              </strong>
            </span>
            <a className="ir-card-link" href="/app/agent/plan">
              {t({ en: "Execution plan →", zh: "查看执行计划 →" })}
            </a>
          </div>
          <div className="ir-goal">
            <span className="ir-goal-copy">
              <strong className="ir-goal-title">
                {t({ en: "This week's goal", zh: "本周目标" })}
              </strong>
              <span className="ir-goal-text">
                {home?.account.relationshipGoal?.trim() ||
                  t({
                    en: "No relationship goal on your profile yet.",
                    zh: "资料里还没有填写关系目标。",
                  })}
              </span>
            </span>
            <span className="ir-progress">
              <span className="ir-progress-row">
                {t({ en: "Progress", zh: "进度" })}{" "}
                <strong className="ir-progress-value">
                  {progress ? `${progress.done}/${progress.total}` : "—"}
                </strong>
              </span>
              <span className="ir-progress-track">
                <span
                  className="ir-progress-fill"
                  style={{ width: progress ? `${progress.percent}%` : "0%" }}
                />
              </span>
            </span>
          </div>
          {focusTasks.length > 0 ? (
            <div className="ir-tasks">
              {focusTasks.map((entry) => {
                const done = entry.status === "completed";
                return (
                  /* 设计 224 是 button（toggle）；账本任务没有写接口（「审阅修订」10）→
                     渲染为静态状态标记，不做假按钮。 */
                  <div className="ir-task" key={entry.entryId}>
                    <span
                      className={done ? "ir-task-box ir-task-box-done" : "ir-task-box"}
                    >
                      {done ? "✓" : ""}
                    </span>
                    <span className={done ? "ir-task-text ir-task-text-done" : "ir-task-text"}>
                      {entry.title}
                    </span>
                  </div>
                );
              })}
            </div>
          ) : (
            <p className="ir-note">
              {ledger === "pending"
                ? t({ en: "Reading your plan…", zh: "正在读取执行计划…" })
                : ledger === "unavailable"
                  ? t({
                      en: "The plan source is unavailable right now.",
                      zh: "执行计划来源暂时不可用。",
                    })
                  : t({
                      en: "No task is in progress this week.",
                      zh: "本周还没有进行中的任务。",
                    })}
            </p>
          )}
        </section>
      </div>

      {/* 设计 237–252：继续对话 */}
      <section className="ir-card ir-card-16">
        <div className="ir-resume-head">
          <span className="ir-resume-title">
            <span className="ir-card-icon">▤</span>
            <strong className="ir-card-h">
              {t({ en: "Continue a conversation", zh: "继续对话" })}
            </strong>
            <span className="ir-resume-note">
              {t({
                en: "Pick up where you left off, or start a new topic.",
                zh: "从上次的对话继续，或选择一个主题开始新的讨论。",
              })}
            </span>
          </span>
          <span className="ir-resume-actions">
            <button className="btn ir-history-btn" onClick={onOpenHistory} type="button">
              ◷ {t({ en: "History", zh: "历史记录" })}
            </button>
            <button className="btn ir-enter-btn" onClick={onOpenChat} type="button">
              {t({ en: "Open chat page →", zh: "进入对话页 →" })}
            </button>
          </span>
        </div>
        {recentSessions.length > 0 ? (
          <div className="ir-resume-grid">
            {recentSessions.map((item) => {
              const when = item.createdAt
                ? iorbitRelativeDayLabel(item.createdAt, now, lang)
                : null;
              return (
                <button
                  className="btn ir-resume-card"
                  data-orbit-iorbit-session={item.id}
                  key={item.id}
                  onClick={() => onOpenSession(item.id)}
                  type="button"
                >
                  <span className="ir-resume-icon">▤</span>
                  <span className="ir-resume-copy">
                    <strong className="ir-resume-card-title">
                      {item.title || t({ en: "Untitled chat", zh: "未命名对话" })}
                    </strong>
                    <span className="ir-resume-card-meta">
                      {when
                        ? t({ en: `Last chat · ${when}`, zh: `上次对话 · ${when}` })
                        : t({ en: "Last chat", zh: "上次对话" })}
                    </span>
                  </span>
                  <span className="ir-caret">›</span>
                </button>
              );
            })}
          </div>
        ) : (
          <p className="ir-note">
            {sessions === "pending"
              ? t({ en: "Reading your conversations…", zh: "正在读取对话记录…" })
              : t({
                  en: "No conversation yet — start one above.",
                  zh: "还没有对话记录，从上面的输入框开始吧。",
                })}
          </p>
        )}
      </section>
    </div>
  );
}
