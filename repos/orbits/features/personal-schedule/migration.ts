import type { LiveRecord, LiveRecordStoreLike } from "../../shared/storage/live-record-store";
import { canonicalScheduleItemSchema, type CanonicalScheduleItem } from "./authority-contract";
import { CANONICAL_SCHEDULE_COLLECTION } from "./authority-service";

export interface ScheduleMigrationDryRun {
  counts: {
    conflict: number;
    duplicate: number;
    foreign: number;
    migratable: number;
    orphan: number;
  };
  migratableIds: readonly string[];
  conflicts: readonly string[];
  orphans: readonly string[];
}

function legacyItem(record: LiveRecord<Record<string, unknown>>, actorId: string): CanonicalScheduleItem | null {
  const payload = record.payload;
  if (record.userId !== actorId || payload.accountId !== actorId) return null;
  const parsed = canonicalScheduleItemSchema.safeParse({
    ...payload,
    accountId: actorId,
    category: payload.category ?? "event",
    createdAt: payload.createdAt ?? record.createdAt,
    eventId: payload.eventId,
    evidenceIds: payload.evidenceIds ?? record.evidenceIds,
    id: payload.id ?? record.recordId,
    kind: payload.kind ?? "event",
    ownerUserId: actorId,
    sourceId: payload.sourceId ?? payload.eventId ?? record.sourceId,
    state: payload.state ?? "upcoming",
    updatedAt: payload.updatedAt ?? record.updatedAt,
  });
  return parsed.success ? parsed.data : null;
}

function comparable(item: CanonicalScheduleItem): string {
  return JSON.stringify({
    category: item.category,
    contactId: item.contactId,
    details: item.details,
    endsAt: item.endsAt,
    eventId: item.eventId,
    id: item.id,
    kind: item.kind,
    location: item.location,
    meetingId: item.meetingId,
    meetingMethod: item.meetingMethod,
    sourceId: item.sourceId,
    startsAt: item.startsAt,
    title: item.title,
  });
}

export function planScheduleMigrationDryRun(input: {
  actorId: string;
  legacyRecords: readonly LiveRecord<Record<string, unknown>>[];
  canonicalRecords: readonly LiveRecord<Record<string, unknown>>[];
}): ScheduleMigrationDryRun {
  const canonical = new Map(
    input.canonicalRecords.flatMap((record) => {
      const parsed = canonicalScheduleItemSchema.safeParse(record.payload);
      return parsed.success && parsed.data.ownerUserId === input.actorId ? [[parsed.data.id, parsed.data] as const] : [];
    }),
  );
  const counts = { conflict: 0, duplicate: 0, foreign: 0, migratable: 0, orphan: 0 };
  const migratableIds: string[] = [];
  const conflicts: string[] = [];
  const orphans: string[] = [];
  for (const record of input.legacyRecords) {
    const owned = record.userId === input.actorId || record.payload.accountId === input.actorId;
    if (!owned && (record.userId || record.payload.accountId)) {
      counts.foreign++;
      continue;
    }
    const candidate = legacyItem(record, input.actorId);
    if (!candidate) {
      counts.orphan++;
      orphans.push(record.recordId);
      continue;
    }
    const current = canonical.get(candidate.id);
    if (!current) {
      counts.migratable++;
      migratableIds.push(candidate.id);
    } else if (comparable(current) === comparable(candidate)) {
      counts.duplicate++;
    } else {
      counts.conflict++;
      conflicts.push(candidate.id);
    }
  }
  return {
    conflicts: conflicts.sort(),
    counts,
    migratableIds: migratableIds.sort(),
    orphans: orphans.sort(),
  };
}

export async function dryRunScheduleMigration(input: {
  actorId: string;
  store: LiveRecordStoreLike<Record<string, unknown>>;
  workspaceId: string;
}): Promise<ScheduleMigrationDryRun> {
  const [legacyRecords, canonicalRecords] = await Promise.all([
    input.store.listRecords({ limit: "unbounded", collectionName: "orbitScheduleItems", workspaceId: input.workspaceId }),
    input.store.listRecords({ limit: "unbounded", collectionName: CANONICAL_SCHEDULE_COLLECTION, includeDeleted: true, workspaceId: input.workspaceId }),
  ]);
  return planScheduleMigrationDryRun({
    actorId: input.actorId,
    canonicalRecords,
    legacyRecords,
  });
}
