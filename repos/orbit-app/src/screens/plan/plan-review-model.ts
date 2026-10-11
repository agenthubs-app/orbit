// R25 pure helpers for 見直し, 達成, the goal switcher and 以前のプラン. No React, so the
// rules are testable on their own. Nothing here computes a score or a quota: those
// numbers always come from the server (UI-SPEC「界面不自己算分、不自己算配额」).
import type {
  PlanDraftTurn,
  PlanGoalKind,
  PlanGoalListItem,
  PlanLegacyDetail,
  PlanPremiseMark,
  PlanPremiseRow,
  PlanReviewView,
  PlanV2Detail,
} from "../../api/contract/plan-v2";

const TOKYO_OFFSET_MS = 9 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

/** The Tokyo calendar date of an instant (`resetsAt`, `achievedAt`, `startsOn`). */
export function tokyoDate(iso: string): { year: number; month: number; day: number } | null {
  const time = Date.parse(iso.length === 10 ? `${iso}T00:00:00+09:00` : iso);
  if (Number.isNaN(time)) return null;
  const shifted = new Date(time + TOKYO_OFFSET_MS);
  return { day: shifted.getUTCDate(), month: shifted.getUTCMonth() + 1, year: shifted.getUTCFullYear() };
}

/** Whole Tokyo days from `now` until `iso` (0 when it is today or past). */
export function daysUntil(iso: string, now: Date): number {
  const target = tokyoDate(iso);
  const today = tokyoDate(now.toISOString());
  if (!target || !today) return 0;
  const diff = Date.UTC(target.year, target.month - 1, target.day) - Date.UTC(today.year, today.month - 1, today.day);
  return Math.max(0, Math.round(diff / DAY_MS));
}

/** The quota bar: one cell per review this month, used ones first (grey), then the ones left. */
export function quotaCells(left: number, limit: number): ("used" | "left")[] {
  const total = Math.max(0, limit);
  const remaining = Math.min(total, Math.max(0, left));
  return Array.from({ length: total }, (_, index) => (index < total - remaining ? "used" : "left"));
}

/**
 * The 「今月 k / 3 回目」 of a turn. The server only tells how many reviews are left
 * this month, so the latest turn is the one just used and earlier turns of this draft
 * count back from it (never below 1).
 */
export function turnOrdinal(view: Pick<PlanReviewView, "reviewLeftThisMonth" | "reviewMonthlyLimit"> & { draft: { turns: readonly Pick<PlanDraftTurn, "n">[] } }, n: number): number {
  const used = Math.max(0, view.reviewMonthlyLimit - view.reviewLeftThisMonth);
  const turns = view.draft.turns.length;
  return Math.max(1, used - (turns - n));
}

/** The premise rows the user changed (trimmed, different from the confirmed value). */
export function premiseEdits(rows: readonly Pick<PlanPremiseRow, "key" | "value">[], edits: Readonly<Record<string, string>>): { key: string; value: string }[] {
  return rows.flatMap((row) => {
    const value = edits[row.key]?.trim();
    return value && value !== row.value ? [{ key: row.key, value }] : [];
  });
}

/** Counts since the plan was confirmed, in the review's shape (`PlanV2Detail.sinceConfirmed` is optional). */
export type SinceConfirmed = PlanReviewView["sinceConfirmed"];
export function sinceConfirmedOf(plan: Pick<PlanV2Detail, "sinceConfirmed">): SinceConfirmed | null {
  const since = plan.sinceConfirmed;
  return since ? { events: since.events, stepsCompleted: since.stepsDone, talked: since.talkedPeople } : null;
}

/** The record summaries behind an AI mark (optional `evidence`; at most three lines). */
export function markEvidenceTexts(mark: PlanPremiseMark): string[] {
  return (mark.evidence ?? []).map((entry) => entry.text).filter((text) => text.trim() !== "").slice(0, 3);
}

export function markOf(marks: readonly PlanPremiseMark[], key: string): PlanPremiseMark | null {
  return marks.find((mark) => mark.key === key) ?? null;
}

/** The 3-step progress of the review page: 前提 → AI 修正 → 手動編集. */
export type ReviewStage = 0 | 1 | 2;
export function reviewStage(view: { draft: { turns: readonly unknown[]; manualEditAvailable: boolean } } | null): ReviewStage {
  if (!view) return 0;
  return view.draft.turns.length > 0 ? 1 : 0;
}

/** Whether a 見直し can be sent now: the draft is open and this month still has one. */
export function canSendReview(view: Pick<PlanReviewView, "reviewLeftThisMonth"> & { draft: { status: string } }): boolean {
  return view.draft.status === "open" && view.reviewLeftThisMonth > 0;
}

/** The goal switcher's two groups: active goals (current first is not forced) and achieved ones. */
export function goalGroups(goals: readonly PlanGoalListItem[]): { active: PlanGoalListItem[]; achieved: PlanGoalListItem[] } {
  return { achieved: goals.filter((goal) => goal.status === "achieved"), active: goals.filter((goal) => goal.status === "active") };
}

/** 目標を編集: what changed (trimmed text, kind). An unchanged form cannot be saved. */
export function goalEditChange(before: { goal: string; goalKind: string }, after: { goalText: string; goalKind: PlanGoalKind | null }): { goalText?: string; goalKind?: PlanGoalKind } | null {
  const text = after.goalText.trim();
  const change: { goalText?: string; goalKind?: PlanGoalKind } = {};
  if (text && text !== before.goal) change.goalText = text;
  if (after.goalKind && after.goalKind !== before.goalKind) change.goalKind = after.goalKind;
  return change.goalText !== undefined || change.goalKind !== undefined ? change : null;
}

/** 以前のプラン: items grouped by kind in a fixed order (行動 / 会いたい人 / 情報 / イベント). */
export const LEGACY_KINDS = ["action", "network_need", "info", "event"] as const;
export type LegacyKind = (typeof LEGACY_KINDS)[number];
export function legacyGroups(items: PlanLegacyDetail["items"]): { kind: LegacyKind; items: PlanLegacyDetail["items"][number][] }[] {
  return LEGACY_KINDS.map((kind) => ({ items: items.filter((item) => item.kind === kind), kind })).filter((group) => group.items.length > 0);
}

/** A v1 item status as one of four display states (unknown values read as 未完了). */
export type LegacyStatus = "done" | "skipped" | "dismissed" | "open";
export function legacyStatus(status: string): LegacyStatus {
  const value = status.toLowerCase();
  if (["done", "completed", "complete", "achieved", "met"].includes(value)) return "done";
  if (["skipped", "skip"].includes(value)) return "skipped";
  if (["dismissed", "archived", "cancelled", "canceled", "rejected"].includes(value)) return "dismissed";
  return "open";
}
