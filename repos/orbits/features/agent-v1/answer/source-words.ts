/**
 * AG14 (early judge on AE-REF-007 R2; widened after the gate run-03 judges, R1; units after the integrator's AE-WEB-008):
 * a Japanese or English answer about Chinese material keeps the material's words as they were — 「交付周期」「报价」
 * 「修订版」, and 「在意」, whose characters all exist in Japanese but which is not a Japanese word. The answer model copies
 * the material's words when it paraphrases.
 *
 * The rule, all in code:
 * - The unit is a whole run of Han characters of the answer (two or more, bounded by anything that is not Han). A run
 *   counts as copied only when the whole run stands word for word in a Chinese sentence of the material. A piece of a
 *   longer run is never a word of its own: 東都映画 is one name, 都映 inside it is nothing; 北行列車 is one title.
 * - Names, titles, places and tags the material shows as such (code-written "Field: value" lines, headers, the user's
 *   message) are never copied words, nor anything inside them.
 * - In a Japanese answer, a run that is an everyday word Japanese writes with the very same characters (月末, 期限, 内容,
 *   希望…) is the answer's own Japanese. An English answer has no such words.
 * - Quotation marks set their content aside only when the whole quoted string is taken word for word from what was read
 *   (a verbatim quote). A phrase the model made up and put in quotation marks is checked for the repair like the rest.
 * - Copied words give the answer step its one repair, naming them (`untranslatedProblem`). What the repair still carries
 *   in the answer's own (unquoted) sentences is delivered as a quote of the material — 「在意」 / "在意" — never as the
 *   answer's own words (`quoteSourceWords`). Nothing inside text that is already quoted is marked, and marks never nest.
 * - Web pages are material like the user's records: a Japanese answer about a Chinese page is held to the same rule (the
 *   reader cannot read the Chinese either), and the page's title and the names it gives are units the rule leaves alone.
 */

const HAN_RUN = /\p{Script=Han}{2,}/gu;
const KANA = /[\p{Script=Hiragana}\p{Script=Katakana}]/u;
/** Quoted spans (the outermost quotation marks). */
const QUOTED = /「[^」]*」|『[^』]*』|“[^”]*”|"[^"]*"|【[^】]*】/gu;

/**
 * Everyday Japanese words written with exactly the characters Chinese uses (so a Chinese note can contain them and a
 * Japanese answer may use them as its own). Kept short and literal: a word missing here only costs one repair.
 */
const SHARED_JAPANESE = new Set([
  "月末", "月初", "期限", "内容", "必要", "重要", "提案", "方案", "最初", "分析", "今日", "明日", "今年", "来月", "先月", "今月",
  "予定", "担当", "会社", "社長", "部長", "名刺", "資料", "案件", "顧客", "商品", "理由", "目標", "目的", "方法", "意見", "以上",
  "以下", "以内", "以外", "前後", "午前", "午後", "全部", "一部", "半分", "大学", "中国", "日本", "東京", "大阪", "京都", "時期",
  "当日", "翌日", "前日", "毎日", "平日", "休日", "現在", "最近", "今後", "以前", "以後", "主要", "重点", "優先", "対応", "相手",
  // AE-REF-007 run 1 after the widening: 希望 was named in the repair note although it is everyday Japanese.
  "希望", "了解", "注意", "安心", "自由", "成功", "失敗", "感謝", "相談", "交流", "参加", "出席", "予約", "変更", "修正", "作成",
  "代表作", "作品", "映画", "監督", "主演", "公開", "出版", "作家", "写真", "展示", "会場", "開催",
]);

const isChineseSentence = (text: string) => /\p{Script=Han}/u.test(text) && !KANA.test(text);

/**
 * Coordinator, after AE-REF-007 run 4: quotation marks exempt their content only when the whole quoted string is taken
 * word for word from what was read — a record's text, name or title, or the user's own message.
 */
export function isVerbatimQuote(span: string, sources: readonly string[]): boolean {
  const inner = span.slice(1, -1).trim();
  return inner.length > 0 && sources.some((source) => source.includes(inner));
}

/**
 * The words of a Japanese or English answer left as they stand in the Chinese material: whole Han runs only. `names`
 * are the names, titles, places and tags the user's message and the material give; `material` the free text.
 */
export function untranslatedSourceWords(input: { text: string; language: "zh" | "ja" | "en"; material: readonly string[]; names: readonly string[] }): string[] {
  if (input.language === "zh") return [];
  const chinese = input.material.filter(isChineseSentence);
  if (!chinese.length) return [];
  const names = input.names.filter((name) => /\p{Script=Han}/u.test(name));
  const sources = [...input.material, ...input.names];
  // A verbatim quote of what was read is set aside; a made-up phrase in quotation marks is read like the rest.
  const scanned = input.text.replace(QUOTED, (span) => (isVerbatimQuote(span, sources) ? " " : ` ${span.slice(1, -1)} `));
  const found: string[] = [];
  for (const match of scanned.matchAll(HAN_RUN)) {
    const run = match[0];
    if (found.includes(run)) continue;
    if (input.language === "ja" && SHARED_JAPANESE.has(run)) continue;
    if (names.some((name) => name.includes(run))) continue;
    if (!chinese.some((sentence) => sentence.includes(run))) continue;
    found.push(run);
  }
  return found;
}

/** The repair note the answer step adds for a part whose answer kept such words. */
export function untranslatedProblem(partId: string, words: readonly string[], language: "ja" | "en"): string {
  const target = language === "ja" ? "Japanese" : "English";
  return `${partId}: the answer is in ${target} but keeps words of the Chinese material as they are (${words.join(", ")}); say each of them in ${target}. Only a name, title, place or tag the material gives stays as it is.`;
}

/**
 * After the one repair: each copied word that still stands as a whole Han run in the answer's own (unquoted) sentences
 * becomes a quote of the material (「在意」 in Japanese, "在意" in English). Text inside quotation marks is never marked,
 * and a run that only contains a copied word is not the word.
 */
export function quoteSourceWords(text: string, words: readonly string[], language: "ja" | "en"): string {
  if (!words.length) return text;
  const wanted = new Set(words);
  const [open, close] = language === "ja" ? ["「", "」"] : ["\"", "\""];
  const mark = (part: string) => part.replace(HAN_RUN, (run) => (wanted.has(run) ? `${open}${run}${close}` : run));
  let out = "";
  let last = 0;
  for (const match of text.matchAll(QUOTED)) {
    out += mark(text.slice(last, match.index)) + match[0];
    last = match.index! + match[0].length;
  }
  return out + mark(text.slice(last));
}
