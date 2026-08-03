import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";

import { Pool } from "pg";

import type {
  EventOperationsAiProvider,
  EventOperationsConfiguration,
} from "../../features/events/event-operations/contract";
import { createEventOperationsEngine } from "../../features/events/event-operations/engine";
import { createEventOperationsPostgresClient } from "../../features/events/event-operations/storage/postgres-client";
import { readFrozenGenerationSnapshot } from "../../features/events/event-operations/storage/frozen-snapshot-repository";
import { createPostgresEventOperationsRepository } from "../../features/events/event-operations/storage/postgres-repository";
import { runEventOperationsMigrations } from "../../features/events/event-operations/storage/migrations";
import type { EventRegistration } from "../../features/events/registration/contract";

const databaseUrl = process.env.ORBIT_EVENT_DATABASE_URL;

function at(base: number, minutes: number): string {
  return new Date(base + minutes * 60_000).toISOString();
}

function registration(input: {
  actorId: string;
  cancelledAt?: string | null;
  eventId: string;
  profileUpdatedAt: string;
  reactivatedAt?: string | null;
  registeredAt: string;
  status?: "cancelled" | "rsvped";
  updatedAt?: string;
}): EventRegistration {
  const participantProfileId = `participant:${input.eventId}:${input.actorId}`;
  return {
    cancelledAt: input.cancelledAt ?? null,
    eventId: input.eventId,
    id: `registration:${input.eventId}:${input.actorId}`,
    participantProfile: {
      answers: {
        industry: `Industry ${input.actorId}`,
        valueOffered: `Offer ${input.actorId}`,
      },
      createdAt: input.registeredAt,
      displayName: `Person ${input.actorId}`,
      eventId: input.eventId,
      id: participantProfileId,
      updatedAt: input.profileUpdatedAt,
      userId: input.actorId,
    },
    participantProfileId,
    reactivatedAt: input.reactivatedAt ?? null,
    registeredAt: input.registeredAt,
    sideEffects: {
      calendarUpdateExecuted: false,
      emailSent: false,
      globalProfileWriteExecuted: false,
      notificationDelivered: false,
      organizerMessageSent: false,
      refundRequested: false,
    },
    status: input.status ?? "rsvped",
    updatedAt: input.updatedAt ?? input.profileUpdatedAt,
    userId: input.actorId,
  };
}

function configuration(
  eventId: string,
  base: number,
): EventOperationsConfiguration {
  return {
    checkInOpensAt: at(base, -60),
    eventEndsAt: at(base, 180),
    eventId,
    eventStartsAt: at(base, 30),
    maxAttemptsPerTask: 3,
    organizerActorId: "organizer-frozen-snapshot",
    profileEditDeadlineAt: at(base, -30),
    recommendationCount: 1,
    registrationCutoffAt: at(base, -10),
    resultsAvailableAt: at(base, -5),
    roundOneStartsAt: at(base, 45),
    roundTwoStartsAt: at(base, 90),
    shardSize: 2,
    tableSize: 2,
    updatedAt: at(base, 0),
  };
}

const unusedAiProvider: EventOperationsAiProvider = {
  async generateGroupingFeatures() {
    throw new Error("not used during generation initialization");
  },
  async generateRecommendations() {
    throw new Error("not used during generation initialization");
  },
  async generateTableContent() {
    throw new Error("not used during generation initialization");
  },
};

test("frozen snapshot cutoff uses the database boundary and allows equality", async () => {
  const config = configuration("event-boundary", Date.parse("2026-08-03T10:00:00.000Z"));
  const row = {
    check_in_opens_at: config.checkInOpensAt,
    configuration_version: "1",
    event_ends_at: config.eventEndsAt,
    event_id: config.eventId,
    event_starts_at: config.eventStartsAt,
    max_attempts_per_task: config.maxAttemptsPerTask,
    organizer_actor_id: config.organizerActorId,
    profile_edit_deadline_at: config.profileEditDeadlineAt,
    recommendation_count: config.recommendationCount,
    registration_cutoff_at: config.registrationCutoffAt,
    results_available_at: config.resultsAvailableAt,
    round_one_starts_at: config.roundOneStartsAt,
    round_two_starts_at: config.roundTwoStartsAt,
    shard_size: config.shardSize,
    table_size: config.tableSize,
    updated_at: config.updatedAt,
  };
  let beforeCalls = 0;
  await assert.rejects(
    readFrozenGenerationSnapshot({
      eventId: config.eventId,
      executor: {
        async query<TRow>() {
          beforeCalls += 1;
          return {
            rowCount: 1,
            rows: [{
              ...row,
              captured_at: config.registrationCutoffAt,
              cutoff_reached: false,
            }] as TRow[],
          };
        },
      },
      workspaceId: "workspace-boundary",
    }),
    /database registration cutoff must pass/i,
  );
  assert.equal(beforeCalls, 1);

  let exactCalls = 0;
  const exact = await readFrozenGenerationSnapshot({
    eventId: config.eventId,
    executor: {
      async query<TRow>() {
        exactCalls += 1;
        return exactCalls === 1
          ? {
              rowCount: 1,
              rows: [{
                ...row,
                captured_at: config.registrationCutoffAt,
                cutoff_reached: true,
              }] as TRow[],
            }
          : { rowCount: 0, rows: [] as TRow[] };
      },
    },
    workspaceId: "workspace-boundary",
  });
  assert.equal(exact.snapshot.capturedAt, config.registrationCutoffAt);
  assert.equal(exact.snapshot.participants.length, 0);
});

test(
  "frozen snapshots use lifecycle effective time, exclude late signups, and fail closed on unknowable profile history",
  { skip: databaseUrl ? false : "ORBIT_EVENT_DATABASE_URL is not configured" },
  async () => {
    assert.ok(databaseUrl);
    const schema = `event_ops_snapshot_${randomUUID().replaceAll("-", "")}`;
    const adminPool = new Pool({ connectionString: databaseUrl, max: 1 });
    const scopedPool = new Pool({
      connectionString: databaseUrl,
      max: 4,
      options: `-c search_path=${schema}`,
    });
    const client = createEventOperationsPostgresClient({
      connectionString: databaseUrl,
      pool: scopedPool,
    });
    const repository = createPostgresEventOperationsRepository({
      client,
      workspaceId: "workspace-frozen-snapshot",
    });

    try {
      await adminPool.query(`create schema ${schema}`);
      await runEventOperationsMigrations(client);
      const clock = await scopedPool.query<{ now: Date }>(
        "select statement_timestamp() as now",
      );
      const base = clock.rows[0]!.now.getTime();
      const eventId = "event-frozen-lifecycle";
      const configured = configuration(eventId, base);
      await repository.saveConfiguration(configured);
      await repository.activateCanonicalRegistrations(eventId, [
        registration({
          actorId: "active-before-cutoff",
          eventId,
          profileUpdatedAt: at(base, -40),
          registeredAt: at(base, -120),
        }),
        registration({
          actorId: "cancelled-after-cutoff",
          cancelledAt: at(base, -5),
          eventId,
          profileUpdatedAt: at(base, -40),
          registeredAt: at(base, -120),
          status: "cancelled",
          updatedAt: at(base, -5),
        }),
        registration({
          actorId: "cancelled-before-cutoff",
          cancelledAt: at(base, -20),
          eventId,
          profileUpdatedAt: at(base, -40),
          registeredAt: at(base, -120),
          status: "cancelled",
          updatedAt: at(base, -20),
        }),
        registration({
          actorId: "late-signup",
          eventId,
          profileUpdatedAt: at(base, -20),
          registeredAt: at(base, -20),
        }),
      ]);

      const captured = await repository.captureGenerationSnapshot(eventId);
      assert.deepEqual(
        captured.snapshot.participants.map((participant) => participant.actorId),
        ["active-before-cutoff", "cancelled-after-cutoff"],
      );
      assert.equal(
        captured.sourceVersions.find(
          (source) => source.actorId === "active-before-cutoff",
        )?.membershipVersion,
        2,
        "the imported profile update is a later active membership version",
      );
      assert.equal(
        captured.sourceVersions.find(
          (source) => source.actorId === "cancelled-after-cutoff",
        )?.membershipVersion,
        1,
        "the post-cutoff cancellation must not rewrite cutoff membership",
      );

      const engine = createEventOperationsEngine({
        aiProvider: unusedAiProvider,
        repository,
        token: () => "unused-token",
      });
      const generation = await engine.createGeneration({
        actorId: configured.organizerActorId,
        capturedSnapshot: captured,
        idempotencyKey: "frozen-lifecycle-success",
      });
      const persisted = await scopedPool.query<{
        actor_id: string;
        membership_version: string;
      }>(`
        select actor_id, membership_version::text
        from event_ops_generation_participants
        where generation_id = '${generation.generationId}'
        order by actor_id
      `);
      assert.deepEqual(persisted.rows, [
        { actor_id: "active-before-cutoff", membership_version: "2" },
        { actor_id: "cancelled-after-cutoff", membership_version: "1" },
      ]);

      const unknownHistoryEventId = "event-unknown-profile-history";
      await repository.saveConfiguration(
        configuration(unknownHistoryEventId, base),
      );
      await repository.activateCanonicalRegistrations(unknownHistoryEventId, [
        registration({
          actorId: "profile-edited-after-cutoff",
          eventId: unknownHistoryEventId,
          profileUpdatedAt: at(base, -5),
          registeredAt: at(base, -120),
          updatedAt: at(base, -5),
        }),
      ]);
      await assert.rejects(
        repository.captureGenerationSnapshot(unknownHistoryEventId),
        /no eligible frozen profile version/i,
      );

      await repository.saveConfiguration({
        ...configured,
        recommendationCount: 2,
        shardSize: 1,
        updatedAt: at(base, 1),
      });
      await assert.rejects(
        engine.createGeneration({
          actorId: configured.organizerActorId,
          capturedSnapshot: captured,
          idempotencyKey: "stale-configuration-snapshot",
        }),
        /configuration changed/i,
      );
      const recaptured = await repository.captureGenerationSnapshot(eventId);
      assert.equal(recaptured.configuration.recommendationCount, 2);
      assert.equal(recaptured.configuration.shardSize, 1);
      const recapturedGeneration = await engine.createGeneration({
        actorId: configured.organizerActorId,
        capturedSnapshot: recaptured,
        idempotencyKey: "recaptured-current-configuration",
      });
      assert.equal(recapturedGeneration.expectedTaskCount, 7);
    } finally {
      await client.close();
      await adminPool.query(`drop schema if exists ${schema} cascade`);
      await adminPool.end();
    }
  },
);
