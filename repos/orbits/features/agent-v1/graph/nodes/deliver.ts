/**
 * deliver (code): writes each part's result, in the order the user said them, and updates the
 * session state (设计稿 §3.9, §3.10). What code settles itself (an external-agent suggestion, a
 * missing permission, an alternative, a part this version cannot do yet, a part waiting for another,
 * a question, a part left over when the model calls ran out) is a fixed sentence that restates the
 * user's own words and the names of the objects it was bound to.
 */
import type { AgentPartResult } from "../../../../shared/contract/agent-v1";
import type { AgentSessionState, NamedRecordRef, SessionOpenItem } from "../../context/session-state";
import { emptySessionState } from "../../context/session-state";
import { emitTrace } from "../../observability/trace";
import { handoffWords, notYetText, type ReplyLanguage } from "../../route/handoff-copy";
import type { GraphNode, NodeScope } from "../deps";
import type { AgentGraphState, GraphPart } from "../state";

export const OPEN_ITEM_SHELF_AFTER = 2;

function quoteOf(message: string, part: GraphPart): string {
  return message.slice(part.quote[0], part.quote[1]);
}

function boundNames(scope: NodeScope, part: GraphPart): string[] {
  const context = scope.run.context;
  if (!context) return [];
  const byId = new Map([...context.handles.values()].map((handle) => [handle.id, handle.name]));
  return [...new Set(part.refs.map((ref) => (ref.recordId ? byId.get(ref.recordId) ?? null : null)).filter((name): name is string => Boolean(name)))];
}

/** What a periodic check would watch, from the event clue of this or another part (verbatim words). */
function alternativeTopic(scope: NodeScope, part: GraphPart, parts: readonly GraphPart[], language: ReplyLanguage): { topic: string; scope: "events" | "records" } {
  const understood = scope.run.understood;
  const message = scope.input.message;
  const related = [part, ...parts.filter((other) => other !== part)];
  for (const candidate of related) {
    const source = understood?.parts.find((item) => item.localId === candidate.localId);
    const clue = source?.objectClues.find((item) => item.entity === "event" && item.text && message.includes(item.text));
    if (clue) return { scope: "events", topic: clue.text };
  }
  const events = related.some((candidate) => candidate.capabilities.includes("event.read"));
  const fallback = quoteOf(message, related.find((candidate) => candidate !== part && candidate.capabilities.length) ?? part);
  return { scope: events ? "events" : "records", topic: language === "en" ? `items matching "${fallback}"` : language === "ja" ? `「${fallback}」に合うもの` : `与「${fallback}」相符的内容` };
}

function clarifyLine(scope: NodeScope, part: GraphPart, language: ReplyLanguage): string {
  const words = handoffWords(language);
  const quote = quoteOf(scope.input.message, part);
  const source = scope.run.understood?.parts.find((item) => item.localId === part.localId);
  const unresolved = source?.objectClues.find((clue, index) => !part.refs[index]?.recordId);
  if (!unresolved || part.waitReason !== "object_ambiguous") return words.clarifyNone(quote);
  // Only objects the session recorded, the one mentioned last first (§3.10).
  const candidates = (scope.run.context?.lastMentionedForCode ?? []).filter((item) => item.type === unresolved.entity).map((item) => item.name).slice(0, 3);
  return words.clarifyObject(quote, unresolved.text, candidates);
}

function lineFor(scope: NodeScope, part: GraphPart, parts: readonly GraphPart[], language: ReplyLanguage): string {
  const words = handoffWords(language);
  const message = scope.input.message;
  const quote = quoteOf(message, part);
  switch (part.status) {
    case "answered": {
      if (part.continues?.kind === "alternative") {
        const item = scope.run.context?.openItems.find((open) => open.ref === part.continues!.ref);
        return words.acceptedAlternative(item?.leadsTo === "rule.create");
      }
      return scope.run.answers.get(part.localId) ?? "";
    }
    case "suggested_external":
      return words.external(quote);
    case "declined":
      return words.declined(quote);
    case "awaiting_acceptance": {
      const { scope: where, topic } = alternativeTopic(scope, part, parts, language);
      return words.alternative(quote, topic, where);
    }
    case "awaiting_clarification":
      return clarifyLine(scope, part, language);
    case "waiting_dependency": {
      const dependency = parts.find((other) => part.dependsOn.includes(other.localId));
      return words.waiting(quote, dependency ? quoteOf(message, dependency) : "");
    }
    case "awaiting_confirmation":
      // The card of this request is shown by the confirmation boundary.
      return "";
    case "failed":
      return words.answerFailed(quote);
    case "unfinished":
    default:
      if (part.reason === "budget") return words.budget(quote);
      if (part.continues?.kind === "alternative" && part.route === "propose_write") {
        const item = scope.run.context?.openItems.find((open) => open.ref === part.continues!.ref);
        return words.acceptedAlternative(item?.leadsTo === "rule.create");
      }
      return notYetText(language, part.route ?? "read", quote, boundNames(scope, part));
  }
}

function summaryOfAlternative(language: ReplyLanguage, topic: string, where: "events" | "records"): string {
  if (language === "en") return `Orbit offered to check ${where === "events" ? "Orbit's event directory" : "the user's Orbit records"} regularly for new ${topic}; waiting for the user to accept`;
  if (language === "ja") return `Orbit から、${where === "events" ? "Orbit のイベント一覧" : "Orbit の記録"}で${topic}を定期的にチェックする方法を提案済み（ユーザーの承諾待ち）`;
  return `Orbit 提议改成定期留意${where === "events" ? " Orbit 活动目录" : "Orbit 里的记录"}中新出现的${topic}（等用户接受）`;
}

function nextSessionState(scope: NodeScope, state: AgentGraphState, previous: AgentSessionState | null): AgentSessionState {
  const { input, run } = scope;
  const now = state.asOf || scope.deps.now();
  const context = run.context;
  const next: AgentSessionState = previous ? structuredClone(previous) : emptySessionState(input.sessionId, now);
  // The record of each kind mentioned last: this turn's @ references and the records parts were bound to.
  const mentioned: NamedRecordRef[] = [];
  for (const reference of context?.references ?? []) if (reference.name) mentioned.push({ at: now, id: reference.id, name: reference.name, type: reference.type });
  const handlesById = new Map([...(context?.handles.values() ?? [])].map((handle) => [handle.id, handle]));
  for (const part of state.parts) {
    for (const ref of part.refs) {
      const handle = ref.recordId ? handlesById.get(ref.recordId) : undefined;
      if (handle?.name) mentioned.push({ at: now, id: handle.id, name: handle.name, type: handle.type });
    }
  }
  for (const item of mentioned) next.lastMentioned = [item, ...next.lastMentioned.filter((old) => old.type !== item.type)];
  // Open items: continued ones close; the others count one more unrelated message and are shelved after two
  // (or when the session was idle); new alternatives and questions open.
  const continued = new Set(state.parts.map((part) => part.continues?.ref).filter((ref): ref is string => Boolean(ref)));
  const kept: SessionOpenItem[] = [];
  for (const item of next.openItems) {
    if (continued.has(item.ref)) continue;
    const unrelated = item.unrelatedMessages + 1;
    if (item.kind === "clarification" && (unrelated >= OPEN_ITEM_SHELF_AFTER || context?.idle)) {
      emitTrace({ item: { kind: item.kind, ref: item.ref, requestId: item.requestId }, reason: context?.idle ? "session idle" : `${unrelated} unrelated messages`, type: "open_item.shelved" });
      continue;
    }
    kept.push({ ...item, unrelatedMessages: unrelated });
  }
  for (const part of state.parts) {
    if (part.status === "awaiting_acceptance") {
      const { scope: where, topic } = alternativeTopic(scope, part, state.parts, state.language);
      kept.push({ createdAt: now, kind: "alternative", leadsTo: "rule.create", partId: part.localId, ref: `alternative:${input.requestId}:${part.localId}`, requestId: input.requestId, summary: summaryOfAlternative(state.language, topic, where), unrelatedMessages: 0 });
    } else if (part.status === "awaiting_clarification") {
      kept.push({ createdAt: now, kind: "clarification", partId: part.localId, ref: `clarification:${input.requestId}:${part.localId}`, requestId: input.requestId, summary: `Orbit asked what "${quoteOf(input.message, part)}" refers to`, unrelatedMessages: 0 });
    }
  }
  next.openItems = kept;
  next.updatedAt = now;
  return next;
}

export function deliverNode(scope: NodeScope): GraphNode {
  const { deps, input, run } = scope;
  return async (state: AgentGraphState) => {
    const language = state.language;
    const words = handoffWords(language);
    let partResults: AgentPartResult[];
    let text: string;
    if (state.understanding !== "understood") {
      text = state.understanding === "budget" ? words.budgetBeforeUnderstanding : words.notUnderstood;
      partResults = [{ partId: "p1", reason: state.understanding === "invalid" ? "model_output_invalid" : state.understanding, status: state.understanding === "budget" ? "unfinished" : "failed" }];
    } else {
      const ordered = [...state.parts].sort((left, right) => left.quote[0] - right.quote[0]);
      text = ordered.map((part) => lineFor(scope, part, state.parts, language)).filter((line) => line.trim()).join("\n\n");
      partResults = state.parts.map((part) => ({
        partId: part.localId,
        ...(part.reason ? { reason: part.reason } : {}),
        ...(part.route ? { route: part.route } : {}),
        sourceQuote: quoteOf(input.message, part),
        status: part.status,
        ...(part.verdict ? { verdict: part.verdict } : {}),
        ...(part.waitReason ? { waitReason: part.waitReason } : {}),
      }));
    }
    run.text = text;
    run.partResults = partResults;
    const requestStatus = partResults.some((part) => part.status === "awaiting_acceptance" || part.status === "awaiting_clarification") ? "waiting_user" : "completed";
    try {
      const previous = await deps.sessionState.get(input.actorId, input.sessionId);
      await deps.sessionState.put(input.actorId, nextSessionState(scope, state, previous));
    } catch (error) {
      emitTrace({ error: error instanceof Error ? error.message : String(error), type: "error", where: "deliver.session_state" });
    }
    return { delivered: true, requestStatus };
  };
}
