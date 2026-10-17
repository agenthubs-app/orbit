// R20a · D line. Consumers: To-do (Web/App), R10 今日やること, R19 widgets.
// Home schedule cards are outside this contract; R10 reads /api/schedule-items separately.
export type TodoSourceKey = "task_suggestion" | "agent_action" | "plan_pending" | "entity_draft" | "contact_draft" | "completion_question" | "agent_signal" | "plan_today_chance" | "relationship_task" | "task";
export type TodoSectionKey = "decisions" | "nextMoves" | "followups";
export type TodoDecisionAction = "accept" | "dismiss" | "snooze" | "open";
export interface TodoItemBase {
  key: string;
  source: TodoSourceKey;
  sourceId: string;
  titlePreview: string;
  contactId?: string;
  contactNamePreview?: string;
  eventId?: string;
  createdAt: string;
  sample?: true;
}
export interface TodoDecisionItem extends TodoItemBase {
  reasonPreview?: string;
  actions: readonly TodoDecisionAction[];
  conversationId?: string;
}
export interface TodoNextMoveItem extends TodoItemBase {
  reasonPreview?: string;
  draftAvailable: boolean;
  taskId?: string;
}
export interface TodoFollowupItem extends TodoItemBase {
  kind: "task" | "lifecycle";
  taskId: string;
  status: "open" | "scheduled";
  dueAt?: string;
  overdue: boolean;
  deferralCount?: number;
}
export interface TodoSection<T> {
  items: readonly T[];
  next: Partial<Record<TodoSourceKey, string>>;
}
export interface TodoPageContract {
  date: string;
  timeZone: string;
  asOf: string;
  counts: { decisions: number; nextMoves: number; followups: number; overdue: number };
  countsCapped: { decisions: boolean; nextMoves: boolean };
  decisions: TodoSection<TodoDecisionItem>;
  nextMoves: TodoSection<TodoNextMoveItem>;
  followups: TodoSection<TodoFollowupItem>;
  sources: Partial<Record<TodoSourceKey, "ok" | "unavailable" | "not_implemented">>;
}
