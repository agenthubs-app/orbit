/**
 * agent-design AG13: the names of what a record read this turn links to — a to-do's people and events, a schedule item's
 * people, notes and events, a memo's events — so the answer step can say them ("关联了李薇、山本直子和大学同学聚会") from the
 * materials, never from a guess. Read by id from the account's own records and the events it may see; a link that cannot
 * be read stays unnamed (the material then says "a contact" / "an event").
 */
import type { AgentRecordAccess } from "../graph/deps";
import type { DomainScope, RecordView } from "../domains/types";
import { emitTrace } from "../observability/trace";

const ids = (value: unknown) => (Array.isArray(value) ? value.filter((item): item is string => typeof item === "string" && Boolean(item)) : []);

/** Adds to `names`: contact id → name, memo id → title, "platform:<id>" / "private:<id>" → event title. */
export async function addLinkNames(records: AgentRecordAccess, scope: DomainScope, views: readonly RecordView[], names: Map<string, string>): Promise<void> {
  const contacts = new Set<string>();
  const memos = new Set<string>();
  const events = new Set<string>();
  for (const view of views) {
    const fields = view.fields as Record<string, unknown>;
    if (view.kind === "todo" || view.kind === "schedule") for (const id of ids(fields.contactIds)) contacts.add(id);
    if (view.kind === "schedule") for (const id of ids(fields.noteIds)) memos.add(id);
    if (view.kind === "todo" || view.kind === "schedule" || view.kind === "memo") for (const ref of ids(fields.eventRefs)) events.add(ref);
  }
  try {
    for (const id of [...contacts].filter((item) => !names.has(item)).slice(0, 20)) {
      const view = (await records.reader.read("contact", scope, { id }).catch(() => null))?.items[0];
      if (view) names.set(id, String(view.fields.displayName ?? ""));
    }
    for (const id of [...memos].filter((item) => !names.has(item)).slice(0, 20)) {
      const view = (await records.reader.read("memo", scope, { id }).catch(() => null))?.items[0];
      if (view) names.set(id, String(view.fields.title ?? "").trim() || String(view.fields.body ?? "").slice(0, 24));
    }
    const wanted = [...events].filter((ref) => !names.has(ref));
    if (wanted.some((ref) => ref.startsWith("platform:")) && records.listEvents) {
      const all = await records.listEvents().catch(() => []);
      for (const ref of wanted.filter((item) => item.startsWith("platform:"))) {
        const event = all.find((item) => item.eventId === ref.slice("platform:".length));
        if (event?.title) names.set(ref, event.title);
      }
    }
    if (wanted.some((ref) => ref.startsWith("private:")) && records.privateEvents) {
      for (const ref of wanted.filter((item) => item.startsWith("private:"))) {
        const event = await records.privateEvents.get(scope.accountId, ref.slice("private:".length)).catch(() => null);
        if (event) names.set(ref, event.title);
      }
    }
  } catch (error) {
    emitTrace({ error: error instanceof Error ? error.message : String(error), type: "read.error", where: "answer.link_names" });
  }
}
