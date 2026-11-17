/**
 * The answer's basis line and the links to the records it rests on (agent-design AG07: approved visual draft,
 * "按你11月12日记的笔记回答 打开 ›"; carried from AG06's review: the user could not reach the cited note).
 * Code writes the line from the verified citations (sourceRefs) and what was read of each record; no model
 * writes any of it, and a record not read in this turn gets no link. Wording stays plain: no "来源", no "证据".
 */
import type { AgentAnswerBasisContract, AgentAnswerLinkContract } from "../../../shared/contract/agent-v1";
import { localDayOf } from "../propose/dates";
import type { RecordView } from "../domains/types";
import type { ReplyLanguage } from "../route/handoff-copy";

export interface ReadSource {
  kind: AgentAnswerLinkContract["type"];
  id: string;
  title?: string;
  /** YYYY-MM-DD in the user's time zone (when the note was written or the contact happened). */
  day?: string;
  /** A memo's first person (the web opens notes on the person's page). */
  contactId?: string;
}

const text = (value: unknown) => (typeof value === "string" && value.trim() ? value.trim() : undefined);

/** What a link needs of a record read in this turn. */
export function readSourceOf(view: RecordView, timeZone: string): ReadSource | null {
  const fields = view.fields as Record<string, unknown>;
  const kind = view.kind as string;
  if (kind !== "memo" && kind !== "todo" && kind !== "schedule" && kind !== "contact" && kind !== "event") return null;
  const interaction = fields.interaction as { occurredOn?: unknown; occurredAt?: unknown } | undefined;
  const at = text(interaction?.occurredOn) ?? text(interaction?.occurredAt) ?? text(fields.createdAt) ?? text(fields.startsAt);
  const day = at ? (/^\d{4}-\d{2}-\d{2}$/u.test(at) ? at : Number.isFinite(Date.parse(at)) ? localDayOf(at, timeZone) : undefined) : undefined;
  const contactIds = Array.isArray(fields.contactIds) ? fields.contactIds.filter((id): id is string => typeof id === "string") : [];
  const title = text(fields.title) ?? text(fields.displayName);
  return { id: view.id, kind, ...(title ? { title } : {}), ...(day ? { day } : {}), ...(contactIds[0] ? { contactId: contactIds[0] } : {}) };
}

const EN_MONTH = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function dayWords(day: string, language: ReplyLanguage): string {
  const month = Number(day.slice(5, 7));
  const date = Number(day.slice(8, 10));
  if (language === "en") return `${EN_MONTH[month - 1]} ${date}`;
  // R03 style guide: no space between Chinese and digits.
  return `${month}月${date}日`;
}

const KIND: Record<ReplyLanguage, Record<ReadSource["kind"], string>> = {
  en: { contact: "contact", event: "event", memo: "note", schedule: "schedule entry", todo: "to-do" },
  ja: { contact: "連絡先", event: "イベント", memo: "メモ", schedule: "予定", todo: "タスク" },
  zh: { contact: "联系人资料", event: "活动", memo: "笔记", schedule: "日程", todo: "待办" },
};

/** A note is named by its day (the draft: "11 月 12 日的笔记"), other records by their title. */
function named(source: ReadSource, language: ReplyLanguage): string {
  const kind = KIND[language][source.kind];
  const byDay = source.kind === "memo" && source.day;
  if (source.title && !byDay) return language === "en" ? `${kind} "${source.title}"` : `${kind}「${source.title}」`;
  if (source.day) return language === "en" ? `note of ${dayWords(source.day, language)}` : language === "ja" ? `${dayWords(source.day, language)}の${kind}` : `${dayWords(source.day, language)}的${kind}`;
  return kind;
}

function capital(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function lineFor(sources: readonly ReadSource[], language: ReplyLanguage): string {
  if (sources.length === 1) {
    const [only] = sources;
    if (only.kind === "memo" && only.day) {
      const day = dayWords(only.day, language);
      return language === "en" ? `Based on your note from ${day}` : language === "ja" ? `${day}のメモをもとに回答` : `按你${day}记的笔记回答`;
    }
    const name = named(only, language);
    return language === "en" ? `Based on your ${name}` : language === "ja" ? `${name}をもとに回答` : `按你的${name}回答`;
  }
  const memos = sources.every((source) => source.kind === "memo");
  if (language === "en") return `Based on ${sources.length} of your ${memos ? "notes" : "records"}`;
  if (language === "ja") return `${memos ? "メモ" : "記録"} ${sources.length}件をもとに回答`;
  return `按你的${sources.length}条${memos ? "笔记" : "记录"}回答`;
}

/** The basis of an answer from its verified citations; null when nothing cited can be linked. */
export function basisOf(sourceRefs: readonly string[], sources: ReadonlyMap<string, ReadSource>, language: ReplyLanguage): AgentAnswerBasisContract | null {
  const known = sourceRefs.map((ref) => sources.get(ref)).filter((source): source is ReadSource => Boolean(source));
  if (!known.length) return null;
  const links: AgentAnswerLinkContract[] = known.map((source) => {
    const label = named(source, language);
    return { ...(source.contactId ? { contactId: source.contactId } : {}), id: source.id, label: language === "en" ? capital(label) : label, type: source.kind };
  });
  return { links, text: lineFor(known, language) };
}
