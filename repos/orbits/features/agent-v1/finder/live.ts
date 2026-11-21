/**
 * The live record lookup: the lab's r10 finders and decide (finder/impl, rules only) with the validated phase-2 model
 * steps around them, ported from lab-rsi repos/orbits/lab/record-finder/rsi/live.ts (lab commit f6042bef9, configuration
 * `--picker gemini --when ambiguous --K 10 --fields summary --reformulate 1 --timeout 2000`):
 *
 *   candidates = finder(input)                      (top K = 10, plan.json)
 *   decision   = decide(candidates, null)           (rules)
 *   when the rules do not settle one record:
 *     pick     = Gemini Decision choice over the candidates (+ "none"), opaque shuffled labels c1…cN
 *     no candidates, or the pick is "none"  →  one DeepSeek reformulate round (other search words), search again;
 *                                              when that finds candidates, pick again over them
 *     decision = decide(candidates, pick)
 *
 * Every model call: 2 s, one attempt; a timeout, an error, no key or no budget left is "no pick" and the rules decide
 * (never a guess: several candidates → a question). Calls go through the agent's clients — the Gemini Decisions request
 * (judgment/gemini-decision.ts, traced as `judgment.decided` with purpose "finder_pick", inside the round's judgment
 * budget) and the main model (models/main.ts callMainModel, node "propose", purpose "reformulate", inside the round's
 * model budget) — so the eval's fetch preload records and prices them like the others.
 */
import { createHash } from "node:crypto";

import { scrubModelInput } from "../domains/contact/field-grants";
import type { JudgmentAccess, JudgmentBudget } from "../judgment/ask";
import { JudgmentRequestError, requestDecisionsOnce } from "../judgment/gemini-decision";
import { callMainModel, type ModelBudget } from "../models/main";
import { emitTrace } from "../observability/trace";
import { decide } from "./impl/decide";
import { contentWordsFor, findContacts, findEvents, findSchedule, findTodosMemos } from "./impl/finders";
import { GEMINI_PARAMS, PICK_INSTRUCTIONS, REFORMULATE_SYSTEM } from "./prompts";
import type { Candidate, Decision, FindInput, ModelPick, World } from "./types";

export const FINDER_MODEL_TIMEOUT_MS = 2_000;
export const FINDER_PICK_QUESTION = "finder.pick";

/** ORBIT_AGENT_FINDER=legacy restores the old lookups everywhere; anything else (default) is the new finder. */
export function finderMode(env: Record<string, string | undefined> = process.env): "new" | "legacy" {
  return env.ORBIT_AGENT_FINDER?.trim().toLowerCase() === "legacy" ? "legacy" : "new";
}

export type FinderFn = "findTodosMemos" | "findSchedule" | "findEvents" | "findContacts";
const FINDERS: Record<FinderFn, (input: FindInput, world: World) => Candidate[]> = { findContacts, findEvents, findSchedule, findTodosMemos };

/** How the lookup reaches the two models (absent pieces: that step is skipped and the rules decide). */
export interface FinderModels {
  judgment?: JudgmentAccess | null;
  judgmentBudget?: JudgmentBudget;
  modelBudget?: ModelBudget;
  fetchImplementation?: typeof fetch;
  requestId?: string;
  timeoutMs?: number;
}

export interface LiveResult {
  decision: Decision;
  candidates: Candidate[];
  /** The input the candidates were found with (the reformulated words when that round found them). */
  input: FindInput;
  calls: { pick: number; reformulate: number };
  pick: ModelPick | null;
  /** A question about a record the words do not match (the named person's only one): "not found by these words, is it this?". */
  unmatched?: boolean;
}

// ---------------- describing candidates (rsi/live.ts describe, --fields summary) ----------------
function describe(id: string, w: World): string {
  const all = [...w.todos, ...w.memos, ...w.schedule, ...w.platformEvents, ...w.privateEvents, ...w.contacts] as unknown as Record<string, unknown>[];
  const r = all.find((x) => x.id === id);
  if (!r) return "(unknown)";
  const title = String(r.title ?? r.name ?? "");
  const people = ((r.contactIds as string[] | undefined) ?? []).map((c) => w.contacts.find((x) => x.id === c)?.name).filter(Boolean).join(", ");
  const when = [r.plannedDate, r.dueAt, r.startsAt, r.writtenOn].filter(Boolean).map(String).map((s) => s.slice(0, 16)).join(" / ");
  const kind = id.startsWith("T-") ? "to-do" : id.startsWith("M-") ? "memo" : id.startsWith("S-") ? "schedule" : id.startsWith("C-") ? "contact" : "event";
  const status = r.status ? ` · ${r.status}` : "";
  const extra = [r.company, r.title && id.startsWith("C-") ? r.title : undefined, r.location].filter(Boolean).join(" · ");
  const body = String(r.notes ?? r.body ?? r.summary ?? "");
  const bodyPart = body.slice(0, 80);
  return `[${kind}${status}] ${title}${people ? ` · people: ${people}` : ""}${when ? ` · ${when}` : ""}${extra ? ` · ${extra}` : ""}${bodyPart ? ` · ${bodyPart}` : ""}`;
}

/** The picker's text and options, exactly as the lab built them (exported for tests). */
export function pickRequestOf(input: FindInput, cands: readonly Candidate[], w: World): { user: string; options: Record<string, string>; label: Map<string, string> } {
  // opaque, shuffled labels (deterministic per sentence) so the model cannot lean on the order or on ids
  const order = cands.map((c) => ({ c, k: createHash("md5").update(input.sentence + c.id).digest("hex") })).sort((a, b) => (a.k < b.k ? -1 : 1));
  const label = new Map(order.map((x, i) => [`c${i + 1}`, x.c.id]));
  const people = (input.people ?? []).map((p) => w.contacts.find((c) => c.id === p)?.name).filter(Boolean).join(", ");
  const user = [
    `User said: ${input.sentence}`, `The part that points at a record: ${input.clue}`, `Action: ${input.verb}`,
    people ? `People already identified: ${people}` : "", input.time ? `Time already identified: ${JSON.stringify(input.time)}` : "",
    `Today: ${w.now}`, "Candidates:", ...[...label].map(([l, id]) => `${l}: ${describe(id, w)}`),
  ].filter(Boolean).join("\n");
  const options: Record<string, string> = Object.fromEntries([...label].map(([l, id]) => [l, describe(id, w)]));
  options.none = "None of these records is the one the user means.";
  return { label, options, user };
}

/** A Gemini answer's probabilities → a ModelPick (rsi/live.ts with rsi/live/params.json). */
export function pickOfProbabilities(probs: Record<string, number>, label: ReadonlyMap<string, string>): ModelPick | null {
  if (!Object.keys(probs).length) return null;
  const ranked = Object.entries(probs).sort((a, b) => b[1] - a[1]);
  const top = ranked[0];
  if (top[0] === "none" && top[1] >= GEMINI_PARAMS.geminiNone) return { none: true };
  const real = ranked.filter(([l]) => l !== "none");
  if (real[0] && real[0][1] >= GEMINI_PARAMS.geminiChosen) return { chosen: [label.get(real[0][0])!] };
  const amb = real.filter(([, p]) => p >= GEMINI_PARAMS.geminiAmbMin).slice(0, GEMINI_PARAMS.geminiAmbMax).map(([l]) => label.get(l)!);
  return amb.length ? { ambiguous: amb } : null;
}

async function pickWithModel(input: FindInput, cands: readonly Candidate[], w: World, models: FinderModels): Promise<{ pick: ModelPick | null; calls: number }> {
  if (!cands.length) return { calls: 0, pick: { none: true } };
  const { label, options, user } = pickRequestOf(input, cands, w);
  const access = models.judgment;
  const budget = models.judgmentBudget;
  const base = { candidates: cands.length, purpose: "finder_pick", questionIds: [FINDER_PICK_QUESTION], type: "judgment.decided", ...(models.requestId ? { requestId: models.requestId } : {}) };
  if (!access?.apiKey || !budget || budget.used >= budget.limit) {
    emitTrace({ ...base, budget: budget ? { limit: budget.limit, used: budget.used } : null, candidates: 0, sent: false, unavailable: !access?.apiKey ? "no_key" : "budget" });
    return { calls: 0, pick: null };
  }
  budget.used += 1;
  const started = Date.now();
  try {
    const result = await requestDecisionsOnce({
      apiKey: access.apiKey,
      input: [scrubModelInput(user, models.requestId ?? null).text],
      questions: { pick: { criteria: Object.fromEntries(Object.entries(options).map(([key, text]) => [key, scrubModelInput(text, models.requestId ?? null).text])), instructions: PICK_INSTRUCTIONS, type: "choice" } },
      timeoutMs: models.timeoutMs ?? FINDER_MODEL_TIMEOUT_MS,
      ...(access.fetchImplementation ? { fetchImplementation: access.fetchImplementation } : {}),
    });
    const probs = result.answers.pick?.probabilities ?? {};
    const pick = pickOfProbabilities(probs, label);
    emitTrace({ ...base, budget: { limit: budget.limit, used: budget.used }, durationMs: result.durationMs, inputTokens: result.inputTokens, pick: pick ? Object.keys(pick)[0] : null, sent: true, unavailable: Object.keys(probs).length ? null : "malformed" });
    return { calls: 1, pick };
  } catch (error) {
    emitTrace({ ...base, budget: { limit: budget.limit, used: budget.used }, durationMs: Date.now() - started, sent: true, unavailable: error instanceof JudgmentRequestError ? error.code : "network" });
    return { calls: 1, pick: null };
  }
}

async function reformulateTerms(input: FindInput, models: FinderModels): Promise<{ terms: string[]; called: boolean }> {
  if (!models.modelBudget || !models.requestId) return { called: false, terms: [] };
  const result = await callMainModel({
    budget: models.modelBudget, maxTokens: 200, node: "propose", purpose: "reformulate", requestId: models.requestId, system: REFORMULATE_SYSTEM, timeoutMs: models.timeoutMs ?? FINDER_MODEL_TIMEOUT_MS,
    user: `User said: ${input.sentence}\nThe part that points at a record: ${input.clue}\nNo record matched these words. Give other search words.`,
    ...(models.fetchImplementation ? { fetchImplementation: models.fetchImplementation } : {}),
  });
  if (result.ok === false) return { called: result.reason !== "budget", terms: [] };
  try {
    return { called: true, terms: ((JSON.parse(result.text) as { terms?: unknown[] }).terms ?? []).map(String).slice(0, 6) };
  } catch {
    return { called: true, terms: [] };
  }
}

type Script = "latin" | "kana" | "han";
function scriptOf(text: string): Script | null {
  if (/[\p{Script=Hiragana}\p{Script=Katakana}]/u.test(text)) return "kana";
  if (/\p{Script=Han}/u.test(text)) return "han";
  return /[A-Za-z]/u.test(text) ? "latin" : null;
}
/** Words a title could hold as written: Latin words a title with Latin letters, kana a kana title, Han a title with Han. */
function sameScript(word: string, title: string): boolean {
  const said = scriptOf(word);
  if (said === "latin") return /[A-Za-z]/u.test(title);
  if (said === "kana") return scriptOf(title) === "kana";
  return said === "han" && /\p{Script=Han}/u.test(title);
}

/** One record lookup, the lab's phase-2 flow (see the header). */
export async function liveFind(fn: FinderFn, input: FindInput, world: World, models: FinderModels): Promise<LiveResult> {
  const finder = FINDERS[fn];
  let cands = finder(input, world);
  let found = input;
  const calls = { pick: 0, reformulate: 0 };
  let decision = decide(cands, null, input, world);
  let pick: ModelPick | null = null;
  // Port deviation (documented): the rules' "one" on a record that holds none of the clue's content words — found only
  // because it is the named person's only record — is not settled by words when the words could have matched (the same
  // script as its title): it goes to the picker like a tie, and without the model choosing it, it is offered in a
  // question, never put on a card by itself (AE-XL-009, AG06 repair 1). Words in another script than the title cannot be
  // compared, and the person's only record stays the one (AE-UIX-007/008, as before).
  const words = contentWordsFor(input, world);
  const hasWords = words.length > 0;
  const titleOf = (id: string) => String(([...world.todos, ...world.memos, ...world.schedule, ...world.platformEvents, ...world.privateEvents] as { id: string; title: string }[]).find((item) => item.id === id)?.title ?? "");
  const unmatched = (d: Decision) => d.outcome === "one" && hasWords && (cands.find((item) => item.id === d.ids[0])?.matched ?? []).every((mark) => mark.startsWith("person:")) && words.some((word) => sameScript(word, titleOf(d.ids[0])));
  const weakOne = unmatched(decision);
  if (decision.outcome !== "one" || weakOne) {
    let p = await pickWithModel(input, cands, world, models);
    calls.pick += p.calls;
    // Port deviation (documented): a clue with no content word ("她的待办") has nothing to say in other words, so no
    // reformulate call is made for it; the lab harness called the model there too.
    if ((cands.length === 0 || (p.pick && "none" in p.pick)) && hasWords) {
      const r = await reformulateTerms(input, models);
      if (r.called) calls.reformulate += 1;
      if (r.terms.length) {
        const input2 = { ...input, clue: r.terms.join(" ") };
        const c2 = finder(input2, world);
        if (c2.length) {
          cands = c2;
          found = input2;
          p = await pickWithModel(input, cands, world, models);
          calls.pick += p.calls;
        }
      }
    }
    pick = p.pick;
    decision = decide(cands, p.pick, input, world);
    const chosen = p.pick && "chosen" in p.pick ? p.pick.chosen : [];
    if (unmatched(decision) && !chosen.includes(decision.ids[0])) {
      return { calls, candidates: cands, decision: { ids: decision.ids, outcome: "ask" }, input: found, pick, unmatched: true };
    }
  }
  return { calls, candidates: cands, decision, input: found, pick };
}
