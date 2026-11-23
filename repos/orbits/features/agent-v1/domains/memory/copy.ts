/**
 * agent-design AG14: the sentences code writes about saved memory in a conversation (zh, ja, en). Plain words only:
 * a standing rule is 「一直遵守的」, the others 「酌情参考的」; where an entry is used is 「用在：推荐活动时」.
 */
import type { AgentMemory } from "../../../agent/memory/contract";
import { appliesLabel, kindLabel, type MemoryLanguage } from "./words";

type Entry = Pick<AgentMemory, "category" | "content" | "appliesTo">;

const quoted = (language: MemoryLanguage, text: string) => (language === "en" ? `"${text}"` : `「${text}」`);
const where = (language: MemoryLanguage, entry: Pick<AgentMemory, "appliesTo">) => ({ en: `used for: ${appliesLabel(entry.appliesTo, "en")}`, ja: `使う場面：${appliesLabel(entry.appliesTo, "ja")}`, zh: `用在：${appliesLabel(entry.appliesTo, "zh")}` }[language]);
const withWhere = (language: MemoryLanguage, entry: Entry) => `${quoted(language, entry.content)}${language === "en" ? ` (${where(language, entry)})` : `（${where(language, entry)}）`}`;

/** Where the user manages the entries themselves. */
const MANAGE: Record<MemoryLanguage, string> = {
  en: "Settings → What iOrbit remembers",
  ja: "設定の「iOrbit が覚えていること」",
  zh: "设置里的「iOrbit 记住的信息」",
};

/**
 * AG14 UI (approved draft board 4 and board 8, D3): what is said as a grey note with 「去设置 ›」 rather than in the answer:
 * the 「记住」 of a turn with 「从对话里记住新的」 off, and a 「忘掉」 that matches nothing. Its text version is the same words
 * on one line (title, then the body), so answer.text and answer.blocks say the same.
 */
export interface MemoryNote {
  title: string;
  text: string;
  action?: string;
  go: string;
}

export const noteLine = (note: MemoryNote, language: MemoryLanguage): string => `${note.title}${language === "en" ? ". " : "。"}${note.text}${note.action ? (language === "en" ? ` ${note.action}` : note.action) : ""}`;

const GO: Record<MemoryLanguage, string> = { en: "Settings", ja: "設定へ", zh: "去设置" };

export const MEMORY_WORDS = {
  /** AG21b (R43): an ask to skip or pre-approve the confirmation step — it is not kept, and the rule stays. */
  confirmationStays: (language: MemoryLanguage) => ({
    en: "Confirmation can't be switched off: every change is still shown on a card first and is only made after you tap confirm yourself. This was not saved as a preference.",
    ja: "確認は省けません。変更はこれからも必ず先にカードでお見せし、ご自身で確定を押したときだけ反映します。この内容は記憶として保存していません。",
    zh: "确认这一步不能省：每个改动都会先放在确认卡上给你看，要你自己点确认才会写入。这句话没有存成记忆。",
  })[language],
  /** 「从对话里记住新的」 is off: used for this turn only, and the two ways to keep it (board 4). */
  learningOffNote(language: MemoryLanguage, content: string): MemoryNote {
    if (language === "en") return { action: `Switch on "Remember new things from conversations" and tell me again, or add it yourself in Settings.`, go: GO.en, text: `${quoted(language, content)} won't be used automatically next time. To keep it:`, title: "Used this once only, not saved" };
    if (language === "ja") return { action: "「会話から新しく覚える」をオンにしてもう一度伝えるか、設定で自分で追加してください。", go: GO.ja, text: `${quoted(language, content)}は次から自動では使いません。ずっと覚えておくには：`, title: "今回だけ使いました。保存はしていません" };
    return { action: "打开「从对话里记住新的」再说一次，或者到设置里自己加一条。", go: GO.zh, text: `${quoted(language, content)}下次不会自动用。想让我一直记着：`, title: "只用在这一次，没有存下来" };
  },
  learningOff(language: MemoryLanguage, content: string): string {
    return noteLine(MEMORY_WORDS.learningOffNote(language, content), language);
  },
  alreadySaved(language: MemoryLanguage, entry: Entry): string {
    if (language === "en") return `That is already saved: ${withWhere(language, entry)}. Nothing new was added.`;
    if (language === "ja") return `それはもう覚えています：${withWhere(language, entry)}。新しくは追加していません。`;
    return `这条已经记着了：${withWhere(language, entry)}，没有重复保存。`;
  },
  /** Nothing saved fits a 「忘掉……」 (board 3, board 8): said so, with the way to the settings page; no card. */
  nothingToForgetNote(language: MemoryLanguage, anySaved: boolean): MemoryNote {
    const title = { en: "No such memory found", ja: "そのようなメモリーは見つかりませんでした", zh: "没有找到这样一条记忆" }[language];
    return { go: GO[language], text: MEMORY_WORDS.nothingToForget(language, anySaved), title };
  },
  nothingToRemember(language: MemoryLanguage, quote: string): string {
    if (language === "en") return `I couldn't tell what to remember from "${quote}", so nothing was saved.`;
    if (language === "ja") return `「${quote}」から何を覚えればよいか分からなかったため、何も保存していません。`;
    return `「${quote}」里我没看出要记住什么，所以没有保存。`;
  },
  nothingSaved(language: MemoryLanguage): string {
    return { en: "You have no saved memories right now.", ja: "いま保存されているメモリーはありません。", zh: "你现在没有保存任何记忆。" }[language];
  },
  nothingToForget(language: MemoryLanguage, anySaved: boolean): string {
    if (!anySaved) return { en: "You have no saved memories, so there is nothing to forget.", ja: "保存されているメモリーがないため、忘れる対象はありません。", zh: "你现在没有保存任何记忆，所以没有可以忘掉的条目。" }[language];
    return { en: "None of your saved memories matches that, so nothing was deleted. Tell me which one you mean, or ask what I remember.", ja: "保存されているメモリーの中に当てはまるものがないため、何も削除していません。どれのことか教えていただくか、「何を覚えている？」と聞いてください。", zh: "你存的记忆里没有对得上这句话的，所以什么都没删。可以告诉我具体是哪一条，或者问我「你记着我哪些」。" }[language];
  },
  whichOne(language: MemoryLanguage, ask: "forget" | "change", entries: readonly Entry[]): string {
    const list = entries.map((entry, index) => `${index + 1}. ${withWhere(language, entry)}`).join("\n");
    if (language === "en") return `More than one saved memory fits. Tell me which one to ${ask === "forget" ? "forget" : "change"}:\n${list}`;
    if (language === "ja") return `当てはまるメモリーが複数あります。どれを${ask === "forget" ? "忘れる" : "変更する"}か教えてください：\n${list}`;
    return `对得上的记忆不止一条，请告诉我要${ask === "forget" ? "忘掉" : "改"}哪一条：\n${list}`;
  },
  /** What is saved, in the two groups of the settings page. */
  list(language: MemoryLanguage, entries: readonly (Entry & { expired?: boolean })[], settings: { enabled: boolean }): string {
    if (!entries.length) return MEMORY_WORDS.nothingSaved(language);
    const line = (entry: Entry & { expired?: boolean }) => `- ${entry.content}${language === "en" ? ` (${where(language, entry)}${entry.expired ? "; expired, no longer used" : ""})` : `（${where(language, entry)}${entry.expired ? { ja: "。期限切れのため使っていません", zh: "；已过期，不再使用" }[language] : ""}）`}`;
    const rules = entries.filter((entry) => entry.category === "constraint");
    const others = entries.filter((entry) => entry.category !== "constraint");
    const head = { en: `You have ${entries.length} saved ${entries.length > 1 ? "memories" : "memory"}:`, ja: `いま保存されているのは${entries.length}件です。`, zh: `你现在存了${entries.length}条：` }[language];
    const group = (title: string, list: readonly (Entry & { expired?: boolean })[]) => (list.length ? [`${title}${language === "en" ? ":" : "："}`, ...list.map(line)] : []);
    const cap = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);
    const off = settings.enabled ? [] : [{ en: "\"Use these in replies\" is switched off right now, so none of them is used.", ja: "いまは「回答で参考にする」がオフなので、どれも使っていません。", zh: "「回答时参考这些」现在是关着的，所以回答时不会用到它们。" }[language]];
    const manage = { en: `To change or delete one, tell me ("from now on …", "forget …") or go to ${MANAGE.en}.`, ja: `変更や削除は、「これからは…」「…を忘れて」と伝えるか、${MANAGE.ja}で行えます。`, zh: `想改或删，直接跟我说「以后改成……」「忘掉……」，或者到${MANAGE.zh}里改。` }[language];
    return [head, ...group(cap(kindLabel("constraint", language)), rules), ...group(cap(kindLabel("preference", language)), others), ...off, manage].join("\n");
  },
  /** Next to an answer that used saved entries: where they can be changed. */
  manageLine(language: MemoryLanguage, count: number): string {
    if (language === "en") return `${count > 1 ? "These are" : "This is"} from your saved memories; to change ${count > 1 ? "them" : "it"}, tell me ("from now on …", "forget …") or go to ${MANAGE.en}.`;
    if (language === "ja") return `${count > 1 ? "これらは" : "これは"}保存済みのメモリーです。変更したいときは「これからは…」「…を忘れて」と伝えるか、${MANAGE.ja}で変更できます。`;
    return `${count > 1 ? `这${count}条` : "这条"}来自你存的记忆；想改的话直接跟我说「以后改成……」「忘掉……」，或者到${MANAGE.zh}改。`;
  },
  /** A preferred time that none of the events listed meets: said after the basis, before the list. */
  noneAtPreferredTime(language: MemoryLanguage, time: string): string {
    if (language === "en") return `None of the events in this period is ${time}, so none below meets that preference; they are at other times, in order of start time.`;
    if (language === "ja") return `ただ、この期間に${time}のイベントはありません。以下はほかの時間帯のもので、開始時間の順です。`;
    return `不过这段时间里没有在${time}的活动，下面列的都是其他时段的，按开始时间先后。`;
  },
  /** How many there are in the period when none meets the preferred time (never "N match"). */
  periodCount(language: MemoryLanguage, listed: number, total: number, unit: string): string {
    if (language === "en") return listed >= total ? `There ${total === 1 ? "is" : "are"} ${total} in this period.` : `There are ${total} in this period; these are the first ${listed}.`;
    if (language === "ja") return listed >= total ? `この期間のものは全部で${total}${unit}です。` : `この期間のものは全部で${total}${unit}、ここでは最初の${listed}${unit}を挙げます。`;
    return listed >= total ? `这段时间一共${total}${unit}。` : `这段时间一共${total}${unit}，这里列的是前${listed}${unit}。`;
  },
  /** Why the first item of the last list came first. */
  whyFirst(language: MemoryLanguage, input: { title: string; when: string | null; used: { content: string; meets: string | null }[]; changedSince: boolean; tieBreak: boolean; turnBasis: boolean }): string {
    const lines: string[] = [];
    if (language === "en") {
      lines.push(`First was "${input.title}"${input.when ? `, starting ${input.when}` : ""}.`);
      for (const item of input.used) lines.push(`It was put first because of your saved memory "${item.content}"${item.meets ? ` — it is ${item.meets}` : ""}.`);
      if (!input.used.length && input.turnBasis) lines.push("It was put first by what you asked for in that message.");
      if (input.changedSince) lines.push("A saved memory used then has since been changed or deleted, so it is not quoted here.");
      if (input.tieBreak) lines.push("Among the ones that fit equally, the order was by start time, and it starts earliest.");
      return lines.join("\n");
    }
    if (language === "ja") {
      lines.push(`一番上は「${input.title}」${input.when ? `（${input.when} 開始）` : ""}でした。`);
      for (const item of input.used) lines.push(`これを先頭にしたのは、保存済みの「${item.content}」によるものです${item.meets ? `（${item.meets}に当たります）` : ""}。`);
      if (!input.used.length && input.turnBasis) lines.push("そのときのメッセージで指定された条件に合わせて先頭にしました。");
      if (input.changedSince) lines.push("そのとき使ったメモリーはその後変更または削除されたため、ここでは引用しません。");
      if (input.tieBreak) lines.push("同じように当てはまるものの中では開始時間の早い順で、これが一番早いです。");
      return lines.join("\n");
    }
    lines.push(`排在最前面的是「${input.title}」${input.when ? `，${input.when} 开始` : ""}。`);
    for (const item of input.used) lines.push(`把它排在前面，用的是你存的这条：「${item.content}」${item.meets ? `——它正好在${item.meets}` : ""}。`);
    if (!input.used.length && input.turnBasis) lines.push("把它排在前面，是按你那条消息里说的条件来的。");
    if (input.changedSince) lines.push("当时用到的一条记忆后来改过或删掉了，这里就不再复述它的内容。");
    if (input.tieBreak) lines.push("同样符合的几场之间按开始时间先后排，它最早。");
    return lines.join("\n");
  },
};
