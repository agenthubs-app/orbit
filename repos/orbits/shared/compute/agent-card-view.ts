/**
 * agent-design AG07: what one confirmation card shows on a client (approved visual draft; 设计稿 §5.2, §7, §10, 附录 D).
 * The one rule both clients run (synced byte for byte to the App by `npm run sync:contract`), and the eval runner
 * runs to say what each client shows (`client_view`, `same_card_on`).
 *
 * Everything on the card comes from the server's preview (its count sentence, each item's record, labels and values
 * before and after, the dates) or is a fixed word of `shared/copy` aiCard, in the card's own language. Nothing is
 * formatted or assembled here; the only choices are which fixed word goes with which state.
 *
 * - Offline (§7): a waiting card shows only how many changes wait and "go online to confirm"; no item, no button.
 * - An unsynced edit on this device to a record the card changes (§7): confirm is not available ("sync first").
 * - A card the server re-froze because its data changed (`changes`): the banner and the changed rows are marked.
 * - Rejected and canceled both read "canceled"; expired asks whether to generate a new card.
 */
import type { AgentActionPreviewContract, AgentCardOperationStatus, AgentCardStatus } from "../contract/agent-v1";

/** The aiCard words a card uses (the client passes `standardCopy[card locale].aiCard`). */
export interface AgentCardWords {
  statusWaiting: string;
  statusProcessing: string;
  statusDone: string;
  statusPartial: string;
  statusFailed: string;
  statusExpired: string;
  statusCanceled: string;
  statusReview: string;
  statusUndone: string;
  badgeChange: string;
  badgeCreate: string;
  /** AG12: a contact deleted (restorable) or restored. */
  badgeDelete: string;
  badgeRestore: string;
  confirmAll: string;
  confirmOne: string;
  dismiss: string;
  beforeConfirm: string;
  changedBanner: string;
  nowIs: string;
  changeTo: string;
  syncFirst: string;
  pendingEditTodo: string;
  pendingEditOther: string;
  offlinePendingOne: string;
  offlinePending: string;
  offlineHint: string;
  itemProcessing: string;
  itemChanged: string;
  itemCreated: string;
  itemDeleted: string;
  itemRestored: string;
  itemFailed: string;
  itemSkipped: string;
  itemReview: string;
  itemUndone: string;
  itemMarkedDone: string;
  itemAbandoned: string;
  footerProcessing: string;
  footerDoneOne: string;
  footerDoneAll: string;
  footerPartial: string;
  footerFailed: string;
  footerCanceled: string;
  footerReview: string;
  expiredQuestion: string;
  regenerate: string;
  retry: string;
  markDone: string;
  abandon: string;
}

export interface AgentCardClientState {
  /** False while the client cannot reach the server. */
  online: boolean;
  /** Records with an edit on this device not synced yet, as `<collection>:<id>` (the App's outbox; empty on the web). */
  pendingTargets: readonly string[];
}

export type AgentCardTone = "plum" | "teal" | "apricot" | "grey";
export type AgentCardItemTone = "plum" | "teal" | "coral" | "apricot";

export interface AgentCardRowView {
  field: string;
  label: string;
  before: string | null;
  after: string;
  /** The server marked this row as changed since the card was shown ("现在是 … → 改成 …"). */
  changed: boolean;
}

export interface AgentCardItemView {
  operationId: string;
  badge: string;
  change: "update" | "create" | "delete" | "restore";
  record: string;
  rows: AgentCardRowView[];
  status: { label: string; tone: AgentCardItemTone } | null;
  /** The item waits for another ("第 1 项成功后才执行"). */
  note: string | null;
  /** This device holds an unsynced edit of the item's record. */
  pendingEdit: string | null;
  /** The item can be looked at in its record (done items). */
  openable: boolean;
  /** An item in needs_review: retry, mark as done, give up. */
  review: boolean;
}

export type AgentCardView =
  | { kind: "offline"; actionId: string; pendingCount: number; cardContent: "hidden"; confirmEnabled: false; summary: string; hint: string }
  | {
    kind: "card";
    actionId: string;
    revision: number;
    status: AgentCardStatus;
    pendingCount: number;
    cardContent: "shown";
    chip: { label: string; tone: AgentCardTone };
    title: string;
    banner: string | null;
    items: AgentCardItemView[];
    /** Present while the card waits for a decision. */
    buttons: { confirm: string; dismiss: string; confirmEnabled: boolean; dismissEnabled: boolean } | null;
    confirmEnabled: boolean;
    /** Why confirm is not available ("先同步你的修改"). */
    blocked: string | null;
    hint: string | null;
    footer: string | null;
    dim: boolean;
    regenerate: { question: string; label: string } | null;
    reviewButtons: { retry: string; markDone: string; abandon: string } | null;
  };

const WAITING: readonly AgentCardStatus[] = ["awaiting_confirmation", "deferred"];

const fill = (template: string, values: Readonly<Record<string, string | number>>) => template.replace(/\{([A-Za-z0-9_]+)\}/g, (match, key: string) => (key in values ? String(values[key]) : match));

/** The confirm button label of a card with `count` items. Code text that names the button uses this too, so the words match (AG07 repair 2). */
export function confirmButtonLabel(words: Pick<AgentCardWords, "confirmAll" | "confirmOne">, count: number): string {
  return count === 1 ? words.confirmOne : fill(words.confirmAll, { count });
}

function chipOf(status: AgentCardStatus, review: boolean, words: AgentCardWords): { label: string; tone: AgentCardTone } {
  if (review) return { label: words.statusReview, tone: "apricot" };
  switch (status) {
    case "awaiting_confirmation":
    case "deferred":
      return { label: words.statusWaiting, tone: "plum" };
    case "approved":
    case "executing":
      return { label: words.statusProcessing, tone: "plum" };
    case "completed":
      return { label: words.statusDone, tone: "teal" };
    case "partially_failed":
      return { label: words.statusPartial, tone: "apricot" };
    case "failed":
      return { label: words.statusFailed, tone: "apricot" };
    case "expired":
      return { label: words.statusExpired, tone: "grey" };
    case "undone":
      return { label: words.statusUndone, tone: "grey" };
    default:
      // rejected and canceled read the same (设计稿 §10).
      return { label: words.statusCanceled, tone: "grey" };
  }
}

function itemStatusOf(status: AgentCardStatus, op: AgentCardOperationStatus, change: AgentCardItemView["change"], words: AgentCardWords): AgentCardItemView["status"] {
  if (WAITING.includes(status) || status === "expired" || status === "rejected" || status === "canceled") return null;
  switch (op) {
    case "succeeded":
      return { label: change === "create" ? words.itemCreated : change === "delete" ? words.itemDeleted : change === "restore" ? words.itemRestored : words.itemChanged, tone: "teal" };
    case "failed":
      return { label: words.itemFailed, tone: "coral" };
    case "skipped":
      return { label: words.itemSkipped, tone: "apricot" };
    case "needs_review":
      return { label: words.itemReview, tone: "apricot" };
    case "undone":
      return { label: words.itemUndone, tone: "apricot" };
    case "user_confirmed":
      return { label: words.itemMarkedDone, tone: "teal" };
    case "abandoned":
      return { label: words.itemAbandoned, tone: "apricot" };
    default:
      return { label: words.itemProcessing, tone: "plum" };
  }
}

function footerOf(preview: AgentActionPreviewContract, review: boolean, words: AgentCardWords): string | null {
  if (review) return words.footerReview;
  const count = preview.operations.length;
  switch (preview.status) {
    case "approved":
    case "executing":
      return words.footerProcessing;
    case "completed":
      return count > 1 ? fill(words.footerDoneAll, { count }) : words.footerDoneOne;
    case "partially_failed":
      return fill(words.footerPartial, { count: preview.operations.filter((op) => op.status === "failed" || op.status === "skipped").length });
    case "failed":
      return words.footerFailed;
    case "rejected":
    case "canceled":
      return words.footerCanceled;
    default:
      return null;
  }
}

export function agentCardView(preview: AgentActionPreviewContract, client: AgentCardClientState, words: AgentCardWords): AgentCardView {
  const waiting = WAITING.includes(preview.status);
  const pendingCount = waiting ? 1 : 0;
  if (!client.online && waiting) {
    return { actionId: preview.actionId, cardContent: "hidden", confirmEnabled: false, hint: words.offlineHint, kind: "offline", pendingCount, summary: words.offlinePendingOne };
  }
  const changed = new Set((waiting ? preview.changes ?? [] : []).map((change) => `${change.operationId}|${change.field}`));
  const pending = new Set(client.pendingTargets);
  const review = preview.operations.some((op) => op.status === "needs_review");
  const items: AgentCardItemView[] = preview.operations.map((op) => {
    const display = op.display;
    const change = display?.change ?? (op.target ? "update" : "create");
    const targetKey = op.target ? `${op.target.collection}:${op.target.id}` : null;
    const pendingEdit = waiting && targetKey && pending.has(targetKey) ? (op.capability.startsWith("todo.") ? words.pendingEditTodo : words.pendingEditOther) : null;
    return {
      // AG12 (设计稿 §10「写“改”“新增”“删除”」): the badge says what the item does; clients show the word in their existing badge.
      badge: change === "create" ? words.badgeCreate : change === "delete" ? words.badgeDelete : change === "restore" ? words.badgeRestore : words.badgeChange,
      change,
      note: display?.note ?? null,
      openable: preview.status === "completed" || op.status === "succeeded",
      operationId: op.operationId,
      pendingEdit,
      // A card frozen before AG07 has no display: its one line written by the server stands for the item.
      record: display?.record ?? op.text,
      review: op.status === "needs_review",
      rows: (display?.rows ?? []).map((row) => ({ after: row.after, before: row.before ?? null, changed: changed.has(`${op.operationId}|${row.field}`), field: row.field, label: row.label })),
      status: itemStatusOf(preview.status, op.status, change, words),
    };
  });
  const blocked = waiting && items.some((item) => item.pendingEdit) ? words.syncFirst : null;
  const confirmEnabled = waiting && client.online && !blocked;
  const count = preview.operations.length;
  return {
    actionId: preview.actionId,
    banner: waiting && changed.size ? words.changedBanner : null,
    blocked,
    buttons: waiting ? { confirm: confirmButtonLabel(words, count), confirmEnabled, dismiss: words.dismiss, dismissEnabled: client.online } : null,
    cardContent: "shown",
    chip: chipOf(preview.status, review, words),
    confirmEnabled,
    dim: preview.status === "expired" || preview.status === "rejected" || preview.status === "canceled",
    footer: footerOf(preview, review, words),
    hint: waiting && !blocked ? words.beforeConfirm : null,
    items,
    kind: "card",
    pendingCount,
    // AG17 (approved draft, board 6): what an outside agent proposed cannot be made again in Orbit (the server refuses
    // it too); that agent has to propose it again, so its expired card offers no «重新生成».
    regenerate: preview.status === "expired" && preview.origin?.kind !== "connection" ? { label: words.regenerate, question: words.expiredQuestion } : null,
    reviewButtons: review ? { abandon: words.abandon, markDone: words.markDone, retry: words.retry } : null,
    revision: preview.revision,
    status: preview.status,
    title: preview.title,
  };
}

/** What a client shows for the waiting cards it knows of while offline ("有 2 份待确认的修改"). */
export function offlinePendingSummary(count: number, words: Pick<AgentCardWords, "offlinePendingOne" | "offlinePending">): string {
  return count === 1 ? words.offlinePendingOne : fill(words.offlinePending, { count });
}
