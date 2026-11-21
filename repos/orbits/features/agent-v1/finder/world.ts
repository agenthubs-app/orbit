/**
 * The record-finder lab's `World` (finder/types.ts), built for the signed-in account only from the agent's own record
 * access (graph/deps.ts AgentRecordAccess): the same store, collections, account + workspace scope, eval deny list, eval
 * read faults and field whitelist (each domain's `fieldsOf`) as the domain reads the old lookups use.
 *
 * - Isolation: every row comes from `source.page` scoped to the account and workspace in SQL, and is dropped again here
 *   unless its `userId` is the account (defence in depth); private events and «我去过» notes are read with the account's
 *   id and kept only when their `accountId` is the account. Platform events are the deployment's directory, kept as the
 *   old `eventCandidates` keeps them (published, or organised by the account; not archived). Every record is put in the
 *   World as account "A"; nothing of another account is ever loaded, so the lab's account filter has nothing to drop.
 * - Cheap: one page per collection (up to ORBIT_AGENT_FINDER_MAX_RECORDS rows, default 5000), loaded lazily per part and
 *   memoised per request; a part that hits the cap is traced (`finder.world_truncated`), never silently cut.
 * - Ids: lab ids are `<prefix>-<agent id>` (C contact, T to-do, M memo, S schedule item, E platform event, P private
 *   event, A attendance) — the lab code reads the P- prefix; `agentRefOf` maps them back.
 * - Not available in the agent and so empty: the per-account alias table (叫法表), contacts' industry and last interaction,
 *   deleted contacts (restore keeps the old ContactAccess.findDeleted path).
 */
import type { AgentRecordAccess } from "../graph/deps";
import type { DomainScope } from "../domains/types";
import type { RecordDomain } from "../domains/record-adapter";
import type { RecordRow } from "../domains/source";
import type { ReadInput } from "../../orbit-ai/data-query/read-contract";
import { CONTACT_DOMAIN } from "../domains/contact/read";
import { MEMO_DOMAIN } from "../domains/memo/read";
import { SCHEDULE_DOMAIN } from "../domains/schedule/read";
import { TODO_DOMAIN } from "../domains/todo/read";
import { OCCURRENCE_EXCEPTIONS } from "../domains/schedule/occurrences";
import { emitTrace, evalDeniedReads, takeEvalFault } from "../observability/trace";
import type { Attendance, Contact, Memo, PlatformEvent, PrivateEvent, ScheduleItem, Todo, World } from "./types";

export const ACCOUNT = "A" as const;
export type WorldPart = "contacts" | "todos" | "memos" | "schedule" | "events";
export type AgentKind = "contact" | "todo" | "memo" | "schedule" | "platform" | "private" | "attendance";

const PREFIX: Record<AgentKind, string> = { attendance: "A", contact: "C", memo: "M", platform: "E", private: "P", schedule: "S", todo: "T" };
const KIND_OF: Record<string, AgentKind> = Object.fromEntries(Object.entries(PREFIX).map(([kind, prefix]) => [prefix, kind as AgentKind]));

export const labIdOf = (kind: AgentKind, id: string) => `${PREFIX[kind]}-${id}`;

/** A lab id back to the agent's kind and id; null for an id this World did not make. */
export function agentRefOf(labId: string): { kind: AgentKind; id: string } | null {
  const at = labId.indexOf("-");
  const kind = at > 0 ? KIND_OF[labId.slice(0, at)] : undefined;
  return kind && labId.length > at + 1 ? { id: labId.slice(at + 1), kind } : null;
}

export function finderMaxRecords(env: Record<string, string | undefined> = process.env): number {
  const value = Number(env.ORBIT_AGENT_FINDER_MAX_RECORDS);
  return Number.isInteger(value) && value >= 10 && value <= 50_000 ? value : 5000;
}

/** A read the World needed could not be made (an eval fault, the store failing): callers say so, never "not found". */
export class WorldReadError extends Error {
  constructor(readonly part: WorldPart, message: string) {
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

interface Loaded { fields: Record<string, unknown>; row: RecordRow }

/** One page of the account's rows of a domain (list, every status the domain read keeps), whitelisted fields. */
async function rowsOf(access: AgentRecordAccess, scope: DomainScope, domain: RecordDomain, part: WorldPart, limit: number): Promise<Loaded[]> {
  const fault = takeEvalFault(`${domain.kind}.read`);
  if (fault) {
    emitTrace({ kind: fault.kind, note: "eval fault: the read source is unavailable", type: "read.fault", where: `${domain.kind}.read` });
    throw new WorldReadError(part, "SOURCE_UNAVAILABLE");
  }
  const spec = { ...domain.specOf({ operation: "list", query: "list" } as ReadInput), denied: deniedOf(access) };
  let rows: RecordRow[];
  try {
    rows = await access.source.page({ accountId: scope.accountId, workspaceId: scope.workspaceId }, spec, null, limit + 1);
  } catch (error) {
    emitTrace({ error: error instanceof Error ? error.message : String(error), type: "read.error", where: `finder.world.${domain.kind}` });
    throw new WorldReadError(part, "SOURCE_UNAVAILABLE");
  }
  if (rows.length > limit) emitTrace({ kind: domain.kind, limit, type: "finder.world_truncated" });
  const out: Loaded[] = [];
  for (const row of rows.slice(0, limit)) {
    if (row.userId !== scope.accountId) continue;
    const fields = domain.fieldsOf(row);
    if (fields) out.push({ fields, row });
  }
  return out;
}

export interface WorldLoader {
  /** The World holding at least these parts (contacts are always in it). One World object per set of parts, memoised. */
  world(parts: readonly WorldPart[]): Promise<World>;
  /** The agent's own records behind a lab id, as loaded (for cards and labels without another read). */
  loaded: Map<string, Record<string, unknown>>;
}

export interface WorldOptions {
  records: AgentRecordAccess;
  scope: DomainScope;
  now: string;
  timeZone: string;
  maxRecords?: number;
}

export function createWorldLoader(options: WorldOptions): WorldLoader {
  const { records, scope } = options;
  const limit = options.maxRecords ?? finderMaxRecords();
  const loaded = new Map<string, Record<string, unknown>>();
  const parts = new Map<WorldPart, Promise<Partial<World>>>();
  const worlds = new Map<string, Promise<World>>();

  const load = (part: WorldPart): Promise<Partial<World>> => {
    let hit = parts.get(part);
    if (!hit) {
      hit = loadPart(part);
      parts.set(part, hit);
    }
    return hit;
  };

  async function loadPart(part: WorldPart): Promise<Partial<World>> {
    switch (part) {
      case "contacts": {
        const contacts: Contact[] = (await rowsOf(records, scope, CONTACT_DOMAIN, part, limit)).map(({ fields, row }) => {
          const id = labIdOf("contact", row.id);
          loaded.set(id, fields);
          return { account: ACCOUNT, id, name: String(fields.displayName), ...(str(fields.company) ? { company: str(fields.company) } : {}), ...(str(fields.headline) ? { title: str(fields.headline) } : {}) };
        });
        return { contacts };
      }
      case "todos": {
        const todos: Todo[] = (await rowsOf(records, scope, TODO_DOMAIN, part, limit)).map(({ fields, row }) => {
          const id = labIdOf("todo", row.id);
          loaded.set(id, fields);
          const contactIds = (strs(fields.contactIds) ?? (str(fields.contactId) ? [String(fields.contactId)] : [])).map((item) => labIdOf("contact", item));
          const eventIds = eventIdsOf(fields.eventRefs);
          return {
            account: ACCOUNT, createdAt: str(fields.createdAt) ?? row.updatedAt, id, status: fields.status === "completed" ? "done" : "open", title: String(fields.title), updatedAt: str(fields.updatedAt) ?? row.updatedAt,
            ...(str(fields.description) ? { notes: str(fields.description) } : {}), ...(contactIds.length ? { contactIds } : {}), ...(eventIds ? { eventIds } : {}),
            ...(str(fields.plannedDate) ? { plannedDate: str(fields.plannedDate) } : {}), ...(str(fields.dueAt) ? { dueAt: str(fields.dueAt) } : {}),
          };
        });
        return { todos };
      }
      case "memos": {
        const memos: Memo[] = (await rowsOf(records, scope, MEMO_DOMAIN, part, limit)).map(({ fields, row }) => {
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
        });
        return { memos };
      }
      case "schedule": {
        const items = await rowsOf(records, scope, SCHEDULE_DOMAIN, part, limit);
        const exceptions = new Map<string, NonNullable<ScheduleItem["exceptions"]>>();
        if (items.some(({ fields }) => typeof fields.recurrence === "string")) {
          try {
            const rows = await records.source.page({ accountId: scope.accountId, workspaceId: scope.workspaceId }, { collection: OCCURRENCE_EXCEPTIONS, denied: deniedOf(records), order: { direction: "asc", paths: [["occurrenceDate"]] } }, null, limit);
            for (const row of rows) {
              if (row.userId !== scope.accountId) continue;
              const at = row.id.lastIndexOf(":occurrence:");
              if (at <= 0) continue;
              const series = row.id.slice(0, at);
              const day = row.id.slice(at + ":occurrence:".length);
              const patch = (row.payload.patch && typeof row.payload.patch === "object" ? row.payload.patch : {}) as Record<string, unknown>;
              const list = exceptions.get(series) ?? [];
              list.push({ day, ...(row.payload.cancelled === true ? { cancelled: true } : {}), ...(str(patch.startsAt) ? { startsAt: str(patch.startsAt) } : {}), ...(str(patch.endsAt) ? { endsAt: str(patch.endsAt) } : {}) });
              exceptions.set(series, list);
            }
          } catch (error) {
            // The series are still found; only a moved or cancelled occurrence is not known. Said, not hidden.
            emitTrace({ error: error instanceof Error ? error.message : String(error), type: "read.error", where: "finder.world.schedule_exceptions" });
          }
        }
        const schedule: ScheduleItem[] = items.map(({ fields, row }) => {
          const id = labIdOf("schedule", row.id);
          loaded.set(id, fields);
          const frequency = fields.recurrence === "daily" || fields.recurrence === "weekly" || fields.recurrence === "monthly" ? fields.recurrence : undefined;
          const contactIds = (strs(fields.contactIds) ?? []).map((item) => labIdOf("contact", item));
          const own = exceptions.get(row.id);
          return {
            account: ACCOUNT, endsAt: str(fields.endsAt) ?? String(fields.startsAt), id, startsAt: String(fields.startsAt), title: String(fields.title),
            ...(fields.allDay === true ? { allDay: true } : {}), ...(frequency ? { recurrence: { frequency } } : {}), ...(own?.length ? { exceptions: own } : {}),
            ...(contactIds.length ? { contactIds } : {}), ...(str(fields.location) ? { location: str(fields.location) } : {}),
          };
        });
        return { schedule };
      }
      case "events": {
        const platformEvents: PlatformEvent[] = [];
        const privateEvents: PrivateEvent[] = [];
        const attendance: Attendance[] = [];
        try {
          for (const event of records.listEvents ? await records.listEvents() : []) {
            // The same events the old eventCandidates keeps: published or the account's own, not archived, with a title.
            if (event.archivedAt || (event.lifecycleState !== "published" && event.organizerActorId !== scope.accountId) || !event.title || !event.startsAt) continue;
            const id = labIdOf("platform", event.eventId);
            loaded.set(id, { endsAt: event.endsAt, startsAt: event.startsAt, title: event.title, venue: event.venue });
            platformEvents.push({ endsAt: event.endsAt ?? event.startsAt, id, startsAt: event.startsAt, title: event.title, ...(event.venue ? { location: event.venue } : {}), ...(event.description ? { summary: event.description } : {}) });
          }
          for (const event of records.privateEvents ? await records.privateEvents.list(scope.accountId) : []) {
            if (event.accountId !== scope.accountId) continue;
            const id = labIdOf("private", event.id);
            loaded.set(id, { allDay: event.allDay, endsAt: event.endsAt, startsAt: event.startsAt, title: event.title, venue: event.venue });
            privateEvents.push({ account: ACCOUNT, id, startsAt: event.startsAt, title: event.title, ...(event.endsAt ? { endsAt: event.endsAt } : {}), ...(event.allDay ? { allDay: true } : {}), ...(event.venue ? { location: event.venue } : {}) });
          }
          for (const note of records.attendance ? await records.attendance.list(scope.accountId) : []) {
            if (note.accountId !== scope.accountId) continue;
            attendance.push({ account: ACCOUNT, eventId: labIdOf(note.eventRef.kind, note.eventRef.id), id: labIdOf("attendance", note.id), went: true });
          }
          for (const eventId of records.registeredEventIds ? await records.registeredEventIds(scope.accountId) : []) {
            const labId = labIdOf("platform", eventId);
            if (!attendance.some((item) => item.eventId === labId)) attendance.push({ account: ACCOUNT, eventId: labId, id: labIdOf("attendance", `registration:${eventId}`), went: false });
          }
        } catch (error) {
          emitTrace({ error: error instanceof Error ? error.message : String(error), type: "read.error", where: "finder.world.events" });
          throw new WorldReadError(part, "SOURCE_UNAVAILABLE");
        }
        return { attendance, platformEvents, privateEvents };
      }
    }
  }

  return {
    loaded,
    world(wanted) {
      const set = [...new Set<WorldPart>(["contacts", ...wanted])].sort();
      const key = set.join("+");
      let hit = worlds.get(key);
      if (!hit) {
        hit = (async () => {
          const got = await Promise.all(set.map(load));
          const world: World = { aliases: [], attendance: [], contacts: [], memos: [], now: options.now, platformEvents: [], privateEvents: [], schedule: [], timeZone: options.timeZone, todos: [] };
          for (const part of got) Object.assign(world, part);
          emitTrace({ counts: { contacts: world.contacts.length, events: world.platformEvents.length + world.privateEvents.length, memos: world.memos.length, schedule: world.schedule.length, todos: world.todos.length }, parts: set, type: "finder.world" });
          return world;
        })();
        // A failed load is not memoised: the next lookup of the request tries again.
        hit.catch(() => {
          worlds.delete(key);
          for (const part of set) parts.delete(part);
        });
        worlds.set(key, hit);
      }
      return hit;
    },
  };
}
