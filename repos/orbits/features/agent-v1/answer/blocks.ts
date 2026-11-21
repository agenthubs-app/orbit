/**
 * The answer laid out in blocks (agent-design AG19; approved visual draft 2026-11-19, D1–D6): paragraphs, points, record
 * cards and the grey note of what was not done. Code does the layout — a model only fills plain fields (the answer
 * itself, paragraphs, points) and whatever Markdown it writes is taken out here. `answer.text` stays the complete
 * text version (clients up to App build 18 read only that); the blocks say the same things in the same order.
 *
 * - textBlocks(): code's own line convention read back into blocks (a line is a paragraph, lines that start with the
 *   point mark are points, the first line of a model answer with more after it is the conclusion);
 * - recordOfView(): one record card from a record read this turn (the three lines are written here, in the reply
 *   language, dates with their weekday);
 * - recordsBlock(): a group of cards, five shown first, the rest under "还有 N 条" (D2);
 * - noteItemOf(): a "not done" sentence split into the user's words, the reason and the thing to do now.
 */
import type {
  AgentAnswerBlockContract,
  AgentAnswerContract,
  AgentAnswerNoteItemContract,
  AgentAnswerPointContract,
  AgentAnswerRecordContract,
  AgentAnswerRecordKind,
} from "../../../shared/contract/agent-v1";
import type { RecordView } from "../domains/types";
import { dayWordsOf, localParts, whenWordsOf, type Language } from "../functions/copy";
import { ALL_DAY_WORDS } from "../domains/private-event/ops";

export type AnswerBlock = AgentAnswerBlockContract;

/** D2: how many cards of a list are shown before "还有 N 条". */
export const CARDS_SHOWN_FIRST = 5;
/** Board 5 note 6: how many small cards of mentioned records are shown first. */
export const MENTIONED_SHOWN_FIRST = 3;
/** Board 5 note 5: at most five points; more are kept as paragraphs. */
export const POINTS_MAX = 5;

/** The mark code puts before a point in the text version. */
export const pointMark = (language: Language) => (language === "en" ? "- " : "・");
const POINT_LINE = /^\s*(?:[・•●▪◦]|[-–—*+]\s)\s*/u;

/* ── Markdown out ──────────────────────────────────────────────────── */

/**
 * D4: the symbols a model writes for emphasis, headings, code and lists are taken out; the words stay. A list marker at
 * the start of a line becomes code's point mark, so the line is still laid out as a point.
 */
export function stripMarkdown(text: string, language: Language = "zh"): string {
  if (!text) return text;
  const mark = pointMark(language);
  return text
    .split("\n")
    .map((line) => {
      let out = line.replace(/^\s{0,3}#{1,6}\s*/u, "").replace(/^\s{0,3}>\s?/u, "");
      out = out.replace(/^\s*[*+]\s+/u, mark).replace(/^\s*-\s+/u, mark);
      out = out.replace(/\*{1,3}|`+|~~/gu, "").replace(/(^|[^\p{L}\p{N}])_{1,2}([^_\n]+?)_{1,2}(?![\p{L}\p{N}])/gu, "$1$2");
      // A heading marker in the middle of a line ("结论 ## 细节") and a rule line ("---") are layout symbols too.
      out = out.replace(/\s#{1,6}\s+/gu, " ").replace(/^\s*(?:-{3,}|={3,}|_{3,})\s*$/u, "");
      return out.replace(/[ \t]+$/u, "");
    })
    .join("\n")
    .replace(/\n{3,}/gu, "\n\n")
    .trim();
}

/** True when a text still shows a Markdown symbol (the eval's check of `answer.text`). */
export function hasMarkdownSymbols(text: string): boolean {
  return /\*|`|^\s{0,3}#{1,6}\s/mu.test(text);
}

/* ── text ↔ blocks ─────────────────────────────────────────────────── */

const HEAD_MAX: Record<Language, number> = { en: 48, ja: 18, zh: 18 };

/** "第1回：先去能判断质量" → head 第1回. Only a short label with no sentence punctuation counts as a head. */
export function pointOf(line: string, language: Language): AgentAnswerPointContract {
  const text = line.replace(POINT_LINE, "").trim();
  // The label ends at a full-width colon, or at a colon followed by a space — never at the colon of a time ("10:00").
  const at = text.search(/：|:\s/u);
  if (at > 0 && at <= HEAD_MAX[language]) {
    const head = text.slice(0, at).trim();
    const rest = text.slice(at + 1).trim();
    if (head && rest && !/[。．.!！?？，,；;]/u.test(head) && !/^\d{1,2}$/u.test(head)) return { head, text: rest };
  }
  return { text };
}

/** A point as one line of the text version. */
export function pointLine(point: AgentAnswerPointContract, language: Language): string {
  return `${pointMark(language)}${point.head ? `${point.head}${language === "en" ? ": " : "："}` : ""}${point.text}`;
}

const CONCLUSION_MAX: Record<Language, number> = { en: 240, ja: 90, zh: 90 };

/**
 * A text in code's line convention as blocks. `conclusion`: the text is a model's answer — its first line is the
 * conclusion when more follows (a one- or two-sentence answer stays one plain paragraph, board 5 note 5).
 */
export function textBlocks(text: string, language: Language, options: { conclusion?: boolean } = {}): AnswerBlock[] {
  const lines = text.split("\n").map((line) => line.trim()).filter(Boolean);
  const blocks: AnswerBlock[] = [];
  let points: AgentAnswerPointContract[] = [];
  const flush = () => {
    if (!points.length) return;
    // A single "point", or more than five, reads better as paragraphs.
    if (points.length === 1 || points.length > POINTS_MAX) for (const point of points) blocks.push({ text: point.head ? `${point.head}${language === "en" ? ": " : "："}${point.text}` : point.text, type: "paragraph" });
    else blocks.push({ items: points, type: "points" });
    points = [];
  };
  for (const line of lines) {
    if (POINT_LINE.test(line)) {
      points.push(pointOf(line, language));
      continue;
    }
    flush();
    blocks.push({ text: line, type: "paragraph" });
  }
  flush();
  const first = blocks[0];
  if (options.conclusion && blocks.length > 1 && first?.type === "paragraph" && first.text.length <= CONCLUSION_MAX[language]) blocks[0] = { text: first.text, type: "conclusion" };
  return blocks;
}

/** A model's structured answer (D4: 结论、段落、要点) as the text version, in code's line convention; null when it gave none. */
export function composeStructured(segment: { lead?: unknown; body?: unknown; text?: unknown }, language: Language): string | null {
  const clean = (value: unknown) => (typeof value === "string" ? stripMarkdown(value, language).replace(/\s*\n\s*/gu, " ").trim() : "");
  const lead = clean(segment.lead);
  const lines: string[] = lead ? [lead] : [];
  for (const piece of Array.isArray(segment.body) ? (segment.body as Record<string, unknown>[]) : []) {
    if (!piece || typeof piece !== "object") continue;
    const paragraph = clean(piece.p);
    if (paragraph) lines.push(paragraph);
    for (const point of Array.isArray(piece.points) ? (piece.points as Record<string, unknown>[]) : []) {
      if (!point || typeof point !== "object") continue;
      const text = clean(point.text).replace(POINT_LINE, "");
      const head = clean(point.head).replace(/[：:]\s*$/u, "");
      if (text) lines.push(pointLine({ ...(head ? { head } : {}), text }, language));
    }
  }
  if (lines.length) return lines.join("\n");
  // Not in the structure (an older shape, or a model that ignored it): the whole text, symbols out — never lost.
  const whole = typeof segment.text === "string" ? stripMarkdown(segment.text, language) : "";
  return whole || null;
}

/* ── record cards ──────────────────────────────────────────────────── */

const WORDS = {
  caption: {
    en: { attendance: "Events you went to", contact: "Contacts mentioned", event: "Events mentioned", memo: "Notes mentioned", mixed: "Records mentioned", schedule: "Schedule items mentioned", todo: "To-dos mentioned" },
    ja: { attendance: "回答に出てきた「行った」記録", contact: "回答に出てきた連絡先", event: "回答に出てきたイベント", memo: "回答に出てきたメモ", mixed: "回答に出てきた記録", schedule: "回答に出てきた予定", todo: "回答に出てきたタスク" },
    zh: { attendance: "提到的「我去过」", contact: "提到的联系人", event: "提到的活动", memo: "提到的笔记", mixed: "提到的记录", schedule: "提到的日程", todo: "提到的待办" },
  },
  done: { en: "Done", ja: "完了", zh: "已完成" },
  due: { en: "Due", ja: "期限", zh: "截止" },
  lastInteraction: { en: "Last recorded interaction", ja: "最後のやり取り", zh: "最近一次往来" },
  less: { en: "Show less", ja: "閉じる", zh: "收起" },
  noteTitle: { en: "Not done this time", ja: "今回できなかったこと", zh: "这次没做的部分" },
  ownPrivate: { en: "Your own record · private", ja: "自分の記録 · プライベート", zh: "自己记的 · 私人" },
  planned: { en: "Planned", ja: "予定日", zh: "计划日" },
  privateEvent: { en: "Private event", ja: "プライベートイベント", zh: "私人活动" },
  untimed: { en: "Time not announced", ja: "開始時間未公開", zh: "时间未公布" },
} as const;

/** The time on a card, as the draft writes it: "3月22日（周日）18:00" (no space after the weekday in Chinese and Japanese). */
function whenOnCard(iso: string, timeZone: string, language: Language): string {
  const words = whenWordsOf(iso, timeZone, language);
  return language === "en" ? words : words.replace(/）\s+/u, "）");
}

/**
 * Repair round 1: a to-do with no deadline whose planned day has passed says so on its lower line. The draft draws the
 * late style (the alert colour) only for a passed deadline ("已过期2天") and is silent on planned days, so this line keeps
 * the ordinary colour; the list's lead counts it with the overdue ones.
 */
export const PLANNED_PASSED: Record<Language, string> = { en: "Planned day has passed", ja: "予定日を過ぎています", zh: "计划日已过" };

const str = (value: unknown) => (typeof value === "string" && value.trim() ? value.trim() : undefined);
const strs = (value: unknown) => (Array.isArray(value) ? value.filter((item): item is string => typeof item === "string" && Boolean(item)) : []);

/** "已过期2天" / "2 days overdue" / "2日超過". */
export function overdueWords(language: Language, dueAt: string, now: string): string {
  const days = Math.floor((Date.parse(now) - Date.parse(dueAt)) / 86_400_000);
  return { en: days >= 1 ? `${days} day${days > 1 ? "s" : ""} overdue` : "Overdue", ja: days >= 1 ? `${days}日超過` : "期限超過", zh: days >= 1 ? `已过期${days}天` : "已过期" }[language];
}

function clip(text: string, max: number): string {
  const flat = text.replace(/\s+/gu, " ").trim();
  return flat.length > max ? `${flat.slice(0, max - 1)}…` : flat;
}

/** The first sentence of a note's body, for the card's lower line. */
function firstSentence(body: string): string {
  const flat = body.replace(/\s+/gu, " ").trim();
  const end = flat.search(/[。！？!?]|\.(?:\s|$)/u);
  return clip(end > 0 ? flat.slice(0, end) : flat, 48);
}

export interface CardContext {
  language: Language;
  timeZone: string;
  now: string;
  /** Names of records read this turn (a note's first person on its card). */
  nameOf?: (id: string) => string | undefined;
}

/** The card kind and the id a client opens, of a record ref ("event:attendance:…" is «我去过», "event:private_event:…" a private event). */
export function cardIdentityOf(view: Pick<RecordView, "kind" | "id">): { kind: AgentAnswerRecordKind; id: string; eventKind?: "platform" | "private" } {
  if (view.kind === "event") {
    if (view.id.startsWith("attendance:")) return { id: view.id, kind: "attendance" };
    if (view.id.startsWith("private_event:")) return { eventKind: "private", id: view.id, kind: "event" };
    return { eventKind: "platform", id: view.id, kind: "event" };
  }
  return { id: view.id, kind: view.kind };
}

/** One card from a record read this turn. The three lines are code's, in the reply language. */
export function recordOfView(view: RecordView, context: CardContext): AgentAnswerRecordContract {
  const { language, now, timeZone } = context;
  const fields = view.fields as Record<string, unknown>;
  const identity = cardIdentityOf(view);
  const title = str(fields.title) ?? str(fields.displayName) ?? "";
  if (identity.kind === "contact") {
    const top = [str(fields.company), str(fields.headline)].filter(Boolean).join(" · ");
    return { id: view.id, kind: "contact", title, ...(top ? { top } : {}) };
  }
  if (identity.kind === "todo") {
    const dueAt = str(fields.dueAt);
    const planned = str(fields.plannedDate);
    const done = fields.status === "completed";
    const top = dueAt ? `${WORDS.due[language]} ${whenOnCard(dueAt, timeZone, language)}` : planned ? `${WORDS.planned[language]} ${dayWordsOf(planned, language)}` : undefined;
    const late = Boolean(dueAt && !done && dueAt < now);
    const plannedPassed = Boolean(!dueAt && planned && !done && planned < localParts(now, timeZone).day);
    const sub = done ? WORDS.done[language] : late ? overdueWords(language, dueAt!, now) : plannedPassed ? PLANNED_PASSED[language] : dueAt && planned ? `${WORDS.planned[language]} ${dayWordsOf(planned, language)}` : undefined;
    const contactId = strs(fields.contactIds)[0] ?? str(fields.contactId);
    return { id: view.id, kind: "todo", title, ...(top ? { top } : {}), ...(sub ? { sub } : {}), ...(late ? { subTone: "late" as const } : {}), ...(contactId ? { contactId } : {}) };
  }
  if (identity.kind === "memo") {
    const interaction = fields.interaction as { occurredOn?: unknown; occurredAt?: unknown } | undefined;
    const at = str(interaction?.occurredOn) ?? str(interaction?.occurredAt) ?? str(fields.createdAt);
    const day = at ? (/^\d{4}-\d{2}-\d{2}$/u.test(at) ? at : Number.isFinite(Date.parse(at)) ? localParts(at, timeZone).day : undefined) : undefined;
    const body = str(fields.body) ?? "";
    const contactId = strs(fields.contactIds)[0] ?? strs((fields.interaction as { actualContactIds?: unknown } | undefined)?.actualContactIds)[0];
    const person = contactId ? context.nameOf?.(contactId) : undefined;
    const said = title ? firstSentence(body) : "";
    const sub = [person, said].filter(Boolean).join(" · ");
    return { id: view.id, kind: "memo", title: title || clip(body, 24), ...(day ? { top: dayWordsOf(day, language) } : {}), ...(sub ? { sub } : {}), ...(contactId ? { contactId } : {}) };
  }
  if (identity.kind === "schedule") {
    const startsAt = str(fields.startsAt);
    const valid = startsAt && Number.isFinite(Date.parse(startsAt)) ? startsAt : undefined;
    const day = valid ? localParts(valid, timeZone).day : undefined;
    // Hotfix 2026-11-20 (AE-UND-015: 「10時から11時まで」 became a card showing only 10:00): the card shows start to end.
    const endsAt = str(fields.endsAt);
    const end = endsAt && Number.isFinite(Date.parse(endsAt)) && Date.parse(endsAt) > Date.parse(valid ?? "") ? endsAt : undefined;
    const range = valid && end ? (localParts(end, timeZone).day === day ? `–${localParts(end, timeZone).time}` : ` – ${whenOnCard(end, timeZone, language)}`) : "";
    const top = valid ? (fields.allDay === true ? dayWordsOf(day!, language) : `${whenOnCard(valid, timeZone, language)}${range}`) : undefined;
    const place = str(fields.location);
    return { id: view.id, kind: "schedule", title, ...(top ? { top } : {}), ...(place ? { sub: place } : {}), ...(day ? { day } : {}) };
  }
  if (identity.kind === "attendance") {
    const day = str(fields.attendedOn);
    const own = str(fields.eventRefKind) === "private" || str(fields.kind) === "private_event";
    const sub = own ? WORDS.ownPrivate[language] : str(fields.selfNote) ? clip(str(fields.selfNote)!, 48) : undefined;
    const eventKind = str(fields.eventRefKind) === "private" ? "private" as const : str(fields.eventRefKind) === "platform" ? "platform" as const : undefined;
    return { id: view.id, kind: "attendance", title, ...(day ? { day, top: dayWordsOf(day, language) } : {}), ...(sub ? { sub } : {}), ...(eventKind ? { eventKind } : {}), ...(str(fields.eventRefId) ? { eventId: str(fields.eventRefId)! } : {}) };
  }
  const startsAt = str(fields.startsAt);
  const timed = startsAt && Number.isFinite(Date.parse(startsAt)) ? startsAt : undefined;
  // AG20a: an all-day private event shows its day and 全天 where the time would be (never 00:00).
  const top = timed ? (fields.allDay === true ? `${dayWordsOf(localParts(timed, timeZone).day, language)}${language === "en" ? " " : ""}${ALL_DAY_WORDS[language]}` : whenOnCard(timed, timeZone, language)) : WORDS.untimed[language];
  const place = str(fields.location) ?? (identity.eventKind === "private" ? WORDS.privateEvent[language] : undefined);
  return { id: view.id, kind: "event", title, top, ...(place ? { sub: place } : {}), ...(identity.eventKind ? { eventKind: identity.eventKind } : {}) };
}

/** "最近一次往来 8月12日（周三）": the lower line of a contact card ordered by the last recorded interaction. */
export function lastInteractionWords(language: Language, day: string): string {
  return `${WORDS.lastInteraction[language]} ${dayWordsOf(day, language)}`;
}

/** The unit after "还有 N": 位 for people, 场 for events, 条 otherwise (board 3 note 1). */
function moreLabel(language: Language, kinds: ReadonlySet<AgentAnswerRecordKind>, hidden: number): string {
  const only = kinds.size === 1 ? [...kinds][0] : null;
  if (language === "en") return `${hidden} more`;
  if (language === "ja") return `ほか ${hidden} ${only === "contact" ? "人" : "件"}`;
  return `还有 ${hidden} ${only === "contact" ? "位" : only === "event" || only === "attendance" ? "场" : "条"}`;
}

/** A group of cards; the same record never twice. `mini`: the two-line cards of mentioned records, with a caption. */
export function recordsBlock(items: readonly AgentAnswerRecordContract[], language: Language, options: { size?: "full" | "mini" } = {}): AnswerBlock | null {
  const seen = new Set<string>();
  const unique = items.filter((item) => {
    const key = `${item.kind}:${item.id}`;
    if (!item.id || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  if (!unique.length) return null;
  const mini = options.size === "mini";
  const shown = Math.min(unique.length, mini ? MENTIONED_SHOWN_FIRST : CARDS_SHOWN_FIRST);
  const kinds = new Set(unique.map((item) => item.kind));
  const caption = mini ? WORDS.caption[language][kinds.size === 1 ? [...kinds][0] : "mixed"] : undefined;
  return {
    items: unique,
    shown,
    type: "records",
    ...(mini ? { size: "mini" as const } : {}),
    ...(caption ? { caption } : {}),
    ...(unique.length > shown ? { lessLabel: WORDS.less[language], moreLabel: moreLabel(language, kinds, unique.length - shown) } : {}),
  };
}

/** The records already on a card in these blocks, as "kind:id". */
export function cardedIn(blocks: readonly AnswerBlock[]): Set<string> {
  const out = new Set<string>();
  for (const block of blocks) if (block.type === "records") for (const item of block.items) out.add(`${item.kind}:${item.id}`);
  return out;
}

/* ── the note of what was not done ─────────────────────────────────── */

/** A closing sentence the user can act on right away (code's own fixed sentences end with one). */
const ACTION: Record<Language, RegExp> = {
  en: /^(?:Attach|Please|Send it again|Choose|Could you|I suggest|Say|Pick|Tell me)\b|\bsend it again\b|\btry again\b/iu,
  ja: /^(?:@|もう一度|お名前|名前|フルネーム|必要なら|ご自身|少し時間)|(?:ください|お試しください|おすすめします)。?$/u,
  zh: /^(?:用 ?@|再发|请再|请重新|可以|建议|如果还需要|说「)/u,
};

function sentencesOf(text: string): string[] {
  return (text.match(/[^。！？!?]+(?:[。！？!?]+|$)|[^.]+(?:\.(?:\s+|$)|$)/gu) ?? [text]).map((piece) => piece.trim()).filter(Boolean);
}

/**
 * Board 4 note 3: each entry starts with the user's own words, then why it was not done; the sentence to act on now is
 * set apart. Code's sentences start with the quote (「…」：), which is cut off here and given on its own.
 */
export function noteItemOf(line: string, quote: string | null, language: Language): AgentAnswerNoteItemContract {
  let text = line.trim();
  let said: string | undefined;
  if (quote) {
    for (const quoted of [`「${quote}」`, `"${quote}"`, `“${quote}”`]) {
      if (!text.startsWith(quoted)) continue;
      said = quote;
      text = text.slice(quoted.length).replace(/^(?:（[^）]*）| \([^)]*\))?\s*[：:]?\s*/u, "");
      break;
    }
    if (!said) said = quote;
  }
  // Japanese and English sentences read "「…」は…" / "… was not handled": keep them whole when cutting leaves a fragment.
  if (said && /^(?:は|が|の|を|was\b|is\b|has\b)/u.test(text)) return { quote: said, text: line.trim() };
  const sentences = language === "en" ? text.split(/(?<=[.!?])\s+(?=[A-Z@"])/u) : sentencesOf(text);
  if (sentences.length >= 2) {
    const last = sentences[sentences.length - 1];
    if (ACTION[language].test(last)) return { ...(said ? { quote: said } : {}), action: last, text: sentences.slice(0, -1).join(language === "en" ? " " : "") };
  }
  return { ...(said ? { quote: said } : {}), text };
}

export function noteBlock(items: readonly AgentAnswerNoteItemContract[], language: Language): AnswerBlock | null {
  const kept = items.filter((item) => item.text.trim());
  return kept.length ? { items: kept, title: WORDS.noteTitle[language], type: "note" } : null;
}

/* ── joining ───────────────────────────────────────────────────────── */

/** A resumed request keeps what it showed and the continuation follows it; one note at the end, a record on one card only. */
export function joinBlocks(previous: Pick<AgentAnswerContract, "blocks" | "text">, next: Pick<AgentAnswerContract, "blocks" | "text">, language: Language): AnswerBlock[] | undefined {
  if (!previous.blocks?.length && !next.blocks?.length) return undefined;
  const all = [...(previous.blocks ?? textBlocks(previous.text, language)), ...(next.blocks ?? textBlocks(next.text, language))];
  const notes = all.filter((block): block is Extract<AnswerBlock, { type: "note" }> => block.type === "note");
  const rest = all.filter((block) => block.type !== "note");
  const seen = new Set<string>();
  const out: AnswerBlock[] = [];
  for (const block of rest) {
    if (block.type !== "records") {
      out.push(block);
      continue;
    }
    const items = block.items.filter((item) => !seen.has(`${item.kind}:${item.id}`));
    for (const item of items) seen.add(`${item.kind}:${item.id}`);
    const again = recordsBlock(items, language, { size: block.size ?? "full" });
    if (again) out.push(again);
  }
  // AG14 UI: a memory note (it ends in 「去设置 ›」 and has its own title) stays a note of its own.
  out.push(...notes.filter((note) => note.go));
  const plain = notes.filter((note) => !note.go);
  if (plain.length) out.push({ items: plain.flatMap((note) => note.items), title: plain[0].title, type: "note" });
  return out;
}

/** The language a stored answer was written in, from its text (for joining a resumed answer). */
export function languageOfText(text: string): Language {
  if (/[぀-ゟ゠-ヿ]/u.test(text)) return "ja";
  if (/[㐀-䶿一-鿿]/u.test(text)) return "zh";
  return "en";
}

/* ── what the answer step is told ──────────────────────────────────── */

/**
 * D4: the model fills plain fields — the answer itself, paragraphs, points — and code lays them out. These lines go into
 * both answer prompts; whatever comes back outside this shape is still delivered, as plain paragraphs, symbols out.
 */
export const ANSWER_LAYOUT_RULES: readonly string[] = [
  "Layout: you fill plain fields and code does the layout.",
  '- "lead": the answer itself in one sentence (the conclusion or the recommendation).',
  '- "body": what follows, in reading order — a list of {"p": "<one short paragraph about one thing>"} and {"points": [{"head": "<a few words naming the point>", "text": "<one or two sentences>"}]}. Use points only for two to five parallel items. Leave "body" empty ([]) when one or two sentences answer the item.',
  "- Every field is plain text: no Markdown, no *, #, backticks, no list markers or numbering, no line breaks.",
];

export const ANSWER_SEGMENT_SHAPE = '"lead": "<the answer itself, one sentence>", "body": [{"p": "<paragraph>"}, {"points": [{"head": "<label>", "text": "<sentence>"}]}]';

const PLAIN_MAX: Record<Language, number> = { en: 280, ja: 90, zh: 90 };

/**
 * D4, board 5 note 5: "只有一两句的回答不硬拆". A free-text reply (the first layer's plain-chat reply) of one or two
 * sentences is shown as it is; a longer one has no structure for code to lay out, so the answer step writes it again in
 * the plain fields (conclusion, paragraphs, points). Code decides it from the text alone.
 */
export function needsLayout(text: string, language: Language): boolean {
  const flat = text.trim();
  if (!flat) return false;
  if (/\n/u.test(flat) || flat.length > PLAIN_MAX[language]) return true;
  const sentences = flat.split(language === "en" ? /(?<=[.!?])\s+/u : /(?<=[。！？!?])/u).filter((piece) => piece.trim());
  return sentences.length > 2;
}



/**
 * Repair round 1 (judges, AE-BND-005 / AE-CON-004 / AE-XL-006): whenever a stored answer's text is rewritten (a card
 * frozen again changes its line), the same words are rewritten in its blocks — the two never disagree. Every text a
 * block shows is covered: paragraphs, the conclusion, points, the note.
 */
export function replaceInBlocks(blocks: readonly AnswerBlock[], from: string, to: string): AnswerBlock[] {
  if (!from || from === to) return [...blocks];
  const swap = (text: string) => text.split(from).join(to);
  return blocks.map((block): AnswerBlock => {
    if (block.type === "conclusion" || block.type === "paragraph") return { ...block, text: swap(block.text) };
    if (block.type === "points") return { ...block, items: block.items.map((item) => ({ ...item, ...(item.head ? { head: swap(item.head) } : {}), text: swap(item.text) })) };
    if (block.type === "note") return { ...block, items: block.items.map((item) => ({ ...item, text: swap(item.text), ...(item.action ? { action: swap(item.action) } : {}) })) };
    return block;
  });
}

/**
 * Repair round 1: where a record stands in a list code writes — schedule items, events and «我去过» by their time, to-dos
 * by deadline then planned day (none last), notes by their day. The list is then in the order a person reads a calendar
 * or a to-do list, whatever order the read returned the records in.
 */
export function listSortKey(view: RecordView): string {
  const fields = view.fields as Record<string, unknown>;
  if (view.kind === "schedule" || view.kind === "event") return str(fields.startsAt) ?? str(fields.attendedOn) ?? "9999";
  if (view.kind === "todo") return str(fields.dueAt) ?? (str(fields.plannedDate) ? `${str(fields.plannedDate)}T23:59` : "9999");
  if (view.kind === "memo") {
    const interaction = fields.interaction as { occurredOn?: unknown; occurredAt?: unknown } | undefined;
    return str(interaction?.occurredOn) ?? str(interaction?.occurredAt) ?? str(fields.createdAt) ?? "";
  }
  return "";
}

/** Notes are listed newest first; everything else earliest first. A record with no key keeps the place the read gave it. */
export function inListOrder<T extends { kind: string; key: string; index: number }>(items: readonly T[]): T[] {
  const kinds = new Set(items.map((item) => item.kind));
  if (kinds.size !== 1 || items.some((item) => !item.key)) return [...items].sort((left, right) => left.index - right.index);
  const newestFirst = kinds.has("memo");
  return [...items].sort((left, right) => (left.key === right.key ? left.index - right.index : (left.key < right.key ? -1 : 1) * (newestFirst ? -1 : 1)));
}
