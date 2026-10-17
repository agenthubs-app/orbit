/**
 * R11a / R20a（主会话代定 2026-10-18，RD-33）：「要フォロー」的唯一口径。
 * 负责：B 线（R11a 人脈）；使用方：R11a 人脈页签 / 计数（服务端 SQL 同口径、App 本机镜像）、
 * R20a To-do（D 线）。npm run sync:contract 逐字拷到 App 的 src/api/compute。
 *
 * 一条任务算「还开着的跟进」：
 *   - 普通任务（tasks 集合）：挂了联系人（`relatedContactId` 有值）或 `category === "relationship"`，
 *     `status === "open"`，且没有被删除（`deletedAt` / `lifecycleState === "deleted"` / `deleted`）；
 *   - 关系跟进任务（lifecycle，带 `contactId` / `connectionId`）：`status` 是 `open` 或 `scheduled`。
 * 状态按宽进读：未知状态一律视为「不开着」。
 */

export interface FollowUpPlainTaskInput {
  kind?: "task";
  status: string;
  category?: string | null;
  relatedContactId?: string | null;
  deletedAt?: string | null;
  lifecycleState?: string | null;
  deleted?: boolean | null;
}

export interface FollowUpLifecycleTaskInput {
  kind: "lifecycle";
  status: string;
  contactId?: string | null;
  connectionId?: string | null;
  deletedAt?: string | null;
  lifecycleState?: string | null;
  deleted?: boolean | null;
}

export type FollowUpTaskInput = FollowUpPlainTaskInput | FollowUpLifecycleTaskInput;

export const OPEN_PLAIN_TASK_STATUSES = ["open"] as const;
export const OPEN_LIFECYCLE_TASK_STATUSES = ["open", "scheduled"] as const;

function present(value: string | null | undefined): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function isDeleted(task: FollowUpTaskInput): boolean {
  return present(task.deletedAt) || task.lifecycleState === "deleted" || task.deleted === true;
}

export function isOpenFollowUpTask(task: FollowUpTaskInput): boolean {
  if (isDeleted(task)) return false;
  if (task.kind === "lifecycle") {
    if (!present(task.contactId) && !present(task.connectionId)) return false;
    return (OPEN_LIFECYCLE_TASK_STATUSES as readonly string[]).includes(task.status);
  }
  if (!present(task.relatedContactId) && task.category !== "relationship") return false;
  return (OPEN_PLAIN_TASK_STATUSES as readonly string[]).includes(task.status);
}

/** The contact an open follow-up hangs on (lifecycle tasks name the contact directly). */
export function followUpContactId(task: FollowUpTaskInput): string | null {
  if (!isOpenFollowUpTask(task)) return null;
  if (task.kind === "lifecycle") return present(task.contactId) ? task.contactId : null;
  return present(task.relatedContactId) ? task.relatedContactId : null;
}

/** Contact ids that have at least one open follow-up (counted per person, not per task). */
export function contactIdsWithOpenFollowUps(tasks: readonly FollowUpTaskInput[]): Set<string> {
  const ids = new Set<string>();
  for (const task of tasks) {
    const id = followUpContactId(task);
    if (id) ids.add(id);
  }
  return ids;
}
