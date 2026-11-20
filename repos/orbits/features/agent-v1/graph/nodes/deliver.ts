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
import type { AgentAnswerNoteItemContract, AgentAnswerRecordContract, AgentClarificationContract, AgentPartGap, AgentPartResult } from "../../../../shared/contract/agent-v1";
import { cardedIn, noteBlock, noteItemOf, recordsBlock, textBlocks, type AnswerBlock } from "../../answer/blocks";
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

/** AG05: §3.11 row 3 — how a read part was understood, in code's words, before its answer. */
function understoodLine(scope: NodeScope, part: GraphPart, language: ReplyLanguage, parts: readonly GraphPart[] = []): string {
  if (!part.reading) return "";
  const object = objectOf(scope, part, parts);
  const said = object.name ?? (object.kind === "contact" ? object.text?.replace(/^@/u, "") ?? null : null);
  return CLARIFY_WORDS.understoodAs(language, readingLabel(part.reading as Reading, language, said, capabilityLabel));
}

/** AG05: a part that read records — how it was understood, the answer, then code's sentences on what was missing. */
function readLine(scope: NodeScope, part: GraphPart, language: ReplyLanguage, withEntries: (line: string) => string, parts: readonly GraphPart[] = []): string {
  // AG10: code's lead (how "整理一下" was taken) comes first.
  const lines = [scope.run.leadLines.get(part.localId) ?? "", understoodLine(scope, part, language, parts), scope.run.answers.get(part.localId) ?? "", ...(scope.run.gapLines.get(part.localId) ?? [])];
  return withEntries(lines.filter((line) => line.trim()).join("\n"));
}

function partLine(scope: NodeScope, state: AgentGraphState, part: GraphPart, language: ReplyLanguage): string {
  const parts = state.parts;
  const words = handoffWords(language);
  const message = scope.input.message;
  const quote = quoteOf(message, part);
  const withEntries = (line: string) => [line, entriesLine(scope, state, part, language)].filter((text) => text.trim()).join("\n");
  // AG09: a web question (same-named results, a query to show before it is sent) is code's line with its options.
  const webQuestion = scope.run.webQuestions.get(part.localId) ?? scope.run.questionLines.get(part.localId);
  if (webQuestion && part.status === "awaiting_clarification") return webQuestion;
  if ((part.route === "read" || part.route === "web_lookup") && (part.status === "answered" || part.status === "unfinished") && part.reason !== "budget" && part.reason !== "still_unclear") return readLine(scope, part, language, withEntries, state.parts);
  // AG06: a write part says only code's words: a question, what was not found or cannot be done here. The
  // card itself is one line for the whole request (after the parts); a part waiting for another's question says nothing.
  if (part.route === "propose_write") {
    // AG10: what an extraction found is said before the card (code's lines).
    const lead = scope.run.leadLines.get(part.localId);
    const line = scope.run.writeLines.get(part.localId);
    if (line || lead) return [lead ?? "", line ?? ""].filter((text) => text.trim()).join("\n");
    if (part.status === "awaiting_confirmation" || (part.status === "waiting_dependency" && (part.reason === "shares_question" || part.reason === "card_waits"))) return "";
  }
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
      // AG09: a web part that shares another part's question about same-named results says nothing until the click.
      if (part.reason === "web_shares_question") return "";
      // run-03 repair 1 (AE-UND-010): the prerequisite that is not done is what it waits for, not the first one listed.
      const prerequisites = parts.filter((other) => part.dependsOn.includes(other.localId));
      const dependency = prerequisites.find((other) => other.status !== "answered") ?? prerequisites[0];
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
        const object = objectOf(scope, part, state.parts);
        // A person named only in words is said back by those words; a note or event not read yet stays "this note".
        const said = object.name ?? (object.kind === "contact" ? object.text?.replace(/^@/u, "") ?? null : null);
        const label = readingLabel(part.reading as Reading, language, said, capabilityLabel);
        return withEntries([CLARIFY_WORDS.understoodAs(language, label), notYetText(language, part.route ?? "read", quote, boundNames(scope, part))].join("\n"));
      }
      return notYetText(language, part.route ?? "read", quote, boundNames(scope, part));
  }
}

/* ── AG19: the answer as blocks ────────────────────────────────────── */

/**
 * AG19-4 (board 4): a part that was not done — refused, failed, left unfinished, waiting for another part, or handed to
 * an external agent — goes into the grey note, apart from the answer. A question (still unclear, a clarification, an
 * alternative to accept) is not "not done": it stays in the answer where the user is asked. A write part that says code's
 * own line about the record (already recorded, not found) stays in the answer too.
 */
export function isNotDone(part: Pick<GraphPart, "status" | "reason" | "route">, hasWriteLine = false): boolean {
  if (part.status === "declined" || part.status === "failed" || part.status === "suggested_external" || part.status === "waiting_dependency") return true;
  if (part.status !== "unfinished") return false;
  if (part.reason === "still_unclear" || part.reason === "shelved") return false;
  return !(part.route === "propose_write" && hasWriteLine);
}

/** The typed ref of a card ("event:attendance:…" for «我去过»), as the citations name it. */
const refOfCard = (card: AgentAnswerRecordContract) => `${card.kind === "attendance" ? "event" : card.kind}:${card.id}`;

/**
 * The blocks of the parts written in this pass, in the order they were said: each part's words (its list as cards when
 * code wrote one), then the records it cites that are on no card yet — full cards under a list, small "mentioned" cards
 * under a discussion — and one note at the end for everything that was not done. A record is on one card only.
 */
function blocksOf(scope: NodeScope, state: AgentGraphState, written: readonly GraphPart[], language: ReplyLanguage): AnswerBlock[] {
  const { run } = scope;
  const blocks: AnswerBlock[] = [];
  const notes: AgentAnswerNoteItemContract[] = [];
  for (const part of written) {
    const line = lineFor(scope, state, part, language);
    if (!line.trim()) continue;
    const quote = quoteOf(scope.input.message, part);
    if (isNotDone(part, run.writeLines.has(part.localId))) {
      // Each sentence of code's is one entry; the first carries the user's words.
      line.split("\n").map((text) => text.trim()).filter(Boolean).forEach((text, index) => notes.push(noteItemOf(text, index === 0 ? quote : null, language)));
      continue;
    }
    const answer = run.answers.get(part.localId) ?? "";
    const own = run.answerBlocks.get(part.localId);
    const at = answer ? line.indexOf(answer) : -1;
    const model = run.modelAnswers.has(part.localId);
    const mine: AnswerBlock[] = at >= 0 && (own || model)
      ? [...textBlocks(line.slice(0, at), language), ...(own ?? textBlocks(answer, language, { conclusion: true })), ...textBlocks(line.slice(at + answer.length), language)]
      : textBlocks(line, language);
    // The records this part cites that no card shows yet (verified by now: a citation that no longer opens was dropped).
    const carded = new Set([...cardedIn(blocks), ...cardedIn(mine)]);
    const cited = (part.cites ?? []).map((ref) => run.recordCards.get(ref)).filter((card): card is AgentAnswerRecordContract => Boolean(card)).filter((card) => !carded.has(`${card.kind}:${card.id}`));
    // Repair round 1: full-size cards are the lists code wrote (a ranking; a list-type read, answer/list-answer.ts) and
    // arrive in `own`. What an answer written by a model cites is "mentioned": small cards under its text.
    // Board 4 (last example): an answer that rests on one record is opened from its basis line ("按你11月10日记的笔记回答 打开 ›").
    const byBasisLine = cited.length === 1 && run.basis?.links.length === 1 && run.basis.links[0].id === cited[0].id;
    const cards = byBasisLine ? null : recordsBlock(cited, language, { size: "mini" });
    blocks.push(...mine, ...(cards ? [cards] : []));
  }
  const note = noteBlock(notes, language);
  if (note) blocks.push(note);
  if (run.cardLine?.trim()) blocks.push({ text: run.cardLine, type: "paragraph" });
  emitTrace({ blocks: blocks.map((block) => (block.type === "records" ? { cards: block.items.map(refOfCard), shown: block.shown, size: block.size ?? "full", type: block.type } : block.type === "note" ? { items: block.items.length, type: block.type } : { type: block.type })), type: "deliver.blocks" });
  return blocks;
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
  // AG10: the one question of a ranking with no basis; any reply about how to pick (or "随便") answers it.
  if (part.plan.rankAsk) return `Orbit asked what to pick "${quote}" by (offered: ${labels.join(" / ")}); a reply naming a standard, or "any / 随便", answers it`;
  if (set?.asks === "reading") return `Orbit asked which of these "${quote}" means: ${labels.join(" / ")}`;
  return `Orbit asked what "${quote}" refers to${labels.length ? ` (${labels.join(" / ")})` : ""}`;
}

const KIND_OF_COLLECTION: Record<string, string> = { contacts: "contact", event_attendance_notes: "attendance", notes: "memo", personal_schedule_items: "schedule", private_events: "event", tasks: "todo" };

/** AG20a R15: the existing records a card changes, by id and the name the card shows ("联系人「李薇」" → 李薇). */
export function cardTargetsOf(preview: { operations: readonly { target?: { collection: string; id: string }; display?: { record: string } }[] } | null, at: string): NamedRecordRef[] {
  const out: NamedRecordRef[] = [];
  for (const op of preview?.operations ?? []) {
    const target = op.target ?? (op as { targetRef?: { collection: string; id: string } }).targetRef;
    const type = target ? KIND_OF_COLLECTION[target.collection] : undefined;
    const name = /[「『“"]([^」』”"]+)[」』”"]/u.exec(op.display?.record ?? "")?.[1]?.trim();
    if (target && type && name && !out.some((item) => item.id === target.id)) out.push({ at, id: target.id, name, type });
  }
  return out;
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
  // AG05: the records the answer cited are the ones mentioned last of their kind; a list answer is the list shown last.
  for (const part of state.parts) {
    for (const ref of part.cites ?? []) {
      const at = ref.indexOf(":");
      const id = ref.slice(at + 1);
      const name = run.readNames.get(id)?.name;
      if (at > 0 && name) mentioned.push({ at: now, id, name, type: ref.slice(0, at) });
    }
    if ((part.cites?.length ?? 0) >= 2 && ["list", "ranked_list", "comparison"].includes(part.plan.deliverable)) {
      next.shownList = { items: part.cites!.map((ref) => ({ id: ref.slice(ref.indexOf(":") + 1), name: run.readNames.get(ref.slice(ref.indexOf(":") + 1))?.name ?? "", type: ref.slice(0, ref.indexOf(":")) })), shownAt: now };
    }
  }
  // AG20a R15 (§3.10, TP-CON-004): a record this turn's card changes is the one just mentioned of its kind ("还是把他恢复吧").
  for (const item of cardTargetsOf(run.actionPreview ?? null, now)) mentioned.push(item);
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
      // AG05: the clue words go with the matter, so a reply that continues it ("他") reads the same person.
      const clues = part.refs.map((ref) => ({ entity: ref.entity, text: clueWords(input.message, ref) ?? "" })).filter((clue) => clue.text);
      kept.push({ asks, createdAt: now, kind: "clarification", partId: part.localId, quote, ref: `clarification:${input.requestId}:${part.localId}`, requestId: input.requestId, summary: summaryOfQuestion(scope, state, part), unrelatedMessages: 0, writes: writesIn(part), ...(clues.length ? { clues } : {}), ...(part.plan.rankAsk ? { rank: { ...part.plan.rankAsk } } : {}) });
    }
  }
  next.openItems = kept;
  // AG20a (decision 2): the profile fields this answer found out of date are what the next turn may update; a turn that
  // found none clears them (only the answer right before counts).
  if (run.staleProfiles.length) next.staleProfiles = run.staleProfiles.map((item) => ({ ...item }));
  else delete next.staleProfiles;
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
    let blocks: AnswerBlock[] = [];
    if (state.understanding !== "understood") {
      text = state.understanding === "budget" ? words.budgetBeforeUnderstanding : words.notUnderstood;
      // AG19-4: nothing was done this round: the note alone.
      const note = noteBlock([noteItemOf(text, null, language)], language);
      blocks = note ? [note] : [];
      partResults = [{ partId: "p1", reason: state.understanding === "invalid" ? "model_output_invalid" : state.understanding, status: state.understanding === "budget" ? "unfinished" : "failed" }];
    } else {
      const ordered = [...state.parts].sort((left, right) => left.quote[0] - right.quote[0] || left.localId.localeCompare(right.localId));
      const written = resume ? ordered.filter((part) => state.touched!.includes(part.localId)) : ordered;
      text = [...written.map((part) => lineFor(scope, state, part, language)), run.cardLine ?? ""].filter((line) => line.trim()).join("\n\n");
      blocks = blocksOf(scope, state, written, language);
      partResults = state.parts.map((part) => ({
        partId: part.localId,
        // AG05: what the read did not give, and how much of it was read.
        ...(part.gaps?.length ? { gaps: part.gaps as AgentPartGap[] } : {}),
        ...(part.coverage?.length ? { coverage: part.coverage.map((item) => ({ complete: item.complete, kind: item.kind, pagesRead: item.pagesRead, seen: item.seen, ...(item.total !== null ? { total: item.total } : {}) })) } : {}),
        // AG06: the card item of a write part.
        ...(part.write?.operationIds?.length && part.status === "awaiting_confirmation" ? { operationId: part.write.operationIds[0] } : {}),
        ...(part.reason ? { reason: part.reason } : {}),
        ...(part.route ? { route: part.route } : {}),
        sourceQuote: quoteOf(input.message, part),
        status: part.status,
        ...(part.verdict ? { verdict: part.verdict } : {}),
        ...(part.waitReason ? { waitReason: part.waitReason } : {}),
      }));
    }
    run.text = text;
    run.blocks = blocks;
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
