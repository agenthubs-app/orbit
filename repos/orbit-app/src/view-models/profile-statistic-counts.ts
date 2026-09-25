import { contactCardSummarySchema } from "../api/schema/contact-card-page";
import { taskPageSchema } from "../api/schema/task-page";
import { homeTaskWindow } from "./home-task-page";

export function profileContactSummaryCount(data: unknown): number | null {
  const parsed = contactCardSummarySchema.safeParse(data);
  return parsed.success ? parsed.data.total : null;
}

export function profileTaskDayPath(date: string, timeZone: string) {
  return "/api/tasks/page?" + new URLSearchParams({ status: "open", limit: "1", ...homeTaskWindow(date, timeZone) }).toString();
}

export function profileTaskDayCount(data: unknown, actorId: string, date: string, timeZone: string): number | null {
  const parsed = taskPageSchema.safeParse(data);
  if (!parsed.success || !actorId) return null;
  const page = parsed.data, window = homeTaskWindow(date, timeZone);
  if (page.actorId !== actorId || page.status !== "open" || page.scope !== "all" || page.query !== ""
    || page.dueWindow?.plannedThrough !== window.plannedThrough || page.dueWindow.dueBefore !== window.dueBefore
    || page.items.length !== Math.min(page.total, 1) || page.hasMore !== (page.total > 1)) return null;
  return page.total;
}
