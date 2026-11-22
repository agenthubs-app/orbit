/**
 * The sentences code writes when a read did not give everything (agent-design AG05-4, PLANNER 易错边界 5),
 * in Chinese, Japanese and English. The three cases never share wording: nothing found is said as
 * nothing found; a part that could not be read is said as such (the rest was answered); a failed read
 * is a failure to read — "try again later" — and never "there is no record".
 */
import type { ReplyLanguage } from "../route/handoff-copy";

export interface GapWords {
  noRecord(quote: string): string;
  /** The name is not said back: it may be a name that exists only in another account (AE-RD-007). */
  noContact(name: string): string;
  partial(): string;
  serviceError(quote: string): string;
  /** An @ reference that cannot be opened: choose again. */
  unreadableReference(clue: string | null): string;
  /** A record used earlier in the conversation that is no longer readable. */
  unreadableEarlier(): string;
  /** AG07 run-02 (AE-SCL-007): with the read's direction, the notice says which ones may be missing (older or newer). */
  coverage(seen: number, total: number | null, direction?: ReadDirection | null): string;
  fromNotes(): string;
  unverified(quote: string): string;
  /** Finding events by conditions in the directory is not a read this version does (an attached event is). */
  eventSearch(quote: string): string;
  /** run-02: a clue of only a pronoun that nothing resolved: which record is not known, so nothing was read. */
  notWhich(quote: string): string;
  /** run-02 repair 2: a person pointed at only by a pronoun nothing resolved (no lookup ran). */
  notWho(quote: string): string;
}

const WORDS: Record<ReplyLanguage, GapWords> = {
  en: {
    coverage: (seen, total, direction) => (total !== null && total > seen
      ? direction === "oldest" ? `(There are ${total} in all; I looked at the oldest ${seen}, so newer ones may be missing.)` : direction === "newest" ? `(There are ${total} in all; I looked at the newest ${seen}, so older ones may be missing.)` : `(There are ${total} in all; I looked at ${seen} of them.)`
      : `(I looked at ${seen}; there may be more.)`),
    notWho: (quote) => `"${quote}": I'm not sure who you mean, so I didn't look anything up. Could you give the name, or attach the contact with @?`,
    notWhich: (quote) => `"${quote}": I'm not sure which record you mean, so I didn't look anything up. Could you name it, or attach it with @?`,
    eventSearch: (quote) => `"${quote}": this means searching Orbit's event directory by conditions, which I can't do yet, so I didn't search. Attach an event with @ and I can read it.`,
    fromNotes: () => "(From your notes.)",
    noContact: () => "I couldn't tell which of your Orbit contacts you mean, so I didn't look anything up. Could you give the full name, or attach the contact with @?",
    noRecord: (quote) => `"${quote}": I found nothing about this in your Orbit records.`,
    partial: () => "Some related records can't be read right now, so this answer covers only the ones I could read.",
    serviceError: (quote) => `"${quote}": I couldn't read your records this time because of a problem on our side. That doesn't mean there are none — please try again later.`,
    unreadableEarlier: () => "The record used earlier can no longer be read, so I can't answer from it again. Choose it again if you still need it.",
    unreadableReference: (clue) => `${clue ? `"${clue}"` : "The record you attached"} can't be opened — it may have been deleted or isn't yours. Please choose it again.`,
    unverified: (quote) => `"${quote}": I couldn't tie an answer to your records this time, so I'm not giving one. Please ask again.`,
  },
  ja: {
    coverage: (seen, total, direction) => (total !== null && total > seen
      ? direction === "oldest" ? `（全部で ${total} 件あり、今回は古い${seen}件を見ました。新しいものは見ていない可能性があります。）` : direction === "newest" ? `（全部で ${total} 件あり、今回は新しい${seen}件を見ました。古いものは見ていない可能性があります。）` : `（全部で ${total} 件あり、今回はそのうち ${seen} 件を見ました。）`
      : `（今回見たのは ${seen} 件で、ほかにもある可能性があります。）`),
    notWho: (quote) => `「${quote}」：どなたのことか分からないため、今回は読んでいません。お名前を挙げるか、@ で選んでください。`,
    notWhich: (quote) => `「${quote}」：どの記録のことか分からないため、今回は読んでいません。名前を挙げるか、@ で選んでください。`,
    eventSearch: (quote) => `「${quote}」：条件で Orbit のイベント一覧を探す必要がありますが、今はまだできないため、今回は探していません。@ でイベントを選べば、その内容は読めます。`,
    fromNotes: () => "（メモの内容からです。）",
    noContact: () => "どの連絡先の方のことか分からなかったため、今回は調べていません。フルネームで教えていただくか、@で連絡先を添えてください。",
    noRecord: (quote) => `「${quote}」：Orbit の記録には該当するものが見つかりませんでした。`,
    partial: () => "関連する記録の一部が今は読めないため、読めたものだけをもとに答えています。",
    serviceError: (quote) => `「${quote}」：記録を読み込む途中で問題が起きたため、今回は読めませんでした。記録がないという意味ではありません。少し時間をおいてもう一度お試しください。`,
    unreadableEarlier: () => "先ほど使った記録が今は読めないため、それをもとにもう一度答えることはできません。必要なら選び直してください。",
    unreadableReference: (clue) => `${clue ? `「${clue}」` : "選んだ記録"}は開けません。削除されたか、ご自身の記録ではない可能性があります。もう一度選び直してください。`,
    unverified: (quote) => `「${quote}」：今回は記録に基づいた答えを確かめられなかったため、答えを出していません。もう一度聞いてください。`,
  },
  zh: {
    coverage: (seen, total, direction) => (total !== null && total > seen
      ? direction === "oldest" ? `（共${total}条，这次看的是最早的${seen}条，更晚的可能没看到。）` : direction === "newest" ? `（共${total}条，这次看的是最新的${seen}条，更早的可能没看到。）` : `（共${total}条，这次看了其中${seen}条。）`
      : `（这次看了${seen}条，可能还有更多。）`),
    notWho: (quote) => `「${quote}」：我不确定你说的是哪一位，所以这次没有去读。可以说一下名字，或者用 @ 选一下。`,
    notWhich: (quote) => `「${quote}」：我不确定你指的是哪一条记录，所以这次没有去读。可以说一下它的名字，或者用 @ 选一下。`,
    eventSearch: (quote) => `「${quote}」：这要按条件在 Orbit 活动目录里找活动，现在还不能这样找，所以这次没有找。用 @ 选一场活动，我可以读它的内容。`,
    fromNotes: () => "（以上出自你的笔记。）",
    noContact: () => "我不确定你说的是哪一位联系人，所以这次没有去查。可以告诉我全名，或者用 @ 选一下这位联系人。",
    noRecord: (quote) => `「${quote}」：在你的 Orbit 记录里没有找到相关的内容。`,
    partial: () => "还有一部分相关记录这次读不到，上面只根据读得到的内容回答。",
    serviceError: (quote) => `「${quote}」这次没读到：读取记录时出了问题，并不代表没有记录。可以稍后再试一次。`,
    unreadableEarlier: () => "之前用过的那条记录现在读不到了，所以没法再根据它回答；如果还需要，请重新选择。",
    unreadableReference: (clue) => `${clue ? `「${clue}」` : "你选的记录"}打不开：它可能已被删除，或者不属于你。请重新选择一次。`,
    unverified: (quote) => `「${quote}」这次没能把回答和你的记录对上，所以先不答。请再问一次。`,
  },
};

export function gapWords(language: ReplyLanguage): GapWords {
  return WORDS[language];
}

/**
 * AG07 run-03 (AE-RD-005): when some records could not be read, the answer does not say "only" — what was read may
 * not be all there is. Code takes the word out (zh 只有/仅有, en "only" before a count, ja だけ/しか after a count).
 */
export function withoutOnly(text: string, language: ReplyLanguage): string {
  if (!text) return text;
  if (language === "zh") return text.replace(/只有|仅有|只剩/gu, "有");
  if (language === "ja") return text.replace(/((?:\d+|一|二|三)件)だけ/gu, "$1").replace(/しかありません/gu, "があります").replace(/しかない/gu, "がある");
  return text.replace(/\bonly (?=(?:one|a single|a|an|two|three|\d+)\b)/giu, "");
}

/** Which end of a person's records a partial read took. */
export type ReadDirection = "oldest" | "newest";

/** A model sentence that says older ones may be missing (en, zh, ja). */
const OLDER_MISSING = /(may|might|could) be (earlier|older)|(earlier|older) ones? (may|might|could)|更早的|还有更早|更早之前|以前の(もの|記録)|古い(もの|記録)(が|は).{0,8}(ある|かも|可能)/iu;
/** A model sentence that says newer ones may be missing. */
const NEWER_MISSING = /(may|might|could) be (later|newer|more recent)|(later|newer|more recent) ones? (may|might|could)|更晚的|更新的记录|还有更晚|最近の(もの|記録)|新しい(もの|記録)(が|は).{0,8}(ある|かも|可能)/iu;

/**
 * AG07 run-02 (AE-SCL-007): a partial read took one end of the records — the oldest or the newest. A model
 * sentence that says the other end may be missing contradicts what was read and is not delivered; code's own
 * coverage notice says it the right way round.
 */
export function withoutWrongDirection(text: string, direction: ReadDirection | null | undefined): string {
  if (!direction || !text) return text;
  const wrong = direction === "oldest" ? OLDER_MISSING : NEWER_MISSING;
  const pieces = text.match(/[^。！？!?\n]+(?:[。！？!?]+[)）]?|\n+|$)|\n+/gu) ?? [text];
  const kept: string[] = [];
  for (const piece of pieces) {
    const parts = /[A-Za-z]/u.test(piece) ? piece.split(/(?<=[.)])(?=\s*\(|\s+[A-Z])/u) : [piece];
    for (const part of parts) if (!wrong.test(part)) kept.push(part);
  }
  return kept.join("").trim();
}
