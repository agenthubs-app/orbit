import assert from "node:assert/strict";
import test from "node:test";

import { createLiveAccountSessionService } from "../../features/account/live-service";
import { createStorageAccountSessionProvider } from "../../features/account/storage/account-live-record-provider";
import { createLiveConnectionEvidenceService } from "../../features/connections/live-service";
import { createStorageConnectionEvidenceProvider } from "../../features/connections/storage/connection-live-record-provider";
import { createLiveDashboardAggregateService } from "../../features/dashboard/live-service";
import { createStorageDashboardAggregateProvider } from "../../features/dashboard/storage/dashboard-live-record-provider";
import { createStorageAppBootstrapProvider } from "../../features/bootstrap/storage/bootstrap-live-record-provider";
import { createStorageRelationshipValueProvider } from "../../features/analysis/storage/relationship-value-live-record-provider";
import { createStorageSourceConsistencyProvenanceAuditProvider } from "../../features/audit/storage/source-consistency-provenance-audit-live-record-provider";
import { createStorageChatConversationMessageProvider } from "../../features/chat/storage/chat-conversation-live-record-provider";
import { createStoragePermissionStateProvider } from "../../features/permissions/storage/permission-live-record-provider";
import { createStorageEventValueRecommendationProvider } from "../../features/recommendations/storage/event-value-live-record-provider";
import { createStorageEventRecommendationProvider } from "../../features/recommendations/storage/event-recommendation-live-record-provider";
import { defaultMockFixtures } from "../../shared/mock/fixtures";
import { createMemoryLiveRecordStore } from "../../shared/storage/live-record-store";
import { seedGeneratedRelationshipFixturesIntoLiveStore } from "../../shared/storage/seed-generated-fixtures";

test("account session selects the authenticated account instead of the first workspace account", async () => {
  const workspaceId = "workspace:account-session-selection";
  const store = createMemoryLiveRecordStore<Record<string, unknown>>();

  await seedGeneratedRelationshipFixturesIntoLiveStore({
    store,
    workspaceId,
  });

  const sourceAccount = store.getRecord({
    workspaceId,
    collectionName: "accounts",
    recordId: "account_orbit_generated",
  });
  const sourceProfile = store.getRecord({
    workspaceId,
    collectionName: "profiles",
    recordId: "profile_orbit_generated_operator",
  });

  assert.ok(sourceAccount);
  assert.ok(sourceProfile);
  store.upsertRecord({
    ...sourceAccount,
    recordId: "account:secondary",
    userId: "account:secondary",
    payload: {
      ...sourceAccount.payload,
      id: "account:secondary",
      name: "Secondary Account",
    },
  });
  store.upsertRecord({
    ...sourceProfile,
    recordId: "profile:secondary",
    userId: "account:secondary",
    payload: {
      ...sourceProfile.payload,
      id: "profile:secondary",
      accountId: "account:secondary",
      displayName: "Secondary Actor",
    },
  });

  const service = createLiveAccountSessionService({
    provider: createStorageAccountSessionProvider({
      store,
      workspaceId,
    }),
  });
  const session = await service.getCurrentSession({
    accountId: "account:secondary",
    profileId: "profile:secondary",
    userId: "profile:secondary",
  });

  assert.equal(session.success, true);
  if (!session.success) return;
  assert.equal(session.data.account?.id, "account:secondary");
  assert.equal(session.data.user?.id, "profile:secondary");
  assert.equal(session.data.user?.displayName, "Secondary Actor");
});

test("dashboard and connections keep two accounts isolated inside one workspace", async () => {
  const workspaceId = "workspace:two-account-isolation";
  const primaryAccountId = defaultMockFixtures.accounts[0]?.id;
  const secondaryAccountId = "account:secondary";
  const store = createMemoryLiveRecordStore<Record<string, unknown>>();

  assert.ok(primaryAccountId);
  await seedGeneratedRelationshipFixturesIntoLiveStore({
    store,
    workspaceId,
  });

  const sourceContact = store.getRecord({
    workspaceId,
    collectionName: "contacts",
    recordId: "contact_001",
  });
  const sourceConnection = store.getRecord({
    workspaceId,
    collectionName: "connections",
    recordId: "connection_0001",
  });
  const sourceEvidence = store.getRecord({
    workspaceId,
    collectionName: "evidence",
    recordId: "evidence:connection:0001",
  });
  const sourceEvent = store.getRecord({
    workspaceId,
    collectionName: "events",
    recordId: "event_01",
  });
  const sourceTask = store.getRecord({
    workspaceId,
    collectionName: "tasks",
    recordId: "task_001",
  });

  assert.ok(sourceContact);
  assert.ok(sourceConnection);
  assert.ok(sourceEvidence);
  assert.ok(sourceEvent);
  assert.ok(sourceTask);

  const secondaryContactId = "contact:secondary";
  const secondaryConnectionId = "connection:secondary";
  const secondaryEvidenceId = "evidence:connection:secondary";
  const secondaryRecords = [
    {
      ...sourceContact,
      recordId: secondaryContactId,
      userId: secondaryAccountId,
      payload: {
        ...sourceContact.payload,
        id: secondaryContactId,
        displayName: "Secondary Account Contact",
        evidenceIds: [secondaryEvidenceId],
      },
      evidenceIds: [secondaryEvidenceId],
    },
    {
      ...sourceConnection,
      recordId: secondaryConnectionId,
      userId: secondaryAccountId,
      payload: {
        ...sourceConnection.payload,
        id: secondaryConnectionId,
        accountId: secondaryAccountId,
        contactId: secondaryContactId,
        evidenceIds: [secondaryEvidenceId],
      },
      evidenceIds: [secondaryEvidenceId],
    },
    {
      ...sourceEvidence,
      recordId: secondaryEvidenceId,
      userId: secondaryAccountId,
      payload: {
        ...sourceEvidence.payload,
        id: secondaryEvidenceId,
        createdBy: secondaryAccountId,
      },
      evidenceIds: [secondaryEvidenceId],
    },
    {
      ...sourceEvent,
      recordId: "event:secondary",
      userId: secondaryAccountId,
      payload: {
        ...sourceEvent.payload,
        id: "event:secondary",
        name: "Secondary Account Event",
      },
    },
    {
      ...sourceTask,
      recordId: "task:secondary",
      userId: secondaryAccountId,
      payload: {
        ...sourceTask.payload,
        id: "task:secondary",
        contactId: secondaryContactId,
        connectionId: secondaryConnectionId,
        title: "Secondary Account Task",
      },
    },
  ];

  for (const record of secondaryRecords) {
    store.upsertRecord(record);
  }

  const connectionService = createLiveConnectionEvidenceService({
    provider: createStorageConnectionEvidenceProvider({
      store,
      workspaceId,
    }),
  });
  const dashboardService = createLiveDashboardAggregateService({
    provider: createStorageDashboardAggregateProvider({
      store,
      workspaceId,
    }),
  });
  const bootstrapProvider = createStorageAppBootstrapProvider({
    store,
    workspaceId,
  });
  const relationshipProvider = createStorageRelationshipValueProvider({
    store,
    workspaceId,
  });
  const [
    primaryConnections,
    secondaryConnections,
    primaryDashboard,
    secondaryDashboard,
    primaryBootstrapGraph,
    secondaryBootstrapGraph,
    primaryRelationshipGraph,
    secondaryRelationshipGraph,
  ] =
    await Promise.all([
      connectionService.listConnections({ actorId: primaryAccountId }),
      connectionService.listConnections({ actorId: secondaryAccountId }),
      dashboardService.getDashboardAggregate({ actorId: primaryAccountId }),
      dashboardService.getDashboardAggregate({ actorId: secondaryAccountId }),
      bootstrapProvider.readBootstrapGraphForAccount!(primaryAccountId),
      bootstrapProvider.readBootstrapGraphForAccount!(secondaryAccountId),
      relationshipProvider.readRelationshipGraphForAccount!(primaryAccountId),
      relationshipProvider.readRelationshipGraphForAccount!(secondaryAccountId),
    ]);

  assert.equal(primaryConnections.success, true);
  assert.equal(secondaryConnections.success, true);
  assert.equal(primaryDashboard.success, true);
  assert.equal(secondaryDashboard.success, true);
  if (
    !primaryConnections.success ||
    !secondaryConnections.success ||
    !primaryDashboard.success ||
    !secondaryDashboard.success
  ) {
    return;
  }

  assert.equal(
    primaryConnections.data.connections.length,
    defaultMockFixtures.connections.length,
  );
  assert.deepEqual(
    secondaryConnections.data.connections.map((connection) => connection.id),
    [secondaryConnectionId],
  );
  assert.equal(
    primaryDashboard.data.relationshipAssetTotals.contacts,
    defaultMockFixtures.contacts.length,
  );
  assert.equal(
    secondaryDashboard.data.relationshipAssetTotals.contacts,
    1,
  );
  assert.equal(
    primaryDashboard.data.newContacts.contacts.some(
      (contact) => contact.name === "Secondary Account Contact",
    ),
    false,
  );
  assert.deepEqual(
    secondaryDashboard.data.newContacts.contacts.map((contact) => contact.name),
    ["Secondary Account Contact"],
  );
  assert.equal(primaryBootstrapGraph.contacts.length, defaultMockFixtures.contacts.length);
  assert.deepEqual(
    secondaryBootstrapGraph.contacts.map((contact) => contact.displayName),
    ["Secondary Account Contact"],
  );
  assert.equal(
    primaryRelationshipGraph.connections.some(
      (connection) => connection.id === secondaryConnectionId,
    ),
    false,
  );
  assert.deepEqual(
    secondaryRelationshipGraph.connections.map((connection) => connection.id),
    [secondaryConnectionId],
  );

  const chatProvider = createStorageChatConversationMessageProvider({
    store,
    workspaceId,
  });
  const permissionProvider = createStoragePermissionStateProvider({
    store,
    workspaceId,
  });
  const eventValueProvider = createStorageEventValueRecommendationProvider({
    store,
    workspaceId,
  });
  const eventRecommendationProvider = createStorageEventRecommendationProvider({
    store,
    workspaceId,
  });
  const auditProvider = createStorageSourceConsistencyProvenanceAuditProvider({
    store,
    workspaceId,
  });
  const [
    primaryChat,
    secondaryChat,
    primaryPermissions,
    secondaryPermissions,
    primaryEventValues,
    secondaryEventValues,
    primaryAudit,
    secondaryAudit,
  ] = await Promise.all([
    chatProvider.readChatGraphForAccount!(primaryAccountId),
    chatProvider.readChatGraphForAccount!(secondaryAccountId),
    permissionProvider.readPermissionGraphForAccount!(primaryAccountId),
    permissionProvider.readPermissionGraphForAccount!(secondaryAccountId),
    eventValueProvider.listEventsForAccount!(primaryAccountId),
    eventValueProvider.listEventsForAccount!(secondaryAccountId),
    auditProvider.readAuditGraphForAccount!(primaryAccountId),
    auditProvider.readAuditGraphForAccount!(secondaryAccountId),
  ]);

  assert.ok(primaryChat.conversations.length > 0);
  assert.deepEqual(secondaryChat.conversations, []);
  assert.ok(primaryPermissions.permissions.length > 0);
  assert.deepEqual(secondaryPermissions.permissions, []);
  assert.equal(primaryEventValues.length, defaultMockFixtures.events.length);
  assert.deepEqual(
    secondaryEventValues.map((event) => event.id),
    ["event:secondary"],
  );
  const primaryEventRecommendation =
    await eventRecommendationProvider.readEventRecommendationGraphForAccount!(
      primaryAccountId,
      "event_01",
    );
  const secondaryReadingPrimaryEvent =
    await eventRecommendationProvider.readEventRecommendationGraphForAccount!(
      secondaryAccountId,
      "event_01",
    );
  assert.equal(primaryEventRecommendation.event?.id, "event_01");
  assert.equal(secondaryReadingPrimaryEvent.event, null);
  assert.deepEqual(secondaryReadingPrimaryEvent.recommendations, []);
  assert.equal(
    primaryAudit.collections
      .find((collection) => collection.entityKind === "contact")
      ?.records.some((record) => record.recordId === secondaryContactId),
    false,
  );
  assert.deepEqual(
    secondaryAudit.collections
      .find((collection) => collection.entityKind === "contact")
      ?.records.map((record) => record.recordId),
    [secondaryContactId],
  );
});
