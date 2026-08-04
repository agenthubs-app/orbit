import assert from "node:assert/strict";
import test from "node:test";

import {
  buildEventCoreBackfillPlan,
  eventCanonicalValueDigest,
  type EventCoreBackfillCandidate,
} from "../../features/events/core/backfill";
import { EventCoreDataError } from "../../features/events/core/contract";
import type {
  EventCanonicalConflictResolution,
  EventCanonicalResolutionManifest,
} from "../../features/events/core/migration/contract";
import { EVENT_CANONICAL_V1_MANIFEST } from "../../features/events/core/migration/manifests/event-canonical-v1";

const signupDefinitions = [
  {
    eventId: "event_signup_02",
    legacyEndsAt: "2026-09-01T14:00:00+09:00",
    legacyTitle: "东京 AI 落地伙伴报名会",
    publicCode: "EVTSIGNUP02",
    publicEndsAt: "2026-09-01T16:00:00+09:00",
    publicTitle: "东京 AI 落地伙伴对接会",
    startsAt: "2026-09-01T14:00:00+09:00",
  },
  {
    eventId: "event_signup_03",
    legacyEndsAt: "2026-09-15T18:00:00+09:00",
    legacyTitle: "日中投资人与创业者报名沙龙",
    publicCode: "EVTSIGNUP03",
    publicEndsAt: "2026-09-15T20:00:00+09:00",
    publicTitle: "日中投资人与创业者沙龙",
    startsAt: "2026-09-15T18:00:00+09:00",
  },
] as const;

function sourceCandidates(): EventCoreBackfillCandidate[] {
  return signupDefinitions.flatMap((definition) => [
    {
      endsAt: definition.legacyEndsAt,
      eventId: definition.eventId,
      lifecycleState: "published" as const,
      organizerActorId: "account_orbit_generated",
      source: "orbit_records/events",
      sourcePayload: { recordId: definition.eventId },
      startsAt: definition.startsAt,
      timezone: "Asia/Tokyo",
      title: definition.legacyTitle,
      venue: "东京",
    },
    {
      endsAt: definition.publicEndsAt,
      eventId: definition.eventId,
      lifecycleState: "published" as const,
      organizerActorId: "account_orbit_generated",
      publicCode: definition.publicCode,
      source: "public_catalogue",
      sourcePayload: { evidenceIds: [`evidence:${definition.eventId}`] },
      startsAt: definition.startsAt,
      timezone: "Asia/Tokyo",
      title: definition.publicTitle,
      venue: "东京",
    },
  ]);
}

function manifestWith(
  resolutions: readonly EventCanonicalConflictResolution[],
): EventCanonicalResolutionManifest {
  return {
    migrationId: EVENT_CANONICAL_V1_MANIFEST.migrationId,
    resolutions,
    schemaVersion: 1,
  };
}

function expectsConflict(operation: () => unknown, pattern: RegExp): void {
  assert.throws(
    operation,
    (error: unknown) =>
      error instanceof EventCoreDataError &&
      error.code === "EVENT_CORE_BACKFILL_CONFLICT" &&
      pattern.test(error.message),
  );
}

test("event-canonical-v1 contains exactly four immutable reviewed resolutions", () => {
  assert.equal(EVENT_CANONICAL_V1_MANIFEST.schemaVersion, 1);
  assert.equal(EVENT_CANONICAL_V1_MANIFEST.migrationId, "event-canonical-v1");
  assert.equal(EVENT_CANONICAL_V1_MANIFEST.resolutions.length, 4);
  assert.ok(Object.isFrozen(EVENT_CANONICAL_V1_MANIFEST));
  assert.ok(Object.isFrozen(EVENT_CANONICAL_V1_MANIFEST.resolutions));
  for (const resolution of EVENT_CANONICAL_V1_MANIFEST.resolutions) {
    assert.ok(Object.isFrozen(resolution));
    assert.ok(Object.isFrozen(resolution.sourceValueDigests));
    assert.ok(resolution.sourceValueDigests.every(Object.isFrozen));
  }
});

test("the four reviewed conflicts select public values and produce positive durations", () => {
  const plan = buildEventCoreBackfillPlan(
    sourceCandidates(),
    EVENT_CANONICAL_V1_MANIFEST,
  );

  assert.equal(plan.resolutionCount, 4);
  assert.equal(plan.migrationId, "event-canonical-v1");
  for (const definition of signupDefinitions) {
    const event = plan.events.find((item) => item.eventId === definition.eventId);
    assert.equal(event?.title, definition.publicTitle);
    assert.equal(event?.endsAt, new Date(definition.publicEndsAt).toISOString());
    assert.ok(Date.parse(event!.endsAt) > Date.parse(event!.startsAt));
    const audit = event?.sourcePayload.migrationResolution as {
      migrationId?: unknown;
      resolutions?: unknown[];
    };
    assert.equal(audit.migrationId, "event-canonical-v1");
    assert.equal(audit.resolutions?.length, 2);
  }
});

test("resolution plan hash is stable across source and manifest input order", () => {
  const forward = buildEventCoreBackfillPlan(
    sourceCandidates(),
    EVENT_CANONICAL_V1_MANIFEST,
  );
  const reversed = buildEventCoreBackfillPlan(
    sourceCandidates().reverse(),
    manifestWith([...EVENT_CANONICAL_V1_MANIFEST.resolutions].reverse()),
  );

  assert.equal(reversed.hash, forward.hash);
  assert.deepEqual(reversed.events, forward.events);
});

test("removing one reviewed resolution fails at its exact conflict", () => {
  expectsConflict(
    () => buildEventCoreBackfillPlan(
      sourceCandidates(),
      manifestWith(EVENT_CANONICAL_V1_MANIFEST.resolutions.slice(1)),
    ),
    /event_signup_02.*conflicting title/i,
  );
});

test("adding one unused resolution fails closed", () => {
  const extra: EventCanonicalConflictResolution = {
    eventId: "event_signup_02",
    field: "venue",
    rationale: "Test-only extra resolution must never be silently accepted.",
    reasonCode: "TEST_EXTRA",
    selectedSource: "public_catalogue",
    sourceValueDigests: [
      {
        digest: eventCanonicalValueDigest("东京"),
        source: "public_catalogue",
      },
      {
        digest: eventCanonicalValueDigest("东京"),
        source: "orbit_records/events",
      },
    ],
  };
  expectsConflict(
    () => buildEventCoreBackfillPlan(
      sourceCandidates(),
      manifestWith([...EVENT_CANONICAL_V1_MANIFEST.resolutions, extra]),
    ),
    /unconsumed entries/i,
  );
});

test("a fifth source conflict remains blocked", () => {
  const candidates = sourceCandidates();
  candidates[0] = { ...candidates[0]!, venue: "大阪" };
  expectsConflict(
    () => buildEventCoreBackfillPlan(
      candidates,
      EVENT_CANONICAL_V1_MANIFEST,
    ),
    /event_signup_02.*conflicting venue/i,
  );
});

test("digest drift fails closed before applying a selected value", () => {
  const [first, ...rest] = EVENT_CANONICAL_V1_MANIFEST.resolutions;
  const changed: EventCanonicalConflictResolution = {
    ...first!,
    sourceValueDigests: first!.sourceValueDigests.map((item, index) =>
      index === 0 ? { ...item, digest: "0".repeat(64) } : item,
    ),
  };
  expectsConflict(
    () => buildEventCoreBackfillPlan(
      sourceCandidates(),
      manifestWith([changed, ...rest]),
    ),
    /digest mismatch/i,
  );
});

test("a missing selected source fails closed", () => {
  const [first, ...rest] = EVENT_CANONICAL_V1_MANIFEST.resolutions;
  const changed: EventCanonicalConflictResolution = {
    ...first!,
    selectedSource: "missing_reviewed_source",
  };
  expectsConflict(
    () => buildEventCoreBackfillPlan(
      sourceCandidates(),
      manifestWith([changed, ...rest]),
    ),
    /selected source missing_reviewed_source is absent/i,
  );
});

test("text digests use NFC after trimming", () => {
  const decomposed = "  Cafe\u0301  ".normalize("NFD");
  const composed = "Café".normalize("NFC");
  const template = sourceCandidates()[0]!;
  const candidates: EventCoreBackfillCandidate[] = [
    {
      ...template,
      eventId: "event:nfc",
      endsAt: "2026-09-01T16:00:00+09:00",
      source: "source:nfd",
      sourcePayload: {},
      title: decomposed,
    },
    {
      ...template,
      eventId: "event:nfc",
      endsAt: "2026-09-01T16:00:00+09:00",
      source: "source:nfc",
      sourcePayload: {},
      title: composed,
    },
  ];
  const plan = buildEventCoreBackfillPlan(candidates, {
    migrationId: "nfc-no-conflict",
    resolutions: [],
    schemaVersion: 1,
  });
  assert.equal(plan.events[0]?.title, composed);
});
