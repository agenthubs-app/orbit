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
  const workspaceId = "workspace:followup-live-store-test";
  const store = createMemoryLiveRecordStore<Record<string, unknown>>();

  await seedGeneratedRelationshipFixturesIntoLiveStore({
    now: () => "2026-07-01T19:00:00.000Z",
    store,
    workspaceId,
  });

  const provider = createStorageFollowupTaskProvider({
    sourceLabel: "Followup memory live storage",
    store,
    workspaceId,
  });
  const service = createLiveFollowupTaskGenerationService({
    provider,
  });

  const listResult = await service.listTasks({ limit: 1 });

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

  assert.equal(defaultMockFixtures.tasks.length, 80);
  assert.equal(typeof task?.taskId, "string");
  assert.equal(task?.generatedBy, "live-store-query");
  assert.equal(task?.liveTaskPersistenceRequested, false);
  assert.equal(task?.aiProviderRequested, false);

  const trigger = listResult.data.triggers[0];

  assert.equal(typeof trigger?.connectionId, "string");
  assert.equal(typeof trigger?.contactName, "string");
  assert.equal(trigger?.liveDatabaseReadExecuted, true);

  const generatedResult = await service.generateTasks({
    connectionId: "connection_for_contact_021",
    limit: 1,
  });

  assert.equal(generatedResult.success, true);
  assert.deepEqual(
    generatedResult.data.tasks.map((item) => item.taskId),
    ["task_001"],
  );
  assert.equal(generatedResult.data.tasks[0]?.title, "Review follow-up for contact_021");
  assert.equal(
    generatedResult.data.tasks[0]?.connectionId,
    "connection_for_contact_021",
  );
  assert.equal(generatedResult.data.tasks[0]?.contactName, "山崎 美穂");
  assert.equal(generatedResult.data.tasks[0]?.organization, "Aoba Technologies");
  assert.equal(generatedResult.data.tasks[0]?.source.type, "agent_action");
  assert.deepEqual(generatedResult.data.tasks[0]?.evidenceIds, [
    "evidence:task:001",
  ]);
  assert.match(generatedResult.data.tasks[0]?.rationale ?? "", /山崎 美穂/);
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
    const result = await liveService.listTasks();

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
