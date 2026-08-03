import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";

import { Pool } from "pg";

import type { EventOperationsConfiguration } from "../../features/events/event-operations/contract";
import { runEventOperationsMigrations } from "../../features/events/event-operations/storage/migrations";
import { createEventOperationsPostgresClient } from "../../features/events/event-operations/storage/postgres-client";
import { createPostgresEventOperationsRepository } from "../../features/events/event-operations/storage/postgres-repository";
import type { EventRegistration } from "../../features/events/registration/contract";

const databaseUrl = process.env.ORBIT_EVENT_DATABASE_URL;

function at(base: number, minutes: number): string {
  return new Date(base + minutes * 60_000).toISOString();
}

function registration(
  eventId: string,
  actorId: string,
  registeredAt: string,
): EventRegistration {
  const participantProfileId = `participant:${eventId}:${actorId}`;
  return {
    cancelledAt: null,
    eventId,
    id: `registration:${eventId}:${actorId}`,
    participantProfile: {
      answers: {
        desiredOutcome: `Meet collaborators for ${actorId}`,
        industry: `Industry ${actorId}`,
        valueOffered: `Offer ${actorId}`,
      },
      createdAt: registeredAt,
      displayName: `Person ${actorId}`,
      eventId,
      id: participantProfileId,
      updatedAt: registeredAt,
      userId: actorId,
    },
    participantProfileId,
    reactivatedAt: null,
    registeredAt,
    sideEffects: {
      calendarUpdateExecuted: false,
      emailSent: false,
      globalProfileWriteExecuted: false,
      notificationDelivered: false,
      organizerMessageSent: false,
      refundRequested: false,
    },
    status: "rsvped",
    updatedAt: registeredAt,
    userId: actorId,
  };
}

function configuration(
  eventId: string,
  base: number,
): EventOperationsConfiguration {
  return {
    checkInOpensAt: at(base, -5),
    eventEndsAt: at(base, 180),
    eventId,
    eventStartsAt: at(base, 30),
    maxAttemptsPerTask: 3,
    organizerActorId: "actor:onsite-organizer",
    profileEditDeadlineAt: at(base, 10),
    recommendationCount: 3,
    registrationCutoffAt: at(base, 20),
    resultsAvailableAt: at(base, 25),
    roundOneStartsAt: at(base, 45),
    roundTwoStartsAt: at(base, 90),
    shardSize: 4,
    tableSize: 4,
    updatedAt: at(base, 0),
  };
}

test(
  "onsite writes are database-clock idempotent, CAS-terminal, owner-safe, and fully atomic",
  {
    skip: databaseUrl ? false : "ORBIT_EVENT_DATABASE_URL is not configured",
    timeout: 120_000,
  },
  async () => {
    assert.ok(databaseUrl);
    const schema = `event_ops_onsite_${randomUUID().replaceAll("-", "")}`;
    const adminPool = new Pool({ connectionString: databaseUrl, max: 1 });
    const scopedPool = new Pool({
      connectionString: databaseUrl,
      max: 32,
      options: `-c search_path=${schema}`,
    });
    const client = createEventOperationsPostgresClient({
      connectionString: databaseUrl,
      pool: scopedPool,
    });
    const workspaceId = "workspace-onsite-concurrency";
    const repository = createPostgresEventOperationsRepository({
      client,
      workspaceId,
    });

    try {
      await adminPool.query(`create schema ${schema}`);
      await runEventOperationsMigrations(client);
      const clock = await scopedPool.query<{ now: Date }>(
        "select statement_timestamp() as now",
      );
      const base = clock.rows[0]!.now.getTime();
      const eventId = "event-onsite-concurrency";
      const people = ["actor:a", "actor:b", "actor:c", "actor:d"].map(
        (actorId) => registration(eventId, actorId, at(base, -60)),
      );
      await repository.saveConfiguration(configuration(eventId, base));
      await repository.activateCanonicalRegistrations(eventId, people);

      const checkIns = await Promise.all(
        Array.from({ length: 100 }, () =>
          repository.checkInAtomically({ actorId: "actor:a", eventId }),
        ),
      );
      assert.equal(
        new Set(checkIns.map((value) => value.checkedInAt)).size,
        1,
        "every concurrent replay must return the first database timestamp",
      );
      assert.equal(
        new Set(checkIns.map((value) => value.evidenceId)).size,
        1,
      );
      const checkInCounts = await scopedPool.query<{
        audit_count: string;
        checkin_count: string;
        outbox_count: string;
      }>(`
        select
          (select count(*) from event_ops_checkins
            where event_id = '${eventId}' and actor_id = 'actor:a')::text
            as checkin_count,
          (select count(*) from event_ops_audit_log
            where event_id = '${eventId}' and action = 'event_checkin_created'
              and actor_id = 'actor:a')::text as audit_count,
          (select count(*) from event_ops_outbox
            where event_id = '${eventId}' and event_type = 'event.checkin.created'
              and aggregate_id = '${eventId}:actor:a')::text as outbox_count
      `);
      assert.deepEqual(checkInCounts.rows[0], {
        audit_count: "1",
        checkin_count: "1",
        outbox_count: "1",
      });

      const participantB = people[1]!.participantProfileId;
      const participantC = people[2]!.participantProfileId;
      const manualCheckIns = await Promise.all(
        Array.from({ length: 100 }, (_, index) =>
          repository.checkInAtomically({
            actorId: "actor:onsite-organizer",
            eventId,
            participantId: index % 2 === 0 ? participantB : participantC,
          }),
        ),
      );
      assert.equal(
        new Set(
          manualCheckIns
            .filter((value) => value.participantId === participantB)
            .map((value) => value.checkedInAt),
        ).size,
        1,
      );
      assert.equal(
        new Set(
          manualCheckIns
            .filter((value) => value.participantId === participantC)
            .map((value) => value.checkedInAt),
        ).size,
        1,
      );
      assert.equal(
        (
          await repository.checkInAtomically({
            actorId: "actor:b",
            eventId,
          })
        ).checkedInAt,
        manualCheckIns.find((value) => value.participantId === participantB)
          ?.checkedInAt,
        "self check-in must replay the organizer-created canonical arrival",
      );
      await assert.rejects(
        repository.checkInAtomically({
          actorId: "actor:a",
          eventId,
          participantId: people[3]!.participantProfileId,
        }),
        /Only the event organizer/u,
      );
      const manualCounts = await scopedPool.query<{
        audit_count: string;
        checkin_count: string;
        outbox_count: string;
      }>(`
        select
          (select count(*) from event_ops_checkins
            where event_id = '${eventId}' and actor_id in ('actor:b', 'actor:c'))::text
            as checkin_count,
          (select count(*) from event_ops_audit_log
            where event_id = '${eventId}'
              and action = 'event_checkin_marked_by_organizer'
              and actor_id = 'actor:onsite-organizer')::text as audit_count,
          (select count(*) from event_ops_outbox
            where event_id = '${eventId}' and event_type = 'event.checkin.created'
              and aggregate_id in ('${eventId}:actor:b', '${eventId}:actor:c'))::text
            as outbox_count
      `);
      assert.deepEqual(manualCounts.rows[0], {
        audit_count: "2",
        checkin_count: "2",
        outbox_count: "2",
      });

      const concurrentRequests = await Promise.all(
        Array.from({ length: 100 }, () =>
          repository.createContactRequestAtomically({
            eventId,
            requesterActorId: "actor:a",
            targetParticipantId: participantB,
          }),
        ),
      );
      assert.equal(
        new Set(concurrentRequests.map((value) => value.requestId)).size,
        1,
      );
      assert.ok(concurrentRequests.every((value) => value.contactId === null));
      const contestedRequest = concurrentRequests[0]!;
      const requestCounts = await scopedPool.query<{
        audit_count: string;
        outbox_count: string;
        request_count: string;
      }>(`
        select
          (select count(*) from event_ops_contact_requests
            where event_id = '${eventId}'
              and request_id = '${contestedRequest.requestId}')::text
            as request_count,
          (select count(*) from event_ops_audit_log
            where aggregate_id = '${contestedRequest.requestId}'
              and action = 'event_contact_request_created')::text
            as audit_count,
          (select count(*) from event_ops_outbox
            where aggregate_id = '${contestedRequest.requestId}'
              and event_type = 'event.contact_request.created')::text
            as outbox_count
      `);
      assert.deepEqual(requestCounts.rows[0], {
        audit_count: "1",
        outbox_count: "1",
        request_count: "1",
      });

      const terminalResponses = await Promise.all([
        repository.respondToContactRequestAtomically({
          accept: true,
          eventId,
          requestId: contestedRequest.requestId,
          targetActorId: "actor:b",
        }),
        repository.respondToContactRequestAtomically({
          accept: false,
          eventId,
          requestId: contestedRequest.requestId,
          targetActorId: "actor:b",
        }),
      ]);
      assert.equal(
        new Set(terminalResponses.map((value) => value.status)).size,
        1,
        "accept and decline races must observe one committed terminal state",
      );
      const contestedStatus = terminalResponses[0]!.status;
      assert.ok(contestedStatus === "accepted" || contestedStatus === "declined");
      const terminalCounts = await scopedPool.query<{
        accepted_audits: string;
        declined_audits: string;
        pair_count: string;
      }>(`
        select
          (select count(*) from event_ops_relationship_pairs
            where request_id = '${contestedRequest.requestId}')::text as pair_count,
          (select count(*) from event_ops_audit_log
            where aggregate_id = '${contestedRequest.requestId}'
              and action = 'event_contact_request_accepted')::text
            as accepted_audits,
          (select count(*) from event_ops_audit_log
            where aggregate_id = '${contestedRequest.requestId}'
              and action = 'event_contact_request_declined')::text
            as declined_audits
      `);
      assert.equal(
        Number(terminalCounts.rows[0]!.accepted_audits) +
          Number(terminalCounts.rows[0]!.declined_audits),
        1,
      );
      assert.equal(
        terminalCounts.rows[0]!.pair_count,
        contestedStatus === "accepted" ? "1" : "0",
      );

      const acceptedRequest = await repository.createContactRequestAtomically({
        eventId,
        requesterActorId: "actor:a",
        targetParticipantId: people[2]!.participantProfileId,
      });
      const targetAccepted = await repository.respondToContactRequestAtomically({
        accept: true,
        eventId,
        requestId: acceptedRequest.requestId,
        targetActorId: "actor:c",
      });
      assert.equal(targetAccepted.status, "accepted");
      assert.ok(targetAccepted.contactId);
      const requesterAccepted = (
        await repository.listContactRequests(eventId, "actor:a")
      ).find((value) => value.requestId === acceptedRequest.requestId);
      const targetAcceptedFromList = (
        await repository.listContactRequests(eventId, "actor:c")
      ).find((value) => value.requestId === acceptedRequest.requestId);
      const adminAccepted = (
        await repository.listContactRequests(eventId, null)
      ).find((value) => value.requestId === acceptedRequest.requestId);
      assert.ok(requesterAccepted?.contactId);
      assert.equal(targetAcceptedFromList?.contactId, targetAccepted.contactId);
      assert.notEqual(requesterAccepted.contactId, targetAccepted.contactId);
      assert.equal(adminAccepted?.contactId, null);
      assert.equal(
        (await repository.listContactRequests(eventId, "actor:d")).length,
        0,
      );
      const safeKeys = [
        "acceptedAt",
        "contactId",
        "createdAt",
        "declinedAt",
        "eventId",
        "requestId",
        "requesterParticipantId",
        "status",
        "targetParticipantId",
        "updatedAt",
      ];
      assert.deepEqual(Object.keys(targetAccepted).sort(), safeKeys);
      for (const forbidden of [
        "requesterActorId",
        "targetActorId",
        "contactEvidenceIds",
        "evidenceIds",
      ]) {
        assert.equal(JSON.stringify(targetAccepted).includes(forbidden), false);
      }
      const acceptedArtifacts = await scopedPool.query<{
        audit_count: string;
        evidence_count: string;
        pair_count: string;
        projection_outbox_count: string;
        side_count: string;
      }>(`
        select
          (select count(*) from event_ops_relationship_pairs
            where request_id = '${acceptedRequest.requestId}')::text as pair_count,
          (select count(*) from event_ops_relationship_sides side
            join event_ops_relationship_pairs pair
              on pair.relationship_pair_id = side.relationship_pair_id
            where pair.request_id = '${acceptedRequest.requestId}')::text
            as side_count,
          (select count(*) from event_ops_relationship_evidence evidence
            join event_ops_relationship_pairs pair
              on pair.relationship_pair_id = evidence.relationship_pair_id
            where pair.request_id = '${acceptedRequest.requestId}')::text
            as evidence_count,
          (select count(*) from event_ops_outbox
            where event_type = 'event.relationship_side.project'
              and payload ->> 'requestId' = '${acceptedRequest.requestId}')::text
            as projection_outbox_count,
          (select count(*) from event_ops_audit_log
            where aggregate_id = '${acceptedRequest.requestId}'
              and action = 'event_contact_request_accepted')::text
            as audit_count
      `);
      assert.deepEqual(acceptedArtifacts.rows[0], {
        audit_count: "1",
        evidence_count: "2",
        pair_count: "1",
        projection_outbox_count: "2",
        side_count: "2",
      });

      const rollbackRequest = await repository.createContactRequestAtomically({
        eventId,
        requesterActorId: "actor:c",
        targetParticipantId: people[3]!.participantProfileId,
      });
      await scopedPool.query(`
        create function reject_actor_d_relationship_evidence() returns trigger
        language plpgsql as $$
        begin
          if new.owner_actor_id = 'actor:d' then
            raise exception 'deliberate relationship evidence failure';
          end if;
          return new;
        end
        $$;
        create trigger reject_actor_d_relationship_evidence_trigger
          before insert on event_ops_relationship_evidence
          for each row execute function reject_actor_d_relationship_evidence();
      `);
      await assert.rejects(
        repository.respondToContactRequestAtomically({
          accept: true,
          eventId,
          requestId: rollbackRequest.requestId,
          targetActorId: "actor:d",
        }),
        /deliberate relationship evidence failure/i,
      );
      const rollbackState = await scopedPool.query<{
        accepted_audit_count: string;
        accepted_outbox_count: string;
        evidence_count: string;
        pair_count: string;
        projection_outbox_count: string;
        relationship_pair_id: string | null;
        side_count: string;
        status: string;
      }>(`
        select
          request.status,
          request.relationship_pair_id,
          (select count(*) from event_ops_relationship_pairs pair
            where pair.request_id = request.request_id)::text as pair_count,
          (select count(*) from event_ops_relationship_sides side
            join event_ops_relationship_pairs pair
              on pair.relationship_pair_id = side.relationship_pair_id
            where pair.request_id = request.request_id)::text as side_count,
          (select count(*) from event_ops_relationship_evidence evidence
            join event_ops_relationship_pairs pair
              on pair.relationship_pair_id = evidence.relationship_pair_id
            where pair.request_id = request.request_id)::text as evidence_count,
          (select count(*) from event_ops_outbox
            where event_type = 'event.relationship_side.project'
              and payload ->> 'requestId' = request.request_id)::text
            as projection_outbox_count,
          (select count(*) from event_ops_outbox
            where event_type = 'event.contact_request.accepted'
              and aggregate_id = request.request_id)::text
            as accepted_outbox_count,
          (select count(*) from event_ops_audit_log
            where action = 'event_contact_request_accepted'
              and aggregate_id = request.request_id)::text
            as accepted_audit_count
        from event_ops_contact_requests request
        where request.request_id = '${rollbackRequest.requestId}'
      `);
      assert.deepEqual(rollbackState.rows[0], {
        accepted_audit_count: "0",
        accepted_outbox_count: "0",
        evidence_count: "0",
        pair_count: "0",
        projection_outbox_count: "0",
        relationship_pair_id: null,
        side_count: "0",
        status: "awaiting_target_consent",
      });

      await repository.cancelCanonicalRegistration({
        eventId,
        userId: "actor:a",
      });
      await assert.rejects(
        repository.checkInAtomically({ actorId: "actor:a", eventId }),
        /active canonical registration is required/i,
        "even an idempotent replay must remain scoped to an active membership",
      );

      const futureEventId = "event-onsite-future-window";
      await repository.saveConfiguration({
        ...configuration(futureEventId, base),
        checkInOpensAt: at(base, 60),
      });
      await repository.activateCanonicalRegistrations(futureEventId, [
        registration(futureEventId, "actor:future", at(base, -60)),
      ]);
      await assert.rejects(
        repository.checkInAtomically({
          actorId: "actor:future",
          eventId: futureEventId,
        }),
        /outside its configured time window/i,
      );
      assert.equal(
        (
          await scopedPool.query<{ count: string }>(`
            select count(*)::text as count from event_ops_checkins
            where event_id = '${futureEventId}'
          `)
        ).rows[0]?.count,
        "0",
      );
    } finally {
      await client.close();
      await adminPool.query(`drop schema if exists ${schema} cascade`);
      await adminPool.end();
    }
  },
);
