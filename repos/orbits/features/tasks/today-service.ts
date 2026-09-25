import type { TaskSuggestionService } from "./suggestion-service";
import type {
  ScheduleItemDTO,
  ScheduleItemState,
  TodayPageModeDTO,
  TodaySummaryModeDTO,
} from "./today-contract";
import type { TodayScheduleProvider } from "./today-schedule-provider";
import type { TodayCompletedCounter } from "./today-completed-counter";
import { calendarDate, localDateTimeCandidates, localParts, validTimeZone } from "./local-date-time";
import type { TaskPageQuery, TodayTaskPageResult } from "./task-page";
import type { TaskPageContract } from "../../shared/contract/task-page";
import { todayTaskSummaryModeSchema } from "../../shared/api-schema/today";

function localDate(isoDateTime: string, timeZone: string): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    day: "2-digit",
    month: "2-digit",
    timeZone,
    year: "numeric",
  }).formatToParts(new Date(isoDateTime));
  const value = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${value.year}-${value.month}-${value.day}`;
}

function nextCalendarDate(date: string): string {
  const value = new Date(`${date}T00:00:00.000Z`);
  if (!Number.isFinite(value.getTime())) throw Error("TODAY_DATE_INVALID");
  value.setUTCDate(value.getUTCDate() + 1);
  return value.toISOString().slice(0, 10);
}

function dueWindow(date: string, timeZone: string) {
  const nextDayStart = localDayStart(nextCalendarDate(date), timeZone);
  if (nextDayStart === null) throw Error("TODAY_DATE_INVALID");
  return { plannedThrough: date, dueBefore: new Date(nextDayStart).toISOString() };
}

function localDayStart(date: string, timeZone: string): number | null {
  if (!calendarDate(date) || !validTimeZone(timeZone)) return null;
  const midnight = localDateTimeCandidates(date, "00:00", timeZone);
  if (midnight.length) return midnight[0]!;
  const center = Date.parse(`${date}T00:00:00.000Z`);
  let low = center - 48 * 3_600_000;
  let high = center + 48 * 3_600_000;
  while (high - low > 1) {
    const middle = Math.floor((low + high) / 2);
    if (localParts(middle, timeZone).date < date) low = middle;
    else high = middle;
  }
  return high;
}

function scheduleState(
  item: ScheduleItemDTO,
  now: string,
): ScheduleItemState {
  if (item.state === "cancelled") return "cancelled";
  if (item.endsAt && item.endsAt <= now) return "ended";
  if (item.startsAt > now) return "upcoming";
  return item.endsAt ? "ongoing" : "ended";
}

function isTodayScheduleItem(
  item: ScheduleItemDTO,
  date: string,
  timeZone: string,
  state: ScheduleItemState,
): boolean {
  return (
    localDate(item.startsAt, timeZone) === date ||
    (item.endsAt !== undefined && localDate(item.endsAt, timeZone) === date) ||
    state === "ongoing"
  );
}

function preview(value: string | undefined, maxCodePoints: number): string | null {
  if (!value) return null;
  return Array.from(value).slice(0, maxCodePoints).join("");
}

function taskPageQuery(date: string, timeZone: string, limit: number): TaskPageQuery {
  return {
    status: "open",
    scope: "all",
    query: "",
    limit,
    dueWindow: dueWindow(date, timeZone),
  };
}

export interface TodayTaskPageReader {
  read(actorId: string, query: TaskPageQuery): Promise<TaskPageContract>;
  readToday(actorId: string, query: TaskPageQuery, now: string): Promise<TodayTaskPageResult>;
}

export interface TodayService {
  getToday: (input: {
    actorId: string;
    now: string;
    timeZone: string;
    taskMode?: "page" | "summary";
    limit?: number;
  }) => Promise<TodayPageModeDTO | TodaySummaryModeDTO>;
}

export function createTodayService(input: {
  taskPageReader: TodayTaskPageReader;
  suggestionService: TaskSuggestionService;
  scheduleProvider: TodayScheduleProvider;
  completedCounter: TodayCompletedCounter;
}): TodayService {
  return {
    async getToday(query) {
      const date = localDate(query.now, query.timeZone);
      const mode = query.taskMode ?? "page";
      if (mode === "summary") {
        const [page, suggestions, scheduleItems] = await Promise.all([
          input.taskPageReader.readToday(query.actorId, taskPageQuery(date, query.timeZone, 3), query.now),
          input.suggestionService.list({ actorId: query.actorId, now: query.now }),
          input.scheduleProvider.list({ actorId: query.actorId }),
        ]);
        const schedule = todaySchedule(scheduleItems, date, query.timeZone, query.now);
        const taskItems = page.items.slice(0, 3).map((task) => ({
          kind: "task" as const,
          task: {
            id: task.id,
            titlePreview: task.titlePreview,
            category: task.category,
            priority: task.priority,
            plannedDate: task.plannedDate ?? null,
            dueAt: task.dueAt ?? null,
          },
        }));
        const remaining = Math.max(0, 3 - taskItems.length);
        const scheduleActions = schedule.slice(0, remaining).map((item) => ({
          kind: "schedule" as const,
          schedule: {
            id: item.id,
            titlePreview: preview(item.title, 240) ?? "",
            category: item.category,
            kind: item.kind,
            state: item.state,
            startsAt: item.startsAt,
            locationPreview: preview(item.location, 120),
          },
        }));
        return todayTaskSummaryModeSchema.parse({
          taskMode: "summary",
          date,
          timeZone: query.timeZone,
          summary: {
            openTaskCount: page.total,
            suggestionCount: suggestions.length,
          },
          items: [...taskItems, ...scheduleActions],
          questionSignals: {
            urgentTask: page.todaySignals.urgentTask,
            relationshipTask: page.todaySignals.relationshipTask,
            preparation: schedule.some(
              (item) =>
                (item.kind === "meeting" || item.kind === "event") &&
                item.state === "upcoming" &&
                Date.parse(item.startsAt) > Date.parse(query.now),
            ),
          },
        });
      }

      const [page, suggestions, scheduleItems, completedCount] = await Promise.all([
        input.taskPageReader.read(query.actorId, taskPageQuery(date, query.timeZone, query.limit ?? 20)),
        input.suggestionService.list({ actorId: query.actorId, now: query.now }),
        input.scheduleProvider.list({ actorId: query.actorId }),
        input.completedCounter.count(query),
      ]);
      const schedule = todaySchedule(scheduleItems, date, query.timeZone, query.now);
      const response: TodayPageModeDTO = {
        taskMode: "page",
        date,
        timeZone: query.timeZone,
        taskPage: page,
        completedCount,
        suggestions: suggestions.slice(0, 2),
        schedule,
        summary: {
          openTaskCount: page.total,
          completedCount,
          suggestionCount: suggestions.length,
          scheduleCount: schedule.length,
        },
      };
      return response;
    },
  };
}

function todaySchedule(
  scheduleItems: readonly ScheduleItemDTO[],
  date: string,
  timeZone: string,
  now: string,
) {
  return scheduleItems
    .map((item) => ({ ...item, state: scheduleState(item, now) }))
    .filter(
      (item) =>
        item.state !== "cancelled" &&
        isTodayScheduleItem(item, date, timeZone, item.state),
    )
    .sort((left, right) => left.startsAt.localeCompare(right.startsAt));
}
