import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const projectRoot = join(fileURLToPath(import.meta.url), "../../..");
const source = (path: string) => readFileSync(join(projectRoot, path), "utf8");

// R17：旧运营台 UI（ops-0918）已删除；新运营台的权限与界面断言在 tests/host/*、tests/pages/event-operations-delegate-access.test.ts。
test("event operations routes bind organizer and attendee actions to server event scope", () => {
  const handlers = source("app/api/events/[id]/operations/handlers.ts");
  const service = source("features/events/event-operations/service.ts");
  const onsiteRepository = source(
    "features/events/event-operations/storage/onsite-operations-repository.ts",
  );
  const ownerRoutes = [
    "app/api/events/[id]/operations/admin/route.ts",
    "app/api/events/[id]/operations/admin/export/route.ts",
    "app/api/events/[id]/operations/admin/check-ins/route.ts",
    "app/api/events/[id]/operations/admin/generations/route.ts",
    "app/api/events/[id]/operations/admin/generations/[generationId]/run/route.ts",
    "app/api/events/[id]/operations/admin/generations/[generationId]/retry/route.ts",
    "app/api/events/[id]/operations/admin/generations/[generationId]/publish/route.ts",
  ];
  const attendeeRoutes = [
    "app/api/events/[id]/operations/route.ts",
    "app/api/events/[id]/operations/check-in/route.ts",
    "app/api/events/[id]/operations/contact-requests/route.ts",
    "app/api/events/[id]/operations/contact-requests/[requestId]/respond/route.ts",
  ];

  for (const path of [...ownerRoutes, ...attendeeRoutes]) {
    assert.match(source(path), /createEventOperations/);
  }
  assert.match(
    handlers,
    /withEventCapabilityAccess\("attendees\.export"/u,
  );
  assert.match(handlers, /withRegisteredEventAccess/);
  assert.match(handlers, /EVENT_OPERATIONS_DURABLE_WORKER_REQUIRED/);
  assert.doesNotMatch(handlers, /serviceFor\(dependencies\)\.runGeneration/);
  assert.match(handlers, /eventId: access\.eventId/g);
  assert.match(handlers, /published\?\.directory \?\? workspace\.participants/);
  assert.match(handlers, /published\?\.generationId/);
  assert.match(handlers, /published\?\.snapshotHash/);
  assert.match(service, /generation\.eventId !== input\.eventId/);
  assert.match(onsiteRepository, /request\.event_id !== eventId/);
  assert.match(onsiteRepository, /request\.target_actor_id !== targetActorId/);
  assert.match(onsiteRepository, /Only the target participant can respond/);
});

test("E2E seed requires an external password and never fabricates AI output", () => {
  const seed = source("features/events/event-operations/seed.ts");
  const script = source("scripts/seed-event-operations-e2e.ts");

  assert.match(seed, /EVENT_OPERATIONS_E2E_PARTICIPANTS/);
  assert.match(seed, /matchingCohort\.length !== 64/);
  assert.match(seed, /cancelledFixtures\.length !== 6/);
  assert.match(seed, /lateFixtures\.length !== 3/);
  assert.match(script, /EVENT_OPERATIONS_E2E_SEED_ACCOUNTS/);
  assert.match(seed, /profileEditDeadlineAt/);
  assert.match(seed, /EVENT_OPERATIONS_COLLECTIONS/);
  assert.match(script, /ORBIT_EVENT_OPERATIONS_SEED_PASSWORD/);
  assert.match(script, /The seed never embeds or prints a password/);
  assert.match(script, /No recommendation, table, graph, check-in, or contact-request result was fabricated/);
  assert.doesNotMatch(script, /password:\s*["'][^"']+["']/);
});
