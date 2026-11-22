/**
 * agent-design AG02: the one server-side preview of a card (设计稿 §5.1 actionPreview). The single-
 * card GET, the decision response and the result document all return this; clients render it and
 * never assemble card fields themselves. Expiry is judged from expiresAt when it is read.
 */
import type { AgentActionPreviewContract } from "../../../shared/contract/agent-v1";
import type { AgentActionRecord, AgentRunDetail } from "./contract";
import { cardOperationStatus, effectiveCardStatus } from "./decision";
import { outcomeOf } from "../../agent-v1/domains/private-event/ops";
import { agentAutomationLocalDay } from "../automations/contract";
import { cardLocale } from "./todo-operations";

/** AG13: the reason an item that ran was not done, from its latest failed receipt (null when there is none to say). */
function outcomeOfItem(action: AgentActionRecord, detail: AgentRunDetail | null, operationId: string): string | null {
  const failed = (detail?.receipts ?? []).filter((receipt) => receipt.actionId === action.actionId && receipt.operationId === operationId && receipt.status === "failed").sort((left, right) => left.updatedAt.localeCompare(right.updatedAt)).at(-1);
  return failed ? outcomeOf(failed.resultSummary, cardLocale(action.locale)) : null;
}

const MONTH_SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "10月1日", "Oct 1": a day in the card's language, in the zone of the card's scheduled task (Tokyo for other cards). */
function shortDay(instant: string, action: AgentActionRecord, locale: "zh" | "ja" | "en"): string {
  const zone = action.operations.map((op) => (op.payload as { schedule?: { timeZone?: unknown } } | undefined)?.schedule?.timeZone).find((value): value is string => typeof value === "string") ?? "Asia/Tokyo";
  let day: string;
  try {
    day = agentAutomationLocalDay(instant, zone);
  } catch {
    day = instant.slice(0, 10);
  }
  const [, month, date] = day.split("-").map(Number);
  return locale === "en" ? `${MONTH_SHORT[month - 1]} ${date}` : `${month}月${date}日`;
}

/**
 * AG15 (approved draft D15-5, D15-6): the small line under an expired card. Left too long: the day it was made, how
 * long it waited, and that nothing was done. Replaced by the next period of its scheduled task: which period.
 */
export function expiredCardNote(action: AgentActionRecord): string | null {
  if (action.status !== "expired") return null;
  const locale = cardLocale(action.locale);
  if (action.expiredReason === "superseded") {
    if (!action.supersededBy) return ({ en: "The next run of this scheduled task made a new card; this one no longer applies.", ja: "同じ定期タスクの次の回で新しいカードが出たため、このカードは無効です。", zh: "同一条定时任务的下一期出了新卡，这张不再有效。" } as const)[locale];
    const day = shortDay(action.supersededBy.firedAt, action, locale);
    return ({ en: `The ${day} run made a new card; this one no longer applies.`, ja: `${day}の回で新しいカードが出たため、このカードは無効です。`, zh: `${day}那一期出了新卡，这张不再有效。` } as const)[locale];
  }
  const frozenAt = action.revisions?.length ? action.revisions[action.revisions.length - 1].supersededAt : action.createdAt;
  const waited = action.expiresAt ? Math.max(1, Math.round((Date.parse(action.expiresAt) - Date.parse(frozenAt)) / 86_400_000)) : 7;
  const day = shortDay(frozenAt, action, locale);
  return ({
    en: `This card was made on ${day} and waited ${waited} day${waited === 1 ? "" : "s"}. Nothing was created or changed.`,
    ja: `このカードは${day}に出たもので、${waited}日間そのままでした。何も作成・変更していません。`,
    zh: `这张卡是 ${day} 出的，放了 ${waited} 天。什么都没有建，也没有改。`,
  } as const)[locale];
}

export function agentCardPreview(action: AgentActionRecord, detail: AgentRunDetail | null, now: string): AgentActionPreviewContract {
  const expired = effectiveCardStatus(action, now) === "expired";
  // A card past its expiry reads as expired before its timer has fired; the note is written from the same facts.
  const note = expired ? expiredCardNote({ ...action, status: "expired" }) : null;
  return {
    actionId: action.actionId,
    ...(action.contentChanges?.length ? { changes: action.contentChanges.map((change) => ({ ...change })) } : {}),
    ...(action.expiresAt ? { expiresAt: action.expiresAt } : {}),
    ...(action.status === "expired" && action.expiredReason ? { expiredReason: action.expiredReason } : {}),
    ...(note ? { expiredNote: note } : {}),
    ...(action.status === "expired" && action.supersededBy ? { supersededBy: { ...action.supersededBy } } : {}),
    ...(action.locale === "zh" || action.locale === "ja" || action.locale === "en" ? { locale: action.locale } : {}),
    operations: action.operations.map((op) => ({
      ...(outcomeOfItem(action, detail, op.operationId) ? { outcome: outcomeOfItem(action, detail, op.operationId)! } : {}),
      after: { ...(op.after ?? op.payload) },
      ...(op.before ? { before: { ...op.before } } : {}),
      capability: op.capability ?? op.operationType,
      ...(op.dependsOn?.length ? { dependsOn: [...op.dependsOn] } : {}),
      ...(op.display ? { display: { ...op.display, rows: op.display.rows.map((row) => ({ ...row })) } } : {}),
      operationId: op.operationId,
      ...(op.partId ? { partId: op.partId } : {}),
      ...(op.shown ? { shown: { ...op.shown } } : {}),
      status: cardOperationStatus(op.operationId, action, detail, now),
      ...(op.targetRef ? { target: { ...op.targetRef } } : {}),
      text: op.preview,
    })),
    ...(action.origin ? { origin: { ...action.origin } } : {}),
    payloadHash: action.payloadHash ?? action.immutablePayloadHash,
    revision: action.revision ?? 1,
    revisions: (action.revisions ?? []).map((item) => ({ payloadHash: item.payloadHash, revision: item.revision })),
    status: effectiveCardStatus(action, now),
    summary: action.preview,
    title: action.title,
    updatedAt: action.updatedAt,
  };
}
