import assert from "node:assert/strict";
import test from "node:test";

import { createLiveFollowupTaskGenerationService } from "../../features/followups/live-service";
import { createStorageFollowupTaskProvider } from "../../features/followups/storage/followup-live-record-provider";
import {
  createFollowupTaskGenerationService,
  resolveFollowupTaskGenerationService,
} from "../../features/followups/service-factory";
import { defaultMockFixtures } from "../../shared/mock/fixtures";
import { createMemoryLiveRecordStore } from "../../shared/storage/live-record-store";
import { seedGeneratedRelationshipFixturesIntoLiveStore } from "../../shared/storage/seed-generated-fixtures";

test("live followup task generation reads generated tasks from shared live storage", async () => {
  const actorId = "actor:followup-live-store-test";
  const workspaceId = "workspace:followup-live-store-test";
  const store = createMemoryLiveRecordStore<Record<string, unknown>>();

  await seedGeneratedRelationshipFixturesIntoLiveStore({
    now: () => "2026-07-01T19:00:00.000Z",
    store,
    workspaceId,
  });
  for (const collectionName of ["tasks", "contacts", "connections", "evidence"]) {
    const records = await store.listRecords({ collectionName, workspaceId });
    for (const record of records) {
      await store.upsertRecord({
        ...record,
        userId: actorId,
        payload: { ...record.payload, accountId: actorId },
      });
    }
  }
  const firstTaskRecord = (
    await store.listRecords({ collectionName: "tasks", workspaceId })
  )[0];
  assert.ok(firstTaskRecord);
  await store.upsertRecord({
    ...firstTaskRecord,
    recordId: "task:other-actor",
    sourceId: "task:other-actor",
    userId: "actor:other",
    payload: {
      ...firstTaskRecord.payload,
      accountId: "actor:other",
      id: "task:other-actor",
      title: "Other actor private follow-up",
    },
  });

  const provider = createStorageFollowupTaskProvider({
    sourceLabel: "Followup memory live storage",
    store,
    workspaceId,
  });
  const service = createLiveFollowupTaskGenerationService({
    provider,
  });

  const listResult = await service.listTasks({ actorId, limit: 1 });

  assert.equal(listResult.success, true);
  assert.equal(listResult.data.tasks.length, 1);
  assert.equal(listResult.data.provenance.source, `live-record-store:followups:${workspaceId}`);
  assert.equal(listResult.data.provenance.sourceLabel, "Followup memory live storage");
  assert.equal(listResult.data.provenance.privacy, "live-followup-task-generation");
  assert.equal(listResult.data.provenance.generationMethod, "live-store-query");
  assert.equal(listResult.data.provenance.liveDatabaseReadExecuted, true);
  assert.equal(listResult.data.provenance.liveDatabaseWriteExecuted, false);
  assert.equal(listResult.data.provenance.aiProviderRequested, false);

  const task = listResult.data.tasks[0];

  assert.ok(defaultMockFixtures.tasks.length >= 40);
  assert.equal(typeof task?.taskId, "string");
  assert.equal(task?.generatedBy, "live-store-query");
  assert.equal(task?.liveTaskPersistenceRequested, false);
  assert.equal(task?.aiProviderRequested, false);

  const trigger = listResult.data.triggers[0];

  assert.equal(typeof trigger?.connectionId, "string");
  assert.equal(typeof trigger?.contactName, "string");
  assert.equal(trigger?.liveDatabaseReadExecuted, true);

  const expectedTask = defaultMockFixtures.tasks.find(
    (candidate) => candidate.id === "task_001",
  );
  const expectedContact = defaultMockFixtures.contacts.find(
    (candidate) => candidate.id === expectedTask?.contactId,
  );
  assert.ok(expectedTask?.connectionId);
  assert.ok(expectedContact);

  const generatedResult = await service.generateTasks({
    actorId,
    connectionId: expectedTask.connectionId,
    limit: 1,
  });

  assert.equal(generatedResult.success, true);
  assert.deepEqual(
    generatedResult.data.tasks.map((item) => item.taskId),
    ["task_001"],
  );
  assert.equal(generatedResult.data.tasks[0]?.title, expectedTask.title);
  assert.equal(
    generatedResult.data.tasks[0]?.connectionId,
    expectedTask.connectionId,
  );
  assert.equal(generatedResult.data.tasks[0]?.contactName, expectedContact.displayName);
  assert.equal(generatedResult.data.tasks[0]?.contactId, expectedContact.id);
  assert.equal(
    generatedResult.data.tasks[0]?.organization,
    expectedContact.organization,
  );
  assert.equal(generatedResult.data.tasks[0]?.source.type, "agent_action");
  assert.deepEqual(generatedResult.data.tasks[0]?.evidenceIds, [
    "evidence:task:001",
  ]);
  assert.match(
    generatedResult.data.tasks[0]?.rationale ?? "",
    new RegExp(expectedContact.displayName),
  );

  const allActorTasks = await service.listTasks({ actorId });
  assert.equal(allActorTasks.success, true);
  if (allActorTasks.success) {
    assert.doesNotMatch(
      allActorTasks.data.tasks.map((item) => item.title).join(" "),
      /Other actor private follow-up/,
    );
  }

  const taskRecords = await store.listRecords({
    collectionName: "tasks",
    workspaceId,
  });
  for (const record of taskRecords) {
    await store.deleteRecord({
      collectionName: "tasks",
      deletedAt: "2026-07-01T20:00:00.000Z",
      recordId: record.recordId,
      workspaceId,
    });
  }

  const relationshipSuggestions = await service.listTasks({
    actorId,
    limit: 1,
  });

  assert.equal(relationshipSuggestions.success, true);
  if (relationshipSuggestions.success) {
    const suggestion = relationshipSuggestions.data.tasks[0];

    assert.equal(relationshipSuggestions.data.state, "success");
    assert.equal(relationshipSuggestions.data.tasks.length, 1);
    assert.match(suggestion?.taskId ?? "", /^relationship-suggestion:/);
    assert.equal(suggestion?.source.type, "system");
    assert.equal(
      suggestion?.source.label,
      "Derived from saved relationship evidence",
    );
    assert.equal(suggestion?.liveTaskPersistenceRequested, false);
    assert.ok((suggestion?.evidenceIds.length ?? 0) > 0);
  }
});

test("followup task generation factory registers live mode and fails closed without live database config", async () => {
  const previousDatabaseUrl = process.env.ORBIT_DATABASE_URL;
  const previousEventDatabaseUrl = process.env.ORBIT_EVENT_DATABASE_URL;
  const previousLiveDatabaseUrl = process.env.ORBIT_LIVE_DATABASE_URL;

  try {
    delete process.env.ORBIT_DATABASE_URL;
    delete process.env.ORBIT_EVENT_DATABASE_URL;
    delete process.env.ORBIT_LIVE_DATABASE_URL;

    const liveResolution = resolveFollowupTaskGenerationService("live");
    const liveService = createFollowupTaskGenerationService("live");
    const result = await liveService.listTasks({
      actorId: "actor:unconfigured-live-store",
    });

    assert.equal(liveResolution.success, true);
    assert.equal(result.success, false);

    if (!result.success) {
      assert.equal(
        result.error.code,
        "FOLLOWUP_TASK_GENERATION_LIVE_STORE_UNCONFIGURED",
      );
      assert.equal(result.error.provenance.liveDatabaseReadExecuted, false);
      assert.equal(result.error.provenance.generationMethod, "live-store-query");
    }
  } finally {
    if (previousDatabaseUrl === undefined) {
      delete process.env.ORBIT_DATABASE_URL;
    } else {
      process.env.ORBIT_DATABASE_URL = previousDatabaseUrl;
    }

    if (previousEventDatabaseUrl === undefined) {
      delete process.env.ORBIT_EVENT_DATABASE_URL;
    } else {
      process.env.ORBIT_EVENT_DATABASE_URL = previousEventDatabaseUrl;
    }

    if (previousLiveDatabaseUrl === undefined) {
      delete process.env.ORBIT_LIVE_DATABASE_URL;
    } else {
      process.env.ORBIT_LIVE_DATABASE_URL = previousLiveDatabaseUrl;
    }
  }
});

test("live followup task generation requires an actor before provider access", async () => {
  let providerRead = false;
  const service = createLiveFollowupTaskGenerationService({
    provider: {
      source: "test:followups",
      sourceLabel: "Test followups",
      readFollowupGraph: () => {
        providerRead = true;
        throw new Error("provider must not run without an actor");
      },
    },
  });

  const result = await service.listTasks();

  assert.equal(result.success, false);
  assert.equal(providerRead, false);
  if (!result.success) {
    assert.equal(result.error.code, "FOLLOWUP_TASK_GENERATION_ACTOR_REQUIRED");
    assert.equal(result.error.provenance.liveDatabaseReadExecuted, false);
  }
});
