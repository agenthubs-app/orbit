import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import ts from "typescript";

import type { PublishedCanonicalEvent } from "../../features/events/core/contract";
import type { EventOperationsRepository } from "../../features/events/event-operations/repository";
import type { EventRegistration } from "../../features/events/registration/contract";
import type { OrbitLandingEventView } from "../../app/(app)/app/orbit-landing-route-view-model";
import {
  createCanonicalParticipantEventJourneyReader,
  createConfiguredCanonicalParticipantEventJourneyReader,
  readConfiguredCanonicalParticipantEventJourneys,
} from "../../features/events/canonical-participant-event-journeys";
import {
  loadAppHomeRouteViewModel,
  mergeHomeEventJourneys,
} from "../../app/(app)/app/home/compose-app-home-from-previously-approved-mock-first-capabilities/home-route-view-model";

const now = new Date("2026-09-16T12:00:00.000Z");

test("event choice treats only the canonical provider's record id as canonical identity", () => {
  const source = readFileSync(new URL("../../app/(app)/app/events/compose-app-events-from-previously-approved-mock-first-capabilities/events-route-view-model.ts", import.meta.url), "utf8");
  const tree = ts.createSourceFile("route.ts", source, ts.ScriptTarget.Latest, true);
  const declaration = tree.statements.find((node) => ts.isFunctionDeclaration(node) && node.name?.text === "eventChoiceViewModel");
  assert.ok(declaration);
  const compiled = ts.transpileModule(declaration.getText(tree), { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
  const project = runInNewContext(`${compiled}; eventChoiceViewModel`, {
    eventDetailHref: () => "/app/events/test",
    evidenceViewModels: () => [],
    productCopy: (value: string) => value,
    relationshipValueCopy: () => "",
  });
  for (const provider of ["manual", "mock-calendar", "external-feed", "event-core-postgres"]) {
    const result = project({ attendeeName: "", readinessScore: null, event: {
      id: "owned:test", evidence: [], sourceMetadata: { provider, providerRecordId: "event:other" },
      nextAction: "", recommendedPreparation: "",
    } });
    assert.equal(result.canonicalEventId, provider === "event-core-postgres" ? "event:other" : undefined);
  }
});

function publishedEvent(eventId: string): PublishedCanonicalEvent {
  return {
    archivedAt: null,
    cancelledAt: null,
    description: `Description for ${eventId}`,
    endsAt: "2026-09-16T15:00:00.000Z",
    eventId,
    eventVersion: 3,
    lifecycleState: "published",
    organizerActorId: "account:owner",
    phase: "upcoming",
    publicCode: null,
    sourcePayload: {
      evidenceIds: [`evidence:${eventId}`],
    },
    startsAt: "2026-09-16T14:00:00.000Z",
    timezone: "UTC",
    title: `Event ${eventId}`,
    venue: "Tokyo",
    workspaceId: "workspace:test",
  };
}

function registration(
  eventId: string,
  status: EventRegistration["status"],
  userId: string,
): EventRegistration {
  return {
    cancelledAt: status === "cancelled" ? now.toISOString() : null,
    eventId,
    id: `registration:${eventId}:${userId}`,
    participantProfile: {} as EventRegistration["participantProfile"],
    participantProfileId: `profile:${eventId}:${userId}`,
    reactivatedAt: null,
    registeredAt: now.toISOString(),
    sideEffects: {
      calendarUpdateExecuted: false,
      emailSent: false,
      globalProfileWriteExecuted: false,
      notificationDelivered: false,
      organizerMessageSent: false,
      refundRequested: false,
    },
    status,
    updatedAt: now.toISOString(),
    userId,
  };
}

test("participant journey reader shows only the current raw subject's active canonical membership", async () => {
  const eventIds = [
    "event:rsvped",
    "event:cancelled",
    "event:other-actor",
  ];
  const calls: Array<{ eventIds: readonly string[]; rawSubject: string }> = [];
  const reader = createCanonicalParticipantEventJourneyReader({
    eventCoreService: {
      async listPublishedEvents(observedNow) {
        assert.equal(observedNow?.toISOString(), now.toISOString());
        return eventIds.map(publishedEvent);
      },
    },
    now: () => now,
    operationsRepository: {
      async listCanonicalRegistrationsForUser(rawSubject, requestedEventIds) {
        calls.push({ eventIds: requestedEventIds, rawSubject });
        return [
          registration("event:rsvped", "rsvped", rawSubject),
          registration("event:cancelled", "cancelled", rawSubject),
          registration("event:other-actor", "rsvped", "subject:other"),
        ];
      },
    } as Pick<
      EventOperationsRepository,
      "listCanonicalRegistrationsForUser"
    >,
  });

  const result = await reader.listRegisteredPublishedEvents("  subject:qa  ");

  assert.deepEqual(result.map((event) => event.eventId), ["event:rsvped"]);
  assert.deepEqual(calls, [{ eventIds, rawSubject: "subject:qa" }]);
});

test("participant journey reader propagates canonical membership read failures", async () => {
  const failure = new Error("canonical membership unavailable");
  const reader = createCanonicalParticipantEventJourneyReader({
    eventCoreService: {
      async listPublishedEvents() {
        return [publishedEvent("event:failure")];
      },
    },
    operationsRepository: {
      async listCanonicalRegistrationsForUser() {
        throw failure;
      },
    },
  });

  await assert.rejects(
    reader.listRegisteredPublishedEvents("subject:qa"),
    failure,
  );
});

test("unconfigured participant journey reader remains an explicit empty result", async () => {
  assert.equal(
    createConfiguredCanonicalParticipantEventJourneyReader({ env: {} }),
    null,
  );
  assert.deepEqual(
    await readConfiguredCanonicalParticipantEventJourneys("subject:qa", {
      env: {},
    }),
    [],
  );
});

test("Home loader propagates participant journey failures instead of fabricating zero events", async () => {
  const previousMode = process.env.ORBIT_MODULE_MODE;
  const failure = new Error("canonical participant journey unavailable");
  process.env.ORBIT_MODULE_MODE = "mock";

  try {
    await assert.rejects(
      loadAppHomeRouteViewModel(
        undefined,
        {
          displayName: "QA",
          id: "account:qa",
          rawSubject: "subject:qa",
        },
        {
          async readCanonicalParticipantEventJourneys() {
            throw failure;
          },
        },
      ),
      failure,
    );
  } finally {
    if (previousMode === undefined) {
      delete process.env.ORBIT_MODULE_MODE;
    } else {
      process.env.ORBIT_MODULE_MODE = previousMode;
    }
  }
});

test("Home loader renders a canonical participant event alongside mock owner events", async () => {
  const previousMode = process.env.ORBIT_MODULE_MODE;
  process.env.ORBIT_MODULE_MODE = "mock";

  try {
    const result = await loadAppHomeRouteViewModel(
      undefined,
      {
        displayName: "QA",
        id: "account:qa",
        rawSubject: "subject:qa",
      },
      {
        async readCanonicalParticipantEventJourneys() {
          return [publishedEvent("event:participant")];
        },
      },
    );

    assert.equal(result.state, "success");
    if (result.state !== "success") return;
    assert.equal(
      result.home.events.some((event) => event.id === "event:participant"),
      true,
    );
  } finally {
    if (previousMode === undefined) {
      delete process.env.ORBIT_MODULE_MODE;
    } else {
      process.env.ORBIT_MODULE_MODE = previousMode;
    }
  }
});

function landingEvent(
  id: string,
  code = id,
  canonicalEventId?: string,
): OrbitLandingEventView {
  return {
    address: "Tokyo",
    agenda: [],
    brandColor: "#6359E9",
    cap: 20,
    code,
    ...(canonicalEventId ? { canonicalEventId } : {}),
    descriptionZh: id,
    detailLogoUrl: "",
    endsAt: "2026-09-16T15:00:00.000Z",
    feeLabel: "Free",
    host: "",
    id,
    industry: "Relationship",
    logoUrl: "",
    mapX: 38,
    mapY: 36,
    name: id,
    organizer: "",
    participantCount: 0,
    place: "Tokyo",
    startsAt: "2026-09-16T14:00:00.000Z",
    stats: { attendees: [], authed: true, count: 0, youRsvped: false },
    status: "upcoming",
    summaryZh: id,
    tags: [],
    theme: "relationship",
    venue: "Tokyo",
    youRsvped: false,
  };
}

test("home journey merge keeps owned events first and removes canonical aliases only after ownership wins", () => {
  const result = mergeHomeEventJourneys(
    [
      landingEvent("legacy:owned"),
      landingEvent("legacy:shared", "legacy:shared", "event:shared"),
    ],
    [
      landingEvent("event:shared", "event:shared", "event:shared"),
      landingEvent("event:participant"),
    ],
  );

  assert.deepEqual(
    result.map((event) => event.id),
    ["legacy:owned", "legacy:shared", "event:participant"],
  );
});

/* ── W0041：本人已报名活动「已发布 join → 校验本人全部报名行 → 筛 rsvped → 按 id 取活动」 ─────── */

test("W0041 narrow read: own statuses on published events, rsvped only, by-id events in catalogue order, deduplicated, never the whole catalogue", async () => {
  const calls: string[] = [];
  const reader = createCanonicalParticipantEventJourneyReader({
    eventCoreService: {
      async listPublishedEvents() {
        calls.push("whole-catalogue");
        return [];
      },
      async listPublishedEventsByIds(eventIds, observedNow) {
        calls.push(`by-ids:${eventIds.join(",")}`);
        assert.equal(observedNow?.toISOString(), now.toISOString());
        // repository order (starts_at desc nulls last, event_id) is kept; a repeated row appears once
        return [publishedEvent("event:b"), publishedEvent("event:a"), publishedEvent("event:a")];
      },
    },
    now: () => now,
    operationsRepository: {
      async listCanonicalRegistrationsForUser() {
        calls.push("full-registrations");
        return [];
      },
      async listPublishedCanonicalRegistrationStatusesForUser(rawSubject) {
        calls.push(`statuses:${rawSubject}`);
        // the same event twice (memory/fake only: PostgreSQL's primary key forbids it), a cancelled row,
        // and a blank id
        return [
          { eventId: "event:a", status: "rsvped" },
          { eventId: "event:a", status: "rsvped" },
          { eventId: " event:b ", status: "rsvped" },
          { eventId: "event:c", status: "cancelled" },
          { eventId: "  ", status: "rsvped" },
        ];
      },
    },
  });

  const result = await reader.listRegisteredPublishedEvents("  subject:qa  ");

  assert.deepEqual(result.map((event) => event.eventId), ["event:b", "event:a"]);
  assert.deepEqual(calls, ["statuses:subject:qa", "by-ids:event:a,event:b"]);
});

test("W0041 narrow read: no rsvped row means no event read; blank subject means no read at all; failures propagate", async () => {
  const calls: string[] = [];
  const failure = new Error("status read failed");
  const make = (statuses: () => Promise<readonly { eventId: string; status: string }[]>, byIds?: () => Promise<readonly PublishedCanonicalEvent[]>) =>
    createCanonicalParticipantEventJourneyReader({
      eventCoreService: {
        async listPublishedEvents() {
          calls.push("whole-catalogue");
          return [];
        },
        async listPublishedEventsByIds() {
          calls.push("by-ids");
          return byIds ? byIds() : [];
        },
      },
      operationsRepository: {
        async listCanonicalRegistrationsForUser() {
          calls.push("full-registrations");
          return [];
        },
        async listPublishedCanonicalRegistrationStatusesForUser() {
          calls.push("statuses");
          return statuses();
        },
      },
    });

  assert.deepEqual(await make(async () => [{ eventId: "event:a", status: "cancelled" }]).listRegisteredPublishedEvents("subject:qa"), []);
  assert.deepEqual(calls, ["statuses"]);
  calls.length = 0;
  assert.deepEqual(await make(async () => []).listRegisteredPublishedEvents("   "), []);
  assert.deepEqual(calls, []);
  await assert.rejects(make(async () => { throw failure; }).listRegisteredPublishedEvents("subject:qa"), failure);
  assert.deepEqual(calls, ["statuses"]);
  calls.length = 0;
  const eventFailure = new Error("event read failed");
  await assert.rejects(
    make(async () => [{ eventId: "event:a", status: "rsvped" }], async () => { throw eventFailure; }).listRegisteredPublishedEvents("subject:qa"),
    eventFailure,
  );
  assert.deepEqual(calls, ["statuses", "by-ids"]);
});

async function withJourneySchema(run: (pool: import("pg").Pool) => Promise<void>) {
  const databaseUrl = process.env.ORBIT_EVENT_DATABASE_URL;
  assert.ok(databaseUrl);
  const { Pool } = await import("pg");
  const { randomUUID } = await import("node:crypto");
  const schema = `w0041_journey_${randomUUID().replaceAll("-", "")}`;
  const admin = new Pool({ connectionString: databaseUrl, max: 1 });
  const pool = new Pool({ connectionString: databaseUrl, max: 4, options: `-c search_path=${schema}` });
  try {
    await admin.query(`create schema ${schema}`);
    await run(pool);
  } finally {
    await pool.end();
    try {
      await admin.query(`drop schema if exists ${schema} cascade`);
    } finally {
      await admin.end();
    }
  }
}

test("W0041 PG: the narrow reader equals the old reader on own data, rejects exactly where it rejects, and reads only own events", {
  skip: process.env.ORBIT_EVENT_DATABASE_URL ? false : "ORBIT_EVENT_DATABASE_URL is not configured",
}, async () => {
  const { createEventOperationsPostgresClient } = await import("../../features/events/event-operations/storage/postgres-client");
  const { runEventOperationsMigrations } = await import("../../features/events/event-operations/storage/migrations");
  const { createPostgresEventOperationsRepository } = await import("../../features/events/event-operations/storage/postgres-repository");
  const { createPostgresEventCoreRepository } = await import("../../features/events/core/storage/postgres-repository");
  const { createEventCoreService } = await import("../../features/events/core/service");
  const { legacyResponsesFromAnswers } = await import("../../features/events/registration/interview-response-contract");
  await withJourneySchema(async (pool) => {
    const workspaceId = "workspace:w0041-journey";
    const statements: string[] = [];
    let bytes = 0;
    const raw = createEventOperationsPostgresClient({ connectionString: process.env.ORBIT_EVENT_DATABASE_URL!, pool });
    await runEventOperationsMigrations(raw);
    const client = {
      ...raw,
      async query<TRow>(text: string, values?: readonly unknown[]) {
        const result = await raw.query<TRow>(text, values);
        statements.push(text);
        bytes += Buffer.byteLength(JSON.stringify(result.rows));
        return result;
      },
    } as typeof raw;
    const repository = createPostgresEventOperationsRepository({ client: raw, workspaceId });
    const measuredRepository = createPostgresEventOperationsRepository({ client, workspaceId });
    const coreService = createEventCoreService(createPostgresEventCoreRepository({ client, workspaceId }));
    const base = (await pool.query<{ now: Date }>("select statement_timestamp() as now")).rows[0]!.now.getTime();
    const at = (minutes: number) => new Date(base + minutes * 60_000).toISOString();
    const answers = { industry: "SaaS", lookingFor: "partners", valueOffered: "localisation" };
    let index = 0;
    const finish: Array<() => Promise<void>> = [];
    async function createEvent(eventId: string, lifecycle: "published" | "draft" | "cancelled") {
      const d = 60 * 24 * 7 + (index++) * 45;
      await repository.saveConfiguration({
        checkInOpensAt: at(d - 5), eventEndsAt: at(d + 180), eventId, eventStartsAt: at(d + 30), maxAttemptsPerTask: 3,
        organizerActorId: "organizer-1", profileEditDeadlineAt: at(d + 10), recommendationCount: 4, registrationCutoffAt: at(d + 20),
        resultsAvailableAt: at(d + 25), roundOneStartsAt: at(d + 45), roundTwoStartsAt: at(d + 90), shardSize: 6, tableSize: 6, updatedAt: at(0),
      });
      await repository.activateCanonicalRegistrations(eventId, []);
      // the same start for two events exercises the event_id tie-break
      const startsAt = eventId === "event:j-tie-b" ? at(60 * 24 * 7) : at(d + 30);
      await pool.query(
        "update event_ops_events set lifecycle_state_v2 = 'published', title = $3, timezone = 'Asia/Tokyo', venue = 'Tokyo', starts_at = $4, ends_at = $5 where workspace_id = $1 and event_id = $2",
        [workspaceId, eventId, `Title ${eventId}`, startsAt, at(d + 300)],
      );
      if (lifecycle !== "published") finish.push(async () => { await pool.query("update event_ops_events set lifecycle_state_v2 = $3 where workspace_id = $1 and event_id = $2", [workspaceId, eventId, lifecycle]); });
    }
    async function register(eventId: string, userId: string, status: "rsvped" | "cancelled" = "rsvped") {
      await repository.registerCanonicalParticipant({ answers, displayName: "Owner Example", eventId, interviewResponses: [...legacyResponsesFromAnswers(answers, at(-1))], userId });
      if (status === "cancelled") await repository.cancelCanonicalRegistration({ eventId, userId });
    }
    async function damage(eventId: string, actorId: string) {
      const connection = await pool.connect();
      try {
        await connection.query("begin");
        await connection.query("set local session_replication_role = replica");
        const result = await connection.query(
          `update event_ops_membership_versions set source_registration_id = ''
            where workspace_id = $1 and event_id = $2 and actor_id = $3
              and membership_version = (select membership_version from event_ops_membership_heads where workspace_id = $1 and event_id = $2 and actor_id = $3)`,
          [workspaceId, eventId, actorId],
        );
        assert.equal(result.rowCount, 1);
        await connection.query("commit");
      } catch (error) {
        await connection.query("rollback");
        throw error;
      } finally {
        connection.release();
      }
    }
    for (const eventId of ["event:j-1", "event:j-2", "event:j-3", "event:j-4", "event:j-tie-a", "event:j-tie-b", "event:j-other"]) await createEvent(eventId, "published");
    await pool.query("update event_ops_events set starts_at = (select starts_at from event_ops_events where event_id = 'event:j-tie-b') where event_id = 'event:j-tie-a'");
    for (const eventId of ["event:j-draft-1", "event:j-draft-2", "event:j-draft-3"]) await createEvent(eventId, "draft");
    await createEvent("event:j-cancelled", "cancelled");
    const U = "subject:w0041-u";
    await register("event:j-1", U); await register("event:j-3", U); await register("event:j-tie-a", U); await register("event:j-tie-b", U);
    await register("event:j-2", U, "cancelled");
    await register("event:j-draft-1", U);
    await register("event:j-cancelled", U);
    await register("event:j-other", "subject:w0041-other"); await register("event:j-1", "subject:w0041-other");
    const BAD_PUBLISHED_RSVPED = "subject:w0041-bad-pub-rsvped";
    const BAD_PUBLISHED_CANCELLED = "subject:w0041-bad-pub-cancelled";
    const BAD_DRAFT_RSVPED = "subject:w0041-bad-draft-rsvped";
    const BAD_DRAFT_CANCELLED = "subject:w0041-bad-draft-cancelled";
    await register("event:j-1", BAD_PUBLISHED_RSVPED); await register("event:j-2", BAD_PUBLISHED_RSVPED); await damage("event:j-2", BAD_PUBLISHED_RSVPED);
    await register("event:j-1", BAD_PUBLISHED_CANCELLED); await register("event:j-3", BAD_PUBLISHED_CANCELLED, "cancelled"); await damage("event:j-3", BAD_PUBLISHED_CANCELLED);
    await register("event:j-1", BAD_DRAFT_RSVPED); await register("event:j-draft-2", BAD_DRAFT_RSVPED); await damage("event:j-draft-2", BAD_DRAFT_RSVPED);
    await register("event:j-1", BAD_DRAFT_CANCELLED); await register("event:j-draft-3", BAD_DRAFT_CANCELLED, "cancelled"); await damage("event:j-draft-3", BAD_DRAFT_CANCELLED);
    for (const step of finish) await step();

    const fixedNow = new Date(base);
    const oldReader = createCanonicalParticipantEventJourneyReader({
      eventCoreService: { listPublishedEvents: (observed) => coreService.listPublishedEvents(observed) },
      now: () => fixedNow,
      operationsRepository: { listCanonicalRegistrationsForUser: (userId, eventIds) => measuredRepository.listCanonicalRegistrationsForUser(userId, eventIds) },
    });
    const newReader = createCanonicalParticipantEventJourneyReader({
      eventCoreService: coreService,
      now: () => fixedNow,
      operationsRepository: measuredRepository,
    });
    const settle = async (read: () => Promise<readonly PublishedCanonicalEvent[]>) => {
      statements.length = 0;
      bytes = 0;
      try {
        return { ok: true as const, value: await read(), statements: statements.length, bytes };
      } catch (error) {
        return { ok: false as const, code: (error as { code?: unknown }).code, message: (error as Error).message, statements: statements.length, bytes };
      }
    };
    const cases: Array<[string, boolean]> = [
      [U, true], ["subject:w0041-other", true], ["subject:w0041-nobody", true],
      [BAD_PUBLISHED_RSVPED, false], [BAD_PUBLISHED_CANCELLED, false], [BAD_DRAFT_RSVPED, true], [BAD_DRAFT_CANCELLED, true],
    ];
    for (const [subject, succeeds] of cases) {
      const before = await settle(() => oldReader.listRegisteredPublishedEvents(subject));
      const after = await settle(() => newReader.listRegisteredPublishedEvents(subject));
      assert.equal(before.ok, succeeds, `old verdict for ${subject}`);
      assert.equal(after.ok, before.ok, `same verdict for ${subject}`);
      if (before.ok && after.ok) assert.deepEqual(after.value, before.value, `same events for ${subject}`);
      if (!before.ok && !after.ok) {
        // Same error class and code (plain Error, no code). The text is the W0028 status projection's
        // generic verdict instead of the full read's field name — registered in the W0041 REPORT.
        assert.equal(after.code, before.code, `same error code for ${subject}`);
        assert.match(before.message, /^Canonical event registration row /u);
        assert.match(after.message, /^Canonical event registration row /u);
      }
      assert.ok(statements.every((text) => !/^\s*select[\s\S]*from event_ops_events\s+where workspace_id = \$1\s+and lifecycle_state_v2 is not null\s+order by/iu.test(text)), "no whole-catalogue read");
      if (after.ok) assert.equal(after.statements, after.value.length > 0 ? 2 : 1, `statements for ${subject}`);
    }
    const own = await newReader.listRegisteredPublishedEvents(U);
    assert.deepEqual(own.map((event) => event.eventId), ["event:j-3", "event:j-1", "event:j-tie-a", "event:j-tie-b"].sort((left, right) => {
      const startsAt = (id: string) => own.find((event) => event.eventId === id)!.startsAt;
      return startsAt(right).localeCompare(startsAt(left)) || left.localeCompare(right);
    }));
    assert.equal(own.length, 4, "rsvped on published only: no cancelled, draft or cancelled-lifecycle events");

    // W41-2 accepted difference: somebody else's damaged published event (no title) is no longer read.
    await pool.query(
      `insert into event_ops_events (workspace_id, event_id, organizer_actor_id, lifecycle_state, created_at, updated_at, lifecycle_state_v2, timezone, starts_at, ends_at)
       values ($1, 'event:j-foreign-broken', 'stranger', 'active', now(), now(), 'published', 'Asia/Tokyo', $2, $3)`,
      [workspaceId, at(60), at(120)],
    );
    const oldForeign = await settle(() => oldReader.listRegisteredPublishedEvents(U));
    const newForeign = await settle(() => newReader.listRegisteredPublishedEvents(U));
    assert.equal(oldForeign.ok, false, "the old whole-catalogue read fails on an unrelated damaged event");
    assert.equal(newForeign.ok, true, "the narrow read never reads it");
    if (newForeign.ok) assert.deepEqual(newForeign.value, own);
  });
});
