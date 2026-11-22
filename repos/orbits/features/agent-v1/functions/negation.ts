/**
 * AG21c (R33): one reader of whether some words leave something out, ask for it only, or only prefer it — for this turn's
 * words and for saved entries alike (functions/basis.ts timePreferenceIn, domains/memory/words.ts timeValuesIn), in zh,
 * ja and en, verb negations included ("不推荐周日的", "20時以降のイベントは入れない", "never on Sundays").
 *
 * A double negation ("除了周末都不要", "週末以外は入れない", "nothing except weekends") asks for that time only. Words whose
 * direction cannot be read ("不限周末", "只要不是…", "not only …") are "unclear": they are never applied as a hard
 * condition, and never the wrong way round.
 */
export type Polarity = "exclude" | "only" | "prefer" | "unclear";

/** Words that only look like a negation (an adjective, "not bad", "a lot", "soon", "but"). */
const NOT_NEGATION = /(少ない|危ない|切ない|汚い|幼い|情けない|もったいない|仕方(?:が)?ない|間違いない|足りない|つまらない|しょうがない|かもしれない|じゃないか|ではないか|不错|不少|不久|不过|不但|不仅|不如|不然|不同|不断|不管|不论|\bnot bad\b|\bno later than\b|\bno earlier than\b|\bno doubt\b)/giu;
/** "不限", "不只", "not only": what the words ask for cannot be read as a condition. */
const NOT_A_LIMIT = /(不限|不只|不光|不仅|并非只|だけでなく|だけじゃなく|に限らず|\bnot only\b|\bnot just\b|\bnot limited to\b)/iu;
/** "除了", "以外", "except": the words leave this out — or, with another negation, ask for this only. */
const EXCEPT = /(除了|以外|除外|を除いて|は除いて|を除く|除く|\bexcept(?: for)?\b|\bother than\b|\bapart from\b)/giu;
/**
 * A negation: Chinese 不 + a verb (不推荐, 不去, 不看, 不要 …), 别, 没 + verb, 排除/避开; Japanese 〜ない / 〜ません / 〜ないで
 * after a verb stem (入れない, 見せない, 行かない, しないで), なし, NG; English not / no / never / don't / avoid / skip / without.
 */
const NEGATION = /(不(?=[\p{Script=Han}])|别|甭|排除|避开|避免|不要|[\p{Script=Han}\p{Script=Hiragana}]ない(?:で|こと|ように)?|ません|なしで?|無しで?|避けて|じゃない|ではない|\bNG\b|禁止|\bnot\b|\bno\b|\bnone\b|\bnever\b|\bavoid(?:ing)?\b|\bwithout\b|\bexclude\b|\bskip\b|\bleave out\b|\bleave off\b|\bdon'?t\b|\bdoesn'?t\b|\bwon'?t\b|\bnothing\b)/iu;
const ONLY = /(只要|只看|只选|只挑|只推荐|只放|只列|仅限?|(?<![期无無上下界])限|だけ|のみ|限定|\bonly\b)/iu;

/** Whether the words leave something out, ask for it only, only prefer it, or cannot be read. */
export function polarityOf(words: string): Polarity {
  const said = words.replace(NOT_NEGATION, " ");
  if (NOT_A_LIMIT.test(said)) return "unclear";
  const except = new RegExp(EXCEPT.source, "iu").test(said);
  const rest = said.replace(EXCEPT, " ");
  const negated = NEGATION.test(rest);
  if (except) return negated ? "only" : "exclude";
  const only = ONLY.test(rest);
  if (negated && only) return "unclear";
  if (negated) return "exclude";
  return only ? "only" : "prefer";
}

/** Whether the words hold a negation at all (the same reader; a double negation counts). */
export function saysNegation(words: string): boolean {
  const said = words.replace(NOT_NEGATION, " ");
  return new RegExp(EXCEPT.source, "iu").test(said) || NEGATION.test(said);
}
