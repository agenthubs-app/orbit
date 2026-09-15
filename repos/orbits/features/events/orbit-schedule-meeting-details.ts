import type { MeetingDetailsContract, MeetingDetailsMedium } from "../../shared/contract/appointments";
import { createConfiguredPostgresLiveRecordStore } from "../../shared/storage/configured-live-record-store";
import type { LiveRecord, LiveRecordStoreLike } from "../../shared/storage/live-record-store";

const COLLECTION = "orbitScheduleItems";
const DETAILS_MAX = 5_000;

export class OrbitScheduleMeetingDetailsError extends Error {
  constructor(readonly code: "NOT_FOUND" | "CONFLICT" | "VALIDATION_ERROR", message: string) {
    super(message);
    this.name = "OrbitScheduleMeetingDetailsError";
  }
}

type Payload = Record<string, unknown>;

function normalizedText(value: string): string {
  return value.replace(/\r\n?/gu, "\n").trim();
}

function versionOf(payload: Payload): number {
  return Number.isSafeInteger(payload.meetingDetailsVersion) && Number(payload.meetingDetailsVersion) > 0
    ? Number(payload.meetingDetailsVersion)
    : 1;
}

function requiredRecord(record: LiveRecord<Payload> | null, actorId: string): LiveRecord<Payload> {
  if (!record || (record.userId !== actorId && record.payload.accountId !== actorId) || record.payload.kind !== "meeting") {
    throw new OrbitScheduleMeetingDetailsError("NOT_FOUND", "Meeting was not found.");
  }
  return record;
}

function mediumFrom(location: unknown): MeetingDetailsMedium {
  if (location === "Google Meet") return { kind: "video", provider: "google_meet", joinUrl: null };
  if (typeof location === "string" && location.trim()) return { kind: "in_person", location: location.trim() };
  return { kind: "video", provider: "other", joinUrl: null };
}

function project(record: LiveRecord<Payload>): MeetingDetailsContract {
  const startsAt = typeof record.payload.startsAt === "string" ? record.payload.startsAt : record.occurredAt;
  if (!startsAt || Number.isNaN(Date.parse(startsAt))) throw new OrbitScheduleMeetingDetailsError("NOT_FOUND", "Meeting was not found.");
  const end = typeof record.payload.endsAt === "string" ? Date.parse(record.payload.endsAt) : Number.NaN;
  const start = Date.parse(startsAt);
  const durationMinutes = Number.isFinite(end) && end > start ? Math.max(15, Math.min(480, Math.round((end - start) / 60_000))) : 60;
  const updatedAt = typeof record.payload.meetingDetailsUpdatedAt === "string" ? record.payload.meetingDetailsUpdatedAt : null;
  return {
    appointmentId: record.recordId,
    confirmed: {
      durationMinutes,
      medium: mediumFrom(record.payload.location),
      startsAtUtc: new Date(start).toISOString(),
      timezone: "Asia/Tokyo",
    },
    contactId: typeof record.payload.relatedContactId === "string" ? record.payload.relatedContactId : null,
    details: typeof record.payload.meetingDetails === "string" ? record.payload.meetingDetails : "",
    detailsUpdatedAt: updatedAt,
    detailsUpdatedBy: updatedAt ? "you" : null,
    eventId: null,
    proposals: [],
    status: "confirmed",
    title: typeof record.payload.title === "string" && record.payload.title.trim() ? record.payload.title.trim() : "会面",
    updatedAt: record.updatedAt,
    version: versionOf(record.payload),
    visibility: "private",
  };
}

export interface OrbitScheduleMeetingDetailsService {
  get(input: { actorId: string; meetingId: string }): Promise<MeetingDetailsContract>;
  updateDetails(input: { actorId: string; details: string; expectedVersion: number; idempotencyKey: string; meetingId: string }): Promise<{ appointment: MeetingDetailsContract; replayed: boolean }>;
}

export function createOrbitScheduleMeetingDetailsService(input: {
  now?: () => string;
  store: LiveRecordStoreLike<Payload>;
  workspaceId: string;
}): OrbitScheduleMeetingDetailsService {
  const now = input.now ?? (() => new Date().toISOString());
  async function read(actorId: string, meetingId: string) {
    return requiredRecord(await input.store.getRecord({ workspaceId: input.workspaceId, collectionName: COLLECTION, recordId: meetingId }), actorId);
  }
  return {
    async get(value) {
      return project(await read(value.actorId, value.meetingId));
    },
    async updateDetails(value) {
      if (typeof value.details !== "string" || value.details.length > DETAILS_MAX) throw new OrbitScheduleMeetingDetailsError("VALIDATION_ERROR", "Meeting details are invalid.");
      if (!Number.isSafeInteger(value.expectedVersion) || value.expectedVersion < 1) throw new OrbitScheduleMeetingDetailsError("VALIDATION_ERROR", "Meeting version is invalid.");
      if (!value.idempotencyKey || value.idempotencyKey.length > 96) throw new OrbitScheduleMeetingDetailsError("VALIDATION_ERROR", "Idempotency key is invalid.");
      const current = await read(value.actorId, value.meetingId);
      const details = normalizedText(value.details);
      const fingerprint = JSON.stringify({ details, expectedVersion: value.expectedVersion });
      const prior = current.payload.meetingDetailsMutation;
      if (prior && typeof prior === "object" && !Array.isArray(prior)) {
        const receipt = prior as Record<string, unknown>;
        if (receipt.key === value.idempotencyKey) {
          if (receipt.fingerprint !== fingerprint) throw new OrbitScheduleMeetingDetailsError("CONFLICT", "Idempotency key was already used for another edit.");
          return { appointment: project(current), replayed: true };
        }
      }
      if (versionOf(current.payload) !== value.expectedVersion) throw new OrbitScheduleMeetingDetailsError("CONFLICT", "Meeting version is stale.");
      const timestamp = now();
      const nextVersion = value.expectedVersion + 1;
      const saved = await input.store.upsertRecord({
        ...current,
        payload: {
          ...current.payload,
          meetingDetails: details,
          meetingDetailsMutation: { fingerprint, key: value.idempotencyKey, version: nextVersion },
          meetingDetailsUpdatedAt: timestamp,
          meetingDetailsVersion: nextVersion,
        },
        updatedAt: timestamp,
      });
      return { appointment: project(saved), replayed: false };
    },
  };
}

export function createConfiguredOrbitScheduleMeetingDetailsService(): OrbitScheduleMeetingDetailsService | null {
  const configured = createConfiguredPostgresLiveRecordStore<Payload>();
  return configured ? createOrbitScheduleMeetingDetailsService(configured) : null;
}
