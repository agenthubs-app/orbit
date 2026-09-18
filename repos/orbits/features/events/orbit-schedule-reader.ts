import { createConfiguredPostgresLiveRecordStore } from "../../shared/storage/configured-live-record-store";
import type { LiveRecord } from "../../shared/storage/live-record-store";
import { canonicalScheduleItemSchema } from "../personal-schedule/authority-contract";
import { CANONICAL_SCHEDULE_COLLECTION } from "../personal-schedule/authority-service";

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
  details?: string;
  meetingMethod?: "in_person" | "phone" | "video" | "unspecified";
}

const scheduleKinds = new Set(["meeting", "event", "personal"]);
const scheduleCategories = new Set(["relationship", "meeting", "event", "work", "personal", "other"]);

export function orbitScheduleItemFromLiveRecord(
  record: LiveRecord<Record<string, unknown>>,
  actorId: string,
): OrbitScheduleItem | null {
  const payload = record.payload;
  if (record.userId !== actorId || (payload.accountId !== undefined && payload.accountId !== actorId)) return null;
  if (record.collectionName === CANONICAL_SCHEDULE_COLLECTION) {
    const parsed = canonicalScheduleItemSchema.safeParse(payload);
    if (!parsed.success || parsed.data.ownerUserId !== actorId || !parsed.data.eventId || parsed.data.state === "cancelled") return null;
    return {
      category: parsed.data.category,
      ...(parsed.data.details ? { details: parsed.data.details } : {}),
      ...(parsed.data.endsAt ? { endsAt: parsed.data.endsAt } : {}),
      eventId: parsed.data.eventId,
      evidenceIds: parsed.data.evidenceIds,
      id: parsed.data.id,
      kind: parsed.data.kind,
      ...(parsed.data.location ? { location: parsed.data.location } : {}),
      ...(parsed.data.meetingMethod ? { meetingMethod: parsed.data.meetingMethod } : {}),
      sourceId: parsed.data.sourceId,
      startsAt: parsed.data.startsAt,
      title: parsed.data.title,
    };
  }
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
  const [canonicalRecords, legacyRecords] = await Promise.all([
    configured.store.listRecords({
      limit: "unbounded",
      workspaceId: configured.workspaceId,
      collectionName: CANONICAL_SCHEDULE_COLLECTION,
      userId: normalizedActorId,
    }),
    configured.store.listRecords({
      limit: "unbounded",
      workspaceId: configured.workspaceId,
      collectionName: "orbitScheduleItems",
    }),
  ]);
  const canonical = canonicalRecords.flatMap((record) => {
    const item = orbitScheduleItemFromLiveRecord(record, normalizedActorId);
    return item ? [item] : [];
  });
  const canonicalIds = new Set(canonical.map((item) => item.id));
  const legacy = legacyRecords.flatMap((record) => {
    const item = orbitScheduleItemFromLiveRecord(record, normalizedActorId);
    return item && !canonicalIds.has(item.id) ? [item] : [];
  });
  return [...canonical, ...legacy];
}
