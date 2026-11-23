/**
 * clarify (code): the questions and clickable directions of a request, and its pause (设计稿 §3.9
 * `clarify`, "暂停与恢复"; agent-design AG04, 易错边界 7).
 *
 * Two passes, by state:
 * - prepare (after route): for each part whose §3.11 step needs them, the directions are built by
 *   optionsFor() — a question (a missing object, or readings that include a write), the directions of
 *   a message nothing could be read out of, or an entry (after a statement, the other readings of a
 *   read-only part, accepting an alternative). The checkpoint keeps ids and codes; the labels go to the
 *   result document through the run.
 * - wait (after deliver left directions open): interrupt(). The thread stays paused until one of three
 *   things resumes it, all decided by code and never by the model: a click (bound to the option it was
 *   offered as; the part is routed again), a later message that answered it, or shelving after two
 *   unrelated messages (the part is closed as it was left). Resuming runs no understand and no model
 *   call; the question is not sent again (deliver writes only the parts the resume touched).
 * A card decision never resumes the graph (§3.9 点击决定不恢复图).
 */
import { interrupt } from "@langchain/langgraph";

import { recordKindOf, type RecordKind } from "../../clarify/default-readings";
import type { NextStep } from "../../clarify/next-step";
import { optionsFor, type ClarifyOption, type OptionObject } from "../../clarify/options";
import type { NamedRecordRef } from "../../context/session-state";
import { conversationNextAsks } from "../../conversation/run";
import { emitTrace } from "../../observability/trace";
import { capabilityKind, type Capability } from "../../route/capabilities";
import type { ReplyLanguage } from "../../route/handoff-copy";
import type { GraphNode, NodeScope } from "../deps";
import type { AgentGraphState, GraphPart, GraphResolution, OptionSetState, PartPlan } from "../state";

export const setIdOf = (requestId: string, partId: string, slot: "q" | "e" | "a") => `${requestId}:${partId}.${slot}`;

/** The clue words of a ref, read back from this turn's message. */
export function clueWords(message: string, ref: GraphPart["refs"][number] | undefined): string | null {
  if (!ref?.quote) return null;
  const words = message.slice(ref.quote[0], ref.quote[1]).trim();
  return words || null;
}

/** The name of a bound record: this turn's context, or a click's option (never the checkpoint). */
export function nameOf(scope: NodeScope, recordId: string | null | undefined): string | null {
  if (!recordId) return null;
  const handle = [...(scope.run.context?.handles.values() ?? [])].find((item) => item.id === recordId);
  return handle?.name || scope.run.names.get(recordId) || scope.run.readNames.get(recordId)?.name || null;
}

export function objectOf(scope: NodeScope, part: GraphPart, parts: readonly GraphPart[] = []): OptionObject {
  const bound = part.refs.find((ref) => ref.recordId);
  const first = bound ?? part.refs[0];
  const referenced = scope.run.context?.references ?? [];
  const kind = recordKindOf(first?.entity) ?? (referenced.length === 1 ? recordKindOf(referenced[0].type) : null);
  const name = bound ? nameOf(scope, bound.recordId) : null;
  const text = clueWords(scope.input.message, first);
  // AG07 repair 2 (AE-XL-011): a person said only by a pronoun ("She") is named by the person it stands for, never
  // by the pronoun; with nobody to stand for, the label goes without a name.
  if (!bound && text && PRONOUN_ONLY.test(text)) return { kind, name: personForPronoun(scope, part, parts), text: null };
  return { kind, name, text };
}

const PRONOUN_ONLY = /^(?:他|她|彼女|彼|あの人|その人|he|she|him|her|his)$/iu;

/** The person a pronoun stands for: one bound in an earlier sentence of this request, else the person mentioned last. */
function personForPronoun(scope: NodeScope, part: GraphPart, parts: readonly GraphPart[]): string | null {
  const earlier = parts.filter((other) => other !== part && other.quote[0] <= part.quote[0]).sort((left, right) => right.quote[0] - left.quote[0]);
  for (const other of earlier) {
    for (const ref of other.refs) {
      if (recordKindOf(ref.entity) !== "contact" || !ref.recordId) continue;
      const name = nameOf(scope, ref.recordId);
      if (name) return name;
    }
  }
  const last = scope.run.context?.lastMentionedForCode.find((item) => recordKindOf(item.type) === "contact" && item.name);
  return last?.name ?? null;
}

/** Pronouns for a person (zh, ja, en). */
const PERSON_PRONOUN = /(他|她|彼女|彼|あの人|その人|\b(he|she|him|her|his)\b)/iu;

function candidatesFor(scope: NodeScope, part: GraphPart): { clue: number; candidates: NamedRecordRef[] } | null {
  // AG05: several people of the name the user said (resolve looked them up in the account).
  const found = scope.run.candidates.get(part.localId);
  if (found?.length) return { candidates: found, clue: Math.max(0, part.refs.findIndex((ref) => ref.entity === "contact")) };
  const context = scope.run.context;
  if (!context) return null;
  const pool: NamedRecordRef[] = [...context.lastMentionedForCode, ...context.shownList.map((item) => ({ id: item.id, name: item.name ?? "", type: item.type }))].filter((item) => item.name);
  const unresolved = part.refs.map((ref, index) => ({ index, ref })).filter(({ ref }) => !ref.recordId);
  for (const { index, ref } of unresolved) {
    const kind = recordKindOf(ref.entity);
    const found = pool.filter((item, at) => recordKindOf(item.type) === kind && pool.findIndex((other) => other.id === item.id) === at);
    if (found.length) return { candidates: found.slice(0, 3), clue: index };
  }
  // AG05: "她的待办" points at a person by a pronoun even when no person clue was given: the people mentioned last.
  const personal = unresolved.find(({ ref }) => PERSON_PRONOUN.test(clueWords(scope.input.message, ref) ?? ""));
  if (personal) {
    const people = pool.filter((item, at) => recordKindOf(item.type) === "contact" && pool.findIndex((other) => other.id === item.id) === at);
    if (people.length) return { candidates: people.slice(0, 3), clue: personal.index };
  }
  return unresolved.length ? { candidates: [], clue: unresolved[0].index } : null;
}

const firstWrite = (capabilities: readonly Capability[]) => capabilities.find((capability) => capabilityKind(capability) === "write");

/** AG08: a reschedule entry names the record by its own words ("给小林发修订报价那条待办" → 给小林发修订报价, route node). */
function entryObject(step: Extract<NextStep, { kind: "respond" }>, object: ReturnType<typeof objectOf>): ReturnType<typeof objectOf> {
  if (step.reviewed?.kind !== "reschedule" || object.name || !step.reviewed.object) return object;
  return { ...object, text: step.reviewed.object };
}

function setOf(scope: NodeScope, language: ReplyLanguage, part: GraphPart, step: NextStep | undefined, parts: readonly GraphPart[] = []): { set: Omit<OptionSetState, "options">; options: ClarifyOption[] } | null {
  const { input, run } = scope;
  const words = { language };
  const object = objectOf(scope, part, parts);
  const subgoal = part.continues?.kind === "clarification" ? part.continues.ref : `clarification:${input.requestId}:${part.localId}`;
  const base = (slot: "q" | "e" | "a", kind: OptionSetState["kind"], purpose: OptionSetState["purpose"], asks?: OptionSetState["asks"]) => ({ clarificationId: setIdOf(input.requestId, part.localId, slot), kind, partId: part.localId, purpose, state: "open" as const, subgoal, ...(asks ? { asks } : {}) });
  if (part.status === "awaiting_acceptance") {
    return { options: optionsFor({ capability: "rule.create", language: words.language, purpose: "alternative" }), set: base("a", "entry", "alternative") };
  }
  switch (step?.kind) {
    case "not_understood":
      return { options: optionsFor({ language: words.language, object, openItems: run.context?.openItems ?? [], pageKind: pageKindOf(scope), purpose: "directions", references: (run.context?.references ?? []).map((item) => ({ id: item.id, name: item.name ?? "", type: item.type })) }), set: base("q", "not_understood", "directions") };
    case "ask_missing": {
      const found = candidatesFor(scope, part);
      return { options: optionsFor({ candidates: found?.candidates ?? [], capability: firstWrite(part.capabilities) ?? part.capabilities[0], language: words.language, purpose: "object" }), set: base("q", "question", "object", "object") };
    }
    case "ask_readings":
      return { options: optionsFor({ language: words.language, object, purpose: "readings", readings: step.readings }), set: base("q", "question", "readings", "reading") };
    case "most_likely": {
      const options = optionsFor({ exclude: step.reading, language: words.language, object, purpose: "other_readings", readings: step.others });
      return options.length ? { options, set: base("e", "entry", "other_readings") } : null;
    }
    case "respond":
      return step.entry ? { options: optionsFor({ capability: step.entry, language: words.language, object: entryObject(step, object), purpose: "entry", ...(step.reviewed ? { entryWording: step.reviewed } : {}) }), set: base("e", "entry", "entry") } : null;
    default:
      return null;
  }
}

export function pageKindOf(scope: NodeScope): RecordKind | null {
  const route = scope.input.pageContext?.route ?? "";
  if (/contact/iu.test(route)) return "contact";
  if (/note|memo/iu.test(route)) return "memo";
  if (/event/iu.test(route)) return "event";
  if (/task|todo/iu.test(route)) return "todo";
  if (/schedule|calendar/iu.test(route)) return "schedule";
  return null;
}

/** Whether a part needs a set of directions it does not have yet. */
export function needsDirections(part: GraphPart, step: NextStep | undefined, sets: readonly OptionSetState[]): boolean {
  if (sets.some((set) => set.partId === part.localId)) return false;
  if (part.status === "awaiting_acceptance") return true;
  if (!step) return false;
  if (step.kind === "respond") return Boolean(step.entry);
  if (step.kind === "most_likely") return step.others.length > 0;
  return step.kind === "not_understood" || step.kind === "ask_missing" || step.kind === "ask_readings";
}

function prepare(scope: NodeScope, state: AgentGraphState): Partial<AgentGraphState> {
  const sets = [...state.optionSets];
  // ORBIT_AGENT_CONVERSATION_NEXT=on (add-only): a part the agent would answer and the engine asks about is asked as
  // the agent asks for a missing object (the same step, options and pause as resolve's).
  const asked = conversationNextAsks(scope, state);
  const parts: GraphPart[] = asked.length ? state.parts.map((part) => (asked.includes(part.localId) ? { ...part, route: "clarify", status: "awaiting_clarification", step: "ask_missing", waitReason: "object_ambiguous" } : part)) : state.parts;
  for (const id of asked) scope.run.steps.set(id, { kind: "ask_missing" });
  for (const part of parts) {
    if (state.touched && !state.touched.includes(part.localId)) continue;
    const step = scope.run.steps.get(part.localId);
    if (!needsDirections(part, step, sets)) continue;
    const made = setOf(scope, state.language, part, step, parts);
    if (!made || !made.options.length && made.set.kind !== "question") continue;
    const labels = new Map(made.options.map((option) => [option.optionId, { label: option.label, ...(option.ref ? { refName: option.ref.name } : {}) }]));
    scope.run.optionLabels.set(made.set.clarificationId, labels);
    sets.push({ ...made.set, options: made.options.map((option) => ({ capabilities: option.capabilities, capability: option.capability, optionId: option.optionId, ...(option.ref ? { refId: option.ref.id, refType: option.ref.type } : {}) })) });
    if (made.set.kind !== "entry") emitTrace({ clarificationId: made.set.clarificationId, kind: made.set.kind, options: made.options.length, partId: part.localId, subgoal: made.set.subgoal, type: "clarify.asked" });
    else emitTrace({ clarificationId: made.set.clarificationId, options: made.options.length, partId: part.localId, purpose: made.set.purpose, type: "clarify.entry_offered" });
  }
  return { optionSets: sets, ...(asked.length ? { parts } : {}) };
}

const writes = (capabilities: readonly Capability[]) => capabilities.some((capability) => capabilityKind(capability) === "write");

function planFor(capabilities: Capability[], from: PartPlan): PartPlan {
  return {
    ...from,
    acceptedLeadsTo: null,
    clarity: "clear",
    dataSources: capabilities.some((capability) => ["read", "function"].includes(capabilityKind(capability))) ? ["orbit_records"] : capabilities.some((capability) => capabilityKind(capability) === "web") ? ["public_web"] : [],
    deliverable: writes(capabilities) ? "change" : from.deliverable === "change" ? "answer" : from.deliverable,
    hypothesis: false,
    intentBasis: "selection",
    negation: false,
    readings: [],
  };
}

/** Applies a resolution to the paused state (pure: the same resolution gives the same state). */
export function applyResolution(state: AgentGraphState, resolution: GraphResolution, requestId: string): Partial<AgentGraphState> {
  const sets = state.optionSets.map((set) => ({ ...set, options: [...set.options] }));
  const set = sets.find((item) => item.clarificationId === resolution.clarificationId);
  if (!set) return { pausing: false, resumeNext: "deliver", touched: [] };
  const parts = state.parts.map((part) => ({ ...part, plan: { ...part.plan }, refs: part.refs.map((ref) => ({ ...ref })) }));
  const index = parts.findIndex((part) => part.localId === set.partId);
  const part = parts[index];
  if (resolution.kind === "shelve") {
    set.state = "shelved";
    if (part && part.status === "awaiting_clarification") {
      part.status = "unfinished";
      part.reason = "shelved";
    }
    return { optionSets: sets, parts, pausing: false, resumeNext: "deliver", touched: [] };
  }
  if (resolution.kind === "continued") {
    set.state = "answered";
    set.answeredBy = resolution.requestId;
    if (part) {
      part.status = resolution.status;
      part.reason = resolution.reason ?? null;
      part.waitReason = null;
      if (resolution.route) part.route = resolution.route;
    }
    return { optionSets: sets, parts, pausing: false, resumeNext: "deliver", touched: [] };
  }
  const option = set.options.find((item) => item.optionId === resolution.optionId);
  if (!option || set.state !== "open" || !part) return { pausing: false, resumeNext: "deliver", touched: [] };
  set.state = "answered";
  set.selectedOptionId = option.optionId;
  const bindRef = (target: GraphPart) => {
    if (!option.refId) return;
    const kind = recordKindOf(option.refType);
    const at = target.refs.findIndex((ref) => !ref.recordId && recordKindOf(ref.entity) === kind);
    const free = at >= 0 ? at : target.refs.findIndex((ref) => !ref.recordId);
    if (free >= 0) target.refs[free].recordId = option.refId;
    else target.refs.push({ entity: option.refType ?? "contact", quote: null, recordId: option.refId });
  };
  // AG06: the write parts of the request go on with any answer — those that shared this question get the
  // person picked, the ones that waited for it are frozen onto the one card with the rest.
  const writeParts = parts.filter((item) => item !== part && item.route === "propose_write" && item.write);
  const pickFor = (target: GraphPart, type: string | undefined, id: string) => {
    if (!target.write) return;
    target.write = { ...target.write, picks: { ...target.write.picks, ...(type === "contact" ? { contact: id } : type === "todo" ? { todo: id } : type === "field" && (id === "plannedDate" || id === "dueAt") ? { field: id } : type === "duplicate" || type === "memo" ? { duplicate: id } : type === "event" ? { event: id } : type === "event_plan" ? { eventPlan: id } : {}) } };
  };
  if (set.purpose === "operation") {
    if (option.refId) pickFor(part, option.refType, option.refId);
    if (option.refType === "contact" && option.refId) for (const other of writeParts) if (other.write?.waitsFor === part.localId) pickFor(other, "contact", option.refId);
    return { optionSets: sets, parts, pausing: false, resumeNext: "route", touched: [part.localId, ...writeParts.map((item) => item.localId)] };
  }
  // AG09: a web click — the search result picked among same-named objects, or the shown query sent or not. The part is
  // routed again and the web step goes on from the search it made (no new search), under the same request's budget.
  if (set.purpose === "web_pick" || set.purpose === "web_send") {
    const web = set.purpose === "web_pick" ? { pick: Number(option.optionId) - 1 } : option.optionId === "send_query" ? { confirmed: true } : { skipped: true };
    part.web = { ...(part.web ?? {}), ...web };
    part.waitReason = null;
    // Parts that looked up the same name went with this part's search: the pick answers them too (probe.ts).
    const sharing = set.purpose === "web_pick" && part.web.searchKey ? parts.filter((other) => other !== part && other.web?.searchKey === part.web!.searchKey) : [];
    for (const other of sharing) {
      other.web = { ...(other.web ?? {}), ...web };
      other.waitReason = null;
    }
    return { optionSets: sets, parts, pausing: false, resumeNext: "route", touched: [part.localId, ...sharing.map((other) => other.localId)] };
  }
  if (set.purpose === "object") {
    bindRef(part);
    part.plan.clarity = "clear";
    if (option.refType === "contact" && option.refId) for (const other of writeParts) if (other.write?.waitsFor === part.localId) pickFor(other, "contact", option.refId);
    return { optionSets: sets, parts, pausing: false, resumeNext: "route", touched: [part.localId, ...writeParts.map((item) => item.localId)] };
  }
  if (set.purpose === "alternative") {
    part.plan.acceptedLeadsTo = option.capability;
    part.continues = { kind: "alternative", ref: `alternative:${requestId}:${part.localId}` };
    return { optionSets: sets, parts, pausing: false, resumeNext: "route", touched: [part.localId] };
  }
  // AG21b (R31): the occasion a note records, picked: the part goes on to its card (functions node reads the pick).
  if (set.purpose === "interaction") {
    part.status = "unfinished";
    part.reason = "proposing";
    part.waitReason = null;
    part.route = "propose_write";
    delete part.write;
    delete part.reads;
    delete part.gaps;
    return { optionSets: sets, parts, pausing: false, resumeNext: "route", touched: [part.localId] };
  }
  // AG10: a way of ordering picked for a ranking with no basis: the part goes on to rank by it (functions node reads the pick).
  if (set.purpose === "ranking") {
    part.status = "answered";
    part.reason = null;
    part.waitReason = null;
    return { optionSets: sets, parts, pausing: false, resumeNext: "route", touched: [part.localId] };
  }
  if (set.purpose === "readings" || set.purpose === "directions") {
    part.capabilities = [...option.capabilities];
    part.plan = planFor(option.capabilities, part.plan);
    bindRef(part);
    return { optionSets: sets, parts, pausing: false, resumeNext: "route", touched: [part.localId] };
  }
  // An entry (after a statement, another reading): a new part the user asked for by clicking (§3.11 用户点了才算提出).
  const taken = new Set(parts.map((item) => item.localId));
  let n = 1;
  while (taken.has(`${part.localId}s${n}`)) n += 1;
  const created: GraphPart = {
    ...part,
    asked: 0,
    capabilities: [...option.capabilities],
    continues: null,
    dependsOn: [],
    localId: `${part.localId}s${n}`,
    origin: part.localId,
    plan: planFor(option.capabilities, part.plan),
    reading: null,
    reason: null,
    refs: part.refs.map((ref) => ({ ...ref })),
    route: null,
    status: "unfinished",
    step: null,
    verdict: null,
    waitReason: null,
  };
  bindRef(created);
  parts.splice(index + 1, 0, created);
  return { optionSets: sets, parts, pausing: false, resumeNext: "route", touched: [created.localId] };
}

export function clarifyNode(scope: NodeScope): GraphNode {
  return async (state: AgentGraphState) => {
    if (!state.pausing) return prepare(scope, state);
    const open = state.optionSets.filter((set) => set.state === "open").map((set) => set.clarificationId);
    // Only ids go into the interrupt (and, on resume, the resolution): the checkpoint holds no words.
    const resolution = interrupt({ open }) as GraphResolution;
    emitTrace({ clarificationId: resolution.clarificationId, kind: resolution.kind, ...(resolution.kind === "select" ? { optionId: resolution.optionId } : {}), type: "clarify.resumed" });
    return applyResolution(state, resolution, scope.input.requestId);
  };
}
