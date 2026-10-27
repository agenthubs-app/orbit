import assert from "node:assert/strict";
import test from "node:test";

import { createLiveContactAcquisitionDraftService } from "../../features/acquisition/live-service";
import { createContactAcquisitionDraftService } from "../../features/acquisition/service-factory";
import {
  createStorageContactAcquisitionDraftProvider,
  type AtomicContactDraftConfirmer,
} from "../../features/acquisition/storage/contact-draft-live-record-provider";
import type { ContactAcquisitionDraft } from "../../features/acquisition/contract";
import type { ContactDTO } from "../../shared/domain/contracts";
import {
  createMemoryLiveRecordStore,
  type LiveRecord,
} from "../../shared/storage/live-record-store";

const WORKSPACE_ID = "workspace:contact-draft-live-test";
const NOW = "2026-07-01T10:00:00.000Z";
const DRAFT_ID = "event-draft:live:event_live_signup:attendee_live_yuki";

function record(
  collectionName: string,
  payload: Record<string, unknown>,
): LiveRecord<Record<string, unknown>> {
  const recordId =
    typeof payload.id === "string" ? payload.id : `${collectionName}:unknown`;
  const evidenceIds = Array.isArray(payload.evidenceIds)
    ? payload.evidenceIds.filter((item): item is string => typeof item === "string")
    : [`evidence:${collectionName}:${recordId}`];

  return {
    workspaceId: WORKSPACE_ID,
    collectionName,
    recordId,
    userId: null,
    sourceType: "system",
    sourceId: `source:${collectionName}:${recordId}`,
    sourceLabel: `Live ${collectionName} seed`,
    provider: "contact-draft-live-test",
    providerRecordId: recordId,
    evidenceIds,
    targetType: null,
    targetId: null,
    occurredAt: NOW,
    createdAt: NOW,
    updatedAt: NOW,
    lifecycleState: "active",
    searchText: JSON.stringify(payload),
    payload,
  };
}

function createSeedStore() {
  return createMemoryLiveRecordStore<Record<string, unknown>>([
    record("events", {
      id: "event_live_signup",
      name: "Tokyo Founder Signup Salon",
      location: "Shibuya",
      startsAt: "2026-07-03T09:00:00.000Z",
      source: {
        type: "event_import",
        id: "source:event:signup",
        label: "Live signup event",
      },
      evidenceIds: ["evidence:event:signup"],
    }),
    record("attendees", {
      id: "attendee_live_yuki",
      eventId: "event_live_signup",
      personId: "person_live_yuki",
      displayName: "山田 由紀",
      organization: "Yamada AI Studio",
      role: "Founder",
      status: "imported",
      source: {
        type: "event_import",
        id: "source:attendee:yuki",
        label: "Live attendee signup",
      },
      evidenceIds: ["evidence:attendee:yuki"],
      createdAt: NOW,
      updatedAt: NOW,
    }),
    record("eventParticipantIntents", {
      id: "intent_live_yuki",
      eventId: "event_live_signup",
      attendeeId: "attendee_live_yuki",
      personId: "person_live_yuki",
      lookingFor: ["AI product partners in Japan"],
      canOffer: ["Founder-led customer discovery"],
      preferredLanguage: "ja",
      confidence: 0.91,
      source: {
        type: "event_import",
        id: "source:intent:yuki",
        label: "Live participant intent",
      },
      evidenceIds: ["evidence:intent:yuki"],
      createdAt: NOW,
      updatedAt: NOW,
    }),
    record("networkPeople", {
      id: "person_live_yuki",
      personKind: "external_contact",
      displayName: "山田 由紀",
      organization: "Yamada AI Studio",
      role: "Founder",
      location: "Tokyo",
      primaryEmail: "yuki@example.test",
      profileSnippet: "Building AI workflow tooling for Japanese SMBs.",
      source: {
        type: "event_import",
        id: "source:person:yuki",
        label: "Live person source",
      },
      evidenceIds: ["evidence:person:yuki"],
      createdAt: NOW,
      updatedAt: NOW,
    }),
    record("evidence", {
      id: "evidence:attendee:yuki",
      sourceType: "event_import",
      sourceId: "source:attendee:yuki",
      summary: "Yuki signed up for the salon and requested AI product partners.",
      occurredAt: NOW,
      confidence: 0.91,
      createdBy: "profile_live_operator",
    }),
  ]);
}

test("contact acquisition draft live service derives event drafts from live storage", async () => {
  const store = createSeedStore();
  const provider = createStorageContactAcquisitionDraftProvider({
    store,
    workspaceId: WORKSPACE_ID,
  });
  const service = createLiveContactAcquisitionDraftService({ provider });

  const result = await service.listContactDrafts();

  assert.equal(result.success, true);
  assert.equal(result.data.state, "success");
  assert.equal(result.data.drafts.length, 1);
  assert.equal(result.data.drafts[0]?.id, DRAFT_ID);
  assert.equal(result.data.drafts[0]?.source.type, "event_import");
  assert.equal(result.data.drafts[0]?.displayName, "山田 由紀");
  assert.equal(result.data.drafts[0]?.relationshipContext.includes("AI product partners"), true);
  assert.equal(result.data.drafts[0]?.evidence[0]?.createdBy, "live-contact-acquisition-draft-service");
  assert.equal(result.data.provenance.privacy, "live-contact-acquisition-drafts");
  assert.equal(result.data.provenance.generationMethod, "live-store-derived-event-draft");
  assert.equal(result.data.provenance.liveDatabaseReadExecuted, true);
  assert.equal(result.data.provenance.contactWriteExecuted, false);
});

test("contact acquisition draft live confirmation updates only contactDrafts storage", async () => {
  const store = createSeedStore();
  const provider = createStorageContactAcquisitionDraftProvider({
    store,
    workspaceId: WORKSPACE_ID,
  });
  const service = createLiveContactAcquisitionDraftService({
    now: () => NOW,
    provider,
  });

  const result = await service.confirmContactDraft({
    actorLabel: "Live reviewer",
    draftId: DRAFT_ID,
  });
  const savedDraft = store.getRecord({
    workspaceId: WORKSPACE_ID,
    collectionName: "contactDrafts",
    recordId: DRAFT_ID,
  });
  const contacts = store.listRecords({
    limit: "unbounded",
    workspaceId: WORKSPACE_ID,
    collectionName: "contacts",
  });

  assert.equal(result.success, true);
  assert.equal(result.data.confirmedDraft.status, "confirmed");
  assert.equal(result.data.confirmedDraft.confirmation.actorLabel, "Live reviewer");
  assert.equal(result.data.contactCandidate.readyForContactWrite, true);
  assert.equal(result.data.contactCandidate.contactWriteExecuted, false);
  assert.equal(result.data.createdEvidence.createdBy, "live-contact-acquisition-draft-service");
  assert.equal(result.data.provenance.contactDraftWriteExecuted, true);
  assert.equal(result.data.provenance.contactWriteExecuted, false);
  assert.equal(savedDraft?.payload.status, "confirmed");
  assert.equal(contacts.length, 0);
});

test("concurrent draft confirmation returns one stable persisted result", async () => {
  const store = createSeedStore();
  const provider = createStorageContactAcquisitionDraftProvider({
    store,
    workspaceId: WORKSPACE_ID,
  });
  let call = 0;
  const service = createLiveContactAcquisitionDraftService({
    now: () => call++ === 0 ? NOW : "2026-07-02T12:10:01.000Z",
    provider,
  });

  const [first, second] = await Promise.all([
    service.confirmContactDraft({
      actorLabel: "Live reviewer",
      draftId: DRAFT_ID,
    }),
    service.confirmContactDraft({
      actorLabel: "Live reviewer",
      draftId: DRAFT_ID,
    }),
  ]);
  const saved = store.getRecord({
    workspaceId: WORKSPACE_ID,
    collectionName: "contactDrafts",
    recordId: DRAFT_ID,
  });

  assert.equal(first.success, true);
  assert.equal(second.success, true);
  assert.deepEqual(first, second);
  assert.equal(saved?.payload.status, "confirmed");
  assert.equal(
    Array.isArray(saved?.payload.evidence)
      ? saved.payload.evidence.length
      : 0,
    2,
  );
});

test("contact acquisition draft live service fails closed when storage is unconfigured", async () => {
  const service = createLiveContactAcquisitionDraftService({
    now: () => NOW,
    provider: null,
  });

  const result = await service.listContactDrafts();

  assert.equal(result.success, false);
  assert.equal(result.error.code, "CONTACT_DRAFT_LIVE_STORE_UNCONFIGURED");
  assert.equal(result.error.appCode, "SERVICE_UNAVAILABLE");
  assert.equal(result.error.provenance.privacy, "live-contact-acquisition-drafts");
});

test("contact acquisition draft service factory exposes live mode without breaking default mock", async () => {
  const previousModuleMode = process.env.ORBIT_MODULE_MODE;
  const previousFeatureMode = process.env.ORBIT_FEATURE_MODE;
  const previousEventDatabaseUrl = process.env.ORBIT_EVENT_DATABASE_URL;
  const previousLiveDatabaseUrl = process.env.ORBIT_LIVE_DATABASE_URL;
  const previousDatabaseUrl = process.env.ORBIT_DATABASE_URL;

  try {
    delete process.env.ORBIT_MODULE_MODE;
    delete process.env.ORBIT_FEATURE_MODE;
    delete process.env.ORBIT_EVENT_DATABASE_URL;
    delete process.env.ORBIT_LIVE_DATABASE_URL;
    delete process.env.ORBIT_DATABASE_URL;

    const mock = createContactAcquisitionDraftService("mock").listContactDrafts();
    const live = await createContactAcquisitionDraftService("live").listContactDrafts();

    assert.equal(mock.success, true);
    assert.equal(live.success, false);
    assert.equal(live.error.code, "CONTACT_DRAFT_LIVE_STORE_UNCONFIGURED");
  } finally {
    process.env.ORBIT_MODULE_MODE = previousModuleMode;
    process.env.ORBIT_FEATURE_MODE = previousFeatureMode;
    process.env.ORBIT_EVENT_DATABASE_URL = previousEventDatabaseUrl;
    process.env.ORBIT_LIVE_DATABASE_URL = previousLiveDatabaseUrl;
    process.env.ORBIT_DATABASE_URL = previousDatabaseUrl;
  }
});

test("contact draft API resolves ORBIT_MODULE_MODE=live and returns a live envelope", async () => {
  const previousModuleMode = process.env.ORBIT_MODULE_MODE;
  const previousFeatureMode = process.env.ORBIT_FEATURE_MODE;
  const previousEventDatabaseUrl = process.env.ORBIT_EVENT_DATABASE_URL;
  const previousLiveDatabaseUrl = process.env.ORBIT_LIVE_DATABASE_URL;
  const previousDatabaseUrl = process.env.ORBIT_DATABASE_URL;

  try {
    process.env.ORBIT_MODULE_MODE = "live";
    delete process.env.ORBIT_FEATURE_MODE;
    delete process.env.ORBIT_EVENT_DATABASE_URL;
    delete process.env.ORBIT_LIVE_DATABASE_URL;
    delete process.env.ORBIT_DATABASE_URL;

    const route = await import("../../app/api/contact-drafts/handler");
    const listDrafts = route.createContactDraftsGetHandler(
      async () => ({ id: "account:contact-draft-live-test" }),
    );
    const response = await listDrafts(
      new Request("https://orbit.local/api/contact-drafts"),
    );
    const body = await response.json();

    assert.equal(response.status, 503);
    assert.equal(response.headers.get("x-orbit-feature-mode"), "live");
    assert.equal(body.success, false);
    assert.equal(
      body.error.context.contactAcquisitionDraftErrorCode,
      "CONTACT_DRAFT_LIVE_STORE_UNCONFIGURED",
    );
    assert.equal(body.error.context.service, "contact-acquisition-draft-live");
  } finally {
    process.env.ORBIT_MODULE_MODE = previousModuleMode;
    process.env.ORBIT_FEATURE_MODE = previousFeatureMode;
    process.env.ORBIT_EVENT_DATABASE_URL = previousEventDatabaseUrl;
    process.env.ORBIT_LIVE_DATABASE_URL = previousLiveDatabaseUrl;
    process.env.ORBIT_DATABASE_URL = previousDatabaseUrl;
  }
});

test("contact draft API rejects anonymous requests before resolving live storage", async () => {
  const route = await import("../../app/api/contact-drafts/handler");
  const response = await route.createContactDraftsGetHandler(
    async () => null,
  )(new Request("https://orbit.local/api/contact-drafts"));
  const body = await response.json();

  assert.equal(response.status, 401);
  assert.equal(body.success, false);
  assert.equal(body.error.code, "UNAUTHORIZED");
  assert.equal(body.error.context.service, "authenticated-api-actor");
});

// ── QA-C2: event-attendee drafts are derived on read; confirm and 破棄 must work on them ──

function updateOnlyConfirmer(
  store: ReturnType<typeof createSeedStore>,
): AtomicContactDraftConfirmer {
  // Mirrors the Postgres confirmer: it only UPDATEs a stored pending row and
  // never inserts one (the bug: derived drafts were never stored).
  return async ({ draft, updatedAt, workspaceId }) => {
    const existing = store.getRecord({
      workspaceId,
      collectionName: "contactDrafts",
      recordId: draft.id,
    });

    if (!existing) {
      throw new Error(`Contact draft ${draft.id} could not be confirmed for this actor.`);
    }

    if (existing.payload.status !== "pending_confirmation") {
      return {
        draft: existing.payload as unknown as ContactAcquisitionDraft,
        transitionApplied: false,
      };
    }

    const saved = store.upsertRecord({
      ...existing,
      payload: draft as unknown as Record<string, unknown>,
      updatedAt,
    });

    return {
      draft: saved.payload as unknown as ContactAcquisitionDraft,
      transitionApplied: true,
    };
  };
}

function memoryContactProvider(seed: readonly ContactDTO[] = []) {
  const contacts = new Map(seed.map((contact) => [contact.id, contact]));
  const saved: ContactDTO[] = [];

  return {
    saved,
    provider: {
      async getContact(contactId: string) {
        return contacts.get(contactId) ?? null;
      },
      async listContacts() {
        return [...contacts.values()];
      },
      async saveContact(contact: ContactDTO) {
        contacts.set(contact.id, contact);
        saved.push(contact);
        return contact;
      },
    },
  };
}

function attendeeRecord(input: {
  id: string;
  eventId: string;
  personId?: string;
  contactId?: string;
  displayName: string;
  organization?: string;
}) {
  return record("attendees", {
    ...input,
    role: "Founder",
    status: "imported",
    source: {
      type: "event_import",
      id: `source:${input.id}`,
      label: `${input.displayName}的活动意向`,
    },
    evidenceIds: [`evidence:${input.id}`],
    createdAt: NOW,
    updatedAt: NOW,
  });
}

function serviceWith(
  store: ReturnType<typeof createSeedStore>,
  contacts: ReturnType<typeof memoryContactProvider>,
) {
  // Seed rows are unowned (userId null); the provider reads them unscoped.
  const provider = createStorageContactAcquisitionDraftProvider({
    atomicContactDraftConfirmer: updateOnlyConfirmer(store),
    store,
    workspaceId: WORKSPACE_ID,
  });

  return createLiveContactAcquisitionDraftService({
    actorId: "account:qa-c2",
    contactProvider: contacts.provider,
    now: () => NOW,
    provider,
  });
}

test("QA-C2: confirming a derived event draft stores it, adds the person and drops them from the queue", async () => {
  const store = createSeedStore();
  const contacts = memoryContactProvider();
  const service = serviceWith(store, contacts);

  const before = await service.listContactDrafts();
  assert.equal(before.success, true);
  assert.equal(before.data.drafts.length, 1);
  // The chip reads the event's name, not the import's internal label.
  assert.equal(before.data.drafts[0]?.source.label, "Tokyo Founder Signup Salon");

  const result = await service.confirmContactDraft({
    actorLabel: "Live reviewer",
    draftId: DRAFT_ID,
  });

  assert.equal(result.success, true);
  assert.equal(result.data.confirmedDraft.status, "confirmed");
  assert.equal(result.data.contactCandidate.contactWriteExecuted, true);
  const contactId = result.data.contactCandidate.contactId;
  assert.ok(contactId?.startsWith("contact:event:"));
  assert.equal(contacts.saved.length, 1);
  assert.equal(contacts.saved[0]?.displayName, "山田 由紀");
  assert.equal(contacts.saved[0]?.organization, "Yamada AI Studio");
  assert.equal(contacts.saved[0]?.metEventId, "event_live_signup");
  assert.equal(contacts.saved[0]?.source.type, "event_import");
  const stored = store.getRecord({
    workspaceId: WORKSPACE_ID,
    collectionName: "contactDrafts",
    recordId: DRAFT_ID,
  });
  assert.equal(stored?.payload.status, "confirmed");
  assert.equal(stored?.payload.contactId, contactId);

  const after = await service.listContactDrafts();
  assert.equal(after.success, true);
  assert.equal(
    after.data.drafts.some((draft) => draft.status === "pending_confirmation"),
    false,
  );

  // A retry answers the stored result and writes nothing new.
  const again = await service.confirmContactDraft({ draftId: DRAFT_ID });
  assert.equal(again.success, false);
  assert.equal(contacts.saved.length, 1);
});

test("QA-C2: the queue lists each person once and leaves out people already in the network", async () => {
  const store = createSeedStore();
  store.upsertRecord(attendeeRecord({ id: "attendee_yuki_2", eventId: "event_live_signup_2", personId: "person_live_yuki", displayName: "山田 由紀", organization: "Yamada AI Studio" }));
  store.upsertRecord(attendeeRecord({ id: "attendee_ken", eventId: "event_live_signup", contactId: "contact_ken", displayName: "佐藤 健", organization: "Sato Co" }));
  store.upsertRecord(attendeeRecord({ id: "attendee_mei", eventId: "event_live_signup", displayName: "林 玫", organization: "Lin Capital" }));
  const contacts = memoryContactProvider([
    { id: "contact_ken", displayName: "佐藤 健", stage: "captured", source: { type: "manual", id: "s" }, evidenceIds: ["e"], createdAt: NOW, updatedAt: NOW } as ContactDTO,
    { id: "contact_mei", displayName: "林玫", organization: "Lin Capital", stage: "captured", source: { type: "manual", id: "s" }, evidenceIds: ["e"], createdAt: NOW, updatedAt: NOW } as ContactDTO,
  ]);
  const service = serviceWith(store, contacts);

  const result = await service.listContactDrafts();

  assert.equal(result.success, true);
  assert.deepEqual(result.data.drafts.map((draft) => draft.displayName), ["山田 由紀"]);
});

test("QA-C2: confirming a draft for someone already in the network links that contact", async () => {
  const store = createSeedStore();
  // Seed rows are unowned (userId null); the provider reads them unscoped.
  const provider = createStorageContactAcquisitionDraftProvider({
    atomicContactDraftConfirmer: updateOnlyConfirmer(store),
    store,
    workspaceId: WORKSPACE_ID,
  });
  const contacts = memoryContactProvider();
  const service = createLiveContactAcquisitionDraftService({
    actorId: "account:qa-c2",
    contactProvider: contacts.provider,
    now: () => NOW,
    provider,
  });
  const listed = await service.listContactDrafts();
  assert.equal(listed.success, true);
  // The person is added elsewhere (another device) after the queue was read.
  await contacts.provider.saveContact({ id: "contact_yuki", personId: "person_live_yuki", displayName: "山田 由紀", stage: "captured", source: { type: "manual", id: "s" }, evidenceIds: ["e"], createdAt: NOW, updatedAt: NOW } as ContactDTO);
  contacts.saved.length = 0;

  // The draft is no longer listed, so confirming it reports it gone instead of duplicating the person.
  const result = await service.confirmContactDraft({ draftId: DRAFT_ID });
  assert.equal(result.success, false);
  assert.equal(result.error.code, "CONTACT_DRAFT_NOT_FOUND");
  assert.equal(contacts.saved.length, 0);
});

test("QA-C2: 破棄 is stored on the server and the person does not come back through another event", async () => {
  const store = createSeedStore();
  store.upsertRecord(attendeeRecord({ id: "attendee_yuki_2", eventId: "event_live_signup_2", personId: "person_live_yuki", displayName: "山田 由紀", organization: "Yamada AI Studio" }));
  store.upsertRecord(attendeeRecord({ id: "attendee_mei", eventId: "event_live_signup", displayName: "林 玫", organization: "Lin Capital" }));
  const contacts = memoryContactProvider();
  const service = serviceWith(store, contacts);
  const before = await service.listContactDrafts();
  assert.equal(before.success, true);
  assert.equal(before.data.drafts.length, 2);
  const yuki = before.data.drafts.find((draft) => draft.displayName === "山田 由紀");
  assert.ok(yuki);

  const discarded = await service.discardContactDraft?.({ draftId: yuki.id });

  assert.equal(discarded?.success, true);
  const stored = store.getRecord({ workspaceId: WORKSPACE_ID, collectionName: "contactDrafts", recordId: yuki.id });
  assert.equal(typeof stored?.payload.discardedAt, "string");
  assert.equal(stored?.payload.status, "pending_confirmation");
  // A fresh service (another device) no longer lists the person.
  const after = await serviceWith(store, contacts).listContactDrafts();
  assert.equal(after.success, true);
  assert.deepEqual(after.data.drafts.map((draft) => draft.displayName), ["林 玫"]);
  const confirmAfter = await service.confirmContactDraft({ draftId: yuki.id });
  assert.equal(confirmAfter.success, false);
  assert.equal(contacts.saved.length, 0);
  const twice = await service.discardContactDraft?.({ draftId: yuki.id });
  assert.equal(twice?.success, false);
});

test("QA-C2: a confirmed draft cannot be set aside", async () => {
  const store = createSeedStore();
  const contacts = memoryContactProvider();
  const service = serviceWith(store, contacts);
  await service.confirmContactDraft({ draftId: DRAFT_ID });

  const result = await service.discardContactDraft?.({ draftId: DRAFT_ID });

  assert.equal(result?.success, false);
  const stored = store.getRecord({ workspaceId: WORKSPACE_ID, collectionName: "contactDrafts", recordId: DRAFT_ID });
  assert.equal(stored?.payload.status, "confirmed");
  assert.equal(stored?.payload.discardedAt, undefined);
});

test("QA-C2: discard API rejects anonymous requests and answers the stored discard", async () => {
  const route = await import("../../app/api/contact-drafts/[id]/discard/handler");
  const anonymous = await route.createDiscardContactDraftHandler(async () => null)(
    new Request("https://orbit.local/api/contact-drafts/x/discard", { method: "POST" }),
    { params: Promise.resolve({ id: "x" }) },
  );
  assert.equal(anonymous.status, 401);

  const store = createSeedStore();
  const contacts = memoryContactProvider();
  const response = await route.createDiscardContactDraftHandler(
    async () => ({ id: "account:qa-c2" }),
    () => serviceWith(store, contacts),
  )(
    new Request(`https://orbit.local/api/contact-drafts/${encodeURIComponent(DRAFT_ID)}/discard`, { method: "POST" }),
    { params: Promise.resolve({ id: DRAFT_ID }) },
  );
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.equal(body.success, true);
  assert.equal(body.data.state, "discarded");
  assert.equal(body.data.draftId, DRAFT_ID);
});
