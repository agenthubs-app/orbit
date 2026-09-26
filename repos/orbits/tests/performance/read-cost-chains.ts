import assert from "node:assert/strict";

import { createLiveContactsListSearchAndFilterService } from "../../features/contacts/live-service";
import {
  createPostgresContactRecordPageReader,
  createStorageContactGraphProvider,
} from "../../features/contacts/storage/contact-live-record-provider";
import { createPostgresContactScopeRecordReader } from "../../features/contacts/storage/contact-scope-postgres-reader";
import { createLiveDashboardAggregateService } from "../../features/dashboard/live-service";
import { createStorageDashboardAggregateProvider } from "../../features/dashboard/storage/dashboard-live-record-provider";
import { createLiveNetworkDistributionAnalyticsService } from "../../features/dashboard/live-distribution-service";
import { createLiveOpportunityReminderAnalyticsService } from "../../features/dashboard/live-opportunity-service";
import {
  networkDistributionProviderForAccount,
  opportunityProviderForAccount,
} from "../../features/dashboard/service-factory";
import { createMobileContactsDashboardServiceFromSources } from "../../features/mobile/contacts-dashboard-service";
import { createLiveProfileService } from "../../features/profile/live-service";
import { createStorageProfileProvider } from "../../features/profile/storage/profile-live-record-provider";
import { createLiveEventCrudAndImportService } from "../../features/events/event-crud-and-import/live-service";
import { createStorageEventStoreProvider } from "../../features/events/event-crud-and-import/providers/storage-event-provider";
import { createNoteAssociationReader } from "../../features/notes/association-reader";
import { createNoteRepository } from "../../features/notes/repository";
import { createNoteService } from "../../features/notes/service";
import { createTaskRepository } from "../../features/tasks/repository";
import { createTaskService } from "../../features/tasks/service";
import { createConfiguredPostgresLiveRecordStore } from "../../shared/storage/configured-live-record-store";
import { seedGeneratedRelationshipFixturesIntoLiveStore } from "../../shared/storage/seed-generated-fixtures";
import type { TransactionalPostgresClient } from "../../shared/storage/transactional-postgres";

/**
 * The five operation chains of the frozen read-cost baseline, seeded and
 * composed exactly as production composes them (read-dedupe wrapper
 * included); only the SQL client is the caller's measured one. Shared by the
 * baseline ratchet and the read-receipt reconciliation test so both measure
 * the same operations.
 */
export const READ_COST_SEEDED_AT = "2026-09-18T00:00:00.000Z";
export const READ_COST_NOTE_COUNT = 12;
export const READ_COST_TASK_COUNT = 12;

export async function seedReadCostChains({
  client,
  databaseUrl,
  schema,
  workspaceId,
  actorId,
}: {
  client: TransactionalPostgresClient;
  databaseUrl: string;
  schema: string;
  workspaceId: string;
  actorId: string;
}): Promise<Record<string, () => Promise<unknown>>> {
  const configured = createConfiguredPostgresLiveRecordStore({
    createClient: () => ({ query: client.query.bind(client), close: async () => {} }),
    env: {
      ORBIT_DATABASE_TARGET: "local",
      ORBIT_LOCAL_DATABASE_URL: `${databaseUrl}#${schema}`,
      ORBIT_LOCAL_WORKSPACE_ID: workspaceId,
    },
  });
  assert.ok(configured);
  const { store } = configured;
  await seedGeneratedRelationshipFixturesIntoLiveStore({ store, workspaceId, now: () => READ_COST_SEEDED_AT });
  const notes = createNoteService({
    repository: createNoteRepository({ store, workspaceId }),
    associationReader: createNoteAssociationReader({
      contactProvider: createStorageContactGraphProvider({ store, workspaceId }),
      store,
      workspaceId,
    }),
  });
  for (let index = 0; index < READ_COST_NOTE_COUNT; index += 1) {
    await notes.create({
      actorId,
      title: `Baseline note ${index}`,
      body: `Deterministic note body ${index}`,
      idempotencyKey: `read-cost:note:${index}`,
      now: READ_COST_SEEDED_AT,
    });
  }

  // Generated fixture tasks are legacy-shaped and invisible to the canonical task list;
  // the measured actor's tasks are created through the real service like API traffic.
  const tasks = createTaskService({ repository: createTaskRepository({ store, workspaceId, transactionClient: client }) });
  for (let index = 0; index < READ_COST_TASK_COUNT; index += 1) {
    await tasks.create({
      actorId,
      title: `Baseline task ${index}`,
      category: "work",
      idempotencyKey: `read-cost:task:${index}`,
      now: READ_COST_SEEDED_AT,
    });
  }

  const contactProvider = createStorageContactGraphProvider({
    store,
    workspaceId,
    contactScopeRecordReader: createPostgresContactScopeRecordReader({ client, workspaceId }),
    contactRecordPageReader: createPostgresContactRecordPageReader({ client, workspaceId }),
  });
  return {
    "contacts.list": async () => {
      const result = await createLiveContactsListSearchAndFilterService({ provider: contactProvider }).listContacts({ actorId });
      assert.ok(result.success, "contacts.list must succeed");
      assert.ok(result.data.contacts.length > 0, "contacts.list must return the actor's contacts");
      return result.data.contacts.length;
    },
    "tasks.list": async () => {
      const items = await tasks.list({ actorId });
      assert.equal(items.length, READ_COST_TASK_COUNT);
      return items.length;
    },
    "notes.list": async () => {
      const items = await notes.list({ actorId });
      assert.equal(items.length, READ_COST_NOTE_COUNT);
      return items.length;
    },
    "dashboard": async () => {
      const result = await createLiveDashboardAggregateService({
        provider: createStorageDashboardAggregateProvider({ store, workspaceId, sqlClient: client }),
      }).getDashboardAggregate({ actorId });
      assert.ok(result.success, "dashboard must succeed");
      return result.success;
    },
    "contacts.dashboard": async () => {
      // Production composition of /api/mobile/contacts-dashboard; the stored AI
      // analysis lookup (chat sessions) is not part of this read chain.
      const dashboardProvider = createStorageDashboardAggregateProvider({ store, workspaceId, sqlClient: client });
      const result = await createMobileContactsDashboardServiceFromSources({
        dashboard: createLiveDashboardAggregateService({ provider: dashboardProvider }),
        distribution: (id) => createLiveNetworkDistributionAnalyticsService({
          provider: networkDistributionProviderForAccount(dashboardProvider, id),
        }),
        opportunity: (id) => createLiveOpportunityReminderAnalyticsService({
          provider: opportunityProviderForAccount(dashboardProvider, id),
        }),
        profile: createLiveProfileService({ provider: createStorageProfileProvider({ store, workspaceId }) }),
        contacts: createLiveContactsListSearchAndFilterService({ provider: contactProvider }),
        contactRoleCounts: (id) => dashboardProvider.readContactRoleCountsForAccount!(id),
      }).getDashboard({ actorId });
      assert.ok(result.success, "contacts.dashboard must succeed");
      assert.deepEqual(result.data.unavailableSections.filter((section) => section !== "analysis" && section !== "profile"), []);
      return result.data.aggregate.relationshipAssetTotals.contacts;
    },
    "events.list": async () => {
      const result = await createLiveEventCrudAndImportService({
        provider: createStorageEventStoreProvider({ store, workspaceId }),
      }).listEvents({ actorId });
      assert.ok(result.success, "events.list must succeed");
      return result.success;
    },
  };
}
