/**
 * agent-design AG14 (设计稿 §6): what the user's own words say about saved memory, read by code (zh, ja, en).
 *
 * - Which kind of ask a sentence is: remember for later, forget, list what is saved, or an exception for this time.
 *   "这次……" never changes a saved entry; "以后……" / "记住……" may (after a card).
 * - What a sentence to remember holds: the kind of entry (a standing rule or something to weigh), the tasks it applies
 *   to and the values code can rank or filter with (a time preference, the reply language). The words and the values
 *   are frozen together on the card; no model writes any of them.
 */
import type { AgentMemory, AgentMemoryCategory, AgentMemoryStructured, AgentMemoryTask } from "../../../agent/memory/contract";
import { clockBoundIn, weekdaysNamedIn } from "../../functions/basis";
import { polarityOf } from "../../functions/negation";

const DAY_KEYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;

export type MemoryLanguage = "zh" | "ja" | "en";

/* ── which ask ─────────────────────────────────────────────────────── */

/** An explicit ask to keep something ("记住", "覚えておいて", "remember", "keep in mind"). */
const REMEMBER_ASK = /(记住|记着|记牢|帮我记(?:一下|下来)?[，,：:]?(?=.*(?:以后|今后|每次|都))|覚えて(?:おいて|おく|ください)?|記憶して|\bremember\b(?!\s+(?:when|how|what|who|where|if|the time)\b)|\bkeep in mind\b|\bmake a note for (?:the )?future\b)/iu;
/** Words that make it lasting ("以后", "今后", "从现在起", "これから", "from now on"). */
const FROM_NOW_ON = /(以后|今后|往后|从现在起|从现在开始|从今往后|从今天起|这以后|これから|今後|次回から|次から|\bfrom now on\b|\bgoing forward\b|\bin (?:the )?future\b|\bfrom here on\b|\bhenceforth\b)/iu;
/** An instruction about how Orbit should act (a lasting word next to one of these makes an ask to remember). */
const INSTRUCTION = /(优先|尽量|只(?:要|看|推荐|选)|不要|别再?|不用|都(?:要|用|按|写)|一律|请?用|改成|改为|换成|按|优先して|優先|だけ|しないで|ないで|にして|に変更|に変えて|で(?:答|返|書)|\bprefer\b|\bonly\b|\bavoid\b|\bdon'?t\b|\bdo not\b|\bnever\b|\balways\b|\buse\b|\breply\b|\banswer\b|\bswitch to\b|\bchange (?:it |that )?to\b|\binstead\b)/iu;
/** Only for this once ("这次", "今回は", "this time", "just this once"). */
const THIS_TIME = /(这次|这一次|这回|本次|今回|今度だけ|今日だけ|\bthis time\b|\bjust (?:this )?once\b|\bfor now\b|\bfor this one\b|\bjust for today\b)/iu;
/** An ask to forget ("忘掉", "别再记", "忘れて", "forget my …"). A plain "我忘了…" is not one. */
const FORGET_ASK = /(忘掉|忘记(?:我|这|那|掉|关于)|把.{0,24}忘了|忘了吧|别再记|不要再记|不用再记|别记(?:着|住)?了|(?:删掉|删除|去掉|清掉).{0,16}(?:记忆|偏好|规矩|习惯)|忘れて|覚えなくて|(?:記憶|メモリ|好み|設定).{0,12}(?:削除|消して|消去)|\bforget (?:my|that|the|about|what|this|it)\b|\bstop remembering\b|\bdon'?t remember\b|\b(?:delete|remove|drop|clear) (?:that|my|the|this) (?:saved )?(?:memory|preference|rule|habit)\b)/iu;
/** An ask for what is saved ("你记着我哪些偏好", "what do you remember about me", "何を覚えていますか"). */
const LIST_ASK = /(你(?:现在|目前|都)?(?:还)?(?:记着|记住了?|记得|记了|存了|存着|保存了)(?:我(?:的)?)?(?:哪些|什么|多少|些什么)|(?:你|我)(?:现在)?(?:存|保存|记)(?:过|了|着)(?:哪些|什么)|(?:有|存了)哪些(?:记忆|偏好|规矩)|我的(?:记忆|偏好和规矩)(?:有哪些|是什么)|\bwhat (?:do|did|have) you (?:remember|know|remembered|saved|stored)\b|\bwhat(?:'s| is| are) (?:saved|stored|in (?:your|my) memory)\b|\bwhich (?:preferences|rules|memories) (?:do|have) you\b|\b(?:list|show)(?: me)? (?:my|the|your) (?:saved )?(?:memories|preferences|rules)\b|(?:何|なに|どんなこと|どの好み).{0,8}覚えて|覚えている(?:こと|内容|好み)|保存(?:している|した|されている)(?:好み|ルール|メモリ|記憶))/iu;
/** A question about why the list was ordered as it was ("为什么把第一场排在最前面", "why is that one first"). */
const WHY_ORDER = /((?:为什么|为啥|怎么|凭什么).{0,24}(?:排|放|第一|最前|靠前|优先推荐|先推荐)|(?:排|放)(?:在)?(?:第一|最前|前面).{0,12}(?:为什么|原因|理由)|\bwhy\b.{0,60}\b(?:first|top|ranked|at the top|before|ahead|put|prioriti[sz]ed?|recommend(?:ed)? .* first)\b|(?:なぜ|どうして|なんで).{0,30}(?:一番|最初|先頭|上|優先)|(?:一番|最初|先頭).{0,20}(?:理由|なぜ|どうして))/iu;

export type MemoryAsk = "remember" | "forget" | "list" | "why_order" | "this_time";

/**
 * What kind of ask about memory the words are; null when they are none. `tagged`: the first layer named a memory
 * change for the part (a lasting instruction then counts without the word "记住").
 */
export function memoryAskOf(words: string, tagged = false): MemoryAsk | null {
  if (LIST_ASK.test(words)) return "list";
  if (FORGET_ASK.test(words)) return "forget";
  const lasting = REMEMBER_ASK.test(words) || FROM_NOW_ON.test(words);
  // "这次……" with no lasting word next to it stays an exception, whatever it was tagged.
  if (THIS_TIME.test(words) && !lasting) return "this_time";
  if (REMEMBER_ASK.test(words)) return "remember";
  if (FROM_NOW_ON.test(words) && (INSTRUCTION.test(words) || tagged)) return "remember";
  return null;
}

export function asksWhyOrder(words: string): boolean {
  return WHY_ORDER.test(words);
}

export function saysThisTime(words: string): boolean {
  return THIS_TIME.test(words) && !REMEMBER_ASK.test(words) && !FROM_NOW_ON.test(words);
}

/* ── the words to keep ─────────────────────────────────────────────── */

const LEAD_IN = /^(?:请|麻烦)?(?:帮我)?(?:记住|记着|记牢|记一下|记下来)(?:这(?:一)?(?:条|点|个))?[，,：:\s]*|^(?:please\s+)?(?:remember|keep in mind|note)(?:\s+(?:that|this))?[,:\s]*|^(?:覚えておいて(?:ください)?|覚えて(?:ください)?|記憶して(?:ください)?)[。、,\s]*/iu;
const LASTING_LEAD = /^(?:以后|今后|往后|从现在起|从现在开始|从今往后|从今天起|这以后|これからは?|今後は?|次回からは?|次からは?|from now on|going forward|in (?:the )?future|from here on)[，,、\s]*/iu;
const TRAILING = /[。.!！\s]+$/u;
const POLITE_TAIL = /(?:してほしい(?:です)?|してください|して下さい|お願いします|でお願いします|please|, please|吧|哦|啊|哈)$/iu;

/** The sentence to keep, without the words that only ask to keep it ("记住，", "覚えておいて。", "Remember that"). */
export function rememberedWordsOf(words: string): string {
  let rest = words.trim();
  for (let round = 0; round < 3; round += 1) rest = rest.replace(LEAD_IN, "").replace(LASTING_LEAD, "").trim();
  return rest.replace(TRAILING, "").replace(POLITE_TAIL, "").replace(TRAILING, "").trim();
}

/* ── a change of an entry: the new value and the old one ───────────── */

/**
 * "X instead of Y", "X 而不是 Y", "把 Y 改成 X", "Y ではなく X": the words of the new value and of the one it replaces.
 * With no such turn of phrase the whole is the new value.
 */
export function replacementOf(words: string): { next: string; previous: string | null } {
  const patterns: [RegExp, "next_first" | "previous_first"][] = [
    [/^([\s\S]*?)(?:,?\s*(?:instead of|rather than)\s+)([\s\S]+)$/iu, "next_first"],
    [/^([\s\S]*?)(?:[，,]?\s*(?:而不是|不再是))([\s\S]+)$/u, "next_first"],
    [/^(?:[\s\S]*?)(?:把|从)([\s\S]+?)(?:改成|改为|换成|变成)([\s\S]+)$/u, "previous_first"],
    [/^([\s\S]+?)(?:ではなくて|ではなく|じゃなくて)([\s\S]+?)(?:してください|して|ください)?$/u, "previous_first"],
  ];
  for (const [pattern, order] of patterns) {
    const match = pattern.exec(words.trim());
    if (!match) continue;
    const [first, second] = [match[1].trim(), match[2].trim().replace(TRAILING, "")];
    if (!first || !second) continue;
    return order === "next_first" ? { next: first, previous: second } : { next: second, previous: first };
  }
  // AG14 UI run (local check of board 2): "推荐活动时改成优先周末下午" — where it is used, then the change verb, then the
  // new value. The verb is not part of the entry: the new value is "推荐活动时优先周末下午".
  const inPlace = /^([\s\S]*?(?:时|的时候))\s*(?:改成|改为|换成)\s*([\s\S]+)$/u.exec(words.trim());
  if (inPlace && inPlace[2].trim()) return { next: `${inPlace[1].trim()}${inPlace[2].trim()}`, previous: null };
  return { next: words.trim(), previous: null };
}

/** Words that change an entry already saved ("改成", "换成", "instead", "に変更"). */
export function saysChange(words: string): boolean {
  return /(改成|改为|换成|变成|而不是|不要再|instead|rather than|\bswitch\b|\bchange\b|に変更|に変えて|ではなく|じゃなくて)/iu.test(words);
}

/* ── what the words hold ───────────────────────────────────────────── */

const WEEKEND = /(周末|週末|礼拜六日|土日|weekends?)/iu;
const WEEKDAY = /(工作日|平日|weekdays?)/iu;
const MORNING = /(上午|早上|早晨|午前|朝の|朝は|朝に|毎朝|mornings?)/iu;
const AFTERNOON = /(下午|午後|afternoons?)/iu;
const EVENING = /(晚上|夜里|夜间|夜晚|夕方|夜|evenings?|nights?)/iu;
const PREFER = /(优先|尽量|偏好|更喜欢|喜欢|最好|優先|できれば|なるべく|好き|\bprefer(?:ably)?\b|\bideally\b|\blike\b|\bfavou?r\b)/iu;

const TASK_WORDS: [AgentMemoryTask, RegExp][] = [
  ["event.recommend", /(活动|活動|イベント|讲座|研讨会|展览|\bevents?\b|\bmeetups?\b)/iu],
  ["contact.recommend", /(联系人|人脉|該跟进谁|跟进谁|連絡先|\bcontacts?\b|\bpeople to (?:meet|follow)\b)/iu],
  ["memo.summarize", /(笔记|メモ|\bnotes?\b|\bmemos?\b)/iu],
  ["todo.plan", /(待办|任务|タスク|ToDo|\bto-?dos?\b|\btasks?\b)/iu],
  ["schedule.plan", /(日程|行程|スケジュール|予定を|\bschedule\b|\bcalendar\b)/iu],
];

const LANGUAGE_NAMES: [NonNullable<AgentMemoryStructured["replyLanguage"]>, RegExp][] = [
  ["ja", /(日语|日文|日本語|\bjapanese\b)/iu],
  ["en", /(英语|英文|英語|\benglish\b)/iu],
  ["zh", /(中文|汉语|普通话|中国語|\bchinese\b|\bmandarin\b)/iu],
];
const REPLY_WORDS = /(回答|回复|答复|回我|跟我说|和我说|对话|交流|说话|返信|返事|答えて|答え|話して|書いて|\breply\b|\banswer\b|\brespond\b|\bwrite\b|\btalk\b|\bspeak\b)/iu;

/** The reply language an entry asks for ("回答用日语", "日本語で答えて", "reply in English"); null when it asks for none. */
export function replyLanguageIn(words: string): NonNullable<AgentMemoryStructured["replyLanguage"]> | null {
  if (!REPLY_WORDS.test(words)) return null;
  return LANGUAGE_NAMES.find(([, pattern]) => pattern.test(words))?.[0] ?? null;
}

/** The time preference an entry's words hold, as stored values; null when they name none. */
export function timeValuesIn(words: string): Pick<AgentMemoryStructured, "preferredDays" | "dayPart" | "strength"> | null {
  // AG21c (R33): days named one by one ("周日", "日曜", "Sundays") are kept as those days.
  const named = weekdaysNamedIn(words).map((day) => DAY_KEYS[day]);
  const days = WEEKEND.test(words) ? (["Sat", "Sun"] as const) : WEEKDAY.test(words) ? (["Mon", "Tue", "Wed", "Thu", "Fri"] as const) : named.length ? named : null;
  // AG21b (R33): with a clock boundary ("早上八点以前") the part-of-day word only says which eight o'clock: no part is stored
  // (the boundary is read from the entry's words when it is used), only how strong the entry is.
  const clock = clockBoundIn(words);
  const part = clock ? null : MORNING.test(words) ? "morning" : AFTERNOON.test(words) ? "afternoon" : EVENING.test(words) ? "evening" : null;
  if (!days && !part && !clock) return null;
  // AG21c (R33): the same negation reader as the ranking (functions/negation.ts); words whose direction cannot be read
  // store no strength (they are never a hard condition).
  const polarity = polarityOf(words);
  const strength = polarity === "exclude" ? "avoid" : polarity === "only" ? "only" : polarity === "prefer" ? "prefer" : null;
  return { ...(days ? { preferredDays: [...days] } : {}), ...(part ? { dayPart: part } : {}), ...(strength ? { strength } : {}) };
}

export interface MemoryReading {
  category: AgentMemoryCategory;
  appliesTo: AgentMemoryTask[];
  structured: AgentMemoryStructured | null;
  /** The entry is nothing but a time preference for a task: its words can be written from the values. */
  composable: boolean;
}

const RULE_WORDS = /(不要|别|禁止|必须|一律|都要|都用|每次都|总是|永远|しないで|ないで|必ず|いつも|常に|\bnever\b|\balways\b|\bmust\b|\bdon'?t\b|\bdo not\b|\bevery time\b)/iu;
const GOAL_WORDS = /(目标|打算|计划在|想在.{0,12}(?:前|之前)|争取|目標|までに|\bgoal\b|\baim\b|\bby the end of\b|\bplan to\b)/iu;
const IDENTITY_WORDS = /^(?:我是|我在|我做|我经营|我负责|我常驻|我住|私は|僕は|\bI am\b|\bI'm\b|\bI work\b|\bI run\b|\bI live\b)/iu;

/** What remains of the words once the time words, the task words and the instruction words are taken out. */
function beyondTime(words: string): string {
  return words
    .replace(/(以后|今后|往后|从现在起|これからは?|今後は?|from now on|going forward)/giu, " ")
    .replace(/(给我|帮我|为我|向我|对我|请|麻烦|我|\bme\b|\bmy\b|\byou\b|\bwhen\b|\bfor\b|\bto\b|\bthe\b|\ba\b|\bof\b|\bon\b|\bin\b|\bat\b|\bones?\b|\bthat are\b)/giu, " ")
    .replace(/(推荐|介绍|挑|选|安排|おすすめ(?:する)?|選ぶ|\brecommend(?:ing|ed|s)?\b|\bsuggest(?:ing|ed|s)?\b|\bpick(?:ing)?\b)/giu, " ")
    .replace(/(活动|活動|イベント|\bevents?\b|时|的时候|時|とき|ときは|の)/giu, " ")
    .replace(/(周末|週末|工作日|平日|上午|早上|下午|晚上|夜里|午前中|午前|午後|夕方|夜|朝|weekends?|weekdays?|mornings?|afternoons?|evenings?|nights?)/giu, " ")
    .replace(/(优先|尽量|偏好|最好|只要|只看|只|不要|别|優先|できれば|なるべく|だけ|しないで|して|ほしい|\bprefer(?:ably)?\b|\bonly\b|\bavoid\b|\bdon'?t\b|\bnot\b|\bno\b|\bnever\b|\balways\b)/giu, " ")
    .replace(/[的地得を がはにでへ，,。.、！!：:\s]+/gu, "");
}

/** The kind of entry, its tasks and its values, read from the words to keep. */
export function readMemoryWords(words: string): MemoryReading {
  const language = replyLanguageIn(words);
  if (language) return { appliesTo: ["all"], category: "constraint", composable: false, structured: { replyLanguage: language } };
  const time = timeValuesIn(words);
  const tasks = TASK_WORDS.filter(([, pattern]) => pattern.test(words)).map(([task]) => task);
  const category: AgentMemoryCategory = time?.strength === "avoid" || time?.strength === "only" || RULE_WORDS.test(words)
    ? "constraint"
    : PREFER.test(words) || time
      ? "preference"
      : GOAL_WORDS.test(words) ? "goal" : IDENTITY_WORDS.test(words) ? "identity" : "preference";
  // A time of day for picking is about events when no task is named.
  const appliesTo: AgentMemoryTask[] = tasks.length ? tasks : time ? ["event.recommend"] : category === "constraint" ? ["all"] : [];
  return { appliesTo, category, composable: Boolean(time) && appliesTo.length === 1 && appliesTo[0] === "event.recommend" && beyondTime(words) === "", structured: time ? { ...time } : null };
}

/**
 * AG14 UI (approved draft board 1, D2): the last day the words give an entry — 「这周／这个月／今年先……」, 「到12月31日」,
 * 「今月は」, "this month" … — as YYYY-MM-DD from `today` (YYYY-MM-DD). Null when the words name no limit; the card then
 * has no 到期 row and the entry has no expiry.
 */
export function expiryIn(words: string, today: string): string | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/u.exec(today);
  if (!match) return null;
  const [year, month, day] = [Number(match[1]), Number(match[2]), Number(match[3])];
  const iso = (date: Date) => date.toISOString().slice(0, 10);
  const until = /(?:到|至|截至|截止到?)?\s*(\d{1,2})\s*月\s*(\d{1,2})\s*[日号]?\s*(?:之前|以前|前|为止|まで)/u.exec(words);
  if (until) {
    const [m, d] = [Number(until[1]), Number(until[2])];
    if (m >= 1 && m <= 12 && d >= 1 && d <= 31) {
      const passed = m < month || (m === month && d < day);
      return iso(new Date(Date.UTC(passed ? year + 1 : year, m - 1, d)));
    }
  }
  if (/(这周|这星期|这个星期|本周|今週|\bthis week\b)/iu.test(words)) {
    const weekday = new Date(Date.UTC(year, month - 1, day)).getUTCDay();
    return iso(new Date(Date.UTC(year, month - 1, day + ((7 - weekday) % 7))));
  }
  if (/(这个月|这月|本月|今月|\bthis month\b)/iu.test(words)) return iso(new Date(Date.UTC(year, month, 0)));
  if (/(今年|\bthis year\b)/iu.test(words)) return `${year}-12-31`;
  return null;
}

/** The entry's words without the limit `expiryIn` read ("这个月整理笔记时……" → "整理笔记时……"): the limit is the 到期 row. */
export function withoutExpiryWords(words: string): string {
  const kept = words
    .replace(/(?:到|至|截至|截止到?)?\s*\d{1,2}\s*月\s*\d{1,2}\s*[日号]?\s*(?:之前|以前|前|为止|まで)[，,、]?\s*/gu, "")
    .replace(/(?:这周|这星期|这个星期|本周|这个月|这月|本月|今年|今週|今月)(?:先|内|里|之内|は)?[，,、]?\s*/gu, "")
    .replace(/\b(?:this (?:week|month|year))\b[,，]?\s*/giu, "")
    .trim();
  return kept || words;
}

/* ── words code writes ─────────────────────────────────────────────── */

const DAY_WORDS: Record<MemoryLanguage, { weekend: string; weekday: string }> = {
  en: { weekday: "weekday", weekend: "weekend" },
  ja: { weekday: "平日", weekend: "週末" },
  zh: { weekday: "工作日", weekend: "周末" },
};
const PART_WORDS: Record<MemoryLanguage, Record<NonNullable<AgentMemoryStructured["dayPart"]>, string>> = {
  en: { afternoon: "afternoons", evening: "evenings", morning: "mornings" },
  ja: { afternoon: "午後", evening: "夜", morning: "午前" },
  zh: { afternoon: "下午", evening: "晚上", morning: "上午" },
};

function daysKind(structured: AgentMemoryStructured): "weekend" | "weekday" | null {
  const days = structured.preferredDays ?? [];
  if (days.length === 2 && days.includes("Sat") && days.includes("Sun")) return "weekend";
  if (days.length === 5 && !days.includes("Sat") && !days.includes("Sun")) return "weekday";
  return null;
}

/** "周末上午", "weekend mornings", "週末の午前": the time a stored preference names. */
export function timeWordsOf(structured: AgentMemoryStructured, language: MemoryLanguage): string {
  const kind = daysKind(structured);
  const days = kind ? DAY_WORDS[language][kind] : "";
  const part = structured.dayPart ? PART_WORDS[language][structured.dayPart] : "";
  if (language === "en") return [days, part || (days ? "days" : "")].filter(Boolean).join(" ").replace(/^(weekend|weekday) days$/u, "$1s");
  if (language === "ja") return days && part ? `${days}の${part}` : `${days}${part}`;
  return `${days}${part}`;
}

/** The sentence of an entry that is only a time preference for recommending events, written from its values. */
export function composeEventTimeContent(structured: AgentMemoryStructured, language: MemoryLanguage): string {
  const time = timeWordsOf(structured, language);
  const strength = structured.strength ?? "prefer";
  if (language === "en") return strength === "avoid" ? `When recommending events, leave out ${time}` : strength === "only" ? `When recommending events, only ${time}` : `When recommending events, prefer ${time}`;
  if (language === "ja") return strength === "avoid" ? `イベントをおすすめするときは${time}を除く` : strength === "only" ? `イベントをおすすめするときは${time}だけ` : `イベントをおすすめするときは${time}を優先`;
  return strength === "avoid" ? `推荐活动时不要${time}的` : strength === "only" ? `推荐活动时只要${time}的` : `推荐活动时优先${time}`;
}

const TASK_LABELS: Record<AgentMemoryTask, Record<MemoryLanguage, string>> = {
  "all": { en: "every answer", ja: "すべての回答", zh: "所有回答" },
  "contact.recommend": { en: "recommending contacts", ja: "連絡先をおすすめするとき", zh: "推荐联系人时" },
  "event.recommend": { en: "recommending events", ja: "イベントをおすすめするとき", zh: "推荐活动时" },
  "memo.summarize": { en: "tidying up notes", ja: "メモを整理するとき", zh: "整理笔记时" },
  "schedule.plan": { en: "planning the schedule", ja: "予定を組むとき", zh: "安排日程时" },
  "todo.plan": { en: "planning to-dos", ja: "ToDo を組むとき", zh: "安排待办时" },
};

/** "推荐活动时", "所有回答": where an entry is used, in plain words; an entry not classified yet says so. */
export function appliesLabel(appliesTo: readonly AgentMemoryTask[], language: MemoryLanguage): string {
  if (!appliesTo.length) return { en: "not sorted yet", ja: "未分類", zh: "还没归类" }[language];
  return appliesTo.map((task) => TASK_LABELS[task][language]).join(language === "en" ? ", " : "、");
}

/** 「一直遵守的」 for a standing rule, 「酌情参考的」 for the others (设计稿 §10). */
export function kindLabel(category: AgentMemoryCategory, language: MemoryLanguage): string {
  return category === "constraint" ? { en: "always followed", ja: "いつも守ること", zh: "一直遵守的" }[language] : { en: "weighed when it fits", ja: "場合に応じて参考にすること", zh: "酌情参考的" }[language];
}

/* ── which saved entry the words point at ──────────────────────────── */

const KIND_WORDS: [AgentMemoryCategory, RegExp][] = [
  ["preference", /(偏好|喜好|好み|\bpreferences?\b)/iu],
  ["constraint", /(规矩|规则|限制|约束|ルール|決まり|\brules?\b|\bconstraints?\b)/iu],
  ["goal", /(目标|目標|\bgoals?\b)/iu],
  ["identity", /(身份|自我介绍|プロフィール|\bidentity\b)/iu],
];
const TIME_TOPIC = /(时段|时间|時間帯|時間|\btimes?\b|\btime of day\b|\btiming\b)/iu;
const LANGUAGE_TOPIC = /(语言|言語|\blanguage\b)/iu;
const EVERYTHING = /(所有|全部|一切|すべて|全部の|\ball\b|\beverything\b)/iu;

/**
 * The saved entries the words point at ("我的活动时段偏好", "回答用日语那条", "the evening rule"): narrowed by the task
 * named, the kind named (偏好 / 规矩), a time or language topic, then by words shared with the entry itself.
 */
export function entriesPointedAt<T extends Pick<AgentMemory, "memoryId" | "category" | "content" | "appliesTo" | "structured">>(words: string, entries: readonly T[]): T[] {
  if (!entries.length) return [];
  let kept = [...entries];
  const narrow = (test: (entry: T) => boolean) => {
    const next = kept.filter(test);
    if (next.length) kept = next;
    return next.length > 0;
  };
  const tasks = TASK_WORDS.filter(([, pattern]) => pattern.test(words)).map(([task]) => task);
  const kinds = KIND_WORDS.filter(([, pattern]) => pattern.test(words)).map(([kind]) => kind);
  const hadTask = tasks.length ? narrow((entry) => entry.appliesTo.some((task) => tasks.includes(task)) || tasks.some((task) => TASK_WORDS.find(([name]) => name === task)![1].test(entry.content))) : false;
  const hadKind = kinds.length ? narrow((entry) => kinds.includes(entry.category)) : false;
  const hadTime = TIME_TOPIC.test(words) || timeValuesIn(words) ? narrow((entry) => Boolean(entry.structured?.dayPart || entry.structured?.preferredDays?.length || timeValuesIn(entry.content))) : false;
  const hadLanguage = LANGUAGE_TOPIC.test(words) || replyLanguageIn(words) ? narrow((entry) => Boolean(entry.structured?.replyLanguage || replyLanguageIn(entry.content))) : false;
  const time = timeValuesIn(words);
  if (time) narrow((entry) => { const own = entry.structured?.dayPart || entry.structured?.preferredDays ? entry.structured : timeValuesIn(entry.content); return Boolean(own) && (!time.dayPart || own!.dayPart === time.dayPart) && (!time.preferredDays || JSON.stringify(own!.preferredDays) === JSON.stringify(time.preferredDays)); });
  // The entry's own words quoted back ("忘掉「回答用日语」").
  const quoted = entries.filter((entry) => entry.content && words.includes(entry.content));
  if (quoted.length) return quoted;
  if (hadTask || hadKind || hadTime || hadLanguage) return kept;
  return EVERYTHING.test(words) ? [...entries] : [];
}
