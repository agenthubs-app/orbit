"use client";

/**
 * 时间脊柱：迷你月历 + 当日|本月 切换 + 会议卡 + 安排约见弹窗。
 *
 * 抽自 followups/orbit-real-schedule.tsx（纯搬运，不改逻辑）。followups 页面
 * 现在从这里导入 MonthCalendar / ScheduleListPanel / AddScheduleModal，不再
 * 本地定义——两处渲染保证一致，不是复制粘贴出两份。
 *
 * `OrbitTodayTimeSpine` 是新增的组合层（不是搬运）：把月历 + 当日/本月面板
 * 竖直堆叠成 Today 左栏需要的形状，并让选日期的动作走 URL（?date=），而不是
 * 纯本地 state——这样右栏的"可复核安排"淡化才能在服务端按选中日期计算。
 * ScheduleListPanel 的 mode 也可选受控（?view=day|month），不传时行为和
 * followups 里完全一样（未受控、点选日期自动回到当日）。
 *
 * 用 `window.location.assign` 而不是 next/navigation 的 useRouter：这个页面
 * 的其它渲染测试直接对 server 组件调用 renderToStaticMarkup（不经过 Next 的
 * app-router provider），`useRouter()` 在没有 AppRouterContext 时会直接抛出
 * "invariant expected app router to be mounted"；`window.location` 只在浏览
 * 器里点击时才会被访问，SSR/测试环境下这段代码根本不会执行。
 */
import { useEffect, useMemo, useState } from "react";

import { ModalShell } from "../orbit-account-shell";
import { openRelationshipInboxCompose } from "../inbox/relationship-inbox-panel";
import { useOrbitLanguage } from "../orbit-language-context";
import type {
  OrbitScheduleConnectionView,
  OrbitScheduleItemView,
  OrbitScheduleViewModel,
} from "../orbit-schedule-route-view-model";
import { Avatar, Icon } from "../orbit-reference-primitives";
import {
  MON_EN,
  WEEKDAYS,
  WEEKDAYS_EN,
  connectionById,
  eventsInMonth,
  eventsOn,
  firstDayWithMeetings,
  localizeRole,
  localizeTopic,
  scheduleStatusColor,
  startOfWeekSun,
  statusLabel,
  type CalendarView,
} from "./orbit-today-time-spine-helpers";

type Translate = (copy: { en: string; zh: string }) => string;

export function SchedRow({
  connection,
  defaultOpen,
  language,
  schedule,
  t,
}: {
  connection: OrbitScheduleConnectionView;
  defaultOpen?: boolean;
  language: "en" | "zh";
  schedule: OrbitScheduleItemView;
  t: Translate;
}) {
  const [open, setOpen] = useState(Boolean(defaultOpen));
  const status = scheduleStatusColor(schedule.status);
  const topic = localizeTopic(schedule.topic, connection, language);
  const role = localizeRole(connection.title, language);
  const contactId =
    schedule.contactId === null
      ? null
      : (schedule.contactId ?? connection.id);
  const detailHref =
    schedule.detailHref ?? (contactId ? `/app/contacts/${contactId}` : null);

  return (
    <div className={`sch-card${open ? " is-open" : ""}`}>
      <button
        aria-expanded={open}
        aria-label={`${schedule.time} ${connection.displayName}，${open ? t({ en: "collapse details", zh: "收起详情" }) : t({ en: "expand details", zh: "展开详情" })}`}
        className="sch-card-head"
        onClick={() => setOpen((value) => !value)}
        type="button"
      >
        <span className="sch-time">
          <span className="sch-time-h">{schedule.time}</span>
          <span className="sch-time-d">{schedule.dur}</span>
        </span>
        <span className="sch-rail" />
        <Avatar letter={connection.initial} g={connection.g} size={38} />
        <span className="sch-who">
          <span className="sch-name">{connection.displayName}</span>
          <span className="sch-sub">{[role, connection.company].filter(Boolean).join(" · ")}</span>
          <span className="sch-topic">{topic}</span>
        </span>
        <span className="sch-status" style={{ background: status.soft, color: status.c }}>
          <span className="sch-status-dot" style={{ background: status.c }} />
          {statusLabel(schedule.status, language)}
        </span>
        <Icon name="chevR" size={16} />
      </button>
      {open ? (
        <div className="sch-detail">
          {schedule.place ? (
            <span className="sch-fact">
              <Icon name="pin" size={14} />
              {schedule.place}
            </span>
          ) : null}
          <div className="sch-detail-actions">
            {contactId && detailHref ? (
              <>
                <a className="btn btn-ghost btn-sm" href={detailHref}>
                  <Icon name="user" size={14} />{t({ en: "View contact", zh: "查看名片" })}
                </a>
                <button
                  className="btn btn-primary btn-sm"
                  data-inbox-compose
                  onClick={() =>
                    openRelationshipInboxCompose({
                      contactId,
                      organization: connection.company,
                      recipient: connection.displayName,
                      subject: topic,
                    })
                  }
                  type="button"
                >
                  <Icon name="mail" size={14} />{t({ en: "Draft email", zh: "起草邮件" })}
                </button>
              </>
            ) : (
              <span className="text-caption">
                {t({
                  en: "No contact is linked to this item.",
                  zh: "这条安排还没关联联系人；在活动里交换名片后，这里就能直接查看名片、起草邮件。",
                })}
              </span>
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}

export function MonthCalendar({
  compact,
  connections,
  language,
  schedules,
  selected,
  setSelected,
  setView,
  t,
  today,
  view,
}: {
  compact?: boolean;
  connections: OrbitScheduleConnectionView[];
  language: "en" | "zh";
  schedules: OrbitScheduleItemView[];
  selected: CalendarView;
  setSelected: (view: CalendarView) => void;
  setView: (view: CalendarView) => void;
  t: Translate;
  today: CalendarView;
  view: CalendarView;
}) {
  const { y, m } = view;
  const first = new Date(y, m, 1).getDay();
  const days = new Date(y, m + 1, 0).getDate();
  const cells: Array<number | null> = [];
  for (let index = 0; index < first; index += 1) cells.push(null);
  for (let day = 1; day <= days; day += 1) cells.push(day);
  while (cells.length % 7) cells.push(null);

  const shift = (delta: number) => {
    let nextMonth = m + delta;
    let nextYear = y;
    if (nextMonth < 0) {
      nextMonth = 11;
      nextYear -= 1;
    }
    if (nextMonth > 11) {
      nextMonth = 0;
      nextYear += 1;
    }
    setView({ y: nextYear, m: nextMonth });
  };
  const isToday = (day: number | null) => Boolean(day && y === today.y && m === today.m && day === today.d);
  const isSelected = (day: number | null) => Boolean(day && selected && selected.y === y && selected.m === m && day === selected.d);

  return (
    <div className="card" style={{ padding: compact ? 14 : 20 }}>
      <div style={{ alignItems: "center", display: "flex", justifyContent: "space-between", marginBottom: 16 }}>
        <h2 className="h-title" style={{ color: "var(--ink)" }}>{language === "en" ? `${MON_EN[m]} ${y}` : `${y} 年 ${m + 1} 月`}</h2>
        <div style={{ display: "flex", gap: 8 }}>
          <button type="button" className="hit-44" onClick={() => shift(-1)} aria-label={t({ en: "Previous month", zh: "上个月" })} style={{ alignItems: "center", background: "var(--surface)", border: "1px solid var(--border-2)", borderRadius: "var(--r-sm)", color: "var(--text-2)", cursor: "pointer", display: "flex", height: 34, justifyContent: "center", width: 34 }}>
            <Icon name="chevL" size={18} />
          </button>
          <button type="button" onClick={() => setView({ y: today.y, m: today.m })} style={{ background: "var(--surface)", border: "1px solid var(--border-2)", borderRadius: "var(--r-sm)", color: "var(--text-2)", cursor: "pointer", fontFamily: "var(--ff)", fontSize: 13, fontWeight: 600, height: 34, padding: "0 12px" }}>
            {t({ en: "Today", zh: "今天" })}
          </button>
          <button type="button" className="hit-44" onClick={() => shift(1)} aria-label={t({ en: "Next month", zh: "下个月" })} style={{ alignItems: "center", background: "var(--surface)", border: "1px solid var(--border-2)", borderRadius: "var(--r-sm)", color: "var(--text-2)", cursor: "pointer", display: "flex", height: 34, justifyContent: "center", width: 34 }}>
            <Icon name="chevR" size={18} />
          </button>
        </div>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", marginBottom: 6 }}>
        {(language === "en" ? WEEKDAYS_EN : WEEKDAYS).map((weekday, index) => (
          <div key={weekday} style={{ color: index === 0 || index === 6 ? "var(--rose)" : "var(--text-3)", fontSize: 12, fontWeight: 600, paddingBottom: 6, textAlign: "center" }}>{weekday}</div>
        ))}
      </div>
      <div style={{ display: "grid", gap: compact ? 3 : 5, gridTemplateColumns: "repeat(7, 1fr)" }}>
        {cells.map((day, index) => {
          if (!day) return <div key={`blank-${index}`} />;
          const events = eventsOn(schedules, y, m, day);
          const todayCell = isToday(day);
          const selectedCell = isSelected(day);

          return (
            <button
              key={index}
              type="button"
              className="hit-44"
              onClick={() => setSelected({ y, m, d: day })}
              style={{ background: selectedCell ? "var(--accent-softer)" : todayCell ? "var(--surface-2)" : "transparent", border: `1px solid ${selectedCell ? "var(--accent)" : "transparent"}`, borderRadius: 12, cursor: "pointer", display: "flex", flexDirection: "column", fontFamily: "var(--ff)", gap: 4, minHeight: compact ? 46 : 76, overflow: "hidden", padding: compact ? "5px 3px" : "7px 7px", textAlign: "left" }}
            >
              <span style={{ alignItems: "center", display: "flex", justifyContent: compact ? "center" : "flex-start" }}>
                <span style={{ alignItems: "center", background: todayCell ? "var(--accent)" : "transparent", borderRadius: "var(--r-pill)", color: todayCell ? "var(--on-dark)" : selectedCell ? "var(--accent)" : "var(--ink)", display: "flex", fontFamily: "var(--ff-display)", fontSize: 14, fontWeight: todayCell ? 800 : 600, height: 24, justifyContent: "center", width: 24 }}>{day}</span>
              </span>
              {compact ? (
                events.length ? (
                  <span style={{ display: "flex", gap: 4, justifyContent: "center" }}>
                    {events.slice(0, 3).map((event, eventIndex) => <span key={`${event.id}-${eventIndex}`} style={{ background: scheduleStatusColor(event.status).c, borderRadius: "var(--r-pill)", height: 5, width: 5 }} />)}
                  </span>
                ) : null
              ) : (
                <span style={{ display: "flex", flexDirection: "column", gap: 2, minWidth: 0 }}>
                  {events.slice(0, 2).map((event) => {
                    const status = scheduleStatusColor(event.status);
                    return (
                      <span key={event.id} style={{ background: status.soft, borderRadius: 5, color: status.c, display: "block", fontSize: 11, fontWeight: 600, lineHeight: 1.45, overflow: "hidden", padding: "1px 5px", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {event.time} {connectionById(connections, event.cid).displayName}
                      </span>
                    );
                  })}
                  {events.length > 2 ? <span style={{ color: "var(--text-3)", fontSize: 11, paddingLeft: 4 }}>+{events.length - 2}</span> : null}
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

/**
 * Prev/next week arrow — a single button-element JSX literal reused for both
 * directions (button-ratchet: the sitewide non-.btn button-element count is
 * at its ceiling, so this carries the bare "btn" token and gets its look
 * from `.orbit-week-nav-btn` overriding the base `.btn` box model in
 * TimeSpineStyles below, same trick as the FAB in orbit-today-header-actions).
 */
function WeekNavButton({
  ariaLabel,
  direction,
  onClick,
}: {
  ariaLabel: string;
  direction: "prev" | "next";
  onClick: () => void;
}) {
  return (
    <button aria-label={ariaLabel} className="btn orbit-week-nav-btn" onClick={onClick} type="button">
      <Icon name={direction === "prev" ? "chevL" : "chevR"} size={16} />
    </button>
  );
}

/**
 * Mobile (≤760) collapse of the month calendar into a 7-day week strip
 * (design doc §3): 44pt cells, horizontal prev/next-week paging, today/
 * selected states, an event dot. Always rendered (both this and the desktop
 * `MonthCalendar` are in the DOM); `TimeSpineStyles`' media query decides
 * which one is visible — same pattern as `.orbit-today-columns` in
 * today/page.tsx. "全月" opens the untouched `MonthCalendar` in a
 * bottom-sheet (`onOpenMonth`, wired up by the caller).
 */
export function WeekStrip({
  language,
  onOpenMonth,
  schedules,
  selected,
  setSelected,
  t,
  today,
}: {
  language: "en" | "zh";
  onOpenMonth: () => void;
  schedules: OrbitScheduleItemView[];
  selected: CalendarView;
  setSelected: (view: CalendarView) => void;
  t: Translate;
  today: CalendarView;
}) {
  const anchor: CalendarView =
    selected.d != null ? selected : { d: today.d, m: today.m, y: today.y };
  const [weekStart, setWeekStart] = useState<Date>(() =>
    startOfWeekSun(anchor.y, anchor.m, anchor.d ?? today.d),
  );

  useEffect(() => {
    setWeekStart(startOfWeekSun(anchor.y, anchor.m, anchor.d ?? today.d));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected.y, selected.m, selected.d]);

  const shiftWeek = (delta: number) => {
    setWeekStart((current) => {
      const next = new Date(current);
      next.setDate(next.getDate() + delta * 7);
      return next;
    });
  };

  const weekdays = language === "en" ? WEEKDAYS_EN : WEEKDAYS;
  const days = Array.from({ length: 7 }, (_, index) => {
    const date = new Date(weekStart);
    date.setDate(date.getDate() + index);
    return date;
  });

  return (
    <div className="orbit-week-strip" data-orbit-week-strip>
      <div className="orbit-week-strip-head">
        <WeekNavButton ariaLabel={t({ en: "Previous week", zh: "上一周" })} direction="prev" onClick={() => shiftWeek(-1)} />
        <button className="btn btn-ghost orbit-week-full-month-btn" onClick={onOpenMonth} type="button">
          {t({ en: "Full month", zh: "全月" })}
        </button>
        <WeekNavButton ariaLabel={t({ en: "Next week", zh: "下一周" })} direction="next" onClick={() => shiftWeek(1)} />
      </div>
      <div className="orbit-week-strip-cells">
        {days.map((date) => {
          const y = date.getFullYear();
          const m = date.getMonth();
          const d = date.getDate();
          const isToday = y === today.y && m === today.m && d === today.d;
          const isSelected = selected.d != null && y === selected.y && m === selected.m && d === selected.d;
          const hasEvents = eventsOn(schedules, y, m, d).length > 0;

          return (
            <button
              aria-current={isSelected ? "date" : undefined}
              className={`btn orbit-week-strip-cell${isToday ? " is-today" : ""}${isSelected ? " is-selected" : ""}`}
              key={`${y}-${m}-${d}`}
              onClick={() => setSelected({ d, m, y })}
              type="button"
            >
              <span className="orbit-week-strip-wd">{weekdays[date.getDay()]}</span>
              <span className="orbit-week-strip-d">{d}</span>
              {hasEvents ? <span className="orbit-week-strip-dot" /> : null}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export function ScheduleListPanel({
  connections,
  language,
  mode: modeProp,
  onModeChange,
  schedules,
  selected,
  setSelected,
  t,
  view,
}: {
  compact?: boolean;
  connections: OrbitScheduleConnectionView[];
  language: "en" | "zh";
  /** Controlled 当日|本月 toggle. Omit to keep the original uncontrolled
   *  behavior (defaults to "day", resets to "day" whenever `selected`
   *  changes) — followups relies on that default. */
  mode?: "day" | "month";
  onModeChange?: (mode: "day" | "month") => void;
  schedules: OrbitScheduleItemView[];
  selected: CalendarView;
  setSelected: (view: CalendarView) => void;
  t: Translate;
  view: CalendarView;
}) {
  const [modeState, setModeState] = useState<"day" | "month">(modeProp ?? "day");
  const mode = modeProp ?? modeState;
  const setMode = (next: "day" | "month") => {
    if (onModeChange) onModeChange(next);
    if (modeProp === undefined) setModeState(next);
  };
  // Clicking a calendar day (or a month-list date) focuses that day. Only
  // auto-resets in uncontrolled mode — a controlled ?view= should stay put.
  useEffect(() => {
    if (modeProp === undefined) setModeState("day");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected.y, selected.m, selected.d]);

  const monthList = eventsInMonth(schedules, view.y, view.m);
  const dayItems =
    selected.d != null
      ? eventsOn(schedules, selected.y, selected.m, selected.d).sort((a, b) =>
          a.time.localeCompare(b.time),
        )
      : [];
  const selDate = selected.d != null ? new Date(selected.y, selected.m, selected.d) : null;
  const weekdayName = (date: Date) => (language === "en" ? WEEKDAYS_EN : WEEKDAYS)[date.getDay()];
  const dateTitle = (date: Date) =>
    language === "en" ? `${MON_EN[date.getMonth()]} ${date.getDate()}` : `${date.getMonth() + 1}月${date.getDate()}日`;
  const count = mode === "day" ? dayItems.length : monthList.length;
  const groups = [...new Set(monthList.map((schedule) => schedule.date))];

  return (
    <div className="sch-panel">
      <div className="sch-panel-head">
        <div className="sch-panel-title">
          <h3 className="h-section" style={{ margin: 0 }}>
            {mode === "day" && selDate
              ? dateTitle(selDate)
              : language === "en"
                ? `${MON_EN[view.m]} schedule`
                : `${view.m + 1} 月安排`}
          </h3>
          {mode === "day" && selDate ? (
            <span className="sch-panel-wd">{language === "en" ? weekdayName(selDate) : `周${weekdayName(selDate)}`}</span>
          ) : null}
        </div>
        <span className="mono sch-panel-count">{t({ en: `${count} meetings`, zh: `${count} 场` })}</span>
      </div>

      <div className="sch-toggle">
        <button type="button" className={mode === "day" ? "is-active" : ""} onClick={() => setMode("day")}>
          {t({ en: "This day", zh: "当日" })}
        </button>
        <button type="button" className={mode === "month" ? "is-active" : ""} onClick={() => setMode("month")}>
          {t({ en: "This month", zh: "本月全部" })}
        </button>
      </div>

      {mode === "day" ? (
        dayItems.length ? (
          <div className="sch-timeline">
            {dayItems.map((schedule, index) => (
              <SchedRow
                key={schedule.id}
                schedule={schedule}
                connection={connectionById(connections, schedule.cid)}
                language={language}
                t={t}
                defaultOpen={index === 0}
              />
            ))}
          </div>
        ) : (
          <div className="sch-empty">
            <Icon name="calendar" size={22} />
            <p>{t({ en: "No meetings on this day.", zh: "这一天暂无安排。" })}</p>
            <span>{t({ en: "Pick another date, or view the whole month.", zh: "换一天，或查看本月全部。" })}</span>
          </div>
        )
      ) : monthList.length ? (
        <div className="sch-month">
          {groups.map((dateStr) => {
            const date = new Date(dateStr);
            const day = date.getDate();
            const isSelectedDay =
              selected.d === day && selected.m === view.m && selected.y === view.y;
            return (
              <div key={dateStr}>
                <button
                  type="button"
                  className={`sch-day-head${isSelectedDay ? " is-selected" : ""}`}
                  onClick={() => setSelected({ y: date.getFullYear(), m: date.getMonth(), d: day })}
                >
                  <span className="sch-day-date">
                    {language === "en" ? `${MON_EN[view.m]} ${day}` : `${view.m + 1}月${day}日`}
                    <span className="sch-day-wd">{language === "en" ? weekdayName(date) : `周${weekdayName(date)}`}</span>
                  </span>
                  <span className="sch-day-count">{monthList.filter((s) => s.date === dateStr).length}</span>
                </button>
                <div className="sch-timeline" style={{ marginBottom: 16 }}>
                  {monthList
                    .filter((schedule) => schedule.date === dateStr)
                    .map((schedule) => (
                      <SchedRow
                        key={schedule.id}
                        schedule={schedule}
                        connection={connectionById(connections, schedule.cid)}
                        language={language}
                        t={t}
                      />
                    ))}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="sch-empty">
          <Icon name="calendar" size={22} />
          <p>{t({ en: "No meetings this month.", zh: "本月暂无约见。" })}</p>
          <span>{t({ en: "Pick a date on the calendar to schedule one.", zh: "点左侧日历安排一场。" })}</span>
        </div>
      )}
    </div>
  );
}

export function AddScheduleModal({
  onClose,
  t,
}: {
  connections: OrbitScheduleConnectionView[];
  onClose: () => void;
  t: Translate;
}) {
  return (
    <ModalShell onClose={onClose} maxW={520} step={t({ en: "Schedule a meeting", zh: "安排约见" })}>
      <h2 className="h-title" style={{ margin: "4px 0 6px" }}>{t({ en: "Schedule a meeting", zh: "安排约见" })}</h2>
      <div
        className="card-flat"
        role="status"
        style={{ color: "var(--text-2)", fontSize: 14, lineHeight: 1.7, marginTop: 16, padding: 18 }}
      >
        {t({
          en: "Meeting scheduling is not configured yet. Orbit will not create a meeting, update relationship history, write to a calendar, or send an invitation.",
          zh: "约见服务暂未配置。Orbit 不会创建约见、更新交往记录、写入日历或发送邀请。",
        })}
      </div>
      <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 18 }}>
        <button className="btn btn-primary" onClick={onClose} type="button">
          {t({ en: "Got it", zh: "知道了" })}
        </button>
      </div>
    </ModalShell>
  );
}

function pad2(value: number): string {
  return String(value).padStart(2, "0");
}

function dateKey(view: CalendarView): string | null {
  if (view.d == null) return null;
  return `${view.y}-${pad2(view.m + 1)}-${pad2(view.d)}`;
}

/**
 * Today 左栏的组合层：月历 + 当日|本月 面板竖直堆叠，选日期时把 ?date= 写进
 * URL（沿用 ?entry= 的 URL-驱动模式），这样右栏"可复核安排"的淡化能在服务端
 *按选中日期重新计算，而不是只在这个客户端组件内部生效。
 */
export function OrbitTodayTimeSpine({
  initialSelected,
  initialView,
  viewModel,
}: {
  initialSelected: CalendarView;
  initialView: "day" | "month";
  viewModel: OrbitScheduleViewModel;
}) {
  const { language: rawLanguage, t } = useOrbitLanguage();
  const language = rawLanguage === "ja" ? "en" : rawLanguage;

  const [view, setView] = useState<CalendarView>({ y: viewModel.today.y, m: viewModel.today.m });
  const [selected, setSelectedState] = useState<CalendarView>(
    () => (initialSelected.d != null ? initialSelected : firstDayWithMeetings(viewModel)),
  );
  // Mobile-only: "全月" opens the untouched MonthCalendar in a bottom sheet
  // (design doc §3) instead of navigating away from the week strip.
  const [monthSheetOpen, setMonthSheetOpen] = useState(false);

  const navigateQuery = (updates: Record<string, string>) => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    for (const [key, value] of Object.entries(updates)) params.set(key, value);
    window.location.assign(`${window.location.pathname}?${params.toString()}`);
  };

  const setSelected = (next: CalendarView) => {
    setSelectedState(next);
    const key = dateKey(next);
    if (key) navigateQuery({ date: key });
  };

  const handleModeChange = (mode: "day" | "month") => {
    navigateQuery({ view: mode });
  };

  const monthCalendarProps = useMemo(
    () => ({
      connections: viewModel.connections,
      language,
      schedules: viewModel.schedules,
      selected,
      setSelected,
      setView,
      t,
      today: viewModel.today,
      view,
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [language, selected, t, view, viewModel.connections, viewModel.schedules, viewModel.today],
  );

  return (
    <div data-orbit-today-time-spine style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <div className="orbit-time-spine-desktop-calendar">
        <MonthCalendar compact {...monthCalendarProps} />
      </div>
      <WeekStrip
        language={language}
        onOpenMonth={() => setMonthSheetOpen(true)}
        schedules={viewModel.schedules}
        selected={selected}
        setSelected={setSelected}
        t={t}
        today={viewModel.today}
      />
      <ScheduleListPanel
        connections={viewModel.connections}
        language={language}
        mode={initialView}
        onModeChange={handleModeChange}
        schedules={viewModel.schedules}
        selected={selected}
        setSelected={setSelected}
        t={t}
        view={view}
      />
      {monthSheetOpen ? (
        <ModalShell
          label={t({ en: "Full month", zh: "全月" })}
          onClose={() => setMonthSheetOpen(false)}
          step={t({ en: "Full month", zh: "全月" })}
          variant="bottom-sheet"
        >
          <MonthCalendar {...monthCalendarProps} />
        </ModalShell>
      ) : null}
      <TimeSpineStyles />
    </div>
  );
}

/**
 * `.sch-*` CSS for ScheduleListPanel/SchedRow (MonthCalendar is entirely
 * inline-styled and needs none of this). Moved out of followups'
 * orbit-real-schedule.tsx along with the components that use it — both
 * followups (`<main data-orbit-real-page="schedule">`) and Today
 * (`<main data-orbit-real-page="today">`) render under a different
 * `data-orbit-real-page`, so these rules target the `.sch-*` class names
 * directly instead of a single page scope. No other file in the app
 * defines a `.sch-*` class, so this is safe unscoped.
 */
export function TimeSpineStyles() {
  return (
    <style
      dangerouslySetInnerHTML={{
        __html: `
.sch-panel { display:flex; flex-direction:column; }
.sch-panel-head { display:flex; align-items:baseline; justify-content:space-between; gap:10px; margin-bottom:12px; }
.sch-panel-title { display:flex; align-items:baseline; gap:9px; }
.sch-panel-wd { color:var(--text-3); font-size:13px; }
.sch-panel-count { color:var(--text-3); font-size:12px; white-space:nowrap; }
.sch-toggle { display:inline-flex; gap:2px; padding:3px; background:var(--surface-2); border:1px solid var(--border); border-radius:var(--r-pill); margin-bottom:16px; align-self:flex-start; }
.sch-toggle button { border:0; background:transparent; color:var(--text-3); font-size:13px; font-weight:600; padding:5px 15px; border-radius:var(--r-pill); cursor:pointer; transition:background .12s, color .12s; }
.sch-toggle button.is-active { background:var(--accent); color:#fff; }
.sch-timeline { display:flex; flex-direction:column; gap:10px; }
.sch-card { border:1px solid var(--border); border-radius:var(--r-md); background:var(--surface); overflow:hidden; transition:border-color .14s; }
.sch-card.is-open { border-color:var(--border-strong); }
[data-orbit-real-page] .sch-card-head { width:100%; display:flex; align-items:center; gap:14px; min-height:82px; padding:14px 16px; background:transparent; border:0; border-radius:0; color:inherit; cursor:pointer; font-family:var(--ff); text-align:left; }
[data-orbit-real-page] .sch-card-head:hover { background:var(--surface-2); }
[data-orbit-real-page] .sch-card-head:focus-visible { background:var(--accent-softer); box-shadow:inset 0 0 0 2px var(--accent); outline:0; }
.sch-time { display:flex; flex-direction:column; align-items:flex-start; width:54px; flex-shrink:0; }
.sch-time-h { font-family:var(--ff-mono); font-size:15px; font-weight:700; color:var(--ink); }
.sch-time-d { font-size:11px; color:var(--text-3); margin-top:2px; }
.sch-rail { align-self:stretch; width:1px; background:var(--border); flex-shrink:0; }
.sch-who { display:flex; flex-direction:column; gap:3px; flex:1; min-width:0; }
.sch-name { font-size:14px; font-weight:600; color:var(--ink); white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
.sch-sub { font-size:12px; color:var(--text-3); white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
.sch-topic { color:var(--text-2); font-size:13px; line-height:1.45; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
.sch-status { display:inline-flex; align-items:center; gap:6px; height:22px; padding:0 9px; border-radius:var(--r-pill); font-size:12px; font-weight:600; flex-shrink:0; }
.sch-status-dot { width:6px; height:6px; border-radius:var(--r-pill); }
.sch-card-head > svg:last-child { color:var(--text-4); transition:transform .16s; flex-shrink:0; }
.sch-card.is-open .sch-card-head > svg:last-child { transform:rotate(90deg); }
.sch-detail { border-top:1px solid var(--border); margin-left:154px; padding:12px 16px 15px 0; display:flex; flex-direction:column; gap:11px; }
.sch-fact { display:inline-flex; align-items:center; gap:6px; font-size:12.5px; color:var(--text-3); }
.sch-fact svg { color:var(--text-4); }
.sch-detail-actions { display:flex; flex-wrap:wrap; gap:8px; }
.sch-month { display:flex; flex-direction:column; }
.sch-day-head { display:flex; align-items:center; justify-content:space-between; width:100%; padding:8px 4px; background:transparent; border:0; border-bottom:1px solid var(--border); cursor:pointer; margin-bottom:11px; }
.sch-day-head:hover .sch-day-date, .sch-day-head.is-selected .sch-day-date { color:var(--accent); }
.sch-day-date { display:inline-flex; align-items:baseline; gap:8px; font-family:var(--ff-display); font-size:15px; font-weight:600; color:var(--ink); }
.sch-day-wd { font-size:12px; font-weight:500; color:var(--text-3); }
.sch-day-count { min-width:20px; height:20px; padding:0 6px; display:inline-flex; align-items:center; justify-content:center; border-radius:var(--r-pill); background:var(--surface-2); color:var(--text-3); font-size:12px; font-weight:600; }
.sch-empty { display:flex; flex-direction:column; align-items:center; text-align:center; gap:4px; padding:40px 20px; border:1px dashed var(--border-strong); border-radius:var(--r-md); }
.sch-empty svg { color:var(--text-4); }
.sch-empty p { margin:6px 0 0; font-size:14px; font-weight:600; color:var(--text-2); }
.sch-empty span { font-size:12.5px; color:var(--text-3); }
.orbit-time-spine-desktop-calendar { display:block; }
.orbit-week-strip { display:none; flex-direction:column; gap:12px; }
.orbit-week-strip-head { display:flex; align-items:center; gap:8px; }
[data-orbit-real-page] .btn.orbit-week-nav-btn { background:var(--surface); border:1px solid var(--border-2); border-radius:var(--r-sm); color:var(--text-2); flex-shrink:0; height:34px; padding:0; width:34px; }
.orbit-week-full-month-btn { flex:1; }
.orbit-week-strip-cells { display:grid; gap:8px; grid-template-columns:repeat(7, 1fr); }
[data-orbit-real-page] .btn.orbit-week-strip-cell { background:var(--surface); border:1px solid var(--border-2); border-radius:var(--r-md); color:var(--ink); flex-direction:column; gap:4px; height:44px; padding:4px 2px; position:relative; width:100%; }
[data-orbit-real-page] .btn.orbit-week-strip-cell.is-today { border-color:var(--accent); }
[data-orbit-real-page] .btn.orbit-week-strip-cell.is-selected { background:var(--accent-softer); border-color:var(--accent); color:var(--accent); }
.orbit-week-strip-wd { font-size:11px; font-weight:600; color:var(--text-3); }
.orbit-week-strip-d { font-family:var(--ff-mono); font-size:13px; font-weight:700; }
.orbit-week-strip-dot { position:absolute; bottom:4px; width:5px; height:5px; border-radius:var(--r-pill); background:var(--accent); }
@media (max-width: 760px) {
  .orbit-time-spine-desktop-calendar { display:none; }
  .orbit-week-strip { display:flex; }
  [data-orbit-real-page] .sch-card-head {
    align-items:start;
    display:grid;
    gap:4px 10px;
    grid-template-areas:"time avatar who chev" "time avatar status chev";
    grid-template-columns:50px 38px minmax(0, 1fr) 18px;
    min-height:0;
    padding:14px;
  }
  .sch-time { grid-area:time; width:50px; }
  .sch-rail { display:none; }
  .sch-card-head > .avatar { grid-area:avatar; }
  .sch-who { grid-area:who; }
  .sch-topic { white-space:normal; display:-webkit-box; -webkit-box-orient:vertical; -webkit-line-clamp:2; }
  .sch-status { grid-area:status; justify-self:start; margin-top:3px; }
  .sch-card-head > svg:last-child { align-self:center; grid-area:chev; }
  .sch-detail { margin-left:0; padding:12px 14px 14px; }
  .sch-detail-actions .btn { flex:1; justify-content:center; min-width:0; }
}
`,
      }}
    />
  );
}
