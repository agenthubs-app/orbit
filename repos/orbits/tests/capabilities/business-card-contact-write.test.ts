import assert from "node:assert/strict";
import test from "node:test";

import { createBusinessCardContactConfirmHandler } from "../../app/api/contacts/business-card/confirm/handler";
import { createLiveBusinessCardContactWriteService } from "../../features/contacts/live-contact-write-service";
import { createStorageBusinessCardContactWriteProvider } from "../../features/contacts/storage/contact-write-live-record-provider";
import { createMemoryLiveRecordStore } from "../../shared/storage/live-record-store";

const WORKSPACE_ID = "workspace:business-card-contact-write";
const ACTOR_ID = "account:business-card-owner";
const NOW = "2026-07-24T14:00:00.000Z";
const INPUT = {
  actorId: ACTOR_ID,
  actorLabel: "Orbit operator",
  confirmed: true,
  displayName: "青空 太郎",
  draftId: "business-card-review:cloud:test-card",
  email: "person@example.com",
  evidenceIds: ["evidence:business-card-cloud-ocr:test-card"],
  imageDigest: `sha256:${"a".repeat(64)}`,
  organization: "架空技研株式会社",
  phone: "+81 90 0000 0000",
  relationshipContext: "Met at an Orbit event.",
  role: "室長",
} as const;

function restoreEnv(key: string, value: string | undefined): void {
  if (value === undefined) {
    delete process.env[key];
    return;
  }

  process.env[key] = value;
}

test("confirm persists notes and allowDuplicate bypasses duplicate review", async () => {
  const store = createMemoryLiveRecordStore<Record<string, unknown>>();
  const service = createLiveBusinessCardContactWriteService({
    now: () => NOW,
    provider: createStorageBusinessCardContactWriteProvider({
      store,
      workspaceId: WORKSPACE_ID,
    }),
  });

  const first = await service.confirmBusinessCardContact({
    ...INPUT,
    email: "dup@example.test",
    notes: "部门: 事業開発室\n传真(本社): 03-0000-2222",
  });
  assert.equal(first.success, true);
  assert.equal(first.data.state, "created");

  const contactRecords = store.listRecords({
    collectionName: "contacts",
    workspaceId: WORKSPACE_ID,
  });
  assert.equal(
    contactRecords[0]?.payload.notes,
    "部门: 事業開発室\n传真(本社): 03-0000-2222",
  );

  const duplicated = await service.confirmBusinessCardContact({
    ...INPUT,
    draftId: "business-card-review:cloud:another-card",
    email: "dup@example.test",
  });
  assert.equal(duplicated.success, true);
  assert.equal(duplicated.data.state, "duplicate_review");

  const forced = await service.confirmBusinessCardContact({
    ...INPUT,
    allowDuplicate: true,
    draftId: "business-card-review:cloud:another-card",
    email: "dup@example.test",
  });
  assert.equal(forced.success, true);
  assert.equal(forced.data.state, "created");
  assert.equal(
    store.listRecords({ collectionName: "contacts", workspaceId: WORKSPACE_ID }).length,
    2,
  );
});

test("confirmed business card contact writes once and is idempotent by draft", async () => {
  const store = createMemoryLiveRecordStore<Record<string, unknown>>();
  const service = createLiveBusinessCardContactWriteService({
    now: () => NOW,
    provider: createStorageBusinessCardContactWriteProvider({
      store,
      workspaceId: WORKSPACE_ID,
    }),
  });

  const first = await service.confirmBusinessCardContact(INPUT);
  const second = await service.confirmBusinessCardContact(INPUT);
  const contactRecords = store.listRecords({
    collectionName: "contacts",
    workspaceId: WORKSPACE_ID,
  });

  assert.equal(first.success, true);
  assert.equal(first.data.state, "created");
  assert.equal(first.data.contactWriteExecuted, true);
  assert.equal(second.success, true);
  assert.equal(second.data.state, "already_confirmed");
  assert.equal(second.data.contactWriteExecuted, false);
  assert.equal(second.data.contactId, first.data.contactId);
  assert.equal(contactRecords.length, 1);
  assert.equal(contactRecords[0]?.payload.stage, "captured");
  assert.equal(contactRecords[0]?.payload.displayName, "青空 太郎");
  assert.deepEqual(contactRecords[0]?.payload.evidenceIds, INPUT.evidenceIds);
  assert.equal(contactRecords[0]?.userId, ACTOR_ID);
});

test("confirmed business card contact stops for duplicate normalized email without writes", async () => {
  const store = createMemoryLiveRecordStore<Record<string, unknown>>([
    {
      collectionName: "contacts",
      createdAt: NOW,
      evidenceIds: ["evidence:existing"],
      lifecycleState: "active",
      payload: {
        createdAt: NOW,
        displayName: "Existing Person",
        evidenceIds: ["evidence:existing"],
        id: "contact:existing",
        primaryEmail: "PERSON@example.com ",
        source: {
          id: "source:existing",
          label: "Existing source",
          type: "manual",
        },
        stage: "active",
        updatedAt: NOW,
      },
      recordId: "contact:existing",
      searchText: "Existing Person PERSON@example.com",
      sourceId: "source:existing",
      sourceType: "manual",
      targetId: "contact:existing",
      targetType: "contact",
      updatedAt: NOW,
      userId: ACTOR_ID,
      workspaceId: WORKSPACE_ID,
    },
  ]);
  const service = createLiveBusinessCardContactWriteService({
    now: () => NOW,
    provider: createStorageBusinessCardContactWriteProvider({
      store,
      workspaceId: WORKSPACE_ID,
    }),
  });

  const result = await service.confirmBusinessCardContact(INPUT);
  const contactRecords = store.listRecords({
    collectionName: "contacts",
    workspaceId: WORKSPACE_ID,
  });

  assert.equal(result.success, true);
  assert.equal(result.data.state, "duplicate_review");
  assert.equal(result.data.duplicateContactId, "contact:existing");
  assert.equal(result.data.contactWriteExecuted, false);
  assert.equal(contactRecords.length, 1);
});

test("business card contact ids and duplicate checks are isolated by actor", async () => {
  const store = createMemoryLiveRecordStore<Record<string, unknown>>();
  const service = createLiveBusinessCardContactWriteService({
    now: () => NOW,
    provider: createStorageBusinessCardContactWriteProvider({
      store,
      workspaceId: WORKSPACE_ID,
    }),
  });

  const first = await service.confirmBusinessCardContact(INPUT);
  const second = await service.confirmBusinessCardContact({
    ...INPUT,
    actorId: "account:other-owner",
    actorLabel: "Other operator",
  });
  const records = store.listRecords({
    collectionName: "contacts",
    workspaceId: WORKSPACE_ID,
  });

  assert.equal(first.success, true);
  assert.equal(second.success, true);
  assert.equal(second.data.state, "created");
  assert.notEqual(second.data.contactId, first.data.contactId);
  assert.deepEqual(
    records.map((record) => record.userId).sort(),
    [ACTOR_ID, "account:other-owner"].sort(),
  );
});

test("business card contact confirmation requires an explicit confirmation and configured storage", async () => {
  const unconfirmedStore =
    createMemoryLiveRecordStore<Record<string, unknown>>();
  const unconfirmedService = createLiveBusinessCardContactWriteService({
    provider: createStorageBusinessCardContactWriteProvider({
      store: unconfirmedStore,
      workspaceId: WORKSPACE_ID,
    }),
  });
  const unconfirmed =
    await unconfirmedService.confirmBusinessCardContact({
      ...INPUT,
      confirmed: false,
    });
  const unconfigured = await createLiveBusinessCardContactWriteService({
    provider: null,
  }).confirmBusinessCardContact(INPUT);

  assert.equal(unconfirmed.success, false);
  assert.equal(unconfirmed.error.code, "BUSINESS_CARD_CONTACT_CONFIRMATION_REQUIRED");
  assert.equal(
    unconfirmedStore.listRecords({
      collectionName: "contacts",
      workspaceId: WORKSPACE_ID,
    }).length,
    0,
  );
  assert.equal(unconfigured.success, false);
  assert.equal(unconfigured.error.code, "BUSINESS_CARD_CONTACT_WRITE_UNCONFIGURED");

  const missingActor =
    await unconfirmedService.confirmBusinessCardContact({
      ...INPUT,
      actorId: "",
    });

  assert.equal(missingActor.success, false);
  assert.equal(missingActor.error.code, "BUSINESS_CARD_CONTACT_ACTOR_REQUIRED");
});

test("business card contact confirmation API fails closed without live storage", async () => {
  const envKeys = [
    "ORBIT_MODULE_MODE",
    "ORBIT_EVENT_DATABASE_URL",
    "ORBIT_LIVE_DATABASE_URL",
    "ORBIT_DATABASE_URL",
  ] as const;
  const previousEnv = new Map(
    envKeys.map((key) => [key, process.env[key]] as const),
  );

  try {
    process.env.ORBIT_MODULE_MODE = "live";
    delete process.env.ORBIT_EVENT_DATABASE_URL;
    delete process.env.ORBIT_LIVE_DATABASE_URL;
    delete process.env.ORBIT_DATABASE_URL;

    const response = await createBusinessCardContactConfirmHandler(async () => ({
      id: ACTOR_ID,
      name: "Orbit operator",
    }))(
      new Request("https://orbit.local/api/contacts/business-card/confirm", {
        body: JSON.stringify(INPUT),
        headers: { "content-type": "application/json" },
        method: "POST",
      }),
    );
    const body = await response.json();

    assert.equal(response.status, 503);
    assert.equal(body.success, false);
    assert.equal(
      body.error.context.businessCardContactWriteErrorCode,
      "BUSINESS_CARD_CONTACT_WRITE_UNCONFIGURED",
    );
    assert.equal(body.error.context.service, "business-card-contact-write-live");
  } finally {
    for (const [key, value] of previousEnv) {
      restoreEnv(key, value);
    }
  }
});

test("business card contact confirmation API rejects unauthenticated writes before validation", async () => {
  const response = await createBusinessCardContactConfirmHandler(
    async () => null,
  )(
    new Request("https://orbit.local/api/contacts/business-card/confirm", {
      body: JSON.stringify({}),
      headers: { "content-type": "application/json" },
      method: "POST",
    }),
  );
  const body = await response.json();

  assert.equal(response.status, 401);
  assert.equal(body.success, false);
  assert.equal(body.error.code, "UNAUTHORIZED");
  assert.equal(body.error.context.service, "authenticated-api-actor");
});
