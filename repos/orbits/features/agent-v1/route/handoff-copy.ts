/**
 * The fixed sentences code writes for parts it settles itself (agent-design AG03): a suggestion to
 * use an external agent, a missing permission, an alternative waiting for acceptance, a part this
 * version cannot do yet, a part waiting for another, a question, and a part left undone because the
 * round's model calls ran out. They restate what the user asked (their own words) and the names of
 * the objects it was bound to; they never make up content. Chinese, Japanese and English.
 */
import type { Route } from "./capabilities";

export type ReplyLanguage = "zh" | "ja" | "en";

const KANA = /[぀-ゟ゠-ヿｦ-ﾟ]/u;
const HAN = /[㐀-䶿一-鿿]/u;
const LATIN = /[A-Za-z]/u;

/**
 * AG06: the first layer reports the message's language; code accepts it only when the text can be in that
 * language, so one wrong guess cannot flip a whole answer:
 * - Japanese: some kana or Han, at least as much as the Latin words, and either no kana at all (a kanji-only
 *   note) or kana making at least 15% of the CJK characters;
 * - Chinese: some Han, kana under 15% of the CJK characters, and at least as much CJK as Latin words;
 * - English: the Latin words are at least the CJK characters.
 * A report that is missing or does not fit the text falls back to replyLanguage() below.
 */
/** Words of Chinese written only in Han that Japanese does not write in kanji. */
const CHINESE_ONLY = /[的了吗呢么这那们吧把被给说没还让很就啊呀嘛]/u;

/** The language a text shows by its scripts alone, or null when it could be Chinese or Japanese (Han only). */
function scriptLanguage(text: string): ReplyLanguage | null {
  const han = (text.match(/[㐀-䶿一-鿿]/gu) ?? []).length;
  const kana = (text.match(/[぀-ゟ゠-ヿｦ-ﾟ]/gu) ?? []).length;
  const latin = (text.match(/[A-Za-z]+(?:['’-][A-Za-z]+)*/gu) ?? []).length * 2;
  if (!han && !kana) return latin ? "en" : null;
  if (latin > han + kana) return "en";
  if (kana && kana / (kana + han) >= 0.15) return "ja";
  if (kana) return "zh";
  return CHINESE_ONLY.test(text) ? "zh" : null;
}

/**
 * AG06 repair 1 (AE-AMB-001, AE-UND-015): a text of Han only and nothing else ("小林", "明日予定確認") reads as Chinese
 * and as Japanese alike, so the model's report alone never decides it: the user's earlier messages in this session
 * do (the latest one whose scripts tell), else the account's or app's locale; only without both, the report.
 */
function ambiguousLanguage(reported: string | null | undefined, fallback: string | undefined, earlier: readonly string[]): { language: ReplyLanguage; source: "session" | "locale" | "reported" | "rule" } {
  for (const text of [...earlier].reverse()) {
    const known = scriptLanguage(text);
    if (known) return { language: known, source: "session" };
  }
  if (fallback === "zh" || fallback === "ja" || fallback === "en") return { language: fallback, source: "locale" };
  if (reported === "zh" || reported === "ja") return { language: reported, source: "reported" };
  return { language: "zh", source: "rule" };
}

export function replyLanguageOf(said: string, reported: string | null | undefined, fallback?: string, earlier: readonly string[] = []): { language: ReplyLanguage; source: "reported" | "rule" | "session" | "locale"; rejected?: string } {
  // AG13 (AE-SCL-026): a name quoted in another language (「半導体キャリアフォーラム」 in a Chinese message) is not the
  // language the user writes in; only the words outside the quotes decide (a message that is all quote keeps it).
  const outside = said.replace(/「[^」]*」|『[^』]*』|“[^”]*”/gu, " ");
  const message = /[぀-ゟ゠-ヿｦ-ﾟ㐀-䶿一-鿿A-Za-z]/u.test(outside) ? outside : said;
  const han = (message.match(/[㐀-䶿一-鿿]/gu) ?? []).length;
  const kana = (message.match(/[぀-ゟ゠-ヿｦ-ﾟ]/gu) ?? []).length;
  const latinWords = (message.match(/[A-Za-z]+(?:['’-][A-Za-z]+)*/gu) ?? []).length;
  // A Latin word counts as two characters: "by Friday" weighs about as much as 4 Han.
  const latin = latinWords * 2;
  // Japanese prose carries kana between its kanji (well over 15%); a Chinese sentence with a "さん" in it does not.
  // A kanji-only note ("明日予定確認") has no kana at all and can be either, so the report decides.
  const kanaShare = kana + han ? kana / (kana + han) : 0;
  // Chinese prose of Han only still carries words Japanese never writes in kanji ("了", "么", "这", "的" …): it is
  // Chinese whatever the report says. Without them ("小林", "明日予定確認") the text is ambiguous.
  if (han > 0 && kana === 0 && latinWords === 0 && CHINESE_ONLY.test(message)) return { language: "zh", source: "rule", ...(reported && reported !== "zh" ? { rejected: reported } : {}) };
  if (han > 0 && kana === 0 && latinWords === 0) {
    const decided = ambiguousLanguage(reported, fallback, earlier);
    return { ...decided, ...(reported && reported !== decided.language ? { rejected: reported } : {}) };
  }
  const fits = reported === "ja" ? (kana + han > 0 && kana + han >= latin && (kana === 0 || kanaShare >= 0.15))
    : reported === "zh" ? (han > 0 && kanaShare < 0.15 && han + kana >= latin)
      : reported === "en" ? (latinWords > 0 && latin >= han + kana)
        : false;
  if (fits) return { language: reported as ReplyLanguage, source: "reported" };
  return { language: replyLanguage(message, fallback), source: "rule", ...(reported ? { rejected: reported } : {}) };
}

/** The reply language from this turn's words: kana → Japanese; Han without kana → Chinese; else English. */
export function replyLanguage(message: string, fallback?: string): ReplyLanguage {
  if (KANA.test(message)) return "ja";
  if (HAN.test(message)) return "zh";
  if (LATIN.test(message)) return "en";
  return fallback === "ja" || fallback === "zh" ? fallback : "en";
}

type Words = {
  quote: (text: string) => string;
  names: (names: readonly string[]) => string;
  notYet: Record<"read" | "web_lookup" | "propose_write", (quote: string, names: string) => string>;
  external: (quote: string) => string;
  declined: (quote: string) => string;
  alternative: (quote: string, topic: string, scope: "events" | "records", accept?: string | null) => string;
  acceptedAlternative: (rule: boolean) => string;
  waiting: (quote: string, dependency: string) => string;
  clarifyObject: (quote: string, clue: string, candidates: readonly string[]) => string;
  clarifyNone: (quote: string) => string;
  budget: (quote: string) => string;
  answerFailed: (quote: string) => string;
  /** AG20b (R22): a part that would otherwise get no line at all. */
  notDone: (quote: string) => string;
  notUnderstood: string;
  budgetBeforeUnderstanding: string;
  join: string;
};

const WORDS: Record<ReplyLanguage, Words> = {
  zh: {
    acceptedAlternative: (rule) => rule
      ? "好，就按定期留意来。定期留意要建一条定期任务，现在还不能在对话里建，所以还没有建任何定期任务。"
      : "好，就按这个做法来。",
    alternative: (quote, topic, scope, accept) => `「${quote}」：我没办法一直不停地找下去。可以换个做法：定期留意${scope === "events" ? " Orbit 的活动目录" : "你在 Orbit 里的记录"}，看有没有新出现的${topic}，有合适的再告诉你。要不要这样做，由你决定：${accept ? `回一句，或点「${accept}」就行。` : "回一句就行。"}`,
    answerFailed: (quote) => `「${quote}」这次没处理成：写回答时出了问题。请再发一次。`,
    notDone: (quote) => `「${quote}」这次没有处理到，没有改动任何记录。请再发一次。`,
    budget: (quote) => `「${quote}」这次没做完：这一轮能用的处理次数已经用完了，并不是 Orbit 做不了这件事。再发一次，我就接着处理。`,
    budgetBeforeUnderstanding: "这次没处理成：这一轮能用的处理次数已经用完了。请再发一次。",
    clarifyNone: (quote) => `「${quote}」我没看懂要办的是哪件事，能具体说一下吗？`,
    clarifyObject: (quote, clue, candidates) => `「${quote}」里的「${clue}」我不确定指的是哪一个${candidates.length ? `，是${candidates.join("，还是")}？` : "，能告诉我一下吗？"}`,
    declined: () => "你要看的是另一位用户的资料。没有那位用户的授权，Orbit 不能读取。",
    external: (quote) => `「${quote}」：这需要自己定研究步骤、多方找资料再交叉核验，超出了 Orbit 现在能做的范围。建议交给你自己的 Codex 或 Claude 这类通用 Agent 去做；有了结果可以带回来，我再接着处理。`,
    join: "、",
    names: (names) => (names.length ? `（对象：${names.join("、")}）` : ""),
    notUnderstood: "这次没处理成：我没能把这条消息整理成可以处理的样子。请再发一次，或者换个说法。",
    notYet: {
      propose_write: (quote, names) => `「${quote}」${names}：现在还不能在对话里改这类记录，所以这次什么都没有改。`,
      read: (quote, names) => `「${quote}」${names}：这要读你在 Orbit 里的记录，现在还不能读，所以这次没有查。`,
      web_lookup: (quote, names) => `「${quote}」${names}：这要上网查公开资料，现在还不能联网，所以这次没有查。`,
    },
    quote: (text) => text,
    waiting: (quote, dependency) => `「${quote}」要等「${dependency}」有了结果才能做，这次先不做。`,
  },
  ja: {
    acceptedAlternative: (rule) => rule
      ? "では、定期的にチェックする方法で進めます。定期チェックには定期タスクを1件作る必要がありますが、今はまだ会話から作れないため、定期タスクはまだ何も作っていません。"
      : "では、その方法で進めます。",
    alternative: (quote, topic, scope, accept) => `「${quote}」：ずっと探し続けることはできません。代わりに、${scope === "events" ? "Orbit のイベント一覧" : "Orbit の記録"}に新しく${topic}が出ていないかを定期的にチェックして、合うものがあればお知らせする方法があります。そうするかどうかはお任せします。${accept ? `一言お返事いただくか、「${accept}」を押してください。` : "一言お返事ください。"}`,
    answerFailed: (quote) => `「${quote}」は今回うまく処理できませんでした。回答を作る途中で問題が起きました。もう一度送ってください。`,
    notDone: (quote) => `「${quote}」は今回処理できませんでした。記録は何も変更していません。もう一度送ってください。`,
    budget: (quote) => `「${quote}」は今回終わっていません。この回で使える処理回数を使い切ったためで、Orbit にできないことではありません。もう一度送っていただければ続けます。`,
    budgetBeforeUnderstanding: "今回はうまく処理できませんでした。この回で使える処理回数を使い切りました。もう一度送ってください。",
    clarifyNone: (quote) => `「${quote}」がどの件のことか分かりませんでした。もう少し詳しく教えてください。`,
    clarifyObject: (quote, clue, candidates) => `「${quote}」の「${clue}」がどれを指しているか分かりません${candidates.length ? `。${candidates.join("、それとも")}ですか？` : "。教えていただけますか？"}`,
    declined: () => "ご覧になりたいのは別のユーザーの記録です。そのユーザーの許可がないため、Orbit では読めません。",
    external: (quote) => `「${quote}」：自分で調査の手順を決め、複数の情報源を集めて照らし合わせる作業になるため、今の Orbit でできる範囲を超えています。ご自身の Codex や Claude のような汎用エージェントに任せることをおすすめします。結果を持ち帰っていただければ、その続きをお手伝いします。`,
    join: "、",
    names: (names) => (names.length ? `（対象：${names.join("、")}）` : ""),
    notUnderstood: "今回はうまく処理できませんでした。メッセージの内容を処理できる形に整理できませんでした。もう一度送るか、言い方を変えてみてください。",
    notYet: {
      propose_write: (quote, names) => `「${quote}」${names}：この種類の記録は、今はまだ会話から変更できないため、今回は何も変更していません。`,
      read: (quote, names) => `「${quote}」${names}：Orbit の記録を読む必要がありますが、今はまだ読めないため、今回は調べていません。`,
      web_lookup: (quote, names) => `「${quote}」${names}：ネットで公開情報を調べる必要がありますが、今はまだ調べられないため、今回は調べていません。`,
    },
    quote: (text) => text,
    waiting: (quote, dependency) => `「${quote}」は「${dependency}」の結果が出てからでないとできないため、今回は保留にします。`,
  },
  en: {
    acceptedAlternative: (rule) => rule
      ? "OK, we'll go with checking regularly. That needs a scheduled task, which can't be created from the conversation yet, so no scheduled task has been created."
      : "OK, we'll go with that approach.",
    alternative: (quote, topic, scope, accept) => `"${quote}": I can't keep searching without end. Instead, I could regularly check ${scope === "events" ? "Orbit's event directory" : "your Orbit records"} for new ${topic} and tell you when something fits. Whether to do that is up to you: ${accept ? `reply, or press "${accept}".` : "just reply."}`,
    answerFailed: (quote) => `"${quote}" was not handled this time: something went wrong while writing the answer. Please send it again.`,
    notDone: (quote) => `"${quote}" was not handled this time, and nothing in your records was changed. Please send it again.`,
    budget: (quote) => `"${quote}" is not done this time: this round's processing allowance ran out. It is not something Orbit can't do; send it again and I'll continue.`,
    budgetBeforeUnderstanding: "This was not handled: this round's processing allowance ran out. Please send it again.",
    clarifyNone: (quote) => `I couldn't tell what "${quote}" refers to. Could you say which matter you mean?`,
    clarifyObject: (quote, clue, candidates) => `In "${quote}", I'm not sure what "${clue}" refers to${candidates.length ? ` — ${candidates.join(", or ")}?` : ". Could you tell me?"}`,
    declined: () => "What you asked for is another user's data. Without that user's permission, Orbit cannot read it.",
    external: (quote) => `"${quote}": this means setting your own research plan and gathering and cross-checking many sources, which is beyond what Orbit does today. I suggest handing it to your own general-purpose agent such as Codex or Claude; bring the results back and I'll take it from there.`,
    join: ", ",
    names: (names) => (names.length ? ` (about ${names.join(", ")})` : ""),
    notUnderstood: "This was not handled: I couldn't turn your message into something I can work on. Please send it again or put it another way.",
    notYet: {
      propose_write: (quote, names) => `"${quote}"${names}: this kind of record can't be changed from the conversation yet, so nothing was changed.`,
      read: (quote, names) => `"${quote}"${names}: this needs your Orbit records, which I can't read yet, so I did not look it up.`,
      web_lookup: (quote, names) => `"${quote}"${names}: this needs public web pages, which I can't look up yet, so I did not look it up.`,
    },
    quote: (text) => text,
    waiting: (quote, dependency) => `"${quote}" has to wait for the result of "${dependency}", so I'm leaving it for now.`,
  },
};

export function handoffWords(language: ReplyLanguage): Words {
  return WORDS[language];
}

export function notYetText(language: ReplyLanguage, route: Route, quote: string, names: readonly string[]): string {
  const words = WORDS[language];
  const key = route === "web_lookup" ? "web_lookup" : route === "propose_write" ? "propose_write" : "read";
  return words.notYet[key](quote, words.names(names));
}
