/**
 * The record-finder lab's `World` (finder/types.ts) for ONE lookup of the signed-in account, built from the store with
 * the candidate prefilter (finder/prefilter.ts): only rows a lookup could mean are read — never a whole collection
 * (every row the store returns is a read of the user's records). The same store, collections, account + workspace
 * scope, eval deny list, eval read faults and field whitelist (each domain's `fieldsOf`) as the old lookups.
 *
 * - Isolation: every query is scoped to the account and workspace in SQL and each row is dropped again unless its
 *   `userId` is the account; private events and «我去过» notes are kept only when their `accountId` is the account.
 *   Platform events are the deployment's directory, kept as the old `eventCandidates` keeps them. Every record goes in
 *   as account "A"; nothing of another account is loaded.
 * - What is read: to-dos / memos / schedule items whose text holds one of the plan's terms (each query capped at
 *   ROWS_PER_QUERY), the settled people's linked rows, rows dated in the time said, the records the last answer showed;
 *   contacts: the settled people by id, and for a person lookup the name variants (stage 2 only when stage 1 names no
 *   one, or for a name in Latin letters / kana). Events: the directory and the account's private events, as before;
 *   «我去过» notes and registrations only when the words speak of going or signing up.
 * - Queries are memoised per request, so a row read once is not read again by the next lookup.
 * - Ids: lab ids are `<prefix>-<agent id>` (C, T, M, S, E platform, P private, A attendance); `agentRefOf` maps back.
 * - Not available in the agent and so empty: the alias table (叫法表), contacts' industry / last interaction, deleted
 *   contacts (restore keeps ContactAccess.findDeleted).
 */
import type { AgentRecordAccess } from "../graph/deps";
import type { DomainScope } from "../domains/types";
import type { RecordDomain } from "../domains/record-adapter";
import type { RecordRow, RecordSpec } from "../domains/source";
import type { ReadInput } from "../../orbit-ai/data-query/read-contract";
import { CONTACT_DOMAIN } from "../domains/contact/read";
import { MEMO_DOMAIN } from "../domains/memo/read";
import { SCHEDULE_DOMAIN } from "../domains/schedule/read";
import { TODO_DOMAIN } from "../domains/todo/read";
import { OCCURRENCE_EXCEPTIONS } from "../domains/schedule/occurrences";
import { emitTrace, evalDeniedReads, takeEvalFault } from "../observability/trace";
import { resolvePerson as labResolvePerson } from "./impl/person";
import { personFallback, personTerms, planFind, ROWS_PER_QUERY, type FindPlan } from "./prefilter";
import type { Attendance, Contact, FindInput, Memo, PersonInput, PlatformEvent, PrivateEvent, ScheduleItem, Todo, World } from "./types";

export const ACCOUNT = "A" as const;
export type AgentKind = "contact" | "todo" | "memo" | "schedule" | "platform" | "private" | "attendance";
export type FinderFnName = "findTodosMemos" | "findSchedule" | "findEvents" | "findContacts";

const PREFIX: Record<AgentKind, string> = { attendance: "A", contact: "C", memo: "M", platform: "E", private: "P", schedule: "S", todo: "T" };
const KIND_OF: Record<string, AgentKind> = Object.fromEntries(Object.entries(PREFIX).map(([kind, prefix]) => [prefix, kind as AgentKind]));

export const labIdOf = (kind: AgentKind, id: string) => `${PREFIX[kind]}-${id}`;

/** A lab id back to the agent's kind and id; null for an id this World did not make. */
export function agentRefOf(labId: string): { kind: AgentKind; id: string } | null {
  const at = labId.indexOf("-");
  const kind = at > 0 ? KIND_OF[labId.slice(0, at)] : undefined;
  return kind && labId.length > at + 1 ? { id: labId.slice(at + 1), kind } : null;
}

/** Stage 2 of a person lookup by Latin letters / kana reads at most this many contacts (as the old romanised pass did). */
export function finderMaxContacts(env: Record<string, string | undefined> = process.env): number {
  const value = Number(env.ORBIT_AGENT_FINDER_MAX_CONTACTS);
  return Number.isInteger(value) && value >= 10 && value <= 5000 ? value : 500;
}

/** A read the World needed could not be made (an eval fault, the store failing): callers say so, never "not found". */
export class WorldReadError extends Error {
  constructor(readonly part: string, message: string) {
    super(message);
    this.name = "WorldReadError";
  }
}

const str = (value: unknown): string | undefined => (typeof value === "string" && value.trim() ? value : undefined);
const strs = (value: unknown): string[] | undefined => (Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : undefined);

function localDay(iso: string, timeZone: string): string {
  try {
    return new Intl.DateTimeFormat("en-CA", { day: "2-digit", month: "2-digit", timeZone, year: "numeric" }).format(new Date(iso));
  } catch {
    return iso.slice(0, 10);
  }
}
const nextDay = (day: string) => new Date(Date.parse(`${day}T00:00:00Z`) + 86_400_000).toISOString().slice(0, 10);

/** "platform:<id>" / "private:<id>" event links → lab event ids. */
function eventIdsOf(value: unknown): string[] | undefined {
  const out = (strs(value) ?? []).flatMap((ref) => {
    const at = ref.indexOf(":");
    const kind = ref.slice(0, at);
    return at > 0 && (kind === "platform" || kind === "private") ? [labIdOf(kind, ref.slice(at + 1))] : [];
  });
  return out.length ? out : undefined;
}

/** The eval's deny list and the access's own (the same ids the reader withholds). */
function deniedOf(access: AgentRecordAccess): string[] {
  return [...new Set([...evalDeniedReads(), ...(access.deniedReads?.() ?? [])])];
}

export interface WorldLoader {
  /** The World for one record lookup (finder input with lab ids; `people` must be lab contact ids). */
  findWorld(fn: FinderFnName, input: FindInput): Promise<World>;
  /** The World for one person lookup (stage 1 name variants, stage 2 when needed). */
  personWorld(input: PersonInput): Promise<World>;
  /** The agent's own fields behind a lab id, as read (for cards and labels without another read). */
  loaded: Map<string, Record<string, unknown>>;
  /** Store rows read in this request, by query (for tests and traces). */
  reads(): number;
  /**
   * The conversation engine's World for one turn (conversation/world-read.ts): the contacts the conversation named, by
   * id, and the newest records linked to the first few of them — never more than `maxContacts` contact rows and
   * `maxRecords` record rows in all (each query is capped by an even share of what is left). Records the conversation
   * named are not read again (the eval's AE-SCL-021: an answered record is not re-read for a later turn).
   */
  conversationWorld(input: ConversationWorldInput): Promise<World>;
}

export interface ConversationWorldInput {
  /** Lab contact ids, most recent first. */
  contacts: readonly string[];
  /** Contacts whose linked records are read (the first ones of `contacts`). */
  linkedPeople: number;
  maxContacts: number;
  maxRecords: number;
}

export interface WorldOptions {
  records: AgentRecordAccess;
  scope: DomainScope;
  now: string;
  timeZone: string;
  rowsPerQuery?: number;
}

type Collection = "contacts" | "todos" | "memos" | "schedule";
const DOMAIN_OF: Record<Collection, RecordDomain> = { contacts: CONTACT_DOMAIN, memos: MEMO_DOMAIN, schedule: SCHEDULE_DOMAIN, todos: TODO_DOMAIN };

export function createWorldLoader(options: WorldOptions): WorldLoader {
  const { records, scope } = options;
  const limit = options.rowsPerQuery ?? ROWS_PER_QUERY;
  const loaded = new Map<string, Record<string, unknown>>();
  const queries = new Map<string, Promise<RowsOut>>();
  const faulted = new Set<string>();
  let rowCount = 0;
  type RowsOut = { fields: Record<string, unknown>; row: RecordRow }[];

  /** One store query (memoised per request), whitelisted fields, the account's rows only. */
  function query(collection: Collection, spec: RecordSpec, cap = limit): Promise<RowsOut> {
    const key = JSON.stringify([collection, spec, cap]);
    let hit = queries.get(key);
    if (!hit) {
      hit = (async () => {
        const domain = DOMAIN_OF[collection];
        if (!faulted.has(domain.kind)) {
          const fault = takeEvalFault(`${domain.kind}.read`);
          if (fault) {
            faulted.add(domain.kind);
            emitTrace({ kind: fault.kind, note: "eval fault: the read source is unavailable", type: "read.fault", where: `${domain.kind}.read` });
          }
        }
        if (faulted.has(domain.kind)) throw new WorldReadError(collection, "SOURCE_UNAVAILABLE");
        let rows: RecordRow[];
        try {
          rows = await records.source.page({ accountId: scope.accountId, workspaceId: scope.workspaceId }, { ...spec, denied: deniedOf(records) }, null, cap);
        } catch (error) {
          emitTrace({ error: error instanceof Error ? error.message : String(error), type: "read.error", where: `finder.world.${domain.kind}` });
          throw new WorldReadError(collection, "SOURCE_UNAVAILABLE");
        }
        rowCount += rows.length;
        const out: RowsOut = [];
        for (const row of rows) {
          if (row.userId !== scope.accountId) continue;
          const fields = domain.fieldsOf(row);
          if (fields) out.push({ fields, row });
        }
        return out;
      })();
      hit.catch(() => queries.delete(key));
      queries.set(key, hit);
    }
    return hit;
  }
  const base = (collection: Collection, input: Partial<ReadInput>) => DOMAIN_OF[collection].specOf({ operation: "list", query: "list", ...input } as ReadInput);
  const search = (collection: Collection, term: string, input: Partial<ReadInput> = {}) => DOMAIN_OF[collection].specOf({ ...input, operation: "search", query: term } as ReadInput);

  // ---------------- rows → lab records ----------------
  const contactOf = ({ fields, row }: RowsOut[number]): Contact => {
    const id = labIdOf("contact", row.id);
    loaded.set(id, fields);
    return { account: ACCOUNT, id, name: String(fields.displayName), ...(str(fields.company) ? { company: str(fields.company) } : {}), ...(str(fields.headline) ? { title: str(fields.headline) } : {}) };
  };
  const todoOf = ({ fields, row }: RowsOut[number]): Todo => {
    const id = labIdOf("todo", row.id);
    loaded.set(id, fields);
    const contactIds = (strs(fields.contactIds) ?? (str(fields.contactId) ? [String(fields.contactId)] : [])).map((item) => labIdOf("contact", item));
    const eventIds = eventIdsOf(fields.eventRefs);
    return {
      account: ACCOUNT, createdAt: str(fields.createdAt) ?? row.updatedAt, id, status: fields.status === "completed" ? "done" : "open", title: String(fields.title), updatedAt: str(fields.updatedAt) ?? row.updatedAt,
      ...(str(fields.description) ? { notes: str(fields.description) } : {}), ...(contactIds.length ? { contactIds } : {}), ...(eventIds ? { eventIds } : {}),
      ...(str(fields.plannedDate) ? { plannedDate: str(fields.plannedDate) } : {}), ...(str(fields.dueAt) ? { dueAt: str(fields.dueAt) } : {}),
    };
  };
  const memoOf = ({ fields, row }: RowsOut[number]): Memo => {
    const id = labIdOf("memo", row.id);
    loaded.set(id, fields);
    const body = String(fields.body ?? "");
    const interaction = fields.interaction as { occurredOn?: string } | undefined;
    const created = str(fields.createdAt) ?? row.updatedAt;
    const contactIds = (strs(fields.contactIds) ?? []).map((item) => labIdOf("contact", item));
    const eventIds = eventIdsOf(fields.eventRefs);
    return {
      account: ACCOUNT, body, id, title: str(fields.title) ?? body.slice(0, 40), updatedAt: str(fields.updatedAt) ?? row.updatedAt,
      writtenOn: str(interaction?.occurredOn) ?? localDay(created, options.timeZone),
      ...(contactIds.length ? { contactIds } : {}), ...(eventIds ? { eventIds } : {}),
    };
  };
  let exceptions: Promise<Map<string, NonNullable<ScheduleItem["exceptions"]>>> | null = null;
  // Moved / cancelled occurrences (personal_schedule_occurrence_exceptions holds only those, never a schedule item).
  const exceptionsOf = () => (exceptions ??= (async () => {
    const out = new Map<string, NonNullable<ScheduleItem["exceptions"]>>();
    try {
      const rows = await records.source.page({ accountId: scope.accountId, workspaceId: scope.workspaceId }, { collection: OCCURRENCE_EXCEPTIONS, denied: deniedOf(records), order: { direction: "asc", paths: [["occurrenceDate"]] } }, null, 1000);
      for (const row of rows) {
        if (row.userId !== scope.accountId) continue;
        const at = row.id.lastIndexOf(":occurrence:");
        if (at <= 0) continue;
        const series = row.id.slice(0, at);
        const day = row.id.slice(at + ":occurrence:".length);
        const patch = (row.payload.patch && typeof row.payload.patch === "object" ? row.payload.patch : {}) as Record<string, unknown>;
        out.set(series, [...(out.get(series) ?? []), { day, ...(row.payload.cancelled === true ? { cancelled: true } : {}), ...(str(patch.startsAt) ? { startsAt: str(patch.startsAt) } : {}), ...(str(patch.endsAt) ? { endsAt: str(patch.endsAt) } : {}) }]);
      }
    } catch (error) {
      // The series are still found; only a moved or cancelled occurrence is not known. Said, not hidden.
      emitTrace({ error: error instanceof Error ? error.message : String(error), type: "read.error", where: "finder.world.schedule_exceptions" });
    }
    return out;
  })());
  const scheduleOf = (item: RowsOut[number], own: NonNullable<ScheduleItem["exceptions"]> | undefined): ScheduleItem => {
    const { fields, row } = item;
    const id = labIdOf("schedule", row.id);
    loaded.set(id, fields);
    const frequency = fields.recurrence === "daily" || fields.recurrence === "weekly" || fields.recurrence === "monthly" ? fields.recurrence : undefined;
    const contactIds = (strs(fields.contactIds) ?? []).map((value) => labIdOf("contact", value));
    return {
      account: ACCOUNT, endsAt: str(fields.endsAt) ?? String(fields.startsAt), id, startsAt: String(fields.startsAt), title: String(fields.title),
      ...(fields.allDay === true ? { allDay: true } : {}), ...(frequency ? { recurrence: { frequency } } : {}), ...(own?.length ? { exceptions: own } : {}),
      ...(contactIds.length ? { contactIds } : {}), ...(str(fields.location) ? { location: str(fields.location) } : {}),
    };
  };

  const agentIds = (labIds: readonly string[], kind: AgentKind) => labIds.map(agentRefOf).filter((ref): ref is { kind: AgentKind; id: string } => ref?.kind === kind).map((ref) => ref.id);
  const uniq = <T extends { id: string }>(rows: T[]) => [...new Map(rows.map((row) => [row.id, row])).values()];
  async function union(collection: Collection, specs: RecordSpec[]): Promise<RowsOut> {
    const all = (await Promise.all(specs.map((spec) => query(collection, spec)))).flat();
    return [...new Map(all.map((item) => [item.row.id, item])).values()];
  }
  const emptyWorld = (): World => ({ aliases: [], attendance: [], contacts: [], memos: [], now: options.now, platformEvents: [], privateEvents: [], schedule: [], timeZone: options.timeZone, todos: [] });

  async function contactsById(labIds: readonly string[]): Promise<Contact[]> {
    const ids = agentIds(labIds, "contact");
    return ids.length ? (await query("contacts", { ...base("contacts", {}), ids }, ids.length)).map(contactOf) : [];
  }

  async function eventsPart(world: World, plan: FindPlan): Promise<void> {
    try {
      for (const event of records.listEvents ? await records.listEvents() : []) {
        // The same events the old eventCandidates keeps: published or the account's own, not archived, with a title.
        if (event.archivedAt || (event.lifecycleState !== "published" && event.organizerActorId !== scope.accountId) || !event.title || !event.startsAt) continue;
        const id = labIdOf("platform", event.eventId);
        loaded.set(id, { endsAt: event.endsAt, startsAt: event.startsAt, title: event.title, venue: event.venue });
        world.platformEvents.push({ endsAt: event.endsAt ?? event.startsAt, id, startsAt: event.startsAt, title: event.title, ...(event.venue ? { location: event.venue } : {}), ...(event.description ? { summary: event.description } : {}) } as PlatformEvent);
      }
      for (const event of records.privateEvents ? await records.privateEvents.list(scope.accountId) : []) {
        if (event.accountId !== scope.accountId) continue;
        const id = labIdOf("private", event.id);
        loaded.set(id, { allDay: event.allDay, endsAt: event.endsAt, startsAt: event.startsAt, title: event.title, venue: event.venue });
        world.privateEvents.push({ account: ACCOUNT, id, startsAt: event.startsAt, title: event.title, ...(event.endsAt ? { endsAt: event.endsAt } : {}), ...(event.allDay ? { allDay: true } : {}), ...(event.venue ? { location: event.venue } : {}) } as PrivateEvent);
      }
      if (plan.attendance) {
        for (const note of records.attendance ? await records.attendance.list(scope.accountId) : []) {
          if (note.accountId !== scope.accountId) continue;
          world.attendance.push({ account: ACCOUNT, eventId: labIdOf(note.eventRef.kind, note.eventRef.id), id: labIdOf("attendance", note.id), went: true } as Attendance);
        }
        for (const eventId of records.registeredEventIds ? await records.registeredEventIds(scope.accountId) : []) {
          const labId = labIdOf("platform", eventId);
          if (!world.attendance.some((item) => item.eventId === labId)) world.attendance.push({ account: ACCOUNT, eventId: labId, id: labIdOf("attendance", `registration:${eventId}`), went: false });
        }
      }
    } catch (error) {
      emitTrace({ error: error instanceof Error ? error.message : String(error), type: "read.error", where: "finder.world.events" });
      throw new WorldReadError("events", "SOURCE_UNAVAILABLE");
    }
  }

  return {
    loaded,
    reads: () => rowCount,
    async conversationWorld(input) {
      const world = emptyWorld();
      const contactIds = [...new Set(input.contacts)].slice(0, input.maxContacts);
      world.contacts = await contactsById(contactIds);
      let left = input.maxRecords;
      const take = async (collection: Collection, spec: RecordSpec, cap: number) => {
        if (cap <= 0 || left <= 0) return [] as RowsOut;
        const rows = (await query(collection, spec, Math.min(cap, left))).slice(0, left);
        left -= rows.length;
        return rows;
      };
      const rows: Record<"todos" | "memos" | "schedule", RowsOut> = { memos: [], schedule: [], todos: [] };
      // the newest records linked to the first few people, each query capped by an even share of what is left
      const people = agentIds(contactIds, "contact").slice(0, Math.max(0, input.linkedPeople));
      const specs: [Collection & keyof typeof rows, RecordSpec][] = people.flatMap((contactId) => (["todos", "memos", "schedule"] as const).map((collection) => [collection, base(collection, { contactId, order: "newest" })] as [Collection & keyof typeof rows, RecordSpec]));
      const share = specs.length ? Math.max(1, Math.floor(left / specs.length)) : 0;
      for (const [collection, spec] of specs) rows[collection].push(...(await take(collection, spec, share)));
      const dedupe = (items: RowsOut) => [...new Map(items.map((item) => [item.row.id, item])).values()];
      world.todos = dedupe(rows.todos).map(todoOf);
      world.memos = dedupe(rows.memos).map(memoOf);
      // (no occurrence exceptions: the engine reads titles, people and dates, and that read is not capped)
      world.schedule = dedupe(rows.schedule).map((item) => scheduleOf(item, undefined));
      return world;
    },
    async findWorld(fn, input) {
      // The lab code caches an index per World object: the plan is made on its own World, the lookup's World is new.
      const peopleWorld = emptyWorld();
      peopleWorld.contacts = await contactsById(input.people ?? []);
      const plan = planFind(input, peopleWorld);
      const world = emptyWorld();
      world.contacts = [...peopleWorld.contacts];
      const people = agentIds(plan.people, "contact");
      const shown = (kind: AgentKind) => agentIds(plan.shown, kind);
      const window = plan.window ? { from: plan.window.from, to: nextDay(plan.window.to) } : null;
      if (fn === "findTodosMemos") {
        const kinds = input.kinds ?? ["todo", "memo"];
        if (kinds.includes("todo")) {
          const status = input.status === "open" ? "open" : input.status === "done" ? "completed" : undefined;
          const own = status ? { status } : {};
          const specs = [
            ...plan.terms.map((term) => search("todos", term, own)),
            ...people.map((contactId) => base("todos", { contactId, ...own })),
            ...(window ? [base("todos", { from: window.from, to: window.to, ...own })] : []),
            ...(shown("todo").length ? [{ ...base("todos", {}), ids: shown("todo") }] : []),
          ];
          world.todos = (await union("todos", specs)).map(todoOf);
        }
        if (kinds.includes("memo")) {
          const specs = [
            ...plan.terms.map((term) => search("memos", term)),
            ...people.map((contactId) => base("memos", { contactId })),
            ...(window ? [base("memos", { from: window.from, to: window.to })] : []),
            ...(shown("memo").length ? [{ ...base("memos", {}), ids: shown("memo") }] : []),
          ];
          world.memos = (await union("memos", specs)).map(memoOf);
        }
      } else if (fn === "findSchedule") {
        const titleAndPlace = (term: string): RecordSpec => ({ ...base("schedule", {}), text: { paths: [["title"], ["location"]], value: term } });
        const specs = [
          ...plan.terms.map(titleAndPlace),
          ...people.map((contactId) => base("schedule", { contactId })),
          // the window: one-off items starting in it and repeating series (a series is kept when it started before the end)
          ...(window ? [base("schedule", { from: window.from, to: window.to })] : []),
          ...(shown("schedule").length ? [{ ...base("schedule", {}), ids: shown("schedule") }] : []),
        ];
        const rows = await union("schedule", specs);
        const ex = rows.some(({ fields }) => typeof fields.recurrence === "string") ? await exceptionsOf() : new Map();
        world.schedule = rows.map((item) => scheduleOf(item, ex.get(item.row.id)));
      } else if (fn === "findEvents") {
        await eventsPart(world, plan);
      } else {
        const specs = plan.terms.flatMap((term) => [search("contacts", term), search("contacts", term, { status: "company" as never })]);
        world.contacts = uniq([...world.contacts, ...(await union("contacts", specs)).map(contactOf)]);
      }
      emitTrace({ counts: { contacts: world.contacts.length, events: world.platformEvents.length + world.privateEvents.length, memos: world.memos.length, schedule: world.schedule.length, todos: world.todos.length }, fn, terms: plan.terms.length, type: "finder.world" });
      return world;
    },
    async personWorld(input) {
      const world = emptyWorld();
      const known = await contactsById([...(input.sessionPeople ?? []), ...(input.sentencePeople ?? [])]);
      const said = input.mention.replace(/^@/u, "").trim();
      const stage1 = await union("contacts", [...personTerms(said).map((term) => search("contacts", term)), ...(said.length >= 2 ? [search("contacts", said, { status: "within" as never })] : [])]);
      world.contacts = uniq([...stage1.map(contactOf), ...known]);
      const fallback = personFallback(said);
      // (a probe World of its own: the lab code caches an index per World object)
      if (!fallback.all && labResolvePerson(input, { ...world, contacts: [...world.contacts] }).some((item) => item.why !== "near")) return world;
      const specs = [...fallback.company.map((term) => search("contacts", term, { status: "company" as never })), ...fallback.chars.map((ch) => search("contacts", ch))];
      const more = fallback.all ? await query("contacts", base("contacts", {}), finderMaxContacts()) : await union("contacts", specs);
      if (fallback.all) emitTrace({ read: more.length, type: "finder.person_all_contacts" });
      world.contacts = uniq([...world.contacts, ...more.map(contactOf)]);
      return world;
    },
  };
}
