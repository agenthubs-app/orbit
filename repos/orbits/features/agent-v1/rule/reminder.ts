/**
 * Reading "remind me on my phone when this task has something new" (agent-design AG16; 设计稿 §5.3; PLANNER 易错边界 1).
 *
 * Turning a task's reminder on or off from the conversation is a change of the task: it makes a confirmation card
 * (graph/nodes/rule.ts) and nothing changes before the click. Code reads the words here; the model is asked only which
 * of the account's own tasks is meant when its title is not in the message — and its answer is a number checked against
 * the list it was shown.
 */
import { parseModelJson } from "../understand/validate";

/** Words that call a reminder off. Checked first: "不用提醒" holds "提醒". */
const REMINDER_OFF = /(不用提醒|不要提醒|别提醒|不必提醒|无需提醒|关掉提醒|关闭提醒|取消提醒|停止提醒|不用通知|不要通知|别通知|关掉通知|关闭通知|取消通知|(?:turn|switch) off (?:the |my |its |phone |push |browser |mobile )*(?:notifications?|reminders?|alerts?|pings?)|(?:turn|switch) (?:the |my |its |phone |push |browser |mobile )*(?:notifications?|reminders?|alerts?) off|stop (?:notifying|reminding|pinging|alerting)|no (?:more )?(?:notifications?|reminders?|pings?)\b|don'?t (?:notify|remind|ping|alert)|通知(?:は|を)?(?:不要|いら|オフ|やめ|止め|切)|(?:お)?知らせ(?:は|を)?(?:不要|いら|なくて|やめ))/giu;

/** Words that ask for a reminder on a device. */
const REMINDER_ON = /(提醒我|提醒一下|手机上?提醒|手机通知|通知我|发(?:个|条)?通知|弹(?:一条|个|条)?(?:提醒|通知)|在(?:手机|浏览器|电脑)上?(?:提醒|通知)|(?:notify|remind|ping|alert) me|(?:phone|push|browser|mobile|desktop) (?:notifications?|reminders?|alerts?)|(?:turn|switch) on (?:the |my |its |phone |push |browser |mobile )*(?:notifications?|reminders?|alerts?)|(?:notifications?|reminders?|alerts?) on\b|(?:スマホ|携帯|ブラウザ|パソコン)(?:に|で|へ)(?:も)?(?:通知|知らせ|お知らせ)|通知して|知らせて|お知らせして|通知を(?:オン|送って|ください)|通知がほしい|通知してほしい)/giu;

/**
 * Whether the words ask for a reminder (true), call it off (false), or say nothing about one (null). Used where a
 * task that already exists is being changed; a new task's notification is read by parse.ts `pushSaidIn` as before.
 */
export function reminderSaidIn(words: string): boolean | null {
  const text = words.toLowerCase();
  if (text.search(REMINDER_OFF) >= 0) return false;
  return text.search(REMINDER_ON) >= 0 ? true : null;
}

/**
 * The words without their reminder phrases. "turn off notifications for …" and "关掉这条任务的提醒" call a reminder off —
 * they do not pause the task; the pause / resume / delete verbs are read from what is left.
 */
export function withoutReminderWords(words: string): string {
  return words.replace(REMINDER_OFF, " ").replace(REMINDER_ON, " ");
}

/** Where the reminder phrase sits in a message (the card took these words). */
export function reminderSpanIn(message: string): [number, number] | null {
  for (const pattern of [REMINDER_OFF, REMINDER_ON]) {
    const found = new RegExp(pattern.source, pattern.flags.replace("g", "")).exec(message);
    if (found) return [found.index, found.index + found[0].length];
  }
  return null;
}

const PHONE = /(手机|手機|移动端|スマホ|携帯|モバイル|\bphone\b|\bmobile\b|\biphone\b|\bandroid\b|\bcell\b)/iu;
const NOT_ONLY_PHONE = /(浏览器|電腦|电脑|桌面|网页|ブラウザ|パソコン|デスクトップ|\bPC\b|\bbrowser\b|\bdesktop\b|\bcomputer\b|\blaptop\b|\bweb\b)/iu;

/** AG21c (R56): the words ask for a reminder on the phone and name no other device. */
export function asksPhoneOnly(words: string): boolean {
  return PHONE.test(words) && !NOT_ONLY_PHONE.test(words);
}

/** AG21c (R56, decision D9): one plain sentence — the one reminder switch also shows it in the browser. */
export function alsoInBrowserLine(locale: string): string {
  const language = locale.startsWith("ja") ? "ja" : locale.startsWith("en") ? "en" : "zh";
  return ({ en: "This reminder will also show in your browser.", ja: "このお知らせはブラウザにも表示されます。", zh: "这个提醒也会在浏览器里显示。" } as const)[language];
}

export const RULE_CHOICE_PROMPT_VERSION = "rule-choice@ag16.1";

export interface RuleChoiceOption {
  /** 1-based, as shown to the model. */
  number: number;
  title: string;
  picksFrom: string;
  pickedBy: string;
  checks: string;
}

/**
 * Which of the user's own scheduled tasks a message means, when the message does not hold a task's title (the user
 * describes it: "the Friday one that goes off my interests note, not the design one"). The model sees the tasks'
 * titles and their card rows — nothing of any result — and answers with a number or null.
 */
export function ruleChoiceSystemPrompt(): string {
  return [
    "You are a step of Orbit, a personal relationship assistant. The user wants to change one of their own scheduled tasks and describes it instead of giving its exact title. From the list, say which task they mean.",
    "",
    'Output exactly one JSON object: {"task": the number of the task meant, or null}',
    "",
    "Rules:",
    "1. Answer with a number from the list only when the message fits exactly one task. Titles may be in another language than the message; compare meanings.",
    '2. What the user rules out counts: "not the design one" excludes the task about design.',
    "3. When no task fits, or more than one fits equally, answer null. Never guess.",
    "4. Output no other field.",
  ].join("\n");
}

export function ruleChoiceUserText(input: { message: string; options: readonly RuleChoiceOption[] }): string {
  return [
    "The user's scheduled tasks:",
    ...input.options.map((option) => `${option.number}. title: "${option.title}" | picks from: ${option.picksFrom} | picked by: ${option.pickedBy} | checks: ${option.checks}`),
    "",
    "The user's message:",
    input.message,
  ].join("\n");
}

/** The model's choice, checked: a whole number of the list, or null. Anything else is "could not be told". */
export function checkRuleChoice(text: string, count: number): number | null {
  const parsed = parseModelJson(text);
  const value = parsed.ok ? (parsed.value as { task?: unknown }).task : null;
  return typeof value === "number" && Number.isInteger(value) && value >= 1 && value <= count ? value : null;
}
