import { createConfiguredPostgresLiveRecordStore } from "../../../../shared/storage/configured-live-record-store";
import { createMemoryLiveRecordStore } from "../../../../shared/storage/live-record-store";
import type {
  LiveRecord,
  LiveRecordStoreLike,
} from "../../../../shared/storage/live-record-store";
import type { EventRegistration } from "../contract";
import {
  eventRegistrationId,
  type EventRegistrationProvider,
} from "../service";

export const EVENT_REGISTRATION_COLLECTION = "event_registrations" as const;

interface StoredEventRegistration extends Record<string, unknown> {
  registration: EventRegistration;
  registrationId: string;
}

export interface EventRegistrationLiveRecordProviderOptions {
  now?: () => string;
  source?: string;
  store: LiveRecordStoreLike<Record<string, unknown>>;
  workspaceId: string;
}

function clone<TValue>(value: TValue): TValue {
  return JSON.parse(JSON.stringify(value)) as TValue;
}

function isStoredEventRegistration(
  value: Record<string, unknown>,
): value is StoredEventRegistration {
  const registration = value.registration;

  return (
    typeof value.registrationId === "string" &&
    typeof registration === "object" &&
    registration !== null &&
    !Array.isArray(registration) &&
    typeof (registration as Record<string, unknown>).id === "string" &&
    typeof (registration as Record<string, unknown>).eventId === "string" &&
    typeof (registration as Record<string, unknown>).userId === "string"
  );
}

function recordFor(input: {
  now: string;
  registration: EventRegistration;
  source: string;
  workspaceId: string;
}): LiveRecord<Record<string, unknown>> {
  const registration = clone(input.registration);

  return {
    collectionName: EVENT_REGISTRATION_COLLECTION,
    createdAt: registration.registeredAt,
    evidenceIds: [`event:${registration.eventId}`, `user:${registration.userId}`],
    lifecycleState: "active",
    occurredAt: registration.updatedAt,
    payload: {
      registration,
      registrationId: registration.id,
    },
    provider: input.source,
    providerRecordId: registration.id,
    recordId: registration.id,
    searchText: [
      registration.eventId,
      registration.userId,
      registration.status,
      ...Object.values(registration.participantProfile.answers),
    ].join(" "),
    sourceId: `source:${registration.id}`,
    sourceLabel: "Orbit event registration",
    sourceType: "manual",
    targetId: registration.eventId,
    targetType: "event",
    updatedAt: registration.updatedAt || input.now,
    userId: registration.userId,
    workspaceId: input.workspaceId,
  };
}

export function createEventRegistrationLiveRecordProvider({
  now = () => new Date().toISOString(),
  source = "live-record-store:event-registration",
  store,
  workspaceId,
}: EventRegistrationLiveRecordProviderOptions): EventRegistrationProvider {
  return {
    async getRegistration(eventId, userId) {
      const record = await store.getRecord({
        collectionName: EVENT_REGISTRATION_COLLECTION,
        recordId: eventRegistrationId(eventId, userId),
        workspaceId,
      });

      if (!record || !isStoredEventRegistration(record.payload)) {
        return null;
      }

      const registration = record.payload.registration;

      if (
        registration.eventId !== eventId ||
        registration.userId !== userId ||
        registration.id !== record.payload.registrationId
      ) {
        return null;
      }

      return clone(registration);
    },
    async listRegistrations(eventId) {
      const records = await store.listRecords({
        collectionName: EVENT_REGISTRATION_COLLECTION,
        targetId: eventId,
        targetType: "event",
        workspaceId,
      });

      return records.flatMap((record) => {
        if (!isStoredEventRegistration(record.payload)) return [];
        const registration = record.payload.registration;
        return registration.eventId === eventId ? [clone(registration)] : [];
      });
    },
    async saveRegistration(registration) {
      const next = clone(registration);

      await store.upsertRecord(
        recordFor({
          now: now(),
          registration: next,
          source,
          workspaceId,
        }),
      );

      return clone(next);
    },
  };
}

interface EventRegistrationRuntimeGlobal {
  __orbitEventRegistrationStore?: LiveRecordStoreLike<Record<string, unknown>>;
}

const runtimeGlobal = globalThis as typeof globalThis &
  EventRegistrationRuntimeGlobal;
const fallbackMemoryStore =
  runtimeGlobal.__orbitEventRegistrationStore ??
  createMemoryLiveRecordStore<Record<string, unknown>>();
runtimeGlobal.__orbitEventRegistrationStore = fallbackMemoryStore;

export function createConfiguredEventRegistrationProvider(): EventRegistrationProvider {
  const configured = createConfiguredPostgresLiveRecordStore<
    Record<string, unknown>
  >();

  if (configured) {
    return createEventRegistrationLiveRecordProvider({
      source: `postgres-live-record-store:event-registration:${configured.workspaceId}`,
      store: configured.store,
      workspaceId: configured.workspaceId,
    });
  }

  return createEventRegistrationLiveRecordProvider({
    source: "memory-live-record-store:event-registration:local-runtime",
    store: fallbackMemoryStore,
    workspaceId: "workspace:local-runtime",
  });
}
