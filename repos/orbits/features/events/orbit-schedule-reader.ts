import { createConfiguredPostgresLiveRecordStore } from "../../shared/storage/configured-live-record-store";

export interface OrbitScheduleItem {
  id: string;
  eventId: string;
  title: string;
  startsAt: string;
  endsAt?: string;
  location?: string;
  evidenceIds: readonly string[];
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
    const payload = record.payload;
    if (
      record.userId !== normalizedActorId &&
      payload.accountId !== normalizedActorId
    ) {
      return [];
    }
    if (
      typeof payload.id !== "string" ||
      typeof payload.eventId !== "string" ||
      typeof payload.title !== "string" ||
      typeof payload.startsAt !== "string"
    ) {
      return [];
    }
    return [
      {
        id: payload.id,
        eventId: payload.eventId,
        title: payload.title,
        startsAt: payload.startsAt,
        endsAt:
          typeof payload.endsAt === "string" ? payload.endsAt : undefined,
        location:
          typeof payload.location === "string" ? payload.location : undefined,
        evidenceIds: Array.isArray(payload.evidenceIds)
          ? payload.evidenceIds.filter(
              (value): value is string => typeof value === "string",
            )
          : [],
      },
    ];
  });
}
