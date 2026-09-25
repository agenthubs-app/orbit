import { taskPageSchema } from "../api/schema/task-page";
import { localDayStart, shiftCalendarDate } from "../time/date-time";
import type { OrbitLanguage } from "../api/contract/language";
import { homeTasksToView } from "./home-dashboard";

export function homeTaskWindow(date: string, timeZone: string) {
  const end = localDayStart(shiftCalendarDate(date, 1), timeZone);
  if (end === null) throw new Error("Invalid task day");
  return { plannedThrough: date, dueBefore: new Date(end).toISOString() };
}

export function homeTaskPagePath(date: string, timeZone: string) {
  return "/api/tasks/page?" + new URLSearchParams({ status: "open", limit: "5", ...homeTaskWindow(date, timeZone) }).toString();
}

export function homeTaskPageToView(payload: unknown, actorId: string, date: string, now: Date, timeZone: string, language: OrbitLanguage) {
  const parsed = taskPageSchema.safeParse(payload);
  if (!parsed.success) return null;
  const page = parsed.data, window = homeTaskWindow(date, timeZone);
  if (page.actorId !== actorId || page.status !== "open" || page.scope !== "all" || page.query !== ""
    || page.dueWindow?.plannedThrough !== window.plannedThrough || page.dueWindow.dueBefore !== window.dueBefore
    || page.items.length !== Math.min(page.total, 5) || page.hasMore !== (page.total > 5)) return null;
  // Adapt the fields the presenter needs, not a fabricated full TaskItem DTO.
  // Keep server order. Normalizing a valid instant preserves its meaning while
  // accepting the canonical task decoder's Date.parse-compatible legacy dates.
  const rows = page.items.map(card => homeTasksToView({ tasks: [{
    id: card.id, title: card.titlePreview, status: card.status, category: card.category, priority: card.priority,
    ...(card.locationPreview ? { location: card.locationPreview } : {}),
    ...(card.plannedDate ? { plannedDate: card.plannedDate } : {}),
    ...(card.dueAt ? { dueAt: new Date(card.dueAt).toISOString() } : {}),
  }] }, date, now, timeZone, language));
  if (rows.some(row => row?.length !== 1)) return null;
  return { items: rows.flatMap(row => row!), total: page.total };
}
