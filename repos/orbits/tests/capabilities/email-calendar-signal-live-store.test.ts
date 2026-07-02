import assert from "node:assert/strict";
import test from "node:test";

import { POST as confirmSignal } from "../../app/api/relationship-signals/[id]/confirm/route";
import { GET as listSignals } from "../../app/api/relationship-signals/email-calendar/route";
import { createLiveEmailCalendarSignalService } from "../../features/acquisition/live-email-calendar-service";
import { createEmailCalendarSignalService } from "../../features/acquisition/service-factory";
import { createStorageEmailCalendarSignalProvider } from "../../features/acquisition/storage/email-calendar-live-record-provider";
import {
  createMemoryLiveRecordStore,
  type LiveRecord,
} from "../../shared/storage/live-record-store";

const WORKSPACE_ID = "workspace:email-calendar-live-test";
const NOW = "2026-07-02T13:20:00.000Z";
const SIGNAL_ID = "email-calendar-signal:live:message_live_intro";

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
    sourceType: "email_signal",
    sourceId: `source:${collectionName}:${recordId}`,
    sourceLabel: `Live ${collectionName} seed`,
    provider: "email-calendar-live-test",
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
    record("contacts", {
      id: "contact_live_mika",
      displayName: "三浦 美香",
      organization: "Miura Climate Studio",
      role: "Partnerships Lead",
      stage: "active",
      source: {
        type: "manual",
        id: "source:contact:mika",
        label: "Existing live contact",
      },
      evidenceIds: ["evidence:contact:mika"],
      createdAt: NOW,
      updatedAt: NOW,
    }),
    record("conversations", {
      id: "conversation_live_intro",
      participantContactIds: ["contact_live_mika"],
      channel: "email",
      source: {
        type: "email_signal",
        id: "source:conversation:intro",
        label: "Live email thread",
      },
      evidenceIds: ["evidence:message:intro"],
      updatedAt: NOW,
    }),
    record("messages", {
      id: "message_live_intro",
      conversationId: "conversation_live_intro",
      direction: "inbound",
      body: "Mika asked for a follow-up after the partner pilot intro.",
      occurredAt: NOW,
      createdBy: "contact_live_mika",
      source: {
        type: "email_signal",
        id: "source:message:intro",
        label: "Live email signal",
      },
      evidenceIds: ["evidence:message:intro"],
    }),
    record("evidence", {
      id: "evidence:message:intro",
      sourceType: "email_signal",
      sourceId: "source:message:intro",
      summary: "Mika asked for a follow-up after the partner pilot intro.",
      occurredAt: NOW,
      confidence: 0.9,
      createdBy: "profile_live_operator",
    }),
  ]);
}

test("email calendar live service derives relationship signals from live messages without writes", async () => {
  const store = createSeedStore();
  const provider = createStorageEmailCalendarSignalProvider({
    store,
    workspaceId: WORKSPACE_ID,
  });
  const service = createLiveEmailCalendarSignalService({
    provider,
  });

  const result = await service.listEmailCalendarSignals();
  const contactDrafts = store.listRecords({
    workspaceId: WORKSPACE_ID,
    collectionName: "contactDrafts",
  });

  assert.equal(result.success, true);
  assert.equal(result.data.state, "success");
  assert.equal(result.data.signals.length, 1);
  assert.equal(result.data.signals[0]?.id, SIGNAL_ID);
  assert.equal(result.data.signals[0]?.displayName, "三浦 美香");
  assert.equal(result.data.signals[0]?.sourceKind, "gmail");
  assert.equal(result.data.signals[0]?.signalKind, "email_intro");
  assert.equal(result.data.signals[0]?.permission.state, "live-granted");
  assert.equal(result.data.signals[0]?.gmailApiRequested, false);
  assert.equal(result.data.signals[0]?.relationshipWriteExecuted, false);
  assert.equal(result.data.provenance.privacy, "live-email-calendar-signals");
  assert.equal(result.data.provenance.generationMethod, "live-store-query");
  assert.equal(result.data.provenance.liveDatabaseReadExecuted, true);
  assert.equal(result.data.provenance.databaseWriteExecuted, false);
  assert.equal(contactDrafts.length, 0);
});

test("email calendar live confirmation returns a review preview without relationship writes", async () => {
  const store = createSeedStore();
  const provider = createStorageEmailCalendarSignalProvider({
    store,
    workspaceId: WORKSPACE_ID,
  });
  const service = createLiveEmailCalendarSignalService({
    now: () => NOW,
    provider,
  });

  const result = await service.confirmEmailCalendarSignal({
    actorLabel: "Live reviewer",
    signalId: SIGNAL_ID,
  });
  const contacts = store.listRecords({
    workspaceId: WORKSPACE_ID,
    collectionName: "contacts",
  });

  assert.equal(result.success, true);
  assert.equal(result.data.confirmedSignal.id, SIGNAL_ID);
  assert.equal(result.data.confirmedSignal.confirmation.state, "confirmed");
  assert.equal(result.data.confirmedBy, "Live reviewer");
  assert.equal(result.data.createdEvidence.createdBy, "live-email-calendar-signal-service");
  assert.equal(result.data.relationshipWriteExecuted, false);
  assert.equal(result.data.externalActionExecuted, false);
  assert.equal(result.data.databaseWriteExecuted, false);
  assert.equal(result.data.notificationDelivered, false);
  assert.equal(result.data.provenance.privacy, "live-email-calendar-signals");
  assert.equal(result.data.provenance.generationMethod, "live-store-confirmation");
  assert.equal(contacts.length, 1);
});

test("email calendar live service fails closed when storage is unconfigured", async () => {
  const service = createLiveEmailCalendarSignalService({
    provider: null,
  });

  const result = await service.listEmailCalendarSignals();

  assert.equal(result.success, false);
  assert.equal(result.error.code, "EMAIL_CALENDAR_SIGNAL_LIVE_STORE_UNCONFIGURED");
  assert.equal(result.error.appCode, "SERVICE_UNAVAILABLE");
  assert.equal(result.error.provenance.privacy, "live-email-calendar-signals");
  assert.equal(result.error.provenance.liveDatabaseReadExecuted, false);
  assert.equal(result.error.provenance.databaseWriteExecuted, false);
});

test("email calendar signal factory exposes live mode without breaking default mock", async () => {
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

    const mock = createEmailCalendarSignalService("mock").listEmailCalendarSignals();
    const live = await createEmailCalendarSignalService("live").listEmailCalendarSignals();

    assert.equal(mock.success, true);
    assert.equal(live.success, false);
    assert.equal(live.error.code, "EMAIL_CALENDAR_SIGNAL_LIVE_STORE_UNCONFIGURED");
  } finally {
    process.env.ORBIT_MODULE_MODE = previousModuleMode;
    process.env.ORBIT_FEATURE_MODE = previousFeatureMode;
    process.env.ORBIT_EVENT_DATABASE_URL = previousEventDatabaseUrl;
    process.env.ORBIT_LIVE_DATABASE_URL = previousLiveDatabaseUrl;
    process.env.ORBIT_DATABASE_URL = previousDatabaseUrl;
  }
});

test("email calendar signal API resolves ORBIT_MODULE_MODE=live and fails closed without storage", async () => {
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

    const listResponse = await listSignals(
      new Request("https://orbit.local/api/relationship-signals/email-calendar"),
    );
    const confirmResponse = await confirmSignal(
      new Request(`https://orbit.local/api/relationship-signals/${SIGNAL_ID}/confirm`, {
        method: "POST",
      }),
      {
        params: Promise.resolve({ id: SIGNAL_ID }),
      },
    );
    const listBody = await listResponse.json();
    const confirmBody = await confirmResponse.json();

    assert.equal(listResponse.status, 503);
    assert.equal(listResponse.headers.get("x-orbit-feature-mode"), "live");
    assert.equal(listBody.success, false);
    assert.equal(
      listBody.error.context.emailCalendarSignalErrorCode,
      "EMAIL_CALENDAR_SIGNAL_LIVE_STORE_UNCONFIGURED",
    );
    assert.equal(listBody.error.context.service, "email-calendar-signal-live");

    assert.equal(confirmResponse.status, 503);
    assert.equal(confirmResponse.headers.get("x-orbit-feature-mode"), "live");
    assert.equal(confirmBody.success, false);
    assert.equal(
      confirmBody.error.context.emailCalendarSignalErrorCode,
      "EMAIL_CALENDAR_SIGNAL_LIVE_STORE_UNCONFIGURED",
    );
    assert.equal(confirmBody.error.context.service, "email-calendar-signal-live");
  } finally {
    process.env.ORBIT_MODULE_MODE = previousModuleMode;
    process.env.ORBIT_FEATURE_MODE = previousFeatureMode;
    process.env.ORBIT_EVENT_DATABASE_URL = previousEventDatabaseUrl;
    process.env.ORBIT_LIVE_DATABASE_URL = previousLiveDatabaseUrl;
    process.env.ORBIT_DATABASE_URL = previousDatabaseUrl;
  }
});
