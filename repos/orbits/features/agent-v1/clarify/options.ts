/**
 * Clickable directions, from code only (设计稿 §3.11 "可点的方向从哪来"; agent-design AG04-1, 易错边界 1, 2).
 *
 * Directions come from three places, in order: this turn's @ references and the page; the session's
 * open items; the record kind's registered actions. With no context at all they are exactly three
 * generic entries: look something up, make a note, set a reminder. Every direction is a capability of
 * 附录 A and its words are code's fixed copy (zh, ja, en) with the object's clue or name; a model
 * reading only picks capabilities, its label is never shown, and a capability outside 附录 A is dropped.
 * Only a text clue ("小林") is carried as words: nothing is looked up to find out who it is.
 */
import type { NamedRecordRef, SessionOpenItem } from "../context/session-state";
import { CAPABILITY_TABLE, capabilityKind, isCapability, type Capability } from "../route/capabilities";
import type { ReplyLanguage } from "../route/handoff-copy";
import type { Deliverable } from "../understand/schema";
import { isReadOnlyReading, mainCapability, readingLabel, recordKindOf, sameReading, type Reading, type RecordKind } from "./default-readings";

export interface ClarifyOption {
  optionId: string;
  label: string;
  /** The capability shown for this direction (附录 A). */
  capability: Capability;
  /** All capabilities the direction leads to (a reading may need several). */
  capabilities: Capability[];
  ref?: { type: string; id: string; name: string };
}

export type OptionPurpose = "directions" | "readings" | "object" | "other_readings" | "entry" | "alternative";

export interface OptionObject {
  kind: RecordKind | null;
  /** The user's own words for it ("小林", "那个"). */
  text: string | null;
  /** A name code knows (an authorized @ reference, a record the session mentioned). */
  name: string | null;
}

export interface OptionsInput {
  purpose: OptionPurpose;
  language: ReplyLanguage;
  references?: readonly NamedRecordRef[];
  pageKind?: RecordKind | null;
  openItems?: readonly SessionOpenItem[];
  object?: OptionObject | null;
  readings?: readonly { capabilities: readonly string[]; deliverable: Deliverable | string }[];
  candidates?: readonly NamedRecordRef[];
  /** The capability of an object question, an entry or an alternative. */
  capability?: Capability;
  /** A reading already chosen (other_readings leaves it out). */
  exclude?: Reading;
  /**
   * AG08: an entry offered after the write-intent review turned a write tag into a statement, in code's words for
   * what the sentence was about: logging the contact it reports, or moving a record to the day it names.
   */
  entryWording?: { kind: "interaction" } | { kind: "reschedule"; date: string };
}

export const MAX_OPTIONS = 3;
export const MAX_OTHER_READINGS = 2;
/** 查我的资料、记一笔、设个提醒. */
export const GENERIC_DIRECTIONS: Capability[] = ["contact.read", "memo.create", "todo.create"];

/** The registered common actions of each record kind (the third source of directions). */
export const COMMON_ACTIONS: Record<RecordKind, Capability[]> = {
  contact: ["view.recentInteraction", "memo.create", "todo.create"],
  event: ["event.read", "attendance.create", "todo.create"],
  memo: ["fn.summarize", "fn.extractFollowUps", "memo.update"],
  schedule: ["schedule.read", "schedule.update", "todo.create"],
  todo: ["todo.read", "todo.update", "todo.complete"],
};

type Label = Record<ReplyLanguage, (object: string | null) => string>;
const words = (zh: (x: string) => string, zhNone: string, ja: (x: string) => string, jaNone: string, en: (x: string) => string, enNone: string): Label => ({
  en: (x) => (x ? en(x) : enNone),
  ja: (x) => (x ? ja(x) : jaNone),
  zh: (x) => (x ? zh(x) : zhNone),
});

/** Code's words per capability; {object} is the clue or name, or a generic phrase without one. */
const LABELS: Partial<Record<Capability, Label>> = {
  "attendance.create": words((x) => `记下我参加${x}的情况`, "记下我参加活动的情况", (x) => `${x}への参加を記録する`, "イベントへの参加を記録する", (x) => `Note that I attended ${x}`, "Note an event I attended"),
  "attendance.delete": words((x) => `删掉我参加${x}的记录`, "删掉一条参会记录", (x) => `${x}の参加記録を削除する`, "参加記録を削除する", (x) => `Delete my attendance note for ${x}`, "Delete an attendance note"),
  "attendance.read": words((x) => `看我参加${x}的记录`, "看我的参会记录", (x) => `${x}の参加記録を見る`, "自分の参加記録を見る", (x) => `See my attendance notes for ${x}`, "See my attendance notes"),
  "attendance.update": words((x) => `改我参加${x}的记录`, "改一条参会记录", (x) => `${x}の参加記録を変更する`, "参加記録を変更する", (x) => `Change my attendance note for ${x}`, "Change an attendance note"),
  "contact.create": words((x) => `把${x}加为联系人`, "新建一位联系人", (x) => `${x}を連絡先に追加する`, "連絡先を追加する", (x) => `Add ${x} as a contact`, "Add a contact"),
  "contact.delete": words((x) => `删掉联系人${x}`, "删掉一位联系人", (x) => `連絡先の${x}を削除する`, "連絡先を削除する", (x) => `Delete the contact ${x}`, "Delete a contact"),
  "contact.import": words((x) => `从${x}导入联系人`, "导入联系人", (x) => `${x}から連絡先をインポートする`, "連絡先をインポートする", (x) => `Import contacts from ${x}`, "Import contacts"),
  "contact.read": words((x) => `查${x}的资料`, "查我的资料", (x) => `${x}の情報を調べる`, "自分の記録を調べる", (x) => `Look up ${x}`, "Look something up in my records"),
  "contact.restore": words((x) => `恢复联系人${x}`, "恢复删掉的联系人", (x) => `連絡先の${x}を元に戻す`, "削除した連絡先を元に戻す", (x) => `Restore the contact ${x}`, "Restore a deleted contact"),
  "contact.update": words((x) => `改${x}的联系人资料`, "改一位联系人的资料", (x) => `${x}の連絡先情報を変更する`, "連絡先情報を変更する", (x) => `Change ${x}'s contact details`, "Change contact details"),
  "event.read": words((x) => `看${x}的时间和地点`, "查活动", (x) => `${x}の日時と場所を見る`, "イベントを調べる", (x) => `See the time and place of ${x}`, "Look up events"),
  "external.deepResearch": words((x) => `让外部 Agent 深入研究${x}`, "让外部 Agent 做深入研究", (x) => `${x}の詳しい調査を外部エージェントに任せる`, "詳しい調査を外部エージェントに任せる", (x) => `Have an external agent research ${x}`, "Have an external agent do the research"),
  "external.otherTool": words((x) => `用别的工具处理${x}`, "用别的工具处理", (x) => `${x}を別のツールで扱う`, "別のツールで扱う", (x) => `Use another tool for ${x}`, "Use another tool"),
  "fn.compare": words((x) => `比较${x}`, "比较几条记录", (x) => `${x}を比べる`, "記録を比べる", (x) => `Compare ${x}`, "Compare records"),
  "fn.extractFollowUps": words((x) => `找出${x}里要跟进的事`, "找出要跟进的事", (x) => `${x}からフォローすることを洗い出す`, "フォローすることを洗い出す", (x) => `Find the follow-ups in ${x}`, "Find follow-ups"),
  "fn.extractInteractions": words((x) => `找出${x}里的往来`, "找出往来", (x) => `${x}からやり取りを洗い出す`, "やり取りを洗い出す", (x) => `Find the interactions in ${x}`, "Find interactions"),
  "fn.group": words((x) => `把${x}分组`, "把记录分组", (x) => `${x}をグループに分ける`, "記録をグループに分ける", (x) => `Group ${x}`, "Group records"),
  "fn.rank": words((x) => `给${x}排个序`, "给记录排个序", (x) => `${x}を並べ替える`, "記録を並べ替える", (x) => `Rank ${x}`, "Rank records"),
  "fn.summarize": words((x) => `看${x}的摘要`, "看摘要", (x) => `${x}の要約を見る`, "要約を見る", (x) => `See a summary of ${x}`, "See a summary"),
  "memo.create": words((x) => `记一笔关于${x}的事`, "记一笔", (x) => `${x}についてメモを残す`, "メモを残す", (x) => `Make a note about ${x}`, "Make a note"),
  "memo.delete": words((x) => `删掉${x}`, "删掉一篇笔记", (x) => `${x}を削除する`, "メモを削除する", (x) => `Delete ${x}`, "Delete a note"),
  "memo.read": words((x) => `看${x}的笔记`, "查我的笔记", (x) => `${x}のメモを見る`, "自分のメモを調べる", (x) => `See notes about ${x}`, "Look through my notes"),
  "memo.unlink": words((x) => `解除笔记和${x}的关联`, "解除笔记的关联", (x) => `メモと${x}の関連付けを外す`, "メモの関連付けを外す", (x) => `Unlink ${x} from a note`, "Unlink a note"),
  "memo.update": words((x) => `改${x}`, "改一篇笔记", (x) => `${x}を変更する`, "メモを変更する", (x) => `Edit ${x}`, "Edit a note"),
  "memory.create": words((x) => `记住关于${x}的这件事`, "记住一件事", (x) => `${x}について覚えておく`, "覚えておく", (x) => `Remember this about ${x}`, "Remember something"),
  "memory.delete": words((x) => `忘掉关于${x}的记忆`, "忘掉一条记忆", (x) => `${x}についての記憶を消す`, "記憶を消す", (x) => `Forget what I remember about ${x}`, "Forget a memory"),
  "memory.update": words((x) => `改关于${x}的记忆`, "改一条记忆", (x) => `${x}についての記憶を変更する`, "記憶を変更する", (x) => `Change what I remember about ${x}`, "Change a memory"),
  "privateEvent.create": words((x) => `把${x}加成我的活动`, "新建一场我的活动", (x) => `${x}を自分のイベントとして追加する`, "自分のイベントを追加する", (x) => `Add ${x} as my own event`, "Add an event of my own"),
  "privateEvent.delete": words((x) => `删掉我的活动${x}`, "删掉一场我的活动", (x) => `自分のイベント${x}を削除する`, "自分のイベントを削除する", (x) => `Delete my event ${x}`, "Delete an event of mine"),
  "privateEvent.update": words((x) => `改我的活动${x}`, "改一场我的活动", (x) => `自分のイベント${x}を変更する`, "自分のイベントを変更する", (x) => `Change my event ${x}`, "Change an event of mine"),
  "profile.read": words((x) => `看我的资料里关于${x}的部分`, "看我的个人资料", (x) => `自分のプロフィールの${x}を見る`, "自分のプロフィールを見る", (x) => `See ${x} in my profile`, "See my profile"),
  "rule.cancel": words((x) => `取消${x}这条定期任务`, "取消一条定期任务", (x) => `定期タスク「${x}」を取り消す`, "定期タスクを取り消す", (x) => `Cancel the scheduled task ${x}`, "Cancel a scheduled task"),
  "rule.create": words((x) => `就按这个做法定期留意${x}`, "就按这个做法定期留意", (x) => `その方法で${x}を定期的にチェックする`, "その方法で定期的にチェックする", (x) => `Go with checking ${x} regularly`, "Go with checking regularly"),
  "rule.pause": words((x) => `暂停${x}这条定期任务`, "暂停一条定期任务", (x) => `定期タスク「${x}」を一時停止する`, "定期タスクを一時停止する", (x) => `Pause the scheduled task ${x}`, "Pause a scheduled task"),
  "rule.resume": words((x) => `恢复${x}这条定期任务`, "恢复一条定期任务", (x) => `定期タスク「${x}」を再開する`, "定期タスクを再開する", (x) => `Resume the scheduled task ${x}`, "Resume a scheduled task"),
  "rule.update": words((x) => `改${x}这条定期任务`, "改一条定期任务", (x) => `定期タスク「${x}」を変更する`, "定期タスクを変更する", (x) => `Change the scheduled task ${x}`, "Change a scheduled task"),
  "schedule.create": words((x) => `为${x}排个日程`, "排个日程", (x) => `${x}の予定を入れる`, "予定を入れる", (x) => `Schedule something for ${x}`, "Add to my schedule"),
  "schedule.delete": words((x) => `删掉${x}的日程`, "删掉一个日程", (x) => `${x}の予定を削除する`, "予定を削除する", (x) => `Delete the schedule entry for ${x}`, "Delete a schedule entry"),
  "schedule.read": words((x) => `看${x}相关的日程`, "看我的日程", (x) => `${x}に関する予定を見る`, "自分の予定を見る", (x) => `See my schedule for ${x}`, "See my schedule"),
  "schedule.update": words((x) => `改${x}的日程`, "改一个日程", (x) => `${x}の予定を変更する`, "予定を変更する", (x) => `Change the schedule entry for ${x}`, "Change a schedule entry"),
  "todo.complete": words((x) => `把${x}相关的待办标为完成`, "把一条待办标为完成", (x) => `${x}に関するToDoを完了にする`, "ToDoを完了にする", (x) => `Mark a to-do about ${x} as done`, "Mark a to-do as done"),
  "todo.create": words((x) => `给${x}设个提醒`, "设个提醒", (x) => `${x}についてリマインダーを設定する`, "リマインダーを設定する", (x) => `Set a reminder about ${x}`, "Set a reminder"),
  "todo.delete": words((x) => `删掉${x}相关的待办`, "删掉一条待办", (x) => `${x}に関するToDoを削除する`, "ToDoを削除する", (x) => `Delete a to-do about ${x}`, "Delete a to-do"),
  "todo.read": words((x) => `看${x}相关的待办`, "看我的待办", (x) => `${x}に関するToDoを見る`, "自分のToDoを見る", (x) => `See to-dos about ${x}`, "See my to-dos"),
  "todo.reopen": words((x) => `把${x}相关的待办重新打开`, "重新打开一条待办", (x) => `${x}に関するToDoを再開する`, "ToDoを再開する", (x) => `Reopen a to-do about ${x}`, "Reopen a to-do"),
  "todo.update": words((x) => `改${x}相关的待办`, "改一条待办", (x) => `${x}に関するToDoを変更する`, "ToDoを変更する", (x) => `Change a to-do about ${x}`, "Change a to-do"),
  "view.context": words((x) => `看${x}的资料和往来`, "看一位联系人的资料和往来", (x) => `${x}の情報とやり取りを見る`, "連絡先の情報とやり取りを見る", (x) => `See ${x}'s details and interactions`, "See a contact's details and interactions"),
  "view.recentInteraction": words((x) => `看和${x}最近的往来`, "看最近的往来", (x) => `${x}との最近のやり取りを見る`, "最近のやり取りを見る", (x) => `See recent interactions with ${x}`, "See recent interactions"),
  "view.timeline": words((x) => `看${x}的往来时间线`, "看往来时间线", (x) => `${x}とのやり取りの時系列を見る`, "やり取りの時系列を見る", (x) => `See the timeline with ${x}`, "See a timeline"),
  "web.fetch": words((x) => `打开网页看${x}`, "打开网页看看", (x) => `ウェブページで${x}を見る`, "ウェブページを見る", (x) => `Open the web page about ${x}`, "Open a web page"),
  "web.search": words((x) => `上网查${x}的公开资料`, "上网查公开资料", (x) => `${x}の公開情報をネットで調べる`, "公開情報をネットで調べる", (x) => `Look up public information on ${x}`, "Look up public information"),
};

/** For a person, a function over notes is about the interactions with them ("找出和小林要跟进的事"). */
const PERSON_LABELS: Partial<Record<Capability, Label>> = {
  "fn.extractFollowUps": words((x) => `找出和${x}要跟进的事`, "找出要跟进的事", (x) => `${x}とのフォローすることを洗い出す`, "フォローすることを洗い出す", (x) => `Find follow-ups with ${x}`, "Find follow-ups"),
  "fn.extractInteractions": words((x) => `找出和${x}的往来`, "找出往来", (x) => `${x}とのやり取りを洗い出す`, "やり取りを洗い出す", (x) => `Find interactions with ${x}`, "Find interactions"),
  "fn.summarize": words((x) => `看和${x}往来的摘要`, "看往来的摘要", (x) => `${x}とのやり取りの要約を見る`, "やり取りの要約を見る", (x) => `See a summary of your interactions with ${x}`, "See a summary of interactions"),
  "privateEvent.create": words((x) => `建一场和${x}有关的我的活动`, "新建一场我的活动", (x) => `${x}に関する自分のイベントを作る`, "自分のイベントを作る", (x) => `Create an event of my own about ${x}`, "Add an event of my own"),
};

/** For a note itself, reading it is reading the note, not "notes about" it. */
const NOTE_LABELS: Partial<Record<Capability, Label>> = {
  "memo.read": words((x) => `看${x}的全文`, "看这篇笔记的全文", (x) => `${x}の全文を見る`, "このメモの全文を見る", (x) => `Read ${x} in full`, "Read this note in full"),
};

/** Code's words for a capability with the object (the clue or the name), or without one; `kind` is the object's record kind. */
export function capabilityLabel(capability: Capability, language: ReplyLanguage, object: string | null, kind?: RecordKind | null): string {
  const byKind = kind === "contact" ? PERSON_LABELS[capability] : kind === "memo" ? NOTE_LABELS[capability] : undefined;
  const label = byKind ?? LABELS[capability];
  if (label) return label[language](object);
  // Every capability of 附录 A has its words above; this is only a guard for a new capability.
  return language === "zh" ? "这一项" : language === "ja" ? "この項目" : "This";
}

function objectWords(object: OptionObject | null | undefined): string | null {
  if (!object) return null;
  const words = (object.name ?? object.text ?? "").replace(/^@/u, "").trim();
  return words || null;
}

const option = (index: number, capabilities: Capability[], label: string, ref?: ClarifyOption["ref"]): ClarifyOption => ({
  capabilities,
  capability: mainCapability(capabilities),
  label,
  optionId: `o${index + 1}`,
  ...(ref ? { ref } : {}),
});

function dedupe(options: ClarifyOption[]): ClarifyOption[] {
  const seen = new Set<string>();
  const out: ClarifyOption[] = [];
  for (const item of options) {
    const key = `${item.capability}\u0000${item.ref?.id ?? ""}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(item);
  }
  return out.slice(0, MAX_OPTIONS).map((item, index) => ({ ...item, optionId: `o${index + 1}` }));
}

const registeredReadings = (readings: OptionsInput["readings"]): Reading[] => (readings ?? [])
  .filter((reading) => reading.capabilities.length > 0 && reading.capabilities.every(isCapability) && !reading.capabilities.some((capability) => capabilityKind(capability as Capability) === "external"))
  .map((reading) => ({ capabilities: [...new Set(reading.capabilities as Capability[])], deliverable: reading.deliverable as Deliverable }));

export function optionsFor(input: OptionsInput): ClarifyOption[] {
  const { language } = input;
  const object = objectWords(input.object);
  const objectKind = input.object?.kind ?? null;
  const label = (capability: Capability, x: string | null, kind: RecordKind | null = objectKind) => capabilityLabel(capability, language, x, kind);
  const labelOf = (capability: Capability, lang: ReplyLanguage, x: string | null) => capabilityLabel(capability, lang, x, objectKind);
  switch (input.purpose) {
    case "directions": {
      // 1. this turn's @ references and the page.
      const fromContext: ClarifyOption[] = [];
      for (const reference of input.references ?? []) {
        const kind = recordKindOf(reference.type);
        if (!kind) continue;
        const name = reference.name?.trim() || null;
        for (const capability of COMMON_ACTIONS[kind]) fromContext.push(option(0, [capability], label(capability, name ?? defaultObjectWords(kind, language), kind), name ? { id: reference.id, name, type: reference.type } : undefined));
      }
      if (input.pageKind) for (const capability of COMMON_ACTIONS[input.pageKind]) fromContext.push(option(0, [capability], label(capability, null)));
      // 2. the session's open items: an alternative still waiting to be accepted.
      const fromOpenItems: ClarifyOption[] = [];
      for (const item of input.openItems ?? []) {
        if (item.kind !== "alternative") continue;
        const leadsTo = item.leadsTo && isCapability(item.leadsTo) ? item.leadsTo : "rule.create";
        fromOpenItems.push(option(0, [leadsTo], label(leadsTo, null)));
      }
      // 3. the registered actions of the clue's record kind, with the clue's words.
      const fromKind = input.object?.kind ? COMMON_ACTIONS[input.object.kind].map((capability) => option(0, [capability], label(capability, object ?? defaultObjectWords(input.object!.kind!, language)))) : [];
      const sources = [fromContext, fromOpenItems, fromKind].filter((list) => list.length);
      if (!sources.length) return GENERIC_DIRECTIONS.map((capability, index) => option(index, [capability], label(capability, null)));
      // In source order, one from each in turn, so a later source is not crowded out.
      const found: ClarifyOption[] = [];
      for (let round = 0; found.length < sources.reduce((sum, list) => sum + list.length, 0); round += 1) {
        for (const list of sources) if (list[round]) found.push(list[round]);
      }
      return dedupe(found);
    }
    case "readings": {
      const readings = registeredReadings(input.readings);
      const found = readings.map((reading, index) => option(index, reading.capabilities, readingLabel(reading, language, object, labelOf)));
      // Fewer than three readings: the object kind's registered actions fill up the list.
      if (input.object?.kind) for (const capability of COMMON_ACTIONS[input.object.kind]) found.push(option(found.length, [capability], label(capability, object ?? defaultObjectWords(input.object.kind, language))));
      if (found.length < 2) for (const capability of GENERIC_DIRECTIONS) found.push(option(found.length, [capability], label(capability, null)));
      return dedupe(found);
    }
    case "object": {
      const capability = input.capability && isCapability(input.capability) ? input.capability : "contact.read";
      // AG06 (AE-XL-002, AE-SCL-011): each candidate with what tells it apart (a person's company and role).
      return dedupe((input.candidates ?? []).map((candidate, index) => option(index, [capability], candidate.detail ? (language === "en" ? `${candidate.name} (${candidate.detail})` : `${candidate.name}（${candidate.detail}）`) : candidate.name, { id: candidate.id, name: candidate.name, type: candidate.type })));
    }
    case "other_readings": {
      const readings = registeredReadings(input.readings).filter((reading) => isReadOnlyReading(reading) && !(input.exclude && (sameReading(reading, input.exclude) || reading.capabilities.some((capability) => capabilityKind(capability) === "function" && input.exclude!.capabilities.includes(capability)))));
      return dedupe(readings.map((reading, index) => option(index, reading.capabilities, readingLabel(reading, language, object, labelOf)))).slice(0, MAX_OTHER_READINGS);
    }
    case "entry":
    case "alternative": {
      const capability = input.capability && isCapability(input.capability) ? input.capability : input.purpose === "alternative" ? "rule.create" : "memo.create";
      if (input.purpose === "entry" && input.entryWording) return [option(0, [capability], entryLabel(input.entryWording, language, object, objectKind))];
      return [option(0, [capability], label(capability, input.purpose === "alternative" ? null : object))];
    }
    default:
      return [];
  }
}

/** AG08: the words of an entry after the write-intent review ("把这件事记到小林的往来里", "把这条待办改到周五"). */
export function entryLabel(wording: NonNullable<OptionsInput["entryWording"]>, language: ReplyLanguage, object: string | null, kind: RecordKind | null): string {
  if (wording.kind === "interaction") {
    const who = object ?? defaultObjectWords("contact", language);
    return language === "zh" ? `把这件事记到${who}的往来里` : language === "ja" ? `${who}とのやり取りとして記録する` : `Log this as an interaction with ${who}`;
  }
  const what = object ? (language === "en" ? `"${object}"` : `「${object}」`) : defaultObjectWords(kind ?? "todo", language);
  return language === "zh" ? `把${what}改到${wording.date}` : language === "ja" ? `${what}を${wording.date}に変更する` : `Move ${what} to ${wording.date}`;
}

/** A generic phrase for an object of a kind when there is no name or clue ("这篇笔记"). */
export function defaultObjectWords(kind: RecordKind, language: ReplyLanguage): string {
  const table: Record<RecordKind, Record<ReplyLanguage, string>> = {
    contact: { en: "this contact", ja: "この連絡先", zh: "这位联系人" },
    event: { en: "this event", ja: "このイベント", zh: "这场活动" },
    memo: { en: "this note", ja: "このメモ", zh: "这篇笔记" },
    schedule: { en: "this schedule entry", ja: "この予定", zh: "这个日程" },
    todo: { en: "this to-do", ja: "このToDo", zh: "这条待办" },
  };
  return table[kind][language];
}

/** Every option is a capability of 附录 A (the offered_options check reads the same table). */
export function allRegistered(options: readonly { capability: string }[]): boolean {
  return options.every((item) => Object.prototype.hasOwnProperty.call(CAPABILITY_TABLE, item.capability));
}
