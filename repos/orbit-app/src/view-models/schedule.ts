export interface ScheduleItem {
  dueAt: string;
  id: string;
  title: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function stringField(
  record: Record<string, unknown>,
  fieldName: string,
  fallback = ""
): string {
  const value = record[fieldName];
  return typeof value === "string" && value.trim() ? value : fallback;
}

function numberField(
  record: Record<string, unknown>,
  fieldName: string
): number | null {
  const value = record[fieldName];
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function listFromPayload(value: unknown, fieldName: string): readonly unknown[] {
  if (Array.isArray(value)) {
    return value;
  }

  if (!isRecord(value)) {
    return [];
  }

  const field = value[fieldName];
  return Array.isArray(field) ? field : [];
}

function dueLabel(task: Record<string, unknown>): string {
  const dueAt = stringField(task, "dueAt");
  if (dueAt) {
    return dueAt;
  }

  const dueInDays = numberField(task, "dueInDays");
  if (dueInDays === null) {
    return "Due date pending";
  }

  if (dueInDays === 0) {
    return "today";
  }

  if (dueInDays === 1) {
    return "tomorrow";
  }

  return `in ${dueInDays} days`;
}

export function tasksToScheduleItems(data: unknown): ScheduleItem[] {
  return listFromPayload(data, "tasks")
    .filter(isRecord)
    .map((task) => ({
      dueAt: dueLabel(task),
      id: stringField(task, "taskId", stringField(task, "id", "task")),
      title: stringField(task, "title", "Follow up")
    }));
}
