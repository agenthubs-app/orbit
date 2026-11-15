/**
 * The fixed sentences of §3.11 (agent-design AG04): not understood, a question listing readings, how a
 * read-only part was understood, the entries offered after an answer, and "still missing" after the
 * one question a part gets. They restate the user's words and code's option labels only; Chinese,
 * Japanese and English. A question for a missing object reuses AG03's clarifyObject (route/handoff-copy).
 */
import type { ReplyLanguage } from "../route/handoff-copy";

export type MissingItem = "intent" | "object" | "person" | "reading";

const list = (language: ReplyLanguage, labels: readonly string[], last: "or" | "and"): string => {
  if (labels.length <= 1) return labels[0] ?? "";
  const head = labels.slice(0, -1);
  const tail = labels[labels.length - 1];
  if (language === "zh") return `${head.join("、")}${last === "or" ? "，还是" : "、"}${tail}`;
  if (language === "ja") return `${head.join("、")}${last === "or" ? "、それとも" : "、"}${tail}`;
  return `${head.join(", ")}${last === "or" ? ", or " : ", and "}${tail}`;
};

const MISSING: Record<MissingItem, Record<ReplyLanguage, string>> = {
  intent: { en: "what you would like me to do", ja: "何をすればよいか", zh: "要做的是什么" },
  object: { en: "which one it is", ja: "どれのことか", zh: "要改的是哪一条" },
  person: { en: "who it is", ja: "どなたのことか", zh: "指的是哪一位" },
  reading: { en: "which of the ways you mean", ja: "どの意味か", zh: "要按哪一种做法来" },
};

export const CLARIFY_WORDS = {
  /** Row 1: one sentence, with the directions as the choices. */
  notUnderstood(language: ReplyLanguage, quote: string | null, labels: readonly string[]): string {
    const choices = labels.length ? list(language, labels, "or") : "";
    if (language === "zh") return `${quote ? `「${quote}」` : ""}我没看懂你想让我做什么${choices ? `，是想${choices}？` : "，能具体说一下吗？"}`;
    if (language === "ja") return `${quote ? `「${quote}」は、` : ""}何をすればよいか分かりませんでした${choices ? `。${choices}のどれでしょうか？` : "。もう少し詳しく教えてください。"}`;
    return `${quote ? `In "${quote}", ` : ""}I couldn't tell what you'd like me to do${choices ? ` — ${choices}?` : ". Could you say a bit more?"}`;
  },
  /** Row 5: readings that include a write are not guessed; the readings are listed. */
  askReadings(language: ReplyLanguage, quote: string, labels: readonly string[]): string {
    const choices = list(language, labels, "or");
    if (language === "zh") return `「${quote}」可以有几种做法，你想要哪一种：${choices}？`;
    if (language === "ja") return `「${quote}」にはいくつかの意味が考えられます。${choices}のどれにしますか？`;
    return `"${quote}" could mean a few things. Which one do you want: ${choices}?`;
  },
  /** Row 3: how a read-only part was understood, said first. */
  understoodAs(language: ReplyLanguage, label: string): string {
    if (language === "zh") return `我按「${label}」来理解。`;
    if (language === "ja") return `「${label}」という意味で受け取りました。`;
    return `I took this as: ${label}.`;
  },
  /** Entries offered after an answer (other readings, a statement's entry). Clicking is the request. */
  entries(language: ReplyLanguage, labels: readonly string[]): string {
    const choices = labels.map((label) => (language === "en" ? `"${label}"` : `「${label}」`));
    if (language === "zh") return `需要的话，也可以点${list(language, choices, "and").replace(/、([^、]*)$/u, "或$1")}。`;
    if (language === "ja") return `必要なら${list(language, choices, "and")}を押してください。`;
    return `If you'd like, press ${list(language, choices, "or")}.`;
  },
  /** Asked once already and still unclear: what is missing; no second question. */
  stillUnclear(language: ReplyLanguage, quote: string, missing: MissingItem, changes: boolean): string {
    const what = MISSING[missing][language];
    if (language === "zh") return `「${quote}」还缺一项：${what}。没有这一项，${changes ? "这次什么都没有改" : "这次先不做"}。`;
    if (language === "ja") return `「${quote}」は、まだ1つ足りません：${what}。それが分からないため、${changes ? "今回は何も変更していません" : "今回は保留にします"}。`;
    return `"${quote}" is still missing one thing: ${what}. Without it, ${changes ? "nothing was changed this time" : "I'm leaving it for now"}.`;
  },
  /** Row 4 with no clue words to quote: ask only for the missing item. */
  askWhich(language: ReplyLanguage, quote: string, missing: "object" | "person"): string {
    const what = MISSING[missing][language];
    if (language === "zh") return `「${quote}」${what}？告诉我一下，我再接着做。`;
    if (language === "ja") return `「${quote}」は${what}を教えていただけますか？分かれば続けます。`;
    return `For "${quote}", could you tell me ${what}? Then I'll go on.`;
  },
  /** A part that answers an earlier question: which matter it goes on with. */
  continuing(language: ReplyLanguage, earlier: string): string {
    if (language === "zh") return `接着「${earlier}」往下做。`;
    if (language === "ja") return `「${earlier}」の続きです。`;
    return `Going on with "${earlier}".`;
  },
  /** The generic topic of an alternative when the user named no event or topic (AE-UND-011). */
  alternativeTopic(language: ReplyLanguage, scope: "events" | "records"): string {
    if (language === "zh") return scope === "events" ? "合适活动" : "相关记录";
    if (language === "ja") return scope === "events" ? "合うイベント" : "関連する記録";
    return scope === "events" ? "events that fit" : "matching records";
  },
};
