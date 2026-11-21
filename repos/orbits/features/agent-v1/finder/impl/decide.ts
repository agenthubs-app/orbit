// @ts-nocheck -- finder/impl/decide.ts: copied byte for byte from lab-rsi repos/orbits/lab/record-finder/rsi/archive/r10/impl/decide.ts
// (lab commit 931bae340, r10 accepted). Only these two header lines differ; the lab code does not pass this repo's build typecheck.
/**
 * decide: one / ask / none from the candidates and (optionally) the model's pick. Rules: cases/decide.yaml header and
 * D1–D8. Model ids outside the candidates are dropped, duplicates count once, a question offers at most 3 options and
 * never just one; without a usable answer fall back to the lexical candidates (one → one, a clear lexical winner →
 * one, several → ask the top 3); "none" from the model is overruled into a question when a candidate of a person the
 * user named holds the rarest content word.
 */
import type { Candidate, Decision, FindInput, ModelPick, World } from "../types";
import { contentWordsFor, isLinked, worldIndex } from "./finders";
import { buildQuery, Token, tokenInTitle, tokenScore } from "./match";
import plan from "./plan.json";
import { fold } from "./text";

const MAX = plan.decide.maxOptions;
const byScore = (cs: Candidate[]) => [...cs].sort((a, b) => b.score - a.score);
const uniq = <T,>(xs: T[]) => [...new Set(xs)];

/**
 * Lexically clear: one candidate; or the only candidate holding every content word of the clue (typed surface
 * first, then through synonyms) while each other one lacks a real (non-generic, multi-character) word; or a top
 * candidate far ahead of the next.
 */
export function lexicalWinner(cands: Candidate[], input?: FindInput, world?: World): Candidate | undefined {
  if (cands.length === 1) return cands[0];
  if (cands.length < 2) return undefined;
  const w = lexicalWinnerRaw(cands, input, world);
  // the user named a person: a record of someone else never wins on words alone while that person has candidates
  const linked = (c: Candidate) => c.matched.some((m) => m.startsWith("person:"));
  if (w && input?.people?.length && !linked(w) && cands.some(linked)) return undefined;
  return w;
}
function lexicalWinnerRaw(cands: Candidate[], input?: FindInput, world?: World): Candidate | undefined {
  if (input && world) {
    const toks = buildQuery(contentWordsFor(input, world)).tokens.filter((t) => !t.generic && !namesPerson(t, input, world));
    // a word no candidate holds (a name the cleaner kept, a word of no record) cannot tell the candidates apart
    const strongToks = toks.filter((t) => t.type !== "uni" && cands.some((c) => matchedHolds(c, t)));
    if (strongToks.length) {
      const has = (c: Candidate, t: (typeof strongToks)[number], literal: boolean) => matchedHolds(c, t, literal);
      for (const literal of [true, false]) {
        const full = cands.filter((c) => strongToks.every((t) => has(c, t, literal)));
        if (full.length === 1) {
          const others = cands.filter((c) => c !== full[0]);
          if (others.every((c) => strongToks.some((t) => !has(c, t, literal)))) return full[0];
        }
        if (full.length > 1) break;
      }
      // the only record whose TITLE holds every content word, clearly ahead: the others hold them only in the body
      const idx = worldIndex(world);
      const inTitle = cands.filter((c) => { const r = idx.recs.get(c.id); return !!r && strongToks.every((t) => tokenInTitle(t, r)); });
      if (inTitle.length === 1 && strongToks.length >= plan.decide.titleLeadMinTokens) {
        const lead = inTitle[0];
        const next = byScore(cands.filter((c) => c !== lead))[0];
        if (next && lead.score >= plan.decide.titleLeadRatio * next.score) return lead;
      }
    }
  }
  const [a, b] = byScore(cands);
  // a score lead only counts when the runner-up lacks some of the evidence the leader has (not just field weights)
  const base = (m: string) => m.replace(/~$/, "");
  const bm = new Set(b.matched.map(base));
  const moreEvidence = a.matched.some((m) => !bm.has(base(m)));
  if (moreEvidence && a.score >= plan.decide.dominanceRatio * b.score && a.score - b.score >= plan.decide.dominanceGap) return a;
  return undefined;
}

/** Candidates holding every strong content word of the clue (literally or through synonyms). */
function fullHolders(cands: Candidate[], input: FindInput, world: World, tier: "literal" | "whole" | "any" = "any"): Candidate[] {
  const toks = buildQuery(contentWordsFor(input, world)).tokens.filter((t) => !t.generic && t.type !== "uni" && !namesPerson(t, input, world) && cands.some((c) => matchedHolds(c, t)));
  if (!toks.length) return [];
  const idx = worldIndex(world);
  // "whole": a synonym match through a record word that is only a part of the typed word (a two-character word inside a longer typed compound) is broader, weaker
  const partOnly = (c: Candidate, t: Token) => {
    const r = idx.recs.get(c.id);
    const label = fold(t.label);
    if (!r || ![...label].some((ch) => /[\u3040-\u30ff\u4e00-\u9fff]/.test(ch))) return false;
    const hits = t.surfaces.filter((sf) => r.fields.some((f) => f.text.includes(sf)));
    return hits.length > 0 && hits.every((sf) => sf !== label && label.includes(sf));
  };
  const holds = (c: Candidate, t: Token) => tier === "literal" ? matchedHolds(c, t, true) : matchedHolds(c, t) && (tier === "any" || matchedHolds(c, t, true) || !partOnly(c, t));
  return cands.filter((c) => toks.every((t) => holds(c, t)));
}

function pad(first: string[], cands: Candidate[]): string[] {
  const out = [...first];
  for (const c of byScore(cands)) { if (out.length >= MAX) break; if (!out.includes(c.id)) out.push(c.id); }
  return out;
}

function fallback(cands: Candidate[], input: FindInput, world: World): Decision {
  if (!cands.length) return { outcome: "none", ids: [] };
  const w = lexicalWinner(cands, input, world);
  if (w) return { outcome: "one", ids: [w.id] };
  // several candidates hold every content word and the rest do not: those are the options
  // (as typed first, then through synonyms)
  for (const tier of ["literal", "whole", "any"] as const) {
    const full = fullHolders(cands, input, world, tier);
    if (full.length >= 2 && full.length <= MAX && full.length < cands.length) return { outcome: "ask", ids: byScore(full).map((c) => c.id) };
    if (full.length > MAX) break;
  }
  return { outcome: "ask", ids: byScore(cands).slice(0, MAX).map((c) => c.id) };
}

/**
 * A clue token that is (part of) the name or a saved alias of a person the user named: it is a person word, carried
 * by the candidates' person marks, never a content word that a record title must hold.
 */
function namesPerson(t: Token, input: FindInput, world: World): boolean {
  const people = input.people ?? [];
  if (!people.length) return false;
  const idx = worldIndex(world);
  for (const id of people) {
    const c = idx.contactById.get(id);
    const r = idx.recs.get(id);
    if (!c || !r) continue;
    const nameRec = { id, fields: r.fields.slice(0, 1 + (c.aliases?.length ?? 0)) };
    if (tokenScore(t, nameRec) > 0) return true;
  }
  return false;
}

/** Candidates of a named person holding the rarest content word of the clue (SPEC §4.5, narrow sense). */
export function protectedCandidates(cands: Candidate[], input: FindInput, world: World): Candidate[] {
  const people = input.people ?? [];
  if (!people.length || !cands.length) return [];
  const words = contentWordsFor(input, world);
  const q = buildQuery(words);
  const toks = q.tokens.filter((t) => !t.generic && t.type !== "uni" && t.type !== "kana" && !namesPerson(t, input, world));
  if (!toks.length) return [];
  const idx = worldIndex(world);
  const visible = [...world.todos, ...world.memos, ...world.schedule, ...world.privateEvents, ...world.contacts]
    .filter((r) => r.account === input.account && (!r.deletedAt || input.verb === "restore")).map((r) => r.id)
    .concat(world.platformEvents.map((e) => e.id));
  let best: { tok: (typeof toks)[number]; df: number } | undefined;
  for (const t of toks) {
    let df = 0;
    for (const id of visible) { const r = idx.recs.get(id); if (r && tokenScore(t, r) > 0) df++; }
    // the finder's own evidence counts too: a word the candidates hold (e.g. through a cross-script pair the lexicon
    // does not know) is at least as frequent as the candidates holding it
    df = Math.max(df, cands.filter((c) => matchedHolds(c, t)).length);
    if (df >= 1 && (!best || df < best.df)) best = { tok: t, df };
  }
  if (!best) return [];
  return cands.filter((c) => matchedHolds(c, best!.tok) && (c.matched.some((m) => people.some((p) => m === `person:${p}`)) || isLinked(c.id, people, world)));
}

/**
 * A candidate's `matched` holds a token: its label as is, marked as a synonym match ("label~"), or as one side of a
 * cross-script pair written "record word~query word", compared folded against the token's surfaces.
 */
export function matchedHolds(c: Candidate, t: { label: string; surfaces: string[]; type?: string }, literalOnly = false): boolean {
  if (c.matched.includes(t.label) || (!literalOnly && c.matched.includes(`${t.label}~`))) return true;
  const forms = new Set([t.label, ...t.surfaces].map((x) => fold(x)).filter(Boolean));
  const cjkPiece = t.type === "bigram" || t.type === "concept";
  return c.matched.some((m) => {
    if (m.startsWith("person:") || m === "ordinal") return false;
    const syn = m.includes("~");
    if (literalOnly && syn) return false;
    // "field:word" annotations and "record word~query word" pairs: compare each part
    const parts = m.replace(/^[a-z]+:/i, "").split("~").map((x) => fold(x)).filter(Boolean);
    return parts.some((p) => forms.has(p) || (cjkPiece && [...p].length > [...t.label].length && /[\u3040-\u30ff\u4e00-\u9fff]/.test(p) && [...forms].some((f) => [...f].length >= 2 && p.includes(f))));
  });
}

export function decide(candidates: Candidate[], pick: ModelPick | null, input: FindInput, world: World): Decision {
  const ids = candidates.map((c) => c.id);
  const byId = new Map(candidates.map((c) => [c.id, c]));
  const valid = (xs: string[] | undefined) => uniq((xs ?? []).filter((x) => ids.includes(x)));
  if (pick && "chosen" in pick) {
    const v = valid(pick.chosen);
    if (v.length === 1) {
      const c = byId.get(v[0])!;
      if (c.matched.length > 0) return { outcome: "one", ids: v };
      return { outcome: "ask", ids: pad(v, candidates) };
    }
    if (v.length >= 2) return { outcome: "ask", ids: byScore(v.map((x) => byId.get(x)!)).slice(0, MAX).map((c) => c.id) };
    return fallback(candidates, input, world);
  }
  if (pick && "ambiguous" in pick) {
    const v = valid(pick.ambiguous);
    if (v.length >= 2) return { outcome: "ask", ids: byScore(v.map((x) => byId.get(x)!)).slice(0, MAX).map((c) => c.id) };
    if (v.length === 1) return { outcome: "ask", ids: pad(v, candidates) };
    return fallback(candidates, input, world);
  }
  if (pick && "none" in pick) {
    const prot = protectedCandidates(candidates, input, world);
    if (prot.length >= 2) return { outcome: "ask", ids: byScore(prot).slice(0, MAX).map((c) => c.id) };
    if (prot.length === 1) return { outcome: "ask", ids: pad([prot[0].id], candidates) };
    return { outcome: "none", ids: [] };
  }
  return fallback(candidates, input, world);
}
