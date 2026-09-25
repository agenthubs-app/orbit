import type {
  TodayTaskPageModeContract,
  TodayTaskSummaryModeContract,
} from "../../shared/contract/today";
import type { TaskCategory, TaskPageContract, TaskSuggestionDTO } from "./contract";

export type {
  TodayActionSummaryContract,
  TodayScheduleActionSummaryContract,
  TodayTaskActionSummaryContract,
  TodayTaskCategoryContract,
  TodayTaskModeContract,
  TodayTaskPageModeContract,
  TodayTaskSummaryModeContract,
} from "../../shared/contract/today";

export type ScheduleItemState =
  | "upcoming"
  | "ongoing"
  | "ended"
  | "cancelled";

export interface ScheduleItemDTO {
  allDay?: boolean;
  timeZone?: string;
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

export type TodayPageModeDTO = TodayTaskPageModeContract<
  TaskPageContract,
  TaskSuggestionDTO,
  ScheduleItemDTO
>;

export type TodaySummaryModeDTO = TodayTaskSummaryModeContract;
