import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const projectRoot = join(fileURLToPath(import.meta.url), "../../..");
const source = (path: string) => readFileSync(join(projectRoot, path), "utf8");

test("event operations workspace requires login and per-event operations capability", () => {
  const page = source("app/(app)/app/events/[id]/operations/page.tsx");
  const eventDetail = source("app/(app)/app/events/[id]/page.tsx");

  assert.match(page, /const \[\{ id: routeId \}, session\] = await Promise\.all\(\[params, auth\(\)\]\)/);
  assert.match(page, /if \(!session\?\.user\?\.id\)/);
  assert.match(page, /createConfiguredEventAccessService\(\)/);
  assert.match(page, /canonicalEventId = \(await eventCore\.getEvent\(eventId\)\)\?\.eventId/);
  assert.match(page, /requireEventCapability/);
  assert.match(page, /capability: "operations\.read_sensitive"/);
  assert.match(page, /actorId: session\.user\.id/);
  assert.match(page, /eventId: canonicalEventId/);
  assert.match(page, /Event operations access required/);
  assert.doesNotMatch(page, /readPublicEventCatalogue/);
  assert.match(eventDetail, /\/operations/);
  assert.match(eventDetail, /Open organizer operations/);
});

test("organizer workspace exposes the complete strict generation and audit workflow", () => {
  const client = source(
    "app/(app)/app/events/[id]/operations/event-operations-admin-workspace.tsx",
  );

  assert.match(client, /method: "PUT"/);
  assert.match(client, /Capture snapshot/);
  assert.match(client, /Worker processing/);
  assert.match(client, /setInterval/);
  assert.match(client, /durable worker has been queued/);
  assert.doesNotMatch(client, /maxConcurrency|event-operations-admin-ui/);
  assert.match(client, /Retry failed shards/);
  assert.match(client, /Publish atomically/);
  assert.match(client, /completed shard outputs were retained/);
  assert.match(client, /\/export/);
  assert.match(client, /REAL REGISTRATION DIRECTORY/);
  assert.match(client, /CONSENT AUDIT/);
  assert.match(client, /\/check-ins/);
  assert.match(client, /Mark arrived/);
  assert.match(client, /VENUE CHECK-IN ENTRY/);
  assert.match(client, /No QR image is generated/);
  assert.match(client, /party\/checkin\?eventId=/);
  assert.match(client, /CONFIGURED TIMELINE/);
  assert.match(client, /profileEditDeadlineAt/);
  assert.match(client, /roundOneStartsAt/);
  assert.match(client, /PUBLISHED SEATING PREVIEW/);
  assert.match(client, /grouping\.roundOne/);
  assert.match(client, /grouping\.roundTwo/);
  assert.match(client, /table\.rationale/);
  assert.match(client, /table\.icebreakers/);
  assert.match(client, /member\.seat/);
  assert.match(client, /No recommendation, table|never visible to attendees/);
  assert.doesNotMatch(client, /mock recommendation|fallback table|first four/i);
});

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
  assert.match(handlers, /withOwnedEventAccess/);
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
