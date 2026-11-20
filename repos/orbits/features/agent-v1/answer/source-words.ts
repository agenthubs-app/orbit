/**
 * AG14 (early judge on AE-REF-007 R2; widened after the gate run-03 judges, R1): a Japanese or English answer about
 * Chinese records keeps the records' words as they were — 「交付周期」「报价」「修订版」, and 「在意」, whose characters all
 * exist in Japanese but which is not a Japanese word. The answer model copies the material's words when it paraphrases.
 *
 * The rule, all in code:
 * - A run of Han characters (two or more) of the answer's own sentences — outside quotation marks and outside every name,
 *   title, place or tag the records show as such (code-written "Field: value" lines, headers, the user's message) — that
 *   stands word for word in a Chinese sentence of the material counts as copied.
 * - In a Japanese answer, a run that is an everyday word Japanese writes with the very same characters (月末, 期限, 内容…)
 *   is the answer's own Japanese and does not count. An English answer has no such words: every copied run counts.
 * - Copied words give the answer step its one repair, naming them (`untranslatedProblem`). What the repair still carries
 *   is delivered as a quote of the record — 「在意」 / "在意" — never as the answer's own words (`quoteSourceWords`).
 */

const HAN_RUN = /\p{Script=Han}{2,}/gu;
const KANA = /[\p{Script=Hiragana}\p{Script=Katakana}]/u;
/** Quoted spans: a quoted word is the record's own wording, said as such. */
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
]);

const isChineseSentence = (text: string) => /\p{Script=Han}/u.test(text) && !KANA.test(text);

/**
 * The words of a Japanese or English answer left as they stand in the Chinese material. `names` are the names, titles,
 * places and tags the user's message and the records give (they stay as they are); `material` the records' free text.
 */
export function untranslatedSourceWords(input: { text: string; language: "zh" | "ja" | "en"; material: readonly string[]; names: readonly string[] }): string[] {
  if (input.language === "zh") return [];
  const chinese = input.material.filter(isChineseSentence);
  if (!chinese.length) return [];
  const names = input.names.filter((name) => /\p{Script=Han}/u.test(name));
  const open = input.text.replace(QUOTED, " ");
  const found: string[] = [];
  const consider = (run: string) => {
    if (found.includes(run)) return;
    if (input.language === "ja" && SHARED_JAPANESE.has(run)) return;
    if (names.some((name) => name.includes(run))) return;
    if (!chinese.some((sentence) => sentence.includes(run))) return;
    found.push(run);
  };
  for (const match of open.matchAll(HAN_RUN)) {
    const run = match[0];
    // A longer run copied as a whole is one word; otherwise its copied two-character pieces ("最在意" → 在意).
    if (chinese.some((sentence) => sentence.includes(run)) && !(input.language === "ja" && SHARED_JAPANESE.has(run))) consider(run);
    else for (let at = 0; at + 2 <= run.length; at += 1) consider(run.slice(at, at + 2));
  }
  // A piece inside a longer word already found is not a word of its own.
  return found.filter((word) => !found.some((other) => other !== word && other.includes(word)));
}

/** The repair note the answer step adds for a part whose answer kept such words. */
export function untranslatedProblem(partId: string, words: readonly string[], language: "ja" | "en"): string {
  const target = language === "ja" ? "Japanese" : "English";
  return `${partId}: the answer is in ${target} but keeps words of the Chinese records as they are (${words.join(", ")}); say each of them in ${target}. Only a record's own name, title, place or tag stays as it is, inside 「」.`;
}

/**
 * After the one repair: the copied words still in the answer's own sentences become quotes of the record (「在意」 in
 * Japanese, "在意" in English), so nothing Chinese reads as the answer's own words. Text already quoted is left alone.
 */
export function quoteSourceWords(text: string, words: readonly string[], language: "ja" | "en"): string {
  if (!words.length) return text;
  const sorted = [...words].sort((left, right) => right.length - left.length);
  const pattern = new RegExp(sorted.map((word) => word.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&")).join("|"), "gu");
  const [open, close] = language === "ja" ? ["「", "」"] : ["\"", "\""];
  let out = "";
  let last = 0;
  for (const match of text.matchAll(QUOTED)) {
    out += text.slice(last, match.index).replace(pattern, (word) => `${open}${word}${close}`) + match[0];
    last = match.index! + match[0].length;
  }
  return out + text.slice(last).replace(pattern, (word) => `${open}${word}${close}`);
}
