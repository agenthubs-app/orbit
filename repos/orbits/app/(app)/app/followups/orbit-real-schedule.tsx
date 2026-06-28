"use client";

import { useEffect, useMemo, useState } from "react";

import { AccountBottomTab, AccountTopNav, ModalShell, StatusBar } from "../orbit-account-shell";
import type {
  OrbitScheduleConnectionView,
  OrbitScheduleItemView,
  OrbitScheduleViewModel,
} from "../orbit-schedule-route-view-model";
import { Avatar, Icon } from "../orbit-reference-primitives";

interface OrbitRealScheduleProps {
  viewModel: OrbitScheduleViewModel;
}

interface CalendarView {
  d?: number;
  m: number;
  y: number;
}

const WEEKDAYS = ["日", "一", "二", "三", "四", "五", "六"];
const WEEKDAYS_EN = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MON_EN = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function currentPrototypeLanguage() {
  if (typeof window === "undefined") return "zh";
  const orbitWindow = window as typeof window & { OrbitI18n?: { getLang?: () => string } };
  return orbitWindow.OrbitI18n?.getLang?.() === "en" ? "en" : "zh";
}

function usePrototypeLanguage() {
  const [language, setLanguage] = useState<"en" | "zh">("zh");

  useEffect(() => {
    const update = () => setLanguage(currentPrototypeLanguage());
    update();
    const timer = window.setInterval(update, 250);
    return () => window.clearInterval(timer);
  }, []);

  return language;
}

function scheduleStatusColor(status: string) {
  return status === "已确认" ? { c: "var(--live)", soft: "var(--live-soft)" } : { c: "var(--amber)", soft: "var(--amber-soft)" };
}

function eventsOn(schedules: OrbitScheduleItemView[], y: number, m: number, d: number) {
  return schedules.filter((schedule) => {
    const date = new Date(schedule.date);
    return date.getFullYear() === y && date.getMonth() === m && date.getDate() === d;
  });
}

function eventsInMonth(schedules: OrbitScheduleItemView[], y: number, m: number) {
  return schedules
    .filter((schedule) => {
      const date = new Date(schedule.date);
      return date.getFullYear() === y && date.getMonth() === m;
    })
    .sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time));
}

function connectionById(connections: OrbitScheduleConnectionView[], id: string) {
  return connections.find((connection) => connection.id === id) ?? connections[0];
}

function SchedRow({
  connections,
  dim,
  schedule,
}: {
  connections: OrbitScheduleConnectionView[];
  dim?: boolean;
  schedule: OrbitScheduleItemView;
}) {
  const connection = connectionById(connections, schedule.cid);
  const status = scheduleStatusColor(schedule.status);

  return (
    <div className="card" style={{ alignItems: "flex-start", display: "flex", gap: 13, opacity: dim ? 0.55 : 1, padding: 14 }}>
      <div style={{ flexShrink: 0, textAlign: "center", width: 50 }}>
        <div className="mono" style={{ color: "var(--ink)", fontSize: 16, fontWeight: 700 }}>{schedule.time}</div>
        <div style={{ color: "var(--text-3)", fontSize: 10.5, marginTop: 2 }}>{schedule.dur}</div>
      </div>
      <div style={{ alignSelf: "stretch", background: "var(--border)", width: 1 }} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ alignItems: "center", display: "flex", gap: 9 }}>
          <Avatar letter={connection.initial} g={connection.g} size={30} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ color: "var(--ink)", fontSize: 14, fontWeight: 600 }}>{connection.displayName}</div>
            <div style={{ color: "var(--text-3)", fontSize: 11.5 }}>{connection.title} · {connection.company}</div>
          </div>
          <span style={{ alignItems: "center", background: status.soft, borderRadius: 999, color: status.c, display: "inline-flex", fontSize: 11.5, fontWeight: 600, gap: 5, height: 22, padding: "0 9px" }}>
            <span style={{ background: status.c, borderRadius: 999, height: 6, width: 6 }} />
            {schedule.status}
          </span>
        </div>
        <div style={{ color: "var(--text-2)", fontSize: 13, marginTop: 9 }}>{schedule.topic}</div>
        <div style={{ alignItems: "center", color: "var(--text-3)", display: "flex", fontSize: 12, gap: 5, marginTop: 7 }}>
          <Icon name="pin" size={12} />
          {schedule.place}
        </div>
      </div>
    </div>
  );
}

function MonthCalendar({
  compact,
  connections,
  language,
  schedules,
  selected,
  setSelected,
  setView,
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
  const isSelected = (day: number | null) => Boolean(day && selected && selected.y === y && selected.m === m && selected.d === day);

  return (
    <div className="card" style={{ padding: compact ? 14 : 20 }}>
      <div style={{ alignItems: "center", display: "flex", justifyContent: "space-between", marginBottom: 16 }}>
        <div className="h-title" style={{ color: "var(--ink)", fontSize: compact ? 19 : 22 }}>{language === "en" ? `${MON_EN[m]} ${y}` : `${y} 年 ${m + 1} 月`}</div>
        <div style={{ display: "flex", gap: 8 }}>
          <button type="button" onClick={() => shift(-1)} aria-label="上个月" style={{ alignItems: "center", background: "var(--surface)", border: "1px solid var(--border-2)", borderRadius: 10, color: "var(--text-2)", cursor: "pointer", display: "flex", height: 34, justifyContent: "center", width: 34 }}>
            <Icon name="chevL" size={18} />
          </button>
          <button type="button" onClick={() => setView({ y: today.y, m: today.m })} style={{ background: "var(--surface)", border: "1px solid var(--border-2)", borderRadius: 10, color: "var(--text-2)", cursor: "pointer", fontFamily: "var(--ff)", fontSize: 13, fontWeight: 550, height: 34, padding: "0 12px" }}>
            今天
          </button>
          <button type="button" onClick={() => shift(1)} aria-label="下个月" style={{ alignItems: "center", background: "var(--surface)", border: "1px solid var(--border-2)", borderRadius: 10, color: "var(--text-2)", cursor: "pointer", display: "flex", height: 34, justifyContent: "center", width: 34 }}>
            <Icon name="chevR" size={18} />
          </button>
        </div>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", marginBottom: 6 }}>
        {(language === "en" ? WEEKDAYS_EN : WEEKDAYS).map((weekday, index) => (
          <div key={weekday} style={{ color: index === 0 || index === 6 ? "var(--rose)" : "var(--text-3)", fontSize: 11.5, fontWeight: 600, paddingBottom: 6, textAlign: "center" }}>{weekday}</div>
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
              onClick={() => setSelected({ y, m, d: day })}
              style={{ background: selectedCell ? "var(--accent-softer)" : todayCell ? "var(--surface-2)" : "transparent", border: `1px solid ${selectedCell ? "var(--accent)" : "transparent"}`, borderRadius: 12, cursor: "pointer", display: "flex", flexDirection: "column", fontFamily: "var(--ff)", gap: 3, minHeight: compact ? 46 : 76, overflow: "hidden", padding: compact ? "5px 3px" : "7px 7px", textAlign: "left" }}
            >
              <span style={{ alignItems: "center", display: "flex", justifyContent: compact ? "center" : "flex-start" }}>
                <span style={{ alignItems: "center", background: todayCell ? "var(--accent)" : "transparent", borderRadius: 999, color: todayCell ? "#fff" : selectedCell ? "var(--accent)" : "var(--ink)", display: "flex", fontFamily: "var(--ff-tight)", fontSize: 14, fontWeight: todayCell ? 800 : 600, height: 24, justifyContent: "center", width: 24 }}>{day}</span>
              </span>
              {compact ? (
                events.length ? (
                  <span style={{ display: "flex", gap: 3, justifyContent: "center" }}>
                    {events.slice(0, 3).map((event, eventIndex) => <span key={`${event.id}-${eventIndex}`} style={{ background: scheduleStatusColor(event.status).c, borderRadius: 999, height: 5, width: 5 }} />)}
                  </span>
                ) : null
              ) : (
                <span style={{ display: "flex", flexDirection: "column", gap: 2, minWidth: 0 }}>
                  {events.slice(0, 2).map((event) => {
                    const status = scheduleStatusColor(event.status);
                    return (
                      <span key={event.id} style={{ background: status.soft, borderRadius: 5, color: status.c, display: "block", fontSize: 10.5, fontWeight: 600, lineHeight: 1.45, overflow: "hidden", padding: "1px 5px", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {event.time} {connectionById(connections, event.cid).displayName}
                      </span>
                    );
                  })}
                  {events.length > 2 ? <span style={{ color: "var(--text-3)", fontSize: 10, paddingLeft: 4 }}>+{events.length - 2}</span> : null}
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function ScheduleListPanel({
  compact,
  connections,
  language,
  schedules,
  selected,
  view,
}: {
  compact?: boolean;
  connections: OrbitScheduleConnectionView[];
  language: "en" | "zh";
  schedules: OrbitScheduleItemView[];
  selected: CalendarView;
  view: CalendarView;
}) {
  const list = eventsInMonth(schedules, view.y, view.m);
  const selectedInView = selected && selected.y === view.y && selected.m === view.m;
  const groups = [...new Set(list.map((schedule) => schedule.date))];
  const weekday = (dateStr: string) => (language === "en" ? WEEKDAYS_EN : WEEKDAYS)[new Date(dateStr).getDay()];

  return (
    <div>
      <div style={{ alignItems: "center", display: "flex", justifyContent: "space-between", marginBottom: 14 }}>
        <h2 className="h-section" style={{ fontSize: compact ? 16 : 18, margin: 0 }}>{language === "en" ? `${MON_EN[view.m]} schedule` : `${view.m + 1} 月安排`}</h2>
        <span className="mono" style={{ color: "var(--text-3)", fontSize: 12 }}>{list.length} 场</span>
      </div>
      {list.length === 0 ? <div className="card-flat" style={{ color: "var(--text-3)", fontSize: 13.5, padding: 20, textAlign: "center" }}>本月暂无约见。点左侧日历安排一场。</div> : null}
      <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
        {groups.map((dateStr) => {
          const date = new Date(dateStr);
          const day = date.getDate();
          const selectedDay = selected && selected.y === view.y && selected.m === view.m && selected.d === day;

          return (
            <div key={dateStr}>
              <div style={{ alignItems: "center", display: "flex", gap: 10, margin: "0 0 10px" }}>
                <span style={{ alignItems: "center", color: selectedDay ? "var(--accent)" : "var(--ink)", display: "inline-flex", fontFamily: "var(--ff-tight)", fontSize: 15, fontWeight: 700, gap: 7 }}>
                  {language === "en" ? `${MON_EN[view.m]} ${day}` : `${view.m + 1}月${day}日`}
                  <span style={{ color: "var(--text-3)", fontSize: 12, fontWeight: 500 }}>{language === "en" ? weekday(dateStr) : `周${weekday(dateStr)}`}</span>
                </span>
                {selectedDay ? <span className="badge badge-soon" style={{ height: 20 }}>已选</span> : null}
                <div style={{ background: "var(--border)", flex: 1, height: 1 }} />
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {list.filter((schedule) => schedule.date === dateStr).map((schedule) => (
                  <SchedRow key={schedule.id} schedule={schedule} connections={connections} dim={selectedInView && !selectedDay} />
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function AddScheduleModal({
  connections,
  onClose,
}: {
  connections: OrbitScheduleConnectionView[];
  onClose: () => void;
}) {
  const [cid, setCid] = useState("");

  return (
    <ModalShell onClose={onClose} maxW={520} step="安排约见">
      <h2 className="h-title" style={{ fontSize: 22, margin: "4px 0 6px" }}>安排约见</h2>
      <p style={{ color: "var(--text-2)", fontSize: 13.5, margin: "0 0 18px" }}>从名片夹选择一个人，约一次见面，自动同步到你们的交往记录。</p>
      <label className="field-label">选择联系人</label>
      <div className="scroll" style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 16, maxHeight: 220, overflowY: "auto" }}>
        {connections.map((connection) => (
          <button
            key={connection.id}
            type="button"
            onClick={() => setCid(connection.id)}
            style={{ alignItems: "center", background: cid === connection.id ? "var(--accent-softer)" : "var(--surface)", border: `1px solid ${cid === connection.id ? "var(--accent)" : "var(--border)"}`, borderRadius: 12, cursor: "pointer", display: "flex", fontFamily: "var(--ff)", gap: 11, padding: 11, textAlign: "left" }}
          >
            <Avatar letter={connection.initial} g={connection.g} size={36} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ color: "var(--ink)", fontSize: 14, fontWeight: 600 }}>{connection.displayName}</div>
              <div style={{ color: "var(--text-3)", fontSize: 12 }}>{connection.title} · {connection.company}</div>
            </div>
            {cid === connection.id ? <Icon name="check" size={16} color="var(--accent)" /> : null}
          </button>
        ))}
      </div>
      <div style={{ display: "grid", gap: 12, gridTemplateColumns: "1fr 1fr" }}>
        <div>
          <label className="field-label">日期</label>
          <input className="field" defaultValue="2026-06-28" />
        </div>
        <div>
          <label className="field-label">时间</label>
          <input className="field" defaultValue="15:00" />
        </div>
      </div>
      <div style={{ marginTop: 12 }}>
        <label className="field-label">议题</label>
        <input className="field" placeholder="想聊的事情" />
      </div>
      <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", marginTop: 18 }}>
        <button className="btn btn-ghost" onClick={onClose}>取消</button>
        <button className="btn btn-primary" onClick={onClose} disabled={!cid}>
          <Icon name="check" size={16} color="#fff" />
          发送约见
        </button>
      </div>
    </ModalShell>
  );
}

export function OrbitRealSchedule({ viewModel }: OrbitRealScheduleProps) {
  const [view, setView] = useState<CalendarView>({ y: viewModel.today.y, m: viewModel.today.m });
  const [selected, setSelected] = useState<CalendarView>({ ...viewModel.today });
  const [addOpen, setAddOpen] = useState(false);
  const language = usePrototypeLanguage();

  const monthCalendarProps = useMemo(
    () => ({
      connections: viewModel.connections,
      language,
      schedules: viewModel.schedules,
      selected,
      setSelected,
      setView,
      today: viewModel.today,
      view,
    }),
    [language, selected, view, viewModel.connections, viewModel.schedules, viewModel.today],
  );

  return (
    <main className="orbit-personal-page" data-orbit-real-page="schedule">
      <div className="orbit-desktop-only" style={{ background: "var(--bg)", minHeight: "100dvh" }}>
        <AccountTopNav active="schedule" />
        <div className="scroll" data-appscroll style={{ margin: "0 auto", maxWidth: 1180, padding: "36px 40px 90px" }}>
          <div style={{ alignItems: "flex-end", display: "flex", justifyContent: "space-between", marginBottom: 24 }}>
            <div>
              <div className="eyebrow">SCHEDULE</div>
              <h1 className="h-display" style={{ fontSize: 32, margin: "2px 0 0" }}>日程安排</h1>
              <div style={{ color: "var(--text-3)", fontSize: 13.5, marginTop: 4 }}>从名片夹选人约见，自动同步交往记录</div>
            </div>
            <button className="btn btn-primary" onClick={() => setAddOpen(true)}>
              <Icon name="plus" size={16} color="#fff" />
              安排约见
            </button>
          </div>
          <div style={{ alignItems: "start", display: "grid", gap: 26, gridTemplateColumns: "minmax(0,1fr) 380px" }}>
            <MonthCalendar {...monthCalendarProps} />
            <ScheduleListPanel connections={viewModel.connections} language={language} schedules={viewModel.schedules} selected={selected} view={view} />
          </div>
        </div>
      </div>
      <div className="orbit-mobile-only" style={{ background: "var(--bg)", flexDirection: "column", height: "100dvh", minHeight: "100dvh", overflow: "hidden", position: "relative" }}>
        <StatusBar />
        <div style={{ alignItems: "flex-end", display: "flex", flexShrink: 0, justifyContent: "space-between", padding: "8px 18px 6px" }}>
          <div>
            <div className="eyebrow">SCHEDULE</div>
            <h1 className="h-display" style={{ fontSize: 26, margin: "2px 0 0" }}>日程</h1>
          </div>
          <button className="btn btn-primary btn-sm" onClick={() => setAddOpen(true)}>
            <Icon name="plus" size={15} color="#fff" />
            约见
          </button>
        </div>
        <div className="scroll" data-appscroll style={{ display: "flex", flex: 1, flexDirection: "column", gap: 20, minHeight: 0, overflowY: "auto", padding: "14px 18px 100px" }}>
          <MonthCalendar {...monthCalendarProps} compact />
          <ScheduleListPanel compact connections={viewModel.connections} language={language} schedules={viewModel.schedules} selected={selected} view={view} />
        </div>
        <AccountBottomTab active="me" />
      </div>
      {addOpen ? <AddScheduleModal connections={viewModel.connections} onClose={() => setAddOpen(false)} /> : null}
    </main>
  );
}
