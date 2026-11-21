/**
 * AG21c (R47): a follow-up that only repeats the last list ("再给我看一次", "もう一度見せて", "show me that again") or only
 * adjusts it ("这回把周日的也加上", "今回は日曜も含めて", "this time include Sundays too") carries that list request: code re-runs
 * it with the adjustment, read fresh. Code's rule from the words; the first layer's handles are not needed.
 */
import type { LastListRequest } from "../context/session-state";

type Language = "zh" | "ja" | "en";

const REPEAT = /(再(?:给我|帮我|让我)?(?:看|列)(?:一次|一遍|一下)?|重新(?:列|看)(?:一次|一遍|一下)?|再来一次|再来一遍|再一次|再列一次|还是那个列表|もう一度|もう一回|もう1回|再度|\bagain\b|\bonce more\b|\bone more time\b)/iu;
const ADJUST = /(也加上|也算上|也算进来|也算进去|也包括进来|也包括|也放进来|也列进来|也列上|也加进来|这次不要|这回不要|这次去掉|这回去掉|这次只要|这回只要|改成只看|も含めて|も入れて|も加えて|は除いて|を外して|だけにして|\binclude\b.{0,40}\b(?:too|as well|also)\b|\balso include\b|\bthis time\b|\bleave out\b|\bwithout the\b|\bexclude\b)/iu;
/** What a part that only repeats or adjusts may also hold: time words, "the list", fillers. */
const ALSO = /(这回|这次|本次|今回は?|那个|那份|刚才的?|上面的?|列表|清单|结果|一下|给我|帮我|把|的|吧|呢|啊|吗|一次|一遍|看|列|再|也|周[一二三四五六日天末]|星期[一二三四五六日天]|礼拜[一二三四五六日天]|周末|晚上|上午|下午|早上|[月火水木金土日]曜日?|週末|夜|朝|午前|午後|もの|の|を|も|は|て|見せて|イベント|活动|活動|联系人|連絡先|待办|タスク|ください|リスト|それ|さっきの?|\b(?:the|that|list|it|them|me|show|please|ones?|on|too|as well|also|events?|contacts?|to-?dos?|sundays?|saturdays?|mondays?|tuesdays?|wednesdays?|thursdays?|fridays?|weekends?|evenings?|mornings?|afternoons?|nights?|again|once more|this time|include|leave out|exclude|without)\b|[\s\p{P}\p{S}\d]+)/giu;

/** "repeat" / "adjust" when the words only repeat or adjust the last list; null otherwise. */
export function repeatOrAdjust(words: string): "repeat" | "adjust" | null {
  const adjust = ADJUST.test(words);
  const repeat = REPEAT.test(words);
  if (!adjust && !repeat) return null;
  const left = words.replace(REPEAT, " ").replace(ADJUST, " ").replace(ALSO, " ").trim();
  // Anything of its own left ("再看一次小林的笔记") is a new request, not the list again.
  if ([...left.replace(/\s+/gu, "")].length > 1) return null;
  return adjust ? "adjust" : "repeat";
}

/** The words a repeated request is ranked by: the request as asked, then this turn's adjustment. */
export function repeatedWords(last: LastListRequest, words: string, kind: "repeat" | "adjust"): string {
  return kind === "adjust" ? `${last.words}，${words}` : last.words;
}

/** Nothing stored to repeat: said so, and what to list is asked. */
export function nothingToRepeatLine(language: Language): string {
  return {
    en: "I don't have an earlier list in this conversation to show again. What would you like listed — events, contacts or to-dos?",
    ja: "この会話には、もう一度お見せできる前の一覧がありません。何を一覧にしましょうか（イベント、連絡先、タスクなど）？",
    zh: "这次对话里还没有可以再列一次的列表。想看哪类记录——活动、联系人还是待办？",
  }[language];
}
