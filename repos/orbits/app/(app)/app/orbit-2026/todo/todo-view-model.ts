import { TODO_SECTION_SOURCES } from "../../../../../shared/api-schema/todo-page";
import type { TodoPageContract, TodoSectionKey, TodoSourceKey } from "../../../../../shared/contract/todo-page";

export type DecisionAction = "accept" | "dismiss" | "snooze";
export interface TodoRowView { key: string; title: string; subtitle?: string; contactName?: string; sample: boolean }
export interface TodoDecisionView extends TodoRowView {
  source: TodoSourceKey;
  actions: readonly DecisionAction[];
  href?: string;
  unverifiedConversation: boolean;
  question: boolean;
}
export interface TodoNextMoveView extends TodoRowView { draftAvailable: boolean }
export interface TodoFollowupView extends TodoRowView { href?: string; detailUnavailable: boolean; overdue: boolean; dueAt?: string; deferralCount?: number }
export interface TodoSectionView<T> {
  state: "ready" | "empty" | "partial" | "failed" | "hidden";
  count: { value: number | null; partial: boolean; capped: boolean };
  items: readonly T[];
  issues: readonly { source: TodoSourceKey; status: "unavailable" | "not_implemented" }[];
  more: readonly TodoSourceKey[];
}
export interface TodoPageView {
  date: string;
  timeZone: string;
  asOf: string;
  overdue: number | null;
  decisions: TodoSectionView<TodoDecisionView>;
  nextMoves: TodoSectionView<TodoNextMoveView>;
  followups: TodoSectionView<TodoFollowupView>;
}

function sectionView<T>(page: TodoPageContract, section: TodoSectionKey, items: readonly T[]): TodoSectionView<T> {
  const sources: readonly TodoSourceKey[] = TODO_SECTION_SOURCES[section];
  const issues = sources.flatMap(source => {
    const status = page.sources[source] ?? "not_implemented";
    return status === "ok" ? [] : [{ source, status }];
  });
  const unavailable = issues.some(issue => issue.status === "unavailable");
  const hasHealthy = sources.some(source => page.sources[source] === "ok");
  const capped = section === "followups" ? false : page.countsCapped[section];
  const partial = issues.length > 0 || capped;
  return {
    state: !hasHealthy ? unavailable ? "failed" : "hidden" : partial ? "partial" : items.length ? "ready" : "empty",
    count: { value: partial && page.counts[section] === 0 ? null : page.counts[section], partial, capped },
    items, issues, more: sources.filter(source => Boolean(page[section].next[source])),
  };
}

/** API-to-presenter boundary. Never invent a session identity or exact partial count. */
export function todoPageView(page: TodoPageContract): TodoPageView {
  const decisions = sectionView(page, "decisions", page.decisions.items.map(item => {
    const supported: readonly DecisionAction[] = item.source === "task_suggestion" || item.source === "agent_action" ? ["accept", "dismiss", "snooze"] : item.source === "plan_pending" ? ["accept", "dismiss"] : [];
    return {
      key: item.key, title: item.titlePreview, subtitle: item.reasonPreview, contactName: item.contactNamePreview, sample: Boolean(item.sample), source: item.source,
      actions: item.sample || page.sources[item.source] !== "ok" ? [] : supported.filter(action => item.actions.includes(action)),
      // Provider-local conversationId is not a verified persisted chat session.
      ...(item.source === "entity_draft" ? { href: "/app/agent" } : item.source === "contact_draft" ? { href: "/app/contacts/new/drafts" } : item.source === "plan_pending" ? { href: "/app/tasks?tab=plan" } : {}),
      unverifiedConversation: item.source === "entity_draft", question: item.source === "completion_question",
    };
  }));
  const nextMoves = sectionView(page, "nextMoves", page.nextMoves.items.map(item => ({
    key: item.key, title: item.titlePreview, subtitle: item.reasonPreview, contactName: item.contactNamePreview, sample: Boolean(item.sample), draftAvailable: item.draftAvailable,
  })));
  const followups = sectionView(page, "followups", page.followups.items.map(item => ({
    key: item.key, title: item.titlePreview, contactName: item.contactNamePreview, sample: Boolean(item.sample),
    // The legacy relationship/[id] route expects a connection ID, not taskId.
    href: item.kind === "lifecycle" ? item.contactId ? `/app/contacts/${encodeURIComponent(item.contactId)}` : undefined : `/app/tasks/${encodeURIComponent(item.taskId)}`,
    detailUnavailable: item.kind === "lifecycle",
    dueAt: item.dueAt, overdue: item.overdue, ...(item.kind === "task" && item.deferralCount !== undefined ? { deferralCount: item.deferralCount } : {}),
  })));
  return { date: page.date, timeZone: page.timeZone, asOf: page.asOf, overdue: followups.count.partial ? null : page.counts.overdue, decisions, nextMoves, followups };
}
