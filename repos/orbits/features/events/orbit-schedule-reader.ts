import { createConfiguredPostgresLiveRecordStore } from "../../shared/storage/configured-live-record-store";
import type { LiveRecord } from "../../shared/storage/live-record-store";

export interface OrbitScheduleItem {
  id: string;
  eventId: string;
  kind: "meeting" | "event" | "personal";
  category: "relationship" | "meeting" | "event" | "work" | "personal" | "other";
  title: string;
  startsAt: string;
  endsAt?: string;
  location?: string;
  sourceId: string;
  evidenceIds: readonly string[];
}

const scheduleKinds = new Set(["meeting", "event", "personal"]);
const scheduleCategories = new Set(["relationship", "meeting", "event", "work", "personal", "other"]);

export function orbitScheduleItemFromLiveRecord(
  record: LiveRecord<Record<string, unknown>>,
  actorId: string,
): OrbitScheduleItem | null {
  const payload = record.payload;
  if (record.userId !== actorId && payload.accountId !== actorId) return null;
  if (
    typeof payload.id !== "string" ||
    typeof payload.eventId !== "string" ||
    typeof payload.title !== "string" ||
    typeof payload.startsAt !== "string"
  ) {
    return null;
  }
  const kind = typeof payload.kind === "string" && scheduleKinds.has(payload.kind)
    ? payload.kind as OrbitScheduleItem["kind"]
    : "event";
  const category = typeof payload.category === "string" && scheduleCategories.has(payload.category)
    ? payload.category as OrbitScheduleItem["category"]
    : kind;
  return {
    category,
    eventId: payload.eventId,
    evidenceIds: Array.isArray(payload.evidenceIds)
      ? payload.evidenceIds.filter((value): value is string => typeof value === "string")
      : [],
    id: payload.id,
    kind,
    ...(typeof payload.location === "string" ? { location: payload.location } : {}),
    sourceId: typeof payload.sourceId === "string" ? payload.sourceId : payload.eventId,
    startsAt: payload.startsAt,
    ...(typeof payload.endsAt === "string" ? { endsAt: payload.endsAt } : {}),
    title: payload.title,
  };
}

export async function listConfiguredOrbitScheduleItems(
  actorId?: string | null,
): Promise<
  readonly OrbitScheduleItem[]
> {
  const normalizedActorId = actorId?.trim();
  if (!normalizedActorId) return [];

  const configured =
    createConfiguredPostgresLiveRecordStore<Record<string, unknown>>();
  if (!configured) return [];
  const records = await configured.store.listRecords({
    workspaceId: configured.workspaceId,
    collectionName: "orbitScheduleItems",
  });
  return records.flatMap((record) => {
    const item = orbitScheduleItemFromLiveRecord(record, normalizedActorId);
    return item ? [item] : [];
  });
}
