/**
 * AG08 (AG07 交接 (a), AE-UND-006): a number of the user's records stated in an answer ("山本さんとの食事は3件あります",
 * "你有 3 条待办", "you have 3 open to-dos") must come from a read made this turn — a count the read gave, or a
 * number in what was read, the message or the conversation. A sentence stating a count with no such source is
 * not delivered (like an unsourced date, answer/dates.ts). A discussion answer read nothing, so it has no counts.
 *
 * Only statements of how many records there are count: "有 N 条/件/篇/项", "N 件あります", "全部で N 件",
 * "you have / there are N notes"; a list of advice ("分五点", "三个话题") is not a count of records.
 */
const CJK_NUMBER: Record<string, number> = { 一: 1, 二: 2, 两: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9, 十: 10 };
const EN_NUMBER: Record<string, number> = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12 };

const N = "(\\d{1,4}|[一二两三四五六七八九十])";
const EN_N = "(\\d{1,4}|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve)";
const RECORD_NOUNS_EN = "(?:open |pending |overdue |recorded |saved |matching |such |related |upcoming |unfinished )?(?:notes?|memos?|records?|to-?dos?|tasks?|items?|entries|entry|events?|meetings?|appointments?|plans?|dinners?|follow-?ups?|reminders?|interactions?|contacts?)";

const PATTERNS: RegExp[] = [
  // zh: 有 3 条, 共有 3 件, 一共 3 篇, 总共 3 项待办, 3 条待办
  new RegExp(`(?:有|共有|一共有?|总共有?|合计|共)\\s*${N}\\s*(?:条|件|篇|项|个(?=待办|日程|活动|笔记|记录|安排|约)|场|次(?=往来|见面|通话))`, "gu"),
  new RegExp(`${N}\\s*(?:条|件|篇|项)\\s*(?:待办|笔记|记录|日程|安排|活动|跟进|备忘)`, "gu"),
  // ja: 3件あります, 全部で3件, 3つあります
  new RegExp(`${N}\\s*(?:件|つ|個)\\s*(?:あります|ありました|ある|です|でした|見つかりました|残っています)`, "gu"),
  new RegExp(`(?:全部で|合計|計)\\s*${N}\\s*(?:件|つ|個)`, "gu"),
  // en: you have 3 open to-dos, there are three notes, I found 2 records
  new RegExp(`\\b(?:you have|you've got|there (?:are|were|is)|there's|i found|i see|found|in all|a total of|total of)\\s+${EN_N}\\s+${RECORD_NOUNS_EN}\\b`, "giu"),
];

function valueOf(said: string): number | null {
  if (/^\d+$/u.test(said)) return Number(said);
  return CJK_NUMBER[said] ?? EN_NUMBER[said.toLowerCase()] ?? null;
}

/** The record counts a text states (numbers only). */
export function countsIn(text: string): number[] {
  // One count per number in the text, however many patterns find it.
  const found = new Map<number, number>();
  for (const pattern of PATTERNS) {
    for (const match of text.matchAll(pattern)) {
      const value = valueOf(match[1]);
      if (value !== null) found.set((match.index ?? 0) + match[0].indexOf(match[1]), value);
    }
  }
  return [...found.entries()].sort((left, right) => left[0] - right[0]).map(([, value]) => value);
}

/** Every number in the sources (digits, and the small Chinese and English number words). */
export function numbersIn(sources: readonly string[]): Set<number> {
  const out = new Set<number>();
  for (const source of sources) {
    for (const match of source.matchAll(/\d{1,4}/gu)) out.add(Number(match[0]));
    for (const [word, value] of Object.entries(CJK_NUMBER)) if (source.includes(word)) out.add(value);
    for (const [word, value] of Object.entries(EN_NUMBER)) if (new RegExp(`\\b${word}\\b`, "iu").test(source)) out.add(value);
  }
  return out;
}

/** The counts the answer states that no read of this turn gives. */
export function unsourcedCounts(answer: string, allowed: ReadonlySet<number>): number[] {
  return [...new Set(countsIn(answer))].filter((value) => !allowed.has(value));
}

/** The answer without the sentences that state a count with no source. */
export function withoutUnsourcedCounts(text: string, counts: readonly number[]): string {
  if (!counts.length) return text;
  const bad = new Set(counts);
  const pieces = text.match(/[^。！？!?\n]+(?:[。！？!?]+|\n+|$)|\n+/gu) ?? [text];
  const kept: string[] = [];
  for (const piece of pieces) {
    const parts = /[A-Za-z]/u.test(piece) ? piece.split(/(?<=\.)\s+/u) : [piece];
    for (const part of parts) if (!countsIn(part).some((value) => bad.has(value))) kept.push(part);
  }
  return kept.map((part, index) => (index > 0 && /\.$/u.test(kept[index - 1]) && /^[A-Za-z]/u.test(part) ? ` ${part}` : part)).join("").trim();
}
