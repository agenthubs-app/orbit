import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import test from "node:test";

import { Pool } from "pg";

import {
  applyEventCoreBackfillPlan,
  buildEventCoreBackfillPlan,
} from "../../features/events/core/backfill";
import { readEventCoreBackfillCandidates } from "../../features/events/core/backfill-sources";
import { EventCoreDataError } from "../../features/events/core/contract";
import { EVENT_CANONICAL_V1_MANIFEST } from "../../features/events/core/migration/manifests/event-canonical-v1";
import {
  createCanonicalPublicEventCatalogue,
  publishedCanonicalEventToEventDTO,
  publishedCanonicalEventToEventRecord,
} from "../../features/events/core/public-catalogue";
import { createEventCoreService } from "../../features/events/core/service";
import { createPostgresEventCoreRepository } from "../../features/events/core/storage/postgres-repository";
import { createEventOperationsPostgresClient } from "../../features/events/event-operations/storage/postgres-client";
import { eventCodeFor } from "../../features/events/public-route-code";
import { readPublicEventCatalogue } from "../../features/events/public-catalogue";
import { runOrbitRecordsMigration } from "../../shared/storage/migrations";

const databaseUrl = process.env.ORBIT_EVENT_DATABASE_URL;
const privateEvents = [
  {
    description: "A closed working session for bilingual climate-finance operators.",
    endsAt: "2026-10-03T12:15:00+09:00",
    id: "event:orbit-only:climate-finance",
    location: "横滨",
    name: "气候金融双语工作坊",
    startsAt: "2026-10-03T09:30:00+09:00",
  },
  {
    description: "An internal roundtable for healthcare procurement and clinical AI leads.",
    endsAt: "2026-10-18T18:00:00+09:00",
    id: "event:orbit-only:clinical-ai",
    location: "名古屋",
    name: "医疗 AI 采购圆桌",
    startsAt: "2026-10-18T15:00:00+09:00",
  },
  {
    description: "A private founder dinner focused on cross-border hiring operations.",
    endsAt: "2026-11-06T21:30:00+09:00",
    id: "event:orbit-only:founder-dinner",
    location: "神户",
    name: "跨境招聘创始人晚餐",
    startsAt: "2026-11-06T18:30:00+09:00",
  },
  {
    description: "A confidential peer clinic for seed-stage hardware supply chains.",
    endsAt: "2026-11-21T16:30:00+09:00",
    id: "event:orbit-only:hardware-clinic",
    location: "京都",
    name: "硬件供应链同侪诊所",
    startsAt: "2026-11-21T13:00:00+09:00",
  },
  {
    description: "An invite-only salon for independent creators entering Japan.",
    endsAt: "2026-12-05T20:00:00+09:00",
    id: "event:orbit-only:creator-salon",
    location: "福冈",
    name: "独立创作者日本市场沙龙",
    startsAt: "2026-12-05T17:00:00+09:00",
  },
  {
    description: "A small operator lab on multilingual customer-support systems.",
    endsAt: "2026-12-12T12:00:00+09:00",
    id: "event:orbit-only:support-lab",
    location: "札幌",
    name: "多语言客户支持运营实验室",
    startsAt: "2026-12-12T09:00:00+09:00",
  },
] as const;

async function insertOrbitEvent(
  pool: Pool,
  workspaceId: string,
  event: {
    description?: string;
    endsAt: string;
    id: string;
    location: string;
    name: string;
    startsAt: string;
  },
): Promise<void> {
  await pool.query(
    `insert into orbit_records (
       workspace_id, collection_name, record_id, user_id, source_type,
       source_id, evidence_ids, lifecycle_state, search_text, payload,
       created_at, updated_at
     ) values (
       $1, 'events', $2, 'account:public-owner', 'event_import', $3,
       $4::text[], 'active', $5, $6::jsonb, now(), now()
     )`,
    [
      workspaceId,
      event.id,
      `source:orbit-only:${event.id}`,
      [`evidence:orbit-only:${event.id}`],
      `${event.name} ${event.location} ${event.description ?? ""}`,
      JSON.stringify({
        description: event.description,
        endsAt: event.endsAt,
        location: event.location,
        name: event.name,
        startsAt: event.startsAt,
      }),
    ],
  );
}

test(
  "post-backfill canonical public catalogue matches the approved oracle and hides orbit-only events",
  {
    skip: databaseUrl ? false : "ORBIT_EVENT_DATABASE_URL is not configured",
    timeout: 90_000,
  },
  async () => {
    assert.ok(databaseUrl);
    const suffix = randomUUID().replaceAll("-", "");
    const schema = `event_core_public_${suffix}`;
    const workspaceId = `workspace:public-catalogue:${suffix}`;
    const adminPool = new Pool({ connectionString: databaseUrl, max: 1 });
    const operationPool = new Pool({
      connectionString: databaseUrl,
      max: 2,
      options: `-c search_path=${schema}`,
    });
    const client = createEventOperationsPostgresClient({
      connectionString: databaseUrl,
      max: 2,
      pool: operationPool,
    });

    try {
      await adminPool.query(`create schema ${schema}`);
      await runOrbitRecordsMigration(operationPool);
      await insertOrbitEvent(operationPool, workspaceId, {
        endsAt: "2026-09-01T14:00:00+09:00",
        id: "event_signup_02",
        location: "东京",
        name: "东京 AI 落地伙伴报名会",
        startsAt: "2026-09-01T14:00:00+09:00",
      });
      await insertOrbitEvent(operationPool, workspaceId, {
        endsAt: "2026-09-15T18:00:00+09:00",
        id: "event_signup_03",
        location: "东京",
        name: "日中投资人与创业者报名沙龙",
        startsAt: "2026-09-15T18:00:00+09:00",
      });
      for (const event of privateEvents) {
        await insertOrbitEvent(operationPool, workspaceId, event);
      }

      const candidates = await readEventCoreBackfillCandidates({
        client,
        defaultTimezone: "Asia/Tokyo",
        publicOwnerActorId: "account:public-owner",
        workspaceId,
      });
      const plan = buildEventCoreBackfillPlan(
        candidates,
        EVENT_CANONICAL_V1_MANIFEST,
      );
      assert.equal(plan.count, 19);
      assert.equal(plan.events.filter((event) => event.publicCode).length, 13);
      await applyEventCoreBackfillPlan({
        client,
        now: "2026-08-04T00:00:00.000Z",
        plan,
        workspaceId,
      });

      const service = createEventCoreService(
        createPostgresEventCoreRepository({ client, workspaceId }),
      );
      const now = new Date("2026-08-04T00:00:00.000Z");
      const catalogue = createCanonicalPublicEventCatalogue({
        eventCoreService: service,
        now,
        async readParticipantSummaries(eventIds) {
          assert.equal(new Set(eventIds).size, 13);
          return eventIds.map((eventId) => ({
            activeRegistrationCount: eventId === "event_signup_01" ? 64 : 0,
            attendeeResultsAvailable: false,
            eventId,
            hasPublishedResults: false,
          }));
        },
      });
      const snapshot = await catalogue.read();
      const oracle = readPublicEventCatalogue();

      assert.equal(snapshot.events.length, 13);
      assert.equal(Object.keys(snapshot.publicCodes).length, 13);
      assert.deepEqual(
        new Set(snapshot.events.map((event) => event.id)),
        new Set(oracle.events.map((event) => event.id)),
      );
      assert.equal(snapshot.participantCounts.event_signup_01, 64);
      assert.equal(snapshot.participantCounts.event_signup_02, 0);
      assert.equal(snapshot.participantCounts.event_signup_03, 0);
      for (const eventId of privateEvents.map((event) => event.id)) {
        assert.equal(snapshot.events.some((event) => event.id === eventId), false);
        assert.equal(snapshot.publicCodes[eventId], undefined);
        assert.equal(await catalogue.readRecord(eventId), null);
      }

      for (const [index, expected] of oracle.events.entries()) {
        const actual = snapshot.events.find((event) => event.id === expected.id);
        assert.ok(actual, expected.id);
        assert.equal(actual.name, expected.name);
        assert.equal(actual.location, expected.location);
        assert.equal(actual.description, expected.description);
        for (const evidenceId of expected.evidenceIds) {
          assert.equal(actual.evidenceIds.includes(evidenceId), true);
        }
        assert.equal(Date.parse(actual.startsAt), Date.parse(expected.startsAt));
        assert.equal(Date.parse(actual.endsAt ?? ""), Date.parse(expected.endsAt ?? ""));
        assert.equal(actual.source.id.startsWith("event-core-postgres:"), true);
        assert.equal(actual.source.label, "event-core-postgres");

        const planned = plan.events.find((event) => event.eventId === expected.id);
        assert.equal(planned?.eventId, expected.id);
        assert.equal(planned?.publicCode, eventCodeFor(expected, index));
        assert.equal(snapshot.publicCodes[expected.id], planned?.publicCode);
        assert.equal(planned?.title, expected.name);
        assert.equal(planned?.venue, expected.location);
        assert.equal(Date.parse(planned?.startsAt ?? ""), Date.parse(expected.startsAt));
        assert.equal(Date.parse(planned?.endsAt ?? ""), Date.parse(expected.endsAt ?? ""));
        assert.equal(planned?.description, expected.description ?? "");

        const byId = await catalogue.readRecord(expected.id);
        const byCode = await catalogue.readRecord(planned?.publicCode ?? "");
        assert.deepEqual(byCode, byId);
        assert.equal(byId?.id, expected.id);
        assert.equal(byId?.calendarSyncRequested, false);
        assert.equal(byId?.calendarProviderRequested, false);
        assert.equal(byId?.organizerFeedRequested, false);
        assert.equal(byId?.liveDatabaseWriteExecuted, false);
        assert.equal(byId?.externalNetworkRequested, false);
        assert.equal(byId?.aiProviderRequested, false);
        assert.equal(byId?.emailProviderRequested, false);
        assert.equal(byId?.notificationDelivered, false);
        assert.equal(
          byId?.status,
          Date.parse(expected.endsAt ?? expected.startsAt) <= now.getTime()
            ? "cancelled"
            : "imported",
        );
      }
      assert.equal(
        snapshot.events
          .find((event) => event.id === "event_signup_02")
          ?.evidenceIds.includes("evidence:orbit-only:event_signup_02"),
        true,
      );
      assert.equal(await catalogue.readRecord("   "), null);
    } finally {
      await client.close();
      await adminPool.query(`drop schema if exists ${schema} cascade`);
      await adminPool.end();
    }
  },
);

test("canonical public adapter has no production legacy catalogue dependency", () => {
  const source = readFileSync(
    new URL("../../features/events/core/public-catalogue.ts", import.meta.url),
    "utf8",
  );
  assert.doesNotMatch(source, /from ["'][^"']*public-catalogue["']/);
  assert.doesNotMatch(source, /eventCodeFor/);
});

test("canonical EventRecord conversion supports a private published event without fabricating a public code", () => {
  const canonicalEvent = {
    archivedAt: null,
    cancelledAt: null,
    description: "A private operator working session.",
    endsAt: "2030-01-01T12:00:00.000Z",
    eventId: "event:private:operator-session",
    eventVersion: 1,
    lifecycleState: "published",
    organizerActorId: "actor:organizer",
    phase: "upcoming",
    publicCode: null,
    sourcePayload: { evidenceIds: ["evidence:private:operator-session"] },
    startsAt: "2030-01-01T10:00:00.000Z",
    timezone: "Asia/Tokyo",
    title: "Private operator session",
    venue: "Tokyo",
    workspaceId: "workspace:test",
  } as const;
  const record = publishedCanonicalEventToEventRecord(
    canonicalEvent,
    "2029-12-01T00:00:00.000Z",
  );
  const event = publishedCanonicalEventToEventDTO(canonicalEvent);

  assert.equal(record.id, "event:private:operator-session");
  assert.equal(record.title, "Private operator session");
  assert.equal(record.sourceMetadata.provider, "event-core-postgres");
  assert.equal(event.id, "event:private:operator-session");
  assert.equal(event.name, "Private operator session");
});

test("canonical public adapter fails closed for duplicate codes and invalid source payload", async () => {
  const base = {
    archivedAt: null,
    cancelledAt: null,
    description: "Canonical description",
    endsAt: "2030-01-01T12:00:00.000Z",
    eventId: "event:canonical:a",
    eventVersion: 2,
    lifecycleState: "published" as const,
    organizerActorId: "actor:organizer",
    phase: "upcoming" as const,
    publicCode: "PUBLIC-A",
    sourcePayload: { evidenceIds: ["evidence:canonical:a"] },
    startsAt: "2030-01-01T10:00:00.000Z",
    timezone: "Asia/Tokyo",
    title: "Canonical event A",
    venue: "Tokyo",
    workspaceId: "workspace:test",
  };
  const events = [base, { ...base, eventId: "event:canonical:b" }];
  const adapter = createCanonicalPublicEventCatalogue({
    eventCoreService: {
      async getEvent() { return null; },
      async getPublishedEvent() { return null; },
      async listEvents() { return []; },
      async listPublishedEvents() { return events; },
    },
    now: new Date("2029-12-01T00:00:00.000Z"),
    async readParticipantSummaries() { return []; },
  });
  await assert.rejects(
    adapter.read(),
    (error: unknown) =>
      error instanceof EventCoreDataError &&
      error.code === "EVENT_CORE_INVALID_PUBLISHED_EVENT",
  );

  events.splice(1);
  events[0] = { ...base, sourcePayload: null as never };
  await assert.rejects(
    adapter.read(),
    (error: unknown) =>
      error instanceof EventCoreDataError &&
      error.code === "EVENT_CORE_INVALID_PUBLISHED_EVENT",
  );
});

test("canonical public adapter never turns a missing participant summary into zero", async () => {
  const event = {
    archivedAt: null,
    cancelledAt: null,
    description: "Canonical description",
    endsAt: "2030-01-01T12:00:00.000Z",
    eventId: "event:canonical:missing-summary",
    eventVersion: 1,
    lifecycleState: "published" as const,
    organizerActorId: "actor:organizer",
    phase: "upcoming" as const,
    publicCode: "MISSING-SUMMARY",
    sourcePayload: { evidenceIds: ["evidence:canonical:missing-summary"] },
    startsAt: "2030-01-01T10:00:00.000Z",
    timezone: "Asia/Tokyo",
    title: "Canonical event with missing summary",
    venue: "Tokyo",
    workspaceId: "workspace:test",
  };
  const adapter = createCanonicalPublicEventCatalogue({
    eventCoreService: {
      async getEvent() { return null; },
      async getPublishedEvent() { return event; },
      async listEvents() { return [event]; },
      async listPublishedEvents() { return [event]; },
    },
    now: new Date("2029-12-01T00:00:00.000Z"),
    async readParticipantSummaries() { return []; },
  });

  await assert.rejects(
    adapter.read(),
    (error: unknown) =>
      error instanceof EventCoreDataError &&
      error.code === "EVENT_CORE_INVALID_PUBLISHED_EVENT" &&
      error.message.includes("missing participant summary"),
  );
});
