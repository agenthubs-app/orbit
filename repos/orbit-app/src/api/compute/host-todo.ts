/**
 * R17（host/DESIGN.md §2.1、§3.3）：運営センター「対応が必要なこと」与少量态「次にやること」（规则，不调 AI）。Owner: 甲 (R17).
 */
import type { HostNextStep, HostTodoItem } from "../contract/host-events";

/** 生成编组需要的最少申込数（b6 #1「申込 20名を超えたらマッチングを生成」、#3）。 */
export const MATCHING_MINIMUM_APPLIED = 20;
/** 「マッチング未生成」提醒的时间窗：开催前 N 天内。 */
export const MATCHING_TODO_WINDOW_DAYS = 21;

export interface HostTodoEventFacts {
  eventId: string;
  title: string;
  status: "draft" | "upcoming" | "live" | "ended" | "cancelled" | "archived";
  formPublished: boolean;
  formPublishedAt: string | null;
  applied: number;
  pendingReview: number;
  /** none / generating / draft / published。 */
  matchingState: "none" | "generating" | "draft" | "published";
  profileIncomplete: number;
  /** 距开催的整天数（开催后为负）。 */
  daysToStart: number | null;
}

const ACTIVE = new Set(["upcoming", "live"]);

/** 跨活动的待办，按 審査待ち → マッチング未生成 → プロフィール未完了 排，每类取最紧的一场。 */
export function hostTodoItems(events: readonly HostTodoEventFacts[]): HostTodoItem[] {
  const active = events.filter((event) => ACTIVE.has(event.status));
  const items: HostTodoItem[] = [];
  const review = [...active].filter((event) => event.pendingReview > 0).sort((a, b) => b.pendingReview - a.pendingReview);
  for (const event of review.slice(0, 1)) items.push({ count: event.pendingReview, eventId: event.eventId, eventTitle: event.title, kind: "review_pending" });
  const matching = active
    .filter((event) => event.status === "upcoming" && event.matchingState === "none" && event.daysToStart !== null && event.daysToStart <= MATCHING_TODO_WINDOW_DAYS)
    .sort((a, b) => (a.daysToStart ?? 0) - (b.daysToStart ?? 0));
  for (const event of matching.slice(0, 1)) items.push({ daysLeft: event.daysToStart, eventId: event.eventId, eventTitle: event.title, kind: "matching_missing" });
  const incomplete = [...active].filter((event) => event.profileIncomplete > 0).sort((a, b) => b.profileIncomplete - a.profileIncomplete);
  for (const event of incomplete.slice(0, 1)) items.push({ count: event.profileIncomplete, eventId: event.eventId, eventTitle: event.title, kind: "profile_incomplete" });
  return items;
}

/** 一场活动的「次にやること」。 */
export function hostNextSteps(event: HostTodoEventFacts): HostNextStep[] {
  const steps: HostNextStep[] = [{ done: event.formPublished, doneAt: event.formPublished ? event.formPublishedAt : null, kind: "publish_form" }];
  if (event.pendingReview > 0) steps.push({ count: event.pendingReview, done: false, kind: "review_pending" });
  if (event.matchingState === "none" || event.matchingState === "generating") steps.push({ count: event.applied, done: false, kind: "generate_matching", threshold: MATCHING_MINIMUM_APPLIED });
  else if (event.matchingState === "draft") steps.push({ done: false, kind: "publish_matching" });
  if (event.status === "live") steps.push({ done: false, kind: "open_check_in" });
  return steps;
}
