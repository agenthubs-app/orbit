/**
 * agent-design AG06: the operations a conversation card can carry (设计稿附录 B) — AG02's todo.create and
 * todo.update, and memo.create with its interaction (附录 E) — and the texts code writes for a card: one
 * line per item (the record, the value before and after, days with their weekdays) and the count sentence
 * of the whole card ("修改 1 项，新增 1 项"). Everything a user reads on a card is written here, frozen
 * into the payload and covered by the card hash; no model writes any of it.
 *
 * An intent carries its sub-goal (partId) and, when the user made one item wait for another (AE-XL-008),
 * the positions of the items it depends on; they become the frozen operations' `dependsOn`.
 */
import type { AgentCardOperationDisplayContract } from "../../../shared/contract/agent-v1";
import type { NoteInteractionContract } from "../../../shared/contract/notes";
import type { AgentActionOperationPayload } from "./contract";
import {
  cardLocale,
  dayText,
  prepareTodoOperation,
  TODO_CREATE,
  TODO_UPDATE,
  todoIntentOf,
  type CardLocale,
  type TodoOperationIntent,
  type TodoReader,
} from "./todo-operations";

export const MEMO_CREATE = "memo.create";
export const MEMO_UPDATE = "memo.update";

/** What a new memo with an interaction holds (附录 E). Names are only for the card's text. */
export interface MemoCreateSet {
  title: string;
  body: string;
  /** Every person the memo is about: the actual contacts and the ones only mentioned. */
  contactIds: string[];
  /** Absent: a plain note with no actual contact (nobody was named). */
  interaction?: NoteInteractionContract;
  /** Display names of the contacts, frozen with the card (the text names them). */
  names: Record<string, string>;
}

export interface MemoCreateIntent {
  capability: typeof MEMO_CREATE;
  set: MemoCreateSet;
}

/**
 * agent-design AG10 (设计稿 §3.5 从笔记到联系人往来, 附录 E): the interaction an existing memo records, set on that memo
 * after a confirmed card. The memo's text is kept as it is; only the interaction field is written (and the old
 * automatic extraction stays suppressed). The version the card was frozen from is the precondition.
 */
export interface MemoUpdateIntent {
  capability: typeof MEMO_UPDATE;
  targetId: string;
  expectedVersion: number;
  set: { interaction: NoteInteractionContract };
  /** What the card shows: the memo's title, its contacts (to say who is only mentioned), names, the supporting sentence. */
  shown: { title: string; contactIds: string[]; names: Record<string, string>; sentence?: string; before: NoteInteractionContract | null };
}

export type CardOperationIntent = (TodoOperationIntent | MemoCreateIntent | MemoUpdateIntent) & {
  /** The sub-goal of the request (kept until the receipt). */
  partId?: string;
  /** Positions (0-based) in the same card of the items this one waits for. */
  dependsOn?: number[];
};

const CHANNEL_WORDS: Record<CardLocale, Record<string, Record<string, string>>> = {
  en: {
    email: { incoming: "they e-mailed", mutual: "an e-mail exchange", outgoing: "you e-mailed" },
    meeting: { incoming: "met in person", mutual: "met in person", outgoing: "met in person" },
    message: { incoming: "they sent a message", mutual: "messages", outgoing: "you sent a message" },
    other: { incoming: "they got in touch", mutual: "in touch", outgoing: "you got in touch" },
    phone: { incoming: "they called", mutual: "a call", outgoing: "you called" },
  },
  ja: {
    email: { incoming: "先方からのメール", mutual: "メールのやり取り", outgoing: "こちらからのメール" },
    meeting: { incoming: "面会", mutual: "面会", outgoing: "面会" },
    message: { incoming: "先方からのメッセージ", mutual: "メッセージのやり取り", outgoing: "こちらからのメッセージ" },
    other: { incoming: "先方からの連絡", mutual: "やり取り", outgoing: "こちらからの連絡" },
    phone: { incoming: "先方からの電話", mutual: "通話", outgoing: "こちらからの電話" },
  },
  zh: {
    email: { incoming: "对方来信", mutual: "邮件往来", outgoing: "我发的邮件" },
    meeting: { incoming: "见面", mutual: "见面", outgoing: "见面" },
    message: { incoming: "对方发来消息", mutual: "消息往来", outgoing: "我发的消息" },
    other: { incoming: "对方联系过我", mutual: "往来", outgoing: "我联系过对方" },
    phone: { incoming: "对方来电", mutual: "通话", outgoing: "我打过去的电话" },
  },
};

/** The line a user reads for a new interaction memo: who, which day, what kind of contact, who is only mentioned. */
export function memoCreateText(set: MemoCreateSet, locale: CardLocale): string {
  const interaction = set.interaction;
  if (!interaction) {
    if (locale === "en") return `New note "${set.title}"`;
    if (locale === "ja") return `メモ「${set.title}」を追加`;
    return `新增笔记「${set.title}」`;
  }
  const nameOf = (id: string) => set.names[id] ?? id;
  const actual = interaction.actualContactIds.map(nameOf);
  const mentioned = set.contactIds.filter((id) => !interaction.actualContactIds.includes(id)).map(nameOf);
  const when = interaction.occurredOn ? dayText(interaction.occurredOn, locale) : interaction.occurredAt ?? "";
  const how = CHANNEL_WORDS[locale][interaction.channel]?.[interaction.direction] ?? CHANNEL_WORDS[locale].other.mutual;
  if (locale === "en") return `New interaction note "${set.title}": with ${actual.join(", ")}, ${when}, ${how}${mentioned.length ? `; also linked: ${mentioned.join(", ")} (only mentioned)` : ""}`;
  if (locale === "ja") return `やり取りのメモ「${set.title}」を追加：相手 ${actual.join("、")}、${when}、${how}${mentioned.length ? `。関連（話に出ただけ）：${mentioned.join("、")}` : ""}`;
  return `新增往来笔记「${set.title}」：实际往来对象 ${actual.join("、")}，${when}，${how}${mentioned.length ? `；另关联 ${mentioned.join("、")}（只是提到）` : ""}`;
}

const MEMO_DISPLAY: Record<CardLocale, { record: (title: string) => string; with: string; day: string; how: string; also: string; mentioned: (names: string) => string; join: string }> = {
  en: { also: "Also linked", day: "Date", how: "How", join: ", ", mentioned: (names) => `${names} (only mentioned)`, record: (title) => `Note "${title}"`, with: "With" },
  ja: { also: "関連", day: "日付", how: "方法", join: "、", mentioned: (names) => `${names}（話に出ただけ）`, record: (title) => `メモ「${title}」`, with: "相手" },
  zh: { also: "另关联", day: "日期", how: "方式", join: "、", mentioned: (names) => `${names}（只是提到）`, record: (title) => `笔记「${title}」`, with: "往来对象" },
};

/** AG07 (approved visual draft): how the card shows a new memo — the record, then who, which day, how, who is only mentioned. */
export function memoCreateDisplay(set: MemoCreateSet, locale: CardLocale): AgentCardOperationDisplayContract {
  const words = MEMO_DISPLAY[locale];
  const nameOf = (id: string) => set.names[id] ?? id;
  const interaction = set.interaction;
  if (!interaction) return { change: "create", record: words.record(set.title), rows: [] };
  const mentioned = set.contactIds.filter((id) => !interaction.actualContactIds.includes(id)).map(nameOf);
  const rows: AgentCardOperationDisplayContract["rows"][number][] = [
    { after: interaction.actualContactIds.map(nameOf).join(words.join), field: "interaction.actualContactIds", label: words.with },
    { after: interaction.occurredOn ? dayText(interaction.occurredOn, locale) : interaction.occurredAt ?? "", field: interaction.occurredOn ? "interaction.occurredOn" : "interaction.occurredAt", label: words.day },
    { after: CHANNEL_WORDS[locale][interaction.channel]?.[interaction.direction] ?? CHANNEL_WORDS[locale].other.mutual, field: "interaction.channel", label: words.how },
  ];
  if (mentioned.length) rows.push({ after: words.mentioned(mentioned.join(words.join)), field: "contactIds", label: words.also });
  return { change: "create", record: words.record(set.title), rows };
}

const MEMO_UPDATE_WORDS: Record<CardLocale, { line: (title: string, details: string) => string; none: string; sentence: string; quote: (sentence: string) => string }> = {
  en: { line: (title, details) => `Note "${title}": record the interaction — ${details}`, none: "none recorded", quote: (sentence) => `"${sentence}"`, sentence: "From the note" },
  ja: { line: (title, details) => `メモ「${title}」にやり取りを記録：${details}`, none: "記録なし", quote: (sentence) => `「${sentence}」`, sentence: "メモの文" },
  zh: { line: (title, details) => `在笔记「${title}」上补记往来：${details}`, none: "未记录", quote: (sentence) => `「${sentence}」`, sentence: "原句" },
};

/** AG10: the line and rows a user reads for an interaction written on an existing memo. */
export function memoUpdateText(intent: MemoUpdateIntent, locale: CardLocale): string {
  const interaction = intent.set.interaction;
  const nameOf = (id: string) => intent.shown.names[id] ?? id;
  const mentioned = intent.shown.contactIds.filter((id) => !interaction.actualContactIds.includes(id)).map(nameOf);
  const when = interaction.occurredOn ? dayText(interaction.occurredOn, locale) : interaction.occurredAt ?? "";
  const how = CHANNEL_WORDS[locale][interaction.channel]?.[interaction.direction] ?? CHANNEL_WORDS[locale].other.mutual;
  const who = interaction.actualContactIds.map(nameOf).join(MEMO_DISPLAY[locale].join);
  const details = locale === "en" ? `with ${who}, ${when}, ${how}${mentioned.length ? `; ${mentioned.join(", ")} only mentioned` : ""}` : locale === "ja" ? `相手 ${who}、${when}、${how}${mentioned.length ? `（${mentioned.join("、")}は話に出ただけ）` : ""}` : `实际往来对象 ${who}，${when}，${how}${mentioned.length ? `（${mentioned.join("、")}只是提到）` : ""}`;
  return MEMO_UPDATE_WORDS[locale].line(intent.shown.title, details);
}

export function memoUpdateDisplay(intent: MemoUpdateIntent, locale: CardLocale): AgentCardOperationDisplayContract {
  const words = MEMO_DISPLAY[locale];
  const interaction = intent.set.interaction;
  const nameOf = (id: string) => intent.shown.names[id] ?? id;
  const before = intent.shown.before;
  const none = MEMO_UPDATE_WORDS[locale].none;
  const rows: AgentCardOperationDisplayContract["rows"][number][] = [
    { after: interaction.actualContactIds.map(nameOf).join(words.join), before: before ? before.actualContactIds.map(nameOf).join(words.join) : none, field: "interaction.actualContactIds", label: words.with },
    { after: interaction.occurredOn ? dayText(interaction.occurredOn, locale) : interaction.occurredAt ?? "", before: before?.occurredOn ? dayText(before.occurredOn, locale) : none, field: interaction.occurredOn ? "interaction.occurredOn" : "interaction.occurredAt", label: words.day },
    { after: CHANNEL_WORDS[locale][interaction.channel]?.[interaction.direction] ?? CHANNEL_WORDS[locale].other.mutual, before: before ? CHANNEL_WORDS[locale][before.channel]?.[before.direction] ?? none : none, field: "interaction.channel", label: words.how },
  ];
  const mentioned = intent.shown.contactIds.filter((id) => !interaction.actualContactIds.includes(id)).map(nameOf);
  if (mentioned.length) rows.push({ after: words.mentioned(mentioned.join(words.join)), field: "contactIds", label: words.also });
  if (intent.shown.sentence) rows.push({ after: MEMO_UPDATE_WORDS[locale].quote(intent.shown.sentence), field: "interaction.sentence", label: MEMO_UPDATE_WORDS[locale].sentence });
  return { change: "update", record: words.record(intent.shown.title), rows };
}

const WAITS_NOTE: Record<CardLocale, (items: number[]) => string> = {
  en: (items) => `Runs only after item ${items.join(" and ")} succeeds`,
  ja: (items) => `${items.join("・")} 件目が成功してから実行`,
  zh: (items) => `第${items.join("、")}项成功后才执行`,
};

const WAITS: Record<CardLocale, (items: number[]) => string> = {
  en: (items) => ` (runs only after item ${items.join(" and ")} succeeds)`,
  ja: (items) => `（${items.join("・")} 件目が成功してから実行）`,
  zh: (items) => `（第${items.join("、")}项成功后才执行）`,
};

/** The count sentence of a card: how many changes and how many additions ("修改1项，新增1项"; R03: no space between Chinese and a number). */
export function cardCountTitle(operations: readonly Pick<AgentActionOperationPayload, "capability">[], locale: CardLocale): string {
  const added = operations.filter((op) => op.capability === TODO_CREATE || op.capability === MEMO_CREATE).length;
  const changed = operations.length - added;
  if (locale === "en") return [changed ? `${changed} change${changed > 1 ? "s" : ""}` : "", added ? `${added} addition${added > 1 ? "s" : ""}` : ""].filter(Boolean).join(", ");
  if (locale === "ja") return [changed ? `変更 ${changed} 件` : "", added ? `追加 ${added} 件` : ""].filter(Boolean).join("、");
  return [changed ? `修改${changed}项` : "", added ? `新增${added}项` : ""].filter(Boolean).join("，");
}

function base(input: { actionId: string; revision: number; index: number; partId?: string }) {
  return {
    compensation: { supported: false },
    dependsOn: [] as string[],
    effects: [] as string[],
    idempotencyKey: `${input.actionId}:r${input.revision}:op${input.index + 1}`,
    operationId: `${input.actionId}:op${input.index + 1}`,
    partId: input.partId ?? "p1",
    payloadVersion: 1,
    riskLevel: "write" as const,
  };
}

/** One operation of a revision, frozen from its intent and the current data; null when an update's target is gone. */
export async function prepareCardOperation(input: {
  intent: CardOperationIntent;
  actionId: string;
  revision: number;
  index: number;
  reader: TodoReader;
  locale: CardLocale;
}): Promise<AgentActionOperationPayload | null> {
  const { intent } = input;
  if (intent.capability === MEMO_CREATE) {
    const set = intent.set;
    const after = { body: set.body, contactIds: [...set.contactIds], ...(set.interaction ? { interaction: { ...set.interaction, actualContactIds: [...set.interaction.actualContactIds] } } : {}), title: set.title };
    return {
      ...base({ ...input, partId: intent.partId }),
      after,
      capability: MEMO_CREATE,
      executorKey: MEMO_CREATE,
      operationType: "create_memo",
      // The executor writes these through the note service; extraction is suppressed (设计稿 §4).
      payload: { ...after, autoExtraction: "suppressed" },
      preconditions: { targetExists: false },
      display: memoCreateDisplay(set, input.locale),
      preview: memoCreateText(set, input.locale),
      shown: { names: { ...set.names } },
    };
  }
  if (intent.capability === MEMO_UPDATE) {
    const after = { interaction: { ...intent.set.interaction, actualContactIds: [...intent.set.interaction.actualContactIds] } };
    return {
      ...base({ ...input, partId: intent.partId }),
      after,
      before: { interaction: intent.shown.before },
      capability: MEMO_UPDATE,
      executorKey: MEMO_UPDATE,
      operationType: "update_memo",
      // The executor writes the interaction through the note service at this version; extraction stays suppressed.
      payload: { ...after, expectedVersion: intent.expectedVersion, noteId: intent.targetId },
      preconditions: { targetExists: true, versionToken: String(intent.expectedVersion) },
      display: memoUpdateDisplay(intent, input.locale),
      preview: memoUpdateText(intent, input.locale),
      shown: { ...intent.shown, names: { ...intent.shown.names }, contactIds: [...intent.shown.contactIds] },
      targetRef: { collection: "notes", id: intent.targetId },
    };
  }
  const op = await prepareTodoOperation({ actionId: input.actionId, index: input.index, intent, locale: input.locale, reader: input.reader, revision: input.revision });
  if (!op) return null;
  const partId = intent.partId ?? "p1";
  // AG06: the update's executor re-reads the record and checks what the card showed before it writes.
  const payload = op.capability === TODO_UPDATE ? { ...op.payload, before: { ...(op.before ?? {}) }, shown: { ...(op.shown ?? {}) } } : op.payload;
  return { ...op, partId, payload };
}

/** The intent an operation was frozen from (regeneration and editing keep it, 设计稿 §5.2). */
export function cardIntentOf(op: AgentActionOperationPayload, operations: readonly AgentActionOperationPayload[] = []): CardOperationIntent | null {
  const dependsOn = (op.dependsOn ?? []).map((id) => operations.findIndex((other) => other.operationId === id)).filter((index) => index >= 0);
  const extra = { ...(op.partId ? { partId: op.partId } : {}), ...(dependsOn.length ? { dependsOn } : {}) };
  if (op.capability === MEMO_CREATE) {
    const after = (op.after ?? {}) as Record<string, unknown>;
    const names = ((op.shown as Record<string, unknown> | undefined)?.names ?? {}) as Record<string, string>;
    return { ...extra, capability: MEMO_CREATE, set: { body: String(after.body ?? ""), contactIds: [...((after.contactIds as string[]) ?? [])], ...(after.interaction ? { interaction: after.interaction as NoteInteractionContract } : {}), names: { ...names }, title: String(after.title ?? "") } };
  }
  if (op.capability === MEMO_UPDATE && op.targetRef) {
    const after = (op.after ?? {}) as { interaction?: NoteInteractionContract };
    const shown = (op.shown ?? {}) as MemoUpdateIntent["shown"];
    const payload = (op.payload ?? {}) as { expectedVersion?: number };
    if (!after.interaction) return null;
    return { ...extra, capability: MEMO_UPDATE, expectedVersion: Number(payload.expectedVersion ?? 0), set: { interaction: after.interaction }, shown: { before: shown.before ?? null, contactIds: [...(shown.contactIds ?? [])], names: { ...(shown.names ?? {}) }, title: String(shown.title ?? ""), ...(shown.sentence ? { sentence: shown.sentence } : {}) }, targetId: op.targetRef.id };
  }
  const todo = todoIntentOf(op);
  return todo ? { ...todo, ...extra } : null;
}

/** Builds the operations of one revision; missing targets are reported; dependencies become operation ids. */
export async function buildCardOperationList(reader: TodoReader | null, input: { actionId: string; revision: number; locale: string; intents: readonly CardOperationIntent[] }): Promise<{ operations: AgentActionOperationPayload[]; missing: string[] }> {
  const locale = cardLocale(input.locale);
  const prepared: (AgentActionOperationPayload | null)[] = [];
  const missing: string[] = [];
  for (const [index, intent] of input.intents.entries()) {
    if (intent.capability === TODO_UPDATE && !reader) throw new Error("A to-do reader is required to prepare a to-do change.");
    const op = await prepareCardOperation({ actionId: input.actionId, index: prepared.filter(Boolean).length, intent, locale, reader: reader ?? { read: async () => null }, revision: input.revision });
    prepared.push(op);
    if (!op && intent.capability === TODO_UPDATE) missing.push(intent.targetId);
  }
  const operations: AgentActionOperationPayload[] = [];
  for (const [index, op] of prepared.entries()) {
    if (!op) continue;
    const waits = (input.intents[index].dependsOn ?? []).map((at) => prepared[at]).filter((item): item is AgentActionOperationPayload => Boolean(item));
    if (!waits.length) {
      operations.push(op);
      continue;
    }
    const positions = waits.map((item) => prepared.filter(Boolean).indexOf(item) + 1);
    operations.push({ ...op, dependsOn: waits.map((item) => item.operationId), ...(op.display ? { display: { ...op.display, note: WAITS_NOTE[locale](positions) } } : {}), preview: `${op.preview}${WAITS[locale](positions)}` });
  }
  return { missing, operations };
}

export { TODO_CREATE, TODO_UPDATE };
