"use client";

import { useMemo, useState } from "react";

import { AccountTopNav } from "../orbit-account-shell";
import { useOrbitLanguage } from "../orbit-language-context";
import type { OrbitScheduleViewModel } from "../orbit-schedule-route-view-model";
import { Icon } from "../orbit-reference-primitives";
import {
  AddScheduleModal,
  MonthCalendar,
  ScheduleListPanel,
  TimeSpineStyles,
} from "../today/orbit-today-time-spine";
import {
  firstDayWithMeetings,
  type CalendarView,
} from "../today/orbit-today-time-spine-helpers";

interface OrbitRealScheduleProps {
  viewModel: OrbitScheduleViewModel;
}

// The 月历 + 当日|本月 面板 + 安排约见弹窗 used to be defined here. They now
// live in today/orbit-today-time-spine.tsx (and its helpers module) so the
// merged Today workspace and this page render from the exact same source —
// see T1 of the today-schedule merge plan.

export function OrbitRealSchedule({ viewModel }: OrbitRealScheduleProps) {
  const [view, setView] = useState<CalendarView>({ y: viewModel.today.y, m: viewModel.today.m });
  const [selected, setSelected] = useState<CalendarView>(() => firstDayWithMeetings(viewModel));
  const [addOpen, setAddOpen] = useState(false);
  const { t, language } = useOrbitLanguage();

  const monthCalendarProps = useMemo(
    () => ({
      connections: viewModel.connections,
      language: language === "ja" ? "en" : language,
      schedules: viewModel.schedules,
      selected,
      setSelected,
      setView,
      t,
      today: viewModel.today,
      view,
    }),
    [language, selected, t, view, viewModel.connections, viewModel.schedules, viewModel.today],
  );

  return (
    <main className="orbit-personal-page" data-orbit-real-page="schedule">
      <div className="orbit-desktop-only" style={{ background: "var(--bg)", minHeight: "100dvh" }}>
        <AccountTopNav active="schedule" />
        <div className="scroll" data-appscroll style={{ margin: "0 auto", maxWidth: 1180, padding: "36px 40px 90px" }}>
          <div style={{ alignItems: "flex-end", display: "flex", justifyContent: "space-between", marginBottom: 24 }}>
            <div>
              <div className="eyebrow">SCHEDULE</div>
              <h1 className="h-display" style={{ margin: "2px 0 0" }}>{t({ en: "Schedule", zh: "日程安排" })}</h1>
              <div style={{ color: "var(--text-3)", fontSize: 14, marginTop: 4 }}>{t({ en: "Pick someone from your contacts to meet, with relationship history synced automatically", zh: "从名片夹选人约见，自动同步交往记录" })}</div>
            </div>
            <button className="btn btn-primary" onClick={() => setAddOpen(true)}>
              <Icon name="plus" size={16} color="var(--on-dark)" />
              {t({ en: "Schedule a meeting", zh: "安排约见" })}
            </button>
          </div>
          <div style={{ alignItems: "start", display: "grid", gap: 26, gridTemplateColumns: "minmax(0,1fr) 380px" }}>
            <MonthCalendar {...monthCalendarProps} />
            <ScheduleListPanel connections={viewModel.connections} language={language === "ja" ? "en" : language} schedules={viewModel.schedules} selected={selected} setSelected={setSelected} t={t} view={view} />
          </div>
        </div>
      </div>
      <div className="orbit-mobile-only" style={{ background: "var(--bg)", flexDirection: "column", height: "100dvh", minHeight: "100dvh", overflow: "hidden", position: "relative" }}>
        <AccountTopNav active="schedule" />
        <div style={{ alignItems: "flex-end", display: "flex", flexShrink: 0, justifyContent: "space-between", padding: "8px 18px 6px" }}>
          <div>
            <div className="eyebrow">SCHEDULE</div>
            <h1 className="h-display" style={{ margin: "2px 0 0" }}>{t({ en: "Schedule", zh: "日程" })}</h1>
          </div>
          <button className="btn btn-primary btn-sm" onClick={() => setAddOpen(true)}>
            <Icon name="plus" size={15} color="var(--on-dark)" />
            {t({ en: "Meet", zh: "约见" })}
          </button>
        </div>
        <div className="scroll" data-appscroll style={{ display: "flex", flex: 1, flexDirection: "column", gap: 20, minHeight: 0, overflowY: "auto", padding: "14px 18px 36px" }}>
          <MonthCalendar {...monthCalendarProps} compact />
          <ScheduleListPanel compact connections={viewModel.connections} language={language === "ja" ? "en" : language} schedules={viewModel.schedules} selected={selected} setSelected={setSelected} t={t} view={view} />
        </div>
      </div>
      {addOpen ? <AddScheduleModal connections={viewModel.connections} onClose={() => setAddOpen(false)} t={t} /> : null}
      <TimeSpineStyles />
    </main>
  );
}
