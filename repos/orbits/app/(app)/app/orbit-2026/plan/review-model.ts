// R25: pure helpers for 見直し / 達成 / 目標の切替 / 以前のプラン (no React, no fetch).
// Every number shown comes from the server (`PlanQuotaResponse`, `PlanReviewView`,
// `PlanAchievementView`); these only lay it out.
import type { PlanDraftChange, PlanDraftTurn, PlanGoalListItem, PlanLegacyDetail, PlanPremiseMark, PlanPremiseRow, PlanV2Detail } from "../../../../../shared/contract/plan-v2";
import type { OrbitLanguage } from "../../../../../shared/contract/language";
import { planReviewCopy as r } from "../copy/plan";
import type { OrbitCopyEntry } from "../copy/types";
import { eventView, typeCards } from "./overview-model";

export type QuotaCell = "used" | "left";

/** The 3-cell bar (b4 A4 ①): used cells first (grey), the rest dark plum. */
export function quotaCells(left: number, limit: number): QuotaCell[] {
  const total = Math.max(0, limit);
  const remaining = Math.max(0, Math.min(total, left));
  return Array.from({ length: total }, (_, index) => (index < total - remaining ? "used" : "left"));
}

/** 「11月1日」 in the UI language, Tokyo calendar (the monthly reset is Tokyo month start). */
export function monthDay(iso: string, language: OrbitLanguage): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat(language === "en" ? "en" : language === "zh" ? "zh-CN" : "ja-JP", { day: "numeric", month: language === "en" ? "short" : "long", timeZone: "Asia/Tokyo" }).format(date);
}

/** 「2026年10月7日」 for a date-only or ISO string (Tokyo). */
export function fullDate(value: string, language: OrbitLanguage): string {
  const date = new Date(/^\d{4}-\d{2}-\d{2}$/u.test(value) ? `${value}T00:00:00+09:00` : value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat(language === "en" ? "en" : language === "zh" ? "zh-CN" : "ja-JP", { dateStyle: "medium", timeZone: "Asia/Tokyo" }).format(date);
}

/** Whole days until `iso` (at least 0). */
export function daysUntil(iso: string, now: Date = new Date()): number {
  const ms = Date.parse(iso) - now.getTime();
  return Number.isFinite(ms) ? Math.max(0, Math.ceil(ms / 86_400_000)) : 0;
}

/** Where a premise row came from (背景 / Q1… / 記録). */
export function premiseSource(row: Pick<PlanPremiseRow, "source">): { entry: OrbitCopyEntry; n?: number } {
  if (row.source === "background") return { entry: r.sourceBackground };
  if (row.source === "record") return { entry: r.sourceRecord };
  return { entry: r.sourceQ, n: Number(row.source.slice(1)) || 1 };
}

export type PremiseRowView = {
  row: PlanPremiseRow;
  mark: PlanPremiseMark | null;
  /** The value the person typed (only when it differs from the confirmed one). */
  edited: string | null;
};

export function premiseRows(premise: readonly PlanPremiseRow[], marks: readonly PlanPremiseMark[], edits: Readonly<Record<string, string>>): PremiseRowView[] {
  const byKey = new Map(marks.map((mark) => [mark.key, mark]));
  return premise.map((row) => {
    const value = edits[row.key];
    return { edited: value !== undefined && value.trim() !== "" && value.trim() !== row.value ? value.trim() : null, mark: byKey.get(row.key) ?? null, row };
  });
}

/** The `premise` body of `review/fix`: only rows whose value really changed. */
export function premiseEdits(premise: readonly PlanPremiseRow[], edits: Readonly<Record<string, string>>): { key: string; value: string }[] {
  return premiseRows(premise, [], edits).filter((view) => view.edited !== null).map((view) => ({ key: view.row.key, value: view.edited! }));
}

/** Only the latest turn's changes can be ✓ / ✕ (the server keeps one base per turn). */
export function isToggleable(turns: readonly PlanDraftTurn[], turn: PlanDraftTurn, change: PlanDraftChange): boolean {
  return Boolean(change.id) && turns.length > 0 && turns[turns.length - 1]!.n === turn.n;
}

export function turnHasChanges(turns: readonly PlanDraftTurn[]): boolean {
  return turns.some((turn) => turn.changes.some((change) => change.accepted !== false));
}

/**
 * 「今回参考にするデータ」 before a review is open: the overview's `sinceConfirmed` (server);
 * an older server without it → counted from the overview (people met per type, event
 * visits, completed steps). Once a review is open its own `sinceConfirmed` is used.
 */
export function sinceFromDetail(detail: Pick<PlanV2Detail, "content" | "score" | "typeStats" | "sinceConfirmed">): { talked: number; events: number; stepsCompleted: number } {
  // The server's own counts first (same basis as `PlanReviewView.sinceConfirmed`).
  if (detail.sinceConfirmed) return { events: detail.sinceConfirmed.events, stepsCompleted: detail.sinceConfirmed.stepsDone, talked: detail.sinceConfirmed.talkedPeople };
  const talked = typeCards(detail).filter((card) => !card.type.skipped).reduce((sum, card) => sum + card.met, 0);
  return { events: eventView(detail).count, stepsCompleted: detail.content.steps.filter((step) => step.completedAt).length, talked };
}

export function activeGoalsOf(goals: readonly PlanGoalListItem[]): PlanGoalListItem[] {
  return goals.filter((goal) => goal.status === "active");
}

export function achievedGoalsOf(goals: readonly PlanGoalListItem[]): PlanGoalListItem[] {
  return goals.filter((goal) => goal.status === "achieved");
}

/* ---------- 以前のプラン ---------- */

export type LegacyKind = PlanLegacyDetail["items"][number]["kind"];
export const LEGACY_KINDS: readonly LegacyKind[] = ["action", "network_need", "info", "event"];

export const LEGACY_KIND_COPY: Record<LegacyKind, OrbitCopyEntry> = {
  action: r.kindAction,
  event: r.kindEvent,
  info: r.kindInfo,
  network_need: r.kindNeed,
};

const STATUS_COPY: Record<string, OrbitCopyEntry> = {
  answered: r.statusAnswered,
  attended: r.statusAttended,
  done: r.statusDone,
  established: r.statusEstablished,
  in_progress: r.statusInProgress,
  linked: r.statusLinked,
  not_started: r.statusNotStarted,
  open: r.statusOpen,
  recommended: r.statusRecommended,
  registered: r.statusRegistered,
};

/** A v1 item status → its chip (an unknown status shows no chip rather than a raw code). */
export function legacyStatusCopy(status: string): OrbitCopyEntry | null {
  return STATUS_COPY[status] ?? null;
}

export function legacyGroups(items: PlanLegacyDetail["items"]): { kind: LegacyKind; items: PlanLegacyDetail["items"][number][] }[] {
  return LEGACY_KINDS.map((kind) => ({ items: items.filter((item) => item.kind === kind), kind })).filter((group) => group.items.length > 0);
}

/** A mark's basis line: the server's evidence summaries (text · date), else its reason, else the count. */
export function markEvidence(mark: PlanPremiseMark, language: OrbitLanguage): string | null {
  if (mark.evidence?.length) return mark.evidence.slice(0, 2).map((item) => { const day = monthDay(item.at, language); return day ? `${item.text}（${day}）` : item.text; }).join(" · ");
  return mark.reason ?? null;
}
