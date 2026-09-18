import { AppError } from "../../shared/errors/app-error";
import type { LiveRecordStoreLike } from "../../shared/storage/live-record-store";
import { canonicalScheduleItemSchema, type CanonicalScheduleItem } from "./authority-contract";

export const CANONICAL_SCHEDULE_COLLECTION = "personal_schedule_items" as const;

function stateAt(item: CanonicalScheduleItem, now: string): CanonicalScheduleItem["state"] {
  if (item.state === "cancelled") return "cancelled";
  const current = Date.parse(now);
  if (current < Date.parse(item.startsAt)) return "upcoming";
  if (item.endsAt && current < Date.parse(item.endsAt)) return "ongoing";
  return "ended";
}

function publicItem(item: CanonicalScheduleItem, now: string): CanonicalScheduleItem {
  return { ...item, state: stateAt(item, now) };
}

export function createScheduleAuthorityService(input: {
  store: LiveRecordStoreLike<Record<string, unknown>>;
  workspaceId: string;
  now?: () => string;
}) {
  const now = input.now ?? (() => new Date().toISOString());

  async function getOwned(actorId: string, id: string): Promise<CanonicalScheduleItem | null> {
    const record = await input.store.getRecord({
      collectionName: CANONICAL_SCHEDULE_COLLECTION,
      recordId: id,
      workspaceId: input.workspaceId,
    });
    if (!record || record.userId !== actorId) return null;
    const item = canonicalScheduleItemSchema.parse(record.payload);
    return item.accountId === actorId && item.ownerUserId === actorId ? item : null;
  }

  async function persist(item: CanonicalScheduleItem): Promise<CanonicalScheduleItem> {
    const parsed = canonicalScheduleItemSchema.parse(item);
    await input.store.upsertRecord({
      collectionName: CANONICAL_SCHEDULE_COLLECTION,
      createdAt: parsed.createdAt,
      evidenceIds: parsed.evidenceIds,
      lifecycleState: parsed.state === "cancelled" ? "deleted" : "active",
      ...(parsed.state === "cancelled" ? { deletedAt: parsed.updatedAt } : {}),
      occurredAt: parsed.startsAt,
      payload: parsed,
      recordId: parsed.id,
      searchText: [parsed.title, parsed.details, parsed.location].filter(Boolean).join(" "),
      sourceId: parsed.sourceId,
      sourceLabel: "Canonical Orbit schedule item",
      sourceType: "agent_action",
      targetId: parsed.eventId ?? parsed.meetingId ?? parsed.contactId,
      targetType: parsed.eventId ? "event" : parsed.contactId ? "contact" : undefined,
      updatedAt: parsed.updatedAt,
      userId: parsed.ownerUserId,
      workspaceId: input.workspaceId,
    });
    return publicItem(parsed, now());
  }

  return {
    async get({ actorId, id }: { actorId: string; id: string }) {
      const item = await getOwned(actorId, id);
      return item ? publicItem(item, now()) : null;
    },
    async list({ actorId, includeCancelled = false }: { actorId: string; includeCancelled?: boolean }) {
      const records = await input.store.listRecords({
        limit: "unbounded",
        collectionName: CANONICAL_SCHEDULE_COLLECTION,
        includeDeleted: includeCancelled,
        userId: actorId,
        workspaceId: input.workspaceId,
      });
      return records.flatMap((record) => {
        const parsed = canonicalScheduleItemSchema.safeParse(record.payload);
        if (!parsed.success || parsed.data.accountId !== actorId || parsed.data.ownerUserId !== actorId) return [];
        const item = publicItem(parsed.data, now());
        return includeCancelled || item.state !== "cancelled" ? [item] : [];
      });
    },
    async saveEvent(command: {
      actorId: string;
      allDay?: boolean;
      id: string;
      eventId: string;
      title: string;
      timeZone?: string;
      startsAt: string;
      endsAt?: string;
      location?: string;
      meetingMethod?: CanonicalScheduleItem["meetingMethod"];
      details?: string;
      evidenceIds: readonly string[];
      now?: string;
    }) {
      const at = command.now ?? now();
      const existing = await getOwned(command.actorId, command.id);
      const item = canonicalScheduleItemSchema.parse({
        accountId: command.actorId,
        ...(command.allDay !== undefined ? { allDay: command.allDay } : {}),
        category: "event",
        createdAt: existing?.createdAt ?? at,
        ...(command.details ? { details: command.details } : {}),
        ...(command.endsAt ? { endsAt: command.endsAt } : {}),
        eventId: command.eventId,
        evidenceIds: [...command.evidenceIds],
        id: command.id,
        kind: "event",
        ...(command.location ? { location: command.location } : {}),
        ...(command.meetingMethod ? { meetingMethod: command.meetingMethod } : {}),
        ownerUserId: command.actorId,
        sourceId: command.eventId,
        startsAt: command.startsAt,
        state: "upcoming",
        title: command.title,
        ...(command.timeZone ? { timeZone: command.timeZone } : {}),
        updatedAt: existing?.updatedAt ?? at,
      });
      if (existing) {
        const comparable = (value: CanonicalScheduleItem) => JSON.stringify({
          ...value,
          state: "upcoming",
          updatedAt: item.updatedAt,
        });
        if (comparable(existing) !== comparable(item)) {
          throw new AppError("CONFLICT", "Schedule item already exists with different content.");
        }
        return publicItem(existing, at);
      }
      return persist(item);
    },
    async cancel({ actorId, id }: { actorId: string; id: string }) {
      const item = await getOwned(actorId, id);
      if (!item) throw new AppError("NOT_FOUND", "Schedule item was not found.");
      if (item.state === "cancelled") return item;
      return persist({ ...item, state: "cancelled", updatedAt: now() });
    },
  };
}

export type ScheduleAuthorityService = ReturnType<typeof createScheduleAuthorityService>;
