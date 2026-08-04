import { createHash, randomUUID } from "node:crypto";

import type { LiveRecordStoreLike } from "../../shared/storage/live-record-store";
import type { LiveContactsGraphProvider } from "../contacts/live-service";

export interface HumanEncounterRecord extends Record<string, unknown> {
  actorId: string;
  commitments: readonly string[];
  connectionId: string | null;
  contactId: string;
  createdAt: string;
  encounterId: string;
  eventId: string | null;
  nextStep: string;
  noteText: string;
  observedAt: string;
  privacy: "private" | "relationship_shared";
  requestHash: string;
  projection: {
    attempts: number;
    availableAt: string;
    lastError: string | null;
    leaseExpiresAt: string | null;
    leaseToken: string | null;
    status: "pending" | "processing" | "completed" | "failed";
  };
  talked: "yes" | "no" | "uncertain";
  tags: readonly string[];
  voiceMemoReference: string | null;
}

export interface HumanEncounterService {
  list(input: { actorId: string; eventId?: string | null }): Promise<readonly HumanEncounterRecord[]>;
  capture(input: {
    actorId: string;
    commitments?: readonly string[] | null;
    connectionId?: string | null;
    contactId: string;
    eventId?: string | null;
    idempotencyKey: string;
    nextStep?: string | null;
    noteText?: string | null;
    observedAt: string;
    privacy: "private" | "relationship_shared";
    talked: "yes" | "no" | "uncertain";
    tags?: readonly string[] | null;
    voiceMemoReference?: string | null;
  }): Promise<HumanEncounterRecord>;
}

export interface HumanEncounterRelationshipAuthority {
  isCanonicalRelationshipSide(input: { actorId: string; contactId: string; eventId: string | null }): Promise<boolean>;
}

function boundedText(value: string | null | undefined, label: string, maxLength: number, required = false): string {
  if (value !== null && value !== undefined && typeof value !== "string") throw new Error(`${label} is invalid.`);
  const normalized = value?.trim() ?? "";
  if (required && !normalized) throw new Error(`${label} is required.`);
  if (normalized.length > maxLength) throw new Error(`${label} is too long.`);
  return normalized;
}

function strings(values: readonly string[] | null | undefined, label: string, maxItems: number, maxLength: number): string[] {
  if (values !== null && values !== undefined && !Array.isArray(values)) throw new Error(`${label} must be an array.`);
  if ((values?.length ?? 0) > maxItems) throw new Error(`${label} contains too many values.`);
  return [...new Set((values ?? []).map((value) => boundedText(value, label, maxLength)).filter(Boolean))];
}

export function createHumanEncounterService(input: {
  contactProvider: LiveContactsGraphProvider;
  now?: () => string;
  relationshipAuthority?: HumanEncounterRelationshipAuthority;
  store: LiveRecordStoreLike<Record<string, unknown>>;
  workspaceId: string;
}): HumanEncounterService {
  const now = input.now ?? (() => new Date().toISOString());
  return {
    async list(value) {
      const actorId = boundedText(value.actorId, "Actor", 256, true);
      const eventId = value.eventId ? boundedText(value.eventId, "Event", 256, true) : null;
      const records = await input.store.listRecords({ workspaceId: input.workspaceId, collectionName: "human_encounters", userId: actorId });
      return records.map((record) => record.payload as HumanEncounterRecord).filter((record) => record.actorId === actorId && (!eventId || record.eventId === eventId)).sort((left, right) => right.observedAt.localeCompare(left.observedAt));
    },
    async capture(value) {
      const actorId = boundedText(value.actorId, "Actor", 256, true);
      const contactId = boundedText(value.contactId, "Contact", 256, true);
      const idempotencyKey = boundedText(value.idempotencyKey, "Idempotency key", 96, true);
      if (!/^[\x21-\x7e]+$/.test(idempotencyKey)) throw new Error("Idempotency key must contain printable ASCII characters only.");
      const eventId = value.eventId ? boundedText(value.eventId, "Event", 256, true) : null;
      const graph = await input.contactProvider.readContactGraphForContact?.(contactId, actorId);
      const projectedContactExists = graph?.contacts.some((contact) => contact.id === contactId) === true;
      const canonicalRelationshipExists = input.relationshipAuthority
        ? await input.relationshipAuthority.isCanonicalRelationshipSide({ actorId, contactId, eventId })
        : false;
      if (eventId ? !canonicalRelationshipExists : !projectedContactExists) {
        throw new Error(eventId
          ? "The contact is not an accepted canonical relationship side for this actor and event."
          : "The contact is not available to this actor.");
      }
      const observed = Date.parse(value.observedAt);
      if (!Number.isFinite(observed) || observed > Date.parse(now()) + 5 * 60_000) throw new Error("observedAt is invalid.");
      if (value.privacy !== "private") throw new Error("Relationship-shared encounter notes are not configured; save this memo as private.");
      const commitments = strings(value.commitments, "Commitments", 20, 500);
      const tags = strings(value.tags, "Tags", 20, 100);
      const connectionId = boundedText(value.connectionId, "Connection", 256) || null;
      const nextStep = boundedText(value.nextStep, "Next step", 1_000);
      const noteText = boundedText(value.noteText, "Note", 5_000);
      const voiceMemoReference = boundedText(value.voiceMemoReference, "Voice memo reference", 2_048) || null;
      const requestHash = createHash("sha256").update(JSON.stringify({
        commitments,
        connectionId,
        contactId,
        eventId,
        nextStep,
        noteText,
        observedAt: new Date(observed).toISOString(),
        privacy: value.privacy,
        talked: value.talked,
        tags,
        voiceMemoReference,
      })).digest("hex");
      const encounterId = `encounter:${createHash("sha256").update(`${actorId}\u0000${idempotencyKey}`).digest("hex").slice(0, 32)}`;
      const existing = await input.store.getRecord({ workspaceId: input.workspaceId, collectionName: "human_encounters", recordId: encounterId });
      if (existing) {
        if (existing.userId !== actorId) throw new Error("Encounter idempotency scope mismatch.");
        const replay = existing.payload as HumanEncounterRecord;
        if (replay.requestHash !== requestHash) throw new Error("The idempotency key was already used for different encounter content.");
        return replay;
      }
      const timestamp = now();
      const record: HumanEncounterRecord = {
        actorId,
        commitments,
        connectionId,
        contactId,
        createdAt: timestamp,
        encounterId,
        eventId,
        nextStep,
        noteText,
        observedAt: new Date(observed).toISOString(),
        privacy: value.privacy,
        requestHash,
        projection: { attempts: 0, availableAt: timestamp, lastError: null, leaseExpiresAt: null, leaseToken: null, status: "pending" },
        talked: value.talked,
        tags,
        voiceMemoReference,
      };
      if (!record.noteText && !record.voiceMemoReference && !record.nextStep && !record.commitments.length) throw new Error("Explicit encounter content is required.");
      await input.store.upsertRecord({ workspaceId: input.workspaceId, collectionName: "human_encounters", recordId: encounterId, userId: actorId, sourceType: "event_import", sourceId: record.eventId ?? encounterId, sourceLabel: "Explicit human encounter", evidenceIds: [], targetType: "contact", targetId: contactId, occurredAt: record.observedAt, lifecycleState: "active", searchText: [record.noteText, record.nextStep, ...record.commitments, ...record.tags].join(" "), payload: record, createdAt: timestamp, updatedAt: timestamp });
      return record;
    },
  };
}
