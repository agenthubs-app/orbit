import type {
  TaskCategory,
  TaskItemDTO,
  TaskSuggestionDTO,
} from "./contract";

export type ScheduleItemState =
  | "upcoming"
  | "ongoing"
  | "ended"
  | "cancelled";

export interface ScheduleItemDTO {
  id: string;
  kind: "meeting" | "event" | "personal";
  category: TaskCategory;
  state: ScheduleItemState;
  title: string;
  startsAt: string;
  endsAt?: string;
  location?: string;
  sourceId: string;
}

export interface TodayAggregateDTO {
  date: string;
  timeZone: string;
  tasks: readonly TaskItemDTO[];
  completedCount: number;
  suggestions: readonly TaskSuggestionDTO[];
  schedule: readonly ScheduleItemDTO[];
  summary: {
    openTaskCount: number;
    completedCount: number;
    suggestionCount: number;
    scheduleCount: number;
  };
}
