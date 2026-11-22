/**
 * agent-design AG07 (UIX.yaml conventions; PLANNER gap ④): what each client shows of the cards, step by step.
 *
 * Each client (web, app) keeps the cards it last received: from its real-time channel (the result documents carry
 * the card, and a decision on either client amends the document), from its own clicks and re-checks, and from the
 * read-back after reconnecting. It shows them through the same rule both real clients run,
 * `shared/compute/agent-card-view.ts`, with the card's own language for the fixed words. A client that is offline
 * keeps what it had; an App with an unsynced edit of a record on the card has that record in `pendingTargets`.
 */
import type { AgentActionPreviewContract, AgentResultDocument } from "../../../shared/contract/agent-v1";
import { agentCardView, type AgentCardView, type AgentCardWords } from "../../../shared/compute/agent-card-view";
import { en } from "../../../shared/copy/en";
import { ja } from "../../../shared/copy/ja";
import { zh } from "../../../shared/copy/zh";

const WORDS: Record<"zh" | "ja" | "en", AgentCardWords> = { en: en.aiCard, ja: ja.aiCard, zh: zh.aiCard };

export interface PendingEdit {
  fixture: string;
  productId: string;
  collection: "tasks";
  set: Record<string, unknown>;
}

interface ClientState {
  online: boolean;
  pending: Map<string, PendingEdit>;
  cards: Map<string, AgentActionPreviewContract>;
}

export interface ClientViewRecord {
  step: number;
  client: string;
  cardId: string | null;
  revision: number | null;
  payloadHash: string | null;
  view: AgentCardView | null;
}

/** Newer of two versions of one card: a later revision, then a later update. */
function newer(left: AgentActionPreviewContract | undefined, right: AgentActionPreviewContract): boolean {
  if (!left) return true;
  if (right.revision !== left.revision) return right.revision > left.revision;
  return right.updatedAt >= left.updatedAt;
}

export class ClientViews {
  private readonly states = new Map<string, ClientState>();
  readonly records: ClientViewRecord[] = [];

  constructor(private readonly locale: string) {}

  private state(name: string): ClientState {
    let state = this.states.get(name);
    if (!state) {
      state = { cards: new Map(), online: true, pending: new Map() };
      this.states.set(name, state);
    }
    return state;
  }

  setOnline(name: string, online: boolean): void {
    this.state(name).online = online;
  }

  online(name: string): boolean {
    return this.state(name).online;
  }

  /** A card this client received (channel, its own click, a re-check, a read-back). */
  note(name: string, card: AgentActionPreviewContract | null | undefined): void {
    if (!card?.actionId) return;
    const state = this.state(name);
    if (newer(state.cards.get(card.actionId), card)) state.cards.set(card.actionId, card);
  }

  /** The cards in the result documents this client holds from its channel. */
  noteDocuments(name: string, documents: Iterable<AgentResultDocument>): void {
    for (const document of documents) this.note(name, document.actionPreview);
  }

  addPending(name: string, edit: PendingEdit): void {
    this.state(name).pending.set(`${edit.collection}:${edit.productId}`, edit);
  }

  takePending(name: string): PendingEdit[] {
    const state = this.state(name);
    const edits = [...state.pending.values()];
    state.pending.clear();
    return edits;
  }

  card(name: string, cardId: string | null | undefined): AgentActionPreviewContract | null {
    return cardId ? this.state(name).cards.get(cardId) ?? null : null;
  }

  view(name: string, cardId: string | null | undefined): AgentCardView | null {
    const card = this.card(name, cardId);
    if (!card) return null;
    const state = this.state(name);
    const language = card.locale ?? (this.locale === "ja" || this.locale === "en" ? this.locale : "zh");
    return agentCardView(card, { online: state.online, pendingTargets: [...state.pending.keys()] }, WORDS[language]);
  }

  record(step: number, names: readonly string[], cardId: string | null): ClientViewRecord[] {
    const out = names.map((client) => {
      const card = this.card(client, cardId);
      return { cardId, client, payloadHash: card?.payloadHash ?? null, revision: card?.revision ?? null, step, view: this.view(client, cardId) };
    });
    this.records.push(...out);
    return out;
  }
}

/** The words a user reads on one client's card (for transcript.md, one line per client). */
export function viewText(view: AgentCardView | null): string[] {
  if (!view) return ["（没有卡）"];
  if (view.kind === "offline") return [`${view.summary}；${view.hint}（卡上的条目不显示，没有可点的按钮）`];
  const lines = [`［${view.chip.label}］${view.title}${view.banner ? ` · ${view.banner}` : ""}`];
  view.items.forEach((item, index) => {
    const rows = item.rows.map((row) => (row.before !== null ? `${row.label} ${row.changed ? "现在是 " : ""}${row.before} → ${row.after}${row.changed ? "（变了）" : ""}` : `${row.label} ${row.after}`)).join("；");
    lines.push(`  ${index + 1}. 〔${item.badge}〕${item.record}${rows ? `：${rows}` : ""}${item.status ? `  ${item.status.label}` : ""}${item.note ? `（${item.note}）` : ""}${item.pendingEdit ? `  ⚠ ${item.pendingEdit}` : ""}`);
  });
  if (view.buttons) lines.push(`  按钮：「${view.buttons.confirm}」${view.buttons.confirmEnabled ? "" : "（点不了）"} 「${view.buttons.dismiss}」${view.buttons.dismissEnabled ? "" : "（点不了）"}${view.blocked ? ` · ${view.blocked}` : ""}${view.hint ? ` · ${view.hint}` : ""}`);
  if (view.footer) lines.push(`  ${view.footer}`);
  if (view.regenerate) lines.push(`  ${view.regenerate.question}［${view.regenerate.label}］`);
  return lines;
}

/** What `same_card_on` compares: the shown content and state, not the client-only parts (buttons, sync notices). */
export function sharedPart(record: ClientViewRecord): unknown {
  const view = record.view;
  if (!view || view.kind !== "card") return null;
  return {
    cardId: record.cardId,
    chip: view.chip.label,
    footer: view.footer,
    items: view.items.map((item) => ({ badge: item.badge, record: item.record, rows: item.rows.map((row) => [row.label, row.before, row.after, row.changed]), status: item.status?.label ?? null })),
    payloadHash: record.payloadHash,
    regenerate: view.regenerate?.question ?? null,
    revision: record.revision,
    status: view.status,
    title: view.title,
  };
}
