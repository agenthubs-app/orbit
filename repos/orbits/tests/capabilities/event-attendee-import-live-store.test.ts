import assert from "node:assert/strict";
import test from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";
import { existsSync } from "node:fs";
import { join } from "node:path";

import { createLiveEventAttendeeImportService } from "../../features/acquisition/live-event-attendee-import-service";
import { resolveEventAttendeeImportService } from "../../features/acquisition/service-factory";
import { createStorageEventAttendeeImportProvider } from "../../features/acquisition/storage/event-attendee-live-record-provider";
import { createMemoryLiveRecordStore } from "../../shared/storage/live-record-store";
import { seedGeneratedRelationshipFixturesIntoLiveStore } from "../../shared/storage/seed-generated-fixtures";

const projectRoot = join(fileURLToPath(import.meta.url), "../../..");

async function importProjectModule<TModule>(
  pathFromRoot: string,
): Promise<TModule> {
  const absolutePath = join(projectRoot, pathFromRoot);

  assert.equal(
    existsSync(absolutePath),
    true,
    `${pathFromRoot} must exist for live attendee import route verification`,
  );

  return (await import(pathToFileURL(absolutePath).href)) as TModule;
}

async function withoutLiveDatabaseEnv(run: () => Promise<void>): Promise<void> {
  const previousEventUrl = process.env.ORBIT_EVENT_DATABASE_URL;
  const previousFeatureMode = process.env.ORBIT_FEATURE_MODE;
  const previousLiveUrl = process.env.ORBIT_LIVE_DATABASE_URL;
  const previousModuleMode = process.env.ORBIT_MODULE_MODE;
  const previousOrbitUrl = process.env.ORBIT_DATABASE_URL;

  try {
    delete process.env.ORBIT_EVENT_DATABASE_URL;
    process.env.ORBIT_FEATURE_MODE = "live";
    delete process.env.ORBIT_LIVE_DATABASE_URL;
    delete process.env.ORBIT_DATABASE_URL;
    process.env.ORBIT_MODULE_MODE = "live";

    await run();
  } finally {
    if (previousEventUrl === undefined) {
      delete process.env.ORBIT_EVENT_DATABASE_URL;
    } else {
      process.env.ORBIT_EVENT_DATABASE_URL = previousEventUrl;
    }

    if (previousFeatureMode === undefined) {
      delete process.env.ORBIT_FEATURE_MODE;
    } else {
      process.env.ORBIT_FEATURE_MODE = previousFeatureMode;
    }

    if (previousLiveUrl === undefined) {
      delete process.env.ORBIT_LIVE_DATABASE_URL;
    } else {
      process.env.ORBIT_LIVE_DATABASE_URL = previousLiveUrl;
    }

    if (previousModuleMode === undefined) {
      delete process.env.ORBIT_MODULE_MODE;
    } else {
      process.env.ORBIT_MODULE_MODE = previousModuleMode;
    }

    if (previousOrbitUrl === undefined) {
      delete process.env.ORBIT_DATABASE_URL;
    } else {
      process.env.ORBIT_DATABASE_URL = previousOrbitUrl;
    }
  }
}

async function seededProvider() {
  const store = createMemoryLiveRecordStore<Record<string, unknown>>();
  const workspaceId = "workspace:event-attendee-live";

  await seedGeneratedRelationshipFixturesIntoLiveStore({
    now: () => "2026-07-01T00:00:00.000Z",
    store,
    workspaceId,
  });

  return createStorageEventAttendeeImportProvider({
    store,
    workspaceId,
  });
}

test("live event attendee import reads generated attendees and intents from shared storage", async () => {
  const service = createLiveEventAttendeeImportService({
    provider: await seededProvider(),
  });

  const roster = await service.listEventAttendees({ eventId: "event_01" });

  assert.equal(roster.success, true);
  assert.equal(roster.data.event.id, "event_01");
  assert.match(roster.data.event.name, /Tokyo Inbound Restaurant Growth Forum/);
  assert.equal(roster.data.attendees.length, 50);
  assert.equal(roster.data.provenance.generationMethod, "live-store-query");
  assert.equal(roster.data.provenance.bulkDatabaseImportExecuted, false);
  assert.equal(roster.data.provenance.liveDatabaseReadExecuted, true);

  const firstAttendee = roster.data.attendees.find(
    (attendee) => attendee.attendeeId === "participant_001",
  );

  assert.ok(firstAttendee);
  assert.equal(firstAttendee.displayName, "中村 沙也香");
  assert.equal(firstAttendee.relationshipStatus.code, "new_potential_contact");
  assert.match(firstAttendee.relationshipContext, /AI workflow PoC buyer/i);
  assert.deepEqual(firstAttendee.evidenceIds, ["evidence:participant:001"]);
  assert.equal(firstAttendee.organizerFeedRequested, false);
  assert.equal(firstAttendee.externalLookupExecuted, false);
  assert.equal(firstAttendee.databaseWriteExecuted, false);
});

test("live event attendee import stages review drafts without creating contacts", async () => {
  const service = createLiveEventAttendeeImportService({
    provider: await seededProvider(),
  });

  const imported = await service.importEventAttendees({
    eventId: "event_01",
    relationshipStatusFilter: "known_contact",
  });

  assert.equal(imported.success, true);
  assert.equal(imported.data.event.id, "event_01");
  assert.equal(imported.data.provenance.generationMethod, "live-store-draft-stage");
  assert.equal(imported.data.provenance.bulkDatabaseImportExecuted, false);
  assert.equal(imported.data.provenance.liveDatabaseReadExecuted, true);
  assert.ok(imported.data.contactDrafts.length > 0);
  assert.equal(imported.data.attendees.length, imported.data.contactDrafts.length);
  assert.ok(
    imported.data.contactDrafts.every(
      (draft) =>
        draft.relationshipStatus.code === "known_contact" &&
        draft.readyForReview === true &&
        draft.contactWriteExecuted === false &&
        draft.bulkDatabaseImportExecuted === false &&
        draft.notificationDelivered === false,
    ),
  );
});

test("event attendee import live factory and routes fail closed without live database config", async () => {
  await withoutLiveDatabaseEnv(async () => {
    const resolution = resolveEventAttendeeImportService("live");

    assert.equal(resolution.success, true);

    if (resolution.success) {
      const serviceResult = await resolution.service.listEventAttendees({
        eventId: "event_01",
      });

      assert.equal(serviceResult.success, false);
      assert.equal(
        serviceResult.error.code,
        "EVENT_ATTENDEE_IMPORT_LIVE_STORE_UNCONFIGURED",
      );
    }

    const importRoute = await importProjectModule<{
      POST: (request: Request) => Promise<Response>;
    }>("app/api/contact-drafts/event-attendees/import/route.ts");
    const response = await importRoute.POST(
      new Request(
        "https://orbit.local/api/contact-drafts/event-attendees/import?eventId=event_01",
        { method: "POST" },
      ),
    );

    assert.equal(response.status, 503);
    assert.equal(response.headers.get("x-orbit-feature-mode"), "live");
    assert.deepEqual(await response.json(), {
      success: false,
      error: {
        code: "SERVICE_UNAVAILABLE",
        message: "The live event attendee import store is not configured.",
        context: {
          boundary: "developer-admin",
          eventAttendeeImportErrorCode:
            "EVENT_ATTENDEE_IMPORT_LIVE_STORE_UNCONFIGURED",
          mode: "live",
          privacy: "no-relationship-data",
          provenance:
            "Live event attendee import failure came from the configured live provider boundary.",
          service: "event-attendee-import",
        },
      },
    });
  });
});
