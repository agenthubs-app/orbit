/**
 * resolve (code): the read of every part routed to `read` (设计稿 §3.2 第 1、2 步, §4; agent-design AG05).
 * No model is called: the read request is compiled from the first layer's capabilities, object clues,
 * bound handles and readFilter (PLANNER 易错边界 9).
 *
 * - The scope is the authenticated account and the deployment's workspace; nothing from the model
 *   widens it (易错边界 1). A person named in words is looked for in the account only.
 * - A part that points at a record that cannot be opened (an @ reference, or a record of the
 *   conversation that is no longer readable) reads nothing else: it says so and asks to choose again
 *   (§3.6, 易错边界 6).
 * - Several people of that name: narrowed by the company the user named; still several, it asks
 *   which one (§3.11, AG04 clarify) instead of guessing.
 * - Kinds read: memos, to-dos, schedule items, events by id, the contact's profile, the "recent
 *   interaction" view; at most 10 a page, more pages only for lists, with coverage (易错边界 3).
 * - What did not come back is a gap decided here (易错边界 5): nothing found (no_record, the part is
 *   still answered), a part withheld (partial), a failed read (service_error, never "no record"), a
 *   record that cannot be opened (unreadable).
 *
 * Record content stays in the run (the answer step's materials); the checkpoint gets refs, versions,
 * gaps and counts only.
 */
import { gapWords } from "../../answer/gap-copy";
import { materialOf } from "../../answer/materials";
import type { GapReason, Material } from "../../answer/schema";
import { recordKindOf } from "../../clarify/default-readings";
import type { NamedRecordRef } from "../../context/session-state";
import { gapOfReadError, readPages } from "../../domains/registry";
import { occurrenceIn } from "../../domains/schedule/read";
import type { DomainKind, DomainScope, RecordView } from "../../domains/types";
import { emitTrace } from "../../observability/trace";
import { capabilityKind, type Capability } from "../../route/capabilities";
import { isPronounClue, settleDependencies } from "../../route/decide";
import { localDay, readRecentInteraction } from "../../views/recent-interaction";
import type { AgentRecordAccess, GraphNode, NodeScope } from "../deps";
import type { AgentGraphState, GraphPart, PartCoverage } from "../state";
import { clueWords } from "./clarify";

type ReadKind = "memo" | "todo" | "schedule" | "event" | "contact" | "interaction";

const LIST_DELIVERABLES = new Set(["list", "ranked_list", "comparison"]);

/** The kinds a part's capabilities read (functions work over memos). */
export function readKindsOf(capabilities: readonly Capability[]): Set<ReadKind> {
  const kinds = new Set<ReadKind>();
  for (const capability of capabilities) {
    switch (capability) {
      case "memo.read":
        kinds.add("memo");
        break;
      case "todo.read":
        kinds.add("todo");
        break;
      case "schedule.read":
        kinds.add("schedule");
        break;
      case "event.read":
        kinds.add("event");
        break;
      case "contact.read":
      case "profile.read":
        kinds.add("contact");
        break;
      case "view.recentInteraction":
        kinds.add("interaction");
        break;
      case "view.context":
        kinds.add("memo").add("todo");
        break;
      case "view.timeline":
        // The timeline is everything about the person over time: their notes, by date (the interaction view is "the last one").
        kinds.add("memo");
        break;
      default:
        if (capabilityKind(capability) === "function") kinds.add("memo");
    }
  }
  return kinds;
}

const HONORIFIC = /(さん|さま|様|くん|君|ちゃん|先生|氏|老师|女士|总监|经理|总)$/u;
const LATIN_TITLE = /^(mr|mrs|ms|miss|dr|prof)\.?\s+/iu;

/** The words a person may be stored under: the clue as said, without honorifics, the last of "<org>の<name>". */
export function nameTokens(words: string): string[] {
  const clean = words.replace(/^@/u, "").replace(LATIN_TITLE, "").trim();
  const out: string[] = [];
  const push = (value: string) => {
    const token = value.replace(HONORIFIC, "").replace(/[\s,，、。]+$/u, "").trim();
    if (token && (token.length >= 2 || /^[A-Za-z]{3,}$/u.test(token)) && !out.includes(token)) out.push(token);
  };
  push(clean);
  const segments = clean.split(/[の的之]|'s\s+|\s+(?:from|at)\s+/u).map((segment) => segment.trim()).filter(Boolean);
  if (segments.length > 1) push(segments[segments.length - 1]);
  return out;
}

/**
 * AG05 run-02: what a record clue says to look for, when the first layer gave no search words — the
 * clue's own words without pronouns, back-references, counts, ordinals, "my" and the words for a kind of
 * record ("那三份竞品笔记" → 竞品, "灰釉のメモ" → 灰釉, "the competitor notes" → competitor). Undefined when
 * nothing is left ("那篇笔记", "第二个", "this note"): the clue names no words to search by.
 */
const CJK_NOISE = [
  "我记过的", "我记的", "我写的", "我的", "私が書いた", "私の", "关于", "有关", "について",
  "刚才", "刚刚", "上面", "前面", "之前", "先前", "さっき", "先ほど",
  "这些", "那些", "这个", "那个", "这条", "那条", "这篇", "那篇", "这件", "那件", "这份", "那份", "这次", "那次", "他们", "她们", "它们", "彼女", "あの人", "その人", "例の", "それ", "これ", "あれ", "その", "この", "あの",
  "笔记", "记录", "备忘", "待办", "任务", "日程", "活动", "联系人", "事情", "东西", "内容", "要点", "话题", "話", "メモ", "ノート", "タスク", "ToDo", "予定", "イベント", "もの", "こと",
  "他", "她", "它", "这", "那", "该", "彼", "我", "私", "件", "的", "の",
];
const LATIN_NOISE = new Set(["the", "a", "an", "this", "that", "these", "those", "it", "its", "my", "mine", "our", "your", "his", "her", "their", "him", "them", "me", "i", "about", "of", "on", "for", "in", "at", "to", "note", "notes", "memo", "memos", "record", "records", "todo", "todos", "to-do", "to-dos", "task", "tasks", "schedule", "event", "events", "item", "items", "one", "ones", "first", "second", "third", "last", "earlier", "above", "previous", "wrote", "written"]);

export function clueSearchWords(words: string): string | undefined {
  let rest = words.replace(/^@/u, "").trim();
  if (!rest) return undefined;
  if (/^[\x20-\x7e’]+$/u.test(rest)) {
    const kept = rest.toLowerCase().split(/[^a-z0-9'’-]+/u).filter((word) => word && !LATIN_NOISE.has(word));
    const joined = kept.join(" ");
    return joined.length >= 3 ? joined : undefined;
  }
  rest = rest.replace(/第[一二三四五六七八九十\d]+[个条件篇位份]?/gu, "").replace(/[一二两三四五六七八九十几\d]+\s*[份篇条个件本つ枚]/gu, "");
  for (const noise of CJK_NOISE) rest = rest.split(noise).join("");
  rest = rest.replace(/[\s、，。・,.!?！？「」『』"“”]/gu, "");
  return rest.length >= 2 ? rest : undefined;
}

/** "2026-11-16" at 00:00 in the time zone, as a UTC instant. */
export function localMidnight(day: string, timeZone: string): string {
  const guess = new Date(`${day}T00:00:00Z`);
  const parts = Object.fromEntries(new Intl.DateTimeFormat("en-CA", { day: "2-digit", hour: "2-digit", hourCycle: "h23", minute: "2-digit", month: "2-digit", timeZone, year: "numeric" }).formatToParts(guess).map((part) => [part.type, part.value]));
  const shown = Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day), Number(parts.hour), Number(parts.minute));
  return new Date(guess.getTime() - (shown - guess.getTime())).toISOString();
}

function nextDay(day: string): string {
  return new Date(Date.parse(`${day}T00:00:00Z`) + 86_400_000).toISOString().slice(0, 10);
}

interface ContactMatch {
  id: string;
  name: string;
  view: RecordView | null;
}

/** Looks a person up by name in the account (never elsewhere) and narrows by the company the user named. */
async function findContacts(records: AgentRecordAccess, scope: DomainScope, words: string, quote: string, message: string): Promise<{ matches: ContactMatch[]; failed: boolean }> {
  const tokens = nameTokens(words);
  let found: RecordView[] = [];
  let failed = false;
  try {
    for (const token of tokens) {
      found = (await records.reader.read("contact", scope, { limit: 10, text: token })).items;
      if (found.length) break;
    }
    if (!found.length && words.replace(/^@/u, "").trim().length >= 2) found = (await records.reader.read("contact", scope, { limit: 10, status: "within" as never, text: words.replace(/^@/u, "").trim() })).items;
  } catch (error) {
    emitTrace({ error: error instanceof Error ? error.message : String(error), type: "read.error", where: "resolve.contact_search" });
    failed = true;
  }
  let matches = found;
  if (matches.length > 1) {
    const named = matches.filter((view) => typeof view.fields.company === "string" && view.fields.company && (quote.includes(String(view.fields.company)) || message.includes(String(view.fields.company))));
    if (named.length) matches = named;
  }
  if (matches.length > 1) {
    const exact = matches.filter((view) => tokens.includes(String(view.fields.displayName)));
    if (exact.length) matches = exact;
  }
  return { failed, matches: matches.map((view) => ({ id: view.id, name: String(view.fields.displayName ?? ""), view })) };
}

interface PartRead {
  views: RecordView[];
  /** A schedule item's occurrence inside the asked range, by ref. */
  occurrences: Map<string, string>;
  gaps: Set<GapReason>;
  notes: string[];
  lines: string[];
  coverage: PartCoverage[];
  /** Views of kinds other than the contact profile were asked for. */
  wantsRecords: boolean;
}

export function resolveNode(scope: NodeScope): GraphNode {
  const { deps, input, run } = scope;
  return async (state: AgentGraphState) => {
    const resume = state.touched !== null;
    const parts: GraphPart[] = state.parts.map((part) => ({ ...part }));
    const due = parts.filter((part) => part.route === "read" && part.status === "answered" && (!resume || state.touched!.includes(part.localId)));
    if (!due.length) return {};
    const words = gapWords(state.language);
    const context = run.context;
    const handles = [...(context?.handles.values() ?? [])];
    const handleOf = (id: string | null) => (id ? handles.find((handle) => handle.id === id) ?? null : null);
    const zone = state.timeZone || "Asia/Tokyo";
    const now = state.asOf || deps.now();

    // This turn's @ references that no part bound: to the one part with an unbound clue of that kind.
    for (const reference of run.references) {
      if (parts.some((part) => part.refs.some((ref) => ref.recordId === reference.id))) continue;
      const kind = recordKindOf(reference.type);
      const takers = due.filter((part) => part.refs.some((ref) => !ref.recordId && recordKindOf(ref.entity) === kind));
      if (takers.length === 1) {
        const ref = takers[0].refs.find((item) => !item.recordId && recordKindOf(item.entity) === kind)!;
        ref.recordId = reference.id;
        emitTrace({ partId: takers[0].localId, reference: { id: reference.id, type: reference.type }, type: "resolve.reference_bound" });
      }
    }

    const resolvedParts = new Map<string, { partId: string; contacts: ContactMatch[]; filter: GraphPart["plan"]["readFilter"] }>();
    for (const part of [...due].sort((left, right) => left.quote[0] - right.quote[0])) {
      const quote = input.message.slice(part.quote[0], part.quote[1]);
      const read: PartRead = { coverage: [], gaps: new Set(), lines: [], notes: [], occurrences: new Map(), views: [], wantsRecords: false };
      const finish = (status: GraphPart["status"], reason: string | null) => {
        part.status = status;
        part.reason = reason;
        part.gaps = [...read.gaps];
        part.coverage = read.coverage;
        part.reads = read.views.map((view) => ({ ref: view.ref, version: view.version }));
        if (read.lines.length) run.gapLines.set(part.localId, read.lines);
        emitTrace({ coverage: read.coverage, gaps: part.gaps, partId: part.localId, reads: part.reads.map((item) => item.ref), status, type: "read.done" });
      };
      const records = deps.records;
      if (!records) {
        read.gaps.add("service_error");
        read.lines.push(words.serviceError(quote));
        finish("unfinished", "read_failed");
        continue;
      }
      const accountScope = records.scope(input.actorId);

      // 1. A record the part points at that cannot be opened: say so, read nothing else for it.
      const closed = part.refs.find((ref) => ref.recordId && (handleOf(ref.recordId)?.accessible === false || run.references.some((item) => item.id === ref.recordId && item.accessible === false)));
      if (closed) {
        const handle = handleOf(closed.recordId);
        read.gaps.add("unreadable");
        read.lines.push(handle?.source === "reference" || run.references.some((item) => item.id === closed.recordId) ? words.unreadableReference(clueWords(input.message, closed)) : words.unreadableEarlier());
        finish("unfinished", "reference_not_accessible");
        continue;
      }
      // An unbound clue of a kind mentioned last in this session (and no words to search by) means that record.
      let filter = part.plan.readFilter;
      let text = filter?.text ? input.message.slice(filter.text[0], filter.text[1]) : undefined;
      for (const ref of part.refs) {
        // A clue with words of its own is searched by them (below), not taken for the record mentioned last.
        if (ref.recordId || ref.entity === "contact" || text || clueSearchWords(clueWords(input.message, ref) ?? "")) continue;
        const last = context?.lastMentioned.find((item) => recordKindOf(item.type) === recordKindOf(ref.entity));
        if (last) {
          ref.recordId = last.id;
          emitTrace({ partId: part.localId, recordId: last.id, type: "resolve.last_mentioned_bound" });
          if (last.accessible === false) {
            read.gaps.add("unreadable");
            read.lines.push(words.unreadableEarlier());
          }
        }
      }
      if (read.gaps.has("unreadable")) {
        finish("unfinished", "reference_not_accessible");
        continue;
      }

      // 2. The people: bound, or looked up by name in the account.
      const contacts: ContactMatch[] = [];
      let stop = false;
      for (const ref of part.refs.filter((item) => recordKindOf(item.entity) === "contact")) {
        if (ref.recordId) {
          contacts.push({ id: ref.recordId, name: handleOf(ref.recordId)?.name ?? run.names.get(ref.recordId) ?? "", view: null });
          continue;
        }
        let said = clueWords(input.message, ref);
        if (said && isPronounClue(said)) {
          // A reply that continues an earlier matter is about that matter's person (AG05: open item clues).
          const item = part.continues ? context?.openItems.find((open) => open.ref === part.continues!.ref) : undefined;
          said = item?.clues?.find((clue) => clue.entity === "contact" && !isPronounClue(clue.text))?.text ?? null;
        }
        if (!said) continue;
        const { failed, matches } = await findContacts(records, accountScope, said, quote, input.message);
        if (failed) {
          read.gaps.add("service_error");
          read.lines.push(words.serviceError(quote));
          stop = true;
          break;
        }
        if (!matches.length) {
          read.gaps.add("no_record");
          read.lines.push(words.noContact(said.replace(/^@/u, "")));
          stop = true;
          break;
        }
        if (matches.length > 1) {
          // Several people of that name, the company does not tell them apart: ask which (§3.11), do not guess.
          run.candidates.set(part.localId, matches.slice(0, 3).map((match): NamedRecordRef => ({ id: match.id, name: match.name, type: "contact" })));
          run.steps.set(part.localId, { kind: "ask_missing" });
          run.needsDirections = true;
          part.status = "awaiting_clarification";
          part.waitReason = "object_ambiguous";
          part.route = "clarify";
          part.step = "ask_missing";
          emitTrace({ candidates: matches.length, partId: part.localId, type: "resolve.ambiguous_person" });
          stop = true;
          break;
        }
        ref.recordId = matches[0].id;
        contacts.push(matches[0]);
      }
      if (part.status === "awaiting_clarification") continue;
      if (stop) {
        finish(read.gaps.has("service_error") ? "unfinished" : "answered", read.gaps.has("service_error") ? "read_failed" : null);
        continue;
      }
      // A part that goes on from an earlier part of the same message ("そのとき彼女は…", "the overdue ones") names no
      // person and points at no record of its own: it reads the same person, narrowed the same way.
      const ownTargets = part.refs.some((ref) => ref.recordId && recordKindOf(ref.entity) !== "contact");
      const namesPerson = part.refs.some((ref) => recordKindOf(ref.entity) === "contact" && !isPronounClue(clueWords(input.message, ref) ?? "他"));
      if (!contacts.length && !ownTargets && !namesPerson) {
        const earlier = part.dependsOn.map((id) => resolvedParts.get(id)).find((item) => item?.contacts.length) ?? [...resolvedParts.values()].reverse().find((item) => item.contacts.length);
        if (earlier) {
          contacts.push(...earlier.contacts);
          for (const ref of part.refs) if (!ref.recordId && recordKindOf(ref.entity) === "contact") ref.recordId = earlier.contacts[0].id;
          if (!filter && earlier.filter) {
            filter = earlier.filter;
            text = filter.text ? input.message.slice(filter.text[0], filter.text[1]) : undefined;
          }
          emitTrace({ from: earlier.partId, partId: part.localId, type: "resolve.subject_inherited" });
        }
      }
      resolvedParts.set(part.localId, { contacts: [...contacts], filter, partId: part.localId });
      // A person pointed at only by a pronoun that nothing resolved: do not read everyone's records instead.
      if (!contacts.length && part.refs.some((ref) => recordKindOf(ref.entity) === "contact")) {
        read.gaps.add("no_record");
        read.lines.push(words.noContact(""));
        finish("answered", null);
        continue;
      }

      // 3. What to read.
      const capabilities = part.reading?.capabilities.length ? part.reading.capabilities : part.capabilities;
      const kinds = readKindsOf(capabilities);
      // Finding events by conditions is not a read of this version (an attached event is read by id).
      if (kinds.has("event") && !part.refs.some((ref) => ref.recordId && recordKindOf(ref.entity) === "event") && ![...kinds].some((kind) => kind !== "event" && kind !== "contact")) {
        read.lines.push(words.eventSearch(quote));
        finish("unfinished", "not_in_this_version");
        continue;
      }
      // A profile alone may be out of date (设计稿 §4: newer wins): a person's latest notes are read with it.
      if (![...kinds].some((kind) => kind !== "contact")) kinds.add("memo");
      const boundIds = new Map<DomainKind, string[]>();
      for (const ref of part.refs) {
        const kind = recordKindOf(ref.entity);
        if (ref.recordId && kind && kind !== "contact") boundIds.set(kind as DomainKind, [...(boundIds.get(kind as DomainKind) ?? []), ref.recordId]);
      }
      const names = new Map<string, string>(contacts.filter((item) => item.name).map((item) => [item.id, item.name]));
      const order = filter?.order ?? "newest";
      const status = filter?.status ?? (part.reading?.key === "contact.recent_and_open" ? "open" : undefined);
      const from = filter?.from ? localMidnight(filter.from, zone) : undefined;
      const to = filter?.to ? localMidnight(nextDay(filter.to), zone) : undefined;
      const maxPages = LIST_DELIVERABLES.has(part.plan.deliverable) ? records.maxPages : 1;
      const failures: string[] = [];
      let withheld = 0;
      const push = (view: RecordView) => {
        if (!read.views.some((item) => item.ref === view.ref)) read.views.push(view);
      };

      // The people's profiles (who they are; when the profile was last updated).
      for (const contact of contacts) {
        try {
          const view = contact.view ?? (await records.reader.read("contact", accountScope, { id: contact.id })).items[0];
          if (view) {
            push(view);
            names.set(view.id, String(view.fields.displayName ?? contact.name));
            run.readNames.set(view.id, { name: String(view.fields.displayName ?? contact.name), type: "contact" });
          }
        } catch (error) {
          const gap = gapOfReadError(error, { byId: true });
          if (gap === "service_error") failures.push("contact");
          else read.gaps.add("unreadable");
        }
      }
      // Records the part points at by id.
      for (const [kind, ids] of boundIds) {
        read.wantsRecords = true;
        for (const id of ids) {
          try {
            const view = (await records.reader.read(kind, accountScope, { id })).items[0];
            if (view) push(view);
          } catch (error) {
            const gap = gapOfReadError(error, { byId: true });
            if (gap === "service_error") failures.push(kind);
            else {
              read.gaps.add("unreadable");
              const ref = part.refs.find((item) => item.recordId === id);
              const line = run.references.some((item) => item.id === id) ? words.unreadableReference(clueWords(input.message, ref)) : words.unreadableEarlier();
              if (!read.lines.includes(line)) read.lines.push(line);
            }
          }
        }
      }
      // The last interaction (structured only), or the person's notes as old material.
      if (kinds.has("interaction")) {
        read.wantsRecords = true;
        for (const contact of contacts) {
          const view = await readRecentInteraction({ reader: records.reader, source: records.source }, accountScope, { contactId: contact.id, now, timeZone: zone });
          withheld += view.withheld;
          failures.push(...view.failures.filter((failure) => !failure.startsWith("encounter")).map((failure) => failure.split(":")[0]));
          if (view.interactions.length) {
            read.notes.push(`Recorded interactions with ${contact.name || "this person"}, newest first${view.sameDay.length ? `; on ${view.sameDay.map((list) => list.length).join(", ")} same-day entries the order within the day is not known` : ""}. The latest is ${view.latest!.occurredOn}.`);
            for (const item of view.interactions) if (item.view) push(item.view);
          } else if (view.legacy.length) {
            read.notes.push(`No interaction with ${contact.name || "this person"} is recorded as such; the materials are the user's notes about them, newest first: the latest note is what "last time" means. (Code tells the user this comes from the notes.)`);
            read.lines.push(words.fromNotes());
            for (const item of view.legacy) push(item);
          }
        }
        if (!contacts.length) read.notes.push("No person was named, so no interaction could be looked up.");
      }
      // Searches by kind (not for kinds the part already points at by id).
      // The interaction view stands in for the notes only for "the last time" without words to look for.
      const interactionAnswers = kinds.has("interaction") && !text && order === "newest" && read.views.some((view) => view.kind === "memo");
      const searchKinds = (["memo", "todo", "schedule"] as const).filter((kind) => kinds.has(kind) && !boundIds.has(kind) && !(kind === "memo" && interactionAnswers));
      const subjects = contacts.length ? contacts.map((item) => item.id) : [undefined];
      let unclear = false;
      for (const kind of searchKinds) {
        // run-02: a read never gets wider because a field was left out. Without the first layer's words, the
        // record clue's own words are the search; a clue of only a pronoun with no person to read for points
        // at nothing code can find — it says so instead of reading the newest page.
        const clue = part.refs.find((ref) => !ref.recordId && recordKindOf(ref.entity) === kind);
        const clueText = clue ? clueSearchWords(clueWords(input.message, clue) ?? "") : undefined;
        const kindText = text ?? clueText;
        if (clue && !kindText && !contacts.length) {
          unclear = true;
          continue;
        }
        // With nothing else to narrow by: a to-do list is the open ones, a schedule question is what is coming.
        const kindStatus = kind === "todo" ? status ?? (!contacts.length && !kindText ? "open" : undefined) : undefined;
        const kindFrom = kind === "schedule" && !from && !to && !contacts.length && !kindText ? now : from;
        if (kind === "todo" && kindStatus && !status) read.notes.push("Only the to-dos not done yet were read.");
        if (kind === "schedule" && kindFrom !== from) read.notes.push("Only schedule items from now on were read.");
        read.wantsRecords = true;
        for (const contactId of subjects) {
          const orders: ("newest" | "oldest")[] = order === "both" ? ["newest", "oldest"] : [order];
          for (const direction of orders) {
            try {
              const queryOf = (words: string | undefined) => ({
                ...(contactId ? { contactId } : {}),
                ...(words ? { text: words } : {}),
                ...(kindStatus ? { status: kindStatus } : {}),
                ...(kindFrom ? { from: kindFrom } : {}),
                ...(to ? { to } : {}),
                ...(kind === "todo" && !filter?.order ? {} : { order: direction }),
              });
              let pages = await readPages(records.reader, kind, accountScope, queryOf(kindText), order === "both" ? 1 : maxPages);
              // The words were a narrowing: when none of the person's records has them, read the person's records
              // without them and say so. With no person, nothing found stays nothing found (no newest page instead).
              if (kindText && contactId && !pages.items.length && !pages.withheld) {
                pages = await readPages(records.reader, kind, accountScope, queryOf(undefined), order === "both" ? 1 : maxPages);
                if (pages.items.length) read.notes.push(`No note of theirs contains "${kindText}"; these are their ${kind === "memo" ? "notes" : "records"} without that filter.`);
              }
              withheld += pages.withheld;
              let items = pages.items;
              if (kind === "schedule" && (kindFrom || to)) {
                items = items.filter((view) => {
                  const at = occurrenceIn(String(view.fields.startsAt), typeof view.fields.recurrence === "string" ? view.fields.recurrence : undefined, kindFrom, to);
                  if (at && at !== view.fields.startsAt) read.occurrences.set(view.ref, at);
                  return Boolean(at);
                });
              }
              for (const view of items) push(view);
              read.coverage.push({ complete: pages.complete, kind, pagesRead: pages.pagesRead, seen: pages.items.length, total: pages.total });
              if (!pages.complete || (pages.total !== null && pages.total > pages.items.length)) {
                read.notes.push(pages.total !== null
                  ? `${kind}: ${pages.total} match in all (an exact count); the ${pages.items.length} listed here are the ${kind === "todo" ? "soonest due" : direction === "oldest" ? "oldest" : "newest"} of them. Give the total as ${pages.total}; do not present the listed ones as all.`
                  : `${kind}: ${pages.items.length} listed; there are more. Do not present them as all.`);
              }
            } catch (error) {
              failures.push(kind);
              emitTrace({ error: error instanceof Error ? error.message : String(error), kind, partId: part.localId, type: "read.failed" });
            }
          }
        }
      }
      if (kinds.has("event") && !boundIds.has("event")) read.notes.push("Events are read when the user attaches one; none was attached.");

      // 4. Gaps (code decides; the model never does).
      const recordViews = read.views.filter((view) => view.kind !== "contact");
      if (failures.length) {
        read.gaps.add("service_error");
        read.lines.push(words.serviceError(quote));
      }
      if (withheld > 0) {
        read.gaps.add("partial");
        read.notes.push(`${withheld} more matching record(s) cannot be read now; do not guess what they say.`);
        read.lines.push(words.partial());
      }
      if (unclear && !recordViews.length && !failures.length) {
        read.lines.push(words.notWhich(quote));
        finish("unfinished", "object_unclear");
        continue;
      }
      if (!recordViews.length && !failures.length && !withheld && (read.wantsRecords || !contacts.length) && !read.gaps.has("unreadable")) {
        read.gaps.add("no_record");
        read.lines.push(words.noRecord(quote));
      }
      const coverageLine = read.coverage.find((item) => item.total !== null && item.total > item.seen);
      if (coverageLine && LIST_DELIVERABLES.has(part.plan.deliverable)) read.lines.push(words.coverage(coverageLine.seen, coverageLine.total));

      // 5. Materials for the answer step (only when there is something to answer from).
      const usable = read.wantsRecords ? recordViews.length > 0 : read.views.length > 0;
      if (usable) {
        let n = [...run.materials.values()].reduce((sum, list) => sum + list.length, 0);
        const materials: Material[] = [...read.views.filter((view) => view.kind === "contact"), ...read.views.filter((view) => view.kind !== "contact")]
          .map((view) => materialOf(view, part.localId, `s${(n += 1)}`, { names, now, occurrence: read.occurrences.get(view.ref) ?? null, timeZone: zone }));
        run.materials.set(part.localId, materials);
        run.readNotes.set(part.localId, read.notes);
        for (const view of read.views) if (!run.readNames.has(view.id)) run.readNames.set(view.id, { name: nameOf(view, zone), type: view.kind });
        finish("answered", null);
      } else if (read.gaps.has("service_error")) {
        finish("unfinished", "read_failed");
      } else if (read.gaps.has("unreadable")) {
        finish("unfinished", "reference_not_accessible");
      } else {
        // Nothing found: the part is answered by code's sentence (no model call).
        finish("answered", null);
      }
    }
    settleDependencies(parts);
    return { parts };
  };
}

/** A short name of a record for the session state ("the memo mentioned last"). */
function nameOf(view: RecordView, timeZone: string): string {
  const fields = view.fields as Record<string, unknown>;
  const title = typeof fields.title === "string" && fields.title.trim() ? fields.title.trim() : typeof fields.displayName === "string" ? fields.displayName : null;
  if (title) return title.slice(0, 40);
  const created = typeof fields.createdAt === "string" ? localDay(fields.createdAt, timeZone) : "";
  return `${view.kind}${created ? ` ${created}` : ""}`;
}
