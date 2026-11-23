// @ts-nocheck -- conversation/impl/engine.ts: copied byte for byte from lab-conv repos/orbits/lab/conversation/rsi/archive/r12-maintenance/impl/engine.ts
// (lab commit c13d85089, r12 = r11 + when to ask round 3: contact exact picks, the stated kind wins over title words, a plural pronoun with no recent people goes without binding). Only these two header lines differ; the lab code does not pass this repo's build typecheck.
/**
 * The conversation engine: one memory, fed message by message, used both by the session and (replayed over the
 * transcript) by the six pure functions. See plan.json for the structure and every tunable number.
 *
 * Memory (all built from what was said, never from the hint alone):
 *   - turns: every message with the records it mentioned (agent: listed + mentions + card; user: people it named and
 *     the references / picks this engine resolved), its time and idle gap;
 *   - questions: every question the agent asked, open / shelved / closed, with its unrelated-message count;
 *   - the request each answer served (agent `answered`), and which of its conditions were "this time only";
 *   - facts the user stated (a place, a day or range) and standing requirements ("from now on only …").
 * The model hint is evidence: every id, class or slot it offers is checked against this memory before it is used.
 */
import type { Account, AgentReply, Card, Done, FollowUpClass, HintPart, LabWorld, ModelHint, PartResult, PickResult, Question, RecordKind, RefResult, Slots, TimeWindow, TurnResult } from "../types";
import { chunks, commonRun, containsTerm, fold, fre, indexOfTerm, isCjk, squash } from "./text";
import { addDays, localDay, parseClock, parseTime, sameWin } from "./time";
import { indexWorld, kindOfId, peopleOf, visible, type Rec, type WorldIx } from "./world";
import * as L from "./lexicon";
import { FIELD_CONCEPTS, conceptHits, conceptsOf, kanaSkeleton, kanaWords, latinSkeleton, romaji } from "./concepts";
import { PARAMS } from "./params";
import { kanaSoundsLike, tonesOf } from "./names";
import { tonesOfChars } from "./pinyin";
import { anotherOnPurpose, contentUnits, duplicatesOf, isObjectUnit, isRecurring, linksOf, occurrencesIn, sharedUnits } from "./confirm";

// ---------------------------------------------------------------- memory

interface Turn {
  role: "user" | "agent";
  at: string;
  text: string;
  tf: string;                 // folded text
  mentions: string[];         // records this message mentioned, in order (lists first for agents)
  listed: string[];
  answered?: Slots;
  asks?: Question;
  done: Done[];
  idle: number;               // minutes since the message before
  filler: boolean;            // said nothing about any record (no mentions, no request)
}

interface OpenQ { q: Question; turn: number; status: "open" | "shelved" | "closed"; unrelated: number; asked: number }
/** who: the contact the fact is about, "me" for the user, undefined when the sentence does not say. */
interface Fact { place?: string; time?: TimeWindow; turn: number; who?: string }
/**
 * r07: a change the user asked for (a write request, a write question, a card), from the request until it is carried
 * out (done), called off (cancelled) or replaced. Its slots are the merged request of that change.
 */
interface Task { slots: Slots; turn: number; status: "open" | "done" | "cancelled"; card?: Card; target?: string | null; qid?: string; seen: number; text?: string }
interface Standing { kinds: RecordKind[] | "all"; place?: string; status?: "open" | "done"; topic?: string[]; named?: boolean }

export interface Analysis { result: TurnResult; commit: () => void }

const MIN = 60_000;
const hasAny = (t: string, ws: readonly string[]) => ws.some((w) => w && containsTerm(t, w));
const firstAt = (t: string, ws: readonly string[]) => {
  let best = -1;
  for (const w of ws) { const i = indexOfTerm(t, w); if (i >= 0 && (best < 0 || i < best)) best = i; }
  return best;
};
const uniq = <T,>(xs: T[]) => [...new Set(xs)];

export class Engine {
  readonly ix: WorldIx;
  turns: Turn[] = [];
  questions = new Map<string, OpenQ>();
  facts: Fact[] = [];
  standing: Standing[] = [];
  /** Conditions of the latest request that were for "this time" only (dropped when the request is carried over). */
  oneOff: Partial<Record<keyof Slots, true>> = {};
  /** Company → the one contact the user said handles it (<company>の窓口は<person>): R7. */
  companyContact = new Map<string, string>();
  /** r07: what the user said a name of theirs means (以后我说<X>就是<company>的<name>): folded words → the one contact. */
  userAlias = new Map<string, string>();
  lastUserRequest: Slots | null = null;
  /** r07: the changes of this conversation, oldest first (see Task). */
  tasks: Task[] = [];
  private seenCounter = 0;
  /** The open changes, the one the talk was last about first. */
  openTasks(): Task[] { return this.tasks.filter((t) => t.status === "open").sort((a, b) => b.seen - a.seen); }
  /** The change the talk was last about, whatever its state. */
  lastTask(): Task | undefined { return [...this.tasks].sort((a, b) => b.seen - a.seen)[0]; }
  touch(t: Task) { t.seen = ++this.seenCounter; }
  addTask(slots: Slots, extra: Partial<Task> = {}): Task {
    const t: Task = { slots: { ...slots }, turn: this.turns.length, status: "open", seen: 0, ...extra };
    this.touch(t);
    this.tasks.push(t);
    return t;
  }
  /** Every time window an earlier user message named (its own words or its hint): never taken from a later hint. */
  userWindows: TimeWindow[] = [];
  constructor(world: LabWorld, readonly account: Account, readonly startedAt: string) {
    this.ix = indexWorld(world, account);
  }

  // ---------------------------------------------------------------- agent replies

  reply(a: AgentReply) {
    const prev = this.turns.at(-1);
    const idle = prev ? Math.max(0, (Date.parse(a.at) - Date.parse(prev.at)) / MIN) : 0;
    const mentions = uniq([...a.listed, ...a.mentions, ...(a.card?.target ? [a.card.target] : [])]);
    this.turns.push({ role: "agent", at: a.at, text: a.text, tf: fold(a.text), mentions, listed: [...a.listed], answered: a.answered, asks: a.asks, done: a.done ?? [], idle, filler: !mentions.length && !a.answered && !a.asks && !a.done?.length && !a.card });
    if (a.asks) this.questions.set(a.asks.id, { q: a.asks, turn: this.turns.length - 1, status: "open", unrelated: 0, asked: 1 });
    this.noteChanges(a);
  }

  /** r07: write questions, cards and carried-out writes of an answer update the changes in flight. */
  private noteChanges(a: AgentReply) {
    const latest = this.openTasks()[0];
    const fresh = latest && latest.turn === this.turns.length - 2 ? latest : undefined;   // asked for in the user message just before
    if (a.asks?.writes && a.asks.for?.verb && a.asks.for.verb !== "read") {
      // the agent's reading of the change it asks about is the change's request
      const t = fresh && (!fresh.slots.kind || !a.asks.for.kind || fresh.slots.kind === a.asks.for.kind) ? fresh : this.addTask(a.asks.for);
      t.slots = { ...t.slots, ...a.asks.for };
      t.qid = a.asks.id;
      this.touch(t);
    }
    if (a.card) {
      const [k, v] = a.card.op.split(".");
      const kind = (["todo", "memo", "schedule", "event", "contact"].includes(k) ? k : undefined) as RecordKind | undefined;
      const verb = (["create", "update", "complete", "delete", "link"].includes(v) ? v : undefined) as Slots["verb"];
      const open = this.openTasks();
      // the change the card is for: one asked about in this exchange, else the latest open one of that kind, else a new one
      let t = open.find((x) => !x.card && (!x.slots.kind || x.slots.kind === kind) && (!x.slots.verb || x.slots.verb === verb)) ?? (open[0] && open[0].turn >= this.turns.length - 3 && !open[0].card ? open[0] : undefined)
        ?? open.find((x) => x.card && x.card.op === a.card!.op && x.card.target === a.card!.target);
      if (t && t.card && t.card.id !== a.card.id && t.card.op === a.card.op && t.card.target === a.card.target) { /* the same card again */ }
      if (!t) t = this.addTask({});
      t.card = a.card;
      // r10: what the card says the change is (its words in the agent's language), for telling a repeat later
      t.text = `${t.text ?? ""} ${fold(a.text)}`;
      t.target = a.card.target;
      if (kind) t.slots.kind = kind;
      if (verb) t.slots.verb = verb;
      const day = Object.entries(a.card.set ?? {}).find(([key, val]) => /date|due|day|at$/i.test(key) && /^\d{4}-\d{2}-\d{2}/.test(val))?.[1]?.slice(0, 10);
      if (day) t.slots.time = { from: day, to: day };
      this.touch(t);
    }
    for (const d of a.done ?? []) {
      const open = this.openTasks();
      const t = open.find((x) => x.card && x.card.op === d.op && (x.card.target ?? null) === (d.target ?? null)) ?? open.find((x) => x.card && x.card.op === d.op) ?? open.find((x) => !!x.card);
      if (t) { t.status = "done"; this.touch(t); }
    }
  }

  // ---------------------------------------------------------------- helpers over memory

  private prevAt() { return this.turns.at(-1)?.at; }
  /** The request the next follow-up goes back to: the latest answered request (or the latest user request). */
  prevRequest(): Slots | null {
    // the latest request an answer served; the user's own request only while nothing was answered yet
    for (let i = this.turns.length - 1; i >= 0; i--) { const t = this.turns[i]; if (t.role === "agent" && t.answered) return t.answered; }
    for (let i = this.turns.length - 1; i >= 0; i--) {
      const t = this.turns[i];
      if (t.role === "agent" && t.answered) return t.answered;
      if (t.role === "user" && !t.filler && this.lastUserRequestTurn === i && this.lastUserRequest && (this.lastUserRequest.verb ?? "read") === "read" && this.lastUserRequest.kind) return this.lastUserRequest;
    }
    return null;
  }
  lastUserRequestTurn = -1;
  lastListTurn(kinds?: RecordKind[] | null, before = this.turns.length): number {
    for (let i = before - 1; i >= 0; i--) {
      const t = this.turns[i];
      if (t.role !== "agent" || t.listed.length < 2) continue;
      if (kinds && !t.listed.some((id) => kinds.includes(kindOfId(id)!))) continue;
      return i;
    }
    return -1;
  }
  /** Turn index of the latest idle break (> idleMinutes or a new day) at or before `upTo`, -1 = none. */
  idleBreakAt(upTo: number, currentAt: string): number {
    const times = this.turns.map((t) => t.at);
    const gaps: number[] = [];
    for (let i = 0; i < this.turns.length; i++) gaps.push(this.turns[i].idle);
    const prevAt = this.prevAt();
    const curIdle = prevAt ? (Date.parse(currentAt) - Date.parse(prevAt)) / MIN : 0;
    const isBreak = (idle: number, at: string, before?: string) => idle > PARAMS.idleMinutes || (!!before && idle >= PARAMS.newDayMinIdle && localDay(at) !== localDay(before));
    if (isBreak(curIdle, currentAt, prevAt)) return this.turns.length;
    for (let i = Math.min(upTo, this.turns.length - 1); i >= 1; i--) if (this.turns[i].role === "user" && isBreak(gaps[i], times[i], times[i - 1])) return i;
    return -1;
  }
  private mentionedSince(i: number): boolean {
    for (let k = i; k < this.turns.length; k++) if (this.turns[k].mentions.length) return true;
    return false;
  }

  // ---------------------------------------------------------------- the user turn

  /** The pick a message makes for one given question (whatever else it may continue). */
  pickFor(message: string, at: string, hint: ModelHint | null, gone: readonly string[], qid: string): PickResult {
    const oq = this.questions.get(qid);
    if (!oq) return { kind: "unclear" };
    const ctx = new TurnCtx(this, message, at, hint, gone);
    const pf = fold(message);
    const r = ctx.pick(pf, oq.q);
    return ctx.hintedPick(pf, oq, r.pick, ctx.hintPart(message, 0, 1));
  }

  /** keepSaid: a reference the caller asks about by its exact words (resolveReference): never widened or dropped. */
  analyse(message: string, at: string, hint: ModelHint | null, gone: readonly string[], partsOverride?: string[], keepSaid?: string): Analysis {
    const ctx = new TurnCtx(this, message, at, hint, gone);
    ctx.keepSaid = keepSaid;
    const quotes = partsOverride ?? ctx.splitParts();
    const results: PartResult[] = [];
    for (let i = 0; i < quotes.length; i++) results.push(ctx.part(quotes[i], i, quotes.length));
    const continued = new Set(results.map((r) => r.continues).filter(Boolean) as string[]);
    const shelved: string[] = [];
    const updates: (() => void)[] = [];
    for (const [id, oq] of this.questions) {
      if (oq.status !== "open") continue;
      if (continued.has(id)) continue;
      const unrelated = oq.unrelated + 1;
      const idleShelve = ctx.idle > PARAMS.idleMinutes;
      if (unrelated >= PARAMS.shelveAfterUnrelated || idleShelve) shelved.push(id);
      updates.push(() => { oq.unrelated = unrelated; if (unrelated >= PARAMS.shelveAfterUnrelated || idleShelve) oq.status = "shelved"; });
    }
    const result: TurnResult = { parts: results, shelved };
    const commit = () => {
      for (const u of updates) u();
      for (const r of results) {
        if (!r.continues) continue;
        const oq = this.questions.get(r.continues);
        if (!oq) continue;
        if (r.pick && r.pick.kind !== "unclear") oq.status = "closed";
        else { oq.status = "open"; oq.unrelated = 0; oq.asked += 1; }
      }
      ctx.commit(results);
    };
    return { result, commit };
  }
}

// ---------------------------------------------------------------- one user message

class TurnCtx {
  readonly tf: string;
  readonly idle: number;
  readonly today: string;
  /** Records this message has bound / picked so far (for "her" right after picking her in the same sentence). */
  readonly sentence: string[] = [];
  /** Questions an earlier part of this message already answered. */
  readonly continuedHere = new Set<string>();
  private named: string[] = [];
  private requestOut: Slots | null = null;
  private factsOut: Fact[] = [];
  private standingOut: Standing | null = null;
  private oneOffOut: Partial<Record<keyof Slots, true>> | null = null;
  private companyFactOut: [string, string][] = [];
  private aliasOut: [string, string][] = [];
  private isRequestTurn = false;
  /** r07: updates of the changes in flight, applied on commit. */
  readonly taskOps: (() => void)[] = [];
  constructor(readonly e: Engine, readonly message: string, readonly at: string, readonly hint: ModelHint | null, readonly gone: readonly string[]) {
    this.tf = fold(message);
    const prev = e.turns.at(-1);
    this.idle = prev ? Math.max(0, (Date.parse(at) - Date.parse(prev.at)) / MIN) : 0;
    this.today = localDay(at);
  }
  get ix() { return this.e.ix; }
  vis = (id: string) => visible(this.ix, id, this.gone);

  // -------------------------------------------------------------- parts

  splitParts(): string[] {
    const hp = this.hint?.parts ?? [];
    if (hp.length && hp.every((p) => p.quote && this.message.includes(p.quote))) return this.mergeBareHintParts(hp);
    const open = [...this.e.questions.values()].filter((q) => q.status !== "closed");
    if (!open.length) return [this.message];
    // split at sentence ends and at "and also" markers; keep a split only if one side answers a question and the other is a new request
    const pieces = splitClauses(this.message);
    if (pieces.length < 2) return [this.message];
    const answers = pieces.map((p) => open.some((q) => this.answerEvidence(fold(p), q).strength === "explicit"));
    const answersQ = pieces.map((p) => open.find((q) => this.answerEvidence(fold(p), q).strength === "explicit")?.q.id ?? null);
    if (!answers.some(Boolean)) return [this.message];
    // roles: an answer, a clause with a request of its own, or neither (a filler like "yes," / "OK" / "对了") that
    // stays with its neighbour; consecutive clauses of the same role are one part
    // r10: a clause that opens with an also-word and asks for something done (还有<事>帮我弄一下 / それと<事>やっといて) is a request
    const req = (p: string) => this.ownsRequest(fold(p)) || ALSO_ASK.test(fold(p).trim());
    const roles = pieces.map((p, i) => (answers[i] && !req(p) ? "ans" : req(p) ? "req" : "neutral"));
    // r10: after a sentence end (。) or from an also-word on, a neutral piece belongs to what follows it
    const forward = pieces.map((p, i) => i > 0 && (/[。.!！?？]\s*$/u.test(pieces[i - 1]) || /^(?:还有|另外|それと|あと|also|and also|plus)/u.test(fold(p).trim())));
    for (let i = 0; i < roles.length; i++) if (roles[i] === "neutral") {
      const back = roles.slice(0, i).reverse().find((r) => r !== "neutral"), fwd = roles.slice(i + 1).find((r) => r !== "neutral");
      roles[i] = (forward[i] || (i > 0 && forward[i - 1] && roles[i - 1] === fwd)) && fwd ? fwd : back ?? fwd ?? "ans";
    }
    const out: { text: string; ans: boolean; q: string | null }[] = [];
    for (let i = 0; i < pieces.length; i++) {
      const ans = roles[i] === "ans";
      const last = out.at(-1);
      const qid = ans ? answersQ[i] : null;
      if (last && last.ans === ans && (!ans || !qid || !last.q || last.q === qid)) { last.text += pieces[i]; last.q = last.q ?? qid; }
      else out.push({ text: pieces[i], ans, q: qid });
    }
    if (out.length < 2 || (!out.some((o) => !o.ans) && new Set(out.map((o) => o.q)).size < 2)) return [this.message];
    return out.map((o) => o.text.trim().replace(/^[，,、]\s*/u, "").replace(/[，,、]\s*$/u, "")).filter(Boolean);
  }

  /** r08: hint parts merged into one quote (a greeting split off by the model), the part whose reading stands for it. */
  private mergedHint = new Map<string, HintPart>();
  keepSaid?: string;
  /**
   * r08: a model may give a bare greeting / acknowledgement its own part (a hello / OK / 好的) before or after the
   * real request. A hint part that continues nothing, refers to nothing, reads no condition, and has nothing of a request
   * of its own (no kind word, verb, time, person or question) is no part: it joins its neighbour, whose reading is kept.
   */
  private mergeBareHintParts(hp: HintPart[]): string[] {
    const bare = (p: HintPart) => {
      if (p.continues || p.pick || (p.refs ?? []).length) return false;
      if (Object.keys(p.slots ?? {}).length) return false;
      const pf = fold(p.quote);
      const core = pf.replace(/[\s\p{P}\p{S}]/gu, "");
      return core.length > 0 && core.length <= PARAMS.bareHintPartMaxChars && !this.ownsRequest(pf) && !kindIn(pf) && !verbIn(pf) && !isQuestion(pf)
        && (core.length <= 2 || !parseTime(pf, this.today).win) && !peopleOf(this.ix, pf).hits.length;
    };
    // r08: with no question open, a clause with nothing of a request of its own (no kind word, action verb or question:
    // <person>不在的那天，<request> / <time clause>、<request>) only sets the scene for its neighbour: one part with it
    const noOpen = ![...this.e.questions.values()].some((q) => q.status !== "closed");
    const dependent = (p: HintPart) => {
      if (!noOpen || p.continues || p.pick) return false;
      const pf = fold(p.quote);
      return !this.ownsRequest(pf) && !kindIn(pf) && !verbIn(pf) && !isQuestion(pf);
    };
    const joins = (p: HintPart) => bare(p) || dependent(p);
    if (hp.length < 2 || !hp.some(joins)) return hp.map((p) => p.quote);
    // nothing of a request in any part (a greeting and a remark): one part, read as the longest piece
    if (hp.every(bare)) {
      const whole = this.span(hp[0].quote, hp[hp.length - 1].quote);
      this.mergedHint.set(whole, [...hp].sort((a, b) => b.quote.length - a.quote.length)[0]);
      return [whole];
    }
    const out: { quote: string; part: HintPart }[] = [];
    const withRefs = (main: HintPart, extra: HintPart[]): HintPart => (extra.some((x) => (x.refs ?? []).length) ? { ...main, refs: [...extra.flatMap((x) => x.refs ?? []), ...(main.refs ?? [])] } : main);
    let pending: HintPart[] = [];
    for (const p of hp) {
      if (hp.every(joins) ? bare(p) : joins(p)) {
        if (out.length && !pending.length) { const last = out[out.length - 1]; last.quote = this.span(last.quote, p.quote); last.part = withRefs(last.part, [p]); }
        else pending.push(p);
        continue;
      }
      out.push({ quote: pending.length ? this.span(pending[0].quote, p.quote) : p.quote, part: withRefs(p, pending) });
      pending = [];
    }
    for (const o of out) this.mergedHint.set(o.quote, o.part);
    return out.map((o) => o.quote);
  }
  /** The stretch of the message from the start of a to the end of b. */
  private span(a: string, b: string): string {
    const i = this.message.indexOf(a), j = this.message.indexOf(b, Math.max(0, i));
    return i >= 0 && j >= i ? this.message.slice(i, j + b.length) : a + b;
  }

  /** Does a clause carry a request of its own (kind word / question / action verb)? */
  ownsRequest(pf: string): boolean {
    const kind = kindIn(pf);
    const q = isQuestion(pf);
    const v = verbIn(pf);
    return (!!kind && (q || !!v || !!parseTime(pf, this.today).win)) || (!!v && v !== "read" && pf.length > 4) || (q && pf.length > 6);
  }

  hintPart(quote: string, i: number, n: number): HintPart | undefined {
    const merged = this.mergedHint.get(quote);
    if (merged) return merged;
    const hp = this.hint?.parts ?? [];
    return hp.find((p) => p.quote === quote) ?? (hp.length === n ? hp[i] : undefined) ?? (n === 1 ? hp[0] : undefined);
  }

  // -------------------------------------------------------------- one part

  part(quote: string, i: number, n: number): PartResult {
    const pf = fold(quote);
    const hp = this.hintPart(quote, i, n);
    const att = this.attribute(pf, hp);
    if (att.q) {
      this.continuedHere.add(att.q);
      const oq = this.e.questions.get(att.q)!;
      const pick = att.pick!;
      if (pick.kind === "option" && kindOfId(pick.id)) this.sentence.push(pick.id);
      const clear = pick.kind !== "unclear";
      const budget = clarificationBudget({ asked: oq.asked, unrelatedMessages: 0, idleMinutes: 0, replyClear: clear });
      // r07: an answer to a write question fills the change it was asked for (the record picked, the day given)
      const task = this.e.tasks.find((t) => t.qid === att.q && t.status === "open");
      if (task && clear) this.taskOps.push(() => {
        if (pick.kind === "option" && kindOfId(pick.id) && kindOfId(pick.id) !== "contact") task.target = pick.id;
        if (pick.kind === "value" && pick.field === "date") task.slots.time = { from: pick.value, to: pick.value };
        this.e.touch(task);
      });
      // r10: an answer that names the kind of record to make completes the request it was asked for
      const kindPick = pick.kind === "value" && pick.field === "kind" ? (pick.value as RecordKind) : undefined;
      if (task && kindPick) this.taskOps.push(() => { task.slots.kind = kindPick; });
      const request = kindPick ? { ...(oq.q.for ?? {}), kind: kindPick } : oq.q.for ?? null;
      return { quote, continues: att.q, pick, followUp: null, refs: [], request, next: budget === "go" ? "go" : budget === "ask" ? "ask" : "deliver", redo: [] };
    }
    let saids = this.refWords(quote, pf, hp);
    const ownVerb = verbIn(pf);
    // r10: "one more" in a create (同じ…をもう1つ作って) is the new record, not "the other one"
    if (ownVerb === "create") saids = saids.filter((s) => !/^もう(?:一|1|ひと)つ$/u.test(squash(s)));
    // r10 (R32): a change with no object at all (删掉 / 消して / <day>にずらして): the predicate is the reference
    if (!saids.length && (ownVerb === "delete" || ownVerb === "complete" || ownVerb === "update") && !this.keepSaid && !peopleOf(this.ix, pf).hits.length
      && !this.residualContent(pf).some((w) => !kindIn(w) && !verbIn(w) && !DISCOURSE.test(w)) && !this.e.openTasks().some((t) => t.card || t.qid)) {
      const vi = firstAt(pf, L.VERB_WORDS.find(([v]) => v === ownVerb)?.[1] ?? []);
      const said = (vi >= 0 ? quote.slice(vi) : quote).replace(/[。.！!？?…\s]+$/u, "").trim();
      if (said.length >= 2) saids = [said];
    }
    // r07: a person named earlier in this same sentence is the latest mention for a pronoun after it (in <name>'s
    // notes, where did she …): only one named person, only before the pronoun
    const namedHere = peopleOf(this.ix, pf).groups.filter((g) => g.named && g.ids.length === 1 && this.vis(g.ids[0]));
    // r11: an exact pick binds its record; the words outside it say what is asked (a name inside a title is no person to ask about)
    const picks = this.exactPicks(quote).filter((p) => p.ids.length === 1);
    let pfOut = pf;
    for (const p of picks) pfOut = pfOut.replace(fold(p.said), " ".repeat(fold(p.said).length));
    let refs = saids.map((s) => {
      const pk = picks.find((p) => p.said === s);
      if (pk) return { said: s, outcome: "bound" as const, id: pk.ids[0] };
      const sf = fold(s);
      if (pronounOf(sf) && !peopleOf(this.ix, sf).hits.length && namedHere.length === 1) {
        const at = pf.indexOf(sf);
        const g = namedHere[0];
        if (at >= 0 && g.at[1] <= at && !this.sentence.includes(g.ids[0])) this.sentence.push(g.ids[0]);
      }
      return this.resolve(s, pf, hp);
    });
    for (const r of refs) if (r.outcome === "bound" && r.id) this.sentence.push(r.id);
    // r07: how the part relates to the changes in flight (call off / amend / go back to / the same again)
    const ch = this.changeOf(pf, refs);
    // the pointers of a call-off, an amendment or a going-back point at the change itself, not at a stored record
    if (ch && ch.mode !== "copy") refs = refs.filter((r) => r.outcome === "bound");
    let followUp = this.followUp(pf, hp);
    if (ch) followUp = ch.mode === "amend" && ch.correction ? "correct" : ch.mode === "amend" ? (followUp === "correct" ? "correct" : "new") : "new";
    const request = ch?.mode === "cancel" ? {} : this.request(pf, followUp, refs, hp, ch);
    // r11: a verb word inside a picked title is not the request's (a question about the picked record is a read)
    if (picks.length && request && request.verb && request.verb !== "read" && !verbIn(pfOut) && isQuestion(pfOut)) request.verb = "read";
    if (ch?.mode === "cancel") this.taskOps.push(() => { ch.task.status = "cancelled"; this.e.touch(ch.task); });
    refs = this.narrowSeries(pf, refs);
    const unresolved = refs.some((r) => r.outcome !== "bound") || this.ambiguousPeople(pfOut).length > 0;
    const budget = clarificationBudget({ asked: 0, unrelatedMessages: 0, idleMinutes: this.idle, replyClear: !unresolved });
    const next = this.decideNext(budget === "go" ? "go" : "ask", pf, refs, request, ch, hp);
    return { quote, continues: null, followUp, refs, request, next, redo: [] };
  }

  // -------------------------------------------------------------- r10: when to ask (R34–R41)

  /**
   * r10: the next step of a new part from the whole picture: references that need the user (own reading), a message
   * that asks for nothing (R38), a kind that cannot be told (R39), a missing required value (R40), and writes a careful
   * person confirms first — a duplicate (R34), a delete with linked records (R35), a recurring item without the
   * occurrence (R37). The model's clarity is evidence: "missing_one" / "none" always asks (the safe side); "clear" lifts
   * an ask that only came from this code's own reading of the references, never a confirmation.
   */
  private decideNext(own: "go" | "ask", pf: string, refs: RefResult[], request: Slots | null, ch: ReturnType<TurnCtx["changeOf"]>, hp?: HintPart): "go" | "ask" {
    if (this.confirmReason(pf, refs, request, ch)) return "ask";
    const clarity = hp?.clarity;
    // r11: a typed confirmation while a card waits: nothing is unclear (the answer says the card is to be clicked)
    if (own === "go" && this.bareConfirmWithCard(pf)) return "go";
    // r11: a read whose record the user picked exactly (@ + its whole title): several readings of the words do not matter,
    // nothing is written (a write still asks)
    // r12: an exact pick of a contact (@ + the full name, or the quoted full name) counts the same as one of a record
    if (own === "go" && clarity === "none" && request?.verb === "read" && refs.every((r) => r.outcome === "bound")
      && [...this.exactPicks(this.message), ...this.contactPicks(this.message)].some((p) => p.ids.length === 1 && (refs.some((r) => r.id === p.ids[0]) || (request.people ?? []).includes(p.ids[0])))) return "go";
    if (clarity === "missing_one" || clarity === "none") return "ask";
    if (own === "ask" && (clarity === "clear" || clarity === "statement")) return "go";
    return own;
  }

  /** Why this part must ask before going on (null: nothing to confirm). */
  confirmReason(pf: string, refs: RefResult[], request: Slots | null, ch: ReturnType<TurnCtx["changeOf"]>): string | null {
    if (notARequest(pf)) return "not-a-request";
    // R44: a plural pronoun whose count does not agree with the people of the latest turn; r12: with no person mentioned
    // in the recent turns it points at no one we can see (an organisation, a group): nothing to bind, nothing to ask
    if (PLURAL_PRONOUN.test(pf) && !peopleOf(this.ix, pf).named.length && !this.pluralIsCompany(pf)) {
      const g = this.pluralGroup(pf);
      if (g && !g.fits) return "plural";
    }
    if (!request || ch?.mode === "cancel" || ch?.mode === "amend" || ch?.mode === "resume") return null;
    const verb = request.verb;
    const kind = request.kind;
    if (verb === "create") {
      // R39: "note this down" with no kind word, about what someone said (to note what they said, or a to-do to follow up)
      const said = peopleOf(this.ix, pf).hits.some((h) => SAID_AFTER_NAME.test(pf.slice(h.at[1])));
      if (!kind && peopleOf(this.ix, pf).named.length && (REPORTED_SPEECH.test(pf) || said)) return "kind";
      // R40: a schedule item needs its day
      if (kind === "schedule" && !parseTime(this.maskPeople(pf), this.today).win) return "missing-day";
      if ((kind === "todo" || kind === "memo" || kind === "schedule") && !anotherOnPurpose(pf) && this.duplicates(pf, request).length) return "duplicate";
      return null;
    }
    if (verb === "update" && VAGUE_SHIFT.test(pf) && !DURATION.test(pf) && !parseTime(this.maskPeople(pf), this.today).win) return "missing-value";
    if (verb === "update" || verb === "delete") {
      const targets = this.writeTargets(pf, refs, request);
      // R35: a contact or an event other records still point at
      if (verb === "delete" && targets.some((id) => linksOf(this.ix, id, this.vis).length)) return "links";
      // R37: a recurring item: which occurrence (or all of them) must be said
      for (const id of targets) {
        if (!isRecurring(this.ix, id)) continue;
        if (ALL_OCCURRENCES.test(pf)) continue;
        const w = this.targetWindow(pf);
        const occ = w ? occurrencesIn(this.ix, id, w) : [];
        if (occ.filter((o) => !o.cancelled).length !== 1 || occ.some((o) => o.cancelled)) return "recurring";
      }
    }
    return null;
  }

  /** The records a change is about: bound references, the person of a contact change, else a record the words name. */
  private writeTargets(pf: string, refs: RefResult[], request: Slots): string[] {
    const ids = refs.filter((r) => r.outcome === "bound" && r.id).map((r) => r.id!);
    if (request.kind === "contact") ids.push(...(request.people ?? []));
    if (!ids.length && request.kind && request.kind !== "contact") {
      const named = this.namedRecords(pf, request.kind);
      if (named.length === 1) ids.push(named[0]);
    }
    return uniq(ids).filter((id) => !request.kind || kindOfId(id) === request.kind);
  }

  /** r10 (R43): the message names (by most of its title) a record that is not among these: it is about that record. */
  namesUnlisted(pf: string, ids: string[]): boolean {
    return [...this.ix.recs.values()].some((r) => r.kind !== "contact" && !ids.includes(r.id) && this.vis(r.id) && r.titleF.length >= 3 && this.titleCovered(r, pf));
  }

  /** r10 (R44): the people a plural pronoun points at: every person the latest turn naming people mentioned; fits = the count said agrees. */
  pluralGroup(pf: string): { ids: string[]; fits: boolean } | null {
    const m = PLURAL_PRONOUN.exec(pf);
    if (!m || peopleOf(this.ix, pf).named.length || this.pluralIsCompany(pf)) return null;
    // r12: only people of the recent turns (filler not counted); none there → null
    let seen = 0;
    for (let k = this.e.turns.length - 1; k >= 0 && seen < PARAMS.pluralPeopleTurns; k--) {
      const ids = this.e.turns[k].mentions.filter((id) => kindOfId(id) === "contact" && this.vis(id));
      if (!this.e.turns[k].filler || ids.length) seen++;
      if (!ids.length) continue;
      const n = /俩|两|二|二人|two|both/u.test(m[0]) ? 2 : /三/u.test(m[0]) || /three/u.test(m[0]) ? 3 : 0;
      return { ids, fits: ids.length >= 2 && (!n || n === ids.length) };
    }
    return null;
  }

  /**
   * r11: a plural pronoun right after a company was named (in this sentence before it, or in the latest turns, with none
   * of the company's people listed since) points at that company's side, not at a count of people.
   */
  pluralIsCompany(pf: string): boolean {
    const m = PLURAL_PRONOUN.exec(pf);
    if (!m) return false;
    // r12: also an organisation the world does not have, told by a generic company ending (…科技 / …株式会社 / … Inc.)
    const company = (t: string) => peopleOf(this.ix, t).hits.some((h) => h.how === "company") || namesOrganisation(t);
    const here = peopleOf(this.ix, pf.slice(0, m.index));
    if (here.named.length) return false;
    if (company(pf.slice(0, m.index))) return true;
    let seen = 0;
    for (let k = this.e.turns.length - 1; k >= 0 && seen < PARAMS.pluralCompanyTurns; k--) {
      const t = this.e.turns[k];
      if (t.filler && !company(t.tf)) continue;
      seen++;
      if (t.mentions.some((id) => kindOfId(id) === "contact" && this.vis(id))) return false;
      if (company(t.tf)) return true;
    }
    return false;
  }

  /** r11: a bare typed confirmation (确认 / OK / confirm) while a change card waits for its click. */
  bareConfirmWithCard(pf: string): boolean {
    if (!this.e.openTasks().some((t) => t.card)) return false;
    const toks = pf.split(/[\s,，、。.！!？?…~〜\-—:：;；'"“”]+/u).filter(Boolean).map((t) => t.replace(/(?:呀|啊|哈|哦|喔|嘛|吧|よ|ね|です|で)+$/u, "")).filter(Boolean);
    if (!toks.length) return false;
    const ok = (w: string) => L.CONFIRM_WORDS.includes(w) || L.ACK_ONLY.includes(w);
    return ok(toks.join(" ")) || toks.every(ok);
  }

  /**
   * r11: records the user picked exactly: an @ mention followed by a record's whole title, or a quoted title (「…」 / "…").
   * said = the title words as written; ids = every visible record with that title (more than one is no exact pick).
   */
  exactPicks(quote: string): { said: string; ids: string[] }[] {
    const out: { said: string; ids: string[] }[] = [];
    const recs = [...this.ix.recs.values()].filter((r) => r.kind !== "contact" && r.titleF.length >= 2 && this.vis(r.id));
    const take = (start: number, ids: string[], titleF: string) => {
      for (let n = 1; start + n <= quote.length; n++) if (squash(quote.slice(start, start + n)) === titleF) { out.push({ said: quote.slice(start, start + n), ids }); return; }
    };
    for (const m of quote.matchAll(/[@＠]/gu)) {
      const start = (m.index ?? 0) + 1;
      const rest = squash(quote.slice(start));
      let best = 0;
      let ids: string[] = [];
      for (const r of recs) {
        if (!rest.startsWith(r.titleF)) continue;
        // a Latin title ends at a word boundary
        if (/[a-z0-9]$/u.test(r.titleF) && /^[a-z0-9]/u.test(rest.slice(r.titleF.length))) continue;
        if (r.titleF.length > best) { best = r.titleF.length; ids = [r.id]; } else if (r.titleF.length === best) ids.push(r.id);
      }
      if (best) take(start, ids, rest.slice(0, best));
    }
    for (const m of quote.matchAll(/[「『“"]([^」』”"]{2,80})[」』”"]/gu)) {
      const inner = squash(m[1]);
      const ids = recs.filter((r) => r.titleF === inner).map((r) => r.id);
      if (ids.length) take((m.index ?? 0) + 1, ids, inner);
    }
    return out;
  }

  /**
   * r12: contacts the user picked exactly: an @ mention followed by a visible contact's whole name (longest match, a Latin
   * name ends on a word boundary) or a quoted whole name. ids = every visible contact of that name (more than one is no
   * exact pick).
   */
  contactPicks(quote: string): { said: string; ids: string[] }[] {
    const out: { said: string; ids: string[] }[] = [];
    const cs = this.ix.contacts.filter((c) => c.titleF.length >= 2 && this.vis(c.id));
    const take = (start: number, ids: string[], nameF: string) => {
      for (let n = 1; start + n <= quote.length; n++) if (squash(quote.slice(start, start + n)) === nameF) { out.push({ said: quote.slice(start, start + n), ids }); return; }
    };
    for (const m of quote.matchAll(/[@＠]/gu)) {
      const start = (m.index ?? 0) + 1;
      const rest = squash(quote.slice(start));
      let best = 0;
      for (const c of cs) {
        if (!rest.startsWith(c.titleF)) continue;
        if (/[a-z0-9]$/u.test(c.titleF) && /^[a-z0-9]/u.test(rest.slice(c.titleF.length))) continue;
        best = Math.max(best, c.titleF.length);
      }
      if (best) { const nameF = rest.slice(0, best); take(start, cs.filter((c) => c.titleF === nameF).map((c) => c.id), nameF); }
    }
    for (const m of quote.matchAll(/[「『“"]([^」』”"]{2,80})[」』”"]/gu)) {
      const inner = squash(m[1]);
      const ids = cs.filter((c) => c.titleF === inner).map((c) => c.id);
      if (ids.length) take((m.index ?? 0) + 1, ids, inner);
    }
    return out;
  }

  /** r10: most of a record's title (two content units or more, at least 60%) is in the words. */
  titleCovered(r: Rec, words: string): boolean {
    // only the words themselves count (bigrams, Latin words): a concept would count the same word twice
    const tu = [...contentUnits(r.titleF.replace(/[の的]/gu, " "))].filter((u) => !/^[aoc]\d/u.test(u));
    if (tu.length < 2) return false;
    const mu = contentUnits(words.replace(/[の的]/gu, " "));
    const hit = tu.filter((u) => mu.has(u)).length;
    return hit >= PARAMS.titleCoverMinUnits && hit / tu.length >= PARAMS.titleCoverShare;
  }

  /** r10: records of a kind whose title the message covers (most of the title's content units are said). */
  namedRecords(pf: string, kind: RecordKind): string[] {
    const units = contentUnits(this.maskPeople(pf).replace(/[の的]/gu, " "));
    const out: { id: string; cov: number }[] = [];
    for (const r of this.ix.recs.values()) {
      if (r.kind !== kind || !this.vis(r.id)) continue;
      const tu = [...contentUnits(r.titleF.replace(/[の的]/gu, " "))].filter((u) => !/^[aoc]\d/u.test(u));
      if (tu.length < 1) continue;
      const hit = tu.filter((u) => units.has(u)).length;
      const cov = hit / tu.length;
      if (hit >= PARAMS.titleCoverMinUnits && cov >= PARAMS.titleCoverShare) out.push({ id: r.id, cov });
    }
    const best = Math.max(0, ...out.map((o) => o.cov));
    return out.filter((o) => o.cov === best).map((o) => o.id);
  }

  /** The window that says which occurrence a change is about: the time words before the change verb. */
  private targetWindow(pf: string): TimeWindow | null {
    const vi = firstAt(pf, [...(L.VERB_WORDS.find(([v]) => v === "update")?.[1] ?? []), ...(L.VERB_WORDS.find(([v]) => v === "delete")?.[1] ?? [])]);
    const head = vi > 0 ? pf.slice(0, vi) : "";
    return head ? parseTime(this.maskPeople(head), this.today).win : null;
  }

  /** r10: several recurring series of the same title: the occurrence the message names keeps the series that has it. */
  private narrowSeries(pf: string, refs: RefResult[]): RefResult[] {
    return refs.map((r) => {
      if (r.outcome !== "ask" || !(r.candidates ?? []).length || !r.candidates!.every((id) => kindOfId(id) === "schedule" && isRecurring(this.ix, id))) return r;
      const w = this.targetWindow(pf) ?? (verbIn(pf) === "read" ? parseTime(this.maskPeople(pf), this.today).win : null);
      if (!w || this.afterIdle()) return r;
      const fit = r.candidates!.filter((id) => occurrencesIn(this.ix, id, w).some((o) => !o.cancelled));
      return fit.length === 1 ? { said: r.said, outcome: "bound" as const, id: fit[0] } : r;
    });
  }

  /** R34: the account's records (and this conversation's carried-out writes) the new record would duplicate. */
  private duplicates(pf: string, request: Slots): string[] {
    const kind = request.kind as "todo" | "memo" | "schedule";
    const masked = this.maskPeople(pf);
    const units = contentUnits(canonPlaces(masked));
    const day = request.time && request.time.from === request.time.to ? request.time.from : undefined;
    const title = /[「『"“]([^」』"”]{2,30})[」』"”]/u.exec(pf)?.[1] ?? /(?:标题|題名|タイトル|title)(?:叫|是|为|は|:|：|\s)\s*([^，,。、\s]{2,20})/u.exec(pf)?.[1];
    const out = duplicatesOf(this.ix, { kind, units, people: request.people ?? [], day, clock: parseClock(masked), title, vis: this.vis });
    // a write carried out earlier in this conversation, asked for again (R34: ask, never redo it)
    for (const t of this.e.tasks) {
      if (t.status !== "done" || t.slots.verb !== "create" || t.slots.kind !== kind || !t.text) continue;
      const shared = sharedUnits(units, contentUnits(t.text));
      const sameDay = !!day && !!t.slots.time && t.slots.time.from === day;
      const objects = shared.filter(isObjectUnit);
      if (objects.length >= 1 && (shared.length >= 2 || sameDay)) out.push(`task:${t.turn}`);
    }
    return out;
  }

  // -------------------------------------------------------------- attribution and picks

  /** How a part relates to an open question: explicit answer (an option / a value), a response without a decision, or nothing. */
  answerEvidence(pf: string, oq: OpenQ): { strength: "explicit" | "responsive" | "none"; pick: PickResult; names?: boolean } {
    // an ordinal counts in the newest list: once a list was shown after the question, "the second" is about that list
    if (L.ordinalOf(pf) && this.e.lastListTurn() > oq.turn) return { strength: "none", pick: { kind: "unclear" } };
    const r = this.pick(pf, oq.q);
    if (r.ev === "distinct") return { strength: "explicit", pick: r.pick };
    if (r.ev === "gone") return { strength: "explicit", pick: { kind: "unclear" } };
    // r07: names: the part names what several of this question's options share (沈那个…想不起来): it is about this question
    if (r.ev === "unsure" || r.ev === "shared") return { strength: "responsive", pick: { kind: "unclear" }, names: r.ev === "shared" || (r.ev === "unsure" && this.namesSharedOption(pf, oq.q)) };
    return { strength: "none", pick: { kind: "unclear" } };
  }

  attribute(pf: string, hp?: HintPart): { q: string | null; pick?: PickResult } {
    if (hasAny(pf, L.DEFER_MARKERS)) return { q: null };
    const qs = [...this.e.questions.values()].filter((q) => q.status !== "closed" && !this.continuedHere.has(q.q.id)).sort((a, b) => b.turn - a.turn);
    if (!qs.length) return { q: null };
    const ev = qs.map((oq) => ({ oq, ...this.answerEvidence(pf, oq) }));
    const explicit = ev.filter((x) => x.strength === "explicit");
    const unsure = hasAny(pf, L.UNSURE_MARKERS) && !kindIn(pf);
    const newReq = this.ownsRequest(pf) && !this.refersToQuestion(pf, qs) && !unsure;
    // r10 (R45): a question about what to make (no options: a note or a to-do?) is answered by naming the kind
    const kindSaid = kindIn(pf);
    if (kindSaid && kindSaid !== "contact" && !isQuestion(pf)) {
      const intent = qs.filter((q) => q.status === "open" && (q.q.about === "intent" || q.q.about === "plan") && !(q.q.options ?? []).length && !q.q.for?.kind);
      if (intent.length && !peopleOf(this.ix, pf).named.some((p) => !(intent[0].q.for?.people ?? []).includes(p))) return { q: intent[0].q.id, pick: { kind: "value", field: "kind", value: kindSaid } };
    }
    // a part that names the kind of record a question is about, and asks for nothing else, is about that question (議事録は…のやつで)
    if (!newReq && !isQuestion(pf)) {
      const k = kindIn(pf);
      const about = k ? qs.filter((q) => q.status === "open" && q.q.for?.kind === k) : [];
      if (about.length === 1 && !ev.some((x) => x.strength === "explicit")) return { q: about[0].q.id, pick: this.hintedPick(pf, about[0], { kind: "unclear" }, hp) };
    }
    if (explicit.length) {
      const best = explicit[0];
      // a value answer that is really a new question (a question about a period with a kind word) is not an answer
      if (!(newReq && best.oq.q.about === "value" && isQuestion(pf))) return { q: best.oq.q.id, pick: this.hintedPick(pf, best.oq, best.pick, hp) };
    }
    const fresh = qs.filter((q) => q.status === "open");
    const resp = ev.filter((x) => x.strength === "responsive" && x.oq.status === "open");
    if (resp.length && !newReq && this.idle <= PARAMS.idleMinutes) {
      const best = resp.find((x) => x.names) ?? resp[0];
      return { q: best.oq.q.id, pick: this.hintedPick(pf, best.oq, { kind: "unclear" }, hp) };
    }
    // the hint says it continues an open question: follow it only when the part has something an answer would have
    if (hp?.continues && !newReq && !isQuestion(pf) && !/^(那|じゃあ|and |what about)/u.test(pf.trim())) {
      const oq = fresh.find((q) => q.q.id === hp.continues);
      if (oq && this.idle <= PARAMS.idleMinutes && this.residual(pf, oq.q).length && !hasAny(pf, L.ACK_ONLY.filter((w) => pf.trim() === w))) {
        return { q: oq.q.id, pick: this.hintedPick(pf, oq, { kind: "unclear" }, hp) };
      }
    }
    return { q: null };
  }

  /** r07: the contact the user said handles the company of these people (R7). */
  companyFact(ids: string[]): string | undefined {
    for (const id of ids) { const co = this.ix.companyOf.get(id); const p = co ? this.e.companyContact.get(co) : undefined; if (p && ids.includes(p)) return p; }
    return undefined;
  }

  /** r07: a record's own words (title, body / notes, location), without the details of the people linked to it. */
  ownText(id: string): string {
    const w = this.ix.world as unknown as Record<string, { id: string; title?: string; body?: string; notes?: string; location?: string }[]>;
    for (const k of ["todos", "memos", "schedule", "platformEvents", "privateEvents"]) {
      const r = (w[k] ?? []).find((x) => x.id === id);
      if (r) return squash(fold(`${r.title ?? ""} ${r.body ?? ""} ${r.notes ?? ""} ${r.location ?? ""}`));
    }
    return "";
  }

  /** r07: a name the user defined in this conversation, found in the text, with the contacts it would fit otherwise. */
  aliasHit(t: string): { id: string; alsoFits: string[] } | null {
    for (const [said, id] of this.e.userAlias) {
      if (!containsTerm(t, said) && !squash(t).includes(squash(said))) continue;
      const alsoFits = peopleOf(this.ix, said).hits.flatMap((h) => h.ids);
      return { id, alsoFits };
    }
    return null;
  }

  /** r07: the part names a person or word that several options of the question share (a surname of two options). */
  namesSharedOption(pf: string, q: Question): boolean {
    const opts = q.options ?? [];
    if (opts.length < 2) return false;
    const groups = peopleOf(this.ix, pf).groups.filter((g) => g.ids.length);
    return groups.some((g) => opts.filter((o) => g.ids.includes(o.id)).length > 1);
  }

  /** The part names the question's subject (电话那个 / for the email / 刚才问…): it is about that open item. */
  refersToQuestion(pf: string, qs: OpenQ[]): boolean {
    return fre(/刚才|さっき|前面|あの件|那个电话|电话那个|電話の件|for the|那条就|那个就/u).test(pf) && qs.length > 0;
  }

  /** The hint's pick is used only where this message cannot decide and the hint names a live option of the question. */
  hintedPick(pf: string, oq: OpenQ, own: PickResult, hp?: HintPart): PickResult {
    if (own.kind !== "unclear") return own;
    const h = hp?.pick;
    if (!h || h.kind !== "option" || hp?.continues !== oq.q.id) return own;
    const opt = oq.q.options?.find((o) => o.id === h.id);
    if (!opt) return own;
    if (kindOfId(h.id) && !this.vis(h.id)) return own;
    const r = this.pick(pf, oq.q);
    if (r.ev !== "none") return own;                 // shared / unsure / gone: the message itself says it is not decided
    if (this.residual(pf, oq.q).length === 0) return own;
    return { kind: "option", id: h.id };
  }

  /** Words of the part that are not function words, pointers, honorifics or words every option shares. */
  residual(pf: string, q: Question): string[] {
    let t = pf;
    for (const w of [...L.BARE_POINTERS, ...L.HONORIFICS, ...L.ACK_ONLY, ...FUNCTION_WORDS]) t = t.split(w).join(" ");
    const opts = q.options ?? [];
    const shared = (s: string) => opts.length > 1 && opts.every((o) => this.optionText(o).includes(s));
    return chunks(t).filter((c) => c.length >= 2 && !shared(c));
  }

  /** Latin words (3+ letters) of a contact's name, aliases and company. */
  latinWordsOf(id: string): string[] {
    const c = this.ix.world.contacts.find((x) => x.id === id);
    if (!c) return [];
    return [c.name, ...(c.aliases ?? []), c.company ?? ""].flatMap((x) => fold(x).split(/[^a-z]+/)).filter((w) => w.length >= 3);
  }

  optionText(o: { id: string; label: string }): string {
    const r = this.ix.recs.get(o.id);
    return canonWeekday(squash(o.label) + (r ? r.text : ""));
  }

  pick(pf: string, q: Question): { pick: PickResult; ev: "distinct" | "shared" | "unsure" | "gone" | "none" } {
    const opts = q.options ?? [];
    const unsure = hasAny(pf, L.UNSURE_MARKERS);
    if (!opts.length || q.about === "value") {
      if (hasAny(pf, L.VAGUE_TIME) && !parseTime(this.maskPeople(pf), this.today).win) return { pick: { kind: "unclear" }, ev: "unsure" };
      const tp = parseTime(this.maskPeople(pf), this.today);
      if (tp.win) return { pick: { kind: "value", field: "date", value: tp.win.from }, ev: "distinct" };
      const clock = parseClock(pf);
      if (clock) return { pick: { kind: "value", field: "time", value: clock }, ev: "distinct" };
      return { pick: { kind: "unclear" }, ev: unsure ? "unsure" : "none" };
    }
    // ordinal over the options (二番目の人 / 第二个 / the second)
    const ord = L.ordinalOf(pf);
    let hitIds: string[] = [];
    // r07: a confirmation question with one option (是 X 吗？): a plain yes takes it
    if (opts.length === 1 && YES_ONLY.test(pf.trim()) && !NO_WORD.test(pf)) hitIds = [opts[0].id];
    // r07: the part of the day (<part of day>那个 / <part of day>のほう / the <part of day> one): the one option whose time is in that part
    const part = dayPartOf(pf);
    if (!hitIds.length && part && !ord) {
      const fit = opts.filter((o) => dayPartOf(fold(o.label), true) === part || clockPart(o.label) === part);
      if (fit.length === 1) hitIds = [fit[0].id];
    }
    if (ord && ord.n > 0 && ord.n <= opts.length && !/第\s*[一二三四五六七八九十\d]+\s*点/u.test(pf)) hitIds = [opts[ord.n - 1].id];
    // a person named in the reply who is several of the options (a shared surname) says nothing; one of them decides
    let sharedPerson = false;
    if (!hitIds.length && opts.some((o) => kindOfId(o.id) === "contact")) {
      const groups = peopleOf(this.ix, pf).groups.filter((g) => g.named);
      sharedPerson = groups.some((g) => opts.filter((o) => g.ids.includes(o.id)).length > 1);
    }
    if (!hitIds.length) {
      // a well-known place in Latin letters or kana meets the option's CJK spelling (Kyoto / きょうと → 京都)
      const pfp = canonPlaces(pf);
      // r06: scored on the reply as written and with places in CJK; an option that either reading points at counts
      const scores = opts.map((o) => { const a = this.optionScore(pf, o, opts), b = pfp === pf ? a : this.optionScore(pfp, o, opts); return { hit: Math.max(a.hit, b.hit), shared: a.shared || b.shared }; });
      const max = Math.max(...scores.map((s) => s.hit));
      if (max > 0) {
        // r06: a pick needs one option with positive evidence; two with some evidence each is no decision by margin
        const top = opts.filter((_, k) => scores[k].hit > 0);
        hitIds = top.map((o) => o.id);
      } else if (scores.some((s) => s.shared) || sharedPerson) {
        return { pick: { kind: "unclear" }, ev: unsure ? "unsure" : "shared" };
      }
    }
    if (unsure && hitIds.length !== 1) return { pick: { kind: "unclear" }, ev: "unsure" };
    if (unsure && hitIds.length === 1 && /你定|任せ|まかせ|you pick|you choose|随便|都行/u.test(pf)) return { pick: { kind: "unclear" }, ev: "unsure" };
    if (hitIds.length === 1) {
      const id = hitIds[0];
      if (kindOfId(id) && !this.vis(id)) return { pick: { kind: "unclear" }, ev: "gone" };
      return { pick: { kind: "option", id }, ev: "distinct" };
    }
    if (hitIds.length > 1) return { pick: { kind: "unclear" }, ev: "shared" };
    return { pick: { kind: "unclear" }, ev: unsure ? "unsure" : "none" };
  }

  /** How many words of the part point at this option and at no other one; and whether the part names what all share. */
  optionScore(pf: string, o: { id: string; label: string }, opts: { id: string; label: string }[]): { hit: number; shared: boolean } {
    const others = opts.filter((x) => x.id !== o.id);
    const otherTexts = others.map((x) => this.optionText(x));
    const mine = this.optionText(o);
    const terms = new Set<string>();
    const fixed = FIELD_OPTIONS[o.id];
    if (fixed) for (const w of fixed) terms.add(fold(w));
    for (const c of chunks(fold(o.label))) terms.add(c.replace(/\s+/g, ""));
    for (const m of canonWeekday(squash(o.label)).match(/〔\d〕/gu) ?? []) terms.add(m);
    const r = this.ix.recs.get(o.id);
    // a contact's name counts where person spotting finds it (a name in name position, not a substring of a word)
    let nameHit = 0, nameShared = false;
    if (r?.kind === "contact") {
      for (const h of peopleOf(this.ix, pf).hits) {
        if (!h.ids.includes(o.id)) continue;
        if (others.some((x) => h.ids.includes(x.id)) || otherTexts.some((x) => x.includes(squash(h.name ?? h.said)))) nameShared = true; else nameHit = 1;
      }
      const role = this.ix.roleOf.get(o.id);
      if (role) terms.add(role);
    }
    const p = canonWeekday(squash(pf));
    let hit = 0;
    let shared = false;
    const negated = (term: string) => {
      if (/^[a-z0-9 ]+$/.test(term)) {
        // Latin: the next whole word says it stays / is not meant (deadline stays, not the audit)
        const i = indexOfTerm(pf, term);
        if (i >= 0 && /^\s*(not\b|stays\b|unchanged\b|isn'?t\b|is not\b)/u.test(pf.slice(i + term.length)) || /\bnot\s+(the\s+)?$/u.test(pf.slice(0, Math.max(0, i)))) return true;
        // r06: a CJK keep / negation word right after the Latin term (a Latin field word, then 别动)
        return i >= 0 && cjkNegAfter(squash(pf.slice(i + term.length)));
      }
      const i = p.indexOf(term);
      return i >= 0 && cjkNegAfter(p.slice(i + term.length));
    };
    const consider = (term: string) => {
      const tt = canonWeekday(term.replace(/\s+/g, ""));
      if (tt.length < 2 && !/[a-z]/.test(tt)) return;
      if (!p.includes(tt) && !containsTerm(pf, term)) return;
      if (otherTexts.some((x) => x.includes(tt))) { shared = true; return; }
      if (negated(tt)) { hit -= 1; return; }
      hit += 1;
    };
    // r06: a term inside a longer term of the same option that the part has is not counted again (截止 in 截止日)
    const present: string[] = [];
    for (const t of [...terms].sort((a, b) => b.length - a.length)) {
      const tt = canonWeekday(t.replace(/\s+/g, ""));
      if (present.some((x) => x.includes(tt))) continue;
      if (p.includes(tt) || containsTerm(pf, t)) present.push(tt);
      consider(t);
    }
    hit += nameHit;
    if (nameShared && !nameHit) shared = true;
    // a katakana rendering of a Latin name / company word that only this option has (a Latin-named contact in a Japanese reply)
    if (r?.kind === "contact") {
      // a short sound skeleton is weak evidence: only a kana word used as a name (before さん / 社 / の方) or one of 3+ consonants
      const namedW = [...pf.matchAll(/([ぁ-ゖー]{2,}?)(?=さん|さま|様|氏|社|の方|のほう)/gu)].map((m) => m[1]);
      const ksW = [...kanaWords(pf).filter((w) => kanaSkeleton(w).length >= 3), ...namedW.filter((w) => kanaSkeleton(w).length >= 2)];
      if (ksW.length) {
        // r06: the skeleton must agree and the kana must sound like the Latin word (vowels and diphthongs too)
        const fits = (id: string, w: string) => this.latinWordsOf(id).some((lw) => latinSkeleton(lw).length >= 2 && latinSkeleton(lw) === kanaSkeleton(w) && kanaSoundsLike(w, lw, true));
        for (const w of ksW) if (fits(o.id, w)) { if (others.some((x) => fits(x.id, w))) shared = true; else hit += 1; }
      }
    }
    // a concept named in another language (监査 ↔ 审计, freight ↔ 运费) that only this option's text has
    const rc = conceptHits(pf, p);
    if (rc.size) {
      const oc = conceptsOf(fold(o.label), mine);
      const otherC = others.map((x) => conceptsOf(fold(x.label), this.optionText(x)));
      const lc = conceptsOf(fold(o.label));
      const otherLc = others.map((x) => conceptsOf(fold(x.label)));
      for (const [c, form] of rc) {
        // what the option labels show decides first; the records' full texts only when the labels say nothing
        if (lc.has(c) && !otherLc.some((s) => s.has(c))) { if (negated(form)) hit -= 1; else hit += 1; continue; }
        if (otherLc.some((s) => s.has(c))) { if (lc.has(c)) shared = true; continue; }
        if (!oc.has(c)) continue;
        if (otherC.some((s) => s.has(c))) { shared = true; continue; }
        if (negated(form)) hit -= 1; else hit += 1;
      }
    }
    if (r && r.kind !== "contact") {
      const named = peopleOf(this.ix, pf).named;
      const mineP = named.filter((pid) => r.contactIds.includes(pid));
      if (mineP.length && !others.some((x) => named.some((pid) => this.ix.recs.get(x.id)?.contactIds.includes(pid)))) hit += 1;
    }
    // substrings of the option's text that only it has (海运费 / 运费 / 调研 / 建材)
    if (hit <= 0) {
      const cjk = [...p].filter(isCjk).length;
      if (cjk >= 2) {
        const seen = new Set<string>();
        for (let len = Math.min(6, p.length); len >= 2; len--) {
          for (let s = 0; s + len <= p.length; s++) {
            const sub = p.slice(s, s + len);
            if (seen.has(sub) || ![...sub].every((c) => isCjk(c) || /[ぁ-ん]/.test(c))) continue;
            seen.add(sub);
            if (FUNCTION_SUBSTR.some((f) => sub === f)) continue;
            if (!mine.includes(sub)) continue;
            if (otherTexts.some((x) => x.includes(sub))) { shared = true; continue; }
            if (!negated(sub)) { hit += 1; s = p.length; len = 0; }
          }
        }
      }
      // role words in another language (律师 / lawyer; 经理 / manager)
      for (const [words, roles] of L.ROLE_SYNONYMS) {
        if (!words.some((w) => containsTerm(pf, w))) continue;
        const fits = (id: string) => roles.some((rr) => this.ix.roleOf.get(id)?.includes(rr));
        if (fits(o.id) && !others.some((x) => fits(x.id))) hit += 1;
        else if (fits(o.id)) shared = true;
      }
    }
    return { hit: Math.max(0, hit), shared };
  }

  // -------------------------------------------------------------- follow-up class

  followUp(pf: string, hp?: HintPart): FollowUpClass {
    const own = this.ownFollowUp(pf);
    const h = hp?.followUp;
    if (!h || h === own.cls || own.strong) return own.cls;
    if (h === "new") return own.cls;
    return this.hintPlausible(h, pf) ? h : own.cls;
  }

  /**
   * Does the message's structure allow the class the hint names? Not the same marker words (a model reads phrasings
   * the lists do not have) but nothing that contradicts it: a write, a switch to another kind, a new period that is not
   * inside the old one, a topic change with a full request of its own, no object to swap, nothing that contrasts.
   */
  hintPlausible(h: FollowUpClass, pf: string): boolean {
    const prev = this.e.prevRequest();
    if (!prev) return false;
    const f = this.shape(pf, prev);
    // a class that keeps the previous conditions needs the message to go on with that request: content of its own
    // that the shown result does not have says it is about something else
    if (h !== "correct" && h !== "follow_list" && this.asksOtherContent(pf, prev)) return false;
    switch (h) {
      case "swap_period": return !!f.time && !f.sameTime && !f.write && !f.kindChange;
      case "repeat": return f.prevRead && !f.write && (!f.time || f.sameTime) && !f.newPeople && !f.kindChange && !f.statement;
      // a filter is an instruction on the shown result, not a wh-question and not a new topic
      case "refine": return f.prevRead && !f.write && !f.kindChange && !f.fresh && !f.topicTurn && (!f.wh || f.only) && !f.timeAnaphor && (!f.time || f.subWindow || f.sameTime) && !f.statement && f.filter;
      case "adjust": return f.prevRead && !f.create && !f.statement && !f.fresh && f.content;
      case "ask_again_about": return !f.write && (!f.time || f.sameTime) && !f.statement && f.object && !f.kindChange && !this.asksOtherContent(pf, prev);
      case "correct": return f.contrast;
      case "follow_list": return this.recentMentions(PARAMS.followListTurns).length > 1 && !this.namesOutsider(pf, this.recentMentions(PARAMS.followListTurns)) && !f.statement && (f.question || hasAny(pf, L.LIST_POINTERS) || !!listOrdinal(pf));
      default: return false;
    }
  }

  /** The structural features of a follow-up against the request before it. */
  shape(pf: string, prev: Slots) {
    const masked = this.maskPeople(pf);
    const tp = parseTime(masked, this.today, prev.time);
    const time = tp.win ?? null;
    const people = peopleOf(this.ix, pf);
    const kind = kindIn(pf);
    const noStatus = stripWords(pf, [...L.DONE_WORDS, ...L.OPEN_WORDS]);
    const verb = verbIn(stripWords(noStatus, [...L.ADJUST_ADD, ...L.ADJUST_REMOVE]));
    const write = !!verb && verb !== "read";
    // r10: <kind>を追加して：<content> / add a note: … makes a new record (no item added to a result)
    const create = (verb === "create" && !addsItems(pf)) || NEW_RECORD.test(pf);
    const kindChange = !!kind && !!prev.kind && kind !== prev.kind && (kind !== "contact" || contactInfoAsked(pf));
    const statement = this.isStatement(pf);
    const question = isQuestion(pf);
    const topicTurn = hasAny(pf, TOPIC_TURN) || /^(あと|それから|还有|再就是|and also|also)/u.test(pf.trim());
    const fresh = topicTurn && (kindChange || write || (!!time && !sameWin(time, prev.time)));
    const newPeople = people.specific.some((p) => !(prev.people ?? []).includes(p));
    const residual = this.residualContent(pf);
    const filter = !!this.placeIn(pf) || people.hits.length > 0 || !!statusIn(pf) || topicIn(pf, people.hits.map((x) => x.said)).length > 0 || !!time || residual.length > 0;
    const object = people.hits.length > 0 || !!this.placeIn(pf) || this.pronounOnly(pf) || this.namesRecord(pf) || residual.length > 0 || this.mySideAsked(pf);
    const contrast = hasAny(pf, L.CORRECT_MARKERS) || fre(/^(いや|いいえ|ううん|no\b|nope|不[，,、 ]|不不|错|違)/u).test(pf.trim()) || fre(/不是|じゃなく|ではなく|\bnot\b/u).test(pf);
    return {
      time, sameTime: !!time && sameWin(time, prev.time), subWindow: !!time && !!prev.time && time.from >= prev.time.from && time.to <= prev.time.to,
      write, create, kindChange, statement, question, fresh, newPeople, filter, object, contrast, content: residual.length > 0 || filter || !!kind,
      topicTurn, prevRead: (prev.verb ?? "read") === "read", timeAnaphor: !!tp.anaphor || !!tp.relative,
      wh: /什么|啥|哪|几|多少|谁|怎么|何|いつ|どこ|どれ|どの|誰|\b(what|when|where|which|who|how)\b/u.test(pf), only: hasAny(pf, L.ONLY_MARKERS),
    };
  }

  /** A capitalised Latin word of the message that is no known person, place, kind or common word. */
  unknownProperNoun(): boolean {
    const toks = this.message.match(/\b[A-Z][a-z]{2,}\b/g) ?? [];
    const known = peopleOf(this.ix, this.tf).hits.map((h) => h.said);
    return toks.some((t) => { const f = fold(t); return !EN_STOP.includes(f) && !EN_FOLLOW_STOP.includes(f) && !PROPER_STOP.includes(f) && !known.some((k) => k.includes(f)) && !PLACE_WORDS.includes(f) && !kindIn(f) && !parseTime(f, this.today).win; });
  }

  /** Content words of a follow-up that are not times, kinds, markers, pointers or function words (an unknown name, a topic). */
  residualContent(pf: string): string[] {
    const t = stripWords(this.stripFunction(this.maskPeople(pf)), [...FOLLOW_WORDS, ...L.ONLY_MARKERS, ...L.ADJUST_ADD, ...L.ADJUST_REMOVE, ...L.REPEAT_MARKERS, ...L.REPEAT_TRIGGERS, ...L.DISPLAY_VERBS, ...L.CORRECT_MARKERS, ...L.QUESTION_MARKERS, ...L.THIS_TIME, ...L.ACK_ONLY, ...TOPIC_TURN]);
    return chunks(t).map((c) => c.replace(/[■]+/gu, "")).filter((c) => (/^[a-z][a-z0-9-]{2,}$/.test(c) && !EN_STOP.includes(c) && !EN_FOLLOW_STOP.includes(c)) || [...c].filter((x) => isCjk(x) || /[ぁ-ゖー]/u.test(x)).length >= 2 && [...c].some(isCjk));
  }

  private recentMentions(turns: number): string[] {
    const out: string[] = [];
    let seen = 0;
    for (let i = this.e.turns.length - 1; i >= 0 && seen < turns; i--) {
      const t = this.e.turns[i];
      if (t.filler) continue;
      seen++;
      out.push(...t.mentions);
    }
    return out;
  }

  ownFollowUp(pf: string): { cls: FollowUpClass; strong: boolean } {
    const prev = this.e.prevRequest();
    if (!prev) {
      // "show me again" after a list or a change, even when no read request was answered
      const shown = this.e.turns.some((t) => t.role === "agent" && (t.listed.length || t.done.length || t.mentions.length));
      if (shown && (hasAny(pf, L.REPEAT_MARKERS) || (hasAny(pf, L.REPEAT_TRIGGERS) && hasAny(pf, L.DISPLAY_VERBS)))) return { cls: "repeat", strong: true };
      return { cls: "new", strong: true };
    }
    const masked = this.maskPeople(pf);
    const tp = parseTime(masked, this.today, prev.time);
    const people = peopleOf(this.ix, pf);
    const kind = kindIn(pf);
    const sh = this.shape(pf, prev);
    const write = sh.write;
    const statement = sh.statement;
    const trimmed = pf.trim();
    // a contrast: a correction marker, a leading "no", or "not X — Y" / "不是X，是Y" / "XじゃなくてY"
    const notThenY = /\bnot\b[^,，—–\-:;]{1,40}[,，—–\-:;]\s*\S/u.test(pf) || /不是.{1,20}[，,、 ]\s*(是|而是|我要|要)/u.test(pf) || /(じゃなくて|ではなくて?|じゃなく)/u.test(pf);
    // a correction replaces part of the previous request: a contrast frame, a leading "no" or an explicit "I got it
    // wrong / I meant" is enough; the weak markers (のこと / isn't / 应该是 / bare 不是) only for a statement that stays
    // with the previous kind and opens no other topic
    const strongCorrect = notThenY || !!contrastSides(pf) || /^(いや|いいえ|ううん|no[,，. ]|nope|不不|错了|不对)/u.test(trimmed) || hasAny(pf, STRONG_CORRECT);
    const weakCorrect = hasAny(pf, L.CORRECT_MARKERS) && !sh.kindChange && !isQuestion(pf) && !hasAny(pf, TOPIC_TURN);
    if ((strongCorrect || weakCorrect) && !hasAny(pf, L.DEFER_MARKERS) && !/不是很|是不是|じゃないかな|not (yet|done|finished|sure)/u.test(pf)) {
      if (people.hits.length || kind || tp.win || this.placeIn(pf) || /这篇|那篇|那个|that|this/u.test(pf) || pf.length > 4) return { cls: "correct", strong: true };
    }
    const repeatWord = hasAny(pf, L.REPEAT_MARKERS) || (hasAny(pf, L.REPEAT_TRIGGERS) && hasAny(pf, L.DISPLAY_VERBS));
    const newNamed = people.named.filter((p) => !(prev.people ?? []).includes(p));
    if (repeatWord && (!tp.win || sameWin(tp.win, prev.time)) && !/再加|再建|再给.*建|再往后|再来周/u.test(pf) && !write && !newNamed.length && !(sh.kindChange)) return { cls: "repeat", strong: true };
    // adding / dropping items or a category of items (the category may be another kind: private events next to platform ones)
    const onlyWords = ["只", "留", "だけ", "only"].map(fold);
    if (addsItems(pf) && !sh.create && !statement && !/只/u.test(pf) && !people.named.length) return { cls: "adjust", strong: true };
    if ((hasAny(pf, L.ADJUST_REMOVE) || /把.{1,12}(去了|删了|拿了)/u.test(pf)) && (!kind || kind === prev.kind) && !hasAny(pf, onlyWords)) return { cls: "adjust", strong: true };
    // a filter on the result: only / just / だけ, or "<filter>的就行 / のでいい / those with … will do"
    const enough = /的(那些|那几[条个场篇位])?(就行|就好|就可以|即可|就够了|足够)|の(だけ|のみ)|(のでいい|のでok|ので十分)|\b(ones|those) (only|will do)\b/u.test(pf);
    const onlyHere = hasAny(pf.replace(/だけど|だけれど|だけじゃ/gu, ""), L.ONLY_MARKERS) || enough;
    if (onlyHere && !write && !statement && !(tp.win && !sameWin(tp.win, prev.time) && !this.isSubWindow(tp.win, prev.time) && !thisTimeOnly(pf))) return { cls: "refine", strong: true };
    if (onlyHere && thisTimeOnly(pf) && !write) return { cls: "refine", strong: true };
    const followMark = /^(那(?![个条篇场位件份些天边次里儿种家张项])|那么|那就|要是|如果|换成|换(?=\S)|じゃあ|じゃ|では|それなら|それじゃ|なら|and |and,|ok, and|ok,? and|what about|how about|same for|and for|好[。，,]?那)/u.test(trimmed)
      || fre(/(呢|は|なら|だったら|の場合は?|怎么样|如何|then|instead)[？?]?\s*$/u).test(trimmed) || fre(/what about|how about|same for|and the |and next|だとどう|だと|はどう|どうなって|换成|換成|改成看|呢$/u).test(pf);
    const backRef = fre(/前面问的|刚才问的|昨天问的|之前问的|昨日聞いた|さっき聞いた|さっきの.*の話|前に聞いた|换成|再查|same question|同じ質問|同样的问题/u).test(pf);
    const sameKind = !kind || kind === prev.kind || (kind === "contact" && !contactInfoAsked(pf));
    const newPeople = people.specific.filter((p) => !(prev.people ?? []).includes(p));
    // after an idle break an elliptical period swap needs a framing word or a back reference; a full request is new
    const cameBack = this.e.idleBreakAt(this.e.turns.length - 1, this.at) === this.e.turns.length;
    if ((tp.win || tp.relative) && !write && !statement && sameKind && !tp.anaphor) {
      // without a framing word only a bare period (nothing else of its own) is a swap
      const bare = !this.residualContent(pf).some((w) => !TIMEISH.test(w) && !kindIn(w)) && !isQuestionAbout(pf);
      if (!sameWin(tp.win, prev.time) && (followMark || backRef || (!cameBack && bare && (pf.length <= PARAMS.shortFollowUpChars || !kind)))) {
        if (!newPeople.length || backRef || this.pronounOnly(pf)) return { cls: "swap_period", strong: followMark || backRef };
      }
    }
    const listKind = kind === "contact" && !contactInfoAsked(pf) ? undefined : kind;
    const recentList = this.recentMentions(PARAMS.followListTurns);
    const outsider = this.namesOutsider(pf, recentList);
    if (recentList.length && !outsider && !statement && !this.namesUnlisted(pf, recentList) && (hasAny(pf, L.LIST_POINTERS) || (!!listOrdinal(pf) && !write)) && isQuestion(pf) && (!listKind || listKind === prev.kind)) return { cls: "follow_list", strong: false };
    if ((followMark || backRef) && !write && !statement && !tp.win) {
      const object = people.hits.length > 0 || !!this.placeIn(pf) || this.pronounOnly(pf) || this.namesRecord(pf) || this.residualContent(pf).length > 0 || this.mySideAsked(pf);
      if (object && sameKind && !this.asksOtherContent(pf, prev)) return { cls: "ask_again_about", strong: false };
    }
    // a question about the list just shown (which of these / the second one / where is X from the list)
    const lt = this.e.turns.length - 1;
    const recent = this.recentMentions(PARAMS.followListTurns);
    if (recent.length && !outsider && !statement && !this.namesUnlisted(pf, recent) && hasAny(pf, L.LIST_POINTERS) && isQuestion(pf) && (!kind || kind === prev.kind)) return { cls: "follow_list", strong: false };
    if (recent.length && !outsider && !write && !statement && !this.namesUnlisted(pf, recent)) {
      if (hasAny(pf, L.LIST_POINTERS) && !kind) return { cls: "follow_list", strong: false };
      if (hasAny(pf, L.LIST_POINTERS) && kind && kind === prev.kind) return { cls: "follow_list", strong: false };
      const ord = listOrdinal(pf);
      if (ord && isQuestion(pf)) return { cls: "follow_list", strong: false };
      if (!kind && !tp.win && isQuestion(pf) && this.namesListedItem(pf, recent)) return { cls: "follow_list", strong: false };
      if (!kind && !tp.win && fre(/^(在哪|几点|哪天|どこ|何時|いつ|where|when)/u).test(pf.trim()) && lt >= 0) return { cls: "follow_list", strong: false };
    }
    return { cls: "new", strong: false };
  }

  /**
   * Besides a person, the message names content (a noun that is no kind, time or marker) that neither the previous
   * request nor the records shown for it contain: it asks about another thing of that person, not the same question.
   */
  asksOtherContent(pf: string, prev: Slots): boolean {
    if (!peopleOf(this.ix, pf).hits.length) return false;
    if (hasAny(pf, CONTINUE_WORDS)) return false;
    const rest = this.residualContent(pf).filter((w) => !kindIn(w) && !TIMEISH.test(w));
    if (!rest.length) return false;
    const shown: string[] = [...(prev.topic ?? []).map(squash)];
    for (let i = this.e.turns.length - 1; i >= 0; i--) {
      const t = this.e.turns[i];
      if (t.role !== "agent") continue;
      for (const id of t.mentions) { const r = this.ix.recs.get(id); if (r && r.kind !== "contact") shown.push(r.text); }
      if (t.answered) break;
    }
    return rest.some((w) => { const q = squash(w); return !shown.some((x) => x.includes(q) || (q.length >= 3 && commonRun(q, x) >= 2)); });
  }
  /** The message names a person who is none of the recent mentions and linked to none of them (a question about someone else). */
  /** r07: "my side / where I am" (私の方は / 我那边呢 / where I'll be) while a fact says where the user is: the user is the object. */
  mySideAsked(pf: string): boolean {
    return MY_SIDE.test(pf.trim()) && this.e.facts.some((x) => x.who === "me" && !!x.place);
  }
  private namesOutsider(pf: string, recent: string[]): boolean {
    const named = peopleOf(this.ix, pf).named;
    return named.some((p) => !recent.includes(p) && !recent.some((id) => this.ix.recs.get(id)?.contactIds.includes(p)));
  }
  private isSubWindow(w: TimeWindow, prev?: TimeWindow) {
    return !!prev && w.from >= prev.from && w.to <= prev.to;
  }
  private pronounOnly(pf: string) {
    return hasAny(pf, [...L.PERSON_PRONOUN_F, ...L.PERSON_PRONOUN_M]);
  }
  private namesListedItem(pf: string, ids: string[]): boolean {
    const p = squash(this.stripFunction(pf));
    return ids.some((id) => {
      const r = this.ix.recs.get(id);
      if (!r || r.kind === "contact") return false;
      return contentRun(p, r.titleF) >= 2 || chunks(pf).some((c) => /^[a-z]{3,}$/.test(c) && r.titleF.includes(c));
    });
  }
  private namesRecord(pf: string): boolean {
    return /那篇|那场|那条|のほう|の方|那次/u.test(pf) && squash(this.stripFunction(pf)).length >= 2;
  }

  // -------------------------------------------------------------- reference words (no hint)

  refWords(quote: string, pf: string, hp?: HintPart): string[] {
    const hr = (hp?.refs ?? []).map((r) => r.said).filter((s) => s && quote.includes(s));
    // r09: a span starts at the first word of the reference and ends at its last (function words on either end go)
    const picks = this.exactPicks(quote).map((p) => p.said);
    const trim = (xs: string[]) => uniq(xs.map((x) => (x === this.keepSaid || picks.includes(x) ? x : trimRefSpan(this.ix, x))));
    if (hp?.refs?.length && hr.length) return trim(this.reconcileHintSaids(quote, uniq(hr)));
    return trim(spotRefs(this, quote));
  }

  /**
   * r08: a model often reports only part of a reference: the owner of a record pointer as a person of its own
   * (<person> + 那条 / のメモ / 's notes → "<person>"), a pointer split from its owner ("<person>", "那条"), or a title
   * without its pointer word. A hint said that is a strict part of a reference this message itself shows is widened to
   * that reference (the owner part never stands in for the record); a said wholly inside another said is dropped.
   */
  private reconcileHintSaids(quote: string, hr: string[]): string[] {
    const own = spotRefs(this, quote).filter((s) => quote.includes(s));
    const out: string[] = [];
    // a lone 那 / 这 is the frame of a follow-up (那<kind>呢), no reference, unless the message's own reading has one there
    hr = hr.filter((s) => s === this.keepSaid || !/^\s*[那这]\s*$/u.test(s) || own.some((o) => o.includes(s.trim())));
    for (const s of hr) {
      if (s === this.keepSaid) { out.push(s); continue; }
      // a person said is widened only over a record pointer after it (<person>那条 / のメモ), never over a person
      // pointer (<person>のほう / 那位: still the person)
      const person = peopleOf(this.ix, fold(s)).hits.length > 0 || !!pronounOf(fold(s));
      // pointer (<person>のほう / 那位: still the person) unless the message's own reading of the wider words binds one
      // record (<person>の方 + a copy marker after a change: that person's record of the change's kind)
      const recordOf = (o: string) => { const r = this.ownResolve(o, fold(quote)); return r.outcome === "bound" && !!r.id && kindOfId(r.id) !== "contact"; };
      const wider = own.filter((o) => o.length > s.length && o.includes(s) && (!person || RECORD_TAIL.test(fold(o.slice(o.indexOf(s) + s.length))) || recordOf(o)))
        .sort((a, b) => b.length - a.length)[0];
      out.push(wider ?? s);
    }
    // a position in a list (the second …) the model left out while it reported the list's owner as a person of its own
    // (the second thing on <person>'s list → "<person>"): the position is the reference, the owner only says whose list
    const ords = own.filter((o) => L.ordinalOf(fold(o)) && !out.some((s) => s.includes(o) || o.includes(s)));
    if (ords.length) {
      const owner = (s: string) => {
        const sf = fold(s);
        if (!peopleOf(this.ix, sf).hits.length || L.ordinalOf(sf) || pronounOf(sf)) return false;
        const i = quote.indexOf(s);
        return /^\s*(?:'s|’s|的|の|さんの)/u.test(quote.slice(i + s.length));
      };
      const before = out.length;
      for (let k = out.length - 1; k >= 0; k--) if (owner(out[k]) && out[k] !== this.keepSaid) out.splice(k, 1);
      if (out.length < before) out.push(...ords);
    }
    // a record pointer with a kind word of its own (<title words>のタスク / 那条<x>待办) the model did not report at all
    // is still a reference of the message (it may point at nothing the account has)
    const at = (s: string) => { const i = quote.indexOf(s); return [i, i + s.length] as const; };
    for (const o of own) {
      const k = kindIn(fold(o));
      if (!k || k === "contact" || pronounOf(fold(o)) || out.some((s) => { const [a, b] = at(s), [c, d] = at(o); return a < d && c < b; })) continue;
      out.push(o);
    }
    const u = uniq(out);
    // a said that overlaps a widened one in the message (the pointer half the model split off) goes with it
    const span = (s: string) => { const i = quote.indexOf(s); return [i, i + s.length] as const; };
    const widened = new Set(out.filter((s) => !hr.includes(s)));
    return u.filter((s) => s === this.keepSaid || !u.some((o) => o !== s && (o.includes(s) || (widened.has(o) && !widened.has(s) && span(o)[0] < span(s)[1] && span(s)[0] < span(o)[1]))));
  }

  // -------------------------------------------------------------- references

  resolve(said: string, pf: string, hp?: HintPart): RefResult {
    const own = this.ownResolve(said, pf);
    const h = hp?.refs?.find((r) => r.said === said || said.includes(r.said) || r.said.includes(said));
    const hid = h?.id ?? null;
    if (!hid || own.outcome !== "ask" || (own.candidates ?? []).length < 2 || this.afterIdle()) return own;
    // the hint binds one of the candidates: follow it only when the sentence's content also points at that one
    if (!(own.candidates ?? []).includes(hid) || !this.vis(hid)) return own;
    if (this.contentFavours(hid, own.candidates!, pf)) return { said, outcome: "bound", id: hid };
    return own;
  }

  private contentFavours(id: string, cands: string[], pf: string): boolean {
    const words = this.contentWords(pf);
    if (!words.length) return false;
    const fits = (cid: string) => {
      const segs = this.segmentsAbout(cid);
      const recs = this.linkedMentionTexts(cid);
      return words.some((w) => segs.some((s) => s.includes(w)) || recs.some((s) => s.includes(w)));
    };
    return fits(id) && cands.filter((c) => c !== id).every((c) => !fits(c));
  }
  private contentWords(pf: string): string[] {
    const t = this.stripFunction(this.maskPeople(pf));
    const out: string[] = [];
    for (const c of chunks(t)) {
      if (/^[a-z][a-z0-9]{1,}$/.test(c) && !EN_STOP.includes(c)) out.push(c);
      else if ([...c].filter(isCjk).length >= 2) {
        for (let k = 0; k + 2 <= c.length; k++) { const bi = c.slice(k, k + 2); if ([...bi].every(isCjk) && !FUNCTION_SUBSTR.includes(bi)) out.push(bi); }
      }
    }
    return uniq(out);
  }
  private segmentsAbout(cid: string): string[] {
    const forms = this.ix.forms.filter((f) => f.ids.includes(cid) && f.how !== "company").map((f) => f.text.replace(/\s+/g, ""));
    const out: string[] = [];
    for (const t of this.e.turns) {
      if (!t.mentions.includes(cid)) continue;
      for (const seg of t.tf.split(/[，,。；;、]/u)) if (forms.some((f) => squash(seg).includes(f))) out.push(squash(seg));
    }
    return out;
  }
  private linkedMentionTexts(cid: string): string[] {
    const out: string[] = [];
    for (const t of this.e.turns) for (const id of t.mentions) {
      const r = this.ix.recs.get(id);
      if (r && r.kind !== "contact" && r.contactIds.includes(cid)) out.push(r.text);
    }
    return out;
  }

  /** Mentions of earlier turns, newest turn first: [{turn, ids}] (the current sentence's own picks first). */
  private turnMentions(): { turn: number; ids: string[]; listed: string[] }[] {
    const out: { turn: number; ids: string[]; listed: string[] }[] = [];
    if (this.sentence.length) out.push({ turn: this.e.turns.length, ids: [...this.sentence], listed: [] });
    for (let i = this.e.turns.length - 1; i >= 0; i--) {
      const t = this.e.turns[i];
      const ids = t.mentions.length ? t.mentions : (t.asks?.options ?? []).map((o) => o.id).filter((id) => kindOfId(id) === "contact");
      if (ids.length) out.push({ turn: i, ids, listed: t.listed });
    }
    return out;
  }

  /** Is the reference in the stretch after an idle break where nothing new was mentioned yet (R2)? */
  private afterIdle(): boolean {
    const b = this.e.idleBreakAt(this.e.turns.length - 1, this.at);
    if (b < 0) return false;
    if (b === this.e.turns.length) return !this.sentence.length;
    for (let k = b; k < this.e.turns.length; k++) if (this.e.turns[k].mentions.length) return false;
    return !this.sentence.length;
  }

  ownResolve(said: string, pf: string): RefResult {
    const sf = fold(said);
    const none: RefResult = { said, outcome: "none" };
    const ask = (ids: string[]) => {
      const c = uniq(ids).filter(this.vis).slice(0, PARAMS.maxCandidates);
      return c.length ? { said, outcome: "ask" as const, candidates: c } : none;
    };
    const bind = (id: string) => (this.vis(id) ? { said, outcome: "bound" as const, id } : none);
    const pointerKinds = kindsOfPointer(sf);
    const ord = L.ordinalOf(sf);
    const pron = pronounOf(sf);
    const people = peopleOf(this.ix, sf);
    const nameHits = people.hits.filter((h) => h.how !== "role" || people.hits.length === 1);
    // the ordinal itself (第二个 / 2番目 / the second) is no content word
    // a well-known place in Latin letters or kana is compared in its CJK spelling (Kyoto → 京都)
    // r06: the word as written stays a content word too (a Latin place word may be part of a Latin title: <City> Ceramics)
    const content = uniq(this.contentOfSaid(ord ? sf.slice(0, ord.at[0]) + " " + sf.slice(ord.at[1]) : sf, people.hits.map((h) => h.said)).flatMap((w) => { const c = LATIN_PLACE[w] ?? (w.length >= 3 ? LATIN_PLACE[romaji(w)] : undefined); return c && c !== w ? [w, c] : [w]; }));
    const idle = this.afterIdle();
    const anchored = hasAny(pf, L.ANCHOR_WORDS) || nameHits.length > 0 || content.length > 0;
    const tms = this.turnMentions();

    // ---- r10 (R43): "the <event> I went to last time" is a lookup in the attendance records, not a pointer back
    if (WENT_LAST.test(pf) && (kindIn(sf) === "event" || pointerKinds?.includes("event") || (!pointerKinds && kindIn(pf) === "event"))) {
      const nouns = (L.KIND_WORDS.find(([k]) => k === "event")?.[1] ?? []).filter((w) => !GENERIC_EVENT.includes(w) && containsTerm(sf, w));
      const went = this.ix.world.attendance.filter((a) => a.account === this.ix.account && a.went).map((a) => a.eventId).filter(this.vis);
      const ev = (id: string) => [...this.ix.world.platformEvents, ...this.ix.world.privateEvents].find((x) => x.id === id);
      const fits = went.filter((id) => {
        const r = this.ix.recs.get(id);
        const e = ev(id);
        if (!r || !e || Date.parse(e.startsAt) > Date.parse(this.at)) return false;
        return !nouns.length || nouns.some((w) => r.titleF.includes(w) || [...conceptsOf(w)].some((c) => conceptsOf(r.titleF).has(c)));
      }).sort((a, b) => Date.parse(ev(b)!.startsAt) - Date.parse(ev(a)!.startsAt));
      if (fits.length) return bind(fits[0]);
    }

    // ---- r07: "the other one": the item of the list shown last that the talk has not acted on or named since
    // r08: a bare もう一つ (one more / the other one) is "the other one" only when the message creates nothing
    const otherBare = /^もう(?:一|1|ひと)つ$/u.test(squash(sf)) && verbIn(pf) !== "create";
    if ((hasAny(sf, L.OTHER_WORDS) || otherBare) && !ord) {
      const kinds = pointerKinds && !pointerKinds.includes("contact") ? pointerKinds : null;
      const li = this.e.lastListTurn(kinds);
      if (li < 0) return none;
      const items = this.e.turns[li].listed.filter((id) => !kinds || kinds.includes(kindOfId(id)!));
      const since = new Set<string>();
      for (let k = li + 1; k < this.e.turns.length; k++) { const t = this.e.turns[k]; for (const id of [...t.mentions, ...t.done.map((d) => d.target ?? "")]) since.add(id); }
      let rest = items.filter((id) => !since.has(id) && this.vis(id));
      const words = content.filter((w) => !hasAny(w, L.OTHER_WORDS));
      if (words.length) {
        let fit = rest.filter((id) => words.some((w) => (this.ix.recs.get(id)?.titleF ?? "").includes(w)));
        // r08: the words in another language than the titles: the items whose title has a concept the words name
        if (!fit.length) {
          const cs = [...conceptHits(words.join(" ")).keys()];
          fit = cs.length ? rest.filter((id) => cs.some((c) => conceptsOf(this.ix.recs.get(id)?.titleF ?? "").has(c))) : [];
        }
        if (fit.length) rest = fit;
      }
      if (rest.length === 1 && since.size) return bind(rest[0]);
      return rest.length ? ask(rest) : none;
    }

    // ---- ordinals: position in the list shown
    if (ord) {
      const kinds = ord.kind ? [ord.kind] : pointerKinds;
      if (hasAny(sf, L.BEGINNING) || hasAny(pf, L.BEGINNING)) {
        const first = this.earliestMention(kinds);
        if (first && !this.hasListSince(kinds)) return bind(first);
      }
      const lists = this.listsNewestFirst(kinds, nameHits.flatMap((h) => h.ids));
      if (!lists.length) {
        // no list to count in: "the first one" is the earliest mention of the kind, anything else has nothing to point at
        if (ord.n === 1) { const first = this.earliestMention(kinds); if (first) return bind(first); }
        return none;
      }
      const pickFrom = (list: string[]) => {
        const items = kinds ? list.filter((id) => kinds.includes(kindOfId(id)!)) : list;
        const n = ord.n < 0 ? items.length : ord.n;
        return items[n - 1];
      };
      const list = lists[0];
      const groups = kinds ? null : groupByKind(list);
      if (idle && !anchored) {
        return ask(lists.map((l) => pickFrom(l)).filter(Boolean) as string[]);
      }
      if (groups && groups.size > 1) {
        const opts = [pickFrom(list), ...[...groups.values()].map((g) => g[(ord.n < 0 ? g.length : ord.n) - 1])].filter(Boolean) as string[];
        const u = uniq(opts);
        return u.length === 1 ? bind(u[0]) : ask(u);
      }
      const id = pickFrom(list);
      return id ? bind(id) : none;
    }

    // ---- "the one asked first" without a position
    if ((hasAny(sf, L.BEGINNING) || hasAny(pf, L.BEGINNING)) && !pron) {
      // "the first one" next to a list shown is its first item; "the one we talked about first" is the earliest mention
      const talked = fre(/聊|说的|说过|提到|问的|问过|話した|話して|聞いた|言った|mention|asked|talked|brought up/u).test(pf);
      const lists = talked ? [] : this.listsNewestFirst(pointerKinds, []);
      if (lists.length) {
        const items = pointerKinds ? lists[0].filter((id) => pointerKinds.includes(kindOfId(id)!)) : lists[0];
        if (items[0]) return bind(items[0]);
      }
      const first = this.earliestMention(pointerKinds);
      if (first) return bind(first);
    }

    // ---- r07: a person described by their field (做<field>的那位 / <field>の方 / the <field> guy): among the people of the
    // latest turn, the one whose stored title / company / industry has that field (R7); ask when not exactly one
    const descr = /^(.{1,10}?)(?:的那位|的那个人|的那个|那位|的人|の方|の人|のかた|のほう|の窓口|的窗口|的对接人|的联系人|那边的人|の担当者?|の担当の方)$/u.exec(sf);
    // r07: a person of a company (<company>の方 / <company>那位 / the one at <company>): the company's people, those talked about first
    if (descr) {
      const ch = peopleOf(this.ix, descr[1]).hits;
      if (ch.length === 1 && ch[0].how === "company" && ch[0].said.length >= descr[1].length - 1) {
        const ids = ch[0].ids.filter(this.vis);
        const fact = this.companyFact(ch[0].ids);
        if (fact && ids.includes(fact)) return bind(fact);
        const talked = this.orderByRecency(ids.filter((id) => this.e.turns.some((t) => t.mentions.includes(id))));
        // one person of that company: that one; several: ask, the ones talked about first (never decided by recency)
        return ids.length === 1 ? bind(ids[0]) : ask(uniq([...talked, ...ids]));
      }
    }
    if (descr && !nameHits.length && [...conceptsOf(descr[1])].some((k) => FIELD_CONCEPTS.has(k))) {
      const pr = this.pronounPerson("any", idle);
      const cands = pr.outcome === "bound" && pr.id ? [pr.id] : pr.candidates ?? [];
      if (cands.length) {
        const fit = cands.filter((id) => this.ownDetailsFit(id, descr[1]));
        if (!idle && fit.length === 1 && cands.every((id) => id === fit[0] || this.hasDetails(id))) return bind(fit[0]);
        return ask(fit.length ? fit : cands);
      }
    }

    // ---- a person pronoun (她 / 彼 / him), possibly with a record pointer (他那条 / 彼のやつ)
    if (pron && !nameHits.length) {
      let pr = this.pronounPerson(pron, idle);
      if (pr.outcome === "ask" && !idle && pr.candidates) {
        // the sentence's content fits only one of them (她要的 PRD 反馈 ↔ the one following the PRD): R1
        const fav = pr.candidates.filter((c) => this.contentFits(c, pf));
        if (fav.length === 1 && this.turnPeopleFit(fav[0], pf)) pr = { said, outcome: "bound", id: fav[0] };
      }
      const recordish = pointerKinds && !pointerKinds.includes("contact") || /那条|这条|那篇|那份|のやつ|のたすく|のめも|那件/u.test(sf);
      if (!recordish || pr.outcome !== "bound") return { ...pr, said };
      let linked = this.mentionsWhere((r) => r.kind !== "contact" && r.contactIds.includes(pr.id!) && (!pointerKinds || pointerKinds.includes(r.kind)));
      if (!linked.length) return none;
      const pk = kindIn(pf);
      if (!pointerKinds && pk && pk !== "contact") { const k = linked.filter((id) => kindOfId(id) === pk); if (k.length) linked = k; }
      return this.byLatestTurn(linked, said);
    }

    // ---- a name (and maybe what of theirs): <name>那条 / <name>さんの方 / 律师那条 / a bare surname
    if (nameHits.length || content.length) {
      const groupIds = people.groups.filter((g) => g.ids.length).map((g) => g.ids);
      const pset = uniq(groupIds.length ? groupIds.flat() : nameHits.flatMap((h) => h.ids));
      const wantsContact = !!pointerKinds?.includes("contact") && pointerKinds.length === 1;
      const lead = /^(那个|这个|那位|这位)/u.exec(sf)?.[0] ?? "";
      const rest = nameHits.reduce((acc, h) => acc.split(h.said).join(""), sf.slice(lead.length));
      const isPlainName = nameHits.length > 0 && !content.length && !pointerKinds && !/的那|那条|那个|那篇|那场|のほう|の方|のやつ|の件|のたすく|のめも|one|'s|那边的/u.test(rest);
      if (wantsContact || isPlainName) {
        if (!pset.length) return none;
        for (const h of people.hits) {
          const p = h.how === "company" ? this.companyFact(h.ids) : undefined;
          if (p && pset.includes(p) && this.vis(p)) return bind(p);
        }
        const al = this.aliasHit(sf);
        if (al && this.vis(al.id)) return bind(al.id);
        let live = pset.filter(this.vis);
        if (live.length === 1) return bind(live[0]);
        // R17: a gendered title (Mr. / 先生 in Chinese; Ms. / 女士 …) narrows the people this name fits like 他 / 她
        let sex = people.hits.find((h) => h.sex)?.sex;
        if (sex === "m" && !/\b(mr|mister|sir)\b/.test(sf) && /[぀-ゟ]/u.test(pf)) sex = undefined;
        const g = (id: string) => this.ix.gender(id);
        if (sex === "m") {
          const m = live.filter((id) => g(id) !== "female");
          if (m.length === 1 && g(m[0]) === "male") return bind(m[0]);
        } else if (sex === "f") {
          const f = live.filter((id) => g(id) !== "male");
          if (!f.length) return none;
          if (f.length === 1 && g(f[0]) === "female") return bind(f[0]);
          live = f;
        }
        // R15: tone marks (Lǐ Míng) tell apart names of the same toneless spelling; a candidate whose tones are not
        // known stays (no decision from missing evidence)
        if (live.length > 1) {
          const tones = this.toneMarksFor(said, sf);
          if (tones) {
            const keep = live.filter((id) => this.toneFits(id, tones) !== false);
            // r06: bind only a candidate whose tones are known and fit (one left over because the others' tones
            // misfit is no evidence for it when its own tones are unknown)
            if (keep.length === 1 && this.toneFits(keep[0], tones) === true) return bind(keep[0]);
            if (keep.length) live = keep;
          }
        }
        // R1: what the sentence says fits the stored details (title / company / industry) of only one of them
        if (live.length > 1) {
          const fav = live.filter((id) => this.ownDetailsFit(id, pf));
          // r06: the others must have stored details too (a candidate with no title / company might be the one)
          if (fav.length === 1 && live.every((id) => id === fav[0] || this.hasDetails(id))) return bind(fav[0]);
        }
        return ask(this.orderByRecency(live));
      }
      let kinds = pointerKinds?.filter((k) => k !== "contact") ?? null;
      // r08: "what about the <name> one" / 那 <name> 的呢 / じゃあ <name> のは: a pointer without a kind of its own in a
      // "same question, other object" follow-up is of the kind the previous request asked for
      // (a copy of the latest change — <name>のも + same day — is of that change's kind)
      const lastTask = [...this.e.tasks].filter((t) => t.status !== "cancelled").sort((a, b) => b.seen - a.seen)[0];
      const copyKind = hasAny(pf, L.COPY_MARKERS) || hasAny(pf, L.SAME_DAY) ? lastTask?.slots.kind ?? (lastTask?.target ? kindOfId(lastTask.target) : undefined) : undefined;
      const prevKind = FOLLOW_ABOUT.test(pf) ? this.e.prevRequest()?.kind : copyKind;
      if (!kinds && prevKind && prevKind !== "contact" && !isPlainName && GENERIC_ONE.test(sf)) kinds = [prevKind];
      const cands = this.allMentions().filter((id) => {
        const r = this.ix.recs.get(id);
        return r && r.kind !== "contact" && (!kinds || kinds.length === 0 || kinds.includes(r.kind));
      });
      const scored = cands.map((id) => {
        const r = this.ix.recs.get(id)!;
        const person = pset.length ? (r.contactIds.some((c) => pset.includes(c)) || nameHits.some((h) => r.titleF.includes(h.said.replace(/\s+/g, ""))) ? 1 : 0) : 0;
        // every content word counts; a word found in the title counts double (<place>那个论坛 / <company> 那篇)
        const fitW: string[] = [];
        const runs = content.map((w) => { const t = contentRun(w, r.titleF); const x = contentRun(w, r.text); const m = (/^[a-z0-9 ]+$/.test(w) ? w.length : 2); if (t >= m || x >= m) fitW.push(`${w}:${Math.max(t, x)}`); return (t >= m ? 2 * t : 0) + (x >= m ? x : 0); });
        const sc = conceptHits(sf);
        const conceptScore = sc.size ? [...sc.keys()].filter((c) => conceptsOf(r.titleF).has(c)).length * 4 + [...sc.keys()].filter((c) => !conceptsOf(r.titleF).has(c) && conceptsOf(r.text).has(c)).length * 2 : 0;
        const cs = runs.reduce((a, b) => a + b, 0) + conceptScore;
        for (const c of sc.keys()) if (conceptsOf(r.text).has(c) || conceptsOf(r.titleF).has(c)) fitW.push(`concept:${c}`);
        return { id, person, cs, fitW };
      });
      let keep = scored;
      if (pset.length) keep = keep.filter((s) => s.person);
      // r07: a company named for the person (<company> 那篇) that only one of that person's records itself mentions
      const coWords = people.hits.filter((h) => h.how === "company").map((h) => h.said.replace(/\s+/g, ""));
      if (keep.length > 1 && coWords.length) {
        const own = keep.filter((x) => { const t = this.ownText(x.id); return coWords.some((w) => t.includes(w)); });
        if (own.length === 1) keep = own;
      }
      if (content.length) {
        const minRun = (w: string) => (/^[a-z0-9 ]+$/.test(w) ? w.length : Math.min(2, w.length));
        const ok = keep.filter((s) => content.some((w) => s.cs >= minRun(w)));
        void minRun;
        if (ok.length || !pset.length) keep = ok;
        const best = Math.max(0, ...keep.map((s) => s.cs));
        // r06: several fit — one of them is chosen only when it alone has some piece of what was said (a word, or a longer
        // run of one, or a concept no other candidate has); a higher score alone decides nothing
        if (keep.length > 1 && best >= 3) {
          const own = keep.filter((s) => s.fitW.some((f) => !keep.some((o) => o !== s && o.fitW.includes(f))));
          if (own.length === 1) keep = own;
        }
      }
      if (!keep.length && (content.length || pset.length)) {
        // nothing in the conversation fits: a record of the account named by its person and / or title (<title>挪到… / <name>那条<title words>)
        let world = [...this.ix.recs.values()].filter((r) => r.kind !== "contact" && (!kinds || !kinds.length || kinds.includes(r.kind)) && this.vis(r.id));
        if (pset.length) {
          world = world.filter((r) => r.contactIds.some((c) => pset.includes(c)));
          if (content.length) {
            const sc = world.map((r) => Math.max(...content.map((w) => contentRun(w, r.titleF))));
            const best = Math.max(0, ...sc);
            if (best >= 2) world = world.filter((_, k) => sc[k] === best);
            else {
              // r08: the words in another language than the title (a loanword for a Chinese title): the concepts the
              // reference names; the record(s) with the most of them, none when no record has one
              const said = conceptHits(sf);
              const cc = world.map((r) => [...said.keys()].filter((c) => conceptsOf(r.titleF).has(c)).length);
              const top = Math.max(0, ...cc);
              world = top >= 1 ? world.filter((_, k) => cc[k] === top) : [];
            }
          } else if (isPlainName) world = [];
          // r07: the company word itself in one record of that person (<company> 那篇)
          if (world.length > 1 && coWords.length) {
            const own = world.filter((r) => { const t = this.ownText(r.id); return coWords.some((w) => t.includes(w)); });
            if (own.length === 1) world = own;
          }
        } else {
          // r10: or most of the title said, in pieces (<words>の<words> for a title written in one run)
          const all = world;
          world = world.filter((r) => content.some((w) => (/^[a-z]{4,}$/.test(w) ? containsTerm(fold(r.title), w) : w.length >= 2 && r.titleF.includes(w) && w.length * 2 >= r.titleF.length)) || this.titleCovered(r, sf));
          // r10 (R43): a pointer with a content word (<word>那条 / <word>のタスク / the <word> one) that only part of titles have:
          // the records whose title has it — one with a word of 3+ characters binds, otherwise the user is asked
          // r10: a counter of another kind (<event title>那条): the one record of any kind whose title the words cover
          if (!world.length && kinds?.length) {
            const any = [...this.ix.recs.values()].filter((r) => r.kind !== "contact" && this.vis(r.id) && this.titleCovered(r, sf));
            if (any.length === 1) return bind(any[0].id);
          }
          const v = verbIn(pf);
          if (!world.length && (v === "update" || v === "complete" || v === "delete") && (POINTER_TAIL.test(sf) || !!kinds?.length)) {
            const words = content.filter((w) => /^[a-z]{4,}$/.test(w) || [...w].filter(isCjk).length >= 2);
            // every content word of the reference is in the title (a description with more words names something else)
            let loose = words.length ? all.filter((r) => words.every((w) => (/^[a-z]/.test(w) ? containsTerm(fold(r.title), w) : r.titleF.includes(w)))) : [];
            if (v === "update" || v === "complete") { const open = loose.filter((r) => r.status !== "done"); if (open.length) loose = open; }
            if (loose.length === 1 && words.some((w) => w.length >= PARAMS.looseBindMinChars && loose[0].titleF.includes(w))) return bind(loose[0].id);
            if (loose.length) return ask(loose.map((r) => r.id));
          }
        }
        if (world.length === 1) return bind(world[0].id);
        if (world.length > 1) return ask(world.map((r) => r.id));
      }
      if (!keep.length) {
        if (pset.length && isPlainName) {
          const live = pset.filter(this.vis);
          return live.length === 1 ? bind(live[0]) : ask(this.orderByRecency(live));
        }
        // "that <modifier> <kind>" whose modifier fits no record at all (a word in another language, a paraphrase):
        // it is a pointer of that kind — unless the modifier names a record this account cannot see
        const pointerOfKind = !pset.length && !!kinds?.length && hasAny(sf, [...L.BARE_POINTERS, ...L.POINTER_KINDS.flatMap(([w]) => w), ...POINTER_PREFIXES]);
        const unseen = [...this.ix.recs.values()].some((r) => r.kind !== "contact" && !this.vis(r.id) && content.some((w) => w.length >= 2 && r.titleF.includes(w)));
        if (!pointerOfKind || unseen) return none;
      }
      if (keep.length) {
      const ids = uniq(keep.map((s) => s.id));
      const live = ids.filter(this.vis);
      if (!live.length) return none;
      if (live.length === 1) return live.length === ids.length || this.goneAreOlder(ids, live[0]) ? bind(live[0]) : ask(live);
      // several fit: the newest turn decides only if the reference says nothing that separates them
      return ask(this.orderByRecency(live));
      }
    }

    // ---- a bare pointer (那条 / それ / that one / 这个) or nothing at all (a bare completion or a bare shift by a duration)
    const kinds = pointerKinds;
    const recent = hasAny(sf, L.RECENT_MARKERS);
    const verb = verbIn(pf);
    const fit = (id: string) => {
      const k = kindOfId(id)!;
      if (kinds) return kinds.includes(k);
      if (k === "contact") return false;
      if (verb === "complete") return k === "todo";
      return true;
    };
    let turnsWith = tms.map((t) => ({ ...t, ids: t.ids.filter(fit) })).filter((t) => t.ids.length);
    if (!turnsWith.length) return none;
    const pk = kindIn(pf);
    if (!kinds && pk && pk !== "contact") {
      // the sentence says what kind it is about (…リマインドして → a to-do): prefer that kind when one was mentioned
      const tw = tms.map((t) => ({ ...t, ids: t.ids.filter((id) => kindOfId(id) === pk) })).filter((t) => t.ids.length);
      if (tw.length) turnsWith = tw;
    }
    if (idle && !anchored) return ask(this.orderByRecency(uniq(turnsWith.flatMap((t) => t.ids))));
    const top = turnsWith[0];
    let ids = top.ids;
    if (recent && !kinds && turnsWith.length > 1) ids = uniq([...top.ids, ...turnsWith[1].ids]);
    if (verb === "complete" || verb === "update") {
      const open = ids.filter((id) => this.ix.recs.get(id)?.status !== "done");
      if (open.length && open.length < ids.length && !recent) ids = open;
    }
    const live = ids.filter(this.vis);
    if (!live.length) return none;
    if (ids.length === 1) return bind(ids[0]);
    if (live.length === 1 && this.goneAreOlder(ids, live[0]) && !recent) return bind(live[0]);
    return ask(live);
  }

  /** The tone marks of the reference as typed (from the raw text of the reference, or of the message where it occurs). */
  private toneMarksFor(said: string, sf: string): number[] | null {
    const own = tonesOf(said);
    if (own) return own;
    for (const m of this.message.match(/[A-Za-zÀ-ɏ]+(?:[\s-]+[A-Za-zÀ-ɏ]+)*/gu) ?? []) {
      const t = tonesOf(m);
      if (t && sf.includes(fold(m))) return t;
    }
    return null;
  }

  /** Do typed tones fit this contact's Chinese name (family–given or given–family, or one part alone)? null = unknown. */
  private toneFits(cid: string, tones: number[]): boolean | null {
    const c = this.ix.world.contacts.find((x) => x.id === cid);
    if (!c) return null;
    const names = [c.name, ...(c.aliases ?? [])].map((x) => fold(x).replace(/\s+/g, "")).filter((x) => x.length >= 2 && [...x].every(isCjk));
    let known = false;
    for (const n of names) {
      const famLen = L.COMPOUND_SURNAMES.includes(n.slice(0, 2)) && n.length >= 3 ? 2 : 1;
      const ft = tonesOfChars(n.slice(0, famLen)), gt = tonesOfChars(n.slice(famLen));
      if (!ft || !gt) continue;
      known = true;
      for (const seq of [[...ft, ...gt], [...gt, ...ft], gt, ft]) {
        if (seq.length === tones.length && seq.every((x, k) => !tones[k] || tones[k] === x)) return true;
      }
    }
    return known ? false : null;
  }

  /**
   * Does the sentence (names masked) name something of this contact's own stored details — a concept of their title /
   * company / industry (仓库 ↔ Warehouse Manager), or a distinctive Latin word of them? Kept narrow on purpose:
   * ordinary words (公司 / 電話) never count.
   */
  ownDetailsFit(cid: string, pf: string): boolean {
    const r = this.ix.recs.get(cid);
    if (!r) return false;
    const c = this.ix.world.contacts.find((x) => x.id === cid);
    const details = fold(`${c?.title ?? ""} ${c?.company ?? ""} ${c?.industry ?? ""}`);
    const t = this.maskPeople(pf);
    const mine = conceptsOf(details);
    // r06: only a concept of a field / occupation (warehouse, legal, sales …), never a thing one does with anyone
    if ([...conceptsOf(t)].some((k) => FIELD_CONCEPTS.has(k) && mine.has(k))) return true;
    const words = (t.match(/[a-z][a-z-]{3,}/g) ?? []).filter((w) => !L.EN_COMMON.has(w) && !EN_STOP.includes(w));
    return words.some((w) => containsTerm(details, w));
  }

  /** r06: does this contact have stored details (title or company) that could be compared at all? */
  private hasDetails(cid: string): boolean {
    const c = this.ix.world.contacts.find((x) => x.id === cid);
    return !!(c?.title?.trim() || c?.company?.trim());
  }

  /** Does a content word of the sentence appear in what was said about this person (the clause naming them)? */
  private contentFits(cid: string, pf: string): boolean {
    const words = this.contentWords(pf);
    const segs = this.segmentsAbout(cid);
    return words.some((w) => segs.some((s) => s.includes(w)));
  }
  /** …and in no clause about another person of the same turn. */
  private turnPeopleFit(cid: string, pf: string): boolean {
    const t = this.turnMentions().find((x) => x.ids.includes(cid));
    if (!t) return false;
    return t.ids.filter((x) => x !== cid && kindOfId(x) === "contact").every((x) => !this.contentFits(x, pf));
  }

  private goneAreOlder(_ids: string[], _live: string): boolean { return false; }

  private contentOfSaid(sf: string, names: string[]): string[] {
    let t = sf;
    for (const n of names) t = t.split(n).join(" ");
    t = this.stripFunction(t);
    return chunks(t).map((c) => c.replace(/\s+/g, "")).filter((c) => ([...c].some((x) => isCjk(x) || /[ぁ-ん]/u.test(x)) ? [...c].filter((x) => isCjk(x) || /[ぁ-んー]/.test(x)).length >= 2 : /^[a-z][a-z0-9]{1,}$/.test(c) && !EN_STOP.includes(c)) && !GENERIC_REF_WORDS.includes(c));
  }

  stripFunction(t: string): string {
    const c = STRIP_CACHE.get(t);
    if (c !== undefined) return c;
    const r = this.stripFunctionRaw(t);
    STRIP_CACHE.set(t, r);
    return r;
  }
  private stripFunctionRaw(t: string): string {
    // durations and dates are not content (a shift by a number of weeks / days, a day of the month)
    let s = t.replace(fre(/[\d一二三四五六七八九十两]+\s*(个?星期|周|週間|週|天|日|号|个月|か月|ヶ月|days?|weeks?)/gu), " ");
    const tp = parseTime(s, "2000-01-01");
    for (const [a, b] of [...tp.spans].sort((x, y) => y[0] - x[0])) s = s.slice(0, a) + " ".repeat(b - a) + s.slice(b);
    const words = STRIP_WORDS;
    for (const w of words) {
      if (/^[a-z]/.test(w)) s = s.replace(new RegExp(`(^|[^a-z])${w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?=$|[^a-z])`, "g"), "$1 ");
      else s = s.split(w).join(" ");
    }
    return s;
  }

  private pronounPerson(pron: "f" | "m" | "any", idle: boolean): RefResult {
    const said = "";
    const g = (id: string) => this.ix.gender(id);
    const turns = this.turnMentions().map((t) => ({ ...t, ids: uniq(t.ids.filter((id) => kindOfId(id) === "contact" && this.vis(id))) })).filter((t) => t.ids.length);
    const fem = (ids: string[]) => ids.filter((id) => g(id) !== "male");
    if (idle) {
      let all = uniq(turns.flatMap((t) => t.ids));
      if (pron === "f") all = fem(all);
      if (pron === "m") { const m = all.filter((id) => g(id) !== "female"); if (m.length) all = m; }
      const c = all.slice(0, PARAMS.maxCandidates);
      return c.length ? { said, outcome: "ask", candidates: c } : { said, outcome: "none" };
    }
    if (pron === "f") {
      const t = turns.find((x) => fem(x.ids).length);
      if (!t) return { said, outcome: "none" };
      const c = fem(t.ids);
      if (c.length === 1 && g(c[0]) === "female") return { said, outcome: "bound", id: c[0] };
      return { said, outcome: "ask", candidates: c.slice(0, PARAMS.maxCandidates) };
    }
    // 他 / 彼: the latest turn with someone not known to be a woman; only when there is none, the latest turn at all
    const t = (pron === "m" ? turns.find((x) => x.ids.some((id) => g(id) !== "female")) : undefined) ?? turns[0];
    if (!t) return { said, outcome: "none" };
    if (pron === "m") {
      const m = t.ids.filter((id) => g(id) !== "female");
      if (m.length === 1 && g(m[0]) === "male") return { said, outcome: "bound", id: m[0] };
    }
    if (t.ids.length === 1 && pron === "any") return { said, outcome: "bound", id: t.ids[0] };
    return { said, outcome: "ask", candidates: t.ids.slice(0, PARAMS.maxCandidates) };
  }

  private allMentions(): string[] {
    const out: string[] = [...this.sentence];
    for (let i = this.e.turns.length - 1; i >= 0; i--) out.push(...this.e.turns[i].mentions);
    return uniq(out);
  }
  private mentionsWhere(fn: (r: Rec) => boolean): string[] {
    return this.allMentions().filter((id) => { const r = this.ix.recs.get(id); return !!r && fn(r); });
  }
  private recordsLinked(pset: string[], kinds: RecordKind[] | null): string[] {
    if (!pset.length) return [];
    return this.mentionsWhere((r) => r.kind !== "contact" && r.contactIds.some((c) => pset.includes(c)) && (!kinds || kinds.includes(r.kind)));
  }
  private byLatestTurn(ids: string[], said: string): RefResult {
    for (const t of this.turnMentions()) {
      const here = t.ids.filter((id) => ids.includes(id));
      if (!here.length) continue;
      const live = here.filter(this.vis);
      if (!live.length) return { said, outcome: "none" };
      return live.length === 1 && here.length === 1 ? { said, outcome: "bound", id: live[0] } : { said, outcome: "ask", candidates: live.slice(0, PARAMS.maxCandidates) };
    }
    return { said, outcome: "none" };
  }
  private orderByRecency(ids: string[]): string[] {
    const order = this.allMentions();
    return [...ids].sort((a, b) => {
      const ia = order.indexOf(a), ib = order.indexOf(b);
      return (ia < 0 ? 1e9 : ia) - (ib < 0 ? 1e9 : ib);
    });
  }
  private earliestMention(kinds: RecordKind[] | null): string | null {
    for (const t of this.e.turns) for (const id of t.mentions) {
      const k = kindOfId(id);
      if (k === "contact" && !kinds?.includes("contact")) continue;
      if (!kinds || kinds.includes(k!)) return id;
    }
    return null;
  }
  private hasListSince(kinds: RecordKind[] | null): boolean {
    return this.e.turns.some((t) => t.listed.length >= 2 && (!kinds || t.listed.some((id) => kinds.includes(kindOfId(id)!))));
  }
  private listsNewestFirst(kinds: RecordKind[] | null, people: string[]): string[][] {
    const out: string[][] = [];
    for (let i = this.e.turns.length - 1; i >= 0; i--) {
      const t = this.e.turns[i];
      if (t.role !== "agent" || t.listed.length < 2) continue;
      if (kinds && !t.listed.some((id) => kinds.includes(kindOfId(id)!))) continue;
      if (people.length) {
        const about = t.listed.some((id) => this.ix.recs.get(id)?.contactIds.some((c) => people.includes(c))) || (t.answered?.people ?? []).some((p) => people.includes(p));
        if (!about) continue;
      }
      out.push(t.listed);
    }
    if (!out.length && people.length) return this.listsNewestFirst(kinds, []);
    return out;
  }

  private ambiguousPeople(pf: string): string[][] {
    return peopleOf(this.ix, pf).ambiguous.filter((g) => g.filter(this.vis).length > 1 && peopleOf(this.ix, pf).hits.some((h) => h.how !== "company" && h.how !== "role" && h.ids.length > 1));
  }

  maskPeople(pf: string): string {
    let t = pf;
    const hits = peopleOf(this.ix, pf).hits;
    for (const h of [...hits].sort((a, b) => b.at[0] - a.at[0])) t = t.slice(0, h.at[0]) + "■".repeat(h.at[1] - h.at[0]) + t.slice(h.at[1]);
    return t;
  }

  /** A reference used only to say whose company / colleague (彼女の会社の<person> / 她公司那位). */
  modifierOnly(said: string, pf: string): boolean {
    const i = pf.indexOf(fold(said));
    if (i < 0) return false;
    return /^(の会社|的公司|公司|の同僚|的同事|の上司|的老板|の部下)/u.test(pf.slice(i + fold(said).length));
  }

  placeIn(pf: string): string | null {
    const t = this.maskPeople(pf);
    let best: { w: string; i: number } | null = null;
    // many place names are also surnames (a place word with an honorific or a title after it is a person)
    const personAfter = (i: number, w: string) => fre(/^[\s-]?(さん|様|さま|先生|氏|君|くん|ちゃん|总|老师|女士|小姐|部長|課長|社長|san|sama|sensei)/u).test(t.slice(i + w.length));
    const kw = kanaWords(t);
    for (const w of [...PLACE_WORDS, ...this.ix.places]) {
      // r07: a place written in kana only as a kana word of its own (ぱり inside やっぱり is no Paris)
      if (/^[ぁ-ゖー]+$/u.test(w) && !kw.includes(w)) continue;
      const i = indexOfTerm(t, w);
      if (i >= 0 && !personAfter(i, w) && (!best || w.length > best.w.length)) best = { w, i };
    }
    if (!best) {
      // a well-known place written in kana (おおさか / よこはま): its romaji
      for (const k of kanaWords(t)) {
        const p = k.length >= 3 ? LATIN_PLACE[romaji(k)] : undefined;   // r06: なら is no Nara
        const i = t.indexOf(k);
        if (p && i >= 0 && !personAfter(i, k)) { best = { w: p, i }; break; }
      }
    }
    if (!best) return null;
    const p = LATIN_PLACE[best.w] ?? best.w;
    return this.ix.placeDisplay.get(p) ?? PLACE_DISPLAY.get(p) ?? p;
  }

  /**
   * r07: the facts of a statement, one per subject when it states several (来週、私は<city A>で、<name>さんは<city B>にいる:
   * me → A, <name> → B); one fact for the whole sentence otherwise, about the one person it names or the user.
   */
  private statementFacts(pf: string, place: string | undefined, win: TimeWindow | null): Fact[] {
    const turn = this.e.turns.length;
    const meIn = (c: string) => /(^|[，,、\s])(我|私|わたし|僕|俺)|^i\b|\bi'm\b|\bi am\b/u.test(c);
    const clauses = pf.split(/[，,、;；]|\band\b|而/u).map((c) => c.trim()).filter(Boolean);
    const per = clauses.map((c) => {
      const named = peopleOf(this.ix, c).named.filter(this.vis);
      const who = named.length === 1 ? named[0] : !named.length && meIn(c) ? "me" : undefined;
      return { who, place: this.placeIn(c) ?? undefined, time: parseTime(this.maskPeople(c), this.today).win ?? undefined };
    });
    const subjects = per.filter((x) => x.who && x.place);
    if (subjects.length >= 2 && new Set(subjects.map((x) => x.who)).size === subjects.length) return subjects.map((x) => ({ who: x.who, place: x.place, time: x.time ?? win ?? undefined, turn }));
    const named = peopleOf(this.ix, pf).named.filter(this.vis);
    const who = named.length === 1 ? named[0] : !named.length && meIn(pf) ? "me" : undefined;
    return [{ place, time: win ?? undefined, turn, who }];
  }

  isStatement(pf: string): boolean {
    if (hasAny(pf, L.QUESTION_MARKERS.filter((w) => w !== fold("ある")))) return false;
    if (verbIn(pf) && verbIn(pf) !== "read") return false;
    if (hasAny(pf, L.STATEMENT_MARKERS) || (hasAny(pf, L.SESSION_SCOPE) && (hasAny(pf, L.ONLY_MARKERS) || hasAny(pf, L.NEG_DONE)))) return true;
    // "I am somewhere on some day": a first-person sentence with a place and a time, asking nothing
    if (/^(我|俺|私|わたし|僕|i\b|i'm)/u.test(pf.trim()) && (!!this.placeIn(pf) || !!parseTime(this.maskPeople(pf), this.today).win) && !kindIn(pf)) return true;
    // r07: a sentence about a person's day and place that asks and changes nothing (<person> <day>到<place>)
    return !isQuestion(pf) && !verbIn(pf) && !kindIn(pf) && peopleOf(this.ix, pf).named.length === 1 && !!parseTime(this.maskPeople(pf), this.today).win && !!this.placeIn(pf);
  }

  // -------------------------------------------------------------- the merged request

  /**
   * r07: the part's relation to the changes in flight. cancel = calls off the change waiting for its click; resume =
   * goes back to an interrupted change (names its person / 照建 / そのまま); copy = the same kind of change for another
   * person or record (也 / 一样 / same / another); amend = a change of mind or a correction of a value of the change that
   * waits (やっぱり / 还是 / actually / 不对 / じゃなくて). Read questions about records are none of these.
   */
  changeOf(pf: string, refs: RefResult[]): { mode: "cancel" | "resume" | "copy" | "amend"; task: Task; correction: boolean } | null {
    const e = this.e;
    const open = e.openTasks();
    const last = e.lastTask();
    if (!last) return null;
    const kind = kindIn(pf);
    const verb = verbIn(pf);
    const write = !!verb && verb !== "read";
    const named = peopleOf(this.ix, pf).named.filter(this.vis);
    const boundRecs = refs.filter((r) => r.outcome === "bound" && r.id && kindOfId(r.id) !== "contact").map((r) => r.id!);
    const otherRecord = (t: Task) => boundRecs.some((id) => id !== t.target) || refs.some((r) => r.outcome === "ask" && !(r.candidates ?? []).includes(t.target ?? ""));
    const readQuestion = isQuestion(pf) && !write;
    const turnAway = /^(先|顺便|另外|对了|还有|然后|by the way|btw|ところで|それと|あと|ついでに)/u.test(pf.trim()) || hasAny(pf, TOPIC_TURN);
    const waiting = open.filter((t) => t.card || t.qid);
    // call off the change that waits
    if (waiting[0] && hasAny(pf, L.CANCEL_MARKERS) && !readQuestion && (!kind || kind === waiting[0].slots.kind)) return { mode: "cancel", task: waiting[0], correction: false };
    // go back to an interrupted change: it names that change's person, or says "as it was"
    for (const t of open.slice(1)) {
      const hisPerson = named.some((p) => (t.slots.people ?? []).includes(p));
      if ((hisPerson || hasAny(pf, L.RESUME_MARKERS)) && (write || hasAny(pf, L.RESUME_MARKERS) || hasAny(pf, L.COPY_MARKERS)) && !readQuestion
        && (!kind || kind === t.slots.kind) && (!verb || verb === "read" || verb === t.slots.verb || hasAny(pf, L.RESUME_MARKERS))
        && !named.some((p) => !(t.slots.people ?? []).includes(p))) return { mode: "resume", task: t, correction: false };
    }
    if (open[0] && hasAny(pf, L.RESUME_MARKERS) && !readQuestion && !named.some((p) => !(open[0].slots.people ?? []).includes(p)) && (!kind || kind === open[0].slots.kind)) return { mode: "resume", task: open[0], correction: false };
    const correction = hasAny(pf, STRONG_CORRECT) || !!contrastSides(pf) || /^(いや|いいえ|ううん|no[,，. ]|nope|不不|错了|不对|啊不对|哦不对|ごめん|sorry)/u.test(pf.trim()) || hasAny(pf, L.CORRECT_MARKERS);
    // r10: a person added to the change that waits (把 <name> 也加上 / <name>も追加 / add <name> as well): a change of mind
    if (waiting[0] && named.length && ADD_PERSON.test(pf) && !readQuestion && (!kind || kind === waiting[0].slots.kind) && !named.every((p) => (waiting[0].slots.people ?? []).includes(p))) return { mode: "amend", task: waiting[0], correction: false };
    // the same kind of change again, for another person or record
    if (last.status !== "cancelled" && last.slots.verb && last.slots.verb !== "read" && !readQuestion && (!kind || kind === last.slots.kind) && (!verb || verb === "read" || verb === last.slots.verb)) {
      const other = hasAny(pf, L.OTHER_WORDS) || named.some((p) => !(last.slots.people ?? []).includes(p)) || otherRecord(last);
      if (other && (hasAny(pf, L.COPY_MARKERS) || hasAny(pf, L.OTHER_WORDS)) && !(correction && !hasAny(pf, L.COPY_MARKERS))) return { mode: "copy", task: last, correction: false };
    }
    // a change of mind / a correction of the change that waits
    const w = waiting[0];
    if (w && !turnAway && !readQuestion && (!kind || kind === w.slots.kind) && (!verb || verb === "read" || verb === "update" || verb === w.slots.verb) && !otherRecord(w)
      && (hasAny(pf, L.AMEND_MARKERS) || correction)) return { mode: "amend", task: w, correction };
    return null;
  }

  request(pf: string, fu: FollowUpClass, refs: RefResult[], hp?: HintPart, ch?: ReturnType<TurnCtx["changeOf"]>): Slots {
    const prev = this.e.prevRequest();
    const masked = this.maskPeople(pf);
    const tp = parseTime(masked, this.today, prev?.time);
    const own: Slots = {};
    let kind = kindIn(pf);
    // r07: a kind word inside the description of the record, then its counter (<event word>…那条 / 会议那篇): the counter
    // tells the kind of the record (条 a to-do, 篇 a note), the word before is part of its title
    const counter = /(?:那|这)(条|篇)/u.exec(pf);
    if (kind && counter && !kindIn(pf.slice(counter.index))) {
      const ck: RecordKind = counter[1] === "条" ? "todo" : "memo";
      if (kindIn(pf.slice(0, counter.index)) === kind && ck !== kind && (kind === "event" || kind === "schedule" || (ck === "memo" && kind === "todo"))) kind = ck;
    }
    // r12: a new record: the kind the user states wins over kind words inside its title
    if (verbIn(pf) === "create" || NEW_RECORD.test(pf)) {
      const sk = statedKindIn(pf);
      if (sk) kind = sk;
    }
    // r07: no kind word, but the message names a stored record by its title (<title>里…): that record's kind
    if (!kind) {
      const sq = squash(pf);
      const ks = uniq([...this.ix.recs.values()].filter((r) => r.kind !== "contact" && r.titleF.length >= 4 && sq.includes(squash(r.titleF)) && this.vis(r.id)).map((r) => r.kind as RecordKind));
      if (ks.length === 1) kind = ks[0];
    }
    // r10: a question whether someone is free (有空吗 / 空いてる / am I free) is about the calendar
    if (!kind && AVAILABLE.test(pf)) kind = "schedule";
    if (kind) own.kind = kind;
    const verb = verbIn(pf);
    if (verb) own.verb = verb as Slots["verb"];
    if (tp.win) own.time = tp.win;
    const ppl = peopleOf(this.ix, pf);
    let people = uniq([...ppl.named, ...refs.filter((r) => r.outcome === "bound" && kindOfId(r.id!) === "contact" && !this.modifierOnly(r.said, pf)).map((r) => r.id!)]).filter(this.vis);
    // r07: a name the user defined earlier stands for that contact (and not for the others it would also fit)
    const aliased = this.aliasHit(pf);
    if (aliased) people = uniq([aliased.id, ...people.filter((p) => !aliased.alsoFits.includes(p))]);
    // a reference bound to a record of a person (他那条) is not the person filter; people named by role alone are
    // r10 (R44): a plural pronoun (他们俩 / 彼ら二人 / the two of them) is every person of the latest turn that named people
    const pl = this.pluralGroup(pf);
    if (pl && pl.fits) people = uniq([...people, ...pl.ids]);
    if (people.length) own.people = people;
    const place = this.placeIn(pf);
    if (place) own.place = place;
    const topic = topicIn(pf, ppl.hits.map((h) => h.said));
    if (topic.length) own.topic = topic;
    const status = statusIn(pf);
    if (status) own.status = status;
    // a filter whose words are no person, place, time or status is a topic (only the <topic> ones / <topic>のだけ)
    if (fu === "refine" && !own.topic && !own.people && !own.place && !own.status) {
      const rest = this.residualContent(pf).filter((w) => !kindIn(w));
      const acr = (this.message.match(/\b[A-Z][A-Z0-9]{1,5}\b/g) ?? []).map(fold);
      const words = uniq([...acr, ...rest]).filter((w) => !L.HONORIFICS.includes(w));
      if (words.length === 1) own.topic = words;
    }
    // a contrast (不是A，是B / AじゃなくてB / not A, B): what the B side names wins over the A side
    const cs = contrastSides(pf);
    if (cs) {
      // the time of the positive side only (不是今天，是明天 → tomorrow, never the range of both)
      const tPos = parseTime(this.maskPeople(cs.pos), this.today, prev?.time).win;
      const tNeg = parseTime(this.maskPeople(cs.neg), this.today, prev?.time).win;
      if (tPos) own.time = tPos;
      const pPos = this.placeIn(cs.pos), pNeg = this.placeIn(cs.neg);
      if (pPos) own.place = pPos;
      else if (pNeg && own.place === pNeg) delete own.place;
      else if (tNeg && own.time && sameWin(own.time, tNeg)) delete own.time;
      // r08: a person only the negated side names (a reference the model reported for 不是X) is no person of the request
      if (own.people?.length) {
        const posIds = new Set(peopleOf(this.ix, cs.pos).hits.flatMap((h) => h.ids));
        const negIds = new Set(peopleOf(this.ix, cs.neg).hits.flatMap((h) => h.ids));
        const negOnly = refs.filter((r) => r.outcome === "bound" && r.id && cs.neg.includes(fold(r.said)) && !cs.pos.includes(fold(r.said))).map((r) => r.id!);
        const kept = own.people.filter((p) => !(negOnly.includes(p) && negIds.has(p) && !posIds.has(p)));
        if (kept.length) own.people = kept;
      }
      const kPos = kindIn(cs.pos);
      if (kPos && kPos !== "contact") own.kind = kPos;
      else if (own.kind && kindIn(cs.neg) === own.kind) delete own.kind;
    }
    // anaphora to stated facts (那天 / 那边 / 出差那几天)
    const fact = (pred: (f: Fact) => boolean) => [...this.e.facts].reverse().find(pred);
    if (!own.time && tp.anaphor) {
      const f = fact((x) => !!x.time && (tp.anaphor === "range" ? x.time.from !== x.time.to : true)) ?? fact((x) => !!x.time);
      if (f?.time) own.time = f.time;
      else if (prev?.time) own.time = prev.time;
    }
    // r07: "where <person> is / my side" (<name>さんがいる方 / 我这边 / where I'll be): the place a fact gives that person
    const locator = /(がいる|にいる|在的|待的|いる方|いるほう|のいる|の方[はで]?|のほう[はで]?|这边|那边|那里|where\b)/u.test(pf);
    if (!own.place && locator) {
      const me = MY_SIDE.test(pf.trim()) || /(我|私|わたし|僕)(?:が|は)?(?:いる|在)/u.test(pf);
      const whoNamed = ppl.named.filter((p) => this.e.facts.some((x) => x.who === p && x.place));
      const f = whoNamed.length === 1 ? fact((x) => x.who === whoNamed[0] && !!x.place) : me ? fact((x) => x.who === "me" && !!x.place) : undefined;
      if (f?.place) {
        own.place = f.place;
        // the person only says where: the request is about the place, not about that person's records
        if (whoNamed.length === 1 && own.people?.length === 1 && own.people[0] === whoNamed[0]) delete own.people;
      }
    }
    if (!own.place && fre(/那边|那儿|那里|附近|その辺|そのへん|その近く|あの辺|近く|そっち|向こう|あっち|over there|around there|nearby|there\b|当地|现地|現地/u).test(pf)) {
      const f = fact((x) => !!x.place);
      if (f?.place) own.place = f.place;
    }
    if (!own.time && own.place) {
      // 大阪にいる日 / 我在大阪那天: the day the user said they are there
      if (/(にいる|在).{0,4}(日|天|时候|期间|間|间|あいだ|うち|期間)|いる日|いる間|いる间|那天|那几天|while i|when i'?m/u.test(pf)) {
        const f = fact((x) => !!x.time && x.place === own.place);
        if (f?.time) own.time = f.time;
      }
    }
    // r07: "that week" (那周 / その週 / that week): the week of the request before
    if (!own.time && /那周|那一周|那个星期|その週|その周|that week/u.test(pf) && prev?.time && prev.time.from !== prev.time.to) own.time = prev.time;
    // r07: "the day of <person>" (接他那天 / 彼を迎えに行く日): the day a fact about that person gives
    if (!own.time && /那天|那一天|その日|[くるたう]日|的日子|the day|that day/u.test(pf)) {
      const who = uniq([...ppl.named, ...refs.filter((r) => r.outcome === "bound" && kindOfId(r.id!) === "contact").map((r) => r.id!)]);
      const f = who.length === 1 ? fact((x) => x.who === who[0] && !!x.time) : undefined;
      if (f?.time) {
        own.time = f.time;
        // the person only dates the question (what else is on that day), they are no filter of it
        if (own.people?.length === 1 && own.people[0] === who[0] && /别的|其他|其它|还有|他に|ほかに|ほか|\belse\b|\bother\b/u.test(pf)) delete own.people;
      }
    }
    if (!own.time && /有空|空いて|free/u.test(pf) && /那天|その日|日|day/u.test(pf)) {
      const f = fact((x) => !!x.time);
      if (f?.time) own.time = f.time;
    }
    if (!own.time && fre(/出差|出張|trip/u).test(pf) && fre(/几天|期间|間|days|那天/u).test(pf)) {
      const f = fact((x) => !!x.time && x.time.from !== x.time.to) ?? fact((x) => !!x.time);
      if (f?.time) own.time = f.time;
    }
    // r10: the day before / of the departure the user stated (出发前一天 / 出発の前日 / the day before I fly)
    const dep = DEPARTURE_DAY.exec(pf);
    if (!own.time && dep) {
      const f = fact((x) => !!x.time && (x.who === "me" || !x.who));
      if (f?.time) { const d = dep[1] || dep[2] || dep[3] ? addDays(f.time.from, -1) : f.time.from; own.time = { from: d, to: d }; }
    }
    if (!own.time && /请假|休み|off/u.test(pf)) {
      const f = fact((x) => !!x.time);
      if (f?.time) own.time = f.time;
    }

    // r07: a part about a change in flight: its request is that change, with what this part changes
    if (ch && ch.mode !== "cancel") {
      const t = ch.task.slots;
      const merged: Slots = {};
      const content = contentSet(this.message);
      if (content) own.topic = [content];
      if (ch.mode === "resume") Object.assign(merged, t);
      else if (ch.mode === "amend") {
        Object.assign(merged, t);
        for (const k of ["time", "people", "topic", "place"] as const) if (own[k] !== undefined) (merged as Record<string, unknown>)[k] = own[k];
        // r10: a person added to the change (把 <name> 也加上 / <name>さんも追加 / add <name> as well) joins the ones it has
        if (own.people && t.people?.length && (addsItems(pf) || /也|も追加|もいれ|も入れ|\b(?:too|as well|also)\b/u.test(pf))) merged.people = uniq([...t.people, ...own.people]);
      } else {
        if (t.kind) merged.kind = t.kind;
        merged.verb = own.verb && own.verb !== "read" ? own.verb : t.verb;
        if (own.people) merged.people = own.people;
        if (own.time) merged.time = own.time;
        else if (hasAny(pf, L.SAME_DAY) && t.time) merged.time = t.time;
        if (own.topic) merged.topic = own.topic;
        if (own.place) merged.place = own.place;
      }
      if (hp?.slots) this.fillFromHint(merged, own, prev, hp.slots, pf);
      this.noteRequest(pf, merged, own, tp.win ?? null, fu, refs);
      const task = ch.task;
      const at = this.e.turns.length;
      if (ch.mode === "copy") { const text = this.tf; this.taskOps.push(() => { this.e.addTask(merged, { turn: at, text }); }); }
      else this.taskOps.push(() => { if (ch.mode === "amend") task.slots = { ...merged }; this.e.touch(task); });
      return merged;
    }

    const base: Slots = {};
    const carry = (keys: (keyof Slots)[]) => {
      if (!prev) return;
      for (const k of keys) {
        const v = prev[k];
        if (v === undefined) continue;
        if (this.e.oneOff[k]) continue;
        (base as Record<string, unknown>)[k] = v;
      }
    };
    switch (fu) {
      case "swap_period": carry(["kind", "verb", "people", "topic", "place", "status"]); break;
      case "ask_again_about": carry(["kind", "verb", "time", "topic", "status", ...(own.people ? [] : ["people" as const]), ...(own.place ? [] : ["place" as const])]); if (own.people) delete base.place; break;
      case "refine": case "adjust": case "repeat": case "follow_list":
        if (prev) Object.assign(base, prev);
        break;
      case "correct": {
        if (prev) Object.assign(base, prev);
        // the corrected person: a name, else a company that fits one person (不是这个X，是<company>那个)
        if (!own.people) {
          const one = ppl.groups.filter((g) => g.ids.length === 1 && this.vis(g.ids[0])).map((g) => g.ids[0]).filter((id) => !(prev?.people ?? []).includes(id));
          if (one.length === 1) own.people = one;
          // the correction names someone this code cannot place (an unknown spelling): do not keep the old person
          else if (this.unknownProperNoun()) delete base.people;
        }
        break;
      }
      default: break;
    }
    // r07 (R25): a follow-up that only names another record kind (<kind>は？ / 那<kind>呢 / any <kind>?) is the same
    // question about that kind: the person, the time and the place come along, nothing else of the old request
    if (prev?.kind && kind && kind !== prev.kind && kind !== "contact" && !people.length && !ppl.hits.length && !own.place && !own.topic && !own.status && !own.time
      && (verb ?? "read") === "read" && !refs.some((r) => r.outcome === "bound") && !this.residualContent(pf).some((w) => !kindIn(w) && !TIMEISH.test(w))
      && fre(/呢[？?]?$|は[？?]?$|^(那|じゃあ|では|それなら|and\b|what about|how about|any\b)/u).test(pf.trim())) {
      for (const k of Object.keys(base) as (keyof Slots)[]) delete base[k];
      if (prev.people?.length && !this.e.oneOff.people) base.people = prev.people;
      if (prev.time && !this.e.oneOff.time) base.time = prev.time;
      if (prev.place && !this.e.oneOff.place) base.place = prev.place;
    }
    if (cs && base.place && this.placeIn(cs.neg) === base.place) delete base.place;
    // done / not done is a condition on to-dos: it does not follow the request to another kind
    if (base.status && !own.status && (own.kind ?? base.kind) !== "todo") delete base.status;
    if (cs && base.time && own.time) delete base.time;
    const merged: Slots = { ...base };
    for (const [k, v] of Object.entries(own)) if (v !== undefined) (merged as Record<string, unknown>)[k] = v;
    if (fu === "ask_again_about" && own.people) merged.people = own.people;
    if (fu === "correct" && own.people) merged.people = own.people;
    if (fu === "correct" && !own.people && /不是|じゃなくて|not/u.test(pf) && !people.length) { /* keep */ }
    if (fu === "new" && !kind && verb === "read" && prev?.kind && /那.*呢|は[？?]$/u.test(pf) && !ppl.hits.length && !this.residualContent(pf).length) merged.kind = prev.kind;
    if (fu === "refine" && own.topic && prev?.topic) merged.topic = own.topic;
    if (fu === "correct" && /不要|じゃなくて|不是/u.test(pf) && own.kind) {
      // "what I want is <kind>, not <kind>": the kind named after 要的是 / 的是 is meant
      const want = (cs && kindIn(cs.pos)) || kindAfterWant(pf);
      if (want) merged.kind = want;
    }
    // standing requirements of the conversation apply to their kinds
    for (const s of this.e.standing) {
      if (s.kinds !== "all" && (!merged.kind || !s.kinds.includes(merged.kind))) continue;
      if (s.place && !merged.place) merged.place = s.place;
      if (s.status && !merged.status) merged.status = s.status;
      if (s.topic && !merged.topic?.length) merged.topic = s.topic;
    }
    if (!own.kind) {
      // r07: in a correction, "<company>那个" names the person of that company, not a record of it
      const rk = refs.filter((r) => r.outcome === "bound" && r.id && !(fu === "correct" && peopleOf(this.ix, fold(r.said)).hits.some((h) => h.how === "company") && /(那个|那位|的那位|の方|のほう)$/u.test(fold(r.said)))).map((r) => kindOfId(r.id!)!).filter((k) => k !== "contact");
      if (rk.length && (fu === "new" || fu === "follow_list" || fu === "correct")) merged.kind = rk[0];
    }
    if (!merged.kind && fu === "new" && verb && verb !== "read" && verb !== "create" && refs.length && refs.every((r) => r.outcome === "bound" && kindOfId(r.id!) === "contact")) {
      const pids = refs.map((r) => r.id!);
      const ks = uniq(this.e.turns.flatMap((t) => t.mentions).filter((id) => kindOfId(id) !== "contact" && this.ix.recs.get(id)?.contactIds.some((c) => pids.includes(c))).map((id) => kindOfId(id)!));
      if (ks.length === 1) merged.kind = ks[0];
    }
    if (!merged.kind && fu === "new" && verb && verb !== "read" && verb !== "create" && !refs.length) {
      // a change without its object (挪到周五): the kind of what the turn before talked about, when that is one kind
      const last = [...this.e.turns].reverse().find((t) => t.mentions.some((id) => kindOfId(id) !== "contact"));
      const ks = uniq((last?.mentions ?? []).map((id) => kindOfId(id)!).filter((k) => k !== "contact"));
      if (ks.length === 1) merged.kind = ks[0];
    }
    if (!merged.kind && fu === "new" && /那条|这条|那件|那项/u.test(pf)) merged.kind = "todo";
    if (!merged.kind && fu === "new" && /那篇|这篇/u.test(pf)) merged.kind = "memo";
    if (!merged.kind && fu === "new" && /那场|这场/u.test(pf)) merged.kind = "event";
    // one standing requirement about one kind: a request that names no kind is about it (a session-wide filter on one kind, then a bare question about a person)
    const kindsStanding = uniq(this.e.standing.flatMap((s) => (s.kinds === "all" || !s.named ? [] : s.kinds)));
    if (!merged.kind && kindsStanding.length === 1 && fu === "new" && (verb ?? "read") === "read" && (people.length > 0 || refs.some((r) => r.outcome === "bound") || !!tp.win || !!own.place || !!own.status)) {
      merged.kind = kindsStanding[0];
      for (const s of this.e.standing) if (s.kinds !== "all" && s.kinds.includes(merged.kind)) { if (s.place && !merged.place) merged.place = s.place; if (s.status && !merged.status) merged.status = s.status; }
    }
    // r07: "what else is on <a day>" (那天还有别的事吗 / その日ほかに何が入ってる) asks about that day's calendar
    if (!merged.kind && merged.time && (verb ?? "read") === "read" && (!prev?.time || !sameWin(prev.time, merged.time)) && /别的|其他|其它|还有啥|还有什么|他に|ほかに|ほか|入って|\belse\b|\bother\b/u.test(pf) && !refs.some((r) => r.outcome === "bound" && kindOfId(r.id!) !== "contact")) merged.kind = "schedule";
    const samePeople = people.every((p) => (prev?.people ?? []).includes(p));
    if (!merged.kind && prev?.kind && samePeople && !this.asksOtherContent(pf, prev) && (fu === "new" || fu === "follow_list" || fu === "ask_again_about") && (verb ?? "read") === "read" && !refs.some((r) => r.outcome === "bound" && kindOfId(r.id!) !== "contact") && (tp.anaphor || /别的|其他|其它|还有啥|他に|ほかに|ほか|\belse\b|\bother\b/u.test(pf))) merged.kind = prev.kind;
    if (!merged.kind && !prev?.kind && !people.length && (verb ?? "read") === "read" && /别的|其他|其它|还有啥|他に|ほかに|\belse\b|\bother\b/u.test(pf)) {
      // "anything else (that day)" with no request before: the kind of the records the turn before talked about
      const last = [...this.e.turns].reverse().find((t) => t.mentions.some((id) => kindOfId(id) !== "contact"));
      const ks = uniq((last?.mentions ?? []).map((id) => kindOfId(id)!).filter((k) => k !== "contact"));
      if (ks.length === 1) merged.kind = ks[0];
    }
    if (!merged.kind && own.status && (verb ?? "read") === "read") merged.kind = "todo";
    // r10: one more / the same again (再加一条 / もう1件 / another one) is of the kind of the latest change, else of the request before
    if (!merged.kind && verb === "create" && (ONE_MORE.test(pf) || anotherOnPurpose(pf))) {
      const k = this.e.lastTask()?.slots.kind ?? prev?.kind;
      if (k && k !== "contact") merged.kind = k;
    }
    if (!merged.verb && merged.kind) merged.verb = "read";
    // the hint fills a gap only with what this message itself says (checked field by field): a value the message does
    // not show, or one an earlier request already had, is never taken from the hint
    if (hp?.slots) this.fillFromHint(merged, own, prev, hp.slots, pf);
    this.noteRequest(pf, merged, own, tp.win ?? null, fu, refs);
    // r07: a write request starts a change of its own
    if (merged.verb && merged.verb !== "read" && merged.kind) {
      const at = this.e.turns.length;
      const target = refs.find((r) => r.outcome === "bound" && r.id && kindOfId(r.id) === merged.kind)?.id ?? null;
      const text = this.tf;
      this.taskOps.push(() => { this.e.addTask(merged, { turn: at, target, text }); });
    }
    return merged;
  }

  private fillFromHint(merged: Slots, own: Slots, prev: Slots | null, h: Slots, pf: string) {
    const earlier = this.e.turns.filter((t) => t.answered).map((t) => t.answered!);
    for (const w of this.e.userWindows) earlier.push({ time: w });
    if (prev) earlier.push(prev);
    // a time the message names in words this parser does not read (a day of the month, an English date …)
    if (!own.time && h.time && TIMEISH.test(pf) && !earlier.some((s) => s.time && sameWin(s.time, h.time)) && !this.e.facts.some((f) => f.time && sameWin(f.time, h.time!))) merged.time = h.time;
    // a person the message names in a spelling this code cannot place (a romanised name)
    if (!own.people?.length && h.people?.length && this.unknownProperNoun()) {
      const fresh = h.people.filter((p) => this.vis(p) && kindOfId(p) === "contact" && !earlier.some((s) => s.people?.includes(p)) && !this.e.turns.some((t) => t.mentions.includes(p)));
      if (fresh.length === h.people.length) merged.people = fresh;
    }
    // a topic / place whose words are in the message
    if (!own.topic?.length && h.topic?.length) {
      const said = h.topic.filter((w) => w && containsTerm(pf, fold(w)) || squash(pf).includes(squash(w)));
      if (said.length) merged.topic = said;
    }
    if (!own.place && h.place && (containsTerm(pf, fold(h.place)) || squash(pf).includes(squash(h.place)))) merged.place = h.place;
  }

  /** Facts, standing requirements and "this time only" conditions this message adds (applied on commit). */
  private noteRequest(pf: string, merged: Slots, own: Slots, win: TimeWindow | null, fu: FollowUpClass, refs: RefResult[] = []) {
    // r07: "when I say X I mean Y" — X names the one contact Y describes, for the rest of the conversation
    const al = userAliasIn(pf);
    if (al) {
      const g = peopleOf(this.ix, al.target).groups.filter((x) => x.ids.length === 1 && this.vis(x.ids[0]));
      if (g.length === 1) { this.aliasOut.push([al.said, g[0].ids[0]]); return; }
    }
    const statement = this.isStatement(pf);
    if (statement || fre(/経由|经由|通过|窓口|窗口|对接|担当|负责|都找|都是找|through|\bvia\b|handles|point of contact|goes through/u).test(pf)) {
      // "all of X goes through Y": a company and one named person of it
      const g = peopleOf(this.ix, pf);
      const named = g.named;
      for (const h of g.hits) if (h.how === "company" && named.length === 1 && h.ids.includes(named[0])) this.companyFactOut.push([h.said, named[0]]);
    }
    if (hasAny(pf, L.SESSION_SCOPE) && (hasAny(pf, L.ONLY_MARKERS) || hasAny(pf, L.NEG_DONE) || /都只|だけ/u.test(pf))) {
      const kind = kindIn(pf);
      const all = /所有|全部|一切|すべて|全て|everything|all kinds/u.test(pf);
      const s0 = statusIn(pf) ?? (hasAny(pf, L.NEG_DONE) && fre(/完|终わ|終わ|done|做完/u).test(pf) ? "open" : undefined);
      const ctxKind = kind ?? this.e.prevRequest()?.kind ?? (s0 ? "todo" : undefined);
      const st: Standing = { kinds: all || !ctxKind ? "all" : [ctxKind], named: !!kind };
      if (own.place) st.place = own.place;
      const s = statusIn(pf) ?? (hasAny(pf, L.NEG_DONE) && fre(/完|终わ|終わ|done|做完/u).test(pf) ? "open" : undefined);
      if (s) st.status = s;
      // r07: a topic the whole conversation is limited to (活动只看 <topic> 相关的)
      if (!st.place && !st.status && own.topic?.length) st.topic = own.topic;
      if (st.place || st.status || st.topic) { this.standingOut = st; return; }
    }
    if (statement && (own.place || win)) {
      this.factsOut = this.statementFacts(pf, own.place, win);
      return;
    }
    this.isRequestTurn = !!merged.kind && fu !== "follow_list";
    if (this.isRequestTurn) {
      this.requestOut = merged;
      // a question about one record of the result (a yes / no question about one item shown) leaves the result's "this time" conditions alone
      const aboutOne = refs.some((r) => r.outcome === "bound" && kindOfId(r.id!) !== "contact") && !own.time;
      if (aboutOne && !thisTimeOnly(pf)) { /* keep oneOff */ }
      else if (thisTimeOnly(pf)) {
        // "this time only": the filters of this request are not carried to the next one (standing ones come back on their own)
        const off: Partial<Record<keyof Slots, true>> = { place: true, topic: true, people: true };
        if (own.time && fu !== "new") off.time = true;
        this.oneOffOut = off;
      } else this.oneOffOut = {};
    }
  }

  commit(results: PartResult[]) {
    const e = this.e;
    const prev = e.turns.at(-1);
    const mentions: string[] = [...this.sentence];
    // people the message named by name (without the hint): they are mentions of this turn
    const ppl = peopleOf(this.ix, this.tf);
    for (const h of ppl.hits) if (h.ids.length === 1 && h.how !== "company" && this.vis(h.ids[0])) mentions.push(h.ids[0]);
    const filler = !mentions.length && !this.requestOut && !this.factsOut.length && !this.standingOut && !results.some((r) => r.continues);
    e.turns.push({ role: "user", at: this.at, text: this.message, tf: this.tf, mentions: uniq(mentions), listed: [], done: [], idle: prev ? Math.max(0, (Date.parse(this.at) - Date.parse(prev.at)) / MIN) : 0, filler });
    const own = parseTime(this.maskPeople(this.tf), this.today, e.prevRequest()?.time).win;
    if (own) e.userWindows.push(own);
    for (const p of this.hint?.parts ?? []) if (p.slots?.time) e.userWindows.push(p.slots.time);
    for (const r of results) if (r.request?.time) e.userWindows.push(r.request.time);
    for (const op of this.taskOps) op();
    e.facts.push(...this.factsOut);
    if (this.standingOut) e.standing.push(this.standingOut);
    if (this.requestOut) { e.lastUserRequest = this.requestOut; e.lastUserRequestTurn = e.turns.length - 1; }
    if (this.oneOffOut) e.oneOff = this.oneOffOut;
    // r07: keyed by the contact's stored company (the fact may name it in full, a later message by its short form)
    for (const [c, p] of this.companyFactOut) e.companyContact.set(this.ix.companyOf.get(p) ?? c, p);
    for (const [a, p] of this.aliasOut) e.userAlias.set(a, p);
  }
}

// ---------------------------------------------------------------- the budget (a pure rule)

export function clarificationBudget(i: { asked: number; unrelatedMessages: number; idleMinutes: number; replyClear: boolean }): "go" | "ask" | "deliver" | "shelve" {
  if (i.replyClear) return "go";
  if (i.asked >= 1 && (i.unrelatedMessages >= PARAMS.shelveAfterUnrelated || i.idleMinutes > PARAMS.idleMinutes)) return "shelve";
  if (i.asked >= PARAMS.askAtMost) return "deliver";
  return "ask";
}

// ---------------------------------------------------------------- word-level helpers

const FUNCTION_WORDS = L.KIND_WORDS.length ? [
  "的", "了", "吗", "呢", "吧", "啊", "嘛", "也", "都", "还", "就", "把", "给", "跟", "和", "与", "在", "是", "有", "要", "我", "你", "帮我", "一下", "那边", "这边", "边", "那", "这",
  "个", "条", "篇", "场", "位", "件", "份", "张", "些", "前面", "说的", "问的", "提到的", "聊到的",
  "の", "は", "が", "を", "に", "へ", "で", "と", "も", "から", "まで", "って", "ほう", "方", "やつ", "件", "こと", "です", "ます", "して", "しといて", "といて", "ね", "よ", "か", "っけ", "さっき", "前に",
  "the", "a", "an", "one", "ones", "of", "to", "for", "with", "my", "me", "please", "'s", "is", "it", "on", "in", "at", "and", "or", "about",
].map(fold) : [];
/** Removes every occurrence of the words (folded; Latin ones only as whole words). */
function stripWords(t: string, ws: readonly string[]): string {
  let s = t;
  for (const w of [...ws].filter(Boolean).sort((a, b) => b.length - a.length)) {
    if (/^[a-z0-9 .'&-]+$/.test(w)) s = s.replace(new RegExp(`(^|[^a-z0-9])${w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?=$|[^a-z0-9])`, "g"), "$1 ");
    else s = s.split(w).join(" ");
  }
  return s;
}
/** Words that open another topic (对了 / ところで / by the way). */
// ---------------------------------------------------------------- r10: when to ask (general vocabulary)

/** r10 (R43): the one the user went to last time (上次去的 / 前回行った / the last one I went to). */
const WENT_LAST = fre(/(?:上次|上回|上一次|最近一次|前回|この前|last time|the last)[^，,。、？?]{0,6}?(?:去|参加|行った|行って|出た|went|attended)|(?:去|参加)的上一[次场个]|i went to last/u);
const GENERIC_EVENT = ["活动", "いべんと", "event", "events"].map(fold);
/** r10: a pointer word at the end of a reference (<word>那条 / <word>のタスク / the <word> one). */
const POINTER_TAIL = fre(/(?:那|这)(?:条|个|篇|场|件|份|项)$|的(?:待办|笔记|日程|活动|纪要|任务)$|の(?:やつ|件|タスク|メモ|予定|イベント)$|\bone$|\b(?:todo|task|note|memo|event|meeting)$/u);
/** r10: done as a state of the thing named (<verb>済みの / 已完成的): no completion asked for. */
const DONE_STATE = fre(/(?:済み|完了済み|完成|已完成|完了)(?:の|的)/gu);
/** r10: a new record of a kind with its content after a colon (<kind>を追加：… / 加个<kind>：… / add a note: …). */
const NEW_RECORD = fre(/(?:メモ|タスク|todo|予定|笔记|待办|日程|备忘)を?(?:新規)?(?:追加|作成)(?:して|しといて|で)?\s*[：:]|\b(?:add|create) an? (?:new )?(?:note|memo|todo|task|reminder)\b/u);
/** r10: the day before the trip starts (group 1) or the day it starts. */
const DEPARTURE_DAY = fre(/(?:出发|出差|出発|出国|起飞|飛ぶ|発つ)(?:的)?(前一天|前日|の前日)|(前一天|前日)(?:に)?(?:出发|出発)|(?:the )?(day before) (?:i|we) (?:fly|leave|depart|go)|(?:出发|出発)(?:那天|当天|の日)|the day (?:i|we) (?:fly|leave|depart)/u);
/** r10: an also-clause asking for something to be done. */
const ALSO_ASK = fre(/^(?:还有|另外|然后|顺便|それと|あと|ついでに|also|and also|plus)[，,、\s]*.*(?:帮我|帮忙|弄|处理|办一下|做一下|やって|やっと|しといて|して(?:ほしい|おいて)|お願い|please|handle|take care)/u);
const STATE_SUMI = fre(/[\p{Script=Han}ぁ-ゖ]{0,5}済みの/gu);
/** r10: adding a person to a change (也加上 / も追加 / add … to that). */
const ADD_PERSON = fre(/也加上|也加进|加上(?:吧|去)?$|也算上|も追加|も入れ|も加え|\badd\b.{1,30}\b(?:to (?:that|it|this)|too|as well)\b|\binclude\b/u);
/** r10: is someone free (有空 / 空いてる / am I free). */
const AVAILABLE = fre(/有空|有没有空|空吗|有时间吗|空いて|空き(?:は|ある)|都合(?:が|は)|\b(?:am i|are you|is \w+|be) (?:free|available)\b|\bfree (?:on|at|next|this|tomorrow)\b/u);
/** r10: one more of the kind just made (再加一条 / もう1件 / add one more). */
const ONE_MORE = fre(/再(?:加|建|记|来)一(?:条|个|件|篇)|もう(?:一|1|ひと)(?:件|つ)|\bone more\b|\banother\b/u);
/** r10 (R44): plural person pronouns. */
const PLURAL_PRONOUN = fre(/(?:他们|她们|他們|她們)(?:俩|两个|二位|两位|三个|三位)?|彼ら(?:二人|2人|三人)?|彼女ら|彼女たち|あの(?:二人|2人)|その(?:二人|2人)|お二人|二人とも|the two of them|both of them|them both|the three of them/u);
/** r10: discourse words around a bare change (算了 / 那就 / nah). */
const DISCOURSE = fre(/^(?:算了|好吧|那就|还是|那|就|やっぱり|やっぱ|じゃあ|nah|just|then|ok|okay)$/u);
/** r10: what follows an ordinal of the talk (the last question / the first thing to do), not of a list. */
const META_AFTER = fre(/^\s*(?:个|つ)?(?:问题|问一?句|件(?:事)?(?:该|应该|要|得|先)|事(?:该|应该|要)|该|应该|にひとつ|の?(?:議題|议题|批|轮|章|节|阶段|段階|ステップ|步)|things? (?:i|we|you)\b|things? to\b|question\b|step|priority|of all)/u);
/** An ordinal that can be a list position (not an ordinal of the talk). */
export function listOrdinal(pf: string) {
  const o = L.ordinalOf(pf);
  return o && !META_AFTER.test(pf.slice(o.at[1])) ? o : null;
}

const PUT_INTO = fre(/(?:加进|加到|放进|放到|排进|排到|写进|记进|记到)\s*(?:我的)?\s*(?:日程|日历|行程|calendar|待办|todo|笔记|notes?)|予定に(?:入れ|追加)|カレンダーに(?:入れ|追加)|\b(?:add|put)\b.{0,24}\b(?:to|on|in|into)\b.{0,8}\b(?:calendar|schedule|to-?do list|notes)\b/u);

/** R38: a greeting or a filler word says nothing to do (thanks / OK / a closing need nothing and are not here). */
const GREETING = fre(/^(?:你好|您好|大家好|早上好|早安|早|上午好|中午好|下午好|晚上好|嗨|哈喽|哈啰|喂|hello|hi|hey|hiya|yo|morning|good morning|good afternoon|good evening|evening|おはよう(?:ございます)?|おはよ|こんにちは|こんばんは|もしもし|やあ)$/u);
const FILLER = fre(/^(?:呃+|额+|唔+|嗯哼|啊这|那个+|这个+|就是+|えっと|ええと|えーと|えー+|あのー*|うーん|うーむ|んー+|ん+と|u+h+|u+m+|h+m+|e+r+m*|well|so|ah+|oh+)$/u);
export function notARequest(pf: string): boolean {
  const toks = pf.split(/[\s,，、。.！!？?…~〜\-—:：;；'"“”]+/u).filter(Boolean);
  if (!toks.length) return /[…?？]/u.test(pf);
  // a trailing particle (你好呀 / おはよ〜ね) and a greeting of two words (good morning / hi there) change nothing
  const bare = (t: string) => t.replace(/(?:呀|啊|哈|哦|喔|嘛|よ|ね|です)+$/u, "");
  const whole = toks.map(bare).join(" ");
  if (GREETING.test(whole) || /^(?:good (?:morning|afternoon|evening)|hi there|hello there|hey there)(?: (?:all|everyone))?$/u.test(whole)) return true;
  if (toks.every((t) => GREETING.test(bare(t)) || FILLER.test(bare(t)) || /^(?:there|again|all|everyone)$/u.test(t)) && toks.some((t) => GREETING.test(bare(t)) || FILLER.test(bare(t)))) return true;
  // R41: an undecided word that answers nothing and asks for nothing (都行 / whatever) is no request either
  return toks.length <= PARAMS.undecidedMaxWords && hasAny(pf, L.UNSURE_MARKERS) && !kindIn(pf) && (verbIn(pf) ?? "read") === "read" && pf.replace(/[\s\p{P}]/gu, "").length <= PARAMS.undecidedMaxChars;
}
/** R39: someone else said something (<person>说要… / <person>が…って言って / <person> said …). */
const REPORTED_SPEECH = fre(/说要|说会|说过|说他|说她|提到|提过|讲过|讲了|告诉我|言って|言った|言ってた|って言|話して|said|says|told me|mentioned/u);
/** R39: what a named person said (<person>说… / <person>さんが言って / <person> said). */
const SAID_AFTER_NAME = fre(/^\s*(?:さん|先生|总|老师|様)?\s*(?:说|提到|讲|告诉我|が言|は言|から聞|said|says|told|mentioned)/u);
/** R40: "push it back / move it a bit" without saying how far. */
const VAGUE_SHIFT = fre(/推一推|挪一挪|往后推|往后挪|往后延|往后放|推后|延后一下|延期一下|晚一点|后ろにずら|後ろにずら|後ろ倒し|ずらしといて$|ずらして$|延ばして$|遅らせて$|push (?:it |that |this )?back|postpone it|move it later|a bit later/u);
const DURATION = fre(/(?:\d+|[一两二三四五六七八九十半几])\s*(?:个)?(?:天|日|周|週|星期|礼拜|个月|ヶ月|か月|小时|時間|分钟|分|days?|weeks?|months?|hours?|minutes?)/u);
/** R37: every occurrence of a recurring item (以后都 / 毎回 / all of them). */
const ALL_OCCURRENCES = fre(/以后都|以后每|每次|每周都|每个月都|全部|所有的|都改|整个系列|毎回|毎週|今後|以降|全部|すべて|every (?:time|week|one)|all (?:of them|future|occurrences)|from now on|the whole series|going forward/u);

const TOPIC_TURN = ["别件", "別件", "另一件事", "别的事", "对了", "另外", "顺便", "还有个事", "换个话题", "ところで", "そういえば", "それと", "あと、", "話変わるけど", "by the way", "btw", "unrelated", "also,"].map(fold);
/** Follow-up framing words (那…呢 / じゃあ…は / what about / instead), stripped before looking for the swapped object. */
const FOLLOW_WORDS = ["那么", "那就", "那", "要是", "如果是", "如果", "换成", "换", "改成", "的话", "怎么样", "如何", "呢", "じゃあ", "じゃ", "では", "それなら", "それじゃ", "だったら", "なら", "の場合", "場合", "はどう", "どう", "の方", "のほう", "ほう", "は",
  "what about", "how about", "and", "same for", "for", "instead", "then", "what", "about", "how", "case", "of", "with", "ones", "only", "just"].map(fold);
const EN_FOLLOW_STOP = ["what", "about", "how", "and", "same", "instead", "then", "case", "ones", "only", "just", "there", "those", "these", "them", "they", "any", "anything", "else", "other", "also", "can", "you", "could", "would", "show", "list", "give", "tell", "want", "need", "like", "see", "get", "has", "have", "are", "was", "were", "will", "our", "your", "their", "her", "his", "him", "she", "too", "well", "yes", "yeah", "okay", "fine", "sure", "thanks", "hmm", "right", "wait", "hold", "now", "today", "tomorrow", "week", "weeks", "month", "day", "days", "morning", "afternoon", "evening", "night", "next", "last", "this"];
/** Correction words that say outright the previous reading was wrong (the weaker ones are in L.CORRECT_MARKERS). */
const STRONG_CORRECT = ["不对", "搞错", "弄错", "看错", "错了", "我说的是", "我问的是", "我要的是", "我指的是", "我是说", "我是问", "我想问的是", "我问的其实是", "说错", "弄混", "搞混", "记错",
  "違う", "ちがう", "間違", "のことだった", "のつもり", "違くて", "間違えた", "勘違い", "じゃなくて", "ではなく",
  "no, i meant", "i meant", "not that", "wrong", "i asked about", "mixed up", "rather than", "instead of"].map(fold);
/** Words saying the message goes on with what was asked before (の続き / 接着 / same question). */
const CONTINUE_WORDS = ["続き", "続けて", "接着", "继续", "接上", "同じ質問", "同样的问题", "same question", "following up", "continuing"].map(fold);
const TIMEISH = fre(/\d|[一二三四五六七八九十]+[号日月]|[月火水木金土]曜|周[一二三四五六日天]|星期|礼拜|\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\b|\b(mon|tue|wed|thu|fri|sat|sun)[a-z]*\b|\b(today|tomorrow|tonight|week|month|weekend|morning|afternoon|evening)\b|今天|明天|后天|今日|明日|あさって|来週|今週|先週|来月|今月|月末|月初|上旬|中旬|下旬/u);
const STATE_QUESTION = fre(/(済み|完了|完成|搞定|做完|弄完|done|finished|complete)[^。]{0,6}([？?]|吗|么|か|っけ|了没|没有|了吗)$|^(is|was|did|has|have)\b.*\b(done|finished|complete)\b/u);
const IMPERATIVE = fre(/把|标|帮我|给我|请|して|にして|しといて|しておいて|お願い|mark|please|set\b/u);
/** Demonstratives that open a noun phrase (その… / 那个… / that …). */
const POINTER_PREFIXES = ["その", "あの", "この", "例の", "さっきの", "那个", "这个", "那", "这", "that", "this"].map(fold);
/** Capitalised words that open an English sentence and are not names. */
const PROPER_STOP = ["not", "yes", "sorry", "actually", "please", "but", "the", "that", "this", "nope", "hey", "hmm", "well", "also", "just", "only", "meant", "mean", "wait", "oops", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"];
const STRIP_CACHE = new Map<string, string>();
const STRIP_WORDS = [...L.BARE_POINTERS, ...L.PERSON_PRONOUN_F, ...L.PERSON_PRONOUN_M, ...L.PERSON_PRONOUN_ANY, ...L.HONORIFICS.filter((h) => !(h.length === 1 && isCjk(h))), ...L.RECENT_MARKERS, ...L.ANCHOR_WORDS, ...L.BEGINNING,
  ...FUNCTION_WORDS, ...L.KIND_WORDS.flatMap(([, w]) => w), ...L.VERB_WORDS.flatMap(([, w]) => w), ...["往前", "往后", "提前", "推迟", "标", "吧", "前倒し", "後ろ倒し", "しといて", "にして", "して", "ずらして"].map(fold)]
  .filter((w) => w.length >= 1).sort((a, b) => b.length - a.length);
const FUNCTION_SUBSTR =["那个", "这个", "那条", "这条", "那篇", "那场", "那位", "一下", "帮我", "给我", "我的", "的那", "那边", "什么", "哪个", "哪位", "那天", "そっ", "あの", "その", "この"].map(fold);
/** r08: words after a person that make the reference one of their records (folded text). */
const RECORD_TAIL = /那条|这条|那篇|这篇|那份|这份|那场|那次|那个|那件|那几条|的那|の件|のやつ|の[^ぁ-ゖ]{0,12}?(?:メモ|めも|タスク|たすく|予定|議事録)|めも|たすく|予定|議事録|纪要|笔记|备忘|待办|日程|活动|报告|报价|\bnotes?\b|\bmemos?\b|\btasks?\b|\btodos?\b|\bevents?\b|\bone\b|\blist\b/u;
/** r08: a pointer that names no kind (the <x> one / <x> 那个 / <x> のやつ). */
const GENERIC_ONE = /\b(?:one|ones)\b|(?:的那个|那个|的)$|(?:のやつ|のもの|の方|のほう)$/u;
/** r08: "same question, other object" markers at the edge of a message (what about … / 那 … 呢 / じゃあ … は？). */
const FOLLOW_ABOUT = /^(?:what|how)\s+about\b|^and\s|呢\s*[？?]?\s*$|^那(?![个些])|^じゃあ|^では|は\s*[？?]\s*$/u;
/** r08: kind words whose second character is also a word of its own after a pointer (要 = want). */
const SPLIT_KIND_WORDS = ["纪要", "摘要", "概要", "要点"];
const GENERIC_REF_WORDS = ["事", "事情", "东西", "那件事", "件"].map(fold);
const EN_STOP = ["the", "one", "ones", "that", "this", "it", "and", "of", "to", "for", "with", "my", "me", "please", "is", "on", "in", "at", "about", "from", "s", "up", "do", "did", "what", "when", "where", "who", "ok", "so", "be", "an", "a", "go", "ahead", "too", "also", "again", "done", "mark", "push", "share", "note", "notes", "todo", "task", "event"];

/** Latin spellings of city / district names (and other CJK spellings) → the first CJK spelling (the form places are compared in). */
const LATIN_PLACE: Record<string, string> = Object.fromEntries(L.PLACE_TABLE.flatMap(([ls, cs]) => [...ls, ...cs.slice(1)].map((w) => [w, cs[0]] as [string, string])));
const PLACE_WORDS = [
  ...L.CITY_WORDS,
  ...L.PLACE_TABLE.flatMap(([ls, cs]) => [...ls, ...cs]),
].map(fold).filter((w, i, a) => a.indexOf(w) === i).sort((a, b) => b.length - a.length);

/** r07: "when I say X, I mean Y" (以后我说<X>就是… / <X>って言ったら… / when I say <X> I mean …): X and Y. */
function userAliasIn(pf: string): { said: string; target: string } | null {
  const m = /(?:我说|我叫|我讲|我提到|说到)\s*[「“"]?([^，,、」”"\s]{1,8})[」”"]?\s*[，,、]?\s*(?:就是|就是指|是指|指的是|指|=)\s*(.{2,24})$/u.exec(pf)
    ?? /[「“"]?([^，,、」”"\s]{1,8}?)[」”"]?\s*(?:って言ったら|と言ったら|って言うのは|というのは)\s*(.{2,24}?)(?:のこと|です|だよ|だから|ね)?[。.!！]*$/u.exec(pf)
    ?? /\b(?:when i say|by)\s+["“]?([a-z][a-z. ]{1,20}?)["”]?\s*,?\s*i mean\s+(.{2,40})$/u.exec(pf);
  if (!m) return null;
  const said = m[1].trim(), target = m[2].replace(/[。.!！]+$/u, "").trim();
  return said && target ? { said, target } : null;
}
/** r07: a reply that only says yes (对 / うん / yes, plus a pointer at most). */
const YES_ONLY = /^(对|是的?|嗯|好的?|行|没错|对的|就是|うん|はい|ええ|そう|それ|yes|yeah|yep|right|correct|that's it|that one|sure|ok)[，,、。!！\s]*(就|那|それ|その|これ|this|that|it)?(那个|这个|它|那场|那条|那篇|那位|で(いい|お願い)?|です|one|is it|please)?[。!！\s]*(就那个|就是它|で|お願い|please)?[。!！]*$/u;
const NO_WORD = /不|没|别|違|ちが|いや|いいえ|no\b|not|nope/u;
/** r07: morning / afternoon / evening named in a reply or an option label. */
function dayPartOf(t: string, label = false): "am" | "pm" | "eve" | null {
  if ((label ? /晚|夜|evening|night/u : /晚上|夜|今夜|evening|night|tonight/u).test(t)) return "eve";
  if (/下午|午後|afternoon/u.test(t)) return "pm";
  if ((label ? /早|朝|午前|上午|morning/u : /早上|早晨|上午|朝|午前|morning/u).test(t)) return "am";
  return null;
}
function clockPart(label: string): "am" | "pm" | "eve" | null {
  const m = /(\d{1,2})[:：](\d{2})/u.exec(label);
  if (!m) return null;
  const h = Number(m[1]);
  return h < 12 ? "am" : h < 17 ? "pm" : "eve";
}
/** r07: the user's own side / whereabouts as the object of a question. */
const MY_SIDE = /^(?:那|那么|じゃあ|では|それで|and\s+)?\s*(?:我|私|わたし|僕|俺)(?:的|の)?(?:方|ほう|这边|那边|这里|那里)|^(?:and\s+|what about\s+)?(?:me|my side|mine|where i(?:'ll| will|'m| am)? be|where i am)\b/u;
/** r07: the content a change is given in words (内容改成要 X / 内容は X / content: X): X. */
function contentSet(message: string): string | null {
  const m = /(?:内容|主题|事由|件名|タイトル|中身|content|title|subject)\s*(?:改成|换成|改为|是|为|は|を|:|：|to|should be)?\s*(?:要)?\s*([^，。,.!！？?、]{1,24})/iu.exec(message);
  if (!m) return null;
  const w = m[1].replace(/(に(して|変えて|変更)|で(お願い)?|吧|了)$/u, "").trim();
  return w.length >= 2 ? w : null;
}
/** r07: "this time only" (这次 / 今回), unless it is "this conversation" (这次对话里 = the whole talk). */
function thisTimeOnly(pf: string): boolean {
  return hasAny(pf, L.THIS_TIME) && !hasAny(pf, L.SESSION_SCOPE.filter((w) => hasAny(w, L.THIS_TIME)));
}
/** r07: a folded CJK spelling of a well-known place → the table's first (world-style) spelling. */
const PLACE_DISPLAY = new Map<string, string>(L.PLACE_TABLE.flatMap(([, cs]) => cs.map((c) => [fold(c), cs[0]] as [string, string])));
/** A text with well-known places in Latin letters or kana rewritten in their CJK spelling. */
function canonPlaces(t: string): string {
  let out = t.replace(/[a-z][a-z' ]*[a-z]/g, (w) => {
    if (LATIN_PLACE[w]) return LATIN_PLACE[w];
    return w.split(" ").map((x) => LATIN_PLACE[x] ?? x).join(" ");
  });
  // r06: a two-kana word is too short to be read as a place (なら is a conditional, not Nara)
  for (const k of kanaWords(out)) { const p = k.length >= 3 ? LATIN_PLACE[romaji(k)] : undefined; if (p) out = out.split(k).join(p); }
  return out;
}

/** r06: a CJK negation / keep word right after a term, optionally after a topic particle (Xはそのまま / X就别动). */
function cjkNegAfter(rest: string): boolean {
  const r = rest.replace(/^(は|も|就|先|还是|的话|呢|啊)/u, "");
  return L.NEGATION_AFTER.filter((n) => !/^[a-z ]+$/.test(n)).some((n) => r.startsWith(n.replace(/\s+/g, "")));
}
const FIELD_OPTIONS: Record<string, string[]> = {
  dueAt: ["截止", "截止日", "期限", "締め切り", "締切", "しめきり", "deadline", "due", "due date", "到期"],
  plannedDate: ["计划日", "计划", "予定日", "予定", "planned", "plan date", "planned date", "安排在"],
  keep: ["先不删", "不删", "别删", "不要删", "不用删", "算了", "留着", "保留", "やめ", "残し", "残す", "残して", "そのまま", "消さない", "消さないで", "削除しない", "keep", "don't delete", "do not delete", "no need to delete", "cancel", "never mind"],
  unlink: ["解除关联", "只解除", "取消关联", "紐づけを外", "紐付けを外", "関連付けを外", "unlink", "just unlink"],
  delete_attendance: ["连出席记录", "连记录", "出席记录一起", "记录也", "也一起删", "一起删", "都删", "記録ごと", "記録も", "まとめて消", "両方", "with the record", "record too", "records too", "attendance too", "attendance record", "delete both", "both"],
};

/** Weekday words of any language → one token (周一 / 月曜 / Monday → 〔1〕), so a reply and an option label can meet. */
function canonWeekday(s: string): string {
  const cn: Record<string, string> = { 一: "1", 二: "2", 三: "3", 四: "4", 五: "5", 六: "6", 日: "7", 天: "7" };
  const ja: Record<string, string> = { 月: "1", 火: "2", 水: "3", 木: "4", 金: "5", 土: "6", 日: "7" };
  const en = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];
  return s
    .replace(/(?:每?周|星期|礼拜)([一二三四五六日天])/gu, (_, d) => `〔${cn[d]}〕`)
    .replace(/([月火水木金土日])曜(?:日)?/gu, (_, d) => `〔${ja[d]}〕`)
    .replace(/\b(mon|tue|wed|thu|fri|sat|sun)[a-z]*\b/gu, (_, d) => `〔${en.indexOf(d) + 1}〕`);
}

function splitClauses(message: string): string[] {
  const parts = message.split(/(?<=[。；;！!？?，,])|(?=(?:，|,|\s)(?:顺便|另外|还有|然后|对了|再加|并且|而且|あと|それと|ついでに|それから|also|and also|plus|btw))|(?=(?:顺便|另外|还有|然后|あと、|それと|ついでに|Also,|also,))/u).filter((s) => s && s.trim());
  return parts;
}

function kindsOfPointer(sf: string): RecordKind[] | null {
  for (const [ws, ks] of L.POINTER_KINDS) if (hasAny(sf, ws)) {
    const k = kindIn(sf);
    return k ? [k] : ks.filter((x) => x !== "memo" || ws !== L.POINTER_KINDS[3][0]);
  }
  const k = kindIn(sf);
  if (k) return [k];
  if (/的人$|の人$|那位|这位|人目/u.test(sf)) return ["contact"];
  return null;
}

function pronounOf(sf: string): "f" | "m" | "any" | null {
  if (hasAny(sf, L.PERSON_PRONOUN_F)) return "f";
  if (hasAny(sf, L.PERSON_PRONOUN_M)) return "m";
  if (hasAny(sf, L.PERSON_PRONOUN_ANY)) return "any";
  return null;
}

/** Words that only ask "who" (谁 / の人) do not make a contact request; these ask for a contact's details. */
const WEAK_CONTACT = ["谁", "誰", "哪几位", "哪些人", "什么人", "是做什么的", "的人", "の人"].map(fold);
export function contactInfoAsked(pf: string): boolean {
  const ws = L.KIND_WORDS.find(([k]) => k === "contact")![1].filter((w) => !WEAK_CONTACT.includes(w));
  return hasAny(pf, ws);
}
/** An add-items word, read with the kind words masked (a kind word ending in も must not make "も見せ"). */
export function addsItems(pf: string): boolean {
  return hasAny(stripWords(pf, L.KIND_WORDS.flatMap(([, w]) => w).filter((w) => !/^[a-z]/.test(w))), L.ADJUST_ADD);
}
/** A wh-question about something other than "is there any" (几点 / どこ / who): it asks a thing of its own. */
function isQuestionAbout(pf: string): boolean {
  return fre(/几点|在哪|哪里|谁|多少|怎么|為什么|为什么|何時|どこ|誰|なぜ|どうして|\b(who|where|why|how much|what time)\b/u).test(pf);
}
export function kindIn(pf: string): RecordKind | undefined {
  let best: { k: RecordKind; i: number; len: number } | null = null;
  for (const [k, ws] of L.KIND_WORDS) {
    for (const w of ws) {
      let i = indexOfTerm(pf, w);
      while (i >= 0) {
        const pri = k === "contact" ? -1000 : 0;
        if (!best || i + pri > best.i + (best.k === "contact" ? -1000 : 0)) best = { k, i, len: w.length };
        i = indexOfTerm(pf, w, i + 1);
      }
    }
  }
  return best?.k;
}

/**
 * r12: the kind the user states for a new record: a kind word governed by a create verb (建个<kind> / 新建<kind> /
 * <kind>を追加 / <kind>作って / create a <kind>) or a kind word opening a title with a colon (<kind>：…). Words inside the
 * title that follows never supply the kind. Several different stated kinds: none.
 */
const STATED_KIND_RES: [RecordKind, RegExp][] = (["todo", "memo", "schedule"] as RecordKind[]).map((k) => {
  const ws = (L.KIND_WORDS.find(([kk]) => kk === k)?.[1] ?? []).filter((w) => w.length >= 2 || /[^\x00-\x7f]/u.test(w));
  const alt = [...ws].sort((a, b) => b.length - a.length).map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|");
  const K = `(?:${alt})`;
  return [k, new RegExp([
    `(?:建|新建|创建|加|添加|增加|记|写|设|设置|开|整|弄)\\s*(?:一|1)?\\s*(?:个|条|篇|项|则|份)?\\s*(?:新的?)?\\s*${K}`,
    `${K}\\s*(?:を|に|も)?\\s*(?:新規)?\\s*(?:作|追加|登録|作成|入れ|立て)`,
    `\\b(?:create|add|make|new|set up|start|write|log|open)\\s+(?:me\\s+)?(?:a|an|one|another|one more)?\\s*(?:new\\s+)?${K}(?![a-z])`,
    `(?:^|[\\s，,。.!！?？])${K}\\s*[：:]`,
  ].join("|"), "u")];
});
/** r12: a generic organisation name: a CJK / kana run ending with a generic company ending of 2+ chars (at least 2 chars before it), or Latin words + a corporate ending. */
const ORG_SUFFIXES = [...L.COMPANY_SUFFIXES].filter((w) => [...w].length >= 2 && !/[a-z]/u.test(w)).sort((a, b) => b.length - a.length);
const LATIN_ORG = /\b[a-z][a-z&.-]+\s+(?:inc|ltd|llc|corp|corporation|co|gmbh|group|holdings|capital|partners|ventures|labs|bank|technologies|systems)\b/u;
export function namesOrganisation(tf: string): boolean {
  if (LATIN_ORG.test(tf)) return true;
  return chunks(tf).some((c) => { const run = /^[\p{Script=Han}ぁ-ゖァ-ヺー]+/u.exec(c)?.[0] ?? ""; return ORG_SUFFIXES.some((x) => [...run].length >= [...x].length + 2 && run.includes(x) && run.indexOf(x) >= 2); });
}

export function statedKindIn(pf: string): RecordKind | undefined {
  const ks = STATED_KIND_RES.filter(([, re]) => re.test(pf)).map(([k]) => k);
  return ks.length === 1 ? ks[0] : undefined;
}

export function verbIn(pf: string): string | undefined {
  // r10: putting something into a calendar / list (加进日程 / 放进日历 / add it to my calendar) creates it
  if (PUT_INTO.test(pf)) return "create";
  // r10: <verb>済みの<noun> (<verb>済みの<kind>) names things by a state: no verb of the request
  const pv = pf.replace(STATE_SUMI, " ");
  for (const [v, ws] of L.VERB_WORDS) if (hasAny(v === "complete" ? pv.replace(DONE_STATE, " ") : pv, ws)) {
    // "is it done / 済み？ / 完成了吗": a question about the state, not an instruction to change it
    if (v === "complete" && STATE_QUESTION.test(pf.trim()) && !IMPERATIVE.test(pf)) return "read";
    return v;
  }
  // "<a day>にして" sets a date (金曜にして / 12日にしといて); "<filter>のだけにして" does not
  if (fre(/(曜日?|[日号天]|\d|周[一二三四五六日天]|明日|明後日|あさって|来週|今日|月末)に(して|しといて|しておいて|変えて)/u).test(pf)) return "update";
  if (isQuestion(pf) || fre(/看|見せ|show|list|列|出して|教えて|调出|打开|開いて|找/u).test(pf)) return "read";
  return undefined;
}

function statusIn(pf: string): "open" | "done" | undefined {
  if (hasAny(pf, L.NEG_DONE) && fre(/完|终わ|終わ|done|做完/u).test(pf)) return "open";
  if (hasAny(pf, L.OPEN_WORDS)) return "open";
  if (hasAny(pf, L.DONE_WORDS) && !/去掉|拿掉|drop|不用/u.test(pf)) return "done";
  return undefined;
}

function topicIn(pf: string, names: string[]): string[] {
  const out: string[] = [];
  for (const re of L.TOPIC_PATTERNS) {
    const m = re.exec(pf);
    if (!m) continue;
    let w = m[1].trim();
    for (const n of names) if (w.includes(n)) w = "";
    w = w.replace(/^(跟|和|与|有关|的|哪些|有什么|什么|下周|这周|下下周|今天|明天|来周|今周|再来周|next week|this week|只要|只看|只|这次|今回は|今回|就要|有哪些)+/u, "").replace(/(的)$/u, "");
    // r07: the topic is what follows the last kind word / "only" word (活动只看 <topic> 相关的 → <topic>)
    if (kindIn(w) || hasAny(w, L.ONLY_MARKERS)) {
      let cut = 0;
      for (const x of [...L.KIND_WORDS.flatMap(([, ws]) => ws), ...L.ONLY_MARKERS]) { const i = w.lastIndexOf(x); if (i >= 0 && i + x.length > cut) cut = i + x.length; }
      w = w.slice(cut).replace(/^(的|は|の|只看|只要|只|看)+/u, "").trim();
    }
    if (w.length >= 2 && !/^(什么|哪些|有关|相关|所有)$/u.test(w) && !kindIn(w)) out.push(w);
  }
  return uniq(out);
}

/** The two sides of a contrast: 不是A，是B / AじゃなくてB / not A, B / B, not A (null when there is none). */
function contrastSides(pf: string): { neg: string; pos: string } | null {
  let b = /^(.{1,30}?)[，,、\s]+(?:不是|不要|而不是|并不是)(.{1,24})$/u.exec(pf);
  if (b) return { neg: b[2], pos: b[1] };
  let m = /(?:不是|并不是|并非|不要)(.{1,24}?)[，,、\s]*(?:而是|就是|是|我要的是|要的是|我要|要)(.{1,30})/u.exec(pf);
  if (m) return { neg: m[1], pos: m[2] };
  m = /(.{1,30}?)(?:じゃなくて|ではなくて|じゃなく|ではなく)[、,\s]*(.{1,30})/u.exec(pf);
  if (m) return { neg: m[1], pos: m[2] };
  m = /\bnot\s+(.{1,30}?)\s*[,，—–-]+\s*(?:but\s+)?(.{1,30})/u.exec(pf);
  if (m) return { neg: m[1], pos: m[2] };
  m = /(.{1,30}?)[,，]\s*not\s+(.{1,30})/u.exec(pf);
  if (m) return { neg: m[2], pos: m[1] };
  return null;
}

function kindAfterWant(pf: string): RecordKind | undefined {
  const m = /(要的是|的是|想要|看的是|のほう|の方|instead)(.{0,8})/u.exec(pf);
  if (m) { const k = kindIn(m[2]) ?? kindIn(pf.slice(0, m.index + m[0].length)); if (k) return k; }
  const neg = /(不是|じゃなくて|ではなく|not)\s*(.{0,6})/u.exec(pf);
  if (neg) {
    const bad = kindIn(neg[2]);
    for (const [k, ws] of L.KIND_WORDS) if (k !== bad && k !== "contact" && ws.some((w) => containsTerm(pf, w))) return k;
  }
  return undefined;
}

function contentRun(w: string, text: string): number {
  if (/^[a-z0-9 ]+$/.test(w)) return containsTerm(text, w) || text.includes(w.replace(/\s+/g, "")) ? w.length : 0;
  return commonRun(w, text);
}

function groupByKind(list: string[]): Map<RecordKind, string[]> {
  const g = new Map<RecordKind, string[]>();
  for (const id of list) { const k = kindOfId(id)!; g.set(k, [...(g.get(k) ?? []), id]); }
  return g;
}

/** Reference words of a part when the model gives none: pronouns, pointers with their noun, ordinals, names + pointer. */
export function spotRefs(ctx: TurnCtx, quote: string): string[] {
  // r11: an exact pick (@ + a whole title) is one reference; nothing inside it is another
  const out: string[] = ctx.exactPicks(quote).filter((p) => p.ids.length === 1).map((p) => p.said);
  const q = quote;
  const re = new RegExp([
    // ordinals with their noun
    "(?:上から)?第\\s*[一二两三四五六七八九十\\d]+(?![\\d一二两三四五六七八九十]|\\s*(?:届|回|期|次|版|号|代|年|季|天|周|週))\\s*(?:个人|个|条|篇|场|位|件|项|名)?",
    "[一二三四五六七八九十\\d]+\\s*(?:番目|つ目|個目|个目|件目|人目|本目)(?:の(?:人|方|やつ|タスク|メモ|予定|イベント))?",
    "(?:the\\s+)?(?:first|second|third|fourth|fifth|1st|2nd|3rd|4th|5th)(?:\\s+one)?",
    "#\\s*\\d+",
    "(?:一番)?最初の(?:やつ|人|方|タスク|メモ|予定|イベント|件)?|一番目の?|(?:the\\s+)?(?:very\\s+)?first\\s+one",
    // r07: a record anchored by a time word (今夜の交流会 / 昨天的会 / tonight's wine event)
    "(?:今夜|今晩|今日|昨日|明日|昨夜|昨晩|今朝)の[\\p{Script=Han}\\p{Script=Katakana}ー]{2,6}",
    "\\b(?:tonight's|today's|yesterday's|tomorrow's|this morning's)\\s+(?:[a-z]+\\s+){0,2}?(?:event|meeting|party|dinner|lunch|call|session|one)\\b",
    // r10 (R43): the <event> the user went to last time (上次去的<event> / 前回行った<event>)
    "(?:上次|上回|上一次|前回|この前)[^，、。？?\\s]{0,4}?(?:去|参加|行った|参加した)(?:的|の)?(?:那个|那场)?[\\p{Script=Han}\\p{Script=Katakana}ー]{2,8}",
    // r07: the contact person of a company (<company>の窓口 / <company>的对接人)
    "[\\p{Script=Han}\\p{Script=Katakana}A-Za-z]{2,10}?(?:の窓口|的窗口|的对接人|的联系人|の担当者?)",
    // r07: "the other one" (另一条<noun>的 / もう一つの方 / the other one)
    "另(?:外)?一(?:个|条|篇|场|位|件|份|项)[\\p{Script=Han}A-Za-z]{0,6}?的?(?=[，。？?！!、\\s]|也|呢|吧|就|都|一样|标|改|挪|删|$)",
    "もう(?:一|1|ひと)つ(?:の(?:やつ|方|ほう|件|タスク|メモ|予定))?|もう片方(?:の(?:やつ|方|ほう))?",
    "剩下(?:的)?(?:那|这|一)?(?:个|条|篇|场|件)|残りの(?:やつ|方|ほう|件|タスク)?|\\bthe remaining one\\b",
    "\\bthe other(?:\\s+(?:one|task|todo|note|memo|event|meeting))?\\b",
    // pronouns (+ what of theirs)
    "(?:她|他|它)(?!们|們)",
    "彼女|彼(?!ら)",
    "\\b(?:she|her|he|him|his|it)\\b",
    // r10: 这人 / 那人 (this person)
    "(?:这|那)人(?!家|们|們)",
    // pointers with a Latin noun (那个 <noun>)
    "(?:那个|这个|那|这)\\s*[a-zA-Z][a-zA-Z0-9-]{1,}(?:\\s+(?:one|event|meeting|notes?))?",
    // pointers with a noun
    "(?:刚才|刚刚|之前|前面|昨天|昨晚|一开始问的|最开始|一开始)?(?:那|这)(?:篇|条|场|位|件|份|个|项|次)[^，。？?！!、\\s]{0,6}?(?=[，。？?！!、\\s]|我|你|他|她|了|吗|有没有|有什么|没有|能不能|可以|还|都|已经|报名|查一下|问一下|说过|发给|做完|到底|什么|啥|怎么|帮|改|标|删|也|的|里|是|在|几|要|给|提|往|挪|推|先|下|分享|转|呢|吧|$)",
    "(?:さっきの|あの|その|この|例の|前の|前回の)[^、。？?！!\\s]{1,8}?(?=[、。？?！!\\s]|って|は|を|に|の|も|で|が|だと|と|、|$)",
    // a content word with a pointer noun (<noun>の予定 / <noun>のやつ / <noun> 那条 / the <noun> one / those <noun> notes)
    "[\\p{Script=Han}\\p{Script=Katakana}A-Za-z0-9ー]{2,8}の(?:やつ|件|予定|タスク|メモ|イベント)",
    "[\\p{L}\\p{N}][\\p{L}\\p{N} ]{1,14}?\\s*(?:的那|那)(?:条|个|篇|场|次|件|位)[\\p{Script=Han}]{0,2}?(?=[，。？?！!、\\s]|几|是|在|的|呢|吧|改|标|也|现在|做|办|弄|完|删|发|处理|取消|挪|推|$)",
    "\\b(?:the|those|that|this)\\s+(?:[a-z0-9-]+\\s+){1,3}(?:one|ones|notes?|todo|task|event|memo|meeting|list)\\b",
    "(?:さっきの|あの|その|この|例の)(?:件|やつ)",
    "(?:that|this)\\s+(?:one|note|event|meeting|lunch|task|todo|memo)",
    "\\b(?:that|this)\\b(?=\\s+(?:one|too|$))",
    "それ|これ|あれ|そっち|こっち",
    "那个|这个|那件事",
  ].join("|"), "giu");
  const qf = fold(q);
  const qTime = parseTime(qf, "2000-01-03").spans;
  for (const m of q.matchAll(re)) {
    // r10: an ordinal of the talk itself (最后一个<问题> / the first thing to …) points at no list item
    if (L.ordinalOf(fold(m[0])) && META_AFTER.test(fold(q.slice((m.index ?? 0) + m[0].length)))) continue;
    // r07: a connective in front (顺便 / 另外 / 还有 / 然后) is not part of the reference
    const s = m[0].trim().replace(/^(?:顺便|另外(?!一)|还有|对了|然后|而且|并且|ついでに|それと)\s*[，,、]?\s*/u, "");
    // a pointer before a Latin word that belongs to a time expression (a pointer and then "next" + a week word) is no record reference
    const lat = /^(?:那个|这个|那|这)\s*(?=[a-zA-Z])/u.exec(s);
    if (lat) { const at = (m.index ?? 0) + m[0].indexOf(s) + lat[0].length; if (qTime.some(([a, b]) => a <= at && at < b)) continue; }
    // a day / a place pointed at (その日 / 那天 / 那边 / 向こう) is not a record reference
    const pre = /^(.+?)(?:の(?:やつ|件|予定|タスク|メモ|イベント)|的?那[条个篇场次件位])$/u.exec(s)?.[1];
    if (pre && (parseTime(fold(pre), "2000-01-01").win || pronounOf(fold(pre)))) {
      // r07: the pronoun itself stays a reference (把他那个 todo → 他)
      const pm = /她|他|它|彼女|彼/u.exec(pre);
      if (pm && !parseTime(fold(pre), "2000-01-01").win) out.push(pm[0]);
      continue;
    }
    if (!s || /^(その|あの|この|那|这)(日|天|时候|時|週|周|間|期間|期间|時期|頃|几天|边|辺|ほう|边儿|里|次|後|前|あと|先|个月|个星期|个礼拜|个周末|周末|个时候|阵子|会儿|一阵|年|月)$/u.test(s) || /^(そっち|あっち|こっち)$/u.test(s) && /で|に|は/u.test(q.slice(q.indexOf(s) + s.length, q.indexOf(s) + s.length + 1)) && false) continue;
    out.push(s);
  }
  // r07: a pointer with a Latin noun is looked for on its own too (an earlier match may have taken its pointer:
  // <time word>那个 <noun>, 昨天说的那个 <noun> 会); a CJK kind character after the noun belongs to it
  for (const m of q.matchAll(/(?:那个|这个|那|这)\s*[a-zA-Z][a-zA-Z0-9-]{1,}(?:\s+(?:one|event|meeting|notes?))?(?:\s*(?:会|局|活动|会议))?/gu)) {
    const at = (m.index ?? 0) + m[0].search(/[a-zA-Z]/);
    if (qTime.some(([a, b]) => a <= at && at < b)) continue;
    out.push(m[0].trim());
  }
  // r10: the object of a change described by its content and kind (把<words>的待办推到<day>)
  if (/^(?:update|delete|complete)$/u.test(verbIn(fold(q)) ?? "")) for (const m of q.matchAll(/([\p{Script=Han}A-Za-z0-9]{2,10})的(?:待办|笔记|日程|活动|纪要|任务)/gu)) {
    // only the words right before 的 (no pointer, pronoun or connective of the sentence), and only where no other reference is
    // a description under a pointer or pronoun (她那条<words>的待办) is that pointer's, not a reference of its own
    if (/[那这她他它]/u.test(m[1])) continue;
    const head = m[1].split(/[把将]/u).pop()!.replace(/^(?:另外|还有|然后|顺便|对了)/u, "");
    const span = head + m[0].slice(m[1].length);
    const at = (m.index ?? 0) + m[0].length - span.length;
    if (head.length >= 2 && !out.some((o) => { const i = q.indexOf(o); return i >= 0 && i < at + span.length && at < i + o.length; })) out.push(span);
  }
  // a name with a pointer (<name>那条 / <name>さんの方 / <name>的那条)
  const ix = ctx.ix;
  const f = fold(q);
  for (const h of peopleOf(ix, f).groups) {
    const after = q.slice(h.at[1], h.at[1] + 24);
    const m = /^\s*(?:(?:さん|様)?の\s*[\p{Script=Han}\p{Script=Katakana}ーA-Za-z0-9](?:[\p{Script=Han}\p{Script=Katakana}ーA-Za-z0-9 ]|(?![にをがはへでとも])\p{Script=Hiragana}){1,13}?\s*(?:の(?:件|やつ|メモ|タスク|予定)|(?<!の)(?:メモ|タスク|議事録|予定))|(?:的|さんの|の|'s)?\s*(?:(?:那个|那条)\s*(?:todo|task|memo|note|event)|那条|那篇|那场|那个|那份|那几条|那边的?|方|ほう|やつ|件|タスク|メモ|one|todos?|tasks?|那位|notes?|memos?|events?|meetings?|(?:さん|様)?との\s*[\p{Script=Han}\p{Script=Katakana}ーa-z]{2,8}))/u.exec(after);
    const before = /(?:那个|这个|那位|这位)$/u.exec(q.slice(0, h.at[0]));
    const start = before ? h.at[0] - before[0].length : h.at[0];
    // r10: <person>の<time>の予定 in a question is the set of that person's items in that time (来週の予定), not one record
    const setByTime = !!m && verbIn(f) === "read" && !!parseTime(fold(m[0]), "2000-01-03").win && !/那条|那个|那篇|那场|这条|这个/u.test(m[0]);
    if (m && !setByTime) out.push(q.slice(start, h.at[1] + m[0].length));
    else if (h.named && (h.ids.length > 1 || before || peopleOf(ix, f).hits.filter((x) => x.at[0] >= h.at[0] && x.at[1] <= h.at[1]).length > 1)) out.push(q.slice(start, h.at[1]));
  }
  // a record named by its title (<title>挪到…)
  if (!out.length) {
    const sq = f.replace(/\s+/g, "");
    for (const r of ix.recs.values()) {
      if (r.kind === "contact" || r.titleF.length < 2 || !sq.includes(r.titleF) || !visible(ix, r.id, ctx.gone)) continue;
      const i = f.indexOf(r.titleF);
      // r10: a title inside a time expression (下周会… holds 周会) is not said
      if (i >= 0 && qTime.some(([x, y]) => x < i + r.titleF.length && i < y)) continue;
      out.push(i >= 0 ? q.slice(i, i + r.titleF.length) : r.title);
    }
  }
  // a name followed by an ordinal in the same clause (<name> 那几条里的第二条) is one reference
  for (let a = 0; a < out.length; a++) for (let b = 0; b < out.length; b++) {
    if (a === b) continue;
    const ia = q.indexOf(out[a]), ib = q.indexOf(out[b]);
    if (ia < 0 || ib < 0 || ib <= ia) continue;
    const gap = q.slice(ia + out[a].length, ib);
    if (gap.length <= 4 && !/[，,。、；;？?！!]/u.test(gap) && L.ordinalOf(fold(out[b])) && !L.ordinalOf(fold(out[a])) && !pronounOf(fold(out[a]))) out.push(q.slice(ia, ib + out[b].length));
  }
  // r07: two references that overlap in the message are one (<pointer phrase>那个 + 那个 <noun> → one span)
  for (let changed = true; changed;) {
    changed = false;
    for (let a = 0; a < out.length && !changed; a++) for (let b = 0; b < out.length && !changed; b++) {
      if (a === b) continue;
      const ia = q.indexOf(out[a]), ib = q.indexOf(out[b]);
      if (ia < 0 || ib < 0 || !(ia < ib && ib < ia + out[a].length && ib + out[b].length > ia + out[a].length)) continue;
      const merged = q.slice(ia, ib + out[b].length);
      out.splice(Math.max(a, b), 1); out.splice(Math.min(a, b), 1, merged);
      changed = true;
    }
  }
  // r07: a kind word right after a reference belongs to it (…那份<topic>的纪要): it tells the kind of the record
  for (let k = 0; k < out.length; k++) {
    const i = q.indexOf(out[k]);
    // a bare pronoun stays the person (彼のタスク: 彼 is who, not which record)
    if (i < 0 || /^(?:她|他|它|彼女|彼|she|he|her|him|his|it)$/iu.test(out[k].trim())) continue;
    const m = /^\s*(?:的|の)?\s*(?:纪要|笔记|备忘录?|待办|日程|活动|メモ|議事録|タスク|予定|イベント|notes?|memo|task|todo|event)/u.exec(q.slice(i + out[k].length));
    if (m) out[k] = q.slice(i, i + out[k].length + m[0].length);
  }
  // r08: a span cut inside a two-character kind word (<pointer><noun first char> | 要…: the pointer stopped before 要) gets the rest of it
  for (let k = 0; k < out.length; k++) {
    const i = q.indexOf(out[k]);
    if (i < 0) continue;
    const rest = q.slice(i + out[k].length);
    for (const w of SPLIT_KIND_WORDS) if (out[k].endsWith(w[0]) && rest.startsWith(w.slice(1))) { out[k] += w.slice(1); break; }
  }
  // overlapping spans: keep the longer
  const spans = uniq(out).sort((a, b) => b.length - a.length);
  const keep: string[] = [];
  for (const s of spans) if (!keep.some((k) => k.includes(s))) keep.push(s);
  return keep;
}

/**
 * r09: function words on the ends of a reference span are not part of it. zh: a disposal marker (把 / 将) with the
 * request words before it, a framing clause (我要问的是 …), and a preposition (跟 / 给 / 和 …) when all that follows it up
 * to the pointer is one person (跟<person>那条 — but 跟<person>打球那个 keeps it: the preposition is inside the
 * description); ja: a conjunction or a case particle in front, a topic / case particle at the end; en: discourse words,
 * articles and verbs in front, a preposition in front only before a pointer or a person, a preposition at the end.
 * A leading character that starts a person's name is never cut.
 */
const ZH_DISPOSAL = /^(?:(?:请你?|麻烦你?|帮忙|帮我|替我|给我|你|我想|我要|想|要|能不能|能否|可不可以|可以)\s*)*(?:把|将)\s*/u;
const ZH_FRAME = /^(?:[^，,。、\s]{0,8}?的是|就是|是)\s*/u;
const ZH_PREP = /^(?:跟|和|与|同|给|对|向|在|从|替|让|叫|被|问)\s*/u;
const JA_CONJ = /^(?:じゃあ|じゃ|では|それじゃあ?|それから|それと|ところで|ちなみに|あと|で)\s*(?:[、,]\s*|(?=[\p{Script=Han}\p{Script=Katakana}A-Za-z0-9]))/u;
const JA_PARTICLE_HEAD = /^(?:から|まで|を|が|に|で|と|へ|は|も)(?=[\p{Script=Han}\p{Script=Katakana}A-Za-z0-9])/u;
const JA_PARTICLE_TAIL = /(?<=[\p{Script=Han}\p{Script=Katakana}ーA-Za-z0-9]|ほう|やつ|もの)(?:って|から|まで|は|も|を|が|に|へ|で|と)$/u;
const EN_HEAD = /^(?:ok(?:ay)?|so|and|then|also|please|pls|can you|could you|would you|a|an|move|change|update|mark|delete|remove|set|push|check|show|find|ask|tell|cancel|reschedule|open)\b[,\s]+/iu;
const EN_PREP = /^(?:to|for|about|with|on|in|at|from|of|by)\s+/iu;
const EN_POINTER = /^(?:the|that|this|those|these|my|his|her|their)\b/iu;
const EN_TAIL = /\s+(?:to|for|about|with|on|in|at|from|of|by|is|was|and|again)$/iu;
function trimRefSpan(ix: WorldIx, said: string): string {
  let s = said.trim();
  // a cut is kept only when something of at least two characters is left and no person's name starts at the cut
  const namedAt0 = (x: string) => peopleOf(ix, fold(x)).hits.some((h) => h.at[0] === 0 && h.at[1] > 1);
  const cut = (n: number) => { const r = s.slice(n).trim(); if (r.length < 2 || namedAt0(s)) return false; s = r; return true; };
  // one person (or pronoun) and nothing else up to the pointer
  const personHead = (r: string) => {
    const m = /^(.+?)\s*(?:的|の|さんの|'s|’s)?\s*(?:那|这|那个|这个)?\s*(?:条|个|篇|场|次|件|位|份|几条|one|notes?|memos?|tasks?|todos?|events?|meetings?)?\s*$/u.exec(r)
      ?? /^(.+?)\s*(?:的|の|さんの|'s|’s)?\s*(?:那|这)/u.exec(r);
    const head = m?.[1]?.trim();
    if (!head) return false;
    const hf = fold(head);
    if (pronounOf(hf)) return true;
    return peopleOf(ix, hf).hits.some((h) => h.at[0] === 0 && h.at[1] >= hf.length - 1);
  };
  for (let changed = true; changed;) {
    changed = false;
    let m: RegExpExecArray | null;
    if ((m = ZH_DISPOSAL.exec(s)) && cut(m[0].length)) { changed = true; continue; }
    if ((m = ZH_FRAME.exec(s)) && m[0].length < s.length && cut(m[0].length)) { changed = true; continue; }
    // (跟<person>的那个<noun> keeps it: with 的 the preposition is part of the description, "the <noun> with <person>")
    if ((m = ZH_PREP.exec(s)) && !/的\s*[那这]/u.test(s) && personHead(s.slice(m[0].length)) && cut(m[0].length)) { changed = true; continue; }
    if ((m = JA_CONJ.exec(s)) && cut(m[0].length)) { changed = true; continue; }
    if ((m = JA_PARTICLE_HEAD.exec(s)) && cut(m[0].length)) { changed = true; continue; }
    if ((m = EN_HEAD.exec(s)) && cut(m[0].length)) { changed = true; continue; }
    if ((m = EN_PREP.exec(s))) {
      const r = s.slice(m[0].length);
      if ((EN_POINTER.test(r) || personHead(r)) && cut(m[0].length)) { changed = true; continue; }
    }
    const t = JA_PARTICLE_TAIL.exec(s) ?? EN_TAIL.exec(s);
    if (t && s.length - t[0].length >= 2) { s = s.slice(0, s.length - t[0].length).trim(); changed = true; }
  }
  return s;
}

export type { TurnCtx };
void addDays;
void squash;
void firstAt;

/** A question: a question word / particle, or a sentence-final 没 / 不 / 么 (有安排没 / 去不). */
function isQuestion(pf: string): boolean {
  return hasAny(pf, L.QUESTION_MARKERS) || /(没|没有|不|么|否)[?？]?\s*$/u.test(pf.trim());
}
