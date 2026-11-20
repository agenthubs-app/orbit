/**
 * Which matter a new message, or a click, belongs to (设计稿 §3.7 "新消息接到哪件事上"; agent-design
 * AG04, 易错边界 6).
 *
 * - A click carries the clarification id and the chosen option id; code binds it straight to the
 *   part it was offered for. The option must be one of those offered then, under a set still open.
 *   A click never goes to the model and never makes a new request.
 * - Text: the first layer marks each part `continues` with an open item; code checks the item is open
 *   and of that kind, and that no other part already took it — otherwise the part is a new request.
 *   One message may answer a question and ask something new; each part is attributed on its own.
 * - A reply that still cannot be read, right after a question (no other message since), is taken as
 *   the (failed) answer to that question, so the part is not asked a second time (§3.11 只问一次).
 * - Typed words never approve a card (AG02); here they only answer a question or accept an alternative.
 */
import type { AgentClarificationContract, AgentClarificationOptionContract } from "../../../shared/contract/agent-v1";
import type { SessionOpenItem } from "../context/session-state";
import type { Clarity, ContinueKind } from "../understand/schema";

export interface AttributionPart {
  localId: string;
  clarity: Clarity;
  /** The open item the first layer says this part continues (its stored ref, mapped from the handle). */
  continues?: { kind: string; ref: string } | null;
  /** AG10: the part's capabilities (a bare reply has none). */
  capabilities?: readonly string[];
}

export type Attribution =
  | { kind: "new" }
  | { kind: ContinueKind; item: SessionOpenItem; fallback: boolean };

export function attributeMessage(parts: readonly AttributionPart[], openItems: readonly SessionOpenItem[]): Map<string, Attribution> {
  const result = new Map<string, Attribution>();
  const taken = new Set<string>();
  for (const part of parts) {
    const claimed = part.continues ? openItems.find((item) => item.ref === part.continues!.ref) : undefined;
    if (claimed && claimed.kind === part.continues!.kind && !taken.has(claimed.ref)) {
      taken.add(claimed.ref);
      result.set(part.localId, { fallback: false, item: claimed, kind: claimed.kind as ContinueKind });
    } else {
      result.set(part.localId, { kind: "new" });
    }
  }
  const justAsked = openItems.filter((item) => item.kind === "clarification" && item.unrelatedMessages === 0 && !taken.has(item.ref));
  const unreadable = parts.filter((part) => part.clarity === "none" && result.get(part.localId)?.kind === "new");
  const anyContinued = taken.size > 0;
  if (!anyContinued && justAsked.length === 1 && unreadable.length === 1) {
    result.set(unreadable[0].localId, { fallback: true, item: justAsked[0], kind: "clarification" });
  }
  // AG10 (AE-FN-005): right after "按什么来挑", a bare reply with nothing of its own to do ("随便，都行", "按开始时间") answers it.
  const bare = parts.filter((part) => (part.clarity === "statement" || part.clarity === "none" || part.clarity === "clear") && !(part.capabilities ?? []).some((capability) => /\.(read|create|update|delete|complete|reopen)$|^view\./u.test(capability)) && result.get(part.localId)?.kind === "new");
  // AG21b (R31): so does a bare reply right after "which occasion should the note record" ("工地那次").
  const asksOccasion = (item: SessionOpenItem) => Boolean(item.options?.some((option) => option.type === "interaction"));
  if (!anyContinued && justAsked.length === 1 && (justAsked[0].rank || asksOccasion(justAsked[0])) && bare.length === 1 && parts.length === 1) {
    result.set(bare[0].localId, { fallback: true, item: justAsked[0], kind: "clarification" });
  }
  return result;
}

const LABEL_PARTS = /[（）()·・,，、/\s]+/u;
const GENERIC_LABEL_WORDS = /^(?:株式会社|有限会社|有限公司|公司|集团|inc|ltd|llc|co|corp|company|group)$/iu;

/** The word names this label part: the whole part, or (CJK) its first two or more characters, or a Latin word of it. */
function namesPart(labelPart: string, words: string): boolean {
  if (words.includes(labelPart)) return true;
  if (/^[A-Za-z][A-Za-z0-9&'’-]{2,}$/u.test(labelPart)) return new RegExp(`(?:^|[^A-Za-z])${labelPart.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&")}(?:$|[^A-Za-z])`, "iu").test(words);
  const chars = [...labelPart];
  for (let length = chars.length - 1; length >= 2; length -= 1) if (words.includes(chars.slice(0, length).join(""))) return true;
  return false;
}

/**
 * AG20b (TRIAGE R13, §3.7/§3.10): a typed answer to a question tied back to what was asked — the one offered record whose
 * distinguishing words the answer names ("蒲公英那个。" for 「徐岚（蒲公英童书 · 版权编辑）」; "現場の立ち会いのほう"). Words every
 * option shares (the name asked about) tell nothing apart; two options named, or none: null (code does not guess).
 */
export function optionNamedIn(item: Pick<SessionOpenItem, "options"> | null | undefined, words: string, type?: string): { id: string; type: string; label: string } | null {
  const options = (item?.options ?? []).filter((option) => !type || option.type === type);
  if (options.length < 2 || !words.trim()) return null;
  const partsOf = (label: string) => label.split(LABEL_PARTS).map((part) => part.trim()).filter((part) => [...part].length >= 2 && !GENERIC_LABEL_WORDS.test(part));
  const named = options.filter((option, index) => {
    const others = options.filter((_, at) => at !== index).map((other) => other.label);
    return partsOf(option.label).some((part) => !others.some((label) => label.includes(part)) && namesPart(part, words));
  });
  return named.length === 1 ? named[0] : null;
}

export type SelectionCheck =
  | { ok: true; clarification: AgentClarificationContract; option: AgentClarificationOptionContract }
  | { ok: false; reason: "CLARIFICATION_NOT_FOUND" | "CLARIFICATION_CLOSED" | "OPTION_NOT_OFFERED" };

/** A click is bound only to an option offered under a set that is still open. */
export function attributeSelection(clarifications: readonly AgentClarificationContract[] | undefined, selection: { clarificationId: string; optionId: string }): SelectionCheck {
  const clarification = (clarifications ?? []).find((item) => item.clarificationId === selection.clarificationId);
  if (!clarification) return { ok: false, reason: "CLARIFICATION_NOT_FOUND" };
  if (clarification.state !== "open") return { ok: false, reason: "CLARIFICATION_CLOSED" };
  const option = clarification.options.find((item) => item.optionId === selection.optionId);
  if (!option) return { ok: false, reason: "OPTION_NOT_OFFERED" };
  return { clarification, ok: true, option };
}
