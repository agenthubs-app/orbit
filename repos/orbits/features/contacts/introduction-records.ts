import { createHash } from "node:crypto";

import { AppError } from "../../shared/errors/app-error";
import { createConfiguredPostgresLiveRecordStore } from "../../shared/storage/configured-live-record-store";
import { resolveLiveDatabaseConnectionConfig } from "../../shared/storage/live-database-config";
import type {
  LiveRecord,
  LiveRecordStoreLike,
} from "../../shared/storage/live-record-store";

const INTRODUCTION_COLLECTION = "contact_introductions";
const CONTACT_COLLECTION = "contacts";
const CONNECTION_COLLECTION = "connections";

export type ContactIntroductionStatus = "draft" | "sent";

export interface ContactIntroduction {
  id: string;
  contactAId: string;
  contactBId: string;
  labelA: string;
  labelB: string;
  blurb: string;
  status: ContactIntroductionStatus;
  createdAt: string;
  updatedAt: string;
}

export interface CreateContactIntroductionInput {
  contactAId?: string | null;
  contactBId?: string | null;
  blurb?: string | null;
  requestId?: string | null;
}

export interface ContactIntroductionRepository {
  list(actorId: string): Promise<readonly ContactIntroduction[]>;
  create(
    actorId: string,
    input: CreateContactIntroductionInput,
  ): Promise<ContactIntroduction>;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function text(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function belongsToActor(
  record: LiveRecord<Record<string, unknown>>,
  actorId: string,
): boolean {
  return record.userId === actorId || record.payload.actorId === actorId;
}

function introductionFromRecord(
  record: LiveRecord<Record<string, unknown>>,
): ContactIntroduction | null {
  const payload = record.payload;
  const id = text(payload.id);
  const contactAId = text(payload.contactAId);
  const contactBId = text(payload.contactBId);
  const labelA = text(payload.labelA);
  const labelB = text(payload.labelB);
  const blurb = text(payload.blurb);
  const createdAt = text(payload.createdAt);
  const updatedAt = text(payload.updatedAt);
  const status =
    payload.status === "draft" || payload.status === "sent"
      ? payload.status
      : null;

  if (
    !id ||
    !contactAId ||
    !contactBId ||
    !labelA ||
    !labelB ||
    !blurb ||
    !createdAt ||
    !updatedAt ||
    !status
  ) {
    return null;
  }

  return {
    id,
    contactAId,
    contactBId,
    labelA,
    labelB,
    blurb,
    status,
    createdAt,
    updatedAt,
  };
}

function displayNameFromContact(
  record: LiveRecord<Record<string, unknown>>,
): string | null {
  return text(record.payload.displayName);
}

async function actorContacts(
  store: LiveRecordStoreLike<Record<string, unknown>>,
  workspaceId: string,
  actorId: string,
): Promise<Map<string, string>> {
  const [records, connectionRecords] = await Promise.all([
    store.listRecords({
      collectionName: CONTACT_COLLECTION,
      workspaceId,
    }),
    store.listRecords({
      collectionName: CONNECTION_COLLECTION,
      workspaceId,
    }),
  ]);
  const linkedContactIds = new Set(
    connectionRecords
      .filter(
        (record) =>
          record.userId === actorId || record.payload.accountId === actorId,
      )
      .map((record) => text(record.payload.contactId))
      .filter((contactId): contactId is string => contactId !== null),
  );

  return new Map(
    records.flatMap((record) => {
      const id = text(record.payload.id);
      if (
        !id ||
        (!belongsToActor(record, actorId) && !linkedContactIds.has(id))
      ) {
        return [];
      }
      const displayName = displayNameFromContact(record);
      return id && displayName ? [[id, displayName] as const] : [];
    }),
  );
}

export function createContactIntroductionRepository(input: {
  store: LiveRecordStoreLike<Record<string, unknown>>;
  workspaceId: string;
}): ContactIntroductionRepository {
  return {
    async list(actorId) {
      const normalizedActorId = text(actorId);
      if (!normalizedActorId) {
        throw new AppError(
          "UNAUTHORIZED",
          "Sign in before reading introductions.",
        );
      }

      const [records, contacts] = await Promise.all([
        input.store.listRecords({
          collectionName: INTRODUCTION_COLLECTION,
          workspaceId: input.workspaceId,
        }),
        actorContacts(input.store, input.workspaceId, normalizedActorId),
      ]);

      return records
        .filter((record) => belongsToActor(record, normalizedActorId))
        .flatMap((record) => {
          const introduction = introductionFromRecord(record);
          return introduction
            ? [
                {
                  ...introduction,
                  labelA:
                    contacts.get(introduction.contactAId) ??
                    introduction.labelA,
                  labelB:
                    contacts.get(introduction.contactBId) ??
                    introduction.labelB,
                },
              ]
            : [];
        })
        .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
    },

    async create(actorId, createInput) {
      const normalizedActorId = text(actorId);
      if (!normalizedActorId) {
        throw new AppError(
          "UNAUTHORIZED",
          "Sign in before saving an introduction.",
        );
      }

      const contactAId = text(createInput.contactAId);
      const contactBId = text(createInput.contactBId);
      const blurb = text(createInput.blurb);
      const requestId = text(createInput.requestId);

      if (!requestId) {
        throw new AppError(
          "VALIDATION_ERROR",
          "A stable request id is required to save an introduction.",
        );
      }

      const id = `intro_${createHash("sha256")
        .update(`${normalizedActorId}\u0000${requestId}`)
        .digest("hex")
        .slice(0, 32)}`;
      const existingRecord = await input.store.getRecord({
        collectionName: INTRODUCTION_COLLECTION,
        recordId: id,
        workspaceId: input.workspaceId,
      });
      if (existingRecord) {
        const existing = introductionFromRecord(existingRecord);
        if (existing && belongsToActor(existingRecord, normalizedActorId)) {
          return existing;
        }
        throw new AppError(
          "CONFLICT",
          "The introduction request id is already owned by another record.",
        );
      }

      if (!contactAId || !contactBId || contactAId === contactBId) {
        throw new AppError(
          "VALIDATION_ERROR",
          "Choose two different contacts for the introduction.",
        );
      }
      if (!blurb) {
        throw new AppError(
          "VALIDATION_ERROR",
          "Write an introduction note before saving the draft.",
        );
      }

      const contacts = await actorContacts(
        input.store,
        input.workspaceId,
        normalizedActorId,
      );
      const labelA = contacts.get(contactAId);
      const labelB = contacts.get(contactBId);
      if (!labelA || !labelB) {
        throw new AppError(
          "NOT_FOUND",
          "Both contacts must belong to the signed-in account.",
        );
      }

      const now = new Date().toISOString();
      const introduction: ContactIntroduction = {
        id,
        contactAId,
        contactBId,
        labelA,
        labelB,
        blurb,
        status: "draft",
        createdAt: now,
        updatedAt: now,
      };

      await input.store.upsertRecord({
        workspaceId: input.workspaceId,
        collectionName: INTRODUCTION_COLLECTION,
        recordId: id,
        userId: normalizedActorId,
        sourceType: "manual",
        sourceId: `contact-introduction:${id}`,
        sourceLabel: "Saved introduction draft",
        provider: "orbit-contact-introductions",
        providerRecordId: id,
        evidenceIds: [],
        targetType: "connection",
        targetId: contactAId,
        occurredAt: now,
        createdAt: now,
        updatedAt: now,
        lifecycleState: "active",
        searchText: [labelA, labelB, blurb].join(" "),
        payload: {
          ...introduction,
          actorId: normalizedActorId,
          requestId,
        },
      });

      return introduction;
    },
  };
}

export function createConfiguredContactIntroductionRepository(): ContactIntroductionRepository | null {
  const config = resolveLiveDatabaseConnectionConfig();
  const configured = createConfiguredPostgresLiveRecordStore();

  if (!config || !configured) {
    return null;
  }

  return createContactIntroductionRepository({
    store: configured.store,
    workspaceId: config.workspaceId,
  });
}

export function isContactIntroductionInput(
  value: unknown,
): value is CreateContactIntroductionInput {
  return isRecord(value);
}
