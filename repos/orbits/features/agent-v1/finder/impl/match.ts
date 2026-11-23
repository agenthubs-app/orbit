// @ts-nocheck -- finder/impl/match.ts: copied byte for byte from lab-rsi repos/orbits/lab/record-finder/rsi/archive/r10/impl/match.ts
// (lab commit 931bae340, r10 accepted). Only these two header lines differ; the lab code does not pass this repo's build typecheck.
/**
 * Query tokens and IDF-weighted field scoring shared by the finders.
 *
 * A content word becomes tokens: synonym concepts (longest-match over the lexicon surfaces, any surface of the class
 * matches), CJK bigrams of the rest (single leftover characters as weak unigrams), Latin stems, numbers. A record
 * field matches a token by substring (CJK), stem / prefix / small edit distance (Latin, only on name and title
 * fields), pinyin of the field (Latin token against Chinese text), or number value. Each token is weighted by its
 * inverse document frequency in the pool being searched.
 */
import { COMPOUND_PARTS, MAX_SURFACE, SOFT_KIND_SET, SURFACE_INDEX, SYN_CLASSES } from "./lexicon";
import { editDistance, fold, isHan, isHira, isKata, loanKey, pinyinOf, stem, toRomaji } from "./text";
import plan from "./plan.json";

export interface Token {
  label: string;               // shown in Candidate.matched
  type: "concept" | "bigram" | "uni" | "latin" | "num" | "kana";
  surfaces: string[];          // folded strings to look for (concept: all class surfaces)
  generic: boolean;
  word: string;                // the content word it came from (folded)
}

export interface Field { text: string; weight: number; fuzzy: boolean; words: string[]; stems: Set<string>; nums: Set<string>; pinyin?: string; loanKeys?: Set<string>; joined?: Set<string> }

const latinWordsOf = (t: string) => t.match(/[a-z][a-z0-9'’]*|[0-9]+[a-z]+[0-9a-z]*/g) ?? [];

export function makeField(raw: string | undefined, weight: number, fuzzy = false, withPinyin = false): Field | undefined {
  if (!raw) return undefined;
  const text = fold(raw);
  const words = latinWordsOf(text);
  const nums = new Set((text.match(/[0-9]+/g) ?? []).map((n) => String(Number(n))));
  const f: Field = { text, weight, fuzzy, words, stems: new Set(words.map(stem)), nums };
  if (withPinyin) f.pinyin = pinyinOf(raw).map((x) => x ?? "?").join("");
  if (fuzzy && words.length) {
    // single words and adjacent pairs (term sheet = termsheet), for glued Latin and katakana renderings
    const units = [...words, ...words.slice(1).map((w, i) => words[i] + w)];
    f.joined = new Set(words.slice(1).map((w, i) => words[i] + w));
    f.loanKeys = new Set(units.map(loanKey).filter((k) => k.length >= plan.fuzzy.loanKeyMinLength));
  }
  return f;
}

const isLatinSurface = (s: string) => /^[a-z0-9 .:'’&\-]+$/.test(s);

/** How well a token matches one field: 0 … 1 (a concept found through another surface than the one typed: synonymQuality). */
function tokenInField(t: Token, f: Field): number {
  const q = tokenInFieldRaw(t, f);
  return q;
}
let lastLiteral = true;
function tokenInFieldRaw(t: Token, f: Field): number {
  lastLiteral = true;
  if (t.type === "num") return f.nums.has(t.surfaces[0]) ? 1 : 0;
  if (t.type === "latin") {
    const w = t.surfaces[0];
    const st = stem(w);
    if (f.stems.has(st) || f.words.includes(w)) return 1;
    if (w.length >= plan.fuzzy.latinPrefixMinLength && f.words.some((x) => x.startsWith(w) || (x.length >= plan.fuzzy.latinPrefixMinLength && w.startsWith(x) && x.length >= w.length - 1))) return 0.9;
    if (f.fuzzy && w.length >= plan.fuzzy.latinMinLength && f.words.some((x) => Math.abs(x.length - w.length) <= 1 && editDistance(x, w, plan.fuzzy.latinMaxEdits) <= plan.fuzzy.latinMaxEdits)) return plan.score.fuzzyLatinQuality;
    if (f.pinyin && w.length >= plan.fuzzy.pinyinMinLength && f.pinyin.includes(w)) return plan.score.pinyinQuality;
    if (/[0-9]/.test(w) && f.text.replace(/\s/g, "").includes(w)) return 1;
    if (f.joined && w.length >= plan.fuzzy.latinMinLength && f.joined.has(w)) return 1;
    return 0;
  }
  if (t.type === "concept") {
    const order = [t.label, ...t.surfaces.filter((s) => s !== t.label)];
    for (const s of order) {
      lastLiteral = s === t.label;
      const syn = lastLiteral ? 1 : plan.score.synonymQuality;
      if (isLatinSurface(s)) {
        if (s.includes(" ") || s.includes(":") || /[0-9]/.test(s)) { if (f.text.includes(s) || f.text.replace(/\s/g, "").includes(s.replace(/\s/g, ""))) return syn; }
        else if (s.length <= 2) { if (f.words.includes(s)) return syn; }
        else if (f.stems.has(stem(s)) || f.words.includes(s)) return syn;
      } else if (f.text.includes(s)) return syn;
    }
    return 0;
  }
  if (f.text.includes(t.surfaces[0])) return 1;
  // a katakana loanword (folded to hiragana) against the Latin words of a title / name
  const sf = t.surfaces[0];
  if (t.type === "bigram" && f.loanKeys && [...sf].length >= plan.fuzzy.loanKanaMinLength && [...sf].every(isHira)) {
    const k = loanKey(toRomaji(sf));
    if (k.length >= plan.fuzzy.loanKeyMinLength && f.loanKeys.has(k)) return plan.score.loanwordQuality;
  }
  return 0;
}

export interface Rec { id: string; fields: Field[] }

export function tokenScore(t: Token, r: Rec): number { return tokenMatch(t, r).score; }
/** Does the token match the record's first field (its title / name)? */
export function tokenInTitle(t: Token, r: Rec): boolean { return !!r.fields[0] && tokenInField(t, r.fields[0]) > 0; }
/** Best field match; literal = the typed surface itself was found; a match in two or more fields counts a bit more. */
export function tokenMatch(t: Token, r: Rec): { score: number; literal: boolean } {
  let best = 0, literal = false, fieldsHit = 0;
  for (const f of r.fields) {
    const raw = tokenInField(t, f);
    if (raw > 0) fieldsHit++;
    const q = raw * f.weight;
    if (q > best || (q === best && q > 0 && lastLiteral && !literal)) { best = q; literal = lastLiteral; }
  }
  if (fieldsHit >= 2) best *= 1 + plan.score.extraFieldBonus * (fieldsHit - 1);
  return { score: best, literal };
}

const isCJKc = (c: string) => isHan(c) || isHira(c) || isKata(c);

/** A Latin surface in the synonym table, also through the singular of its last word (lessons → lesson). */
function surfaceOf(w: string): string | undefined {
  if (SURFACE_INDEX.has(w)) return w;
  if (!/[a-z]s$/.test(w) || /ss$/.test(w)) return undefined;
  for (const c of [w.replace(/ies$/, "y"), w.replace(/(ss|x|ch|sh)es$/, "$1"), w.replace(/s$/, "")]) if (c !== w && SURFACE_INDEX.has(c)) return c;
  return undefined;
}

/** Tokens of one content word. */
export function wordTokens(word: string): Token[] {
  const w = fold(word);
  const out: Token[] = [];
  const pushConcept = (surface: string) => {
    const idxs = SURFACE_INDEX.get(surface) ?? [];
    const surfaces = [...new Set(idxs.flatMap((i) => SYN_CLASSES[i].surfaces))];
    const generic = idxs.every((i) => SYN_CLASSES[i].generic);
    out.push({ label: surface, type: "concept", surfaces, generic, word: w });
  };
  // Q3 / 第3季度 style quarters
  const q = w.match(/^q([1-4])$/);
  if (q) { out.push({ label: w, type: "concept", surfaces: [`q${q[1]}`, `第${q[1]}季度`, `${q[1]}季度`, `第${q[1]}四半期`], generic: false, word: w }); return out; }
  // whole multi-word Latin surface (meeting notes, one-on-one)
  { const sw = /^[a-z][a-z \-]*$/.test(w) ? surfaceOf(w) : (SURFACE_INDEX.has(w) ? w : undefined); if (sw) { pushConcept(sw); return out; } }
  const chars = [...w];
  let i = 0;
  let residual = "";
  const flushResidual = () => {
    if (!residual) return;
    // okurigana / particles: a short hiragana run next to a Han character is not a search word
    const runs = residual.match(/[\u3041-\u309f]+|[^\u3041-\u309f]+/g) ?? [];
    if (runs.length > 1 || (runs.length === 1 && /^[\u3041-\u309f]{1,3}$/.test(runs[0]) && /\p{Script=Han}/u.test(w))) {
      const keep = runs.filter((r, k) => !(/^[\u3041-\u309f]+$/.test(r) && (k > 0 || r.length <= 3)));
      residual = "";
      for (const r of keep) { residual = r; flushOne(); }
      return;
    }
    flushOne();
  };
  const flushOne = () => {
    if (!residual) return;
    const rc = [...residual];
    if (rc.every(isCJKc)) {
      if (rc.length === 1) out.push({ label: residual, type: "uni", surfaces: [residual], generic: false, word: w });
      else if (rc.every((c) => isHira(c))) {
        // kana word (folded katakana loanword): the whole run, plus weak bigrams for small spelling differences
        if (rc.length >= 3) out.push({ label: residual, type: "bigram", surfaces: [residual], generic: false, word: w });
        for (let k = 0; k + 1 < rc.length; k++) out.push({ label: rc[k] + rc[k + 1], type: "kana", surfaces: [rc[k] + rc[k + 1]], generic: false, word: w });
      } else for (let k = 0; k + 1 < rc.length; k++) { const bg = rc[k] + rc[k + 1]; out.push({ label: bg, type: "bigram", surfaces: [bg], generic: false, word: w }); }
    }
    residual = "";
  };
  while (i < chars.length) {
    const c = chars[i];
    if (!isCJKc(c)) {
      flushResidual();
      let j = i;
      while (j < chars.length && !isCJKc(chars[j])) j++;
      const seg = chars.slice(i, j).join("");
      for (const lw of seg.split(/[\s\-_/]+/).filter(Boolean)) {
        const clean = lw.replace(/^[^a-z0-9]+|[^a-z0-9.:]+$/g, "");
        if (!clean) continue;
        { const sc = surfaceOf(clean); if (sc) { pushConcept(sc); continue; } }
        if (/^[0-9]+$/.test(clean)) out.push({ label: clean, type: "num", surfaces: [String(Number(clean))], generic: false, word: w });
        else if (/^no\.?[0-9]+$/.test(clean)) out.push({ label: clean, type: "num", surfaces: [String(Number(clean.replace(/\D/g, "")))], generic: false, word: w });
        else out.push({ label: clean, type: "latin", surfaces: [clean], generic: false, word: w });
      }
      // hyphenated whole form (1-on-1) as a concept
      if (SURFACE_INDEX.has(seg.trim())) pushConcept(seg.trim());
      i = j;
      continue;
    }
    let matched = "";
    for (let L = Math.min(MAX_SURFACE, chars.length - i); L >= 1; L--) {
      const cand = chars.slice(i, i + L).join("");
      if (SURFACE_INDEX.has(cand) && (L >= 2 || !residual || true)) { matched = cand; break; }
    }
    if (matched && [...matched].length >= 1 && !( [...matched].length === 1 && isHira(matched))) {
      flushResidual();
      pushConcept(matched);
      i += [...matched].length;
      continue;
    }
    residual += c;
    i++;
  }
  flushResidual();
  // digits glued to CJK (40尺柜 → 40)
  for (const n of w.match(/[0-9]+/g) ?? []) if (!out.some((t) => t.type === "num" && t.surfaces[0] === String(Number(n)))) out.push({ label: n, type: "num", surfaces: [String(Number(n))], generic: false, word: w });
  return out;
}

/** Adjacent Latin words that together form a multi-word surface (meeting notes, building materials). */
export function phraseTokens(words: string[]): Token[] {
  const out: Token[] = [];
  const lw = words.map((x) => fold(x));
  for (let n = 3; n >= 2; n--) for (let i = 0; i + n <= lw.length; i++) {
    const ph = surfaceOf(lw.slice(i, i + n).join(" "));
    if (ph) {
      const idxs = SURFACE_INDEX.get(ph)!;
      out.push({ label: ph, type: "concept", surfaces: [...new Set(idxs.flatMap((k) => SYN_CLASSES[k].surfaces))], generic: idxs.every((k) => SYN_CLASSES[k].generic), word: ph });
    }
  }
  return out;
}

export interface Query { tokens: Token[]; words: string[] }

/** Split a short verb + object compound into its parts (订房 → 订 酒店). */
function expandCompounds(words: string[]): string[] {
  return words.flatMap((w) => {
    const f = fold(w);
    for (const [k, parts] of COMPOUND_PARTS) {
      const kf = fold(k);
      const at = f.indexOf(kf);
      if (at < 0) continue;
      return [f.slice(0, at), ...parts, f.slice(at + kf.length)].filter(Boolean);
    }
    return [w];
  });
}

export function buildQuery(rawWords: string[]): Query {
  const words = expandCompounds(rawWords);
  const tokens: Token[] = [];
  // a soft kind word (安排 / 会 / meeting) standing alone says little: its tokens are generic
  for (const w of words) tokens.push(...wordTokens(w).map((t) => (SOFT_KIND_SET.has(fold(w)) ? { ...t, generic: true } : t)));
  tokens.push(...phraseTokens(words));
  // dedupe by label
  const seen = new Set<string>();
  const uniq = tokens.filter((t) => { const k = `${t.type}:${t.label}`; if (seen.has(k)) return false; seen.add(k); return true; });
  return { tokens: uniq, words: words.map((x) => fold(x)) };
}

export interface ScoreOut { score: number; coverage: number; matched: string[]; nonGeneric: boolean; strongHit: boolean }

/** IDF table over a pool of records for the query tokens. */
export function idfTable(q: Query, pool: Rec[]): Map<Token, { idf: number; df: number }> {
  const N = pool.length || 1;
  const m = new Map<Token, { idf: number; df: number }>();
  for (const t of q.tokens) {
    let df = 0;
    for (const r of pool) if (tokenScore(t, r) > 0) df++;
    const base = Math.log(1 + N / (1 + df));
    const w = t.type === "uni" || t.type === "kana" ? plan.score.unigramWeight : t.generic ? plan.score.genericWeight : 1;
    m.set(t, { idf: base * w, df });
  }
  return m;
}

export function scoreRecord(q: Query, idf: Map<Token, { idf: number; df: number }>, r: Rec): ScoreOut {
  let score = 0, total = 0;
  const matched: string[] = [];
  let nonGeneric = false, strongHit = false;
  // bigrams that overlap a matched concept are not double counted
  for (const t of q.tokens) {
    const e = idf.get(t)!;
    total += e.idf;
    const { score: s, literal } = tokenMatch(t, r);
    if (s > 0) {
      score += e.idf * s;
      matched.push(literal || t.type !== "concept" ? t.label : `${t.label}~`);
      if (!t.generic && t.type !== "uni" && t.type !== "kana") nonGeneric = true;
      if (!t.generic && t.type !== "uni" && t.type !== "kana") strongHit = true;
    }
  }
  // whole-word bonus: a content word found verbatim in a field
  for (const w of q.words) {
    if ([...w].length < 2) continue;
    const wt = q.tokens.filter((t) => t.word === w);
    if (wt.length >= 2 && r.fields.some((f) => f.text.includes(w))) {
      const ws = wt.reduce((a, t) => a + (idf.get(t)?.idf ?? 0), 0);
      score += plan.score.phraseBonus * ws;
    }
  }
  return { score, coverage: total > 0 ? Math.min(1, score / total) : 0, matched, nonGeneric, strongHit };
}
