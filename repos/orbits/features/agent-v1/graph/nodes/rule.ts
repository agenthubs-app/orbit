/**
 * Scheduled tasks in a conversation (agent-design AG15-1; 设计稿 §5.3, §3.5, §3.11; PLANNER 易错边界 1).
 *
 * A part that asks to set up, change, pause, resume or remove a scheduled task is handled here, inside the functions
 * step, and handed to propose as ready card items (run.presetIntents) — the second layer's model is not asked. One
 * model call points at the user's words (rule/prompt.ts); code reads the schedule, the scope, the count, the last day
 * and the notification out of them (rule/parse.ts) and decides:
 *
 * - a new task with no ranking basis said (no field to order by, no note chosen with @, no topic) is not carded: one
 *   question first, with the orderings that work now; the reply (words, or a click) goes on to the card;
 * - a task named for pause / resume / removal / a change is looked up among the account's own tasks by its title;
 * - nothing is written and nothing can run before the click: the card's item is frozen by domains/rule/ops.ts and
 *   executed by domains/rule/apply.ts.
 */
import type { AgentRuleReference, AgentRuleScope, AgentRuleSpec } from "../../../agent/automations/contract";
import type { CardOperationIntent } from "../../../agent/runtime/card-operations";
import type { SessionOpenItem } from "../../context/session-state";
import { RULE_CANCEL, RULE_CREATE, RULE_PAUSE, RULE_RESUME, RULE_UPDATE, isRuleCapability, scheduleWords, type RuleOperationIntent, type RuleSchedule, type RuleSnapshot } from "../../domains/rule/ops";
import { directionSaidIn, fieldSaidIn, leavesItToAgent, topicWordsOf } from "../../functions/basis";
import * as say from "../../functions/copy";
import { formatWhen } from "../../answer/materials";
import { callMainModel } from "../../models/main";
import { emitTrace } from "../../observability/trace";
import { unsupportedRepeatLine } from "../../propose/events-resolve";
import { handoffWords } from "../../route/handoff-copy";
import { domainSaidIn, pushSaidIn, recurrenceSaidIn, replanSaidIn, RULE_NOUN, scheduleSaidIn, SCOPE_ONLY_WORDS, scopeSaidIn, stateVerbSaidIn, untilSaidIn, type RuleDomain } from "../../rule/parse";
import { checkRuleDraft, ruleRepairText, ruleSystemPrompt, ruleUserText, RULE_PROMPT_VERSION, type RuleModelDraft } from "../../rule/prompt";
import { alsoInBrowserLine, asksPhoneOnly, checkRuleChoice, reminderSaidIn, reminderSpanIn, ruleChoiceSystemPrompt, ruleChoiceUserText, RULE_CHOICE_PROMPT_VERSION, withoutReminderWords } from "../../rule/reminder";
import type { RuleAskState } from "../../rule/state";
import { localDay } from "../../views/recent-interaction";
import type { NodeScope } from "../deps";
import type { AgentGraphState, GraphPart, OptionSetState } from "../state";
import { setIdOf } from "./clarify";
import { countSaidIn, INDUSTRY_WORDS, PLACE_WORDS } from "./functions";

type Language = "zh" | "en" | "ja";

/** `alternative`: the "定期留意" Orbit offered for a request it cannot keep doing, now accepted (its words are the request's). */
export type RuleTask = { kind: "rule"; reply?: SessionOpenItem; alternative?: SessionOpenItem };

/** The scheduled-task work this part needs, or null. */
export function ruleTaskOf(scope: NodeScope, part: GraphPart, openItem: SessionOpenItem | undefined): RuleTask | null {
  if (part.route !== "propose_write" || part.reason !== "proposing" || part.write) return null;
  // Release-2 gate 2 (AE-UND-011/012): accepting the "定期留意" Orbit offered earlier ("好，那就按你说的定期留意吧") asks for a
  // scheduled task made of the words it was offered for — the card a direct request makes, or AG15's own question for what
  // is missing. Accepting any other alternative keeps its own sentence (deliver, AG03).
  if (part.continues?.kind === "alternative") {
    const offered = scope.run.context?.openItems.find((open) => open.ref === part.continues!.ref);
    return (part.plan?.acceptedLeadsTo ?? offered?.leadsTo) === RULE_CREATE && offered?.quote ? { alternative: offered, kind: "rule" } : null;
  }
  // A repeating calendar entry stays with the schedule writes (AG13), whatever else the first layer named.
  if (!openItem?.rule && part.capabilities.some((capability) => capability.startsWith("schedule."))) return null;
  // A reply to "按什么来挑" about a task (AG15-1): the task asked about goes on with this answer.
  if (openItem?.rule) return { kind: "rule", reply: openItem };
  return part.capabilities.some(isRuleCapability) ? { kind: "rule" } : null;
}

const DEFAULT_COUNT = 3;
const MAX_COUNT = 20;

const WORDS = {
  alreadyState: (language: Language, title: string, paused: boolean) => ({
    en: `The scheduled task "${title}" is already ${paused ? "paused" : "running"}, so nothing was changed.`,
    ja: `定期タスク「${title}」はすでに${paused ? "停止中" : "実行中"}のため、何も変更していません。`,
    zh: `定时任务「${title}」已经是${paused ? "暂停" : "运行"}状态，所以这次没有改。`,
  })[language],
  askBasis: (language: Language, quote: string, labels: readonly string[]) => ({
    en: `Before I set this up — "${quote}" — what should it pick by each time? It runs with nobody there to ask, so the standard has to be on the card; I won't choose one for you. Ways that work now: ${labels.join(" / ")}. You can also tell me your own standard.`,
    ja: `設定する前に確認です。「${quote}」は、毎回何を基準に選びますか？誰もいないときに自動で実行されるので、基準はカードに書いておく必要があり、こちらで決めることはしません。今使える並べ方：${labels.join("／")}。ご自分の基準を書いていただいても大丈夫です。`,
    zh: `先确认一件事：「${quote}」每次按什么来挑？它是没人在场时自己跑的，标准得写在卡上，我不替你定。现在能用的排法：${labels.join("／")}。也可以直接说你的标准。`,
  })[language],
  needNote: (language: Language) => ({
    en: "To pick by a note's topics, send the task again and choose the note with @ in the same message.",
    ja: "メモのテーマで選ぶ場合は、同じメッセージで @ からメモを選んで、もう一度送ってください。",
    zh: "要按某篇笔记的主题来挑，请把这条任务再发一次，并在同一条消息里用 @ 选上那篇笔记。",
  })[language],
  // AG16: asked to turn the reminder to the state it is already in.
  reminderAlready: (language: Language, title: string, push: boolean) => ({
    en: push ? `The scheduled task "${title}" already sends a reminder when it has a new result, so nothing was changed.` : `The scheduled task "${title}" already sends no reminder — its results only go to your inbox — so nothing was changed.`,
    ja: push ? `定期タスク「${title}」は、すでに新しい結果が出たときにお知らせする設定のため、何も変更していません。` : `定期タスク「${title}」は、すでにお知らせなし（受信箱のみ）の設定のため、何も変更していません。`,
    zh: push ? `定时任务「${title}」已经是有新结果就提醒，所以这次没有改。` : `定时任务「${title}」本来就不提醒、只放进收件箱，所以这次没有改。`,
  })[language],
  noChange: (language: Language, title: string) => ({
    en: `I couldn't tell what to change on the scheduled task "${title}", so nothing was changed. You can change how many it lists, until when it runs, when it checks, or whether it pushes a reminder.`,
    ja: `定期タスク「${title}」の何を変えるのか分からなかったため、何も変更していません。件数、期限、チェックする時間、プッシュ通知の有無を変えられます。`,
    zh: `没看出要改定时任务「${title}」的哪一项，所以这次没有改。可以改的有：条数、有效期、检查时间、是否推送提醒。`,
  })[language],
  noSchedule: (language: Language, quote: string) => ({
    en: `"${quote}": I couldn't tell how often and at what time this should run, so nothing was set up. Say it like "every Friday at 9am" or "every day at 8".`,
    ja: `「${quote}」：どの頻度・何時に実行するか分からなかったため、設定していません。「毎週金曜の9時」「毎日8時」のように教えてください。`,
    zh: `「${quote}」：没看出多久跑一次、几点跑，所以这次没有设。可以说成「每周五上午九点」或「每天早上八点」这样。`,
  })[language],
  noScope: (language: Language, quote: string) => ({
    en: `"${quote}": I couldn't tell what this should pick from (events, your contacts, or your to-dos), so nothing was set up.`,
    ja: `「${quote}」：何の中から選ぶのか（イベント、連絡先、タスク）が分からなかったため、設定していません。`,
    zh: `「${quote}」：没看出要从什么里面挑（活动、联系人还是待办），所以这次没有设。`,
  })[language],
  notFound: (language: Language, quote: string, titles: readonly string[]) => ({
    en: titles.length ? `"${quote}": I couldn't tell which scheduled task you mean, so nothing was changed. Yours are: ${titles.map((title) => `"${title}"`).join(", ")}.` : `"${quote}": you have no scheduled task yet, so there was nothing to change.`,
    ja: titles.length ? `「${quote}」：どの定期タスクのことか分からなかったため、何も変更していません。今あるのは：${titles.map((title) => `「${title}」`).join("、")}。` : `「${quote}」：定期タスクはまだないため、変更するものがありません。`,
    zh: titles.length ? `「${quote}」：没认出说的是哪条定时任务，所以这次没有改。你现在有：${titles.map((title) => `「${title}」`).join("、")}。` : `「${quote}」：你还没有定时任务，所以没有可改的。`,
  })[language],
  unavailable: (language: Language, quote: string) => ({
    en: `"${quote}": scheduled tasks cannot be read right now, so nothing was changed. Please try again in a moment.`,
    ja: `「${quote}」：今は定期タスクを読み込めないため、何も変更していません。少ししてからもう一度お試しください。`,
    zh: `「${quote}」：现在读不到定时任务，所以这次没有改。请稍后再试。`,
  })[language],
};

const FIELD_OPTIONS: Record<RuleDomain, string[]> = { contact: ["lastInteraction", "topic"], event: ["startsAt", "topic"], todo: ["plannedDate"] };

export function noteBasis(language: Language, title: string): string {
  return ({ en: `The topics of your note "${title}"`, ja: `メモ「${title}」のテーマに合うもの`, zh: `按笔记「${title}」的主题` } as const)[language];
}

/** "按开始时间从早到晚", "Start time, earliest first", "開始時間の早い順": a field order as the card's row says it. */
export function fieldBasis(field: "startsAt" | "lastInteraction" | "dueAt" | "plannedDate", direction: "asc" | "desc", language: Language): string {
  return capital(say.fieldOrderWords(field, direction, language).replace(/^by /u, ""));
}

export function topicBasis(language: Language, words: string): string {
  return ({ en: `Related to "${words}"`, ja: `「${words}」に関連するもの`, zh: `和「${words}」相关` } as const)[language];
}

const capital = (text: string) => `${text.charAt(0).toUpperCase()}${text.slice(1)}`;

export function scopeWordsOf(scope: AgentRuleScope, language: Language): string {
  if (scope.domain === "todo") return ({ en: "open to-dos past their planned day", ja: "予定日を過ぎた未完了のタスク", zh: "过了计划日还没完成的待办" } as const)[language];
  if (scope.domain === "contact") {
    const parts = [...(scope.industries ?? []), ...(scope.places ?? [])];
    const quiet = scope.quietDays;
    return ({
      en: `your contacts${parts.length ? ` (${parts.join(", ")})` : ""}${quiet ? ` with no recorded interaction in the last ${quiet} days` : ""}`,
      ja: `連絡先${parts.length ? `（${parts.join("、")}）` : ""}${quiet ? `のうち、この${quiet}日間やり取りの記録がない人` : ""}`,
      zh: `${parts.length ? `${parts.join("、")}的` : ""}联系人${quiet ? `里最近${quiet}天没有往来记录的` : ""}`,
    } as const)[language];
  }
  const window = ({
    month: { en: "the rest of that month", ja: "その月の残り", zh: "当月剩下的日子" },
    upcoming: { en: "the 30 days after each run", ja: "その後30日間", zh: "之后30天" },
    week: { en: "the 7 days after each run", ja: "その後7日間", zh: "之后7天" },
    weekend: { en: "the weekend after each run", ja: "その週末", zh: "那个周末" },
  } as const)[scope.window][language];
  const topics = scope.topics?.length ? scope.topics.join(language === "en" ? ", " : "、") : null;
  return ({ en: `public events on Orbit starting in ${window}${topics ? ` about ${topics}` : ""}`, ja: `${window}に始まる${topics ? `「${topics}」の` : ""}公開イベント`, zh: `${window}开始的${topics ? `「${topics}」主题的` : ""}公开活动` } as const)[language];
}

/** The scope as the card shows it: the user's own words, then how code reads them (which days, which records). */
function scopeLineOf(said: string | null, scope: AgentRuleScope, language: Language): string {
  const read = scopeWordsOf(scope, language);
  if (!said || said === read) return language === "en" ? capital(read) : read;
  return language === "en" ? `${said} (${read})` : `${said}（${read}）`;
}

/** The scope's short name: the user's own words in the scope line when there are any, else how code reads the scope. */
function scopeNameOf(rule: Pick<AgentRuleSpec, "scope" | "scopeText">, language: Language): string {
  const read = scopeWordsOf(rule.scope, language);
  const text = rule.scopeText.trim();
  if (!text || text === read || text === capital(read)) return read;
  for (const tail of [`（${read}）`, ` (${read})`]) if (text.endsWith(tail) && text.length > tail.length) return text.slice(0, -tail.length).trim();
  return text;
}

/**
 * A task's name, from its rule alone: the card that proposes it, the task page, the inbox and a form left without a name
 * all take this one (AG15 follow-up 6), so one rule has one name wherever it is shown.
 */
export function titleOf(schedule: RuleSchedule, rule: Pick<AgentRuleSpec, "maxItems" | "scope" | "scopeText" | "action">, language: Language): string {
  const when = scheduleWords(schedule, language).replace(/ at \d{1,2}:\d{2}$/u, "").replace(/\s+\d{1,2}:\d{2}$/u, "");
  const unit = ({ contact: { ja: "人", zh: "位" }, event: { ja: "件", zh: "场" }, todo: { ja: "件", zh: "条" } } as const)[rule.scope.domain];
  const what = scopeNameOf(rule, language);
  if (rule.action === "replan") return ({ en: `${capital(when)}: move overdue to-dos to that day`, ja: `${when}：予定日を過ぎたタスクを当日に変更`, zh: `${when}把过了计划日的待办改到当天` } as const)[language].slice(0, 120);
  return ({ en: `${capital(when)}: up to ${rule.maxItems} — ${what}`, ja: `${when}：${what}から最大${rule.maxItems}${unit.ja}`, zh: `${when}挑${rule.maxItems}${unit.zh}：${what}` } as const)[language].slice(0, 120);
}

function settle(scope: NodeScope, part: GraphPart, status: GraphPart["status"], reason: string | null, line: string | null): void {
  part.status = status;
  part.reason = reason;
  if (line) scope.run.writeLines.set(part.localId, line);
  else scope.run.writeLines.delete(part.localId);
}

/**
 * Hands the item to propose. `used` are the pieces of the message the card took (the schedule, the scope, "不用推送",
 * "先跑到 11 月底"): a sentence of the same message that only holds such a piece is part of the card, not a question of
 * its own (propose's usedByCard reads them from here).
 */
function ready(scope: NodeScope, part: GraphPart, intent: RuleOperationIntent, used: readonly ([number, number] | null)[] = [], language: Language | null = null): void {
  scope.run.presetIntents.set(part.localId, [{ ...(intent as unknown as CardOperationIntent), localId: "r1", partId: part.localId } as CardOperationIntent & { localId: string }]);
  const spans = used.filter((span): span is [number, number] => Boolean(span));
  part.write = { intents: spans.length ? ([{ capability: intent.capability, localId: "r1", relations: [], selector: spans }] as never) : [], picks: {} };
  emitTrace({ capability: intent.capability, partId: part.localId, type: "rule.intent" });
  // AG21c (R56, decision D9): one switch covers the phone and the browser. Asked for the phone only, the reply says in one
  // plain sentence that the reminder also shows in the browser (the card is not widened silently).
  const notify = (intent as { notify?: { push?: boolean }; set?: { notify?: { push?: boolean } } }).notify ?? (intent as { set?: { notify?: { push?: boolean } } }).set?.notify;
  if (notify?.push === true && asksPhoneOnly(scope.input.message.slice(part.quote[0], part.quote[1]))) {
    scope.run.leadLines.set(part.localId, alsoInBrowserLine(language ?? scope.input.locale));
    emitTrace({ partId: part.localId, type: "rule.reminder_also_in_browser" });
  }
}

/** Where a pattern's first match sits in the message. */
function spanOfMatch(message: string, pattern: RegExp): [number, number] | null {
  const found = pattern.exec(message);
  return found ? [found.index, found.index + found[0].length] : null;
}

const PUSH_SPAN = /(不用推送|不要推送|别推送|不推送|收件箱就行|收件箱就好|no push|inbox only|受信箱だけ|受信箱のみ|プッシュ(?:通知)?は?(?:不要|いら|なし)|推送|\bpush\b|プッシュ)/iu;
const UNTIL_SPAN = /(\d{1,2}\s*月\s*(?:底|末)|月底|年底|end of (?:the |this )?(?:month|year|jan\w*|feb\w*|mar\w*|apr\w*|may|jun\w*|jul\w*|aug\w*|sep\w*|oct\w*|nov\w*|dec\w*)|\d{1,2}\s*月\s*\d{1,2}\s*[日号]\s*(?:为止|まで))/iu;

interface BasisFound {
  ranking: AgentRuleSpec["ranking"];
  rankingBasis: string;
}

/** The ranking basis in some words: a note chosen with @, a field named, or a topic of the user's own. Null: none. */
function basisIn(words: string | null, domain: RuleDomain, references: readonly AgentRuleReference[], language: Language): BasisFound | null {
  const field = words ? fieldSaidIn(words, domain === "todo" ? "todo" : domain) : null;
  const fieldPart = field ? { direction: directionSaidIn(words!, "asc"), name: field } : null;
  if (references.length) {
    const title = references[0].title ?? "";
    return { ranking: { ...(fieldPart ? { field: fieldPart } : {}) }, rankingBasis: noteBasis(language, title) };
  }
  if (fieldPart) return { ranking: { field: fieldPart }, rankingBasis: fieldBasis(fieldPart.name, fieldPart.direction, language) };
  if (!words) return null;
  const topic = topicWordsOf(words).replace(SCOPE_ONLY_WORDS, " ").replace(/[\s，。、,.!！]+/gu, " ").trim();
  if (!topic) return null;
  const said = words.trim().replace(/[。.!！]+$/u, "");
  return { ranking: { topic: said }, rankingBasis: topicBasis(language, said) };
}

function createIntent(input: { ask: RuleAskState; basis: BasisFound; scopeSaid: string | null; language: Language }): RuleOperationIntent {
  const { ask, basis, language } = input;
  const replan = ask.scope.domain === "todo";
  const rule: AgentRuleSpec = {
    action: replan ? "replan" : "pick",
    locale: language,
    maxItems: ask.maxItems,
    notify: { inApp: true, push: ask.push },
    onEmpty: "silent",
    ranking: basis.ranking,
    rankingBasis: basis.rankingBasis,
    references: ask.references,
    scope: ask.scope,
    scopeText: scopeLineOf(input.scopeSaid, ask.scope, language),
    validUntil: ask.validUntil,
  };
  return { capability: RULE_CREATE, set: { rule, schedule: ask.schedule, title: titleOf(ask.schedule, rule, language) } };
}

/** The account's task the words name: the one whose title the words hold, else the one sharing the most of them. */
export function matchRule(words: string, rules: readonly RuleSnapshot[]): RuleSnapshot | null {
  const clean = (text: string) => text.toLowerCase().replace(/[「」『』“”"'\s，。、,.!！:：]/gu, "");
  const said = clean(words);
  const holding = rules.filter((rule) => said.includes(clean(rule.title)));
  if (holding.length === 1) return holding[0];
  const grams = (text: string) => new Set(Array.from({ length: Math.max(0, text.length - 1) }, (_unused, index) => text.slice(index, index + 2)));
  const saidGrams = grams(said);
  const scored = rules.map((rule) => {
    const own = grams(clean(rule.title));
    const shared = [...own].filter((gram) => saidGrams.has(gram)).length;
    return { rule, score: own.size ? shared / own.size : 0 };
  }).sort((left, right) => right.score - left.score);
  if (!scored.length || scored[0].score < 0.5) return rules.length === 1 && RULE_NOUN.test(words) && !holding.length ? rules[0] : null;
  if (scored[1] && scored[1].score === scored[0].score) return null;
  return scored[0].rule;
}

export async function rulePart(scope: NodeScope, state: AgentGraphState, part: GraphPart, task: RuleTask, optionSets: OptionSetState[], round: { budget: AgentGraphState["budget"]; repairs: number }): Promise<{ budget: AgentGraphState["budget"]; repairs: number }> {
  const { deps, input, run } = scope;
  const language = state.language as Language;
  const timeZone = state.timeZone || "Asia/Tokyo";
  const now = state.asOf || deps.now();
  // An accepted "定期留意": the words of the request it was offered for, then this message ("好，……"); what the card takes is
  // not marked in this message (its pieces are in the earlier one).
  const message = task.alternative ? `${task.alternative.quote}\n${input.message}` : input.message;
  const quote = task.alternative ? task.alternative.quote! : message.slice(part.quote[0], part.quote[1]);
  const budget = { ...round.budget };
  let repairs = round.repairs;
  const turnNotes: AgentRuleReference[] = run.references.filter((reference) => (reference.type === "memo" || reference.type === "note") && reference.accessible !== false).map((reference) => ({ id: reference.id, title: reference.name ?? "", type: "memo" as const }));

  // 1. The reply to "按什么来挑": the task asked about, with this answer as its basis (words in a new message, or a click).
  const stored = (task.reply?.rule ?? part.plan.ruleAsk) as RuleAskState | undefined;
  if (stored) {
    const original = task.reply?.quote ?? quote;
    const scopeSaid = stored.scopeSpan ? original.slice(stored.scopeSpan[0], stored.scopeSpan[1]) || null : null;
    const picked = state.optionSets.find((set) => set.partId === part.localId && set.purpose === "ranking" && set.selectedOptionId);
    const chosen = picked?.options.find((option) => option.optionId === picked.selectedOptionId)?.refId ?? null;
    const ask: RuleAskState = { ...stored, references: turnNotes.length ? turnNotes : stored.references };
    const domain = ask.scope.domain;
    let basis: BasisFound | null = null;
    if (chosen === "topic" && !ask.references.length) {
      settle(scope, part, "unfinished", "rule_needs_note", WORDS.needNote(language));
      return { budget, repairs };
    }
    if (chosen && chosen !== "topic") basis = { ranking: { field: { direction: "asc", name: chosen as "startsAt" } }, rankingBasis: fieldBasis(chosen as "startsAt", "asc", language) };
    else basis = basisIn(task.reply ? quote : null, domain, ask.references, language);
    if (!basis) {
      // "随便", or an answer that names no standard: the domain's natural order, said as such on the card.
      const natural = domain === "contact" ? "lastInteraction" : domain === "todo" ? "plannedDate" : "startsAt";
      if (task.reply && !leavesItToAgent(quote)) emitTrace({ partId: part.localId, type: "rule.basis_not_read", note: "the reply named no standard code could read; the natural order is used and shown on the card" });
      basis = { ranking: { field: { direction: "asc", name: natural } }, rankingBasis: fieldBasis(natural, "asc", language) };
    }
    part.plan = { ...part.plan, ruleAsk: undefined };
    ready(scope, part, createIntent({ ask, basis, language, scopeSaid }), [], language);
    return { budget, repairs };
  }

  // 2. A repetition the schedule cannot store ("隔周", "每月第二个周二"): code says so.
  const repeatLine = unsupportedRepeatLine(quote, { asOf: now, language, timeZone });
  if (repeatLine) {
    settle(scope, part, "unfinished", "repeat_unsupported", repeatLine);
    return { budget, repairs };
  }

  // 3. One model call points at the words.
  const user = ruleUserText({ message, quote, today: `${formatWhen(now, timeZone, false)}, ${timeZone}` });
  const system = ruleSystemPrompt();
  emitTrace({ partId: part.localId, promptVersion: RULE_PROMPT_VERSION, type: "rule.prompt" });
  let result = await callMainModel({ budget, fetchImplementation: deps.fetchImplementation, node: "functions", purpose: "first", requestId: input.requestId, system, user });
  if (result.ok === false && result.reason === "model_error" && result.retryable && repairs < 1) {
    repairs += 1;
    result = await callMainModel({ budget, fetchImplementation: deps.fetchImplementation, node: "functions", purpose: "retry", requestId: input.requestId, system, user });
  }
  let checked = result.ok ? checkRuleDraft(result.text, message) : null;
  if (result.ok && checked && checked.ok === false && repairs < 1) {
    emitTrace({ errors: checked.errors, partId: part.localId, purpose: "first", type: "rule.invalid" });
    repairs += 1;
    const repair = await callMainModel({ budget, fetchImplementation: deps.fetchImplementation, node: "functions", purpose: "repair", requestId: input.requestId, system, user: ruleRepairText(user, result.text, checked.errors) });
    checked = repair.ok ? checkRuleDraft(repair.text, message) : null;
    if (repair.ok === false) result = repair;
  }
  const words = handoffWords(language);
  let draft: RuleModelDraft | null = checked?.ok ? checked.draft : null;
  if (!draft) {
    // The model's pointers are a help, not a requirement: what code can read from the words alone still makes the card.
    if (checked?.ok === false) emitTrace({ errors: checked.errors, partId: part.localId, purpose: "final", type: "rule.invalid" });
    if (!recurrenceSaidIn(quote) && !stateVerbSaidIn(quote)) {
      const outOfBudget = result.ok === false && result.reason === "budget";
      settle(scope, part, "unfinished", outOfBudget ? "budget" : "model_error", outOfBudget ? words.budget(quote) : words.answerFailed(quote));
      return { budget, repairs };
    }
    draft = { basisText: null, count: null, domain: null, schedule: null, scheduleText: null, scopeText: null, target: null, until: null, untilText: null, verb: "create" };
  }
  const piece = (span: [number, number] | null) => (span ? message.slice(span[0], span[1]) : null);

  // 4. The verb, by code: a recurrence said with no "pause / resume / delete" is a new task.
  // AG16: words that turn a reminder on or off ("turn off notifications for …", "关掉这条任务的提醒") are about the
  // reminder, not about pausing the task: the pause / resume / delete verbs are read from the words without them. And
  // a message that asks for a reminder and names no time to run at is a change of a task that exists, never a new one.
  const aloneForReminder = !state.parts.some((other) => other.localId !== part.localId && (other.route === "propose_write" || other.route === "read" || other.route === "web_lookup" || other.route === "probe"));
  const reminderWords = aloneForReminder ? message : quote;
  const reminderAsk = pushSaidIn(reminderWords) ?? reminderSaidIn(reminderWords);
  const stateVerb = stateVerbSaidIn(reminderAsk === null ? quote : withoutReminderWords(quote));
  const recurring = scheduleSaidIn(piece(draft.scheduleText) ?? quote, timeZone) ?? scheduleSaidIn(quote, timeZone);
  const namesTask = RULE_NOUN.test(quote) || part.capabilities.some((capability) => capability === RULE_PAUSE || capability === RULE_RESUME || capability === RULE_CANCEL || capability === RULE_UPDATE);
  // A new task may also say "推送提醒我" and leave the time out ("每周五给我挑三场活动，提醒我"): that stays a new task
  // unless the words speak of a task as something that already exists.
  const speaksOfTask = RULE_NOUN.test(reminderWords) || /(任务|タスク|\btasks?\b)/iu.test(reminderWords);
  const reminderChange = reminderAsk !== null && !stateVerb && !recurring && (draft.verb !== "create" || speaksOfTask);
  const verb: RuleModelDraft["verb"] = stateVerb && namesTask ? (stateVerb === "cancel" ? "delete" : stateVerb) : reminderChange ? "update" : recurring && draft.verb !== "update" ? "create" : draft.verb;
  emitTrace({ byCode: { recurring: Boolean(recurring), reminder: reminderAsk, stateVerb }, model: draft.verb, partId: part.localId, type: "rule.verb", verb });

  if (verb !== "create") {
    if (!deps.rules) {
      settle(scope, part, "unfinished", "rule_unavailable", WORDS.unavailable(language, quote));
      return { budget, repairs };
    }
    const mine = await deps.rules.list(input.actorId);
    let found = matchRule(piece(draft.target) ?? quote, mine) ?? matchRule(quote, mine) ?? (aloneForReminder ? matchRule(message, mine) : null);
    if (!found && mine.length >= 1) {
      // AG16: the task is described, not named ("the Friday one that goes off my interests note, not the design one").
      // The model is shown the tasks' titles and card rows and answers with a number; code checks it against the list.
      // AG21a (R37): also when the user has only one task — words that describe it without its title ("周一挑人的那个") are
      // checked the same way (the model may answer null), and the result still goes through a card.
      const options = mine.map((rule, index) => ({ checks: scheduleWords(rule.schedule, "en"), number: index + 1, pickedBy: rule.rule.rankingBasis, picksFrom: rule.rule.scopeText, title: rule.title }));
      emitTrace({ candidates: mine.length, partId: part.localId, promptVersion: RULE_CHOICE_PROMPT_VERSION, type: "rule.choice_prompt" });
      const choice = await callMainModel({ budget, fetchImplementation: deps.fetchImplementation, node: "functions", purpose: "first", requestId: input.requestId, system: ruleChoiceSystemPrompt(), user: ruleChoiceUserText({ message, options }) });
      const chosen = choice.ok ? checkRuleChoice(choice.text, mine.length) : null;
      emitTrace({ chosen: chosen ? mine[chosen - 1].automationId : null, ok: choice.ok, partId: part.localId, type: "rule.choice" });
      found = chosen ? mine[chosen - 1] : null;
    }
    if (!found) {
      settle(scope, part, "unfinished", "rule_not_found", WORDS.notFound(language, quote, mine.map((rule) => rule.title)));
      emitTrace({ candidates: mine.length, partId: part.localId, type: "rule.not_found" });
      return { budget, repairs };
    }
    run.readNames.set(found.automationId, { name: found.title, type: "rule" });
    if (verb === "pause" || verb === "resume") {
      const paused = found.status === "paused";
      if ((verb === "pause") === paused) {
        settle(scope, part, "unfinished", "rule_unchanged", WORDS.alreadyState(language, found.title, paused));
        return { budget, repairs };
      }
      ready(scope, part, { capability: verb === "pause" ? RULE_PAUSE : RULE_RESUME, expectedVersion: found.version, shown: found, targetId: found.automationId });
      return { budget, repairs };
    }
    if (verb === "delete") {
      ready(scope, part, { capability: RULE_CANCEL, expectedVersion: found.version, shown: found, targetId: found.automationId });
      return { budget, repairs };
    }
    // update: only what the words name.
    const rest = piece(draft.target) ? quote.replace(piece(draft.target)!, " ") : quote;
    // AG16: the reminder switch — "推送" as before, and the plain ways of asking for a reminder on a device. Only the
    // switch is written (the card shows it); the reminder's sentence follows the language of the task's results.
    const restWords = aloneForReminder ? (piece(draft.target) ? message.replace(piece(draft.target)!, " ") : message) : rest;
    const push = pushSaidIn(rest) ?? reminderSaidIn(rest) ?? (aloneForReminder ? pushSaidIn(restWords) ?? reminderSaidIn(restWords) : null);
    const until = untilSaidIn(piece(draft.untilText) ?? rest, localDay(now, timeZone));
    const count = draft.count ?? countSaidIn(rest.replace(piece(draft.scheduleText) ?? "\u0000", " ").replace(piece(draft.untilText) ?? "\u0000", " "));
    const schedule = scheduleSaidIn(piece(draft.scheduleText) ?? rest, timeZone);
    const set: Extract<RuleOperationIntent, { capability: typeof RULE_UPDATE }>["set"] = {
      ...(push !== null && push !== found.rule.notify.push ? { notify: { inApp: true as const, push } } : {}),
      ...(until && until !== found.rule.validUntil ? { validUntil: until } : {}),
      ...(count && count !== found.rule.maxItems && draft.count ? { maxItems: Math.min(count, MAX_COUNT) } : {}),
      ...(schedule && JSON.stringify(schedule) !== JSON.stringify(found.schedule) ? { schedule } : {}),
    };
    if (!Object.keys(set).length) {
      settle(scope, part, "unfinished", "rule_no_change", push !== null && push === found.rule.notify.push ? WORDS.reminderAlready(language, found.title, push) : WORDS.noChange(language, found.title));
      return { budget, repairs };
    }
    ready(scope, part, { capability: RULE_UPDATE, expectedVersion: found.version, set, shown: found, targetId: found.automationId }, set.notify && aloneForReminder ? [reminderSpanIn(message), spanOfMatch(message, PUSH_SPAN)] : [], language);
    return { budget, repairs };
  }

  // 5. A new task: schedule, scope, count, last day, notification — read by code from the words the model pointed at.
  const modelSchedule: RuleSchedule | null = draft.schedule ? (draft.schedule.kind === "daily" ? { kind: "daily", time: draft.schedule.time, timeZone } : { daysOfWeek: draft.schedule.daysOfWeek, kind: "weekly", time: draft.schedule.time, timeZone }) : null;
  const schedule = recurring ?? (recurrenceSaidIn(quote) || draft.scheduleText ? modelSchedule ?? scheduleSaidIn(quote, timeZone, "09:00") : null);
  if (!schedule) {
    settle(scope, part, "unfinished", "rule_no_schedule", WORDS.noSchedule(language, quote));
    return { budget, repairs };
  }
  const scopeSaid = piece(draft.scopeText);
  const replan = replanSaidIn(quote);
  const domain: RuleDomain | null = replan ? "todo" : domainSaidIn(scopeSaid ?? "") ?? domainSaidIn(quote) ?? draft.domain;
  const ruleScope = domain ? scopeSaidIn(`${scopeSaid ?? ""} ${quote}`, { industries: INDUSTRY_WORDS, places: PLACE_WORDS }, domain) : null;
  if (!domain || !ruleScope || (domain === "todo" && !replan)) {
    settle(scope, part, "unfinished", "rule_no_scope", WORDS.noScope(language, quote));
    return { budget, repairs };
  }
  const today = localDay(now, timeZone);
  const untilWords = piece(draft.untilText);
  // "不用推送", "先跑到 11 月底" may stand in a sentence of their own. When this task is the message's only request, the
  // whole message qualifies it; with other requests in the message, only the part's own words do.
  const alone = !state.parts.some((other) => other.localId !== part.localId && (other.route === "propose_write" || other.route === "read" || other.route === "web_lookup" || other.route === "probe"));
  const said = alone ? message : quote;
  const validUntil = untilSaidIn(untilWords ?? said, today) ?? (untilWords && draft.until && draft.until >= today ? draft.until : null);
  const countWords = [piece(draft.scheduleText), untilWords].filter((text): text is string => Boolean(text)).reduce((text, cut) => text.replace(cut, " "), quote);
  const maxItems = Math.min(Math.max(1, countSaidIn(countWords) ?? draft.count ?? DEFAULT_COUNT), MAX_COUNT);
  const [quoteStart, quoteEnd] = task.alternative ? [0, quote.length] : part.quote;
  const scopeSpan: [number, number] | null = draft.scopeText && draft.scopeText[0] >= quoteStart && draft.scopeText[1] <= quoteEnd ? [draft.scopeText[0] - quoteStart, draft.scopeText[1] - quoteStart] : null;
  const ask: RuleAskState = { maxItems, push: pushSaidIn(said) ?? false, references: turnNotes, schedule, scope: ruleScope, scopeSpan, validUntil };
  const used = [draft.scheduleText, draft.scopeText, draft.basisText, draft.untilText ?? (alone ? spanOfMatch(message, UNTIL_SPAN) : null), alone ? spanOfMatch(message, PUSH_SPAN) : null];
  // The basis: a note chosen with @, a field named in the words, or a topic of the user's own (outside the scope words).
  const basisWords = piece(draft.basisText) ?? (scopeSaid ? quote.replace(scopeSaid, " ") : quote);
  const basis = replan
    ? { ranking: { field: { direction: "asc" as const, name: "plannedDate" as const } }, rankingBasis: fieldBasis("plannedDate", "asc", language) }
    : basisIn(draft.basisText ? basisWords : null, domain, turnNotes, language) ?? (fieldSaidIn(basisWords, domain) ? basisIn(basisWords, domain, turnNotes, language) : null);
  emitTrace({ basis: basis ? { field: basis.ranking.field?.name ?? null, note: turnNotes.length > 0, topic: Boolean(basis.ranking.topic) } : null, domain, maxItems, partId: part.localId, push: ask.push, schedule, scope: ruleScope, type: "rule.read", validUntil });
  if (!basis) {
    // Unattended runs need their standard on the card: one question, never a default chosen for the user (§3.5).
    const options = FIELD_OPTIONS[domain];
    const clarificationId = setIdOf(input.requestId, part.localId, "q");
    const labels = new Map(options.map((key, index) => [`o${index + 1}`, { label: say.orderingLabel(key, language) }]));
    optionSets.push({ asks: "reading", clarificationId, kind: "question", options: options.map((key, index) => ({ capabilities: [RULE_CREATE], capability: RULE_CREATE, optionId: `o${index + 1}`, refId: key, refType: "ranking" })), partId: part.localId, purpose: "ranking", state: "open", subgoal: `clarification:${input.requestId}:${part.localId}` });
    run.optionLabels.set(clarificationId, labels);
    run.questionLines.set(part.localId, WORDS.askBasis(language, quote.replace(/[。.!！?？]+$/u, ""), [...labels.values()].map((item) => item.label)));
    part.status = "awaiting_clarification";
    part.reason = null;
    part.waitReason = "object_ambiguous";
    part.asked += 1;
    part.plan = { ...part.plan, ruleAsk: ask };
    emitTrace({ clarificationId, domain, kind: "question", options: options.length, partId: part.localId, question: "rule_ranking_basis", subgoal: `clarification:${input.requestId}:${part.localId}`, type: "clarify.asked" });
    return { budget, repairs };
  }
  ready(scope, part, createIntent({ ask, basis, language, scopeSaid }), task.alternative ? [] : used, language);
  return { budget, repairs };
}
