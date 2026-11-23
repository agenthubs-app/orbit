/**
 * agent-design AG05 test kit: two accounts' records in the memory record source (same meaning as the
 * Postgres source), a platform-event source and the domain registry over them.
 */
import type { CanonicalEventRecord } from "../../features/events/core/contract";
import { createDomainRegistry } from "../../features/agent-v1/domains/registry";
import { createMemoryRecordSource, type MemoryRecord } from "../../features/agent-v1/domains/source";
import type { DomainScope } from "../../features/agent-v1/domains/types";

export const WORKSPACE = "workspace:test";
export const A = "user:a";
export const B = "user:b";
export const scopeOf = (accountId: string): DomainScope => ({ accountId, authorizationEpoch: "agent-v1", workspaceId: WORKSPACE });
export const CURSOR_KEY = new Uint8Array(Buffer.from("agent-v1-test-cursor-key-0123456789abcdef"));

export function contact(userId: string, id: string, name: string, extra: Record<string, unknown> = {}): MemoryRecord {
  return { collection: "contacts", id, payload: { accountId: userId, displayName: name, id, primaryEmail: `${id}@example.test`, primaryPhone: "+81-90-0000-0000", updatedAt: "2026-06-10T05:00:00.000Z", ...extra }, searchText: `${name} ${id}@example.test`, userId, workspaceId: WORKSPACE };
}

export function memo(userId: string, id: string, body: string, createdAt: string, contactIds: string[] = [], extra: Record<string, unknown> = {}): MemoryRecord {
  const title = String(extra.title ?? body.slice(0, 12));
  return { collection: "notes", id, payload: { note: { accountId: userId, body, contactIds, createdAt, eventIds: [], id, ownerUserId: userId, title, updatedAt: createdAt, version: 1, ...extra } }, searchText: `${title}\n${body}`, userId, workspaceId: WORKSPACE };
}

export function todo(userId: string, id: string, title: string, extra: Record<string, unknown> = {}): MemoryRecord {
  return { collection: "tasks", id, payload: { task: { accountId: userId, createdAt: "2026-11-01T00:00:00.000Z", id, status: "open", title, updatedAt: "2026-11-02T00:00:00.000Z", ...extra } }, searchText: title, userId, workspaceId: WORKSPACE };
}

export function schedule(userId: string, id: string, title: string, startsAt: string, extra: Record<string, unknown> = {}): MemoryRecord {
  return { collection: "personal_schedule_items", id, payload: { accountId: userId, id, startsAt, title, updatedAt: "2026-11-09T00:00:00.000Z", ...extra }, userId, workspaceId: WORKSPACE };
}

export function platformEvent(id: string, title: string, startsAt: string, venue: string, extra: Partial<CanonicalEventRecord> = {}): CanonicalEventRecord {
  return { archivedAt: null, cancelledAt: null, description: null, endsAt: null, eventId: id, eventVersion: 1, lifecycleState: "published" as CanonicalEventRecord["lifecycleState"], organizerActorId: "user:host", publicCode: "x", sourcePayload: {}, startsAt, timezone: "Asia/Tokyo", title, venue, workspaceId: WORKSPACE, ...extra };
}

/** The small world: account A has 小林健 with two notes and a to-do; account B has 小林诚 and a note. */
export function smallWorld(): { records: MemoryRecord[]; events: CanonicalEventRecord[] } {
  return {
    events: [platformEvent("event:e103", "SaaS 定价研讨会", "2026-11-19T10:00:00.000Z", "丸之内"), platformEvent("event:draft", "草稿活动", "2026-12-01T10:00:00.000Z", "未定", { lifecycleState: "draft" as CanonicalEventRecord["lifecycleState"] })],
    records: [
      contact(A, "contact:c17", "小林健", { organization: "北辰软件", role: "销售总监" }),
      contact(A, "contact:c30", "田中浩", { organization: "东和商事", role: "采购主管" }),
      memo(A, "note:m31", "和小林聊了报价初稿。小林希望把实施费单列，下周再对一次。", "2026-11-12T09:30:00.000Z", ["contact:c17"]),
      memo(A, "note:m32", "11 月 10 日小林给我打电话，说小陈在审核。我答应 11 月 13 日给小林发报价。", "2026-11-10T11:00:00.000Z", ["contact:c17"]),
      memo(A, "note:m37", "田中说他们最在意交付周期，报价可以分两期，希望月底前看到修订版。", "2026-11-11T07:00:00.000Z", ["contact:c30"], { title: "客户访谈" }),
      todo(A, "task:t42", "给小林发修订报价", { plannedDate: "2026-11-18", relatedContactId: "contact:c17" }),
      schedule(A, "personal:s10", "团队周会", "2026-11-16T01:00:00.000Z", { recurrence: { frequency: "weekly" } }),
      contact(B, "contact:cb1", "小林诚", { organization: "乙方客户公司" }),
      memo(B, "note:mb1", "乙的客户笔记：小林诚要求年底前降价 15%。", "2026-11-12T01:00:00.000Z", ["contact:cb1"]),
      todo(B, "task:tb1", "给小林诚回电", { relatedContactId: "contact:cb1" }),
      schedule(B, "personal:sb1", "乙的周会", "2026-11-16T01:00:00.000Z"),
    ],
  };
}

/** The small world without A's notes, plus `count` generated notes about 小林健 (one a day, oldest first). */
export function pagedWorld(count: number): { records: MemoryRecord[]; events: CanonicalEventRecord[] } {
  const world = smallWorld();
  const records = world.records.filter((record) => !(record.collection === "notes" && record.userId === A));
  for (let index = 0; index < count; index += 1) {
    const createdAt = new Date(Date.UTC(2026, 0, 1 + index)).toISOString();
    records.push(memo(A, `note:gen${String(index).padStart(3, "0")}`, `第 ${index} 篇${index % 7 === 3 ? "，谈了灰釉" : ""}`, createdAt, ["contact:c17"]));
  }
  return { events: world.events, records };
}

export function readKit(world = smallWorld(), options: { denied?: Set<string>; now?: string } = {}) {
  const source = createMemoryRecordSource(world.records);
  const eventReads: string[] = [];
  const events = { async byIds(ids: readonly string[]) { eventReads.push(...ids); return world.events.filter((event) => ids.includes(event.eventId)); } };
  const denied = options.denied ?? new Set<string>();
  const registry = createDomainRegistry({ cursorKey: CURSOR_KEY, denied: () => denied, events, now: () => options.now ?? "2026-11-15T01:00:00.000Z", source });
  return { denied, eventReads, events, registry, source };
}
