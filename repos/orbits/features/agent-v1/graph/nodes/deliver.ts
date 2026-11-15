/**
 * deliver (code): writes each part's result, in the order the user said them, and updates the
 * session state (设计稿 §3.9, §3.10). What code settles itself (an external-agent suggestion, a
 * missing permission, an alternative, a part this version cannot do yet, a part waiting for another,
 * a question, a part left over when the model calls ran out) is a fixed sentence that restates the
 * user's own words and the names of the objects it was bound to.
 *
 * AG04: the questions, directions and entries of §3.11 (clarify/copy.ts), each with the labels code
 * wrote; the result document carries them as `clarifications`. Directions left open pause the thread
 * (clarify waits). After a resume only the parts it touched are written — a question is never sent
 * twice. A part that answered an earlier question, and a question shelved after two unrelated
 * messages, are handed to the executor to write back into that earlier request.
 */
import type { AgentClarificationContract, AgentPartResult } from "../../../../shared/contract/agent-v1";
import { CLARIFY_WORDS, type MissingItem } from "../../clarify/copy";
import { readingLabel, recordKindOf, type Reading } from "../../clarify/default-readings";
import { capabilityLabel } from "../../clarify/options";
import type { AgentSessionState, NamedRecordRef, SessionOpenItem } from "../../context/session-state";
import { emptySessionState } from "../../context/session-state";
import { emitTrace } from "../../observability/trace";
import { capabilityKind } from "../../route/capabilities";
import { handoffWords, notYetText, type ReplyLanguage } from "../../route/handoff-copy";
import type { GraphNode, NodeScope } from "../deps";
import type { AgentGraphState, GraphPart, OptionSetState } from "../state";
import { clueWords, nameOf, objectOf, setIdOf } from "./clarify";

export const OPEN_ITEM_SHELF_AFTER = 2;

function quoteOf(message: string, part: GraphPart): string {
  return message.slice(part.quote[0], part.quote[1]);
}

function boundNames(scope: NodeScope, part: GraphPart): string[] {
  return [...new Set(part.refs.map((ref) => nameOf(scope, ref.recordId)).filter((name): name is string => Boolean(name)))];
}

/** What a periodic check would watch: the event clue's own words; with none, a generic phrase (AE-UND-011). */
function alternativeTopic(scope: NodeScope, part: GraphPart, parts: readonly GraphPart[], language: ReplyLanguage): { topic: string; scope: "events" | "records" } {
  const message = scope.input.message;
  const related = [part, ...parts.filter((other) => other !== part)];
  for (const candidate of related) {
    const clue = candidate.refs.find((ref) => ref.entity === "event" && clueWords(message, ref));
    if (clue) return { scope: "events", topic: clueWords(message, clue)!.replace(/^@/u, "") };
  }
  const events = related.some((candidate) => candidate.capabilities.includes("event.read"));
  return { scope: events ? "events" : "records", topic: CLARIFY_WORDS.alternativeTopic(language, events ? "events" : "records") };
}

/** The labels of a set: written this pass, else what the result document already shows, else code's words again. */
function labelsOf(scope: NodeScope, set: OptionSetState, language: ReplyLanguage): Map<string, { label: string; refName?: string }> {
  const fresh = scope.run.optionLabels.get(set.clarificationId);
  if (fresh) return fresh;
  const shown = scope.run.previousClarifications?.find((item) => item.clarificationId === set.clarificationId);
  const out = new Map<string, { label: string; refName?: string }>();
  for (const option of set.options) {
    const previous = shown?.options.find((item) => item.optionId === option.optionId);
    const name = previous?.ref?.name ?? (option.refId ? scope.run.names.get(option.refId) : undefined);
    out.set(option.optionId, { label: previous?.label ?? name ?? capabilityLabel(option.capability, language, null), ...(name ? { refName: name } : {}) });
  }
  return out;
}

function contractOf(scope: NodeScope, set: OptionSetState, language: ReplyLanguage): AgentClarificationContract {
  const labels = labelsOf(scope, set, language);
  return {
    clarificationId: set.clarificationId,
    kind: set.kind,
    options: set.options.map((option) => {
      const shown = labels.get(option.optionId);
      return { capability: option.capability, label: shown?.label ?? "", optionId: option.optionId, ...(option.refId ? { ref: { id: option.refId, name: shown?.refName ?? shown?.label ?? "", type: option.refType ?? "" } } : {}) };
    }),
    partId: set.partId,
    state: set.state,
    ...(set.asks ? { asks: set.asks } : {}),
    ...(set.selectedOptionId ? { selectedOptionId: set.selectedOptionId } : {}),
    ...(set.answeredBy ? { answeredBy: set.answeredBy } : {}),
  };
}

const setFor = (state: AgentGraphState, part: GraphPart, slot?: "q" | "e" | "a") => state.optionSets.find((set) => set.partId === part.localId && (!slot || set.clarificationId.endsWith(`.${slot}`)));

function optionLabels(scope: NodeScope, set: OptionSetState | undefined, language: ReplyLanguage): string[] {
  if (!set) return [];
  const labels = labelsOf(scope, set, language);
  return set.options.map((option) => labels.get(option.optionId)?.label ?? "").filter(Boolean);
}

function clarifyLine(scope: NodeScope, state: AgentGraphState, part: GraphPart, language: ReplyLanguage): string {
  const words = handoffWords(language);
  const quote = quoteOf(scope.input.message, part);
  const set = setFor(state, part, "q");
  const labels = optionLabels(scope, set, language);
  if (set?.kind === "not_understood") {
    const whole = scope.input.message.trim().replace(/[。.!！?？…]+$/u, "") === quote.replace(/[。.!！?？…]+$/u, "");
    return CLARIFY_WORDS.notUnderstood(language, whole ? null : quote, labels);
  }
  if (set?.asks === "reading" && labels.length) return CLARIFY_WORDS.askReadings(language, quote, labels);
  if (set?.asks === "object") {
    const kinds = new Set(set.options.map((option) => recordKindOf(option.refType)));
    const unresolved = part.refs.find((ref) => !ref.recordId && (!kinds.size || kinds.has(recordKindOf(ref.entity)))) ?? part.refs.find((ref) => !ref.recordId);
    const clue = clueWords(scope.input.message, unresolved);
    if (clue) return words.clarifyObject(quote, clue, labels);
    return CLARIFY_WORDS.askWhich(language, quote, missingOf(part, "object") === "person" ? "person" : "object");
  }
  return words.clarifyNone(quote);
}

/** What a question for this part asks for: a person when the unresolved clue is a contact. */
function missingOf(part: GraphPart, asks: "intent" | "object" | "reading"): MissingItem {
  return asks === "object" && part.refs.some((ref) => !ref.recordId && ref.entity === "contact") ? "person" : asks;
}

const writesIn = (part: GraphPart) => part.capabilities.some((capability) => capabilityKind(capability) === "write");

function stillUnclearLine(scope: NodeScope, part: GraphPart, language: ReplyLanguage): string {
  const item = part.continues ? scope.run.context?.openItems.find((open) => open.ref === part.continues!.ref) : undefined;
  const quote = item?.quote ?? quoteOf(scope.input.message, part);
  const step = scope.run.steps.get(part.localId);
  // A reply to a question is missing what the question asked for, and changes what that part would have changed.
  const missing: MissingItem = item?.asks ?? missingOf(part, step?.kind === "still_unclear" ? step.missing : "intent");
  return CLARIFY_WORDS.stillUnclear(language, quote, missing, item?.writes ?? writesIn(part));
}

function entriesLine(scope: NodeScope, state: AgentGraphState, part: GraphPart, language: ReplyLanguage): string {
  const set = setFor(state, part, "e");
  if (!set || set.state !== "open") return "";
  const labels = optionLabels(scope, set, language);
  return labels.length ? CLARIFY_WORDS.entries(language, labels) : "";
}

function lineFor(scope: NodeScope, state: AgentGraphState, part: GraphPart, language: ReplyLanguage): string {
  const line = partLine(scope, state, part, language);
  // A part that answered an earlier question says which matter it goes on with (the "still missing" line already does).
  const item = part.continues?.kind === "clarification" ? scope.run.context?.openItems.find((open) => open.ref === part.continues!.ref) : undefined;
  if (!item?.quote || !line.trim() || part.reason === "still_unclear" || state.touched !== null) return line;
  return `${CLARIFY_WORDS.continuing(language, item.quote)}\n${line}`;
}

function partLine(scope: NodeScope, state: AgentGraphState, part: GraphPart, language: ReplyLanguage): string {
  const parts = state.parts;
  const words = handoffWords(language);
  const message = scope.input.message;
  const quote = quoteOf(message, part);
  const withEntries = (line: string) => [line, entriesLine(scope, state, part, language)].filter((text) => text.trim()).join("\n");
  switch (part.status) {
    case "answered": {
      if (part.continues?.kind === "alternative") {
        const item = scope.run.context?.openItems.find((open) => open.ref === part.continues!.ref);
        return words.acceptedAlternative((part.plan.acceptedLeadsTo ?? item?.leadsTo) === "rule.create");
      }
      return withEntries(scope.run.answers.get(part.localId) ?? "");
    }
    case "suggested_external":
      return words.external(quote);
    case "declined":
      return words.declined(quote);
    case "awaiting_acceptance": {
      const { scope: where, topic } = alternativeTopic(scope, part, parts, language);
      const accept = optionLabels(scope, setFor(state, part, "a"), language)[0] ?? null;
      return words.alternative(quote, topic, where, accept);
    }
    case "awaiting_clarification":
      return clarifyLine(scope, state, part, language);
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
      if (part.reason === "still_unclear") return stillUnclearLine(scope, part, language);
      if (part.reason === "shelved") return "";
      if (part.continues?.kind === "alternative" && part.route === "propose_write") {
        const item = scope.run.context?.openItems.find((open) => open.ref === part.continues!.ref);
        return words.acceptedAlternative((part.plan.acceptedLeadsTo ?? item?.leadsTo) === "rule.create");
      }
      if (part.reading) {
        // §3.11 row 3: how it was understood comes first, in code's words.
        const object = objectOf(scope, part);
        // A person named only in words is said back by those words; a note or event not read yet stays "this note".
        const said = object.name ?? (object.kind === "contact" ? object.text?.replace(/^@/u, "") ?? null : null);
        const label = readingLabel(part.reading as Reading, language, said, capabilityLabel);
        return withEntries([CLARIFY_WORDS.understoodAs(language, label), notYetText(language, part.route ?? "read", quote, boundNames(scope, part))].join("\n"));
      }
      return notYetText(language, part.route ?? "read", quote, boundNames(scope, part));
  }
}

function summaryOfAlternative(language: ReplyLanguage, topic: string, where: "events" | "records"): string {
  if (language === "en") return `Orbit offered to check ${where === "events" ? "Orbit's event directory" : "the user's Orbit records"} regularly for new ${topic}; waiting for the user to accept`;
  if (language === "ja") return `Orbit から、${where === "events" ? "Orbit のイベント一覧" : "Orbit の記録"}で${topic}を定期的にチェックする方法を提案済み（ユーザーの承諾待ち）`;
  return `Orbit 提议改成定期留意${where === "events" ? " Orbit 活动目录" : "Orbit 里的记录"}中新出现的${topic}（等用户接受）`;
}

function summaryOfQuestion(scope: NodeScope, state: AgentGraphState, part: GraphPart): string {
  const quote = quoteOf(scope.input.message, part);
  const set = setFor(state, part, "q");
  const labels = optionLabels(scope, set, state.language);
  if (set?.kind === "not_understood") return `Orbit could not tell what "${quote}" asks for${labels.length ? `; it offered: ${labels.join(" / ")}` : ""}`;
  if (set?.asks === "reading") return `Orbit asked which of these "${quote}" means: ${labels.join(" / ")}`;
  return `Orbit asked what "${quote}" refers to${labels.length ? ` (${labels.join(" / ")})` : ""}`;
}

function nextSessionState(scope: NodeScope, state: AgentGraphState, previous: AgentSessionState | null): AgentSessionState {
  const { input, run } = scope;
  const now = state.asOf || scope.deps.now();
  const context = run.context;
  const next: AgentSessionState = previous ? structuredClone(previous) : emptySessionState(input.sessionId, now);
  // The record of each kind mentioned last: this turn's @ references and the records parts were bound to.
  const mentioned: NamedRecordRef[] = [];
  for (const reference of context?.references ?? []) if (reference.name) mentioned.push({ at: now, id: reference.id, name: reference.name, type: reference.type });
  for (const part of state.parts) {
    for (const ref of part.refs) {
      const name = nameOf(scope, ref.recordId);
      const handle = [...(context?.handles.values() ?? [])].find((item) => item.id === ref.recordId);
      if (ref.recordId && name) mentioned.push({ at: now, id: ref.recordId, name, type: handle?.type ?? ref.entity });
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
      // AG03 open item 2: the earlier request's part is written back as unfinished (the executor resumes it).
      run.earlier.push({ requestId: item.requestId, resolution: { clarificationId: setIdOf(item.requestId, item.partId, "q"), kind: "shelve" } });
      continue;
    }
    kept.push({ ...item, unrelatedMessages: unrelated });
  }
  for (const part of state.parts) {
    const quote = quoteOf(input.message, part);
    if (part.status === "awaiting_acceptance") {
      const { scope: where, topic } = alternativeTopic(scope, part, state.parts, state.language);
      kept.push({ createdAt: now, kind: "alternative", leadsTo: "rule.create", partId: part.localId, quote, ref: `alternative:${input.requestId}:${part.localId}`, requestId: input.requestId, summary: summaryOfAlternative(state.language, topic, where), unrelatedMessages: 0 });
    } else if (part.status === "awaiting_clarification") {
      const set = setFor(state, part, "q");
      const asks = missingOf(part, set?.kind === "not_understood" || !set ? "intent" : set.asks ?? "object");
      kept.push({ asks, createdAt: now, kind: "clarification", partId: part.localId, quote, ref: `clarification:${input.requestId}:${part.localId}`, requestId: input.requestId, summary: summaryOfQuestion(scope, state, part), unrelatedMessages: 0, writes: writesIn(part) });
    }
  }
  next.openItems = kept;
  next.updatedAt = now;
  return next;
}

/** After a click: the answered directions are no longer open items; the record picked becomes the one mentioned last. */
function sessionStateAfterClick(scope: NodeScope, state: AgentGraphState, previous: AgentSessionState | null): AgentSessionState {
  const { input } = scope;
  const now = state.asOf || scope.deps.now();
  const next: AgentSessionState = previous ? structuredClone(previous) : emptySessionState(input.sessionId, now);
  const closed = new Set(state.optionSets.filter((set) => set.state !== "open").flatMap((set) => [`clarification:${input.requestId}:${set.partId}`, `alternative:${input.requestId}:${set.partId}`]));
  next.openItems = next.openItems.filter((item) => !closed.has(item.ref));
  for (const part of state.parts.filter((item) => state.touched?.includes(item.localId))) {
    for (const ref of part.refs) {
      const name = nameOf(scope, ref.recordId);
      if (ref.recordId && name) next.lastMentioned = [{ at: now, id: ref.recordId, name, type: ref.entity }, ...next.lastMentioned.filter((old) => old.type !== ref.entity)];
    }
  }
  next.updatedAt = now;
  return next;
}

export function deliverNode(scope: NodeScope): GraphNode {
  const { deps, input, run } = scope;
  return async (state: AgentGraphState) => {
    const language = state.language;
    const words = handoffWords(language);
    const resume = state.touched !== null;
    let partResults: AgentPartResult[];
    let text: string;
    if (state.understanding !== "understood") {
      text = state.understanding === "budget" ? words.budgetBeforeUnderstanding : words.notUnderstood;
      partResults = [{ partId: "p1", reason: state.understanding === "invalid" ? "model_output_invalid" : state.understanding, status: state.understanding === "budget" ? "unfinished" : "failed" }];
    } else {
      const ordered = [...state.parts].sort((left, right) => left.quote[0] - right.quote[0] || left.localId.localeCompare(right.localId));
      const written = resume ? ordered.filter((part) => state.touched!.includes(part.localId)) : ordered;
      text = written.map((part) => lineFor(scope, state, part, language)).filter((line) => line.trim()).join("\n\n");
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
    run.clarifications = state.optionSets.map((set) => contractOf(scope, set, language));
    if (!resume) {
      // A part that answered or accepted an earlier open item: that request is written back from here.
      for (const part of state.parts) {
        const item = part.continues ? run.context?.openItems.find((open) => open.ref === part.continues!.ref) : undefined;
        if (!item || (item.kind !== "clarification" && item.kind !== "alternative")) continue;
        run.earlier.push({ requestId: item.requestId, resolution: { clarificationId: setIdOf(item.requestId, item.partId, item.kind === "alternative" ? "a" : "q"), kind: "continued", reason: part.reason, requestId: input.requestId, route: part.route, status: part.status } });
      }
    }
    const requestStatus = partResults.some((part) => part.status === "awaiting_acceptance" || part.status === "awaiting_clarification") ? "waiting_user" : "completed";
    const clicked = resume && (state.touched?.length ?? 0) > 0;
    if (!resume || clicked) {
      try {
        const previous = await deps.sessionState.get(input.actorId, input.sessionId);
        await deps.sessionState.put(input.actorId, clicked ? sessionStateAfterClick(scope, state, previous) : nextSessionState(scope, state, previous));
      } catch (error) {
        emitTrace({ error: error instanceof Error ? error.message : String(error), type: "error", where: "deliver.session_state" });
      }
    }
    const pausing = state.optionSets.some((set) => set.state === "open");
    return { delivered: true, pausing, requestStatus, resumeNext: null, touched: null };
  };
}
