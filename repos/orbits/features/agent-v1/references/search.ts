/**
 * AG11 (设计稿 §3.6, §10「@ 选择器」; 获批视觉稿 D3、D4): what the @ picker lists — the account's own contacts, memos,
 * to-dos, schedule items and «我去过» notes, and the events the account may see (platform events and its own private
 * events), found by name. Only the account's own records: the reads go through the same domain adapters (scope from the
 * server's authentication, the eval deny list honoured). Each kind gives at most `limit` and says whether there are more;
 * same-named records come with what tells them apart (company and role for a person, people and date for a memo, the due
 * day for a to-do, the time for a schedule item or event, the day for «我去过»).
 *
 * This is a list for the user to pick from, not something the Agent reads: nothing here reaches a model.
 */
import type { AgentReferenceCandidateContract, AgentReferenceCheckResultContract, AgentReferenceSearchKind, AgentReferenceSearchResultContract } from "../../../shared/contract/agent-v1";
import { authorizeReferences } from "./authorize";
import type { AgentRecordAccess } from "../graph/deps";
import type { DomainKind, RecordView } from "../domains/types";

export const REFERENCE_SEARCH_KINDS: readonly AgentReferenceSearchKind[] = ["contact", "memo", "todo", "schedule", "event", "attendance"];
export const REFERENCE_SEARCH_LIMIT = 5;
export const REFERENCE_QUERY_MAX = 80;

const text = (value: unknown) => (typeof value === "string" && value.trim() ? value.trim() : undefined);
const matches = (title: string, query: string) => !query || title.toLowerCase().includes(query.toLowerCase());

/**
 * AG11 (视觉稿 D7): whether picked records can still be opened (a restored draft, before sending). The same check the
 * server runs on every turn (references/authorize.ts); a record that cannot be opened shows as 「打不开了」 and may still
 * be sent.
 */
export async function checkReferences(access: AgentRecordAccess, actorId: string, references: readonly { type: AgentReferenceSearchKind; id: string; eventKind?: "platform" | "private" | undefined }[]): Promise<AgentReferenceCheckResultContract> {
  const authorized = await authorizeReferences(access.reader, access.scope(actorId), references);
  const byKey = new Map(authorized.map((item) => [`${item.type}:${item.id}`, item]));
  return {
    references: references.map((reference) => {
      const item = byKey.get(`${reference.type}:${reference.id}`);
      return { accessible: Boolean(item?.accessible), id: reference.id, name: item?.accessible ? item.name : null, type: reference.type };
    }),
  };
}

export interface ReferenceSearchInput {
  query: string;
  /** One kind only (a filter button); all six when absent. */
  kind?: AgentReferenceSearchKind | undefined;
  limit?: number | undefined;
}

export async function searchReferences(access: AgentRecordAccess, actorId: string, input: ReferenceSearchInput): Promise<AgentReferenceSearchResultContract> {
  const query = input.query.trim().replace(/^@/u, "").slice(0, REFERENCE_QUERY_MAX);
  const limit = Math.min(Math.max(input.limit ?? REFERENCE_SEARCH_LIMIT, 1), 10);
  const scope = access.scope(actorId);
  const kinds = input.kind ? [input.kind] : REFERENCE_SEARCH_KINDS;
  const contactNames = new Map<string, string | null>();
  const nameOfContact = async (id: string) => {
    if (!contactNames.has(id)) {
      const view = (await access.reader.read("contact", scope, { id }).catch(() => null))?.items[0];
      contactNames.set(id, text(view?.fields.displayName) ?? null);
    }
    return contactNames.get(id) ?? null;
  };
  const readKind = async (kind: Exclude<DomainKind, "event">): Promise<RecordView[]> => {
    const result = await access.reader.read(kind, scope, { ...(query ? { text: query } : {}), limit: limit + 1, order: "newest" });
    return result.items;
  };

  const groups = await Promise.all(kinds.map(async (kind): Promise<{ type: AgentReferenceSearchKind; items: AgentReferenceCandidateContract[]; more: boolean; unavailable?: boolean }> => {
    try {
      return await searchKind(kind);
    } catch {
      return { items: [], more: false, type: kind, unavailable: true };
    }
  }));
  return { groups, query };

  async function searchKind(kind: AgentReferenceSearchKind): Promise<{ type: AgentReferenceSearchKind; items: AgentReferenceCandidateContract[]; more: boolean }> {
    let items: AgentReferenceCandidateContract[] = [];
    switch (kind) {
      case "contact":
        items = (await readKind("contact")).map((view) => ({ detail: { company: text(view.fields.company), role: text(view.fields.headline) }, id: view.id, name: text(view.fields.displayName) ?? "", type: "contact" }));
        break;
      case "memo":
        items = await Promise.all((await readKind("memo")).map(async (view) => {
          const ids = Array.isArray(view.fields.contactIds) ? (view.fields.contactIds as unknown[]).map(String).slice(0, 2) : [];
          const people = (await Promise.all(ids.map(nameOfContact))).filter((name): name is string => Boolean(name));
          return { detail: { date: text(view.fields.createdAt), dateKind: "written" as const, ...(people.length ? { people } : {}) }, id: view.id, name: text(view.fields.title) ?? text(view.fields.snippet) ?? "", type: "memo" as const };
        }));
        break;
      case "todo":
        items = (await readKind("todo")).map((view) => ({ detail: { date: text(view.fields.dueAt) ?? text(view.fields.plannedDate), dateKind: "due" as const }, id: view.id, name: text(view.fields.title) ?? "", type: "todo" as const }));
        break;
      case "schedule":
        items = (await readKind("schedule")).map((view) => ({ detail: { date: text(view.fields.startsAt), dateKind: "at" as const, place: text(view.fields.location) }, id: view.id, name: text(view.fields.title) ?? "", type: "schedule" as const }));
        break;
      case "event": {
        const visible = (await access.listEvents?.().catch(() => []) ?? [])
          .filter((event) => !event.archivedAt && (event.lifecycleState === "published" || event.organizerActorId === actorId) && event.title && matches(event.title, query))
          .map((event): AgentReferenceCandidateContract => ({ detail: { date: event.startsAt ?? undefined, dateKind: "at", place: event.venue ?? undefined }, eventKind: "platform", id: event.eventId, name: event.title!, type: "event" }));
        const own = (await access.privateEvents?.list(actorId).catch(() => []) ?? [])
          .filter((event) => matches(event.title, query))
          .map((event): AgentReferenceCandidateContract => ({ detail: { date: event.startsAt, dateKind: "at", place: event.venue }, eventKind: "private", id: event.id, name: event.title, type: "event" }));
        items = [...own, ...visible].sort((left, right) => String(right.detail.date ?? "").localeCompare(String(left.detail.date ?? "")));
        break;
      }
      case "attendance": {
        const notes = await access.attendance?.list(actorId).catch(() => []) ?? [];
        const privateTitles = new Map((await access.privateEvents?.list(actorId).catch(() => []) ?? []).map((event) => [event.id, event.title]));
        const platformIds = notes.filter((note) => note.eventRef.kind === "platform").map((note) => note.eventRef.id);
        const platform = platformIds.length ? await (access.eventsByIds ? access.eventsByIds(platformIds) : Promise.resolve([])).catch(() => []) : [];
        const platformTitles = new Map<string, string>(platform.map((event): [string, string] => [event.eventId, event.title ?? ""]));
        items = notes
          .map((note): AgentReferenceCandidateContract => ({ detail: { date: note.attendedOn, dateKind: "on" }, id: note.id, name: (note.eventRef.kind === "private" ? privateTitles.get(note.eventRef.id) : platformTitles.get(note.eventRef.id)) ?? "", type: "attendance" }))
          .filter((item) => item.name && matches(item.name, query))
          .sort((left, right) => String(right.detail.date ?? "").localeCompare(String(left.detail.date ?? "")));
        break;
      }
    }
    items = items.filter((item) => item.name);
    return { items: items.slice(0, limit), more: items.length > limit, type: kind };
  }
}
