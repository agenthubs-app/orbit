// @ts-nocheck -- finder/impl/lookup.ts: copied byte for byte from lab-rsi repos/orbits/lab/record-finder/rsi/archive/r10/impl/lookup.ts
// (lab commit 931bae340, r10 accepted). Only these two header lines differ; the lab code does not pass this repo's build typecheck.
/**
 * lookup: person → time → clean → find per understood item; items that words alone do not settle go into ONE pick
 * call; empty results or a "none" go into at most one reformulate round; then decide. Timeout / malformed / invalid
 * ids fall back to the lexical candidates (never a guess). A plural pointer over the last answer is split one item
 * per shown record.
 */
import type { Decision, FindInput, LookupInput, LookupResult, LookupStep, ModelPick, ModelScript, PersonCandidate, Understood, World } from "../types";
import { cleanClue } from "./clean";
import { decide, lexicalWinner, matchedHolds } from "./decide";
import { contentWordsFor, scoredContacts, Scored, scoredEvents, scoredSchedule, scoredTodosMemos, worldIndex } from "./finders";
import { buildQuery, tokenInTitle } from "./match";
import { resolvePerson } from "./person";
import { detectLang } from "./text";
import { resolveTime } from "./time";
import plan from "./plan.json";

interface ItemState {
  u: Understood;
  input: FindInput;
  cands: Scored[];
  decision?: Decision;
  needsPick: boolean;
  needsReformulate: boolean;
  personCands?: PersonCandidate[];
}

// r07: any count ≥ 2 with a measure word (两条 / 三个 / 2つ / 三件) or an English count word (the last three / all four)
const PLURAL_RE = /(那些|这些|這些|都|両方|両方とも|ふたつ|みっつ|全部|ぜんぶ|[两兩俩倆二三四五六七八九十2-9][条條个個篇件项項张張]|[二三四五2-9](?:つ|件|個)|\b(?:both|those|these|them|all|two|three|four|five)\b)/i;
/** The plural pointer counts from the end of the last answer (the last two / 最后两条 / 後ろの2つ). */
const FROM_END_RE = /(最后|最後|后面|後面|後ろ|うしろ|\blast\b|\bbottom\b)/i;

function finderFor(kind: Understood["kind"]) {
  switch (kind) {
    case "todo": case "memo": case "todo-or-memo": return scoredTodosMemos;
    case "schedule": return scoredSchedule;
    case "event": return scoredEvents;
    case "contact": return scoredContacts;
  }
}
const kindsOf = (kind: Understood["kind"]): FindInput["kinds"] => (kind === "todo" ? ["todo"] : kind === "memo" ? ["memo"] : kind === "todo-or-memo" ? ["todo", "memo"] : undefined);
const statusFor = (u: Understood): FindInput["status"] => u.status ?? (u.verb === "update" || u.verb === "complete" ? "open" : "any");

/** Every content token found, or nearly all of the weight: words alone settle it. */
function strong(c: Scored, input: FindInput, world: World): boolean {
  if (c.matched.includes("ordinal")) return true;
  const q = buildQuery(contentWordsFor(input, world));
  const toks = q.tokens.filter((t) => !t.generic);
  if (!toks.length) return true;
  if (toks.every((t) => c.matched.includes(t.label) || c.matched.includes(`${t.label}~`))) return true;
  return c.coverage >= plan.lookup.strongCoverage;
}

/**
 * The words match the leader only in its body / notes (a weaker field) while the named person has other records among
 * the candidates: words alone do not settle which of that person's records is meant, the model picks.
 */
function bodyOnlyAmongPerson(w: Scored, cands: Scored[], input: FindInput, world: World): boolean {
  const people = input.people ?? [];
  if (!people.length || cands.length < 2 || w.matched.includes("ordinal")) return false;
  const linked = (c: Scored) => c.matched.some((m) => people.some((p) => m === `person:${p}`));
  if (!linked(w) || !cands.some((c) => c !== w && linked(c))) return false;
  const r = worldIndex(world).recs.get(w.id);
  if (!r) return false;
  const toks = buildQuery(contentWordsFor(input, world)).tokens.filter((t) => !t.generic && t.type !== "uni" && t.type !== "kana");
  if (!toks.length) return false;
  if (!toks.some((t) => tokenInTitle(t, r))) return true;
  // the words that set the leader apart from that person's other records are only in its body / notes
  const others = cands.filter((c) => c !== w && linked(c));
  const apart = toks.filter((t) => matchedHolds(w, t) && others.some((o) => !matchedHolds(o, t)));
  return apart.length > 0 && apart.every((t) => !tokenInTitle(t, r));
}

export function lookup(input: LookupInput, world: World, model: ModelScript): LookupResult {
  const steps: LookupStep[] = [];
  const calls = { pick: 0, reformulate: 0 };
  const pickScript = [...(model.pick ?? [])];
  const refScript = [...(model.reformulate ?? [])];
  const items: ItemState[] = [];
  const lang = detectLang(input.sentence);

  // plural pointer over the last answer: item i ← sessionShown[i]
  const pluralSplit = input.understood.length > 1 && !!input.sessionShown?.length && input.understood.every((u) => u.clue === input.understood[0].clue && PLURAL_RE.test(u.clue));

  const splitOffset = pluralSplit && FROM_END_RE.test(input.understood[0].clue) ? Math.max(0, input.sessionShown!.length - input.understood.length) : 0;
  input.understood.forEach((u, i) => {
    let people: string[] | undefined;
    let personCands: PersonCandidate[] | undefined;
    if (u.mention) {
      steps.push({ step: "person", detail: u.mention });
      personCands = resolvePerson({ mention: u.mention, sentence: input.sentence, account: input.account, sessionPeople: input.sessionPeople }, world);
      const main = personCands.filter((p) => p.why !== "near").map((p) => p.contactId);
      if (main.length) people = main;
    }
    let time: FindInput["time"];
    if (u.timeText) {
      steps.push({ step: "time", detail: u.timeText });
      const { spans: _s, ...t } = resolveTime({ text: u.timeText, now: world.now, timeZone: world.timeZone });
      if (Object.keys(t).length) time = t;
    }
    steps.push({ step: "clean", detail: cleanClue({ sentence: input.sentence, clue: u.clue, lang: lang === "en" ? "en" : lang }).contentWords.join(" ") });
    const fi: FindInput = {
      sentence: input.sentence, clue: u.clue, account: input.account, verb: u.verb, kinds: kindsOf(u.kind), status: statusFor(u), people, time,
      sessionShown: pluralSplit ? [input.sessionShown![i + splitOffset]].filter(Boolean) : input.sessionShown,
    };
    const st: ItemState = { u, input: fi, cands: [], needsPick: false, needsReformulate: false, personCands };
    if (pluralSplit) {
      steps.push({ step: "find", detail: "plural pointer" });
      const id = input.sessionShown![i + splitOffset];
      st.cands = id ? [{ id, score: 10, matched: ["ordinal"], coverage: 1, content: true }] : [];
    } else if (u.kind === "contact" && u.mention && people) {
      steps.push({ step: "find", detail: "contact by name" });
      st.cands = people.map((id, k) => ({ id, score: 10 - k * 0.01, matched: [`person:${id}`], coverage: 1, content: true }));
    } else {
      steps.push({ step: "find", detail: u.kind });
      st.cands = finderFor(u.kind)(fi, world);
    }
    items.push(st);
  });

  // words alone?
  for (const it of items) {
    if (!it.cands.length) { it.needsReformulate = true; continue; }
    if (it.u.kind === "contact" && it.u.mention && it.input.people) {
      it.decision = it.cands.length === 1 ? { outcome: "one", ids: [it.cands[0].id] } : { outcome: "ask", ids: it.cands.slice(0, plan.decide.maxOptions).map((c) => c.id) };
      continue;
    }
    const w = lexicalWinner(it.cands, it.input, world) as Scored | undefined;
    if (w && strong(w, it.input, world) && !bodyOnlyAmongPerson(w, it.cands, it.input, world)) { it.decision = { outcome: "one", ids: [w.id] }; continue; }
    it.needsPick = true;
  }

  // one pick call for every item that needs the model
  const pickers = items.filter((it) => it.needsPick);
  if (pickers.length) {
    if (pickScript.length) {
      calls.pick++;
      steps.push({ step: "pick", detail: pickers.map((p) => p.u.clue).join(" | ") });
      const ans = pickScript.shift()!;
      for (const it of pickers) {
        if (ans === "timeout" || ans === "malformed") { it.decision = decide(it.cands, null, it.input, world); continue; }
        const ids = new Set(it.cands.map((c) => c.id));
        let p: ModelPick;
        if ("none" in ans) p = { none: true };
        else if ("ambiguous" in ans) p = { ambiguous: ans.ambiguous.filter((x) => ids.has(x)) };
        else {
          const bad = new Set((ans as { invalidIds?: string[] }).invalidIds ?? []);
          p = { chosen: ans.chosen.filter((x) => ids.has(x) && !bad.has(x)) };
        }
        const d = decide(it.cands, p, it.input, world);
        if (d.outcome === "none") it.needsReformulate = true;
        else it.decision = d;
      }
    } else {
      for (const it of pickers) it.decision = decide(it.cands, null, it.input, world);
    }
  }

  // at most one reformulate round in total
  const refs = items.filter((it) => it.needsReformulate && !it.decision);
  if (refs.length && refScript.length && calls.reformulate < plan.lookup.maxReformulateRounds) {
    calls.reformulate++;
    steps.push({ step: "reformulate", detail: refs.map((r) => r.u.clue).join(" | ") });
    const ans = refScript.shift()!;
    if (ans !== "timeout" && ans !== "malformed") {
      for (const it of refs) {
        const kind = ans.kind ?? it.u.kind;
        let time = it.input.time;
        if (ans.widenDays && time?.day) {
          const d = new Date(`${time.day}T00:00:00Z`).getTime();
          const f = (ms: number) => new Date(ms).toISOString().slice(0, 10);
          time = { ...time, day: undefined, range: { from: f(d - ans.widenDays * 86400000), to: f(d + ans.widenDays * 86400000) } };
        }
        const fi: FindInput = { ...it.input, clue: ans.terms.join(" "), kinds: kindsOf(kind) ?? it.input.kinds, time };
        if (kind !== it.u.kind && (kind === "schedule" || kind === "event" || kind === "contact")) fi.kinds = undefined;
        steps.push({ step: "find", detail: `reformulated ${kind}` });
        const c2 = finderFor(kind)(fi, world);
        it.cands = c2;
        it.input = fi;
        it.decision = decide(c2, null, fi, world);
      }
    }
  }
  for (const it of items) if (!it.decision) it.decision = { outcome: "none", ids: [] };
  steps.push({ step: "decide" });
  return { decisions: items.map((it) => it.decision!), steps, modelCalls: calls };
}
