import type { MessageKey } from "../i18n/messages";

export interface PendingWriteCounts {
  note: number;
  task: number;
  personal_schedule: number;
  relationship_message: number;
}

export const NO_PENDING_WRITES: PendingWriteCounts = { note: 0, task: 0, personal_schedule: 0, relationship_message: 0 };

/** The AI page's one gray line: 「有 2 项笔记修改、1 条待发送消息还没同步，AI 暂时看不到」; empty when nothing waits. */
export function pendingWriteItems(counts: PendingWriteCounts, t: (key: MessageKey, values?: Record<string, string | number>) => string): string {
  const parts: string[] = [];
  const add = (count: number, many: MessageKey, one: MessageKey) => {
    if (count > 0) parts.push(count === 1 ? t(one) : t(many, { count }));
  };
  add(counts.note, "aiConversation.pendingNotes", "aiConversation.pendingNotesOne");
  add(counts.task, "aiConversation.pendingTasks", "aiConversation.pendingTasksOne");
  add(counts.personal_schedule, "aiConversation.pendingSchedule", "aiConversation.pendingScheduleOne");
  add(counts.relationship_message, "aiConversation.pendingMessages", "aiConversation.pendingMessagesOne");
  if (parts.length === 0) return "";
  if (parts.length === 1) return parts[0]!;
  return parts.slice(0, -1).join(t("aiConversation.pendingSeparator")) + t("aiConversation.pendingLastSeparator") + parts.at(-1)!;
}
