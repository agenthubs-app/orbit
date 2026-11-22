/**
 * funnel() — 先过滤，再判断 (设计稿 §3.8 四步; agent-design AG08-1, AG08-2, AG08-4):
 *
 *   1. hard conditions (code): permission, time, place, status, what the user excluded;
 *   2. rule ranking (code): overlap of the ranking basis with the candidate's own fields — two-character
 *      pieces for Chinese and Japanese (a whole CJK sentence is never one token), whole words for Latin;
 *      or the record field the user sorts by;
 *   3. cut (code): at most 50 candidates a conversation request, 30 a scheduled period (constants);
 *   4. one judgment request (model) for every candidate left: match.level per candidate.
 *
 * A basis with nothing to understand (only a date, a deadline, days since the last interaction) ends at
 * step 2: no judgment. When the judgment is unavailable (timeout, no key, out of requests, not enabled for
 * the language), the rule order is delivered and `matched` is false, so the answer says no topic matching was
 * done. The result carries the coverage: how many there were, after the hard conditions, judged, cut off.
 * The number of model calls never depends on the number of candidates.
 */
import type { JudgmentOutcome } from "./ask";

export const CONVERSATION_CANDIDATE_LIMIT = 50;
export const SCHEDULED_CANDIDATE_LIMIT = 30;

export type FunnelMode = "conversation" | "scheduled";

export interface FunnelCandidate {
  /** Stable key for ties and for the judgment request (c1, c2 … are given by funnel). */
  id: string;
  /** The candidate's own words the rule ranking reads (name, company, role, tags, notes; title, topics). */
  words: string;
  /**
   * run-02 (AE-SCL-014): the same words by field with a weight — what the record says the person does (role, industry,
   * tags, notes) counts more than a word that only appears inside a company's name ("Meridian Power Devices").
   * Without it every word of `words` weighs 1.
   */
  fields?: readonly { text: string; weight: number }[];
}

/** run-02: weights of the rule ranking by field (functions node). */
export const FIELD_WEIGHT = { company: 1, describes: 2, name: 1, place: 1 } as const;

export interface FunnelCoverage {
  total: number;
  afterHardConditions: number;
  judged: number;
  truncated: number;
}

export interface RankedCandidate<T extends FunnelCandidate> {
  candidate: T;
  key: string;
  ruleScore: number;
  /** match.level after judgment (null: not judged). */
  level: "insufficient" | "partial" | "match" | null;
}

export interface FunnelResult<T extends FunnelCandidate> {
  /** The delivered order, at most `count`. */
  ordered: RankedCandidate<T>[];
  coverage: FunnelCoverage;
  /** A judgment answered for this ranking (topic matching was done). */
  matched: boolean;
  /** A judgment was needed (a basis with words to understand). */
  semantic: boolean;
  /** Why there was no topic matching although it was needed. */
  unmatchedReason: string | null;
}

export interface FunnelInput<T extends FunnelCandidate> {
  candidates: readonly T[];
  hard?: (candidate: T) => boolean;
  /** The words to rank by (the topic); null or empty when only a field orders the list. */
  basis: string | null;
  /** The record field to order by (and to break ties after the rule score). */
  order?: { value: (candidate: T) => string | null; direction: "asc" | "desc" };
  mode: FunnelMode;
  count: number;
  /** The judgment over the candidates that were kept (one request for all of them). */
  judge?: (kept: readonly { key: string; candidate: T }[]) => Promise<JudgmentOutcome>;
}

/** Words of a basis that say how to pick, not what about ("最适合", "跟…有关", "best fits"). */
const CJK_FILLER = [
  // Words of time and order: a basis made only of them is a field to sort by, never a topic (AG08-2).
  "最久没联系", "最久没", "没联系", "没有联系", "最近一次", "最近", "最早", "最晚", "最新", "开始时间", "开始", "时间", "日期", "截止", "计划日", "往来", "早い順", "遅い順", "開始時間", "開始", "時間", "日付", "期限", "締め切り", "やり取り", "連絡していない", "順番", "順",
  "最适合", "最合适", "适合", "最好", "有关", "相关", "主题", "的人", "联系人", "活动", "挑", "选", "聊", "认识", "一下", "关于", "について", "に合う", "向いている", "ぴったり", "最も", "イベント", "連絡先", "的", "和", "跟", "与", "の", "に", "を", "と"];
const LATIN_STOP = new Set(["a", "an", "the", "of", "for", "to", "in", "on", "with", "and", "or", "my", "me", "i", "best", "fit", "fits", "fitting", "good", "most", "pick", "choose", "three", "two", "ten", "contacts", "contact", "people", "person", "events", "event", "about", "who", "that", "is", "are", "be", "role", "based", "from",
  "longest", "oldest", "newest", "earliest", "latest", "recent", "recently", "date", "dates", "time", "start", "starts", "starting", "interaction", "interactions", "talking", "talked", "without", "gone", "first", "last", "order", "soonest", "due", "deadline"]);

/** The two-character pieces of the CJK runs of a text, and its Latin words (lower case, 3+ letters). */
export function basisTokens(basis: string): { pieces: string[]; words: string[] } {
  let text = basis;
  for (const filler of CJK_FILLER) text = text.split(filler).join(" ");
  const pieces = new Set<string>();
  for (const run of text.match(/[぀-ヿ㐀-鿿豈-﫿]+/gu) ?? []) {
    if (run.length === 1) continue;
    for (let index = 0; index + 2 <= run.length; index += 1) pieces.add(run.slice(index, index + 2));
  }
  const words = new Set((basis.toLowerCase().match(/[a-z][a-z0-9-]*/gu) ?? []).flatMap((word) => word.split("-")).filter((word) => word.length >= 3 && !LATIN_STOP.has(word)));
  return { pieces: [...pieces], words: [...words] };
}

/** How many of the basis's pieces and words the candidate's own words contain; with fields, each counts its field's weight (the highest where it appears). */
export function ruleScore(tokens: { pieces: readonly string[]; words: readonly string[] }, words: string, fields?: readonly { text: string; weight: number }[]): number {
  const list = fields?.length ? fields : [{ text: words, weight: 1 }];
  const hasWord = (text: string, word: string) => new RegExp(`\\b${word.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&")}`, "u").test(text.toLowerCase());
  let score = 0;
  for (const piece of tokens.pieces) score += Math.max(0, ...list.filter((field) => field.text.includes(piece)).map((field) => field.weight));
  for (const word of tokens.words) score += Math.max(0, ...list.filter((field) => hasWord(field.text, word)).map((field) => field.weight));
  return score;
}

/** A basis that names something to understand (not only a date or a time). */
export function needsUnderstanding(basis: string | null | undefined): boolean {
  if (!basis) return false;
  const tokens = basisTokens(basis);
  return tokens.pieces.length > 0 || tokens.words.length > 0;
}

const LEVEL_RANK = { insufficient: 0, match: 2, partial: 1 } as const;

/** The text a match.level request is judged on: the basis, then one line per candidate key (calibration uses the same). */
export function rankJudgmentInput(language: "zh" | "ja" | "en", basis: string, lines: readonly { key: string; text: string }[]): string[] {
  return [`${language === "zh" ? "排序依据" : language === "ja" ? "並べ替えの基準" : "Ranking basis"}: ${basis}`, lines.map((line) => `[${line.key}] ${line.text}`).join("\n")];
}

export function candidateLimit(mode: FunnelMode): number {
  return mode === "scheduled" ? SCHEDULED_CANDIDATE_LIMIT : CONVERSATION_CANDIDATE_LIMIT;
}

export async function funnel<T extends FunnelCandidate>(input: FunnelInput<T>): Promise<FunnelResult<T>> {
  const total = input.candidates.length;
  // 1. Hard conditions.
  const kept = input.hard ? input.candidates.filter((candidate) => input.hard!(candidate)) : [...input.candidates];
  const semantic = needsUnderstanding(input.basis);
  const tokens = semantic ? basisTokens(input.basis!) : { pieces: [], words: [] };
  const compareField = (left: T, right: T) => {
    if (!input.order) return 0;
    const a = input.order.value(left);
    const b = input.order.value(right);
    if (a === b) return 0;
    // Records without the field come last either way.
    if (a === null) return 1;
    if (b === null) return -1;
    return input.order.direction === "asc" ? (a < b ? -1 : 1) : a < b ? 1 : -1;
  };
  const stable = (left: T, right: T) => (left.id < right.id ? -1 : left.id > right.id ? 1 : 0);
  // 2. Rule ranking.
  const scored = kept.map((candidate) => ({ candidate, ruleScore: semantic ? ruleScore(tokens, candidate.words, candidate.fields) : 0 }));
  scored.sort((left, right) => right.ruleScore - left.ruleScore || compareField(left.candidate, right.candidate) || stable(left.candidate, right.candidate));
  const coverageOf = (judged: number): FunnelCoverage => ({ afterHardConditions: kept.length, judged, total, truncated: Math.max(0, kept.length - judged) });
  const count = Math.max(0, input.count);
  if (!semantic) {
    return { coverage: coverageOf(0), matched: false, ordered: scored.slice(0, count).map((item, index) => ({ ...item, key: `c${index + 1}`, level: null })), semantic: false, unmatchedReason: null };
  }
  // 3. Cut.
  const limit = candidateLimit(input.mode);
  const sent = scored.slice(0, limit).map((item, index) => ({ ...item, key: `c${index + 1}` }));
  // 4. One judgment for all of them.
  let outcome: JudgmentOutcome | null = null;
  if (sent.length && input.judge) outcome = await input.judge(sent.map((item) => ({ candidate: item.candidate, key: item.key })));
  const answered = Boolean(outcome?.sent && !outcome.unavailable) && [...(outcome?.verdicts.values() ?? [])].some((verdict) => !verdict.fallback || verdict.reason === "below_threshold");
  const expectedOf = (key: string) => outcome?.verdicts.get(key)?.expected ?? 0;
  const levelOf = (key: string): RankedCandidate<T>["level"] => {
    const verdict = outcome?.verdicts.get(key);
    if (!answered || !verdict) return null;
    return (["insufficient", "partial", "match"] as const).find((level) => level === verdict.answer) ?? "insufficient";
  };
  const ranked: RankedCandidate<T>[] = sent.map((item) => ({ ...item, level: levelOf(item.key) }));
  // AG14 (AE-SCL-027): among candidates that stay "not established", one the model found more likely related than not
  // — but under the calibrated threshold, so it keeps the conservative label and is never said to fit — comes before the
  // ones it found unrelated. Only a tie that the start time used to break; a rule hit still goes first.
  const leaningOf = (key: string): number => {
    const verdict = outcome?.verdicts.get(key);
    if (!verdict || verdict.reason !== "below_threshold" || verdict.confidence === null) return 0;
    const related = 1 - verdict.confidence;
    return related >= 0.5 ? related : 0;
  };
  if (answered) ranked.sort((left, right) => LEVEL_RANK[right.level ?? "insufficient"] - LEVEL_RANK[left.level ?? "insufficient"] || (left.level && left.level !== "insufficient" ? expectedOf(right.key) - expectedOf(left.key) : 0) || right.ruleScore - left.ruleScore || leaningOf(right.key) - leaningOf(left.key) || compareField(left.candidate, right.candidate) || stable(left.candidate, right.candidate));
  const unmatchedReason = answered ? null : !input.judge ? "no_judgment" : outcome?.unavailable ?? ([...(outcome?.verdicts.values() ?? [])][0]?.reason ?? "unavailable");
  return { coverage: coverageOf(answered ? sent.length : 0), matched: answered, ordered: ranked.slice(0, count), semantic: true, unmatchedReason };
}
