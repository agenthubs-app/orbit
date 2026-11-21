/**
 * What the answer step gets of a record (agent-design AG05, PLANNER 易错边界 2 and 8): a short handle,
 * a header code writes (kind, dates with weekday, who it is about), and the text cut into numbered
 * sentences. Fields are the whitelisted ones only; dates are in the user's time zone; an open to-do past
 * its due time is marked overdue by code. Record text is data, not instructions.
 */
import type { RecordView } from "../domains/types";
import { localDayOf, resolveSaidDate } from "../propose/dates";
import { splitSentences, type Sentence } from "../text/sentences";
import type { Material } from "./schema";

const WEEKDAY = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/** "2026-11-12 (Thu) 18:30" in the time zone; a plain date stays a date. */
export function formatWhen(value: string | undefined | null, timeZone: string, withTime = true): string {
  if (!value) return "—";
  if (/^\d{4}-\d{2}-\d{2}$/u.test(value)) {
    const day = new Date(`${value}T00:00:00Z`).getUTCDay();
    return `${value} (${WEEKDAY[day]})`;
  }
  const at = new Date(value);
  if (!Number.isFinite(at.getTime())) return value;
  const parts = Object.fromEntries(new Intl.DateTimeFormat("en-CA", { day: "2-digit", hour: "2-digit", hourCycle: "h23", minute: "2-digit", month: "2-digit", timeZone, weekday: "short", year: "numeric" }).formatToParts(at).map((part) => [part.type, part.value]));
  return `${parts.year}-${parts.month}-${parts.day} (${parts.weekday})${withTime ? ` ${parts.hour}:${parts.minute}` : ""}`;
}

export interface MaterialContext {
  timeZone: string;
  now: string;
  /** Names of contacts read in this request (id → name). */
  names: ReadonlyMap<string, string>;
  /** A schedule item's occurrence inside the asked range (a repeating series). */
  occurrence?: string | null;
}

const text = (value: unknown) => (typeof value === "string" && value.trim() ? value.trim() : null);
const numbered = (lines: (string | null)[]): Sentence[] => lines.filter((line): line is string => Boolean(line)).map((line, index) => ({ id: index + 1, text: line }));

export function materialOf(view: RecordView, partId: string, handle: string, context: MaterialContext): Material {
  const f = view.fields as Record<string, unknown>;
  const names = (ids: unknown) => (Array.isArray(ids) ? ids.map((id) => context.names.get(String(id))).filter(Boolean).join(", ") : "");
  // AG13: linked events by their titles ("platform:<id>" / "private:<id>"); a private one is marked as the user's own.
  const eventNames = (refs: unknown) => (Array.isArray(refs) ? refs.map((ref) => { const title = context.names.get(String(ref)); return title ? (String(ref).startsWith("private:") ? `${title} (your own private event)` : title) : null; }).filter(Boolean).join(", ") : "");
  let header: string;
  let sentences: Sentence[];
  let at: string | null = null;
  let profile: Material["profile"];
  switch (view.kind) {
    case "memo": {
      const interaction = f.interaction as { channel: string; direction: string; occurredOn?: string; occurredAt?: string; actualContactIds: string[] } | undefined;
      at = text(interaction?.occurredAt) ?? text(interaction?.occurredOn) ?? text(f.createdAt);
      const about = names(f.contactIds);
      header = [
        `memo${text(f.title) ? ` "${text(f.title)}"` : ""}, written ${formatWhen(text(f.createdAt), context.timeZone)}`,
        about ? `linked to ${about}` : null,
        eventNames(f.eventRefs) ? `linked to the events ${eventNames(f.eventRefs)}` : null,
        interaction ? `records an actual ${interaction.channel} (${interaction.direction}) with ${names(interaction.actualContactIds) || "a linked contact"} on ${formatWhen(interaction.occurredAt ?? interaction.occurredOn, context.timeZone, Boolean(interaction.occurredAt))}` : null,
        Number(f.version) > 1 ? `version ${f.version}, last edited ${formatWhen(text(f.updatedAt), context.timeZone)}` : null,
      ].filter(Boolean).join("; ");
      sentences = splitSentences(String(f.body ?? ""));
      // AG21c (R58): a relative day in a note ("by Friday", "明天", "来週の水曜") counts from the day the note was written, not
      // from today; code works it out once (the same rule in every language) and says whether it has passed.
      const written = text(f.createdAt);
      if (written) sentences = [...sentences, ...noteDayLines(sentences, written, context)];
      break;
    }
    case "todo": {
      const open = f.status === "open";
      const due = text(f.dueAt);
      const overdue = open && due && Date.parse(due) < Date.parse(context.now) ? " — overdue" : "";
      header = `to-do, last updated ${formatWhen(text(f.updatedAt), context.timeZone)}`;
      at = text(f.updatedAt);
      sentences = numbered([
        `Title: ${text(f.title) ?? "—"}`,
        `Status: ${text(f.status) ?? "—"}${f.completedAt ? ` (completed ${formatWhen(text(f.completedAt), context.timeZone)})` : ""}`,
        text(f.plannedDate) ? `Planned date: ${formatWhen(text(f.plannedDate), context.timeZone)}` : "Planned date: none",
        due ? `Due: ${formatWhen(due, context.timeZone)}${overdue}` : "Due: none",
        // AG13: every linked person and event (an older to-do's single person reads as one).
        Array.isArray(f.contactIds) && f.contactIds.length ? `Linked contacts: ${(f.contactIds as string[]).map((id) => context.names.get(id) ?? "a contact").join(", ")}` : f.contactId ? `Linked contact: ${context.names.get(String(f.contactId)) ?? "a contact"}` : null,
        Array.isArray(f.eventRefs) && f.eventRefs.length ? `Linked events: ${(f.eventRefs as string[]).map((ref) => (context.names.get(ref) ? (ref.startsWith("private:") ? `${context.names.get(ref)} (your own private event)` : context.names.get(ref)) : "an event")).join(", ")}` : null,
        text(f.description) ? `Notes: ${text(f.description)}` : null,
      ]);
      break;
    }
    case "schedule": {
      header = "personal schedule item";
      const start = context.occurrence ?? text(f.startsAt);
      const zone = text(f.timeZone) ?? context.timeZone;
      // AG13: an occurrence of a series ends as long after its start as the series does.
      const end = text(f.endsAt) && !context.occurrence ? text(f.endsAt) : text(f.endsAt) && context.occurrence && text(f.startsAt) ? new Date(Date.parse(context.occurrence) + Date.parse(text(f.endsAt)!) - Date.parse(text(f.startsAt)!)).toISOString() : undefined;
      // Integration 2026-11-20 (as AG20a did for private events): an all-day item has a day and no clock time — never a
      // 00:00 start. An end is said only as the last day, when that is a later day (an end at the next midnight is the same day).
      const lastDay = f.allDay === true && end && start && Number.isFinite(Date.parse(end)) ? formatWhen(new Date(Date.parse(end) - 1).toISOString(), zone, false) : null;
      sentences = numbered([
        `Title: ${text(f.title) ?? "—"}`,
        f.allDay === true ? `Day: ${formatWhen(start, zone, false)} (all day; no time of day was given)` : `Starts: ${formatWhen(start, zone)}`,
        f.allDay === true ? (lastDay && lastDay !== formatWhen(start, zone, false) ? `Last day: ${lastDay} (all day)` : null) : end ? `Ends: ${formatWhen(end, zone)}` : null,
        text(f.recurrence) ? `Repeats: ${text(f.recurrence)}` : null,
        text(f.location) ? `Place: ${text(f.location)}` : null,
        names(f.contactIds) ? `With: ${names(f.contactIds)}` : null,
        names(f.noteIds) ? `Linked notes: ${names(f.noteIds)}` : null,
        eventNames(f.eventRefs) ? `For the events: ${eventNames(f.eventRefs)}` : null,
      ]);
      break;
    }
    case "event": {
      // AG11: an @ of the user's own «我去过» note or private event (read by id); a platform event as before.
      if (f.kind === "attendance") {
        header = "«I went» — the user's own note of having been at an event (not a check-in or registration)";
        sentences = numbered([`Event: ${text(f.title) ?? "not readable now"}`, text(f.startsAt) ? (f.allDay === true ? `Event day: ${formatWhen(text(f.startsAt), context.timeZone, false)} (all day)` : `Event starts: ${formatWhen(text(f.startsAt), context.timeZone)}`) : null, `Went on: ${text(f.attendedOn) ?? "—"}${Array.isArray(f.dayParts) && f.dayParts.length ? ` (${f.dayParts.join(", ")})` : ""}`, text(f.selfNote) ? `The user wrote: ${text(f.selfNote)}` : "The user wrote nothing about it."]);
        break;
      }
      if (f.kind === "private_event") {
        header = "the user's own private event";
        // AG20a: an all-day event has a day and no clock time (never "00:00").
        sentences = numbered([`Title: ${text(f.title) ?? "—"}`, f.allDay === true ? `Day: ${formatWhen(text(f.startsAt), context.timeZone, false)} (all day; no time of day was given)` : `Starts: ${formatWhen(text(f.startsAt), context.timeZone)}`, text(f.endsAt) ? `Ends: ${formatWhen(text(f.endsAt), context.timeZone)}` : null, `Place: ${text(f.location) ?? "not given"}`]);
        break;
      }
      header = "platform event";
      // AG19 repair round 1: the topics and the fee as the organizer stated them (appended, so earlier sentence numbers hold).
      sentences = numbered([`Title: ${text(f.title) ?? "—"}`, `Starts: ${formatWhen(text(f.startsAt), context.timeZone)}`, text(f.endsAt) ? `Ends: ${formatWhen(text(f.endsAt), context.timeZone)}` : null, `Place: ${text(f.location) ?? "not given"}`, Array.isArray(f.topics) && f.topics.length ? `Topics: ${(f.topics as string[]).join(", ")}` : null, text(f.feeKind) ? `Fee: ${feeSentence(text(f.feeKind)!, text(f.feeAmountYen))}` : null]);
      break;
    }
    case "contact":
    default: {
      header = `contact profile, last updated ${formatWhen(text(f.updatedAt), context.timeZone, false)}`;
      sentences = numbered([`Name: ${text(f.displayName) ?? "—"}`, text(f.company) ? `Organization: ${text(f.company)}` : null, text(f.headline) ? `Role: ${text(f.headline)}` : null, Array.isArray(f.tags) && f.tags.length ? `Tags: ${f.tags.join(", ")}` : null,
        // AG12-5: on file but not shared with the model (a separate permission); the values never reach here.
        Array.isArray(f.contactMethods) && f.contactMethods.length ? `Contact details: ${(f.contactMethods as string[]).map((item) => (item === "email" ? "e-mail" : item)).join(", ")} on file, not shared with you (they need a separate permission). If asked, say they are kept on the contact's page and not shown to you here; never say there are none.` : null]);
      profile = { organization: text(f.company), role: text(f.headline), updatedAt: text(f.updatedAt) };
      break;
    }
  }
  return { at, handle, header, kind: view.kind, partId, ref: view.ref, sentences, version: view.version, ...(profile ? { profile } : {}) };
}

/** Relative day words (no calendar date): today, tomorrow, a weekday, "next Monday", 下周三, 来週の水曜, 明日. */
const RELATIVE_DAY = /(大后天|后天|明天|今天|昨天|前天|明後日|あさって|しあさって|明日|今日|昨日|一昨日|おととい|\b(?:today|tonight|tomorrow|yesterday|day after tomorrow)\b|(?:上个?|下个?|这个?|本)?(?:周|星期|礼拜)[一二三四五六日天]|(?:来週|今週|先週|再来週)?\s*の?\s*[月火水木金土日]曜(?:日)?|\b(?:next |this |coming |last )?(?:monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b)/iu;
const CALENDAR_DATE = /(\d{4}-\d{2}-\d{2}|\d{1,2}\s*月\s*\d{1,2}\s*[日号]?|\b\d{1,2}\/\d{1,2}\b|\b(?:jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\.?\s+\d{1,2}\b)/iu;

/**
 * AG21c (R58): code's lines for the relative days in a note's sentences — each counted from the day the note was written
 * (resolveSaidDate with the note's date as "today"), and whether that day has passed as of now. Numbered after the body,
 * so the body's own sentence numbers hold.
 */
export function noteDayLines(body: readonly Sentence[], writtenAt: string, context: Pick<MaterialContext, "now" | "timeZone">): Sentence[] {
  const today = localDayOf(context.now, context.timeZone);
  const lines: string[] = [];
  for (const sentence of body) {
    const said = RELATIVE_DAY.exec(sentence.text);
    if (!said || CALENDAR_DATE.test(sentence.text)) continue;
    const day = resolveSaidDate(said[0], writtenAt, context.timeZone)?.day;
    if (!day) continue;
    const state = day < today ? "that day has passed" : day === today ? "that is today" : "that day is still ahead";
    lines.push(`Code's date note: in sentence ${sentence.id}, "${said[0]}" means ${formatWhen(day, context.timeZone, false)}, counted from the day the note was written (${formatWhen(writtenAt, context.timeZone, false)}), not from today; as of today ${state}. Use this day; do not count it again.`);
  }
  const start = body.length ? Math.max(...body.map((sentence) => sentence.id)) : 0;
  return lines.map((line, index) => ({ id: start + index + 1, text: line }));
}

/** The fee of an event as its material says it (the organizer's own statement; "not stated" is never "free"). */
export function feeSentence(kind: string, amountYen: string | null | undefined): string {
  if (kind === "free") return "free";
  if (kind === "amount" && amountYen) return `JPY ${Number(amountYen).toLocaleString("en-US")}`;
  if (kind === "pay_at_door") return "paid at the door (the amount is not stated)";
  if (kind === "external_link") return "see the organizer's page (the amount is not stated)";
  return "not stated (this does not mean free)";
}

/** The materials block of the answer prompt. */
export function materialsText(materials: readonly Material[]): string {
  return materials.map((material) => [`  ${material.handle} — ${material.header}`, ...material.sentences.map((sentence) => `    ${sentence.id}. ${sentence.text}`)].join("\n")).join("\n");
}
