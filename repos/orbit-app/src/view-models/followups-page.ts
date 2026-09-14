import { contactsToSummaries, type ContactSummary } from "./contacts";
import { type FollowupTaskView } from "./followups";
import { taskDetailToView, tasksToListView, type TaskListRowView } from "./today-tasks";

export interface SavedFollowupRow extends TaskListRowView {
  contact: ContactSummary | null;
  contactId: string | undefined;
  dateKey: string | undefined;
  timeLabel: string;
  draftTask: FollowupTaskView | null;
}

export interface FollowupsPageView {
  open: SavedFollowupRow[];
  completed: SavedFollowupRow[];
  otherTaskCount: number;
  candidatesPayload: { tasks: unknown[] };
}

export function followupsPageToView(
  tasksPayload: unknown,
  contactsPayload: unknown,
  now = new Date(),
): FollowupsPageView {
  const rawTasks = typeof tasksPayload === "object" && tasksPayload !== null &&
    "tasks" in tasksPayload && Array.isArray(tasksPayload.tasks) ? tasksPayload.tasks : [];
  const contacts = new Map(contactsToSummaries(contactsPayload).map(contact => [contact.id, contact]));
  const details = new Map(rawTasks.map(raw => taskDetailToView({ task: raw }))
    .filter(detail => detail !== null).map(detail => [detail.id, detail]));
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Tokyo", year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
  const open = tasksToListView(tasksPayload, "open", now).items;
  const completed = tasksToListView(tasksPayload, "completed", now).items;
  const isFollowup = (row: TaskListRowView) => {
    const detail = details.get(row.id);
    return detail?.category === "relationship" || Boolean(detail?.relatedContactId);
  };
  function rowView(row: TaskListRowView): SavedFollowupRow {
    const detail = details.get(row.id)!;
    const contact = detail.relatedContactId ? contacts.get(detail.relatedContactId) ?? null : null;
    const dueDate = row.dueAt && Number.isFinite(Date.parse(row.dueAt)) ? new Date(row.dueAt) : null;
    const dateKey = dueDate ? new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Tokyo", year: "numeric", month: "2-digit", day: "2-digit" }).format(dueDate) : row.plannedDate;
    const timeLabel = row.status === "completed" ? row.dateLabel : dateKey === today ? dueDate
      ? `今天 ${new Intl.DateTimeFormat("zh-CN", { timeZone: "Asia/Tokyo", hour: "2-digit", minute: "2-digit", hour12: false }).format(dueDate)}`
      : "今天" : row.dateLabel;
    return {
      ...row, contact, contactId: detail.relatedContactId, dateKey, timeLabel,
      draftTask: contact ? {
        id: row.id, contactId: detail.relatedContactId ?? "", contactName: contact.name, organization: contact.organization,
        title: row.title, recommendedAction: row.title, rationale: row.notes ?? "",
        dueLabel: timeLabel, priorityLabel: row.priority === "high" ? "优先" : "待跟进",
        sourceLabel: detail.sourceLabel ?? "已保存待办", evidenceLabel: "已保存待办", triggerLabel: "人脉待办",
      } : null,
    };
  }
  return {
    open: open.filter(isFollowup).map(rowView),
    completed: completed.filter(isFollowup).map(rowView),
    otherTaskCount: [...open, ...completed].filter(row => !isFollowup(row)).length,
    // The legacy generation contract is review-only; never infer persistence
    // from a taskId or map a malformed canonical task into an actionable row.
    candidatesPayload: { tasks: rawTasks.filter(raw => typeof raw === "object" && raw !== null &&
      "taskId" in raw && typeof raw.taskId === "string" && !("status" in raw)) },
  };
}
