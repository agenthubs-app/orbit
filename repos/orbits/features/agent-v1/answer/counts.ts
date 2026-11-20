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
  // ja: 3件あります, 全部で3件. Hotfix 1c (AE-UND-006 run-03: 「確認すべき点は3つあります」 was dropped): 3つ / 3個 count points
  // of advice, not the user's records (件 is the record counter).
  new RegExp(`${N}\\s*件\\s*(?:あります|ありました|ある|です|でした|見つかりました|残っています)`, "gu"),
  new RegExp(`(?:全部で|合計|計)\\s*${N}\\s*件`, "gu"),
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

/**
 * AG12 run-03 (AE-FN-008): an unsourced count that only introduces a list ("这篇笔记有三件事：…", "3件あります：…", "There are
 * three things in this note: …") loses the count, not the list: the words before the colon become a neutral lead-in.
 */
const LIST_COUNT: { pattern: RegExp; to: string }[] = [
  { pattern: new RegExp(`(?:里|中)?(?:有|共有|一共有?|总共有?|合计|共)\\s*${N}\\s*(?:条|件|篇|项|个|点|方面)(?:事情?|内容|要点|事项|重点)?\\s*[：:]`, "u"), to: "写了：" },
  { pattern: new RegExp(`には\\s*${N}\\s*(?:件|つ|個|点)(?:の(?:こと|内容|ポイント))?\\s*(?:あります|ありました|が書かれています)?\\s*[：:]`, "u"), to: "には次のことが書かれています：" },
  { pattern: new RegExp(`${N}\\s*(?:件|つ|個|点)(?:の(?:こと|内容|ポイント))?\\s*(?:あります|ありました)\\s*[：:]`, "u"), to: "次のことが書かれています：" },
];
const EN_LIST_COUNT = new RegExp(`^\\s*there (?:are|were) ${EN_N} (?:things|points|items|parts|notes?|records?) in (this|the|that) (note|memo|record)\\s*:`, "iu");

function neutralizedListCount(part: string): string | null {
  const en = EN_LIST_COUNT.exec(part);
  if (en) return part.replace(EN_LIST_COUNT, `${en[2][0].toUpperCase()}${en[2].slice(1)} ${en[3]} says:`);
  for (const { pattern, to } of LIST_COUNT) if (pattern.test(part)) return part.replace(pattern, to);
  return null;
}

/** The answer without the sentences that state a count with no source (a count introducing a list is neutralized instead). */
export function withoutUnsourcedCounts(text: string, counts: readonly number[]): string {
  if (!counts.length) return text;
  const bad = new Set(counts);
  const pieces = text.match(/[^。！？!?\n]+(?:[。！？!?]+|\n+|$)|\n+/gu) ?? [text];
  const kept: string[] = [];
  for (const piece of pieces) {
    const parts = /[A-Za-z]/u.test(piece) ? piece.split(/(?<=\.)[ \t]+/u) : [piece];
    for (const part of parts) {
      if (!countsIn(part).some((value) => bad.has(value))) {
        kept.push(part);
        continue;
      }
      const neutral = neutralizedListCount(part);
      if (neutral !== null && !countsIn(neutral).some((value) => bad.has(value))) kept.push(neutral);
    }
  }
  return kept.map((part, index) => (index > 0 && /\.$/u.test(kept[index - 1]) && /^[A-Za-z]/u.test(part) ? ` ${part}` : part)).join("").replace(/\n\s*\n/gu, "\n").trim();
}

/**
 * AG09 (AG08 协调者复核 交接 2, AE-SCL-008): a sentence saying how many records were seen or looked at this turn
 * ("只看到 10 条", "10件しか見えていない", "I looked at 10 notes") must agree with this turn's coverage record (how
 * many the read actually went through). The answer of AE-SCL-008 said 「10件しか見えていない」 while code's coverage
 * said 50 of 64 were seen; such a sentence is not delivered — code's own coverage line says the right numbers.
 * Only verbs of seeing or reading count; "列出 3 条过期的" (listing) and "確認" (checking) are not coverage.
 */
const SEEN_PATTERNS: RegExp[] = [
  // zh: 只看到 10 条, 看了其中 50 条, 读了前 20 篇, 翻了 30 项
  new RegExp(`(?:看到了?|看了|看过|读了|读到了?|读过|查看了|翻了|浏览了)\\s*(?:其中的?|前|最近的?|最早的?|最新的?)?\\s*${N}\\s*(?:条|件|篇|项)`, "gu"),
  // ja: 10件しか見えていない, 50件を見ただけ, 20件に目を通し, うち50件を見ました
  new RegExp(`${N}\\s*件\\s*(?:しか|だけ|のみ)?\\s*(?:を|が)?\\s*(?:見え|見て|見た|見まし|見る|読ん|読み|目を通)`, "gu"),
  // Hotfix 1c (AE-SCL-008 run-03: 「いま読み取れているのは期限が近い10件だけ」 beside code's 「50件を見ました」): the verb first.
  new RegExp(`(?:読み取れて|読めて|見えて|見られて)[^。\\n]{0,16}?${N}\\s*件`, "gu"),
  new RegExp(`(?:能读到|读得到|能看到|看得到|读取到)[^。\\n]{0,12}?${N}\\s*(?:条|件|篇|项)`, "gu"),
  // en: I looked at 10 notes, only saw the first 20 to-dos, went through 50 of them
  new RegExp(`\\b(?:saw|seen|see|looked at|look at|read|reviewed|went through|gone through|go through)\\s+(?:only\\s+)?(?:the\\s+)?(?:first\\s+|latest\\s+|nearest\\s+|most recent\\s+|top\\s+|oldest\\s+|newest\\s+)?${EN_N}\\b`, "giu"),
];

/** The numbers of records a text says were seen or looked at. */
export function seenCountsIn(text: string): number[] {
  const found = new Map<number, number>();
  for (const pattern of SEEN_PATTERNS) {
    for (const match of text.matchAll(pattern)) {
      const value = valueOf(match[1]);
      if (value !== null) found.set((match.index ?? 0) + match[0].indexOf(match[1]), value);
    }
  }
  return [...found.entries()].sort((left, right) => left[0] - right[0]).map(([, value]) => value);
}

/** The "seen" numbers a coverage record allows: each kind's seen count, and their sum. */
export function seenAllowedBy(coverage: readonly { seen: number }[]): Set<number> {
  const out = new Set(coverage.map((item) => item.seen));
  if (coverage.length > 1) out.add(coverage.reduce((sum, item) => sum + item.seen, 0));
  return out;
}

/** The answer without the sentences whose "seen" number disagrees with the coverage record (dropped numbers listed). */
export function withoutWrongSeenCounts(text: string, allowed: ReadonlySet<number>): { text: string; dropped: number[] } {
  const wrong = [...new Set(seenCountsIn(text))].filter((value) => !allowed.has(value));
  if (!wrong.length) return { dropped: [], text };
  const bad = new Set(wrong);
  const pieces = text.match(/[^。！？!?\n]+(?:[。！？!?]+|\n+|$)|\n+/gu) ?? [text];
  const kept: string[] = [];
  for (const piece of pieces) {
    const parts = /[A-Za-z]/u.test(piece) ? piece.split(/(?<=\.)[ \t]+/u) : [piece];
    for (const part of parts) if (!seenCountsIn(part).some((value) => bad.has(value))) kept.push(part);
  }
  return { dropped: wrong, text: kept.map((part, index) => (index > 0 && /\.$/u.test(kept[index - 1]) && /^[A-Za-z]/u.test(part) ? ` ${part}` : part)).join("").replace(/\n\s*\n/gu, "\n").trim() };
}

/**
 * AG09 run-02 (coordinator, AE-RD-005 at 07381abeb): when this turn's read of the subject is partial — some records could
 * not be read, or a page whose total is unknown — a sentence stating an exact or total count of records or interactions
 * ("有一次", "只有一条", "一共3次", "1回だけ", "全部で2件", "only once", "just one") claims to know all of them. Such a count
 * is not delivered: the lead-in before a colon becomes code's neutral lead ("读得到的记录里：…"), otherwise the count is
 * taken out (zh, ja) or the sentence goes (en). A count equal to a total the read itself gave (coverage.total) stays.
 */
const ZH_EXACT = [
  new RegExp(`(?<!不)(只有|仅有|一共有|总共有|共有|就有|一共|总共|只|仅|就|共|有)((?:联系|聊天?|见面?|通话|打电话|往来|沟通)?过?)\\s*${N}\\s*(?:次|条|件|篇|回|通)`, "gu"),
  new RegExp(`()((?:联系|聊天?|见面?|通话|打电话|往来|沟通)过)\\s*${N}\\s*(?:次|回)`, "gu"),
];
const JA_EXACT = [
  new RegExp(`(?:全部で|合計で?|計)\\s*${N}\\s*(?:回|件|度|つ)(?:だけ|のみ|きり)?`, "gu"),
  new RegExp(`${N}\\s*(?:回|件|度|つ)\\s*(?:だけ|のみ|きり)`, "gu"),
  new RegExp(`${N}\\s*(?:回|件|度)(?=です|でした|あります|ありました)`, "gu"),
];
const EN_EXACT = [
  /\b(?:only|just)\s+(once|twice|one|a single|\d{1,4}|two|three)\b/giu,
  /\b(?:a total of|exactly|in total)\s+(\d{1,4}|one|two|three)\b/giu,
  /\b(once|twice)\s+(?=this\b|in total\b|so far\b)/giu,
];
const EN_TIMES: Record<string, number> = { "a single": 1, once: 1, twice: 2 };

/**
 * AG10 run-03 (coordinator, AE-RD-005 at 5c02515): the split forms — "只记到 11 月 10 日这一次", "只有…那一条",
 * "…だけで、一回です", "only … once", "only have one call" — state the same exact count with words between "only" and it.
 */
const ZH_SPLIT = /(?<![不])(只有|仅有|只|仅)([^，,。；;！!？?\n：:]{1,24}?)(这|那)(一|1)\s*(次|条|件|篇|回|通)/gu;
const JA_SPLIT = [/だけ[^。！？!?\n：:]{0,20}?(一|1)\s*(?:回|件|度)/gu, /(一|1)\s*(?:回|件|度)[^。！？!?\n：:]{1,20}?だけ/gu];
const EN_SPLIT = /(?<!\bnot )\b(?:only|just)\b[^.!?\n:]{1,40}?\b(once|one (?:time|call|conversation|interaction|record|note|meeting|entry|message))\b/giu;

function exactValue(said: string): number | null {
  return EN_TIMES[said.toLowerCase()] ?? valueOf(said);
}

/** The exact or total counts of records or interactions a text states. */
export function exactCountsIn(text: string): number[] {
  // One count per number in the text, however many patterns find it (keyed by where the number stands).
  const found = new Map<number, number | null>();
  const note = (match: RegExpMatchArray, said: string, value: number | null) => found.set((match.index ?? 0) + match[0].lastIndexOf(said), value);
  for (const pattern of ZH_EXACT) for (const match of text.matchAll(pattern)) note(match, match[3], valueOf(match[3]));
  for (const pattern of JA_EXACT) for (const match of text.matchAll(pattern)) note(match, match[1], valueOf(match[1]));
  for (const pattern of EN_EXACT) for (const match of text.matchAll(pattern)) note(match, match[1], exactValue(match[1]));
  for (const match of text.matchAll(ZH_SPLIT)) note(match, match[4] + match[5], 1);
  for (const pattern of JA_SPLIT) for (const match of text.matchAll(pattern)) note(match, match[1], 1);
  for (const match of text.matchAll(EN_SPLIT)) note(match, match[1], 1);
  return [...found.entries()].sort((left, right) => left[0] - right[0]).map(([, value]) => value).filter((value): value is number => value !== null && Number.isFinite(value));
}

const NEUTRAL_LEAD: Record<"zh" | "ja" | "en", string> = { en: "In the records that could be read:", ja: "読めた記録では：", zh: "读得到的记录里：" };

function neutralized(sentence: string, language: "zh" | "ja" | "en", allowed: ReadonlySet<number>): string | null {
  if (!exactCountsIn(sentence).some((value) => !allowed.has(value))) return sentence;
  const colon = sentence.search(/[：:]/u);
  if (colon >= 0 && exactCountsIn(sentence.slice(0, colon)).some((value) => !allowed.has(value))) {
    const rest = sentence.slice(colon + 1).replace(/^\s+/u, "");
    return language === "en" ? `${NEUTRAL_LEAD.en} ${rest}` : `${NEUTRAL_LEAD[language]}${rest}`;
  }
  if (language === "en") return null;
  let out = sentence;
  for (const pattern of ZH_EXACT) out = out.replace(pattern, (whole: string, marker: string, verb: string, said: string) => (allowed.has(valueOf(said) ?? -1) ? whole : `${marker.includes("有") && !verb ? "有" : ""}${verb}`));
  for (const pattern of JA_EXACT) out = out.replace(pattern, (whole: string, said: string) => (allowed.has(valueOf(said) ?? -1) ? whole : ""));
  // AG10 run-03: the split form loses "只" and its count ("只有 11 月 10 日那一条" → "有 11 月 10 日那条"); a Japanese one goes.
  if (!allowed.has(1)) out = out.replace(ZH_SPLIT, (_whole: string, only: string, between: string, that: string, _one: string, unit: string) => `${only.includes("有") ? "有" : ""}${between}${that}${unit}`);
  if (!allowed.has(1) && JA_SPLIT.some((pattern) => new RegExp(pattern.source, "u").test(out))) return null;
  out = out.replace(/有([，,。；;！!？?])/gu, "$1");
  return out.replace(/^[\s，、,。]+/u, "").trim() ? out : null;
}

/** The answer with every exact count neutralized (a partial read); `changed` lists the sentences touched. */
export function withoutPartialCounts(text: string, language: "zh" | "ja" | "en", allowed: ReadonlySet<number>): { text: string; changed: string[] } {
  if (!exactCountsIn(text).some((value) => !allowed.has(value))) return { changed: [], text };
  const pieces = text.match(/[^。！？!?\n]+(?:[。！？!?]+|\n+|$)|\n+/gu) ?? [text];
  const kept: string[] = [];
  const changed: string[] = [];
  for (const piece of pieces) {
    const parts = language === "en" && /[A-Za-z]/u.test(piece) ? piece.split(/(?<=\.)[ \t]+/u) : [piece];
    for (const part of parts) {
      const next = neutralized(part, language, allowed);
      if (next !== part) changed.push(part.trim());
      if (next !== null && next.trim()) kept.push(next);
    }
  }
  return { changed, text: kept.map((part, index) => (index > 0 && /\.$/u.test(kept[index - 1]) && /^[A-Za-z]/u.test(part) ? ` ${part}` : part)).join("").trim() };
}
