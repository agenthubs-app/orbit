import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";

import { Pool } from "pg";

import { createPostgresEventOperationsRepository } from "../../features/events/event-operations/storage/postgres-repository";
import { createEventOperationsPostgresClient } from "../../features/events/event-operations/storage/postgres-client";
import { runEventOperationsMigrations } from "../../features/events/event-operations/storage/migrations";
import { EventRegistrationWindowError } from "../../features/events/registration/deadline-gated-service";
import { createDeadlineGatedEventRegistrationService } from "../../features/events/registration/deadline-gated-service";
import {
  createEventRegistrationService,
  createMemoryEventRegistrationProvider,
} from "../../features/events/registration/service";
import { createEventOperationsRegistrationWindowProvider } from "../../features/events/registration/storage/event-operations-window-provider";
import { legacyResponsesFromAnswers } from "../../features/events/registration/interview-response-contract";

const databaseUrl = process.env.ORBIT_EVENT_DATABASE_URL;

function at(base: number, minutes: number): string {
  return new Date(base + minutes * 60_000).toISOString();
}

test(
  "canonical registration commits version heads, audit, and outbox atomically under database-clock gates",
  { skip: databaseUrl ? false : "ORBIT_EVENT_DATABASE_URL is not configured" },
  async () => {
    assert.ok(databaseUrl);
    const schema = `event_ops_registration_${randomUUID().replaceAll("-", "")}`;
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
      workspaceId: "workspace-registration-test",
    });

    try {
      await adminPool.query(`create schema ${schema}`);
      await runEventOperationsMigrations(client);
      const dbClock = await scopedPool.query<{ now: Date }>(
        "select statement_timestamp() as now",
      );
      const base = dbClock.rows[0]!.now.getTime();
      await repository.saveConfiguration({
        checkInOpensAt: at(base, -5),
        eventEndsAt: at(base, 180),
        eventId: "event-canonical-registration",
        eventStartsAt: at(base, 30),
        maxAttemptsPerTask: 3,
        organizerActorId: "organizer-1",
        profileEditDeadlineAt: at(base, 10),
        recommendationCount: 4,
        registrationCutoffAt: at(base, 20),
        resultsAvailableAt: at(base, 25),
        roundOneStartsAt: at(base, 45),
        roundTwoStartsAt: at(base, 90),
        shardSize: 6,
        tableSize: 6,
        updatedAt: at(base, 0),
      });
      await repository.activateCanonicalRegistrations(
        "event-canonical-registration",
        [],
      );

      const firstAnswers = { industry: "Climate", valueOffered: "Grid operations" };
      const first = await repository.registerCanonicalParticipant({
        answers: firstAnswers,
        displayName: "Ari",
        eventId: "event-canonical-registration",
        interviewResponses: legacyResponsesFromAnswers(firstAnswers, at(base, -1)),
        userId: "actor-ari",
      });
      const duplicate = await repository.registerCanonicalParticipant({
        answers: firstAnswers,
        displayName: "Ari",
        eventId: "event-canonical-registration",
        interviewResponses: legacyResponsesFromAnswers(firstAnswers, at(base, -1)),
        userId: "actor-ari",
      });
      assert.deepEqual(duplicate, first);

      const editedAnswers = { industry: "Climate", valueOffered: "Market design" };
      const edited = await repository.registerCanonicalParticipant({
        answers: editedAnswers,
        displayName: "Ari",
        eventId: "event-canonical-registration",
        interviewResponses: legacyResponsesFromAnswers(editedAnswers, at(base, 1)),
        userId: "actor-ari",
      });
      assert.equal(edited.participantProfile.answers.valueOffered, "Market design");
      const cancelled = await repository.cancelCanonicalRegistration({
        eventId: "event-canonical-registration",
        userId: "actor-ari",
      });
      assert.equal(cancelled?.status, "cancelled");

      const counts = await scopedPool.query<{
        audit_count: string;
        membership_count: string;
        outbox_count: string;
        profile_count: string;
        response_count: string;
      }>(`
        select
          (select count(*) from event_ops_profile_versions)::text as profile_count,
          (select count(*) from event_ops_profile_response_versions)::text as response_count,
          (select count(*) from event_ops_membership_versions)::text as membership_count,
          (select count(*) from event_ops_outbox)::text as outbox_count,
          (select count(*) from event_ops_audit_log)::text as audit_count
      `);
      assert.deepEqual(counts.rows[0], {
        audit_count: "4",
        membership_count: "3",
        outbox_count: "3",
        profile_count: "2",
        response_count: "4",
      });

      await scopedPool.query(`
        create function reject_registration_outbox() returns trigger
        language plpgsql as $$
        begin
          if new.aggregate_id like '%actor-rollback%' then
            raise exception 'deliberate outbox failure';
          end if;
          return new;
        end
        $$;
        create trigger reject_registration_outbox_trigger
          before insert on event_ops_outbox
          for each row execute function reject_registration_outbox();
      `);
      await assert.rejects(
        repository.registerCanonicalParticipant({
          eventId: "event-canonical-registration",
          userId: "actor-rollback",
        }),
        /deliberate outbox failure/i,
      );
      const rolledBack = await scopedPool.query<{ count: string }>(`
        select count(*)::text as count
        from event_ops_membership_heads
        where actor_id = 'actor-rollback'
      `);
      assert.equal(rolledBack.rows[0]?.count, "0");

      await repository.saveConfiguration({
        checkInOpensAt: at(base, -60),
        eventEndsAt: at(base, 180),
        eventId: "event-closed-registration",
        eventStartsAt: at(base, 30),
        maxAttemptsPerTask: 3,
        organizerActorId: "organizer-1",
        profileEditDeadlineAt: at(base, -20),
        recommendationCount: 4,
        registrationCutoffAt: at(base, -10),
        resultsAvailableAt: at(base, 0),
        roundOneStartsAt: at(base, 45),
        roundTwoStartsAt: at(base, 90),
        shardSize: 6,
        tableSize: 6,
        updatedAt: at(base, 0),
      });
      await repository.activateCanonicalRegistrations(
        "event-closed-registration",
        [],
      );
      await assert.rejects(
        repository.registerCanonicalParticipant({
          eventId: "event-closed-registration",
          userId: "actor-late",
        }),
        (error: unknown) =>
          error instanceof EventRegistrationWindowError &&
          error.code === "EVENT_REGISTRATION_CUTOFF_PASSED",
      );

      const legacyProvider = createMemoryEventRegistrationProvider();
      const legacyService = createEventRegistrationService({
        now: () => at(base, -120),
        provider: legacyProvider,
      });
      const legacyRegistration = await legacyService.register({
        answers: { industry: "Robotics" },
        displayName: "Legacy Mina",
        eventId: "event-shadow-import",
        userId: "actor-legacy-mina",
      });
      await repository.saveConfiguration({
        checkInOpensAt: at(base, -5),
        eventEndsAt: at(base, 180),
        eventId: "event-shadow-import",
        eventStartsAt: at(base, 30),
        maxAttemptsPerTask: 3,
        organizerActorId: "organizer-1",
        profileEditDeadlineAt: at(base, 10),
        recommendationCount: 4,
        registrationCutoffAt: at(base, 20),
        resultsAvailableAt: at(base, 25),
        roundOneStartsAt: at(base, 45),
        roundTwoStartsAt: at(base, 90),
        shardSize: 6,
        tableSize: 6,
        updatedAt: at(base, 0),
      });
      const canonicalService = {
        cancel: repository.cancelCanonicalRegistration.bind(repository),
        get: ({ eventId, userId }: { eventId: string; userId: string }) =>
          repository.getCanonicalRegistration(eventId, userId),
        list: ({ eventId }: { eventId: string }) =>
          repository.listCanonicalRegistrations(eventId),
        register: repository.registerCanonicalParticipant.bind(repository),
      };
      const switchingService = createDeadlineGatedEventRegistrationService({
        baseService: legacyService,
        canonicalService,
        projectionProvider: legacyProvider,
        windowProvider: createEventOperationsRegistrationWindowProvider({
          client,
          workspaceId: "workspace-registration-test",
        }),
      });
      assert.deepEqual(
        await switchingService.list({ eventId: "event-shadow-import" }),
        [legacyRegistration],
        "the importing state must keep the legacy read model visible",
      );
      await assert.rejects(
        switchingService.register({
          eventId: "event-shadow-import",
          userId: "actor-during-import",
        }),
        (error: unknown) =>
          error instanceof EventRegistrationWindowError &&
          error.code === "EVENT_REGISTRATION_CONFIGURATION_REQUIRED",
      );
      const activation = await repository.activateCanonicalRegistrations(
        "event-shadow-import",
        [legacyRegistration],
      );
      const activationReplay = await repository.activateCanonicalRegistrations(
        "event-shadow-import",
        [legacyRegistration],
      );
      assert.deepEqual(activationReplay, activation);
      const canonicalRows = await switchingService.list({
        eventId: "event-shadow-import",
      });
      assert.deepEqual(canonicalRows, [legacyRegistration]);
    } finally {
      await client.close();
      await adminPool.query(`drop schema if exists ${schema} cascade`);
      await adminPool.end();
    }
  },
);
