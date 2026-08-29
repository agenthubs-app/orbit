import type { TaskService } from "./service";
import type { TaskSuggestionService } from "./suggestion-service";
import type {
  ScheduleItemDTO,
  ScheduleItemState,
  TodayAggregateDTO,
} from "./today-contract";
import type { TodayScheduleProvider } from "./today-schedule-provider";

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

export interface TodayService {
  getToday: (input: {
    actorId: string;
    now: string;
    timeZone: string;
  }) => Promise<TodayAggregateDTO>;
}

export function createTodayService(input: {
  taskService: TaskService;
  suggestionService: TaskSuggestionService;
  scheduleProvider: TodayScheduleProvider;
}): TodayService {
  return {
    async getToday(query) {
      const date = localDate(query.now, query.timeZone);
      const [allOpenTasks, activities, suggestions, scheduleItems] =
        await Promise.all([
          input.taskService.list({ actorId: query.actorId, status: "open" }),
          input.taskService.history({ actorId: query.actorId }),
          input.suggestionService.list({
            actorId: query.actorId,
            now: query.now,
          }),
          input.scheduleProvider.list({ actorId: query.actorId }),
        ]);

      const tasks = allOpenTasks
        .filter(
          (task) =>
            (task.plannedDate !== undefined && task.plannedDate <= date) ||
            (task.dueAt !== undefined &&
              localDate(task.dueAt, query.timeZone) <= date),
        )
        .sort((left, right) => {
          const leftTime = left.dueAt ?? `${left.plannedDate ?? date}T23:59:59`;
          const rightTime = right.dueAt ?? `${right.plannedDate ?? date}T23:59:59`;
          return leftTime.localeCompare(rightTime);
        });
      const completedCount = new Set(
        activities
          .filter(
            (activity) =>
              activity.type === "completed" &&
              localDate(activity.occurredAt, query.timeZone) === date,
          )
          .map((activity) => activity.taskId),
      ).size;
      const schedule = scheduleItems
        .map((item) => ({
          ...item,
          state: scheduleState(item, query.now),
        }))
        .filter(
          (item) =>
            item.state !== "cancelled" &&
            isTodayScheduleItem(item, date, query.timeZone, item.state),
        )
        .sort((left, right) => left.startsAt.localeCompare(right.startsAt));
      const visibleSuggestions = suggestions.slice(0, 2);

      return {
        date,
        timeZone: query.timeZone,
        tasks,
        completedCount,
        suggestions: visibleSuggestions,
        schedule,
        summary: {
          openTaskCount: tasks.length,
          completedCount,
          suggestionCount: suggestions.length,
          scheduleCount: schedule.length,
        },
      };
    },
  };
}
