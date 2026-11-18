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
import { contactKindOf, resolvePartIntents, waitsForPrevious, type PartWrite, type WriteOutcome, type WriteQuestion } from "../../propose/resolve";
import { checkProposeOutput, PROPOSED_CAPABILITIES } from "../../propose/validate";
import type { CardOperationIntent } from "../../../agent/runtime/card-operations";
import type { GraphNode, NodeScope } from "../deps";
import type { AgentGraphState, GraphPart, OptionSetState } from "../state";
import { nameOf as boundName, setIdOf } from "./clarify";
import { judgeDuplicate, possibleDuplicates, type DuplicateDecision } from "../../judgment/duplicate";
import { localDay } from "../../views/recent-interaction";
import type { RecordView } from "../../domains/types";
import { duplicateCandidates, nothingToChange, type DuplicateCandidate } from "../../domains/contact/duplicates";
import { CONTACT_WORDS } from "../../domains/contact/copy";

const DAY_OF = (view: RecordView, timeZone: string) => {
  const fields = view.fields as { interaction?: { occurredOn?: string }; createdAt?: string };
  return fields.interaction?.occurredOn ?? (fields.createdAt ? localDay(fields.createdAt, timeZone) : "");
};

const shortDay = (day: string, language: ReplyLanguage) => {
  const [, month, date] = day.split("-").map(Number);
  if (!month) return day;
  return language === "en" ? `${["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][month - 1]} ${date}` : `${month}月${date}日`;
};

/**
 * AG08 (§3.8 重复判断, AG08-3): the user's choice when a new memo may be one already recorded — the existing memo
 * ("是同一次") or "不是同一次，仍然新增" — as a question (not sure) or an entry (sure it is the same). Never merged.
 */
function duplicateSet(scope: NodeScope, state: AgentGraphState, part: GraphPart, decision: Exclude<DuplicateDecision, { kind: "new" }>): { set: OptionSetState; labels: Map<string, { label: string; refName?: string }>; line: string } {
  const language = state.language;
  const zone = state.timeZone || "Asia/Tokyo";
  const quote = scope.input.message.slice(part.quote[0], part.quote[1]).replace(/^(?:记一下|记下|メモ|Note)[：:\s]*/iu, "").replace(/[。.!！]+$/u, "");
  const existing = decision.kind === "same" ? [decision.existing] : decision.existing;
  const labels = new Map<string, { label: string; refName?: string }>();
  const options: OptionSetState["options"] = [];
  const snippet = (view: RecordView) => String((view.fields as { body?: string }).body ?? "").slice(0, 40).replace(/[。.!！]+$/u, "");
  existing.forEach((view, index) => {
    const day = shortDay(DAY_OF(view, zone), language);
    labels.set(`o${index + 1}`, { label: language === "zh" ? `是同一次（${day}的笔记）` : language === "ja" ? `同じ件です（${day}のメモ）` : `Same occasion (note of ${day})`, refName: snippet(view) });
    options.push({ capabilities: ["memo.create"], capability: "memo.create", optionId: `o${index + 1}`, refId: view.id, refType: "memo" });
  });
  const fresh = `o${existing.length + 1}`;
  labels.set(fresh, { label: language === "zh" ? "不是同一次，仍然新增" : language === "ja" ? "別の件なので、新しく記録する" : "Not the same, add it anyway" });
  options.push({ capabilities: ["memo.create"], capability: "memo.create", optionId: fresh, refId: "new", refType: "duplicate" });
  const first = existing[0];
  const day = shortDay(DAY_OF(first, zone), language);
  const line = decision.kind === "same"
    ? (language === "zh" ? `你${day}已经记过一条：「${snippet(first)}」。看起来是同一次，所以这次没有另外新增；如果不是同一次，可以点「不是同一次，仍然新增」。` : language === "ja" ? `${day}にすでに「${snippet(first)}」と記録されています。同じ件のようなので、今回は新しく記録していません。別の件なら「別の件なので、新しく記録する」を押してください。` : `You already noted on ${day}: "${snippet(first)}". It looks like the same occasion, so nothing new was added; if it is not, tap "Not the same, add it anyway".`)
    : (language === "zh" ? `你${day}已经记过一条：「${snippet(first)}」。这次的「${quote}」和它是同一次吗？` : language === "ja" ? `${day}にすでに「${snippet(first)}」と記録されています。今回の「${quote}」は同じ件ですか？` : `You already noted on ${day}: "${snippet(first)}". Is "${quote}" the same occasion?`);
  const existingSets = state.optionSets.filter((set) => set.partId === part.localId && set.purpose === "operation").length;
  const clarificationId = `${setIdOf(scope.input.requestId, part.localId, decision.kind === "same" ? "e" : "q")}${existingSets ? existingSets + 1 : ""}`;
  return {
    labels,
    line,
    set: { ...(decision.kind === "same" ? {} : { asks: "reading" as const }), clarificationId, kind: decision.kind === "same" ? "entry" : "question", options, partId: part.localId, purpose: "operation", state: "open", subgoal: `clarification:${scope.input.requestId}:${part.localId}` },
  };
}

/**
 * AG12-1 (设计稿 §3.2, §3.8; PLANNER 易错边界 1): a new contact that may be one already in the account is a question
 * before any card — the possible ones (name, company, role; no contact methods) and "都不是，另建一位". Never merged,
 * never decided for the user.
 */
function contactDuplicateSet(scope: NodeScope, state: AgentGraphState, part: GraphPart, name: string, candidates: readonly DuplicateCandidate[]): { set: OptionSetState; labels: Map<string, { label: string; refName?: string }>; line: string } {
  const language = state.language;
  const labels = new Map<string, { label: string; refName?: string }>();
  const options: OptionSetState["options"] = [];
  candidates.forEach((candidate, index) => {
    labels.set(`o${index + 1}`, { label: CONTACT_WORDS.candidateLabel(language, candidate.name, candidate.organization, candidate.role), refName: candidate.name });
    options.push({ capabilities: ["contact.create"], capability: "contact.create", optionId: `o${index + 1}`, refId: candidate.id, refType: "contact" });
  });
  labels.set("create_new", { label: CONTACT_WORDS.createNew(language) });
  options.push({ capabilities: ["contact.create"], capability: "contact.create", optionId: "create_new", refId: "new", refType: "duplicate" });
  const existing = state.optionSets.filter((set) => set.partId === part.localId && set.purpose === "operation").length;
  const clarificationId = `${setIdOf(scope.input.requestId, part.localId, "q")}${existing ? existing + 1 : ""}`;
  return {
    labels,
    line: CONTACT_WORDS.askDuplicate(language, name, candidates.map((candidate) => CONTACT_WORDS.candidateLabel(language, candidate.name, candidate.organization, candidate.role))),
    set: { asks: "object", clarificationId, kind: "question", options, partId: part.localId, purpose: "operation", state: "open", subgoal: `clarification:${scope.input.requestId}:${part.localId}` },
  };
}

const writesOf = (part: GraphPart) => part.capabilities.filter((capability) => capabilityKind(capability) === "write");
const supported = (capability: Capability) => (PROPOSED_CAPABILITIES as readonly string[]).includes(capability);

/** "记下…来过电话", "log that Emily called me", "電話があったことを記録": words that ask to record a contact that happened. */
const RECORD_WORDS = /(记|記録|記入|メモ|写下|存一下|\blog\b|\bnote\b|\brecord\b|\bjot\b)/iu;

/**
 * stab1 (AE-XL-011): the operations a write part may become. Which record kind a write is, is the second
 * layer's call (设计稿 §3.2); a part that asks to record a contact that happened (code reads it from the words)
 * may become memo.create even when the first layer named another write (attendance.create, contact.update).
 */
export function proposableOf(part: GraphPart, quote: string): string[] {
  const named = writesOf(part).filter(supported) as string[];
  if (!writesOf(part).length) return named;
  const out = [...named];
  if (!out.includes("memo.create") && contactKindOf(quote).channel && RECORD_WORDS.test(quote)) out.push("memo.create");
  // AG06 repair 1 (AE-CTX-005): "山本さんとの食事のToDo、11月20日に予定を入れて" — a to-do word and no time of day is a
  // to-do's date, not a schedule entry. A write this version cannot do never swallows one it can.
  if (TODO_WORD.test(quote) && !TIME_OF_DAY.test(quote) && writesOf(part).some((capability) => capability.startsWith("schedule."))) {
    for (const capability of ["todo.update", "todo.create"]) if (!out.includes(capability)) out.push(capability);
  }
  return out;
}

const TODO_WORD = /(待办|提醒|ToDo|TODO|タスク|\bto-?dos?\b|\btasks?\b)/iu;
const TIME_OF_DAY = /(\d{1,2}\s*[:：]\s*\d{2}|\d{1,2}\s*(?:時|时|点)|\b\d{1,2}\s*(?:am|pm)\b|上午|下午|晚上|中午|午前|午後|夕方|\bmorning\b|\bafternoon\b|\bevening\b)/iu;

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
  // The option leads to what the second layer proposes for this part (a to-do question to todo.update), never to
  // a capability this version cannot do (AE-CTX-005: schedule.create).
  const proposable = proposableOf(part, quote);
  const capability = (question.type === "contact" ? proposable.find((item) => item === "memo.create") ?? proposable[0] : "todo.update") as Capability ?? "todo.update";
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
  const line = question.type === "field" ? WRITE_WORDS.askField(language, quote, shown) : question.type === "todo" ? (question.notFound !== undefined ? WRITE_WORDS.askTodoNotFound(language, quote, question.notFound, shown) : WRITE_WORDS.askTodo(language, quote, shown)) : WRITE_WORDS.askPerson(language, quote, question.clue, shown);
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
    // A prerequisite waiting for the user's answer to a question does not block: the card waits for that answer
    // anyway (below), and the click resumes every write part (AE-XL-002).
    const blockedBy = (part: GraphPart) => part.dependsOn.map((id) => byId.get(id)).find((other) => other && other.route !== "propose_write" && other.status !== "answered" && other.status !== "awaiting_clarification");
    // 1. Writes this version does not do in the conversation.
    const work: GraphPart[] = [];
    for (const part of due) {
      const writes = writesOf(part);
      if (blockedBy(part)) {
        settle(part, "waiting_dependency", "dependency_pending", null);
        part.waitReason = "dependency_pending";
        continue;
      }
      // AG10: an extraction already made this part's operations (functions node); they are frozen as they are.
      if (run.presetIntents.has(part.localId)) {
        work.push(part);
        continue;
      }
      if (!proposableOf(part, quoteOf(part)).length) {
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
        parts: fresh.map((part) => ({ capabilities: proposableOf(part, quoteOf(part)), goal: run.understood?.parts.find((item) => item.localId === part.localId)?.goal ?? quoteOf(part), partId: part.localId, quote: quoteOf(part) })),
        today: `${formatWhen(state.asOf || deps.now(), zone, false)}, ${zone}`,
      });
      const validation = { message, parts: new Map(fresh.map((part) => [part.localId, proposableOf(part, quoteOf(part))])) };
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
    const duplicates = new Map<string, Exclude<DuplicateDecision, { kind: "new" }>>();
    const contactDuplicates = new Map<string, { name: string; candidates: DuplicateCandidate[] }>();
    const active = work.filter((part) => part.write && part.status === "unfinished" && part.reason === "proposing").sort((left, right) => left.quote[0] - right.quote[0]);
    for (const part of active) {
      const preset = run.presetIntents.get(part.localId);
      const outcome: WriteOutcome = preset ? { kind: "ready", ops: preset } : await resolvePartIntents(ctx, part, part.write!);
      outcomes.set(part.localId, outcome);
      // AG08: a new memo of an interaction that may be one already recorded is checked before it goes on a card.
      if (outcome.kind === "ready" && deps.records && ctx.scope && !part.write!.picks.duplicate) {
        for (const op of outcome.ops) {
          const set = (op as { set?: unknown }).set as { body?: string; contactIds?: string[]; interaction?: { actualContactIds: string[]; channel: string; occurredOn: string } } | undefined;
          if (op.capability !== "memo.create" || !set?.interaction) continue;
          const entry = { body: String(set.body ?? ""), contactIds: set.contactIds ?? [], interaction: set.interaction };
          const existing = await possibleDuplicates(deps.records, ctx.scope, entry, ctx.timeZone).catch((error: unknown) => {
            emitTrace({ error: error instanceof Error ? error.message : String(error), partId: part.localId, type: "read.error", where: "propose.duplicates" });
            return [];
          });
          if (!existing.length) continue;
          const decision = await judgeDuplicate(deps.judgment, run.judgment, { entry, existing, language, requestId: input.requestId });
          if (decision.kind !== "new") duplicates.set(part.localId, decision);
          break;
        }
      } else if (outcome.kind === "ready" && part.write!.picks.duplicate && part.write!.picks.duplicate !== "new") {
        // The user said it is the same occasion: nothing is added (the existing memo stays as it is).
        duplicates.delete(part.localId);
        outcomes.set(part.localId, { kind: "stop", line: language === "zh" ? "好的，当作同一次，没有另外新增。" : language === "ja" ? "同じ件として扱い、新しくは記録していません。" : "Got it — the same occasion, so nothing new was added.", reason: "already_recorded" });
      }
      // AG12-1: a new contact is checked against the account's contacts first (code rules, no model).
      const newContact = outcome.kind === "ready" ? outcome.ops.find((op) => op.capability === "contact.create") as { set: { displayName: string; organization?: string; role?: string; email?: string; phone?: string } } | undefined : undefined;
      if (newContact && part.write!.picks.duplicate !== "new") {
        const picked = part.write!.picks.contact;
        const access = deps.records?.contacts;
        if (picked && access && ctx.scope) {
          // The user said it is one of them: nothing is added and nothing merged.
          const existing = await access.read(ctx.scope.accountId, picked).catch(() => null);
          const differs = existing && !nothingToChange(existing, newContact.set)
            ? CONTACT_WORDS.differs(language, (["organization", "role"] as const).filter((field) => newContact.set[field] && newContact.set[field] !== existing[field]).map((field) => ({ label: CONTACT_WORDS.label(language, field), value: newContact.set[field]! })))
            : null;
          outcomes.set(part.localId, { kind: "stop", line: CONTACT_WORDS.sameAsExisting(language, existing?.displayName ?? newContact.set.displayName, existing?.organization ?? null, existing?.role ?? null, differs), reason: "already_exists" });
          emitTrace({ existing: picked, partId: part.localId, type: "contact.duplicate_chosen" });
        } else if (access && ctx.scope) {
          const records = await access.listActive(ctx.scope.accountId).catch((error: unknown) => {
            emitTrace({ error: error instanceof Error ? error.message : String(error), partId: part.localId, type: "read.error", where: "propose.contact_duplicates" });
            return null;
          });
          const candidates = records ? duplicateCandidates(records, ctx.scope.accountId, newContact.set) : [];
          emitTrace({ candidates: candidates.map((item) => ({ basis: item.basis, id: item.id })), partId: part.localId, type: "contact.duplicates" });
          if (candidates.length) contactDuplicates.set(part.localId, { candidates, name: newContact.set.displayName });
        }
      }
      if (outcome.kind === "ask" && outcome.question.type === "contact") asked.set(part.localId, outcome.question.candidates.map((item) => item.id));
      emitTrace({ kind: outcome.kind, partId: part.localId, ...(outcome.kind === "ask" ? { question: outcome.question.type } : {}), ...(outcome.kind === "stop" ? { reason: outcome.reason } : {}), type: "propose.resolved" });
    }

    // 4. Questions, waits, stops; then one card when nothing is left open.
    const firstAsking = [...outcomes.entries()].find(([, outcome]) => outcome.kind === "ask")?.[0] ?? null;
    for (const part of active) {
      const outcome = outcomes.get(part.localId)!;
      const write = part.write as PartWrite;
      write.waitsFor = null;
      const contactDuplicate = contactDuplicates.get(part.localId);
      if (contactDuplicate) {
        const made = contactDuplicateSet(scope, { ...state, optionSets }, part, contactDuplicate.name, contactDuplicate.candidates);
        optionSets.push(made.set);
        run.optionLabels.set(made.set.clarificationId, made.labels);
        settle(part, "awaiting_clarification", null, made.line);
        part.waitReason = "object_ambiguous";
        emitTrace({ clarificationId: made.set.clarificationId, kind: "question", options: made.set.options.length, partId: part.localId, question: "contact_duplicate", subgoal: made.set.subgoal, type: "clarify.asked" });
        continue;
      }
      const duplicate = duplicates.get(part.localId);
      if (duplicate) {
        // AG08: not merged, not added: the user checks (a question), or the existing memo is pointed at (an entry).
        const made = duplicateSet(scope, { ...state, optionSets }, part, duplicate);
        optionSets.push(made.set);
        run.optionLabels.set(made.set.clarificationId, made.labels);
        if (duplicate.kind === "ask") {
          settle(part, "awaiting_clarification", null, made.line);
          part.waitReason = "object_ambiguous";
          emitTrace({ clarificationId: made.set.clarificationId, kind: "question", options: made.set.options.length, partId: part.localId, question: "duplicate", subgoal: made.set.subgoal, type: "clarify.asked" });
        } else settle(part, "unfinished", "already_recorded", made.line);
        continue;
      }
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
    // AE-XL-002: while any part of the request waits for the user's answer (a read asking which person, too),
    // no card is frozen — the answer may change what the card says; the click resumes every write part.
    const askingElsewhere = parts.find((part) => !active.includes(part) && part.status === "awaiting_clarification");
    const waiting = Boolean(askingElsewhere) || active.some((part) => part.status === "awaiting_clarification" || part.status === "waiting_dependency");
    const ready = active.filter((part) => outcomes.get(part.localId)?.kind === "ready" && !duplicates.has(part.localId) && !contactDuplicates.has(part.localId));
    if (waiting) {
      // One card per request: the items already settled wait for the open question and go on with it.
      for (const part of ready) {
        part.write!.waitsFor = firstAsking ?? active.find((other) => other.write?.waitsFor)?.write?.waitsFor ?? askingElsewhere?.localId ?? null;
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
    // AG07 repair 2 (AE-BND-008, AE-XL-011): a sentence whose words went into the card (its date, a note's body) is
    // part of the card: it is not "not understood", not answered beside the card, and offers nothing of its own.
    const inCard = usedByCard(parts, ready);
    for (const part of inCard) {
      settle(part, "awaiting_confirmation", "in_card", null);
      part.waitReason = null;
    }
    if (inCard.length) emitTrace({ parts: inCard.map((part) => part.localId), type: "propose.sentences_in_card" });
    const keptSets = inCard.length ? optionSets.filter((set) => !inCard.some((part) => part.localId === set.partId)) : optionSets;
    run.actionPreview = preview;
    run.cardLine = cardLineOf(preview, language);
    emitTrace({ cardId: preview.actionId, operations: preview.operations.map((op) => ({ capability: op.capability, operationId: op.operationId, partId: op.partId ?? null })), revision: preview.revision, type: "propose.card" });
    return { budget, optionSets: keptSets, parts, repairs };
  };
}

/**
 * AG07 repair 2: the parts whose sentence the card used — a part with nothing of its own on the card (a write part
 * that gave no intent, or a statement) whose words an intent of a carded part points into (title, body, date, the
 * record's words or a person's). A part that reads, or that has its own items on the card, is never one of them.
 */
export function usedByCard(parts: readonly GraphPart[], carded: readonly GraphPart[]): GraphPart[] {
  const spans = carded.filter((part) => part.write?.operationIds?.length).flatMap((part) => (part.write?.intents ?? []).flatMap((intent) => [intent.title, intent.body, intent.date, ...intent.selector, ...intent.relations.map((relation) => relation.quote)].filter((span): span is [number, number] => Array.isArray(span))));
  if (!spans.length) return [];
  const overlaps = (part: GraphPart) => spans.some(([start, end]) => start < part.quote[1] && end > part.quote[0]);
  return parts.filter((part) => !carded.includes(part) && !part.write?.operationIds?.length && part.route !== "read"
    && ((part.route === "propose_write" && part.status === "unfinished" && part.reason === "not_understood") || (part.route === "answer" && part.status === "answered"))
    && overlaps(part));
}
