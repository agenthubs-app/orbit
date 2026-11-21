/**
 * Everything the second-level functions say to the user, written by code (agent-design AG10; the model never writes
 * these lines): the basis a ranking used, the question when there is none, the items extracted from a memo with the
 * memo's own sentences, what was already recorded, comparisons and groups. Chinese, Japanese and English.
 */
import type { RankField } from "../understand/schema";
import type { TimePreference } from "./basis";

export type Language = "zh" | "ja" | "en";

const WEEKDAY: Record<Language, string[]> = { en: ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"], ja: ["日", "月", "火", "水", "木", "金", "土"], zh: ["周日", "周一", "周二", "周三", "周四", "周五", "周六"] };
const MONTH_EN = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "11月21日（周六）", "11月21日（土）", "Sat, Nov 21" (the year only when it is not 2026). */
export function dayWordsOf(day: string, language: Language): string {
  const [year, month, date] = day.split("-").map(Number);
  if (!month) return day;
  const weekday = WEEKDAY[language][new Date(Date.UTC(year, month - 1, date)).getUTCDay()];
  if (language === "en") return `${weekday}, ${MONTH_EN[month - 1]} ${date}${year === 2026 ? "" : `, ${year}`}`;
  return `${year === 2026 ? "" : `${year}年`}${month}月${date}日（${weekday}）`;
}

export function localParts(iso: string, timeZone: string): { day: string; time: string } {
  const parts = Object.fromEntries(new Intl.DateTimeFormat("en-CA", { day: "2-digit", hour: "2-digit", hourCycle: "h23", minute: "2-digit", month: "2-digit", timeZone, year: "numeric" }).formatToParts(new Date(iso)).map((part) => [part.type, part.value]));
  return { day: `${parts.year}-${parts.month}-${parts.day}`, time: `${parts.hour}:${parts.minute}` };
}

/** "11月21日（周六）10:00". */
export function whenWordsOf(iso: string, timeZone: string, language: Language): string {
  const { day, time } = localParts(iso, timeZone);
  return `${dayWordsOf(day, language)}${language === "en" ? " " : " "}${time}`;
}

export const join = (language: Language) => (language === "en" ? ", " : "、");
export const quoted = (language: Language, text: string) => (language === "en" ? `"${text}"` : `「${text}」`);

/* ── ranking ─────────────────────────────────────────────────────────── */

export function timeWords(preference: Pick<TimePreference, "days" | "part" | "clock" | "weekdays">, language: Language): string {
  // AG21c (R33): days named one by one ("周日", "日曜", "on Sunday").
  const named = (preference.weekdays ?? []).map((day) => ({ en: ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"][day], ja: `${"日月火水木金土"[day]}曜`, zh: `周${"日一二三四五六"[day]}` })[language]);
  const days = preference.days === "weekend" ? { en: "on a weekend", ja: "週末", zh: "周末" }[language] : preference.days === "weekday" ? { en: "on a weekday", ja: "平日", zh: "工作日" }[language] : named.length ? (language === "en" ? `on ${named.join(" or ")}` : named.join("、")) : "";
  const part = preference.part ? { afternoon: { en: "afternoon", ja: "午後", zh: "下午" }, evening: { en: "evening", ja: "夜", zh: "晚上" }, morning: { en: "morning", ja: "午前", zh: "上午" } }[preference.part][language] : "";
  // AG21b (R33): a clock boundary, as a 24-hour time.
  const at = preference.clock ? `${String(Math.floor(preference.clock.minutes / 60)).padStart(2, "0")}:${String(preference.clock.minutes % 60).padStart(2, "0")}` : "";
  const clock = !preference.clock ? "" : preference.clock.side === "from" ? { en: `starting at ${at} or later`, ja: `${at}以降に開始`, zh: `${at}以后开始` }[language] : { en: `starting before ${at}`, ja: `${at}より前に開始`, zh: `${at}以前开始` }[language];
  if (language === "en") return [days, part ? `in the ${part}` : "", clock].filter(Boolean).join(" ");
  return `${days}${part}${clock}`;
}

export function fieldName(field: RankField, language: Language): string {
  return {
    dueAt: { en: "due date", ja: "期限", zh: "截止时间" },
    lastInteraction: { en: "the date of your last recorded interaction", ja: "最後に記録されたやり取りの日付", zh: "最近一次往来的日期" },
    plannedDate: { en: "planned date", ja: "予定日", zh: "计划日" },
    startsAt: { en: "start time", ja: "開始時間", zh: "开始时间" },
  }[field][language];
}

export function fieldOrderWords(field: RankField, direction: "asc" | "desc", language: Language): string {
  const name = fieldName(field, language);
  if (field === "dueAt" && direction === "asc") return { en: "by due date, the most overdue first", ja: "期限の古い順（期限を最も過ぎたものから）", zh: "按截止时间，过期最久的排前面" }[language];
  if (language === "en") return `by ${name}, ${direction === "asc" ? (field === "lastInteraction" ? "oldest first" : "earliest first") : "latest first"}`;
  if (language === "ja") return `${name}の${direction === "asc" ? (field === "lastInteraction" ? "古い順" : "早い順") : field === "lastInteraction" ? "新しい順" : "遅い順"}`;
  return `按${name}${direction === "asc" ? "从早到晚" : "从晚到早"}`;
}

/** The lead of a ranking: what it used, in the order it used them (设计稿 §3.5 "在回答开头写明用了什么"). */
export function rankLead(language: Language, steps: readonly string[], sources: { memory: string[]; history: boolean; natural: boolean }): string {
  if (sources.natural) {
    return { en: `You did not name a standard, so these are simply in order of ${steps[0] ?? "start time"} — not a judgement of which is best.`, ja: `基準の指定がなかったため、${steps[0] ?? "開始時間"}の順に並べただけです（どれが一番良いかの判断ではありません）。`, zh: `因为没有指定标准，这次是按${steps[0] ?? "开始时间"}先后给的，只是时间最近的几项，不代表最值得。` }[language];
  }
  const memory = sources.memory.length ? { en: `your saved ${sources.memory.length > 1 ? "preferences" : "preference"} ${sources.memory.map((item) => `"${item}"`).join(" and ")}`, ja: `保存済みの${sources.memory.map((item) => `「${item}」`).join("と")}`, zh: `你存过的${sources.memory.map((item) => `「${item}」`).join("和")}` }[language] : "";
  const parts = [...(memory ? [memory] : []), ...steps];
  if (sources.history) {
    return { en: `Based on your own records: ${parts.join("; then ")}.`, ja: `あなた自身の記録から判断しました：${parts.join("、次に")}。`, zh: `依据来自你自己的记录：${parts.join("；其次是")}。` }[language];
  }
  if (parts.length > 1) return { en: `First by ${parts[0]}, then by ${parts.slice(1).join(", then by ")}.`, ja: `まず${parts[0]}、次に${parts.slice(1).join("、その次に")}で選びました。`, zh: `先看${parts[0]}，再看${parts.slice(1).join("，再看")}。` }[language];
  const first = parts[0] ?? "";
  if (/^(?:按|by\b)/iu.test(first) || /順/u.test(first)) return { en: `Ordered ${first}.`, ja: `${first}で並べました。`, zh: `${first}。` }[language];
  return { en: `Picked by ${first || "the records"}.`, ja: `${first || "記録"}で選びました。`, zh: `按${first || "记录"}来挑。` }[language];
}

/** The entry to change the basis, next to the lead. */
export function changeBasisLine(language: Language): string {
  return { en: "To rank by something else, tell me the standard (for example \"by start time\" or \"related to @a note\").", ja: "別の基準で並べ直したいときは、基準を教えてください（例：「開始時間の順」「@メモ のテーマに合うもの」）。", zh: "想换个依据重新排，直接告诉我新的标准就行（例如「按开始时间」「跟 @某篇笔记 的主题有关」）。" }[language];
}

/** The question when there is no basis at all (设计稿 §3.5: 只问这一轮). */
export function askBasisLine(language: Language, quote: string, labels: readonly string[]): string {
  const list = labels.join(language === "en" ? " / " : "／");
  return {
    en: `For "${quote}", what should I pick by? I won't choose a standard for you. Ways that work now: ${list}. You can also tell me your own standard, or say "any" and I'll go by the natural order.`,
    ja: `「${quote}」は何を基準に選びますか？こちらで基準を決めることはしません。今使える並べ方：${list}。ご自分の基準を書いていただいても、「どれでも」と言っていただいても大丈夫です（その場合は自然な順に並べます）。`,
    zh: `「${quote}」想按什么来挑？我不替你定标准。现在能用的排法：${list}。也可以直接说你的标准；说「随便」我就按自然顺序给。`,
  }[language];
}

export function orderingLabel(key: string, language: Language): string {
  const labels: Record<string, Record<Language, string>> = {
    lastInteraction: { en: "Longest without contact first", ja: "連絡していない期間が長い順", zh: "按最久没联系的先" },
    overdue: { en: "Overdue follow-ups first", ja: "期限を過ぎたフォローアップから", zh: "先看逾期没做的跟进" },
    dueAt: { en: "By due date", ja: "期限の順", zh: "按截止时间" },
    plannedDate: { en: "By planned date", ja: "予定日の順", zh: "按计划日" },
    startsAt: { en: "By start time", ja: "開始時間の順", zh: "按开始时间先后" },
    topic: { en: "Related to one of your notes (pick it with @)", ja: "メモのテーマに合うもの（@ で選ぶ）", zh: "跟某篇笔记的主题相关（用 @ 选）" },
    weekend: { en: "Weekends first", ja: "週末を優先", zh: "优先周末的" },
  };
  return labels[key]?.[language] ?? key;
}

/** "时间未公布" for an item with no start time (never given a date). */
export function untimedLine(language: Language, names: readonly string[]): string {
  return { en: `Time not announced yet (left out of the order): ${names.join(", ")}.`, ja: `開始時間が未公開のもの（順番には入れていません）：${names.join("、")}。`, zh: `时间未公布（没有排进先后）：${names.join("、")}。` }[language];
}

/**
 * AG13 rerun of AG10 (AE-FN-001): the topic check did not finish, so nothing is said to "match"; the list is in the order
 * code could test (the time preferences, the start times), and the user is told the topic was not checked.
 */
export function uncheckedCoverageLine(language: Language, listed: number, topic: string | null, unit: { zh: string; ja: string; en: string }): string {
  if (language === "en") return `${topic ? `Whether they fit ${topic} could not be checked this time (the review was unavailable), so` : "The review was unavailable this time, so"} these ${listed} ${unit.en} are only in the order of what could be checked from their dates and times.`;
  if (language === "ja") return `${topic ? `${topic}に合うかどうかは今回確認できませんでした（確認が一時的に使えませんでした）。` : "今回は確認が一時的に使えませんでした。"}ここに挙げた${listed}${unit.ja}は、日時から確認できる条件の順に並べただけです。`;
  return `${topic ? `和${topic}的相关性这次没能核对（复核暂时不可用），` : "这次复核暂时不可用，"}下面这${listed}${unit.zh}只是按日期和时间能核对的条件排的，没有按主题筛过。`;
}

export function coverageLine(language: Language, listed: number, total: number, unit: { zh: string; ja: string; en: string }): string {
  if (total === 0) return { en: "None match these criteria right now.", ja: "今のところ、この基準に該当するものはありません。", zh: "按这些条件，现在没有符合的。" }[language];
  if (listed >= total) return { en: `${total} in all match.`, ja: `該当は全部で${total}${unit.ja}です。`, zh: `符合条件的一共${total}${unit.zh}。` }[language];
  return { en: `${total} in all match; these are the first ${listed}.`, ja: `該当は全部で${total}${unit.ja}、ここでは最初の${listed}${unit.ja}を挙げます。`, zh: `符合条件的一共${total}${unit.zh}，这里列的是前${listed}${unit.zh}。` }[language];
}

/** AE-FN-003: the ones with something due or planned later in the period, said apart from those that meet the criteria. */
export function upcomingApartLine(language: Language, items: readonly string[]): string {
  return { en: `Also coming up in this period, not overdue yet (not counted above): ${items.join("; ")}.`, ja: `このほか、期間内に期限や予定日があり、まだ過ぎていないもの（上の件数には含めていません）：${items.join("、")}。`, zh: `另外，这段时间里还有到期或计划要做、但还没过期的（不算在上面）：${items.join("；")}。` }[language];
}

/* ── extraction ──────────────────────────────────────────────────────── */

const HOW: Record<Language, Record<string, Record<string, string>>> = {
  en: { email: { incoming: "they e-mailed you", mutual: "e-mails", outgoing: "you e-mailed them" }, meeting: { incoming: "met", mutual: "met", outgoing: "met" }, message: { incoming: "they messaged you", mutual: "messages", outgoing: "you messaged them" }, other: { incoming: "they got in touch", mutual: "in touch", outgoing: "you got in touch" }, phone: { incoming: "they called you", mutual: "a call", outgoing: "you called them" } },
  ja: { email: { incoming: "先方からメール", mutual: "メールのやり取り", outgoing: "こちらからメール" }, meeting: { incoming: "面会", mutual: "面会", outgoing: "面会" }, message: { incoming: "先方からメッセージ", mutual: "メッセージのやり取り", outgoing: "こちらからメッセージ" }, other: { incoming: "先方から連絡", mutual: "やり取り", outgoing: "こちらから連絡" }, phone: { incoming: "先方から電話", mutual: "通話", outgoing: "こちらから電話" } },
  zh: { email: { incoming: "对方来信", mutual: "邮件往来", outgoing: "你发了邮件" }, meeting: { incoming: "见面", mutual: "见面", outgoing: "见面" }, message: { incoming: "对方发来消息", mutual: "消息往来", outgoing: "你发了消息" }, other: { incoming: "对方联系了你", mutual: "联系过", outgoing: "你联系了对方" }, phone: { incoming: "对方来电", mutual: "通话", outgoing: "你打了电话" } },
};

export function howWords(channel: string, direction: string, language: Language): string {
  return HOW[language][channel]?.[direction] ?? HOW[language].other.mutual;
}

export const WHY_NOT: Record<string, Record<Language, string>> = {
  between_others: { en: "a contact between other people (or one you heard about), not yours", ja: "ほかの人どうしのやり取り（または伝え聞いた話）で、あなたのやり取りではありません", zh: "是别人之间的事（或转述来的），不是你和对方的往来" },
  mentioned_only: { en: "only mentioned", ja: "話に出ただけ", zh: "只是被提到" },
  not_asked_about: { en: "not the person you asked about", ja: "お尋ねの相手ではありません", zh: "不是你问的这位" },
  not_linked: { en: "not one of this note's contacts, so it was not matched to a contact", ja: "このメモに紐づく連絡先に見当たらないため、連絡先と結び付けていません", zh: "不在这篇笔记关联的联系人里，没有对应到联系人" },
  planned: { en: "only an intention to get in touch later; it has not happened", ja: "これから連絡するつもりというだけで、まだ実際のやり取りではありません", zh: "只是打算以后联系，还没有发生" },
  review_no: { en: "the review found it is not a contact between you and this person", ja: "確認の結果、あなたとこの人の実際のやり取りではないと判断しました", zh: "复核认为这不是你和这位的实际往来" },
  unsure: { en: "doubtful: the review was not sure it is your own contact that already happened, so it is only listed", ja: "要確認：あなた自身の実際のやり取りかどうか確認で確信が持てなかったため、一覧に載せるだけにしています", zh: "存疑：复核没有把握这是你本人已经发生的往来，所以只列出来" },
};

export function dueWords(language: Language, day: string | null, text: string | null): string {
  if (day) return { en: `due by ${dayWordsOf(day, language)}`, ja: `期限：${dayWordsOf(day, language)}まで`, zh: `最迟 ${dayWordsOf(day, language)}` }[language];
  return { en: `deadline as written: ${text}`, ja: `期限（原文のまま）：${text}`, zh: `期限（原文）：${text}` }[language];
}

export function plannedWords(language: Language, day: string | null, text: string | null): string {
  if (day) return { en: `planned for ${dayWordsOf(day, language)}`, ja: `予定：${dayWordsOf(day, language)}`, zh: `计划 ${dayWordsOf(day, language)} 做` }[language];
  return { en: `day as written: ${text}`, ja: `日付（原文のまま）：${text}`, zh: `日期（原文）：${text}` }[language];
}

export const HEADINGS: Record<string, Record<Language, string>> = {
  doubtfulPromise: { en: "Possibly yours, but not confirmed (only listed)", ja: "あなたの約束かもしれないが確認できなかったもの（一覧のみ）", zh: "可能是你的承诺，但复核没有把握（只列出）" },
  interactions: { en: "Interactions that actually happened", ja: "実際にあったやり取り", zh: "实际发生的往来" },
  myPromises: { en: "What you committed to", ja: "あなたが約束したこと", zh: "你答应的事（本人承诺）" },
  notInteractions: { en: "Not counted as your interactions", ja: "やり取りとして数えていないもの", zh: "不算你的往来" },
  otherPromises: { en: "What the other person said they would do", ja: "相手が約束したこと", zh: "对方答应的事" },
  suggestions: { en: "Only to consider (not a commitment)", ja: "検討事項・予定（約束ではありません）", zh: "仅供考虑或打算（不算承诺）" },
};

export function noMyPromiseLine(language: Language): string {
  return { en: "This note has nothing that you yourself committed to do.", ja: "このメモには、あなた自身が約束したことは書かれていません。", zh: "这篇笔记里没有你本人已经答应要做的事。" }[language];
}

export function noInteractionLine(language: Language): string {
  return { en: "This note has no interaction that actually happened between you and a contact, so there is nothing to record.", ja: "このメモには、あなたと連絡先との間で実際にあったやり取りがないため、記録するものはありません。", zh: "这篇笔记里没有你本人和联系人已经发生的往来，所以没有可记的。" }[language];
}

export function memoHead(language: Language, title: string, day: string): string {
  return { en: `From your note${title ? ` "${title}"` : ""} (${dayWordsOf(day, language)}):`, ja: `メモ${title ? `「${title}」` : ""}（${dayWordsOf(day, language)}）から：`, zh: `出自你的笔记${title ? `「${title}」` : ""}（${dayWordsOf(day, language)}）：` }[language];
}

export function sentenceQuote(language: Language, text: string): string {
  return { en: `— the note says: "${text}"`, ja: `——原文：「${text}」`, zh: `——原句：「${text}」` }[language];
}

/* ── link back ───────────────────────────────────────────────────────── */

export function recordedLine(language: Language, who: string, day: string | null, how: string, title: string): string {
  const when = day ? dayWordsOf(day, language) : "";
  return { en: `Already recorded: the note "${title}" already holds this interaction (${who}, ${when}, ${how}); nothing new was added. You can open the note to see it.`, ja: `記録済みです：メモ「${title}」にこのやり取り（${who}、${when}、${how}）はすでに記録されているため、新しくは追加していません。メモを開いて確認できます。`, zh: `已经记过了：这次往来（${who}，${when}，${how}）已经记在笔记「${title}」上，这次没有另外新增，可以打开这篇笔记查看。` }[language];
}

export function conflictLine(language: Language, title: string, existing: string, found: string): string {
  return { en: `The note "${title}" already records a different interaction (${existing}); this one (${found}) was not written over it. Tell me which one is right.`, ja: `メモ「${title}」には別のやり取り（${existing}）が記録されています。今回の内容（${found}）で上書きはしていません。どちらが正しいか教えてください。`, zh: `笔记「${title}」上已经记了另一次往来（${existing}），这次的（${found}）没有覆盖它。请告诉我哪一个是对的。` }[language];
}

export function statusWords(status: string, language: Language): string {
  if (status === "completed") return { en: "done", ja: "完了", zh: "已完成" }[language];
  return { en: "not done yet", ja: "未完了", zh: "未完成" }[language];
}

export function existingTodoLine(language: Language, title: string, status: string, when: string | null): string {
  return { en: `Already a to-do: "${title}"${when ? ` (${when})` : ""}, ${statusWords(status, language)}. Nothing new was added.`, ja: `すでにタスクがあります：「${title}」${when ? `（${when}）` : ""}、${statusWords(status, language)}。新しくは追加していません。`, zh: `已经有这条待办：「${title}」${when ? `（${when}）` : ""}，现在${statusWords(status, language)}。这次没有再新增。` }[language];
}

export function differsLine(language: Language, title: string, changes: readonly string[], elsewhere?: { status: string }): string {
  // AG20a R11: a to-do the user made elsewhere for the same thing (not from this note) is named as such, with its state.
  if (elsewhere) return { en: `You already have a to-do for this: "${title}" (${statusWords(elsewhere.status, language)}), but ${changes.join("; ")}. Nothing was added or changed; tell me if it should be updated.`, ja: `同じ件のタスク「${title}」がすでにあります（${statusWords(elsewhere.status, language)}）が、${changes.join("、")}。追加も変更もしていません。直す必要があれば教えてください。`, zh: `已经有这件事的待办「${title}」（现在${statusWords(elsewhere.status, language)}），但${changes.join("；")}。这次没有新增也没有改；需要改的话告诉我。` }[language];
  return { en: `A to-do from this note already exists ("${title}"), but ${changes.join("; ")}. Nothing was added or changed; tell me if it should be updated.`, ja: `このメモから作ったタスク「${title}」がすでにありますが、${changes.join("、")}。追加も変更もしていません。直す必要があれば教えてください。`, zh: `这篇笔记已经建过待办「${title}」，但${changes.join("；")}。这次没有新增也没有改；需要改的话告诉我。` }[language];
}

export function unsureTodoLine(language: Language, action: string, title: string): string {
  return { en: `"${action}" may be the to-do you already have, "${title}"; I could not tell, so nothing was added. Say "add it anyway" if it is a different one.`, ja: `「${action}」は既存のタスク「${title}」と同じかもしれません。判断できなかったため追加していません。別のものなら「それでも追加して」と言ってください。`, zh: `「${action}」可能就是你已有的待办「${title}」，我分不清，所以没有新增；如果不是同一件，说「仍然新增」就行。` }[language];
}

export function nothingToAddLine(language: Language): string {
  return { en: "There is no commitment of yours in this note to add as a to-do.", ja: "このメモには、タスクとして追加できるあなた自身の約束がありません。", zh: "这篇笔记里没有可以加成待办的、你本人答应的事。" }[language];
}

/** AG10 run-03 (AE-FN-009 R3): the extraction failed, but the memo already holds the interaction. */
export function recordedButFailedLine(language: Language, who: string, day: string | null, how: string, title: string): string {
  const when = day ? dayWordsOf(day, language) : "";
  return { en: `The note "${title}" already records this interaction (${who}, ${when}, ${how}); going through it again did not work this time, and nothing was changed. You can open the note to see it.`, ja: `メモ「${title}」には、このやり取り（${who}、${when}、${how}）がすでに記録されています。今回は読み取り直せなかったため、何も変更していません。メモを開いて確認できます。`, zh: `这次往来（${who}，${when}，${how}）已经记在笔记「${title}」上了；这次没能再整理，什么都没有改，可以打开这篇笔记查看。` }[language];
}

export function extractFailedLine(language: Language, quote: string): string {
  return { en: `"${quote}": the note could not be gone through this time; nothing was changed. Please try again.`, ja: `「${quote}」：今回はメモを読み取れなかったため、何も変更していません。もう一度お試しください。`, zh: `「${quote}」这次没能整理这篇笔记，什么都没有改，可以再试一次。` }[language];
}

export function noMemoLine(language: Language, quote: string): string {
  return { en: `"${quote}": I could not tell which note to go through; pick it with @ and ask again.`, ja: `「${quote}」：どのメモを整理するか分かりませんでした。@ でメモを選んでもう一度お願いします。`, zh: `「${quote}」我没看出要整理哪一篇笔记，用 @ 选中那篇再说一次就行。` }[language];
}

/* ── summary ─────────────────────────────────────────────────────────── */

/** The lead when "整理一下" named no product: the user's own word is restated (AG10 run-02, AE-RD-008 a). */
export function summaryLead(language: Language, word: string): string {
  return { en: `You didn't say what to make of it, so I took "${word}" as a short summary of the note (nothing was changed):`, ja: `何を作るかの指定がなかったので、「${word}」をメモの要約と受け取りました（何も変更していません）：`, zh: `你没说要整理成什么，我把“${word}”理解成给这篇笔记写一段摘要（没有改任何记录）：` }[language];
}

export function summaryEntryLabel(kind: "interactions" | "followUps", language: Language): string {
  return kind === "interactions" ? { en: "Sort out the interactions in this note", ja: "このメモのやり取りを整理する", zh: "整理这篇笔记里的往来" }[language] : { en: "List my to-do candidates", ja: "自分のタスク候補を一覧にする", zh: "列出我的待办候选" }[language];
}

/* ── compare and group ───────────────────────────────────────────────── */

export function feeWords(fee: { kind: string; amountYen?: number }, language: Language): string {
  if (fee.kind === "amount" && fee.amountYen !== undefined) return { en: `JPY ${fee.amountYen.toLocaleString("en-US")}`, ja: `${fee.amountYen.toLocaleString("ja-JP")}円`, zh: `${fee.amountYen} 日元` }[language];
  if (fee.kind === "free") return { en: "free", ja: "無料", zh: "免费" }[language];
  if (fee.kind === "pay_at_door") return { en: "paid at the door (amount not stated)", ja: "当日払い（金額未記載）", zh: "现场付费（未写金额）" }[language];
  if (fee.kind === "external_link") return { en: "see the organizer's page (amount not stated)", ja: "主催者ページ参照（金額未記載）", zh: "见主办方链接（未写金额）" }[language];
  return { en: "no price listed (not free)", ja: "料金未記載（無料ではありません）", zh: "未标价（不等于免费）" }[language];
}

/**
 * AG13 rerun of AG10 (AE-FN-009): the review did not answer (timeout), so code cannot say the note has no interaction;
 * it says the check did not finish and nothing was changed.
 */
export function reviewUnavailableLine(language: Language): string {
  return { en: "This time the check of this note's interactions did not finish (the review was unavailable), so I can't say whether there is one to record, and nothing was changed. Please try again.", ja: "今回はメモのやり取りの確認が終わりませんでした（確認が一時的に使えませんでした）。記録すべきやり取りがあるかどうか言えないため、何も変更していません。もう一度お試しください。", zh: "这次没能核对完这篇笔记里的往来（复核暂时不可用），所以说不准有没有该记的，也没有改动。可以再试一次。" }[language];
}
