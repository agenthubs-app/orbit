import type { NotificationDTO } from "../../shared/domain/contracts";
import type { LiveRecord, LiveRecordStoreLike } from "../../shared/storage/live-record-store";
import { taskRecordFromLiveRecord } from "../tasks/task-record";
import { canonicalScheduleItemSchema } from "../personal-schedule/authority-contract";

// Internal evidence from canonical storage, not a shared client contract and
// never reconstructed from an old href, title, contact or evidence excerpt.
export interface VerifiedLegacyTarget {
  kind: "task" | "schedule" | "contact";
  id: string;
  href: string;
  title: string;
  dueAt?: string;
}
export type LegacyProjectedNotification = Omit<NotificationDTO, "evidenceIds"> & {
  evidenceIds: readonly string[];
  actionHref?: string;
  verifiedTarget?: VerifiedLegacyTarget;
};

export function verifyLegacyTarget(input: {
  actorId: string;
  workspaceId: string;
  kind: VerifiedLegacyTarget["kind"];
  id: string;
  record: LiveRecord<Record<string, unknown>> | null;
}): VerifiedLegacyTarget | null {
  const { record, actorId, id, kind } = input;
  if (!record || record.workspaceId !== input.workspaceId || record.recordId !== id
    || record.userId !== actorId || record.lifecycleState !== "active") return null;
  if (kind === "task") {
    const task = taskRecordFromLiveRecord(record, actorId)?.task;
    if (!task || task.status !== "open") return null;
    return { kind, id, href: `/tasks/${encodeURIComponent(id)}`, title: task.title,
      ...(task.dueAt ? { dueAt: task.dueAt } : {}) };
  }
  if (kind === "schedule") {
    const parsed = canonicalScheduleItemSchema.safeParse(record.payload);
    if (record.collectionName !== "personal_schedule_items" || !parsed.success) return null;
    const s = parsed.data;
    if (s.id !== id || s.accountId !== actorId || s.ownerUserId !== actorId
      || ["ended", "cancelled"].includes(s.state)) return null;
    return { kind, id, href: `/schedule/personal/${encodeURIComponent(id)}`, title: s.title, dueAt: s.startsAt };
  }
  // A contact link proves only the owned contact, not an appointment query or
  // event drawer encoded in an old actionHref. Emit its canonical detail path.
  if (record.collectionName !== "contacts" || record.payload.id !== id
    || typeof record.payload.displayName !== "string" || !record.payload.displayName.trim()
    || ["deleted", "cancelled", "expired"].includes(String(record.payload.status))) return null;
  return { kind, id, href: `/contacts/${encodeURIComponent(id)}`, title: record.payload.displayName };
}

export function projectLegacyNotification(
  notification: LegacyProjectedNotification,
  target: VerifiedLegacyTarget | null,
): LegacyProjectedNotification & { actionHref: string } {
  const { verifiedTarget: _oldTarget, ...safe } = notification;
  return { ...safe, title: target?.title ?? "来源已不可用", body: "", actionHref: target?.href ?? "",
    evidenceIds: [], source: { type: "system", id: notification.id, label: target ? "Orbit 提醒" : "来源已不可用" },
    ...(target ? { verifiedTarget: target } : {}) };
}

export async function resolveLegacyReminderTarget(input: {
  actorId: string;
  workspaceId: string;
  targetType: "task" | "schedule_item";
  targetId: string;
  store: Pick<LiveRecordStoreLike<Record<string, unknown>>, "getRecord">;
}): Promise<VerifiedLegacyTarget | null> {
  if (!["task", "schedule_item"].includes(input.targetType)) return null;
  const kind = input.targetType === "task" ? "task" : "schedule";
  // Canonical authority stores exactly item.id (including any schedule:
  // prefix). No sourceId/containsId alias or speculative prefix stripping.
  const record = await input.store.getRecord({ workspaceId: input.workspaceId,
    collectionName: kind === "task" ? "tasks" : "personal_schedule_items", recordId: input.targetId });
  return verifyLegacyTarget({ ...input, kind, id: input.targetId, record });
}
