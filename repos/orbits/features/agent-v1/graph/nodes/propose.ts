/**
 * propose (main model once, then code): the second layer (设计稿 §3.2, 附录 C `OperationIntent`; agent-design
 * AG06). For the parts route sent to `propose_write`:
 *
 * 1. Writes this version does not do in the conversation get code's plain sentence (no card is mentioned).
 * 2. One model call (one repair, inside the round's four) turns the parts into operation intents. Approval
 *    flags and account ids in its output are stripped before anything else (AE-BND-002); the intents are
 *    kept as codes and offsets into the message, so a resume needs no model call.
 * 3. resolveIntents() (propose/resolve.ts) finds the people and to-dos in the account, works out the dates
 *    and builds the changes; it may need a question first (which person, which to-do, which date field).
 * 4. Freezing: when every write part of the request is settled and no question is open, the ready items
 *    become one card (freezeCard through the ledger), in the order the user said them; an item the user
 *    made wait for the one before carries dependsOn. The card's text is code's (card-operations.ts) and the
 *    turn's card line is written from the frozen preview only (propose/copy.ts).
 */
import { capabilityKind, type Capability } from "../../route/capabilities";
import { emitTrace } from "../../observability/trace";
import { callMainModel } from "../../models/main";
import { formatWhen } from "../../answer/materials";
import { handoffWords, type ReplyLanguage } from "../../route/handoff-copy";
import { cardLineOf, WRITE_WORDS } from "../../propose/copy";
import { proposeRepairText, proposeSystemPrompt, proposeUserText, PROPOSE_PROMPT_VERSION } from "../../propose/prompt";
import { resolvePartIntents, waitsForPrevious, type PartWrite, type WriteOutcome, type WriteQuestion } from "../../propose/resolve";
import { checkProposeOutput, PROPOSED_CAPABILITIES } from "../../propose/validate";
import type { CardOperationIntent } from "../../../agent/runtime/card-operations";
import type { GraphNode, NodeScope } from "../deps";
import type { AgentGraphState, GraphPart, OptionSetState } from "../state";
import { nameOf as boundName, setIdOf } from "./clarify";

const writesOf = (part: GraphPart) => part.capabilities.filter((capability) => capabilityKind(capability) === "write");
const supported = (capability: Capability) => (PROPOSED_CAPABILITIES as readonly string[]).includes(capability);

/** Parts this pass proposes for. */
export function proposeDue(state: AgentGraphState): boolean {
  return state.parts.some((part) => part.route === "propose_write" && part.reason === "proposing" && (state.touched === null || state.touched.includes(part.localId)));
}

function notUnderstood(language: ReplyLanguage, quote: string): string {
  if (language === "zh") return `「${quote}」我没看出要怎么改，所以这次没有改。`;
  if (language === "ja") return `「${quote}」をどう変更すればよいか分からなかったため、今回は何も変更していません。`;
  return `I couldn't tell what to change in "${quote}", so nothing was changed.`;
}

function questionSet(scope: NodeScope, state: AgentGraphState, part: GraphPart, question: WriteQuestion): { set: OptionSetState; labels: Map<string, { label: string; refName?: string }>; line: string } {
  const language = state.language;
  const quote = scope.input.message.slice(part.quote[0], part.quote[1]);
  const capability = (writesOf(part)[0] ?? "todo.update") as Capability;
  const existing = state.optionSets.filter((set) => set.partId === part.localId && set.purpose === "operation").length;
  const clarificationId = `${setIdOf(scope.input.requestId, part.localId, "q")}${existing ? existing + 1 : ""}`;
  const labels = new Map<string, { label: string; refName?: string }>();
  const options: OptionSetState["options"] = [];
  if (question.type === "field") {
    for (const option of question.options) {
      labels.set(option.field, { label: WRITE_WORDS.fieldLabel(language, option.field, option.current) });
      options.push({ capabilities: ["todo.update"], capability: "todo.update", optionId: option.field, refId: option.field, refType: "field" });
    }
  } else {
    question.candidates.forEach((candidate, index) => {
      const label = question.type === "todo"
        ? WRITE_WORDS.todoLabel(language, candidate.name, candidate.detail ?? null)
        : candidate.detail ? (language === "en" ? `${candidate.name} (${candidate.detail})` : `${candidate.name}（${candidate.detail}）`) : candidate.name;
      labels.set(`o${index + 1}`, { label, refName: candidate.name });
      options.push({ capabilities: [capability], capability, optionId: `o${index + 1}`, refId: candidate.id, refType: question.type });
    });
  }
  const shown = [...labels.values()].map((item) => item.label);
  const line = question.type === "field" ? WRITE_WORDS.askField(language, quote, shown) : question.type === "todo" ? WRITE_WORDS.askTodo(language, quote, shown) : WRITE_WORDS.askPerson(language, quote, question.clue, shown);
  return {
    labels,
    line,
    set: { asks: question.type === "field" ? "reading" : "object", clarificationId, kind: "question", options, partId: part.localId, purpose: "operation", state: "open", subgoal: `clarification:${scope.input.requestId}:${part.localId}` },
  };
}

export function proposeNode(scope: NodeScope): GraphNode {
  const { deps, input, run } = scope;
  return async (state: AgentGraphState) => {
    const resume = state.touched !== null;
    const message = input.message;
    const language = state.language;
    const parts: GraphPart[] = state.parts.map((part) => ({ ...part, ...(part.write ? { write: { ...part.write, picks: { ...part.write.picks } } } : {}) }));
    const due = parts.filter((part) => part.route === "propose_write" && part.reason === "proposing" && (!resume || state.touched!.includes(part.localId)));
    if (!due.length) return {};
    const quoteOf = (part: GraphPart) => message.slice(part.quote[0], part.quote[1]);
    const settle = (part: GraphPart, status: GraphPart["status"], reason: string | null, line: string | null) => {
      part.status = status;
      part.reason = reason;
      if (line) run.writeLines.set(part.localId, line);
      else run.writeLines.delete(part.localId);
    };
    const words = handoffWords(language);

    // 0. A write that needs the result of another kind of part not done this round waits for it (route skips
    //    write parts when it settles dependencies; items waiting for other items go on the card instead).
    const byId = new Map(parts.map((part) => [part.localId, part]));
    const blockedBy = (part: GraphPart) => part.dependsOn.map((id) => byId.get(id)).find((other) => other && other.route !== "propose_write" && other.status !== "answered");
    // 1. Writes this version does not do in the conversation.
    const work: GraphPart[] = [];
    for (const part of due) {
      const writes = writesOf(part);
      if (blockedBy(part)) {
        settle(part, "waiting_dependency", "dependency_pending", null);
        part.waitReason = "dependency_pending";
        continue;
      }
      if (!writes.some(supported)) {
        // Accepting an offered alternative (a scheduled check) keeps its own sentence (deliver, AG03).
        if (part.continues?.kind === "alternative") {
          settle(part, "unfinished", "not_in_this_version", null);
          continue;
        }
        const names = [...new Set(part.refs.map((ref) => boundName(scope, ref.recordId)).filter((name): name is string => Boolean(name)))];
        settle(part, "unfinished", "not_in_this_version", WRITE_WORDS.unsupported(language, quoteOf(part), words.names(names)));
        emitTrace({ capabilities: writes, partId: part.localId, type: "propose.unsupported" });
      } else work.push(part);
    }

    // 2. The second layer, once (the first pass only; a resume reuses the stored intents).
    const budget = { ...state.budget };
    let repairs = state.repairs;
    const fresh = work.filter((part) => !part.write);
    if (fresh.length) {
      const zone = state.timeZone || "Asia/Tokyo";
      const user = proposeUserText({
        message,
        parts: fresh.map((part) => ({ capabilities: writesOf(part).filter(supported), goal: run.understood?.parts.find((item) => item.localId === part.localId)?.goal ?? quoteOf(part), partId: part.localId, quote: quoteOf(part) })),
        today: `${formatWhen(state.asOf || deps.now(), zone, false)}, ${zone}`,
      });
      const validation = { message, parts: new Map(fresh.map((part) => [part.localId, writesOf(part).filter(supported) as string[]])) };
      emitTrace({ parts: fresh.map((part) => part.localId), promptVersion: PROPOSE_PROMPT_VERSION, type: "propose.prompt" });
      const system = proposeSystemPrompt();
      let result = await callMainModel({ budget, fetchImplementation: deps.fetchImplementation, node: "propose", purpose: "first", requestId: input.requestId, system, user });
      if (result.ok === false && result.reason === "model_error" && result.retryable && repairs < 1) {
        repairs += 1;
        result = await callMainModel({ budget, fetchImplementation: deps.fetchImplementation, node: "propose", purpose: "retry", requestId: input.requestId, system, user });
      }
      let checked = result.ok ? checkProposeOutput(result.text, validation) : null;
      if (result.ok && checked && checked.ok === false && repairs < 1) {
        emitTrace({ errors: checked.errors, purpose: "first", type: "propose.invalid" });
        repairs += 1;
        const repair = await callMainModel({ budget, fetchImplementation: deps.fetchImplementation, node: "propose", purpose: "repair", requestId: input.requestId, system, user: proposeRepairText(user, result.text, checked.errors) });
        checked = repair.ok ? checkProposeOutput(repair.text, validation) : null;
        if (repair.ok === false) result = repair;
      }
      if (!checked || checked.ok === false) {
        if (checked?.ok === false) emitTrace({ errors: checked.errors, purpose: "final", type: "propose.invalid" });
        const outOfBudget = result.ok === false && result.reason === "budget";
        for (const part of fresh) settle(part, "unfinished", outOfBudget ? "budget" : "model_error", outOfBudget ? words.budget(quoteOf(part)) : words.answerFailed(quoteOf(part)));
      } else {
        emitTrace({ intents: [...checked.intents.entries()].map(([partId, list]) => ({ capabilities: list.map((item) => item.capability), partId })), modelDependsOn: Object.fromEntries(checked.modelDependsOn), type: "propose.intents" });
        for (const part of fresh) {
          const intents = checked.intents.get(part.localId) ?? [];
          part.write = { intents, picks: {} };
          if (!intents.length) settle(part, "unfinished", "not_understood", notUnderstood(language, quoteOf(part)));
        }
      }
    }

    // 3. Resolve, in the order the user said them.
    const optionSets = [...state.optionSets];
    const people = parts.flatMap((part) => part.refs.filter((ref) => ref.entity === "contact" && ref.recordId).map((ref) => ({ at: ref.quote?.[0] ?? part.quote[0], id: ref.recordId!, name: boundName(scope, ref.recordId) ?? "" })));
    const asked = new Map<string, string[]>();
    for (const part of parts) {
      const candidates = run.candidates.get(part.localId);
      if (candidates?.length && part.status === "awaiting_clarification") asked.set(part.localId, candidates.map((item) => item.id));
    }
    const ctx = {
      asOf: state.asOf || deps.now(),
      asked,
      context: run.context,
      language,
      message,
      nameOf: (id: string) => boundName(scope, id),
      people,
      records: deps.records,
      scope: deps.records ? deps.records.scope(input.actorId) : null,
      timeZone: state.timeZone || "Asia/Tokyo",
    };
    const outcomes = new Map<string, WriteOutcome>();
    const active = work.filter((part) => part.write && part.status === "unfinished" && part.reason === "proposing").sort((left, right) => left.quote[0] - right.quote[0]);
    for (const part of active) {
      const outcome = await resolvePartIntents(ctx, part, part.write!);
      outcomes.set(part.localId, outcome);
      if (outcome.kind === "ask" && outcome.question.type === "contact") asked.set(part.localId, outcome.question.candidates.map((item) => item.id));
      emitTrace({ kind: outcome.kind, partId: part.localId, ...(outcome.kind === "ask" ? { question: outcome.question.type } : {}), ...(outcome.kind === "stop" ? { reason: outcome.reason } : {}), type: "propose.resolved" });
    }

    // 4. Questions, waits, stops; then one card when nothing is left open.
    const firstAsking = [...outcomes.entries()].find(([, outcome]) => outcome.kind === "ask")?.[0] ?? null;
    for (const part of active) {
      const outcome = outcomes.get(part.localId)!;
      const write = part.write as PartWrite;
      write.waitsFor = null;
      if (outcome.kind === "stop") settle(part, "unfinished", outcome.reason, outcome.line);
      else if (outcome.kind === "ask") {
        const made = questionSet(scope, { ...state, optionSets }, part, outcome.question);
        optionSets.push(made.set);
        run.optionLabels.set(made.set.clarificationId, made.labels);
        settle(part, "awaiting_clarification", null, made.line);
        part.waitReason = "object_ambiguous";
        emitTrace({ clarificationId: made.set.clarificationId, kind: "question", options: made.set.options.length, partId: part.localId, question: outcome.question.type, subgoal: made.set.subgoal, type: "clarify.asked" });
      } else if (outcome.kind === "shares") {
        write.waitsFor = outcome.with;
        settle(part, "waiting_dependency", "shares_question", null);
        part.waitReason = "object_ambiguous";
      }
    }
    const waiting = active.some((part) => part.status === "awaiting_clarification" || part.status === "waiting_dependency");
    const ready = active.filter((part) => outcomes.get(part.localId)?.kind === "ready");
    if (waiting) {
      // One card per request: the items already settled wait for the open question and go on with it.
      for (const part of ready) {
        part.write!.waitsFor = firstAsking ?? active.find((other) => other.write?.waitsFor)?.write?.waitsFor ?? null;
        settle(part, "waiting_dependency", "card_waits", null);
        part.waitReason = "dependency_pending";
      }
      return { budget, optionSets, parts, repairs };
    }
    if (!ready.length) return { budget, optionSets, parts, repairs };
    const intents: CardOperationIntent[] = [];
    const owners: GraphPart[] = [];
    let previous: GraphPart | null = null;
    for (const part of ready) {
      const ops = (outcomes.get(part.localId) as Extract<WriteOutcome, { kind: "ready" }>).ops;
      // The user made this part wait for the part before ("这条记成功了，再…"): code reads it from the words.
      const waits = previous && waitsForPrevious(message, previous.quote[1], part) ? [intents.length - 1] : [];
      ops.forEach((op, index) => {
        const { localId: _local, ...intent } = op;
        intents.push({ ...intent, ...(index === 0 && waits.length ? { dependsOn: waits } : {}) } as CardOperationIntent);
        owners.push(part);
      });
      previous = part;
    }
    const preview = deps.cards ? await deps.cards.freeze({ intents, locale: language, requestId: input.requestId, sessionId: input.sessionId }).catch((error: unknown) => {
      emitTrace({ error: error instanceof Error ? error.message : String(error), type: "error", where: "propose.freeze" });
      return null;
    }) : null;
    if (!preview || !preview.operations.length) {
      for (const part of ready) settle(part, "unfinished", deps.cards ? "target_gone" : "not_in_this_version", deps.cards ? WRITE_WORDS.gone(language, quoteOf(part)) : WRITE_WORDS.unsupported(language, quoteOf(part), ""));
      return { budget, optionSets, parts, repairs };
    }
    for (const part of ready) {
      part.write!.operationIds = preview.operations.filter((op) => op.partId === part.localId).map((op) => op.operationId);
      settle(part, part.write!.operationIds.length ? "awaiting_confirmation" : "unfinished", part.write!.operationIds.length ? null : "target_gone", part.write!.operationIds.length ? null : WRITE_WORDS.gone(language, quoteOf(part)));
      part.waitReason = null;
    }
    run.actionPreview = preview;
    run.cardLine = cardLineOf(preview, language);
    emitTrace({ cardId: preview.actionId, operations: preview.operations.map((op) => ({ capability: op.capability, operationId: op.operationId, partId: op.partId ?? null })), revision: preview.revision, type: "propose.card" });
    return { budget, optionSets, parts, repairs };
  };
}
