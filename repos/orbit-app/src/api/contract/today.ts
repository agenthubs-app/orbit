export type TodayTaskCategoryContract =
  | "relationship"
  | "meeting"
  | "event"
  | "work"
  | "personal"
  | "other";

export type TodayTaskModeContract = "page" | "summary";

export interface TodayTaskPageModeContract<TTaskPage, TSuggestion, TSchedule> {
  taskMode: "page";
  date: string;
  timeZone: string;
  taskPage: TTaskPage;
  completedCount: number;
  suggestions: readonly TSuggestion[];
  schedule: readonly TSchedule[];
  summary: {
    openTaskCount: number;
    completedCount: number;
    suggestionCount: number;
    scheduleCount: number;
  };
}

export interface TodayTaskActionSummaryContract {
  id: string;
  titlePreview: string;
  category: TodayTaskCategoryContract;
  priority: "normal" | "high";
  plannedDate: string | null;
  dueAt: string | null;
}

export interface TodayScheduleActionSummaryContract {
  id: string;
  titlePreview: string;
  category: TodayTaskCategoryContract;
  kind: "meeting" | "event" | "personal";
  state: "upcoming" | "ongoing" | "ended" | "cancelled";
  startsAt: string;
  locationPreview: string | null;
}

export type TodayActionSummaryContract =
  | { kind: "task"; task: TodayTaskActionSummaryContract }
  | { kind: "schedule"; schedule: TodayScheduleActionSummaryContract };

export interface TodayTaskSummaryModeContract {
  taskMode: "summary";
  date: string;
  timeZone: string;
  summary: {
    openTaskCount: number;
    suggestionCount: number;
  };
  items: TodayActionSummaryContract[];
  questionSignals: {
    urgentTask: boolean;
    relationshipTask: boolean;
    preparation: boolean;
  };
}
