/**
 * 时间脊柱纯函数 + 类型（从 followups/orbit-real-schedule.tsx 抽出）。
 *
 * 不带 "use client"：today/page.tsx（server）和 orbit-today-time-spine.tsx
 * （client）都需要这些函数——page.tsx 用它们把关系安排里已确认的活动合流进
 * 时间轴，client 组件用它们渲染月历/日视图。拆成独立的纯函数文件，两边都能
 * 直接 import，不必让 server 代码穿过一个 "use client" 模块边界。
 */
import type {
  OrbitScheduleConnectionView,
  OrbitScheduleItemView,
  OrbitScheduleViewModel,
} from "../orbit-schedule-route-view-model";

export interface CalendarView {
  d?: number;
  m: number;
  y: number;
}

export const WEEKDAYS = ["日", "一", "二", "三", "四", "五", "六"];
export const WEEKDAYS_EN = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
export const MON_EN = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export function scheduleStatusColor(status: string) {
  return status === "已确认" ? { c: "var(--live)", soft: "var(--live-soft)" } : { c: "var(--amber)", soft: "var(--amber-soft)" };
}

export function eventsOn(schedules: OrbitScheduleItemView[], y: number, m: number, d: number) {
  return schedules.filter((schedule) => {
    const date = new Date(schedule.date);
    return date.getFullYear() === y && date.getMonth() === m && date.getDate() === d;
  });
}

export function eventsInMonth(schedules: OrbitScheduleItemView[], y: number, m: number) {
  return schedules
    .filter((schedule) => {
      const date = new Date(schedule.date);
      return date.getFullYear() === y && date.getMonth() === m;
    })
    .sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time));
}

export function connectionById(connections: OrbitScheduleConnectionView[], id: string) {
  return connections.find((connection) => connection.id === id) ?? connections[0];
}

// The seed leaves a couple of English strings on schedule items; localize them.
export function localizeRole(title: string, language: "en" | "zh"): string {
  if (title === "Relationship contact") return language === "en" ? "Relationship contact" : "人脉联系人";
  return title;
}

export function localizeTopic(
  topic: string,
  connection: OrbitScheduleConnectionView,
  language: "en" | "zh",
): string {
  const match = topic.match(/^Review follow-up for .+$/i);
  if (match) {
    return language === "en"
      ? `Follow up with ${connection.displayName}`
      : `跟进 ${connection.displayName} 的关系进展`;
  }
  return topic;
}

export function statusLabel(status: string, language: "en" | "zh"): string {
  if (language !== "en") return status;
  return status === "已确认" ? "Confirmed" : "To confirm";
}

// Sunday of the week containing (y, m, d) — anchor for the mobile week strip
// (T3, today-schedule merge §3): it needs a 7-day window to page through
// independently of the month grid MonthCalendar renders.
export function startOfWeekSun(y: number, m: number, d: number): Date {
  const date = new Date(y, m, d);
  date.setDate(date.getDate() - date.getDay());
  return date;
}

// Default the selected day to today if it has meetings, else the first day in
// the current month that does — so the day panel is never empty on load.
export function firstDayWithMeetings(
  viewModel: OrbitScheduleViewModel,
): CalendarView {
  const { y, m, d } = viewModel.today;
  if (eventsOn(viewModel.schedules, y, m, d).length > 0) {
    return { y, m, d };
  }
  const inMonth = eventsInMonth(viewModel.schedules, y, m)[0];
  if (inMonth) {
    const date = new Date(inMonth.date);
    return { y: date.getFullYear(), m: date.getMonth(), d: date.getDate() };
  }
  return { y, m, d };
}
