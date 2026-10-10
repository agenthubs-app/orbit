// R07 Task tabs (frozen order, RD-20). Plain module so server pages can read `?tab=`.
export const TASK_TABS = ["calendar", "todo", "plan", "memo"] as const;
export type TaskTab = (typeof TASK_TABS)[number];

export function taskTabFrom(value: unknown): TaskTab {
  const first = Array.isArray(value) ? value[0] : value;
  return (TASK_TABS as readonly string[]).includes(first) ? first as TaskTab : "todo";
}
